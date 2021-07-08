/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable deprecation/deprecation */
import * as faker from "faker";
import {
  CategoryDescription, CategoryDescriptionJSON, CompressedClassInfoJSON, CompressedPropertyInfoJSON, CompressedRelatedClassInfoJSON, Content, Descriptor, EditorDescription, Field, NestedContentField, PrimitiveTypeDescription,
  PropertiesField, PropertyInfoJSON, PropertyValueFormat, RelatedClassInfoJSON, StructTypeDescription, TypeDescription,
} from "../../../presentation-common";
import { CompressedDescriptorJSON, CompressedSelectClassInfoJSON, DescriptorJSON, SelectClassInfoJSON } from "../../../presentation-common/content/Descriptor";
import { BaseFieldJSON, CompressedFieldJSON, CompressedPropertiesFieldJSON, FieldJSON, isNestedContentField, isPropertiesField, NestedContentFieldJSON, PropertiesFieldJSON } from "../../../presentation-common/content/Fields";
import { CompressedPropertyJSON, PropertyJSON } from "../../../presentation-common/content/Property";
import { createRandomECClassInfoJSON, createRandomPropertyInfoJSON, createRandomRelatedClassInfoJSON, createRandomRelationshipPathJSON } from "./EC";
import { nullable } from "./Misc";

const createRandomSelectClassInfoJSON = (): SelectClassInfoJSON => {
  return {
    selectClassInfo: createRandomECClassInfoJSON(),
    isSelectPolymorphic: faker.random.boolean(),
    pathToPrimaryClass: createRandomRelationshipPathJSON(),
    relatedPropertyPaths: [createRandomRelationshipPathJSON(1), createRandomRelationshipPathJSON(1)],
    navigationPropertyClasses: [createRandomRelatedClassInfoJSON()],
    relatedInstanceClasses: [createRandomRelatedClassInfoJSON()],
  };
};

export const createRandomCategory = (id?: string): CategoryDescription => ({
  name: id ?? faker.random.word(),
  label: id ?? faker.random.words(),
  description: faker.lorem.sentence(),
  priority: faker.random.number(),
  expand: faker.random.boolean(),
});

export const createRandomCategoryJSON = (): CategoryDescriptionJSON => {
  return CategoryDescription.toJSON(createRandomCategory());
};

export const createRandomPrimitiveTypeDescription = (): TypeDescription => {
  return {
    valueFormat: PropertyValueFormat.Primitive,
    typeName: faker.database.type(),
  } as PrimitiveTypeDescription;
};

export const createRandomEditorDescription = (): EditorDescription => {
  return {
    name: faker.random.word(),
  } as EditorDescription;
};

export const createRandomPrimitiveFieldJSON = (category?: CategoryDescriptionJSON | string, id?: string): BaseFieldJSON => ({
  category: category ?? createRandomCategoryJSON(),
  name: id ?? faker.random.word(),
  label: id ?? faker.random.words(),
  type: createRandomPrimitiveTypeDescription(),
  isReadonly: faker.random.boolean(),
  priority: faker.random.number(),
  renderer: { name: "custom_renderer" },
  editor: nullable(createRandomEditorDescription),
});

export const createRandomPrimitiveField = (category?: CategoryDescription, id?: string): Field => {
  const field = Field.fromJSON(createRandomPrimitiveFieldJSON(undefined, id))!;
  if (category)
    field.category = category;
  return field;
};

export const createRandomPropertyJSON = (): PropertyJSON => ({
  property: createRandomPropertyInfoJSON(),
  relatedClassPath: createRandomRelationshipPathJSON(1),
});

export const createRandomPropertiesFieldJSON = (category: CategoryDescriptionJSON | string | undefined, propertiesCount: number = 1): PropertiesFieldJSON => ({
  ...createRandomPrimitiveFieldJSON(category),
  properties: [...Array(propertiesCount).keys()].map(() => createRandomPropertyJSON()),
});

export const createRandomPropertiesField = (category?: CategoryDescription, propertiesCount: number = 1): PropertiesField => {
  const field = PropertiesField.fromJSON(createRandomPropertiesFieldJSON(undefined, propertiesCount))!;
  if (category)
    field.category = category;
  return field;
};

export const createRandomNestedFieldJSON = (category?: CategoryDescriptionJSON | string): NestedContentFieldJSON => ({
  ...createRandomPrimitiveFieldJSON(category),
  type: {
    valueFormat: PropertyValueFormat.Struct,
    typeName: faker.random.word(),
    members: [{
      type: createRandomPrimitiveTypeDescription(),
      name: faker.random.word(),
      label: faker.random.word(),
    }],
  } as StructTypeDescription,
  contentClassInfo: createRandomECClassInfoJSON(),
  pathToPrimaryClass: createRandomRelationshipPathJSON(),
  actualPrimaryClassIds: faker.random.boolean() ? undefined : [],
  nestedFields: [createRandomPrimitiveFieldJSON(category)],
  autoExpand: faker.random.boolean(),
});

const deepAssignCategory = (field: Field, category: CategoryDescription) => {
  field.category = category;
  if (field.isNestedContentField())
    field.nestedFields.forEach((f) => deepAssignCategory(f, category));
};

