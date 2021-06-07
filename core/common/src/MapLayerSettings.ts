/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

import { BackgroundMapSettings, BackgroundMapType } from "./BackgroundMapSettings";

/** @beta */
export type SubLayerId = string | number;

/** JSON representation of the settings associated with a map sublayer included within a [[MapLayerProps]].
 * A map sub layer represents a set of objects within the layer that can be controlled separately.  These
 * are produced only from map servers that produce images on demand and are not supported by tiled (cached) servers.
 * @see [[MapLayerProps]]
 * @beta
 */
export interface MapSubLayerProps {
  name?: string;
  title?: string;
  visible?: boolean;
  id?: SubLayerId;
  parent?: SubLayerId;
  children?: SubLayerId[];
}

/** Normalized representation of a [[MapSubLayerProps]] for which values
 * have been validated and default values have been applied where explicit values not defined.
 * A map sub layer represents a set of objects within the layer that can be controlled separately.  These
 * are produced only from map servers that produce images on demand and are not supported by tiled (cached) servers.
 * This class can represent an hierarchy, in this case a sub layer is visible only if all its ancestors are also visible.
 * @see [[MapLayerSettings]]
 * @beta
 */
export class MapSubLayerSettings {
  /** Typically Name is a single word used for machine-to-machine communication while the Title is for the benefit of humans (WMS) */
  public readonly name: string;
  /** Title. */
  public readonly title?: string;
  /** If true the sub layer is visible.  If part of a hierarchy, a sub layer is visible only if its ancestors are also visible. */
  public readonly visible: boolean;
  /** A unique string or number that may be used to identify the sub layer (ArcGIS) */
  public readonly id: SubLayerId;
  /** One or more sublayer children */
  public readonly children?: SubLayerId[];
  /** sublayer parent. */
  public readonly parent?: SubLayerId;

  constructor(name: string, title?: string, visible?: boolean, id?: SubLayerId, parent?: SubLayerId, children?: SubLayerId[]) {
    this.name = name;
    this.title = title;
    this.visible = visible !== undefined && visible;
    this.id = (id === undefined) ? this.name : id;
    this.parent = parent;
    this.children = children;
  }
  /** Construct from JSON, performing validation and applying default values for undefined fields. */
  public static fromJSON(json: MapSubLayerProps): MapSubLayerSettings | undefined {
    if (undefined === json || undefined === json.name)
      return undefined;
    return new MapSubLayerSettings(json.name, json.title, json.visible, (json.id === json.name) ? undefined : json.id, json.parent, json.children);
  }
  public toJSON(): MapSubLayerProps {
    return {
      name: this.name,
      title: this.title,
      visible: this.visible,
      id: (this.id === this.name) ? undefined : this.id,
      parent: this.parent,
      children: this.children,
    };
  }
  /** Creating a copy of this MapSubLayer, optionally modifying some if its properties */
  public clone(changedProps: MapSubLayerProps): MapSubLayerSettings {
    if (undefined === changedProps)
      return this;

    const props = {
      name: undefined !== changedProps.name ? changedProps.name : this.name,
      id: undefined !== changedProps.id ? changedProps.id : this.id,
      visible: undefined !== changedProps.visible ? changedProps.visible : this.visible,
      parent: undefined !== changedProps.parent ? changedProps.parent : this.parent,
      children: undefined !== changedProps.children ? changedProps.children.slice() : this.children?.slice(),
      title: undefined !== changedProps.title ? changedProps.title : this.title,
    };
    return MapSubLayerSettings.fromJSON(props)!;
  }
  /** @internal */
  public displayMatches(other: MapSubLayerSettings): boolean {
    return this.name === other.name && this.visible === other.visible;
  }
  /** return true if this sublayer is named. */
  public get isNamed(): boolean { return this.name.length > 0; }

  /** return true if this sublayer is a leaf (has no children) */
  public get isLeaf(): boolean { return this.children === undefined || this.children.length === 0; }

  /** return true if this sublayer is an unnamed group */
  public get isUnnamedGroup(): boolean { return !this.isLeaf && !this.isNamed; }

  /** return a string representing this sublayer id (converting to string if underlying id is number) */
  public get idString(): string { return (typeof this.id === "number") ? this.id.toString(10) : this.id; }
}

/** JSON representation of the settings associated with a map layer.  One or more map layers may be included within a [[MapImageryProps]] object.
 * @see [[MapImageryProps]]
 * @beta
 */
