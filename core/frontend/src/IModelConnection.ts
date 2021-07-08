/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModelConnection
 */

import {
  assert, BeEvent, GeoServiceStatus, GuidString, Id64, Id64Arg, Id64Set, Id64String, Logger, OneAtATimeAction, OpenMode, TransientIdSequence,
} from "@bentley/bentleyjs-core";
import { Point3d, Range3d, Range3dProps, Transform, XYAndZ, XYZProps } from "@bentley/geometry-core";
import {
  AxisAlignedBox3d, Cartographic, CodeProps, CodeSpec, DbResult, EcefLocation, EcefLocationProps, ElementLoadOptions, ElementProps, EntityQueryParams, FontMap, FontMapProps,
  GeoCoordStatus, GeometryContainmentRequestProps, GeometryContainmentResponseProps, GeometrySummaryRequestProps, ImageSourceFormat, IModel, IModelConnectionProps, IModelError,
  IModelReadRpcInterface, IModelStatus, IModelWriteRpcInterface, mapToGeoServiceStatus, MassPropertiesRequestProps, MassPropertiesResponseProps,
  ModelProps, ModelQueryParams, QueryLimit, QueryPriority, QueryQuota, QueryResponse, QueryResponseStatus, RpcManager, SnapRequestProps,
  SnapResponseProps, SnapshotIModelRpcInterface, TextureLoadProps, ThumbnailProps, ViewDefinitionProps, ViewQueryParams, ViewStateLoadProps,
} from "@bentley/imodeljs-common";
import { BriefcaseConnection } from "./BriefcaseConnection";
import { CheckpointConnection, RemoteBriefcaseConnection } from "./CheckpointConnection";
import { EntityState } from "./EntityState";
import { FrontendLoggerCategory } from "./FrontendLoggerCategory";
import { GeoServices } from "./GeoServices";
import { IModelApp } from "./IModelApp";
import { IModelRoutingContext } from "./IModelRoutingContext";
import { ModelState } from "./ModelState";
import { HiliteSet, SelectionSet } from "./SelectionSet";
import { SubCategoriesCache } from "./SubCategoriesCache";
import { BingElevationProvider } from "./tile/map/BingElevation";
import { Tiles } from "./Tiles";
import { ViewState } from "./ViewState";

const loggerCategory: string = FrontendLoggerCategory.IModelConnection;

/** The properties for creating a [Blank IModelConnection]($docs/learning/frontend/BlankConnection)
 * @public
 */
export interface BlankConnectionProps {
  /** A name for this blank connection. */
  name: string;
  /** The spatial location for the blank connection. */
  location: Cartographic | EcefLocationProps;
  /** The volume of interest, in meters, centered around `location` */
  extents: Range3dProps;
  /** An offset to be applied to all spatial coordinates. */
  globalOrigin?: XYZProps;
  /** The optional Guid that identifies the *context* associated with the [[BlankConnection]]. */
  contextId?: GuidString;
}

/** A connection to a [IModelDb]($backend) hosted on the backend.
 * @public
 */
export abstract class IModelConnection extends IModel {
  /** The [[ModelState]]s in this IModelConnection. */
  public readonly models: IModelConnection.Models;
  /** The [[ElementState]]s in this IModelConnection. */
  public readonly elements: IModelConnection.Elements;
  /** The [[CodeSpec]]s in this IModelConnection. */
  public readonly codeSpecs: IModelConnection.CodeSpecs;
  /** The [[ViewState]]s in this IModelConnection. */
  public readonly views: IModelConnection.Views;
  /** The set of currently hilited elements for this IModelConnection. */
  public readonly hilited: HiliteSet;
  /** The set of currently selected elements for this IModelConnection. */
  public readonly selectionSet: SelectionSet;
  /** The set of Tiles for this IModelConnection. */
  public readonly tiles: Tiles;
  /** A cache of information about SubCategories chiefly used for rendering.
   * @internal
   */
  public readonly subcategories: SubCategoriesCache;
  /** Generator for unique Ids of transient graphics for this IModelConnection. */
  public readonly transientIds = new TransientIdSequence();
  /** The Geographic location services available for this iModelConnection
   * @internal
   */
  public readonly geoServices: GeoServices;
  /** @internal Whether GCS has been disabled for this iModelConnection. */
  protected _gcsDisabled = false;
  /** @internal Return true if a GCS is not defined for this iModelConnection; also returns true if GCS is defined but disabled. */
  public get noGcsDefined(): boolean { return this._gcsDisabled || undefined === this.geographicCoordinateSystem; }
  /** @internal */
  public disableGCS(disable: boolean): void { this._gcsDisabled = disable; }
  /** The displayed extents of this iModel, initialized to [IModel.projectExtents]($common). The displayed extents can be made larger via
   * [[expandDisplayedExtents]], but never smaller, to accomodate data sources like reality models that may exceed the project extents.
   * @note Do not modify these extents directly - use [[expandDisplayedExtents]] only.
   */
  public readonly displayedExtents: AxisAlignedBox3d;
  private readonly _extentsExpansion = Range3d.createNull();
  /** The maximum time (in milliseconds) to wait before timing out the request to open a connection to a new iModel */
  public static connectionTimeout: number = 10 * 60 * 1000;

  /** The RPC routing for this connection.  */
  public routingContext: IModelRoutingContext = IModelRoutingContext.default;

  /** Type guard for instanceof [[BriefcaseConnection]] */
  public isBriefcaseConnection(): this is BriefcaseConnection { return false; }

  /** Type guard for instanceof [[RemoteBriefcaseConnection]]
   * @deprecated use BriefcaseConnection with an IpcApp
   */
  public isRemoteBriefcaseConnection(): this is RemoteBriefcaseConnection { return false; } // eslint-disable-line deprecation/deprecation

  /** Type guard for instanceof [[CheckpointConnection]]
   * @beta
  */
  public isCheckpointConnection(): this is CheckpointConnection { return false; }

  /** Type guard for instanceof [[SnapshotConnection]] */
  public isSnapshotConnection(): this is SnapshotConnection { return false; }

  /** Type guard for instanceof [[BlankConnection]] */
  public isBlankConnection(): this is BlankConnection { return false; }

  /** Returns `true` if this is a briefcase copy of an iModel that is synchronized with iModelHub. */
  public get isBriefcase(): boolean { return this.isBriefcaseConnection(); }

