/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormatting
 */

import { BeUiEvent } from "@bentley/bentleyjs-core";
import {
  Format, FormatProps, FormatterSpec, ParseError, ParserSpec, QuantityParseResult, UnitConversion, UnitProps, UnitsProvider,
} from "@bentley/imodeljs-quantity";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../imodeljs-frontend";

// cSpell:ignore FORMATPROPS FORMATKEY ussurvey uscustomary USCUSTOM

/** Used to uniquely identify a unit system. There should be an entry for each entry in `PresentationUnitSystem` @presentation-common package
 * "metric" -> PresentationUnitSystem.Metric
 * "imperial" -> PresentationUnitSystem.BritishImperial
 * "usCustomary" -> PresentationUnitSystem.UsCustomary
 * "usSurvey" -> PresentationUnitSystem.UsSurvey
 * @beta
 */
export type UnitSystemKey = "metric" | "imperial" | "usCustomary" | "usSurvey";

/** Defines standard format types for tools that need to display measurements to user. Kept only to provide compatibility for existing API.
 * @beta
 */
export enum QuantityType { Length = 1, Angle = 2, Area = 3, Volume = 4, LatLong = 5, Coordinate = 6, Stationing = 7, LengthSurvey = 8, LengthEngineering = 9 }

/** Type the can be used to uniquely identify a Quantity Type.
 * @beta
 */
export type QuantityTypeArg = QuantityType | string;

/** String used to uniquely identify a QuantityType in the quantity registry. See function `getQuantityTypeKey`.
 * @beta
 */
export type QuantityTypeKey = string;

/** Function to return a QuantityTypeKey given either a QuantityType or a string
 * @beta
 */
export function getQuantityTypeKey(type: QuantityTypeArg): QuantityTypeKey {
  // For QuantityType enum values, build a string that shouldn't collide with anything a user may come up with
  if (typeof type === "number")
    return `QuantityTypeEnumValue-${type.toString()}`;
  return type;
}

/** Properties that define an EditorSpec for editing a custom formatting property that is stored in the "custom" property in the FormatProps.
 * The editor controls will be automatically generated in the UI and are limited to a checkbox to set a boolean value, a text dropdown/select
 * component to pick a string value from a list of options, and a text input component that returns a string value.
 * @beta
 */
export interface CustomFormatPropEditorSpec {
  editorType: "checkbox"|"text"|"select";
  label: string;
}

/** CheckboxFormatPropEditorSpec defines getter and setter method for a boolean property editor.
 * @beta
 */
export interface CheckboxFormatPropEditorSpec extends CustomFormatPropEditorSpec {
  editorType: "checkbox";
  getBool: (props: FormatProps) => boolean;
  setBool: (props: FormatProps, isChecked: boolean) => FormatProps;
}

/** CheckboxFormatPropEditorSpec type guard.
 * @beta
 */
export const isCheckboxFormatPropEditorSpec = (item: CustomFormatPropEditorSpec): item is CheckboxFormatPropEditorSpec => {
  return item.editorType === "checkbox";
};

/** TextInputFormatPropEditorSpec defines getter and setter method for a text input property editor.
 * @beta
 */
export interface TextInputFormatPropEditorSpec extends CustomFormatPropEditorSpec {
  editorType: "text";
  getString: (props: FormatProps) => string;
  setString: (props: FormatProps, value: string) => FormatProps;
}

/** TextInputFormatPropEditorSpec type guard.
 * @beta
 */
export const isTextInputFormatPropEditorSpec = (item: CustomFormatPropEditorSpec): item is TextInputFormatPropEditorSpec => {
  return item.editorType === "text";
};

/** TextSelectFormatPropEditorSpec defines getter and setter method for a Select/Dropdown property editor.
 * @beta
 */
export interface TextSelectFormatPropEditorSpec extends CustomFormatPropEditorSpec {
  editorType: "select";
  selectOptions: {label: string, value: string}[];
  getString: (props: FormatProps) => string;
  setString: (props: FormatProps, value: string) => FormatProps;
}

/** TextSelectFormatPropEditorSpec type guard.
 * @beta
 */
export const isTextSelectFormatPropEditorSpec = (item: CustomFormatPropEditorSpec): item is TextSelectFormatPropEditorSpec => {
  return item.editorType === "select";
};

/** Definition of a standard QuantityType that is registered with the QuantityFormatter.
 * @beta
 */
export interface QuantityTypeDefinition {
  /** String used as a key to look up the quantity type. If defining a [[CustomQuantityTypeDefinition]] the QuantityTypeKey
   * should match the QuantityTypeArg. */
  readonly key: QuantityTypeKey;
  /** The type value which can be one of the standard QuantityType enum values or a unique string if defining a custom type. */
  readonly type: QuantityTypeArg;
  /** The unit that the magnitude of the quantity is stored ie. (Meter for Length and Radian for Angle). The persistence unit is
   * also used during formatting if the FormatProps does not define one or more composite units.  */
  readonly persistenceUnit: UnitProps;
  /** Localized label to display in UI */
  label: string;
  /** Localized description that may be used to provide detailed description for the Quantity type. */
  description: string;
  /* Provide a default FormatProps for a unit system. */
  getDefaultFormatPropsBySystem: (requestedSystem: UnitSystemKey) => FormatProps;
  /** Generate a [FormatterSpec]$(imodeljs-quantity) that will be called to format values.*/
  generateFormatterSpec: (formatProps: FormatProps, unitsProvider: UnitsProvider) => Promise<FormatterSpec>;
  /** Generate a [ParserSpec]$(imodeljs-quantity) that will be called to parse a string into a quantity value.*/
  generateParserSpec: (formatProps: FormatProps, unitsProvider: UnitsProvider) => Promise<ParserSpec>;
}

/** CustomQuantityTypeDefinition interface is used to define a Custom quantity type that can be registered with the [[QuantityFormatter]].
 * A custom quantity formatter must be able to generate a FormatterSpec and ParserSpec that will be called to format and parse values.
 * Optionally it can provide specification of custom properties that it will use to define any formatting options. CustomQuantityTypeDefinitions
 * must be registered with the [[QuantityFormatter]] using the method `IModelApp.quantityFormatter.registerQuantityType`.
 * @beta
 */
