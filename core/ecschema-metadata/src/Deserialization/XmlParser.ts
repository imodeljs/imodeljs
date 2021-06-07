/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "@bentley/bentleyjs-core";
import { parsePrimitiveType, PrimitiveType, primitiveTypeToString, StrengthDirection, strengthDirectionToString } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { ECClass, StructClass } from "../Metadata/Class";
import { CustomAttribute } from "../Metadata/CustomAttribute";
import { CustomAttributeClass } from "../Metadata/CustomAttributeClass";
import { Enumeration } from "../Metadata/Enumeration";
import { PrimitiveProperty, Property, StructArrayProperty } from "../Metadata/Property";
import { ECName } from "../ECName";
import { AbstractParser, CAProviderTuple } from "./AbstractParser";
import {
  ClassProps, ConstantProps, CustomAttributeClassProps, EntityClassProps, EnumerationProps, EnumeratorProps, FormatProps, InvertedUnitProps,
  KindOfQuantityProps, MixinProps, NavigationPropertyProps, PhenomenonProps, PrimitiveArrayPropertyProps, PrimitiveOrEnumPropertyBaseProps,
  PrimitivePropertyProps, PropertyCategoryProps, PropertyProps, RelationshipClassProps, RelationshipConstraintProps, SchemaItemProps, SchemaProps,
  SchemaReferenceProps, StructArrayPropertyProps, StructClassProps, StructPropertyProps, UnitProps, UnitSystemProps,
} from "./JsonProps";

const NON_ITEM_SCHEMA_ELEMENTS = ["ECSchemaReference", "ECCustomAttributes"];
const ECXML_URI = "http://www\\.bentley\\.com/schemas/Bentley\\.ECXML";

type PrimitiveArray = PrimitiveValue[];
type PrimitiveValue = string | number | boolean | Date;

interface ECXmlVersion {
  readVersion: number;
  writeVersion: number;
}

/** @internal */
export class XmlParser extends AbstractParser<Element> {
  private _rawSchema: Document;
  private _schemaName?: string;
  private _schemaReferenceNames: Map<string, string>;
  private _schemaAlias: string;
  private _schemaVersion?: string;
  private _xmlNamespace?: string;
  private _ecXmlVersion?: ECXmlVersion;
  private _currentItemFullName?: string;
  private _schemaItems: Map<string, [string, Element]>;
  private _mapIsPopulated: boolean;

  constructor(rawSchema: Readonly<Document>) {
    super();

    this._rawSchema = rawSchema;
    const schemaInfo = rawSchema.documentElement;

    const schemaName = schemaInfo.getAttribute("schemaName");
    if (schemaName) this._schemaName = schemaName;

    this._schemaAlias = "";
    const schemaAlias = schemaInfo.getAttribute("alias");
    if (schemaAlias) this._schemaAlias = schemaAlias;

    this._schemaReferenceNames = new Map<string, string>();

    const schemaVersion = schemaInfo.getAttribute("version");
    if (schemaVersion) this._schemaVersion = schemaVersion;

    const xmlNamespace = schemaInfo.getAttribute("xmlns");
    if (xmlNamespace) {
      this._xmlNamespace = xmlNamespace;
      this._ecXmlVersion = this.parseXmlNamespace(this._xmlNamespace);
    }

    this._schemaItems = new Map<string, [string, Element]>();
    this._mapIsPopulated = false;
  }

  public parseSchema(): SchemaProps {
    const schemaMetadata = this._rawSchema.documentElement;
    if ("ECSchema" !== schemaMetadata.nodeName)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, "An ECSchema is missing the required metadata.");

    const schemaDefDuplicates = this.getElementChildrenByTagName(schemaMetadata, "ECSchema");
    if (schemaDefDuplicates.length > 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, "An ECSchema has more than one ECSchema definition. Only one is allowed.");

