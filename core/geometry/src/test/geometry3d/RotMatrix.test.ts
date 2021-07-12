/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// import { prettyPrint } from "./testFunctions";
import { expect } from "chai";
import { AxisIndex, AxisOrder, Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { InverseMatrixState, Matrix3d, PackedMatrix3dOps } from "../../geometry3d/Matrix3d";
import { Point2d } from "../../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Transform } from "../../geometry3d/Transform";
import { XYAndZ } from "../../geometry3d/XYZProps";
import { Sample } from "../../serialization/GeometrySamples";
import { Checker } from "../Checker";

/* eslint-disable no-console */
// cSpell:words XXYZ YXYZ ZXYZ XYZAs Eigen dgnplatform VTAT

function verifyInverseGo(ck: Checker, matrixA: Matrix3d) {
  const vectorY = Vector3d.create(1, 2, 3);
  const vectorX = matrixA.multiplyInverse(vectorY);
  if (vectorX) {
    const vectorAX = matrixA.multiplyVector(vectorX);
    ck.testVector3d(vectorY, vectorAX, "AX=B solution");
    const matrixB = matrixA.inverse();
    if (ck.testPointer(matrixB, "matrix has inverse") && matrixB) {
      const matrixAB = matrixA.multiplyMatrixMatrix(matrixB);
      ck.testTrue(matrixAB.isIdentity, "verify A*A^inverse is identity");
      // verify in-place inverse
      let matrixE = matrixA.clone();
      matrixE.inverse(matrixE);
      if (!ck.testMatrix3d(matrixB, matrixE, "in-place inverse")) {
        matrixE = matrixA.clone();
        matrixE.inverse(matrixE);
      }

    }
  }
}
// input a newly created Matrix3d.
function verifyMatrix3dInverseProperties(ck: Checker, matrixA: Matrix3d) {

  verifyInverseGo(ck, matrixA);
  verifyInverseGo(ck, matrixA.clone());
  const matrixB = Matrix3d.createIdentity();
  matrixB.setFrom(matrixA);
  verifyInverseGo(ck, matrixB);

  // make changes -- if not properly marked, inverseGo will get caught with old inverse ...
  matrixA.setRow(0, Vector3d.create(1, 2, 3));
  verifyInverseGo(ck, matrixA);
}
describe("Matrix3d", () => {
  it("CachedInverse", () => {
    const ck = new Checker();

    verifyMatrix3dInverseProperties(ck, Matrix3d.createIdentity());
    verifyMatrix3dInverseProperties(ck, Matrix3d.createScale(2, 3, 4));
    verifyMatrix3dInverseProperties(ck, Matrix3d.createRotationAroundVector(Vector3d.create(1, 2, 3), Angle.createDegrees(32))!);
    verifyMatrix3dInverseProperties(ck, Matrix3d.createRowValues(
      10, 1, 2,
      3, 20, 1,
      4, 2, 15));

    const singularX = Matrix3d.createScale(0, 1, 1);
    const singularY = Matrix3d.createScale(1, 0, 1);
    const singularZ = Matrix3d.createScale(1, 1, 0);

    const vector = Vector3d.create(4, 2.324324, 9.21);

    for (const matrix of [singularX, singularY, singularZ]) {
      ck.testUndefined(matrix.inverseCoffs);
      ck.testExactNumber(InverseMatrixState.singular, matrix.inverseState);
      ck.testUndefined(singularX.multiplyInverseTranspose(vector));
      ck.testUndefined(singularX.multiplyInverse(vector));
      ck.testUndefined(singularX.multiplyInverseXYZAsVector3d(vector.x, vector.y, vector.z));
      ck.testUndefined(singularX.multiplyInverseXYZAsPoint3d(vector.x, vector.y, vector.z));
      const matrix1 = matrix.clone();
      const originalMagnitudes = Vector3d.create();
      ck.testFalse(matrix1.normalizeColumnsInPlace(originalMagnitudes));
      ck.testMatrix3d(matrix, matrix1, "failed normalize leaves matrix alone");
      ck.testFalse(matrix1.normalizeRowsInPlace(originalMagnitudes));
      ck.testMatrix3d(matrix, matrix1, "failed normalize leaves matrix alone");
    }

    // scaling columns updates inverse.
    // scaling columns with a zero scale clears inverse.
    for (const matrix of Sample.createScaleSkewMatrix3d()) {
      const vectorQ = matrix.multiplyInverseXYZAsVector3d(4, 7, 11);
      // There should now be a stored inverted . ..
      if (vectorQ) {
        ck.testPointer(matrix.inverseCoffs);
        matrix.scaleColumnsInPlace(0, 3, 8);
        ck.testExactNumber(matrix.inverseState, InverseMatrixState.singular);
      }
    }
    ck.checkpoint("Matrix3d.CachedInverse");
    expect(ck.getNumErrors()).equals(0);
  });

  it("ColumnAccess", () => {
    const ck = new Checker();
    const vectorQ = Vector3d.create(1.789, 2.9, -0.33);
    for (const matrix of Sample.createMatrix3dArray()) {
      const columnX = matrix.columnX();
      const columnY = matrix.columnY();
      const columnZ = matrix.columnZ();

      ck.testCoordinate(columnX.magnitude(), matrix.columnXMagnitude());
      ck.testCoordinate(columnY.magnitude(), matrix.columnYMagnitude());
      ck.testCoordinate(columnZ.magnitude(), matrix.columnZMagnitude());

      ck.testCoordinate(columnX.dotProduct(vectorQ), matrix.dotColumnX(vectorQ));
      ck.testCoordinate(columnY.dotProduct(vectorQ), matrix.dotColumnY(vectorQ));
      ck.testCoordinate(columnZ.dotProduct(vectorQ), matrix.dotColumnZ(vectorQ));
    }
    ck.checkpoint("Matrix3d.ColumnAccess");
    expect(ck.getNumErrors()).equals(0);
  });

  it("RowAccess", () => {
    const ck = new Checker();
    const vectorQ = Vector3d.create(1.789, 2.9, -0.33);
    for (const matrix of Sample.createMatrix3dArray()) {
      const rowX = matrix.rowX();
      const rowY = matrix.rowY();
      const rowZ = matrix.rowZ();

      ck.testCoordinate(rowX.magnitude(), matrix.rowXMagnitude());
      ck.testCoordinate(rowY.magnitude(), matrix.rowYMagnitude());
      ck.testCoordinate(rowZ.magnitude(), matrix.rowZMagnitude());

      ck.testCoordinate(rowX.dotProduct(vectorQ), matrix.dotRowX(vectorQ));
      ck.testCoordinate(rowY.dotProduct(vectorQ), matrix.dotRowY(vectorQ));
      ck.testCoordinate(rowZ.dotProduct(vectorQ), matrix.dotRowZ(vectorQ));
    }
    ck.checkpoint("Matrix3d.RowAccess");
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("AxisOrder.Verify", () => {
  it("Test1", () => {
    const ck = new Checker();
    for (const axisOrder of [AxisOrder.XYZ, AxisOrder.YZX, AxisOrder.ZXY, AxisOrder.XZY, AxisOrder.YXZ, AxisOrder.ZYX]) {
      if (Checker.noisy.axisOrderVerify)
        console.log("AxisOrder", axisOrder,
          Geometry.axisOrderToAxis(axisOrder, 0),
          Geometry.axisOrderToAxis(axisOrder, 1),
          Geometry.axisOrderToAxis(axisOrder, 2));

      const axis0 = Geometry.axisOrderToAxis(axisOrder, 0);
      const axis1 = Geometry.axisOrderToAxis(axisOrder, 1);
      const axis2 = Geometry.axisOrderToAxis(axisOrder, 2);
      const shift = axisOrder as number <= 2 ? 1 : 2;
      // axisOrder 0,1,2 are cyclic forms of 012.
      // axis order 3,4,5 are cyclic forms of 021
      ck.testExactNumber(axis1, Geometry.cyclic3dAxis(axis0 + shift));
      ck.testExactNumber(axis2, Geometry.cyclic3dAxis(axis1 + shift));
      ck.testExactNumber(axis0, Geometry.cyclic3dAxis(axis2 + shift));

    }
    ck.checkpoint("AxisOrder.Verify");
    expect(ck.getNumErrors()).equals(0);
  });
  it("AssembleColumns", () => {
    const vector0 = Vector3d.create(1000, 2, 5);
    const vector1 = Vector3d.create(1, 1001, -2);
    const vector2 = Vector3d.create(-3, 1.234, 1002);
    const ck = new Checker();
    for (const axisOrder of [AxisOrder.XYZ, AxisOrder.YZX, AxisOrder.ZXY, AxisOrder.ZXY, AxisOrder.XZY, AxisOrder.YXZ, AxisOrder.ZYX]) {

      const axis0 = Geometry.axisOrderToAxis(axisOrder, 0);
      const axis1 = Geometry.axisOrderToAxis(axisOrder, 1);
      const axis2 = Geometry.axisOrderToAxis(axisOrder, 2);
      const matrix = Matrix3d.createColumnsInAxisOrder(axisOrder, vector0, vector1, vector2);
      const vectorB0 = matrix.getColumn(axis0);
      const vectorB1 = matrix.getColumn(axis1);
      const vectorB2 = matrix.getColumn(axis2);
      ck.testVector3d(vector0, vectorB0);
      ck.testVector3d(vector1, vectorB1);
      ck.testVector3d(vector2, vectorB2);
    }
    ck.checkpoint("AxisOrder.AssembleColumns");
    expect(ck.getNumErrors()).equals(0);
  });

});

function verifyRigidScale(ck: Checker, candidate: Matrix3d, expectedScale: number, expectRigid: boolean) {
  // console.log ("VerifyRigid " + prettyPrint (candidate) + "expect" + expectedScale);
  const data = candidate.factorRigidWithSignedScale();
  if (!expectRigid) {
    ck.testUndefined(data, "confirm not rigid with scale");
    return;
  }
  if (ck.testPointer(data, "Expect factorRigidScale") && data) {
    ck.testCoordinate(expectedScale, data.scale);
    candidate.factorRigidWithSignedScale();
    ck.testTrue(data.rigidAxes.isRigid(), "confirm rigid axes");
    const matrixB = data.rigidAxes.scale(data.scale);
    ck.testMatrix3d(candidate, matrixB);
  }
}

describe("Matrix3d.Factors", () => {
  it("FactorRigidScale", () => {
    const ck = new Checker();
    const rotations = Sample.createRigidAxes();
    for (const rigid of rotations) {
      ck.testTrue(rigid.isRigid(), "verify rigid");
      for (const scale of [2, -1, -2]) {
        verifyRigidScale(ck, rigid.scale(scale), scale, true);
        verifyRigidScale(ck, rigid.scaleColumns(scale, scale, scale * 1.3), 1.0, false);
        verifyRigidScale(ck, rigid.scaleColumns(scale, -1.0 * scale, scale), -scale, true);
      }
    }
    ck.checkpoint("Matrix3d.FactorRigidScale");
    expect(ck.getNumErrors()).equals(0);
  });

  it("FactorRigidScaleExample", () => {
    const ck = new Checker();
    for (const rigidScale0 of [
      Matrix3d.createRowValues(0.019908485552297163, -0.0040687348173572974, 0,
        0.0040687348173572974, 0.019908485552297163, 0,
        0, 0, 0.020320000000000008)]) {
      const data = rigidScale0.factorRigidWithSignedScale();
      if (ck.testDefined(data) && data) {
        const quat = data.rigidAxes.toQuaternion();
        const rigidAxes1 = Matrix3d.createFromQuaternion(quat);
        ck.testMatrix3d(data.rigidAxes, rigidAxes1, "matrix quat matrix RT");
      }
    }
    ck.checkpoint("Matrix3d.FactorRigidScaleExample");
    expect(ck.getNumErrors()).equals(0);
  });

  it("AxisAndAngleOfRotationA", () => {
    const ck = new Checker();

    const rotations = Sample.createRigidAxes();
    for (const rigid of rotations) {
      ck.testTrue(rigid.isRigid(), "verify rigid");
      const data = rigid.getAxisAndAngleOfRotation();
      if (ck.testTrue(data.ok, "Extract axis and angle")) {
        const rigid1 = Matrix3d.createRotationAroundVector(data.axis, data.angle);
        if (ck.testPointer(rigid1))
          ck.testMatrix3d(rigid, rigid1, "round trip rotation around vector");
      }
    }
    ck.checkpoint("Matrix3d.AxisAndAngleOfRotationA");
    expect(ck.getNumErrors()).equals(0);
  });

  it("BadInputCases", () => {
    const ck = new Checker();
    const failure1 = Matrix3d.createViewedAxes(Vector3d.unitX(), Vector3d.unitX());
    ck.testUndefined(failure1, "createViewedAxes with cross failure");

    const failure2 = Matrix3d.createRotationAroundVector(Vector3d.createZero(), Angle.createDegrees(40));
    ck.testUndefined(failure2, "createRotationAroundVector with 000 axis");

    const failure3 = Matrix3d.createDirectionalScale(Vector3d.createZero(), 2.0);
    ck.testTrue(failure3.isDiagonal, "createDirectionalScale fails to uniform scale");
    ck.checkpoint("Matrix3d.BadInputCases");
    expect(ck.getNumErrors()).equals(0);
  });

  it("AxisAndAngleOfRotationB", () => {
    const ck = new Checker();
    const rotationVectors = Sample.createNonZeroVectors();
    let maxDiff12 = 0;
    for (const axis of rotationVectors) {
      if (Checker.noisy.rotMatrixAxisAndAngle)
        console.log("*************************************************axis ", axis);
      for (const degrees of [0.01, 10, -14, 78, 128, 0.01, 0.328]) {
        if (Checker.noisy.rotMatrixAxisAndAngle)
          console.log(` **** degrees ${degrees}`);
        const matrix1 = Matrix3d.createRotationAroundVector(axis, Angle.createDegrees(degrees))!;
        /*
        const data3 = getAxisAndAngleOfRotationByDirectFactors(matrix1);
        // remark: don't directly compare data.axis and axis -- they might be negated !!!
        // instead check that data generates the same matrix.
        const matrix3 = Matrix3d.createRotationAroundVector(data3.axis, data3.angle);
        if (ck.testFalse(data3.error, "data3 ok" + degrees)) {
          if (ck.testPointer(matrix3, "good data for createRotation") && matrix3)
            ck.testMatrix3d(matrix1, matrix3, "AxisAngle3 maps to same Matrix3d");
        }
  */
        const data2 = matrix1.getAxisAndAngleOfRotation();
        // remark: don't directly compare data.axis and axis -- they might be negated !!!
        // instead check that data generates the same matrix.
        const matrix2 = Matrix3d.createRotationAroundVector(data2.axis, data2.angle);
        if (ck.testTrue(data2.ok, `data2 ok ${degrees}`)) {
          if (ck.testPointer(matrix2, "good data for createRotation") && matrix2)
            ck.testMatrix3d(matrix1, matrix2, "AxisAngle2 maps to same Matrix3d");
        }

        if (matrix2) {
          const a12 = matrix2.maxDiff(matrix1);

          if (Checker.noisy.rotMatrixAxisAndAngle)
            console.log("matrix1.maxDiff (matrix2) ", a12);
          maxDiff12 = Math.max(maxDiff12, a12);
        }
      }
    }
    ck.testLT(maxDiff12, 1.0e-15); // console.log(" matrix reconstruction max deviation: a12 " + maxDiff12);
    ck.checkpoint("Matrix3d.AxisAndAngleOfRotationB");
    expect(ck.getNumErrors()).equals(0);
  });
  // rotation by 180 degrees is a special case to invert.
  it("AxisAndAngleOfRotationPI", () => {
    const ck = new Checker();
    for (const vectorA0 of [
      Vector3d.unitX(),
      Vector3d.unitY(),
      Vector3d.unitZ(),
      Vector3d.create(1, 1, 0),
      Vector3d.create(-1, 1, 0),
      Vector3d.create(0, 1, 1),
      Vector3d.create(0, -1, 1),
      Vector3d.create(1, 0, 1),
      Vector3d.create(-1, 0, 1),
      Vector3d.create(-1, 2, 0),
      Vector3d.create(1, 2, 3),
      Vector3d.create(-1, 2, 3),
      Vector3d.create(1, -2, 3),
      Vector3d.create(-1, -2, 3)]) {
      for (const scale of [1, -1]) {
        const vectorA = vectorA0.scale(scale);
        const angleA = Angle.createDegrees(180);
        const matrixA = Matrix3d.createRotationAroundVector(vectorA, angleA)!;
        const vectorAndAngle = matrixA.getAxisAndAngleOfRotation();
        ck.testAngleAllowShift(angleA, vectorAndAngle.angle);
        ck.testTrue(vectorA.isParallelTo(vectorAndAngle.axis, true));
      }
    }
    ck.checkpoint("Matrix3d.AxisAndAngleOfRotationA");
    expect(ck.getNumErrors()).equals(0);
  });

});

function modifyPitchAngleToPreventInversion(radians: number): number { return radians; }
// matrix construction to duplicate native dgnplatform method NavigateMotion::GenerateRotationTransform
// the matrix product expands to:
// yawMatrix * invViewRotation * pitchMatrix * viewRotation
function generateRotationTransform(eyePoint: Point3d, viewRotation: Matrix3d, yawRadiansPerTime: number, pitchRateRadiansPerTime: number, time: number): Transform {
  const yawAngle = Angle.createRadians(yawRadiansPerTime * time);
  const pitchAngle = Angle.createRadians(modifyPitchAngleToPreventInversion(pitchRateRadiansPerTime * time));

  let invViewRotation = viewRotation.inverse(); // m_viewport->getMatrix3d());
  if (!invViewRotation)
    invViewRotation = Matrix3d.createIdentity();

  const pitchMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitX(), pitchAngle)!;

  const pitchTimesView = pitchMatrix.multiplyMatrixMatrix(viewRotation);
  const inverseViewTimesPitchTimesView = invViewRotation.multiplyMatrixMatrix(pitchTimesView);

  const yawMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), yawAngle)!;

  const yawTimesInverseViewTimesPitchTimesView = yawMatrix.multiplyMatrixMatrix(inverseViewTimesPitchTimesView);
  const transform = Transform.createFixedPointAndMatrix(eyePoint, yawTimesInverseViewTimesPitchTimesView); /// m_viewport->GetCamera().GetEyePoint());
  return transform;
}

function testRotateVectorAroundVector(vector: Vector3d, axis: Vector3d, angle: Angle, ck: Checker) {
  const result = Vector3d.createRotateVectorAroundVector(vector, axis, angle);
  const isParallel = vector.isParallelTo(axis);
  ck.testTrue(!isParallel, "Vector parallel to axis");
  if (isParallel && result) {   // Result could be undefined
    const vector1 = result.clone();
    const radians1 = vector.planarRadiansTo(vector1, axis);
    ck.testTrue(Angle.isAlmostEqualRadiansAllowPeriodShift(angle.radians, radians1), "rotation angle in plane perp to axis");
    ck.testAngleAllowShift(axis.angleTo(vector), axis.angleTo(vector1), "angle from rotation axis");
    ck.testCoordinate(vector.magnitude(), vector1.magnitude(), "rotation does not change magnitude");
  }
}

function testRotateVectorToVector(vectorA: Vector3d, vectorB: Vector3d, ck: Checker) {
  const matrix = Matrix3d.createRotationVectorToVector(vectorA, vectorB);
  const fraction = 0.2;

  ck.testPointer(matrix);
  if (matrix) {
    const matrix0 = Matrix3d.createPartialRotationVectorToVector(vectorA, fraction, vectorB)!;
    const matrix1 = Matrix3d.createPartialRotationVectorToVector(vectorA, 1.0 - fraction, vectorB)!;
    ck.testTrue(matrix.isRigid(), "Rigid rotation");
    const vectorB1 = matrix.multiplyVector(vectorA);
    ck.testParallel(vectorB, vectorB1);
    ck.testMatrix3d(matrix, matrix0.multiplyMatrixMatrix(matrix1), "partial rotations accumulate");
  }
}

describe("Matrix3d.ViewConstructions", () => {
  it("FactorRigidScale", () => {
    const ck = new Checker();
    const eyePoint = Point3d.create(10, 15, 23);
    const viewRotation = Matrix3d.createRotationAroundVector(Vector3d.create(1, 2, 3), Angle.createRadians(0.23))!;
    const yawRateRadiansPerTime = 0.5;
    const pitchRateRadiansPerTime = 0.25;
    const time = 0.1;
    const nativeTransform = Transform.createRefs(
      Vector3d.create(
        0.88610832476555645,
        0.060080207464391355,
        -0.40375557735756828),
      Matrix3d.createRowValues(
        0.99857861707557882, -0.053201794397914448, -0.0032116338935924771,
        0.053107143509079233, 0.99828614780495017, -0.024584515636062437,
        0.004514069974036361, 0.024379010923246527, 0.99969259625080453,
      ));
    const transform = generateRotationTransform(eyePoint, viewRotation, yawRateRadiansPerTime, pitchRateRadiansPerTime, time);
    ck.testMatrix3d(nativeTransform.matrix, transform.matrix);
    ck.testXYZ(nativeTransform.origin, transform.origin);

  });

  it("RotateVectorAroundVector", () => {
    const ck = new Checker();
    testRotateVectorAroundVector(Vector3d.create(1, 0, 0), Vector3d.create(0, 0, 1), Angle.createDegrees(25.0), ck);
    testRotateVectorAroundVector(Vector3d.create(1, 0, 0), Vector3d.create(0, 1, 0), Angle.createDegrees(-49.0), ck);
    testRotateVectorAroundVector(Vector3d.create(1, 2, 4), Vector3d.create(5, -2, 1), Angle.createDegrees(25.2), ck);
    ck.checkpoint("RotateVectorAroundVector");
    expect(ck.getNumErrors()).equals(0);
  });

  it("RotateVectorToVector", () => {
    const ck = new Checker();
    testRotateVectorToVector(Vector3d.create(1, 0, 0), Vector3d.create(0, 0, 1), ck);
    testRotateVectorToVector(Vector3d.create(1, 0, 0), Vector3d.create(0, 1, 0), ck);
    testRotateVectorToVector(Vector3d.create(1, 0, 0), Vector3d.create(1, 0, 0), ck);
    // negated vector cases ...

    testRotateVectorToVector(Vector3d.create(1, 0, 0), Vector3d.create(-1, 0), ck);
    testRotateVectorToVector(Vector3d.create(0, -1, 0), Vector3d.create(-0, 1, 0), ck);
    testRotateVectorToVector(Vector3d.create(0, 0, 1), Vector3d.create(0, 0, -1), ck);
    ck.testUndefined(Matrix3d.createPartialRotationVectorToVector(Vector3d.createZero(), 0.3, Vector3d.createZero()), "rotation with zero vector");
    ck.testUndefined(Matrix3d.createPartialRotationVectorToVector(Vector3d.createZero(), 0.2, Vector3d.unitX()), "rotation with zero vector");

    const vectorA = Vector3d.create(1, 2, 3);
    const vectorB = Vector3d.create(4, 2, 9);
    const vectorANeg = vectorA.scale(-2);
    testRotateVectorToVector(vectorA, vectorB, ck);
    testRotateVectorToVector(vectorA, vectorANeg, ck);
    ck.checkpoint("RotateVectorToVector");
    expect(ck.getNumErrors()).equals(0);
  });

  it("RotateAroundAxis", () => {
    const ck = new Checker();
    ck.testMatrix3d(
      Matrix3d.create90DegreeRotationAroundAxis(0),
      Matrix3d.createRotationAroundVector(Vector3d.unitX(), Angle.createDegrees(90))!, "Rotate 90 X");
    ck.testMatrix3d(
      Matrix3d.create90DegreeRotationAroundAxis(1),
      Matrix3d.createRotationAroundVector(Vector3d.unitY(), Angle.createDegrees(90))!, "Rotate 90 Y");
    ck.testMatrix3d(
      Matrix3d.create90DegreeRotationAroundAxis(2),
      Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(90))!, "Rotate 90 Z");
    ck.checkpoint("RotateAroundAxis");
    expect(ck.getNumErrors()).equals(0);

    for (const degrees of [0.0, 10.0, -40.0]) {
      const theta = Angle.createDegrees(degrees);
      ck.testMatrix3d(
        Matrix3d.createRotationAroundAxisIndex(AxisIndex.X, theta),
        Matrix3d.createRotationAroundVector(Vector3d.unitX(), theta)!, "Rotate theta X");
      ck.testMatrix3d(
        Matrix3d.createRotationAroundAxisIndex(AxisIndex.Y, theta),
        Matrix3d.createRotationAroundVector(Vector3d.unitY(), theta)!, "Rotate 90 Y");
      ck.testMatrix3d(
        Matrix3d.createRotationAroundAxisIndex(AxisIndex.Z, theta),
        Matrix3d.createRotationAroundVector(Vector3d.unitZ(), theta)!, "Rotate 90 Z");
      ck.checkpoint("RotateAroundAxis");
    }
    expect(ck.getNumErrors()).equals(0);

  });

  it("RowColumn", () => {
    const ck = new Checker();
    const vectorX = Vector3d.create(1, 2, 4);
    const vectorY = Vector3d.create(3, 9, 27);
    const vectorZ = Vector3d.create(5, 25, 125);
    const byRow = Matrix3d.createRows(vectorX, vectorY, vectorZ);
    const byRow1 = byRow.clone();
    byRow1.normalizeRowsInPlace();
    for (const i of [0, 1, 2]) {
      const v0 = byRow.getRow(i);
      const v1 = byRow1.getRow(i);
      ck.testCoordinate(v1.magnitude(), 1, `normalized row ${i}`);
      ck.testCoordinate(v0.magnitude(), v0.dotProduct(v1), `scaling ${i}`);
    }

    const byColumn = Matrix3d.createColumns(vectorX, vectorY, vectorZ);
    const fillByIndex = Matrix3d.createZero();
    let qMax = 0;
    for (const i of [0, 1, 2]) {
      ck.testVector3d(byColumn.getColumn(i), byRow.getRow(i), "row, column vector access");
      for (const j of [0, 1, 2]) {
        ck.testExactNumber(byRow.at(i, j), byColumn.at(j, i), `ij${i} ${j}`);
        const q = byRow.at(i, j);
        qMax = Geometry.maxAbsXYZ(q, qMax, 0);
        fillByIndex.setAt(i, j, byRow.at(i, j));
        ck.testExactNumber(qMax, fillByIndex.maxAbs(), "evolving maxAbs");
      }
    }
    ck.testMatrix3d(byRow, fillByIndex, "clone by setAt");
    ck.testMatrix3d(byRow, byColumn.transpose(), "Row, column create and transpose");

    const transposeDiff = byRow.clone();
    transposeDiff.addScaledInPlace(byColumn, -1.0);
    ck.testCoordinate(transposeDiff.sumSquares(), 2.0 * byColumn.sumSkewSquares(), "skew squares");
    expect(ck.getNumErrors()).equals(0);
  });
  it("QuickDots", () => {
    const ck = new Checker();
    const vectorX = Vector3d.create(1, 2, 4);
    const vectorY = Vector3d.create(3, 9, 27);
    const vectorZ = Vector3d.create(5, 25, 125);
    const byRow = Matrix3d.createRows(vectorX, vectorY, vectorZ);
    const vector = Vector3d.create(-3.12321, 0.28, 1.249);
    ck.testCoordinate(vector.dotProduct(vectorX), byRow.dotRowXXYZ(vector.x, vector.y, vector.z));
    ck.testCoordinate(vector.dotProduct(vectorY), byRow.dotRowYXYZ(vector.x, vector.y, vector.z));
    ck.testCoordinate(vector.dotProduct(vectorZ), byRow.dotRowZXYZ(vector.x, vector.y, vector.z));
    expect(ck.getNumErrors()).equals(0);
  });

  it("SignedPermutation", () => {
    const ck = new Checker();
    const unitX = Vector3d.unitX();
    const unitY = Vector3d.unitY();

    const orderList = [AxisOrder.XYZ, AxisOrder.YZX, AxisOrder.ZXY, AxisOrder.XZY, AxisOrder.YXZ, AxisOrder.ZYX];
    const signList = [1, 1, 1, -1, -1, -1];
    const shiftValue = 0.02;
    for (let i = 0; i < orderList.length; i++) {
      const axisOrder = orderList[i];
      const sign = signList[i];
      const matrix = Matrix3d.createRigidFromColumns(unitX, unitY, axisOrder)!;
      ck.testCoordinate(sign, matrix.determinant(), "determinant of permutation");
      ck.testTrue(matrix.isSignedPermutation, "confirm signed permutation");
      // muddy up one indexed entry at a time . . .
      for (let k = 0; k < 9; k++) {
        const matrixA = matrix.clone();
        const ak = matrixA.coffs[k];
        matrixA.coffs[k] += shiftValue;
        ck.testFalse(matrixA.isSignedPermutation, "confirm not signed permutation");
        if (ak !== 1.0) {
          matrixA.coffs[k] = 1;
          ck.testFalse(matrixA.isSignedPermutation, "confirm not signed permutation");
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("StandardView", () => {
    const ck = new Checker();
    for (let viewIndex = 0; viewIndex < 8; viewIndex++) {
      const matrix = Matrix3d.createStandardWorldToView(viewIndex);
      ck.testTrue(matrix.isRigid());
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("ScaleAlongVector", () => {
    const ck = new Checker();
    for (const perpVector of [Vector3d.create(0, 0, 1), Vector3d.create(1, 2, 4)]) {
      perpVector.normalizeInPlace();
      const vectors = Sample.createNonZeroVectors();
      const projector = Matrix3d.createDirectionalScale(perpVector, 0.0);
      for (const scale of [2, 1, -1, -5]) {
        const matrix = Matrix3d.createDirectionalScale(perpVector, scale);
        for (const vectorA of vectors) {
          const vector0 = projector.multiplyVector(vectorA);
          const vectorB = matrix.multiplyVector(vectorA);
          const vector0A = Vector3d.createStartEnd(vector0, vectorA);
          const vector0B = Vector3d.createStartEnd(vector0, vectorB);
          const vector0AScaled = vector0A.scale(scale);
          ck.testTrue(vector0.isPerpendicularTo(vector0A, true), "projector");
          ck.testTrue(vector0.isPerpendicularTo(vector0B, true), "projector");
          ck.testVector3d(vector0B, vector0AScaled, "scale projection");
        }
      }
      // in place !!!
      projector.multiplyVectorArrayInPlace(vectors);
      for (const v of vectors) {
        ck.testTrue(v.isPerpendicularTo(perpVector, true), "perpendicular projection");
        ck.testTrue(v.isPerpendicularTo(perpVector, true), "perpendicular projection");
      }

    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("MultiplyXY", () => {
    const ck = new Checker();
    const perpVector = Vector3d.create(1, 2, 4);
    perpVector.normalizeInPlace();
    const vectors = Sample.createNonZeroVectors();
    const projector = Matrix3d.createDirectionalScale(perpVector, -1.0);
    const columnX = projector.columnX();
    const columnY = projector.columnY();
    const origin = Point2d.create(4, 3);
    columnX.z = columnY.z = 0.0;
    for (const v of vectors) {
      const xy1 = Matrix3d.xyPlusMatrixTimesXY(origin, projector, v);
      const xy2 = origin.plus2Scaled(columnX, v.x, columnY, v.y);
      ck.testPoint2d(xy1, xy2);

      const v2 = projector.multiplyTransposeVector(v);
      const v3 = projector.multiplyTransposeXYZ(v.x, v.y, v.z);
      ck.testVector3d(v2, v3);

      const v4 = v.clone();
      const v5 = v.clone();
      projector.multiplyVectorInPlace(v4);
      projector.multiplyTransposeVectorInPlace(v5);
      ck.testVector3d(v4, projector.multiplyVector(v));
      ck.testVector3d(v5, projector.multiplyTransposeVector(v));

      const v4a = projector.multiplyInverseXYZAsVector3d(v4.x, v4.y, v4.z)!;
      ck.testVector3d(v4a, v, "multiply, multiplyInverseXYZAsVector");
      ck.testXYZ(v4a, projector.multiplyInverseXYZAsPoint3d(v4.x, v4.y, v4.z)!);

    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("MultiplyXYZToFloat64Array", () => {
    const ck = new Checker();
    const vectors = Sample.createNonZeroVectors();
    for (const perpVector of [
      Vector3d.unitX(),
      Vector3d.unitY(),
      Vector3d.unitZ(),
      Vector3d.create(1, 2, 4)]) {
      perpVector.normalizeInPlace();
      const matrix = Matrix3d.createDirectionalScale(perpVector, -1.0);
      const columnX = matrix.columnX();
      const columnY = matrix.columnY();
      const columnZ = matrix.columnZ();
      const origin = Point3d.create(4, 3, 0.1231);
      const w = 0.9213123678687689769;
      for (const v of vectors) {
        const resultBW = Matrix3d.xyzPlusMatrixTimesWeightedCoordinatesToFloat64Array(origin, matrix, v.x, v.y, v.z, w);
        const resultAW = Point3d.createScale(origin, w).plus3Scaled(columnX, v.x, columnY, v.y, columnZ, v.z);
        const resultB = Matrix3d.xyzPlusMatrixTimesCoordinatesToFloat64Array(origin, matrix, v.x, v.y, v.z);
        const resultA = origin.plus3Scaled(columnX, v.x, columnY, v.y, columnZ, v.z);
        ck.testXYZ(resultA, Vector3d.createFrom(resultB), "XYZPlusMatrixTimesWeightedCoordinatesToFloat64Array");
        ck.testXYZ(resultAW, Vector3d.createFrom(resultBW), "XYZPlusMatrixTimesCoordinatesToFloat64Array");

      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("AxisOrderConstructions", () => {
    const ck = new Checker();
    const perpVector = Vector3d.create(1, 2, 4);
    perpVector.normalizeInPlace();
    const scale = -2.9;
    const projector = Matrix3d.createDirectionalScale(perpVector, scale);
    const orderList = [AxisOrder.XYZ, AxisOrder.YZX, AxisOrder.ZXY, AxisOrder.XZY, AxisOrder.YXZ, AxisOrder.ZYX];
    const signList = [1, 1, 1, -1, -1, -1];
    for (let i = 0; i < orderList.length; i++) {
      const axisOrder = orderList[i];
      const sign = signList[i];
      const frame = projector.clone();
      frame.axisOrderCrossProductsInPlace(axisOrder);
      ck.testTrue(sign * frame.determinant() > 0.0);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Misc", () => {
    const ck = new Checker();
    let epsilon = 0.0001;
    const matrixA = Matrix3d.createRowValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const matrixA1 = matrixA.clone();
    ck.testTrue(matrixA.isExactEqual(matrixA1));
    for (let i = 0; i < 9; i++) {
      matrixA.clone(matrixA1);
      ck.testTrue(matrixA.isExactEqual(matrixA1));
      matrixA1.coffs[i] += epsilon;
      epsilon = - epsilon;
      ck.testFalse(matrixA1.isAlmostEqual(matrixA), "exact equal after perturbation");
    }

    const matrixXY = Matrix3d.createRowValues(1, 2, 0, 3, 4, 0, 0, 0, 1); // all effects are xy
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        matrixXY.clone(matrixA1);
        ck.testTrue(matrixA1.isXY, "xy matrix");
        if (i === 2 || j === 2) {
          matrixA1.setAt(i, j, matrixA1.at(i, j) + epsilon);
          ck.testFalse(matrixA1.isXY, "xy matrix perturbed");

        }
      }
    }

    expect(ck.getNumErrors()).equals(0);
  });

  it("JSON", () => {
    const ck = new Checker();
    const epsilon = 1.0e-15;
    const matrixA = Matrix3d.createRowValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const jsonA = matrixA.toJSON();
    const matrixB = Matrix3d.fromJSON(jsonA);
    ck.testTrue(matrixA.isAlmostEqual(matrixB, epsilon));
    const matrixZ = Matrix3d.fromJSON([4, 3, 2, 1]);
    const matrixZ1 = Matrix3d.createRowValues(4, 3, 0, 2, 1, 0, 0, 0, 1);
    ck.testTrue(matrixZ.isAlmostEqual(matrixZ1, epsilon), "2d matrix");

    const matrixC = Matrix3d.fromJSON();  // creates zeros
    ck.testMatrix3d(matrixC, Matrix3d.createZero());

    const matrixD = Matrix3d.fromJSON(jsonA);  // clone!
    ck.testMatrix3d(matrixA, matrixD);

    const matrixE = Matrix3d.fromJSON([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    ck.testMatrix3d(matrixA, matrixE);
    expect(ck.getNumErrors()).equals(0);
  });

  it("transpose", () => {
    const ck = new Checker();
    const vector = Vector3d.create(2.9123, -0.23423, 4.0029);
    for (const matrixA of Sample.createScaleSkewMatrix3d()) {
      const matrixAT = matrixA.transpose();
      const vectorAV = matrixA.multiplyVector(vector);
      // const vectorATV = matrixA.multiplyTransposeVector(vector);
      const vectorVTAT = matrixAT.multiplyTransposeVector(vector);
      ck.testVector3d(vectorVTAT, vectorAV, "matrix*vector transpose");

      const matrixATT = matrixAT.clone();
      matrixATT.transpose(matrixATT);
      ck.testMatrix3d(matrixATT, matrixA, "in place transpose of transpose is original");
    }
    expect(ck.getNumErrors()).equals(0);
  });

});

function skewFactors(matrixA: Matrix3d): { rigidFactor: Matrix3d, skewFactor: Matrix3d } | undefined {
  const rigid = Matrix3d.createRigidFromMatrix3d(matrixA, AxisOrder.XYZ);
  if (rigid) {
    const skew = rigid.multiplyMatrixTransposeMatrix(matrixA);
    return { rigidFactor: rigid, skewFactor: skew };
  }
  return undefined;
}
describe("SkewFactorization", () => {
  it("XY", () => {
    const ck = new Checker();
    for (const matrix of Sample.createScaleSkewMatrix3d()) {
      const factors = skewFactors(matrix);
      if (ck.testPointer(factors)) {
        const product = factors.rigidFactor.multiplyMatrixMatrix(factors.skewFactor);
        ck.testMatrix3d(matrix, product, "rigid*skew=matrix");
        ck.testTrue(factors.skewFactor.isUpperTriangular, "upper triangular skew factors");
      }
      const scaleX = 3, scaleY = 2, scaleZ = 7;
      // inverse first, then scale:
      const matrixA = matrix.clone();
      matrixA.computeCachedInverse(true);
      matrixA.scaleColumnsInPlace(scaleX, scaleY, scaleZ);

      // scale, then inverse
      const matrixB = matrix.clone();
      matrixB.scaleColumnsInPlace(scaleX, scaleY, scaleZ);
      matrixB.computeCachedInverse(true);
      ck.testNumberArray(matrixA.inverseCoffs, matrixB.inverseCoffs);
    }
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("InverseVariants", () => {
  it("CreateCapture", () => {
    const ck = new Checker();
    for (const matrix of Sample.createScaleSkewMatrix3d()) {
      const coffs = new Float64Array(matrix.coffs);
      matrix.computeCachedInverse(true);
      const inverseCoffs = new Float64Array(matrix.inverseCoffs!);
      const matrix1 = Matrix3d.createCapture(coffs);     // matrix1 uses coffs direction.
      const matrix2 = Matrix3d.createCapture(new Float64Array(coffs), inverseCoffs);   // uses copy of coffs; uses inverseCoffs directly
      ck.testMatrix3d(matrix, matrix1);
      ck.testMatrix3d(matrix, matrix2);
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("Misc", () => {
    const ck = new Checker();
    const matrixA = Matrix3d.createRotationAroundVector(Vector3d.create(1, 2, 3), Angle.createDegrees(13))!;
    const matrixB = Matrix3d.createZero();
    ck.testUndefined(matrixA.multiplyMatrixMatrixInverse(matrixB), "singular matrix trapped at multiplication");
    expect(ck.getNumErrors()).equals(0);
  });
  it("SnapToCube", () => {
    const ck = new Checker();
    const points = Sample.createPoint3dLattice(-1, 1, 1);
    ck.testExactNumber(points.length, 27, "Expect 27 lattice points");
    const a = 1.0e-8;
    const fuzz = [Vector3d.create(a, 0, 0), Vector3d.create(0, a, 0), Vector3d.create(0, 0, a), Vector3d.create(a, a, 0), Vector3d.create(0, a, a), Vector3d.create(a, 0, 0), Vector3d.create(a, a, a)];
    const bigShift = Vector3d.create(0.1, 0.2, -0.3);
    const smallTol = 1.0e-14;
    const bigTol = 1.0e-6;
    // All lattice points
    for (const point of points) {
      const p = Vector3d.create(point.x, point.y, point.z);
      if (p.magnitude() !== 0.0) {
        const q = snapVectorToCubeFeatures(p, bigTol);
        ck.testLE(p.distance(q), smallTol, "minimal snap on lattice points");
        for (const s of [1, -1]) {
          for (const shiftVector of fuzz) {
            const p1 = p.plusScaled(shiftVector, s);
            const q1 = snapVectorToCubeFeatures(p1);
            if (!ck.testLE(q1.angleTo(p).radians, smallTol, "snap on lattice fuzz points"))
              snapVectorToCubeFeatures(p1);
            else {
              const matrix3 = Matrix3d.createRigidViewAxesZTowardsEye(q1.x, q1.y, q1.z);
              const z3 = matrix3.columnZ();
              ck.testLE(z3.angleTo(p).radians, bigTol, "matrix Z near request");
            }
          }
        }
        // make sure a big shift (not aligned with any lattice direction) is left alone
        const p2 = p.plus(bigShift);
        const q2 = snapVectorToCubeFeatures(p2);
        if (!ck.testLE(q2.angleTo(p2).radians, smallTol, "non-lattice point is left alone."))
          snapVectorToCubeFeatures(p2);

      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
});

function checkInverseRelationship(ck: Checker, name: string, matrix: Matrix3d | undefined, expectedInverseState: InverseMatrixState | undefined) {
  if (matrix !== undefined) {
    if (Checker.noisy.matrixMultiplyAliasing) {
      console.log("-------------------------------");
      console.log(`${name}    ${matrix.coffs}`, ` inverse state ${matrix.inverseState}`);
      console.log(`                                                 cached inverse    ${matrix.inverseCoffs}`);
    }
    if (expectedInverseState !== undefined)
      ck.testExactNumber(expectedInverseState, matrix.inverseState, `${name} inverse state`);
    if (matrix.inverseState === InverseMatrixState.inverseStored) {
      const product = Matrix3d.createScale(2, 4, 3);
      PackedMatrix3dOps.multiplyMatrixMatrix(matrix.coffs, matrix.inverseCoffs!, product.coffs);
      ck.testTrue(product.isIdentity, "Confirm inverseCoffs", product);
    }
  }
}

function testProductCombinations(ck: Checker,
  matrixA0: Matrix3d,
  matrixB0: Matrix3d,
  expectInvertible: boolean,
  f: (matrixA: Matrix3d, matrixB: Matrix3d, result?: Matrix3d) => Matrix3d | undefined,
  expectedInverseState: InverseMatrixState | undefined) {
  const matrixA = matrixA0.clone();
  const matrixB = matrixB0.clone();
  const masterResult = f(matrixA, matrixB);
  if (masterResult !== undefined) {
    checkInverseRelationship(ck, "AB 1", masterResult, expectedInverseState);
    const matrixAInverse = matrixA.inverse();
    const matrixBInverse = matrixB.inverse();
    if (expectedInverseState !== undefined)
      ck.testExactNumber(expectedInverseState, masterResult.inverseState, "master state");
    if (expectInvertible) {
      ck.testDefined(matrixAInverse, "expect invertible A");
      ck.testDefined(matrixBInverse, "expect invertible B");
      const masterResultInverse = masterResult.inverse();
      if (ck.testDefined(masterResultInverse) && masterResultInverse) {
        const inverseTest = masterResultInverse.multiplyMatrixMatrix(masterResult);
        ck.testDefined(inverseTest);
      }
    }

    const expectProductInverseCoffs = expectInvertible && matrixA.hasCachedInverse && matrixB.hasCachedInverse;
    ck.testBoolean(expectProductInverseCoffs, masterResult.hasCachedInverse);
    if (masterResult) {
      // pre-allocate result, no aliasing ...
      {
        const matrixA1 = matrixA.clone();
        const matrixB1 = matrixB.clone();
        const matrixC1 = Matrix3d.createZero();
        const result1 = f(matrixA1, matrixB1, matrixC1);
        checkInverseRelationship(ck, "AB 1", result1, expectedInverseState);
        if (ck.testDefined(result1) && result1) {
          ck.testMatrix3d(masterResult, result1, "(A,B) vs (A,B,result)");
          ck.testMatrix3d(masterResult, matrixC1, "(A,B) vs (A,B,result)");
          ck.testBoolean(expectProductInverseCoffs, result1.hasCachedInverse);
        }
      }
      // reuse A:
      {
        const matrixA2 = matrixA.clone();
        const matrixB2 = matrixB.clone();
        // const matrixC2 = Matrix3d.createZero();
        const result2 = f(matrixA2, matrixB2, matrixA2);
        checkInverseRelationship(ck, "AB 2", result2, expectedInverseState);

        if (ck.testDefined(result2) && result2) {
          ck.testMatrix3d(masterResult, result2, "(A,B) vs (A,B,A)");
          ck.testMatrix3d(masterResult, matrixA2, "(A,B) vs (A,B,A)");
          ck.testBoolean(expectProductInverseCoffs, result2.hasCachedInverse);
        }
      }
      // reuse B:
      {
        const matrixA3 = matrixA.clone();
        const matrixB3 = matrixB.clone();
        // const matrixC3 = Matrix3d.createZero();
        const result3 = f(matrixA3, matrixB3, matrixB3);
        checkInverseRelationship(ck, "AB 3", result3, expectedInverseState);
        if (ck.testDefined(result3) && result3) {
          ck.testMatrix3d(masterResult, result3, "(A,B) vs (A,B,B)");
          ck.testMatrix3d(masterResult, matrixB3, "(A,B) vs (A,B,B)");
          ck.testBoolean(expectProductInverseCoffs, result3.hasCachedInverse);
        }
      }
    }
  }
}
describe("MatrixProductAliasing", () => {
  it("CachedInverse", () => {
    const ck = new Checker();
    /*
    const matrix = Matrix3d.createRowValues(
      0.9996204009003555, 0.027550936532400754, 0,
      - 0.027550936532400754, 0.9996204009003555, 0,
      0, 0, 1);
    */
    const matrixA = Matrix3d.createRowValues(10, 1, 2, -3, 12, 4, 3, 5, 15);
    const matrixB = Matrix3d.createRowValues(9, 0.2, 2.2, -3.5, 12.5, 4.1, 3.9, -2.1, 17.8);
    const matrixAB0 = matrixA.multiplyMatrixMatrix(matrixB);
    ck.testExactNumber(InverseMatrixState.unknown, matrixAB0.inverseState);
    const matrixABT0 = matrixA.multiplyMatrixMatrixTranspose(matrixB);
    ck.testExactNumber(InverseMatrixState.unknown, matrixABT0.inverseState);
    const matrixATB0 = matrixA.multiplyMatrixTransposeMatrix(matrixB);
    ck.testExactNumber(InverseMatrixState.unknown, matrixATB0.inverseState);
    // confirm that multiplies without inversion did not introduce inverse
    ck.testExactNumber(InverseMatrixState.unknown, matrixA.inverseState);
    ck.testExactNumber(InverseMatrixState.unknown, matrixB.inverseState);

    const vectorU = Vector3d.create(1.4, 2.3, 9.1);
    ck.testUndefined(matrixA.inverseCoffs);

    // This forces inverse coffs to appear !!!
    matrixA.multiplyInverse(vectorU);

    ck.testDefined(matrixA.inverseCoffs, "inverseCoffs appear after multiplyInverseXYZ");
    matrixB.multiplyInverse(vectorU);

    testProductCombinations(ck, matrixA, matrixB, true, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d => matrixA1.multiplyMatrixMatrix(matrixB1, result1), InverseMatrixState.inverseStored);
    testProductCombinations(ck, matrixA, matrixB, true, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d | undefined => matrixA1.multiplyMatrixInverseMatrix(matrixB1, result1), InverseMatrixState.inverseStored);
    testProductCombinations(ck, matrixA, matrixB, true, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d | undefined => matrixA1.multiplyMatrixMatrixInverse(matrixB1, result1), InverseMatrixState.inverseStored);

    testProductCombinations(ck, matrixA, matrixB, true, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d | undefined => matrixA1.multiplyMatrixTransposeMatrix(matrixB1, result1), InverseMatrixState.inverseStored);
    testProductCombinations(ck, matrixA, matrixB, true, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d | undefined => matrixA1.multiplyMatrixMatrixTranspose(matrixB1, result1), InverseMatrixState.inverseStored);
    const singularMatrix = Matrix3d.createScale(1, 0, 1);
    testProductCombinations(ck, matrixA, singularMatrix, false, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d => matrixA1.multiplyMatrixMatrix(matrixB1, result1), InverseMatrixState.singular);
    testProductCombinations(ck, matrixA, singularMatrix, false, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d | undefined => matrixA1.multiplyMatrixTransposeMatrix(matrixB1, result1), InverseMatrixState.singular);
    testProductCombinations(ck, matrixA, singularMatrix, false, (matrixA1: Matrix3d, matrixB1: Matrix3d, result1?: Matrix3d): Matrix3d | undefined => matrixA1.multiplyMatrixMatrixTranspose(matrixB1, result1), InverseMatrixState.singular);
    ck.testUndefined(matrixA.multiplyMatrixMatrixInverse(singularMatrix), "singular product");
    ck.testUndefined(singularMatrix.multiplyMatrixInverseMatrix(matrixA), "singular product");

    const matrix = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(20))!;

    for (const result of [undefined, Matrix3d.createIdentity()]) {
      checkInverseRelationship(ck, "inverse", matrix.inverse(result), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();
      const angle = Angle.createRadians(Math.atan2(0.027550936532400754, 0.9996204009003555));
      checkInverseRelationship(ck, "zRotation", Matrix3d.createRotationAroundAxisIndex(2, angle), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();

      checkInverseRelationship(ck, "zRotation", Matrix3d.createRotationAroundVector(Vector3d.unitZ(), angle), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();

      checkInverseRelationship(ck, "AB", matrix.multiplyMatrixMatrix(matrixB, result), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();
      checkInverseRelationship(ck, "ABInverse", matrix.multiplyMatrixMatrixInverse(matrixB, result), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();
      checkInverseRelationship(ck, "AInverseB", matrix.multiplyMatrixInverseMatrix(matrixB, result), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();
      checkInverseRelationship(ck, "ABTranspose", matrix.multiplyMatrixMatrixTranspose(matrixB, result), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();
      checkInverseRelationship(ck, "ATransposeB", matrix.multiplyMatrixMatrixTranspose(matrixB, result), InverseMatrixState.inverseStored);
      if (result)
        result.setZero();
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("cloneRigid", () => {
    const ck = new Checker();
    // createRigidFromMatrix3d failed on this.
    // Failure due to applying metric tolerance to columns AFTER doing cross products.
    // with diagonal magnitude "a", first cross product is a^2, second uses an original column and first cross and has magnitude a^3
    // That failed the tolerance test.
    // Revised code divides entire (copy of) input by its largest magnitude, and the later test passes as expected. (But can still fail for near-parallel columns)
    const matrix = Matrix3d.createRowValues(
      -6.438509378433656e-18, -1.0840344784091856e-18, -0.008851813267008355,
      7.88489990157899e-34, -0.008851813267008355, 1.0840344784091856e-18,
      -0.008851813267008355, 0, 6.438509378433656e-18);
    const origin = Point3d.create(1, 2, 3);
    const transform = Transform.createOriginAndMatrix(origin, matrix);
    const transform1 = transform.cloneRigid(AxisOrder.XYZ);
    ck.testType(transform1, Transform, "confirm corrected code returned a transform.");
    for (const scale of [1.0 / matrix.maxAbs(), 10, 100, 1000]) {
      const matrix1 = matrix.scale(scale);
      const transform2 = Transform.createOriginAndMatrix(origin, matrix1);
      const transform3 = transform2.cloneRigid(AxisOrder.XYZ);
      ck.testType(transform3, Transform, "cloneRigid");
    }
    for (const a of [1.0e-5, 1.0e-4, 1.0e-2, 1, 1.0e3, 1.0e6]) {
      const matrixA = Matrix3d.createScale(a, a, a);
      const matrixC = Matrix3d.createRigidFromMatrix3d(matrixA);
      ck.testTrue(matrixC !== undefined && matrixC.isIdentity, "normalize of uniform scale");
    }
    const matrixB = Matrix3d.createScale(1.0e-10, 1.0e-10, 1.0e-10);
    const e = 1.0e-10;
    ck.testUndefined(Matrix3d.createRigidFromMatrix3d(matrixB), "Expect no rigid from epsilon matrix");
    const matrixD = Matrix3d.createRowValues(
      1, 1, 0,
      0, e, 0,
      0, e, 1);
    ck.testUndefined(Matrix3d.createRigidFromMatrix3d(matrixD), "Expect no rigid from matrix with near-parallel columns");

    expect(ck.getNumErrors()).equals(0);
  });
});

function correctSmallNumber(value: number, tolerance: number): number {
  return Math.abs(value) < tolerance ? 0 : value;
}
/**
 * Snap coordinates of a vector to zero and to each other so that the vector prefers to be
 * * perpendicular to a face of the unit cube.
 * * or pass through a nearby vertex or edge of the unit cube.
 * @param zVector existing z vector.
 * @param zTolerance tolerance to determine if a z vector component is close to zero or 1.
 */
function snapVectorToCubeFeatures(zVector: XYAndZ, tolerance: number = 1.0e-6): Vector3d {
  const x = correctSmallNumber(zVector.x, tolerance);
  let y = correctSmallNumber(zVector.y, tolerance);
  let z = correctSmallNumber(zVector.z, tolerance);

  const xx = Math.abs(x);
  const yy = Math.abs(y);
  const zz = Math.abs(z);

  // adjust any adjacent pair of near equal values to the first.
  if (Geometry.isSameCoordinate(xx, yy, tolerance)) {
    y = Geometry.split3WaySign(y, -xx, xx, xx);
  }
  if (Geometry.isSameCoordinate(yy, zz, tolerance)) {
    z = Geometry.split3WaySign(z, -yy, yy, yy);
  }
  if (Geometry.isSameCoordinate(xx, zz, tolerance)) {
    z = Geometry.split3WaySign(z, -xx, xx, xx);
  }
  return Vector3d.create(x, y, z);
}
/*
 * Adjust a worldToView matrix to favor both
 * * direct view at faces, edges, and corners of a view cube.
 * * heads up
 * @param matrix candidate matrix
 * @param tolerance tolerance for cleaning up fuzz.  The default (1.0e-6) is appropriate if very dirty viewing operations are expected.
 * @param result optional result.
 function snapWorldToViewMatrixToCubeFeatures(worldToView: Matrix3d, tolerance: number = 1.0e-6, result?: Matrix3d): Matrix3d {
  const oldZ = worldToView.rowZ();
  const newZ = snapVectorToCubeFeatures(oldZ, tolerance);
  // If newZ is true up or down, it will have true 0 for x and y.
  // special case this to take x direction from the input.
  if (newZ.x === 0.0 && newZ.y === 0) {
    const perpVector = worldToView.rowX();
    result = Matrix3d.createRigidFromColumns(newZ, perpVector, AxisOrder.ZXY, result)!;
  } else {
    result = Matrix3d.createRigidViewAxesZTowardsEye(newZ.x, newZ.y, newZ.z, result);
  }
  if (result)
    result.transposeInPlace();
  return result;
}
*/
