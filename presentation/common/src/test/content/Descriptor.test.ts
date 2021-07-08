/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as faker from "faker";
import { Descriptor, Field, NestedContentField, PropertyValueFormat, StructTypeDescription } from "../../presentation-common";
import { DescriptorJSON, DescriptorSource, SortDirection } from "../../presentation-common/content/Descriptor";
import { FieldDescriptorType } from "../../presentation-common/content/Fields";
import {
  compressDescriptorJSON,
  createRandomCategory, createRandomCategoryJSON, createRandomDescriptor, createRandomDescriptorJSON, createRandomECClassInfo,
  createRandomNestedFieldJSON, createRandomPrimitiveField, createRandomPrimitiveFieldJSON, createRandomPropertiesFieldJSON, createRandomRelationshipPath,
} from "../_helpers/random";

describe("Descriptor", () => {

  describe("constructor", () => {

    it("creates Descriptor from DescriptorSource without categories", () => {
      const category = createRandomCategory();
      const source: DescriptorSource = {
        contentFlags: 9,
        displayType: faker.random.word(),
        fields: [createRandomPrimitiveField(category), createRandomPrimitiveField(category)],
        filterExpression: faker.random.words(),
        selectClasses: [],
      };
      const descriptor = new Descriptor(source);
      for (const key in source) {
        if (source.hasOwnProperty(key))
          expect((descriptor as any)[key]).to.deep.eq((source as any)[key]);
      }
    });

    it("creates Descriptor from DescriptorSource with categories", () => {
      const category = createRandomCategory();
      const source: DescriptorSource = {
        contentFlags: 9,
        displayType: faker.random.word(),
        categories: [category],
        fields: [createRandomPrimitiveField(category), createRandomPrimitiveField(category)],
        filterExpression: faker.random.words(),
        selectClasses: [],
      };
      const descriptor = new Descriptor(source);
      for (const key in source) {
        if (source.hasOwnProperty(key))
          expect((descriptor as any)[key]).to.deep.eq((source as any)[key]);
      }
    });

  });

  describe("fromJSON", () => {

    let testDescriptorJSON!: DescriptorJSON;
    beforeEach(() => {
      testDescriptorJSON = createRandomDescriptorJSON();
      testDescriptorJSON.fields.push(createRandomNestedFieldJSON(testDescriptorJSON.categories![0]));
    });

    const validateParentship = (fields: Field[], parent?: Field) => {
      fields.forEach((field) => {
        expect(field.parent).to.eq(parent);
        if (field.isNestedContentField())
          validateParentship(field.nestedFields, field);
      });
    };

    it("creates valid Descriptor from valid JSON with categories", () => {
      const descriptor = Descriptor.fromJSON(testDescriptorJSON);
      validateParentship(descriptor!.fields);
      expect(descriptor).to.matchSnapshot();
    });

    it("creates valid Descriptor from valid JSON without categories", () => {
      testDescriptorJSON.fields.forEach((field) => field.category = createRandomCategoryJSON());
      const descriptor = Descriptor.fromJSON({ ...testDescriptorJSON, categories: undefined });
      validateParentship(descriptor!.fields);
      expect(descriptor).to.matchSnapshot();
    });

    it("creates valid Descriptor from valid serialized JSON", () => {
      const descriptor = Descriptor.fromJSON(JSON.stringify(testDescriptorJSON));
      validateParentship(descriptor!.fields);
      expect(descriptor).to.matchSnapshot();
    });

    it("creates valid descriptorJSON from CompressedDescriptorJSON with nestedField", () => {
      const compressedDescriptorJSON = compressDescriptorJSON(testDescriptorJSON);
      const descriptorFromCompressedJSON = Descriptor.fromJSON(JSON.stringify(compressedDescriptorJSON));
      const descriptor = Descriptor.fromJSON(JSON.stringify(testDescriptorJSON));
      expect(descriptor).to.deep.eq(descriptorFromCompressedJSON);
    });

    it("creates valid descriptorJSON from CompressedDescriptorJSON with propertiesField", () => {
      testDescriptorJSON = createRandomDescriptorJSON();
      testDescriptorJSON.fields.push(createRandomPropertiesFieldJSON(testDescriptorJSON.categories![0], 2));

      const compressedDescriptorJSON = compressDescriptorJSON(testDescriptorJSON);
      const descriptorFromCompressedJSON = Descriptor.fromJSON(JSON.stringify(compressedDescriptorJSON));
      const descriptor = Descriptor.fromJSON(JSON.stringify(testDescriptorJSON));
      expect(descriptor).to.deep.eq(descriptorFromCompressedJSON);
    });

    it("skips fields that fail to deserialize", () => {
      testDescriptorJSON.fields = [createRandomPrimitiveFieldJSON(testDescriptorJSON.categories![0]), undefined as any];
      const descriptor = Descriptor.fromJSON(testDescriptorJSON);
      expect(descriptor!.fields.length).to.eq(1);
    });

    it("returns undefined for undefined JSON", () => {
      const descriptor = Descriptor.fromJSON(undefined);
      expect(descriptor).to.be.undefined;
    });

  });

  describe("getFieldByName", () => {

    it("returns undefined when there are no fields", () => {
      const descriptor = createRandomDescriptor("type", []);
      expect(descriptor.getFieldByName("test")).to.be.undefined;
    });

    it("returns undefined when field is not found", () => {
      const descriptor = createRandomDescriptor();
      const name = descriptor.fields.map((f) => f.name).join();
      expect(descriptor.getFieldByName(name, true)).to.be.undefined;
    });

    it("returns a field", () => {
      const descriptor = createRandomDescriptor();
      const field = descriptor.fields[0];
      expect(descriptor.getFieldByName(field.name)).to.eq(field);
    });

    it("returns undefined when descriptor contains nested fields but field is not found", () => {
      const descriptor = createRandomDescriptor();
      const primitiveField = createRandomPrimitiveField();
      const descr: StructTypeDescription = {
        valueFormat: PropertyValueFormat.Struct,
        typeName: faker.random.word(),
        members: [{
          type: primitiveField.type,
          label: primitiveField.label,
          name: primitiveField.name,
        }],
      };
      const nestedField = new NestedContentField(createRandomCategory(), faker.random.word(),
        faker.random.words(), descr, faker.random.boolean(), faker.random.number(),
        createRandomECClassInfo(), createRandomRelationshipPath(), [primitiveField], undefined, faker.random.boolean());
      descriptor.fields.push(nestedField);
      expect(descriptor.getFieldByName("does not exist", true)).to.be.undefined;
    });

    it("returns a nested field", () => {
      const descriptor = createRandomDescriptor();
      const primitiveField = createRandomPrimitiveField();
      const descr: StructTypeDescription = {
        valueFormat: PropertyValueFormat.Struct,
        typeName: faker.random.word(),
        members: [{
          type: primitiveField.type,
          label: primitiveField.label,
          name: primitiveField.name,
        }],
      };
      const nestedField = new NestedContentField(createRandomCategory(), faker.random.word(),
        faker.random.words(), descr, faker.random.boolean(), faker.random.number(),
        createRandomECClassInfo(), createRandomRelationshipPath(), [primitiveField], undefined, faker.random.boolean());
      descriptor.fields.push(nestedField);
      expect(descriptor.getFieldByName(primitiveField.name, true)).to.eq(primitiveField);
    });

  });

  describe("createDescriptorOverrides", () => {

    it("creates a valid object with default parameters", () => {
      const descriptor = createRandomDescriptor("");
      expect(descriptor.createDescriptorOverrides()).to.deep.eq({});
    });

    it("creates a valid object with display type", () => {
      const descriptorJSON = {
        ...createRandomDescriptorJSON(),
        displayType: "test display type",
      };
      const descriptor = Descriptor.fromJSON(descriptorJSON)!;
      const overrides = descriptor.createDescriptorOverrides();
      expect(overrides).to.deep.eq({
        displayType: descriptorJSON.displayType,
      });
    });

    it("creates a valid object with content flags", () => {
      const descriptorJSON = {
        ...createRandomDescriptorJSON(""),
        contentFlags: 123,
      };
      const descriptor = Descriptor.fromJSON(descriptorJSON)!;
      const overrides = descriptor.createDescriptorOverrides();
      expect(overrides).to.deep.eq({
        contentFlags: descriptorJSON.contentFlags,
      });
    });

    it("creates a valid object with filter expression", () => {
      const descriptorJSON = {
        ...createRandomDescriptorJSON(""),
        filterExpression: "test filter",
      };
      const descriptor = Descriptor.fromJSON(descriptorJSON)!;
      const overrides = descriptor.createDescriptorOverrides();
      expect(overrides).to.deep.eq({
        filterExpression: descriptorJSON.filterExpression,
      });
    });

    it("creates a valid object with sorting field ascending", () => {
      const categoryJSON = createRandomCategoryJSON();
      const fieldJSON = createRandomPrimitiveFieldJSON(categoryJSON.name);
      const descriptorJSON = {
        ...createRandomDescriptorJSON("", [fieldJSON], [categoryJSON]),
        sortingFieldName: fieldJSON.name,
      };
      const descriptor = Descriptor.fromJSON(descriptorJSON)!;
      const overrides = descriptor.createDescriptorOverrides();
      expect(overrides).to.deep.eq({
        sorting: {
          field: { type: FieldDescriptorType.Name, fieldName: descriptorJSON.sortingFieldName },
          direction: SortDirection.Ascending,
        },
      });
    });

    it("creates a valid object with sorting field descending", () => {
      const fieldJSON = createRandomPrimitiveFieldJSON(createRandomCategoryJSON());
      const descriptorJSON = {
        ...createRandomDescriptorJSON("", [fieldJSON]),
        categories: undefined,
        sortingFieldName: fieldJSON.name,
        sortDirection: SortDirection.Descending,
      };
      const descriptor = Descriptor.fromJSON(descriptorJSON)!;
      const overrides = descriptor.createDescriptorOverrides();
      expect(overrides).to.deep.eq({
        sorting: {
          field: { type: FieldDescriptorType.Name, fieldName: descriptorJSON.sortingFieldName },
          direction: SortDirection.Descending,
        },
      });
    });

  });

});
