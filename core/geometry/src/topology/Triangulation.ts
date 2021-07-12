/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Topology
 */

import { ClipUtilities } from "../clipping/ClipUtils";
import { Geometry } from "../Geometry";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { IndexedXYZCollection } from "../geometry3d/IndexedXYZCollection";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Point3dArray } from "../geometry3d/PointHelpers";
import { PointStreamXYZXYZHandlerBase, VariantPointDataStream } from "../geometry3d/PointStreaming";
import { Range1d, Range2d } from "../geometry3d/Range";
import { XAndY, XYAndZ } from "../geometry3d/XYZProps";
import { HalfEdge, HalfEdgeGraph, HalfEdgeMask } from "./Graph";
import { MarkedEdgeSet } from "./HalfEdgeMarkSet";
import { InsertAndRetriangulateContext } from "./InsertAndRetriangulateContext";

/**
 * type for use as signature for xyz data of a single linestring appearing in a parameter list.
 * @public
 */
export type LineStringDataVariant = IndexedXYZCollection | XYAndZ[] | XAndY[] | number[][];

/**
 * type for use as signature for multiple xyz data of multiple linestrings appearing in a parameter list.
 * @public
 */
export type MultiLineStringDataVariant = LineStringDataVariant | LineStringDataVariant[];

/**
 * (static) methods for triangulating polygons
 * * @internal
 */
export class Triangulator {

  /** Given the six nodes that make up two bordering triangles, "pinch" and relocate the nodes to flip them
   * * The shared edge mates are a and d.
   * * (abc) are a triangle in CCW order
   * * (dfe) are a triangle in CCW order. (!! node dfe instead of def.)
   */
  private static flipEdgeBetweenTriangles(a: HalfEdge, b: HalfEdge, c: HalfEdge, d: HalfEdge, e: HalfEdge, f: HalfEdge) {
    // Reassign all of the pointers
    HalfEdge.pinch(a, e);
    HalfEdge.pinch(c, d);
    HalfEdge.pinch(f, c);
    HalfEdge.pinch(e, b);

    // Move alpha and beta into the xy coordinates of their predecessors
    e.x = b.x;
    e.y = b.y;
    e.z = b.z;
    e.i = b.i;
    c.i = f.i;
    c.x = f.x;
    c.y = f.y;
    c.z = f.z;
  }
  /**
   * * nodeA is a given node
   * * nodeA1 is its nodeA.faceSuccessor
   * * nodeA2 is nodeA1.faceSuccessor, i.e. 3rd node of triangle A
   * * nodeB  is nodeA.edgeMate, i.e. a node in the "other" triangle at nodeA's edge
   * * nodeB1 is nodeB.faceSuccessor
   * * nodeB2 is nodeB1.faceSuccessor, i.e the 3rd node of triangle B
   * Construct (as simple doubles, to avoid object creation) xy vectors from:
   * * (ux,uy): nodeA to nodeA1, i.e. the shared edge
   * * (vx,vy): nodeA to nodeA2,
   * * (wx,wy): nodeA to nodeB2
   * * this determinant is positive if nodeA is "in the circle" of nodeB2, nodeA1, nodeA2
   * * Return true if clearly positive
   * * Return false if clearly negative or almost zero.
   * @param nodeA node on the diagonal edge of candidate for edge flip.
   * @param if true, divide the determinant by the sum of absolute values of the cubic terms of the determinant.
   * @return the determinant as modified per comment (but undefined if the faces are not triangles as expected.)
   */
  public static computeInCircleDeterminantIsStrongPositive(nodeA: HalfEdge): boolean {
    const nodeA1 = nodeA.faceSuccessor;
    const nodeA2 = nodeA1.faceSuccessor;
    if (nodeA2.faceSuccessor !== nodeA)
      return false;
    const nodeB = nodeA.edgeMate;
    const nodeB1 = nodeB.faceSuccessor;
    const nodeB2 = nodeB1.faceSuccessor;
    if (nodeB2.faceSuccessor !== nodeB)
      return false;
    const ux = nodeA1.x - nodeA.x;
    const uy = nodeA1.y - nodeA.y;
    const vx = nodeA2.x - nodeA.x;
    const vy = nodeA2.y - nodeA.y;
    if (Geometry.crossProductXYXY(ux, uy, vx, vy) < 0)
      return false;
    // we assume identical coordinates in pairs (nodeA, nodeB1)  and (nodeA1, nodeB)
    const wx = nodeB2.x - nodeA.x;
    const wy = nodeB2.y - nodeA.y;
    const tx = wx * wx + wy * wy;
    const ty = vx * vx + vy * vy;
    const tz = ux * ux + uy * uy;
    const q = Geometry.tripleProduct(
      wx, wy, tx,
      vx, vy, ty,
      ux, uy, tz);
    if (q < 0)
      return false;
    const denom = Math.abs(wx * vy * tz) + Math.abs(wx * ty * ux) + Math.abs(tx * vx * uy)
      + Math.abs(wx * ty * uy) + Math.abs(wy * vx * tz) + Math.abs(tx * vy * ux);
    return q > 1.0e-12 * denom;
  }

