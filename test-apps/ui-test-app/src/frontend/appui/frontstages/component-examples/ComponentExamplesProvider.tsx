/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable deprecation/deprecation */

import * as React from "react";
import { BeDuration, Logger } from "@bentley/bentleyjs-core";
import moreSvg from "@bentley/icons-generic/icons/more-circular.svg?sprite";
import moreVerticalSvg from "@bentley/icons-generic/icons/more-vertical-circular.svg?sprite";
import { ColorByName, ColorDef } from "@bentley/imodeljs-common";
import {
  ActivityMessageDetails, ActivityMessageEndReason, IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType, QuantityType,
} from "@bentley/imodeljs-frontend";
import { Format, FormatProps, FormatterSpec, FormatTraits, UnitProps, UnitsProvider } from "@bentley/imodeljs-quantity";
import { DateFormatter, IconSpecUtilities, ParseResults, PropertyDescription, PropertyRecord, PropertyValue, PropertyValueFormat, RelativePosition, TimeDisplay } from "@bentley/ui-abstract";
import {
  adjustDateToTimezone, ColorPickerButton, ColorPickerDialog, ColorPickerPopup, ColorSwatch, ColumnDescription, DatePickerPopupButton, DatePickerPopupButtonProps,
  IntlFormatter, LineWeightSwatch, ParsedInput, QuantityInput, QuantityNumberInput, Table, TableDataChangeEvent, TableDataProvider, WeightPickerButton,
} from "@bentley/ui-components";
import {
  AutoSuggest,
  AutoSuggestData,
  BetaBadge, BlockText, BodyText, Button, ButtonSize, ButtonType, Checkbox, CheckListBox, CheckListBoxItem, CheckListBoxSeparator, ContextMenuItem,
  DisabledText, ExpandableList, FeaturedTile, Headline, HorizontalAlignment, HorizontalTabs, Icon, IconInput, Input, InputStatus, LabeledInput,
  LabeledSelect, LabeledTextarea, LabeledThemedSelect, LabeledToggle, LeadingText, Listbox, ListboxItem, LoadingPrompt, LoadingSpinner, LoadingStatus,
  MinimalFeaturedTile, MinimalTile, MutedText, NewBadge, NumberInput, NumericInput, Popup, ProgressBar, ProgressSpinner, Radio, ReactMessage,
  SearchBox, Select, SettingsContainer, SettingsTabEntry, Slider, SmallText, Spinner, SpinnerSize, SplitButton, Subheading, Textarea, ThemedSelect, Tile, Title,
  Toggle, ToggleButtonType, UnderlinedButton, VerticalTabs,
} from "@bentley/ui-core";
import { MessageManager, ModalDialogManager, QuantityFormatSettingsPage, ReactNotifyMessageDetails, UiFramework } from "@bentley/ui-framework";
import { SampleAppIModelApp } from "../../..";
import { ComponentExampleCategory, ComponentExampleProps } from "./ComponentExamples";
import { SampleContextMenu } from "./SampleContextMenu";
import { SampleExpandableBlock } from "./SampleExpandableBlock";
import { SampleImageCheckBox } from "./SampleImageCheckBox";
import { SamplePopupContextMenu } from "./SamplePopupContextMenu";
import { FormatPopupButton } from "./FormatPopupButton";
import { AccudrawSettingsPageComponent } from "../Settings";
import { ExpandableBlock } from "@itwin/itwinui-react";
import { TableExampleContent } from "../../contentviews/TableExampleContent";
import { ItemsAppendedSampleTimeline, ItemsPrefixedSampleTimeline, ItemsReplacedSampleTimeline, NoRepeatSampleTimeline } from "./SampleTimelineComponent";

function MySettingsPage() {
  const tabs: SettingsTabEntry[] = [
    {
      itemPriority: 10, tabId: "Quantity", pageWillHandleCloseRequest: true, label: "Quantity", tooltip: "Quantity Format Settings", icon: "icon-measure",
      page: <QuantityFormatSettingsPage initialQuantityType={QuantityType.Length} availableUnitSystems={new Set(["metric", "imperial", "usCustomary", "usSurvey"])} />,
    },
    {
      itemPriority: 20, tabId: "Accudraw", label: "Accudraw", tooltip: "Accudraw Settings", icon: "icon-paintbrush",
      page: <AccudrawSettingsPageComponent />,
    },
    { itemPriority: 30, tabId: "page3", label: "page3", page: <div>Page 3</div> },
    { itemPriority: 40, tabId: "page4", label: "page4", subLabel: "disabled page4", isDisabled: true, page: <div>Page 4</div> },
  ];

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <SettingsContainer tabs={tabs} settingsManager={UiFramework.settingsManager} />
    </div>
  );
}

function setFormatTrait(formatProps: FormatProps, trait: FormatTraits, setActive: boolean) {
  const traitStr = Format.getTraitString(trait);
  if (undefined === traitStr)
    return;
  let formatTraits: string[] | undefined;
  if (setActive) {
    // setting trait
    if (!formatProps.formatTraits) {
      formatTraits = [traitStr];
    } else {
      const traits = Array.isArray(formatProps.formatTraits) ? formatProps.formatTraits : formatProps.formatTraits.split(/,|;|\|/);
      if (!traits.find((traitEntry) => traitStr === traitEntry)) {
        formatTraits = [...traits, traitStr];
      }
    }
  } else {
    // clearing trait
    if (!formatProps.formatTraits)
      return;
    const traits = Array.isArray(formatProps.formatTraits) ? formatProps.formatTraits : formatProps.formatTraits.split(/,|;|\|/);
    formatTraits = traits.filter((traitEntry) => traitEntry !== traitStr);
  }
  return { ...formatProps, formatTraits };
}

function provideSecondaryChildren(formatProps: FormatProps, fireFormatChange: (newProps: FormatProps) => void) {
  const inProps = formatProps;
  const onChange = fireFormatChange;
  const handleUseThousandsSeparatorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProps = setFormatTrait(inProps, FormatTraits.Use1000Separator, e.target.checked);
    if (newProps)
      onChange(newProps);
  };

  return (
    <>
      <span className={"uicore-label"}>Secondary (1000 sep)</span>
      <Checkbox checked={Format.isFormatTraitSetInProps(formatProps, FormatTraits.Use1000Separator)} onChange={handleUseThousandsSeparatorChange} />
    </>
  );
}

function providePrimaryChildren(formatProps: FormatProps, fireFormatChange: (newProps: FormatProps) => void) {
  const inProps = formatProps;
  const onChange = fireFormatChange;
  const handleUseThousandsSeparatorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProps = setFormatTrait(inProps, FormatTraits.Use1000Separator, e.target.checked);
    if (newProps)
      onChange(newProps);
  };

  return (
    <>
      <span className={"uicore-label"}>Primary (1000 sep)</span>
      <Checkbox checked={Format.isFormatTraitSetInProps(formatProps, FormatTraits.Use1000Separator)} onChange={handleUseThousandsSeparatorChange} />
    </>
  );
}

async function provideFormatSpec(formatProps: FormatProps, persistenceUnit: UnitProps, unitsProvider: UnitsProvider, formatName?: string) {
  const actualFormat = await Format.createFromJSON(formatName ?? "custom", unitsProvider, formatProps);
  return FormatterSpec.create(actualFormat.name, actualFormat, unitsProvider, persistenceUnit);
}

