/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Frontstage
 */

// cSpell:ignore popout

import * as React from "react";
import { IModelApp, ScreenViewport } from "@bentley/imodeljs-frontend";
import { StagePanelLocation, StageUsage, UiError } from "@bentley/ui-abstract";
import {
  dockWidgetContainer, findTab, findWidget, floatWidget, isFloatingLocation, isPopoutLocation, isPopoutWidgetLocation,
  NineZoneManagerProps, NineZoneState, popoutWidgetToChildWindow,
} from "@bentley/ui-ninezone";
import { ContentControl } from "../content/ContentControl";
import { ContentGroup, ContentGroupManager } from "../content/ContentGroup";
import { ContentLayoutDef } from "../content/ContentLayout";
import { ContentLayoutManager } from "../content/ContentLayoutManager";
import { ContentViewManager } from "../content/ContentViewManager";
import { ToolItemDef } from "../shared/ToolItemDef";
import { StagePanelDef } from "../stagepanels/StagePanelDef";
import { UiFramework } from "../UiFramework";
import { WidgetControl } from "../widgets/WidgetControl";
import { WidgetDef } from "../widgets/WidgetDef";
import { ZoneLocation } from "../zones/Zone";
import { ZoneDef } from "../zones/ZoneDef";
import { Frontstage, FrontstageProps } from "./Frontstage";
import { FrontstageManager } from "./FrontstageManager";
import { FrontstageProvider } from "./FrontstageProvider";
import { TimeTracker } from "../configurableui/TimeTracker";
import { PointProps, SizeProps } from "@bentley/ui-core";
import { ChildWindowLocationProps } from "../childwindow/ChildWindowManager";
import { PopoutWidget } from "../childwindow/PopoutWidget";
import { setImmediate } from "timers";
import { saveFrontstagePopoutWidgetSizeAndPosition } from "../widget-panels/Frontstage";

/** @internal */
export interface FrontstageEventArgs {
  frontstageDef: FrontstageDef;
}

/** @internal */
export interface FrontstageNineZoneStateChangedEventArgs extends FrontstageEventArgs {
  state: NineZoneState | undefined;
}

/** FrontstageDef class provides an API for a Frontstage.
 * @public
 */
export class FrontstageDef {
  private _id: string = "";
  private _defaultTool?: ToolItemDef;
  private _defaultLayoutId: string = "";
  private _defaultContentId: string = "";
  private _contentGroupId: string = "";
  private _isInFooterMode: boolean = true;
  private _isStageClosing = false;
  private _isApplicationClosing = false;
  private _applicationData?: any;
  private _usage?: string;
  private _version: number = 0;
  private _topLeft?: ZoneDef;
  private _topCenter?: ZoneDef;
  private _topRight?: ZoneDef;
  private _centerLeft?: ZoneDef;
  private _centerRight?: ZoneDef;
  private _bottomLeft?: ZoneDef;
  private _bottomCenter?: ZoneDef;
  private _bottomRight?: ZoneDef;
  private _topPanel?: StagePanelDef;
  private _topMostPanel?: StagePanelDef;
  private _leftPanel?: StagePanelDef;
  private _rightPanel?: StagePanelDef;
  private _bottomPanel?: StagePanelDef;
  private _bottomMostPanel?: StagePanelDef;
  private _defaultLayout?: ContentLayoutDef;
  private _contentLayoutDef?: ContentLayoutDef;
  private _contentGroup?: ContentGroup;
  private _frontstageProvider?: FrontstageProvider;
  private _nineZone?: NineZoneManagerProps;
  private _timeTracker: TimeTracker = new TimeTracker();
  private _nineZoneState?: NineZoneState;

  public get id(): string { return this._id; }
  public get defaultTool(): ToolItemDef | undefined { return this._defaultTool; }
  public get defaultLayoutId(): string { return this._defaultLayoutId; }
  public get defaultContentId(): string { return this._defaultContentId; }
  public get contentGroupId(): string { return this._contentGroupId; }
  public get isInFooterMode(): boolean { return this._isInFooterMode; }
  public get applicationData(): any | undefined { return this._applicationData; }
  public get usage(): string { return this._usage !== undefined ? this._usage : StageUsage.General; }
  public get version(): number { return this._version; }