  /**
   *  *  Visit each node of the graph array
   *  *  If a flip would be possible, test the results of flipping using incircle condition
   *  *  If revealed to be an improvement, conduct the flip, mark involved nodes as unvisited, and repeat until all nodes are visited
   */
  public static flipTriangles(graph: HalfEdgeGraph): number {
    const edgeSet = MarkedEdgeSet.create(graph)!;
    for (const node of graph.allHalfEdges)
      edgeSet.addToSet(node);
    const numFlip = this.flipTrianglesInEdgeSet(graph, edgeSet);
    edgeSet.teardown();
    return numFlip;
  }

  /**
   *  *  Visit each node of the graph array
   *  *  If a flip would be possible, test the results of flipping using incircle condition
   *  *  If revealed to be an improvement, conduct the flip, mark involved nodes as unvisited, and repeat until all nodes are visited
   */
  public static flipTrianglesInEdgeSet(graph: HalfEdgeGraph, edgeSet: MarkedEdgeSet): number {
    const barrierMasks = HalfEdgeMask.EXTERIOR | HalfEdgeMask.PRIMARY_EDGE | HalfEdgeMask.BOUNDARY_EDGE;

    const nodeArray = graph.allHalfEdges;
    const maxTest = 10.0 * nodeArray.length;
    let numFlip = 0;
    let numOK = 0;
    let node;
    while (undefined !== (node = edgeSet.chooseAndRemoveAny())) {

      if (node.isMaskSet(barrierMasks)) // Flip not allowed
        continue;

      if (Triangulator.computeInCircleDeterminantIsStrongPositive(node)) {
        // Flip the triangles
        Triangulator.flipEdgeBetweenTriangles(node.edgeMate.faceSuccessor, node.edgeMate.facePredecessor, node.edgeMate, node.faceSuccessor, node, node.facePredecessor);
        // keep looking at the 2 faces
        edgeSet.addAroundFace(node);
        edgeSet.addAroundFace(node.edgeMate);
        numFlip++;
      } else {
        numOK++;
      }
      if (numFlip + numOK > maxTest)
        break;
    }
    return numFlip;
  }

  /** Create a graph with a triangulation points.
   * * The outer limit of the graph is the convex hull of the points.
   * * The outside loop is marked `HalfEdgeMask.EXTERIOR`
   */
  public static createTriangulatedGraphFromPoints(points: Point3d[]): HalfEdgeGraph | undefined {
    if (points.length < 3)
      return undefined;
    const hull: Point3d[] = [];
    const interior: Point3d[] = [];
    Point3dArray.computeConvexHullXY(points, hull, interior, true);
    const graph = new HalfEdgeGraph();
    const context = InsertAndRetriangulateContext.create(graph);
    Triangulator.createFaceLoopFromCoordinates(graph, hull, true, true);
    // HalfEdgeGraphMerge.clusterAndMergeXYTheta(graph);
    let numInsert = 0;
    for (const p of interior) {
      context.insertAndRetriangulate(p, true);
      numInsert++;
      if (numInsert > 16) {
        /*
        context.reset();
        Triangulator.flipTriangles(context.graph);
        // console.log (" intermediate flips " + numFlip);
        */
        numInsert = 0;
      }
    }
    /*
        // final touchup for aspect ratio flip
        for (let i = 0; i < 15; i++) {
          const numFlip = Triangulator.flipTriangles(graph);
          if (numFlip === 0)
            break;
        }
        */
    return graph;
  }
  /**
   * * Only one outer loop permitted.
   * * Largest area loop is assumed outer.
   * @param loops an array of loops as GrowableXYZArray or XAndY[]
   * @returns triangulated graph, or undefined if bad data.
   */
  public static createTriangulatedGraphFromLoops(loops: GrowableXYZArray[] | XAndY[][]): HalfEdgeGraph | undefined {
    if (loops.length < 1)
      return undefined;
    const mask = HalfEdgeMask.BOUNDARY_EDGE | HalfEdgeMask.PRIMARY_EDGE;
    const graph = new HalfEdgeGraph();
    const holeSeeds: HalfEdge[] = [];
    let maxArea = -10000.0;
    let maxAreaIndex = -1;
    // collect all the loops with pointers to the positive (inside)
    // remember which one has largest area.
    for (let i = 0; i < loops.length; i++) {
      let seed = Triangulator.directCreateFaceLoopFromCoordinates(graph, loops[i]);
      if (seed) {
        seed = seed.faceSuccessor;  // directCreate returns tail
        const mate = seed.vertexSuccessor;
        seed.setMaskAroundFace(mask);
        mate.setMaskAroundFace(mask);
        const signedFaceArea = seed.signedFaceArea();
        const area = Math.abs(signedFaceArea);
        holeSeeds.push(signedFaceArea >= 0 ? seed : mate);
        if (i === 0 || area > maxArea) {
          maxArea = area;
          maxAreaIndex = i;
        }
      }
    }
    if (holeSeeds.length === 0)
      return undefined;
    // extract the max area seed ...
    const maxAreaFace = holeSeeds[maxAreaIndex];
    holeSeeds[maxAreaIndex] = holeSeeds[holeSeeds.length - 1];
    holeSeeds.pop();
    maxAreaFace.vertexSuccessor.setMaskAroundFace(HalfEdgeMask.EXTERIOR);
    // The hole seeds all have inside nodes.  Set mask there and jump to outside.
    for (let i = 0; i < holeSeeds.length; i++) {
      const seed = holeSeeds[i];
      seed.setMaskAroundFace(HalfEdgeMask.EXTERIOR);
      holeSeeds[i] = this.getLeftmost(seed.vertexSuccessor);
    }

    const startingNode = Triangulator.spliceLeftMostNodesOfHoles(graph, maxAreaFace, holeSeeds);
    if (startingNode) {
      if (Triangulator.triangulateSingleFace(graph, startingNode))
        return graph;
    }
    return undefined;
  }
  /**
   * Triangulate all positive area faces of a graph.
   */
  public static triangulateAllPositiveAreaFaces(graph: HalfEdgeGraph): boolean {
    const seeds = graph.collectFaceLoops();
    let numFail = 0;
    for (const face of seeds) {
      if (face.countEdgesAroundFace() > 3) {
        const area = face.signedFaceArea();
        if (area > 0.0)
          if (!Triangulator.triangulateSingleFace(graph, face))
            numFail++;
      }
    }
    return numFail === 0;
  }

