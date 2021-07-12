/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Schema
 */

import { IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { EntityMetaData, IModelError } from "@bentley/imodeljs-common";
import { Entity } from "./Entity";
import { IModelDb } from "./IModelDb";
import { Schema, Schemas } from "./Schema";
import { IModelSchemaLoader } from "./IModelSchemaLoader";

/** The mapping between a BIS class name (in the form "schema:class") and its JavaScript constructor function
 * @public
 */
export class ClassRegistry {
  private static readonly _classMap = new Map<string, typeof Entity>();
  /** @internal */
  public static isNotFoundError(err: any) { return (err instanceof IModelError) && (err.errorNumber === IModelStatus.NotFound); }
  /** @internal */
  public static makeMetaDataNotFoundError(className: string): IModelError { return new IModelError(IModelStatus.NotFound, `metadata not found for ${className}`); }
  /** @internal */
  public static register(entityClass: typeof Entity, schema: typeof Schema) {
    entityClass.schema = schema;
    const key = (`${schema.schemaName}:${entityClass.className}`).toLowerCase();
    if (this._classMap.has(key)) {
      const errMsg = `Class ${key} is already registered. Make sure static className member is correct on JavaScript class ${entityClass.name}`;
      Logger.logError("imodeljs-frontend.classRegistry", errMsg);
      throw new Error(errMsg);
    }

    this._classMap.set(key, entityClass);
  }

  /** Generate a proxy Schema for a domain that has not been registered. */
  private static generateProxySchema(domain: string, iModel: IModelDb): typeof Schema {
    const hasBehavior = undefined !== new IModelSchemaLoader(iModel).getSchema(domain).customAttributes?.get("BisCore.SchemaHasBehavior");
    const schemaClass = class extends Schema {
      public static override get schemaName() { return domain; }
      public static override get missingRequiredBehavior() { return hasBehavior; }
    };

    Schemas.registerSchema(schemaClass); // register the class before we return it.
    return schemaClass;
  }

  /** Generate a JavaScript class from Entity metadata.
   * @param entityMetaData The Entity metadata that defines the class
   */
  private static generateClassForEntity(entityMetaData: EntityMetaData, iModel: IModelDb): typeof Entity {
    const name = entityMetaData.ecclass.split(":");
    const domainName = name[0];
    const className = name[1];

    if (0 === entityMetaData.baseClasses.length) // metadata must contain a superclass
      throw new IModelError(IModelStatus.BadArg, `class ${name} has no superclass`);

    // make sure schema exists
    let schema = Schemas.getRegisteredSchema(domainName);
    if (undefined === schema)
      schema = this.generateProxySchema(domainName, iModel); // no schema found, create it too

    // this method relies on the caller having previously created/registered all superclasses
    const superclass = this._classMap.get(entityMetaData.baseClasses[0].toLowerCase());
    if (undefined === superclass)
      throw new IModelError(IModelStatus.NotFound, `cannot find superclass for class ${name}`);

    const generatedClass = class extends superclass { public static override get className() { return className; } };
    // the above line creates an anonymous class. For help debugging, set the "constructor.name" property to be the same as the bisClassName.
    Object.defineProperty(generatedClass, "name", { get: () => className });  // this is the (only) way to change that readonly property.

    // if the schema is a proxy for a domain with behavior, throw exceptions for all protected operations
    if (schema.missingRequiredBehavior) {
      const throwError = () => { throw new IModelError(IModelStatus.WrongHandler, `Schema [${domainName}] not registered, but is marked with SchemaHasBehavior`); };
      superclass.protectedOperations.forEach((operation) => (generatedClass as any)[operation] = throwError);
    }

    this.register(generatedClass, schema); // register it before returning
    return generatedClass;
  }

  /** Register all of the classes found in the given module that derive from Entity. See the example in [[Schema]]
   * @param moduleObj The module to search for subclasses of Entity
   * @param schema The schema for all found classes
   */
  public static registerModule(moduleObj: any, schema: typeof Schema) {
    for (const thisMember in moduleObj) { // eslint-disable-line guard-for-in
      const thisClass = moduleObj[thisMember];
      if (thisClass.prototype instanceof Entity)
        this.register(thisClass, schema);
    }
  }

  /**
   * This function fetches the specified Entity from the imodel, generates a JavaScript class for it, and registers the generated
   * class. This function also ensures that all of the base classes of the Entity exist and are registered.
   */
  private static generateClass(classFullName: string, iModel: IModelDb): typeof Entity {
    const metadata: EntityMetaData | undefined = iModel.classMetaDataRegistry.find(classFullName);
    if (metadata === undefined || metadata.ecclass === undefined)
      throw this.makeMetaDataNotFoundError(classFullName);

    // Make sure we have all base classes registered.
    if (metadata.baseClasses && (0 !== metadata.baseClasses.length))
      this.getClass(metadata.baseClasses[0], iModel);

    // Now we can generate the class from the classDef.
    return this.generateClassForEntity(metadata, iModel);
  }

  /** Find a registered class by classFullName.
   * @param classFullName class to find
   * @param iModel The IModel that contains the class definitions
   * @returns The Entity class or undefined
   */
  public static findRegisteredClass(classFullName: string): typeof Entity | undefined {
    return this._classMap.get(classFullName.toLowerCase());
  }

  /** Get the Entity class for the specified Entity className.
   * @param classFullName The full BIS class name of the Entity
   * @param iModel The IModel that contains the class definitions
   * @returns The Entity class
   */
  public static getClass(classFullName: string, iModel: IModelDb): typeof Entity {
    const key = classFullName.toLowerCase();
    const ctor = this._classMap.get(key);
    return ctor ? ctor : this.generateClass(key, iModel);
  }

  /** Unregister a class, by name, if one is already registered.
   * This function is not normally needed, but is useful for cases where a generated *proxy* class needs to be replaced by the *real* class.
   * @param classFullName Name of the class to unregister
   * @return true if the class was unregistered
   * @internal
   */
  public static unregisterCLass(classFullName: string) { return this._classMap.delete(classFullName.toLowerCase()); }
  /** Unregister all classes from a schema.
   * This function is not normally needed, but is useful for cases where a generated *proxy* schema needs to be replaced by the *real* schema.
   * @param schema Name of the schema to unregister
   * @internal
   */
  public static unregisterClassesFrom(schema: typeof Schema) {
    for (const entry of Array.from(this._classMap)) {
      if (entry[1].schema === schema)
        this.unregisterCLass(entry[0]);
    }
  }
}

/**
 * A cache that records the mapping between class names and class metadata
 * @internal
 */
export class MetaDataRegistry {
  private _registry: Map<string, EntityMetaData> = new Map<string, EntityMetaData>();

  /** Get the specified Entity metadata */
  public find(classFullName: string): EntityMetaData | undefined { return this._registry.get(classFullName.toLowerCase()); }

  /** Add metadata to the cache */
  public add(classFullName: string, metaData: EntityMetaData): void { this._registry.set(classFullName.toLowerCase(), metaData); }
}
