/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Frontstage
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { Logger } from "@bentley/bentleyjs-core";
import { StagePanelLocation, UiItemProviderRegisteredEventArgs, UiItemsManager, WidgetState } from "@bentley/ui-abstract";
import { CommonProps, Rectangle } from "@bentley/ui-core";
import {
  HorizontalAnchor, Zones as NZ_Zones, StagePanels, StagePanelsManager, ToolSettingsWidgetMode, WidgetZoneId, widgetZoneIds, ZoneManagerProps,
  ZonesManagerProps,
} from "@bentley/ui-ninezone";
import { ContentGroup } from "../content/ContentGroup";
import { ContentLayout, ContentLayoutDef } from "../content/ContentLayout";
import { ToolItemDef } from "../shared/ToolItemDef";
import { getNestedStagePanelKey, StagePanelProps, StagePanelRuntimeProps } from "../stagepanels/StagePanel";
import { StagePanelDef } from "../stagepanels/StagePanelDef";
import { UiFramework, UiVisibilityEventArgs } from "../UiFramework";
import { UiShowHideManager } from "../utils/UiShowHideManager";
import { ToolSettingsContent } from "../widgets/ToolSettingsContent";
import { WidgetDef, WidgetStateChangedEventArgs } from "../widgets/WidgetDef";
import { WidgetProvidersChangedEventArgs, WidgetsChangedEventArgs } from "../widgets/WidgetManager";
import { isToolSettingsWidgetManagerProps, Zone, ZoneLocation, ZoneProps, ZoneRuntimeProps } from "../zones/Zone";
import { ZoneDef } from "../zones/ZoneDef";
import { FrontstageRuntimeProps, ZoneDefProvider } from "./FrontstageComposer";
import { FrontstageDef } from "./FrontstageDef";
import { FrontstageActivatedEventArgs, FrontstageManager } from "./FrontstageManager";

/** Properties for a [[Frontstage]] component.
 * @public
 */
export interface FrontstageProps extends CommonProps {
  /** Id for the Frontstage */
  id: string;
  /** Tool that is started once the Frontstage is activated */
  defaultTool: ToolItemDef;
  /** The default Content Layout used */
  defaultLayout: string | ContentLayoutDef;
  /** The Content Group providing the Content Views */
  contentGroup: string | ContentGroup;
  /** Id of the Content View to be activated initially */
  defaultContentId?: string;
  /** Indicated whether the StatusBar is in footer mode or widget mode. Defaults to true. */
  isInFooterMode?: boolean;                     // Default - true
  /** Any application data to attach to this Frontstage. */
  applicationData?: any;
  /** Usage type for this Frontstage. */
  usage?: string;
  /** Frontstage version. Used to force saved layout reinitialization after changes to frontstage.
   * @note This value should be increased when changes are made to Frontstage.
   * Increasing the value will make sure to reinitialize App layout instead of restoring to old layout.
   * Version increase is required when widgets are added/removed.
   */
  version?: number;

  /** The Zone in the top-left corner. @deprecated Use 'contentManipulationTools' property. */
  topLeft?: React.ReactElement<ZoneProps>;
  /** The Zone along the top-center edge. @deprecated Use 'toolSettings' property. */
  topCenter?: React.ReactElement<ZoneProps>;
  /** The Zone in the top-right corner. @deprecated Use 'viewNavigationTools' property. */
  topRight?: React.ReactElement<ZoneProps>;
  /** The Zone along the center-left edge. @deprecated Place widgets in appropriate stage panel zone. */
  centerLeft?: React.ReactElement<ZoneProps>;
  /** The Zone along the center-right edge.  @deprecated  Place widgets in appropriate stage panel zone. */
  centerRight?: React.ReactElement<ZoneProps>;
  /** The Zone in the bottom-left corner.  @deprecated Place widgets in appropriate stage panel zone.  */
  bottomLeft?: React.ReactElement<ZoneProps>;
  /** The Zone along the bottom-center edge. @deprecated use statusBar property */
  bottomCenter?: React.ReactElement<ZoneProps>;
  /** The Zone in the bottom-right corner.  @deprecated Place widgets in appropriate stage panel zone. */
  bottomRight?: React.ReactElement<ZoneProps>;

