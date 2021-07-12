/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Comparison
 */

import { AnyClass, AnyEnumerator, CustomAttribute, ECClass, ECObjectsError, ECObjectsStatus,
  EntityClass, Enumeration, Format, KindOfQuantity, OverrideFormat, Property, RelationshipConstraint,
  Schema, SchemaItem, SchemaItemType, schemaItemTypeToString,
} from "@bentley/ecschema-metadata";
import { AnyDiagnostic } from "./Diagnostic";
import { SchemaCompareCodes } from "./SchemaCompareDiagnostics";

/**
 * Possible change types used to categorize ISchemaChange objects.
 * @alpha
 */
export enum ChangeType {
  Delta = 0,
  Missing = 1,
}

/**
 * Interface that represents any change reported
 * between two schemas.
 * @alpha
 */
export interface ISchemaChange {
  /** The diagnostic containing the data related to the change. */
  diagnostic: AnyDiagnostic;
  /** The highest level SchemaItem that this change ultimately belong to. */
  topLevelSchemaItem: SchemaItem | Schema;
  /** The ChangeType (Delta or Missing) for this change. */
  changeType: ChangeType;
  /** Returns a string representation of the change. */
  toString(): string;
}

/**
 * Interface that represents an object that manages
 * a related set of ISchemaChange objects.
 * @alpha
 */
export interface ISchemaChanges {
  schema: Schema;
  ecTypeName: string;
  addChange(change: ISchemaChange): void;
}

/**
 * Allows an ISchemaChanges implementation to be dynamically constructed in addChangeToMap.
 */
interface SchemaChangesConstructor { new(schema: Schema, ecTypeName: string): ISchemaChanges } // eslint-disable-line @typescript-eslint/prefer-function-type

/**
 * An ISchemaChange implementation meant to be used as the base class
 * for all other ISchemaChange implementations.
 * @alpha
 */
export abstract class BaseSchemaChange implements ISchemaChange {
  private _diagnostic: AnyDiagnostic;
  private _changeType!: ChangeType;

  /**
   * Initializes a new BaseSchemaChange instance.
   * @param diagnostic The diagnostic holding the change data.
   */
  constructor(diagnostic: AnyDiagnostic) {
    this._diagnostic = diagnostic;
  }

  /** Gets the diagnostic holding the information about the schema change. */
  public get diagnostic(): AnyDiagnostic { return this._diagnostic; }

  /**
   * Returns the SchemaItem that this change ultimately belongs to. For example,
   * for a CustomAttributeInstanceClassMissing diagnostic reported on a RelationshipConstraint,
   * the top-level SchemaItem would be the Relationship.
   */
  public abstract get topLevelSchemaItem(): SchemaItem | Schema;

  /**
   * Gets the change type (Delta or Missing) for the change. If not previously
   * set, the defaultChangeType value will be returned.
   */
  public get changeType() {
    if (!this._changeType)
      this._changeType = this.defaultChangeType;
    return this._changeType;
  }
  public set changeType(changeType: ChangeType) { this._changeType = changeType; }

  /** The default ChangeType (Delta or Missing). */
  public abstract get defaultChangeType(): ChangeType;

  /** Gets a string representation of the schema change. */
  public abstract toString(): string;

  /**
   * Gets the name or fullName from an EC type that is in the args array at
   * the specified index. Performs validation based on the given parameters.
   * @param index The index in the args array to find the EC type.
   * @param args  The collection of arguments received in the diagnostics.
   * @param allowUndefined Specifies that undefined values are allowed.
   * @param fullName  Flag indicating that the fullName should be returned rather than the name.
   */
  protected getNameFromArgument(index: number, allowUndefined: boolean = false, fullName: boolean = false): string {
    if (!this.diagnostic.messageArgs || this.diagnostic.messageArgs.length <= index)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaComparisonArgument, `Schema comparison diagnostic '${this.diagnostic.code}' for SchemaItem '${this.topLevelSchemaItem.fullName}' has invalid arguments`);

    const schemaItem = this.getValueFromArgument(index);
    if (Schema.isSchema(schemaItem) || SchemaItem.isSchemaItem(schemaItem) || OverrideFormat.isOverrideFormat(schemaItem))
      return fullName ? schemaItem.fullName : schemaItem.name;

    if (!allowUndefined)
      throw new ECObjectsError(ECObjectsStatus.InvalidSchemaComparisonArgument, `Schema comparison diagnostic '${this.diagnostic.code}' for SchemaItem '${this.topLevelSchemaItem.fullName}' has invalid arguments`);

    return "undefined";
  }

  /**
   * Gets a string from the diagnostics arguments at the given index. If the value is undefined,
   * the string 'undefined' will be returned.
   * @param index The index in the args array to find the property value.
   */
  protected getStringFromArgument(index: number): string {
    const value = this.getValueFromArgument(index);
    if (value === undefined)
      return "undefined";

    if (typeof value === "number")
      return value.toString();

    if (typeof value === "boolean")
      return value ? "true" : "false";

    if (typeof value !== "string")
      throw new Error();

    return value;
  }

  /**
   * Helper method to retrieve a value from the diagnostic arguments, performing validation.
   * @param index THe index in the diagnostic arguments array.
   */
  protected getValueFromArgument(index: number): any {
    if (!this.diagnostic.messageArgs || this.diagnostic.messageArgs.length <= index)
      throw new Error();

    return this.diagnostic.messageArgs[index];
  }
}

/**
 * Base class for all ISchemaChanges implementations.
 * @alpha
 */
