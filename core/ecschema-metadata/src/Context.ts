/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { SchemaMatchType } from "./ECObjects";
import { ECObjectsError, ECObjectsStatus } from "./Exception";
import { MutableSchema, Schema } from "./Metadata/Schema";
import { SchemaItem } from "./Metadata/SchemaItem";
import { SchemaItemKey, SchemaKey } from "./SchemaKey";

interface LoadingSchema {
  schema: Schema;
  loadSchema?: Promise<Schema>;
  loadSchemaFunc?: () => Promise<Schema>;
}

/**
 * @beta
 */
export class LoadedSchemas extends Array<Schema> { }
export class LoadingSchemas extends Array<LoadingSchema> { }

/**
 * The interface defines what is needed to be a ISchemaLocater, which are used in a SchemaContext.
 * @beta
 */
export interface ISchemaLocater {

  /**
   * Attempts to get a schema from the locater. Yields undefined if no matching schema is found.
   * For schemas that may have references, construct and call through a SchemaContext instead.
   * @param schemaKey key to look up
   * @param matchType how to match key against candidate schemas
   * @param context optional context for loading schema references
   */
  getSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context?: SchemaContext): Promise<T | undefined>;

  /**
   * Attempts to get a schema from the locater. Yields undefined if no matching schema is found.
   * For schemas that may have references, construct and call through a SchemaContext instead.
   * @param schemaKey key to look up
   * @param matchType how to match key against candidate schemas
   * @param context optional context for loading schema references
   */
  getSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context?: SchemaContext): T | undefined;

  getLoadingSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context?: SchemaContext): Promise<T | undefined>;

  getLoadingSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context?: SchemaContext): T | undefined;
}

/**
 * @beta
 */
export interface ISchemaItemLocater {
  getSchemaItem<T extends SchemaItem>(schemaItemKey: SchemaItemKey): Promise<T | undefined>;
}

/**
 * @beta
 */
export class SchemaCache implements ISchemaLocater {
  private _loadedSchemas: LoadedSchemas;
  private _loadingSchemas: LoadingSchemas;

  constructor() {
    this._loadedSchemas = new LoadedSchemas();
    this._loadingSchemas = new LoadingSchemas(); /* will have schema references, but not completely loaded */
  }

  public get count() { return this._loadedSchemas.length + this._loadingSchemas.length; }

  /**
   * Adds a schema to the cache. Does not allow for duplicate schemas, checks using SchemaMatchType.Latest.
   * @param schema The schema to add to the cache.
   * @param loadSchema Promise that resolves when the schema has been completely loaded
   */
  public async addSchema<T extends Schema>(schema: T, loadSchema?: () => Promise<T>) {
    this.addSchemaSync(schema, loadSchema);
  }

  /**
   * Adds a schema to the cache. Does not allow for duplicate schemas, checks using SchemaMatchType.Latest.
   * @param schema The schema to add to the cache.
   */
  public addSchemaSync<T extends Schema>(schema: T, loadSchema?: () => Promise<T>) {
    if (this.getLoadingSchemaSync<T>(schema.schemaKey))
      throw new ECObjectsError(ECObjectsStatus.DuplicateSchema, `The schema, ${schema.schemaKey.toString()}, already exists within this cache.`);

    if (loadSchema)
      this._loadingSchemas.push({ schema, loadSchemaFunc: loadSchema });
    else
      this._loadedSchemas.push(schema);
  }

  public async checkAndAddSchema<T extends Schema>(schema: T, loadSchema: () => Promise<T>) {
    this.checkAndAddSchemaSync(schema, loadSchema);
  }

  public checkAndAddSchemaSync<T extends Schema>(schema: T, loadSchema: () => Promise<T>) {
    if (!this.getLoadingSchemaSync<T>(schema.schemaKey))
      this._loadingSchemas.push({ schema, loadSchemaFunc: loadSchema });
  }