  public get topLeft(): ZoneDef | undefined { return this._topLeft; }
  public get topCenter(): ZoneDef | undefined { return this._topCenter; }
  public get topRight(): ZoneDef | undefined { return this._topRight; }
  public get centerLeft(): ZoneDef | undefined { return this._centerLeft; }
  public get centerRight(): ZoneDef | undefined { return this._centerRight; }
  public get bottomLeft(): ZoneDef | undefined { return this._bottomLeft; }
  public get bottomCenter(): ZoneDef | undefined { return this._bottomCenter; }
  public get bottomRight(): ZoneDef | undefined { return this._bottomRight; }

  /** @beta */
  public get topPanel(): StagePanelDef | undefined { return this._topPanel; }
  /** @beta
   * @deprecated Only topPanel is supported in UI 2.0 */
  public get topMostPanel(): StagePanelDef | undefined { return this._topMostPanel; }
  /** @beta */
  public get leftPanel(): StagePanelDef | undefined { return this._leftPanel; }
  /** @beta */
  public get rightPanel(): StagePanelDef | undefined { return this._rightPanel; }
  /** @beta */
  public get bottomPanel(): StagePanelDef | undefined { return this._bottomPanel; }
  /** @beta
   * @deprecated Only bottomPanel is supported in UI 2.0  */
  public get bottomMostPanel(): StagePanelDef | undefined { return this._bottomMostPanel; }

  public get defaultLayout(): ContentLayoutDef | undefined { return this._defaultLayout; }
  public get contentLayoutDef(): ContentLayoutDef | undefined { return this._contentLayoutDef; }
  public get contentGroup(): ContentGroup | undefined { return this._contentGroup; }
  public get frontstageProvider(): FrontstageProvider | undefined { return this._frontstageProvider; }

  /** @internal */
  public get nineZone(): NineZoneManagerProps | undefined { return this._nineZone; }
  public set nineZone(props: NineZoneManagerProps | undefined) { this._nineZone = props; }

  /** @internal */
  public get nineZoneState(): NineZoneState | undefined { return this._nineZoneState; }
  public set nineZoneState(state: NineZoneState | undefined) {
    if (this._nineZoneState === state)
      return;
    this._nineZoneState = state;
    // istanbul ignore else
    if (!(this._isStageClosing || this._isApplicationClosing)) {
      FrontstageManager.onFrontstageNineZoneStateChangedEvent.emit({
        frontstageDef: this,
        state,
      });
    }
  }

  /** @internal */
  public get timeTracker(): TimeTracker { return this._timeTracker; }

  /** Constructs the [[FrontstageDef]]  */
  constructor(props?: FrontstageProps) {
    if (props)
      this.initializeFromProps(props);
  }

  /** Handles when the Frontstage becomes activated */
  protected _onActivated(): void { }

  /** Handles when the Frontstage becomes activated */
  public onActivated(): void {
    this.updateWidgetDefs();

    this._contentLayoutDef = this.defaultLayout;

    if (!this._contentLayoutDef) {
      this._contentLayoutDef = ContentLayoutManager.findLayout(this.defaultLayoutId);
      if (!this._contentLayoutDef)
        throw new UiError(UiFramework.loggerCategory(this), `onActivated: Content Layout '${this.defaultLayoutId}' not registered`);
    }

    if (!this._contentGroup) {
      this._contentGroup = ContentGroupManager.findGroup(this.contentGroupId);
      if (!this._contentGroup)
        throw new UiError(UiFramework.loggerCategory(this), `onActivated: Content Group '${this.contentGroupId}' not registered`);
    }

    FrontstageManager.onContentLayoutActivatedEvent.emit({ contentLayout: this._contentLayoutDef, contentGroup: this._contentGroup });

    this._timeTracker.startTiming();

    this._onActivated();
  }

  /** Handles when the Frontstage becomes inactive */
  protected _onDeactivated(): void { }

