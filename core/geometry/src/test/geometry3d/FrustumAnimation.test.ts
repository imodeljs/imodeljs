/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { SmoothTransformBetweenFrusta } from "../../geometry3d/FrustumAnimation";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Transform } from "../../geometry3d/Transform";
import { YawPitchRollAngles } from "../../geometry3d/YawPitchRollAngles";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

/* eslint-disable no-console */
/**
 * create a linestring that walks around all the edges (and some decoration) for a frustum defined by corners.
 * @param corners
 */
function cornersToLineString(corners: Point3d[]): LineString3d {
  return LineString3d.create(
    [corners[0], corners[1], corners[3], corners[2], corners[0],  // back rectangle
    corners[4],         // move to front
    corners[5], corners[1], corners[5], // front edge plus move to same back point and double back to front
    corners[7], corners[3], corners[7],
    corners[6], corners[2], corners[6],
    corners[4],
    corners[0],
    corners[0].interpolate(4.0, corners[4]),   // Show z direction
    corners[0],
    corners[0].interpolate(1.2, corners[1]), // some asymmetric decoration on xy face
    corners[0].interpolate(0.5, corners[1]), // some asymmetric decoration on xy face
    corners[0].interpolate(0.5, corners[2])]);
}
/**
 * Within the given coordinate frame (usually rigid) make the 8 corners of a frustum
 * @param frame frame with center on back plane, xy plane is back plane, z is towards eye
 * @param ax x axis half width
 * @param ay y axis half width
 * @param az z axis distance to front plane
 * @param fz frustum contraction from back to front.
 */
function createFrustumPoints(frame: Transform, ax: number, ay: number, az: number, fz: number): Point3d[] {
  return [
    frame.multiplyXYZ(-ax, -ay, 0.0),
    frame.multiplyXYZ(ax, -ay, 0.0),
    frame.multiplyXYZ(-ax, ay, 0.0),
    frame.multiplyXYZ(ax, ay, 0.0),
    frame.multiplyXYZ(-fz * ax, -fz * ay, az),
    frame.multiplyXYZ(fz * ax, -fz * ay, az),
    frame.multiplyXYZ(-fz * ax, fz * ay, az),
    frame.multiplyXYZ(fz * ax, fz * ay, az)];
}