  /**
   * Gets the loaded schema which matches the provided SchemaKey.
   * @param schemaKey The SchemaKey describing the schema to get from the cache.
   * @param matchType The match type to use when locating the schema
   */
  public async getSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): Promise<T | undefined> {
    if (this.count === 0)
      return undefined;

    const findLoadedSchema = (schema: Schema) => {
      return schema.schemaKey.matches(schemaKey, matchType);
    };

    const loadedSchema = this._loadedSchemas.find(findLoadedSchema);
    if (loadedSchema)
      return loadedSchema as T;

    const findLoadingSchema = (currSchema: LoadingSchema) => {
      return currSchema.schema.schemaKey.matches(schemaKey, matchType);
    };

    const loadingSchema = this._loadingSchemas.find(findLoadingSchema);
    if (loadingSchema?.loadSchema) {
      const schema = await loadingSchema.loadSchema;
      if (!this._loadedSchemas.find(findLoadedSchema)) {
        // Add the schema to _loadedSchemas and remove it from _loadingSchemas
        this._loadedSchemas.push(schema);
        const loadingSchemaIndex = this._loadingSchemas.findIndex(findLoadingSchema);
        if (loadingSchemaIndex !== -1)
          this._loadingSchemas.splice(loadingSchemaIndex, 1);
      }

      return schema as T;
    }

    if (loadingSchema?.loadSchemaFunc) {
      loadingSchema.loadSchema = loadingSchema.loadSchemaFunc();
      const schema = await loadingSchema.loadSchema;
      if (!this._loadedSchemas.find(findLoadedSchema)) {
        this._loadedSchemas.push(schema);
        const loadingSchemaIndex = this._loadingSchemas.findIndex(findLoadingSchema);
        if (loadingSchemaIndex !== -1)
          this._loadingSchemas.splice(loadingSchemaIndex, 1);
      }
      return schema as T;
    }

    return undefined;
  }

  /**
   * Gets the loaded schema which matches the provided SchemaKey.
   * @param schemaKey The SchemaKey describing the schema to get from the cache.
   * @param matchType The match type to use when locating the schema
   */
  public getSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): T | undefined {
    if (this.count === 0)
      return undefined;

    const findLoadedSchema = (schema: Schema) => {
      return schema.schemaKey.matches(schemaKey, matchType);
    };

    const loadedSchema = this._loadedSchemas.find(findLoadedSchema);

    if (loadedSchema)
      return loadedSchema as T;

    return undefined;
  }

  /**
   * Gets the loaded or loading schema which matches the provided SchemaKey.
   * @param schemaKey The SchemaKey describing the schema to get from the cache.
   * @param matchType The match type to use when locating the schema
   */
  public async getLoadingSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): Promise<T | undefined> {
    return this.getLoadingSchemaSync(schemaKey, matchType) as T;
  }

  /**
   * Gets the loaded or loading schema which matches the provided SchemaKey.
   * @param schemaKey The SchemaKey describing the schema to get from the cache.
   * @param matchType The match type to use when locating the schema
   */
  public getLoadingSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): T | undefined {
    if (this.count === 0)
      return undefined;

    const findLoadedSchema = (schema: Schema) => {
      return schema.schemaKey.matches(schemaKey, matchType);
    };

    const loadedSchema = this._loadedSchemas.find(findLoadedSchema);
    if (loadedSchema)
      return loadedSchema as T;

    const findLoadingSchema = (currSchema: LoadingSchema) => {
      return currSchema.schema.schemaKey.matches(schemaKey, matchType);
    };

    const loadingSchema = this._loadingSchemas.find(findLoadingSchema);
    if (loadingSchema)
      return loadingSchema.schema as T;

    return undefined;
  }
}

/**
 * The SchemaContext, context object is used to facilitate schema and schema item location.
 *
 * The context controls the lifetime of each schema that it knows about. It has to be explicitly removed from the context to delete a schema object.
 *
 * The context is made up of a group of Schema Locators.
 * @beta
 */
export class SchemaContext implements ISchemaLocater, ISchemaItemLocater {
  private _locaters: ISchemaLocater[];

  private _knownSchemas: SchemaCache;

  constructor() {
    this._locaters = [];

    this._knownSchemas = new SchemaCache();
    this._locaters.push(this._knownSchemas);
  }

  /**
   * Adds a schema locater to this context that will be used when getting schemas
   * @param locater The Schema Locater to add to this context
   */
  public addLocater(locater: ISchemaLocater) {
    this._locaters.push(locater);
  }

  /**
   * Adds the schema to this context
   * @param schema The schema to add to this context
   * @param loadSchema Promise that resolves when the schema has been completely loaded
   */
  public async addSchema(schema: Schema, loadSchema?: () => Promise<Schema>) {
    await this._knownSchemas.addSchema(schema, loadSchema);
  }

  /**
   * Adds the schema to this context
   * @param schema The schema to add to this context
   */
  public addSchemaSync(schema: Schema, loadSchema?: () => Promise<Schema>) {
    this._knownSchemas.addSchemaSync(schema, loadSchema);
  }

  public async checkAndAddSchema(schema: Schema, loadSchema: () => Promise<Schema>) {
    await this._knownSchemas.checkAndAddSchema(schema, loadSchema);
  }

  public checkAndAddSchemaSync(schema: Schema, loadSchema: () => Promise<Schema>) {
    this._knownSchemas.checkAndAddSchemaSync(schema, loadSchema);
  }

