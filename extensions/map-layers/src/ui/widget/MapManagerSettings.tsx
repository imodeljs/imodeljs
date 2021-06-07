/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore droppable Sublayer Basemap

import * as React from "react";
import { NumberInput, Select, Slider, Toggle } from "@bentley/ui-core";
import { ViewState3d } from "@bentley/imodeljs-frontend";
import { BackgroundMapProps, BackgroundMapSettings, PlanarClipMaskMode, PlanarClipMaskPriority, TerrainHeightOriginMode, TerrainProps } from "@bentley/imodeljs-common";
import { useSourceMapContext } from "./MapLayerManager";
import "./MapManagerSettings.scss";
import { MapLayersUiItemsProvider } from "../MapLayersUiItemsProvider";

enum MapMaskingOption
  {
  None,
  AllModels
}

function getMapMaskingFromBackgroundMapSetting(backgroundMapSettings: BackgroundMapSettings): MapMaskingOption {
  if (backgroundMapSettings.planarClipMask.mode === PlanarClipMaskMode.Priority && backgroundMapSettings.planarClipMask.priority) {
    if (backgroundMapSettings.planarClipMask.priority >= PlanarClipMaskPriority.BackgroundMap) {
      return  MapMaskingOption.AllModels;
    }

  }
  return MapMaskingOption.None;
}

function getHeightOriginModeKey(mode: TerrainHeightOriginMode): string {
  if (TerrainHeightOriginMode.Geodetic === mode)
    return "geodetic";
  if (TerrainHeightOriginMode.Geoid === mode)
    return "geoid";
  return "ground";
}

