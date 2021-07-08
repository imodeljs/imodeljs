/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { BeDuration, IModelStatus, Logger, OpenMode } from "@bentley/bentleyjs-core";
import {
  BriefcaseProps, IModelConnectionProps, IModelError, IModelRpcOpenProps, IModelRpcProps, RequestNewBriefcaseProps, RpcPendingResponse, SyncMode,
} from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { BriefcaseManager } from "../BriefcaseManager";
import { CheckpointManager, CheckpointProps, V1CheckpointManager } from "../CheckpointManager";
import { BriefcaseDb, IModelDb, SnapshotDb } from "../IModelDb";
import { IModelHost } from "../IModelHost";
import { IModelJsFs } from "../IModelJsFs";

const loggerCategory: string = BackendLoggerCategory.IModelDb;

/** @internal */
export interface DownloadAndOpenArgs {
  requestContext: AuthorizedClientRequestContext;
  tokenProps: IModelRpcOpenProps;
  syncMode: SyncMode;
  fileNameResolvers?: ((arg: BriefcaseProps) => string)[];
  timeout?: number;
  forceDownload?: boolean;
}
/**
 * Utility to open the iModel for Read/Write RPC interfaces
 * @internal
 */
export class RpcBriefcaseUtility {

  private static async downloadAndOpen(args: DownloadAndOpenArgs): Promise<BriefcaseDb> {
    const { requestContext, tokenProps } = args;
    const iModelId = tokenProps.iModelId!;
    let myBriefcaseIds: number[];
    if (args.syncMode === SyncMode.PullOnly) {
      myBriefcaseIds = [0]; // PullOnly means briefcaseId 0
    } else {
      // check with iModelHub and see if we already have acquired any briefcaseIds
      myBriefcaseIds = await IModelHost.hubAccess.getMyBriefcaseIds({ requestContext, iModelId });
    }

    const resolvers = args.fileNameResolvers ?? [(arg) => BriefcaseManager.getFileName(arg), (arg) => BriefcaseManager.getCompatibilityFileName(arg)]; // eslint-disable-line deprecation/deprecation
    // see if we can open any of the briefcaseIds we already acquired from iModelHub
    for (const resolver of resolvers) {
      for (const briefcaseId of myBriefcaseIds) {
        const fileName = resolver({ briefcaseId, iModelId });
        if (IModelJsFs.existsSync(fileName)) {
          const briefcaseDb = BriefcaseDb.findByFilename(fileName);
          if (briefcaseDb !== undefined)
            return briefcaseDb as BriefcaseDb;
          try {
            if (args.forceDownload)
              throw new Error(); // causes delete below
            const db = await BriefcaseDb.open(requestContext, { fileName });
            if (db.changeset.id !== tokenProps.changeSetId)
              await BriefcaseManager.processChangesets(requestContext, db, { id: tokenProps.changeSetId! });
            return db;
          } catch (error) {
            if (!(error instanceof IModelError && error.errorNumber === IModelStatus.AlreadyOpen))
              // somehow we have this briefcaseId and the file exists, but we can't open it. Delete it.
              await BriefcaseManager.deleteBriefcaseFiles(fileName, args.requestContext);
          }
        }
      }
    }

    // no local briefcase available. Download one and open it.
    const request: RequestNewBriefcaseProps = {
      contextId: tokenProps.contextId!,
      iModelId,
      briefcaseId: args.syncMode === SyncMode.PullOnly ? 0 : undefined, // if briefcaseId is undefined, we'll acquire a new one.
    };

    const props = await BriefcaseManager.downloadBriefcase(requestContext, request);
    return BriefcaseDb.open(requestContext, { fileName: props.fileName });
  }

  private static _briefcasePromise: Promise<BriefcaseDb> | undefined;
  private static async openBriefcase(args: DownloadAndOpenArgs): Promise<BriefcaseDb> {
    if (this._briefcasePromise)
      return this._briefcasePromise;

    try {
      this._briefcasePromise = this.downloadAndOpen(args); // save the fact that we're working on downloading so if we timeout, we'll reuse this request.
      return await this._briefcasePromise;
    } finally {
      this._briefcasePromise = undefined;  // the download and open is now done
    }
  }

