/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */

import { JsonUtils } from "@bentley/bentleyjs-core";
import { Angle, AngleSweep, Arc3d, Matrix3d, Point2d, Point3d, Transform, Vector3d, XAndY, XYAndZ, YawPitchRollAngles } from "@bentley/geometry-core";
import {
  AuxCoordSystem2dProps, AuxCoordSystem3dProps, AuxCoordSystemProps, BisCodeSpec, Code, ColorDef, IModel, LinePixels, Npc,
} from "@bentley/imodeljs-common";
import { ElementState } from "./EntityState";
import { IModelConnection } from "./IModelConnection";
import { GraphicBuilder, GraphicType } from "./render/GraphicBuilder";
import { DecorateContext } from "./ViewContext";
import { CoordSystem } from "./CoordSystem";
import { Viewport } from "./Viewport";
import { ViewState } from "./ViewState";

/** @public */
export enum ACSType {
  None = 0,
  Rectangular = 1,
  Cylindrical = 2,
  Spherical = 3,
}

/** @public */
export enum ACSDisplayOptions {
  None = 0, // used for testing individual bits.
  Active = (1 << 0),
  Deemphasized = (1 << 1),
  Hilite = (1 << 2),
  CheckVisible = (1 << 3),
  Dynamics = (1 << 4),
}

const enum ACSDisplaySizes { // eslint-disable-line no-restricted-syntax
  TriadSizeInches = 0.6,
  ArrowBaseStart = 0.3,
  ArrowBaseWidth = 0.2,
  ArrowTipEnd = 1.25,
  ArrowTipStart = 0.85,
  ArrowTipFlange = 0.75,
  ArrowTipWidth = 0.4,
  ZAxisLength = 0.65,
  LabelStart = 0.4,
  LabelEnd = 0.8,
  LabelWidth = 0.15,
}

/** The state of an AuxCoordSystem element in the frontend
 * @public
 */
export abstract class AuxCoordSystemState extends ElementState implements AuxCoordSystemProps {
  /** @internal */
  public static override get className() { return "AuxCoordSystem"; }
  public type: number;
  public description?: string;

  public static fromProps(props: AuxCoordSystemProps, iModel: IModelConnection): AuxCoordSystemState {
    const name = props.classFullName.toLowerCase();
    if (name.endsWith("system2d"))
      return new AuxCoordSystem2dState(props, iModel);

    if (name.endsWith("system3d"))
      return new AuxCoordSystem3dState(props, iModel);

    return new AuxCoordSystemSpatialState(props, iModel);
  }

  /** Create a new AuxCoordSystemState.
   * @param acsName the name for the new AuxCoordSystem
   * @param iModel the iModel for which the ACS applies.
   * @note call this method with the appropriate subclass (e.g. AuxCoordSystemSpatialState, AuxCoordSystem2dState, etc), not on AuxCoordSystemState directly
   */
  public static createNew(acsName: string, iModel: IModelConnection): AuxCoordSystemState {
    const myCode = new Code({ spec: BisCodeSpec.auxCoordSystemSpatial, scope: IModel.dictionaryId.toString(), value: acsName });
    return new AuxCoordSystemSpatialState({ model: IModel.dictionaryId, code: myCode, classFullName: this.classFullName }, iModel);
  }

  public constructor(props: AuxCoordSystemProps, iModel: IModelConnection) {
    super(props, iModel);
    this.type = JsonUtils.asInt(props.type, ACSType.None);
    this.description = props.description;
  }
  public override toJSON(): AuxCoordSystemProps {
    const val = super.toJSON() as AuxCoordSystemProps;
    val.type = this.type;
    val.description = this.description;
    return val;
  }

  public isValidForView(view: ViewState): boolean {
    if (view.isSpatialView())
      return this instanceof AuxCoordSystemSpatialState;
    return (view.is3d() === this.is3d);
  }

  public abstract getOrigin(result?: Point3d): Point3d;
  public abstract setOrigin(val: XYAndZ | XAndY): void;
  /** get a *copy of* the rotation matrix for this ACS. */
  public abstract getRotation(result?: Matrix3d): Matrix3d;
  public abstract setRotation(val: Matrix3d): void;
  public get is3d(): boolean { return this instanceof AuxCoordSystem3dState; }

  public drawGrid(context: DecorateContext): void {
    // Called for active ACS when grid orientation is GridOrientationType::ACS.
    const view = context.viewport.view;
    const fixedRepsAuto = Point2d.create(); // limit grid to project extents
    context.drawStandardGrid(this.getOrigin(), this.getRotation(), view.getGridSpacing(), view.getGridsPerRef(), false, fixedRepsAuto);
  }

