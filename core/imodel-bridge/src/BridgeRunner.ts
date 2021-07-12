/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assert, BentleyStatus, Guid, GuidString, Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
/** @packageDocumentation
 * @module Framework
 */
import { ChangesType } from "@bentley/imodelhub-client";
import {
  BackendRequestContext, BriefcaseDb, BriefcaseManager, ComputeProjectExtentsOptions, ConcurrencyControl, IModelDb, IModelJsFs, IModelJsNative,
  LockScope, SnapshotDb, Subject, SubjectOwnsSubjects, UsageLoggingUtilities,
} from "@bentley/imodeljs-backend";
import { IModel, IModelError, LocalBriefcaseProps, OpenBriefcaseProps, SubjectProps } from "@bentley/imodeljs-common";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { BridgeLoggerCategory } from "./BridgeLoggerCategory";
import { IModelBankArgs, IModelBankUtils } from "./IModelBankUtils";
import { IModelBridge } from "./IModelBridge";
import { ServerArgs } from "./IModelHubUtils";
import { Synchronizer } from "./Synchronizer";

/** @beta */
export const loggerCategory: string = BridgeLoggerCategory.Framework;

/** Arguments that define how a bridge job should be run
 * @beta
 */
export class BridgeJobDefArgs {
  /** Comment to be used as the initial string for all changesets.  Can be null. */
  public revisionComments?: string;
  /** Should be run after all documents have been synchronized.  Runs any actions (like project extent calculations) that need to run on the completed imodel */
  public allDocsProcessed: boolean = false;
  /** Indicates whether the BridgeRunner should update the profile of the imodel's db. This would only need to be set to false if the imodel needs to be opened by legacy products */
  public updateDbProfile: boolean = true;
  /** Indicates whether the BridgeRunner should update any of the core domain schemas in the imodel */
  public updateDomainSchemas: boolean = true;
  /** The module containing the IModel Bridge implementation */
  public bridgeModule?: string;
  /** Path to the source file */
  public sourcePath?: string;
  /** Path to the output directory - Only necessary when creating a snapshot */
  public outputDir?: string;
  public documentGuid?: string;
  /** The urn to fetch the input file. This and associated workspace will be downloaded */
  public dmsServerUrl?: string;
  /** OIDC or SAML access token used to login to DMS system. If omitted or empty, user credentials are used for login. */
  public dmsAccessToken?: string;
  /** Additional arguments in JSON format. */
  public argsJson: any;
  /** Synchronizes a snapshot imodel, outside of iModelHub */
  public isSnapshot: boolean = false;
  /** The synchronizer will automatically delete any element that wasn't visited. Some bridges do not visit each element on every run. Set this to false to disable automatic deletion */
  public doDetectDeletedElements: boolean = true;
}

class StaticTokenStore {
  public static tokenString: string;
}

/** The driver for synchronizing content to an iModel.
 * @beta
 */
export class BridgeRunner {
  private _bridge?: IModelBridge;
  // private _ldClient: iModelBridgeLDClient;

  private _bridgeArgs: BridgeJobDefArgs;
  private _serverArgs?: ServerArgs | IModelBankArgs;

  public getCacheDirectory() {
    if (this._bridgeArgs.isSnapshot) {
      return this._bridgeArgs.outputDir;
    } else {
      return BriefcaseManager.cacheDir;
    }
  }

