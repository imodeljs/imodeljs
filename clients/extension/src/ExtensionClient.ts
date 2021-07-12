/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module ExtensionService
 */

import { assert, ClientRequestContext, ExtensionStatus } from "@bentley/bentleyjs-core";
import { IModelError } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext, Client, getArrayBuffer, request, RequestOptions, ResponseError } from "@bentley/itwin-client";
import { ExtensionFile } from "./ExtensionFile";
import { ExtensionProps, extensionPropsFromJSON } from "./ExtensionProps";

/**
 * Client for querying, publishing and deleting iModel.js Extensions.
 *
 * The `imodel-extension-service-api` OIDC scope is required for all operations and the `imodel-extension-service:modify` is
 * required for modification operations (modify, publish, and deleting).
 *
 * @beta
 */
export class ExtensionClient extends Client {
  public constructor() {
    super();
    this.baseUrl = "https://api.bentley.com/iModelExtensionService";
  }

  /** @internal */
  protected getUrlSearchKey(): string { assert(false, "Bentley cloud-specific method should be factored out of WsgClient base class"); return ""; }

  public override async getUrl(requestContext: ClientRequestContext): Promise<string> {
    if (this._url !== undefined)
      return this._url;

    await super.getUrl(requestContext);
    if (!this._url!.endsWith("/"))
      this._url! += "/";
    this._url! += "v1.0/";

    return this._url!;
  }

  private parseExtensionPropsArray(json: any): ExtensionProps[] {
    if (!(json instanceof Array))
      return [];

    const ret: ExtensionProps[] = [];
    json.forEach((extensionJson) => {
      const extension = extensionPropsFromJSON(extensionJson);
      if (extension !== undefined)
        ret.push(extension);
    });

    return ret;
  }