export interface CustomQuantityTypeDefinition extends QuantityTypeDefinition {
  /** Return true if the FormatProps have the necessary `custom` property definition */
  isCompatibleFormatProps: (formatProps: FormatProps) => boolean;
  /** An array of specifications that are used to generate a label and editor in the UI used to display and edit the FormatProps.
   * UI items defined as primary will be shown higher in the list of UI components. */
  primaryPropEditorSpecs?: CustomFormatPropEditorSpec[];
  /** An array of specifications that are used to generate a label and editor in the UI used to display and edit the FormatProps.
   * UI items defined as secondary will be shown below other UI components that edit FormatProps. */
  secondaryPropEditorSpecs?: CustomFormatPropEditorSpec[];
}

/** CustomQuantityTypeDefinition type guard.
 * @beta
*/
export function isCustomQuantityTypeDefinition(item: QuantityTypeDefinition): item is CustomQuantityTypeDefinition {
  return !!(item as CustomQuantityTypeDefinition).isCompatibleFormatProps;
}

/** private class to hold standard quantity definitions and implement QuantityTypeDefinition interface */
class StandardQuantityTypeDefinition implements QuantityTypeDefinition {
  private _label: string|undefined;
  private _description: string|undefined;
  private _key: string;

  constructor(public type: QuantityType, public persistenceUnit: UnitProps, private _labelKey: string, private _descriptionKey: string ) {
    this._key = getQuantityTypeKey(type);
  }

  public get key(): string { return this._key; }

  public get label(): string {
    if (!this._label) {
      this._label = IModelApp.i18n.translate(this._labelKey);
    }
    return this._label;
  }

  public get description(): string {
    if (!this._description) {
      this._description = IModelApp.i18n.translate(this._descriptionKey);
    }
    return this._description;
  }

  public getDefaultFormatPropsBySystem(requestedSystem: UnitSystemKey): FormatProps {
    // Fallback same as Format "DefaultRealU" in Formats ecschema
    const fallbackProps: FormatProps = {
      formatTraits: ["keepSingleZero", "keepDecimalPoint", "showUnitLabel"],
      precision: 6,
      type: "Decimal",
      uomSeparator: " ",
      decimalSeparator: ".",
    };

    const defaultUnitSystemData = DEFAULT_FORMATKEY_BY_UNIT_SYSTEM.find((value) => value.system === requestedSystem);
    if (defaultUnitSystemData) {
      const defaultFormatEntry = defaultUnitSystemData.entries.find ((value) => value.type === this.key);
      if (defaultFormatEntry) {
        const defaultFormatPropsEntry = DEFAULT_FORMATPROPS.find((props) => props.key === defaultFormatEntry.formatKey);
        if (defaultFormatPropsEntry)
          return defaultFormatPropsEntry.format;
      }
    }

    return fallbackProps;
  }

  public async generateFormatterSpec(formatProps: FormatProps, unitsProvider: UnitsProvider) {
    const format = await Format.createFromJSON(this.key, unitsProvider, formatProps);
    return FormatterSpec.create(format.name, format, unitsProvider, this.persistenceUnit);
  }

  public async generateParserSpec(formatProps: FormatProps, unitsProvider: UnitsProvider) {
    const format = await Format.createFromJSON(this.key, unitsProvider, formatProps);
    return ParserSpec.create(format, unitsProvider, this.persistenceUnit);
  }
}

/** Override format entries can define formats for any of the different unit systems.
 * @beta
 */
export interface OverrideFormatEntry {
  imperial?: FormatProps;
  metric?: FormatProps;
  usCustomary?: FormatProps;
  usSurvey?: FormatProps;
}

/** Interface that defines the functions required to be implemented to provide custom formatting and parsing of a custom quantity type.
 * @beta
 */
export interface FormatterParserSpecsProvider {
  quantityType: QuantityTypeArg;
  createFormatterSpec: (unitSystem: UnitSystemKey) => Promise<FormatterSpec>;
  createParserSpec: (unitSystem: UnitSystemKey) => Promise<ParserSpec>;
}

/** Arguments sent to FormattingUnitSystemChanged event listeners.
 * @beta
 */
export interface FormattingUnitSystemChangedArgs {
  /* string that defines unit system activated. */
  readonly system: UnitSystemKey;
}

/** Arguments sent to QuantityFormatsChanged event listeners.
 * @beta
 */
export interface QuantityFormatsChangedArgs {
  /** string that represents the QuantityType that has been overriden or the overrides cleared. */
  readonly quantityType: string;
}

/** Arguments sent to [[UnitFormattingSettingsProvider]] when overrides are changed.
 * @beta
 */
export interface QuantityFormatOverridesChangedArgs {
  /** string that represents the QuantityType that has been overriden or the overrides cleared. */
  readonly typeKey: QuantityTypeKey;
  /** overrideEntry will be undefined when clearing overrides */
  readonly overrideEntry?: OverrideFormatEntry;
  /** used only when change applies to a single unit system */
  readonly unitSystem?: UnitSystemKey;
}

/** The UnitFormattingSettingsProvider interface is used to store and retrieve override FormatProps and Presentation Unit System for use by the QuantityFormatter.
 *  If no UnitFormattingSettingsProvider is supplied to the QuantityFormatter then any overrides set are lost when the session is closed.
 *  @beta
 */
export interface UnitFormattingSettingsProvider {
  /** serializes JSON object containing format overrides for a specific quantity type. */
  store (quantityTypeKey: QuantityTypeKey, overrideProps: OverrideFormatEntry): Promise<boolean>;
  /** retrieves serialized JSON object containing format overrides for a specific quantity type. */
  retrieve (quantityTypeKey: QuantityTypeKey): Promise<OverrideFormatEntry|undefined>;
  /** removes the override formats for a specific quantity type. */
  remove (quantityTypeKey: QuantityTypeKey): Promise<boolean>;
  /** retrieves the active unit system typically based on the "active" iModelConnection */
  retrieveUnitSystem(defaultKey: UnitSystemKey): Promise<UnitSystemKey>;
  /** store the active unit system typically for the "active" iModelConnection */
  storeUnitSystemKey(unitSystemKey: UnitSystemKey): Promise<boolean>;
  /** Function to load overrides for a specific IModelConnection. Typically this is not called often since typical
   * implementations monitor for IModelConnection changes and call this method internally. */
  loadOverrides(imodel: IModelConnection|undefined): Promise<void>;
  /** function called to save changes to Presentation Unit System */
  storeUnitSystemSetting(args: FormattingUnitSystemChangedArgs): Promise<void>;
  /** function called to save format overrides */
  storeFormatOverrides(args: QuantityFormatOverridesChangedArgs): Promise<void>;
  /** property that is set by the implementation to inform the BaseUnitFormattingSettingsProvider if the provider
   *  should trigger reloading of the overrides when the "active" imodel changes. */
  readonly maintainOverridesPerIModel: boolean;
}

