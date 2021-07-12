/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore droppable Sublayer Basemap

// the following quiet warning caused by react-beautiful-dnd package
/* eslint-disable @typescript-eslint/unbound-method */

import { MapImagerySettings, MapSubLayerProps, MapSubLayerSettings } from "@bentley/imodeljs-common";
import {
  ImageryMapTileTree, IModelApp, MapLayerImageryProvider, MapLayerSettingsService, MapLayerSource, MapLayerSourceChangeType,
  MapLayerSources, NotifyMessageDetails, OutputMessagePriority, ScreenViewport, TileTreeOwner, Viewport,
} from "@bentley/imodeljs-frontend";
import { ToggleSwitch } from "@itwin/itwinui-react";
import { assert } from "@bentley/bentleyjs-core";
import * as React from "react";
import { DragDropContext, DropResult } from "react-beautiful-dnd";
import { MapLayerOptions, MapTypesOptions, StyleMapLayerSettings } from "../Interfaces";
import { MapLayersUiItemsProvider } from "../MapLayersUiItemsProvider";
import { AttachLayerPopupButton } from "./AttachLayerPopupButton";
import { BasemapPanel } from "./BasemapPanel";
import { MapLayerDroppable } from "./MapLayerDroppable";
import "./MapLayerManager.scss";
import { MapLayerSettingsPopupButton } from "./MapLayerSettingsPopupButton";

/** @internal */
export interface SourceMapContextProps {
  readonly sources: MapLayerSource[];
  readonly loadingSources: boolean;
  readonly bases: MapLayerSource[];
  readonly refreshFromStyle: () => void;
  readonly activeViewport?: ScreenViewport;
  readonly backgroundLayers?: StyleMapLayerSettings[];
  readonly overlayLayers?: StyleMapLayerSettings[];
  readonly mapTypesOptions?: MapTypesOptions;
}

/** @internal */
export const SourceMapContext = React.createContext<SourceMapContextProps>({ // eslint-disable-line @typescript-eslint/naming-convention
  sources: [],
  loadingSources: false,
  bases: [],
  refreshFromStyle: () => { },
});

/** @internal */
export function useSourceMapContext(): SourceMapContextProps {
  return React.useContext(SourceMapContext);
}

function getSubLayerProps(subLayerSettings: MapSubLayerSettings[]): MapSubLayerProps[] {
  return subLayerSettings.map((subLayer) => subLayer.toJSON());
}

function getMapLayerSettingsFromViewport(viewport: Viewport, getBackgroundMap: boolean, populateSubLayers = true): StyleMapLayerSettings[] | undefined {
  const displayStyle = viewport.displayStyle;
  if (!displayStyle)
    return undefined;

  const layers = new Array<StyleMapLayerSettings>();

  const displayStyleLayers = (getBackgroundMap ? displayStyle.backgroundMapLayers : displayStyle.overlayMapLayers);
  for (let layerIdx = 0; layerIdx < displayStyleLayers.length; layerIdx++) {
    const layerSettings = displayStyleLayers[layerIdx];
    const isOverlay = !getBackgroundMap;
    const layerProvider = viewport.getMapLayerImageryProvider(layerIdx, isOverlay);
    layers.push({
      visible: layerSettings.visible,
      name: layerSettings.name,
      url: layerSettings.url,
      transparency: layerSettings.transparency,
      transparentBackground: layerSettings.transparentBackground,
      subLayers: populateSubLayers ? getSubLayerProps(layerSettings.subLayers) : undefined,
      showSubLayers: false,
      isOverlay,
      provider: layerProvider,
    });
  }

  // since we want to display higher level maps above lower maps in UI reverse their order here.
  return layers.reverse();
}

