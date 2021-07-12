/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Inputs
 */

import * as React from "react";
import classnames from "classnames";
import { Input } from "@itwin/itwinui-react";
import { CommonProps } from "@bentley/ui-core";
import { ParseResults, SpecialKey } from "@bentley/ui-abstract";
import "./ParsedInput.scss";

/** Props for [[ParsedInput]] control
 * @beta
 */
export interface ParsedInputProps extends CommonProps {
  /** InitialValue which is used to restore input field if ESC is pressed */
  initialValue: number;
  /** Function used to format the value */
  formatValue: (value: number) => string;
  /** Function used to parse user input into a value */
  parseString: (stringValue: string) => ParseResults;
  /** Function to call when value is changed */
  onChange?: (newValue: number) => void;
  /** if readonly then only the formatValue function is used. */
  readonly?: boolean;
  /** Provides ability to return reference to HTMLInputElement */
  ref?: React.Ref<HTMLInputElement>;
}

const ForwardRefParsedInput = React.forwardRef<HTMLInputElement, ParsedInputProps>(
  function ForwardRefParsedInput({ initialValue, formatValue, parseString, readonly, className, style, onChange }, ref) {
    const currentValueRef = React.useRef(initialValue);
    const isMountedRef = React.useRef(false);
    const lastFormattedValueRef = React.useRef(formatValue(initialValue));
    const [formattedValue, setFormattedValue] = React.useState(() => lastFormattedValueRef.current);
    const [hasBadInput, setHasBadInput] = React.useState(false);

    React.useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    // See if new initialValue props have changed since component mounted
    React.useEffect(() => {
      currentValueRef.current = initialValue;
      const currentFormattedValue = formatValue(currentValueRef.current);
      if (currentFormattedValue !== lastFormattedValueRef.current) {
        lastFormattedValueRef.current = currentFormattedValue;
        setFormattedValue(lastFormattedValueRef.current);
        setHasBadInput(false);
      }
    }, [formatValue, initialValue]);

    const handleChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      setFormattedValue(event.currentTarget.value);
    }, []);

    const updateValueFromString = React.useCallback((strVal: string) => {
      if (lastFormattedValueRef.current === strVal)
        return;

      const parseResults = (parseString(strVal));
      // istanbul ignore else
      if (!parseResults.parseError) {
        // istanbul ignore else
        if (undefined !== parseResults.value && typeof parseResults.value === "number") {
          const currentValue = parseResults.value;
          // istanbul ignore else
          if (currentValue !== currentValueRef.current) {
            currentValueRef.current = currentValue;
            onChange && onChange(currentValueRef.current);
          }
          // istanbul ignore else
          if (isMountedRef.current) {
            lastFormattedValueRef.current = formatValue(currentValue);
            setFormattedValue(lastFormattedValueRef.current);
            setHasBadInput(false);
          }
        }
      } else {
        setHasBadInput(true);
      }
    }, [formatValue, onChange, parseString]);

    const handleBlur = React.useCallback((event: React.FocusEvent<HTMLInputElement>) => {
      updateValueFromString(event.target.value);
    }, [updateValueFromString]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
      // istanbul ignore else
      if (event.key === SpecialKey.Enter) {
        updateValueFromString(event.currentTarget.value);
        event.preventDefault();
      }
      if (event.key === SpecialKey.Escape) {
        setFormattedValue(formatValue(currentValueRef.current));
        setHasBadInput(false);
        event.preventDefault();
      }
    }, [formatValue, updateValueFromString]);

    const classNames = classnames(className, "components-parsed-input", hasBadInput && "components-parsed-input-has-error");

    return <Input data-testid="components-parsed-input" ref={ref} style={style} className={classNames} onKeyDown={handleKeyDown} onBlur={handleBlur}
      onChange={handleChange} value={formattedValue} disabled={readonly} />;
  }
);

/** Generic Input component that requires formatting and parsing functions to be passed in as props.
 * @beta
 */
export const ParsedInput: (props: ParsedInputProps) => JSX.Element | null = ForwardRefParsedInput;