  /**
   * Triangulate the polygon made up of by a series of points.
   * * The loop may be either CCW or CW -- CCW order will be used for triangles.
   * * To triangulate a polygon with holes, use createTriangulatedGraphFromLoops
   */
  public static createTriangulatedGraphFromSingleLoop(data: XAndY[] | GrowableXYZArray): HalfEdgeGraph | undefined {
    const graph = new HalfEdgeGraph();
    const startingNode = Triangulator.createFaceLoopFromCoordinates(graph, data, true, true);

    if (!startingNode || graph.countNodes() < 6) return graph;

    if (Triangulator.triangulateSingleFace(graph, startingNode)) {
      Triangulator.flipTriangles(graph);
      return graph;
    }
    return undefined;
  }

  /**
   * cautiously split the edge starting at baseNode.
   * * If baseNode is null, create a trivial loop with the single vertex at xy
   * * if xy is distinct from the coordinates at both baseNode and its successor, insert xy as a new node within that edge.
   * * also include z coordinate if present.
   */
  private static interiorEdgeSplit(graph: HalfEdgeGraph, baseNode: HalfEdge | undefined, xy: XAndY | number[]): HalfEdge | undefined {
    let x = 0, y = 0, z = 0;
    if (Array.isArray(xy)) {
      x = xy[0];
      y = xy[1];
      z = xy.length > 2 ? xy[3] : 0.0;
    } else {
      const q = xy as any;
      if (q.hasOwnProperty("x")) x = q.x;
      if (q.hasOwnProperty("y")) y = q.y;
      if (q.hasOwnProperty("y")) z = q.z;
    }
    if (!baseNode)
      return graph.splitEdge(baseNode, x, y, z);
    if (Triangulator.isAlmostEqualXAndYXY(baseNode, x, y))
      return baseNode;
    if (Triangulator.isAlmostEqualXAndYXY(baseNode.faceSuccessor, x, y))
      return baseNode;
    return graph.splitEdge(baseNode, x, y, z);
  }
  /** Create a loop from coordinates.
   * * Return a pointer to any node on the loop.
   * * no masking or other markup is applied.
   */
  public static directCreateFaceLoopFromCoordinates(graph: HalfEdgeGraph, data: LineStringDataVariant): HalfEdge | undefined {
    // Add the starting nodes as the boundary, and apply initial masks to the primary edge and exteriors
    let baseNode: HalfEdge | undefined;
    if (data instanceof IndexedXYZCollection) {
      const xyz = Point3d.create();
      for (let i = 0; i < data.length; i++) {
        data.getPoint3dAtCheckedPointIndex(i, xyz);
        baseNode = Triangulator.interiorEdgeSplit(graph, baseNode, xyz);
      }
    } else {
      for (const xy of data) {
        baseNode = Triangulator.interiorEdgeSplit(graph, baseNode, xy);
      }
    }
    return baseNode;
  }

  /** Create chains from coordinates.
   * * Return array of pointers to base node of the chains.
   * * no masking or other markup is applied.
   * @param graph New edges are built in this graph
   * @param data coordinate data
   * @param id id to attach to (both side of all) edges
   */
  public static directCreateChainsFromCoordinates(graph: HalfEdgeGraph, data: MultiLineStringDataVariant, id: number = 0): HalfEdge[] {
    // Add the starting nodes as the boundary, and apply initial masks to the primary edge and exteriors
    const assembler = new AssembleXYZXYZChains(graph, id);
    VariantPointDataStream.streamXYZ(data, assembler);
    return assembler.claimSeeds();
  }

