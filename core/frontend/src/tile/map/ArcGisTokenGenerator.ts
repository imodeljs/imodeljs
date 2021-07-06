/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { request, RequestOptions } from "@bentley/itwin-client";
import { FrontendRequestContext } from "../../imodeljs-frontend";

/** @packageDocumentation
 * @module Tiles
 */

/** @internal */
export interface ArcGisOAuth2Token {
  // The generated token.
  token: string;

  // The expiration time of the token in milliseconds
  expires: number;

  // This property will show as true if the token must always pass over ssl.
  ssl: boolean;

  // Username associated with this token
  userName: string;
}

export interface ArcGisToken {
  // The generated token.
  token: string;

  // The expiration time of the token in milliseconds since January 1, 1970 (UTC).
  expires: number;

  // This property will show as true if the token must always pass over ssl.
  ssl: boolean;
}

// client application's base URL, a user-specified IP address, or the IP address that is making the request.
/** @internal */
export enum ArcGisTokenClientType {
  ip,
  referer,
  requestIp,
}

/** @internal */
export interface ArcGisGenerateTokenOptions {

  // The client type that will be granted access to the token.
  // Users will be able to specify whether the token will be generated for a client application's base URL,
  // a user-specified IP address, or the IP address that is making the request.
  client: ArcGisTokenClientType;

  // The IP address that will be using the created token for access.
  // On the Generate Token page, the IP address is specified in the IP Address field. This is required when client has been set as ip.
  // Example ip=11.11.111.111
  ip?: string;

  // The base URL of the client application that will use the token.
  // On the Generate Token page, the referrer URL is specified in the Webapp URL field.
  // Defaults to location.origin if undefined and client = referer.
  // This is required when client has been set as referer.
  // Example : referer=https://myserver/mywebapp
  referer?: string;

  // The token expiration time in minutes. The default is 60 minutes (one hour).
  // The maximum expiration period is 15 days. The maximum value of the expiration time is controlled by the server.
  // Requests for tokens larger than this time will be rejected.
  // Applications are responsible for renewing expired tokens;
  // expired tokens will be rejected by the server on subsequent requests that use the token.
  expiration?: number;   // in minutes, defaults to 60 minutes
}

export interface ArcGisOAuth2CodeOptions {
  // Application client_id.
  clientId: string;

  // redirect_uri : user will be redirected to this endpoint with the authorization code.
  redirectUri: string;

  // Requested duration (in seconds) of the refresh_token. -1 = a refresh_token that will last forever. ArcGIS Online organizations can override this with a shorter duration.
  expiration: number;
}

export interface ArcGisOAuth2TokenOptions {
  // Application client_id.
  clientId: string;

  // The authorization code.
  code: string;

  // The redirect_uri used to get the authorization code.
  redirectUri: string;
}

/** @internal */
export class ArcGisTokenGenerator {
  private static readonly restApiPath = "/rest/";
  private static readonly restApiInfoPath = "info?f=pjson";

  // Cache info url to avoid fetching/parsing twice for the same base url.
  private static _tokenServiceUrlCache = new Map<string, string>();

  public static async fetchTokenServiceUrl(esriRestServiceUrl: string): Promise<string | undefined> {
    const lowerUrl = esriRestServiceUrl.toLowerCase();
    const restApiIdx = lowerUrl.indexOf(ArcGisTokenGenerator.restApiPath);
    if (restApiIdx === -1)
      return undefined;
    const infoUrl = lowerUrl.substr(0, restApiIdx + ArcGisTokenGenerator.restApiPath.length) + ArcGisTokenGenerator.restApiInfoPath;

    let tokenServicesUrl: string | undefined;
    try {
      const response = await request(new FrontendRequestContext(""), infoUrl, { method: "GET", responseType: "json" });
      tokenServicesUrl = ArcGisTokenGenerator.getTokenServiceFromInfoJson(response?.body);
    } catch (_error) {
    }
    return tokenServicesUrl;
  }

