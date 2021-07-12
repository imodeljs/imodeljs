/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import * as React from "react";
import { Dialog } from "@bentley/ui-core";
import { DialogButtonDef, DialogButtonType, DialogLayoutDataProvider } from "@bentley/ui-abstract";
import { getUniqueId } from "@bentley/ui-ninezone";
import { ModalDialogManager } from "./ModalDialogManager";
import { ModelessDialogManager } from "./ModelessDialogManager";
import { DefaultDialogGridContainer } from "../uiprovider/DefaultDialogGridContainer";
import { ComponentGenerator } from "../uiprovider/ComponentGenerator";

/** Props for [[UiDataProvidedDialog]] component.
 * @beta
 */
export interface UiDataProvidedDialogProps {
  /** Dialog title */
  title: string;
  /** Provider that provides and lays out DialogItems */
  uiDataProvider: DialogLayoutDataProvider;
  /** Indicates if Dialog is Modal */
  isModal: boolean;
  /** Id used to specify dialog. */
  id?: string;
  /** Indicates whether the user can resize dialog with cursor. Default: false */
  resizable?: boolean;
  /** Indicates whether the user can move dialog with cursor. Default: false */
  movable?: boolean;
  /** Initial width of dialog. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. Default: "50%" */
  width?: string | number;
  /** Initial height of dialog. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  height?: string | number;
  /** Minimum width that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. Default: 300px */
  minWidth?: string | number;
  /** Minimum height that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. Default: 100px */
  minHeight?: string | number;
  /** Maximum width that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  maxWidth?: string | number;
  /** Maximum height that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  maxHeight?: string | number;
}

/** Component to show dialog populated from properties supplied via uiDataProvider
 * @beta
 */
export function UiDataProvidedDialog({ uiDataProvider, id, isModal, ...dialogProps }: UiDataProvidedDialogProps) {
  const dialogId = React.useRef(id ? id : getUniqueId());
  const dialogIsModal = React.useRef(isModal);
  const onOK = React.useRef<() => void>();
  const onCancel = React.useRef<() => void>();
  const closeDialog = () => {
    if (dialogIsModal.current)
      ModalDialogManager.closeDialog();
    else
      ModelessDialogManager.closeDialog(dialogId.current);
  };

  const handleOk = React.useCallback(() => {
    onOK.current && onOK.current();
    closeDialog();
  }, []);

  const handleCancel = React.useCallback(() => {
    onCancel.current && onCancel.current();
    closeDialog();
  }, []);

  const generateButtonCluster = React.useCallback((buttons: DialogButtonDef[] | undefined) => {
    // istanbul ignore else
    if (buttons) {
      for (const button of buttons) {
        if (DialogButtonType.Cancel === button.type) {
          onCancel.current = button.onClick;
          button.onClick = handleCancel;
          continue;
        }
        if (DialogButtonType.OK === button.type) {
          onOK.current = button.onClick;
          button.onClick = handleOk;
          continue;
        }
      }
    }
    return buttons;
  }, [handleCancel, handleOk]);
  const [buttonCluster, setButtonCluster] = React.useState(() => generateButtonCluster(uiDataProvider.supplyButtonData()));

  React.useEffect(() => {
    const handleReloaded = () => {
      setButtonCluster(generateButtonCluster(uiDataProvider.supplyButtonData()));
    };
    uiDataProvider.onItemsReloadedEvent.addListener(handleReloaded);
    return () => {
      uiDataProvider.onItemsReloadedEvent.removeListener(handleReloaded);
    };
  }, [generateButtonCluster, uiDataProvider]);

  React.useEffect(() => {
    const handleButtonReloaded = () => {
      setButtonCluster(generateButtonCluster(uiDataProvider.supplyButtonData()));
    };
    uiDataProvider.onButtonsReloadedEvent.addListener(handleButtonReloaded);
    return () => {
      uiDataProvider.onButtonsReloadedEvent.removeListener(handleButtonReloaded);
    };
  }, [generateButtonCluster, uiDataProvider]);

  const handleClose = React.useCallback(() => closeDialog(), []);

  return (<Dialog {...dialogProps}
    opened={true}
    modal={isModal}
    buttonCluster={buttonCluster}
    onClose={handleClose}
    onEscape={handleClose}
  >
    <DefaultDialogGridContainer componentGenerator={new ComponentGenerator(uiDataProvider)} />
  </Dialog>
  );
}
