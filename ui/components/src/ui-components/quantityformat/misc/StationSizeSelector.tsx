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

/** Properties of [[StationSizeSelector]] component.
 * @internal
 */
export interface StationSizeSelectorProps extends CommonProps {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

/** Component use to set Station size (number of digits from right until '+').
 * @internal
 */
export function StationSizeSelector(props: StationSizeSelectorProps) {
  const { value, disabled, onChange, ...otherProps } = props;
  const separatorOptions = React.useRef<SelectOption<number>[]>([
    { value: 2, label: UiComponents.translate("QuantityFormat.station_size.two") },
    { value: 3, label: UiComponents.translate("QuantityFormat.station_size.three") },
  ]);

  const handleOnChange = React.useCallback((newValue: number) => {
    onChange && onChange(newValue);
  }, [onChange]);

  return (
    <Select options={separatorOptions.current} disabled={disabled} value={value} onChange={handleOnChange} {...otherProps} />
  );
}