  /**
   * Gets information on extensions. If extensionName is undefined, will return all extensions in the context. If it's defined, will return all versions of that extension.
   * @param contextId Context Id
   * @param extensionName Extension name (optional)
   */
  public async getExtensions(requestContext: AuthorizedClientRequestContext, contextId: string, extensionName?: string): Promise<ExtensionProps[]> {
    requestContext.enter();
    const options: RequestOptions = { method: "GET" };
    await this.setupOptionDefaults(options);
    requestContext.enter();
    options.headers = { authorization: requestContext.accessToken.toTokenString() };
    try {
      const urlBase = await this.getUrl(requestContext);
      const response = await request(requestContext, `${urlBase}${contextId}/IModelExtension/${extensionName ?? ""}`, options);
      requestContext.enter();

      if (response.status !== 200)
        throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${response.status}, message: ${response.body.message}`);

      if (!(response.body instanceof Array) || response.body.length < 1)
        return [];

      return this.parseExtensionPropsArray(response.body);
    } catch (error) {
      if (!(error instanceof ResponseError))
        throw new IModelError(ExtensionStatus.UnknownError, "Unknown error getting extensions");
      if (error.status === 400)
        throw new IModelError(ExtensionStatus.BadRequest, (error as any)._data?.message);
      if (error.status === 404)
        throw new IModelError(ExtensionStatus.ExtensionNotFound, (error as any)._data?.message);

      throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${error.status}, message: ${(error as any)._data?.message}`);
    }
  }

  /**
   * Gets information about an extension's specific version
   * @param contextId Context Id
   * @param extensionName Extension name
   * @param version Extension version
   */
  public async getExtensionProps(requestContext: AuthorizedClientRequestContext, contextId: string, extensionName: string, version: string): Promise<ExtensionProps | undefined> {
    requestContext.enter();

    const options: RequestOptions = { method: "GET" };
    options.headers = { authorization: requestContext.accessToken.toTokenString() };
    await this.setupOptionDefaults(options);
    requestContext.enter();
    try {
      const urlBase = await this.getUrl(requestContext);
      const response = await request(requestContext, `${urlBase}${contextId}/IModelExtension/${extensionName}/${version}`, options);
      requestContext.enter();

      if (response.status !== 200)
        throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${response.status}, message: ${response.body.message}`);

      const body = response.body;
      if (!(body instanceof Array) || body.length < 1)
        return undefined;
      if (body.length > 1)
        throw new IModelError(ExtensionStatus.UnknownError, "Server returned too many extensions");

      return extensionPropsFromJSON(body[0]);
    } catch (error) {
      if (error instanceof IModelError)
        throw error;
      if (!(error instanceof ResponseError))
        throw new IModelError(ExtensionStatus.UnknownError, "Unknown error getting extension");
      if (error.status === 400)
        throw new IModelError(ExtensionStatus.BadRequest, (error as any)._data?.message);
      if (error.status === 404)
        throw new IModelError(ExtensionStatus.ExtensionNotFound, (error as any)._data?.message);

      throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${error.status}, message: ${(error as any)._data?.message}`);
    }
  }

  /**
   * Downloads an extension
   * @param contextId Context Id
   * @param extensionName Extension name
   * @param version Extension version
   */
  public async downloadExtension(requestContext: AuthorizedClientRequestContext, contextId: string, extensionName: string, version: string): Promise<ExtensionFile[]> {
    requestContext.enter();
    const props = await this.getExtensionProps(requestContext, contextId, extensionName, version);
    requestContext.enter();
    if (props !== undefined)
      return this.downloadExtensionFromProps(requestContext, props);

    throw new IModelError(ExtensionStatus.BadRequest, "The requested extension does not exist");
  }

  /**
   * Downloads an extension
   * @param extensionProps Extension information (should be gotten from any getExtension... methods)
   */
  private async downloadExtensionFromProps(requestContext: ClientRequestContext, extensionProps: ExtensionProps): Promise<ExtensionFile[]> {
    if (extensionProps.files.length < 1)
      return [];
    const sortedUris = extensionProps.files.sort((a, b) => a.url.localeCompare(b.url));
    const firstUri = sortedUris[0].url;
    const lastUri = sortedUris[sortedUris.length - 1].url;
    let i = 0;
    while (i < firstUri.length && firstUri[i] === lastUri[i]) i++;
    while (i > 0 && firstUri[i] !== "/") i--;
    const relativePathStart = i + 1;

    const files: ExtensionFile[] = [];

    for (i = 0; i < sortedUris.length; i++) {
      const uri = sortedUris[i].url;
      try {
        const response = await getArrayBuffer(requestContext, uri);

        const tail = uri.substr(relativePathStart);
        const fileName = decodeURIComponent(tail.substr(0, tail.indexOf("?")));

        files.push({
          fileName,
          content: response,
        });
      } catch (error) {
        throw new IModelError(ExtensionStatus.DownloadError, "Failed to download extension files from storage");
      }
    }

    return files;
  }

  /**
   * Publishes an extension to extension service
   * @param contextId Context Id
   * @param extensionName Extension name
   * @param version Extension version
   * @param checksum SHA-256 checksum of extension files archive
   * @param file Buffer containing extension files in the form of a tar archive
   * @internal
   */
  public async createExtension(requestContext: AuthorizedClientRequestContext, contextId: string, extensionName: string, version: string, checksum: string, file: Buffer) {
    requestContext.enter();

    const requestBody = {
      extensionName,
      version,
      checksum,
    };

    const options: RequestOptions = { method: "POST" };
    options.headers = { authorization: requestContext.accessToken.toTokenString() };
    options.body = requestBody;
    await this.setupOptionDefaults(options);
    requestContext.enter();

    try {
      const urlBase = await this.getUrl(requestContext);
      const response = await request(requestContext, `${urlBase + contextId}/IModelExtension`, options);
      requestContext.enter();

      if (response.status !== 200)
        throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${response.status}, message: ${response.body.message}`);

      const body = extensionPropsFromJSON(response.body);
      if (body === undefined)
        throw new IModelError(ExtensionStatus.UnknownError, "Could not save extension definition. Invalid response received");

      if (body.files.length !== 1)
        throw new IModelError(ExtensionStatus.UnknownError, "Server did not return a valid upload URI");

      await this.uploadExtension(body.files[0].url, file);
    } catch (error) {
      if (error instanceof IModelError)
        throw error;
      if (!(error instanceof ResponseError))
        throw new IModelError(ExtensionStatus.UnknownError, `Unknown error creating extension: ${error.message}`);
      if (error.status === 400)
        throw new IModelError(ExtensionStatus.BadRequest, JSON.stringify((error as any)._data));
      if (error.status === 409)
        throw new IModelError(ExtensionStatus.ExtensionAlreadyExists, "An extension with this name and version already exists");

      throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${error.status}, message: ${(error as any)._data?.message}`);
    }
  }

  private async uploadExtension(url: string, file: Buffer) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Length": file.length.toString(), // eslint-disable-line @typescript-eslint/naming-convention
        },
        body: file,
      });

      // TODO: somehow add error message...
      if (response.status !== 201)
        throw new IModelError(ExtensionStatus.UploadError, `Storage returned status: ${response.status}`);
    } catch (err) {
      throw new IModelError(ExtensionStatus.UploadError, `Unknown error uploading extension archive: ${err}`);
    }
  }

  /**
   * Deletes an extension from extension service
   * @param contextId Context Id
   * @param extensionName Extension name
   * @param version Extension version. Will delete all versions if undefined.
   */
  public async deleteExtension(requestContext: AuthorizedClientRequestContext, contextId: string, extensionName: string, version?: string) {
    requestContext.enter();

    const options: RequestOptions = { method: "DELETE" };
    options.headers = { authorization: requestContext.accessToken.toTokenString() };
    await this.setupOptionDefaults(options);
    requestContext.enter();

    try {
      let url = (await this.getUrl(requestContext)).concat(contextId, "/IModelExtension/", extensionName);
      if (version !== undefined)
        url = url.concat("/", version);
      const response = await request(requestContext, url, options);
      requestContext.enter();

      if (response.status === 400)
        throw new IModelError(ExtensionStatus.BadRequest, `Could not delete extension, message: ${response.body.message}`);
      if (response.status !== 200)
        throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${response.status}, message: ${response.body.message}`);
    } catch (error) {
      if (!(error instanceof ResponseError))
        throw new IModelError(ExtensionStatus.UnknownError, "Unknown error");
      if (error.status === 400)
        throw new IModelError(ExtensionStatus.BadRequest, (error as any)._data?.message);
      if (error.status === 404)
        throw new IModelError(ExtensionStatus.ExtensionNotFound, (error as any)._data?.message);

      throw new IModelError(ExtensionStatus.UnknownError, `Server returned status: ${error.status}, message: ${(error as any)._data?.message}`);
    }
  }
}
