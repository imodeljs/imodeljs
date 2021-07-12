/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Popup
 */

import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import { XAndY } from "@bentley/geometry-core";
import {
  AbstractToolbarProps, DialogLayoutDataProvider, OnCancelFunc, OnItemExecutedFunc, OnValueCommitFunc, Primitives, PrimitiveValue,
  PropertyDescription, PropertyRecord, PropertyValueFormat, RelativePosition,
} from "@bentley/ui-abstract";
import { Orientation, Point, Rectangle, SizeProps, UiEvent } from "@bentley/ui-core";
import { offsetAndContainInContainer } from "@bentley/ui-ninezone";
import { KeyinEntry } from "../uiadmin/FrameworkUiAdmin";
import { UiFramework } from "../UiFramework";
import { CardPopup } from "./CardPopup";
import { HTMLElementPopup } from "./HTMLElementPopup";
import { InputEditorCommitHandler, InputEditorPopup } from "./InputEditorPopup";
import { KeyinPalettePopup } from "./KeyinPalettePopup";
import { ToolbarPopup } from "./ToolbarPopup";
import { ToolSettingsPopup } from "./ToolSettingsPopup";

// cSpell:ignore uiadmin

/** Information maintained by PopupManager about a Popup
 * @alpha
 */
export interface PopupInfo {
  id: string;
  pt: XAndY;
  component: React.ReactNode;
  parentDocument: Document;
}

/** @alpha */
export interface PopupsChangedEventArgs {
  popups: ReadonlyArray<PopupInfo>;
}

/** Popups Changed Event class.
 * @alpha
 */
export class PopupsChangedEvent extends UiEvent<PopupsChangedEventArgs> { }

/** Props for each popup managed by the PopupManager
 * @alpha
 */
export interface PopupPropsBase {
  id: string;
  el: HTMLElement;
  pt: XAndY;
  offset: XAndY;
}

/** Describes React based content
 * @alpha
 */
export interface ReactContent {
  reactNode: React.ReactNode;
}

/** Type for Popup Content
 * @alpha
 */
export type PopupContentType = HTMLElement | ReactContent;

/** ReactContent type guard.
 * @internal
 */
export const isReactContent = (content: PopupContentType): content is ReactContent => {
  return (content as ReactContent).reactNode !== undefined;
};

/** Popup Manager class
 * @alpha
 */
export class PopupManager {
  private static _popups: ReadonlyArray<PopupInfo> = [];
  private static _editorId = "InputEditor";
  private static _toolbarId = "Toolbar";
  private static _htmlElementId = "HTMLElement";
  private static _cardId = "Card";
  private static _toolSettingsId = "ToolSettings";
  private static _keyPalettePopupId = "KeyinPalette";

  private static _defaultOffset = { x: 8, y: 8 };

  public static readonly onPopupsChangedEvent = new PopupsChangedEvent();

  public static get popupCount() { return this._popups.length; }
  public static get popups() { return this._popups; }

  public static set popups(popups: ReadonlyArray<PopupInfo>) {
    // istanbul ignore if
    if (this._popups === popups)
      return;
    this._popups = popups;
    this.onPopupsChangedEvent.emit({ popups });
  }

  /** @internal */
  public static clearPopups() {
    this.popups = [];
  }

  private static addPopup(popupInfo: PopupInfo): void {
    const popups = [
      ...PopupManager._popups,
      popupInfo,
    ];
    this.popups = popups;
  }

  private static updatePopup(popupInfo: PopupInfo, itemIndex: number): void {
    // istanbul ignore if
    if (itemIndex < 0)
      return;

    const popups = [
      ...PopupManager._popups.slice(0, itemIndex),
      popupInfo,
      ...PopupManager._popups.slice(itemIndex + 1),
    ];
    this.popups = popups;
  }

  public static addOrUpdatePopup(popupInfo: PopupInfo): void {
    const itemIndex = PopupManager._popups.findIndex((info: PopupInfo) => info.id === popupInfo.id);
    if (itemIndex >= 0)
      PopupManager.updatePopup(popupInfo, itemIndex);
    else
      PopupManager.addPopup(popupInfo);
  }

