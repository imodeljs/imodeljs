/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

import classnames from "classnames";
import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import { BadgeType, ConditionalStringValue, OnItemExecutedFunc, SpecialKey, StringGetter } from "@bentley/ui-abstract";
import { BadgeUtilities, CommonProps, Icon, IconSpec, SizeProps, withOnOutsideClick } from "@bentley/ui-core";
import {
  Direction, ExpandableItem, GroupColumn, GroupTool, GroupToolExpander, Item, NestedGroup as NestedToolGroupComponent, ToolbarDirectionContext,
  Group as ToolGroupComponent, withDragInteraction,
} from "@bentley/ui-ninezone";
import { ToolGroupPanelContext } from "../frontstage/FrontstageComposer";
import { FrontstageManager, ToolActivatedEventArgs } from "../frontstage/FrontstageManager";
import { KeyboardShortcutManager } from "../keyboardshortcut/KeyboardShortcut";
import { ActionButtonItemDef } from "../shared/ActionButtonItemDef";
import { AnyItemDef } from "../shared/AnyItemDef";
import { GroupItemProps } from "../shared/GroupItemProps";
import { BaseItemState, ItemDefBase } from "../shared/ItemDefBase";
import { ItemList, ItemMap } from "../shared/ItemMap";
import { SyncUiEventArgs, SyncUiEventDispatcher } from "../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../UiFramework";
import { PropsHelper } from "../utils/PropsHelper";
import { ToolbarDragInteractionContext } from "./DragInteraction";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ToolGroup = withOnOutsideClick(ToolGroupComponent, undefined, false);
// eslint-disable-next-line @typescript-eslint/naming-convention
const NestedToolGroup = withOnOutsideClick(NestedToolGroupComponent, undefined, false);
// eslint-disable-next-line @typescript-eslint/naming-convention
const ItemWithDragInteraction = withDragInteraction(Item);

// -----------------------------------------------------------------------------
// GroupItemDef class
// -----------------------------------------------------------------------------

/** An Item that opens a group of items.
 * @public
 */
export class GroupItemDef extends ActionButtonItemDef {
  private static _sId = 0;
  public static groupIdPrefix = "Group-";

  public groupId: string;
  public direction: Direction;
  public itemsInColumn: number;
  public items: AnyItemDef[];
  public directionExplicit: boolean;
  public defaultActiveItemId?: string;

  /** @internal */
  public overflow: boolean = false;

  private _itemList!: ItemList;
  private _itemMap!: ItemMap;
  private _panelLabel: string | StringGetter | ConditionalStringValue = "";

  constructor(groupItemProps: GroupItemProps, onItemExecuted?: OnItemExecutedFunc) {
    super(groupItemProps, onItemExecuted);

    this.groupId = (groupItemProps.groupId !== undefined) ? groupItemProps.groupId : "";
    if (groupItemProps.groupId)
      this.groupId = groupItemProps.groupId;
    else {
      GroupItemDef._sId++;
      this.groupId = GroupItemDef.groupIdPrefix + GroupItemDef._sId;
    }

    this.directionExplicit = (groupItemProps.direction !== undefined);
    this.direction = (groupItemProps.direction !== undefined) ? groupItemProps.direction : Direction.Bottom;
    this.itemsInColumn = (groupItemProps.itemsInColumn !== undefined) ? groupItemProps.itemsInColumn : 7;
    this._panelLabel = PropsHelper.getStringSpec(groupItemProps.panelLabel, groupItemProps.panelLabelKey); // eslint-disable-line deprecation/deprecation
    this.items = groupItemProps.items;
    this.defaultActiveItemId = groupItemProps.defaultActiveItemId;
  }

  public get id(): string {
    return this.groupId;
  }

  /** Get the panelLabel string */
  public get panelLabel(): string {
    return PropsHelper.getStringFromSpec(this._panelLabel);
  }

  /** Set the panelLabel.
   * @param v A string or a function to get the string.
   */
  public setPanelLabel(v: string | StringGetter | ConditionalStringValue) {
    this._panelLabel = v;
  }

