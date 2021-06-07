/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authentication
 */

import { AuthStatus, BentleyError, ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { AccessToken, AuthorizationClient } from "@bentley/itwin-client";
import { decode } from "jsonwebtoken";
import { GrantBody, TokenSet } from "openid-client";
import { BackendITwinClientLoggerCategory } from "../BackendITwinClientLoggerCategory";
import { BackendAuthorizationClient, BackendAuthorizationClientConfiguration } from "./BackendAuthorizationClient";

const loggerCategory = BackendITwinClientLoggerCategory.Authorization;

/**
 * Configuration of clients for agent or service applications.
 * @see [[AgentAuthorizationClient]] for notes on registering an application
 * @beta
 */
export type AgentAuthorizationClientConfiguration = BackendAuthorizationClientConfiguration;

/**
 * Configuration of clients for agent or service applications.
 * @see [[AgentAuthorizationClient]] for notes on registering an application
 * @deprecated Use [[AgentAuthorizationClient]] instead
 * @beta
 */
export type OidcAgentClientConfiguration = AgentAuthorizationClientConfiguration;

/**
 * Utility to generate OIDC/OAuth tokens for agent or agent applications
 * @deprecated Use [[AgentAuthorizationClient]] instead
 * @beta
 */
export type OidcAgentClient = AgentAuthorizationClient;

/**
 * Utility to generate OIDC/OAuth tokens for agent or agent applications
 * * The application must register a client using the
 * [self service registration page](https://developer.bentley.com/register/).
 * * The client type must be "Agent"
 * * Use the Client Id/Client Secret/Scopes to create the agent configuration that's passed in.
 * * Ensure the application can access the iTwin Project/Asset - in production environments, this is done by
 * using the iTwin project portal to add add the email **`{Client Id}@apps.imsoidc.bentley.com`** as an authorized user
 * with the appropriate role that includes the required access permissions.
 * @beta
 */
export class AgentAuthorizationClient extends BackendAuthorizationClient implements AuthorizationClient {
  private _accessToken?: AccessToken;

  constructor(agentConfiguration: AgentAuthorizationClientConfiguration) {
    super(agentConfiguration);
  }

  private async generateAccessToken(requestContext: ClientRequestContext): Promise<AccessToken> {
    const scope = this._configuration.scope;
    if (scope.includes("openid") || scope.includes("email") || scope.includes("profile") || scope.includes("organization"))
      throw new BentleyError(AuthStatus.Error, "Scopes for an Agent cannot include 'openid email profile organization'");

    const grantParams: GrantBody = {
      grant_type: "client_credentials", // eslint-disable-line @typescript-eslint/naming-convention
      scope,
    };

    let tokenSet: TokenSet;
    const client = await this.getClient(requestContext);
    try {
      tokenSet = await client.grant(grantParams);
    } catch (error) {
      throw new BentleyError(AuthStatus.Error, error.message || "Authorization error", Logger.logError, loggerCategory, () => ({ error: error.error, message: error.message }));
    }

    const userProfile = tokenSet.access_token
      ? decode(tokenSet.access_token, { json: true, complete: false })
      : undefined;
    this._accessToken = AccessToken.fromTokenResponseJson(tokenSet, userProfile);
    return this._accessToken;
  }

  /**
   * Get the access token
   * @deprecated Use [[AgentAuthorizationClient.getAccessToken]] instead.
   */
  public async getToken(requestContext: ClientRequestContext): Promise<AccessToken> {
    return this.generateAccessToken(requestContext);
  }

  /**
   * Refresh the access token - simply checks if the token is still valid before re-fetching a new access token
   * @deprecated Use [[AgentAuthorizationClient.getAccessToken]] instead to always get a valid token.
   */
  public async refreshToken(requestContext: ClientRequestContext, jwt: AccessToken): Promise<AccessToken> {
    requestContext.enter();

    // Refresh 1 minute before expiry
    const expiresAt = jwt.getExpiresAt();
    if (!expiresAt)
      throw new BentleyError(AuthStatus.Error, "Invalid JWT passed to refresh");
    if (expiresAt.getTime() - Date.now() > 1 * 60 * 1000)
      return jwt;

    this._accessToken = await this.generateAccessToken(requestContext);
    return this._accessToken;
  }

  /**
   * Set to true if there's a current authorized user or client (in the case of agent applications).
   * Set to true if signed in and the access token has not expired, and false otherwise.
   */
  public get isAuthorized(): boolean {
    return this.hasSignedIn && !this.hasExpired;
  }

  /** Set to true if the user has signed in, but the token has expired and requires a refresh */
  public get hasExpired(): boolean {
    if (!this._accessToken)
      return false;

    const expiresAt = this._accessToken.getExpiresAt();
    if (!expiresAt)
      throw new BentleyError(AuthStatus.Error, "Invalid JWT");

    return expiresAt.getTime() - Date.now() <= 1 * 60 * 1000; // Consider 1 minute before expiry as expired
  }

  /** Set to true if signed in - the accessToken may be active or may have expired and require a refresh */
  public get hasSignedIn(): boolean {
    return !!this._accessToken;
  }

  /** Returns a promise that resolves to the AccessToken of the currently authorized client.
   * The token is refreshed if necessary.
   */
  public async getAccessToken(requestContext?: ClientRequestContext): Promise<AccessToken> {
    if (this.isAuthorized)
      return this._accessToken!;
    return this.generateAccessToken(requestContext || new ClientRequestContext());
  }
}
