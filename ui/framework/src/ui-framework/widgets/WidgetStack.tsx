/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import * as React from "react";
import { BadgeType, ConditionalStringValue } from "@bentley/ui-abstract";
import { BadgeUtilities, CommonProps, IconHelper, PointProps, Rectangle, RectangleProps } from "@bentley/ui-core";
import {
  DisabledResizeHandles, DraggedWidgetManagerProps, HandleMode, HorizontalAnchor, Stacked as NZ_WidgetStack, ResizeHandle, Tab, TabGroup, TabMode,
  TabSeparator, VerticalAnchor, VerticalAnchorHelpers, WidgetZoneId,
} from "@bentley/ui-ninezone";
import { WidgetChangeHandler } from "../frontstage/FrontstageComposer";
import { UiShowHideManager } from "../utils/UiShowHideManager";

// cSpell:ignore Timedout

/** Properties for a [[WidgetStack]] Tab.
 * @internal
 */
export interface WidgetTab {
  readonly iconSpec?: string | ConditionalStringValue | React.ReactNode;
  readonly title: string;
  readonly badgeType?: BadgeType;
}

/** Properties for a Widget in a [[WidgetStack]].
 * @internal
 */
export type WidgetTabs = { readonly [id in WidgetZoneId]: ReadonlyArray<WidgetTab> };

/** Properties for the [[WidgetStack]] React component.
 * @internal
 */
export interface WidgetStackProps extends CommonProps {
  activeTabIndex: number;
  disabledResizeHandles: DisabledResizeHandles | undefined;
  draggedWidget: DraggedWidgetManagerProps | undefined;
  fillZone: boolean;
  getWidgetContentRef: (id: WidgetZoneId) => React.Ref<HTMLDivElement>;
  horizontalAnchor: HorizontalAnchor;
  isCollapsed: boolean;
  isFloating: boolean;
  isInStagePanel: boolean;
  openWidgetId: WidgetZoneId | undefined;
  verticalAnchor: VerticalAnchor;
  widgetChangeHandler: WidgetChangeHandler;
  widgets: ReadonlyArray<WidgetZoneId>;
  widgetTabs: WidgetTabs;
}

/** Widget stack React component.
 * @internal
 */
export class WidgetStack extends React.PureComponent<WidgetStackProps> {
  private _widgetStack = React.createRef<NZ_WidgetStack>();

  public override render(): React.ReactNode {
    const tabCount = this.props.widgets.reduce((acc, widgetId) => {
      const tabs = this.props.widgetTabs[widgetId];
      return acc + tabs.length;
    }, 0);
    if (tabCount === 0)
      return null;
    return (
      <NZ_WidgetStack
        className={this.props.className}
        contentRef={this.props.openWidgetId ? this.props.getWidgetContentRef(this.props.openWidgetId) : undefined}
        disabledResizeHandles={this.props.disabledResizeHandles}
        fillZone={this.props.fillZone || this.props.isInStagePanel}
        horizontalAnchor={this.props.horizontalAnchor}
        isCollapsed={this.props.isCollapsed}
        isTabBarVisible={this.props.isInStagePanel}
        isDragged={!!this.props.draggedWidget}
        isFloating={this.props.isFloating}
        isOpen={!!this.props.openWidgetId}
        onMouseEnter={UiShowHideManager.handleWidgetMouseEnter}
        onResize={this.props.isInStagePanel ? undefined : this._handleOnWidgetResize}
        ref={this._widgetStack}
        style={this.props.style}
        tabs={<WidgetStackTabs
          activeTabIndex={this.props.activeTabIndex}
          draggedWidget={this.props.draggedWidget}
          horizontalAnchor={this.props.horizontalAnchor}
          isCollapsed={this.props.isCollapsed}
          isProtruding={!this.props.isInStagePanel}
          onTabClick={this._handleTabClick}
          onTabDrag={this._handleTabDrag}
          onTabDragEnd={this._handleTabDragEnd}
          onTabDragStart={this._handleTabDragStart}
          openWidgetId={this.props.openWidgetId}
          verticalAnchor={this.props.verticalAnchor}
          widgets={this.props.widgets}
          widgetTabs={this.props.widgetTabs}
        />}
        verticalAnchor={this.props.verticalAnchor}
      />
    );
  }

  private _handleOnWidgetResize = (resizeBy: number, handle: ResizeHandle, filledHeightDiff: number) => {
    this.props.widgetChangeHandler.handleResize(this.props.widgets[0], resizeBy, handle, filledHeightDiff);
  };

