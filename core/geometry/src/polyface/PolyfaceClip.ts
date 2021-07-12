/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Polyface
 */

// import { Point2d } from "./Geometry2d";
/* eslint-disable @typescript-eslint/naming-convention, no-empty */
import { ClipPlane } from "../clipping/ClipPlane";
import { ConvexClipPlaneSet } from "../clipping/ConvexClipPlaneSet";
import { UnionOfConvexClipPlaneSets } from "../clipping/UnionOfConvexClipPlaneSets";
import { LineString3d } from "../curve/LineString3d";
import { PlaneAltitudeEvaluator } from "../Geometry";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { IndexedXYZCollectionPolygonOps, PolygonOps } from "../geometry3d/PolygonOps";
import { Range1d, Range2d, Range3d } from "../geometry3d/Range";
import { GrowableXYZArrayCache } from "../geometry3d/ReusableObjectCache";
import { SweepContour } from "../solid/SweepContour";
import { ChainMergeContext } from "../topology/ChainMerge";
import { RangeSearch } from "./multiclip/RangeSearch";
// import { Point3d, Vector3d, Point2d } from "./PointVector";
import { IndexedPolyface, Polyface, PolyfaceVisitor } from "./Polyface";
import { PolyfaceBuilder } from "./PolyfaceBuilder";
import { PolyfaceQuery } from "./PolyfaceQuery";

  /**
   * carrier for a point array with an index into UnionOfConvexClipPlaneSets
   * @private
   */
   class ClipCandidate {
    public nextConvexSetIndex: number;
    public points: GrowableXYZArray;
    public constructor(points: GrowableXYZArray, nextConvexSetIndex: number) {
      this.nextConvexSetIndex = nextConvexSetIndex;
      this.points = points;
    }
  }

/**
 * A pair of PolyfaceBuilder objects, for use by clippers that emit inside and outside parts.
 * * There are nominally 4 builders:
 *   * builderA collects simple "inside" clip.
 *   * builderB collects simple "outside" clip.
 *   * builderA1 collects "side" clip for inside.
 *   * builderB1 collets "side" clip for outside.
 * * `static ClippedPolyfaceBuilders.create(keepInside, keepOutside)` initializes `builderA` and `builderB` (each optionally to undefined), with undefined `builderA1` and `builderB1`
 * * `builders.enableSideBuilders()` makes `builderA1` and `builderB1` match `builderA` and `builderB`.
 * * construction methods aim their facets at appropriate builders if defined.
 * * @public
 */
export class ClippedPolyfaceBuilders {
  /** An available builder.  Typically the "inside" parts */
  public builderA?: PolyfaceBuilder;
  /** An available builder.  Typically the "outside" parts */
  public builderB?: PolyfaceBuilder;
  /** request to construct cut faces */
  public buildClosureFaces?: boolean;
  private constructor(builderA: PolyfaceBuilder | undefined, builderB: PolyfaceBuilder | undefined, buildClosureFaces: boolean = false) {
    this.builderA = builderA;
    this.builderB = builderB;
    this.buildClosureFaces = buildClosureFaces;
  }
  /** Simple create with default options on builder. */
  public static create(keepInside: boolean = true, keepOutside: boolean = false, buildSideFaces: boolean = false) {
    return new ClippedPolyfaceBuilders(keepInside ? PolyfaceBuilder.create() : undefined, keepOutside ? PolyfaceBuilder.create() : undefined, buildSideFaces);
  }

  public claimPolyface(selector: 0 | 1, fixup: boolean): IndexedPolyface | undefined {
    const builder = selector === 0 ? this.builderA : this.builderB;
    if (builder) {
      let polyface = builder.claimPolyface();
      if (fixup) {
        polyface = PolyfaceQuery.cloneWithTVertexFixup(polyface);
      }
      return polyface;
    }
    return undefined;
  }
}
/** PolyfaceClip is a static class gathering operations using Polyfaces and clippers.
 * @public
 */
