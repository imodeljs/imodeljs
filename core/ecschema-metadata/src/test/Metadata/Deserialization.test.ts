/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as sinon from "sinon";
import { DOMParser } from "xmldom";
import { SchemaContext } from "../../Context";
import { SchemaReadHelper } from "../../Deserialization/Helper";
import { JsonParser } from "../../Deserialization/JsonParser";
import { SchemaItemType } from "../../ECObjects";
import { ECObjectsError } from "../../Exception";
import { AnyClass } from "../../Interfaces";
import { NavigationProperty } from "../../Metadata/Property";
import { Schema } from "../../Metadata/Schema";
import { ISchemaPartVisitor } from "../../SchemaPartVisitorDelegate";
import { XmlParser } from "../../Deserialization/XmlParser";
import { deserializeXml, deserializeXmlLoadingSchema, deserializeXmlLoadingSchemaSync, deserializeXmlSync, ReferenceSchemaLocater } from "../TestUtils/DeserializationHelpers";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Full Schema Deserialization", () => {
  describe("basic (empty) schemas", () => {
    it("should successfully deserialize a valid JSON string", async () => {
      const schemaString = JSON.stringify({
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        description: "This is a test description",
        label: "This is a test label",
      });

      const ecschema = await Schema.fromJson(schemaString, new SchemaContext());
      expect(ecschema.name).equal("TestSchema");
      expect(ecschema.readVersion).equal(1);
      expect(ecschema.writeVersion).equal(2);
      expect(ecschema.minorVersion).equal(3);
      expect(ecschema.description).equal("This is a test description");
      expect(ecschema.label).equal("This is a test label");
    });
    it("should successfully deserialize a valid JSON string synchronously", () => {
      const schemaString = JSON.stringify({
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        description: "This is a test description",
        label: "This is a test label",
      });

      const ecschema = Schema.fromJsonSync(schemaString, new SchemaContext());
      expect(ecschema.name).equal("TestSchema");
      expect(ecschema.readVersion).equal(1);
      expect(ecschema.writeVersion).equal(2);
      expect(ecschema.minorVersion).equal(3);
      expect(ecschema.description).equal("This is a test description");
      expect(ecschema.label).equal("This is a test label");
    });

    it("should successfully deserialize name and version from a valid JSON object", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        description: "This is a test description",
        label: "This is a test label",
      };

      const ecschema = await Schema.fromJson(schemaJson, new SchemaContext());
      expect(ecschema.name).equal("TestSchema");
      expect(ecschema.readVersion).equal(1);
      expect(ecschema.writeVersion).equal(2);
      expect(ecschema.minorVersion).equal(3);
      expect(ecschema.description).equal("This is a test description");
      expect(ecschema.label).equal("This is a test label");
    });

    it("should throw for invalid schema version", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.1000.0",
      };

      await expect(Schema.fromJson(schemaJson, new SchemaContext())).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid schema minor version", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.0.10000000",
      };
      await expect(Schema.fromJson(schemaJson, new SchemaContext())).to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for invalid schema name", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "0TestSchema",
        version: "1.0.0",
      };

      await expect(Schema.fromJson(schemaJson, new SchemaContext())).to.be.rejectedWith(ECObjectsError);
    });
  });

  describe("with schema reference", () => {
    const baseJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",

    };
    const validSchemaJson = {
      ...baseJson,
      references: [
        {
          name: "RefSchema",
          version: "1.0.5",
        },
      ],
    };

    it("should succeed when referenced schema is already in the schema context", async () => {
      const context = new SchemaContext();
      const refSchema = new Schema(context, "RefSchema", "ref", 1, 0, 5);
      await context.addSchema(refSchema);

      const schema = await Schema.fromJson(validSchemaJson, context);
      assert.exists(schema);

      if (!schema.references)
        return;

      expect(schema.references.length).equal(1);
      if (!schema.references[0])
        assert.fail();
      assert.isTrue(schema.references[0] === refSchema);
    });

    it("should throw if the referenced schema cannot be found", async () => {
      await expect(Schema.fromJson(validSchemaJson, new SchemaContext())).to.be.rejectedWith(ECObjectsError, "Could not locate the referenced schema, RefSchema.1.0.5, of TestSchema");
    });

    it("should throw for invalid references attribute", async () => {
      let json: any = { ...baseJson, references: 0 };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'references' attribute. It should be of type 'object[]'.`);

      json = { ...baseJson, references: [0] };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'references' attribute. It should be of type 'object[]'.`);
    });

    it("should throw for missing reference name", async () => {
      const json = {
        ...baseJson,
        references: [{ version: "1.0.5" }],
      };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'references' attribute. One of the references is missing the required 'name' attribute.`);
    });

    it("should throw for invalid reference name", async () => {
      const json = {
        ...baseJson,
        references: [{ name: 0, version: "1.0.5" }],
      };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'references' attribute. One of the references has an invalid 'name' attribute. It should be of type 'string'.`);
    });

    it("should throw for missing reference version", async () => {
      const json = {
        ...baseJson,
        references: [{ name: "RefSchema" }],
      };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'references' attribute. One of the references is missing the required 'version' attribute.`);
    });

    it("should throw for invalid reference version", async () => {
      const json = {
        ...baseJson,
        references: [{ name: "RefSchema", version: 0 }],
      };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'references' attribute. One of the references has an invalid 'version' attribute. It should be of type 'string'.`);
    });

    it("should throw for cyclic references (sync)", async () => {
      const context = new SchemaContext();

      const schemaAJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaA",
        version: "1.0.0",
        alias: "a",
      };

      const schemaBJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaB",
        version: "2.0.0",
        alias: "b",
        references: [
          {
            name: "TestSchema",
            version: "1.2.3",
            alias: "test",
          },
        ],
      };
      const locater = new ReferenceSchemaLocater(Schema.fromJsonSync, Schema.fromJsonLoadingSchemaSync);
      locater.addSchema("RefSchemaA", schemaAJson);
      locater.addSchema("RefSchemaB", schemaBJson);

      context.addLocater(locater);

      const json = {
        ...baseJson,
        alias: "test",
        references: [
          { name: "RefSchemaA", version: "1.0.0" },
          { name: "RefSchemaB", version: "2.0.0" },
        ],
      };
      expect(() => Schema.fromJsonSync(json, context)).to.throw(ECObjectsError, `ECObjects-3: Schema 'TestSchema' has reference cycles: RefSchemaB --> TestSchema, TestSchema --> RefSchemaB\r\n`);
    });

    it("should throw for cyclic references (async)", async () => {
      const context = new SchemaContext();

      const schemaAJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaA",
        version: "1.0.0",
        alias: "a",
      };

      const schemaBJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaB",
        version: "2.0.0",
        alias: "b",
        references: [
          {
            name: "TestSchema",
            version: "1.2.3",
            alias: "test",
          },
        ],
      };
      const locater = new ReferenceSchemaLocater(Schema.fromJson, Schema.fromJsonLoadingSchema);
      locater.addSchema("RefSchemaA", schemaAJson);
      locater.addSchema("RefSchemaB", schemaBJson);

      context.addLocater(locater);

      let json = {
        ...baseJson,
        alias: "test",
        references: [
          { name: "RefSchemaA", version: "1.0.0" },
          { name: "RefSchemaB", version: "2.0.0" },
        ],
      };
      await expect(Schema.fromJson(json, context)).to.be.rejectedWith(ECObjectsError, `ECObjects-3: Schema 'RefSchemaB' has reference cycles: TestSchema --> RefSchemaB, RefSchemaB --> TestSchema\r\n`);

      const context2 = new SchemaContext();
      const schemaCJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaC",
        version: "1.0.0",
        alias: "c",
        references: [
          {
            name: "RefSchemaD",
            version: "1.0.0",
          },
          {
            name: "RefSchemaE",
            version: "1.0.0",
          },
        ],
      };

      const schemaDJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaD",
        version: "1.0.0",
        alias: "d",
      };

      const schemaEJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaE",
        version: "1.0.0",
        alias: "e",
        references: [
          {
            name: "RefSchemaF",
            version: "1.0.0",
          },
        ],
      };

      const schemaFJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaF",
        version: "1.0.0",
        alias: "f",
        references: [
          {
            name: "RefSchemaC",
            version: "1.0.0",
          },
        ],
      };

      const locater2 = new ReferenceSchemaLocater(Schema.fromJson, Schema.fromJsonLoadingSchema);
      locater2.addSchema("RefSchemaC", schemaCJson);
      locater2.addSchema("RefSchemaD", schemaDJson);
      locater2.addSchema("RefSchemaE", schemaEJson);
      locater2.addSchema("RefSchemaF", schemaFJson);
      context2.addLocater(locater2);

      json = {
        ...baseJson,
        alias: "test",
        references: [
          { name: "RefSchemaC", version: "1.0.0" },
        ],
      };
      await expect(Schema.fromJson(json, context2)).to.be.rejectedWith(ECObjectsError, `ECObjects-3: Schema 'RefSchemaF' has reference cycles: RefSchemaE --> RefSchemaF, RefSchemaC --> RefSchemaE, RefSchemaF --> RefSchemaC\r\n`);
    });

    it("should not throw cyclic references", async () => {
      const context = new SchemaContext();

      const schemaAJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaA",
        version: "1.0.0",
        alias: "a",
        references: [
          {
            name: "RefSchemaC",
            version: "1.0.0",
          },
          {
            name: "RefSchemaD",
            version: "1.0.0",
          },
        ],
      };

      const schemaBJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaB",
        version: "1.0.0",
        alias: "b",
        references: [
          {
            name: "RefSchemaA",
            version: "1.0.0",
          },
          {
            name: "RefSchemaC",
            version: "1.0.0",
          },
        ],
      };

      const schemaCJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaC",
        version: "1.0.0",
        alias: "c",
      };

      const schemaDJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "RefSchemaD",
        version: "1.0.0",
        alias: "d",
      };

      const locater = new ReferenceSchemaLocater(Schema.fromJson, Schema.fromJsonLoadingSchema);
      locater.addSchema("RefSchemaA", schemaAJson);
      locater.addSchema("RefSchemaB", schemaBJson);
      locater.addSchema("RefSchemaC", schemaCJson);
      locater.addSchema("RefSchemaD", schemaDJson);

      context.addLocater(locater);

      const json = {
        ...baseJson,
        alias: "test",
        references: [
          { name: "RefSchemaA", version: "1.0.0" },
          { name: "RefSchemaB", version: "1.0.0" },
        ],
      };
      await expect(Schema.fromJson(json, context)).not.to.be.rejectedWith(ECObjectsError);
    });

    it("should throw for cyclic references in XML (sync)", async () => {
      const context = new SchemaContext();

      const schemaAXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaA" alias="a" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      </ECSchema>`;

      const schemaBXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaB" alias="b" version="02.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECSchemaReference name="TestSchema" version="01.02.03" alias="test"/>
      </ECSchema>`;

      const locater = new ReferenceSchemaLocater(deserializeXmlSync, deserializeXmlLoadingSchemaSync);
      locater.addSchema("RefSchemaA", schemaAXml);
      locater.addSchema("RefSchemaB", schemaBXml);

      context.addLocater(locater);
      const testSchemaXML = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="TestSchema" alias="test" version="01.02.03" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      <ECSchemaReference name="RefSchemaA" version="01.00.00" alias="a"/>
      <ECSchemaReference name="RefSchemaB" version="02.00.00" alias="b"/>
      </ECSchema>`;

      expect(() => deserializeXmlSync(testSchemaXML, context)).to.throw(ECObjectsError, `ECObjects-3: Schema 'TestSchema' has reference cycles: RefSchemaB --> TestSchema, TestSchema --> RefSchemaB\r\n`);
    });

    it("should throw for cyclic references in XML (async)", async () => {
      const context = new SchemaContext();

      const schemaAXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaA" alias="a" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      </ECSchema>`;

      const schemaBXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaB" alias="b" version="02.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECSchemaReference name="TestSchema" version="01.02.03" alias="test"/>
      </ECSchema>`;

      const locater = new ReferenceSchemaLocater(deserializeXml, deserializeXmlLoadingSchema);
      locater.addSchema("RefSchemaA", schemaAXml);
      locater.addSchema("RefSchemaB", schemaBXml);

      context.addLocater(locater);
      let testSchemaXML = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="TestSchema" alias="test" version="01.02.03" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      <ECSchemaReference name="RefSchemaA" version="01.00.00" alias="a"/>
      <ECSchemaReference name="RefSchemaB" version="02.00.00" alias="b"/>
      </ECSchema>`;

      await expect(deserializeXml(testSchemaXML, context)).to.be.rejectedWith(ECObjectsError, `ECObjects-3: Schema 'RefSchemaB' has reference cycles: TestSchema --> RefSchemaB, RefSchemaB --> TestSchema\r\n`);

      const context2 = new SchemaContext();

      const schemaCXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaC" alias="c" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECSchemaReference name="RefSchemaD" version="01.00.00" alias="d"/>
        <ECSchemaReference name="RefSchemaE" version="01.00.00" alias="e"/>
      </ECSchema>`;

      const schemaDXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaD" alias="d" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      </ECSchema>`;

      const schemaEXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaE" alias="e" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECSchemaReference name="RefSchemaF" version="01.00.00" alias="f"/>
      </ECSchema>`;

      const schemaFXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaF" alias="f" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECSchemaReference name="RefSchemaC" version="01.00.00" alias="c"/>
      </ECSchema>`;

      const locater2 = new ReferenceSchemaLocater(deserializeXmlSync, deserializeXmlLoadingSchemaSync);
      locater2.addSchema("RefSchemaC", schemaCXml);
      locater2.addSchema("RefSchemaD", schemaDXml);
      locater2.addSchema("RefSchemaE", schemaEXml);
      locater2.addSchema("RefSchemaF", schemaFXml);

      context2.addLocater(locater2);
      testSchemaXML = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="TestSchema" alias="test" version="01.02.03" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      <ECSchemaReference name="RefSchemaC" version="01.00.00" alias="c"/>
      </ECSchema>`;

      await expect(deserializeXml(testSchemaXML, context2)).to.be.rejectedWith(ECObjectsError, `ECObjects-3: Schema 'RefSchemaF' has reference cycles: RefSchemaE --> RefSchemaF, RefSchemaC --> RefSchemaE, RefSchemaF --> RefSchemaC\r\n`);
    });

    it("should not throw cyclic references in XML", async () => {
      const context = new SchemaContext();

      const schemaAXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaA" alias="a" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECSchemaReference name="RefSchemaC" version="01.00.00" alias="c"/>
        <ECSchemaReference name="RefSchemaD" version="01.00.00" alias="d"/>
      </ECSchema>`;

      const schemaBXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaB" alias="b" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECSchemaReference name="RefSchemaA" version="01.00.00" alias="a"/>
        <ECSchemaReference name="RefSchemaC" version="01.00.00" alias="c"/>
      </ECSchema>`;

      const schemaCXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaC" alias="c" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      </ECSchema>`;

      const schemaDXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="RefSchemaD" alias="d" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      </ECSchema>`;

      const locater = new ReferenceSchemaLocater(deserializeXml, deserializeXmlLoadingSchema);
      locater.addSchema("RefSchemaA", schemaAXml);
      locater.addSchema("RefSchemaB", schemaBXml);
      locater.addSchema("RefSchemaC", schemaCXml);
      locater.addSchema("RefSchemaD", schemaDXml);

      context.addLocater(locater);
      const testSchemaXML = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="TestSchema" alias="test" version="01.02.03" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      <ECSchemaReference name="RefSchemaA" version="01.00.00" alias="a"/>
      <ECSchemaReference name="RefSchemaB" version="01.00.00" alias="b"/>
      </ECSchema>`;

      await expect(deserializeXml(testSchemaXML, context)).not.to.be.rejectedWith(ECObjectsError);
    });
  });

  describe("with items", () => {
    const baseJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
    };

    it("should throw for invalid items attribute", async () => {
      let json: any = { ...baseJson, items: 0 };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'items' attribute. It should be of type 'object'.`);

      json = { ...baseJson, items: [{}] };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The schema TestSchema has an invalid 'items' attribute. It should be of type 'object'.`);
    });

    it("should throw for item with invalid name", async () => {
      const json = { ...baseJson, items: { "": {} } };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `A SchemaItem in TestSchema has an invalid 'name' attribute. '' is not a valid ECName.`);
    });

    it("should throw for item with missing schemaItemType", async () => {
      const json = {
        ...baseJson,
        items: { BadItem: {} },
      };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The SchemaItem TestSchema.BadItem is missing the required 'schemaItemType' attribute.`);
    });

    it("should throw for item with invalid schemaItemType", async () => {
      const json = {
        ...baseJson,
        items: { BadItem: { schemaItemType: 0 } },
      };
      await expect(Schema.fromJson(json, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The SchemaItem TestSchema.BadItem has an invalid 'schemaItemType' attribute. It should be of type 'string'.`);
    });
  });

  describe("with visitor", () => {
    const baseJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
    };
    type Mock<T> = { readonly [P in keyof T]: sinon.SinonSpy; };
    let mockVisitor: Mock<ISchemaPartVisitor>;

    beforeEach(() => {
      mockVisitor = {
        visitEmptySchema: sinon.spy(),
        visitClass: sinon.spy(),
        visitEnumeration: sinon.spy(),
        visitKindOfQuantity: sinon.spy(),
        visitPropertyCategory: sinon.spy(),
        visitFullSchema: sinon.spy(),
      };
    });

    it("should call all visit methods", async () => {
      const schemaJson = {
        ...baseJson,
        items: {
          TestClass: { schemaItemType: "EntityClass" },
          TestEnum: {
            schemaItemType: "Enumeration",
            type: "int",
            enumerators: [
              {
                name: "TestEnumeration",
                value: 2,
              },
            ],
          },
          TestCategory: {
            schemaItemType: "PropertyCategory",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "LENGTH(1)",
          },
          Metric: {
            schemaItemType: "UnitSystem",
          },
          M: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.Metric",
            definition: "[MILLI]*M",
          },
          TestKoQ: {
            schemaItemType: "KindOfQuantity",
            relativeError: 5,
            persistenceUnit: "TestSchema.M",
          },
        },
      };

      const context = new SchemaContext();
      let testSchema = new Schema(context);
      const reader = new SchemaReadHelper(JsonParser, context, mockVisitor);
      testSchema = await reader.readSchema(testSchema, schemaJson);
      expect(testSchema).to.exist;
      expect(mockVisitor!.visitEmptySchema!.calledOnce).to.be.true;
      expect(mockVisitor!.visitEmptySchema!.calledWithExactly(testSchema)).to.be.true;

      const testEnum = await testSchema.getItem("TestEnum");
      expect(testEnum).to.exist;
      expect(mockVisitor!.visitEnumeration!.calledOnce).to.be.true;
      expect(mockVisitor!.visitEnumeration!.calledWithExactly(testEnum)).to.be.true;
      expect(mockVisitor!.visitEnumeration!.calledAfter(mockVisitor!.visitEmptySchema!)).to.be.true;

      const testCategory = await testSchema.getItem("TestCategory");
      expect(testCategory).to.exist;
      expect(mockVisitor!.visitPropertyCategory!.calledOnce).to.be.true;
      expect(mockVisitor!.visitPropertyCategory!.calledWithExactly(testCategory)).to.be.true;
      expect(mockVisitor!.visitPropertyCategory!.calledAfter(mockVisitor!.visitEmptySchema!)).to.be.true;

      const testClass = await testSchema.getItem("TestClass");
      expect(testClass).to.exist;
      expect(mockVisitor!.visitClass!.calledOnce).to.be.true;
      expect(mockVisitor!.visitClass!.calledWithExactly(testClass)).to.be.true;
      expect(mockVisitor!.visitClass!.calledAfter(mockVisitor!.visitEmptySchema!)).to.be.true;

      const testKoq = await testSchema.getItem("TestKoQ");
      expect(testKoq).to.exist;
      expect(mockVisitor!.visitKindOfQuantity!.calledOnce).to.be.true;
      expect(mockVisitor!.visitKindOfQuantity!.calledWithExactly(testKoq)).to.be.true;
      expect(mockVisitor!.visitKindOfQuantity!.calledAfter(mockVisitor!.visitEmptySchema!)).to.be.true;

      expect(mockVisitor!.visitFullSchema!.calledOnce).to.be.true;
      expect(mockVisitor!.visitFullSchema!.calledWithExactly(testSchema)).to.be.true;
      expect(mockVisitor!.visitFullSchema!.calledAfter(mockVisitor!.visitEnumeration!)).to.be.true;
      expect(mockVisitor!.visitFullSchema!.calledAfter(mockVisitor!.visitPropertyCategory!)).to.be.true;
      expect(mockVisitor!.visitFullSchema!.calledAfter(mockVisitor!.visitClass!)).to.be.true;
      expect(mockVisitor!.visitFullSchema!.calledAfter(mockVisitor!.visitKindOfQuantity!)).to.be.true;
    });

    it("should safely handle Mixin-appliesTo-EntityClass-extends-Mixin cycle", async () => {
      const schemaJson = {
        ...baseJson,
        items: {
          AMixin: {
            schemaItemType: "Mixin",
            appliesTo: "TestSchema.BEntityClass",
            description: "Description for AMixin",
          },
          BEntityClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.AMixin",
            description: "Description for BEntityClass",
          },
        },
      };

      const descriptions: string[] = [];
      mockVisitor = {
        visitClass: sinon.spy(async (c: AnyClass) => {
          if (c.schemaItemType === SchemaItemType.EntityClass && c.baseClass)
            descriptions.push((await c.baseClass).description!);
          else if (c.schemaItemType === SchemaItemType.Mixin && c.appliesTo)
            descriptions.push((await c.appliesTo).description!);
        }) as any,
      };

      const context = new SchemaContext();
      let testSchema = new Schema(context);
      const reader = new SchemaReadHelper(JsonParser, context, mockVisitor);

      testSchema = await reader.readSchema(testSchema, schemaJson);
      expect(testSchema).to.exist;
      expect(mockVisitor!.visitClass!.calledTwice).to.be.true;
      expect(descriptions).to.have.lengthOf(2);

      const testMixin = await testSchema.getItem("AMixin");
      expect(testMixin).to.exist;

      const testEntity = await testSchema.getItem("BEntityClass");
      expect(testEntity).to.exist;

      expect(mockVisitor!.visitClass!.firstCall.calledWithExactly(testEntity)).to.be.true;
      expect(descriptions[0]).to.equal("Description for AMixin",
        `ISchemaPartVisitor.visitClass was called for "BEntityClass" before its base class, "AMixin" was fully deserialized.`);

      expect(mockVisitor!.visitClass!.secondCall.calledWithExactly(testMixin)).to.be.true;
      expect(descriptions[1]).to.equal("Description for BEntityClass",
        `ISchemaPartVisitor.visitClass was called for "AMixin" before its appliesTo class, "BEntityClass" was fully deserialized.`);
    });

    it("should safely handle EntityClass-extends-Mixin-appliesTo-EntityClass cycle", async () => {
      const schemaJson = {
        ...baseJson,
        items: {
          AEntityClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.BMixin",
            description: "Description for AEntityClass",
          },
          BMixin: {
            schemaItemType: "Mixin",
            appliesTo: "TestSchema.AEntityClass",
            description: "Description for BMixin",
          },
        },
      };

      const descriptions: string[] = [];
      mockVisitor = {
        visitClass: sinon.spy(async (c: AnyClass) => {
          if (c.schemaItemType === SchemaItemType.EntityClass && c.baseClass)
            descriptions.push((await c.baseClass).description!);
          else if (c.schemaItemType === SchemaItemType.Mixin && c.appliesTo)
            descriptions.push((await c.appliesTo).description!);
        }) as any,
      };

      const context = new SchemaContext();
      let testSchema = new Schema(context);
      const reader = new SchemaReadHelper(JsonParser, context, mockVisitor);

      testSchema = await reader.readSchema(testSchema, schemaJson);
      expect(testSchema).to.exist;
      expect(mockVisitor!.visitClass!.calledTwice).to.be.true;
      expect(descriptions).to.have.lengthOf(2);

      const testEntity = await testSchema.getItem("AEntityClass");
      expect(testEntity).to.exist;

      const testMixin = await testSchema.getItem("BMixin");
      expect(testMixin).to.exist;

      expect(mockVisitor!.visitClass!.firstCall.calledWithExactly(testMixin)).to.be.true;
      expect(descriptions[0]).to.equal("Description for AEntityClass",
        `ISchemaPartVisitor.visitClass was called for "BMixin" before its appliesTo class, "AEntityClass" was fully deserialized.`);

      expect(mockVisitor!.visitClass!.secondCall.calledWithExactly(testEntity)).to.be.true;
      expect(descriptions[1]).to.equal("Description for BMixin",
        `ISchemaPartVisitor.visitClass was called for "AEntityClass" before its base class, "BMixin" was fully deserialized.`);
    });

    it("should safely handle EntityClass-navProp-RelationshipClass-constraint-EntityClass cycle", async () => {
      const schemaJson = {
        ...baseJson,
        items: {
          AEntityClass: {
            schemaItemType: "EntityClass",
            description: "Description for AEntityClass",
            properties: [
              {
                type: "NavigationProperty",
                name: "testNavProp",
                relationshipName: "TestSchema.BRelationshipClass",
                direction: "forward",
              },
            ],
          },
          BRelationshipClass: {
            schemaItemType: "RelationshipClass",
            description: "Description for BRelationshipClass",
            strength: "Embedding",
            strengthDirection: "Forward",
            source: {
              multiplicity: "(0..1)",
              roleLabel: "Source roleLabel",
              polymorphic: false,
              constraintClasses: ["TestSchema.AEntityClass"],
            },
            target: {
              multiplicity: "(0..*)",
              roleLabel: "Target roleLabel",
              polymorphic: false,
              constraintClasses: ["TestSchema.AEntityClass"],
            },
          },
        },
      };

      const descriptions: string[] = [];
      mockVisitor = {
        visitClass: sinon.spy(async (c: AnyClass) => {
          if (c.schemaItemType === SchemaItemType.RelationshipClass)
            descriptions.push((await c.source.abstractConstraint!).description!);
          else if (c.schemaItemType === SchemaItemType.EntityClass) {
            const prop = [...c.properties!][0] as NavigationProperty;
            descriptions.push((await prop.relationshipClass).description!);
          }
        }) as any,
      };

      const context = new SchemaContext();
      let testSchema = new Schema(context);
      const reader = new SchemaReadHelper(JsonParser, context, mockVisitor);

      testSchema = await reader.readSchema(testSchema, schemaJson);
      expect(testSchema).to.exist;
      expect(mockVisitor!.visitClass!.calledTwice).to.be.true;
      expect(descriptions).to.have.lengthOf(2);

      const testEntity = await testSchema.getItem("AEntityClass");
      expect(testEntity).to.exist;

      const testRelationship = await testSchema.getItem("BRelationshipClass");
      expect(testRelationship).to.exist;

      expect(mockVisitor!.visitClass!.firstCall.calledWithExactly(testRelationship)).to.be.true;
      expect(descriptions[0]).to.equal("Description for AEntityClass",
        `ISchemaPartVisitor.visitClass was called for "BRelationshipClass" before the entity class its constraints use, "AEntityClass" was fully deserialized.`);

      expect(mockVisitor!.visitClass!.secondCall.calledWithExactly(testEntity)).to.be.true;
      expect(descriptions[1]).to.equal("Description for BRelationshipClass",
        `ISchemaPartVisitor.visitClass was called for "AEntityClass" before the relationship its NavigationProperty uses, "BRelationshipClass" was fully deserialized.`);
    });

    it("should safely handle RelationshipClass-constraint-EntityClass-navProp-RelationshipClass cycle", async () => {
      const schemaJson = {
        ...baseJson,
        items: {
          ARelationshipClass: {
            schemaItemType: "RelationshipClass",
            description: "Description for ARelationshipClass",
            strength: "referencing",
            strengthDirection: "Forward",
            source: {
              multiplicity: "(0..*)",
              roleLabel: "Source roleLabel",
              polymorphic: true,
              constraintClasses: ["TestSchema.BEntityClass"],
            },
            target: {
              multiplicity: "(1..*)",
              roleLabel: "Target roleLabel",
              polymorphic: true,
              constraintClasses: ["TestSchema.BEntityClass"],
            },
          },
          BEntityClass: {
            schemaItemType: "EntityClass",
            description: "Description for BEntityClass",
            properties: [
              {
                type: "NavigationProperty",
                name: "testNavProp",
                relationshipName: "TestSchema.ARelationshipClass",
                direction: "forward",
              },
            ],
          },
        },
      };

      const descriptions: string[] = [];
      mockVisitor = {
        visitClass: sinon.spy(async (c: AnyClass) => {
          if (c.schemaItemType === SchemaItemType.RelationshipClass)
            descriptions.push((await c.source.abstractConstraint!).description!);
          else if (c.schemaItemType === SchemaItemType.EntityClass) {
            const prop = [...c.properties!][0] as NavigationProperty;
            descriptions.push((await prop.relationshipClass).description!);
          }
        }) as any,
      };

      const context = new SchemaContext();
      let testSchema = new Schema(context);
      const reader = new SchemaReadHelper(JsonParser, context, mockVisitor);

      testSchema = await reader.readSchema(testSchema, schemaJson);
      expect(testSchema).to.exist;
      expect(mockVisitor!.visitClass!.calledTwice).to.be.true;
      expect(descriptions).to.have.lengthOf(2);

      const testRelationship = await testSchema.getItem("ARelationshipClass");
      expect(testRelationship).to.exist;

      const testEntity = await testSchema.getItem("BEntityClass");
      expect(testEntity).to.exist;

      expect(mockVisitor!.visitClass!.firstCall.calledWithExactly(testEntity)).to.be.true;
      expect(descriptions[0]).to.equal("Description for ARelationshipClass",
        `ISchemaPartVisitor.visitClass was called for "BEntityClass" before the relationship its NavigationProperty uses, "ARelationshipClass" was fully deserialized.`);

      expect(mockVisitor!.visitClass!.secondCall.calledWithExactly(testRelationship)).to.be.true;
      expect(descriptions[1]).to.equal("Description for BEntityClass",
        `ISchemaPartVisitor.visitClass was called for "ARelationshipClass" before the entity class its constraints use, "BEntityClass" was fully deserialized.`);

    });
  });

  describe("with schema custom attributes", () => {
    const baseJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "ValidSchema",
      version: "1.2.3",
      alias: "vs",
      label: "SomeDisplayLabel",
      description: "A really long description...",
      items: {
        TestCAClassA: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
        TestCAClassB: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
      },
    };

    const oneCustomAttributeJson = {
      ...baseJson,
      customAttributes: [
        {
          className: "ValidSchema.TestCAClassA",
          ShowClasses: true,
        },
      ],
    };

    it("async - single schema CustomAttribute", async () => {
      const testSchema = await Schema.fromJson(oneCustomAttributeJson, new SchemaContext());
      expect(testSchema).to.exist;
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      assert.isTrue(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")!.ShowClasses);
    });

    it("sync - single schema CustomAttribute", () => {
      const testSchema = Schema.fromJsonSync(oneCustomAttributeJson, new SchemaContext());
      expect(testSchema).to.exist;
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      assert.isTrue(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")!.ShowClasses);
    });

    const twoCustomAttributeJson = {
      ...baseJson,
      customAttributes: [
        {
          className: "ValidSchema.TestCAClassA",
        },
        {
          className: "ValidSchema.TestCAClassB",
        },
      ],
    };

    it("async - multiple schema CustomAttributes", async () => {
      const testSchema = await Schema.fromJson(twoCustomAttributeJson, new SchemaContext());
      expect(testSchema).to.exist;
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassB")).to.exist;
    });

    it("sync - multiple schema CustomAttributes", () => {
      const testSchema = Schema.fromJsonSync(twoCustomAttributeJson, new SchemaContext());
      expect(testSchema).to.exist;
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassB")).to.exist;
    });

    it("sync - multiple schema CustomAttributes with additional properties", () => {
      const propertyJson = {
        ...baseJson,
        customAttributes: [
          {
            className: "ValidSchema.TestCAClassA",
            ShowClasses: false,
          },
          {
            className: "ValidSchema.TestCAClassB",
            ShowClasses: true,
          },
        ],
      };

      const testSchema = Schema.fromJsonSync(propertyJson, new SchemaContext());
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      expect(testSchema.customAttributes!.get("ValidSchema.TestCAClassB")).to.exist;
      assert.isFalse(testSchema.customAttributes!.get("ValidSchema.TestCAClassA")!.ShowClasses);
      assert.isTrue(testSchema.customAttributes!.get("ValidSchema.TestCAClassB")!.ShowClasses);
    });

    it("with class containing attribute with no namespace", () => {
      const parser = new DOMParser();
      const schemaXml = `<?xml version="1.0" encoding="utf-8"?>
        <ECSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
          <ECCustomAttributeClass typeName="TestAttribute" description="Test attribute" displayLabel="Test Attribute" appliesTo="Schema" modifier="Sealed"/>
          <ECEntityClass typeName="EntityTest"
                        description="Test Entity Class"
                        modifier="None">
            <ECCustomAttributes>
              <TestAttribute/>
            </ECCustomAttributes>
          </ECEntityClass>
        </ECSchema>`;
      const document = parser.parseFromString(schemaXml);
      const context = new SchemaContext();
      let schema: Schema = new Schema(context);
      const reader = new SchemaReadHelper(XmlParser, context);

      schema = reader.readSchemaSync(schema, document);
      expect(schema).to.not.be.undefined;
    });

    it("with class containing attribute with no namespace, custom attribute not defined in schema, throws", () => {
      const parser = new DOMParser();
      const schemaXml = `<?xml version="1.0" encoding="utf-8"?>
        <ECSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
          <ECEntityClass typeName="EntityTest"
                        description="Test Entity Class"
                        modifier="None">
            <ECCustomAttributes>
              <TestAttribute/>
            </ECCustomAttributes>
          </ECEntityClass>
        </ECSchema>`;
      const document = parser.parseFromString(schemaXml);
      const context = new SchemaContext();
      const schema: Schema = new Schema(context);
      const reader = new SchemaReadHelper(XmlParser, context);

      expect(() => reader.readSchemaSync(schema, document)).to.throw(ECObjectsError, "Unable to locate SchemaItem TestSchema.TestAttribute.");
    });
  });

  it("with valid custom attribute namespace and version", () => {
    const parser = new DOMParser();
    const schemaXml = `<?xml version="1.0" encoding="utf-8"?>
      <ECSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECEntityClass typeName="EntityTest"
                      description="Test Entity Class"
                      modifier="None">
          <ECCustomAttributes>
            <TestAttribute xmlns="TestSchemaName.1.2.3"/>
          </ECCustomAttributes>
        </ECEntityClass>
      </ECSchema>`;
    const document = parser.parseFromString(schemaXml);
    const context = new SchemaContext();
    const schema: Schema = new Schema(context);
    const reader = new SchemaReadHelper(XmlParser, context);

    expect(() => reader.readSchemaSync(schema, document)).not.to.throw(ECObjectsError, "Custom attribute namespaces must contain a valid 3.2 full schema name in the form <schemaName>.RR.ww.mm.");
  });

  it("with invalid custom attribute namespace", () => {
    const parser = new DOMParser();
    const schemaXml = `<?xml version="1.0" encoding="utf-8"?>
      <ECSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
        <ECEntityClass typeName="EntityTest"
                      description="Test Entity Class"
                      modifier="None">
          <ECCustomAttributes>
            <TestAttribute xmlns="TestSchemaName.1.2"/>
          </ECCustomAttributes>
        </ECEntityClass>
      </ECSchema>`;
    const document = parser.parseFromString(schemaXml);
    const context = new SchemaContext();
    const schema: Schema = new Schema(context);
    const reader = new SchemaReadHelper(XmlParser, context);

    expect(() => reader.readSchemaSync(schema, document)).to.throw(ECObjectsError, "Custom attribute namespaces must contain a valid 3.2 full schema name in the form <schemaName>.RR.ww.mm.");
  });

  describe("with property custom attributes", () => {
    const getSchemaJson = (propJson: any) => ({
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "ValidSchema",
      version: "1.2.3",
      alias: "vs",
      items: {
        TestCAClassA: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyProperty" },
        TestCAClassB: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyProperty" },
        TestCAClassC: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyProperty" },
        TestClass: {
          schemaItemType: "EntityClass",
          properties: [
            {
              name: "TestProp",
              type: "PrimitiveProperty",
              typeName: "int",
              ...propJson,
            },
          ],
        },
      },
    });

    const oneCustomAttributeJson = getSchemaJson({
      customAttributes: [
        {
          className: "ValidSchema.TestCAClassA",
          ExampleAttribute: 1234,
        },
      ],
    });

    it("async - single property CustomAttribute", async () => {
      const testSchema = await Schema.fromJson(oneCustomAttributeJson, new SchemaContext());
      expect(testSchema).to.exist;
      const testProp = [...(await testSchema.getItem("TestClass") as AnyClass).properties!][0];
      expect(testProp).to.exist;
      expect(testProp.name).to.eql("TestProp");
      expect(testProp.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      assert.strictEqual(testProp.customAttributes!.get("ValidSchema.TestCAClassA")!.ExampleAttribute, 1234);
    });

    it("sync - single property CustomAttribute", () => {
      const testSchema = Schema.fromJsonSync(oneCustomAttributeJson, new SchemaContext());
      expect(testSchema).to.exist;
      const testProp = [...(testSchema.getItemSync("TestClass") as AnyClass).properties!][0];
      expect(testProp).to.exist;
      expect(testProp.name).to.eql("TestProp");
      expect(testProp.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      assert.strictEqual(testProp.customAttributes!.get("ValidSchema.TestCAClassA")!.ExampleAttribute, 1234);
    });

    const twoCustomAttributesJson = getSchemaJson({
      customAttributes: [
        {
          className: "ValidSchema.TestCAClassA",
        },
        {
          className: "ValidSchema.TestCAClassB",
        },
      ],
    });

    it("async - multiple property CustomAttributes", async () => {
      const testSchema = await Schema.fromJson(twoCustomAttributesJson, new SchemaContext());
      expect(testSchema).to.exist;
      const testProp = [...(await testSchema.getItem("TestClass") as AnyClass).properties!][0];
      expect(testProp).to.exist;
      expect(testProp.name).to.eql("TestProp");
      expect(testProp.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      expect(testProp.customAttributes!.get("ValidSchema.TestCAClassB")).to.exist;
    });

    it("sync - multiple property CustomAttributes", () => {
      const testSchema = Schema.fromJsonSync(twoCustomAttributesJson, new SchemaContext());
      expect(testSchema).to.exist;
      const testProp = [...(testSchema.getItemSync("TestClass") as AnyClass).properties!][0];
      expect(testProp).to.exist;
      expect(testProp.name).to.eql("TestProp");
      expect(testProp.customAttributes!.get("ValidSchema.TestCAClassA")).to.exist;
      expect(testProp.customAttributes!.get("ValidSchema.TestCAClassB")).to.exist;
    });

    it("sync - multiple property CustomAttributes with additional properties", () => {
      const propertyJson = {
        customAttributes: [
          {
            className: "ValidSchema.TestCAClassA",
            ShowClasses: 1.2,
          },
          {
            className: "ValidSchema.TestCAClassB",
            ExampleAttribute: true,
          },
          {
            className: "ValidSchema.TestCAClassC",
            Example2Attribute: "example",
          },
        ],
      };

      const testSchema = Schema.fromJsonSync(getSchemaJson(propertyJson), new SchemaContext());
      expect(testSchema).to.exist;
      const testProp = [...(testSchema.getItemSync("TestClass") as AnyClass).properties!][0];
      expect(testProp).to.exist;

      assert.strictEqual(testProp.customAttributes!.get("ValidSchema.TestCAClassA")!.ShowClasses, 1.2);
      assert.isTrue(testProp.customAttributes!.get("ValidSchema.TestCAClassB")!.ExampleAttribute);
      assert.strictEqual(testProp.customAttributes!.get("ValidSchema.TestCAClassC")!.Example2Attribute, "example");
    });
  });
});