  /** Returns the value, clamped to the supplied range. */
  private static limitRange(min: number, max: number, val: number): number { return Math.max(min, Math.min(max, val)); }

  /**
   * Given an origin point, returns whether the point falls within the view or not. If adjustOrigin is set to true, a point outside
   * the view will be modified to fall within the appropriate range.
   */
  public static isOriginInView(drawOrigin: Point3d, viewport: Viewport, adjustOrigin: boolean): boolean {
    const testPtView = viewport.worldToView(drawOrigin);
    const frustum = viewport.getFrustum(CoordSystem.View);
    const screenRange = Point3d.create();
    screenRange.x = frustum.points[Npc._000].distance(frustum.points[Npc._100]);
    screenRange.y = frustum.points[Npc._000].distance(frustum.points[Npc._010]);
    screenRange.z = frustum.points[Npc._000].distance(frustum.points[Npc._001]);

    // Check if current acs origin is outside view...
    const inView = (!((testPtView.x < 0 || testPtView.x > screenRange.x) || (testPtView.y < 0 || testPtView.y > screenRange.y)));

    if (!adjustOrigin)
      return inView;

    if (!inView) {
      const offset = viewport.pixelsFromInches(ACSDisplaySizes.TriadSizeInches);
      testPtView.x = AuxCoordSystemState.limitRange(offset, screenRange.x - offset, testPtView.x);
      testPtView.y = AuxCoordSystemState.limitRange(offset, screenRange.y - offset, testPtView.y);
    }

    // Limit point to NPC box to prevent triad from being clipped from display...
    const originPtNpc = viewport.viewToNpc(testPtView);
    originPtNpc.x = AuxCoordSystemState.limitRange(0, 1, originPtNpc.x);
    originPtNpc.y = AuxCoordSystemState.limitRange(0, 1, originPtNpc.y);
    originPtNpc.z = AuxCoordSystemState.limitRange(0, 1, originPtNpc.z);
    viewport.npcToView(originPtNpc, testPtView);
    viewport.viewToWorld(testPtView, drawOrigin);

    return inView;
  }

  private getAdjustedColor(inColor: ColorDef, isFill: boolean, viewport: Viewport, options: ACSDisplayOptions): ColorDef {
    let color;
    if ((options & ACSDisplayOptions.Hilite) !== ACSDisplayOptions.None) {
      color = viewport.hilite.color;
    } else if ((options & ACSDisplayOptions.Active) !== ACSDisplayOptions.None) {
      color = inColor.equals(ColorDef.white) ? viewport.getContrastToBackgroundColor() : inColor;
    } else {
      color = ColorDef.from(150, 150, 150, 0);
    }

    color = color.adjustedForContrast(viewport.view.backgroundColor);

    if (isFill)
      color = color.withTransparency((options & (ACSDisplayOptions.Deemphasized | ACSDisplayOptions.Dynamics)) !== ACSDisplayOptions.None ? 225 : 200);
    else
      color = color.withTransparency((options & ACSDisplayOptions.Deemphasized) !== ACSDisplayOptions.None ? 150 : 75);

    return color;
  }

  private addAxisLabel(builder: GraphicBuilder, axis: number, options: ACSDisplayOptions, vp: Viewport) {
    const color = ColorDef.white;
    const lineColor = this.getAdjustedColor(color, false, vp, options);
    builder.setSymbology(lineColor, lineColor, 2);

    const linePts1: Point3d[] = [];
    if (0 === axis) {
      linePts1[0] = Point3d.create(ACSDisplaySizes.LabelStart, -ACSDisplaySizes.LabelWidth);
      linePts1[1] = Point3d.create(ACSDisplaySizes.LabelEnd, ACSDisplaySizes.LabelWidth);
    } else {
      linePts1[0] = Point3d.create(0.0, ACSDisplaySizes.LabelStart);
      linePts1[1] = Point3d.create(0.0, (ACSDisplaySizes.LabelStart + ACSDisplaySizes.LabelEnd) * 0.5);
    }
    builder.addLineString(linePts1);

    const linePts2: Point3d[] = []; // NOTE: Don't use same point array, addPointString/addLineString don't deep copy...
    if (0 === axis) {
      linePts2[0] = Point3d.create(ACSDisplaySizes.LabelStart, ACSDisplaySizes.LabelWidth);
      linePts2[1] = Point3d.create(ACSDisplaySizes.LabelEnd, -ACSDisplaySizes.LabelWidth);
    } else {
      linePts2[0] = Point3d.create(ACSDisplaySizes.LabelWidth, ACSDisplaySizes.LabelEnd);
      linePts2[1] = Point3d.create(0.0, (ACSDisplaySizes.LabelStart + ACSDisplaySizes.LabelEnd) * 0.5);
      linePts2[2] = Point3d.create(-ACSDisplaySizes.LabelWidth, ACSDisplaySizes.LabelEnd);
    }
    builder.addLineString(linePts2);
  }