  /** Handles when the Frontstage becomes inactive */
  public onDeactivated(): void {
    for (const control of this._widgetControls) {
      control.onFrontstageDeactivated();
    }

    for (const control of this.contentControls) {
      control.onFrontstageDeactivated();
    }

    if (this.contentGroup)
      this.contentGroup.onFrontstageDeactivated();

    this._timeTracker.stopTiming();

    this._isStageClosing = true; // this keeps widgets in child windows from automatically re-docking
    UiFramework.childWindowManager.closeAllChildWindows();

    this._onDeactivated();
    this._isStageClosing = false;
  }

  /** @internal */
  public setIsApplicationClosing(value: boolean) {
    this._isApplicationClosing = value;
  }

  /** Returns once the contained widgets and content controls are ready to use */
  public async waitUntilReady(): Promise<void> {
    // create an array of control-ready promises
    const controlReadyPromises = new Array<Promise<void>>();
    this._widgetControls.forEach((control: WidgetControl) => {
      controlReadyPromises.push(control.isReady);
    });

    // istanbul ignore else
    if (this.contentLayoutDef) {
      const usedContentIndexes = this.contentLayoutDef.getUsedContentIndexes();
      this.contentControls.forEach((control: ContentControl, index: number) => {
        // istanbul ignore else
        if (usedContentIndexes.includes(index))
          controlReadyPromises.push(control.isReady);
      });
    }

    await Promise.all(controlReadyPromises);
    // Frontstage ready
  }

  /** Handles when the Frontstage becomes active */
  protected _onFrontstageReady(): void { }

  /** Handles when the Frontstage becomes active */
  public onFrontstageReady(): void {
    for (const control of this._widgetControls) {
      control.onFrontstageReady();
    }

    for (const control of this.contentControls) {
      control.onFrontstageReady();
    }

    // istanbul ignore else
    if (this.contentGroup)
      this.contentGroup.onFrontstageReady();

    this._onFrontstageReady();
  }

  /** Starts the default tool for the Frontstage */
  public startDefaultTool(): void {
    // Start the default tool
    // istanbul ignore next
    if (this.defaultTool && IModelApp.toolAdmin && IModelApp.viewManager) {
      IModelApp.toolAdmin.defaultToolId = this.defaultTool.toolId;
      this.defaultTool.execute();
    }
  }

  /** Sets the Content Layout and Content Group */
  public setContentLayoutAndGroup(contentLayoutDef: ContentLayoutDef, contentGroup: ContentGroup): void {
    this._contentLayoutDef = contentLayoutDef;
    this._contentGroup = contentGroup;
  }

  /** Sets the active view content control to the default or first */
  public setActiveContent(): boolean {
    let contentControl: ContentControl | undefined;
    let activated = false;

    if (this.contentGroup && this.defaultContentId) {
      contentControl = this.contentGroup.getContentControlById(this.defaultContentId);
    }

    // istanbul ignore else
    if (!contentControl && this.contentControls.length >= 0) {
      contentControl = this.contentControls[0];
    }

    if (contentControl) {
      ContentViewManager.setActiveContent(contentControl.reactNode, true);
      if (contentControl.viewport)
        IModelApp.viewManager.setSelectedView(contentControl.viewport);
      activated = true;
    }

    return activated;
  }

  /** Sets the active view content control */
  public setActiveView(newContent: ContentControl, oldContent?: ContentControl): void {
    if (oldContent)
      oldContent.onDeactivated();
    newContent.onActivated();
    FrontstageManager.onContentControlActivatedEvent.emit({ activeContentControl: newContent, oldContentControl: oldContent });
  }

  /** Sets the active view content control based on the selected viewport. */
  public setActiveViewFromViewport(viewport: ScreenViewport): boolean {
    const contentControl = this.contentControls.find((control: ContentControl) => control.viewport === viewport);
    // istanbul ignore else
    if (contentControl) {
      ContentViewManager.setActiveContent(contentControl.reactNode, true);
      return true;
    }

    // istanbul ignore next
    return false;
  }