interface MapLayerManagerProps {
  getContainerForClone: () => HTMLElement;
  activeViewport: ScreenViewport;
  mapLayerOptions?: MapLayerOptions;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function MapLayerManager(props: MapLayerManagerProps) {
  const [mapSources, setMapSources] = React.useState<MapLayerSource[] | undefined>();
  const [loadingSources, setLoadingSources] = React.useState(false);
  const [baseSources, setBaseSources] = React.useState<MapLayerSource[] | undefined>();
  const [overlaysLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Widget.OverlayLayers"));
  const [underlaysLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Widget.BackgroundLayers"));
  const { activeViewport, mapLayerOptions } = props;
  const hideExternalMapLayersSection = mapLayerOptions?.hideExternalMapLayers ? mapLayerOptions.hideExternalMapLayers : false;
  const fetchPublicMapLayerSources = mapLayerOptions?.fetchPublicMapLayerSources ? mapLayerOptions.fetchPublicMapLayerSources : false;

  // map layer settings from display style
  const [backgroundMapLayers, setBackgroundMapLayers] = React.useState<StyleMapLayerSettings[] | undefined>(getMapLayerSettingsFromViewport(activeViewport, true));
  const [overlayMapLayers, setOverlayMapLayers] = React.useState<StyleMapLayerSettings[] | undefined>(getMapLayerSettingsFromViewport(activeViewport, false));

  const loadMapLayerSettingsFromViewport = React.useCallback((viewport: Viewport) => {
    setBackgroundMapLayers(getMapLayerSettingsFromViewport(viewport, true));
    setOverlayMapLayers(getMapLayerSettingsFromViewport(viewport, false));
  }, [setBackgroundMapLayers, setOverlayMapLayers]);

  const [backgroundMapVisible, setBackgroundMapVisible] = React.useState(() => {
    if (activeViewport) {
      return activeViewport.viewFlags.backgroundMap;
    }
    return false;
  });

  // 'isMounted' is used to prevent any async operation once the hook has been
  // unloaded.  Otherwise we get a 'Can't perform a React state update on an unmounted component.' warning in the console.
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  });

  // Setup onTileTreeLoad events listening.
  // This is needed because we need to know when the imagery provider
  // is created, and be able to monitor to status change.
  React.useEffect(() => {
    const handleTileTreeLoad = (args: TileTreeOwner) => {

      // Ignore non-map tile trees
      if (args.tileTree instanceof ImageryMapTileTree) {
        loadMapLayerSettingsFromViewport(activeViewport);
      }
    };

    IModelApp.tileAdmin.onTileTreeLoad.addListener(handleTileTreeLoad);

    return () => {
      IModelApp.tileAdmin.onTileTreeLoad.removeListener(handleTileTreeLoad);
    };

  }, [activeViewport, loadMapLayerSettingsFromViewport]);

  // Setup onMapImageryChanged events listening.

  React.useEffect(() => {
    const handleMapImageryChanged = (args: Readonly<MapImagerySettings>) => {

      if (args.backgroundLayers.length !== (backgroundMapLayers ? backgroundMapLayers.length : 0)
        || args.overlayLayers.length !== (overlayMapLayers ? overlayMapLayers.length : 0)) {
        loadMapLayerSettingsFromViewport(activeViewport);
      }
    };
    activeViewport?.displayStyle.settings.onMapImageryChanged.addListener(handleMapImageryChanged);

    return () => {
      activeViewport?.displayStyle.settings.onMapImageryChanged.removeListener(handleMapImageryChanged);
    };
  }, [activeViewport, backgroundMapLayers, loadMapLayerSettingsFromViewport, overlayMapLayers]);

  const handleProviderStatusChanged = React.useCallback((_args: MapLayerImageryProvider) => {
    loadMapLayerSettingsFromViewport(activeViewport);
  }, [loadMapLayerSettingsFromViewport, activeViewport]);

  // Triggered whenever a provider status change
  React.useEffect(() => {
    backgroundMapLayers?.forEach((layer) => { layer.provider?.onStatusChanged.addListener(handleProviderStatusChanged); });
    overlayMapLayers?.forEach((layer) => { layer.provider?.onStatusChanged.addListener(handleProviderStatusChanged); });

    return () => {
      backgroundMapLayers?.forEach((layer) => { layer.provider?.onStatusChanged.removeListener(handleProviderStatusChanged); });
      overlayMapLayers?.forEach((layer) => { layer.provider?.onStatusChanged.removeListener(handleProviderStatusChanged); });
    };

  }, [backgroundMapLayers, overlayMapLayers, activeViewport, loadMapLayerSettingsFromViewport, handleProviderStatusChanged]);

  React.useEffect(() => {
    async function fetchWmsMapData() {
      const sources: MapLayerSource[] = [];
      const bases: MapLayerSource[] = [];
      const sourceLayers = await MapLayerSources.create(undefined, (fetchPublicMapLayerSources && !hideExternalMapLayersSection));
      if (!isMounted.current) {
        return;
      }

      // This is where the list of layers first gets populated... I need to update it
      // MapUrlDialog gets around knowing MapLayerManager exists and vice versa by affecting the viewports displayStyle which MapLayerManager is listening for
      // We know when displayStyle changes we've added a layer, this layer may not be a custom layer
      sourceLayers?.layers.forEach((source: MapLayerSource) => { sources.push(source); });
      setMapSources(sources);
      sourceLayers?.bases.forEach((source: MapLayerSource) => { bases.push(source); });
      setBaseSources(bases);
    }

    setLoadingSources(true);
    fetchWmsMapData().then(() => {
      if (isMounted.current) {
        setLoadingSources(false);
      }

    }).catch(() => {
      if (isMounted.current) {
        setLoadingSources(false);
      }
    });
  }, [setMapSources, fetchPublicMapLayerSources, hideExternalMapLayersSection]);

  const updateMapSources = React.useCallback(() => {
    const newSources: MapLayerSource[] = [];
    MapLayerSources.getInstance()?.layers?.forEach((sourceLayer: MapLayerSource) => { newSources.push(sourceLayer); });
    setMapSources(newSources);
  }, [setMapSources]);

  /*
  * Handle change events in the MapLayerSettingsService
  */
  React.useEffect(() => {
    const handleLayerSourceChange = async (changeType: MapLayerSourceChangeType, oldSource?: MapLayerSource, newSource?: MapLayerSource) => {
      const removeSourceOnly = (changeType === MapLayerSourceChangeType.Removed);
      const removeSource = (changeType === MapLayerSourceChangeType.Replaced || changeType === MapLayerSourceChangeType.Removed);
      const addSource = (changeType === MapLayerSourceChangeType.Replaced || changeType === MapLayerSourceChangeType.Added);

      if (removeSource) {
        if (oldSource) {
          const succeeded = MapLayerSources.removeLayerByName(oldSource.name);
          assert(succeeded);
          if (!succeeded) {
            return;
          }

          if (removeSourceOnly) {
            updateMapSources();
            return;
          }
        }
      }

      if (addSource) {
        const sources = await MapLayerSources.addSourceToMapLayerSources(newSource);
        assert(sources !== undefined);
        if (sources) {
          updateMapSources();
        }
      }
    };
    MapLayerSettingsService.onLayerSourceChanged.addListener(handleLayerSourceChange);
    return (() => {
      MapLayerSettingsService.onLayerSourceChanged.removeListener(handleLayerSourceChange);
    });
  }, [updateMapSources]);

  // update when a different display style is loaded.
  React.useEffect(() => {
    const handleDisplayStyleChange = (vp: Viewport) => {
      loadMapLayerSettingsFromViewport(vp);
    };
    activeViewport?.onDisplayStyleChanged.addListener(handleDisplayStyleChange);
    return () => {
      activeViewport?.onDisplayStyleChanged.removeListener(handleDisplayStyleChange);
    };
  }, [activeViewport, loadMapLayerSettingsFromViewport]);

  const handleOnMenuItemSelection = React.useCallback((action: string, mapLayerSettings: StyleMapLayerSettings) => {
    if (!activeViewport || !activeViewport.displayStyle)
      return;

    const indexInDisplayStyle = activeViewport.displayStyle.findMapLayerIndexByNameAndUrl(mapLayerSettings.name, mapLayerSettings.url, mapLayerSettings.isOverlay);
    if (indexInDisplayStyle < 0)
      return;

    switch (action) {
      case "delete":
        activeViewport.displayStyle.detachMapLayerByIndex(indexInDisplayStyle, mapLayerSettings.isOverlay);
        break;
      case "zoom-to-layer":
        activeViewport.displayStyle.viewMapLayerRange(indexInDisplayStyle, mapLayerSettings.isOverlay, activeViewport).then((status) => {
          if (!status) {
            const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:Messages.NoRangeDefined");
            IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, `${msg} [${mapLayerSettings.name}]`));
          }
        }).catch((_error) => { });
        break;
    }
    activeViewport.invalidateRenderPlan();

    // force UI to update
    loadMapLayerSettingsFromViewport(activeViewport);
  }, [activeViewport, loadMapLayerSettingsFromViewport]);

  const handleLayerVisibilityChange = React.useCallback((mapLayerSettings: StyleMapLayerSettings) => {
    if (activeViewport) {
      const isVisible = !mapLayerSettings.visible;

      const displayStyle = activeViewport.displayStyle;
      const indexInDisplayStyle = displayStyle.findMapLayerIndexByNameAndUrl(mapLayerSettings.name, mapLayerSettings.url, mapLayerSettings.isOverlay);
      if (-1 !== indexInDisplayStyle) {
        // update the display style
        displayStyle.changeMapLayerProps({ visible: isVisible }, indexInDisplayStyle, mapLayerSettings.isOverlay);
        activeViewport.invalidateRenderPlan();

        // force UI to update
        loadMapLayerSettingsFromViewport(activeViewport);
      }
    }
  }, [activeViewport, loadMapLayerSettingsFromViewport]);

  const handleMapLayersToggle = React.useCallback(() => {
    if (activeViewport) {
      const newState = !backgroundMapVisible;
      const vf = activeViewport.viewFlags.clone();
      vf.backgroundMap = newState; // Or any other modifications
      activeViewport.viewFlags = vf;
      activeViewport.invalidateRenderPlan();
      setBackgroundMapVisible(newState);
    }
  }, [backgroundMapVisible, setBackgroundMapVisible, activeViewport]);

  const handleOnMapLayerDragEnd = React.useCallback((result: DropResult /* ,  _provided: ResponderProvided*/) => {
    const { destination, source } = result;

    if (!destination) // dropped outside of list
      return;

    // item was not moved
    if (destination.droppableId === source.droppableId && destination.index === source.index)
      return;

    let fromMapLayer: StyleMapLayerSettings | undefined;
    if (source.droppableId === "overlayMapLayers" && overlayMapLayers)
      fromMapLayer = overlayMapLayers[source.index];
    else if (source.droppableId === "backgroundMapLayers" && backgroundMapLayers)
      fromMapLayer = backgroundMapLayers[source.index];

    if (!fromMapLayer || !activeViewport)
      return;

    const displayStyle = activeViewport.displayStyle;
    let toMapLayer: StyleMapLayerSettings | undefined;
    let toIndexInDisplayStyle = -1;

    // If destination.index is undefined then the user dropped the map at the end of list of maps. To get the "actual" index in the style, look up index in style by name.
    // We need to do this because the order of layers in UI are reversed so higher layers appear above lower layers.
    if (undefined !== destination.index) {
      if (destination.droppableId === "overlayMapLayers" && overlayMapLayers)
        toMapLayer = overlayMapLayers[destination.index];
      else if (destination.droppableId === "backgroundMapLayers" && backgroundMapLayers)
        toMapLayer = backgroundMapLayers[destination.index];
      if (toMapLayer)
        toIndexInDisplayStyle = displayStyle.findMapLayerIndexByNameAndUrl(toMapLayer.name, toMapLayer.url, toMapLayer.isOverlay);
    }

    const fromIndexInDisplayStyle = displayStyle.findMapLayerIndexByNameAndUrl(fromMapLayer.name, fromMapLayer.url, fromMapLayer.isOverlay);
    if (fromIndexInDisplayStyle < 0)
      return;

    if (destination.droppableId !== source.droppableId) {
      // see if we moved from "overlayMapLayers" to "backgroundMapLayers" or vice-versa
      const layerSettings = activeViewport.displayStyle.mapLayerAtIndex(fromIndexInDisplayStyle, fromMapLayer.isOverlay);
      if (layerSettings) {
        activeViewport.displayStyle.detachMapLayerByIndex(fromIndexInDisplayStyle, fromMapLayer.isOverlay);

        // Manually reverse index when moved from one section to the other
        if (fromMapLayer.isOverlay && backgroundMapLayers) {
          toIndexInDisplayStyle = displayStyle.backgroundMapLayers.length - destination.index;
        } else if (!fromMapLayer.isOverlay && overlayMapLayers) {
          toIndexInDisplayStyle = overlayMapLayers.length - destination.index;
        }

        activeViewport.displayStyle.attachMapLayerSettings(layerSettings, !fromMapLayer.isOverlay, toIndexInDisplayStyle);
      }
    } else {
      if (undefined === destination.index) {
        displayStyle.moveMapLayerToBottom(fromIndexInDisplayStyle, destination.droppableId === "overlayMapLayers");
      } else {
        if (toMapLayer) {
          if (toIndexInDisplayStyle !== -1)
            displayStyle.moveMapLayerToIndex(fromIndexInDisplayStyle, toIndexInDisplayStyle, toMapLayer.isOverlay);
        }
      }
    }

    // apply display style change to view
    activeViewport.invalidateRenderPlan();

    // force UI to update
    loadMapLayerSettingsFromViewport(activeViewport);
  }, [loadMapLayerSettingsFromViewport, activeViewport, overlayMapLayers, backgroundMapLayers]);

  const handleRefreshFromStyle = React.useCallback(() => {
    if (activeViewport)
      loadMapLayerSettingsFromViewport(activeViewport);
  }, [activeViewport, loadMapLayerSettingsFromViewport]);

  const [baseMapPanelLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:Basemap.BaseMapPanelTitle"));

  return (
    <SourceMapContext.Provider value={{
      activeViewport,
      loadingSources,
      sources: mapSources ? mapSources : [],
      bases: baseSources ? baseSources : [],
      refreshFromStyle: handleRefreshFromStyle,
      backgroundLayers: backgroundMapLayers,
      overlayLayers: overlayMapLayers,
      mapTypesOptions: mapLayerOptions?.mapTypeOptions,
    }}>
      <div className="map-manager-top-header">
        <span className="map-manager-header-label">{baseMapPanelLabel}</span>
        <div className="map-manager-header-buttons-group">
          <ToggleSwitch className="map-manager-toggle" checked={backgroundMapVisible} onChange={handleMapLayersToggle} />
          <MapLayerSettingsPopupButton />
        </div>
      </div>

      <div className="map-manager-container">

        <div className="map-manager-basemap">
          <BasemapPanel />
        </div>
        {!hideExternalMapLayersSection &&
          <DragDropContext onDragEnd={handleOnMapLayerDragEnd}>
            <div className="map-manager-layer-wrapper">
              <div className="map-manager-underlays" >
                <span className="map-manager-underlays-label">{underlaysLabel}</span><AttachLayerPopupButton isOverlay={false} />
              </div>
              <MapLayerDroppable
                isOverlay={false}
                layersList={backgroundMapLayers}
                mapTypesOptions={props.mapLayerOptions?.mapTypeOptions}
                getContainerForClone={props.getContainerForClone as any}
                activeViewport={props.activeViewport}
                onMenuItemSelected={handleOnMenuItemSelection}
                onItemVisibilityToggleClicked={handleLayerVisibilityChange}
                onItemEdited={handleRefreshFromStyle} />
            </div>

            <div className="map-manager-layer-wrapper">
              <div className="map-manager-overlays" >
                <span className="map-manager-overlays-label">{overlaysLabel}</span><AttachLayerPopupButton isOverlay={true} />
              </div>
              <MapLayerDroppable
                isOverlay={true}
                layersList={overlayMapLayers}
                mapTypesOptions={props.mapLayerOptions?.mapTypeOptions}
                getContainerForClone={props.getContainerForClone as any}
                activeViewport={props.activeViewport}
                onMenuItemSelected={handleOnMenuItemSelection}
                onItemVisibilityToggleClicked={handleLayerVisibilityChange}
                onItemEdited={handleRefreshFromStyle} />
            </div>
          </DragDropContext>
        }
      </div >
    </SourceMapContext.Provider >
  );
}