  private static parseArguments(args: string[], bridgeJobDef: BridgeJobDefArgs, serverArgs: ServerArgs, bankArgs: IModelBankArgs) {
    for (const line of args) {
      if (!line)
        continue;
      const keyVal = line.split("=");
      if (keyVal[0].startsWith("@")) {
        const argFile = keyVal[0].substr(1);
        if (!fs.existsSync(argFile))
          throw new Error("Error file {argFile} does not exist.");
        BridgeRunner.parseArgumentFile(argFile, bridgeJobDef, serverArgs, bankArgs);
        continue;
      }
      const argName = keyVal[0].trim();
      switch (argName) {
        case "--fwk-input": bridgeJobDef.sourcePath = keyVal[1].trim(); break;
        case "--fwk-output": bridgeJobDef.outputDir = keyVal[1].trim(); break;
        case "--fwk-bridge-library": bridgeJobDef.bridgeModule = keyVal[1].trim(); break;
        case "--fwk-create-repository-if-necessary": serverArgs.createiModel = true; break;
        case "--server-repository": serverArgs.iModelName = keyVal[1].trim(); break;
        case "--server-project": serverArgs.contextName = keyVal[1].trim(); break;
        case "--server-project-guid": serverArgs.contextId = keyVal[1].trim(); break;
        case "--server-environment": serverArgs.environment = keyVal[1].trim(); break;
        case "--snapshot": bridgeJobDef.isSnapshot = true; break;
        case "--server-accessToken": {
          StaticTokenStore.tokenString = fs.readFileSync(keyVal[1]).toString();
          serverArgs.getToken = async (): Promise<AccessToken> => AccessToken.fromTokenString(StaticTokenStore.tokenString);
          break;
        }

        case "--imodel-bank-url": bankArgs.url = keyVal[1].trim(); break;
        // TODO: more iModelBank-specific args

        case "--dms-inputFileUrn=": bridgeJobDef.dmsServerUrl = keyVal[1].trim(); break;
        case "--dms-accessToken=": bridgeJobDef.dmsAccessToken = keyVal[1].trim(); break;
        case "--dms-documentGuid=": bridgeJobDef.documentGuid = keyVal[1].trim(); break;
        default:
          /** Unsupported options
           * --fwk-skip-assignment-check
           * --server-user=abeesh.basheer@bentley.com
           * --server-password=ReplaceMe
           */
          Logger.logError(loggerCategory, `${line} is not supported`);
      }
    }

    // TODO: check that we have serverArgs or bankArgs, or neither, but not both
  }

  private static parseArgumentFile(argFile: string, bridgeJobDef: BridgeJobDefArgs, serverArgs: ServerArgs, bankArgs: IModelBankArgs) {
    const fileContent = fs.readFileSync(argFile).toString().split("\n");
    this.parseArguments(fileContent, bridgeJobDef, serverArgs, bankArgs);
  }

  /** Create a new instance of BridgeRunner from command line arguments */
  public static fromArgs(args: string[]): BridgeRunner {
    const bridgeJobDef = new BridgeJobDefArgs();
    const serverArgs = new ServerArgs();
    const bankArgs = new IModelBankArgs();
    BridgeRunner.parseArguments(args, bridgeJobDef, serverArgs, bankArgs);
    const sargs = IModelBankUtils.isValidArgs(bankArgs) ? bankArgs : serverArgs;
    return new BridgeRunner(bridgeJobDef, sargs);
  }

  /** Create a new instance with the given arguments. */
  public constructor(jobDefArgs: BridgeJobDefArgs, serverArgs?: ServerArgs | IModelBankArgs) {
    // this._ldClient = iModelBridgeLDClient.getInstance(env);
    this._bridgeArgs = jobDefArgs;
    this._serverArgs = serverArgs;
    if (this._bridgeArgs.isSnapshot && undefined === this._bridgeArgs.outputDir) {
      throw new Error("Output directory must be defined for snapshot.");
    }
  }

  /** Main driver. */
  public async synchronize(): Promise<BentleyStatus> {
    // If we can't load the bridge, no point in trying anything else;
    if (this._bridgeArgs.bridgeModule === undefined) {
      throw new IModelError(IModelStatus.BadArg, "Bridge module undefined", Logger.logError, loggerCategory);
    }

    if (this._bridgeArgs.sourcePath === undefined) {
      throw new Error("Source path is not defined");
    }

    await this.loadBridge(this._bridgeArgs.bridgeModule);
    if (this._bridge === undefined) {
      throw new IModelError(IModelStatus.BadArg, "Failed to load bridge", Logger.logError, loggerCategory);
    }
    await this._bridge.initialize(this._bridgeArgs);

    let iModelDbBuilder: IModelDbBuilder;
    if (this._bridgeArgs.isSnapshot) {
      iModelDbBuilder = new SnapshotDbBuilder(this._bridge, this._bridgeArgs);
    } else {
      assert(this._serverArgs !== undefined);
      iModelDbBuilder = new BriefcaseDbBuilder(this._bridge, this._bridgeArgs, this._serverArgs);
    }

    await iModelDbBuilder.initialize();

    this.initProgressMeter();

    await iModelDbBuilder.acquire();
    if (undefined === iModelDbBuilder.imodel || !iModelDbBuilder.imodel.isOpen) {
      throw new IModelError(IModelStatus.BadModel, "Failed to open imodel", Logger.logError, loggerCategory);
    }

    try {
      await this._bridge.openSourceData(this._bridgeArgs.sourcePath);
      await this._bridge.onOpenIModel();
      await iModelDbBuilder.updateExistingIModel();
    } finally {
      if (iModelDbBuilder.imodel.isBriefcaseDb() || iModelDbBuilder.imodel.isSnapshotDb()) {
        iModelDbBuilder.imodel.close();
      }
    }

    return BentleyStatus.SUCCESS;
  }

