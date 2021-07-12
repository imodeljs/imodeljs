/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ProductShareClient
 */
import { assert, BentleyError, BentleyStatus, Config, GuidString, Logger } from "@bentley/bentleyjs-core";
import {
  AuthorizedClientRequestContext, ECJsonTypeMap, ITwinClientLoggerCategory, request, RequestOptions, WsgClient, WsgInstance, WsgQuery,
} from "@bentley/itwin-client";

const loggerCategory = ITwinClientLoggerCategory.Clients;

/**
 * @internal
 */
export enum RecycleOption {
  DeletePermanently,
  SendToRecycleBin,
}
/** Represents a folder in ProjectShare.
 * @internal
 */
@ECJsonTypeMap.classToJson("wsg", "ProjectShare.Folder", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class ProjectShareFolder extends WsgInstance {
  @ECJsonTypeMap.propertyToJson("wsg", "InstanceId")
  public instanceId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Name")
  public name?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ContentType")
  public contentType?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.CreatedBy")
  public createdBy?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Path")
  public path?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.CreatedTimeStamp")
  public createdTimeStamp?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ModifiedBy")
  public modifiedBy?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ModifiedTimeStamp")
  public modifiedTimeStamp?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ParentFolderId")
  public parentFolderId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Size")
  public size?: number;

  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[FolderHasContent](direction:backward).relatedInstance[Folder]")
  public parentFolder?: ProjectShareFolder;
}

/** This class is used to upload file and store extracted information related to file in project share.
 * File contains access Url is used to accessing that file like by using access url we can perform read write operation on file.
 * @internal
 */
@ECJsonTypeMap.classToJson("wsg", "ProjectShare.File", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class ProjectShareFile extends WsgInstance {
  @ECJsonTypeMap.propertyToJson("wsg", "InstanceId")
  public instanceId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Name")
  public name?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ContentType")
  public contentType?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.CreatedBy")
  public createdBy?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Path")
  public path?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.CreatedTimeStamp")
  public createdTimeStamp?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ModifiedBy")
  public modifiedBy?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ModifiedTimeStamp")
  public modifiedTimeStamp?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ParentFolderId")
  public parentFolderWsgId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Size")
  public size?: number;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.FileExists")
  public fileExists?: boolean;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Description")
  public description?: string;

  /**
   * @note The accessUrl is only valid for one hour after it has been initialized by the server.
   */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.AccessUrl")
  public accessUrl?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.CustomProperties")
  public customProperties?: any;

  @ECJsonTypeMap.propertyToJson("wsg", "relationshipInstances[FolderHasContent](direction:backward).relatedInstance[Folder]")
  public parentFolder?: ProjectShareFolder;
}

/** Base query object for getting ProjectShare files and folders
 * This class is used to perform basic query operations on folders and files.
 * @internal
 */
export class ProjectShareQuery extends WsgQuery {
  /**
   * Modify path for further usage in queries
   * @param path given path
   */
  protected correctPath(path: string) {
    return (path.trim() === "" || path.trim() === "/") ? "" : path.endsWith("/") ? path : `${path}/`;
  }

  /**
   * Query for children inside the specified folder
   * @param contextId Context Id (e.g., projectId or assetId)
   * @note This cannot be combined with other queries.
   */
  public inRootFolder(contextId: GuidString) {
    this.filter(`FolderHasContent-backward-Folder.$id+eq+'${contextId}'`);
    return this;
  }

  /**
   * Query for children inside the specified folder
   * @param folderId Id of the folder
   * @note This cannot be combined with other queries.
   */
  public inFolder(folderId: GuidString) {
    this.filter(`FolderHasContent-backward-Folder.$id+eq+'${folderId}'`);
    return this;
  }

  /**
   * Query for folders or files by ids
   * @param ids (Array of) folder or file ids
   */
  public byWsgIds(...ids: GuidString[]) {
    const stringOfIds = ids.reduce((prev: GuidString, curr: GuidString) => (!prev ? `'${curr}'` : `${prev},'${curr}'`), "");
    this.filter(`$id in [${stringOfIds}]`);
    this._query.$pageSize = undefined;
    return this;
  }

  /**
   * Query for children in the specified folder, and with a name that matches the specified expression
   * @param folderId  Id of the folder to look in
   * @param nameLike Wild card expression to match the name of the file
   * @note
   * <ul>
   * <li> The path is really as seen in the iTwin project share portal, and should not include the contextId at the root.
   * <li> This cannot be combined with other queries.
   * <ul>
   */
  public inFolderWithNameLike(folderId: GuidString, searchName: string) {
    this.addFilter(`Name like '${searchName}' and FolderHasContent-backward-Folder.$id+eq+'${folderId}'`);
    return this;
  }

  /**
   * Query for children in the specified path, and with a name that matches the specified expression
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param path Path specified relative to the root folder to look in. Note: Root folder is named by the contextId, and need not be included.
   * @param nameLike Wildcard expression to match the name of the file
   * @note
   * <ul>
   * <li> The path is really as seen in the iTwin project share portal, and should not include the contextId at the root.
   * <li> This cannot be combined with other queries.
   * <ul>
   */
  public startsWithPathAndNameLike(contextId: GuidString, path: string, nameLike: string = "*") {
    const correctedPath = this.correctPath(path);
    this.addFilter(`startswith(Path,'${contextId}/${correctedPath}') and Name like '${nameLike}'`);
    return this;
  }
}

/** Query object for getting ProjectShareFiles. You can use this to modify the query.
 * This class is used to perform query on projectShare Files.
 * @internal
 */
export class ProjectShareFileQuery extends ProjectShareQuery {
  /**
   * Query for children inside of the specified path
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param path Path specified relative to the root folder to look in. Note: Root folder is named by the contextId, and need not be included.
   * @note
   * <ul>
   * <li> The path is really as seen in the iTwin project share portal, and should not include the contextId at the root.
   * <li> This cannot be combined with other queries.
   * <ul>
   */
  public startsWithPath(contextId: GuidString, path: string) {
    return this.startsWithPathAndNameLike(contextId, path, "*");
  }
}

/** Query object for getting ProjectShareFolders. You can use this to modify the query.
 * This class is used to perform query on projectShare Folders.
 * @internal
 */
export class ProjectShareFolderQuery extends ProjectShareQuery {
  /**
   * Query for children inside of the specified path
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param path Path specified relative to the root folder to look in. Note: Root folder is named by the contextId, and need not be included.
   * @note
   * <ul>
   * <li> The path is really as seen in the iTwin project share portal, and should not include the contextId at the root.
   * <li> This cannot be combined with other queries.
   * <ul>
   */
  public inPath(contextId: GuidString, path: string) {
    const correctedPath = super.correctPath(path);
    this.filter(`Path eq '${contextId}/${correctedPath}'`);
    return this;
  }
}

/**
 * Client wrapper to ProjectShare Service
 * @note
 * <ul>
 * <li> Authorization supplied through the [[AuthorizedClientRequestContext]] and can contain SAML or OIDC (JWT) tokens. The client
 * creating OIDC tokens must include the scope *projectwise-share*.
 * <li> Use this [link](http://bsw-wiki.bentley.com/bin/view.pl/Main/ProjectShareApiV2Documentation) for comprehensive documentation of
 * the underlying REST API.
 * <li> The user accessing Project Share must be provided the required permissions in the iTwin role management portal.
 * i.e., from the main iTwin project portal, follow the link to "Project Team Management > Project Role Management > Service Access and Permissions > Share"
 * and ensure it includes the relevant Project Share permissions for Read, Write, Delete, etc.
 * </ul>
 * @internal
 */
export class ProjectShareClient extends WsgClient {
  public static readonly searchKey: string = "ProjectShare.Url";
  public static readonly configURL = "imjs_project_share_client_url";
  public static readonly configRelyingPartyUri = "imjs_project_share_client_relying_party_uri";
  public static readonly configRegion = "imjs_project_share_client_region";

  /**
   * Creates an instance of ProjectShareClient.
   * @param deploymentEnv Deployment environment.
   */
  public constructor() {
    super("v2.4");
    this.baseUrl = "https://api.bentley.com/projectshare";
  }

  protected getRelyingPartyUrl(): string {
    if (Config.App.has(ProjectShareClient.configRelyingPartyUri))
      return `${Config.App.get(ProjectShareClient.configRelyingPartyUri)}/`;

    if (Config.App.getBoolean(WsgClient.configUseHostRelyingPartyUriAsFallback, true)) {
      if (Config.App.has(WsgClient.configHostRelyingPartyUri))
        return `${Config.App.get(WsgClient.configHostRelyingPartyUri)}/`;
    }

    throw new Error(`RelyingPartyUrl not set. Set it in Config.App using key ${ProjectShareClient.configRelyingPartyUri}`);
  }

  protected getRegion(): number | undefined {
    if (Config.App.has(ProjectShareClient.configRegion))
      return Config.App.get(ProjectShareClient.configRegion);

    return undefined;
  }

  /** @internal */
  protected getUrlSearchKey(): string { assert(false, "Bentley cloud-specific method should be factored out of WsgClient base class"); return ""; }

  /**
   * Gets the default URL for the service.
   * @returns Default URL for the service.
   */
  protected getDefaultUrl(): string {
    if (Config.App.has(ProjectShareClient.configURL))
      return Config.App.get(ProjectShareClient.configURL);

    throw new Error(`Service URL not set. Set it in Config.App using key ${ProjectShareClient.configURL}`);
  }

  /**
   * Gets the URL of the service.
   * Attempts to discover and cache the URL from the URL Discovery Service. If not
   * found uses the default URL provided by client implementations. Note that for consistency
   * sake, the URL is stripped of any trailing "/"
   * @param excludeApiVersion Pass true to optionally exclude the API version from the URL.
   * @returns URL for the service
   */
  public override async getUrl(requestContext: AuthorizedClientRequestContext, excludeApiVersion?: boolean): Promise<string> {
    requestContext.enter();
    if (this._url)
      return this._url;

    this._url = await super.getUrl(requestContext, excludeApiVersion);
    requestContext.enter();

    // Handle proxy in UN
    // if (window.location.href.includes("localhost"))
    //  this._url = "http://localhost:3001/" + this._url;
    return this._url;
  }

  /**
   * Get folders that meet the specified query
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param query ProjectShareQuery
   */
  public async getFolders(requestContext: AuthorizedClientRequestContext, contextId: GuidString, query: ProjectShareQuery): Promise<ProjectShareFolder[]> {
    requestContext.enter();
    const url = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/Folder`;
    return this.getInstances<ProjectShareFolder>(requestContext, ProjectShareFolder, url, query.getQueryOptions());
  }

  /**
   * Get files as specified by the query
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param query ProjectShareQuery
   * @note The accessUrl in a ProjectShareFile is only valid for one hour after it has been initialized by the server.
   */
  public async getFiles(requestContext: AuthorizedClientRequestContext, contextId: GuidString, query: ProjectShareQuery): Promise<ProjectShareFile[]> {
    requestContext.enter();
    const url = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/File/`;
    return this.getInstances<ProjectShareFile>(requestContext, ProjectShareFile, url, query.getQueryOptions());
  }

  /**
   * Reads a file as a byte array
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param file ProjectShare file (should include the accessUrl property pointing to the download URL)
   * @note For use only in node.js. @see readFile for use in the browser
   */
  public async readFileNodeJs(requestContext: AuthorizedClientRequestContext, file: ProjectShareFile): Promise<Uint8Array> {
    requestContext.enter();
    if (typeof window !== "undefined")
      throw new BentleyError(BentleyStatus.ERROR, "Method meant for node.js. For browser use readFile()");
    if (!file.accessUrl)
      throw new BentleyError(BentleyStatus.ERROR, "Supplied file must have an accessUrl", Logger.logError, loggerCategory, () => ({ ...file }));

    const options: RequestOptions = {
      method: "GET",
      responseType: "arraybuffer",
    };

    const response = await request(requestContext, file.accessUrl, options);
    requestContext.enter();

    const byteArray = new Uint8Array(response.body);
    if (!byteArray || byteArray.length === 0)
      throw new BentleyError(BentleyStatus.ERROR, "Expected an image to be returned from the query", Logger.logError, loggerCategory);

    return byteArray;
  }

  /**
   * Reads a file as a byte array
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param file ProjectShare file (should include the accessUrl property pointing to the download URL)
   * @param maxByteCount If specified the maximum number of bytes to copy from the file
   * @note For use only in the browser. @see readFileNodeJs for use in node.js
   */
  public async readFile(requestContext: AuthorizedClientRequestContext, file: ProjectShareFile, maxByteCount?: number): Promise<Uint8Array> {
    requestContext.enter();
    if (typeof window === "undefined")
      throw new BentleyError(BentleyStatus.ERROR, "Method meant only for browser use. For node.js use call readFileNodeJs()", Logger.logError, loggerCategory);
    if (!file.accessUrl)
      throw new BentleyError(BentleyStatus.ERROR, "Supplied file must have an accessUrl", Logger.logError, loggerCategory, () => ({ ...file }));

    const requestInit = maxByteCount === undefined ? undefined : {
      headers: {
        Range: `bytes=0-${maxByteCount}`, // eslint-disable-line @typescript-eslint/naming-convention
      },
    };
    const response: Response = await fetch(file.accessUrl, requestInit);
    if (!response.body)
      throw new BentleyError(BentleyStatus.ERROR, "Empty file", Logger.logError, loggerCategory, () => ({ ...file }));

    const reader = response.body.getReader();

    // Determine size of stream from "Content-Length" in headers, or meta data on file
    const contentLengthStr = response.headers.get("Content-Length");
    const totalByteCount = contentLengthStr ? +contentLengthStr : file.size;
    if (totalByteCount === undefined)
      throw new BentleyError(BentleyStatus.ERROR, "Could not determine size of file", Logger.logError, loggerCategory, () => ({ ...file }));

    const copyByteCount = maxByteCount ? Math.min(totalByteCount, maxByteCount) : totalByteCount;
    const retArray = new Uint8Array(copyByteCount);
    let offset = 0;
    while (offset < copyByteCount) {
      const { done, value: chunk } = await reader.read();
      if (done || !chunk)
        break;

      const byteLengthToCopy = Math.min(chunk.byteLength, copyByteCount - offset);
      const srcView = new Uint8Array(chunk.buffer, 0, byteLengthToCopy);
      retArray.set(srcView, offset);

      offset = offset + byteLengthToCopy;
    }

    if (offset < copyByteCount)
      throw new BentleyError(BentleyStatus.ERROR, "Error reading file", Logger.logError, loggerCategory, () => ({ ...file, expectedByteCount: copyByteCount, actualByteCount: offset }));

    return retArray;
  }

  /**
   * Create, update or delete custom properties in a file, and return the new state of the file.
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param file ProjectShareFile
   * @param updateProperties Array of Name-Value pairs describing creates and updates
   * <pre><code>
   * e.g.,
   * [{
   *      "Name": "Reviewer",
   *      "Value": "Bob"
   *  },
   *  {
   *      "Name": "Version",
   *      "Value": "2.0"
   *  }]
   * </code></pre>
   * @param deleteProperties Array of names of custom properties to delete
   * @return The instance after the changes
   */
  public async updateCustomProperties(requestContext: AuthorizedClientRequestContext, contextId: GuidString, file: ProjectShareFile, updateProperties?: Array<{ Name: string, Value: string }>, deleteProperties?: string[]): Promise<ProjectShareFile> {  // eslint-disable-line @typescript-eslint/naming-convention
    requestContext.enter();

    const customProperties: any[] = updateProperties === undefined ? new Array<any>() : updateProperties;
    if (deleteProperties) {
      deleteProperties.forEach((value: string) => customProperties.push({
        Name: value,  // eslint-disable-line @typescript-eslint/naming-convention
        IsDeleted: true,  // eslint-disable-line @typescript-eslint/naming-convention
      }));
    }

    if (customProperties.length === 0)
      throw new BentleyError(BentleyStatus.ERROR, "No updates or deletes specified", Logger.logError, loggerCategory, () => ({ ...file }));

    const updateInstance = new ProjectShareFile();
    updateInstance.wsgId = file.wsgId;
    updateInstance.changeState = "modified"; // TBD: Not sure why we need this to be setup.
    updateInstance.customProperties = customProperties;

    const projectShareRequestOptions = {
      CustomOptions: {  // eslint-disable-line @typescript-eslint/naming-convention
        EnableAdHocChangeset: true,  // eslint-disable-line @typescript-eslint/naming-convention
      },
    };

    const relativeUrl = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/File/${file.wsgId}`;
    return this.postInstance<ProjectShareFile>(requestContext, ProjectShareFile, relativeUrl, updateInstance, projectShareRequestOptions);
  }

  /**
   * Create new folder.
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param parentFolderId Id of the folder where we need to upload that folder.
   * @param folder ProjectShareFolder
   * @return The instance after the changes
   * @note If Folder already exist with that name then it create a Folder with same name and append index in brackets.
   */
  public async createFolder(requestContext: AuthorizedClientRequestContext, contextId: GuidString, parentFolderId: GuidString, folder: ProjectShareFolder): Promise<ProjectShareFolder> {
    const parentFolder = new ProjectShareFolder();
    parentFolder.wsgId = parentFolderId;
    parentFolder.changeState = "existing";
    const mappedFolder: any = ECJsonTypeMap.toJson<ProjectShareFolder>("wsg", parentFolder);
    folder.parentFolder = mappedFolder;
    const relativeUrl = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/Folder/`;
    return this.postInstance<ProjectShareFolder>(requestContext, ProjectShareFolder, relativeUrl, folder);
  }

  /**
   * upload a file with file existing property set to false, and return the new state of the file.
   * file existing property need to update after content uploaded in file.
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param folderId Id of the folder where we need to upload that file.
   * @param file ProjectShareFile
   * @return The instance after the changes
   * @note If File already exist with that name then it create a file with same name and append index in brackets.
   */
  public async createFile(requestContext: AuthorizedClientRequestContext, contextId: GuidString, folderId: GuidString, file: ProjectShareFile): Promise<ProjectShareFile> {
    const folder = new ProjectShareFolder();
    folder.wsgId = folderId;
    folder.changeState = "existing";
    const mappedFolder: any = ECJsonTypeMap.toJson<ProjectShareFolder>("wsg", folder);
    const updateInstance = new ProjectShareFile();
    updateInstance.fileExists = false;
    updateInstance.size = file.size;
    updateInstance.name = file.name;
    updateInstance.description = file.description;
    updateInstance.parentFolder = mappedFolder;
    const relativeUrl = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/File/`;
    return this.postInstance<ProjectShareFile>(requestContext, ProjectShareFile, relativeUrl, updateInstance);
  }

  /**
   * upload the content in the file by using Files access url.
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param file ProjectShareFile
   * @param path
   * @return The instance after the changes
   */
  public async uploadContentInFile(requestContext: AuthorizedClientRequestContext, contextId: GuidString, file: ProjectShareFile, data: string): Promise<ProjectShareFile> {
    try {
      const accessurl = file.accessUrl !== undefined ? file.accessUrl : "";
      await this.uploadBlob(requestContext, accessurl, data);
      return await this.updateFileExistsProperty(requestContext, contextId, file.wsgId);
    } catch (err) {
      throw err;
    }
  }

  /**
   * Update file existing property to true so its available in folder,and return the new state of the file.
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param fileId Id of the file
   * @return The instance after the changes
   */
  private async updateFileExistsProperty(requestContext: AuthorizedClientRequestContext, contextId: GuidString, fileId: GuidString): Promise<ProjectShareFile> {
    const updateInstance = new ProjectShareFile();
    updateInstance.instanceId = fileId;
    updateInstance.fileExists = true;
    updateInstance.changeState = "modified";

    const relativeUrl = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/File/${fileId}`;
    return this.postInstance<ProjectShareFile>(requestContext, ProjectShareFile, relativeUrl, updateInstance);
  }

  /**
   * Delete folder permanently or send folder to recycle bin.
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param folderId of the folder you want to delete.
   * @param deleteOption By default delete folder permanently.
   */
  public async deleteFolder(requestContext: AuthorizedClientRequestContext, contextId: GuidString, folderId: GuidString, deleteOption: RecycleOption = RecycleOption.DeletePermanently): Promise<ProjectShareFile | void> {
    const url = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/Folder/${folderId}`;
    switch (deleteOption) {
      case RecycleOption.DeletePermanently:
        return this.deleteInstance<ProjectShareFolder>(requestContext, url);
      case RecycleOption.SendToRecycleBin:
        const updateInstance = new ProjectShareFolder();
        updateInstance.instanceId = folderId;
        updateInstance.changeState = "modified";
        const projectShareRequestOptions = {
          CustomOptions: { // eslint-disable-line @typescript-eslint/naming-convention
            IsDeleted: true, // eslint-disable-line @typescript-eslint/naming-convention
          },
        };
        return this.postInstance<ProjectShareFolder>(requestContext, ProjectShareFolder, url, updateInstance, projectShareRequestOptions);
    }
  }

  /**
   * Delete file permanently or send file to recyle bin.
   * @param requestContext Client request context that includes the authorization information to access Project Share.
   * @param contextId Context Id (e.g., projectId or assetId)
   * @param fileId Id of the file you want to delete.
   * @param deleteOption By default delete file permanently.
   */
  public async deleteFile(requestContext: AuthorizedClientRequestContext, contextId: GuidString, fileId: GuidString, deleteOption: RecycleOption = RecycleOption.DeletePermanently): Promise<ProjectShareFile | void> {
    const url = `/repositories/BentleyCONNECT.ProjectShareV2--${contextId}/ProjectShare/File/${fileId}`;
    switch (deleteOption) {
      case RecycleOption.DeletePermanently:
        return this.deleteInstance<ProjectShareFile>(requestContext, url);
      case RecycleOption.SendToRecycleBin:
        const updateInstance = new ProjectShareFile();
        updateInstance.instanceId = fileId;
        updateInstance.changeState = "modified";
        const projectShareRequestOptions = {
          CustomOptions: { // eslint-disable-line @typescript-eslint/naming-convention
            IsDeleted: true, // eslint-disable-line @typescript-eslint/naming-convention
          },
        };
        return this.postInstance<ProjectShareFile>(requestContext, ProjectShareFile, url, updateInstance, projectShareRequestOptions);
    }
  }

  /** Used by clients to Upload Content into file.
   * @param uploadUrlString Saas Url of File.
   * @param uploadData Content to Upload .
   */
  private async uploadBlob(requestContext: AuthorizedClientRequestContext, uploadUrlString: string, uploadData: string): Promise<void> {
    requestContext.enter();
    const options: RequestOptions = {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
      },
      body: uploadData,
    };

    const uploadUrl = `${uploadUrlString}`;
    return request(requestContext, uploadUrl, options).then(async () => Promise.resolve());
  }

}
