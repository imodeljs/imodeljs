/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BentleyError, BentleyStatus } from "@bentley/bentleyjs-core";
import { UnitExtraData } from "@bentley/imodeljs-quantity";
import { SchemaContext, SchemaItem, SchemaItemKey, SchemaKey, Unit } from "../ecschema-metadata";
import { SchemaItemType } from "../ECObjects";

/**
 * Class used to find Units in SchemaContext by attributes such as Phenomenon and DisplayLabel
 * @alpha
 */
export class UnitProvider {
  /**
   *
   * @param _context SchemaContext that contains the Units from which querying takes place
   * @param _unitExtraData Additional data like alternate display label not found in Units Schema to match with Units; Default to empty array
   */
  constructor(private readonly _context: SchemaContext, private _unitExtraData: UnitExtraData[] = []) {}

  /**
   * Find unit in a schema that has unitName
   * @param unitName Full name of unit
   * @returns Unit whose full name matches unitName
   */
  public async findUnitByName(unitName: string): Promise<Unit> {
    // Check if schema exists and unit exists in schema
    const [schemaName, schemaItemName] = SchemaItem.parseFullName(unitName);
    const schemaKey = new SchemaKey(schemaName);
    const schema = await this._context.getSchema(schemaKey);

    if (!schema) {
      throw new BentleyError(BentleyStatus.ERROR, "Cannot find schema for unit", () => {
        return { schema: schemaName, unit: unitName };
      });
    }

    const itemKey = new SchemaItemKey(schemaItemName, schema.schemaKey);
    const item = await this._context.getSchemaItem(itemKey);
    if (!item)
      throw new BentleyError(BentleyStatus.ERROR, "Cannot find schema item/unit", () => {
        return { item: schemaItemName, schema: schemaName };
      });

    if (item.schemaItemType === SchemaItemType.Unit)
      return item as Unit;

    throw new BentleyError(BentleyStatus.ERROR, "Item is not a unit", () => {
      return { itemType: item.key.fullName };
    });
  }

  /**
   * Find all units in context that belongs to given phenomenon
   * @param phenomenon Full name of phenomenon
   * @returns Array of units whose full name matches phenomenon param
   */
  public async findUnitsByPhenomenon(phenomenon: string): Promise<Array<Unit>> {
    // Check if schema exists and phenomenon exists in schema
    const [schemaName, schemaItemName] = SchemaItem.parseFullName(phenomenon);
    const schemaKey = new SchemaKey(schemaName);
    const schema = await this._context.getSchema(schemaKey);

    if (!schema) {
      throw new BentleyError(BentleyStatus.ERROR, "Cannot find schema for phenomenon", () => {
        return { phenomenon, schema: schemaName };
      });
    }

    const itemKey = new SchemaItemKey(schemaItemName, schema.schemaKey);
    const phenom = await this._context.getSchemaItem(itemKey);
    if (!phenom)
      throw new BentleyError(BentleyStatus.ERROR, "Cannot find schema item/phenomenon", () => {
        return { item: schemaItemName, schema: schemaName };
      });

    if (phenom.schemaItemType !== SchemaItemType.Phenomenon)
      throw new BentleyError(BentleyStatus.ERROR, "Item is not a phenomenon", () => {
        return { itemType: phenom.key.fullName };
      });

    // Find units' full name that match given phenomenon param
    const filteredUnits: Array<Unit> = [];
    const schemaItems = this._context.getSchemaItems();
    let { value, done } = schemaItems.next();
    while (!done) {
      if (Unit.isUnit(value)) {
        const foundPhenomenon = await value.phenomenon;
        if (foundPhenomenon && foundPhenomenon.key.matchesFullName(phenomenon)) {
          filteredUnits.push(value);
        }
      }
      ({ value, done } = schemaItems.next());
    }

    return filteredUnits;
  }

  /**
   * Find alternate display labels associated with unitName, if any
   * @param unitName Full name of Unit
   */
  public getAlternateDisplayLabels(unitName: string): Array<string> {
    let alternateLabels: Array<string> = [];
    for (const entry of this._unitExtraData) {
      if (entry.name.toLowerCase() === unitName.toLowerCase()) {
        alternateLabels = entry.altDisplayLabels;
      }
    }

    return alternateLabels;
  }

