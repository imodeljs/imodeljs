/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Serialization
 */
import { flatbuffers } from "flatbuffers";
import { BGFBAccessors } from "./BGFBAccessors";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { LineSegment3d } from "../curve/LineSegment3d";
import { Arc3d } from "../curve/Arc3d";
import { LineString3d } from "../curve/LineString3d";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { IndexedPolyface } from "../polyface/Polyface";
import { CurveCollection } from "../curve/CurveCollection";
import { ParityRegion } from "../curve/ParityRegion";
import { Loop } from "../curve/Loop";
import { UnionRegion } from "../curve/UnionRegion";
import { Path } from "../curve/Path";
import { BSplineCurve3d } from "../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { SolidPrimitive } from "../solid/SolidPrimitive";
import { Box } from "../solid/Box";
import { Sphere } from "../solid/Sphere";
import { LinearSweep } from "../solid/LinearSweep";
import { RotationalSweep } from "../solid/RotationalSweep";
import { RuledSweep } from "../solid/RuledSweep";
import { TorusPipe } from "../solid/TorusPipe";
import { Cone } from "../solid/Cone";
import { GeometryQuery } from "../curve/GeometryQuery";
import { BSplineSurface3d, BSplineSurface3dH, UVSelect } from "../bspline/BSplineSurface";
import { PointString3d } from "../curve/PointString3d";
import { Point3d, XYZ } from "../geometry3d/Point3dVector3d";
import { AuxChannel, AuxChannelData, PolyfaceAuxData } from "../polyface/AuxData";
import { TransitionSpiral3d } from "../curve/spiral/TransitionSpiral3d";
import { IntegratedSpiral3d } from "../curve/spiral/IntegratedSpiral3d";
import { DgnSpiralTypeQueries } from "./BGFBReader";
import { DirectSpiral3d } from "../curve/spiral/DirectSpiral3d";
import { TaggedNumericData } from "../polyface/TaggedNumericData";
import { InterpolationCurve3d } from "../bspline/InterpolationCurve3d";
import { AkimaCurve3d } from "../bspline/AkimaCurve3d";

/**
 * Context to write to a flatbuffer blob.
 *  * This class is internal.
 *  * Public access is through BentleyGeometryFlatBuffer.geometryToBytes()
 * @internal
 */
export class BGFBWriter {
  public builder: flatbuffers.Builder;
  public constructor(defaultSize: number = 1024) {
    this.builder = new flatbuffers.Builder(defaultSize);
  }
  /**
   *
   * @param data data source, as Float64Array or number[].
   * @param count optional count, used only if less than .length numbers are to be written.
   */
  public writeDoubleArray(data: Float64Array | number[] | undefined, count?: number): number {
    if (data === undefined)
      return 0;
    let numFloats = data.length;
    if (numFloats === 0)
      return 0;
    if (count !== undefined && count < numFloats)
      numFloats = count;
    this.builder.startVector(8, numFloats, 8);
    for (let i = numFloats - 1; i >= 0; i--) {
      this.builder.addFloat64(data[i]);
    }
    return this.builder.endVector();
  }

  /**
   *
   * @param data data source, as Float64Array or number[].
   * @param count optional count, used only if less than .length numbers are to be written.
   */
   public writeIntArray(data: Int32Array | number[] | undefined): number {
    if (data === undefined)
      return 0;
    const numInt = data.length;
    if (numInt === 0)
      return 0;
    this.builder.startVector(4, numInt, 4);
    for (let i = numInt - 1; i >= 0; i--) {
      this.builder.addInt32(data[i]);
    }
    return this.builder.endVector();
  }

  /**
   *
   * @param data data source, as array derived from XYZ.
   * The data is output as a flat array of 3*data.length numbers.
   */
   public writePackedYZArray(data: XYZ[] | undefined): number {
    if (data === undefined)
      return 0;
    const numFloats = data.length * 3;
    if (numFloats === 0)
      return 0;
     this.builder.startVector(8, numFloats, 8);
     // write in reverse index order, and zyx within each XYZ
    for (let i = data.length - 1; i >= 0; i--) {
      this.builder.addFloat64(data[i].z);
      this.builder.addFloat64(data[i].y);
      this.builder.addFloat64(data[i].x);
    }
    return this.builder.endVector();
  }