  private _handleTabDragStart = (widgetId: WidgetZoneId, tabIndex: number, initialPosition: PointProps, firstTabBounds: RectangleProps) => {
    if (!this._widgetStack.current)
      return;

    const tabBounds = Rectangle.create(firstTabBounds);
    const stackedWidgetBounds = Rectangle.create(this._widgetStack.current.getBounds());
    const offsetToFirstTab = stackedWidgetBounds.topLeft().getOffsetTo(tabBounds.topLeft());
    const isHorizontal = this.props.verticalAnchor === VerticalAnchor.BottomPanel || this.props.verticalAnchor === VerticalAnchor.TopPanel;
    let widgetBounds;
    if (isHorizontal)
      widgetBounds = stackedWidgetBounds.offsetX(offsetToFirstTab.x);
    else
      widgetBounds = stackedWidgetBounds.offsetY(offsetToFirstTab.y);

    this.props.widgetChangeHandler.handleTabDragStart(widgetId, tabIndex, initialPosition, widgetBounds);
  };

  private _handleTabDragEnd = () => {
    this.props.widgetChangeHandler.handleTabDragEnd();
  };

  private _handleTabClick = (widgetId: WidgetZoneId, tabIndex: number) => {
    this.props.widgetChangeHandler.handleTabClick(widgetId, tabIndex);
  };

  private _handleTabDrag = (dragged: PointProps) => {
    this.props.widgetChangeHandler.handleTabDrag(dragged);
  };
}

/** Properties for the [[WidgetStackTabs]] component.
 * @internal
 */
export interface WidgetStackTabsProps {
  activeTabIndex: number;
  draggedWidget: DraggedWidgetManagerProps | undefined;
  horizontalAnchor: HorizontalAnchor;
  isCollapsed: boolean;
  isProtruding: boolean;
  onTabClick: (widgetId: WidgetZoneId, tabIndex: number) => void;
  onTabDrag: (dragged: PointProps) => void;
  onTabDragEnd: () => void;
  onTabDragStart: (widgetId: WidgetZoneId, tabIndex: number, initialPosition: PointProps, firstTabBounds: RectangleProps) => void;
  openWidgetId: WidgetZoneId | undefined;
  verticalAnchor: VerticalAnchor;
  widgets: ReadonlyArray<WidgetZoneId>;
  widgetTabs: WidgetTabs;
}

/** Tabs of [[WidgetStack]] component.
 * @internal
 */
export class WidgetStackTabs extends React.PureComponent<WidgetStackTabsProps> {
  public override render(): React.ReactNode {
    let renderIndex = -1;
    return this.props.widgets.map((widgetId) => {
      const tabs = this.props.widgetTabs[widgetId];
      if (tabs.length <= 0)
        return null;
      renderIndex++;
      return (
        <React.Fragment key={widgetId}>
          {renderIndex < 1 ? undefined : <TabSeparator
            isHorizontal={VerticalAnchorHelpers.isHorizontal(this.props.verticalAnchor)}
          />}
          <WidgetStackTabGroup
            activeTabIndex={this.props.activeTabIndex}
            draggedWidget={this.props.draggedWidget}
            horizontalAnchor={this.props.horizontalAnchor}
            isCollapsed={this.props.isCollapsed}
            isProtruding={this.props.isProtruding}
            isStacked={this.props.widgets.length > 1}
            onTabClick={this.props.onTabClick}
            onTabDrag={this.props.onTabDrag}
            onTabDragEnd={this.props.onTabDragEnd}
            onTabDragStart={this.props.onTabDragStart}
            openWidgetId={this.props.openWidgetId}
            tabs={tabs}
            verticalAnchor={this.props.verticalAnchor}
            widgetId={widgetId}
          />
        </React.Fragment>
      );
    });
  }
}

/** Properties for the [[WidgetStackTabGroup]] component.
 * @internal
 */
export interface WidgetStackTabGroupProps {
  activeTabIndex: number;
  draggedWidget: DraggedWidgetManagerProps | undefined;
  horizontalAnchor: HorizontalAnchor;
  isCollapsed: boolean;
  isProtruding: boolean;
  isStacked: boolean;
  onTabClick: (widgetId: WidgetZoneId, tabIndex: number) => void;
  onTabDrag: (dragged: PointProps) => void;
  onTabDragEnd: () => void;
  onTabDragStart: (widgetId: WidgetZoneId, tabIndex: number, initialPosition: PointProps, firstTabBounds: RectangleProps) => void;
  openWidgetId: WidgetZoneId | undefined;
  tabs: ReadonlyArray<WidgetTab>;
  verticalAnchor: VerticalAnchor;
  widgetId: WidgetZoneId;
}

