/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MarkupTools
 */

// cspell:ignore rtmp stmp

import { Point3d, Vector3d } from "@bentley/geometry-core";
import {
  BeButtonEvent, CoordinateLockOverrides, CoreTools, EventHandled, IModelApp, QuantityType, ToolAssistance, ToolAssistanceImage,
  ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection,
} from "@bentley/imodeljs-frontend";
import { G, Marker, Element as MarkupElement, SVG } from "@svgdotjs/svg.js";
import { MarkupApp } from "./Markup";
import { MarkupTool } from "./MarkupTool";

/** Base class for tools that place new Markup elements
 * @public
 */
export abstract class RedlineTool extends MarkupTool {
  protected _minPoints = 1;
  protected _nRequiredPoints = 2;
  protected readonly _points: Point3d[] = [];

  protected onAdded(el: MarkupElement) {
    const markup = this.markup;
    const undo = markup.undo;
    undo.performOperation(this.keyin, () => undo.onAdded(el));
    markup.selected.restart(el);
  }
  protected isComplete(_ev: BeButtonEvent) { return this._points.length >= this._nRequiredPoints; }
  protected override setupAndPromptForNextAction(): void {
    super.setupAndPromptForNextAction();
    this.markup.disablePick();
    IModelApp.toolAdmin.setCursor(0 === this._points.length ? IModelApp.viewManager.crossHairCursor : IModelApp.viewManager.dynamicsCursor);
  }

  protected createMarkup(_svgMarkup: G, _ev: BeButtonEvent, _isDynamics: boolean): void { }
  protected clearDynamicsMarkup(_isDynamics: boolean): void { this.markup.svgDynamics!.clear(); }

  public override onRestartTool(): void { this.exitTool(); } // Default to single shot and return control to select tool...
  public override onCleanup() { this.clearDynamicsMarkup(false); }

  public override onReinitialize(): void {
    this.clearDynamicsMarkup(false);
    super.onReinitialize();
  }

  public override async onUndoPreviousStep(): Promise<boolean> {
    return (0 === this._points.length) ? false : (this.onReinitialize(), true);
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (undefined === ev.viewport || this._points.length < this._minPoints)
      return;
    this.clearDynamicsMarkup(true);
    this.createMarkup(this.markup.svgDynamics!, ev, true);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport)
      return EventHandled.No;

    this._points.push(MarkupApp.convertVpToVb(ev.viewPoint));
    if (!this.isComplete(ev)) {
      this.setupAndPromptForNextAction();
      return EventHandled.No;
    }

    this.createMarkup(this.markup.svgMarkup!, ev, false);
    this.onReinitialize();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  protected provideToolAssistance(mainInstrKey: string, singlePoint: boolean = false): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, IModelApp.i18n.translate(mainInstrKey));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Exit");
    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(singlePoint ? ToolAssistanceImage.OneTouchTap : ToolAssistanceImage.OneTouchDrag, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }
}

/** Tool for placing Markup Lines
 * @public
 */
export class LineTool extends RedlineTool {
  public static override toolId = "Markup.Line";
  public static override iconSpec = "icon-line";

  protected override showPrompt(): void { this.provideToolAssistance(CoreTools.tools + (0 === this._points.length ? "ElementSet.Prompts.StartPoint" : "ElementSet.Prompts.EndPoint")); }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const element = svgMarkup.line(start.x, start.y, end.x, end.y);
    this.setCurrentStyle(element, false);
    if (!isDynamics)
      this.onAdded(element);
  }
}

/** Tool for placing Markup Rectangles
 * @public
 */
export class RectangleTool extends RedlineTool {
  public static override toolId = "Markup.Rectangle";
  public static override iconSpec = "icon-rectangle";

  constructor(protected _cornerRadius?: number) { super(); } // Specify radius to create a rectangle with rounded corners.