  private addAxis(builder: GraphicBuilder, axis: number, options: ACSDisplayOptions, vp: Viewport) {
    const color = (0 === axis ? ColorDef.red : (1 === axis ? ColorDef.green : ColorDef.blue));
    const lineColor = this.getAdjustedColor(color, false, vp, options);
    const fillColor = this.getAdjustedColor(color, true, vp, options);

    if (axis === 2) {
      builder.setSymbology(lineColor, lineColor, 6);
      builder.addPointString([Point3d.create(0.0, 0.0, ACSDisplaySizes.ZAxisLength)]); // NOTE: ACS origin point will be drawn separately as a pickable world decoration...

      const linePts2: Point3d[] = [Point3d.create(), Point3d.create()]; // NOTE: Don't use same point array, addPointString/addLineString don't deep copy...
      linePts2[1].z = ACSDisplaySizes.ZAxisLength;
      builder.setSymbology(lineColor, lineColor, 1, (options & ACSDisplayOptions.Dynamics) === ACSDisplayOptions.None ? LinePixels.Solid : LinePixels.Code2);
      builder.addLineString(linePts2);

      const scale = ACSDisplaySizes.ArrowTipWidth / 2;
      const center = Point3d.create();
      const viewRMatrix = vp.rotation;

      const xVec = viewRMatrix.getRow(0);
      const yVec = viewRMatrix.getRow(1);

      builder.placement.matrix.multiplyTransposeVectorInPlace(xVec);
      builder.placement.matrix.multiplyTransposeVectorInPlace(yVec);

      xVec.normalize(xVec);
      yVec.normalize(yVec);

      const ellipse = Arc3d.createScaledXYColumns(center, Matrix3d.createColumns(xVec, yVec, Vector3d.create()), scale, scale, AngleSweep.createStartEnd(Angle.createRadians(0), Angle.createRadians(Math.PI * 2)));
      builder.addArc(ellipse, false, false);

      builder.setBlankingFill(fillColor);
      builder.addArc(ellipse, true, true);
      return;
    }

    const shapePts: Point3d[] = [];
    shapePts[0] = Point3d.create(ACSDisplaySizes.ArrowTipEnd, 0.0);
    shapePts[1] = Point3d.create(ACSDisplaySizes.ArrowTipFlange, ACSDisplaySizes.ArrowTipWidth);
    shapePts[2] = Point3d.create(ACSDisplaySizes.ArrowTipStart, ACSDisplaySizes.ArrowBaseWidth);
    shapePts[3] = Point3d.create(ACSDisplaySizes.ArrowBaseStart, ACSDisplaySizes.ArrowBaseWidth);
    shapePts[4] = Point3d.create(ACSDisplaySizes.ArrowBaseStart, -ACSDisplaySizes.ArrowBaseWidth);
    shapePts[5] = Point3d.create(ACSDisplaySizes.ArrowTipStart, -ACSDisplaySizes.ArrowBaseWidth);
    shapePts[6] = Point3d.create(ACSDisplaySizes.ArrowTipFlange, -ACSDisplaySizes.ArrowTipWidth);
    shapePts[7] = shapePts[0].clone();
    if (1 === axis) { shapePts.forEach((tmpPt) => { tmpPt.set(tmpPt.y, tmpPt.x); }); }

    builder.setSymbology(lineColor, lineColor, 1, (options & ACSDisplayOptions.Dynamics) === ACSDisplayOptions.None ? LinePixels.Solid : LinePixels.Code2);
    builder.addLineString(shapePts);

    this.addAxisLabel(builder, axis, options, vp);

    builder.setBlankingFill(fillColor);
    builder.addShape(shapePts);
  }

  /** Returns a GraphicBuilder for this AuxCoordSystemState. */
  private createGraphicBuilder(context: DecorateContext, options: ACSDisplayOptions): GraphicBuilder {
    const checkOutOfView = (options & ACSDisplayOptions.CheckVisible) !== ACSDisplayOptions.None;
    const drawOrigin = this.getOrigin();

    if (checkOutOfView && !AuxCoordSystemState.isOriginInView(drawOrigin, context.viewport, true))
      options = options | ACSDisplayOptions.Deemphasized;

    let pixelSize = context.viewport.pixelsFromInches(ACSDisplaySizes.TriadSizeInches);

    if ((options & ACSDisplayOptions.Deemphasized) !== ACSDisplayOptions.None)
      pixelSize *= 0.8;
    else if ((options & ACSDisplayOptions.Active) !== ACSDisplayOptions.None)
      pixelSize *= 0.9;

    const exaggerate = context.viewport.view.getAspectRatioSkew();
    const scale = context.getPixelSizeAtPoint(drawOrigin) * pixelSize;
    const rMatrix = this.getRotation();

    rMatrix.transposeInPlace();
    rMatrix.scaleColumns(scale, scale / exaggerate, scale, rMatrix);
    const transform = Transform.createRefs(drawOrigin, rMatrix);

    const builder = context.createGraphicBuilder(GraphicType.WorldOverlay, transform);
    const vp = context.viewport;
    this.addAxis(builder, 0, options, vp);
    this.addAxis(builder, 1, options, vp);
    this.addAxis(builder, 2, options, vp);
    return builder;
  }