/** Class that supports formatting quantity values into strings and parsing strings into quantity values. This class also maintains
 * the "active" unit system and caches FormatterSpecs and ParserSpecs for the "active" unit system to allow synchronous access to
 * parsing and formatting values. The support unit systems are defined by [[UnitSystemKey]] and is kept in synch with the unit systems
 * provided by the Presentation Manager on the backend. The QuantityFormatter contains a registry of quantity type definitions. These definitions implement
 * the [[QuantityTypeDefinition]] interface, which among other things, provide default [FormatProps]$(imodeljs-quantity), and provide methods
 * to generate both a [FormatterSpec]$(imodeljs-quantity) and a [ParserSpec]$(imodeljs-quantity). There are built-in quantity types that are
 * identified by the [[QuantityType]] enum. [[CustomQuantityTypeDefinition]] can be registered to extend the available quantity types available
 * by frontend tools. The QuantityFormatter also allows the default formats to be overriden.
 *
 * @beta
 */
export class QuantityFormatter implements UnitsProvider {
  protected _quantityTypeRegistry: Map<QuantityTypeKey, QuantityTypeDefinition> = new Map<QuantityTypeKey, QuantityTypeDefinition>();
  protected _activeUnitSystem: UnitSystemKey = "imperial";
  protected _activeFormatSpecsByType = new Map<QuantityTypeKey, FormatterSpec>();
  protected _activeParserSpecsByType = new Map<QuantityTypeKey, ParserSpec>();
  protected _overrideFormatPropsByUnitSystem = new Map<UnitSystemKey, Map<QuantityTypeKey, FormatProps>>();
  protected _unitFormattingSettingsProvider: UnitFormattingSettingsProvider | undefined;

  /** set the settings provider and if not imodel specific initialize setting for user. */
  public async setUnitFormattingSettingsProvider(provider: UnitFormattingSettingsProvider ) {
    this._unitFormattingSettingsProvider = provider;
    if (!provider.maintainOverridesPerIModel)
      await provider.loadOverrides(undefined);
  }

  /** Called after the active unit system is changed.
   * The useImperial argument should not be relied on now that multiple systems are supported. It will
   * only return true if unit system is explicitly set to "imperial"
   * @deprecated use onActiveFormattingUnitSystemChanged event for multiple unit system support.
   */
  public readonly onActiveUnitSystemChanged = new BeUiEvent<{ useImperial: boolean }>();

  /** Called after the active unit system is changed.
  * The system will report the UnitSystemKey/name of the the system that was activated.
  */
  public readonly onActiveFormattingUnitSystemChanged = new BeUiEvent<FormattingUnitSystemChangedArgs>();

  /** Called when the format of a QuantityType is overriden or the override is cleared. The string returned will
   * be a QuantityTypeKey generated by method `getQuantityTypeKey`.
   */
  public readonly onQuantityFormatsChanged = new BeUiEvent<QuantityFormatsChangedArgs>();

  /** Fired when the active UnitsProvider is updated. This will allow cached Formatter and Parser specs to be updated if necessary. */
  public readonly onUnitsProviderChanged = new BeUiEvent<void>();

  /**
   * constructor
   * @param _context - SchemaContext with Units for _unitsProvider to find Units from
   * @param showMetricOrUnitSystem - Pass in `true` to show Metric formatted quantity values. Defaults to Imperial. To explicitly
   * set it to a specific unit system pass a UnitSystemKey.
   */
  constructor(private _unitsProvider: UnitsProvider, showMetricOrUnitSystem?: boolean | UnitSystemKey) {
    if (undefined !== showMetricOrUnitSystem) {
      if (typeof showMetricOrUnitSystem === "boolean")
        this._activeUnitSystem = showMetricOrUnitSystem ? "metric" : "imperial";
      else
        this._activeUnitSystem = showMetricOrUnitSystem;
    }
  }

  private getOverrideFormatPropsByQuantityType(quantityTypeKey: QuantityTypeKey, unitSystem?: UnitSystemKey): FormatProps | undefined {
    const requestedUnitSystem = unitSystem??this.activeUnitSystem;
    const overrideMap = this._overrideFormatPropsByUnitSystem.get(requestedUnitSystem);
    if (!overrideMap)
      return undefined;

    return overrideMap.get(quantityTypeKey);
  }

