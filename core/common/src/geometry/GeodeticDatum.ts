/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cspell:ignore JSONXYZ, ETRF, OSGB, DHDN

import { Vector3d, XYAndZ } from "@bentley/geometry-core";
import { GeodeticEllipsoid, GeodeticEllipsoidProps } from "./GeodeticEllipsoid";

/** Holds 3 components of a Positional Vector rotation definition in arc seconds
 *  @alpha
 */
export interface XyzRotationProps {
  /** X rotation component in arc second */
  x: number;
  /** Y rotation component in arc second*/
  y: number;
  /** Z rotation component in arc second*/
  z: number;
}

/** Hold 3 components data of a Positional Vector rotation definition in arc seconds
 *  @alpha
 */
export class XyzRotation implements XyzRotationProps {
  /** X rotation component in arc second */
  public x!: number;
  /** Y rotation component in arc second*/
  public y!: number;
  /** Z rotation component in arc second*/
  public z!: number;

  public constructor(data?: XyzRotationProps) {
    this.initialize(data);
  }

  /** @internal */
  public initialize(_data?: XyzRotationProps) {
    if (_data) {
      this.x = _data.x;
      this.y = _data.y;
      this.z = _data.z;
    }
  }

  /** @internal */
  public static fromJSON(data: XyzRotationProps): XyzRotation {
    return new XyzRotation(data);
  }

  /** @internal */
  public toJSON(): XyzRotationProps {
    return { x: this.x, y: this.y, z: this.z };
  }

  /** @internal */
  public equals(other: XyzRotation): boolean {
    return (this.x === other.x && this.y === other.y && this.z === other.z);
  }
}

/** Enum indicating the geodetic transformation method
 *  @alpha
 */
export enum GeodeticTransformMethod {
  None = "None",
  Geocentric = "Geocentric",
  PositionalVector = "PositionalVector",
  GridFiles = "GridFiles",
  MultipleRegression = "MultipleRegression",
  UndefinedMethod = "Undefined",
}

/** This interface represents a geocentric (three parameters) geodetic transformation.
 *  @alpha
 */
export interface GeocentricTransformProps {
  /* The frame translation components in meters */
  delta: XYAndZ;
}

/** This class represents a geocentric (three parameters) geodetic transformation.
 *  @alpha
 */
export class GeocentricTransform implements GeocentricTransformProps {
  /* The frame translation components in meters */
  public delta: Vector3d;

  public constructor(data?: GeocentricTransformProps) {
    this.delta = data ? Vector3d.fromJSON(data.delta) : new Vector3d();
    this.initialize(data);
  }

  /** @internal */
  public initialize(_data?: GeocentricTransformProps) {
    this.delta = _data ? Vector3d.fromJSON(_data.delta) : new Vector3d();
  }

  /** @internal */
  public static fromJSON(data: GeocentricTransformProps): GeocentricTransform {
    return new GeocentricTransform(data);
  }

  /** @internal */
  public toJSON(): GeocentricTransformProps {
    return { delta: { x: this.delta.x, y: this.delta.y, z: this.delta.z } };
  }

  /** @internal */
  public equals(other: GeocentricTransform): boolean {
    return (this.delta.x === other.delta.x && this.delta.z === other.delta.z);
  }
}

/** This interface represents a positional vector (seven parameters) geodetic transformation corresponding to
 *  EPSG operation 9606. Beware that the convention relative to rotation direction is different
 *  from the Coordinate Frame operation (epsg 9607).
 *  @alpha
 */
export interface PositionalVectorTransformProps {
  /* The frame translation components in meters */
  delta: XYAndZ;
  /* The frame rotation components in arc seconds. The rotation sign convention is the one associated with
   * the operation EPSG:9606 following recommendation of ISO 19111 specifications */
  rotation: XyzRotationProps;
  /** Scale in parts per million. The scale effectively applied will be 1 plus scale divided by 1 000 000. */
  scalePPM: number;
}