  /** The Zone in the top-left corner that shows tools typically used to query and modify content. To be used in place of deprecated topLeft zone definition.  @beta */
  contentManipulationTools?: React.ReactElement<ZoneProps>;
  /** The Zone the that shows settings for the active tool. To be used in place of deprecated topCenter zone definition. @beta */
  toolSettings?: React.ReactElement<ZoneProps>;
  /** The Zone in the top-right corner that shows view navigation tools. To be used in place of deprecated topRight zone definition.  @beta */
  viewNavigationTools?: React.ReactElement<ZoneProps>;
  /** The status bar Zone shown as the application footer. To be used in place of deprecated bottomCenter zone definition.  @beta */
  statusBar?: React.ReactElement<ZoneProps>;

  /** The StagePanel on the top of the 9-zone area. @beta */
  topPanel?: React.ReactElement<StagePanelProps>;
  /** The StagePanel on the very top across the full width. @beta @deprecated Only topPanel is supported in UI 2.0 */
  topMostPanel?: React.ReactElement<StagePanelProps>;
  /** The StagePanel on the left. @beta  */
  leftPanel?: React.ReactElement<StagePanelProps>;
  /** The StagePanel on the right. @beta  */
  rightPanel?: React.ReactElement<StagePanelProps>;
  /** The StagePanel on the bottom of the 9-zone area. @beta  */
  bottomPanel?: React.ReactElement<StagePanelProps>;
  /** The StagePanel on the very bottom across the full width. @beta @deprecated Only bottomPanel is supported in UI 2.0  */
  bottomMostPanel?: React.ReactElement<StagePanelProps>;

  /** @internal */
  runtimeProps?: FrontstageRuntimeProps;
}

interface FrontstageState {
  isUiVisible: boolean;
  widgetIdToContent: Partial<{ [id in WidgetZoneId]: HTMLDivElement | undefined }>;
}

/** Frontstage React component.
 * A Frontstage is a full-screen configuration designed to enable the user to accomplish a task.
 * @public
 */
export class Frontstage extends React.Component<FrontstageProps, FrontstageState> {
  private static _zoneIds: ReadonlyArray<WidgetZoneId> = widgetZoneIds.filter((z) => z !== 8);
  private _contentRefs = new Map<WidgetZoneId, React.Ref<HTMLDivElement>>();
  private _zonesMeasurer = React.createRef<HTMLDivElement>();
  private _floatingZonesMeasurer = React.createRef<HTMLDivElement>();
  private _zonesStyle: React.CSSProperties = {
    pointerEvents: "none",
  };
  private _zonesFooterModeStyle: React.CSSProperties = {
    ...this._zonesStyle,
    display: "flex",
    flexFlow: "column",
  };

  /** @internal */
  constructor(props: FrontstageProps) {
    super(props);

    this.state = {
      isUiVisible: UiFramework.getIsUiVisible(),
      widgetIdToContent: {},
    };
  }

  /** React lifecycle method.
   * @internal
   */
  public override async componentDidMount() {
    UiFramework.onUiVisibilityChanged.addListener(this._uiVisibilityChanged);
    UiFramework.widgetManager.onWidgetsChanged.addListener(this._handleWidgetsChanged);
    UiFramework.widgetManager.onWidgetProvidersChanged.addListener(this._handleWidgetProvidersChanged);
    UiItemsManager.onUiProviderRegisteredEvent.addListener(this._handleUiProviderRegisteredEvent);
  }

