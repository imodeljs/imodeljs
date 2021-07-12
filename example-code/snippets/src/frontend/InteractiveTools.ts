/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Point3d, Vector3d } from "@bentley/geometry-core";
import { ColorDef } from "@bentley/imodeljs-common";
import {
  AccuDrawHintBuilder, BeButtonEvent, DynamicsContext, EventHandled, HitDetail, IModelApp, LocateFilterStatus, LocateResponse, PrimitiveTool,
  Viewport,
} from "@bentley/imodeljs-frontend";

export class SamplePrimitiveTool extends PrimitiveTool {
  public static override toolId = "Sample.Run";

  // __PUBLISH_EXTRACT_START__ PrimitiveTool_SelectedViewport
  public override onSelectedViewportChanged(_previous: Viewport | undefined, current: Viewport | undefined): void {
    if (this.isCompatibleViewport(current, true))
      return;
    this.onRestartTool();
  }
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ PrimitiveTool_Restart
  public onRestartTool(): void {
    const tool = new SamplePrimitiveTool();
    if (!tool.run())
      this.exitTool();
  }
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ PrimitiveTool_Run
  public override run(): boolean {
    const { toolAdmin, viewManager } = IModelApp;
    if (!this.isCompatibleViewport(viewManager.selectedView, false) || !toolAdmin.onInstallTool(this))
      return false;

    toolAdmin.startPrimitiveTool(this);
    toolAdmin.onPostInstallTool(this);
    return true;
  }
  // __PUBLISH_EXTRACT_END__
}

export class SampleSnapTool extends PrimitiveTool {
  public static override toolId = "Sample.Snap";
  // __PUBLISH_EXTRACT_START__ PrimitiveTool_Snap
  public readonly points: Point3d[] = [];

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    if (this.points.length < 1)
      return;

    const tmpPoints = this.points.slice(); // Create shallow copy of accepted points
    tmpPoints.push(ev.point.clone()); // Include current cursor location

    const builder = context.createSceneGraphicBuilder();
    builder.setSymbology(context.viewport.getContrastToBackgroundColor(), ColorDef.black, 1);
    builder.addLineString(tmpPoints);
    context.addGraphic(builder.finish()); // Show linestring in view
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.points.push(ev.point.clone()); // Accumulate accepted points, ev.point has been adjusted by AccuSnap and locks

    if (!this.isDynamicsStarted)
      this.beginDynamics(); // Start dynamics on first data button so that onDynamicFrame will be called

    return EventHandled.No;
  }

  public override onPostInstall() {
    super.onPostInstall();
    IModelApp.accuSnap.enableSnap(true); // Enable AccuSnap so that linestring can be created by snapping to existing geometry
  }
  // __PUBLISH_EXTRACT_END__

  public onRestartTool(): void { this.exitTool(); }
}

export class SampleLocateTool extends PrimitiveTool {
  public static override toolId = "Sample.Locate";
  public onRestartTool(): void { this.exitTool(); }

  // __PUBLISH_EXTRACT_START__ PrimitiveTool_Locate
  public override async filterHit(hit: HitDetail, _out?: LocateResponse): Promise<LocateFilterStatus> {
    // Check that element is valid for the tool operation, ex. query backend to test class, etc.
    // For this example we'll just test the element's selected status.
    const isSelected = this.iModel.selectionSet.has(hit.sourceId);
    return isSelected ? LocateFilterStatus.Reject : LocateFilterStatus.Accept; // Reject element that is already selected
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const hit = await IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    if (hit !== undefined)
      this.iModel.selectionSet.replace(hit.sourceId); // Replace current selection set with accepted element

    return EventHandled.No;
  }

  public override onPostInstall() {
    super.onPostInstall();
    this.initLocateElements(); // Enable AccuSnap locate, set view cursor, add CoordinateLockOverrides to disable unwanted pre-locate point adjustments...
  }
  // __PUBLISH_EXTRACT_END__
}

export class CreateByPointsTool extends PrimitiveTool {
  public static override toolId = "Create.ByPoints";
  // __PUBLISH_EXTRACT_START__ PrimitiveTool_PointsTool
  public readonly points: Point3d[] = [];

  public setupAndPromptForNextAction(): void {
    // NOTE: Tool should call IModelApp.notifications.outputPromptByKey or IModelApp.notifications.outputPrompt to tell user what to do.
    IModelApp.accuSnap.enableSnap(true); // Enable AccuSnap so that linestring can be created by snapping to existing geometry

    if (0 === this.points.length)
      return;

    const hints = new AccuDrawHintBuilder();
    hints.enableSmartRotation = true; // Set initial AccuDraw orientation based on snapped geometry (ex. sketch on face of a solid)

    if (this.points.length > 1 && !(this.points[this.points.length - 1].isAlmostEqual(this.points[this.points.length - 2])))
      hints.setXAxis(Vector3d.createStartEnd(this.points[this.points.length - 2], this.points[this.points.length - 1])); // Align AccuDraw with last accepted segment

    hints.setOrigin(this.points[this.points.length - 1]); // Set compass origin to last accepted point.
    hints.sendHints();
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    if (this.points.length < 1)
      return;

    const tmpPoints = this.points.slice(); // Create shallow copy of accepted points
    tmpPoints.push(ev.point.clone()); // Include current cursor location

    const builder = context.createSceneGraphicBuilder();
    builder.setSymbology(context.viewport.getContrastToBackgroundColor(), ColorDef.black, 1);
    builder.addLineString(tmpPoints);
    context.addGraphic(builder.finish()); // Show linestring in view
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.points.push(ev.point.clone()); // Accumulate accepted points, ev.point has been adjusted by AccuSnap and locks
    this.setupAndPromptForNextAction();

    if (!this.isDynamicsStarted)
      this.beginDynamics(); // Start dynamics on first data button so that onDynamicFrame will be called

    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize(); // Complete current linestring
    return EventHandled.No;
  }

  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  // __PUBLISH_EXTRACT_END__

  public onRestartTool(): void {
    const tool = new CreateByPointsTool();
    if (!tool.run())
      this.exitTool();
  }
}
