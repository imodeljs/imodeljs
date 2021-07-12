/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormat
 */

import * as React from "react";
import {
  CustomFormatPropEditorSpec, getQuantityTypeKey, IModelApp, isCheckboxFormatPropEditorSpec, isCustomQuantityTypeDefinition,
  isTextInputFormatPropEditorSpec, isTextSelectFormatPropEditorSpec, QuantityTypeArg,
} from "@bentley/imodeljs-frontend";
import { FormatProps, UnitProps, UnitsProvider } from "@bentley/imodeljs-quantity";
import { CommonProps, Select } from "@bentley/ui-core";
import { Checkbox, Input } from "@itwin/itwinui-react";
import { FormatPanel } from "./FormatPanel";
import { DeepCompare } from "@bentley/geometry-core";

function createTextInputFormatPropEditor(key: string, label: string, inProps: FormatProps,
  getString: (props: FormatProps) => string, setString: (props: FormatProps, value: string) => FormatProps, fireFormatChange: (newProps: FormatProps) => void) {
  const value = getString(inProps);
  return (
    <React.Fragment key={`${key}`}>
      <span key={`${key}-label`} className={"uicore-label"}>{label}</span>
      <Input data-testid={`${key}-editor`} key={`${key}-editor`}
        value={value}
        onChange={(e) => {
          const newProps = setString(inProps, e.currentTarget.value);
          fireFormatChange(newProps);
        }}
      />
    </React.Fragment>
  );
}

function createSelectFormatPropEditor(key: string, label: string, options: { label: string, value: string }[], inProps: FormatProps,
  getString: (props: FormatProps) => string, setString: (props: FormatProps, value: string) => FormatProps, fireFormatChange: (newProps: FormatProps) => void) {
  const value = getString(inProps);
  return (
    <React.Fragment key={`${key}`}>
      <span key={`${key}-label`} className={"uicore-label"}>{label}</span>
      {/* NEEDSWORK - unable to migrate this Select to iTwinUI because no menu items were found */}
      {/* eslint-disable-next-line deprecation/deprecation */}
      <Select data-testid={`${key}-editor`} key={`${key}-editor`}
        value={value}
        options={options}
        onChange={(e) => {
          const newProps = setString(inProps, e.currentTarget.value);
          fireFormatChange(newProps);
        }}
      />
    </React.Fragment>
  );
}

function createCheckboxFormatPropEditor(key: string, label: string, inProps: FormatProps,
  getBool: (props: FormatProps) => boolean, setBool: (props: FormatProps, isChecked: boolean) => FormatProps, fireFormatChange: (newProps: FormatProps) => void) {
  const isChecked = getBool(inProps);
  return (
    <React.Fragment key={`${key}`}>
      <span key={`${key}-label`} className={"uicore-label"}>{label}</span>
      <Checkbox data-testid={`${key}-editor`} key={`${key}-editor`}
        checked={isChecked}
        onChange={(e) => {
          const newProps = setBool(inProps, e.target.checked);
          fireFormatChange(newProps);
        }} />
    </React.Fragment>
  );
}

function formatAreEqual(obj1: FormatProps, obj2: FormatProps) {
  const compare = new DeepCompare();
  return compare.compare(obj1, obj2);
}

/** Properties of [[QuantityFormatPanel]] component.
 * @alpha
 */
export interface QuantityFormatPanelProps extends CommonProps {
  quantityType: QuantityTypeArg;
  onFormatChange?: (format: FormatProps) => void;
  /** props below are to be passed on to FormatPanel */
  showSample?: boolean;
  initialMagnitude?: number;
  enableMinimumProperties?: boolean;
}

/** Component to set properties that control Quantity Formatting.
 * @alpha
 */
