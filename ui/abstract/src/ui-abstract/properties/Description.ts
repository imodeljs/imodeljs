/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import {
  BasePropertyEditorParams, ColorEditorParams, ImageCheckBoxParams, PropertyEditorParams, PropertyEditorParamTypes, RangeEditorParams,
} from "./EditorParams";

// cSpell:ignore Picklist

/**
 * Information about an enumeration choice
 * @public
 */
export interface EnumerationChoice {
  label: string;
  value: string | number;
}

/**
 * Information about a set of enumeration choices
 * @public
 */
export interface EnumerationChoicesInfo {
  choices: Promise<EnumerationChoice[]> | EnumerationChoice[];
  isStrict?: boolean;
  maxDisplayedRows?: number;
}

/**
 * Property renderer identification and customization attributes
 * @public
 */
export interface PropertyRendererInfo {
  name: string;
}

/**
 * Information about a Property Editor
 * @public
 */
export interface PropertyEditorInfo {
  /** Editor name used in addition to the typename to find the registered property editor */
  name?: string;
  /** Editor params provided to the property editor */
  params?: PropertyEditorParams[];
}

/**
 * Information about a Property Converter
 * @public
 */
export interface PropertyConverterInfo {
  /** Converter name used in addition to the typename to find the registered property converter */
  name?: string;
  /** map of options for type converter */
  options?: { [key: string]: any };
}

/**
 * [[PropertyDescription]] contains metadata about a Property
 * @public
 */
export interface PropertyDescription {
  /** Name of the property description */
  name: string;
  /** Display label for the property description */
  displayLabel: string;
  /** Type name used to determine applicable Type Converter and Property Editor */
  typename: string;
  /** Additional information for enumerations */
  enum?: EnumerationChoicesInfo;
  /** Information for property renderer customization */
  renderer?: PropertyRendererInfo;
  /** Information for a property editor */
  editor?: PropertyEditorInfo;
  /** Information for a property converter */
  converter?: PropertyConverterInfo;
  /** Quantity type key used to look up formatting and parsing specs. This is typically either the name of a quantity type used by a tool
   *  or the full name of a KOQ (schema:koq).
   * @alpha
   */
  quantityType?: string;
  /** Get the custom DataController by this name and register it with the property editor */
  dataController?: string;
  /**
   * Should property label for composite (struct & array) properties be rendered.
   * @alpha
   */
  hideCompositePropertyLabel?: boolean;
}

/** Helper class that builds property descriptions for specific PropertyEditors and processes descriptions.
 * @beta
 */
export class PropertyDescriptionHelper {
  /** Builds a number description with a "weight-picker" editor name
   * @alpha
   */
  public static buildWeightPickerDescription(name: string, label: string, additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    return {
      name,
      displayLabel: label,
      typename: "number",
      editor: {
        name: "weight-picker",
        params: additionalParams,
      },
    };
  }

  /** Builds an editor that uses [NumberInput]($ui-core) control
   * @alpha
   */
  public static buildNumberEditorDescription(name: string, label: string, overrideParams?: RangeEditorParams, additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    const editorParams = [{
      type: PropertyEditorParamTypes.Range,
      step: 1,
      precision: 0,
      ...overrideParams,
    } as RangeEditorParams, ...additionalParams];

    const editor = {
      name: "numeric-input",
      params: editorParams,
    };

    return {
      name,
      displayLabel: label,
      typename: "number",
      editor,
    };
  }

  /** Builds a string description
   * @alpha
   */
  public static buildTextEditorDescription(name: string, label: string, additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    const editor = {
      params: additionalParams,
    };

    return {
      name,
      displayLabel: label,
      typename: "string",
      editor,
    };
  }

  /** Builds an enum description
   * @alpha
   */
  public static buildEnumPicklistEditorDescription(name: string, label: string,
    choices: Promise<EnumerationChoice[]> | EnumerationChoice[],
    additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    const editor = additionalParams.length ? {
      params: additionalParams,
    } : undefined;

    return {
      name,
      displayLabel: label,
      typename: "enum",
      editor,
      enum: {
        choices,
      },
    };
  }

  /** Builds a number description with a "color-picker" editor name
   * @alpha
   */
  public static buildColorPickerDescription(name: string, label: string, colorValues: number[], numColumns: number,
    additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    const editorParams = [
      {
        type: PropertyEditorParamTypes.ColorData,
        colorValues,
        numColumns,
      } as ColorEditorParams,
      ...additionalParams,
    ];

    return {
      name,
      displayLabel: label,
      typename: "number",
      editor: {
        name: "color-picker",
        params: editorParams,
      },
    };
  }

  /** Builds a boolean description with a "toggle" editor name
   * @alpha
   */
  public static buildToggleDescription(name: string, label: string, additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    return {
      name,
      displayLabel: label,
      typename: "boolean",
      editor: {
        name: "toggle",
        params: additionalParams,
      },
    };
  }

  /** Builds a boolean description with a "image-check-box" editor name
   * @alpha
   */
  public static buildImageCheckBoxDescription(name: string, label: string, imageOff: string, imageOn: string, additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    const editorParams = [{
      type: PropertyEditorParamTypes.CheckBoxImages,
      imageOff,
      imageOn,
    } as ImageCheckBoxParams, ...additionalParams];

    return {
      name,
      displayLabel: label,
      typename: "boolean",
      editor: {
        name: "image-check-box",
        params: editorParams,
      },
    };
  }

  /** Builds a boolean description
   * @alpha
   */
  public static buildCheckboxDescription(name: string, label: string, additionalParams: BasePropertyEditorParams[] = []): PropertyDescription {
    const editor = {
      params: additionalParams,
    };

    return {
      name,
      displayLabel: label,
      typename: "boolean",
      editor,
    };
  }

  /** Bumps an enum property description value
   * @beta
   */
  public static async bumpEnumProperty(description: PropertyDescription, value: string | number): Promise<string | number> {
    let choices: EnumerationChoice[] | undefined;

    if (description.enum) {
      if (description.enum.choices instanceof Promise) {
        choices = await description.enum.choices;
      } else {
        choices = description.enum.choices;
      }
    }

    if (!choices || choices.length === 0)
      return value;

    let choiceIndex = choices.findIndex((choice) => choice.value === value);
    if (choiceIndex < 0)
      return value;

    choiceIndex++;
    if (choiceIndex >= choices.length)
      choiceIndex = 0;

    const newValue = choices[choiceIndex].value;
    return newValue;
  }
}