  /**
   * @param graph the containing graph
   * @param base The last node of a newly created loop.  (i.e. its `faceSuccessor` has the start xy)
   * @param returnPositiveAreaLoop if true, return the start node on the side with positive area.  otherwise return the left side as given.
   * @param maskForBothSides mask to apply on both sides.
   * @param maskForOtherSide mask to apply to the "other" side of the loop.
   * @return the loop's start node or its vertex successor, chosen to be the positive or negative loop per request.
   */
  private static maskAndOrientNewFaceLoop(_graph: HalfEdgeGraph, base: HalfEdge | undefined, returnPositiveAreaLoop: boolean,
    maskForBothSides: HalfEdgeMask,
    maskForOtherSide: HalfEdgeMask): HalfEdge | undefined {
    // base is the final coordinates
    if (base) {
      base = base.faceSuccessor; // because typical construction process leaves the "live" edge at the end of the loop.
      const area = base.signedFaceArea();
      const mate = base.edgeMate;
      if (maskForBothSides !== HalfEdgeMask.NULL_MASK) {
        base.setMaskAroundFace(maskForBothSides);
        mate.setMaskAroundFace(maskForBothSides);
      }

      let preferredNode = base;
      if (returnPositiveAreaLoop && (area < 0))
        preferredNode = mate;
      const otherNode = preferredNode.vertexSuccessor;

      if (maskForOtherSide !== HalfEdgeMask.NULL_MASK)
        otherNode.setMaskAroundFace(maskForOtherSide);
      return preferredNode;
    }
    return undefined;
  }
  /**
   * create a circular doubly linked list of internal and external nodes from polygon points in the specified winding order
   * * This applies the masks used by typical applications:
   *   * HalfEdgeMask.BOUNDARY on both sides
   *   * HalfEdgeMask.PRIMARY_EDGE on both sides.
   * * Use `createFaceLoopFromCoordinatesAndMasks` for detail control of masks.
   */
  public static createFaceLoopFromCoordinates(graph: HalfEdgeGraph, data: LineStringDataVariant, returnPositiveAreaLoop: boolean, markExterior: boolean): HalfEdge | undefined {
    const base = Triangulator.directCreateFaceLoopFromCoordinates(graph, data);
    return Triangulator.maskAndOrientNewFaceLoop(graph, base, returnPositiveAreaLoop,
      HalfEdgeMask.BOUNDARY_EDGE | HalfEdgeMask.PRIMARY_EDGE,
      markExterior ? HalfEdgeMask.EXTERIOR : HalfEdgeMask.NULL_MASK);
  }

  /**
   * create a circular doubly linked list of internal and external nodes from polygon points.
   * * Optionally jump to the "other" side so the returned loop has positive area
   * @param graph graph to receive the new edges
   * @param data array with x,y coordinates
   * @param returnPositiveAreaLoop if false, return an edge proceeding around the loop in the order given.  If true, compute the loop area and flip return the side with positive area.
   * @param maskForBothSides mask to apply on both sides.
   * @param maskForOtherSide mask to apply on the "other" side from the returned loop.
   */
  public static createFaceLoopFromCoordinatesAndMasks(graph: HalfEdgeGraph, data: LineStringDataVariant, returnPositiveAreaLoop: boolean,
    maskForBothSides: HalfEdgeMask,
    maskForOtherSide: HalfEdgeMask): HalfEdge | undefined {
    const base = Triangulator.directCreateFaceLoopFromCoordinates(graph, data);
    return Triangulator.maskAndOrientNewFaceLoop(graph, base, returnPositiveAreaLoop, maskForBothSides, maskForOtherSide);
  }

  /** Cut off an ear, forming a new face loop of nodes
   * @param ear the vertex being cut off.
   * *  Form two new nodes, alpha and beta, which have the coordinates one step away from the ear vertex.
   * *  Reassigns the pointers such that beta is left behind with the new face created
   * *  Reassigns the pointers such that alpha becomes the resulting missing node from the remaining polygon
   * * Reassigns prevZ and nextZ pointers
   */
  private static joinNeighborsOfEar(graph: HalfEdgeGraph, ear: HalfEdge) {
    const alpha = graph.createEdgeXYZXYZ(
      ear.facePredecessor.x, ear.facePredecessor.y, ear.facePredecessor.z, ear.facePredecessor.i,
      ear.faceSuccessor.x, ear.faceSuccessor.y, ear.faceSuccessor.z, ear.faceSuccessor.i);
    const beta = alpha.edgeMate;

    // Add two nodes alpha and beta and reassign pointers (also mark triangle nodes as part of triangle)
    HalfEdge.pinch(ear.faceSuccessor, beta);
    HalfEdge.pinch(ear.facePredecessor, alpha);
    ear.setMaskAroundFace(HalfEdgeMask.TRIANGULATED_FACE);
  }
  private static isInteriorTriangle(a: HalfEdge) {
    if (!a.isMaskSet(HalfEdgeMask.TRIANGULATED_FACE))
      return false;
    const b = a.faceSuccessor;
    if (!b.isMaskSet(HalfEdgeMask.TRIANGULATED_FACE))
      return false;
    const c = b.faceSuccessor;
    if (!c.isMaskSet(HalfEdgeMask.TRIANGULATED_FACE))
      return false;
    return c.faceSuccessor === a;
  }

  /**
   * Perform 0, 1, or more edge flips to improve aspect ratio just behind an that was just cut.
   * @param ear the triangle corner which just served as the ear node.
   * @returns the node at the back corner after flipping."appropriately positioned" node for the usual advance to ear.faceSuccessor.edgeMate.faceSuccessor.
   */
  private static doPostCutFlips(ear: HalfEdge) {
    //    B is the ear -- inside a (probably newly created) triangle ABC
    //    CA is the recently added cut edge.
    //    AB is the candidate to be flipped.
    //    triangle B1 A1 D is on the other side of AB
    //    The condition for flipping is:
    //           ! both triangles must be TRIANGULATED_NODE_MASK
    //           ! incircle condition flags D as in the circle of ABC
    //     after flip, node A moves to the vertex of D, and is the effective "ear",  with the cap edge C A1
    //      after flip, consider the A1 D (whose nodes are A1 and flipped A!!!)
    //
    //
    //                                   . C0|
    //                              .        |
    //                           .           |
    //                       .              ^|
    //                   .  A0 ---->       B0|
    //               *=======================*
    //                 \ A1     <----   B1/
    //                   \             /
    //                     \         /
    //                       \  D1 /
    //                          *
    let b0 = ear;
    let a0 = b0.facePredecessor;
    let b1 = a0.edgeMate;
    while (Triangulator.isInteriorTriangle(a0) && Triangulator.isInteriorTriangle(b1)) {
      const detA = Triangulator.computeInCircleDeterminantIsStrongPositive(a0);
      if (!detA)
        break;
      // Flip the triangles
      const a1 = b1.faceSuccessor;
      Triangulator.flipEdgeBetweenTriangles(a1, a1.faceSuccessor, a1.facePredecessor, b0, b0.facePredecessor, b0.faceSuccessor);
      b0 = a0;
      a0 = b0.facePredecessor;
      b1 = a0.edgeMate;
    }
    return b0;
  }

