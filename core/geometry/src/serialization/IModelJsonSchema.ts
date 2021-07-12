/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Serialization
 */

import { BezierCurve3d } from "../bspline/BezierCurve3d";
import { BezierCurve3dH } from "../bspline/BezierCurve3dH";
import { BSplineCurve3d } from "../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { BSplineSurface3d, BSplineSurface3dH, WeightStyle } from "../bspline/BSplineSurface";
import { BSplineWrapMode } from "../bspline/KnotVector";
import { Arc3d } from "../curve/Arc3d";
import { CoordinateXYZ } from "../curve/CoordinateXYZ";
import { BagOfCurves, CurveCollection } from "../curve/CurveCollection";
import { AnyGeometryQuery, GeometryQuery } from "../curve/GeometryQuery";
import { LineSegment3d } from "../curve/LineSegment3d";
import { LineString3d } from "../curve/LineString3d";
import { Loop } from "../curve/Loop";
import { ParityRegion } from "../curve/ParityRegion";
import { Path } from "../curve/Path";
import { PointString3d } from "../curve/PointString3d";
import { TransitionSpiral3d } from "../curve/spiral/TransitionSpiral3d";
import { IntegratedSpiral3d } from "../curve/spiral/IntegratedSpiral3d";
import { UnionRegion } from "../curve/UnionRegion";
import { AngleProps, AngleSweepProps, AxisOrder, Geometry } from "../Geometry";
import { Angle } from "../geometry3d/Angle";
import { AngleSweep } from "../geometry3d/AngleSweep";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Point2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d, XYZ } from "../geometry3d/Point3dVector3d";
import { Ray3d } from "../geometry3d/Ray3d";
import { Segment1d } from "../geometry3d/Segment1d";
import { Transform } from "../geometry3d/Transform";
import { XYProps, XYZProps } from "../geometry3d/XYZProps";
import { YawPitchRollAngles, YawPitchRollProps } from "../geometry3d/YawPitchRollAngles";
import { Point4d } from "../geometry4d/Point4d";
import { AuxChannel, AuxChannelData, AuxChannelDataType, PolyfaceAuxData } from "../polyface/AuxData";
import { IndexedPolyface } from "../polyface/Polyface";
import { Box } from "../solid/Box";
import { Cone } from "../solid/Cone";
import { LinearSweep } from "../solid/LinearSweep";
import { RotationalSweep } from "../solid/RotationalSweep";
import { RuledSweep } from "../solid/RuledSweep";
import { Sphere } from "../solid/Sphere";
import { TorusPipe } from "../solid/TorusPipe";
import { DirectSpiral3d } from "../curve/spiral/DirectSpiral3d";
import { TaggedNumericData } from "../polyface/TaggedNumericData";
import { InterpolationCurve3d as InterpolationCurve3d } from "../bspline/InterpolationCurve3d";
import { AkimaCurve3d } from "../bspline/AkimaCurve3d";
// cspell:word bagof
/* eslint-disable no-console*/
/**
 * `ImodelJson` namespace has classes for serializing and deserialization json objects
 * @public
 */
export namespace IModelJson {
  /**
   * Property rules for json objects that can be deserialized to various Curve and Solid objects
   * @public
   */
  export interface GeometryProps extends CurvePrimitiveProps, SolidPrimitiveProps, CurveCollectionProps {
    /** `{indexedMesh:...}` */
    indexedMesh?: IndexedMeshProps;
    /** `{point:...}` */
    point?: XYZProps;
    /** `{bsurf:...}` */
    bsurf?: BSplineSurfaceProps;
  }
  /**
   * Property rules for json objects that can be deserialized to various CurvePrimitives
   * * Only one of these is allowed in each instance.
   * @public
   */
  export interface CurvePrimitiveProps {
    /** `{lineSegment:...}` */
    lineSegment?: [XYZProps, XYZProps];
    /** `{lineString:...}` */
    lineString?: XYZProps[];
    /** `{bcurve:...}` */
    bcurve?: BcurveProps;
    /** `{transitionSpiral:...}` */
    transitionSpiral?: TransitionSpiralProps;
    /** `{arc:...}` */
    arc?: ArcByVectorProps | [XYZProps, XYZProps, XYZProps];
  }

  /**
   * Property rules for json objects that can be deserialized to single point
   * @public
   */
  export interface PointProps {
    /** `{point:...}` */
    point?: XYZProps;
  }

  /**
   * Property rules for json objects that can be deserialized to a BsplineSurface
   * See `BCurveProps` for discussion of knot and pole counts.
   * @public
   */
  export interface BSplineSurfaceProps {
    /** polynomial order (one more than degree) in the u parameter direction */
    orderU: number;
    /** polynomial order (one more than degree) in the v parameter direction */
    orderV: number;
    /** Square grid of control points (aka poles) in row major order (row is along the u direction) */
    points: [[[number]]];   // each inner array is xyz or xyzw for a single control point. each middle array is a row of control points.
    /** Array of knots for the u direction bspline */
    uKnots: [number];
    /** Array of knots for the v direction bspline */
    vKnots: [number];
  }

  /**
   * Interface for a collection of curves, eg. as used as a swept contour.
   * @public
   */
  export interface CurveCollectionProps extends PlanarRegionProps {
    /** A sequence of curves joined head to tail: */
    path?: [CurvePrimitiveProps];
    /** A collection of curves with no required structure or connections: */
    bagofCurves?: [CurveCollectionProps];
  }

  /**
   * Interface for a collection of curves that bound a planar region
   * @public
   */
  export interface PlanarRegionProps {
    /** `{loop:...}`
     * * A sequence of curves which connect head to tail, with the final connecting back to the first
     */
    loop?: [CurvePrimitiveProps];
    /** `{parityRegion:...}`
     * * A collection of loops, with composite inside/outside determined by parity rules.
     * * (The single outer boundary with one or more holes is a parityRegion)
     */
    parityRegion?: [{ loop: [CurvePrimitiveProps] }];
    /** `{unionRegion:...}`
     * * A collection of loops and parityRegions
     */

    unionRegion?: [PlanarRegionProps];
  }
  /**
   * Interface for solid primitives: box, sphere, cylinder, cone, torusPipe, linear sweep, rotational sweep, ruled sweep.
   * @public
   */
  export interface SolidPrimitiveProps {
    /** `{cylinder:...}` */
    cylinder?: CylinderProps;
    /** `{box:...}` */
    box?: BoxProps;
    /** `{sphere:............}` */
    sphere?: SphereProps;
    /** `{cone:............}` */
    cone?: ConeProps;
    /** `{torusPipe:............}` */
    torusPipe?: TorusPipeProps;
    /** `{linearSweep:.........}` */
    linearSweep?: LinearSweepProps;
    /** `{rotationalSweep:...}` */
    rotationalSweep?: RotationalSweepProps;
    /** `{ruledSweep:...}` */
    ruledSweep?: RuledSweepProps;
  }
  /**
   * * There are multiple ways to specify an orientation
   * * A "Best" among these is application specific.
   * * An object with AxesProps should only specify one of the variants.
   * * YawPitchRollAngles uses 3 angles.
   * * * Cases where only one of the 3 is nonzero are intuitive
   * * * Cases where more than one is nonzero have difficult interactions and order issues.
   * * xyVectors uses a vector along the x direction and a vector into positive xy plane
   *    along any direction not parallel to x.
   * * * In most cases, users supply a normalized x and the actual normalized y vector.
   * * zxVectors uses a z vector and another vector into the positive zx plane.
   * * * In most cases, users supply a normalized z and the actual normalized x vector.
   * @public
   */
  export interface AxesProps {
    /**
     * See YawPitchAngles class for further information about using 3 rotations to specify orientation.
     * @public
     */
    yawPitchRollAngles?: YawPitchRollProps;
    /**
     * Cartesian coordinate directions defined by X direction then Y direction.
     * * The right side contains two vectors in an array.
     * * The first vector gives the x axis direction
     * * * This is normalized to unit length.
     * * The second vector gives the positive y direction in the xy plane.
     * * * This vector is adjusted to be unit length and perpendicular to the x direction.
     */
    xyVectors?: [XYZProps, XYZProps];
    /**
     * Cartesian coordinate directions defined by X direction then Y direction.
     * * The right side contains two vectors in an array.
     * * The first vector gives the z axis direction
     * * * This is normalized to unit length.
     * * The second vector gives the positive x direction in the zx plane.
     * * * This vector is adjusted to be unit length and perpendicular to the z direction.
     */
    zxVectors?: [XYZProps, XYZProps];
  }

  /**
   * Interface for Arc3d value defined by center, vectorX, vectorY and sweepStartEnd.
   * @public
   */
  export interface ArcByVectorProps {
    /** Arc center point */
    center: XYZProps;
    /** Vector from center to 0-degree point (commonly called major axis vector) */
    vectorX: XYZProps;
    /** Vector from center to 90-degree point (common called minor axis vector) */
    vectorY: XYZProps;
    /** Start and end angles in parameterization `X=C+cos(theta) * vectorX + sin(theta) * vectorY` */
    sweepStartEnd: AngleSweepProps;
  }

  /**
   * Interface for Cone value defined by centers, radii, and (optional) vectors for circular section planes.
   * * VectorX and vectorY are optional.
   * * If either one is missing, both vectors are constructed perpendicular to the vector from start to end.
   * @public
   */
  export interface ConeProps extends AxesProps {
    /** Point on axis at start section. */
    start: XYZProps;
    /** Point on axis at end section  */
    end: XYZProps;