export class PolyfaceClip {
  /** Clip each facet of polyface to the ClipPlane.
   * * Return all surviving clip as a new mesh.
   * * WARNING: The new mesh is "points only" -- parameters, normals, etc are not interpolated
   */
  public static clipPolyfaceClipPlaneWithClosureFace(polyface: Polyface, clipper: ClipPlane, insideClip: boolean = true, buildClosureFaces: boolean = true) {
    return this.clipPolyfaceClipPlane(polyface, clipper, insideClip, buildClosureFaces);
  }
  /** Clip each facet of polyface to the ClipPlane.
   * * Return all surviving clip as a new mesh.
   * * WARNING: The new mesh is "points only" -- parameters, normals, etc are not interpolated
   */
  public static clipPolyfaceClipPlane(polyface: Polyface, clipper: ClipPlane, insideClip: boolean = true, buildClosureFaces: boolean = false): Polyface {
    const builders = ClippedPolyfaceBuilders.create(insideClip, !insideClip, buildClosureFaces);
    this.clipPolyfaceInsideOutside(polyface, clipper, builders);
    return builders.claimPolyface(insideClip ? 0 : 1, true)!;
  }

  /** Clip each facet of polyface to the ClipPlane.
   * * Return surviving clip as a new mesh.
   * * WARNING: The new mesh is "points only".
   */
  public static clipPolyfaceConvexClipPlaneSet(polyface: Polyface, clipper: ConvexClipPlaneSet): Polyface {
    const visitor = polyface.createVisitor(0);
    const builder = PolyfaceBuilder.create();
    const work = new GrowableXYZArray(10);
    for (visitor.reset(); visitor.moveToNextFacet();) {
      clipper.clipConvexPolygonInPlace(visitor.point, work);
      if (visitor.point.length > 2)
        builder.addPolygonGrowableXYZArray(visitor.point);
    }
    return builder.claimPolyface(true);
  }

  /** Clip each facet of polyface to the the clippers.
   * * Add inside, outside fragments to builderA, builderB
   * * This does not consider params, normals, colors.  Just points.
   * @internal
   */
  public static clipPolyfaceUnionOfConvexClipPlaneSetsToBuilders(polyface: Polyface, allClippers: UnionOfConvexClipPlaneSets, destination: ClippedPolyfaceBuilders) {
    const builderA = destination.builderA;
    const builderB = destination.builderB;
    const visitor = polyface.createVisitor(0);
    const cache = new GrowableXYZArrayCache();
    const residualPolygons: ClipCandidate[] = [];
    let candidate: ClipCandidate | undefined;
    const  outsideParts: GrowableXYZArray[] = [];

    const numConvexSet = allClippers.convexSets.length;
    for (visitor.reset(); visitor.moveToNextFacet();) {
      residualPolygons.push(new ClipCandidate(cache.grabAndFill(visitor.point), 0));
      while ((candidate = residualPolygons.pop()) !== undefined) {
        const convexSetIndex = candidate.nextConvexSetIndex;
        if (convexSetIndex >= numConvexSet) {
          // ths remnant polygon is OUT ...
          this.addPolygonToBuilderAndDropToCache(candidate.points, builderB, cache);
        } else {
          const clipper = allClippers.convexSets[convexSetIndex];
          cache.dropAllToCache(outsideParts);
          const insidePart = clipper.clipInsidePushOutside(candidate.points, outsideParts, cache);
          if (insidePart){
            this.addPolygonToBuilderAndDropToCache(insidePart, builderA, cache);
          // Keep outside parts active for clip by later facets . . .
          for (const outsidePolygon of outsideParts) {
            residualPolygons.push(new ClipCandidate(outsidePolygon, convexSetIndex + 1));
            }
            outsideParts.length = 0;
          } else {
            // Nothing was insidePart.  The outside parts might be split by intermediate steps -- but all the pieces are there.
            candidate.nextConvexSetIndex++;
            residualPolygons.push(candidate);
          }
        }
      }
    }
    cache.dropAllToCache(outsideParts);
    if (destination.buildClosureFaces) {
      for (const clipper of allClippers.convexSets) {
        this.buildClosureFacesForConvexSet(visitor, clipper, destination, cache);
      }
    }
  }

  private static addPolygonToBuilderAndDropToCache(polygon: GrowableXYZArray | undefined, builder: PolyfaceBuilder | undefined, cache: GrowableXYZArrayCache) {
    if (polygon) {
      if (builder)
        builder.addPolygonGrowableXYZArray(polygon);
      cache.dropToCache(polygon);
    }
  }
  private static addPolygonArrayToBuilderAndDropToCache(polygonArray: GrowableXYZArray[], builder: PolyfaceBuilder | undefined, cache: GrowableXYZArrayCache) {
    let polygon;
    while ((polygon = polygonArray.pop()) !== undefined) {
      this.addPolygonToBuilderAndDropToCache(polygon, builder, cache);
    }
  }
  private static createChainContextsForConvexClipPlaneSet(clipper: ConvexClipPlaneSet): ChainMergeContext[] {
    const chainContexts = [];
    for (const plane of clipper.planes) {
      if (!plane.interior) {
        const c = ChainMergeContext.create();
        c.plane = plane;
        c.convexClipper = clipper;
        chainContexts.push(c);
      }
    }
    return chainContexts;
  }

