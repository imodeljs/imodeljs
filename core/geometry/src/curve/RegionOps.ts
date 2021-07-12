/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { Geometry } from "../Geometry";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { IndexedXYZCollection } from "../geometry3d/IndexedXYZCollection";
import { Point3dArrayCarrier } from "../geometry3d/Point3dArrayCarrier";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { PolylineCompressionContext } from "../geometry3d/PolylineCompressionByEdgeOffset";
import { Range3d } from "../geometry3d/Range";
import { SortablePolygon } from "../geometry3d/SortablePolygon";
import { Transform } from "../geometry3d/Transform";
import { MomentData } from "../geometry4d/MomentData";
import { Polyface } from "../polyface/Polyface";
import { PolyfaceBuilder } from "../polyface/PolyfaceBuilder";
import { HalfEdge, HalfEdgeGraph, HalfEdgeMask } from "../topology/Graph";
import { LineStringDataVariant, MultiLineStringDataVariant, Triangulator } from "../topology/Triangulation";
import { ChainCollectorContext } from "./ChainCollectorContext";
import { AnyCurve, AnyRegion } from "./CurveChain";
import { BagOfCurves, ConsolidateAdjacentCurvePrimitivesOptions, CurveChain, CurveCollection } from "./CurveCollection";
import { CurveCurve } from "./CurveCurve";
import { CurvePrimitive } from "./CurvePrimitive";
import { CurveWireMomentsXYZ } from "./CurveWireMomentsXYZ";
import { CurveChainWireOffsetContext, JointOptions, PolygonWireOffsetContext } from "./internalContexts/PolygonOffsetContext";
import { LineString3d } from "./LineString3d";
import { Loop, SignedLoops } from "./Loop";
import { Path } from "./Path";
import { ConsolidateAdjacentCurvePrimitivesContext } from "./Query/ConsolidateAdjacentPrimitivesContext";
import { CurveSplitContext } from "./Query/CurveSplitContext";
import { PointInOnOutContext } from "./Query/InOutTests";
import { PlanarSubdivision } from "./Query/PlanarSubdivision";
import { RegionMomentsXY } from "./RegionMomentsXY";
import { OffsetHelpers } from "./internalContexts/MultiChainCollector";
import { GeometryQuery } from "./GeometryQuery";
import { RegionBooleanContext, RegionGroupOpType, RegionOpsFaceToFaceSearch } from "./RegionOpsClassificationSweeps";
import { UnionRegion } from "./UnionRegion";
import { HalfEdgeGraphSearch } from "../topology/HalfEdgeGraphSearch";
import { ParityRegion } from "./ParityRegion";
/**
 * Possible return types from
 * @public
 */
export type ChainTypes = CurvePrimitive | Path | BagOfCurves | Loop | undefined;

/**
 * * `properties` is a string with special characters indicating
 *   * "U" -- contains unmerged stick data
 *   * "M" -- merged
 *   * "R" -- regularized
 *   * "X" -- has exterior markup
 * @internal
 */
export type GraphCheckPointFunction = (name: string, graph: HalfEdgeGraph, properties: string, extraData?: any) => any;
/**
 * Enumeration of the binary operation types for a booleans among regions
 * @public
 */
export enum RegionBinaryOpType {
  Union = 0,
  Parity = 1,
  Intersection = 2,
  AMinusB = 3,
  BMinusA = 4,
}

/**
 * class `RegionOps` has static members for calculations on regions (areas).
 * * Regions are represented by these `CurveCollection` subclasses:
 * * `Loop` -- a single loop
 * * `ParityRegion` -- a collection of loops, interpreted by parity rules.
 *    * The common "One outer loop and many Inner loops" is a parity region.
 * * `UnionRegion` -- a collection of `Loop` and `ParityRegion` objects understood as a (probably disjoint) union.
 * @beta
 */
