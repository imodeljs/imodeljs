/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64String } from "@bentley/bentleyjs-core";
import {
  Angle,
  AngleSweep,
  Arc3d,
  CurveCollection,
  CurveFactory,
  CurvePrimitive,
  FrameBuilder,
  Geometry,
  IModelJson, LineString3d, Loop, Matrix3d, Path, Plane3dByOriginAndUnitNormal, Point3d, Ray3d, RegionOps, Transform, Vector3d, YawPitchRollAngles,
} from "@bentley/geometry-core";
import {
  Code, ColorDef, ElementGeometry, ElementGeometryInfo, FlatBufferGeometryStream, GeometricElementProps, GeometryParams, GeometryStreamProps, isPlacement3dProps, JsonGeometryStream, LinePixels, PlacementProps,
} from "@bentley/imodeljs-common";
import {
  AccuDrawHintBuilder, AngleDescription, BeButton, BeButtonEvent, BeModifierKeys, CoreTools, DecorateContext, DynamicsContext,
  EventHandled, GraphicType, HitDetail, IModelApp, LengthDescription, NotifyMessageDetails, OutputMessagePriority, SnapDetail, TentativeOrAccuSnap, ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection,
} from "@bentley/imodeljs-frontend";
import { BasicManipulationCommandIpc, editorBuiltInCmdIds } from "@bentley/imodeljs-editor-common";
import { computeChordToleranceFromPoint, CreateElementTool, DynamicGraphicsProvider } from "./CreateElementTool";
import { EditTools } from "./EditTool";
import { DialogItem, DialogProperty, DialogPropertySyncItem, EnumerationChoice, PropertyDescriptionHelper } from "@bentley/ui-abstract";

/** @alpha Values for [[CreateOrContinueTool.createCurvePhase] to support join and closure. */
export enum CreateCurvePhase {
  /** Current tool phase changes CurvePrimitive startPoint.
   * ex. Arc defined by center, start would return this when accepted length is 1.
   */
  DefineStart,
  /** Current tool phase changes CurvePrimitive endPoint.
   * ex. Arc defined by start, end, mid would return this when accepted length is 1.
   */
  DefineEnd,
  /** Current tool phase does NOT change CurvePrimitive startPoint or endPoint.
   * ex. When defining arc mid point, or start and end tangents for a bcurve return this.
   */
  DefineOther,
}

/** @alpha Base class for creating open and closed paths. */
export abstract class CreateOrContinuePathTool extends CreateElementTool {
  protected readonly accepted: Point3d[] = [];
  protected current?: CurvePrimitive;
  protected continuationData?: { props: GeometricElementProps, path: Path, params: GeometryParams };
  protected isClosed = false;
  protected isConstruction = false; // Sub-classes can set in createNewCurvePrimitive to bypass creating element graphics...
  protected _graphicsProvider?: DynamicGraphicsProvider;
  protected _startedCmd?: string;

  protected async startCommand(): Promise<string> {
    if (undefined !== this._startedCmd)
      return this._startedCmd;
    return EditTools.startCommand<string>(editorBuiltInCmdIds.cmdBasicManipulation, this.iModel.key);
  }

  public static callCommand<T extends keyof BasicManipulationCommandIpc>(method: T, ...args: Parameters<BasicManipulationCommandIpc[T]>): ReturnType<BasicManipulationCommandIpc[T]> {
    return EditTools.callCommand(method, ...args) as ReturnType<BasicManipulationCommandIpc[T]>;
  }

  protected override get wantAccuSnap(): boolean { return true; }
  protected override get wantDynamics(): boolean { return true; }

  protected get allowJoin(): boolean { return this.isControlDown; } // These could be tool settings...
  protected get allowClosure(): boolean { return this.isControlDown; }
  protected get allowSimplify(): boolean { return true; }

  protected get wantSmartRotation(): boolean { return this.isContinueExistingPath; }
  protected get wantJoin(): boolean { return this.allowJoin; }
  protected get wantClosure(): boolean { return this.isContinueExistingPath && this.allowClosure; }
  protected get wantSimplify(): boolean { return this.allowSimplify; }

  protected get showJoin(): boolean { return this.isContinueExistingPath && CreateCurvePhase.DefineStart === this.createCurvePhase; }
  protected get showClosure(): boolean { return this.isClosed && CreateCurvePhase.DefineEnd === this.createCurvePhase; }

  /** Sub-classes should override unless first point changes startPoint and last point changes endPoint. */
  protected get createCurvePhase(): CreateCurvePhase {
    return (0 === this.accepted.length ? CreateCurvePhase.DefineStart : CreateCurvePhase.DefineEnd);
  }

  /** Implemented by sub-classes to create the new curve or construction curve for placement dynamics.
 * @param ev The current button event from a click or motion event.
 * @param isDynamics true when called for dynamics and the point from ev should be included in the result curve.
 * @internal
 */
  protected abstract createNewCurvePrimitive(ev: BeButtonEvent, isDynamics: boolean): CurvePrimitive | undefined;

  protected getCurrentRotation(ev: BeButtonEvent): Matrix3d {
    const matrix = (undefined !== ev.viewport ? AccuDrawHintBuilder.getCurrentRotation(ev.viewport, true, true) : undefined);
    return (undefined !== matrix ? matrix : Matrix3d.createIdentity());
  }

  protected getUpVector(ev: BeButtonEvent): Vector3d {
    return this.getCurrentRotation(ev).getColumn(2);
  }

  protected async updateCurveAndContinuationData(ev: BeButtonEvent, isDynamics: boolean, phase: CreateCurvePhase): Promise<void> {
    this.isConstruction = false;
    this.current = this.createNewCurvePrimitive(ev, isDynamics);
    if (CreateCurvePhase.DefineStart === phase)
      await this.isValidForJoin(); // Updates this.continuationData...
    else if (CreateCurvePhase.DefineEnd === phase)
      await this.isValidForClosure(); // Updates this.isClosed...
  }

  protected get isContinueExistingPath(): boolean { return undefined !== this.continuationData; }

