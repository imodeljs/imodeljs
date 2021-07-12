/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Arc3d } from "../../curve/Arc3d";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { GrowableFloat64Array } from "../../geometry3d/GrowableFloat64Array";
import { LongitudeLatitudeNumber } from "../../geometry3d/LongitudeLatitudeAltitude";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Point2d, Vector2d } from "../../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { NumberArray } from "../../geometry3d/PointHelpers";
import { Range3d } from "../../geometry3d/Range";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Transform } from "../../geometry3d/Transform";
import { Point4d } from "../../geometry4d/Point4d";
/* eslint-disable no-console */
import { BezierCoffs, Order2Bezier, Order3Bezier, Order4Bezier, Order5Bezier, UnivariateBezier } from "../../numerics/BezierPolynomials";
import {
  AnalyticRoots, Degree2PowerPolynomial, Degree3PowerPolynomial, Degree4PowerPolynomial, ImplicitLineXY, SmallSystem, SphereImplicit, TorusImplicit, TrigPolynomial,
} from "../../numerics/Polynomials";
import { Quadrature } from "../../numerics/Quadrature";
import { Sphere } from "../../solid/Sphere";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

function testBezier(ck: Checker, bezier: BezierCoffs) {
  for (const f of [0, 0.25, 0.75]) {
    const basisFunctions = bezier.basisFunctions(f);
    const sum = NumberArray.sum(basisFunctions);
    ck.testCoordinate(1.0, sum, "convex sum");
    const y = bezier.evaluate(f);
    const left = bezier.createPeer();
    const right = bezier.createPeer();
    bezier.subdivide(f, left, right);
    ck.testCoordinate(y, right.coffs[0], "subdivision matches evaluation");
    if (bezier.order < 4) {
      const roots = bezier.roots(y, false);
      ck.testBoolean(true, NumberArray.isCoordinateInArray(f, roots), "root");
    }
    const bezier1 = UnivariateBezier.create(bezier);
    ck.testExactNumber(bezier.order, bezier1.order, "general clone order");
    const basisFunctions1 = bezier1.basisFunctions(f);
    const diff = NumberArray.maxAbsDiffFloat64(basisFunctions, basisFunctions1);
    ck.testCoordinate(0.0, diff, "compare basisFunctions with generic Bezier");
  }
}