  public override componentDidUpdate() {
    if (!this._zonesMeasurer.current || !this._floatingZonesMeasurer.current || !this.props.runtimeProps)
      return;
    let floatingBounds = Rectangle.create(this._floatingZonesMeasurer.current.getBoundingClientRect());
    const bounds = Rectangle.create(this._zonesMeasurer.current.getBoundingClientRect());
    const offset = bounds.topLeft().getOffsetTo(floatingBounds.topLeft());
    floatingBounds = floatingBounds.setPosition(offset);
    this.props.runtimeProps.nineZoneChangeHandler.handleZonesBoundsChange(bounds);
    this.props.runtimeProps.nineZoneChangeHandler.handleFloatingZonesBoundsChange(floatingBounds);
  }

  /** React lifecycle method.
   * @internal
   */
  public override componentWillUnmount() {
    UiFramework.onUiVisibilityChanged.removeListener(this._uiVisibilityChanged);
    UiFramework.widgetManager.onWidgetsChanged.removeListener(this._handleWidgetsChanged);
    UiFramework.widgetManager.onWidgetProvidersChanged.removeListener(this._handleWidgetProvidersChanged);
    UiItemsManager.onUiProviderRegisteredEvent.removeListener(this._handleUiProviderRegisteredEvent);
  }

  private _uiVisibilityChanged = (args: UiVisibilityEventArgs): void => {
    this.setState({ isUiVisible: args.visible });
  };

  private _handleWidgetsChanged = (_args: WidgetsChangedEventArgs): void => {
    this.updateWidgetDefs();
  };

  private _handleWidgetProvidersChanged = (_args: WidgetProvidersChangedEventArgs): void => {
    this.updateWidgetDefs();
  };

  private _handleUiProviderRegisteredEvent = (_args: UiItemProviderRegisteredEventArgs): void => {
    this.updateWidgetDefs();
  };

  private updateWidgetDefs() {
    if (!this.props.runtimeProps)
      return;

    const frontstageDef = this.props.runtimeProps.frontstageDef;
    frontstageDef.updateWidgetDefs();
    FrontstageManager.onWidgetDefsUpdatedEvent.emit();
    this.forceUpdate();
  }

  /** Initializes a FrontstageDef from FrontstageProps */
  public static initializeFrontstageDef(frontstageDef: FrontstageDef, props: FrontstageProps): void {
    frontstageDef.initializeFromProps(props);
  }

  /** @internal */
  public static createZoneDef(zoneNode: React.ReactElement<ZoneProps> | undefined, zoneLocation: ZoneLocation, props: FrontstageProps): ZoneDef | undefined {
    if (zoneNode) {
      const zoneDef = new ZoneDef();
      const zoneElement = Frontstage.getZoneElement(zoneLocation, props);

      zoneDef.zoneLocation = zoneLocation;

      // istanbul ignore else
      if (zoneElement && React.isValidElement(zoneElement)) {
        Zone.initializeZoneDef(zoneDef, zoneElement.props);
        return zoneDef;
      }
    }

    return undefined;
  }

  private static getZoneElement(zoneId: WidgetZoneId, props: FrontstageProps): React.ReactElement<ZoneProps> | undefined {
    switch (zoneId) {
      case ZoneLocation.TopLeft:
        return props.contentManipulationTools ? props.contentManipulationTools : props.topLeft;
      case ZoneLocation.TopCenter:
        return props.toolSettings ? props.toolSettings : props.topCenter;
      case ZoneLocation.TopRight:
        return props.viewNavigationTools ? /* istanbul ignore next */ props.viewNavigationTools : props.topRight;
      case ZoneLocation.CenterLeft:
        return props.centerLeft;
      case ZoneLocation.CenterRight:
        return props.centerRight;
      case ZoneLocation.BottomLeft:
        return props.bottomLeft;
      case ZoneLocation.BottomCenter:
        return props.statusBar ? props.statusBar : props.bottomCenter;
      case ZoneLocation.BottomRight:
        return props.bottomRight;
    }

    // Zones can be undefined in a Frontstage
    // istanbul ignore next
    return undefined;
  }

  /** @internal */
  public static createStagePanelDef(panelLocation: StagePanelLocation, props: FrontstageProps): StagePanelDef | undefined {
    const panelDef = new StagePanelDef();

    const panelElement = Frontstage.getStagePanelElement(panelLocation, props);
    panelDef.initializeFromProps(panelElement?.props, panelLocation);

    return panelDef;
  }

