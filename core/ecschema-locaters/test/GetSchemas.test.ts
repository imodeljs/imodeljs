/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { ECVersion, Schema, SchemaContext, SchemaKey, SchemaMatchType } from "@bentley/ecschema-metadata";
import { SchemaJsonFileLocater } from "../src/SchemaJsonFileLocater";

describe("Concurrent schema accesses", () => {
  let context1: SchemaContext;
  let context2: SchemaContext;
  let schemaKeys: SchemaKey[];

  beforeEach(() => {
    context1 = new SchemaContext();
    context2 = new SchemaContext();
    schemaKeys = [];
    const schemaFolder = path.join(__dirname, "assets", "JSON");
    const locater = new SchemaJsonFileLocater();

    locater.addSchemaSearchPath(schemaFolder);
    context1.addLocater(locater);
    context2.addLocater(locater);

    const schemaFiles = fs.readdirSync(schemaFolder);
    schemaFiles.forEach((fileName) => {
      const schemaFile = path.join(schemaFolder, fileName);
      const schemaJson = JSON.parse(fs.readFileSync(schemaFile, "utf-8"));
      const schemaName = schemaJson.name;
      const schemaVersion = schemaJson.version;

      const key = new SchemaKey(schemaName.toString(), ECVersion.fromString(schemaVersion.toString()));
      schemaKeys.push(key);
    });
  });

  it("should correctly deserialize schemas concurrently", async () => {
    // Asynchronous
    const schemaPromises = schemaKeys.map(async (key): Promise<Schema | undefined> => {
      if (!key)
        return undefined;

      const schema = await context1.getSchema(key, SchemaMatchType.Latest);
      return schema;
    });
    const asyncSchemas = await Promise.all(schemaPromises);

    // Synchronous
    const syncSchemas = schemaKeys.map((key): Schema | undefined => {
      if (!key)
        return undefined;

      const schema = context2.getSchemaSync(key, SchemaMatchType.Latest);
      return schema;
    });

    for (let i = 0; i < schemaKeys.length; i++) {
      const syncSchema = syncSchemas[i];
      expect(syncSchema).not.to.be.undefined;
      const syncJSON = syncSchema!.toJSON();

      const asyncSchema = asyncSchemas.find(asyncSchema => asyncSchema!.schemaKey.matches(syncSchema!.schemaKey));
      expect(asyncSchema).not.to.be.undefined;
      const asyncJSON = asyncSchema!.toJSON();
      expect(asyncJSON).to.deep.equal(syncJSON);
    }
  });

  /* Run these tests below one at a time. Running them together doesn't get accurate performance likely bc of disk access caching */
  it.skip("should measure concurrent performance", async () => {
    const startTime = new Date().getTime();
    const asyncSchemas: Schema[] = [];
    await Promise.all(schemaKeys.map(async (key) => {
      if (!key)
        return;
      const schema = await context1.getSchema(key, SchemaMatchType.Latest);
      if (!schema)
        return;
      asyncSchemas.push(schema);
      return;
    }));
    expect(asyncSchemas.length).to.equal(schemaKeys.length);
    const endTime = new Date().getTime();
    console.log(`Concurrent async deserialization took ~${endTime - startTime}ms`);
  });

  it.skip("should measure regular deserialization performance", async () => {
    const startTime = new Date().getTime();
    const syncSchemas: Schema[] = [];
    const getSchema = async (key: SchemaKey) => {
      if (!key)
        return;
      const schema = await context2.getSchema(key, SchemaMatchType.Latest);
      if (!schema)
        return;
      syncSchemas.push(schema);
      return;
    };
    for (let i = 0; i < schemaKeys.length; i++) {
      await getSchema(schemaKeys[i]);
    }
    expect(syncSchemas.length).to.equal(schemaKeys.length);
    const endTime = new Date().getTime();
    console.log(`Async deserialization took ~${endTime - startTime}ms`);
  });
});