describe("FrustumAnimation", () => {
  it("General", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const c20 = Math.cos(Angle.degreesToRadians(20));
    const s20 = Math.sin(Angle.degreesToRadians(20));
    let dy = 0.0;
    for (const frame0 of [
      Transform.createIdentity(),
      Transform.createOriginAndMatrix(Point3d.create(-2, 2, -1),
        YawPitchRollAngles.createDegrees(10, 5, 30).toMatrix3d())]
    ) {
      let dx = 0.0;
      for (const frame1 of [
        Transform.createTranslationXYZ(1, 2, 15),
        // rotate 90 degrees while shifting along the x axis.
        Transform.createRowValues(
          c20, -s20, 0, 40,
          s20, c20, 0, 0,
          0, 0, 1, 0),
        // rotate 90 degrees while shifting along the x axis.
        Transform.createRowValues(
          0, -1, 0, 40,
          1, 0, 0, 0,
          0, 0, 1, 0),
        // rotate 180 degrees z and around center
        Transform.createRowValues(
          -1, 0, 0, 0,
          0, -1, 0, 0,
          0, 0, 1, 0),
        // rotate 180 degrees around z while shifting y
        Transform.createRowValues(
          -1, 0, 0, 0,
          0, -1, 0, 80,
          0, 0, 1, 0),
        // translate the back plane, but re-aim the eye vector (SKEW)
        Transform.createRowValues(
          1, 0, 1, 0,
          0, 1, 2, 30,
          0, 0, 3, 0)]) {
        const cornerA = createFrustumPoints(frame0, 4, 3, 2, 1);
        const cornerB = createFrustumPoints(frame1, 2, 4, 3, 0.5);
        GeometryCoreTestIO.captureGeometry(allGeometry, cornersToLineString(cornerA).clone(), dx, dy, 0);
        GeometryCoreTestIO.captureGeometry(allGeometry, cornersToLineString(cornerB).clone(), dx, dy, 0);
        const context = SmoothTransformBetweenFrusta.create(cornerA, cornerB);
        if (ck.testPointer(context)) {
          const g = 0.05;
          const dy1 = dy + 100;
          for (const fraction of [0.0, g, 2.0 * g, 0.25, 0.5, 0.75, 1.0 - 2.0 * g, 1.0 - g, 1.0]) {
            const cornerF = context.fractionToWorldCorners(fraction);
            GeometryCoreTestIO.captureGeometry(allGeometry, cornersToLineString(cornerF), dx, dy1, 0);

          }
        }
        dx += 100.0;
      }
      dy += 400.0;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "Geometry3d", "FrustumAnimation.General");
    expect(ck.getNumErrors()).equals(0);
  });

  it("PureRotation", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const axisA = Vector3d.create(1, -2, 5);
    const axisB = Vector3d.create(1, 10, 1);
    const primaryOrigin = Point3d.create(15, 3, 4);
    const axisLineScale = 10.0;
    let dy = 0.0;
    let dx = 0.0;
    for (const frame0 of [
      Transform.createIdentity(),
      Transform.createOriginAndMatrix(Point3d.create(-2, 2, -1),
        YawPitchRollAngles.createDegrees(10, 5, 30).toMatrix3d()),
      Transform.createOriginAndMatrix(Point3d.create(5, 2, 0),
        YawPitchRollAngles.createDegrees(2, 5, 5).toMatrix3d())]
    ) {
      dy = 0.0;
      for (const degrees of [10, 50, 80, 110]) {
        for (const axis of [Vector3d.unitZ(), axisA, axisB]) {
          const ray = Ray3d.create(primaryOrigin, axis);
          const e = 25.0;
          const rotation = Transform.createFixedPointAndMatrix(primaryOrigin, Matrix3d.createRotationAroundVector(axis, Angle.createDegrees(degrees))!);
          for (const frustumScale of [1, 3, 8]) {   // large scale should get rotation axis inside frustum !!!
            const cornerA = createFrustumPoints(frame0, frustumScale * 4, frustumScale * 3, frustumScale * 2, 1);
            const cornerB = rotation.multiplyPoint3dArray(cornerA);
            GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(primaryOrigin, primaryOrigin.plusScaled(axis, axisLineScale)), dx, dy, 0);
            GeometryCoreTestIO.captureGeometry(allGeometry, cornersToLineString(cornerA).clone(), dx, dy, 0);
            GeometryCoreTestIO.captureGeometry(allGeometry, cornersToLineString(cornerB).clone(), dx, dy, 0);
            // we expect that rotationalContext is the true rotation
            const rotationalContext = SmoothTransformBetweenFrusta.create(cornerA, cornerB, true)!;
            // this context slides the midpoint on a line (instead of on the simple rotation path)
            const contextB = SmoothTransformBetweenFrusta.create(cornerA, cornerB, false)!;
            if (ck.testPointer(rotationalContext)) {
              const originA = rotationalContext.localToWorldA.getOrigin();
              const originB = rotationalContext.localToWorldB.getOrigin();
              const projectionA = ray.projectPointToRay(originA);
              const projectionB = ray.projectPointToRay(originB);
              ck.testPoint3d(originA, projectionA, "animation start is on true axis");
              ck.testPoint3d(originB, projectionB, "animation end is on true axis");
              const dy1 = dy + 500;
              GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(primaryOrigin, primaryOrigin.plusScaled(axis, axisLineScale)), dx, dy1, 0);
              for (const fraction of [0.0, 0.25, 0.50, 0.75, 1.0]) {
                const cornerFA = rotationalContext.fractionToWorldCorners(fraction);
                GeometryCoreTestIO.captureGeometry(allGeometry, cornersToLineString(cornerFA), dx, dy1, 0);
                const cornerFB = contextB.fractionToWorldCorners(fraction);
                GeometryCoreTestIO.captureGeometry(allGeometry, cornersToLineString(cornerFB), dx + e * axis.x, dy1 + axis.y, e * axis.z);
              }
            }
            dy += 1000.0;
          }
        }
      }
      dx += 2000.0;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "Geometry3d", "FrustumAnimation.PureRotation");
    expect(ck.getNumErrors()).equals(0);
  });
});

/**
 * Compute an intermediate eye point as it swings around a moving target with rotating axes and varying distance to target.
 * (eye, target, distance) is redundant -- implementation problem is to figure out which to use for compatibility with subsequent view setup.
 */
function interpolateSwingingEye(
  axes0: Matrix3d,
  eye0: Point3d,
  distance0: number,
  axes1: Matrix3d,
  eye1: Point3d,
  distance1: number,
  fraction: number,
  axesAtFraction: Matrix3d
): { target: Point3d, eye: Point3d, distance: number } {
  const z0 = axes0.rowZ();
  const z1 = axes1.rowZ();
  const zA = axesAtFraction.rowZ();
  const target0 = eye0.plusScaled(z0, -distance0);
  const target1 = eye1.plusScaled(z1, -distance1);
  const targetA = target0.interpolate(fraction, target1);
  // const distanceA = 1.0 / Geometry.interpolate(1.0 / distance0, fraction, 1.0 / distance1);
  const distanceA = Geometry.interpolate(distance0, fraction, distance1);
  const eyeA = targetA.plusScaled(zA, distanceA);
  return {
    target: targetA,
    eye: eyeA,
    distance: distanceA,
  };
}

describe("FrustumSwing", () => {
  it("PureTranslation", () => {
    const ck = new Checker();
    // const allGeometry: GeometryQuery[] = [];
    const identity = Matrix3d.createIdentity();
    const pointA = Point3d.create(1, 2, 3);
    const pointB = Point3d.create(4, 2, 1);
    const a = 10.0;
    for (const f of [0.0, 0.4, 1.0]) {
      const data = interpolateSwingingEye(identity, pointA, a, identity, pointB, a, f, identity);
      ck.testPoint3d(pointA.interpolate(f, pointB), data.eye);
    }
    // GeometryCoreTestIO.saveGeometry(allGeometry, "FrustumSwing", "MoveLinear");
    expect(ck.getNumErrors()).equals(0);
  });
});
