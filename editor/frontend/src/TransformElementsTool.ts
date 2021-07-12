/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Id64, Id64Arg, Id64String } from "@bentley/bentleyjs-core";
import { Angle, Geometry, Matrix3d, Point3d, Transform, Vector3d, YawPitchRollAngles } from "@bentley/geometry-core";
import {
  ColorDef, GeometricElementProps, IModelStatus, isPlacement2dProps, LinePixels, PersistentGraphicsRequestProps, Placement, Placement2d, Placement3d,
} from "@bentley/imodeljs-common";
import { BasicManipulationCommandIpc, editorBuiltInCmdIds } from "@bentley/imodeljs-editor-common";
import {
  AccuDrawHintBuilder, AngleDescription, BeButtonEvent, CoreTools, DynamicsContext, ElementSetTool, GraphicBranch, GraphicType, IModelApp,
  IModelConnection, IpcApp, NotifyMessageDetails, OutputMessagePriority, readElementGraphics, RenderGraphic, RenderGraphicOwner,
  ToolAssistanceInstruction,
} from "@bentley/imodeljs-frontend";
import { DialogItem, DialogProperty, DialogPropertySyncItem, EnumerationChoice, PropertyDescriptionHelper } from "@bentley/ui-abstract";
import { EditTools } from "./EditTool";

/** @alpha */
export interface TransformGraphicsData {
  id: Id64String;
  placement: Placement;
  graphic: RenderGraphicOwner;
}

/** @alpha */
export class TransformGraphicsProvider {
  public readonly iModel: IModelConnection;
  public readonly data: TransformGraphicsData[];
  public readonly pending: Map<Id64String, string>;
  public readonly prefix: string;
  /** Chord tolerance to use to stroke the element's geometry in meters. */
  public chordTolerance = 0.01;

  constructor(iModel: IModelConnection, prefix: string) {
    this.iModel = iModel;
    this.prefix = prefix;
    this.data = new Array<TransformGraphicsData>();
    this.pending = new Map<Id64String, string>();
  }

  private getRequestId(id: Id64String): string { return `${this.prefix}-${id}`; }
  private getToleranceLog10(): number { return Math.floor(Math.log10(this.chordTolerance)); }

  private async createRequest(id: Id64String): Promise<TransformGraphicsData | undefined> {
    const elementProps = (await this.iModel.elements.getProps(id)) as GeometricElementProps[];
    if (0 === elementProps.length)
      return;

    const placementProps = elementProps[0].placement;
    if (undefined === placementProps)
      return;

    const placement = isPlacement2dProps(placementProps) ? Placement2d.fromJSON(placementProps) : Placement3d.fromJSON(placementProps);
    if (!placement.isValid)
      return; // Ignore assembly parents w/o geometry, etc...

    const requestProps: PersistentGraphicsRequestProps = {
      id: this.getRequestId(id),
      elementId: id,
      toleranceLog10: this.getToleranceLog10(),
    };

    this.pending.set(id, requestProps.id); // keep track of requests so they can be cancelled...

    const graphicData = await IModelApp.tileAdmin.requestElementGraphics(this.iModel, requestProps);
    if (undefined === graphicData)
      return;

    const graphic = await readElementGraphics(graphicData, this.iModel, elementProps[0].model, placement.is3d, { noFlash: true, noHilite: true });
    if (undefined === graphic)
      return;

    return { id, placement, graphic: IModelApp.renderSystem.createGraphicOwner(graphic) };
  }

  private disposeOfGraphics(): void {
    this.data.forEach((data) => {
      data.graphic.disposeGraphic();
    });

    this.data.length = 0;
  }

  private async cancelPendingRequests(): Promise<void> {
    const requests = new Array<string>();
    for (const [_key, id] of this.pending)
      requests.push(id);

    this.pending.clear();
    if (0 === requests.length)
      return;

    return IpcApp.callIpcHost("cancelElementGraphicsRequests", this.iModel.key, requests);
  }