  public resolveItems(force?: boolean): void {
    if (this._itemList && !force)
      return;

    this._itemList = new ItemList();
    this._itemMap = new ItemMap();

    this.items.map((item: AnyItemDef) => {
      const id: string = item.id;
      this._itemList.addItem(item);
      this._itemMap.set(id, item);
    });
  }

  public getItemById(id: string): ItemDefBase | undefined {
    return this._itemMap.get(id);
  }

  public getItemByIndex(index: number): ItemDefBase | undefined {
    return this._itemList.items[index];
  }

  public get itemCount(): number {
    return this._itemList.items.length;
  }

  public override execute(): void {
  }

  public override toolbarReactNode(index?: number): React.ReactNode {
    this.resolveItems();
    const key = this.getKey(index);

    return (
      <GroupItem
        groupItemDef={this}
        key={key}
        onSizeKnown={this.handleSizeKnown}
      />
    );
  }

}

// -----------------------------------------------------------------------------
// GroupItem component, props & state
// -----------------------------------------------------------------------------

interface ToolGroupItem {
  iconSpec?: IconSpec;
  label: string;
  trayId?: string;
  badgeType?: BadgeType;
}

interface ToolGroupTray {
  title: string;
  items: Map<string, ToolGroupItem>;
  groupItemDef: GroupItemDef;
}
type ToolGroupTrayMap = Map<string, ToolGroupTray>;

interface GroupItemComponentProps extends CommonProps {
  groupItemDef: GroupItemDef;
  onSizeKnown?: (size: SizeProps) => void;
}

interface GroupItemState extends BaseItemState {
  activeItemId: string; // One of group items id.
  activeToolId: string; // FrontstageManager.activeToolId
  groupItemDef: GroupItemDef;
  trayId: string;
  backTrays: ReadonlyArray<string>;
  trays: ToolGroupTrayMap;
}

/** Group Item React component.
 * @internal
 */
export class GroupItem extends React.Component<GroupItemComponentProps, GroupItemState> {
  /** @internal */
  public override readonly state: Readonly<GroupItemState>;
  private _componentUnmounting = false;
  private _childSyncIds?: Set<string>;
  private _childRefreshRequired = false;
  private _trayIndex = 0;
  private _closeOnPanelOpened = true;
  private _ref = React.createRef<HTMLDivElement>();

  constructor(props: GroupItemComponentProps) {
    super(props);

    this._loadChildSyncIds(props);
    const state = this.getGroupItemState(this.props);
    const activeItemId = this.props.groupItemDef.defaultActiveItemId !== undefined ? this.props.groupItemDef.defaultActiveItemId : getFirstItemId(this.props.groupItemDef);
    this.state = {
      ...state,
      activeItemId,
    };
  }

  private _loadChildSyncIds(props: GroupItemComponentProps) {
    // istanbul ignore else
    if (props.groupItemDef && props.groupItemDef.items.length > 0) {
      props.groupItemDef.items.forEach((itemDef: AnyItemDef) => {
        const item: ItemDefBase | undefined = itemDef;
        if (item.stateSyncIds.length > 0) { // eslint-disable-line deprecation/deprecation
          if (undefined === this._childSyncIds)
            this._childSyncIds = new Set<string>();
          item.stateSyncIds.forEach((value) => this._childSyncIds!.add(value)); // eslint-disable-line deprecation/deprecation
        }
      });
    }
  }

