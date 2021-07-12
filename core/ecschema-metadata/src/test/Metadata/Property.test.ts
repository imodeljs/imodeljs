/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { SchemaContext } from "../../Context";
import { DelayedPromiseWithProps } from "../../DelayedPromise";
import { PrimitiveType, StrengthDirection } from "../../ECObjects";
import { ECObjectsError } from "../../Exception";
import { ECClass, MutableClass, StructClass } from "../../Metadata/Class";
import { CustomAttribute } from "../../Metadata/CustomAttribute";
import { EntityClass } from "../../Metadata/EntityClass";
import { Enumeration } from "../../Metadata/Enumeration";
import { KindOfQuantity } from "../../Metadata/KindOfQuantity";
import {
  EnumerationArrayProperty, EnumerationProperty, MutableProperty, NavigationProperty, PrimitiveArrayProperty, PrimitiveProperty, Property,
  StructArrayProperty, StructProperty,
} from "../../Metadata/Property";
import { PropertyCategory } from "../../Metadata/PropertyCategory";
import { RelationshipClass } from "../../Metadata/RelationshipClass";
import { MutableSchema, Schema } from "../../Metadata/Schema";
import { PropertyType } from "../../PropertyTypes";
import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";
import { createEmptyXmlDocument } from "../TestUtils/SerializationHelper";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Property", () => {
  let testClass: EntityClass;
  let testCategory: PropertyCategory;
  let testKindOfQuantity: KindOfQuantity;
  let testEnumeration: Enumeration;
  let testStruct: StructClass;
  let testRelationship: RelationshipClass;

  class MockProperty extends Property implements MutableProperty {
    constructor(name: string, type: PropertyType = PropertyType.String) {
      super(testClass, name, type);
    }

    public override addCustomAttribute(customAttribute: CustomAttribute) {
      super.addCustomAttribute(customAttribute);
    }
  }

  beforeEach(async () => {
    const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
    const mutable = schema as MutableSchema;
    testClass = await mutable.createEntityClass("TestClass");
    testCategory = await mutable.createPropertyCategory("TestCategory");
    testKindOfQuantity = await mutable.createKindOfQuantity("TestKoQ");
    testEnumeration = await mutable.createEnumeration("TestEnumeration");
    testStruct = await mutable.createStructClass("TestStruct");
    testRelationship = await mutable.createRelationshipClass("TestRelationship");
  });

  describe("type guards", () => {
    let primitiveProperty: PrimitiveProperty;
    let enumProperty: EnumerationProperty;
    let structProperty: StructProperty;
    let navProperty: NavigationProperty;
    let primitiveArrayProperty: PrimitiveArrayProperty;
    let enumArrayProperty: EnumerationArrayProperty;
    let structArrayProperty: StructArrayProperty;

    beforeEach(() => {
      primitiveProperty = new PrimitiveProperty(testClass, "A");
      enumProperty = new EnumerationProperty(testClass, "B", new DelayedPromiseWithProps(testEnumeration.key, async () => testEnumeration));
      structProperty = new StructProperty(testClass, "C", testStruct);
      navProperty = new NavigationProperty(testClass, "D", new DelayedPromiseWithProps(testRelationship.key, async () => testRelationship));
      primitiveArrayProperty = new PrimitiveArrayProperty(testClass, "E");
      enumArrayProperty = new EnumerationArrayProperty(testClass, "F", new DelayedPromiseWithProps(testEnumeration.key, async () => testEnumeration));
      structArrayProperty = new StructArrayProperty(testClass, "G", testStruct);
    });

    it("should correctly determine when a property is an ArrayProperty", async () => {
      expect(primitiveProperty.isArray()).to.eql(false);
      expect(enumProperty.isArray()).to.eql(false);
      expect(structProperty.isArray()).to.eql(false);
      expect(navProperty.isArray()).to.eql(false);
      expect(primitiveArrayProperty.isArray()).to.eql(true);
      expect(enumArrayProperty.isArray()).to.eql(true);
      expect(structArrayProperty.isArray()).to.eql(true);
    });

    it("should correctly determine when a property is a PrimitiveProperty", async () => {
      expect(primitiveProperty.isPrimitive()).to.eql(true);
      expect(enumProperty.isPrimitive()).to.eql(true);
      expect(structProperty.isPrimitive()).to.eql(false);
      expect(navProperty.isPrimitive()).to.eql(false);
      expect(primitiveArrayProperty.isPrimitive()).to.eql(true);
      expect(enumArrayProperty.isPrimitive()).to.eql(true);
      expect(structArrayProperty.isPrimitive()).to.eql(false);
    });

    it("should correctly determine when a property is a StructProperty", async () => {
      expect(primitiveProperty.isStruct()).to.eql(false);
      expect(enumProperty.isStruct()).to.eql(false);
      expect(structProperty.isStruct()).to.eql(true);
      expect(navProperty.isStruct()).to.eql(false);
      expect(primitiveArrayProperty.isStruct()).to.eql(false);
      expect(enumArrayProperty.isStruct()).to.eql(false);
      expect(structArrayProperty.isStruct()).to.eql(true);
    });

    it("should correctly determine when a property is an EnumerationProperty", async () => {
      expect(primitiveProperty.isEnumeration()).to.eql(false);
      expect(enumProperty.isEnumeration()).to.eql(true);
      expect(structProperty.isEnumeration()).to.eql(false);
      expect(navProperty.isEnumeration()).to.eql(false);
      expect(primitiveArrayProperty.isEnumeration()).to.eql(false);
      expect(enumArrayProperty.isEnumeration()).to.eql(true);
      expect(structArrayProperty.isEnumeration()).to.eql(false);
    });

    it("should correctly determine when a property is a NavigationProperty", async () => {
      expect(primitiveProperty.isNavigation()).to.eql(false);
      expect(enumProperty.isNavigation()).to.eql(false);
      expect(structProperty.isNavigation()).to.eql(false);
      expect(navProperty.isNavigation()).to.eql(true);
      expect(primitiveArrayProperty.isNavigation()).to.eql(false);
      expect(enumArrayProperty.isNavigation()).to.eql(false);
      expect(structArrayProperty.isNavigation()).to.eql(false);
    });
  });

  describe("fromJson", () => {
    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        name: "TestProp",
        label: "SomeDisplayLabel",
        description: "A really long description...",
        type: "PrimitiveProperty",
        priority: 1000,
        isReadOnly: false,
        category: "TestSchema.TestCategory",
        kindOfQuantity: "TestSchema.TestKoQ",
      };
      const testProp = new MockProperty("TestProp");
      expect(testProp).to.exist;
      await testProp.fromJSON(propertyJson);
      expect(testProp.name).to.eql("TestProp");
      expect(testProp.label).to.eql("SomeDisplayLabel");
      expect(testProp.description).to.eql("A really long description...");
      expect(testProp.priority).to.eql(1000);
      expect(testProp.isReadOnly).to.eql(false);
      expect(await testProp.category).to.eql(testCategory);
      expect(await testProp.kindOfQuantity).to.eql(testKindOfQuantity);
      expect(testProp.propertyType).to.eql(PropertyType.String);
      expect(testProp.fullName).to.eql("TestClass.TestProp");
    });

    it("should throw for non-existent category", async () => {
      const testProp = new MockProperty("BadProp");
      // Also test for a PropertyCategory that doesn't exist
      const propertyJson = {
        name: "BadProp",
        type: "PrimitiveProperty",
        category: "TestSchema.NonExistentPropertyCategory",
      };
      await testProp.fromJSON(propertyJson);
      await expect(testProp.category).to.be.rejectedWith(ECObjectsError, `The Property BadProp has a 'category' ("TestSchema.NonExistentPropertyCategory") that cannot be found.`);

    });

    it("should throw for non-existent kindOfQuantity", async () => {
      const testProp = new MockProperty("BadProp");
      const propertyJson = {
        name: "BadProp",
        type: "PrimitiveProperty",
        kindOfQuantity: "TestSchema.NonExistentKindOfQuantity",
      };
      await testProp.fromJSON(propertyJson);
      await expect(testProp.kindOfQuantity).to.be.rejectedWith(ECObjectsError, `The Property BadProp has a 'kindOfQuantity' ("TestSchema.NonExistentKindOfQuantity") that cannot be found.`);
    });
  });

  describe("toJSON", () => {
    it("Simple serialization", async () => {
      const propertyJson = {
        name: "ValidProp",
        description: "A really long description...",
        label: "SomeDisplayLabel",
        type: "PrimitiveProperty",
        isReadOnly: true,
        priority: 100,
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      const serialized = testProp.toJSON();
      expect(serialized).to.deep.equal({ ...propertyJson });
    });

    it("should omit undefined isReadOnly", async () => {
      const propertyJson = {
        name: "ValidProp",
        type: "PrimitiveProperty",
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      expect(testProp.toJSON()).to.not.have.property("isReadOnly");
    });

    it("should include false isReadOnly", async () => {
      const propertyJson = {
        name: "ValidProp",
        type: "PrimitiveProperty",
        isReadOnly: false,
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      expect(testProp.toJSON()).to.include({ isReadOnly: false });
    });

    it("should omit undefined priority", async () => {
      const propertyJson = {
        name: "ValidProp",
        type: "PrimitiveProperty",
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      expect(testProp.toJSON()).to.not.have.property("priority");
    });

    it("should include 0 priority", async () => {
      const propertyJson = {
        name: "ValidProp",
        type: "PrimitiveProperty",
        priority: 0,
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      expect(testProp.toJSON()).to.include({ priority: 0 });
    });

    it("should include kindOfQuantity", async () => {
      const propertyJson = {
        name: "ValidProp",
        type: "PrimitiveProperty",
        kindOfQuantity: "TestSchema.TestKoQ",
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      expect(testProp.toJSON()).to.include({ kindOfQuantity: "TestSchema.TestKoQ" });
    });

    it("should include category", async () => {
      const propertyJson = {
        name: "ValidProp",
        type: "PrimitiveProperty",
        category: "TestSchema.TestCategory",
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      expect(testProp.toJSON()).to.include({ category: "TestSchema.TestCategory" });
    });

    it("should omit customAttributes if empty", async () => {
      const propertyJson = {
        name: "ValidProp",
        type: "PrimitiveProperty",
        customAttributes: [],
      };
      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      expect(testProp.toJSON()).to.not.have.property("customAttributes");
    });

    it("Serialization with one custom attribute- only class name", async () => {
      const propertyJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/schemaitem",
        name: "ValidProp",
        type: "PrimitiveProperty",
      };
      const testProp = new MockProperty("ValidProp");
      expect(testProp).to.exist;
      await testProp.fromJSON(propertyJson);
      testProp.addCustomAttribute({
        className: "CoreCustomAttributes.HiddenSchema",
      });
      const serialized = testProp.toJSON();
      assert.strictEqual(serialized.customAttributes![0].className, "CoreCustomAttributes.HiddenSchema");
    });
    it("Serialization with one custom attribute- additional properties", () => {
      const propertyJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/schemaitem",
        name: "ValidProp",
        type: "PrimitiveProperty",
      };
      const testProp = new MockProperty("ValidProp");
      expect(testProp).to.exist;
      testProp.fromJSONSync(propertyJson);
      testProp.addCustomAttribute({
        className: "CoreCustomAttributes.HiddenSchema",
        ShowClasses: true,
      });
      const serialized = testProp.toJSON();
      assert.strictEqual(serialized.customAttributes![0].className, "CoreCustomAttributes.HiddenSchema");
      assert.isTrue(serialized.customAttributes![0].ShowClasses);
    });
    it("Serialization with multiple custom attributes- only class name", async () => {
      const propertyJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/schemaitem",
        name: "ValidProp",
        type: "PrimitiveProperty",
      };
      const testProp = new MockProperty("ValidProp");
      expect(testProp).to.exist;
      await testProp.fromJSON(propertyJson);
      testProp.addCustomAttribute({ className: "CoreCustomAttributes.HiddenSchema" });
      testProp.addCustomAttribute({ className: "CoreAttributes.HiddenSchema" });
      testProp.addCustomAttribute({ className: "CoreCustom.HiddenSchema" });
      const serialized = testProp.toJSON();
      assert.strictEqual(serialized.customAttributes![0].className, "CoreCustomAttributes.HiddenSchema");
      assert.strictEqual(serialized.customAttributes![1].className, "CoreAttributes.HiddenSchema");
      assert.strictEqual(serialized.customAttributes![2].className, "CoreCustom.HiddenSchema");
    });
    it("Serialization with multiple custom attributes- additional properties", async () => {
      const propertyJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/schemaitem",
        name: "ValidProp",
        type: "PrimitiveProperty",
      };
      const testProp = new MockProperty("ValidProp");
      expect(testProp).to.exist;
      await testProp.fromJSON(propertyJson);
      testProp.addCustomAttribute({
        className: "CoreCustomAttributes.HiddenSchema",
        ShowClasses: true,
      });
      testProp.addCustomAttribute({
        className: "CoreAttributes.HiddenSchema",
        FloatValue: 1.2,
      });
      testProp.addCustomAttribute({
        className: "CoreCustom.HiddenSchema",
        IntegerValue: 5,
      });
      const serialized = testProp.toJSON();
      assert.isTrue(serialized.customAttributes![0].ShowClasses);
      assert.strictEqual(serialized.customAttributes![1].FloatValue, 1.2);
      assert.strictEqual(serialized.customAttributes![2].IntegerValue, 5);
    });
  });

  describe("toXml", () => {
    const newDom = createEmptyXmlDocument();

    function getCustomAttribute(containerElement: Element, name: string): Element {
      const caElements = containerElement.getElementsByTagName("ECCustomAttributes");
      expect(caElements.length).to.equal(1, "Expected 1 ECCustomAttributes Element");
      const caElement = containerElement.getElementsByTagName(name);
      expect(caElement.length).to.equal(1, `Expected one CustomAttribute Element with the name '${name}`);
      return caElement[0];
    }

    function getCAPropertyValueElement(schema: Element, caName: string, propertyName: string): Element {
      const attribute = getCustomAttribute(schema, caName);
      const propArray = attribute.getElementsByTagName(propertyName);
      expect(propArray.length).to.equal(1, `Expected 1 CustomAttribute Property with the name '${propertyName}'`);
      return propArray[0];
    }

    function getSchemaJson(customAttributeJson?: any) {
      return {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          ...customAttributeJson,
          testClass: {
            schemaItemType: "EntityClass",
            modifier: "Sealed",
            properties: [
              {
                name: "TestProperty",
                type: "PrimitiveProperty",
                typeName: "string",
              },
            ],
          },
        },
      };
    }

    it("Simple serialization", async () => {
      const propertyJson = {
        name: "ValidProp",
        description: "A really long description...",
        label: "SomeDisplayLabel",
        type: "PrimitiveProperty",
        isReadOnly: true,
        priority: 100,
        kindOfQuantity: "TestSchema.TestKoQ",
        category: "TestSchema.TestCategory",
      };

      const testProp = new MockProperty("ValidProp");
      await testProp.fromJSON(propertyJson);
      const serialized = await testProp.toXml(newDom);
      expect(serialized.nodeName).to.eql("ECProperty");
      expect(serialized.getAttribute("propertyName")).to.eql("ValidProp");
      expect(serialized.getAttribute("displayLabel")).to.eql("SomeDisplayLabel");
      expect(serialized.getAttribute("description")).to.eql("A really long description...");
      expect(serialized.getAttribute("readOnly")).to.eql("true");
      expect(serialized.getAttribute("priority")).to.eql("100");
      expect(serialized.getAttribute("kindOfQuantity")).to.eql("TestKoQ");
      expect(serialized.getAttribute("category")).to.eql("TestCategory");
    });

    it("Serialization with one custom attribute defined in ref schema, only class name", async () => {
      const context = new SchemaContext();
      const refSchema = new Schema(context, "RefSchema", "ref", 1, 0, 5);
      const refCAClass = await (refSchema as MutableSchema).createCustomAttributeClass("TestCustomAttribute");
      assert.isDefined(refCAClass);
      await context.addSchema(refSchema);
      const testSchema = await Schema.fromJson(getSchemaJson(), new SchemaContext());
      await (testSchema as MutableSchema).addReference(refSchema);
      const entityClass = await testSchema.getItem<EntityClass>("testClass") as ECClass;
      const property = await entityClass.getProperty("TestProperty") as MutableProperty;
      property.addCustomAttribute({ className: "RefSchema.TestCustomAttribute" });
      const serialized = await property.toXml(newDom);

      const attributeElement = getCustomAttribute(serialized, "TestCustomAttribute");
      expect(attributeElement.getAttribute("xmlns")).to.equal("RefSchema.01.00.05");
    });

    it("Serialization with one custom attribute defined in same schema, only class name", async () => {
      const attributeJson = {
        TestCustomAttribute: {
          schemaItemType: "CustomAttributeClass",
          appliesTo: "Schema",
        },
      };
      const testSchema = await Schema.fromJson(getSchemaJson(attributeJson), new SchemaContext());
      const entityClass = await testSchema.getItem<EntityClass>("testClass") as ECClass;
      const property = await entityClass.getProperty("TestProperty") as MutableProperty;
      property.addCustomAttribute({ className: "TestCustomAttribute" });
      const serialized = await property.toXml(newDom);

      const attributeElement = getCustomAttribute(serialized, "TestCustomAttribute");
      expect(attributeElement.getAttribute("xmlns")).to.be.empty;
    });

    it("Serialization with one custom attribute, with Primitive property values", async () => {
      const attributeJson = {
        TestCustomAttribute: {
          schemaItemType: "CustomAttributeClass",
          appliesTo: "Schema",
          properties: [
            {
              type: "PrimitiveProperty",
              typeName: "boolean",
              name: "TrueBoolean",
            },
            {
              type: "PrimitiveProperty",
              typeName: "boolean",
              name: "FalseBoolean",
            },
            {
              type: "PrimitiveProperty",
              typeName: "int",
              name: "Integer",
            },
            {
              type: "PrimitiveProperty",
              typeName: "long",
              name: "Long",
            },
            {
              type: "PrimitiveProperty",
              typeName: "double",
              name: "Double",
            },
            {
              type: "PrimitiveProperty",
              typeName: "dateTime",
              name: "DateTime",
            },
            {
              type: "PrimitiveProperty",
              typeName: "point2d",
              name: "Point2D",
            },
            {
              type: "PrimitiveProperty",
              typeName: "point3d",
              name: "Point3D",
            },
            {
              type: "PrimitiveProperty",
              typeName: "Bentley.Geometry.Common.IGeometry",
              name: "IGeometry",
            },
            {
              type: "PrimitiveProperty",
              typeName: "binary",
              name: "Binary",
            },
          ],
        },
      };

      const testSchema = await Schema.fromJson(getSchemaJson(attributeJson), new SchemaContext());
      const entityClass = await testSchema.getItem<EntityClass>("testClass") as ECClass;
      const property = await entityClass.getProperty("TestProperty") as MutableProperty;

      const nowTicks = Date.now();
      const ca = {
        className: "TestCustomAttribute",
        TrueBoolean: true,
        FalseBoolean: false,
        Integer: 1,
        Long: 100,
        Double: 200,
        DateTime: new Date(nowTicks),
        Point2D: { x: 100, y: 200 },
        Point3D: { x: 100, y: 200, z: 300 },
        IGeometry: "geometry",
        Binary: "binary",
      };

      property.addCustomAttribute(ca);
      const serialized = await property.toXml(newDom);

      let element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "TrueBoolean");
      expect(element.textContent).to.equal("True");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "FalseBoolean");
      expect(element.textContent).to.equal("False");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "Integer");
      expect(element.textContent).to.equal("1");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "Long");
      expect(element.textContent).to.equal("100");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "Double");
      expect(element.textContent).to.equal("200");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "DateTime");
      expect(element.textContent).to.equal(nowTicks.toString());
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "Point2D");
      expect(element.textContent).to.equal("100,200");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "Point3D");
      expect(element.textContent).to.equal("100,200,300");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "IGeometry");
      expect(element.textContent).to.equal("geometry");
      element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "Binary");
      expect(element.textContent).to.equal("binary");
    });

    it("Serialization with one custom attribute, with PrimitiveArray property values", async () => {
      const attributeJson = {
        TestCustomAttribute: {
          schemaItemType: "CustomAttributeClass",
          appliesTo: "Schema",
          properties: [
            {
              type: "PrimitiveArrayProperty",
              typeName: "boolean",
              name: "BooleanArray",
            },
          ],
        },
      };

      const testSchema = await Schema.fromJson(getSchemaJson(attributeJson), new SchemaContext());
      const entityClass = await testSchema.getItem<EntityClass>("testClass") as ECClass;
      const property = await entityClass.getProperty("TestProperty") as MutableProperty;

      const ca = {
        className: "TestCustomAttribute",
        BooleanArray: [true, false, true],
      };

      property.addCustomAttribute(ca);
      const serialized = await property.toXml(newDom);

      const element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "BooleanArray");
      const children = element.childNodes;
      expect(children.length).to.equal(3);
      expect(children[0].textContent).to.equal("True");
      expect(children[1].textContent).to.equal("False");
      expect(children[2].textContent).to.equal("True");
    });

    it("Serialization with one custom attribute, with Struct property value", async () => {
      const attributeJson = {
        TestCustomAttribute: {
          schemaItemType: "CustomAttributeClass",
          appliesTo: "Schema",
          properties: [
            {
              type: "StructProperty",
              typeName: "TestSchema.TestStruct",
              name: "Struct",
            },
          ],
        },
        TestStruct: {
          schemaItemType: "StructClass",
          properties: [
            {
              type: "PrimitiveProperty",
              typeName: "int",
              name: "Integer",
            },
            {
              type: "PrimitiveProperty",
              typeName: "string",
              name: "String",
            },
          ],
        },
      };

      const testSchema = await Schema.fromJson(getSchemaJson(attributeJson), new SchemaContext());
      const entityClass = await testSchema.getItem<EntityClass>("testClass") as ECClass;
      const property = await entityClass.getProperty("TestProperty") as MutableProperty;

      const ca = {
        className: "TestCustomAttribute",
        Struct: {
          Integer: 1,
          String: "test",
        },
      };

      property.addCustomAttribute(ca);
      const serialized = await property.toXml(newDom);

      const element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "Struct");
      const children = element.childNodes;
      expect(children.length).to.equal(2);
      expect(children[0].textContent).to.equal("1");
      expect(children[1].textContent).to.equal("test");
    });

    it("Serialization with one custom attribute, with StructArray property value", async () => {
      const attributeJson = {
        TestCustomAttribute: {
          schemaItemType: "CustomAttributeClass",
          appliesTo: "Schema",
          properties: [
            {
              type: "StructArrayProperty",
              typeName: "TestSchema.TestStruct",
              name: "StructArray",
            },
          ],
        },
        TestStruct: {
          schemaItemType: "StructClass",
          properties: [
            {
              type: "PrimitiveProperty",
              typeName: "int",
              name: "Integer",
            },
            {
              type: "PrimitiveProperty",
              typeName: "string",
              name: "String",
            },
          ],
        },
      };

      const testSchema = await Schema.fromJson(getSchemaJson(attributeJson), new SchemaContext());
      const entityClass = await testSchema.getItem<EntityClass>("testClass") as ECClass;
      const property = await entityClass.getProperty("TestProperty") as MutableProperty;

      const ca = {
        className: "TestCustomAttribute",
        StructArray: [
          {
            Integer: 1,
            String: "test1",
          },
          {
            Integer: 2,
            String: "test2",
          },
        ],
      };

      property.addCustomAttribute(ca);
      const serialized = await property.toXml(newDom);

      const element = getCAPropertyValueElement(serialized, "TestCustomAttribute", "StructArray");
      const structs = element.getElementsByTagName("TestStruct");
      expect(structs.length).to.equal(2);

      let prop1 = structs[0].getElementsByTagName("Integer");
      expect(prop1.length).to.equal(1);
      expect(prop1[0].textContent).to.equal("1");

      let prop2 = structs[0].getElementsByTagName("String");
      expect(prop2.length).to.equal(1);
      expect(prop2[0].textContent).to.equal("test1");

      prop1 = structs[1].getElementsByTagName("Integer");
      expect(prop1.length).to.equal(1);
      expect(prop1[0].textContent).to.equal("2");

      prop2 = structs[1].getElementsByTagName("String");
      expect(prop2.length).to.equal(1);
      expect(prop2[0].textContent).to.equal("test2");
    });
  });
});