  protected async initializeQuantityTypesRegistry() {
    // QuantityType.Length
    const lengthUnit = await this.findUnitByName("Units.M");
    const lengthDefinition = new StandardQuantityTypeDefinition (QuantityType.Length, lengthUnit,
      "iModelJs:QuantityType.Length.label", "iModelJs:QuantityType.Length.description");
    this._quantityTypeRegistry.set(lengthDefinition.key, lengthDefinition);

    // QuantityType.LengthEngineering
    const lengthEngineeringDefinition = new StandardQuantityTypeDefinition (QuantityType.LengthEngineering, lengthUnit,
      "iModelJs:QuantityType.LengthEngineering.label", "iModelJs:QuantityType.LengthEngineering.description");
    this._quantityTypeRegistry.set(lengthEngineeringDefinition.key, lengthEngineeringDefinition);

    // QuantityType.Coordinate
    const coordinateDefinition = new StandardQuantityTypeDefinition (QuantityType.Coordinate, lengthUnit,
      "iModelJs:QuantityType.Coordinate.label", "iModelJs:QuantityType.Coordinate.description");
    this._quantityTypeRegistry.set(coordinateDefinition.key, coordinateDefinition);

    // QuantityType.Stationing
    const stationingDefinition = new StandardQuantityTypeDefinition (QuantityType.Stationing, lengthUnit,
      "iModelJs:QuantityType.Stationing.label", "iModelJs:QuantityType.Stationing.description");
    this._quantityTypeRegistry.set(stationingDefinition.key, stationingDefinition);

    // QuantityType.LengthSurvey
    const lengthSurveyDefinition = new StandardQuantityTypeDefinition (QuantityType.LengthSurvey, lengthUnit,
      "iModelJs:QuantityType.LengthSurvey.label", "iModelJs:QuantityType.LengthSurvey.description");
    this._quantityTypeRegistry.set(lengthSurveyDefinition.key, lengthSurveyDefinition);

    // QuantityType.Angle
    const radUnit = await this.findUnitByName("Units.RAD");
    const angleDefinition = new StandardQuantityTypeDefinition (QuantityType.Angle, radUnit,
      "iModelJs:QuantityType.Angle.label", "iModelJs:QuantityType.Angle.description");
    this._quantityTypeRegistry.set(angleDefinition.key, angleDefinition);

    // QuantityType.LatLong
    const latLongDefinition = new StandardQuantityTypeDefinition (QuantityType.LatLong, radUnit,
      "iModelJs:QuantityType.LatLong.label", "iModelJs:QuantityType.LatLong.description");
    this._quantityTypeRegistry.set(latLongDefinition.key, latLongDefinition);

    // QuantityType.Area
    const sqMetersUnit = await this.findUnitByName("Units.SQ_M");
    const areaDefinition = new StandardQuantityTypeDefinition (QuantityType.Area, sqMetersUnit,
      "iModelJs:QuantityType.Area.label", "iModelJs:QuantityType.Area.description");
    this._quantityTypeRegistry.set(areaDefinition.key, areaDefinition);

    // QuantityType.Volume
    const cubicMetersUnit = await this.findUnitByName("Units.CUB_M");
    const volumeDefinition = new StandardQuantityTypeDefinition (QuantityType.Volume, cubicMetersUnit,
      "iModelJs:QuantityType.Volume.label", "iModelJs:QuantityType.Volume.description");
    this._quantityTypeRegistry.set(volumeDefinition.key, volumeDefinition);
  }

  /** Asynchronous call to load Formatting and ParsingSpecs for a unit system. This method ends up caching FormatterSpecs and ParserSpecs
   *  so they can be quickly accessed.
   * @internal public for unit test usage
   */
  protected async loadFormatAndParsingMapsForSystem(systemType?: UnitSystemKey): Promise<void> {
    const systemKey = (undefined !== systemType) ? systemType : this._activeUnitSystem;
    const formatPropsByType = new Map<QuantityTypeDefinition, FormatProps>();

    // load cache for every registered QuantityType
    [...this.quantityTypesRegistry.keys()].forEach((key) => {
      const entry = this.quantityTypesRegistry.get(key)!;
      formatPropsByType.set(entry, this.getFormatPropsByQuantityTypeEntyAndSystem(entry, systemKey));
    });

    const formatPropPromises = new Array<Promise<void>>();
    for (const [entry, formatProps] of formatPropsByType) {
      formatPropPromises.push(this.loadFormatAndParserSpec(entry, formatProps));
    }
    await Promise.all(formatPropPromises);
  }

  private getFormatPropsByQuantityTypeEntyAndSystem(quantityEntry: QuantityTypeDefinition, requestedSystem: UnitSystemKey, ignoreOverrides?: boolean): FormatProps {
    if (!ignoreOverrides) {
      const overrideProps = this.getOverrideFormatPropsByQuantityType (quantityEntry.key, requestedSystem);
      if (overrideProps)
        return overrideProps;
    }

    return quantityEntry.getDefaultFormatPropsBySystem(requestedSystem);
  }

  private async loadFormatAndParserSpec(quantityTypeDefinition: QuantityTypeDefinition, formatProps: FormatProps) {
    const formatterSpec = await quantityTypeDefinition.generateFormatterSpec(formatProps, this.unitsProvider);
    const parserSpec = await quantityTypeDefinition.generateParserSpec(formatProps, this.unitsProvider);
    this._activeFormatSpecsByType.set(quantityTypeDefinition.key, formatterSpec);
    this._activeParserSpecsByType.set(quantityTypeDefinition.key, parserSpec);
  }

  // repopulate formatSpec and parserSpec entries using only default format
  private async loadDefaultFormatAndParserSpecForQuantity(typeKey: QuantityTypeKey) {
    const quantityTypeDefinition = this.quantityTypesRegistry.get(typeKey);
    if (!quantityTypeDefinition)
      throw new Error (`Unable to locate QuantityType by key ${typeKey}`);

    const defaultFormat =  quantityTypeDefinition.getDefaultFormatPropsBySystem(this.activeUnitSystem);
    await this.loadFormatAndParserSpec(quantityTypeDefinition, defaultFormat);
  }

  private async setOverrideFormatsByQuantityTypeKey(typeKey: QuantityTypeKey, overrideEntry: OverrideFormatEntry) {
    // extract overrides and insert into appropriate override map entry
    Object.keys(overrideEntry).forEach ((systemKey) => {
      const unitSystemKey = systemKey as UnitSystemKey;
      const props = overrideEntry[unitSystemKey];
      if (props) {
        if (this._overrideFormatPropsByUnitSystem.has(unitSystemKey)) {
          this._overrideFormatPropsByUnitSystem.get(unitSystemKey)!.set(typeKey, props);
        } else {
          const newMap = new Map<string, FormatProps>();
          newMap.set(typeKey, props);
          this._overrideFormatPropsByUnitSystem.set(unitSystemKey, newMap);
        }
      }
    });

    this._unitFormattingSettingsProvider &&
      this._unitFormattingSettingsProvider.storeFormatOverrides({typeKey, overrideEntry});

    const formatProps = this.getOverrideFormatPropsByQuantityType(typeKey, this.activeUnitSystem);
    if (formatProps) {
      const typeEntry = this.quantityTypesRegistry.get (typeKey);
      if (typeEntry) {
        await this.loadFormatAndParserSpec(typeEntry, formatProps);
        // trigger a message to let callers know the format has changed.
        this.onQuantityFormatsChanged.emit({ quantityType: typeKey });
      }
    }
  }

