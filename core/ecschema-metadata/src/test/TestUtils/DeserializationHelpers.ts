/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { DOMParser } from "xmldom";
import { ISchemaLocater, SchemaContext } from "../../Context";
import { SchemaReadHelper } from "../../Deserialization/Helper";
import { XmlParser } from "../../Deserialization/XmlParser";
import { SchemaMatchType } from "../../ECObjects";
import { Schema } from "../../Metadata/Schema";
import { SchemaKey } from "../../SchemaKey";

export function createSchemaJsonWithItems(itemsJson: any, referenceJson?: any): any {
  return {
    $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
    name: "TestSchema",
    version: "1.2.3",
    items: {
      ...itemsJson,
    },
    ...referenceJson,
  };
}
export class ReferenceSchemaLocater implements ISchemaLocater {
  private readonly _schemaList: Map<string, Object>;
  private readonly _parser: (schemaContent: any, context: SchemaContext) => Schema | Promise<Schema>;
  private readonly _loadingSchemaParser: (schemaContent: any, context: SchemaContext) => Schema | Promise<Schema>;

  constructor(parser: (schemaContent: any, context: SchemaContext) => Schema | Promise<Schema>, loadingSchemaParser: (schemaContent: any, context: SchemaContext) => Schema | Promise<Schema>) {
    this._schemaList = new Map();
    this._parser = parser;
    this._loadingSchemaParser = loadingSchemaParser;
  }

  public addSchema(schemaName: string, schema: any) {
    this._schemaList.set(schemaName, schema);
  }

  public async getSchema<T extends Schema>(schemaKey: SchemaKey, _matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    if (this._schemaList.has(schemaKey.name)) {
      const schemaBody = this._schemaList.get(schemaKey.name);
      const schema = await this._parser(schemaBody, context);

      return schema as T;
    }

    return undefined;
  }

  public getSchemaSync<T extends Schema>(schemaKey: SchemaKey, _matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    if (this._schemaList.has(schemaKey.name)) {
      const schemaBody = this._schemaList.get(schemaKey.name);
      const schema = this._parser(schemaBody, context);

      return schema as T;
    }

    return undefined;
  }

  public async getLoadingSchema<T extends Schema>(schemaKey: SchemaKey, _matchType: SchemaMatchType, context: SchemaContext): Promise<T | undefined> {
    if (this._schemaList.has(schemaKey.name)) {
      const schemaBody = this._schemaList.get(schemaKey.name);
      const schema = await this._loadingSchemaParser(schemaBody, context);

      return schema as T;
    }

    return undefined;
  }

  public getLoadingSchemaSync<T extends Schema>(schemaKey: SchemaKey, _matchType: SchemaMatchType, context: SchemaContext): T | undefined {
    if (this._schemaList.has(schemaKey.name)) {
      const schemaBody = this._schemaList.get(schemaKey.name);
      const schema = this._loadingSchemaParser(schemaBody, context);

      return schema as T;
    }

    return undefined;
  }
}

export async function deserializeXml(schemaXml: string, context: SchemaContext) {
  const parser = new DOMParser();
  const document = parser.parseFromString(schemaXml);
  const reader = new SchemaReadHelper(XmlParser, context);
  return reader.readSchema(new Schema(context), document);
}

export function deserializeXmlSync(schemaXml: string, context: SchemaContext) {
  const parser = new DOMParser();
  const document = parser.parseFromString(schemaXml);
  const reader = new SchemaReadHelper(XmlParser, context);
  return reader.readSchemaSync(new Schema(context), document);
}

export async function deserializeXmlLoadingSchema(schemaXml: string, context: SchemaContext) {
  const parser = new DOMParser();
  const document = parser.parseFromString(schemaXml);
  const reader = new SchemaReadHelper(XmlParser, context);
  return reader.readLoadingSchema(new Schema(context), document);
}

export function deserializeXmlLoadingSchemaSync(schemaXml: string, context: SchemaContext) {
  const parser = new DOMParser();
  const document = parser.parseFromString(schemaXml);
  const reader = new SchemaReadHelper(XmlParser, context);
  return reader.readLoadingSchemaSync(new Schema(context), document);
}

export function createSchemaXmlWithItems(itemsXml: string | Element, ec32: boolean = false): Document {
  const parser = new DOMParser();

  const ecVersion = ec32 ? "3.2" : "3.1";

  let schemaDoc: Document;
  if (typeof itemsXml === "string") {
    const schemaString = `<?xml version="1.0" encoding="utf-8"?>
      <ECSchema schemaName="TestSchema" alias="testschema" version="01.00.00" description="A test schema" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.${ecVersion}">
        ${itemsXml}
      </ECSchema>`;

    schemaDoc = parser.parseFromString(schemaString);
  } else {
    const schemaString = `<?xml version="1.0" encoding="utf-8"?>
      <ECSchema schemaName="TestSchema" alias="testschema" version="01.00.00" description="A test schema" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.${ecVersion}">
      </ECSchema>`;
    schemaDoc = parser.parseFromString(schemaString);
    schemaDoc.getElementsByTagName("ECSchema")[0].appendChild(itemsXml);
  }
  return schemaDoc;
}