export class RegionOps {
  /**
   * Return moment sums for a loop, parity region, or union region.
   * * If `rawMomentData` is the MomentData returned by computeXYAreaMoments, convert to principal axes and moments with
   *    call `principalMomentData = MomentData.inertiaProductsToPrincipalAxes (rawMomentData.origin, rawMomentData.sums);`
   * @param root any Loop, ParityRegion, or UnionRegion.
   */
  public static computeXYAreaMoments(root: AnyRegion): MomentData | undefined {
    const handler = new RegionMomentsXY();
    const result = root.dispatchToGeometryHandler(handler);
    if (result instanceof MomentData) {
      result.shiftOriginAndSumsToCentroidOfSums();
      return result;
    }
    return undefined;
  }

  /**
   * Return an xy area for a loop, parity region, or union region.
   * * If `rawMomentData` is the MomentData returned by computeXYAreaMoments, convert to principal axes and moments with
   *    call `principalMomentData = MomentData.inertiaProductsToPrincipalAxes (rawMomentData.origin, rawMomentData.sums);`
   * @param root any Loop, ParityRegion, or UnionRegion.
   */
  public static computeXYArea(root: AnyRegion): number | undefined {
    const handler = new RegionMomentsXY();
    const result = root.dispatchToGeometryHandler(handler);
    if (result instanceof MomentData) {
      return result.quantitySum;
    }
    return undefined;
  }
  /** Return MomentData with the sums of wire moments.
   * * If `rawMomentData` is the MomentData returned by computeXYAreaMoments, convert to principal axes and moments with
   *    call `principalMomentData = MomentData.inertiaProductsToPrincipalAxes (rawMomentData.origin, rawMomentData.sums);`
   */
  public static computeXYZWireMomentSums(root: AnyCurve): MomentData | undefined {
    const handler = new CurveWireMomentsXYZ();
    handler.visitLeaves(root);
    const result = handler.momentData;
    result.shiftOriginAndSumsToCentroidOfSums();
    return result;
  }

  /**
   * * create loops in the graph.
   * @internal
   */
  public static addLoopsToGraph(graph: HalfEdgeGraph, data: MultiLineStringDataVariant, announceIsolatedLoop: (graph: HalfEdgeGraph, seed: HalfEdge) => void) {
    if (data instanceof Loop) {
      const points = data.getPackedStrokes();
      if (points)
        this.addLoopsToGraph(graph, points, announceIsolatedLoop);
    } else if (data instanceof ParityRegion) {
      for (const child of data.children) {
        const points = child.getPackedStrokes();
        if (points)
          this.addLoopsToGraph(graph, points, announceIsolatedLoop);
      }
    } else if (data instanceof IndexedXYZCollection) {
      const loopSeed = Triangulator.directCreateFaceLoopFromCoordinates(graph, data);
      if (loopSeed !== undefined)
        announceIsolatedLoop(graph, loopSeed);
    } else if (Array.isArray(data)) {
      if (data.length > 0) {
        if (Point3d.isAnyImmediatePointType(data[0])) {
          const loopSeed = Triangulator.directCreateFaceLoopFromCoordinates(graph, data as LineStringDataVariant);
          if (loopSeed !== undefined)
            announceIsolatedLoop(graph, loopSeed);

        } else if (data[0] instanceof IndexedXYZCollection) {
          for (const loop of data) {
            const loopSeed = Triangulator.directCreateFaceLoopFromCoordinates(graph, loop as IndexedXYZCollection);
            if (loopSeed !== undefined)
              announceIsolatedLoop(graph, loopSeed);
          }
        } else {
          for (const child of data) {
            if (Array.isArray(child))
              this.addLoopsToGraph(graph, child as MultiLineStringDataVariant, announceIsolatedLoop);
          }
        }
      }
    }
  }
  /** Add multiple loops to a graph.
   * * Apply edgeTag and mask to each edge.
   * @internal
   */
  public static addLoopsWithEdgeTagToGraph(graph: HalfEdgeGraph, data: MultiLineStringDataVariant, mask: HalfEdgeMask, edgeTag: any): HalfEdge[] | undefined {
    const loopSeeds: HalfEdge[] = [];
    this.addLoopsToGraph(graph, data, (_graph: HalfEdgeGraph, seed: HalfEdge) => {
      if (seed) {
        loopSeeds.push(seed);
        seed.setMaskAndEdgeTagAroundFace(mask, edgeTag, true);
      }
    });
    if (loopSeeds.length > 0)
      return loopSeeds;
    return undefined;
  }
  /**
   * Given a graph just produced by booleans, convert to a polyface
   * * "just produced" implies exterior face markup.
   *
   * @param graph
   * @param triangulate
   */
  private static finishGraphToPolyface(graph: HalfEdgeGraph | undefined, triangulate: boolean): Polyface | undefined {
    if (graph) {
      if (triangulate) {
        Triangulator.triangulateAllPositiveAreaFaces(graph);
        Triangulator.flipTriangles(graph);
      }
      return PolyfaceBuilder.graphToPolyface(graph);
    }
    return undefined;
  }
  /**
   * return a polyface containing the area union of two XY regions.
   * * Within each region, in and out is determined by parity rules.
   *   * Any face that is an odd number of crossings from the far outside is IN
   *   * Any face that is an even number of crossings from the far outside is OUT
   * @param loopsA first set of loops
   * @param loopsB second set of loops
   */
  public static polygonXYAreaIntersectLoopsToPolyface(loopsA: MultiLineStringDataVariant, loopsB: MultiLineStringDataVariant, triangulate: boolean = false): Polyface | undefined {
    const graph = RegionOpsFaceToFaceSearch.doPolygonBoolean(loopsA, loopsB,
      (inA: boolean, inB: boolean) => (inA && inB),
      this._graphCheckPointFunction);
    return this.finishGraphToPolyface(graph, triangulate);
  }

