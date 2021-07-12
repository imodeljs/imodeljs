/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iTwinServiceClients
 */
import { ClientRequestContext, Config, Logger } from "@bentley/bentleyjs-core";
import * as deepAssign from "deep-assign";
import { AuthorizedClientRequestContext } from "./AuthorizedClientRequestContext";
import { ITwinClientLoggerCategory } from "./ITwinClientLoggerCategory";
import { request, RequestGlobalOptions, RequestOptions, RequestTimeoutOptions, Response, ResponseError } from "./Request";
import { HttpRequestOptions } from "./WsgClient";

const loggerCategory: string = ITwinClientLoggerCategory.Clients;

/**
 * Provider for default RequestOptions, used by Client to set defaults.
 * @internal
 */
export class DefaultRequestOptionsProvider {
  protected _defaultOptions: RequestOptions;
  /** Creates an instance of DefaultRequestOptionsProvider and sets up the default options. */
  constructor() {
    this._defaultOptions = {
      method: "GET",
      useCorsProxy: false,
    };
  }

  /**
   * Augments options with the provider's default values.
   * @note The options passed in override any defaults where necessary.
   * @param options Options that should be augmented.
   */
  public async assignOptions(options: RequestOptions): Promise<void> {
    const clonedOptions: RequestOptions = { ...options };
    deepAssign(options, this._defaultOptions);
    deepAssign(options, clonedOptions); // ensure the supplied options override the defaults
  }
}

// @todo Setup a logging framework.
/**
 * Base class for all Client implementations
 * @beta
 */
export abstract class Client {
  private static _defaultRequestOptionsProvider: DefaultRequestOptionsProvider;
  protected _url?: string;

  /**
   * Sets the default base URL to use with this client.
   * If not set, BUDDI is used to resolve the URL using key returned by [[getUrlSearchKey]].
   */
  protected baseUrl?: string;

  /**  Creates an instance of Client. */
  protected constructor() {
  }

  /**
   * Augments request options with defaults returned by the DefaultRequestOptionsProvider.
   * @note The options passed in by clients override any defaults where necessary.
   * @param options Options the caller wants to augment with the defaults.
   * @returns Promise resolves after the defaults are setup.
   */
  protected async setupOptionDefaults(options: RequestOptions): Promise<void> {
    if (!Client._defaultRequestOptionsProvider)
      Client._defaultRequestOptionsProvider = new DefaultRequestOptionsProvider();
    return Client._defaultRequestOptionsProvider.assignOptions(options);
  }

  /**
   * Implemented by clients to specify the name/key to query the service URLs from
   * the URL Discovery Service ("Buddi")
   * @returns Search key for the URL.
   */
  protected abstract getUrlSearchKey(): string; // same as the URL Discovery Service ("Buddi") name

  /**
   * Gets the URL of the service. Attempts to discover and cache the URL from the URL Discovery Service. If not
   * found uses the default URL provided by client implementations. Note that for consistency
   * sake, the URL is stripped of any trailing "/"
   * @returns URL for the service
   */
  public async getUrl(requestContext: ClientRequestContext): Promise<string> {
    if (this._url)
      return this._url;

    if (this.baseUrl) {
      let prefix = Config.App.query("imjs_url_prefix");

      // Need to ensure the usage of the previous imjs_buddi_resolve_url_using_region to not break any
      // existing users relying on the behavior.
      // This needs to be removed...
      if (undefined === prefix) {
        const region = Config.App.query("imjs_buddi_resolve_url_using_region");
        switch (region) {
          case 102:
          case "102":
            prefix = "qa-";
            break;
          case 103:
          case "103":
            prefix = "dev-";
            break;
        }
      }

      if (prefix) {
        const baseUrl = new URL(this.baseUrl);
        baseUrl.hostname = prefix + baseUrl.hostname;
        this._url = baseUrl.href;
      } else {
        this._url = this.baseUrl;
      }
      return this._url;
    }

    const urlDiscoveryClient: UrlDiscoveryClient = new UrlDiscoveryClient();
    const searchKey: string = this.getUrlSearchKey();
    try {
      const url = await urlDiscoveryClient.discoverUrl(requestContext, searchKey, undefined);
      this._url = url;
    } catch (error) {
      throw new Error(`Failed to discover URL for service identified by "${searchKey}"`);
    }

    return this._url;
  }