  public static removePopup(id: string): boolean {
    const index = PopupManager._popups.findIndex((info: PopupInfo) => id === info.id);
    let result = true;

    if (index >= 0) {
      const popups = PopupManager._popups.filter((info: PopupInfo) => {
        return info.id !== id;
      });
      this.popups = popups;
    } else {
      Logger.logError(UiFramework.loggerCategory(this), `removePopup: Could not find popup with id of '${id}'`);
      result = false;
    }

    return result;
  }

  public static get defaultOffset(): XAndY { return PopupManager._defaultOffset; }
  public static set defaultOffset(offset: XAndY) { PopupManager._defaultOffset = offset; }

  public static showInputEditor(el: HTMLElement, pt: XAndY, value: Primitives.Value, propertyDescription: PropertyDescription, onCommit: OnValueCommitFunc, onCancel: OnCancelFunc): boolean {
    const primitiveValue: PrimitiveValue = {
      value,
      valueFormat: PropertyValueFormat.Primitive,
    };
    const record = new PropertyRecord(primitiveValue, propertyDescription);
    const commitHandler = new InputEditorCommitHandler(onCommit);
    const id = PopupManager._editorId;
    const component = (
      <InputEditorPopup id={id} el={el} pt={pt} offset={PopupManager.defaultOffset}
        record={record} onCancel={onCancel} commitHandler={commitHandler} />
    );

    const popupInfo: PopupInfo = {
      id, pt, component, parentDocument: el.ownerDocument,
    };
    PopupManager.addOrUpdatePopup(popupInfo);

    return true;
  }

  public static hideInputEditor(): boolean {
    return PopupManager.removePopup(PopupManager._editorId);
  }

  public static showKeyinPalette(
    keyins: KeyinEntry[], el: HTMLElement, onItemExecuted?: OnItemExecutedFunc, onCancel?: OnCancelFunc,
  ): boolean {

    const id = PopupManager._keyPalettePopupId;
    const component = (
      <KeyinPalettePopup keyins={keyins}
        id={id} el={el} onCancel={onCancel} onItemExecuted={onItemExecuted} />
    );

    // since the command palette popup is always at top center of specified HTML element and it does not need to move like
    // cursor popups just set pt to 0,0.
    const pt = { x: 0, y: 0 };
    const popupInfo: PopupInfo = {
      id, pt, component, parentDocument: el.ownerDocument,
    };
    PopupManager.addOrUpdatePopup(popupInfo);

    return true;
  }

  public static hideKeyinPalette(): boolean {
    return PopupManager.removePopup(PopupManager._keyPalettePopupId);
  }

  public static showToolbar(
    toolbarProps: AbstractToolbarProps, el: HTMLElement, pt: XAndY, offset: XAndY,
    onItemExecuted: OnItemExecutedFunc, onCancel: OnCancelFunc, relativePosition: RelativePosition,
  ): boolean {

    const id = PopupManager._toolbarId;
    const component = (
      <ToolbarPopup id={id} el={el} pt={pt} offset={offset}
        items={toolbarProps.items} relativePosition={relativePosition} orientation={Orientation.Horizontal} onCancel={onCancel} onItemExecuted={onItemExecuted} />
    );

    const popupInfo: PopupInfo = {
      id, pt, component, parentDocument: el.ownerDocument,
    };
    PopupManager.addOrUpdatePopup(popupInfo);

    return true;
  }

  public static hideToolbar(): boolean {
    return PopupManager.removePopup(PopupManager._toolbarId);
  }

  public static showHTMLElement(
    displayElement: HTMLElement, el: HTMLElement, pt: XAndY, offset: XAndY,
    onCancel: OnCancelFunc, relativePosition: RelativePosition,
  ): boolean {

    const id = PopupManager._htmlElementId;
    const component = (
      <HTMLElementPopup id={id} el={el} pt={pt} offset={offset}
        element={displayElement} relativePosition={relativePosition} orientation={Orientation.Horizontal} onCancel={onCancel} />
    );

    const popupInfo: PopupInfo = {
      id, pt, component, parentDocument: el.ownerDocument,
    };
    PopupManager.addOrUpdatePopup(popupInfo);

    return true;
  }

