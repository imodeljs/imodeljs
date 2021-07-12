/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import { ClientRequestContext, Id64, Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import { Matrix3d, Point3d, Range3d, StandardViewIndex, Transform, Vector3d } from "@bentley/geometry-core";
import {
  CategorySelector, DefinitionModel, DisplayStyle3d, IModelDb, ModelSelector, OrthographicViewDefinition, PhysicalModel, SnapshotDb,
} from "@bentley/imodeljs-backend";
import { AxisAlignedBox3d, Cartographic, ContextRealityModelProps, EcefLocation, RenderMode, ViewFlags } from "@bentley/imodeljs-common";
import { getJson } from "@bentley/itwin-client";

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
}

/** */
export class RealityModelContextIModelCreator {
  public iModelDb: IModelDb;
  public url: string;
  public definitionModelId: Id64String = Id64.invalid;
  public physicalModelId: Id64String = Id64.invalid;

  /**
   * Constructor
   * @param iModelFileName the output iModel file name
   * @param url the reality model URL
   */
  public constructor(iModelFileName: string, url: string, private _name: string) {
    fs.unlink(iModelFileName, ((_err) => { }));
    this.iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Reality Model Context" } });
    this.url = url;
  }
  private realityModelFromJson(json: any, worldRange: AxisAlignedBox3d): { realityModel: ContextRealityModelProps | undefined, geoLocated: boolean } {
    let geoLocated = true;
    if (undefined !== json.root.boundingVolume.region) {
      const region = JsonUtils.asArray(json.root.boundingVolume.region);
      if (undefined === region)
        throw new TypeError("Unable to determine GeoLocation - no root Transform or Region on root.");
      const ecefLow = (new Cartographic(region[0], region[1], region[4])).toEcef();
      const ecefHigh = (new Cartographic(region[2], region[3], region[5])).toEcef();
      const ecefRange = Range3d.create(ecefLow, ecefHigh);
      const cartoCenter = new Cartographic((region[0] + region[2]) / 2.0, (region[1] + region[3]) / 2.0, (region[4] + region[5]) / 2.0);
      const ecefLocation = EcefLocation.createFromCartographicOrigin(cartoCenter);
      this.iModelDb.setEcefLocation(ecefLocation);
      const ecefToWorld = ecefLocation.getTransform().inverse()!;
      worldRange.extendRange(Range3d.fromJSON(ecefToWorld.multiplyRange(ecefRange)));
    } else {
      let rootTransform = RealityModelTileUtils.transformFromJson(json.root.transform);
      const range = RealityModelTileUtils.rangeFromBoundingVolume(json.root.boundingVolume)!;
      if (undefined === rootTransform)
        rootTransform = Transform.createIdentity();

      const tileRange = rootTransform.multiplyRange(range);
      if (rootTransform.matrix.isIdentity && range.center.magnitude() < 1.0E5) {
        geoLocated = false;
        worldRange.extendRange(Range3d.fromJSON(tileRange));
      } else {
        const ecefCenter = tileRange.localXYZToWorld(.5, .5, .5)!;
        const cartoCenter = Cartographic.fromEcef(ecefCenter);
        const ecefLocation = EcefLocation.createFromCartographicOrigin(cartoCenter!);
        this.iModelDb.setEcefLocation(ecefLocation);
        const ecefToWorld = ecefLocation.getTransform().inverse()!;
        worldRange.extendRange(Range3d.fromJSON(ecefToWorld.multiplyRange(tileRange)));
      }
    }
    return { realityModel: { tilesetUrl: this.url, name: this._name ? this._name : this.url }, geoLocated };
  }
  /** Perform the import */
  public async create(): Promise<void> {
    this.definitionModelId = DefinitionModel.insert(this.iModelDb, IModelDb.rootSubjectId, "Definitions");
    this.physicalModelId = PhysicalModel.insert(this.iModelDb, IModelDb.rootSubjectId, "Empty Model");

    let geoLocated = false;
    const worldRange = new Range3d();
    const realityModels: ContextRealityModelProps[] = [];

    let json: any;
    try {
      json = await getJson(new ClientRequestContext(), this.url);
    } catch (error) {
      process.stdout.write(`Error occurred requesting data from: ${this.url}Error: ${error}\n`);
    }

    if (this.url.endsWith("_AppData.json")) {
      const nameIndex = this.url.lastIndexOf("TileSets");
      const prefix = this.url.substr(0, nameIndex);
      let worldToEcef: Transform | undefined;
      for (const modelValue of Object.values(json.models)) {
        const model = modelValue as any;
        if (model.tilesetUrl !== undefined &&
          model.type === "spatial") {
          let modelUrl = prefix + model.tilesetUrl.replace(/\/\//g, "/");
          modelUrl = modelUrl.replace(/ /g, "%20");
          const ecefRange = Range3d.fromJSON(model.extents);
          if (!worldToEcef) {
            worldToEcef = RealityModelTileUtils.transformFromJson(model.transform)!;
            const ecefCenter = ecefRange.localXYZToWorld(.5, .5, .5)!;
            const cartoCenter = Cartographic.fromEcef(ecefCenter);
            const ecefLocation = EcefLocation.createFromCartographicOrigin(cartoCenter!);
            this.iModelDb.setEcefLocation(ecefLocation);
            geoLocated = true;
          }
          worldRange.extendRange(worldToEcef.inverse()!.multiplyRange(ecefRange));
          realityModels.push({ tilesetUrl: modelUrl, name: this._name ? this._name : model.name });
        }
      }
    } else {
      const result = this.realityModelFromJson(json, worldRange);
      if (result.realityModel) {
        realityModels.push(result.realityModel);
        if (result.geoLocated)
          geoLocated = true;

        realityModels.push();
      }
    }

    this.insertSpatialView("Reality Model View", worldRange, realityModels, geoLocated);
    this.iModelDb.updateProjectExtents(worldRange);
    this.iModelDb.saveChanges();
  }

  /** Insert a SpatialView configured to display the GeoJSON data that was converted/imported. */
  protected insertSpatialView(viewName: string, range: AxisAlignedBox3d, realityModels: ContextRealityModelProps[], geoLocated: boolean): Id64String {
    const modelSelectorId: Id64String = ModelSelector.insert(this.iModelDb, this.definitionModelId, viewName, [this.physicalModelId]);
    const categorySelectorId: Id64String = CategorySelector.insert(this.iModelDb, this.definitionModelId, viewName, []);
    const vf = new ViewFlags();
    vf.backgroundMap = geoLocated;
    vf.renderMode = RenderMode.SmoothShade;
    vf.cameraLights = true;
    const displayStyleId: Id64String = DisplayStyle3d.insert(this.iModelDb, this.definitionModelId, viewName, { viewFlags: vf, contextRealityModels: realityModels });
    return OrthographicViewDefinition.insert(this.iModelDb, this.definitionModelId, viewName, modelSelectorId, categorySelectorId, displayStyleId, range, StandardViewIndex.Iso);
  }
}