  private static getStagePanelElement(location: StagePanelLocation, props: FrontstageProps): React.ReactElement<StagePanelProps> | undefined {
    let panelElement: React.ReactElement<StagePanelProps> | undefined;

    switch (location) {
      case StagePanelLocation.Top:
        panelElement = props.topPanel;
        break;
      case StagePanelLocation.TopMost:
        panelElement = props.topMostPanel;
        break;
      case StagePanelLocation.Left:
        panelElement = props.leftPanel;
        break;
      case StagePanelLocation.Right:
        panelElement = props.rightPanel;
        break;
      case StagePanelLocation.Bottom:
        panelElement = props.bottomPanel;
        break;
      case StagePanelLocation.BottomMost:
        panelElement = props.bottomMostPanel;
        break;
      // istanbul ignore next
      default:
        throw new RangeError();
    }

    // Panels can be undefined in a Frontstage

    return panelElement;
  }

  private _getContentRef = (widget: WidgetZoneId) => {
    const ref = this._contentRefs.get(widget);
    if (ref)
      return ref;
    const newRef = (el: HTMLDivElement | null) => {
      this.setState((prevState) => ({
        widgetIdToContent: {
          ...prevState.widgetIdToContent,
          [widget]: el === null ? undefined : el,
        },
      }));
    };
    this._contentRefs.set(widget, newRef);
    return newRef;
  };

  // This uses ConfigurableUi to render the content
  private doContentLayoutRender(): React.ReactNode {
    let contentLayout: React.ReactNode;

    // istanbul ignore else
    if (this.props.runtimeProps && this.props.runtimeProps.frontstageDef) {
      const frontstageDef = this.props.runtimeProps.frontstageDef;

      // istanbul ignore else
      if (frontstageDef.contentLayoutDef && frontstageDef.contentGroup)
        contentLayout = (
          <ContentLayout
            contentLayout={frontstageDef.contentLayoutDef}
            contentGroup={frontstageDef.contentGroup}
            isInFooterMode={frontstageDef.isInFooterMode}
          />
        );
      else
        Logger.logError(UiFramework.loggerCategory(this), `FrontstageDef.contentLayoutDef and FrontstageDef.contentGroup are required for <ContentLayout> component`);
    }

    return contentLayout;
  }

  private cloneStagePanelElement(panelDef: StagePanelDef | undefined, runtimeProps: FrontstageRuntimeProps): React.ReactNode {
    if (!this.state.isUiVisible && UiShowHideManager.showHidePanels)
      return null;

    // istanbul ignore else
    if (panelDef) {
      const { location } = panelDef;
      const panelElement = Frontstage.getStagePanelElement(location, this.props);

      // istanbul ignore else
      if (panelElement && React.isValidElement(panelElement)) {
        const panelKey = getNestedStagePanelKey(panelDef.location);
        const panels = runtimeProps.nineZone.nested.panels[panelKey.id];
        const panel = StagePanelsManager.getPanel(panelKey.type, panels);
        const draggedWidget = runtimeProps.nineZone.zones.draggedWidget;

        const panelRuntimeProps: StagePanelRuntimeProps = {
          draggedWidgetId: draggedWidget ? /* istanbul ignore next */ draggedWidget.id : undefined,
          getWidgetContentRef: this._getContentRef,
          isInFooterMode: runtimeProps.nineZone.zones.isInFooterMode,
          isTargeted: !!runtimeProps.nineZone.zones.target,
          panel,
          panelDef,
          stagePanelChangeHandler: runtimeProps.stagePanelChangeHandler,
          widgetChangeHandler: runtimeProps.widgetChangeHandler,
          widgets: runtimeProps.nineZone.zones.widgets,
          widgetTabs: runtimeProps.widgetTabs,
          zoneDefProvider: runtimeProps.zoneDefProvider,
        };

        return React.cloneElement(panelElement, { runtimeProps: panelRuntimeProps });
      }
    }

    return null;
  }

