/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { DialogChangedEvent, DialogManagerBase, DialogRendererBase } from "./DialogManagerBase";

/** Modal Dialog Changed Event class.
 * @public
 */
export class ModalDialogChangedEvent extends DialogChangedEvent { }

/** Modal Dialog Manager class displays and manages multiple modal dialogs
 * @public
 */
export class ModalDialogManager {
  /** Modal Dialog Changed Event */
  public static readonly onModalDialogChangedEvent = new ModalDialogChangedEvent();

  /** @internal */
  public static readonly dialogManager: DialogManagerBase = new DialogManagerBase(ModalDialogManager.onModalDialogChangedEvent);

  /** Get the array of modal dialogs */
  public static get dialogs() { return ModalDialogManager.dialogManager.dialogs; }

  /** Open a modal dialog
   * @param dialog The Dialog to open
   * @param id The id of the Dialog. If one is not provided, an id is generated.
   * @param parentDocument The Document used to determine the owning window.
   */
  public static openDialog(dialog: React.ReactNode, id?: string, parentDocument = document): void {
    ModalDialogManager.dialogManager.openDialog(dialog, id, parentDocument);
  }

  /** Close a modal dialog
   * @param dialog The Dialog to open. If one is not specified, the active dialog will be closed.
   */
  public static closeDialog(dialog?: React.ReactNode): void {
    ModalDialogManager.dialogManager.closeDialog(dialog);
  }

  /** @internal */
  public static closeAll(): void {
    ModalDialogManager.dialogManager.closeAll();
  }

  /** Update the dialogs */
  public static update(): void {
    ModalDialogManager.dialogManager.update();
  }

  /** Get the active modal dialog */
  public static get activeDialog(): React.ReactNode | undefined {
    return ModalDialogManager.dialogManager.activeDialog;
  }

  /** Get the count of modal dialogs */
  public static get dialogCount(): number {
    return ModalDialogManager.dialogManager.dialogCount;
  }
}

/** ModalDialogRenderer React component renders modal dialogs
 * @public
 */
export class ModalDialogRenderer extends React.PureComponent<CommonProps> {

  constructor(props: CommonProps) {
    super(props);
  }

  public override render(): React.ReactNode {
    return (
      <DialogRendererBase {...this.props} dialogManager={ModalDialogManager.dialogManager} />
    );
  }
}