  /**
   * main ear slicing loop which triangulates a polygon (given as a linked list)
   * While there still exists ear nodes that have not yet been triangulated...
   *
   * *  Check if the ear is hashed, and can easily be split off. If so, "join" that ear.
   * *  If not hashed, move on to a separate ear.
   * *  If no ears are currently hashed, attempt to cure self intersections or split the polygon into two before continuing
   */
  private static triangulateSingleFace(graph: HalfEdgeGraph, ear?: HalfEdge): boolean {
    if (!ear) {
      Triangulator.setDebugGraph(graph);
      return false;
    }

    let next;
    let next2;
    let pred;
    let maxCandidate = ear.countEdgesAroundFace();
    let numCandidate = 0;
    ear.clearMaskAroundFace(HalfEdgeMask.TRIANGULATED_FACE);
    // iterate through ears, slicing them one by one
    while (!ear.isMaskSet(HalfEdgeMask.TRIANGULATED_FACE)) {
      pred = ear?.facePredecessor;
      next = ear.faceSuccessor;
      next2 = next.faceSuccessor;
      if (next === ear || next2 === ear || next2.faceSuccessor === ear)
        return true;
      // earcut does not support self intersections.
      // BUT  .. maybe if we watch from the simplest case of next2 returning to pred it will catch some . . .
      // (no need to do flips -- we know it's already a triangle)
      if (Geometry.isAlmostEqualXAndY(next2, pred)) {
        HalfEdge.pinch(pred, next2);
        ear.setMaskAroundFace(HalfEdgeMask.TRIANGULATED_FACE);
        ear = next2;
        continue;
      }
      if (++numCandidate > maxCandidate) {
        Triangulator.setDebugGraph(graph);
        return false;
      }
      if (Triangulator.isEar(ear)) {
        maxCandidate--;
        numCandidate = 0;

        // skipping the next vertices leads to less sliver triangles

        // If we already have a separated triangle, do not join
        if (ear.faceSuccessor.faceSuccessor !== ear.facePredecessor) {
          Triangulator.joinNeighborsOfEar(graph, ear);
          ear = Triangulator.doPostCutFlips(ear);
          ear = ear.faceSuccessor.edgeMate.faceSuccessor;
          // another step?   Nate's 2017 code went one more.
        } else {
          ear.setMaskAroundFace(HalfEdgeMask.TRIANGULATED_FACE);
          ear = next.faceSuccessor;
        }
        continue;
      }
      ear = next;
    }
    return true;  // um .. I'm not sure what this state is.
  }
  /** @internal  */
  private static sDebugGraph: HalfEdgeGraph | undefined;
  /** @internal */
  private static sEnableDebugGraphCapture = false;

  /**
   * * returns the (possibly undefined) debug graph.
   * * sets the debug graph to undefined.
   * * disables subsequent saving.
   * @internal */
  public static claimDebugGraph(): HalfEdgeGraph | undefined {
    const g = Triangulator.sDebugGraph;
    Triangulator.sDebugGraph = undefined;
    Triangulator.sEnableDebugGraphCapture = false;
    return g;
  }
  /** Call (from within the triangulator) to announce a graph to be saved for debug.
   * * If debug graph capture is not enabled, do nothing.
   * * If debug graph capture is enabled, save this graph.
   * * This is called by internal steps at point of failure to preserve the failing graph for unit test examination.
   * @internal */
  public static setDebugGraph(graph: HalfEdgeGraph | undefined) { if (Triangulator.sEnableDebugGraphCapture) Triangulator.sDebugGraph = graph; }
  /**
   * * Clear the debug graph
   * * Set capture enabled to indicated value.
   * * Intended use:
   *   * By default "enabled" is false so there is no activity in the debug graph.
   *   * A unit test which needs to see graph after failure calls clearAndEnableDebugGraphCapture (true)
   *   * run the triangulation step
   *   * call claimDebugGraph.
   *   * claimDebugGraph reverts everything to default no-capture state.
   * @internal */
  public static clearAndEnableDebugGraphCapture(value: boolean) {
    Triangulator.sEnableDebugGraphCapture = value;
    Triangulator.sDebugGraph = undefined;
  }

