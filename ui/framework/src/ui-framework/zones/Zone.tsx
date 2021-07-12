/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import * as React from "react";
import { WidgetState } from "@bentley/ui-abstract";
import { CommonProps, RectangleProps } from "@bentley/ui-core";
import {
  DisabledResizeHandles, DraggedWidgetManagerProps, ToolSettingsWidgetManagerProps, ToolSettingsWidgetMode, WidgetManagerProps, WidgetZoneId,
  ZoneManagerProps, ZoneTargetType,
} from "@bentley/ui-ninezone";
import { ConfigurableUiControlType } from "../configurableui/ConfigurableUiControl";
import { TargetChangeHandler, WidgetChangeHandler, ZoneDefProvider } from "../frontstage/FrontstageComposer";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { StatusBarWidgetControl } from "../statusbar/StatusBarWidgetControl";
import { WidgetDef, WidgetStateChangedEventArgs, WidgetType } from "../widgets/WidgetDef";
import { WidgetProps } from "../widgets/WidgetProps";
import { WidgetTabs } from "../widgets/WidgetStack";
import { FrameworkZone } from "./FrameworkZone";
import { StatusBarZone } from "./StatusBarZone";
import { ToolSettingsZone } from "./toolsettings/ToolSettingsZone";
import { ZoneDef, ZoneState } from "./ZoneDef";

/** Enum for [[Zone]] Location.
 * @public
 */
export enum ZoneLocation {
  TopLeft = 1,
  TopCenter = 2,
  TopRight = 3,
  CenterLeft = 4,
  CenterRight = 6,
  BottomLeft = 7,
  BottomCenter = 8,
  BottomRight = 9,
}

/** Properties of a [[Zone]] component
 * @public
 */
export interface ZoneProps extends CommonProps {
  /** Default Zone state. Controls how the Zone is initially displayed. Defaults to ZoneState.Open. */
  defaultState?: ZoneState;
  /** Indicates if other Zones may be merged with this Zone. Defaults to false.  */
  allowsMerging?: boolean;
  /** Any application data to attach to this Zone. */
  applicationData?: any;
  /** Indicates with which other zone to merge. */
  mergeWithZone?: ZoneLocation;
  /** Describes preferred initial width of the zone. */
  initialWidth?: number;

  /** Properties for the Widgets in this Zone.
   * @note Stable `WidgetProps["id"]` is generated if id is not provided to correctly save and restore App layout.
   * [[Frontstage]] version must be increased when Widget location is changed or new widgets are added/removed.
   */
  widgets?: Array<React.ReactElement<WidgetProps>>;

  /** @internal */
  runtimeProps?: ZoneRuntimeProps;
}

/** Runtime Properties for the [[Zone]] component.
 * @internal
 */
export interface ZoneRuntimeProps {
  activeTabIndex: number;
  disabledResizeHandles: DisabledResizeHandles | undefined;
  draggedWidget: DraggedWidgetManagerProps | undefined;
  dropTarget: ZoneTargetType | undefined;
  getWidgetContentRef: (id: WidgetZoneId) => React.Ref<HTMLDivElement>;
  ghostOutline: RectangleProps | undefined;
  isHidden: boolean;
  isInFooterMode: boolean;
  openWidgetId: WidgetZoneId | undefined;
  targetChangeHandler: TargetChangeHandler;
  widget: WidgetManagerProps | undefined;
  widgetTabs: WidgetTabs;
  widgetChangeHandler: WidgetChangeHandler;
  zoneDefProvider: ZoneDefProvider;
  zoneDef: ZoneDef;
  zone: ZoneManagerProps;
}

/** @internal */
export function getStableWidgetProps(widgetProps: WidgetProps, stableId: string) {
  let props = widgetProps;
  if (props.id === undefined)
    props = {
      ...props,
      id: stableId,
    };
  return props;
}

/** Zone React component.
 * A Zone is a standard area on the screen for users to read and interact with data applicable to the current task. Each Zone has a defined purpose.
 * @public
 */
export class Zone extends React.Component<ZoneProps> {
  constructor(props: ZoneProps) {
    super(props);
  }

  public static initializeZoneDef(zoneDef: ZoneDef, props: ZoneProps): void {
    zoneDef.initializeFromProps(props);

    // istanbul ignore else
    if (props.widgets) {
      props.widgets.forEach((widgetNode, index) => {
        // istanbul ignore if
        if (!React.isValidElement(widgetNode))
          return;

        const stableId = `uifw-z-${ZoneLocation[zoneDef.zoneLocation]}-${index}`;
        const stableProps = getStableWidgetProps(widgetNode.props, stableId);
        const widgetDef = new WidgetDef(stableProps);
        zoneDef.addWidgetDef(widgetDef);
      });
    }
  }

  public override componentDidMount(): void {
    FrontstageManager.onWidgetStateChangedEvent.addListener(this._handleWidgetStateChangedEvent);
  }

  public override componentWillUnmount(): void {
    FrontstageManager.onWidgetStateChangedEvent.removeListener(this._handleWidgetStateChangedEvent);
  }

