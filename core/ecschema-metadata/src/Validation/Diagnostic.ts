/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Diagnostic
 */

import { AnyClass, AnyECType } from "../Interfaces";
import { CustomAttributeContainerProps } from "../Metadata/CustomAttribute";
import { AnyProperty } from "../Metadata/Property";
import { RelationshipConstraint } from "../Metadata/RelationshipClass";
import { Schema } from "../Metadata/Schema";
import { SchemaItem } from "../Metadata/SchemaItem";

/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable deprecation/deprecation */

const formatString = (format: string, ...args: string[]) => {
  return format.replace(/{(\d+)}/g, (match, theNumber) => {
    return typeof args[theNumber] !== "undefined"
      ? args[theNumber]
      : match;
  });
};

/**
 * Defines the possible diagnostic types.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export enum DiagnosticType {
  None,
  Schema, // eslint-disable-line @typescript-eslint/no-shadow
  SchemaItem, // eslint-disable-line @typescript-eslint/no-shadow
  Property,
  CustomAttributeContainer,
  RelationshipConstraint, // eslint-disable-line @typescript-eslint/no-shadow
}

/**
 * Defines the possible diagnostic categories.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export enum DiagnosticCategory {
  Warning,
  Error,
  Suggestion,
  Message,
}

/**
 * The interface implemented by all diagnostics used during schema validation.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export interface IDiagnostic<TYPE extends AnyECType, ARGS extends any[]> {
  /** The diagnostic category (error, warning, etc...). Value is static across all instances. */
  category: DiagnosticCategory;
  /** The unique string identifier of the diagnostic in the format '<ruleSetName>:<number>. Value is static across all instances. */
  code: string;
  /** The context type of diagnostic (schema, schema item, property, etc...). Value is static across all instances. */
  diagnosticType: DiagnosticType;
  /** The unformatted message text associated with the diagnostic. Value is static across all instances. */
  messageText: string;
  /** The arguments used when formatted the diagnostic instance's message. */
  messageArgs?: ARGS;
  /** The EC object associated with the diagnostic instance. */
  ecDefinition: TYPE;
  /** The schema where the diagnostic originated. */
  schema: Schema;
}

/**
 * Type which encapsulates all possible diagnostics.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export type AnyDiagnostic = IDiagnostic<AnyECType, any[]>;

/**
 * The abstract base class for all [[IDiagnostic]] implementations.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export abstract class BaseDiagnostic<TYPE extends AnyECType, ARGS extends any[]> implements IDiagnostic<TYPE, ARGS> {
  /**
   * Initializes a new BaseDiagnostic.
   * @param ecDefinition The EC object to associate with the diagnostic.
   * @param messageArgs The arguments used when formatting the diagnostic message.
   * @param category The [[DiagnosticCategory]] to associate with the diagnostic, Error by default.
   */
  constructor(ecDefinition: TYPE, messageArgs?: ARGS, category: DiagnosticCategory = DiagnosticCategory.Error) {
    this.ecDefinition = ecDefinition;
    this.messageArgs = messageArgs;
    this.category = category;
  }

  /** Gets the unique string identifier for the diagnostic in the format '<ruleSetName>:<number>'. */
  public abstract get code(): string;
  /** Gets the context type of the diagnostic (schema, schema item, property, etc...) */
  public abstract get diagnosticType(): DiagnosticType;
  /** Gets the message associated with the diagnostic. */
  public abstract get messageText(): string;
  /** Gets the schema where the diagnostic originated. */
  public abstract get schema(): Schema;

  /** The EC object to associate with the diagnostic. */
  public ecDefinition: TYPE;
  /** The arguments used when formatting the diagnostic message.  */
  public messageArgs?: ARGS;
  /** The diagnostic category is of the type DiagnosticCategory; which is defined as an enumeration above.  */
  public category: DiagnosticCategory;
}

/**
 * An [[IDiagnostic]] implementation used for [[Schema]] diagnostics.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export abstract class SchemaDiagnostic<ARGS extends any[]> extends BaseDiagnostic<Schema, ARGS> {
  public static diagnosticType = DiagnosticType.SchemaItem;

  /**
   * Initializes a new SchemaDiagnostic.
   * @param ecDefinition The EC object to associate with the diagnostic.
   * @param messageArgs The arguments used when formatting the diagnostic message.
   * @param category The [[DiagnosticCategory]] to associate with the diagnostic, Error by default.
   */
  constructor(schema: Schema, messageArgs: ARGS, category: DiagnosticCategory = DiagnosticCategory.Error) {
    super(schema, messageArgs, category);
  }

  /** Gets the schema where the diagnostic originated. */
  public get schema(): Schema { return this.ecDefinition; }

  /** Gets the DiagnosticType. */
  public get diagnosticType(): DiagnosticType { return DiagnosticType.Schema; }
}

