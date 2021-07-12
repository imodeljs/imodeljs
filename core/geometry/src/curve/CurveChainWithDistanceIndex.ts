/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { CurvePrimitive } from "../curve/CurvePrimitive";
import { StrokeCountMap } from "../curve/Query/StrokeCountMap";
import { Geometry } from "../Geometry";
import { GeometryHandler, IStrokeHandler } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Ray3d } from "../geometry3d/Ray3d";
import { Transform } from "../geometry3d/Transform";
import { CurveChain } from "./CurveCollection";
import { CurveExtendMode, CurveExtendOptions, VariantCurveExtendParameter } from "./CurveExtendMode";
import { CurveLocationDetail } from "./CurveLocationDetail";
import { GeometryQuery } from "./GeometryQuery";
import { LineString3d } from "./LineString3d";
import { StrokeOptions } from "./StrokeOptions";

/**
 * * Annotation of an interval of a curve.
 * * The interval is marked with two pairs of numbers:
 * * * fraction0, fraction1 = fraction parameters along the child curve
 * * * distance0,distance1 = distances within containing CurveChainWithDistanceIndex
 * @public
 */
export class PathFragment {
  /** distance along parent to this fragment start */
  public chainDistance0: number;
  /** distance along parent to this fragment end */
  public chainDistance1: number;
  /** Fractional position of this fragment start within its curve primitive. */
  public childFraction0: number;
  /** Fractional position of this fragment end within its curve primitive.. */
  public childFraction1: number;
  /** Curve primitive of this fragment */
  public childCurve: CurvePrimitive;
  /** Create a fragment with complete fraction, distance and child data. */
  public constructor(childFraction0: number, childFraction1: number, distance0: number, distance1: number, childCurve: CurvePrimitive) {
    this.childFraction0 = childFraction0;
    this.childFraction1 = childFraction1;
    this.chainDistance0 = distance0;
    this.chainDistance1 = distance1;
    this.childCurve = childCurve;
  }
  /**
   * Return true if the distance is within the distance limits of this fragment.
   * @param distance
   */
  public containsChainDistance(distance: number): boolean {
    return distance >= this.chainDistance0 && distance <= this.chainDistance1;
  }

  /**
   * Return true if this fragment addresses `curve` and brackets `fraction`
   * @param distance
   */
  public containsChildCurveAndChildFraction(curve: CurvePrimitive, fraction: number): boolean {
    return this.childCurve === curve && fraction >= this.childFraction0 && fraction <= this.childFraction1;
  }