export abstract class BaseSchemaChanges implements ISchemaChanges {
  private _ecTypeName: string;
  private _schema: Schema;
  private _propertyValueChanges: PropertyValueChange[] = [];

  /**
   * Initializes a new BaseSchemaChanges instance.
   * @param schema The schema containing the changes.
   * @param anyECTypeName The name of the EC type.
   */
  constructor(schema: Schema, anyECTypeName: string) {
    this._schema = schema;
    this._ecTypeName = anyECTypeName;
  }

  /** Gets the array of PropertyValueChange instances. */
  public get propertyValueChanges(): PropertyValueChange[] {
    return this._propertyValueChanges;
  }

  /** Gets the name of the EC type associated with these schema changes. */
  public get ecTypeName(): string {
    return this._ecTypeName;
  }

  /** Gets the schema to which these changes are associated. */
  public get schema(): Schema {
    return this._schema;
  }

  /**
   * Adds a new ISchemaChange to a collection determined by the implementation.
   * @param change
   */
  public abstract addChange(change: ISchemaChange): void;

  /**
   * Helper method that adds a new ISchemaChange to a Map whose values are ISchemaChanges. The changesType will
   * be used to create a new ISchemaChanges instance if the changes collection does not exist in the Map.
   * @param changes The ISchemaChanges Map to which to add the ISchemaChange.
   * @param changesType The constructor of the ISchemaChanges. Called if the ISchemaChanges instance does not exist in the Map.
   * @param change The ISchemaChange to add.
   * @param changeKey The key used to identify the ISchemaChanges in the Map (typically the name of the EC type, ie. SchemaItem.name).
   */
  protected addChangeToMap<V extends ISchemaChanges>(changes: Map<string, V>, changesType: SchemaChangesConstructor, change: ISchemaChange, changeKey: string) {
    if (changes.has(changeKey)) {
      const existingChanges = changes.get(changeKey);
      existingChanges!.addChange(change);
    } else {
      const newChanges = new changesType(this._schema, changeKey);
      newChanges.addChange(change);
      changes.set(changeKey, newChanges as V);
    }
  }

  /**
   * Helper method to determine if the diagnostic is a property value change delta for this ISchemaChanges instance.
   * @param diagnostic The change diagnostic.
   * @param ecTypeName The name of the EC type as determined by the implementation.
   */
  protected isPropertyValueChangeForThis(diagnostic: AnyDiagnostic, ecTypeName: string): boolean {
    if (this.ecTypeName !== ecTypeName)
      return false;

    switch (diagnostic.code) {
      case SchemaCompareCodes.SchemaDelta:
      case SchemaCompareCodes.SchemaItemDelta:
      case SchemaCompareCodes.ClassDelta:
      case SchemaCompareCodes.MixinDelta:
      case SchemaCompareCodes.RelationshipDelta:
      case SchemaCompareCodes.CustomAttributeClassDelta:
      case SchemaCompareCodes.EnumerationDelta:
      case SchemaCompareCodes.KoqDelta:
      case SchemaCompareCodes.PropertyCategoryDelta:
      case SchemaCompareCodes.FormatDelta:
      case SchemaCompareCodes.UnitDelta:
      case SchemaCompareCodes.InvertedUnitDelta:
      case SchemaCompareCodes.PhenomenonDelta:
      case SchemaCompareCodes.ConstantDelta:
      case SchemaCompareCodes.PropertyDelta:
      case SchemaCompareCodes.RelationshipConstraintDelta:
        return true;
      default:
        return false;
    }
  }