function NumericFormatPopup({ persistenceUnitName, initialMagnitude }: { persistenceUnitName: string, initialMagnitude: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialFormatProps: FormatProps = {
    formatTraits: ["keepSingleZero", "applyRounding", "showUnitLabel", "trailZeroes"],
    precision: 4,
    type: "Decimal",
    uomSeparator: " ",
    decimalSeparator: ".",
  };

  const [formatterSpec, setFormatterSpec] = React.useState<FormatterSpec>();
  const [formattedValue, setFormattedValue] = React.useState<string>();
  const handleFormatChange = React.useCallback((inProps: FormatProps) => {
    async function fetchFormatSpec(formatProps: FormatProps) {
      const unitsProvider = IModelApp.quantityFormatter.unitsProvider;
      if (formatterSpec) {
        const pu = formatterSpec.persistenceUnit;
        if (pu) {
          const actualFormat = await Format.createFromJSON("custom", unitsProvider, formatProps);
          await actualFormat.fromJSON(unitsProvider, formatProps);
          const newSpec = await FormatterSpec.create(actualFormat.name, actualFormat, unitsProvider, pu);
          setFormattedValue(newSpec.applyFormatting(initialMagnitude));
          setFormatterSpec(newSpec);
        }
      }
    }
    fetchFormatSpec(inProps); // eslint-disable-line @typescript-eslint/no-floating-promises
  }, [formatterSpec, initialMagnitude]);

  React.useEffect(() => {
    async function fetchInitialFormatSpec() {
      const unitsProvider = IModelApp.quantityFormatter.unitsProvider;
      const pu = await unitsProvider.findUnitByName(persistenceUnitName);
      if (pu) {
        const newSpec = await provideFormatSpec(initialFormatProps, pu, unitsProvider);
        setFormattedValue(newSpec.applyFormatting(initialMagnitude));
        setFormatterSpec(newSpec);
      }
    }

    if (undefined === formatterSpec)
      fetchInitialFormatSpec(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }, [formatterSpec, persistenceUnitName, initialMagnitude, initialFormatProps]);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {(formatterSpec && formattedValue) &&
        <>
          <span>{formattedValue}</span>
          <FormatPopupButton initialFormat={formatterSpec.format.toJSON()} showSample={true} onFormatChange={handleFormatChange}
            initialMagnitude={initialMagnitude} unitsProvider={IModelApp.quantityFormatter.unitsProvider} persistenceUnit={formatterSpec.persistenceUnit}
            provideFormatSpec={provideFormatSpec}
            providePrimaryChildren={providePrimaryChildren}
            provideSecondaryChildren={provideSecondaryChildren}
          />
        </>
      }
    </div>
  );
}

function WrappedSelect() {
  const [currentValue, setCurrentValue] = React.useState(3);
  const handleValueChange = React.useCallback((value: number) => {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Set select value to ${value.toString()}`));
    setCurrentValue(value);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Select
        value={currentValue}
        onChange={(event) => handleValueChange(Number.parseInt(event.target.value, 10))}
        options={[
          { label: "Option 0", value: 0 },
          { label: "Option 1", value: 1 },
          { label: "Option 2", value: 2 },
          { label: "Option 3", value: 3 },
        ]} />
      <button onClick={() => handleValueChange(0)}>0</button>
      <button onClick={() => handleValueChange(1)}>1</button>
      <button onClick={() => handleValueChange(2)}>2</button>
      <button onClick={() => handleValueChange(3)}>3</button>
    </div>
  );
}

function NestedPopup({ closeOnNestedPopupOutsideClick }: { closeOnNestedPopupOutsideClick?: boolean }) {
  const [showPopup, setShowPopup] = React.useState(false);
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const handleOnDateChange = React.useCallback((day: Date) => {
    setCurrentDate(day);
  }, []);

  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const togglePopup = React.useCallback(() => {
    setShowPopup(!showPopup);
  }, [showPopup]);

  const handleClose = React.useCallback(() => {
    setShowPopup(false);
  }, []);

  return (
    <div>
      <button onClick={togglePopup} ref={buttonRef}>{showPopup ? "Close" : "Open"}</button>

      <Popup isOpen={showPopup} position={RelativePosition.Bottom} target={buttonRef.current}
        onClose={handleClose} showArrow={true} showShadow={true} closeOnNestedPopupOutsideClick={closeOnNestedPopupOutsideClick}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <LabeledInput label="Date" value={currentDate.toLocaleDateString()} disabled />
          <DatePickerPopupButton selected={currentDate} onDateChange={handleOnDateChange} />
        </div>
      </Popup>
    </div>
  );
}

function exoticStep(direction: string) {
  if (direction === "up")
    return .5;
  return .1;
}

function parseDollar(stringValue: string) {
  const noDollarSign = stringValue.replace(/^\$/, "");
  let n = parseFloat(noDollarSign);
  if (isNaN(n) || !isFinite(n))
    n = 0;
  return n;
}

function formatDollar(num: number | undefined | null, fallback: string) {
  if (undefined === num || null === num)
    return fallback;

  return `$${num.toFixed(2)}`;
}

function fahrenheitToCelsius(f: number) {
  return (f - 32) * 5 / 9;
}

function parseStringToCelsius(userInput: string): ParseResults {
  let convertFromFahrenheit = false;
  let temperatureStr = userInput;
  // if explicitly specified honor specification
  if (userInput.endsWith("f") || userInput.endsWith("F")) {
    convertFromFahrenheit = true;
    temperatureStr = userInput.slice(0, userInput.length - 1);
  } else if (userInput.endsWith("c") || userInput.endsWith("C")) {
    convertFromFahrenheit = false;
    temperatureStr = userInput.slice(0, userInput.length - 1);
  }

  try {
    let temperature = Number.parseFloat(temperatureStr);
    if (Number.isNaN(temperature))
      return { parseError: "unable to parse temperature" };
    if (convertFromFahrenheit)
      temperature = fahrenheitToCelsius(temperature);
    return { value: temperature };
  } catch (_e) {
    return { parseError: "unable to parse temperature" };
  }
}

function formatCelsiusValue(temperature: number): string {
  return `${temperature.toFixed(1)}C`;
}

/** An example formatter that both formats and parses dates. */
class MdyFormatter implements DateFormatter {
  private _formatter = new Intl.DateTimeFormat(undefined,
    {
      year: "numeric",    /* "2-digit", "numeric" */
      month: "2-digit",   /* "2-digit", "numeric", "narrow", "short", "long" */
      day: "2-digit",     /* "2-digit", "numeric" */
    });

  public formateDate(date: Date) {
    const formatParts = this._formatter.formatToParts(date);
    const month = formatParts.find((part) => part.type === "month")!.value;
    const day = formatParts.find((part) => part.type === "day")!.value;
    const year = formatParts.find((part) => part.type === "year")!.value;
    return `${month}-${day}-${year}`;
  }

  public parseDate(dateString: string) {
    const mdy = dateString.split("-").filter((value) => !!value);
    if (mdy.length !== 3) return undefined;
    const month = parseInt(mdy[0], 10);
    const day = parseInt(mdy[1], 10);
    const year = parseInt(mdy[2], 10);

    // validate
    if (isNaN(month) || month < 0 || month > 12) return undefined;
    if (isNaN(day) || day < 0 || day > 31) return undefined;
    if (isNaN(year) || year < 1800 || year > 2300) return undefined;

    return new Date(year, month - 1, day);
  }
}

/** A custom date formatter - no parser so edit field will be read only */
const customDayFormatter = new Intl.DateTimeFormat(undefined,
  {
    weekday: "long",    /* "narrow", "short", "long" */
    year: "numeric",    /* "2-digit", "numeric" */
    month: "2-digit",   /* "2-digit", "numeric", "narrow", "short", "long" */
    day: "2-digit",     /* "2-digit", "numeric" */
  });

/* eslint-disable no-console */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function DatePickerHost(props: DatePickerPopupButtonProps) {
  const { onDateChange, selected, ...otherProp } = props;
  const [currentDate, setCurrentDate] = React.useState(selected);

  const handleOnDateChange = React.useCallback((day: Date) => {
    onDateChange && onDateChange(day);
    setCurrentDate(day);
  }, [onDateChange]);

  return (
    <DatePickerPopupButton selected={currentDate} onDateChange={handleOnDateChange} {...otherProp} />
  );
}

export function WeightPickerHost(props: { activeWeight: number, onLineWeightPick: ((weight: number) => void) }) {
  const { onLineWeightPick, activeWeight } = props;
  const [currentWeight, setCurrentWeight] = React.useState(activeWeight);

  const handleWeightPick = React.useCallback((weight: number) => {
    onLineWeightPick && onLineWeightPick(weight);
    setCurrentWeight(weight);
  }, [onLineWeightPick]);

  return (
    <WeightPickerButton style={{ width: "max-content" }} activeWeight={currentWeight} onLineWeightPick={handleWeightPick} />
  );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function ColorPickerToggle() {
  const [colorDialogTitle] = React.useState("Select Color");
  const [selectedColor, setSelectedColor] = React.useState(ColorDef.red);
  const handleBackgroundColorDialogOk = React.useCallback((newColorDef: ColorDef) => {
    ModalDialogManager.closeDialog();
    setSelectedColor(newColorDef);
  }, []);

  const handleBackgroundColorDialogCancel = React.useCallback(() => {
    ModalDialogManager.closeDialog();
  }, []);

  const presetColors = React.useRef(
    [
      ColorDef.create(ColorByName.red),
      ColorDef.create(ColorByName.orange),
      ColorDef.create(ColorByName.yellow),
      ColorDef.create(ColorByName.green),
      ColorDef.create(ColorByName.blue),
      ColorDef.create(ColorByName.indigo),
      ColorDef.create(ColorByName.violet),
      ColorDef.create(ColorByName.black),
      ColorDef.create(ColorByName.white),
      ColorDef.create(ColorByName.cyan),
      ColorDef.create(ColorByName.fuchsia),
      ColorDef.create(ColorByName.tan),
      ColorDef.create(ColorByName.gray),
      ColorDef.create(ColorByName.brown),
      ColorDef.create(ColorByName.purple),
      ColorDef.create(ColorByName.olive),
    ]);

  const handleBgColorClick = React.useCallback((newColor: ColorDef, e: React.MouseEvent<Element, MouseEvent>) => {
    e.preventDefault();
    ModalDialogManager.openDialog(<ColorPickerDialog dialogTitle={colorDialogTitle} color={newColor} colorPresets={presetColors.current}
      onOkResult={handleBackgroundColorDialogOk} onCancelResult={handleBackgroundColorDialogCancel} />);
  }, [presetColors, handleBackgroundColorDialogOk, colorDialogTitle, handleBackgroundColorDialogCancel]);

  return (
    <ColorSwatch className="map-manager-base-item-color" colorDef={selectedColor} round={false} onColorPick={handleBgColorClick} />
  );
}

/** Creates a Component Example */
export const createComponentExample = (title: string, description: string | undefined, content: React.ReactNode): ComponentExampleProps => {
  return { title, description, content };
};

/** Provides Component Examples */
export class ComponentExamplesProvider {

  private static get autoSuggestSamples(): ComponentExampleCategory {
    const options: AutoSuggestData[] = [];

    for (let index = 0; index < 100; index++) {
      options.push({ value: index.toString(), label: `Option ${index}` });
    }

    const getSuggestions = async (value: string): Promise<AutoSuggestData[]> => {
      const inputValue = value.trim().toLowerCase();
      const inputLength = inputValue.length;

      return Promise.resolve(
        inputLength === 0 ?
        /* istanbul ignore next */[] :
          options.filter((data: AutoSuggestData) => {
            return data.label.toLowerCase().includes(inputValue) || data.value.toLowerCase().includes(inputValue);
          })
      );
    };

    return {
      title: "AutoSuggest",
      examples: [
        createComponentExample("AutoSuggest", undefined,
          <AutoSuggest placeholder="Type..." onSuggestionSelected={() => { }} getSuggestions={getSuggestions} />
        ),
      ],
    };
  }

  private static get badgeSamples(): ComponentExampleCategory {
    return {
      title: "Badge",
      examples: [
        createComponentExample("BetaBadge", undefined, <BetaBadge />),
        createComponentExample("NewBadge", undefined, <NewBadge />),
      ],
    };
  }

  private static get buttonSamples(): ComponentExampleCategory {
    return {
      title: "Button",
      examples: [
        createComponentExample("Basic Button", "Primary Button", <Button>Primary Button</Button>),
        createComponentExample("Disabled Button", "Button with disabled prop", <Button disabled>Disabled Button</Button>),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Blue Button", "Button with ButtonType.Blue", <Button buttonType={ButtonType.Blue}>Blue Button</Button>),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Hollow Button", "Button with ButtonType.Hollow", <Button buttonType={ButtonType.Hollow}>Hollow Button</Button>),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Large Basic Button", "Primary Button with size={ButtonSize.Large}", <Button size={ButtonSize.Large}>Primary Button</Button>),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Large Disabled Button", "Button with disabled and size={ButtonSize.Large} props", <Button disabled size={ButtonSize.Large}>Disabled Button</Button>),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Large Blue Button", "Button with ButtonType.Blue and size={ButtonSize.Large}", <Button buttonType={ButtonType.Blue} size={ButtonSize.Large}>Blue Button</Button>),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Large Hollow Button", "Button with ButtonType.Hollow and size={ButtonSize.Large}", <Button buttonType={ButtonType.Hollow} size={ButtonSize.Large}>Hollow Button</Button>),
        createComponentExample("Underlined Button", "UnderlinedButton component",
          <UnderlinedButton
            onActivate={() => Logger.logInfo(SampleAppIModelApp.loggerCategory(this), `UnderlinedButton activated`)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              Logger.logInfo(SampleAppIModelApp.loggerCategory(this), `UnderlinedButton clicked`);
            }}>
            Underlined Button
          </UnderlinedButton>),
      ],
    };
  }

  private static get checkListBoxSamples(): ComponentExampleCategory {
    return {
      title: "CheckListBox",
      examples: [
        createComponentExample("CheckListBox", undefined,
          <CheckListBox>
            <CheckListBoxItem label="Item 1" />
            <CheckListBoxItem label="Item 2" />
            <CheckListBoxItem label="Item 3" />
          </CheckListBox>),
        createComponentExample("CheckListBox with separator", undefined,
          <CheckListBox>
            <CheckListBoxItem label="Item 1" />
            <CheckListBoxItem label="Item 2" />
            <CheckListBoxSeparator />
            <CheckListBoxItem label="Item 3" />
            <CheckListBoxItem label="Item 4" />
          </CheckListBox>),
      ],
    };
  }

  private static get colorSamples(): ComponentExampleCategory {
    const colorDef = ColorDef.blue;
    const handleColorPick = (color: ColorDef) => {
      console.log(`color picked: ${color.toRgbaString()}`);
    };

    const onPopupClose = (color: ColorDef) => {
      const msg = `popup color value: ${color.toRgbaString()}`;
      console.log(msg);
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
    };

    return {
      title: "Color Controls",
      examples: [
        createComponentExample("Color Swatch", undefined,
          <ColorSwatch colorDef={colorDef} onColorPick={handleColorPick} />),
        createComponentExample("Color Picker Button", undefined,
          <ColorPickerButton initialColor={colorDef} onColorPick={handleColorPick} />),
        createComponentExample("Color Picker Button", "with Caret",
          <ColorPickerButton initialColor={colorDef} onColorPick={handleColorPick} showCaret />),
        createComponentExample("Color Picker Button", "disabled with Caret",
          <ColorPickerButton initialColor={colorDef} onColorPick={handleColorPick} disabled showCaret />),
        createComponentExample("Color Picker Button", "Round with Caret",
          <ColorPickerButton initialColor={colorDef} onColorPick={handleColorPick} round showCaret />),
        createComponentExample("Color Picker Dialog", undefined, <ColorPickerToggle />),
        createComponentExample("Color Picker Popup", undefined, <ColorPickerPopup initialColor={colorDef} onClose={onPopupClose} />),
        createComponentExample("Color Picker Popup", "with Caret", <ColorPickerPopup initialColor={colorDef} onClose={onPopupClose} showCaret />),
        createComponentExample("Color Picker Popup", "disabled with Caret", <ColorPickerPopup initialColor={colorDef} onClose={onPopupClose} disabled showCaret />),
      ],
    };
  }

  private static get weightSamples(): ComponentExampleCategory {
    const handleWeightPick = (weight: number) => {
      const msg = `weight picked: ${weight}`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
    };

    return {
      title: "Weight Controls",
      examples: [
        createComponentExample("Weight Swatch 1", undefined,
          <LineWeightSwatch weight={1} style={{ width: "100px" }} onClick={() => handleWeightPick(1)} />),
        createComponentExample("Weight Swatch 5", undefined,
          <LineWeightSwatch weight={5} style={{ width: "100px" }} onClick={() => handleWeightPick(5)} />),
        createComponentExample("Weight Picker Button", undefined,
          <WeightPickerHost activeWeight={3} onLineWeightPick={handleWeightPick} />),
      ],
    };
  }

  private static get datePickerSample(): ComponentExampleCategory {
    const londonDate = adjustDateToTimezone(new Date(), 1 * 60);
    const laDate = adjustDateToTimezone(new Date(), -7 * 60);
    // example showing converting to UTC time and using that to format.
    const msPerHour = 60 * 60 * 1000;
    const tzOffset = -4; // this should be similar to Math.floor(.5 + location.longitudeDegrees / 15.0);
    const tzOffsetMs = tzOffset * msPerHour; // offset to project
    const projectSunrise = new Date(Date.UTC(1999, 3, 15, 7, 30) + tzOffsetMs); // this should be same as time returned from calculateSunriseOrSunset
    const projectSunset = new Date(Date.UTC(1999, 3, 15, 20, 30) + tzOffsetMs); // this should be same as time returned from calculateSunriseOrSunset
    const projectSunriseMs = projectSunrise.getTime();
    const projectSunsetMs = projectSunset.getTime();
    const projectSunTimeMs = Date.UTC(1999, 3, 15, 9, 30) + tzOffsetMs;  // this should be same as displayStyle.settings.sunTime
    const dateFormatter = new Intl.DateTimeFormat("default", { month: "numeric", day: "numeric", timeZone: "UTC" } as any);
    const timeFormatter = new Intl.DateTimeFormat("default", { timeStyle: "short", timeZone: "UTC" } as any);
    const monthLetterFormatter = new Intl.DateTimeFormat("default", { month: "narrow", timeZone: "UTC" } as any);
    const projectDate = dateFormatter.format(new Date(projectSunriseMs - tzOffsetMs));
    const projectSunriseTime = timeFormatter.format(new Date(projectSunriseMs - tzOffsetMs));
    const projectSunsetTime = timeFormatter.format(new Date(projectSunsetMs - tzOffsetMs));
    const projectSunTime = timeFormatter.format(new Date(projectSunTimeMs - tzOffsetMs));
    const month = monthLetterFormatter.format(new Date(projectSunriseMs - tzOffsetMs));

    return {
      title: "DatePicker",
      examples: [
        createComponentExample("Date Picker Popup", undefined, <DatePickerHost selected={new Date()} />),
        createComponentExample("Date Picker Popup w/input", undefined, <DatePickerHost selected={new Date()} displayEditField={true} />),
        createComponentExample("Date Picker Popup w/input & 12h time", undefined, <DatePickerHost selected={new Date()} displayEditField={true} timeDisplay={TimeDisplay.H12MC} />),
        createComponentExample("Date Picker Popup w/input & 24h time", undefined, <DatePickerHost selected={new Date()} displayEditField={true} timeDisplay={TimeDisplay.H24MS} />),
        createComponentExample("Date Picker Popup w/London date & time", undefined, <DatePickerHost selected={londonDate} displayEditField={true} timeDisplay={TimeDisplay.H12MSC} />),
        createComponentExample("Date Picker Popup w/LA date & time", undefined, <DatePickerHost selected={laDate} displayEditField={true} timeDisplay={TimeDisplay.H12MSC} />),
        createComponentExample("Date Picker Popup w/custom formatter", undefined, <DatePickerHost selected={new Date()} displayEditField={true} dateFormatter={new IntlFormatter(customDayFormatter)} />),
        createComponentExample("Date Picker Popup w/IntlFormatter", undefined, <DatePickerHost fieldStyle={{ width: "16em" }} selected={new Date()} displayEditField={true} timeDisplay={TimeDisplay.H12MSC} dateFormatter={new IntlFormatter()} />),
        createComponentExample("Date Picker Popup w/MDY Formatter", undefined, <DatePickerHost selected={new Date()} displayEditField={true} timeDisplay={TimeDisplay.H12MSC} dateFormatter={new MdyFormatter()} />),
        createComponentExample("Date Formatting", undefined,
          <div className="component-examples-date-sample">
            <span>{`date: ${projectDate}`}</span>
            <span>{`monthLetter: ${month}`}</span>
            <span>{`sunrise: ${projectSunriseTime}`}</span>
            <span>{`sun time: ${projectSunTime}`}</span>
            <span>{`sunset: ${projectSunsetTime}`}</span>
          </div>),
      ],
    };
  }

  private static get contextMenuSample(): ComponentExampleCategory {
    return {
      title: "ContextMenu",
      examples: [
        createComponentExample("ContextMenu", undefined, <UnderlinedButton onActivate={() => SampleContextMenu.showContextMenu()}> Open ContextMenu</UnderlinedButton>),
        createComponentExample("Popup with ContextMenu", undefined, <SamplePopupContextMenu />),
      ],
    };
  }

  private static get expandableListBlockSamples(): ComponentExampleCategory {
    return {
      title: "ExpandableList/Block",
      examples: [
        createComponentExample("ExpandableList", "ExpandableList with one ExpandableBlock",
          <ExpandableList className="uicore-full-width">
            <SampleExpandableBlock title="Test" isExpanded={true} onClick={() => { }}>
              Hello World!
            </SampleExpandableBlock>
          </ExpandableList>),
        createComponentExample("ExpandableList", "ExpandableList with 3 ExpandableBlocks",
          <ExpandableList className="uicore-full-width">
            <SampleExpandableBlock title="Test1" isExpanded={false} onClick={() => { }}>
              Hello World 1
            </SampleExpandableBlock>
            <SampleExpandableBlock title="Test2" isExpanded={false} onClick={() => { }}>
              Hello World 2
            </SampleExpandableBlock>
            <SampleExpandableBlock title="Test3" isExpanded={false} onClick={() => { }}>
              Hello World 3
            </SampleExpandableBlock>
          </ExpandableList>),
        createComponentExample("ExpandableList w/ singleExpandOnly", "ExpandableList with singleExpandOnly prop",
          <ExpandableList className="uicore-full-width" singleExpandOnly={true} defaultActiveBlock={0}>
            <ExpandableBlock title="Test1" isExpanded={false} >
              Hello World 1
            </ExpandableBlock>
            <ExpandableBlock title="Test2" isExpanded={false} >
              Hello World 2
            </ExpandableBlock>
            <ExpandableBlock title="Test3" isExpanded={false} >
              Hello World 3
            </ExpandableBlock>
          </ExpandableList>),
        createComponentExample("ExpandableList w/ singleIsCollapsible", "ExpandableList with singleIsCollapsible prop",
          <ExpandableList className="uicore-full-width" singleExpandOnly={true} singleIsCollapsible={true} defaultActiveBlock={0}>
            <ExpandableBlock title="Test1" isExpanded={false} >
              Hello World 1
            </ExpandableBlock>
            <ExpandableBlock title="Test2" isExpanded={false} >
              Hello World 2
            </ExpandableBlock>
            <ExpandableBlock title="Test3" isExpanded={false} >
              Hello World 3
            </ExpandableBlock>
          </ExpandableList>),
      ],
    };
  }

  private static get tableSamples(): ComponentExampleCategory {
    const testRecord = (valueString: string): PropertyRecord => {
      const value: PropertyValue = {
        value: valueString,
        displayValue: valueString,
        valueFormat: PropertyValueFormat.Primitive,
      };
      const description: PropertyDescription = {
        name: "1",
        typename: "text",
        displayLabel: "column",
      };
      return new PropertyRecord(value, description);
    };

    const rowData = [
      {
        key: "row1",
        cells: [
          { key: "1", record: testRecord("Cell 1-1 text") },
          { key: "2", record: testRecord("Cell 1-2 text") },
          { key: "3", record: testRecord("Cell 1-3 text") },
          { key: "4", record: testRecord("Cell 1-4 text") }],
      },
      {
        key: "row2",
        cells: [
          { key: "1", record: testRecord("Cell 2-1 text") },
          { key: "2", record: testRecord("Text in the merged cells (2-2, 2-3)"), mergedCellsCount: 2, alignment: HorizontalAlignment.Center },
          { key: "3", record: testRecord("") },
          { key: "4", record: testRecord("Cell 2-4 text") }],
      },
      {
        key: "row3",
        cells: [
          { key: "1", record: testRecord("Cell 3-1 text") },
          { key: "2", record: testRecord("Cell 3-2 text") },
          { key: "3", record: testRecord("Cell 3-3 text") },
          { key: "4", record: testRecord("Cell 3-4 text") }],
      },
    ];
    const onColumnsChanged = new TableDataChangeEvent();
    const onRowsChanged = new TableDataChangeEvent();
    const dataProvider: TableDataProvider = {
      getColumns: async (): Promise<ColumnDescription[]> => [
        { key: "1", label: "Column1", resizable: true },
        { key: "2", label: "Column2", resizable: true },
        { key: "3", label: "Column3", resizable: true },
        { key: "4", label: "Column4", resizable: true }],
      getRowsCount: async () => rowData.length,
      getRow: async (index: number) => rowData[index],
      sort: async () => { },
      onColumnsChanged,
      onRowsChanged,
    };

    return {
      title: "Tables",
      examples: [
        createComponentExample("Basic Table", "Table with merged cells",
          <div style={{ height: "115px", width: "100%" }}> <Table dataProvider={dataProvider} /></div>),
        createComponentExample("Table w/options", "Table with filters and edit cells",
          <div style={{ height: "360px", width: "100%" }}><TableExampleContent /></div>),
      ],
    };
  }

  private static get inputsSamples(): ComponentExampleCategory {
    return {
      title: "Inputs",
      examples: [
        createComponentExample("Basic Input", "Input with placeholder", <Input placeholder="Basic Input" />),
        createComponentExample("Disabled Input", "Input with disabled prop", <Input placeholder="Disabled Input" disabled />),

        createComponentExample("Check Box", "Basic Check Box", <Checkbox label="Basic Check Box" />),
        createComponentExample("Check Box Set", "Set of Check Boxes",
          <div>
            <Checkbox label="First" />
            <Checkbox label="Success" status={InputStatus.Success} />
            <Checkbox label="Warning" status={InputStatus.Warning} />
            <Checkbox label="Error" status={InputStatus.Error} />
          </div>),
        createComponentExample("Disabled Check Box", "Check Box with disabled prop", <Checkbox label="Disabled Check Box" disabled />),
        createComponentExample("Indeterminate Check Box", "Check Box with indeterminate prop", <Checkbox label="Indeterminate Check Box" indeterminate />),
        createComponentExample("Check Box with text after", "Check Box with <label> after", <div><Checkbox id="cb1" />&nbsp;&nbsp;<label htmlFor="cb1">This is text in a span</label></div>),

        createComponentExample("Radio Button", "Basic Radio Buttons",
          <div>
            <Radio label="Radio Button 1" name="demo1" value="option-1" />
            <Radio label="Radio Button 2" name="demo1" value="option-2" />
            <Radio label="Radio Button 3" name="demo1" value="option-3" />
          </div>),
        createComponentExample("Disabled Radio Button", "Radio Button with disabled prop", <Radio label="Disabled Radio Button" name="demo1" disabled />),

        createComponentExample("Basic Textarea", "Textarea with placeholder", <Textarea placeholder="Basic Textarea" />),
        createComponentExample("Disabled Textarea", "Textarea with disabled prop", <Textarea placeholder="Disabled Textarea" disabled />),

        createComponentExample("Number Input .25 step", "New Numeric Input component", <NumberInput value={10.5} precision={2} step={0.25} containerClassName="uicore-full-width" />),
        createComponentExample("Number Input .25 step w/snap", "New Numeric Input component", <NumberInput value={10.5} precision={2} step={0.25} snap containerClassName="uicore-full-width" />),
        createComponentExample("Number Input .25 step w/snap custom format and parser", "New Numeric Input component", <NumberInput value={10.5} format={formatDollar} parse={parseDollar} precision={2} step={0.25} snap containerClassName="uicore-full-width" />),
        createComponentExample("Number Input w/touch buttons", "New Numeric Input component", <NumberInput value={10.5} precision={2} step={.5} snap showTouchButtons containerClassName="uicore-full-width" />),
        createComponentExample("Number Input w/snap  & custom step", "New Numeric Input component", <NumberInput value={10.5} precision={2} step={exoticStep} snap containerClassName="uicore-full-width" />),
        createComponentExample("Number Input w/placeholder", "New Numeric Input component", <NumberInput placeholder="Enter Input" precision={2} step={0.25} containerClassName="uicore-full-width" />),
        createComponentExample("Icon Input", "Icon Input component", <IconInput placeholder="Icon Input" icon={<Icon iconSpec="icon-placeholder" />} containerClassName="uicore-full-width" />),
        createComponentExample("Labeled Input", "Labeled Input component", <LabeledInput label="Labeled Input" placeholder="Labeled Input" className="uicore-full-width" />),
        createComponentExample("Labeled Input", "Labeled Input Icon", <LabeledInput label="Labeled Input with icon" placeholder="Labeled Input with Icon" status={InputStatus.Success} />),
        createComponentExample("Labeled Input Warning", "Labeled Input Warning", <LabeledInput label="Labeled Input Warning" placeholder="Labeled Input Warning" status={InputStatus.Warning} />),
        createComponentExample("Labeled Input Error", "Labeled Input Error", <LabeledInput label="Labeled Input Error" placeholder="Labeled Input Error" status={InputStatus.Error} />),
        createComponentExample("Labeled Textarea", "Labeled Textarea component", <LabeledTextarea label="Labeled Textarea" placeholder="Labeled Textarea" className="uicore-full-width" />),

        createComponentExample("Image Checkbox", "ImageCheckbox with WebFonts", <SampleImageCheckBox imageOn="icon-more-circular" imageOff="icon-more-vertical-circular" />),
        createComponentExample("Image Checkbox", "ImageCheckbox with SVG fonts", <SampleImageCheckBox imageOn={IconSpecUtilities.createSvgIconSpec(moreSvg)} imageOff={IconSpecUtilities.createSvgIconSpec(moreVerticalSvg)} />),

        createComponentExample("Input Described By", "Input with aria-describedby",
          <div>
            <label htmlFor="phone">Phone</label>
            <Input id="phone" name="phone" type="tel"
              pattern="^(\(?0[1-9]{1}\)?)?[0-9 -]*$"
              aria-describedby="phone-desc" />
            <p id="phone-desc">For example, (02) 1234 1234</p>
          </div>),
      ],
    };
  }

  private static get loadingSamples(): ComponentExampleCategory {
    return {
      title: "Loading",
      examples: [
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("Small Spinner", undefined, <Spinner size={SpinnerSize.Small} />),
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("Medium Spinner", undefined, <Spinner size={SpinnerSize.Medium} />),
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("Large Spinner", undefined, <Spinner size={SpinnerSize.Large} />),
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("XLarge Spinner", undefined, <Spinner size={SpinnerSize.XLarge} />),
        createComponentExample("X-Small LoadingSpinner", undefined, <LoadingSpinner size="x-small" message="This is a X-Small LoadingSpinner" />),
        createComponentExample("Small LoadingSpinner", undefined, <LoadingSpinner size="small" message="This is a Small LoadingSpinner" />),
        createComponentExample("Medium LoadingSpinner", undefined, <LoadingSpinner size="" message="This is a Medium LoadingSpinner" />),
        createComponentExample("Large LoadingSpinner", undefined, <LoadingSpinner size="large" message="This is a Large LoadingSpinner" />),
        createComponentExample("LoadingStatus", undefined, <LoadingStatus message="Loading status..." percent={50} />),
        createComponentExample("Basic LoadingPrompt", undefined, <LoadingPrompt title="Title" />),
        createComponentExample("LoadingPrompt with message", undefined, <LoadingPrompt title="Title" message="This is the message" />),
        createComponentExample("LoadingPrompt with Indeterminate Bar", undefined,
          <LoadingPrompt style={{ width: "100%" }} title="Title" message="This is the message" showIndeterminateBar />),
        createComponentExample("Determinate LoadingPrompt with percent", undefined,
          <LoadingPrompt title="Title" message="This is the message" isDeterminate={true} percent={50} />),
        createComponentExample("Determinate LoadingPrompt with cancel", undefined,
          <LoadingPrompt title="Title" message="This is the message" isDeterminate={true} percent={50} showCancel={true} />),
        createComponentExample("Determinate LoadingPrompt with status", undefined,
          <LoadingPrompt title="Title" message="This is the message" isDeterminate={true} showStatus={true} percent={50} status="Updating..." />),
      ],
    };
  }

  private static get _reactMessage(): ReactMessage {
    const reactNode = (
      <span>
        For more details, <UnderlinedButton onClick={() => { }}>click here</UnderlinedButton>.
      </span >
    );
    return ({ reactNode });
  }

  /** Tool that will start a sample activity and display ActivityMessage.
   */
  private static _activityTool = async () => {
    let isCancelled = false;
    let progress = 0;

    const details = new ActivityMessageDetails(true, true, true, true);
    details.onActivityCancelled = () => {
      isCancelled = true;
    };
    IModelApp.notifications.setupActivityMessage(details);

    while (!isCancelled && progress <= 100) {
      IModelApp.notifications.outputActivityMessage("This is a sample activity message", progress);
      await BeDuration.wait(100);
      progress++;
    }

    const endReason = isCancelled ? ActivityMessageEndReason.Cancelled : ActivityMessageEndReason.Completed;
    IModelApp.notifications.endActivityMessage(endReason);
  };

  private static get messageSamples(): ComponentExampleCategory {
    return {
      title: "Messages",
      examples: [
        createComponentExample("Toast", undefined,
          <UnderlinedButton onActivate={
            () => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "This is an info message", undefined, OutputMessageType.Toast))
          }>Toast message</UnderlinedButton>),
        createComponentExample("Toast with link", undefined,
          <UnderlinedButton onActivate={
            () => MessageManager.outputMessage(new ReactNotifyMessageDetails(OutputMessagePriority.Info, "This is an info message", this._reactMessage)
            )}>Toast with link</UnderlinedButton>),
        createComponentExample("Sticky", undefined,
          <UnderlinedButton onActivate={
            () => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, "This is a warning message", undefined, OutputMessageType.Sticky))
          }>Sticky message</UnderlinedButton>),
        createComponentExample("Activity", undefined,
          <UnderlinedButton onActivate={this._activityTool}>Activity message</UnderlinedButton>),
      ],
    };
  }

  private static get popupSamples(): ComponentExampleCategory {
    return {
      title: "Popups",
      examples: [
        createComponentExample("Allow Nested Popup", "Remain open when clicking in nested popup", <NestedPopup />),
        createComponentExample("Close Nested Popup", "Close when clicking in nested popup", <NestedPopup closeOnNestedPopupOutsideClick={true} />),
      ],
    };
  }

  private static get progressIndicatorsSamples(): ComponentExampleCategory {
    return {
      title: "Progress Indicators",
      examples: [
        createComponentExample("ProgressBar", "at 50%", <ProgressBar percent={50} />),
        createComponentExample("ProgressBar with height", "height of 8", <ProgressBar percent={50} barHeight={8} />),
        createComponentExample("Indeterminate ProgressBar", "indeterminate prop", <ProgressBar indeterminate />),
        createComponentExample("ProgressBar with label", "labelLeft prop", <ProgressBar percent={25} labelLeft="Centered Label" />),
        createComponentExample("ProgressBar with labels", "labelLeft & labelRight props", <ProgressBar percent={75} labelLeft="Loading..." labelRight="75%" />),
        createComponentExample("ProgressSpinner", "at 50%", <ProgressSpinner value={50} />),
        createComponentExample("Indeterminate ProgressSpinner", "indeterminate prop", <ProgressSpinner indeterminate />),
        createComponentExample("Success ProgressSpinner", "success prop", <ProgressSpinner success />),
        createComponentExample("Error ProgressSpinner", "error prop", <ProgressSpinner error />),
        createComponentExample("ProgressSpinner with value", "display value of 63", <ProgressSpinner value={63}>63</ProgressSpinner>),
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("ProgressSpinner Small", "width/height of 16", <ProgressSpinner indeterminate size={SpinnerSize.Small} />),
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("ProgressSpinner Medium", "width/height of 32", <ProgressSpinner indeterminate size={SpinnerSize.Medium} />),
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("ProgressSpinner Large", "width/height of 64", <ProgressSpinner indeterminate size={SpinnerSize.Large} />),
        /* eslint-disable-next-line deprecation/deprecation */
        createComponentExample("ProgressSpinner XLarge", "width/height of 96", <ProgressSpinner indeterminate size={SpinnerSize.XLarge} />),
        createComponentExample("ProgressSpinner with style", "width/height of 120",
          <div><ProgressSpinner indeterminate style={{ display: "inline-block", width: 120, height: 120 }} />... Loading</div>),
      ],
    };
  }

  private static get quantitySamples(): ComponentExampleCategory {
    const onLengthChange = (value: number) => {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Length value set to ${value}`));
      console.log(`Length value set to: ${value}`);
    };
    const onAngleChange = (value: number) => {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Angle value set to ${value}`));
      console.log(`Angle value set to: ${value}`);
    };
    const onVolumeChange = (value: number) => {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Volume value set to ${value}`));
      console.log(`Volume value set to: ${value}`);
    };
    const onTemperatureChange = (value: number) => {
      if (typeof value === "number") {
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Temperature value set to ${value} C`));
        console.log(`Temperature value set to ${value} C`);
      }
    };

    const initialLength = 3.5; // meters
    const initialAngle = Math.PI / 4; // radians
    const initialVolume = 1.0; // meters^3
    const initialTemperature = 20; // 20 Celsius
    return {
      title: "Quantity Input",
      examples: [
        createComponentExample("Length", undefined,
          <QuantityInput initialValue={initialLength} quantityType={QuantityType.Length} onQuantityChange={onLengthChange} />),
        createComponentExample("Angle", undefined,
          <QuantityInput initialValue={initialAngle} quantityType={QuantityType.Angle} onQuantityChange={onAngleChange} />),
        createComponentExample("Bearing", undefined,
          <QuantityInput initialValue={initialAngle} quantityType={"Bearing"} onQuantityChange={onAngleChange} />),
        createComponentExample("Volume", undefined,
          <QuantityInput initialValue={initialVolume} quantityType={QuantityType.Volume} onQuantityChange={onVolumeChange} />),
        createComponentExample("Temperature (Custom)", undefined,
          <ParsedInput onChange={onTemperatureChange} initialValue={initialTemperature} formatValue={formatCelsiusValue} parseString={parseStringToCelsius} />),
        createComponentExample("Quantity Number Input", "QuantityType.Length",
          <QuantityNumberInput style={{ width: "140px" }} persistenceValue={initialLength} step={0.25} snap quantityType={QuantityType.Length} onChange={onLengthChange} />),
        createComponentExample("Quantity Number Input", "QuantityType.LengthEngineering",
          <QuantityNumberInput style={{ width: "140px" }} placeholder={"Specify Length"} step={0.25} snap quantityType={QuantityType.LengthEngineering} onChange={onLengthChange} />),
        createComponentExample("Quantity Number Input", "QuantityType.Angle",
          <QuantityNumberInput style={{ width: "140px" }} persistenceValue={initialAngle} step={0.5} snap quantityType={QuantityType.Angle} onChange={onAngleChange} />),
        createComponentExample("Quantity Number Input", "QuantityType.Volume",
          <QuantityNumberInput showTouchButtons persistenceValue={initialVolume} step={0.5} snap quantityType={QuantityType.Volume} onChange={onVolumeChange} />),
      ],
    };
  }

  private static get searchBoxSample(): ComponentExampleCategory {
    return {
      title: "SearchBox",
      examples: [
        createComponentExample("SearchBox", undefined,
          // eslint-disable-next-line no-console
          <SearchBox placeholder="Search" onValueChanged={(value: string) => console.log(`Search text: ${value}`)} />),
        createComponentExample("SearchBoxWithDelay", undefined,
          // eslint-disable-next-line no-console
          <SearchBox placeholder="Search" valueChangedDelay={1000} onValueChanged={(value: string) => console.log(`Search text: ${value}`)} />),
      ],
    };
  }

  private static get selectSamples(): ComponentExampleCategory {
    enum ColorOptions {
      Red,
      White,
      Blue,
      Yellow,
      Orange,
    }

    const colorChoices = [
      { label: "Red", value: ColorOptions.Red },
      { label: "White", value: ColorOptions.White },
      { label: "Blue", value: ColorOptions.Blue },
      { label: "Yellow", value: ColorOptions.Yellow },
      { label: "Orange", value: ColorOptions.Orange },
    ];

    const cityChoices = [
      { label: "London", value: "London" },
      { label: "Paris", value: "Paris" },
      { label: "Stockholm", value: "Stockholm" },
      { label: "Berlin", value: "Berlin" },
      { label: "Mumbai", value: "Mumbai" },
      { label: "Christchurch", value: "Christchurch" },
      { label: "Johannesburg", value: "Johannesburg" },
      { label: "Beijing", value: "Beijing" },
      { label: "New York", value: "New York" },
    ];

    return {
      title: "Select",
      examples: [
        createComponentExample("Basic Select", "Basic Select component",
          <Select
            onChange={(event) => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, event.target.value))}
            options={["Option 1", "Option 2", "Option 3", "Option 4"]} />),
        createComponentExample("Select with values", "Select with values in array",
          <Select
            onChange={(event) => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, event.target.value))}
            options={[
              { label: "Option 1", value: "option1" },
              { label: "Option 2", value: "option2" },
              { label: "Option 3", value: "option3" },
              { label: "Option 4", value: "option4" },
            ]} />),
        createComponentExample("Select with values/labels", "Select with value objects",
          <Select
            onChange={(event) => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, event.target.value))}
            options={{
              option1: { label: "Option 1", value: "xyz" },
              option2: "Option 2",
              option3: "Option 3",
              option4: "Option 4",
            }} />),
        createComponentExample("Select with Number values", "Sync Select with button values", <WrappedSelect />),
        createComponentExample("Disabled Select", "Select with disabled prop", <Select options={["Option 1", "Option 2", "Option 3", "Option 4"]} disabled />),
        createComponentExample("Placeholder Select", "Select with placeholder prop", <Select options={["Option 1", "Option 2", "Option 3", "Option 4"]} placeholder="Pick an option" />),
        createComponentExample("Select with Disabled option", "Select with option with disabled prop",
          <Select options={["Option 1", "Option 2", { label: "Disabled Option", disabled: true }, "Option 3", "Option 4"]} placeholder="Pick an option" />),

        createComponentExample("Labeled Select", "Labeled Select component", <LabeledSelect label="Labeled Select" options={["Option 1", "Option 2", "Option 3", "Option 4"]} />),

        createComponentExample("ThemedSelect", "ThemedSelect component for colors",
          <div className="uicore-full-width">
            <ThemedSelect options={colorChoices} />
          </div>),
        createComponentExample("Multi ThemedSelect", "ThemedSelect component with isMulti",
          <div className="uicore-full-width">
            <ThemedSelect isMulti={true} isSearchable={true} options={cityChoices} />
          </div>),
        createComponentExample("Disabled ThemedSelect", "ThemedSelect component with isDisabled prop",
          <div className="uicore-full-width">
            <ThemedSelect options={colorChoices} isDisabled />
          </div>),
        createComponentExample("Labeled Multi ThemedSelect", "Labeled ThemedSelect component with isMulti",
          <div className="uicore-full-width">
            <LabeledThemedSelect label={"Labeled ThemedSelect Multi"} isMulti={true} isSearchable={true} options={cityChoices} />
          </div>),
        createComponentExample("Disabled Labeled Multi ThemedSelect", "Labeled ThemedSelect component with isMulti",
          <div className="uicore-full-width">
            <LabeledThemedSelect label={"Disabled Labeled ThemedSelect Multi"} isMulti={true} isSearchable={true} options={cityChoices} isDisabled={true} />
          </div>),
        createComponentExample("Labeled ThemedSelect", "Labeled ThemedSelect component",
          <div className="uicore-full-width">
            <LabeledThemedSelect label={"Labeled ThemedSelect"} options={colorChoices} />
          </div>),
        createComponentExample("Disabled Labeled ThemedSelect", "Labeled ThemedSelect component with isDisabled prop and message prop",
          <div className="uicore-full-width">
            <LabeledThemedSelect label={"Disabled Labeled ThemedSelect"} message={"This field is disabled"} options={colorChoices} isDisabled />
          </div>),

      ],
    };
  }

  private static get sliderSamples(): ComponentExampleCategory {
    return {
      title: "Slider",
      examples: [
        createComponentExample("Slider", "Basic Slider",
          <Slider min={0} max={100} values={[50]} step={1} showTooltip />),
        createComponentExample("Slider w/ tooltipBelow", "Slider with Tooltip Below",
          <Slider min={0} max={100} values={[50]} step={1} showTooltip tooltipBelow />),
        createComponentExample("Slider w/ min/max", "Slider with showMinMax prop",
          <Slider min={0} max={100} values={[50]} step={1} showTooltip showMinMax />),
        createComponentExample("Slider w/ min/max", "Slider with formatMax prop",
          <Slider min={0} max={1} values={[0.5]} step={0.01} showTooltip showMinMax formatMax={(v: number) => v.toFixed(1)} />),
        createComponentExample("Slider w/ min/max images", "Slider with minImage and maxImage props",
          <Slider min={0} max={100} values={[50]} step={1} showTooltip showMinMax
            minImage={<Icon iconSpec="icon-placeholder" />} maxImage={<Icon iconSpec="icon-placeholder" />} />),
        createComponentExample("Slider w/ tick marks", "Slider with showTicks and getTickCount props",
          <Slider min={0} max={5} values={[2.25]} step={.01} showTooltip showMinMax
            showTicks getTickCount={() => 10} />),
        createComponentExample("Slider w/ multiple values", "Slider with array of values",
          <Slider min={0} max={100} values={[30, 70]} step={5} mode={2} showTooltip showMinMax
            showTicks getTickCount={() => 10} />),
        createComponentExample("Slider multiple values tooltipBelow", "Slider with multiple values & tooltip below",
          <Slider min={0} max={100} values={[20, 80]} step={5} mode={2} showTooltip tooltipBelow showMinMax
            showTicks getTickCount={() => 10} />),
        createComponentExample("Slider w/ tick labels", "Slider with showTickLabels prop",
          <Slider min={0} max={100} values={[50]} step={1} showTooltip showMinMax showTickLabels
            showTicks getTickCount={() => 10} />),
        createComponentExample("Disabled Slider", "Slider with disabled prop",
          <Slider min={0} max={100} values={[50]} step={1} showTooltip showMinMax showTickLabels disabled
            showTicks getTickCount={() => 10} />),
      ],
    };
  }

  private static get splitButtonSamples(): ComponentExampleCategory {
    return {
      title: "SplitButton",
      examples: [
        createComponentExample("Basic SplitButton", "Basic SplitButton",
          <SplitButton label="Split Button" onClick={() => { }}>
            {this.splitButtonMenuItems.map((node) => node)}
          </SplitButton>),
        createComponentExample("SplitButton with border", "SplitButton with drawBorder prop",
          <SplitButton label="Split Button" drawBorder icon="icon-placeholder" onClick={() => { }}>
            {this.splitButtonMenuItems.map((node) => node)}
          </SplitButton>),
        createComponentExample("SplitButton with width", "SplitButton with width style",
          <SplitButton label="Split Button" drawBorder icon="icon-placeholder" onClick={() => { }} style={{ width: "200px" }}>
            {this.splitButtonMenuItems.map((node) => node)}
          </SplitButton>),
        createComponentExample("SplitButton with popupPosition", "SplitButton with RelativePosition.BottomRight popupPosition prop",
          <SplitButton label="Split Button" drawBorder icon="icon-placeholder" onClick={() => { }} popupPosition={RelativePosition.BottomRight}>
            {this.splitButtonMenuItems.map((node) => node)}
          </SplitButton>),
        createComponentExample("SplitButton with Blue buttonType", "SplitButton with buttonType={ButtonType.Blue} prop",
          // eslint-disable-next-line deprecation/deprecation
          <SplitButton label="Split Button" drawBorder icon="icon-placeholder" onClick={() => { }} buttonType={ButtonType.Blue}>
            {this.splitButtonMenuItems.map((node) => node)}
          </SplitButton>),
        createComponentExample("SplitButton with Primary buttonType", "SplitButton with buttonType={ButtonType.Primary} prop",
          // eslint-disable-next-line deprecation/deprecation
          <SplitButton label="Split Button" drawBorder icon="icon-placeholder" onClick={() => { }} buttonType={ButtonType.Primary}>
            {this.splitButtonMenuItems.map((node) => node)}
          </SplitButton>),
      ],
    };
  }

  private static get splitButtonMenuItems(): React.ReactNode[] {
    return [
      <ContextMenuItem key="item1" icon="icon-placeholder">Item 1</ContextMenuItem>,
      <ContextMenuItem key="item2" icon="icon-placeholder">Item 2</ContextMenuItem>,
      <ContextMenuItem key="item3" icon="icon-placeholder">Item 3</ContextMenuItem>,
    ];
  }

  private static get tabsSamples(): ComponentExampleCategory {
    return {
      title: "Tabs",
      examples: [
        createComponentExample("Horizontal Tabs", "full width",
          <div className="uicore-full-width">
            <HorizontalTabs className="component-examples-horizontal-tabs"
              labels={[
                { label: "Tab 1", tabId: "tab1", icon: "icon-placeholder", subLabel: "Sub-label 1" },
                { label: "Tab 2", tabId: "tab2", icon: "icon-placeholder", subLabel: "Sub-label 2" },
                { label: "Tab 3", tabId: "tab3", icon: "icon-placeholder", subLabel: "Sub-label 3" },
              ]}
              activeIndex={0} />
          </div>
        ),
        createComponentExample("Green Horizontal Tabs", "with green prop", <HorizontalTabs labels={["Tab 1", "Tab 2", "Tab 3"]} activeIndex={0} green />),
        createComponentExample("Horizontal Tabs", undefined,
          <HorizontalTabs className="component-examples-horizontal-tabs"
            labels={[
              { label: "Tab 1", tabId: "tab1", icon: "icon-placeholder", subLabel: "Sub-label 1" },
              { label: "Tab 2", tabId: "tab2", icon: "icon-placeholder", subLabel: "Sub-label 2" },
              { label: "Tab 3", tabId: "tab3", icon: "icon-placeholder", subLabel: "Sub-label 3", disabled: true },
            ]}
            activeIndex={0} />
        ),
        createComponentExample("Vertical Tabs", undefined, <VerticalTabs
          labels={[
            { label: "Tab 1", tabId: "tab1", icon: "icon-placeholder", subLabel: "Sub-label 1" },
            { label: "Tab 2", tabId: "tab2", icon: "icon-placeholder", subLabel: "Sub-label 2" },
            { label: "Tab 3", tabId: "tab3", icon: "icon-placeholder", subLabel: "Sub-label 3", disabled: true },
          ]}
          activeIndex={0} />),
        createComponentExample("Green Vertical Tabs", "with green prop", <VerticalTabs labels={["Tab 1", "Tab 2", "Tab 3"]} activeIndex={0} green />),
      ],
    };
  }

  private static get textSamples(): ComponentExampleCategory {
    return {
      title: "Text",
      examples: [
        createComponentExample("BodyText", undefined, <BodyText>This is Body Text</BodyText>),
        createComponentExample("BlockText", undefined, <BlockText>This is Block Text</BlockText>),
        createComponentExample("DisabledText", undefined, <DisabledText>This is Disabled Text</DisabledText>),
        createComponentExample("Headline", undefined, <Headline>This is Headline Text</Headline>),
        createComponentExample("LeadingText", undefined, <LeadingText>This is Leading Text</LeadingText>),
        createComponentExample("MutedText", undefined, <MutedText>This is Muted Text</MutedText>),
        createComponentExample("SmallText", undefined, <SmallText>This is Small Text</SmallText>),
        createComponentExample("Subheading", undefined, <Subheading>This is Subheading Text</Subheading>),
        createComponentExample("Title", undefined, <Title>This is Title Text</Title>),
      ],
    };
  }

  private static get tileSamples(): ComponentExampleCategory {
    return {
      title: "Tiles",
      examples: [
        createComponentExample("Normal Tile", undefined,
          <Tile title="Normal Tile" icon="icon-placeholder">
            <a>Link 1</a>
            <a>Link 2</a>
          </Tile>),
        createComponentExample("Featured Tile", undefined,
          <FeaturedTile title="Featured Tile" icon="icon-placeholder">
            <a>Link 1</a>
            <a>Link 2</a>
          </FeaturedTile>),
        createComponentExample("Minimal Tile", undefined, <MinimalTile title="Minimal Tile" icon="icon-placeholder" />),
        createComponentExample("Featured Minimal Tile", undefined, <MinimalFeaturedTile title="Minimal Featured Tile" icon="icon-placeholder" />),
        createComponentExample("Tile stepNum={0}", undefined, <MinimalFeaturedTile stepNum={0} title="Tile stepNum={0}" icon="icon-placeholder" />),
        createComponentExample("Tile stepNum={6}", undefined, <MinimalFeaturedTile stepNum={6} title="Tile stepNum={6}" icon="icon-placeholder" />),
        createComponentExample("Tile stepNum={9}", undefined, <MinimalFeaturedTile stepNum={9} title="Tile stepNum={9}" icon="icon-placeholder" />),
        createComponentExample("Tile stepNum={15}", undefined, <MinimalFeaturedTile stepNum={15} title="Tile stepNum={15}" icon="icon-placeholder" />),
      ],
    };
  }

  private static get toggleSamples(): ComponentExampleCategory {
    return {
      title: "Toggle",
      examples: [
        createComponentExample("Basic Toggle", undefined, <Toggle isOn={true} />),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Primary Toggle", "Toggle with buttonType={ToggleButtonType.Primary}", <Toggle isOn={true} buttonType={ToggleButtonType.Primary} />),
        createComponentExample("Large Toggle", "Toggle with large={true}", <Toggle isOn={true} large={true} />),
        createComponentExample("Square Toggle", "Toggle with rounded={false}", <Toggle isOn={true} rounded={false} />),
        createComponentExample("Toggle with Checkmark", "Toggle with showCheckmark prop", <Toggle isOn={true} showCheckmark={true} />),
        createComponentExample("Disabled Toggle", "Toggle with disabled prop", <Toggle isOn={true} showCheckmark={true} disabled />),
        createComponentExample("LabeledToggle", undefined, <LabeledToggle checked={true} label="Toggle label" />),
      ],
    };
  }

  private static get listboxSamples(): ComponentExampleCategory {
    const listItems = ["London", "Paris", "Stockholm", "Berlin", "Mumbai", "Christchurch", "Johannesburg", "Beijing", "New York"];

    return {
      title: "Listbox",
      examples: [
        createComponentExample("Basic Listbox", undefined,
          <Listbox id="map-sources" className="map-manager-source-list" selectedValue={listItems[1]}
            onKeyPress={(event: React.KeyboardEvent<HTMLUListElement>) => console.log(`item: ${event.currentTarget?.dataset?.value}`)} >
            {
              listItems?.map((cityName) =>
                <ListboxItem key={cityName} className="map-source-list-entry" value={cityName}>
                  <span className="map-source-list-entry-name" title={cityName}>{cityName}</span>
                </ListboxItem>)
            }
          </Listbox>),
        createComponentExample("Listbox with disabled entries", undefined,
          <Listbox id="map-sources" className="map-manager-source-list" selectedValue={listItems[1]}
            onKeyPress={(event: React.KeyboardEvent<HTMLUListElement>) => console.log(`item: ${event.currentTarget?.dataset?.value}`)} >
            {
              listItems?.map((cityName, index) =>
                <ListboxItem key={cityName} className="map-source-list-entry" value={cityName} disabled={0 === index % 2}>
                  <span className="map-source-list-entry-name" title={cityName}>{cityName}</span>
                </ListboxItem>)
            }
          </Listbox>),

      ],
    };
  }

  private static get deprecatedComponentSamples(): ComponentExampleCategory {
    return {
      title: "Deprecated Components",
      examples: [
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Numeric Input", "Numeric Input component", <NumericInput min={1} max={100} className="uicore-full-width" />),
        // eslint-disable-next-line deprecation/deprecation
        createComponentExample("Numeric Input w/precision", "Numeric Input component", <NumericInput placeholder="Enter Number" min={1} max={100} step={.5} precision={1} className="uicore-full-width" />),
      ],
    };
  }

  private static get quantityFormatting(): ComponentExampleCategory {
    const examples = [];
    examples.push(
      createComponentExample("Meter", "Non-composite Formatting", <NumericFormatPopup persistenceUnitName={"Units.M"} initialMagnitude={1234.56} />),
    );
    return {
      title: "Quantity Formatting Component",
      examples,
    };
  }

  private static get settingPage(): ComponentExampleCategory {
    const examples = [];
    examples.push(
      createComponentExample("Setting Page", undefined, <MySettingsPage />),
    );
    return {
      title: "Setting Page Component",
      examples,
    };
  }

  private static get timelineSamples(): ComponentExampleCategory {
    const examples = [];
    examples.push(
      createComponentExample("TimelineComponent", "With appended menu items", <ItemsAppendedSampleTimeline/> ),
      createComponentExample("TimelineComponent", "With prefixed menu items", <ItemsPrefixedSampleTimeline/> ),
      createComponentExample("TimelineComponent", "With menu items replaced", <ItemsReplacedSampleTimeline/> ),
      createComponentExample("TimelineComponent", "With no repeat option", <NoRepeatSampleTimeline/> ),
    );
    return {
      title: "Timelines",
      examples,
    };
  }
  public static get categories(): ComponentExampleCategory[] {
    return [
      ComponentExamplesProvider.autoSuggestSamples,
      ComponentExamplesProvider.badgeSamples,
      ComponentExamplesProvider.buttonSamples,
      ComponentExamplesProvider.checkListBoxSamples,
      ComponentExamplesProvider.colorSamples,
      ComponentExamplesProvider.contextMenuSample,
      ComponentExamplesProvider.datePickerSample,
      ComponentExamplesProvider.expandableListBlockSamples,
      ComponentExamplesProvider.inputsSamples,
      ComponentExamplesProvider.listboxSamples,
      ComponentExamplesProvider.loadingSamples,
      ComponentExamplesProvider.messageSamples,
      ComponentExamplesProvider.popupSamples,
      ComponentExamplesProvider.progressIndicatorsSamples,
      ComponentExamplesProvider.quantitySamples,
      ComponentExamplesProvider.searchBoxSample,
      ComponentExamplesProvider.selectSamples,
      ComponentExamplesProvider.sliderSamples,
      ComponentExamplesProvider.splitButtonSamples,
      ComponentExamplesProvider.tableSamples,
      ComponentExamplesProvider.tabsSamples,
      ComponentExamplesProvider.textSamples,
      ComponentExamplesProvider.tileSamples,
      ComponentExamplesProvider.timelineSamples,
      ComponentExamplesProvider.toggleSamples,
      ComponentExamplesProvider.weightSamples,
      ComponentExamplesProvider.quantityFormatting,
      ComponentExamplesProvider.settingPage,
      ComponentExamplesProvider.deprecatedComponentSamples,
    ];
  }
}
