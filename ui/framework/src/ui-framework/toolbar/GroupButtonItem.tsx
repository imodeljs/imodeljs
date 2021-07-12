/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import classnames from "classnames";
import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import {
  ActionButton, ConditionalBooleanValue, ConditionalStringValue, GroupButton, OnItemExecutedFunc, ToolbarItemUtilities,
} from "@bentley/ui-abstract";
import { BadgeUtilities, CommonProps, withOnOutsideClick } from "@bentley/ui-core";
import {
  ExpandableItem, GroupColumn, GroupTool, GroupToolExpander, Item, NestedGroup as NestedToolGroupComponent, ToolbarDirectionContext,
  Group as ToolGroupComponent, withDragInteraction,
} from "@bentley/ui-ninezone";
import { ToolGroupPanelContext } from "../frontstage/FrontstageComposer";
import { FrontstageManager, ToolActivatedEventArgs } from "../frontstage/FrontstageManager";
import { UiFramework } from "../UiFramework";
import { PropsHelper } from "../utils/PropsHelper";
import { ToolbarDragInteractionContext } from "./DragInteraction";
import { ToolbarHelper } from "./ToolbarHelper";

import { onEscapeSetFocusToHome } from "../hooks/useEscapeSetFocusToHome";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ToolGroup = withOnOutsideClick(ToolGroupComponent, undefined, false);
// eslint-disable-next-line @typescript-eslint/naming-convention
const NestedToolGroup = withOnOutsideClick(NestedToolGroupComponent, undefined, false);
// eslint-disable-next-line @typescript-eslint/naming-convention
const ItemWithDragInteraction = withDragInteraction(Item);

// -----------------------------------------------------------------------------
// ToolbarGroupItem component, props & state
// -----------------------------------------------------------------------------

interface ToolGroupItem {
  trayId?: string;
  item: ActionButton | GroupButton;
}

interface ToolGroupTray {
  title?: string;
  items: Map<string, ToolGroupItem>;
  groupItem: GroupButton;
}
type ToolGroupTrayMap = Map<string, ToolGroupTray>;

interface ToolbarGroupItemComponentProps extends CommonProps {
  groupItem: GroupButton;
  onItemExecuted?: OnItemExecutedFunc;
}

interface ToolbarGroupItemState {
  activeItemId: string; // One of group items id.
  activeToolId: string; // FrontstageManager.activeToolId
  groupItem: GroupButton;
  trayId: string;
  backTrays: ReadonlyArray<string>;
  trays: ToolGroupTrayMap;
  isEnabled: boolean;
  isPressed: boolean;
  isVisible: boolean;
}

/** Group Item React component.
 * @internal
 */
export class ToolbarGroupItem extends React.Component<ToolbarGroupItemComponentProps, ToolbarGroupItemState> {
  /** @internal */
  public override readonly state: Readonly<ToolbarGroupItemState>;
  private _trayIndex = 0;
  private _closeOnPanelOpened = true;
  private _ref = React.createRef<HTMLDivElement>();

  constructor(props: ToolbarGroupItemComponentProps) {
    super(props);

    const state = this.getGroupItemState(this.props);
    // TODO: The defaultActiveItemId should come from session storage
    const activeItemId = getFirstItemId(this.props.groupItem);
    this.state = {
      ...state,
      activeItemId,
    };
  }

  public override componentDidMount() {
    FrontstageManager.onToolActivatedEvent.addListener(this._handleToolActivatedEvent);
    FrontstageManager.onToolPanelOpenedEvent.addListener(this._handleToolPanelOpenedEvent);
  }

  public override componentWillUnmount() {
    FrontstageManager.onToolActivatedEvent.removeListener(this._handleToolActivatedEvent);
    FrontstageManager.onToolPanelOpenedEvent.removeListener(this._handleToolPanelOpenedEvent);
  }

