/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Inputs
 */

import "./NumberInput.scss";
import classnames from "classnames";
import * as React from "react";
import { Input, InputProps } from "@itwin/itwinui-react";
import { SpecialKey } from "@bentley/ui-abstract";
import { WebFontIcon } from "../../icons/WebFontIcon";

/** Step function prototype for [[NumberInput]] component
 * @beta
 */
export type StepFunctionProp = number | ((direction: string) => number | undefined);

/** Properties for the [[NumberInput]] component
 * @beta
 */
export interface NumberInputProps extends Omit<InputProps, "min" | "max" | "step" | "onChange"> {
  /** Numeric value, set to `undefined` to show placeholder text */
  value?: number;
  /** CSS class name for the NumberInput component container div */
  containerClassName?: string;
  /** number or function	Number.MIN_SAFE_INTEGER */
  min?: number;
  /** number or function	defaults to Number.MAX_SAFE_INTEGER */
  max?: number;
  /** increment step value used while incrementing or decrementing (up/down buttons or arrow keys) defaults to 1. */
  step?: StepFunctionProp;
  /** number of decimal places, defaults to 0 */
  precision?: number;
  /** function parseFloat */
  parse?: ((value: string) => number | null | undefined);
  /** function optional formatting function that takes the number value and the internal formatted value in case function just adds prefix or suffix. */
  format?: (num: number | null | undefined, formattedValue: string) => string;
  /** Set to true to "snap" to the closest step value while incrementing or decrementing (up/down buttons or arrow keys). */
  snap?: boolean;
  /** Function to call when value is changed. */
  onChange?: (value: number | undefined, stringValue: string) => void;
  /** if true up/down buttons are shown larger and side by side */
  showTouchButtons?: boolean;
  /** Provides ability to return reference to HTMLInputElement */
  ref?: React.Ref<HTMLInputElement>;
}

const ForwardRefNumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function ForwardRefNumberInput(props, ref) {
    const { containerClassName, value, min, max, precision, format, parse,
      onChange, onBlur, onKeyDown, step, snap, showTouchButtons, ...otherProps } = props;
    const currentValueRef = React.useRef(value);

    /**
   * Used internally to parse the argument x to it's numeric representation.
   * If the argument cannot be converted to finite number returns 0; If a
   * "precision" prop is specified uses it round the number with that
   * precision (no fixed precision here because the return value is float, not
   * string).
   */
    const parseInternal = React.useCallback((x: string) => {
      let n: number | undefined | null;

      if (parse)
        n = parse(x);
      if (undefined === n || null === n) {
        n = parseFloat(x);
        if (isNaN(n) || !isFinite(n)) {
          n = 0;
        }
      }

      const localPrecision = undefined === precision ? 10 : precision;
      const q = Math.pow(10, localPrecision);
      const localMin = undefined === min ? Number.MIN_SAFE_INTEGER : min;
      const localMax = undefined === max ? Number.MAX_SAFE_INTEGER : max;
      n = Math.min(Math.max(n, localMin), localMax);
      n = Math.round(n * q) / q;

      return n;
    }, [parse, precision, min, max]);

    /**
   * This is used internally to format a number to its display representation.
   * It will invoke the format function if one is provided.
   */
    const formatInternal = React.useCallback((num: number | undefined | null) => {
      const localPrecision = undefined === precision || null === precision ? 0 : precision;
      const str = undefined === num || null === num ? "" : num.toFixed(localPrecision);

      if (format)
        return format(num, str);

      return str;
    }, [format, precision]);

    const [formattedValue, setFormattedValue] = React.useState(() => formatInternal(value));

    // See if new initialValue props have changed since component mounted
    React.useEffect(() => {
      currentValueRef.current = value;
      const currentFormattedValue = formatInternal(currentValueRef.current);
      setFormattedValue(currentFormattedValue);
    }, [formatInternal, value]);

    const handleChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      setFormattedValue(event.currentTarget.value);
    }, []);

    const updateValue = React.useCallback((newVal: number) => {
      const newFormattedVal = formatInternal(newVal);
      onChange && onChange(newVal, newFormattedVal);
      setFormattedValue(newFormattedVal);
    }, [onChange, formatInternal]);

    const updateValueFromString = React.useCallback((strValue: string) => {
      const newVal = parseInternal(strValue);
      updateValue(newVal);
    }, [parseInternal, updateValue]);

    const handleBlur = React.useCallback((event: React.FocusEvent<HTMLInputElement>) => {
      const newVal = parseInternal(event.target.value);
      onBlur && onBlur(event);
      updateValue(newVal);
    }, [parseInternal, updateValue, onBlur]);

    const getIncrementValue = React.useCallback((increment: boolean) => {
      if (typeof step === "function") {
        const stepVal = step(increment ? "up" : "down");
        return stepVal ? stepVal : 1;
      }

      return !step ? 1 : step;
    }, [step]);

    /**
   * The internal method that actually sets the new value on the input
   */
    const applyStep = React.useCallback((increment: boolean) => {
      const incrementValue = getIncrementValue(increment);

      let num = parseInternal(formattedValue) + (increment ? incrementValue : -incrementValue);
      if (snap) {
        num = Math.round(num / incrementValue) * incrementValue;
      }

      const localMin = undefined === min ? Number.MIN_SAFE_INTEGER : min;
      const localMax = undefined === max ? Number.MAX_SAFE_INTEGER : max;
      num = Math.min(Math.max(num, localMin), localMax);

      updateValue(num);
    }, [formattedValue, getIncrementValue, max, min, parseInternal, snap, updateValue]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
      // istanbul ignore else
      if (event.key === SpecialKey.Enter) {
        updateValueFromString(event.currentTarget.value);
        event.preventDefault();
      } else if (event.key === SpecialKey.Escape) {
        setFormattedValue(formatInternal(currentValueRef.current));
        event.preventDefault();
      } else if (event.key === SpecialKey.ArrowDown) {
        applyStep(false);
        event.preventDefault();
      } else if (event.key === SpecialKey.ArrowUp) {
        applyStep(true);
        event.preventDefault();
      }
      onKeyDown && onKeyDown(event);
    }, [applyStep, formatInternal, updateValueFromString, onKeyDown]);

    const handleDownClick = React.useCallback((event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      applyStep(false);
      event.preventDefault();
    }, [applyStep]);

    const handleUpClick = React.useCallback((event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      applyStep(true);
      event.preventDefault();
    }, [applyStep]);

    const containerClasses = classnames("core-number-input-container", containerClassName, showTouchButtons && "core-number-buttons-for-touch");
    return (
      <div className={containerClasses} >
        <Input ref={ref} value={formattedValue} onChange={handleChange} onKeyDown={handleKeyDown} onBlur={handleBlur} {...otherProps} />
        <div className={classnames("core-number-input-buttons-container", showTouchButtons && "core-number-buttons-for-touch")}>
          { /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="core-number-input-button core-number-input-button-up" tabIndex={-1} onClick={handleUpClick}>
            <WebFontIcon iconName="icon-caret-up" />
          </div>
          { /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="core-number-input-button core-number-input-button-down" tabIndex={-1} onClick={handleDownClick}>
            <WebFontIcon iconName="icon-caret-down" />
          </div>
        </div>
      </div>
    );
  }
);

/** Input component for numbers with up and down buttons to increment and decrement the value.
 * @beta
 */
export const NumberInput: (props: NumberInputProps) => JSX.Element | null = ForwardRefNumberInput;
