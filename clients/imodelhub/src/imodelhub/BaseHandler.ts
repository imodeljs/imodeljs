/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModelHubClient
 */
import { assert, ClientRequestContext, Config } from "@bentley/bentleyjs-core";
import {
  AuthorizedClientRequestContext, ChunkedQueryContext, DefaultWsgRequestOptionsProvider, FileHandler, HttpRequestOptions, RequestGlobalOptions, RequestOptions,
  RequestQueryOptions, WsgClient, WsgInstance, WsgRequestOptions,
} from "@bentley/itwin-client";
import { CustomRequestOptions } from "./CustomRequestOptions";
import { IModelHubError } from "./Errors";

const applicationVersionHeaderName = "Application-Version";

/**
 * Provides default options for iModelHub requests.
 */
class DefaultIModelHubRequestOptionsProvider extends DefaultWsgRequestOptionsProvider {
  public constructor(agent: any) {
    super();
    this._defaultOptions.errorCallback = IModelHubError.parse;
    this._defaultOptions.retryCallback = IModelHubError.shouldRetry;
    this._defaultOptions.agent = agent;
  }
}

/**
 * This type allows modifying HttpRequestOptions that are sent for every request.
 * @beta
 */
export type HttpRequestOptionsTransformer = (options: HttpRequestOptions) => void;

/**
 * This function when used on IModelClient adds specified header to every request.
 * @beta
 */
export function addHeader(name: string, valueFactory: () => string): HttpRequestOptionsTransformer {
  return (options: HttpRequestOptions) => {
    if (!options.headers)
      options.headers = {};
    options.headers[name] = valueFactory();
  };
}

/**
 * This function when used on IModelClient adds specified application version header to every request.
 * @beta
 */
export function addApplicationVersion(version: string) {
  return addHeader(applicationVersionHeaderName, () => version);
}

/**
 * This function when used on IModelClient adds CSRF header to every request.
 * @beta
 */
export function addCsrfHeader(headerName: string = "X-XSRF-TOKEN", cookieName: string = "XSRF-TOKEN"): HttpRequestOptionsTransformer {
  return addHeader(headerName, () => {
    return document.cookie.split("; ").find((r) => r.startsWith(`${cookieName}=`))!.split("=")[1];
  });
}

/**
 * This class acts as the WsgClient for other iModelHub Handlers.
 * @public
 */
export class IModelBaseHandler extends WsgClient {
  protected override _url?: string;
  private _defaultIModelHubOptionsProvider: DefaultIModelHubRequestOptionsProvider;
  public static readonly configRelyingPartyUri = "imjs_imodelhub_relying_party_uri";
  protected _agent: any;
  protected _fileHandler: FileHandler | undefined;
  private _customRequestOptions: CustomRequestOptions = new CustomRequestOptions();
  private _httpRequestOptionsTransformers: HttpRequestOptionsTransformer[] = [];

  /** @internal */
  protected getUrlSearchKey(): string { assert(false, "Bentley cloud-specific method should be factored out of WsgClient base class"); return ""; }

  /**
   * Create an instance of IModelBaseHandler.
   * @internal
   */
  public constructor(keepAliveDuration = 30000, fileHandler?: FileHandler) {
    super("sv1.1");
    this.baseUrl = "https://api.bentley.com/imodelhub";
    this._fileHandler = fileHandler;
    const agentOptions = { keepAlive: keepAliveDuration > 0, keepAliveMsecs: keepAliveDuration, secureProtocol: "TLSv1_2_method" };
    if (RequestGlobalOptions.httpsProxy) {
      this._agent = RequestGlobalOptions.createHttpsProxy(agentOptions);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this._agent = require("https").Agent(agentOptions);
    }
  }

  /**
   * @internal
   */
  public formatContextIdForUrl(contextId: string) { return contextId; }

  /**
   * @internal
   */
  public getFileHandler(): FileHandler | undefined { return this._fileHandler; }

  /**
   * Augment request options with defaults returned by the DefaultIModelHubRequestOptionsProvider. Note that the options passed in by clients override any defaults where necessary.
   * @param options Options the caller wants to augment with the defaults.
   * @returns Promise resolves after the defaults are setup.
   * @internal
   */
  protected override async setupOptionDefaults(options: RequestOptions): Promise<void> {
    if (!this._defaultIModelHubOptionsProvider)
      this._defaultIModelHubOptionsProvider = new DefaultIModelHubRequestOptionsProvider(this._agent);

    return this._defaultIModelHubOptionsProvider.assignOptions(options);
  }