export interface MapLayerProps {
  /** Controls visibility of layer. Defaults to 'true'. */
  visible?: boolean;
  /** Identifies the map layers source. Defaults to 'WMS'. */
  formatId?: string;
  /** Name */
  name?: string;
  /** URL */
  url?: string;
  /** Source layers. If undefined all layers are displayed. */
  subLayers?: MapSubLayerProps[];
  /** A transparency value from 0.0 (fully opaque) to 1.0 (fully transparent) to apply to map graphics when drawing,
   * or false to indicate the transparency should not be overridden. Default value: 0.
   * If omitted, defaults to 0. */
  transparency?: number;
  /** True to indicate background is transparent.  Defaults to 'true'. */
  transparentBackground?: boolean;
  /** Is a base layer.  Defaults to 'false'. */
  isBase?: boolean;
  /** Access Key for the Layer, like a subscription key or access token */
  accessKey?: MapLayerKey;
}
/**
 * stores key-value pair to be added to all requests made involving map layer.
 * @beta
 */
export interface MapLayerKey {
  key: string;
  value: string;
}

/** Normalized representation of a [[MapLayerProps]] for which values have been  validated and default values have been applied where explicit values not defined.
 * One or more map layers may be included within [[MapImagerySettings]] object.
 * @see [[MapImagerySettings]]
 * @beta
 */
export class MapLayerSettings {
  public readonly visible: boolean;
  public readonly formatId: string;
  public readonly name: string;
  public readonly url: string;
  public readonly transparency: number;
  public readonly subLayers: MapSubLayerSettings[];
  public readonly transparentBackground: boolean;
  public readonly isBase: boolean;
  public userName?: string;
  public password?: string;
  public readonly accessKey?: MapLayerKey;

  public setCredentials(userName?: string, password?: string) {
    this.userName = userName;
    this.password = password;
  }

  private constructor(url: string, name: string, formatId: string = "WMS", visible = true,
    jsonSubLayers: MapSubLayerProps[] | undefined = undefined, transparency: number = 0,
    transparentBackground = true, isBase = false, userName?: string, password?: string, accessKey?: MapLayerKey) {
    this.formatId = formatId;
    this.name = name;
    this.visible = visible;
    this.transparentBackground = transparentBackground;
    this.isBase = isBase;
    this.subLayers = new Array<MapSubLayerSettings>();
    if (jsonSubLayers !== undefined) {
      let hasUnnamedGroups = false;
      for (const jsonSubLayer of jsonSubLayers) {
        const subLayer = MapSubLayerSettings.fromJSON(jsonSubLayer);
        if (undefined !== subLayer) {
          this.subLayers.push(subLayer);
          if (subLayer.children?.length !== 0 && !subLayer.isNamed && !hasUnnamedGroups)
            hasUnnamedGroups = true;
        }
      }

      this.userName = userName;
      this.password = password;
    }
    this.accessKey = accessKey;
    this.transparency = transparency;
    this.url = url;
  }
  /** Construct from JSON, performing validation and applying default values for undefined fields. */
  public static fromJSON(json?: MapLayerProps): MapLayerSettings | undefined {
    if (json === undefined || json.url === undefined || undefined === json.name)
      return undefined;

    const transparentBackground = (json.transparentBackground === undefined) ? true : json.transparentBackground;
    return new MapLayerSettings(json.url, json.name, json.formatId, json.visible, json.subLayers, json.transparency, transparentBackground, json.isBase === true, undefined, undefined, json.accessKey);
  }
  /** return JSON representation of this MapLayerSettings object */
  public toJSON(): MapLayerProps {
    const props: MapLayerProps = {};
    if (this.subLayers) {
      props.subLayers = [];
      this.subLayers.forEach((subLayer) => {
        const subLayerJson = subLayer.toJSON();
        if (subLayerJson)
          props.subLayers!.push(subLayerJson);
      });
    }
    props.formatId = this.formatId;
    props.name = this.name;
    props.url = this.url;
    props.accessKey = this.accessKey;
    if (0 !== this.transparency)
      props.transparency = this.transparency;
    if (this.transparentBackground === false)
      props.transparentBackground = this.transparentBackground;
    if (this.isBase === true)
      props.isBase = this.isBase;
    props.visible = this.visible;
    return props;
  }

