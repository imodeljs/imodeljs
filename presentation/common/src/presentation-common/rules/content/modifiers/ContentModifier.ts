/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PresentationRules
 */

import { SingleSchemaClassSpecification } from "../../ClassSpecifications";
import { RuleBase, RuleTypes } from "../../Rule";
import { PropertySpecification } from "../PropertySpecification";
import { CalculatedPropertiesSpecification } from "./CalculatedPropertiesSpecification";
import { DEPRECATED_PropertiesDisplaySpecification } from "./PropertiesDisplaySpecification";
import { PropertyCategorySpecification } from "./PropertyCategorySpecification";
import { DEPRECATED_PropertyEditorsSpecification } from "./PropertyEditorsSpecification";
import { RelatedPropertiesSpecification } from "./RelatedPropertiesSpecification";

/**
 * Contains various rule attributes that allow modifying returned content.
 *
 * This is not expected to be used directly - use through either `ContentModifier` or `ContentSpecification`.
 *
 * @public
 */
export interface ContentModifiersList {
  /** Specifications for including properties of related instances */
  relatedProperties?: RelatedPropertiesSpecification[];

  /** Specifications for including calculated properties */
  calculatedProperties?: CalculatedPropertiesSpecification[];

  /**
   * Specifications for customizing property display by hiding / showing them
   * @deprecated Use [[propertyOverrides]] attribute instead. Will be removed in iModel.js 3.0
   */
  propertiesDisplay?: DEPRECATED_PropertiesDisplaySpecification[]; // eslint-disable-line deprecation/deprecation

  /**
   * Specifications for assigning property editors
   * @deprecated Use [[propertyOverrides]] attribute instead. Will be removed in iModel.js 3.0
   */
  propertyEditors?: DEPRECATED_PropertyEditorsSpecification[]; // eslint-disable-line deprecation/deprecation

  /**
   * Specifications for custom categories. Simply defining the categories does
   * nothing - they have to be referenced from [[PropertySpecification]] defined in
   * [[propertyOverrides]] by `id`.
   */
  propertyCategories?: PropertyCategorySpecification[];

  /** Specifications for various property overrides. */
  propertyOverrides?: PropertySpecification[];
}

/**
 * Rule that allows supplementing content with additional
 * specifications for certain ECClasses.
 *
 * @see [More details]($docs/learning/presentation/Content/ContentModifier.md)
 * @public
 */
export interface ContentModifier extends RuleBase, ContentModifiersList {
  /** Used for serializing to JSON. */
  ruleType: RuleTypes.ContentModifier;

  /**
   * Specification of ECClass whose content should be supplemented.
   * The modifier is applied to all ECClasses if this property
   * is not specified.
   */
  class?: SingleSchemaClassSpecification;
}
