/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormat
 */

import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { Format, FormatProps, FormatType } from "@bentley/imodeljs-quantity";
import { DecimalPrecisionSelector } from "./DecimalPrecision";
import { FractionPrecisionSelector } from "./FractionPrecision";

/** Properties of [[UomSeparatorSelector]] component.
 * @alpha
 */
export interface FormatPrecisionProps extends CommonProps {
  formatProps: FormatProps;
  onChange?: (format: FormatProps) => void;
}

/** Component to show/edit Quantity Format.
 * @alpha
 */
export function FormatPrecision(props: FormatPrecisionProps) {
  const { formatProps, onChange } = props;

  const handlePrecisionChange = React.useCallback((precision: number) => {
    const newFormatProps = { ...formatProps, precision };
    onChange && onChange(newFormatProps);
  }, [formatProps, onChange]);

  const formatType = Format.parseFormatType(formatProps.type, "format");
  return (
    <>
      <span className={"uicore-label"}>Precision</span>
      {formatType === FormatType.Fractional ?
        <FractionPrecisionSelector precision={formatProps.precision ?? 0} onChange={handlePrecisionChange} /> :
        <DecimalPrecisionSelector precision={formatProps.precision ?? 0} onChange={handlePrecisionChange} />
      }
    </>
  );
}
