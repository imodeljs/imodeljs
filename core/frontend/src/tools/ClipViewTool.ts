/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { BeEvent, Id64, Id64Arg } from "@bentley/bentleyjs-core";
import {
  AxisOrder, ClipMaskXYZRangePlanes, ClipPlane, ClipPrimitive, ClipShape, ClipUtilities, ClipVector, ConvexClipPlaneSet, FrameBuilder, Geometry, GeometryQuery,
  GrowableXYZArray, LineString3d, Loop, Matrix3d, Path, Plane3dByOriginAndUnitNormal, Point3d, PolygonOps, PolylineOps, Range1d, Range3d, Ray3d,
  Transform, Vector3d,
} from "@bentley/geometry-core";
import { ClipStyle, ColorDef, LinePixels, Placement2d, Placement2dProps, Placement3d } from "@bentley/imodeljs-common";
import { DialogItem, DialogItemValue, DialogPropertySyncItem, PropertyDescription } from "@bentley/ui-abstract";
import { AccuDrawHintBuilder, ContextRotationId } from "../AccuDraw";
import { CoordSystem } from "../CoordSystem";
import { LocateResponse } from "../ElementLocateManager";
import { HitDetail } from "../HitDetail";
import { IModelApp } from "../IModelApp";
import { GraphicBuilder, GraphicType } from "../render/GraphicBuilder";
import { DecorateContext } from "../ViewContext";
import { ScreenViewport, Viewport } from "../Viewport";
import { EditManipulator } from "./EditManipulator";
import { PrimitiveTool } from "./PrimitiveTool";
import { BeButtonEvent, CoordinateLockOverrides, CoreTools, EventHandled } from "./Tool";
import { ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection } from "./ToolAssistance";

// cSpell:ignore geti

/** An object that can react to a view's clip being changed by tools or modify handles.
 * @public
 */
export interface ViewClipEventHandler {
  /** Add newly created clip geometry to selection set and show modify controls. */
  selectOnCreate(): boolean;
  /** Stop displaying clip geometry when clip is removed from the selection set. */
  clearOnDeselect(): boolean;
  /** Called by tools that set or replace the existing view clip with a new clip. */
  onNewClip(viewport: Viewport): void;
  /** Called by tools that add a single plane to the view clip. When there is more than one plane, the new plane is always last. */
  onNewClipPlane(viewport: Viewport): void;
  /** Called by tools after modifying the view clip. */
  onModifyClip(viewport: Viewport): void;
  /** Called when the view clip is cleared from the view. */
  onClearClip(viewport: Viewport): void;
  /** Called when user right clicks on clip geometry or clip modify handle. Return true if event handled. */
  onRightClick(hit: HitDetail, ev: BeButtonEvent): boolean;
}

/** @internal Options to control display for ViewClipTool.drawClip */
export interface DrawClipOptions {
  /** Color to use for clip edges, uses white adjusted for background color if not specified. */
  color?: ColorDef;
  /** Color to use for clip plane fill, uses transparent cyan adjusted for background color if not specified. */
  fill?: ColorDef;
  /** Width for visible clip edges, uses 3 if not specified. */
  visibleWidth?: number;
  /** Width for hidden clip edges, uses 1 if not specified. */
  hiddenWidth?: number;
  /** Style for hidden clip edges, uses LinePixels.Code2 if not specified. */
  hiddenStyle?: LinePixels;
  /** Whether to draw filled clip planes. */
  fillClipPlanes?: boolean;
  /** Whether clip represents a single section plane with additional planes for xy and back clipping. Fill will only apply to the primary plane. */
  hasPrimaryPlane?: boolean;
  /** Unique id to allow clip edges to be pickable. */
  id?: string;
}

/** A tool to define a clip volume for a view
 * @public
 */
export class ViewClipTool extends PrimitiveTool {
  constructor(protected _clipEventHandler?: ViewClipEventHandler) { super(); }

  /** @internal */
  protected static _orientationName = "enumAsOrientation";
  /** @internal */
  protected static enumAsOrientationMessage(str: string) { return CoreTools.translate(`Settings.Orientation.${str}`); }
  /** @internal */
  protected static _getEnumAsOrientationDescription = (): PropertyDescription => {
    return {
      name: ViewClipTool._orientationName,
      displayLabel: CoreTools.translate("Settings.Orientation.Label"),
      typename: "enum",
      enum: {
        choices: [
          { label: ViewClipTool.enumAsOrientationMessage("Top"), value: ContextRotationId.Top },
          { label: ViewClipTool.enumAsOrientationMessage("Front"), value: ContextRotationId.Front },
          { label: ViewClipTool.enumAsOrientationMessage("Left"), value: ContextRotationId.Left },
          { label: ViewClipTool.enumAsOrientationMessage("Bottom"), value: ContextRotationId.Bottom },
          { label: ViewClipTool.enumAsOrientationMessage("Back"), value: ContextRotationId.Back },
          { label: ViewClipTool.enumAsOrientationMessage("Right"), value: ContextRotationId.Right },
          { label: ViewClipTool.enumAsOrientationMessage("View"), value: ContextRotationId.View },
          { label: ViewClipTool.enumAsOrientationMessage("Face"), value: ContextRotationId.Face },
        ],
      },
    };
  };