  /** used by clients to send delete requests */
  protected async delete(requestContext: AuthorizedClientRequestContext, relativeUrlPath: string, httpRequestOptions?: HttpRequestOptions): Promise<void> {
    requestContext.enter();
    const url: string = await this.getUrl(requestContext) + relativeUrlPath;
    Logger.logInfo(loggerCategory, "Sending DELETE request", () => ({ url }));
    const options: RequestOptions = {
      method: "DELETE",
      headers: { authorization: requestContext.accessToken.toTokenString() },
    };
    this.applyUserConfiguredHttpRequestOptions(options, httpRequestOptions);
    await this.setupOptionDefaults(options);
    await request(requestContext, url, options);
    requestContext.enter();
    Logger.logTrace(loggerCategory, "Successful DELETE request", () => ({ url }));
  }

  /** Configures request options based on user defined values in HttpRequestOptions */
  protected applyUserConfiguredHttpRequestOptions(requestOptions: RequestOptions, userDefinedRequestOptions?: HttpRequestOptions): void {
    if (!userDefinedRequestOptions)
      return;

    if (userDefinedRequestOptions.headers) {
      requestOptions.headers = { ...requestOptions.headers, ...userDefinedRequestOptions.headers };
    }

    if (userDefinedRequestOptions.timeout) {
      this.applyUserConfiguredTimeout(requestOptions, userDefinedRequestOptions.timeout);
    }
  }

  /** Sets the request timeout based on user defined values */
  private applyUserConfiguredTimeout(requestOptions: RequestOptions, userDefinedTimeout: RequestTimeoutOptions): void {
    requestOptions.timeout = { ...requestOptions.timeout };

    if (userDefinedTimeout.response)
      requestOptions.timeout.response = userDefinedTimeout.response;

    if (userDefinedTimeout.deadline)
      requestOptions.timeout.deadline = userDefinedTimeout.deadline;
    else if (userDefinedTimeout.response) {
      const defaultNetworkOverheadBuffer = (RequestGlobalOptions.timeout.deadline as number) - (RequestGlobalOptions.timeout.response as number);
      requestOptions.timeout.deadline = userDefinedTimeout.response + defaultNetworkOverheadBuffer;
    }
  }
}

/**
 * Error for issues with authentication.
 * @beta
 */
export class AuthenticationError extends ResponseError {
}

/**
 * Client API to discover URLs from the URL Discovery service (a.k.a. Buddi service)
 * @internal
 */
export class UrlDiscoveryClient extends Client {
  public static readonly configURL = "imjs_buddi_url";
  public static readonly configResolveUrlUsingRegion = "imjs_buddi_resolve_url_using_region";
  /**
   * Creates an instance of UrlDiscoveryClient.
   */
  public constructor() {
    super();
  }

  /**
   * Gets name/key to query the service URLs from the URL Discovery Service ("Buddi")
   * @returns Search key for the URL.
   */
  protected getUrlSearchKey(): string {
    return "";
  }

  /**
   * Gets the URL for the discovery service
   * @returns URL of the discovery service.
   */
  public override async getUrl(): Promise<string> {
    return Config.App.getString(UrlDiscoveryClient.configURL, "https://buddi.bentley.com/WebService");
  }

  /**
   * Discovers a URL given the search key.
   * @param searchKey Search key registered for the service.
   * @param regionId Override region to use for URL discovery.
   * @returns Registered URL for the service.
   */
  public async discoverUrl(requestContext: ClientRequestContext, searchKey: string, regionId: number | undefined): Promise<string> {
    requestContext.enter();

    const urlBase: string = await this.getUrl();
    const url: string = `${urlBase}/GetUrl/`;
    const resolvedRegion = typeof regionId !== "undefined" ? regionId : Config.App.getNumber(UrlDiscoveryClient.configResolveUrlUsingRegion, 0);
    const options: RequestOptions = {
      method: "GET",
      qs: {
        url: searchKey,
        region: resolvedRegion,
      },
    };

    await this.setupOptionDefaults(options);
    requestContext.enter();

    const response: Response = await request(requestContext, url, options);
    requestContext.enter();

    const discoveredUrl: string = response.body.result.url.replace(/\/$/, ""); // strip trailing "/" for consistency
    return discoveredUrl;
  }
}
