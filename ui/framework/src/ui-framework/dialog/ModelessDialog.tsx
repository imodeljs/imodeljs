/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import * as React from "react";
import { Dialog, DialogProps } from "@bentley/ui-core";
import { ModelessDialogManager } from "./ModelessDialogManager";

/** Properties for the [[ModelessDialog]] component
 * @public
 */
export interface ModelessDialogProps extends DialogProps {
  dialogId: string;
  movable?: boolean;
}

/** Modeless Dialog React component uses the Dialog component with a modal={false} prop.
 * It controls the z-index to keep the focused dialog above others.
 * @public
 */
export class ModelessDialog extends React.Component<ModelessDialogProps> {
  constructor(props: ModelessDialogProps) {
    super(props);
  }

  public override render(): JSX.Element {
    const { dialogId, style, modal, modelessId, onModelessPointerDown, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars

    return (
      <Dialog
        {...props}
        modal={false}
        modelessId={dialogId}
        onModelessPointerDown={(event) => ModelessDialogManager.handlePointerDownEvent(event, dialogId, this._updateDialog)}
        style={{ zIndex: ModelessDialogManager.getDialogZIndex(dialogId), ...style }}
      >
        {this.props.children}
      </Dialog >
    );
  }

  private _updateDialog = () => {
    this.forceUpdate();
  };
}