  /** Gets a [[ZoneDef]] based on a given zone id */
  public getZoneDef(zoneId: number): ZoneDef | undefined {
    let zoneDef;

    switch (zoneId) {
      case 1:
        zoneDef = this.topLeft;
        break;
      case 2:
        zoneDef = this.topCenter;
        break;
      case 3:
        zoneDef = this.topRight;
        break;
      case 4:
        zoneDef = this.centerLeft;
        break;
      case 6:
        zoneDef = this.centerRight;
        break;
      case 7:
        zoneDef = this.bottomLeft;
        break;
      case 8:
        zoneDef = this.bottomCenter;
        break;
      case 9:
        zoneDef = this.bottomRight;
        break;
      // istanbul ignore next
      default:
        throw new RangeError();
    }

    // Zones can be undefined in a Frontstage

    return zoneDef;
  }

  /** Gets a list of [[ZoneDef]]s */
  public get zoneDefs(): ZoneDef[] {
    const zones = [1, 2, 3, 4, 6, 7, 8, 9];
    const zoneDefs: ZoneDef[] = [];

    zones.forEach((zoneId) => {
      const zoneDef = this.getZoneDef(zoneId);
      if (zoneDef)
        zoneDefs.push(zoneDef);
    });

    return zoneDefs;
  }

  /** Gets a [[StagePanelDef]] based on a given panel location
   * @beta
   */
  public getStagePanelDef(location: StagePanelLocation): StagePanelDef | undefined {
    let panelDef: StagePanelDef | undefined;

    switch (location) {
      case StagePanelLocation.Top:
        panelDef = this.topPanel;
        break;
      case StagePanelLocation.TopMost:
        panelDef = this.topMostPanel; // eslint-disable-line deprecation/deprecation
        break;
      case StagePanelLocation.Left:
        panelDef = this.leftPanel;
        break;
      case StagePanelLocation.Right:
        panelDef = this.rightPanel;
        break;
      case StagePanelLocation.Bottom:
        panelDef = this.bottomPanel;
        break;
      case StagePanelLocation.BottomMost:
        panelDef = this.bottomMostPanel; // eslint-disable-line deprecation/deprecation
        break;
      // istanbul ignore next
      default:
        throw new RangeError();
    }

    // Panels can be undefined in a Frontstage

    return panelDef;
  }

  /** Gets a list of [[StagePanelDef]]s
   * @beta
   */
  public get panelDefs(): StagePanelDef[] {
    const panels = [
      StagePanelLocation.Left, StagePanelLocation.Right,
      StagePanelLocation.Top, StagePanelLocation.TopMost,
      StagePanelLocation.Bottom, StagePanelLocation.BottomMost,
    ];
    const panelDefs: StagePanelDef[] = [];

    panels.forEach((location: StagePanelLocation) => {
      const panelDef = this.getStagePanelDef(location);
      if (panelDef)
        panelDefs.push(panelDef);
    });

    return panelDefs;
  }

  /** Finds a [[WidgetDef]] based on a given id */
  public findWidgetDef(id: string): WidgetDef | undefined {
    for (const zoneDef of this.zoneDefs) {
      const widgetDef = zoneDef.findWidgetDef(id);
      if (widgetDef)
        return widgetDef;
    }

    for (const panelDef of this.panelDefs) {
      const widgetDef = panelDef.findWidgetDef(id);
      if (widgetDef)
        return widgetDef;
    }

    // istanbul ignore next
    return undefined;
  }

  /** Gets the list of [[WidgetControl]]s */
  private get _widgetControls(): WidgetControl[] {
    const widgetControls = new Array<WidgetControl>();

    this.zoneDefs.forEach((zoneDef: ZoneDef) => {
      zoneDef.widgetDefs.forEach((widgetDef: WidgetDef) => {
        const widgetControl = widgetDef.widgetControl;
        if (widgetControl)
          widgetControls.push(widgetControl);
      });
    });

    this.panelDefs.forEach((panelDef: StagePanelDef) => {
      panelDef.widgetDefs.forEach((widgetDef: WidgetDef) => {
        const widgetControl = widgetDef.widgetControl;
        // istanbul ignore if
        if (widgetControl)
          widgetControls.push(widgetControl);
      });
    });

    return widgetControls;
  }