  protected override showPrompt(): void { this.provideToolAssistance(CoreTools.tools + (0 === this._points.length ? "ElementSet.Prompts.StartCorner" : "ElementSet.Prompts.OppositeCorner")); }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const vec = start.vectorTo(end);
    const width = Math.abs(vec.x);
    const height = Math.abs(vec.y);
    if (width < 1 || height < 1)
      return;
    const offset = Point3d.create(vec.x < 0 ? end.x : start.x, vec.y < 0 ? end.y : start.y); // define location by corner points...
    const element = svgMarkup.rect(width, height).move(offset.x, offset.y);
    this.setCurrentStyle(element, true);
    if (undefined !== this._cornerRadius)
      element.radius(this._cornerRadius);
    if (!isDynamics)
      this.onAdded(element);
  }
}

/** Tool for placing Markup Polygons
 * @public
 */
export class PolygonTool extends RedlineTool {
  public static override toolId = "Markup.Polygon";
  public static override iconSpec = "icon-polygon";

  constructor(protected _numSides?: number) { super(); } // Specify number of polygon sides. Default if undefined is 5.

  protected override showPrompt(): void { this.provideToolAssistance(MarkupTool.toolKey + (0 === this._points.length ? "Polygon.Prompts.FirstPoint" : "Polygon.Prompts.NextPoint")); }

  protected getPoints(points: number[], center: Point3d, edge: Point3d, numSides: number, inscribe: boolean): boolean {
    if (numSides < 3 || numSides > 100)
      return false;
    let radius = center.distanceXY(edge);
    if (radius < 1)
      return false;
    const delta = (Math.PI * 2.0) / numSides;
    const vec = center.vectorTo(edge);
    let angle = Vector3d.unitX().planarRadiansTo(vec, Vector3d.unitZ());
    if (!inscribe) { const theta = delta * 0.5; angle -= theta; radius /= Math.cos(theta); }
    const rtmp = Point3d.create();
    const stmp = Point3d.create();
    for (let i = 0; i < numSides; i++, angle += delta) {
      rtmp.x = radius * Math.cos(angle);
      rtmp.y = radius * Math.sin(angle);
      rtmp.z = 0.0;
      center.plus(rtmp, stmp);
      points.push(stmp.x);
      points.push(stmp.y);
    }
    return true;
  }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const center = this._points[0];
    const edge = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const pts: number[] = [];
    if (!this.getPoints(pts, center, edge, undefined !== this._numSides ? this._numSides : 5, true))
      return;
    const element = svgMarkup.polygon(pts);
    this.setCurrentStyle(element, true);
    if (!isDynamics)
      this.onAdded(element);
  }
}

/** Tool for placing Markup Clouds
 * @public
 */
export class CloudTool extends RedlineTool {
  public static override toolId = "Markup.Cloud";
  public static override iconSpec = "icon-cloud";
  protected _cloud?: MarkupElement;

  protected override showPrompt(): void { this.provideToolAssistance(CoreTools.tools + (0 === this._points.length ? "ElementSet.Prompts.StartCorner" : "ElementSet.Prompts.OppositeCorner")); }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const vec = start.vectorTo(end);
    const width = Math.abs(vec.x);
    const height = Math.abs(vec.y);
    if (width < 10 || height < 10)
      return;
    if (undefined === this._cloud) {
      this._cloud = svgMarkup.path(MarkupApp.props.active.cloud.path);
    } else if (!isDynamics) {
      svgMarkup.add(this._cloud);
    }
    const offset = Point3d.create(vec.x < 0 ? end.x : start.x, vec.y < 0 ? end.y : start.y); // define location by corner points...
    this._cloud.move(offset.x, offset.y);
    this._cloud.width(width);
    this._cloud.height(height);
    this.setCurrentStyle(this._cloud, true);
    if (!isDynamics)
      this.onAdded(this._cloud);
  }

  protected override clearDynamicsMarkup(isDynamics: boolean): void {
    if (!isDynamics)
      super.clearDynamicsMarkup(isDynamics); // For dynamics we don't create a new cloud each frame, we just set the width/height...
  }
}