  /** Convert distance to local fraction, and apply that to interpolate between the stored curve fractions.
   * Note that proportional calculation does NOT account for nonuniform parameterization in the child curve.
   */
  public chainDistanceToInterpolatedChildFraction(distance: number): number {
    return Geometry.inverseInterpolate(
      this.childFraction0, this.chainDistance0,
      this.childFraction1, this.chainDistance1,
      distance, this.childFraction0)!;    // the interval "must" have nonzero length, division should be safe . ..
  }
  /** Convert chainDistance to true chidFraction, using detailed moveSignedDistanceFromFraction
   */
  public chainDistanceToAccurateChildFraction(chainDistance: number): number {
    // The fragments are really expected to do good mappings in their distance range ...
    const childDetail = this.childCurve.moveSignedDistanceFromFraction(
      this.childFraction0, chainDistance - this.chainDistance0, false);
    return childDetail.fraction;
  }
  /** Return the scale factor to map childCurve fraction derivatives to chain fraction derivatives
   * @param globalDistance total length of the global curve.
   */
  public fractionScaleFactor(globalDistance: number): number {
    return globalDistance * (this.childFraction1 - this.childFraction0) / (this.chainDistance1 - this.chainDistance0);
  }
  /** Reverse the fraction and distance data.
   * * each child fraction `f` is replaced by `1-f`
   * * each `chainDistance` is replaced by `totalDistance-chainDistance`
   */
  public reverseFractionsAndDistances(totalDistance: number) {
    const f0 = this.childFraction0;
    const f1 = this.childFraction1;
    const d0 = this.chainDistance0;
    const d1 = this.chainDistance1;
    this.childFraction0 = 1.0 - f1;
    this.childFraction1 = 1.0 - f0;
    this.chainDistance0 = totalDistance - d1;
    this.chainDistance1 = totalDistance - d0;
  }
  /**
   * convert a fractional position on the childCurve to distance in the chain space.
   * * Return value is SIGNED -- will be negative when fraction < this.childFraction0.
   * @param fraction fraction along the curve within this fragment
   */
  public childFractionTChainDistance(fraction: number): number {
    let d = this.childCurve.curveLengthBetweenFractions(this.childFraction0, fraction);
    if (fraction < this.childFraction0)
      d = -d;
    return this.chainDistance0 + d;
  }
}
/** Non-instantiable class to build a distance index for a path. */
class DistanceIndexConstructionContext implements IStrokeHandler {
  private _fragments: PathFragment[];
  private _accumulatedDistance: number;
  private constructor() {
    this._accumulatedDistance = 0;
    this._fragments = [];
  }
  // ignore curve announcements -- they are repeated in stroke announcements
  public startParentCurvePrimitive(_cp: CurvePrimitive) { }
  public startCurvePrimitive(_cp: CurvePrimitive) { }
  public endParentCurvePrimitive(_cp: CurvePrimitive) { }
  public endCurvePrimitive(_cp: CurvePrimitive) { }
  // um .. we need to see curves? how to reject?
  public announcePointTangent(_xyz: Point3d, _fraction: number, _tangent: Vector3d) { }
  /** Announce numPoints interpolated between point0 and point1, with associated fractions */
  public announceSegmentInterval(
    cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    let d0 = this._accumulatedDistance;
    if (numStrokes <= 1) {
      this._accumulatedDistance += point0.distance(point1);
      this._fragments.push(new PathFragment(fraction0, fraction1, d0, this._accumulatedDistance, cp));
    } else {
      let f1;
      for (let i = 1, f0 = 0.0; i <= numStrokes; i++, f0 = f1) {
        f1 = Geometry.interpolate(fraction0, i / numStrokes, fraction1);
        d0 = this._accumulatedDistance;
        this._accumulatedDistance += (Math.abs(f1 - f0) * point0.distance(point1));
        this._fragments.push(new PathFragment(f0, f1, d0, this._accumulatedDistance, cp));
      }
    }
  }
  public announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    let f1, d, d0;
    for (let i = 1, f0 = fraction0; i <= numStrokes; i++, f0 = f1) {
      f1 = Geometry.interpolate(fraction0, i / numStrokes, fraction1);
      d = cp.curveLengthBetweenFractions(f0, f1);
      d0 = this._accumulatedDistance;
      this._accumulatedDistance += d;
      this._fragments.push(new PathFragment(f0, f1, d0, this._accumulatedDistance, cp));
    }
  }
  public static createPathFragmentIndex(path: CurveChain, options?: StrokeOptions): PathFragment[] {
    const handler = new DistanceIndexConstructionContext();
    for (const curve of path.children) {
      curve.emitStrokableParts(handler, options);
    }
    const fragments = handler._fragments;
    return fragments;
  }
}
/**
 * `CurveChainWithDistanceIndex` is a CurvePrimitive whose fractional parameterization is proportional to true
 * distance along a CurveChain.
 * * The curve chain can be any type derived from CurveChain.
 * * * i.e. either a `Path` or a `Loop`
 * @public
 */
export class CurveChainWithDistanceIndex extends CurvePrimitive {
  /** String name for schema properties */
  public readonly curvePrimitiveType = "curveChainWithDistanceIndex";

