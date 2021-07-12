/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormat
 */

import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { UiComponents } from "../../UiComponents";
import { Select, SelectOption } from "@itwin/itwinui-react";

/** Properties of [[ThousandsSelector]] component.
 * @internal
 */
export interface ThousandsSelectorProps extends CommonProps {
  separator: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

/** Component use to set Quantity Format thousand group separator.
 * @internal
 */
export function ThousandsSelector(props: ThousandsSelectorProps) {
  const { separator, disabled, onChange, ...otherProps } = props;
  const uomDefaultEntries = React.useRef<SelectOption<string>[]>([
    { value: ",", label: UiComponents.translate("QuantityFormat.thousand_separator.comma") },
    { value: ".", label: UiComponents.translate("QuantityFormat.thousand_separator.point") },
  ]);

  const handleOnChange = React.useCallback((newValue: string) => {
    onChange && onChange(newValue);
  }, [onChange]);

  const separatorOptions = React.useMemo(() => {
    const completeListOfEntries: SelectOption<string>[] = [];
    // istanbul ignore next (only used if format already has a character that does not match standard options)
    if (undefined === uomDefaultEntries.current.find((option) => option.value === separator)) {
      completeListOfEntries.push({ value: separator, label: separator });
    }
    completeListOfEntries.push(...uomDefaultEntries.current);
    return completeListOfEntries;
  }, [separator]);

  return (
    <Select options={separatorOptions} disabled={disabled} value={separator} onChange={handleOnChange} {...otherProps} />
  );
}
