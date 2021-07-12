/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, BentleyError, IModelStatus } from "@bentley/bentleyjs-core";
import { Range2d } from "@bentley/geometry-core";
import { ImageSource, MapLayerSettings } from "@bentley/imodeljs-common";
import { request, RequestOptions, Response } from "@bentley/itwin-client";
import { IModelApp } from "../../../IModelApp";
import { ScreenViewport } from "../../../Viewport";
import {
  MapLayerImageryProvider, MapTile, MapTilingScheme, QuadId,
  Tile, WebMercatorTilingScheme,
} from "../../internal";

/** Represents one range of geography and tile zoom levels for a bing data provider
 * @internal
 */
class Coverage {
  constructor(private _lowerLeftLatitude: number,
    private _lowerLeftLongitude: number,
    private _upperRightLatitude: number,
    private _upperRightLongitude: number,
    private _minimumZoomLevel: number,
    private _maximumZoomLevel: number) { }

  public overlaps(quadId: QuadId, tilingScheme: MapTilingScheme): boolean {
    const range: Range2d = quadId.getLatLongRange(tilingScheme);
    if (quadId.level < this._minimumZoomLevel)
      return false;
    if (quadId.level > this._maximumZoomLevel)
      return false;
    if (range.low.x > this._upperRightLongitude)
      return false;
    if (range.low.y > this._upperRightLatitude)
      return false;
    if (range.high.x < this._lowerLeftLongitude)
      return false;
    if (range.high.y < this._lowerLeftLatitude)
      return false;

    return true;
  }
}

/** Represents the copyright message and an array of coverage data for one of bing's data providers (HERE for example).
 * @internal
 */
class BingAttribution {
  constructor(public copyrightMessage: string, private _coverages: Coverage[]) { }

  public matchesTile(tile: Tile, tilingScheme: MapTilingScheme): boolean {
    const quadId = QuadId.createFromContentId(tile.contentId);
    for (const coverage of this._coverages) {
      if (coverage.overlaps(quadId, tilingScheme))
        return true;
    }
    return false;
  }
}

// in deployed applications, we can only make https requests, but the Bing Maps metadata request returns templates with "http:".
// This function fixes those.
function replaceHttpWithHttps(originalUrl: string) {
  return originalUrl.startsWith("http:") ? "https:".concat(originalUrl.slice(5)) : originalUrl;
}

/** @internal */
export class BingMapsImageryLayerProvider extends MapLayerImageryProvider {
  private _urlTemplate?: string;
  private _urlSubdomains?: string[];
  private _zoomMax: number;
  private _tileHeight: number;
  private _tileWidth: number;
  private _attributions?: BingAttribution[]; // array of Bing's data providers.
  private _mapTilingScheme: MapTilingScheme;
  private _urlBase: string;

  constructor(settings: MapLayerSettings) {
    super(settings, true);
    this._urlBase = settings.url;
    this._zoomMax = 0;
    this._tileHeight = this._tileWidth = 0;
    this._mapTilingScheme = new WebMercatorTilingScheme();
  }

  public get tileWidth(): number { return this._tileWidth; }
  public get tileHeight(): number { return this._tileHeight; }

  private tileXYToQuadKey(tileX: number, tileY: number, zoomLevel: number) {
    // from C# example in bing documentation https://msdn.microsoft.com/en-us/library/bb259689.aspx
    let quadKey: string = "";

    // Root tile is not displayable. Returns 0 for _GetMaximumSize(). Should not end up here.
    assert(0 !== zoomLevel);

    for (let i: number = zoomLevel; i > 0; i--) {
      let digit: number = 0x30; // '0'
      const mask: number = 1 << (i - 1);
      if ((tileX & mask) !== 0) {
        digit++;
      }
      if ((tileY & mask) !== 0) {
        digit++;
        digit++;
      }
      quadKey = quadKey.concat(String.fromCharCode(digit));
    }
    return quadKey;
  }

  // construct the Url from the desired Tile
  public async constructUrl(row: number, column: number, zoomLevel: number): Promise<string> {
    // From the tile, get a "quadKey" the Microsoft way.
    const quadKey: string = this.tileXYToQuadKey(column, row, zoomLevel);
    const subdomain: string = this._urlSubdomains![(row + column) % this._urlSubdomains!.length];

    // from the template url, construct the tile url.
    let url: string = this._urlTemplate!.replace("{subdomain}", subdomain);
    url = url.replace("{quadkey}", quadKey);

    return url;
  }

