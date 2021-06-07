/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RbacClient
 */

import { assert, Config } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext, ECJsonTypeMap, request, Response, WsgClient, WsgInstance } from "@bentley/itwin-client";

/** RBAC permission
 * @internal
 */
@ECJsonTypeMap.classToJson("wsg", "RBAC.Permission", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class Permission extends WsgInstance {
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Name")
  public name?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Description")
  public description?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ServiceGPRId")
  public serviceGprId?: number;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.CategoryId")
  public categoryId?: number;
}

/** Client API to access the iTwin services.
 * @internal
 */
export class RbacClient extends WsgClient {
  public static readonly configRelyingPartyUri = "imjs_rbac_relying_party_uri";

  public constructor() {
    super("v2.4");
    this.baseUrl = "https://api.bentley.com/rbac";
  }

  /** @internal */
  protected getUrlSearchKey(): string { assert(false, "Bentley cloud-specific method should be factored out of WsgClient base class"); return ""; }

  /**
   * Gets theRelyingPartyUrl for the service.
   * @returns RelyingPartyUrl for the service.
   */
  protected getRelyingPartyUrl(): string {
    if (Config.App.has(RbacClient.configRelyingPartyUri))
      return `${Config.App.get(RbacClient.configRelyingPartyUri)}/`;

    if (Config.App.getBoolean(WsgClient.configUseHostRelyingPartyUriAsFallback, true)) {
      if (Config.App.has(WsgClient.configHostRelyingPartyUri))
        return `${Config.App.get(WsgClient.configHostRelyingPartyUri)}/`;
    }

    throw new Error(`RelyingPartyUrl not set. Set it in Config.App using key ${RbacClient.configRelyingPartyUri}`);
  }

  /**
   * Get the permissions of a specified project for the given service
   * @param requestContext The client request context.
   * @param projectId Id of the specified project.
   * @param serviceGPRId GPR Id of the service.
   */
  public async getPermissions(requestContext: AuthorizedClientRequestContext, projectId: string, serviceGPRId: number): Promise<Permission[]> {
    requestContext.enter();

    const userInfo = requestContext.accessToken.getUserInfo();
    if (!userInfo)
      throw new Error("Invalid access token");

    const relativeUrlPath: string = `/Repositories/BentleyCONNECT--Main/RBAC/User/${userInfo.id}/Context`;
    const url: string = await this.getUrl(requestContext) + relativeUrlPath;
    requestContext.enter();

    const filterStr = `$id+eq+'${projectId}'+and+Permission.ServiceGPRId+eq+${serviceGPRId}`;
    const options: any = {
      method: "GET",
      headers: { authorization: requestContext.accessToken.toTokenString() },
      qs: {
        $select: "Permission.*",
        $filter: filterStr,
      },
    };

    return this.executePermissionsRequest(requestContext, url, options);
  }

  /**
   * Get the permissions of the specified object
   * @param requestContext The client request context.
   * @param objectId Id of the specified object.
   * @param objectTypeId ObjectType Id of the specified object.
   */
  public async getObjectPermissions(requestContext: AuthorizedClientRequestContext, objectId: string, objectTypeId: string): Promise<Permission[]> {
    requestContext.enter();

    const userInfo = requestContext.accessToken.getUserInfo();
    if (!userInfo)
      throw new Error("Invalid access token");

    const relativeUrlPath: string = `/Repositories/BentleyCONNECT--Main/RBAC/User/${userInfo.id}/Object`;
    const url: string = await this.getUrl(requestContext) + relativeUrlPath;
    requestContext.enter();

    const filterStr = `$id+eq+'${objectId}'+and+typeid+eq+'${objectTypeId}'`;
    const options: any = {
      method: "GET",
      headers: { authorization: requestContext.accessToken.toTokenString() },
      qs: {
        $select: "Permission.*",
        $filter: filterStr,
      },
    };

    return this.executePermissionsRequest(requestContext, url, options);
  }

  /**
   * Get the ObjectType Id for the given service
   * @param requestContext The client request context.
   * @param objectTypeName ObjectType name.
   * @param serviceGPRId GPR Id of the service.
   */
  public async getObjectTypeId(requestContext: AuthorizedClientRequestContext, objectTypeName: string, serviceGPRId: number): Promise<string> {
    requestContext.enter();

    const userInfo = requestContext.accessToken.getUserInfo();
    if (!userInfo)
      throw new Error("Invalid access token");

    const relativeUrlPath: string = "/Repositories/BentleyCONNECT--Main/RBAC/ObjectType";
    const url: string = await this.getUrl(requestContext) + relativeUrlPath;
    requestContext.enter();

    const filterStr = `Name+eq+'${objectTypeName}'+and+ServiceGPRId+eq+${serviceGPRId}`;
    const options: any = {
      method: "GET",
      headers: { authorization: requestContext.accessToken.toTokenString() },
      qs: {
        $filter: filterStr,
      },
    };

    const instances = await this.executeRequest(requestContext, url, options);
    requestContext.enter();

    return instances[0].instanceId;
  }

  /**
   * Execute request to RBAC expecting exactly one result instance.
   */
  private async executeRequest(requestContext: AuthorizedClientRequestContext, url: string, options: any): Promise<any> {
    requestContext.enter();
    await this.setupOptionDefaults(options);

    const res: Response = await request(requestContext, url, options);
    requestContext.enter();

    if (!res.body || !res.body.hasOwnProperty("instances"))
      throw new Error("Expected an array of instances to be returned");

    const instances = res.body.instances;
    if (!instances)
      throw new Error("Instances array is empty");
    if (instances.length !== 1)
      throw new Error("Instances array must have exactly 1 result");

    return instances;
  }

  /**
   * Execute request to RBAC and parse Permissions.
   */
  private async executePermissionsRequest(requestContext: AuthorizedClientRequestContext, url: string, options: any): Promise<Permission[]> {
    requestContext.enter();

    const instances = await this.executeRequest(requestContext, url, options);
    requestContext.enter();

    const permissions: Permission[] = new Array<Permission>();
    for (const relationshipInstance of instances[0].relationshipInstances) {
      const typedInstance: Permission | undefined = ECJsonTypeMap.fromJson<Permission>(Permission, "wsg", relationshipInstance.relatedInstance);
      if (typedInstance)
        permissions.push(typedInstance);
    }

    return permissions;
  }
}