describe("Custom Attributes", () => {
  function createSchemaJson(schemaItemJson: any): any {
    return createSchemaJsonWithItems({
      CaClass1: {
        schemaItemType: "CustomAttributeClass",
        appliesTo: "Any",
        properties: [
          {
            type: "PrimitiveProperty",
            typeName: "string",
            name: "CaProp",
          },
        ],
      },
      CaClass2: {
        schemaItemType: "CustomAttributeClass",
        appliesTo: "Any",
      },
      BaseBaseClass: {
        schemaItemType: "EntityClass",

        properties: [
          {
            type: "PrimitiveProperty",
            typeName: "int",
            name: "TestProp",
            customAttributes: [
              { className: "TestSchema.CaClass1" },
            ],
          },
        ],
      },
      MrMixin: {
        schemaItemType: "Mixin",
        appliesTo: "TestSchema.BaseBaseClass",
        properties: [
          {
            type: "PrimitiveProperty",
            name: "MrTestProp",
            typeName: "string",
            customAttributes: [
              { className: "TestSchema.CaClass1" },
            ],
          },
        ],
      },
      BaseClass: {
        schemaItemType: "EntityClass",
        baseClass: "TestSchema.BaseBaseClass",
        mixins: ["TestSchema.MrMixin"],
        properties: [
          {
            type: "PrimitiveProperty",
            name: "TestProp2",
            typeName: "string",
            customAttributes: [
              { className: "TestSchema.CaClass1" },
            ],
          },
          {
            type: "PrimitiveProperty",
            name: "TestProp3",
            typeName: "string",
            customAttributes: [
              {
                className: "TestSchema.CaClass1",
                caProp: "Base",
              },
              { className: "TestSchema.CaClass2" },
            ],
          },
          {
            type: "PrimitiveProperty",
            name: "MrTestProp",
            typeName: "string",
          },
        ],
      },
      TestClass: {
        schemaItemType: "EntityClass",
        baseClass: "TestSchema.BaseClass",
        properties: [
          {
            type: "PrimitiveProperty",
            name: "TestProp",
            typeName: "int",
          },
          {
            type: "PrimitiveProperty",
            name: "TestProp2",
            typeName: "string",
            customAttributes: [
              { className: "TestSchema.CaClass2" },
            ],
          },
          {
            type: "PrimitiveProperty",
            name: "TestProp3",
            typeName: "string",
            customAttributes: [
              {
                className: "TestSchema.CaClass1",
                caProp: "Derived",
              },
            ],
          },
          {
            type: "PrimitiveProperty",
            name: "MrTestProp",
            typeName: "string",
            customAttributes: [
              { className: "TestSchema.CaClass2" },
            ],
          },
        ],
      },
      ...schemaItemJson,
    });
  }

  const context: SchemaContext = new SchemaContext();
  const schema: Schema = Schema.fromJsonSync(createSchemaJson(""), context);

  it("Property CustomAttributes are inherited from base class", async () => {
    const testClass = schema.getItemSync("TestClass") as EntityClass;
    expect(testClass).to.exist;
    const testProp = testClass.getPropertySync("TestProp", false);
    expect(testProp).to.exist;
    const tpCustomAttributes = testProp!.getCustomAttributesSync();
    expect(tpCustomAttributes).to.exist;
    expect(tpCustomAttributes.has("TestSchema.CaClass1")).is.true;
  });

  it("Property CustomAttributes are merged with base class", async () => {
    const testClass = schema.getItemSync("TestClass") as EntityClass;
    expect(testClass).to.exist;
    const testProp = testClass.getPropertySync("TestProp2", false);
    expect(testProp).to.exist;
    const tpCustomAttributes = testProp!.getCustomAttributesSync();
    expect(tpCustomAttributes).to.exist;
    expect(tpCustomAttributes.has("TestSchema.CaClass1")).is.true;
    expect(tpCustomAttributes.has("TestSchema.CaClass2")).is.true;
  });

  it("Property CustomAttributes from derived property override those from base property", async () => {
    const testClass = schema.getItemSync("TestClass") as EntityClass;
    expect(testClass).to.exist;
    const testProp = testClass.getPropertySync("TestProp3", false);
    expect(testProp).to.exist;
    const tpCustomAttributes = testProp!.getCustomAttributesSync();
    expect(tpCustomAttributes).to.exist;
    const caInst1 = tpCustomAttributes.get("TestSchema.CaClass1");
    expect(caInst1).to.exist;
    expect(caInst1!.caProp).to.equal("Derived");
    expect(tpCustomAttributes.has("TestSchema.CaClass2")).is.true;
  });

  it("Property CustomAttributes are inherited from mixin", async () => {
    const testClass = schema.getItemSync("TestClass") as EntityClass;
    expect(testClass).to.exist;
    const testProp = testClass.getPropertySync("MrTestProp", false);
    expect(testProp).to.exist;
    const tpCustomAttributes = testProp!.getCustomAttributesSync();
    expect(tpCustomAttributes).to.exist;
    expect(tpCustomAttributes.has("TestSchema.CaClass1")).is.true;
    expect(tpCustomAttributes.has("TestSchema.CaClass2")).is.true;
  });
});