  /** @internal */
  public override requireWriteableTarget(): boolean { return false; }
  /** @internal */
  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && vp.view.allow3dManipulations()); }

  /** @internal */
  public override onPostInstall(): void { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  /** @internal */
  public override onUnsuspend(): void { this.showPrompt(); }
  /** @internal */
  public onRestartTool(): void { this.exitTool(); }
  /** @internal */
  protected showPrompt(): void { }
  /** @internal */
  protected setupAndPromptForNextAction(): void { this.showPrompt(); }
  /** @internal */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { this.onReinitialize(); return EventHandled.No; }

  /** @internal */
  public static getPlaneInwardNormal(orientation: ContextRotationId, viewport: Viewport): Vector3d | undefined {
    const matrix = AccuDrawHintBuilder.getContextRotation(orientation, viewport);
    if (undefined === matrix)
      return undefined;
    return matrix.getColumn(2).negate();
  }

  public static enableClipVolume(viewport: Viewport): boolean {
    if (viewport.viewFlags.clipVolume)
      return false;
    const viewFlags = viewport.viewFlags.clone();
    viewFlags.clipVolume = true;
    viewport.viewFlags = viewFlags;
    return true;
  }

  public static setViewClip(viewport: Viewport, clip?: ClipVector): boolean {
    viewport.view.setViewClip(clip);
    viewport.setupFromView();
    return true;
  }

  public static doClipToConvexClipPlaneSet(viewport: Viewport, planes: ConvexClipPlaneSet): boolean {
    const prim = ClipPrimitive.createCapture(planes);
    const clip = ClipVector.createEmpty();
    clip.appendReference(prim);
    return this.setViewClip(viewport, clip);
  }

  public static doClipToPlane(viewport: Viewport, origin: Point3d, normal: Vector3d, clearExistingPlanes: boolean): boolean {
    const plane = Plane3dByOriginAndUnitNormal.create(origin, normal);
    if (undefined === plane)
      return false;
    let planeSet: ConvexClipPlaneSet | undefined;
    if (!clearExistingPlanes) {
      const existingClip = viewport.view.getViewClip();
      if (undefined !== existingClip && 1 === existingClip.clips.length) {
        const existingPrim = existingClip.clips[0];
        if (!(existingPrim instanceof ClipShape)) {
          const existingPlaneSets = existingPrim.fetchClipPlanesRef();
          if (undefined !== existingPlaneSets && 1 === existingPlaneSets.convexSets.length)
            planeSet = existingPlaneSets.convexSets[0];
        }
      }
    }
    if (undefined === planeSet)
      planeSet = ConvexClipPlaneSet.createEmpty();
    planeSet.addPlaneToConvexSet(ClipPlane.createPlane(plane));
    return this.doClipToConvexClipPlaneSet(viewport, planeSet);
  }

  public static doClipToShape(viewport: Viewport, xyPoints: Point3d[], transform?: Transform, zLow?: number, zHigh?: number): boolean {
    const clip = ClipVector.createEmpty();
    clip.appendShape(xyPoints, zLow, zHigh, transform);
    return this.setViewClip(viewport, clip);
  }

  public static doClipToRange(viewport: Viewport, range: Range3d, transform?: Transform): boolean {
    if (range.isNull || range.isAlmostZeroX || range.isAlmostZeroY)
      return false;
    const clip = ClipVector.createEmpty();
    const block = ClipShape.createBlock(range, range.isAlmostZeroZ ? ClipMaskXYZRangePlanes.XAndY : ClipMaskXYZRangePlanes.All, false, false, transform);
    clip.appendReference(block);
    return this.setViewClip(viewport, clip);
  }

  public static doClipClear(viewport: Viewport): boolean {
    if (!ViewClipTool.hasClip(viewport))
      return false;
    return this.setViewClip(viewport);
  }

  /** @internal */
  public static getClipRayTransformed(origin: Point3d, direction: Vector3d, transform?: Transform): Ray3d {
    const facePt = origin.clone();
    const faceDir = direction.clone();

    if (undefined !== transform) {
      transform.multiplyPoint3d(facePt, facePt);
      transform.multiplyVector(faceDir, faceDir);
      faceDir.normalizeInPlace();
    }

    return Ray3d.createCapture(facePt, faceDir);
  }

  /** @internal */
  public static getOffsetValueTransformed(offset: number, transform?: Transform) {
    if (undefined === transform)
      return offset;
    const lengthVec = Vector3d.create(offset);
    transform.multiplyVector(lengthVec, lengthVec);
    const localOffset = lengthVec.magnitude();
    return (offset < 0 ? -localOffset : localOffset);
  }

  /** @internal */
  public static addClipPlanesLoops(builder: GraphicBuilder, loops: GeometryQuery[], outline: boolean): void {
    for (const geom of loops) {
      if (!(geom instanceof Loop))
        continue;
      if (outline)
        builder.addPath(Path.createArray(geom.children));
      else
        builder.addLoop(geom);
    }
  }

  /** @internal */
  private static addClipShape(builder: GraphicBuilder, shape: ClipShape, extents: Range1d): void {
    const shapePtsLo = ViewClipTool.getClipShapePoints(shape, extents.low);
    const shapePtsHi = ViewClipTool.getClipShapePoints(shape, extents.high);
    for (let i: number = 0; i < shapePtsLo.length; i++)
      builder.addLineString([shapePtsLo[i].clone(), shapePtsHi[i].clone()]);
    builder.addLineString(shapePtsLo);
    builder.addLineString(shapePtsHi);
  }

  /** @internal */
  public static drawClip(context: DecorateContext, clip: ClipVector, viewExtents?: Range3d, options?: DrawClipOptions): void {
    const clipShape = ViewClipTool.isSingleClipShape(clip);
    const clipPlanes = (undefined === clipShape ? ViewClipTool.isSingleConvexClipPlaneSet(clip) : undefined);
    if (undefined === clipShape && undefined === clipPlanes)
      return;

    const viewRange = (viewExtents ? viewExtents : context.viewport.computeViewRange());
    const clipPlanesLoops = (undefined !== clipPlanes ? ClipUtilities.loopsOfConvexClipPlaneIntersectionWithRange(clipPlanes, viewRange) : undefined);
    if (undefined === clipShape && (undefined === clipPlanesLoops || 0 === clipPlanesLoops.length))
      return;

    const color = (options && options.color ? options.color : EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.white, context.viewport));
    const builderVis = context.createGraphicBuilder(GraphicType.WorldDecoration, clipShape ? clipShape.transformFromClip : undefined, (options ? options.id : undefined));
    const builderHid = context.createGraphicBuilder(GraphicType.WorldOverlay, clipShape ? clipShape.transformFromClip : undefined);
    builderVis.setSymbology(color, ColorDef.black, (options && options.visibleWidth ? options.visibleWidth : 3));
    builderHid.setSymbology(color, ColorDef.black, (options && options.hiddenWidth ? options.hiddenWidth : 1), (options && options.hiddenStyle ? options.hiddenStyle : LinePixels.Code2));

    if (undefined !== clipPlanesLoops) {
      ViewClipTool.addClipPlanesLoops(builderVis, clipPlanesLoops, true);
      ViewClipTool.addClipPlanesLoops(builderHid, clipPlanesLoops, true);
      if (options && options.fillClipPlanes) {
        const fill = (options.fill ? options.fill : EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.from(0, 255, 255, 225), context.viewport));
        const builderFill = context.createGraphicBuilder(GraphicType.WorldDecoration);
        builderFill.setSymbology(fill, fill, 0);
        ViewClipTool.addClipPlanesLoops(builderFill, (options.hasPrimaryPlane ? [clipPlanesLoops[0]] : clipPlanesLoops), false);
        context.addDecorationFromBuilder(builderFill);
      }
    } else if (undefined !== clipShape) {
      const clipExtents = ViewClipTool.getClipShapeExtents(clipShape, viewRange);
      ViewClipTool.addClipShape(builderVis, clipShape, clipExtents);
      ViewClipTool.addClipShape(builderHid, clipShape, clipExtents);
    }

    context.addDecorationFromBuilder(builderVis);
    context.addDecorationFromBuilder(builderHid);
  }

  private static isHilited(vp: Viewport, id?: string): boolean {
    return (undefined !== id ? vp.iModel.hilited.elements.has(Id64.getLowerUint32(id), Id64.getUpperUint32(id)) : false);
  }

  private static isFlashed(vp: Viewport, id?: string): boolean {
    return (undefined !== id ? vp.lastFlashedElementId === id : false);
  }

  public static drawClipShape(context: DecorateContext, shape: ClipShape, extents: Range1d, color: ColorDef, weight: number, id?: string): void {
    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration, shape.transformFromClip, id); // Use WorldDecoration not WorldOverlay to make sure handles have priority...
    builder.setSymbology(color, ColorDef.black, weight);
    ViewClipTool.addClipShape(builder, shape, extents);
    context.addDecorationFromBuilder(builder);

    // NOTE: We want to display hidden edges when clip decoration isn't hilited (not selected or drawn in dynamics).
    // This isn't required and is messy looking when the clip is being drawn hilited.
    // If the clip decoration is being flashed, draw using the hilite color to match the pickable world decoration display.
    if (!this.isHilited(context.viewport, id)) {
      const builderHid = context.createGraphicBuilder(GraphicType.WorldOverlay, shape.transformFromClip);
      builderHid.setSymbology(this.isFlashed(context.viewport, id) ? context.viewport.hilite.color : color, ColorDef.black, 1, LinePixels.Code2);
      ViewClipTool.addClipShape(builderHid, shape, extents);
      context.addDecorationFromBuilder(builderHid);
    }
  }

  /** @internal */
  public static getClipShapePoints(shape: ClipShape, z: number): Point3d[] {
    const points: Point3d[] = [];
    for (const pt of shape.polygon)
      points.push(Point3d.create(pt.x, pt.y, z));
    return points;
  }

  /** @internal */
  public static getClipShapeExtents(shape: ClipShape, viewRange: Range3d): Range1d {
    let zLow = shape.zLow;
    let zHigh = shape.zHigh;
    if (undefined === zLow || undefined === zHigh) {
      const zVec = Vector3d.unitZ();
      const origin = shape.polygon[0];
      const corners = viewRange.corners();
      if (undefined !== shape.transformToClip)
        shape.transformToClip.multiplyPoint3dArrayInPlace(corners);
      for (const corner of corners) {
        const delta = Vector3d.createStartEnd(origin, corner);
        const projection = delta.dotProduct(zVec);
        if (undefined === shape.zLow && (undefined === zLow || projection < zLow))
          zLow = projection;
        if (undefined === shape.zHigh && (undefined === zHigh || projection > zHigh))
          zHigh = projection;
      }
    }
    return Range1d.createXX(zLow!, zHigh!);
  }

  /** @internal */
  public static isSingleClipShape(clip: ClipVector): ClipShape | undefined {
    if (1 !== clip.clips.length)
      return undefined;
    const prim = clip.clips[0];
    if (!(prim instanceof ClipShape))
      return undefined;
    if (!prim.isValidPolygon)
      return undefined;
    return prim;
  }

  public static drawClipPlanesLoops(context: DecorateContext, loops: GeometryQuery[], color: ColorDef, weight: number, dashed?: boolean, fill?: ColorDef, id?: string): void {
    if (loops.length < 1)
      return;

    const builderEdge = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined, id); // Use WorldDecoration not WorldOverlay to make sure handles have priority...
    builderEdge.setSymbology(color, ColorDef.black, weight, dashed ? LinePixels.Code2 : undefined);
    ViewClipTool.addClipPlanesLoops(builderEdge, loops, true);
    context.addDecorationFromBuilder(builderEdge);

    // NOTE: We want to display hidden edges when clip decoration isn't hilited (not selected or drawn in dynamics).
    // This isn't required and is messy looking when the clip is being drawn hilited.
    // If the clip decoration is being flashed, draw using the hilite color to match the pickable world decoration display.
    if (!this.isHilited(context.viewport, id)) {
      const builderEdgeHid = context.createGraphicBuilder(GraphicType.WorldOverlay);
      builderEdgeHid.setSymbology(this.isFlashed(context.viewport, id) ? context.viewport.hilite.color : color, ColorDef.black, 1, LinePixels.Code2);
      ViewClipTool.addClipPlanesLoops(builderEdgeHid, loops, true);
      context.addDecorationFromBuilder(builderEdgeHid);
    }

    if (undefined === fill)
      return;

    const builderFace = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined);
    builderFace.setSymbology(fill, fill, 0);
    ViewClipTool.addClipPlanesLoops(builderFace, loops, false);
    context.addDecorationFromBuilder(builderFace);
  }

  /** @internal */
  public static isSingleConvexClipPlaneSet(clip: ClipVector): ConvexClipPlaneSet | undefined {
    if (1 !== clip.clips.length)
      return undefined;
    const prim = clip.clips[0];
    if (prim instanceof ClipShape)
      return undefined;
    const planeSets = prim.fetchClipPlanesRef();
    return (undefined !== planeSets && 1 === planeSets.convexSets.length) ? planeSets.convexSets[0] : undefined;
  }

  /** @internal */
  public static isSingleClipPlane(clip: ClipVector): ClipPlane | undefined {
    const clipPlanes = ViewClipTool.isSingleConvexClipPlaneSet(clip);
    if (undefined === clipPlanes || 1 !== clipPlanes.planes.length)
      return undefined;
    return clipPlanes.planes[0];
  }

  public static areClipsEqual(clipA: ClipVector, clipB: ClipVector): boolean {
    if (clipA === clipB)
      return true;
    if (clipA.clips.length !== clipB.clips.length)
      return false;
    for (let iPrim = 0; iPrim < clipA.clips.length; iPrim++) {
      const primA = clipA.clips[iPrim];
      const primB = clipB.clips[iPrim];
      const planesA = primA.fetchClipPlanesRef();
      const planesB = primB.fetchClipPlanesRef();
      if (undefined !== planesA && undefined !== planesB) {
        if (planesA.convexSets.length !== planesB.convexSets.length)
          return false;
        for (let iPlane = 0; iPlane < planesA.convexSets.length; iPlane++) {
          const planeSetA = planesA.convexSets[iPlane];
          const planeSetB = planesB.convexSets[iPlane];
          if (planeSetA.planes.length !== planeSetB.planes.length)
            return false;
          for (let iClipPlane = 0; iClipPlane < planeSetA.planes.length; iClipPlane++) {
            const planeA = planeSetA.planes[iClipPlane];
            const planeB = planeSetB.planes[iClipPlane];
            if (!planeA.isAlmostEqual(planeB))
              return false;
          }
        }
      } else if (undefined === planesA && undefined === planesB) {
        continue;
      } else {
        return false;
      }
    }
    return true;
  }

  public static hasClip(viewport: Viewport) {
    return (undefined !== viewport.view.getViewClip());
  }
}

/** A tool to remove a clip volume for a view
 * @public
 */
