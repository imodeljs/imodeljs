/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Settings
 */

import "./UiSettingsPage.scss";
import * as React from "react";
import { OptionType, SettingsTabEntry, Slider, ThemedSelect, Toggle } from "@bentley/ui-core";
import { UiFramework } from "../../UiFramework";
import { ColorTheme, SYSTEM_PREFERRED_COLOR_THEME } from "../../theme/ThemeManager";
import { UiShowHideManager } from "../../utils/UiShowHideManager";
import { SyncUiEventArgs, SyncUiEventDispatcher, SyncUiEventId } from "../../syncui/SyncUiEventDispatcher";

function isOptionType(value: OptionType | ReadonlyArray<OptionType>): value is OptionType {
  if (Array.isArray(value))
    return false;
  return true;
}

/** UiSettingsPage displaying the active settings.
 * @beta
 */
export function UiSettingsPage({allowSettingUiFrameworkVersion}: {allowSettingUiFrameworkVersion: boolean}) {
  const themeTitle = React.useRef(UiFramework.translate("settings.uiSettingsPage.themeTitle"));
  const themeDescription = React.useRef(UiFramework.translate("settings.uiSettingsPage.themeDescription"));
  const autoHideTitle = React.useRef(UiFramework.translate("settings.uiSettingsPage.autoHideTitle"));
  const autoHideDescription = React.useRef(UiFramework.translate("settings.uiSettingsPage.autoHideDescription"));
  const dragInteractionTitle = React.useRef(UiFramework.translate("settings.uiSettingsPage.dragInteractionTitle"));
  const dragInteractionDescription = React.useRef(UiFramework.translate("settings.uiSettingsPage.dragInteractionDescription"));
  const useNewUiTitle = React.useRef(UiFramework.translate("settings.uiSettingsPage.newUiTitle"));
  const useNewUiDescription = React.useRef(UiFramework.translate("settings.uiSettingsPage.newUiDescription"));
  const useProximityOpacityTitle = React.useRef(UiFramework.translate("settings.uiSettingsPage.useProximityOpacityTitle"));
  const useProximityOpacityDescription = React.useRef(UiFramework.translate("settings.uiSettingsPage.useProximityOpacityDescription"));
  const snapWidgetOpacityTitle = React.useRef(UiFramework.translate("settings.uiSettingsPage.snapWidgetOpacityTitle"));
  const snapWidgetOpacityDescription = React.useRef(UiFramework.translate("settings.uiSettingsPage.snapWidgetOpacityDescription"));
  const darkLabel = React.useRef(UiFramework.translate("settings.uiSettingsPage.dark"));
  const lightLabel = React.useRef(UiFramework.translate("settings.uiSettingsPage.light"));
  const systemPreferredLabel = React.useRef(UiFramework.translate("settings.uiSettingsPage.systemPreferred"));
  const widgetOpacityTitle = React.useRef(UiFramework.translate("settings.uiSettingsPage.widgetOpacityTitle"));
  const widgetOpacityDescription = React.useRef(UiFramework.translate("settings.uiSettingsPage.widgetOpacityDescription"));

  const [theme, setTheme] = React.useState(()=>UiFramework.getColorTheme());
  const [uiVersion, setUiVersion] = React.useState(()=>UiFramework.uiVersion);
  const [useDragInteraction, setUseDragInteraction] = React.useState(()=>UiFramework.useDragInteraction);
  const [widgetOpacity, setWidgetOpacity] = React.useState(()=>UiFramework.getWidgetOpacity());
  const [autoHideUi, setAutoHideUi] = React.useState(()=>UiShowHideManager.autoHideUi);
  const [useProximityOpacity, setUseProximityOpacity] = React.useState(()=>UiShowHideManager.useProximityOpacity);
  const [snapWidgetOpacity, setSnapWidgetOpacity] = React.useState(()=>UiShowHideManager.snapWidgetOpacity);

  React.useEffect(() => {
    const syncIdsOfInterest = ["configurableui:set_theme", "configurableui:set_widget_opacity",
      "configurableui:set-drag-interaction","configurableui:set-framework-version", SyncUiEventId.ShowHideManagerSettingChange ];

    const handleSyncUiEvent = (args: SyncUiEventArgs) => {
      // istanbul ignore else
      if (syncIdsOfInterest.some((value: string): boolean => args.eventIds.has(value))) {
        if (UiFramework.getColorTheme() !== theme)
          setTheme(UiFramework.getColorTheme());
        if (UiShowHideManager.autoHideUi !== autoHideUi)
          setAutoHideUi(UiShowHideManager.autoHideUi);
        if (UiFramework.uiVersion !== uiVersion)
          setUiVersion(UiFramework.uiVersion);
        if (UiFramework.useDragInteraction !== useDragInteraction)
          setUseDragInteraction(UiFramework.useDragInteraction);
        if (UiFramework.getWidgetOpacity() !== widgetOpacity)
          setWidgetOpacity(UiFramework.getWidgetOpacity());
        if (UiShowHideManager.autoHideUi !== autoHideUi)
          setAutoHideUi(UiShowHideManager.autoHideUi);
        if (UiShowHideManager.useProximityOpacity !== useProximityOpacity)
          setUseProximityOpacity(UiShowHideManager.useProximityOpacity);
        if (UiShowHideManager.snapWidgetOpacity !== snapWidgetOpacity)
          setSnapWidgetOpacity(UiShowHideManager.snapWidgetOpacity);
      }
    };
    return SyncUiEventDispatcher.onSyncUiEvent.addListener(handleSyncUiEvent);
  }, [autoHideUi, snapWidgetOpacity, theme, uiVersion, useDragInteraction, useProximityOpacity, widgetOpacity]);

  const defaultThemeOption = { label: systemPreferredLabel.current, value: SYSTEM_PREFERRED_COLOR_THEME };
  const themeOptions: Array<OptionType> = [
    defaultThemeOption,
    { label: lightLabel.current, value: ColorTheme.Light },
    { label: darkLabel.current, value: ColorTheme.Dark },
  ];

  const getDefaultThemeOption = () => {
    const defaultTheme = UiFramework.getColorTheme();
    for (const option of themeOptions) {
      if (option.value === defaultTheme)
        return option;
    }
    return defaultThemeOption;
  };

  const onThemeChange = React.useCallback(async (value) => {
    if (!value)
      return;
    if (!isOptionType(value))
      return;

    UiFramework.setColorTheme(value.value);
  },[]);

  const onAutoHideChange = React.useCallback(async () => {
    UiShowHideManager.autoHideUi = !UiShowHideManager.autoHideUi;
  },[]);

  const onUseProximityOpacityChange = React.useCallback(async () => {
    UiShowHideManager.useProximityOpacity = !UiShowHideManager.useProximityOpacity;
  },[]);

  const onSnapWidgetOpacityChange = React.useCallback(async () => {
    UiShowHideManager.snapWidgetOpacity = !UiShowHideManager.snapWidgetOpacity;
  },[]);

  const onWidgetOpacityChange = React.useCallback(async (values: readonly number[]) => {
    if (values.length > 0) {
      UiFramework.setWidgetOpacity(values[0]);
    }
  },[]);
  const onToggleFrameworkVersion =  React.useCallback(async () => {
    UiFramework.setUiVersion(UiFramework.uiVersion === "2"?"1":"2");
  },[]);

  const onToggleDragInteraction =  React.useCallback(async () => {
    UiFramework.setUseDragInteraction(!UiFramework.useDragInteraction);
  },[]);

  return (
    <div className="uifw-settings">
      <SettingsItem title={themeTitle.current} description={themeDescription.current}
        settingUi={
          <div className="select-container">
            <ThemedSelect
              defaultValue={getDefaultThemeOption()}
              isSearchable={false}
              onChange={onThemeChange}
              options={themeOptions}
            />
          </div>
        }
      />
      <SettingsItem title={autoHideTitle.current} description={autoHideDescription.current}
        settingUi={ <Toggle isOn={UiShowHideManager.autoHideUi} showCheckmark={false} onChange={onAutoHideChange} /> }
      />
      {allowSettingUiFrameworkVersion && <SettingsItem title={useNewUiTitle.current} description={useNewUiDescription.current}
        settingUi={ <Toggle isOn={UiFramework.uiVersion === "2"} showCheckmark={false} onChange={onToggleFrameworkVersion} /> }
      />}
      {UiFramework.uiVersion === "2" && <>
        <SettingsItem title={dragInteractionTitle.current} description={dragInteractionDescription.current}
          settingUi={ <Toggle isOn={UiFramework.useDragInteraction} showCheckmark={false} onChange={onToggleDragInteraction} /> }
        />
        <SettingsItem title={useProximityOpacityTitle.current} description={useProximityOpacityDescription.current}
          settingUi={ <Toggle isOn={UiShowHideManager.useProximityOpacity} showCheckmark={false} onChange={onUseProximityOpacityChange} /> }
        />
        <SettingsItem title={snapWidgetOpacityTitle.current} description={snapWidgetOpacityDescription.current}
          settingUi={ <Toggle isOn={UiShowHideManager.snapWidgetOpacity} showCheckmark={false} onChange={onSnapWidgetOpacityChange} /> }
        />
      </>
      }
      <SettingsItem title={widgetOpacityTitle.current} description={widgetOpacityDescription.current}
        settingUi={
          <Slider  values={[UiFramework.getWidgetOpacity()]} step={0.05} showTooltip onChange={onWidgetOpacityChange}
            min={0} max={1.0} showMinMax formatMax={(v: number) => v.toFixed(1)}
            showTicks getTickValues={() => [0,.25,.50,.75,1]} />
        }
      />
    </div>
  );
}

interface SettingsItemProps {
  title: string;
  description: string;
  settingUi: React.ReactNode;
}

function SettingsItem(props: SettingsItemProps) {
  const { title, description, settingUi } = props;

  return (
    <div className="uifw-settings-item">
      <div className="panel left-panel">
        <span className="title">{title}</span>
        <span className="description">{description}</span>
      </div>
      <div className="panel right-panel">
        {settingUi}
      </div>
    </div>
  );
}

/**
 * Return a SettingsTabEntry that can be used to define the available settings that can be set for an application.
 * @param itemPriority - Used to define the order of the entry in the Settings Stage
 * @beta
 */
export function getUiSettingsManagerEntry(itemPriority: number, allowSettingUiFrameworkVersion?: boolean): SettingsTabEntry {
  return {
    itemPriority, tabId: "uifw:UiSettings",
    label: UiFramework.translate("settings.uiSettingsPage.label"),
    page: <UiSettingsPage allowSettingUiFrameworkVersion={!!allowSettingUiFrameworkVersion} />,
    isDisabled: false,
    tooltip: UiFramework.translate("settings.uiSettingsPage.tooltip"),
  };
}