describe("PrimitiveProperty", () => {
  describe("fromJson", () => {
    let testProperty: PrimitiveProperty;

    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = new EntityClass(schema, "TestClass");
      testProperty = new PrimitiveProperty(testClass, "TestProperty", PrimitiveType.Double);
    });

    it("should successfully deserialize valid JSON", async () => {
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
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);

      expect(testProperty.minLength).to.eql(2);
      expect(testProperty.maxLength).to.eql(4);
      expect(testProperty.minValue).to.eql(6);
      expect(testProperty.maxValue).to.eql(8);
      expect(testProperty.extendedTypeName).to.eql("SomeExtendedType");
    });

    it("should throw for mismatched typeName", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "PrimitiveProperty",
        typeName: "string",
      };
      expect(testProperty).to.exist;
      await expect(testProperty.fromJSON(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });
  });

  describe("KindOfQuantity in referenced schema", () => {
    let testProperty: PrimitiveProperty;
    beforeEach(() => {
      const context = new SchemaContext();
      const referencedSchema = new Schema(context, "Reference", "ref", 1, 0, 0) as MutableSchema;
      referencedSchema.createKindOfQuantitySync("MyKindOfQuantity");

      const schema = new Schema(context, "TestSchema", "ts", 1, 0, 0) as MutableSchema;
      schema.addReferenceSync(referencedSchema);

      const testClass = schema.createEntityClassSync("TestClass") as ECClass as MutableClass;
      testProperty = testClass.createPrimitivePropertySync("Primitive", PrimitiveType.Double);
    });

    const propertyJson = {
      kindOfQuantity: "Reference.MyKindOfQuantity",
      name: "Primitive",
      type: "PrimitiveProperty",
      typeName: "double",
    };

    it("Should load KindOfQuantity synchronously", () => {
      testProperty.fromJSONSync(propertyJson);
      const koq = testProperty.getKindOfQuantitySync();
      assert(koq !== undefined);
      assert.strictEqual(koq!.name, "MyKindOfQuantity");
    });

    it("Should load KindOfQuantity", async () => {
      await testProperty.fromJSON(propertyJson);
      const koq = await testProperty.kindOfQuantity;
      assert(koq !== undefined);
      assert.strictEqual(koq!.name, "MyKindOfQuantity");
    });
  });

  describe("PropertyCategory in referenced schema", () => {
    let testProperty: PrimitiveProperty;
    beforeEach(() => {
      const context = new SchemaContext();
      const referencedSchema = new Schema(context, "Reference", "ref", 1, 0, 0) as MutableSchema;
      referencedSchema.createPropertyCategorySync("MyCategory");

      const schema = new Schema(context, "TestSchema", "ts", 1, 0, 0) as MutableSchema;
      schema.addReferenceSync(referencedSchema);

      const testClass = schema.createEntityClassSync("TestClass") as ECClass as MutableClass;
      testProperty = testClass.createPrimitivePropertySync("Primitive", PrimitiveType.Double);
    });

    const propertyJson = {
      category: "Reference.MyCategory",
      name: "Primitive",
      type: "PrimitiveProperty",
      typeName: "double",
    };

    it("Should load PropertyCategory synchronously", () => {
      testProperty.fromJSONSync(propertyJson);
      const cat = testProperty.getCategorySync();
      assert(cat !== undefined);
      assert.strictEqual(cat!.name, "MyCategory");
    });

    it("Should load PropertyCategory", async () => {
      await testProperty.fromJSON(propertyJson);
      const cat = await testProperty.category;
      assert(cat !== undefined);
      assert.strictEqual(cat!.name, "MyCategory");
    });
  });

  describe("toJSON", () => {
    let testProperty: PrimitiveProperty;

    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = new EntityClass(schema, "TestClass");
      testProperty = new PrimitiveProperty(testClass, "TestProperty", PrimitiveType.Double);
    });

    it("should successfully serialize valid JSON", async () => {
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
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      const testPropSerialization = testProperty.toJSON();
      expect(testPropSerialization.minLength).to.eql(2);
      expect(testPropSerialization.maxLength).to.eql(4);
      expect(testPropSerialization.minValue).to.eql(6);
      expect(testPropSerialization.maxValue).to.eql(8);
      expect(testPropSerialization.extendedTypeName).to.eql("SomeExtendedType");
    });
  });

  describe("toXml", () => {
    let testProperty: PrimitiveProperty;
    const newDom = createEmptyXmlDocument();

    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = new EntityClass(schema, "TestClass");
      testProperty = new PrimitiveProperty(testClass, "TestProperty", PrimitiveType.Double);
    });

    it("Simple serialization", async () => {
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

      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      const serialized = await testProperty.toXml(newDom);
      expect(serialized.nodeName).to.eql("ECProperty");
      expect(serialized.getAttribute("propertyName")).to.eql("TestProperty");
      expect(serialized.getAttribute("typeName")).to.eql("double");
      expect(serialized.getAttribute("minimumLength")).to.eql("2");
      expect(serialized.getAttribute("maximumLength")).to.eql("4");
      expect(serialized.getAttribute("minimumValue")).to.eql("6");
      expect(serialized.getAttribute("maximumValue")).to.eql("8");
      expect(serialized.getAttribute("extendedTypeName")).to.eql("SomeExtendedType");
    });
  });
});