    /** radius at `start` section */
    startRadius?: number;
    /** radius at `end` section */
    endRadius?: number;
    /** single radius to be applied as both start and end */
    radius?: number;
    /** optional x vector in start section.  Omit for circular sections perpendicular to axis. */
    vectorX?: XYZProps;
    /** optional y vector in start section.  Omit for circular sections perpendicular to axis. */
    vectorY?: XYZProps;
    /** flag for circular end caps. */
    capped?: boolean;
  }

  /**
   * Interface for cylinder defined by a radius and axis start and end centers.
   * @public
   */
  export interface CylinderProps {
    /** axis point at start */
    start: XYZProps;
    /** axis point at end */
    end: XYZProps;
    /** cylinder radius */
    radius: number;
    /** flag for circular end caps. */
    capped?: boolean;
  }

  /**
   * Interface for a linear sweep of a base curve or region.
   * @public
   */
  export interface LinearSweepProps {
    /** The swept curve or region.  Any curve collection */
    contour: CurveCollectionProps;
    /** The sweep vector  */
    vector: XYZProps;
    /** flag for circular end caps. */
    capped?: boolean;
  }

  /**
   * Interface for a rotational sweep of a base curve or region around an axis.
   * @public
   */
  export interface RotationalSweepProps {
    /** The swept curve or region.  Any curve collection */
    contour: CurveCollectionProps;
    /** any point on the axis of rotation. */
    center: XYZProps;
    /** The axis of rotation  */
    axis: XYZProps;
    /** sweep angle */
    sweepAngle: AngleProps;
    /** flag for circular end caps. */
    capped?: boolean;
  }

  /**
   * Interface for a surface with ruled sweeps between corresponding curves on successive contours
   * @public
   */
  export interface RuledSweepProps {
    /** The swept curve or region.  An array of curve collections.  */
    contour: [CurveCollectionProps];
    /** flag for circular end caps. */
    capped?: boolean;
  }

  /**
   * Interface for spiral
   * * Any 4 (but not 5) of the 5 values `[startBearing, endBearing, startRadius, endRadius, length]`
   *       may be defined.
   * * In radius data, zero radius indicates straight line (infinite radius)
   * * Note that the inherited AxesProps allows multiple ways to specify orientation of the placement..
   * @public
   */
  export interface TransitionSpiralProps extends AxesProps {

    /** origin of the coordinate system. */
    origin: XYZProps;
    /** angle at departure from origin. */
    startBearing?: AngleProps;
    /** End bearing. */
    endBearing?: AngleProps;
    /** Radius at start  (0 for straight line) */
    startRadius?: number;
    /** Radius at end  (0 for straight line) */
    endRadius?: number;
    /** length along curve.
     * REMARK: "length" is preferred.  "curveLength" is deprecated.
     */
    length?: number;
    /**
     * Deprecated synonym for `length` property.
     * @deprecated
     */
    curveLength?: number;
    /** Fractional part of active interval.
     * * There has been name confusion between native and typescript .... accept any variant ..
     * * native (July 2020) emits activeFractionInterval
     */
    activeFractionInterval?: number[];
    /**
     * DEPRECATED -- use activeFractionInterval.   Reader looks for both, writer produces activeFractionInterval
     * @deprecated
     */
    fractionInterval?: number[];
    /**
     * DEPRECATED -- use activeFractionInterval.   Reader looks for both, writer produces activeFractionInterval
     * @deprecated
     */
    intervalFractions?: [number, number];
    /** TransitionSpiral type.
     * * expected names are given in `IntegratedSpiralTypeName` and `DirectSpiralTypeName`
     */
    type?: string;
  }

  /**
   * Interface for bspline curve (aka bcurve)
   * @public
   */
  export interface BcurveProps {
    /** control points */
    points: [XYZProps];
    /** knots. */
    knots: [number];
    /** order of polynomial
     * * The order is the number of basis functions that are in effect at any knot value.
     * * The order is the number of points that affect the curve at any knot value,
     *     i.e. the size of the "local support" set
     * * `order=2` is lines (degree 1)
     * * `order=3` is quadratic (degree 2)
     * * `order=4` is cubic (degree 3)
     * * The number of knots follows the convention "poles+order= knots".
     * * In this convention (for example), a clamped cubic with knots `[0,0,0,0, 1,2,3,4,4,4,4]`
     * has:
     * * * 4 (`order`) copies of the start and end knot (0 and 4) and
     * * * 3 interior knots
     * * Hence expect 7 poles.
     */
    order: number;
    /** optional flag for periodic data. */
    closed?: boolean;
  }

  /**
   * Interface for Box (or frustum with all rectangular sections parallel to primary xy section)
   * * Orientation may be given in any `AxesProp`s way (yawPitchRoll, xyVectors, zxVectors)
   * * if topX or topY are omitted, each defaults to its baseX or baseY peer.
   * * `topOrigin` is determined with this priority order:
   * * * `topOrigin` overrides given `height`
   * * * on the z axis at distance `height`
   * * * If both `topOrigin` and `height` are omitted, `height` defaults to `baseX`
   * @public
   */
  export interface BoxProps extends AxesProps {
    /** Origin of the box coordinate system  (required) */
    origin: XYZProps;
    /** base x size (required) */
    baseX: number;
    /** base size
     * * if omitted, defaults to baseX.
     */
    baseY: number;
    /** top origin.
     * * This is NOT required to be on the z axis.
     * * If omitted, a `heigh` must be present to given topOrigin on z axis.
     */
    topOrigin?: XYZProps;
    /** optional height.  This is only used if `topOrigin` is omitted. */
    height?: number;
    /** x size on top section.
     * * If omitted, `baseX` is used
     */
    topX?: number;
    /** y size on top section.
     * * If omitted, `baseY` is used
     */
    topY?: number;
    /** optional capping flag. */
    capped?: boolean;

  }

  /**
   * Interface for Sphere (with optionally different radius to pole versus equator)
   * * Orientation may be given in any `AxesProp`s way (yawPitchRoll, xyVectors, zxVectors)
   * @public
   */
  export interface SphereProps extends AxesProps {
    /** Center of the sphere coordinate system */
    center: XYZProps;

    /** primary radius */
    radius?: number;
    /** optional x radius */
    radiusX?: number;
    /** optional y radius */
    radiusY?: number;

    /** optional radius at poles.  */
    radiusZ?: number;

    /** optional sweep range for latitude.  Default latitude limits are [-90,90 ] degrees. */
    latitudeStartEnd?: AngleSweepProps;
    /** optional capping flag. If missing, implied false */
    capped?: boolean;
  }

  /**
   * Interface for TorusPipe data
   * * Orientation may be given in any `AxesProp`s way (yawPitchRoll, xyVectors, zxVectors)
   * * Both radii are required.
   * * axes are required
   * * Axis definition is
   * * xy plane contains the major circle
   * * x axis points from donut hole center to flow center at start of pipe.
   * * z axis points through the hole.
   * @public
   */
  export interface TorusPipeProps extends AxesProps {
    /** Center of the full torus coordinate system. (donut hole center) */
    center: XYZProps;

    /** primary radius  (elbow radius) */
    majorRadius: number;
    /** pipe radius */
    minorRadius?: number;
    /** sweep angle.
     * * if omitted, full 360 degree sweep.
     */
    sweepAngle?: AngleProps;
    /** optional capping flag. If missing, implied false */
    capped?: boolean;
  }

  /**
   * Interface for a ruled sweep.
   * @public
   */
  export interface RuledSweepProps {
    /** Array of contours */
    contour: [CurveCollectionProps];
    /** optional capping flag. */
    capped?: boolean;
  }
  /**
   * Interface for extra data attached to an indexed mesh.
   * See `TaggedNumericData` for further information (e.g. value `tagA` and `tagB` values)
   * @public
   */
  export interface TaggedNumericDataProps {
    /** integer tag identifying the meaning of this tag.  */
    tagA: number;
    /** Second integer tag.  */
    tagB: number;
    /** application specific integer data */
    intData?: number[];
    /** application specific doubles */
    doubleData?: number[];
  }
  /**
   * Interface for an indexed mesh.
   * * IMPORTANT: All indices are one-based.
   * * i.e. vertex index given as 11 appears at index 10 in the data array.
   * * This is to allow a negated index to mean "don't draw the following edge"
   * * Although negative indices are not allowed for normalIndex, colorIndex, or paramIndex, the "one based" style
   *     is used for them so that all indices within the indexedMesh json object are handled similarly.
   * * In all index arrays, a ZERO indicates "end of facet".
   * @public
   */
  export interface IndexedMeshProps {
    /** vertex coordinates */
    point: [XYZProps];
    /** surface normals */
    normal?: [XYZProps];
    /** texture space (uv parameter) coordinates */
    param?: [XYProps];
    /** 32 bit color values */
    color?: [number];

    /** SIGNED ONE BASED ZERO TERMINATED array of point indices. */
    pointIndex: [number];
    /** ONE BASED ZERO TERMINATED array of param indices.  ZERO is terminator for single facet. */
    paramIndex?: [number];
    /** ONE BASED ZERO TERMINATED array of normal indices. ZERO is terminator for single facet. */
    normalIndex?: [number];
    /** ONE BASED ZERO TERMINATED array of color indices. ZERO is terminator for single facet. */
    colorIndex?: [number];
    /** optional array of tagged geometry (such as to request subdivision surface) */
    taggedNumericData?: TaggedNumericDataProps;
  }
  /** parser services for "iModelJson" schema
   * * 1: create a reader with `new ImodelJsonReader`
   * * 2: parse json fragment to strongly typed geometry: `const g = reader.parse (fragment)`
   * @public
   */
  export class Reader {

    public constructor() { // empty ctor
    }

