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

/** Properties of [[DecimalPrecisionSelector]] component.
 * @internal
 */
export interface DecimalPrecisionSelectorProps extends CommonProps {
  precision: number;
  onChange: (value: number) => void;
}

/** Component use to set Decimal Precision
 * the unit label.
 * @internal
 */
export function DecimalPrecisionSelector(props: DecimalPrecisionSelectorProps) {
  const { precision, onChange, ...otherProps } = props;
  const options = React.useRef<SelectOption<number>[]>([
    { value: 0, label: UiComponents.translate("QuantityFormat.decimal_precision.zero") },
    { value: 1, label: UiComponents.translate("QuantityFormat.decimal_precision.one") },
    { value: 2, label: UiComponents.translate("QuantityFormat.decimal_precision.two") },
    { value: 3, label: UiComponents.translate("QuantityFormat.decimal_precision.three") },
    { value: 4, label: UiComponents.translate("QuantityFormat.decimal_precision.four") },
    { value: 5, label: UiComponents.translate("QuantityFormat.decimal_precision.five") },
    { value: 6, label: UiComponents.translate("QuantityFormat.decimal_precision.six") },
    { value: 7, label: UiComponents.translate("QuantityFormat.decimal_precision.seven") },
    { value: 8, label: UiComponents.translate("QuantityFormat.decimal_precision.eight") },
    { value: 9, label: UiComponents.translate("QuantityFormat.decimal_precision.nine") },
    { value: 10, label: UiComponents.translate("QuantityFormat.decimal_precision.ten") },
    { value: 11, label: UiComponents.translate("QuantityFormat.decimal_precision.eleven") },
    { value: 12, label: UiComponents.translate("QuantityFormat.decimal_precision.twelve") },
  ]);

  const handleOnChange = React.useCallback((newValue: number) => {
    onChange && onChange(newValue);
  }, [onChange]);

  return (
    <Select options={options.current} value={precision} onChange={handleOnChange} {...otherProps} />
  );
}
