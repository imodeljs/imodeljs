/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

/** @packageDocumentation
 * @module Authentication
 */

// cSpell:ignore openid appauth signin Pkce Signout
/* eslint-disable @typescript-eslint/naming-convention */

import { assert, AuthStatus, BentleyError, ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { IModelHost, NativeAppAuthorizationBackend, NativeHost } from "@bentley/imodeljs-backend";
import { NativeAppAuthorizationConfiguration } from "@bentley/imodeljs-common";
import { AccessToken, request as httpRequest, RequestOptions } from "@bentley/itwin-client";
import {
  AuthorizationError, AuthorizationNotifier, AuthorizationRequest, AuthorizationRequestJson, AuthorizationResponse, AuthorizationServiceConfiguration,
  BaseTokenRequestHandler, GRANT_TYPE_AUTHORIZATION_CODE, GRANT_TYPE_REFRESH_TOKEN, RevokeTokenRequest, RevokeTokenRequestJson, StringMap,
  TokenRequest, TokenRequestHandler, TokenRequestJson, TokenResponse,
} from "@openid/appauth";
import { NodeCrypto, NodeRequestor } from "@openid/appauth/built/node_support";
import { ElectronAuthorizationEvents } from "./ElectronAuthorizationEvents";
import { ElectronAuthorizationRequestHandler } from "./ElectronAuthorizationRequestHandler";
import { ElectronTokenStore } from "./ElectronTokenStore";
import { LoopbackWebServer } from "./LoopbackWebServer";

const loggerCategory = "electron-auth";

/**
 * Utility to generate OIDC/OAuth tokens for Desktop Applications
 * @beta
 */
export class ElectronAuthorizationBackend extends NativeAppAuthorizationBackend {
  public static defaultRedirectUri = "http://localhost:3000/signin-callback";
  private _configuration: AuthorizationServiceConfiguration | undefined;
  private _tokenResponse: TokenResponse | undefined;
  private _tokenStore?: ElectronTokenStore;
  public get tokenStore() { return this._tokenStore!; }

  public constructor(config?: NativeAppAuthorizationConfiguration) {
    super(config);
  }

  public get redirectUri() { return this.config?.redirectUri ?? ElectronAuthorizationBackend.defaultRedirectUri; }

  /**
   * Used to initialize the client - must be awaited before any other methods are called.
   * The call attempts a silent sign-if possible.
   */
  public async initialize(config?: NativeAppAuthorizationConfiguration): Promise<void> {
    await super.initialize(config);
    assert(this.config !== undefined && this.issuerUrl !== undefined, "URL of authorization provider was not initialized");

    this._tokenStore = new ElectronTokenStore(this.config.clientId);

    const tokenRequestor = new NodeRequestor(); // the Node.js based HTTP client
    this._configuration = await AuthorizationServiceConfiguration.fetchFromIssuer(this.issuerUrl, tokenRequestor);
    Logger.logTrace(loggerCategory, "Initialized service configuration", () => ({ configuration: this._configuration }));

    // Attempt to load the access token from store
    await this.loadAccessToken();
  }

  /** Refresh the access token */
  public async refreshToken(): Promise<AccessToken> {
    if (this._tokenResponse === undefined || this._tokenResponse.refreshToken === undefined)
      throw new BentleyError(AuthStatus.Error, "Not signed In. First call signIn()", Logger.logError, loggerCategory);

    return this.refreshAccessToken(this._tokenResponse.refreshToken);
  }

  /** Loads the access token from the store, and refreshes it if necessary and possible
   * @return AccessToken if it's possible to get a valid access token, and undefined otherwise.
   */
  private async loadAccessToken(): Promise<AccessToken | undefined> {
    const tokenResponse = await this.tokenStore.load();
    if (tokenResponse === undefined || tokenResponse.refreshToken === undefined)
      return undefined;
    try {
      return await this.refreshAccessToken(tokenResponse.refreshToken);
    } catch (err) {
      Logger.logError(loggerCategory, `Error refreshing access token`, () => err);
      return undefined;
    }
  }

  /**
   * Sign-in completely.
   * This is a wrapper around [[signIn]] - the only difference is that the promise resolves
   * with the access token after sign in is complete and successful.
   */
  public async signInComplete(): Promise<AccessToken> {
    return new Promise<AccessToken>((resolve, reject) => {
      NativeHost.onUserStateChanged.addOnce((token) => {
        if (token !== undefined) {
          resolve(token);
        } else {
          reject(new Error("Failed to sign in"));
        }
      });
      this.signIn().catch((err) => reject(err));
    });
  }

  /**
   * Start the sign-in process
   * - calls the onUserStateChanged() call back after the authorization completes
   * or if there is an error.
   * - will attempt in order:
   *   (i) load any existing authorized user from storage,
   *   (ii) an interactive signin that requires user input.
   */
  public async signIn(): Promise<void> {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()", Logger.logError, loggerCategory);
    assert(this.config !== undefined);

    // Attempt to load the access token from store
    const token = await this.loadAccessToken();
    if (token)
      return this.setAccessToken(token);

    // Create the authorization request
    const nativeConfig = this.config;
    const authReqJson: AuthorizationRequestJson = {
      client_id: nativeConfig.clientId,
      redirect_uri: this.redirectUri,
      scope: nativeConfig.scope,
      response_type: AuthorizationRequest.RESPONSE_TYPE_CODE,
      extras: { prompt: "consent", access_type: "offline" },
    };
    const authorizationRequest = new AuthorizationRequest(authReqJson, new NodeCrypto(), true /* = usePkce */);
    await authorizationRequest.setupCodeVerifier();

    // Create events for this signin attempt
    const authorizationEvents = new ElectronAuthorizationEvents();

    // Ensure that completion callbacks are correlated to the correct authorization request
    LoopbackWebServer.addCorrelationState(authorizationRequest.state, authorizationEvents);

    // Start a web server to listen to the browser requests
    LoopbackWebServer.start(nativeConfig);

    const authorizationHandler = new ElectronAuthorizationRequestHandler(authorizationEvents);

    // Setup a notifier to obtain the result of authorization
    const notifier = new AuthorizationNotifier();
    authorizationHandler.setAuthorizationNotifier(notifier);
    notifier.setAuthorizationListener(async (authRequest: AuthorizationRequest, authResponse: AuthorizationResponse | null, authError: AuthorizationError | null) => {
      Logger.logTrace(loggerCategory, "Authorization listener invoked", () => ({ authRequest, authResponse, authError }));

      const tokenResponse = await this._onAuthorizationResponse(authRequest, authResponse, authError);

      authorizationEvents.onAuthorizationResponseCompleted.raiseEvent(authError ? authError : undefined);

      if (!tokenResponse)
        await this.clearTokenResponse();
      else
        await this.setTokenResponse(tokenResponse);
    });

    // Start the signin
    await authorizationHandler.performAuthorizationRequest(this._configuration, authorizationRequest);
  }

  private async _onAuthorizationResponse(authRequest: AuthorizationRequest, authResponse: AuthorizationResponse | null, authError: AuthorizationError | null): Promise<TokenResponse | undefined> {

    // Phase 1 of login has completed to fetch the authorization code - check for errors
    if (authError) {
      Logger.logError(loggerCategory, "Authorization error. Unable to get authorization code.", () => authError);
      return undefined;
    }

    if (!authResponse || authResponse.state !== authRequest.state) {
      Logger.logError(loggerCategory, "Authorization error. Unable to get authorization code", () => ({
        error: "invalid_state",
        errorDescription: "The login response state did not match the login request state.",
      }));
      return undefined;
    }

    // Phase 2: Swap the authorization code for the access token
    const tokenResponse = await this.swapAuthorizationCodeForTokens(authResponse.code, authRequest.internal!.code_verifier);
    Logger.logTrace(loggerCategory, "Authorization completed, and issued access token");
    return tokenResponse;
  }

  /**
   * Start the sign-out process
   * - calls the onUserStateChanged() call back after the authorization completes
   *   or if there is an error.
   * - redirects application to the postSignoutRedirectUri specified in the configuration when the sign out is
   *   complete
   */
  public async signOut(): Promise<void> {
    await this.makeRevokeTokenRequest();
  }

  /**
   * Sign out completely
   * This is a wrapper around [[signOut]] - the only difference is that the promise resolves
   * after the sign out is complete.
   */
  public async signOutComplete(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      NativeHost.onUserStateChanged.addOnce((token) => {
        if (token === undefined) {
          resolve();
        } else {
          reject(new Error("Failed to sign out"));
        }
      });
      this.signOut().catch((err) => reject(err));
    });
  }

  private async getUserProfile(tokenResponse: TokenResponse): Promise<any | undefined> {
    const options: RequestOptions = {
      method: "GET",
      headers: {
        authorization: `Bearer ${tokenResponse.accessToken}`,
      },
      accept: "application/json",
    };

    const httpContext = ClientRequestContext.fromJSON(IModelHost.session);
    const response = await httpRequest(httpContext, this._configuration!.userInfoEndpoint!, options);
    return response?.body;
  }

  private async createAccessTokenFromResponse(tokenResponse: TokenResponse): Promise<AccessToken> {
    const profile = await this.getUserProfile(tokenResponse);

    const json = {
      access_token: tokenResponse.accessToken,
      expires_at: tokenResponse.issuedAt + (tokenResponse.expiresIn ?? 0),
      expires_in: tokenResponse.expiresIn,
    };

    return AccessToken.fromTokenResponseJson(json, profile);
  }

  private async clearTokenResponse() {
    this._tokenResponse = undefined;
    await this.tokenStore.delete();
    this.setAccessToken(undefined);
  }

  private async setTokenResponse(tokenResponse: TokenResponse): Promise<AccessToken> {
    const accessToken = await this.createAccessTokenFromResponse(tokenResponse);
    this._tokenResponse = tokenResponse;
    await this.tokenStore.save(this._tokenResponse);
    this.setAccessToken(accessToken);
    return accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<AccessToken> {
    const tokenResponse = await this.makeRefreshAccessTokenRequest(refreshToken);
    Logger.logTrace(loggerCategory, "Refresh token completed, and issued access token");
    return this.setTokenResponse(tokenResponse);
  }

  /** Swap the authorization code for a refresh token and access token */
  private async swapAuthorizationCodeForTokens(authCode: string, codeVerifier: string): Promise<TokenResponse> {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()", Logger.logError, loggerCategory);
    assert(this.config !== undefined);

    const nativeConfig = this.config;
    const extras: StringMap = { code_verifier: codeVerifier };
    const tokenRequestJson: TokenRequestJson = {
      grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
      code: authCode,
      redirect_uri: this.redirectUri,
      client_id: nativeConfig.clientId,
      extras,
    };

    const tokenRequest = new TokenRequest(tokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(tokenRequestor);
    return tokenHandler.performTokenRequest(this._configuration, tokenRequest);
  }

  private async makeRefreshAccessTokenRequest(refreshToken: string): Promise<TokenResponse> {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()", Logger.logError, loggerCategory);
    assert(this.config !== undefined);

    const tokenRequestJson: TokenRequestJson = {
      grant_type: GRANT_TYPE_REFRESH_TOKEN,
      refresh_token: refreshToken,
      redirect_uri: this.redirectUri,
      client_id: this.config.clientId,
    };

    const tokenRequest = new TokenRequest(tokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(tokenRequestor);
    return tokenHandler.performTokenRequest(this._configuration, tokenRequest);
  }

  private async makeRevokeTokenRequest(): Promise<void> {
    if (!this._tokenResponse)
      throw new BentleyError(AuthStatus.Error, "Missing refresh token. First call signIn() and ensure it's successful", Logger.logError, loggerCategory);
    assert(this.config !== undefined);

    const refreshToken = this._tokenResponse.refreshToken!;

    const revokeTokenRequestJson: RevokeTokenRequestJson = {
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: this.config.clientId,
    };

    const revokeTokenRequest = new RevokeTokenRequest(revokeTokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(tokenRequestor);
    await tokenHandler.performRevokeTokenRequest(this._configuration!, revokeTokenRequest);

    Logger.logTrace(loggerCategory, "Authorization revoked, and removed access token");
    await this.clearTokenResponse();
  }
}