  /** Call to request a RenderGraphic for the supplied element id.
 * @see [[cleanupGraphics]] Must be called when the tool exits.
 */
  public async createSingleGraphic(id: Id64String): Promise<boolean> {
    try {
      const info = await this.createRequest(id);

      if (undefined !== info?.id)
        this.pending.delete(info.id);

      if (undefined === info?.graphic)
        return false;

      this.data.push(info);
      return true;
    } catch {
      return false;
    }
  }

  /** Call to request RenderGraphics for the supplied element ids. Does not wait for results as
   * generating graphics for a large number of elements can take time. Instead an array of [[RenderGraphicOwner]]
   * is populated as requests are resolved and the current dynamics frame displays what is available.
   * @see [[cleanupGraphics]] Must be called when the tool exits.
   */
  public createGraphics(elements: Id64Arg): void {
    if (0 === Id64.sizeOf(elements))
      return;

    try {
      for (const id of Id64.iterable(elements)) {
        const promise = this.createRequest(id);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        promise.then((info) => {
          if (undefined !== info?.id)
            this.pending.delete(info.id);

          if (undefined !== info?.graphic)
            this.data.push(info);
        });
      }
    } catch { }
  }

  /** Call to dispose of [[RenderGraphic]] held by [[RenderGraphicOwner]] and cancel requests that are still pending.
   * @note Must be called when the tool exits to avoid leaks of graphics memory or other webgl resources.
   */
  public async cleanupGraphics(): Promise<void> {
    await this.cancelPendingRequests();
    this.disposeOfGraphics();
  }

  public addSingleGraphic(graphic: RenderGraphic, transform: Transform, context: DynamicsContext): void {
    const branch = new GraphicBranch(false);
    branch.add(graphic);

    const branchGraphic = context.createBranch(branch, transform);
    context.addGraphic(branchGraphic);
  }

  public addGraphics(transform: Transform, context: DynamicsContext): void {
    if (0 === this.data.length)
      return;

    const branch = new GraphicBranch(false);
    for (const data of this.data)
      branch.add(data.graphic);

    const branchGraphic = context.createBranch(branch, transform);
    context.addGraphic(branchGraphic);
  }
}

/** @alpha Base class for applying a transform to element placements. */
export abstract class TransformElementsTool extends ElementSetTool {
  protected override get allowSelectionSet(): boolean { return true; }
  protected override get allowGroups(): boolean { return true; }
  protected override get allowDragSelect(): boolean { return true; }
  protected override get controlKeyContinuesSelection(): boolean { return true; }
  protected override get wantAccuSnap(): boolean { return true; }
  protected override get wantDynamics(): boolean { return true; }
  protected get wantMakeCopy(): boolean { return false; } // For testing repeat vs. restart...
  protected _graphicsProvider?: TransformGraphicsProvider;
  protected _startedCmd?: string;

  protected abstract calculateTransform(ev: BeButtonEvent): Transform | undefined;

  protected async createAgendaGraphics(changed: boolean): Promise<void> {
    if (changed) {
      if (undefined === this._graphicsProvider)
        return; // Not yet needed...
    } else {
      if (undefined !== this._graphicsProvider)
        return; // Use existing graphics...
    }

    if (undefined === this._graphicsProvider)
      this._graphicsProvider = new TransformGraphicsProvider(this.iModel, this.toolId);
    else
      await this._graphicsProvider.cleanupGraphics();

    if (1 === this.agenda.length) {
      await this._graphicsProvider.createSingleGraphic(this.agenda.elements[0]);
      return;
    }

    this._graphicsProvider.createGraphics(this.agenda.elements);
  }

  protected async clearAgendaGraphics(): Promise<void> {
    if (undefined === this._graphicsProvider)
      return;
    await this._graphicsProvider.cleanupGraphics();
    this._graphicsProvider = undefined;
  }

  protected override async onAgendaModified(): Promise<void> {
    await this.createAgendaGraphics(true);
  }

  protected override async initAgendaDynamics(): Promise<boolean> {
    await this.createAgendaGraphics(false);
    return super.initAgendaDynamics();
  }

  protected transformAgendaDynamics(transform: Transform, context: DynamicsContext): void {
    if (undefined !== this._graphicsProvider)
      this._graphicsProvider.addGraphics(transform, context);
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const transform = this.calculateTransform(ev);
    if (undefined === transform)
      return;
    this.transformAgendaDynamics(transform, context);
  }

