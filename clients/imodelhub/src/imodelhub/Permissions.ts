/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModelHubClient
 */

import { GuidString, Logger } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext, ECJsonTypeMap, WsgInstance } from "@bentley/itwin-client";
import { IModelHubClientLoggerCategory } from "../IModelHubClientLoggerCategories";
import { IModelBaseHandler } from "./BaseHandler";

const loggerCategory: string = IModelHubClientLoggerCategory.IModelHub;

/**
 * iModelHub iModel Permissions
 * @internal
 */
@ECJsonTypeMap.classToJson("wsg", "iModelScope.Permission", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class IModelPermissions extends WsgInstance {
  /** Allows to view iModel in web browser, but does not allow to get its local copy. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.WebView")
  public webView?: string;

  /** Allows to open and view an iModel only in read-only state. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Read")
  public read?: string;

  /** Allows to make changes to an iModel and create/modify named versions. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Write")
  public write?: string;

  /** Allows to manage locks, codes or local copies for the entire iModel. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Manage")
  public manage?: string;
}

/**
 * Handler for managing permissions. Use [[IModelHubClient.permissions]] to get an instance of this class.
 * @internal
 */
export class PermissionHandler {
  private _handler: IModelBaseHandler;

  /**
   * Constructor for PermissionHandler.
   * @param handler Handler for WSG requests.
   * @internal
   */
  constructor(handler: IModelBaseHandler) {
    this._handler = handler;
  }

  /**
   * Get user permissions of an specified iModel.
   * Use [[PermissionHandler.getContextPermissions]] to check CONNECT context level permissions.
   * @param requestContext The client request context.
   * @param imodelId Id of the specified iModel.
   */
  public async getiModelPermissions(requestContext: AuthorizedClientRequestContext, imodelId: GuidString): Promise<IModelPermissions> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Querying permissions for iModel", () => ({ iModelId: imodelId }));

    const permissions: IModelPermissions[] = await this._handler.getInstances<IModelPermissions>(requestContext, IModelPermissions, `/Repositories/iModel--${imodelId}/iModelScope/Permission`);
    return permissions[0];
  }
}