export class ViewClipClearTool extends ViewClipTool {
  public static override toolId = "ViewClip.Clear";
  public static override iconSpec = "icon-section-tool";
  /** @internal */
  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && ViewClipTool.hasClip(vp)); }
  /** @internal */
  protected override showPrompt(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate("ViewClip.Clear.Prompts.FirstPoint"));
    IModelApp.notifications.setToolAssistance(ToolAssistance.createInstructions(mainInstruction));
  }

  protected doClipClear(viewport: Viewport): boolean {
    if (!ViewClipTool.doClipClear(viewport))
      return false;
    if (undefined !== this._clipEventHandler)
      this._clipEventHandler.onClearClip(viewport);
    this.onReinitialize();
    return true;
  }

  /** @internal */
  public override onPostInstall(): void {
    super.onPostInstall();
    if (undefined !== this.targetView)
      this.doClipClear(this.targetView);
  }

  /** @internal */
  public override async onDataButtonDown(_ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this.targetView)
      return EventHandled.No;
    return this.doClipClear(this.targetView) ? EventHandled.Yes : EventHandled.No;
  }
}

/** A tool to define a clip volume for a view by specifying a plane
 * @public
 */
export class ViewClipByPlaneTool extends ViewClipTool {
  public static override toolId = "ViewClip.ByPlane";
  public static override iconSpec = "icon-section-plane";
  /** @internal */
  private _orientationValue: DialogItemValue = { value: ContextRotationId.Face };

  constructor(clipEventHandler?: ViewClipEventHandler, protected _clearExistingPlanes: boolean = false) { super(clipEventHandler); }

  /** @internal */
  public get orientation(): ContextRotationId { return this._orientationValue.value as ContextRotationId; }
  public set orientation(option: ContextRotationId) { this._orientationValue.value = option; }

  /** @internal */
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const initialValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, ViewClipTool._orientationName);
    initialValue && (this._orientationValue = initialValue);
    const toolSettings = new Array<DialogItem>();
    const settingsItem: DialogItem = { value: this._orientationValue, property: ViewClipTool._getEnumAsOrientationDescription(), editorPosition: { rowPriority: 0, columnIndex: 2 } };
    toolSettings.push(settingsItem);
    return toolSettings;
  }

  /** @internal */
  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === ViewClipTool._orientationName) {
      this._orientationValue = updatedValue.value;
      if (this._orientationValue) {
        IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: ViewClipTool._orientationName, value: this._orientationValue });
        return true;
      }
    }
    return false;
  }

  /** @internal */
  protected override showPrompt(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate("ViewClip.ByPlane.Prompts.FirstPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Mouse));

    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** @internal */
  protected override setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    super.setupAndPromptForNextAction();
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this.targetView)
      return EventHandled.No;
    const normal = ViewClipTool.getPlaneInwardNormal(this.orientation, this.targetView);
    if (undefined === normal)
      return EventHandled.No;
    ViewClipTool.enableClipVolume(this.targetView);
    if (!ViewClipTool.doClipToPlane(this.targetView, ev.point, normal, this._clearExistingPlanes))
      return EventHandled.No;
    if (undefined !== this._clipEventHandler)
      this._clipEventHandler.onNewClipPlane(this.targetView);
    this.onReinitialize();
    return EventHandled.Yes;
  }
}

/** A tool to define a clip volume for a view by specifying a shape
 * @public
 */
export class ViewClipByShapeTool extends ViewClipTool {
  public static override toolId = "ViewClip.ByShape";
  public static override iconSpec = "icon-section-shape";
  /** @internal */
  private _orientationValue: DialogItemValue = { value: ContextRotationId.Top };
  /** @internal */
  protected readonly _points: Point3d[] = [];
  /** @internal */
  protected _matrix?: Matrix3d;
  /** @internal */
  protected _zLow?: number;
  /** @internal */
  protected _zHigh?: number;

  /** @internal */
  public get orientation(): ContextRotationId { return this._orientationValue.value as ContextRotationId; }
  public set orientation(option: ContextRotationId) { this._orientationValue.value = option; }

  /** @internal */
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const initialValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, ViewClipTool._orientationName);
    initialValue && (this._orientationValue = initialValue);
    const toolSettings = new Array<DialogItem>();
    toolSettings.push({ value: this._orientationValue, property: ViewClipTool._getEnumAsOrientationDescription(), editorPosition: { rowPriority: 0, columnIndex: 2 } });
    return toolSettings;
  }

  /** @internal */
  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === ViewClipTool._orientationName) {
      this._orientationValue = updatedValue.value;
      if (!this._orientationValue)
        return false;
      this._points.length = 0;
      this._matrix = undefined;
      AccuDrawHintBuilder.deactivate();
      this.setupAndPromptForNextAction();
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: ViewClipTool._orientationName, value: this._orientationValue });
      return true;
    }
    return false;
  }

  /** @internal */
  protected override showPrompt(): void {
    let mainMsg = "ViewClip.ByShape.Prompts.";
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
        mainMsg += "NextPoint";
        break;
    }
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate(mainMsg));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Mouse));

    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Mouse));

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
  protected override setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    super.setupAndPromptForNextAction();
    if (0 === this._points.length)
      return;

    if (undefined === this._matrix)
      return;

    const hints = new AccuDrawHintBuilder();
    hints.setOrigin(this._points[this._points.length - 1]);
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
    hints.setLockZ = true;
    hints.sendHints();
  }

  protected getClipPoints(ev: BeButtonEvent): Point3d[] {
    const points: Point3d[] = [];
    if (undefined === this.targetView || this._points.length < 1)
      return points;
    for (const pt of this._points)
      points.push(pt.clone());

    if (undefined === this._matrix)
      return points;

    const normal = this._matrix.getColumn(2);
    let currentPt = AccuDrawHintBuilder.projectPointToPlaneInView(ev.point, points[0], normal, ev.viewport!, true);
    if (undefined === currentPt)
      currentPt = ev.point.clone();
    if (2 === points.length && !ev.isControlKey) {
      const xDir = Vector3d.createStartEnd(points[0], points[1]);
      const xLen = xDir.magnitude(); xDir.normalizeInPlace();
      const yDir = xDir.crossProduct(normal); yDir.normalizeInPlace();
      const cornerPt = AccuDrawHintBuilder.projectPointToLineInView(currentPt, points[1], yDir, ev.viewport!, true);
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
  public override isValidLocation(ev: BeButtonEvent, isButtonEvent: boolean): boolean {
    return (this._points.length > 0 ? true : super.isValidLocation(ev, isButtonEvent));
  }

  /** @internal */
  public override decorate(context: DecorateContext): void {
    if (context.viewport !== this.targetView)
      return;

    const ev = new BeButtonEvent();
    IModelApp.toolAdmin.fillEventFromCursorLocation(ev);
    if (undefined === ev.viewport)
      return;
    const points = this.getClipPoints(ev);
    if (points.length < 2)
      return;

    const builderAccVis = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const builderAccHid = context.createGraphicBuilder(GraphicType.WorldOverlay);
    const colorAccVis = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.white, context.viewport);
    const colorAccHid = colorAccVis.withAlpha(100);
    const fillAccVis = context.viewport.hilite.color.withAlpha(25);

    builderAccVis.setSymbology(colorAccVis, fillAccVis, 3);
    builderAccHid.setSymbology(colorAccHid, fillAccVis, 1, LinePixels.Code2);

    if (points.length > 2)
      builderAccHid.addShape(points);

    builderAccVis.addLineString(points);
    builderAccHid.addLineString(points);

    context.addDecorationFromBuilder(builderAccVis);
    context.addDecorationFromBuilder(builderAccHid);
  }

  /** @internal */
  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> { if (this._points.length > 0 && undefined !== ev.viewport) ev.viewport.invalidateDecorations(); }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this.targetView)
      return EventHandled.No;

    if (this._points.length > 1 && !ev.isControlKey) {
      const points = this.getClipPoints(ev);
      if (points.length < 3)
        return EventHandled.No;

      const transform = Transform.createOriginAndMatrix(points[0], this._matrix);
      transform.multiplyInversePoint3dArrayInPlace(points);
      ViewClipTool.enableClipVolume(this.targetView);
      if (!ViewClipTool.doClipToShape(this.targetView, points, transform, this._zLow, this._zHigh))
        return EventHandled.No;
      if (undefined !== this._clipEventHandler)
        this._clipEventHandler.onNewClip(this.targetView);
      this.onReinitialize();
      return EventHandled.Yes;
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
  public override async onUndoPreviousStep(): Promise<boolean> {
    if (0 === this._points.length)
      return false;

    this._points.pop();
    this.setupAndPromptForNextAction();
    return true;
  }
}

/** A tool to define a clip volume for a view by specifying range corners
 * @public
 */
export class ViewClipByRangeTool extends ViewClipTool {
  public static override toolId = "ViewClip.ByRange";
  public static override iconSpec = "icon-section-range";
  /** @internal */
  protected _corner?: Point3d;

