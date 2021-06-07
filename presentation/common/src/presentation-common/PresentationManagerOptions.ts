/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { DescriptorOverrides, SelectionInfo } from "./content/Descriptor";
import { FieldDescriptor } from "./content/Fields";
import { DiagnosticsOptionsWithHandler } from "./Diagnostics";
import { Ruleset } from "./rules/Ruleset";
import { RulesetVariable } from "./RulesetVariables";

/**
 * Enumeration of standard request priorities.
 * @public
 */
export enum RequestPriority {
  /** Priority for pre-loading requests */
  Preload = 0,

  /** Priority for general requests */
  Normal = 1000,

  /** Max possible priority */
  Max = Number.MAX_SAFE_INTEGER,
}

/** @alpha */
export enum PresentationUnitSystem {
  Metric = "metric",
  BritishImperial = "british-imperial",
  UsCustomary = "us-customary",
  UsSurvey = "us-survey",
}

/**
 * A generic request options type used for both hierarchy and content requests
 * @public
 */
export interface RequestOptions<TIModel> {
  /** iModel to request data from */
  imodel: TIModel;

  /** Optional locale to use when formatting / localizing data */
  locale?: string;

  /**
   * Unit system to use when formatting property values with units. Default presentation
   * unit is used if unit system is not specified.
   *
   * @alpha
   */
  unitSystem?: PresentationUnitSystem;

  /**
   * Optional request priority. Higher priority requests are handled first.
   * Defaults to [[RequestPriority.Normal]]
   */
  priority?: number;

  /** @alpha */
  diagnostics?: DiagnosticsOptionsWithHandler;
}

/**
 * Options for requests that require presentation ruleset. Not
 * meant to be used directly, see one of the subclasses.
 *
 * @public
 */
export interface RequestOptionsWithRuleset<TIModel, TRulesetVariable = RulesetVariable> extends RequestOptions<TIModel> {
  /** Ruleset or id of the ruleset to use when requesting data */
  rulesetOrId: Ruleset | string;

  /** Ruleset variables to use when requesting data */
  rulesetVariables?: TRulesetVariable[];
}

/**
 * Base request type for hierarchy requests
 * @public
 * @deprecated Use [[ExtendedHierarchyRequestOptions]]
 */
export interface HierarchyRequestOptions<TIModel, TRulesetVariable = RulesetVariable> extends RequestOptionsWithRuleset<TIModel, TRulesetVariable> { // eslint-disable-line @typescript-eslint/no-empty-interface
}

/**
 * Request type for hierarchy requests
 * @public
 */
export interface ExtendedHierarchyRequestOptions<TIModel, TNodeKey, TRulesetVariable = RulesetVariable> extends RequestOptionsWithRuleset<TIModel, TRulesetVariable> {
  /** Key of the parent node to get children for */
  parentKey?: TNodeKey;
}
/** @internal */
// eslint-disable-next-line deprecation/deprecation
export const isExtendedHierarchyRequestOptions = <TIModel, TNodeKey, TRulesetVariable>(opts: HierarchyRequestOptions<TIModel> | ExtendedHierarchyRequestOptions<TIModel, TNodeKey, TRulesetVariable>): opts is ExtendedHierarchyRequestOptions<TIModel, TNodeKey, TRulesetVariable> => {
  return !!(opts as ExtendedHierarchyRequestOptions<TIModel, TNodeKey, TRulesetVariable>).parentKey;
};

/**
 * Request type for content requests
 * @public
 * @deprecated Use [[ContentDescriptorRequestOptions]] or [[ExtendedContentRequestOptions]]
 */
export interface ContentRequestOptions<TIModel, TRulesetVariable = RulesetVariable> extends RequestOptionsWithRuleset<TIModel, TRulesetVariable> { // eslint-disable-line @typescript-eslint/no-empty-interface
}

/**
 * Request type for content descriptor requests
 * @public
 */
export interface ContentDescriptorRequestOptions<TIModel, TKeySet, TRulesetVariable = RulesetVariable> extends RequestOptionsWithRuleset<TIModel, TRulesetVariable> {
  /**
   * Content display type.
   * @see [[DefaultContentDisplayTypes]]
   */
  displayType: string;
  /** Input keys for getting the content */
  keys: TKeySet;
  /** Information about the selection event that was the cause of this content request */
  selection?: SelectionInfo;
}
/** @internal */
// eslint-disable-next-line deprecation/deprecation
export const isContentDescriptorRequestOptions = <TIModel, TKeySet, TRulesetVariable>(opts: ContentRequestOptions<TIModel> | ContentDescriptorRequestOptions<TIModel, TKeySet, TRulesetVariable>): opts is ContentDescriptorRequestOptions<TIModel, TKeySet, TRulesetVariable> => {
  return !!(opts as ContentDescriptorRequestOptions<TIModel, TKeySet, TRulesetVariable>).keys;
};

/**
 * Request type for content requests
 * @public
 */