/** This class represents a positional vector (seven parameters) geodetic transformation corresponding to
 *  EPSG operation 9606. Beware that the convention relative to rotation direction is different
 *  from the Coordinate Frame operation (epsg 9607).
 *  @alpha
 */
export class PositionalVectorTransform implements PositionalVectorTransformProps {
  /* The frame translation components in meters */
  public delta!: Vector3d;
  /* The frame rotation components in arc seconds. The rotation sign convention is the one associated with
   * the operation EPSG:9606 following recommendation of ISO 19111 specifications */
  public rotation!: XyzRotation;
  /** Scale in parts per million. The scale effectively applied will be 1 plus scale divided by 1 000 000. */
  public scalePPM!: number;

  public constructor(data?: PositionalVectorTransformProps) {
    this.initialize(data);
  }

  /** @internal */
  public initialize(_data?: PositionalVectorTransformProps) {
    if (_data) {
      this.delta = _data.delta ? Vector3d.fromJSON(_data.delta) : new Vector3d();
      this.rotation = _data.rotation ? XyzRotation.fromJSON(_data.rotation) : new XyzRotation();
      this.scalePPM = _data.scalePPM;
    }
  }

  /** @internal */
  public static fromJSON(data: PositionalVectorTransformProps): PositionalVectorTransform {
    return new PositionalVectorTransform(data);
  }

  /** @internal */
  public toJSON(): PositionalVectorTransformProps {
    return {
      delta: { x: this.delta.x, y: this.delta.y, z: this.delta.z },
      rotation: this.rotation.toJSON(),
      scalePPM: this.scalePPM,
    };
  }

  /** @internal */
  public equals(other: PositionalVectorTransform): boolean {
    if (this.delta.x !== other.delta.x || this.delta.z !== other.delta.z || this.scalePPM !== other.scalePPM)
      return false;

    return this.rotation.equals(other.rotation);
  }
}

/** Enumeration indicating the file format of the grid files.
 *  @alpha
 */
export enum GridFileFormat {
  NONE = "NONE",
  NTv1 = "NTv1",
  NTv2 = "NTv2",
  NADCON = "NADCON",
  FRENCH = "FRENCH",
  JAPAN = "JAPAN",
  ATS77 = "ATS77",
  GEOCN = "GEOCN",
}

/** Enumeration to indicate the grid file application direction.
 *  @alpha
 */
export enum GridFileDirection {
  Direct = "Direct",
  Inverse = "Inverse",
}

/** Grid file definition containing name of the file, the format and the direction it should be applied
 *  @alpha
 */
export interface GridFileDefinitionProps {
  /** Name of the grid shift file. This name is relative to the expected dictionary root document.
   *  Typical grid shift file name will contain first the country name it applies to then possibly some sub path.
   *  Example of existing grid files:
   *  Germany/BETA2007.gsb or Brazil/SAD69_003.GSB but sometimes longer paths USA/NADCON/conus.l*s
   *  Note that the file name can contain wildcards when the format requires more than one file. For example
   *  the NADCON format makes use of a different file for latitude and longitude shifts thus the .l*s extension in the
   *  file name above.
   *  Forward slash is always used to separate the path components.
   */
  fileName: string;
  format: GridFileFormat;
  direction: GridFileDirection;
}

/** Grid file definition containing name of the file, the format and the direction it should be applied
 *  @alpha
 */
export class GridFileDefinition implements GridFileDefinitionProps {
  /** Name of the grid shift file. This name is relative to the expected dictionary root document.
   *  Typical grid shift file name will contain first the country name it applies to then possibly some sub path.
   *  Example of existing grid files:
   *  Germany/BETA2007.gsb or Brazil/SAD69_003.GSB but sometimes longer paths USA/NADCON/conus.l*s
   *  Note that the file name can contain wildcards when the format requires more than one file. For example
   *  the NADCON format makes use of a different file for latitude and longitude shifts thus the .l*s extension in the
   *  file name above.
   *  Forward slash is always used to separate the path components.
   */
  public fileName: string;
  public format: GridFileFormat;
  public direction: GridFileDirection;

