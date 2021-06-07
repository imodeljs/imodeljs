/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import * as Yargs from "yargs";
import { assert, Guid, GuidString, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ContextRegistryClient } from "@bentley/context-registry-client";
import { Version } from "@bentley/imodelhub-client";
import {
  BackendLoggerCategory, BackendRequestContext, ChangesetProps, IModelDb, IModelHost, IModelJsFs, SnapshotDb,
} from "@bentley/imodeljs-backend";
import { BriefcaseIdValue, IModelVersion } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ElementUtils } from "./ElementUtils";
import { IModelHubUtils } from "./IModelHubUtils";
import { Transformer, TransformerOptions } from "./Transformer";

const loggerCategory = "imodel-transformer";

interface CommandLineArgs {
  hub?: string;
  sourceFile?: string;
  sourceContextId?: GuidString;
  sourceIModelId?: GuidString;
  sourceIModelName?: string;
  sourceStartChangeSetId?: string;
  sourceEndChangeSetId?: string;
  targetFile: string;
  targetContextId?: GuidString;
  targetIModelId?: GuidString;
  targetIModelName?: string;
  clean?: boolean;
  logChangeSets: boolean;
  logNamedVersions: boolean;
  logProvenanceScopes: boolean;
  logTransformer: boolean;
  validation: boolean;
  simplifyElementGeometry?: boolean;
  combinePhysicalModels?: boolean;
  exportViewDefinition?: Id64String;
  deleteUnusedGeometryParts?: boolean;
  noProvenance?: boolean;
  includeSourceProvenance?: boolean;
  excludeSubCategories?: string;
  excludeCategories?: string;
}

