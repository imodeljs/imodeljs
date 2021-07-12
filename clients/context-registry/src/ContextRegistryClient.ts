/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ContextRegistry
 */
import * as deepAssign from "deep-assign";
import { assert, Config } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext, ECJsonTypeMap, RequestOptions, RequestQueryOptions, WsgClient, WsgInstance } from "@bentley/itwin-client";

/** The iTwin context type.
 * @beta
 */
export enum ContextType {
  Unknown,
  Team = 1, // eslint-disable-line @typescript-eslint/no-shadow
  Asset = 2, // eslint-disable-line @typescript-eslint/no-shadow
  Project = 3, // eslint-disable-line @typescript-eslint/no-shadow
}

/** The iTwin context. Currently supported context types are [[Project]] and [[Asset]].
 * @beta
 */
@ECJsonTypeMap.classToJson("wsg", "CONNECTEDContext.Context", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class Context extends WsgInstance {
  @ECJsonTypeMap.propertyToJson("wsg", "properties.ContextTypeId")
  public contextTypeId?: ContextType;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Name")
  public name?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Number")
  public number?: string; // eslint-disable-line id-blacklist

  @ECJsonTypeMap.propertyToJson("wsg", "properties.UltimateRefId")
  public ultimateRefId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.DataLocationId")
  public dataLocationId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.TeamId")
  public teamId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Status")
  public status?: number;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.AllowExternalTeamMembers")
  public allowExternalTeamMembers?: boolean;
}

/**
 * @beta
 */
abstract class CommonContext extends Context {
  @ECJsonTypeMap.propertyToJson("wsg", "properties.CountryCode")
  public countryCode?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.RegisteredDate")
  public registeredDate?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.LastModifiedDate")
  public lastModifiedDate?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.RegisteredBy")
  public registeredBy?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.LastModifiedBy")
  public lastModifiedBy?: string;
}

/**
 * @beta
 */
abstract class CommonAssetProjectContext extends CommonContext {
  @ECJsonTypeMap.propertyToJson("wsg", "properties.Industry")
  public industry?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Image")
  public image?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Location")
  public location?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Latitude")
  public latitude?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Longitude")
  public longitude?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.TimeZoneLocation")
  public timeZoneLocation?: string;
}

/** An iTwin context of type team. Represents an organization or team working on multiple projects.
 * @beta
 */
@ECJsonTypeMap.classToJson("wsg", "CONNECTEDContext.Team", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class Team extends CommonContext {
}

/** An iTwin context of type project. Represents time-constrained work done on an [[Asset]].
 * @beta
 */
@ECJsonTypeMap.classToJson("wsg", "CONNECTEDContext.Project", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class Project extends CommonAssetProjectContext {
  @ECJsonTypeMap.propertyToJson("wsg", "properties.AssetId")
  public assetId?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.Type")
  public type?: string;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.IsRbacEnabled")
  public isRbacEnabled?: boolean;
}

/** An iTwin context of type asset. Assets represent a large scale item that is owned and/or operated by organization, such as buildings, highways and so on.
 * @beta
 */
@ECJsonTypeMap.classToJson("wsg", "CONNECTEDContext.Asset", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class Asset extends CommonAssetProjectContext {
  @ECJsonTypeMap.propertyToJson("wsg", "properties.AssetType")
  public assetType?: string;
}

/** Options to request iTwin contexts.
 * @beta
 */
export interface ContextRegistryRequestQueryOptions extends RequestQueryOptions {
  /** Set to true to request the most recently used projects */
  isMRU?: boolean;

  /** Set to true to request the favorite projects */
  isFavorite?: boolean;
}

/** Client API to access the context registry services.
 * @beta
 */
export class ContextRegistryClient extends WsgClient {
  public static readonly searchKey: string = "CONNECTEDContextService.URL";
  public static readonly configRelyingPartyUri = "imjs_connected_context_service_relying_party_uri";

  public constructor() {
    super("v2.5");
    this.baseUrl = "https://api.bentley.com/contextregistry";
  }

  /** @internal */
  protected getUrlSearchKey(): string { assert(false, "Bentley cloud-specific method should be factored out of WsgClient base class"); return ""; }

  protected override async setupOptionDefaults(options: RequestOptions): Promise<void> {
    await super.setupOptionDefaults(options);
    deepAssign(options, { headers: { "content-type": "application/json" } });
  }

  /** Gets theRelyingPartyUrl for the service.
   * @returns RelyingPartyUrl for the service.
   */
  protected getRelyingPartyUrl(): string {
    if (Config.App.has(ContextRegistryClient.configRelyingPartyUri))
      return `${Config.App.get(ContextRegistryClient.configRelyingPartyUri)}/`;

    if (Config.App.getBoolean(WsgClient.configUseHostRelyingPartyUriAsFallback, true)) {
      if (Config.App.has(WsgClient.configHostRelyingPartyUri))
        return `${Config.App.get(WsgClient.configHostRelyingPartyUri)}/`;
    }

    throw new Error(`RelyingPartyUrl not set. Set it in Config.App using key ${ContextRegistryClient.configRelyingPartyUri}`);
  }

  /** Gets the iTwin project contexts that are accessible to the authorized user.
   * @param requestContext The client request context
   * @param queryOptions Query options. Use the mapped EC property names in the query strings and not the TypeScript property names.
   * @returns Resolves to an array of projects.
   */
  public async getProjects(requestContext: AuthorizedClientRequestContext, queryOptions?: ContextRegistryRequestQueryOptions): Promise<Project[]> {
    requestContext.enter();
    return this.getInstances<Project>(requestContext, Project, "/Repositories/BentleyCONNECT--Main/ConnectedContext/Project", queryOptions);
  }

  /** Gets a specific iTwin project context.
   * @param requestContext The client request context
   * @param queryOptions Query options. Use the mapped EC property names in the query strings and not the TypeScript property names.
   * @returns Resolves to the found project. Rejects if no projects, or more than one project is found.
   */
  public async getProject(requestContext: AuthorizedClientRequestContext, queryOptions?: ContextRegistryRequestQueryOptions): Promise<Project> {
    requestContext.enter();
    const projects: Project[] = await this.getProjects(requestContext, queryOptions);
    requestContext.enter();
    if (projects.length === 0)
      throw new Error("Could not find a project with the specified criteria that the user has access to");
    else if (projects.length > 1)
      throw new Error("More than one project found with the specified criteria");

    return projects[0];
  }

  /** Get the iTwin projects that the user has been "invited" to.
   * @param token Delegation token of the authorized user.
   * @param queryOptions Query options. Use the mapped EC property names in the query strings and not the TypeScript property names.
   * @returns Resolves to an array of invited projects.
   */
  public async getInvitedProjects(requestContext: AuthorizedClientRequestContext, queryOptions?: ContextRegistryRequestQueryOptions): Promise<Project[]> {
    requestContext.enter();
    return this.getInstances<Project>(requestContext, Project, "/Repositories/BentleyCONNECT--Main/ConnectedContext/Project?rbaconly=true", queryOptions);
  }

  /** Gets a specific iTwin asset context.
   * @param requestContext The client request context
   * @param queryOptions Query options. Use the mapped EC property names in the query strings and not the TypeScript property names.
   * @returns Resolves to the found asset. Rejects if no assets, or more than one asset is found.
   */
  public async getAsset(requestContext: AuthorizedClientRequestContext, queryOptions?: RequestQueryOptions): Promise<Asset> {
    requestContext.enter();
    const assets: Asset[] = await this.getAssets(requestContext, queryOptions);
    requestContext.enter();
    if (assets.length === 0)
      throw new Error("Could not find an asset with the specified criteria that the user has access to");
    else if (assets.length > 1)
      throw new Error("More than one asset found with the specified criteria");

    return assets[0];
  }

  /** Gets the iTwin asset contexts that are accessible to the authorized user.
   * @param requestContext The client request context
   * @param queryOptions Query options. Use the mapped EC property names in the query strings and not the TypeScript property names.
   * @returns Resolves to an array of assets.
   */
  public async getAssets(requestContext: AuthorizedClientRequestContext, queryOptions?: RequestQueryOptions): Promise<Asset[]> {
    requestContext.enter();
    return this.getInstances<Asset>(requestContext, Asset, "/Repositories/BentleyCONNECT--Main/ConnectedContext/Asset", queryOptions);
  }

  /** Gets the iTwin team context that the authorized user belongs to.
   * @param requestContext The client request context
   * @returns Resolves to the found team. Rejects if no team or more than one team is found.
   */
  public async getTeam(requestContext: AuthorizedClientRequestContext): Promise<Team> {
    requestContext.enter();
    const teams = await this.getInstances<Team>(requestContext, Team, "/Repositories/BentleyCONNECT--Main/ConnectedContext/Team?isDefault=true");
    requestContext.enter();

    if (teams.length === 0)
      throw new Error("Could not find a team for the current user");
    if (teams.length > 1)
      throw new Error("More than one default team found");

    return teams[0];
  }
}