  /**
   * return a polyface containing the area union of two XY regions.
   * * Within each region, in and out is determined by parity rules.
   *   * Any face that is an odd number of crossings from the far outside is IN
   *   * Any face that is an even number of crossings from the far outside is OUT
   * @param loopsA first set of loops
   * @param loopsB second set of loops
   */
  public static polygonXYAreaUnionLoopsToPolyface(loopsA: MultiLineStringDataVariant, loopsB: MultiLineStringDataVariant, triangulate: boolean = false): Polyface | undefined {
    const graph = RegionOpsFaceToFaceSearch.doPolygonBoolean(loopsA, loopsB,
      (inA: boolean, inB: boolean) => (inA || inB),
      this._graphCheckPointFunction);
    return this.finishGraphToPolyface(graph, triangulate);
  }
  /**
   * return a polyface containing the area difference of two XY regions.
   * * Within each region, in and out is determined by parity rules.
   *   * Any face that is an odd number of crossings from the far outside is IN
   *   * Any face that is an even number of crossings from the far outside is OUT
   * @param loopsA first set of loops
   * @param loopsB second set of loops
   */
  public static polygonXYAreaDifferenceLoopsToPolyface(loopsA: MultiLineStringDataVariant, loopsB: MultiLineStringDataVariant, triangulate: boolean = false): Polyface | undefined {
    const graph = RegionOpsFaceToFaceSearch.doPolygonBoolean(loopsA, loopsB,
      (inA: boolean, inB: boolean) => (inA && !inB),
      this._graphCheckPointFunction);
    return this.finishGraphToPolyface(graph, triangulate);
  }

  /**
   * return areas defined by a boolean operation.
   * * If there are multiple regions in loopsA, they are treated as a union.
   * * If there are multiple regions in loopsB, they are treated as a union.
   * @param loopsA first set of loops
   * @param loopsB second set of loops
   * @param operation indicates Union, Intersection, Parity, AMinusB, or BMinusA
   * @alpha
   */
  public static regionBooleanXY(loopsA: AnyRegion | AnyRegion[] | undefined, loopsB: AnyRegion | AnyRegion[] | undefined, operation: RegionBinaryOpType): AnyRegion | undefined {
    // create and load a context . . .
    const result = UnionRegion.create();
    const context = RegionBooleanContext.create(RegionGroupOpType.Union, RegionGroupOpType.Union);
    context.addMembers(loopsA, loopsB);
    context.annotateAndMergeCurvesInGraph();
    context.runClassificationSweep(operation, (_graph: HalfEdgeGraph, face: HalfEdge, faceType: -1 | 0 | 1, area: number) => {
      if (face.countEdgesAroundFace() < 3 && Geometry.isSameCoordinate(area, 0)) // NEED BETTER TOLERANCE
        return;
      if (faceType === 1) {
        const loop = PlanarSubdivision.createLoopInFace(face);
        if (loop)
          result.tryAddChild(loop);
      }
    });
    return result;
  }