  private async loadBridge(bridgeModulePath: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bridgeModule = require(bridgeModulePath); // throws if not found
    this._bridge = bridgeModule.getBridgeInstance();
    return null !== this._bridge;
  }

  private initProgressMeter() {
  }
}

abstract class IModelDbBuilder {
  protected _imodel?: BriefcaseDb | SnapshotDb;
  protected _jobSubjectName: string;
  protected _jobSubject?: Subject;

  constructor(protected readonly _bridge: IModelBridge, protected readonly _bridgeArgs: BridgeJobDefArgs) {
    // this._jobSubjectName = this._bridge.getBridgeName() + ":" + this._bridgeArgs.sourcePath!;
    this._jobSubjectName = this._bridge.getJobSubjectName(this._bridgeArgs.sourcePath!);
  }

  public abstract initialize(): Promise<void>;
  public abstract acquire(): Promise<void>;

  protected abstract _updateExistingData(): Promise<void>;
  protected abstract _finalizeChanges(): Promise<void>;
  protected abstract _initDomainSchema(): Promise<void>;
  protected abstract _importDefinitions(): Promise<void>;

  protected getRevisionComment(pushComments: string): string {
    let comment = "";
    if (this._bridgeArgs.revisionComments !== undefined)
      comment = this._bridgeArgs.revisionComments.substring(0, 400);
    if (comment.length > 0)
      comment = `${comment} - `;
    return comment + pushComments;
  }

  protected findJob(): Subject | undefined {
    assert(this._imodel !== undefined);
    const jobCode = Subject.createCode(this._imodel, IModel.rootSubjectId, this._jobSubjectName);
    const subjectId = this._imodel.elements.queryElementIdByCode(jobCode);
    if (undefined === subjectId) {
      return undefined;
    }
    return this._imodel.elements.tryGetElement<Subject>(subjectId);
  }

  protected insertJobSubject(): Subject {
    assert(this._imodel !== undefined);
    const bridgeProps: any = {};
    bridgeProps.BridgeVersion = this._bridge.getApplicationVersion();
    /// bridgeProps.BridgeType = ???;

    const jobProps: any = {};
    jobProps.Properties = bridgeProps;
    jobProps.Bridge = this._bridge.getBridgeName();
    // jobProps.Comments = ???;

    const subjProps: any = {};
    subjProps.Subject = {};
    subjProps.Subject.Job = jobProps;

    const root = this._imodel.elements.getRootSubject();
    const jobCode = Subject.createCode(this._imodel, root.id, this._jobSubjectName);

    const subjectProps: SubjectProps = {
      classFullName: Subject.classFullName,
      model: root.model,
      code: jobCode,
      jsonProperties: subjProps,
      parent: new SubjectOwnsSubjects(root.id),
    };
    const id = this._imodel.elements.insertElement(subjectProps);
    const subject = this._imodel.elements.getElement<Subject>(id);

    return subject;
  }

  protected _onChangeChannel(_newParentId: Id64String): void {
    assert(this._imodel !== undefined);
  }

  protected abstract _enterChannel(channelRootId: Id64String, lockRoot?: boolean): Promise<void>;

  protected detectDeletedElements() {
    if (this._bridgeArgs.doDetectDeletedElements) {
      this._bridge.synchronizer.detectDeletedElements();
    }
  }

  protected updateProjectExtents() {
    const options: ComputeProjectExtentsOptions = {
      reportExtentsWithOutliers: false,
      reportOutliers: false,
    };
    const results = this.imodel.computeProjectExtents(options);
    this.imodel.updateProjectExtents(results.extents);
    // TODO: Report outliers and then change the options to true
  }