/** Tool for placing Markup Circles
 * @public
 */
export class CircleTool extends RedlineTool {
  public static override toolId = "Markup.Circle";
  public static override iconSpec = "icon-circle";

  protected override showPrompt(): void { this.provideToolAssistance(MarkupTool.toolKey + (0 === this._points.length ? "Circle.Prompts.FirstPoint" : "Circle.Prompts.NextPoint")); }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const radius = start.distanceXY(end);
    if (radius < 1)
      return;
    const element = svgMarkup.circle(radius * 2.0).center(start.x, start.y);
    this.setCurrentStyle(element, true);
    if (!isDynamics)
      this.onAdded(element);
  }
}

/** Tool for placing Markup Ellipses
 * @public
 */
export class EllipseTool extends RedlineTool {
  public static override toolId = "Markup.Ellipse";
  public static override iconSpec = "icon-ellipse";

  protected override showPrompt(): void { this.provideToolAssistance(CoreTools.tools + (0 === this._points.length ? "ElementSet.Prompts.StartCorner" : "ElementSet.Prompts.OppositeCorner")); }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const vec = start.vectorTo(end);
    const width = Math.abs(vec.x);
    const height = Math.abs(vec.y);
    if (width < 1 || height < 1)
      return;
    const offset = Point3d.create(vec.x < 0 ? end.x : start.x, vec.y < 0 ? end.y : start.y); // define location by corner points...
    const element = svgMarkup.ellipse(width, height).move(offset.x, offset.y);
    this.setCurrentStyle(element, true);
    if (!isDynamics)
      this.onAdded(element);
  }
}

/** Tool for placing Markup Arrows
 * @public
 */
export class ArrowTool extends RedlineTool {
  public static override toolId = "Markup.Arrow";
  public static override iconSpec = "icon-callout";

  /** ctor for ArrowTool
   * @param _arrowPos "start", "end", or "both". If undefined = "end".
   */
  constructor(protected _arrowPos?: string) { super(); }

  protected override showPrompt(): void { this.provideToolAssistance(CoreTools.tools + (0 === this._points.length ? "ElementSet.Prompts.StartPoint" : "ElementSet.Prompts.EndPoint")); }

  protected getOrCreateArrowMarker(color: string): Marker {
    // NOTE: Flashing doesn't currently affect markers, need support for "context-stroke" and "context-fill". For now encode color in name...
    const arrowProps = MarkupApp.props.active.arrow;
    const arrowLength = arrowProps.length;
    const arrowWidth = arrowProps.width;
    const arrowMarkerId = `ArrowMarker${arrowLength}x${arrowWidth}-${color}`;
    let marker = SVG(`#${arrowMarkerId}`) as Marker;
    if (null === marker) {
      marker = this.markup.svgMarkup!.marker(arrowLength, arrowWidth).id(arrowMarkerId);
      marker.polygon([0, 0, arrowLength, arrowWidth * 0.5, 0, arrowWidth]);
      marker.attr("orient", "auto-start-reverse");
      marker.attr("overflow", "visible"); // Don't clip the stroke that is being applied to allow the specified start/end to be used directly while hiding the arrow tail fully under the arrow head...
      marker.attr("refX", arrowLength);
      marker.css({ stroke: color, fill: color });
    }
    return marker;
  }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const vec = start.vectorTo(end);
    if (!vec.normalizeInPlace())
      return;
    const element = svgMarkup.line(start.x, start.y, end.x, end.y);
    this.setCurrentStyle(element, false);
    const marker = this.getOrCreateArrowMarker(element.css("stroke"));
    const addToStart = ("start" === this._arrowPos || "both" === this._arrowPos);
    const addToEnd = ("end" === this._arrowPos || "both" === this._arrowPos);
    if (addToStart)
      element.marker("start", marker);
    if (addToEnd || !addToStart)
      element.marker("end", marker);
    if (!isDynamics)
      this.onAdded(element);
  }
}