  public static async findOrOpen(requestContext: AuthorizedClientRequestContext, iModel: IModelRpcProps, syncMode: SyncMode): Promise<IModelDb> {
    const iModelDb = IModelDb.tryFindByKey(iModel.key);
    if (undefined === iModelDb) {
      return this.open({ requestContext, tokenProps: iModel, syncMode, timeout: 1000 });
    }
    await iModelDb.reattachDaemon(requestContext);
    requestContext.enter();
    return iModelDb;
  }

  /**
   * Download and open a checkpoint or briefcase, ensuring the operation completes within a default timeout. If the time to open exceeds the timeout period,
   * a RpcPendingResponse exception is thrown
   */
  public static async open(args: DownloadAndOpenArgs): Promise<IModelDb> {
    const { requestContext, tokenProps, syncMode } = args;
    requestContext.enter();
    Logger.logTrace(loggerCategory, "RpcBriefcaseUtility.open", () => ({ ...tokenProps }));

    const timeout = args.timeout ?? 1000;
    if (syncMode === SyncMode.PullOnly || syncMode === SyncMode.PullAndPush) {
      const briefcaseDb = await BeDuration.race(timeout, this.openBriefcase(args));
      requestContext.enter();

      if (briefcaseDb === undefined) {
        Logger.logTrace(loggerCategory, "Open briefcase - pending", () => ({ ...tokenProps }));
        throw new RpcPendingResponse();
      }
      // note: usage is logged in BriefcaseManager.downloadNewBriefcaseAndOpen
      return briefcaseDb;
    }

    const checkpoint: CheckpointProps = {
      iModelId: tokenProps.iModelId!,
      contextId: tokenProps.contextId!,
      changeSetId: tokenProps.changeSetId!,
      changesetIndex: tokenProps.changesetIndex,
      requestContext,
    };

    // opening a checkpoint, readonly.
    let db: SnapshotDb | void;
    // first check if it's already open
    db = SnapshotDb.tryFindByKey(CheckpointManager.getKey(checkpoint));
    if (db) {
      Logger.logTrace(loggerCategory, "Checkpoint was already open", () => ({ ...tokenProps }));
      BriefcaseManager.logUsage(requestContext, tokenProps);
      return db;
    }

    try {
      // now try V2 checkpoint
      db = await SnapshotDb.openCheckpointV2(checkpoint);
      requestContext.enter();
      Logger.logTrace(loggerCategory, "using V2 checkpoint briefcase", () => ({ ...tokenProps }));
    } catch (e) {
      Logger.logTrace(loggerCategory, "unable to open V2 checkpoint - falling back to V1 checkpoint", () => ({ ...tokenProps }));

      // this isn't a v2 checkpoint. Set up a race between the specified timeout period and the open. Throw an RpcPendingResponse exception if the timeout happens first.
      const request = {
        checkpoint,
        localFile: V1CheckpointManager.getFileName(checkpoint),
        aliasFiles: [V1CheckpointManager.getCompatibilityFileName(checkpoint)],// eslint-disable-line deprecation/deprecation
      };
      db = await BeDuration.race(timeout, V1CheckpointManager.getCheckpointDb(request));
      requestContext.enter();

      if (db === undefined) {
        Logger.logTrace(loggerCategory, "Open V1 checkpoint - pending", () => ({ ...tokenProps }));
        throw new RpcPendingResponse();
      }
      Logger.logTrace(loggerCategory, "Opened V1 checkpoint", () => ({ ...tokenProps }));
    }

    BriefcaseManager.logUsage(requestContext, tokenProps);
    return db;
  }

  public static async openWithTimeout(requestContext: AuthorizedClientRequestContext, tokenProps: IModelRpcOpenProps, syncMode: SyncMode, timeout: number = 1000): Promise<IModelConnectionProps> {
    return (await this.open({ requestContext, tokenProps, syncMode, timeout })).toJSON();
  }

  /** Close the briefcase if necessary */
  public static async close(requestContext: AuthorizedClientRequestContext, tokenProps: IModelRpcProps): Promise<boolean> {
    // Close is a no-op for ReadOnly connections
    if (OpenMode.Readonly === tokenProps.openMode)
      return true;

    // For read-write connections, close the briefcase and delete local copies of it
    const briefcaseDb = BriefcaseDb.tryFindByKey(tokenProps.key);
    if (!briefcaseDb)
      return false;

    const fileName = briefcaseDb.pathName;
    if (!briefcaseDb.isOpen)
      return false;

    briefcaseDb.close();
    await BriefcaseManager.deleteBriefcaseFiles(fileName, requestContext);
    return true;
  }
}
