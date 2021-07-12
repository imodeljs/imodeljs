/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */

import { GuidString, Id64String } from "@bentley/bentleyjs-core";
import { Angle } from "@bentley/geometry-core";
import {
  CartographicRange, ContextRealityModel, ContextRealityModelProps, FeatureAppearance, OrbitGtBlobProps,
} from "@bentley/imodeljs-common";
import { AccessToken } from "@bentley/itwin-client";
import { RealityData, RealityDataClient } from "@bentley/reality-data-client";
import { DisplayStyleState } from "./DisplayStyleState";
import { AuthorizedFrontendRequestContext } from "./FrontendRequestContext";
import { IModelApp } from "./IModelApp";
import { IModelConnection } from "./IModelConnection";
import { PlanarClipMaskState } from "./PlanarClipMaskState";
import { SpatialModelState } from "./ModelState";
import {
  createOrbitGtTileTreeReference, createRealityTileTreeReference, RealityModelTileTree, TileTreeReference,
} from "./tile/internal";

async function getAccessToken(): Promise<AccessToken | undefined> {
  if (!IModelApp.authorizationClient || !IModelApp.authorizationClient.hasSignedIn)
    return undefined; // Not signed in

  try {
    return await IModelApp.authorizationClient.getAccessToken();
  } catch (_) {
    return undefined;
  }
}

/** A [ContextRealityModel]($common) attached to a [[DisplayStyleState]] supplying a [[TileTreeReference]] used to draw the
 * reality model in a [[Viewport]].
 * @see [DisplayStyleSettings.contextRealityModels]($common).
 * @see [[DisplayStyleState.contextRealityModelStates]].
 * @see [[DisplayStyleState.attachRealityModel]].
 * @public
 */
export class ContextRealityModelState extends ContextRealityModel {
  private readonly _treeRef: RealityModelTileTree.Reference;
  /** The iModel with which the reality model is associated. */
  public readonly iModel: IModelConnection;

  /** @internal */
  public constructor(props: ContextRealityModelProps, iModel: IModelConnection, displayStyle: DisplayStyleState) {
    super(props);
    this.iModel = iModel;
    this._appearanceOverrides = props.appearanceOverrides ? FeatureAppearance.fromJSON(props.appearanceOverrides) : undefined;
    this._treeRef = (undefined === props.orbitGtBlob) ?
      createRealityTileTreeReference({
        iModel,
        source: displayStyle,
        url: props.tilesetUrl,
        name: props.name,
        classifiers: this.classifiers,
        planarClipMask: this.planarClipMaskSettings,
      }) :
      createOrbitGtTileTreeReference({
        iModel,
        orbitGtBlob: props.orbitGtBlob,
        name: props.name,
        classifiers: this.classifiers,
        source: displayStyle,
      });

    this.onPlanarClipMaskChanged.addListener((newSettings) => {
      this._treeRef.planarClipMask = newSettings ? PlanarClipMaskState.create(newSettings) : undefined;
    });
  }

  /** The tile tree reference responsible for drawing the reality model into a [[Viewport]]. */
  public get treeRef(): TileTreeReference { return this._treeRef; }

  /** The transient Id assigned to this reality model at run-time. */
  public get modelId(): Id64String | undefined {
    return (this._treeRef instanceof RealityModelTileTree.Reference) ? this._treeRef.modelId : undefined;
  }

  /** Whether the reality model spans the entire globe ellipsoid. */
  public get isGlobal(): boolean {
    return this.treeRef.isGlobal;
  }
}

/** Criteria used to query for reality data associated with an iTwin context.
 * @see [[queryRealityData]].
 * @public
 */
export interface RealityDataQueryCriteria {
  /** The Id of the iTwin context. */
  contextId: GuidString;
  /** If supplied, only reality data overlapping this range will be included. */
  range?: CartographicRange;
  /** If supplied, reality data already referenced by a [[GeometricModelState]] within this iModel will be excluded. */
  filterIModel?: IModelConnection;
}

/** @deprecated Use queryRealityData
 * @internal
 */