  protected async isValidForContinue(snap: SnapDetail): Promise<{ props: GeometricElementProps, path: Path, params: GeometryParams } | undefined> {
    if (!snap.isElementHit)
      return;

    const snapCurve = snap.getCurvePrimitive();
    if (undefined === snapCurve)
      return;

    const curveS = snapCurve.startPoint();
    const curveE = snapCurve.endPoint();

    if (curveS.isAlmostEqual(curveE))
      return; // Reject snap to single physically closed curve primitive...

    const snapPt = snap.adjustedPoint;
    if (!(snapPt.isAlmostEqual(curveS) || snapPt.isAlmostEqual(curveE)))
      return; // No point to further checks if snap wasn't to endpoint of curve primitive...

    try {
      this._startedCmd = await this.startCommand();
      const info = await CreateOrContinuePathTool.callCommand("requestElementGeometry", snap.sourceId, { maxDisplayable: 1, geometry: { curves: true, surfaces: false, solids: false } });
      if (undefined === info)
        return;

      const data = CreateOrContinuePathTool.isSingleOpenPath(info);
      if (undefined === data)
        return;

      const props = await this.iModel.elements.loadProps(snap.sourceId) as GeometricElementProps;
      if (undefined === props)
        return;

      return { props, path: data.path, params: data.params };
    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, err.toString()));
      return;
    }
  }

  protected async isValidForJoin(): Promise<boolean> {
    this.continuationData = undefined;

    if (!this.wantJoin)
      return false;

    if (undefined === this.current)
      return false;

    const snap = TentativeOrAccuSnap.getCurrentSnap();
    if (undefined === snap)
      return false;

    const data = await this.isValidForContinue(snap);
    if (undefined === data)
      return false;

    if (!CreateOrContinuePathTool.isPathEndPoint(this.current, data.path))
      return false;

    this.continuationData = data;
    return true;
  }

  protected async isValidForClosure(): Promise<boolean> {
    this.isClosed = false;

    if (!this.wantClosure)
      return false;

    if (undefined === this.current)
      return false;

    return (this.isClosed = CreateOrContinuePathTool.isPathClosurePoint(this.current, this.continuationData?.path));
  }

  public static isSingleOpenPath(info: ElementGeometryInfo): { path: Path, params: GeometryParams } | undefined {
    const it = new ElementGeometry.Iterator(info);
    it.requestWorldCoordinates();

    for (const entry of it) {
      const geom = entry.toGeometryQuery();
      if (undefined === geom)
        return;

      if ("curvePrimitive" === geom.geometryCategory) {
        const curve = geom as CurvePrimitive;

        const curveS = curve.startPoint();
        const curveE = curve.endPoint();

        if (curveS.isAlmostEqual(curveE))
          return; // Reject zero length lines, physically closed arcs, linestrings, etc...

        return { path: Path.create(curve), params: entry.geomParams };
      } else if ("curveCollection" === geom.geometryCategory) {
        const curves = geom as CurveCollection;
        if (!curves.isOpenPath)
          return;

        const path = curves as Path;
        const curveS = path.children[0].startPoint();
        const curveE = path.children[path.children.length - 1].endPoint();

        if (curveS.isAlmostEqual(curveE))
          return; // Reject physically closed path...

        return { path, params: entry.geomParams };
      }

      break;
    }

    return;
  }

  public static isPathEndPoint(curve: CurvePrimitive, path: Path): boolean {
    const curveS = curve.startPoint();
    const pathS = path.children[0].startPoint();
    const pathE = path.children[path.children.length - 1].endPoint();

    if (!(curveS.isAlmostEqual(pathS) || curveS.isAlmostEqual(pathE)))
      return false;

    return true;
  }

  public static isPathClosurePoint(curve: CurvePrimitive, path?: Path): boolean {
    const length = curve.quickLength();
    if (length < Geometry.smallMetricDistance)
      return false;

    const curveS = curve.startPoint();
    const curveE = curve.endPoint();

    if (undefined === path) {
      if (!curveS.isAlmostEqual(curveE))
        return false;

      const curveLocalToWorld = FrameBuilder.createRightHandedFrame(undefined, curve);
      if (undefined === curveLocalToWorld)
        return false;

      // Don't create a Loop unless new CurvePrimitive is planar...
      const curvePlane = Plane3dByOriginAndUnitNormal.create(curveLocalToWorld.getOrigin(), curveLocalToWorld.matrix.getColumn(2));
      return (undefined !== curvePlane && curve.isInPlane(curvePlane));
    }

    const pathS = path.children[0].startPoint();
    const pathE = path.children[path.children.length - 1].endPoint();

    if (!(curveS.isAlmostEqual(pathS) && curveE.isAlmostEqual(pathE) || curveS.isAlmostEqual(pathE) && curveE.isAlmostEqual(pathS)))
      return false;

    const pathLocalToWorld = FrameBuilder.createRightHandedFrame(undefined, [curve, path]);
    if (undefined === pathLocalToWorld)
      return false;

    // Don't create a Loop unless new CurvePrimitive + existing Path is planar...
    const pathPlane = Plane3dByOriginAndUnitNormal.create(pathLocalToWorld.getOrigin(), pathLocalToWorld.matrix.getColumn(2));
    if (undefined === pathPlane)
      return false;

    if (!curve.isInPlane(pathPlane))
      return false;

    for (const child of path.children) {
      if (!child.isInPlane(pathPlane))
        return false;
    }

    return true;
  }

  protected clearGraphics(): void {
    if (undefined === this._graphicsProvider)
      return;
    this._graphicsProvider.cleanupGraphic();
    this._graphicsProvider = undefined;
  }

  protected async createGraphics(ev: BeButtonEvent): Promise<void> {
    await this.updateCurveAndContinuationData(ev, true, this.createCurvePhase);
    if (!IModelApp.viewManager.inDynamicsMode || this.isConstruction)
      return; // Don't need to create graphic if dynamics aren't yet active...

    const placement = this.getPlacementProps();
    if (undefined === placement)
      return;

    const geometry = this.getGeometryProps(placement);
    if (undefined === geometry)
      return;

    if (undefined === this._graphicsProvider)
      this._graphicsProvider = new DynamicGraphicsProvider(this.iModel, this.toolId);

    // Set chord tolerance for non-linear curve primitives...
    if (ev.viewport)
      this._graphicsProvider.chordTolerance = computeChordToleranceFromPoint(ev.viewport, ev.point);

    await this._graphicsProvider.createGraphic(this.targetCategory, placement, geometry);
  }

  protected addConstructionGraphics(curve: CurvePrimitive, showCurve: boolean, context: DynamicsContext): void {
    if (!showCurve) {
      switch (curve.curvePrimitiveType) {
        case "arc":
          break;
        default:
          return; // TODO: bcurve poles, etc.
      }
    }

    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(context.viewport.getContrastToBackgroundColor(), ColorDef.black, 1, LinePixels.Code2);

    if (showCurve)
      builder.addPath(Path.create(curve)); // GraphicBuilder doesn't currently have an addCurvePrimitive method...

    switch (curve.curvePrimitiveType) {
      case "arc": {
        const arc = curve as Arc3d;
        const start = arc.startPoint();
        const end = arc.endPoint();

        builder.addLineString([arc.center, start]);
        if (!start.isAlmostEqual(end))
          builder.addLineString([arc.center, end]);

        builder.setSymbology(context.viewport.getContrastToBackgroundColor(), ColorDef.black, 5);
        builder.addPointString([arc.center]);
        break;
      }

      default:
        break;
    }

    context.addGraphic(builder.finish());
  }

  protected showConstructionGraphics(_ev: BeButtonEvent, context: DynamicsContext): boolean {
    if (!this.isConstruction || undefined === this.current)
      return false;

    this.addConstructionGraphics(this.current, true, context);
    return true;
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    if (this.showConstructionGraphics(ev, context))
      return; // Don't display element graphics...

    if (undefined !== this._graphicsProvider)
      this._graphicsProvider.addGraphic(context);
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    return this.createGraphics(ev);
  }

  protected showJoinIndicator(context: DecorateContext, pt: Point3d): void {
    const lengthX = Math.floor(context.viewport.pixelsFromInches(0.08)) + 0.5;
    const lengthY = Math.floor(lengthX * 0.6) + 0.5;
    const offsetX = lengthX * 3;
    const offsetY = lengthY * 3;
    const position = context.viewport.worldToView(pt);

    position.x = Math.floor(position.x - offsetX) + 0.5;
    position.y = Math.floor(position.y + offsetY) + 0.5;

    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.moveTo(-lengthX, lengthY);
      ctx.lineTo(0, lengthY);
      ctx.lineTo(0, -lengthY);
      ctx.lineTo(lengthX, -lengthY);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 1;
      ctx.moveTo(-lengthX, lengthY);
      ctx.lineTo(0, lengthY);
      ctx.lineTo(0, -lengthY);
      ctx.lineTo(lengthX, -lengthY);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.fillStyle = "rgba(0,255,255,.8)";
      ctx.arc(0, -lengthY, 2.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    };
    context.addCanvasDecoration({ position, drawDecoration }, true);
  }

  protected showClosureIndicator(context: DecorateContext, pt: Point3d): void {
    const radius = Math.floor(context.viewport.pixelsFromInches(0.06)) + 0.5;
    const offset = radius * 2.5;
    const position = context.viewport.worldToView(pt);

    position.x = Math.floor(position.x - offset) + 0.5;
    position.y = Math.floor(position.y + offset) + 0.5;

    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(0,0,255,.2)";
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.arc(0, 0, radius + 1, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.fillStyle = "rgba(0,255,255,.8)";
      ctx.arc(-radius, 0, 2.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    };
    context.addCanvasDecoration({ position, drawDecoration }, true);
  }

  public override decorate(context: DecorateContext): void {
    if (undefined === this.current)
      return;

    if (this.showJoin)
      this.showJoinIndicator(context, this.current.startPoint());
    else if (this.showClosure)
      this.showClosureIndicator(context, this.current.endPoint());
  }

  public override async onModifierKeyTransition(_wentDown: boolean, modifier: BeModifierKeys, _event: KeyboardEvent): Promise<EventHandled> {
    if (BeModifierKeys.Control !== modifier)
      return EventHandled.No;

    // Update display for join/closure change w/o waiting for a motion event...
    return EventHandled.Yes;
  }

  protected getPlacementProps(): PlacementProps | undefined {
    if (undefined !== this.continuationData)
      return this.continuationData.props.placement;

    if (undefined === this.current)
      return;

    const vp = this.targetView;
    if (undefined === vp)
      return;

    const matrix = AccuDrawHintBuilder.getCurrentRotation(vp, true, true);
    const localToWorld = FrameBuilder.createRightHandedFrame(matrix?.getColumn(2), this.current);
    if (undefined === localToWorld)
      return;

    const origin = localToWorld.getOrigin();
    const angles = new YawPitchRollAngles();

    YawPitchRollAngles.createFromMatrix3d(localToWorld.matrix, angles);

    if (vp.view.is3d())
      return { origin, angles };

    return { origin, angle: angles.yaw };
  }

  protected createNewPath(placement: PlacementProps): JsonGeometryStream | FlatBufferGeometryStream | undefined {
    if (undefined === this.current)
      return;

    const builder = new ElementGeometry.Builder();
    builder.setLocalToWorldFromPlacement(placement);

    const geometry = (this.isClosed ? Loop.create(this.current) : this.current);
    if (!builder.appendGeometryQuery(geometry))
      return;

    return { format: "flatbuffer", data: builder.entries };
  }

  protected continueExistingPath(placement: PlacementProps): JsonGeometryStream | FlatBufferGeometryStream | undefined {
    if (undefined === this.current || undefined === this.continuationData)
      return;

    const length = this.current.quickLength();
    if (length < Geometry.smallMetricDistance)
      return;

    const curveS = this.current.startPoint();
    const pathS = this.continuationData.path.children[0].startPoint();
    const pathE = this.continuationData.path.children[this.continuationData.path.children.length - 1].endPoint();

    const append = pathE.isAlmostEqual(curveS);
    if (!append && !pathS.isAlmostEqual(curveS))
      return;

    const continuePath = this.continuationData.path.clone() as Path;
    if (undefined === continuePath)
      return;

    const current = this.current.clone() as CurvePrimitive;
    if (undefined === current)
      return;

    if (append) {
      continuePath.tryAddChild(current);
    } else {
      current.reverseInPlace();
      continuePath.children.splice(0, 0, current);
    }

    const geometry = (this.isClosed ? Loop.create(...continuePath.children) : continuePath);
    if (this.wantSimplify)
      RegionOps.consolidateAdjacentPrimitives(geometry);

    const builder = new ElementGeometry.Builder();
    builder.setLocalToWorldFromPlacement(placement);
    builder.appendGeometryParamsChange(this.continuationData.params);

    if (!builder.appendGeometryQuery(geometry))
      return;

    return { format: "flatbuffer", data: builder.entries };
  }

  protected getGeometryProps(placement: PlacementProps): JsonGeometryStream | FlatBufferGeometryStream | undefined {
    if (this.isContinueExistingPath)
      return this.continueExistingPath(placement);

    return this.createNewPath(placement);
  }

  protected getElementProps(placement: PlacementProps): GeometricElementProps | undefined {
    if (undefined !== this.continuationData)
      return this.continuationData.props;

    const model = this.targetModelId;
    const category = this.targetCategory;

    if (isPlacement3dProps(placement))
      return { classFullName: "Generic:PhysicalObject", model, category, code: Code.createEmpty(), placement };

    return { classFullName: "BisCore:DrawingGraphic", model, category, code: Code.createEmpty(), placement };
  }

  protected async createElement(): Promise<void> {
    const placement = this.getPlacementProps();
    if (undefined === placement)
      return;

    const geometry = this.getGeometryProps(placement);
    if (undefined === geometry)
      return;

    const elemProps = this.getElementProps(placement);
    if (undefined === elemProps)
      return;

    let data;
    if ("flatbuffer" === geometry.format) {
      data = { entryArray: geometry.data };
      delete elemProps.geom; // Leave unchanged until replaced by flatbuffer geometry...
    } else {
      elemProps.geom = geometry.data;
    }

    try {
      this._startedCmd = await this.startCommand();
      if (undefined === elemProps.id)
        await CreateOrContinuePathTool.callCommand("insertGeometricElement", elemProps, data);
      else
        await CreateOrContinuePathTool.callCommand("updateGeometricElement", elemProps, data);
      await this.saveChanges();
    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, err.toString()));
    }
  }

  protected setupAccuDraw(): void {
    const nPts = this.accepted.length;
    if (0 === nPts)
      return;

    const hints = new AccuDrawHintBuilder();

    if (this.wantSmartRotation)
      hints.enableSmartRotation = true;

    // Rotate AccuDraw to last segment...
    if (nPts > 1 && !this.accepted[nPts - 1].isAlmostEqual(this.accepted[nPts - 2]))
      hints.setXAxis(Vector3d.createStartEnd(this.accepted[nPts - 2], this.accepted[nPts - 1]));

    hints.setOrigin(this.accepted[nPts - 1]);
    hints.sendHints();
  }

  protected override setupAndPromptForNextAction(): void {
    this.setupAccuDraw();
    super.setupAndPromptForNextAction();
  }

  protected async acceptPoint(ev: BeButtonEvent): Promise<boolean> {
    const phase = this.createCurvePhase;
    this.accepted.push(ev.point.clone());
    await this.updateCurveAndContinuationData(ev, false, phase);
    return true;
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (!await this.acceptPoint(ev))
      return EventHandled.Yes;
    return super.onDataButtonDown(ev);
  }

  public override async onUndoPreviousStep(): Promise<boolean> {
    if (0 === this.accepted.length)
      return false;

    this.accepted.pop();
    if (0 === this.accepted.length)
      this.onReinitialize();
    else
      this.setupAndPromptForNextAction();

    return true;
  }

  public override onCleanup(): void {
    this.clearGraphics();
    super.onCleanup();
  }
}

