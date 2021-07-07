/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { DOMParser } from "xmldom";
import {
  ECObjectsError, ECObjectsStatus, ECVersion, ISchemaLocater, Schema, SchemaContext, SchemaKey, SchemaMatchType, SchemaReadHelper, XmlParser,
} from "@bentley/ecschema-metadata";
import { FileSchemaKey, SchemaFileLocater } from "./SchemaFileLocater";

/**
 * A SchemaLocater implementation for locating XML Schema files
 * from the file system using configurable search paths.
 * @alpha This is a workaround the current lack of a full xml parser.
 */
export class SchemaXmlFileLocater extends SchemaFileLocater implements ISchemaLocater {
  /**
   * Attempts to retrieve a Schema with the given SchemaKey by using the configured search paths
   * to locate the XML Schema file from the file system.
   * @param key The SchemaKey of the Schema to retrieve.
   * @param matchType The SchemaMatchType.
   * @param context The SchemaContext that will control the lifetime of the schema.
   */
  public async getSchema<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(key, matchType, "xml");

    if (0 === candidates.length)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    if (!await this.findCachedSchemaText(key)) {
      await this.addSchemaText(key, this.readSchemaText(schemaPath));
    }

    const schemaText = await this.getSchemaText(key);
    if (undefined === schemaText)
      return undefined;

    const parser = new DOMParser();
    const document = parser.parseFromString(schemaText);

    const reader = new SchemaReadHelper(XmlParser, context);
    let schema: Schema = new Schema(context);
    schema = await reader.readSchema(schema, document);

    return schema as T;
  }

  /**
   * Attempts to retrieve a Schema with the given SchemaKey by using the configured search paths
   * to locate the XML Schema file from the file system.
   * @param key The SchemaKey of the Schema to retrieve.
   * @param matchType The SchemaMatchType.
   * @param context The SchemaContext that will control the lifetime of the schema.
   */
  public getSchemaSync<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(key, matchType, "xml");

    if (!candidates || candidates.length === 0)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    // Load the file
    if (!this.fileExistsSync(schemaPath))
      return undefined;

    const schemaText = this.readUtf8FileToStringSync(schemaPath);
    if (!schemaText)
      return undefined;

    const parser = new DOMParser();
    const document = parser.parseFromString(schemaText);

    this.addSchemaSearchPaths([path.dirname(schemaPath)]);
    const reader = new SchemaReadHelper(XmlParser, context);
    let schema: Schema = new Schema(context);
    schema = reader.readSchemaSync(schema, document);

    return schema as T;
  }

  public async getLoadingSchema<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(key, matchType, "xml");

    if (0 === candidates.length)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    if (!await this.findCachedSchemaText(key)) {
      await this.addSchemaText(key, this.readSchemaText(schemaPath));
    }

    const schemaText = await this.getSchemaText(key);
    if (undefined === schemaText)
      return undefined;

    const parser = new DOMParser();
    const document = parser.parseFromString(schemaText);

    const reader = new SchemaReadHelper(XmlParser, context);
    let schema: Schema = new Schema(context);
    schema = await reader.readLoadingSchema(schema, document);

    return schema as T;
  }

  public getLoadingSchemaSync<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(key, matchType, "xml");

    if (!candidates || candidates.length === 0)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1];
    const schemaPath = maxCandidate.fileName;

    // Load the file
    if (!this.fileExistsSync(schemaPath))
      return undefined;

    const schemaText = this.readUtf8FileToStringSync(schemaPath);
    if (!schemaText)
      return undefined;

    const parser = new DOMParser();
    const document = parser.parseFromString(schemaText);

    this.addSchemaSearchPaths([path.dirname(schemaPath)]);
    const reader = new SchemaReadHelper(XmlParser, context);
    let schema: Schema = new Schema(context);
    schema = reader.readLoadingSchemaSync(schema, document);

    return schema as T;
  }

  /**
   * Constructs a SchemaKey based on the information in the Schema XML.
   * @param data The Schema XML as a string.
   */
  public getSchemaKey(data: string): SchemaKey {
    const matches = data.match(/<ECSchema ([^]+?)>/g);
    if (!matches || matches.length !== 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Could not find '<ECSchema>' tag in the given file`);

    const name = matches[0].match(/schemaName="(.+?)"/);
    const version = matches[0].match(/version="(.+?)"/);
    if (!name || name.length !== 2 || !version || version.length !== 2)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Could not find the ECSchema 'schemaName' or 'version' tag in the given file`);

    const key = new SchemaKey(name[1], ECVersion.fromString(version[1]));
    return key;
  }
}