export async function findAvailableRealityModels(contextId: GuidString, modelCartographicRange?: CartographicRange | undefined): Promise<ContextRealityModelProps[]> {
  return queryRealityData({ contextId, range: modelCartographicRange });
}

/** @deprecated Use queryRealityData
 * @internal
 */
export async function findAvailableUnattachedRealityModels(contextId: GuidString, iModel?: IModelConnection, modelCartographicRange?: CartographicRange | undefined): Promise<ContextRealityModelProps[]> {
  return queryRealityData({ contextId, filterIModel: iModel, range: modelCartographicRange });
}

/** Query for reality data associated with an iTwin context.
 * @param criteria Criteria by which to query.
 * @returns Properties of reality data associated with the context, filtered according to the criteria.
 * @public
 */
export async function queryRealityData(criteria: RealityDataQueryCriteria): Promise<ContextRealityModelProps[]> {
  const contextId = criteria.contextId;
  const availableRealityModels: ContextRealityModelProps[] = [];

  const accessToken = await getAccessToken();
  if (!accessToken)
    return availableRealityModels;

  const requestContext = await AuthorizedFrontendRequestContext.create();
  requestContext.enter();

  const client = new RealityDataClient();

  let realityData: RealityData[];
  if (criteria.range) {
    const iModelRange = criteria.range.getLongitudeLatitudeBoundingBox();
    realityData = await client.getRealityDataInProjectOverlapping(requestContext, contextId, Angle.radiansToDegrees(iModelRange.low.x),
      Angle.radiansToDegrees(iModelRange.high.x),
      Angle.radiansToDegrees(iModelRange.low.y),
      Angle.radiansToDegrees(iModelRange.high.y));
  } else {
    realityData = await client.getRealityDataInProject(requestContext, contextId);
  }

  requestContext.enter();

  // Get set of URLs that are directly attached to the model.
  const modelRealityDataIds = new Set<string>();
  if (criteria.filterIModel) {
    const query = { from: SpatialModelState.classFullName, wantPrivate: false };
    const props = await criteria.filterIModel.models.queryProps(query);
    for (const prop of props)
      if (prop.jsonProperties !== undefined && prop.jsonProperties.tilesetUrl) {
        const realityDataId = client.getRealityDataIdFromUrl(prop.jsonProperties.tilesetUrl);
        if (realityDataId)
          modelRealityDataIds.add(realityDataId);
      }
  }

  // We obtain the reality data name, and RDS URL for each RD returned.
  for (const currentRealityData of realityData) {
    let realityDataName: string = "";
    let validRd: boolean = true;
    if (currentRealityData.name && currentRealityData.name !== "") {
      realityDataName = currentRealityData.name;
    } else if (currentRealityData.rootDocument) {
      // In case root document contains a relative path we only keep the filename
      const rootDocParts = (currentRealityData.rootDocument).split("/");
      realityDataName = rootDocParts[rootDocParts.length - 1];
    } else {
      // This case would not occur normally but if it does the RD is considered invalid
      validRd = false;
    }

    // If the RealityData is valid then we add it to the list.
    if (currentRealityData.id && validRd === true) {
      const url = await client.getRealityDataUrl(requestContext, contextId, currentRealityData.id);
      let opcConfig: OrbitGtBlobProps | undefined;

      if (currentRealityData.type && (currentRealityData.type.toUpperCase() === "OPC") && currentRealityData.rootDocument !== undefined) {
        const rootDocUrl: string = await currentRealityData.getBlobStringUrl(requestContext, currentRealityData.rootDocument);
        opcConfig = {
          rdsUrl: "",
          containerName: "",
          blobFileName: rootDocUrl,
          accountName: "",
          sasToken: "",
        };
      }

      requestContext.enter();
      if (!modelRealityDataIds.has(currentRealityData.id))
        availableRealityModels.push({
          tilesetUrl: url, name: realityDataName, description: (currentRealityData.description ? currentRealityData.description : ""),
          realityDataId: currentRealityData.id, orbitGtBlob: opcConfig,
        });
    }
  }

  return availableRealityModels;
}
