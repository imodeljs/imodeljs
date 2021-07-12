/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Arc3d } from "../../curve/Arc3d";
import { Geometry } from "../../Geometry";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { GrowableFloat64Array } from "../../geometry3d/GrowableFloat64Array";
import { Point2d, Vector2d } from "../../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { NumberArray } from "../../geometry3d/PointHelpers";
import { Point4d } from "../../geometry4d/Point4d";
import {
  AnalyticRoots, BilinearPolynomial, Degree2PowerPolynomial, Degree3PowerPolynomial, PowerPolynomial, SmallSystem, TrigPolynomial,
} from "../../numerics/Polynomials";
import { Checker } from "../Checker";

/* eslint-disable no-console, no-trailing-spaces */

// Toggle for printing in cubic & quartic testers
const printAll = false;
// Linear and Quadric simple tests -----------------------------------------------

describe("AnalyticRoots.SolveLinear", () => {
  const ck = new Checker();
  it("SolveLinear.OneSolution", () => {
    const powerCoffs = new Float64Array(2);
    for (const slope of [1, 1000, -52, 0]) {
      for (const a of [0, 2, 5e7]) {
        const s = new GrowableFloat64Array();
        AnalyticRoots.appendLinearRoot(-slope * a, slope, s);
        if (slope !== 0) {
          if (ck.testPointer(s)) {
            ck.testExactNumber(s.length, 1, "SolveLinear (root a, slope)", a, slope);
            ck.testCoordinate(s.atUncheckedIndex(0), a, "SolveLinear", powerCoffs);
          }
        } else {
          ck.testExactNumber(s.length, 0, " Expect no roots for linear equation with zero slope.");
        }
      }
    }
    ck.checkpoint("SolveLinear");
    expect(ck.getNumErrors()).equals(0);
  });
});
describe("AnalyticRoots.SolveQuadric", () => {

  it("SolveQuadric.DoubleRoot", () => {
    const ck = new Checker();
    for (let i = 3; i < 8; i += 2) {
      const quadric = Degree2PowerPolynomial.fromRootsAndC2(i, i);
      const roots = new GrowableFloat64Array();
      AnalyticRoots.appendQuadraticRoots(Float64Array.from(quadric.coffs), roots);
      if (ck.testPointer(roots)) {
        roots.sort(compare);
        ck.testExactNumber(roots.length, 1, `SolveQuadric s = [${i}, ${i}]`);
        ck.testCoordinate(roots.atUncheckedIndex(0), i, "Quadratic double root");
      }
    }
    ck.checkpoint("DoubleRoot");
    expect(ck.getNumErrors()).equals(0);
  });
  it("SolveQuadric.NoSolution", () => {
    const ck = new Checker();
    const c = 3.5;
    for (const a of [3, 2, 9]) {
      const roots = new GrowableFloat64Array();
      AnalyticRoots.appendQuadraticRoots(Float64Array.from([c, Math.sqrt(4.0 * a * c / 7), a]), roots);
      ck.testExactNumber(roots.length, 0, "Expect no roots from quadratic");
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("SolveQuadric.TwoSolutions", () => {
    const ck = new Checker();
    for (const root0 of [1, - 3, 100]) {
      for (const root1 of [5.4, 2.3]) {
        const quadric = Degree2PowerPolynomial.fromRootsAndC2(root0, root1);
        const roots = new GrowableFloat64Array();
        AnalyticRoots.appendQuadraticRoots(Float64Array.from(quadric.coffs), roots);
        if (ck.testPointer(roots)) {
          roots.sort(compare);
          ck.testExactNumber(roots.length, 2, "appendQuadraticSolutions ", roots, root0, root1);
          ck.testCoordinate(roots.atUncheckedIndex(0), Math.min(root0, root1), "Quadratic two roots");
          ck.testCoordinate(roots.atUncheckedIndex(1), Math.max(root0, root1), "Quadratic two roots");
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("ImplicitLineUnitCircle", () => {
    const ck = new Checker();
    const cosValues = new GrowableFloat64Array();
    const sinValues = new GrowableFloat64Array();
    const radiansValues = new GrowableFloat64Array();
    const tol = 1.0e-12;
    ck.testExactNumber(1, AnalyticRoots.appendImplicitLineUnitCircleIntersections(1, 0, 1, cosValues, sinValues, radiansValues, tol));
    ck.testExactNumber(2, AnalyticRoots.appendImplicitLineUnitCircleIntersections(0.1, 0, 1, cosValues, sinValues, radiansValues, tol));
    ck.testExactNumber(-2, AnalyticRoots.appendImplicitLineUnitCircleIntersections(0, 0, 0, cosValues, sinValues, radiansValues, tol));
    ck.testExactNumber(-1, AnalyticRoots.appendImplicitLineUnitCircleIntersections(1, 0, 0, cosValues, sinValues, radiansValues, -1));

    ck.checkpoint("ImplicitLineUnitCircle");
    expect(ck.getNumErrors()).equals(0);
  });
  it("PowerPolynomial", () => {
    const ck = new Checker();
    const coffs = new Float64Array([1, 2, 3, 4]);
    ck.testExactNumber(0, PowerPolynomial.degreeKnownEvaluate(coffs, -1, 4));
    const radians: number[] = [];
    ck.testTrue(TrigPolynomial.solveAngles(new Float64Array([1, 1, 0, 0, 0]), 4, 100, radians));
    ck.testTrue(TrigPolynomial.solveAngles(new Float64Array([0, 1, 1, 0, 0, 0]), 4, 100, radians));

    const z3 = new Degree3PowerPolynomial();
    const z2 = new Degree2PowerPolynomial();
    ck.testExactNumber(4, z3.coffs.length);
    ck.testExactNumber(3, z2.coffs.length);
    ck.checkpoint("PowerPolynomial");
    expect(ck.getNumErrors()).equals(0);
  });
  it("SmallSystemFailures", () => {
    const ck = new Checker();
    ck.testUndefined(SmallSystem.linearSystem3d(
      1, 2, 3,
      1, 2, 5,
      1, 2, 0,
      1, 2, 3));
    const result = Vector2d.create();
    ck.testFalse(SmallSystem.linearSystem2d(
      1, 2,
      1, 2,
      1, 2, result));

    ck.testUndefined(SmallSystem.lineSegment3dHXYTransverseIntersectionUnbounded(
      Point4d.create(0, 0, 0, 1), Point4d.create(1, 0, 0, 1),
      Point4d.create(1, 0, 0, 1), Point4d.create(2, 0, 0, 1)));
    ck.testFalse(SmallSystem.lineSegment3dXYTransverseIntersectionUnbounded(
      Point3d.create(0, 0, 0), Point3d.create(1, 0, 0),
      Point3d.create(1, 0, 0), Point3d.create(2, 0, 0), result));
    ck.testFalse(SmallSystem.lineSegment2dXYTransverseIntersectionUnbounded(
      Point2d.create(0, 0), Point2d.create(1, 0),
      Point2d.create(1, 0), Point2d.create(2, 0), result));
    ck.checkpoint("SmallSystemFailures");
    expect(ck.getNumErrors()).equals(0);
  });

  it("lineSegment3dClosestPointUnbounded", () => {
    const ck = new Checker();
    const pointA = Point3d.create(1, 0.1, 3);
    const pointB = Point3d.create(3, 2, -1);
    const pointC = Point3d.create(2, 1, 0.4);
    const r = SmallSystem.lineSegment3dClosestPointUnbounded(pointA, pointB, pointC);
    if (ck.testDefined(r) && r !== undefined) {
      const pointD = pointA.interpolate(r, pointB);
      ck.testPerpendicular(Vector3d.createStartEnd(pointA, pointB), Vector3d.createStartEnd(pointC, pointD), "Closest approach vector is perpendicular");
    }
    ck.checkpoint("lineSegment3dClosestPointUnbounded");
    expect(ck.getNumErrors()).equals(0);
  });

  it("BilinearSystemXY", () => {
    const ck = new Checker();
    for (const p of [
      new BilinearPolynomial(0, 1, 0, 0),
      new BilinearPolynomial(0, 1, 0, 1),
      new BilinearPolynomial(1, 2, 0.2, 3),
      BilinearPolynomial.createUnitSquareValues(1, 0, 0, 1)]) {
      for (const q of [
        new BilinearPolynomial(0, 0, 1, 0),
        new BilinearPolynomial(0, 0, 2, 1),
        new BilinearPolynomial(-1, 0.2, 3, -0.5),
        BilinearPolynomial.createUnitSquareValues(0, 1, 1.1, 0.5)]) {
        for (const uv0 of [Point2d.create(0.1, 0.4), Point2d.create(1, 2)]) {
          const pValue = p.evaluate(uv0.x, uv0.y);
          const qValue = q.evaluate(uv0.x, uv0.y);
          const uvArray = BilinearPolynomial.solvePair(p, pValue, q, qValue);
          // REMARK
          // Although we have set up function values at uv0 as a known point,
          // it is still possible for some degenerate cases to return undefined.
          // What are these cases? overlapping asymptotes?
          if (uvArray && ck.testDefined(uvArray, uv0, [pValue, qValue], p, q)) {
            let numMatch = 0;
            for (const uv1 of uvArray) {
              ck.testCoordinate(pValue, p.evaluate(uv1.x, uv1.y));
              ck.testCoordinate(qValue, q.evaluate(uv1.x, uv1.y));
              if (uv0.isAlmostEqual(uv1)) numMatch++;
            }
            ck.testLE(1, numMatch, "evaluate point appears in roots.");
            const uvArrayB = BilinearPolynomial.solvePair(q, qValue, p, pValue);
            if (ck.testDefined(uvArrayB) && uvArrayB !== undefined)
              ck.testExactNumber(uvArray.length, uvArrayB.length);
          }
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("RowElimination", () => {
    const ck = new Checker();
    for (const rowA of [
      new Float64Array([4, 3, 4, 5, 6])]) {
      for (const rowB of [new Float64Array([1, 2, 1, 3, 2])]) {
        const rowB1 = rowB.slice();
        SmallSystem.eliminateFromPivot(rowA, 0, rowB1, -1.0);
        console.log(" A", rowA);
        console.log(" B", rowB);
        console.log(" B1 reduced", rowB1);
        SmallSystem.eliminateFromPivot(rowA, 0, rowB1, +1.0);
        console.log(" B1 rebuilt", rowB1);
        const q = NumberArray.maxAbsDiff(rowB, rowB1);
        ck.testTrue(Geometry.isAlmostEqualNumber(1, 1 + q));
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

});
// Cubic and Quartic tests (taken from t_analyticRoots.cpp) --------------------------------

// Functions used by the cubic and quartic solver tests
function compare(a: number, b: number) {
  if (a > b) {
    return 1;
  } else if (a < b) {
    return -1;
  } else {
    return 0;
  }
}

function matchRoots(target: number[], actual: GrowableFloat64Array) {
  let eMax = Number.MAX_VALUE;

  if (target.length === actual.length) {
    target.sort(compare);
    actual.sort(compare);

    eMax = 0.0;

    for (let i = 0; i < target.length; i++) {
      const e = target[i] - actual.atUncheckedIndex(i);
      eMax = NumberArray.maxAbsTwo(e, eMax);
    }
  }
  return eMax;
}

function maxDiffMatchedArrays(target: number[], actual: GrowableFloat64Array) {
  if (target.length !== actual.length)
    return Number.MAX_VALUE;
  const tempArray: number[] = [];
  for (let i = 0; i < actual.length; i++) { tempArray.push(actual.atUncheckedIndex(i)); }
  return NumberArray.maxAbsDiff(target, tempArray);
}

function newtonStep(coffs: Float64Array, u: number) {
  const f = coffs[0] + u * (coffs[1] + u * (coffs[2] + u * coffs[3]));
  const df = coffs[1] + u * (2.0 * coffs[2] + u * 3.0 * coffs[3]);
  return (f / df);
}

function newtonStep4(coffs: Float64Array, u: number) {
  const f = coffs[0] + u * (coffs[1] + u * (coffs[2] + u * (coffs[3] + u * coffs[4])));
  const df = coffs[1] + u * (2.0 * coffs[2] + u * (3.0 * coffs[3] + u * 4.0 * coffs[4]));
  return f / df;

}

// check solutions of (x-a) (x^2 + b^2)
describe("AnalyticRoots.SolveCubic", () => {

  it("SolveCubic.Cubic1", () => {
    const ck = new Checker();
    const b = 100.0;
    for (let a = 0.0; a < 1000; a = 10.0 * (a + 1.0)) {
      const coffs = new Float64Array(4);
      coffs[3] = 1.0;
      coffs[2] = - a;
      coffs[1] = b * b;
      coffs[0] = - b * b * a;
      const target: number[] = [a];
      const actual = new GrowableFloat64Array();
      AnalyticRoots.appendCubicRoots(coffs, actual);
      if (ck.testPointer(actual)) {
        ck.testCoordinate(actual.length, 1, "simple root count");

        const eMax = matchRoots(target, actual);
        ck.testTrue(eMax < (1.0e-14 * (1.0 + NumberArray.maxAbsArray(target))), "root error");

        if (Checker.noisy.cubicRoots) {
          console.log(`  (target ${a}) (b ${b} + )`);
          console.log(`  (actual ${actual}) (eMax ${eMax})`);
        }
      }
    }
    ck.checkpoint("SolveCubic");
    expect(ck.getNumErrors()).equals(0);
  });

  it("SolveCubic.Cubic3", () => {
    const rangeScale = 1.0e6;
    const ck = new Checker();

    for (let e = 1.0; e > 2.0e-8; e *= 0.1) {
      for (let x0 = 0.0; x0 < Math.max(rangeScale * e, 20.0); x0 = 10.0 * (x0 + 1.0)) {
        const u0 = x0 - e;
        const u1 = x0;
        const u2 = x0 + 1;
        if (Checker.noisy.cubicRoots)
          console.log(`Cubic Roots for [${u0}, ${u1}, ${u2}]`, { ee: e, x00: x0 });

        const coffs = new Float64Array(4);
        coffs[3] = 1.0;
        coffs[2] = - NumberArray.preciseSum([u0, u1, u2]);
        coffs[1] = NumberArray.preciseSum([u0 * u1, u1 * u2, u0 * u2]);
        coffs[0] = - u0 * u1 * u2;

        const target = [u0, u1, u2];
        target.sort(compare);
        const actual = new GrowableFloat64Array();
        AnalyticRoots.appendCubicRoots(coffs, actual);

        if (ck.testPointer(actual) && ck.testExactNumber(3, actual.length, "3 root cubic")) {
          const uMax = NumberArray.maxAbsArray(target);
          const eMax = matchRoots(target, actual) / uMax;
          const eSafe = maxDiffMatchedArrays(target, actual) / uMax;
          const printTrigger = 1.0e-12;

          if (printAll || (eSafe >= (printTrigger * uMax * uMax / e))) {
            // Check::True (eMax < 1.0e-14 * DoubleOps::MaxAbs (target), "root error");
            console.log("Cubic root variances.  These may be expected behavior under extreme origin conditions");
            console.log(`   (known roots ${target[0]} ${target[1]} ${target[2]})  (eMax ${eMax}) (eSafe ${eSafe}`);
            console.log(`   (computed roots ${actual.atUncheckedIndex(0)} ${actual.atUncheckedIndex(1)} ${actual.atUncheckedIndex(2)}`);
            console.log(`   (correction by newton from computed root  ${newtonStep(coffs, actual.atUncheckedIndex(0))} ${newtonStep(coffs, actual.atUncheckedIndex(1))} ${newtonStep(coffs, actual.atUncheckedIndex(2))}`);
            console.log(`   (correction by newton from known root  ${newtonStep(coffs, target[0])} ${newtonStep(coffs, target[1])} ${newtonStep(coffs, target[2])}`);
          }
        }

        ck.checkpoint("SolveCubic");
        expect(ck.getNumErrors()).equals(0);
      }
    }
  });
  /*
    it("SolveCubic.Cubic3X", () => {
      // root e = small positive -- e.g. in range 01 for sure,like the one interesting root for a cubic bezier
      // x0, x0+1 = two roots "somewhere else" -- not interesting in bezier case.

      for (let e = 1.0; e > 1.0e-10; e *= 0.1) {
        if (printAll) {
          console.log("\n\n e: " + e);
        }
        for (let x0 = 0.0; x0 < 1100; x0 = 10.0 * (x0 + 1.0)) {
          const u0 = e;
          const u1 = x0;
          const u2 = x0 + 1;

          const coffs = new Float64Array(4);
          coffs[3] = 1.0;
          coffs[2] = - NumberArray.PreciseSum([u0, u1, u2]);
          coffs[1] = NumberArray.PreciseSum([u0 * u1, u1 * u2, u0 * u2]);
          coffs[0] = - u0 * u1 * u2;
          const roots = new Float64Array(3);
          const target: number[] = [];
          const actual: number[] = [];
          target.push(u0);
          target.push(u1);
          target.push(u2);
          const xSafe: number[] = [];
          let numRoots = AnalyticRoots.SolveCubicHelper(coffs, roots, xSafe);
          if (numRoots === 2) {
            numRoots = 3;
          }
          for (let i = 0; i < numRoots; i++) {
            actual.push(roots[i]);
          }

          ck.testCoordinate(3, numRoots, "cubic root count");

          if (numRoots === 3) {
            const uMax = NumberArray.MaxAbsArray(target);
            const eMax = matchRoots(target, actual) / uMax;
            const eSafe = ErrorAtClosestRoot(target, actual, xSafe[0]) / uMax;
            const printTrigger = 1.0e-12;

            if (printAll || (eSafe >= (printTrigger * uMax))) {
              ck.testTrue(eMax < (1.0e-14 * NumberArray.MaxAbsArray(target)), "root error");
              console.log("Cubic root variances.  These may be expected behavior under extreme origin conditions");
              console.log("   (known roots " + target[0] + " " + target[1] + " " + target[2] +
                ") (eMax " + eMax + ") (eSafe " + eSafe + ")");
              console.log("   (computed roots " + actual[0] + " " + actual[1] + " " + actual[2] + ")");
              console.log("   (correction by newton from computed root  " + NewtonStep(coffs, actual[0]) +
                " " + NewtonStep(coffs, actual[1]) + " " + NewtonStep(coffs, actual[2]) + ")");
              console.log("   (correction by newton from known root  " + NewtonStep(coffs, target[0]) +
                " " + NewtonStep(coffs, target[1]) + " " + NewtonStep(coffs, target[2]) + ")");
            }
          } else if (numRoots === 1) {
            console.log(" ** SINGLETON *** (u target " + u0 + " " + u1 + " " + u2 + ") (u " + actual[0] +
              ") (spread factor " + ((u1 - u0) / u2) + ")");
            console.log("    NewtonDX " + NewtonStep(coffs, actual[0]));
          }
          ck.checkpoint("SolveCubic");
          expect(ck.getNumErrors()).equals(0);
        }
      }
    });
    */
});

function checkQuartic(u0: number, u1: number, u2: number, u3: number, tolerance: number, ck: Checker) {
  const coffs = new Float64Array(5);
  coffs[4] = 1.0;
  coffs[3] = - NumberArray.preciseSum([u0, u1, u2, u3]);
  const xx: number[] = [];
  xx[0] = u0 * u1;
  xx[1] = u0 * u2;
  xx[2] = u0 * u3;
  xx[3] = u1 * u2;
  xx[4] = u1 * u3;
  xx[5] = u2 * u3;
  coffs[2] = NumberArray.preciseSum(xx);
  coffs[1] = -NumberArray.preciseSum([u0 * u1 * u2, u0 * u1 * u3, u0 * u2 * u3, u1 * u2 * u3]);
  coffs[0] = u0 * u1 * u2 * u3;

  const target = [u0, u1, u2, u3];

  const actual = new GrowableFloat64Array();
  AnalyticRoots.appendQuarticRoots(coffs, actual);
  if (!ck.testPointer(actual, "?No roots for quartic") || !actual)
    return;

  ck.testExactNumber(4, actual.length, "quartic root count");

  const uMax = NumberArray.maxAbsArray(target);
  let eMax = matchRoots(target, actual) / uMax;
  const ok: boolean = ck.testTrue(eMax < tolerance, "quartic root tolerance", eMax, tolerance);
  // Accurate when compared to multiple of 1.0e-8... any higher negative power likely to fail
  if (Checker.noisy.quarticRoots) {
    console.log(`   (actual ${actual.atUncheckedIndex(0)} ${actual.atUncheckedIndex(1)} ${actual.atUncheckedIndex(2)} ${actual.atUncheckedIndex(3)})`);
    console.log(`   (target ${target[0]} ${target[1]} ${target[2]} ${target[3]})`);

  }

  // Additional testing based on NewtonStep
  for (let step = 0; (step < 10) && (eMax > 1.0e-14); step++) {
    if (!ok || printAll) {
      console.log(`   (actualDX   ${newtonStep4(coffs, actual.atUncheckedIndex(0))} ${newtonStep4(coffs, actual.atUncheckedIndex(1))} ${newtonStep4(coffs, actual.atUncheckedIndex(2))} ${newtonStep4(coffs, actual.atUncheckedIndex(3))} `);
      for (let k = 0; k < actual.length; k++) {
        actual.reassign(k, actual.atUncheckedIndex(k) - newtonStep4(coffs, actual.atUncheckedIndex(k)));
      }
      eMax = matchRoots(target, actual) / uMax;
      if (!ok || printAll) {
        console.log(`   (actual ${actual.atUncheckedIndex(0)} ${actual.atUncheckedIndex(1)} ${actual.atUncheckedIndex(2)} ${actual.atUncheckedIndex(3)}   (eMax ${eMax}) `);
      }
    }
  }
}

describe("AnalyticRoots.CheckQuartic", () => {
  const ck = new Checker();

  it("CheckQuartic.TightTol", () => {
    const tightTol = 1.0e-15;
    checkQuartic(0, 1, 2, 3, tightTol, ck);
    ck.checkpoint("SolveQuartic");
    expect(ck.getNumErrors()).equals(0);
  });

  it("CheckQuartic.MediumTol", () => {
    const mediumTol = 1.0e-10;
    for (const delta of [1, 3, 7, 10]) {
      checkQuartic(-11, -10, 10, 10 + delta, mediumTol, ck);
    }
    // Symmetry with varying speed
    for (const delta of [0.1, 1, 5, 10]) {
      checkQuartic(-100, -100 + delta, 100 - delta, 100, mediumTol, ck);
      // CheckQuartic(-100, -100 + delta, 100 - delta, 100, mediumTol, ck);
      // CheckQuartic(-100, -100 + delta, 100 - delta, 100, mediumTol, ck);
    }
    ck.checkpoint("SolveQuartic");
    expect(ck.getNumErrors()).equals(0);
  });

  it("CheckQuartic.LooseTol", () => {
    const looseTol = 1.0e-5;
    const a = 100.0;
    const b = 1000.0;
    const e = 1.0;
    for (const factor of [1, 0.1, 3, 6, 100]) {
      checkQuartic(a, a + e, b, b + e / factor, looseTol, ck);
      // This has a bad failure for factor ==3 when factor1 is applied.
      // const factor1 = 1.0 / 64;
      // CheckQuartic (a * factor1, (a + e) * factor1, b * factor1, (b + e / factor) * factor1, looseTol, ck);
    }
    ck.checkpoint("SolveQuartic");
    expect(ck.getNumErrors()).equals(0);
  });

  function testRoots4(coff: Float64Array, roots: GrowableFloat64Array): boolean {
    let maxF = 0.0;
    const ff: number[] = [];
    const numRoots = roots.length;
    for (let i = 0; i < numRoots; i++) {
      const r = roots.atUncheckedIndex(i);
      const f = coff[0] + r * (coff[1] + r * (coff[2] + r * (coff[3] + r * coff[4])));
      maxF = Math.max(f, Math.abs(maxF));
      ff.push(f);
    }
    if (maxF > 1.0e-8) {
      const roots1 = new GrowableFloat64Array();
      AnalyticRoots.appendQuarticRoots(coff, roots1);
      console.log({ expectedRoots: roots, computedRoots: roots1, fOfx: ff });
      return false;
    }
    return true;
  }

  it("CheckQuartic.TwoRoots", () => {
    const coff = new Float64Array(5);
    coff[0] = 7.5;
    coff[1] = -67.5;
    coff[2] = 157.5;
    coff[3] = -153;
    coff[4] = 48;
    const roots = new GrowableFloat64Array();
    AnalyticRoots.appendQuarticRoots(coff, roots);
    if (ck.testPointer(roots, "expect two roots") && roots) {
      ck.testTrue(testRoots4(coff, roots), "Verify quartic roots");
    }
    expect(ck.getNumErrors()).equals(0);

  });
});
// cspell:word bezroot
// cspell:word earlin's
// Bezier root solver tests (taken from t_bezroot.cpp) ---------------------------------------
// Functions used by the bezier tests
/*
function CheckCubicBezier(a0: number, a1: number, a2: number, numStep: number, ck: Checker) {
  const rootA = new Float64Array(4);
  const rootB = new Float64Array(4);
  const bezCoffs = new Float64Array(3);
  const bez = new Order3Bezier(a0, a1, a2);
  const rangeA = Range1d.createArray([a0, a1, a2]);

  for (let i = 0; i <= numStep; i++) {
    if (rangeA.isNull()) {
      continue;
    }
    const u = i / numStep;
    const target = rangeA.fractionToPoint(u);
    let numA;
    bezCoffs[0] = a0 - target;
    bezCoffs[1] = a1 - target;
    bezCoffs[2] = a2 - target;

  }
}

describe("AnalyticRoots.CheckOrder3Bezier", () => {
  const ck = new Checker();

  it ("CheckOrder3Bezier.RootsIn01", () => {

  });
});
*/
/* Test Earlin's formulation of the resultant for quartic roots.  This only proceeds far enough to see roots of the resultant -- not quartic roots. */
export class AnalyticRoots1 extends AnalyticRoots {
  public static appendQuarticRoots1(c: Float64Array, roots: GrowableFloat64Array) {
    const coffScale = 1.0 / c[4];
    const A = c[3] * coffScale;
    const B = c[2] * coffScale;
    const C = c[1] * coffScale;
    const D = c[0] * coffScale;
    // const origin = -0.25 * A;
    /*  substitute x = y - A/4 to eliminate cubic term:
        x^4 + px^2 + qx + r = 0 */
    const squareA = A * A;
    const p = -3.0 / 8 * squareA + B;
    const q = 0.125 * squareA * A - 0.5 * A * B + C;
    const r = -3.0 / 256 * squareA * squareA + 1.0 / 16 * squareA * B - 1.0 / 4 * A * C + D;
    const cubicCoffs = new Float64Array([-q * q, p * p - 4 * r, 2.0 * p, 1.0]);
    // const cubicRoots = new GrowableFloat64Array (3);
    AnalyticRoots.appendCubicRoots(cubicCoffs, roots);
  }
}

describe("AnalyticRoots", () => {
  it("EDLResultant", () => {
    const noisy = false;
    for (const x0 of [-1, -2]) {
      for (const x1 of [-1, -0.6, -0.98]) {
        for (const x2 of [0, 0.5, 0.10]) {
          if (noisy)
            console.log("*****************");
          const x3 = - (x0 + x1 + x2);
          const quarticCoffs = new Float64Array([
            x0 * x1 * x2 * x3,
            -(x0 * x1 * x2 + x0 * x1 * x3 + x0 * x2 * x3 + x1 * x2 * x3),
            x0 * x1 + x0 * x2 + x0 * x3 + x1 * x2 + x1 * x3 + x2 * x3,
            - (x0 + x1 + x2 + x3),
            1.0]);
          const quarticRoots0 = new GrowableFloat64Array(4);
          AnalyticRoots.appendQuarticRoots(quarticCoffs, quarticRoots0);
          if (noisy) {
            console.log("[xi]", [x0, x1, x2, x3]);
            console.log("quarticCoffs", quarticCoffs);
          }
          const b23 = x2 + x3;
          const b13 = x1 + x3;
          const b12 = x1 + x2;
          const bSquared = new GrowableFloat64Array(3);
          if (noisy) {
            console.log("[roots0]", quarticRoots0);
            AnalyticRoots1.appendQuarticRoots1(quarticCoffs, bSquared);
            console.log("real b squared", [b12 * b12, b13 * b13, b23 * b23]);
            console.log("approx bSquared", bSquared);
          }
        }
      }
    }
  });

});
describe("Geometry", () => {
  it("Curvature", () => {
    const ck = new Checker();
    const r = 2.123;
    const arc = Arc3d.createXY(Point3d.create(1, 2, 3), 2.123, AngleSweep.create360());
    for (const fraction of [0.0, 0.25]) {
      const derivatives = arc.fractionToPointAnd2Derivatives(fraction);
      const curvature = Geometry.curvatureMagnitude(derivatives.vectorU.x, derivatives.vectorU.y, derivatives.vectorU.z,
        derivatives.vectorV.x, derivatives.vectorV.y, derivatives.vectorV.z);
      ck.testCoordinate(1.0 / r, curvature, "circle curvature");
      ck.testExactNumber(0, Geometry.curvatureMagnitude(derivatives.vectorU.x, derivatives.vectorU.y, derivatives.vectorU.z, 0, 0, 0), "line curvature");
    }
    ck.testExactNumber(0, Geometry.curvatureMagnitude(0, 0, 0, 1, 2, 3), "curvature with no first derivative");
    expect(ck.getNumErrors()).equals(0);
  });
  it("Misc", () => {
    const ck = new Checker();
    ck.testExactNumber(1, Geometry.resolveNumber(1, 10));
    ck.testExactNumber(-10, Geometry.resolveNumber(undefined, -10));
    // make sure 0 resolves to itself
    ck.testExactNumber(0, Geometry.resolveNumber(0, -10));

    // interior
    ck.testExactNumber(1, Geometry.restrictToInterval(1, -3, 4));
    ck.testExactNumber(1, Geometry.restrictToInterval(1, 4, -3));
    // outside high
    ck.testExactNumber(4, Geometry.restrictToInterval(5, -3, 4));
    ck.testExactNumber(4, Geometry.restrictToInterval(5, 4, -3));
    // outside low
    ck.testExactNumber(-3, Geometry.restrictToInterval(-5, -3, 4));
    ck.testExactNumber(-3, Geometry.restrictToInterval(-5, 4, -3));

    ck.testTrue(Geometry.isHugeCoordinate(1.0e14));
    ck.testTrue(Geometry.isHugeCoordinate(-1.0e14));

    ck.testFalse(Geometry.isHugeCoordinate(1.0e7));
    ck.testFalse(Geometry.isHugeCoordinate(-1.0e10));
    const e = Geometry.smallMetricDistance * 0.24;
    const point0 = Point3d.create(1, 43, 2);
    const point1 = Point3d.create(point0.x + 0.1 * e, point0.y + e, point0.z + 2);
    ck.testTrue(Geometry.isSamePoint3dXY(point0, point1));
    ck.testFalse(Geometry.isSamePoint3dXY(point0, point1.plus(Vector3d.create(1, 0))));
    ck.testFalse(Geometry.isSamePoint3dXY(point0, point1.plus(Vector3d.create(0, 1))));

    expect(ck.getNumErrors()).equals(0);
  });

});
it("NickelsA", () => {
  const ck = new Checker();
  for (const b of [0, 0.3, -0.3, 5, -5]) {
    for (const a of [1, -1]) {
      for (const c of [1, 0, - 1]) {
        for (const d of [0, 0.2, -0.2, 0.8, -0.8, 1.0, -1.0, 2.0, -2.0]) {
          const cubic = new Degree3PowerPolynomial(d, c, b, a);
          const roots = new GrowableFloat64Array();
          AnalyticRoots.appendCubicRoots([d, c, b, a], roots);
          // Easy to confirm that the returned roots are in fact roots.
          // This does NOT confirm that all roots were found.
          for (let i = 0; i < roots.length; i++)
            ck.testCoordinate(0, cubic.evaluate(roots.atUncheckedIndex(i)), " abcd", a, b, c, d);
        }
      }
    }
  }

  expect(ck.getNumErrors()).equals(0);
});
function findRoot(r: number, roots: GrowableFloat64Array, tol: number = 1.0e-10): boolean {
  for (let i = 0; i < roots.length; i++) {
    const q = roots.atUncheckedIndex(i);
    if (Math.abs(r - q) < tol)
      return true;
  }
  return false;
}
it("NickelsThreeRootCases", () => {
  const ck = new Checker();
  // construct cubics s * (x-r0) * (x-r1) * (x-r2) with known distinct roots.
  const epsilon1 = 0.25;
  const epsilon2 = -0.01;
  for (const s of [1, 2, -1, -2]) {
    for (const r0 of [-2, -1, 0, 1, 2]) {
      for (const q1 of [-2, -2, -0, 1, 2]) {
        const r1 = q1 + epsilon1;
        for (const q2 of [-2, -1, 0, 1, 2]) {
          const r2 = q2 + epsilon2;
          const a = s;
          const b = -s * (r0 + r1 + r2);
          const c = s * (r0 * r1 + r1 * r2 + r0 * r2);
          const d = - s * r0 * r1 * r2;
          const roots = new GrowableFloat64Array();
          AnalyticRoots.appendCubicRoots([d, c, b, a], roots);
          ck.testTrue(findRoot(r0, roots), a, b, c, d);
          ck.testTrue(findRoot(r1, roots), a, b, c, d);
          ck.testTrue(findRoot(r2, roots), a, b, c, d);
        }
      }
    }
  }
  expect(ck.getNumErrors()).equals(0);
});
