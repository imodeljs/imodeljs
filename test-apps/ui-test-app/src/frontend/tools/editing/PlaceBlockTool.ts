/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore picklist

import { assert } from "@bentley/bentleyjs-core";
import { AxisOrder, LinearSweep, Matrix3d, Point3d, Transform, Vector3d, YawPitchRollAngles } from "@bentley/geometry-core";
import { Code, ColorDef, ElementGeometry, GeometryStreamBuilder, LinePixels, PhysicalElementProps } from "@bentley/imodeljs-common";
import { BasicManipulationCommandIpc, editorBuiltInCmdIds } from "@bentley/imodeljs-editor-common";
import { CreateElementTool, EditTools } from "@bentley/imodeljs-editor-frontend";
import {
  AccuDrawHintBuilder, BeButtonEvent, ContextRotationId, CoreTools, DecorateContext, EventHandled, GraphicType, IModelApp, NotifyMessageDetails, OutputMessagePriority, ToolAssistance,
  ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection, Viewport,
} from "@bentley/imodeljs-frontend";

export class PlaceBlockTool extends CreateElementTool {
  public static override toolId = "PlaceBlock";
  public static override iconSpec = "icon-cube-faces-bottom";
  protected _startedCmd?: string;

  protected readonly _points: Point3d[] = [];
  protected _matrix?: Matrix3d;
  protected _isComplete = false;
  public height = 2.75;
  public story = "1";

  protected async startCommand(): Promise<string> {
    if (undefined !== this._startedCmd)
      return this._startedCmd;
    return EditTools.startCommand<string>(editorBuiltInCmdIds.cmdBasicManipulation, this.iModel.key);
  }

  public static callCommand<T extends keyof BasicManipulationCommandIpc>(method: T, ...args: Parameters<BasicManipulationCommandIpc[T]>): ReturnType<BasicManipulationCommandIpc[T]> {
    return EditTools.callCommand(method, ...args) as ReturnType<BasicManipulationCommandIpc[T]>;
  }

  protected allowView(vp: Viewport) { return vp.view.isSpatialView() || vp.view.isDrawingView(); }
  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && this.allowView(vp)); }

  public override onPostInstall() {
    super.onPostInstall();
    this.setupAndPromptForNextAction();
  }
  public override onUnsuspend(): void { this.showPrompt(); }

  protected translate(prompt: string) { return IModelApp.i18n.translate(`SampleApp:tools.PlaceBlock.${prompt}`); }
  protected showPrompt(): void {
    const mainMsg = (0 === this._points.length) ? "prompts.firstPoint" : (1 === this._points.length) ? "prompts.nextPoint" : "prompts.additionalPoint";
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, this.translate(mainMsg));
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

  protected override setupAndPromptForNextAction(): void {
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
    if (1 === this._points.length) {
      hints.setMatrix(this._matrix!);
      hints.setModeRectangular();
    } else if (this._points.length > 1 && !(this._points[this._points.length - 1].isAlmostEqual(this._points[this._points.length - 2]))) {
      const xVec = Vector3d.createStartEnd(this._points[this._points.length - 2], this._points[this._points.length - 1]);
      const zVec = this._matrix!.getColumn(2);
      const matrix = Matrix3d.createRigidFromColumns(xVec, zVec, AxisOrder.XZY);
      if (undefined !== matrix)
        hints.setMatrix(matrix); // Rotate AccuDraw x axis to last segment preserving current up vector...
    }
    hints.setLockZ = true;
    hints.sendHints();
  }

  protected getShapePoints(ev: BeButtonEvent): Point3d[] {
    const points: Point3d[] = [];
    if (undefined === this.targetView || this._points.length < 1)
      return points;
    for (const pt of this._points)
      points.push(pt.clone());

    if (this._isComplete)
      return points;

    const normal = this._matrix!.getColumn(2);
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

  public override decorate(context: DecorateContext): void {
    if (context.viewport !== this.targetView)
      return;

    const ev = new BeButtonEvent();
    IModelApp.toolAdmin.fillEventFromCursorLocation(ev);
    if (undefined === ev.viewport)
      return;
    const points = this.getShapePoints(ev);
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
  }

  public override decorateSuspended(context: DecorateContext): void { if (this._isComplete) this.decorate(context); }
  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> { if (this._points.length > 0 && undefined !== ev.viewport && !this._isComplete) ev.viewport.invalidateDecorations(); }

  protected async createElement(): Promise<void> {
    assert(this._matrix !== undefined, "should have defined orientation by now");
    const vp = this.targetView;
    if (undefined === vp || this._points.length < 3)
      return;

    const model = this.targetModelId;
    const category = this.targetCategory;

    const origin = this._points[0];
    const angles = new YawPitchRollAngles();
    ElementGeometry.Builder.placementAnglesFromPoints(this._points, this._matrix.getRow(2), angles);

    const localToWorld = Transform.createOriginAndMatrix(origin, angles.toMatrix3d());
    const xyPoints = localToWorld.multiplyInversePoint3dArray(this._points);
    if (undefined === xyPoints)
      return;

    const primitive = LinearSweep.createZSweep(xyPoints, 0.0, this.height, true);
    if (undefined === primitive)
      return;

    try {
      this._startedCmd = await this.startCommand();

      const builder = new GeometryStreamBuilder();
      if (!builder.appendGeometry(primitive))
        return;

      const elemProps: PhysicalElementProps = { classFullName: "Generic:PhysicalObject", model, category, code: Code.createEmpty(), placement: { origin, angles }, geom: builder.geometryStream };
      await PlaceBlockTool.callCommand("insertGeometricElement", elemProps);
      await this.saveChanges();

    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, err.toString()));
    }
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this.targetView)
      return EventHandled.No;

    if (this._isComplete)
      this.onReinitialize();

    if (this._points.length > 1 && !ev.isControlKey) {
      const points = this.getShapePoints(ev);
      if (points.length < 3)
        return EventHandled.No;

      this._isComplete = true;
      this._points.length = 0;
      for (const pt of points) this._points.push(pt);

      await this.createElement();

      this.onReinitialize();
      return EventHandled.No;
    }

    // TODO: Get orientation from AccuDrawHintBuilder.getCurrentRotation...
    if (undefined === this._matrix && undefined === (this._matrix = AccuDrawHintBuilder.getContextRotation(ContextRotationId.Top, this.targetView)))
      return EventHandled.No;

    const currPt = ev.point.clone();
    if (this._points.length > 0) {
      const planePt = AccuDrawHintBuilder.projectPointToPlaneInView(currPt, this._points[0], this._matrix.getColumn(2), this.targetView, true);
      if (undefined !== planePt)
        currPt.setFrom(planePt);
    }

    this._points.push(currPt);
    this.setupAndPromptForNextAction();

    if (!this.isDynamicsStarted)
      this.beginDynamics();

    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  public override onReinitialize(): void {
    this._isComplete = false;
    this._points.length = 0;
    this._matrix = undefined;
    AccuDrawHintBuilder.deactivate();
    this.setupAndPromptForNextAction();
  }

  public override async onUndoPreviousStep(): Promise<boolean> {
    if (0 === this._points.length || this._isComplete)
      return false;

    this._points.pop();
    this.setupAndPromptForNextAction();
    return true;
  }

  public onRestartTool(): void {
    const tool = new PlaceBlockTool();
    if (!tool.run())
      this.exitTool();
  }
}