describe("EnumerationProperty", () => {
  describe("fromJson", () => {
    let testProperty: EnumerationProperty;
    let testEnum: Enumeration;

    beforeEach(async () => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = await (schema as MutableSchema).createEntityClass("TestClass");
      testEnum = await (schema as MutableSchema).createEnumeration("TestEnum");
      testProperty = new EnumerationProperty(testClass, "TestProperty", new DelayedPromiseWithProps(testEnum.key, async () => testEnum));
    });

    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "PrimitiveProperty",
        typeName: "TestSchema.TestEnum",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      expect(await testProperty.enumeration).to.eql(testEnum);
    });

    it("should throw for mismatched typeName", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "PrimitiveProperty",
        typeName: "ThisDoesNotMatch",
      };
      expect(testProperty).to.exist;
      await expect(testProperty.fromJSON(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });
  });

  describe("toJSON", () => {
    let testProperty: EnumerationProperty;
    let testEnum: Enumeration;

    beforeEach(async () => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = await (schema as MutableSchema).createEntityClass("TestClass");
      testEnum = await (schema as MutableSchema).createEnumeration("TestEnum");
      testProperty = new EnumerationProperty(testClass, "TestProperty", new DelayedPromiseWithProps(testEnum.key, async () => testEnum));
    });

    it("should successfully serialize valid JSON", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "PrimitiveProperty",
        typeName: "TestSchema.TestEnum",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      const testPropSerialization = testProperty.toJSON();
      assert.strictEqual(testPropSerialization.typeName, "TestSchema.TestEnum");
    });
  });

  describe("toXml", () => {
    let testProperty: EnumerationProperty;
    let testEnum: Enumeration;
    const newDom = createEmptyXmlDocument();

    beforeEach(async () => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = await (schema as MutableSchema).createEntityClass("TestClass");
      testEnum = await (schema as MutableSchema).createEnumeration("TestEnumeration");
      testProperty = new EnumerationProperty(testClass, "TestProperty", new DelayedPromiseWithProps(testEnum.key, async () => testEnum));
    });

    it("Simple serialization", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "PrimitiveProperty",
        typeName: "TestSchema.TestEnumeration",
      };

      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      const serialized = await testProperty.toXml(newDom);
      expect(serialized.nodeName).to.eql("ECProperty");
      expect(serialized.getAttribute("propertyName")).to.eql("TestProperty");
      expect(serialized.getAttribute("typeName")).to.eql("TestEnumeration");
    });

    it("Simple serialization with schema reference", async () => {
      const context = new SchemaContext();
      const referencedSchema = new Schema(context, "ReferenceSchema", "ref", 1, 0, 0) as MutableSchema;
      testEnum = referencedSchema.createEnumerationSync("TestEnumeration");
      const schema = new Schema(context, "TestSchema", "ts", 1, 0, 0) as MutableSchema;
      schema.addReferenceSync(referencedSchema);

      const testClass = schema.createEntityClassSync("TestClass") as ECClass as MutableClass;
      testProperty = new EnumerationProperty(testClass, "TestProperty", new DelayedPromiseWithProps(testEnum.key, async () => testEnum));

      const propertyJson = {
        name: "TestProperty",
        type: "PrimitiveProperty",
        typeName: "ReferenceSchema.TestEnumeration",
      };

      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      const serialized = await testProperty.toXml(newDom);
      expect(serialized.nodeName).to.eql("ECProperty");
      expect(serialized.getAttribute("propertyName")).to.eql("TestProperty");
      expect(serialized.getAttribute("typeName")).to.eql("ref:TestEnumeration");
    });
  });
});

