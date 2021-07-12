/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { getJson } from "@bentley/itwin-client";
import { ClientRequestContext, Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import { Matrix3d, Point3d, Range3d, StandardViewIndex, Transform, Vector3d } from "@bentley/geometry-core";
import { CategorySelector, DisplayStyle3d, IModelDb, ModelSelector, OrthographicViewDefinition } from "@bentley/imodeljs-backend";
import {
  AxisAlignedBox3d, BackgroundMapProps, Cartographic, IModel, SpatialClassifierInsideDisplay, SpatialClassifierOutsideDisplay, ViewFlags,
} from "@bentley/imodeljs-common";

class RealityModelTileUtils {
  public static rangeFromBoundingVolume(boundingVolume: any): Range3d | undefined {
    if (undefined === boundingVolume)
      return undefined;
    if (Array.isArray(boundingVolume.box)) {
      const box: number[] = boundingVolume.box;
      const center = Point3d.create(box[0], box[1], box[2]);
      const ux = Vector3d.create(box[3], box[4], box[5]);
      const uy = Vector3d.create(box[6], box[7], box[8]);
      const uz = Vector3d.create(box[9], box[10], box[11]);
      const corners: Point3d[] = [];
      for (let j = 0; j < 2; j++) {
        for (let k = 0; k < 2; k++) {
          for (let l = 0; l < 2; l++) {
            corners.push(center.plus3Scaled(ux, (j ? -1.0 : 1.0), uy, (k ? -1.0 : 1.0), uz, (l ? -1.0 : 1.0)));
          }
        }
      }
      return Range3d.createArray(corners);
    } else if (Array.isArray(boundingVolume.sphere)) {
      const sphere: number[] = boundingVolume.sphere;
      const center = Point3d.create(sphere[0], sphere[1], sphere[2]);
      const radius = sphere[3];
      return Range3d.createXYZXYZ(center.x - radius, center.y - radius, center.z - radius, center.x + radius, center.y + radius, center.z + radius);
    }
    return undefined;
  }

  public static maximumSizeFromGeometricTolerance(range: Range3d, geometricError: number): number {
    const minToleranceRatio = .5;   // Nominally the error on screen size of a tile.  Increasing generally increases performance (fewer draw calls) at expense of higher load times.
    return minToleranceRatio * range.diagonal().magnitude() / geometricError;
  }
  public static transformFromJson(jTrans: number[] | undefined): Transform | undefined {
    return (jTrans === undefined) ? undefined : Transform.createOriginAndMatrix(Point3d.create(jTrans[12], jTrans[13], jTrans[14]), Matrix3d.createRowValues(jTrans[0], jTrans[4], jTrans[8], jTrans[1], jTrans[5], jTrans[9], jTrans[2], jTrans[6], jTrans[10]));
  }
  public static rangeFromJson(json: any): AxisAlignedBox3d {
    if (undefined !== json.root.boundingVolume.region) {
      const region = JsonUtils.asArray(json.root.boundingVolume.region);
      if (undefined === region)
        throw new TypeError("Unable to determine GeoLocation - no root Transform or Region on root.");
      const ecefLow = (new Cartographic(region[0], region[1], region[4])).toEcef();
      const ecefHigh = (new Cartographic(region[2], region[3], region[5])).toEcef();
      return Range3d.create(ecefLow, ecefHigh);
    }

    let rootTransform = RealityModelTileUtils.transformFromJson(json.root.transform);
    const range = RealityModelTileUtils.rangeFromBoundingVolume(json.root.boundingVolume)!;
    if (undefined === rootTransform)
      rootTransform = Transform.createIdentity();

    return rootTransform.multiplyRange(range);
  }

  public static async rangeFromUrl(url: string): Promise<AxisAlignedBox3d> {
    const json = await getJson(new ClientRequestContext(), url);
    return RealityModelTileUtils.rangeFromJson(json);
  }
}

function parseDisplayMode(defaultDisplay: number, option?: string) {
  switch (option) {
    case "off":
      return SpatialClassifierInsideDisplay.Off;
    case "on":
      return SpatialClassifierInsideDisplay.On;
    case "dimmed":
      return SpatialClassifierInsideDisplay.Dimmed;
    case "hilite":
      return SpatialClassifierInsideDisplay.Hilite;
    case "color":
      return SpatialClassifierInsideDisplay.ElementColor;
    default:
      return defaultDisplay;
  }
}

export async function insertClassifiedRealityModel(url: string, classifierModelId: Id64String, classifierCategoryId: Id64String, iModelDb: IModelDb, viewFlags: ViewFlags, isPlanar: boolean, backgroundMap?: BackgroundMapProps, inputName?: string, inside?: string, outside?: string): Promise<void> {
  const name = inputName ? inputName : url;
  const classificationFlags = {
    inside: parseDisplayMode(SpatialClassifierInsideDisplay.ElementColor, inside),
    outside: parseDisplayMode(SpatialClassifierOutsideDisplay.Dimmed, outside),
    isVolumeClassifier: !isPlanar,
  };

  const classifier = { modelId: classifierModelId, name, flags: classificationFlags, isActive: true, expand: 1.0 };
  const realityModel = { tilesetUrl: url, name, classifiers: [classifier] };
  const displayStyleId = DisplayStyle3d.insert(iModelDb, IModel.dictionaryId, name, { viewFlags, backgroundMap, contextRealityModels: [realityModel] });

  const projectExtents = Range3d.createFrom(iModelDb.projectExtents);
  let range;
  try {
    const ecefRange = await RealityModelTileUtils.rangeFromUrl(url);
    range = iModelDb.getEcefTransform().inverse()!.multiplyRange(ecefRange);
  } catch (err) {
    range = projectExtents;
    range.low.z = -200.0;
    range.high.z = 200.0;
  }
  projectExtents.low.z = Math.min(range.low.z, projectExtents.low.z);
  projectExtents.high.z = Math.max(range.high.z, projectExtents.high.z);
  iModelDb.updateProjectExtents(projectExtents);

  const modelSelectorId: Id64String = ModelSelector.insert(iModelDb, IModel.dictionaryId, name, []);
  const categorySelectorId: Id64String = CategorySelector.insert(iModelDb, IModel.dictionaryId, name, [classifierCategoryId]);
  OrthographicViewDefinition.insert(iModelDb, IModel.dictionaryId, name, modelSelectorId, categorySelectorId, displayStyleId, range, StandardViewIndex.Iso);
}
