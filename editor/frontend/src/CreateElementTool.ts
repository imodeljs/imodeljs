/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Id64, Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { Constant, Point3d, Range3d, Transform, Vector3d } from "@bentley/geometry-core";
import { DynamicGraphicsRequest2dProps, DynamicGraphicsRequest3dProps, FlatBufferGeometryStream, IModelError, isPlacement3dProps, JsonGeometryStream, PlacementProps } from "@bentley/imodeljs-common";
import { BeButtonEvent, CoordSystem, CoreTools, DynamicsContext, EventHandled, GraphicBranch, IModelApp, IModelConnection, PrimitiveTool, readElementGraphics, RenderGraphicOwner, ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection, Viewport } from "@bentley/imodeljs-frontend";

function computeChordToleranceFromPointAndRadius(vp: Viewport, center: Point3d, radius: number): number {
  if (vp.view.isCameraEnabled()) {
    const nearFrontCenter = vp.getFrustum(CoordSystem.World).frontCenter;
    const toFront = Vector3d.createStartEnd(center, nearFrontCenter);
    const viewZ = vp.rotation.rowZ();

    // If the sphere overlaps the near front plane just use near front point. This also handles behind eye conditions.
    if (viewZ.dotProduct(toFront) < radius) {
      center = nearFrontCenter;
    } else {
      // Find point on sphere closest to eye.
      const toEye = center.unitVectorTo(vp.view.camera.eye);

      // Only if not already behind the eye.
      if (toEye) {
        toEye.scaleInPlace(radius);
        center.addInPlace(toEye);
      }
    }
  }

  const viewPt = vp.worldToViewMap.transform0.multiplyPoint3dQuietNormalize(center);
  const viewPt2 = new Point3d(viewPt.x + 1.0, viewPt.y, viewPt.z);
  const pixelSize = vp.worldToViewMap.transform1.multiplyPoint3dQuietNormalize(viewPt).distance(vp.worldToViewMap.transform1.multiplyPoint3dQuietNormalize(viewPt2));

  // Return size of a physical pixel in meters.
  return (0.0 !== pixelSize ? vp.target.adjustPixelSizeForLOD(pixelSize) : 0.001);
}

/** @alpha */
export function computeChordToleranceFromPoint(vp: Viewport, pt: Point3d, radius?: number): number {
  return computeChordToleranceFromPointAndRadius(vp, pt, radius ? radius : Constant.oneCentimeter);
}

/** @alpha */
export function computeChordToleranceFromRange(vp: Viewport, range: Range3d): number {
  return computeChordToleranceFromPointAndRadius(vp, range.center, 0.5 * range.low.distance(range.high));
}

/** @alpha */
export class DynamicGraphicsProvider {
  public readonly iModel: IModelConnection;
  public readonly prefix: string;
  public graphic?: RenderGraphicOwner;
  /** Current request for graphic */
  private _graphicPromise?: Promise<boolean>;
  /** Optional element id generated graphics will be associated to */
  public elementId?: Id64String;
  /** Optional model id generated graphics will be associated to */
  public modelId?: Id64String;
  /** Chord tolerance to use to stroke the element's geometry in meters */
  public chordTolerance = 0.001;

  constructor(iModel: IModelConnection, prefix: string) {
    this.iModel = iModel;
    this.prefix = prefix;
  }

  private getRequestId(id: Id64String): string { return `${this.prefix}-${id}`; }
  private getToleranceLog10(): number { return Math.floor(Math.log10(this.chordTolerance)); }

  private async createRequest(categoryId: Id64String, placement: PlacementProps, geometry: JsonGeometryStream | FlatBufferGeometryStream): Promise<RenderGraphicOwner | undefined> {
    let graphicData;
    let is3d;

    if (is3d = isPlacement3dProps(placement)) {
      const requestProps: DynamicGraphicsRequest3dProps = {
        id: this.getRequestId(this.elementId ? this.elementId : Id64.invalid),
        elementId: this.elementId,
        modelId: this.modelId,
        toleranceLog10: this.getToleranceLog10(),
        type: "3d",
        placement,
        categoryId,
        geometry,
      };
      graphicData = await IModelApp.tileAdmin.requestElementGraphics(this.iModel, requestProps);
      is3d = true;
    } else {
      const requestProps: DynamicGraphicsRequest2dProps = {
        id: this.getRequestId(this.elementId ? this.elementId : Id64.invalid),
        elementId: this.elementId,
        modelId: this.modelId,
        toleranceLog10: this.getToleranceLog10(),
        type: "2d",
        placement,
        categoryId,
        geometry,
      };
      graphicData = await IModelApp.tileAdmin.requestElementGraphics(this.iModel, requestProps);
    }

    if (undefined === graphicData)
      return;

    const graphic = await readElementGraphics(graphicData, this.iModel, this.modelId ? this.modelId : Id64.invalid, is3d, { noFlash: true, noHilite: true });
    if (undefined === graphic)
      return;

    return IModelApp.renderSystem.createGraphicOwner(graphic);
  }

  /** Call to request a RenderGraphic for the supplied geometry and placement.
   * @see [[cleanupGraphic]] Must be called when the tool exits.
   */
  public async createGraphic(categoryId: Id64String, placement: PlacementProps, geometry: JsonGeometryStream | FlatBufferGeometryStream): Promise<boolean> {
    try {
      const graphic = await this.createRequest(categoryId, placement, geometry);
      this.cleanupGraphic();
      return (undefined !== (this.graphic = graphic));
    } catch {
      return false;
    }
  }

