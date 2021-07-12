/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { Geometry } from "../Geometry";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { AnyCurve } from "./CurveChain";
import { CurveLocationDetail } from "./CurveLocationDetail";
import { CurvePrimitive } from "./CurvePrimitive";
import { RecursiveCurveProcessor } from "./CurveProcessor";
import { GeometryQuery } from "./GeometryQuery";
import { CloneCurvesContext } from "./internalContexts/CloneCurvesContext";
import { CloneWithExpandedLineStrings } from "./internalContexts/CloneWithExpandedLineStrings";
import { CountLinearPartsSearchContext } from "./internalContexts/CountLinearPartsSearchContext";
import { GapSearchContext } from "./internalContexts/GapSearchContext";
import { SumLengthsContext } from "./internalContexts/SumLengthsContext";
import { TransformInPlaceContext } from "./internalContexts/TransformInPlaceContext";
import { LineString3d } from "./LineString3d";
import { StrokeOptions } from "./StrokeOptions";

/** Describes the concrete type of a [[CurveCollection]]. Each type name maps to a specific subclass and can be used in conditional statements for type-switching.
 *    - "loop" => [[Loop]]
 *    - "path" => [[Path]]
 *    - "unionRegion" => [[UnionRegion]]
 *    - "parityRegion" => [[ParityRegion]]
 *    - "bagOfCurves" => [[BagOfCurves]]
 * @public
 */
export type CurveCollectionType = "loop" | "path" | "unionRegion" | "parityRegion" | "bagOfCurves";