  private cloneZoneElements(zoneIds: ReadonlyArray<WidgetZoneId>, runtimeProps: FrontstageRuntimeProps): React.ReactNode[] {
    return zoneIds.map((zoneId: WidgetZoneId) => {
      const zoneElement = Frontstage.getZoneElement(zoneId, this.props);
      if (!zoneElement || !React.isValidElement(zoneElement))
        return null;

      const zoneDef = runtimeProps.zoneDefProvider.getZoneDef(zoneId);

      // istanbul ignore if
      if (!zoneDef)
        return null;

      const nestedPanelsManager = FrontstageManager.NineZoneManager.getNestedPanelsManager();
      const panelsManager = nestedPanelsManager.getPanelsManager("inner");
      const type = panelsManager.findWidget(zoneId, runtimeProps.nineZone.nested.panels.inner);
      // istanbul ignore if
      if (type !== undefined)
        return null;

      const zonesManager = FrontstageManager.NineZoneManager.getZonesManager();
      const zones = runtimeProps.nineZone.zones;
      const ghostOutline = zonesManager.getGhostOutlineBounds(zoneId, zones);
      const dropTarget = zonesManager.getDropTarget(zoneId, zones);
      const zone = getExtendedZone(zoneId, zones, runtimeProps.zoneDefProvider);
      const widget = zone.widgets.length > 0 ? zones.widgets[zone.widgets[0]] : undefined;
      const openWidgetId = zone.widgets.find((wId) => zones.widgets[wId].tabIndex >= 0);
      const activeTabIndex = openWidgetId ? zones.widgets[openWidgetId].tabIndex : 0;
      const draggedWidget = runtimeProps.nineZone.zones.draggedWidget;
      const disabledResizeHandles = zonesManager.getDisabledResizeHandles(zoneId, zones);
      const zoneRuntimeProps: ZoneRuntimeProps = {
        activeTabIndex,
        disabledResizeHandles,
        draggedWidget: draggedWidget && /* istanbul ignore next */ draggedWidget.id === zoneId ? /* istanbul ignore next */ draggedWidget : undefined,
        dropTarget,
        getWidgetContentRef: this._getContentRef,
        ghostOutline,
        isHidden: (zoneDef.isStatusBar && this.props.isInFooterMode && /* istanbul ignore next */ (this.state.isUiVisible || !UiShowHideManager.showHideFooter)) ?
          /* istanbul ignore next */ false : !this.state.isUiVisible,
        isInFooterMode: runtimeProps.nineZone.zones.isInFooterMode,
        openWidgetId,
        targetChangeHandler: runtimeProps.targetChangeHandler,
        widgetChangeHandler: runtimeProps.widgetChangeHandler,
        widgetTabs: runtimeProps.widgetTabs,
        widget,
        zoneDef,
        zoneDefProvider: runtimeProps.zoneDefProvider,
        zone,
      };
      return React.cloneElement(zoneElement, { key: zoneId, runtimeProps: zoneRuntimeProps });
    });
  }

  private cloneWidgetContentElements(zones: ReadonlyArray<WidgetZoneId>, runtimeProps: FrontstageRuntimeProps): React.ReactNode[] {
    const widgets = zones.reduce<Array<{ id: WidgetZoneId, def: WidgetDef, tabIndex: number }>>((prev, zoneId) => {
      const zoneDef = runtimeProps.zoneDefProvider.getZoneDef(zoneId);

      // istanbul ignore if
      if (!zoneDef)
        return prev;

      const widgetDefs = zoneDef.widgetDefs.filter((widgetDef: WidgetDef) => {
        if (zoneId === 2)
          return widgetDef.isVisible;
        return widgetDef.isVisible && !widgetDef.isFloating;
      });

      for (let i = 0; i < widgetDefs.length; i++) {
        prev.push({
          id: zoneId,
          def: widgetDefs[i],
          tabIndex: i,
        });
      }

      return prev;
    }, []);
    return widgets.map((widget) => {
      const nzWidget = runtimeProps.nineZone.zones.widgets[widget.id];
      return (
        <WidgetContentRenderer
          anchor={nzWidget.horizontalAnchor}
          isHidden={nzWidget.tabIndex !== widget.tabIndex}
          key={`${widget.id}_${widget.tabIndex}`}
          renderTo={this.state.widgetIdToContent[widget.id]}
          toolSettingsMode={isToolSettingsWidgetManagerProps(nzWidget) ? nzWidget.mode : undefined}
          widgetDef={widget.def}
        />
      );
    });
  }