  /** Returns `true` if this is a *snapshot* iModel.
   * @see [[SnapshotConnection.openSnapshot]]
   */
  public get isSnapshot(): boolean { return this.isSnapshotConnection(); }

  /** True if this is a [Blank Connection]($docs/learning/frontend/BlankConnection).  */
  public get isBlank(): boolean { return this.isBlankConnection(); }

  /** Check the [[openMode]] of this IModelConnection to see if it was opened read-only. */
  public get isReadonly(): boolean { return this.openMode === OpenMode.Readonly; }

  /** Check if the IModelConnection is open (i.e. it has a *connection* to a backend server).
   * Returns false for [[BlankConnection]] instances and after [[IModelConnection.close]] has been called.
   * @note no RPC operations are valid on this IModelConnection if this method returns false.
   */
  public get isOpen(): boolean { return !this.isClosed; }

  /** Check if the IModelConnection is closed (i.e. it has no *connection* to a backend server).
   * Returns true for [[BlankConnection]] instances and after [[IModelConnection.close]] has been called.
   * @note no RPC operations are valid on this IModelConnection if this method returns true.
   */
  public abstract get isClosed(): boolean;

  /** Event called immediately before *any* IModelConnection is closed.
   * @note This static event is called when *any* IModelConnection is closed, and the specific IModelConnection is passed as its argument. To
   * monitor closing a specific IModelConnection, use the `onClose` instance event.
   * @note Be careful not to perform any asynchronous operations on the IModelConnection because it will close before they are processed.
   */
  public static readonly onClose = new BeEvent<(_imodel: IModelConnection) => void>();

  /** Event called immediately after *any* IModelConnection is opened. */
  public static readonly onOpen = new BeEvent<(_imodel: IModelConnection) => void>();

  /** Event called immediately before *this* IModelConnection is closed.
   * @note This event is called only for this IModelConnection. To monitor *all* IModelConnections,use the static event.
   * @note Be careful not to perform any asynchronous operations on the IModelConnection because it will close before they are processed.
   * @beta
   */
  public readonly onClose = new BeEvent<(_imodel: IModelConnection) => void>();

  /** The font map for this IModelConnection. Only valid after calling #loadFontMap and waiting for the returned promise to be fulfilled. */
  public fontMap?: FontMap;

  /** Load the FontMap for this IModelConnection.
   * @returns Returns a Promise<FontMap> that is fulfilled when the FontMap member of this IModelConnection is valid.
   */
  public async loadFontMap(): Promise<FontMap> {
    if (undefined === this.fontMap) {
      this.fontMap = new FontMap();
      if (this.isOpen) {
        const fontProps = JSON.parse(await IModelReadRpcInterface.getClientForRouting(this.routingContext.token).readFontJson(this.getRpcProps())) as FontMapProps;
        this.fontMap.addFonts(fontProps.fonts);
      }
    }
    return this.fontMap;
  }

  /** Find the first registered base class of the given EntityState className. This class will "handle" the State for the supplied className.
   * @param className The full name of the class of interest.
   * @param defaultClass If no base class of the className is registered, return this value.
   * @note this method is async since it may have to query the server to get the class hierarchy.
   */
  public async findClassFor<T extends typeof EntityState>(className: string, defaultClass: T | undefined): Promise<T | undefined> {
    let ctor = IModelApp.lookupEntityClass(className) as T | undefined;
    if (undefined !== ctor)
      return ctor;

    // it's not registered, we need to query its class hierarchy.
    ctor = defaultClass; // in case we cant find a registered class that handles this class

    // wait until we get the full list of base classes from backend
    if (this.isOpen) {
      const baseClasses = await IModelReadRpcInterface.getClientForRouting(this.routingContext.token).getClassHierarchy(this.getRpcProps(), className);

      // Make sure some other async code didn't register this class while we were await-ing above
      ctor = IModelApp.lookupEntityClass(className) as T | undefined;
      if (undefined !== ctor)
        return ctor;

      // walk through the list until we find a registered base class
      baseClasses.some((baseClass: string) => {
        const test = IModelApp.lookupEntityClass(baseClass) as T | undefined;
        if (test === undefined)
          return false; // nope, not registered

        ctor = test; // found it, save it
        IModelApp.registerEntityState(className, ctor); // and register the fact that our starting class is handled by this subclass.
        return true; // stop
      });
    }
    return ctor; // either the baseClass handler or defaultClass if we didn't find a registered baseClass
  }

  /** @internal */
  protected constructor(iModelProps: IModelConnectionProps) {
    super(iModelProps, iModelProps.openMode ?? OpenMode.Readonly);
    super.initialize(iModelProps.name!, iModelProps);
    this.models = new IModelConnection.Models(this);
    this.elements = new IModelConnection.Elements(this);
    this.codeSpecs = new IModelConnection.CodeSpecs(this);
    this.views = new IModelConnection.Views(this);
    this.selectionSet = new SelectionSet(this);
    this.hilited = new HiliteSet(this);
    this.tiles = new Tiles(this);
    this.subcategories = new SubCategoriesCache(this);
    this.geoServices = new GeoServices(this);
    this.displayedExtents = Range3d.fromJSON(this.projectExtents);

    this.onProjectExtentsChanged.addListener(() => {
      // Compute new displayed extents as the union of the ranges we previously expanded by with the new project extents.
      this.expandDisplayedExtents(this._extentsExpansion);
    });
  }

  /** Called prior to connection closing. Raises close events and calls tiles.dispose.
   * @internal
   */
  protected beforeClose(): void {
    this.onClose.raiseEvent(this); // event for this connection
    IModelConnection.onClose.raiseEvent(this); // event for all connections
    this.tiles.dispose();
    this.subcategories.onIModelConnectionClose();
  }

  /** Close this IModelConnection. */
  public abstract close(): Promise<void>;

  /** Compute number of rows that would be returned by the ECSQL.
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @returns Return row count.
   * @throws [IModelError]($common) If the statement is invalid
   */
  public async queryRowCount(ecsql: string, bindings?: any[] | object): Promise<number> {
    for await (const row of this.query(`select count(*) nRows from (${ecsql})`, bindings)) {
      return row.nRows;
    }
    Logger.logError(loggerCategory, "IModelConnection.queryRowCount", () => ({ ...this.getRpcProps(), ecsql, bindings }));
    throw new IModelError(DbResult.BE_SQLITE_ERROR, "Failed to get row count");
  }

