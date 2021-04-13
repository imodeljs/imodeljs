/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Comparison
 */

import {
  classModifierToString, containerTypeToString, primitiveTypeToString, schemaItemTypeToString, strengthDirectionToString, strengthToString,
} from "../ECObjects";
import { AnyClass } from "../Interfaces";
import { Constant } from "../Metadata/Constant";
import { CustomAttributeContainerProps } from "../Metadata/CustomAttribute";
import { CustomAttributeClass } from "../Metadata/CustomAttributeClass";
import { EntityClass } from "../Metadata/EntityClass";
import { AnyEnumerator, Enumeration } from "../Metadata/Enumeration";
import { Format } from "../Metadata/Format";
import { InvertedUnit } from "../Metadata/InvertedUnit";
import { KindOfQuantity } from "../Metadata/KindOfQuantity";
import { Mixin } from "../Metadata/Mixin";
import { Phenomenon } from "../Metadata/Phenomenon";
import { AnyProperty, StructProperty } from "../Metadata/Property";
import { PropertyCategory } from "../Metadata/PropertyCategory";
import { RelationshipClass, RelationshipConstraint } from "../Metadata/RelationshipClass";
import { Schema } from "../Metadata/Schema";
import { SchemaItem } from "../Metadata/SchemaItem";
import { Unit } from "../Metadata/Unit";
import { propertyTypeToString } from "../PropertyTypes";
import { formatTraitsToArray, formatTypeToString, scientificTypeToString, showSignOptionToString } from "@bentley/imodeljs-quantity";
import { ISchemaCompareReporter } from "./SchemaCompareReporter";
import { SchemaCompareResultDelegate } from "./SchemaCompareResultDelegate";
import { SchemaCompareVisitor } from "./SchemaCompareVisitor";
import { SchemaWalker } from "./SchemaWalker";

/**
 * Enum that identifies if Schema A is being iterated (Forward) or
 * Schema B is being iterated (Backward);
 * @alpha
 */
export enum SchemaCompareDirection {
  Forward = 0,
  Backward = 1,
}
/**
 * Interface for comparing EC Schemas.
 * @alpha
 */
export interface ISchemaComparer {
  compareSchemas(schemaA: Schema, schemaB: Schema): void;
  compareSchemaProps(schemaA: Schema, schemaB: Schema): void;
  compareSchemaItems(schemaItemA: SchemaItem, schemaItemB: SchemaItem | undefined): void;
  compareClasses(classA: AnyClass, classB: AnyClass | undefined): void;
  compareProperties(propertyA: AnyProperty, propertyB: AnyProperty | undefined): void;
  compareEntityClasses(entityA: EntityClass, entityB: EntityClass | undefined): void;
  compareMixins(mixinA: Mixin, mixinB: Mixin | undefined): void;
  compareRelationshipClasses(relationshipClassA: RelationshipClass, relationshipClassB: RelationshipClass | undefined): void;
  compareRelationshipConstraints(relationshipConstraintA: RelationshipConstraint, relationshipConstraintB: RelationshipConstraint | undefined): void;
  compareCustomAttributeClasses(customAttributeClassA: CustomAttributeClass, customAttributeClassB: CustomAttributeClass | undefined): void;
  compareCustomAttributeContainers(containerA: CustomAttributeContainerProps, containerB: CustomAttributeContainerProps | undefined): void;
  compareEnumerations(enumA: Enumeration, enumB: Enumeration | undefined): void;
  compareKindOfQuantities(koqA: KindOfQuantity, koqB: KindOfQuantity | undefined): void;
  comparePropertyCategories(categoryA: PropertyCategory, categoryB: PropertyCategory | undefined): void;
  compareFormats(formatA: Format, formatB: Format | undefined): void;
  compareUnits(unitA: Unit, unitB: Unit | undefined): void;
  compareInvertedUnits(invertedUnitA: InvertedUnit, invertedUnitB: InvertedUnit | undefined): void;
  comparePhenomenons(phenomenonA: Phenomenon, phenomenonB: Phenomenon | undefined): void;
  compareConstants(constantA: Constant, constantB: Constant | undefined): void;
}

function labelsMatch(label1?: string, label2?: string) {
  label1 = label1 === undefined ? "" : label1;
  label2 = label2 === undefined ? "" : label2;
  return label1 === label2;
}

/**
 * Compares EC Schemas and reports differences using the [[IDiagnosticReporter]] objects
 * specified.
 * @alpha
 */
export class SchemaComparer {
  private _compareDirection: SchemaCompareDirection;
  private _reporter!: SchemaCompareResultDelegate;
  private _reporters: ISchemaCompareReporter[];

  /**
   * Initializes a new SchemaComparer instance.
   * @param reporters The [[IDiagnosticReporter]] object(s) to use to report the results.
   */
  constructor(...reporters: ISchemaCompareReporter[]) {
    this._compareDirection = SchemaCompareDirection.Forward;
    this._reporters = reporters;
  }