  public constructor(data?: GridFileDefinitionProps) {
    this.fileName = data ? data.fileName : "";
    this.format = data ? data.format : GridFileFormat.NTv2;
    this.direction = data ? data.direction : GridFileDirection.Direct;
  }

  /** @internal */
  public initialize(data?: GridFileDefinitionProps) {
    this.fileName = data ? data.fileName : "";
    this.format = data ? data.format : GridFileFormat.NTv2;
    this.direction = data ? data.direction : GridFileDirection.Direct;
  }

  /** @internal */
  public static fromJSON(data: GridFileDefinitionProps): GridFileDefinition {
    return new GridFileDefinition(data);
  }

  /** @internal */
  public toJSON(): GridFileDefinitionProps {
    return { fileName: this.fileName, format: this.format, direction: this.direction };
  }

  /** @internal */
  public equals(other: GridFileDefinition): boolean {
    return (this.fileName === other.fileName && this.direction === other.direction && this.format === other.format);
  }
}

/** This interface represents a grid files based geodetic transformation.
 *  @alpha
 */
export interface GridFileTransformProps {
  /** The list of grid files. The order of file is meaningful, the first encountered that covers the area of coordinate
   *  transformation will be used. */
  files: GridFileDefinitionProps[];
}

/** This class represents a grid files based geodetic transformation.
 *  @alpha
 */
export class GridFileTransform implements GridFileTransformProps {
  /** The list of grid files. The order of file is meaningful, the first encountered that covers the area of coordinate
   *  transformation will be used. */
  public files: GridFileDefinition[];

  public constructor(data?: GridFileTransformProps) {
    this.files = [];
    this.initialize(data);
  }

  /** @internal */
  public initialize(_data?: GridFileTransformProps) {
    if (_data) {
      if (Array.isArray(_data.files)) {
        this.files = [];
        for (const item of _data.files)
          this.files.push(GridFileDefinition.fromJSON(item));
      }
    }
  }

  /** @internal */
  public static fromJSON(data: GridFileTransformProps): GridFileTransform {
    return new GridFileTransform(data);
  }

  /** @internal */
  public toJSON(): GridFileTransformProps {
    const data: GridFileTransformProps = { files: [] };
    if (Array.isArray(this.files)) {
      for (const item of this.files)
        data.files.push(item.toJSON());
    }
    return data;
  }

  /** @internal */
  public equals(other: GridFileTransform): boolean {
    if (this.files.length !== other.files.length)
      return false;

    for (let idx = 0; idx < this.files.length; ++idx)
      if (!this.files[idx].equals(other.files[idx]))
        return false;

    return true;
  }
}

/** This interface represents a geodetic transformation that enables transforming longitude/latitude coordinates
 *  from one datum to another.
 *  @alpha
 */
export interface GeodeticTransformProps {
  /* The method used by the geodetic transform */
  method: GeodeticTransformMethod;
  /* When method is Geocentric this property contains the geocentric parameters */
  geocentric?: GeocentricTransformProps;
  /* When method is PositionalVector this property contains the positional vector parameters */
  positionalVector?: PositionalVectorTransformProps;
  /* When method is GridFiles this property contains the grid files parameters */
  gridFile?: GridFileTransformProps;
}

/** This class represents a geodetic transformation that enables transforming longitude/latitude coordinates
 *  from one datum to another.
 *  @alpha
 */
export class GeodeticTransform implements GeodeticTransformProps {
  /* The method used by the geodetic transform */
  public method: GeodeticTransformMethod;
  /* When method is Geocentric this property contains the geocentric parameters */
  public geocentric?: GeocentricTransform;
  /* When method is PositionalVector this property contains the positional vector parameters */
  public positionalVector?: PositionalVectorTransform;
  /* When method is GridFiles this property contains the grid files parameters */
  public gridFile?: GridFileTransform;

  public constructor(data?: GeodeticTransformProps) {
    this.method = GeodeticTransformMethod.None;
    this.initialize(data);
  }