  // gets the attributions that match the tile set.
  private getMatchingAttributions(tiles: Set<Tile> | undefined): BingAttribution[] {
    const matchingAttributions: BingAttribution[] = new Array<BingAttribution>();
    if (!this._attributions || !tiles)
      return matchingAttributions;

    const unmatchedSet: BingAttribution[] = this._attributions.slice();
    for (const tile of tiles) {
      if (tile instanceof MapTile)
        // compare to the set of Bing attributions that we have not yet matched.
        for (let iAttr = 0; iAttr < unmatchedSet.length; iAttr++) {
          const attribution = unmatchedSet[iAttr];
          if (attribution && attribution.matchesTile(tile, this._mapTilingScheme)) {
            matchingAttributions.push(attribution);
            delete unmatchedSet[iAttr];
          }
        }
    }
    return matchingAttributions;
  }

  public override getLogo(vp: ScreenViewport): HTMLTableRowElement | undefined {
    const tiles = IModelApp.tileAdmin.getTilesForViewport(vp)?.selected;
    const matchingAttributions = this.getMatchingAttributions(tiles);
    const copyrights: string[] = [];
    for (const match of matchingAttributions)
      copyrights.push(match.copyrightMessage);

    let copyrightMsg = "";
    for (let i = 0; i < copyrights.length; ++i) {
      if (i > 0)
        copyrightMsg += "<br>";
      copyrightMsg += copyrights[i];
    }
    return IModelApp.makeLogoCard({ iconSrc: "images/bing.svg", heading: "Microsoft Bing", notice: copyrightMsg });
  }

  // initializes the BingImageryProvider by reading the templateUrl, logo image, and attribution list.
  public override async initialize(): Promise<void> {
    // get the template url
    // NEEDSWORK - should get bing key from server. Currently coming from iModelApp defaultMapLayerOptions
    const bingRequestUrl = this._urlBase.replace("{bingKey}", this._settings.accessKey ? this._settings.accessKey.value : "");
    const requestOptions: RequestOptions = { method: "GET" };

    try {
      const response: Response = await request(this._requestContext, bingRequestUrl, requestOptions);
      const bingResponseProps: any = response.body;

      const thisResourceSetProps = bingResponseProps.resourceSets[0];
      const thisResourceProps = thisResourceSetProps.resources[0];
      this._zoomMax = thisResourceProps.zoomMax;
      this._tileHeight = thisResourceProps.imageHeight;
      this._tileWidth = thisResourceProps.imageWidth;
      this._urlTemplate = replaceHttpWithHttps(thisResourceProps.imageUrl.replace("{culture}", "en-US")); // NEEDSWORK - get locale from somewhere.
      this._urlSubdomains = thisResourceProps.imageUrlSubdomains;
      // read the list of Bing's data suppliers and the range of data they provide. Used in calculation of copyright message.
      this.readAttributions(thisResourceProps.imageryProviders);

      // Bing sometimes provides tiles that have nothing but a camera icon in the middle of them when you ask
      // for tiles at zoom levels where they don't have data. Their application stops you from zooming in when that's the
      // case, but we can't stop - the user might want to look at design data a closer zoom. So we intentionally load such
      // a tile, and then compare other tiles to it, rejecting them if they match.
      this.loadTile(0, 0, this._zoomMax - 1).then((tileData: ImageSource | undefined) => { // eslint-disable-line @typescript-eslint/no-floating-promises
        if (tileData !== undefined) this._missingTileData = tileData.data as Uint8Array;
      });
    } catch (error) {
      throw new BentleyError(IModelStatus.BadModel, "Error in Bing Server communications");
    }
  }

  // reads the list of Bing data providers and the map range for which they each provide data.
  private readAttributions(attributionProps: any) {
    for (const thisAttributionProps of attributionProps) {
      const copyrightMessage: string = thisAttributionProps.attribution;
      const coverages: Coverage[] = new Array<Coverage>();
      for (const thisCoverageProps of thisAttributionProps.coverageAreas) {
        const thisCoverage = new Coverage(thisCoverageProps.bbox[0], thisCoverageProps.bbox[1], thisCoverageProps.bbox[2], thisCoverageProps.bbox[3],
          thisCoverageProps.zoomMin, thisCoverageProps.zoomMax);
        coverages.push(thisCoverage);
      }
      const thisAttribution: BingAttribution = new BingAttribution(copyrightMessage, coverages);
      if (!this._attributions)
        this._attributions = new Array<BingAttribution>();
      this._attributions.push(thisAttribution);
    }
  }
}