  private _handleSyncUiEvent = (args: SyncUiEventArgs): void => {
    // istanbul ignore next
    if (this._componentUnmounting) return;
    let refreshState = false;
    // istanbul ignore else
    if (this._childSyncIds && this._childSyncIds.size > 0)
      if ([...this._childSyncIds].some((value: string): boolean => args.eventIds.has(value.toLowerCase())))
        this._childRefreshRequired = true;  // this is cleared when render occurs
    let newState: GroupItemState = { ...this.state };
    if (this.props.groupItemDef.stateSyncIds && this.props.groupItemDef.stateSyncIds.length > 0) // eslint-disable-line deprecation/deprecation
      refreshState = this.props.groupItemDef.stateSyncIds.some((value: string): boolean => args.eventIds.has(value.toLowerCase())); // eslint-disable-line deprecation/deprecation
    if (refreshState || this._childRefreshRequired) {
      if (this.props.groupItemDef.stateFunc) // eslint-disable-line deprecation/deprecation
        newState = this.props.groupItemDef.stateFunc(newState) as GroupItemState; // eslint-disable-line deprecation/deprecation
      // istanbul ignore else
      if ((this.state.isActive !== newState.isActive) || (this.state.isEnabled !== newState.isEnabled) || (this.state.isVisible !== newState.isVisible)
        || this._childRefreshRequired) {
        this.setState({ isActive: newState.isActive, isEnabled: newState.isEnabled, isVisible: newState.isVisible, isPressed: newState.isPressed });
      }
    }
  };

  public override componentDidMount() {
    SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
    FrontstageManager.onToolActivatedEvent.addListener(this._handleToolActivatedEvent);
    FrontstageManager.onToolPanelOpenedEvent.addListener(this._handleToolPanelOpenedEvent);
  }

  public override componentWillUnmount() {
    this._componentUnmounting = true;
    SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
    FrontstageManager.onToolActivatedEvent.removeListener(this._handleToolActivatedEvent);
    FrontstageManager.onToolPanelOpenedEvent.removeListener(this._handleToolPanelOpenedEvent);
  }

  public override shouldComponentUpdate(nextProps: GroupItemComponentProps, nextState: GroupItemState) {
    if (!PropsHelper.isShallowEqual(nextState, this.state))
      return true;
    if (!PropsHelper.isShallowEqual(nextProps, this.props))
      return true;

    // istanbul ignore else
    if (this._childRefreshRequired) {
      this._childRefreshRequired = false;
      return true;
    }

    // istanbul ignore next
    return false;
  }

  private getGroupItemState(props: GroupItemComponentProps) {
    const groupItemDef = props.groupItemDef;
    // Separate into trays
    const trays = new Map<string, ToolGroupTray>();
    const trayId = this.resetTrayId();

    this.processGroupItemDef(groupItemDef, trayId, trays);

    return {
      activeToolId: FrontstageManager.activeToolId,
      groupItemDef,
      isEnabled: groupItemDef.isEnabled, // eslint-disable-line deprecation/deprecation
      isPressed: groupItemDef.isPressed,
      isVisible: groupItemDef.isVisible, // eslint-disable-line deprecation/deprecation
      trayId,
      backTrays: [],
      trays,
    };
  }

  private resetTrayId(): string {
    this._trayIndex = 1;
    return `tray-${this._trayIndex}`;
  }

  private generateTrayId(): string {
    return `tray-${this._trayIndex}`;
  }

  private processGroupItemDef(groupItemDef: GroupItemDef, trayId: string, trays: ToolGroupTrayMap): void {
    // Separate into column items
    const items = new Map<string, ToolGroupItem>();
    for (let itemIndex = 0; itemIndex < groupItemDef.itemCount; itemIndex++) {
      const item = groupItemDef.getItemByIndex(itemIndex)!;
      if (item instanceof GroupItemDef) {
        item.resolveItems();

        this._trayIndex++;
        const itemTrayId = this.generateTrayId();
        const groupItem: ToolGroupItem = {
          iconSpec: item.iconSpec, label: item.label, trayId: itemTrayId,
          badgeType: item.badgeType,
        };

        items.set(item.id, groupItem);
        this.processGroupItemDef(item, itemTrayId, trays);
      } else {
        items.set(item.id, item);
      }
    }

    trays.set(trayId, {
      items,
      title: groupItemDef.panelLabel ? groupItemDef.panelLabel : groupItemDef.tooltip, // we fallback to use tooltip since tooltip was originally (and confusingly) used as a panelLabel
      groupItemDef,
    });
  }

