/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OIDC
 */

import { assert } from "@bentley/bentleyjs-core";
import { NativeAppAuthorizationBackend } from "@bentley/imodeljs-backend";
import { NativeAppAuthorizationConfiguration } from "@bentley/imodeljs-common";
import { AccessToken, AccessTokenProps, UserInfo } from "@bentley/itwin-client";
import { MobileHost } from "./MobileHost";

/** Utility to provide OIDC/OAuth tokens from native ios app to frontend
 * @internal
 */
export class MobileAuthorizationBackend extends NativeAppAuthorizationBackend {
  public static defaultRedirectUri = "imodeljs://app/signin-callback";
  public get redirectUri() { return this.config?.redirectUri ?? MobileAuthorizationBackend.defaultRedirectUri; }

  public constructor(config?: NativeAppAuthorizationConfiguration) {
    super(config);
  }

  /** Used to initialize the client - must be awaited before any other methods are called */
  public override async initialize(config?: NativeAppAuthorizationConfiguration): Promise<void> {
    await super.initialize(config);
    assert(this.config !== undefined && this.issuerUrl !== undefined, "URL of authorization provider was not initialized");

    MobileHost.device.authStateChanged = (tokenString?: string) => {
      let token: AccessToken | undefined;
      if (tokenString) {
        const tokenJson = JSON.parse(tokenString) as AccessTokenProps;
        // Patch user info
        if (typeof tokenJson.userInfo === "undefined")
          tokenJson.userInfo = { id: "" };
        else
          tokenJson.userInfo = UserInfo.fromTokenResponseJson(tokenJson.userInfo);

        token = AccessToken.fromJson(tokenJson);
      }
      this.setAccessToken(token);
    };

    return new Promise<void>((resolve, reject) => {
      assert(this.config !== undefined);
      MobileHost.device.authInit(this.getClientRequestContext(), { ...this.config, issuerUrl: this.issuerUrl }, (err?: string) => {
        if (!err) {
          resolve();
        } else {
          reject(new Error(err));
        }
      });
    });
  }

  /** Start the sign-in process */
  public async signIn(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      MobileHost.device.authSignIn(this.getClientRequestContext(), (err?: string) => {
        if (!err) {
          resolve();
        } else {
          reject(new Error(err));
        }
      });
    });
  }

  /** Start the sign-out process */
  public async signOut(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      MobileHost.device.authSignOut(this.getClientRequestContext(), (err?: string) => {
        if (!err) {
          resolve();
        } else {
          reject(new Error(err));
        }
      });
    });
  }

  /** return accessToken */
  public async refreshToken(): Promise<AccessToken> {
    return new Promise<AccessToken>((resolve, reject) => {
      MobileHost.device.authGetAccessToken(this.getClientRequestContext(), (tokenString?: string, err?: string) => {
        if (!err && tokenString) {
          resolve(AccessToken.fromJson(JSON.parse(tokenString) as AccessTokenProps));
        } else {
          reject(new Error(err));
        }
      });
    });
  }
}