/** Widget tab group used in [[WidgetStackTabs]] component.
 * @internal
 */
export class WidgetStackTabGroup extends React.PureComponent<WidgetStackTabGroupProps> {
  private _firstTab = React.createRef<Tab>();

  public override render(): React.ReactNode {
    const lastPosition = this.props.draggedWidget ? this.props.draggedWidget.lastPosition : undefined;
    const isWidgetStackOpen = !!this.props.openWidgetId;
    const isWidgetOpen = this.props.openWidgetId === this.props.widgetId;
    const tabs = this.props.tabs.map((tab, index) => {
      const mode = !isWidgetStackOpen ? TabMode.Closed : isWidgetOpen && this.props.activeTabIndex === index ? TabMode.Active : TabMode.Open;
      return (
        <WidgetStackTab
          horizontalAnchor={this.props.horizontalAnchor}
          iconSpec={tab.iconSpec}
          index={index}
          badgeType={tab.badgeType}
          isCollapsed={this.props.isCollapsed}
          isProtruding={this.props.isProtruding}
          key={`${this.props.widgetId}-${index}`}
          lastPosition={lastPosition}
          mode={mode}
          onClick={this._handleTabClick}
          onDrag={this.props.onTabDrag}
          onDragEnd={this.props.onTabDragEnd}
          onDragStart={this._handleTabDragStart}
          tabRef={index === 0 ? this._firstTab : undefined}
          title={tab.title}
          verticalAnchor={this.props.verticalAnchor}
        />
      );
    });

    if (tabs.length > 1) {
      return (
        <TabGroup
          handle={this.getTabHandleMode()}
          horizontalAnchor={this.props.horizontalAnchor}
          isCollapsed={this.props.isCollapsed}
          verticalAnchor={this.props.verticalAnchor}
        >
          {tabs}
        </TabGroup>
      );
    }

    return tabs;
  }

  private getTabHandleMode() {
    if (this.props.draggedWidget && this.props.draggedWidget.id === this.props.widgetId && this.props.draggedWidget.isUnmerge)
      return HandleMode.Visible;

    if (this.props.isStacked)
      return HandleMode.Hovered;

    return HandleMode.Timedout;
  }

  private _handleTabDragStart = (tabIndex: number, initialPosition: PointProps) => {
    if (!this._firstTab.current)
      return;

    const firstTabBounds = Rectangle.create(this._firstTab.current.getBounds()).toProps();
    this.props.onTabDragStart(this.props.widgetId, tabIndex, initialPosition, firstTabBounds);
  };

  private _handleTabClick = (tabIndex: number) => {
    this.props.onTabClick(this.props.widgetId, tabIndex);
  };
}

/** Properties for the [[WidgetStackTab]] component.
 * @internal
 */
export interface WidgetStackTabProps {
  horizontalAnchor: HorizontalAnchor;
  iconSpec?: string | ConditionalStringValue | React.ReactNode;
  index: number;
  badgeType?: BadgeType;
  isCollapsed: boolean;
  isProtruding: boolean;
  lastPosition: PointProps | undefined;
  mode: TabMode;
  onClick: (index: number) => void;
  onDrag: (dragged: PointProps) => void;
  onDragEnd: () => void;
  onDragStart: (index: number, initialPosition: PointProps) => void;
  tabRef?: React.Ref<Tab>;
  title: string;
  verticalAnchor: VerticalAnchor;
}

/** Tab used in [[WidgetStackTabGroup]] component.
 * @internal
 */
export class WidgetStackTab extends React.PureComponent<WidgetStackTabProps> {
  public override render(): React.ReactNode {
    return (
      <Tab
        badge={BadgeUtilities.getComponentForBadgeType(this.props.badgeType)}
        horizontalAnchor={this.props.horizontalAnchor}
        isCollapsed={this.props.isCollapsed}
        isProtruding={this.props.isProtruding}
        lastPosition={this.props.lastPosition}
        mode={this.props.mode}
        onClick={this._handleClick}
        onDrag={this.props.onDrag}
        onDragEnd={this.props.onDragEnd}
        onDragStart={this._handleDragStart}
        ref={this.props.tabRef}
        title={this.props.title}
        verticalAnchor={this.props.verticalAnchor}
      >
        {IconHelper.getIconReactNode(this.props.iconSpec)}
      </Tab>
    );
  }

  private _handleDragStart = (initialPosition: PointProps) => {
    this.props.onDragStart(this.props.index, initialPosition);
  };

  private _handleClick = () => {
    this.props.onClick(this.props.index);
  };
}