  /** @internal */
  private static mapTypeName(type: BackgroundMapType) {   // TBD.. Localization.
    switch (type) {
      case BackgroundMapType.Aerial:
        return "Aerial Imagery";
      default:
      case BackgroundMapType.Hybrid:
        return "Aerial Imagery with labels";
      case BackgroundMapType.Street:
        return "Streets";
    }
  }
  /** Create a [[MapLayerSettings]] object from the image settings within a [[BackgroundMapSettings]] object (providerName and mapType).  */
  public static fromMapSettings(mapSettings: BackgroundMapSettings): MapLayerSettings {
    let formatId: string, url: string, name: string;
    switch (mapSettings.providerName) {
      case "BingProvider":
      default:
        formatId = "BingMaps";

        let imagerySet;
        switch (mapSettings.mapType) {
          case BackgroundMapType.Street:
            imagerySet = "Road";
            break;
          case BackgroundMapType.Aerial:
            imagerySet = "Aerial";
            break;
          case BackgroundMapType.Hybrid:
          default:
            imagerySet = "AerialWithLabels";
            break;
        }
        name = `Bing Maps: ${MapLayerSettings.mapTypeName(mapSettings.mapType)}`;
        url = `https://dev.virtualearth.net/REST/v1/Imagery/Metadata/${imagerySet}?o=json&incl=ImageryProviders&key={bingKey}`;
        break;

      case "MapBoxProvider":
        formatId = "MapboxImagery";
        name = `MapBox: ${MapLayerSettings.mapTypeName(mapSettings.mapType)}`;
        switch (mapSettings.mapType) {
          case BackgroundMapType.Street:
            url = "https://api.mapbox.com/v4/mapbox.streets/";
            break;
          case BackgroundMapType.Aerial:
            url = "https://api.mapbox.com/v4/mapbox.satellite/";
            break;
          case BackgroundMapType.Hybrid:
            url = "https://api.mapbox.com/v4/mapbox.streets-satellite/";
            break;
        }
        break;
    }
    return MapLayerSettings.fromJSON({ name, formatId, url, transparentBackground: false, isBase: true })!;
  }

  /** Create a copy of this MapLayerSettings, optionally modifying some of its properties.
   * @param changedProps JSON representation of the properties to change.
   * @returns A MapLayerSettings with all of its properties set to match those of `this`, except those explicitly defined in `changedProps`.
   */
  public clone(changedProps: MapLayerProps): MapLayerSettings {
    if (undefined === changedProps)
      return this;

    const props = {
      name: undefined !== changedProps.name ? changedProps.name : this.name,
      formatId: undefined !== changedProps.formatId ? changedProps.formatId : this.formatId,
      visible: undefined !== changedProps.visible ? changedProps.visible : this.visible,
      url: undefined !== changedProps.url ? changedProps.url : this.url,
      transparency: undefined !== changedProps.transparency ? changedProps.transparency : this.transparency,
      transparentBackground: undefined !== changedProps.transparentBackground ? changedProps.transparentBackground : this.transparentBackground,
      subLayers: undefined !== changedProps.subLayers ? changedProps.subLayers : this.subLayers,
      accessKey: undefined !== changedProps.accessKey ? changedProps.accessKey : this.accessKey,
    };
    const clone = MapLayerSettings.fromJSON(props)!;

    // Clone members not part of MapLayerProps
    clone.userName = this.userName;
    clone.password = this.password;

    return clone;
  }

  /** @internal */
  public displayMatches(other: MapLayerSettings): boolean {
    if (!this.matchesNameAndUrl(other.name, other.url)
      || this.visible !== other.visible
      || this.transparency !== other.transparency
      || this.transparentBackground !== other.transparentBackground
      || this.subLayers.length !== other.subLayers.length) {
      return false;
    }

    if (this.userName !== other.userName || this.password !== other.password) {
      return false;
    }

    for (let i = 0; i < this.subLayers.length; i++)
      if (!this.subLayers[i].displayMatches(other.subLayers[i]))
        return false;

    return true;
  }

  /** @internal */
  public matchesNameAndUrl(name: string, url: string): boolean {
    return this.name === name && this.url === url;
  }

  /** Return a sublayer matching id -- or undefined if not found */
  public subLayerById(id?: SubLayerId): MapSubLayerSettings | undefined {
    return id === undefined ? undefined : this.subLayers.find((subLayer) => subLayer.id === id);
  }

  private hasInvisibleAncestors(subLayer?: MapSubLayerSettings): boolean {
    if (!subLayer || !subLayer.parent)
      return false;

    const parent = this.subLayerById(subLayer.parent);
    if (!parent)
      return false;

    // Visibility of named group has no impact on the visibility of children (only unnamed group does)
    // i.e For WMS, its should be possible to request a child layer when its parent is not visible (if the parent is also named)
    return (!parent.visible && !parent.isNamed) || this.hasInvisibleAncestors(parent);
  }

  /** Return true if sublayer is visible -- testing ancestors for visibility if they exist. */
  public isSubLayerVisible(subLayer: MapSubLayerSettings): boolean {
    if (!subLayer.visible)
      return false;

    return !this.hasInvisibleAncestors(subLayer);
  }

  /** Return true if all sublayers are visible. */
  public get allSubLayersInvisible(): boolean {
    if (this.subLayers.length === 0)
      return false;

    return this.subLayers.every((subLayer) => (subLayer.isUnnamedGroup || !this.isSubLayerVisible(subLayer)));
  }

  /** Return the children for a sublayer */
  public getSubLayerChildren(subLayer: MapSubLayerSettings): MapSubLayerSettings[] | undefined {
    if (!subLayer.children)
      return undefined;

    const children = new Array<MapSubLayerSettings>();
    subLayer.children.forEach((childId) => {
      const child = this.subLayerById(childId);
      if (child !== undefined)
        children.push(child);
    });

    return children;
  }
}