  /**
   * Helper method to determine if the diagnostic is a CustomAttributeInstance class change for this ISchemaChanges instance.
   * @param diagnostic The change diagnostic.
   * @param ecTypeName The name of the EC type as determined by the implementation.
   */
  protected isCAContainerChangeForThis(diagnostic: AnyDiagnostic, ecTypeName: string | undefined): boolean {
    if (this.ecTypeName !== ecTypeName)
      return false;

    return diagnostic.code === SchemaCompareCodes.CustomAttributeInstanceClassMissing;
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics at the Schema level.
 * @alpha
 */
export class SchemaChanges extends BaseSchemaChanges {
  private _diagnostics: AnyDiagnostic[] = [];
  private _missingSchemaReferences: SchemaReferenceMissing[] = [];
  private _schemaReferenceDeltas: SchemaReferenceDelta[] = [];
  private _customAttributeChanges: Map<string, CustomAttributeContainerChanges> = new Map();
  private _classChanges: Map<string, ClassChanges> = new Map();
  private _schemaItemChanges: Map<string, SchemaItemChanges> = new Map();
  private _enumerationChanges: Map<string, EnumerationChanges> = new Map();
  private _kindOfQuantityChanges: Map<string, KindOfQuantityChanges> = new Map();
  private _formatChanges: Map<string, FormatChanges> = new Map();

  /**
   * Initializes a new SchemaChanges instance.
   * @param schema The schema containing the changes.
   */
  constructor(schema: Schema) {
    super(schema, schema.name);
  }

  /** Gets the MissingSchemaReferences collection. */
  public get missingSchemaReferences(): SchemaReferenceMissing[] { return this._missingSchemaReferences; }

  /** Gets the SchemaReferenceChange collection. */
  public get schemaReferenceDeltas(): SchemaReferenceDelta[] { return this._schemaReferenceDeltas; }

  /** Gets the CustomAttributeContainerChanges Map. */
  public get customAttributeChanges(): Map<string, CustomAttributeContainerChanges> { return this._customAttributeChanges; }

  /** Gets the ClassChanges Map. */
  public get classChanges(): Map<string, ClassChanges> { return this._classChanges; }

  /** Gets the SchemaItemChanges Map. */
  public get schemaItemChanges(): Map<string, SchemaItemChanges> { return this._schemaItemChanges; }

  /** Gets the EnumerationChanges Map. */
  public get enumerationChanges(): Map<string, EnumerationChanges> { return this._enumerationChanges; }

  /** Gets the KindOfQuantityChanges Map. */
  public get kindOfQuantityChanges(): Map<string, KindOfQuantityChanges> { return this._kindOfQuantityChanges; }

  /** Gets the FormatChanges Map. */
  public get formatChanges(): Map<string, FormatChanges> { return this._formatChanges; }

  /** Gets all the change diagnostics that have been added to instance. */
  public get allDiagnostics(): AnyDiagnostic[] {
    return this._diagnostics;
  }

  /**
   * Adds a new change diagnostic for the schema.
   * @param diagnostic
   */
  public addDiagnostic(diagnostic: AnyDiagnostic) {
    this._diagnostics.push(diagnostic);

    const change = this.createChangeFromDiagnostic(diagnostic);
    this.addChange(change);
  }

  /**
   * Adds the change to the appropriate change collection at this level or adds the change
   * to a Map of child changes will which propagate the change to lower levels. Typically
   * any 'addChangeToMap' type method will then call addChange to add the ISchemaChange to
   * the ISchemaChanges instance at that level.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange) {
    const schemaName = this.getSchemaNameFromChange(change);

    // If change is at the schema level, record change and return
    if (schemaName) {
      if (change.diagnostic.code === SchemaCompareCodes.SchemaReferenceMissing) {
        this.missingSchemaReferences.push(change as SchemaReferenceMissing);
        return;
      }

      if (change.diagnostic.code === SchemaCompareCodes.SchemaReferenceDelta) {
        this.schemaReferenceDeltas.push(change as SchemaReferenceDelta);
        return;
      }

      if (this.isCAContainerChangeForThis(change.diagnostic, schemaName)) {
        this.addChangeToMap(this.customAttributeChanges, CustomAttributeContainerChanges, change, (change as CustomAttributeContainerChange).changeKey);
        return;
      }

      if (this.isPropertyValueChangeForThis(change.diagnostic, schemaName)) {
        this.propertyValueChanges.push(change as PropertyValueChange);
        return;
      }
    }

    // Start by adding the change for the top-level SchemaItem which will
    // start a recursion to add the change at each appropriate level.
    const schemaItem = change.topLevelSchemaItem;
    const schemaItemType = (schemaItem as SchemaItem).schemaItemType;

    switch (schemaItemType) {
      case SchemaItemType.EntityClass:
      case SchemaItemType.Mixin:
      case SchemaItemType.RelationshipClass:
      case SchemaItemType.StructClass:
      case SchemaItemType.CustomAttributeClass:
        this.addChangeToClassMap(change, schemaItem as AnyClass);
        return;
      case SchemaItemType.PropertyCategory:
      case SchemaItemType.Unit:
      case SchemaItemType.InvertedUnit:
      case SchemaItemType.UnitSystem:
      case SchemaItemType.Phenomenon:
      case SchemaItemType.Constant:
        this.addChangeToSchemaItemMap(change, schemaItem as SchemaItem);
        return;
      case SchemaItemType.Enumeration:
        this.addChangeToEnumerationMap(change, schemaItem as Enumeration);
        return;
      case SchemaItemType.KindOfQuantity:
        this.addChangeToKOQMap(change, schemaItem as KindOfQuantity);
        return;
      case SchemaItemType.Format:
        this.addChangeToFormatMap(change, schemaItem as Format);
        return;
    }
  }

  private getSchemaNameFromChange(change: ISchemaChange): string | undefined {
    const type = change.diagnostic.ecDefinition;

    return (Schema.isSchema(type)) ? type.name : undefined;
  }

  /** This creates ISchemaChange instances based on the change diagnostic specified. */
  private createChangeFromDiagnostic(diagnostic: AnyDiagnostic): ISchemaChange {
    switch (diagnostic.code) {
      case SchemaCompareCodes.SchemaReferenceMissing:
        return new SchemaReferenceMissing(diagnostic);
      case SchemaCompareCodes.SchemaReferenceDelta:
        return new SchemaReferenceDelta(diagnostic);
      case SchemaCompareCodes.SchemaDelta:
      case SchemaCompareCodes.SchemaItemDelta:
      case SchemaCompareCodes.ClassDelta:
      case SchemaCompareCodes.MixinDelta:
      case SchemaCompareCodes.RelationshipDelta:
      case SchemaCompareCodes.CustomAttributeClassDelta:
      case SchemaCompareCodes.EnumerationDelta:
      case SchemaCompareCodes.KoqDelta:
      case SchemaCompareCodes.PropertyCategoryDelta:
      case SchemaCompareCodes.FormatDelta:
      case SchemaCompareCodes.UnitDelta:
      case SchemaCompareCodes.InvertedUnitDelta:
      case SchemaCompareCodes.PhenomenonDelta:
      case SchemaCompareCodes.ConstantDelta:
      case SchemaCompareCodes.PropertyDelta:
      case SchemaCompareCodes.RelationshipConstraintDelta:
        return new PropertyValueChange(diagnostic);
      case SchemaCompareCodes.SchemaItemMissing:
        return new SchemaItemMissing(diagnostic);
      case SchemaCompareCodes.BaseClassDelta:
        return new BaseClassDelta(diagnostic);
      case SchemaCompareCodes.PropertyMissing:
        return new PropertyMissing(diagnostic);
      case SchemaCompareCodes.EntityMixinMissing:
        return new EntityMixinChange(diagnostic);
      case SchemaCompareCodes.RelationshipConstraintClassMissing:
        return new RelationshipConstraintClassChange(diagnostic);
      case SchemaCompareCodes.CustomAttributeInstanceClassMissing:
        return new CustomAttributeContainerChange(diagnostic);
      case SchemaCompareCodes.EnumeratorMissing:
        return new EnumeratorMissing(diagnostic);
      case SchemaCompareCodes.EnumeratorDelta:
        return new EnumeratorDelta(diagnostic);
      case SchemaCompareCodes.PresentationUnitMissing:
        return new PresentationUnitChange(diagnostic);
      case SchemaCompareCodes.FormatUnitMissing:
        return new FormatUnitChange(diagnostic);
      case SchemaCompareCodes.UnitLabelOverrideDelta:
        return new UnitLabelOverrideDelta(diagnostic);
      default:
        throw new Error();
    }
  }

  private addChangeToSchemaItemMap(change: ISchemaChange, schemaItem: SchemaItem) {
    if (this.schemaItemChanges.has(schemaItem.name)) {
      const existingChanges = this.schemaItemChanges.get(schemaItem.name);
      existingChanges!.addChange(change);
    } else {
      const newChanges = new SchemaItemChanges(this.schema, schemaItem.name, schemaItem.schemaItemType);
      newChanges.addChange(change);
      this.schemaItemChanges.set(schemaItem.name, newChanges);
    }
  }

  private addChangeToClassMap(change: ISchemaChange, ecClass: AnyClass) {
    if (this.classChanges.has(ecClass.name)) {
      const existingChanges = this.classChanges.get(ecClass.name);
      existingChanges!.addChange(change);
    } else {
      const newChanges = new ClassChanges(this.schema, ecClass.name, ecClass.schemaItemType);
      newChanges.addChange(change);
      this.classChanges.set(ecClass.name, newChanges);
    }
  }

  private addChangeToEnumerationMap(change: ISchemaChange, enumeration: Enumeration) {
    if (this.enumerationChanges.has(enumeration.name)) {
      const existingChanges = this.enumerationChanges.get(enumeration.name);
      existingChanges!.addChange(change);
    } else {
      const newChanges = new EnumerationChanges(this.schema, enumeration.name, enumeration.schemaItemType);
      newChanges.addChange(change);
      this.enumerationChanges.set(enumeration.name, newChanges);
    }
  }

  private addChangeToKOQMap(change: ISchemaChange, koq: KindOfQuantity) {
    if (this.kindOfQuantityChanges.has(koq.name)) {
      const existingChanges = this.kindOfQuantityChanges.get(koq.name);
      existingChanges!.addChange(change);
    } else {
      const newChanges = new KindOfQuantityChanges(this.schema, koq.name, koq.schemaItemType);
      newChanges.addChange(change);
      this.kindOfQuantityChanges.set(koq.name, newChanges);
    }
  }

  private addChangeToFormatMap(change: ISchemaChange, format: Format) {
    if (this.formatChanges.has(format.name)) {
      const existingChanges = this.formatChanges.get(format.name);
      existingChanges!.addChange(change);
    } else {
      const newChanges = new FormatChanges(this.schema, format.name, format.schemaItemType);
      newChanges.addChange(change);
      this.formatChanges.set(format.name, newChanges);
    }
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics at the SchemaItem level.
 * @alpha
 */
export class SchemaItemChanges extends BaseSchemaChanges {
  private _schemaItemType: SchemaItemType;
  private _schemaItemMissing?: SchemaItemMissing;
  private _customAttributeChanges: Map<string, CustomAttributeContainerChanges> = new Map();

  /**
   * Initializes a new SchemaItemChanges instance.
   * @param schema The Schema containing the change.
   * @param schemaItemName The name of the EC type associated with the change.
   * @param schemaItemType The SchemaItemType of the EC type.
   */
  constructor(schema: Schema, schemaItemName: string, schemaItemType: SchemaItemType) {
    super(schema, schemaItemName);
    this._schemaItemType = schemaItemType;
  }

  /** Gets the SchemaItemType of the SchemaItem associated with the changes. */
  public get schemaItemType(): SchemaItemType {
    return this._schemaItemType;
  }

  /** Gets the SchemaItemMissing change. Maybe undefined. */
  public get schemaItemMissing(): SchemaItemMissing | undefined {
    return this._schemaItemMissing;
  }

  /** Gets the Map of CustomAttributeContainerChanges. */
  public get customAttributeChanges(): Map<string, CustomAttributeContainerChanges> {
    return this._customAttributeChanges;
  }

  /**
   * Adds the change to the appropriate change collection at this level or adds the change
   * to a Map of child changes will which propagate the change to lower levels.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    if (change.diagnostic.code === SchemaCompareCodes.SchemaItemMissing) {
      this._schemaItemMissing = change as SchemaItemMissing;
      return;
    }

    const name = this.getSchemaItemNameFromChange(change);
    if (!name)
      return;

    if (this.isPropertyValueChangeForThis(change.diagnostic, name)) {
      this.propertyValueChanges.push(change as PropertyValueChange);
      return;
    }

    if (this.isCAContainerChangeForThis(change.diagnostic, name))
      this.addChangeToMap(this.customAttributeChanges, CustomAttributeContainerChanges, change, (change as CustomAttributeContainerChange).changeKey);
  }

  protected getSchemaItemNameFromChange(change: ISchemaChange): string | undefined {
    const type = change.diagnostic.ecDefinition;
    return (SchemaItem.isSchemaItem(type)) ? type.name : undefined;
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics at the Class level.
 * @alpha
 */
export class ClassChanges extends SchemaItemChanges {
  private _baseClassDelta?: BaseClassDelta;
  private _propertyChanges: Map<string, PropertyChanges> = new Map();
  private _entityMixinChanges: Map<string, EntityMixinChanges> = new Map();
  private _sourceConstraintChanges: Map<string, RelationshipConstraintChanges> = new Map();
  private _targetConstraintChanges: Map<string, RelationshipConstraintChanges> = new Map();

  /** Gets the BaseClassDelta change. Maybe undefined. */
  public get baseClassDelta(): BaseClassDelta | undefined {
    return this._baseClassDelta;
  }

  /** Gets the PropertyChanges Map. */
  public get propertyChanges(): Map<string, PropertyChanges> {
    return this._propertyChanges;
  }

  /** Gets the EntityMixinChanges Map. */
  public get entityMixinChanges(): Map<string, EntityMixinChanges> {
    return this._entityMixinChanges;
  }

  /** Gets the source RelationshipConstraintChanges Map. */
  public get sourceConstraintChanges(): Map<string, RelationshipConstraintChanges> {
    return this._sourceConstraintChanges;
  }

  /** Gets the target RelationshipConstraintChanges Map. */
  public get targetConstraintChanges(): Map<string, RelationshipConstraintChanges> {
    return this._targetConstraintChanges;
  }

  /**
   * Adds the change to the appropriate change collection at this level or adds the change
   * to a Map of child changes will which propagate the change to lower levels.
   * @param change The ISchemaChange to add.
   */
  public override addChange(change: ISchemaChange): void {
    super.addChange(change);

    if (change.diagnostic.code === SchemaCompareCodes.BaseClassDelta) {
      this._baseClassDelta = change as BaseClassDelta;
      return;
    }

    if (change.diagnostic.code === SchemaCompareCodes.EntityMixinMissing) {
      this.addChangeToMap(this.entityMixinChanges, EntityMixinChanges, change, (change as EntityMixinChange).changeKey);
      return;
    }

    if (Property.isProperty(change.diagnostic.ecDefinition)) {
      this.addChangeToMap(this.propertyChanges, PropertyChanges, change, change.diagnostic.ecDefinition.name);
      return;
    }

    if (RelationshipConstraint.isRelationshipConstraint(change.diagnostic.ecDefinition)) {
      if (change.diagnostic.ecDefinition.isSource)
        this.addChangeToMap(this.sourceConstraintChanges, RelationshipConstraintChanges, change, change.diagnostic.ecDefinition.fullName);
      else
        this.addChangeToMap(this.targetConstraintChanges, RelationshipConstraintChanges, change, change.diagnostic.ecDefinition.fullName);
    }
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics at the Property level.
 * @alpha
 */
export class PropertyChanges extends BaseSchemaChanges {
  private _propertyMissing?: PropertyMissing;
  private _customAttributeChanges: Map<string, CustomAttributeContainerChanges> = new Map();

  /** Gets the PropertyMissing change. Maybe undefined. */
  public get propertyMissing(): PropertyMissing | undefined {
    return this._propertyMissing;
  }

  /** Gets the CustomAttributeContainerChanges Map. */
  public get customAttributeChanges(): Map<string, CustomAttributeContainerChanges> {
    return this._customAttributeChanges;
  }

  /**
   * Adds the change to the appropriate change collection at this level or adds the change
   * to a Map of child changes will which propagate the change to lower levels.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    const propertyName = this.getPropertyNameFromChange(change);
    if (!propertyName)
      return;

    if (change.diagnostic.code === SchemaCompareCodes.PropertyMissing) {
      this._propertyMissing = change as PropertyMissing;
      return;
    }

    if (this.isPropertyValueChangeForThis(change.diagnostic, propertyName)) {
      this.propertyValueChanges.push(change as PropertyValueChange);
      return;
    }

    if (this.isCAContainerChangeForThis(change.diagnostic, propertyName))
      this.addChangeToMap(this.customAttributeChanges, CustomAttributeContainerChanges, change, (change as CustomAttributeContainerChange).changeKey);
  }

  private getPropertyNameFromChange(change: ISchemaChange): string | undefined {
    const type = change.diagnostic.ecDefinition;
    return (Property.isProperty(type)) ? type.name : undefined;
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for Enumerations.
 * @alpha
 */
export class EnumerationChanges extends SchemaItemChanges {
  private _enumeratorChanges: Map<string, EnumeratorChanges> = new Map();

  /** Gets the EnumeratorChanges map. */
  public get enumeratorChanges(): Map<string, EnumeratorChanges> {
    return this._enumeratorChanges;
  }

  /**
   * Adds the change to the appropriate change collection at this level or adds the change
   * to a Map of child changes will which propagate the change to lower levels.
   * @param change The ISchemaChange to add.
   */
  public override addChange(change: ISchemaChange): void {
    super.addChange(change);

    if (change.diagnostic.code === SchemaCompareCodes.EnumeratorDelta) {
      this.addChangeToMap(this.enumeratorChanges, EnumeratorChanges, change, (change as EnumeratorDelta).changeKey);
      return;
    }

    if (change.diagnostic.code === SchemaCompareCodes.EnumeratorMissing) {
      this.addChangeToMap(this.enumeratorChanges, EnumeratorChanges, change, (change as EnumeratorMissing).changeKey);
    }
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for CustomAttributeContainers.
 * @alpha
 */
export class CustomAttributeContainerChanges extends BaseSchemaChanges {
  private _customAttributeChanges: CustomAttributeContainerChange[] = [];

  /** Gets the CustomAttributeContainerChange collection. */
  public get customAttributeChanges(): CustomAttributeContainerChange[] {
    return this._customAttributeChanges;
  }

  /**
   * Adds the change to the appropriate change collection at this level.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    if (change.diagnostic.code === SchemaCompareCodes.CustomAttributeInstanceClassMissing)
      this.customAttributeChanges.push(change as CustomAttributeContainerChange);
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for RelationshipConstraints.
 * @alpha
 */
export class RelationshipConstraintChanges extends BaseSchemaChanges {
  private _constraintClassChanges: RelationshipConstraintClassChange[] = [];
  private _customAttributeChanges: Map<string, CustomAttributeContainerChanges> = new Map();

  /** Gets the RelationshipConstraintClassChange collection. */
  public get constraintClassChanges(): RelationshipConstraintClassChange[] {
    return this._constraintClassChanges;
  }

  /** Gets the CustomAttributeContainerChanges Map. */
  public get customAttributeChanges(): Map<string, CustomAttributeContainerChanges> {
    return this._customAttributeChanges;
  }

  /**
   * Adds the change to the appropriate change collection at this level or adds the change
   * to a Map of child changes will which propagate the change to lower levels.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    const constraintName = this.getConstraintNameFromChange(change);
    if (!constraintName)
      return;

    if (this.isPropertyValueChangeForThis(change.diagnostic, constraintName)) {
      this.propertyValueChanges.push(change as PropertyValueChange);
      return;
    }

    if (change.diagnostic.code === SchemaCompareCodes.RelationshipConstraintClassMissing) {
      this.constraintClassChanges.push(change as RelationshipConstraintClassChange);
      return;
    }

    if (this.isCAContainerChangeForThis(change.diagnostic, constraintName))
      this.addChangeToMap(this.customAttributeChanges, CustomAttributeContainerChanges, change, (change as CustomAttributeContainerChange).changeKey);
  }

  private getConstraintNameFromChange(change: ISchemaChange): string | undefined {
    const type = change.diagnostic.ecDefinition;
    if (RelationshipConstraint.isRelationshipConstraint(type))
      return type.fullName;
    return undefined;
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for Enumerators.
 * @alpha
 */
export class EnumeratorChanges extends BaseSchemaChanges {
  private _enumeratorDeltas: EnumeratorDelta[] = [];
  private _enumeratorMissing?: EnumeratorMissing;

  /** Gets the EnumeratorDelta collection. */
  public get enumeratorDeltas(): EnumeratorDelta[] {
    return this._enumeratorDeltas;
  }

  /** Gets the EnumeratorMissing change. Maybe undefined. */
  public get enumeratorMissing(): EnumeratorMissing | undefined {
    return this._enumeratorMissing;
  }

  /**
   * Adds the change to the appropriate change collection.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    if (change.diagnostic.code === SchemaCompareCodes.EnumeratorDelta) {
      this.enumeratorDeltas.push(change as EnumeratorDelta);
      return;
    }

    if (change.diagnostic.code === SchemaCompareCodes.EnumeratorMissing)
      this._enumeratorMissing = change as EnumeratorMissing;
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for EntityClass mixin changes.
 * @alpha
 */
export class EntityMixinChanges extends BaseSchemaChanges {
  private _entityMixinChange: EntityMixinChange[] = [];

  /** Gets the EntityMixinChange collection. */
  public get entityMixinChange(): EntityMixinChange[] {
    return this._entityMixinChange;
  }

  /**
   * Adds the change to the appropriate change collection.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    if (change.diagnostic.code === SchemaCompareCodes.EntityMixinMissing)
      this.entityMixinChange.push(change as EntityMixinChange);
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for KindOfQuantities.
 * @alpha
 */
export class KindOfQuantityChanges extends SchemaItemChanges {
  private _presentationUnitChanges: Map<string, PresentationUnitChanges> = new Map();

  /** Gets the EntityMixinChange Map. */
  public get presentationUnitChanges(): Map<string, PresentationUnitChanges> {
    return this._presentationUnitChanges;
  }

  /**
   * Adds the change to the appropriate change collection.
   * @param change The ISchemaChange to add.
   */
  public override addChange(change: ISchemaChange): void {
    super.addChange(change);

    if (change.diagnostic.code === SchemaCompareCodes.PresentationUnitMissing)
      this.addChangeToMap(this.presentationUnitChanges, PresentationUnitChanges, change, (change as PresentationUnitChange).changeKey);
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for KindOfQuantity presentation units.
 * @alpha
 */
export class PresentationUnitChanges extends BaseSchemaChanges {
  private _presentationUnitChange: PresentationUnitChange[] = [];

  /** Gets the PresentationUnitChange collection. */
  public get presentationUnitChange(): PresentationUnitChange[] {
    return this._presentationUnitChange;
  }

  /**
   * Adds the change to the appropriate change collection.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    if (change.diagnostic.code === SchemaCompareCodes.PresentationUnitMissing)
      this.presentationUnitChange.push(change as PresentationUnitChange);
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for Formats.
 * @alpha
 */
export class FormatChanges extends SchemaItemChanges {
  private _formatUnitChanges: Map<string, FormatUnitChanges> = new Map();

  /** Gets the FormatUnitChanges collection. */
  public get formatUnitChanges(): Map<string, FormatUnitChanges> {
    return this._formatUnitChanges;
  }

  /**
   * Adds the change to the appropriate change collection.
   * @param change The ISchemaChange to add.
   */
  public override addChange(change: ISchemaChange): void {
    super.addChange(change);

    if (change.diagnostic.code === SchemaCompareCodes.UnitLabelOverrideDelta) {
      this.addChangeToMap(this.formatUnitChanges, FormatUnitChanges, change, (change as UnitLabelOverrideDelta).changeKey);
      return;
    }

    if (change.diagnostic.code === SchemaCompareCodes.FormatUnitMissing)
      this.addChangeToMap(this.formatUnitChanges, FormatUnitChanges, change, (change as FormatUnitChange).changeKey);
  }
}

/**
 * An ISchemaChanges implementation for managing schema comparison diagnostics for Format units.
 * @alpha
 */
export class FormatUnitChanges extends BaseSchemaChanges {
  private _unitLabelOverrideDeltas: UnitLabelOverrideDelta[] = [];
  private _formatUnitChanges: FormatUnitChange[] = [];

  /** Gets the UnitLabelOverrideDelta collection. */
  public get unitLabelOverrideDeltas(): UnitLabelOverrideDelta[] {
    return this._unitLabelOverrideDeltas;
  }

  /** Gets the FormatUnitChange collection. */
  public get formatUnitChanges(): FormatUnitChange[] {
    return this._formatUnitChanges;
  }

  /**
   * Adds the change to the appropriate change collection.
   * @param change The ISchemaChange to add.
   */
  public addChange(change: ISchemaChange): void {
    if (change.diagnostic.code === SchemaCompareCodes.UnitLabelOverrideDelta) {
      this.unitLabelOverrideDeltas.push(change as UnitLabelOverrideDelta);
      return;
    }

    if (change.diagnostic.code === SchemaCompareCodes.FormatUnitMissing)
      this.formatUnitChanges.push(change as FormatUnitChange);
  }
}

/** ISchemaChange Implementations */

/**
 * An ISchemaChange implementation to act as the base class for all changes
 * associated with SchemaItem instances.
 * @alpha
 */
export abstract class SchemaItemChange extends BaseSchemaChange {
  public get topLevelSchemaItem(): Schema | SchemaItem { return this.diagnostic.ecDefinition as SchemaItem; }
}

/**
 * An ISchemaChange implementation for Schema reference changes.
 * @alpha
 */
export class SchemaReferenceMissing extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets the SchemaItem or Schema (if a schema change) that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem { return this.diagnostic.ecDefinition as Schema; }

  /** Gets a string representation of the change. */
  public toString(): string {
    const refSchema = this.getNameFromArgument(0, false, true);
    return `Schema(${refSchema})`;
  }
}

/**
 * An ISchemaChange implementation differences of baseClasses between two ECClasses.
 * @alpha
 */
export class SchemaReferenceDelta extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Delta; }

  /** Gets the SchemaItem or Schema (if a schema change) that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem { return this.diagnostic.ecDefinition as Schema; }

  /** Gets a string representation of the change. */
  public toString(): string {
    const refSchema = this.getNameFromArgument(0, false, true);
    const versionA = this.getStringFromArgument(1);
    const versionB = this.getStringFromArgument(2);
    return `Schema(${refSchema}): ${versionA} -> ${versionB}`;
  }
}

/**
 * An ISchemaChange implementation for missing SchemaItems.
 * @alpha
 */
export class SchemaItemMissing extends SchemaItemChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets a string representation of the change. */
  public toString(): string {
    const item = this.diagnostic.ecDefinition as SchemaItem;
    const typeName = ECClass.isECClass(item) ? "Class" : schemaItemTypeToString(item.schemaItemType);
    return `${typeName}(${item.name})`;
  }
}

/**
 * An ISchemaChange implementation for changes in property values of any EC type.
 * @alpha
 */
export class PropertyValueChange extends BaseSchemaChange {

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    if (SchemaItem.isSchemaItem(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition;

    if (Schema.isSchema(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition;

    if (Property.isProperty(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition.class;

    if (RelationshipConstraint.isRelationshipConstraint(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition.relationshipClass;

    throw new Error();
  }

  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Delta; }

  /** Gets a string representation of the change. */
  public toString(): string {
    let property = this.getStringFromArgument(0);
    // Capitalize property name
    property = property.charAt(0).toUpperCase() + property.slice(1);
    const valueA = this.getStringFromArgument(1);
    const valueB = this.getStringFromArgument(2);
    return `${property}: ${valueA} -> ${valueB}`;
  }
}

/**
 * An ISchemaChange implementation for missing CustomAttribute instances
 * for a given container.
 * @alpha
 */
export class CustomAttributeContainerChange extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    if (SchemaItem.isSchemaItem(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition;

    if (Property.isProperty(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition.class;

    if (Schema.isSchema(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition;

    if (RelationshipConstraint.isRelationshipConstraint(this.diagnostic.ecDefinition))
      return this.diagnostic.ecDefinition.relationshipClass;

    throw new Error();
  }

  /** Gets the key to use in a Map of this type of ISchemaChange. */
  public get changeKey(): string {
    return (this.getValueFromArgument(0) as CustomAttribute).className;
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    return `CustomAttribute: ${this.changeKey}`;
  }
}

/**
 * An ISchemaChange implementation differences of baseClasses between two ECClasses.
 * @alpha
 */
export class BaseClassDelta extends SchemaItemChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Delta; }

  /** Gets a string representation of the change. */
  public toString(): string {
    const classA = this.getNameFromArgument(0, true, true);
    const classB = this.getNameFromArgument(1, true, true);
    return `BaseClass: ${classA} -> ${classB}`;
  }
}

/**
 * An ISchemaChange implementation for missing properties.
 * @alpha
 */
export class PropertyMissing extends BaseSchemaChange {
  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return (this.diagnostic.ecDefinition as Property).class;
  }

  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets a string representation of the change. */
  public toString(): string {
    return `Property(${(this.diagnostic.ecDefinition as Property).name})`;
  }
}

/**
 * An ISchemaChange implementation for missing RelationshipConstraint classes.
 * @alpha
 */
export class RelationshipConstraintClassChange extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return (this.diagnostic.ecDefinition as RelationshipConstraint).relationshipClass;
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    const constraintClass = this.getNameFromArgument(0, false, true);
    return `ConstraintClass: ${constraintClass}`;
  }
}

/**
 * An ISchemaChange implementation for differences of Enumerator properties.
 * @alpha
 */
export class EnumeratorDelta extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Delta; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return this.diagnostic.ecDefinition as Enumeration;
  }

  /** Gets the key to use in a Map of this type of ISchemaChange. */
  public get changeKey(): string {
    const enumerator = this.getValueFromArgument(0) as AnyEnumerator;
    return enumerator.name;
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    let propertyName = this.getStringFromArgument(1);
    // Capitalize property name
    propertyName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
    const valueA = this.getStringFromArgument(2);
    const valueB = this.getStringFromArgument(3);
    return `${propertyName}: ${valueA} -> ${valueB}`;
  }
}

/**
 * An ISchemaChange implementation for missing Enumerators within an Enumeration.
 * @alpha
 */
export class EnumeratorMissing extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return this.diagnostic.ecDefinition as Enumeration;
  }

  /** Gets the key to use in a Map of this type of ISchemaChange. */
  public get changeKey(): string {
    return (this.getValueFromArgument(0) as AnyEnumerator).name;
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    return `Enumerator(${this.changeKey})`;
  }
}

/**
 * An ISchemaChange implementation for missing mixins within an EntityClass.
 * @alpha
 */
export class EntityMixinChange extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return this.diagnostic.ecDefinition as EntityClass;
  }

  /** Gets the key to use in a Map of this type of ISchemaChange. */
  public get changeKey(): string {
    return this.getNameFromArgument(0, false, true);
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    return `Mixin: ${this.changeKey}`;
  }
}

/**
 * An ISchemaChange implementation for missing presentation Units within a KindOfQuantity.
 * @alpha
 */
export class PresentationUnitChange extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return this.diagnostic.ecDefinition as KindOfQuantity;
  }

  /** Gets the key to use in a Map of this type of ISchemaChange. */
  public get changeKey(): string {
    return this.getNameFromArgument(0, false, true);
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    return `Unit: ${this.changeKey}`;
  }

  private get _isOverrideFormat(): boolean {
    if (!this.diagnostic.messageArgs)
      return false;

    return OverrideFormat.isOverrideFormat(this.diagnostic.messageArgs[0]);
  }
}

/**
 * An ISchemaChange implementation for missing Units within a Format.
 * @alpha
 */
export class FormatUnitChange extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Missing; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return this.diagnostic.ecDefinition as Format;
  }

  /** Gets the key to use in a Map of this type of ISchemaChange. */
  public get changeKey(): string {
    return this.getNameFromArgument(0, false, true);
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    return `Unit: ${this.changeKey}`;
  }

  private get _isInvertedUnit(): boolean {
    if (!this.diagnostic.messageArgs)
      return false;

    return this.diagnostic.messageArgs[0].schemaItemType === SchemaItemType.InvertedUnit;
  }
}

/**
 * An ISchemaChange implementation for differences of Unit label overrides within a given Format.
 * @alpha
 */
export class UnitLabelOverrideDelta extends BaseSchemaChange {
  /** Gets the default ChangeType (Delta or Missing) for this change */
  public get defaultChangeType(): ChangeType { return ChangeType.Delta; }

  /** Gets the SchemaItem that this change ultimately belongs to. */
  public get topLevelSchemaItem(): Schema | SchemaItem {
    return this.diagnostic.ecDefinition as Format;
  }

  /** Gets the key to use in a Map of this type of ISchemaChange. */
  public get changeKey(): string {
    return this.getNameFromArgument(0, false, true);
  }

  /** Gets a string representation of the change. */
  public toString(): string {
    const valueA = this.getStringFromArgument(1);
    const valueB = this.getStringFromArgument(2);
    return `Label: ${valueA} -> ${valueB}`;
  }

  private get _isInvertedUnit(): boolean {
    if (!this.diagnostic.messageArgs)
      return false;

    return this.diagnostic.messageArgs[0].schemaItemType === SchemaItemType.InvertedUnit;
  }
}