  /**
   * Finds Unit by unitLabel, which could be display label in schema or alternate display label defined in this._unitExtraData.
   * If there are duplicates of the same display label in context or same alternate display labels, specify schemaName,
   * phenomenon, or unitSystem to get a specific unit.
   *
   * @param unitLabel Display label or alternate display label to query unit by
   * @param schemaName Ensure Unit with unitLabel belongs to Schema with schemaName
   * @param phenomenon Full name of phenomenon that Unit belongs to
   * @param unitSystem Full name of unitSystem that Unit belongs to
   */
  public async findUnit(unitLabel: string, schemaName?: string, phenomenon?: string, unitSystem?: string): Promise<Unit> {
    const findLabel = unitLabel.toLowerCase();
    const findSchema = schemaName ? schemaName.toLowerCase() : undefined;
    const findPhenomenon = phenomenon ? phenomenon.toLowerCase() : undefined;
    const findUnitSystem = unitSystem ? unitSystem.toLowerCase() : undefined;
    let foundUnit: Unit | undefined;

    try {
      try {
        foundUnit = await this.findUnitByDisplayLabel(findLabel, findSchema, findPhenomenon, findUnitSystem);
      } catch (err) {
        // If there is no Unit with display label that matches label, then check for alternate display labels that may match
        foundUnit = await this.findUnitByAltDisplayLabel(findLabel, findSchema, findPhenomenon, findUnitSystem);
      }
    } catch (err) {
      throw new BentleyError(BentleyStatus.ERROR, "Cannot find unit with label", () => {
        return { unitLabel };
      });
    }

    return foundUnit;
  }

  /**
   * Finds Unit by displayLabel and that it belongs to schemaName, phenomenon, and unitSystem if defined
   * @internal
   */
  private async findUnitByDisplayLabel(displayLabel: string, schemaName?: string, phenomenon?: string, unitSystem?: string): Promise<Unit> {
    const schemaItems = this._context.getSchemaItems();
    let { value, done } = schemaItems.next();
    while (!done) {
      if (Unit.isUnit(value) && value.label?.toLowerCase() === displayLabel) {
        const currPhenomenon = await value.phenomenon;
        const currUnitSystem = await value.unitSystem;
        if (!schemaName || value.schema.name.toLowerCase() === schemaName)
          if (!phenomenon || (currPhenomenon && currPhenomenon.key.matchesFullName(phenomenon)))
            if (!unitSystem || (currUnitSystem && currUnitSystem.key.matchesFullName(unitSystem)))
              return value;
      }
      ({ value, done } = schemaItems.next());
    }

    throw new BentleyError(BentleyStatus.ERROR, "Cannot find unit with display label", () => {
      return { displayLabel };
    });
  }

  /**
   * Finds Unit by altDisplayLabel and that it belongs to schemaName, phenomenon, and unitSystem if defined
   * @internal
   */
  private async findUnitByAltDisplayLabel(altDisplayLabel: string, schemaName?: string, phenomenon?: string, unitSystem?: string): Promise<Unit> {
    for (const entry of this._unitExtraData) {
      if (entry.altDisplayLabels && entry.altDisplayLabels.length > 0) {
        if (entry.altDisplayLabels.findIndex((ref: string) => ref.toLowerCase() === altDisplayLabel) !== -1) {
          // Found altDisplayLabel that matches label to find
          const unit = await this.findUnitByName(entry.name);
          const foundPhenomenon = await unit.phenomenon;
          const foundUnitSystem = await unit.unitSystem;
          if (!schemaName || unit.schema.name.toLowerCase() === schemaName)
            if (!phenomenon || (foundPhenomenon && foundPhenomenon.key.matchesFullName(phenomenon)))
              if (!unitSystem || (foundUnitSystem && foundUnitSystem.key.matchesFullName(unitSystem)))
                return unit;
        }
      }
    }

    throw new BentleyError(BentleyStatus.ERROR, "Cannot find unit with alternate display label", () => {
      return { altDisplayLabel };
    });
  }
}