/**
 * An [[IDiagnostic]] implementation used for [[SchemaItem]] diagnostics.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export abstract class SchemaItemDiagnostic<TYPE extends SchemaItem, ARGS extends any[]> extends BaseDiagnostic<TYPE, ARGS> {
  public static diagnosticType = DiagnosticType.SchemaItem;
  /**
   * Initializes a new SchemaItemDiagnostic.
   * @param ecDefinition The EC object to associate with the diagnostic.
   * @param messageArgs The arguments used when formatting the diagnostic message.
   * @param category The [[DiagnosticCategory]] to associate with the diagnostic, Error by default.
   */
  constructor(ecDefinition: SchemaItem, messageArgs: ARGS, category: DiagnosticCategory = DiagnosticCategory.Error) {
    super(ecDefinition as TYPE, messageArgs, category);
  }

  /** Gets the schema where the diagnostic originated. */
  public get schema(): Schema { return this.ecDefinition.schema; }

  /** Gets the DiagnosticType. */
  public get diagnosticType(): DiagnosticType { return DiagnosticType.SchemaItem; }
}

/**
 * An [[IDiagnostic]] implementation used for [[ECClass]] diagnostics.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export abstract class ClassDiagnostic<ARGS extends any[]> extends SchemaItemDiagnostic<AnyClass, ARGS> {
  /**
   * Initializes a new ClassDiagnostic.
   * @param ecClass The class to associate with the diagnostic.
   * @param messageArgs The arguments used when formatting the diagnostic message.
   * @param category The [[DiagnosticCategory]] to associate with the diagnostic, Error by default.
   */
  constructor(ecClass: AnyClass, messageArgs: ARGS, category: DiagnosticCategory = DiagnosticCategory.Error) {
    super(ecClass, messageArgs, category);
  }

  /** Gets the schema where the diagnostic originated. */
  public override get schema(): Schema { return this.ecDefinition.schema; }
}

/**
 * An [[IDiagnostic]] implementation used for [[Property]] diagnostics.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export abstract class PropertyDiagnostic<ARGS extends any[]> extends BaseDiagnostic<AnyProperty, ARGS> {
  /**
   * Initializes a new PropertyDiagnostic.
   * @param property The property to associate with the diagnostic.
   * @param messageArgs The arguments used when formatting the diagnostic message.
   * @param category The [[DiagnosticCategory]] to associate with the diagnostic, Error by default.
   */
  constructor(property: AnyProperty, messageArgs?: ARGS, category: DiagnosticCategory = DiagnosticCategory.Error) {
    super(property, messageArgs, category);
  }

  /** Gets the schema where the diagnostic originated. */
  public get schema(): Schema { return this.ecDefinition.schema; }

  /** Gets the DiagnosticType. */
  public get diagnosticType(): DiagnosticType { return DiagnosticType.Property; }
}

/**
 * An [[IDiagnostic]] implementation used for [[RelationshipConstraint]] diagnostics.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export abstract class RelationshipConstraintDiagnostic<ARGS extends any[]> extends BaseDiagnostic<RelationshipConstraint, ARGS> {
  /**
   * Initializes a new RelationshipConstraintDiagnostic.
   * @param constraint The Relationship Constraint to associate with the diagnostic.
   * @param messageArgs The arguments used when formatting the diagnostic message.
   * @param category The [[DiagnosticCategory]] to associate with the diagnostic, Error by default.
   */
  constructor(constraint: RelationshipConstraint, messageArgs: ARGS, category: DiagnosticCategory = DiagnosticCategory.Error) {
    super(constraint, messageArgs, category);
  }

  /** Gets the schema where the diagnostic originated. */
  public get schema(): Schema { return this.ecDefinition.schema; }

  /** Gets the DiagnosticType. */
  public get diagnosticType(): DiagnosticType { return DiagnosticType.RelationshipConstraint; }
}

/**
 * An [[IDiagnostic]] implementation used for [[CustomAttributeContainerProps]] diagnostics.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export abstract class CustomAttributeContainerDiagnostic<ARGS extends any[]> extends BaseDiagnostic<CustomAttributeContainerProps, ARGS> {
  /**
   * Initializes a new CustomAttributeContainerDiagnostic.
   * @param constraint The Custom Attribute Container to associate with the diagnostic.
   * @param messageArgs The arguments used when formatting the diagnostic message.
   * @param category The [[DiagnosticCategory]] to associate with the diagnostic, Error by default.
   */
  constructor(container: CustomAttributeContainerProps, messageArgs: ARGS, category: DiagnosticCategory = DiagnosticCategory.Error) {
    super(container, messageArgs, category);
  }

  /** Gets the schema where the diagnostic originated. */
  public get schema(): Schema { return this.ecDefinition.schema; }

  /** Gets the DiagnosticType. */
  public get diagnosticType(): DiagnosticType { return DiagnosticType.CustomAttributeContainer; }
}