  public async enterRepositoryChannel(lockRoot: boolean = true) { return this._enterChannel(IModelDb.repositoryModelId, lockRoot); }
  public async enterBridgeChannel(lockRoot: boolean = true) {
    assert(this._jobSubject !== undefined);
    return this._enterChannel(this._jobSubject.id, lockRoot);
  }

  public async updateExistingIModel() {
    await this._initDomainSchema();
    await this._importDefinitions();
    await this._updateExistingData();
    await this._finalizeChanges();
  }

  public get imodel() {
    assert(this._imodel !== undefined);
    return this._imodel;
  }
}

class BriefcaseDbBuilder extends IModelDbBuilder {
  private _requestContext?: AuthorizedClientRequestContext;
  private _activityId: GuidString;
  private _serverArgs: ServerArgs | IModelBankArgs;

  constructor(bridge: IModelBridge, bridgeArgs: BridgeJobDefArgs, serverArgs: ServerArgs | IModelBankArgs) {
    super(bridge, bridgeArgs);
    this._serverArgs = serverArgs;
    this._activityId = Guid.createValue();
  }

  protected async _saveAndPushChanges(comment: string, changesType: ChangesType): Promise<void> {
    assert(this._requestContext !== undefined);
    assert(this._imodel instanceof BriefcaseDb);

    // TODO Each step below needs a retry loop

    await this._imodel.concurrencyControl.request(this._requestContext);
    await this._imodel.pullAndMergeChanges(this._requestContext);
    this._imodel.saveChanges();
    await this._pushChanges(comment, changesType);
  }

  protected override _onChangeChannel(newParentId: Id64String) {
    super._onChangeChannel(newParentId);
    assert(this._imodel instanceof BriefcaseDb);
    assert(!this._imodel.concurrencyControl.hasPendingRequests);
    assert(this._imodel.concurrencyControl.isBulkMode);
    assert(!this._imodel.concurrencyControl.locks.hasSchemaLock, "bridgeRunner must release all locks before switching channels");
    assert(!this._imodel.concurrencyControl.locks.hasCodeSpecsLock, "bridgeRunner must release all locks before switching channels");
    const currentRoot = this._imodel.concurrencyControl.channel.channelRoot;
    if (currentRoot !== undefined)
      assert(!this._imodel.concurrencyControl.locks.holdsLock(ConcurrencyControl.Request.getElementLock(currentRoot, LockScope.Exclusive)), "bridgeRunner must release channel locks before switching channels");
  }

  protected async _enterChannel(channelRootId: Id64String, lockRoot: boolean = true) {
    assert(this._requestContext !== undefined);
    assert(this._imodel instanceof BriefcaseDb);
    this._onChangeChannel(channelRootId);
    this._imodel.concurrencyControl.channel.channelRoot = channelRootId;
    if (!lockRoot)
      return;
    assert(this._requestContext !== undefined);
    return this._imodel.concurrencyControl.channel.lockChannelRoot(this._requestContext);
  }

  protected async _importDefinitions() {
    assert(this._requestContext !== undefined);
    assert(this._imodel instanceof BriefcaseDb);
    const briefcaseDb = this._imodel;
    assert(briefcaseDb.concurrencyControl.isBulkMode);

    await this.enterRepositoryChannel(); // (also acquires schema lock)

    this._jobSubject = this.findJob();
    if (undefined !== this._jobSubject) {
      this._bridge.jobSubject = this._jobSubject;
    } else {
      this._jobSubject = this.insertJobSubject();    // this is the first time that this bridge has tried to convert this input file into this iModel

      await this._saveAndPushChanges("Inserted Bridge Job Subject", ChangesType.GlobalProperties);

      await this.enterBridgeChannel(); // (also locks the Job Subject)

      this._bridge.jobSubject = this._jobSubject;
      await this._bridge.initializeJob();

      await this._saveAndPushChanges("Initialized Bridge Job Subject", ChangesType.Regular);

      await this.enterRepositoryChannel();
    }

    assert(this._imodel.concurrencyControl.locks.hasSchemaLock);
    assert(briefcaseDb.concurrencyControl.isBulkMode);

    await this._bridge.importDefinitions();

    return this._saveAndPushChanges("Definition changes", ChangesType.Definition);
  }

