/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Admin
 */

import * as React from "react";
import { XAndY } from "@bentley/geometry-core";
import { IModelApp } from "@bentley/imodeljs-frontend";
import {
  AbstractMenuItemProps, AbstractToolbarProps, DialogLayoutDataProvider, DialogProps, IMatch,
  OnCancelFunc, OnItemExecutedFunc, OnNumberCommitFunc, OnValueCommitFunc,
  Primitives, PropertyDescription, PropertyRecord, RelativePosition, UiAdmin,
} from "@bentley/ui-abstract";
import { AccuDrawPopupManager } from "../accudraw/AccuDrawPopupManager";
import { ConfigurableUiManager } from "../configurableui/ConfigurableUiManager";
import { CursorInformation } from "../cursor/CursorInformation";
import { PopupManager } from "../popup/PopupManager";
import { CursorMenuData } from "../redux/SessionState";
import { UiFramework } from "../UiFramework";
import { KeyboardShortcutManager } from "../keyboardshortcut/KeyboardShortcut";
import { ModalDialogManager } from "../dialog/ModalDialogManager";
import { ModelessDialogManager } from "../dialog/ModelessDialogManager";
import { UiDataProvidedDialog } from "../dialog/UiDataProvidedDialog";

/** Controls whether localized and/or non-localized key-in strings appear in a KeyinField's auto-completion list.
 * @public
 */
export enum KeyinFieldLocalization {
  /** Include only non-localized key-in strings. */
  NonLocalized,
  /** Include only localized key-in strings. */
  Localized,
  /** Include localized and non-localized strings for each key-in. */
  Both,
}

/** Defines a keyin entry to show/filter in UI
 * @public
*/
export interface KeyinEntry {
  /** string that matched a filter string */
  value: string;
  /** define array of start and end positions of filter matches. */
  matches?: IMatch[];
  /** true if entry was loaded from key-in history */
  isHistory?: boolean;
}

/** The UiAdmin controls various UI components and is callable from IModelApp.uiAdmin in the imodeljs-frontend package.
 * @public
 */
export class FrameworkUiAdmin extends UiAdmin {
  private _localizedKeyinPreference: KeyinFieldLocalization = KeyinFieldLocalization.NonLocalized;

  public get localizedKeyinPreference(): KeyinFieldLocalization { return this._localizedKeyinPreference; }
  public set localizedKeyinPreference(preference: KeyinFieldLocalization) { this._localizedKeyinPreference = preference; }

  /** @internal */
  public override onInitialized() { }

  /** Gets the cursor X and Y position, which is mouseEvent.pageX and mouseEvent.pageY. */
  public override get cursorPosition(): XAndY { return CursorInformation.cursorPosition; }

  /** Determines if focus is set to Home */
  public override get isFocusOnHome(): boolean { return KeyboardShortcutManager.isFocusOnHome; }

  /** Sets focus to Home */
  public override setFocusToHome(): void { KeyboardShortcutManager.setFocusToHome(); }

  /** Show a context menu at a particular location.
   * @param items Properties of the menu items to display.
   * @param location Location of the context menu, relative to the origin of htmlElement or the overall window.
   * @param htmlElement The HTMLElement that anchors the context menu. If undefined, the location is relative to the overall window.
   * @return true if the menu was displayed, false if the menu could not be displayed.
   */
  public override showContextMenu(items: AbstractMenuItemProps[], location: XAndY, htmlElement?: HTMLElement): boolean {
    let position = location;
    let childWindowId: string | undefined;
    if (htmlElement) {
      const anchorOffset = htmlElement.getBoundingClientRect();
      position = { x: anchorOffset.left + location.x, y: anchorOffset.top + location.y };
      childWindowId = UiFramework.childWindowManager.findChildWindowId(htmlElement.ownerDocument.defaultView);
    }

    const offset = -8;
    position = { x: position.x + offset, y: position.y + offset };

    const cursorMenu: CursorMenuData = { position, items, childWindowId };
    UiFramework.openCursorMenu(cursorMenu);

    return true;
  }