describe("Bezier.HelloWorld", () => {
  it("Bezier.HelloWorld", () => {
    const ck = new Checker();
    const bez2 = new Order2Bezier(1, 2);
    const bez2a = new Order2Bezier(4, 3);
    testBezier(ck, bez2);
    const bez3 = new Order3Bezier(1, 2, 5);
    testBezier(ck, bez3);
    const bez4 = new Order4Bezier(1, 2, 5, 6);
    ck.testFalse(bez2a.subdivide(0.1, bez2, bez3), "mismatched subdivide order");
    ck.testFalse(bez2a.subdivide(0.1, bez3, bez2), "mismatched subdivide order");
    ck.testUndefined(BezierCoffs.maxAbsDiff(bez2, bez3), "mismatch order in maxAbsDiff");
    testBezier(ck, bez4);

    const bez5 = new Order5Bezier(1, 2, 5, 6, 8);
    testBezier(ck, bez5);

    ck.checkpoint("Order2Bezier");
    expect(ck.getNumErrors()).equals(0);
  });
  it("degenerateCases", () => {
    const ck = new Checker();
    const nullTorus = new TorusImplicit(0, 0);    // DEGENERATE
    ck.testExactNumber(1.0, nullTorus.implicitFunctionScale());
    const data = nullTorus.xyzToThetaPhiDistance(Point3d.create(0, 0, 0));
    ck.testFalse(data.safePhi);
    ck.checkpoint("Bezier.degenerateCases");
    expect(ck.getNumErrors()).equals(0);
  });
  it("rootServices", () => {
    const ck = new Checker();
    const bigNum = 100;
    const myArray = GrowableFloat64Array.create([1, 2, 3, 4, bigNum]);

    const a = AnalyticRoots.mostDistantFromMean(myArray);
    ck.testCoordinate(0, AnalyticRoots.mostDistantFromMean(undefined));
    ck.testLT(20, a);
    ck.checkpoint("Bezier.rootServices");
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("Cubic.Solutions", () => {
  it("Cubic.3Roots", () => {
    const ck = new Checker();
    const root0a = 0.0;
    const root1a = -1.0;
    for (const sign of [-1, 1]) {
      for (const root2a of [0, 1, 2, 10]) {
        const root2 = root2a * sign;
        const root1 = root1a * sign;
        const root0 = root0a * sign;
        const cubic = Degree3PowerPolynomial.fromRootsAndC3(root0, root1, root2, 1.0);
        for (const x of [root0, root1, root2]) {
          const f = cubic.evaluate(x);
          ck.testCoordinate(f, 0, "known root");
          const f1 = cubic.evaluate(x + 0.5);
          ck.testBoolean(false, Geometry.isAlmostEqualNumber(0.0, f1), "known non root");
        }
        const df = 2.3;
        cubic.addConstant(df);
        for (const x of [root0, root1, root2]) {
          ck.testCoordinate(df, cubic.evaluate(x), "shifted cubic evaluate");
        }
        const a = 3.2;
        const b = 0.3;
        cubic.addSquaredLinearTerm(a, b);
        for (const x of [root0, root1, root2]) {
          const q = a + b * x;
          ck.testCoordinate(df + q * q, cubic.evaluate(x), "shifted cubic evaluate");
        }

      }
    }
    ck.checkpoint("Cubic3Roots");
    expect(ck.getNumErrors()).equals(0);
  });
});

function testQuadrature(ck: Checker, xA: number, xB: number, xx: Float64Array, ww: Float64Array, n: number, maxDegree: number) {
  if (Checker.noisy.gaussQuadrature)
    console.log(`(nGauss ${n}) (interval ${xA} ${xB}`);
  for (let p = 0; p < maxDegree + 3; p++) {
    {
      const trueIntegral = (Math.pow(xB, p + 1) - Math.pow(xA, p + 1)) / (p + 1.0);
      const approximateIntegral = Quadrature.sum1(xx, ww, n,
        (x: number): number => Math.pow(x, p));
      const isSame = Geometry.isSameCoordinate(trueIntegral, approximateIntegral);
      if (Checker.noisy.gaussQuadrature) {
        if (p === maxDegree + 1) console.log("    ---------------  end of expected precise integrals");
        console.log(`     (p ${p}) (absErr ${approximateIntegral - trueIntegral}) (relErr ${(approximateIntegral - trueIntegral) / trueIntegral}`);
      }
      ck.testBoolean(p <= maxDegree, isSame, "Quadrature Exactness", p, maxDegree, trueIntegral, approximateIntegral);
    }
  }
}
describe("Quadrature.Gauss", () => {
  it("Quadrature.Gauss", () => {
    const ck = new Checker();
    const xx = new Float64Array(10);
    const ww = new Float64Array(10);
    for (const interval of [{ xA: 1.4, xB: 3.9 }, { xA: 0, xB: 1 }]) {
      const xA = interval.xA;
      const xB = interval.xB;
      Quadrature.setupGauss2(xA, xB, xx, ww);
      testQuadrature(ck, xA, xB, xx, ww, 2, 3);

      Quadrature.setupGauss3(xA, xB, xx, ww);
      testQuadrature(ck, xA, xB, xx, ww, 3, 5);

      Quadrature.setupGauss4(xA, xB, xx, ww);
      testQuadrature(ck, xA, xB, xx, ww, 4, 7);

      Quadrature.setupGauss5(xA, xB, xx, ww);
      testQuadrature(ck, xA, xB, xx, ww, 5, 9);
    }

    testQuadrature(ck, 0, 1, Quadrature.gaussX2Interval01, Quadrature.gaussW2Interval01, 2, 3);
    testQuadrature(ck, 0, 1, Quadrature.gaussX3Interval01, Quadrature.gaussW3Interval01, 3, 5);
    testQuadrature(ck, 0, 1, Quadrature.gaussX5Interval01, Quadrature.gaussW5Interval01, 5, 9);
    ck.checkpoint("Quadrature.Gauss");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("TrigPolynomial.DegenerateLinear", () => {
  it("TrigPolynomial.Intersection", () => {
    const ck = new Checker();
    const angles: number[] = [];
    const ac = 0.6;
    const as = 0.9;
    const a0 = 0.1;
    TrigPolynomial.solveUnitCircleImplicitQuadricIntersection(
      0, 0, 0,
      ac, as, a0, angles);
    ck.testExactNumber(2, angles.length);
    for (const theta of angles) {
      const q = a0 + ac * Math.cos(theta) + as * Math.sin(theta);
      ck.testCoordinate(0, q, "Linear Trig Root");
    }
    ck.checkpoint("TrigPolynomial.DegenerateLinear");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("Ellipse.Intersection", () => {
  it("Ellipse.Intersection", () => {
    const ck = new Checker();
    const ellipseAngles: number[] = [];
    const circleAngles: number[] = [];
    // ellipse with major axis significantly larger than 1, minor axis significantly smaller
    const majorRadius = 2.0;
    const minorRadius = 0.4;
    // t moves center from origin to points nearby.  At origin, the roots are symmetric.  Moving away makes them trickier.
    for (const t of [0, 0.05]) {
      const center = Point3d.create(t, 2.0 * t, 0);
      const vectorU = Vector3d.create(majorRadius, 0, 0);
      const vectorV = Vector3d.create(0.1, minorRadius, 0);
      TrigPolynomial.solveUnitCircleEllipseIntersection(center.x, center.y, vectorU.x, vectorU.y, vectorV.x, vectorV.y, ellipseAngles, circleAngles);
      if (ck.testExactNumber(ellipseAngles.length, circleAngles.length)) {
        // verify that all returned values are intersections.  This prevents false positives but not false negatives.
        for (let i = 0; i < ellipseAngles.length; i++) {
          const circlePoint = Point3d.createFrom(Vector3d.createPolar(1.0, Angle.createRadians(circleAngles[i]), 0.0));
          const ellipsePoint = center.plus2Scaled(vectorU, Math.cos(ellipseAngles[i]), vectorV, Math.sin(ellipseAngles[i]));
          ck.testPoint3d(circlePoint, ellipsePoint);
        }
      }
    }

    ck.checkpoint("Ellipse.Intersection");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Ellipse.IntersectHomogeneous", () => {
    const ck = new Checker();
    const ellipseAngles: number[] = [];
    const circleAngles: number[] = [];
    // ellipse with major axis significantly larger than 1, minor axis significantly smaller
    const majorRadius = 2.0;
    const minorRadius = 0.4;
    // t moves center from origin to points nearby.  At origin, the roots are symmetric.  Moving away makes them trickier.
    for (const t of [0, 0.05]) {
      const center = Point4d.create(t, 2.0 * t, 0, 0.98);
      const vectorU = Point4d.create(majorRadius, 0, 0, 0.2);
      const vectorV = Point4d.create(0.1, minorRadius, 0, 0.3);
      TrigPolynomial.solveUnitCircleHomogeneousEllipseIntersection(
        center.x, center.y, center.w,
        vectorU.x, vectorU.y, vectorU.w,
        vectorV.x, vectorV.y, vectorV.w,
        ellipseAngles, circleAngles);
      if (ck.testExactNumber(ellipseAngles.length, circleAngles.length)) {
        // verify that all returned values are intersections.  This prevents false positives but not false negatives.
        for (let i = 0; i < ellipseAngles.length; i++) {
          const circlePoint = Point3d.createFrom(Vector3d.createPolar(1.0, Angle.createRadians(circleAngles[i]), 0.0));
          const ellipsePoint = center.plus2Scaled(vectorU, Math.cos(ellipseAngles[i]), vectorV, Math.sin(ellipseAngles[i]));
          const ellipsePointXYZ = ellipsePoint.realPoint();
          if (ck.testPointer(ellipsePointXYZ, "expect real point from ellipse ellipse homogeneous intersection")) {
            ck.testPoint3d(circlePoint, ellipsePointXYZ);
          }
        }
      }
    }

    ck.checkpoint("Ellipse.Intersection");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("ImplicitSurface", () => {
  it("Sphere", () => {
    const ck = new Checker();
    const r = 2.0;
    const sphere = new SphereImplicit(r);

    ck.testExactNumber(sphere.radius, r, "Sphere radius");
    ck.testCoordinate(0, sphere.evaluateImplicitFunction(r, 0, 0), "evaluate sphere");
    ck.testCoordinate(0, sphere.evaluateImplicitFunction(0, r, 0), "evaluate sphere");
    ck.testCoordinate(0, sphere.evaluateImplicitFunction(0, 0, r), "evaluate sphere");

    for (const xyz of [Point3d.create(1, 2, 4),
    Point3d.create(0, 0, 0),
    Point3d.create(r, 0, 0)]) {
      const w = 4.2;
      ck.testCoordinate(
        sphere.evaluateImplicitFunction(xyz.x, xyz.y, xyz.z) * w * w,
        sphere.evaluateImplicitFunctionXYZW(w * xyz.x, w * xyz.y, w * xyz.z, w),
        "weighted implicit function");
    }

    for (const thetaPhi of [[0, 0], [0.2, 0.4]]) {
      const xyz = sphere.evaluateThetaPhi(thetaPhi[0], thetaPhi[1]);
      const vectorX = Vector3d.createFrom(xyz);
      const ddTheta = Vector3d.create();
      const ddPhi = Vector3d.create();
      sphere.evaluateDerivativesThetaPhi(thetaPhi[0], thetaPhi[1], ddTheta, ddPhi);
      ck.testPerpendicular(ddTheta, ddPhi, "implicit sphere perpendicular derivatives");
      ck.testPerpendicular(vectorX, ddTheta, "implicit sphere perpendicular derivatives");
      ck.testPerpendicular(vectorX, ddPhi, "implicit sphere perpendicular derivatives");
      ck.testCoordinate(r, vectorX.magnitude(), "implicit sphere distance from origin");
      const thetaPhiA = sphere.xyzToThetaPhiR(xyz);
      ck.testCoordinate(thetaPhi[0], thetaPhiA.thetaRadians, "implicit sphere theta inverse");
      ck.testCoordinate(thetaPhi[1], thetaPhiA.phiRadians, "implicit sphere phi inverse");
    }
    for (const sphereA of [
      new SphereImplicit(0), new SphereImplicit(1)]) {
      const thetaPhiB = sphereA.xyzToThetaPhiR(Point3d.create(0, 0, 0));
      const thetaPhiC = sphereA.xyzToThetaPhiR(Point3d.create(0, 0, 1));
      ck.testExactNumber(0.0, thetaPhiB.phiRadians);
      ck.testExactNumber(0.0, thetaPhiC.thetaRadians);
    }
    ck.checkpoint("ImplicitSurface.Sphere");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Torus", () => {
    const ck = new Checker();
    const rA = 2.0;
    const rB = 0.5;
    const torus = new TorusImplicit(rA, rB);

    ck.testExactNumber(torus.majorRadius, rA, "torus major radius");
    ck.testExactNumber(torus.minorRadius, rB, "torus minor radius");

    ck.testCoordinate(0, torus.evaluateImplicitFunctionXYZ(rA + rB, 0, 0), "evaluate torus");
    ck.testCoordinate(0, torus.evaluateImplicitFunctionXYZ(rA - rB, 0, 0), "evaluate torus");
    ck.testCoordinate(0, torus.evaluateImplicitFunctionXYZ(rA, 0, rB), "evaluate torus");
    ck.testCoordinate(0, torus.evaluateImplicitFunctionXYZ(rA, 0, -rB), "evaluate torus");

    for (const xyz of [Point3d.create(1, 2, 4),
    Point3d.create(0, 0, 9),
    Point3d.create(rA, 0, 0)]) {
      const w = 2.0;
      const fOfX = torus.evaluateImplicitFunctionXYZ(xyz.x, xyz.y, xyz.z);
      const f = torus.evaluateImplicitFunctionPoint(xyz);
      ck.testCoordinate(f, fOfX, "torus evaluation variant");
      ck.testCoordinate(
        f * w * w * w * w,
        torus.evaluateImplicitFunctionXYZW(w * xyz.x, w * xyz.y, w * xyz.z, w),
        "weighted implicit function");
    }
    for (const thetaPhi of [[0, 0], [0.2, 0.4]]) {
      const theta = thetaPhi[0];
      const phi = thetaPhi[1];
      const xyz = torus.evaluateThetaPhi(theta, phi);
      const xyzR1 = torus.evaluateThetaPhiDistance(theta, phi, rB);
      ck.testPoint3d(xyz, xyzR1, "torus evaluation without R");
      for (const factorB of [1.0, 0.5, 2.0]) {
        // const vectorX = Vector3d.createFrom(xyz);

        const ddTheta = Vector3d.create();
        const ddPhi = Vector3d.create();
        torus.evaluateDerivativesThetaPhi(theta, phi, ddTheta, ddPhi);
        const r = factorB * rB;
        const xyzR = torus.evaluateThetaPhiDistance(theta, phi, r);
        ck.testPerpendicular(ddTheta, ddPhi, "implicit torus perpendicular derivatives");
        const thetaPhiA = torus.xyzToThetaPhiDistance(xyzR);
        ck.testCoordinate(thetaPhi[0], thetaPhiA.theta, "implicit sphere theta inverse");
        ck.testCoordinate(thetaPhi[1], thetaPhiA.phi, "implicit sphere phi inverse");
        ck.testCoordinate(factorB * rB, thetaPhiA.distance, "implicit sphere inverse distance from major circle");
      }
    }
    ck.checkpoint("ImplicitSurface.Torus");
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("PowerPolynomials", () => {
  it("Degree2PowerPolynomial", () => {
    const ck = new Checker();
    let quadratic = new Degree2PowerPolynomial();
    ck.testUndefined(quadratic.tryGetVertexFactorization(), "000 quadratic vertex factorization fails");
    ck.testNumberArray(undefined, quadratic.realRoots(), "Expect no roots for 000 quadratic", quadratic);
    quadratic.addSquaredLinearTerm(1.0, -1.0);   // (1-x)^2 -- double root at 1.  Coefficients are integers, so expect exact double root solution.
    ck.testNumberArray([1, 1], quadratic.realRoots(), "Expect double root", quadratic);
    quadratic.addConstant(1);  // This shifts it from double root to no roots.
    ck.testNumberArray(undefined, quadratic.realRoots(), "expect no roots", quadratic);
    ck.testNumberArray([0.5], (new Degree2PowerPolynomial(-1, 2, 0)).realRoots(), "degenerate linear quadratic roots");
    quadratic = Degree2PowerPolynomial.fromRootsAndC2(3, 4, 5);
    ck.testNumberArray([3, 4], quadratic.realRoots(), "fromRootsAndC2 construct and solve");
    const vertexData = quadratic.tryGetVertexFactorization()!;
    ck.testCoordinate(0.0, quadratic.evaluateDerivative(vertexData.x0), "zero derivative at vertex");
    ck.testCoordinate(vertexData.y0, quadratic.evaluate(vertexData.x0), "zero derivative at vertex");
    ck.checkpoint("PowerPolynomials.Degree2PowerPolynomial");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Degree4PowerPolynomial", () => {
    const ck = new Checker();
    /* equivalent Degree4PowerPolynomial ... */
    for (const roots of [
      [0, 0, 0, 0],
      [0.5, 1, 2, 3],
      // [0.1, 0.1, 0.5, 0.5]
    ]) {
      const power = Degree4PowerPolynomial.fromRootsAndC4(roots[0], roots[1], roots[2], roots[3], 2);
      const bezier = Order5Bezier.createFromDegree4PowerPolynomial(power);
      const powerRoots = new GrowableFloat64Array(4);
      const bezierRoots = new GrowableFloat64Array(4);
      AnalyticRoots.appendQuarticRoots(power.coffs, powerRoots);
      bezier.realRoots(0.0, false, bezierRoots);
      ck.testNumberArrayG(roots, powerRoots, "cubic power roots");
      ck.testNumberArrayG(roots, bezierRoots, "cubic bezier roots");

      for (const a of [0, 2.5]) {
        power.addConstant(a);
        bezier.addConstant(a);
        for (const x of roots) {
          ck.testCoordinate(a, power.evaluate(x), power);
          ck.testCoordinate(a, bezier.evaluate(x));
        }
      }
    }
    ck.checkpoint("PowerPolynomials.Degree4PowerPolynomial");
    expect(ck.getNumErrors()).equals(0);
  });

  it("DegenerateDegree4PowerPolynomial", () => {
    const ck = new Checker();
    /* equivalent Degree4PowerPolynomial ... */
    for (const coffs of [
      [0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, -2, 0, 0, 0],
      [1, 2, -3, 0, 0],
      [0.5, 1, 2, 3, 0]]) {
      const power = new Degree4PowerPolynomial(coffs[0], coffs[1], coffs[2], coffs[3], coffs[4]);
      const bezier = Order5Bezier.createFromDegree4PowerPolynomial(power);
      const powerRoots = new GrowableFloat64Array(4);
      const bezierRoots = new GrowableFloat64Array(4);
      AnalyticRoots.appendQuarticRoots(power.coffs, powerRoots);
      bezier.realRoots(0.0, false, bezierRoots);
      // make sure that each reported root is a root ... this does not confirm completeness
      for (let i = 0; i < powerRoots.length; i++) {
        const r = powerRoots.atUncheckedIndex(i);
        const f = power.evaluate(r);
        ck.testCoordinate(0, f);
      }
      for (let i = 0; i < bezierRoots.length; i++) {
        const r = bezierRoots.atUncheckedIndex(i);
        const f = bezier.evaluate(r);
        ck.testCoordinate(0, f);
      }

    }
    ck.checkpoint("PowerPolynomials.DegenerateDegree4PowerPolynomial");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Degree3PowerPolynomial", () => {
    const ck = new Checker();
    /* equivalent Degree4PowerPolynomial ... */
    for (const roots of [
      [0, 0, 0],
      [1, 2, 3]]) {
      const power = Degree3PowerPolynomial.fromRootsAndC3(roots[0], roots[1], roots[2], 2);
      const bezier = Order4Bezier.createFromDegree3PowerPolynomial(power);
      const powerRoots = new GrowableFloat64Array(4);
      const bezierRoots = new GrowableFloat64Array(4);
      AnalyticRoots.appendCubicRoots(power.coffs, powerRoots);
      bezier.realRoots(0.0, false, bezierRoots);
      ck.testNumberArrayG(roots, powerRoots, "cubic power roots");
      ck.testNumberArrayG(roots, bezierRoots, "cubic bezier roots");
      for (const a of [0, 2.5]) {
        power.addConstant(a);
        bezier.addInPlace(a);
        for (const x of roots) {
          ck.testCoordinate(a, power.evaluate(x), power);
          ck.testCoordinate(a, bezier.evaluate(x), bezier);
        }
      }
    }
    ck.checkpoint("PowerPolynomials.Degree3PowerPolynomial");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("Ellipse.Perpendiculars", () => {
  it("Ellipse.Perpendiculars", () => {
    const ck = new Checker();
    const r0 = 3.0;
    for (const spacePoint of [
      Point3d.create(4, 5, 0),
      Point3d.create(2, -6, 0),
      Point3d.create(0, -6, 0)])  // special point of bezier-mapped trig functions

      for (const eccentricity of [1.0, 1.01, 1.01, 2.0, 0.5]) {
        for (const skew of [0, 0.0]) {
          // console.log("eccentricity ", eccentricity, "skew", skew);
          const arc = Arc3d.create(Point3d.create(0, 0, 0), Vector3d.create(r0, 0, 0), Vector3d.create(skew, eccentricity * r0, 0), AngleSweep.create360());
          let angles = arc.allPerpendicularAngles(spacePoint);
          for (const theta of angles) {
            const ray = arc.angleToPointAndDerivative(Angle.createRadians(theta));
            const dot = ray.dotProductToPoint(spacePoint);
            // if (angles.length > 10)
            ck.testCoordinate(0, dot, "test perpendicular");
          }
          angles = arc.allPerpendicularAngles(spacePoint);
          arc.allPerpendicularAngles(spacePoint);
        }
      }
    ck.checkpoint("Ellipse.Perpendiculars");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("LinearSystems", () => {
  it("lineSegment2dXYTransverseIntersection", () => {
    const ck = new Checker();
    const a0 = Point2d.create(1, 2.1);
    const a1 = Point2d.create(4, -2);
    const fa = 0.4;
    const fb = 0.45;
    const bb = a0.interpolate(fa, a1);
    const b0 = Point2d.create(0.2, 3);
    const b1 = b0.interpolate(1.0 / fb, bb);
    const fractions = Vector2d.create();
    if (ck.testTrue(SmallSystem.lineSegment2dXYTransverseIntersectionUnbounded(a0, a1, b0, b1, fractions))) {
      ck.testCoordinate(fa, fractions.x, "fraction on line a");
      ck.testCoordinate(fb, fractions.y, "fraction on line b");
    }
    ck.checkpoint("LinearSystems.lineSegment2dXYTransverseIntersection");
    expect(ck.getNumErrors()).equals(0);
  });

  it("linearSystem2d", () => {
    const ck = new Checker();
    const ux = 1.1;
    const uy = 0.2;
    const vx = 0.3;
    const vy = 1.2;
    const x = 0.2;
    const y = 1.1;
    const result = Vector2d.create();
    if (ck.testTrue(SmallSystem.linearSystem2d(
      ux, vx,
      uy, vy,
      ux * x + vx * y, uy * x + vy * y, result))) {
      ck.testCoordinate(x, result.x, "2d linear x part");
      ck.testCoordinate(y, result.y, " 2d linear y part");
    }
    ck.checkpoint("LinearSystems.lineSegment2dXYTransverseIntersection");
    expect(ck.getNumErrors()).equals(0);
  });

  it("lineSegment3dXYTransverseIntersectionUnbounded", () => {
    const ck = new Checker();
    const a0 = Point3d.create(0.7, 0.2, 1);
    const a1 = Point3d.create(10, 2, -1);
    const b0 = Point3d.create(5, 4.5, 4.4);
    const b1 = Point3d.create(5.2, -4, 4.2);
    const fractions = Vector2d.create();
    if (ck.testTrue(SmallSystem.lineSegment3dClosestApproachUnbounded(a0, a1, b0, b1, fractions))) {
      // console.log("fractions", fractions);
      const a = a0.interpolate(fractions.x, a1);
      const b = b0.interpolate(fractions.y, b1);
      const vectorAB = a.vectorTo(b);
      const vectorA01 = a0.vectorTo(a1);
      const vectorB01 = b0.vectorTo(b1);
      ck.testPerpendicular(vectorAB, vectorA01);
      ck.testPerpendicular(vectorAB, vectorB01);
    }
    ck.checkpoint("LinearSystems.lineSegment3dXYTransverseIntersectionUnbounded");
    expect(ck.getNumErrors()).equals(0);
  });
  it("cubeRoot", () => {
    const ck = new Checker();
    ck.testExactNumber(0, AnalyticRoots.cbrt(0.0));
    ck.testExactNumber(0, AnalyticRoots.cbrt(-0.0));
    for (const a of [1000, 100, 2.234234, 0.347297, 1.0e-18]) {
      const r0 = AnalyticRoots.cbrt(a);
      const r1 = AnalyticRoots.cbrt(-a);
      ck.testCoordinate(r0, -r1);
      ck.testCoordinate(a, r0 * r0 * r0);
      ck.testCoordinate(-a, r1 * r1 * r1);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("spherePatch", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const radius = 2.0;
    const center = Point3d.create(0.2, 0.4, -0.5);
    const pole = Math.PI * 0.5;
    const halfCircle = Math.PI;
    const radiansStep = 0.3;
    const phiRadiansArray = [-pole, -0.4 * pole, 0.0, 0.2 * pole];
    const thetaRadiansArray = [-halfCircle, -0.6 * halfCircle, -0.2 * halfCircle, 0.0, 0.45 * halfCircle, 0.9 * halfCircle, 1.3 * halfCircle, 2.8 * halfCircle];
    // const phiRadiansArray = [0.0, pole * 0.5];
    // const thetaRadiansArray = [0.0, halfCircle];
    let y0 = 0;
    let x0 = 0;
    const xStep = 4.0 * radius;
    const yStep = 4.0 * radius;
    for (const theta0Radians of thetaRadiansArray) {
      for (const theta1Radians of thetaRadiansArray) {
        if (Math.abs(theta1Radians - theta0Radians) > Math.PI * 2.001)
          continue;
        y0 = 0;
        const thetaArray = arraySteps(theta0Radians, theta1Radians, radiansStep);
        for (const phi0Radians of phiRadiansArray) {
          for (const phi1Radians of phiRadiansArray) {
            const phiArray = arraySteps(phi0Radians, phi1Radians, radiansStep);
            const points = sphereSnakeGridPoints(center, radius, thetaArray, phiArray);
            GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), x0, y0);
            const patchRange = SphereImplicit.patchRangeStartEndRadians(center, radius, theta0Radians, theta1Radians, phi0Radians, phi1Radians);
            const expandedPatchRange = patchRange.clone();
            expandedPatchRange.expandInPlace(1.0e-12);
            GeometryCoreTestIO.captureRangeEdges(allGeometry, patchRange, x0, y0);
            const pointRange = Range3d.createArray(points);
            const expandedPointRange = pointRange.clone();
            expandedPointRange.expandInPlace(0.10 * radius);
            ck.testTrue(expandedPatchRange.containsRange(pointRange), "points in patch range", { theta0: theta0Radians, theta1: theta1Radians, phi0: phi0Radians, phi1: phi1Radians });
            ck.testTrue(expandedPointRange.containsRange(patchRange), "patch in expanded point range", { theta0: theta0Radians, theta1: theta1Radians, phi0: phi0Radians, phi1: phi1Radians });
            y0 += yStep;
          }
        }
        x0 += xStep;
      }
    }
    expect(ck.getNumErrors()).equals(0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "SphereImplicit", "PatchRange");
  });
  it("RayIntersection", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const radius = 5.0;
    const rayFractions: number[] = [];
    const xyzIntersections: Point3d[] = [];
    const thetaPhiRadians: LongitudeLatitudeNumber[] = [];
    let x0 = 0;
    let y0;
    const b = 2.5 * radius; // distance for displaying the ray
    for (const center of [Point3d.createZero(), Point3d.create(1, 2, 3)]) {
      y0 = 0;
      const sphere = Sphere.createCenterRadius(center, radius);
      for (const ray0 of [Ray3d.createXAxis(),
      Ray3d.create(center, Vector3d.create(1, 2, 3)),
      Ray3d.createXYZUVW(1, 2, 3, 0.5, 0.2, 0.8),
      Ray3d.createXYZUVW(2, 0, 8, 1, 0, 0.2)]) {
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, sphere, x0, y0);
        ray0.tryNormalizeInPlaceWithAreaWeight(1);
        const frame = Transform.createOriginAndMatrix(ray0.origin, Matrix3d.createRigidHeadsUp(ray0.direction));
        for (const shift of [-6, -4, -2, 0, 1, 3, 5, 7]) {
          const ray = Ray3d.create(frame.multiplyXYZ(shift, 0, 0), ray0.direction);
          SphereImplicit.intersectSphereRay(center, radius, ray, rayFractions, xyzIntersections, thetaPhiRadians);
          GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(ray.fractionToPoint(-b), ray.fractionToPoint(b)), x0, y0);
          for (const xyz of xyzIntersections)
            GeometryCoreTestIO.captureGeometry(allGeometry, Sphere.createCenterRadius(xyz, radius * 0.04), x0, y0);
          const closestPoint = ray.projectPointToRay(center);
          const d = center.distance(closestPoint);
          GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(center, center.interpolate(d < radius ? 3.0 : 1.0, closestPoint)), x0, y0);
          if (Geometry.isSameCoordinate(d, radius)) {
            // ignore the potential tolerance problems . . .
          } else if (d < radius) {
            ck.testExactNumber(2, xyzIntersections.length, "Expect 2 intersections when ray passes close to center");
          } else
            ck.testExactNumber(0, xyzIntersections.length, "Expect no intersections when ray is far from center");
        }
        y0 += 6.0 * radius;
      }
      x0 += 6.0 * radius;
    }
    expect(ck.getNumErrors()).equals(0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "SphereImplicit", "RayIntersection");
  });
  it("ImplicitLine", () => {
    const ck = new Checker();
    const b = 3.0;
    for (const degrees of [0, 30, 90, -225]) {
      const angle = Angle.createDegrees(degrees);
      const lineA = new ImplicitLineXY(1, angle.cos(), angle.sin());
      const pointsA = lineA.convertToSegmentPoints(b);
      if (ck.testDefined(pointsA) && Array.isArray(pointsA)) {
        ck.testCoordinate(2 * b, pointsA[0].distance(pointsA[1]));
        ck.testCoordinate(0, lineA.evaluatePoint(pointsA[0]));
        ck.testCoordinate(0, lineA.evaluatePoint(pointsA[1]));
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
});

function arraySteps(low: number, high: number, step: number): number[] {
  if (low === high)
    return [low];
  const delta = high - low;
  const numInterval = Math.max(1, Math.floor(Math.abs(delta / step)));
  const result = [];
  for (let i = 0; i <= numInterval; i++) {
    result.push(low + (i / numInterval) * delta);
  }
  return result;
}
function sphereSnakeGridPoints(center: Point3d, radius: number, thetaArray: number[], phiArray: number[]): Point3d[] {
  const points: Point3d[] = [];
  const sphere = new SphereImplicit(radius);
  for (let iPhi = 0; iPhi < phiArray.length; iPhi += 2) {
    let phiRadians = phiArray[iPhi];
    for (const thetaRadians of thetaArray) {
      points.push(center.plus(sphere.evaluateThetaPhi(thetaRadians, phiRadians)));
    }
    if (iPhi + 1 < phiArray.length) {
      phiRadians = phiArray[iPhi + 1];
      for (let iTheta = thetaArray.length; iTheta > 0;) {
        iTheta--;
        const uvw = sphere.evaluateThetaPhi(thetaArray[iTheta], phiRadians);
        points.push(center.plus(uvw));
      }
    }
  }
  return points;
}