  /** @internal */
  protected override showPrompt(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate(undefined === this._corner ? "ViewClip.ByRange.Prompts.FirstPoint" : "ViewClip.ByRange.Prompts.NextPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptPoint"), false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Mouse));
    if (undefined !== this._corner)
      mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo([ToolAssistance.ctrlKey, "Z"]), CoreTools.translate("ElementSet.Inputs.UndoLastPoint"), false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** @internal */
  protected override setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    super.setupAndPromptForNextAction();
  }

  protected getClipRange(range: Range3d, transform: Transform, ev: BeButtonEvent): boolean {
    if (undefined === this.targetView || undefined === this._corner)
      return false;
    // Creating clip aligned with ACS when ACS context lock is enabled...
    const matrix = AccuDrawHintBuilder.getContextRotation(ContextRotationId.Top, this.targetView);
    Transform.createOriginAndMatrix(this._corner, matrix, transform);
    const pt1 = transform.multiplyInversePoint3d(this._corner);
    const pt2 = transform.multiplyInversePoint3d(ev.point);
    if (undefined === pt1 || undefined === pt2)
      return false;
    range.setFrom(Range3d.create(pt1, pt2));
    return true;
  }

  /** @internal */
  public override decorate(context: DecorateContext): void {
    if (context.viewport !== this.targetView || undefined === this._corner)
      return;

    const ev = new BeButtonEvent();
    IModelApp.toolAdmin.fillEventFromCursorLocation(ev);
    if (undefined === ev.viewport)
      return;
    const range = Range3d.create();
    const transform = Transform.createIdentity();
    if (!this.getClipRange(range, transform, ev))
      return;

    const builderAccVis = context.createGraphicBuilder(GraphicType.WorldDecoration, transform);
    const builderAccHid = context.createGraphicBuilder(GraphicType.WorldOverlay, transform);
    const colorAccVis = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.white, context.viewport);
    const colorAccHid = colorAccVis.withAlpha(100);

    builderAccVis.setSymbology(colorAccVis, ColorDef.black, 3);
    builderAccHid.setSymbology(colorAccHid, ColorDef.black, 1, LinePixels.Code2);

    builderAccVis.addRangeBox(range);
    builderAccHid.addRangeBox(range);

    context.addDecorationFromBuilder(builderAccVis);
    context.addDecorationFromBuilder(builderAccHid);
  }

  /** @internal */
  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> { if (undefined !== this._corner && undefined !== ev.viewport) ev.viewport.invalidateDecorations(); }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this.targetView)
      return EventHandled.No;

    if (undefined !== this._corner) {
      const range = Range3d.create();
      const transform = Transform.createIdentity();
      if (!this.getClipRange(range, transform, ev))
        return EventHandled.No;
      ViewClipTool.enableClipVolume(this.targetView);
      if (!ViewClipTool.doClipToRange(this.targetView, range, transform))
        return EventHandled.No;
      if (undefined !== this._clipEventHandler)
        this._clipEventHandler.onNewClip(this.targetView);
      this.onReinitialize();
      return EventHandled.Yes;
    }

    this._corner = ev.point.clone();
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  /** @internal */
  public override async onUndoPreviousStep(): Promise<boolean> {
    if (undefined === this._corner)
      return false;
    this._corner = undefined;
    this.setupAndPromptForNextAction();
    return true;
  }
}

/** A tool to define a clip volume for a view using the element aligned box or axis aligned box.
 * @public
 */
export class ViewClipByElementTool extends ViewClipTool {
  public static override toolId = "ViewClip.ByElement";
  public static override iconSpec = "icon-section-element";

  constructor(clipEventHandler?: ViewClipEventHandler, protected _alwaysUseRange: boolean = false) { super(clipEventHandler); }

  /** @internal */
  protected override showPrompt(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, CoreTools.translate("ViewClip.ByElement.Prompts.FirstPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate("ElementSet.Inputs.AcceptElement"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate("ElementSet.Inputs.AcceptElement"), false, ToolAssistanceInputMethod.Mouse));

    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate("ElementSet.Inputs.Exit"), false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** @internal */
  public override onPostInstall(): void {
    super.onPostInstall();
    if (undefined !== this.targetView && this.targetView.iModel.selectionSet.isActive) {
      let useSelection = true;
      this.targetView.iModel.selectionSet.elements.forEach((val) => { if (Id64.isInvalid(val) || Id64.isTransient(val)) useSelection = false; });
      if (useSelection) {
        this.doClipToSelectedElements(this.targetView); // eslint-disable-line @typescript-eslint/no-floating-promises
        return;
      }
    }
    this.initLocateElements(true, false, "default", CoordinateLockOverrides.All);
  }

  /** @internal */
  public async doClipToSelectedElements(viewport: Viewport): Promise<boolean> {
    if (await this.doClipToElements(viewport, viewport.iModel.selectionSet.elements, this._alwaysUseRange))
      return true;
    this.exitTool();
    return false;
  }

  protected async doClipToElements(viewport: Viewport, ids: Id64Arg, alwaysUseRange: boolean = false): Promise<boolean> {
    try {
      const elementProps = await viewport.iModel.elements.getProps(ids);
      if (0 === elementProps.length)
        return false;
      const range = new Range3d();
      const transform = Transform.createIdentity();
      for (const props of elementProps) {
        const placementProps = (props as any).placement;
        if (undefined === placementProps)
          continue;

        const hasAngle = (arg: any): arg is Placement2dProps => arg.angle !== undefined;
        const placement = hasAngle(placementProps) ? Placement2d.fromJSON(placementProps) : Placement3d.fromJSON(placementProps);
        if (!alwaysUseRange && 1 === elementProps.length) {
          range.setFrom(placement instanceof Placement2d ? Range3d.createRange2d(placement.bbox, 0) : placement.bbox);
          transform.setFrom(placement.transform); // Use ElementAlignedBox for single selection...
        } else {
          range.extendRange(placement.calculateRange());
        }
      }
      if (range.isNull)
        return false;
      range.scaleAboutCenterInPlace(1.001); // pad range slightly...
      if (range.isAlmostZeroX || range.isAlmostZeroY) {
        if (range.isAlmostZeroZ)
          return false;
        // Invalid XY range for clip, see if XZ or YZ can be used instead...
        const canUseXZ = !range.isAlmostZeroX;
        const canUseYZ = !canUseXZ && !range.isAlmostZeroY;
        if (!canUseXZ && !canUseYZ)
          return false;
        const zDir = canUseXZ ? Vector3d.unitY() : Vector3d.unitX();
        const indices = Range3d.faceCornerIndices(canUseXZ ? 3 : 1);
        const corners = range.corners();
        const points: Point3d[] = [];
        for (const index of indices) points.push(corners[index]);
        transform.multiplyPoint3dArrayInPlace(points);
        transform.multiplyVector(zDir, zDir);
        transform.setFrom(Transform.createOriginAndMatrix(points[0], Matrix3d.createRigidHeadsUp(zDir)));
        transform.multiplyInversePoint3dArrayInPlace(points);
        ViewClipTool.enableClipVolume(viewport);
        if (!ViewClipTool.doClipToShape(viewport, points, transform))
          return false;
        if (undefined !== this._clipEventHandler)
          this._clipEventHandler.onNewClip(viewport);
        this.onReinitialize();
        return true;
      }
      ViewClipTool.enableClipVolume(viewport);
      if (!ViewClipTool.doClipToRange(viewport, range, transform))
        return false;
      if (undefined !== this._clipEventHandler)
        this._clipEventHandler.onNewClip(viewport);
      this.onReinitialize();
      return true;
    } catch {
      return false;
    }
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this.targetView)
      return EventHandled.No;
    const hit = await IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    if (undefined === hit || !hit.isElementHit)
      return EventHandled.No;
    return await this.doClipToElements(this.targetView, hit.sourceId, this._alwaysUseRange) ? EventHandled.Yes : EventHandled.No;
  }
}

/** @internal Interactive tool base class to modify a view's clip */
export abstract class ViewClipModifyTool extends EditManipulator.HandleTool {
  protected _anchorIndex: number;
  protected _ids: string[];
  protected _controls: ViewClipControlArrow[];
  protected _clipView: Viewport;
  protected _clip: ClipVector;
  protected _viewRange: Range3d;
  protected _restoreClip = true;
  protected _currentDistance: number = 0.0;
  private readonly _clipStyle: ClipStyle;

  public constructor(manipulator: EditManipulator.HandleProvider, clip: ClipVector, vp: Viewport, hitId: string, ids: string[], controls: ViewClipControlArrow[]) {
    super(manipulator);
    this._anchorIndex = ids.indexOf(hitId);
    this._ids = ids;
    this._controls = controls;
    this._clipView = vp;
    this._clip = clip;
    this._viewRange = vp.computeViewRange();

    // Don't request section-cut graphics while the user is modifying the clip. We'll restore this when the tool exits.
    this._clipStyle = vp.clipStyle;
    if (this._clipStyle.produceCutGeometry) {
      vp.clipStyle = ClipStyle.fromJSON({
        ...this._clipStyle.toJSON(),
        produceCutGeometry: false,
      });
    }
  }

  protected override get wantAccuSnap(): boolean { return false; }

  protected override init(): void {
    super.init();
    AccuDrawHintBuilder.deactivate();
  }

  protected abstract updateViewClip(ev: BeButtonEvent, isAccept: boolean): boolean;
  protected abstract drawViewClip(context: DecorateContext): void;

  protected getOffsetValue(ev: BeButtonEvent, transformFromClip?: Transform): number | undefined {
    if (-1 === this._anchorIndex || undefined === ev.viewport || ev.viewport !== this._clipView)
      return undefined;

    // NOTE: Use AccuDraw z instead of view z if AccuDraw is explicitly enabled...
    const anchorRay = ViewClipTool.getClipRayTransformed(this._controls[this._anchorIndex].origin, this._controls[this._anchorIndex].direction, transformFromClip);
    const projectedPt = AccuDrawHintBuilder.projectPointToLineInView(ev.point, anchorRay.origin, anchorRay.direction, ev.viewport, true);
    if (undefined === projectedPt)
      return undefined;

    const offsetVec = Vector3d.createStartEnd(anchorRay.origin, projectedPt);
    let offset = offsetVec.normalizeWithLength(offsetVec).mag;
    if (offset < Geometry.smallMetricDistance)
      return undefined;
    if (offsetVec.dotProduct(anchorRay.direction) < 0.0)
      offset *= -1.0;

    this._currentDistance = offset;
    return offset;
  }

  protected drawAnchorOffset(context: DecorateContext, color: ColorDef, weight: number, transformFromClip?: Transform): void {
    if (-1 === this._anchorIndex || Math.abs(this._currentDistance) < Geometry.smallMetricDistance)
      return;

    const anchorRay = ViewClipTool.getClipRayTransformed(this._controls[this._anchorIndex].origin, this._controls[this._anchorIndex].direction, transformFromClip);
    anchorRay.direction.scaleToLength(this._currentDistance, anchorRay.direction);
    const pt1 = anchorRay.fractionToPoint(0.0);
    const pt2 = anchorRay.fractionToPoint(1.0);
    const builder = context.createGraphicBuilder(GraphicType.ViewOverlay);

    context.viewport.worldToView(pt1, pt1); pt1.z = 0.0;
    context.viewport.worldToView(pt2, pt2); pt2.z = 0.0;

    builder.setSymbology(color, ColorDef.black, weight, LinePixels.Code5);
    builder.addLineString([pt1, pt2]);
    builder.setSymbology(color, ColorDef.black, weight + 7);
    builder.addPointString([pt1, pt2]);

    context.addDecorationFromBuilder(builder);
  }