export interface ExtendedContentRequestOptions<TIModel, TDescriptor, TKeySet, TRulesetVariable = RulesetVariable> extends RequestOptionsWithRuleset<TIModel, TRulesetVariable> {
  /** Content descriptor or overrides for customizing the returned content */
  descriptor: TDescriptor | DescriptorOverrides;
  /** Input keys for getting the content */
  keys: TKeySet;
}
/** @internal */
// eslint-disable-next-line deprecation/deprecation
export const isExtendedContentRequestOptions = <TIModel, TDescriptor, TKeySet, TRulesetVariable>(opts: ContentRequestOptions<TIModel> | ExtendedContentRequestOptions<TIModel, TDescriptor, TKeySet, TRulesetVariable>): opts is ExtendedContentRequestOptions<TIModel, TDescriptor, TKeySet, TRulesetVariable> => {
  return !!(opts as ExtendedContentRequestOptions<TIModel, TDescriptor, TKeySet, TRulesetVariable>).descriptor
    && !!(opts as ExtendedContentRequestOptions<TIModel, TDescriptor, TKeySet, TRulesetVariable>).keys;
};

/**
 * Request type for distinct values' requests
 * @public
 */
export interface DistinctValuesRequestOptions<TIModel, TDescriptor, TKeySet, TRulesetVariable = RulesetVariable> extends Paged<RequestOptionsWithRuleset<TIModel, TRulesetVariable>> {
  /** Content descriptor for content we're requesting distinct values for or overrides for customizing the returned content */
  descriptor: TDescriptor | DescriptorOverrides;
  /** Input keys for getting the content */
  keys: TKeySet;
  /** Descriptor for a field distinct values are requested for */
  fieldDescriptor: FieldDescriptor;
}

/**
 * Request type for label requests
 * @public
 * @deprecated Use [[DisplayLabelRequestOptions]] or [[DisplayLabelsRequestOptions]]
 */
export interface LabelRequestOptions<TIModel> extends RequestOptions<TIModel> { } // eslint-disable-line @typescript-eslint/no-empty-interface

/**
 * Request type for label requests
 * @public
 */
export interface DisplayLabelRequestOptions<TIModel, TInstanceKey> extends RequestOptions<TIModel> {
  /** Key of ECInstance to get label for */
  key: TInstanceKey;
}
/** @internal */
// eslint-disable-next-line deprecation/deprecation
export const isDisplayLabelRequestOptions = <TIModel, TInstanceKey>(opts: LabelRequestOptions<TIModel> | DisplayLabelRequestOptions<TIModel, TInstanceKey>): opts is DisplayLabelRequestOptions<TIModel, TInstanceKey> => {
  return !!(opts as DisplayLabelRequestOptions<TIModel, TInstanceKey>).key;
};

/**
 * Request type for labels requests
 * @public
 */
export interface DisplayLabelsRequestOptions<TIModel, TInstanceKey> extends RequestOptions<TIModel> {
  /** Keys of ECInstances to get labels for */
  keys: TInstanceKey[];
}
/** @internal */
// eslint-disable-next-line deprecation/deprecation
export const isDisplayLabelsRequestOptions = <TIModel, TInstanceKey>(opts: LabelRequestOptions<TIModel> | DisplayLabelsRequestOptions<TIModel, TInstanceKey>): opts is DisplayLabelsRequestOptions<TIModel, TInstanceKey> => {
  return !!(opts as DisplayLabelsRequestOptions<TIModel, TInstanceKey>).keys;
};

/**
 * Request options used for selection scope related requests
 * @public
 */
export interface SelectionScopeRequestOptions<TIModel> extends RequestOptions<TIModel> { } // eslint-disable-line @typescript-eslint/no-empty-interface

/**
 * Data structure for comparing presentation data after ruleset or ruleset variable changes.
 * @public
 * @deprecated Use [[HierarchyCompareOptions]]
 */
export type PresentationDataCompareOptions<TIModel, TNodeKey, TRulesetVariable = RulesetVariable> = HierarchyCompareOptions<TIModel, TNodeKey, TRulesetVariable>;

/**
 * Data structure for comparing a hierarchy after ruleset or ruleset variable changes.
 * @public
 */
export interface HierarchyCompareOptions<TIModel, TNodeKey, TRulesetVariable = RulesetVariable> extends RequestOptionsWithRuleset<TIModel, TRulesetVariable> {
  prev: {
    rulesetOrId?: Ruleset | string;
    rulesetVariables?: TRulesetVariable[];
  };
  expandedNodeKeys?: TNodeKey[];
  continuationToken?: {
    prevHierarchyNode: string;
    currHierarchyNode: string;
  };
  resultSetSize?: number;
}

/**
 * Paging options
 * @public
 */
export interface PageOptions {
  /** Inclusive start 0-based index of the page */
  start?: number;
  /** Maximum size of the page */
  size?: number;
}

/**
 * A wrapper type that injects [[PageOptions]] into supplied type
 * @public
 */
export type Paged<TOptions extends {}> = TOptions & {
  /** Optional paging parameters */
  paging?: PageOptions;
};
