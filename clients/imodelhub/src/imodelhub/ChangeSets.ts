/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModelHubClient
 */

import { GuidString, Logger } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext, ChunkedQueryContext, DownloadFailed, ECJsonTypeMap, FileHandler, ProgressCallback, ProgressInfo, RequestQueryOptions, SasUrlExpired, WsgInstance } from "@bentley/itwin-client";
import { IModelHubClientLoggerCategory } from "../IModelHubClientLoggerCategories";
import { IModelBaseHandler } from "./BaseHandler";
import { ArgumentCheck, IModelHubClientError } from "./Errors";
import { addSelectApplicationData, addSelectFileAccessKey, StringIdQuery } from "./HubQuery";

const loggerCategory: string = IModelHubClientLoggerCategory.IModelHub;

/**
 * Specifies types of changes in a [[ChangeSet]].
 * @public
 */
export enum ChangesType {
  /** [[ChangeSet]] contains regular file changes (e.g. changes to elements or models). */
  Regular = 0,
  /** [[ChangeSet]] only contains schema changes. */
  Schema = 1 << 0,
  /** [[ChangeSet]] contains definition changes. */
  Definition = 1 << 1,
  /** [[ChangeSet]] contains spatial data changes. */
  SpatialData = 1 << 2,
  /** [[ChangeSet]] contains sheets and drawings changes. */
  SheetsAndDrawings = 1 << 3,
  /** [[ChangeSet]] contains views and model changes. */
  ViewsAndModels = 1 << 4,
  /** [[ChangeSet]] contains changes of global properties. */
  GlobalProperties = 1 << 5,
}

/**
 * [ChangeSet]($docs/learning/Glossary.md#changeset) represents a file containing changes to the iModel. A single ChangeSet contains changes made on a single [[Briefcase]] file and pushed as a single file. ChangeSets form a linear change history of the iModel. If a user wants to push their changes to iModelHub, they first have to merge all ChangeSet they do not have yet. Only a single briefcase is allowed to push their changes at a time.
 * @public
 */
