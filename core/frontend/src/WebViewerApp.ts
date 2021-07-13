/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModelApp
 */

import { ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { BrowserAuthorizationCallbackHandler, BrowserAuthorizationClient, BrowserAuthorizationClientConfiguration } from "@bentley/frontend-authorization-client";
import { BentleyCloudRpcManager, BentleyCloudRpcParams, RpcRoutingToken } from "@bentley/imodeljs-common";
import { loggerCategory } from "./extension/Extension";
import { IModelApp, IModelAppOptions } from "./IModelApp";

/**
 * Options for [[WebViewerApp.startup]]
 * @beta
 */
export interface WebViewerAppOpts {
  iModelApp?: IModelAppOptions;
  webViewerApp: {
    rpcParams: BentleyCloudRpcParams;
    routing?: RpcRoutingToken;
    /** if present, IModelApp.authorizationClient will be set to an instance of BrowserAuthorizationClient */
    authConfig?: BrowserAuthorizationClientConfiguration;
  };
}

/**
 * The frontend of apps with a shared backend for visualization of iModels. WebViewerApps may only open
 * iModels readonly, and may not use Ipc.
 * @beta
 */
export class WebViewerApp {

  private static _isValid = false;
  private static get isValid() { return this._isValid; }

  public static async startup(opts: WebViewerAppOpts) {
    if (!this.isValid) {
      this._isValid = true;
      const params = opts.webViewerApp;
      BentleyCloudRpcManager.initializeClient(params.rpcParams, opts.iModelApp?.rpcInterfaces ?? [], params.routing);
    }

    if (opts.webViewerApp.authConfig) {
      /** Handle any redirects as part of the signIn process
       * Note: As part of the standard redirected signIn process when authorizing Single Page Applications, the authorization provider instructs the
       * browser to reload the page with the redirect URL -- when that happens, the code below intervenes to create and save the access token, and then
       * finishes the authorization process by making a final redirection */
      const redirectUrl = opts.webViewerApp.authConfig.redirectUri;
      const urlObj = new URL(redirectUrl);
      if (urlObj.pathname === window.location.pathname) {
        await BrowserAuthorizationCallbackHandler.handleSigninCallback(redirectUrl);
        return;
      }
    }

    await IModelApp.startup(opts.iModelApp);

    if (opts.webViewerApp.authConfig) {
      const auth = new BrowserAuthorizationClient(opts.webViewerApp.authConfig);
      IModelApp.authorizationClient = auth;

      if (!opts.webViewerApp.authConfig.noSilentSignInOnAppStartup) {
        try {
          await auth.signInSilent(new ClientRequestContext());
        } catch (err) {
          Logger.logWarning(loggerCategory, "Failed to silently sign in", () => ({ message: err.toString() }));
        }
      }
    }
  }

  public static async shutdown() {
    // don't set isValid = false, we can only call BentleyCloudRpcManager.initializeClient once
    await IModelApp.shutdown();
  }
}