describe("StructProperty", () => {
  describe("fromJson", () => {
    let testProperty: StructProperty;
    let testStruct: StructClass;

    beforeEach(async () => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = await (schema as MutableSchema).createEntityClass("TestClass");
      testStruct = await (schema as MutableSchema).createStructClass("TestStruct");
      testProperty = new StructProperty(testClass, "TestProperty", testStruct);
    });

    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "StructProperty",
        typeName: "TestSchema.TestStruct",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      expect(testProperty.structClass).to.eql(testStruct);
    });

    it("should throw for mismatched typeName", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "StructProperty",
        typeName: "ThisDoesNotMatch",
      };
      expect(testProperty).to.exist;
      await expect(testProperty.fromJSON(propertyJson)).to.be.rejectedWith(ECObjectsError);
    });
  });

  describe("toJSON", () => {
    let testProperty: StructProperty;
    let testStruct: StructClass;

    beforeEach(async () => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = await (schema as MutableSchema).createEntityClass("TestClass");
      testStruct = await (schema as MutableSchema).createStructClass("TestStruct");
      testProperty = new StructProperty(testClass, "TestProperty", testStruct);
    });

    it("should successfully serialize valid JSON", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "StructProperty",
        typeName: "TestSchema.TestStruct",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      const testPropSerialization = testProperty.toJSON();
      assert.strictEqual(testPropSerialization.typeName, "TestSchema.TestStruct");
    });
  });

  describe("toXml", () => {
    let testProperty: StructProperty;
    let testStruct: StructClass;
    const newDom = createEmptyXmlDocument();

    beforeEach(async () => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = await (schema as MutableSchema).createEntityClass("TestClass");
      testStruct = await (schema as MutableSchema).createStructClass("TestStruct");
      testProperty = new StructProperty(testClass, "TestProperty", testStruct);
    });

    it("Simple serialization", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "StructProperty",
        typeName: "TestSchema.TestStruct",
      };
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);
      const serialized = await testProperty.toXml(newDom);
      expect(serialized.nodeName).to.eql("ECStructProperty");
      expect(serialized.getAttribute("typeName")).to.eql("TestStruct");
    });
  });
});