  public override componentDidUpdate(prevProps: GroupItemComponentProps, _prevState: GroupItemState) {
    if (this.props !== prevProps) {
      // istanbul ignore next
      if (this.props.groupItemDef !== prevProps.groupItemDef)
        Logger.logTrace(UiFramework.loggerCategory(this), `Different GroupItemDef for same groupId of ${this.state.groupItemDef.groupId}`);
      this.setState((_, props) => this.getGroupItemState(props));
    }
  }

  private get _tray() {
    const tray = this.state.trays.get(this.state.trayId);
    // istanbul ignore next
    if (!tray)
      throw new RangeError();

    return tray;
  }

  private getTray(trayId: string) {
    const tray = this.state.trays.get(trayId);
    // istanbul ignore next
    if (!tray)
      throw new RangeError();

    return tray;
  }

  private _handleKeyDown = (e: React.KeyboardEvent): void => {
    // istanbul ignore else
    if (e.key === SpecialKey.Escape) {
      this.closeGroupButton();
      KeyboardShortcutManager.setFocusToHome();
    }
  };

  public override render(): React.ReactNode {
    if (!this.state.isVisible)
      return null;

    const activeItem = this.getItemById(this.state.activeItemId);
    if (!activeItem)
      return null;

    const { groupItemDef, className, ...props } = this.props;
    const classNames = classnames(
      className,
      groupItemDef.overflow && "nz-toolbar-item-overflow",
    );
    const badge = BadgeUtilities.getComponentForBadgeType(groupItemDef.badgeType);
    return (
      <ToolbarDirectionContext.Consumer>
        {(direction) => (
          <ToolbarDragInteractionContext.Consumer>
            {(dragInteraction) => (
              <ExpandableItem
                {...props}
                className={classNames}
                key={this.state.groupItemDef.id}
                panel={this.getGroupTray(dragInteraction)}
              >
                {dragInteraction ?
                  (
                    <div ref={this._ref}>
                      <ItemWithDragInteraction
                        badge={badge}
                        className={groupItemDef.overflow ? "nz-ellipsis-icon" : undefined}
                        direction={direction}
                        icon={<Icon
                          iconSpec={groupItemDef.overflow ? "nz-ellipsis" : activeItem.iconSpec}
                        />}
                        isActive={groupItemDef.overflow ? false : this.state.activeToolId === this.state.activeItemId}
                        isDisabled={!this.state.isEnabled}
                        onClick={groupItemDef.overflow ? this._handleOverflowClick : this._handleDragInteractionClick}
                        onKeyDown={this._handleKeyDown}
                        onOpenPanel={this._handleOpenPanel}
                        onSizeKnown={this.props.onSizeKnown}
                        title={groupItemDef.overflow ? groupItemDef.label : activeItem.label}
                      />
                    </div>
                  ) :
                  (
                    <div ref={this._ref}>
                      <Item
                        badge={badge}
                        className={groupItemDef.overflow ? "nz-ellipsis-icon" : undefined}
                        icon={<Icon
                          iconSpec={groupItemDef.overflow ? "nz-ellipsis" : groupItemDef.iconSpec}
                        />}
                        isDisabled={!this.state.isEnabled}
                        onClick={this._handleClick}
                        onKeyDown={this._handleKeyDown}
                        onSizeKnown={this.props.onSizeKnown}
                        title={this.state.groupItemDef.label}
                      />
                    </div>
                  )}
              </ExpandableItem>
            )}
          </ToolbarDragInteractionContext.Consumer>
        )}
      </ToolbarDirectionContext.Consumer>
    );
  }

  private _handleOpenPanel = () => {
    this.setState({
      isPressed: true,
    });
    this._closeOnPanelOpened = false;
    FrontstageManager.onToolPanelOpenedEvent.emit();
    this._closeOnPanelOpened = true;
  };