  /** Method called to clear override and restore defaults formatter and parser spec */
  private async clearOverrideFormatsByQuantityTypeKey(type: QuantityTypeKey) {
    const unitSystem = this.activeUnitSystem;
    if (this.getOverrideFormatPropsByQuantityType(type, unitSystem)) {
      const overrideMap = this._overrideFormatPropsByUnitSystem.get(unitSystem);
      if (overrideMap && overrideMap.has(type)) {
        overrideMap.delete(type);
        this._unitFormattingSettingsProvider &&
          this._unitFormattingSettingsProvider.storeFormatOverrides({typeKey:type, unitSystem});

        await this.loadDefaultFormatAndParserSpecForQuantity(type);
        // trigger a message to let callers know the format has changed.
        this.onQuantityFormatsChanged.emit({ quantityType: type });
      }
    }
  }

  /** This method is called during IModelApp initialization to load the standard quantity types into the registry and to initialize the cache.
   * @internal
   */
  public async onInitialized() {
    await this.initializeQuantityTypesRegistry();

    // initialize default format and parsing specs
    await this.loadFormatAndParsingMapsForSystem();
  }

  public get quantityTypesRegistry() {
    return this._quantityTypeRegistry;
  }

  public get unitsProvider() {
    return this._unitsProvider;
  }

  public set unitsProvider(unitsProvider: UnitsProvider) {
    this._unitsProvider = unitsProvider;
    this.onUnitsProviderChanged.emit();
  }

  public async registerQuantityType(entry: CustomQuantityTypeDefinition, replace?: boolean) {
    if (!replace && this._quantityTypeRegistry.has(entry.key))
      return false;

    this._quantityTypeRegistry.set(entry.key, entry);
    // load any overrides so any saved overrides for the type being registered are applied
    if (this._unitFormattingSettingsProvider)
      await this._unitFormattingSettingsProvider.loadOverrides(undefined);

    if (entry.getDefaultFormatPropsBySystem) {
      const formatProps = entry.getDefaultFormatPropsBySystem(this.activeUnitSystem);
      await this.loadFormatAndParserSpec(entry, formatProps);
      return true;
    }
    return false;
  }

  /** Reinitialize caches. Typically called by active UnitFormattingSettingsProvider.
   * startDefaultTool - set to true to start the Default to instead of leaving any active tool pointing to cached unit data that is no longer valid
   * @beta
   */
  public async reinitializeFormatAndParsingsMaps(overrideFormatPropsByUnitSystem: Map<UnitSystemKey, Map<QuantityTypeKey, FormatProps>>,
    unitSystemKey?: UnitSystemKey, fireUnitSystemChanged?: boolean, startDefaultTool?: boolean): Promise<void> {
    this._overrideFormatPropsByUnitSystem.clear();
    if (overrideFormatPropsByUnitSystem.size) {
      this._overrideFormatPropsByUnitSystem = overrideFormatPropsByUnitSystem;
    }

    unitSystemKey && (this._activeUnitSystem = unitSystemKey);
    await this.loadFormatAndParsingMapsForSystem(this._activeUnitSystem);
    fireUnitSystemChanged && this.onActiveFormattingUnitSystemChanged.emit({ system: this._activeUnitSystem });
    IModelApp.toolAdmin && startDefaultTool && IModelApp.toolAdmin.startDefaultTool();
  }

  /** Set the Active unit system to one of the supported types. This will asynchronously load the formatter and parser specs for the activated system. */
  public async setActiveUnitSystem(isImperialOrUnitSystem: UnitSystemKey | boolean, restartActiveTool?: boolean): Promise<void> {
    let systemType: UnitSystemKey;
    if (typeof isImperialOrUnitSystem === "boolean")
      systemType = isImperialOrUnitSystem ? "imperial" : "metric";
    else
      systemType = isImperialOrUnitSystem;

    if (this._activeUnitSystem === systemType)
      return;

    this._activeUnitSystem = systemType;
    await this.loadFormatAndParsingMapsForSystem(systemType);
    // fire deprecated event
    this.onActiveUnitSystemChanged.emit({ useImperial: systemType === "imperial" }); // eslint-disable-line deprecation/deprecation
    // allow settings provider to store the change
    this._unitFormattingSettingsProvider && this._unitFormattingSettingsProvider.storeUnitSystemSetting ({ system: systemType });
    // fire current event
    this.onActiveFormattingUnitSystemChanged.emit({ system: systemType });
    if (IModelApp.toolAdmin && restartActiveTool)
      IModelApp.toolAdmin.startDefaultTool();
  }

  /** True if tool quantity values should be displayed in imperial units; false for metric. Changing this flag triggers an asynchronous request to refresh the cached formats. */
  public get activeUnitSystem(): UnitSystemKey { return this._activeUnitSystem; }

