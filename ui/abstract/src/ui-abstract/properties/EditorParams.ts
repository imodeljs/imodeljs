/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

// cspell:ignore BBGGRR pushable DDTHH

/** Interface used to provide a custom Date Time formatter and optional parser
 * for use by `DatePickerPopup`. If a parseData function is not implemented
 * then string to date parsing will not be possible when a `DateFormatter` is used.
 * @public
 */
export interface DateFormatter {
  formateDate: (day: Date) => string;
  parseDate?: (dateString: string) => Date | undefined;
}

/** Alternate Data Formats that can be provide by javascript. Can be used by Date TypeConverter and TypeEditor.
 * @public
 */
export enum AlternateDateFormats {
  None = 0,
  // YYYY-MM-DD
  IsoShort = 1,
  // YYYY-MM-DDTHH:mm:ss.sssZ
  IsoDateTime,
  // dd Mmm yyyy
  UtcShort,
  // dd Mmm yyyy hh:mm:ss GMT
  UtcDateTime,
  // Www, dd Mmm yyyy
  UtcShortWithDay,
  // Www, dd Mmm yyyy hh:mm:ss GMT
  UtcDateTimeWithDay,
}

/** Enum that defines supported time formats.
 * @public
 */
export enum TimeDisplay {
  // 12 hour with minutes and cycle(AM/PM)
  H12MC = "hh:mm aa",
  // 12 hour with minutes, seconds and cycle(AM/PM)
  H12MSC = "hh:mm:ss aa",
  // 24 hour with minutes
  H24M = "hh:mm",
  // 24 hour with minutes and seconds
  H24MS = "hh:mm:ss",
}

/**
 * Enum for Property Editor Param Types
 * @public
 */
export enum PropertyEditorParamTypes {
  ButtonGroupData = "UiAbstract-ButtonGroupData",
  CheckBoxIcons = "UiAbstract-CheckBoxIcons",
  Icon = "UiAbstract-Icon",
  InputEditorSize = "UiAbstract-InputEditorSize",
  ColorData = "UiAbstract-ColorData",
  CustomFormattedNumber = "UiAbstract-CustomFormattedNumber",
  IconListData = "UiAbstract-IconListData",
  // JSON = "UiAbstract-JSON",
  MultilineText = "UiAbstract-MultilineText",
  Range = "UiAbstract-Range",
  Slider = "UiAbstract-Slider",
  // SuppressUnitLabel = "UiAbstract-SuppressUnitLabel",
  SuppressEditorLabel = "UiAbstract-SuppressEditorLabel",
  CheckBoxImages = "UiAbstract-CheckBoxImages",
}

/**
 * [[BasePropertyEditorParams]] Base interface for Property Editor Params
 * @public
 */
export interface BasePropertyEditorParams {
  type: string;
}

/**
 * Parameters used by PropertyEditors that use HTML <input> element.
 * @public
 */
/** [[InputEditorSizeParams]] type guard.
 * @public
 */
export interface InputEditorSizeParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.InputEditorSize;
  /** Optionally define the width in characters. */
  size?: number;
  /** Optionally define the maximum number of characters allowed. */
  maxLength?: number;
}

/** InputEditorSizeParams type guard.
 * @public
 */
export const isInputEditorSizeParams = (item: BasePropertyEditorParams): item is InputEditorSizeParams => {
  return item.type === PropertyEditorParamTypes.InputEditorSize;
};

/**
 * [[ColorEditorParams]] Parameters used to populate color type editor with a specific set of colors. If not specified the Color
 * Editor will show a default palette of 16 colors.
 * @public
 */
export interface ColorEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.ColorData;
  /** array of color values to show in color picker popup. Use [[ColorByName]] enum values. Values should be 32-bit integer in the form 0xBBGGRR. */
  colorValues: number[];
  /** number of columns to show in color picker popup. The value of 4 is used if not defined. */
  numColumns?: number;
}

/** ColorEditorParams type guard.
 * @public
 */
export const isColorEditorParams = (item: BasePropertyEditorParams): item is ColorEditorParams => {
  return item.type === PropertyEditorParamTypes.ColorData;
};

/**
 * [[IconListEditorParams]] Parameters used to populate icon type editor with a specific set of icons.
 * @public
 */
export interface IconListEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.IconListData;
  /** active icon shown in the button */
  iconValue: string;
  /** array of icon (svg) names to show in icon picker popup. */
  iconValues: string[];
  /** number of columns to show in icon picker popup. The value of 4 is used if not defined. */
  numColumns?: number;
}

/** IconListEditorParams type guard.
 * @public
 */
export const isIconListEditorParams = (item: BasePropertyEditorParams): item is IconListEditorParams => {
  return item.type === PropertyEditorParamTypes.IconListData;
};

/**
 * [[IconDefinition]] Information about an icon displayed next to a property editor.
 * @public
 */
export interface IconDefinition {
  /** Icon specification. The value is the name of an icon WebFont entry, or if specifying an SVG symbol, use `svg:` prefix. */
  iconSpec: string;
  /** Function to determine if the item is enabled. */
  isEnabledFunction?: () => boolean;
}

/**
 * [[ButtonGroupEditorParams]] Parameters used by EnumButtonGroupEditor to define icons in button group.
 * @public
 */
export interface ButtonGroupEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.ButtonGroupData;
  buttons: IconDefinition[];
}