  public override decorate(context: DecorateContext): void {
    if (-1 === this._anchorIndex || context.viewport !== this._clipView)
      return;
    this.drawViewClip(context);
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (!this.updateViewClip(ev, false))
      return;
    this._clipView.invalidateDecorations();
  }

  protected accept(ev: BeButtonEvent): boolean {
    if (!this.updateViewClip(ev, true))
      return false;
    this._restoreClip = false;
    return true;
  }

  public override onCleanup(): void {
    if (this._restoreClip && ViewClipTool.hasClip(this._clipView))
      ViewClipTool.setViewClip(this._clipView, this._clip);

    this._clipView.clipStyle = this._clipStyle;
  }
}

/** @internal Interactive tool to modify a view's clip defined by a ClipShape */
export class ViewClipShapeModifyTool extends ViewClipModifyTool {
  protected updateViewClip(ev: BeButtonEvent, _isAccept: boolean): boolean {
    const clipShape = ViewClipTool.isSingleClipShape(this._clip);
    if (undefined === clipShape)
      return false;

    const offset = this.getOffsetValue(ev, clipShape.transformFromClip);
    if (undefined === offset)
      return false;

    const offsetAll = ev.isShiftKey;
    const localOffset = ViewClipTool.getOffsetValueTransformed(offset, clipShape.transformToClip);
    const shapePts = ViewClipTool.getClipShapePoints(clipShape, 0.0);
    const adjustedPts: Point3d[] = [];
    for (let i = 0; i < shapePts.length; i++) {
      const prevFace = (0 === i ? shapePts.length - 2 : i - 1);
      const nextFace = (shapePts.length - 1 === i ? 0 : i);
      const prevSelected = offsetAll || (prevFace === this._anchorIndex || this.manipulator.iModel.selectionSet.has(this._ids[prevFace]));
      const nextSelected = offsetAll || (nextFace === this._anchorIndex || this.manipulator.iModel.selectionSet.has(this._ids[nextFace]));
      if (prevSelected && nextSelected) {
        const prevPt = shapePts[i].plusScaled(this._controls[prevFace].direction, localOffset);
        const nextPt = shapePts[i].plusScaled(this._controls[nextFace].direction, localOffset);
        const prevRay = Ray3d.create(prevPt, Vector3d.createStartEnd(shapePts[i === 0 ? shapePts.length - 2 : i - 1], shapePts[i]));
        const nextPlane = Plane3dByOriginAndUnitNormal.create(nextPt, this._controls[nextFace].direction);
        if (undefined === nextPlane || undefined === prevRay.intersectionWithPlane(nextPlane, prevPt))
          return false;
        adjustedPts[i] = prevPt;
      } else if (prevSelected) {
        adjustedPts[i] = shapePts[i].plusScaled(this._controls[prevFace].direction, localOffset);
      } else if (nextSelected) {
        adjustedPts[i] = shapePts[i].plusScaled(this._controls[nextFace].direction, localOffset);
      } else {
        adjustedPts[i] = shapePts[i];
      }
    }

    let zLow = clipShape.zLow;
    let zHigh = clipShape.zHigh;
    const zLowIndex = this._controls.length - 2;
    const zHighIndex = this._controls.length - 1;
    const zLowSelected = offsetAll || (zLowIndex === this._anchorIndex || this.manipulator.iModel.selectionSet.has(this._ids[zLowIndex]));
    const zHighSelected = offsetAll || (zHighIndex === this._anchorIndex || this.manipulator.iModel.selectionSet.has(this._ids[zHighIndex]));

    if (zLowSelected || zHighSelected) {
      const clipExtents = ViewClipTool.getClipShapeExtents(clipShape, this._viewRange);
      if (zLowSelected)
        zLow = clipExtents.low - localOffset;
      if (zHighSelected)
        zHigh = clipExtents.high + localOffset;
      const realZLow = (undefined === zLow ? clipExtents.low : zLow);
      const realZHigh = (undefined === zHigh ? clipExtents.high : zHigh);
      if (realZLow > realZHigh) { zLow = realZHigh; zHigh = realZLow; }
    }

    return ViewClipTool.doClipToShape(this._clipView, adjustedPts, clipShape.transformFromClip, zLow, zHigh);
  }

  protected drawViewClip(context: DecorateContext): void {
    const clip = this._clipView.view.getViewClip();
    if (undefined === clip)
      return;
    const clipShape = ViewClipTool.isSingleClipShape(clip);
    if (undefined === clipShape)
      return;
    const clipExtents = ViewClipTool.getClipShapeExtents(clipShape, this._viewRange);
    const color = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.white, context.viewport);
    ViewClipTool.drawClipShape(context, clipShape, clipExtents, color, 1);
    this.drawAnchorOffset(context, color, 1, clipShape.transformFromClip);
  }
}

/** @internal Interactive tool to modify a view's clip defined by a ConvexClipPlaneSet */
export class ViewClipPlanesModifyTool extends ViewClipModifyTool {
  protected updateViewClip(ev: BeButtonEvent, _isAccept: boolean): boolean {
    const offset = this.getOffsetValue(ev);
    if (undefined === offset)
      return false;

    const offsetAll = ev.isShiftKey;
    const planeSet = ConvexClipPlaneSet.createEmpty();
    for (let i: number = 0; i < this._controls.length; i++) {
      const selected = offsetAll || (i === this._anchorIndex || this.manipulator.iModel.selectionSet.has(this._ids[i]));
      const origin = this._controls[i].origin.clone();
      const direction = this._controls[i].direction;
      if (selected)
        origin.plusScaled(direction, offset, origin);
      planeSet.addPlaneToConvexSet(ClipPlane.createNormalAndPoint(direction.negate(), origin));
    }

    return ViewClipTool.doClipToConvexClipPlaneSet(this._clipView, planeSet);
  }

  protected drawViewClip(context: DecorateContext): void {
    const clip = this._clipView.view.getViewClip();
    if (undefined === clip)
      return;
    const clipPlanes = ViewClipTool.isSingleConvexClipPlaneSet(clip);
    if (undefined === clipPlanes)
      return;
    const clipPlanesLoops = ClipUtilities.loopsOfConvexClipPlaneIntersectionWithRange(clipPlanes, this._viewRange, true, false, true);
    if (undefined === clipPlanesLoops)
      return;
    const color = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.white, context.viewport);
    ViewClipTool.drawClipPlanesLoops(context, clipPlanesLoops, color, 1);
    this.drawAnchorOffset(context, color, 1);
  }
}

/** @internal Modify handle data to modify a view's clip */
export class ViewClipControlArrow {
  public origin: Point3d;
  public direction: Vector3d;
  public sizeInches: number;
  public fill?: ColorDef;
  public outline?: ColorDef;
  public name?: string;
  public floatingOrigin?: Point3d;

  public constructor(origin: Point3d, direction: Vector3d, sizeInches: number, fill?: ColorDef, outline?: ColorDef, name?: string) {
    this.origin = origin;
    this.direction = direction;
    this.sizeInches = sizeInches;
    this.fill = fill;
    this.outline = outline;
    this.name = name;
  }
}

/** @internal Controls to modify a view's clip */
export class ViewClipDecoration extends EditManipulator.HandleProvider {
  private static _decorator?: ViewClipDecoration;
  protected _clip?: ClipVector;
  protected _clipId?: string;
  protected _clipShape?: ClipShape;
  protected _clipShapeExtents?: Range1d;
  protected _clipPlanes?: ConvexClipPlaneSet;
  protected _clipPlanesLoops?: GeometryQuery[];
  protected _clipPlanesLoopsNoncontributing?: GeometryQuery[];
  protected _controlIds: string[] = [];
  protected _controls: ViewClipControlArrow[] = [];
  protected _suspendDecorator = false;
  protected _removeViewCloseListener?: () => void;

  public constructor(protected _clipView: ScreenViewport, protected _clipEventHandler?: ViewClipEventHandler) {
    super(_clipView.iModel);
    if (!this.getClipData())
      return;
    this._clipId = this.iModel.transientIds.next;
    this.updateDecorationListener(true);
    this._removeViewCloseListener = IModelApp.viewManager.onViewClose.addListener(this.onViewClose, this); // eslint-disable-line @typescript-eslint/unbound-method
    if (undefined !== this._clipEventHandler && this._clipEventHandler.selectOnCreate())
      this.iModel.selectionSet.replace(this._clipId);
  }

  public get clipId(): string | undefined { return this._clipId; }
  public get clipShape(): ClipShape | undefined { return this._clipShape; }
  public get clipPlaneSet(): ConvexClipPlaneSet | undefined { return this._clipPlanes; }
  public getControlIndex(id: string): number { return this._controlIds.indexOf(id); }

  protected override stop(): void {
    const selectedId = (undefined !== this._clipId && this.iModel.selectionSet.has(this._clipId)) ? this._clipId : undefined;
    this._clipId = undefined; // Invalidate id so that decorator will be dropped...
    super.stop();
    if (undefined !== selectedId)
      this.iModel.selectionSet.remove(selectedId); // Don't leave decorator id in selection set...
    if (undefined !== this._removeViewCloseListener) {
      this._removeViewCloseListener();
      this._removeViewCloseListener = undefined;
    }
  }

  public onViewClose(vp: ScreenViewport): void {
    if (this._clipView === vp)
      ViewClipDecoration.clear();
  }