describe("PrimitiveArrayProperty", () => {
  describe("fromJson", () => {
    let testProperty: PrimitiveArrayProperty;

    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = new EntityClass(schema, "TestClass");
      testProperty = new PrimitiveArrayProperty(testClass, "TestProperty");
    });

    it("should successfully deserialize valid JSON", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "PrimitiveArrayProperty",
        minOccurs: 2,
        maxOccurs: 4,
      };
      expect(testProperty).to.exist;
      await testProperty.fromJSON(propertyJson);

      expect(testProperty.minOccurs).to.eql(2);
      expect(testProperty.maxOccurs).to.eql(4);
    });

    describe("toJSON", () => {
      let testArrayProperty: PrimitiveArrayProperty;

      beforeEach(() => {
        const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
        const testClass = new EntityClass(schema, "TestClass");
        testArrayProperty = new PrimitiveArrayProperty(testClass, "TestProperty");
      });

      it("should successfully serialize valid JSON", async () => {
        const propertyJson = {
          name: "TestProperty",
          type: "PrimitiveArrayProperty",
          minOccurs: 2,
          maxOccurs: 4,
        };
        expect(testArrayProperty).to.exist;
        await testArrayProperty.fromJSON(propertyJson);
        const testPropSerialization = testArrayProperty.toJSON();
        expect(testPropSerialization.minOccurs).to.eql(2);
        expect(testPropSerialization.maxOccurs).to.eql(4);
      });
    });

    describe("toXml", () => {
      let testArrayProperty: PrimitiveArrayProperty;
      const newDom = createEmptyXmlDocument();

      beforeEach(() => {
        const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
        const testClass = new EntityClass(schema, "TestClass");
        testArrayProperty = new PrimitiveArrayProperty(testClass, "TestProperty");
      });

      it("Simple serialization", async () => {
        const propertyJson = {
          name: "TestProperty",
          type: "PrimitiveArrayProperty",
          minOccurs: 2,
          maxOccurs: 4,
        };
        expect(testArrayProperty).to.exist;
        await testArrayProperty.fromJSON(propertyJson);
        const serialized = await testArrayProperty.toXml(newDom);
        expect(serialized.nodeName).to.eql("ECArrayProperty");
        expect(serialized.getAttribute("minOccurs")).to.eql("2");
        expect(serialized.getAttribute("maxOccurs")).to.eql("4");
      });
    });
  });
});

