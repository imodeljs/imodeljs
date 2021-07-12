/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module KeyboardShortcut
 */

import * as React from "react";
import { CommonProps, ContextMenuItem, ContextSubMenu, GlobalContextMenu, UiEvent } from "@bentley/ui-core";
import { KeyboardShortcut } from "./KeyboardShortcut";
import { ConditionalBooleanValue } from "@bentley/ui-abstract";

/** State for a [[KeyboardShortcutMenuEvent]] and [[KeyboardShortcutMenu]] component
 * @public
 */
export interface KeyboardShortcutMenuState {
  menuVisible: boolean;
  menuX: number;
  menuY: number;
  shortcuts?: KeyboardShortcut[];
}

/** KeyboardShortcut Menu Event class.
 * @public
 */
export class KeyboardShortcutMenuEvent extends UiEvent<KeyboardShortcutMenuState> { }

/** React component that displays a context menu at the cursor containing keyboard shortcuts.
 * @public
 */
export class KeyboardShortcutMenu extends React.PureComponent<CommonProps, KeyboardShortcutMenuState> {

  /** @internal */
  public override readonly state: KeyboardShortcutMenuState = {
    menuVisible: false,
    menuX: 0,
    menuY: 0,
  };

  /** Get KeyboardShortcut Menu Event. */
  public static readonly onKeyboardShortcutMenuEvent = new KeyboardShortcutMenuEvent();

  public override componentDidMount() {
    KeyboardShortcutMenu.onKeyboardShortcutMenuEvent.addListener(this._handleKeyboardShortcutMenuEvent);
  }

  public override componentWillUnmount() {
    KeyboardShortcutMenu.onKeyboardShortcutMenuEvent.removeListener(this._handleKeyboardShortcutMenuEvent);
  }

  private _handleKeyboardShortcutMenuEvent = (state: KeyboardShortcutMenuState) => {
    this.setState(state);
  };

  public override render(): React.ReactNode {
    const { shortcuts, menuX, menuY, menuVisible } = this.state;
    const onClose = this._hideContextMenu;

    if (menuVisible) {
      const items = this.getShortcutMenuItems(shortcuts);

      return (
        <GlobalContextMenu
          className={this.props.className}
          style={this.props.style}
          identifier="keyboard-shortcuts"
          x={menuX}
          y={menuY}
          opened={menuVisible}
          onEsc={onClose}
          onOutsideClick={onClose}
          edgeLimit={false}
          autoflip={true}
          ignoreNextKeyUp={true}  // Executing the shortcut on the keydown, so ignore the keyup in the menu
        >
          {items}
        </GlobalContextMenu>
      );
    }

    return null;
  }

  private getShortcutMenuItems(shortcuts?: KeyboardShortcut[]): React.ReactNode[] {
    const items: React.ReactNode[] = [];

    // istanbul ignore else
    if (shortcuts) {
      shortcuts.forEach((shortcut: KeyboardShortcut, index: number) => {
        const item = this.getShortcutMenuItem(shortcut, index);
        // istanbul ignore else
        if (item)
          items.push(item);
      });
    }

    return items;
  }

  private getShortcutMenuItem(shortcut: KeyboardShortcut, index: number): React.ReactNode {
    const shortcutKey = shortcut.key;
    const isHidden = ConditionalBooleanValue.getValue(shortcut.isHidden);

    // Only pure characters go into the context menu
    if (shortcutKey !== shortcut.keyMapKey || shortcut.isFunctionKey || shortcut.isSpecialKey || isHidden)
      return null;

    let node: React.ReactNode = null;
    let label = shortcut.label;
    const iconSpec = shortcut.iconSpec;

    label = `~${shortcutKey.toLocaleUpperCase()} ${label}`;

    if (shortcut.shortcutContainer.areKeyboardShortcutsAvailable()) {
      const shortcuts = shortcut.shortcutContainer.getAvailableKeyboardShortcuts();
      const items = this.getShortcutMenuItems(shortcuts);

      node = (
        <ContextSubMenu key={index} icon={iconSpec} label={label} disabled={shortcut.isDisabled}>
          {items}
        </ContextSubMenu>
      );
    } else {
      const sel = () => this._itemPicked(shortcut);
      node = (
        <ContextMenuItem key={index} onSelect={sel} icon={iconSpec} disabled={shortcut.isDisabled}>
          {label}
        </ContextMenuItem>
      );
    }

    return node;
  }

  private _hideContextMenu = () => {
    this.setState({ menuVisible: false, shortcuts: undefined });
  };

  private _itemPicked = (shortcut: KeyboardShortcut): void => {
    this._hideContextMenu();
    shortcut.itemPicked();
  };
}