  public static getTokenServiceFromInfoJson(json: any): string | undefined {
    return json.authInfo?.isTokenBasedSecurity ? json?.authInfo?.tokenServicesUrl : undefined;
  }

  public async getTokenServiceUrl(baseUrl: string): Promise<string | undefined> {
    const cached = ArcGisTokenGenerator._tokenServiceUrlCache.get(baseUrl);
    if (cached !== undefined)
      return cached;

    const tokenServiceUrl = await ArcGisTokenGenerator.fetchTokenServiceUrl(baseUrl);
    if (tokenServiceUrl !== undefined)
      ArcGisTokenGenerator._tokenServiceUrlCache.set(baseUrl, tokenServiceUrl);

    return tokenServiceUrl;
  }

  // base url:  ArcGis REST service base URL (format must be "https://<host>/<instance>/rest/")
  public async generate(esriRestServiceUrl: string, userName: string, password: string, options: ArcGisGenerateTokenOptions): Promise<any> {
    const tokenServiceUrl = await this.getTokenServiceUrl(esriRestServiceUrl);
    if (!tokenServiceUrl)
      return undefined;

    let token: undefined;
    try {
      const encodedUsername = encodeURIComponent(userName);
      const encodedPassword = encodeURIComponent(password);

      // Compose the expiration param
      let expirationStr = "";
      if (options.expiration) {
        expirationStr = `&expiration=${options.expiration}`;
      }

      // Compose the client param
      let clientStr = "";
      if (options.client === ArcGisTokenClientType.referer) {
        let refererStr = "";
        if (options.referer === undefined) {
          refererStr = encodeURIComponent(location.origin);     // default to application origin
        } else {
          refererStr = encodeURIComponent(options.referer);
        }

        clientStr = `&client=referer&referer=${refererStr}`;
      } else if (options.client === ArcGisTokenClientType.ip) {
        if (options.ip === undefined)
          return token;
        clientStr = `&client=ip&ip=${options.ip}`;
      } else if (options.client === ArcGisTokenClientType.requestIp) {
        clientStr = `&client=requestip&ip=`;
      }

      const httpRequestOptions: RequestOptions = {
        method: "POST",
        body: `username=${encodedUsername}&password=${encodedPassword}${clientStr}${expirationStr}&f=pjson`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        responseType: "json",
      };

      const response = await request(new FrontendRequestContext(""), tokenServiceUrl, httpRequestOptions);

      // Check a token was really generated (an error could be part of the body)
      token = response?.body;

    } catch (_error) {
    }
    return token;
  }

  public static async generateOAuh2(tokenEndpoint: string, options: ArcGisOAuth2TokenOptions): Promise<any> {

    let token: undefined;
    try {
      const encodedClientId = ArcGisTokenGenerator.formEncode(options.clientId);
      const encodedCode = encodeURIComponent(options.code);
      const encodedRedirectUri = encodeURIComponent(options.redirectUri);

      const httpRequestOptions: RequestOptions = {
        method: "POST",
        body: `client_id=${encodedClientId}&code=${encodedCode}&redirect_uri=${encodedRedirectUri}&grant_type=authorization_code`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        responseType: "json",
      };

      const response = await request(new FrontendRequestContext(""), tokenEndpoint, httpRequestOptions);

      // Check a token was really generated (an error could be part of the body)
      token = response?.body;

    } catch (_error) {
    }
    return token;
  }

  // Encode following 'application/x-www-form-urlencoded' standard (https://www.w3.org/TR/html401/interact/forms.html#h-17.13.3.3)
  // Also mentioned here: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
  public static formEncode(str: string): string {
    return ArcGisTokenGenerator.rfc1738Encode(str).replace(/%20/g, "+");
  }

  // Encode following RFC1738 standard (https://www.ietf.org/rfc/rfc1738.txt)
  // Code from https://locutus.io/php/url/rawurlencode/
  public static rfc1738Encode(str: string): string {
    return encodeURIComponent(str)
      .replace(/!/g, "%21")
      .replace(/'/g, "%27")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\*/g, "%2A");
  }
}