  /** @internal */
  public initialize(_data?: GeodeticTransformProps) {
    if (_data) {
      this.method = _data.method;
      this.geocentric = _data.geocentric ? GeocentricTransform.fromJSON(_data.geocentric) : undefined;
      this.positionalVector = _data.positionalVector ? PositionalVectorTransform.fromJSON(_data.positionalVector) : undefined;
      this.gridFile = _data.gridFile ? GridFileTransform.fromJSON(_data.gridFile) : undefined;
    }
  }

  /** @internal */
  public static fromJSON(data: GeodeticTransformProps): GeodeticTransform {
    return new GeodeticTransform(data);
  }

  /** @internal */
  public toJSON(): GeodeticTransformProps {
    const data: GeodeticTransformProps = { method: this.method };
    data.geocentric = this.geocentric ? this.geocentric.toJSON() : undefined;
    data.positionalVector = this.positionalVector ? this.positionalVector.toJSON() : undefined;
    data.gridFile = this.gridFile ? this.gridFile.toJSON() : undefined;
    return data;
  }

  /** @internal */
  public equals(other: GeodeticTransform): boolean {
    if (this.method !== other.method)
      return false;

    if ((this.geocentric === undefined) !== (other.geocentric === undefined))
      return false;
    if (this.geocentric && !this.geocentric.equals(other.geocentric!))
      return false;

    if ((this.positionalVector === undefined) !== (other.positionalVector === undefined))
      return false;
    if (this.positionalVector && !this.positionalVector.equals(other.positionalVector!))
      return false;

    if ((this.gridFile === undefined) !== (other.gridFile === undefined))
      return false;
    if (this.gridFile && !this.gridFile.equals(other.gridFile!))
      return false;

    return true;
  }
}

/** This interface represents a geodetic datum. Geodetic datums are based on an ellipsoid.
 *  In addition to the ellipsoid definition they are the base for longitude/latitude coordinates.
 *  Geodetic datums are the basis for geodetic transformations. Most geodetic datums are defined by specifying
 *  the transformation to the common base WGS84 (or local equivalent). The transforms property can contain the
 *  definition of the transformation path to WGS84.
 *  Sometimes there exists transformation paths direct from one non-WGS84 datum to another non-WGS84. The current model
 *  does not allow specifications of these special paths at the moment.
 *  @alpha
 */
export interface GeodeticDatumProps {
  /** GeodeticDatum key name */
  id?: string;
  /** Description */
  description?: string;
  /** If true then indicates the definition is deprecated. It should then be used for backward compatibility only.
   ** If false or undefined then the definition is not deprecated.
   */
  deprecated?: boolean;
  /** A textual description of the source of the geodetic datum definition. */
  source?: string;
  /** The EPSG code of the geodetic datum. If undefined or zero then there is no EPSG code associated. */
  epsg?: number;
  /** The key name to the base Ellipsoid. */
  ellipsoidId?: string;
  /** The full definition of the geodetic ellipsoid associated to the datum. If undefined then the ellipsoidId must be used to fetch the definition from the dictionary, geographic coordinate system service or the backend */
  ellipsoid?: GeodeticEllipsoidProps;
  /** The transformation to WGS84. If null then there is no known transformation to WGS84. Although
   *  this is rare it occurs in a few cases where the country charges for obtaining and using
   *  the transformation and its parameters, or if the transformation is maintained secret for military reasons.
   *  In this case the recommendation is to considered the geodetic datum to be coincident to WGS84 keeping
   *  in mind imported global data such as Google Map or Bing Map data may be approximately located.
   *  The list of transforms contains normally a single transform but there can be a sequence of transformations
   *  required to transform to WGS84, such as the newer datum definitions for Slovakia or Switzerland.
   */
  transforms?: GeodeticTransformProps[];
}

/** This class represents a geodetic datum. Geodetic datums are based on an ellipsoid.
 *  In addition to the ellipsoid definition they are the base for longitude/latitude coordinates.
 *  Geodetic datums are the basis for geodetic transformations. Most geodetic datums are defined by specifying
 *  the transformation to the common base WGS84 (or local equivalent). The transforms property can contain the
 *  definition of the transformation path to WGS84.
 *  Sometimes there exists transformation paths direct from one non-WGS84 datum to another non-WGS84. The current model
 *  does not allow specifications of these special paths at the moment.
 *  @alpha
 */
