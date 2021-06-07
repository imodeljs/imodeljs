/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { AccuDrawHintBuilder, AccuDrawShortcuts, AngleDescription, BeButtonEvent, CanvasDecoration, CoreTools, DecorateContext, EventHandled, GraphicType, IModelApp, LengthDescription, PrimitiveTool, ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection, Viewport } from "@bentley/imodeljs-frontend";
import { Angle, Matrix3d, Point3d, Ray3d, Vector3d, XYAndZ } from "@bentley/geometry-core";
import { Cartographic, ColorDef, LinePixels } from "@bentley/imodeljs-common";
import { ProjectExtentsClipDecoration } from "./ProjectExtentsDecoration";
import { DialogItem, DialogItemValue, DialogPropertySyncItem, PropertyDescription } from "@bentley/ui-abstract";
import { EditTools } from "../EditTool";

function translatePrompt(key: string) { return EditTools.translate(`ProjectLocation:Prompts.${key}`); }
function translateMessage(key: string) { return EditTools.translate(`ProjectLocation:Message.${key}`); }

/** @internal */
class LabelDecoration implements CanvasDecoration {
  public worldLocation = new Point3d();
  public position = new Point3d();
  public label: string;

  constructor(worldLocation: XYAndZ, label: string) {
    this.worldLocation.setFrom(worldLocation);
    this.label = label;
  }

  public drawDecoration(ctx: CanvasRenderingContext2D): void {
    ctx.font = "16px san-serif";
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
    this.position.y -= Math.floor(vp.pixelsFromInches(0.45)) + 0.5; // Offset from world location...
    return vp.viewRect.containsPoint(this.position);
  }

  public addDecoration(context: DecorateContext) {
    if (this.setPosition(context.viewport))
      context.addCanvasDecoration(this);
  }
}

/** Change or update geolocation for project.
 * To show tool settings for specifying lat/long, make sure formatting and parsing data are cached before the tool starts
 * by calling QuantityFormatter.onInitialized at app startup.
 * @beta
 */
export class ProjectGeolocationPointTool extends PrimitiveTool {
  public static toolId = "ProjectLocation.Geolocation.Point";
  public static iconSpec = "icon-globe"; // <== Tool button should use whatever icon you have here...

  public static get minArgs() { return 0; }
  public static get maxArgs() { return 4; } // latitude, longitude, altitude, north direction...

  protected _haveToolSettings = false;
  protected _cartographicFromArgs = false;

  protected _accept = false;
  protected _scale = 1.0;
  protected _origin?: Point3d;
  protected _labelDeco?: LabelDecoration;