  private _path: CurveChain;
  private _fragments: PathFragment[];
  private _totalLength: number; // matches final fragment distance1.
  /** Test if other is a `CurveChainWithDistanceIndex` */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof CurveChainWithDistanceIndex; }
  // final assembly of CurveChainWithDistanceIndex -- caller must create valid fragment index.
  private constructor(path: CurveChain, fragments: PathFragment[]) {
    super();
    this._path = path;
    this._fragments = fragments;
    this._totalLength = fragments[fragments.length - 1].chainDistance1;
  }
  /**
   * Create a clone, transformed and with its own distance index.
   * @param transform transform to apply in the clone.
   */
  public cloneTransformed(transform: Transform): CurvePrimitive | undefined {
    const c = this._path.clone();
    if (c !== undefined && c instanceof CurveChain && c.tryTransformInPlace(transform))
      return CurveChainWithDistanceIndex.createCapture(c);
    return undefined;
  }
  /** Reference to the contained path.
   * * Do not modify the path.  The distance index will be wrong.
   */
  public get path(): CurveChain { return this._path; }

  /** Return a deep clone */
  public clone(): CurvePrimitive | undefined {
    const c = this._path.clone();
    if (c !== undefined && c instanceof CurveChain)
      return CurveChainWithDistanceIndex.createCapture(c);
    return undefined;
  }
  /** Ask if the curve is within tolerance of a plane.
   * @returns Returns true if the curve is completely within tolerance of the plane.
   */
  public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
    for (const c of this._path.children) {
      if (!c.isInPlane(plane))
        return false;
    }
    return true;
  }

  /** return the start point of the primitive.  The default implementation returns fractionToPoint (0.0) */
  public override startPoint(result?: Point3d): Point3d {
    const c = this._path.cyclicCurvePrimitive(0);
    if (c)
      return c.startPoint(result);
    return Point3d.createZero(result);
  }
  /** Return the end point of the primitive. The default implementation returns fractionToPoint(1.0) */
  public override endPoint(result?: Point3d): Point3d {
    const c = this._path.cyclicCurvePrimitive(-1);
    if (c)
      return c.endPoint(result);
    return Point3d.createZero(result);
  }
  /** Add strokes to caller-supplied linestring */
  public emitStrokes(dest: LineString3d, options?: StrokeOptions): void {
    for (const c of this._path.children) {
      c.emitStrokes(dest, options);
    }
  }
  /** Ask the curve to announce points and simple subcurve fragments for stroking.
   * See IStrokeHandler for description of the sequence of the method calls.
   */
  public emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void {
    for (const c of this._path.children) {
      c.emitStrokableParts(dest, options);
    }
  }
  /**
   * return the stroke count required for given options.
   * @param options StrokeOptions that determine count
   */
  public computeStrokeCountForOptions(options?: StrokeOptions): number {
    let numStroke = 0;
    for (const c of this._path.children) {
      numStroke += c.computeStrokeCountForOptions(options);
    }
    return numStroke;
  }
  /**
   * Return an array containing only the curve primitives.
   * * This DEFAULT simply pushes `this` to the collectorArray.
   * * CurvePrimitiveWithDistanceIndex optionally collects its members.
   * @param collectorArray array to receive primitives (pushed -- the array is not cleared)
   * @param smallestPossiblePrimitives if false, CurvePrimitiveWithDistanceIndex returns only itself.  If true, it recurses to its (otherwise hidden) children.
   */
  public override collectCurvePrimitivesGo(collectorArray: CurvePrimitive[], smallestPossiblePrimitives: boolean) {
    if (smallestPossiblePrimitives) {
      for (const c of this._path.children) {
        c.collectCurvePrimitivesGo(collectorArray, smallestPossiblePrimitives);
      }
    } else {
      collectorArray.push(this);
    }
  }

  /**
   * construct StrokeCountMap for each child, accumulating data to stroke count map for this primitive.
   * @param options StrokeOptions that determine count
   * @param parentStrokeMap evolving parent map.
   */
  public override computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentStrokeMap?: StrokeCountMap) {
    const myMap = StrokeCountMap.createWithCurvePrimitiveAndOptionalParent(this, parentStrokeMap);
    for (const c of this._path.children) {
      c.computeAndAttachRecursiveStrokeCounts(options, myMap);
    }
    CurvePrimitive.installStrokeCountMap(this, myMap, parentStrokeMap);
  }
  /** Second step of double dispatch:  call `this._path.dispatchToGeometryHandler (handler)`
   * * Note that this exposes the children individually to the handler.
   */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return this._path.dispatchToGeometryHandler(handler);
  }
  /** Extend (increase) `rangeToExtend` as needed to include these curves (optionally transformed)
   */
  public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
    this._path.extendRange(rangeToExtend, transform);
  }
  /**
   *
   * * Curve length is always positive.
   * @returns Returns a (high accuracy) length of the curve between fractional positions
   * @returns Returns the length of the curve.
   */
  public override curveLengthBetweenFractions(fraction0: number, fraction1: number): number {
    return Math.abs(fraction1 - fraction0) * this._totalLength;
  }
  /**
   * Capture (not clone) a path into a new `CurveChainWithDistanceIndex`
   * @param primitives primitive array to be CAPTURED (not cloned)
   */
  public static createCapture(path: CurveChain, options?: StrokeOptions): CurveChainWithDistanceIndex | undefined {
    if (path.children.length === 0)
      return undefined;
    const fragments = DistanceIndexConstructionContext.createPathFragmentIndex(path, options);
    const result = new CurveChainWithDistanceIndex(path, fragments);
    return result;
  }

  /**
   * Resolve a fraction of the CurveChain to a PathFragment
   * @param distance
   * @param allowExtrapolation
   */
  protected chainDistanceToFragment(distance: number, allowExtrapolation: boolean = false): PathFragment | undefined {
    const numFragments = this._fragments.length;
    const fragments = this._fragments;
    if (numFragments > 0) {
      if (distance < 0.0)
        return allowExtrapolation ? fragments[0] : undefined;
      if (distance >= this._totalLength)
        return allowExtrapolation ? fragments[numFragments - 1] : undefined;
      // humbug, linear search
      for (const fragment of fragments) {
        if (fragment.containsChainDistance(distance)) return fragment;
      }
    }
    return undefined;
  }
  /**
   * Convert distance along the chain to fraction along the chain.
   * @param distance distance along the chain
   */
  public chainDistanceToChainFraction(distance: number): number { return distance / this._totalLength; }
  /**
   * Resolve a fraction within a specific curve to a fragment.
   * @param curve
   * @param fraction
   */
  protected curveAndChildFractionToFragment(curve: CurvePrimitive, fraction: number): PathFragment | undefined {
    const numFragments = this._fragments.length;
    const fragments = this._fragments;
    if (numFragments > 0) {
      // humbug, linear search
      for (const fragment of fragments) {
        if (fragment.containsChildCurveAndChildFraction(curve, fraction)) return fragment;
      }
      if (fraction <= 0)
        return fragments[0];
      if (fraction > 1.0)
        return fragments[numFragments - 1];
    }
    return undefined;
  }

  /**
   * Returns the total length of curves.
   */
  public override curveLength(): number {
    return this._totalLength;
  }
  /**
   * Returns the total length of the path.
   * * This is exact (and simple property lookup) because the true lengths were summed at construction time.
   */
  public quickLength(): number {
    return this._totalLength;
  }

  /**
   * Return the point (x,y,z) on the curve at fractional position along the chain.
   * @param fraction fractional position along the geometry.
   * @returns Returns a point on the curve.
   */
  public fractionToPoint(fraction: number, result?: Point3d): Point3d {
    const chainDistance = fraction * this._totalLength;
    const fragment = this.chainDistanceToFragment(chainDistance, true);
    if (fragment) {
      const childFraction = fragment.chainDistanceToAccurateChildFraction(chainDistance);
      return fragment.childCurve.fractionToPoint(childFraction, result);
    }
    // no fragment found.  Use _fragments[0]
    //    fragment = this.chainDistanceToFragment(chainDistance, true);
    return this._fragments[0].childCurve.fractionToPoint(0.0, result);
  }

  /** Return the point (x,y,z) and derivative on the curve at fractional position.
   *
   * * Note that this derivative is "derivative of xyz with respect to fraction."
   * * this derivative shows the speed of the "fractional point" moving along the curve.
   * * this is not generally a unit vector.  use fractionToPointAndUnitTangent for a unit vector.
   * @param fraction fractional position along the geometry.
   * @returns Returns a ray whose origin is the curve point and direction is the derivative with respect to the fraction.
   */
  public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
    const distanceAlongPath = fraction * this._totalLength;
    const fragment = this.chainDistanceToFragment(distanceAlongPath, true)!;
    const curveFraction = fragment.chainDistanceToAccurateChildFraction(distanceAlongPath);
    result = fragment.childCurve.fractionToPointAndDerivative(curveFraction, result);
    const a = this._totalLength / result.direction.magnitude();
    result.direction.scaleInPlace(a);
    return result;
  }

  /**
   * Returns a ray whose origin is the curve point and direction is the unit tangent.
   * @param fraction fractional position on the curve
   * @param result optional receiver for the result.
   * Returns a ray whose origin is the curve point and direction is the unit tangent.
   */
  public override fractionToPointAndUnitTangent(fraction: number, result?: Ray3d): Ray3d {
    const distanceAlongPath = fraction * this._totalLength;
    const fragment = this.chainDistanceToFragment(distanceAlongPath, true)!;
    const curveFraction = fragment.chainDistanceToAccurateChildFraction(distanceAlongPath);
    result = fragment.childCurve.fractionToPointAndDerivative(curveFraction, result);
    result.direction.normalizeInPlace();
    return result;
  }
  /** Return a plane with
   *
   * * origin at fractional position along the curve
   * * vectorU is the first derivative, i.e. tangent vector with length equal to the rate of change with respect to the fraction.
   * * vectorV is the second derivative, i.e.derivative of vectorU.
   */
  public fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined {
    const totalLength = this._totalLength;
    const distanceAlongPath = fraction * totalLength;
    const fragment = this.chainDistanceToFragment(distanceAlongPath, true)!;
    const curveFraction = fragment.chainDistanceToAccurateChildFraction(distanceAlongPath);
    result = fragment.childCurve.fractionToPointAnd2Derivatives(curveFraction, result);
    if (!result)
      return undefined;
    const dotUU = result.vectorU.magnitudeSquared();
    const magU = Math.sqrt(dotUU);
    const dotUV = result.vectorU.dotProduct(result.vectorV);
    const duds = 1.0 / magU;
    const a = duds * duds;
    Vector3d.createAdd2Scaled(result.vectorV, a, result.vectorU, -a * dotUV / dotUU, result.vectorV);   // IN PLACE update to vectorV.
    result.vectorU.scale(duds);
    // scale for 0..1 parameterization ....
    result.vectorU.scaleInPlace(totalLength);
    result.vectorV.scaleInPlace(totalLength * totalLength);
    return result;
  }
  /** Attempt to transform in place.
   * * Warning: If any child fails, this object becomes invalid.  But that should never happen.
   */
  public tryTransformInPlace(transform: Transform): boolean {
    let numFail = 0;
    for (const c of this._path.children) {
      if (!c.tryTransformInPlace(transform))
        numFail++;
    }
    return numFail === 0;
  }
  /** Reverse the curve's data so that its fractional stroking moves in the opposite direction. */
  public reverseInPlace(): void {
    this._path.reverseChildrenInPlace();
    const totalLength = this._totalLength;
    for (const fragment of this._fragments)
      fragment.reverseFractionsAndDistances(totalLength);
    for (let i = 0, j = this._fragments.length - 1; i < j; i++, j--) {
      const fragment = this._fragments[i];
      this._fragments[i] = this._fragments[j];
      this._fragments[j] = fragment;
    }
  }
  /**
   * Test for equality conditions:
   * * Mismatched totalLength is a quick exit condition
   * * If totalLength matches, recurse to the path for matching primitives.
   * @param other
   */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    if (other instanceof CurveChainWithDistanceIndex) {
      return Geometry.isSameCoordinate(this._totalLength, other._totalLength)
        && this._path.isAlmostEqual(other._path);
    }
    return false;
  }

  /** Implement moveSignedDistanceFromFraction.
   * * See `CurvePrimitive` for parameter details.
   * * The returned location directly identifies fractional position along the CurveChainWithDistanceIndex, and has pointer to an additional detail for the child curve.
   */
  public override moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail {
    const distanceA = startFraction * this._totalLength;
    const distanceB = distanceA + signedDistance;
    const fragmentB = this.chainDistanceToFragment(distanceB, true)!;
    const childDetail = fragmentB.childCurve.moveSignedDistanceFromFraction(fragmentB.childFraction0, distanceB - fragmentB.chainDistance0, allowExtension, result);
    const endFraction = startFraction + (signedDistance / this._totalLength);
    const chainDetail = CurveLocationDetail.createConditionalMoveSignedDistance(allowExtension, this, startFraction, endFraction, signedDistance, result);
    chainDetail.childDetail = childDetail;
    return chainDetail;
  }

  /** Search for the curve point that is closest to the spacePoint.
   * * The CurveChainWithDistanceIndex invokes the base class CurvePrimitive method, which
   *     (via a handler) determines a CurveLocation detail among the children.
   * * The returned detail directly identifies fractional position along the CurveChainWithDistanceIndex, and has pointer to an additional detail for the child curve.
   * @param spacePoint point in space
   * @param extend true to extend the curve (NOT USED)
   * @returns Returns a CurveLocationDetail structure that holds the details of the close point.
   */
  public override closestPoint(spacePoint: Point3d, extend: VariantCurveExtendParameter): CurveLocationDetail | undefined {
    // umm... to "extend", would require selective extension of first, last
    let childDetail: CurveLocationDetail | undefined;
    let aMin = Number.MAX_VALUE;
    const numChildren = this.path.children.length;
    if (numChildren === 1) {
      childDetail = this.path.children[0].closestPoint(spacePoint, extend);
    } else {
      const extend0 = [CurveExtendOptions.resolveVariantCurveExtendParameterToCurveExtendMode(extend, 0), CurveExtendMode.None];
      const extend1 = [CurveExtendMode.None, CurveExtendOptions.resolveVariantCurveExtendParameterToCurveExtendMode(extend, 1)];
      for (let childIndex = 0; childIndex < numChildren; childIndex++) {
        const child = this.path.children[childIndex];
        const detailA = child.closestPoint(spacePoint, childIndex === 0 ? extend0 : childIndex + 1 === numChildren ? extend1 : false);
        if (detailA && detailA.a < aMin) {
          aMin = detailA.a;
          childDetail = CurveLocationDetail.createCurveFractionPoint(detailA.curve, detailA.fraction, detailA.point, childDetail)!;
          childDetail.a = detailA.a;
        }
      }

    }
    if (!childDetail)
      return undefined;
    const fragment = this.curveAndChildFractionToFragment(childDetail.curve!, childDetail.fraction);
    if (fragment) {
      const chainDistance = fragment.childFractionTChainDistance(childDetail.fraction);
      const chainFraction = this.chainDistanceToChainFraction(chainDistance);
      const chainDetail = CurveLocationDetail.createCurveFractionPoint(this, chainFraction, childDetail.point);
      chainDetail.childDetail = childDetail;
      return chainDetail;
    }
    return undefined;
  }
}