  public display(context: DecorateContext, options: ACSDisplayOptions) {
    const builder = this.createGraphicBuilder(context, options);
    if (undefined !== builder)
      context.addDecorationFromBuilder(builder);
  }
}

/** The state of an AuxCoordSystem2d element in the frontend
 * @public
 */
export class AuxCoordSystem2dState extends AuxCoordSystemState implements AuxCoordSystem2dProps {
  /** @internal */
  public static override get className() { return "AuxCoordSystem2d"; }
  public readonly origin: Point2d;
  public angle: number; // in degrees
  private readonly _rMatrix: Matrix3d;

  constructor(props: AuxCoordSystem2dProps, iModel: IModelConnection) {
    super(props, iModel);
    this.origin = Point2d.fromJSON(props.origin);
    this.angle = JsonUtils.asDouble(props.angle);
    this._rMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(this.angle))!;
  }

  public override toJSON(): AuxCoordSystem2dProps {
    const val = super.toJSON() as AuxCoordSystem2dProps;
    val.origin = this.origin;
    val.angle = this.angle;
    return val;
  }

  public getOrigin(result?: Point3d): Point3d { return Point3d.createFrom(this.origin, result); }
  public setOrigin(val: XYAndZ | XAndY): void { this.origin.setFrom(val); }
  public getRotation(result?: Matrix3d): Matrix3d { return this._rMatrix.clone(result); }
  public setRotation(val: Matrix3d): void {
    this._rMatrix.setFrom(val);
    const angle = YawPitchRollAngles.createFromMatrix3d(val);
    this.angle = (undefined !== angle ? angle.yaw.degrees : 0.0);
  }
}

/** The state of an AuxCoordSystem3d element in the frontend
 * @public
 */
export class AuxCoordSystem3dState extends AuxCoordSystemState implements AuxCoordSystem3dProps {
  /** @internal */
  public static override get className() { return "AuxCoordSystem3d"; }
  public readonly origin: Point3d;
  public yaw: number; // in degrees
  public pitch: number; // in degrees
  public roll: number; // in degrees
  private readonly _rMatrix: Matrix3d;

  constructor(props: AuxCoordSystem3dProps, iModel: IModelConnection) {
    super(props, iModel);
    this.origin = Point3d.fromJSON(props.origin);
    this.yaw = JsonUtils.asDouble(props.yaw);
    this.pitch = JsonUtils.asDouble(props.pitch);
    this.roll = JsonUtils.asDouble(props.roll);
    const angles = new YawPitchRollAngles(Angle.createDegrees(this.yaw), Angle.createDegrees(this.pitch), Angle.createDegrees(this.roll));
    this._rMatrix = angles.toMatrix3d();
  }

  public override toJSON(): AuxCoordSystem3dProps {
    const val = super.toJSON() as AuxCoordSystem3dProps;
    val.origin = this.origin;
    val.yaw = this.yaw;
    val.pitch = this.pitch;
    val.roll = this.roll;
    return val;
  }

  public getOrigin(result?: Point3d): Point3d { return Point3d.createFrom(this.origin, result); }
  public setOrigin(val: XYAndZ | XAndY): void { this.origin.setFrom(val); }
  public getRotation(result?: Matrix3d): Matrix3d { return this._rMatrix.clone(result); }
  public setRotation(rMatrix: Matrix3d): void {
    this._rMatrix.setFrom(rMatrix);
    const angles = YawPitchRollAngles.createFromMatrix3d(rMatrix);
    this.yaw = (undefined !== angles ? angles.yaw.degrees : 0.0);
    this.pitch = (undefined !== angles ? angles.pitch.degrees : 0.0);
    this.roll = (undefined !== angles ? angles.roll.degrees : 0.0);
  }
}

/** The state of an AuxCoordSystemSpatial element in the frontend
 * @public
 */
export class AuxCoordSystemSpatialState extends AuxCoordSystem3dState {
  /** @internal */
  public static override get className() { return "AuxCoordSystemSpatial"; }
}