  /** Gets the list of [[ContentControl]]s */
  public get contentControls(): ContentControl[] {
    if (this.contentGroup) {
      return this.contentGroup.getContentControls();
    }
    return [];
  }

  /**
   * Initializes this [[FrontstageDef]] from a [[FrontstageProvider]]
   * @param frontstageProvider The FrontstageProvider to initialize from
   */
  public initializeFromProvider(frontstageProvider: FrontstageProvider) {
    // istanbul ignore else
    if (frontstageProvider.frontstage && React.isValidElement(frontstageProvider.frontstage)) {
      Frontstage.initializeFrontstageDef(this, frontstageProvider.frontstage.props);
      this._frontstageProvider = frontstageProvider;
    }
  }

  /** Initializes a FrontstageDef from FrontstageProps
   * @internal
   */
  public initializeFromProps(props: FrontstageProps): void {
    this._id = props.id;

    this._defaultTool = props.defaultTool;

    if (props.defaultContentId !== undefined)
      this._defaultContentId = props.defaultContentId;

    if (typeof props.defaultLayout === "string")
      this._defaultLayoutId = props.defaultLayout;
    else
      this._defaultLayout = props.defaultLayout;

    if (typeof props.contentGroup === "string")
      this._contentGroupId = props.contentGroup;
    else
      this._contentGroup = props.contentGroup;

    if (props.isInFooterMode !== undefined)
      this._isInFooterMode = props.isInFooterMode;
    if (props.applicationData !== undefined)
      this._applicationData = props.applicationData;

    this._usage = props.usage;
    this._version = props.version || 0;

    // eslint-disable-next-line deprecation/deprecation
    this._topLeft = Frontstage.createZoneDef(props.contentManipulationTools ? props.contentManipulationTools : props.topLeft, ZoneLocation.TopLeft, props);
    // eslint-disable-next-line deprecation/deprecation
    this._topCenter = Frontstage.createZoneDef(props.toolSettings ? props.toolSettings : props.topCenter, ZoneLocation.TopCenter, props);
    // eslint-disable-next-line deprecation/deprecation
    this._topRight = Frontstage.createZoneDef(props.viewNavigationTools ? /* istanbul ignore next */ props.viewNavigationTools : props.topRight, ZoneLocation.TopRight, props);
    // eslint-disable-next-line deprecation/deprecation
    this._centerLeft = Frontstage.createZoneDef(props.centerLeft, ZoneLocation.CenterLeft, props);
    // eslint-disable-next-line deprecation/deprecation
    this._centerRight = Frontstage.createZoneDef(props.centerRight, ZoneLocation.CenterRight, props);
    // eslint-disable-next-line deprecation/deprecation
    this._bottomLeft = Frontstage.createZoneDef(props.bottomLeft, ZoneLocation.BottomLeft, props);
    // eslint-disable-next-line deprecation/deprecation
    this._bottomCenter = Frontstage.createZoneDef(props.statusBar ? props.statusBar : props.bottomCenter, ZoneLocation.BottomCenter, props);
    // eslint-disable-next-line deprecation/deprecation
    this._bottomRight = Frontstage.createZoneDef(props.bottomRight, ZoneLocation.BottomRight, props);
    // eslint-disable-next-line deprecation/deprecation

    this._topPanel = Frontstage.createStagePanelDef(StagePanelLocation.Top, props);
    this._topMostPanel = Frontstage.createStagePanelDef(StagePanelLocation.TopMost, props);
    this._leftPanel = Frontstage.createStagePanelDef(StagePanelLocation.Left, props);
    this._rightPanel = Frontstage.createStagePanelDef(StagePanelLocation.Right, props);
    this._bottomPanel = Frontstage.createStagePanelDef(StagePanelLocation.Bottom, props);
    this._bottomMostPanel = Frontstage.createStagePanelDef(StagePanelLocation.BottomMost, props);
  }