  /**
   * return a polyface whose facets area a boolean operation between the input regions.
   * * Each of the two inputs is an array of multiple loops or parity regions.
   *   * Within each of these input arrays, the various entries (loop or set of loops) are interpreted as a union.
   * * In each "array of loops and parity regions", each entry inputA[i] or inputB[i] is one of:
   *    * A simple loop, e.g. array of Point3d.
   *    * Several simple loops, each of which is an array of Point3d.
   * @param loopsA first set of loops
   * @param loopsB second set of loops
   */
  public static polygonBooleanXYToPolyface(inputA: MultiLineStringDataVariant[], operation: RegionBinaryOpType,
    inputB: MultiLineStringDataVariant[], triangulate: boolean = false): Polyface | undefined {
    const graph = RegionOpsFaceToFaceSearch.doBinaryBooleanBetweenMultiLoopInputs(
      inputA, RegionGroupOpType.Union,
      operation,
      inputB, RegionGroupOpType.Union);
    return this.finishGraphToPolyface(graph, triangulate);
  }
  /**
   * return loops of linestrings around areas of a boolean operation between the input regions.
   * * Each of the two inputs is an array of multiple loops or parity regions.
   *   * Within each of these input arrays, the various entries (loop or set of loops) are interpreted as a union.
   * * In each "array of loops and parity regions", each entry inputA[i] or inputB[i] is one of:
   *    * A simple loop, e.g. array of Point3d.
   *    * Several simple loops, each of which is an array of Point3d.
   * @param loopsA first set of loops
   * @param loopsB second set of loops
   */
  public static polygonBooleanXYToLoops(
    inputA: MultiLineStringDataVariant[],
    operation: RegionBinaryOpType,
    inputB: MultiLineStringDataVariant[]): AnyRegion | undefined {
    const graph = RegionOpsFaceToFaceSearch.doBinaryBooleanBetweenMultiLoopInputs(
      inputA, RegionGroupOpType.Union,
      operation,
      inputB, RegionGroupOpType.Union);
    if (!graph)
      return undefined;
    const loopEdges = HalfEdgeGraphSearch.collectExtendedBoundaryLoopsInGraph(graph, HalfEdgeMask.EXTERIOR);
    const allLoops: Loop[] = [];
    for (const graphLoop of loopEdges) {
      const points = new GrowableXYZArray();
      for (const edge of graphLoop)
        points.pushXYZ(edge.x, edge.y, edge.z);
      const loop = Loop.create();
      loop.tryAddChild(LineString3d.createCapture(points));
      allLoops.push(loop);
    }
    return RegionOps.sortOuterAndHoleLoopsXY(allLoops);
  }