  /**
   * Compares two schemas to identify differences.
   * @param schemaA The first Schema.
   * @param schemaB The second Schema.
   */
  public async compareSchemas(schemaA: Schema, schemaB: Schema) {
    this._reporter = new SchemaCompareResultDelegate(schemaA, schemaB, ...this._reporters);
    let visitor = new SchemaCompareVisitor(this, schemaB);
    let walker = new SchemaWalker(visitor);
    await walker.traverseSchema(schemaA);

    this._compareDirection = SchemaCompareDirection.Backward;

    visitor = new SchemaCompareVisitor(this, schemaA);
    walker = new SchemaWalker(visitor);
    await walker.traverseSchema(schemaB);

    this._compareDirection = SchemaCompareDirection.Forward;
    this._reporter.compareComplete();
  }

  /**
   * Compares two schemas to identify differences between property values.
   * @param schemaA The first Schema.
   * @param schemaB The second Schema.
   */
  public async compareSchemaProps(schemaA: Schema, schemaB: Schema): Promise<void> {
    const promises: Array<Promise<void>> = [];
    for (const ref of schemaA.references) {
      const refB = await schemaB.getReference(ref.fullName);
      if (!refB)
        promises.push(this._reporter.reportSchemaReferenceMissing(schemaA, ref, this._compareDirection));
      else if (!refB.schemaKey.matches(ref.schemaKey))
        promises.push(this._reporter.reportSchemaReferenceDelta(schemaA, ref, ref.schemaKey.version.toString(), refB.schemaKey.version.toString(), this._compareDirection));
    }

    if (this._compareDirection === SchemaCompareDirection.Backward)
      return;

    if (schemaA.schemaKey.toString() !== schemaB.schemaKey.toString())
      promises.push(this._reporter.reportSchemaDelta(schemaA, "schemaKey", schemaA.schemaKey.toString(), schemaB.schemaKey.toString(), this._compareDirection));

    if (schemaA.alias !== schemaB.alias)
      promises.push(this._reporter.reportSchemaDelta(schemaA, "alias", schemaA.alias, schemaB.alias, this._compareDirection));

    if (schemaA.description !== schemaB.description)
      promises.push(this._reporter.reportSchemaDelta(schemaA, "description", schemaA.description, schemaB.description, this._compareDirection));

    if (schemaA.label !== schemaB.label)
      promises.push(this._reporter.reportSchemaDelta(schemaA, "label", schemaA.label, schemaB.label, this._compareDirection));

    await Promise.all(promises);
  }

  /**
   * Compares two SchemaItems to identify differences between property values.
   * @param schemaItemA The first SchemaItem.
   * @param schemaItemB The second SchemaItem.
   */
  public async compareSchemaItems(schemaItemA: SchemaItem, schemaItemB: SchemaItem | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];
    if (!schemaItemB) {
      promises.push(this._reporter.reportSchemaItemMissing(schemaItemA, this._compareDirection));
      promises.push(this._reporter.reportSchemaItemDelta(schemaItemA, "description", schemaItemA.description, undefined, this._compareDirection));
      promises.push(this._reporter.reportSchemaItemDelta(schemaItemA, "label", schemaItemA.label, undefined, this._compareDirection));
      promises.push(this._reporter.reportSchemaItemDelta(schemaItemA, "schemaItemType", schemaItemTypeToString(schemaItemA.schemaItemType), undefined, this._compareDirection));
      await Promise.all(promises);
      return;
    }

    if (this._compareDirection === SchemaCompareDirection.Backward)
      return;

    if (schemaItemA.description !== schemaItemB.description)
      promises.push(this._reporter.reportSchemaItemDelta(schemaItemA, "description", schemaItemA.description, schemaItemB.description, this._compareDirection));

    if (!labelsMatch(schemaItemA.label, schemaItemB.label))
      promises.push(this._reporter.reportSchemaItemDelta(schemaItemA, "label", schemaItemA.label, schemaItemB.label, this._compareDirection));

    if (schemaItemA.schemaItemType !== schemaItemB.schemaItemType) {
      const aType = schemaItemTypeToString(schemaItemA.schemaItemType);
      const bType = schemaItemTypeToString(schemaItemB.schemaItemType);
      promises.push(this._reporter.reportSchemaItemDelta(schemaItemA, "schemaItemType", aType, bType, this._compareDirection));
    }

