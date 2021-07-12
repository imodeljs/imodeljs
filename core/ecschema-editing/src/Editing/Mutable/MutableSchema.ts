/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  Constant, CustomAttribute, CustomAttributeClass, ECClassModifier, EntityClass, Enumeration,
  Format, InvertedUnit, KindOfQuantity, Mixin, Phenomenon, PrimitiveType, PropertyCategory,
  RelationshipClass, Schema, SchemaContext, SchemaItem, StructClass, Unit, UnitSystem,
} from "@bentley/ecschema-metadata";

/**
 * Hackish approach that works like a "friend class" so we can access protected members without making them public.
 * We cannot put this into Helper.ts and make it non-export, because we are importing Helper.ts from this file, and the circular import
 * would prevent this class from extending Schema.
 * @internal
 */
export abstract class MutableSchema extends Schema {
  public abstract override addCustomAttribute(customAttribute: CustomAttribute): void;
  public abstract override createEntityClass(name: string, modifier?: ECClassModifier): Promise<EntityClass>;
  public abstract override createEntityClassSync(name: string, modifier?: ECClassModifier): EntityClass;
  public abstract override createMixinClass(name: string): Promise<Mixin>;
  public abstract override createMixinClassSync(name: string): Mixin;
  public abstract override createStructClass(name: string, modifier?: ECClassModifier): Promise<StructClass>;
  public abstract override createStructClassSync(name: string, modifier?: ECClassModifier): StructClass;
  public abstract override createCustomAttributeClass(name: string, modifier?: ECClassModifier): Promise<CustomAttributeClass>;
  public abstract override createCustomAttributeClassSync(name: string, modifier?: ECClassModifier): CustomAttributeClass;
  public abstract override createRelationshipClass(name: string, modifier?: ECClassModifier): Promise<RelationshipClass>;
  public abstract override createRelationshipClassSync(name: string, modifier?: ECClassModifier): RelationshipClass;
  public abstract override createEnumeration(name: string, primitiveType?: PrimitiveType.Integer | PrimitiveType.String): Promise<Enumeration>;
  public abstract override createEnumerationSync(name: string, primitiveType?: PrimitiveType.Integer | PrimitiveType.String): Enumeration;
  public abstract override createKindOfQuantity(name: string): Promise<KindOfQuantity>;
  public abstract override createKindOfQuantitySync(name: string): KindOfQuantity;
  public abstract override createUnit(name: string): Promise<Unit>;
  public abstract override createUnitSync(name: string): Unit;
  public abstract override createConstant(name: string): Promise<Constant>;
  public abstract override createConstantSync(name: string): Constant;
  public abstract override createInvertedUnit(name: string): Promise<InvertedUnit>;
  public abstract override createInvertedUnitSync(name: string): InvertedUnit;
  public abstract override createPhenomenon(name: string): Promise<Phenomenon>;
  public abstract override createPhenomenonSync(name: string): Phenomenon;
  public abstract override createFormat(name: string): Promise<Format>;
  public abstract override createFormatSync(name: string): Format;
  public abstract override createUnitSystem(name: string): Promise<UnitSystem>;
  public abstract override createUnitSystemSync(name: string): UnitSystem;
  public abstract override createPropertyCategory(name: string): Promise<PropertyCategory>;
  public abstract override createPropertyCategorySync(name: string): PropertyCategory;
  public abstract override addItem<T extends SchemaItem>(item: T): void;
  public abstract override addReference(refSchema: Schema): Promise<void>;
  public abstract override addReferenceSync(refSchema: Schema): void;
  public abstract override setContext(schemaContext: SchemaContext): void;
  public abstract override setVersion(readVersion?: number, writeVersion?: number, minorVersion?: number): void;
}
