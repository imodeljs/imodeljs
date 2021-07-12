/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Content
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { ClassInfo, ClassInfoJSON, RelatedClassInfo, RelationshipPath, RelationshipPathJSON, StrippedRelationshipPath } from "../EC";
import { PresentationError, PresentationStatus } from "../Error";
import { RelationshipMeaning } from "../rules/content/modifiers/RelatedPropertiesSpecification";
import { CategoryDescription, CategoryDescriptionJSON } from "./Category";
import { EditorDescription } from "./Editor";
import { Property, PropertyJSON } from "./Property";
import { RendererDescription } from "./Renderer";
import { TypeDescription } from "./TypeDescription";

/**
 * Data structure for a [[Field]] serialized to JSON.
 * @public
 */
export interface BaseFieldJSON {
  category: CategoryDescriptionJSON | string; // TODO: make this a string _only_ in 3.0
  name: string;
  label: string;
  type: TypeDescription;
  isReadonly: boolean;
  priority: number;
  renderer?: RendererDescription;
  editor?: EditorDescription;
}

/**
 * Data structure for a [[PropertiesField]] serialized to JSON.
 * @public
 */
export interface PropertiesFieldJSON extends BaseFieldJSON {
  properties: PropertyJSON[];
}

/**
 * Data structure for a [[NestedContentField]] serialized to JSON.
 * @public
 */
export interface NestedContentFieldJSON extends BaseFieldJSON {
  contentClassInfo: ClassInfoJSON;
  pathToPrimaryClass: RelationshipPathJSON;
  /** @alpha */
  relationshipMeaning?: RelationshipMeaning;
  /** @alpha */
  actualPrimaryClassIds?: Id64String[];
  autoExpand?: boolean;
  nestedFields: FieldJSON[];
}

/**
 * JSON representation of a [[Field]]
 * @public
 */
export type FieldJSON = BaseFieldJSON | PropertiesFieldJSON | NestedContentFieldJSON;

/** Is supplied field a properties field. */
const isPropertiesField = (field: FieldJSON | Field): field is PropertiesFieldJSON | PropertiesField => {
  return !!(field as any).properties;
};

/** Is supplied field a nested content field. */
const isNestedContentField = (field: FieldJSON | Field): field is NestedContentFieldJSON | NestedContentField => {
  return !!(field as any).nestedFields;
};

/**
 * Describes a single content field. A field is usually represented as a grid column
 * or a property pane row.
 *
 * @public
 */
export class Field {
  /** Category information */
  public category: CategoryDescription;
  /** Unique name */
  public name: string;
  /** Display label */
  public label: string;
  /** Description of this field's values data type */
  public type: TypeDescription;
  /** Are values in this field read-only */
  public isReadonly: boolean;
  /** Priority of the field. Higher priority fields should appear first in the UI */
  public priority: number;
  /** Property renderer used to render values of this field */
  public renderer?: RendererDescription;
  /** Property editor used to edit values of this field */
  public editor?: EditorDescription;
  /** Parent field */
  private _parent?: NestedContentField;

  /**
   * Creates an instance of Field.
   * @param category Category information
   * @param name Unique name
   * @param label Display label
   * @param type Description of this field's values data type
   * @param isReadonly Are values in this field read-only
   * @param priority Priority of the field
   * @param editor Property editor used to edit values of this field
   * @param renderer Property renderer used to render values of this field
   */
  public constructor(category: CategoryDescription, name: string, label: string, type: TypeDescription,
    isReadonly: boolean, priority: number, editor?: EditorDescription, renderer?: RendererDescription) {
    this.category = category;
    this.name = name;
    this.label = label;
    this.type = type;
    this.isReadonly = isReadonly;
    this.priority = priority;
    this.editor = editor;
    this.renderer = renderer;
  }

  /**
   * Is this a [[PropertiesField]]
   */
  public isPropertiesField(): this is PropertiesField { return isPropertiesField(this); }

  /**
   * Is this a [[NestedContentField]]
   */
  public isNestedContentField(): this is NestedContentField { return isNestedContentField(this); }

  /**
   * Get parent
   */
  public get parent(): NestedContentField | undefined { return this._parent; }

  public clone() {
    const clone = new Field(
      this.category,
      this.name,
      this.label,
      this.type,
      this.isReadonly,
      this.priority,
      this.editor,
      this.renderer,
    );
    clone.rebuildParentship(this.parent);
    return clone;
  }

