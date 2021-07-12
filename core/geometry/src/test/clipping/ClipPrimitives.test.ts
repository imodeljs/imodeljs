/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ClipPlane } from "../../clipping/ClipPlane";
import { ClipMaskXYZRangePlanes, ClipPrimitive, ClipShape } from "../../clipping/ClipPrimitive";
import { ClipUtilities } from "../../clipping/ClipUtils";
import { ClipVector } from "../../clipping/ClipVector";
import { ConvexClipPlaneSet } from "../../clipping/ConvexClipPlaneSet";
import { UnionOfConvexClipPlaneSets } from "../../clipping/UnionOfConvexClipPlaneSets";
import { Angle } from "../../geometry3d/Angle";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
import { HalfEdge, HalfEdgeGraph, HalfEdgeMask } from "../../topology/Graph";
import { Triangulator } from "../../topology/Triangulation";
import { Checker } from "../Checker";
import { prettyPrint } from "../testFunctions";

/* eslint-disable no-console */

/** EXPENSIVE -- Returns true if two convex sets are equal, allowing reordering of arrays */
function convexSetsAreEqual(convexSet0: ConvexClipPlaneSet, convexSet1: ConvexClipPlaneSet): boolean {
  if (convexSet0.planes.length !== convexSet1.planes.length)
    return false;

  for (const plane0 of convexSet0.planes) {
    let foundMatch = false;
    for (const plane1 of convexSet1.planes) {
      if (plane0.isAlmostEqual(plane1)) {
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch)
      return false;
  }
  return true;
}

function clipPlaneSetsAreEqual(set0: UnionOfConvexClipPlaneSets | undefined, set1: UnionOfConvexClipPlaneSets | undefined): boolean {
  // both undefined is equal . ..
  if (set0 === undefined && set1 === undefined)
    return true;
  if (set0 === undefined || set1 === undefined)
    return false;
  if (set0.convexSets.length !== set1.convexSets.length)
    return false;

  for (const convexSet0 of set0.convexSets) {
    let foundMatch = false;
    for (const convexSet1 of set1.convexSets) {
      if (convexSetsAreEqual(convexSet0, convexSet1)) {
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch)
      return false;
  }
  return true;
}

export function clipShapesAreEqual(clip0: ClipShape, clip1: ClipShape): boolean {
  if (!clipPlaneSetsAreEqual(clip0.fetchClipPlanesRef(), clip1.fetchClipPlanesRef()))
    return false;
  if (clip0.invisible !== clip1.invisible)
    return false;
  for (let i = 0; i < clip0.polygon.length; i++)  // Polygon points should be in the same order
    if (!clip0.polygon[i].isAlmostEqual(clip1.polygon[i]))
      return false;
  if (clip0.isMask !== clip1.isMask)
    return false;
  if ((clip0.zLowValid !== clip1.zLowValid) || (clip0.zHighValid !== clip1.zHighValid) || (clip0.transformValid !== clip1.transformValid))
    return false;
  if ((clip0.zLow !== clip1.zLow) || (clip0.zHigh !== clip1.zHigh))
    return false;
  if (clip0.transformValid && (!clip0.transformFromClip!.isAlmostEqual(clip1.transformFromClip!) || !clip1.transformToClip!.isAlmostEqual(clip1.transformToClip!)))
    return false;
  return true;
}

export function clipPrimitivesAreEqual(clip0: ClipPrimitive, clip1: ClipPrimitive): boolean {
  if (clip0 instanceof ClipShape && clip1 instanceof ClipShape)
    return clipShapesAreEqual(clip0, clip1);
  if (clipPlaneSetsAreEqual(clip0.fetchClipPlanesRef(), clip1.fetchClipPlanesRef())) {
    return true;
  }
  return false;
}
/** Function for sorting planes in order of increasing x, increasing y. */
function compareXYSector1(a: ClipPlane, b: ClipPlane): number {
  if (a.inwardNormalRef.x < b.inwardNormalRef.x)
    return -1;
  else if (a.inwardNormalRef.x > b.inwardNormalRef.x)
    return 1;
  else
    if (a.inwardNormalRef.y < a.inwardNormalRef.y)
      return -1;
    else if (a.inwardNormalRef.y > b.inwardNormalRef.y)
      return 1;
  return 0;
}

/** Function for sorting planes in order of decreasing x, increasing y. */
function compareXYSector2(a: ClipPlane, b: ClipPlane): number {
  if (a.inwardNormalRef.x > b.inwardNormalRef.x)
    return -1;
  else if (a.inwardNormalRef.x < b.inwardNormalRef.x)
    return 1;
  else
    if (a.inwardNormalRef.y < a.inwardNormalRef.y)
      return -1;
    else if (a.inwardNormalRef.y > b.inwardNormalRef.y)
      return 1;
  return 0;
}

/** Function for sorting planes in order of decreasing x, decreasing y. */
function compareXYSector3(a: ClipPlane, b: ClipPlane): number {
  if (a.inwardNormalRef.x > b.inwardNormalRef.x)
    return -1;
  else if (a.inwardNormalRef.x < b.inwardNormalRef.x)
    return 1;
  else
    if (a.inwardNormalRef.y > a.inwardNormalRef.y)
      return -1;
    else if (a.inwardNormalRef.y < b.inwardNormalRef.y)
      return 1;
  return 0;
}

/** Function for sorting planes in order of increasing x, decreasing y. */
function compareXYSector4(a: ClipPlane, b: ClipPlane): number {
  if (a.inwardNormalRef.x < b.inwardNormalRef.x)
    return -1;
  else if (a.inwardNormalRef.x > b.inwardNormalRef.x)
    return 1;
  else
    if (a.inwardNormalRef.y > a.inwardNormalRef.y)
      return -1;
    else if (a.inwardNormalRef.y < b.inwardNormalRef.y)
      return 1;
  return 0;
}

/** Given a convex set of clipping planes that clip a region of 2d space, modify the convex set array such that the planes are in a counter-clockwise order around the boundary. */
function sortConvexSetPlanesToBoundary(convexSet: ConvexClipPlaneSet) {
  const planes = convexSet.planes;
  const newPlanes: ClipPlane[] = [];

  // 1 - Get x=0, y- plane
  let planeFound: ClipPlane | undefined;
  for (const plane of planes) {
    if (plane.inwardNormalRef.x === 0 && plane.inwardNormalRef.y < 0) {
      planeFound = plane;
      break;
    }
  }
  if (planeFound !== undefined)
    newPlanes.push(planeFound);

  // 2 - Get x+, y-
  const tempSortedPlanes: ClipPlane[] = [];
  for (const plane of planes) {
    if (plane.inwardNormalRef.x > 0 && plane.inwardNormalRef.y < 0)
      tempSortedPlanes.push(plane);
  }
  tempSortedPlanes.sort(compareXYSector1);
  for (const plane of tempSortedPlanes)
    newPlanes.push(plane);

  // 3 - Get x+, y=0 plane
  planeFound = undefined;
  for (const plane of planes) {
    if (plane.inwardNormalRef.x > 0 && plane.inwardNormalRef.y === 0) {
      planeFound = plane;
      break;
    }
  }
  if (planeFound !== undefined)
    newPlanes.push(planeFound);

  // 4 - Get x+, y+
  tempSortedPlanes.length = 0;
  for (const plane of planes) {
    if (plane.inwardNormalRef.x > 0 && plane.inwardNormalRef.y > 0)
      tempSortedPlanes.push(plane);
  }
  tempSortedPlanes.sort(compareXYSector2);
  for (const plane of tempSortedPlanes)
    newPlanes.push(plane);

  // 5 - Get x=0, y+ plane
  planeFound = undefined;
  for (const plane of planes) {
    if (plane.inwardNormalRef.x === 0 && plane.inwardNormalRef.y > 0) {
      planeFound = plane;
      break;
    }
  }
  if (planeFound !== undefined)
    newPlanes.push(planeFound);

  // 6 - Get x-, y+
  tempSortedPlanes.length = 0;
  for (const plane of planes) {
    if (plane.inwardNormalRef.x < 0 && plane.inwardNormalRef.y > 0)
      tempSortedPlanes.push(plane);
  }
  tempSortedPlanes.sort(compareXYSector3);  // more negative values less than others
  for (const plane of tempSortedPlanes)
    newPlanes.push(plane);

  // 7 - Get x-, y=0 plane
  planeFound = undefined;
  for (const plane of planes) {
    if (plane.inwardNormalRef.x < 0 && plane.inwardNormalRef.y === 0) {
      planeFound = plane;
      break;
    }
  }
  if (planeFound !== undefined)
    newPlanes.push(planeFound);

  // 8 - Get x-, y-
  tempSortedPlanes.length = 0;
  for (const plane of planes) {
    if (plane.inwardNormalRef.x < 0 && plane.inwardNormalRef.y < 0)
      tempSortedPlanes.push(plane);
  }
  tempSortedPlanes.sort(compareXYSector4);  // more negative values less than others
  for (const plane of tempSortedPlanes)
    newPlanes.push(plane);

  expect(newPlanes.length).equals(planes.length);
  convexSet.planes.length = 0;
  for (const plane of newPlanes)
    convexSet.planes.push(plane);
}

/** Given a convex set of clipping planes, return the points at which the planes intersect. */
function getPointIntersectionsOfConvexSetPlanes(convexSet: ConvexClipPlaneSet, ck: Checker): Point3d[] {
  sortConvexSetPlanesToBoundary(convexSet);
  const intersections: Point3d[] = [];

  for (let i = 0; i < convexSet.planes.length - 1; i++) {
    const planeA0 = convexSet.planes[i];
    const planeA1 = convexSet.planes[i + 1];

    // Intersection of plane 0 with plane 1
    const planeMatrix = Matrix3d.createRowValues(
      planeA0.inwardNormalRef.x, planeA0.inwardNormalRef.y, planeA0.inwardNormalRef.z,
      planeA1.inwardNormalRef.x, planeA1.inwardNormalRef.y, planeA1.inwardNormalRef.z,
      0, 0, 1,
    ).inverse()!;
    ck.testTrue(planeMatrix !== undefined);
    const planeDistanceVec = Vector3d.create(planeA0.distance, planeA1.distance, 0);
    intersections.push(Point3d.createFrom(planeMatrix.multiplyVector(planeDistanceVec)));
  }

  // We must get the intersection of the first and last planes as well
  const plane0 = convexSet.planes[0];
  const plane1 = convexSet.planes[convexSet.planes.length - 1];

  // Intersection of plane 0 with plane 1
  const plane01Matrix = Matrix3d.createRowValues(
    plane0.inwardNormalRef.x, plane0.inwardNormalRef.y, plane0.inwardNormalRef.z,
    plane1.inwardNormalRef.x, plane1.inwardNormalRef.y, plane1.inwardNormalRef.z,
    0, 0, 1,
  ).inverse()!;
  ck.testTrue(plane01Matrix !== undefined);
  const plane01DistanceVec = Vector3d.create(plane0.distance, plane1.distance, 0);
  intersections.push(Point3d.createFrom(plane01Matrix.multiplyVector(plane01DistanceVec)));

  return intersections;
}

/** Simple 2D area of triangle calculation given three points. This does not take into account values along the z-axis. */
function triangleAreaXY(pointA: Point3d, pointB: Point3d, pointC: Point3d): number {
  const a = pointA.x * (pointB.y - pointC.y);
  const b = pointB.x * (pointC.y - pointA.y);
  const c = pointC.x * (pointA.y - pointB.y);

  return Math.abs((a + b + c) / 2);
}

/** Returns true only if all of the points given in arrayA exist in arrayB. */
function pointArrayIsSubsetOfOther(arrayA: Point3d[], arrayB: Point3d[]): boolean {
  for (const pointA of arrayA) {
    let pointFound = false;
    for (const pointB of arrayB) {
      if (pointA.isAlmostEqual(pointB, 1.0e-10)) {
        pointFound = true;
        break;
      }
    }
    if (!pointFound)
      return false;
  }
  return true;
}

describe("ClipPrimitive", () => {
  const min2D = Point3d.create(-54, 18);  // Bottom left point of the octagon formed from octagonalPoints
  const max2D = Point3d.create(-42, 42);  // Top right point of the octagon formed from octagonalPoints
  let octagonalPoints: Point3d[];         // Points array representing an octagon in quadrant II
  let clipPointsA: Point3d[];
  let polygonA: Point3d[];
  let clipPointsB: Point3d[];
  let polygonB: Point3d[];

  before(() => {
    octagonalPoints = [
      min2D,
      Point3d.create(max2D.x, min2D.y),
      Point3d.create(max2D.x + 5, min2D.y + 5),
      Point3d.create(max2D.x + 5, max2D.y - 5),
      max2D,
      Point3d.create(min2D.x, max2D.y),
      Point3d.create(min2D.x - 5, max2D.y - 5),
      Point3d.create(min2D.x - 5, min2D.y + 5),
    ];
    clipPointsA = [
      Point3d.create(0, 0, 0),
      Point3d.create(100, 0, 0),
      Point3d.create(70, 50, 0),
      Point3d.create(100, 100, 0),
      Point3d.create(0, 100, 0),
      Point3d.create(30, 50, 0),
    ];
    polygonA = [
      Point3d.create(0, 0, 0),
      Point3d.create(100, 0, 0),
      Point3d.create(100, 100, 0),
      Point3d.create(0, 100, 0),
    ];
    clipPointsB = [
      Point3d.create(-50, 50, 0),
      Point3d.create(50, 10, 0),
      Point3d.create(150, 50, 0),
      Point3d.create(50, 100, 0),
      Point3d.create(50, 50, 0),
    ];
    polygonB = [
      Point3d.create(0, 0, 0),
      Point3d.create(50, 25, 0),
      Point3d.create(100, 0, 0),
      Point3d.create(100, 100, 0),
      Point3d.create(50, 75, 0),
      Point3d.create(0, 100, 0),
    ];
  });

  it("GetRange", () => {
    const ck = new Checker();
    const clipPrimitive = ClipShape.createEmpty();
    const convexSet = ConvexClipPlaneSet.createEmpty();
    const convexSetRange = Range3d.createNull();
    const numIterations = 10;
    const scaleFactor = 6;
    for (let i = 0; i < numIterations; i++) {
      const p = i * scaleFactor;

      // Test with positive box
      ConvexClipPlaneSet.createXYBox(p, p, p + 1, p + 1, convexSet);
      convexSet.addZClipPlanes(false, p, p + 1);
      ClipShape.createBlock(Range3d.createXYZXYZ(p, p, p, p + 1, p + 1, p + 1), ClipMaskXYZRangePlanes.All, false, false, undefined, clipPrimitive);
      ck.testFalse(clipPrimitive.arePlanesDefined());
      clipPrimitive.fetchClipPlanesRef();
      ck.testTrue(clipPrimitive.arePlanesDefined());
      convexSetRange.setNull();
      convexSet.computePlanePlanePlaneIntersections(undefined, convexSetRange);
      ck.testTrue(convexSetRange !== undefined);

      ck.testTrue(clipPrimitive.isValidPolygon);

      // Test with negative box
      ConvexClipPlaneSet.createXYBox(-p - 1, -p - 1, -p, -p, convexSet);
      convexSet.addZClipPlanes(false, p, p + 1);
      clipPrimitive.setPolygon([Point3d.create(-p - 1, -p - 1), Point3d.create(-p - 1, -p), Point3d.create(-p, -p), Point3d.create(-p, -p - 1)]);
      convexSetRange.setNull();
      convexSet.computePlanePlanePlaneIntersections(undefined, convexSetRange);
      ck.testTrue(convexSetRange !== undefined);
    }

    // Exercise check for z-clips
    ck.testTrue(clipPrimitive.containsZClip(), "Expected clip primitive to contain a normal along the z-axis");
    ClipShape.createShape([Point3d.create(1, 2), Point3d.create(50, 50), Point3d.create(100, -1)], undefined, undefined, undefined, false, false, clipPrimitive);
    ck.testFalse(clipPrimitive.containsZClip(), "Expected clip primitive of box with open top and bottom to not contain z-clip");

    // Exercise invisibility switch
    for (const a of [false, true]) {
      clipPrimitive.setInvisible(a);
      ck.testBoolean(a, clipPrimitive.invisible);
    }

    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("Transformations", () => {
    const ck = new Checker();
    let originalPoint = Point3d.create(5.7865, 1.24123, 0.000009);
    let testPoint = originalPoint.clone();

    // Created with identity transform - should create no changes
    let clipShape = ClipShape.createEmpty(false, false, Transform.createIdentity());
    clipShape.performTransformFromClip(testPoint);
    ck.testPoint3d(originalPoint, testPoint, "Point should be unchanged when transformed with ClipShape containing identity transform");
    clipShape.performTransformToClip(testPoint);
    ck.testPoint3d(originalPoint, testPoint, "Point should be unchanged when transformed with ClipShape containing identity transform");

    // Created with translation - should translate
    originalPoint = Point3d.create(2, 5, -7);
    testPoint = originalPoint.clone();
    const translation = new Point3d(0, -1, 1);
    clipShape = ClipShape.createEmpty(false, false, Transform.createTranslation(translation));
    clipShape.performTransformFromClip(testPoint);
    ck.testPoint3d(testPoint, originalPoint.plus(translation), "Point should be translated when transformed with ClipShape containing translation transform");
    clipShape.performTransformToClip(testPoint);
    ck.testPoint3d(testPoint, originalPoint, "Point should be translated when transformed with ClipShape containing translation transform");

    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipShape creation (linear) and point classification", () => {
    const ck = new Checker();
    // Create a ClipShape from 3 colinear points (degenerate!)
    const clipShape = ClipShape.createShape([Point3d.create(-5, 0, 0), Point3d.create(5, 0, 0), Point3d.create(-5, 0, 0)],
      -3, 3, undefined, false, false)!;
    ck.testPointer(clipShape, "Can create ClipShape that will be parsed into a linear set of planes");
    clipShape.fetchClipPlanesRef();
    ck.testExactNumber(clipShape.classifyPointContainment([Point3d.create(-5.00001, 0, 0)], true), 3, "Point does not fall on line outside of sides - strongly outside");
    ck.testExactNumber(clipShape.classifyPointContainment([Point3d.create(0, 3, 0), Point3d.create(2, -5, 0)], true), 2, "Points cross line and within sides - ambiguous");
    ck.testExactNumber(clipShape.classifyPointContainment([Point3d.create(0, -0.00001, 0), Point3d.create(0, 0.00001, 0)], true), 2, "Points cross line and within sides - ambiguous");
    ck.testExactNumber(clipShape.classifyPointContainment([Point3d.create(4.999, 0, 2.999), Point3d.create(0, 0, 0)], true), 1, "Points fall on line and is within sides - strongly inside");

    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipShape creation (polygonal) and point proximity", () => {
    const ck = new Checker();
    const minZ = -5;
    const maxZ = 5;
    // Test point location
    const clipShape0 = ClipShape.createEmpty();
    ck.testFalse(clipShape0.isXYPolygon, "ClipShape does not contain polygon when no points are present");
    ck.testTrue(ClipShape.createShape(octagonalPoints, minZ, maxZ, undefined, true, true, clipShape0) !== undefined);
    const midpoint = Point3d.create((min2D.x + max2D.x) / 2, (min2D.y + max2D.y) / 2, (minZ + maxZ) / 2);    // Is midpoint of polygon
    ck.testFalse(clipShape0.pointInside(midpoint, 0), "Midpoint of polygon is not inside due to mask.");
    ck.testExactNumber(clipShape0.classifyPointContainment([midpoint], false), 3, "Midpoint is completely outside when ClipShape is a mask");
    const clipShape1 = ClipShape.createShape(octagonalPoints, minZ, maxZ, undefined, false, false);
    ck.testTrue(clipShape1!.pointInside(midpoint, 0), "Midpoint of polygon is inside.");

    // Test createFrom method
    ClipShape.createFrom(clipShape0, clipShape1);
    ck.testTrue(clipShapesAreEqual(clipShape0, clipShape1!), "createFrom() method should clone the ClipShape");

    // Test JSON parsing
    const jsonValue = clipShape1!.toJSON();
    ck.testTrue(jsonValue.shape !== undefined, "Shape prop created in toJSON");
    const shape = jsonValue.shape!;
    ck.testTrue(shape.points !== undefined && shape.points.length === clipShape1!.polygon.length, "Points prop created in toJSON");
    ck.testTrue(shape.invisible !== undefined && shape.invisible === true, "Invisible prop created in toJSON");
    ck.testUndefined(shape.trans, "Transform is undefined prop in toJSON having not given one to original ClipShape");
    ck.testTrue(shape.mask !== undefined && shape.mask === true, "Mask prop created in toJSON");
    ck.testTrue(shape.zlow !== undefined && shape.zlow === clipShape1!.zLow, "ZLow prop created in toJSON");
    ck.testTrue(shape.zhigh !== undefined && shape.zhigh === clipShape1!.zHigh, "ZHigh prop is set in toJSON");

    const clipShape1Copy = ClipShape.fromJSON(jsonValue) as ClipShape;
    ck.testTrue(clipShape1Copy !== undefined);
    ck.testTrue(clipShapesAreEqual(clipShape1!, clipShape1Copy), "to and from JSON yields same ClipPrimitive");

    // Test clone method
    const clipShape2 = clipShape1Copy.clone();
    ck.testTrue(clipShapesAreEqual(clipShape2, clipShape1!), "clone method produces a copy of ClipShape");
    const generalTransform = Transform.createFixedPointAndMatrix(Point3d.create(3, 2, 1), Matrix3d.createRotationAroundAxisIndex(0, Angle.createDegrees(24)));

    clipShape2.transformInPlace(generalTransform);
    ck.testFalse(clipShape2.isXYPolygon);
    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipShape plane parsing for simple concave polygon", () => {
    const ck = new Checker();
    const clipShape = ClipShape.createShape(clipPointsA)!;
    ck.testTrue(clipShape !== undefined);

    const originalRange = Range3d.createArray(clipShape.polygon);
    const areaRestriction = (originalRange.high.x - originalRange.low.x) * (originalRange.high.y - originalRange.low.y);

    const convexSetUnion = clipShape.fetchClipPlanesRef();
    if (ck.testPointer(convexSetUnion)) {
      // Let us check the area and range of these convex sets put together
      const unionRange = Range3d.create();
      let unionArea = 0;
      for (const convexSet of convexSetUnion.convexSets) {
        const trianglePoints = getPointIntersectionsOfConvexSetPlanes(convexSet, ck);
        ck.testExactNumber(trianglePoints.length, 3);
        unionRange.extendArray(trianglePoints);
        ck.testTrue(pointArrayIsSubsetOfOther(trianglePoints, clipShape.polygon), "All points of triangulated convex area of polygon should fall on boundary");
        unionArea += triangleAreaXY(trianglePoints[0], trianglePoints[1], trianglePoints[2]);
      }
      ck.testRange3d(originalRange, unionRange, "Range extended by all convex regions should match range of entire concave region.");
      ck.testTrue(unionArea <= areaRestriction, "Total area of union of convex triangles should be less than or equal to area of entire range.");
    }
    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipShape with simple concave area clips simple polygon", () => {
    const ck = new Checker();
    const clipShape = ClipShape.createShape(clipPointsA)!;

    const convexSetUnion = clipShape.fetchClipPlanesRef()!;
    // Get total area of clipShape convex regions generated
    let clipShapeArea = 0;
    for (const convexSet of convexSetUnion.convexSets) {
      const trianglePoints = getPointIntersectionsOfConvexSetPlanes(convexSet, ck);
      clipShapeArea += triangleAreaXY(trianglePoints[0], trianglePoints[1], trianglePoints[2]);
    }

    const clippedPolygons = ClipUtilities.clipPolygonToClipShapeReturnGrowableXYZArrays(polygonA, clipShape);

    // Triangulate any resulting smaller polygons that have a vertex length of greater than 3 and find total area of clipped result
    let clippedPolygonArea = 0;
    for (const polygon of clippedPolygons) {
      if (polygon.length <= 3) {
        if (polygon.length === 3)
          clippedPolygonArea += Math.abs(polygon.crossProductIndexIndexIndex(0, 1, 2)!.z * 0.5);
        continue;
      }

      const polygonGraph = Triangulator.createTriangulatedGraphFromSingleLoop(polygon);
      if (ck.testDefined(polygonGraph) && polygonGraph) {
        Triangulator.flipTriangles(polygonGraph);

        polygonGraph.announceFaceLoops((_graph: HalfEdgeGraph, edge: HalfEdge): boolean => {
          if (!edge.getMask(HalfEdgeMask.EXTERIOR)) {
            const subTrianglePoints: Point3d[] = [];
            edge.collectAroundFace((node: HalfEdge) => {
              subTrianglePoints.push(Point3d.create(node.x, node.y, 0));
            });
            ck.testExactNumber(3, subTrianglePoints.length, "Length clipped polygon piece after further triangulation must be 3");
            clippedPolygonArea += triangleAreaXY(subTrianglePoints[0], subTrianglePoints[1], subTrianglePoints[2]);
          }
          return true;
        });
      }
      ck.testCoordinate(clippedPolygonArea, clipShapeArea, "Polygon that completely encompasses clipShape should have same area as clipShape after clipping.");
    }
    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipShape with complex concave area clips polygon", () => {
    const ck = new Checker();
    const clipShape = ClipShape.createShape(clipPointsB)!;
    ck.testTrue(clipShape !== undefined);

    clipShape.fetchClipPlanesRef();
    const clippedPolygons = ClipUtilities.clipPolygonToClipShape(polygonB, clipShape);

    for (const polygon of clippedPolygons) {
      const polygonGraph = Triangulator.createTriangulatedGraphFromSingleLoop(polygon);
      if (ck.testType(polygonGraph, HalfEdgeGraph)) {
        Triangulator.flipTriangles(polygonGraph);

        polygonGraph.announceFaceLoops((_graph: HalfEdgeGraph, edge: HalfEdge): boolean => {
          if (!edge.getMask(HalfEdgeMask.EXTERIOR)) {
            const subTrianglePoints: Point3d[] = [];
            edge.collectAroundFace((node: HalfEdge) => {
              subTrianglePoints.push(Point3d.create(node.x, node.y, 0));
            });
          }
          return true;
        });
      }
    }

    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipPrimitive base class", () => {
    const ck = new Checker();
    for (const invert of [false, true]) {
      const clipper = ConvexClipPlaneSet.createXYBox(1, 1, 10, 8);
      const prim0 = ClipPrimitive.createCapture(clipper, invert);
      const prim1 = prim0.clone();
      const json2 = prim0.toJSON();
      const prim2 = ClipPrimitive.fromJSON(json2);
      if (ck.testPointer(prim2)) {
        ck.testTrue(clipPrimitivesAreEqual(prim0, prim2), "JSON round trip");
      }

      for (const prim of [prim0, prim1]) {
        ck.testBoolean(!invert, prim.pointInside(Point3d.create(7, 2, 0)));
        ck.testBoolean(invert, prim.pointInside(Point3d.create(-2, 0, 0)));
      }

    }
    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("jsonFragment", () => {
    const ck = new Checker();
    const json = [{
      planes: {
        clips: [[
          { dist: -0.09250245365197406, normal: [0, 6.123233995736765e-17, 0.9999999999999999] },
          { dist: -4.284169242532198, normal: [0, -6.123233995736765e-17, -0.9999999999999999] },
          { dist: -0.09250245365197413, normal: [0.9999999999999999, 0, 0] },
          { dist: -4.620474647250288, normal: [-0.9999999999999999, 0, 0] },
          { dist: -6.984123210872675, normal: [0, -0.9999999999999999, 6.123233995736765e-17] },
          { dist: -0.09250245365197496, normal: [0, 0.9999999999999999, -6.123233995736765e-17] }]],
      },
    }];
    const clipper = ClipVector.fromJSON(json);
    if (ck.testPointer(clipper, "ClipVector.fromJSON for test fragment") && clipper) {
      const q = 10.0; // big enough so that adding or subtracting from any inside point moves outside.
      for (const x of [0, 4]) {
        for (const y of [0, 6]) {
          for (const z of [0, 4]) {
            ck.testTrue(clipper.pointInside(Point3d.create(x, y, z)), x, y, z);
            ck.testFalse(clipper.pointInside(Point3d.create(x + q, y, z)), x, y, z);
            ck.testFalse(clipper.pointInside(Point3d.create(x - q, y, z)), x, y, z);

            ck.testFalse(clipper.pointInside(Point3d.create(x, y + q, z)), x, y, z);
            ck.testFalse(clipper.pointInside(Point3d.create(x, y - q, z)), x, y, z);

            ck.testFalse(clipper.pointInside(Point3d.create(x, y, z + q)), x, y, z);
            ck.testFalse(clipper.pointInside(Point3d.create(x, y, z - q)), x, y, z);
          }
        }
      }

      const clipPrimitives = clipper.clips;
      for (const p of clipPrimitives) {
        const convexSets = p.fetchClipPlanesRef()!;
        for (const cs of convexSets.convexSets) {
          const r = Range3d.createNull();
          const points: Point3d[] = [];
          cs.computePlanePlanePlaneIntersections(points, r);
          for (const xyz of points) {
            ck.testTrue(cs.isPointOnOrInside(xyz, 0.001), xyz);
          }
          if (Checker.noisy.convexSetCorners) {
            console.log(` Convex Set range ${prettyPrint(r.toJSON())}`);
            for (const xyz of points) {
              console.log(`Corner ${prettyPrint(xyz)}`);
            }
          }
        }
      }
    }
    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipVectorWithHole", () => {
    const ck = new Checker();
    const convexClip = ConvexClipPlaneSet.createXYBox(-1, -2, 8, 10);
    const outerClip = ClipPrimitive.createCapture(convexClip.clone());
    ck.testFalse(outerClip.invisible);
    const rangeB = Range3d.createXYZXYZ(2000, 2000, 2000, 2001, 2001, 2001);
    const holeClip = ClipPrimitive.createCapture(ConvexClipPlaneSet.createXYBox(1, 1, 4, 5), true);
    ck.testTrue(holeClip.invisible);
    const clipVector0 = ClipVector.create([outerClip, holeClip]);
    const clipVector1 = clipVector0.clone();
    const json0 = clipVector0.toJSON();
    const clipVector2 = ClipVector.fromJSON(json0);
    // console.log(prettyPrint(json0));
    // const json2 = clipVector2.toJSON();
    // console.log(prettyPrint(json2));
    for (const cv of [clipVector0, clipVector1, clipVector2]) {
      ck.testTrue(cv.pointInside(Point3d.create(7, 2)));
      ck.testTrue(cv.pointInside(Point3d.create(0, 0)));
      ck.testFalse(cv.pointInside(Point3d.create(20, 2)));
      ck.testFalse(cv.pointInside(Point3d.create(-1.1, 0)));
      ck.testFalse(cv.pointInside(Point3d.create(2, 2)));
    }
    const bigQ = 1000.0;
    const outerRange = Range3d.createXYZXYZ(-bigQ, -bigQ, -bigQ, bigQ, bigQ, bigQ);

    for (const range of [outerRange, rangeB]) {
      const rangeOfUndefinedClipper = ClipUtilities.rangeOfClipperIntersectionWithRange(undefined, range);
      ck.testRange3d(rangeOfUndefinedClipper, range, "undefined clipper");
      ck.testBoolean(ClipUtilities.doesClipperIntersectRange(undefined, range), !rangeOfUndefinedClipper.isNull);

      const outerClipRange = ClipUtilities.rangeOfClipperIntersectionWithRange(outerClip, range);
      ck.testBoolean(ClipUtilities.doesClipperIntersectRange(outerClip, range), !outerClipRange.isNull, "outer clipper");

      const holeClipRange = ClipUtilities.rangeOfClipperIntersectionWithRange(holeClip, range);
      ck.testBoolean(ClipUtilities.doesClipperIntersectRange(holeClip, range), !holeClipRange.isNull, "hole clipper");

      const clippedRange = ClipUtilities.rangeOfClipperIntersectionWithRange(clipVector1, range);
      ck.testBoolean(ClipUtilities.doesClipperIntersectRange(clipVector1, range), !clippedRange.isNull, "ClipVector clipper");

      const convexClipRange = ClipUtilities.rangeOfClipperIntersectionWithRange(convexClip, range);
      ck.testBoolean(ClipUtilities.doesClipperIntersectRange(convexClip, range), !convexClipRange.isNull, "convex clipper");

      console.log("outerRange", outerRange);
      console.log("outerClipRange", outerClipRange);
      console.log("holeClipRange", holeClipRange);
      console.log("clippedRange", clippedRange);
    }
    ck.checkpoint();
    expect(ck.getNumErrors()).equals(0);
  });

});
