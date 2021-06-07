/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

export * from "./Constants";
export * from "./Context";
export * from "./DelayedPromise";
export * from "./Deserialization/SchemaGraphUtil";
export * from "./Deserialization/JsonProps";
export * from "./Deserialization/Helper";
export * from "./Deserialization/XmlParser";
export * from "./ECName";
export * from "./ECObjects";
export * from "./Editor/Editor";
export * from "./Exception";
export * from "./Interfaces";
export { ECClass, StructClass } from "./Metadata/Class";
export { Constant } from "./Metadata/Constant";
export { CustomAttributeClass } from "./Metadata/CustomAttributeClass";
export { EntityClass } from "./Metadata/EntityClass";
export { AnyEnumerator, Enumeration, Enumerator } from "./Metadata/Enumeration";
export { Format } from "./Metadata/Format";
export { InvertedUnit } from "./Metadata/InvertedUnit";
export { KindOfQuantity } from "./Metadata/KindOfQuantity";
export { Mixin } from "./Metadata/Mixin";
export * from "./Metadata/OverrideFormat";
export { Phenomenon } from "./Metadata/Phenomenon";
export {
  Property, PrimitiveProperty, PrimitiveArrayProperty, EnumerationProperty, StructProperty,
  StructArrayProperty, EnumerationArrayProperty, NavigationProperty, AnyArrayProperty, AnyEnumerationProperty,
  AnyPrimitiveProperty, AnyProperty, AnyStructProperty, ArrayProperty, PrimitiveOrEnumPropertyBase,
} from "./Metadata/Property";
export { PropertyCategory } from "./Metadata/PropertyCategory";
export { RelationshipClass, RelationshipConstraint, RelationshipMultiplicity } from "./Metadata/RelationshipClass";
export { Schema } from "./Metadata/Schema";
export * from "./Metadata/SchemaItem";
export { Unit } from "./Metadata/Unit";
export { UnitSystem } from "./Metadata/UnitSystem";
export * from "./PropertyTypes";
export * from "./SchemaKey";
export * from "./utils/FormatEnums";
export * from "./Validation/Diagnostic";
export * from "./Validation/DiagnosticReporter";
export { DiagnosticCodes, Diagnostics, ECRuleSet } from "./Validation/ECRules";
export * from "./Validation/LoggingDiagnosticReporter";
export * from "./Validation/Rules";
export * from "./Validation/SchemaValidationVisitor";
export * from "./Validation/SchemaWalker";
export * from "./SchemaPartVisitorDelegate";
export * from "./Validation/SchemaCompareDiagnostics";
export * from "./Validation/SchemaComparer";
export * from "./Validation/SchemaChanges";
export * from "./Validation/SchemaCompareReporter";
export { ISuppressionRule, IRuleSuppressionSet, IRuleSuppressionMap } from "./Validation/RuleSuppressionSet";
export { SchemaValidater } from "./Validation/SchemaValidater";

/** @docs-package-description
 * The ecschema-metadata package contains classes for working with, validating, and editing ECSchemas that can be used in both [frontend]($docs/learning/frontend/index.md) and [backend]($docs/learning/backend/index.md).
 */
/**
 * @docs-group-description Metadata
 * Definitions of classes and interfaces that represent all [EC elements]($docs/bis/ec/index.md).
 */
/**
 * @docs-group-description Validation
 * Set of classes used to perform validation on ECSchemas.
 */
/**
 * @docs-group-description Comparison
 * Set of classes to enable comparison of ECSchemas.
 */
/**
 * @docs-group-description Utils
 * A set of utility classes used throughout the package.
 */