  /** Clip each facet of polyface to the the clippers.
 * * Add inside, outside fragments to builderA, builderB
 * * This does not consider params, normals, colors.  Just points.
 * @internal
 */
  public static clipPolyfaceConvexClipPlaneSetToBuilders(polyface: Polyface, clipper: ConvexClipPlaneSet, destination: ClippedPolyfaceBuilders) {
    const builderA = destination.builderA;
    const builderB = destination.builderB;
    const visitor = polyface.createVisitor(0);
    const cache = new GrowableXYZArrayCache();
    const outsideParts: GrowableXYZArray[] = [];
    for (visitor.reset(); visitor.moveToNextFacet();) {
      // !!! currentCandidates and next candidates are empty at this point !!!
      const insidePart = clipper.clipInsidePushOutside(visitor.point, outsideParts, cache);
      if (insidePart === undefined) {
        // everything is out ... outsideParts might be fragmented.  Save only the original polygon
        builderB?.addPolygonGrowableXYZArray(visitor.point);
        cache.dropToCache(insidePart);
        cache.dropAllToCache(outsideParts);
      }
      this.addPolygonToBuilderAndDropToCache(insidePart, builderA, cache);
      this.addPolygonArrayToBuilderAndDropToCache(outsideParts, builderB, cache);
    }
    this.buildClosureFacesForConvexSet(visitor, clipper, destination, cache);
  }
  /**
   *
   * @param visitor visitor for all facets of interest (entire polyface)
   * @param clipper ConvexClipPlaneSet to apply
   * @param destination builders to receive inside, outside parts
   * @param cache GrowableArray cache.
   */
  private static buildClosureFacesForConvexSet(visitor: PolyfaceVisitor, clipper: ConvexClipPlaneSet, destination: ClippedPolyfaceBuilders,
    cache: GrowableXYZArrayCache) {
    if (destination.buildClosureFaces) {
      const chainContexts = this.createChainContextsForConvexClipPlaneSet(clipper);
      const workPoints = cache.grabFromCache();
      const facetPoints = cache.grabFromCache();
      for (visitor.reset(); visitor.moveToNextFacet();) {
        for (const chainContext of chainContexts) {
          const plane = chainContext.plane;
          facetPoints.clear();
          facetPoints.pushFrom(visitor.point);
          IndexedXYZCollectionPolygonOps.clipConvexPolygonInPlace(plane!, facetPoints, workPoints);
          chainContext.addSegmentsOnPlane(facetPoints, true);
        }
      }
      cache.dropToCache(facetPoints);
      cache.dropToCache(workPoints);
      for (const chainContext of chainContexts) {
        this.addClosureFacets(chainContext, destination, cache);
      }
    }
  }