  /** Execute a query against this ECDb but restricted by quota and limit settings. This is intended to be used internally
   * The result of the query is returned as an array of JavaScript objects where every array element represents an
   * [ECSQL row]($docs/learning/ECSQLRowFormat).
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @param limitRows Specify upper limit for rows that can be returned by the query.
   * @param quota Specify non binding quota. These values are constrained by global setting
   * but never the less can be specified to narrow down the quota constraint for the query but staying under global settings.
   * @param priority Specify non binding priority for the query. It can help user to adjust
   * priority of query in queue so that small and quicker queries can be prioritized over others.
   * @param restartToken when provide cancel the previous query with same token in same session.
   * @returns Returns structure containing rows and status.
   * See [ECSQL row format]($docs/learning/ECSQLRowFormat) for details about the format of the returned rows.
   * @internal
   */
  public async queryRows(ecsql: string, bindings?: any[] | object, limit?: QueryLimit, quota?: QueryQuota, priority?: QueryPriority, restartToken?: string, abbreviateBlobs?: boolean): Promise<QueryResponse> {

    return IModelReadRpcInterface.getClientForRouting(this.routingContext.token).queryRows(this.getRpcProps(), ecsql, bindings, limit, quota, priority, restartToken, abbreviateBlobs);
  }

  /** Execute a query and stream its results
   * The result of the query is async iterator over the rows. The iterator will get next page automatically once rows in current page has been read.
   * [ECSQL row]($docs/learning/ECSQLRowFormat).
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @param limitRows Specify upper limit for rows that can be returned by the query.
   * @param quota Specify non binding quota. These values are constrained by global setting
   * but never the less can be specified to narrow down the quota constraint for the query but staying under global settings.
   * @param priority Specify non binding priority for the query. It can help user to adjust
   * priority of query in queue so that small and quicker queries can be prioritized over others.
   * @returns Returns the query result as an *AsyncIterableIterator<any>*  which lazy load result as needed
   * See [ECSQL row format]($docs/learning/ECSQLRowFormat) for details about the format of the returned rows.
   * @throws [IModelError]($common) If there was any error while submitting, preparing or stepping into query
   */
  public async * query(ecsql: string, bindings?: any[] | object, limitRows?: number, quota?: QueryQuota, priority?: QueryPriority, abbreviateBlobs?: boolean): AsyncIterableIterator<any> {
    let result: QueryResponse;
    let offset: number = 0;
    let rowsToGet = limitRows ? limitRows : -1;
    do {
      result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, undefined, abbreviateBlobs);
      while (result.status === QueryResponseStatus.Timeout) {
        result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, undefined, abbreviateBlobs);
      }

