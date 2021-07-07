/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import {
  ECObjectsError, ECObjectsStatus, ECVersion, ISchemaLocater, Schema, SchemaContext, SchemaKey, SchemaMatchType,
} from "@bentley/ecschema-metadata";
import { FileSchemaKey, SchemaFileLocater } from "./SchemaFileLocater";

function isECv2Schema(schemaText: string): boolean {
  return /<ECSchema[^>]*xmlns=".*ECXML.2.0"/.test(schemaText);
}

/**
 * A SchemaLocater implementation for locating XML Schema files
 * from the file system using configurable search paths. Returns only
 * Schemas from XML files with their keys populated.
 * @internal
 */
export class StubSchemaXmlFileLocater extends SchemaFileLocater implements ISchemaLocater {
  /**
   * Loads a Schema from an XML file on the file system.
   * @param schemaPath The path to the Schema file.
   * @param schemaText Optionally pass in the schema text read from the schema file. If undefined,
   * the schema will be read from the provided schemaPath.
   */
  public loadSchema(schemaPath: string, schemaText?: string): Schema {
    schemaText = schemaText || this.readUtf8FileToStringSync(schemaPath);
    if (!schemaText)
      throw new ECObjectsError(ECObjectsStatus.UnableToLocateSchema, `Unable to locate schema XML file at ${schemaPath}`);

    this.addSchemaSearchPaths([path.dirname(schemaPath)]);
    const key = this.getSchemaKey(schemaText);
    const alias = this.getSchemaAlias(schemaText);
    const context = new SchemaContext();
    context.addLocater(this);

    // Load the schema and return it
    const schema = new Schema(context, new FileSchemaKey(key, schemaPath, schemaText), alias);
    this.addSchemaReferences(schema, context, SchemaMatchType.LatestWriteCompatible);
    return schema;
  }