  /**
   *
   * @param visitor visitor for all facets of interest (entire polyface)
   * @param clipper ConvexClipPlaneSet to apply
   * @param destination builders to receive inside, outside parts
   * @param cache GrowableArray cache.
   */
  private static buildClosureFacesForPlane(visitor: PolyfaceVisitor, plane: PlaneAltitudeEvaluator, destination: ClippedPolyfaceBuilders,
    cache: GrowableXYZArrayCache) {
    if (destination.buildClosureFaces) {
      const chainContext = ChainMergeContext.create();
      chainContext.plane = plane;
      const workPoints = cache.grabFromCache();
      const facetPoints = cache.grabFromCache();
      for (visitor.reset(); visitor.moveToNextFacet();) {
        facetPoints.clear();
        facetPoints.pushFrom(visitor.point);
        IndexedXYZCollectionPolygonOps.clipConvexPolygonInPlace(plane, facetPoints, workPoints);
        chainContext.addSegmentsOnPlane(facetPoints, true);
      }
      cache.dropToCache(facetPoints);
      cache.dropToCache(workPoints);
      this.addClosureFacets(chainContext, destination, cache);
    }
  }
  private static evaluateInwardPlaneNormal(plane: PlaneAltitudeEvaluator, scale: number): Vector3d {
    return Vector3d.create(plane.velocityXYZ(scale, 0, 0), plane.velocityXYZ(0, scale, 0), plane.velocityXYZ(0, 0, scale));
  }
  /**
   * * Triangulate the contour.
   * * Add all the triangles to both builders
   * * reversed in builderB.
   */
  private static addClippedContour(contour: SweepContour, clipper: ConvexClipPlaneSet | undefined, destination: ClippedPolyfaceBuilders, cache: GrowableXYZArrayCache) {
    const polygonA = cache.grabFromCache();
    const polygonB = cache.grabFromCache();
    if (destination.builderB)
      destination.builderB.toggleReversedFacetFlag();
    contour.announceFacets((facets: IndexedPolyface) => {
      const visitor = facets.createVisitor();
      // The contour facets are convex .. easy clip ..
      for (visitor.reset(); visitor.moveToNextFacet();) {
        polygonA.clear();
        polygonA.pushFromGrowableXYZArray(visitor.point);
        clipper?.clipConvexPolygonInPlace(polygonA, polygonB);
        if (polygonA.length > 2) {
          destination.builderA?.addPolygonGrowableXYZArray(polygonA);
          destination.builderB?.addPolygonGrowableXYZArray(polygonA);
        }
      }
    }, undefined);
    if (destination.builderB)
      destination.builderB.toggleReversedFacetFlag();
    cache.dropToCache(polygonA);
    cache.dropToCache(polygonB);
  }

  /**
   * Gather loops out of the ChainMergeContext.  Add to destination arrays.
   * @param chainContext ASSUMED TO HAVE A PLANE
   * @param destination
   */
  private static addClosureFacets(chainContext: ChainMergeContext, destination: ClippedPolyfaceBuilders, cache: GrowableXYZArrayCache) {
    const clipper = chainContext.convexClipper;
    const plane = chainContext.plane!;
    const outwardNormal = this.evaluateInwardPlaneNormal(plane, -1.0);
    chainContext.clusterAndMergeVerticesXYZ();
    const loops = chainContext.collectMaximalGrowableXYZArrays();
    if (loops.length > 1) {
      const loopSets = PolygonOps.sortOuterAndHoleLoopsXY(loops);
      for (const loopSet of loopSets) {
        PolygonOps.orientLoopsCCWForOutwardNormalInPlace(loopSet, outwardNormal);
        const contour = SweepContour.createForPolygon(loopSet, outwardNormal);
        if (contour !== undefined) {
          if (clipper) {
            this.addClippedContour(contour, clipper, destination, cache);
          } else {
            if (destination.builderA)
              contour.emitFacets(destination.builderA, true, clipper);
            if (destination.builderB)
              contour.emitFacets(destination.builderB, false, clipper);
          }
        }
      }
    } else {
      PolygonOps.orientLoopsCCWForOutwardNormalInPlace(loops, outwardNormal);
      const contour = SweepContour.createForPolygon(loops, outwardNormal);
      if (contour !== undefined) {
        if (clipper) {
          this.addClippedContour(contour, clipper, destination, cache);
        } else {
          if (destination.builderA)
            contour.emitFacets(destination.builderA, true, clipper);
          if (destination.builderB)
            contour.emitFacets(destination.builderB, false, clipper);
        }
      }
    }
  }

  /** Clip each facet of polyface to the the clippers.
   * * Add inside, outside fragments to builderA, builderB
   * * This does not consider params, normals, colors.  Just points.
   * @internal
   */
  public static clipPolyfaceClipPlaneToBuilders(polyface: Polyface, clipper: PlaneAltitudeEvaluator, destination: ClippedPolyfaceBuilders) {
    const builderA = destination.builderA;
    const builderB = destination.builderB;
    const visitor = polyface.createVisitor(0);
    const cache = new GrowableXYZArrayCache();
    const inside = cache.grabFromCache();
    const outside = cache.grabFromCache();
    const range = Range1d.createNull();
    for (visitor.reset(); visitor.moveToNextFacet();) {
      // !!! currentCandidates and next candidates are empty at this point !!!
      IndexedXYZCollectionPolygonOps.splitConvexPolygonInsideOutsidePlane(clipper, visitor.point, inside, outside, range);
      if (builderA)
        builderA.addPolygonGrowableXYZArray(inside);
      if (builderB)
        builderB.addPolygonGrowableXYZArray(outside);
    }
    this.buildClosureFacesForPlane(visitor, clipper, destination, cache);
    cache.dropToCache(inside);
    cache.dropToCache(outside);
  }