      if (result.status === QueryResponseStatus.Error) {
        if (result.rows[0] === undefined) {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, "Invalid ECSql");
        } else {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, result.rows[0]);
        }
      }

      if (rowsToGet > 0) {
        rowsToGet -= result.rows.length;
      }
      offset += result.rows.length;

      for (const row of result.rows)
        yield row;

    } while (result.status !== QueryResponseStatus.Done);
  }

  /** Execute a query and stream its results
   * The result of the query is async iterator over the rows. The iterator will get next page automatically once rows in current page has been read.
   * [ECSQL row]($docs/learning/ECSQLRowFormat).
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param token None empty restart token. The previous query with same token would be cancelled. This would cause
   * exception which user code must handle.
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @param limitRows Specify upper limit for rows that can be returned by the query.
   * @param quota Specify non binding quota. These values are constrained by global setting
   * but never the less can be specified to narrow down the quota constraint for the query but staying under global settings.
   * @param priority Specify non binding priority for the query. It can help user to adjust
   * priority of query in queue so that small and quicker queries can be prioritized over others.
   * @returns Returns the query result as an *AsyncIterableIterator<any>*  which lazy load result as needed
   * See [ECSQL row format]($docs/learning/ECSQLRowFormat) for details about the format of the returned rows.
   * @throws [IModelError]($common) If there was any error while submitting, preparing or stepping into query
   * @beta
   */
  public async * restartQuery(token: string, ecsql: string, bindings?: any[] | object, limitRows?: number, quota?: QueryQuota, priority?: QueryPriority): AsyncIterableIterator<any> {
    let result: QueryResponse;
    let offset: number = 0;
    let rowsToGet = limitRows ? limitRows : -1;
    do {
      result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, token);
      while (result.status === QueryResponseStatus.Timeout) {
        result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, token);
      }
      if (result.status === QueryResponseStatus.Cancelled) {
        throw new IModelError(DbResult.BE_SQLITE_INTERRUPT, `Query cancelled`);
      } else if (result.status === QueryResponseStatus.Error) {
        if (result.rows[0] === undefined) {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, "Invalid ECSql");
        } else {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, result.rows[0]);
        }
      }

      if (rowsToGet > 0) {
        rowsToGet -= result.rows.length;
      }
      offset += result.rows.length;

      for (const row of result.rows)
        yield row;

    } while (result.status !== QueryResponseStatus.Done);
  }

  /** Query for a set of element ids that satisfy the supplied query params
   * @param params The query parameters. The `limit` and `offset` members should be used to page results.
   * @throws [IModelError]($common) If the generated statement is invalid or would return too many rows.
   */
  public async queryEntityIds(params: EntityQueryParams): Promise<Id64Set> {
    return new Set(this.isOpen ? await IModelReadRpcInterface.getClientForRouting(this.routingContext.token).queryEntityIds(this.getRpcProps(), params) : undefined);
  }

  private _snapRpc = new OneAtATimeAction<SnapResponseProps>(async (props: SnapRequestProps) => IModelReadRpcInterface.getClientForRouting(this.routingContext.token).requestSnap(this.getRpcProps(), IModelApp.sessionId, props));
  /** Request a snap from the backend.
   * @note callers must gracefully handle Promise rejected with AbandonedError
   * @internal
   */
  public async requestSnap(props: SnapRequestProps): Promise<SnapResponseProps> {
    return this.isOpen ? this._snapRpc.request(props) : { status: 2 };
  }

  private _toolTipRpc = new OneAtATimeAction<string[]>(async (id: string) => IModelReadRpcInterface.getClientForRouting(this.routingContext.token).getToolTipMessage(this.getRpcProps(), id));
  /** Request a tooltip from the backend.
   * @note If another call to this method occurs before preceding call(s) return, all preceding calls will be abandoned - only the most recent will resolve. Therefore callers must gracefully handle Promise rejected with AbandonedError.
   */
  public async getToolTipMessage(id: Id64String): Promise<string[]> {
    return this.isOpen ? this._toolTipRpc.request(id) : [];
  }

  /** Request element clip containment status from the backend. */
  public async getGeometryContainment(requestProps: GeometryContainmentRequestProps): Promise<GeometryContainmentResponseProps> { return IModelReadRpcInterface.getClientForRouting(this.routingContext.token).getGeometryContainment(this.getRpcProps(), requestProps); }

  /** Obtain a summary of the geometry belonging to one or more [GeometricElement]($backend)s suitable for debugging and diagnostics.
   * @param requestProps Specifies the elements to query and options for how to format the output.
   * @returns A string containing the summary, typically consisting of multiple lines.
   * @note Trying to parse the output to programatically inspect an element's geometry is not recommended.
   * @see [GeometryStreamIterator]($common) to more directly inspect a geometry stream.
   */
  public async getGeometrySummary(requestProps: GeometrySummaryRequestProps): Promise<string> {
    return IModelReadRpcInterface.getClientForRouting(this.routingContext.token).getGeometrySummary(this.getRpcProps(), requestProps);
  }

  /** Request a named texture image from the backend.
   * @param textureLoadProps The texture load properties which must contain a name property (a valid 64-bit integer identifier). It optionally can contain the maximum texture size supported by the client.
   * @see [[Id64]]
   * @public
   */
  public async getTextureImage(textureLoadProps: TextureLoadProps): Promise<Uint8Array | undefined> {
    if (this.isOpen) {
      const rpcClient = IModelReadRpcInterface.getClientForRouting(this.routingContext.token);
      const img = rpcClient.getTextureImage(this.getRpcProps(), textureLoadProps);
      return img;
    }
    return undefined;
  }

  /** Request element mass properties from the backend. */
  public async getMassProperties(requestProps: MassPropertiesRequestProps): Promise<MassPropertiesResponseProps> { return IModelReadRpcInterface.getClientForRouting(this.routingContext.token).getMassProperties(this.getRpcProps(), requestProps); }

  /** Convert a point in this iModel's Spatial coordinates to a [[Cartographic]] using the Geographic location services for this IModelConnection.
   * @param spatial A point in the iModel's spatial coordinates
   * @param result If defined, use this for output
   * @returns A Cartographic location
   * @throws IModelError if [[isGeoLocated]] is false or point could not be converted.
   */
  public async spatialToCartographicFromGcs(spatial: XYAndZ, result?: Cartographic): Promise<Cartographic> {
    if (!this.isGeoLocated && this.noGcsDefined)
      throw new IModelError(GeoServiceStatus.NoGeoLocation, "iModel is not GeoLocated");

    const geoConverter = this.geoServices.getConverter()!;
    const coordResponse = await geoConverter.getGeoCoordinatesFromIModelCoordinates([spatial]);

    if (1 !== coordResponse.geoCoords.length || GeoCoordStatus.NoGCSDefined === coordResponse.geoCoords[0].s)
      throw new IModelError(GeoServiceStatus.NoGeoLocation, "iModel is not GeoLocated");

    if (GeoCoordStatus.Success !== coordResponse.geoCoords[0].s) {
      const geoServiceStatus = mapToGeoServiceStatus(coordResponse.geoCoords[0].s);
      throw new IModelError(geoServiceStatus, "Error converting spatial to cartographic");
    }

    const longLatHeight = Point3d.fromJSON(coordResponse.geoCoords[0].p); // x is longitude in degrees, y is latitude in degrees, z is height in meters...
    return Cartographic.fromDegrees(longLatHeight.x, longLatHeight.y, longLatHeight.z, result);
  }

  /** Convert a point in this iModel's Spatial coordinates to a [[Cartographic]] using the Geographic location services for this IModelConnection or [[IModel.ecefLocation]].
   * @param spatial A point in the iModel's spatial coordinates
   * @param result If defined, use this for output
   * @returns A Cartographic location
   * @throws IModelError if [[isGeoLocated]] is false or point could not be converted.
   * @see [[spatialToCartographicFromGcs]]
   * @see [[spatialToCartographicFromEcef]]
   */
  public async spatialToCartographic(spatial: XYAndZ, result?: Cartographic): Promise<Cartographic> {
    return (this.noGcsDefined ? this.spatialToCartographicFromEcef(spatial, result) : this.spatialToCartographicFromGcs(spatial, result));
  }

  /** Convert a [[Cartographic]] to a point in this iModel's Spatial coordinates using the Geographic location services for this IModelConnection.
   * @param cartographic A cartographic location
   * @param result If defined, use this for output
   * @returns A point in this iModel's spatial coordinates
   * @throws IModelError if [[isGeoLocated]] is false or cartographic location could not be converted.
   */
  public async cartographicToSpatialFromGcs(cartographic: Cartographic, result?: Point3d): Promise<Point3d> {
    if (!this.isGeoLocated && this.noGcsDefined)
      throw new IModelError(GeoServiceStatus.NoGeoLocation, "iModel is not GeoLocated");

    const geoConverter = this.geoServices.getConverter()!;
    const geoCoord = Point3d.create(cartographic.longitudeDegrees, cartographic.latitudeDegrees, cartographic.height); // x is longitude in degrees, y is latitude in degrees, z is height in meters...
    const coordResponse = await geoConverter.getIModelCoordinatesFromGeoCoordinates([geoCoord]);

    if (1 !== coordResponse.iModelCoords.length || GeoCoordStatus.NoGCSDefined === coordResponse.iModelCoords[0].s)
      throw new IModelError(GeoServiceStatus.NoGeoLocation, "iModel is not GeoLocated");

    if (GeoCoordStatus.Success !== coordResponse.iModelCoords[0].s) {
      const geoServiceStatus = mapToGeoServiceStatus(coordResponse.iModelCoords[0].s);
      throw new IModelError(geoServiceStatus, "Error converting cartographic to spatial");
    }

    result = result ? result : Point3d.createZero();
    result.setFromJSON(coordResponse.iModelCoords[0].p);
    return result;
  }

  /** Convert a [[Cartographic]] to a point in this iModel's Spatial coordinates using the Geographic location services for this IModelConnection or [[IModel.ecefLocation]].
   * @param cartographic A cartographic location
   * @param result If defined, use this for output
   * @returns A point in this iModel's spatial coordinates
   * @throws IModelError if [[isGeoLocated]] is false or cartographic location could not be converted.
   * @see [[cartographicToSpatialFromGcs]]
   * @see [[cartographicToSpatialFromEcef]]
   */
  public async cartographicToSpatial(cartographic: Cartographic, result?: Point3d): Promise<Point3d> {
    return (this.noGcsDefined ? this.cartographicToSpatialFromEcef(cartographic, result) : this.cartographicToSpatialFromGcs(cartographic, result));
  }

  /** Expand this iModel's [[displayedExtents]] to include the specified range.
   * This is done automatically when reality models are added to a spatial view. In some cases a [[TiledGraphicsProvider]] may wish to expand
   * the extents explicitly to include its geometry.
   */
  public expandDisplayedExtents(range: Range3d): void {
    this._extentsExpansion.extendRange(range);
    this.displayedExtents.setFrom(this.projectExtents);
    this.displayedExtents.extendRange(this._extentsExpansion);

    for (const vp of IModelApp.viewManager) {
      if (vp.view.isSpatialView() && vp.iModel === this)
        vp.invalidateController();
    }
  }

  /** @internal */
  public getMapEcefToDb(bimElevationBias: number): Transform {
    if (!this.ecefLocation)
      return Transform.createIdentity();

    const mapEcefToDb = this.ecefLocation.getTransform().inverse();
    if (!mapEcefToDb) {
      assert(false);
      return Transform.createIdentity();
    }
    mapEcefToDb.origin.z += bimElevationBias;

    return mapEcefToDb;
  }
  private _geodeticToSeaLevel?: number | Promise<number>;
  private _projectCenterAltitude?: number | Promise<number>;

  /** Event called immediately after map elevation request is completed.  This occurs only in the case where background map terrain is displayed
   * with either geiod or ground offset.   These require a query to BingElevation and therefore synching the view may be required
   * when the request is completed.
   * @internal
   */
  public readonly onMapElevationLoaded = new BeEvent<(_imodel: IModelConnection) => void>();

  /** The offset between sea level and the geodetic ellipsoid.  This will return undefined only if the request for the offset to Bing Elevation
   * is required, and in this case the [[onMapElevationLoaded]] event is raised when the request is completed.
   * @internal
   */
  public get geodeticToSeaLevel(): number | undefined {
    if (undefined === this._geodeticToSeaLevel) {
      const elevationProvider = new BingElevationProvider();
      this._geodeticToSeaLevel = elevationProvider.getGeodeticToSeaLevelOffset(this.projectExtents.center, this);
      this._geodeticToSeaLevel.then((geodeticToSeaLevel) => {
        this._geodeticToSeaLevel = geodeticToSeaLevel;
        this.onMapElevationLoaded.raiseEvent(this);
      }).catch((_error) => this._geodeticToSeaLevel = 0.0);
    }
    return ("number" === typeof this._geodeticToSeaLevel) ? this._geodeticToSeaLevel : undefined;
  }

  /** The altitude (geodetic) at the project center.  This will return undefined only if the request for the offset to Bing Elevation
   * is required, and in this case the [[onMapElevationLoaded]] event is raised when the request is completed.
   * @internal
   */
  public get projectCenterAltitude(): number | undefined {
    if (undefined === this._projectCenterAltitude) {
      const elevationProvider = new BingElevationProvider();
      this._projectCenterAltitude =  elevationProvider.getHeightValue(this.projectExtents.center, this);
      this._projectCenterAltitude.then((projectCenterAltitude) => {
        this._projectCenterAltitude = projectCenterAltitude;
        this.onMapElevationLoaded.raiseEvent(this);
      }).catch((_error) => this._projectCenterAltitude = 0.0);
    }
    return  ("number" === typeof this._projectCenterAltitude) ? this._projectCenterAltitude : undefined;
  }
}