  protected updateAnchorLocation(transform: Transform): void {
    // Update anchor point to support creating additional copies (repeat vs. restart)...
    if (undefined === this.anchorPoint)
      return;

    transform.multiplyPoint3d(this.anchorPoint, this.anchorPoint);

    const hints = new AccuDrawHintBuilder();
    hints.setOrigin(this.anchorPoint);
    hints.sendHints();
  }

  protected async startCommand(): Promise<string> {
    if (undefined !== this._startedCmd)
      return this._startedCmd;
    return EditTools.startCommand<string>(editorBuiltInCmdIds.cmdBasicManipulation, this.iModel.key);
  }

  public static callCommand<T extends keyof BasicManipulationCommandIpc>(method: T, ...args: Parameters<BasicManipulationCommandIpc[T]>): ReturnType<BasicManipulationCommandIpc[T]> {
    return EditTools.callCommand(method, ...args) as ReturnType<BasicManipulationCommandIpc[T]>;
  }

  protected async transformAgenda(transform: Transform): Promise<void> {
    try {
      this._startedCmd = await this.startCommand();
      if (IModelStatus.Success === await TransformElementsTool.callCommand("transformPlacement", this.agenda.compressIds(), transform.toJSON()))
        await this.saveChanges();
    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, err.toString()));
    }
  }

  public override async processAgenda(ev: BeButtonEvent): Promise<void> {
    const transform = this.calculateTransform(ev);
    if (undefined === transform)
      return;
    await this.transformAgenda(transform);
    this.updateAnchorLocation(transform);
  }

  public override async onProcessComplete(): Promise<void> {
    if (this.wantMakeCopy)
      return; // TODO: Update agenda to hold copies, replace current selection set with copies, etc...
    return super.onProcessComplete();
  }

  public override onCleanup(): void {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.clearAgendaGraphics();
    super.onCleanup();
  }
}

/** @alpha Move elements by applying translation to placement. */
export class MoveElementsTool extends TransformElementsTool {
  public static override toolId = "MoveElements";
  public static override iconSpec = "icon-move";

  protected calculateTransform(ev: BeButtonEvent): Transform | undefined {
    if (undefined === this.anchorPoint)
      return undefined;
    return Transform.createTranslation(ev.point.minus(this.anchorPoint));
  }

  protected override provideToolAssistance(_mainInstrText?: string, _additionalInstr?: ToolAssistanceInstruction[]): void {
    let mainMsg;
    if (!this.isSelectByPoints && !this.wantAdditionalElements)
      mainMsg = CoreTools.translate(this.wantAdditionalInput ? "ElementSet.Prompts.StartPoint" : "ElementSet.Prompts.EndPoint");
    super.provideToolAssistance(mainMsg);
  }

  public onRestartTool(): void {
    const tool = new MoveElementsTool();
    if (!tool.run())
      this.exitTool();
  }
}

/** @alpha */
export enum RotateMethod {
  By3Points,
  ByAngle,
}

/** @alpha */
export enum RotateAbout {
  Point,
  Origin,
  Center,
}

/** @alpha Rotate elements by applying transform to placement. */
export class RotateElementsTool extends TransformElementsTool {
  public static override toolId = "RotateElements";
  public static override iconSpec = "icon-rotate";

