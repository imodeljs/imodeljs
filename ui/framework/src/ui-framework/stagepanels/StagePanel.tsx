/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Frontstage
 */

import * as React from "react";
import { StagePanelLocation } from "@bentley/ui-abstract";
import {
  NestedStagePanelKey, NestedStagePanelsManagerProps, NineZoneStagePanelManagerProps, StagePanelType as NZ_StagePanelType, WidgetZoneId,
  ZonesManagerWidgetsProps,
} from "@bentley/ui-ninezone";
import { StagePanelChangeHandler, WidgetChangeHandler, ZoneDefProvider } from "../frontstage/FrontstageComposer";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { WidgetProps } from "../widgets/WidgetProps";
import { WidgetTabs } from "../widgets/WidgetStack";
import { ZoneLocation } from "../zones/Zone";
import { FrameworkStagePanel } from "./FrameworkStagePanel";
import { PanelStateChangedEventArgs, StagePanelDef, StagePanelState as StagePanelState } from "./StagePanelDef";
import { WidgetDef, WidgetStateChangedEventArgs } from "../widgets/WidgetDef";

/** Available StagePanel locations.
 * ------------------------------------------------------------------------------------
 * TopMost
 * ------------------------------------------------------------------------------------
 * Left     | Top                                                           | Right
 *          |---------------------------------------------------------------|
 *          | Nine-zone                                                     |
 *          |                                                               |
 *          |                                                               |
 *          |                                                               |
 *          |                                                               |
 *          |                                                               |
 *          |---------------------------------------------------------------|
 *          | Bottom                                                        |
 * ------------------------------------------------------------------------------------
 * BottomMost
 * ------------------------------------------------------------------------------------
 */

/** Properties of a Stage Panel Zone
 * @public
 */
export interface StagePanelZoneProps {
  /** Properties for the Widgets in this Zone.
   * @note Stable `WidgetProps["id"]` is generated if id is not provided to correctly save and restore App layout.
   * [[Frontstage]] version must be increased when Widget location is changed or new widgets are added/removed.
   */
  widgets: Array<React.ReactElement<WidgetProps>>;
  /** Any application data to attach to this Zone. */
  applicationData?: any;
}

/** Properties of the Stage Panel Zones
 * @public
 */
export interface StagePanelZonesProps {
  /** Properties for the Widgets in the Start section. */
  start?: StagePanelZoneProps;
  /** Properties for the Widgets in the Middle section. */
  middle?: StagePanelZoneProps;
  /** Properties for the Widgets in the End section. */
  end?: StagePanelZoneProps;
}

/** Available units of panel maximum size. Pixels or percentage of 9-Zone App size.
 * @note Percentage of 9-Zone `height` is used for top/bottom panel and percentage of 9-Zone `width` is used for left/right panel.
 * @public
 */
export type StagePanelMaxSizeSpec = number | { percentage: number };

/** Properties of a [[StagePanel]] component
 * @public
 */
export interface StagePanelProps {
  /** Describes which zones are allowed in this stage panel. */
  allowedZones?: ZoneLocation[];
  /** Any application data to attach to this Panel. */
  applicationData?: any;
  /** Default Panel state. Controls how the panel is initially displayed. Defaults to StagePanelState.Open. */
  defaultState?: StagePanelState;
  /** Stage panel header. */
  header?: React.ReactNode;
  /** Maximum size of the panel. */
  maxSize?: StagePanelMaxSizeSpec;
  /** Minimum size of the panel. */
  minSize?: number;
  /** Indicates whether the panel is pinned. Defaults to true. */
  pinned?: boolean;
  /** Indicates whether the panel is resizable. Defaults to true. */
  resizable: boolean;
  /** Default size of the panel. */
  size?: number;
  /** Properties for the Widgets in this Panel.
   * @note Stable `WidgetProps["id"]` is generated if id is not provided to correctly save and restore App layout.
   * [[Frontstage]] version must be increased when Widget location is changed or new widgets are added/removed.
   */
  widgets?: Array<React.ReactElement<WidgetProps>>;

  /** Properties for the Panel Zones in this Panel.
   * @beta */
  panelZones?: StagePanelZonesProps;

  /** @internal */
  runtimeProps?: StagePanelRuntimeProps;
}

/** Default properties of [[StagePanel]] component.
 * @public
 */
export type StagePanelDefaultProps = Pick<StagePanelProps, "resizable">;

/** Runtime Properties for the [[StagePanel]] component.
 * @internal
 */
export interface StagePanelRuntimeProps {
  draggedWidgetId: WidgetZoneId | undefined;
  getWidgetContentRef: (id: WidgetZoneId) => React.Ref<HTMLDivElement>;
  isInFooterMode: boolean;
  isTargeted: boolean;
  panel: NineZoneStagePanelManagerProps;
  panelDef: StagePanelDef;
  stagePanelChangeHandler: StagePanelChangeHandler;
  widgetChangeHandler: WidgetChangeHandler;
  widgets: ZonesManagerWidgetsProps;
  widgetTabs: WidgetTabs;
  zoneDefProvider: ZoneDefProvider;
}

interface StagePanelComponentState {
  panelState: StagePanelState;
  stagePanelWidgets: ReadonlyArray<WidgetDef["id"]>;
}

/** Frontstage Panel React component.
 * @public
 */
