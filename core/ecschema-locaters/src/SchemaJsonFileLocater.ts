/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as path from "path";
import {
  ECObjectsError, ECObjectsStatus, ECVersion, ISchemaLocater, Schema, SchemaContext, SchemaKey, SchemaMatchType,
} from "@bentley/ecschema-metadata";
import { FileSchemaKey, SchemaFileLocater } from "./SchemaFileLocater";

/**
 * A SchemaLocator implementation for locating JSON Schema files
 * from the file system using configurable search paths.
 * @alpha
 */
export class SchemaJsonFileLocater extends SchemaFileLocater implements ISchemaLocater {
  /**
   * Constructs a SchemaKey based on the information in the Schema JSON
   * @param data The Schema JSON as a string
   */
  protected getSchemaKey(data: string): SchemaKey {
    const dataJson = JSON.parse(data);

    // Check if the name is present
    if (!(dataJson.name))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Could not retrieve the ECSchema name in the given file.`);

    // Check if versions is present
    if (!(dataJson.version))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Could not parse the ECSchema version in the given file.`);

    // Get the name and version from the JSON
    const schemaName = dataJson.name;
    const schemaVersion = dataJson.version;

    const key = new SchemaKey(schemaName.toString(), ECVersion.fromString(schemaVersion.toString()));
    return key;
  }

  /**
   * Attempts to retrieve a Schema with the given SchemaKey by using the configured
   * search paths to locate the JSON schema file from the file system.
   * @param key The SchemaKey of the Schema to retrieve.
   * @param matchType The SchemaMatchType.
   * @param context The SchemaContext that will control the lifetime of the schema and holds the schema's references, if they exist.
   */
  public async getSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    // Grab all schema files that match the schema key
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(schemaKey, matchType, "json");
    if (!candidates || candidates.length === 0)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    if (!await this.findCachedSchemaText(schemaKey)) {
      await this.addSchemaText(schemaKey, this.readSchemaText(schemaPath));
    }

    const schemaText = await this.getSchemaText(schemaKey);
    if (!schemaText)
      return undefined;

    const schema = await Schema.fromJson(schemaText, context);
    return schema as T;
  }

  /**
   * Attempts to retrieve a Schema with the given SchemaKey by using the configured
   * search paths to locate the JSON schema file from the file system.
   * @param key The SchemaKey of the Schema to retrieve.
   * @param matchType The SchemaMatchType
   * @param context The SchemaContext that will control the lifetime of the schema.
   */
  public getSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    // Grab all schema files that match the schema key
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(schemaKey, matchType, "json");
    if (!candidates || candidates.length === 0)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    // Load the file
    if (!fs.existsSync(schemaPath))
      return undefined;

    const schemaText = fs.readFileSync(schemaPath, "utf-8");
    if (!schemaText)
      return undefined;

    this.addSchemaSearchPaths([path.dirname(schemaPath)]);

    const schema = Schema.fromJsonSync(schemaText, context);
    return schema as T;
  }

  public async getLoadingSchema<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    // Grab all schema files that match the schema key
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(schemaKey, matchType, "json");
    if (!candidates || candidates.length === 0)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    if (!await this.findCachedSchemaText(schemaKey)) {
      await this.addSchemaText(schemaKey, this.readSchemaText(schemaPath));
    }

    const schemaText = await this.getSchemaText(schemaKey);
    if (!schemaText)
      return undefined;

    const schema = await Schema.fromJsonLoadingSchema(schemaText, context);
    return schema as T;
  }

  public getLoadingSchemaSync<T extends Schema>(schemaKey: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    // Grab all schema files that match the schema key
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(schemaKey, matchType, "json");
    if (!candidates || candidates.length === 0)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    // Load the file
    if (!fs.existsSync(schemaPath))
      return undefined;

    const schemaText = fs.readFileSync(schemaPath, "utf-8");
    if (!schemaText)
      return undefined;

    this.addSchemaSearchPaths([path.dirname(schemaPath)]);

    const schema = Schema.fromJsonLoadingSchemaSync(schemaText, context);
    return schema as T;
  }
}