/** Tool for measuring distances and placing Markups of them
 * @public
 */
export class DistanceTool extends ArrowTool {
  public static override toolId = "Markup.Distance";
  public static override iconSpec = "icon-distance";
  protected readonly _startPointWorld = new Point3d();

  protected override showPrompt(): void { this.provideToolAssistance(CoreTools.tools + (0 === this._points.length ? "ElementSet.Prompts.StartPoint" : "ElementSet.Prompts.EndPoint")); }
  protected override setupAndPromptForNextAction(): void { IModelApp.accuSnap.enableSnap(true); IModelApp.toolAdmin.toolState.coordLockOvr = CoordinateLockOverrides.None; super.setupAndPromptForNextAction(); }

  protected getFormattedDistance(distance: number): string | undefined {
    const formatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(QuantityType.Length);
    if (undefined === formatterSpec)
      return undefined;
    return IModelApp.quantityFormatter.formatQuantity(distance, formatterSpec);
  }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[1];
    const vec = start.vectorTo(end);
    if (!vec.normalizeInPlace())
      return;
    const formatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(QuantityType.Length);
    if (undefined === formatterSpec)
      return;

    const distanceLine = svgMarkup.line(start.x, start.y, end.x, end.y);
    this.setCurrentStyle(distanceLine, false);
    const marker = this.getOrCreateArrowMarker(distanceLine.css("stroke"));
    distanceLine.marker("start", marker);
    distanceLine.marker("end", marker);

    const loc = start.interpolate(0.5, end);
    const distance = IModelApp.quantityFormatter.formatQuantity(this._startPointWorld.distance(ev.point), formatterSpec);
    const text = svgMarkup.plain(distance).addClass(MarkupApp.textClass).attr("text-anchor", "middle").translate(loc.x, loc.y);
    this.setCurrentTextStyle(text);
    const textWithBg = this.createBoxedText(svgMarkup, text);

    if (!isDynamics) {
      const markup = this.markup;
      const undo = markup.undo;
      undo.performOperation(this.keyin, () => { undo.onAdded(distanceLine); undo.onAdded(textWithBg); });
      markup.selected.restart(textWithBg); // Select text+box so that user can freely position relative to distance line...
    }
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === await IModelApp.quantityFormatter.getFormatterSpecByQuantityType(QuantityType.Length)) {
      this.onReinitialize();
      return EventHandled.No;
    }
    if (0 === this._points.length)
      this._startPointWorld.setFrom(ev.point);
    return super.onDataButtonDown(ev);
  }
}

/** Tool for placing Markup freehand sketches
 * @public
 */
export class SketchTool extends RedlineTool {
  public static override toolId = "Markup.Sketch";
  public static override iconSpec = "icon-draw";
  protected _minDistSquared = 100;

  protected override showPrompt(): void { this.provideToolAssistance(CoreTools.tools + (0 === this._points.length ? "ElementSet.Prompts.StartPoint" : "ElementSet.Prompts.EndPoint")); }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (this._points.length < (isDynamics ? this._nRequiredPoints - 1 : this._nRequiredPoints))
      return;
    const pts: number[] = [];
    const evPt = MarkupApp.convertVpToVb(ev.viewPoint);
    this._points.forEach((pt) => { pts.push(pt.x); pts.push(pt.y); });
    if (isDynamics && !evPt.isAlmostEqualXY(this._points[this._points.length - 1])) { pts.push(evPt.x); pts.push(evPt.y); }
    const isClosed = (this._points.length > 2 && (this._points[0].distanceSquaredXY(isDynamics ? evPt : this._points[this._points.length - 1]) < this._minDistSquared * 2));
    const element = isClosed ? svgMarkup.polygon(pts) : svgMarkup.polyline(pts);
    this.setCurrentStyle(element, isClosed);
    if (!isDynamics)
      this.onAdded(element);
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    const evPt = MarkupApp.convertVpToVb(ev.viewPoint);
    if (undefined !== ev.viewport && this._points.length > 0 && evPt.distanceSquaredXY(this._points[this._points.length - 1]) > this._minDistSquared)
      this._points.push(evPt);
    super.onMouseMotion(ev); // eslint-disable-line @typescript-eslint/no-floating-promises
  }
}

