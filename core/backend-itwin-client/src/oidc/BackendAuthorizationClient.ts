/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authentication
 */

import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { ImsAuthorizationClient, RequestGlobalOptions } from "@bentley/itwin-client";
import { ClientMetadata, custom, Issuer, Client as OpenIdClient } from "openid-client";

/**
 * Client configuration to create OIDC/OAuth tokens for backend applications
 * @public
 */
export interface BackendAuthorizationClientConfiguration {
  /** Client application's identifier as registered with the Bentley IMS OIDC/OAuth2 provider. */
  clientId: string;
  /** Client application's secret key as registered with the Bentley IMS OIDC/OAuth2 provider. */
  clientSecret: string;
  /** List of space separated scopes to request access to various resources. */
  scope: string;
}

/**
 * Utility to generate OIDC/OAuth tokens for backend applications
 * @public
 */
export abstract class BackendAuthorizationClient extends ImsAuthorizationClient {
  protected _configuration: BackendAuthorizationClientConfiguration;

  /**
   * Creates an instance of BackendAuthorizationClient.
   */
  public constructor(configuration: BackendAuthorizationClientConfiguration) {
    super();

    custom.setHttpOptionsDefaults({
      timeout: RequestGlobalOptions.timeout.response,
      retry: RequestGlobalOptions.maxRetries,
      agent: RequestGlobalOptions.httpsProxy,
    });

    this._configuration = configuration;
  }

  private _issuer?: Issuer<OpenIdClient>;
  private async getIssuer(requestContext: ClientRequestContext): Promise<Issuer<OpenIdClient>> {
    requestContext.enter();

    if (this._issuer)
      return this._issuer;

    const url = await this.getUrl(requestContext);
    this._issuer = await Issuer.discover(url);
    return this._issuer;
  }

  /**
   * Discover the endpoints of the service
   */
  public async discoverEndpoints(requestContext: ClientRequestContext): Promise<Issuer<OpenIdClient>> {
    requestContext.enter();
    return this.getIssuer(requestContext);
  }

  private _client?: OpenIdClient;
  protected async getClient(requestContext: ClientRequestContext): Promise<OpenIdClient> {
    requestContext.enter();

    if (this._client)
      return this._client;

    const clientConfiguration: ClientMetadata = {
      client_id: this._configuration.clientId, // eslint-disable-line @typescript-eslint/naming-convention
      client_secret: this._configuration.clientSecret, // eslint-disable-line @typescript-eslint/naming-convention
    };

    const issuer = await this.getIssuer(requestContext);
    this._client = new issuer.Client(clientConfiguration);

    return this._client;
  }

}