  public static hideHTMLElement(): boolean {
    return PopupManager.removePopup(PopupManager._htmlElementId);
  }

  public static showCard(
    content: PopupContentType, title: string | PropertyRecord | undefined, toolbarProps: AbstractToolbarProps | undefined,
    el: HTMLElement, pt: XAndY, offset: XAndY,
    onItemExecuted: OnItemExecutedFunc, onCancel: OnCancelFunc, relativePosition: RelativePosition,
  ): boolean {

    const id = PopupManager._cardId;
    const component = (
      <CardPopup id={id} el={el} pt={pt} offset={offset}
        content={content} title={title} items={toolbarProps ? toolbarProps.items : /* istanbul ignore next */ undefined}
        relativePosition={relativePosition} orientation={Orientation.Horizontal} onCancel={onCancel} onItemExecuted={onItemExecuted} />
    );

    const popupInfo: PopupInfo = {
      id, pt, component, parentDocument: el.ownerDocument,
    };
    PopupManager.addOrUpdatePopup(popupInfo);

    return true;
  }

  public static hideCard(): boolean {
    const index = PopupManager._popups.findIndex((info: PopupInfo) => PopupManager._cardId === info.id);
    if (index >= 0)
      return PopupManager.removePopup(PopupManager._cardId);
    return false;
  }

  public static openToolSettings(
    dataProvider: DialogLayoutDataProvider, el: HTMLElement, pt: XAndY, offset: XAndY, onCancel: OnCancelFunc, relativePosition: RelativePosition,
  ): boolean {

    const id = PopupManager._toolSettingsId;
    const component = (
      <ToolSettingsPopup id={id} el={el} pt={pt} offset={offset}
        dataProvider={dataProvider} relativePosition={relativePosition} orientation={Orientation.Horizontal} onCancel={onCancel} />
    );

    const popupInfo: PopupInfo = {
      id, pt, component, parentDocument: el.ownerDocument,
    };
    PopupManager.addOrUpdatePopup(popupInfo);

    return true;
  }

  public static closeToolSettings(): boolean {
    return PopupManager.removePopup(PopupManager._toolSettingsId);
  }

  public static getPopupPosition(el: HTMLElement, pt: XAndY, offset: XAndY, size: SizeProps): Point {
    const containerBounds = Rectangle.create(el.getBoundingClientRect());
    const relativeBounds = Rectangle.createFromSize(size).offset(pt);
    const adjustedPosition: Point = offsetAndContainInContainer(relativeBounds, containerBounds.getSize(), offset);
    const position = adjustedPosition.offset(containerBounds.topLeft());

    return position;
  }

}

/** @internal */
interface PopupRendererState {
  parentDocument: Document | null;
  popups: ReadonlyArray<PopupInfo>;
}

/**  Popup Renderer
 * @alpha
 */
export class PopupRenderer extends React.Component<{}, PopupRendererState> {
  /** @internal */
  public override readonly state: PopupRendererState = {
    parentDocument: null,
    popups: PopupManager.popups,
  };

  public override componentDidMount(): void {
    PopupManager.onPopupsChangedEvent.addListener(this._handlePopupsChangedEvent);
  }

  public override componentWillUnmount(): void {
    PopupManager.onPopupsChangedEvent.removeListener(this._handlePopupsChangedEvent);
  }

  private _handleRefSet = (popupDiv: HTMLElement | null) => {
    this.setState({ parentDocument: popupDiv?.ownerDocument ?? null });
  };

  public override render(): React.ReactNode {
    if (PopupManager.popupCount <= 0)
      return null;

    return (
      <div className="ui-framework-popup-render-container" ref={this._handleRefSet}>
        { this.state.parentDocument &&
          this.state.popups.filter((info) => info.parentDocument === this.state.parentDocument)
            .map((popupInfo: PopupInfo) => {
              return (
                <React.Fragment key={popupInfo.id}>
                  {popupInfo.component}
                </React.Fragment>
              );
            })
        }
      </div>
    );
  }

  private _handlePopupsChangedEvent = (args: PopupsChangedEventArgs) => {
    this.setState({ popups: args.popups });
  };

}
