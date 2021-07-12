/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Serialization
 */

import { BezierCurve3d } from "../bspline/BezierCurve3d";
import { BezierCurve3dH } from "../bspline/BezierCurve3dH";
import { BSplineCurve3d, BSplineCurve3dBase } from "../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { BSplineSurface3d, BSplineSurface3dH, WeightStyle } from "../bspline/BSplineSurface";
import { BSplineWrapMode, KnotVector } from "../bspline/KnotVector";
import { ClipPlane } from "../clipping/ClipPlane";
import { ConvexClipPlaneSet } from "../clipping/ConvexClipPlaneSet";
import { UnionOfConvexClipPlaneSets } from "../clipping/UnionOfConvexClipPlaneSets";
import { Arc3d } from "../curve/Arc3d";
import { CoordinateXYZ } from "../curve/CoordinateXYZ";
import { CurveChainWithDistanceIndex } from "../curve/CurveChainWithDistanceIndex";
import { BagOfCurves } from "../curve/CurveCollection";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { GeometryQuery } from "../curve/GeometryQuery";
import { LineSegment3d } from "../curve/LineSegment3d";
import { LineString3d } from "../curve/LineString3d";
import { Loop } from "../curve/Loop";
import { ParityRegion } from "../curve/ParityRegion";
import { Path } from "../curve/Path";
import { PointString3d } from "../curve/PointString3d";
import { UnionRegion } from "../curve/UnionRegion";
import { AxisOrder, Geometry } from "../Geometry";
import { Angle } from "../geometry3d/Angle";
import { AngleSweep } from "../geometry3d/AngleSweep";
import { GrowableFloat64Array } from "../geometry3d/GrowableFloat64Array";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point2d, Vector2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range1d, Range2d, Range3d } from "../geometry3d/Range";
import { Ray3d } from "../geometry3d/Ray3d";
import { Segment1d } from "../geometry3d/Segment1d";
import { Transform } from "../geometry3d/Transform";
import { XYAndZ } from "../geometry3d/XYZProps";
import { Map4d } from "../geometry4d/Map4d";
import { Matrix4d } from "../geometry4d/Matrix4d";
import { Point4d } from "../geometry4d/Point4d";
import { IndexedPolyface } from "../polyface/Polyface";
import { Box } from "../solid/Box";
import { Cone } from "../solid/Cone";
import { LinearSweep } from "../solid/LinearSweep";
import { RotationalSweep } from "../solid/RotationalSweep";
import { RuledSweep } from "../solid/RuledSweep";
import { SolidPrimitive } from "../solid/SolidPrimitive";
import { Sphere } from "../solid/Sphere";
import { TorusPipe } from "../solid/TorusPipe";
import { TransitionSpiral3d } from "../curve/spiral/TransitionSpiral3d";
import { IntegratedSpiral3d } from "../curve/spiral/IntegratedSpiral3d";
import { DirectSpiral3d } from "../curve/spiral/DirectSpiral3d";
import { PolyfaceData } from "../polyface/PolyfaceData";
import { AuxChannel, AuxChannelData, AuxChannelDataType, PolyfaceAuxData } from "../polyface/AuxData";

/* eslint-disable no-console */
/**
 * Function to be called to obtain function value at (i,n), for
 * * n fixed over many calls
 *   * n may be assumed 1 or greater (so fraction = i/n is safe)
 * * i varies from 0 to n
 * @alpha
 */
export type SteppedIndexFunction = (i: number, n: number) => number;
/**
 * Static methods to create functions of type SteppedIndexFunction
 * * Convention: constant value is optional last argument, with default value 0
 * @alpha
 */
export class SteppedIndexFunctionFactory {
  /** Returns a callable function that returns a constant value. */
  public static createConstant(value: number = 0): SteppedIndexFunction {
    return (_i: number, _n: number) => value;
  }
  /** Return a function that steps linearly
   * *  f(i,n) = y0 + (i/n) * a
   */
  public static createLinear(a: number, f0: number = 0): SteppedIndexFunction {
    return (i: number, n: number) => (f0 + a * (i / n));
  }
  /** Return a function that steps with cosine of angles in sweep
   * *  f(i,n) = y0 + amplitude * cos(i/n)
   */
  public static createCosine(amplitude: number, sweep: AngleSweep = AngleSweep.create360(), f0: number = 0): SteppedIndexFunction {
    return (i: number, n: number) => (f0 + amplitude * Math.cos(sweep.fractionToRadians(i / n)));
  }
  /** Return a function that steps with cosine of angles in sweep.
   * *  f(i,n) = y0 + amplitude * sin(i/n)
   */
  public static createSine(amplitude: number, sweep: AngleSweep = AngleSweep.create360(), f0: number = 0): SteppedIndexFunction {
    return (i: number, n: number) => (f0 + amplitude * Math.sin(sweep.fractionToRadians(i / n)));
  }
}
/**
 * `Sample` has static methods to create a variety of geometry samples useful in testing.
 * @alpha
 */
export class Sample {
  /** Array with assorted Point2d samples */
  public static readonly point2d: Point2d[] = [
    Point2d.create(0, 0),
    Point2d.create(1, 0),
    Point2d.create(0, 1),
    Point2d.create(2, 3)];

  /** Array with assorted Point3d samples */
  public static readonly point3d: Point3d[] = [
    Point3d.create(0, 0, 0),
    Point3d.create(1, 0, 0),
    Point3d.create(0, 1, 0),
    Point3d.create(0, 1, 0),
    Point3d.create(0, 0, 1),
    Point3d.create(2, 3, 0),
    Point3d.create(0, 2, 5),
    Point3d.create(-3, 0, 5),
    Point3d.create(4, 3, -2)];

  /** Return an array of Point3d, with x,y,z all stepping through a range of values.
   * x varies fastest, then y then z
   */
  public static createPoint3dLattice(low: number, step: number, high: number): Point3d[] {
    const points = [];
    for (let z = low; z <= high; z += step)
      for (let y = low; y <= high; y += step)
        for (let x = low; x <= high; x += step)
          points.push(Point3d.create(x, y, z));
    return points;
  }

  /** Return an array of Point2d, with x,y all stepping through a range of values.
   * x varies fastest, then y
   */
  public static createPoint2dLattice(low: number, step: number, high: number): Point2d[] {
    const points = [];
    for (let y = low; y <= high; y += step)
      for (let x = low; x <= high; x += step)
        points.push(Point2d.create(x, y));
    return points;
  }
  /** Array with assorted Point4d samples */
  public static readonly point4d: Point4d[] = [
    Point4d.create(0, 0, 0, 1),
    Point4d.create(1, 0, 0, 1),
    Point4d.create(0, 1, 0, 1),
    Point4d.create(0, 1, 0, 1),
    Point4d.create(0, 0, 1, 1),
    Point4d.create(2, 3, 0, 1),
    Point4d.create(0, 2, 5, 1),
    Point4d.create(-3, 0, 5, 1),
    Point4d.create(-3, 0, 5, 0.3),
    Point4d.create(-3, 0, 5, -0.2),
    Point4d.create(4, 3, -2, 1)];
  /** Array with assorted nonzero vector samples. */
  public static createNonZeroVectors(): Vector3d[] {
    return [
      Vector3d.create(1, 0, 0),
      Vector3d.create(0, 1, 0),
      Vector3d.create(0, 0, 1),
      Vector3d.create(-1, 0, 0),
      Vector3d.create(0, -1, 0),
      Vector3d.create(0, 0, -1),
      Vector3d.createPolar(1.0, Angle.createDegrees(20)),
      Vector3d.createSpherical(1.0, Angle.createDegrees(20), Angle.createDegrees(10)),
      Vector3d.createPolar(2.0, Angle.createDegrees(20)),
      Vector3d.createSpherical(2.0, Angle.createDegrees(20), Angle.createDegrees(10)),
      Vector3d.create(2, 3, 0)];
  }
  /** Array with assorted nonzero Vector2d samples */
  public static readonly vector2d: Vector2d[] = [
    Vector2d.create(1, 0),
    Vector2d.create(0, 1),
    Vector2d.create(0, 0),
    Vector2d.create(-1, 0),
    Vector2d.create(0, -1),
    Vector2d.create(0, 0),
    Vector2d.createPolar(1.0, Angle.createDegrees(20)),
    Vector2d.createPolar(2.0, Angle.createDegrees(20)),
    Vector2d.create(2, 3)];
  /** Return an array with assorted Range3d samples */
  public static createRange3ds(): Range3d[] {
    return [
      Range3d.createXYZXYZ(0, 0, 0, 1, 1, 1),
      Range3d.createXYZ(1, 2, 3),
      Range3d.createXYZXYZ(-2, -3, 1, 200, 301, 8)];
  }
  /** Create 5 points of a (axis aligned) rectangle with corners (x0,y0) and (x1,y1) */
  public static createRectangleXY(x0: number, y0: number, ax: number, ay: number, z: number = 0): Point3d[] {
    return [
      Point3d.create(x0, y0, z),
      Point3d.create(x0 + ax, y0, z),
      Point3d.create(x0 + ax, y0 + ay, z),
      Point3d.create(x0, y0 + ay, z),
      Point3d.create(x0, y0, z),
    ];
  }
  /** Access the last point in the array. push another shifted by dx,dy,dz.
   * * No push if all are 0.
   * * If array is empty, push a leading 000
   */
  public static pushMove(data: Point3d[], dx: number, dy: number, dz: number = 0.0) {
    if (data.length === 0)
      data.push(Point3d.create(0, 0, 0));
    const back = data[data.length - 1];
    if (dx !== 0 || dy !== 0 || dz !== 0)
      data.push(Point3d.create(back.x + dx, back.y + dy, back.z + dz));
  }
  /** Return an array with numPoints on the unit circle (counting closure) */
  public static createUnitCircle(numPoints: number): Point3d[] {
    const points: Point3d[] = [];
    const dTheta = Geometry.safeDivideFraction(Math.PI * 2, numPoints - 1, 0.0);
    for (let i = 0; i + 1 < numPoints; i++) {
      const theta = i * dTheta;
      points.push(Point3d.create(Math.cos(theta), Math.sin(theta), 0.0));
    }
    points.push(points[0].clone());
    return points;
  }
  /** Create points for an L shaped polygon
   * * lower left at x0,y0.
   * * ax,ay are larger side lengths (lower left to corners along x and y directions)
   * * bx,by are smaller side lengths (inner corner to points along x and y directions)
   */
  public static createLShapedPolygon(x0: number, y0: number, ax: number, ay: number, bx: number, by: number, z: number = 0): Point3d[] {
    return [
      Point3d.create(x0, y0, z),
      Point3d.create(x0 + ax, y0, z),
      Point3d.create(x0 + ax, y0 + by),
      Point3d.create(x0 + bx, y0 + by),
      Point3d.create(x0 + bx, y0 + ay, z),
      Point3d.create(x0, y0 + ay, z),
      Point3d.create(x0, y0, z),
    ];
  }
  /** Create assorted clip planes. */
  public static createClipPlanes(): ClipPlane[] {
    const plane0 = ClipPlane.createNormalAndDistance(Vector3d.create(1, 0, 0), 2.0)!;
    const plane1 = plane0.cloneNegated();
    const plane2 = plane1.clone();
    plane2.setFlags(true, true);
    return [
      plane0, plane1, plane2,
      ClipPlane.createNormalAndDistance(Vector3d.create(3, 4, 0), 2.0)!,
      ClipPlane.createEdgeXY(Point3d.create(1, 0, 0), Point3d.create(24, 32, 0))!];
  }

