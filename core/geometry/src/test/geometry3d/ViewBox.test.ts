/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Arc3d } from "../../curve/Arc3d";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Loop } from "../../curve/Loop";
import { StandardViewIndex } from "../../Geometry";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Transform } from "../../geometry3d/Transform";
import { YawPitchRollAngles } from "../../geometry3d/YawPitchRollAngles";
import { IndexedPolyface } from "../../polyface/Polyface";
import { PolyfaceBuilder } from "../../polyface/PolyfaceBuilder";
import { Sample } from "../../serialization/GeometrySamples";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

/* eslint-disable no-console */
/* Create an XYZ triad with arcs to clarify XY and XYZ planes
 */
function makeViewableGeometry(): GeometryQuery[] {
  const geometry = [];
  geometry.push(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)));
  geometry.push(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 1, 0)));
  geometry.push(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 0, 1.5)));
  geometry.push(LineString3d.create(
    [Point3d.create(-1, -1, -1),
    Point3d.create(1, -1, -1),
    Point3d.create(1, -1, 1),
    Point3d.create(-1, -1, 1),
    Point3d.create(-1, -1, -1),
    Point3d.create(-1, -1, -1)]));
  geometry.push(LineString3d.create(
    [Point3d.create(-1, 1, -1),
    Point3d.create(1, 1, -1),
    Point3d.create(1, 1, 1),
    Point3d.create(-1, 1, 1),
    Point3d.create(-1, 1, -1),
    Point3d.create(-1, 1, -1)]));

  geometry.push(LineSegment3d.createXYZXYZ(1, -1, -1, 1, 1, -1));
  geometry.push(LineSegment3d.createXYZXYZ(1, -1, 1, 1, 1, 1));

  geometry.push(LineSegment3d.createXYZXYZ(-1, -1, -1, -1, 1, -1));
  geometry.push(LineSegment3d.createXYZXYZ(-1, -1, 1, -1, 1, 1));

  const a = 0.5;
  geometry.push(Arc3d.create(Point3d.create(0, 0, 0), Vector3d.create(a, 0, 0), Vector3d.create(0, a, 0), AngleSweep.createStartSweepDegrees(0, 105)));
  const b = 0.25;
  // triangle in xz plane
  geometry.push(Loop.createPolygon([
    Point3d.create(0, 0, 0),
    Point3d.create(b, 0, 0),
    Point3d.create(0, 0, b)]));
  // skinnier triangle in yz plane -- to higher z
  geometry.push(Loop.createPolygon([
    Point3d.create(0, 0, 0),
    Point3d.create(0, b * 0.5, 0),
    Point3d.create(0, 0, 1.5 * b)]));
  return geometry;
}
// Gather viewable geometry from MakeViewAbleGeometry
// create viewing setup from given vectors local Z, Y rotations.
// append the (rotated) geometry to the GeometryQuery[].
//
function collectViewableGeometry(ck: Checker, geometry: GeometryQuery[], rightVector: Vector3d, upVector: Vector3d, leftNoneRight: number, topNoneBottom: number, xShift: number, yShift: number, expectedIndex: StandardViewIndex | 0) {
  const geometry0 = makeViewableGeometry();
  const axes0 = Matrix3d.createViewedAxes(rightVector, upVector, leftNoneRight, topNoneBottom)!;
  if (expectedIndex !== 0) {
    const standardAxes = Matrix3d.createStandardWorldToView(expectedIndex, true);
    ck.testMatrix3d(axes0, standardAxes, "standard view axis check");
  }
  const axes1 = axes0.transpose();
  /*
  const frame0 = Transform.createOriginAndMatrix(Point3d.create(xShift, yShift - 4, 0), axes0);

  for (const g of geometry0) {
    geometry.push(g.cloneTransformed(frame0)!);
  }
   */
  const frame1 = Transform.createOriginAndMatrix(Point3d.create(xShift, yShift, 0), axes1);
  for (const g of geometry0) {
    geometry.push(g.cloneTransformed(frame1)!);
  }

}
// Gather viewable geometry from MakeViewAbleGeometry
// create viewing setup from given vectors local Z, Y rotations.
// append the (rotated) geometry to the GeometryQuery[].
//
function collectViewableGeometryByXYZ(geometry: GeometryQuery[], x: number, y: number, z: number) {
  const geometry0 = makeViewableGeometry();
  const axes0 = Matrix3d.createRigidViewAxesZTowardsEye(x, y, z)!;
  /*
  const frame0 = Transform.createOriginAndMatrix(Point3d.create(xShift, yShift - 4, 0), axes0);

  for (const g of geometry0) {
    geometry.push(g.cloneTransformed(frame0)!);
  }
   */
  const frame1 = Transform.createOriginAndMatrix(Point3d.create(x, y, z), axes0);
  for (const g of geometry0) {
    geometry.push(g.cloneTransformed(frame1)!);
  }

}
class PointLattice {
  public xCoordinates: number[] = [];
  public yCoordinates: number[] = [];
  public zCoordinates: number[] = [];
  public wrap: boolean = false;
  // construct with given arrays.
  // xCoordinates are required
  // If yCoordinates are missing, use xCoordinates
  // If zCoordinates are missing, use yCoordinates (which may have been defaulted to xCoordinates)
  public constructor(xCoordinates: number[], yCoordinates?: number[], zCoordinates?: number[]) {
    this.xCoordinates = xCoordinates.slice();
    this.yCoordinates = yCoordinates ? yCoordinates.slice() : this.xCoordinates.slice();
    this.zCoordinates = zCoordinates ? zCoordinates.slice() : this.yCoordinates.slice();
  }
  public getPoint(i: number, j: number, k: number, result?: Point3d): Point3d {
    return Point3d.create(this.xCoordinates[i], this.yCoordinates[j], this.zCoordinates[k], result);
  }
  // consider a cube with lattice corner indices (i0,j0,k0) and (i0+1, j0+1, k0+1)
  // if any are exterior, create an IndexedPolyface with the exterior polygons.
  // REMARK tag is unused -- for future use in tagging the various meshes, e.g. as vertex/edge/face
  public createMeshOnLatticeCubeExteriorFaces(i0: number, j0: number, k0: number, tag: number): IndexedPolyface | undefined {
    if (tag === -1)   // tag is unused otherwise .. get by the compiler complaint
      return undefined;
    const builder = PolyfaceBuilder.create();
    const corners = [];
    for (const k of [k0, k0 + 1]) {
      for (const j of [j0, j0 + 1]) {
        for (const i of [i0, i0 + 1]) {
          corners.push(this.getPoint(i, j, k));
        }
      }
    }
    if (i0 === 0)
      builder.addPolygon([corners[0], corners[4], corners[6], corners[2]]);
    if (i0 + 2 === this.xCoordinates.length)
      builder.addPolygon([corners[1], corners[3], corners[7], corners[5]]);

    if (j0 === 0)
      builder.addPolygon([corners[0], corners[1], corners[5], corners[4]]);
    if (j0 + 2 === this.yCoordinates.length)
      builder.addPolygon([corners[2], corners[6], corners[7], corners[3]]);

    if (k0 === 0)
      builder.addPolygon([corners[0], corners[2], corners[3], corners[1]]);
    if (k0 + 2 === this.zCoordinates.length)
      builder.addPolygon([corners[4], corners[5], corners[7], corners[6]]);
    const polyface = builder.claimPolyface(true);
    if (polyface.facetCount > 0)
      return polyface;
    return undefined;
  }

}
describe("ViewWidget", () => {
  it("CubeGeometry", () => {
    const geometry = [];
    for (const lattice of [
      new PointLattice([0, 0.2, 0.8, 1.0]),
      new PointLattice([0, 0.4, 1.6, 2.0],
        [2, 2.2, 2.8, 3.0],
        [0, 0.1, 0.4, 0.5]),
    ]
    ) {
      // 8 corners
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 0, 0, 0)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 0, 0, 1)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 2, 0, 2)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 2, 0, 3)!);

      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 0, 2, 4)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 0, 2, 5)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 2, 2, 6)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 2, 2, 7)!);

      // 12 edges
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 1, 0, 100)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 1, 0, 101)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 1, 2, 102)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 1, 2, 103)!);

      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 0, 0, 110)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 2, 0, 111)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 0, 2, 112)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 2, 2, 113)!);

      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 0, 1, 120)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 0, 1, 121)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 2, 1, 122)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 2, 1, 123)!);
      // 6 faces
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(0, 1, 1, 201)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(2, 1, 1, 202)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 0, 1, 203)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 2, 1, 204)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 1, 0, 205)!);
      geometry.push(lattice.createMeshOnLatticeCubeExteriorFaces(1, 1, 2, 206)!);

    }
    if (geometry)
      GeometryCoreTestIO.saveGeometry(geometry, "ViewWidget", "CubeGeometry");
  });

  it("StandardViews", () => {
    const ck = new Checker();
    const geometry: GeometryQuery[] = [];

    const b = 30;
    const a = b * 0.5;
    collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitY(), 0, 0, 0, b, StandardViewIndex.Top);  // TOP

    collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), 0, 0, 0, 0, StandardViewIndex.Front);  // FRONT
    collectViewableGeometry(ck, geometry, Vector3d.unitY(), Vector3d.unitZ(), 0, 0, b, 0, StandardViewIndex.Right); // RIGHT
    collectViewableGeometry(ck, geometry, Vector3d.unitX(-1), Vector3d.unitZ(), 0, 0, 2 * b, 0, StandardViewIndex.Back); // BACK
    collectViewableGeometry(ck, geometry, Vector3d.unitY(-1), Vector3d.unitZ(), 0, 0, -b, 0, StandardViewIndex.Left); // LEFT

    collectViewableGeometry(ck, geometry, Vector3d.unitX(1), Vector3d.unitY(-1), 0, 0, 0, -b, StandardViewIndex.Bottom); // BOTTOM
    // full iso views
    collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), 1, 1, a, a, StandardViewIndex.RightIso);  // RIGHT FRONT ISO (bottom to top)
    collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), -1, 1, -a, a, StandardViewIndex.Iso);  // LEFT FRONT ISO (bottom to top)

    // incremental iso views based on front
    for (const isoFactor of [0.5, -0.25, 0, 0.25, 0.5]) {
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), 1, isoFactor, a, isoFactor * a, 0);  // RIGHT FRONT ISO (bottom to top)
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), -1, isoFactor, -a, isoFactor * a, 0);  // LEFT FRONT ISO (bottom to top)
    }

    for (const cornerFactor of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), cornerFactor, 0, cornerFactor * a, 0, 0);  // left to right swings from front
    }
    for (const cornerFactor of [-3, -1, 1, 3]) {
      // look in from middle of all vertical edges . . .
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), cornerFactor, 0, cornerFactor * a, 0, 0);  // swing front to 4 corners.
      // look in down and up from vertical edge
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), cornerFactor, 1, cornerFactor * a, a, 0);
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), cornerFactor, -1, cornerFactor * a, -a, 0);
    }
    // look in from all horizontal edges
    const q = Math.PI * 0.25 / Math.atan(Math.sqrt(0.5));
    for (const cornerFactor of [-2, 0, 2, 4]) {
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), cornerFactor, q, cornerFactor * a, a, 0);  // swing front to edges and look down
      collectViewableGeometry(ck, geometry, Vector3d.unitX(), Vector3d.unitZ(), cornerFactor, q, cornerFactor * a, -a, 0);  // swing front to edges and look up
    }

    // lay out the unfolded box
    for (const origin of [
      Point3d.create(-a, -3 * a),
      Point3d.create(-3 * a, -a),
      Point3d.create(-a, -a),
      Point3d.create(a, -a),
      Point3d.create(3 * a, -a),
      Point3d.create(-a, a),
    ]) {
      geometry.push(LineString3d.createRectangleXY(origin, b, b, true));
    }

    GeometryCoreTestIO.saveGeometry(geometry, "ViewWidget", "StandardViews");
    expect(ck.getNumErrors()).equals(0);
  });
});