  /**
   * Populates HTTP request options with additional data.
   * @param options Options that need to be populated.
   * @returns Options populated with additional data.
   * @internal
   */
  protected setupHttpOptions(options?: HttpRequestOptions): HttpRequestOptions {
    const httpOptions: HttpRequestOptions = { ...options };

    for (const transformer of this._httpRequestOptionsTransformers) {
      transformer(httpOptions);
    }

    return httpOptions;
  }

  /**
   * Adds a method that will be called for every request to modify HttpRequestOptions.
   * @param func Method that will be used to modify HttpRequestOptions.
   * @beta
   */
  public use(func: HttpRequestOptionsTransformer) {
    this._httpRequestOptionsTransformers.push(func);
  }

  /**
   * Gets theRelyingPartyUrl for the service.
   * @returns RelyingPartyUrl for the service.
   * @internal
   */
  protected getRelyingPartyUrl(): string {
    if (Config.App.has(IModelBaseHandler.configRelyingPartyUri))
      return `${Config.App.get(IModelBaseHandler.configRelyingPartyUri)}/`;

    if (Config.App.getBoolean(WsgClient.configUseHostRelyingPartyUriAsFallback, true)) {
      if (Config.App.has(WsgClient.configHostRelyingPartyUri))
        return `${Config.App.get(WsgClient.configHostRelyingPartyUri)}/`;
    }

    throw new Error(`RelyingPartyUrl not set. Set it in Config.App using key ${IModelBaseHandler.configRelyingPartyUri}`);
  }

  /**
   * Get the agent used for imodelhub connection pooling.
   * @returns The agent used for imodelhub connection pooling.
   * @internal
   */
  public getAgent(): any {
    return this._agent;
  }

  /**
   * Get the URL of the service. This method attempts to discover and cache the URL from the URL Discovery Service. If not found uses the default URL provided by client implementations. Note that for consistency sake, the URL is stripped of any trailing "/"
   * @returns URL for the service
   * @internal
   */
  public override async getUrl(requestContext: ClientRequestContext): Promise<string> {
    return super.getUrl(requestContext);
  }

  /**
   * Send a delete request. Sends a request without body.
   * @param requestContext The client request context
   * @param relativeUrlPath Relative path to the REST resource.
   * @param httpRequestOptions Additional options for the HTTP request.
   * @returns Promise resolves after successfully deleting REST resource at the specified path.
   */
  public override async delete(requestContext: AuthorizedClientRequestContext, relativeUrlPath: string, httpRequestOptions?: HttpRequestOptions): Promise<void> {
    return super.delete(requestContext, relativeUrlPath, this.setupHttpOptions(httpRequestOptions));
  }

  /**
   * Delete a strongly typed instance. Sends a request body with a WSG instance.
   * @param requestContext The client request context
   * @param relativeUrlPath Relative path to the REST resource.
   * @param instance Instance to be deleted.
   * @param requestOptions WSG options for the request.
   * @returns Promise resolves after successfully deleting instance.
   */
  public override async deleteInstance<T extends WsgInstance>(requestContext: AuthorizedClientRequestContext, relativeUrlPath: string, instance?: T, requestOptions?: WsgRequestOptions): Promise<void> {
    if (this._customRequestOptions.isSet) {
      if (!requestOptions) {
        requestOptions = {};
      }
      requestOptions.CustomOptions = this._customRequestOptions.insertCustomOptions(requestOptions.CustomOptions);
    }
    return super.deleteInstance<T>(requestContext, relativeUrlPath, instance, requestOptions);
  }

