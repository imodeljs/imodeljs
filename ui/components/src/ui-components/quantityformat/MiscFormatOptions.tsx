/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormat
 */

import classnames from "classnames";
import * as React from "react";
import { Button, ButtonType, Checkbox, CommonProps, WebFontIcon } from "@bentley/ui-core";
import { Format, FormatProps, FormatTraits, FormatType, ScientificType, ShowSignOption } from "@bentley/imodeljs-quantity";
import { SignOptionSelector } from "./SignOption";
import { ThousandsSeparator } from "./ThousandsSeparator";
import { DecimalSeparatorSelector } from "./DecimalSeparator";
import { ScientificTypeSelector } from "./ScientificType";

/** Properties of [[MiscFormatOptions]] component.
 * @alpha
 */
export interface MiscFormatOptionsProps extends CommonProps {
  formatProps: FormatProps;
  onChange?: (format: FormatProps) => void;
  showOptions: boolean;
  onShowHideOptions: (show: boolean) => void;
}

/** Component to show/edit Quantity Format.
 * @alpha
 */
export function MiscFormatOptions(props: MiscFormatOptionsProps) {
  const { formatProps, onChange, showOptions, onShowHideOptions } = props;

  const handleSetFormatProps = React.useCallback((newFormatProps: FormatProps) => {
    onChange && onChange(newFormatProps);
  }, [onChange]);

  const isFormatTraitSet = React.useCallback((trait: FormatTraits) => {
    return Format.isFormatTraitSetInProps(formatProps, trait);
  }, [formatProps]);

  const handleShowSignChange = React.useCallback((option: ShowSignOption) => {
    const newShowSignOption = Format.showSignOptionToString(option);
    const newFormatProps = { ...formatProps, showSignOption: newShowSignOption };
    handleSetFormatProps(newFormatProps);
  }, [formatProps, handleSetFormatProps]);

  const setFormatTrait = React.useCallback((trait: FormatTraits, setActive: boolean) => {
    const traitStr = Format.getTraitString(trait);
    if (undefined === traitStr)
      return;
    let formatTraits: string[] | undefined;

    if (setActive) {
      // setting trait
      if (!formatProps.formatTraits) {
        formatTraits = [traitStr];
      } else {
        const traits = Array.isArray(formatProps.formatTraits) ? formatProps.formatTraits : formatProps.formatTraits.split(/,|;|\|/);
        if (!traits.find((traitEntry) => traitStr === traitEntry)) {
          formatTraits = [...traits, traitStr];
        }
      }
    } else {
      // clearing trait
      if (!formatProps.formatTraits)
        return;
      const traits = Array.isArray(formatProps.formatTraits) ? formatProps.formatTraits : formatProps.formatTraits.split(/,|;|\|/);
      formatTraits = traits.filter((traitEntry) => traitEntry !== traitStr);
    }
    const newFormatProps = { ...formatProps, formatTraits };
    handleSetFormatProps(newFormatProps);
  }, [formatProps, handleSetFormatProps]);

  const handleShowTrailingZeroesChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormatTrait(FormatTraits.TrailZeroes, e.target.checked);
  }, [setFormatTrait]);

  const handleKeepDecimalPointChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormatTrait(FormatTraits.KeepDecimalPoint, e.target.checked);
  }, [setFormatTrait]);

  const handleKeepSingleZeroChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormatTrait(FormatTraits.KeepSingleZero, e.target.checked);
  }, [setFormatTrait]);

  const handleZeroEmptyChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormatTrait(FormatTraits.ZeroEmpty, e.target.checked);
  }, [setFormatTrait]);

  const handleUseFractionDashChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormatTrait(FormatTraits.FractionDash, e.target.checked);
  }, [setFormatTrait]);

  const handleDecimalSeparatorChange = React.useCallback((decimalSeparator: string) => {
    let thousandSeparator = formatProps.thousandSeparator;
    // make sure 1000 and decimal separator do not match
    if (isFormatTraitSet(FormatTraits.Use1000Separator)) {
      if (decimalSeparator === ".")
        thousandSeparator = ",";
      else if (decimalSeparator === ",")
        thousandSeparator = ".";
    }
    const newFormatProps = { ...formatProps, thousandSeparator, decimalSeparator };
    handleSetFormatProps(newFormatProps);
  }, [formatProps, isFormatTraitSet, handleSetFormatProps]);

  const handleScientificTypeChange = React.useCallback((type: ScientificType) => {
    const newFormatProps = { ...formatProps, scientificType: Format.scientificTypeToString(type) };
    handleSetFormatProps(newFormatProps);
  }, [formatProps, handleSetFormatProps]);

  const handleFormatChange = React.useCallback((newFormatProps: FormatProps) => {
    handleSetFormatProps(newFormatProps);
  }, [handleSetFormatProps]);

  const formatType = React.useMemo(() => Format.parseFormatType(formatProps.type, "format"), [formatProps.type]);
  const showSignOption = React.useMemo(() => Format.parseShowSignOption(formatProps.showSignOption ?? "onlyNegative", "format"), [formatProps.showSignOption]);

  const handleToggleButtonClick = React.useCallback(() => {
    onShowHideOptions(!showOptions);
  }, [onShowHideOptions, showOptions]);

  return (
    <>
      <span />
      <Button buttonType={ButtonType.Hollow} onClick={handleToggleButtonClick}>
        <WebFontIcon iconName={showOptions ? "icon-caret-up" : "icon-caret-down"} />
      </Button>
      {showOptions &&
        <>
          <span className={"uicore-label"}>Sign Option</span>
          <SignOptionSelector signOption={showSignOption} onChange={handleShowSignChange} />

          <ThousandsSeparator formatProps={formatProps} onChange={handleFormatChange} />

          <span className={classnames("uicore-label", formatType === FormatType.Fractional && "uicore-disabled")}>Decimal Separator</span>
          <DecimalSeparatorSelector separator={formatProps.decimalSeparator ?? "."} onChange={handleDecimalSeparatorChange} disabled={formatType === FormatType.Fractional} />

          <span className={"uicore-label"}>Show Trailing Zeros</span>
          <Checkbox isLabeled={true} checked={isFormatTraitSet(FormatTraits.TrailZeroes)} onChange={handleShowTrailingZeroesChange} />

          <span className={classnames("uicore-label", formatType === FormatType.Fractional && "uicore-disabled")} >Keep Decimal Point</span>
          <Checkbox isLabeled={true} checked={isFormatTraitSet(FormatTraits.KeepDecimalPoint)} onChange={handleKeepDecimalPointChange} />

          <span className={"uicore-label"}>Keep Single Zero</span>
          <Checkbox isLabeled={true} checked={isFormatTraitSet(FormatTraits.KeepSingleZero)} onChange={handleKeepSingleZeroChange} />

          <span className={"uicore-label"}>Zero Empty</span>
          <Checkbox isLabeled={true} checked={isFormatTraitSet(FormatTraits.ZeroEmpty)} onChange={handleZeroEmptyChange} />

          <span className={classnames("uicore-label", formatType !== FormatType.Fractional && "uicore-disabled")}>Fraction Dash</span>
          <Checkbox isLabeled={true} checked={isFormatTraitSet(FormatTraits.FractionDash)} onChange={handleUseFractionDashChange} disabled={formatType !== FormatType.Fractional} />

          <span className={classnames("uicore-label", formatType !== FormatType.Scientific && "uicore-disabled")}>Scientific Type</span>
          <ScientificTypeSelector type={(formatProps.scientificType && formatProps.scientificType.length > 0) ? Format.parseScientificType(formatProps.scientificType, "custom") : ScientificType.Normalized}
            disabled={formatType !== FormatType.Scientific} onChange={handleScientificTypeChange} />
        </>
      }
    </>
  );
}