@ECJsonTypeMap.classToJson("wsg", "iModelScope.ChangeSet", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class ChangeSet extends WsgInstance {
  /** Id of this ChangeSet. It has to be set during the push. It's a hash value based on the contents of ChangeSet file and its parentId. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Id")
  public id?: string;

  /** Filename of the ChangeSet. It has to be set during the push. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.FileName")
  public fileName?: string;

  /** Description of this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Description")
  public description?: string;

  /** Size of this ChangeSet file. It has to be set during the push. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.FileSize")
  public fileSize?: string;

  /** Index of this ChangeSet (increasing, but not necessarily sequential). */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Index")
  public index?: string;

  /** Id of this ChangeSet's parent ChangeSet. It has to be set during the push. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.ParentId")
  public parentId?: string;

  /**
   * Id of the file that this ChangeSet belongs to. It has to be set during the push. See [IModelDb.getGuid]($backend).
   * @internal @deprecated
   */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.SeedFileId")
  public seedFileId?: GuidString;

  /** Id of the [[Briefcase]] that pushed this ChangeSet. It has to be set during the push. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.BriefcaseId")
  public briefcaseId?: number;

  /** Id of the user that pushed this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.UserCreated")
  public userCreated?: string;

  /** Date when this ChangeSet was pushed to iModelHub. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.PushDate")
  public pushDate?: string;

  /** Shows what kind of changes are contained in this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.ContainingChanges")
  public changesType?: ChangesType;

  /**
   * Flag that needs to be marked true, when confirming successful ChangeSet upload.
   * @internal
   */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.IsUploaded")
  public isUploaded?: boolean;

  /**
   * URL from where the ChangeSet file can be downloaded. See [[ChangeSetQuery.selectDownloadUrl]].
   * @internal
   */
  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[FileAccessKey].relatedInstance[AccessKey].properties.DownloadUrl")
  public downloadUrl?: string;

  /**
   * URL where the ChangeSet file has to be uploaded.
   * @internal
   */
  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[FileAccessKey].relatedInstance[AccessKey].properties.UploadUrl")
  public uploadUrl?: string;

  /** Id of the application that created this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[CreatedByApplication].relatedInstance[Application].properties.Id")
  public applicationId?: string;

  /** Name of the application that created this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[CreatedByApplication].relatedInstance[Application].properties.Name")
  public applicationName?: string;

  /** Id of the bridge that created this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[HasBridgeProperties](direction:forward).relatedInstance[BridgeProperties].properties.JobId")
  public bridgeJobId?: string;

  /** User identifiers of users who made changes contained in this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[HasBridgeProperties](direction:forward).relatedInstance[BridgeProperties].properties.Users")
  public bridgeUsers?: string[];

  /** File names which have been modified with this ChangeSet. */
  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[HasBridgeProperties](direction:forward).relatedInstance[BridgeProperties].properties.ChangedFiles")
  public bridgeChangedFiles?: string[];

  /** Path to the download ChangeSet file on disk. */
  public pathname?: string;

  private _fileSizeNumber?: number;

  /** Parsed number of this ChangeSet file size. */
  public get fileSizeNumber(): number {
    if (this._fileSizeNumber)
      return this._fileSizeNumber;

    this._fileSizeNumber = parseInt(this.fileSize!, 10);
    return this._fileSizeNumber;
  }
}

/**
 * Query object for getting [[ChangeSet]]s. You can use this to modify the query. See [[ChangeSetHandler.get]].
 * @public
 */
export class ChangeSetQuery extends StringIdQuery {
  /**
   * Default page size which is used when querying ChangeSets
   * @internal
   */
  public static defaultPageSize: number = 1000;

  /** Constructor that sets default page size. */
  constructor() {
    super();
    this.pageSize(ChangeSetQuery.defaultPageSize);
  }

  /**
   * Clone current query.
   * @returns Cloned query.
   */
  public clone(): ChangeSetQuery {
    const changeSetQuery = new ChangeSetQuery();
    changeSetQuery._query = { ...this.getQueryOptions() };
    return changeSetQuery;
  }

  /**
   * Query will additionally select [[ChangeSet]] file download URL. This is needed to use the ChangeSet object with [[ChangeSetHandler.download]].
   * @returns This query.
   */
  public selectDownloadUrl() {
    addSelectFileAccessKey(this._query);
    return this;
  }

  /**
   * Query will additionally select data about application that created this [[ChangeSet]].
   * @returns This query.
   */
  public selectApplicationData() {
    addSelectApplicationData(this._query);
    return this;
  }

  /** @internal */
  protected override checkValue(id: string) {
    ArgumentCheck.validChangeSetId("id", id);
  }

  /**
   * Query [[ChangeSet]]s that are after the specified ChangeSet. This overrides any previously applied ChangeSetQuery filters. Query will return all of the ChangeSets that are newer than the one specified by id. ChangeSet specified by the id will not be included in the results. Returned ChangeSets will be in an ascending order.
   * @param id Id of a ChangeSet.
   * @returns This query.
   */
  public fromId(id: string) {
    ArgumentCheck.validChangeSetId("id", id);
    this._query.$filter = `FollowingChangeSet-backward-ChangeSet.Id+eq+'${id}'`;
    return this;
  }

  /**
   * Change the order of results to be from newest [[ChangeSet]]s to the oldest ones.
   * @returns This query.
   */
  public latest() {
    this._query.$orderby = "Index+desc";
    return this;
  }

  /**
   * Query [[ChangeSet]]s between two specified ChangeSets. This overrides any previously applied ChangeSetQuery filters. This query will work when either of the ChangeSet ids points to an earlier ChangeSet. Latest ChangeSet specified by this range will be included in the results, but the earliest will be excluded. If the second ChangeSet id is not specified, it's assumed that it's the same as an empty id, and query will return all ChangeSets from the start up to the ChangeSet with the first id. Returned ChangeSets will be in an ascending order.
   * @param firstChangeSetId Id of the first changeSet.
   * @param secondChangeSetId Id of the second changeSet.
   * @returns This query.
   */
  public betweenChangeSets(firstChangeSetId: string, secondChangeSetId?: string) {
    ArgumentCheck.validChangeSetId("firstChangeSetId", firstChangeSetId);
    if (secondChangeSetId)
      ArgumentCheck.validChangeSetId("secondChangeSetId", secondChangeSetId);
    let query: string;
    if (!secondChangeSetId) {
      query = `CumulativeChangeSet-backward-ChangeSet.Id+eq+'${firstChangeSetId}'`;
    } else {
      query = `(CumulativeChangeSet-backward-ChangeSet.Id+eq+'${firstChangeSetId}'`;
      query += `+and+FollowingChangeSet-backward-ChangeSet.Id+eq+'${secondChangeSetId}')`;
      query += `+or+(CumulativeChangeSet-backward-ChangeSet.Id+eq+'${secondChangeSetId}'`;
      query += `+and+FollowingChangeSet-backward-ChangeSet.Id+eq+'${firstChangeSetId}')`;
    }

    this._query.$filter = query;
    return this;
  }

  /**
   * Query [[ChangeSet]]s included in the specified [[Version]]. This overrides any previously applied ChangeSetQuery filters. Query will return all of the ChangeSets from the start up to the one specified by versionId. ChangeSet specified by versionId will be included in the results. Returned ChangeSets will be in an ascending order.
   * @param versionId Id of the version.
   * @returns This query.
   */
  public getVersionChangeSets(versionId: GuidString) {
    ArgumentCheck.validGuid("versionId", versionId);
    this._query.$filter = `CumulativeChangeSet-backward-Version.Id+eq+'${versionId}'`;
    return this;
  }

  /**
   * Query [[ChangeSet]]s after the specified [[Version]]. This overrides any previously applied ChangeSetQuery filters. Query will return all of the ChangeSets that are newer than the one specified by versionId. ChangeSet specified by versionId will not be included in the results. Returned ChangeSets will be in an ascending order.
   * @param versionId Id of the version.
   * @returns This query.
   */
  public afterVersion(versionId: GuidString) {
    ArgumentCheck.validGuid("versionId", versionId);
    this._query.$filter = `FollowingChangeSet-backward-Version.Id+eq+'${versionId}'`;
    return this;
  }

  /**
   * Query [[ChangeSet]]s between two specified [[Version]]s. This overrides any previously applied ChangeSetQuery filters. This query will work when either of the Version ids points to an earlier ChangeSet. Latest ChangeSet specified by this range will be included in the results, but the earliest will be excluded. Returned ChangeSets will be in an ascending order.
   * @param sourceVersionId Id of the source version.
   * @param destinationVersionId Id of the destination version.
   * @returns This query.
   */
  public betweenVersions(sourceVersionId: GuidString, destinationVersionId: GuidString) {
    ArgumentCheck.validGuid("sourceVersionId", sourceVersionId);
    ArgumentCheck.validGuid("destinationVersionId", destinationVersionId);
    let query: string;
    query = `(FollowingChangeSet-backward-Version.Id+eq+'${sourceVersionId}'`;
    query += `+and+CumulativeChangeSet-backward-Version.Id+eq+'${destinationVersionId}')`;
    query += `+or+(FollowingChangeSet-backward-Version.Id+eq+'${destinationVersionId}'`;
    query += `+and+CumulativeChangeSet-backward-Version.Id+eq+'${sourceVersionId}')`;

    this._query.$filter = query;
    return this;
  }

  /**
   * Query [[ChangeSet]]s between the specified [[Version]] and another [[ChangeSet]]. This overrides any previously applied ChangeSetQuery filters. This query will work when either versionId or changeSetId points to an earlier ChangeSet. Latest ChangeSet specified by this range will be included in the results, but the earliest will be excluded. Returned ChangeSets will be in an ascending order.
   * @param versionId Id of the version.
   * @param changeSetId Id of the changeSet.
   * @returns This query.
   */
  public betweenVersionAndChangeSet(versionId: GuidString, changeSetId: string) {
    ArgumentCheck.validGuid("versionId", versionId);
    ArgumentCheck.validChangeSetId("changeSetId", changeSetId);
    let query: string;
    query = `(CumulativeChangeSet-backward-Version.Id+eq+'${versionId}'+and+FollowingChangeSet-backward-ChangeSet.Id+eq+'${changeSetId}')`;
    query += `+or+`;
    query += `(FollowingChangeSet-backward-Version.Id+eq+'${versionId}'+and+CumulativeChangeSet-backward-ChangeSet.Id+eq+'${changeSetId}')`;

    this._query.$filter = query;
    return this;
  }

  /**
   * Query changeSets by the seed file id. Should be obsolete, because seed file replacement is deprecated.
   * @param seedFileId Id of the seed file.
   * @returns This query.
   * @internal
   */
  public bySeedFileId(seedFileId: GuidString) {
    ArgumentCheck.validGuid("seedFileId", seedFileId);
    this.addFilter(`SeedFileId+eq+'${seedFileId}'`);
    return this;
  }

  /** Select all bridge properties. */
  public selectBridgeProperties() {
    if (!this._query.$select)
      this._query.$select = "*";

    return this.addSelect(`HasBridgeProperties-forward-BridgeProperties.*`);
  }
}

/** Queue for limiting number of promises executed in parallel. */
class ParallelQueue {
  private _queue: Array<() => Promise<void>> = [];
  private _parallelDownloads = 10;

  /** Add a promise to the queue. */
  public push(downloadFunc: () => Promise<void>) {
    this._queue.push(downloadFunc);
  }

  /** Wait for all promises in the queue to finish. */
  public async waitAll() {
    let i = 0;
    const promises = new Array<Promise<number>>();
    const indexes = new Array<number>();
    const completed = new Array<number>();

    while (this._queue.length > 0 || promises.length > 0) {
      while (this._queue.length > 0 && promises.length < this._parallelDownloads) {
        const currentIndex = i++;
        promises.push(this._queue[0]().then(() => completed.push(currentIndex)));
        indexes.push(currentIndex);
        this._queue.shift();
      }
      await Promise.race(promises);
      while (completed.length > 0) {
        const completedIndex = completed.shift()!;
        const index = indexes.findIndex((value) => value === completedIndex);
        if (index !== undefined) {
          promises.splice(index, 1);
          indexes.splice(index, 1);
        }
      }
    }
  }
}

/** Object for tracking changeSets download progress. */
class DownloadProgress {
  private _totalSize: number;
  private _downloadedSize: number;

  constructor(totalSize: number) {
    this._downloadedSize = 0;
    this._totalSize = totalSize;
  }

  /** Gets total changeSets size to download. */
  public get totalSize(): number {
    return this._totalSize;
  }

  /** Gets currently downloaded changeSets size. */
  public get downloadedSize(): number {
    return this._downloadedSize;
  }

  /** Sets currently downloaded changeSets size. */
  public set downloadedSize(value: number) {
    this._downloadedSize = value;
  }
}

/**
 * Handler for managing [[ChangeSet]]s. Use [[IModelClient.ChangeSets]] to get an instance of this class. In most cases, you should use [BriefcaseDb]($backend) methods instead.
 * @public
 */
export class ChangeSetHandler {
  private _handler: IModelBaseHandler;
  private _fileHandler?: FileHandler;

  /**
   * Constructor for ChangeSetHandler. Should use [[IModelClient]] instead of directly constructing this.
   * @param handler Handler for WSG requests.
   * @param fileHandler Handler for file system.
   * @internal
   */
  constructor(handler: IModelBaseHandler, fileHandler?: FileHandler) {
    this._handler = handler;
    this._fileHandler = fileHandler;
  }

  /** Get relative url for ChangeSet requests.
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param changeSetId Id of the ChangeSet.
   * @internal
   */
  private getRelativeUrl(iModelId: GuidString, changeSetId?: string) {
    return `/Repositories/iModel--${iModelId}/iModelScope/ChangeSet/${changeSetId || ""}`;
  }

  /** Get the [[ChangeSet]]s for the iModel.
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param query Optional query object to filter the queried ChangeSets or select different data from them.
   * @returns ChangeSets that match the query.
   * @throws [WsgError]($itwin-client) with [WSStatus.InstanceNotFound]($bentley) if [[InstanceIdQuery.byId]] is used and a [[ChangeSet]] with the specified id could not be found.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async get(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, query: ChangeSetQuery = new ChangeSetQuery()): Promise<ChangeSet[]> {
    requestContext.enter();
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("iModelId", iModelId);
    Logger.logTrace(loggerCategory, `Querying ChangeSets`, () => ({ iModelId }));

    const id = query.getId();
    const changeSets = await this._handler.getInstances<ChangeSet>(requestContext, ChangeSet, this.getRelativeUrl(iModelId, id), query.getQueryOptions());
    requestContext.enter();

    return changeSets;
  }

  /** Get the chunk of [[ChangeSet]]s for the iModel.
   * @param requestContext The client request context.
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param url [[ChangeSet]]s query url.
   * @param chunkedQueryContext [[ChangeSet]]s chunked query context.
   * @param queryOptions Request query options.
   * @returns [[ChangeSet]]s chunk that match the query.
   * @throws [[WsgError]] with [WSStatus.InstanceNotFound]($bentley) if [[InstanceIdQuery.byId]] is used and a [[ChangeSet]] with the specified id could not be found.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  private async getChunk(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, url: string, chunkedQueryContext: ChunkedQueryContext | undefined, queryOptions: RequestQueryOptions): Promise<ChangeSet[]> {
    requestContext.enter();
    Logger.logTrace(loggerCategory, `Querying ChangeSets chunk`, () => ({ iModelId }));
    const changeSets = await this._handler.getInstancesChunk<ChangeSet>(requestContext, url, chunkedQueryContext, ChangeSet, queryOptions);
    requestContext.enter();
    return changeSets;
  }

  /**
   * Download the [[ChangeSet]]s that match provided query. If you want to [pull]($docs/learning/Glossary.md#pull) and [merge]($docs/learning/Glossary.md#merge) ChangeSets from iModelHub to your [[Briefcase]], you should use [BriefcaseDb.pullAndMergeChanges]($backend) instead.
   *
   * This method creates the directory containing the ChangeSets if necessary. If there is an error in downloading some of the ChangeSets, all partially downloaded ChangeSets are deleted from disk.
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param query Query that defines ChangeSets to download.
   * @param path Path of directory where the ChangeSets should be downloaded.
   * @throws [[IModelHubClientError]] with [IModelHubStatus.UndefinedArgumentError]($bentley), if one of the required arguments is undefined or empty.
   * @param progressCallback Callback for tracking progress.
   * @throws [ResponseError]($itwin-client) if the download fails.
   * @internal
   */
  public async download(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, query: ChangeSetQuery, path: string, progressCallback?: ProgressCallback): Promise<ChangeSet[]> {
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("iModelId", iModelId);
    ArgumentCheck.defined("path", path);
    requestContext.enter();

    if (typeof window !== "undefined")
      throw IModelHubClientError.browser();

    if (!this._fileHandler)
      throw IModelHubClientError.fileHandler();

    const changeSetsToDownloadQuery: ChangeSetQuery = query.clone();
    changeSetsToDownloadQuery.select("FileSize");
    const changeSetsToDownload = await this.get(requestContext, iModelId, changeSetsToDownloadQuery);
    requestContext.enter();

    if (changeSetsToDownload.length === 0)
      return new Array<ChangeSet>();

    Logger.logInfo(loggerCategory, `Downloading ${changeSetsToDownload.length} changesets`);

    let totalSize = 0;
    changeSetsToDownload.forEach((value) => totalSize += value.fileSizeNumber);
    const downloadProgress = new DownloadProgress(totalSize);

    query.selectDownloadUrl();

    const url: string = await this._handler.getUrl(requestContext) + this.getRelativeUrl(iModelId, query.getId());
    requestContext.enter();

    const queryOptions = query.getQueryOptions();
    const chunkedQueryContext = queryOptions ? ChunkedQueryContext.create(queryOptions) : undefined;
    const changeSets: ChangeSet[] = new Array<ChangeSet>();
    do {
      const changeSetsChunk = await this.getChunk(requestContext, iModelId, url, chunkedQueryContext, queryOptions);
      requestContext.enter();

      await this.downloadChunk(requestContext, iModelId, changeSetsChunk, path, downloadProgress, progressCallback);
      requestContext.enter();

      changeSets.push(...changeSetsChunk);
    } while (chunkedQueryContext && !chunkedQueryContext.isQueryFinished);

    Logger.logInfo(loggerCategory, `Downloaded ${changeSets.length} changesets`);

    return changeSets;
  }

  /** Download the chunk of [[ChangeSet]]s for the iModel.
   * @param requestContext The client request context.
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param changeSets [[ChangeSet]]s chunk to download.
   * @param path Path of directory where the ChangeSets should be downloaded.
   * @param downloadProgress Object that tracks [[ChangeSet]]s download progress.
   * @param progressCallback Callback for tracking progress.
   * @throws [ResponseError]($itwin-client) if the download fails.
   */
  private async downloadChunk(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changeSets: ChangeSet[], path: string, downloadProgress: DownloadProgress, progressCallback?: ProgressCallback): Promise<void> {
    requestContext.enter();

    changeSets.forEach((changeSet) => {
      if (!changeSet.downloadUrl)
        throw IModelHubClientError.missingDownloadUrl("changeSets");
    });

    Logger.logInfo(loggerCategory, `Downloading ${changeSets.length} changesets chunk`);

    // Sort changesets by file size ascending. This way we increase probability SAS token won't expire for small changesets
    const sortedChangeSets = Array.from(changeSets).sort((a, b) => a.fileSizeNumber < b.fileSizeNumber ? -1 : a.fileSizeNumber === b.fileSizeNumber ? 0 : 1);

    const queue = new ParallelQueue();
    const fileHandler = this._fileHandler!;
    sortedChangeSets.forEach((changeSet) =>
      queue.push(async () => {
        const downloadPath: string = fileHandler.join(path, changeSet.fileName!);

        let previouslyDownloaded = 0;
        const callback: ProgressCallback = (progress: ProgressInfo) => {
          downloadProgress.downloadedSize += (progress.loaded - previouslyDownloaded);
          previouslyDownloaded = progress.loaded;
          progressCallback!({ loaded: downloadProgress.downloadedSize, total: downloadProgress.totalSize, percent: downloadProgress.downloadedSize / downloadProgress.totalSize });
        };

        if (this.wasChangeSetDownloaded(downloadPath, changeSet.fileSizeNumber, changeSet)) {
          if (progressCallback)
            callback({ percent: 100, total: changeSet.fileSizeNumber, loaded: changeSet.fileSizeNumber });
          return;
        }

        await this.downloadChangeSetWithRetry(requestContext, iModelId, changeSet, downloadPath, progressCallback ? callback : undefined);
        requestContext.enter();
      }));

    await queue.waitAll();
    requestContext.enter();

    Logger.logTrace(loggerCategory, `Finished downloading changesets chunk`);
  }

  /** Download single [[ChangeSet]] with retry if SAS url expired or download failed.
   * @param requestContext The client request context.
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param changeSet [[ChangeSet]] to download.
   * @param downloadPath Path where the ChangeSet should be downloaded.
   * @param changeSetProgress Callback for tracking progress.
   * @throws [ResponseError]($itwin-client) if the download fails.
   */
  private async downloadChangeSetWithRetry(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changeSet: ChangeSet, downloadPath: string, changeSetProgress?: ProgressCallback): Promise<void> {
    requestContext.enter();
    try {
      await this.downloadChangeSet(requestContext, changeSet, downloadPath, changeSetProgress);
      requestContext.enter();
      return;
    } catch (error) {
      requestContext.enter();
      if (!(error instanceof SasUrlExpired || error instanceof DownloadFailed))
        throw error;

      Logger.logWarning(loggerCategory, `ChangeSet download failed, refreshing downloadUrl to retry download.`, () => ({ iModelId, id: changeSet.id }));

      const changeSetQuery = new ChangeSetQuery();
      changeSetQuery.byId(changeSet.id!);
      changeSetQuery.selectDownloadUrl();

      const refreshedChangeSets = await this.get(requestContext, iModelId, changeSetQuery);
      requestContext.enter();
      if (refreshedChangeSets.length === 0)
        throw error;

      await this.downloadChangeSet(requestContext, refreshedChangeSets[0], downloadPath, changeSetProgress);
      requestContext.enter();
      return;
    }
  }

  /** Download single [[ChangeSet]].
   * @param requestContext The client request context.
   * @param changeSet [[ChangeSet]] to download.
   * @param downloadPath Path where the ChangeSet should be downloaded.
   * @param changeSetProgress Callback for tracking progress.
   * @throws [ResponseError]($itwin-client) if the download fails.
   */
  private async downloadChangeSet(requestContext: AuthorizedClientRequestContext, changeSet: ChangeSet, downloadPath: string, changeSetProgress?: ProgressCallback): Promise<void> {
    requestContext.enter();
    try {
      await this._fileHandler!.downloadFile(requestContext, changeSet.downloadUrl!, downloadPath, changeSet.fileSizeNumber, changeSetProgress);
      requestContext.enter();
    } catch (error) {
      requestContext.enter();
      // Note: If the cache was shared across processes, it's possible that the download was completed by another process
      if (this.wasChangeSetDownloaded(downloadPath, changeSet.fileSizeNumber, changeSet))
        return;
      throw error;
    }
  }

  /** Checks if ChangeSet file was already downloaded.
   * @param path Path of file where the ChangeSet should be downloaded.
   * @param expectedFileSize Size of the file that's being downloaded.
   * @param changeSet ChangeSet that's being downloaded.
   */
  private wasChangeSetDownloaded(path: string, expectedFileSize: number, changeSet: ChangeSet): boolean {
    if (!this._fileHandler)
      return false;

    if (!this._fileHandler.exists(path))
      return false;

    const actualFileSize = this._fileHandler.getFileSize(path);
    if (actualFileSize === expectedFileSize)
      return true;

    Logger.logError(loggerCategory, `ChangeSet size ${actualFileSize} does not match the expected size ${expectedFileSize}. Deleting it so that it can be refetched`, () => (changeSet));
    try {
      this._fileHandler.unlink(path);
    } catch (error) {
      Logger.logError(loggerCategory, `Cannot delete ChangeSet file at ${path}`);
    }
    return false;
  }

  /**
   * Upload a [[ChangeSet]] file. If you want to [push]($docs/learning/Glossary.md#push) your changes to iModelHub, use [BriefcaseDb.pushChanges]($backend) instead. This method is only a part of that workflow.
   *
   * ChangeSets have to be uploaded in a linear order. If another user is uploading, or changeSet.parentId does not point to the latest ChangeSet on iModelHub, this method will fail. User will have to download all of the newer ChangeSets, merge them into their [[Briefcase]] and calculate a new ChangeSet id.
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param changeSet Information of the ChangeSet to be uploaded.
   * @param path Path of the ChangeSet file to be uploaded.
   * @param progressCallback Callback for tracking upload progress.
   * @throws [IModelHubStatus.BriefcaseDoesNotBelongToUser]($bentley) if Briefcase specified by changeSet.briefcaseId belongs to another user.
   * @throws [IModelHubStatus.AnotherUserPushing]($bentley) if another user is currently uploading a ChangeSet.
   * @throws [IModelHubStatus.PullIsRequired]($bentley) if there are newer ChangeSets on iModelHub, that need to be downloaded and merged, before upload is possible.
   * @throws [IModelHubStatus.ChangeSetAlreadyExists]($bentley) if a ChangeSet with this id already exists. This usually happens if previous upload attempt has succeeded.
   * @throws [IModelHubStatus.ChangeSetPointsToBadSeed]($bentley) if changeSet.seedFileId is not set to the correct file id. That file id should match to the value written to the Briefcase file.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   * @internal
   */
  public async create(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changeSet: ChangeSet, path: string, progressCallback?: ProgressCallback): Promise<ChangeSet> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Started uploading ChangeSet", () => ({ iModelId, ...changeSet }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("iModelId", iModelId);
    ArgumentCheck.defined("changeSet", changeSet);
    ArgumentCheck.defined("path", path);

    if (typeof window !== "undefined")
      throw IModelHubClientError.browser();

    if (!this._fileHandler)
      throw IModelHubClientError.fileHandler();

    if (!this._fileHandler.exists(path) || this._fileHandler.isDirectory(path))
      throw IModelHubClientError.fileNotFound();

    const postChangeSet = await this._handler.postInstance<ChangeSet>(requestContext, ChangeSet, this.getRelativeUrl(iModelId), changeSet);

    await this._fileHandler.uploadFile(requestContext, postChangeSet.uploadUrl!, path, progressCallback);
    requestContext.enter();

    postChangeSet.uploadUrl = undefined;
    postChangeSet.downloadUrl = undefined;
    postChangeSet.isUploaded = true;

    const confirmChangeSet = await this._handler.postInstance<ChangeSet>(requestContext, ChangeSet, this.getRelativeUrl(iModelId, postChangeSet.id), postChangeSet);
    requestContext.enter();

    changeSet.isUploaded = true;

    Logger.logInfo(loggerCategory, "Finished uploading ChangeSet", () => ({ iModelId, ...changeSet }));

    return confirmChangeSet;
  }
}