  public writeCurveCollectionAsFBCurveVector(cv: CurveCollection): number | undefined {
    const childrenOffsets: flatbuffers.Offset[] = [];
    for (const child of cv.children!) {
      if (child instanceof CurvePrimitive) {
        const childOffset = this.writeCurvePrimitiveAsFBVariantGeometry(child);
        if (childOffset)
          childrenOffsets.push(childOffset);
      } else if (child instanceof CurveCollection) {
        const childOffset = this.writeCurveCollectionAsFBVariantGeometry(child);
        if (childOffset)
          childrenOffsets.push(childOffset);
      }
    }

    const childrenVectorOffset = BGFBAccessors.CurveVector.createCurvesVector(this.builder, childrenOffsets);
    let cvType = 0;
    if (cv instanceof Path) cvType = 1;
    else if (cv instanceof Loop) {
      cvType = cv.isInner ? 3 : 2;
    } else if (cv instanceof ParityRegion) cvType = 4;
    else if (cv instanceof UnionRegion) cvType = 5;
    const curveVectorOffset = BGFBAccessors.CurveVector.createCurveVector(this.builder, cvType, childrenVectorOffset);
    return curveVectorOffset;
  }

  public writeCurveCollectionAsFBVariantGeometry(cv: CurveCollection): number | undefined {
    const curveVectorOffset = this.writeCurveCollectionAsFBCurveVector(cv);
    if (curveVectorOffset === undefined)
      return undefined;
    return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagCurveVector, curveVectorOffset, 0);
  }

  public writeInterpolationCurve3dAsFBVariantGeometry(curve: InterpolationCurve3d): number | undefined {
    const props = curve.cloneProps();
    const fitPointsOffset = this.writeDoubleArray(curve.copyFitPointsFloat64Array());
    const knotOffset = props.knots ? this.writeDoubleArray(props.knots) : 0;

      // REMARK: some native or flatbuffer quirk made startTangent a point and endTangent a vector.
    const startTangentOffset = props.startTangent ?
      BGFBAccessors.DPoint3d.createDPoint3d(this.builder,
          XYZ.x(props.startTangent), XYZ.y(props.startTangent), XYZ.z(props.startTangent))
            : 0;
    const endTangentOffset = props.endTangent ?
      BGFBAccessors.DVector3d.createDVector3d(this.builder,
        XYZ.x(props.endTangent), XYZ.y(props.endTangent), XYZ.z(props.endTangent))
          : 0;
      BGFBAccessors.InterpolationCurve.startInterpolationCurve(this.builder);
    BGFBAccessors.InterpolationCurve.addFitPoints(this.builder, fitPointsOffset);
    if (props.order)
      BGFBAccessors.InterpolationCurve.addOrder(this.builder, props.order);
    if (props.closed)
      BGFBAccessors.InterpolationCurve.addClosed(this.builder, props.closed);
    if (props.isChordLenKnots)
      BGFBAccessors.InterpolationCurve.addIsChordLenKnots(this.builder, props.isChordLenKnots);
    if (props.isColinearTangents)
      BGFBAccessors.InterpolationCurve.addIsColinearTangents(this.builder, props.isColinearTangents);
    if (props.isChordLenKnots)
      BGFBAccessors.InterpolationCurve.addIsChordLenKnots(this.builder, props.isChordLenKnots);
    if (props.isNaturalTangents)
      BGFBAccessors.InterpolationCurve.addIsNaturalTangents(this.builder, props.isNaturalTangents);
    if (startTangentOffset !== 0)
      BGFBAccessors.InterpolationCurve.addStartTangent(this.builder, startTangentOffset);
    if (endTangentOffset !== 0)
      BGFBAccessors.InterpolationCurve.addEndTangent(this.builder, endTangentOffset);
    if (knotOffset !== 0)
      BGFBAccessors.InterpolationCurve.addKnots(this.builder, knotOffset);
    const headerOffset = BGFBAccessors.InterpolationCurve.endInterpolationCurve(this.builder);
    return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagInterpolationCurve, headerOffset, 0);
    }

  public writeAkimaCurve3dAsFBVariantGeometry(curve: AkimaCurve3d): number | undefined {
    const fitPointsOffset = this.writeDoubleArray(curve.copyFitPointsFloat64Array());
    BGFBAccessors.AkimaCurve.startAkimaCurve(this.builder);
    BGFBAccessors.AkimaCurve.addPoints(this.builder, fitPointsOffset);
    const headerOffset = BGFBAccessors.AkimaCurve.endAkimaCurve(this.builder);
    return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagAkimaCurve, headerOffset, 0);
    }

  public writeBsplineCurve3dAsFBVariantGeometry(bcurve: BSplineCurve3d): number | undefined {
    const order = bcurve.order;
    const closed = false;   // typescript bcurves are not closed.  There is API to impose wrapping . . .
    const weightsOffset = 0;
    const polesOffset = this.writeDoubleArray(bcurve.copyPointsFloat64Array());
    if (polesOffset === undefined)
      return undefined;
    const knotsOffset = this.writeDoubleArray(bcurve.copyKnots(true));
    const headerOffset = BGFBAccessors.BsplineCurve.createBsplineCurve(this.builder,
      order, closed, polesOffset, weightsOffset, knotsOffset);
    return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagBsplineCurve, headerOffset, 0);
  }

  public writeBSplineSurfaceAsFBVariantGeometry(bsurf: BSplineSurface3d | BSplineSurface3dH): number | undefined {
    const orderU = bsurf.orderUV(UVSelect.uDirection);
    const orderV = bsurf.orderUV(UVSelect.VDirection);
    const numPolesU = bsurf.numPolesUV(UVSelect.uDirection);
    const numPolesV = bsurf.numPolesUV(UVSelect.VDirection);
    const closedU = false;
    const closedV = false;
    const holeOrigin = 0;
    const boundariesOffset = 0;
    let polesOffset = 0;
    let weightsOffset = 0;
    if (bsurf instanceof BSplineSurface3d) {
      polesOffset = this.writeDoubleArray(bsurf.copyPointsFloat64Array());
    } else if (bsurf instanceof BSplineSurface3dH) {
      polesOffset = this.writeDoubleArray(bsurf.copyXYZToFloat64Array(false));
      weightsOffset = this.writeDoubleArray(bsurf.copyWeightsToFloat64Array());
    }
    const uKnotsOffset = this.writeDoubleArray(bsurf.knots[0].copyKnots(true));
    const vKnotsOffset = this.writeDoubleArray(bsurf.knots[1].copyKnots(true));

    const headerOffset = BGFBAccessors.BsplineSurface.createBsplineSurface(this.builder, polesOffset, weightsOffset, uKnotsOffset, vKnotsOffset,
      numPolesU, numPolesV, orderU, orderV, 0, 0, holeOrigin, boundariesOffset, closedU, closedV);
    return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagBsplineSurface, headerOffset, 0);
  }

  public writeBsplineCurve3dAHsFBVariantGeometry(bcurve: BSplineCurve3dH): number | undefined {
    const order = bcurve.order;
    const closed = false;   // typescript bcurves are not closed.  There is API to impose wrapping . . .
    const polesOffset = this.writeDoubleArray(bcurve.copyXYZFloat64Array(false));
    const weightsOffset = this.writeDoubleArray(bcurve.copyWeightsFloat64Array());
    const knotsOffset = this.writeDoubleArray(bcurve.copyKnots(true));
    const headerOffset = BGFBAccessors.BsplineCurve.createBsplineCurve(this.builder,
      order, closed, polesOffset, weightsOffset, knotsOffset);
    return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagBsplineCurve, headerOffset, 0);
  }

  public writeCurvePrimitiveAsFBVariantGeometry(curvePrimitive: CurvePrimitive): number | undefined {
    if (curvePrimitive instanceof LineSegment3d) {
      const segmentDataOffset = BGFBAccessors.DSegment3d.createDSegment3d(this.builder,
        curvePrimitive.point0Ref.x,
        curvePrimitive.point0Ref.y,
        curvePrimitive.point0Ref.z,
        curvePrimitive.point1Ref.x,
        curvePrimitive.point1Ref.y,
        curvePrimitive.point1Ref.z);
      const lineSegmentOffset = BGFBAccessors.LineSegment.createLineSegment(this.builder, segmentDataOffset);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagLineSegment, lineSegmentOffset, 0);
    } else if (curvePrimitive instanceof Arc3d) {
      const data = curvePrimitive.toVectors();
      const arcDataOffset = BGFBAccessors.DEllipse3d.createDEllipse3d(this.builder,
        data.center.x, data.center.y, data.center.z,
        data.vector0.x, data.vector0.y, data.vector0.z,
        data.vector90.x, data.vector90.y, data.vector90.z,
        data.sweep.startRadians,
        data.sweep.sweepRadians);
      const arcOffset = BGFBAccessors.EllipticArc.createEllipticArc(this.builder, arcDataOffset);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagEllipticArc, arcOffset, 0);
    } else if (curvePrimitive instanceof LineString3d) {
      const coordinates = extractNumberArray(curvePrimitive.packedPoints);
      const lineStringOffset = BGFBAccessors.LineString.createLineString(this.builder,
        BGFBAccessors.LineString.createPointsVector(this.builder, coordinates));
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagLineString, lineStringOffset, 0);
    } else if (curvePrimitive instanceof BSplineCurve3d) {
      return this.writeBsplineCurve3dAsFBVariantGeometry(curvePrimitive);
    } else if (curvePrimitive instanceof BSplineCurve3dH) {
      return this.writeBsplineCurve3dAHsFBVariantGeometry(curvePrimitive);
    } else if (curvePrimitive instanceof InterpolationCurve3d) {
      return this.writeInterpolationCurve3dAsFBVariantGeometry(curvePrimitive);
    } else if (curvePrimitive instanceof AkimaCurve3d) {
      return this.writeAkimaCurve3dAsFBVariantGeometry(curvePrimitive);
    } else if (curvePrimitive instanceof IntegratedSpiral3d) {
      const placement = curvePrimitive.localToWorld;
      const typeCode = DgnSpiralTypeQueries.stringToTypeCode(curvePrimitive.spiralType, true)!;
      const spiralDetailOffset = BGFBAccessors.TransitionSpiralDetail.createTransitionSpiralDetail(this.builder,
        placement.matrix.coffs[0], placement.matrix.coffs[1], placement.matrix.coffs[2], placement.origin.x,
        placement.matrix.coffs[3], placement.matrix.coffs[4], placement.matrix.coffs[5], placement.origin.y,
        placement.matrix.coffs[6], placement.matrix.coffs[5], placement.matrix.coffs[8], placement.origin.z,
        curvePrimitive.activeFractionInterval.x0, curvePrimitive.activeFractionInterval.x1,
        curvePrimitive.bearing01.startRadians, curvePrimitive.bearing01.endRadians,
        TransitionSpiral3d.radiusToCurvature(curvePrimitive.radius01.x0),
        TransitionSpiral3d.radiusToCurvature(curvePrimitive.radius01.x1),
        typeCode,
        0);
      const transitionTableOffset = BGFBAccessors.TransitionSpiral.createTransitionSpiral(this.builder,
        spiralDetailOffset, 0, 0);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder,
        BGFBAccessors.VariantGeometryUnion.tagTransitionSpiral, transitionTableOffset, 0);
      } else if (curvePrimitive instanceof DirectSpiral3d) {
      const placement = curvePrimitive.localToWorld;
      // direct spirals always inflect at the origin of the local frame ..
      // spiral
      const curvature0 = 0.0;
      const curvature1 = curvePrimitive.nominalCurvature1;
      const radius0 = 0.0;
      const radius1 = curvePrimitive.nominalR1; // which is 1/curvature1
      const nominalLength = curvePrimitive.nominalL1;
      const bearing0Radians = 0.0;
      const bearing1Radians = TransitionSpiral3d.radiusRadiusLengthToSweepRadians(radius0, radius1, nominalLength);
        const typeCode = DgnSpiralTypeQueries.stringToTypeCode(curvePrimitive.spiralType, true)!;
        const spiralDetailOffset = BGFBAccessors.TransitionSpiralDetail.createTransitionSpiralDetail(this.builder,
          placement.matrix.coffs[0], placement.matrix.coffs[1], placement.matrix.coffs[2], placement.origin.x,
          placement.matrix.coffs[3], placement.matrix.coffs[4], placement.matrix.coffs[5], placement.origin.y,
          placement.matrix.coffs[6], placement.matrix.coffs[5], placement.matrix.coffs[8], placement.origin.z,
          curvePrimitive.activeFractionInterval.x0, curvePrimitive.activeFractionInterval.x1,
          bearing0Radians, bearing1Radians,
          curvature0, curvature1,
          typeCode,
          0);
        const transitionTableOffset = BGFBAccessors.TransitionSpiral.createTransitionSpiral(this.builder,
          spiralDetailOffset, 0, 0);
        return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder,
          BGFBAccessors.VariantGeometryUnion.tagTransitionSpiral, transitionTableOffset, 0);
        }
      return undefined;
  }
  public writePointString3dAsFBVariantGeometry(pointString: PointString3d): number | undefined {
    if (pointString instanceof PointString3d) {
      const coordinates = extractNumberArray(pointString.points);
      const headerOffset = BGFBAccessors.PointString.createPointString(this.builder,
        BGFBAccessors.PointString.createPointsVector(this.builder, coordinates));
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagPointString, headerOffset, 0);

    }
    return undefined;
  }

  public writeSolidPrimitiveAsFBVariantGeometry(solid: SolidPrimitive): number | undefined {
    // NOTE: Box, Sphere, Cone, and TorusPipe have "detail" within a "table"
    // BUT:  linear, rotational, and ruled sweeps have their contour and numerics directly within their table.
    if (solid instanceof Box) {
      const originA = solid.getBaseOrigin();
      const originB = solid.getTopOrigin();
      const vectorX = solid.getVectorX();
      const vectorY = solid.getVectorY();

      const baseX = solid.getBaseX();
      const baseY = solid.getBaseY();
      const topX = solid.getTopX();
      const topY = solid.getTopY();
      const detailOffset = BGFBAccessors.DgnBoxDetail.createDgnBoxDetail(this.builder,
        originA.x, originA.y, originA.z,
        originB.x, originB.y, originB.z,
        vectorX.x, vectorX.y, vectorX.z,
        vectorY.x, vectorY.y, vectorY.z,
        baseX, baseY, topX, topY, solid.capped);
      const carrierOffset = BGFBAccessors.DgnBox.createDgnBox(this.builder, detailOffset);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagDgnBox, carrierOffset, 0);
    } else if (solid instanceof Sphere) {
      const localToWorld = solid.cloneLocalToWorld();
      const sweep = solid.cloneLatitudeSweep();
      const detailOffset = BGFBAccessors.DgnSphereDetail.createDgnSphereDetail(this.builder,
        localToWorld.matrix.coffs[0], localToWorld.matrix.coffs[1], localToWorld.matrix.coffs[2], localToWorld.origin.x,
        localToWorld.matrix.coffs[3], localToWorld.matrix.coffs[4], localToWorld.matrix.coffs[5], localToWorld.origin.y,
        localToWorld.matrix.coffs[6], localToWorld.matrix.coffs[7], localToWorld.matrix.coffs[8], localToWorld.origin.z,
        sweep.startRadians, sweep.sweepRadians,
        solid.capped);
      const carrierOffset = BGFBAccessors.DgnSphere.createDgnSphere(this.builder, detailOffset);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagDgnSphere, carrierOffset, 0);
    } else if (solid instanceof Cone) {
      const centerA = solid.getCenterA();
      const centerB = solid.getCenterB();
      const vectorX = solid.getVectorX();
      const vectorY = solid.getVectorY();
      const radiusA = solid.getRadiusA();
      const radiusB = solid.getRadiusB();
      const detailOffset = BGFBAccessors.DgnConeDetail.createDgnConeDetail(this.builder,
        centerA.x, centerA.y, centerA.z,
        centerB.x, centerB.y, centerB.z,
        vectorX.x, vectorX.y, vectorX.z,
        vectorY.x, vectorY.y, vectorY.z, radiusA, radiusB, solid.capped);
      const carrierOffset = BGFBAccessors.DgnCone.createDgnCone(this.builder, detailOffset);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagDgnCone, carrierOffset, 0);
    } else if (solid instanceof TorusPipe) {
      const center = solid.cloneCenter();
      const vectorX = solid.cloneVectorX();
      const vectorY = solid.cloneVectorY();
      const minorRadius = solid.getMinorRadius();
      const majorRadius = solid.getMajorRadius();
      const sweepRadians = solid.getSweepAngle().radians;
      const detailOffset = BGFBAccessors.DgnTorusPipeDetail.createDgnTorusPipeDetail(this.builder,
        center.x, center.y, center.z,
        vectorX.x, vectorX.y, vectorX.z,
        vectorY.x, vectorY.y, vectorY.z, majorRadius, minorRadius, sweepRadians, solid.capped);
      const carrierOffset = BGFBAccessors.DgnTorusPipe.createDgnTorusPipe(this.builder, detailOffset);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagDgnTorusPipe, carrierOffset, 0);
    } else if (solid instanceof LinearSweep) {
      const baseCurveOffset = this.writeCurveCollectionAsFBCurveVector(solid.getSweepContourRef().getCurves())!;
      const sweepVector = solid.cloneSweepVector();
      // const sweepVectorOffset = BGFBAccessors.DVector3d.createDVector3d(this.builder, sweepVector.x, sweepVector.y, sweepVector.z);
      // const carrierOffset = BGFBAccessors.DgnExtrusion.createDgnExtrusion(this.builder, contourOffset, sweepVectorOffset, solid.capped);

      // WOW -- the machine generated createDgnExtrusion expects an offset for the sweepVector, but then
      //  chokes trying to add it.
      BGFBAccessors.DgnExtrusion.startDgnExtrusion(this.builder);
      BGFBAccessors.DgnExtrusion.addBaseCurve(this.builder, baseCurveOffset);
      const extrusionVectorOffset = BGFBAccessors.DVector3d.createDVector3d(this.builder, sweepVector.x, sweepVector.y, sweepVector.z);
      BGFBAccessors.DgnExtrusion.addExtrusionVector(this.builder, extrusionVectorOffset);
      BGFBAccessors.DgnExtrusion.addCapped(this.builder, solid.capped);
      const dgnExtrusionOffset = BGFBAccessors.DgnExtrusion.endDgnExtrusion(this.builder);

      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagDgnExtrusion, dgnExtrusionOffset, 0);
    } else if (solid instanceof RotationalSweep) {
      const baseCurveOffset = this.writeCurveCollectionAsFBCurveVector(solid.getSweepContourRef().getCurves())!;
      const axis = solid.cloneAxisRay();
      const sweepAngle = solid.getSweep();
      // const sweepVectorOffset = BGFBAccessors.DVector3d.createDVector3d(this.builder, sweepVector.x, sweepVector.y, sweepVector.z);
      // const carrierOffset = BGFBAccessors.DgnExtrusion.createDgnExtrusion(this.builder, contourOffset, sweepVectorOffset, solid.capped);

      // WOW -- the machine generated createDgnExtrusion expects an offset for the sweepVector, but then
      //  chokes trying to add it.
      BGFBAccessors.DgnRotationalSweep.startDgnRotationalSweep(this.builder);
      BGFBAccessors.DgnRotationalSweep.addBaseCurve(this.builder, baseCurveOffset);
      const axisRayOffset = BGFBAccessors.DRay3d.createDRay3d(this.builder,
        axis.origin.x, axis.origin.y, axis.origin.z, axis.direction.x, axis.direction.y, axis.direction.z);
      BGFBAccessors.DgnRotationalSweep.addAxis(this.builder, axisRayOffset);
      BGFBAccessors.DgnRotationalSweep.addSweepRadians(this.builder, sweepAngle.radians);
      BGFBAccessors.DgnRotationalSweep.addCapped(this.builder, solid.capped);
      const dgnRotationalSweepOffset = BGFBAccessors.DgnRotationalSweep.endDgnRotationalSweep(this.builder);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagDgnRotationalSweep, dgnRotationalSweepOffset, 0);

    } else if (solid instanceof RuledSweep) {
      const contours = solid.sweepContoursRef();
      const contourOffsets: flatbuffers.Offset[] = [];
      for (const contour of contours) {
        const contourOffset = this.writeCurveCollectionAsFBCurveVector(contour.getCurves());
        if (contourOffset !== undefined)
          contourOffsets.push(contourOffset);
      }
      const contoursVectorOffset = BGFBAccessors.DgnRuledSweep.createCurvesVector(this.builder, contourOffsets);
      const ruledSweepTable = BGFBAccessors.DgnRuledSweep.createDgnRuledSweep(this.builder, contoursVectorOffset, solid.capped);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagDgnRuledSweep, ruledSweepTable, 0);
    }
    return undefined;
  }
  public writePolyfaceAuxChannelDataAsFBVariantGeometry(channelData: AuxChannelData): number | undefined {
    if (channelData instanceof AuxChannelData) {
      const valuesOffset = BGFBAccessors.PolyfaceAuxChannelData.createValuesVector(this.builder, channelData.values);
      return BGFBAccessors.PolyfaceAuxChannelData.createPolyfaceAuxChannelData(this.builder,
        channelData.input,
        valuesOffset
      );
    }
    return undefined;
  }

  public writePolyfaceAuxChannelAsFBVariantGeometry(channel: AuxChannel): number | undefined {
    if (channel instanceof AuxChannel) {
      const channelDataOffsets: number[] = [];
      for (const channelData of channel.data) {
        channelDataOffsets.push(this.writePolyfaceAuxChannelDataAsFBVariantGeometry(channelData)!);
      }
      const valuesOffset = BGFBAccessors.PolyfaceAuxChannel.createDataVector(this.builder, channelDataOffsets);
      const nameOffset = channel.name ? this.builder.createString(channel.name) : 0;
      const inputNameOffset = channel.inputName ? this.builder.createString(channel.inputName) : 0;
      return BGFBAccessors.PolyfaceAuxChannel.createPolyfaceAuxChannel(this.builder,
        channel.dataType,
        nameOffset,
        inputNameOffset, valuesOffset
      );
    }
    return undefined;
  }

  public writePolyfaceAuxDataAsFBVariantGeometry(data: PolyfaceAuxData): number | undefined {
    if (data instanceof PolyfaceAuxData) {
      const channelOffsets: number[] = [];
      for (const channel of data.channels) {
        channelOffsets.push(this.writePolyfaceAuxChannelAsFBVariantGeometry(channel)!);
      }
      const channelOffsetsOffset = BGFBAccessors.PolyfaceAuxChannel.createDataVector(this.builder, channelOffsets);
      const indicesOffset = BGFBAccessors.PolyfaceAuxData.createIndicesVector(this.builder, data.indices);
      return BGFBAccessors.PolyfaceAuxData.createPolyfaceAuxData(this.builder,
        indicesOffset,
        channelOffsetsOffset
      );
    }
    return undefined;
  }
  public writeTaggedNumericDataArray(data: TaggedNumericData | undefined): number {
    if (data){
        const intDataOffset = this.writeIntArray(data.intData);
        const doubleDataOffset = this.writeDoubleArray(data.doubleData);
        return BGFBAccessors.TaggedNumericData.createTaggedNumericData(this.builder,
          data.tagA, data.tagB, intDataOffset, doubleDataOffset);
    }
    return 0;
  }

  public writePolyfaceAsFBVariantGeometry(mesh: IndexedPolyface): number | undefined {
    if (mesh instanceof IndexedPolyface) {
      // WE KNOW . . . . the polyface has blocks of zero-based indices.
      const indexArray: number[] = [];  // and this will really be integers.
      const numberArray: number[] = []; // and this will really be doubles.

      copyToPackedNumberArray(numberArray, mesh.data.point.float64Data(), mesh.data.point.float64Length);
      const pointOffset = BGFBAccessors.Polyface.createPointVector(this.builder, numberArray);
      let paramIndexOffset = 0;
      let normalIndexOffset = 0;
      let colorIndexOffset = 0;
      let intColorOffset = 0;
      let normalOffset = 0;
      let paramOffset = 0;
      let auxDataOffset = 0;
      let taggedNumericDataOffset = 0;
      const meshStyle = 1;  // That is  . . . MESH_ELM_STYLE_INDEXED_FACE_LOOPS (and specifically, variable size with with 0 terminators)
      const numPerFace = 0;
      this.fillOneBasedIndexArray(mesh, mesh.data.pointIndex, mesh.data.edgeVisible, 0, indexArray);

      const twoSided = mesh.twoSided;
      const pointIndexOffset = BGFBAccessors.Polyface.createPointIndexVector(this.builder, indexArray);
      if (mesh.data.paramIndex !== undefined && mesh.data.paramIndex.length > 0) {
        this.fillOneBasedIndexArray(mesh, mesh.data.paramIndex, undefined, 0, indexArray);
        paramIndexOffset = BGFBAccessors.Polyface.createParamIndexVector(this.builder, indexArray);
      }

      if (mesh.data.normalIndex !== undefined && mesh.data.normalIndex.length > 0) {
        this.fillOneBasedIndexArray(mesh, mesh.data.normalIndex, undefined, 0, indexArray);
        normalIndexOffset = BGFBAccessors.Polyface.createNormalIndexVector(this.builder, indexArray);
      }

      if (mesh.data.colorIndex !== undefined && mesh.data.colorIndex.length > 0) {
        this.fillOneBasedIndexArray(mesh, mesh.data.colorIndex, undefined, 0, indexArray);
        colorIndexOffset = BGFBAccessors.Polyface.createColorIndexVector(this.builder, indexArray);
      }

      if (mesh.data.color !== undefined && mesh.data.color.length > 0) {
        intColorOffset = BGFBAccessors.Polyface.createIntColorVector(this.builder, mesh.data.color);
      }

      /*
            if (mesh.data.face !== undefined && mesh.data.face.length > 0) {
              this.writeOneBasedIndexArray(mesh, mesh.data.face, undefined, 0, indexArray);
              BGFBAccessors.Polyface.createFaceDataVector(this.builder, indexArray);
            }
        */
      if (mesh.data.normal) {
        copyToPackedNumberArray(numberArray, mesh.data.normal.float64Data(), mesh.data.normal.float64Length);
        normalOffset = BGFBAccessors.Polyface.createNormalVector(this.builder, numberArray);
      }

      if (mesh.data.param) {
        copyToPackedNumberArray(numberArray, mesh.data.param.float64Data(), mesh.data.param.float64Length);
        paramOffset = BGFBAccessors.Polyface.createPointVector(this.builder, numberArray);
      }

      if (mesh.data.auxData) {
        auxDataOffset = this.writePolyfaceAuxDataAsFBVariantGeometry(mesh.data.auxData)!;
      }

      if (mesh.data.taggedNumericData)
        taggedNumericDataOffset = this.writeTaggedNumericDataArray(mesh.data.taggedNumericData);
      const expectedClosure = mesh.expectedClosure;
      const polyfaceOffset = BGFBAccessors.Polyface.createPolyface(this.builder, pointOffset, paramOffset, normalOffset, 0, intColorOffset,
        pointIndexOffset, paramIndexOffset, normalIndexOffset, colorIndexOffset, 0,
        0, 0, meshStyle, twoSided,
        numPerFace, 0, auxDataOffset, expectedClosure, taggedNumericDataOffset);
      return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagPolyface, polyfaceOffset, 0);

    }
    return undefined;
  }

  public fillOneBasedIndexArray(mesh: IndexedPolyface, sourceIndex: number[], visible: boolean[] | undefined, facetTerminator: number | undefined, destIndex: number[]) {
    destIndex.length = 0;
    const numFacet = mesh.facetCount;
    for (let facetIndex = 0; facetIndex < numFacet; facetIndex++) {
      const k0 = mesh.facetIndex0(facetIndex);
      const k1 = mesh.facetIndex1(facetIndex);
      for (let k = k0; k < k1; k++) {
        let q = sourceIndex[k] + 1;
        if (visible !== undefined && !visible[k])
          q = -q;
        destIndex.push(q);
      }
      if (facetTerminator !== undefined)
        destIndex.push(facetTerminator);
    }
  }
  public writeGeometryQueryAsFBVariantGeometry(g: GeometryQuery): number | undefined {
    let offset: number | undefined;
    if (g instanceof CurvePrimitive && (offset = this.writeCurvePrimitiveAsFBVariantGeometry(g)) !== undefined)
      return offset;
    if (g instanceof CurveCollection && (offset = this.writeCurveCollectionAsFBVariantGeometry(g)) !== undefined)
      return offset;
    if (g instanceof IndexedPolyface && (offset = this.writePolyfaceAsFBVariantGeometry(g)) !== undefined)
      return offset;
    if (g instanceof SolidPrimitive && (offset = this.writeSolidPrimitiveAsFBVariantGeometry(g)) !== undefined)
      return offset;
    if (g instanceof BSplineSurface3d && (offset = this.writeBSplineSurfaceAsFBVariantGeometry(g)) !== undefined)
      return offset;
    if (g instanceof BSplineSurface3dH && (offset = this.writeBSplineSurfaceAsFBVariantGeometry(g)) !== undefined)
      return offset;
    if (g instanceof PointString3d && (offset = this.writePointString3dAsFBVariantGeometry(g)) !== undefined)
      return offset;
    return undefined;
  }

  public writeGeometryQueryArrayAsFBVariantGeometry(allGeometry: GeometryQuery | GeometryQuery[] | undefined): number | undefined{
    if (Array.isArray(allGeometry)) {
      const allOffsets: number[] = [];
      for (const g of allGeometry) {
        const offset = this.writeGeometryQueryAsFBVariantGeometry(g);
        if (offset !== undefined)
          allOffsets.push(offset);
      }
      if (allOffsets.length > 0) {
        const membersOffset = BGFBAccessors.VectorOfVariantGeometry.createMembersVector(this.builder, allOffsets);
        const vectorOffset = BGFBAccessors.VectorOfVariantGeometry.createVectorOfVariantGeometry(this.builder, membersOffset);
        return BGFBAccessors.VariantGeometry.createVariantGeometry(this.builder, BGFBAccessors.VariantGeometryUnion.tagVectorOfVariantGeometry, vectorOffset, 0);
      }
    } else if (allGeometry instanceof GeometryQuery)
      return this.writeGeometryQueryAsFBVariantGeometry(allGeometry);
    return undefined;
  }
  /**
   * Serialize bytes to a flatbuffer.
   */
  public static geometryToBytes(data: GeometryQuery | GeometryQuery[], signatureBytes?: Uint8Array): Uint8Array | undefined {
    const writer = new BGFBWriter();
    const rootOffset = writer.writeGeometryQueryArrayAsFBVariantGeometry(data);

    if (rootOffset !== undefined) {
      const builder = writer.builder;
      builder.finish(rootOffset);
      const buffer = builder.dataBuffer();
      if (!signatureBytes) {
        return buffer.bytes().slice(buffer.position());
      } else if (buffer.position() >= signatureBytes.length) {
        // The buffer has space for the signature ahead of its position . . .
        const i0 = buffer.position() - signatureBytes.length;
        let i = i0;
        for (const k of signatureBytes)
          buffer.bytes()[i++] = k;
        return buffer.bytes().slice(i0);
      } else {
        // There is no space ahead of the position () . . .
        // coverage remark: I have never seen this happen for real.
        //  It has been exercised by adding 1024 to the signatureBytes.length test to force this branch.
        const num1 = buffer.bytes().length - buffer.position();
        const num0 = signatureBytes.length;
        const newBytes = new Uint8Array(num0 + num1);
        newBytes.set(signatureBytes, 0);
        newBytes.set(buffer.bytes().slice(buffer.position()), num0);
        return newBytes;
      }
    }
    return undefined;
  }
}
function extractNumberArray(data: GrowableXYZArray | Point3d[]): number[] {
  const result = [];
  if (data instanceof GrowableXYZArray) {
    // ugh -- accessors only deal with number[] ..
    const numCoordinate = 3 * data.length;
    const source = data.float64Data();
    for (let i = 0; i < numCoordinate; i++)
      result.push(source[i]);
    return result;
  } else if (Array.isArray(data)) {
    for (const xyz of data)
      result.push(xyz.x, xyz.y, xyz.z);
  }
  return result;
}
/** Copy the active data to a simple number array. */
function copyToPackedNumberArray(dest: number[], source: Float64Array, count: number) {
  dest.length = 0;
  for (let i = 0; i < count; i++)
    dest.push(source[i]);
}