  public override render(): React.ReactNode {
    const { runtimeProps } = this.props;

    if (!runtimeProps)
      return null;

    const { zoneDef } = runtimeProps;

    let widgetElement: React.ReactNode;
    // istanbul ignore else
    if (runtimeProps.zone.widgets.length === 1) {
      if (zoneDef.isToolSettings && isToolSettingsWidgetManagerProps(runtimeProps.widget) && runtimeProps.widget.mode === ToolSettingsWidgetMode.TitleBar) {
        const widgetDef = zoneDef.getSingleWidgetDef();
        const isClosed = widgetDef ? (widgetDef.state === WidgetState.Closed || widgetDef.state === WidgetState.Hidden)
          : /* istanbul ignore next */ false;
        return (
          <ToolSettingsZone
            className={this.props.className}
            dropTarget={runtimeProps.dropTarget}
            getWidgetContentRef={runtimeProps.getWidgetContentRef}
            isClosed={isClosed}
            isHidden={runtimeProps.isHidden}
            lastPosition={runtimeProps.draggedWidget && /* istanbul ignore next */ runtimeProps.draggedWidget.lastPosition}
            style={this.props.style}
            targetChangeHandler={runtimeProps.targetChangeHandler}
            targetedBounds={runtimeProps.ghostOutline}
            widgetChangeHandler={runtimeProps.widgetChangeHandler}
            zone={runtimeProps.zone}
          />
        );
      } else if (zoneDef.isStatusBar) {
        // istanbul ignore next
        if (runtimeProps.zone.id !== 8)
          throw new TypeError();

        let widgetControl: StatusBarWidgetControl | undefined;
        const widgetDef = zoneDef.getSingleWidgetDef();

        // istanbul ignore else
        if (widgetDef)
          widgetControl = widgetDef.getWidgetControl(ConfigurableUiControlType.StatusBarWidget) as StatusBarWidgetControl;

        return (
          <StatusBarZone
            className={this.props.className}
            dropTarget={runtimeProps.dropTarget}
            isHidden={runtimeProps.isHidden}
            isInFooterMode={runtimeProps.isInFooterMode}
            style={this.props.style}
            targetChangeHandler={runtimeProps.targetChangeHandler}
            targetedBounds={runtimeProps.ghostOutline}
            widgetChangeHandler={runtimeProps.widgetChangeHandler}
            widgetControl={widgetControl}
            zoneProps={runtimeProps.zone}
          />
        );
      }

      const zDef = runtimeProps.zoneDefProvider.getZoneDef(runtimeProps.zone.widgets[0]);
      // istanbul ignore if
      if (!zDef) {
        widgetElement = null;
      } else if (zDef.widgetCount === 1 && zDef.widgetDefs[0].widgetType !== WidgetType.Rectangular) {
        /** Return free-form nzWidgetProps */
        const widgetDef = zDef.widgetDefs[0];
        widgetElement = (widgetDef.isVisible) ? widgetDef.reactNode : /* istanbul ignore next */ null;
      }
    }

    return (
      <FrameworkZone
        activeTabIndex={runtimeProps.activeTabIndex}
        className={this.props.className}
        disabledResizeHandles={runtimeProps.disabledResizeHandles}
        draggedWidget={runtimeProps.draggedWidget}
        dropTarget={runtimeProps.dropTarget}
        fillZone={zoneDef.shouldFillZone}
        getWidgetContentRef={runtimeProps.getWidgetContentRef}
        isHidden={runtimeProps.isHidden}
        isInFooterMode={runtimeProps.isInFooterMode}
        openWidgetId={runtimeProps.openWidgetId}
        style={this.props.style}
        targetedBounds={runtimeProps.ghostOutline}
        targetChangeHandler={runtimeProps.targetChangeHandler}
        widget={runtimeProps.widget}
        widgetElement={widgetElement}
        widgetTabs={runtimeProps.widgetTabs}
        widgetChangeHandler={runtimeProps.widgetChangeHandler}
        zone={runtimeProps.zone}
      />
    );
  }

  private _handleWidgetStateChangedEvent = (args: WidgetStateChangedEventArgs) => {
    const runtimeProps = this.props.runtimeProps;
    if (!runtimeProps)
      return;

    const widgetDef = args.widgetDef;
    const id = this.getWidgetIdForDef(widgetDef);
    if (!id)
      return;

    const zoneDef = runtimeProps.zoneDefProvider.getZoneDef(id);
    // istanbul ignore if
    if (!zoneDef)
      return;

    const visibleWidgets = zoneDef.widgetDefs.filter((wd) => wd.isVisible || wd === widgetDef);
    for (let index = 0; index < visibleWidgets.length; index++) {
      const wDef = visibleWidgets[index];
      if (wDef !== widgetDef)
        continue;

      if (widgetDef.state === WidgetState.Hidden && index < runtimeProps.activeTabIndex && id === runtimeProps.openWidgetId) {
        // Need to decrease active tab index, since removed tab was rendered before active tab and we want to maintain active tab.
        runtimeProps.widgetChangeHandler.handleTabClick(id, runtimeProps.activeTabIndex - 1);
        break;
      }
      runtimeProps.widgetChangeHandler.handleWidgetStateChange(id, index, widgetDef.state === WidgetState.Open);
      break;
    }
  };

  private getWidgetIdForDef(widgetDef: WidgetDef): WidgetZoneId | undefined {
    // istanbul ignore if
    if (!this.props.runtimeProps)
      return undefined;

    for (const wId of this.props.runtimeProps.zone.widgets) {
      const zoneDef = this.props.runtimeProps.zoneDefProvider.getZoneDef(wId);
      if (zoneDef && zoneDef.widgetDefs.some((wDef: WidgetDef) => wDef === widgetDef))
        return wId;
    }

    return undefined;
  }
}

/** @internal */
export const isToolSettingsWidgetManagerProps = (props: WidgetManagerProps | undefined): props is ToolSettingsWidgetManagerProps => {
  return !!props && props.id === 2;
};