  /**
   * * A first-quadrant unit square
   * * Two squares -- first and fourth quadrant unit squares
   * * Three squares -- first, second and fourth quadrant unit squares
   */
  public static createClipPlaneSets(): UnionOfConvexClipPlaneSets[] {
    const result = [];
    const quadrant1 = ConvexClipPlaneSet.createXYBox(0, 0, 1, 1);
    result.push(UnionOfConvexClipPlaneSets.createConvexSets([quadrant1.clone()]));
    const quadrant2 = ConvexClipPlaneSet.createXYBox(-1, 0, 0, 1);
    const quadrant4 = ConvexClipPlaneSet.createXYBox(0, -1, 1, 0);

    result.push(UnionOfConvexClipPlaneSets.createConvexSets([
      quadrant1.clone(),
      quadrant4.clone()]));
    result.push(UnionOfConvexClipPlaneSets.createConvexSets([
      quadrant1.clone(),
      quadrant2.clone(),
      quadrant4.clone()]));
    return result;
  }
  /** Create (unweighted) bspline curves.
   * order varies from 2 to 5
   */
  public static createBsplineCurves(includeMultipleKnots: boolean = false): BSplineCurve3d[] {
    const result: BSplineCurve3d[] = [];
    const yScale = 0.1;
    for (const order of [2, 3, 4, 5]) {
      const points = [];
      for (const x of [0, 1, 2, 3, 4, 5, 7]) {
        points.push(Point3d.create(x, yScale * (1 + x * x), 0.0));
      }
      const curve = BSplineCurve3d.createUniformKnots(points, order) as BSplineCurve3d;
      result.push(curve);
    }
    if (includeMultipleKnots) {
      const interiorKnotCandidates = [1, 2, 2, 3, 4, 5, 5, 6, 7, 7, 8];
      for (const order of [3, 4]) {
        const numPoints = 8;
        const points = [];
        for (let i = 0; i < numPoints; i++)
          points.push(Point3d.create(i, i * i, 0));
        const knots = [];
        for (let i = 0; i < order - 1; i++) knots.push(0);
        const numInteriorNeeded = numPoints - order;
        for (let i = 0; i < numInteriorNeeded; i++)knots.push(interiorKnotCandidates[i]);
        const lastKnot = knots[knots.length - 1] + 1;
        for (let i = 0; i < order - 1; i++) knots.push(lastKnot);
        const curve = BSplineCurve3d.create(points, knots, order);
        if (curve)
          result.push(curve);
      }
    }
    return result;
  }
  /** Create weighted bspline curves.
   * order varies from 2 to 5
   */
  public static createBspline3dHCurves(): BSplineCurve3dH[] {
    const result: BSplineCurve3dH[] = [];
    const yScale = 0.1;
    for (const weightVariation of [0, 0.125]) {
      for (const order of [2, 3, 4, 5]) {
        const points = [];
        for (const x of [0, 1, 2, 3, 4, 5, 7]) {
          points.push(Point4d.create(x, yScale * (1 + x * x), 0.0, 1.0 + weightVariation * Math.sin(x * Math.PI * 0.25)));
        }
        const curve = BSplineCurve3dH.createUniformKnots(points, order) as BSplineCurve3dH;
        result.push(curve);
      }
    }
    return result;
  }

  /** Create weighted bsplines for circular arcs.
   */
  public static createBspline3dHArcs(): BSplineCurve3dH[] {
    const result: BSplineCurve3dH[] = [];
    const halfRadians = Angle.degreesToRadians(60.0);
    const c = Math.cos(halfRadians);
    const s = Math.sin(halfRadians);
    // const sec = 1.0 / c;
    // const t = s / c;
    const points = [
      Point4d.create(1, 0, 0, 1),
      Point4d.create(c, s, 0, c),
      Point4d.create(-c, s, 0, 1),
      Point4d.create(-1, 0, 0, c),
      Point4d.create(-c, -s, 0, 1),
      Point4d.create(c, -s, 0, c),
      Point4d.create(1, 0, 0, 1)];
    const knots = [0, 0, 1, 1, 2, 2, 3, 3];

    const curve = BSplineCurve3dH.create(points, knots, 3) as BSplineCurve3dH;
    result.push(curve);
    return result;
  }

  /** Return array   [x,y,z,w] bspline control points for an arc in 90 degree bspline spans.
   * @param points array of [x,y,z,w]
   * @param center center of arc
   * @param axes matrix with 0 and 90 degree axes
   * @param radius0 radius multiplier for x direction.
   * @param radius90 radius multiplier for y direction.
   * @param applyWeightsToXYZ
   */
  public static createBsplineArc90SectionToXYZWArrays(
    center: Point3d,
    axes: Matrix3d,
    radius0: number,
    radius90: number,
    applyWeightsToXYZ: boolean): number[][] {
    const a = Math.sqrt(0.5);
    const xyz = Point3d.create();
    Matrix3d.xyzPlusMatrixTimesCoordinates(center, axes, radius0, 0.0, 0, xyz);
    const controlPoints = [];
    controlPoints.push([xyz.x, xyz.y, xyz.z, 1.0]);
    const cornerTrig = [1, 1, -1, -1, 1];
    const axisTrig = [1, 0, -1, 0, 1];
    for (let i = 0; i < 4; i++) {
      Matrix3d.xyzPlusMatrixTimesCoordinates(center, axes, radius0 * cornerTrig[i + 1], radius90 * cornerTrig[i], 0, xyz);
      controlPoints.push([xyz.x, xyz.y, xyz.z, a]);
      Matrix3d.xyzPlusMatrixTimesCoordinates(center, axes, radius0 * axisTrig[i + 1], radius90 * axisTrig[i], 0, xyz);
      controlPoints.push([xyz.x, xyz.y, xyz.z, 1.0]);
    }
    if (applyWeightsToXYZ) {
      for (const xyzw of controlPoints) {
        const b = xyzw[3];
        xyzw[0] *= b;
        xyzw[1] *= b;
        xyzw[2] *= b;
      }
    }
    return controlPoints;
  }

  /**
   * Create both unweighted and weighted bspline curves.
   * (This is the combined results from createBsplineCurves and createBspline3dHCurves)
   */
  public static createMixedBsplineCurves(): BSplineCurve3dBase[] {
    const arrayA = Sample.createBsplineCurves();
    const arrayB = Sample.createBspline3dHCurves();
    const result = [];
    for (const a of arrayA) result.push(a);
    for (const b of arrayB) result.push(b);
    return result;
  }

  /** create a plane from origin and normal coordinates -- default to 001 normal if needed. */
  public static createPlane(x: number, y: number, z: number, u: number, v: number, w: number): Plane3dByOriginAndUnitNormal {
    const point = Point3d.create(x, y, z);
    const vector = Vector3d.create(u, v, w).normalize();
    if (vector) {
      const plane = Plane3dByOriginAndUnitNormal.create(point, vector);
      if (plane)
        return plane;
    }
    return Sample.createPlane(x, y, z, u, v, 1);
  }

  /** Create ray from (x,y,z) and direction components.   (Normalize the direction) */
  public static createRay(x: number, y: number, z: number, u: number, v: number, w: number): Ray3d {
    return Ray3d.create(
      Point3d.create(x, y, z),
      Vector3d.create(u, v, w).normalize() as Vector3d);
  }
  /** Assorted Plane3dBYOriginAndUnitNormal */
  public static readonly plane3dByOriginAndUnitNormal: Plane3dByOriginAndUnitNormal[] = [
    Plane3dByOriginAndUnitNormal.createXYPlane(),
    Plane3dByOriginAndUnitNormal.createYZPlane(),
    Plane3dByOriginAndUnitNormal.createZXPlane(),
    Sample.createPlane(0, 0, 0, 3, 0, 1),
    Sample.createPlane(1, 2, 3, 2, 4, -1)];

  /** Assorted Ray3d, not all unit direction vectors. */
  public static readonly ray3d: Ray3d[] = [
    Sample.createRay(0, 0, 0, 1, 0, 0),
    Sample.createRay(0, 0, 0, 0, 1, 0),
    Sample.createRay(0, 0, 0, 0, 0, 1),
    Sample.createRay(0, 0, 0, 1, 2, 0),
    Sample.createRay(1, 2, 3, 4, 2, -1)];
  /** Assorted angles.  All principal directions, some others included. */
  public static readonly angle: Angle[] = [
    Angle.createDegrees(0),
    Angle.createDegrees(90),
    Angle.createDegrees(180),
    Angle.createDegrees(-90),
    Angle.createDegrees(30),
    Angle.createDegrees(-105)];
  /** Assorted angle sweeps */
  public static readonly angleSweep: AngleSweep[] = [
    AngleSweep.createStartEndDegrees(0, 90),
    AngleSweep.createStartEndDegrees(0, 180),
    AngleSweep.createStartEndDegrees(-90, 0),
    AngleSweep.createStartEndDegrees(0, -90),
    AngleSweep.createStartEndDegrees(0, 30),
    AngleSweep.createStartEndDegrees(45, 110)];