  /**
   * Post a strongly typed instance. Sends a request body with a WSG instance.
   * @param requestContext The client request context
   * @param typedConstructor Used to construct the resulting instances from the response.
   * @param relativeUrlPath Relative path to the REST resource.
   * @param instance Strongly typed instance to be posted.
   * @param requestOptions WSG options for the request.
   * @param httpRequestOptions Additional options for the HTTP request.
   * @returns The posted instance that's returned back from the server.
   */
  public override async postInstance<T extends WsgInstance>(requestContext: AuthorizedClientRequestContext, typedConstructor: new () => T, relativeUrlPath: string, instance: T, requestOptions?: WsgRequestOptions, httpRequestOptions?: HttpRequestOptions): Promise<T> {
    if (this._customRequestOptions.isSet) {
      if (!requestOptions) {
        requestOptions = {};
      }
      requestOptions.CustomOptions = this._customRequestOptions.insertCustomOptions(requestOptions.CustomOptions);
    }
    return super.postInstance<T>(requestContext, typedConstructor, relativeUrlPath, instance, requestOptions, this.setupHttpOptions(httpRequestOptions));
  }

  /**
   * Post multiple strongly typed instances. Sends a request body with WSG instances.
   * @param requestContext The client request context
   * @param typedConstructor Used to construct the resulting instances from the response.
   * @param relativeUrlPath Relative path to the REST resource.
   * @param instances Strongly typed instances to be posted.
   * @param requestOptions WSG options for the request.
   * @param httpRequestOptions Additional options for the HTTP request.
   * @returns The posted instances that's returned back from the server.
   */
  public override async postInstances<T extends WsgInstance>(requestContext: AuthorizedClientRequestContext, typedConstructor: new () => T, relativeUrlPath: string, instances: T[], requestOptions?: WsgRequestOptions, httpRequestOptions?: HttpRequestOptions): Promise<T[]> {
    return super.postInstances(requestContext, typedConstructor, relativeUrlPath, instances, requestOptions, this.setupHttpOptions(httpRequestOptions));
  }

  /**
   * Get multiple strongly typed instances.
   * @param requestContext The client request context
   * @param typedConstructor Used to construct the resulting instances from the response.
   * @param relativeUrlPath Relative path to the REST resource.
   * @param queryOptions Query options.
   * @param httpRequestOptions Additional options for the HTTP request.
   * @returns Array of strongly typed instances.
   */
  public override async getInstances<T extends WsgInstance>(requestContext: AuthorizedClientRequestContext, typedConstructor: new () => T, relativeUrlPath: string, queryOptions?: RequestQueryOptions, httpRequestOptions?: HttpRequestOptions): Promise<T[]> {
    return super.getInstances(requestContext, typedConstructor, relativeUrlPath, queryOptions, this.setupHttpOptions(httpRequestOptions));
  }

  /**
   * Get a chunk of strongly typed instances.
   * @param requestContext Client request context
   * @param url Full path to the REST resource.
   * @param chunkedQueryContext Chunked query context
   * @param typedConstructor Constructor function for the type
   * @param queryOptions Query options.
   * @param httpRequestOptions Additional options for the HTTP request.
   * @returns Array of strongly typed instances.
   */
  public override async getInstancesChunk<T extends WsgInstance>(requestContext: AuthorizedClientRequestContext, url: string, chunkedQueryContext: ChunkedQueryContext | undefined, typedConstructor: new () => T, queryOptions?: RequestQueryOptions, httpRequestOptions?: HttpRequestOptions): Promise<T[]> {
    return super.getInstancesChunk(requestContext, url, chunkedQueryContext, typedConstructor, queryOptions, this.setupHttpOptions(httpRequestOptions));
  }

  /**
   * Get multiple strongly typed instances. Sends query in the request's body. This can be used for queries that are too long to fit in URL.
   * @param requestContext The client request context
   * @param typedConstructor Used to construct the resulting instances from the response.
   * @param relativeUrlPath Relative path to the REST resource.
   * @param queryOptions Query options.
   * @param httpRequestOptions Additional options for the HTTP request.
   * @returns Array of strongly typed instances.
   */
  public override async postQuery<T extends WsgInstance>(requestContext: AuthorizedClientRequestContext, typedConstructor: new () => T, relativeUrlPath: string, queryOptions: RequestQueryOptions, httpRequestOptions?: HttpRequestOptions): Promise<T[]> {
    return super.postQuery(requestContext, typedConstructor, relativeUrlPath, queryOptions, this.setupHttpOptions(httpRequestOptions));
  }

  /**
   * Get an instance of CustomRequestOptions, which can be used to set custom request parameters for all future requests made by this handler.
   * @internal
   */
  public getCustomRequestOptions(): CustomRequestOptions {
    return this._customRequestOptions;
  }
}