/**
 * Helper method for creating [[SchemaDiagnostic]] child classes.
 * @param code The string that uniquely identifies the diagnostic in the format '<ruleSetName>:<number>'.
 * @param messageText The message to associate with the diagnostic class.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function createSchemaDiagnosticClass<ARGS extends any[]>(code: string, messageText: string) {
  validateCode(code);
  return class extends SchemaDiagnostic<ARGS> {
    public static code = code;
    public get code(): string { return code; }
    public get messageText(): string { return undefined === this.messageArgs ? messageText : formatString(messageText, ...this.messageArgs); }
  };
}

/**
 * Helper method for creating [[SchemaItemDiagnostic]] child classes.
 * @param code The string that uniquely identifies the diagnostic in the format '<ruleSetName>:<number>'.
 * @param messageText The message to associate with the diagnostic class.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function createSchemaItemDiagnosticClass<ITEM extends SchemaItem, ARGS extends any[]>(code: string, messageText: string) {
  validateCode(code);
  return class extends SchemaItemDiagnostic<ITEM, ARGS> {
    public get code(): string { return code; }
    public get messageText(): string { return undefined === this.messageArgs ? messageText : formatString(messageText, ...this.messageArgs); }
  };
}

/**
 * Helper method for creating [[ClassDiagnostic]] child classes.
 * @param code The string that uniquely identifies the diagnostic in the format '<ruleSetName>:<number>'.
 * @param messageText The message to associate with the diagnostic class.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function createClassDiagnosticClass<ARGS extends any[]>(code: string, messageText: string) {
  validateCode(code);
  return class extends ClassDiagnostic<ARGS> {
    public get code(): string { return code; }
    public get messageText(): string { return undefined === this.messageArgs ? messageText : formatString(messageText, ...this.messageArgs); }
  };
}

/**
 * Helper method for creating [[PropertyDiagnostic]] child classes.
 * @param code The string that uniquely identifies the diagnostic in the format '<ruleSetName>:<number>'.
 * @param messageText The message to associate with the diagnostic class.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function createPropertyDiagnosticClass<ARGS extends any[]>(code: string, messageText: string) {
  validateCode(code);
  return class extends PropertyDiagnostic<ARGS> {
    public static code = code;
    public get code(): string { return code; }
    public get messageText(): string { return undefined === this.messageArgs ? messageText : formatString(messageText, ...this.messageArgs); }
  };
}

/**
 * Helper method for creating [[RelationshipConstraintDiagnostic]] child classes.
 * @param code The string that uniquely identifies the type of diagnostic in the format '<ruleSetName>:<number>'.
 * @param messageText The message to associate with the diagnostic class.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function createRelationshipConstraintDiagnosticClass<ARGS extends any[]>(code: string, messageText: string) {
  validateCode(code);
  return class extends RelationshipConstraintDiagnostic<ARGS> {
    public get code(): string { return code; }
    public get messageText(): string { return undefined === this.messageArgs ? messageText : formatString(messageText, ...this.messageArgs); }
  };
}

/**
 * Helper method for creating [[CustomAttributeContainerDiagnostic]] child classes.
 * @param code The that uniquely identifies the type of diagnostic in the format '<ruleSetName>:<number>'.
 * @param messageText The message to associate with the diagnostic class.
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function createCustomAttributeContainerDiagnosticClass<ARGS extends any[]>(code: string, messageText: string) {
  validateCode(code);
  return class extends CustomAttributeContainerDiagnostic<ARGS> {
    public get code(): string { return code; }
    public get messageText(): string { return undefined === this.messageArgs ? messageText : formatString(messageText, ...this.messageArgs); }
  };
}

/**
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function diagnosticCategoryToString(category: DiagnosticCategory) {
  switch (category) {
    case DiagnosticCategory.Error:
      return "Error";
    case DiagnosticCategory.Warning:
      return "Warning";
    case DiagnosticCategory.Message:
      return "Message";
    case DiagnosticCategory.Suggestion:
      return "Suggestion";
  }
}

/**
 * @beta
 * @deprecated Moved to the ecschema-editing package.
 */
export function diagnosticTypeToString(type: DiagnosticType) {
  switch (type) {
    case DiagnosticType.CustomAttributeContainer:
      return "CustomAttributeContainer";
    case DiagnosticType.None:
      return "None";
    case DiagnosticType.Property:
      return "Property";
    case DiagnosticType.RelationshipConstraint:
      return "RelationshipConstraint";
    case DiagnosticType.Schema:
      return "Schema";
    case DiagnosticType.SchemaItem:
      return "SchemaItem";
  }
}

function validateCode(code: string) {
  const msg = `Diagnostic code ${code} is invalid. Expected the format <ruleSetName>-<number>.`;
  const parts = code.split("-");
  if (parts.length !== 2) throw new Error(msg);
  if (isNaN(Number(parts[1]))) throw new Error(msg);
}
