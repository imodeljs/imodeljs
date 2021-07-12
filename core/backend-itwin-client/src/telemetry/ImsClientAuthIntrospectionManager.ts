/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Telemetry
 */

import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ImsIntrospectionResponse } from "../oidc";
import { ClientAuthDetail, ClientAuthIntrospectionManager } from "./ClientAuthIntrospectionManager";

/**
 * @internal
 */
export class ImsClientAuthDetail extends ClientAuthDetail {
  public readonly clientAuthOrgId?: string;
  public readonly clientAuthOrgName?: string;
  public readonly clientAuthUltimateSite?: string;
  public readonly clientAuthEmail?: string;

  public constructor(response: ImsIntrospectionResponse) {
    super(response);
    this.clientAuthOrgId = response.org;
    this.clientAuthOrgName = response.org_name;
    this.clientAuthUltimateSite = response.ultimate_site;
    this.clientAuthEmail = response.email;
  }

  /**
   * Returns all known properties as a new object
   */
  public override getProperties(): { [key: string]: any } {
    const properties = super.getProperties();

    properties.clientAuthOrgId = this.clientAuthOrgId;
    properties.clientAuthOrgName = this.clientAuthOrgName;
    properties.clientAuthUltimateSite = this.clientAuthUltimateSite;
    properties.clientAuthEmail = this.clientAuthEmail;

    return properties;
  }
}

/**
 * @internal
 */
export class ImsClientAuthIntrospectionManager extends ClientAuthIntrospectionManager {
  public override async getClientAuthDetails(requestContext: AuthorizedClientRequestContext): Promise<ImsClientAuthDetail> {
    const introspectionResponse = await this.introspectionClient.introspect(requestContext);
    const clientAuthDetail = new ImsClientAuthDetail(introspectionResponse as ImsIntrospectionResponse);
    return clientAuthDetail;
  }
}
