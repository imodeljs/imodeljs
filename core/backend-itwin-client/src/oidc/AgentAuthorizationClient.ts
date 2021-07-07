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
 * @public
 */
export interface AgentAuthorizationClientConfiguration extends BackendAuthorizationClientConfiguration {
  /**
   * Time in seconds that's used as a buffer to check the token for validity/expiry.
   * The checks for authorization, and refreshing access tokens all use this buffer - i.e., the token is considered expired if the current time is within the specified
   * time of the actual expiry.
   * @note If unspecified this defaults to 60 seconds
   */
  readonly expireSafety?: number;
}

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
 * @public
 */
export class AgentAuthorizationClient extends BackendAuthorizationClient implements AuthorizationClient {
  private _accessToken?: AccessToken;
  private _expireSafety = 60;  // validate tokens 1 minute before expiry by default

  constructor(agentConfiguration: AgentAuthorizationClientConfiguration) {
    super(agentConfiguration);
    if (agentConfiguration.expireSafety)
      this._expireSafety = agentConfiguration.expireSafety;
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
   * Refresh the access token irrespective of expiry state - returns a token that's valid for the maximum period possible
   * - Use [[AgentAuthorizationClient.getAccessToken]] to get a token for the typical cases where the method checks if the
   * token is valid before refreshing it.
   */
  public async refreshAccessToken(requestContext: ClientRequestContext): Promise<AccessToken> {
    requestContext.enter();
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

    return expiresAt.getTime() - Date.now() <= this._expireSafety * 1000;
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