  /** @internal */
  public updateWidgetDefs(): void {
    // Tracks provided widgets to prevent duplicates.
    const widgetDefs: WidgetDef[] = [];

    // Process panels before zones so in uiVersion="2" extension can explicitly target a widget for a StagePanelSection
    this.panelDefs.forEach((panelDef: StagePanelDef) => {
      panelDef.updateDynamicWidgetDefs(this.id, this.usage, panelDef.location, undefined, widgetDefs);
    });

    this.zoneDefs.forEach((zoneDef: ZoneDef) => {
      zoneDef.updateDynamicWidgetDefs(this.id, this.usage, zoneDef.zoneLocation, undefined, widgetDefs);
    });
  }

  /** @beta */
  public restoreLayout() {
    for (const zoneDef of this.zoneDefs) {
      for (const widgetDef of zoneDef.widgetDefs) {
        widgetDef.setWidgetState(widgetDef.defaultState);
      }
    }
    for (const panelDef of this.panelDefs) {
      panelDef.size = panelDef.defaultSize;
      panelDef.panelState = panelDef.defaultState;
      for (const widgetDef of panelDef.widgetDefs) {
        widgetDef.setWidgetState(widgetDef.defaultState);
      }
    }
    FrontstageManager.onFrontstageRestoreLayoutEvent.emit({ frontstageDef: this });
  }

  public isPopoutWidget(widgetId: string) {
    // istanbul ignore else
    if (this.nineZoneState) {
      const location = findTab(this.nineZoneState, widgetId);
      // istanbul ignore else
      if (location)
        return isPopoutLocation(location);
    }

    return false;
  }

  public isFloatingWidget(widgetId: string) {
    // istanbul ignore else
    if (this.nineZoneState) {
      const location = findTab(this.nineZoneState, widgetId);
      // istanbul ignore else
      if (location)
        return isFloatingLocation(location);
    }

    return false;
  }

  /** Create a new floating panel that contains the widget specified by its Id. Supported only when in
   *  UI 2.0 or higher.
   * @param widgetId case sensitive Wigdet Id
   * @param point Position of top left corner of floating panel in pixels. If undefined {x:50, y:100} is used.
   * @param size defines the width and height of the floating panel. If undefined and widget has been floated before
   * the previous size is used, else {height:400, width:400} is used.
   * @beta
   */
  public floatWidget(widgetId: string, point?: PointProps, size?: SizeProps) {
    // istanbul ignore else
    if (this.nineZoneState) {
      const location = findTab(this.nineZoneState, widgetId);
      if (location) {
        let popoutWidgetContainerId: string | undefined;
        if (isPopoutLocation(location)) {
          popoutWidgetContainerId = location.popoutWidgetId;
        }
        const state = floatWidget(this.nineZoneState, widgetId, point, size);
        // istanbul ignore else
        if (state) {
          this.nineZoneState = state;
          setImmediate(() => {
            popoutWidgetContainerId && UiFramework.childWindowManager.closeChildWindow(popoutWidgetContainerId, true);
          });
        }
      }
    }
  }

  /** Opens window for specified PopoutWidget container. Used to reopen popout when running in Electron.
   * @internal */
  public openPopoutWidgetContainer(state: NineZoneState, widgetContainerId: string) {
    const location = findWidget(state, widgetContainerId);
    // istanbul ignore else
    if (location && isPopoutWidgetLocation(location) && 1 === state.widgets[widgetContainerId].tabs.length) {
      // NOTE: Popout Widget Container will only contain a single WidgetTab
      const widgetDef = this.findWidgetDef(state.widgets[widgetContainerId].tabs[0]);
      // istanbul ignore else
      if (widgetDef) {
        const tab = state.tabs[widgetDef.id];
        const popoutContent = (<PopoutWidget widgetContainerId={widgetContainerId} widgetDef={widgetDef} />);
        const position: ChildWindowLocationProps = {
          width: tab.preferredPopoutWidgetSize?.width ?? 600,
          height: tab.preferredPopoutWidgetSize?.height ?? 800,
          left: tab.preferredPopoutWidgetSize?.x ?? 0,
          top: tab.preferredPopoutWidgetSize?.y ?? 0,
        };
        UiFramework.childWindowManager.openChildWindow(widgetContainerId, widgetDef.label, popoutContent, position, UiFramework.useDefaultPopoutUrl);
      }
    }
  }