  protected xAxisPoint?: Point3d;
  protected havePivotPoint = false;
  protected haveFinalPoint = false;

  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 3; }

  private static methodMessage(str: string) { return EditTools.translate(`RotateElements.Method.${str}`); }
  private static getMethodChoices = (): EnumerationChoice[] => {
    return [
      { label: RotateElementsTool.methodMessage("3Points"), value: RotateMethod.By3Points },
      { label: RotateElementsTool.methodMessage("Angle"), value: RotateMethod.ByAngle },
    ];
  };

  private _methodProperty: DialogProperty<number> | undefined;
  public get methodProperty() {
    if (!this._methodProperty)
      this._methodProperty = new DialogProperty<number>(PropertyDescriptionHelper.buildEnumPicklistEditorDescription(
        "rotateMethod", EditTools.translate("RotateElements.Label.Method"), RotateElementsTool.getMethodChoices()), RotateMethod.By3Points as number);
    return this._methodProperty;
  }

  public get rotateMethod(): RotateMethod { return this.methodProperty.value as RotateMethod; }
  public set rotateMethod(method: RotateMethod) { this.methodProperty.value = method; }

  private static aboutMessage(str: string) { return EditTools.translate(`RotateElements.About.${str}`); }
  private static getAboutChoices = (): EnumerationChoice[] => {
    return [
      { label: RotateElementsTool.aboutMessage("Point"), value: RotateAbout.Point },
      { label: RotateElementsTool.aboutMessage("Origin"), value: RotateAbout.Origin },
      { label: RotateElementsTool.aboutMessage("Center"), value: RotateAbout.Center },
    ];
  };

  private _aboutProperty: DialogProperty<number> | undefined;
  public get aboutProperty() {
    if (!this._aboutProperty)
      this._aboutProperty = new DialogProperty<number>(PropertyDescriptionHelper.buildEnumPicklistEditorDescription(
        "rotateAbout", EditTools.translate("RotateElements.Label.About"), RotateElementsTool.getAboutChoices()), RotateAbout.Point as number);
    return this._aboutProperty;
  }

  public get rotateAbout(): RotateAbout { return this.aboutProperty.value as RotateAbout; }
  public set rotateAbout(method: RotateAbout) { this.aboutProperty.value = method; }

  private _angleProperty: DialogProperty<number> | undefined;
  public get angleProperty() {
    if (!this._angleProperty)
      this._angleProperty = new DialogProperty<number>(new AngleDescription("rotateAngle", EditTools.translate("RotateElements.Label.Angle")), 0.0);
    return this._angleProperty;
  }

  public get rotateAngle(): number { return this.angleProperty.value; }
  public set rotateAngle(value: number) { this.angleProperty.value = value; }

  protected override get requireAcceptForSelectionSetDynamics(): boolean { return RotateMethod.ByAngle !== this.rotateMethod; }

  protected calculateTransform(ev: BeButtonEvent): Transform | undefined {
    if (undefined === ev.viewport)
      return undefined;

    if (RotateMethod.ByAngle === this.rotateMethod) {
      const rotMatrix = AccuDrawHintBuilder.getCurrentRotation(ev.viewport, true, true);
      if (undefined === rotMatrix)
        return undefined;

      const invMatrix = rotMatrix.inverse();
      if (undefined === invMatrix)
        return undefined;

      const angMatrix = YawPitchRollAngles.createRadians(this.rotateAngle, 0, 0).toMatrix3d();
      if (undefined === angMatrix)
        return undefined;

      angMatrix.multiplyMatrixMatrix(invMatrix, invMatrix);
      rotMatrix.multiplyMatrixMatrix(invMatrix, rotMatrix);

      return Transform.createFixedPointAndMatrix(ev.point, rotMatrix);
    }

    if (undefined === this.anchorPoint || undefined === this.xAxisPoint)
      return undefined;

    const vec1 = Vector3d.createStartEnd(this.anchorPoint, this.xAxisPoint);
    const vec2 = Vector3d.createStartEnd(this.anchorPoint, ev.point);

    if (!vec1.normalizeInPlace() || !vec2.normalizeInPlace())
      return undefined;

    const dot = vec1.dotProduct(vec2);
    if (dot > (1.0 - Geometry.smallAngleRadians))
      return undefined;

    if (dot < (-1.0 + Geometry.smallAngleRadians)) {
      const rotMatrix = AccuDrawHintBuilder.getCurrentRotation(ev.viewport, true, true);
      if (undefined === rotMatrix)
        return undefined;

      const invMatrix = rotMatrix.inverse();
      if (undefined === invMatrix)
        return undefined;

      const angMatrix = YawPitchRollAngles.createRadians(Math.PI, 0, 0).toMatrix3d(); // 180 degree rotation...
      if (undefined === angMatrix)
        return undefined;

      angMatrix.multiplyMatrixMatrix(invMatrix, invMatrix);
      rotMatrix.multiplyMatrixMatrix(invMatrix, rotMatrix);

      return Transform.createFixedPointAndMatrix(this.anchorPoint, rotMatrix);
    }

    const zVec = vec1.unitCrossProduct(vec2);
    if (undefined === zVec)
      return undefined;

    const yVec = zVec.unitCrossProduct(vec1);
    if (undefined === yVec)
      return undefined;

    const matrix1 = Matrix3d.createRows(vec1, yVec, zVec);
    zVec.unitCrossProduct(vec2, yVec);
    const matrix2 = Matrix3d.createColumns(vec2, yVec, zVec);

    const matrix = matrix2.multiplyMatrixMatrix(matrix1);
    if (undefined === matrix)
      return undefined;

    return Transform.createFixedPointAndMatrix(this.anchorPoint, matrix);
  }

  protected override transformAgendaDynamics(transform: Transform, context: DynamicsContext): void {
    if (RotateAbout.Point === this.rotateAbout)
      return super.transformAgendaDynamics(transform, context);

    if (undefined === this._graphicsProvider)
      return;

    const rotatePoint = Point3d.create();

    for (const data of this._graphicsProvider.data) {
      if (RotateAbout.Origin === this.rotateAbout)
        rotatePoint.setFrom(data.placement.origin);
      else
        rotatePoint.setFrom(data.placement.calculateRange().center);

      const rotateTrans = Transform.createFixedPointAndMatrix(rotatePoint, transform.matrix);
      this._graphicsProvider.addSingleGraphic(data.graphic, rotateTrans, context);
    }
  }

  protected override async transformAgenda(transform: Transform): Promise<void> {
    if (RotateAbout.Point === this.rotateAbout)
      return super.transformAgenda(transform);

    try {
      this._startedCmd = await this.startCommand();
      if (IModelStatus.Success === await TransformElementsTool.callCommand("rotatePlacement", this.agenda.compressIds(), transform.matrix.toJSON(), RotateAbout.Center === this.rotateAbout))
        await this.saveChanges();
    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, err.toString()));
    }
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const transform = this.calculateTransform(ev);
    if (undefined !== transform)
      return this.transformAgendaDynamics(transform, context);

    if (undefined === this.anchorPoint)
      return;

    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(context.viewport.getContrastToBackgroundColor(), ColorDef.black, 1, LinePixels.Code2);
    builder.addLineString([this.anchorPoint.clone(), ev.point.clone()]);
    context.addGraphic(builder.finish());
  }

  protected override get wantAdditionalInput(): boolean {
    if (RotateMethod.ByAngle === this.rotateMethod)
      return super.wantAdditionalInput;

    return !this.haveFinalPoint;
  }

  protected override wantProcessAgenda(ev: BeButtonEvent): boolean {
    if (RotateMethod.ByAngle === this.rotateMethod)
      return super.wantProcessAgenda(ev);

    if (!this.havePivotPoint)
      this.havePivotPoint = true; // Uses anchorPoint...
    else if (undefined === this.xAxisPoint)
      this.xAxisPoint = ev.point.clone();
    else if (!this.haveFinalPoint)
      this.haveFinalPoint = true; // Uses button event...

    return super.wantProcessAgenda(ev);
  }

  protected override setupAndPromptForNextAction(): void {
    super.setupAndPromptForNextAction();

    if (RotateMethod.ByAngle === this.rotateMethod)
      return;

    if (undefined === this.anchorPoint || undefined === this.xAxisPoint)
      return;

    const hints = new AccuDrawHintBuilder();
    hints.setXAxis(Vector3d.createStartEnd(this.anchorPoint, this.xAxisPoint));
    hints.setOrigin(this.anchorPoint);
    hints.setModePolar();
    hints.sendHints();
  }

  protected override provideToolAssistance(_mainInstrText?: string, _additionalInstr?: ToolAssistanceInstruction[]): void {
    let mainMsg;
    if (RotateMethod.ByAngle === this.rotateMethod) {
      if (!this.isSelectByPoints && !this.wantAdditionalElements && this.wantAdditionalInput)
        mainMsg = EditTools.translate("RotateElements.Prompts.IdentifyPoint");
    } else {
      if (!this.isSelectByPoints && !this.wantAdditionalElements) {
        if (!this.havePivotPoint)
          mainMsg = EditTools.translate("RotateElements.Prompts.IdentifyPoint");
        else if (undefined === this.xAxisPoint)
          mainMsg = EditTools.translate("RotateElements.Prompts.DefineStart");
        else
          mainMsg = EditTools.translate("RotateElements.Prompts.DefineAmount");
      }
    }
    super.provideToolAssistance(mainMsg);
  }

  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (this.methodProperty.name === updatedValue.propertyName) {
      this.methodProperty.value = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.methodProperty.item);
      this.onRestartTool(); // calling restart, not reinitialize to not exit tool for selection set...
      return true;
    } else if (this.aboutProperty.name === updatedValue.propertyName) {
      this.aboutProperty.value = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.aboutProperty.item);
      return true;
    } else if (this.angleProperty.name === updatedValue.propertyName) {
      this.rotateAngle = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.angleProperty.item);
      return true;
    }
    return false;
  }

  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();

    toolSettings.push(this.methodProperty.toDialogItem({ rowPriority: 1, columnIndex: 2 }));
    toolSettings.push(this.aboutProperty.toDialogItem({ rowPriority: 2, columnIndex: 2 }));

    if (RotateMethod.ByAngle === this.rotateMethod)
      toolSettings.push(this.angleProperty.toDialogItem({ rowPriority: 3, columnIndex: 2 }));

    return toolSettings;
  }

  public onRestartTool(): void {
    const tool = new RotateElementsTool();
    if (!tool.run())
      this.exitTool();
  }

  public override onInstall(): boolean {
    if (!super.onInstall())
      return false;

    // Setup initial values here instead of supplyToolSettingsProperties to support keyin args w/o ui-framework...
    const rotateMethod = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.methodProperty.name);
    if (undefined !== rotateMethod)
      this.methodProperty.dialogItemValue = rotateMethod;

    const rotateAbout = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.aboutProperty.name);
    if (undefined !== rotateAbout)
      this.aboutProperty.dialogItemValue = rotateAbout;

    const rotateAngle = IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValue(this.toolId, this.angleProperty.name);
    if (undefined !== rotateAngle)
      this.angleProperty.dialogItemValue = rotateAngle;

    return true;
  }

  /** The keyin takes the following arguments, all of which are optional:
   *  - `method=0|1` How rotate angle will be specified. 0 for by 3 points, 1 for by specified angle.
   *  - `about=0|1|2` Location to rotate about. 0 for point, 1 for placement origin, and 2 for center of range.
   *  - `angle=number` Rotation angle in degrees when not defining angle by points.
   */
  public override parseAndRun(...inputArgs: string[]): boolean {
    let rotateMethod;
    let rotateAbout;
    let rotateAngle;

    for (const arg of inputArgs) {
      const parts = arg.split("=");
      if (2 !== parts.length)
        continue;

      if (parts[0].toLowerCase().startsWith("me")) {
        const method = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(method)) {
          switch (method) {
            case 0:
              rotateMethod = RotateMethod.By3Points;
              break;
            case 1:
              rotateMethod = RotateMethod.ByAngle;
              break;
          }
        }
      } else if (parts[0].toLowerCase().startsWith("ab")) {
        const about = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(about)) {
          switch (about) {
            case 0:
              rotateAbout = RotateAbout.Point;
              break;
            case 1:
              rotateAbout = RotateAbout.Origin;
              break;
            case 2:
              rotateAbout = RotateAbout.Center;
              break;
          }
        }
      } else if (parts[0].toLowerCase().startsWith("an")) {
        const angle = Number.parseFloat(parts[1]);
        if (!Number.isNaN(angle)) {
          rotateAngle = Angle.createDegrees(angle).radians;
        }
      }
    }

    // Update current session values so keyin args are picked up for tool settings/restart...
    if (undefined !== rotateMethod)
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.methodProperty.name, value: { value: rotateMethod } });

    if (undefined !== rotateAbout)
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.aboutProperty.name, value: { value: rotateAbout } });

    if (undefined !== rotateAngle)
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: this.angleProperty.name, value: { value: rotateAngle } });

    return this.run();
  }
}