  private _handleClick = () => {
    this.setState((prevState) => ({
      isPressed: !prevState.isPressed,
    }));
  };

  private _handleDragInteractionClick = () => {
    const activeItem = this.getItemById(this.state.activeItemId);
    activeItem && activeItem instanceof ActionButtonItemDef && activeItem.execute();
  };

  private _handleOverflowClick = () => {
    this.setState((prevState) => {
      const isPressed = !prevState.isPressed;
      return {
        isPressed,
      };
    }, () => {
      this._closeOnPanelOpened = false;
      !!this.state.isPressed && FrontstageManager.onToolPanelOpenedEvent.emit();
      this._closeOnPanelOpened = true;
    });
  };

  private _handleDragInteractionOutsideClick = (e: MouseEvent) => {
    if (this.props.groupItemDef.overflow) {
      this._ref.current && (e.target instanceof Node) && !this._ref.current.contains(e.target) && this.closeGroupButton();
      return;
    }
    this.closeGroupButton();
  };

  private _handleOutsideClick = (e: MouseEvent) => {
    this._ref.current && (e.target instanceof Node) && !this._ref.current.contains(e.target) && this.closeGroupButton();
  };

  private _handleToolActivatedEvent = ({ toolId }: ToolActivatedEventArgs) => {
    this.setState({
      activeToolId: toolId,
    });
  };

  private _handleToolPanelOpenedEvent = () => {
    // istanbul ignore else
    if (!this._closeOnPanelOpened)
      return;
    // istanbul ignore next
    this.closeGroupButton();
  };

  private closeGroupButton() {
    const trayId = this.resetTrayId();

    this.setState({
      isPressed: false,
      trayId,
      backTrays: [],
    });
  }

  private handleToolGroupItemClicked(trayKey: string, itemKey: string) {
    const trayId = this.resetTrayId();
    this.setState(
      {
        activeItemId: itemKey,
        isPressed: false,
        trayId,
        backTrays: [],
      },
      () => {
        const tray = this.getTray(trayKey);
        const childItem = tray.groupItemDef.getItemById(itemKey);
        childItem && childItem instanceof ActionButtonItemDef && childItem.execute();
      },
    );
  }