describe("NavigationProperty (Deserialization not fully implemented)", () => {
  describe("toXml", () => {
    let testNavigationProperty: NavigationProperty;
    const newDom = createEmptyXmlDocument();

    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      const testClass = new EntityClass(schema, "TestClass");
      const relationshipClass = new RelationshipClass(schema, "TestRelationship");
      const lazyRelationship = new DelayedPromiseWithProps(relationshipClass.key, async () => relationshipClass);
      testNavigationProperty = new NavigationProperty(testClass, "TestProperty", lazyRelationship, StrengthDirection.Forward);
    });

    it("Simple serialization", async () => {
      const propertyJson = {
        name: "TestProperty",
        type: "NavigationProperty",
        relationshipName: "TestSchema.TestRelationship",
        direction: "Forward",
      };
      expect(testNavigationProperty).to.exist;
      await testNavigationProperty.fromJSON(propertyJson);
      const serialized = await testNavigationProperty.toXml(newDom);
      expect(serialized.nodeName).to.eql("ECNavigationProperty");
      expect(serialized.getAttribute("relationshipName")).to.eql("TestRelationship");
      expect(serialized.getAttribute("direction")).to.eql("Forward");
    });
  });

  describe("isProperty", async () => {
    it("should return false if property is undefined", () => {
      const undefinedProperty = undefined;
      expect(Property.isProperty(undefinedProperty)).to.be.false;
    });

    it("should return true if object is of Property type", async () => {
      const testSchema = new Schema(new SchemaContext(), "testSchema", "ts", 12, 22, 93);
      const mutable = testSchema as MutableSchema;
      const testClass = await mutable.createEntityClass("TestClass");
      const testEnum = new Enumeration(testSchema, "TestEnumeration", PrimitiveType.Integer);
      const testStruct = await mutable.createStructClass("TestStruct");
      const testRelationship = await mutable.createRelationshipClass("TestRelationship");

      const primitiveProperty = new PrimitiveProperty(testClass, "A");
      expect(Property.isProperty(primitiveProperty)).to.be.true;
      const enumProperty = new EnumerationProperty(testClass, "B", new DelayedPromiseWithProps(testEnum.key, async () => testEnum));
      expect(Property.isProperty(enumProperty)).to.be.true;
      const structProperty = new StructProperty(testClass, "C", testStruct);
      expect(Property.isProperty(structProperty)).to.be.true;
      const navProperty = new NavigationProperty(testClass, "D", new DelayedPromiseWithProps(testRelationship.key, async () => testRelationship));
      expect(Property.isProperty(navProperty)).to.be.true;
      const primitiveArrayProperty = new PrimitiveArrayProperty(testClass, "E");
      expect(Property.isProperty(primitiveArrayProperty)).to.be.true;
      const enumArrayProperty = new EnumerationArrayProperty(testClass, "F", new DelayedPromiseWithProps(testEnum.key, async () => testEnum));
      expect(Property.isProperty(enumArrayProperty)).to.be.true;
      const structArrayProperty = new StructArrayProperty(testClass, "G", testStruct);
      expect(Property.isProperty(structArrayProperty)).to.be.true;
    });

    it("should return false if object is not of Property type", () => {
      const testSchema = new Schema(new SchemaContext(), "testSchema", "ts", 12, 22, 93);
      const testClass = new EntityClass(testSchema, "ExampleEntity");
      expect(Property.isProperty(testClass)).to.be.false;
      expect(Property.isProperty(testSchema)).to.be.false;
    });
  });
});
