/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { SchemaContext } from "../Context";
import { parsePrimitiveType, parseSchemaItemType, SchemaItemType, SchemaMatchType } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { AnyClass, AnySchemaItem } from "../Interfaces";
import { ECClass, MutableClass } from "../Metadata/Class";
import { Constant } from "../Metadata/Constant";
import { CustomAttributeClass } from "../Metadata/CustomAttributeClass";
import { EntityClass, MutableEntityClass } from "../Metadata/EntityClass";
import { Format } from "../Metadata/Format";
import { InvertedUnit } from "../Metadata/InvertedUnit";
import { KindOfQuantity } from "../Metadata/KindOfQuantity";
import { Mixin } from "../Metadata/Mixin";
import { MutableProperty, Property } from "../Metadata/Property";
import { MutableRelationshipConstraint, RelationshipClass, RelationshipConstraint } from "../Metadata/RelationshipClass";
import { MutableSchema, Schema } from "../Metadata/Schema";
import { SchemaItem } from "../Metadata/SchemaItem";
import { Unit } from "../Metadata/Unit";
import { ECVersion, SchemaItemKey, SchemaKey } from "../SchemaKey";
import { ISchemaPartVisitor, SchemaPartVisitorDelegate } from "../SchemaPartVisitorDelegate";
import { getItemNamesFromFormatString } from "@bentley/imodeljs-quantity";
import { AbstractParser, AbstractParserConstructor, CAProviderTuple } from "./AbstractParser";
import { ClassProps, PropertyProps, RelationshipConstraintProps, SchemaReferenceProps } from "./JsonProps";
import {validateSchemaReferences, validateSchemaReferencesSync} from "../Validation/ECRules";

type AnyCAContainer = Schema | ECClass | Property | RelationshipConstraint;
type AnyMutableCAContainer = MutableSchema | MutableClass | MutableProperty | MutableRelationshipConstraint;

/**
 * This class properly handles the order the deserialization of ECSchemas and SchemaItems from serialized formats.
 * For example, when deserializing an ECClass most times all base class should be de-serialized before the given class.
 * @internal
 */
export class SchemaReadHelper<T = unknown> {
  private _context: SchemaContext;
  private _visitorHelper?: SchemaPartVisitorDelegate;
  private _parserType: AbstractParserConstructor<T, unknown>;
  private _parser!: AbstractParser<unknown>;

  // Cache of the schema currently being loaded. This schema is in the _context but to
  // avoid going back to the context every time, the cache is used.
  private _schema?: Schema;

  constructor(parserType: AbstractParserConstructor<T>, context?: SchemaContext, visitor?: ISchemaPartVisitor) {
    this._context = (undefined !== context) ? context : new SchemaContext();
    this._visitorHelper = visitor ? new SchemaPartVisitorDelegate(visitor) : undefined;
    this._parserType = parserType;
  }

  /**
   * Populates the given Schema from a serialized representation.
   * @param schema The Schema to populate
   * @param rawSchema The serialized data to use to populate the Schema.
   */
  public async readSchema<U extends Schema>(schema: U, rawSchema: T): Promise<U> {
    // Ensure context matches schema context
    if (schema.context) {
      if (this._context !== schema.context)
        throw new ECObjectsError(ECObjectsStatus.DifferentSchemaContexts, "The SchemaContext of the schema must be the same SchemaContext held by the SchemaReadHelper.");
    } else {
      (schema as Schema as MutableSchema).setContext(this._context);
    }

    this._parser = new this._parserType(rawSchema);

    // Loads all of the properties on the Schema object
    await schema.fromJSON(this._parser.parseSchema());

    this._schema = schema;

    // Need to add this schema to the context to be able to locate schemaItems within the context.
    await this._context.addSchema(schema);

    // Load schema references first
    // Need to figure out if other schemas are present.
    for (const reference of this._parser.getReferences()) {
      await this.loadSchemaReference(reference);
    }

    if (this._visitorHelper)
      await this._visitorHelper.visitSchema(schema, false);

    // Load all schema items
    for (const [itemName, itemType, rawItem] of this._parser.getItems()) {
      // Make sure the item has not already been read. No need to check the SchemaContext because all SchemaItems are added to a Schema,
      // which would be found when adding to the context.
      if (await schema.getItem(itemName) !== undefined)
        continue;

      const loadedItem = await this.loadSchemaItem(schema, itemName, itemType, rawItem);
      if (loadedItem && this._visitorHelper) {
        await this._visitorHelper.visitSchemaPart(loadedItem);
      }
    }

    await this.loadCustomAttributes(schema, this._parser.getSchemaCustomAttributeProviders());

    if (this._visitorHelper)
      await this._visitorHelper.visitSchema(schema);

    return schema;
  }

  /**
   * Populates the given Schema from a serialized representation.
   * @param schema The Schema to populate
   * @param rawSchema The serialized data to use to populate the Schema.
   */
  public readSchemaSync<U extends Schema>(schema: U, rawSchema: T): U {
    this._parser = new this._parserType(rawSchema);

    // Loads all of the properties on the Schema object
    schema.fromJSONSync(this._parser.parseSchema());

    this._schema = schema;

    // Need to add this schema to the context to be able to locate schemaItems within the context.
    this._context.addSchemaSync(schema);

    // Load schema references first
    // Need to figure out if other schemas are present.
    for (const reference of this._parser.getReferences()) {
      this.loadSchemaReferenceSync(reference);
    }

    if (this._visitorHelper)
      this._visitorHelper.visitSchemaSync(schema, false);

    // Load all schema items
    for (const [itemName, itemType, rawItem] of this._parser.getItems()) {
      // Make sure the item has not already been read. No need to check the SchemaContext because all SchemaItems are added to a Schema,
      // which would be found when adding to the context.
      if (schema.getItemSync(itemName) !== undefined)
        continue;

      const loadedItem = this.loadSchemaItemSync(schema, itemName, itemType, rawItem);
      if (loadedItem && this._visitorHelper) {
        this._visitorHelper.visitSchemaPartSync(loadedItem);
      }
    }

    this.loadCustomAttributesSync(schema, this._parser.getSchemaCustomAttributeProviders());

    if (this._visitorHelper)
      this._visitorHelper.visitSchemaSync(schema);

    return schema;
  }