  /** Create a new popout/child window that contains the widget specified by its Id. Supported only when in
   *  UI 2.0 or higher.
   * @param widgetId case sensitive Widget Id
   * @param point Position of top left corner of floating panel in pixels. If undefined {x:0, y:0} is used.
   * @param size defines the width and height of the floating panel. If undefined and widget has been floated before
   * the previous size is used, else {height:800, width:600} is used.
   * @beta
   */
  public popoutWidget(widgetId: string, point?: PointProps, size?: SizeProps) {
    // istanbul ignore else
    if (this.nineZoneState) {
      let location = findTab(this.nineZoneState, widgetId);
      // istanbul ignore else
      if (location) {
        if (isPopoutLocation(location))
          return;

        // get the state to apply that will pop-out the specified WidgetTab to child window.
        const state = popoutWidgetToChildWindow(this.nineZoneState, widgetId, point, size);
        // istanbul ignore else
        if (state) {
          // now that the state is updated get the id of the container that houses the widgetTab/widgetId
          location = findTab(state, widgetId);
          // istanbul ignore else
          if (location && isPopoutLocation(location)) {
            const widgetDef = this.findWidgetDef(widgetId);
            // istanbul ignore else
            if (widgetDef) {
              const widgetContainerId = location.widgetId;
              const tab = state.tabs[widgetId];
              this.nineZoneState = state;
              setImmediate(() => {
                const popoutContent = (<PopoutWidget widgetContainerId={widgetContainerId} widgetDef={widgetDef} />);
                const position: ChildWindowLocationProps = {
                  width: tab.preferredPopoutWidgetSize!.width,  // preferredPopoutWidgetSize set in popoutWidgetToChildWindow method above
                  height: tab.preferredPopoutWidgetSize!.height,
                  left: tab.preferredPopoutWidgetSize!.x,
                  top: tab.preferredPopoutWidgetSize!.y,
                };
                UiFramework.childWindowManager.openChildWindow(widgetContainerId, widgetDef.label, popoutContent, position, UiFramework.useDefaultPopoutUrl);
              });
            }
          }
        }
      }
    }
  }

  public get isStageClosing() {
    return this._isStageClosing;
  }

  public get isApplicationClosing() {
    return this._isApplicationClosing;
  }

  /** @internal */
  public async saveChildWindowSizeAndPosition(childWindowId: string, childWindow: Window) {
    // istanbul ignore else
    if (this.nineZoneState) {
      const newState = await saveFrontstagePopoutWidgetSizeAndPosition(this.nineZoneState, this.id, this.version, childWindowId, childWindow);
      this._nineZoneState = newState; // set without triggering new render as only preferred floating position set
    }
  }

  /** Method used to possibly change a Popout Wigdet back to a docked widget if the user was the one closing the popout's child
   * window (i.e. UiFramework.childWindowManager.isClosingChildWindow === false).
   *  @internal
   */
  public dockPopoutWidgetContainer(widgetContainerId: string) {
    if (this.nineZoneState) {
      const location = findWidget(this.nineZoneState, widgetContainerId);
      // Make sure the widgetContainerId is still in popout state. We don't want to set it to docked if the window is being closed because
      // an API call has moved the widget from a popout state to a floating state.
      // istanbul ignore else
      if (location && isPopoutWidgetLocation(location)) {
        const state = dockWidgetContainer(this.nineZoneState, widgetContainerId, true);
        state && (this.nineZoneState = state);
      }
    }
  }

  /** Finds the container with the specified widget and re-docks all widgets
   * back to the panel zone location that was used when the floating container
   * was generated. Supported only when in UI 2.0 or higher.
   * @param widgetId  case sensitive Wigdet Id.
   * @beta
   */
  public dockWidgetContainer(widgetId: string) {
    // istanbul ignore else
    if (this.nineZoneState) {
      const location = findTab(this.nineZoneState, widgetId);
      if (location) {
        const widgetContainerId = location.widgetId;
        const state = dockWidgetContainer(this.nineZoneState, widgetContainerId, true);
        state && (this.nineZoneState = state);
        if (isPopoutLocation(location)) {
          UiFramework.childWindowManager.closeChildWindow(location.widgetId, true);
        }
      }
    }
  }
}