    await Promise.all(promises);
  }

  /**
   * Compares two ECClasses to identify differences between property values.
   * @param classA The first ECClass.
   * @param classB The second ECClass.
   */
  public async compareClasses(classA: AnyClass, classB: AnyClass | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && classB)
      return;

    const promises: Array<Promise<void>> = [];

    const modifierB = classB ? classB.modifier : undefined;
    if (classA.modifier !== modifierB) {
      const aMod = classModifierToString(classA.modifier);
      const bMod = modifierB !== undefined ? classModifierToString(modifierB) : undefined;
      promises.push(this._reporter.reportClassDelta(classA, "modifier", aMod, bMod, this._compareDirection));
    }

    const baseClassB = classB ? classB.baseClass : undefined;
    if (classA.baseClass || baseClassB) {
      const nameA = classA.baseClass ? classA.baseClass.fullName : undefined;
      const nameB = baseClassB ? baseClassB.fullName : undefined;
      if (nameA !== nameB) {
        const baseA = await classA.baseClass as AnyClass;
        const baseB = baseClassB ? await baseClassB as AnyClass : undefined;
        promises.push(this._reporter.reportBaseClassDelta(classA, baseA, baseB, this._compareDirection));
      }
    }
    await Promise.all(promises);
  }

  /**
   * Compares two ECProperties to identify differences between property values.
   * @param propertyA The first ECProperty.
   * @param propertyB The second ECProperty.
   */
  public async compareProperties(propertyA: AnyProperty, propertyB: AnyProperty | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];

    if (!propertyB) {
      promises.push(this._reporter.reportPropertyMissing(propertyA, this._compareDirection));
      if (undefined !== propertyA.label)
        promises.push(this._reporter.reportPropertyDelta(propertyA, "label", propertyA.label, undefined, this._compareDirection));
      if (undefined !== propertyA.description)
        promises.push(this._reporter.reportPropertyDelta(propertyA, "description", propertyA.description, undefined, this._compareDirection));

      promises.push(this._reporter.reportPropertyDelta(propertyA, "priority", propertyA.priority, undefined, this._compareDirection));
      promises.push(this._reporter.reportPropertyDelta(propertyA, "isReadOnly", propertyA.isReadOnly, undefined, this._compareDirection));

      const catKeyA = propertyA.category ? (await propertyA.category).key : undefined;
      const catKeyAText = catKeyA ? catKeyA.fullName : undefined;
      if (undefined !== catKeyAText)
        promises.push(this._reporter.reportPropertyDelta(propertyA, "category", catKeyAText, undefined, this._compareDirection));

      const koqKeyA = propertyA.kindOfQuantity ? (await propertyA.kindOfQuantity).key : undefined;
      const koqKeyAText = koqKeyA ? koqKeyA.fullName : undefined;
      if (undefined !== koqKeyAText)
        promises.push(this._reporter.reportPropertyDelta(propertyA, "kindOfQuantity", koqKeyAText, undefined, this._compareDirection));

      await this.comparePropertyType(propertyA, undefined);
      await Promise.all(promises);
      return;
    }

    if (this._compareDirection === SchemaCompareDirection.Backward)
      return;

    if (!labelsMatch(propertyA.label, propertyB.label))
      promises.push(this._reporter.reportPropertyDelta(propertyA, "label", propertyA.label, propertyB.label, this._compareDirection));

    if (propertyA.description !== propertyB.description)
      promises.push(this._reporter.reportPropertyDelta(propertyA, "description", propertyA.description, propertyB.description, this._compareDirection));

    if (propertyA.isReadOnly !== propertyB.isReadOnly)
      promises.push(this._reporter.reportPropertyDelta(propertyA, "isReadOnly", propertyA.isReadOnly, propertyB.isReadOnly, this._compareDirection));

    if (propertyA.priority !== propertyB.priority)
      promises.push(this._reporter.reportPropertyDelta(propertyA, "priority", propertyA.priority, propertyB.priority, this._compareDirection));

    if (propertyA.category || propertyB.category) {
      const catKeyA = propertyA.category ? (await propertyA.category).key : undefined;
      const catKeyB = propertyB.category ? (await propertyB.category).key : undefined;
      const catKeyAText = catKeyA ? catKeyA.fullName : undefined;
      const catKeyBText = catKeyB ? catKeyB.fullName : undefined;
      if (catKeyAText !== catKeyBText) {
        promises.push(this._reporter.reportPropertyDelta(propertyA, "category", catKeyAText, catKeyBText, this._compareDirection));
      }
    }

    if (propertyA.kindOfQuantity || propertyB.kindOfQuantity) {
      const koqKeyA = propertyA.kindOfQuantity ? (await propertyA.kindOfQuantity).key : undefined;
      const koqKeyB = propertyB.kindOfQuantity ? (await propertyB.kindOfQuantity).key : undefined;
      const koqKeyAText = koqKeyA ? koqKeyA.fullName : undefined;
      const koqKeyBText = koqKeyB ? koqKeyB.fullName : undefined;
      if (koqKeyAText !== koqKeyBText) {
        promises.push(this._reporter.reportPropertyDelta(propertyA, "kindOfQuantity", koqKeyAText, koqKeyBText, this._compareDirection));
      }
    }

    promises.push(this.comparePropertyType(propertyA, propertyB));
    await Promise.all(promises);
  }

  /**
   * Compares two EntityClass objects to identify differences between property values.
   * @param entityA
   * @param entityB
   */
  public async compareEntityClasses(entityA: EntityClass, entityB: EntityClass | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];
    for (const mixinA of entityA.mixins) {
      if (!entityB || -1 === entityB.mixins.findIndex((m) => m.fullName === mixinA.fullName))
        promises.push(this._reporter.reportEntityMixinMissing(entityA, await mixinA, this._compareDirection));
    }

    await Promise.all(promises);
  }

  /**
   * Compares two Mixin objects to identify differences between property values.
   * @param mixinA
   * @param mixinB
   */
  public async compareMixins(mixinA: Mixin, mixinB: Mixin | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && mixinB)
      return;

    if (mixinA.appliesTo) {
      const appliesToA = mixinA.appliesTo.fullName;
      const appliesToB = mixinB ? mixinB.appliesTo ? mixinB.appliesTo.fullName : undefined : undefined;
      if (appliesToA !== appliesToB)
        await this._reporter.reportMixinDelta(mixinA, "appliesTo", appliesToA, appliesToB, this._compareDirection);
    }
  }

  /**
   * Compares two RelationshipClass objects to identify differences between property values.
   * @param relationshipA
   * @param relationshipB
   */
  public async compareRelationshipClasses(relationshipA: RelationshipClass, relationshipB: RelationshipClass | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && relationshipB)
      return;

    const promises: Array<Promise<void>> = [];

    const strengthB = relationshipB ? relationshipB.strength : undefined;
    if (relationshipA.strength !== strengthB) {
      const strengthAString = strengthToString(relationshipA.strength);
      const strengthBString = strengthB !== undefined ? strengthToString(strengthB) : undefined;
      promises.push(this._reporter.reportRelationshipClassDelta(relationshipA, "strength", strengthAString, strengthBString, this._compareDirection));
    }

    const directionB = relationshipB ? relationshipB.strengthDirection : undefined;
    if (relationshipA.strengthDirection !== directionB) {
      const directionAString = strengthDirectionToString(relationshipA.strengthDirection);
      const directionBString = directionB !== undefined ? strengthDirectionToString(directionB) : undefined;
      promises.push(this._reporter.reportRelationshipClassDelta(relationshipA, "strengthDirection", directionAString, directionBString, this._compareDirection));
    }

    await Promise.all(promises);
  }

  /**
   * Compares two RelationshipConstraint objects to identify differences between property values.
   * @param relationshipConstraintA
   * @param relationshipConstraintB
   */
  public async compareRelationshipConstraints(constraintA: RelationshipConstraint, constraintB: RelationshipConstraint | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];

    if (constraintA.constraintClasses) {
      for (const classA of constraintA.constraintClasses) {
        if (!constraintB || !constraintB.constraintClasses || -1 === constraintB.constraintClasses.findIndex((c) => c.matchesFullName(classA.fullName)))
          promises.push(this._reporter.reportRelationshipConstraintClassMissing(constraintA, await classA, this._compareDirection));
      }
    }

    if (this._compareDirection === SchemaCompareDirection.Backward && constraintB) {
      await Promise.all(promises);
      return;
    }

    const constraintBMultiplicity = constraintB ? constraintB.multiplicity : undefined;
    if (constraintA.multiplicity || constraintBMultiplicity) {
      const multiplicityA = constraintA.multiplicity ? constraintA.multiplicity.toString() : undefined;
      const multiplicityB = constraintBMultiplicity ? constraintBMultiplicity.toString() : undefined;
      if (multiplicityA !== multiplicityB)
        promises.push(this._reporter.reportRelationshipConstraintDelta(constraintA, "multiplicity", multiplicityA, multiplicityB, this._compareDirection));
    }

    const constraintBRoleLabel = constraintB ? constraintB.roleLabel : undefined;
    if (constraintA.roleLabel !== constraintBRoleLabel)
      promises.push(this._reporter.reportRelationshipConstraintDelta(constraintA, "roleLabel", constraintA.roleLabel, constraintBRoleLabel, this._compareDirection));

    const constraintBPolymorphic = constraintB ? constraintB.polymorphic : undefined;
    if (constraintA.polymorphic !== constraintBPolymorphic)
      promises.push(this._reporter.reportRelationshipConstraintDelta(constraintA, "polymorphic", constraintA.polymorphic, constraintBPolymorphic, this._compareDirection));

    const constraintBAbstractConstraint = constraintB ? constraintB.abstractConstraint : undefined;
    if (constraintA.abstractConstraint || constraintBAbstractConstraint) {
      const abstractA = constraintA.abstractConstraint ? constraintA.abstractConstraint.fullName : undefined;
      const abstractB = constraintBAbstractConstraint ? constraintBAbstractConstraint.fullName : undefined;
      if (abstractA !== abstractB) {
        promises.push(this._reporter.reportRelationshipConstraintDelta(constraintA, "abstractConstraint", abstractA, abstractB, this._compareDirection));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Compares two CustomAttributeClass objects to identify differences between property values.
   * @param customAttributeClassA
   * @param customAttributeClassB
   */
  public async compareCustomAttributeClasses(customAttributeClassA: CustomAttributeClass, customAttributeClassB: CustomAttributeClass | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && customAttributeClassB)
      return;

    const containerTypeB = customAttributeClassB ? customAttributeClassB.containerType : undefined;
    if (customAttributeClassA.containerType !== containerTypeB) {
      const typeA = containerTypeToString(customAttributeClassA.containerType);
      const typeB = containerTypeB !== undefined ? containerTypeToString(containerTypeB) : undefined;
      await this._reporter.reportCustomAttributeClassDelta(customAttributeClassA, "appliesTo", typeA, typeB, this._compareDirection);
    }
  }

  /**
   * Compares two CustomAttributeContainerProps objects to identify differences between property values.
   * @param containerA
   * @param containerB
   */
  public async compareCustomAttributeContainers(containerA: CustomAttributeContainerProps, containerB: CustomAttributeContainerProps | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];

    if (containerA.customAttributes) {
      for (const ca of containerA.customAttributes) {
        if (!containerB || !containerB.customAttributes || !containerB.customAttributes.has(ca[0]))
          promises.push(this._reporter.reportCustomAttributeInstanceClassMissing(containerA, ca[1], this._compareDirection));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Compares two Enumeration objects to identify differences between property values.
   * @param enumA
   * @param enumB
   */
  public async compareEnumerations(enumA: Enumeration, enumB: Enumeration | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];

    for (const enumeratorA of enumA.enumerators) {
      const enumeratorB = enumB ? enumB.enumerators.find((e) => e.name === enumeratorA.name) : undefined;
      if (!enumeratorB) {
        promises.push(this._reporter.reportEnumeratorMissing(enumA, enumeratorA, this._compareDirection));
        promises.push(this.compareEnumerators(enumeratorA, enumeratorB, enumA, enumB));
      } else if (this._compareDirection === SchemaCompareDirection.Forward) {
        promises.push(this.compareEnumerators(enumeratorA, enumeratorB, enumA, enumB));
      }
    }

    if (this._compareDirection === SchemaCompareDirection.Backward && enumB) {
      await Promise.all(promises);
      return;
    }

    const typeB = enumB ? enumB.type : undefined;
    if (enumA.type !== typeB) {
      const typeAString = enumA.type ? primitiveTypeToString(enumA.type) : undefined;
      const typeBString = typeB !== undefined ? primitiveTypeToString(typeB) : undefined;
      promises.push(this._reporter.reportEnumerationDelta(enumA, "type", typeAString, typeBString, this._compareDirection));
    }

    const isStrictB = enumB ? enumB.isStrict : undefined;
    if (enumA.isStrict !== isStrictB)
      promises.push(this._reporter.reportEnumerationDelta(enumA, "isStrict", enumA.isStrict, isStrictB, this._compareDirection));

    await Promise.all(promises);
  }

  /**
   * Compares two KindOfQuantity objects to identify differences between property values.
   * @param koqA
   * @param koqB
   */
  public async compareKindOfQuantities(koqA: KindOfQuantity, koqB: KindOfQuantity | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];

    if (koqA.presentationFormats) {
      for (const unit of koqA.presentationFormats) {
        if (!koqB || !koqB.presentationFormats || -1 === koqB.presentationFormats.findIndex((u) => u.fullName === unit.fullName))
          promises.push(this._reporter.reportPresentationUnitMissing(koqA, unit, this._compareDirection));
      }
    }

    if (this._compareDirection === SchemaCompareDirection.Backward && koqB) {
      await Promise.all(promises);
      return;
    }

    const errorB = koqB ? koqB.relativeError : undefined;
    if (koqA.relativeError !== errorB) {
      promises.push(this._reporter.reportKoqDelta(koqA, "relativeError", koqA.relativeError, errorB, this._compareDirection));
    }

    const unitB = koqB ? koqB.persistenceUnit : undefined;
    if (koqA.persistenceUnit || unitB) {
      const unitNameA = koqA.persistenceUnit ? koqA.persistenceUnit.fullName : undefined;
      const unitNameB = unitB ? unitB.fullName : undefined;
      if (unitNameA !== unitNameB) {
        promises.push(this._reporter.reportKoqDelta(koqA, "persistenceUnit", await koqA.persistenceUnit, await unitB, this._compareDirection));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Compares two PropertyCategory objects to identify differences between property values.
   * @param categoryA
   * @param categoryB
   */
  public async comparePropertyCategories(categoryA: PropertyCategory, categoryB: PropertyCategory | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && categoryB)
      return;

    const priorityB = categoryB ? categoryB.priority : undefined;
    if (categoryA.priority !== priorityB)
      await this._reporter.reportPropertyCategoryDelta(categoryA, "priority", categoryA.priority, priorityB, this._compareDirection);
  }

  /**
   * Compares two Format objects to identify differences between property values.
   * @param formatA
   * @param formatB
   */
  public async compareFormats(formatA: Format, formatB: Format | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];

    promises.push(this.compareFormatUnits(formatA, formatB));

    if (this._compareDirection === SchemaCompareDirection.Backward && formatB) {
      await Promise.all(promises);
      return;
    }

    const roundFactorB = formatB ? formatB.roundFactor : undefined;
    if (formatA.roundFactor !== roundFactorB)
      promises.push(this._reporter.reportFormatDelta(formatA, "roundFactor", formatA.roundFactor, roundFactorB, this._compareDirection));

    const typeB = formatB ? formatB.type : undefined;
    if (formatA.type !== typeB) {
      const typeAString = formatTypeToString(formatA.type);
      const typeBString = typeB !== undefined ? formatTypeToString(typeB) : undefined;
      promises.push(this._reporter.reportFormatDelta(formatA, "type", typeAString, typeBString, this._compareDirection));
    }

    const precisionB = formatB ? formatB.precision : undefined;
    if (formatA.precision !== precisionB)
      promises.push(this._reporter.reportFormatDelta(formatA, "precision", formatA.precision, precisionB, this._compareDirection));

    const minWidthB = formatB ? formatB.minWidth : undefined;
    if (formatA.minWidth !== minWidthB)
      promises.push(this._reporter.reportFormatDelta(formatA, "minWidth", formatA.minWidth, minWidthB, this._compareDirection));

    const scientificTypeB = formatB ? formatB.scientificType : undefined;
    if (formatA.scientificType !== scientificTypeB) {
      const typeAString = formatA.scientificType !== undefined ? scientificTypeToString(formatA.scientificType) : undefined;
      const typeBString = scientificTypeB !== undefined ? scientificTypeToString(scientificTypeB) : undefined;
      promises.push(this._reporter.reportFormatDelta(formatA, "scientificType", typeAString, typeBString, this._compareDirection));
    }

    const showSignOptionB = formatB ? formatB.showSignOption : undefined;
    if (formatA.showSignOption !== showSignOptionB) {
      const optionA = showSignOptionToString(formatA.showSignOption);
      const optionB = showSignOptionB !== undefined ? showSignOptionToString(showSignOptionB) : undefined;
      promises.push(this._reporter.reportFormatDelta(formatA, "showSignOption", optionA, optionB, this._compareDirection));
    }

    const decimalSeparatorB = formatB ? formatB.decimalSeparator : undefined;
    if (formatA.decimalSeparator !== decimalSeparatorB)
      promises.push(this._reporter.reportFormatDelta(formatA, "decimalSeparator", formatA.decimalSeparator, decimalSeparatorB, this._compareDirection));

    const thousandSeparatorB = formatB ? formatB.thousandSeparator : undefined;
    if (formatA.thousandSeparator !== thousandSeparatorB)
      promises.push(this._reporter.reportFormatDelta(formatA, "thousandSeparator", formatA.thousandSeparator, thousandSeparatorB, this._compareDirection));

    const uomSeparatorB = formatB ? formatB.uomSeparator : undefined;
    if (formatA.uomSeparator !== uomSeparatorB)
      promises.push(this._reporter.reportFormatDelta(formatA, "uomSeparator", formatA.uomSeparator, uomSeparatorB, this._compareDirection));

    const stationSeparatorB = formatB ? formatB.stationSeparator : undefined;
    if (formatA.stationSeparator !== stationSeparatorB)
      promises.push(this._reporter.reportFormatDelta(formatA, "stationSeparator", formatA.stationSeparator, stationSeparatorB, this._compareDirection));

    const stationOffsetSizeB = formatB ? formatB.stationOffsetSize : undefined;
    if (formatA.stationOffsetSize !== stationOffsetSizeB)
      promises.push(this._reporter.reportFormatDelta(formatA, "stationOffsetSize", formatA.stationOffsetSize, stationOffsetSizeB, this._compareDirection));

    const formatTraitsB = formatB ? formatB.formatTraits : undefined;
    if (formatA.formatTraits !== formatTraitsB) {
      const traitsA = formatTraitsToArray(formatA.formatTraits);
      const traitsB = formatTraitsB !== undefined ? formatTraitsToArray(formatTraitsB) : undefined;
      promises.push(this._reporter.reportFormatDelta(formatA, "formatTraits", traitsA.toString(), traitsB ? traitsB.toString() : undefined, this._compareDirection));
    }

    const spacerB = formatB ? formatB.spacer : undefined;
    if (formatA.spacer !== spacerB)
      promises.push(this._reporter.reportFormatDelta(formatA, "spacer", formatA.spacer, spacerB, this._compareDirection));

    const includeZeroB = formatB ? formatB.includeZero : undefined;
    if (formatA.includeZero !== includeZeroB)
      promises.push(this._reporter.reportFormatDelta(formatA, "includeZero", formatA.includeZero, includeZeroB, this._compareDirection));

    await Promise.all(promises);
  }

  /**
   * Compares two Unit objects to identify differences between property values.
   * @param unitA
   * @param unitB
   */
  public async compareUnits(unitA: Unit, unitB: Unit | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && unitB)
      return;

    const promises: Array<Promise<void>> = [];

    const phenomenonB = unitB ? unitB.phenomenon : undefined;
    if (unitA.phenomenon || phenomenonB) {
      const fullNameA = unitA.phenomenon ? unitA.phenomenon.fullName : undefined;
      const fullNameB = phenomenonB ? phenomenonB.fullName : undefined;
      if (fullNameA !== fullNameB)
        promises.push(this._reporter.reportUnitDelta(unitA, "phenomenon", fullNameA, fullNameB, this._compareDirection));
    }

    const unitSystemB = unitB ? unitB.unitSystem : undefined;
    if (unitA.unitSystem || unitSystemB) {
      const fullNameA = unitA.unitSystem ? unitA.unitSystem.fullName : undefined;
      const fullNameB = unitSystemB ? unitSystemB.fullName : undefined;
      if (fullNameA !== fullNameB)
        promises.push(this._reporter.reportUnitDelta(unitA, "unitSystem", fullNameA, fullNameB, this._compareDirection));
    }

    const definitionB = unitB ? unitB.definition : undefined;
    if (unitA.definition !== definitionB)
      promises.push(this._reporter.reportUnitDelta(unitA, "definition", unitA.definition, definitionB, this._compareDirection));

    const numeratorB = unitB ? unitB.numerator : undefined;
    if (unitA.numerator !== numeratorB)
      promises.push(this._reporter.reportUnitDelta(unitA, "numerator", unitA.numerator, numeratorB, this._compareDirection));

    const denominatorB = unitB ? unitB.denominator : undefined;
    if (unitA.denominator !== denominatorB)
      promises.push(this._reporter.reportUnitDelta(unitA, "denominator", unitA.denominator, denominatorB, this._compareDirection));

    const offsetB = unitB ? unitB.offset : undefined;
    if (unitA.offset !== offsetB)
      promises.push(this._reporter.reportUnitDelta(unitA, "offset", unitA.offset, offsetB, this._compareDirection));

    await Promise.all(promises);
  }

  /**
   * Compares two InvertedUnit objects to identify differences between property values.
   * @param invertedUnitA
   * @param invertedUnitB
   */
  public async compareInvertedUnits(invertedUnitA: InvertedUnit, invertedUnitB: InvertedUnit | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && invertedUnitB)
      return;

    const promises: Array<Promise<void>> = [];

    const invertsUnitB = invertedUnitB ? invertedUnitB.invertsUnit : undefined;
    if (invertedUnitA.invertsUnit || invertsUnitB) {
      const fullNameA = invertedUnitA.invertsUnit ? invertedUnitA.invertsUnit.fullName : undefined;
      const fullNameB = invertsUnitB ? invertsUnitB.fullName : undefined;
      if (fullNameA !== fullNameB)
        promises.push(this._reporter.reportInvertedUnitDelta(invertedUnitA, "invertsUnit", fullNameA, fullNameB, this._compareDirection));
    }

    const unitSystemB = invertedUnitB ? invertedUnitB.unitSystem : undefined;
    if (invertedUnitA.unitSystem || unitSystemB) {
      const fullNameA = invertedUnitA.unitSystem ? invertedUnitA.unitSystem.fullName : undefined;
      const fullNameB = unitSystemB ? unitSystemB.fullName : undefined;
      if (fullNameA !== fullNameB)
        promises.push(this._reporter.reportInvertedUnitDelta(invertedUnitA, "unitSystem", fullNameA, fullNameB, this._compareDirection));
    }

    await Promise.all(promises);
  }

  /**
   * Compares two Phenomenon objects to identify differences between property values.
   * @param phenomenonA
   * @param phenomenonB
   */
  public async comparePhenomenons(phenomenonA: Phenomenon, phenomenonB: Phenomenon | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && phenomenonB)
      return;

    const definitionB = phenomenonB ? phenomenonB.definition : undefined;
    if (phenomenonA.definition !== definitionB)
      await this._reporter.reportPhenomenonDelta(phenomenonA, "definition", phenomenonA.definition, definitionB, this._compareDirection);
  }

  /**
   * Compares two Constant objects to identify differences between property values.
   * @param constantA
   * @param constantB
   */
  public async compareConstants(constantA: Constant, constantB: Constant | undefined): Promise<void> {
    if (this._compareDirection === SchemaCompareDirection.Backward && constantB)
      return;

    const promises: Array<Promise<void>> = [];

    const phenomenonB = constantB ? constantB.phenomenon : undefined;
    if (constantA.phenomenon || phenomenonB) {
      const fullNameA = constantA.phenomenon ? constantA.phenomenon.fullName : undefined;
      const fullNameB = phenomenonB ? phenomenonB.fullName : undefined;
      if (fullNameA !== fullNameB)
        promises.push(this._reporter.reportConstantDelta(constantA, "phenomenon", fullNameA, fullNameB, this._compareDirection));
    }

    const definitionB = constantB ? constantB.definition : undefined;
    if (constantA.definition !== definitionB)
      promises.push(this._reporter.reportConstantDelta(constantA, "definition", constantA.definition, definitionB, this._compareDirection));

    const numeratorB = constantB ? constantB.numerator : undefined;
    if (constantA.numerator !== numeratorB)
      promises.push(this._reporter.reportConstantDelta(constantA, "numerator", constantA.numerator, numeratorB, this._compareDirection));

    const denominatorB = constantB ? constantB.denominator : undefined;
    if (constantA.denominator !== denominatorB)
      promises.push(this._reporter.reportConstantDelta(constantA, "denominator", constantA.denominator, denominatorB, this._compareDirection));

    await Promise.all(promises);
  }

  private async comparePropertyType(propertyA: AnyProperty, propertyB?: AnyProperty): Promise<void> {
    const promises: Array<Promise<void>> = [];

    const propertyTypeA = propertyTypeToString(propertyA.propertyType);
    const propertyTypeB = propertyB !== undefined ? propertyTypeToString(propertyB.propertyType) : undefined;
    if (propertyTypeA !== propertyTypeB) {
      promises.push(this._reporter.reportPropertyDelta(propertyA, "type", propertyTypeA, propertyTypeB, this._compareDirection));
    }

    if (propertyA.isArray()) {
      const minOccursB = propertyB && propertyB.isArray() ? propertyB.minOccurs : undefined;
      if (propertyA.minOccurs !== minOccursB) {
        promises.push(this._reporter.reportPropertyDelta(propertyA, "minOccurs", propertyA.minOccurs, minOccursB, this._compareDirection));
      }

      const maxOccursB = propertyB && propertyB.isArray() ? propertyB.maxOccurs : undefined;
      if (propertyA.maxOccurs !== maxOccursB) {
        promises.push(this._reporter.reportPropertyDelta(propertyA, "maxOccurs", propertyA.maxOccurs, maxOccursB, this._compareDirection));
      }
    }

    if (propertyA.isEnumeration()) {
      const enumerationB = propertyB && propertyB.isEnumeration() ? propertyB.enumeration : undefined;
      if (propertyA.enumeration || enumerationB) {
        const enumA = propertyA.enumeration ? propertyA.enumeration.fullName : undefined;
        const enumB = enumerationB ? enumerationB.fullName : undefined;
        if (enumA !== enumB)
          promises.push(this._reporter.reportPropertyDelta(propertyA, "enumeration", enumA, enumB, this._compareDirection));
      }
    }

    if (propertyA.isNavigation()) {
      const strengthDirectionB = propertyB && propertyB.isNavigation() ? propertyB.direction : undefined;
      if (propertyA.direction !== strengthDirectionB) {
        const dirA = strengthDirectionToString(propertyA.direction);
        const dirB = strengthDirectionB !== undefined ? strengthDirectionToString(strengthDirectionB) : undefined;
        promises.push(this._reporter.reportPropertyDelta(propertyA, "direction", dirA, dirB, this._compareDirection));
      }

      if (propertyA.relationshipClass) { // eslint-disable-line @typescript-eslint/no-misused-promises
        const relationshipClassB = propertyB && propertyB.isNavigation() ? propertyB.relationshipClass : undefined;
        const relA = propertyA.relationshipClass.fullName;
        const relB = relationshipClassB ? relationshipClassB.fullName : undefined;
        if (relA !== relB)
          promises.push(this._reporter.reportPropertyDelta(propertyA, "relationshipClass", relA, relB, this._compareDirection));
      }
    }

    if (propertyA.isPrimitive()) {
      const primitiveTypeB = propertyB && propertyB.isPrimitive() ? propertyB.primitiveType : undefined;
      if (propertyA.primitiveType !== primitiveTypeB) {
        const aType = primitiveTypeToString(propertyA.primitiveType);
        const bType = primitiveTypeB !== undefined ? primitiveTypeToString(primitiveTypeB) : undefined;
        promises.push(this._reporter.reportPropertyDelta(propertyA, "primitiveType", aType, bType, this._compareDirection));
      }
    }

    if (propertyA.isStruct()) {
      const structA = (propertyA as StructProperty).structClass;
      const structB = propertyB && propertyB.isStruct() ? (propertyB as StructProperty).structClass : undefined;
      if (structA || structB) {
        const structNameA = structA ? structA.fullName : undefined;
        const structNameB = structB ? structB.fullName : undefined;
        if (structNameA !== structNameB)
          promises.push(this._reporter.reportPropertyDelta(propertyA, "structClass", structNameA, structNameB, this._compareDirection));
      }
    }

    await Promise.all(promises);
  }

  private async compareEnumerators(enumeratorA: AnyEnumerator, enumeratorB: AnyEnumerator | undefined, enumA: Enumeration, enumB: Enumeration | undefined): Promise<void> {
    const promises: Array<Promise<void>> = [];

    if (!enumB || !enumeratorB) {
      promises.push(this._reporter.reportEnumeratorDelta(enumA, enumeratorA, "description", enumeratorA.description, undefined, this._compareDirection));
      promises.push(this._reporter.reportEnumeratorDelta(enumA, enumeratorA, "label", enumeratorA.label, undefined, this._compareDirection));
      promises.push(this._reporter.reportEnumeratorDelta(enumA, enumeratorA, "value", enumeratorA.value, undefined, this._compareDirection));
      await Promise.all(promises);
      return;
    }
    if (enumeratorA.description !== enumeratorB.description)
      promises.push(this._reporter.reportEnumeratorDelta(enumA, enumeratorA, "description", enumeratorA.description, enumeratorB.description, this._compareDirection));

    if (!labelsMatch(enumeratorA.label, enumeratorB.label))
      promises.push(this._reporter.reportEnumeratorDelta(enumA, enumeratorA, "label", enumeratorA.label, enumeratorB.label, this._compareDirection));

    // No need to compare values if the type is different (which will be reported separately)
    if (enumA.type === enumB.type && enumeratorA.value !== enumeratorB.value)
      promises.push(this._reporter.reportEnumeratorDelta(enumA, enumeratorA, "value", enumeratorA.value, enumeratorB.value, this._compareDirection));

    await Promise.all(promises);
  }

  private async compareFormatUnits(formatA: Format, formatB: Format | undefined): Promise<void> {
    if (!formatA.units)
      return;

    const promises: Array<Promise<void>> = [];

    for (const unitA of formatA.units) {
      const unitB = formatB && formatB.units ? formatB.units.find((u) => u[0].fullName === unitA[0].fullName) : undefined;
      if (!unitB) {
        promises.push(this._reporter.reportFormatUnitMissing(formatA, unitA[0], this._compareDirection));
        continue;
      }

      if (this._compareDirection === SchemaCompareDirection.Backward && formatB)
        continue;

      if (unitA[1] !== unitB[1]) {
        const labelA = unitA[1];
        const labelB = unitB[1];
        promises.push(this._reporter.reportUnitLabelOverrideDelta(formatA, unitB[0], labelA, labelB, this._compareDirection));
      }
    }

    await Promise.all(promises);
  }
}