function getHeightOriginModeFromKey(mode: string): TerrainHeightOriginMode {
  if ("geodetic" === mode)
    return TerrainHeightOriginMode.Geodetic;
  if ("geoid" === mode)
    return TerrainHeightOriginMode.Geoid;
  return TerrainHeightOriginMode.Ground;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function MapManagerSettings() {
  const { activeViewport } = useSourceMapContext();
  const backgroundMapSettings = (activeViewport!.view as ViewState3d).getDisplayStyle3d().settings.backgroundMap;

  const [transparency, setTransparency] = React.useState(() =>
    typeof backgroundMapSettings.transparency === "boolean"
      ? 0
      : Math.round((backgroundMapSettings.transparency) * 100) / 100);

  const terrainSettings = backgroundMapSettings.terrainSettings;
  const [groundBias, setGroundBias] = React.useState(() => backgroundMapSettings.groundBias);

  const terrainHeightOptions = React.useRef({
    geodetic: MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.ElevationTypeGeodetic"),
    geoid: MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.ElevationTypeGeoid"),
    ground: MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.ElevationTypeGround"),
  });

  const updateMaskingSettings = React.useCallback((option: MapMaskingOption) => {
    if (option === MapMaskingOption.AllModels) {
      activeViewport!.changeBackgroundMapProps({ planarClipMask: { mode: PlanarClipMaskMode.Priority, priority: PlanarClipMaskPriority.BackgroundMap } });
    }
    if (option === MapMaskingOption.None) {
      activeViewport!.changeBackgroundMapProps({ planarClipMask: { mode: PlanarClipMaskMode.None } });
    }

    activeViewport!.invalidateRenderPlan();
  }, [activeViewport]);

  const updateTerrainSettings = React.useCallback((props: TerrainProps) => {
    activeViewport!.changeBackgroundMapProps({ terrainSettings: props });
    activeViewport!.invalidateRenderPlan();
  }, [activeViewport]);

  const updateBackgroundMap = React.useCallback((props: BackgroundMapProps) => {
    activeViewport!.changeBackgroundMapProps(props);
    activeViewport!.invalidateRenderPlan();
  }, [activeViewport]);

  const [heightOriginMode, setHeightOriginMode] = React.useState(() => getHeightOriginModeKey(terrainSettings.heightOriginMode));
  const handleElevationTypeSelected = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>): void => {
    if (event.target.value) {
      const newHeightOriginMode = getHeightOriginModeFromKey(event.target.value);
      updateTerrainSettings({ heightOriginMode: newHeightOriginMode });
      setHeightOriginMode(event.target.value);
    }
  }, [updateTerrainSettings]);

  const [masking, setMasking] = React.useState(() => getMapMaskingFromBackgroundMapSetting(backgroundMapSettings));

  const onMaskingToggle = React.useCallback((checked: boolean) => {
    const maskingOption = checked ? MapMaskingOption.AllModels : MapMaskingOption.None;
    updateMaskingSettings(maskingOption);
    setMasking(maskingOption);
  }, [updateMaskingSettings]);

  const handleElevationChange = React.useCallback((value: number | undefined, _stringValue: string) => {
    if (value !== undefined) {
      updateBackgroundMap({ groundBias: value });
      setGroundBias(value);
    }
  }, [updateBackgroundMap]);

  const handleAlphaChange = React.useCallback((values: readonly number[]) => {
    const newTransparency = values[0] / 100;
    activeViewport!.changeBackgroundMapProps({ transparency: newTransparency });
    activeViewport!.invalidateRenderPlan();
    setTransparency(newTransparency);
  }, [activeViewport]);

  const [applyTerrain, setApplyTerrain] = React.useState(() => backgroundMapSettings.applyTerrain);

  const onToggleTerrain = React.useCallback((checked: boolean) => {
    updateBackgroundMap({ applyTerrain: checked });
    setApplyTerrain(checked);
  }, [updateBackgroundMap]);

  const [exaggeration, setExaggeration] = React.useState(() => terrainSettings.exaggeration);

  const handleExaggerationChange = React.useCallback((value: number | undefined, _stringValue: string) => {
    if (undefined !== value) {
      updateTerrainSettings({ exaggeration: value });
      setExaggeration(value);
    }
  }, [updateTerrainSettings]);

  const [terrainOrigin, setTerrainOrigin] = React.useState(() => terrainSettings.heightOrigin);
  const handleHeightOriginChange = React.useCallback((value: number | undefined, _stringValue: string) => {
    if (undefined !== value) {
      updateTerrainSettings({ heightOrigin: value });
      setTerrainOrigin(value);
    }
  }, [updateTerrainSettings]);

  const [useDepthBuffer, setUseDepthBuffer] = React.useState(() => backgroundMapSettings.useDepthBuffer);
  const onToggleUseDepthBuffer = React.useCallback((checked: boolean) => {
    updateBackgroundMap({ useDepthBuffer: checked });
    setUseDepthBuffer(checked);
  }, [updateBackgroundMap]);

  /** Disable commas and letters */
  const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.keyCode === 188 || (event.keyCode >= 65 && event.keyCode <= 90))
      event.preventDefault();
  }, []);

  const [isLocatable, setIsLocatable] = React.useState(() => backgroundMapSettings.locatable);
  const onLocatableToggle = React.useCallback((checked: boolean) => {
    updateBackgroundMap({ nonLocatable: !checked });
    setIsLocatable(checked);
  }, [updateBackgroundMap]);

  const [transparencyLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.Transparency"));
  const [terrainLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.Terrain"));
  const [enableLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.Enable"));
  const [elevationOffsetLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.ElevationOffset"));
  const [useDepthBufferLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.UseDepthBuffer"));
  const [modelHeightLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.ModelHeight"));
  const [heightOriginLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.HeightOrigin"));
  const [exaggerationLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.Exaggeration"));
  const [locatableLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.Locatable"));
  const [maskingLabel] =  React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Settings.Mask"));

  return (
    <>
      <div className="maplayers-settings-container">

        <span className="map-manager-settings-label">{transparencyLabel}</span>
        <Slider min={0} max={100} showMinMax showTooltip values={[transparency * 100]} onChange={handleAlphaChange} step={1} />

        <span className="map-manager-settings-label">{locatableLabel}</span>
        <Toggle onChange={onLocatableToggle} isOn={isLocatable} />

        <span className="map-manager-settings-label">{maskingLabel}</span>
        <Toggle onChange={onMaskingToggle} isOn={masking !== MapMaskingOption.None} />

        <>
          <span className="map-manager-settings-label">{elevationOffsetLabel}</span>
          <NumberInput disabled={applyTerrain} value={groundBias} onChange={handleElevationChange} onKeyDown={onKeyDown} />

          <span className="map-manager-settings-label">{useDepthBufferLabel}</span>
          <Toggle disabled={applyTerrain} onChange={onToggleUseDepthBuffer} isOn={useDepthBuffer} />
        </>

      </div>
      <div className="map-manager-settings-terrain-container">
        <fieldset>
          <legend>{terrainLabel}</legend>

          <div className="maplayers-settings-container">

            <span className="map-manager-settings-label">{enableLabel}</span>
            <Toggle onChange={onToggleTerrain} isOn={applyTerrain} />

            <span className="map-manager-settings-label">{modelHeightLabel}</span>
            <NumberInput value={terrainOrigin} disabled={!applyTerrain} onChange={handleHeightOriginChange} onKeyDown={onKeyDown} />

            <span className="map-manager-settings-label">{heightOriginLabel}</span>
            <Select options={terrainHeightOptions.current} disabled={!applyTerrain} value={heightOriginMode} onChange={handleElevationTypeSelected} />

            <span className="map-manager-settings-label">{exaggerationLabel}</span>
            <NumberInput value={exaggeration} disabled={!applyTerrain} onChange={handleExaggerationChange} onKeyDown={onKeyDown} />
          </div>

        </fieldset>
      </div>
    </>
  );
}