  private getClipData(): boolean {
    this._clip = this._clipShape = this._clipShapeExtents = this._clipPlanes = this._clipPlanesLoops = this._clipPlanesLoopsNoncontributing = undefined;
    let clip = this._clipView.view.getViewClip();
    if (undefined === clip)
      return false;
    let clipShape = ViewClipTool.isSingleClipShape(clip);
    if (undefined !== clipShape) {
      if (clipShape.polygon.length > 5) {
        const compressed = PolylineOps.compressByChordError(clipShape.polygon, 1.0e-5);
        if (compressed.length < clipShape.polygon.length) {
          clip = clip.clone();
          clipShape = ViewClipTool.isSingleClipShape(clip)!;
          clipShape.setPolygon(compressed);
          this._clipView.view.setViewClip(clip);
        }
      }
      this._clipShapeExtents = ViewClipTool.getClipShapeExtents(clipShape, this._clipView.computeViewRange());
      this._clipShape = clipShape;
    } else {
      const clipPlanes = ViewClipTool.isSingleConvexClipPlaneSet(clip);
      if (undefined === clipPlanes || clipPlanes.planes.length > 12)
        return false;
      const clipPlanesLoops = ClipUtilities.loopsOfConvexClipPlaneIntersectionWithRange(clipPlanes, this._clipView.computeViewRange(), true, false, true);
      if (undefined !== clipPlanesLoops && clipPlanesLoops.length > clipPlanes.planes.length)
        return false;
      this._clipPlanesLoops = clipPlanesLoops;
      this._clipPlanes = clipPlanes;
    }
    this._clip = clip;
    return true;
  }

  private ensureNumControls(numReqControls: number): void {
    const numCurrent = this._controlIds.length;
    if (numCurrent < numReqControls) {
      const transientIds = this.iModel.transientIds;
      for (let i: number = numCurrent; i < numReqControls; i++)
        this._controlIds[i] = transientIds.next;
    } else if (numCurrent > numReqControls) {
      this._controlIds.length = numReqControls;
    }
  }

  private createClipShapeControls(): boolean {
    if (undefined === this._clipShape || undefined === this._clipShapeExtents)
      return false;

    const shapePtsLo = ViewClipTool.getClipShapePoints(this._clipShape, this._clipShapeExtents.low);
    const shapePtsHi = ViewClipTool.getClipShapePoints(this._clipShape, this._clipShapeExtents.high);
    const shapeArea = PolygonOps.centroidAreaNormal(shapePtsLo);
    if (undefined === shapeArea)
      return false;

    const numControls = shapePtsLo.length + 1; // Number of edge midpoints plus zLow and zHigh...
    this.ensureNumControls(numControls);

    for (let i: number = 0; i < numControls - 2; i++) {
      const midPtLo = shapePtsLo[i].interpolate(0.5, shapePtsLo[i + 1]);
      const midPtHi = shapePtsHi[i].interpolate(0.5, shapePtsHi[i + 1]);
      const faceCenter = midPtLo.interpolate(0.5, midPtHi);
      const edgeTangent = Vector3d.createStartEnd(shapePtsLo[i], shapePtsLo[i + 1]);
      const faceNormal = edgeTangent.crossProduct(shapeArea.direction); faceNormal.normalizeInPlace();
      this._controls[i] = new ViewClipControlArrow(faceCenter, faceNormal, shapePtsLo.length > 5 ? 0.5 : 0.75);
    }

    const zFillColor = ColorDef.from(150, 150, 250);
    this._controls[numControls - 2] = new ViewClipControlArrow(shapeArea.origin, Vector3d.unitZ(-1.0), 0.75, zFillColor, undefined, "zLow");
    this._controls[numControls - 1] = new ViewClipControlArrow(shapeArea.origin.plusScaled(Vector3d.unitZ(), shapePtsLo[0].distance(shapePtsHi[0])), Vector3d.unitZ(), 0.75, zFillColor, undefined, "zHigh");

    return true;
  }

  private getLoopCentroidAreaNormal(geom: GeometryQuery): Ray3d | undefined {
    if (!(geom instanceof Loop) || geom.children.length > 1)
      return undefined;
    const child = geom.getChild(0);
    if (!(child instanceof LineString3d))
      return undefined;
    return PolygonOps.centroidAreaNormal(child.points);
  }

  private createClipPlanesControls(): boolean {
    if (undefined === this._clipPlanes)
      return false;

    const loopData: Ray3d[] = [];
    if (undefined !== this._clipPlanesLoops) {
      for (const geom of this._clipPlanesLoops) {
        const loopArea = this.getLoopCentroidAreaNormal(geom);
        if (undefined !== loopArea)
          loopData.push(loopArea);
      }
    }

    const numControls = this._clipPlanes.planes.length;
    this.ensureNumControls(numControls);

    let viewRange;
    let iLoop: number = 0;
    for (let i: number = 0; i < this._clipPlanes.planes.length; i++) {
      const plane = this._clipPlanes.planes[i].getPlane3d();
      if (iLoop < loopData.length) {
        if (Math.abs(loopData[iLoop].direction.dotProduct(plane.getNormalRef())) > 0.9999 && plane.isPointInPlane(loopData[iLoop].origin)) {
          const outwardNormal = loopData[iLoop].direction.negate();
          this._controls[i] = new ViewClipControlArrow(loopData[iLoop].origin, outwardNormal, 0.75);
          iLoop++;
          continue;
        }
      }

      if (undefined === viewRange)
        viewRange = this._clipView.computeViewRange();

      const defaultOrigin = plane.projectPointToPlane(viewRange.center);
      const defaultOutwardNormal = plane.getNormalRef().negate();
      const expandedRange = viewRange.clone(); expandedRange.extend(defaultOrigin);
      const nonContribLoops = ClipUtilities.loopsOfConvexClipPlaneIntersectionWithRange(ConvexClipPlaneSet.createPlanes([this._clipPlanes.planes[i]]), expandedRange, true, false, true);
      const nonContribColor = ColorDef.from(250, 100, 100);

      if (undefined !== nonContribLoops && nonContribLoops.length > 0) {
        if (undefined === this._clipPlanesLoopsNoncontributing)
          this._clipPlanesLoopsNoncontributing = nonContribLoops;
        else
          this._clipPlanesLoopsNoncontributing = this._clipPlanesLoopsNoncontributing.concat(nonContribLoops);
        const loopArea = this.getLoopCentroidAreaNormal(nonContribLoops[0]);
        if (undefined !== loopArea) {
          const outwardNormal = loopArea.direction.negate();
          this._controls[i] = new ViewClipControlArrow(loopArea.origin, outwardNormal, 0.5, nonContribColor);
          continue;
        }
      }

      this._controls[i] = new ViewClipControlArrow(defaultOrigin, defaultOutwardNormal, 0.5, nonContribColor); // Just show arrow for right-click menu options...
    }

    return true;
  }

  protected async createControls(): Promise<boolean> {
    // Always update to current view clip to handle post-modify, etc.
    if (undefined === this._clipId || !this.getClipData())
      return false;

    // Show controls if only range box and it's controls are selected, selection set doesn't include any other elements...
    let showControls = false;
    if (this.iModel.selectionSet.size <= this._controlIds.length + 1 && this.iModel.selectionSet.has(this._clipId)) {
      showControls = true;
      if (this.iModel.selectionSet.size > 1) {
        this.iModel.selectionSet.elements.forEach((val) => {
          if (this._clipId !== val && !this._controlIds.includes(val))
            showControls = false;
        });
      }
    }

    if (!showControls) {
      if (undefined !== this._clipEventHandler && this._clipEventHandler.clearOnDeselect())
        ViewClipDecoration.clear();
      return false;
    }

    if (undefined !== this._clipShape)
      return this.createClipShapeControls();
    else if (undefined !== this._clipPlanes)
      return this.createClipPlanesControls();

    return false;
  }

  protected override clearControls(): void {
    this.iModel.selectionSet.remove(this._controlIds); // Remove any selected controls as they won't continue to be displayed...
    super.clearControls();
  }

  protected modifyControls(hit: HitDetail, _ev: BeButtonEvent): boolean {
    if (undefined === this._clip || hit.sourceId === this._clipId)
      return false;
    const saveQualifiers = IModelApp.toolAdmin.currentInputState.qualifiers;
    if (undefined !== this._clipShape) {
      const clipShapeModifyTool = new ViewClipShapeModifyTool(this, this._clip, this._clipView, hit.sourceId, this._controlIds, this._controls);
      this._suspendDecorator = clipShapeModifyTool.run();
    } else if (undefined !== this._clipPlanes) {
      const clipPlanesModifyTool = new ViewClipPlanesModifyTool(this, this._clip, this._clipView, hit.sourceId, this._controlIds, this._controls);
      this._suspendDecorator = clipPlanesModifyTool.run();
    }
    if (this._suspendDecorator)
      IModelApp.toolAdmin.currentInputState.qualifiers = saveQualifiers; // onInstallTool cleared qualifiers, preserve for "modify all" behavior when shift was held and drag started...
    return this._suspendDecorator;
  }

  public doClipPlaneNegate(index: number): boolean {
    if (undefined === this._clipPlanes)
      return false;

    if (index < 0 || index >= this._clipPlanes.planes.length)
      return false;

    const planeSet = ConvexClipPlaneSet.createEmpty();
    for (let i: number = 0; i < this._clipPlanes.planes.length; i++) {
      const plane = (i === index ? this._clipPlanes.planes[i].cloneNegated() : this._clipPlanes.planes[i]);
      planeSet.addPlaneToConvexSet(plane);
    }

    if (!ViewClipTool.doClipToConvexClipPlaneSet(this._clipView, planeSet))
      return false;

    this.onManipulatorEvent(EditManipulator.EventType.Accept);
    return true;
  }

  public doClipPlaneClear(index: number): boolean {
    if (undefined === this._clipPlanes)
      return false;

    if (index < 0 || index >= this._clipPlanes.planes.length)
      return false;

    if (1 === this._clipPlanes.planes.length) {
      if (!ViewClipTool.doClipClear(this._clipView))
        return false;
      if (undefined !== this._clipEventHandler)
        this._clipEventHandler.onClearClip(this._clipView);
      ViewClipDecoration.clear();
      return true;
    }

    const planeSet = ConvexClipPlaneSet.createEmpty();
    for (let i: number = 0; i < this._clipPlanes.planes.length; i++) {
      if (i === index)
        continue;
      const plane = this._clipPlanes.planes[i];
      planeSet.addPlaneToConvexSet(plane);
    }

    if (!ViewClipTool.doClipToConvexClipPlaneSet(this._clipView, planeSet))
      return false;

    this.onManipulatorEvent(EditManipulator.EventType.Accept);
    return true;
  }

