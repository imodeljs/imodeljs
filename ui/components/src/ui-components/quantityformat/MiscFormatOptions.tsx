/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormat
 */

import classnames from "classnames";
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { CommonProps } from "@bentley/ui-core";
import { Checkbox } from "@itwin/itwinui-react";
import { Format, FormatProps, FormatTraits, FormatType, ScientificType, ShowSignOption } from "@bentley/imodeljs-quantity";
import { SignOptionSelector } from "./misc/SignOption";
import { ThousandsSeparator } from "./misc/ThousandsSeparator";
import { DecimalSeparatorSelector } from "./misc/DecimalSeparator";
import { ScientificTypeSelector } from "./misc/ScientificType";
import { StationSeparatorSelector } from "./misc/StationSeparatorSelector";
import { StationSizeSelector } from "./misc/StationSizeSelector";
import { UiComponents } from "../UiComponents";

/** Properties of [[MiscFormatOptions]] component.
 * @alpha
 */
export interface MiscFormatOptionsProps extends CommonProps {
  formatProps: FormatProps;
  onChange?: (format: FormatProps) => void;
  enableMinimumProperties?: boolean;
  showOptions: boolean;
  onShowHideOptions: (show: boolean) => void;
  children?: React.ReactNode;
}

/** Component use to set miscellaneous properties is a Formatted Quantity.
 * @alpha
 */