it("StandardViewsByXYZ", () => {
  const ck = new Checker();
  const a = 10.0;
  const geometry = Sample.createCenteredBoxEdges(a, a, a, 0, 0, 0);

  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        collectViewableGeometryByXYZ(geometry, a * x, a * y, a * z);
        if (x !== 0.0 || y !== 0.0) {
          const axis0 = Matrix3d.createRigidHeadsUp(Vector3d.create(x, y, z));
          const axis1 = Matrix3d.createRigidViewAxesZTowardsEye(x, y, z);
          ck.testMatrix3d(axis0, axis1, "Alternate construction of eye frame");
        }
      }
    }
  }

  GeometryCoreTestIO.saveGeometry(geometry, "ViewWidget", "FromXYZ");
  expect(ck.getNumErrors()).equals(0);
});

describe("RaggedMatrix", () => {
  it("FromCSS", () => {
    const ck = new Checker();
    // a supposedly rigid matrix received in .css . . .   but plainly it has only 6 digits.
    const raggedMatrix = Matrix3d.createRowValues(
      0.707421, -0.415747, -0.571585,
      0, 0.808703, -0.588217,
      0.706792, 0.416117, 0.572094);
    if (Checker.noisy.raggedViewMatrix) {
      console.log(" ragged matrix ", raggedMatrix.toJSON());
      console.log("   determinant", raggedMatrix.determinant());
      console.log("  column scales", raggedMatrix.columnX().magnitude(), raggedMatrix.columnY().magnitude(), raggedMatrix.columnZ().magnitude());
      console.log("     row scales", raggedMatrix.rowX().magnitude(), raggedMatrix.rowY().magnitude(), raggedMatrix.rowZ().magnitude());
    }
    const yprA = YawPitchRollAngles.createDegrees(0, 0, 0);
    const yprB = YawPitchRollAngles.createFromMatrix3d(raggedMatrix, yprA);
    // we expect this has failed (returned undefined) but nonetheless placed some angles in yprA . .
    ck.testUndefined(yprB, " expect no ypr from ragged matrix");
    const cleanMatrix = Matrix3d.createRigidFromMatrix3d(raggedMatrix)!;
    const yprC = YawPitchRollAngles.createFromMatrix3d(cleanMatrix);
    ck.testPointer(yprC, "Expect ypr from corrected matrix");
    const maxDiff = cleanMatrix.maxDiff(raggedMatrix);
    const matrixB = yprA.toMatrix3d();
    const matrixC = yprC!.toMatrix3d();
    const diffBC = matrixB.maxDiff(matrixC);
    const diffAB = matrixB.maxDiff(raggedMatrix);
    ck.testLT(diffBC, 5.0e-7, "ragged matrix YPR round trip versus cleanup rigid");
    ck.testLT(diffAB, 5.0e-7, "ragged matrix YPR round trip versus raggedMatrix");
    if (Checker.noisy.raggedViewMatrix) {
      console.log(" clean matrix ", cleanMatrix.toJSON());
      console.log(` maxDiff ${maxDiff}`);
      console.log("Clean ypr", yprC);
      console.log("maxDiff between ypr round trips", diffBC);
    }
    expect(ck.getNumErrors()).equals(0);
  });
});