  /** assorted line segments */
  public static readonly lineSegment3d: LineSegment3d[] = [
    LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)),
    LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 1, 0)),
    LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 0, 1)),
    LineSegment3d.create(Point3d.create(1, 2, 3), Point3d.create(-2, -3, 0.5))];
  /** Assorted lines strings */
  public static createLineStrings(): LineString3d[] {
    return [
      LineString3d.createPoints(
        [
          Point3d.create(0, 0, 0),
          Point3d.create(1, 0, 0)]),
      LineString3d.createPoints(
        [
          Point3d.create(0, 0, 0),
          Point3d.create(1, 0, 0),
          Point3d.create(1, 1, 0)]),
      LineString3d.createPoints(
        [
          Point3d.create(0, 0, 0),
          Point3d.create(1, 0, 0),
          Point3d.create(1, 1, 0),
          Point3d.create(2, 2, 0)])];
  }
  /** Assorted Range1d:   single point, null, simple forward, simple reverse */
  public static readonly range1d: Range1d[] = [
    Range1d.createX(1),
    Range1d.createNull(),
    Range1d.createXX(1, 2),
    Range1d.createXX(2, 1)];
  /** Assorted range2d: single point, null, 2 point with various creation orders. */
  public static readonly range2d: Range2d[] = [
    Range2d.createXY(1, 2),
    Range2d.createNull(),
    Range2d.createXYXY(1, 2, 0, 3),
    Range2d.createXYXY(1, 2, 3, 4)];
  /** Assorted range2d: single point, null, 2 point with various creation orders. */
  public static readonly range3d: Range3d[] = [
    Range3d.createXYZ(1, 2, 3),
    Range3d.createNull(),
    Range3d.createXYZXYZ(1, 2, 0, 3, 4, 7),
    Range3d.createXYZXYZ(1, 2, 3, -2, -4, -1)];
  /** Assorted Matrix3d:
   * * identity
   * * rotation around x
   * * rotation around general vector
   * * uniform scale
   * * nonuniform scale (including negative scales!)
   */
  public static createMatrix3dArray(): Matrix3d[] {
    return [
      Matrix3d.createIdentity(),
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, 0, 0), Angle.createDegrees(10)) as Matrix3d,
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, -2, 5), Angle.createDegrees(-6.0)) as Matrix3d,

      Matrix3d.createUniformScale(2.0),
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, 2, 3), Angle.createDegrees(49.0)) as Matrix3d,
      Matrix3d.createScale(1, 1, -1),
      Matrix3d.createScale(2, 3, 4)];
  }
  /** Assorted invertible transforms. */
  public static createInvertibleTransforms(): Transform[] {
    return [
      Transform.createIdentity(),
      Transform.createTranslationXYZ(1, 2, 0),
      Transform.createTranslationXYZ(1, 2, 3),
      Transform.createFixedPointAndMatrix(
        Point3d.create(4, 1, -2),
        Matrix3d.createUniformScale(2.0)),
      Transform.createFixedPointAndMatrix(
        Point3d.create(4, 1, -2),
        Matrix3d.createRotationAroundVector(
          Vector3d.create(1, 2, 3), Angle.createRadians(10)) as Matrix3d)];
  }

  /** Return an array of Matrix3d with various skew and scale.  This includes at least:
   * * identity
   * * 3 distinct diagonals.
   * * The distinct diagonal base with smaller value added to
   *    other 6 spots in succession.
   * * the distinct diagonals with all others also smaller non-zeros.
   */
  public static createScaleSkewMatrix3d(): Matrix3d[] {
    return [
      Matrix3d.createRowValues(
        1, 0, 0,
        0, 1, 0,
        0, 0, 1),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 2, 0,
        0, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 2,
        0, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        1, 6, 0,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 1,
        0, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 0,
        1, 0, 7),
      Matrix3d.createRowValues(
        5, 0, 0,
        0, 6, 0,
        0, 1, 7),
      Matrix3d.createRowValues(
        5, 2, 3,
        2, 6, 1,
        -1, 2, 7)];
  }

  /** Return an array of singular Matrix3d.  This includes at least:
   * * all zeros
   * * one nonzero column
   * * two independent columns, third is zero
   * * two independent columns, third is sum of those
   * * two independent columns, third is copy of one
   */
  public static createSingularMatrix3d(): Matrix3d[] {
    const vectorU = Vector3d.create(2, 3, 6);
    const vectorV = Vector3d.create(-1, 5, 2);
    const vectorUPlusV = vectorU.plus(vectorV);
    const vector0 = Vector3d.createZero();
    return [
      Matrix3d.createZero(),
      // one nonzero column
      Matrix3d.createColumns(vectorU, vector0, vector0),
      Matrix3d.createColumns(vector0, vectorU, vector0),
      Matrix3d.createColumns(vector0, vector0, vector0),
      // two independent nonzero columns with zero
      Matrix3d.createColumns(vectorU, vectorV, vector0),
      Matrix3d.createColumns(vector0, vectorU, vectorV),
      Matrix3d.createColumns(vectorV, vector0, vector0),
      // third column dependent
      Matrix3d.createColumns(vectorU, vectorV, vectorUPlusV),
      Matrix3d.createColumns(vectorU, vectorUPlusV, vectorV),
      Matrix3d.createColumns(vectorUPlusV, vectorV, vectorU),
      // two independent with duplicate
      Matrix3d.createColumns(vectorU, vectorV, vectorU),
      Matrix3d.createColumns(vectorU, vectorU, vectorV),
      Matrix3d.createColumns(vectorV, vectorV, vectorU)];
  }

  /**
   * * Return an array of rigid transforms.  This includes (at least)
   *   * Identity
   *   * translation with identity matrix
   *   * rotation around origin and arbitrary vector
   *   * rotation around space point and arbitrary vector
   * * use given refDistance is crude distance of translation and distance to fixed point.
   */
  public static createRigidTransforms(distanceScale: number = 4.0): Transform[] {
    const distanceScale3 = distanceScale / 3.0;
    const distanceScale4 = distanceScale / 4.0;
    return [
      Transform.createIdentity(),
      Transform.createTranslationXYZ(distanceScale3 * 1, distanceScale3 * 2, distanceScale3 * 3),
      Transform.createFixedPointAndMatrix(
        Point3d.create(0, 0, 0),
        Matrix3d.createRotationAroundVector(
          Vector3d.unitY(), Angle.createDegrees(10)) as Matrix3d),
      Transform.createFixedPointAndMatrix(
        Point3d.create(distanceScale4 * 4, distanceScale4 * 1, -distanceScale4 * 2),
        Matrix3d.createRotationAroundVector(
          Vector3d.create(1, 2, 3), Angle.createDegrees(10)) as Matrix3d),
      Transform.createFixedPointAndMatrix(
        Point3d.create(distanceScale4 * 4, distanceScale4 * 1, -distanceScale4 * 2),
        Matrix3d.createRotationAroundVector(
          Vector3d.create(-2, 1, 4), Angle.createDegrees(35)) as Matrix3d)];
  }
  /**
   * Return a single rigid transform with all terms nonzero.
   */
  public static createMessyRigidTransform(fixedPoint?: Point3d): Transform {
    return Transform.createFixedPointAndMatrix(
      fixedPoint ? fixedPoint : Point3d.create(1, 2, 3),
      Matrix3d.createRotationAroundVector(Vector3d.create(0.3, -0.2, 1.2), Angle.createDegrees(15.7))!);
  }
  /** Return various rigid matrices:
   * * identity
   * * small rotations around x, y, z
   * * small rotation around (1,2,3)
   */
  public static createRigidAxes(): Matrix3d[] {
    return [
      Matrix3d.createIdentity(),
      Matrix3d.createRotationAroundVector(
        Vector3d.unitX(), Angle.createDegrees(10)) as Matrix3d,
      Matrix3d.createRotationAroundVector(
        Vector3d.unitY(), Angle.createDegrees(10)) as Matrix3d,
      Matrix3d.createRotationAroundVector(
        Vector3d.unitZ(), Angle.createDegrees(10)) as Matrix3d,
      Matrix3d.createRotationAroundVector(
        Vector3d.create(1, 2, 3), Angle.createDegrees(10)) as Matrix3d,
    ];
  }

  /**
   * Return various Matrix4d
   * * Simple promotion of each Sample.createInvertibleTransforms ()
   * * optional nasty [1,2,3,4...15] row order
   * @param includeIrregular if true, include [1,2,..15] row major
   */ // promote each transform[] to a Matrix4d.
  public static createMatrix4ds(includeIrregular: boolean = false): Matrix4d[] {
    const result = [];
    let transform;
    for (transform of Sample.createInvertibleTransforms())
      result.push(Matrix4d.createTransform(transform));
    if (includeIrregular) {
      result.push(Matrix4d.createRowValues(
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16));
    }
    return result;
  }
  /**
   * Create full Map4d for each `Sample.createInvertibleTransforms ()`
   */
  public static createMap4ds(): Map4d[] {
    const result = [];
    let transform;
    for (transform of Sample.createInvertibleTransforms()) {
      const inverse = transform.inverse();
      if (inverse) {
        const map = Map4d.createTransform(transform, inverse);
        if (map)
          result.push(map);
      }
    }
    return result;
  }
  /** Assorted simple `Path` objects. */
  public static createSimplePaths(withGaps: boolean = false): Path[] {
    const point0 = Point3d.create(0, 0, 0);
    const point1 = Point3d.create(10, 0, 0);

    const p1 = [point1, Point3d.create(0, 10, 0), Point3d.create(6, 10, 0), Point3d.create(6, 10, 0), Point3d.create(0, 10, 0)];
    const segment1 = LineSegment3d.create(point0, point1);
    const vectorU = Vector3d.unitX(3);
    const vectorV = Vector3d.unitY(3);
    const arc2 = Arc3d.create(point1.minus(vectorU), vectorU, vectorV, AngleSweep.createStartEndDegrees(0, 90));
    const simplePaths = [
      Path.create(segment1),
      Path.create(segment1, arc2),
      Path.create(
        LineSegment3d.create(point0, point1),
        LineString3d.create(p1)),
      Sample.createCappedArcPath(4, 0, 180),
    ];
    if (withGaps)
      simplePaths.push(
        Path.create(
          LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(10, 0, 0)),
          LineSegment3d.create(Point3d.create(10, 10, 0), Point3d.create(5, 0, 0))));

    return simplePaths;
  }
  /** Assorted `Path` with lines and arcs.
   * Specifically useful for offset tests.
   */
  public static createLineArcPaths(): Path[] {
    const paths = [];
    const x1 = 10.0;
    const y2 = 5.0;
    const y3 = 10.0;
    for (const y0 of [0, -1, 1]) {
      for (const x2 of [15, 11, 20, 9, 7]) {

        const point0 = Point3d.create(0, y0, 0);
        const point1 = Point3d.create(x1, 0, 0);
        const point2 = Point3d.create(x2, y2, 0);
        const point3 = Point3d.create(x1, y3, 0);
        const point4 = Point3d.create(0, y3 + y0, 0);
        const path0 = Path.create();
        path0.tryAddChild(LineString3d.create(point0, point1, point2, point3, point4));
        paths.push(path0);
        const path1 = Path.create();
        path1.tryAddChild(LineSegment3d.create(point0, point1));
        path1.tryAddChild(Arc3d.createCircularStartMiddleEnd(point1, Point3d.create(x2, y2, 0), point3));
        path1.tryAddChild(LineSegment3d.create(point3, point4));
        paths.push(path1);
      }
    }
    return paths;
  }

  /** Assorted `PointString3d` objects. */
  public static createSimplePointStrings(): PointString3d[] {
    const p1 = [[Point3d.create(0, 10, 0)], [Point3d.create(6, 10, 0)], [Point3d.create(6, 10, 0), [Point3d.create(6, 10, 0)]]];
    const simplePaths = [
      PointString3d.create(Point3d.create(1, 2, 0)),
      PointString3d.create(Point3d.create(0, 0, 0), Point3d.create(10, 0, 0)),
      PointString3d.create(
        Point3d.create(10, 0, 0),
        Point3d.create(10, 5, 0)),
      PointString3d.create(p1)];

    return simplePaths;
  }
  /** Assorted `Loop` objects */
  public static createSimpleLoops(): Loop[] {
    const point0 = Point3d.create(0, 0, 0);
    const point1 = Point3d.create(10, 0, 0);
    const point2 = Point3d.create(10, 5, 0);
    const point3 = Point3d.create(0, 5, 0);
    const result = [
      // rectangle with single linestring
      Loop.create(LineString3d.create(point0, point1, point2, point3, point0)),
      // unit circle
      Loop.create(Arc3d.createUnitCircle()),
      // rectangle, but with individual line segments
      Loop.create(
        LineSegment3d.create(point0, point1),
        LineSegment3d.create(point1, point2),
        LineSegment3d.create(point2, point3),
        LineSegment3d.create(point3, point0),
      ),
      // Semicircle
      Sample.createCappedArcLoop(4, -90, 90),
    ];
    return result;
  }
  /**
   * Create a square wave along x direction
   * @param dx0 distance along x axis at y=0
   * @param dy vertical rise
   * @param dx1 distance along x axis at y=dy
   * @param numPhase number of phases of the jump.
   * @param dyReturn y value for return to origin.  If 0, the wave ends at y=0 after then final "down" with one extra horizontal dx0
   *     If nonzero, rise to that y value, return to x=0, and return down to origin.
   *
   */
  public static createSquareWave(origin: Point3d, dx0: number, dy: number, dx1: number, numPhase: number, dyReturn: number): Point3d[] {
    const result = [origin.clone()];
    for (let i = 0; i < numPhase; i++) {
      this.pushMove(result, dx0, 0);
      this.pushMove(result, 0, dy);
      this.pushMove(result, dx1, 0);
      this.pushMove(result, 0, -dy);
    }
    this.pushMove(result, dx0, 0);
    if (dyReturn !== 0.0) {
      this.pushMove(result, 0, dyReturn);
      result.push(Point3d.create(origin.x, origin.y + dyReturn));
      result.push(result[0].clone());
    }
    return result;
  }

  /**
   * Create multiple interpolated points between two points
   * @param point0 start point (at fraction0)
   * @param point1 end point (at fraction1)
   * @param numPoints total number of points.  This is force to at least 2.
   * @param result optional existing array to receive points.
   * @param index0 optional index of first point.  Default is 0.
   * @param index1 optional index of final point.  Default is numPoints
   */
  public static createInterpolatedPoints(point0: Point3d, point1: Point3d, numPoints: number, result?: Point3d[], index0?: number, index1?: number): Point3d[] {
    if (numPoints < 2)
      numPoints = 2;
    if (result === undefined)
      result = [];
    if (index0 === undefined)
      index0 = 0;
    if (index1 === undefined)
      index1 = numPoints;

    for (let i = index0; i <= index1; i++) {
      result.push(point0.interpolate(i / numPoints, point1));
    }
    return result;
  }

  /**
   * Append numPhase teeth.  Each tooth starts with dxLow dwell at initial y, then sloped rise, then dwell at top, then sloped fall
   * * If no points are present, start with 000.  (this happens in pushMove) Otherwise start from final point.
   * * return points array reference.
   * @param points point array to receive points
   * @param dxLow starting step along x direction
   * @param riseX width of rising and falling parts
   * @param riseY height of rise
   * @param dxHigh width at top
   * @param numPhase number of phases.
   */
  public static appendSawTooth(points: Point3d[], dxLow: number, riseX: number, riseY: number, dxHigh: number, numPhase: number): Point3d[] {
    for (let i = 0; i < numPhase; i++) {
      this.pushMove(points, dxLow, 0, 0);
      this.pushMove(points, riseX, riseY, 0);
      this.pushMove(points, dxHigh, 0, 0);
      this.pushMove(points, riseX, -riseY, 0);
    }
    return points;
  }
  /** append sawtooth with x distances successively scaled by xFactor */
  public static appendVariableSawTooth(points: Point3d[], dxLow: number, riseX: number, riseY: number, dxHigh: number, numPhase: number, xFactor: number): Point3d[] {
    let factor = 1.0;
    for (let i = 0; i < numPhase; i++) {
      this.appendSawTooth(points, factor * dxLow, factor * riseX, riseY, factor * dxHigh, 1);
      factor *= xFactor;
    }
    return points;
  }
  /**
   * Create a pair of sawtooth patterns, one (nominally) outbound and up, the other inbound and down.
   * * return phase count adjusted to end at start x
   * * enter return dx values as lengths -- sign will be negated in construction.
   * @param origin start of entire path.
   * @param dxLow low outbound dwell
   * @param riseX x part of outbound rise and fall
   * @param riseY y part of outbound rise and fall
   * @param dxHigh high outbound dwell
   * @param numPhaseOutbound number of phases outbound.  Final phase followed by dxLow dwell.
   * @param dyFinal rise after final dwell.
   * @param dxLowReturn dwell at return high
   * @param riseXReturn rise x part of return
   * @param riseYReturn rise y part of return
   * @param dxHighReturn  dwell at return high
   */
  public static createBidirectionalSawtooth(origin: Point3d, dxLow: number, riseX: number, riseY: number, dxHigh: number, numPhaseOutbound: number,
    dyFinal: number,
    dxLowReturn: number, riseXReturn: number, riseYReturn: number, dxHighReturn: number): Point3d[] {
    const data = [origin.clone()];
    const x0 = data[0].x;
    this.appendSawTooth(data, dxLow, riseX, riseY, dxHigh, numPhaseOutbound);
    this.pushMove(data, dxLow, 0, 0);
    this.pushMove(data, 0, dyFinal);
    const x1 = data[data.length - 1].x;
    const returnPhase = Math.abs(dxLowReturn + 2 * riseXReturn + dxHighReturn);
    const totalDX = Math.abs(x1 - x0);
    const numReturnPhase = Math.floor(Math.abs(totalDX / returnPhase));
    this.appendSawTooth(data, -dxLowReturn, -riseXReturn, riseYReturn, -dxHighReturn, numReturnPhase);
    const x2 = data[data.length - 1].x;
    this.pushMove(data, x0 - x2, 0, 0);
    data.push(data[0].clone());
    return data;
  }
  /** append to a linestring, taking steps along given vector directions
   * If the linestring is empty, a 000 point is added.
   * @param linestring LineString3d to receive points.
   * @param numPhase number of phases of the sawtooth
   * @param vectors any number of vector steps.
   */
  public static appendPhases(linestring: LineString3d, numPhase: number, ...vectors: Vector3d[]): void {
    const tailPoint = linestring.endPoint(); // and this defaults to 000 . ..
    if (linestring.numPoints() === 0)
      linestring.addPoint(tailPoint);

    for (let i = 0; i < numPhase; i++) {
      for (const v of vectors) {
        tailPoint.addInPlace(v);
        linestring.addPoint(tailPoint);
      }
    }
  }

  /** Assorted regions with arc boundaries
   * * full circle
   * * with varying sweep:
   *    * partial arc with single chord closure
   *    * partial arc with 2-edge closure via center
   */
  public static createArcRegions(): Loop[] {
    const result = [];
    const center = Point3d.create(0, 0, 0);
    for (const sweep of [
      AngleSweep.createStartEndDegrees(0, 360),
      AngleSweep.createStartEndDegrees(-20, 20),
      AngleSweep.createStartEndDegrees(0, 90),
      AngleSweep.createStartEndDegrees(0, 180),
    ]) {
      const arc0 = Arc3d.createXY(Point3d.create(0, 0), 2.0, sweep);
      if (arc0.sweep.isFullCircle) {
        result.push(Loop.create(arc0));
      } else {
        const chord = LineSegment3d.create(arc0.endPoint(), arc0.startPoint());
        result.push(Loop.create(arc0, chord));
        result.push(Loop.create(arc0, LineString3d.create(arc0.endPoint(), center, arc0.startPoint())));
      }

    }
    return result;
  }

  /** Assorted loops in xy plane:
   * * unit square
   * * rectangle
   * * L shape
   */
  public static createSimpleXYPointLoops(): Point3d[][] {
    const result = [];
    result.push(Sample.createRectangleXY(0, 0, 1, 1));
    result.push(Sample.createRectangleXY(0, 0, 4, 3));
    result.push(Sample.createLShapedPolygon(0, 0, 5, 4, 1, 2));
    return result;
  }
  /** Assorted `ParityRegion` objects */
  public static createSimpleParityRegions(includeBCurves: boolean = false): ParityRegion[] {
    const pointC = Point3d.create(-5, 0, 0);
    const point0 = Point3d.create(0, 0, 0);
    const point1 = Point3d.create(4, 2, 0);
    const point2 = Point3d.create(6, 4, 0);
    const point3 = Point3d.create(5, 5, 0);
    const point4 = Point3d.create(8, 3, 0);

    const reverseSweep = AngleSweep.createStartEndDegrees(0, -360);
    const ax = 10.0;
    const ay = 8.0;
    const bx = -3.0;
    const by = 2.0;
    const r2 = 0.5;
    const r2A = 2.5;
    const pointA = point0.plusXYZ(ax, 0, 0);
    const pointB = pointA.plusXYZ(0, ay, 0);
    const pointC1 = point0.plusXYZ(0, ay);

    const result = [
      ParityRegion.create(
        Loop.create(LineString3d.create(point0, pointA, pointB), Arc3d.createCircularStartMiddleEnd(pointB, pointC1, point0)!),
        Loop.create(LineString3d.createRectangleXY(point1, bx, by))),
      ParityRegion.create(
        Loop.create(
          Arc3d.createXY(pointC, 2.0)),
        Loop.create(Arc3d.createXY(pointC, 1.0, reverseSweep))),
      ParityRegion.create(
        Loop.create(LineString3d.createRectangleXY(point0, ax, ay)),
        Loop.create(LineString3d.createRectangleXY(point1, bx, by))),
      ParityRegion.create(
        Loop.create(LineString3d.createRectangleXY(point0, ax, ay)),
        Loop.create(LineString3d.createRectangleXY(point1, bx, by)),
        Loop.create(Arc3d.createXY(point2, r2, reverseSweep))),
      ParityRegion.create(
        Loop.create(LineString3d.createRectangleXY(point0, ax, ay)),
        Loop.create(LineString3d.createRectangleXY(point1, bx, by)),
        Loop.create(Arc3d.createXY(point2, r2, reverseSweep)),
        Loop.create(LineString3d.createRectangleXY(point3, bx, by))),
      ParityRegion.create(
        Loop.create(LineString3d.create(point0, pointA, pointB), Arc3d.createCircularStartMiddleEnd(pointB, pointC1, point0)!),
        Loop.create(LineString3d.createRectangleXY(point1, bx, by)),
        Loop.create(Arc3d.create(point4, Vector3d.create(-r2, 0), Vector3d.create(0, r2A))),
        Loop.create(LineString3d.createRectangleXY(point3, bx, by))),
    ];
    if (includeBCurves) {
      const ey = 1.0;
      result.push(
        ParityRegion.create(Loop.create(
          LineSegment3d.create(point0, pointA),
          BSplineCurve3d.createUniformKnots(
            [pointA, Point3d.create(ax + 1, ey),
              Point3d.create(ax + 1, 2 * ey),
              Point3d.create(ax + 2, 3 * ey),
              Point3d.create(ax + 1, 4 * ey), pointB], 3)!,
          Arc3d.createCircularStartMiddleEnd(pointB, pointC1, point0)!)));
    }
    return result;
  }
  /** Union region. */
  public static createSimpleUnions(): UnionRegion[] {
    const parityRegions = Sample.createSimpleParityRegions();
    const parityRange = parityRegions[0].range();
    const ax = 3.0;
    const ay = 1.0;
    const bx = 4.0;
    const by = 2.0;
    const result = [
      UnionRegion.create(
        Loop.create(LineString3d.createRectangleXY(Point3d.create(0, 0, 0), ax, ay)),
        Loop.create(LineString3d.createRectangleXY(Point3d.create(0, 2 * ay, 0), bx, by))),
      UnionRegion.create(
        Loop.create(LineString3d.create(Sample.createRectangleXY(parityRange.low.x, parityRange.high.y + 0.5, parityRange.xLength(), parityRange.yLength()))),
        parityRegions[0])];
    return result;
  }
  /** Assorted unstructured curve sets. */
  public static createBagOfCurves(): BagOfCurves[] {
    const parityRegions = Sample.createSimpleParityRegions();
    const loops = Sample.createSimpleLoops();
    const result = [
      BagOfCurves.create(loops[0], parityRegions[0], LineSegment3d.createXYXY(0, 1, 4, 2, 1)),
      // a bag with just an arc
      BagOfCurves.create(Arc3d.createUnitCircle()),
      // a bag with just a line segment
      BagOfCurves.create(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(1, 1, 0))),
      // a bag with just a linestring
      BagOfCurves.create(LineString3d.create(Point3d.create(0, 0, 0), Point3d.create(1, 1, 0), Point3d.create(2, 1, 0))),
    ];
    return result;
  }

  /** Assorted smooth curve primitives:
   * * line segments
   * * arcs
   */
  public static createSmoothCurvePrimitives(size: number = 1.0): CurvePrimitive[] {
    const alpha = 0.1;
    const beta = 0.3;
    return [
      LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(size, 0, 0)),
      LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(size, size, 0)),
      Arc3d.create(
        Point3d.create(0, 0, 0),
        Vector3d.create(size, 0, 0),
        Vector3d.create(0, size, 0),
        AngleSweep.createStartEndDegrees(0, 90)),
      Arc3d.create(
        Point3d.create(0, 0, 0),
        Vector3d.create(size, 0, 0),
        Vector3d.create(0, size, 0),
        AngleSweep.createStartEndDegrees(-40, 270)),
      Arc3d.create(
        Point3d.create(0, 0, 0),
        Vector3d.create(size, alpha * size, 0),
        Vector3d.create(-alpha * beta * size, beta * size, 0),
        AngleSweep.createStartEndDegrees(-40, 270)),
    ];
  }
  /** assorted small polyface grids, possibly expanded by gridMultiplier */
  public static createSimpleIndexedPolyfaces(gridMultiplier: number): IndexedPolyface[] {
    const meshes = [
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        gridMultiplier * 3, 2 * gridMultiplier, false, false, false),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, true, false, false),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, false, true, false),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, false, false, true),
      Sample.createTriangularUnitGridPolyface(
        Point3d.create(),
        Vector3d.unitX(),
        Vector3d.unitY(),
        3 * gridMultiplier, 2 * gridMultiplier, true, true, true),
    ];
    for (const m of meshes)
      m.expectedClosure = 1;
    return meshes;
  }
  /**
   * Build a mesh that is a (possibly skewed) grid in a plane.
   * @param origin "lower left" coordinate
   * @param vectorX step in "X" direction
   * @param vectorY step in "Y" direction
   * @param numXVertices number of vertices in X direction
   * @param numYVertices number of vertices in y direction
   * @param createParams true to create parameters, with paramter value `(i,j)` for point at (0 based) vertex in x,y directions
   * @param createNormals true to create a (single) normal indexed from all facets
   * @param createColors true to create a single color on each quad.  (shared between its triangles)
   * @note edgeVisible is false only on the diagonals
   */
  public static createTriangularUnitGridPolyface(origin: Point3d, vectorX: Vector3d, vectorY: Vector3d,
    numXVertices: number, numYVertices: number, createParams: boolean = false, createNormals: boolean = false, createColors: boolean = false, triangulate: boolean = true): IndexedPolyface {
    const mesh = IndexedPolyface.create(createNormals, createParams, createColors);
    const normal = vectorX.crossProduct(vectorY);
    if (createNormals) {
      normal.normalizeInPlace();
      mesh.addNormalXYZ(normal.x, normal.y, normal.z);  // use XYZ to help coverage count!!
    }

    // Push to coordinate arrays
    for (let j = 0; j < numYVertices; j++) {
      for (let i = 0; i < numXVertices; i++) {
        mesh.addPoint(origin.plus2Scaled(vectorX, i, vectorY, j));
        if (createParams)
          mesh.addParamUV(i, j);
      }
    }
    let color = 10; // arbitrarily start at color 10 so colorIndex is different from color.
    // Push elements to index array (vertices are calculated using i and j positioning for each point)
    let thisColorIndex = 0;
    for (let j = 0; j + 1 < numYVertices; j++) {
      for (let i = 0; i + 1 < numXVertices; i++) {
        const vertex00 = numXVertices * j + i;
        const vertex10 = vertex00 + 1;
        const vertex01 = vertex00 + numXVertices;
        const vertex11 = vertex01 + 1;
        if (triangulate) {
          // Push lower triangle
          mesh.addPointIndex(vertex00, true); mesh.addPointIndex(vertex10, true); mesh.addPointIndex(vertex11, false);
          // make color === faceIndex
          if (createColors) {
            thisColorIndex = mesh.addColor(color++);
            mesh.addColorIndex(thisColorIndex); mesh.addColorIndex(thisColorIndex); mesh.addColorIndex(thisColorIndex);
          }
          // param indexing matches points .  .
          if (createParams) {
            mesh.addParamIndex(vertex00); mesh.addParamIndex(vertex10); mesh.addParamIndex(vertex11);
          }

          if (createNormals) {
            mesh.addNormalIndex(0); mesh.addNormalIndex(0); mesh.addNormalIndex(0);
          }
          mesh.terminateFacet(false);

          // upper triangle
          mesh.addPointIndex(vertex11, true); mesh.addPointIndex(vertex01, true); mesh.addPointIndex(vertex00, false);
          // make color === faceIndex
          if (createColors) {
            mesh.addColorIndex(thisColorIndex); mesh.addColorIndex(thisColorIndex); mesh.addColorIndex(thisColorIndex);
          }
          // param indexing matches points.
          if (createParams) {
            mesh.addParamIndex(vertex11); mesh.addParamIndex(vertex01); mesh.addParamIndex(vertex00);
          }
          if (createNormals) {
            mesh.addNormalIndex(0); mesh.addNormalIndex(0); mesh.addNormalIndex(0);
          }
          mesh.terminateFacet(false);
        } else {
          // Push quad
          mesh.addPointIndex(vertex00, true); mesh.addPointIndex(vertex10, true); mesh.addPointIndex(vertex11, true); mesh.addPointIndex(vertex01, true);
          // make color === faceIndex
          if (createColors) {
            thisColorIndex = mesh.addColor(color++);
            mesh.addColorIndex(thisColorIndex); mesh.addColorIndex(thisColorIndex); mesh.addColorIndex(thisColorIndex); mesh.addColorIndex(thisColorIndex);
          }
          // param indexing matches points .  .
          if (createParams) {
            mesh.addParamIndex(vertex00); mesh.addParamIndex(vertex10); mesh.addParamIndex(vertex11); mesh.addParamIndex(vertex01);
          }

          if (createNormals) {
            mesh.addNormalIndex(0); mesh.addNormalIndex(0); mesh.addNormalIndex(0); mesh.addNormalIndex(0);
          }
          mesh.terminateFacet(false);

        }
      }
    }
    return mesh;
  }
  /** Create an xy grid of points in single array with x varying fastest. */
  public static createXYGrid(numU: number, numV: number, dX: number = 1.0, dY: number = 1.0): Point3d[] {
    const points = [];
    for (let j = 0; j < numV; j++) {
      for (let i = 0; i < numU; i++) {
        points.push(Point3d.create(i * dX, j * dY, 0));
      }
    }
    return points;
  }
  /** Create simple bspline surface on xy plane grid. */
  public static createXYGridBsplineSurface(numU: number, numV: number, orderU: number, orderV: number): BSplineSurface3d | undefined {
    return BSplineSurface3d.create(
      Sample.createXYGrid(numU, numV, 1.0, 1.0), numU, orderU, undefined, numV, orderV, undefined);
  }
  /**
   * Create a bspline surface whose poles area on circular paths.
   * * (BUT not weighted bspline, therefore although u and v isolines "go around" they are not true circles.)
   * @param radiusU major radius
   * @param radiusV minor radius
   * @param numU number of facets around major hoop
   * @param numV number of facets around minor hoop
   * @param orderU major hoop order
   * @param orderV minor hoop order
   */
  public static createPseudoTorusBsplineSurface(radiusU: number, radiusV: number, numU: number, numV: number, orderU: number, orderV: number): BSplineSurface3d | undefined {
    const points = [];
    const numUPole = numU + orderU - 1;
    const numVPole = numV + orderV - 1;
    const uKnots = KnotVector.createUniformWrapped(numU, orderU - 1, 0, 1);
    const vKnots = KnotVector.createUniformWrapped(numV, orderV - 1, 0, 1);
    const dURadians = 2.0 * Math.PI / numU;
    const dVRadians = 2.0 * Math.PI / numV;
    for (let iV = 0; iV < numVPole; iV++) {
      const vRadians = iV * dVRadians;
      const cV = Math.cos(vRadians);
      const sV = Math.sin(vRadians);
      for (let iU = 0; iU < numUPole; iU++) {
        const uRadians = iU * dURadians;
        const cU = Math.cos(uRadians);
        const sU = Math.sin(uRadians);
        const rho = radiusU + cV * radiusV;
        points.push(Point3d.create(rho * cU, rho * sU, sV * radiusV));

      }
    }
    const result = BSplineSurface3d.create(points, numUPole, orderU, uKnots.knots, numVPole, orderV, vKnots.knots);
    if (result) {
      result.setWrappable(0, BSplineWrapMode.OpenByAddingControlPoints);
      result.setWrappable(1, BSplineWrapMode.OpenByAddingControlPoints);
    }
    return result;
  }

  /**
   * Create a Bspline surface for a cone.
   * @param centerA center at section A
   * @param centerB center at section B
   * @param radiusA radius at point A
   * @param radiusB radius at point B
   */
  public static createConeBsplineSurface(
    centerA: Point3d,
    centerB: Point3d,
    radiusA: number,
    radiusB: number,
    numSection: number): BSplineSurface3dH | undefined {
    if (numSection < 2)
      numSection = 2;
    const controlPoints: number[][][] = [];
    const numVPole = numSection;
    const q1 = 0.25;
    const q2 = 0.5;
    const q3 = 0.75;

    const uKnots = [0, 0, q1, q1, q2, q2, q3, q3, 1, 1];
    const vKnots = [];
    const dv = 1.0 / (numSection - 1);
    for (let i = 0; i < numSection; i++) {
      vKnots.push(i * dv);
    }
    const center = Point3d.create();
    const vectorAB = Vector3d.createStartEnd(centerA, centerB);
    const axes = Matrix3d.createRigidHeadsUp(vectorAB, AxisOrder.ZXY);
    let r0, r90, v;
    for (let iV = 0; iV < numVPole; iV++) {
      v = iV * dv;
      centerA.interpolate(v, centerB, center);
      r0 = r90 = Geometry.interpolate(radiusA, v, radiusB);
      controlPoints.push(Sample.createBsplineArc90SectionToXYZWArrays(center, axes, r0, r90, false));
    }

    const result = BSplineSurface3dH.createGrid(controlPoints,
      WeightStyle.WeightsSeparateFromCoordinates,
      3, uKnots, 2, vKnots);
    // if (result) {
    // result.setWrappable(0, BSplineWrapMode.OpenByAddingControlPoints);
    // result.setWrappable(1, BSplineWrapMode.OpenByAddingControlPoints);
    // }
    return result;
  }
  /** Create bspline surface on xy grid with weights. */
  public static createWeightedXYGridBsplineSurface(
    numU: number, numV: number, orderU: number, orderV: number,
    weight00: number = 1.0,
    weight10: number = 1.0,
    weight01: number = 1.0,
    weight11: number = 1.0): BSplineSurface3dH | undefined {
    const xyzPoles = Sample.createXYGrid(numU, numV, 1.0, 1.0);
    const weights = [];
    for (let i = 0; i < numU; i++)
      for (let j = 0; j < numV; j++) {
        const wu0 = Geometry.interpolate(weight00, i / (numU - 1), weight10);
        const wu1 = Geometry.interpolate(weight01, i / (numU - 1), weight11);
        weights.push(Geometry.interpolate(wu0, j / (numV - 1), wu1));
      }

    return BSplineSurface3dH.create(xyzPoles,
      weights,
      numU, orderU, undefined,
      numV, orderV, undefined);
  }
  /** assorted linear sweeps */
  public static createSimpleLinearSweeps(): LinearSweep[] {
    const result: LinearSweep[] = [];
    const base = Loop.create(LineString3d.createRectangleXY(Point3d.create(), 2, 3));
    const vectorZ = Vector3d.create(0, 0, 1.234);
    const vectorQ = Vector3d.create(0.1, 0.21, 1.234);
    result.push(LinearSweep.create(base, vectorZ, false) as LinearSweep);
    result.push(LinearSweep.create(base, vectorZ, true) as LinearSweep);
    result.push(LinearSweep.create(base, vectorQ, false) as LinearSweep);
    result.push(LinearSweep.create(base, vectorQ, true) as LinearSweep);
    result.push(LinearSweep.create(Sample.createCappedArcLoop(5, -45, 90), vectorQ, true) as LinearSweep);
    for (const curve of Sample.createSmoothCurvePrimitives()) {
      const path = Path.create(curve);
      result.push(LinearSweep.create(path, vectorZ, false)!);
    }
    // coordinates for a clearly unclosed linestring ....
    const xyPoints = [
      Point2d.create(0, 0),
      Point2d.create(1, 0),
      Point2d.create(1, 1)];

    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, false)!);
    // this forces artificial closure point . . .
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, true)!);

    // add a not-quite-exact closure point ...
    const e = 1.0e-11;
    xyPoints.push(Point2d.create(e, e));
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, false)!);
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, true)!);
    // make it a better closure
    xyPoints.pop();
    xyPoints.push(xyPoints[0]);
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, false)!);
    result.push(LinearSweep.createZSweep(xyPoints, 1, 3, true)!);
    // negative sweep ...
    result.push(LinearSweep.createZSweep(xyPoints, 1, -3, true)!);
    return result;
  }
  /**
   * Create an array of primitives with an arc centered at origin and a line segment closing back to the arc start.
   * This can be bundled into Path or Loop by caller.
   */
  public static createCappedArcPrimitives(radius: number, startDegrees: number, endDegrees: number): CurvePrimitive[] {
    const arc = Arc3d.create(
      Point3d.create(0, 0, 0),
      Vector3d.unitX(radius),
      Vector3d.unitY(radius),
      AngleSweep.createStartEndDegrees(startDegrees, endDegrees));
    return [arc, LineSegment3d.create(arc.fractionToPoint(1.0), arc.fractionToPoint(0.0))];
  }
  /** Return a Path structure for a segment of arc, with closure segment */
  public static createCappedArcPath(radius: number, startDegrees: number, endDegrees: number): Path {
    return Path.createArray(Sample.createCappedArcPrimitives(radius, startDegrees, endDegrees));
  }
  /** Return a Loop structure for a segment of arc, with closure segment */
  public static createCappedArcLoop(radius: number, startDegrees: number, endDegrees: number): Loop {
    return Loop.createArray(Sample.createCappedArcPrimitives(radius, startDegrees, endDegrees));
  }
  /** Create assorted rotational sweeps. */
  public static createSimpleRotationalSweeps(): RotationalSweep[] {
    const result: RotationalSweep[] = [];
    // rectangle in xy plane
    const base = Loop.create(LineString3d.createRectangleXY(Point3d.create(1, 0, 0), 2, 3));
    // rotate around the y axis
    for (const axis of [
      Ray3d.createXYZUVW(0, 0, 0, 0, 1, 0),
      Ray3d.createXYZUVW(5, 0, 0, 0, 1, 0),
      Ray3d.createXYZUVW(-1, 0, 0, -1, 1, 0)]) {
      result.push(RotationalSweep.create(base, axis, Angle.createDegrees(45.0), false) as RotationalSweep);
      result.push(RotationalSweep.create(base, axis, Angle.createDegrees(150.0), true) as RotationalSweep);
    }

    return result;
  }
  /** Create assorted spheres */
  public static createSpheres(includeEllipsoidal: boolean = false): Sphere[] {
    const result: Sphere[] = [];
    result.push(Sphere.createCenterRadius(Point3d.create(0, 0, 0), 1.0));
    result.push(Sphere.createCenterRadius(Point3d.create(1, 2, 3), 3.0));
    const s1 = Sphere.createCenterRadius(Point3d.create(1, 2, 3), 2.0,
      AngleSweep.createStartEndDegrees(-45, 80));
    s1.capped = true;
    result.push(s1);
    // still a sphere, but with axes KIJ . .
    const s2 = Sphere.createFromAxesAndScales(
      Point3d.create(1, 2, 3),
      Matrix3d.createRowValues(
        0, 1, 0,
        0, 0, 1,
        1, 0, 0),
      4, 4, 4,
      AngleSweep.createStartEndDegrees(-45, 45), true)!;
    result.push(s2);
    if (includeEllipsoidal)
      result.push(Sphere.createDgnSphere(
        Point3d.create(1, 2, 3),
        Vector3d.unitX(),
        Vector3d.unitZ(), 3, 2, AngleSweep.createFullLatitude(), false)!);
    return result;
  }
  /** Create true (non-spherical) ellipsoids. */
  public static createEllipsoids(): Sphere[] {
    return [
      Sphere.createEllipsoid(
        Transform.createOriginAndMatrix(
          Point3d.create(0, 0, 0),
          Matrix3d.createRowValues(
            4, 1, 1,
            1, 4, 1,
            0.5, 0.2, 5)),
        AngleSweep.createFullLatitude(),
        true)!];
  }
  /** Create assorted cones. */
  public static createCones(): Cone[] {
    const result: Cone[] = [];
    const origin = Point3d.create(0, 0, 0);
    const topZ = Point3d.create(0, 0, 5);
    const centerA = Point3d.create(1, 2, 1);
    const centerB = Point3d.create(2, 3, 8);
    result.push(Cone.createAxisPoints(Point3d.create(0, 0, 0), Point3d.create(0, 0, 1), 0.5, 0.5, false) as Cone);

    result.push(Cone.createAxisPoints(centerA, centerB, 0.5, 0.5, false) as Cone);
    result.push(Cone.createAxisPoints(origin, topZ, 1.0, 0.2, true) as Cone);
    result.push(Cone.createAxisPoints(centerA, centerB, 0.2, 0.5, false) as Cone);
    result.push(Cone.createAxisPoints(origin, centerB, 1.0, 0.0, false) as Cone);
    result.push(Cone.createAxisPoints(topZ, origin, 0.0, 1.0, true) as Cone);
    return result;
  }
  /** Return a TorusPipe with swept circle in xz plane rotating through an angle range around the Z axis. */
  public static createPartialTorusAroundZ(majorRadius: number, majorSweep: Angle, minorRadius: number, minorStart: Angle, minorEnd: Angle): RotationalSweep{
    const arc = Arc3d.createXYZXYZXYZ(
      majorRadius, 0, 0,
      minorRadius, 0, 0,
      0, minorRadius, 0,
      AngleSweep.createStartEnd(minorStart, minorEnd));
    const contour = Path.create(arc);
    return RotationalSweep.create(contour, Ray3d.createZAxis(), majorSweep, false)!;
  }
  /** Create assorted Torus Pipes */
  public static createTorusPipes(): TorusPipe[] {
    const result: TorusPipe[] = [];
    const center = Point3d.create(1, 2, 3);

    const frame = Matrix3d.createRotationAroundVector(
      Vector3d.create(1, 2, 3), Angle.createRadians(10)) as Matrix3d;
    const vectorX = frame.columnX();
    const vectorY = frame.columnY();
    const vectorZ = frame.columnZ();
    result.push(TorusPipe.createInFrame(Transform.createIdentity(), 5.0, 0.8, Angle.create360(), false)!);
    result.push(TorusPipe.createInFrame(Transform.createIdentity(), 5.0, 1.0, Angle.createDegrees(90), true)!);
    result.push(TorusPipe.createDgnTorusPipe(center, vectorX, vectorY, 10, 1, Angle.createDegrees(180), true)!);

    result.push(TorusPipe.createDgnTorusPipe(center, vectorY, vectorZ, 10, 1, Angle.createDegrees(45), true) as TorusPipe);

    return result;
  }
  /** Create assorted boxes. */
  public static createBoxes(capped: boolean = true): Box[] {
    const result: Box[] = [];
    const cornerA = Point3d.create(1, 2, 3);
    const aX = 3.0;
    const aY = 2.0;
    const bX = 1.5;
    const bY = 1.0;
    const h = 5.0;
    const frame = Matrix3d.createRotationAroundVector(
      Vector3d.create(0, 0, 1), Angle.createDegrees(10)) as Matrix3d;
    const vectorX = frame.columnX();
    const vectorY = frame.columnY();
    const cornerB = Matrix3d.xyzPlusMatrixTimesCoordinates(cornerA, frame, 0, 0, h);
    result.push(Box.createDgnBox(cornerA, Vector3d.unitX(), Vector3d.unitY(),
      cornerB, aX, aY, aX, aY, capped) as Box);

    result.push(Box.createDgnBox(cornerA, Vector3d.unitX(), Vector3d.unitY(),
      cornerB, aX, aY, bX, bY, capped) as Box);
    result.push(Box.createDgnBox(cornerA, vectorX, vectorY, cornerB, aX, aY, bX, bY, capped) as Box);

    const frameY = Matrix3d.createRotationAroundVector(
      Vector3d.create(0, 1, 0), Angle.createDegrees(10)) as Matrix3d;
    result.push(Box.createDgnBox(cornerA, frameY.columnX(), frameY.columnY(),
      cornerA.plusScaled(frameY.columnZ(), h), aX, aY, bX, bY, capped) as Box);
    return result;
  }
  /** create an array of points for a rectangle with corners (x0,y0,z) and (x1,y1,z)
   */
  public static createRectangle(x0: number, y0: number, x1: number, y1: number, z: number = 0.0, closed: boolean = false): Point3d[] {
    const points = [
      Point3d.create(x0, y0, z),
      Point3d.create(x1, y0, z),
      Point3d.create(x1, y1, z),
      Point3d.create(x0, y1, z),
    ];
    if (closed)
      points.push(Point3d.create(x0, y0, z));
    return points;
  }
  /** create an array of points for a rectangle with corners of a Range2d.
   */
  public static createRectangleInRange2d(range: Range2d, z: number = 0.0, closed: boolean = false): Point3d[] {
    const x0 = range.low.x;
    const x1 = range.high.x;
    const y0 = range.low.y;
    const y1 = range.high.y;
    return this.createRectangle(x0, y0, x1, y1, z, closed);
  }

  /** Create assorted ruled sweeps */
  public static createRuledSweeps(includeParityRegion: boolean = false, includeBagOfCurves: boolean = false): RuledSweep[] {
    const allSweeps = [];
    const contour0 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 3, 2, 0)));
    const contour1 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 3, 2.5, 2)));
    const contour2 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 4, 3.5, 4)));
    const contour3 = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 2, 1, 7)));
    const allContours = [contour0, contour1, contour2];
    allSweeps.push(RuledSweep.create([contour0, contour1], true) as RuledSweep);
    allSweeps.push(RuledSweep.create([contour0, contour1, contour2], true) as RuledSweep);
    allSweeps.push(RuledSweep.create([contour0, contour1, contour2, contour3], true) as RuledSweep);
    allSweeps.push(RuledSweep.create(allContours, false) as RuledSweep);

    const curves = Sample.createSmoothCurvePrimitives();
    for (const c of curves) {
      const frame = c.fractionToFrenetFrame(0.0);
      if (frame) {
        const perpVector = frame.matrix.columnZ();
        perpVector.scaleInPlace(10.0);
        const c1 = c.cloneTransformed(Transform.createTranslation(perpVector)) as CurvePrimitive;
        allSweeps.push(RuledSweep.create([Path.create(c), Path.create(c1)], false)!);
      }
    }
    if (includeParityRegion) {
      const outer = Loop.create(LineString3d.create(this.createRectangleXY(0, 0, 5, 6, 0)));
      const inner = Loop.create(LineString3d.create(this.createRectangleXY(1, 1, 2, 3, 0)));
      const contourA = ParityRegion.create(outer, inner);
      const contourB = contourA.clone();
      contourB.tryTranslateInPlace(0, 0, 2);
      allSweeps.push(RuledSweep.create([contourA, contourB], false)!);
    }
    if (includeBagOfCurves) {
      const contourA = BagOfCurves.create(LineSegment3d.createXYZXYZ(1, 1, 0, 3, 1, 0));
      const contourB = BagOfCurves.create(LineSegment3d.createXYZXYZ(1, 1, 1, 3, 1, 1));
      allSweeps.push(RuledSweep.create([contourA, contourB], false)!);
    }

    return allSweeps;
  }
  /**
   * Uniformly spaced numbers
   * @param a0 first entry
   * @param delta step between entries
   * @param n number of entries
   */
  public static createGrowableArrayCountedSteps(a0: number, delta: number, n: number): GrowableFloat64Array {
    const data = new GrowableFloat64Array(n);
    for (let i = 0; i < n; i++)
      data.push(a0 + i * delta);
    return data;
  }
  /**
   * Create points on a unit circle
   * @param radius first entry
   * @param numEdge number of edges of chorded circle.  Angle step is 2PI/numEdge (whether or not closed)
   * @param closed true to include final point (i.e. return numEdge+1 points)
   */
  public static createGrowableArrayCirclePoints(radius: number, numEdge: number, closed: boolean = false,
    centerX: number = 0, centerY: number = 0, data?: GrowableXYZArray): GrowableXYZArray {
    if (!data) data = new GrowableXYZArray();
    data.ensureCapacity(numEdge + (closed ? 1 : 0));
    const delta = 2.0 * Math.PI / numEdge;
    for (let i = 0; i < numEdge; i++) {
      const radians = i * delta;
      data.push(Point3d.create(centerX + radius * Math.cos(radians), centerY + radius * Math.sin(radians)));
    }
    return data;
  }

  private static pushIfDistinct(points: Point3d[], xyz: Point3d, tol: number = 1.0e-12) {
    if (points.length === 0 || points[points.length - 1].distanceXY(xyz) > tol)
      points.push(xyz);
  }

  private static appendToFractalEval(points: Point3d[], pointA: Point3d, pointB: Point3d, pattern: Point2d[], numRecursion: number, perpendicularFactor: number) {
    const point0 = pointA.clone();
    Sample.pushIfDistinct(points, pointA);

    for (const uv of pattern) {
      const point1 = pointA.interpolatePerpendicularXY(uv.x, pointB, perpendicularFactor * uv.y);
      if (numRecursion > 0)
        Sample.appendToFractalEval(points, point0, point1, pattern, numRecursion - 1, perpendicularFactor);
      Sample.pushIfDistinct(points, point1);
      point0.setFrom(point1);
    }

    Sample.pushIfDistinct(points, pointB);
  }

  /**
   * For each edge of points, construct a transform (with scale, rotate, and translate) that spreads the patter out along the edge.
   * Repeat recursively for each edge
   * @returns Returns an array of recursively generated fractal points
   * @param poles level-0 (coarse) polygon whose edges are to be replaced by recursive fractals
   * @param pattern pattern to map to each edge of poles (and to edges of the recursion)
   * @param numRecursion  number of recursions
   * @param perpendicularFactor factor to apply to perpendicular sizing.
   */
  public static createRecursiveFractalPolygon(poles: Point3d[], pattern: Point2d[], numRecursion: number, perpendicularFactor: number): Point3d[] {
    const points: Point3d[] = [];
    Sample.pushIfDistinct(points, poles[0]);
    for (let i = 0; i + 1 < poles.length; i++) {
      if (numRecursion > 0)
        Sample.appendToFractalEval(points, poles[i], poles[i + 1], pattern, numRecursion - 1, perpendicularFactor);
      Sample.pushIfDistinct(points, poles[i + 1]);
    }
    return points;
  }

  /** Primary shape is a "triangle" with lower edge pushed in so it becomes a mild nonconvex quad.
   *  Fractal effects are gentle.
   */
  public static nonConvexQuadSimpleFractal(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.5, 0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(0, 0, 0),
      Point3d.create(0.6, 0.1, 0),
      Point3d.create(1, 0.1, 0),
      Point3d.create(0.6, 1, 0),
      Point3d.create(),
    ];
    return Sample.createRecursiveFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }

  /** create a diamond with convex fractal */
  public static createFractalDiamondConvexPattern(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.3, 0.05),
      Point2d.create(0.5, 0.10),
      Point2d.create(0.7, 0.04),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(0, -1, 0),
      Point3d.create(1, 0, 0),
      Point3d.create(0, 1, 0),
      Point3d.create(-1, 0, 0),
      Point3d.create(0, -1, 0),
    ];
    return Sample.createRecursiveFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }
  /** Create l on a square, with pattern shift to both directions. */
  public static createFractalSquareReversingPattern(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.25, 0),
      Point2d.create(0.5, 0.2),
      Point2d.create(0.75, -0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(0, 1, 0),
      Point3d.create(0, 0, 0),
    ];
    return Sample.createRecursiveFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }
  /** Create a fractal on a non-convex base and reversing pattern */
  public static createFractalHatReversingPattern(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.25, 0),
      Point2d.create(0.25, 0.1),
      Point2d.create(0.50, 0.1),
      Point2d.create(0.50, -0.1),
      Point2d.create(0.75, -0.1),
      Point2d.create(0.75, 0),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(0, 1, 0),
      Point3d.create(0, 0, 0),
    ];
    return Sample.createRecursiveFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }
  /** Create a fractal on a primary L shape with a reversing pattern */
  public static createFractalLReversingPattern(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.25, 0),
      Point2d.create(0.5, 0.2),
      Point2d.create(0.75, -0.1),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(2, 2, 0),
      Point3d.create(2, 3, 0),
      Point3d.create(0, 3, 0),
      Point3d.create(),
    ];
    return Sample.createRecursiveFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }

  /** Fractal with fewer concavity changes.... */
  public static createFractalLMildConcavePatter(numRecursion: number, perpendicularFactor: number): Point3d[] {
    const pattern: Point2d[] = [
      Point2d.create(),
      Point2d.create(0.25, 0.05),
      Point2d.create(0.5, 0.15),
      Point2d.create(0.75, 0.05),
      Point2d.create(1.0, 0.0),
    ];
    const poles: Point3d[] = [
      Point3d.create(),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(2, 2, 0),
      Point3d.create(1.5, 3, 0),
      Point3d.create(0, 3, 0),
      Point3d.create(),
    ];
    return Sample.createRecursiveFractalPolygon(poles, pattern, numRecursion, perpendicularFactor);
  }
  /** append interpolated points from the array tail to the target. */
  public static appendSplits(points: Point3d[], target: Point3d, numSplit: number, includeTarget: boolean) {
    const pointA = points[points.length - 1];
    for (let i = 0; i < numSplit; i++)
      points.push(pointA.interpolate(i / numSplit, target));
    if (includeTarget)
      points.push(target);
  }
  /**
   * Triangle with 3 given vertices, and indicated extra points on each each.
   * @param numSplitAB number of extra points on edge AB
   * @param numSplitBC number of extra points on edge BC
   * @param numSplitCA number of extra points on edge CA
   * @param wrap true to replicate vertexA at end
   * @param xyzA vertexA
   * @param xyzB vertexB
   * @param xyzC vertexC
   */
  public static createTriangleWithSplitEdges(
    numSplitAB: number,
    numSplitBC: number,
    numSplitCA: number,
    wrap: boolean = true,
    xyzA: Point3d = Point3d.create(0, 0, 0),
    xyzB: Point3d = Point3d.create(1, 0, 0),
    xyzC: Point3d = Point3d.create(0, 1, 0)): Point3d[] {
    const result = [xyzA.clone()];
    Sample.appendSplits(result, xyzB, numSplitAB, true);
    Sample.appendSplits(result, xyzC, numSplitBC, true);
    Sample.appendSplits(result, xyzA, numSplitCA, wrap);
    return result;
  }
  /** Create a box (xyz) from half-lengths and center. */
  public static createCenteredBoxEdges(ax: number = 1, ay: number = 1, az: number = 0, cx: number = 0, cy: number = 0, cz: number = 0,
    geometry?: GeometryQuery[]): GeometryQuery[] {
    if (!geometry)
      geometry = [];
    const x0 = cx - ax;
    const y0 = cy - ay;
    const z0 = cz - az;

    const x1 = cx + ax;
    const y1 = cy + ay;
    const z1 = cz + az;

    for (const z of [z0, z1]) {
      geometry.push(
        LineString3d.create(
          Point3d.create(x0, y0, z),
          Point3d.create(x1, y0, z),
          Point3d.create(x1, y1, z),
          Point3d.create(x0, y1, z),
          Point3d.create(x0, y0, z)));
    }
    geometry.push(LineSegment3d.createXYZXYZ(x0, y0, z0, x0, y0, z1));
    geometry.push(LineSegment3d.createXYZXYZ(x1, y0, z0, x1, y0, z1));
    geometry.push(LineSegment3d.createXYZXYZ(x1, y1, z0, x1, y1, z1));
    geometry.push(LineSegment3d.createXYZXYZ(x0, y1, z0, x0, y1, z1));
    return geometry;
  }
  /** Assorted transition spirals
   * * (All combinations of bearing radius bearing radius length subsets.)
   */
  public static createSimpleTransitionSpirals(): TransitionSpiral3d[] {
    // 5 spirals exercise the intricate "4 out of 5" input rules for spirals . ..
    const r1 = 1000.0;
    const r0 = 0.0;
    const averageCurvature = IntegratedSpiral3d.averageCurvatureR0R1(r0, r1);
    const arcLength = 100.0;
    const dThetaRadians = arcLength * averageCurvature;

    return [
      IntegratedSpiral3d.createFrom4OutOf5("clothoid", r0, r1,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians),
        undefined,
        undefined, Transform.createIdentity())!,
      IntegratedSpiral3d.createFrom4OutOf5("bloss", r0, r1,
        Angle.createDegrees(0), undefined,
        arcLength,
        undefined, Transform.createIdentity())!,
      IntegratedSpiral3d.createFrom4OutOf5("clothoid", r0, r1,
        undefined, Angle.createRadians(dThetaRadians),
        arcLength,
        undefined, Transform.createIdentity())!,
      IntegratedSpiral3d.createFrom4OutOf5("biquadratic", r0, undefined,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians),
        arcLength,
        undefined, Transform.createIdentity())!,
      IntegratedSpiral3d.createFrom4OutOf5("sine", undefined, r1,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians),
        arcLength,
        undefined, Transform.createIdentity())!,
      IntegratedSpiral3d.createFrom4OutOf5("cosine", r0, r1,
        Angle.createDegrees(0), Angle.createRadians(dThetaRadians), undefined,
        Segment1d.create(0, 0.5),
        Transform.createOriginAndMatrix(Point3d.create(1, 2, 0),
          Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(15))))!,
      DirectSpiral3d.createFromLengthAndRadius("Arema", r0, r1,
        Angle.createDegrees(0), undefined, arcLength,
        undefined,
        Transform.createOriginAndMatrix(Point3d.create(1, 2, 0),
          Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(15))))!,
      DirectSpiral3d.createFromLengthAndRadius("ChineseCubic", r0, r1,
        Angle.createDegrees(0), undefined, arcLength,
        undefined,
        Transform.createOriginAndMatrix(Point3d.create(1, 2, 0),
          Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(15))))!,
      DirectSpiral3d.createFromLengthAndRadius("JapaneseCubic", r0, r1,
        Angle.createDegrees(0), undefined, arcLength,
        undefined,
        Transform.createOriginAndMatrix(Point3d.create(1, 2, 0),
          Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(15))))!,
      DirectSpiral3d.createFromLengthAndRadius("DirectHalfCosine", r0, r1,
        Angle.createDegrees(0), undefined, arcLength,
        undefined,
        Transform.createOriginAndMatrix(Point3d.create(1, 2, 0),
          Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(15))))!,
      DirectSpiral3d.createCzechCubic(Transform.createIdentity(), arcLength, r1)!];
  }
  /** Create a Bezier curve with significant twist effects
   * * r and theta are circle in xy plane at steps in thetaStepper
   * * z varies with sin(phi) at steps in phiStepper.
   */
  public static createTwistingBezier(order: number,
    x0: number,
    y0: number,
    r: number,
    thetaStepper: AngleSweep,
    phiStepper: AngleSweep,
    weightInterval?: Segment1d,
  ): CurvePrimitive | undefined {

    if (weightInterval !== undefined) {
      const points = [];
      for (let i = 0; i < order; i++) {
        const theta = thetaStepper.fractionToRadians(i);
        const phi = phiStepper.fractionToRadians(i);
        const weight = weightInterval.fractionToPoint(i / (order - 1));
        points.push(Point4d.create(
          weight * (x0 + r * Math.cos(theta)),
          weight * (y0 + r * Math.sin(theta)),
          weight * Math.sin(phi), weight));
      }
      return BezierCurve3dH.create(points)!;
    } else {
      const points = [];
      for (let i = 0; i < order; i++) {
        const theta = thetaStepper.fractionToRadians(i);
        const phi = phiStepper.fractionToRadians(i);
        points.push(Point3d.create(x0 + r * Math.cos(theta), y0 + r * Math.sin(theta), Math.sin(phi)));
      }
      return BezierCurve3d.create(points);
    }
  }
  /**
   * Create various curve chains with distance indexing.
   * * LineSegment
   * * CircularArc
   * * LineString
   * * order 3 bspline
   * * order 4 bspline
   * * alternating lines and arcs
   */
  public static createCurveChainWithDistanceIndex(): CurveChainWithDistanceIndex[] {
    const pointsA = [Point3d.create(0, 0, 0), Point3d.create(1, 3, 0), Point3d.create(2, 4, 0), Point3d.create(3, 3, 0), Point3d.create(4, 0, 0)];
    const result = [];
    // one singleton per basic curve type ...
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(5, 0, 0))))!);
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(Arc3d.createCircularStartMiddleEnd(
        Point3d.create(0, 0, 0), Point3d.create(3, 3, 0), Point3d.create(6, 0, 0))!))!);
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(LineString3d.create(pointsA)))!);
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(BSplineCurve3d.createUniformKnots(pointsA, 3)!))!);
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(BSplineCurve3d.createUniformKnots(pointsA, 4)!))!);
    result.push(CurveChainWithDistanceIndex.createCapture(
      Path.create(
        LineSegment3d.create(pointsA[0], pointsA[1]),
        Arc3d.createCircularStartMiddleEnd(pointsA[1], pointsA[2], pointsA[3])!,
        LineSegment3d.create(pointsA[3], pointsA[4])))!);
    return result;
  }
  /**
   * Create a square wave path.
   * @param numTooth number of teeth.
   * @param dxA x size of "A" part
   * @param dxB x size of "B" part
   * @param yA y for A part
   * @param yB y for B part
   * @param structure 1 for line segments, 2 for one linestring per tooth, 0 for single linestring
   */
  public static createSquareWavePath(numTooth: number, dxA: number, dxB: number, yA: number, yB: number, structure: number): Path {
    const dxAB = dxA + dxB;
    const path = Path.create();
    // build the whole linestring ...
    const allPoints = new GrowableXYZArray(4 * numTooth);
    let x2 = 0.0;
    for (let i = 0; i < numTooth; i++) {
      const x0 = i * dxAB;
      const x1 = x0 + dxA;
      x2 = (i + 1) * dxAB;
      allPoints.pushXYZ(x0, yA, 0);
      allPoints.pushXYZ(x1, yA, 0.0);
      allPoints.pushXYZ(x1, yB, 0.0);
      allPoints.pushXYZ(x2, yB, 0.0);
    }
    allPoints.pushXYZ(x2, yA, 0.0);

    const numPoints = allPoints.length;

    if (structure === 1) {
      const pointA = Point3d.create();
      const pointB = Point3d.create();
      allPoints.getPoint3dAtUncheckedPointIndex(0, pointA);
      for (let i1 = 0; i1 + 1 < numPoints; i1++) {
        allPoints.getPoint3dAtUncheckedPointIndex(i1, pointB);
        path.tryAddChild(LineSegment3d.create(pointA, pointB));
        pointA.setFromPoint3d(pointB);
      }
    } else if (structure === 2) {
      for (let i0 = 0; i0 + 4 < numPoints; i0 += 4) {
        const ls = LineString3d.create();
        ls.addSteppedPoints(allPoints, i0, 1, 5);
        path.tryAddChild(ls);
      }

    } else {
      const ls = LineString3d.create();
      ls.addSteppedPoints(allPoints, 0, 1, numPoints);
      path.tryAddChild(ls);

    }
    return path;
  }

  /**
   * Create various elliptic arcs
   * * circle with vector0, vector90 aligned with x,y
   * * circle with axes rotated
   * *
   * @param radiusRatio = vector90.magnitude / vector0.magnitude
   */
  public static createArcs(radiusRatio: number = 1.0, sweep: AngleSweep = AngleSweep.create360()): Arc3d[] {
    const arcs = [];
    const center0 = Point3d.create(0, 0, 0);
    const a = 1.0;
    const b = radiusRatio;
    const direction0 = Vector3d.createPolar(a, Angle.createDegrees(35.0));
    const direction90 = direction0.rotate90CCWXY();
    direction90.scaleInPlace(radiusRatio);
    arcs.push(Arc3d.create(center0, Vector3d.create(a, 0, 0), Vector3d.create(0, b, 0), sweep));
    arcs.push(Arc3d.create(center0, direction0, direction90, sweep));
    return arcs;
  }
  /**
   * Create many arcs, optionally including skews
   * * @param skewFactor array of skew factors.  for each skew factor, all base arcs are replicated with vector90 shifted by the factor times vector0
   */
  public static createManyArcs(skewFactors: number[] = []): Arc3d[] {
    const result: Arc3d[] = [];
    const sweep1 = AngleSweep.createStartEndDegrees(-10, 75);
    const sweep2 = AngleSweep.createStartEndDegrees(160.0, 380.0);
    for (const arcs of [
      Sample.createArcs(1.0), Sample.createArcs(0.5),
      Sample.createArcs(1.0, sweep1), Sample.createArcs(0.3, sweep2)]) {
      for (const arc of arcs)
        result.push(arc);
    }
    const numBase = result.length;
    for (const skewFactor of skewFactors) {
      for (let i = 0; i < numBase; i++) {
        const originalArc = result[i];
        result.push(Arc3d.create(originalArc.center, originalArc.vector0, originalArc.vector90.plusScaled(originalArc.vector0, skewFactor), originalArc.sweep));
      }
    }
    return result;
  }

  /**
   * Create edges of a range box.
   * * Line strings on low and high z
   * * single lines on each low z to high z edge.
   * * @param range (possibly null) range
   */
  public static createRangeEdges(range: Range3d): BagOfCurves | undefined {
    if (range.isNull)
      return undefined;
    const corners = range.corners();

    return BagOfCurves.create(
      LineString3d.create(corners[0], corners[1], corners[3], corners[2], corners[0]),
      LineString3d.create(corners[4], corners[5], corners[7], corners[6], corners[4]),
      LineSegment3d.create(corners[0], corners[4]),
      LineSegment3d.create(corners[1], corners[5]),
      LineSegment3d.create(corners[2], corners[6]),
      LineSegment3d.create(corners[3], corners[7]));
  }
  /** Create swept "solids" that can be capped.
   * * At least one of each solid type.
   * * each is within 10 of the origin all directions.
   */
  public static createClosedSolidSampler(capped: boolean): SolidPrimitive[] {
    const result = [];
    result.push(Box.createRange(Range3d.createXYZXYZ(0, 0, 0, 3, 2, 5), capped)!);

    result.push(Cone.createAxisPoints(Point3d.create(0, 0, 0), Point3d.create(0, 0, 5), 1.0, 1.0, capped)!);

    result.push(Sphere.createCenterRadius(Point3d.create(0, 0, 0), 1.0)!);

    result.push(TorusPipe.createInFrame(Transform.createIdentity(), 3.0, 1.0, Angle.create360(), capped)!);
    const arcA = Arc3d.createXY(Point3d.create(6, 1, 0), 1.0, AngleSweep.createStartEndDegrees(-90, 0));
    const point0 = arcA.fractionAndDistanceToPointOnTangent(0.0, -4);
    const pointQ1 = arcA.fractionAndDistanceToPointOnTangent(1.0, 2);
    const pointQ2 = arcA.fractionAndDistanceToPointOnTangent(1.0, 0.5);
    const pointR1 = Point3d.create(point0.x, pointQ1.y);
    const pointR2 = Point3d.create(point0.x, pointQ1.y);
    const linestringQ1 = LineString3d.create(arcA.fractionToPoint(1.0), pointQ1, pointR1, point0);
    const linestringQ2 = LineString3d.create(arcA.fractionToPoint(1.0), pointQ2, pointR2, point0);
    const contourZ = Path.create(linestringQ1.clone());

    const contourA = Loop.create(
      LineSegment3d.create(point0, arcA.fractionToPoint(0)),
      arcA.clone(),
      linestringQ1.clone());
    const contourB = Loop.create(
      LineSegment3d.create(point0, arcA.fractionToPoint(0)),
      arcA.clone(),
      linestringQ2.clone());
    contourB.tryTransformInPlace(Transform.createTranslationXYZ(1, 1, 3));

    // const contourC = contourB.cloneTransformed(Transform.createTranslationXYZ(2, 1, 4))!;
    result.push(LinearSweep.create(contourA, Vector3d.create(0, 0, 5), capped)!);
    const axis = Ray3d.createXYZUVW(0, 8, 0, 1, 0, 0);
    result.push(RotationalSweep.create(contourA.clone()!, axis.clone(), Angle.createDegrees(90), capped)!);

    if (!capped)
      result.push(RotationalSweep.create(contourZ.clone()!, axis.clone(), Angle.createDegrees(90), false)!);

    result.push(RuledSweep.create([contourA.clone()!, contourB.clone()!], capped)!);

    const transformC = Transform.createScaleAboutPoint(Point3d.create(0, 0, 8), 0.5);
    const contourC = contourB.cloneTransformed(transformC)!;
    result.push(RuledSweep.create([contourA.clone()!, contourB.clone()!, contourC.clone()!], capped)!);
    return result;
  }
  /**
   * Create points:
   * *  `numRadialEdges` radially from origin to polar point (r,sweep.start)
   * * `numArcEdges` along arc from (r,sweep.start) to (r,sweep.end)
   * * `numRadialEdges` returning to origin.
   * * optionally include closure point at origin.
   * @param x0 center x
   * @param y0 center y
   * @param radius radius of circle.
   * @param sweep start and end angles of sweep.
   * @param numRadialEdges number of edges from center to arc
   * @param numArcEdges number of edges along arc
   * @param addClosure true to repeat center as closure point
   */
  public static createCutPie(x0: number, y0: number, radius: number, sweep: AngleSweep, numRadialEdges: number, numArcEdges: number, addClosure = false): Point3d[] {

    const points = [];
    const center = Point3d.create(x0, y0);
    points.push(center);
    const pointA = Point3d.create(x0 + radius * Math.cos(sweep.startRadians), y0 + radius * Math.sin(sweep.startRadians));
    const pointB = Point3d.create(x0 + radius * Math.cos(sweep.endRadians), y0 + radius * Math.sin(sweep.endRadians));
    for (let i = 1; i < numRadialEdges; i++)
      points.push(center.interpolate(i / numRadialEdges, pointA));
    points.push(pointA);
    for (let i = 1; i < numArcEdges; i++) {
      const radians = sweep.fractionToRadians(i / numArcEdges);
      points.push(Point3d.create(x0 + radius * Math.cos(radians), y0 + radius * Math.sin(radians)));
    }
    points.push(pointB);
    for (let i = 1; i < numRadialEdges; i++)
      points.push(pointB.interpolate(i / numRadialEdges, center));
    if (addClosure)
      points.push(center.clone());
    return points;
  }
  /**
   * * let ay = 4
   * * base polygon has vertices (0,0), (ax,0), (2*ax,0), (2* ax,ay), (ax,ay), (0,ay), (0,0).
   * * shift the x coordinates of vertices 1,4 by indicated amounts (0-based numbering)
   * * shift the y coordinates for points 1,2,3,4 by indicated amounts (in 0-based numbering)
   * * This is useful for testing non-y-monotonic face situations.
   * * Return as points.
   * @param dy1
   * @param dy2
   * @param dy3
   * @param dy4
   */
  public static creatVerticalStaggerPolygon(dy1: number, dy2: number, dy3: number, dy4: number,
    ax: number,
    ay: number,
    dx1: number,
    dx4: number): Point3d[] {
    const points = [];
    points.push(Point3d.create(0, 0));
    points.push(Point3d.create(ax + dx1, dy1));
    points.push(Point3d.create(2 * ax, dy2));
    points.push(Point3d.create(2 * ax, ay + dy3));
    points.push(Point3d.create(ax + dx4, ay + dy4));
    points.push(Point3d.create(0.0, ay));
    points.push(Point3d.create(0, 0));
    return points;
  }
  /**
   * make line segments for each pair of adjacent points.
   * @param points array of points
   * @param forceClosure if true, inspect coordinates to determine if a closure edge is needed.
   */
  public static convertPointsToSegments(points: Point3d[], forceClosure: boolean = false): LineSegment3d[] {
    const segments = [];
    const n = points.length;
    for (let i = 0; i + 1 < n; i++) {
      segments.push(LineSegment3d.create(points[i], points[i + 1]));
    }
    if (forceClosure && n > 1 && !points[0].isAlmostEqual(points[n - 1]))
      segments.push(LineSegment3d.create(points[n - 1], points[0]));
    return segments;
  }
  /**
   * Create a regular polygon
   * @param angle0 angle from x axis to first point.
   * @param numPoint number of points
   * @param close true to add closure edge.
   */
  public static createRegularPolygon(cx: number, cy: number, cz: number, angle0: Angle, r: number, numPoint: number, close: boolean): Point3d[] {
    const points = [];
    const angleStepRadians = 2.0 * Math.PI / numPoint;
    let radians;
    for (let i = 0; i < numPoint; i++) {
      radians = angle0.radians + i * angleStepRadians;
      points.push(Point3d.create(cx + r * Math.cos(radians), cy + r * Math.sin(radians), cz));
    }
    if (close)
      points.push(points[0].clone());
    return points;
  }

  /**
   * Create a star by alternating radii (with equal angular steps)
   * @param r0 first point radius
   * @param r1 second point radius (if undefined, this is skipped and the result is points on a circle.)
   * @param numPoint number of points
   * @param close true to add closure edge.
   */
  public static createStar(cx: number, cy: number, cz: number, r0: number, r1: number | undefined, numPoint: number, close: boolean, theta0?: Angle): Point3d[] {
    const points = [];
    const angleStepRadians = Math.PI / numPoint;
    const radians0 = theta0 === undefined ? 0.0 : theta0.radians;
    let radians;
    for (let i = 0; i < numPoint; i++) {
      radians = radians0 + 2 * i * angleStepRadians;
      points.push(Point3d.create(cx + r0 * Math.cos(radians), cy + r0 * Math.sin(radians), cz));
      if (r1 !== undefined) {
        radians = radians0 + (2 * i + 1) * angleStepRadians;
        points.push(Point3d.create(cx + r1 * Math.cos(radians), cy + r1 * Math.sin(radians), cz));
      }
    }
    if (close)
      points.push(points[0].clone());
    return points;
  }
  /**
   * Create an outer star A
   * Place multiple inner stars B with centers on circle C
   * @param rA0 radius to star tips on starA
   * @param rA1 radius to star tips on starA
   * @param numAPoint number of points on starA
   * @param rB0 radius to star B tips
   * @param rB1 radius to star B  tips
   * @param numBPoint
   * @param rC radius for inner star centers
   * @param numC number of inner stars
   */
  public static createStarsInStars(rA0: number, rA1: number, numAPoint: number, rB0: number, rB1: number, numBPoint: number, rC: number, numC: number, close: boolean): Point3d[][] {
    const loops: Point3d[][] = [];
    loops.push(this.createStar(0, 0, 0, rA0, rA1, numAPoint, close));
    if (numC > 0) {
      const radiansStep = Math.PI * 2.0 / numC;
      for (let i = 0; i < numC; i++) {
        const radians = i * radiansStep;
        loops.push(
          this.createStar(rC * Math.cos(radians), rC * Math.sin(radians), 0.0, rB0, rB1, numBPoint, close));
      }
    }
    return loops;
  }
  private static appendGeometry(source: GeometryQuery[], dest: GeometryQuery[]) {
    for (const g of source) dest.push(g);
  }

  /** Create a simple example of each GeometryQuery type .... */
  public static createAllGeometryQueryTypes(): GeometryQuery[] {
    const result: GeometryQuery[] = [];
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(1, 0, 0);
    const pointC = Point3d.create(1, 1, 0);
    const pointD = Point3d.create(0, 1, 0);
    const pointABC = [pointA, pointB, pointC];
    const pointABCD = [pointA, pointB, pointC, pointD];
    const pointABCDA = [pointA, pointB, pointC, pointD, pointA];
    result.push(LineSegment3d.create(pointA, pointB));
    result.push(CoordinateXYZ.create(pointA));
    result.push(Arc3d.createCircularStartMiddleEnd(pointA, pointB, pointC)!);
    result.push(PointString3d.create(pointA, pointB));
    result.push(IntegratedSpiral3d.createRadiusRadiusBearingBearing(Segment1d.create(0, 100), AngleSweep.createStartEndDegrees(0, 5), Segment1d.create(0, 0.5), Transform.createIdentity())!);
    result.push(LineString3d.create(pointABCD));
    result.push(BezierCurve3d.create(pointABC)!);
    result.push(BezierCurve3dH.create(pointABC)!);

    result.push(BSplineCurve3d.createUniformKnots(pointABC, 3)!);
    result.push(BSplineCurve3dH.createUniformKnots(pointABC, 3)!);

    result.push(Loop.create(LineString3d.create(pointABCDA)));
    result.push(Path.create(LineString3d.create(pointABCD)));
    result.push(this.createConeBsplineSurface(pointA, pointC, 1, 2, 4)!);
    result.push(this.createXYGridBsplineSurface(8, 4, 4, 3)!);
    this.appendGeometry(this.createClosedSolidSampler(true), result);
    result.push(this.createTriangularUnitGridPolyface(pointA, Vector3d.unitX(), Vector3d.unitY(), 4, 5));
    result.push(this.createTriangularUnitGridPolyface(pointA, Vector3d.unitX(), Vector3d.unitY(), 4, 5, true, true, true, false));
    this.appendGeometry(this.createSimpleParityRegions(), result);
    this.appendGeometry(this.createSimpleUnions(), result);
    this.appendGeometry(this.createBagOfCurves(), result);

    return result;
  }
  /** Create points on a sine wave
   * Point i is origin + (i * xStep, a *sin(theta0 + i * dTheta), b * sin(beta0 + i * dBeta))
   * * Default b is zero, so it is a simple sine wave
   * * If the dTheta and dBeta are equal, it is a sine wave in a tilted plane.
   * * If dTheta and dBeta are different it is a non-planar curve
   */
  public static createPointSineWave(origin: XYAndZ | undefined, numInterval: number = 24,
    xStep: number = Math.PI / 12,
    a: number = 1, thetaSweep: AngleSweep = AngleSweep.createStartEndDegrees(0, 360),
    b: number = 0, betaSweep: AngleSweep = AngleSweep.createStartEndDegrees(0, 180)): Point3d[] {
    return this.createPointsByIndexFunctions(numInterval, SteppedIndexFunctionFactory.createLinear(xStep, origin ? origin.x : 0),
      SteppedIndexFunctionFactory.createCosine(a, thetaSweep, origin ? origin.y : 0),
      SteppedIndexFunctionFactory.createCosine(b, betaSweep, origin ? origin.z : 0));
  }
  /** Create points with x,y,z independent functions of i and numInterval,
   *    Point3d.create (fx(i,numInterval), fy(i,numInterval), fz(i, numInterval));
   */
  public static createPointsByIndexFunctions(numInterval: number, fx: SteppedIndexFunction, fy: SteppedIndexFunction, fz?: SteppedIndexFunction): Point3d[] {
    const points = [];
    if (numInterval > 0) {
      for (let i = 0; i <= numInterval; i++) {
        points.push(Point3d.create(fx(i, numInterval), fy(i, numInterval), fz ? fz(i, numInterval) : 0));
      }
    }
    return points;
  }
  /**
   * Add an AuxData  (with multiple AuxChannelData) using data evaluated by a function of input and xyz.
   * @param data existing polyface data object to receive the additional AuxChannel
   * @param channelIndex
   * @param name name of channel
   * @param inputName name of input
   * @param input0 input value for channel 0
   * @param inputStep step between inputs (channels)
   * @param numInput number of channels (inputs)
   * @param dataType
   * @param scalarFunction function to return the scalar value at (input, point)
   */
  public static addAuxDataScalarChannel(
    data: PolyfaceData,
    channelIndex: number,
    name: string | undefined,
    inputName: string | undefined,
    input0: number, inputStep: number, numInput: number,
    dataType: AuxChannelDataType,
    scalarFunction: (input: number, xyz: Point3d) => number
  ): void {
    if (!data.auxData)
      data.auxData = new PolyfaceAuxData([], []);
    const channelDataArray = [];
    const xyz = Point3d.create();
    for (let i = 0; i < numInput; i++) {
      const input = input0 + i * inputStep;
      const values = [];
      for (let k = 0; k < data.point.length; k++) {
        data.point.getPoint3dAtUncheckedPointIndex(k, xyz);
        values.push(scalarFunction(input, xyz));
      }
      channelDataArray.push(new AuxChannelData(input, values));
    }
    const channel = new AuxChannel(channelDataArray, dataType, name, inputName);
    for (const _q of data.pointIndex){
      data.auxData.indices.push(channelIndex);
    }
    data.auxData.channels.push(channel);
  }
}