export function QuantityFormatPanel(props: QuantityFormatPanelProps) {
  const { quantityType, onFormatChange, ...otherProps } = props;
  const [formatProps, setFormatProps] = React.useState<FormatProps>();
  const initialFormatProps = React.useRef<FormatProps>();

  const [persistenceUnit, setPersistenceUnit] = React.useState(() => {
    const quantityTypeKey = getQuantityTypeKey(quantityType);
    const quantityTypeDefinition = IModelApp.quantityFormatter.quantityTypesRegistry.get(quantityTypeKey);
    // istanbul ignore else
    if (quantityTypeDefinition)
      return quantityTypeDefinition.persistenceUnit;
    else
      throw Error(`Unable to locate a quantity type with type ${quantityType}`);
  });

  React.useEffect(() => {
    const newFormatProps = IModelApp.quantityFormatter.getFormatPropsByQuantityType(quantityType);
    // istanbul ignore else
    if (!initialFormatProps.current)
      initialFormatProps.current = newFormatProps;
    setFormatProps(newFormatProps);
  }, [quantityType]); // no dependencies defined as we want this to run on every render

  // handle case where quantityType does not change but the formatProps for that quantity type has (ie after a Set or Clear)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const newFormatProps = IModelApp.quantityFormatter.getFormatPropsByQuantityType(quantityType);
    // istanbul ignore else
    if (initialFormatProps.current && newFormatProps) {
      if (!formatAreEqual(newFormatProps, initialFormatProps.current)) {
        initialFormatProps.current = newFormatProps;
        setFormatProps(newFormatProps);
      }
    }
  }); // no dependencies defined as we want this to run on every render

  React.useEffect(() => {
    const quantityTypeKey = getQuantityTypeKey(quantityType);
    const quantityTypeDefinition = IModelApp.quantityFormatter.quantityTypesRegistry.get(quantityTypeKey);
    // istanbul ignore else
    if (quantityTypeDefinition)
      setPersistenceUnit(quantityTypeDefinition.persistenceUnit);
  }, [quantityType]);

  const handleOnFormatChanged = React.useCallback(async (newProps: FormatProps) => {
    setFormatProps(newProps);
    onFormatChange && onFormatChange(newProps);
  }, [onFormatChange]);

  const createCustomPropEditors = React.useCallback((specs: CustomFormatPropEditorSpec[], inProps: FormatProps, fireFormatChange: (newProps: FormatProps) => void) => {
    return specs.map((spec, index) => {
      if (isCheckboxFormatPropEditorSpec(spec))
        return createCheckboxFormatPropEditor(`${spec.editorType}-${index}`, spec.label, inProps, spec.getBool, spec.setBool, fireFormatChange);
      if (isTextSelectFormatPropEditorSpec(spec))
        return createSelectFormatPropEditor(`${spec.editorType}-${index}`, spec.label, spec.selectOptions, inProps, spec.getString, spec.setString, fireFormatChange);
      /* istanbul ignore else */
      if (isTextInputFormatPropEditorSpec(spec))
        return createTextInputFormatPropEditor(`${spec.editorType}-${index}`, spec.label, inProps, spec.getString, spec.setString, fireFormatChange);
      /* istanbul ignore next */
      return <div key={index} />;
    });
  }, []);

  const providePrimaryChildren = React.useCallback(
    (inProps: FormatProps, fireFormatChange: (newProps: FormatProps) => void) => {
      const quantityTypeKey = getQuantityTypeKey(quantityType);
      const quantityTypeDefinition = IModelApp.quantityFormatter.quantityTypesRegistry.get(quantityTypeKey);
      if (quantityTypeDefinition && isCustomQuantityTypeDefinition(quantityTypeDefinition) &&
        quantityTypeDefinition.isCompatibleFormatProps(inProps)) {
        // istanbul ignore else
        if (quantityTypeDefinition.primaryPropEditorSpecs)
          return createCustomPropEditors(quantityTypeDefinition.primaryPropEditorSpecs, inProps, fireFormatChange);
      }
      return null;
    }, [createCustomPropEditors, quantityType]);

  const provideSecondaryChildren = React.useCallback(
    (inProps: FormatProps, fireFormatChange: (newProps: FormatProps) => void) => {
      const quantityTypeKey = getQuantityTypeKey(quantityType);
      const quantityTypeDefinition = IModelApp.quantityFormatter.quantityTypesRegistry.get(quantityTypeKey);
      if (quantityTypeDefinition && isCustomQuantityTypeDefinition(quantityTypeDefinition) &&
        quantityTypeDefinition.isCompatibleFormatProps(inProps)) {
        // istanbul ignore else
        if (quantityTypeDefinition.secondaryPropEditorSpecs)
          return createCustomPropEditors(quantityTypeDefinition.secondaryPropEditorSpecs, inProps, fireFormatChange);
      }
      return null;
    }, [createCustomPropEditors, quantityType]);

  const provideFormatSpec = React.useCallback(
    async (inProps: FormatProps, _persistenceUnit: UnitProps, _unitsProvider: UnitsProvider) => {
      return IModelApp.quantityFormatter.generateFormatterSpecByType(quantityType, inProps);
    }, [quantityType]);

  return (
    <div className="components-quantityFormat-quantityPanel">
      {persistenceUnit && formatProps &&
        <FormatPanel onFormatChange={handleOnFormatChanged} {...otherProps}
          initialFormat={formatProps}
          unitsProvider={IModelApp.quantityFormatter.unitsProvider}
          persistenceUnit={persistenceUnit}
          providePrimaryChildren={providePrimaryChildren}
          provideSecondaryChildren={provideSecondaryChildren}
          provideFormatSpec={provideFormatSpec}
        />}
    </div>
  );
}
