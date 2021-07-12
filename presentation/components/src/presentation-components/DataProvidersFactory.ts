/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { Omit, PrimitivePropertyValue, RulesetsFactory } from "@bentley/presentation-common";
import { PropertyRecord } from "@bentley/ui-abstract";
import { TypeConverterManager } from "@bentley/ui-components";
import { findField } from "./common/Utils";
import { IPresentationPropertyDataProvider } from "./propertygrid/DataProvider";
import { IPresentationTableDataProvider, PresentationTableDataProvider, PresentationTableDataProviderProps } from "./table/DataProvider";

/**
 * Data structure holding initialization properties for [[DataProvidersFactory]]
 * @public
 */
export interface DataProvidersFactoryProps {
  /** Rulesets' factory to use when creating data providers */
  rulesetsFactory?: RulesetsFactory;
}

/**
 * A factory class than can be used to create presentation data providers targeted towards
 * specific use cases.
 *
 * @public
 */
export class DataProvidersFactory {
  private _rulesetsFactory: RulesetsFactory;

  /** Constructor. */
  public constructor(props?: DataProvidersFactoryProps) {
    this._rulesetsFactory = props && props.rulesetsFactory ? props.rulesetsFactory : new RulesetsFactory();
  }

  private async computeDisplayValue(typename: string, value: PrimitivePropertyValue, displayValue: string): Promise<string> {
    if (typename === "navigation") {
      // note: type converters can't convert raw navigation value (InstanceKey) to
      // display value - we have to use what's stored in the property record (supplied
      // display value)
      return displayValue;
    }
    if (typename === "double") {
      // note: type converters can't convert raw double value to
      // display value since unit system is not implemented yet
      return displayValue;
    }
    return TypeConverterManager.getConverter(typename).convertToString(value);
  }

  /**
   * Create a table data provider which returns instances of the same class and
   * having the same property value as the provided property record.
   * @param propertiesProvider A properties provider that created the `record`
   * @param record A record whose similar instances should be found
   * @param props Configuration properties for the created provider
   */
  public async createSimilarInstancesTableDataProvider(propertiesProvider: IPresentationPropertyDataProvider, record: PropertyRecord,
    props: Omit<PresentationTableDataProviderProps, "imodel" | "ruleset">,
  ): Promise<IPresentationTableDataProvider & { description: string }> {
    const content = await propertiesProvider.getContent();
    if (!content || content.contentSet.length === 0)
      throw new Error("Properties provider has no content. Where did record come from?");

    const field = findField(content.descriptor, record.property.name);
    if (!field)
      throw new Error("Properties provider doesn't have a property with provided record. Where did record come from?");

    const result = await this._rulesetsFactory.createSimilarInstancesRuleset(field, content.contentSet[0], this.computeDisplayValue);
    return new TableDataProviderWithDescription({
      ...props,
      imodel: propertiesProvider.imodel,
      ruleset: result.ruleset,
      description: result.description,
    });
  }
}

class TableDataProviderWithDescription extends PresentationTableDataProvider {
  public readonly description: string;
  public constructor(props: (PresentationTableDataProviderProps & { description: string })) {
    const { description, ...baseProps } = props;
    super(baseProps);
    this.description = description;
  }
  protected override shouldRequestContentForEmptyKeyset() { return true; }
}