  /** Call to request a RenderGraphic for the supplied geometry and trigger a dynamic update upon fulfillment.
   * @note May be useful to update a dynamic preview outside of normal button and motion events, ex. modifier key change.
   * @see [[cleanupGraphic]] Must be called when the tool exits.
   */
  public createGraphicAndUpdateDynamics(ev: BeButtonEvent, categoryId: Id64String, placement: PlacementProps, geometry: JsonGeometryStream | FlatBufferGeometryStream): void {
    const promise = this._graphicPromise = this.createGraphic(categoryId, placement, geometry);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    promise.then(() => {
      if (promise !== this._graphicPromise)
        return; // abandoned this request...

      IModelApp.toolAdmin.updateDynamics(ev);
    });
  }

  /** Call to dispose of [[RenderGraphic]] held by [[RenderGraphicOwner]].
   * @note Must be called when the tool exits to avoid leaks of graphics memory or other webgl resources.
   */
  public cleanupGraphic(): void {
    if (undefined === this.graphic)
      return;
    this.graphic.disposeGraphic();
    this.graphic = undefined;
  }

  public addGraphic(context: DynamicsContext, transform?: Transform): void {
    if (undefined === this.graphic)
      return;

    if (undefined === transform) {
      context.addGraphic(this.graphic);
      return;
    }

    const branch = new GraphicBranch(false);
    branch.add(this.graphic);

    const branchGraphic = context.createBranch(branch, transform);
    context.addGraphic(branchGraphic);
  }
}

/** @alpha Placement tool base class for creating new elements. */
export abstract class CreateElementTool extends PrimitiveTool {
  public get targetCategory(): Id64String {
    if (IModelApp.toolAdmin.activeSettings.category === undefined)
      throw new IModelError(IModelStatus.InvalidCategory, "", Logger.logError);
    return IModelApp.toolAdmin.activeSettings.category;
  }

  public get targetModelId(): Id64String {
    if (IModelApp.toolAdmin.activeSettings.model === undefined)
      throw new IModelError(IModelStatus.BadModel, "", Logger.logError);
    return IModelApp.toolAdmin.activeSettings.model;
  }

  public isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean {
    if (IModelApp.toolAdmin.activeSettings.model === undefined)
      return false;
    return super.isCompatibleViewport(vp, isSelectedViewChange);
  }

  /** Whether [[setupAndPromptForNextAction]] should call [[AccuSnap.enableSnap]] for current tool phase.
   * @return true to enable snapping to elements.
   */
  protected get wantAccuSnap(): boolean { return false; }

  /** Whether to automatically start element dynamics on button event.
   * @return true if tool will implement [[InteractiveTool.onDynamicFrame]] to show element dynamics.
   */
  protected get wantDynamics(): boolean { return false; }

  /** Whether tool is ready to insert the new element.
   * @return true to call [[createElement]].
   */
  protected isComplete(_ev: BeButtonEvent): boolean { return false; }

  /** Insert new element and call [[saveChanges]] */
  protected abstract createElement(): Promise<void>;

  /** Orchestrates advancing the internal state of the tool on a data button event.
   * - Gather input: Initiates element dynamics and accepts additional points as required.
   * - Complete operation: Create new element, restart or exit tool.
   * @returns EventHandled.Yes if onReinitalize was called to restart or exit tool.
   */
  protected async processDataButton(ev: BeButtonEvent): Promise<EventHandled> {
    if (this.isComplete(ev)) {
      await this.createElement();
      this.onReinitialize();

      return EventHandled.Yes;
    }

    this.setupAndPromptForNextAction();

    if (!this.isDynamicsStarted && this.wantDynamics)
      this.beginDynamics();

    return EventHandled.No;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    return this.processDataButton(ev);
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  /** Setup initial tool state, prompts, etc. */
  public onPostInstall() {
    super.onPostInstall();
    this.setupAndPromptForNextAction();
  }

  /** Restore tool assistance after no longer being suspended by either a [[ViewTool]] or [[InputCollector]]. */
  public onUnsuspend(): void {
    this.provideToolAssistance();
  }

  /** Setup auto-locate, AccuSnap, AccuDraw, and supply tool assistance. */
  protected setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(this.wantAccuSnap);
    this.provideToolAssistance();
  }

  /** Sub-classes should override to provide tool specific instructions. */
  protected provideToolAssistance(mainInstrText?: string, additionalInstr?: ToolAssistanceInstruction[]): void {
    const mainMsg = "ElementSet.Prompts.IdentifyPoint";
    const leftMsg = "ElementSet.Inputs.AcceptPoint";
    const rghtMsg = "ElementSet.Inputs.Cancel";

    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, CoreTools.translate(leftMsg), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, CoreTools.translate(leftMsg), false, ToolAssistanceInputMethod.Mouse));

    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, CoreTools.translate(rghtMsg), false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, CoreTools.translate(rghtMsg), false, ToolAssistanceInputMethod.Mouse));

    if (undefined !== additionalInstr) {
      for (const instr of additionalInstr) {
        if (ToolAssistanceInputMethod.Touch === instr.inputMethod)
          touchInstructions.push(instr);
        else
          mouseInstructions.push(instr);
      }
    }

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, undefined !== mainInstrText ? mainInstrText : CoreTools.translate(mainMsg));
    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }
}