  /** Construct a wire (not area!!) that is offset from given polyline or polygon.
   * * This is a simple wire offset, not an area.
   * * The construction algorithm attempts to eliminate some self-intersections within the offsets, but does not guarantee a simple area offset.
   * * The construction algorithm is subject to being changed, resulting in different (hopefully better) self-intersection behavior on the future.
   * @param points a single loop or path
   * @param wrap true to include wraparound
   * @param offsetDistance distance of offset from wire.  Positive is left.
   */
  public static constructPolygonWireXYOffset(points: Point3d[], wrap: boolean, offsetDistance: number): CurveCollection | undefined {
    const context = new PolygonWireOffsetContext();
    return context.constructPolygonWireXYOffset(points, wrap, offsetDistance);
  }
  /**
   * Construct curves that are offset from a Path or Loop
   * * The construction will remove "some" local effects of features smaller than the offset distance, but will not detect self intersection among widely separated edges.
   * * Offset distance is defined as positive to the left.
   * * If offsetDistanceOrOptions is given as a number, default options are applied.
   * * When the offset needs to do an "outside" turn, the first applicable construction is applied:
   *   * If the turn is larger than `options.minArcDegrees`, a circular arc is constructed.
   *   * if the turn is larger than `options.maxChamferDegrees`, the turn is constructed as a sequence of straight lines that are
   *      * outside the arc
   *      * have uniform turn angle less than `options.maxChamferDegrees`
   *      * each line segment (except first and last) touches the arc at its midpoint.
   *   * Otherwise the prior and successor curves are extended to simple intersection.
   * @param curves input curves
   * @param offsetDistanceOrOptions offset controls.
   */
  public static constructCurveXYOffset(curves: Path | Loop, offsetDistanceOrOptions: number | JointOptions): CurveCollection | undefined {
    const options = JointOptions.create(offsetDistanceOrOptions);
    return CurveChainWireOffsetContext.constructCurveXYOffset(curves, options);
  }
  /**
   * Test if point (x,y) is IN, OUT or ON a polygon.
   * @return (1) for in, (-1) for OUT, (0) for ON
   * @param x x coordinate
   * @param y y coordinate
   * @param points array of xy coordinates.
   */
  public static testPointInOnOutRegionXY(curves: AnyRegion, x: number, y: number): number {
    return PointInOnOutContext.testPointInOnOutRegionXY(curves, x, y);
  }
  /** Create curve collection of subtype determined by gaps between the input curves.
   * * If (a) wrap is requested and (b) all curves connect head-to-tail (including wraparound), assemble as a `loop`.
   * * If all curves connect head-to-tail except for closure, return a `Path`.
   * * If there are internal gaps, return a `BagOfCurves`
   * * If input array has zero length, return undefined.
   */
  public static createLoopPathOrBagOfCurves(curves: CurvePrimitive[], wrap: boolean = true, consolidateAdjacentPrimitives: boolean = false): CurveCollection | undefined {
    const n = curves.length;
    if (n === 0)
      return undefined;
    let maxGap = 0.0;
    let isPath = false;
    if (wrap)
      maxGap = Geometry.maxXY(maxGap, curves[0].startPoint().distance(curves[n - 1].endPoint()));
    for (let i = 0; i + 1 < n; i++)
      maxGap = Geometry.maxXY(maxGap, curves[i].endPoint().distance(curves[i + 1].startPoint()));
    let collection: Loop | Path | BagOfCurves;
    if (Geometry.isSmallMetricDistance(maxGap)) {
      collection = wrap ? Loop.create() : Path.create();
      isPath = true;
    } else {
      collection = BagOfCurves.create();
    }
    for (const c of curves)
      collection.tryAddChild(c);
    if (isPath && consolidateAdjacentPrimitives)
      RegionOps.consolidateAdjacentPrimitives(collection);
    return collection;
  }

  private static _graphCheckPointFunction?: GraphCheckPointFunction;
  /**
   * Announce Checkpoint function for use during booleans
   * @internal
   */
  public static setCheckPointFunction(f?: GraphCheckPointFunction) { this._graphCheckPointFunction = f; }
  /**
   * * Find all intersections among curves in `curvesToCut` and `cutterCurves`
   * * Return fragments of `curvesToCut`.
   * * For a  `Loop`, `ParityRegion`, or `UnionRegion` in `curvesToCut`
   *    * if it is never cut by any `cutter` curve, it will be left unchanged.
   *    * if cut, the input is downgraded to a set of `Path` curves joining at the cut points.
   * * All cutting is "as viewed in the xy plane"
   */
  public static cloneCurvesWithXYSplitFlags(curvesToCut: CurvePrimitive | CurveCollection | undefined, cutterCurves: CurveCollection): CurveCollection | CurvePrimitive | undefined {
    return CurveSplitContext.cloneCurvesWithXYSplitFlags(curvesToCut, cutterCurves);

  }
  /**
   * Create paths assembled from many curves.
   * * Assemble consecutive curves NOT separated by either end flags or gaps into paths.
   * * Return simplest form -- single primitive, single path, or bag of curves.
   * @param curves
   */
  public static splitToPathsBetweenFlagBreaks(source: CurveCollection | CurvePrimitive | undefined,
    makeClones: boolean): BagOfCurves | Path | CurvePrimitive | Loop | undefined {
    if (source === undefined)
      return undefined;
    if (source instanceof CurvePrimitive)
      return source;
    // source is a collection .  ..
    const primitives = source.collectCurvePrimitives();
    const chainCollector = new ChainCollectorContext(makeClones);
    for (const primitive of primitives) {
      chainCollector.announceCurvePrimitive(primitive);
    }
    return chainCollector.grabResult();
  }
  /**
   * * Restructure curve fragments as chains and offsets
   * * Return object with named chains, insideOffsets, outsideOffsets
   * * BEWARE that if the input is not a loop the classification of outputs is suspect.
   * @param fragments fragments to be chained
   * @param offsetDistance offset distance.
   */
  public static collectInsideAndOutsideOffsets(fragments: GeometryQuery[], offsetDistance: number, gapTolerance: number): { insideOffsets: GeometryQuery[], outsideOffsets: GeometryQuery[], chains: ChainTypes } {
    return OffsetHelpers.collectInsideAndOutsideOffsets(fragments, offsetDistance, gapTolerance);
  }
  /**
   * * Restructure curve fragments as chains
   * * Return the chains, possibly wrapped in BagOfCurves if there multiple chains.
   * @param fragments fragments to be chained
   * @param offsetDistance offset distance.
   */
  public static collectChains(fragments: GeometryQuery[], gapTolerance: number = Geometry.smallMetricDistance): ChainTypes {
    return OffsetHelpers.collectChains(fragments, gapTolerance);
  }