  /** Serialize this object to JSON */
  public toJSON(): FieldJSON {
    return {
      category: CategoryDescription.toJSON(this.category),
      name: this.name,
      label: this.label,
      type: this.type,
      isReadonly: this.isReadonly,
      priority: this.priority,
      renderer: this.renderer,
      editor: this.editor,
    };
  }

  /** Deserialize [[Field]] from JSON */
  public static fromJSON(json: FieldJSON | undefined, categories: CategoryDescription[]): Field | undefined;
  /**
   * Deserialize [[Field]] from JSON
   * @deprecated Use an overload that takes a list of categories
   */
  public static fromJSON(json: FieldJSON | string | undefined): Field | undefined;
  public static fromJSON(json: FieldJSON | string | undefined, categories?: CategoryDescription[]): Field | undefined {
    if (!json)
      return undefined;
    if (typeof json === "string") {
      // eslint-disable-next-line deprecation/deprecation
      return JSON.parse(json, Field.reviver);
    }
    if (isPropertiesField(json))
      return PropertiesField.fromJSON(json, categories!);
    if (isNestedContentField(json))
      return NestedContentField.fromJSON(json, categories!);
    const field = Object.create(Field.prototype);
    return Object.assign(field, json, {
      category: Field.getCategoryFromFieldJson(json, categories),
    });
  }

  protected static getCategoryFromFieldJson(fieldJson: FieldJSON, categories?: CategoryDescription[]): CategoryDescription {
    const category = categories ? categories.find((c) => c.name === ((typeof fieldJson.category === "string") ? fieldJson.category : fieldJson.category.name))
      : (typeof fieldJson.category === "object") ? CategoryDescription.fromJSON(fieldJson.category) : undefined;
    if (!category)
      throw new PresentationError(PresentationStatus.InvalidArgument, `Invalid content field category`);
    return category;
  }

  /**
   * Reviver function that can be used as a second argument for
   * `JSON.parse` method when parsing Field objects.
   *
   * @internal
   * @deprecated Use [[fromJSON]]
   */
  public static reviver(key: string, value: any): any {
    // eslint-disable-next-line deprecation/deprecation
    return key === "" ? Field.fromJSON(value) : value;
  }

  /** @internal */
  public resetParentship(): void {
    this._parent = undefined;
  }

  /** @internal */
  public rebuildParentship(parentField?: NestedContentField): void {
    this._parent = parentField;
  }

  /**
   * Get descriptor for this field.
   * @public
   */
  public getFieldDescriptor(): FieldDescriptor {
    return {
      type: FieldDescriptorType.Name,
      fieldName: this.name,
    } as NamedFieldDescriptor;
  }
}

/**
 * Describes a content field that's based on one or more similar
 * EC properties.
 *
 * @public
 */
export class PropertiesField extends Field {
  /** A list of properties this field is created from */
  public properties: Property[];

  /**
   * Creates an instance of PropertiesField.
   * @param category Category information
   * @param name Unique name
   * @param label Display label
   * @param type Description of this field's values data type
   * @param isReadonly Are values in this field read-only
   * @param priority Priority of the field
   * @param properties A list of properties this field is created from
   * @param editor Property editor used to edit values of this field
   * @param renderer Property renderer used to render values of this field
   */
  public constructor(
    category: CategoryDescription,
    name: string,
    label: string,
    description: TypeDescription,
    isReadonly: boolean,
    priority: number,
    properties: Property[],
    editor?: EditorDescription,
    renderer?: RendererDescription,
  ) {
    super(category, name, label, description, isReadonly, priority, editor, renderer);
    this.properties = properties;
  }

  public override clone() {
    const clone = new PropertiesField(
      this.category,
      this.name,
      this.label,
      this.type,
      this.isReadonly,
      this.priority,
      this.properties,
      this.editor,
      this.renderer,
    );
    clone.rebuildParentship(this.parent);
    return clone;
  }

  /** Serialize this object to JSON */
  public override toJSON(): PropertiesFieldJSON {
    return {
      ...super.toJSON(),
      properties: this.properties.map((p) => Property.toJSON(p)),
    };
  }