  public isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && vp.view.isSpatialView()); }
  public isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; } // Allow snapping to terrain, etc. outside project extents...
  public requireWriteableTarget(): boolean { return false; } // Tool doesn't modify the imodel...
  public onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  public onCleanup() { super.onCleanup(); this.unsuspendDecorations(); }
  public onRestartTool(): void { this.exitTool(); }
  public onUnsuspend(): void { this.provideToolAssistance(); }

  private _latitudeValue: DialogItemValue = { value: 0.0 };
  public get latitude(): number { return this._latitudeValue.value as number; }
  public set latitude(value: number) { this._latitudeValue.value = value; }
  private static _latitudeName = "latitude";
  private static _latitudeDescription?: AngleDescription;
  private _getLatitudeDescription = (): PropertyDescription => {
    if (!ProjectGeolocationPointTool._latitudeDescription)
      ProjectGeolocationPointTool._latitudeDescription = new AngleDescription(ProjectGeolocationPointTool._latitudeName, translateMessage("Latitude"));
    return ProjectGeolocationPointTool._latitudeDescription;
  };

  private _longitudeValue: DialogItemValue = { value: 0.0 };
  public get longitude(): number { return this._longitudeValue.value as number; }
  public set longitude(value: number) { this._longitudeValue.value = value; }
  private static _longitudeName = "longitude";
  private static _longitudeDescription?: AngleDescription;
  private _getLongitudeDescription = (): PropertyDescription => {
    if (!ProjectGeolocationPointTool._longitudeDescription)
      ProjectGeolocationPointTool._longitudeDescription = new AngleDescription(ProjectGeolocationPointTool._longitudeName, translateMessage("Longitude"));
    return ProjectGeolocationPointTool._longitudeDescription;
  };

  private _altitudeValue: DialogItemValue = { value: 0.0 };
  public get altitude(): number { return this._altitudeValue.value as number; }
  public set altitude(value: number) { this._altitudeValue.value = value; }
  private static _altitudeName = "altitude";
  private static _altitudeDescription?: LengthDescription;
  private _getAltitudeDescription = (): PropertyDescription => {
    if (!ProjectGeolocationPointTool._altitudeDescription)
      ProjectGeolocationPointTool._altitudeDescription = new LengthDescription(ProjectGeolocationPointTool._altitudeName, CoreTools.translate("Measure.Labels.Altitude"));
    return ProjectGeolocationPointTool._altitudeDescription;
  };

  private _northValue: DialogItemValue = { value: 0.0 };
  public get north(): number { return this._northValue.value as number; }
  public set north(value: number) { this._northValue.value = value; }
  private static _northName = "north";
  private static _northDescription?: AngleDescription;
  private _getNorthDescription = (): PropertyDescription => {
    if (!ProjectGeolocationPointTool._northDescription)
      ProjectGeolocationPointTool._northDescription = new AngleDescription(ProjectGeolocationPointTool._northName, translateMessage("North"));
    return ProjectGeolocationPointTool._northDescription;
  };

  private syncToolSettingsCoordinates(): void {
    const syncData: DialogPropertySyncItem[] = []; // NOTE: Check that formatted quantity descriptions are defined, i.e. abstract ui for tool settings is implemented...

    if (ProjectGeolocationPointTool._latitudeDescription) {
      const newLatitudeDisplayValue = ProjectGeolocationPointTool._latitudeDescription.format(this.latitude);
      const latitudeValue: DialogItemValue = { value: this.latitude, displayValue: newLatitudeDisplayValue };
      const syncLatitudeItem: DialogPropertySyncItem = { value: latitudeValue, propertyName: ProjectGeolocationPointTool._latitudeName, isDisabled: !this._accept };
      syncData.push(syncLatitudeItem);
    }

    if (ProjectGeolocationPointTool._longitudeDescription) {
      const newLongitudeDisplayValue = ProjectGeolocationPointTool._longitudeDescription.format(this.longitude);
      const longitudeValue: DialogItemValue = { value: this.longitude, displayValue: newLongitudeDisplayValue };
      const syncLongitudeItem: DialogPropertySyncItem = { value: longitudeValue, propertyName: ProjectGeolocationPointTool._longitudeName, isDisabled: !this._accept };
      syncData.push(syncLongitudeItem);
    }

    if (ProjectGeolocationPointTool._altitudeDescription) {
      const newAltitudeDisplayValue = ProjectGeolocationPointTool._altitudeDescription.format(this.altitude);
      const altitudeValue: DialogItemValue = { value: this.altitude, displayValue: newAltitudeDisplayValue };
      const syncAltitudeItem: DialogPropertySyncItem = { value: altitudeValue, propertyName: ProjectGeolocationPointTool._altitudeName, isDisabled: !this._accept };
      syncData.push(syncAltitudeItem);
    }

    if (ProjectGeolocationPointTool._northDescription) {
      const newNorthDisplayValue = ProjectGeolocationPointTool._northDescription.format(this.north);
      const northValue: DialogItemValue = { value: this.north, displayValue: newNorthDisplayValue };
      const syncNorthItem: DialogPropertySyncItem = { value: northValue, propertyName: ProjectGeolocationPointTool._northName, isDisabled: !this._accept };
      syncData.push(syncNorthItem);
    }

    if (0 !== syncData.length)
      this.syncToolSettingsProperties(syncData);
  }

  public applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === ProjectGeolocationPointTool._latitudeName) {
      this.latitude = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: ProjectGeolocationPointTool._latitudeName, value: this._latitudeValue });
    } else if (updatedValue.propertyName === ProjectGeolocationPointTool._longitudeName) {
      this.longitude = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: ProjectGeolocationPointTool._longitudeName, value: this._longitudeValue });
    } else if (updatedValue.propertyName === ProjectGeolocationPointTool._altitudeName) {
      this.altitude = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: ProjectGeolocationPointTool._altitudeName, value: this._altitudeValue });
    } else if (updatedValue.propertyName === ProjectGeolocationPointTool._northName) {
      this.north = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, { propertyName: ProjectGeolocationPointTool._northName, value: this._northValue });
    }
    return true;
  }

  public supplyToolSettingsProperties(): DialogItem[] | undefined {
    this._haveToolSettings = true;
    const toolSettings = new Array<DialogItem>();
    toolSettings.push({ value: this._latitudeValue, property: this._getLatitudeDescription(), isDisabled: true, editorPosition: { rowPriority: 1, columnIndex: 2 } });
    toolSettings.push({ value: this._longitudeValue, property: this._getLongitudeDescription(), isDisabled: true, editorPosition: { rowPriority: 2, columnIndex: 2 } });
    toolSettings.push({ value: this._altitudeValue, property: this._getAltitudeDescription(), isDisabled: true, editorPosition: { rowPriority: 3, columnIndex: 2 } });
    toolSettings.push({ value: this._northValue, property: this._getNorthDescription(), isDisabled: true, editorPosition: { rowPriority: 4, columnIndex: 2 } });
    return toolSettings;
  }

  protected provideToolAssistance(): void {
    const acceptMsg = CoreTools.translate(undefined === this._origin ? "ElementSet.Inputs.AcceptPoint" : "ElementSet.Inputs.Accept");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Cancel");
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, translatePrompt(undefined === this._origin ? "IdentifyKnownLocation" : "ConfirmCoordinates"));
    const sections: ToolAssistanceSection[] = [];

    const mouseInstructions: ToolAssistanceInstruction[] = [];
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));

    const touchInstructions: ToolAssistanceInstruction[] = [];
    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  protected setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(undefined === this._origin);
    this.provideToolAssistance();
  }

  private pulseDecoration() {
    if (!this._accept)
      return;

    const deco = ProjectExtentsClipDecoration.get();
    if (undefined === deco)
      return;

    this._scale += 0.1;
    if (this._scale > 1.6)
      this._scale = 1.0;

    deco.viewport.invalidateDecorations();
    setTimeout(() => { this.pulseDecoration(); }, 100);
  }

  private unsuspendDecorations() {
    const deco = ProjectExtentsClipDecoration.get();
    if (undefined !== deco)
      deco.suspendGeolocationDecorations = false;
  }

  public decorate(context: DecorateContext): void {
    if (undefined === this._origin || !context.viewport.view.isSpatialView())
      return;

    const deco = ProjectExtentsClipDecoration.get();
    if (undefined === deco)
      return;

    deco.suspendGeolocationDecorations = true;
    deco.drawMonumentPoint(context, this._origin, this._scale);

    if (undefined !== this._labelDeco)
      this._labelDeco.addDecoration(context);
  }

  public async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (undefined === ev.viewport || this._accept)
      return;

    this._origin = ev.point.clone();
    ev.viewport.invalidateDecorations();
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize(); // Calls onRestartTool to exit...
    return EventHandled.No;
  }

  public acceptKnownLocation(ev: BeButtonEvent): void {
    const deco = ProjectExtentsClipDecoration.get();
    if (undefined === deco)
      return;

    this._accept = true; // Require explict accept to give user a chance to change values...
    this._origin = ev.point.clone();
    this._labelDeco = new LabelDecoration(this._origin, translatePrompt("SpecifyCoordinates"));

    if (!this._cartographicFromArgs) {
      if (this.iModel.isGeoLocated) {
        const cartographic = this.iModel.spatialToCartographicFromEcef(this._origin);
        this.latitude = cartographic.latitude;
        this.longitude = cartographic.longitude;
        this.altitude = cartographic.height;
        this.north = deco.getClockwiseAngleToNorth().radians;
      } else if (!this._haveToolSettings) {
        // Greenwich is better default when testing control handle w/o tool settings support...
        this.latitude = Angle.createDegrees(51.4934).radians;
        this.longitude = Angle.createDegrees(0.0098).radians;
        this.altitude = 50.0;
        this.north = 0.0;
      }
    }

    this.syncToolSettingsCoordinates();
    this.pulseDecoration(); // Pulse to indicate that we are waiting for user input...
    this.setupAndPromptForNextAction();
  }

  public acceptCoordinates(): void {
    const deco = ProjectExtentsClipDecoration.get();
    if (undefined === deco)
      return;

    const origin = new Cartographic(this.longitude, this.latitude, this.altitude);
    if (!deco.updateEcefLocation(origin, this._origin, Angle.createRadians(this.north)))
      return;

    this.onReinitialize(); // Calls onRestartTool to exit...
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport)
      return EventHandled.No; // Shouldn't really happen...

    const haveKnownLocation = this._accept;
    if (!haveKnownLocation)
      this.acceptKnownLocation(ev);

    const needAcceptPoint = !haveKnownLocation && this._haveToolSettings;
    if (!needAcceptPoint)
      this.acceptCoordinates();

    return EventHandled.No;
  }

  public onInstall(): boolean { return ProjectExtentsClipDecoration.allowEcefLocationChange(false); }

  /** The keyin takes the following arguments, all of which are optional:
   *  - `latitude=number` Latitude of accept point in degrees.
   *  - `longitude=number` Longitude of accept point in degrees.
   *  - `altitude=number` Height above ellipsoid of accept point.
   *  - `north=number` North direction in degrees of accept point.
   */
  public parseAndRun(...inputArgs: string[]): boolean {
    for (const arg of inputArgs) {
      const parts = arg.split("=");
      if (2 !== parts.length)
        continue;

      if (parts[0].toLowerCase().startsWith("la")) {
        const latitude = Number.parseFloat(parts[1]);
        if (!Number.isNaN(latitude)) {
          this.latitude = Angle.createDegrees(latitude).radians;
          this._cartographicFromArgs = true;
        }
      } else if (parts[0].toLowerCase().startsWith("lo")) {
        const longitude = Number.parseFloat(parts[1]);
        if (!Number.isNaN(longitude)) {
          this.longitude = Angle.createDegrees(longitude).radians;
          this._cartographicFromArgs = true;
        }
      } else if (parts[0].toLowerCase().startsWith("al")) {
        const altitude = Number.parseFloat(parts[1]);
        if (!Number.isNaN(altitude)) {
          this.altitude = altitude;
          this._cartographicFromArgs = true;
        }
      } else if (parts[0].toLowerCase().startsWith("no")) {
        const north = Number.parseFloat(parts[1]);
        if (!Number.isNaN(north)) {
          this.north = Angle.createDegrees(north).radians;
          this._cartographicFromArgs = true;
        }
      }
    }

    return this.run();
  }

  public static startTool(): boolean { return new ProjectGeolocationPointTool().run(); }
}