  /**
   * * Find intersections of `curvesToCut` with boundaries of `region`.
   * * Break `curvesToCut` into parts inside, outside, and coincident.
   * * Return all fragments, split among `insideParts`, `outsideParts`, and `coincidentParts` in the output object.
   */
  public static splitPathsByRegionInOnOutXY(curvesToCut: CurveCollection | CurvePrimitive | undefined, region: AnyRegion): { insideParts: AnyCurve[], outsideParts: AnyCurve[], coincidentParts: AnyCurve[] } {
    const result = { insideParts: [], outsideParts: [], coincidentParts: [] };
    const pathWithIntersectionMarkup = RegionOps.cloneCurvesWithXYSplitFlags(curvesToCut, region);
    const splitPaths = RegionOps.splitToPathsBetweenFlagBreaks(pathWithIntersectionMarkup, true);
    if (splitPaths instanceof CurveCollection) {
      for (const child of splitPaths.children) {
        const pointOnChild = CurveCollection.createCurveLocationDetailOnAnyCurvePrimitive(child);
        if (pointOnChild) {
          const inOnOut = RegionOps.testPointInOnOutRegionXY(region, pointOnChild.point.x, pointOnChild.point.y);
          pushToInOnOutArrays(child, inOnOut, result.outsideParts, result.coincidentParts, result.insideParts);
        }
      }
    } else if (splitPaths instanceof CurvePrimitive) {
      const pointOnChild = CurveCollection.createCurveLocationDetailOnAnyCurvePrimitive(splitPaths);
      if (pointOnChild) {
        const inOnOut = RegionOps.testPointInOnOutRegionXY(region, pointOnChild.point.x, pointOnChild.point.y);
        pushToInOnOutArrays(splitPaths, inOnOut, result.outsideParts, result.coincidentParts, result.insideParts);
      }
    }
    return result;
  }
  /** Test if `data` is one of several forms of a rectangle.
   * * If so, return transform with
   *   * origin at one corner
   *   * x and y columns extend along two adjacent sides
   *   * z column is unit normal.
   * * The recognized data forms for simple analysis of points are:
   *   * LineString
   *   * Loop containing rectangle content
   *   * Path containing rectangle content
   *   * Array of Point3d[]
   *   * IndexedXYZCollection
   * * Points are considered a rectangle if
   *   * Within the first 4 points
   *     * vectors from 0 to 1 and 0 to 3 are perpendicular and have a non-zero cross product
   *     * vectors from 0 to 3 and 1 to 2 are the same
   *  * optionally require a 5th point that closes back to point0
   *  * If there are other than the basic number of points (4 or 5) the data
   */
  public static rectangleEdgeTransform(data: AnyCurve | Point3d[] | IndexedXYZCollection, requireClosurePoint: boolean = true): Transform | undefined {
    if (data instanceof LineString3d) {
      return this.rectangleEdgeTransform(data.packedPoints);
    } else if (data instanceof IndexedXYZCollection) {
      let dataToUse;
      if (requireClosurePoint && data.length === 5) {
        if (!Geometry.isSmallMetricDistance(data.distanceIndexIndex(0, 4)!))
          return undefined;
        dataToUse = data;
      } else if (!requireClosurePoint && data.length === 4)
        dataToUse = data;
      else if (data.length < (requireClosurePoint ? 5 : 4)) {
        return undefined;
      } else {
        dataToUse = GrowableXYZArray.create(data);
        PolylineCompressionContext.compressInPlaceByShortEdgeLength(dataToUse, Geometry.smallMetricDistance);
      }

      const vector01 = dataToUse.vectorIndexIndex(0, 1)!;
      const vector03 = dataToUse.vectorIndexIndex(0, 3)!;
      const vector12 = dataToUse.vectorIndexIndex(1, 2)!;
      const normalVector = vector01.crossProduct(vector03);
      if (normalVector.normalizeInPlace()
        && vector12.isAlmostEqual(vector03)
        && vector01.isPerpendicularTo(vector03)) {
        return Transform.createOriginAndMatrixColumns(dataToUse.getPoint3dAtUncheckedPointIndex(0), vector01, vector03, normalVector);
      }
    } else if (Array.isArray(data)) {
      return this.rectangleEdgeTransform(new Point3dArrayCarrier(data), requireClosurePoint);
    } else if (data instanceof Loop && data.children.length === 1 && data.children[0] instanceof LineString3d) {
      return this.rectangleEdgeTransform(data.children[0].packedPoints, true);
    } else if (data instanceof Path && data.children.length === 1 && data.children[0] instanceof LineString3d) {
      return this.rectangleEdgeTransform(data.children[0].packedPoints, requireClosurePoint);
    } else if (data instanceof CurveChain) {
      if (!data.checkForNonLinearPrimitives()) {
        // const linestring = LineString3d.create();
        const strokes = data.getPackedStrokes();
        if (strokes) {
          return this.rectangleEdgeTransform(strokes);
        }
      }
    }
    return undefined;
  }
  /**
   * Look for and simplify:
   * * Contiguous `LineSegment3d` and `LineString3d` objects.
   *   * collect all points
   *   * eliminate duplicated points
   *   * eliminate points colinear with surrounding points.
   *  * Contiguous concentric circular or elliptic arcs
   *   * combine angular ranges
   * @param curves Path or loop (or larger collection containing paths and loops) to be simplified
   * @param options options for tolerance and selective simplification.
   */
  public static consolidateAdjacentPrimitives(curves: CurveCollection, options?: ConsolidateAdjacentCurvePrimitivesOptions) {
    const context = new ConsolidateAdjacentCurvePrimitivesContext(options);
    curves.dispatchToGeometryHandler(context);
  }
  /**
   * If reverse loops as necessary to make them all have CCW orientation for given outward normal.
   * * Return an array of arrays which capture the input pointers.
   * * In each first level array:
   *    * The first loop is an outer loop.
   *    * all subsequent loops are holes
   *    * The outer loop is CCW
   *    * The holes are CW.
   * * Call PolygonOps.sortOuterAndHoleLoopsXY to have the result returned as an array of arrays of polygons.
   * @param loops multiple loops to sort and reverse.
   */
  public static sortOuterAndHoleLoopsXY(loops: Array<Loop | IndexedXYZCollection>): AnyRegion {
    const loopAndArea: SortablePolygon[] = [];
    for (const candidate of loops) {
      if (candidate instanceof Loop)
        SortablePolygon.pushLoop(loopAndArea, candidate);
      else if (candidate instanceof IndexedXYZCollection) {
        const loop = Loop.createPolygon(candidate);
        SortablePolygon.pushLoop(loopAndArea, loop);
      }
    }
    return SortablePolygon.sortAsAnyRegion(loopAndArea);
  }
  /**
   * Find all areas bounded by the unstructured, possibly intersection curves.
   * * In `curvesAndRegions`, Loop/ParityRegion/UnionRegion contribute curve primitives.
   * @param curvesAndRegions Any collection of curves.
   * @alpha
   */
  public static constructAllXYRegionLoops(curvesAndRegions: AnyCurve | AnyCurve[]): SignedLoops[] {
    const primitivesA = RegionOps.collectCurvePrimitives(curvesAndRegions, undefined, true);
    const primitivesB = this.expandLineStrings(primitivesA);
    const range = this.curveArrayRange(primitivesB);
    const intersections = CurveCurve.allIntersectionsAmongPrimitivesXY(primitivesB);
    const graph = PlanarSubdivision.assembleHalfEdgeGraph(primitivesB, intersections);
    return PlanarSubdivision.collectSignedLoopSetsInHalfEdgeGraph(graph, 1.0e-12 * range.xLength() * range.yLength());
  }