  /** @deprecated use setActiveUnitSystem method and activeUnitSystem property */
  public get useImperialFormats(): boolean { return this._activeUnitSystem === "imperial"; }
  public set useImperialFormats(useImperial: boolean) {
    this.setActiveUnitSystem(useImperial ? "imperial" : "metric", true); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  public async clearOverrideFormats(type: QuantityTypeArg) {
    await this.clearOverrideFormatsByQuantityTypeKey(this.getQuantityTypeKey(type));
  }

  public async setOverrideFormats(type: QuantityTypeArg, overrideEntry: OverrideFormatEntry) {
    await this.setOverrideFormatsByQuantityTypeKey(this.getQuantityTypeKey(type), overrideEntry);
  }

  // TODO: make more generic to support "named" systems.
  public async setOverrideFormat(type: QuantityTypeArg, overrideFormat: FormatProps) {
    const typeKey = this.getQuantityTypeKey(type);
    let overrideEntry: OverrideFormatEntry = {};
    if (this.activeUnitSystem === "imperial")
      overrideEntry = { imperial: overrideFormat };
    else if (this.activeUnitSystem === "metric")
      overrideEntry = { metric: overrideFormat };
    else if (this.activeUnitSystem === "usCustomary")
      overrideEntry = { usCustomary: overrideFormat };
    else
      overrideEntry = { usSurvey: overrideFormat };

    await this.setOverrideFormatsByQuantityTypeKey(typeKey, overrideEntry);
  }

  public async clearAllOverrideFormats() {
    if (0 === this._overrideFormatPropsByUnitSystem.size)
      return;

    if (this._overrideFormatPropsByUnitSystem.has(this.activeUnitSystem)) {
      const overrides = this._overrideFormatPropsByUnitSystem.get(this.activeUnitSystem);
      const typesRemoved: string[] = [];
      if (overrides && overrides.size) {
        overrides.forEach((_props, typeKey) => {
          typesRemoved.push(typeKey);
          this._unitFormattingSettingsProvider &&
            this._unitFormattingSettingsProvider.storeFormatOverrides({typeKey, unitSystem:this.activeUnitSystem});
        });
      }

      if (typesRemoved.length) {
        const promises = new Array<Promise<void>>();
        typesRemoved.forEach((typeRemoved)=> promises.push(this.loadDefaultFormatAndParserSpecForQuantity(typeRemoved)));
        await Promise.all(promises);
        // trigger a message to let callers know the format has changed.
        this.onQuantityFormatsChanged.emit({ quantityType: typesRemoved.join("|") });
      }
    }
  }

  /** Converts a QuantityTypeArg into a QuantityTypeKey/string value. */
  public getQuantityTypeKey(type: QuantityTypeArg): string {
    return getQuantityTypeKey(type);
  }

  public getQuantityDefinition(type: QuantityTypeArg) {
    return this.quantityTypesRegistry.get(this.getQuantityTypeKey(type));
  }

  /** Synchronous call to get a FormatterSpec of a QuantityType. If the FormatterSpec is not yet cached an undefined object is returned. The
   * cache is populated by the async call loadFormatAndParsingMapsForSystem.
   */
  public findFormatterSpecByQuantityType(type: QuantityTypeArg, _unused?: boolean): FormatterSpec | undefined {
    return this._activeFormatSpecsByType.get(this.getQuantityTypeKey(type));
  }

  public async generateFormatterSpecByType(type: QuantityTypeArg, formatProps: FormatProps) {
    const quantityTypeDefinition = this.quantityTypesRegistry.get(this.getQuantityTypeKey(type));
    if (quantityTypeDefinition)
      return quantityTypeDefinition.generateFormatterSpec(formatProps, this.unitsProvider);

    throw new Error(`Unable to generate FormatSpec for QuantityType ${type}`);
  }

  /** Asynchronous Call to get a FormatterSpec of a QuantityType.
   * @param type        One of the built-in quantity types supported.
   * @param system  deprecated argument that should not be used - use setActiveUnitSystem to set unit system.
   * @return A FormatterSpec Promise.
   */
  public async getFormatterSpecByQuantityTypeAndSystem(type: QuantityTypeArg, system?: UnitSystemKey): Promise<FormatterSpec | undefined> {
    const quantityKey = this.getQuantityTypeKey(type);
    const requestedSystem = system ?? this.activeUnitSystem;

    if (requestedSystem === this.activeUnitSystem) {
      const formatterSpec = this._activeFormatSpecsByType.get(quantityKey);
      if (formatterSpec)
        return formatterSpec;
    }

    const entry = this.quantityTypesRegistry.get(quantityKey);
    if (!entry)
      throw new Error (`Unable to find registered quantity type with key ${quantityKey}`);
    return entry.generateFormatterSpec(this.getFormatPropsByQuantityTypeEntyAndSystem(entry, requestedSystem), this.unitsProvider);
  }

  /** Asynchronous Call to get a FormatterSpec for a QuantityType.
   * @param type        One of the built-in quantity types supported.
   * @param isImperial  Argument to specify use of imperial or metric unit system. If left undefined the active unit system is used.
   * @return A FormatterSpec Promise.
   */
  public async getFormatterSpecByQuantityType(type: QuantityTypeArg, isImperial?: boolean): Promise<FormatterSpec | undefined> {
    let requestedSystem = this.activeUnitSystem;
    if (undefined !== isImperial)
      requestedSystem = isImperial ? "imperial" : "metric";
    return this.getFormatterSpecByQuantityTypeAndSystem (type, requestedSystem);
  }

  /** Synchronous call to get a ParserSpec for a QuantityType. If the ParserSpec is not yet cached an undefined object is returned. The
   * cache is populated when the active units system is set.
   */
  public findParserSpecByQuantityType(type: QuantityTypeArg): ParserSpec | undefined {
    return this._activeParserSpecsByType.get(this.getQuantityTypeKey(type));
  }

  public async getParserSpecByQuantityTypeAndSystem(type: QuantityTypeArg, system?: UnitSystemKey): Promise<ParserSpec | undefined> {
    const quantityKey = this.getQuantityTypeKey(type);
    const requestedSystem = system ?? this.activeUnitSystem;

    if (requestedSystem === this.activeUnitSystem) {
      const parserSpec = this._activeParserSpecsByType.get(quantityKey);
      if (parserSpec)
        return parserSpec;
    }

    const entry = this.quantityTypesRegistry.get(quantityKey);
    if (!entry)
      throw new Error (`Unable to find registered quantity type with key ${quantityKey}`);
    return entry.generateParserSpec(this.getFormatPropsByQuantityTypeEntyAndSystem(entry, requestedSystem), this.unitsProvider);
  }

  /** Asynchronous Call to get a ParserSpec for a QuantityType.
   * @param type        One of the built-in quantity types supported.
   * @param isImperial  Argument to specify use of imperial or metric unit system. If left undefined the active unit system is used.
   * @return A FormatterSpec Promise.
   */
  public async getParserSpecByQuantityType(type: QuantityTypeArg, isImperial?: boolean): Promise<ParserSpec | undefined> {
    let requestedSystem = this.activeUnitSystem;
    if (undefined !== isImperial)
      requestedSystem = isImperial ? "imperial" : "metric";
    return this.getParserSpecByQuantityTypeAndSystem (type, requestedSystem);
  }

  /** Generates a formatted string for a quantity given its format spec.
   * @param magnitude       The magnitude of the quantity.
   * @param formatSpec      The format specification. See methods getFormatterSpecByQuantityType and findFormatterSpecByQuantityType.
   * @return the formatted string.
   */
  public formatQuantity(magnitude: number, formatSpec: FormatterSpec | undefined): string {
    /** Format a quantity value. Default FormatterSpec implementation uses Formatter.formatQuantity. */
    if (formatSpec)
      return formatSpec.applyFormatting(magnitude);
    return magnitude.toString();
  }

  /** Parse input string into quantity given the ParserSpec
   * @param inString       The magnitude of the quantity.
   * @param parserSpec     The parse specification the defines the expected format of the string and the conversion to the output unit.
   * @return QuantityParseResult object containing either the parsed value or an error value if unsuccessful.
   */
  public parseToQuantityValue(inString: string, parserSpec: ParserSpec | undefined): QuantityParseResult {
    if (parserSpec)
      return parserSpec.parseToQuantityValue(inString);
    return { ok: false, error: ParseError.InvalidParserSpec };
  }

  /** Get a UnitSystemKey from a string that may have been entered via a key-in. Support different variation of unit system names.
   */
  public getUnitSystemFromString(inputSystem: string, fallback?: UnitSystemKey): UnitSystemKey {
    switch (inputSystem.toLowerCase()) {
      case "metric":
      case "si":
        return "metric";
      case "imperial":
      case "british-imperial":
        return "imperial";
      case "uscustomary":
      case "us-customary":
      case "us":
        return "usCustomary";
      case "ussurvey":
      case "us-survey":
      case "survey":
        return "usSurvey";
      default:
        if (undefined !== fallback)
          return fallback;
        break;
    }
    return "imperial";
  }

  public hasActiveOverride(type: QuantityTypeArg, checkOnlyActiveUnitSystem?: boolean): boolean {
    const quantityTypeKey = this.getQuantityTypeKey(type);

    if (checkOnlyActiveUnitSystem){
      const overrides = this._overrideFormatPropsByUnitSystem.get(this.activeUnitSystem);
      if (overrides && overrides.has(quantityTypeKey))
        return true;
      return false;
    }

    for (const [_key, overrideMap] of this._overrideFormatPropsByUnitSystem) {
      if (overrideMap.has(quantityTypeKey))
        return true;
    }
    return false;
  }

  public getFormatPropsByQuantityType(quantityType: QuantityTypeArg, requestedSystem?: UnitSystemKey, ignoreOverrides?: boolean) {
    const quantityEntry=this.quantityTypesRegistry.get (this.getQuantityTypeKey(quantityType));
    if (quantityEntry)
      return this.getFormatPropsByQuantityTypeEntyAndSystem(quantityEntry, requestedSystem ?? this.activeUnitSystem, ignoreOverrides);
    return undefined;
  }

  // keep following to maintain existing API of implementing UnitsProvider
  public async findUnit(unitLabel: string, schemaName?: string, phenomenon?: string, unitSystem?: string): Promise<UnitProps> {
    return this._unitsProvider.findUnit(unitLabel, schemaName, phenomenon, unitSystem);
  }

  public async getUnitsByFamily(phenomenon: string): Promise<UnitProps[]> {
    return this._unitsProvider.getUnitsByFamily(phenomenon);
  }

  public async findUnitByName(unitName: string): Promise<UnitProps> {
    return this._unitsProvider.findUnitByName(unitName);
  }

  public async getConversion(fromUnit: UnitProps, toUnit: UnitProps): Promise<UnitConversion> {
    return this._unitsProvider.getConversion(fromUnit, toUnit);
  }
}

// ========================================================================================================================================
// Default Data
// ========================================================================================================================================
const DEFAULT_FORMATKEY_BY_UNIT_SYSTEM = [
  {
    system: "metric",  // PresentationUnitSystem.Metric,
    entries: [
      { type: getQuantityTypeKey(QuantityType.Length), formatKey: "[units:length]meter4" },
      { type: getQuantityTypeKey(QuantityType.Angle), formatKey: "[units:angle]degree2" },
      { type: getQuantityTypeKey(QuantityType.Area), formatKey: "[units:area]mSquared4" },
      { type: getQuantityTypeKey(QuantityType.Volume), formatKey: "[units:volume]mCubed4" },
      { type: getQuantityTypeKey(QuantityType.LatLong), formatKey: "[units:angle]dms" },
      { type: getQuantityTypeKey(QuantityType.Coordinate), formatKey: "[units:length]meter2" },
      { type: getQuantityTypeKey(QuantityType.Stationing), formatKey: "[units:length]m-sta2" },
      { type: getQuantityTypeKey(QuantityType.LengthSurvey), formatKey: "[units:length]meter4" },
      { type: getQuantityTypeKey(QuantityType.LengthEngineering), formatKey: "[units:length]meter4" },
    ],
  },
  {
    system: "imperial", // PresentationUnitSystem.BritishImperial,
    entries: [
      { type: getQuantityTypeKey(QuantityType.Length), formatKey: "[units:length]fi8" },
      { type: getQuantityTypeKey(QuantityType.Angle), formatKey: "[units:angle]dms2" },
      { type: getQuantityTypeKey(QuantityType.Area), formatKey: "[units:area]fSquared4" },
      { type: getQuantityTypeKey(QuantityType.Volume), formatKey: "[units:volume]fCubed4" },
      { type: getQuantityTypeKey(QuantityType.LatLong), formatKey: "[units:angle]dms" },
      { type: getQuantityTypeKey(QuantityType.Coordinate), formatKey: "[units:length]feet2" },
      { type: getQuantityTypeKey(QuantityType.Stationing), formatKey: "[units:length]f-sta2" },
      { type: getQuantityTypeKey(QuantityType.LengthSurvey), formatKey: "[units:length]f-survey-4-labeled" },
      { type: getQuantityTypeKey(QuantityType.LengthEngineering), formatKey: "[units:length]feet4" },
    ],
  },
  {
    system: "usCustomary",  // PresentationUnitSystem.UsCustomary
    entries: [
      { type: getQuantityTypeKey(QuantityType.Length), formatKey: "[units:length]fi8" },
      { type: getQuantityTypeKey(QuantityType.Angle), formatKey: "[units:angle]dms2" },
      { type: getQuantityTypeKey(QuantityType.Area), formatKey: "[units:area]fSquared4" },
      { type: getQuantityTypeKey(QuantityType.Volume), formatKey: "[units:volume]fCubed4" },
      { type: getQuantityTypeKey(QuantityType.LatLong), formatKey: "[units:angle]dms" },
      { type: getQuantityTypeKey(QuantityType.Coordinate), formatKey: "[units:length]feet2" },
      { type: getQuantityTypeKey(QuantityType.Stationing), formatKey: "[units:length]f-sta2" },
      { type: getQuantityTypeKey(QuantityType.LengthSurvey), formatKey: "[units:length]f-survey-4" },
      { type: getQuantityTypeKey(QuantityType.LengthEngineering), formatKey: "[units:length]feet4" },
    ],
  },
  {
    system: "usSurvey",  // PresentationUnitSystem.UsSurvey
    entries: [
      { type: getQuantityTypeKey(QuantityType.Length), formatKey: "[units:length]f-survey-4" },
      { type: getQuantityTypeKey(QuantityType.Angle), formatKey: "[units:angle]dms2" },
      { type: getQuantityTypeKey(QuantityType.Area), formatKey: "[units:area]usSurveyFtSquared4" },
      { type: getQuantityTypeKey(QuantityType.Volume), formatKey: "[units:volume]usSurveyFtCubed4" },
      { type: getQuantityTypeKey(QuantityType.LatLong), formatKey: "[units:angle]dms" },
      { type: getQuantityTypeKey(QuantityType.Coordinate), formatKey: "[units:length]f-survey-2" },
      { type: getQuantityTypeKey(QuantityType.Stationing), formatKey: "[units:length]f-survey-sta2" },
      { type: getQuantityTypeKey(QuantityType.LengthSurvey), formatKey: "[units:length]f-survey-4" },
      { type: getQuantityTypeKey(QuantityType.LengthEngineering), formatKey: "[units:length]f-survey-4" },
    ],
  },
];

/** Interface used to define structure of default format definitions. */
interface UniqueFormatsProps {
  readonly key: string;
  readonly description?: string;
  readonly format: FormatProps;
}

/** List of default format definitions used by the Standard QuantityTypes. */
const DEFAULT_FORMATPROPS: UniqueFormatsProps[] = [
  {
    key: "[units:length]meter4",
    description: "meters (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "m", name: "Units.M" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:length]meter2",
    description: "meters (labeled) 2 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "m", name: "Units.M" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 2,
      type: "Decimal",
    },
  },