/** @alpha Creates a line string or shape. Uses model and category from ToolAdmin.ActiveSettings. */
export class CreateLineStringTool extends CreateOrContinuePathTool {
  public static override toolId = "CreateLineString";
  public static override iconSpec = "icon-snaps"; // Need better icon...
  protected _snapGeomId?: Id64String;

  protected override provideToolAssistance(_mainInstrText?: string, _additionalInstr?: ToolAssistanceInstruction[]): void {
    const nPts = this.accepted.length;
    const mainMsg = CoreTools.translate(0 === nPts ? "ElementSet.Prompts.StartPoint" : (1 === nPts ? "ElementSet.Prompts.EndPoint" : "ElementSet.Inputs.AdditionalPoint"));
    const leftMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const rghtMsg = CoreTools.translate(nPts > 1 ? "ElementSet.Inputs.Complete" : "ElementSet.Inputs.Cancel");

    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, leftMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, leftMsg, false, ToolAssistanceInputMethod.Mouse));

    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rghtMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rghtMsg, false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, mainMsg);
    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  protected override get wantClosure(): boolean {
    // A linestring can support physical closure when creating a new path...
    return this.allowClosure;
  }

  protected override isComplete(ev: BeButtonEvent): boolean {
    // Accept on reset with at least 2 points...
    if (BeButton.Reset === ev.button)
      return (this.accepted.length > 1);

    // Allow data to complete on physical closure (creates Loop)...
    return this.isClosed;
  }

  protected createNewCurvePrimitive(ev: BeButtonEvent, isDynamics: boolean): CurvePrimitive | undefined {
    const numRequired = (isDynamics ? 1 : 2);
    if (this.accepted.length < numRequired) {
      this.isConstruction = true; // Create zero length line as construction geometry to support join...
      const pt = (0 !== this.accepted.length ? this.accepted[0] : ev.point);
      return LineString3d.create([pt, pt]);
    }

    const pts = (isDynamics ? [...this.accepted, ev.point] : this.accepted);
    return LineString3d.create(pts);
  }

  public override testDecorationHit(id: Id64String): boolean {
    return id === this._snapGeomId;
  }

  public override async getToolTip(hit: HitDetail): Promise<HTMLElement | string> {
    if (this.testDecorationHit(hit.sourceId))
      return this.description;
    return super.getToolTip(hit);
  }

  public override getDecorationGeometry(_hit: HitDetail): GeometryStreamProps | undefined {
    if (this.accepted.length < 2)
      return;
    const geom = IModelJson.Writer.toIModelJson(LineString3d.create(this.accepted));
    return geom ? [geom] : undefined;
  }

  public override decorate(context: DecorateContext): void {
    super.decorate(context);

    if (this.accepted.length < 2)
      return;

    if (undefined === this._snapGeomId)
      this._snapGeomId = this.iModel.transientIds.next;

    const builder = context.createGraphic({ type: GraphicType.WorldDecoration, pickable: { id: this._snapGeomId, locateOnly: true } });
    builder.setSymbology(ColorDef.white, ColorDef.white, 1);
    builder.addLineString(this.accepted); // Allow snapping to accepted segments...
    context.addDecorationFromBuilder(builder);
  }

  public override async onResetButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    // NOTE: Starting another tool will not create element...require reset or closure...
    if (this.isComplete(ev)) {
      await this.updateCurveAndContinuationData(ev, false, CreateCurvePhase.DefineEnd);
      await this.createElement();
    }

    return super.onResetButtonUp(ev);
  }

  public onRestartTool(): void {
    const tool = new CreateLineStringTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** @alpha */
export enum ArcMethod {
  CenterStart = 0,
  StartCenter = 1,
  StartMidEnd = 2,
  StartEndMid = 3,
}

/** @alpha Creates an arc. Uses model and category from ToolAdmin.ActiveSettings. */
export class CreateArcTool extends CreateOrContinuePathTool {
  public static override toolId = "CreateArc";
  public static override iconSpec = "icon-three-points-circular-arc";

  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 3; } // method, radius, sweep - zero value unlocks associated "use" toggle...

  protected override provideToolAssistance(mainInstrText?: string, additionalInstr?: ToolAssistanceInstruction[]): void {
    const nPts = this.accepted.length;

    switch (this.method) {
      case ArcMethod.CenterStart:
        mainInstrText = (0 === nPts ? EditTools.translate("CreateArc.Prompts.CenterPoint") : (1 === nPts ? CoreTools.translate("ElementSet.Prompts.StartPoint") : CoreTools.translate("ElementSet.Prompts.EndPoint")));
        break;

      case ArcMethod.StartCenter:
        mainInstrText = (0 === nPts ? CoreTools.translate("ElementSet.Prompts.StartPoint") : (1 === nPts ? EditTools.translate("CreateArc.Prompts.CenterPoint") : CoreTools.translate("ElementSet.Prompts.EndPoint")));
        break;

      case ArcMethod.StartMidEnd:
        mainInstrText = (0 === nPts ? CoreTools.translate("ElementSet.Prompts.StartPoint") : (1 === nPts ? EditTools.translate("CreateArc.Prompts.MidPoint") : CoreTools.translate("ElementSet.Prompts.EndPoint")));
        break;

      case ArcMethod.StartEndMid:
        mainInstrText = (0 === nPts ? CoreTools.translate("ElementSet.Prompts.StartPoint") : (1 === nPts ? CoreTools.translate("ElementSet.Prompts.EndPoint") : EditTools.translate("CreateArc.Prompts.MidPoint")));
        break;
    }

    super.provideToolAssistance(mainInstrText, additionalInstr);
  }

  protected override setupAccuDraw(): void {
    const nPts = this.accepted.length;
    if (0 === nPts)
      return;

    const hints = new AccuDrawHintBuilder();

    if (this.wantSmartRotation)
      hints.enableSmartRotation = true;

    switch (this.accepted.length) {
      case 1:
        hints.setOrigin(this.accepted[0]);

        if (ArcMethod.CenterStart !== this.method)
          break;

        hints.setOriginFixed = true;
        hints.setModePolar();
        break;

      case 2:
        switch (this.method) {
          case ArcMethod.CenterStart:
            if (!this.accepted[0].isAlmostEqual(this.accepted[1]))
              hints.setXAxis(Vector3d.createStartEnd(this.accepted[0], this.accepted[1])); // Rotate AccuDraw to major axis...
            break;

          case ArcMethod.StartCenter:
            let center = this.accepted[1];
            const start = this.accepted[0];
            const vector0 = center.unitVectorTo(start);

            if (undefined === vector0)
              break;

            if (this.useRadius)
              center = start.plusScaled(vector0, -this.radius);

            hints.setOrigin(center);
            hints.setOriginFixed = true;
            hints.setModePolar();
            hints.setXAxis(vector0);
            break;

          default:
            hints.setOrigin(this.accepted[1]);
            break;
        }
        break;
    }

    hints.sendHints();
  }

  private static methodMessage(str: string) { return EditTools.translate(`CreateArc.Method.${str}`); }
  private static getMethodChoices = (): EnumerationChoice[] => {
    return [
      { label: CreateArcTool.methodMessage("CenterStart"), value: ArcMethod.CenterStart },
      { label: CreateArcTool.methodMessage("StartCenter"), value: ArcMethod.StartCenter },
      { label: CreateArcTool.methodMessage("StartMidEnd"), value: ArcMethod.StartMidEnd },
      { label: CreateArcTool.methodMessage("StartEndMid"), value: ArcMethod.StartEndMid },
    ];
  };

  private _methodProperty: DialogProperty<number> | undefined;
  public get methodProperty() {
    if (!this._methodProperty)
      this._methodProperty = new DialogProperty<number>(PropertyDescriptionHelper.buildEnumPicklistEditorDescription(
        "arcMethod", EditTools.translate("CreateArc.Label.Method"), CreateArcTool.getMethodChoices()), ArcMethod.StartCenter as number);
    return this._methodProperty;
  }

  public get method(): ArcMethod { return this.methodProperty.value as ArcMethod; }
  public set method(method: ArcMethod) { this.methodProperty.value = method; }

  private _useRadiusProperty: DialogProperty<boolean> | undefined;
  public get useRadiusProperty() {
    if (!this._useRadiusProperty)
      this._useRadiusProperty = new DialogProperty<boolean>(PropertyDescriptionHelper.buildLockPropertyDescription("useArcRadius"), false);
    return this._useRadiusProperty;
  }

  public get useRadius(): boolean { return this.useRadiusProperty.value; }
  public set useRadius(value: boolean) { this.useRadiusProperty.value = value; }

  private _radiusProperty: DialogProperty<number> | undefined;
  public get radiusProperty() {
    if (!this._radiusProperty)
      this._radiusProperty = new DialogProperty<number>(new LengthDescription("arcRadius", EditTools.translate("CreateArc.Label.Radius")), 0.1, undefined, !this.useRadius);
    return this._radiusProperty;
  }

  public get radius(): number { return this.radiusProperty.value; }
  public set radius(value: number) { this.radiusProperty.value = value; }

  private _useSweepProperty: DialogProperty<boolean> | undefined;
  public get useSweepProperty() {
    if (!this._useSweepProperty)
      this._useSweepProperty = new DialogProperty<boolean>(PropertyDescriptionHelper.buildLockPropertyDescription("useArcSweep"), false);
    return this._useSweepProperty;
  }

  public get useSweep(): boolean { return this.useSweepProperty.value; }
  public set useSweep(value: boolean) { this.useSweepProperty.value = value; }

  private _sweepProperty: DialogProperty<number> | undefined;
  public get sweepProperty() {
    if (!this._sweepProperty)
      this._sweepProperty = new DialogProperty<number>(new AngleDescription("arcSweep", EditTools.translate("CreateArc.Label.Sweep")), Math.PI / 2.0, undefined, !this.useSweep);
    return this._sweepProperty;
  }

  public get sweep(): number { return this.sweepProperty.value; }
  public set sweep(value: number) { this.sweepProperty.value = value; }

  protected override isComplete(_ev: BeButtonEvent): boolean {
    return (3 === this.accepted.length);
  }

  protected override get createCurvePhase(): CreateCurvePhase {
    switch (this.accepted.length) {
      case 0:
        return ArcMethod.CenterStart === this.method ? CreateCurvePhase.DefineOther : CreateCurvePhase.DefineStart;
      case 1:
        if (ArcMethod.CenterStart === this.method)
          return CreateCurvePhase.DefineStart;
        else if (ArcMethod.StartEndMid === this.method)
          return CreateCurvePhase.DefineEnd;
        else
          return CreateCurvePhase.DefineOther;
      default:
        return ArcMethod.StartEndMid === this.method ? CreateCurvePhase.DefineOther : CreateCurvePhase.DefineEnd;
    }
  }

  protected createConstructionCurve(ev: BeButtonEvent, isDynamics: boolean): CurvePrimitive | undefined {
    switch (this.accepted.length) {
      case 0: {
        if (ArcMethod.CenterStart === this.method)
          return undefined;

        return LineString3d.create([ev.point, ev.point]);
      }

      case 1: {
        const pt1 = this.accepted[0];
        const pt2 = (isDynamics ? ev.point : pt1);

        switch (this.method) {
          case ArcMethod.CenterStart:
          case ArcMethod.StartCenter: {
            if (pt1.isAlmostEqual(pt2))
              return (ArcMethod.StartCenter === this.method ? LineString3d.create([pt1, pt2]) : undefined);

            let center = (ArcMethod.CenterStart === this.method ? pt1 : pt2);
            const start = (ArcMethod.CenterStart === this.method ? pt2 : pt1);
            const normal = this.getUpVector(ev);
            const vector0 = Vector3d.createStartEnd(center, start);
            const vector90 = normal.crossProduct(vector0);
            const radius = (this.useRadius ? this.radius : vector0.magnitude());

            if (this.useRadius) {
              if (ArcMethod.StartCenter === this.method) {
                vector0.normalizeInPlace();
                center = start.plusScaled(vector0, -radius);
              }
            } else {
              this.radius = radius;
              this.syncToolSettingsRadiusAndSweep();
            }

            vector0.scaleToLength(radius, vector0);
            vector90.scaleToLength(radius, vector90);

            return Arc3d.create(center, vector0, vector90);
          }

          case ArcMethod.StartMidEnd:
          case ArcMethod.StartEndMid: {
            return LineString3d.create([pt1, pt2]);
          }

          default:
            return undefined;
        }
      }

      case 2: {
        switch (this.method) {
          case ArcMethod.CenterStart:
            return LineString3d.create([this.accepted[1], this.accepted[0]]);

          case ArcMethod.StartCenter:
          case ArcMethod.StartMidEnd:
          case ArcMethod.StartEndMid:
            return LineString3d.create([this.accepted[0], this.accepted[1]]);

          default:
            return undefined;
        }
      }

      default:
        return undefined;
    }
  }

  protected createNewCurvePrimitive(ev: BeButtonEvent, isDynamics: boolean): CurvePrimitive | undefined {
    const numRequired = (isDynamics ? 2 : 3);
    if (this.accepted.length < numRequired) {
      this.isConstruction = true; // Create construction geometry to support join...
      return this.createConstructionCurve(ev, isDynamics);
    }

    const final = (isDynamics ? ev.point : this.accepted[2]);
    const start = (ArcMethod.CenterStart === this.method ? this.accepted[1] : this.accepted[0]);
    const end = (ArcMethod.StartEndMid === this.method ? this.accepted[1] : final);

    switch (this.method) {
      case ArcMethod.CenterStart:
      case ArcMethod.StartCenter:
        let center = (ArcMethod.CenterStart === this.method ? this.accepted[0] : this.accepted[1]);
        if (center.isAlmostEqual(start))
          return undefined; // Don't create 0 radius arc...

        const vector0 = Vector3d.createStartEnd(center, start);
        const vector90 = Vector3d.create();
        const radius = (this.useRadius ? this.radius : vector0.magnitude());
        const sweep = Angle.createRadians(this.useSweep ? this.sweep : Angle.pi2Radians);

        if (this.useRadius) {
          if (ArcMethod.StartCenter === this.method) {
            vector0.normalizeInPlace();
            center = start.plusScaled(vector0, -radius);
          }
        } else {
          this.radius = radius;
        }

        let defaultArc = (undefined !== this.current && "arc" === this.current.curvePrimitiveType ? this.current as Arc3d : undefined);
        if (undefined === defaultArc) {
          this.getUpVector(ev).crossProduct(vector0, vector90);
          vector0.scaleToLength(radius, vector0);
          vector90.scaleToLength(radius, vector90);

          // Create default arc that follows continuation path start/end tangent...
          if (undefined !== this.continuationData) {
            const pathS = this.continuationData.path.children[0].startPoint();

            if (start.isAlmostEqual(pathS)) {
              const tangentS = this.continuationData.path.children[0].fractionToPointAndUnitTangent(0.0);

              if (vector90.dotProduct(tangentS.direction) > 0.0)
                sweep.setRadians(-sweep.radians);
            } else {
              const tangentE = this.continuationData.path.children[this.continuationData.path.children.length - 1].fractionToPointAndUnitTangent(1.0);

              if (vector90.dotProduct(tangentE.direction) < 0.0)
                sweep.setRadians(-sweep.radians);
            }
          }

          defaultArc = Arc3d.create(center, vector0, vector90, AngleSweep.create(sweep));
        }

        // Don't have well defined minor axis, continue using previous or default arc...
        if (start.isAlmostEqual(end))
          return defaultArc;

        const prevSweep = Angle.createRadians(defaultArc.sweep.sweepRadians);
        Vector3d.createStartEnd(center, end, vector90);
        sweep.setFrom(vector0.planarAngleTo(vector90, defaultArc.perpendicularVector));

        defaultArc.perpendicularVector.crossProduct(vector0, vector90);
        vector0.scaleToLength(radius, vector0);
        vector90.scaleToLength(radius, vector90);

        if (Math.abs(sweep.radians) < Angle.createDegrees(30.0).radians && prevSweep.isFullCircle && ((sweep.radians < 0.0 && prevSweep.radians > 0.0) || (sweep.radians > 0.0 && prevSweep.radians < 0.0)))
          prevSweep.setRadians(-prevSweep.radians); // Reverse direction...

        if (sweep.isAlmostZero)
          sweep.setDegrees(prevSweep.radians < 0.0 ? -360.0 : 360.0); // Create full sweep...

        if (this.useSweep) {
          if ((sweep.radians < 0.0 && this.sweep > 0.0) || (sweep.radians > 0.0 && this.sweep < 0.0))
            sweep.setRadians(-this.sweep);
          else
            sweep.setRadians(this.sweep);
        } else {
          if (sweep.radians < 0.0 && prevSweep.radians > 0.0)
            sweep.setRadians(Angle.pi2Radians + sweep.radians);
          else if (sweep.radians > 0.0 && prevSweep.radians < 0.0)
            sweep.setRadians(-(Angle.pi2Radians - sweep.radians));

          this.sweep = sweep.radians;
        }

        if (!this.useRadius || !this.useSweep)
          this.syncToolSettingsRadiusAndSweep();

        return Arc3d.create(center, vector0, vector90, AngleSweep.create(sweep));

      case ArcMethod.StartMidEnd:
      case ArcMethod.StartEndMid:
        const mid = (ArcMethod.StartEndMid === this.method ? final : this.accepted[1]);
        return Arc3d.createCircularStartMiddleEnd(start, mid, end);
    }
  }

  protected override showConstructionGraphics(ev: BeButtonEvent, context: DynamicsContext): boolean {
    if (super.showConstructionGraphics(ev, context))
      return true;

    if (undefined !== this.current)
      this.addConstructionGraphics(this.current, false, context);
    return false;
  }

  private syncToolSettingsRadiusAndSweep(): void {
    switch (this.method) {
      case ArcMethod.CenterStart:
      case ArcMethod.StartCenter:
        if (this.useRadius && this.useSweep)
          return;
        break;

      default:
        return;
    }

    const syncData: DialogPropertySyncItem[] = [];

    if (!this.useRadius) {
      this.radiusProperty.displayValue = (this.radiusProperty.description as LengthDescription).format(this.radius);
      this.radiusProperty.isDisabled = !this.useRadius;
      syncData.push(this.radiusProperty.syncItem);
    }

    if (!this.useSweep) {
      this.sweepProperty.displayValue = (this.sweepProperty.description as AngleDescription).format(this.sweep);
      this.sweepProperty.isDisabled = !this.useSweep;
      syncData.push(this.sweepProperty.syncItem);
    }

    if (0 !== syncData.length)
      this.syncToolSettingsProperties(syncData);
  }

  private syncRadiusState(): void {
    this.radiusProperty.displayValue = (this.radiusProperty.description as LengthDescription).format(this.radius);
    this.radiusProperty.isDisabled = !this.useRadius;
    this.syncToolSettingsProperties([this.radiusProperty.syncItem]);
  }

  private syncSweepState(): void {
    this.sweepProperty.displayValue = (this.sweepProperty.description as AngleDescription).format(this.sweep);
    this.sweepProperty.isDisabled = !this.useSweep;
    this.syncToolSettingsProperties([this.sweepProperty.syncItem]);
  }

  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (this.methodProperty.name === updatedValue.propertyName) {
      this.methodProperty.value = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.methodProperty.item);
      this.onReinitialize();
      return true;
    } else if (updatedValue.propertyName === this.useRadiusProperty.name) {
      this.useRadius = updatedValue.value.value as boolean;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.useRadiusProperty.item);
      this.syncRadiusState();
      return true;
    } else if (updatedValue.propertyName === this.useSweepProperty.name) {
      this.useSweep = updatedValue.value.value as boolean;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.useSweepProperty.item);
      this.syncSweepState();
      return true;
    } else if (updatedValue.propertyName === this.radiusProperty.name) {
      if (!updatedValue.value.value) {
        this.syncRadiusState(); // force UI to redisplay last valid value
        return false;
      }
      this.radius = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.radiusProperty.item);
      // If radius is changed when creating arc by start/center after center has been defined, back up a step to defined a new center point...
      if (ArcMethod.StartCenter === this.method && this.useRadius && 2 === this.accepted.length)
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.onUndoPreviousStep();
      return true;
    } else if (updatedValue.propertyName === this.sweepProperty.name) {
      if (!updatedValue.value.value) {
        this.syncSweepState(); // force UI to redisplay last valid value
        return false;
      }
      this.sweep = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.sweepProperty.item);
      return true;
    }
    return false;
  }

  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();
    toolSettings.push(this.methodProperty.toDialogItem({ rowPriority: 1, columnIndex: 0 }));

    if (ArcMethod.CenterStart === this.method || ArcMethod.StartCenter === this.method) {
      // ensure controls are enabled/disabled base on current lock property state
      this.radiusProperty.isDisabled = !this.useRadius;
      this.sweepProperty.isDisabled = !this.useSweep;
      const useRadiusLock = this.useRadiusProperty.toDialogItem({ rowPriority: 2, columnIndex: 0 });
      const useSweepLock = this.useSweepProperty.toDialogItem({ rowPriority: 3, columnIndex: 0 });
      toolSettings.push(this.radiusProperty.toDialogItem({ rowPriority: 2, columnIndex: 1 }, useRadiusLock));
      toolSettings.push(this.sweepProperty.toDialogItem({ rowPriority: 3, columnIndex: 1 }, useSweepLock));
    }
    return toolSettings;
  }

  public onRestartTool(): void {
    const tool = new CreateArcTool();
    if (!tool.run())
      this.exitTool();
  }

  public override onInstall(): boolean {
    if (!super.onInstall())
      return false;

    // Setup initial values here instead of supplyToolSettingsProperties to support keyin args w/o ui-framework...
    const methodValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.methodProperty.name);
    if (undefined !== methodValue)
      this.methodProperty.dialogItemValue = methodValue;

    const radiusValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.radiusProperty.name);
    if (undefined !== radiusValue)
      this.radiusProperty.dialogItemValue = radiusValue;

    const useRadiusValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.useRadiusProperty.name);
    if (undefined !== useRadiusValue)
      this.useRadiusProperty.dialogItemValue = useRadiusValue;

    if (!this.radius)
      this.useRadius = false;

    const useSweepValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.useSweepProperty.name);
    if (undefined !== useSweepValue)
      this.useSweepProperty.dialogItemValue = useSweepValue;

    const sweepValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.sweepProperty.name);
    if (undefined !== sweepValue)
      this.sweepProperty.dialogItemValue = sweepValue;

    if (!this.sweep)
      this.useSweep = false;

    return true;
  }

  /** The keyin takes the following arguments, all of which are optional:
   *  - `method=0|1|2|3` How arc will be defined. 0 for center/start, 1 for start/center, 2 for start/mid/end, and 3 for start/end/mid.
   *  - `radius=number` Arc radius for start/center or center/start, 0 to define by points.
   *  - `sweep=number` Arc sweep angle in degrees for start/center or center/start, 0 to define by points.
   */
  public override parseAndRun(...inputArgs: string[]): boolean {
    let arcMethod;
    let arcRadius;
    let arcSweep;

    for (const arg of inputArgs) {
      const parts = arg.split("=");
      if (2 !== parts.length)
        continue;

      if (parts[0].toLowerCase().startsWith("me")) {
        const method = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(method)) {
          switch (method) {
            case 0:
              arcMethod = ArcMethod.CenterStart;
              break;
            case 1:
              arcMethod = ArcMethod.StartCenter;
              break;
            case 2:
              arcMethod = ArcMethod.StartMidEnd;
              break;
            case 3:
              arcMethod = ArcMethod.StartEndMid;
              break;
          }
        }
      } else if (parts[0].toLowerCase().startsWith("ra")) {
        const radius = Number.parseFloat(parts[1]);
        if (!Number.isNaN(radius)) {
          arcRadius = radius;
        }
      } else if (parts[0].toLowerCase().startsWith("sw")) {
        const sweep = Number.parseFloat(parts[1]);
        if (!Number.isNaN(sweep)) {
          arcSweep = Angle.createDegrees(sweep).radians;
        }
      }
    }

    // Update current session values so keyin args are picked up for tool settings/restart...
    if (undefined !== arcMethod)
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.methodProperty.name, value: { value: arcMethod } });

    if (undefined !== arcRadius) {
      if (0.0 !== arcRadius)
        IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.radiusProperty.name, value: { value: arcRadius } });
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.useRadiusProperty.name, value: { value: 0.0 !== arcRadius } });
    }

    if (undefined !== arcSweep) {
      if (0.0 !== arcSweep)
        IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.sweepProperty.name, value: { value: arcSweep } });
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.useSweepProperty.name, value: { value: 0.0 !== arcSweep } });
    }

    return this.run();
  }
}