export class GeodeticDatum implements GeodeticDatumProps {
  /** GeodeticDatum key name */
  public id?: string;
  /** Description */
  public description?: string;
  /** If true then indicates the definition is deprecated. It should then be used for backward compatibility only.
   *  If false or undefined then the definition is not deprecated.
   */
  public deprecated?: boolean;
  /* A textual description of the source of the geodetic datum definition. */
  public source?: string;
  /** The EPSG code of the geodetic datum. If undefined or zero then there is no EPSG code associated. */
  public epsg?: number;
  /** The key name to the base Ellipsoid. */
  public ellipsoidId?: string;
  /** The full definition of the geodetic ellipsoid associated to the datum. If undefined then the ellipsoidId must
   *  be used to fetch the definition from the dictionary, geographic coordinate system service or the backend
   */
  public ellipsoid?: GeodeticEllipsoid;
  /** The transformation to WGS84. If null then there is no known transformation to WGS84. Although
   *  this is rare it occurs in a few cases where the country charges for obtaining and using
   *  the transformation and its parameters, or if the transformation is maintained secret for military reasons.
   *  In this case the recommendation is to considered the geodetic datum to be coincident to WGS84 keeping
   *  in mind imported global data such as Google Map or Bing Map data may be approximately located.
   *  The list of transforms contains normally a single transform but there can be a sequence of transformations
   *  required to transform to WGS84, such as the newer datum definitions for Slovakia or Switzerland.
   */
  public transforms?: GeodeticTransform[];

  public constructor(data?: GeodeticDatumProps) {
    this.initialize(data);
  }

  /** @internal */
  public initialize(_data?: GeodeticDatumProps) {
    if (_data) {
      this.id = _data.id;
      this.description = _data.description;
      this.deprecated = _data.deprecated;
      this.source = _data.source;
      this.epsg = _data.epsg;
      this.ellipsoidId = _data.ellipsoidId;
      this.ellipsoid = _data.ellipsoid ? GeodeticEllipsoid.fromJSON(_data.ellipsoid) : undefined;
      if (Array.isArray(_data.transforms)) {
        this.transforms = [];
        for (const item of _data.transforms)
          this.transforms.push(GeodeticTransform.fromJSON(item));
      }
    }
  }

  /** @internal */
  public static fromJSON(data: GeodeticDatumProps): GeodeticDatum {
    return new GeodeticDatum(data);
  }

  /** @internal */
  public toJSON(): GeodeticDatumProps {
    const data: GeodeticDatumProps = {};
    data.id = this.id;
    data.description = this.description;
    data.deprecated = this.deprecated;
    data.source = this.source;
    data.epsg = this.epsg;
    data.ellipsoidId = this.ellipsoidId;
    data.ellipsoid = this.ellipsoid ? this.ellipsoid.toJSON() : undefined;
    if (Array.isArray(this.transforms)) {
      data.transforms = [];
      for (const item of this.transforms)
        data.transforms.push(item.toJSON());
    }
    return data;
  }

  /** @internal */
  public equals(other: GeodeticDatum): boolean {
    if (this.id !== other.id ||
      this.description !== other.description ||
      this.deprecated !== other.deprecated ||
      this.source !== other.source ||
      this.epsg !== other.epsg ||
      this.ellipsoidId !== other.ellipsoidId)
      return false;

    if ((this.ellipsoid === undefined) !== (other.ellipsoid === undefined))
      return false;

    if (this.ellipsoid && !this.ellipsoid.equals(other.ellipsoid!))
      return false;

    if ((this.transforms === undefined) !== (other.transforms === undefined))
      return false;

    if (this.transforms && other.transforms) {
      if (this.transforms.length !== other.transforms.length)
        return false;

      for (let idx = 0; idx < this.transforms.length; ++idx)
        if (!this.transforms[idx].equals(other.transforms[idx]))
          return false;
    }
    return true;
  }
}