    private static parseVector3dProperty(json: any, propertyName: string, defaultValue?: Vector3d | undefined): Vector3d | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (Geometry.isNumberArray(value, 3))
          return Vector3d.create(value[0], value[1], value[2]);
        if (XYZ.isXAndY(value))
          return Vector3d.fromJSON(value);
      }
      return defaultValue;
    }

    private static parsePoint3dProperty(json: any, propertyName: string, defaultValue?: Point3d | undefined): Point3d | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (Geometry.isNumberArray(value, 3))
          return Point3d.create(value[0], value[1], value[2]);
        if (XYZ.isXAndY(value))
          return Point3d.fromJSON(value);
      }
      return defaultValue;
    }

    private static parseSegment1dProperty(json: any, propertyName: string, defaultValue?: Segment1d | undefined): Segment1d | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (Geometry.isNumberArray(value, 2))
          return Segment1d.create(value[0], value[1]);
      }
      return defaultValue;
    }

    private static parseNumberProperty(json: any, propertyName: string, defaultValue?: number | undefined): number | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (Number.isFinite(value))
          return value as number;
      }
      return defaultValue;
    }
    /**
     * @internal
     */
    public static parseTaggedNumericProps(json: any): TaggedNumericData | undefined {
      const tagA = this.parseNumberProperty(json, "tagA");
      const tagB = this.parseNumberProperty(json, "tagB", 0);
      if (tagA !== undefined) {
        const result = new TaggedNumericData(tagA, tagB);
        if (json.hasOwnProperty("intData"))
          result.intData = this.parseNumberArrayProperty(json, "intData", 0, undefined);
        if (json.hasOwnProperty("doubleData"))
          result.doubleData = this.parseNumberArrayProperty(json, "doubleData", 0, undefined);
        return result;
      }
      return undefined;
    }

    private static parseNumberArrayProperty(json: any, propertyName: string, minValues: number, maxValues: number | undefined, defaultValue?: number[] | undefined): number[] | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (Array.isArray(value)
          && value.length >= minValues && (undefined === maxValues || value.length <= maxValues)) {
          const result = [];
          for (const a of value) {
            result.push(a);
          }
          return result;
        }
      }
      return defaultValue;
    }

    private static parseAngleProperty(json: any, propertyName: string, defaultValue?: Angle | undefined): Angle | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        return Angle.fromJSON(value);
      }
      return defaultValue;
    }
    /**
     * @param defaultFunction function to call if needed to produce a default value
     */
    private static parseAngleSweepProps(json: any, propertyName: string, defaultFunction?: () => AngleSweep): AngleSweep | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        return AngleSweep.fromJSON(value);
      }
      if (defaultFunction === undefined)
        return undefined;
      return defaultFunction();
    }

    private static parseBooleanProperty(json: any, propertyName: string, defaultValue?: boolean | undefined): boolean | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (value === true) return true;
        if (value === false) return false;
      }
      return defaultValue;
    }

    private static loadContourArray(json: any, propertyName: string): CurveCollection[] | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (Array.isArray(value)) {
          const result = [];
          for (const contourData of value) {
            const contour = Reader.parse(contourData);
            if (contour instanceof CurveCollection) {
              result.push(contour);
            }
          }
          if (result.length > 0)
            return result;
        }
      }
      return undefined;
    }

    private static parseYawPitchRollAnglesToMatrix3d(json: YawPitchRollProps): Matrix3d | undefined {
      const ypr = YawPitchRollAngles.fromJSON(json);
      return ypr.toMatrix3d();
    }

    private static parseStringProperty(json: any, propertyName: string, defaultValue?: string | undefined): string | undefined {
      if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        // if (value instanceof string)
        return value;
      }
      return defaultValue;
    }

    private static parseAxesFromVectors(json: any, axisOrder: AxisOrder, createDefaultIdentity: boolean): Matrix3d | undefined {
      if (Array.isArray(json) && json.length === 2) {
        const xVector = Vector3d.fromJSON(json[0]);
        const yVector = Vector3d.fromJSON(json[1]);
        const matrix = Matrix3d.createRigidFromColumns(xVector, yVector, axisOrder);
        if (matrix) return matrix;
      }
      if (createDefaultIdentity)
        return Matrix3d.createIdentity();
      return undefined;
    }
    /**
     * Look for orientation data and convert to Matrix3d.
     * * Search order is:
     * * * yawPitchRollAngles
     * * * xyVectors
     * * * zxVectors
     * @param json [in] json source data
     * @param createDefaultIdentity [in] If true and no orientation is present, return an identity matrix.  If false and no orientation is present, return undefined.
     */
    private static parseOrientation(json: any, createDefaultIdentity: boolean): Matrix3d | undefined {
      if (json.yawPitchRollAngles) {
        return Reader.parseYawPitchRollAnglesToMatrix3d(json.yawPitchRollAngles);
      } else if (json.xyVectors) {
        return Reader.parseAxesFromVectors(json.xyVectors, AxisOrder.XYZ, createDefaultIdentity);
      } else if (json.zxVectors) {
        return Reader.parseAxesFromVectors(json.zxVectors, AxisOrder.ZXY, createDefaultIdentity);
      }
      if (createDefaultIdentity)
        return Matrix3d.createIdentity();
      return undefined;
    }

    private static parseArcByVectorProps(data?: ArcByVectorProps): Arc3d | undefined {
      if (data
        && data.center !== undefined
        && data.vectorX !== undefined
        && data.vectorY !== undefined
        && data.sweepStartEnd !== undefined
      ) {
        return Arc3d.create(
          Point3d.fromJSON(data.center),
          Vector3d.fromJSON(data.vectorX),
          Vector3d.fromJSON(data.vectorY),
          AngleSweep.fromJSON(data.sweepStartEnd));
      }
      return undefined;
    }
    // remark: Returns LineString3d as last default when give points are colinear.
    private static parseArcBy3Points(data?: ArcByVectorProps): Arc3d | LineString3d | undefined {
      if (Array.isArray(data) && data.length > 2) {
        const pointA = Point3d.fromJSON(data[0]);
        const pointB = Point3d.fromJSON(data[1]);
        const pointC = Point3d.fromJSON(data[2]);
        return Arc3d.createCircularStartMiddleEnd(pointA, pointB, pointC);
      }
      return undefined;
    }

    private static parseArcObject(data?: ArcByVectorProps): Arc3d | LineString3d | undefined {
      let arc: Arc3d | LineString3d | undefined = Reader.parseArcByVectorProps(data);
      if (arc)
        return arc;
      arc = Reader.parseArcBy3Points(data);
      return arc; // possibly undefined.
    }
    /** Parse point content (right side) `[1,2,3]` to a CoordinateXYZ object. */
    public static parseCoordinate(data?: any): CoordinateXYZ | undefined {
      const point = Point3d.fromJSON(data);
      if (point)
        return CoordinateXYZ.create(point);
      return undefined;
    }
    /** Parse TransitionSpiral content (right side) to TransitionSpiral3d
     * @alpha
     */
    public static parseTransitionSpiral(data?: TransitionSpiralProps): TransitionSpiral3d | undefined {
      const axes = Reader.parseOrientation(data, true)!;
      const origin = Reader.parsePoint3dProperty(data, "origin");
      // the create method will juggle any 4 out of these 5 inputs to define the other ..
      const startBearing = Reader.parseAngleProperty(data, "startBearing");
      const endBearing = Reader.parseAngleProperty(data, "endBearing");
      const startRadius = Reader.parseNumberProperty(data, "startRadius");
      const endRadius = Reader.parseNumberProperty(data, "endRadius");
      let length = Reader.parseNumberProperty(data, "length", undefined);
      if (length === undefined)
        length = Reader.parseNumberProperty(data, "curveLength", undefined);

      let interval = Reader.parseSegment1dProperty(data, "activeFractionInterval", undefined);
      if (!interval)
        interval = Reader.parseSegment1dProperty(data, "fractionInterval", undefined);
      if (!interval)
        interval = Reader.parseSegment1dProperty(data, "activeInterval", undefined);
      const spiralType = Reader.parseStringProperty(data, "type", "clothoid")!;
      // REMARK:  Our job is to parse and pass data along -- inscrutable validation happens in the implementation classes . . .
      if (origin) {
        let candidate: TransitionSpiral3d | undefined;
        candidate = IntegratedSpiral3d.createFrom4OutOf5(
          spiralType,
          startRadius, endRadius,
          startBearing, endBearing,
          length,
          interval,
          Transform.createOriginAndMatrix(origin, axes));
        if (candidate)
          return candidate;
        candidate = DirectSpiral3d.createFromLengthAndRadius(
          spiralType,
          startRadius, endRadius,
          startBearing, endBearing,
          length,
          interval,
          Transform.createOriginAndMatrix(origin, axes));
        if (candidate)
          return candidate;
      }
      return undefined;
    }
    /**
     * Special closed case if the input was forced to bezier . . . (e.g. arc)
     *       (b-1) 0 0 0  a . . . b 111 (a+1)
     *       with {order} clamp-like values .. no pole duplication needed, but throw out 2 knots at each end . ..
     * @param numPoles number of poles
     * @param knots knot vector
     * @param order curve order
     * @param newKnots array to receive new knots.
     * @returns true if this is a closed-but-clamped case and corrected knots are filled in.
     */
    private static getCorrectedKnotsForClosedClamped(numPoles: number, knots: number[], order: number, newKnots: number[]): boolean {
      const numKnots = knots.length;
      if (numPoles + 2 * order - 1 === numKnots
        && knots[0] < knots[1]
        && knots[numKnots - 2] < knots[numKnots - 1]) {
        const a0 = knots[1];
        const a1 = knots[numKnots - 2];
        for (let i = 2; i <= order; i++) {
          if (knots[i] !== a0)
            return false;
          if (knots[numKnots - 1 - i] !== a1)
            return false;
        }
        // copy only the "minimal" set - without the typical extra knots from microstation and psd.
        for (let i = 2; i + 2 < numKnots; i++)
          newKnots.push(knots[i]);
        return true;
      }
      return false;
    }
    /** Parse `bcurve` content (right side)to  BSplineCurve3d or BSplineCurve3dH object. */
    public static parseBcurve(data?: any): BSplineCurve3d | BSplineCurve3dH | undefined {
      if (data === undefined)
        return undefined;
      if (Array.isArray(data.points) && Array.isArray(data.knots) && Number.isFinite(data.order) && data.closed !== undefined) {
        if (data.points[0].length === 4) {
          const hPoles: Point4d[] = [];
          for (const p of data.points) hPoles.push(Point4d.fromJSON(p));
          const knots: number[] = [];
          let wrapMode = BSplineWrapMode.None;
          if (data.closed && this.getCorrectedKnotsForClosedClamped(data.points.length, data.knots, data.order, knots)) {
            // leave the poles alone -- knots are fixed.
            wrapMode = BSplineWrapMode.OpenByRemovingKnots;
          } else if (data.closed) {
            for (const knot of data.knots) knots.push(knot);
            for (let i = 0; i + 1 < data.order; i++) {
              hPoles.push(hPoles[i].clone());
            }
            wrapMode = BSplineWrapMode.OpenByAddingControlPoints;
          } else {
            // simple case .. just copy
            for (const knot of data.knots) knots.push(knot);
          }
          const newCurve = BSplineCurve3dH.create(hPoles, knots, data.order);
          if (newCurve) {
            if (data.closed === true)
              newCurve.setWrappable(wrapMode);
            return newCurve;
          }
        } else if (data.points[0].length === 3 || data.points[0].length === 2) {

          const poles: Point3d[] = [];
          for (const p of data.points) poles.push(Point3d.fromJSON(p));
          const knots: number[] = [];
          let wrapMode = BSplineWrapMode.None;
          if (data.closed && this.getCorrectedKnotsForClosedClamped(data.points.length, data.knots, data.order, knots)) {
            wrapMode = BSplineWrapMode.OpenByRemovingKnots;
            // leave the poles alone -- knots are fixed.
          } else if (data.closed) {
            for (const knot of data.knots) knots.push(knot);
            for (let i = 0; i + 1 < data.order; i++) {
              poles.push(poles[i].clone());
            }
            wrapMode = BSplineWrapMode.OpenByAddingControlPoints;
          } else {
            // simple case .. just copy
            for (const knot of data.knots) knots.push(knot);
          }
          const newCurve = BSplineCurve3d.create(poles, knots, data.order);
          if (newCurve) {
            if (data.closed === true)
              newCurve.setWrappable(wrapMode);
            return newCurve;
          }
        }

      }
      return undefined;
    }

    /** Parse `bcurve` content (right side)to  BSplineCurve3d or BSplineCurve3dH object. */
    public static parseInterpolationCurve(data?: any): InterpolationCurve3d | undefined {
      if (data === undefined)
        return undefined;
      return InterpolationCurve3d.create(data);
    }

    /** Parse `bcurve` content (right side)to an Akima curve object. */
    public static parseAkimaCurve3d(data?: any): AkimaCurve3d | undefined {
      if (data === undefined)
        return undefined;
      return AkimaCurve3d.create(data);
    }

    /** Parse array of json objects to array of instances. */
    public static parseArray(data?: any): any[] | undefined {
      if (Array.isArray(data)) {
        const myArray = [];
        let c;
        for (c of data) {
          const g = Reader.parse(c);
          if (g !== undefined)
            myArray.push(g);
        }
        return myArray;
      }
      return undefined;
    }

    // For each nonzero index, Announce Math.abs (value) -1
    private static addZeroBasedIndicesFromSignedOneBased(data: any, numPerFace: number, f: (x: number) => any): void {
      if (data && Geometry.isNumberArray(data)) {
        if (numPerFace > 1) {
          // all indices are used ...
          for (const value of data) {
            f(Math.abs(value) - 1);
          }
        } else {
          // ignore separator zeros ...
          for (const value of data) {
            if (value !== 0)
              f(Math.abs(value) - 1);
          }
        }
      }
    }
    /** parse polyface aux data content to PolyfaceAuxData instance */
    public static parsePolyfaceAuxData(data: any = undefined, numPerFace: number = 0): PolyfaceAuxData | undefined {

      if (!Array.isArray(data.channels) || !Array.isArray(data.indices))
        return undefined;

      const outChannels: AuxChannel[] = [];
      for (const inChannel of data.channels) {
        if (Array.isArray(inChannel.data) && inChannel.hasOwnProperty("dataType")) {
          const outChannelData: AuxChannelData[] = [];
          for (const inChannelData of inChannel.data) {
            if (inChannelData.hasOwnProperty("input") && Array.isArray(inChannelData.values))
              outChannelData.push(new AuxChannelData(inChannelData.input, inChannelData.values));
          }
          outChannels.push(new AuxChannel(outChannelData, inChannel.dataType as AuxChannelDataType, inChannel.name, inChannel.inputName));
        }
      }

      const auxData = new PolyfaceAuxData(outChannels, []);
      Reader.addZeroBasedIndicesFromSignedOneBased(data.indices, numPerFace, (x: number) => { auxData.indices.push(x); });

      return auxData;
    }

    /** parse indexed mesh content to an IndexedPolyface instance */
    public static parseIndexedMesh(data?: any): IndexedPolyface | undefined {
      // {Coord:[[x,y,z],. . . ],   -- simple xyz for each point
      // CoordIndex[1,2,3,0]    -- zero-terminated, one based !!!
      if (data.hasOwnProperty("point") && Array.isArray(data.point)
        && data.hasOwnProperty("pointIndex") && Array.isArray(data.pointIndex)) {
        const polyface = IndexedPolyface.create();
        if (data.hasOwnProperty("normal") && Array.isArray(data.normal)) {
          // for normals, addNormal() is overeager to detect the (common) case of duplicate normals in sequence.
          // use addNormalXYZ which always creates a new one.
          // likewise for params
          for (const uvw of data.normal) {
            if (Geometry.isNumberArray(uvw, 3))
              polyface.addNormalXYZ(uvw[0], uvw[1], uvw[2]);
          }
        }
        if (data.hasOwnProperty("twoSided")) {
          const q = data.twoSided;
          if (q === true || q === false) {
            polyface.twoSided = q;
          }
        }
        const numPerFace = data.hasOwnProperty("numPerFace") ? data.numPerFace : 0;
        if (data.hasOwnProperty("expectedClosure")) {
          const q = data.expectedClosure;
          if (Number.isFinite(q)) {
            polyface.expectedClosure = q;
          }
        }
        if (data.hasOwnProperty("param") && Array.isArray(data.param)) {
          for (const uv of data.param) {
            if (Geometry.isNumberArray(uv, 2))
              polyface.addParamUV(uv[0], uv[1]);
          }
        }
        if (data.hasOwnProperty("color") && Array.isArray(data.color)) {
          for (const c of data.color) {
            polyface.addColor(c);
          }
        }

        for (const p of data.point) polyface.addPointXYZ(p[0], p[1], p[2]);

        if (numPerFace > 1) {
          for (let i = 0; i < data.pointIndex.length; i++) {
            const p = data.pointIndex[i];
            const p0 = Math.abs(p) - 1;
            polyface.addPointIndex(p0, p > 0);
            if ((i + 1) % numPerFace === 0)
              polyface.terminateFacet(false);
          }

        } else {
          for (const p of data.pointIndex) {
            if (p === 0)
              polyface.terminateFacet(false); // we are responsible for index checking !!!
            else {
              const p0 = Math.abs(p) - 1;
              polyface.addPointIndex(p0, p > 0);
            }
          }
        }

        if (data.hasOwnProperty("normalIndex")) {
          Reader.addZeroBasedIndicesFromSignedOneBased(data.normalIndex, numPerFace,
            (x: number) => { polyface.addNormalIndex(x); });
        }
        if (data.hasOwnProperty("paramIndex")) {
          Reader.addZeroBasedIndicesFromSignedOneBased(data.paramIndex, numPerFace,
            (x: number) => { polyface.addParamIndex(x); });
        }

        if (data.hasOwnProperty("colorIndex")) {
          Reader.addZeroBasedIndicesFromSignedOneBased(data.colorIndex, numPerFace,
            (x: number) => { polyface.addColorIndex(x); });
        }
        if (data.hasOwnProperty("auxData"))
          polyface.data.auxData = Reader.parsePolyfaceAuxData(data.auxData, numPerFace);

        if (data.hasOwnProperty("tags")) {
          polyface.data.taggedNumericData = Reader.parseTaggedNumericProps(data.tags);
        }

        return polyface;
      }
      return undefined;
    }
    /** parse contents of a curve collection to a CurveCollection instance */
    public static parseCurveCollectionMembers(result: CurveCollection, data?: any): CurveCollection | undefined {
      if (data && Array.isArray(data)) {
        for (const c of data) {
          const g = Reader.parse(c);
          if (g instanceof GeometryQuery && ("curveCollection" === g.geometryCategory || "curvePrimitive" === g.geometryCategory))
            result.tryAddChild(g);
        }
        return result;
      }
      return undefined;
    }
    /** Parse content of `bsurf` to BSplineSurface3d or BSplineSurface3dH */
    public static parseBsurf(data?: any): BSplineSurface3d | BSplineSurface3dH | undefined {
      if (data.hasOwnProperty("uKnots") && Array.isArray(data.uKnots)
        && data.hasOwnProperty("vKnots") && Array.isArray(data.vKnots)
        && data.hasOwnProperty("orderU") && Number.isFinite(data.orderU)
        && data.hasOwnProperty("orderV") && Number.isFinite(data.orderV)
        && data.hasOwnProperty("points") && Array.isArray(data.points)
      ) {
        const orderU = data.orderU;
        const orderV = data.orderV;
        if (Array.isArray(data.points[0]) && Array.isArray(data.points[0][0])) {
          const d = data.points[0][0].length;
          /** xyz surface (no weights) */
          if (d === 3) {
            return BSplineSurface3d.createGrid(data.points,
              orderU, data.uKnots,
              orderV, data.vKnots);
          }
          /** xyzw surface (weights already applied) */
          if (d === 4) {
            return BSplineSurface3dH.createGrid(data.points,
              WeightStyle.WeightsAlreadyAppliedToCoordinates,
              orderU, data.uKnots,
              orderV, data.vKnots);
          }
        }
      }
      return undefined;
    }
    /** Parse `cone` contents to `Cone` instance  */
    public static parseConeProps(json?: ConeProps): Cone | undefined {
      const axes = Reader.parseOrientation(json, false);
      const start = Reader.parsePoint3dProperty(json, "start");
      const end = Reader.parsePoint3dProperty(json, "end");
      const radius = Reader.parseNumberProperty(json, "radius");
      const startRadius = Reader.parseNumberProperty(json, "startRadius", radius);
      const endRadius = Reader.parseNumberProperty(json, "endRadius", startRadius);

      const capped = Reader.parseBooleanProperty(json, "capped", false) as boolean;

      if (start
        && end
        && startRadius !== undefined
        && endRadius !== undefined) {
        if (axes === undefined) {
          const axisVector = Vector3d.createStartEnd(start, end);
          const frame = Matrix3d.createRigidHeadsUp(axisVector, AxisOrder.ZXY);
          const vectorX = frame.columnX();
          const vectorY = frame.columnY();
          return Cone.createBaseAndTarget(start, end, vectorX, vectorY, startRadius, endRadius, capped);
        } else {
          return Cone.createBaseAndTarget(start, end, axes.columnX(), axes.columnY(), startRadius, endRadius, capped);
        }
      }
      return undefined;
    }

    /** Parse `cylinder` content to `Cone` instance */
    public static parseCylinderProps(json?: CylinderProps): Cone | undefined {
      const start = Reader.parsePoint3dProperty(json, "start");
      const end = Reader.parsePoint3dProperty(json, "end");
      const radius = Reader.parseNumberProperty(json, "radius");

      const capped = Reader.parseBooleanProperty(json, "capped", false) as boolean;

      if (start
        && end
        && radius !== undefined) {
        return Cone.createAxisPoints(start, end, radius, radius, capped);
      }
      return undefined;
    }
    /** Parse line segment (array of 2 points) properties to `LineSegment3d` instance */
    private static parseLineSegmentProps(value: any[]): LineSegment3d | undefined {
      if (Array.isArray(value) && value.length > 1)
        return LineSegment3d.create(Point3d.fromJSON(value[0]), Point3d.fromJSON(value[1]));
      else
        return undefined;
    }
    /** Parse linear sweep content to `LinearSweep` instance. */
    public static parseLinearSweep(json?: any): LinearSweep | undefined {
      const contour = Reader.parse(json.contour);
      const capped = Reader.parseBooleanProperty(json, "capped");
      const extrusionVector = Reader.parseVector3dProperty(json, "vector");
      if (contour instanceof GeometryQuery
        && "curveCollection" === contour.geometryCategory
        && capped !== undefined
        && extrusionVector
      ) {
        return LinearSweep.create(contour, extrusionVector, capped);
      }
      return undefined;
    }
    /** Parse rotational sweep contents to `RotationalSweep` instance */
    public static parseRotationalSweep(json?: RotationalSweepProps): RotationalSweep | undefined {
      if (json === undefined)
        return undefined;
      const contour = Reader.parse(json.contour);
      const capped = Reader.parseBooleanProperty(json, "capped");
      const axisVector = Reader.parseVector3dProperty(json, "axis");
      const center = Reader.parsePoint3dProperty(json, "center");
      const sweepDegrees = Reader.parseNumberProperty(json, "sweepAngle");
      if (contour instanceof GeometryQuery
        && "curveCollection" === contour.geometryCategory
        && sweepDegrees !== undefined
        && capped !== undefined
        && axisVector
        && center
      ) {
        return RotationalSweep.create(
          contour,
          Ray3d.createCapture(center, axisVector),
          Angle.createDegrees(sweepDegrees),
          capped);
      }
      return undefined;
    }
    /** Parse box contents to `Box` instance */
    public static parseBox(json?: BoxProps): Box | undefined {
      const capped = Reader.parseBooleanProperty(json, "capped", false);
      const baseOrigin = Reader.parsePoint3dProperty(json, "baseOrigin");
      const baseX = Reader.parseNumberProperty(json, "baseX");
      const baseY = Reader.parseNumberProperty(json, "baseY", baseX);
      let topOrigin = Reader.parsePoint3dProperty(json, "topOrigin");
      const topX = Reader.parseNumberProperty(json, "topX", baseX);
      const topY = Reader.parseNumberProperty(json, "topY", baseY);
      const height = Reader.parseNumberProperty(json, "height", baseX);
      const axes = Reader.parseOrientation(json, true)!;

      if (baseOrigin && !topOrigin)
        topOrigin = Matrix3d.xyzMinusMatrixTimesXYZ(baseOrigin, axes, Vector3d.create(0, 0, height));

      if (capped !== undefined
        && baseX !== undefined
        && baseY !== undefined
        && topY !== undefined
        && topX !== undefined
        && axes
        && baseOrigin
        && topOrigin
      ) {
        return Box.createDgnBoxWithAxes(baseOrigin, axes, topOrigin, baseX, baseY, topX, topY, capped);
      }
      return undefined;
    }
    /** Parse `SphereProps` to `Sphere` instance. */
    public static parseSphere(json?: SphereProps): Sphere | undefined {
      const center = Reader.parsePoint3dProperty(json, "center");
      // optional unqualified radius . . .
      const radius = Reader.parseNumberProperty(json, "radius");
      // optional specific X
      const radiusX = Reader.parseNumberProperty(json, "radiusX", radius);
      // missing Y and Z both pick up radiusX  (which may have already been defaulted from unqualified radius)
      const radiusY = Reader.parseNumberProperty(json, "radiusX", radiusX);
      const radiusZ = Reader.parseNumberProperty(json, "radiusX", radiusX);
      const latitudeStartEnd = Reader.parseAngleSweepProps(json, "latitudeStartEnd"); // this may be undefined!!

      const axes = Reader.parseOrientation(json, true)!;

      const capped = Reader.parseBooleanProperty(json, "capped", false);

      if (center !== undefined
        && radiusX !== undefined
        && radiusY !== undefined
        && radiusZ !== undefined
        && capped !== undefined) {
        return Sphere.createFromAxesAndScales(center, axes, radiusX, radiusY, radiusZ, latitudeStartEnd, capped);
      }
      return undefined;
    }
    /** Parse RuledSweepProps to RuledSweep instance. */
    public static parseRuledSweep(json?: RuledSweepProps): RuledSweep | undefined {
      const capped = Reader.parseBooleanProperty(json, "capped", false);
      const contours = this.loadContourArray(json, "contour");
      if (contours !== undefined
        && capped !== undefined) {
        return RuledSweep.create(contours, capped);
      }
      return undefined;
    }
    /** Parse TorusPipe props to TorusPipe instance. */
    public static parseTorusPipe(json?: TorusPipeProps): TorusPipe | undefined {

      const axes = Reader.parseOrientation(json, true)!;
      const center = Reader.parsePoint3dProperty(json, "center");
      const radiusA = Reader.parseNumberProperty(json, "majorRadius");
      const radiusB = Reader.parseNumberProperty(json, "minorRadius");
      const sweepAngle = Reader.parseAngleProperty(json, "sweepAngle", undefined);
      const capped = Reader.parseBooleanProperty(json, "capped", false)!;
      if (center
        && radiusA !== undefined
        && radiusB !== undefined
      ) {

        return TorusPipe.createDgnTorusPipe(center, axes.columnX(), axes.columnY(),
          radiusA, radiusB,
          sweepAngle ? sweepAngle : Angle.createDegrees(360), capped);
      }
      return undefined;
    }
    /** Parse an array object to array of Point3d instances. */
    public static parsePointArray(json?: any[]): Point3d[] {
      const points = [];
      if (json && Array.isArray(json)) {
        for (const member of json) {
          if (XYZ.isXAndY(member)) {
            points.push(Point3d.fromJSON(member));
          } else if (Geometry.isNumberArray(member, 2)) {
            points.push(Point3d.fromJSON(member));
          }
        }
      }
      return points;
    }
    /** Deserialize `json` to `GeometryQuery` instances. */
    public static parse(json?: any): AnyGeometryQuery | any[] | undefined {
      if (json !== undefined && json as object) {
        if (json.lineSegment !== undefined) {
          return Reader.parseLineSegmentProps(json.lineSegment);
        } else if (json.lineString !== undefined) {
          return LineString3d.create(Reader.parsePointArray(json.lineString));
        } else if (json.arc !== undefined) {
          return Reader.parseArcObject(json.arc);
        } else if (json.hasOwnProperty("point")) {
          return Reader.parseCoordinate(json.point);

        } else if (json.hasOwnProperty("bcurve")) {
          return Reader.parseBcurve(json.bcurve);
        } else if (json.hasOwnProperty("interpolationCurve")) {
          return Reader.parseInterpolationCurve(json.interpolationCurve);
        } else if (json.hasOwnProperty("akimaCurve")) {
          return Reader.parseAkimaCurve3d(json.akimaCurve);
        } else if (json.hasOwnProperty("path")) {
          return Reader.parseCurveCollectionMembers(new Path(), json.path);
        } else if (json.hasOwnProperty("loop")) {
          return Reader.parseCurveCollectionMembers(new Loop(), json.loop);
        } else if (json.hasOwnProperty("parityRegion")) {
          return Reader.parseCurveCollectionMembers(new ParityRegion(), json.parityRegion);
        } else if (json.hasOwnProperty("unionRegion")) {
          return Reader.parseCurveCollectionMembers(new UnionRegion(), json.unionRegion);
        } else if (json.hasOwnProperty("bagOfCurves")) {
          return Reader.parseCurveCollectionMembers(new BagOfCurves(), json.bagOfCurves);
        } else if (json.hasOwnProperty("indexedMesh")) {
          return Reader.parseIndexedMesh(json.indexedMesh);
        } else if (json.hasOwnProperty("bsurf")) {
          return Reader.parseBsurf(json.bsurf);
        } else if (json.hasOwnProperty("cone")) {
          return Reader.parseConeProps(json.cone);
        } else if (json.hasOwnProperty("cylinder")) {
          return Reader.parseCylinderProps(json.cylinder);
        } else if (json.hasOwnProperty("sphere")) {
          return Reader.parseSphere(json.sphere);
        } else if (json.hasOwnProperty("linearSweep")) {
          return Reader.parseLinearSweep(json.linearSweep);
        } else if (json.hasOwnProperty("box")) {
          return Reader.parseBox(json.box);
        } else if (json.hasOwnProperty("rotationalSweep")) {
          return Reader.parseRotationalSweep(json.rotationalSweep);
        } else if (json.hasOwnProperty("ruledSweep")) {
          return Reader.parseRuledSweep(json.ruledSweep);
        } else if (json.hasOwnProperty("torusPipe")) {
          return Reader.parseTorusPipe(json.torusPipe);
        } else if (json.hasOwnProperty("pointString")) {
          return PointString3d.create(Reader.parsePointArray(json.pointString));
        } else if (json.hasOwnProperty("transitionSpiral")) {
          return Reader.parseTransitionSpiral(json.transitionSpiral);
        } else if (Array.isArray(json))
          return Reader.parseArray(json);
      }
      return undefined;
    }
  }
  // ISSUE: include 3d in names?
  // ISSUE: would like shorter term than lineSegment
  // ISSUE: is arc clear?
  // ISSUE: label center, vectorX, vector90 on arc?
  // ISSUE: sweep data on arc -- serialize as AngleSweep?
  /**
   * Class to deserialize json objects into GeometryQuery objects
   * @public
   */
  export class Writer extends GeometryHandler {

    public handleTaggedNumericData(data: TaggedNumericData): TaggedNumericDataProps {
      const result: TaggedNumericDataProps = { tagA: data.tagA, tagB: data.tagB };
      if (data.intData !== undefined && data.intData.length > 0)
        result.intData = data.intData.slice();
      if (data.doubleData !== undefined && data.doubleData.length > 0)
        result.doubleData = data.doubleData.slice();
      return result;
    }
    /** Convert strongly typed instance to tagged json */
    public handleLineSegment3d(data: LineSegment3d): any {
      return { lineSegment: [data.point0Ref.toJSON(), data.point1Ref.toJSON()] };
    }
    /** Convert strongly typed instance to tagged json */
    public handleCoordinateXYZ(data: CoordinateXYZ): any {
      return { point: data.point.toJSON() };
    }

    /** Convert strongly typed instance to tagged json */
    public handleArc3d(data: Arc3d): any {
      return {
        arc: {
          center: data.center.toJSON(),
          vectorX: data.vector0.toJSON(),
          vectorY: data.vector90.toJSON(),
          sweepStartEnd: [data.sweep.startDegrees, data.sweep.endDegrees],
        },
      };
    }
    /**
     * Insert orientation description to a data object.
     * @param matrix matrix with orientation
     * @param omitIfIdentity omit the axis data if the matrix is an identity.
     * @param data AxesProps object to be annotated.
     */
    private static insertOrientationFromMatrix(data: AxesProps, matrix: Matrix3d | undefined, omitIfIdentity: boolean) {
      if (omitIfIdentity) {
        if (matrix === undefined)
          return;
        if (matrix.isIdentity)
          return;
      }
      if (matrix)
        data.xyVectors = [matrix.columnX().toJSON(), matrix.columnY().toJSON()];
      else
        data.xyVectors = [[1, 0, 0], [0, 1, 0]];
    }
    private static isIdentityXY(xVector: Vector3d, yVector: Vector3d): boolean {
      return xVector.isAlmostEqualXYZ(1, 0, 0) && yVector.isAlmostEqualXYZ(0, 1, 0);
    }

    /**
     * Insert orientation description to a data object.
     * @param matrix matrix with orientation
     * @param omitIfIdentity omit the axis data if the matrix is an identity.
     * @param data AxesProps object to be annotated.
     */
    private static insertOrientationFromXYVectors(data: AxesProps, vectorX: Vector3d, vectorY: Vector3d, omitIfIdentity: boolean) {
      if (omitIfIdentity && Writer.isIdentityXY(vectorX, vectorY))
        return;
      data.xyVectors = [vectorX.toJSON(), vectorY.toJSON()];
    }

    /**
     * Insert orientation description to a data object, with orientation defined by u and v direction
     * vectors.
     * @param vectorX u direction
     * @param vectorV v direction
     * @param omitIfIdentity omit the axis data if the vectorU and vectorV are global x and y vectors.
     * @param data AxesProps object to be annotated.
     */
    private static insertXYOrientation(data: AxesProps, vectorU: Vector3d, vectorV: Vector3d, omitIfIdentity: boolean) {
      if (omitIfIdentity) {
        if (vectorU.isAlmostEqualXYZ(1, 0, 0) && vectorV.isAlmostEqualXYZ(0, 1, 0))
          return;
      }
      data.xyVectors = [vectorU.toJSON(), vectorV.toJSON()];
    }
    /**
     * parse properties of a TransitionSpiral.
     * @alpha
     */
    public handleTransitionSpiral(data: TransitionSpiral3d): any {
      // TODO: HANDLE NONRIGID TRANSFORM !!
      // the spiral may have indication of how it was defined.  If so, use defined/undefined state of the original data
      // as indication of what current data to use.  (Current data may have changed due to transforms.)
      if (data instanceof DirectSpiral3d) {
        const value: TransitionSpiralProps = {
          origin: data.localToWorld.origin.toJSON(),
          type: data.spiralType,
        };
        Writer.insertOrientationFromMatrix(value, data.localToWorld.matrix, true);

        if (!data.activeFractionInterval.isExact01)
          value.activeFractionInterval = [data.activeFractionInterval.x0, data.activeFractionInterval.x1];
        // Object.defineProperty(value, "fractionInterval", { value: [data.activeFractionInterval.x0, data.activeFractionInterval.x1] });
        value.startRadius = 0;
        value.endRadius = data.nominalR1;
        value.length = data.nominalL1;
        return { transitionSpiral: value };

      } else if (data instanceof IntegratedSpiral3d) {
        // TODO: HANDLE NONRIGID TRANSFORM !!
        // the spiral may have indication of how it was defined.  If so, use defined/undefined state of the original data
        // as indication of what current data to use.  (Current data may have changed due to transforms.)
        const originalProperties = data.designProperties;

        const value: TransitionSpiralProps = {
          origin: data.localToWorld.origin.toJSON(),
          type: data.spiralType,
        };
        Writer.insertOrientationFromMatrix(value, data.localToWorld.matrix, true);

        if (!data.activeFractionInterval.isExact01)
          value.activeFractionInterval = [data.activeFractionInterval.x0, data.activeFractionInterval.x1];
        // Object.defineProperty(value, "fractionInterval", { value: [data.activeFractionInterval.x0, data.activeFractionInterval.x1] });

        // if possible, do selective output of defining data (omit exactly one out of the 5, matching original definition)
        // EXCEPT do not omit final radius .. readers want it?
        if (originalProperties !== undefined && originalProperties.numDefinedProperties() === 4) {
          if (originalProperties.radius0 !== undefined)
            value.startRadius = data.radius01.x0;
          if (originalProperties.radius1 !== undefined)
            value.endRadius = data.radius01.x1;
          if (originalProperties.bearing0 !== undefined)
            value.startBearing = data.bearing01.startAngle.toJSON();
          if (originalProperties.bearing1 !== undefined)
            value.endBearing = data.bearing01.endAngle.toJSON();
          if (originalProperties.curveLength !== undefined)
            value.length = data.curveLength();
          if (value.endRadius === undefined)
            value.endRadius = data.radius01.x1;
        } else {
          // uh oh ... no original data, but the spiral itself knows all 5 values.  We don't know which to consider primary.
          // DECISION -- put everything out, let readers make sense if they can. (It should be consistent ?)
          value.startRadius = data.radius01.x0;
          value.endRadius = data.radius01.x1;
          value.startBearing = data.bearing01.startAngle.toJSON();
          value.endBearing = data.bearing01.endAngle.toJSON();
          value.length = data.curveLength();
        }
        return { transitionSpiral: value };
      }
      return undefined;
    }

    /** Convert strongly typed instance to tagged json */
    public handleCone(data: Cone): any {

      const radiusA = data.getRadiusA();
      const radiusB = data.getRadiusB();
      const centerA = data.getCenterA();
      const centerB = data.getCenterB();
      const vectorX = data.getVectorX();
      const vectorY = data.getVectorY();
      const axisVector = Vector3d.createStartEnd(centerA, centerB);

      if (Geometry.isSameCoordinate(radiusA, radiusB)
        && vectorX.isPerpendicularTo(axisVector)
        && vectorY.isPerpendicularTo(axisVector)
        && Geometry.isSameCoordinate(vectorX.magnitude(), 1.0)
        && Geometry.isSameCoordinate(vectorY.magnitude(), 1.0)) {
        return {
          cylinder: {
            capped: data.capped,
            start: data.getCenterA().toJSON(),
            end: data.getCenterB().toJSON(),
            radius: radiusA,
          },
        };
      } else {
        const coneProps: ConeProps = {
          capped: data.capped,
          start: data.getCenterA().toJSON(),
          end: data.getCenterB().toJSON(),
          startRadius: data.getRadiusA(),
          endRadius: data.getRadiusB(),
        };
        Writer.insertOrientationFromXYVectors(coneProps, vectorX, vectorY, false);
        return { cone: coneProps };
      }
    }

    /** Convert strongly typed instance to tagged json */
    public handleSphere(data: Sphere): any {
      const xData = data.cloneVectorX().normalizeWithLength();
      const yData = data.cloneVectorY().normalizeWithLength();
      const zData = data.cloneVectorZ().normalizeWithLength();
      const latitudeSweep = data.cloneLatitudeSweep();

      const rX = xData.mag;
      const rY = yData.mag;
      const rZ = zData.mag;
      if (xData.v && zData.v) {
        const value: SphereProps = {
          center: data.cloneCenter().toJSON(),
        };
        if (!(data.getConstructiveFrame()!).matrix.isIdentity)
          value.zxVectors = [zData.v.toJSON(), xData.v.toJSON()];
        const fullSweep = latitudeSweep.isFullLatitudeSweep;

        if (data.capped && !fullSweep)
          value.capped = data.capped;

        if (Geometry.isSameCoordinate(rX, rY) && Geometry.isSameCoordinate(rX, rZ))
          value.radius = rX;
        else {
          value.radiusX = rX;
          value.radiusY = rY;
          value.radiusZ = rZ;
        }
        if (!fullSweep)
          value.latitudeStartEnd = latitudeSweep.toJSON();
        return { sphere: value };
      }
      return undefined;
    }

    /** Convert strongly typed instance to tagged json */
    public handleTorusPipe(data: TorusPipe): any {

      const vectorX = data.cloneVectorX();
      const vectorY = data.cloneVectorY();
      const radiusA = data.getMajorRadius();
      const radiusB = data.getMinorRadius();
      const sweep = data.getSweepAngle();
      if (data.getIsReversed()) {
        vectorY.scaleInPlace(-1.0);
        sweep.setRadians(-sweep.radians);
      }
      const value: TorusPipeProps = {
        center: data.cloneCenter().toJSON(),
        majorRadius: radiusA,
        minorRadius: radiusB,
        xyVectors: [vectorX.toJSON(), vectorY.toJSON()],
      };
      if (!sweep.isFullCircle) {
        value.sweepAngle = sweep.degrees;
        value.capped = data.capped;
      }
      return { torusPipe: value };

    }

    /** Convert strongly typed instance to tagged json */
    public handleLineString3d(data: LineString3d): any {
      const pointsA = data.points;
      const pointsB = [];
      if (pointsA)
        for (const p of pointsA) pointsB.push(p.toJSON());
      return { lineString: pointsB };
    }

    /** Convert strongly typed instance to tagged json */
    public handlePointString3d(data: PointString3d): any {
      const pointsA = data.points;
      const pointsB = [];
      if (pointsA)
        for (const p of pointsA) pointsB.push(p.toJSON());
      return { pointString: pointsB };
    }

    /** Convert strongly typed instance to tagged json */
    public override handlePath(data: Path): any {
      return { path: this.collectChildren(data) };
    }
    /** Convert strongly typed instance to tagged json */
    public override handleLoop(data: Loop): any {
      return { loop: this.collectChildren(data) };
    }

    /** Convert strongly typed instance to tagged json */
    public override handleParityRegion(data: ParityRegion): any {
      return { parityRegion: this.collectChildren(data) };
    }

    /** Convert strongly typed instance to tagged json */
    public override handleUnionRegion(data: UnionRegion): any {
      return { unionRegion: this.collectChildren(data) };
    }

    /** Convert strongly typed instance to tagged json */
    public override handleBagOfCurves(data: BagOfCurves): any {
      return { bagOfCurves: this.collectChildren(data) };
    }

    private collectChildren(data: CurveCollection): any[] {
      const children = [];
      if (data.children && Array.isArray(data.children)) {
        for (const child of data.children) {
          const cdata = child.dispatchToGeometryHandler(this);
          if (cdata)
            children.push(cdata);
        }
      }
      return children;
    }

    /** Convert strongly typed instance to tagged json */
    public handleLinearSweep(data: LinearSweep): any {
      const extrusionVector = data.cloneSweepVector();
      const curves = data.getCurvesRef();
      const capped = data.capped;
      if (extrusionVector
        && curves
        && capped !== undefined) {
        return {
          linearSweep: {
            contour: curves.dispatchToGeometryHandler(this),
            capped,
            vector: extrusionVector.toJSON(),
          },
        };
      }
      return undefined;
    }

    /** Convert strongly typed instance to tagged json */
    public handleRuledSweep(data: RuledSweep): any {
      const contours = data.cloneContours();
      const capped = data.capped;
      if (contours
        && contours.length > 1
        && capped !== undefined) {
        const jsonContours = [];
        for (const c of contours) {
          jsonContours.push(this.emit(c));
        }
        return {
          ruledSweep: {
            contour: jsonContours,
            capped,
          },
        };
      }
      return undefined;
    }

    /** Convert strongly typed instance to tagged json */
    public handleRotationalSweep(data: RotationalSweep): any {
      const axisRay = data.cloneAxisRay();
      const curves = data.getCurves();
      const capped = data.capped;
      const sweepAngle = data.getSweep();
      return {
        rotationalSweep: {
          axis: axisRay.direction.toJSON(),
          contour: curves.dispatchToGeometryHandler(this),
          capped,
          center: axisRay.origin.toJSON(),
          sweepAngle: sweepAngle.degrees,
        },
      };
    }

    /** Convert strongly typed instance to tagged json */
    public handleBox(box: Box): any {
      const out: any = {
        box: {
          baseOrigin: box.getBaseOrigin().toJSON(),
          baseX: box.getBaseX(),
          baseY: box.getBaseY(),
          capped: box.capped,
          topOrigin: box.getTopOrigin().toJSON(),
        },
      };
      Writer.insertXYOrientation(out.box, box.getVectorX(), box.getVectorY(), true);
      if (!Geometry.isSameCoordinate(box.getTopX(), box.getBaseX()))
        out.box.topX = box.getTopX();
      if (!Geometry.isSameCoordinate(box.getTopY(), box.getBaseY()))
        out.box.topY = box.getTopY();

      return out;
    }

    private handlePolyfaceAuxData(auxData: PolyfaceAuxData, pf: IndexedPolyface): any {
      const contents: { [k: string]: any } = {};
      contents.indices = [];
      const visitor = pf.createVisitor(0);
      if (!visitor.auxData) return;

      while (visitor.moveToNextFacet()) {
        for (let i = 0; i < visitor.indexCount; i++) {
          contents.indices.push(visitor.auxData.indices[i] + 1);
        }
        contents.indices.push(0);  // facet terminator.
      }
      contents.channels = [];
      for (const inChannel of auxData.channels) {
        const outChannel: { [k: string]: any } = {};
        outChannel.dataType = inChannel.dataType;
        outChannel.name = inChannel.name;
        outChannel.inputName = inChannel.inputName;
        outChannel.data = [];
        for (const inData of inChannel.data) {
          const outData: { [k: string]: any } = {};
          outData.input = inData.input;
          outData.values = inData.values.slice(0);
          outChannel.data.push(outData);
        }

        contents.channels.push(outChannel);
      }
      return contents;
    }

    /** Convert strongly typed instance to tagged json */
    public handleIndexedPolyface(pf: IndexedPolyface): any {
      const points = [];
      const pointIndex: number[] = [];
      const normals = [];
      const params = [];
      const colors = [];
      {
        const p = Point3d.create();
        for (let i = 0; pf.data.point.getPoint3dAtCheckedPointIndex(i, p); i++)
          points.push(p.toJSON());
      }
      if (pf.data.normal) {
        const numNormal = pf.data.normal.length;
        const normal = Vector3d.create();
        for (let i = 0; i < numNormal; i++) {
          pf.data.normal.getVector3dAtCheckedVectorIndex(i, normal);
          normals.push(normal.toJSON());
        }

      }

      if (pf.data.param) {
        const uv = Point2d.create();
        for (let i = 0; pf.data.param.getPoint2dAtCheckedPointIndex(i, uv); i++)
          params.push(uv.toJSON());
      }

      if (pf.data.color) {
        for (const value of pf.data.color) colors.push(value);
      }

      const visitor = pf.createVisitor(0);
      let indexCounter = 0;

      const normalIndex = [];
      const paramIndex = [];
      const colorIndex = [];

      let n;
      while (visitor.moveToNextFacet()) {
        n = visitor.indexCount;
        // All meshes have point and point index ...
        for (let i = 0; i < n; i++) {
          // Change sign of value to be pushed based on whether or not the edge was originally visible or not
          const toPush = pf.data.edgeVisible[indexCounter + i] ? visitor.pointIndex[i] + 1 : - (visitor.clientPointIndex(i) + 1);
          pointIndex.push(toPush);
        }
        pointIndex.push(0);  // facet terminator.
        indexCounter += visitor.indexCount;

        if (visitor.normalIndex) {
          for (let i = 0; i < n; i++) normalIndex.push(1 + visitor.clientNormalIndex(i));
          normalIndex.push(0);
        }
        if (visitor.paramIndex) {
          for (let i = 0; i < n; i++) paramIndex.push(1 + visitor.clientParamIndex(i));
          paramIndex.push(0);
        }
        if (visitor.colorIndex) {
          for (let i = 0; i < n; i++) colorIndex.push(1 + visitor.clientColorIndex(i));
          colorIndex.push(0);
        }
      }
      let taggedNumericData;
      if (pf.data.taggedNumericData) {
        taggedNumericData = this.handleTaggedNumericData(pf.data.taggedNumericData);
      }
      // assemble the contents in alphabetical order.
      const contents: { [k: string]: any } = {};
      if (pf.expectedClosure !== 0)
        contents.expectedClosure = pf.expectedClosure;
      if (pf.twoSided)
        contents.twoSided = true;
      if (pf.data.auxData)
        contents.auxData = this.handlePolyfaceAuxData(pf.data.auxData, pf);

      if (pf.data.color) contents.color = colors;
      if (pf.data.colorIndex) contents.colorIndex = colorIndex;

      if (pf.data.normal) contents.normal = normals;
      if (pf.data.normalIndex) contents.normalIndex = normalIndex;

      if (pf.data.param) contents.param = params;
      if (pf.data.paramIndex) contents.paramIndex = paramIndex;

      contents.point = points;
      contents.pointIndex = pointIndex;

      if (taggedNumericData)
        contents.tags = taggedNumericData;
      return { indexedMesh: contents };
    }

    /** Convert strongly typed instance to tagged json */
    public handleBSplineCurve3d(curve: BSplineCurve3d): any {
      // ASSUME -- if the curve originated "closed" the knot and pole replication are unchanged,
      // so first and last knots can be re-assigned, and last (degree - 1) poles can be deleted.
      const wrapMode = curve.isClosable;
      if (wrapMode === BSplineWrapMode.OpenByAddingControlPoints) {
        const knots = curve.copyKnots(true);
        const poles = curve.copyPoints();
        const degree = curve.degree;
        for (let i = 0; i < degree; i++) poles.pop();
        // knots have replicated first and last.  Change the values to be periodic.
        const leftIndex = degree;
        const rightIndex = knots.length - degree - 1;
        const knotPeriod = knots[rightIndex] - knots[leftIndex];
        knots[0] = knots[rightIndex - degree] - knotPeriod;
        knots[knots.length - 1] = knots[leftIndex + degree] + knotPeriod;
        return {
          bcurve: {
            points: poles,
            knots,
            closed: true,
            order: curve.order,
          },
        };
      } else if (curve.isClosable === BSplineWrapMode.OpenByRemovingKnots) {
        // special case to re-close the case that originated as :    a a0 a0 .. a0 knot0 knot1 knot2 ... b1 b1 .. b1 b
        // with (order) copies of a0 and b1 (usually 0 and 1)
        // and a,b are related to the interior knots
        // (This is the "bezier saturated arc")
        const rawKnots = curve.copyKnots(false); // unchanged knots . . .
        const poles = curve.copyPoints();
        const degree = curve.degree;
        const leftIndex = degree - 1;
        const rightIndex = rawKnots.length - degree;
        const leftKnot = rawKnots[leftIndex];
        const rightKnot = rawKnots[rightIndex];
        const knotPeriod = rightKnot - leftKnot;
        const knots = [];
        knots.push(rawKnots[rightIndex - 1] - knotPeriod);
        knots.push(leftKnot);
        for (const k of rawKnots) knots.push(k);
        knots.push(rightKnot);
        knots.push(rawKnots[leftIndex + 1] + knotPeriod);
        return {
          bcurve: {
            points: poles,
            knots,
            closed: true,
            order: curve.order,
          },
        };
      } else {
        return {
          bcurve: {
            points: curve.copyPoints(),
            knots: curve.copyKnots(true),
            closed: false,
            order: curve.order,
          },
        };
      }
    }

    /** Convert strongly typed instance to tagged json */
    public handleInterpolationCurve3d(curve: InterpolationCurve3d): any {
      return { interpolationCurve: curve.cloneProps()};
    }
    /** Convert strongly typed instance to tagged json */
    public handleAkimaCurve3d(curve: AkimaCurve3d): any {
      return { akimaCurve: curve.cloneProps()};
    }

    /** Convert strongly typed instance to tagged json */
    public handleBezierCurve3d(curve: BezierCurve3d): any {
      const knots = [];
      const order = curve.order;
      for (let i = 0; i < order; i++) knots.push(0.0);
      for (let i = 0; i < order; i++) knots.push(1.0);
      return {
        bcurve: {
          points: curve.copyPolesAsJsonArray(),
          knots,
          closed: false,
          order: curve.order,
        },
      };
    }

    /** Convert strongly typed instance to tagged json */
    public handleBSplineCurve3dH(curve: BSplineCurve3dH): any {
      // ASSUME -- if the curve originated "closed" the knot and pole replication are unchanged,
      // so first and last knots can be re-assigned, and last (degree - 1) poles can be deleted.
      if (curve.isClosable) {
        const knots = curve.copyKnots(true);
        const poles = curve.copyPoints();
        const degree = curve.degree;
        for (let i = 0; i < degree; i++) poles.pop();
        // knots have replicated first and last.  Change the values to be periodic.
        const leftIndex = degree;
        const rightIndex = knots.length - degree - 1;
        const knotPeriod = knots[rightIndex] - knots[leftIndex];
        knots[0] = knots[rightIndex - degree] - knotPeriod;
        knots[knots.length - 1] = knots[leftIndex + degree] + knotPeriod;
        return {
          bcurve: {
            points: poles,
            knots,
            closed: true,
            order: curve.order,
          },
        };
      } else {
        return {
          bcurve: {
            points: curve.copyPoints(),
            knots: curve.copyKnots(true),
            closed: false,
            order: curve.order,
          },
        };
      }
    }

    /** Convert strongly typed instance to tagged json */
    public handleBSplineSurface3d(surface: BSplineSurface3d): any {
      // ASSUME -- if the curve originated "closed" the knot and pole replication are unchanged,
      // so first and last knots can be re-assigned, and last (degree - 1) poles can be deleted.
      const periodicU = surface.isClosable(0);
      const periodicV = surface.isClosable(1);
      if (periodicU || periodicV) {
        let numUPoles = surface.numPolesUV(0);
        let numVPoles = surface.numPolesUV(1);
        if (periodicU) numUPoles -= surface.degreeUV(0);
        if (periodicV) numVPoles -= surface.degreeUV(1);
        const xyz = Point3d.create();
        const grid = [];
        for (let j = 0; j < numVPoles; j++) {
          const stringer = [];
          for (let i = 0; i < numUPoles; i++) {
            surface.getPoint3dPole(i, j, xyz)!;
            stringer.push([xyz.x, xyz.y, xyz.z]);
          }
          grid.push(stringer);
        }
        return {
          bsurf: {
            points: grid,
            uKnots: surface.copyKnots(0, true),
            vKnots: surface.copyKnots(1, true),
            orderU: surface.orderUV(0),
            orderV: surface.orderUV(1),
            closedU: periodicU,
            closedV: periodicV,
          },
        };
      } else {
        return {
          bsurf: {
            points: surface.getPointArray(false),
            uKnots: surface.copyKnots(0, true),
            vKnots: surface.copyKnots(1, true),
            orderU: surface.orderUV(0),
            orderV: surface.orderUV(1),
          },
        };
      }
    }

    /** Convert strongly typed instance to tagged json */
    public handleBezierCurve3dH(curve: BezierCurve3dH): any {
      const knots = [];
      const order = curve.order;
      for (let i = 0; i < order; i++) knots.push(0.0);
      for (let i = 0; i < order; i++) knots.push(1.0);
      return {
        bcurve: {
          points: curve.copyPolesAsJsonArray(),
          knots,
          closed: false,
          order: curve.order,
        },
      };
    }

    /** Convert strongly typed instance to tagged json */
    public handleBSplineSurface3dH(surface: BSplineSurface3dH): any {
      const data = surface.getPointGridJSON();
      return {
        bsurf: {
          points: data.points,
          uKnots: surface.copyKnots(0, true),
          vKnots: surface.copyKnots(1, true),
          orderU: surface.orderUV(0),
          orderV: surface.orderUV(1),
        },
      };
    }

    /** Convert an array of strongly typed instances to an array of tagged json */
    public emitArray(data: object[]): any {
      const members = [];
      for (const c of data) {
        const toPush = this.emit(c);
        members.push(toPush);
      }
      return members;
    }
    /** Convert GeometryQuery data (array or single instance) to instance to tagged json */
    public emit(data: any): any {
      if (Array.isArray(data))
        return this.emitArray(data);

      if (data instanceof GeometryQuery) {
        return data.dispatchToGeometryHandler(this);
      } else if (data instanceof TaggedNumericData) {
        return this.handleTaggedNumericData(data);
      }
      return undefined;
    }
    /** One-step static method to create a writer and emit a json object */
    public static toIModelJson(data: any): any {
      const writer = new Writer();
      return writer.emit(data);
    }
  }
}