    if (this._schemaName === undefined)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `An ECSchema is missing a required 'schemaName' attribute`);

    if (this._schemaVersion === undefined)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ECSchema ${this._schemaName} is missing a required 'version' attribute`);

    if (this._xmlNamespace === undefined)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ECSchema ${this._schemaName} is missing a required 'xmlns' attribute`);

    if (this._ecXmlVersion === undefined)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ECSchema ${this._schemaName} has an invalid 'xmlns' attribute`);

    const alias = this.getRequiredAttribute(schemaMetadata, "alias",
      `The ECSchema ${this._schemaName} is missing a required 'alias' attribute`);
    const description = this.getOptionalAttribute(schemaMetadata, "description");
    const displayLabel = this.getOptionalAttribute(schemaMetadata, "displayLabel");

    const schemaProps = {
      name: this._schemaName,
      $schema: this._xmlNamespace,
      version: this._schemaVersion,
      alias,
      label: displayLabel,
      description,
    };

    return schemaProps;
  }

  public *getReferences(): Iterable<SchemaReferenceProps> {
    const schemaReferences = this.getElementChildrenByTagName(this._rawSchema.documentElement, "ECSchemaReference");
    for (const ref of schemaReferences) {
      yield this.getSchemaReference(ref);
    }
  }

  public *getItems(): Iterable<[string, string, Element]> {
    if (!this._mapIsPopulated) {
      const schemaItems = this.getSchemaChildren();
      for (const item of schemaItems) {
        let rawItemType = item.nodeName;
        if (NON_ITEM_SCHEMA_ELEMENTS.includes(rawItemType)) continue;

        // Differentiate a Mixin from an EntityClass
        const customAttributesResult = this.getElementChildrenByTagName(item, "ECCustomAttributes");
        if (customAttributesResult.length > 0) {
          const customAttributes = customAttributesResult[0];
          const isMixinResult = this.getElementChildrenByTagName(customAttributes, "IsMixin");
          if (isMixinResult.length > 0)
            rawItemType = "Mixin";
        }

        const itemType = this.getSchemaItemType(rawItemType);
        if (itemType === undefined)
          throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `A SchemaItem in ${this._schemaName} has an invalid type. '${rawItemType}' is not a valid SchemaItem type.`);

        const itemName = this.getRequiredAttribute(item, "typeName", `A SchemaItem in ${this._schemaName} is missing the required 'typeName' attribute.`);

        if (!ECName.validate(itemName))
          throw new ECObjectsError(ECObjectsStatus.InvalidECName, `A SchemaItem in ${this._schemaName} has an invalid 'typeName' attribute. '${itemName}' is not a valid ECName.`);

        this._currentItemFullName = `${this._schemaName}.${itemName}`;
        this._schemaItems.set(itemName, [itemType, item]);
        yield [itemName, itemType, item];
      }
      this._mapIsPopulated = true;
    } else {
      for (const [itemName, [itemType, item]] of this._schemaItems) {
        this._currentItemFullName = `${this._schemaName}.${itemName}`;
        yield [itemName, itemType, item];
      }
    }
  }

  public findItem(itemName: string): [string, string, Element] | undefined {
    if (!this._mapIsPopulated) {
      for (const item of this.getItems()) {
        if (item[0] === itemName) {
          this._currentItemFullName = `${this._schemaName}.${itemName}`;
          return item;
        }
      }
    } else {
      const values = this._schemaItems.get(itemName);
      if (undefined !== values) {
        const [itemType, item] = values;
        this._currentItemFullName = `${this._schemaName}.${itemName}`;
        return [itemName, itemType, item];
      }
    }

    return undefined;
  }

  public parseEntityClass(xmlElement: Element): EntityClassProps {
    const classProps = this.getClassProps(xmlElement);
    const baseClasses = this.getElementChildrenByTagName(xmlElement, "BaseClass");
    let mixinElements: Element[];
    const mixins = new Array<string>();

    // if it has just one BaseClass we assume it is a 'true' base class not a mixin
    if (baseClasses.length > 1) {
      mixinElements = baseClasses.slice(1);
      for (const mixin of mixinElements) {
        if (mixin.textContent) {
          const typeName = this.getQualifiedTypeName(mixin.textContent);
          mixins.push(typeName);
        }
      }
    }

    const entityClassProps = {
      ...classProps,
      mixins,
    };

    return entityClassProps;
  }

  public parseMixin(xmlElement: Element): MixinProps {
    const classProps = this.getClassProps(xmlElement);

    const baseClasses = this.getElementChildrenByTagName(xmlElement, "BaseClass");

    // Mixins can only have one base class
    if (baseClasses.length > 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Mixin ${this._currentItemFullName} has more than one base class which is not allowed.`);

    const customAttributesResult = this.getElementChildrenByTagName(xmlElement, "ECCustomAttributes");

    if (customAttributesResult.length < 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Mixin ${this._currentItemFullName} is missing the required 'IsMixin' tag.`);

    const customAttributes = customAttributesResult[0];
    const isMixinResult = this.getElementChildrenByTagName(customAttributes, "IsMixin");
    if (isMixinResult.length < 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Mixin ${this._currentItemFullName} is missing the required 'IsMixin' tag.`);

    const mixinAttributes = isMixinResult[0];
    const appliesToResult = this.getElementChildrenByTagName(mixinAttributes, "AppliesToEntityClass");

    if (appliesToResult.length < 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Mixin ${this._currentItemFullName} is missing the required 'AppliesToEntityClass' tag.`);

    const appliesToElement = appliesToResult[0];
    let appliesTo = appliesToElement.textContent;
    if (appliesTo === null || appliesTo.length === 0)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Mixin ${this._currentItemFullName} is missing the required 'AppliesToEntityClass' tag.`);

    appliesTo = this.getQualifiedTypeName(appliesTo);

    const mixinProps = {
      ...classProps,
      appliesTo,
    };

    return mixinProps;
  }

  public parseStructClass(xmlElement: Element): StructClassProps {
    return this.getClassProps(xmlElement);
  }

  public parseCustomAttributeClass(xmlElement: Element): CustomAttributeClassProps {
    const classProps = this.getClassProps(xmlElement);
    const appliesTo = this.getRequiredAttribute(xmlElement, "appliesTo",
      `The CustomAttributeClass ${this._currentItemFullName} is missing the required 'appliesTo' attribute.`);

    const customAttributeClassProps = {
      ...classProps,
      appliesTo,
    };

    return customAttributeClassProps;
  }

  public parseRelationshipClass(xmlElement: Element): RelationshipClassProps {
    const classProps = this.getClassProps(xmlElement);
    const strength = this.getRequiredAttribute(xmlElement, "strength",
      `The RelationshipClass ${this._currentItemFullName} is missing the required 'strength' attribute.`);
    let strengthDirection = this.getOptionalAttribute(xmlElement, "strengthDirection");
    if (!strengthDirection)
      strengthDirection = strengthDirectionToString(StrengthDirection.Forward);

    const sourceResult = this.getElementChildrenByTagName(xmlElement, "Source");
    if (sourceResult.length !== 1) {
      if (sourceResult.length === 0)
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The RelationshipClass ${this._currentItemFullName} is missing the required Source constraint tag.`);
      else
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The RelationshipClass ${this._currentItemFullName} has more than one Source constraint tag. Only one is allowed.`);
    }
    const source = this.getRelationshipConstraintProps(sourceResult[0], true);

    const targetResult = this.getElementChildrenByTagName(xmlElement, "Target");
    if (targetResult.length !== 1) {
      if (targetResult.length === 0)
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The RelationshipClass ${this._currentItemFullName} is missing the required Target constraint tag.`);
      else
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The RelationshipClass ${this._currentItemFullName} has more than one Target constraint tag. Only one is allowed.`);
    }
    const target = this.getRelationshipConstraintProps(targetResult[0], false);

    return {
      ...classProps,
      strength,
      strengthDirection,
      source,
      target,
    };
  }

  public parseEnumeration(xmlElement: Element): EnumerationProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    const enumType = this.getRequiredAttribute(xmlElement, "backingTypeName",
      `The Enumeration ${this._currentItemFullName} is missing the required 'backingTypeName' attribute.`);

    // TODO: This shouldn't be verified here.  It's for the deserialize method to handle.  The only reason it's currently done here so that the xml
    // value can be put in the correct type, number or string.
    let tempBackingType: PrimitiveType;
    if (/int/i.test(enumType))
      tempBackingType = PrimitiveType.Integer;
    else if (/string/i.test(enumType))
      tempBackingType = PrimitiveType.String;
    else
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an invalid 'backingTypeName' attribute. It should be either "int" or "string".`);

    let isStrictString: string | undefined = this.getOptionalAttribute(xmlElement, "isStrict");
    if (isStrictString === undefined)
      isStrictString = "true";

    const isStrict = this.parseBoolean(isStrictString,
      `The Enumeration ${this._currentItemFullName} has an invalid 'isStrict' attribute. It should either be "true" or "false".`);

    const enumeratorElements = this.getElementChildrenByTagName(xmlElement, "ECEnumerator");
    const enumerators = new Array<EnumeratorProps>();

    for (const element of enumeratorElements) {
      const name = this.getRequiredAttribute(element, "name",
        `The Enumeration ${this._currentItemFullName} has an enumerator that is missing the required attribute 'name'.`);

      const valueString = this.getRequiredAttribute(element, "value",
        `The Enumeration ${this._currentItemFullName} has an enumerator that is missing the required attribute 'value'.`);
      let value: string | number = valueString;

      if (PrimitiveType.Integer === tempBackingType) {
        const numericValue = parseInt(valueString, 10);
        if (isNaN(numericValue))
          throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Enumeration ${this._currentItemFullName} of type "int" has an enumerator with a non-integer value.`);
        value = numericValue;
      }

      const label = this.getOptionalAttribute(element, "displayLabel");
      const description = this.getOptionalAttribute(element, "description");

      enumerators.push({
        name,
        value,
        label,
        description,
      });
    }

    return {
      ...itemProps,
      type: enumType,
      isStrict,
      enumerators,
    };
  }

  public parseKindOfQuantity(xmlElement: Element): KindOfQuantityProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    const relativeErrorString = this.getRequiredAttribute(xmlElement, "relativeError",
      `The KindOfQuantity ${this._currentItemFullName} is missing the required 'relativeError' attribute.`);
    const relativeError = parseFloat(relativeErrorString);
    if (isNaN(relativeError))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The KindOfQuantity ${this._currentItemFullName} has an invalid 'relativeError' attribute. It should be a numeric value.`);

    const presentationUnitsString = this.getOptionalAttribute(xmlElement, "presentationUnits");
    let presentationUnits: string[] | undefined;
    if (presentationUnitsString)
      presentationUnits = this.getQualifiedPresentationUnits(presentationUnitsString.split(";"));

    let persistenceUnit = this.getRequiredAttribute(xmlElement, "persistenceUnit",
      `The KindOfQuantity ${this._currentItemFullName} is missing the required 'persistenceUnit' attribute.`);
    persistenceUnit = this.getQualifiedTypeName(persistenceUnit);

    return {
      ...itemProps,
      relativeError,
      presentationUnits,
      persistenceUnit,
    };
  }

  public parsePropertyCategory(xmlElement: Element): PropertyCategoryProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    const priorityString = this.getRequiredAttribute(xmlElement, "priority",
      `The PropertyCategory ${this._currentItemFullName} is missing the required 'priority' attribute.`);
    const priority = parseInt(priorityString, 10);
    if (isNaN(priority))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The PropertyCategory ${this._currentItemFullName} has an invalid 'priority' attribute. It should be a numeric value.`);

    return {
      ...itemProps,
      priority,
    };
  }

  public parseUnit(xmlElement: Element): UnitProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    let phenomenon = this.getRequiredAttribute(xmlElement, "phenomenon",
      `The Unit ${this._currentItemFullName} is missing the required 'phenomenon' attribute.`);
    let unitSystem = this.getRequiredAttribute(xmlElement, "unitSystem",
      `The Unit ${this._currentItemFullName} is missing the required 'unitSystem' attribute.`);
    const definition = this.getRequiredAttribute(xmlElement, "definition",
      `The Unit ${this._currentItemFullName} is missing the required 'definition' attribute.`);
    const numerator = this.getOptionalFloatAttribute(xmlElement, "numerator",
      `The Unit ${this._currentItemFullName} has an invalid 'numerator' attribute. It should be a numeric value.`);
    const denominator = this.getOptionalFloatAttribute(xmlElement, "denominator",
      `The Unit ${this._currentItemFullName} has an invalid 'denominator' attribute. It should be a numeric value.`);
    const offset = this.getOptionalFloatAttribute(xmlElement, "offset",
      `The Unit ${this._currentItemFullName} has an invalid 'offset' attribute. It should be a numeric value.`);

    phenomenon = this.getQualifiedTypeName(phenomenon);
    unitSystem = this.getQualifiedTypeName(unitSystem);

    return {
      ...itemProps,
      phenomenon,
      unitSystem,
      definition,
      numerator,
      denominator,
      offset,
    };
  }

  public parseInvertedUnit(xmlElement: Element): InvertedUnitProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    let invertsUnit = this.getRequiredAttribute(xmlElement, "invertsUnit",
      `The InvertedUnit ${this._currentItemFullName} is missing the required 'invertsUnit' attribute.`);
    let unitSystem = this.getRequiredAttribute(xmlElement, "unitSystem",
      `The InvertedUnit ${this._currentItemFullName} is missing the required 'unitSystem' attribute.`);

    invertsUnit = this.getQualifiedTypeName(invertsUnit);
    unitSystem = this.getQualifiedTypeName(unitSystem);

    return {
      ...itemProps,
      invertsUnit,
      unitSystem,
    };
  }

  public parseConstant(xmlElement: Element): ConstantProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    let phenomenon = this.getRequiredAttribute(xmlElement, "phenomenon",
      `The Constant ${this._currentItemFullName} is missing the required 'phenomenon' attribute.`);
    const definition = this.getRequiredAttribute(xmlElement, "definition",
      `The Constant ${this._currentItemFullName} is missing the required 'definition' attribute.`);
    const numerator = this.getOptionalFloatAttribute(xmlElement, "numerator",
      `The Constant ${this._currentItemFullName} has an invalid 'numerator' attribute. It should be a numeric value.`);
    const denominator = this.getOptionalFloatAttribute(xmlElement, "denominator",
      `The Constant ${this._currentItemFullName} has an invalid 'denominator' attribute. It should be a numeric value.`);

    phenomenon = this.getQualifiedTypeName(phenomenon);

    return {
      ...itemProps,
      phenomenon,
      definition,
      numerator,
      denominator,
    };
  }

  public parsePhenomenon(xmlElement: Element): PhenomenonProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    const definition = this.getRequiredAttribute(xmlElement, "definition",
      `The Phenomenon ${this._currentItemFullName} is missing the required 'definition' attribute.`);

    return {
      ...itemProps,
      definition,
    };
  }

  public parseFormat(xmlElement: Element): FormatProps {
    const itemProps = this.getSchemaItemProps(xmlElement);

    const formatType = this.getRequiredAttribute(xmlElement, "type",
      `The Format ${this._currentItemFullName} is missing the required 'type' attribute.`);
    const precision = this.getOptionalIntAttribute(xmlElement, "precision",
      `The Format ${this._currentItemFullName} has an invalid 'precision' attribute. It should be a numeric value.`);
    const roundFactor = this.getOptionalFloatAttribute(xmlElement, "roundFactor",
      `The Format ${this._currentItemFullName} has an invalid 'roundFactor' attribute. It should be a numeric value.`);
    const minWidth = this.getOptionalIntAttribute(xmlElement, "minWidth",
      `The Format ${this._currentItemFullName} has an invalid 'minWidth' attribute. It should be a numeric value.`);
    const showSignOption = this.getOptionalAttribute(xmlElement, "showSignOption");

    const formatTraitsString = this.getRequiredAttribute(xmlElement, "formatTraits",
      `The Format ${this._currentItemFullName} is missing the required 'formatTraits' attribute.`);
    const formatTraits = formatTraitsString.split("|");

    const decimalSeparator = this.getOptionalAttribute(xmlElement, "decimalSeparator");
    const thousandSeparator = this.getOptionalAttribute(xmlElement, "thousandSeparator");
    const uomSeparator = this.getOptionalAttribute(xmlElement, "uomSeparator");
    const scientificType = this.getOptionalAttribute(xmlElement, "scientificType");

    const stationOffsetSize = this.getOptionalIntAttribute(xmlElement, "stationOffsetSize",
      `The Format ${this._currentItemFullName} has an invalid 'stationOffsetSize' attribute. It should be a numeric value.`);

    const stationSeparator = this.getOptionalAttribute(xmlElement, "stationSeparator");

    let composite: object | undefined;
    const compositeResult = this.getElementChildrenByTagName(xmlElement, "Composite");
    if (compositeResult.length > 0) {
      const compositeElement = compositeResult[0];

      const spacer = this.getOptionalAttribute(compositeElement, "spacer");

      const includeZeroString = this.getOptionalAttribute(compositeElement, "includeZero");
      let includeZero: boolean | undefined;
      if (includeZeroString) {
        includeZero = this.parseBoolean(includeZeroString,
          `The Format ${this._currentItemFullName} has a Composite with an invalid 'includeZero' attribute. It should be either "true" or "false".`);
      }

      const units = new Array<{ name: string, label?: string }>();
      const unitsResult = this.getElementChildrenByTagName(compositeElement, "Unit");
      if (unitsResult.length < 1)
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Format ${this._currentItemFullName} has an invalid 'Composite' element. It should have 1-4 Unit elements.`);

      for (const unit of unitsResult) {
        let name = unit.textContent;
        if (null === name || 0 === name.length)
          throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The Format ${this._currentItemFullName} has a Composite with an invalid Unit. One of the Units is missing the required 'name' attribute.`);

        const label = this.getOptionalAttribute(unit, "label");
        name = this.getQualifiedTypeName(name);
        units.push({ name, label });
      }

      composite = {
        spacer,
        includeZero,
        units,
      };
    }

    return {
      ...itemProps,
      type: formatType,
      precision,
      roundFactor,
      minWidth,
      showSignOption,
      formatTraits,
      decimalSeparator,
      thousandSeparator,
      uomSeparator,
      scientificType,
      stationOffsetSize,
      stationSeparator,
      composite,
    } as FormatProps;
  }

  public parseUnitSystem(xmlElement: Element): UnitSystemProps {
    return this.getClassProps(xmlElement);
  }

  public *getProperties(xmlElement: Element): Iterable<[string, string, Element]> {
    const propertyTagRegex = /EC((Struct(Array)?)|Array|Navigation)?Property/;
    const children = this.getElementChildrenByTagName(xmlElement, propertyTagRegex);

    for (const child of children) {
      const childType = child.nodeName;
      const propertyName = this.getRequiredAttribute(child, "propertyName",
        `An ECProperty in ${this._currentItemFullName} is missing the required 'propertyName' attribute.`);

      const propertyType = this.getPropertyType(childType);
      // This may not be needed, just a failsafe if the regex is faulty
      if (propertyType === undefined)
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ECProperty ${this._currentItemFullName}.${propertyName} has an invalid type. ${childType} is not a valid ECProperty type.`);

      yield [propertyName, propertyType, child];
    }
  }

  public parsePrimitiveProperty(xmlElement: Element): PrimitivePropertyProps {
    const propertyProps = this.getPrimitiveOrEnumPropertyBaseProps(xmlElement);
    const typeName = this.getPropertyTypeName(xmlElement);
    const primitivePropertyProps = { ...propertyProps, typeName };
    return primitivePropertyProps;
  }

  public parseStructProperty(xmlElement: Element): StructPropertyProps {
    const propertyProps = this.getPropertyProps(xmlElement);
    const typeName = this.getPropertyTypeName(xmlElement);
    const structPropertyProps = { ...propertyProps, typeName };
    return structPropertyProps;
  }

  public parsePrimitiveArrayProperty(xmlElement: Element): PrimitiveArrayPropertyProps {
    const typeName = this.getPropertyTypeName(xmlElement);
    const propertyProps = this.getPrimitiveOrEnumPropertyBaseProps(xmlElement);
    const minAndMaxOccurs = this.getPropertyMinAndMaxOccurs(xmlElement);

    return {
      ...propertyProps,
      ...minAndMaxOccurs,
      typeName,
    };
  }

  public parseStructArrayProperty(xmlElement: Element): StructArrayPropertyProps {
    const propertyProps = this.getPropertyProps(xmlElement);
    const typeName = this.getPropertyTypeName(xmlElement);
    const minAndMaxOccurs = this.getPropertyMinAndMaxOccurs(xmlElement);
    return {
      ...propertyProps,
      ...minAndMaxOccurs,
      typeName,
    };
  }

  public parseNavigationProperty(xmlElement: Element): NavigationPropertyProps {
    const propName = this.getPropertyName(xmlElement);
    const propertyProps = this.getPropertyProps(xmlElement);
    let relationshipName = this.getRequiredAttribute(xmlElement, "relationshipName",
      `The ECNavigationProperty ${this._currentItemFullName}.${propName} is missing the required 'relationshipName' property.`);
    const direction = this.getRequiredAttribute(xmlElement, "direction",
      `The ECNavigationProperty ${this._currentItemFullName}.${propName} is missing the required 'direction' property.`);

    relationshipName = this.getQualifiedTypeName(relationshipName);

    return {
      ...propertyProps,
      relationshipName,
      direction,
    };
  }

  public getSchemaCustomAttributeProviders(): Iterable<CAProviderTuple> {
    return this.getCustomAttributeProviders(this._rawSchema.documentElement, "Schema", this._schemaName);
  }

  public getClassCustomAttributeProviders(xmlElement: Element): Iterable<CAProviderTuple> {
    return this.getCustomAttributeProviders(xmlElement, "ECClass", this._currentItemFullName);
  }

  public getPropertyCustomAttributeProviders(xmlElement: Element): Iterable<CAProviderTuple> {
    const propName = this.getPropertyName(xmlElement);
    return this.getCustomAttributeProviders(xmlElement, "ECProperty", `${this._currentItemFullName}.${propName}`);
  }

  public getRelationshipConstraintCustomAttributeProviders(xmlElement: Element): [Iterable<CAProviderTuple> /* source */, Iterable<CAProviderTuple> /* target */] {
    const sourceResult = this.getElementChildrenByTagName(xmlElement, "Source");
    if (sourceResult.length < 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The RelationshipClass ${this._currentItemFullName} is missing the required Source constraint tag.`);
    const sourceElement = sourceResult[0];
    const sourceCustomAttributes = this.getCustomAttributeProviders(sourceElement, "Source Constraint of", this._currentItemFullName);

    const targetResult = this.getElementChildrenByTagName(xmlElement, "Target");
    if (targetResult.length < 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The RelationshipClass ${this._currentItemFullName} is missing the required Target constraint tag.`);
    const targetElement = targetResult[0];
    const targetCustomAttributes = this.getCustomAttributeProviders(targetElement, "Source Constraint of", this._currentItemFullName);

    return [sourceCustomAttributes, targetCustomAttributes];
  }

  private getElementChildren(xmlElement: Element): Element[] {
    // NodeListOf<T> does not define [Symbol.iterator]
    const children = Array.from(xmlElement.childNodes).filter((child) => {
      // (node.nodeType === 1) implies instanceof Element
      // https://developer.mozilla.org/en-US/docs/Web/API/ParentNode/children#Polyfill
      return child.nodeType === 1;
    });
    return children as Element[];
  }

  private getElementChildrenByTagName(xmlElement: Element, tagName: string | RegExp): Element[] {
    const children = this.getElementChildren(xmlElement);
    if ("*" === tagName)
      return children;

    let result: Element[];
    if (typeof tagName === "string") {
      result = children.filter((child) => {
        return tagName.toLowerCase() === child.nodeName.toLowerCase();
      });
    } else {
      result = children.filter((child) => {
        return tagName.test(child.nodeName);
      });
    }

    return result;
  }

  private getOptionalAttribute(xmlElement: Element, attributeName: string): string | undefined {
    if (!xmlElement.hasAttribute(attributeName))
      return undefined;
    const result = xmlElement.getAttribute(attributeName);

    // The typings for the return value of getAttribute do not match that of xmldom
    // xmldom returns an empty string instead of null
    // However Typescript will still treat result as a union type without this check
    // Hence this is needed for tsc to compile
    if (result === null)
      return undefined;
    return result;
  }

  private getOptionalFloatAttribute(xmlElement: Element, attributeName: string, parseErrorMsg: string): number | undefined {
    const resultString = this.getOptionalAttribute(xmlElement, attributeName);
    let result: number | undefined;
    if (resultString) {
      result = parseFloat(resultString);
      if (isNaN(result))
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, parseErrorMsg);
    }
    return result;
  }

  private getOptionalIntAttribute(xmlElement: Element, attributeName: string, parseErrorMsg: string): number | undefined {
    const resultString = this.getOptionalAttribute(xmlElement, attributeName);
    let result: number | undefined;
    if (resultString) {
      result = parseInt(resultString, 10);
      if (isNaN(result))
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, parseErrorMsg);
    }
    return result;
  }

  private parseBoolean(text: string, parseErrorMsg: string): boolean {
    const textString = text.toLowerCase();
    if ("true" === textString) return true;
    else if ("false" === textString) return false;
    else throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, parseErrorMsg);
  }

  private getRequiredAttribute(xmlElement: Element, attributeName: string, errorMsg: string): string {
    if (!xmlElement.hasAttribute(attributeName))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, errorMsg);
    const result = xmlElement.getAttribute(attributeName);
    if (result === null)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, errorMsg);
    return result;
  }

  private getSchemaReference(xmlElement: Element): SchemaReferenceProps {
    const alias = this.getRequiredAttribute(xmlElement, "alias",
      `The schema ${this._schemaName} has an invalid ECSchemaReference attribute. One of the references is missing the required 'alias' attribute.`);
    const name = this.getRequiredAttribute(xmlElement, "name",
      `The schema ${this._schemaName} has an invalid ECSchemaReference attribute. One of the references is missing the required 'name' attribute.`);
    const version = this.getRequiredAttribute(xmlElement, "version",
      `The schema ${this._schemaName} has an invalid ECSchemaReference attribute. One of the references is missing the required 'version' attribute.`);

    if (!this._schemaReferenceNames.has(alias.toLowerCase()))
      this._schemaReferenceNames.set(alias.toLowerCase(), name);

    return {
      name,
      version,
    };
  }

  private getSchemaItemType(rawType: string): string | undefined {
    switch (rawType.toLowerCase()) {
      case "ecentityclass": return "EntityClass";
      case "mixin": return "Mixin";
      case "ecstructclass": return "StructClass";
      case "eccustomattributeclass": return "CustomAttributeClass";
      case "ecrelationshipclass": return "RelationshipClass";
      case "ecenumeration": return "Enumeration";
      case "kindofquantity": return "KindOfQuantity";
      case "propertycategory": return "PropertyCategory";
      case "unit": return "Unit";
      case "invertedunit": return "InvertedUnit";
      case "constant": return "Constant";
      case "phenomenon": return "Phenomenon";
      case "unitsystem": return "UnitSystem";
      case "format": return "Format";
    }
    return undefined;
  }

  private getSchemaChildren(): Element[] {
    const schemaMetadata = this._rawSchema.documentElement;
    return this.getElementChildren(schemaMetadata);
  }

  private getSchemaItemProps(xmlElement: Element): SchemaItemProps {
    const displayLabel = this.getOptionalAttribute(xmlElement, "displayLabel");
    const description = this.getOptionalAttribute(xmlElement, "description");

    return {
      description,
      label: displayLabel,
    };
  }

  private getClassProps(xmlElement: Element): ClassProps {
    const itemProps = this.getSchemaItemProps(xmlElement);
    const modifier = this.getOptionalAttribute(xmlElement, "modifier");

    let baseClass: string | null | undefined = null;
    const baseClasses = this.getElementChildrenByTagName(xmlElement, "BaseClass");
    if (baseClasses.length > 0) {
      // We are assuming here that the first BaseClass is the 'real' one - the rest are mixins
      // This is not a finalized approach as this could lead to unsupported schemas
      baseClass = baseClasses[0].textContent;
    }

    baseClass = baseClass ? this.getQualifiedTypeName(baseClass) : undefined;

    return {
      ...itemProps,
      modifier,
      baseClass,
    };
  }

  private getRelationshipConstraintProps(xmlElement: Element, isSource: boolean): RelationshipConstraintProps {
    const constraintName = `${(isSource) ? "Source" : "Target"} Constraint of ${this._currentItemFullName}`;

    const multiplicity = this.getRequiredAttribute(xmlElement, "multiplicity",
      `The ${constraintName} is missing the required 'multiplicity' attribute.`);
    const roleLabel = this.getRequiredAttribute(xmlElement, "roleLabel",
      `The ${constraintName} is missing the required 'roleLabel' attribute.`);

    const polymorphicString = this.getRequiredAttribute(xmlElement, "polymorphic",
      `The ${constraintName} is missing the required 'polymorphic' attribute.`);
    const polymorphic = this.parseBoolean(polymorphicString,
      `The ${constraintName} has an invalid 'polymorphic' attribute. It should either be "true" or "false".`);

    let abstractConstraint = this.getOptionalAttribute(xmlElement, "abstractConstraint");
    if (undefined !== abstractConstraint)
      abstractConstraint = this.getQualifiedTypeName(abstractConstraint);

    const constraintClasses = new Array<string>();
    const constraintClassesResult = this.getElementChildrenByTagName(xmlElement, "Class");
    if (constraintClassesResult.length < 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ${constraintName} is missing the required Class tags.`);

    for (const constraintClass of constraintClassesResult) {
      let constraintClassId = constraintClass.getAttribute("class");
      if (null === constraintClassId || 0 === constraintClassId.length)
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ${constraintName} has a Class that is missing the required 'class' attribute.`);

      constraintClassId = this.getQualifiedTypeName(constraintClassId);
      constraintClasses.push(constraintClassId);
    }

    return {
      multiplicity,
      roleLabel,
      polymorphic,
      abstractConstraint,
      constraintClasses,
    };
  }

  private getPropertyType(propType: string): string | undefined {
    switch (propType) {
      case "ECNavigationProperty": return "navigationproperty";
      case "ECStructProperty": return "structproperty";
      case "ECArrayProperty": return "primitivearrayproperty";
      case "ECStructArrayProperty": return "structarrayproperty";
      case "ECProperty": return "primitiveproperty";
      default: return undefined;
    }
  }

  private getPropertyName(xmlElement: Element): string {
    return this.getRequiredAttribute(xmlElement, "propertyName",
      `An ECProperty in ${this._currentItemFullName} is missing the required 'propertyName' attribute.`);
  }

  private getPropertyProps(xmlElement: Element): PropertyProps {
    const propName = this.getPropertyName(xmlElement);

    const propType = this.getPropertyType(xmlElement.nodeName);
    if (propType === undefined)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid type. ${propType} is not a valid ECProperty type.`);

    const label = this.getOptionalAttribute(xmlElement, "displayLabel");
    const description = this.getOptionalAttribute(xmlElement, "description");

    const readOnlyString = this.getOptionalAttribute(xmlElement, "readOnly");
    let isReadOnly: boolean | undefined;
    if (readOnlyString) {
      isReadOnly = this.parseBoolean(readOnlyString,
        `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'readOnly' attribute. It should be either "true" or "false".`);
    }

    let category = this.getOptionalAttribute(xmlElement, "category");

    const priority = this.getOptionalIntAttribute(xmlElement, "priority",
      `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'priority' attribute. It should be a numeric value.`);

    const inheritedString = this.getOptionalAttribute(xmlElement, "inherited");
    let inherited: boolean | undefined;
    if (inheritedString) {
      inherited = this.parseBoolean(inheritedString,
        `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'inherited' attribute. It should be either "true" or "false".`);
    }

    let kindOfQuantity = this.getOptionalAttribute(xmlElement, "kindOfQuantity");

    if (kindOfQuantity)
      kindOfQuantity = this.getQualifiedTypeName(kindOfQuantity);
    if (category)
      category = this.getQualifiedTypeName(category);

    return {
      name: propName,
      type: propType,
      description,
      label,
      isReadOnly,
      category,
      priority,
      inherited,
      kindOfQuantity,
    };
  }

  private getPropertyTypeName(xmlElement: Element): string {
    const propName = this.getPropertyName(xmlElement);
    const rawTypeName = this.getRequiredAttribute(xmlElement, "typeName",
      `The ECProperty ${this._currentItemFullName}.${propName} is missing the required 'typeName' attribute.`);

    // If not a primitive type, we must prepend the schema name.
    const primitiveType = parsePrimitiveType(rawTypeName);
    if (primitiveType)
      return rawTypeName;

    return this.getQualifiedTypeName(rawTypeName);
  }

  private getPrimitiveOrEnumPropertyBaseProps(xmlElement: Element): PrimitiveOrEnumPropertyBaseProps {
    const propertyProps = this.getPropertyProps(xmlElement);
    const propName = propertyProps.name;
    const extendedTypeName = this.getOptionalAttribute(xmlElement, "extendedTypeName");
    const minLength = this.getOptionalIntAttribute(xmlElement, "minimumLength",
      `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'minimumLength' attribute. It should be a numeric value.`);
    const maxLength = this.getOptionalIntAttribute(xmlElement, "maximumLength",
      `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'maximumLength' attribute. It should be a numeric value.`);
    const minValue = this.getOptionalIntAttribute(xmlElement, "minimumValue",
      `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'minimumValue' attribute. It should be a numeric value.`);
    const maxValue = this.getOptionalIntAttribute(xmlElement, "maximumValue",
      `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'maximumValue' attribute. It should be a numeric value.`);

    return {
      ...propertyProps,
      extendedTypeName,
      minLength,
      maxLength,
      minValue,
      maxValue,
    };
  }

  private getPropertyMinAndMaxOccurs(xmlElement: Element): { minOccurs: number | undefined, maxOccurs: number | undefined } {
    const propName = this.getPropertyName(xmlElement);
    const minOccurs = this.getOptionalIntAttribute(xmlElement, "minOccurs",
      `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'minOccurs' attribute. It should be a numeric value.`);

    const maxOccursStr = this.getOptionalAttribute(xmlElement, "maxOccurs");
    let maxOccurs: number | undefined;
    if ("unbounded" === maxOccursStr)
      maxOccurs = 2147483647; // TODO: This should be using the INT32_MAX variable.
    else if (undefined !== maxOccursStr) {
      maxOccurs = parseInt(maxOccursStr, 10);
      if (isNaN(maxOccurs))
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'maxOccurs' attribute. It should be a numeric value.`);
    }

    return { minOccurs, maxOccurs };
  }

  private *getCustomAttributeProviders(xmlElement: Element, type: string, _name?: string): Iterable<CAProviderTuple> {
    const customAttributesResult = this.getElementChildrenByTagName(xmlElement, "ECCustomAttributes");
    if (customAttributesResult.length < 1)
      return;

    const attributes = this.getElementChildren(customAttributesResult[0]);
    for (const attribute of attributes) {
      if ("ECClass" === type && "IsMixin" === attribute.tagName)
        continue;

      yield this.getCustomAttributeProvider(attribute);
    }
  }

  private getCustomAttributeProvider(xmlCustomAttribute: Element): CAProviderTuple {
    assert(this._ecXmlVersion !== undefined);

    let ns = xmlCustomAttribute.getAttribute("xmlns");
    if (!ns) {
      assert(this._schemaName !== undefined);
      assert(this._schemaVersion !== undefined);
      ns = `${this._schemaName}.${this._schemaVersion}`;
    }

    if (null === ns || !this.isSchemaFullNameValidForVersion(ns, this._ecXmlVersion))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Custom attribute namespaces must contain a valid 3.2 full schema name in the form <schemaName>.RR.ww.mm.`);

    const schemaNameParts = ns.split(".");
    const className = `${schemaNameParts[0]}.${xmlCustomAttribute.tagName}`;
    const properties = this.getElementChildren(xmlCustomAttribute);

    const provider = (caClass: CustomAttributeClass) => {
      return this.addCAPropertyValues(caClass, properties);
    };

    return [className, provider];
  }

  private addCAPropertyValues(caClass: CustomAttributeClass, propertyElements: Element[]): CustomAttribute {
    const instance = { className: caClass.fullName } as CustomAttribute;
    if (!caClass.properties)
      return instance;

    for (const propertyElement of propertyElements) {
      const value = this.readPropertyValue(propertyElement, caClass);
      if (value !== undefined)
        instance[propertyElement.tagName] = value;
    }

    return instance;
  }

  private readPropertyValue(propElement: Element, parentClass: ECClass): any {
    const propertyClass = parentClass.getPropertySync(propElement.tagName);
    if (!propertyClass)
      return;

    if (propertyClass.isArray())
      return this.readArrayPropertyValue(propElement, propertyClass);

    let enumeration: Enumeration | undefined;
    if (propertyClass.isPrimitive()) {
      if (propertyClass.isEnumeration() && propertyClass.enumeration) {
        enumeration = propertyClass.schema.lookupItemSync(propertyClass.enumeration.fullName);
        if (!enumeration)
          throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `The Enumeration class '${propertyClass.enumeration.fullName}' could not be found.`);
      }
      const primitiveType = enumeration && enumeration.type ? enumeration.type : (propertyClass).primitiveType;
      return this.readPrimitivePropertyValue(propElement, primitiveType);
    }

    if (propertyClass.isStruct())
      return this.readStructPropertyValue(propElement, propertyClass.structClass);

    return undefined;
  }

  private readArrayPropertyValue(propElement: Element, propertyClass: Property): PrimitiveArray | undefined {
    if (propertyClass.isPrimitive())
      return this.readPrimitiveArrayValues(propElement, (propertyClass as PrimitiveProperty).primitiveType);

    if (propertyClass.isStruct())
      return this.readStructArrayValues(propElement, propertyClass as StructArrayProperty);

    return undefined;
  }

  private readPrimitiveArrayValues(propElement: Element, primitiveType: PrimitiveType): PrimitiveArray {
    const typeName = primitiveTypeToString(primitiveType);
    const children = this.getElementChildrenByTagName(propElement, typeName);
    const values: PrimitiveArray = [];
    for (const child of children) {
      const value = this.readPrimitivePropertyValue(child, primitiveType);
      values.push(value);
    }

    return values;
  }

  private readStructArrayValues(propElement: Element, propertyClass: StructArrayProperty): any {
    const children = this.getElementChildren(propElement);
    const values: any = [];
    for (const child of children) {
      const value = this.readStructPropertyValue(child, propertyClass.structClass);
      values.push(value);
    }

    return values;
  }

  private readStructPropertyValue(propElement: Element, structClass: StructClass): any {
    const structObj: any = {};
    const children = this.getElementChildren(propElement);
    for (const child of children) {
      const value = this.readPropertyValue(child, structClass);
      if (value !== undefined)
        structObj[child.tagName] = value;
    }
    return structObj;
  }

  private readPrimitivePropertyValue(propElement: Element, primitiveType: PrimitiveType): PrimitiveValue {
    if (!propElement.textContent)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Primitive property '${propElement.tagName}' has an invalid property value.`);

    // TODO: Mapping all primitive types to string, number and boolean
    // for now.  Need to review with IModelJs.
    switch (primitiveType) {
      case PrimitiveType.String:
      case PrimitiveType.Binary: /** TODO - Currently treated as strings */
      case PrimitiveType.IGeometry: /** TODO - Currently treated as strings */
        return propElement.textContent;
      case PrimitiveType.DateTime:
        return this.getDatePropertyValue(propElement.textContent, propElement.tagName);
      case PrimitiveType.Point2d:
        return this.getPoint2DPropertyValue(propElement.textContent, propElement.tagName);
      case PrimitiveType.Point3d:
        return this.getPoint3DPropertyValue(propElement.textContent, propElement.tagName);
      case PrimitiveType.Boolean:
        return this.getBooleanPropertyValue(propElement.textContent, propElement.tagName);
      case PrimitiveType.Integer:
      case PrimitiveType.Long:
        return this.getIntegerPropertyValue(propElement.textContent, propElement.tagName);
      case PrimitiveType.Double:
        return this.getDoublePropertyValue(propElement.textContent, propElement.tagName);
      default:
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Primitive property '${propElement.tagName}' has an invalid primitive type.`);
    }
  }

  private getBooleanPropertyValue(propValue: string, propName: string): boolean {
    if (propValue.toLowerCase() === "true" ||
      Number.parseInt(propValue, 10) > 0) {
      return true;
    } else if (propValue.toLowerCase() === "false" ||
      Number.parseInt(propValue, 10) === 0) {
      return false;
    }

    throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. An boolean value was expected.`);
  }

  private getIntegerPropertyValue(propValue: string, propName: string): number {
    const result = Number.parseFloat(propValue);
    if (isNaN(result) || result % 1 !== 0)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. An integer value was expected.`);

    return result;
  }

  private getDatePropertyValue(propValue: string, propName: string): Date {
    const result = Number.parseInt(propValue, 10);
    if (isNaN(result))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. A date in milliseconds was expected.`);

    return new Date(result);
  }

  private getDoublePropertyValue(propValue: string, propName: string): number {
    const result = Number.parseFloat(propValue);
    if (isNaN(result))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. A double value was expected.`);

    return result;
  }

  private getPoint2DPropertyValue(propValue: string, propName: string): any {
    const result = propValue.split(",");
    if (result.length !== 2) {
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. A Point 2D value was expected.`);
    }

    const x = Number.parseFloat(result[0]);
    const y = Number.parseFloat(result[1]);

    if (isNaN(x) || isNaN(y))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. A Point 2D value was expected.`);

    return { x, y };
  }

  private getPoint3DPropertyValue(propValue: string, propName: string): any {
    const result = propValue.split(",");
    if (result.length !== 3) {
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. A Point 3D value was expected.`);
    }

    const x = Number.parseFloat(result[0]);
    const y = Number.parseFloat(result[1]);
    const z = Number.parseFloat(result[2]);

    if (isNaN(x) || isNaN(y) || isNaN(z))
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Property '${propName}' has an invalid property value. A Point 3D value was expected.`);

    return { x, y, z };
  }

  private isSchemaFullNameValidForVersion(schemaFullName: string, ecXmlVersion: ECXmlVersion) {
    const schemaNameParts = schemaFullName.split(".");

    if ((ecXmlVersion.readVersion >= 3 && ecXmlVersion.writeVersion >= 2) || ecXmlVersion.readVersion > 3) {
      if (schemaNameParts.length < 4)
        return false;
    } else {
      if (schemaNameParts.length < 3)
        return false;
    }
    return true;
  }

  private parseXmlNamespace(xmlNamespace: string): ECXmlVersion | undefined {
    const regEx = new RegExp(`^${ECXML_URI}\\.([0-9]+)\\.([0-9]+)$`);
    const match = xmlNamespace.match(regEx);
    if (!match)
      return;

    const readVersion = parseInt(match[1], 10);
    const writeVersion = parseInt(match[2], 10);
    return { readVersion, writeVersion };
  }

  private getQualifiedTypeName(rawTypeName: string): string {
    const nameParts = rawTypeName.split(":");
    if (nameParts.length !== 2)
      return `${this._schemaName}.${rawTypeName}`;

    if (nameParts[0].toLowerCase() === this._schemaAlias.toLowerCase())
      return `${this._schemaName}.${nameParts[1]}`;
    if (this._schemaReferenceNames.has(nameParts[0].toLowerCase()))
      return `${this._schemaReferenceNames.get(nameParts[0].toLowerCase())}.${nameParts[1]}`;

    throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `No valid schema found for alias ${nameParts[0]}`);
  }

  /** The rest of the API uses the full name format of `{SchemaName}.{SchemaItemName}`,
   * meaning all of the references in the format string need to be changed.
   */
  private getQualifiedPresentationUnits(presentationUnits: string[]): string[] {
    const res: string[] = [];
    for (const presentationUnit of presentationUnits) {
      // we split the presentation unit by square parantheses [ ], f:DefaultReal(6)[u:FT|feet] will be splitted into f:DefaultReal(6) and u:FT|feet
      // we format the first one and the next one will be put into [ ] again
      const presentationUnitFormats = presentationUnit.split(/[\[\]]/g);
      let qualifiedPresentation: string = "";
      qualifiedPresentation = this.getQualifiedTypeName(presentationUnitFormats[0]);
      if (presentationUnitFormats.length > 1) {
        for (let i = 1; i < presentationUnitFormats.length; ++i) {
          if (presentationUnitFormats[i].length === 0)
            continue;
          const verticalSlashIdx = presentationUnitFormats[i].indexOf("|");
          const overrideFormat = this.getQualifiedTypeName(presentationUnitFormats[i].slice(0, verticalSlashIdx));
          const formatLabel = presentationUnitFormats[i].slice(verticalSlashIdx);
          qualifiedPresentation += `[${overrideFormat}${formatLabel}]`;
        }
      }

      res.push(qualifiedPresentation);
    }

    return res;
  }
}