/** @alpha */
export enum CircleMethod {
  Center = 0,
  Edge = 1,
}

/** @alpha Creates a circle. Uses model and category from ToolAdmin.ActiveSettings. */
export class CreateCircleTool extends CreateOrContinuePathTool {
  public static override toolId = "CreateCircle";
  public static override iconSpec = "icon-circle";

  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 2; } // method, radius - zero value unlocks associated "use" toggle...

  protected override get createCurvePhase(): CreateCurvePhase { return CreateCurvePhase.DefineOther; } // No join or closure checks...

  protected override provideToolAssistance(mainInstrText?: string, additionalInstr?: ToolAssistanceInstruction[]): void {
    const nPts = this.accepted.length;

    switch (this.method) {
      case CircleMethod.Center:
        mainInstrText = EditTools.translate(0 === nPts ? "CreateCircle.Prompts.CenterPoint" : "CreateCircle.Prompts.EdgePoint");
        break;

      case CircleMethod.Edge:
        mainInstrText = EditTools.translate(0 === nPts ? "CreateCircle.Prompts.EdgePoint" : "CreateCircle.Prompts.CenterPoint");
        break;
    }

    super.provideToolAssistance(mainInstrText, additionalInstr);
  }

  protected override setupAccuDraw(): void {
    const nPts = this.accepted.length;
    if (0 === nPts)
      return;

    const hints = new AccuDrawHintBuilder();

    if (this.wantSmartRotation)
      hints.enableSmartRotation = true;

    if (CircleMethod.Center === this.method && 1 === this.accepted.length) {
      hints.setOrigin(this.accepted[0]);
      hints.setOriginFixed = true;
      hints.setModePolar();
    }

    hints.sendHints();
  }

  private static methodMessage(str: string) { return EditTools.translate(`CreateCircle.Method.${str}`); }
  private static getMethodChoices = (): EnumerationChoice[] => {
    return [
      { label: CreateCircleTool.methodMessage("Center"), value: CircleMethod.Center },
      { label: CreateCircleTool.methodMessage("Edge"), value: CircleMethod.Edge },
    ];
  };

  private _methodProperty: DialogProperty<number> | undefined;
  public get methodProperty() {
    if (!this._methodProperty)
      this._methodProperty = new DialogProperty<number>(PropertyDescriptionHelper.buildEnumPicklistEditorDescription(
        "circleMethod", EditTools.translate("CreateCircle.Label.Method"), CreateCircleTool.getMethodChoices()), CircleMethod.Center as number);
    return this._methodProperty;
  }

  public get method(): CircleMethod { return this.methodProperty.value as CircleMethod; }
  public set method(method: CircleMethod) { this.methodProperty.value = method; }

  private _useRadiusProperty: DialogProperty<boolean> | undefined;
  public get useRadiusProperty() {
    if (!this._useRadiusProperty)
      this._useRadiusProperty = new DialogProperty<boolean>(PropertyDescriptionHelper.buildLockPropertyDescription("useCircleRadius"), false);
    return this._useRadiusProperty;
  }

  public get useRadius(): boolean { return this.useRadiusProperty.value; }
  public set useRadius(value: boolean) { this.useRadiusProperty.value = value; }

  private _radiusProperty: DialogProperty<number> | undefined;
  public get radiusProperty() {
    if (!this._radiusProperty)
      this._radiusProperty = new DialogProperty<number>(new LengthDescription("circleRadius", EditTools.translate("CreateCircle.Label.Radius")), 0.1, undefined, !this.useRadius);
    return this._radiusProperty;
  }

  public get radius(): number { return this.radiusProperty.value; }
  public set radius(value: number) { this.radiusProperty.value = value; }

  protected override isComplete(_ev: BeButtonEvent): boolean {
    if (CircleMethod.Center === this.method && this.useRadius)
      return (this.accepted.length >= 1); // Could be 2 if radius locked after 1st data point...
    return (2 === this.accepted.length);
  }

  protected createNewCurvePrimitive(ev: BeButtonEvent, isDynamics: boolean): CurvePrimitive | undefined {
    this.isClosed = true; // Always closed...

    const numRequired = (isDynamics ? 1 : 2);
    if (this.accepted.length < numRequired) {
      if (CircleMethod.Center === this.method && this.useRadius)
        return Arc3d.createCenterNormalRadius(isDynamics ? ev.point : this.accepted[0], this.getUpVector(ev), this.radius);
      return undefined;
    }

    const pt1 = this.accepted[0];
    const pt2 = (isDynamics ? ev.point : this.accepted[1]);

    let center = (CircleMethod.Center === this.method ? pt1 : pt2);
    const edge = (CircleMethod.Center === this.method ? pt2 : pt1);

    const normal = this.getUpVector(ev);
    const vector0 = Vector3d.createStartEnd(center, edge);
    const vector90 = normal.crossProduct(vector0);
    const radius = (this.useRadius ? this.radius : vector0.magnitude());

    if (this.useRadius) {
      if (CircleMethod.Edge === this.method) {
        vector0.normalizeInPlace();
        center = edge.plusScaled(vector0, -radius);
      }
    } else {
      this.radius = radius;
      this.syncToolSettingsRadius();
    }

    vector0.scaleToLength(radius, vector0);
    vector90.scaleToLength(radius, vector90);

    return Arc3d.create(center, vector0, vector90);
  }

  protected override showConstructionGraphics(ev: BeButtonEvent, context: DynamicsContext): boolean {
    if (super.showConstructionGraphics(ev, context))
      return true;

    if (undefined !== this.current && !(CircleMethod.Center === this.method && this.useRadius))
      this.addConstructionGraphics(this.current, false, context);
    return false;
  }

  private syncToolSettingsRadius(): void {
    if (this.useRadius)
      return;

    const syncData: DialogPropertySyncItem[] = [];

    if (!this.useRadius) {
      this.radiusProperty.displayValue = (this.radiusProperty.description as LengthDescription).format(this.radius);
      this.radiusProperty.isDisabled = !this.useRadius;
      syncData.push(this.radiusProperty.syncItem);
    }

    if (0 !== syncData.length)
      this.syncToolSettingsProperties(syncData);
  }

  private syncRadiusState(): void {
    this.radiusProperty.displayValue = (this.radiusProperty.description as LengthDescription).format(this.radius);
    this.radiusProperty.isDisabled = !this.useRadius;
    this.syncToolSettingsProperties([this.radiusProperty.syncItem]);
  }

  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (this.methodProperty.name === updatedValue.propertyName) {
      this.methodProperty.value = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.methodProperty.item);
      this.onReinitialize();
      return true;
    } else if (updatedValue.propertyName === this.useRadiusProperty.name) {
      this.useRadius = updatedValue.value.value as boolean;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.useRadiusProperty.item);
      this.syncRadiusState();
      if (CircleMethod.Center === this.method && this.useRadius && 0 === this.accepted.length)
        this.onReinitialize();
      return true;
    } else if (updatedValue.propertyName === this.radiusProperty.name) {
      if (!updatedValue.value.value) {
        this.syncRadiusState(); // force UI to redisplay last valid value
        return false;
      }
      this.radius = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.radiusProperty.item);
      return true;
    }
    return false;
  }

  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();
    toolSettings.push(this.methodProperty.toDialogItem({ rowPriority: 1, columnIndex: 0 }));

    // ensure controls are enabled/disabled base on current lock property state
    this.radiusProperty.isDisabled = !this.useRadius;
    const useRadiusLock = this.useRadiusProperty.toDialogItem({ rowPriority: 2, columnIndex: 0 });
    toolSettings.push(this.radiusProperty.toDialogItem({ rowPriority: 2, columnIndex: 1 }, useRadiusLock));

    return toolSettings;
  }

  public onRestartTool(): void {
    const tool = new CreateCircleTool();
    if (!tool.run())
      this.exitTool();
  }

  public override onReinitialize(): void {
    if (CircleMethod.Center === this.method && this.useRadius) {
      // Don't install a new tool instance, we want to preserve current AccuDraw state...
      this.accepted.length = 0;
      this.setupAndPromptForNextAction();
      this.beginDynamics();
      return;
    }
    super.onReinitialize();
  }

  public override onPostInstall(): void {
    super.onPostInstall();
    if (CircleMethod.Center === this.method && this.useRadius) {
      // Start dynamics before 1st data point when placing by center w/locked radius value.
      // Require the user to explicitly enable AccuDraw so that the compass location can be adjusted for changes
      // to locks or view ACS (as opposed to appearing at it's previous or default location).
      AccuDrawHintBuilder.deactivate();
      this.beginDynamics();
    }
  }

  public override onInstall(): boolean {
    if (!super.onInstall())
      return false;

    // Setup initial values here instead of supplyToolSettingsProperties to support keyin args w/o ui-framework...
    const methodValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.methodProperty.name);
    if (undefined !== methodValue)
      this.methodProperty.dialogItemValue = methodValue;

    const radiusValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.radiusProperty.name);
    if (undefined !== radiusValue)
      this.radiusProperty.dialogItemValue = radiusValue;

    const useRadiusValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.useRadiusProperty.name);
    if (undefined !== useRadiusValue)
      this.useRadiusProperty.dialogItemValue = useRadiusValue;

    if (!this.radius)
      this.useRadius = false;

    return true;
  }

  /** The keyin takes the following arguments, all of which are optional:
   *  - `method=0|1` How circle will be defined. 0 for center, 1 for edge.
   *  - `radius=number` Circle radius, 0 to define by points.
   */
  public override parseAndRun(...inputArgs: string[]): boolean {
    let circleMethod;
    let circleRadius;

    for (const arg of inputArgs) {
      const parts = arg.split("=");
      if (2 !== parts.length)
        continue;

      if (parts[0].toLowerCase().startsWith("me")) {
        const method = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(method)) {
          switch (method) {
            case 0:
              circleMethod = CircleMethod.Center;
              break;
            case 1:
              circleMethod = CircleMethod.Edge;
              break;
          }
        }
      } else if (parts[0].toLowerCase().startsWith("ra")) {
        const radius = Number.parseFloat(parts[1]);
        if (!Number.isNaN(radius)) {
          circleRadius = radius;
        }
      }
    }

    // Update current session values so keyin args are picked up for tool settings/restart...
    if (undefined !== circleMethod)
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.methodProperty.name, value: { value: circleMethod } });

    if (undefined !== circleRadius) {
      if (0.0 !== circleRadius)
        IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.radiusProperty.name, value: { value: circleRadius } });
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.useRadiusProperty.name, value: { value: 0.0 !== circleRadius } });
    }

    return this.run();
  }
}

