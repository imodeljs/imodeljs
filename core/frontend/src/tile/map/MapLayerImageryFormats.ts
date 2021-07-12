/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { MapLayerSettings, MapSubLayerProps } from "@bentley/imodeljs-common";
import { RequestBasicCredentials } from "@bentley/itwin-client";
import { IModelConnection } from "../../IModelConnection";
import {
  ArcGISMapLayerImageryProvider,
  ArcGisUtilities,
  AzureMapsLayerImageryProvider,
  BingMapsImageryLayerProvider,
  ImageryMapLayerTreeReference,
  MapBoxLayerImageryProvider,
  MapLayerFormat,
  MapLayerImageryProvider,
  MapLayerSourceStatus,
  MapLayerSourceValidation,
  MapLayerTileTreeReference,
  TileUrlImageryProvider,
  WmsCapabilities,
  WmsMapLayerImageryProvider,
  WmtsCapabilities,
  WmtsMapLayerImageryProvider,
} from "../internal";

/** Base class imagery map layer formats. Subclasses should override formatId and [[MapLayerFormat.createImageryProvider]].
 * @internal
 */
export class ImageryMapLayerFormat extends MapLayerFormat {
  public static override createMapLayerTree(layerSettings: MapLayerSettings, layerIndex: number, iModel: IModelConnection): MapLayerTileTreeReference | undefined {
    return new ImageryMapLayerTreeReference(layerSettings, layerIndex, iModel);
  }
}

class WmsMapLayerFormat extends ImageryMapLayerFormat {
  public static override formatId = "WMS";

  public static override createImageryProvider(settings: MapLayerSettings): MapLayerImageryProvider | undefined {
    return new WmsMapLayerImageryProvider(settings);
  }
  public static override async validateSource(url: string, credentials?: RequestBasicCredentials, ignoreCache?: boolean): Promise<MapLayerSourceValidation> {
    try {
      let subLayers: MapSubLayerProps[] | undefined;
      const maxVisibleSubLayers = 50;
      const capabilities = await WmsCapabilities.create(url, credentials, ignoreCache);
      if (capabilities !== undefined) {
        subLayers = capabilities.getSubLayers(false);
        const rootsSubLayer = subLayers?.find((sublayer) => sublayer.parent === undefined);
        const hasTooManyLayers = subLayers && subLayers.length > maxVisibleSubLayers;

        if (!Array.isArray(subLayers))
          return { status: MapLayerSourceStatus.Valid, subLayers };

        for (const subLayer of subLayers) {
          // In general for WMS, we prefer to have the children of root node visible, but not the root itself.
          // Thats simply to give more flexibility in the UI.
          // Two exceptions to this rule: If there are too many layers or the root node is not named.
          if (subLayer.id && subLayer.id === rootsSubLayer?.id
            && (!(subLayer.name && subLayer.name.length > 0) || hasTooManyLayers)) {
            subLayer.visible = true;
            break;  // if root node is visible, don't bother turning ON any other layers
          }

          // Make children of the root node visible.
          if (subLayer.parent && subLayer.parent === rootsSubLayer?.id && !hasTooManyLayers) {
            const isUnnamedGroup = (layer: MapSubLayerProps) => { return layer.children && layer.children.length > 0 && (!layer.name || layer.name.length === 0); };
            const makeChildrenVisible = (layers: MapSubLayerProps[] | undefined, layer: MapSubLayerProps) => {
              layer?.children?.forEach((childId) => {
                const childSubLayer = subLayers?.find((child) => child?.id === childId);
                if (childSubLayer) {
                  childSubLayer.visible = true;
                  if (isUnnamedGroup(childSubLayer))
                    makeChildrenVisible(layers, childSubLayer);
                }
              });
            };

            subLayer.visible = true;

            // If we got a unnamed group, make children visible recursively until we have a leaf or named group
            if (isUnnamedGroup(subLayer))
              makeChildrenVisible(subLayers, subLayer);
          }
        }
      }

      return { status: MapLayerSourceStatus.Valid, subLayers };
    } catch (err) {
      let status = MapLayerSourceStatus.InvalidUrl;
      if (err?.status === 401) {
        status = (credentials ? MapLayerSourceStatus.InvalidCredentials : MapLayerSourceStatus.RequireAuth);
      }
      return { status };
    }
  }
}