/** Change or update geolocation direction to true north.
 * @beta
 */
export class ProjectGeolocationNorthTool extends PrimitiveTool {
  public static toolId = "ProjectLocation.Geolocation.North";
  public static iconSpec = "icon-sort-up"; // <== Tool button should use whatever icon you have here...
  protected _origin?: Point3d;
  protected _northDir?: Ray3d;

  public isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && vp.view.isSpatialView()); }
  public isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; } // Allow snapping to terrain, etc. outside project extents...
  public requireWriteableTarget(): boolean { return false; } // Tool doesn't modify the imodel...
  public onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  public onCleanup() { super.onCleanup(); this.unsuspendDecorations(); }
  public onRestartTool(): void { this.exitTool(); }
  public onUnsuspend(): void { this.provideToolAssistance(); }

  protected provideToolAssistance(): void {
    const acceptMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Cancel");
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, translatePrompt(undefined === this._origin ? "IdentifyRefPoint" : "DefineAngle"));
    const sections: ToolAssistanceSection[] = [];

    const mouseInstructions: ToolAssistanceInstruction[] = [];
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));

    const touchInstructions: ToolAssistanceInstruction[] = [];
    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  protected setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    this.provideToolAssistance();

    if (undefined === this._origin)
      return;

    const hints = new AccuDrawHintBuilder();
    hints.setRotation(Matrix3d.createIdentity());
    hints.setOrigin(this._origin);
    hints.setModePolar();
    hints.setOriginFixed = true;
    hints.setLockZ = true;
    hints.sendHints();
  }

  private getAdjustedPoint(ev: BeButtonEvent): Point3d | undefined {
    if (undefined === this._origin)
      return undefined;
    return AccuDrawHintBuilder.projectPointToPlaneInView(ev.point, this._origin, Vector3d.unitZ(), ev.viewport!, true);
  }

  private unsuspendDecorations() {
    const deco = ProjectExtentsClipDecoration.get();
    if (undefined !== deco)
      deco.suspendGeolocationDecorations = false;
  }

  private updateNorthVector(ev: BeButtonEvent): void {
    if (undefined === ev.viewport)
      return;

    if (undefined === this._northDir)
      this._northDir = Ray3d.create(ev.point, Vector3d.unitY());
    else
      this._northDir.origin.setFrom(undefined !== this._origin ? this._origin : ev.point);

    const dirPt = this.getAdjustedPoint(ev);
    if (undefined === dirPt)
      return;

    this._northDir.direction.setStartEnd(this._northDir.origin, dirPt);
    if (this._northDir.direction.magnitude() < 1.0e-6)
      this._northDir.direction.setFrom(Vector3d.unitY());

    this._northDir.direction.z = 0.0;
    this._northDir.direction.normalizeInPlace();
  }

  public decorate(context: DecorateContext): void {
    if (undefined === this._northDir || !context.viewport.view.isSpatialView())
      return;

    const deco = ProjectExtentsClipDecoration.get();
    if (undefined === deco)
      return;

    deco.suspendGeolocationDecorations = true;
    deco.drawNorthArrow(context, this._northDir);
  }

  public async onKeyTransition(wentDown: boolean, keyEvent: KeyboardEvent): Promise<EventHandled> {
    if (EventHandled.Yes === await super.onKeyTransition(wentDown, keyEvent))
      return EventHandled.Yes;
    return (wentDown && AccuDrawShortcuts.processShortcutKey(keyEvent)) ? EventHandled.Yes : EventHandled.No;
  }

  public async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (undefined === ev.viewport)
      return;

    this.updateNorthVector(ev);
    ev.viewport.invalidateDecorations();
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize(); // Calls onRestartTool to exit...
    return EventHandled.No;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport)
      return EventHandled.No; // Shouldn't really happen...

    if (undefined === this._origin) {
      this._origin = ev.point.clone();
      this.setupAndPromptForNextAction();
      return EventHandled.No;
    }

    this.updateNorthVector(ev);

    if (undefined !== this._northDir) {
      const deco = ProjectExtentsClipDecoration.get();
      if (undefined !== deco)
        deco.updateNorthDirection(this._northDir);
    }

    this.onReinitialize(); // Calls onRestartTool to exit...
    return EventHandled.No;
  }

  public onInstall(): boolean { return ProjectExtentsClipDecoration.allowEcefLocationChange(true); }

  public static startTool(): boolean { return new ProjectGeolocationNorthTool().run(); }
}