  /**
   * Attempts to retrieve a Schema with the given SchemaKey by using the configured search paths
   * to locate the XML Schema file from the file system. Returns only Schemas from XML files with
   * their keys populated.
   * @param key The SchemaKey of the Schema to retrieve.
   * @param matchType The SchemaMatchType.
   * @param context The SchemaContext that will control the lifetime of the schema.
   */
  public async getSchema<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    return this.getSchemaSync(key, matchType, context) as T;
  }

  /**
   * Attempts to retrieve a Schema with the given SchemaKey by using the configured search paths
   * to locate the XML Schema file from the file system. Returns only Schemas from XML files with
   * their keys populated.
   * @param key The SchemaKey of the Schema to retrieve.
   * @param matchType The SchemaMatchType.
   * @param context The SchemaContext that will control the lifetime of the schema.
   */
  public getSchemaSync<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    const candidates: FileSchemaKey[] = this.findEligibleSchemaKeys(key, matchType, "xml");

    if (!candidates || candidates.length === 0)
      return undefined;

    const maxCandidate = candidates.sort(this.compareSchemaKeyByVersion)[candidates.length - 1]; // eslint-disable-line @typescript-eslint/unbound-method
    const alias = this.getSchemaAlias(maxCandidate.schemaText!);
    const schema = new Schema(context, maxCandidate, alias) as T;
    context.addSchemaSync(schema);

    this.addSchemaReferences(schema, context, SchemaMatchType.LatestWriteCompatible);
    return schema;
  }

  public async getLoadingSchema<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    return this.getSchemaSync(key, matchType, context) as T;
  }

  public getLoadingSchemaSync<T extends Schema>(key: SchemaKey, matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    return this.getSchemaSync(key, matchType, context) as T;
  }

  /**
   * Constructs a SchemaKey based on the information in the Schema XML.
   * @param schemaXml The Schema XML as a string.
   */
  public getSchemaKey(schemaXml: string): SchemaKey {
    const matches = schemaXml.match(/<ECSchema ([^]+?)>/g);
    if (!matches || matches.length !== 1)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Could not find '<ECSchema>' tag in the given file`);

    const name = matches[0].match(/schemaName="(.+?)"/);
    const version = matches[0].match(/version="(.+?)"/);
    if (!name || name.length !== 2 || !version || version.length !== 2)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Could not find the ECSchema 'schemaName' or 'version' tag in the given file`);

    let ecVersion: ECVersion;
    if (isECv2Schema(schemaXml))
      ecVersion = this.fromECv2String(version[1]);
    else
      ecVersion = ECVersion.fromString(version[1]);

    const key = new SchemaKey(name[1], ecVersion);
    return key;
  }

  /**
   * Gets an array of SchemaKeys of the Schemas referenced by the given Schema.
   * @param xmlSchemaKey The SchemaKey of the parent Schema containing the references.
   */
  private getSchemaReferenceKeys(schemaKey: FileSchemaKey): SchemaKey[] {
    return this._getSchemaReferenceKeys(schemaKey);
  }

  /**
   * Adds schemas to the references collection for the given Schema by locating
   * the referenced schemas.
   * @param schema The schema for which to add the references.
   * @param context The SchemaContext that will control the lifetime of the schema.
   * @param refMatchType The SchemaMatchType to use when locating schema references.
   */
  private addSchemaReferences(schema: Schema, context: SchemaContext, refMatchType: SchemaMatchType): void {
    const refKeys = this.getSchemaReferenceKeys(schema.schemaKey as FileSchemaKey);

    for (const key of refKeys) {
      const refSchema = context ? context.getSchemaSync(key, refMatchType) : undefined;
      if (!refSchema)
        throw new ECObjectsError(ECObjectsStatus.UnableToLocateSchema, `Unable to locate referenced schema: ${key.name}.${key.readVersion}.${key.writeVersion}.${key.minorVersion}`);

      schema.references.push(refSchema);
    }
  }

  /**
   * Gets an array of SchemaKeys of the Schemas referenced by the given Schema.
   * @param data The Schema XML string.
   */
  private _getSchemaReferenceKeys(xmlSchemaKey: FileSchemaKey): SchemaKey[] {
    const file = xmlSchemaKey.schemaText;

    if (!file)
      throw new ECObjectsError(ECObjectsStatus.UnableToLocateSchema, `Could not locate the schema file, ${xmlSchemaKey.fileName}, for the schema ${xmlSchemaKey.name}`);

    const data = file.toString().replace(/(\s*)<!--.*?-->/g, ""); // ignore any comments in the XML file when getting the array of SchemaKeys

    const keys: SchemaKey[] = [];
    const matches = data.match(/<ECSchemaReference ([^]+?)\/>/g);
    if (!matches)
      return keys;

    for (const match of matches) {
      const name = match.match(/name="(.+?)"/);
      const versionMatch = match.match(/version="(.+?)"/);
      if (!name || name.length !== 2 || !versionMatch || versionMatch.length !== 2)
        throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Invalid ECSchemaReference xml encountered in the schema file`);

      // write version maybe missing, so insert "0"
      let versionString = versionMatch[1];
      const versionParts = versionString.split(".");
      if (versionParts.length === 2)
        versionParts.splice(1, 0, "0");

      versionString = versionParts.join(".");

      const key = new SchemaKey(name[1], ECVersion.fromString(versionString));
      keys.push(key);
    }

    return keys;
  }

  /**
   * Gets the Schema alias from the Schema XML.
   * @param data The Schema XML as a string.
   */
  private getSchemaAlias(schemaXml: string): string {
    let match: any;

    if (isECv2Schema(schemaXml)) {
      match = schemaXml.match(/<ECSchema.*nameSpacePrefix="(?<alias>\w+)"/) as any;
    } else {
      match = schemaXml.match(/<ECSchema.*alias="(?<alias>\w+)"/) as any;
    }

    if (!match || !match.groups.alias) {
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaXML, `Could not find the ECSchema 'alias' tag in the given file.`);
    }

    return match.groups.alias;
  }

  /**
   * Parses a valid EC 2.0 version string and returns an ECVersion object. The second digit becomes the minor version,
   * and a zero is inserted as the 'write' digit. Example: "1.1" -> "1.0.1".
   * @param versionString A valid EC 2.0 version string of the format, 'RR.mm'.
   */
  private fromECv2String(versionString: string): ECVersion {
    const [read, minor] = versionString.split(".");

    if (!read)
      throw new ECObjectsError(ECObjectsStatus.InvalidECVersion, `The read version is missing from version string, ${versionString}`);

    if (!minor)
      throw new ECObjectsError(ECObjectsStatus.InvalidECVersion, `The minor version is missing from version string, ${versionString}`);

    return new ECVersion(+read, 0, +minor);
  }
}