  /**
   * Adds the given SchemaItem to the the SchemaContext by locating the schema, with the best match of SchemaMatchType.Exact, and
   * @param schemaItem The SchemaItem to add
   * @deprecated Use the Schema Editor API to modify a schema
   */
  public async addSchemaItem(schemaItem: SchemaItem) {
    const schema = await this.getSchema(schemaItem.key.schemaKey, SchemaMatchType.Exact);
    if (!schema)
      throw new ECObjectsError(ECObjectsStatus.UnableToLocateSchema, `Unable to add the schema item ${schemaItem.name} to the schema ${schemaItem.key.schemaKey.toString()} because the schema could not be located.`);

    (schema as MutableSchema).addItem(schemaItem);
  }

  /**
   * Locate a schema that has already been loaded or that can be found via one of the registered schema locaters.
   * @param schemaKey The SchemaKey which describes the schema to be located
   * @param matchType Controls how the schema versions in the schemaKey and the schemas being located are compared.  Defaults to [[SchemaMatchType.Latest]].
   */
  public async getSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): Promise<T | undefined> {
    // the first locater is _knownSchemas, so we don't have to check the cache explicitly here
    for (const locater of this._locaters) {
      const schema = await locater.getSchema<T>(schemaKey, matchType, this);
      if (undefined !== schema)
        return schema;
    }

    return undefined;
  }

  /**
   * Locate a schema that has already been loaded or that can be found via one of the registered schema locaters.
   * @param schemaKey The SchemaKey which describes the schema to be located
   * @param matchType Controls how the schema versions in the schemaKey and the schemas being located are compared.  Defaults to [[SchemaMatchType.Latest]].
   */
  public getSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): T | undefined {
    // the first locater is _knownSchemas, so we don't have to check the cache explicitly here
    for (const locater of this._locaters) {
      const schema = locater.getSchemaSync<T>(schemaKey, matchType, this);
      if (undefined !== schema)
        return schema;
    }

    return undefined;
  }

  public async getLoadingSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): Promise<T | undefined> {
    // the first locater is _knownSchemas, so we don't have to check the cache explicitly here
    for (const locater of this._locaters) {
      const schema = await locater.getLoadingSchema<T>(schemaKey, matchType, this);
      if (undefined !== schema)
        return schema;
    }

    return undefined;
  }

  public getLoadingSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): T | undefined {
    // the first locater is _knownSchemas, so we don't have to check the cache explicitly here
    for (const locater of this._locaters) {
      const schema = locater.getLoadingSchemaSync<T>(schemaKey, matchType, this);
      if (undefined !== schema)
        return schema;
    }

    return undefined;
  }

  /**
   * Attempts to get a Schema from the context's cache.
   * @param schemaKey The SchemaKey to identify the Schema.
   * @param matchType The SchemaMatch type to use. Default is SchemaMatchType.Latest.
   * @internal
   */
  public async getCachedSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): Promise<T | undefined> {
    return this._knownSchemas.getSchema(schemaKey, matchType);
  }

  /**
   * Attempts to get a Schema from the context's cache.
   * @param schemaKey The SchemaKey to identify the Schema.
   * @param matchType The SchemaMatch type to use. Default is SchemaMatchType.Latest.
   * @internal
   */
  public getCachedSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): T | undefined {
    return this._knownSchemas.getSchemaSync(schemaKey, matchType);
  }

  public async getCachedLoadedOrLoadingSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): Promise<T | undefined> {
    return this._knownSchemas.getLoadingSchema(schemaKey, matchType);
  }

  public getCachedLoadedOrLoadingSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Latest): T | undefined {
    return this._knownSchemas.getLoadingSchemaSync(schemaKey, matchType);
  }

  /**
   * Returns the schema item (class, enumeration etc) referenced by the key or undefined if not found.
   * @param schemaItemKey The [[SchemaItemKey]] that identifies the item to find.  [[SchemaMatchType.Latest]] is used to find the schema of the item.
   * @returns The schema item or undefined
   */
  public async getSchemaItem<T extends SchemaItem>(schemaItemKey: SchemaItemKey): Promise<T | undefined> {
    const schema = await this.getSchema(schemaItemKey.schemaKey, SchemaMatchType.Latest);
    if (undefined === schema)
      return undefined;
    return schema.getItem<T>(schemaItemKey.name);
  }

  /**
   * Returns the schema item (class, enumeration etc) referenced by the key or undefined if not found.
   * @param schemaItemKey The [[SchemaItemKey]] that identifies the item to find.  [[SchemaMatchType.Latest]] is used to find the schema of the item.
   * @returns The schema item or undefined
   */
  public getSchemaItemSync<T extends SchemaItem>(schemaItemKey: SchemaItemKey): T | undefined {
    const schema = this.getSchemaSync(schemaItemKey.schemaKey, SchemaMatchType.Latest);
    if (undefined === schema)
      return undefined;
    return schema.getItemSync<T>(schemaItemKey.name);
  }
}