/** A connection that exists without an iModel. Useful for connecting to Reality Data services.
 * @note This class exists because our display system requires an IModelConnection type even if only reality data is drawn.
 * @public
 */
export class BlankConnection extends IModelConnection {
  public override isBlankConnection(): this is BlankConnection { return true; }

  /** The Guid that identifies the *context* for this BlankConnection.
   * @note This can also be set via the [[create]] method using [[BlankConnectionProps.contextId]].
   */
  public override get contextId(): GuidString | undefined { return this._contextId; }
  public override set contextId(contextId: GuidString | undefined) { this._contextId = contextId; }
  /** A BlankConnection does not have an associated iModel, so its `iModelId` is alway `undefined`. */
  public override get iModelId(): undefined { return undefined; } // GuidString | undefined for the superclass, but always undefined for BlankConnection

  /** A BlankConnection is always considered closed because it does not have a specific backend nor associated iModel.
   * @returns `true` is always returned since RPC operations and iModel queries are not valid.
   * @note Even though true is always returned, it is still valid to call [[close]] to dispose frontend resources.
   */
  public get isClosed(): boolean { return true; }

  /** Create a new [Blank IModelConnection]($docs/learning/frontend/BlankConnection).
   * @param props The properties to use for the new BlankConnection.
   */
  public static create(props: BlankConnectionProps): BlankConnection {
    return new this({
      rootSubject: { name: props.name },
      projectExtents: props.extents,
      globalOrigin: props.globalOrigin,
      ecefLocation: props.location instanceof Cartographic ? EcefLocation.createFromCartographicOrigin(props.location) : props.location,
      key: "",
      contextId: props.contextId,
    });
  }

  /** There are no connections to the backend to close in the case of a BlankConnection.
   * However, there are frontend resources (like the tile cache) that can be disposed.
   * @note A BlankConnection should not be used after calling `close`.
   */
  public async close(): Promise<void> {
    this.beforeClose();
  }

  /** @internal */
  public closeSync(): void {
    this.beforeClose();
  }
}

/** A connection to a [SnapshotDb]($backend) hosted on a backend.
 * @public
 */
export class SnapshotConnection extends IModelConnection {
  /** Type guard for instanceof [[SnapshotConnection]] */
  public override isSnapshotConnection(): this is SnapshotConnection { return true; }

  /** The Guid that identifies this iModel. */
  public override get iModelId(): GuidString { return super.iModelId!; } // GuidString | undefined for the superclass, but required for SnapshotConnection

  /** Returns `true` if [[close]] has already been called. */
  public get isClosed(): boolean { return this._isClosed ? true : false; }
  private _isClosed?: boolean;

  /** Returns `true` if this is a connection to a remote snapshot iModel resolved by the backend.
   * @see [[openRemote]]
   */
  public get isRemote(): boolean { return this._isRemote ? true : false; }
  private _isRemote?: boolean;

