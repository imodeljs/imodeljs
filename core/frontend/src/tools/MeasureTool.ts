/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Measure
 */

import { Id64, Id64Array, Id64String } from "@bentley/bentleyjs-core";
import {
  AxisOrder, IModelJson, Matrix3d, Plane3dByOriginAndUnitNormal, Point2d, Point3d, PointString3d, PolygonOps, Vector3d, XAndY, XYAndZ,
} from "@bentley/geometry-core";
import {
  BentleyStatus, ColorDef, GeometryStreamProps, LinePixels, MassPropertiesOperation, MassPropertiesRequestProps, MassPropertiesResponseProps,
} from "@bentley/imodeljs-common";
import { DialogItem, DialogItemValue, DialogPropertySyncItem, PropertyDescription } from "@bentley/ui-abstract";
import { AccuDrawHintBuilder, ContextRotationId } from "../AccuDraw";
import { LocateFilterStatus, LocateResponse } from "../ElementLocateManager";
import { HitDetail, HitGeomType } from "../HitDetail";
import { IModelApp } from "../IModelApp";
import { Marker } from "../Marker";
import { NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "../NotificationManager";
import { QuantityType } from "../quantity-formatting/QuantityFormatter";
import { CanvasDecoration } from "../render/CanvasDecoration";
import { GraphicType } from "../render/GraphicBuilder";
import { DecorateContext } from "../ViewContext";
import { Viewport } from "../Viewport";
import { PrimitiveTool } from "./PrimitiveTool";
import { BeButtonEvent, BeModifierKeys, CoreTools, EventHandled, InputSource } from "./Tool";
import { ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection } from "./ToolAssistance";

function translateBold(key: string) { return `<b>${CoreTools.translate(`Measure.Labels.${key}`)}:</b> `; }

/** @internal */
class MeasureLabel implements CanvasDecoration {
  public worldLocation = new Point3d();
  public position = new Point3d();
  public label: string;

  constructor(worldLocation: XYAndZ, label: string) {
    this.worldLocation.setFrom(worldLocation);
    this.label = label;
  }

  public drawDecoration(ctx: CanvasRenderingContext2D): void {
    ctx.font = "16px sans-serif";
    const labelHeight = ctx.measureText("M").width; // Close enough for border padding...
    const labelWidth = ctx.measureText(this.label).width + labelHeight;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "white";
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 10;
    ctx.fillRect(-(labelWidth / 2), -labelHeight, labelWidth, labelHeight * 2);
    ctx.strokeRect(-(labelWidth / 2), -labelHeight, labelWidth, labelHeight * 2);

    ctx.fillStyle = "white";
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, 0, 0);
  }

  public setPosition(vp: Viewport): boolean {
    vp.worldToView(this.worldLocation, this.position);
    this.position.y -= Math.floor(vp.pixelsFromInches(0.44)) + 0.5; // Offset from snap location...
    return vp.viewRect.containsPoint(this.position);
  }

  public addDecoration(context: DecorateContext) {
    if (this.setPosition(context.viewport))
      context.addCanvasDecoration(this);
  }
}

/** @internal */
class MeasureMarker extends Marker {
  public isSelected: boolean = false;
  constructor(label: string, title: HTMLElement, worldLocation: XYAndZ, size: XAndY) {
    super(worldLocation, size);

    const markerDrawFunc = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.arc(0, 0, this.size.x * 0.5, 0, 2 * Math.PI);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "black";
      const hilite = this.isSelected && this._hiliteColor ? this._hiliteColor.colors : undefined;
      ctx.fillStyle = undefined !== hilite ? `rgba(${hilite.r | 0},${hilite.g | 0},${hilite.b | 0}, 0.5)` : "rgba(255,255,255,.5)";
      ctx.fill();
      ctx.stroke();
    };

    this.drawFunc = markerDrawFunc; // eslint-disable-line @typescript-eslint/unbound-method
    this.title = title;
    this.label = label;
    this.labelFont = "16px sans-serif";
    this.labelColor = "black";
    this.labelMaxWidth = this.size.x * 0.75;
    this.labelOffset = { x: 0, y: -1 };
  }

  public override onMouseButton(_ev: BeButtonEvent): boolean { return true; } // Never forward event to active tool...

  public override onMouseEnter(ev: BeButtonEvent) {
    super.onMouseEnter(ev);
    if (this.title && InputSource.Touch === ev.inputSource && ev.viewport)
      ev.viewport.openToolTip(this.title, ev.viewPoint, this.tooltipOptions);
  }

  public override onMouseLeave() {
    super.onMouseLeave();
    if (this.title)
      IModelApp.notifications.clearToolTip(); // Clear tool tip from tap since we won't get a motion event...
  }
}

/** @internal */
interface Location { point: Point3d, adjustedPoint: Point3d, refAxes: Matrix3d }
/** @internal */
interface Segment { distance: number, slope: number, start: Point3d, end: Point3d, delta: Vector3d, adjustedStart: Point3d, adjustedEnd: Point3d, adjustedDelta: Vector3d, refAxes: Matrix3d, marker: MeasureMarker }

/** @internal */
function adjustPoint(ev: BeButtonEvent, segments?: Array<Segment>, locations?: Array<Location>): Point3d {
  // If the point was from a hit we must transform it by the model display tyransform of what got hit.
  if (undefined === ev.viewport || undefined === ev.viewport.view.modelDisplayTransformProvider)
    return ev.point;
  if (undefined !== IModelApp.accuSnap.currHit && undefined !== IModelApp.accuSnap.currHit.modelId) {
    if ("0" !== IModelApp.accuSnap.currHit.modelId) {
      const newPoint = ev.point.clone();
      ev.viewport.view.transformPointByModelDisplayTransform(IModelApp.accuSnap.currHit.modelId, newPoint, true);
      return newPoint;
    } else {
      // Must have snapped to a decoration, so look through previous any segments & locations for a match to get an adjusted point.
      if (undefined !== segments) {
        for (const seg of segments) {
          if (seg.start.isExactEqual(ev.point))
            return seg.adjustedStart.clone();
          if (seg.end.isExactEqual(ev.point))
            return seg.adjustedEnd.clone();
        }
      }
      if (undefined !== locations) {
        for (const loc of locations) {
          if (loc.point.isExactEqual(ev.point))
            return loc.adjustedPoint.clone();
        }
      }
    }
  }
  return ev.point;
}

/** Report distance between 2 points using current quantity formatter for length.
 * @public
 */
export class MeasureDistanceTool extends PrimitiveTool {
  public static override toolId = "Measure.Distance";
  public static override iconSpec = "icon-measure-distance";
  /** @internal */
  protected readonly _locationData = new Array<Location>();
  /** @internal */
  protected readonly _acceptedSegments = new Array<Segment>();
  /** @internal */
  protected _totalDistance: number = 0.0;
  /** @internal */
  protected _totalDistanceMarker?: MeasureLabel;
  /** @internal */
  protected _snapGeomId?: string;
  /** @internal */
  protected _lastMotionPt?: Point3d;
  /** @internal */
  protected _lastMotionAdjustedPt?: Point3d;