  /**
   * Ensures that the schema references can be located and adds them to the schema.
   * @param ref The object to read the SchemaReference's props from.
   */
  private async loadSchemaReference(ref: SchemaReferenceProps): Promise<void> {
    const schemaKey = new SchemaKey(ref.name, ECVersion.fromString(ref.version));
    const refSchema = await this._context.getSchema(schemaKey, SchemaMatchType.LatestWriteCompatible);
    if (undefined === refSchema)
      throw new ECObjectsError(ECObjectsStatus.UnableToLocateSchema, `Could not locate the referenced schema, ${ref.name}.${ref.version}, of ${this._schema!.schemaKey.name}`);

    await (this._schema as MutableSchema).addReference(refSchema);
    const diagnostics = validateSchemaReferences(this._schema!);

    let errorMessage: string = "";
    for await (const diagnostic of diagnostics) {
      errorMessage += `${diagnostic.code}: ${diagnostic.messageText}\r\n`;
    }

    if (errorMessage) {
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `${errorMessage}`);
    }
  }

  /**
   * Ensures that the schema references can be located and adds them to the schema.
   * @param ref The object to read the SchemaReference's props from.
   */
  private loadSchemaReferenceSync(ref: SchemaReferenceProps): void {
    const schemaKey = new SchemaKey(ref.name, ECVersion.fromString(ref.version));
    const refSchema = this._context.getSchemaSync(schemaKey, SchemaMatchType.LatestWriteCompatible);
    if (!refSchema)
      throw new ECObjectsError(ECObjectsStatus.UnableToLocateSchema, `Could not locate the referenced schema, ${ref.name}.${ref.version}, of ${this._schema!.schemaKey.name}`);

    (this._schema as MutableSchema).addReferenceSync(refSchema);
    const diagnostics = validateSchemaReferencesSync(this._schema!);

    let errorMessage: string = "";
    for (const diagnostic of diagnostics) {
      errorMessage += `${diagnostic.code}: ${diagnostic.messageText}\r\n`;
    }
    if (errorMessage) {
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `${errorMessage}`);
    }
  }

  /**
   * Given the schema item object, the anticipated type and the name a schema item is created and loaded into the schema provided.
   * @param schema The Schema the SchemaItem to.
   * @param name The name of the schema item to be loaded.
   * @param itemType The SchemaItemType of the item to load.
   * @param schemaItemObject The Object to populate the SchemaItem with.
   */
  private async loadSchemaItem(schema: Schema, name: string, itemType: string, schemaItemObject: Readonly<unknown>): Promise<SchemaItem | undefined> {
    let schemaItem: AnySchemaItem | undefined;

    switch (parseSchemaItemType(itemType)) {
      case SchemaItemType.EntityClass:
        schemaItem = await (schema as MutableSchema).createEntityClass(name);
        await this.loadEntityClass(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.StructClass:
        schemaItem = await (schema as MutableSchema).createStructClass(name);
        const structProps = this._parser.parseStructClass(schemaItemObject);
        await this.loadClass(schemaItem, structProps, schemaItemObject);
        break;
      case SchemaItemType.Mixin:
        schemaItem = await (schema as MutableSchema).createMixinClass(name);
        await this.loadMixin(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.CustomAttributeClass:
        schemaItem = await (schema as MutableSchema).createCustomAttributeClass(name);
        const caClassProps = this._parser.parseCustomAttributeClass(schemaItemObject);
        await this.loadClass(schemaItem, caClassProps, schemaItemObject);
        break;
      case SchemaItemType.RelationshipClass:
        schemaItem = await (schema as MutableSchema).createRelationshipClass(name);
        await this.loadRelationshipClass(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.KindOfQuantity:
        schemaItem = await (schema as MutableSchema).createKindOfQuantity(name);
        await this.loadKindOfQuantity(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Unit:
        schemaItem = await (schema as MutableSchema).createUnit(name);
        await this.loadUnit(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Constant:
        schemaItem = await (schema as MutableSchema).createConstant(name);
        await this.loadConstant(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.InvertedUnit:
        schemaItem = await (schema as MutableSchema).createInvertedUnit(name);
        await this.loadInvertedUnit(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Format:
        schemaItem = await (schema as MutableSchema).createFormat(name);
        await this.loadFormat(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Phenomenon:
        schemaItem = await (schema as MutableSchema).createPhenomenon(name);
        const phenomenonProps = this._parser.parsePhenomenon(schemaItemObject);
        await schemaItem.fromJSON(phenomenonProps);
        break;
      case SchemaItemType.UnitSystem:
        schemaItem = await (schema as MutableSchema).createUnitSystem(name);
        await schemaItem.fromJSON(this._parser.parseUnitSystem(schemaItemObject));
        break;
      case SchemaItemType.PropertyCategory:
        schemaItem = await (schema as MutableSchema).createPropertyCategory(name);
        const propertyCategoryProps = this._parser.parsePropertyCategory(schemaItemObject);
        await schemaItem.fromJSON(propertyCategoryProps);
        break;
      case SchemaItemType.Enumeration:
        schemaItem = await (schema as MutableSchema).createEnumeration(name);
        const enumerationProps = this._parser.parseEnumeration(schemaItemObject);
        await schemaItem.fromJSON(enumerationProps);
        break;
      // NOTE: we are being permissive here and allowing unknown types to silently fail. Not sure if we want to hard fail or just do a basic deserialization
    }

    return schemaItem;
  }

  /**
   * Given the schema item object, the anticipated type and the name a schema item is created and loaded into the schema provided.
   * @param schema The Schema the SchemaItem to.
   * @param name The name of the schema item to be loaded.
   * @param itemType The SchemaItemType of the item to load.
   * @param schemaItemObject The Object to populate the SchemaItem with.
   */
  private loadSchemaItemSync(schema: Schema, name: string, itemType: string, schemaItemObject: Readonly<unknown>): SchemaItem | undefined {
    let schemaItem: AnySchemaItem | undefined;

    switch (parseSchemaItemType(itemType)) {
      case SchemaItemType.EntityClass:
        schemaItem = (schema as MutableSchema).createEntityClassSync(name);
        this.loadEntityClassSync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.StructClass:
        schemaItem = (schema as MutableSchema).createStructClassSync(name);
        const structProps = this._parser.parseStructClass(schemaItemObject);
        this.loadClassSync(schemaItem, structProps, schemaItemObject);
        break;
      case SchemaItemType.Mixin:
        schemaItem = (schema as MutableSchema).createMixinClassSync(name);
        this.loadMixinSync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.CustomAttributeClass:
        schemaItem = (schema as MutableSchema).createCustomAttributeClassSync(name);
        const caClassProps = this._parser.parseCustomAttributeClass(schemaItemObject);
        this.loadClassSync(schemaItem, caClassProps, schemaItemObject);
        break;
      case SchemaItemType.RelationshipClass:
        schemaItem = (schema as MutableSchema).createRelationshipClassSync(name);
        this.loadRelationshipClassSync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.KindOfQuantity:
        schemaItem = (schema as MutableSchema).createKindOfQuantitySync(name);
        this.loadKindOfQuantitySync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Unit:
        schemaItem = (schema as MutableSchema).createUnitSync(name);
        this.loadUnitSync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Constant:
        schemaItem = (schema as MutableSchema).createConstantSync(name);
        this.loadConstantSync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.InvertedUnit:
        schemaItem = (schema as MutableSchema).createInvertedUnitSync(name);
        this.loadInvertedUnitSync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Format:
        schemaItem = (schema as MutableSchema).createFormatSync(name);
        this.loadFormatSync(schemaItem, schemaItemObject);
        break;
      case SchemaItemType.Phenomenon:
        schemaItem = (schema as MutableSchema).createPhenomenonSync(name);
        const phenomenonProps = this._parser.parsePhenomenon(schemaItemObject);
        schemaItem.fromJSONSync(phenomenonProps);
        break;
      case SchemaItemType.UnitSystem:
        schemaItem = (schema as MutableSchema).createUnitSystemSync(name);
        schemaItem.fromJSONSync(this._parser.parseUnitSystem(schemaItemObject));
        break;
      case SchemaItemType.PropertyCategory:
        schemaItem = (schema as MutableSchema).createPropertyCategorySync(name);
        const propertyCategoryProps = this._parser.parsePropertyCategory(schemaItemObject);
        schemaItem.fromJSONSync(propertyCategoryProps);
        break;
      case SchemaItemType.Enumeration:
        schemaItem = (schema as MutableSchema).createEnumerationSync(name);
        const enumerationProps = this._parser.parseEnumeration(schemaItemObject);
        schemaItem.fromJSONSync(enumerationProps);
        break;
      // NOTE: we are being permissive here and allowing unknown types to silently fail. Not sure if we want to hard fail or just do a basic deserialization
    }
    return schemaItem;
  }

  /**
   * Given the full (Schema.ItemName) or qualified (alias:ItemName) item name, returns
   * a tuple of strings in the format ["SchemaName", "ItemName"]. The schema name may be
   * empty if the item comes from the schema being parsed.
   * @param fullOrQualifiedName The full or qualified name of the schema item.
   * @param schema The schema that will be used to lookup the schema name by alias, if necessary.
   */
  private static resolveSchemaAndItemName(fullOrQualifiedName: string, schema?: Schema): [string, string] {
    const [schemaName, itemName] = SchemaItem.parseFullName(fullOrQualifiedName);

    // If a schema is provided we attempt to resolve the alias by looking at the reference schemas.
    if (undefined !== schema && -1 !== fullOrQualifiedName.indexOf(":")) {
      const refName = schema.getReferenceNameByAlias(schemaName);
      if (undefined === refName)
        throw new ECObjectsError(ECObjectsStatus.UnableToLocateSchema, `Could not resolve schema alias '${schemaName}' for schema item '${itemName}.`);
      return [refName, itemName];
    }

    return [schemaName, itemName];
  }

  /**
   * Finds the a SchemaItem matching the name first by checking the schema that is being deserialized. If it does
   * not exist within the schema, the SchemaContext will be searched.
   * @param name The full (Schema.ItemName) or qualified (alias:ItemName) name of the SchemaItem to search for.
   * @param skipVisitor Used to break Mixin -appliesTo-> Entity -extends-> Mixin cycle.
   * @param loadCallBack Only called if the SchemaItem had to be loaded.
   * @return The SchemaItem if it had to be loaded, otherwise undefined.
   */
  private async findSchemaItem(name: string, skipVisitor = false, loadCallBack?: (item: SchemaItem) => void): Promise<SchemaItem | undefined> {
    let schemaItem: SchemaItem | undefined;
    // TODO: A better solution should be investigated for handling both an alias and the schema name.
    const [schemaName, itemName] = SchemaReadHelper.resolveSchemaAndItemName(name, this._schema);
    const isInThisSchema = (this._schema && this._schema.name.toLowerCase() === schemaName.toLowerCase());

    if (undefined === schemaName || 0 === schemaName.length)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${name} is invalid without a schema name`);

    if (isInThisSchema && undefined === await this._schema!.getItem(itemName)) {
      const foundItem = this._parser.findItem(itemName);
      if (foundItem) {
        schemaItem = await this.loadSchemaItem(this._schema!, ...foundItem);
        if (!skipVisitor && schemaItem && this._visitorHelper) {
          await this._visitorHelper.visitSchemaPart(schemaItem);
        }
        if (loadCallBack && schemaItem)
          loadCallBack(schemaItem);

        return schemaItem;
      }
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate SchemaItem ${name}.`);
    }

    schemaItem = await this._context.getSchemaItem(new SchemaItemKey(itemName, new SchemaKey(schemaName)));
    if (undefined === schemaItem)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate SchemaItem ${name}.`);

    return schemaItem;
  }

  /**
   * Finds the a SchemaItem matching the name first by checking the schema that is being deserialized. If it does
   * not exist within the schema, the SchemaContext will be searched.
   * @param name The full (Schema.ItemName) or qualified (alias:ItemName) name of the SchemaItem to search for.
   * @param skipVisitor Used to break Mixin -appliesTo-> Entity -extends-> Mixin cycle.
   * @param loadCallBack Only called if the SchemaItem had to be loaded.
   * @return The SchemaItem if it had to be loaded, otherwise undefined.
   */
  private findSchemaItemSync(name: string, skipVisitor = false, loadCallBack?: (item: SchemaItem) => void): SchemaItem | undefined {
    let schemaItem: SchemaItem | undefined;
    // TODO: A better solution should be investigated for handling both an alias and the schema name.
    const [schemaName, itemName] = SchemaReadHelper.resolveSchemaAndItemName(name, this._schema);
    const isInThisSchema = (this._schema && this._schema.name.toLowerCase() === schemaName.toLowerCase());

    if (undefined === schemaName || schemaName.length === 0)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${name} is invalid without a schema name`);

    if (isInThisSchema && undefined === this._schema!.getItemSync(itemName)) {
      const foundItem = this._parser.findItem(itemName);
      if (foundItem) {
        schemaItem = this.loadSchemaItemSync(this._schema!, ...foundItem);
        if (!skipVisitor && schemaItem && this._visitorHelper) {
          this._visitorHelper.visitSchemaPartSync(schemaItem);
        }
        if (loadCallBack && schemaItem)
          loadCallBack(schemaItem);

        return schemaItem;
      }
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate SchemaItem ${name}.`);
    }

    schemaItem = this._context.getSchemaItemSync(new SchemaItemKey(itemName, new SchemaKey(schemaName)));
    if (undefined === schemaItem)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate SchemaItem ${name}.`);

    return schemaItem;
  }

  /**
   * Load dependencies on phenomenon and unitSystem for a Unit object and load the Unit from its serialized format.
   * @param unit The Unit object that we are loading dependencies for and "deserializing into".
   * @param rawUnit The serialized unit data
   */
  private async loadUnit(unit: Unit, rawUnit: Readonly<unknown>): Promise<void> {
    const unitProps = this._parser.parseUnit(rawUnit);

    await this.findSchemaItem(unitProps.phenomenon, true);
    await this.findSchemaItem(unitProps.unitSystem, true);

    await unit.fromJSON(unitProps);
  }

  /**
   * Load dependencies on phenomenon and unitSystem for a Unit object and load the Unit from its serialized format.
   * @param unit The Unit object that we are loading dependencies for and "deserializing into".
   * @param rawUnit The serialized unit data
   */
  private loadUnitSync(unit: Unit, rawUnit: Readonly<unknown>) {
    const unitProps = this._parser.parseUnit(rawUnit);

    this.findSchemaItemSync(unitProps.phenomenon, true);
    this.findSchemaItemSync(unitProps.unitSystem, true);

    unit.fromJSONSync(unitProps);
  }

  /**
   * Load the persistence unit and presentation unit dependencies for a KindOfQuantity object and load the KoQ from its serialized format.
   * @param koq The KindOfQuantity object that we are loading dependencies for and "deserializing into".
   * @param rawKoQ The serialized kind of quantity data
   */
  private async loadKindOfQuantity(koq: KindOfQuantity, rawKoQ: Readonly<unknown>): Promise<void> {
    const koqProps = this._parser.parseKindOfQuantity(rawKoQ);
    await this.findSchemaItem(koqProps.persistenceUnit);

    if (undefined !== koqProps.presentationUnits) {
      for (const formatString of koqProps.presentationUnits) {
        for (const name of getItemNamesFromFormatString(formatString)) {
          await this.findSchemaItem(name);
        }
      }
    }

    await koq.fromJSON(koqProps);
  }

  /**
   * Load the persistence unit and presentation unit dependencies for a KindOfQuantity object and load the KoQ from its serialized format.
   * @param koq The KindOfQuantity object that we are loading dependencies for and "deserializing into".
   * @param rawKoQ The serialized kind of quantity data
   */
  private loadKindOfQuantitySync(koq: KindOfQuantity, rawKoQ: Readonly<unknown>) {
    const koqProps = this._parser.parseKindOfQuantity(rawKoQ);
    this.findSchemaItemSync(koqProps.persistenceUnit);

    if (undefined !== koqProps.presentationUnits) {
      for (const formatString of koqProps.presentationUnits) {
        for (const name of getItemNamesFromFormatString(formatString)) {
          this.findSchemaItemSync(name);
        }
      }
    }
    koq.fromJSONSync(koqProps);
  }

  /**
   * Load the phenomenon dependency for a Constant object and load the Constant from its serialized format.
   * @param constant The Constant object that we are loading the phenomenon dependency for
   * @param rawConstant The serialized constant data
   */
  private async loadConstant(constant: Constant, rawConstant: Readonly<unknown>): Promise<void> {
    const constantProps = this._parser.parseConstant(rawConstant);

    await this.findSchemaItem(constantProps.phenomenon, true);
    await constant.fromJSON(constantProps);
  }

  /**
   * Load the phenomenon dependency for a Constant object and load the Constant from its serialized format.
   * @param constant The Constant object that we are loading dependencies for and "deserializing into".
   * @param rawConstant The serialized constant data
   */
  private loadConstantSync(constant: Constant, rawConstant: Readonly<unknown>) {
    const constantProps = this._parser.parseConstant(rawConstant);

    this.findSchemaItemSync(constantProps.phenomenon, true);
    constant.fromJSONSync(constantProps);
  }

  /**
   * Load the unit system and invertsUnit dependencies for an Inverted Unit object and load the Inverted Unit from its serialized format.
   * @param invertedUnit The InvertedUnit object that we are loading dependencies for and "deserializing into".
   * @param rawInvertedUnit The serialized inverted unit data.
   */
  private async loadInvertedUnit(invertedUnit: InvertedUnit, rawInvertedUnit: Readonly<unknown>): Promise<void> {
    const invertedUnitProps = this._parser.parseInvertedUnit(rawInvertedUnit);

    await this.findSchemaItem(invertedUnitProps.invertsUnit, true);
    await this.findSchemaItem(invertedUnitProps.unitSystem, true);

    await invertedUnit.fromJSON(invertedUnitProps);
  }

  /**
   * Load the unit system and invertsUnit dependencies for an Inverted Unit object and load the Inverted Unit from its serialized format.
   * @param invertedUnit The InvertedUnit object that we are loading dependencies for and "deserializing into".
   * @param rawInvertedUnit The serialized inverted unit data.
   */
  private loadInvertedUnitSync(invertedUnit: InvertedUnit, rawInvertedUnit: Readonly<unknown>) {
    const invertedUnitProps = this._parser.parseInvertedUnit(rawInvertedUnit);

    this.findSchemaItemSync(invertedUnitProps.invertsUnit, true);
    this.findSchemaItemSync(invertedUnitProps.unitSystem, true);

    invertedUnit.fromJSONSync(invertedUnitProps);
  }

  /**
   * Load the unit dependencies for a Format object and load the Format from its serialized format.
   * @param format The Format object that we are loading dependencies for and "deserializing into".
   * @param rawFormat The serialized format data.
   */
  private async loadFormat(format: Format, rawFormat: Readonly<unknown>): Promise<void> {
    const formatProps = this._parser.parseFormat(rawFormat);

    if (undefined !== formatProps.composite) {
      const formatUnits = formatProps.composite.units;
      for (const unit of formatUnits) {
        await this.findSchemaItem(unit.name, true);
      }
    }
    await format.fromJSON(formatProps);
  }

  /**
   * Load the unit dependencies for a Format object and load the Format from its serialized format.
   * @param format The Format object that we are loading dependencies for and "deserializing into".
   * @param rawFormat The serialized format data.
   */
  private loadFormatSync(format: Format, rawFormat: Readonly<unknown>) {
    const formatProps = this._parser.parseFormat(rawFormat);

    if (undefined !== formatProps.composite) {
      const formatUnits = formatProps.composite.units;
      for (const unit of formatUnits) {
        this.findSchemaItemSync(unit.name, true);
      }
    }

    format.fromJSONSync(formatProps);
  }

  /**
   * Load the base class and property type dependencies for an ECClass object and load the ECClass (and its properties) from its serialized format.
   * @param classObj The ECClass object that we are loading dependencies for and "deserializing into".
   * @param classProps The parsed class props object.
   * @param rawClass The serialized class data.
   */
  private async loadClass(classObj: AnyClass, classProps: ClassProps, rawClass: Readonly<unknown>): Promise<void> {
    const baseClassLoaded = async (baseClass: SchemaItem) => {
      if (this._visitorHelper)
        await this._visitorHelper.visitSchemaPart(baseClass);
    };

    // Load base class first
    if (undefined !== classProps.baseClass) {
      await this.findSchemaItem(classProps.baseClass, true, baseClassLoaded);
    }

    // Now deserialize the class itself, *before* any properties
    // (We need to do this to break Entity -navProp-> Relationship -constraint-> Entity cycle.)
    await (classObj as ECClass).fromJSON(classProps);

    for (const [propName, propType, rawProp] of this._parser.getProperties(rawClass)) {
      await this.loadPropertyTypes(classObj, propName, propType, rawProp);
    }

    await this.loadCustomAttributes(classObj, this._parser.getClassCustomAttributeProviders(rawClass));
  }

  /**
   * Load the base class and property type dependencies for an ECClass object and load the ECClass (and its properties) from its serialized format.
   * @param classObj The ECClass object that we are loading dependencies for and "deserializing into".
   * @param classProps The parsed class props object.
   * @param rawClass The serialized class data.
   */
  private loadClassSync(classObj: AnyClass, classProps: ClassProps, rawClass: Readonly<unknown>): void {
    const baseClassLoaded = async (baseClass: SchemaItem) => {
      if (this._visitorHelper)
        this._visitorHelper.visitSchemaPartSync(baseClass);
    };

    // Load base class first
    if (undefined !== classProps.baseClass) {
      this.findSchemaItemSync(classProps.baseClass, true, baseClassLoaded);
    }

    // Now deserialize the class itself, *before* any properties
    // (We need to do this to break Entity -navProp-> Relationship -constraint-> Entity cycle.)
    (classObj as ECClass).fromJSONSync(classProps);

    for (const [propName, propType, rawProp] of this._parser.getProperties(rawClass)) {
      this.loadPropertyTypesSync(classObj, propName, propType, rawProp);
    }

    this.loadCustomAttributesSync(classObj, this._parser.getClassCustomAttributeProviders(rawClass));
  }

  /**
   * Load the mixin, base class, and property type dependencies for an EntityClass object and load the EntityClass (and properties) from its serialized format.
   * @param entity The EntityClass that we are loading dependencies for and "deserializing into".
   * @param rawEntity The serialized entity class data.
   */
  private async loadEntityClass(entity: EntityClass, rawEntity: Readonly<unknown>): Promise<void> {
    const entityClassProps = this._parser.parseEntityClass(rawEntity);

    // Load Mixin classes first
    if (undefined !== entityClassProps.mixins) {
      for (const mixinName of entityClassProps.mixins)
        await this.findSchemaItem(mixinName);
    }

    await this.loadClass(entity, entityClassProps, rawEntity);
  }

  /**
   * Load the mixin, base class, and property type dependencies for an EntityClass object and load the EntityClass (and properties) from its serialized format.
   * @param entity The EntityClass that we are loading dependencies for and "deserializing into".
   * @param rawEntity The serialized entity class data.
   */
  private loadEntityClassSync(entity: EntityClass, rawEntity: Readonly<unknown>): void {
    const entityClassProps = this._parser.parseEntityClass(rawEntity);

    // Load Mixin classes first
    if (undefined !== entityClassProps.mixins) {
      for (const mixinName of entityClassProps.mixins)
        this.findSchemaItemSync(mixinName);
    }

    this.loadClassSync(entity, entityClassProps, rawEntity);
  }

  /**
   * Load the appliesTo class, base class, and property type dependencies for a Mixin object and load the Mixin (and properties) from its serialized format.
   * @param mixin The Mixin that we are loading dependencies for and "deserializing into".
   * @param rawMixin The serialized mixin data.
   */
  private async loadMixin(mixin: Mixin, rawMixin: Readonly<unknown>): Promise<void> {
    const mixinProps = this._parser.parseMixin(rawMixin);

    const appliesToLoaded = async (appliesToClass: SchemaItem) => {
      if (this._visitorHelper)
        await this._visitorHelper.visitSchemaPart(appliesToClass);
    };

    await this.findSchemaItem(mixinProps.appliesTo, true, appliesToLoaded);

    await this.loadClass(mixin, mixinProps, rawMixin);
  }

  /**
   * Load the appliesTo class, base class, and property type dependencies for a Mixin object and load the Mixin (and properties) from its serialized format.
   * @param mixin The Mixin that we are loading dependencies for and "deserializing into".
   * @param rawMixin The serialized mixin data.
   */
  private loadMixinSync(mixin: Mixin, rawMixin: Readonly<unknown>): void {
    const mixinProps = this._parser.parseMixin(rawMixin);

    const appliesToLoaded = async (appliesToClass: SchemaItem) => {
      if (this._visitorHelper)
        await this._visitorHelper.visitSchemaPart(appliesToClass);
    };

    this.findSchemaItemSync(mixinProps.appliesTo, true, appliesToLoaded);

    this.loadClassSync(mixin, mixinProps, rawMixin);
  }

  /**
   * Load the relationship constraint, base class, and property type dependencies for a RelationshipClass object and load the RelationshipClass (and properties) from its serialized format.
   * @param rel The RelationshipClass that we are loading dependencies for and "deserializing into".
   * @param rawRel The serialized relationship class data.
   */
  private async loadRelationshipClass(rel: RelationshipClass, rawRel: Readonly<unknown>): Promise<void> {
    const relationshipClassProps = this._parser.parseRelationshipClass(rawRel);
    await this.loadClass(rel, relationshipClassProps, rawRel);
    await this.loadRelationshipConstraint(rel.source, relationshipClassProps.source);
    await this.loadRelationshipConstraint(rel.target, relationshipClassProps.target);

    const [sourceCustomAttributes, targetCustomAttributes] = this._parser.getRelationshipConstraintCustomAttributeProviders(rawRel);
    await this.loadCustomAttributes(rel.source, sourceCustomAttributes);
    await this.loadCustomAttributes(rel.target, targetCustomAttributes);
  }

  /**
   * Load the relationship constraint, base class, and property type dependencies for a RelationshipClass object and load the RelationshipClass (and properties) from its serialized format.
   * @param rel The RelationshipClass that we are loading dependencies for and "deserializing into".
   * @param rawRel The serialized relationship class data.
   */
  private loadRelationshipClassSync(rel: RelationshipClass, rawRel: Readonly<unknown>): void {
    const relationshipClassProps = this._parser.parseRelationshipClass(rawRel);
    this.loadClassSync(rel, relationshipClassProps, rawRel);
    this.loadRelationshipConstraintSync(rel.source, relationshipClassProps.source);
    this.loadRelationshipConstraintSync(rel.target, relationshipClassProps.target);

    const [sourceCustomAttributes, targetCustomAttributes] = this._parser.getRelationshipConstraintCustomAttributeProviders(rawRel);
    this.loadCustomAttributesSync(rel.source, sourceCustomAttributes);
    this.loadCustomAttributesSync(rel.target, targetCustomAttributes);
  }

  /**
   * Load the abstract constraint and constraint class dependencies for a RelationshipConstraint object and load the RelationshipConstraint from its parsed props.
   * @param relConstraint The RelationshipConstraint that we are loading dependencies for and "deserializing into".
   * @param props The parsed relationship constraint props.
   */
  private async loadRelationshipConstraint(relConstraint: RelationshipConstraint, props: RelationshipConstraintProps): Promise<void> {
    if (undefined !== props.abstractConstraint) {
      await this.findSchemaItem(props.abstractConstraint);
    }
    if (undefined !== props.constraintClasses) { // TODO: this should be required
      for (const constraintClass of props.constraintClasses) {
        await this.findSchemaItem(constraintClass);
      }
    }
    await relConstraint.fromJSON(props);
  }

  /**
   * Load the abstract constraint and constraint class dependencies for a RelationshipConstraint object and load the RelationshipConstraint from its parsed props.
   * @param relConstraint The RelationshipConstraint that we are loading dependencies for and "deserializing into".
   * @param props The parsed relationship constraint props.
   */
  private loadRelationshipConstraintSync(relConstraint: RelationshipConstraint, props: RelationshipConstraintProps): void {
    if (undefined !== props.abstractConstraint) {
      this.findSchemaItemSync(props.abstractConstraint);
    }
    if (undefined !== props.constraintClasses) {
      for (const constraintClass of props.constraintClasses) {
        this.findSchemaItemSync(constraintClass);
      }
    }

    relConstraint.fromJSONSync(props);
  }

  /**
   * Load the type dependencies for a serialized property, then creates and deserialized the Property object in the given ECClass.
   * @param classObj The ECClass that the Property should be created in.
   * @param propName The name of the Property.
   * @param propType The (serialized string) kind of property to create.
   * @param rawProperty The serialized property data.
   */
  private async loadPropertyTypes(classObj: AnyClass, propName: string, propType: string, rawProperty: Readonly<unknown>): Promise<void> {

    const loadTypeName = async (typeName: string) => {
      if (undefined === parsePrimitiveType(typeName))
        await this.findSchemaItem(typeName);
    };

    const lowerCasePropType = propType.toLowerCase();

    switch (lowerCasePropType) {
      case "primitiveproperty":
        const primPropertyProps = this._parser.parsePrimitiveProperty(rawProperty);
        await loadTypeName(primPropertyProps.typeName);
        const primProp = await (classObj as MutableClass).createPrimitiveProperty(propName, primPropertyProps.typeName);
        return this.loadProperty(primProp, primPropertyProps, rawProperty);

      case "structproperty":
        const structPropertyProps = this._parser.parseStructProperty(rawProperty);
        await loadTypeName(structPropertyProps.typeName);
        const structProp = await (classObj as MutableClass).createStructProperty(propName, structPropertyProps.typeName);
        return this.loadProperty(structProp, structPropertyProps, rawProperty);

      case "primitivearrayproperty":
        const primArrPropertyProps = this._parser.parsePrimitiveArrayProperty(rawProperty);
        await loadTypeName(primArrPropertyProps.typeName);
        const primArrProp = await (classObj as MutableClass).createPrimitiveArrayProperty(propName, primArrPropertyProps.typeName);
        return this.loadProperty(primArrProp, primArrPropertyProps, rawProperty);

      case "structarrayproperty":
        const structArrPropertyProps = this._parser.parseStructArrayProperty(rawProperty);
        await loadTypeName(structArrPropertyProps.typeName);
        const structArrProp = await (classObj as MutableClass).createStructArrayProperty(propName, structArrPropertyProps.typeName);
        return this.loadProperty(structArrProp, structArrPropertyProps, rawProperty);

      case "navigationproperty":
        if (classObj.schemaItemType !== SchemaItemType.EntityClass && classObj.schemaItemType !== SchemaItemType.RelationshipClass && classObj.schemaItemType !== SchemaItemType.Mixin)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Navigation Property ${classObj.name}.${propName} is invalid, because only EntityClasses, Mixins, and RelationshipClasses can have NavigationProperties.`);

        const navPropertyProps = this._parser.parseNavigationProperty(rawProperty);
        await this.findSchemaItem(navPropertyProps.relationshipName);
        const navProp = await (classObj as MutableEntityClass).createNavigationProperty(propName, navPropertyProps.relationshipName, navPropertyProps.direction);
        return this.loadProperty(navProp, navPropertyProps, rawProperty);
    }
  }

  /**
   * Load the type dependencies for a serialized property, then creates and deserialized the Property object in the given ECClass.
   * @param classObj The ECClass that the Property should be created in.
   * @param propName The name of the Property.
   * @param propType The (serialized string) kind of property to create.
   * @param rawProperty The serialized property data.
   */
  private loadPropertyTypesSync(classObj: AnyClass, propName: string, propType: string, rawProperty: Readonly<unknown>): void {
    const loadTypeName = (typeName: string) => {
      if (undefined === parsePrimitiveType(typeName))
        this.findSchemaItemSync(typeName);
    };

    const lowerCasePropType = propType.toLowerCase();

    switch (lowerCasePropType) {
      case "primitiveproperty":
        const primPropertyProps = this._parser.parsePrimitiveProperty(rawProperty);
        loadTypeName(primPropertyProps.typeName);
        const primProp = (classObj as MutableClass).createPrimitivePropertySync(propName, primPropertyProps.typeName);
        return this.loadPropertySync(primProp, primPropertyProps, rawProperty);

      case "structproperty":
        const structPropertyProps = this._parser.parseStructProperty(rawProperty);
        loadTypeName(structPropertyProps.typeName);
        const structProp = (classObj as MutableClass).createStructPropertySync(propName, structPropertyProps.typeName);
        return this.loadPropertySync(structProp, structPropertyProps, rawProperty);

      case "primitivearrayproperty":
        const primArrPropertyProps = this._parser.parsePrimitiveArrayProperty(rawProperty);
        loadTypeName(primArrPropertyProps.typeName);
        const primArrProp = (classObj as MutableClass).createPrimitiveArrayPropertySync(propName, primArrPropertyProps.typeName);
        return this.loadPropertySync(primArrProp, primArrPropertyProps, rawProperty);

      case "structarrayproperty":
        const structArrPropertyProps = this._parser.parseStructArrayProperty(rawProperty);
        loadTypeName(structArrPropertyProps.typeName);
        const structArrProp = (classObj as MutableClass).createStructArrayPropertySync(propName, structArrPropertyProps.typeName);
        return this.loadPropertySync(structArrProp, structArrPropertyProps, rawProperty);

      case "navigationproperty":
        if (classObj.schemaItemType !== SchemaItemType.EntityClass && classObj.schemaItemType !== SchemaItemType.RelationshipClass && classObj.schemaItemType !== SchemaItemType.Mixin)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Navigation Property ${classObj.name}.${propName} is invalid, because only EntityClasses, Mixins, and RelationshipClasses can have NavigationProperties.`);

        const navPropertyProps = this._parser.parseNavigationProperty(rawProperty);
        this.findSchemaItemSync(navPropertyProps.relationshipName);
        const navProp = (classObj as MutableEntityClass).createNavigationPropertySync(propName, navPropertyProps.relationshipName, navPropertyProps.direction);
        return this.loadPropertySync(navProp, navPropertyProps, rawProperty);
    }
  }

  /**
   * Load the propertyCategory, kindOfQuantity, and customAttribute dependencies for a Property object and load the Property from its parsed props.
   * @param propertyObj The Property that we are loading dependencies for and "deserializing into".
   * @param props The parsed property props.
   * @param rawProperty The serialized property data.
   */
  private async loadProperty<U extends Property>(propertyObj: U, props: PropertyProps, rawProperty: Readonly<unknown>): Promise<void> {
    if (undefined !== props.category) {
      await this.findSchemaItem(props.category);
    }

    if (undefined !== props.kindOfQuantity) {
      await this.findSchemaItem(props.kindOfQuantity);
    }

    await propertyObj.fromJSON(props);
    await this.loadCustomAttributes(propertyObj, this._parser.getPropertyCustomAttributeProviders(rawProperty));
  }

  /**
   * Load the propertyCategory, kindOfQuantity, and customAttribute dependencies for a Property object and load the Property from its parsed props.
   * @param propertyObj The Property that we are loading dependencies for and "deserializing into".
   * @param props The parsed property props.
   * @param rawProperty The serialized property data.
   */
  private loadPropertySync<U extends Property>(propertyObj: U, props: PropertyProps, rawProperty: Readonly<unknown>): void {
    if (undefined !== props.category) {
      this.findSchemaItemSync(props.category);
    }

    if (undefined !== props.kindOfQuantity) {
      this.findSchemaItemSync(props.kindOfQuantity);
    }

    propertyObj.fromJSONSync(props);
    this.loadCustomAttributesSync(propertyObj, this._parser.getPropertyCustomAttributeProviders(rawProperty));
  }

  /**
   * Load the customAttribute class dependencies for a set of CustomAttribute objects and add
   * them to a given custom attribute container.
   * @param container The CustomAttributeContainer that each CustomAttribute will be added to.
   * @param customAttributes An iterable set of parsed CustomAttribute objects.
   */
  private async loadCustomAttributes(container: AnyCAContainer, caProviders: Iterable<CAProviderTuple>): Promise<void> {
    for (const providerTuple of caProviders) {
      // First tuple entry is the CA class name.
      const caClass = await this.findSchemaItem(providerTuple[0]) as CustomAttributeClass;

      // Second tuple entry ia a function that provides the CA instance.
      const provider = providerTuple[1];
      const customAttribute = provider(caClass);
      (container as AnyMutableCAContainer).addCustomAttribute(customAttribute);
    }
  }

  /**
   * Load the customAttribute class dependencies for a set of CustomAttribute objects and add them to a given custom attribute container.
   * @param container The CustomAttributeContainer that each CustomAttribute will be added to.
   * @param customAttributes An iterable set of parsed CustomAttribute objects.
   */
  private loadCustomAttributesSync(container: AnyCAContainer, caProviders: Iterable<CAProviderTuple>): void {
    for (const providerTuple of caProviders) {
      // First tuple entry is the CA class name.
      const caClass = this.findSchemaItemSync(providerTuple[0]) as CustomAttributeClass;

      // Second tuple entry ia a function that provides the CA instance.
      const provider = providerTuple[1];
      const customAttribute = provider(caClass);
      (container as AnyMutableCAContainer).addCustomAttribute(customAttribute);
    }
  }
}