/**
 * A `CurveCollection` is an abstract (non-instantiable) class for various sets of curves with particular structures:
 * - `CurveChain` is a (non-instantiable) intermediate class for a sequence of `CurvePrimitive ` joining head-to-tail.  The two instantiable forms of `CurveChain` are
 *   - `Path` - A chain not required to close, and not enclosing a planar area
 *   - `Loop` - A chain required to close from last to first so that a planar area is enclosed.
 * - `ParityRegion` -- a collection of coplanar `Loop`s, with "in/out" classification by parity rules
 * - `UnionRegion` -- a collection of coplanar `Loop`s, with "in/out" classification by union rules
 * - `BagOfCurves` -- a collection of `AnyCurve` with no implied structure.
 *
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export abstract class CurveCollection extends GeometryQuery {
  /** String name for schema properties */
  public readonly geometryCategory = "curveCollection";
  /** Type discriminator. */
  public abstract readonly curveCollectionType: CurveCollectionType;

  /* eslint-disable @typescript-eslint/naming-convention, no-empty */
  /**  Flag for inner loop status. Only used by `Loop`. */
  public isInner: boolean = false;
  /** Return the sum of the lengths of all contained curves. */
  public sumLengths(): number { return SumLengthsContext.sumLengths(this); }
  /** Return the closest point on the contained curves */
  public closestPoint(spacePoint: Point3d): CurveLocationDetail | undefined {
    let detailA: CurveLocationDetail | undefined;
    if (this.children !== undefined) {
      for (const child of this.children) {
        if (child instanceof CurvePrimitive) {
          const detailB = child.closestPoint(spacePoint, false);
          detailA = CurveLocationDetail.chooseSmallerA(detailA, detailB);
        } else if (child instanceof CurveCollection) {
          const detailB = child.closestPoint(spacePoint);
          detailA = CurveLocationDetail.chooseSmallerA(detailA, detailB);
        }
      }
    }
    return detailA;
  }

  /** return the max gap between adjacent primitives in Path and Loop collections.
   *
   * * In a Path, gaps are computed between consecutive primitives.
   * * In a Loop, gaps are computed between consecutive primitives and between last and first.
   * * gaps are NOT computed between consecutive CurvePrimitives in "unstructured" collections.  The type is "unstructured" so gaps should not be semantically meaningful.
   */
  public maxGap(): number { return GapSearchContext.maxGap(this); }
  /** return true if the curve collection has any primitives other than LineSegment3d and LineString3d  */
  public checkForNonLinearPrimitives(): boolean { return CountLinearPartsSearchContext.hasNonLinearPrimitives(this); }
  /** Apply transform recursively to children */
  public tryTransformInPlace(transform: Transform): boolean { return TransformInPlaceContext.tryTransformInPlace(this, transform); }
  /** Return a deep copy. */
  public clone(): CurveCollection | undefined {
    return CloneCurvesContext.clone(this);
  }
  /** Create a deep copy of transformed curves. */
  public cloneTransformed(transform: Transform): CurveCollection | undefined {
    return CloneCurvesContext.clone(this, transform);
  }
  /** Create a deep copy with all linestrings expanded to multiple LineSegment3d. */
  public cloneWithExpandedLineStrings(): CurveCollection | undefined {
    return CloneWithExpandedLineStrings.clone(this);
  }
  /** Recurse through children to collect CurvePrimitive's in flat array. */
  private collectCurvePrimitivesGo(results: CurvePrimitive[], smallestPossiblePrimitives: boolean, explodeLinestrings: boolean = false) {
    if (this.children) {
      for (const child of this.children) {
        if (child instanceof CurvePrimitive)
          child.collectCurvePrimitivesGo(results, smallestPossiblePrimitives, explodeLinestrings);
        else if (child instanceof CurveCollection)
          child.collectCurvePrimitivesGo(results, smallestPossiblePrimitives, explodeLinestrings);
      }
    }
  }

  /**
   * Return an array containing only the curve primitives.
   * @param collectorArray optional array to receive primitives.   If present, new primitives are ADDED (without clearing the array.)
   * @param smallestPossiblePrimitives if false, CurvePrimitiveWithDistanceIndex returns only itself.  If true, it recurses to its (otherwise hidden) children.
   */
  public collectCurvePrimitives(collectorArray?: CurvePrimitive[], smallestPossiblePrimitives: boolean = false, explodeLineStrings: boolean = false): CurvePrimitive[] {
    const results: CurvePrimitive[] = collectorArray === undefined ? [] : collectorArray;
    this.collectCurvePrimitivesGo(results, smallestPossiblePrimitives, explodeLineStrings);
    return results;
  }

  /** Return true for planar region types:
   * * `Loop`
   * * `ParityRegion`
   * * `UnionRegion`
   */
  public get isAnyRegionType(): boolean {
    return this.dgnBoundaryType() === 2 || this.dgnBoundaryType() === 5 || this.dgnBoundaryType() === 4;
  }
  /** Return true for a `Path`, i.e. a chain of curves joined head-to-tail
   */
  public get isOpenPath(): boolean {
    return this.dgnBoundaryType() === 1;
  }
  /** Return true for a single-loop planar region type, i.e. `Loop`.
   * * This is _not- a test for physical closure of a `Path`
   */
  public get isClosedPath(): boolean {
    return this.dgnBoundaryType() === 2;
  }
  /** Return a CurveCollection with the same structure but all curves replaced by strokes. */
  public abstract cloneStroked(options?: StrokeOptions): AnyCurve;

  /** Support method for ICurvePrimitive ... one line call to specific announce method . . */
  public abstract announceToCurveProcessor(processor: RecursiveCurveProcessor): void;
  /** clone an empty collection. */
  public abstract cloneEmptyPeer(): CurveCollection;
  /** Return the boundary type of a corresponding  MicroStation CurveVector.
   * * Derived class must implement.
   */
  public abstract dgnBoundaryType(): number;
  /**
   * Try to add a child.
   * @param child child to add.
   * @return true if child is an acceptable type for this collection.
   */
  public abstract tryAddChild(child: AnyCurve | undefined): boolean;
  /** Return a child identified by by index */
  public abstract getChild(i: number): AnyCurve | undefined;
  /** Extend (increase) `rangeToExtend` as needed to include these curves (optionally transformed) */
  public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
    const children = this.children;
    if (children) {
      for (const c of children) {
        c.extendRange(rangeToExtend, transform);
      }
    }
  }
  /**
   * * Find any curve primitive in the source.
   * * Evaluate it at a fraction (which by default is an interior fraction)
   * @param source containing `CurvePrimitive` or `CurveCollection`
   * @param fraction fraction to use in `curve.fractionToPoint(fraction)`
   */
  public static createCurveLocationDetailOnAnyCurvePrimitive(source: GeometryQuery | undefined, fraction: number = 0.5): CurveLocationDetail | undefined {
    if (!source)
      return undefined;
    if (source instanceof CurvePrimitive) {
      return CurveLocationDetail.createCurveEvaluatedFraction(source, fraction);
    } else if (source instanceof CurveCollection && source.children !== undefined)
      for (const child of source.children) {
        const detail = this.createCurveLocationDetailOnAnyCurvePrimitive(child, fraction);
        if (detail)
          return detail;
      }
    return undefined;
  }
}
/** Shared base class for use by both open and closed paths.
 * - A `CurveChain` contains only curvePrimitives.  No other paths, loops, or regions allowed.
 * - A single entry in the chain can in fact contain multiple curve primitives if the entry itself is (for instance) `CurveChainWithDistanceIndex`
 *   which presents itself (through method interface) as a CurvePrimitive with well defined mappings from fraction to xyz, but in fact does all the
 *   calculations over multiple primitives.
 * - The specific derived classes are `Path` and `Loop`
 * - `CurveChain` is an intermediate class.   It is not instantiable on its own.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export abstract class CurveChain extends CurveCollection {
  /** The curve primitives in the chain. */
  protected _curves: CurvePrimitive[];
  protected constructor() { super(); this._curves = []; }
  /** Return the array of `CurvePrimitive` */
  public override get children(): CurvePrimitive[] {
    if (this._curves === undefined)
      this._curves = [];
    return this._curves;
  }
  /**
   * Return the `[index]` curve primitive, optionally using `modulo` to map`index` to the cyclic indexing.
   * * In particular, `-1` is the final curve.
   * @param index cyclic index
   */
  public cyclicCurvePrimitive(index: number, cyclic: boolean = true): CurvePrimitive | undefined {
    const n = this.children.length;
    if (n === 0)
      return undefined;
    /** Try simplest non-cyclic access first . . */
    if (index >= 0 && index < n)
      return this.children[index];
    if (cyclic) {
      const index2 = Geometry.modulo(index, n);
      return this.children[index2];
    }
    return undefined;
  }
  /** Stroke the chain into a simple xyz array.
   * @param options tolerance parameters controlling the stroking.
   */
  public getPackedStrokes(options?: StrokeOptions): GrowableXYZArray | undefined {
    const tree = this.cloneStroked(options);
    if (tree instanceof CurveChain) {
      const children = tree.children;
      if (children.length === 1) {
        const ls = children[0];
        if (ls instanceof LineString3d)
          return ls.packedPoints;
      }
    }
    return undefined;
  }
  /** Return a structural clone, with CurvePrimitive objects stroked. */
  public abstract override cloneStroked(options?: StrokeOptions): AnyCurve;
  /*  EDL 01/20 Path, Loop, CurveChainWithDistanceIndex all implement this.
      Reducing it to abstract.
      Hypothetically, a derived class in the wild might be depending on this.
   {
    const strokes = LineString3d.create();
    for (const curve of this.children)
      curve.emitStrokes(strokes, options);
    return strokes;
  }
  */
  /** add a child curve.
   * * Returns false if the given child is not a CurvePrimitive.
   */
  public tryAddChild(child: AnyCurve | undefined): boolean {
    if (child && child instanceof CurvePrimitive) {
      this._curves.push(child);
      return true;
    }
    return false;
  }
  /** Return a child by index */
  public getChild(i: number): CurvePrimitive | undefined {
    if (i < this._curves.length) return this._curves[i];
    return undefined;
  }
  /** invoke `curve.extendRange(range, transform)` for each child  */
  public override extendRange(range: Range3d, transform?: Transform): void {
    for (const curve of this._curves)
      curve.extendRange(range, transform);
  }
  /**
   * Reverse each child curve (in place)
   * Reverse the order of the children in the CurveChain array.
   */
  public reverseChildrenInPlace() {
    for (const curve of this._curves)
      curve.reverseInPlace();
    this._curves.reverse();
  }
  /** Evaluate an indexed curve at a fraction.  Return as a CurveLocationDetail that indicates the primitive.
   */
  public primitiveIndexAndFractionToCurveLocationDetailPointAndDerivative(index: number, fraction: number, cyclic: boolean = false, result?: CurveLocationDetail): CurveLocationDetail | undefined {
    const primitive = this.cyclicCurvePrimitive(index, cyclic);
    if (primitive) {
      return CurveLocationDetail.createCurveEvaluatedFractionPointAndDerivative(primitive, fraction, result);
    }
    return undefined;
  }
}