  private getGroupTray(dragInteraction: boolean): React.ReactNode {
    if (!this.state.isPressed)
      return undefined;

    return (
      <ToolGroupPanelContext.Consumer>
        {(activateOnPointerUp) => {
          const tray = this._tray;
          const itemsInColumn = tray.groupItemDef.itemsInColumn;
          const items = [...tray.items.keys()];
          activateOnPointerUp = activateOnPointerUp && dragInteraction;

          // Divide items equally between columns.
          const numberOfColumns = Math.ceil(items.length / itemsInColumn);
          const numberItemsInColumn = Math.ceil(items.length / numberOfColumns);

          const columnToItems = items.reduce<ReadonlyArray<ReadonlyArray<string>>>((acc, item, index) => {
            const columnIndex = Math.floor(index / numberItemsInColumn);
            if (columnIndex >= acc.length) {
              return [
                ...acc,
                [item],
              ];
            }
            return [
              ...acc.slice(0, columnIndex),
              [
                ...acc[columnIndex],
                item,
              ],
              ...acc.slice(columnIndex + 1),
            ];
          }, []);
          const columns = (columnToItems.map((columnItems, columnIndex) =>
            <GroupColumn key={columnIndex}>
              {columnItems.map((itemKey) => {
                const item = tray.items.get(itemKey)!;
                const icon = <Icon iconSpec={item.iconSpec} />;
                let isVisible = true;
                let isActive = itemKey === this.state.activeToolId;
                let isEnabled = true;
                const badge = BadgeUtilities.getComponentForBadgeType(item.badgeType);

                if (item instanceof ItemDefBase) {
                  isVisible = item.isVisible; // eslint-disable-line deprecation/deprecation
                  isEnabled = item.isEnabled; // eslint-disable-line deprecation/deprecation
                  if (item.stateFunc) { // eslint-disable-line deprecation/deprecation
                    const newState = item.stateFunc({ isVisible, isActive, isEnabled }); // eslint-disable-line deprecation/deprecation
                    isVisible = undefined !== newState.isVisible ? newState.isVisible : /* istanbul ignore next */ isVisible;
                    isEnabled = undefined !== newState.isEnabled ? newState.isEnabled : /* istanbul ignore next */ isEnabled;
                    isActive = undefined !== newState.isActive ? newState.isActive : /* istanbul ignore next */ isActive;
                  }
                }

                const trayId = item.trayId;
                if (trayId) {
                  return (
                    isVisible &&
                    <GroupToolExpander
                      isDisabled={!isEnabled}
                      key={itemKey}
                      label={item.label}
                      icon={icon}
                      badge={badge}
                      onClick={() => this._handleExpanderClick(trayId)}
                      onPointerUp={activateOnPointerUp ? () => this._handleExpanderClick(trayId) : undefined}
                    />
                  );
                }

                return (
                  isVisible &&
                  <GroupTool
                    isDisabled={!isEnabled}
                    isActive={isActive}
                    key={itemKey}
                    label={item.label}
                    onClick={() => this.handleToolGroupItemClicked(this.state.trayId, itemKey)}
                    onPointerUp={activateOnPointerUp ? () => this.handleToolGroupItemClicked(this.state.trayId, itemKey) : undefined}
                    icon={icon}
                    badge={badge}
                  />
                );
              })}
            </GroupColumn>,
          ));

          if (this.state.backTrays.length > 0)
            return (
              <NestedToolGroup
                columns={columns}
                onBack={this._handleBack}
                onBackPointerUp={activateOnPointerUp ? this._handleBack : undefined}
                onOutsideClick={dragInteraction ? this._handleDragInteractionOutsideClick : this._handleOutsideClick}
                title={tray.title}
              />
            );

          return (
            <ToolGroup
              columns={columns}
              onOutsideClick={dragInteraction ? this._handleDragInteractionOutsideClick : this._handleOutsideClick}
              title={tray.title}
            />
          );
        }}
      </ToolGroupPanelContext.Consumer>
    );
  }

  public getItemById(id: string): ItemDefBase | undefined {
    for (const [, tray] of this.state.trays) {
      const item = tray.groupItemDef.getItemById(id);
      if (item)
        return item;
    }
    return undefined;
  }

  private _handleBack = () => {
    this.setState((prevState) => {
      const trayId = prevState.backTrays.length > 0 ? prevState.backTrays[prevState.backTrays.length - 1] : prevState.trayId;
      const backTrays = prevState.backTrays.slice(0, -1);
      return {
        trayId,
        backTrays,
      };
    });
  };

  private _handleExpanderClick = (trayId: string) => {
    this.setState((prevState) => {
      return {
        trayId,
        backTrays: [...prevState.backTrays, prevState.trayId],
      };
    });
  };
}

/** Properties for the [[GroupButton]] React component
 * @public
 */
export interface GroupButtonProps extends GroupItemProps, CommonProps { }

/** Group Button React component
 * @public
 */
export function GroupButton(props: GroupButtonProps) {
  const groupItemDef = new GroupItemDef(props);
  groupItemDef.resolveItems();
  return (
    <GroupItem
      {...props}
      groupItemDef={groupItemDef}
      key={groupItemDef.id}
    />
  );
}

/** @internal */
export const getFirstItem = (groupItemDef: GroupItemDef): AnyItemDef | undefined => {
  for (const item of groupItemDef.items) {
    if (item instanceof GroupItemDef) {
      const firstItem = getFirstItem(item);
      if (firstItem)
        return firstItem;
      continue;
    }
    return item;
  }
  return undefined;
};

/** @internal */
export const getFirstItemId = (groupItemDef: GroupItemDef): string => {
  const item = getFirstItem(groupItemDef);
  return item ? item.id : "";
};