void (async () => {
  try {
    Yargs.usage("Transform the specified source iModel into a new target iModel");

    // iModelHub environment options
    Yargs.option("hub", { desc: "The iModelHub environment: prod | qa | dev", type: "string", default: "prod" });

    // used if the source iModel is a snapshot
    Yargs.option("sourceFile", { desc: "The full path to the source iModel", type: "string" });

    // used if the source iModel is on iModelHub
    Yargs.option("sourceContextId", { desc: "The iModelHub context containing the source iModel", type: "string" });
    Yargs.option("sourceIModelId", { desc: "The guid of the source iModel", type: "string", default: undefined });
    Yargs.option("sourceIModelName", { desc: "The name of the source iModel", type: "string", default: undefined });
    Yargs.option("sourceStartChangeSetId", { desc: "The starting changeSet of the source iModel to transform", type: "string", default: undefined });
    Yargs.option("sourceEndChangeSetId", { desc: "The ending changeSet of the source iModel to transform", type: "string", default: undefined });

    // used if the target iModel is a snapshot
    Yargs.option("targetFile", { desc: "The full path to the target iModel", type: "string" });

    // used if the target iModel is on iModelHub
    Yargs.option("targetContextId", { desc: "The iModelHub context containing the target iModel", type: "string" });
    Yargs.option("targetIModelId", { desc: "The guid of the target iModel", type: "string", default: undefined });
    Yargs.option("targetIModelName", { desc: "The name of the target iModel", type: "string", default: undefined });

    // target iModel management options
    Yargs.option("clean", { desc: "If true, refetch briefcases and clean/delete the target before beginning", type: "boolean", default: undefined });

    // print/debug options
    Yargs.option("logChangeSets", { desc: "If true, log the list of changeSets", type: "boolean", default: false });
    Yargs.option("logNamedVersions", { desc: "If true, log the list of named versions", type: "boolean", default: false });
    Yargs.option("logProvenanceScopes", { desc: "If true, log the provenance scopes in the source and target iModels", type: "boolean", default: false });
    Yargs.option("logTransformer", { desc: "If true, turn on verbose logging for iModel transformation", type: "boolean", default: false });
    Yargs.option("validation", { desc: "If true, perform extra and potentially expensive validation to assist with finding issues and confirming results", type: "boolean", default: false });

    // transformation options
    Yargs.option("simplifyElementGeometry", { desc: "Simplify element geometry upon import into target iModel", type: "boolean", default: false });
    Yargs.option("combinePhysicalModels", { desc: "Combine all source PhysicalModels into a single PhysicalModel in the target iModel", type: "boolean", default: false });
    Yargs.option("exportViewDefinition", { desc: "Only export elements that would be visible using the specified ViewDefinition Id", type: "string", default: undefined });
    Yargs.option("deleteUnusedGeometryParts", { desc: "Delete unused GeometryParts from the target iModel", type: "boolean", default: false });
    Yargs.option("excludeSubCategories", { desc: "Exclude geometry in the specified SubCategories (names with comma separators) from the target iModel", type: "string" });
    Yargs.option("excludeCategories", { desc: "Exclude a categories (names with comma separators) and their elements from the target iModel", type: "string" });
    Yargs.option("noProvenance", { desc: "If true, IModelTransformer should not record its provenance.", type: "boolean", default: false });
    Yargs.option("includeSourceProvenance", { desc: "Include existing provenance from the source iModel in the target iModel", type: "boolean", default: false });

    const args = Yargs.parse() as Yargs.Arguments<CommandLineArgs>;

    IModelHubUtils.setHubEnvironment(args.hub);
    await IModelHost.startup();
    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Error);
    Logger.setLevel(loggerCategory, LogLevel.Info);

    if (args.logTransformer) { // optionally enable verbose transformation logging
      Logger.setLevel(BackendLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelTransformer, LogLevel.Trace);
    }

    let requestContext: AuthorizedClientRequestContext | BackendRequestContext;
    let contextRegistry: ContextRegistryClient | undefined;
    let sourceDb: IModelDb;
    let targetDb: IModelDb;
    let processChanges = false;

    if (args.sourceContextId || args.targetContextId) {
      requestContext = await IModelHubUtils.getAuthorizedClientRequestContext();
      contextRegistry = new ContextRegistryClient();
    } else {
      requestContext = new BackendRequestContext();
    }

    if (args.sourceContextId) {
      // source is from iModelHub
      assert(requestContext instanceof AuthorizedClientRequestContext);
      assert(undefined !== contextRegistry);
      assert(undefined !== args.sourceIModelId);
      const sourceContextId = Guid.normalize(args.sourceContextId);
      const sourceIModelId = Guid.normalize(args.sourceIModelId);
      const sourceEndVersion = args.sourceEndChangeSetId ? IModelVersion.asOfChangeSet(args.sourceEndChangeSetId) : IModelVersion.latest();
      const sourceContext = await contextRegistry.getProject(requestContext, {
        $filter: `$id+eq+'${sourceContextId}'`,
      });
      assert(undefined !== sourceContext);
      Logger.logInfo(loggerCategory, `sourceContextId=${sourceContextId}, name=${sourceContext.name}`);
      Logger.logInfo(loggerCategory, `sourceIModelId=${sourceIModelId}`);
      if (args.sourceStartChangeSetId) {
        processChanges = true;
        Logger.logInfo(loggerCategory, `sourceStartChangeSetId=${args.sourceStartChangeSetId}`);
      }
      if (args.sourceEndChangeSetId) {
        Logger.logInfo(loggerCategory, `sourceEndChangeSetId=${args.sourceEndChangeSetId}`);
      }

      if (args.logChangeSets) {
        await IModelHubUtils.forEachChangeSet(requestContext, sourceIModelId, (changeSet: ChangesetProps) => {
          Logger.logInfo(loggerCategory, `sourceChangeSet: id="${changeSet.id}", description="${changeSet.description}"}`);
        });
      }

      if (args.logNamedVersions) {
        await IModelHubUtils.forEachNamedVersion(requestContext, sourceIModelId, (namedVersion: Version) => {
          Logger.logInfo(loggerCategory, `sourceNamedVersion: id="${namedVersion.id}", changeSetId="${namedVersion.changeSetId}", name="${namedVersion.name}"`);
        });
      }

      sourceDb = await IModelHubUtils.downloadAndOpenBriefcase(requestContext, {
        contextId: sourceContextId,
        iModelId: sourceIModelId,
        asOf: sourceEndVersion.toJSON(),
        briefcaseId: BriefcaseIdValue.Unassigned, // A "pull only" briefcase can be used since the sourceDb is opened read-only
      });
    } else {
      // source is a local snapshot file
      assert(undefined !== args.sourceFile);
      const sourceFile = path.normalize(args.sourceFile);
      Logger.logInfo(loggerCategory, `sourceFile=${sourceFile}`);
      sourceDb = SnapshotDb.openFile(sourceFile);
    }

    if (args.validation) {
      // validate that there are no issues with the sourceDb to ensure that IModelTransformer is starting from a consistent state
      ElementUtils.validateCategorySelectors(sourceDb);
      ElementUtils.validateModelSelectors(sourceDb);
      ElementUtils.validateDisplayStyles(sourceDb);
    }

    if (args.targetContextId) {
      // target is from iModelHub
      assert(requestContext instanceof AuthorizedClientRequestContext);
      assert(undefined !== args.targetIModelId || undefined !== args.targetIModelName, "must be able to identify the iModel by either name or id");
      const targetContextId = Guid.normalize(args.targetContextId);
      let targetIModelId = args.targetIModelId ? Guid.normalize(args.targetIModelId) : undefined;
      if (undefined !== args.targetIModelName) {
        assert(undefined === targetIModelId, "should not specify targetIModelId if targetIModelName is specified");
        targetIModelId = await IModelHubUtils.queryIModelId(requestContext, targetContextId, args.targetIModelName);
        if ((args.clean) && (undefined !== targetIModelId)) {
          await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: targetContextId, iModelId: targetIModelId });
          targetIModelId = undefined;
        }
        if (undefined === targetIModelId) {
          // create target iModel if it doesn't yet exist or was just cleaned/deleted above
          targetIModelId = await IModelHost.hubAccess.createIModel({ requestContext, contextId: targetContextId, iModelName: args.targetIModelName });
        }
      }
      assert(undefined !== targetIModelId);
      Logger.logInfo(loggerCategory, `targetContextId=${targetContextId}`);
      Logger.logInfo(loggerCategory, `targetIModelId=${targetIModelId}`);

      if (args.logChangeSets) {
        await IModelHubUtils.forEachChangeSet(requestContext, targetIModelId, (changeSet: ChangesetProps) => {
          Logger.logInfo(loggerCategory, `targetChangeSet: id="${changeSet.id}", description="${changeSet.description}"`);
        });
      }

      if (args.logNamedVersions) {
        await IModelHubUtils.forEachNamedVersion(requestContext, targetIModelId, (namedVersion: Version) => {
          Logger.logInfo(loggerCategory, `targetNamedVersion: id="${namedVersion.id}", changeSetId="${namedVersion.changeSetId}", name="${namedVersion.name}"`);
        });
      }

      targetDb = await IModelHubUtils.downloadAndOpenBriefcase(requestContext, {
        contextId: targetContextId,
        iModelId: targetIModelId,
      });
    } else {
      assert(undefined !== args.targetFile);
      // target is a local snapshot file
      const targetFile = args.targetFile ? path.normalize(args.targetFile) : "";
      // clean target output file before continuing (regardless of args.clean value)
      if (IModelJsFs.existsSync(targetFile)) {
        IModelJsFs.removeSync(targetFile);
      }
      targetDb = SnapshotDb.createEmpty(targetFile, {
        rootSubject: { name: `${sourceDb.rootSubject.name}-Transformed` },
        ecefLocation: sourceDb.ecefLocation,
      });
    }

    if (args.logProvenanceScopes) {
      const sourceScopeIds = ElementUtils.queryProvenanceScopeIds(sourceDb);
      if (sourceScopeIds.size === 0) {
        Logger.logInfo(loggerCategory, "Source Provenance Scope: Not Found");
      } else {
        sourceScopeIds.forEach((scopeId) => Logger.logInfo(loggerCategory, `Source Provenance Scope: ${scopeId} ${sourceDb.elements.getElement(scopeId).getDisplayLabel()}`));
      }
      const targetScopeIds = ElementUtils.queryProvenanceScopeIds(targetDb);
      if (targetScopeIds.size === 0) {
        Logger.logInfo(loggerCategory, "Target Provenance Scope: Not Found");
      } else {
        targetScopeIds.forEach((scopeId) => Logger.logInfo(loggerCategory, `Target Provenance Scope: ${scopeId} ${targetDb.elements.getElement(scopeId).getDisplayLabel()}`));
      }
    }

    const transformerOptions: TransformerOptions = {
      ...args,
      excludeSubCategories: args.excludeSubCategories?.split(","),
      excludeCategories: args.excludeCategories?.split(","),
    };

    if (processChanges) {
      assert(requestContext instanceof AuthorizedClientRequestContext);
      assert(undefined !== args.sourceStartChangeSetId);
      await Transformer.transformChanges(requestContext, sourceDb, targetDb, args.sourceStartChangeSetId, transformerOptions);
    } else {
      await Transformer.transformAll(requestContext, sourceDb, targetDb, transformerOptions);
    }

    if (args.exportViewDefinition) {
      ElementUtils.insertViewDefinition(targetDb, "Default", true);
    }

    if (args.validation) {
      // validate that there are no issues with the targetDb after transformation
      ElementUtils.validateCategorySelectors(targetDb);
      ElementUtils.validateModelSelectors(targetDb);
      ElementUtils.validateDisplayStyles(targetDb);
    }

    sourceDb.close();
    targetDb.close();
    await IModelHost.shutdown();
  } catch (error) {
    process.stdout.write(`${error.message}\n${error.stack}`);
  }
})();
