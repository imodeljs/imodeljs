/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore Modeless WMTS

import * as React from "react";
import { CommonProps, Dialog } from "@bentley/ui-core";

import "./MapUrlDialog.scss";
import { DialogButtonType } from "@bentley/ui-abstract";

interface ConfirmMessageDialogProps extends CommonProps {

  /** Title to show in title bar of dialog */
  title?: string | JSX.Element;
  message?: string | JSX.Element;
  onYesResult?: () => void;
  onNoResult?: () => void;
  onClose?: () => void;
  onEscape?: () => void;
  minWidth?: string | number;
  /** Minimum height that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. Default: 100px */
  minHeight?: string | number;
  /** Maximum width that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  maxWidth?: string | number;
  /** Maximum height that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  maxHeight?: string | number;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function ConfirmMessageDialog(props: ConfirmMessageDialogProps) {

  const buttonCluster = React.useMemo(() => [
    { type: DialogButtonType.Yes, onClick: props.onYesResult ?? (() => { }) },
    { type: DialogButtonType.No, onClick: props.onNoResult ?? (() => { }) },
  ], [props.onYesResult, props.onNoResult]);

  return (
    <Dialog
      className={props.className}
      title={props.title}
      opened={true}
      resizable={false}
      movable={true}
      modal={true}
      buttonCluster={buttonCluster}
      onClose={props.onClose}
      onEscape={props.onEscape}
      minHeight={props.minHeight}
      maxHeight={props.maxHeight}
      minWidth={props.minWidth}
      maxWidth={props.maxWidth}
      trapFocus={false}
    >
      <div>{props.message}</div>
    </Dialog>
  );
}