  private getGroupItemState(props: ToolbarGroupItemComponentProps) {
    const groupItem = props.groupItem;
    // Separate into trays
    const trays = new Map<string, ToolGroupTray>();
    const trayId = this.resetTrayId();

    this.processGroupItem(groupItem, trayId, trays);
    const isHidden = ConditionalBooleanValue.getValue(groupItem.isHidden);
    const isDisabled = ConditionalBooleanValue.getValue(groupItem.isDisabled);

    return {
      activeToolId: FrontstageManager.activeToolId,
      groupItem,
      isEnabled: !isDisabled,
      isPressed: false,
      isVisible: !isHidden,
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

  private processGroupItem(groupItem: GroupButton, trayId: string, trays: ToolGroupTrayMap): void {
    // Separate into column items
    const items = new Map<string, ToolGroupItem>();
    groupItem.items.forEach((item) => {
      if (ToolbarItemUtilities.isGroupButton(item)) {
        this._trayIndex++;
        const itemTrayId = this.generateTrayId();
        const toolGroupItem: ToolGroupItem = {
          trayId: itemTrayId,
          item,
        };

        items.set(item.id, toolGroupItem);
        this.processGroupItem(item, itemTrayId, trays);
      } else {
        const toolItem: ToolGroupItem = { item };
        items.set(item.id, toolItem);
      }
    });

    trays.set(trayId, {
      items,
      title: ConditionalStringValue.getValue(groupItem.panelLabel),
      groupItem,
    });
  }

  public override componentDidUpdate(prevProps: ToolbarGroupItemComponentProps, _prevState: ToolbarGroupItemState) {
    if (!PropsHelper.isShallowEqual(this.props, prevProps)) {
      // istanbul ignore else
      if (this.props.groupItem !== prevProps.groupItem)
        Logger.logTrace(UiFramework.loggerCategory(this), `Different ToolbarGroupItem for same groupId of ${this.state.groupItem.id}`);
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

  public override render(): React.ReactNode {
    if (!this.state.isVisible)
      return null;

    const activeItem = this.getItemById(this.state.activeItemId);
    // istanbul ignore next
    if (!activeItem)
      return null;

    const { groupItem, className, ...props } = this.props;
    const classNames = classnames(
      className,
    );
    const badge = BadgeUtilities.getComponentForBadgeType(groupItem.badgeType);  // eslint-disable-line deprecation/deprecation

    return (
      <ToolbarDirectionContext.Consumer>
        {(direction) => (
          <ToolbarDragInteractionContext.Consumer>
            {(dragInteraction) => (
              <ExpandableItem
                {...props}
                className={classNames}
                key={this.state.groupItem.id}
                panel={this.getGroupTray(dragInteraction)}
              >
                {dragInteraction ?
                  (
                    <div ref={this._ref}>
                      <ItemWithDragInteraction
                        badge={badge}
                        direction={direction}
                        icon={ToolbarHelper.getIconReactNode(activeItem)}
                        isActive={this.state.activeToolId === this.state.activeItemId}
                        isDisabled={!this.state.isEnabled}
                        onClick={this._handleDragInteractionClick}
                        onKeyDown={onEscapeSetFocusToHome}
                        onOpenPanel={this._handleOpenPanel}
                        title={ConditionalStringValue.getValue(activeItem.label)}
                      />
                    </div>
                  ) :
                  (
                    <div ref={this._ref}>
                      <Item
                        badge={badge}
                        icon={ToolbarHelper.getIconReactNode(groupItem)}
                        isDisabled={!this.state.isEnabled}
                        onClick={this._handleClick}
                        onKeyDown={onEscapeSetFocusToHome}
                        title={ConditionalStringValue.getValue(this.state.groupItem.label)}
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
    activeItem && ToolbarItemUtilities.isActionButton(activeItem) && activeItem.execute();
  };

  private _handleDragInteractionOutsideClick = (_e: MouseEvent) => {
    this.closeGroupButton();
  };

  private _handleOutsideClick = (e: MouseEvent) => {
    this._ref.current && (e.target instanceof Node) && !this._ref.current.contains(e.target) && this.closeGroupButton();
  };

  // istanbul ignore next
  private _handleToolActivatedEvent = ({ toolId }: ToolActivatedEventArgs) => {
    this.setState({
      activeToolId: toolId,
    });
  };

  // istanbul ignore next
  private _handleToolPanelOpenedEvent = () => {
    if (!this._closeOnPanelOpened)
      return;
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
        const childItem = tray.groupItem.items.find((item) => itemKey === item.id);
        // istanbul ignore else
        if (childItem) {
          // istanbul ignore else
          if (ToolbarItemUtilities.isActionButton(childItem)) {
            childItem.execute();
            if (this.props.onItemExecuted)
              this.props.onItemExecuted(childItem);
          }
        }
      },
    );
  }

  private getItemsInColumn(numTotalItems: number): number {
    if (numTotalItems <= 6)
      return numTotalItems;
    if (numTotalItems <= 24)
      return Math.ceil(numTotalItems / 2);
    if (numTotalItems <= 36)
      return Math.ceil(numTotalItems / 3);
    return Math.ceil(numTotalItems / 4);
  }

  private getGroupTray(dragInteraction: boolean): React.ReactNode {
    if (!this.state.isPressed)
      return undefined;

    return (
      <ToolGroupPanelContext.Consumer>
        {(activateOnPointerUp) => {
          const tray = this._tray;
          const items = [...tray.items.keys()];
          const itemsInColumn = this.getItemsInColumn(items.length); // tray.groupItem.itemsInColumn;

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
                const tgItem = tray.items.get(itemKey)!;
                const item = tgItem.item;
                const icon = ToolbarHelper.getIconReactNode(item);
                const isVisible = true;
                const isActive = itemKey === this.state.activeToolId;
                const badge = BadgeUtilities.getComponentForBadgeType(item.badgeType);

                if (tgItem.trayId) {
                  return (
                    isVisible &&
                    <GroupToolExpander
                      isDisabled={!!item.isDisabled}
                      key={itemKey}
                      label={ConditionalStringValue.getValue(item.label)}
                      icon={icon}
                      badge={badge}
                      onClick={() => this._handleExpanderClick(tgItem.trayId!)}
                      onPointerUp={activateOnPointerUp ? () => this._handleExpanderClick(tgItem.trayId!) : undefined}
                    />
                  );
                }

                return (
                  isVisible &&
                  <GroupTool
                    isDisabled={!!item.isDisabled}
                    isActive={isActive}
                    key={itemKey}
                    label={ConditionalStringValue.getValue(item.label)}
                    onClick={
                      // istanbul ignore next
                      () => this.handleToolGroupItemClicked(this.state.trayId, itemKey)
                    }
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
                onOutsideClick={dragInteraction ? this._handleDragInteractionOutsideClick : /* istanbul ignore next */ this._handleOutsideClick}
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

  public getItemById(id: string): ActionButton | GroupButton | undefined {
    for (const [, tray] of this.state.trays) {
      const item = tray.groupItem.items.find((childItem) => id === childItem.id);
      if (item)
        return item;
    }
    // istanbul ignore next
    return undefined;
  }

  private _handleBack = () => {
    this.setState((prevState) => {
      const trayId = prevState.backTrays.length > 0 ? prevState.backTrays[prevState.backTrays.length - 1] : /* istanbul ignore next */ prevState.trayId;
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

/** @internal */
const getFirstItem = (groupItem: GroupButton): ActionButton | GroupButton | undefined => {
  for (const item of groupItem.items) {
    const isHidden = ConditionalBooleanValue.getValue(item.isHidden);
    const isDisabled = ConditionalBooleanValue.getValue(item.isDisabled);

    if (ToolbarItemUtilities.isGroupButton(item)) {
      const firstItem = getFirstItem(item);
      // istanbul ignore else
      if (firstItem)
        return firstItem;
      // istanbul ignore next
      continue;
    }
    if (!isHidden && !isDisabled)
      return item;
  }
  return undefined;
};

/** @internal */
const getFirstItemId = (groupItem: GroupButton): string => {
  const item = getFirstItem(groupItem);
  return item ? item.id : "";
};

/** Action button props
 *  @internal
 */
interface GroupButtonProps {
  item: GroupButton;
  onItemExecuted?: OnItemExecutedFunc;
}

/** Group Button React component
 * @internal
 */
export function GroupButtonItem(props: GroupButtonProps) {
  return (
    <ToolbarGroupItem
      groupItem={props.item}
      key={props.item.id}
      onItemExecuted={props.onItemExecuted}
    />
  );
}