  /** @internal */
  protected allowView(vp: Viewport) { return vp.view.isSpatialView() || vp.view.isDrawingView(); }
  /** @internal */
  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && this.allowView(vp)); }
  /** @internal */
  public override isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; }
  /** @internal */
  public override requireWriteableTarget(): boolean { return false; }
  /** @internal */
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  /** @internal */
  public override onUnsuspend(): void { this.showPrompt(); }

  /** @internal */
  protected showPrompt(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate(0 === this._locationData.length ? "Measure.Distance.Prompts.FirstPoint" : "Measure.Distance.Prompts.NextPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Mouse));
    if (0 === this._locationData.length) {
      if (this._acceptedSegments.length > 0) {
        touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Restart"), false, ToolAssistanceInputMethod.Touch));
        mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Restart"), false, ToolAssistanceInputMethod.Mouse));
      }
    } else {
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Cancel"), false, ToolAssistanceInputMethod.Touch));
      mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Cancel"), false, ToolAssistanceInputMethod.Mouse));
      mouseInstructions.push(ToolAssistance.createModifierKeyInstruction(ToolAssistance.ctrlKey, ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AdditionalPoint"), false, ToolAssistanceInputMethod.Mouse));
      mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo([ToolAssistance.ctrlKey, "Z"]), CoreTools.translate("ElementSet.Inputs.UndoLastPoint"), false, ToolAssistanceInputMethod.Mouse));
    }

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** @internal */
  protected setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    const hints = new AccuDrawHintBuilder();
    hints.enableSmartRotation = true;
    hints.setModeRectangular();
    hints.sendHints(false);
    IModelApp.toolAdmin.setCursor(0 === this._locationData.length ? IModelApp.viewManager.crossHairCursor : IModelApp.viewManager.dynamicsCursor);
    this.showPrompt();
  }

  /** @internal */
  public override testDecorationHit(id: string): boolean { return id === this._snapGeomId; }

  /** @internal */
  protected getSnapPoints(): Point3d[] | undefined {
    if (this._acceptedSegments.length < 1 && this._locationData.length < 2)
      return undefined;

    const snapPoints: Point3d[] = [];
    for (const seg of this._acceptedSegments) {
      if (0 === snapPoints.length || !seg.start.isAlmostEqual(snapPoints[snapPoints.length - 1]))
        snapPoints.push(seg.start);
      if (!seg.end.isAlmostEqual(snapPoints[0]))
        snapPoints.push(seg.end);
    }

    if (this._locationData.length > 1)
      for (const loc of this._locationData)
        snapPoints.push(loc.point);
    return snapPoints;
  }

  /** @internal */
  public override getDecorationGeometry(_hit: HitDetail): GeometryStreamProps | undefined {
    const snapPoints = this.getSnapPoints();
    if (undefined === snapPoints)
      return undefined;
    const geomData = IModelJson.Writer.toIModelJson(PointString3d.create(snapPoints));
    return (undefined === geomData ? undefined : [geomData]);
  }

  /** @internal */
  protected displayDynamicDistance(context: DecorateContext, points: Point3d[], adjustedPoints: Point3d[]): void {
    let totalDistance = 0.0;
    for (let i = 0; i < adjustedPoints.length - 1; i++)
      totalDistance += adjustedPoints[i].distance(adjustedPoints[i + 1]);
    if (0.0 === totalDistance)
      return;

    const formatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(QuantityType.Length);
    if (undefined === formatterSpec)
      return;
    const formattedTotalDistance = IModelApp.quantityFormatter.formatQuantity(totalDistance, formatterSpec);
    const distDyn = new MeasureLabel(points[points.length - 1], formattedTotalDistance);
    distDyn.addDecoration(context);
  }

  /** @internal */
  protected displayDelta(context: DecorateContext, seg: any): void {
    const xVec = new Vector3d(seg.delta.x, 0.0, 0.0);
    const yVec = new Vector3d(0.0, seg.delta.y, 0.0);
    const zVec = new Vector3d(0.0, 0.0, seg.delta.z);

    seg.refAxes.multiplyVectorInPlace(xVec);
    seg.refAxes.multiplyVectorInPlace(yVec);
    seg.refAxes.multiplyVectorInPlace(zVec);

    const builderAxes = context.createGraphicBuilder(GraphicType.WorldOverlay);
    let basePt = seg.start.clone();

    if (xVec.magnitude() > 1.0e-5) {
      const segPoints: Point3d[] = [];
      segPoints.push(basePt); basePt = basePt.plus(xVec);
      segPoints.push(basePt);
      const colorX = ColorDef.red.adjustedForContrast(context.viewport.view.backgroundColor);
      builderAxes.setSymbology(colorX, ColorDef.black, 5);
      builderAxes.addLineString(segPoints);
    }

    if (yVec.magnitude() > 1.0e-5) {
      const segPoints: Point3d[] = [];
      segPoints.push(basePt); basePt = basePt.plus(yVec);
      segPoints.push(basePt);
      const colorY = ColorDef.green.adjustedForContrast(context.viewport.view.backgroundColor);
      builderAxes.setSymbology(colorY, ColorDef.black, 5);
      builderAxes.addLineString(segPoints);
    }

    if (zVec.magnitude() > 1.0e-5) {
      const segPoints: Point3d[] = [];
      segPoints.push(basePt); basePt = basePt.plus(zVec);
      segPoints.push(basePt);
      const colorZ = ColorDef.blue.adjustedForContrast(context.viewport.view.backgroundColor);
      builderAxes.setSymbology(colorZ, ColorDef.black, 5);
      builderAxes.addLineString(segPoints);
    }

    const segGlow = context.viewport.hilite.color.withAlpha(50);
    builderAxes.setSymbology(segGlow, ColorDef.black, 8);
    builderAxes.addLineString([seg.start, seg.end]);

    context.addDecorationFromBuilder(builderAxes);
  }

  /** @internal */
  protected createDecorations(context: DecorateContext, isSuspended: boolean): void {
    if (!this.isCompatibleViewport(context.viewport, false))
      return;

    if (!isSuspended && this._locationData.length > 0 && undefined !== this._lastMotionPt && undefined !== this._lastMotionAdjustedPt) {
      const tmpPoints: Point3d[] = [];
      const tmpAdjustedPoints: Point3d[] = [];
      for (const loc of this._locationData) {
        tmpPoints.push(loc.point); // Deep copy not necessary...
        tmpAdjustedPoints.push(loc.adjustedPoint);
      }
      tmpPoints.push(this._lastMotionPt);
      tmpAdjustedPoints.push(this._lastMotionAdjustedPt);

      const builderDynVis = context.createGraphicBuilder(GraphicType.WorldDecoration);
      const colorDynVis = context.viewport.hilite.color;

      builderDynVis.setSymbology(colorDynVis, ColorDef.black, 3);
      builderDynVis.addLineString(tmpPoints);

      context.addDecorationFromBuilder(builderDynVis);

      const builderDynHid = context.createGraphicBuilder(GraphicType.WorldOverlay);
      const colorDynHid = colorDynVis.withAlpha(100);

      builderDynHid.setSymbology(colorDynHid, ColorDef.black, 1, LinePixels.Code2);
      builderDynHid.addLineString(tmpPoints);

      context.addDecorationFromBuilder(builderDynHid);
      this.displayDynamicDistance(context, tmpPoints, tmpAdjustedPoints);
    }

    if (this._acceptedSegments.length > 0) {
      const builderAccVis = context.createGraphicBuilder(GraphicType.WorldDecoration);
      const builderAccHid = context.createGraphicBuilder(GraphicType.WorldOverlay);
      const colorAccVis = ColorDef.white.adjustedForContrast(context.viewport.view.backgroundColor);
      const colorAccHid = colorAccVis.withAlpha(100);

      builderAccVis.setSymbology(colorAccVis, ColorDef.black, 3);
      builderAccHid.setSymbology(colorAccHid, ColorDef.black, 1, LinePixels.Code2);

      for (const seg of this._acceptedSegments) {
        builderAccVis.addLineString([seg.start, seg.end]);
        builderAccHid.addLineString([seg.start, seg.end]);
        seg.marker.addDecoration(context);
        if (seg.marker.isSelected)
          this.displayDelta(context, seg);
      }

      context.addDecorationFromBuilder(builderAccVis);
      context.addDecorationFromBuilder(builderAccHid);
    }

    if (undefined !== this._totalDistanceMarker)
      this._totalDistanceMarker.addDecoration(context);

    const snapPoints = this.getSnapPoints();
    if (undefined === snapPoints)
      return;

    if (undefined === this._snapGeomId)
      this._snapGeomId = this.iModel.transientIds.next;

    const builderSnapPts = context.createGraphicBuilder(GraphicType.WorldOverlay, undefined, this._snapGeomId);
    const colorAccPts = ColorDef.white.adjustedForContrast(context.viewport.view.backgroundColor);

    builderSnapPts.setSymbology(colorAccPts, ColorDef.black, 7);
    builderSnapPts.addPointString(snapPoints);

    context.addDecorationFromBuilder(builderSnapPts);
  }

  /** @internal */
  public override decorate(context: DecorateContext): void { this.createDecorations(context, false); }
  /** @internal */
  public override decorateSuspended(context: DecorateContext): void { this.createDecorations(context, true); }

  /** @internal */
  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (this._locationData.length > 0 && undefined !== ev.viewport) {
      const point = ev.point;
      const adjustedPoint = adjustPoint(ev, this._acceptedSegments, this._locationData);
      if (undefined !== this._lastMotionPt) {
        this._lastMotionPt.setFrom(point);
        this._lastMotionAdjustedPt?.setFrom(adjustedPoint);
      } else {
        this._lastMotionPt = point.clone();
        this._lastMotionAdjustedPt = adjustedPoint;
      }
      ev.viewport.invalidateDecorations();
    }
  }

  protected reportMeasurements(): void {
    if (undefined === this._totalDistanceMarker)
      return;
    const briefMsg = `${CoreTools.translate(this._acceptedSegments.length > 1 ? "Measure.Labels.CumulativeDistance" : "Measure.Labels.Distance")}: ${this._totalDistanceMarker.label}`;
    const msgDetail = new NotifyMessageDetails(OutputMessagePriority.Info, briefMsg, undefined, OutputMessageType.Sticky);
    IModelApp.notifications.outputMessage(msgDetail);
  }

  protected async updateTotals(): Promise<void> {
    this._totalDistance = 0.0;
    this._totalDistanceMarker = undefined;
    for (const seg of this._acceptedSegments)
      this._totalDistance += seg.distance;
    if (0.0 === this._totalDistance)
      return;

    const formatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Length);
    if (undefined === formatterSpec)
      return;

    const formattedTotalDistance = IModelApp.quantityFormatter.formatQuantity(this._totalDistance, formatterSpec);
    this._totalDistanceMarker = new MeasureLabel(this._acceptedSegments[this._acceptedSegments.length - 1].end, formattedTotalDistance);
    this.reportMeasurements();
  }

  protected async getMarkerToolTip(distance: number, slope: number, start: Point3d, end: Point3d, delta?: Vector3d): Promise<HTMLElement> {
    const is3d = (undefined === this.targetView || this.targetView.view.is3d());
    const isSpatial = (undefined !== this.targetView && this.targetView.view.isSpatialView());
    const toolTip = document.createElement("div");

    const distanceFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Length);
    if (undefined === distanceFormatterSpec)
      return toolTip;

    let toolTipHtml = "";
    const formattedDistance = IModelApp.quantityFormatter.formatQuantity(distance, distanceFormatterSpec);
    toolTipHtml += `${translateBold("Distance") + formattedDistance}<br>`;

    if (is3d) {
      const angleFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Angle);
      if (undefined !== angleFormatterSpec) {
        const formattedSlope = IModelApp.quantityFormatter.formatQuantity(slope, angleFormatterSpec);
        toolTipHtml += `${translateBold("Slope") + formattedSlope}<br>`;
      }
    }

    const coordFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Coordinate);
    if (undefined !== coordFormatterSpec) {
      let startAdjusted = start;
      let endAdjusted = end;
      if (isSpatial) {
        const globalOrigin = this.iModel.globalOrigin;
        startAdjusted = startAdjusted.minus(globalOrigin);
        endAdjusted = endAdjusted.minus(globalOrigin);
      }

      {
        const formattedStartX = IModelApp.quantityFormatter.formatQuantity(startAdjusted.x, coordFormatterSpec);
        const formattedStartY = IModelApp.quantityFormatter.formatQuantity(startAdjusted.y, coordFormatterSpec);
        const formattedStartZ = IModelApp.quantityFormatter.formatQuantity(startAdjusted.z, coordFormatterSpec);
        toolTipHtml += `${translateBold("StartCoord") + formattedStartX}, ${formattedStartY}`;
        if (is3d)
          toolTipHtml += `, ${formattedStartZ}`;
        toolTipHtml += "<br>";
      }
      const formattedEndX = IModelApp.quantityFormatter.formatQuantity(endAdjusted.x, coordFormatterSpec);
      const formattedEndY = IModelApp.quantityFormatter.formatQuantity(endAdjusted.y, coordFormatterSpec);
      const formattedEndZ = IModelApp.quantityFormatter.formatQuantity(endAdjusted.z, coordFormatterSpec);
      toolTipHtml += `${translateBold("EndCoord") + formattedEndX}, ${formattedEndY}`;
      if (is3d)
        toolTipHtml += `, ${formattedEndZ}`;
      toolTipHtml += "<br>";
    }

    if (undefined !== delta) {
      const formattedDeltaX = IModelApp.quantityFormatter.formatQuantity(Math.abs(delta.x), distanceFormatterSpec);
      const formattedDeltaY = IModelApp.quantityFormatter.formatQuantity(Math.abs(delta.y), distanceFormatterSpec);
      const formattedDeltaZ = IModelApp.quantityFormatter.formatQuantity(Math.abs(delta.z), distanceFormatterSpec);
      toolTipHtml += `${translateBold("Delta") + formattedDeltaX}, ${formattedDeltaY}`;
      if (is3d)
        toolTipHtml += `, ${formattedDeltaZ}`;
      toolTipHtml += "<br>";
    }

    toolTip.innerHTML = toolTipHtml;
    return toolTip;
  }

  /** @internal */
  protected async updateSelectedMarkerToolTip(seg: any, ev: BeButtonEvent, reopenToolTip: boolean): Promise<void> {
    seg.marker.title = await this.getMarkerToolTip(seg.distance, seg.slope, seg.adjustedStart, seg.adjustedEnd, seg.marker.isSelected ? seg.adjustedDelta : undefined);
    if (!reopenToolTip || undefined === ev.viewport || !IModelApp.notifications.isToolTipOpen)
      return;
    IModelApp.notifications.clearToolTip();
    ev.viewport.openToolTip(seg.marker.title, ev.viewPoint);
  }

  /** @internal */
  protected async acceptNewSegments(): Promise<void> {
    if (this._locationData.length > 1) {
      for (let i = 0; i <= this._locationData.length - 2; i++) {
        const adjustedStart = this._locationData[i].adjustedPoint;
        const adjustedEnd = this._locationData[i + 1].adjustedPoint;
        const distance = adjustedStart.distance(adjustedEnd);
        const xyDist = adjustedStart.distanceXY(adjustedEnd);
        const zDist = adjustedEnd.z - adjustedStart.z;
        const slope = (0.0 === xyDist ? Math.PI : Math.atan(zDist / xyDist));
        const adjustedDelta = Vector3d.createStartEnd(adjustedStart, adjustedEnd);
        const refAxes = this._locationData[i].refAxes;
        refAxes.multiplyTransposeVectorInPlace(adjustedDelta);
        const start = this._locationData[i].point;
        const end = this._locationData[i + 1].point;
        const delta = Vector3d.createStartEnd(start, end);
        refAxes.multiplyTransposeVectorInPlace(delta);

        const toolTip = await this.getMarkerToolTip(distance, slope, adjustedStart, adjustedEnd);
        const marker = new MeasureMarker((this._acceptedSegments.length + 1).toString(), toolTip, start.interpolate(0.5, end), Point2d.create(25, 25));

        const segMarkerButtonFunc = (ev: BeButtonEvent) => {
          if (ev.isDown)
            return true;

          let selectedMarker: MeasureMarker | undefined;
          let pickedMarker: MeasureMarker | undefined;
          for (const seg of this._acceptedSegments) {
            if (!seg.marker.pick(ev.viewPoint))
              continue;
            selectedMarker = (seg.marker.isSelected ? undefined : seg.marker);
            pickedMarker = seg.marker;
            break;
          }

          for (const seg of this._acceptedSegments) {
            const wasSelected = seg.marker.isSelected;
            seg.marker.isSelected = (seg.marker === selectedMarker);
            if (wasSelected !== seg.marker.isSelected)
              this.updateSelectedMarkerToolTip(seg, ev, (seg.marker === pickedMarker)); // eslint-disable-line @typescript-eslint/no-floating-promises
          }

          if (undefined !== ev.viewport)
            ev.viewport.invalidateDecorations();
          return true;
        };

        marker.onMouseButton = segMarkerButtonFunc; // eslint-disable-line @typescript-eslint/unbound-method
        this._acceptedSegments.push({ distance, slope, start, end, delta, adjustedStart, adjustedEnd, adjustedDelta, refAxes, marker });
      }
    }
    this._locationData.length = 0;
    await this.updateTotals();
  }

  /** @internal */
  protected getReferenceAxes(vp?: Viewport): Matrix3d {
    const refAxes = Matrix3d.createIdentity();
    if (undefined !== vp && vp.isContextRotationRequired)
      vp.getAuxCoordRotation(refAxes);
    return refAxes;
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const point = ev.point.clone();
    const adjustedPoint = adjustPoint(ev, this._acceptedSegments, this._locationData);
    const refAxes = this.getReferenceAxes(ev.viewport);
    const zDir = refAxes.columnZ();
    const normal = refAxes.columnZ();
    const tangent = refAxes.columnX();
    const snap = IModelApp.accuSnap.getCurrSnapDetail();

    // Report xyz delta relative to world up. The surface normal and edge tangent help determine the rotation about z...
    if (undefined !== snap) {
      if (undefined !== snap.primitive) {
        const locDetail = snap.primitive.closestPoint(point, false);
        if (undefined !== locDetail && (HitGeomType.Segment === snap.geomType || snap.primitive.isInPlane(Plane3dByOriginAndUnitNormal.create(point, undefined !== snap.normal ? snap.normal : normal)!))) {
          const locRay = snap.primitive.fractionToPointAndUnitTangent(locDetail.fraction);
          tangent.setFrom(locRay.direction);
          if (undefined !== snap.normal)
            normal.setFrom(snap.normal);
        }
      } else if (undefined !== snap.normal) {
        normal.setFrom(snap.normal);
      }
    }

    if (!normal.isParallelTo(zDir, true)) {
      const yDir = zDir.unitCrossProduct(normal);
      if (undefined !== yDir) {
        yDir.unitCrossProduct(zDir, normal);
        Matrix3d.createColumnsInAxisOrder(AxisOrder.ZXY, normal, yDir, zDir, refAxes);
      }
    } else if (!tangent.isParallelTo(zDir, true)) {
      const yDir = zDir.unitCrossProduct(tangent);
      if (undefined !== yDir) {
        yDir.unitCrossProduct(zDir, tangent);
        Matrix3d.createColumnsInAxisOrder(AxisOrder.XYZ, tangent, yDir, zDir, refAxes);
      }
    }

    this._locationData.push({ point, adjustedPoint, refAxes });

    if (this._locationData.length > 1 && !ev.isControlKey)
      await this.acceptNewSegments();
    this.setupAndPromptForNextAction();
    if (undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();
    return EventHandled.No;
  }

  /** @internal */
  public override async onResetButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    if (0 === this._locationData.length) {
      this.onReinitialize();
      return EventHandled.No;
    }
    await this.acceptNewSegments();
    this.setupAndPromptForNextAction();
    if (undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();
    return EventHandled.No;
  }

  /** @internal */
  public override async onUndoPreviousStep(): Promise<boolean> {
    if (0 === this._locationData.length && 0 === this._acceptedSegments.length)
      return false;

    if (0 !== this._locationData.length) {
      this._locationData.pop();
    } else if (0 !== this._acceptedSegments.length) {
      this._acceptedSegments.pop();
    }

    if (0 === this._locationData.length && 0 === this._acceptedSegments.length) {
      this.onReinitialize();
    } else {
      await this.updateTotals();
      this.setupAndPromptForNextAction();
    }
    return true;
  }

  /** @internal */
  public onRestartTool(): void {
    const tool = new MeasureDistanceTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** Report spatial coordinate at a point as well as cartegraphic location for geolocated models using current quantity formatters.
 * @public
 */
export class MeasureLocationTool extends PrimitiveTool {
  public static override toolId = "Measure.Location";
  public static override iconSpec = "icon-measure-location";
  /** @internal */
  protected readonly _acceptedLocations: MeasureMarker[] = [];
  /** @internal */
  protected allowView(vp: Viewport) { return vp.view.isSpatialView() || vp.view.isDrawingView(); }
  /** @internal */
  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && this.allowView(vp)); }
  /** @internal */
  public override isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; }
  /** @internal */
  public override requireWriteableTarget(): boolean { return false; }
  /** @internal */
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  /** @internal */
  public override onUnsuspend(): void { this.showPrompt(); }

  /** @internal */
  protected showPrompt(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate("Measure.Location.Prompts.EnterPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Mouse));
    if (0 !== this._acceptedLocations.length) {
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Restart"), false, ToolAssistanceInputMethod.Touch));
      mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Restart"), false, ToolAssistanceInputMethod.Mouse));
    }

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** @internal */
  protected setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    this.showPrompt();
  }

  protected async getMarkerToolTip(point: Point3d): Promise<HTMLElement> {
    const is3d = (undefined === this.targetView || this.targetView.view.is3d());
    const isSpatial = (undefined !== this.targetView && this.targetView.view.isSpatialView());
    const toolTip = document.createElement("div");

    let toolTipHtml = "";
    const coordFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Coordinate);
    if (undefined !== coordFormatterSpec) {
      let pointAdjusted = point;
      if (isSpatial) {
        const globalOrigin = this.iModel.globalOrigin;
        pointAdjusted = pointAdjusted.minus(globalOrigin);
      }
      const formattedPointX = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.x, coordFormatterSpec);
      const formattedPointY = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.y, coordFormatterSpec);
      const formattedPointZ = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.z, coordFormatterSpec);
      toolTipHtml += `${translateBold("Coordinate") + formattedPointX}, ${formattedPointY}`;
      if (is3d)
        toolTipHtml += `, ${formattedPointZ}`;

      toolTipHtml += "<br>";
    }

    if (isSpatial) {
      const latLongFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.LatLong);
      if (undefined !== latLongFormatterSpec && undefined !== coordFormatterSpec) {
        try {
          const cartographic = await this.iModel.spatialToCartographic(point);
          const formattedLat = IModelApp.quantityFormatter.formatQuantity(Math.abs(cartographic.latitude), latLongFormatterSpec);
          const formattedLong = IModelApp.quantityFormatter.formatQuantity(Math.abs(cartographic.longitude), latLongFormatterSpec);
          const formattedHeight = IModelApp.quantityFormatter.formatQuantity(cartographic.height, coordFormatterSpec);
          const latDir = CoreTools.translate(cartographic.latitude < 0 ? "Measure.Labels.S" : "Measure.Labels.N");
          const longDir = CoreTools.translate(cartographic.longitude < 0 ? "Measure.Labels.W" : "Measure.Labels.E");
          toolTipHtml += `${translateBold("LatLong") + formattedLat + latDir}, ${formattedLong}${longDir}<br>`;
          toolTipHtml += `${translateBold("Altitude") + formattedHeight}<br>`;
        } catch { }
      }
    }

    toolTip.innerHTML = toolTipHtml;
    return toolTip;
  }

  /** @internal */
  public override decorate(context: DecorateContext): void { if (!this.isCompatibleViewport(context.viewport, false)) return; this._acceptedLocations.forEach((marker) => marker.addDecoration(context)); }
  /** @internal */
  public override decorateSuspended(context: DecorateContext): void { this.decorate(context); }

  protected reportMeasurements(): void {
    if (0 === this._acceptedLocations.length)
      return;
    const briefMsg = this._acceptedLocations[this._acceptedLocations.length - 1].title;
    if (undefined === briefMsg)
      return;
    const msgDetail = new NotifyMessageDetails(OutputMessagePriority.Info, briefMsg, undefined, OutputMessageType.Sticky);
    IModelApp.notifications.outputMessage(msgDetail);
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const point = ev.point.clone();
    const adjustedPoint = adjustPoint(ev);
    const toolTip = await this.getMarkerToolTip(adjustedPoint);
    const marker = new MeasureMarker((this._acceptedLocations.length + 1).toString(), toolTip, point, Point2d.create(25, 25));

    this._acceptedLocations.push(marker);
    this.reportMeasurements();
    this.setupAndPromptForNextAction();
    if (undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();
    return EventHandled.No;
  }

  /** @internal */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  /** @internal */
  public override async onUndoPreviousStep(): Promise<boolean> {
    if (0 === this._acceptedLocations.length)
      return false;

    this._acceptedLocations.pop();
    if (0 === this._acceptedLocations.length) {
      this.onReinitialize();
    } else {
      this.reportMeasurements();
      this.setupAndPromptForNextAction();
    }
    return true;
  }

  /** @internal */
  public onRestartTool(): void {
    const tool = new MeasureLocationTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** Report area defined by points using current quantity formatter for area.
 * @public
 */
export class MeasureAreaByPointsTool extends PrimitiveTool {
  public static override toolId = "Measure.AreaByPoints";
  public static override iconSpec = "icon-measure-2d";
  /** @internal */
  private _orientationValue: DialogItemValue = { value: ContextRotationId.Top };
  /** @internal */
  protected readonly _points: Point3d[] = [];
  /** @internal */
  protected _matrix?: Matrix3d;
  /** @internal */
  protected _isComplete = false;
  /** @internal */
  protected _area = 0.0;
  /** @internal */
  protected _perimeter = 0.0;
  /** @internal */
  protected _centroid = Point3d.createZero();
  /** @internal */
  protected _marker?: MeasureLabel;
  /** @internal */
  protected _acceptedMeasurement?: MeasureMarker;
  /** @internal */
  protected _lastMotionPt?: Point3d;

  /** @internal */
  public get orientation(): ContextRotationId { return this._orientationValue.value as ContextRotationId; }
  public set orientation(option: ContextRotationId) { this._orientationValue.value = option; }

  /** @internal */
  protected static _orientationName = "enumAsOrientation";
  /** @internal */
  protected static enumAsOrientationMessage(str: string) { return CoreTools.translate(`Settings.Orientation.${str}`); }
  /** @internal */
  protected static _getEnumAsOrientationDescription = (): PropertyDescription => {
    return {
      name: MeasureAreaByPointsTool._orientationName,
      displayLabel: CoreTools.translate("Settings.Orientation.Label"),
      typename: "enum",
      enum: {
        choices: [
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("Top"), value: ContextRotationId.Top },
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("Front"), value: ContextRotationId.Front },
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("Left"), value: ContextRotationId.Left },
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("Bottom"), value: ContextRotationId.Bottom },
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("Back"), value: ContextRotationId.Back },
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("Right"), value: ContextRotationId.Right },
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("View"), value: ContextRotationId.View },
          { label: MeasureAreaByPointsTool.enumAsOrientationMessage("Face"), value: ContextRotationId.Face },
        ],
      },
    };
  };

  /** @internal */
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const initialValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, MeasureAreaByPointsTool._orientationName);
    initialValue && (this._orientationValue = initialValue);
    const toolSettings = new Array<DialogItem>();
    toolSettings.push({ value: this._orientationValue, property: MeasureAreaByPointsTool._getEnumAsOrientationDescription(), editorPosition: { rowPriority: 0, columnIndex: 2 } });
    return toolSettings;
  }

  /** @internal */
  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === MeasureAreaByPointsTool._orientationName) {
      this._orientationValue = updatedValue.value;
      if (!this._orientationValue)
        return false;
      this.onReinitialize();
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: MeasureAreaByPointsTool._orientationName, value: this._orientationValue });
      return true;
    }
    return false;
  }

  /** @internal */
  protected allowView(vp: Viewport) { return vp.view.isSpatialView() || vp.view.isDrawingView(); }
  /** @internal */
  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && this.allowView(vp)); }
  /** @internal */
  public override isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; }
  /** @internal */
  public override requireWriteableTarget(): boolean { return false; }
  /** @internal */
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  /** @internal */
  public override onUnsuspend(): void { this.showPrompt(); }

  /** @internal */
  protected showPrompt(): void {
    let mainMsg = "Measure.AreaByPoints.Prompts.";
    switch (this._points.length) {
      case 0:
        mainMsg += "FirstPoint";
        break;
      case 1:
        mainMsg += "SecondPoint";
        break;
      case 2:
        mainMsg += "ThirdPoint";
        break;
      default:
        mainMsg += this._isComplete ? "FirstPoint" : "NextPoint";
        break;
    }
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate(mainMsg));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate(this._isComplete ? "ElementSet.Inputs.Restart" : "ElementSet.Inputs.AcceptPoint");
    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));

    const resetMsg = CoreTools.translate("ElementSet.Inputs.Restart");
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, resetMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, resetMsg, false, ToolAssistanceInputMethod.Mouse));

    if (this._points.length > 1)
      mouseInstructions.push(ToolAssistance.createModifierKeyInstruction(ToolAssistance.ctrlKey, ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AdditionalPoint"), false, ToolAssistanceInputMethod.Mouse));
    if (0 !== this._points.length)
      mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo([ToolAssistance.ctrlKey, "Z"]), CoreTools.translate("ElementSet.Inputs.UndoLastPoint"), false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** @internal */
  protected setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    this.showPrompt();

    if (this._isComplete) {
      AccuDrawHintBuilder.deactivate();
      return;
    }

    if (0 === this._points.length)
      return;

    const hints = new AccuDrawHintBuilder();
    hints.setOrigin(this._points[this._points.length - 1]);
    if (this._matrix) {
      if (1 === this._points.length) {
        hints.setMatrix(this._matrix);
        hints.setModeRectangular();
      } else if (this._points.length > 1 && !(this._points[this._points.length - 1].isAlmostEqual(this._points[this._points.length - 2]))) {
        const xVec = Vector3d.createStartEnd(this._points[this._points.length - 2], this._points[this._points.length - 1]);
        const zVec = this._matrix.getColumn(2);
        const matrix = Matrix3d.createRigidFromColumns(xVec, zVec, AxisOrder.XZY);
        if (undefined !== matrix)
          hints.setMatrix(matrix); // Rotate AccuDraw x axis to last segment preserving current up vector...
      }
    }
    hints.setLockZ = true;
    hints.sendHints();
  }

  /** @internal */
  protected getShapePoints(cursorPt: Point3d): Point3d[] {
    const points: Point3d[] = [];
    if (undefined === this.targetView || this._points.length < 1)
      return points;
    for (const pt of this._points)
      points.push(pt.clone());

    if (this._isComplete || !this._matrix)
      return points;

    const normal = this._matrix.getColumn(2);
    let currentPt = AccuDrawHintBuilder.projectPointToPlaneInView(cursorPt, points[0], normal, this.targetView, true);
    if (undefined === currentPt)
      currentPt = cursorPt.clone();
    if (2 === points.length && 0 === (IModelApp.toolAdmin.currentInputState.qualifiers & BeModifierKeys.Control)) {
      const xDir = Vector3d.createStartEnd(points[0], points[1]);
      const xLen = xDir.magnitude(); xDir.normalizeInPlace();
      const yDir = xDir.crossProduct(normal); yDir.normalizeInPlace();
      const cornerPt = AccuDrawHintBuilder.projectPointToLineInView(currentPt, points[1], yDir, this.targetView, true);
      if (undefined !== cornerPt) {
        points.push(cornerPt);
        cornerPt.plusScaled(xDir, -xLen, currentPt);
      }
    }
    points.push(currentPt);

    if (points.length > 2)
      points.push(points[0].clone());

    return points;
  }

  /** @internal */
  public override decorate(context: DecorateContext): void {
    if (context.viewport !== this.targetView)
      return;

    if (undefined === this._lastMotionPt)
      return;
    const points = this.getShapePoints(this._lastMotionPt);
    if (points.length < 2)
      return;

    const builderAccVis = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const builderAccHid = context.createGraphicBuilder(GraphicType.WorldOverlay);
    const colorAccVis = ColorDef.white.adjustedForContrast(context.viewport.view.backgroundColor);
    const colorAccHid = colorAccVis.withAlpha(100);
    const fillAccVis = context.viewport.hilite.color.withAlpha(50);

    builderAccVis.setSymbology(colorAccVis, fillAccVis, 3);
    builderAccHid.setSymbology(colorAccHid, fillAccVis, 1, LinePixels.Code2);

    if (points.length > 2)
      builderAccHid.addShape(points);

    builderAccVis.addLineString(points);
    builderAccHid.addLineString(points);

    context.addDecorationFromBuilder(builderAccVis);
    context.addDecorationFromBuilder(builderAccHid);

    if (undefined !== this._acceptedMeasurement)
      this._acceptedMeasurement.addDecoration(context);
    if (undefined !== this._marker)
      this._marker.addDecoration(context);
  }

  /** @internal */
  public override decorateSuspended(context: DecorateContext): void { if (this._isComplete) this.decorate(context); }

  /** @internal */
  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (this._points.length > 0 && undefined !== ev.viewport && !this._isComplete) {
      if (undefined !== this._lastMotionPt)
        this._lastMotionPt.setFrom(ev.point);
      else
        this._lastMotionPt = ev.point.clone();
      ev.viewport.invalidateDecorations();
    }
  }

  protected async getMarkerToolTip(): Promise<HTMLElement> {
    const is3d = (undefined === this.targetView || this.targetView.view.is3d());
    const isSpatial = (undefined !== this.targetView && this.targetView.view.isSpatialView());
    const toolTip = document.createElement("div");
    let toolTipHtml = "";

    const areaFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Area);
    if (undefined !== areaFormatterSpec) {
      const formattedArea = IModelApp.quantityFormatter.formatQuantity(this._area, areaFormatterSpec);
      toolTipHtml += `${translateBold("Area") + formattedArea}<br>`;
    }
    const perimeterFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Length);
    if (undefined !== perimeterFormatterSpec) {
      const formattedPerimeter = IModelApp.quantityFormatter.formatQuantity(this._perimeter, perimeterFormatterSpec);
      toolTipHtml += `${translateBold("Perimeter") + formattedPerimeter}<br>`;
    }
    const coordFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Coordinate);
    if (undefined !== coordFormatterSpec) {
      let pointAdjusted = this._centroid.clone();
      if (isSpatial) {
        const globalOrigin = this.iModel.globalOrigin;
        pointAdjusted = pointAdjusted.minus(globalOrigin);
      }
      const formattedPointX = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.x, coordFormatterSpec);
      const formattedPointY = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.y, coordFormatterSpec);
      const formattedPointZ = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.z, coordFormatterSpec);
      toolTipHtml += `${translateBold("Centroid") + formattedPointX}, ${formattedPointY}`;
      if (is3d)
        toolTipHtml += `, ${formattedPointZ}`;

      toolTipHtml += "<br>";
    }

    toolTip.innerHTML = toolTipHtml;
    return toolTip;
  }

  protected reportMeasurements(): void {
    if (undefined === this._marker)
      return;
    const briefMsg = `${CoreTools.translate("Measure.Labels.Area")}: ${this._marker.label}`;
    const msgDetail = new NotifyMessageDetails(OutputMessagePriority.Info, briefMsg, undefined, OutputMessageType.Sticky);
    IModelApp.notifications.outputMessage(msgDetail);
  }

  protected async updateTotals(): Promise<void> {
    if (this._points.length < 3)
      return;

    const result = PolygonOps.centroidAreaNormal(this._points);
    if (undefined === result)
      return;

    this._area = result.a ? result.a : 0.0;
    this._centroid.setFrom(result.origin);
    this._perimeter = 0.0;
    for (let i = 1; i < this._points.length; i++)
      this._perimeter += (this._points[i - 1].distance(this._points[i]));

    const toolTip = await this.getMarkerToolTip();
    this._acceptedMeasurement = new MeasureMarker("1", toolTip, this._centroid, Point2d.create(25, 25));
    this._marker = undefined;

    const areaFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Area);
    if (undefined === areaFormatterSpec)
      return;
    const formattedTotalArea = IModelApp.quantityFormatter.formatQuantity(this._area, areaFormatterSpec);
    this._marker = new MeasureLabel(this._centroid, formattedTotalArea);

    this.reportMeasurements();
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this.targetView)
      return EventHandled.No;

    if (this._isComplete)
      this.onReinitialize();

    if (this._points.length > 1 && !ev.isControlKey) {
      const points = this.getShapePoints(ev.point);
      if (points.length < 3)
        return EventHandled.No;

      this._isComplete = true;
      this._points.length = 0;
      for (const pt of points) this._points.push(pt);

      await this.updateTotals();
      this.setupAndPromptForNextAction();
      return EventHandled.No;
    }

    if (undefined === this._matrix && undefined === (this._matrix = AccuDrawHintBuilder.getContextRotation(this.orientation, this.targetView)))
      return EventHandled.No;

    const currPt = ev.point.clone();
    if (this._points.length > 0) {
      const planePt = AccuDrawHintBuilder.projectPointToPlaneInView(currPt, this._points[0], this._matrix.getColumn(2), ev.viewport!, true);
      if (undefined !== planePt)
        currPt.setFrom(planePt);
    }

    this._points.push(currPt);
    this.setupAndPromptForNextAction();

    return EventHandled.No;
  }

  /** @internal */
  public override async onResetButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();
    this.onReinitialize();
    return EventHandled.No;
  }

  /** @internal */
  public override onReinitialize(): void {
    this._acceptedMeasurement = undefined;
    this._marker = undefined;
    this._isComplete = false;
    this._points.length = 0;
    this._matrix = undefined;
    AccuDrawHintBuilder.deactivate();
    this.setupAndPromptForNextAction();
  }

  /** @internal */
  public override async onUndoPreviousStep(): Promise<boolean> {
    if (0 === this._points.length || this._isComplete)
      return false;

    this._points.pop();
    this.setupAndPromptForNextAction();
    return true;
  }

  /** @internal */
  public onRestartTool(): void {
    const tool = new MeasureAreaByPointsTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** Base class for mass properties tools.
 * @public
 */
export abstract class MeasureElementTool extends PrimitiveTool {
  /** @internal */
  protected readonly _checkedIds = new Map<Id64String, MassPropertiesResponseProps>();
  /** @internal */
  protected readonly _acceptedIds: Id64Array = [];
  /** @internal */
  protected readonly _acceptedMeasurements: MeasureMarker[] = [];
  /** @internal */
  protected _totalValue: number = 0.0;
  /** @internal */
  protected _totalMarker?: MeasureLabel;
  /** @internal */
  protected _useSelection: boolean = false;

  protected abstract getOperation(): MassPropertiesOperation;

  /** @internal */
  protected allowView(vp: Viewport) { return (MassPropertiesOperation.AccumulateVolumes === this.getOperation() ? vp.view.isSpatialView() : (vp.view.isSpatialView() || vp.view.isDrawingView())); }
  /** @internal */
  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && this.allowView(vp)); }
  /** @internal */
  public override requireWriteableTarget(): boolean { return false; }
  /** @internal */
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  /** @internal */
  public override onCleanup(): void { if (0 !== this._acceptedIds.length) this.iModel.hilited.setHilite(this._acceptedIds, false); }
  /** @internal */
  public override onUnsuspend(): void { this.showPrompt(); }

  /** @internal */
  protected showPrompt(): void {
    const mainMsg = (this._useSelection ? (0 === this._acceptedMeasurements.length ? "ElementSet.Prompts.ConfirmSelection" : "ElementSet.Prompts.InspectResult") : "ElementSet.Prompts.IdentifyElement");
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate(mainMsg));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (this._useSelection) {
      if (0 === this._acceptedMeasurements.length) {
        touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptSelection"), false, ToolAssistanceInputMethod.Touch));
        mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptSelection"), false, ToolAssistanceInputMethod.Mouse));
        touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.RejectSelection"), false, ToolAssistanceInputMethod.Touch));
        mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.RejectSelection"), false, ToolAssistanceInputMethod.Mouse));
      } else {
        touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Touch));
        mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Mouse));
      }
    } else {
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptElement"), false, ToolAssistanceInputMethod.Touch));
      mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptElement"), false, ToolAssistanceInputMethod.Mouse));
      if (0 !== this._acceptedMeasurements.length) {
        touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Restart"), false, ToolAssistanceInputMethod.Touch));
        mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Restart"), false, ToolAssistanceInputMethod.Mouse));
      }
    }

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** @internal */
  protected setupAndPromptForNextAction(): void {
    this._useSelection = (undefined !== this.targetView && this.targetView.iModel.selectionSet.isActive);
    if (!this._useSelection)
      this.initLocateElements();
    this.showPrompt();
  }

  /** @internal */
  public override decorate(context: DecorateContext): void { if (!this.isCompatibleViewport(context.viewport, false)) return; this._acceptedMeasurements.forEach((marker) => marker.addDecoration(context)); if (undefined !== this._totalMarker) this._totalMarker.addDecoration(context); }
  /** @internal */
  public override decorateSuspended(context: DecorateContext): void { this.decorate(context); }

  protected reportMeasurements(): void {
    if (undefined === this._totalMarker)
      return;
    let label = "Measure.Labels.";
    switch (this.getOperation()) {
      case MassPropertiesOperation.AccumulateLengths:
        label += "Length";
        break;
      case MassPropertiesOperation.AccumulateAreas:
        label += "Area";
        break;
      case MassPropertiesOperation.AccumulateVolumes:
        label += "Volume";
        break;
      default:
        return;
    }
    const briefMsg = `${CoreTools.translate(label)}: ${this._totalMarker.label}`;
    const msgDetail = new NotifyMessageDetails(OutputMessagePriority.Info, briefMsg, undefined, OutputMessageType.Sticky);
    IModelApp.notifications.outputMessage(msgDetail);
  }

  protected async getMarkerToolTip(responseProps: MassPropertiesResponseProps): Promise<HTMLElement> {
    const is3d = (undefined === this.targetView || this.targetView.view.is3d());
    const isSpatial = (undefined !== this.targetView && this.targetView.view.isSpatialView());
    const toolTip = document.createElement("div");
    let toolTipHtml = "";

    switch (this.getOperation()) {
      case MassPropertiesOperation.AccumulateLengths: {
        const distanceFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Length);
        if (undefined !== distanceFormatterSpec) {
          const formattedLength = IModelApp.quantityFormatter.formatQuantity(responseProps.length ? responseProps.length : 0, distanceFormatterSpec);
          toolTipHtml += `${translateBold("Length") + formattedLength}<br>`;
        }
        break;
      }
      case MassPropertiesOperation.AccumulateAreas: {
        const areaFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Area);
        if (undefined !== areaFormatterSpec) {
          const formattedArea = IModelApp.quantityFormatter.formatQuantity(responseProps.area ? responseProps.area : 0, areaFormatterSpec);
          toolTipHtml += `${translateBold("Area") + formattedArea}<br>`;
        }
        if (responseProps.perimeter) {
          const perimeterFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Length);
          if (undefined !== perimeterFormatterSpec) {
            const formattedPerimeter = IModelApp.quantityFormatter.formatQuantity(responseProps.perimeter, perimeterFormatterSpec);
            toolTipHtml += `${translateBold("Perimeter") + formattedPerimeter}<br>`;
          }
        }
        break;
      }
      case MassPropertiesOperation.AccumulateVolumes: {
        const volumeFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Volume);
        if (undefined !== volumeFormatterSpec) {
          const formattedVolume = IModelApp.quantityFormatter.formatQuantity(responseProps.volume ? responseProps.volume : 0, volumeFormatterSpec);
          toolTipHtml += `${translateBold("Volume") + formattedVolume}<br>`;
        }
        if (responseProps.area) {
          const areaFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Area);
          if (undefined !== areaFormatterSpec) {
            const formattedArea = IModelApp.quantityFormatter.formatQuantity(responseProps.area, areaFormatterSpec);
            toolTipHtml += `${translateBold("Area") + formattedArea}<br>`;
          }
        }
        break;
      }
    }

    if (responseProps.centroid) {
      const coordFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Coordinate);
      if (undefined !== coordFormatterSpec) {
        let pointAdjusted = Point3d.fromJSON(responseProps.centroid);
        if (isSpatial) {
          const globalOrigin = this.iModel.globalOrigin;
          pointAdjusted = pointAdjusted.minus(globalOrigin);
        }
        const formattedPointX = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.x, coordFormatterSpec);
        const formattedPointY = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.y, coordFormatterSpec);
        const formattedPointZ = IModelApp.quantityFormatter.formatQuantity(pointAdjusted.z, coordFormatterSpec);
        toolTipHtml += `${translateBold("Centroid") + formattedPointX}, ${formattedPointY}`;
        if (is3d)
          toolTipHtml += `, ${formattedPointZ}`;
        toolTipHtml += "<br>";
      }
    }

    toolTip.innerHTML = toolTipHtml;
    return toolTip;
  }

  private getResultValue(operation: MassPropertiesOperation, result: MassPropertiesResponseProps): number {
    switch (operation) {
      case MassPropertiesOperation.AccumulateLengths:
        return (result.length ? result.length : 0.0);
      case MassPropertiesOperation.AccumulateAreas:
        return (result.area ? result.area : 0.0);
      case MassPropertiesOperation.AccumulateVolumes:
        return (result.volume ? result.volume : 0.0);
    }
  }

  protected async updateTotals(selectionSetResult?: MassPropertiesResponseProps): Promise<void> {
    this._totalValue = 0.0;
    this._totalMarker = undefined;

    let labelPt;
    const operation = this.getOperation();
    if (undefined !== selectionSetResult) {
      labelPt = Point3d.fromJSON(selectionSetResult.centroid);
      this._totalValue += this.getResultValue(operation, selectionSetResult);
    } else if (0 !== this._acceptedIds.length) {
      for (const id of this._acceptedIds) {
        const result = this._checkedIds.get(id);
        if (undefined === result)
          continue;
        labelPt = Point3d.fromJSON(result.centroid);
        this._totalValue += this.getResultValue(operation, result);
      }
    }
    if (0.0 === this._totalValue || undefined === labelPt)
      return;

    switch (operation) {
      case MassPropertiesOperation.AccumulateLengths:
        const distanceFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Length);
        if (undefined === distanceFormatterSpec)
          return;
        const formattedTotalDistance = IModelApp.quantityFormatter.formatQuantity(this._totalValue, distanceFormatterSpec);
        this._totalMarker = new MeasureLabel(labelPt, formattedTotalDistance);
        break;
      case MassPropertiesOperation.AccumulateAreas:
        const areaFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Area);
        if (undefined === areaFormatterSpec)
          return;
        const formattedTotalArea = IModelApp.quantityFormatter.formatQuantity(this._totalValue, areaFormatterSpec);
        this._totalMarker = new MeasureLabel(labelPt, formattedTotalArea);
        break;
      case MassPropertiesOperation.AccumulateVolumes:
        const volumeFormatterSpec = await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Volume);
        if (undefined === volumeFormatterSpec)
          return;
        const formattedTotalVolume = IModelApp.quantityFormatter.formatQuantity(this._totalValue, volumeFormatterSpec);
        this._totalMarker = new MeasureLabel(labelPt, formattedTotalVolume);
        break;
    }

    this.reportMeasurements();
  }

  /** @internal */
  public async doMeasureSelectedElements(viewport: Viewport): Promise<void> {
    const candidates: Id64Array = [];
    viewport.iModel.selectionSet.elements.forEach((val) => { if (!Id64.isInvalid(val) && !Id64.isTransient(val)) candidates.push(val); });
    if (0 === candidates.length)
      return;

    const requestProps: MassPropertiesRequestProps = {
      operation: this.getOperation(),
      candidates,
    };
    const result = await this.iModel.getMassProperties(requestProps);
    if (BentleyStatus.SUCCESS !== result.status)
      return;

    const toolTip = await this.getMarkerToolTip(result);
    const point = Point3d.fromJSON(result.centroid);
    const marker = new MeasureMarker((this._acceptedMeasurements.length + 1).toString(), toolTip, point, Point2d.create(25, 25));

    this._acceptedMeasurements.push(marker);
    await this.updateTotals(result);
    this.setupAndPromptForNextAction();

    if (undefined !== viewport)
      viewport.invalidateDecorations();
  }

  /** @internal */
  public override async filterHit(hit: HitDetail, _out?: LocateResponse): Promise<LocateFilterStatus> {
    if (!hit.isElementHit)
      return LocateFilterStatus.Reject;

    let result = this._checkedIds.get(hit.sourceId);
    if (undefined === result) {
      const requestProps: MassPropertiesRequestProps = {
        operation: this.getOperation(),
        candidates: [hit.sourceId],
      };
      result = await this.iModel.getMassProperties(requestProps);
      this._checkedIds.set(hit.sourceId, result);
    }

    return (BentleyStatus.SUCCESS === result.status ? LocateFilterStatus.Accept : LocateFilterStatus.Reject);
  }

  /** @internal */
  public override onReinitialize(): void {
    if (this._useSelection) {
      this.exitTool();
      return;
    }
    this.onRestartTool();
  }

  /** @internal */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (this._useSelection) {
      if (0 === this._acceptedMeasurements.length && undefined !== ev.viewport) {
        await this.doMeasureSelectedElements(ev.viewport);
        if (0 !== this._acceptedMeasurements.length)
          return EventHandled.Yes;
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, CoreTools.translate("ElementSet.Error.NotSupportedElmType")));
        this.onReinitialize();
      }
      return EventHandled.Yes;
    }

    const hit = await IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    if (undefined === hit || !hit.isElementHit)
      return EventHandled.No;

    const result = this._checkedIds.get(hit.sourceId);
    if (undefined === result)
      return EventHandled.No;
    if (-1 !== this._acceptedIds.indexOf(hit.sourceId))
      return EventHandled.Yes; // Already accepted, not rejected in filterHit to avoid showing "not" cursor...

    const toolTip = await this.getMarkerToolTip(result);
    const point = result.centroid ? Point3d.fromJSON(result.centroid) : ev.point.clone();
    const marker = new MeasureMarker((this._acceptedMeasurements.length + 1).toString(), toolTip, point, Point2d.create(25, 25));

    this._acceptedMeasurements.push(marker);
    this._acceptedIds.push(hit.sourceId);
    this.iModel.hilited.setHilite(hit.sourceId, true);

    await this.updateTotals();
    this.setupAndPromptForNextAction();

    if (undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();
    return EventHandled.No;
  }

  /** @internal */
  public override async onUndoPreviousStep(): Promise<boolean> {
    if (0 === this._acceptedMeasurements.length)
      return false;

    this._acceptedMeasurements.pop();
    if (0 === this._acceptedMeasurements.length) {
      this.onReinitialize();
    } else {
      if (0 !== this._acceptedIds.length) { this.iModel.hilited.setHilite(this._acceptedIds[this._acceptedIds.length - 1], false); this._acceptedIds.pop(); }
      await this.updateTotals();
      this.setupAndPromptForNextAction();
    }
    return true;
  }
}