  /** Clip each facet of polyface to the ClipPlane or ConvexClipPlaneSet
   * * accumulate inside and outside facets -- to destination.builderA and destination.builderB
   * * if `destination.buildClosureFaces` is set, and also build closure facets
   * * This method parses  the variant input types and calls a more specific method.
   * * WARNING: The new mesh is "points only".
   */
  public static clipPolyfaceInsideOutside(polyface: Polyface, clipper: ClipPlane | ConvexClipPlaneSet | UnionOfConvexClipPlaneSets, destination: ClippedPolyfaceBuilders) {
    if (clipper instanceof ClipPlane) {
      this.clipPolyfaceClipPlaneToBuilders(polyface, clipper, destination);
    } else if (clipper instanceof ConvexClipPlaneSet) {
      this.clipPolyfaceConvexClipPlaneSetToBuilders(polyface, clipper, destination);
    } else if (clipper instanceof UnionOfConvexClipPlaneSets) {
      this.clipPolyfaceUnionOfConvexClipPlaneSetsToBuilders(polyface, clipper, destination);
    }
  }
  /** Clip each facet of polyface to the ClipPlane or ConvexClipPlaneSet
    * * This method parses  the variant input types and calls a more specific method.
    * * To get both inside and outside parts, use clipPolyfaceInsideOutside
    * * WARNING: The new mesh is "points only".
    */
  public static clipPolyface(polyface: Polyface, clipper: ClipPlane | ConvexClipPlaneSet): Polyface | undefined {
    if (clipper instanceof ClipPlane)
      return this.clipPolyfaceClipPlane(polyface, clipper);
    if (clipper instanceof ConvexClipPlaneSet)
      return this.clipPolyfaceConvexClipPlaneSet(polyface, clipper);
    // (The if tests exhaust the type space -- this line is unreachable.)
    return undefined;
  }
  /** Find consecutive points around a polygon (with implied closure edge) that are ON a plane
   * @param points array of points around polygon.  Closure edge is implied.
   * @param chainContext context receiving edges
   * @param point0 work point
   * @param point1 work point
  */
  private static collectEdgesOnPlane(points: GrowableXYZArray, clipper: ClipPlane, chainContext: ChainMergeContext, point0: Point3d, point1: Point3d) {
    const n = points.length;
    if (n > 1) {
      points.getPoint3dAtUncheckedPointIndex(n - 1, point0);
      for (let i = 0; i < n; i++) {
        points.getPoint3dAtUncheckedPointIndex(i, point1);
        if (clipper.isPointOn(point0) && clipper.isPointOn(point1))
          chainContext.addSegment(point0, point1);
        point0.setFromPoint3d(point1);
      }
    }
  }
  /** Intersect each facet with the clip plane. (Producing intersection edges.)
   * * Return all edges  chained as array of LineString3d.
   */
  public static sectionPolyfaceClipPlane(polyface: Polyface, clipper: ClipPlane): LineString3d[] {
    const chainContext = ChainMergeContext.create();

    const visitor = polyface.createVisitor(0);
    const work = new GrowableXYZArray(10);
    const point0 = Point3d.create();
    const point1 = Point3d.create();
    for (visitor.reset(); visitor.moveToNextFacet();) {
      clipper.clipConvexPolygonInPlace(visitor.point, work, true);
      this.collectEdgesOnPlane(visitor.point, clipper, chainContext, point0, point1);
    }
    chainContext.clusterAndMergeVerticesXYZ();
    return chainContext.collectMaximalChains();
  }