/** Tool for placing SVG symbols on a Markup
 * @public
 */
export class SymbolTool extends RedlineTool {
  public static override toolId = "Markup.Symbol";
  public static override iconSpec = "icon-symbol";
  protected _symbol?: MarkupElement;

  constructor(protected _symbolData?: string, protected _applyCurrentStyle?: boolean) { super(); }

  public override onInstall(): boolean { if (undefined === this._symbolData) return false; return super.onInstall(); }
  protected override showPrompt(): void { this.provideToolAssistance(0 === this._points.length ? (`${MarkupTool.toolKey}Symbol.Prompts.FirstPoint`) : `${CoreTools.tools}ElementSet.Prompts.OppositeCorner`, true); }

  protected override createMarkup(svgMarkup: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (undefined === this._symbolData)
      return;
    if (this._points.length < this._minPoints)
      return;
    const start = this._points[0];
    const end = isDynamics ? MarkupApp.convertVpToVb(ev.viewPoint) : this._points[this._points.length - 1];
    const vec = start.vectorTo(end);
    const width = Math.abs(vec.x);
    const height = Math.abs(vec.y);
    if ((width < 10 || height < 10) && (isDynamics || this._points.length !== this._minPoints))
      return;
    if (undefined === this._symbol) {
      const symbol = svgMarkup.group().svg(this._symbolData); // creating group instead of using symbol because of inability to flash/hilite multi-color symbol instance...
      if (0 === symbol.children().length) {
        symbol.remove();
        this._symbolData = undefined;
      }
      try { symbol.flatten(symbol); } catch { }
      this._symbol = symbol;
    } else if (!isDynamics) {
      svgMarkup.add(this._symbol);
    }
    const offset = Point3d.create(vec.x < 0 ? end.x : start.x, vec.y < 0 ? end.y : start.y); // define location by corner points...
    if (!isDynamics && this._points.length === this._minPoints)
      this._symbol.size(ev.viewport!.viewRect.width * 0.1).center(offset.x, offset.y);
    else if (!ev.isShiftKey)
      this._symbol.size(width).move(offset.x, offset.y);
    else
      this._symbol.size(width, height).move(offset.x, offset.y);
    if (this._applyCurrentStyle) {
      const active = MarkupApp.props.active; // Apply color and transparency only; using active stroke-width, etc. for pre-defined symbols is likely undesirable...
      this._symbol.forElementsOfGroup((child) => {
        const css = window.getComputedStyle(child.node);
        const toValue = (val: string | null, newVal: string) => (!val || val === "none") ? "none" : newVal;
        child.css({ "fill": toValue(css.fill, active.element.fill), "stroke": toValue(css.stroke, active.element.stroke), "fill-opacity": active.element["fill-opacity"], "stroke-opacity": active.element["stroke-opacity"] });
      });
    }
    if (!isDynamics)
      this.onAdded(this._symbol);
  }

  public override async onDataButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport || this._points.length !== this._minPoints)
      return EventHandled.No;

    this.createMarkup(this.markup.svgMarkup!, ev, false);
    this.onReinitialize();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  protected override clearDynamicsMarkup(isDynamics: boolean): void {
    if (!isDynamics)
      super.clearDynamicsMarkup(isDynamics); // For dynamics we don't create a new symbol each frame, we just set the width/height...
  }
}
