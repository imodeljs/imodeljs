/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import * as React from "react";
import { UiEvent } from "@bentley/ui-core";

/** Dialog Stack Changed Event Args class.
 * @public
 */
export interface DialogChangedEventArgs {
  dialogCount: number;
  activeDialog: React.ReactNode | undefined;
}

/** Dialog Changed Event class.
 * @public
 */
export class DialogChangedEvent extends UiEvent<DialogChangedEventArgs> { }

/** Information maintained by a Dialog Manager about a dialog
 * @public
 */
export interface DialogInfo {
  reactNode: React.ReactNode;
  id: string;
  parentDocument: Document;
}

/** Dialog Manager class.
 * @internal
 */
export class DialogManagerBase {
  private static _sId = 0;
  private _dialogs: DialogInfo[] = new Array<DialogInfo>();
  private _onDialogChangedEvent: DialogChangedEvent;

  constructor(onDialogChangedEvent: DialogChangedEvent) {
    this._onDialogChangedEvent = onDialogChangedEvent;
  }

  public get dialogs() { return this._dialogs; }

  public get onDialogChangedEvent(): DialogChangedEvent { return this._onDialogChangedEvent; }

  /**
   * Triggers opening a dialog.
   * @param dialog Dialog React component.
   * @param id The unique Id the identifies the dialog.
   * @param parentDocument Optional document required when displaying a dialog in a child popup window.
   */
  public openDialog(dialog: React.ReactNode, id?: string, parentDocument?: Document): void {
    if (!id)
      id = `Dialog-${++DialogManagerBase._sId}`;

    // istanbul ignore next
    const owningDoc = parentDocument ?? document;
    this.pushDialog({ reactNode: dialog, id, parentDocument: owningDoc });
  }

  /** @internal */
  public pushDialog(dialogInfo: DialogInfo): void {
    this._dialogs.push(dialogInfo);
    this.emitDialogChangedEvent();
  }

  public closeDialog(dialog?: React.ReactNode): void {
    let targetDialog = dialog;
    if (!dialog)
      targetDialog = this.activeDialog;

    this.removeDialog(targetDialog);
    this.emitDialogChangedEvent();
  }

  /** @internal */
  public closeAll(): void {
    this._dialogs = [];
    this.emitDialogChangedEvent();
  }

  /** @internal */
  public removeDialog(dialog: React.ReactNode): void {
    const index = this._dialogs.findIndex((dialogInfo: DialogInfo) => {
      return dialog === dialogInfo.reactNode;
    });
    if (index >= 0)
      this._dialogs.splice(index, 1);
  }

  public emitDialogChangedEvent(): void {
    this._onDialogChangedEvent.emit({ dialogCount: this.dialogCount, activeDialog: this.activeDialog });
  }

  public update(): void {
    this.emitDialogChangedEvent();
  }

  public get activeDialog(): React.ReactNode | undefined {
    if (this._dialogs.length > 0)
      return this._dialogs[this._dialogs.length - 1].reactNode;

    return undefined;
  }

  public get dialogCount(): number {
    return this._dialogs.length;
  }
}

/** Properties for the [[DialogRendererBase]] component
 * @internal
 */
export interface DialogRendererProps {
  dialogManager: DialogManagerBase;
}

/** @internal */
interface DialogRendererState {
  parentDocument: Document | null;
}
/** DialogRenderer React component.
 * @internal
 */
export class DialogRendererBase extends React.PureComponent<DialogRendererProps, DialogRendererState> {
  /** @internal */
  public override readonly state: DialogRendererState = {
    parentDocument: null,
  };

  private _handleRefSet = (popupDiv: HTMLElement | null) => {
    this.setState({ parentDocument: popupDiv?.ownerDocument ?? null });
  };

  public override render(): React.ReactNode {
    if (this.props.dialogManager.dialogCount <= 0)
      return null;

    return (
      <div className="ui-framework-dialog-render-container" ref={this._handleRefSet}>
        { this.state.parentDocument &&
          this.props.dialogManager.dialogs.filter((info) => info.parentDocument === this.state.parentDocument)
            .map((dialogInfo: DialogInfo) => {
              return (
                <React.Fragment key={dialogInfo.id} >
                  {dialogInfo.reactNode}
                </React.Fragment>
              );
            })
        }
      </div>
    );
  }

  public override componentDidMount(): void {
    this.props.dialogManager.onDialogChangedEvent.addListener(this._handleDialogChangedEvent);
  }

  public override componentWillUnmount(): void {
    this.props.dialogManager.onDialogChangedEvent.removeListener(this._handleDialogChangedEvent);
  }

  private _handleDialogChangedEvent = (_args: DialogChangedEventArgs) => {
    this.forceUpdate();
  };

}