  /** Open an IModelConnection to a read-only snapshot iModel from a file name.
   * @note This method is intended for desktop or mobile applications and should not be used for web applications.
   */
  public static async openFile(filePath: string): Promise<SnapshotConnection> {
    const routingContext = IModelRoutingContext.current || IModelRoutingContext.default;
    RpcManager.setIModel({ iModelId: "undefined", key: filePath });

    const openResponse = await SnapshotIModelRpcInterface.getClientForRouting(routingContext.token).openFile(filePath);
    Logger.logTrace(loggerCategory, "SnapshotConnection.openFile", () => ({ filePath }));
    const connection = new SnapshotConnection(openResponse);
    connection.routingContext = routingContext;
    IModelConnection.onOpen.raiseEvent(connection);
    return connection;
  }

  /** Open an IModelConnection to a remote read-only snapshot iModel from a key that will be resolved by the backend.
   * @note This method is intended for web applications.
   */
  public static async openRemote(fileKey: string): Promise<SnapshotConnection> {
    const routingContext = IModelRoutingContext.current || IModelRoutingContext.default;
    RpcManager.setIModel({ iModelId: "undefined", key: fileKey });

    const openResponse = await SnapshotIModelRpcInterface.getClientForRouting(routingContext.token).openRemote(fileKey);
    Logger.logTrace(loggerCategory, "SnapshotConnection.openRemote", () => ({ fileKey }));
    const connection = new SnapshotConnection(openResponse);
    connection.routingContext = routingContext;
    connection._isRemote = true;
    IModelConnection.onOpen.raiseEvent(connection);
    return connection;
  }

  /** Close this SnapshotConnection.
   * @note For local snapshot files, `close` closes the connection and the underlying [SnapshotDb]($backend) database file.
   * For remote snapshots, `close` only closes the connection and frees any frontend resources allocated to the connection.
   * @see [[openFile]], [[openRemote]]
   */
  public async close(): Promise<void> {
    if (this.isClosed)
      return;

    this.beforeClose();
    try {
      if (!this.isRemote) {
        await SnapshotIModelRpcInterface.getClientForRouting(this.routingContext.token).close(this.getRpcProps());
      }
    } finally {
      this._isClosed = true;
    }
  }
}

/** @public */
export namespace IModelConnection { // eslint-disable-line no-redeclare

  /** The id/name/class of a ViewDefinition. Returned by [[IModelConnection.Views.getViewList]] */
  export interface ViewSpec {
    /** The element id of the ViewDefinition. This string may be passed to [[IModelConnection.Views.load]]. */
    id: string;
    /** The name of the view. This string may be used to create a list with the possible view names. */
    name: string;
    /** The fullClassName of the ViewDefinition. Useful for sorting the list of views. */
    class: string;
  }

  /** The collection of loaded ModelState objects for an [[IModelConnection]]. */
  export class Models implements Iterable<ModelState> {
    private _loaded = new Map<string, ModelState>();

    /** The set of loaded models for this IModelConnection, indexed by Id.
     * @deprecated Use `for..of` to iterate and getLoaded() to look up by Id.
     */
    public get loaded(): Map<string, ModelState> { return this._loaded; }
    public set loaded(loaded: Map<string, ModelState>) {
      this._loaded = loaded;
      assert(false, "there is no reason to replace the map of loaded models");
    }

    /** An iterator over all currently-loaded models. */
    public [Symbol.iterator](): Iterator<ModelState> {
      return this._loaded.values()[Symbol.iterator]();
    }

    /** @internal */
    constructor(private _iModel: IModelConnection) { }

    /** The Id of the [RepositoryModel]($backend). */
    public get repositoryModelId(): string { return "0x1"; }

    /** @internal */
    public async getDictionaryModel(): Promise<Id64String> {
      const res = await this._iModel.models.queryProps({ from: "bis.DictionaryModel", wantPrivate: true });
      if (res.length !== 1 || res[0].id === undefined)
        throw new IModelError(IModelStatus.BadModel, "bis.DictionaryModel");
      return res[0].id;
    }

    /** Get a batch of [[ModelProps]] given a list of Model ids. */
    public async getProps(modelIds: Id64Arg): Promise<ModelProps[]> {
      const iModel = this._iModel;
      return iModel.isOpen ? IModelReadRpcInterface.getClientForRouting(iModel.routingContext.token).getModelProps(iModel.getRpcProps(), [...Id64.toIdSet(modelIds)]) : [];
    }

    /** Find a ModelState in the set of loaded Models by ModelId. */
    public getLoaded(id: string): ModelState | undefined {
      return this._loaded.get(id);
    }

    /** Given a set of modelIds, return the subset of corresponding models that are not currently loaded.
     * @param modelIds The set of model Ids
     * @returns The subset of the supplied Ids corresponding to models that are not currently loaded, or undefined if all of the specified models are loaded.
     */
    public filterLoaded(modelIds: Id64Arg): Id64Set | undefined {
      let unloaded: Set<string> | undefined;
      for (const id of Id64.iterable(modelIds)) {
        if (undefined === this.getLoaded(id)) {
          if (undefined === unloaded)
            unloaded = new Set<string>();

          unloaded.add(id);
        }
      }

      return unloaded;
    }

    /** load a set of Models by Ids. After the returned Promise resolves, you may get the ModelState objects by calling getLoadedModel. */
    public async load(modelIds: Id64Arg): Promise<void> {
      const notLoaded = this.filterLoaded(modelIds);
      if (undefined === notLoaded)
        return; // all requested models are already loaded

      try {
        const propArray = await this.getProps(notLoaded);
        for (const props of propArray) {
          const ctor = await this._iModel.findClassFor(props.classFullName, ModelState);
          if (undefined === this.getLoaded(props.id!)) { // do not overwrite if someone else loads it while we await
            const modelState = new ctor!(props, this._iModel); // create a new instance of the appropriate ModelState subclass
            this._loaded.set(modelState.id, modelState); // save it in loaded set
          }
        }
      } catch (err) {
        // ignore error, we had nothing to do.
      }
    }

    /** Remove a model from the set of loaded models. Used internally by BriefcaseConnection in response to txn events.
     * @internal
     */
    public unload(modelId: Id64String): void {
      this._loaded.delete(modelId);
    }