  /** React render method
   * @internal
   */
  public override render(): React.ReactNode {
    const { runtimeProps } = this.props;

    if (runtimeProps === undefined)
      return null;

    /** For Nine-zone area; includes ContentLayout */
    const ninezoneStyle: React.CSSProperties = {
      position: "relative",
      height: "100%",
    };

    const frontstageDef = runtimeProps.frontstageDef;

    return (
      <div style={ninezoneStyle} id="uifw-ninezone-area" className={this.props.className}>
        <NZ_Zones style={runtimeProps.nineZone.zones.isInFooterMode ? this._zonesFooterModeStyle : this._zonesStyle} >
          <StagePanels
            bottomPanel={this.cloneStagePanelElement(frontstageDef.bottomMostPanel, runtimeProps)} // eslint-disable-line deprecation/deprecation
            topPanel={this.cloneStagePanelElement(frontstageDef.topMostPanel, runtimeProps)} // eslint-disable-line deprecation/deprecation
          >
            <StagePanels
              bottomPanel={this.cloneStagePanelElement(frontstageDef.bottomPanel, runtimeProps)}
              leftPanel={this.cloneStagePanelElement(frontstageDef.leftPanel, runtimeProps)}
              rightPanel={this.cloneStagePanelElement(frontstageDef.rightPanel, runtimeProps)}
              topPanel={this.cloneStagePanelElement(frontstageDef.topPanel, runtimeProps)}
            >
              <div
                id="uifw-ninezone-zones-area"
                ref={this._zonesMeasurer}
                style={{
                  height: "100%",
                  position: "relative",
                }}
              >
                {this.doContentLayoutRender()}
                {this.cloneZoneElements(Frontstage._zoneIds, runtimeProps)}
              </div>
            </StagePanels>
          </StagePanels>
          {this.cloneZoneElements([8], runtimeProps)}
          <div
            id="uifw-ninezone-floating-zones-area"
            ref={this._floatingZonesMeasurer}
            style={{
              height: "100%",
              width: "100%",
              position: "absolute",
            }}
          />
        </NZ_Zones>
        {this.cloneWidgetContentElements(Frontstage._zoneIds, runtimeProps)}
      </div>
    );
  }
}

interface WidgetContentRendererProps {
  anchor: HorizontalAnchor;
  isHidden: boolean;
  renderTo: HTMLDivElement | undefined;
  toolSettingsMode: ToolSettingsWidgetMode | undefined;
  widgetDef: WidgetDef;
}

interface WidgetContentRendererState {
  widgetKey: number;
}

class WidgetContentRenderer extends React.PureComponent<WidgetContentRendererProps, WidgetContentRendererState> {
  private _content = document.createElement("span");

  public constructor(props: WidgetContentRendererProps) {
    super(props);

    this.state = {
      widgetKey: 0,
    };
  }

  public override componentDidMount() {
    FrontstageManager.onWidgetStateChangedEvent.addListener(this._handleWidgetStateChangedEvent);
    FrontstageManager.onToolActivatedEvent.addListener(this._handleToolActivatedEvent);

    this._content.style.display = this.props.isHidden ? "none" : "flex";
    this._content.style.flexDirection = "column";
    this._content.style.height = "100%";
    if (!this.props.renderTo)
      return;
    this.props.renderTo.appendChild(this._content);
  }