  /** Resolve location and parent element */
  private resolveHtmlElement(location: XAndY, htmlElement?: HTMLElement): { position: XAndY, el: HTMLElement } {
    const position = location;
    const el = htmlElement ?? ConfigurableUiManager.getWrapperElement();
    return { position, el };
  }

  public getKeyins(): KeyinEntry[] {
    const toolKeyins: KeyinEntry[] = [];
    const tools = IModelApp.tools.getToolList();
    for (const tool of tools) {
      switch (this.localizedKeyinPreference) {
        case KeyinFieldLocalization.Localized:
          toolKeyins.push({ value: tool.keyin });
          break;
        case KeyinFieldLocalization.Both:
          toolKeyins.push({ value: tool.keyin });
          // istanbul ignore else
          if (tool.keyin === tool.englishKeyin)
            break;
        // istanbul ignore next
        default: // eslint-disable-line no-fallthrough
        case KeyinFieldLocalization.NonLocalized:
          // istanbul ignore next
          if (KeyinFieldLocalization.NonLocalized === this.localizedKeyinPreference || (KeyinFieldLocalization.Both === this.localizedKeyinPreference && tool.englishKeyin !== tool.keyin))
            toolKeyins.push({ value: tool.englishKeyin });
          break;
      }
    }

    return toolKeyins;
  }

  /** Show the Key-in Palette to display key-in from all registered Tools.
   * @param htmlElement The HTMLElement that anchors the Popup. If undefined, the location is relative to the overall window.
   * @return true if the Command Palette was displayed, false if it could not be displayed.
   */
  public override showKeyinPalette(htmlElement?: HTMLElement): boolean {
    if (!this.featureFlags.allowKeyinPalette)
      return false;

    // istanbul ignore next
    const el = htmlElement ? htmlElement : ConfigurableUiManager.getWrapperElement();

    // istanbul ignore next
    const hidePopup = () => {
      IModelApp.uiAdmin.hideKeyinPalette();
    };

    return PopupManager.showKeyinPalette(this.getKeyins(), el, hidePopup, hidePopup);
  }

  /** Hides the Key-in Palette. */
  public override hideKeyinPalette(): boolean {
    if (!this.featureFlags.allowKeyinPalette)
      return false;

    return PopupManager.hideKeyinPalette();
  }

  /** Show a Toolbar at a particular location.
   * @param toolbarProps Properties of the Toolbar to display.
   * @param location Location of the Toolbar, relative to the origin of htmlElement or the overall window.
   * @param offset Offset of the Toolbar from the location.
   * @param onItemExecuted Function invoked after a Toolbar item is executed
   * @param onCancel Function invoked when the Escape key is pressed or a click occurs outside the Toolbar
   * @param relativePosition Position relative to the given location. Defaults to TopRight.
   * @param htmlElement The HTMLElement that anchors the Toolbar. If undefined, the location is relative to the overall window.
   * @return true if the Toolbar was displayed, false if the Toolbar could not be displayed.
   */
  public override showToolbar(toolbarProps: AbstractToolbarProps, location: XAndY, offset: XAndY,
    onItemExecuted: OnItemExecutedFunc, onCancel: OnCancelFunc,
    relativePosition?: RelativePosition, htmlElement?: HTMLElement
  ): boolean {
    const { position, el } = this.resolveHtmlElement(location, htmlElement);

    if (relativePosition === undefined)
      relativePosition = RelativePosition.TopRight;

    return PopupManager.showToolbar(toolbarProps, el, position, offset, onItemExecuted, onCancel, relativePosition);
  }

  /** Hides the toolbar. */
  public override hideToolbar(): boolean {
    return PopupManager.hideToolbar();
  }

  /** Show a menu button at a particular location. A menu button opens a context menu.
   * @param id Id of the menu button. Multiple menu buttons may be displayed.
   * @param menuItemsProps Properties of the menu items to display.
   * @param location Location of the context menu, relative to the origin of htmlElement or the window.
   * @param htmlElement The HTMLElement that anchors the context menu. If undefined, the location is relative to the overall window.
   * @return true if the menu was displayed, false if the menu could not be displayed.
   */
  public override showMenuButton(id: string, menuItemsProps: AbstractMenuItemProps[], location: XAndY, htmlElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, htmlElement);