class WmtsMapLayerFormat extends ImageryMapLayerFormat {
  public static override formatId = "WMTS";

  public static override createImageryProvider(settings: MapLayerSettings): MapLayerImageryProvider | undefined {
    return new WmtsMapLayerImageryProvider(settings);
  }

  public static override async validateSource(url: string, credentials?: RequestBasicCredentials, ignoreCache?: boolean): Promise<MapLayerSourceValidation> {
    try {
      const subLayers: MapSubLayerProps[] = [];
      const capabilities = await WmtsCapabilities.create(url, credentials, ignoreCache);
      if (!capabilities)
        return { status: MapLayerSourceStatus.InvalidUrl };

      // Only returns layer that can be published in the Google maps aligned tile tree.
      const googleMapsTms = capabilities?.contents?.getGoogleMapsCompatibleTileMatrixSet();
      if (!googleMapsTms)
        return { status: MapLayerSourceStatus.InvalidTileTree };

      let subLayerId = 0;
      capabilities?.contents?.layers.forEach((layer) => {
        if (googleMapsTms?.some((tms) => {
          return layer.tileMatrixSetLinks.some((tmls) => { return (tmls.tileMatrixSet === tms.identifier); });
        })) {
          subLayers.push({
            name: layer.identifier,
            title: layer.title ?? layer.identifier,
            visible: (subLayers.length === 0),   // Make the first layer visible.
            parent: undefined,
            children: undefined,
            id: subLayerId++,
          });
        }
      });

      // Return error if we could find a single compatible layer.
      if (subLayers.length === 0)
        return { status: MapLayerSourceStatus.InvalidTileTree };

      return { status: MapLayerSourceStatus.Valid, subLayers };
    } catch (err) {
      console.error(err); // eslint-disable-line no-console
      return { status: MapLayerSourceStatus.InvalidUrl };
    }
  }

}

class ArcGISMapLayerFormat extends ImageryMapLayerFormat {
  public static override formatId = "ArcGIS";
  public static override async validateSource(url: string, credentials?: RequestBasicCredentials, ignoreCache?: boolean): Promise<MapLayerSourceValidation> {
    return ArcGisUtilities.validateSource(url, credentials, ignoreCache);
  }
  public static override createImageryProvider(settings: MapLayerSettings): MapLayerImageryProvider | undefined {
    return new ArcGISMapLayerImageryProvider(settings);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class AzureMapsMapLayerFormat extends ImageryMapLayerFormat {
  public static override formatId = "AzureMaps";
  public static override createImageryProvider(settings: MapLayerSettings): MapLayerImageryProvider | undefined {
    return new AzureMapsLayerImageryProvider(settings);
  }
}
class BingMapsMapLayerFormat extends ImageryMapLayerFormat {
  public static override formatId = "BingMaps";
  public static override createImageryProvider(settings: MapLayerSettings): MapLayerImageryProvider | undefined {
    return new BingMapsImageryLayerProvider(settings);
  }
}

class MapBoxImageryMapLayerFormat extends ImageryMapLayerFormat {
  public static override formatId = "MapboxImagery";
  public static override createImageryProvider(settings: MapLayerSettings): MapLayerImageryProvider | undefined {
    return new MapBoxLayerImageryProvider(settings);
  }
}
class TileUrlMapLayerFormat extends ImageryMapLayerFormat {
  public static override formatId = "TileURL";
  public static override createImageryProvider(settings: MapLayerSettings): MapLayerImageryProvider | undefined { return new TileUrlImageryProvider(settings); }
}

/** @internal */
export const internalMapLayerImageryFormats = [WmsMapLayerFormat, WmtsMapLayerFormat, ArcGISMapLayerFormat, /* AzureMapsMapLayerFormat, */ BingMapsMapLayerFormat, MapBoxImageryMapLayerFormat, TileUrlMapLayerFormat];