  protected async _initDomainSchema() {
    assert(this._requestContext !== undefined);
    assert(this._imodel instanceof BriefcaseDb);
    assert(!this._imodel.concurrencyControl.locks.hasSchemaLock);
    assert(this._imodel.concurrencyControl.isBulkMode);

    await this._saveAndPushChanges("Initialization", ChangesType.Definition); // in case openSourceData or any other preliminary step wrote anything

    await this.enterRepositoryChannel();
    await this._bridge.importDomainSchema(this._requestContext);
    await this._saveAndPushChanges("Schema changes", ChangesType.Schema);

    await this.enterRepositoryChannel();
    await this._bridge.importDynamicSchema(this._requestContext);
    await this._imodel.concurrencyControl.request(this._requestContext);
    this._imodel.saveChanges();
    return this._saveAndPushChanges("Dynamic schema changes", ChangesType.Schema);
  }

  protected async _updateExistingData(): Promise<void> {
    assert(this._requestContext !== undefined);
    assert(this._imodel instanceof BriefcaseDb);
    assert(!this._imodel.concurrencyControl.locks.hasSchemaLock);
    assert(this._imodel.concurrencyControl.isBulkMode);

    await this.enterBridgeChannel();
    assert(this._imodel.concurrencyControl.channel.isChannelRootLocked);

    // WIP: need detectSpatialDataTransformChanged check?
    await this._bridge.updateExistingData();

    let dataChangesDescription = "Data changes";
    if (this._bridge.getDataChangesDescription)
      dataChangesDescription = this._bridge.getDataChangesDescription();

    return this._saveAndPushChanges(dataChangesDescription, ChangesType.Regular);
  }

  protected async _finalizeChanges(): Promise<void> {
    assert(this._requestContext !== undefined);
    assert(this._imodel instanceof BriefcaseDb);
    assert(!this._imodel.concurrencyControl.locks.hasSchemaLock);
    assert(this._imodel.concurrencyControl.isBulkMode);

    await this.enterBridgeChannel();
    assert(this._imodel.concurrencyControl.channel.isChannelRootLocked);

    this.detectDeletedElements();
    this.updateProjectExtents();

    let dataChangesDescription = "Finalizing changes";
    if (this._bridge.getDataChangesDescription)
      dataChangesDescription = this._bridge.getDataChangesDescription();

    return this._saveAndPushChanges(dataChangesDescription, ChangesType.Regular);
  }

  /** Pushes any pending transactions to the hub. */
  private async _pushChanges(pushComments: string, type: ChangesType) {
    assert(this._requestContext !== undefined);
    assert(this._imodel instanceof BriefcaseDb);
    assert(this._imodel.txns !== undefined);

    await this._imodel.pullAndMergeChanges(this._requestContext); // in case there are recent changes

    // NB We must call BriefcaseDb.pushChanges to let it clear the locks, even if there are no pending changes.
    //    Also, we must not bypass that and call the BriefcaseManager API directly.

    const comment = this.getRevisionComment(pushComments);
    return this._imodel.pushChanges(this._requestContext, comment, type);
  }

  public async initialize() {
    if (undefined === this._serverArgs.getToken) {
      throw new IModelError(IModelStatus.BadArg, "getToken() undefined", Logger.logError, loggerCategory);
    }

    const token = await this._serverArgs.getToken();
    this._requestContext = new AuthorizedClientRequestContext(token, this._activityId, this._bridge.getApplicationId(), this._bridge.getApplicationVersion());
    if (this._requestContext === undefined) {
      throw new IModelError(IModelStatus.BadRequest, "Failed to instantiate AuthorizedClientRequestContext", Logger.logError, loggerCategory);
    }
    assert(this._serverArgs.contextId !== undefined);
    UsageLoggingUtilities.postUserUsage(this._requestContext, this._serverArgs.contextId, IModelJsNative.AuthType.OIDC, os.hostname(), IModelJsNative.UsageType.Trial)
      .catch((err) => {
        Logger.logError(loggerCategory, `Could not log user usage for bridge`, () => ({ errorStatus: err.status, errorMessage: err.message }));
      });
  }