  private getClipShapeFaceLoops(): GeometryQuery[] | undefined {
    if (undefined === this._clipShape || undefined === this._clipShapeExtents)
      return undefined;

    const shapePtsLo = ViewClipTool.getClipShapePoints(this._clipShape, this._clipShapeExtents.low);
    const shapePtsHi = ViewClipTool.getClipShapePoints(this._clipShape, this._clipShapeExtents.high);

    if (undefined !== this._clipShape.transformFromClip) {
      this._clipShape.transformFromClip.multiplyPoint3dArrayInPlace(shapePtsLo);
      this._clipShape.transformFromClip.multiplyPoint3dArrayInPlace(shapePtsHi);
    }

    const cap0 = Loop.createPolygon(shapePtsLo);
    const cap1 = Loop.createPolygon(shapePtsHi);
    const faces: GeometryQuery[] = [];

    faces.push(cap0);
    faces.push(cap1);

    for (let i: number = 0; i < shapePtsLo.length; i++) {
      const next = (i === shapePtsLo.length - 1 ? 0 : i + 1);
      const side = Loop.createPolygon([shapePtsLo[i].clone(), shapePtsLo[next].clone(), shapePtsHi[next].clone(), shapePtsHi[i].clone()]);
      faces.push(side);
    }

    return faces;
  }

  private getMatchingLoop(loops: GeometryQuery[], ray: Ray3d): GeometryQuery | undefined {
    for (const geom of loops) {
      const loopArea = this.getLoopCentroidAreaNormal(geom);
      if (undefined === loopArea)
        continue;

      if (!loopArea.direction.isParallelTo(ray.direction, true)) // don't assume outward normal for clip plane loops...
        continue;

      const plane = Plane3dByOriginAndUnitNormal.create(loopArea.origin, loopArea.direction);
      if (undefined === plane || !plane.isPointInPlane(ray.origin))
        continue;

      return geom;
    }
    return undefined;
  }

  private getLoopPreferredX(loop: GeometryQuery, outwardNormal: Vector3d): Vector3d | undefined {
    const localToWorld = FrameBuilder.createRightHandedFrame(undefined, loop);
    if (undefined === localToWorld)
      return undefined;

    let vectorX;
    const dirX = localToWorld.matrix.getColumn(0);
    const dirY = localToWorld.matrix.getColumn(1);
    const dirZ = localToWorld.matrix.getColumn(2);
    const unitX = Vector3d.unitX();
    const unitZ = Vector3d.unitZ();

    if (dirZ.isParallelTo(unitZ, true)) {
      // For clip in xy plane, choose direction closest to world x...
      vectorX = Math.abs(dirX.dotProduct(unitX)) > Math.abs(dirY.dotProduct(unitX)) ? dirX : dirY;

      if (vectorX.dotProduct(unitX) < 0.0)
        vectorX.negate(vectorX); // prefer positive x...
    } else {
      // For clip in arbitrary plane, choose direction closest to being in xy plane...
      let vectorY;
      const crossX = outwardNormal.unitCrossProduct(dirY);
      const crossY = outwardNormal.unitCrossProduct(dirX);

      if (crossX && crossY) {
        if (Math.abs(crossY.dotProduct(unitZ)) > Math.abs(crossX.dotProduct(unitZ))) {
          vectorX = dirX;
          vectorY = crossY;
        } else {
          vectorX = dirY;
          vectorY = crossX;
        }
      } else {
        vectorX = crossX ? dirY : dirX;
      }

      if (vectorY && vectorY.dotProduct(unitZ) < 0.0)
        vectorX.negate(vectorX); // prefer positive z...
    }

    return vectorX;
  }

  public doClipPlaneOrientView(index: number): boolean {
    if (index < 0 || index >= this._controlIds.length)
      return false;

    const vp = this._clipView;
    const anchorRay = ViewClipTool.getClipRayTransformed(this._controls[index].origin, this._controls[index].direction, undefined !== this._clipShape ? this._clipShape.transformFromClip : undefined);

    // Try to align x direction with clip plane loop...
    const loops = (undefined !== this._clipPlanesLoops ? this._clipPlanesLoops : this.getClipShapeFaceLoops());
    const loop = (loops ? (1 === loops.length ? loops[0] : this.getMatchingLoop(loops, anchorRay)) : undefined);
    const vectorX = (loop ? this.getLoopPreferredX(loop, anchorRay.direction) : undefined);

    const matrix = Matrix3d.createIdentity();
    if (undefined === vectorX || undefined === Matrix3d.createRigidFromColumns(anchorRay.direction, vectorX, AxisOrder.ZXY, matrix))
      Matrix3d.createRigidHeadsUp(anchorRay.direction, AxisOrder.ZXY, matrix);

    const targetMatrix = matrix.multiplyMatrixMatrix(vp.rotation);
    const rotateTransform = Transform.createFixedPointAndMatrix(anchorRay.origin, targetMatrix);
    const newFrustum = vp.getFrustum();
    newFrustum.multiply(rotateTransform);
    vp.view.setupFromFrustum(newFrustum);
    vp.synchWithView();
    vp.animateFrustumChange();
    return true;
  }

  private getWorldUpPlane(viewport: Viewport): Plane3dByOriginAndUnitNormal | undefined {
    const matrix = AccuDrawHintBuilder.getContextRotation(ContextRotationId.Top, viewport);
    if (undefined === matrix)
      return undefined;
    const worldUp = matrix.getColumn(2);
    const planePt = (viewport.isContextRotationRequired ? viewport.getAuxCoordOrigin() : (viewport.view.isSpatialView() ? viewport.view.iModel.globalOrigin : Point3d.createZero()));
    return Plane3dByOriginAndUnitNormal.create(planePt, worldUp);
  }

  private isAlignedToWorldUpPlane(plane: Plane3dByOriginAndUnitNormal, transformFromClip?: Transform): boolean {
    const normal = (undefined !== transformFromClip ? transformFromClip.multiplyVector(Vector3d.unitZ()) : Vector3d.unitZ());
    return plane.getNormalRef().isParallelTo(normal, true);
  }

  public isClipShapeAlignedWithWorldUp(extents?: Range1d): boolean {
    if (undefined === this._clipShape || undefined === this._clipShapeExtents)
      return false;

    const plane = this.getWorldUpPlane(this._clipView);
    if (undefined === plane || !this.isAlignedToWorldUpPlane(plane, this._clipShape.transformFromClip))
      return false;

    if (undefined === extents)
      return true;

    const zLow = Point3d.create(0.0, 0.0, this._clipShapeExtents.low);
    const zHigh = Point3d.create(0.0, 0.0, this._clipShapeExtents.high);

    if (undefined !== this._clipShape.transformFromClip) {
      this._clipShape.transformFromClip.multiplyPoint3d(zLow, zLow);
      this._clipShape.transformFromClip.multiplyPoint3d(zHigh, zHigh);
    }

    const lowDir = Vector3d.createStartEnd(plane.projectPointToPlane(zLow), zLow);
    const highDir = Vector3d.createStartEnd(plane.projectPointToPlane(zHigh), zHigh);
    let zLowWorld = lowDir.magnitude();
    let zHighWorld = highDir.magnitude();

    if (lowDir.dotProduct(plane.getNormalRef()) < 0.0)
      zLowWorld = -zLowWorld;
    if (highDir.dotProduct(plane.getNormalRef()) < 0.0)
      zHighWorld = -zHighWorld;

    Range1d.createXX(zLowWorld, zHighWorld, extents);
    return true;
  }

  public doClipShapeSetZExtents(extents: Range1d): boolean {
    if (extents.low > extents.high)
      return false;
    if (undefined === this._clipShape)
      return false;
    const plane = this.getWorldUpPlane(this._clipView);
    if (undefined === plane || !this.isAlignedToWorldUpPlane(plane, this._clipShape.transformFromClip))
      return false;

    const zLow = plane.getOriginRef().plusScaled(plane.getNormalRef(), extents.low);
    const zHigh = plane.getOriginRef().plusScaled(plane.getNormalRef(), extents.high);

    if (undefined !== this._clipShape.transformToClip) {
      this._clipShape.transformToClip.multiplyPoint3d(zLow, zLow);
      this._clipShape.transformToClip.multiplyPoint3d(zHigh, zHigh);
    }

    const reversed = (zLow.z > zHigh.z);
    const shape = ClipShape.createFrom(this._clipShape);
    shape.initSecondaryProps(shape.isMask, reversed ? zHigh.z : zLow.z, reversed ? zLow.z : zHigh.z, this._clipShape.transformFromClip);

    const clip = ClipVector.createEmpty();
    clip.appendReference(shape);

    if (!ViewClipTool.setViewClip(this._clipView, clip))
      return false;

    this.onManipulatorEvent(EditManipulator.EventType.Accept);
    return true;
  }