/** Move a geolocated model by specifying two points to define the offset.
 * @beta
 */
export class ProjectGeolocationMoveTool extends PrimitiveTool {
  public static toolId = "ProjectLocation.Geolocation.Move";
  public static iconSpec = "icon-move"; // <== Tool button should use whatever icon you have here...
  protected _origin?: Point3d;
  protected _current?: Point3d;

  public isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && vp.view.isSpatialView()); }
  public isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; } // Allow snapping to terrain, etc. outside project extents...
  public requireWriteableTarget(): boolean { return false; } // Tool doesn't modify the imodel...
  public onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  public onCleanup() { super.onCleanup(); this.unsuspendDecorations(); }
  public onRestartTool(): void { const tool = new ProjectGeolocationMoveTool(); if (!tool.run()) this.exitTool(); }
  public onUnsuspend(): void { this.provideToolAssistance(); }

  protected provideToolAssistance(): void {
    const acceptMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Cancel");
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, translatePrompt(undefined === this._origin ? "IdentifyRefPoint" : "DefineOffset"));
    const sections: ToolAssistanceSection[] = [];

    const mouseInstructions: ToolAssistanceInstruction[] = [];
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));

    const touchInstructions: ToolAssistanceInstruction[] = [];
    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  protected setupAndPromptForNextAction(): void {
    IModelApp.accuSnap.enableSnap(true);
    this.provideToolAssistance();

    if (undefined === this._origin)
      return;

    const hints = new AccuDrawHintBuilder();
    hints.setRotation(Matrix3d.createIdentity());
    hints.setOrigin(this._origin);
    hints.setModePolar();
    hints.setOriginFixed = true;
    hints.sendHints();
  }

  private unsuspendDecorations() {
    const deco = ProjectExtentsClipDecoration.get();
    if (undefined !== deco)
      deco.suspendGeolocationDecorations = false;
  }

  private acceptOffset(ev: BeButtonEvent): void {
    if (undefined === ev.viewport || undefined === this._origin)
      return;

    const deco = ProjectExtentsClipDecoration.get();
    if (undefined === deco)
      return;

    const origin = this.iModel.spatialToCartographicFromEcef(ev.point);
    if (!deco.updateEcefLocation(origin, this._origin))
      return;

    this.onReinitialize(); // Calls onRestartTool to exit...
  }

  public decorate(context: DecorateContext): void {
    if (undefined === this._origin || undefined === this._current || !context.viewport.view.isSpatialView())
      return;

    const deco = ProjectExtentsClipDecoration.get();
    if (undefined === deco)
      return;

    const builderAccVis = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const builderAccHid = context.createGraphicBuilder(GraphicType.WorldOverlay);
    const colorAccVis = ColorDef.white.adjustedForContrast(context.viewport.view.backgroundColor);
    const colorAccHid = colorAccVis.withAlpha(100);

    builderAccVis.setSymbology(colorAccVis, ColorDef.black, 3);
    builderAccHid.setSymbology(colorAccHid, ColorDef.black, 1, LinePixels.Code2);

    const extents = this.iModel.projectExtents.cloneTranslated(Vector3d.createStartEnd(this._origin, this._current));

    builderAccVis.addRangeBox(extents);
    builderAccHid.addRangeBox(extents);
    builderAccHid.addLineString([this._origin, this._current]);

    context.addDecorationFromBuilder(builderAccVis);
    context.addDecorationFromBuilder(builderAccHid);

    deco.suspendGeolocationDecorations = true;
  }

  public async onKeyTransition(wentDown: boolean, keyEvent: KeyboardEvent): Promise<EventHandled> {
    if (EventHandled.Yes === await super.onKeyTransition(wentDown, keyEvent))
      return EventHandled.Yes;
    return (wentDown && AccuDrawShortcuts.processShortcutKey(keyEvent)) ? EventHandled.Yes : EventHandled.No;
  }

  public async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (undefined === ev.viewport)
      return;

    this._current = ev.point;
    ev.viewport.invalidateDecorations();
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === this._origin)
      this.exitTool(); // exit to select tool if we haven't gotten first point...
    else
      this.onReinitialize(); // Calls onRestartTool...
    return EventHandled.No;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport)
      return EventHandled.No; // Shouldn't really happen...

    if (undefined === this._origin) {
      this._origin = ev.point.clone();
      this.setupAndPromptForNextAction();
      return EventHandled.No;
    }

    this.acceptOffset(ev);
    return EventHandled.No;
  }

  public onInstall(): boolean { return ProjectExtentsClipDecoration.allowEcefLocationChange(true); }

  public static startTool(): boolean { return new ProjectGeolocationMoveTool().run(); }
}