export function MiscFormatOptions(props: MiscFormatOptionsProps) {
  const { formatProps, onChange, showOptions, onShowHideOptions, enableMinimumProperties } = props;

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
    let formatTraits: string[] = [traitStr];
    if (setActive) {// setting trait
      // istanbul ignore else
      if (formatProps.formatTraits) {
        const traits = Array.isArray(formatProps.formatTraits) ? formatProps.formatTraits : /* istanbul ignore next */ formatProps.formatTraits.split(/,|;|\|/);
        // istanbul ignore else
        if (!traits.find((traitEntry) => traitStr === traitEntry)) {
          formatTraits = [...traits, traitStr];
        }
      }
    } else {// clearing trait
      // istanbul ignore next
      if (!formatProps.formatTraits)
        return;
      const traits = Array.isArray(formatProps.formatTraits) ? formatProps.formatTraits : /* istanbul ignore next */ formatProps.formatTraits.split(/,|;|\|/);
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
    // istanbul ignore else
    if (isFormatTraitSet(FormatTraits.Use1000Separator)) {
      switch (decimalSeparator) {
        case ".":
          thousandSeparator = ",";
          break;
        case ",":
          thousandSeparator = ".";
          break;
      }
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

  const handleKeyUpOnLink = React.useCallback((e: React.KeyboardEvent<HTMLAnchorElement>) => {
    // istanbul ignore else
    if (e.key === SpecialKey.Enter || e.key === SpecialKey.Space) {
      onShowHideOptions(!showOptions);
      e.preventDefault();
    }
  }, [onShowHideOptions, showOptions]);

  const handleStationSeparatorChange = React.useCallback((value: string) => {
    const newFormatProps = { ...formatProps, stationSeparator: value };
    handleSetFormatProps(newFormatProps);
  }, [formatProps, handleSetFormatProps]);

  const handleStationOffsetChange = React.useCallback((value: number) => {
    const newFormatProps = { ...formatProps, stationOffsetSize: value };
    handleSetFormatProps(newFormatProps);
  }, [formatProps, handleSetFormatProps]);

  const signOptionLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.signOptionLabel"));
  const stationOffsetLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.stationOffsetLabel"));
  const stationSeparatorLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.stationSeparatorLabel"));
  const decimalSeparatorLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.decimalSeparatorLabel"));
  const showTrailZerosLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.showTrailZerosLabel"));
  const keepSingleZeroLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.keepSingleZeroLabel"));
  const zeroEmptyLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.zeroEmptyLabel"));
  const moreLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.moreLabel"));
  const lessLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.lessLabel"));
  const keepDecimalPointLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.keepDecimalPointLabel"));
  const fractionDashLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.fractionDashLabel"));
  const scientificTypeLabel = React.useRef(UiComponents.translate("QuantityFormat.labels.scientificTypeLabel"));

  return (
    <>
      { // eslint-disable-next-line jsx-a11y/anchor-is-valid
        enableMinimumProperties && !showOptions && <a onClick={handleToggleButtonClick} onKeyUp={handleKeyUpOnLink}
          className={"components-quantityFormat-more-less"} role="link" data-testid="quantityFormat-more" tabIndex={0} >{moreLabel.current}</a>}
      {
        (!enableMinimumProperties || showOptions) &&
        <>
          <span className={"uicore-label"}>{signOptionLabel.current}</span>
          <SignOptionSelector data-testid="sign-option-selector" signOption={showSignOption} onChange={handleShowSignChange} />

          <span className={classnames("uicore-label", formatType !== FormatType.Station && "uicore-disabled")}>{stationOffsetLabel.current}</span>
          <StationSizeSelector data-testid="station-size-selector" value={(formatProps.stationOffsetSize ?? 2)}
            disabled={formatType !== FormatType.Station} onChange={handleStationOffsetChange} />

          <span className={classnames("uicore-label", formatType !== FormatType.Station && "uicore-disabled")}>{stationSeparatorLabel.current}</span>
          <StationSeparatorSelector data-testid="station-separator-selector" separator={(undefined !== formatProps.stationSeparator ? formatProps.stationSeparator : "+")}
            disabled={formatType !== FormatType.Station} onChange={handleStationSeparatorChange} />

          <ThousandsSeparator formatProps={formatProps} onChange={handleFormatChange} />

          <span className={classnames("uicore-label", formatType === FormatType.Fractional && "uicore-disabled")}>{decimalSeparatorLabel.current}</span>
          <DecimalSeparatorSelector data-testid="decimal-separator-selector" separator={formatProps.decimalSeparator ?? "."} onChange={handleDecimalSeparatorChange} disabled={formatType === FormatType.Fractional} />

          <span className={"uicore-label"}>{showTrailZerosLabel.current}</span>
          <Checkbox data-testid="show-trail-zeros" checked={isFormatTraitSet(FormatTraits.TrailZeroes)} onChange={handleShowTrailingZeroesChange} />

          <span className={classnames("uicore-label", formatType === FormatType.Fractional && "uicore-disabled")}>{keepDecimalPointLabel.current}</span>
          <Checkbox data-testid="keep-decimal-point" checked={isFormatTraitSet(FormatTraits.KeepDecimalPoint)} onChange={handleKeepDecimalPointChange} />

          <span className={"uicore-label"}>{keepSingleZeroLabel.current}</span>
          <Checkbox data-testid="keep-single-zero" checked={isFormatTraitSet(FormatTraits.KeepSingleZero)} onChange={handleKeepSingleZeroChange} />

          <span className={"uicore-label"}>{zeroEmptyLabel.current}</span>
          <Checkbox data-testid="zero-empty" checked={isFormatTraitSet(FormatTraits.ZeroEmpty)} onChange={handleZeroEmptyChange} />

          <span className={classnames("uicore-label", formatType !== FormatType.Fractional && "uicore-disabled")}>{fractionDashLabel.current}</span>
          <Checkbox data-testid="fraction-dash" checked={isFormatTraitSet(FormatTraits.FractionDash)} onChange={handleUseFractionDashChange} disabled={formatType !== FormatType.Fractional} />

          <span className={classnames("uicore-label", formatType !== FormatType.Scientific && "uicore-disabled")}>{scientificTypeLabel.current}</span>
          <ScientificTypeSelector data-testid="scientific-type-selector" type={(formatProps.scientificType && formatProps.scientificType.length > 0) ? Format.parseScientificType(formatProps.scientificType, "custom") : ScientificType.Normalized}
            disabled={formatType !== FormatType.Scientific} onChange={handleScientificTypeChange} />

          {props.children}

          { // eslint-disable-next-line jsx-a11y/anchor-is-valid
            enableMinimumProperties && showOptions && <a onClick={handleToggleButtonClick} onKeyUp={handleKeyUpOnLink}
              className={"components-quantityFormat-more-less"} role="link" data-testid="quantityFormat-less" tabIndex={0}>{lessLabel.current}</a>}
        </>
      }
    </>
  );
}