    /** Query for a set of model ranges by ModelIds. */
    public async queryModelRanges(modelIds: Id64Arg): Promise<Range3dProps[]> {
      const iModel = this._iModel;
      return iModel.isOpen ? IModelReadRpcInterface.getClientForRouting(iModel.routingContext.token).queryModelRanges(iModel.getRpcProps(), [...Id64.toIdSet(modelIds)]) : [];
    }

    /** Query for a set of ModelProps of the specified ModelQueryParams.
     * @param queryParams The query parameters. The `limit` and `offset` members should be used to page results.
     * @throws [IModelError]($common) If the generated statement is invalid or would return too many props.
     */
    public async queryProps(queryParams: ModelQueryParams): Promise<ModelProps[]> {
      const iModel = this._iModel;
      if (!iModel.isOpen)
        return [];
      const params: ModelQueryParams = { ...queryParams }; // make a copy
      params.from = queryParams.from || ModelState.classFullName; // use "BisCore:Model" as default class name
      params.where = queryParams.where || "";
      if (!queryParams.wantPrivate) {
        if (params.where.length > 0) params.where += " AND ";
        params.where += "IsPrivate=FALSE ";
      }
      if (!queryParams.wantTemplate) {
        if (params.where.length > 0) params.where += " AND ";
        params.where += "IsTemplate=FALSE ";
      }
      return IModelReadRpcInterface.getClientForRouting(iModel.routingContext.token).queryModelProps(iModel.getRpcProps(), params);
    }

    /** Asynchronously stream ModelProps using the specified ModelQueryParams. */
    public async * query(queryParams: ModelQueryParams): AsyncIterableIterator<ModelProps> {
      // NOTE: this implementation has the desired API signature, but its implementation must be improved to actually page results
      const modelPropsArray: ModelProps[] = await this.queryProps(queryParams);
      for (const modelProps of modelPropsArray) {
        yield modelProps;
      }
    }
  }

  /** The collection of Elements for an [[IModelConnection]]. */
  export class Elements {
    /** @internal */
    public constructor(private _iModel: IModelConnection) { }

    /** The Id of the [root subject element]($docs/bis/intro/glossary.md#subject-root) for this iModel. */
    public get rootSubjectId(): Id64String { return "0x1"; }

    /** Get a set of element ids that satisfy a query */
    public async queryIds(params: EntityQueryParams): Promise<Id64Set> { return this._iModel.queryEntityIds(params); }

    /** Get an array of [[ElementProps]] given one or more element ids. */
    public async getProps(arg: Id64Arg): Promise<ElementProps[]> {
      const iModel = this._iModel;
      return iModel.isOpen ? IModelReadRpcInterface.getClientForRouting(iModel.routingContext.token).getElementProps(this._iModel.getRpcProps(), [...Id64.toIdSet(arg)]) : [];
    }

    /** Obtain the properties of a single element, optionally specifying specific properties to include or exclude.
     * For example, [[getProps]] and [[queryProps]] omit the [GeometryStreamProps]($common) property of [GeometricElementProps]($common) and [GeometryPartProps]($common)
     * because it can be quite large and is generally not useful to frontend code. The following code requests that the geometry stream be included:
     * ```ts
     *  const props = await iModel.elements.loadProps(elementId, { wantGeometry: true });
     * ```
     * @param identifier Identifies the element by its Id, federation Guid, or [Code]($common).
     * @param options Optionally includes or excludes specific properties.
     * @returns The properties of the requested element; or `undefined` if no element exists with the specified identifier or the iModel is not open.
     * @throws [IModelError]($common) if the element exists but could not be loaded.
     */
    public async loadProps(identifier: Id64String | GuidString | CodeProps, options?: ElementLoadOptions): Promise<ElementProps | undefined> {
      const imodel = this._iModel;
      return imodel.isOpen ? IModelReadRpcInterface.getClientForRouting(imodel.routingContext.token).loadElementProps(imodel.getRpcProps(), identifier, options) : undefined;
    }

    /** Get an array  of [[ElementProps]] that satisfy a query
     * @param params The query parameters. The `limit` and `offset` members should be used to page results.
     * @throws [IModelError]($common) If the generated statement is invalid or would return too many props.
     */
    public async queryProps(params: EntityQueryParams): Promise<ElementProps[]> {
      const iModel = this._iModel;
      return iModel.isOpen ? IModelReadRpcInterface.getClientForRouting(iModel.routingContext.token).queryElementProps(iModel.getRpcProps(), params) : [];
    }
  }

  /** The collection of [[CodeSpec]] entities for an [[IModelConnection]]. */
  export class CodeSpecs {
    private _loaded?: CodeSpec[];

    /** @internal */
    constructor(private _iModel: IModelConnection) { }

    /** Loads all CodeSpec from the remote IModelDb. */
    private async _loadAllCodeSpecs(): Promise<void> {
      if (this._loaded)
        return;

      this._loaded = [];
      const codeSpecArray: any[] = await IModelReadRpcInterface.getClientForRouting(this._iModel.routingContext.token).getAllCodeSpecs(this._iModel.getRpcProps());
      for (const codeSpec of codeSpecArray) {
        this._loaded.push(CodeSpec.createFromJson(this._iModel, Id64.fromString(codeSpec.id), codeSpec.name, codeSpec.jsonProperties));
      }
    }

    /** Look up a CodeSpec by Id.
     * @param codeSpecId The Id of the CodeSpec to load
     * @returns The CodeSpec with the specified Id
     * @throws [[IModelError]] if the Id is invalid or if no CodeSpec with that Id could be found.
     */
    public async getById(codeSpecId: Id64String): Promise<CodeSpec> {
      if (!Id64.isValid(codeSpecId))
        throw new IModelError(IModelStatus.InvalidId, "Invalid codeSpecId", Logger.logWarning, loggerCategory, () => ({ codeSpecId }));

      await this._loadAllCodeSpecs(); // ensure all codeSpecs have been downloaded
      const found: CodeSpec | undefined = this._loaded!.find((codeSpec: CodeSpec) => codeSpec.id === codeSpecId);
      if (!found)
        throw new IModelError(IModelStatus.NotFound, "CodeSpec not found", Logger.logWarning, loggerCategory);

      return found;
    }

    /** Look up a CodeSpec by name.
     * @param name The name of the CodeSpec to load
     * @returns The CodeSpec with the specified name
     * @throws [[IModelError]] if no CodeSpec with the specified name could be found.
     */
    public async getByName(name: string): Promise<CodeSpec> {
      await this._loadAllCodeSpecs(); // ensure all codeSpecs have been downloaded
      const found: CodeSpec | undefined = this._loaded!.find((codeSpec: CodeSpec) => codeSpec.name === name);
      if (!found)
        throw new IModelError(IModelStatus.NotFound, "CodeSpec not found", Logger.logWarning, loggerCategory);

      return found;
    }
  }