    return AccuDrawPopupManager.showMenuButton(id, el, position, menuItemsProps);
  }

  /** Hides a menu button.
   * @param id Id of the menu button. Multiple menu buttons may be displayed.
   * @return true if the menu was hidden, false if the menu could not be hidden.
   */
  public override hideMenuButton(id: string): boolean {
    return AccuDrawPopupManager.hideMenuButton(id);
  }

  /** Show a calculator at a particular location.
   * @param initialValue Value initially displayed in the calculator.
   * @param resultIcon Icon displayed to the left of the value.
   * @param location Location of the calculator, relative to the origin of htmlElement or the window.
   * @param onOk Function called when the OK button or the Enter key is pressed.
   * @param onCancel Function called when the Cancel button or the Escape key  is pressed.
   * @param htmlElement The HTMLElement that anchors the context menu. If undefined, the location is relative to the overall window.
   * @return true if the menu was displayed, false if the menu could not be displayed.
   */
  public override showCalculator(initialValue: number, resultIcon: string, location: XAndY, onOk: OnNumberCommitFunc, onCancel: OnCancelFunc, htmlElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, htmlElement);

    return AccuDrawPopupManager.showCalculator(el, position, initialValue, resultIcon, onOk, onCancel);
  }

  /** Hides the calculator. */
  public override hideCalculator(): boolean {
    return AccuDrawPopupManager.hideCalculator();
  }

  /** Show an input editor for an angle value at a particular location.
   * @param initialValue Value initially displayed in the editor.
   * @param location Location of the editor, relative to the origin of htmlElement or the window.
   * @param onCommit Function called when the OK button or the Enter key is pressed.
   * @param onCancel Function called when the Cancel button or the Escape key  is pressed.
   * @param htmlElement The HTMLElement that anchors the context menu. If undefined, the location is relative to the overall window.
   * @return true if the editor was displayed, false if the editor could not be displayed.
   */
  public override showAngleEditor(initialValue: number, location: XAndY, onCommit: OnNumberCommitFunc, onCancel: OnCancelFunc, htmlElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, htmlElement);

    return AccuDrawPopupManager.showAngleEditor(el, position, initialValue, onCommit, onCancel);
  }

  /** Show an input editor for a length value at a particular location.
   * @param initialValue Value initially displayed in the editor.
   * @param location Location of the editor, relative to the origin of htmlElement or the window.
   * @param onCommit Function called when the OK button or the Enter key is pressed.
   * @param onCancel Function called when the Cancel button or the Escape key  is pressed.
   * @param htmlElement The HTMLElement that anchors the context menu. If undefined, the location is relative to the overall window.
   * @return true if the editor was displayed, false if the editor could not be displayed.
   */
  public override showLengthEditor(initialValue: number, location: XAndY, onCommit: OnNumberCommitFunc, onCancel: OnCancelFunc, htmlElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, htmlElement);

    return AccuDrawPopupManager.showLengthEditor(el, position, initialValue, onCommit, onCancel);
  }

  /** Show an input editor for a height value at a particular location.
   * @param initialValue Value initially displayed in the editor.
   * @param location Location of the editor, relative to the origin of htmlElement or the window.
   * @param onCommit Function called when the OK button or the Enter key is pressed.
   * @param onCancel Function called when the Cancel button or the Escape key  is pressed.
   * @param htmlElement The HTMLElement that anchors the context menu. If undefined, the location is relative to the overall window.
   * @return true if the editor was displayed, false if the editor could not be displayed.
   */
  public override showHeightEditor(initialValue: number, location: XAndY, onCommit: OnNumberCommitFunc, onCancel: OnCancelFunc, htmlElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, htmlElement);

    return AccuDrawPopupManager.showHeightEditor(el, position, initialValue, onCommit, onCancel);
  }

  /** Show an input editor for a primitive value at a particular location.
   * @param initialValue Value initially displayed in the editor.
   * @param propertyDescription Description of the primitive value property
   * @param location Location of the editor, relative to the origin of htmlElement or the window.
   * @param onCommit Function called when the OK button or the Enter key is pressed.
   * @param onCancel Function called when the Cancel button or the Escape key  is pressed.
   * @param htmlElement The HTMLElement that anchors the context menu. If undefined, the location is relative to the overall window.
   * @return true if the editor was displayed, false if the editor could not be displayed.
   */
  public override showInputEditor(initialValue: Primitives.Value, propertyDescription: PropertyDescription, location: XAndY, onCommit: OnValueCommitFunc, onCancel: OnCancelFunc, htmlElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, htmlElement);

    return PopupManager.showInputEditor(el, position, initialValue, propertyDescription, onCommit, onCancel);
  }

  /** Hides the input editor. */
  public override hideInputEditor(): boolean {
    return PopupManager.hideInputEditor();
  }

  /** Show an HTML element at a particular location.
   * @param displayElement The HTMLElement to display
   * @param location Location of the display element, relative to the origin of htmlElement or the window
   * @param offset Offset of the display element from the location
   * @param onCancel Function invoked when the Escape key is pressed or a click occurs outside the display element
   * @param relativePosition Position relative to the given location. Defaults to TopRight.
   * @param anchorElement The HTMLElement that anchors the display element. If undefined, the location is relative to the overall window.
   * @return true if the display element was displayed, false if the display element could not be displayed.
   */
  public override showHTMLElement(
    displayElement: HTMLElement, location: XAndY, offset: XAndY, onCancel: OnCancelFunc,
    relativePosition?: RelativePosition, anchorElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, anchorElement);

    // istanbul ignore if
    if (relativePosition === undefined)
      relativePosition = RelativePosition.TopRight;

    return PopupManager.showHTMLElement(displayElement, el, position, offset, onCancel, relativePosition);
  }

  /** Hides the HTML Element. */
  public override hideHTMLElement(): boolean {
    return PopupManager.hideHTMLElement();
  }

  /** Show a Card containing content, a title and a toolbar at a particular location.
   * @param content The HTMLElement of the content to display
   * @param title Title to display at the top of the card.
   * @param toolbarProps Properties of the Toolbar to display.
   * @param location Location of the Card, relative to the origin of htmlElement or the window.
   * @param offset Offset of the Card from the location.
   * @param onItemExecuted Function invoked after a Toolbar item is executed
   * @param onCancel Function invoked when the Escape key is pressed or a click occurs outside the Card
   * @param relativePosition Position relative to the given location. Defaults to TopRight.
   * @param anchorElement The HTMLElement that anchors the Card. If undefined, the location is relative to the overall window.
   * @return true if the Card was displayed, false if the Card could not be displayed.
   */
  public override showCard(
    content: HTMLElement, title: string | PropertyRecord | undefined, toolbarProps: AbstractToolbarProps | undefined,
    location: XAndY, offset: XAndY, onItemExecuted: OnItemExecutedFunc, onCancel: OnCancelFunc,
    relativePosition?: RelativePosition, anchorElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, anchorElement);

    // istanbul ignore if
    if (relativePosition === undefined)
      relativePosition = RelativePosition.TopRight;

    return PopupManager.showCard(content, title, toolbarProps, el, position, offset, onItemExecuted, onCancel, relativePosition);
  }

  /** Show a Card containing React-based content, a title and a toolbar at a particular location.
   * @param content The React node of the content to display
   * @param title Title to display at the top of the card.
   * @param toolbarProps Properties of the Toolbar to display.
   * @param location Location of the Card, relative to the origin of htmlElement or the window.
   * @param offset Offset of the Card from the location.
   * @param onItemExecuted Function invoked after a Toolbar item is executed
   * @param onCancel Function invoked when the Escape key is pressed or a click occurs outside the Card
   * @param relativePosition Position relative to the given location. Defaults to TopRight.
   * @param anchorElement The HTMLElement that anchors the Card. If undefined, the location is relative to the overall window.
   * @return true if the Card was displayed, false if the Card could not be displayed.
   */
  public showReactCard(
    content: React.ReactNode, title: string | PropertyRecord | undefined, toolbarProps: AbstractToolbarProps | undefined,
    location: XAndY, offset: XAndY, onItemExecuted: OnItemExecutedFunc, onCancel: OnCancelFunc,
    relativePosition?: RelativePosition, anchorElement?: HTMLElement): boolean {
    const { position, el } = this.resolveHtmlElement(location, anchorElement);
    const reactContent = { reactNode: content };

    // istanbul ignore if
    if (relativePosition === undefined)
      relativePosition = RelativePosition.TopRight;

    return PopupManager.showCard(reactContent, title, toolbarProps, el, position, offset, onItemExecuted, onCancel, relativePosition);
  }

  /** Hides the Card. */
  public override hideCard(): boolean {
    return PopupManager.hideCard();
  }

  /** Opens a Tool Settings Ui popup at a particular location.
   * @param dataProvider The DialogLayoutDataProvider for the tool settings popup dialog.
   * @param location Location of the tool settings, relative to the origin of anchorElement or the window
   * @param offset Offset of the tool settings from the location
   * @param onCancel Function invoked when the Escape key is pressed or a click occurs outside the tool settings
   * @param relativePosition Position relative to the given location. Defaults to TopRight.
   * @param anchorElement The HTMLElement that anchors the tool settings. If undefined, the location is relative to the overall window.
   * @return true if the tool settings were displayed, false if the tool settings could not be displayed.
   */
  public override openToolSettingsPopup(
    dataProvider: DialogLayoutDataProvider, location: XAndY, offset: XAndY, onCancel: OnCancelFunc, relativePosition?: RelativePosition, anchorElement?: HTMLElement,
  ): boolean {
    const { position, el } = this.resolveHtmlElement(location, anchorElement);

    if (relativePosition === undefined)
      relativePosition = RelativePosition.TopRight;

    return PopupManager.openToolSettings(dataProvider, el, position, offset, onCancel, relativePosition);
  }

  /** Closes the Tool Settings Ui popup. */
  public override closeToolSettingsPopup(): boolean {
    return PopupManager.closeToolSettings();
  }

  /** Opens a Dialog and automatically populates it using the properties defined by the UiDataProvider.
  * @param uiDataProvider The UiDataProvider for the tool settings
  * @param title Specify title for dialog.
  * @param isModal Specify if the dialog is opened as a modal or modeless.
  * @param id Id of the dialog that is used to close it.
  * @param optionalProps Optional props for Dialog construction.
  * @return true if the tool settings were displayed, false if the tool settings could not be displayed.
  */
  public override openDialog(uiDataProvider: DialogLayoutDataProvider, title: string, isModal: boolean, id: string, optionalProps?: DialogProps): boolean {
    if (isModal) {
      ModalDialogManager.openDialog(<UiDataProvidedDialog uiDataProvider={uiDataProvider} title={title} isModal={isModal} id={id} {...optionalProps} />, id);
      return true;
    } else {
      ModelessDialogManager.openDialog(<UiDataProvidedDialog uiDataProvider={uiDataProvider} title={title} isModal={isModal} id={id}  {...optionalProps} />, id);
      return true;
    }
  }

  /** Closes the Tool Settings Ui popup. */
  public override closeDialog(dialogId: string): boolean {
    // istanbul ignore else
    if (ModelessDialogManager.dialogManager.dialogs.findIndex((info) => info.id === dialogId)) {
      ModelessDialogManager.closeDialog(dialogId);
      return true;
    }

    // istanbul ignore else
    if (ModalDialogManager.dialogManager.dialogs.findIndex((info) => info.id === dialogId)) {
      ModalDialogManager.closeDialog();
      return true;
    }

    // istanbul ignore next
    return false;
  }
}
