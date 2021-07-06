/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent } from "@bentley/bentleyjs-core";
import { request } from "@bentley/itwin-client";
import { FrontendRequestContext } from "../../imodeljs-frontend";
import { ArcGisTokenManager } from "./ArcGisTokenManager";

export enum EsriOAuth2EndpointType {Authorize,Token}

export interface EsriOAuth2Endpoint {
  endpoint: string;
  isArcgisOnline: boolean;
}

export class EsriOAuth2 {
  public static readonly  onEsriOAuth2Callback = new BeEvent();

  private static _redirectUri: string;
  private static _expiration: number|undefined;
  private static _arcGisOnlineClientId: string;

  public static get redirectUri() {
    return EsriOAuth2._redirectUri;
  }

  public static get expiration() {
    return EsriOAuth2._expiration;
  }

  public static get arcGisOnlineClientId() {
    return EsriOAuth2._arcGisOnlineClientId;
  }

  /** Initialize ESRI OAuth2
   * @param redirectUri URI where the user is going redirected with the token
   * @param arcGisOnlineClientId Application ID that should be used to access ArcGIS Online
   * @param expiration Optional expiration after which the token will expire. Defined in minutes with a maximum of two weeks (20160 minutes).
   * @returns true if the initialized was successful otherwise false.
   */
  public static initialize(redirectUri: string, arcGisOnlineClientId?: string, expiration?: number): boolean {
    EsriOAuth2._redirectUri = redirectUri;

    // arcGisOnlineClientId is actually mandatory might become optional in the future.
    if (arcGisOnlineClientId === undefined) {
      return false;
    }
    EsriOAuth2._arcGisOnlineClientId = arcGisOnlineClientId;
    EsriOAuth2._expiration = expiration;

    // Define a global callback function that will be used by the redirect URL to pass the generated token
    (window as any).esriOAuth2Callback = (success: boolean, token?: string, expires?: number, userName?: string, ssl?: boolean, state?: string) => {
      let decodedState;
      let eventSuccess = success;
      if (success) {
        if ( token !== undefined && expires !== undefined && userName !== undefined && ssl !== undefined && state !== undefined) {
          decodedState = decodeURIComponent(state);
          ArcGisTokenManager.setOAuth2Token(decodedState, {token, expires, ssl, userName});
          console.log(`oauthCallback: token=${token} expires=${expires} userName=${userName} ssl=${ssl} state=${decodedState}`);
        } else {
          console.log(`Success but missing mandatory params`);
          eventSuccess = false;
        }
      }
      this.onEsriOAuth2Callback.raiseEvent(eventSuccess, decodedState);
    };

    return true;
  }

  // Returns the url for OAuth2 endpoint, otherwise undefined if service is not available.
  public static getOAuth2EndpointFromRestUrl(url: string, endpoint: EsriOAuth2EndpointType): EsriOAuth2Endpoint|undefined {
    const endpointStr = (endpoint === EsriOAuth2EndpointType.Authorize ? "authorize" : "token");
    const urlObj = new URL(url);
    if (urlObj.hostname.toLowerCase().endsWith("arcgis.com")) {
      // ArcGIS Online (fixed)
      // Doc: https://developers.arcgis.com/documentation/mapping-apis-and-services/security/oauth-2.0/
      return {isArcgisOnline: true, endpoint:`https://www.arcgis.com/sharing/rest/oauth2/${endpointStr}`};
    } else {
      // ArcGIS Enterprise
      // Format https://<host>:<port>/<subdirectory>/sharing/rest/oauth2/authorize
      const regExMatch =  url.match(new RegExp(/([^&\/]+)\/rest\/services\/.*/, "i"));
      if (regExMatch !== null && regExMatch.length >= 2 ) {
        const subdirectory = regExMatch[1];
        const port = (urlObj.port !== "80" && urlObj.port !=="443") ? `:${urlObj.port}` : "";
        const newUrlObj = new URL(`${urlObj.protocol}//${urlObj.hostname}${port}/${subdirectory}/sharing/rest/oauth2/${endpointStr}`);
        return ;
        return {isArcgisOnline: false, endpoint:newUrlObj.toString()};
      }
    }
    return undefined;
  }

  // Test if Oauth2 endpoint is accessible.
  public static async validateOAuth2Endpoint(url: string): Promise<boolean> {
    const data = await request(new FrontendRequestContext(""), url, { method: "GET"});

    // Oauth2 API returns 400 (Bad Request) when there are missing parameters
    return data.status === 400;
  }
}