  // for reuse over all calls to isEar ....
  private static _edgeInterval = Range1d.createNull();
  private static _earRange = Range2d.createNull();
  private static _edgeRange = Range2d.createNull();
  private static _planes: Plane3dByOriginAndUnitNormal[] = [
    Plane3dByOriginAndUnitNormal.createXYPlane(),
    Plane3dByOriginAndUnitNormal.createXYPlane(),
    Plane3dByOriginAndUnitNormal.createXYPlane(),
  ];
  /** Check whether a polygon node forms a valid ear with adjacent nodes */
  private static isEar(ear: HalfEdge) {
    const a = ear.facePredecessor;
    const b = ear;
    const c = ear.faceSuccessor;
    const area = Triangulator.signedTolerancedCCWTriangleArea(a, b, c);
    if (area <= 0)
      return false; // reflex, can't be an ear
    const planes = this._planes;
    if (!Plane3dByOriginAndUnitNormal.createOriginAndTargetXY(a, b, planes[0])
      || !Plane3dByOriginAndUnitNormal.createOriginAndTargetXY(b, c, planes[1])
      || !Plane3dByOriginAndUnitNormal.createOriginAndTargetXY(c, a, planes[2]))
      return false;

    // now make sure we don't have other points inside the potential ear, or edges crossing.
    const earRange = this._earRange;
    const edgeRange = this._edgeRange;
    const edgeInterval = this._edgeInterval;
    Range2d.createXYXYXY(a.x, a.y, b.x, b.y, c.x, c.y, earRange);
    earRange.expandInPlace(Geometry.smallMetricDistance);
    let p = c;
    const zeroPlus = 1.0e-8;
    const zeroMinus = -zeroPlus;
    const onePlus = 1.0 + zeroPlus;
    const oneMinus = 1.0 - zeroPlus;
    const clipTolerance = 1.0e-10 * area;
    while (p !== a) {
      const q = p.faceSuccessor;
      Range2d.createXYXY(p.x, p.y, q.x, q.y, edgeRange);
      if (earRange.intersectsRange(edgeRange)) {
        // Does pq impinge on the triangle?
        Range1d.createXX(zeroMinus, onePlus, edgeInterval);
        ClipUtilities.clipSegmentBelowPlanesXY(planes, p, q, edgeInterval, clipTolerance);
        if (!edgeInterval.isNull) {
          const mate = p.edgeMate;
          if (mate === a || mate === b) {
            // this is the back side of a bridge edge
          } else if (edgeInterval.low > oneMinus) {
            // the endpoint (q) just touches ... if it is at one of the vertex loops it's ok ...
            if (!a.findAroundVertex(q)
              && !b.findAroundVertex(q)
              && !c.findAroundVertex(q))
              return false;
          } else if (edgeInterval.high < zeroPlus) {
            // the start (p) just touches ... if it is at one of the vertex loops it's ok ...
            if (!a.findAroundVertex(p)
              && !b.findAroundVertex(p)
              && !c.findAroundVertex(p))
              return false;
          } else {
            // significant internal intersection -- this edge really intrudes on the  into the triangle
            return false;
          }
        }
      }
      p = p.faceSuccessor;
    }
    return true;
  }
  /** link holeLoopNodes[1], holeLoopNodes[2] etc into the outer loop, producing a single-ring polygon without holes
   *
   */
  private static spliceLeftMostNodesOfHoles(graph: HalfEdgeGraph, outerNode: HalfEdge, leftMostHoleLoopNode: HalfEdge[]): HalfEdge | undefined {

    leftMostHoleLoopNode.sort(Triangulator.compareX);
    let numFail = 0;
    // process holes from left to right
    for (const holeStart of leftMostHoleLoopNode) {
      if (!Triangulator.eliminateHole(graph, holeStart, outerNode))
        numFail++;
    }

    return numFail === 0 ? outerNode : undefined;
  }
  /** For use in sorting -- return (signed) difference (a.x - b.x) */
  private static compareX(a: HalfEdge, b: HalfEdge) {
    return a.x - b.x;
  }

  /** find a bridge between vertices that connects hole with an outer ring and and link it */
  private static eliminateHole(graph: HalfEdgeGraph, hole: HalfEdge, outerNode: HalfEdge): boolean {
    const outerNodeA = Triangulator.findHoleBridge(hole, outerNode);
    if (outerNodeA) {
      return Triangulator.splitFace(graph, outerNodeA, hole) !== undefined;
    }
    return false;
  }
  // cspell:word Eberly
  /**
   *  David Eberly algorithm for finding a bridge between hole and outer polygon:
   *  https://www.geometrictools.com/Documentation/TriangulationByEarClipping.pdf
   */
  private static findHoleBridge(hole: HalfEdge, outerNode?: HalfEdge): HalfEdge | undefined {
    let p = outerNode;

    if (!p)
      return undefined;

    const hx = hole.x;
    const hy = hole.y;
    let qx = -Infinity;
    let m;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    do {
      if (hy <= p.y && hy >= p.faceSuccessor.y && p.faceSuccessor.y !== p.y) {
        const x = p.x + (hy - p.y) * (p.faceSuccessor.x - p.x) / (p.faceSuccessor.y - p.y);
        if (x <= hx && x > qx) {
          qx = x;
          if (x === hx) {
            if (hy === p.y) return p;
            if (hy === p.faceSuccessor.y) return p.faceSuccessor;
          }
          m = p.x < p.faceSuccessor.x ? p : p.faceSuccessor;
        }
      }
      p = p.faceSuccessor;
    } while (p !== outerNode);

    if (!m) return undefined;

    if (hx === qx) return m.facePredecessor; // hole touches outer segment; pick lower endpoint

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    const stop = m;
    const mx = m.x;
    const my = m.y;
    let tanMin = Infinity;
    let tan;

    p = m.faceSuccessor;

    while (p !== stop) {
      if (hx >= p.x && p.x >= mx && hx !== p.x &&
        Triangulator.pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

        tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

        if ((tan < tanMin || (tan === tanMin && p.x > m.x)) && Triangulator.locallyInside(p, hole)) {
          m = p;
          tanMin = tan;
        }
      }

      p = p.faceSuccessor;
    }

    return m;
  }