  public override componentDidUpdate(prevProps: WidgetContentRendererProps) {
    if (this.props.isHidden !== prevProps.isHidden) {
      this._content.style.display = this.props.isHidden ? "none" : "flex";
    }

    if (!this.props.renderTo || prevProps.renderTo === this.props.renderTo)
      return;

    this.props.widgetDef.saveTransientState();
    this.props.renderTo.appendChild(this._content);

    const shouldRemount = this.props.widgetDef.restoreTransientState();
    // const shouldRemount = this.props.widgetDef.widgetControl ? !this.props.widgetDef.widgetControl.restoreTransientState() : true;

    shouldRemount && this.setState((prevState) => ({ widgetKey: prevState.widgetKey + 1 }));
  }

  public override componentWillUnmount() {
    this._content.parentNode && this._content.parentNode.removeChild(this._content);
    FrontstageManager.onWidgetStateChangedEvent.removeListener(this._handleWidgetStateChangedEvent);
    FrontstageManager.onToolActivatedEvent.removeListener(this._handleToolActivatedEvent);
  }

  public override render() {
    if (this.props.toolSettingsMode !== undefined) {
      return ReactDOM.createPortal((
        <ToolSettingsContent
          anchor={this.props.anchor}
          key={this.state.widgetKey}
          mode={this.props.toolSettingsMode}
        >
          {FrontstageManager.activeToolSettingsProvider && FrontstageManager.activeToolSettingsProvider.toolSettingsNode}
        </ToolSettingsContent>
      ), this._content);
    }

    if (this.props.widgetDef.state === WidgetState.Unloaded)
      return null;
    return ReactDOM.createPortal((
      <React.Fragment
        key={this.state.widgetKey}
      >
        {this.props.widgetDef.reactNode}
      </React.Fragment>
    ), this._content);
  }

  private _handleWidgetStateChangedEvent = (args: WidgetStateChangedEventArgs) => {
    if (this.props.widgetDef !== args.widgetDef)
      return;
    this.forceUpdate();
  };

  private _handleToolActivatedEvent = () => {
    if (this.props.toolSettingsMode === undefined)
      return;
    this.forceUpdate();
  };
}

/** @internal */
export const getExtendedZone = (zoneId: WidgetZoneId, zones: ZonesManagerProps, defProvider: ZoneDefProvider): ZoneManagerProps => {
  const zone = zones.zones[zoneId];
  if (zoneId === 1 || zoneId === 3) {
    let extendOverId: WidgetZoneId = zoneId;
    const zonesManager = FrontstageManager.NineZoneManager.getZonesManager();
    let bottomZoneId = zonesManager.bottomZones.getInitial(extendOverId);
    while (bottomZoneId !== undefined) {
      const bottomZoneDef = defProvider.getZoneDef(bottomZoneId);
      if (bottomZoneDef && bottomZoneDef.widgetDefs.length !== 0)
        break;

      extendOverId = bottomZoneId;
      bottomZoneId = zonesManager.bottomZones.getInitial(bottomZoneId);
    }

    const bottom = zones.zones[extendOverId].bounds.bottom;
    if (bottom === zone.bounds.bottom)
      return zone;
    return {
      ...zone,
      bounds: {
        ...zone.bounds,
        bottom,
      },
    };
  }
  return zone;
};

/** Hook that returns active frontstage id.
 * @beta
 */
export const useActiveFrontstageId = () => {
  const def = useActiveFrontstageDef();
  const id = React.useMemo(() => def ? /* istanbul ignore next */ def.id : "", [def]);
  return id;
};

/** @internal */
export function useActiveFrontstageDef() {
  const [def, setDef] = React.useState(FrontstageManager.activeFrontstageDef);
  React.useEffect(() => {
    // istanbul ignore next
    const handleActivated = (args: FrontstageActivatedEventArgs) => {
      setDef(args.activatedFrontstageDef);
    };
    FrontstageManager.onFrontstageActivatedEvent.addListener(handleActivated);
    return () => {
      FrontstageManager.onFrontstageActivatedEvent.removeListener(handleActivated);
    };
  }, []);
  return def;
}