  /** The collection of views for an [[IModelConnection]]. */
  export class Views {
    /** @internal */
    constructor(private _iModel: IModelConnection) { }

    /** Query for an array of ViewDefinitionProps
     * @param queryParams Query parameters specifying the views to return. The `limit` and `offset` members should be used to page results.
     * @throws [IModelError]($common) If the generated statement is invalid or would return too many props.
     */
    public async queryProps(queryParams: ViewQueryParams): Promise<ViewDefinitionProps[]> {
      const iModel = this._iModel;
      if (iModel.isClosed)
        return [];

      const params: ViewQueryParams = { ...queryParams }; // make a copy
      params.from = queryParams.from || ViewState.classFullName; // use "BisCore:ViewDefinition" as default class name
      params.where = queryParams.where || "";
      if (queryParams.wantPrivate === undefined || !queryParams.wantPrivate) {
        if (params.where.length > 0) params.where += " AND ";
        params.where += "IsPrivate=FALSE ";
      }
      const viewProps = await IModelReadRpcInterface.getClientForRouting(iModel.routingContext.token).queryElementProps(iModel.getRpcProps(), params);
      assert((viewProps.length === 0) || ("categorySelectorId" in viewProps[0]), "invalid view definition");  // spot check that the first returned element is-a ViewDefinitionProps
      return viewProps as ViewDefinitionProps[];
    }

    /** Get an array of the ViewSpecs for all views in this IModel that satisfy a ViewQueryParams.
     *
     * This is typically used to create a list for UI.
     *
     * For example:
     * ```ts
     * [[include:IModelConnection.Views.getSpatialViewList]]
     * ```
     * @param queryParams The parameters for the views to find. The `limit` and `offset` members should be used to page results.
     * @throws [IModelError]($common) If the generated statement is invalid or would return too many props.
     */
    public async getViewList(queryParams: ViewQueryParams): Promise<ViewSpec[]> {
      const views: ViewSpec[] = [];
      const viewProps: ViewDefinitionProps[] = await this.queryProps(queryParams);
      viewProps.forEach((viewProp) => { views.push({ id: viewProp.id as string, name: viewProp.code.value!, class: viewProp.classFullName }); });
      return views;
    }

    /** Query the Id of the default view associated with this iModel. Applications can choose to use this as the default view to which to open a viewport upon startup, or the initial selection
     * within a view selection dialog, or similar purposes.
     * @returns the ID of the default view, or an invalid ID if no default view is defined.
     */
    public async queryDefaultViewId(): Promise<Id64String> {
      const iModel = this._iModel;
      return iModel.isOpen ? IModelReadRpcInterface.getClientForRouting(iModel.routingContext.token).getDefaultViewId(iModel.getRpcProps()) : Id64.invalid;
    }

    /** Load a [[ViewState]] object from the specified [[ViewDefinition]] id. */
    public async load(viewDefinitionId: Id64String): Promise<ViewState> {
      if (!Id64.isValidId64(viewDefinitionId))
        throw new IModelError(IModelStatus.InvalidId, "Invalid view definition Id for IModelConnection.Views.load", Logger.logError, loggerCategory, () => { return { viewDefinitionId }; });

      const options: ViewStateLoadProps = {
        displayStyle: {
          omitScheduleScriptElementIds: true,
          compressExcludedElementIds: true,
        },
      };
      const viewProps = await IModelReadRpcInterface.getClientForRouting(this._iModel.routingContext.token).getViewStateData(this._iModel.getRpcProps(), viewDefinitionId, options);

      const className = viewProps.viewDefinitionProps.classFullName;
      const ctor = await this._iModel.findClassFor<typeof EntityState>(className, undefined) as typeof ViewState | undefined;

      if (undefined === ctor)
        throw new IModelError(IModelStatus.WrongClass, "Invalid ViewState class", Logger.logError, loggerCategory, () => viewProps);

      const viewState = ctor.createFromProps(viewProps, this._iModel)!;
      await viewState.load(); // loads models for ModelSelector

      return viewState;
    }

    /** Get a thumbnail for a view.
     * @param viewId The id of the view of the thumbnail.
     * @returns A Promise of the ThumbnailProps.
     * @throws Error if invalid thumbnail.
     */
    public async getThumbnail(viewId: Id64String): Promise<ThumbnailProps> {
      const val = await IModelReadRpcInterface.getClientForRouting(this._iModel.routingContext.token).getViewThumbnail(this._iModel.getRpcProps(), viewId.toString());
      const intValues = new Uint32Array(val.buffer, 0, 4);

      if (intValues[1] !== ImageSourceFormat.Jpeg && intValues[1] !== ImageSourceFormat.Png)
        throw new Error("Invalid thumbnail");

      return { format: intValues[1] === ImageSourceFormat.Jpeg ? "jpeg" : "png", width: intValues[2], height: intValues[3], image: new Uint8Array(val.buffer, 16, intValues[0]) };
    }

    /** Save a thumbnail for a view.
     * @param viewId The id of the view for the thumbnail.
     * @param thumbnail The thumbnail data to save.
     * @returns A void Promise
     * @throws `Error` exception if the thumbnail wasn't successfully saved.
     */
    public async saveThumbnail(viewId: Id64String, thumbnail: ThumbnailProps): Promise<void> {
      const val = new Uint8Array(thumbnail.image.length + 24);  // include the viewId and metadata in the binary transfer by allocating a new buffer 24 bytes larger than the image size
      new Uint32Array(val.buffer, 0, 4).set([thumbnail.image.length, thumbnail.format === "jpeg" ? ImageSourceFormat.Jpeg : ImageSourceFormat.Png, thumbnail.width, thumbnail.height]); // metadata at offset 0
      const low32 = Id64.getLowerUint32(viewId);
      const high32 = Id64.getUpperUint32(viewId);
      new Uint32Array(val.buffer, 16, 2).set([low32, high32]); // viewId is 8 bytes starting at offset 16
      val.set(thumbnail.image, 24); // image data at offset 24
      return IModelWriteRpcInterface.getClientForRouting(this._iModel.routingContext.token).saveThumbnail(this._iModel.getRpcProps(), val); // eslint-disable-line deprecation/deprecation
    }
  }
}