/** ButtonGroupEditorParams type guard.
 * @public
 */
export const isButtonGroupEditorParams = (item: BasePropertyEditorParams): item is ButtonGroupEditorParams => {
  return item.type === PropertyEditorParamTypes.ButtonGroupData;
};

/**
 * [[SuppressLabelEditorParams]] Parameters used to suppress the label for a type editor in the ToolSettings widget.
 * @public
 */
export interface SuppressLabelEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.SuppressEditorLabel;
  /** if false then an empty placeholder label is created. This is sometimes necessary to align editor in proper column */
  suppressLabelPlaceholder?: boolean;
}

/** SuppressLabelEditorParams type guard.
 * @public
 */
export const isSuppressLabelEditorParams = (item: BasePropertyEditorParams): item is SuppressLabelEditorParams => {
  return item.type === PropertyEditorParamTypes.SuppressEditorLabel;
};

// /**
//  * Parameters used by PropertyEditors that support JSON.
//  * @alpha
//  */
// export interface JsonEditorParams extends BasePropertyEditorParams {
//   type: PropertyEditorParamTypes.JSON;
//   json: any;
// }

/**
 * Parameters used by PropertyEditors that support defining a minimum and maximum value.
 * @public
 */
export interface RangeEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.Range;
  /** Defines the minimum value. Default is Number.MIN_SAFE_INTEGER. */
  minimum?: number;
  /** Defines the maximum value. Default is Number.MAX_SAFE_INTEGER. */
  maximum?: number;
  /** Defines the step value. Default is 1. */
  step?: number;
  /** Defines the precision. Default is 0. */
  precision?: number;
}

/**
 * Parameters used to indicate that a Slider should be presented for the property
 * and to specify the values needed by the slider.
 * @public
 */
export interface SliderEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.Slider;
  /** Defines the minimum value. */
  minimum: number;
  /** Defines the maximum value. */
  maximum: number;

  /** Optionally define the width in pixels. */
  size?: number;

  /** Step value. Default is 0.1. */
  step?: number;
  /** The interaction mode. Default is 1. Possible values:
   * 1 - allows handles to cross each other.
   * 2 - keeps the sliders from crossing and separated by a step.
   * 3 - makes the handles pushable and keep them a step apart.
   */
  mode?: number;

  /** Indicates whether the display of the Slider values is reversed. */
  reversed?: boolean;

  /** Indicates whether to show tooltip with the value. The tooltip will be positioned above the Slider, by default. */
  showTooltip?: boolean;
  /** Indicates whether the tooltip should show below the Slider instead of above. */
  tooltipBelow?: boolean;
  /** Format a value for the tooltip */
  formatTooltip?: (value: number) => string;

  /** Indicates whether to show min & max values to the left & right of the Slider. */
  showMinMax?: boolean;
  /** Image to show for min. */
  minIconSpec?: string;
  /** Image to show for max. */
  maxIconSpec?: string;

  /** Indicates whether to show tick marks under the Slider. */
  showTicks?: boolean;
  /** Indicates whether to show tick labels under the tick marks. */
  showTickLabels?: boolean;
  /** Format a tick mark value */
  formatTick?: (tick: number) => string;
  /** Function to get the tick count. The default tick count is 10. */
  getTickCount?: () => number;
  /** Function to get the tick values. This overrides the tick count from getTickCount.
   * Use this prop if you want to specify your own tick values instead of ticks generated by the slider.
   * The numbers should be valid numbers in the domain and correspond to the step value.
   * Invalid values will be coerced to the closet matching value in the domain.
   */
  getTickValues?: () => number[];
}

/**
 * Parameter that is used to indicate that a multiline text editor should be created.
 * The number of rows specified will determine the height of the editor control.
 * @public
 */
export interface MultilineTextEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.MultilineText;
  rows: number;
}

/**
 * Parameters used to display an icon next to property editor.
 * @public
 */
export interface IconEditorParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.Icon;
  definition: IconDefinition;
}

/**
 * Parameters for ImageCheckBoxEditor
 * @public
 */
export interface ImageCheckBoxParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.CheckBoxImages;
  imageOn: string;
  imageOff: string;

}

// /**
//  * Parameter used to suppress Unit labels
//  * @alpha
//  */
// export interface SuppressUnitLabelEditorParams extends BasePropertyEditorParams {
//   type: PropertyEditorParamTypes.SuppressUnitLabel;
// }

/**
 * defines Results of parsing a string input by a user into its desired value type
 * @public
 */
export interface ParseResults {
  value?: string | number | boolean | {} | string[] | Date | [] | undefined;
  parseError?: string;
}

/**
 * Parameters used with properties that want to control parsing and formatting.
 * @public
 */
export interface CustomFormattedNumberParams extends BasePropertyEditorParams {
  type: PropertyEditorParamTypes.CustomFormattedNumber;
  formatFunction: (numberValue: number) => string;
  parseFunction: (stringValue: string) => ParseResults;
}

/** CustomFormattedNumberParams type guard.
 * @public
 */
export const isCustomFormattedNumberParams = (item: BasePropertyEditorParams): item is CustomFormattedNumberParams => {
  return item.type === PropertyEditorParamTypes.CustomFormattedNumber;
};

/**
 * Type definition for Property Editor params
 * @public
 */
export type PropertyEditorParams = BasePropertyEditorParams;