export class StagePanel extends React.Component<StagePanelProps, StagePanelComponentState> {
  public static readonly defaultProps: StagePanelDefaultProps = {
    resizable: true,
  };

  public constructor(props: StagePanelProps) {
    super(props);

    const panelState = this.props.runtimeProps?.panelDef.panelState;
    this.state = {
      panelState: panelState === undefined ? StagePanelState.Open : panelState,
      stagePanelWidgets: this._getVisibleStagePanelWidgets(),
    };
  }

  public static initializeStagePanelDef(panelDef: StagePanelDef, props: StagePanelProps, panelLocation: StagePanelLocation): void {
    panelDef.initializeFromProps(props, panelLocation);
  }

  public override componentDidMount() {
    FrontstageManager.onPanelStateChangedEvent.addListener(this._handlePanelStateChangedEvent);
    FrontstageManager.onWidgetStateChangedEvent.addListener(this._handleWidgetStateChangedEvent);
  }

  public override componentDidUpdate(prevProps: StagePanelProps) {
    if (prevProps.runtimeProps?.panelDef !== this.props.runtimeProps?.panelDef) {
      this.setState({
        stagePanelWidgets: this._getVisibleStagePanelWidgets(),
      });
    }
  }

  public override componentWillUnmount() {
    FrontstageManager.onPanelStateChangedEvent.removeListener(this._handlePanelStateChangedEvent);
    FrontstageManager.onWidgetStateChangedEvent.removeListener(this._handleWidgetStateChangedEvent);
  }

  public override render(): React.ReactNode {
    const { applicationData, defaultState, runtimeProps, maxSize, size, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!runtimeProps)
      return null;

    const { stagePanelChangeHandler, panelDef, ...otherRuntimeProps } = runtimeProps;
    return (
      <FrameworkStagePanel
        changeHandler={stagePanelChangeHandler}
        initialSize={size}
        location={panelDef.location}
        renderPane={this._handleRenderPane}
        stagePanelWidgets={this.state.stagePanelWidgets}
        panelState={this.state.panelState}
        maxSize={typeof maxSize === "number" ? maxSize : undefined}
        {...props}
        {...otherRuntimeProps}
      />
    );
  }

  private _handleRenderPane = (widgetDefId: WidgetDef["id"]): React.ReactNode => {
    const runtimeProps = this.props.runtimeProps;
    if (!runtimeProps)
      return null;
    const widgetDef = runtimeProps.panelDef.findWidgetDef(widgetDefId);
    if (!widgetDef || !widgetDef.isVisible)
      return null;
    return (
      <div
        style={{
          height: "100%",
          display: runtimeProps.panel.isCollapsed ? "none" : "block",
        }}
      >
        {widgetDef.reactNode}
      </div>
    );
  };

  private _handlePanelStateChangedEvent = ({ panelDef, panelState }: PanelStateChangedEventArgs) => {
    // istanbul ignore else
    if (panelDef !== this.props.runtimeProps?.panelDef)
      return;
    // istanbul ignore next
    this.setState({
      panelState,
    });
  };

  private _handleWidgetStateChangedEvent = ({ widgetDef }: WidgetStateChangedEventArgs) => {
    const runtimeProps = this.props.runtimeProps;
    if (!runtimeProps)
      return;
    if (!runtimeProps.panelDef.findWidgetDef(widgetDef.id))
      return;
    this.setState({
      stagePanelWidgets: this._getVisibleStagePanelWidgets(),
    });
  };

  private _getVisibleStagePanelWidgets() {
    const panelDef = this.props.runtimeProps?.panelDef;
    if (!panelDef)
      return [];
    const visibleWidgets = panelDef.widgetDefs.filter((wd) => wd.isVisible);
    return visibleWidgets.map((widgetDef) => widgetDef.id);
  }
}

/** @internal */
export const getStagePanelType = (location: StagePanelLocation): NZ_StagePanelType => {
  switch (location) {
    case StagePanelLocation.Bottom:
    case StagePanelLocation.BottomMost:
      return NZ_StagePanelType.Bottom;
    case StagePanelLocation.Left:
      return NZ_StagePanelType.Left;
    case StagePanelLocation.Right:
      return NZ_StagePanelType.Right;
    case StagePanelLocation.Top:
    case StagePanelLocation.TopMost:
      return NZ_StagePanelType.Top;
  }
};

/** @internal */
export const getNestedStagePanelKey = (location: StagePanelLocation): NestedStagePanelKey<NestedStagePanelsManagerProps> => {
  switch (location) {
    case StagePanelLocation.Bottom:
      return {
        id: "inner",
        type: NZ_StagePanelType.Bottom,
      };
    case StagePanelLocation.BottomMost:
      return {
        id: "outer",
        type: NZ_StagePanelType.Bottom,
      };
    case StagePanelLocation.Left:
      return {
        id: "inner",
        type: NZ_StagePanelType.Left,
      };
    case StagePanelLocation.Right:
      return {
        id: "inner",
        type: NZ_StagePanelType.Right,
      };
    case StagePanelLocation.Top:
      return {
        id: "inner",
        type: NZ_StagePanelType.Top,
      };
    case StagePanelLocation.TopMost:
      return {
        id: "outer",
        type: NZ_StagePanelType.Top,
      };
  }
};