  /** This will download the briefcase, open it with the option to update the Db profile, close it, re-open with the option to upgrade core domain schemas */
  public async acquire(): Promise<void> {
    // ********
    // ********
    // ******** TODO: Where do we check if the briefcase is already on the local disk??
    // ********
    // ********

    // Can't actually get here with a null _requestContext, but this guard removes the need to instead use this._requestContext!
    if (this._requestContext === undefined)
      throw new Error("Must initialize AuthorizedClientRequestContext before using");
    if (this._serverArgs.contextId === undefined)
      throw new Error("Must initialize ContextId before using");
    if (this._serverArgs.iModelId === undefined)
      throw new Error("Must initialize IModelId before using");
    let props: LocalBriefcaseProps;
    if (this._bridgeArgs.argsJson && this._bridgeArgs.argsJson.briefcaseId) {
      props = await BriefcaseManager.downloadBriefcase(this._requestContext, { briefcaseId: this._bridgeArgs.argsJson.briefcaseId, contextId: this._serverArgs.contextId, iModelId: this._serverArgs.iModelId });
    } else {
      props = await BriefcaseManager.downloadBriefcase(this._requestContext, { contextId: this._serverArgs.contextId, iModelId: this._serverArgs.iModelId });
      if (this._bridgeArgs.argsJson) {
        this._bridgeArgs.argsJson.briefcaseId = props.briefcaseId; // don't overwrite other arguments if anything is passed in
      } else {
        this._bridgeArgs.argsJson = { briefcaseId: props.briefcaseId };
      }
    }
    let briefcaseDb: BriefcaseDb | undefined;
    const openArgs: OpenBriefcaseProps = {
      fileName: props.fileName,
    };
    if (this._bridgeArgs.updateDbProfile || this._bridgeArgs.updateDomainSchemas)
      await BriefcaseDb.upgradeSchemas(this._requestContext, props);
    if (briefcaseDb === undefined || !briefcaseDb.isOpen)
      briefcaseDb = await BriefcaseDb.open(this._requestContext, openArgs);

    this._imodel = briefcaseDb;
    const synchronizer = new Synchronizer(briefcaseDb, this._bridge.supportsMultipleFilesPerChannel(), this._requestContext);
    this._bridge.synchronizer = synchronizer;

    briefcaseDb.concurrencyControl.startBulkMode(); // We will run in bulk mode the whole time.
  }
}

class SnapshotDbBuilder extends IModelDbBuilder {
  public async initialize() {
  }

  public async acquire(): Promise<void> {
    const fileName = `${path.basename(this._bridgeArgs.sourcePath!, path.extname(this._bridgeArgs.sourcePath!))}.bim`;
    const filePath = path.join(this._bridgeArgs.outputDir!, fileName);
    if (IModelJsFs.existsSync(filePath)) {
      IModelJsFs.unlinkSync(filePath);
    }
    this._imodel = SnapshotDb.createEmpty(filePath, { rootSubject: { name: this._bridge.getBridgeName() } });
    if (undefined === this._imodel) {
      throw new IModelError(IModelStatus.BadModel, `Unable to create empty SnapshotDb at ${filePath}`, Logger.logError, loggerCategory);
    }

    const synchronizer = new Synchronizer(this._imodel, this._bridge.supportsMultipleFilesPerChannel());
    this._bridge.synchronizer = synchronizer;
  }

  protected async _enterChannel(channelRootId: Id64String, _lockRoot?: boolean): Promise<void> {
    return this._onChangeChannel(channelRootId);
  }

  protected async _importDefinitions() {
    assert(this._imodel !== undefined);
    this._jobSubject = this.findJob();
    if (undefined !== this._jobSubject) {
      this._bridge.jobSubject = this._jobSubject;
    } else {
      this._jobSubject = this.insertJobSubject();    // this is the first time that this bridge has tried to convert this input file into this iModel
      this._bridge.jobSubject = this._jobSubject;
      await this._bridge.initializeJob();
    }

    await this._bridge.importDefinitions();
    this._imodel.saveChanges();
  }

  protected async _initDomainSchema() {
    assert(this._imodel !== undefined);
    await this._bridge.importDomainSchema(new BackendRequestContext());
    await this._bridge.importDynamicSchema(new BackendRequestContext());
    this._imodel.saveChanges();
  }

  protected async _updateExistingData() {
    assert(this._imodel !== undefined);
    await this._bridge.updateExistingData();
    this._imodel.saveChanges();
  }

  protected async _finalizeChanges() {
    assert(this._imodel !== undefined);
    this.detectDeletedElements();
    this.updateProjectExtents();
    this._imodel.saveChanges();
  }
}
