/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module AccuDraw
 */

import "./AccuDrawFieldContainer.scss";
import classnames from "classnames";
import * as React from "react";
import {
  AccuDrawField, AccuDrawMode, AccuDrawSetFieldFocusEventArgs,
  AccuDrawSetFieldLockEventArgs, AccuDrawSetFieldValueToUiEventArgs, AccuDrawSetModeEventArgs,
  AccuDrawUiAdmin,
  IconSpecUtilities,
} from "@bentley/ui-abstract";
import { CommonProps, Orientation, UiSettings } from "@bentley/ui-core";
import { AccuDrawInputField } from "./AccuDrawInputField";
import { CompassMode, IModelApp, ItemField } from "@bentley/imodeljs-frontend";
import { KeyboardShortcutManager } from "../keyboardshortcut/KeyboardShortcut";
import angleIcon from "./angle.svg?sprite";
import distanceIcon from "./distance.svg?sprite";
import { FrameworkAccuDraw } from "./FrameworkAccuDraw";

/** @alpha */
export interface AccuDrawFieldContainerProps extends CommonProps {
  /** Orientation of the fields */
  orientation: Orientation;
  /** Optional parameter for persistent UI settings. Defaults to LocalUiSettings. */
  uiSettings?: UiSettings;
}

/** @alpha */
export function AccuDrawFieldContainer(props: AccuDrawFieldContainerProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { className, style, uiSettings, ...otherProps } = props;

  const xInputRef = React.useRef<HTMLInputElement>(null);
  const yInputRef = React.useRef<HTMLInputElement>(null);
  const zInputRef = React.useRef<HTMLInputElement>(null);
  const angleInputRef = React.useRef<HTMLInputElement>(null);
  const distanceInputRef = React.useRef<HTMLInputElement>(null);
  const focusField = React.useRef<AccuDrawField | undefined>(undefined);
  const [mode, setMode] = React.useState(AccuDrawMode.Rectangular);
  const xFormattedValue = React.useRef<string>("");
  const yFormattedValue = React.useRef<string>("");
  const zFormattedValue = React.useRef<string>("");
  const angleFormattedValue = React.useRef<string>("");
  const distanceFormattedValue = React.useRef<string>("");
  const [xLock, setXLock] = React.useState(false);
  const [yLock, setYLock] = React.useState(false);
  const [zLock, setZLock] = React.useState(false);
  const [angleLock, setAngleLock] = React.useState(false);
  const [distanceLock, setDistanceLock] = React.useState(false);

  const getInputRef = (field: AccuDrawField): React.RefObject<HTMLInputElement> => {
    let inputRef: React.RefObject<HTMLInputElement>;
    switch (field) {
      case AccuDrawField.X:
        inputRef = xInputRef;
        break;
      case AccuDrawField.Y:
        inputRef = yInputRef;
        break;
      case AccuDrawField.Z:
        inputRef = zInputRef;
        break;
      case AccuDrawField.Angle:
        inputRef = angleInputRef;
        break;
      case AccuDrawField.Distance:
        inputRef = distanceInputRef;
        break;
    }
    return inputRef;
  };

  React.useEffect(() => {
    xFormattedValue.current = FrameworkAccuDraw.getFieldDisplayValue(ItemField.X_Item);
    yFormattedValue.current = FrameworkAccuDraw.getFieldDisplayValue(ItemField.Y_Item);
    zFormattedValue.current = FrameworkAccuDraw.getFieldDisplayValue(ItemField.Z_Item);
    angleFormattedValue.current = FrameworkAccuDraw.getFieldDisplayValue(ItemField.ANGLE_Item);
    distanceFormattedValue.current = FrameworkAccuDraw.getFieldDisplayValue(ItemField.DIST_Item);

    const handleSetFieldValueToUi = (args: AccuDrawSetFieldValueToUiEventArgs) => {
      switch (args.field) {
        case AccuDrawField.X:
          xFormattedValue.current = args.formattedValue;
          break;
        case AccuDrawField.Y:
          yFormattedValue.current = args.formattedValue;
          break;
        case AccuDrawField.Z:
          zFormattedValue.current = args.formattedValue;
          break;
        case AccuDrawField.Angle:
          angleFormattedValue.current = args.formattedValue;
          break;
        case AccuDrawField.Distance:
          distanceFormattedValue.current = args.formattedValue;
          break;
      }
    };
    return AccuDrawUiAdmin.onAccuDrawSetFieldValueToUiEvent.addListener(handleSetFieldValueToUi);
  }, []);

  React.useEffect(() => {
    setXLock(IModelApp.accuDraw.getFieldLock(ItemField.X_Item));
    setYLock(IModelApp.accuDraw.getFieldLock(ItemField.Y_Item));
    setZLock(IModelApp.accuDraw.getFieldLock(ItemField.Z_Item));
    setAngleLock(IModelApp.accuDraw.getFieldLock(ItemField.ANGLE_Item));
    setDistanceLock(IModelApp.accuDraw.getFieldLock(ItemField.DIST_Item));

    const handleSetFieldLock = (args: AccuDrawSetFieldLockEventArgs) => {
      switch (args.field) {
        case AccuDrawField.X:
          setXLock(args.lock);
          break;
        case AccuDrawField.Y:
          setYLock(args.lock);
          break;
        case AccuDrawField.Z:
          setZLock(args.lock);
          break;
        case AccuDrawField.Angle:
          setAngleLock(args.lock);
          break;
        case AccuDrawField.Distance:
          setDistanceLock(args.lock);
          break;
      }
    };
    return AccuDrawUiAdmin.onAccuDrawSetFieldLockEvent.addListener(handleSetFieldLock);
  }, []);

  const setFocusToField = React.useCallback((field: AccuDrawField) => {
    const inputRef = getInputRef(field);

    // istanbul ignore else
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  React.useEffect(() => {
    const handleSetFieldFocus = (args: AccuDrawSetFieldFocusEventArgs) => {
      focusField.current = args.field;
      setFocusToField(focusField.current);
    };
    return AccuDrawUiAdmin.onAccuDrawSetFieldFocusEvent.addListener(handleSetFieldFocus);
  }, [setFocusToField]);

  React.useEffect(() => {
    const handleGrabInputFocus = () => {
      // istanbul ignore else
      if (focusField.current)
        setFocusToField(focusField.current);
    };
    return AccuDrawUiAdmin.onAccuDrawGrabInputFocusEvent.addListener(handleGrabInputFocus);
  }, [setFocusToField]);

  React.useEffect(() => {
    const compassMode = IModelApp.accuDraw.compassMode;
    const accuDrawMode = compassMode === CompassMode.Rectangular ? AccuDrawMode.Rectangular : AccuDrawMode.Polar;
    setMode(accuDrawMode);

    const handleSetMode = (args: AccuDrawSetModeEventArgs) => {
      setMode(args.mode);
    };

    return AccuDrawUiAdmin.onAccuDrawSetModeEvent.addListener(handleSetMode);
  }, []);

  const handleValueChanged = React.useCallback((field: AccuDrawField, stringValue: string) => {
    IModelApp.uiAdmin.accuDrawUi.setFieldValueFromUi(field, stringValue);
  }, []);

  const handleEscPressed = React.useCallback(() => {
    KeyboardShortcutManager.setFocusToHome();
  }, []);

  const classNames = classnames(
    "uifw-accudraw-field-container",
    className,
  );

  const delay = 250;

  return (
    <div className={classNames} style={style} {...otherProps}>
      {mode === AccuDrawMode.Rectangular &&
        <>
          <AccuDrawInputField ref={xInputRef} initialValue={xFormattedValue.current} isLocked={xLock} className="uifw-accudraw-x-value" valueChangedDelay={delay}
            field={AccuDrawField.X} id="uifw-accudraw-x" label="X"
            onValueChanged={(stringValue) => handleValueChanged(AccuDrawField.X, stringValue)}
            onEscPressed={handleEscPressed} />
          <AccuDrawInputField ref={yInputRef} initialValue={yFormattedValue.current} isLocked={yLock} className="uifw-accudraw-y-value" valueChangedDelay={delay}
            field={AccuDrawField.Y} id="uifw-accudraw-y" label="Y"
            onValueChanged={(stringValue) => handleValueChanged(AccuDrawField.Y, stringValue)}
            onEscPressed={handleEscPressed} />
          <AccuDrawInputField ref={zInputRef} initialValue={zFormattedValue.current} isLocked={zLock} className="uifw-accudraw-z-value" valueChangedDelay={delay}
            field={AccuDrawField.Z} id="uifw-accudraw-z" label="Z"
            onValueChanged={(stringValue) => handleValueChanged(AccuDrawField.Z, stringValue)}
            onEscPressed={handleEscPressed} />
        </>
      }
      {mode === AccuDrawMode.Polar &&
        <>
          <AccuDrawInputField ref={angleInputRef} initialValue={angleFormattedValue.current} isLocked={angleLock} className="uifw-accudraw-angle-value" valueChangedDelay={delay}
            field={AccuDrawField.Angle} id="uifw-accudraw-angle" iconSpec={IconSpecUtilities.createSvgIconSpec(angleIcon)}
            onValueChanged={(stringValue) => handleValueChanged(AccuDrawField.Angle, stringValue)}
            onEscPressed={handleEscPressed} />
          <AccuDrawInputField ref={distanceInputRef} initialValue={distanceFormattedValue.current} isLocked={distanceLock} className="uifw-accudraw-distance-value" valueChangedDelay={delay}
            field={AccuDrawField.Distance} id="uifw-accudraw-distance" iconSpec={IconSpecUtilities.createSvgIconSpec(distanceIcon)}
            onValueChanged={(stringValue) => handleValueChanged(AccuDrawField.Distance, stringValue)}
            onEscPressed={handleEscPressed} />
        </>
      }
    </div>
  );
}