  /** Deserialize [[PropertiesField]] from JSON */
  public static override fromJSON(json: PropertiesFieldJSON | undefined, categories: CategoryDescription[]): PropertiesField | undefined;
  /**
   * Deserialize [[PropertiesField]] from JSON
   * @deprecated Use an overload that takes a list of categories
   */
  public static override fromJSON(json: PropertiesFieldJSON | string | undefined): PropertiesField | undefined;
  public static override fromJSON(json: PropertiesFieldJSON | string | undefined, categories?: CategoryDescription[]): PropertiesField | undefined {
    if (!json)
      return undefined;
    if (typeof json === "string") {
      // eslint-disable-next-line deprecation/deprecation
      return JSON.parse(json, Field.reviver);
    }
    const field = Object.create(PropertiesField.prototype);
    return Object.assign(field, json, {
      category: this.getCategoryFromFieldJson(json, categories),
      properties: json.properties.map(Property.fromJSON),
    });
  }

  /**
   * Get descriptor for this field.
   * @public
   */
  public override getFieldDescriptor(): FieldDescriptor {
    const pathFromPropertyToSelectClass = new Array<RelatedClassInfo>();
    let currAncestor = this.parent;
    while (currAncestor) {
      pathFromPropertyToSelectClass.push(...currAncestor.pathToPrimaryClass);
      currAncestor = currAncestor.parent;
    }
    return {
      type: FieldDescriptorType.Properties,
      pathFromSelectToPropertyClass: RelationshipPath.strip(RelationshipPath.reverse(pathFromPropertyToSelectClass)),
      properties: this.properties.map((p) => ({
        class: p.property.classInfo.name,
        name: p.property.name,
      })),
    } as PropertiesFieldDescriptor;
  }
}

/**
 * Describes a content field that contains [Nested content]($docs/learning/presentation/Content/Terminology#nested-content).
 *
 * @public
 */
export class NestedContentField extends Field {
  /** Information about an ECClass whose properties are nested inside this field */
  public contentClassInfo: ClassInfo;
  /** Relationship path to [Primary class]($docs/learning/presentation/Content/Terminology#primary-class) */
  public pathToPrimaryClass: RelationshipPath;
  /** @alpha */
  public relationshipMeaning: RelationshipMeaning;
  /** @alpha */
  public actualPrimaryClassIds: Id64String[];
  /** Contained nested fields */
  public nestedFields: Field[];
  /** Flag specifying whether field should be expanded */
  public autoExpand?: boolean;

  /**
   * Creates an instance of NestedContentField.
   * @param category Category information
   * @param name Unique name
   * @param label Display label
   * @param type Description of this field's values data type
   * @param isReadonly Are values in this field read-only
   * @param priority Priority of the field
   * @param contentClassInfo Information about an ECClass whose properties are nested inside this field
   * @param pathToPrimaryClass Relationship path to [Primary class]($docs/learning/presentation/Content/Terminology#primary-class)
   * @param nestedFields Contained nested fields
   * @param editor Property editor used to edit values of this field
   * @param autoExpand Flag specifying whether field should be expanded
   * @param relationshipMeaning RelationshipMeaning of the field
   * @param renderer Property renderer used to render values of this field
   */
  public constructor(
    category: CategoryDescription,
    name: string,
    label: string,
    description: TypeDescription,
    isReadonly: boolean,
    priority: number,
    contentClassInfo: ClassInfo,
    pathToPrimaryClass: RelationshipPath,
    nestedFields: Field[],
    editor?: EditorDescription,
    autoExpand?: boolean,
    renderer?: RendererDescription,
  ) {
    super(category, name, label, description, isReadonly, priority, editor, renderer);
    this.contentClassInfo = contentClassInfo;
    this.pathToPrimaryClass = pathToPrimaryClass;
    this.relationshipMeaning = RelationshipMeaning.RelatedInstance;
    this.nestedFields = nestedFields;
    this.autoExpand = autoExpand;
    this.actualPrimaryClassIds = [];
  }

  public override clone() {
    const clone = new NestedContentField(
      this.category,
      this.name,
      this.label,
      this.type,
      this.isReadonly,
      this.priority,
      this.contentClassInfo,
      this.pathToPrimaryClass,
      this.nestedFields.map((n) => n.clone()),
      this.editor,
      this.autoExpand,
      this.renderer,
    );
    clone.actualPrimaryClassIds = this.actualPrimaryClassIds;
    clone.relationshipMeaning = this.relationshipMeaning;
    clone.rebuildParentship(this.parent);
    return clone;
  }

  /**
   * Get field by its name
   * @param name Name of the field to find
   * @param recurse Recurse into nested fields
   */
  public getFieldByName(name: string, recurse?: boolean): Field | undefined {
    return getFieldByName(this.nestedFields, name, recurse);
  }

