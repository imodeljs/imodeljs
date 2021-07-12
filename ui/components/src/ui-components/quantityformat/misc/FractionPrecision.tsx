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

/** Properties of [[FractionPrecisionSelector]] component.
 * @internal
 */
export interface FractionPrecisionSelectorProps extends CommonProps {
  precision: number;
  onChange: (value: number) => void;
}

/** Component use to set Fraction precision
 * @internal
 */
export function FractionPrecisionSelector(props: FractionPrecisionSelectorProps) {
  const { precision, onChange, ...otherProps } = props;
  const options = React.useRef<SelectOption<number>[]>([
    { value: 1, label: UiComponents.translate("QuantityFormat.fraction_precision.whole") },
    { value: 2, label: UiComponents.translate("QuantityFormat.fraction_precision.half") },
    { value: 4, label: UiComponents.translate("QuantityFormat.fraction_precision.quarter") },
    { value: 8, label: UiComponents.translate("QuantityFormat.fraction_precision.eighth") },
    { value: 16, label: UiComponents.translate("QuantityFormat.fraction_precision.sixteenth") },
    { value: 32, label: UiComponents.translate("QuantityFormat.fraction_precision.over32") },
    { value: 64, label: UiComponents.translate("QuantityFormat.fraction_precision.over64") },
    { value: 128, label: UiComponents.translate("QuantityFormat.fraction_precision.over128") },
    { value: 256, label: UiComponents.translate("QuantityFormat.fraction_precision.over256") },
  ]);

  const handleOnChange = React.useCallback((newValue: number) => {
    onChange && onChange(newValue);
  }, [onChange]);

  return (
    <Select options={options.current} value={precision} onChange={handleOnChange} {...otherProps} />
  );
}