  /**
   * * Split facets of mesh "A" into parts that are
   *     * under mesh "B"
   *     * over mesh "B"
   * * both meshes are represented by visitors rather than the meshes themselves
   *     * If the data in-hand is a mesh, call with `mesh.createVisitor`
   * * The respective clip parts are fed to caller-supplied builders.
   *    * Caller may set either or both builders to toggle facet order (e.g. toggle the lower facets to make them "point down" in cut-fill application)
   *    * This step is commonly one-half of "cut fill".
   *       * A "cut fill" wrapper will call this twice with the visitor and builder roles reversed.
   * * Both polyfaces are assumed convex with CCW orientation viewed from above.
   * @param visitorA iterator over polyface to be split.
   * @param visitorB iterator over polyface that acts as a splitter
   * @param orientUnderMeshDownward if true, the "meshAUnderB" output is oriented with its normals reversed so it can act as the bottom side of a cut-fill pair.
   */
  public static clipPolyfaceUnderOverConvexPolyfaceIntoBuilders(visitorA: PolyfaceVisitor, visitorB: PolyfaceVisitor,
    builderAUnderB: PolyfaceBuilder | undefined,
    builderAOverB: PolyfaceBuilder | undefined) {
    const rangeDataA = PolyfaceQuery.collectRangeLengthData(visitorA);
    const searchA = RangeSearch.create2dSearcherForRangeLengthData<number>(rangeDataA);
    if (!searchA)
      return;
    const range = Range3d.create();
    for (visitorA.reset(); visitorA.moveToNextFacet();) {
      visitorA.point.setRange(range);
      searchA.addRange(range, visitorA.currentReadIndex());
    }
    const xyClip = new GrowableXYZArray(10);
    const workArray = new GrowableXYZArray(10);
    const xyFrustum = ConvexClipPlaneSet.createEmpty();
    const below = new GrowableXYZArray(10);
    const above = new GrowableXYZArray(10);
    const planeOfFacet = ClipPlane.createNormalAndPointXYZXYZ(0, 0, 1, 0, 0, 0)!;
    const altitudeRange = Range1d.createNull();

    for (visitorB.reset(); visitorB.moveToNextFacet();) {
      visitorB.point.setRange(range);
      ConvexClipPlaneSet.setPlaneAndXYLoopCCW(visitorB.point, planeOfFacet, xyFrustum);
      searchA.searchRange2d(range, (_rangeA: Range2d, readIndexA: number) => {
        visitorA.moveToReadIndex(readIndexA);
        xyFrustum.polygonClip(visitorA.point, xyClip, workArray);
        // builderAOverB.addPolygonGrowableXYZArray(xyClip);
        if (xyClip.length > 0) {
          // planeOfFacet.convexPolygonSplitInsideOutsideGrowableArrays(xyClip, below, above, altitudeRange);
          IndexedXYZCollectionPolygonOps.splitConvexPolygonInsideOutsidePlane(planeOfFacet, xyClip, below, above, altitudeRange);
          if (below.length > 0 && builderAUnderB)
            builderAUnderB.addPolygonGrowableXYZArray(below);
          if (above.length > 0 && builderAOverB)
            builderAOverB.addPolygonGrowableXYZArray(above);
        }
        return true;
      });
    }
  }

  /**
   * * Split facets into vertically overlapping sections
   * * both meshes are represented by visitors rather than the meshes themselves
   *     * If the data in-hand is a mesh, call with `mesh.createVisitor`
   * * The respective clip parts are returned as separate meshes.
   *    * Caller may set either or both builders to toggle facet order (e.g. toggle the lower facets to make them "point down" in cut-fill application)
   * * Both polyfaces are assumed convex with CCW orientation viewed from above.
   * * Each output contains some facets from meshA and some from meshB:
   *    * meshAUnderB -- areas where meshA is underneath mesh B.
   *        * If A is "design surface" and B is existing DTM, this is "cut" volume
   *    * meshAOverB  -- areas where meshB is over meshB.
   *        * If A is "design surface" and B is existing DTM, this is "fill" volume
   *
   * @param visitorA iterator over polyface to be split.
   * @param visitorB iterator over polyface that acts as a splitter
   * @param orientUnderMeshDownward if true, the "meshAUnderB" output is oriented with its normals reversed so it can act as the bottom side of a cut-fill pair.
   */
  public static computeCutFill(meshA: IndexedPolyface, meshB: IndexedPolyface): { meshAUnderB: IndexedPolyface, meshAOverB: IndexedPolyface } {
    const visitorA = meshA.createVisitor();
    const visitorB = meshB.createVisitor();
    const builderAUnderB = PolyfaceBuilder.create();
    const builderAOverB = PolyfaceBuilder.create();
    builderAUnderB.toggleReversedFacetFlag();
    this.clipPolyfaceUnderOverConvexPolyfaceIntoBuilders(visitorA, visitorB, builderAUnderB, builderAOverB);
    builderAUnderB.toggleReversedFacetFlag();
    builderAOverB.toggleReversedFacetFlag();
    this.clipPolyfaceUnderOverConvexPolyfaceIntoBuilders(visitorB, visitorA, builderAOverB, builderAUnderB);
    return {
      meshAUnderB: builderAUnderB.claimPolyface(),
      meshAOverB: builderAOverB.claimPolyface(),
    };
  }
}