  /** Serialize this object to JSON */
  public override toJSON(): NestedContentFieldJSON {
    return {
      ...super.toJSON(),
      contentClassInfo: this.contentClassInfo,
      pathToPrimaryClass: this.pathToPrimaryClass,
      relationshipMeaning: this.relationshipMeaning,
      actualPrimaryClassIds: this.actualPrimaryClassIds,
      nestedFields: this.nestedFields.map((field: Field) => field.toJSON()),
      autoExpand: this.autoExpand,
    };
  }

  /** Deserialize [[NestedContentField]] from JSON */
  public static override fromJSON(json: NestedContentFieldJSON | undefined, categories: CategoryDescription[]): NestedContentField | undefined;
  /**
   * Deserialize [[NestedContentField]] from JSON
   * @deprecated Use an overload that takes a list of categories
   */
  public static override fromJSON(json: NestedContentFieldJSON | string | undefined): NestedContentField | undefined;
  public static override fromJSON(json: NestedContentFieldJSON | string | undefined, categories?: CategoryDescription[]): NestedContentField | undefined {
    if (!json)
      return undefined;
    if (typeof json === "string") {
      // eslint-disable-next-line deprecation/deprecation
      return JSON.parse(json, Field.reviver);
    }
    const field = Object.create(NestedContentField.prototype);
    return Object.assign(field, json, {
      category: this.getCategoryFromFieldJson(json, categories),
      nestedFields: json.nestedFields.map((nestedFieldJson: FieldJSON) => Field.fromJSON(nestedFieldJson, categories!))
        .filter((nestedField): nestedField is Field => !!nestedField),
      contentClassInfo: ClassInfo.fromJSON(json.contentClassInfo),
      pathToPrimaryClass: json.pathToPrimaryClass.map(RelatedClassInfo.fromJSON),
      relationshipMeaning: json.relationshipMeaning ?? RelationshipMeaning.RelatedInstance,
      actualPrimaryClassIds: json.actualPrimaryClassIds ?? [],
      autoExpand: json.autoExpand,
    });
  }

  /** @internal */
  public override resetParentship(): void {
    super.resetParentship();
    for (const nestedField of this.nestedFields)
      nestedField.resetParentship();
  }

  /** @internal */
  public override rebuildParentship(parentField?: NestedContentField): void {
    super.rebuildParentship(parentField);
    for (const nestedField of this.nestedFields)
      nestedField.rebuildParentship(this);
  }
}

/** @internal */
export const getFieldByName = (fields: Field[], name: string, recurse?: boolean): Field | undefined => {
  for (const field of fields) {
    if (field.name === name)
      return field;

    if (recurse && field.isNestedContentField()) {
      const nested = getFieldByName(field.nestedFields, name, recurse);
      if (nested)
        return nested;
    }
  }
  return undefined;
};

/**
 * Types of different field descriptors.
 * @public
 */
export enum FieldDescriptorType {
  Name = "name",
  Properties = "properties",
}

/**
 * Base for a field descriptor
 * @public
 */
export interface FieldDescriptorBase {
  type: FieldDescriptorType;
}

/**
 * A union of all possible field descriptor types
 * @public
 */
export type FieldDescriptor = NamedFieldDescriptor | PropertiesFieldDescriptor;
/** @public */
export namespace FieldDescriptor { // eslint-disable-line @typescript-eslint/no-redeclare
  /** Is this a named field descriptor */
  export function isNamed(d: FieldDescriptor): d is NamedFieldDescriptor {
    return d.type === FieldDescriptorType.Name;
  }
  /** Is this a properties field descriptor */
  export function isProperties(d: FieldDescriptor): d is PropertiesFieldDescriptor {
    return d.type === FieldDescriptorType.Properties;
  }
}

/**
 * Field descriptor that identifies a content field by its unique name.
 * @public
 */
export interface NamedFieldDescriptor extends FieldDescriptorBase {
  type: FieldDescriptorType.Name;
  fieldName: string;
}

/**
 * Field descriptor that identifies a properties field using a list of
 * properties that the field contains.
 * @public
 */
export interface PropertiesFieldDescriptor extends FieldDescriptorBase {
  type: FieldDescriptorType.Properties;
  pathFromSelectToPropertyClass: StrippedRelationshipPath;
  /**
   * A list of properties that describe the field. At least one property in the list must
   * match at least one property in the field for the descriptor to be considered matching.
   */
  properties: Array<{
    /** Full class name */
    class: string;
    /** Property name */
    name: string;
  }>;
  /** @deprecated Use [[properties]] array */
  propertyClass?: string;
  /** @deprecated Use [[properties]] array */
  propertyName?: string;
}