  /**
   * collect all `CurvePrimitives` in loosely typed input.
   * * This (always) recurses into primitives within collections (Path, Loop, ParityRegion, UnionRegion)
   * * It (optionally) recurses to hidden primitives within primitives (i.e. CurveChainWithDistanceIndex)
   * * If collectorArray is given, it is NOT cleared -- primitives are appended.
   * @param candidates array of various CurvePrimitive and CurveCollection
   * @param smallestPossiblePrimitives if false, leave CurveChainWithDistanceIndex as single primitives.  If true, recurse to their children.
   */
  public static collectCurvePrimitives(candidates: AnyCurve | AnyCurve[], collectorArray?: CurvePrimitive[],
    smallestPossiblePrimitives: boolean = false,
    explodeLinestrings: boolean = false): CurvePrimitive[] {
    const results: CurvePrimitive[] = collectorArray === undefined ? [] : collectorArray;
    if (candidates instanceof CurvePrimitive) {
      candidates.collectCurvePrimitives(results, smallestPossiblePrimitives, explodeLinestrings);
    } else if (candidates instanceof CurveCollection) {
      candidates.collectCurvePrimitives(results, smallestPossiblePrimitives, explodeLinestrings);
    } else if (Array.isArray(candidates)) {
      for (const c of candidates) {
        this.collectCurvePrimitives(c, results, smallestPossiblePrimitives, explodeLinestrings);
      }
    }
    return results;
  }
  /**
   * Copy primitive pointers from candidates to result array.
   * * replace LineString3d by individual LineSegment3d.
   * * all others unchanged.
   * @param candidates
   */
  public static expandLineStrings(candidates: CurvePrimitive[]): CurvePrimitive[] {
    const result: CurvePrimitive[] = [];
    for (const c of candidates) {
      if (c instanceof LineString3d) {
        for (let i = 0; i + 1 < c.packedPoints.length; i++) {
          const q = c.getIndexedSegment(i);
          if (q !== undefined)
            result.push(q);
        }
      } else {
        result.push(c);
      }
    }
    return result;
  }
  /**
   * Return the overall range of given curves.
   * @param curves candidate curves
   */
  public static curveArrayRange(data: any, worldToLocal?: Transform): Range3d {
    const range = Range3d.create();
    if (data instanceof GeometryQuery)
      data.extendRange(range, worldToLocal);
    else if (Array.isArray(data)) {
      for (const c of data) {
        if (c instanceof GeometryQuery)
          c.extendRange(range, worldToLocal);
        else if (c instanceof Point3d)
          range.extendPoint(c, worldToLocal);
        else if (c instanceof GrowableXYZArray)
          range.extendRange(c.getRange(worldToLocal));
        else if (Array.isArray(c))
          range.extendRange(this.curveArrayRange(c, worldToLocal));
      }
    }
    return range;
  }
}

function pushToInOnOutArrays(curve: AnyCurve, select: number, arrayNegative: AnyCurve[], array0: AnyCurve[], arrayPositive: AnyCurve[]) {
  if (select > 0)
    arrayPositive.push(curve);
  else if (select < 0)
    arrayNegative.push(curve);
  else
    array0.push(curve);
}
