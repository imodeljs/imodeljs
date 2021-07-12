/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import * as React from "react";
import { CommonProps, RectangleProps } from "@bentley/ui-core";
import {
  DisabledResizeHandles, DraggedWidgetManagerProps, Zone as NZ_Zone, WidgetManagerProps, WidgetZoneId, ZoneManagerProps, ZoneTargetType,
} from "@bentley/ui-ninezone";
import { ZoneTargets } from "../dragdrop/ZoneTargets";
import { TargetChangeHandler, WidgetChangeHandler } from "../frontstage/FrontstageComposer";
import { SafeAreaContext } from "../safearea/SafeAreaContext";
import { WidgetStack, WidgetTabs } from "../widgets/WidgetStack";
import { Outline } from "./Outline";

/** Properties for the [[FrameworkZone]] component.
 * @internal
 */
export interface FrameworkZoneProps extends CommonProps {
  activeTabIndex: number;
  disabledResizeHandles: DisabledResizeHandles | undefined;
  draggedWidget: DraggedWidgetManagerProps | undefined;
  dropTarget: ZoneTargetType | undefined;
  fillZone?: boolean;
  getWidgetContentRef: (id: WidgetZoneId) => React.Ref<HTMLDivElement>;
  isHidden: boolean;
  isInFooterMode: boolean;
  openWidgetId: WidgetZoneId | undefined;
  targetChangeHandler: TargetChangeHandler;
  targetedBounds?: RectangleProps;
  widget: WidgetManagerProps | undefined;
  widgetElement: React.ReactNode;
  widgetChangeHandler: WidgetChangeHandler;
  widgetTabs: WidgetTabs;
  zone: ZoneManagerProps;
}

/** FrameworkZone React component.
 * @internal
 */
export class FrameworkZone extends React.PureComponent<FrameworkZoneProps> {
  public override render(): React.ReactNode {
    const zIndexStyle = getFloatingZoneStyle(this.props.zone);
    const floatingBounds = getFloatingZoneBounds(this.props.zone);
    return (
      <SafeAreaContext.Consumer>
        {(safeAreaInsets) => (
          <span style={zIndexStyle}>
            <NZ_Zone
              bounds={floatingBounds}
              className={this.props.className}
              style={this.props.style}
              isFloating={!!this.props.zone.floating}
              isHidden={this.props.isHidden}
              isInFooterMode={this.props.isInFooterMode}
              id={this.props.zone.id}
              safeAreaInsets={safeAreaInsets}
            >
              {this._getWidget()}
            </NZ_Zone>
            <NZ_Zone
              bounds={this.props.zone.bounds}
              id={this.props.zone.id}
              isInFooterMode={this.props.isInFooterMode}
              safeAreaInsets={safeAreaInsets}
            >
              <ZoneTargets
                zoneId={this.props.zone.id}
                dropTarget={this.props.dropTarget}
                targetChangeHandler={this.props.targetChangeHandler}
              />
            </NZ_Zone>
            <Outline bounds={this.props.targetedBounds} />
          </span>
        )}
      </SafeAreaContext.Consumer>
    );
  }

  private _getWidget() {
    const widget = this.props.widget;
    if (!widget)
      return null;

    if (this.props.widgetElement !== undefined)
      return this.props.widgetElement;

    return (
      <WidgetStack
        activeTabIndex={this.props.activeTabIndex}
        disabledResizeHandles={this.props.disabledResizeHandles}
        draggedWidget={this.props.draggedWidget}
        fillZone={this.props.fillZone || this.props.zone.isLayoutChanged}
        getWidgetContentRef={this.props.getWidgetContentRef}
        horizontalAnchor={widget.horizontalAnchor}
        isCollapsed={false}
        isFloating={!!this.props.zone.floating}
        isInStagePanel={false}
        openWidgetId={this.props.openWidgetId}
        verticalAnchor={widget.verticalAnchor}
        widgets={this.props.zone.widgets}
        widgetTabs={this.props.widgetTabs}
        widgetChangeHandler={this.props.widgetChangeHandler}
      />
    );
  }
}

/** @internal */
export const getFloatingZoneBounds = (props: ZoneManagerProps) => {
  return props.floating ? props.floating.bounds : props.bounds;
};

/** @internal */
export const getFloatingZoneStyle = (props: ZoneManagerProps) => {
  return props.floating ? {
    zIndex: props.floating.stackId,
    position: "relative" as const,
  } : undefined;
};
