/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { SchemaContext } from "../../Context";
import { ECClassModifier, PrimitiveType, SchemaItemType, StrengthDirection } from "../../ECObjects";
import {
  EntityClass, EntityClassProps, Enumeration, EnumerationProperty, Format, InvertedUnit, KindOfQuantity,
  KindOfQuantityProps, NavigationProperty, Phenomenon, PrimitiveArrayProperty, PrimitiveProperty, PropertyCategory, RelationshipClass,
  RelationshipClassProps, RelationshipConstraintProps, StructArrayProperty, StructClass, StructProperty, Unit, UnitSystem,
} from "../../ecschema-metadata";
import { FormatTraits, FormatType } from "@bentley/imodeljs-quantity";
import { SchemaContextEditor } from "../../Editor/Editor";
import { Schema } from "../../Metadata/Schema";
import { ECVersion, SchemaItemKey, SchemaKey } from "../../SchemaKey";

/* eslint-disable @typescript-eslint/naming-convention */

// TODO: Add tests for cases where invalid names are passed into props objects. (to test the error message)
describe("Editor tests", () => {

  function normalizeLineEnds(s: string): string {
    return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  describe("SchemaEditor tests", () => {
    let testEditor: SchemaContextEditor;
    let testSchema: Schema;
    let testKey: SchemaKey;
    let context: SchemaContext;
    describe("should create a new schema from a context", () => {
      beforeEach(() => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
      });

      it("should create a new schema and return a SchemaEditResults", async () => {
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        expect(result).to.not.eql(undefined);
      });

      it("upon schema creation, return a defined SchemaKey from SchemaEditResults", async () => {
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        expect(result.schemaKey?.name).to.eql("testSchema");
        expect(result.schemaKey?.version).to.eql(new ECVersion(1, 0, 0));
      });
    });

    describe("addCustomAttribute Tests", () => {
      it("CustomAttribute defined in same schema, instance added successfully.", async () => {
        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "ValidSchema",
          version: "1.2.3",
          alias: "vs",
          items: {
            TestCustomAttribute: {
              schemaItemType: "CustomAttributeClass",
              appliesTo: "Schema",
            },
          },
        };

        context = new SchemaContext();
        testSchema = await Schema.fromJson(schemaJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = testSchema.schemaKey;

        const result = await testEditor.addCustomAttribute(testKey, { className: "TestCustomAttribute" });

        expect(result).to.eql({});
        expect(testSchema.customAttributes && testSchema.customAttributes.has("TestCustomAttribute")).to.be.true;
      });

      it("CustomAttribute defined in different schema, instance added successfully.", async () => {
        const schemaAJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaA",
          version: "1.2.3",
          alias: "vs",
          references: [
            {
              name: "SchemaB",
              version: "1.2.3",
            },
          ],
        };
        const schemaBJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaB",
          version: "1.2.3",
          alias: "vs",
          items: {
            TestCustomAttribute: {
              schemaItemType: "CustomAttributeClass",
              appliesTo: "Schema",
            },
          },
        };

        context = new SchemaContext();
        await Schema.fromJson(schemaBJson, context);
        const schemaA = await Schema.fromJson(schemaAJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = schemaA.schemaKey;

        const result = await testEditor.addCustomAttribute(testKey, { className: "SchemaB.TestCustomAttribute" });

        expect(result).to.eql({});
        expect(schemaA.customAttributes && schemaA.customAttributes.has("SchemaB.TestCustomAttribute")).to.be.true;
      });

      it("CustomAttribute class not found, error reported successfully.", async () => {
        const schemaAJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaA",
          version: "1.2.3",
          alias: "vs",
          customAttributes: [
          ],
          references: [
            {
              name: "SchemaB",
              version: "1.2.3",
            },
          ],
        };
        const schemaBJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaB",
          version: "1.2.3",
          alias: "vs",
        };

        context = new SchemaContext();
        await Schema.fromJson(schemaBJson, context);
        const schemaA = await Schema.fromJson(schemaAJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = schemaA.schemaKey;

        const result = await testEditor.addCustomAttribute(testKey, { className: "SchemaB.TestCustomAttribute" });

        expect(result.errorMessage).to.eql("ECObjects-502: The CustomAttribute container 'SchemaA' has a CustomAttribute with the class 'SchemaB.TestCustomAttribute' which cannot be found.\r\n");
        expect(schemaA.customAttributes && schemaA.customAttributes.has("SchemaB.TestCustomAttribute")).to.be.false;
      });
    });

    describe("addSchemaReference Tests", () => {
      it("Schema reference is valid, reference added successfully.", async () => {
        const refSchemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "RefSchema",
          version: "1.0.0",
          alias: "rs",
        };

        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "TestSchema",
          version: "1.0.0",
          alias: "ts",
        };

        context = new SchemaContext();
        testSchema = await Schema.fromJson(schemaJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = testSchema.schemaKey;
        const refSchema = await Schema.fromJson(refSchemaJson, context);

        const result = await testEditor.addSchemaReference(testKey, refSchema);

        expect(result).to.eql({});
        expect(testSchema.getReferenceNameByAlias("rs")).to.equal("RefSchema");
        expect(await testEditor.schemaContext.getCachedSchema(refSchema.schemaKey)).to.eql(refSchema);
      });

      it("Multiple validation errors, results formatted properly.", async () => {
        const schemaAJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaA",
          version: "1.0.0",
          alias: "a",
          references: [
            {
              name: "SchemaB",
              version: "1.0.0",
            },
          ],
        };
        const schemaBJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaB",
          version: "1.0.0",
          alias: "b",
        };
        const schemaCJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaC",
          version: "1.0.0",
          alias: "b",
          references: [
            {
              name: "SchemaA",
              version: "1.0.0",
            },
          ],
        };

        context = new SchemaContext();
        await Schema.fromJson(schemaBJson, context);
        const schemaA = await Schema.fromJson(schemaAJson, context);
        const schemaC = await Schema.fromJson(schemaCJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = schemaA.schemaKey;

        const result = await testEditor.addSchemaReference(schemaA.schemaKey, schemaC);

        expect(result.errorMessage).not.undefined;
        expect(normalizeLineEnds(result.errorMessage!)).to.equal(normalizeLineEnds("ECObjects-2: Schema 'SchemaA' has multiple schema references (SchemaB, SchemaC) with the same alias 'b', which is not allowed.\r\nECObjects-3: Schema 'SchemaA' has reference cycles: SchemaC --> SchemaA, SchemaA --> SchemaC\r\n"));
        expect(schemaA.getReferenceSync("SchemaC")).to.be.undefined;
      });
    });

    describe("edits an existing schema", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        alias: "ts",
        items: {
          testEnum: {
            schemaItemType: "Enumeration",
            type: "int",
            enumerators: [
              {
                name: "ZeroValue",
                value: 0,
                label: "None",
              },
            ],
          },
          testClass: {
            schemaItemType: "EntityClass",
            label: "ExampleEntity",
            description: "An example entity class.",
          },
          ExampleMixin: {
            schemaItemType: "Mixin",
            appliesTo: "TestSchema.testClass",
          },
          ExampleStruct: {
            schemaItemType: "StructClass",
            name: "ExampleStruct",
            modifier: "sealed",
            properties: [
              {
                type: "PrimitiveArrayProperty",
                name: "ExamplePrimitiveArray",
                typeName: "TestSchema.testEnum",
                minOccurs: 7,
                maxOccurs: 20,
              },
            ],
          },
        },
      };
      beforeEach(async () => {
        context = new SchemaContext();
        testSchema = await Schema.fromJson(schemaJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = testSchema.schemaKey;
      });

      it("should get the correct Schema", async () => {
        expect(await testEditor.schemaContext.getSchema(testKey)).to.eql(testSchema);
      });

      it("upon manual key creation, still create a valid property to an existing entity", async () => {
        const schemaKey = new SchemaKey("TestSchema");
        const entityKey = new SchemaItemKey("testClass", schemaKey);
        await testEditor.entities.createPrimitiveProperty(entityKey, "testProperty", PrimitiveType.Integer);
        const testEntity = await testEditor.schemaContext.getSchemaItem(entityKey) as EntityClass;
        expect(await testEntity.getProperty("testProperty")).to.not.eql(undefined);
      });

      it("should get the right entity class from existing schema", async () => {
        const createdKey = new SchemaKey("TestSchema");
        const cachedSchema = await testEditor.schemaContext.getCachedSchema(createdKey);
        const testEntity = await cachedSchema!.getItem("testClass");
        expect(testEntity?.label).to.eql("ExampleEntity");
      });

      it("should add a property to existing entity", async () => {
        const entityKey = new SchemaItemKey("testClass", testKey);
        await testEditor.entities.createPrimitiveProperty(entityKey, "testProperty", PrimitiveType.Integer);
        const testEntity = await testSchema.getItem("testClass") as EntityClass;
        expect(await testEntity.getProperty("testProperty")).to.not.eql(undefined);
      });
    });

    describe("Entities tests", () => {
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;
      });

      it("should create a new entity class using a SchemaEditor", async () => {
        await testEditor.entities.create(testKey, "testEntity", ECClassModifier.None);
        const schema = await testEditor.schemaContext.getCachedSchema(testKey);
        expect((await schema?.getItem("testEntity"))?.schemaItemType).to.eql(SchemaItemType.EntityClass);
      });

      it("should create a new entity class with a base class", async () => {
        const testEntityBaseRes = await testEditor.entities.create(testKey, "testEntityBase", ECClassModifier.None);
        const result = await testEditor.entities.create(testKey, "testEntity", ECClassModifier.None, "testLabel", testEntityBaseRes.itemKey);

        const testEntity = await testEditor.schemaContext.getSchemaItem<EntityClass>(result.itemKey!);
        expect(await testEntity?.baseClass).to.eql(await testEditor.schemaContext.getSchemaItem(testEntityBaseRes.itemKey!));
        expect(testEntity?.label).to.eql("testLabel");
      });

      it("should create a new entity class using EntityClassProps", async () => {
        const entityClassProps: EntityClassProps = {
          name: "testEntity",
          modifier: "abstract",
        };

        const result = await testEditor.entities.createFromProps(testKey, entityClassProps);
        const testEntity = await testEditor.schemaContext.getSchemaItem<EntityClass>(result.itemKey!);
        expect(testEntity?.modifier).to.eql(ECClassModifier.Abstract);
      });

      it("should create a new entity class using EntityClassProps with a base class provided.", async () => {
        const testEntityBaseRes = await testEditor.entities.create(testKey, "testEntityBase", ECClassModifier.None);
        const entityClassProps: EntityClassProps = {
          name: "testEntity",
          modifier: "abstract",
          baseClass: testEntityBaseRes.itemKey?.fullName, // Must be full name to reflect the key.
        };

        const result = await testEditor.entities.createFromProps(testKey, entityClassProps);
        const testEntity = await testEditor.schemaContext.getSchemaItem<EntityClass>(result.itemKey!);
        expect(await testEntity?.baseClass).to.eql(await testEditor.schemaContext.getSchemaItem(testEntityBaseRes.itemKey!));
      });
    });

    describe("Mixins tests", () => {
      let entityKey: SchemaItemKey;
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;

        const entityResult = await testEditor.entities.create(testKey, "testEntity", ECClassModifier.None);
        entityKey = entityResult.itemKey!;

      });

      it("should create a new mixin", async () => {
        const mixinResult = await testEditor.mixins.create(testKey, "testMixin", entityKey);
        expect(testEditor.schemaContext.getSchemaItemSync(mixinResult.itemKey!)?.name).to.eql("testMixin");
      });
    });

    describe("Relationship tests from an existing schema", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          SourceBaseEntity: {
            schemaItemType: "EntityClass",
          },
          TargetBaseEntity: {
            schemaItemType: "EntityClass",
          },
          TestSourceEntity: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.SourceBaseEntity",
          },
          TestTargetEntity: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.TargetBaseEntity",
          },
        },
      };
      beforeEach(async () => {
        context = new SchemaContext();
        testSchema = await Schema.fromJson(schemaJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = testSchema.schemaKey;
      });

      it("should create a relationship class given a valid RelationshipClassProps", async () => {
        const sourceJson: RelationshipConstraintProps = {
          polymorphic: true,
          multiplicity: "(0..*)",
          roleLabel: "Source RoleLabel",
          abstractConstraint: "TestSchema.SourceBaseEntity",
          constraintClasses: [
            "TestSchema.TestSourceEntity",
          ],
        };
        const targetJson: RelationshipConstraintProps = {
          polymorphic: true,
          multiplicity: "(0..*)",
          roleLabel: "Target RoleLabel",
          abstractConstraint: "TestSchema.TargetBaseEntity",
          constraintClasses: [
            "TestSchema.TestTargetEntity",
          ],
        };

        const relClassProps: RelationshipClassProps = {
          name: "TestRelationship",
          strength: "Embedding",
          strengthDirection: "Forward",
          source: sourceJson,
          target: targetJson,
        };

        const result = await testEditor.relationships.createFromProps(testKey, relClassProps);
        const relClass = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as RelationshipClass;
        const baseSourceClassKey = testSchema.getSchemaItemKey("TestSchema.SourceBaseEntity");
        expect(await relClass.source.abstractConstraint).to.eql(await testEditor.schemaContext.getSchemaItem(baseSourceClassKey));
      });
    });

    describe("Formats tests", () => {
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;
      });

      it("should create a valid Format", async () => {
        const result = await testEditor.formats.create(testKey, "testFormat", FormatType.Decimal, "testLabel");
        const format = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as Format;
        expect(format.fullName).to.eql("testSchema.testFormat");
        expect(format.label).to.eql("testLabel");
      });

      it("should create a valid Format from FormatProps", async () => {
        const formatProps = {
          name: "testFormat",
          type: "Station",
          precision: 5,
          roundFactor: 5,
          minWidth: 5,
          showSignOption: "noSign",
          formatTraits: "KeepDecimalPoint",
          decimalSeparator: ",",
          thousandSeparator: ",",
          uomSeparator: "",
          scientificType: "",
          stationOffsetSize: 4,
          stationSeparator: "",
        };

        const result = await testEditor.formats.createFromProps(testKey, formatProps);
        const format = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as Format;
        expect(format?.fullName).to.eql("testSchema.testFormat");
        expect(format?.decimalSeparator).to.eql(",");
        expect(format?.stationOffsetSize).to.eql(4);
        expect(format?.formatTraits).to.eql(FormatTraits.KeepDecimalPoint);

      });
      // TODO: Add test when units are given (needs the unit editing to be created.)
    });

    // TODO: Must add phenomenon and Unit system tests before you can do this.
    describe("Phenomenons tests", () => {
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;
      });

      it("should create a valid phenomenon", async () => {
        const result = await testEditor.phenomenons.create(testKey, "testPhenomenon", "Units.LENGTH(2)");
        const phenomenon = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as Phenomenon;
        expect(phenomenon.definition).to.eql("Units.LENGTH(2)");
      });

      it("should create a valid phenomenon from PhenomenonProps", async () => {
        const phenomenonProps = {
          name: "testPhenomenon",
          description: "test description",
          definition: "Units.LENGTH(2)",
        };
        const result = await testEditor.phenomenons.createFromProps(testKey, phenomenonProps);
        const phenomenon = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as Phenomenon;
        expect(phenomenon.description).to.eql("test description");
        expect(phenomenon.definition).to.eql("Units.LENGTH(2)");
        expect(phenomenon.fullName).to.eql("testSchema.testPhenomenon");
      });
    });

    describe("UnitSystems tests", () => {
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;
      });

      it("should create a valid UnitSystem from UnitSystemProps", async () => {
        const unitSystemProps = {
          name: "testUnitSystem",
          description: "test description",
          label: "testDec",
        };
        const result = await testEditor.unitSystems.createFromProps(testKey, unitSystemProps);
        const testUnitSystem = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as UnitSystem;
        expect(testUnitSystem.schemaItemType).to.eql(SchemaItemType.UnitSystem);
        expect(testUnitSystem.fullName).to.eql("testSchema.testUnitSystem");
        expect(testUnitSystem.label).to.eql("testDec");
      });
    });

    describe("Units tests", () => {
      let phenomenonKey: SchemaItemKey;
      let unitSystemKey: SchemaItemKey;
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;

        const phenomRes = await testEditor.phenomenons.create(testKey, "testPhenomenon", "testDefinition");
        const unitSystemRes = await testEditor.unitSystems.create(testKey, "testUnitSystem");
        phenomenonKey = phenomRes.itemKey!;
        unitSystemKey = unitSystemRes.itemKey!;
      });

      it("should create a valid Unit given a unit system and a phenomenon", async () => {
        const unitRes = await testEditor.units.create(testKey, "testUnit", "testDefinition", phenomenonKey, unitSystemKey);
        const unit = await testEditor.schemaContext.getSchemaItem(unitRes.itemKey!) as Unit;

        expect(unit.fullName).to.eql("testSchema.testUnit");
        expect(await unit.phenomenon).to.eql(await testEditor.schemaContext.getSchemaItem(phenomenonKey));

      });

      it("should create a valid Unit given a UnitProps", async () => {
        const unitProps = {
          name: "testUnit",
          numerator: 20.5,
          phenomenon: phenomenonKey.fullName,
          unitSystem: unitSystemKey.fullName,
          definition: "testDefinition",
        };
        const unitRes = await testEditor.units.createFromProps(testKey, unitProps);
        const unit = await testEditor.schemaContext.getSchemaItem(unitRes.itemKey!) as Unit;

        expect(unit.fullName).to.eql("testSchema.testUnit");
        expect(unit.numerator).to.eql(20.5);
        expect(await unit.phenomenon).to.eql(await testEditor.schemaContext.getSchemaItem(phenomenonKey));
      });
    });

    describe("KindOfQuantities tests", () => {
      // let testFormatKey: SchemaItemKey;
      let phenomenonKey: SchemaItemKey;
      let unitSystemKey: SchemaItemKey;
      let unitKey: SchemaItemKey;
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;

        const phenomRes = await testEditor.phenomenons.create(testKey, "testPhenomenon", "testDefinition");
        const unitSystemRes = await testEditor.unitSystems.create(testKey, "testUnitSystem");
        phenomenonKey = phenomRes.itemKey!;
        unitSystemKey = unitSystemRes.itemKey!;
        const unitRes = await testEditor.units.create(testKey, "testUnit", "testDefinition", phenomenonKey, unitSystemKey);
        unitKey = unitRes.itemKey!;
      });

      it("should create a valid KindOfQuantity from KindOfQuantityProps", async () => {
        // TODO: further develop presentationUnits tests
        const koqProps: KindOfQuantityProps = {
          name: "testKoQ",
          relativeError: 2,
          persistenceUnit: "testSchema.testUnit",
          // presentationUnits: [
          //   "Formats.IN",
          //   "Formats.DefaultReal",
          // ],
        };

        const result = await testEditor.kindOfQuantities.createFromProps(testKey, koqProps);
        const kindOfQuantity = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as KindOfQuantity;
        expect(kindOfQuantity.fullName).to.eql("testSchema.testKoQ");
        expect(await kindOfQuantity.persistenceUnit).to.eql(await testEditor.schemaContext.getSchemaItem(unitKey));
      });
    });

    describe("Property Category tests", () => {
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;
      });

      it("should create a valid PropertyCategory", async () => {
        const result = await testEditor.propertyCategories.create(testKey, "testPropCategory", 5);
        const testPropCategory = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as PropertyCategory;
        expect(testPropCategory.priority).to.eql(5);
        expect(testPropCategory.schemaItemType).to.eql(SchemaItemType.PropertyCategory);
      });

      it("should create a valid Property Category from props", async () => {
        const propCatProps = {
          name: "testPropCategory",
          label: "testLbl",
          priority: 9,
        };
        const result = await testEditor.propertyCategories.createFromProps(testKey, propCatProps);
        const testPropCategory = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as PropertyCategory;
        expect(testPropCategory.priority).to.eql(9);
        expect(testPropCategory.label).to.eql("testLbl");
        expect(testPropCategory.schemaItemType).to.eql(SchemaItemType.PropertyCategory);
      });
    });

    describe("Inverted Units tests", () => {
      let invertsUnitKey: SchemaItemKey;
      let unitSystemKey: SchemaItemKey;
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;
        unitSystemKey = (await testEditor.unitSystems.create(testKey, "testUnitSystem")).itemKey!;
        const phenomenonKey = (await testEditor.phenomenons.create(testKey, "testPhenomenon", "testDefinition")).itemKey!;
        invertsUnitKey = (await testEditor.units.create(testKey, "testUnit", "testDefinition", phenomenonKey, unitSystemKey)).itemKey!;
      });

      it("should create a valid Inverted Unit", async () => {
        const result = await testEditor.invertedUnits.create(testKey, "testInvertedUnit", invertsUnitKey, unitSystemKey);
        const invertedUnit = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as InvertedUnit;

        expect(await invertedUnit.invertsUnit).to.eql(await testEditor.schemaContext.getSchemaItem(invertsUnitKey));
        expect(invertedUnit.fullName).to.eql("testSchema.testInvertedUnit");
      });

      it("should create a valid Inverted Unit from props", async () => {
        const invertedUnitProps = {
          name: "testInvertedUnit",
          description: "A random Inverted Unit",
          invertsUnit: invertsUnitKey.fullName,
          unitSystem: unitSystemKey.fullName,
        };

        const result = await testEditor.invertedUnits.createFromProps(testKey, invertedUnitProps);
        const invertedUnit = await testEditor.schemaContext.getSchemaItem(result.itemKey!) as InvertedUnit;

        expect(await invertedUnit.invertsUnit).to.eql(await testEditor.schemaContext.getSchemaItem(invertsUnitKey));
        expect(invertedUnit.fullName).to.eql("testSchema.testInvertedUnit");
      });
    });

    describe("Property creation tests", () => {
      // Uses an entity class to create properties.
      let entityKey: SchemaItemKey;
      let entity: EntityClass | undefined;
      beforeEach(async () => {
        context = new SchemaContext();
        testEditor = new SchemaContextEditor(context);
        const result = await testEditor.createSchema("TestSchema", "test", 1, 0, 0);
        testKey = result.schemaKey!;
        const entityRes = await testEditor.entities.create(testKey, "testEntity", ECClassModifier.None);
        entityKey = entityRes.itemKey!;
        entity = await testEditor.schemaContext.getSchemaItem(entityKey);
      });

      it("should successfully create a PrimitiveProperty from a JSON prop", async () => {
        const propertyJson = {
          name: "TestProperty",
          type: "PrimitiveProperty",
          typeName: "double",
          minLength: 2,
          maxLength: 4,
          minValue: 6,
          maxValue: 8,
          extendedTypeName: "SomeExtendedType",
        };
        const propResult = await testEditor.entities.createPrimitivePropertyFromProps(entityKey, "TestProperty", PrimitiveType.Double, propertyJson);
        const property = await entity?.getProperty(propResult.propertyName!) as PrimitiveProperty;
        expect(property.extendedTypeName).to.eql("SomeExtendedType");
        expect(property.minValue).to.eql(6);
        expect(property.maxValue).to.eql(8);
        expect(property.propertyType).to.eql(PrimitiveType.Double);
      });

      it("should successfully create an EnumerationProperty from a JSON prop", async () => {
        const enumJson = {
          name: "TestEnum",
          type: "int",
          isStrict: false,
          label: "SomeDisplayLabel",
          description: "A really long description...",
          enumerators: [
            { name: "SixValue", value: 6 },
            { name: "EightValue", value: 8, label: "An enumerator label" },
          ],
        };
        const propertyJson = {
          name: "TestProperty",
          type: "PrimitiveProperty",
          typeName: "TestSchema.TestEnum",
          minLength: 2,
          maxLength: 4,
          minValue: 6,
          maxValue: 8,
          extendedTypeName: "SomeExtendedType",
        };
        const enumResult = await testEditor.enumerations.createFromProps(testKey, enumJson);
        const enumeration = await testEditor.schemaContext.getSchemaItem(enumResult.itemKey!) as Enumeration;
        const propResult = await testEditor.entities.createEnumerationPropertyFromProps(entityKey, "TestProperty", enumeration, propertyJson);
        const property = await entity?.getProperty(propResult.propertyName!) as EnumerationProperty;
        expect(await property.enumeration).to.eql(enumeration);
      });

      it("should create a NavigationProperty", async () => {
        const schemaJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "TestSchema",
          version: "1.2.3",
          items: {
            SourceBaseEntity: {
              schemaItemType: "EntityClass",
            },
            TargetBaseEntity: {
              schemaItemType: "EntityClass",
            },
            TestSourceEntity: {
              schemaItemType: "EntityClass",
              baseClass: "TestSchema.SourceBaseEntity",
            },
            TestTargetEntity: {
              schemaItemType: "EntityClass",
              baseClass: "TestSchema.TargetBaseEntity",
            },
          },
        };
        const sourceJson: RelationshipConstraintProps = {
          polymorphic: true,
          multiplicity: "(0..*)",
          roleLabel: "Source RoleLabel",
          abstractConstraint: "TestSchema.SourceBaseEntity",
          constraintClasses: [
            "TestSchema.TestSourceEntity",
          ],
        };
        const targetJson: RelationshipConstraintProps = {
          polymorphic: true,
          multiplicity: "(0..*)",
          roleLabel: "Target RoleLabel",
          abstractConstraint: "TestSchema.TargetBaseEntity",
          constraintClasses: [
            "TestSchema.TestTargetEntity",
          ],
        };

        const relClassProps: RelationshipClassProps = {
          name: "TestRelationship",
          strength: "Embedding",
          strengthDirection: "Forward",
          source: sourceJson,
          target: targetJson,
        };
        context = new SchemaContext();
        testSchema = await Schema.fromJson(schemaJson, context);
        testEditor = new SchemaContextEditor(context);
        testKey = testSchema.schemaKey;
        const relationshipResult = await testEditor.relationships.createFromProps(testKey, relClassProps);
        const relationship = await testEditor.schemaContext.getSchemaItem(relationshipResult.itemKey!) as RelationshipClass;
        const propResult = await testEditor.relationships.createNavigationProperty(relationship.key, "TestProperty", relationship, "Forward");
        const navProperty = await relationship.getProperty(propResult.propertyName!) as NavigationProperty;
        expect(navProperty.direction).to.eql(StrengthDirection.Forward);
        expect(await navProperty.relationshipClass).to.eql(relationship);
      });

      it("should successfully create a PrimitiveArrayProperty from a JSON prop", async () => {
        const propertyJson = {
          name: "TestProperty",
          type: "PrimitiveArrayProperty",
          typeName: "int",
          minOccurs: 42,
          maxOccurs: 55,
        };

        const propResult = await testEditor.entities.createPrimitiveArrayPropertyFromProps(entityKey, "TestProperty", PrimitiveType.Integer, propertyJson);
        const property = await entity?.getProperty(propResult.propertyName!) as PrimitiveArrayProperty;
        expect(property.minOccurs).to.eql(42);
        expect(property.maxOccurs).to.eql(55);
      });

      it("should successfully create a StructProperty from a JSON prop", async () => {
        const propertyJson = {
          name: "TestProperty",
          type: "StructProperty",
          typeName: "TestSchema.TestStruct",
        };
        const classResult = await testEditor.structs.create(testKey, "TestStruct");
        const structClass = await testEditor.schemaContext.getSchemaItem(classResult.itemKey!) as StructClass;
        const propResult = await testEditor.entities.createStructPropertyFromProps(entityKey, "TestProperty", structClass, propertyJson);
        const property = await entity?.getProperty(propResult.propertyName!) as StructProperty;
        expect(property.structClass).to.eql(structClass);
      });

      it("should successfully create a StructArrayProperty from a JSON prop", async () => {
        const propertyJson = {
          name: "TestProperty",
          type: "StructArrayProperty",
          typeName: "TestSchema.TestStruct",
          minOccurs: 20,
          maxOccurs: 32,
        };

        const classResult = await testEditor.structs.create(testKey, "TestStruct");
        const structClass = await testEditor.schemaContext.getSchemaItem(classResult.itemKey!) as StructClass;

        const propResult = await testEditor.entities.createStructArrayPropertyFromProps(entityKey, "TestProperty", structClass, propertyJson);
        const property = await entity?.getProperty(propResult.propertyName!) as StructArrayProperty;
        expect(property.structClass).to.eql(structClass);
        expect(property.minOccurs).to.eql(20);
        expect(property.maxOccurs).to.eql(32);
      });
    });

    // TODO: Add a test to compare previous SchemaContext with the SchemaContext returned when SchemaEditor.finish() is called.
  });
});