  protected override async onRightClick(hit: HitDetail, ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this._clipEventHandler)
      return EventHandled.No;
    return (this._clipEventHandler.onRightClick(hit, ev) ? EventHandled.Yes : EventHandled.No);
  }

  protected override async onTouchTap(hit: HitDetail, ev: BeButtonEvent): Promise<EventHandled> { return (hit.sourceId === this._clipId ? EventHandled.No : super.onTouchTap(hit, ev)); }

  public override onManipulatorEvent(eventType: EditManipulator.EventType): void {
    this._suspendDecorator = false;
    super.onManipulatorEvent(eventType);
    if (EditManipulator.EventType.Accept === eventType && undefined !== this._clipEventHandler)
      this._clipEventHandler.onModifyClip(this._clipView);
  }

  public testDecorationHit(id: string): boolean { return (id === this._clipId || this._controlIds.includes(id)); }
  public async getDecorationToolTip(hit: HitDetail): Promise<HTMLElement | string> { return (hit.sourceId === this._clipId ? "View Clip" : "Modify View Clip"); }
  protected override updateDecorationListener(_add: boolean): void { super.updateDecorationListener(undefined !== this._clipId); } // Decorator isn't just for resize controls...

  public override decorate(context: DecorateContext): void {
    if (this._suspendDecorator)
      return;

    if (undefined === this._clipId || undefined === this._clip)
      return;

    const vp = context.viewport;
    if (this._clipView !== vp)
      return;

    if (undefined !== this._clipShape) {
      ViewClipTool.drawClipShape(context, this._clipShape, this._clipShapeExtents!, EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.white, vp), 3, this._clipId);
    } else if (undefined !== this._clipPlanes) {
      if (undefined !== this._clipPlanesLoops)
        ViewClipTool.drawClipPlanesLoops(context, this._clipPlanesLoops, EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.white, vp), 3, false, EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.from(0, 255, 255, 225), vp), this._clipId);
      if (undefined !== this._clipPlanesLoopsNoncontributing)
        ViewClipTool.drawClipPlanesLoops(context, this._clipPlanesLoopsNoncontributing, EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.red, vp), 1, true);
    }

    if (!this._isActive)
      return;

    const outlineColor = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.from(0, 0, 0, 50), vp);
    const fillVisColor = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.from(150, 250, 200, 175), vp);
    const fillHidColor = fillVisColor.withAlpha(225);
    const fillSelColor = fillVisColor.inverse().withAlpha(75);
    const shapePts = EditManipulator.HandleUtils.getArrowShape(0.0, 0.15, 0.55, 1.0, 0.3, 0.5, 0.1);

    for (let iFace = 0; iFace < this._controlIds.length; iFace++) {
      const sizeInches = this._controls[iFace].sizeInches;
      if (0.0 === sizeInches)
        continue;

      // For single plane clip, choose location for handle that's visible in the current view...
      if (1 === this._controls.length && undefined !== this._clipPlanes && undefined !== this._clipPlanesLoops && this._clipPlanesLoops.length > 0) {
        if (!vp.isPointVisibleXY(this._controls[iFace].origin, CoordSystem.World, 0.05)) {
          const geom = this._clipPlanesLoops[0];
          if (geom instanceof Loop && geom.children.length > 0) {
            const child = geom.getChild(0);
            if (child instanceof LineString3d) {
              const work = new GrowableXYZArray();
              const finalPoints = new GrowableXYZArray();
              const lineString = child.points;
              const convexSet = vp.getFrustum().getRangePlanes(false, false, 0);
              convexSet.polygonClip(lineString, finalPoints, work);
              if (finalPoints.length > 0) {
                const loopArea = PolygonOps.centroidAreaNormal(finalPoints.getPoint3dArray());
                if (undefined !== loopArea) {
                  if (undefined === this._controls[iFace].floatingOrigin)
                    this._controls[iFace].floatingOrigin = this._controls[iFace].origin.clone();
                  this._controls[iFace].origin.setFrom(loopArea.origin);
                }
              }
            }
          }
        } else if (undefined !== this._controls[iFace].floatingOrigin && vp.isPointVisibleXY(this._controls[iFace].floatingOrigin!, CoordSystem.World, 0.1)) {
          this._controls[iFace].origin.setFrom(this._controls[iFace].floatingOrigin);
          this._controls[iFace].floatingOrigin = undefined;
        }
      }

      const anchorRay = ViewClipTool.getClipRayTransformed(this._controls[iFace].origin, this._controls[iFace].direction, undefined !== this._clipShape ? this._clipShape.transformFromClip : undefined);
      const transform = EditManipulator.HandleUtils.getArrowTransform(vp, anchorRay.origin, anchorRay.direction, sizeInches);
      if (undefined === transform)
        continue;

      const visPts: Point3d[] = []; for (const pt of shapePts) visPts.push(pt.clone()); // deep copy because we're using a builder transform w/addLineString...
      const hidPts: Point3d[] = []; for (const pt of shapePts) hidPts.push(pt.clone());
      const arrowVisBuilder = context.createGraphicBuilder(GraphicType.WorldOverlay, transform, this._controlIds[iFace]);
      const arrowHidBuilder = context.createGraphicBuilder(GraphicType.WorldDecoration, transform);
      const isSelected = this.iModel.selectionSet.has(this._controlIds[iFace]);

      let outlineColorOvr = this._controls[iFace].outline;
      if (undefined !== outlineColorOvr) {
        outlineColorOvr = EditManipulator.HandleUtils.adjustForBackgroundColor(outlineColorOvr, vp);
        outlineColorOvr = outlineColorOvr.withAlpha(outlineColor.getAlpha());
      } else {
        outlineColorOvr = outlineColor;
      }

      let fillVisColorOvr = this._controls[iFace].fill;
      let fillHidColorOvr = fillHidColor;
      let fillSelColorOvr = fillSelColor;
      if (undefined !== fillVisColorOvr) {
        fillVisColorOvr = EditManipulator.HandleUtils.adjustForBackgroundColor(fillVisColorOvr, vp);
        fillVisColorOvr = fillVisColorOvr.withAlpha(fillVisColor.getAlpha());
        fillHidColorOvr = fillVisColorOvr.withAlpha(fillHidColor.getAlpha());
        fillSelColorOvr = fillVisColorOvr.inverse().withAlpha(fillSelColor.getAlpha());
      } else {
        fillVisColorOvr = fillVisColor;
      }

      arrowVisBuilder.setSymbology(outlineColorOvr, outlineColorOvr, isSelected ? 4 : 2);
      arrowVisBuilder.addLineString(visPts);
      arrowVisBuilder.setBlankingFill(isSelected ? fillSelColorOvr : fillVisColorOvr);
      arrowVisBuilder.addShape(visPts);
      context.addDecorationFromBuilder(arrowVisBuilder);

      arrowHidBuilder.setSymbology(fillHidColorOvr, fillHidColorOvr, 1);
      arrowHidBuilder.addShape(hidPts);
      context.addDecorationFromBuilder(arrowHidBuilder);
    }
  }

  public static get(vp: ScreenViewport): ViewClipDecoration | undefined {
    if (undefined === ViewClipDecoration._decorator || vp !== ViewClipDecoration._decorator._clipView)
      return undefined;
    return ViewClipDecoration._decorator;
  }

  public static create(vp: ScreenViewport, clipEventHandler?: ViewClipEventHandler): string | undefined {
    if (undefined !== ViewClipDecoration._decorator)
      ViewClipDecoration.clear();
    if (!ViewClipTool.hasClip(vp))
      return undefined;
    ViewClipDecoration._decorator = new ViewClipDecoration(vp, clipEventHandler);
    return ViewClipDecoration._decorator.clipId;
  }

  public static clear(): void {
    if (undefined === ViewClipDecoration._decorator)
      return;
    ViewClipDecoration._decorator.stop();
    ViewClipDecoration._decorator = undefined;
  }

  public static toggle(vp: ScreenViewport, clipEventHandler?: ViewClipEventHandler): string | undefined {
    let clipId: string | undefined;
    if (undefined === ViewClipDecoration._decorator)
      clipId = ViewClipDecoration.create(vp, clipEventHandler);
    else
      ViewClipDecoration.clear();
    IModelApp.toolAdmin.startDefaultTool();
    return clipId;
  }
}

/** Event types for ViewClipDecorationProvider.onActiveClipChanged \
 * @public
 */
export enum ClipEventType { New, NewPlane, Modify, Clear }

/** An implementation of ViewClipEventHandler that responds to new clips by presenting clip modification handles
 * @public
 */
export class ViewClipDecorationProvider implements ViewClipEventHandler {
  private static _provider?: ViewClipDecorationProvider;
  public selectDecorationOnCreate = true;
  public clearDecorationOnDeselect = true;

  /** Called when the active clip for a view is changed */
  public readonly onActiveClipChanged = new BeEvent<(viewport: Viewport, eventType: ClipEventType, provider: ViewClipDecorationProvider) => void>();

  /** Called on a right click over the clip geometry or clip modify handle. ViewClipDecoration provides methods for the following possible menu actions:
   * For ClipPlanes (undefined !== clipPlaneSet): Flip (doClipPlaneNegate), Clear (doClipPlaneClear), and Orient View (doClipPlaneOrientView)
   * For ClipShapes (undefined === clipPlaneSet): Orient View (doClipPlaneOrientView) and input fields to set world zLow/zHigh (doClipShapeSetZExtents provided isClipShapeAlignedWithWorldUp returns true)
   */
  public readonly onActiveClipRightClick = new BeEvent<(hit: HitDetail, ev: BeButtonEvent, provider: ViewClipDecorationProvider) => void>();

  public selectOnCreate(): boolean { return this.selectDecorationOnCreate; }
  public clearOnDeselect(): boolean { return this.clearDecorationOnDeselect; }

  public onNewClip(viewport: ScreenViewport): void {
    ViewClipDecoration.create(viewport, this);
    this.onActiveClipChanged.raiseEvent(viewport, ClipEventType.New, this);
  }

  public onNewClipPlane(viewport: ScreenViewport): void {
    ViewClipDecoration.create(viewport, this);
    this.onActiveClipChanged.raiseEvent(viewport, ClipEventType.NewPlane, this);
  }

  public onModifyClip(viewport: ScreenViewport): void {
    this.onActiveClipChanged.raiseEvent(viewport, ClipEventType.Modify, this);
  }

  public onClearClip(viewport: ScreenViewport): void {
    ViewClipDecoration.clear();
    this.onActiveClipChanged.raiseEvent(viewport, ClipEventType.Clear, this);
  }

  public onRightClick(hit: HitDetail, ev: BeButtonEvent): boolean {
    const decoration = (undefined !== ev.viewport ? ViewClipDecoration.get(ev.viewport) : undefined);
    if (undefined === decoration)
      return false;
    if (0 === this.onActiveClipRightClick.numberOfListeners)
      return decoration.doClipPlaneNegate(decoration.getControlIndex(hit.sourceId));
    this.onActiveClipRightClick.raiseEvent(hit, ev, this);
    return true;
  }

  public showDecoration(vp: ScreenViewport): void { ViewClipDecoration.create(vp, this); }
  public hideDecoration(): void { ViewClipDecoration.clear(); }
  public toggleDecoration(vp: ScreenViewport): void { ViewClipDecoration.toggle(vp, this); }

  public static create(): ViewClipDecorationProvider {
    if (undefined === ViewClipDecorationProvider._provider) {
      ViewClipDecoration.clear();
      ViewClipDecorationProvider._provider = new ViewClipDecorationProvider();
    }
    return ViewClipDecorationProvider._provider;
  }

  public static clear(): void {
    if (undefined === ViewClipDecorationProvider._provider)
      return;
    ViewClipDecoration.clear();
    ViewClipDecorationProvider._provider = undefined;
  }
}