  // find the leftmost node of a polygon ring
  private static getLeftmost(start: HalfEdge) {
    let p = start;
    let leftmost = start;
    do {
      if (p.x < leftmost.x) leftmost = p;
      p = p.faceSuccessor;
    } while (p !== start);

    return leftmost;
  }

  /** check if a point lies within a convex triangle.
   * i.e. areas of 3 triangles with an edge of abc and p all have zero or positive area.  (abp, bcp, cap)
   */
  private static pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number) {
    return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
      (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
      (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
  }
  private static nodeInTriangle(a: HalfEdge, b: HalfEdge, c: HalfEdge, p: HalfEdge) {
    return Triangulator.signedTolerancedCCWTriangleArea(a, b, p) > 0
      && Triangulator.signedTolerancedCCWTriangleArea(b, c, p) > 0.0
      && Triangulator.signedTolerancedCCWTriangleArea(c, a, p) > 0.0;
  }
  /** signed area of a triangle
   * EDL 2/21 This is negative of usual CCW area.  Beware in callers !!!
   * (This originates in classic earcut code.)
  */
  private static signedCWTriangleArea(p: HalfEdge, q: HalfEdge, r: HalfEdge) {
    return 0.5 * ((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y));
  }

  /** signed area of a triangle, with small positive corrected to zero by relTol
  */
  private static signedTolerancedCCWTriangleArea(p: HalfEdge, q: HalfEdge, r: HalfEdge, relTol: number = 1.0e-12) {
    const ux = q.x - p.x;
    const uy = q.y - p.y;
    const vx = r.x - p.x;
    const vy = r.y - p.y;
    const area = 0.5 * (ux * vy - uy * vx);
    if (area < 0.0)
      return area;
    const uu = ux * ux + uy * uy;
    const vv = vx * vx + vy * vy;
    if (area < relTol * (uu + vv))
      return 0.0;
    return area;
  }

  /** check if two points are equal */
  private static isAlmostEqualXAndYXY(p1: XAndY, x: number, y: number) {
    return Geometry.isAlmostEqualNumber(p1.x, x) && Geometry.isAlmostEqualNumber(p1.y, y);
  }

  /** check if a b is inside the sector around a */
  private static locallyInside(a: HalfEdge, b: HalfEdge) {
    return Triangulator.signedCWTriangleArea(a.facePredecessor, a, a.faceSuccessor) < 0 ?
      Triangulator.signedCWTriangleArea(a, b, a.faceSuccessor) >= 0 && Triangulator.signedCWTriangleArea(a, a.facePredecessor, b) >= 0 :
      Triangulator.signedCWTriangleArea(a, b, a.facePredecessor) < 0 || Triangulator.signedCWTriangleArea(a, a.faceSuccessor, b) < 0;
  }

  /**
   * link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
   * if one belongs to the outer ring and another to a hole, it merges it into a single ring
   * * Returns the base of the new edge at the "a" end.
   * * "a" and "b" still represent the same physical pieces of edges
   * @returns Returns the (base of) the new half edge, at the "a" end.
   */
  private static splitFace(graph: HalfEdgeGraph, a: HalfEdge, b: HalfEdge): HalfEdge | undefined {
    if (HalfEdge.isNodeVisibleInSector(a, b) && HalfEdge.isNodeVisibleInSector(b, a)) {
      const a2 = graph.createEdgeXYZXYZ(a.x, a.y, a.z, a.i, b.x, b.y, b.z, b.i);
      const b2 = a2.faceSuccessor;
      HalfEdge.pinch(a, a2);
      HalfEdge.pinch(b, b2);
      return a2;
    }
    return undefined;
  }

  /**
   * Triangulate a single face with (linear time) logic applicable only if the lowNode is the lowest node.
   * @returns false if any monotonicity condition is violated.
   */
  public static triangulateSingleMonotoneFace(graph: HalfEdgeGraph, start: HalfEdge): boolean {
    let left = start.facePredecessor;
    let right = start.faceSuccessor;
    // P0, P1, P2 are successive edges along evolving chain
    let upperSideOfNewEdge;
    while (left !== right
      && right !== start
      && right.faceSuccessor !== left) {
      /** These should not happen if face is monotone . .. */
      if (HalfEdge.crossProductXYAlongChain(left, start, right) <= 0)
        return false;
      if (!start.belowYX(left))
        return false;
      if (!start.belowYX(right))
        return false;
      if (left.belowYX(right)) {
        /*      Triangulate to all left side edges that
           are below right */

        /*      Phase 1: move upward, adding back edges
           when prior nodes are visible. */
        let P0 = left;
        let P1 = start;
        let P2 = right;
        /*      Invariant: the path from P0 back to P1 is concave.
           Each loop pass moves P0 up the left side, filling in
           edges as needed.  The right side edge
           (following start) is never altered.
         */
        while (P0 !== P2 && P0.belowYX(right)) {
          while (P2 !== right
            && P2 !== P0
            && P2 !== P1
            && HalfEdge.crossProductXYAlongChain(P0, P1, P2) > 0) {
            upperSideOfNewEdge = Triangulator.splitFace(graph, P0, P2);
            if (upperSideOfNewEdge === undefined)
              return false;
            P0 = upperSideOfNewEdge;
            P1 = P0.faceSuccessor;
            P2 = P1.faceSuccessor;
          }
          P2 = P1;
          P1 = P0;
          P0 = P0.facePredecessor;
        }
        /*      Phase 2: Fan out edges from right to the
           left side. P0.P1.P2 describes a pair of
           adjacent edges at the bottom. */
        left = P1;
        P2 = right;
        P1 = P2.facePredecessor;
        P0 = P1.facePredecessor;
        while (P2.faceSuccessor !== P0 && P0 !== left) {
          upperSideOfNewEdge = Triangulator.splitFace(graph, P0, P2);
          if (upperSideOfNewEdge === undefined)
            return false;
          P1 = upperSideOfNewEdge;
          P0 = P1.facePredecessor;
        }
        /*      Finish off with the last stroke from the
           left node to the right, except when already
           topped out */
        if (P2.faceSuccessor !== P0) {
          upperSideOfNewEdge = Triangulator.splitFace(graph, P0, P2);
          if (upperSideOfNewEdge === undefined)
            return false;
          P0 = upperSideOfNewEdge;
        }
        start = P0;
        right = start.faceSuccessor;
        left = start.facePredecessor;

      } else {
        /*      Triangulate to all right side edges that
           are below left */

        /*      Phase 1: move upward, adding back edges
           when prior nodes are visible. */
        let P0 = left;
        let P1 = start;
        let P2 = right;
        /*      Invariant: the path up to P1 is concave.
           Each loop pass advances P1, filling in
           edges as needed. Note that the
           start edge may get hidden, so the
           bottom node must be referenced as
           left.faceSuccessor rather than as start.
         */
        while (P0 !== P2 && P2.belowYX(left)) {
          while (P0 !== left
            && P2 !== P0
            && P2 !== P1
            && HalfEdge.crossProductXYAlongChain(P0, P1, P2) > 0) {
            upperSideOfNewEdge = Triangulator.splitFace(graph, P0, P2);
            if (upperSideOfNewEdge === undefined)
              return false;

            P0 = upperSideOfNewEdge.facePredecessor;
            P1 = upperSideOfNewEdge;
          }
          P0 = P1;
          P1 = P2;
          P2 = P2.faceSuccessor;
        }
        /*      Phase 2: Fan out edges from left to the
           right side. P0.P1.P2 describes a pair of
           adjacent edges at the bottom. */
        right = P1;
        P0 = left;
        P1 = P0.faceSuccessor;
        P2 = P1.faceSuccessor;
        while (P2.faceSuccessor !== P0 && P2 !== right) {
          upperSideOfNewEdge = Triangulator.splitFace(graph, P0, P2);
          if (upperSideOfNewEdge === undefined)
            return false;
          P0 = upperSideOfNewEdge;
          // P1 = P2;   // original code (ported from native) carefully maintained P1..P2 relationship.  But code analyzer says P1 is not used again.  So skip it.
          P2 = P2.faceSuccessor;
        }
        /*      Finish off with the last stroke from the
           left node to the right, except when already
           topped out */
        if (P2.faceSuccessor !== P0) {
          const newEdge = Triangulator.splitFace(graph, P0, P2);
          if (newEdge === undefined)
            return false;
        }
        start = right;
        right = start.faceSuccessor;
        left = start.facePredecessor;
      }
    }
    return true;
  }

}

/**
 * Internal class for assembling chains
 * @internal
 */
class AssembleXYZXYZChains extends PointStreamXYZXYZHandlerBase {
  // Add the starting nodes as the boundary, and apply initial masks to the primary edge and exteriors
  private _seeds?: HalfEdge[];
  private _baseNode: HalfEdge | undefined;
  private _nodeB: HalfEdge | undefined;
  private _nodeC: HalfEdge | undefined;
  private _graph: HalfEdgeGraph;
  private _id: any;
  public constructor(graph: HalfEdgeGraph, id: any) {
    super();
    this._graph = graph;
    this._id = id;
  }
  public override startChain(chainData: MultiLineStringDataVariant, isLeaf: boolean): void {
    super.startChain(chainData, isLeaf);
    this._baseNode = undefined;
    this._nodeB = undefined;
  }
  public override handleXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this._nodeC = this._graph.createEdgeXYZXYZ(x0, y0, z0, this._id, x1, y1, z1, this._id);
    if (this._baseNode === undefined) {
      this._baseNode = this._nodeC;
      this._nodeB = this._baseNode.faceSuccessor;
    } else {
      HalfEdge.pinch(this._nodeB!, this._nodeC);
      this._nodeB = this._nodeC.faceSuccessor;
    }
  }
  public override endChain(chainData: MultiLineStringDataVariant, isLeaf: boolean): void {
    super.endChain(chainData, isLeaf);
    if (this._baseNode !== undefined) {
      if (this._seeds === undefined)
        this._seeds = [];
      this._seeds.push(this._baseNode);
    }
    this._baseNode = undefined;
    this._nodeB = undefined;
    this._nodeC = undefined;
  }
  public claimSeeds(): HalfEdge[] {
    if (this._seeds === undefined)
      return [];
    return this._seeds;
  }
}
