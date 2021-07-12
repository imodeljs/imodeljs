/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Cursor
 */

import * as React from "react";
import { CommonProps, GlobalContextMenu } from "@bentley/ui-core"; // ContextSubMenu,
import { SessionStateActionId } from "../../redux/SessionState";
import { MenuItemHelpers, MenuItemProps } from "../../shared/MenuItem";
import { SyncUiEventArgs, SyncUiEventDispatcher } from "../../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../../UiFramework";
import { Logger } from "@bentley/bentleyjs-core";

/** State for [[CursorPopupMenu]] component
 * @alpha
 */
interface CursorPopupMenuState {
  menuX: number;
  menuY: number;
  menuVisible: boolean;
  items?: MenuItemProps[];
}

/** Popup Menu to show at cursor typically used by tools to provide a right-click context menu.
 * @alpha
 */
// istanbul ignore next
export class CursorPopupMenu extends React.PureComponent<CommonProps, CursorPopupMenuState> {
  private _componentUnmounting = false;  // used to ensure _handleSyncUiEvent callback is not processed after componentWillUnmount is called
  private _hostChildWindowId?: string;

  /** @internal */
  public override readonly state: CursorPopupMenuState = {
    menuX: 0,
    menuY: 0,
    menuVisible: false,
    items: undefined,
  };

  private _handleSyncUiEvent = (args: SyncUiEventArgs): void => {
    /* istanbul ignore next */
    if (this._componentUnmounting)
      return;

    /* istanbul ignore else */
    if (SyncUiEventDispatcher.hasEventOfInterest(args.eventIds, [SessionStateActionId.UpdateCursorMenu])) {
      const menuData = UiFramework.getCursorMenuData();
      if (menuData && this._hostChildWindowId === menuData.childWindowId) {
        this.setState({ menuVisible: menuData.items && menuData.items.length > 0, items: menuData.items, menuX: menuData.position.x, menuY: menuData.position.y });
      } else {
        this.setState({ menuVisible: false, items: undefined });
      }
    }
  };

  public override componentDidMount() {
    SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
  }

  public override componentWillUnmount() {
    this._componentUnmounting = true;
    SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
  }

  private _handleRefSet = (popupDiv: HTMLElement | null) => {
    const parentWindow = popupDiv?.ownerDocument.defaultView ?? undefined;
    // if the window is not a pop out set to undefined
    this._hostChildWindowId = UiFramework.childWindowManager.findChildWindowId(parentWindow);
    Logger.logInfo(UiFramework.loggerCategory(UiFramework), `Cursor Menu for ${this._hostChildWindowId ?? "main"} window`);
  };

  public override render(): React.ReactNode {
    const { menuX, menuY, items, menuVisible } = this.state;
    const onClose = this._hideContextMenu;

    return (
      <div className="uifw-cursor-menu-container-div" ref={this._handleRefSet}>
        {items && items.length > 0 && menuVisible &&
          <GlobalContextMenu
            className={this.props.className}
            style={this.props.style}
            identifier="cursor-popup-menu"
            x={menuX}
            y={menuY}
            opened={menuVisible}
            onEsc={onClose}
            onOutsideClick={onClose}
            edgeLimit={false}
            autoflip={true}
          >
            {MenuItemHelpers.createMenuItemNodes(MenuItemHelpers.createMenuItems(items, this._itemPicked))}
          </GlobalContextMenu>
        }
      </div>
    );
  }

  private _hideContextMenu = () => {
    this.setState({ menuVisible: false });
  };

  private _itemPicked = (): void => {
    this._hideContextMenu();
  };
}