/** @alpha Creates an ellipse. Uses model and category from ToolAdmin.ActiveSettings. */
export class CreateEllipseTool extends CreateOrContinuePathTool {
  public static override toolId = "CreateEllipse";
  public static override iconSpec = "icon-ellipse";

  protected override isComplete(_ev: BeButtonEvent): boolean {
    return (3 === this.accepted.length);
  }

  protected override get createCurvePhase(): CreateCurvePhase { return CreateCurvePhase.DefineOther; } // No join or closure checks...

  protected override provideToolAssistance(mainInstrText?: string, additionalInstr?: ToolAssistanceInstruction[]): void {
    const nPts = this.accepted.length;

    switch (nPts) {
      case 0:
        mainInstrText = EditTools.translate("CreateEllipse.Prompts.CenterPoint");
        break;

      case 1:
        mainInstrText = EditTools.translate("CreateEllipse.Prompts.MajorAxis");
        break;

      case 2:
        mainInstrText = EditTools.translate("CreateEllipse.Prompts.MinorAxis");
        break;
    }

    super.provideToolAssistance(mainInstrText, additionalInstr);
  }

  protected override setupAccuDraw(): void {
    const nPts = this.accepted.length;
    if (0 === nPts)
      return;

    const hints = new AccuDrawHintBuilder();

    if (this.wantSmartRotation)
      hints.enableSmartRotation = true;

    switch (nPts) {
      case 1:
        hints.setOrigin(this.accepted[0]);
        hints.setOriginFixed = true;
        break;
      case 2:
        hints.setXAxis(Vector3d.createStartEnd(this.accepted[0], this.accepted[1]));
        hints.setLockX = true;
        break;
    }

    hints.sendHints();
  }

