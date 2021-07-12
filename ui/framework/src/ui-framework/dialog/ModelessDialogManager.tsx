/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import { CommonProps, getCssVariableAsNumber } from "@bentley/ui-core";
import { UiFramework } from "../UiFramework";
import { DialogChangedEvent, DialogManagerBase, DialogRendererBase } from "./DialogManagerBase";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@bentley/imodeljs-frontend";

// cSpell:ignore ZINDEX modeless

/** Modeless Dialog Changed Event class.
 * @public
 */
export class ModelessDialogChangedEvent extends DialogChangedEvent { }

/** @internal */
interface ModelessDialogInfo {
  reactNode: React.ReactNode;
  zIndex: number;
  parentDocument: Document;
}

/** Used if the 'dialog' z-index CSS variable cannot be read */
const ZINDEX_DEFAULT = 12000;

/** Modeless Dialog Manager class displays and manages multiple modeless dialogs
 * @public
 */
export class ModelessDialogManager {
  /** Modeless Dialog Changed Event */
  public static readonly onModelessDialogChangedEvent = new ModelessDialogChangedEvent();

  /** @internal */
  public static readonly dialogManager: DialogManagerBase = new DialogManagerBase(ModelessDialogManager.onModelessDialogChangedEvent);

  /** Get the array of modeless dialogs */
  public static get dialogs() { return ModelessDialogManager.dialogManager.dialogs; }

  private static _dialogMap = new Map<string, ModelessDialogInfo>();
  private static _idArray = new Array<string>();

  private static _topZIndex = ZINDEX_DEFAULT;

  /** Initialize the modeless dialog manager */
  public static initialize(): void {
    ModelessDialogManager._topZIndex = ModelessDialogManager.getDialogZIndexDefault();
  }

  private static getDialogZIndexDefault(): number {
    const variable = "--uicore-z-index-dialog";
    const value = getCssVariableAsNumber(variable);

    // istanbul ignore next
    if (!isNaN(value))
      return value;

    Logger.logError(UiFramework.loggerCategory(this), `'${variable}' CSS variable not found`);
    return ZINDEX_DEFAULT;
  }

  /** Open a modeless dialog
   * @param dialog The Dialog to open
   * @param id The id of the Dialog to open
   */
  public static openDialog(dialog: React.ReactNode, id: string, parentDocument = document): void {
    const dialogInfo = ModelessDialogManager._dialogMap.get(id);
    if (dialogInfo) {
      const message = `Dialog with id of '${id}' already opened`;
      Logger.logInfo(UiFramework.loggerCategory(this), `openDialog: ${message}`);
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, message, undefined, OutputMessageType.Toast));
      return;
    }
    ModelessDialogManager._dialogMap.set(id, { reactNode: dialog, zIndex: ++ModelessDialogManager._topZIndex, parentDocument });
    ModelessDialogManager._idArray.push(id);
    ModelessDialogManager.dialogManager.openDialog(dialog, id, parentDocument);
  }

  /** Close a modeless dialog
   * @param id The id of the Dialog to close.
   */
  public static closeDialog(id: string): void {
    const dialogInfo = ModelessDialogManager._dialogMap.get(id);
    if (dialogInfo) {
      ModelessDialogManager.dialogManager.removeDialog(dialogInfo.reactNode);
      ModelessDialogManager._dialogMap.delete(id);
      const index = ModelessDialogManager._idArray.indexOf(id);
      // istanbul ignore else
      if (index >= 0)
        ModelessDialogManager._idArray.splice(index, 1);

      if (ModelessDialogManager.activeDialog === undefined)
        ModelessDialogManager._topZIndex = ModelessDialogManager.getDialogZIndexDefault();

      this.update();
    } else {
      Logger.logError(UiFramework.loggerCategory(this), `closeDialog: Could not find dialog with id of '${id}'`);
    }
  }

  /** @internal */
  public static closeAll(): void {
    ModelessDialogManager.dialogManager.closeAll();
  }

  /** Update the dialogs */
  public static update(): void {
    ModelessDialogManager.dialogManager.update();
  }

  /** Get the active modeless dialog */
  public static get activeDialog(): React.ReactNode | undefined {
    if (ModelessDialogManager._idArray.length > 0) {
      const id = ModelessDialogManager._idArray[ModelessDialogManager._idArray.length - 1];
      const dialogInfo = ModelessDialogManager._dialogMap.get(id);
      // istanbul ignore else
      if (dialogInfo)
        return dialogInfo.reactNode;
    }

    return undefined;
  }

  /** Get the count of modeless dialogs */
  public static get dialogCount(): number {
    return ModelessDialogManager.dialogManager.dialogCount;
  }

  /** Handle a pointer down event on a modeless dialog */
  public static handlePointerDownEvent(_event: React.PointerEvent, id: string, updateFunc: () => void): void {
    const dialogInfo = ModelessDialogManager._dialogMap.get(id);
    if (dialogInfo && dialogInfo.reactNode !== ModelessDialogManager.activeDialog) {
      dialogInfo.zIndex = ++ModelessDialogManager._topZIndex;

      ModelessDialogManager._idArray.splice(ModelessDialogManager._idArray.indexOf(id), 1);
      ModelessDialogManager._idArray.push(id);

      updateFunc();
      this.update();
    }
  }

  /** Get the z-index for a modeless dialog */
  public static getDialogZIndex(id: string): number {
    let zIndex = ModelessDialogManager.getDialogZIndexDefault();
    const dialogInfo = ModelessDialogManager._dialogMap.get(id);
    // istanbul ignore else
    if (dialogInfo)
      zIndex = dialogInfo.zIndex;
    return zIndex;
  }

  public static getDialogInfo(id: string): ModelessDialogInfo | undefined {
    return ModelessDialogManager._dialogMap.get(id);
  }
}

/** ModelessDialogRenderer React component renders modeless dialogs.
 * @public
 */
export class ModelessDialogRenderer extends React.PureComponent<CommonProps> {

  constructor(props: CommonProps) {
    super(props);
  }

  public override render(): React.ReactNode {
    return (
      <DialogRendererBase {...this.props} dialogManager={ModelessDialogManager.dialogManager} />
    );
  }
}
