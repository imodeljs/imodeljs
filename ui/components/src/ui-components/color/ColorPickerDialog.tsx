/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Color
 */

// cSpell:ignore colorpicker

import * as React from "react";
import { Dialog } from "@bentley/ui-core";
import { ColorDef } from "@bentley/imodeljs-common";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { DialogButtonType } from "@bentley/ui-abstract";

/** Properties for the [[ColorPickerDialog]] React component
 * @beta
 */
export interface ColorPickerDialogProps {
  dialogTitle: string;
  color: ColorDef;
  onOkResult: (selectedColor: ColorDef) => void;
  onCancelResult: () => void;
  colorPresets?: ColorDef[];
}

/**
 * Color Picker Dialog to use as modal dialog.
 * @beta
 */
export function ColorPickerDialog({ dialogTitle, color, onOkResult, onCancelResult, colorPresets }: ColorPickerDialogProps) {
  const [activeColor, setActiveColor] = React.useState(color);
  const dialogContainer = React.useRef<HTMLDivElement>(null);

  const handleOk = React.useCallback(() => {
    onOkResult(activeColor);
  }, [onOkResult, activeColor]);
  const handleCancel = React.useCallback(() => {
    // istanbul ignore else
    if (onCancelResult)
      onCancelResult();
  }, [onCancelResult]);

  const handleColorChange = React.useCallback((newColorDef: ColorDef) => {
    setActiveColor(newColorDef);
  }, []);

  const buttonCluster = React.useMemo(() => [
    { type: DialogButtonType.OK, onClick: handleOk },
    { type: DialogButtonType.Cancel, onClick: handleCancel },
  ], [handleCancel, handleOk]);

  return (
    <div ref={dialogContainer}>
      <Dialog
        title={dialogTitle}
        opened={true}
        resizable={true}
        movable={true}
        modal={true}
        buttonCluster={buttonCluster}
        onClose={handleCancel}
        onEscape={handleCancel}
        minHeight={340}
        maxWidth={400}
      >
        <ColorPickerPanel activeColor={activeColor} colorPresets={colorPresets} onColorChange={handleColorChange} />
      </Dialog>
    </div >
  );
}
