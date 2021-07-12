/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Point2d, Vector2d } from "../../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { YawPitchRollAngles } from "../../geometry3d/YawPitchRollAngles";
import { Degree2PowerPolynomial } from "../../numerics/Polynomials";
import { Checker } from "../Checker";

/* eslint-disable no-console */

describe("Geometry", () => {
  it("simple 2d and 3d point and constructions", () => {
    const ck = new Checker();
    const vector1 = new Vector3d(1, 2, 3);

    expect(vector1.x).equals(1);
    expect(vector1.y).equals(2);
    expect(vector1.z).equals(3);

    const point2dA = Point2d.create(1, 2);
    const vector2dA = Vector2d.create(3, 7);
    const point2dB = point2dA.plus(vector2dA);
    ck.testCoordinate(point2dA.distance(point2dA), 0, "zero distance to self");
    ck.testCoordinate(vector2dA.magnitude(), point2dA.distance(point2dB), "magnitude and distance");

    const point3dA = Point3d.create(1, 2);
    const vector3dA = Vector3d.create(3, 7);
    const point3dB = point3dA.plus(vector3dA);
    ck.testCoordinate(point3dA.distance(point3dA), 0, "zero distance to self");
    ck.testCoordinate(vector3dA.magnitude(), point3dA.distance(point3dB), "magnitude and distance");
    ck.checkpoint("End Geometry.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });

  it("To/From JSON", () => {
    const a1 = Angle.createDegrees(30.0);
    let json = JSON.stringify(a1);
    const a2 = Angle.fromJSON(JSON.parse(json));
    const a3 = Angle.fromJSON(a1);
    const a4 = Angle.fromJSON({ degrees: 30 });
    assert.deepEqual(a1, a2);
    assert.deepEqual(a1, a3);
    assert.deepEqual(a1, a4);
    assert.deepEqual(Angle.zero(), Angle.fromJSON());
    assert.deepEqual(Angle.createRadians(1.0), Angle.fromJSON({ radians: 1.0 }));
    assert.deepEqual(Angle.createRadians(1.0), Angle.fromJSON(undefined, 1.0));

    const ypr1 = new YawPitchRollAngles(Angle.createDegrees(30), Angle.create360(), Angle.createDegrees(90));
    json = JSON.stringify(ypr1);
    assert.deepEqual(ypr1, YawPitchRollAngles.fromJSON(JSON.parse(json)));
    assert.deepEqual(new YawPitchRollAngles(), YawPitchRollAngles.fromJSON({ yaw: 0 }));
    assert.deepEqual(new YawPitchRollAngles(), YawPitchRollAngles.fromJSON(undefined));

    const p1 = new Point3d(1, 3, 56);
    json = JSON.stringify(p1);
    assert.deepEqual(p1, Point3d.fromJSON(JSON.parse(json)));
    assert.deepEqual(p1, Point3d.fromJSON(p1));
    assert.deepEqual(p1, Point3d.fromJSON({ x: 1, y: 3, z: 56 }));
    assert.deepEqual(new Point3d(1, 2, 0), Point3d.fromJSON({ y: 2, x: 1 } as any));
    assert.deepEqual(p1, Point3d.fromJSON([1, 3, 56]));
    assert.deepEqual(Point3d.fromJSON(undefined), Point3d.createZero());
    assert.deepEqual(Point3d.fromJSON({} as any), Point3d.createZero());

    const v1 = new Vector3d(1, 3, 56);
    json = JSON.stringify(p1);
    const v2 = Vector3d.fromJSON(JSON.parse(json));
    const v3 = Vector3d.fromJSON(p1);
    assert.deepEqual(v1, v2);
    assert.deepEqual(v1, v3);
    assert.deepEqual(v1, Vector3d.fromJSON({ x: 1, y: 3, z: 56 }));
    assert.deepEqual(v1, Vector3d.fromJSON([1, 3, 56]));
    assert.deepEqual(Vector3d.fromJSON(undefined), Vector3d.createZero());
  });
});

class GeometryCheck {
  public ck: Checker;
  public constructor() { this.ck = new Checker(); }

  public testTrigForm(a: number, cosCoff: number, sinCoff: number): void {
    const rootA = Geometry.solveTrigForm(a, cosCoff, sinCoff);
    if (rootA !== undefined && this.ck.testPointer(rootA)) {
      let xy;
      for (xy of rootA) {
        this.ck.testCoordinate(0.0, a + cosCoff * xy.x + sinCoff * xy.y, "trig root");
        this.ck.testCoordinate(1.0, xy.magnitude(), "trig root on unit circle");
      }
    } else {
      // no roots. expect trig condition ....
      this.ck.testCoordinateOrder(Geometry.hypotenuseXY(cosCoff, sinCoff), Math.abs(a), " no-root coff condition");
    }

  }
  public testQuadratic(a: number, b: number, c: number): void {
    const rootA = Degree2PowerPolynomial.solveQuadratic(a, b, c);
    if (rootA !== undefined) {
      let root;
      for (root of rootA) {
        this.ck.testCoordinate(0.0, a * root * root + b * root + c, "quadratic root");
      }
    } else {
      this.ck.testCoordinateOrder(b * b - 4 * a * c, 0.0, " no-root coff condition");
    }

  }
}
describe("Geometry.solveTrigForm", () => {
  it("Geometry.solveTrigForm", () => {
    const gc = new GeometryCheck();
    gc.testTrigForm(0, 1, 0);
    gc.testTrigForm(0.2, 0.3, 0.9);
    gc.testTrigForm(5, 1, 1);  // no solutions !!!

    expect(gc.ck.getNumErrors()).equals(0);
  });
});
describe("Geometry.solveQuadratic", () => {
  it("Geometry.solveQuadratic", () => {
    const gc = new GeometryCheck();
    gc.testQuadratic(2, -11, 5); // two real and different roots
    gc.testQuadratic(-4, 12, -9); // one real root
    gc.testQuadratic(1, -3, 4); // imaginary root

    expect(gc.ck.getNumErrors()).equals(0);
  });
});
describe("Geometry.modulo", () => {
  it("Geometry.modulo", () => {
    const ck = new Checker();
    for (const period of [10, 40, 37]) {
      for (const a of [0, 5, -1]) {
        const a0 = a >= 0 ? a : period + a; // We assume negative a is within period.  a0 is expected result from all mod uses.
        const a1 = Geometry.modulo(a, period);
        ck.testCoordinate(a0, a1, "simple modulo case");
        for (const m of [1, 2, 5, 2000, -1, -2, -5, -2000]) {
          const a2 = a + m * period;
          const a3 = Geometry.modulo(a2, period);
          ck.testCoordinate(a0, a3, "modulo", a1, period);
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("AngleJSON", () => {
    const ck = new Checker();
    const gc = new GeometryCheck();
    for (const degrees of [-179, -20, 0, 90, 180]) {
      const theta = Angle.createDegrees(degrees);
      const jsonValue = theta.toJSON();
      const theta1 = Angle.createDegrees(1000);
      const theta2 = Angle.createDegrees(1000);
      const theta3 = Angle.createDegrees(1000);
      theta1.setFromJSON(jsonValue);
      ck.testAngleAllowShift(theta, theta1, "JSON round trip");
      theta2.setFromJSON(theta.radians); // NUMBER
      ck.testAngleAllowShift(theta, theta1, "JSON: simple number (radians)");
      theta3.setFromJSON(theta); // typed Angle
      ck.testAngleAllowShift(theta, theta3, "JSON: strongly typed Angle object");

    }
    expect(gc.ck.getNumErrors()).equals(0);
  });
});

describe("Vector3d.CrossProduct", () => {
  it("Vector3d.CrossProduct", () => {
    const ck = new Checker();
    const U = Vector3d.create(1, 2, 3);
    const V = Vector3d.create(3, -2, -1.5);
    const W = U.crossProduct(V);
    ck.testPerpendicular(U, W);
    ck.testPerpendicular(V, W);
    const frame = Matrix3d.createRigidHeadsUp(W);
    ck.testPerpendicular(frame.columnX(), W);
    ck.testPerpendicular(frame.columnY(), W);
    ck.testParallel(frame.columnZ(), W);
    ck.testBoolean(true, frame.isRigid());
    ck.testCoordinate(W.magnitude(), U.magnitude() * V.magnitude() * U.angleTo(V).sin());
    ck.checkpoint("CrossProduct");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("GeometryA", () => {
  it("LexicalCompare", () => {
    const ck = new Checker();
    // These xy points are lexically for sweeping in y direction.
    const yxSequence = [
      Point2d.create(0, 0),
      Point2d.create(1, 0),
      Point2d.create(1, 1),
      Point2d.create(0, 2),
      Point2d.create(2, 2),
      Point2d.create(3, 3),
    ];
    for (let i = 1; i < yxSequence.length; i++) {
      const a = yxSequence[i - 1];
      const b = yxSequence[i];
      ck.testExactNumber(-1, Geometry.lexicalYXLessThan(a, b));
      ck.testExactNumber(1, Geometry.lexicalYXLessThan(b, a));
      ck.testExactNumber(0, Geometry.lexicalYXLessThan(a, a));

      const c = Point2d.create(a.y, a.x);
      const d = Point2d.create(b.y, b.x);
      ck.testExactNumber(-1, Geometry.lexicalXYLessThan(c, d));
      ck.testExactNumber(1, Geometry.lexicalXYLessThan(d, c));
      ck.testExactNumber(0, Geometry.lexicalXYLessThan(c, c));
    }
    expect(ck.getNumErrors()).equals(0);
  });
  // cspell:word kahan
  it("ErrorChecks", () => {
    const ck = new Checker();
    for (const multiplier of [0.5, 0.999999999]) { // multipliers are all LESS THAN 1
      const d = multiplier * Geometry.smallMetricDistance;
      const d1 = Geometry.smallMetricDistance / multiplier;
      ck.testUndefined(Geometry.inverseMetricDistance(d));
      ck.testFalse(Geometry.inverseMetricDistance(d1) === undefined);
    }

    for (const a of [0, 1, 2, 3, 4, 5]) {
      // clamping with reversed ends
      ck.testExactNumber(
        Geometry.clampToStartEnd(a, 2, 4),
        Geometry.clampToStartEnd(a, 4, 2), "Clamp is same result with reversed ends");
      // modulo with negated period
      ck.testCoordinate(
        Geometry.modulo(a, 4),
        -Geometry.modulo(-a, -4), "Modulo with negative period");
      ck.testExactNumber(a, Geometry.modulo(a, 0), "modulo with zero period");
    }
    const q: any[] = [1, 2, 3, 6, 9];
    ck.testTrue(Geometry.isNumberArray(q, 0));
    ck.testTrue(Geometry.isNumberArray(q, q.length - 1));
    ck.testTrue(Geometry.isNumberArray(q, q.length));
    ck.testFalse(Geometry.isNumberArray(q, q.length + 1));
    q.push(Point2d.create());
    ck.testFalse(Geometry.isNumberArray(q, 0));

    const x0 = 1.0;
    const x1 = 2.0;
    for (const f of [-2, -1, -0.5, 0, 0.5, 1.0, 2.0]) {
      const x = Geometry.interpolate(x0, f, x1);
      const f1 = Geometry.inverseInterpolate01(x0, x1, x);
      if (ck.testTrue(f1 !== undefined) && f1 !== undefined) {
        ck.testCoordinate(f, f1);
      }
    }
    // inverse interpolate with huge target and small interval . . .
    ck.testUndefined(
      Geometry.inverseInterpolate(0, 1, 1, 3, 1.0e12));
    const e = Geometry.smallAngleRadians;
    ck.testUndefined(
      Geometry.inverseInterpolate(0, 1, 1, 1 + e, 1000));

    ck.testExactNumber(Geometry.stepCount(0, 100, 4, 30), 4, "stepSize 0 returns min");
    ck.testExactNumber(Geometry.stepCount(200, 100, 4, 30), 4, "stepSize huge returns min");
    ck.testExactNumber(Geometry.stepCount(0.5, 100, 1, 10), 10, "stepSize caps with max");
    ck.testExactNumber(Geometry.stepCount(2, 10, 8, 10), 8, "stepSize lower cap with min");

    for (const f of [-1, 0, 0.5, 1, 2])
      ck.testTrue(Geometry.isIn01(f, false), "isIn01 with test suppressed)");
    expect(ck.getNumErrors()).equals(0);
  });
  /*
    it("Hypot", () => {
      for (const outerMultiplier of [1, 0.12312, 1.3284723423489789789789789, -0.892734238742384723, 1.23218987987929232323423e10]) {
        console.log();
        console.log("Outer multiplier", outerMultiplier);
        for (const multiplier of [1, 10, 100, 1000.0, 10000.0, 1.0 - 6, 1.0e10, 0.1232131231, 1.3423423e12, 5.23423989081213887821238823712e12]) {
          const a = 3.0 * multiplier * outerMultiplier;
          const b = 4.0 * multiplier * outerMultiplier;
          const c = Math.abs(5.0 * multiplier * outerMultiplier);
          const q = Math.hypot(a, b);
          const r = Geometry.hypotenuseXY(a, b);
          console.log(a, b, c, "(KAHAN " + q + "  error " + (q - c) / c + ")", "(BSI " + r + "  error  " + (r - c) / c + ")");
        }
      }
    });
  */
  it("isFinite", () => {
    const ck = new Checker();
    ck.testTrue(Number.isFinite(1));
    ck.testFalse(Number.isFinite("abc" as any));
    ck.testFalse(Number.isFinite(undefined as any));
    ck.testFalse(Number.isFinite(null as any));
    ck.testTrue(Number.isFinite(Number.MAX_VALUE));
    ck.testFalse(Number.isFinite(Number.NaN));
  });

});