/**
 * * A `BagOfCurves` object is a collection of `AnyCurve` objects.
 * * A `BagOfCurves` has no implied properties such as being planar.
 * @public
 */
export class BagOfCurves extends CurveCollection {
  /** String name for schema properties */
  public readonly curveCollectionType = "bagOfCurves";

  /** test if `other` is an instance of `BagOfCurves` */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof BagOfCurves; }
  /** Array of children.
   * * No restrictions on type.
   */
  protected _children: AnyCurve[];
  /** Construct an empty `BagOfCurves` */
  public constructor() { super(); this._children = []; }
  /** Return the (reference to) array of children */
  public override get children(): AnyCurve[] { return this._children; }
  /** create with given curves. */
  public static create(...data: AnyCurve[]): BagOfCurves {
    const result = new BagOfCurves();
    for (const child of data) {
      result.tryAddChild(child);
    }
    return result;
  }
  /** Return the boundary type (0) of a corresponding  MicroStation CurveVector */
  public dgnBoundaryType(): number { return 0; }
  /** invoke `processor.announceBagOfCurves(this, indexInParent);` */
  public announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent: number = -1): void {
    return processor.announceBagOfCurves(this, indexInParent);
  }
  /** Clone all children in stroked form. */
  public cloneStroked(options?: StrokeOptions): BagOfCurves {
    const clone = new BagOfCurves();
    let child;
    for (child of this.children) {
      if (child instanceof CurvePrimitive) {
        const ls = LineString3d.create();
        child.emitStrokes(ls, options);
        if (ls)
          clone.children.push(ls);
      } else if (child instanceof CurveCollection) {
        const childStrokes = child.cloneStroked(options);
        if (childStrokes)
          clone.children.push(childStrokes);
      }
    }
    return clone;
  }
  /** Return an empty `BagOfCurves` */
  public cloneEmptyPeer(): BagOfCurves { return new BagOfCurves(); }
  /** Add a child  */
  public tryAddChild(child: AnyCurve | undefined): boolean {
    if (child)
      this._children.push(child);
    return true;
  }
  /** Get a child by index */
  public getChild(i: number): AnyCurve | undefined {
    if (i < this._children.length)
      return this._children[i];
    return undefined;
  }
  /** Second step of double dispatch:  call `handler.handleBagOfCurves(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleBagOfCurves(this);
  }
}
/**
 * * Options to control method `RegionOps.consolidateAdjacentPrimitives`
 * @public
 */
export class ConsolidateAdjacentCurvePrimitivesOptions {
  /** True to consolidated linear geometry   (e.g. separate LineSegment3d and LineString3d) into LineString3d */
  public consolidateLinearGeometry: boolean = true;
  /** True to consolidate contiguous arcs */
  public consolidateCompatibleArcs: boolean = true;
  /** Tolerance for collapsing identical points */
  public duplicatePointTolerance = Geometry.smallMetricDistance;
  /** Tolerance for removing interior colinear points. */
  public colinearPointTolerance = Geometry.smallMetricDistance;
}
