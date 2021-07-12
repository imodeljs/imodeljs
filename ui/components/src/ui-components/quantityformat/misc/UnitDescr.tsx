/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormat
 */

import * as React from "react";
import { UnitProps, UnitsProvider } from "@bentley/imodeljs-quantity";
import { CommonProps } from "@bentley/ui-core";
import { Input, Select, SelectOption } from "@itwin/itwinui-react";

/** Properties of [[UnitDescr]] component.
 * @internal
 */
export interface UnitDescrProps extends CommonProps {
  name: string;
  parentUnitName?: string;
  label: string;
  index: number;
  unitsProvider: UnitsProvider;
  readonly?: boolean;
  onUnitChange: (value: string, index: number) => void;
  onLabelChange: (value: string, index: number) => void;
}

async function getUnitConversionData(possibleUnits: UnitProps[], toUnit: UnitProps, unitsProvider: UnitsProvider) {
  const unitConversionEntries = possibleUnits.map(async (unit) => {
    const conversion = await unitsProvider.getConversion(unit, toUnit);
    return { conversion, unitProps: unit };
  });
  return unitConversionEntries;
}

async function getPossibleUnits(parentUnit: UnitProps, unitsProvider: UnitsProvider, ensureCompatibleComposite: boolean) {
  const phenomenon = parentUnit.phenomenon;
  const possibleUnits = await unitsProvider.getUnitsByFamily(phenomenon);
  if (!ensureCompatibleComposite)
    return possibleUnits;

  const conversionPromises = await getUnitConversionData(possibleUnits, parentUnit, unitsProvider);
  const conversionEntries = await Promise.all(conversionPromises);
  // sort the entries so the best potential sub unit will be the first one in the array
  return conversionEntries.filter((entry) => ((entry.unitProps.system === parentUnit.system) && (entry.conversion.factor < 1)))
    .sort((a, b) => b.conversion.factor - a.conversion.factor)
    .map((value) => value.unitProps);
}

function getUnitName(fullUnitName: string) {
  const nameParts = fullUnitName.split(/[.:]/);
  // istanbul ignore else
  if (nameParts.length > 0)
    return nameParts[nameParts.length - 1];
  // istanbul ignore next
  throw Error("Bad unit name encountered");
}

/** Component use to display dropdown list of possible units.
 * @internal
 */
export function UnitDescr(props: UnitDescrProps) {
  const { name, label, parentUnitName, index, onUnitChange, onLabelChange, readonly, unitsProvider } = props;
  const [unitOptions, setUnitOptions] = React.useState<SelectOption<string>[]>([{ value: name, label: getUnitName(name) }]);
  const [currentUnit, setCurrentUnit] = React.useState({ name, label });
  const isMounted = React.useRef(false);

  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  });

  React.useEffect(() => {
    async function fetchAllowableUnitSelections() {
      const currentUnitProps = await unitsProvider.findUnitByName(name);
      const parentUnit = await unitsProvider.findUnitByName(parentUnitName ? parentUnitName : name);
      // istanbul ignore else
      if (parentUnit && currentUnitProps) {
        let potentialSubUnit: UnitProps | undefined;
        const potentialUnits = await getPossibleUnits(parentUnit, unitsProvider, index !== 0);
        // istanbul ignore else
        if (index < 3) {
          const potentialSubUnits = await getPossibleUnits(currentUnitProps, unitsProvider, true);
          if (potentialSubUnits.length)
            potentialSubUnit = potentialSubUnits[0];
        }

        const options = (potentialUnits.length > 0) ?
          potentialUnits.map((unitValue) => {
            return { value: `${unitValue.name}:${unitValue.label}`, label: getUnitName(unitValue.name) };
          }).sort((a, b) => a.label.localeCompare(b.label))
          : /* istanbul ignore next */
          [{ value: `${currentUnitProps.name}:${currentUnitProps.label}`, label: getUnitName(name) }];

        if (potentialSubUnit) {
          // construct an entry that will provide the name and label of the unit to add
          options.push({ value: `ADDSUBUNIT:${potentialSubUnit.name}:${potentialSubUnit.label}`, label: "Add sub-unit" });  // NEEDSWORK - i18n
        }

        if (index !== 0)
          options.push({ value: "REMOVEUNIT", label: "Remove" }); // NEEDSWORK - i18n

        // istanbul ignore else
        if (isMounted.current) {
          setUnitOptions(options);
          setCurrentUnit(currentUnitProps);
        }
      }
    }
    fetchAllowableUnitSelections(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }, [index, label, name, parentUnitName, unitsProvider]);

  const handleOnUnitChange = React.useCallback((newValue: string) => {
    onUnitChange && onUnitChange(newValue, index);
  }, [index, onUnitChange]);

  const handleOnLabelChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    onLabelChange && onLabelChange(e.target.value, index);
  }, [index, onLabelChange]);

  return (
    <>
      <Select options={unitOptions} data-testid={`unit-${currentUnit.name}`} value={`${currentUnit.name}:${currentUnit.label}`}
        onChange={handleOnUnitChange} disabled={readonly} />
      <Input data-testid={`unit-label-${currentUnit.name}`} value={label} onChange={handleOnLabelChange} />
    </>
  );
}