export const createRandomNestedContentField = (nestedFields?: Field[], category?: CategoryDescription): NestedContentField => {
  const nestedContentField = NestedContentField.fromJSON(createRandomNestedFieldJSON(undefined))!;
  if (category)
    deepAssignCategory(nestedContentField, category);
  if (nestedFields)
    nestedContentField.nestedFields = nestedFields;
  nestedContentField.nestedFields.forEach((field) => field.rebuildParentship(nestedContentField));
  return nestedContentField;
};

export const createRandomDescriptorJSON = (displayType?: string, fields?: FieldJSON[], categories?: CategoryDescriptionJSON[]) => {
  categories = categories ?? (fields ? undefined : [createRandomCategoryJSON()]);
  fields = fields ?? [createRandomPrimitiveFieldJSON(categories![0]), createRandomPrimitiveFieldJSON(categories![0]), createRandomPrimitiveFieldJSON(categories![0])];
  return {
    connectionId: faker.random.uuid(),
    inputKeysHash: faker.random.uuid(),
    contentOptions: faker.random.objectElement(),
    displayType: displayType ?? faker.lorem.words(),
    selectClasses: [createRandomSelectClassInfoJSON(), createRandomSelectClassInfoJSON()],
    categories,
    fields,
    contentFlags: 0,
  };
};

export const compressDescriptorJSON = (json: DescriptorJSON): CompressedDescriptorJSON => {
  const classesMap: { [id: string]: CompressedClassInfoJSON } = {};
  const selectClasses: CompressedSelectClassInfoJSON[] = json.selectClasses.map((selectClass) => {
    classesMap[selectClass.selectClassInfo.id] = { ...selectClass.selectClassInfo };

    return {
      ...selectClass,
      selectClassInfo: selectClass.selectClassInfo.id,
      relatedInstanceClasses: selectClass.relatedInstanceClasses.map((instanceClass) => compressRelatedClassInfoJSON(instanceClass, classesMap)),
      navigationPropertyClasses: selectClass.navigationPropertyClasses.map((propertyClass) => compressRelatedClassInfoJSON(propertyClass, classesMap)),
      pathToPrimaryClass: selectClass.pathToPrimaryClass.map((relatedClass) => compressRelatedClassInfoJSON(relatedClass, classesMap)),
      relatedPropertyPaths: selectClass.relatedPropertyPaths.map((path) => path.map((relatedClass) => compressRelatedClassInfoJSON(relatedClass, classesMap))),
    };
  });

  const fields: CompressedFieldJSON[] = json.fields.map((field) => {
    if (isPropertiesField(field))
      return {
        ...field,
        properties: field.properties.map((property) => compressPropertyJSON(property, classesMap)),
      };

    if (isNestedContentField(field)) {
      classesMap[field.contentClassInfo.id] = { ...field.contentClassInfo };
      return {
        ...field,
        contentClassInfo: field.contentClassInfo.id,
        pathToPrimaryClass: field.pathToPrimaryClass.map((classInfoJSON) => compressRelatedClassInfoJSON(classInfoJSON, classesMap)),
      };
    }

    return field;
  });

  return {
    ...json,
    fields,
    selectClasses,
    classesMap,
  };
};

const compressPropertyJSON = (json: PropertyJSON, classesMap: { [id: string]: CompressedClassInfoJSON }): CompressedPropertyJSON => {
  return {
    property: compressPropertyInfoJSON(json.property, classesMap),
    relatedClassPath: json.relatedClassPath.map((classInfoJSON) => compressRelatedClassInfoJSON(classInfoJSON, classesMap)),
  };
};

const compressPropertyInfoJSON = (json: PropertyInfoJSON, classesMap: { [id: string]: CompressedClassInfoJSON }): CompressedPropertyInfoJSON => {
  classesMap[json.classInfo.id] = { ...json.classInfo };

  return {
    ...json,
    classInfo: json.classInfo.id,
  };
};

const compressRelatedClassInfoJSON = (json: RelatedClassInfoJSON, classesMap: { [id: string]: CompressedClassInfoJSON }): CompressedRelatedClassInfoJSON => {
  classesMap[json.sourceClassInfo.id] = { ...json.sourceClassInfo };
  classesMap[json.targetClassInfo.id] = { ...json.targetClassInfo };
  classesMap[json.relationshipInfo.id] = { ...json.relationshipInfo };

  return {
    ...json,
    sourceClassInfo: json.sourceClassInfo.id,
    targetClassInfo: json.targetClassInfo.id,
    relationshipInfo: json.relationshipInfo.id,
  };
};

export const createRandomDescriptor = (displayType?: string, fields?: Field[], categories?: CategoryDescription[]): Descriptor => {
  return Descriptor.fromJSON(createRandomDescriptorJSON(
    displayType,
    fields ? fields.map((f) => f.toJSON()) : undefined,
    categories ? categories.map(CategoryDescription.toJSON) : undefined,
  ))!;
};

export const createRandomContentJSON = () => {
  return {
    descriptor: createRandomDescriptorJSON(),
    contentSet: [],
  };
};

export const createRandomContent = (): Content => {
  return Content.fromJSON(createRandomContentJSON())!;
};