  {
    key: "[units:length]feet4",
    description: "feet (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft", name: "Units.FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:length]feet2",
    description: "feet (labeled) 2 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft", name: "Units.FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 2,
      type: "Decimal",
    },
  },
  {
    key: "[units:length]fi8",
    description: "feet-inch 1/8 (labeled)",
    format: {
      composite: {
        includeZero: true,
        spacer: "-",
        units: [{ label: "'", name: "Units.FT" }, { label: "\"", name: "Units.IN" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 8,
      type: "Fractional",
      uomSeparator: "",
    },
  },
  {
    key: "[units:length]f-sta2",
    description: "stationing feet-2 decimal places ",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft", name: "Units.FT" }],
      },
      formatTraits: ["trailZeroes", "keepSingleZero"],
      stationOffsetSize: 2,
      precision: 2,
      type: "Station",
    },
  },
  {
    key: "[units:length]f-survey-sta2",
    description: "stationing feet-2 decimal places ",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft", name: "Units.US_SURVEY_FT" }],
      },
      formatTraits: ["trailZeroes", "keepSingleZero"],
      stationOffsetSize: 2,
      precision: 2,
      type: "Station",
    },
  },

  {
    key: "[units:length]m-sta2",
    description: "stationing meters-2 decimal places ",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "m", name: "Units.M" }],
      },
      formatTraits: ["trailZeroes", "keepSingleZero"],
      stationOffsetSize: 3,
      precision: 2,
      type: "Station",
    },
  },
  {
    key: "[units:length]f-survey-2",
    description: "survey feet (labeled)-2 decimal places ",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft", name: "Units.US_SURVEY_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 2,
      type: "Decimal",
    },
  },
  {
    key: "[units:length]f-survey-4-labeled",
    description: "survey feet (labeled)-4 decimal places ",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft (US Survey)", name: "Units.US_SURVEY_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },

  {
    key: "[units:length]f-survey-4",
    description: "survey feet (labeled)-4 decimal places ",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft", name: "Units.US_SURVEY_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:angle]degree2",
    description: "degrees (labeled) 2 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "°", name: "Units.ARC_DEG" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 2,
      type: "Decimal",
      uomSeparator: "",
    },
  },
  {
    key: "[units:angle]dms",
    description: "degrees minutes seconds (labeled) 0 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "°", name: "Units.ARC_DEG" }, { label: "'", name: "Units.ARC_MINUTE" }, { label: "\"", name: "Units.ARC_SECOND" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 0,
      type: "Decimal",
      uomSeparator: "",
    },
  },
  {
    key: "[units:angle]dms2",
    description: "degrees minutes seconds (labeled) 2 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "°", name: "Units.ARC_DEG" }, { label: "'", name: "Units.ARC_MINUTE" }, { label: "\"", name: "Units.ARC_SECOND" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 2,
      type: "Decimal",
      uomSeparator: "",
    },
  },
  {
    key: "[units:area]mSquared4",
    description: "square meters (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "m²", name: "Units.SQ_M" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:area]fSquared4",
    description: "square feet (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft²", name: "Units.SQ_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:area]usSurveyFtSquared4",
    description: "square survey feet (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft²", name: "Units.SQ_US_SURVEY_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:volume]mCubed4",
    description: "cubic meters (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "m³", name: "Units.CUB_M" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:volume]fCubed4",
    description: "cubic feet (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft³", name: "Units.CUB_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
  {
    key: "[units:volume]usSurveyFtCubed4",
    description: "cubic survey feet (labeled) 4 decimal places",
    format: {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "ft³", name: "Units.CUB_US_SURVEY_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  },
];
