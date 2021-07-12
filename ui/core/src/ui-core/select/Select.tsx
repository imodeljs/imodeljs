/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Select
 */

/* eslint-disable deprecation/deprecation */

import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";
import { useRefs } from "../utils/hooks/useRefs";

/** Properties for a Select option
 * @public
 * @deprecated Use SelectOption in itwinui-react instead
 */
export interface SelectOption {
  /** Label of the option. If `value` is not set when using SelectOption[], also serves as the value. */
  label: string;
  /** Value of the option when using SelectOption[].  */
  value?: string | number | readonly string[];
  /** Indicates whether the option is disabled. */
  disabled?: boolean;
}

/** Properties for [[Select]] component
 * @public
 * @deprecated Use SelectProps in itwinui-react instead
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, CommonProps {
  /** Options for Select dropdown.
   * @example
   * // Example of {[key: string]: (string | SelectOption)} usage:
   * <Select options={{
   *  option1: "Option 1",
   *  option2: "Option 2",
   *  option3: {label: "Option 3", disabled: true},
   * }} />
   *
   * // Example of (string | SelectOption)[] usage:
   * <Select options={[
   *  "Option 1",
   *  "Option 2",
   *  {label: "Option 3", value: "option3", disabled: true},
   * ]} />
   * }
   */
  options: (string | SelectOption)[] | { [key: string]: (string | SelectOption) };
  /** Indicates whether to set focus to the select element */
  setFocus?: boolean;
  /** Provides ability to return reference to HTMLSelectElement */
  ref?: React.Ref<HTMLSelectElement>;
}

function getCurrentDefaultValue(defaultValue: string | number | readonly string[] | undefined, placeholderValue: string | undefined) {
  if (defaultValue)
    return defaultValue;

  return placeholderValue;
}

function getOptionLabel(option: string | SelectOption): string {
  return (typeof option === "string") ? option : option.label;
}

function getOptionValue(option: string | SelectOption): string | number | readonly string[] {
  return (typeof option === "string") ? option : (undefined !== option.value ? option.value : option.label);
}

function getOptionDisabled(option: string | SelectOption): boolean | undefined {
  return (typeof option === "string") ? undefined : option.disabled;
}

const ForwardRefSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  function ForwardRefSelect(props, ref) {
    const selectElement = React.useRef<HTMLSelectElement>(null);
    const placeholderValue = React.useRef("placeholder");
    const isInitialMount = React.useRef(true);
    const refs = useRefs(selectElement, ref);  // combine ref needed for target with the forwardRef needed by the Parent when parent is a Type Editor.

    React.useEffect(() => {
      if (props.setFocus && selectElement.current)
        selectElement.current.focus();
    }, [props]);

    React.useEffect(() => {
      isInitialMount.current = false;
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { value: selectValue, required, options, setFocus, className, defaultValue, ...otherProps } = props; // pluck off values that will be explicitly set below
    const showPlaceholder = React.useMemo(() => props.placeholder && (undefined === selectValue || selectValue === placeholderValue.current) && !defaultValue, [defaultValue, selectValue, props.placeholder]);
    const isRequired = React.useMemo(() => showPlaceholder || required, [required, showPlaceholder]);
    const currentDefaultValue = React.useMemo(() => getCurrentDefaultValue(defaultValue, showPlaceholder ? placeholderValue.current : undefined), [defaultValue, showPlaceholder]);
    const value = (!isInitialMount.current && undefined === selectValue) ? currentDefaultValue : selectValue;
    return (
      <select ref={refs} {...otherProps}
        required={isRequired}
        className={classnames("uicore-inputs-select", className)}
        value={value}
        defaultValue={value === undefined ? currentDefaultValue : undefined}>
        {showPlaceholder &&
          <option className="placeholder" disabled key="" value={placeholderValue.current}>{props.placeholder}</option>
        }
        {options instanceof Array ?
          options.map((option, index) => (
            <option key={index} value={getOptionValue(option)} disabled={getOptionDisabled(option)} >
              {getOptionLabel(option)}
            </option>
          ))
          :
          Object.keys(options).map((key) => (
            <option key={key} value={key} disabled={getOptionDisabled(options[key])} >
              {getOptionLabel(options[key])}
            </option>
          ))
        }
      </select>
    );
  }
);

/** Basic select component is a wrapper for the `<select>` HTML element.
 * @public
 * @deprecated Use Select in itwinui-react instead
 */
export const Select: (props: SelectProps) => JSX.Element | null = ForwardRefSelect;