  protected createNewCurvePrimitive(ev: BeButtonEvent, isDynamics: boolean): CurvePrimitive | undefined {
    const numRequired = (isDynamics ? 2 : 3);
    if (this.accepted.length < numRequired) {
      if (this.accepted.length < (numRequired - 1))
        return undefined;
      this.isConstruction = true; // Create construction geometry to show  major axis...
      return LineString3d.create([this.accepted[0], (isDynamics ? ev.point : this.accepted[1])]);
    }

    this.isClosed = true; // Always closed...

    const center = this.accepted[0];
    const major = this.accepted[1];

    const normal = this.getUpVector(ev);
    const vector0 = Vector3d.createStartEnd(center, major);
    const vector90 = normal.crossProduct(vector0);

    const dir = Ray3d.create(center, vector90);
    const minor = dir.projectPointToRay(isDynamics ? ev.point : this.accepted[2]);

    vector90.scaleToLength(center.distance(minor), vector90);

    return Arc3d.create(center, vector0, vector90);
  }

  public onRestartTool(): void {
    const tool = new CreateEllipseTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** @alpha Creates a rectangle by corner points. Uses model and category from ToolAdmin.ActiveSettings. */
export class CreateRectangleTool extends CreateOrContinuePathTool {
  public static override toolId = "CreateRectangle";
  public static override iconSpec = "icon-rectangle";

  protected localToWorld = Transform.createIdentity();
  protected originLocal?: Point3d;
  protected cornerLocal?: Point3d;

  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; } // radius - zero value unlocks associated "use" toggle...

  protected override provideToolAssistance(mainInstrText?: string, additionalInstr?: ToolAssistanceInstruction[]): void {
    mainInstrText = CoreTools.translate(0 === this.accepted.length ? "ElementSet.Prompts.StartCorner" : "ElementSet.Prompts.OppositeCorner");
    super.provideToolAssistance(mainInstrText, additionalInstr);
  }

  protected override setupAccuDraw(): void {
    const nPts = this.accepted.length;
    if (0 === nPts)
      return;

    const hints = new AccuDrawHintBuilder();

    if (this.wantSmartRotation)
      hints.enableSmartRotation = true;

    hints.setOrigin(this.accepted[0]);
    hints.sendHints();
  }

  private _useRadiusProperty: DialogProperty<boolean> | undefined;
  public get useRadiusProperty() {
    if (!this._useRadiusProperty)
      this._useRadiusProperty = new DialogProperty<boolean>(PropertyDescriptionHelper.buildLockPropertyDescription("useCornerRadius"), false);
    return this._useRadiusProperty;
  }

  public get useRadius(): boolean { return this.useRadiusProperty.value; }
  public set useRadius(value: boolean) { this.useRadiusProperty.value = value; }

  private _radiusProperty: DialogProperty<number> | undefined;
  public get radiusProperty() {
    if (!this._radiusProperty)
      this._radiusProperty = new DialogProperty<number>(new LengthDescription("cornerRadius", EditTools.translate("CreateRectangle.Label.CornerRadius")), 0.1, undefined, !this.useRadius);
    return this._radiusProperty;
  }

  public get radius(): number { return this.radiusProperty.value; }
  public set radius(value: number) { this.radiusProperty.value = value; }

  protected override isComplete(_ev: BeButtonEvent): boolean {
    return (2 === this.accepted.length);
  }

  protected override get createCurvePhase(): CreateCurvePhase { return CreateCurvePhase.DefineOther; } // No join or closure checks...

  protected createNewCurvePrimitive(ev: BeButtonEvent, isDynamics: boolean): CurvePrimitive | undefined {
    const numRequired = (isDynamics ? 1 : 2);
    if (this.accepted.length < numRequired)
      return undefined;

    const origin = this.accepted[0];
    const corner = (isDynamics ? ev.point : this.accepted[1]);
    const matrix = this.getCurrentRotation(ev);

    Transform.createOriginAndMatrix(Point3d.createZero(), matrix, this.localToWorld);

    this.originLocal = this.localToWorld.multiplyInversePoint3d(origin);
    this.cornerLocal = this.localToWorld.multiplyInversePoint3d(corner);

    if (undefined === this.originLocal || undefined === this.cornerLocal)
      return undefined;

    const shapePts: Point3d[] = [];

    shapePts[0] = Point3d.create(this.originLocal.x, this.originLocal.y, this.originLocal.z);
    shapePts[1] = Point3d.create(this.cornerLocal.x, this.originLocal.y, this.cornerLocal.z);
    shapePts[2] = Point3d.create(this.cornerLocal.x, this.cornerLocal.y, this.cornerLocal.z);
    shapePts[3] = Point3d.create(this.originLocal.x, this.cornerLocal.y, this.originLocal.z);
    shapePts[4] = shapePts[0].clone();

    this.localToWorld.multiplyPoint3dArrayInPlace(shapePts);
    this.isClosed = true; // Always closed...

    return LineString3d.create(shapePts);
  }

  protected override createNewPath(placement: PlacementProps): JsonGeometryStream | FlatBufferGeometryStream | undefined {
    if (!this.useRadius || 0.0 === this.radius || undefined === this.originLocal || undefined === this.cornerLocal)
      return super.createNewPath(placement);

    const builder = new ElementGeometry.Builder();
    builder.setLocalToWorldFromPlacement(placement);

    const loop = CurveFactory.createRectangleXY(this.originLocal.x, this.originLocal.y, this.cornerLocal.x, this.cornerLocal.y, this.originLocal.z, this.radius);
    loop.tryTransformInPlace(this.localToWorld);

    if (!builder.appendGeometryQuery(loop))
      return;

    return { format: "flatbuffer", data: builder.entries };
  }

  private syncRadiusState(): void {
    this.radiusProperty.displayValue = (this.radiusProperty.description as LengthDescription).format(this.radius);
    this.radiusProperty.isDisabled = !this.useRadius;
    this.syncToolSettingsProperties([this.radiusProperty.syncItem]);
  }

  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === this.useRadiusProperty.name) {
      this.useRadius = updatedValue.value.value as boolean;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.useRadiusProperty.item);
      this.syncRadiusState();
    } else if (updatedValue.propertyName === this.radiusProperty.name) {
      if (!updatedValue.value.value) {
        this.syncRadiusState(); // force UI to redisplay last valid value
        return false;
      }
      this.radius = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.radiusProperty.item);
      return true;
    }
    return false;
  }

  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();

    // ensure controls are enabled/disabled base on current lock property state
    this.radiusProperty.isDisabled = !this.useRadius;
    const useRadiusLock = this.useRadiusProperty.toDialogItem({ rowPriority: 1, columnIndex: 0 });
    toolSettings.push(this.radiusProperty.toDialogItem({ rowPriority: 1, columnIndex: 1 }, useRadiusLock));

    return toolSettings;
  }

  public onRestartTool(): void {
    const tool = new CreateRectangleTool();
    if (!tool.run())
      this.exitTool();
  }

  public override onInstall(): boolean {
    if (!super.onInstall())
      return false;

    // Setup initial values here instead of supplyToolSettingsProperties to support keyin args w/o ui-framework...
    const radiusValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.radiusProperty.name);
    if (undefined !== radiusValue)
      this.radiusProperty.dialogItemValue = radiusValue;

    const useRadiusValue = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.useRadiusProperty.name);
    if (undefined !== useRadiusValue)
      this.useRadiusProperty.dialogItemValue = useRadiusValue;

    if (!this.radius)
      this.useRadius = false;

    return true;
  }

  /** The keyin takes the following arguments, all of which are optional:
   *  - `radius=number` Corner radius, 0 for sharp corners.
   */
  public override parseAndRun(...inputArgs: string[]): boolean {
    let cornerRadius;

    for (const arg of inputArgs) {
      const parts = arg.split("=");
      if (2 !== parts.length)
        continue;

      if (parts[0].toLowerCase().startsWith("ra")) {
        const radius = Number.parseFloat(parts[1]);
        if (!Number.isNaN(radius)) {
          cornerRadius = radius;
        }
      }
    }

    // Update current session values so keyin args are picked up for tool settings/restart...
    if (undefined !== cornerRadius) {
      if (0.0 !== cornerRadius)
        IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.radiusProperty.name, value: { value: cornerRadius } });
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.useRadiusProperty.name, value: { value: 0.0 !== cornerRadius } });
    }

    return this.run();
  }
}

