/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { GrowableXYZArray, LineString3d, Point3d, Range3d } from "@bentley/geometry-core";
import { ColorDef, LinePixels } from "@bentley/imodeljs-common";
import { BeButtonEvent, DecorateContext, EventHandled, GraphicType, HitDetail, IModelApp, LocateFilterStatus, LocateResponse, PrimitiveTool, RealityTileDrapeStatus, RealityTileTree, TileTreeReference, Viewport } from "@bentley/imodeljs-frontend";

/** @packageDocumentation
 * @module Tools
 */

/**
 * Demonstrates draping line strings on terrain meshes.  The terrain can be defined by map terrain (from Cesium World Terrain) or a reality model.
 * @alpha
 */
export class TerrainDrapeTool extends PrimitiveTool {
  private _drapePoints = new GrowableXYZArray();
  private _drapedStrings?: LineString3d[];
  private _motionPoint?: Point3d;
  private _drapeViewport?: Viewport;
  private _drapeTreeRef?: TileTreeReference;
  public static toolId = "TerrainDrape";
  public requireWriteableTarget(): boolean { return false; }
  public onPostInstall() {
    super.onPostInstall();
    this.setupAndPromptForNextAction();
  }

  public onUnsuspend(): void { this.showPrompt(); }
  public createDecorations(context: DecorateContext, _suspend: boolean): void {
    if (this._drapeTreeRef && this._drapeViewport && this._drapePoints.length > 0) {
      if (this._drapePoints.length > 1) {
        const drapeTree = this._drapeTreeRef.treeOwner.load();
        if (drapeTree instanceof RealityTileTree) {
          const builder =  context.createGraphicBuilder(GraphicType.WorldDecoration);
          builder.setSymbology(ColorDef.white, ColorDef.white, 2);
          let loading = false;
          if (!this._drapedStrings) {
            this._drapedStrings = new Array<LineString3d>();
            const drapeRange = Range3d.createNull();
            drapeRange.extendArray(this._drapePoints);
            const tolerance = drapeRange.diagonal().magnitude() / 5000.0;
            loading = RealityTileDrapeStatus.Loading ===  drapeTree.drapeLinestring(this._drapedStrings, this._drapePoints, tolerance, this._drapeViewport);
          }
          this._drapedStrings.forEach((lineString) => builder.addLineString(lineString.points));
          if (loading)
            this._drapedStrings = undefined;
          context.addDecorationFromBuilder(builder);
        }
      }
      if (this._motionPoint) {
        const builder =  context.createGraphicBuilder(GraphicType.WorldOverlay);
        builder.setSymbology(ColorDef.white, ColorDef.white, 1, LinePixels.Code0);
        builder.addLineString([this._drapePoints.getPoint3dAtUncheckedPointIndex(this._drapePoints.length - 1), this._motionPoint]);
        context.addDecorationFromBuilder(builder);
      }
    }
  }
  public decorate(context: DecorateContext): void {
    this.createDecorations(context, false);
  }
  public decorateSuspended(context: DecorateContext): void {
    this.createDecorations(context, true);
  }

  private setupAndPromptForNextAction(): void {
    this.initLocateElements(undefined === this._drapeTreeRef);
    IModelApp.locateManager.options.allowDecorations = true;    // So we can select "contextual" reality models.
    this.showPrompt();
  }

  private showPrompt(): void {
    IModelApp.notifications.outputPromptByKey(`FrontendDevTools:tools.TerrainDrape.Prompts.${undefined === this._drapeTreeRef ? "SelectDrapeRealityModel" : "EnterDrapePoint"}`);
  }
  public async filterHit(hit: HitDetail, _out?: LocateResponse): Promise<LocateFilterStatus> {
    if (undefined !== this._drapeTreeRef)
      return LocateFilterStatus.Accept;

    if (!hit.modelId)
      return LocateFilterStatus.Reject;

    return hit.viewport.getGeometryTreeRef(hit.modelId) ? LocateFilterStatus.Accept : LocateFilterStatus.Reject;
  }

  public async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    this._motionPoint = ev.point;
    if (ev.viewport)
      ev.viewport.invalidateDecorations();
  }

  public async onResetButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    this._drapedStrings = undefined;
    if (this._drapePoints.length) {
      this._drapePoints.pop();
    } else {
      this._drapeTreeRef = undefined;
      this._drapeViewport = undefined;
    }
    if (ev.viewport)
      ev.viewport.invalidateDecorations();

    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this._motionPoint = undefined;
    const hit = await IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    if (undefined === this._drapeTreeRef) {
      if (hit?.modelId) {
        this._drapePoints.push(hit.hitPoint);
        this._drapeViewport = hit.viewport;
        this._drapeTreeRef = hit.viewport.getGeometryTreeRef(hit.modelId);
      }
    } else {
      this._drapePoints.push(hit ? hit.hitPoint : ev.point);
    }
    this._drapedStrings = undefined;
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  public onRestartTool(): void {
    const tool = new TerrainDrapeTool();
    if (!tool.run())
      this.exitTool();
  }

  public parseAndRun(..._args: string[]): boolean {
    this.run();
    return true;
  }
}