/** Report accumulated lengths of selected elements using the current quantity formatter for length.
 * @public
 */
export class MeasureLengthTool extends MeasureElementTool {
  public static override toolId = "Measure.Length";
  public static override iconSpec = "icon-measure";
  protected getOperation(): MassPropertiesOperation { return MassPropertiesOperation.AccumulateLengths; }

  /** @internal */
  public onRestartTool(): void {
    const tool = new MeasureLengthTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** Report accumulated areas of selected elements using the current quantity formatter for area.
 * @public
 */
export class MeasureAreaTool extends MeasureElementTool {
  public static override toolId = "Measure.Area";
  public static override iconSpec = "icon-measure-area";
  protected getOperation(): MassPropertiesOperation { return MassPropertiesOperation.AccumulateAreas; }

  /** @internal */
  public onRestartTool(): void {
    const tool = new MeasureAreaTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** Report accumulated volumes of selected elements using the current quantity formatter for volume.
 * @public
 */
export class MeasureVolumeTool extends MeasureElementTool {
  public static override toolId = "Measure.Volume";
  public static override iconSpec = "icon-measure-3d";
  protected getOperation(): MassPropertiesOperation { return MassPropertiesOperation.AccumulateVolumes; }

  /** @internal */
  public onRestartTool(): void {
    const tool = new MeasureVolumeTool();
    if (!tool.run())
      this.exitTool();
  }
}
