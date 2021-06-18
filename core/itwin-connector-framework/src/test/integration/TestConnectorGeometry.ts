
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Angle, AxisIndex, AxisOrder, Matrix3d, Point3d, Transform, Vector3d, YawPitchRollAngles } from "@bentley/geometry-core";
import { Categories, GeometryParts, Materials } from "./TestConnectorElements";
import { GeometryPart, IModelDb, RenderMaterialElement, SubCategory } from "@bentley/imodeljs-backend";
import { ColorByName, ColorDef, GeometryParams, GeometryStreamBuilder, GeometryStreamProps, IModelError } from "@bentley/imodeljs-common";
import { Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { TestConnectorLoggerCategory } from "./TestConnectorLoggerCategory";

const loggerCategory: string = TestConnectorLoggerCategory.Geometry;

export enum Casings {
  SmallWidth = 0.1,
  LargeWidth = 0.2,
  Thickness = 0.008,
  MagnetThickness = 0.005,
  MagnetLength = 0.04,
  MagnetInset = 0.001,
  MagnetRadius = 0.01,
}
export enum Magnet {
  Inset = 0.001,
  Thickness = 0.005,
  Radius = 0.01,
  Length = 0.04,
}

export abstract class TileCasing {
  public abstract name(): string;
}

export abstract class QuadCasing extends TileCasing {
  public readonly thickness: number = Casings.Thickness;
  public abstract center(): Point3d;
  public abstract size(): Point3d;
}

export abstract class SquareCasing extends QuadCasing {
  public abstract width: number;
  public size(): Point3d {
    return new Point3d(this.width, this.width, this.thickness);
  }
  public center(): Point3d {
    return new Point3d(this.width / 2.0, this.width / 2.0, this.thickness / 2.0);
  }
  public abstract name(): string;
}

export class SmallSquareCasing extends SquareCasing {
  public width: number = Casings.SmallWidth;
  public name(): string {
    return GeometryParts.SmallSquareCasing;
  }
}

export class LargeSquareCasing extends SquareCasing {
  public width: number = Casings.LargeWidth;
  public name(): string {
    return GeometryParts.LargeSquareCasing;
  }
}

export class RectangleCasing extends QuadCasing {
  public size(): Point3d {
    return new Point3d(Casings.LargeWidth, Casings.SmallWidth, this.thickness);
  }
  public center(): Point3d {
    return new Point3d(Casings.LargeWidth / 2, Casings.SmallWidth / 2, this.thickness / 2);
  }
  public name(): string {
    return GeometryParts.RectangleCasing;
  }
}

export class RectangularMagnetCasing extends QuadCasing {
  public readonly thickness: number = Casings.MagnetThickness;
  public size(): Point3d {
    return new Point3d(Casings.MagnetLength, Casings.MagnetThickness, Casings.MagnetThickness);
  }
  public center(): Point3d {
    return Point3d.createZero();
  }
  public name(): string {
    return GeometryParts.RectangularMagnet;
  }
}

export abstract class TriangleCasing extends TileCasing {
  public vec() {
    return new Vector3d(0.0, 0.0, Casings.Thickness);
  }
  public abstract points(): Point3d[];
}
export class EquilateralTriangleCasing extends TriangleCasing {
  public name() {
    return GeometryParts.EquilateralTriangleCasing;
  }

  public points(): Point3d[] {
    const a = Casings.SmallWidth / 2;
    const c = Casings.SmallWidth;
    const b = c * Angle.createDegrees(60).sin();
    const points: Point3d[] = [];
    points[0] = new Point3d(-a, 0.0, 0.0);
    points[1] = new Point3d(a, 0.0, 0.0);
    points[2] = new Point3d(0.0, b, 0.0);

    return points;
  }

}

export class IsoscelesTriangleCasing extends TriangleCasing {
  public name() {
    return GeometryParts.IsoscelesTriangleCasing;
  }

  public points(): Point3d[] {
    const a = Casings.SmallWidth / 2;
    const c = Casings.LargeWidth;
    const b = Math.sqrt(Math.pow(c, 2) - Math.pow(a, 2));
    const points: Point3d[] = [];
    points[0] = new Point3d(-a, 0.0, 0.0);
    points[1] = new Point3d(a, 0.0, 0.0);
    points[2] = new Point3d(0.0, b, 0.0);

    return points;
  }
}

export class RightTriangleCasing extends TriangleCasing {
  public name() {
    return GeometryParts.RightTriangleCasing;
  }
  public points(): Point3d[] {
    const points: Point3d[] = [];
    points[0] = new Point3d(0.0, Casings.SmallWidth, 0.0);
    points[1] = new Point3d(0.0, 0.0, 0.0);
    points[2] = new Point3d(Casings.SmallWidth, 0.0, 0.0);
    return points;
  }
}

export abstract class TileBuilder {
  protected _builder: GeometryStreamBuilder;
  constructor(protected readonly _imodel: IModelDb, protected readonly _definitionModelId: Id64String) {
    this._builder = new GeometryStreamBuilder();
  }

  protected createMagnetParams(categoryId: Id64String, subCategoryId: Id64String): GeometryParams {
    const params = new GeometryParams(categoryId, subCategoryId);
    params.materialId = this._imodel.elements.queryElementIdByCode(RenderMaterialElement.createCode(this._imodel, this._definitionModelId, Materials.MagnetizedFerrite));
    return params;
  }

  protected getCasingSubCategoryId(categoryId: Id64String): Id64String {
    const casingId = this._imodel.elements.queryElementIdByCode(SubCategory.createCode(this._imodel, categoryId, Categories.Casing));
    if (undefined === casingId) {
      throw new IModelError(IModelStatus.BadElement, "Unable to find subcategory id for Casing subcategory", Logger.logError, loggerCategory);
    }
    return casingId;
  }

  protected getMagnetSubCategoryId(categoryId: Id64String): Id64String {
    const casingId = this._imodel.elements.queryElementIdByCode(SubCategory.createCode(this._imodel, categoryId, Categories.Magnet));
    if (undefined === casingId) {
      throw new IModelError(IModelStatus.BadElement, "Unable to find subcategory id for Magnet subcategory", Logger.logError, loggerCategory);
    }
    return casingId;
  }

  protected createCasingParams(categoryId: Id64String, subCategoryId: Id64String, tile: any): GeometryParams {
    const params = new GeometryParams(categoryId, subCategoryId);
    params.materialId = this._imodel.elements.queryElementIdByCode(RenderMaterialElement.createCode(this._imodel, this._definitionModelId, Materials.ColoredPlastic));
    switch (tile.casingMaterial) {
      case "RedPlastic":
        params.fillColor = ColorDef.fromTbgr(ColorByName.red);
        params.lineColor = params.fillColor;
        break;
      case "GreenPlastic":
        params.fillColor = ColorDef.fromTbgr(ColorByName.green);
        params.lineColor = params.fillColor;
        break;
      case "BluePlastic":
        params.fillColor = ColorDef.fromTbgr(ColorByName.blue);
        params.lineColor = params.fillColor;
        break;
      case "OrangePlastic":
        params.fillColor = ColorDef.fromTbgr(ColorByName.orange);
        params.lineColor = params.fillColor;
        break;
      case "PurplePlastic":
        params.fillColor = ColorDef.fromTbgr(ColorByName.purple);
        params.lineColor = params.fillColor;
        break;
      case "YellowPlastic":
        params.fillColor = ColorDef.fromTbgr(ColorByName.yellow);
        params.lineColor = params.fillColor;
        break;
      default:
        break;
    }
    return params;
  }

  protected abstract getCasing(): TileCasing;
  protected abstract get casingName(): string;
  protected partId(): Id64String {
    const geomPartId = this._imodel.elements.queryElementIdByCode(GeometryPart.createCode(this._imodel, this._definitionModelId, this.casingName));
    if (undefined === geomPartId) {
      throw new IModelError(IModelStatus.BadElement, `Unable to find geometry part id for ${this.casingName}`, Logger.logError, loggerCategory);
    }
    return geomPartId;
  }

  protected abstract appendCircularMagnet(circularMagnetGeomPartId: Id64String): void;
  protected abstract appendRectangularMagnet(rectangularMagnetGeomPartId: Id64String, magnetOffset: number): void;

  public createGeometry(categoryId: Id64String, tile: any): GeometryStreamProps {
    this._builder = new GeometryStreamBuilder();
    const circularMagnetGeomPartId = this._imodel.elements.queryElementIdByCode(GeometryPart.createCode(this._imodel, this._definitionModelId, GeometryParts.CircularMagnet));
    if (undefined === circularMagnetGeomPartId) {
      throw new IModelError(IModelStatus.BadElement, "Unable to find geometry part id for CircularMagnetCasing", Logger.logError, loggerCategory);
    }

    const rectangularMagnetGeomPartId = this._imodel.elements.queryElementIdByCode(GeometryPart.createCode(this._imodel, this._definitionModelId, GeometryParts.RectangularMagnet));
    if (undefined === rectangularMagnetGeomPartId) {
      throw new IModelError(IModelStatus.BadElement, "Unable to find geometry part id for RectangularMagnet", Logger.logError, loggerCategory);
    }

    const casingId = this.getCasingSubCategoryId(categoryId);
    const magnetId = this.getMagnetSubCategoryId(categoryId);

    // Append geometry/params for tile casing
    this._builder.appendSubCategoryChange(casingId);
    this._builder.appendGeometryParamsChange(this.createCasingParams(categoryId, casingId, tile));
    this._builder.appendGeometryPart3d(this.partId(), Point3d.createZero());

    // Append geometry/params for circular magnets
    this._builder.appendSubCategoryChange(magnetId);
    this._builder.appendGeometryParamsChange(this.createMagnetParams(categoryId, magnetId));
    this.appendCircularMagnet(circularMagnetGeomPartId);

    // Append geometry/params for rectangular magnets
    const magnet = new RectangularMagnetCasing();
    const magnetSize = magnet.size();
    const magnetOffset = Casings.MagnetInset + magnetSize.y / 2;

    this.appendRectangularMagnet(rectangularMagnetGeomPartId, magnetOffset);
    return this._builder.geometryStream;
  }
}

export abstract class QuadTileBuilder extends TileBuilder {
  protected _casingSize: Point3d;
  protected _casingCenter: Point3d;

  constructor(imodel: IModelDb, definitionModelId: Id64String) {
    super(imodel, definitionModelId);
    const casing = this.getCasing() as QuadCasing;
    this._casingSize = casing.size();
    this._casingCenter = casing.center();
  }

}
export class SmallSquareTileBuilder extends QuadTileBuilder {

  protected getCasing(): TileCasing {
    return new SmallSquareCasing();
  }

  protected get casingName(): string {
    return GeometryParts.SmallSquareCasing;
  }

  protected appendCircularMagnet(circularMagnetGeomPartId: Id64String) {
    this._builder.appendGeometryPart3d(circularMagnetGeomPartId, this._casingCenter);
  }

  protected appendRectangularMagnet(rectangularMagnetGeomPartId: Id64String, magnetOffset: number) {
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(this._casingCenter.x, magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(this._casingCenter.x, this._casingSize.y - magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(magnetOffset, this._casingCenter.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(this._casingSize.x - magnetOffset, this._casingCenter.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
  }
}

export class LargeSquareTileBuilder extends QuadTileBuilder {
  protected getCasing(): TileCasing {
    return new LargeSquareCasing();
  }

  protected get casingName(): string {
    return GeometryParts.LargeSquareCasing;
  }

  protected appendCircularMagnet(circularMagnetGeomPartId: Id64String) {
    this._builder.appendGeometryPart3d(circularMagnetGeomPartId, this._casingCenter);
  }
  protected appendRectangularMagnet(rectangularMagnetGeomPartId: Id64String, magnetOffset: number) {
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.25 * this._casingSize.x, magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.75 * this._casingSize.x, magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.25 * this._casingSize.x, this._casingSize.y - magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.75 * this._casingSize.x, this._casingSize.y - magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(magnetOffset, 0.25 * this._casingSize.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(magnetOffset, 0.75 * this._casingSize.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(this._casingSize.x - magnetOffset, 0.25 * this._casingSize.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(this._casingSize.x - magnetOffset, 0.75 * this._casingSize.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
  }
}

export class RectangleTileBuilder extends QuadTileBuilder {
  protected getCasing(): TileCasing {
    return new RectangleCasing();
  }

  protected get casingName(): string {
    return GeometryParts.RectangleCasing;
  }

  protected appendCircularMagnet(circularMagnetGeomPartId: Id64String) {
    this._builder.appendGeometryPart3d(circularMagnetGeomPartId, new Point3d(0.25 * this._casingSize.x, this._casingCenter.y, this._casingCenter.z));
    this._builder.appendGeometryPart3d(circularMagnetGeomPartId, new Point3d(0.75 * this._casingSize.x, this._casingCenter.y, this._casingCenter.z));
  }

  protected appendRectangularMagnet(rectangularMagnetGeomPartId: Id64String, magnetOffset: number) {
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.25 * this._casingSize.x, magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.75 * this._casingSize.x, magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.25 * this._casingSize.x, this._casingSize.y - magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.75 * this._casingSize.x, this._casingSize.y - magnetOffset, this._casingCenter.z));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(magnetOffset, this._casingSize.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(this._casingSize.x - magnetOffset, this._casingSize.y, this._casingCenter.z), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
  }
}

export class EquilateralTriangleTileBuilder extends TileBuilder {
  private _centroid: Point3d;
  private _a: number;

  constructor(imodel: IModelDb, definitionModelId: Id64String) {
    super(imodel, definitionModelId);
    this._a = Casings.SmallWidth / 2;
    const c = Casings.SmallWidth;
    const b = c * Angle.createDegrees(60).sin();
    this._centroid = new Point3d(0.0, b / 3, Casings.Thickness / 2);
  }

  protected getCasing(): TileCasing {
    return new EquilateralTriangleCasing();
  }

  protected get casingName(): string {
    return GeometryParts.EquilateralTriangleCasing;
  }

  protected appendCircularMagnet(circularMagnetGeomPartId: Id64String) {
    this._builder.appendGeometryPart3d(circularMagnetGeomPartId, this._centroid);
  }

  protected appendRectangularMagnet(rectangularMagnetGeomPartId: Id64String, magnetOffset: number) {
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.0, magnetOffset, this._centroid.z));

    let magnetCenter = new Point3d(this._a, -magnetOffset, this._centroid.z);
    let rotation = Matrix3d.createRotationAroundAxisIndex(AxisIndex.Z, Angle.createRadians(Math.PI / 3));
    let transform = Transform.createRefs(new Point3d(-this._a, 0.0, 0.0), rotation);
    magnetCenter = transform.multiplyPoint3d(magnetCenter);
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, magnetCenter, YawPitchRollAngles.createFromMatrix3d(rotation));

    magnetCenter = new Point3d(this._a, magnetOffset, this._centroid.z);
    rotation = Matrix3d.createRotationAroundAxisIndex(AxisIndex.Z, Angle.createRadians(Angle.pi2Radians / 3));
    transform = Transform.createRefs(new Point3d(this._a, 0.0, 0.0), rotation);
    magnetCenter = transform.multiplyPoint3d(magnetCenter);
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, magnetCenter, YawPitchRollAngles.createFromMatrix3d(rotation));
  }
}

export class RightTriangleTileBuilder extends TileBuilder {
  protected getCasing(): TileCasing {
    return new RightTriangleCasing();
  }

  protected get casingName(): string {
    return GeometryParts.RightTriangleCasing;
  }

  protected appendCircularMagnet(circularMagnetGeomPartId: Id64String) {
    this._builder.appendGeometryPart3d(circularMagnetGeomPartId, new Point3d(Casings.SmallWidth / 3, Casings.SmallWidth / 3, Casings.Thickness / 2));
  }

  protected appendRectangularMagnet(rectangularMagnetGeomPartId: Id64String, magnetOffset: number) {
    const casing = new SmallSquareCasing();
    const casingSize = casing.size();
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(casingSize.x / 2, magnetOffset, casingSize.z / 2));
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(magnetOffset, casingSize.y / 2, casingSize.z / 2), YawPitchRollAngles.createDegrees(90.0, 0.0, 0.0));
    magnetOffset *= Angle.createDegrees(45.0).cos();
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(casingSize.x / 2 - magnetOffset, casingSize.y / 2 - magnetOffset, casingSize.z / 2), YawPitchRollAngles.createDegrees(-45.0, 0.0, 0.0));
  }
}

export class IsoscelesTriangleTileBuilder extends TileBuilder {
  private _centroid: Point3d;
  private _a: number;
  private _b: number;
  private _c: number;

  constructor(imodel: IModelDb, definitionModelId: Id64String) {
    super(imodel, definitionModelId);
    this._a = Casings.SmallWidth / 2;
    this._c = Casings.SmallWidth;
    this._b = Math.sqrt(Math.pow(this._c, 2) - Math.pow(this._a, 2));
    this._centroid = new Point3d(0.0, this._b / 3, Casings.Thickness / 2);
  }

  protected getCasing(): TileCasing {
    return new IsoscelesTriangleCasing();
  }

  protected get casingName(): string {
    return GeometryParts.IsoscelesTriangleCasing;
  }

  protected appendCircularMagnet(circularMagnetGeomPartId: Id64String) {
    this._builder.appendGeometryPart3d(circularMagnetGeomPartId, this._centroid);
  }

  protected appendRectangularMagnet(rectangularMagnetGeomPartId: Id64String, magnetOffset: number) {
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, new Point3d(0.0, magnetOffset, this._centroid.z));
    this.addPoints(rectangularMagnetGeomPartId, magnetOffset, -1);
    this.addPoints(rectangularMagnetGeomPartId, magnetOffset, -1);
  }

  private addPoints(rectangularMagnetGeomPartId: Id64String, magnetOffset: number, multiplier: number) {
    const points: Point3d[] = [];
    points[0] = new Point3d(this._c * 0.25, multiplier * magnetOffset, this._centroid.z);
    points[1] = new Point3d(this._c * 0.75, multiplier * magnetOffset, this._centroid.z);
    const rotation = Matrix3d.createRigidHeadsUp(new Vector3d(this._a, this._b, 0.0), AxisOrder.XYZ);
    const transform = Transform.createRefs(new Point3d(multiplier * this._a, 0.0, 0.0), rotation);
    const transPoints = transform.multiplyPoint3dArray(points);

    let yawp = YawPitchRollAngles.tryFromTransform(Transform.createRefs(transPoints[0], rotation));
    if (yawp.angles === undefined) {
      throw new IModelError(IModelStatus.BadArg, "Unable to create YawPitchRollAngles for IsocelesTriangleTile", Logger.logError, loggerCategory);
    }
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, yawp.origin, yawp.angles);

    yawp = YawPitchRollAngles.tryFromTransform(Transform.createRefs(transPoints[1], rotation));
    if (yawp.angles === undefined) {
      throw new IModelError(IModelStatus.BadArg, "Unable to create YawPitchRollAngles for IsocelesTriangleTile", Logger.logError, loggerCategory);
    }
    this._builder.appendGeometryPart3d(rectangularMagnetGeomPartId, yawp.origin, yawp.angles);
  }
}
