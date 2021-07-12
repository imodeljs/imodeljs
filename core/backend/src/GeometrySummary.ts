/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Id64Array, Id64String, IModelStatus } from "@bentley/bentleyjs-core";
import {
  AkimaCurve3d, AnyGeometryQuery, Arc3d, BezierCurveBase, Box, BSplineCurve3d, Cone, CurveChainWithDistanceIndex, CurveCollection, CurvePrimitive, IModelJson,
  InterpolationCurve3d,
  LinearSweep, LineSegment3d, LineString3d, Loop, Path, Range3d, RotationalSweep, RuledSweep, SolidPrimitive, Sphere, TorusPipe, Transform,
  TransitionSpiral3d, UVSelect,
} from "@bentley/geometry-core";
import {
  BRepEntity, GeometricElement3dProps, GeometryParams, GeometryStreamIterator, GeometrySummaryRequestProps, GeometrySummaryVerbosity, ImagePrimitive,
  IModelError, TextStringPrimitive,
} from "@bentley/imodeljs-common";
import { Element, GeometricElement, GeometryPart } from "./Element";
import { IModelDb } from "./IModelDb";

interface ElementGeom {
  iterator: GeometryStreamIterator;
  geometricElement?: GeometricElement;
}

// cspell:ignore earlin

/** Generates an array of GeometryStreamResponseProps. */
class ResponseGenerator {
  public verbosity = GeometrySummaryVerbosity.Basic;
  public includePlacement = false;
  public includePartReferences?: "2d" | "3d";
  public verboseSymbology = false;
  public elementIds: Id64Array;
  public iModel: IModelDb;

  public get wantSquish() { return GeometrySummaryVerbosity.Full !== this.verbosity; }

  public constructor(request: GeometrySummaryRequestProps, iModel: IModelDb) {
    this.elementIds = request.elementIds;
    this.iModel = iModel;
    const opts = request.options;
    if (undefined !== opts) {
      this.verbosity = undefined !== opts.geometryVerbosity ? opts.geometryVerbosity : GeometrySummaryVerbosity.Basic;
      this.includePlacement = true === opts.includePlacement;
      this.includePartReferences = opts.includePartReferences;
      this.verboseSymbology = true === opts.verboseSymbology;
    }
  }

  public generateSummaries(): string {
    const summaries: string[] = [];
    for (const elementId of this.elementIds)
      summaries.push(this.generateSummary(elementId));

    return summaries.join("\n");
  }

  public generateSummary(id: Id64String): string {
    let lines = [`[Geometry Summary for Element ${id}]`];
    try {
      const geom = this.getElementGeom(id);
      if (undefined === geom)
        throw new IModelError(IModelStatus.NoGeometry, "Element is neither a geometric element nor a geometry part");

      if (undefined !== geom.geometricElement)
        lines.push(this.summarizeElement(geom.geometricElement));
      else if (undefined !== this.includePartReferences)
        lines.push(this.summarizePartReferences(id, "2d" === this.includePartReferences)); // NB: Hideously inefficient if more than one element's summary was requested.

      let curGeomParams: GeometryParams | undefined;
      let curLocalRange: Range3d | undefined;
      for (const entry of geom.iterator) {
        if (this.verboseSymbology && (undefined === curGeomParams || !curGeomParams.isEquivalent(entry.geomParams))) {
          lines.push(`Symbology: ${this.stringify(entry.geomParams)}`);
          curGeomParams = entry.geomParams.clone();
        }

        if (undefined !== entry.localRange && (undefined === curLocalRange || !curLocalRange.isAlmostEqual(entry.localRange))) {
          lines.push(this.summarizeRange3d(entry.localRange));
          curLocalRange = entry.localRange;
        }

        const prim = entry.primitive;
        switch (prim.type) {
          case "textString":
          case "image":
            this.summarizePrimitive(lines, prim);
            break;
          case "brep":
            this.summarizeBRep(lines, prim.brep);
            break;
          case "geometryQuery":
            this.summarizeGeometryQuery(lines, prim.geometry);
            break;
          case "partReference":
            lines.push(this.summarizePartReference(prim.part.id, prim.part.toLocal));
            break;
        }
      }
    } catch (err) {
      lines = lines.slice(0, 1);

      let message = err.message;
      if (undefined === message)
        message = err.toString();

      lines.push(`ERROR: ${message}`);
    }

    return lines.filter((line) => line !== "").join("\n");
  }

  public summarizeElement(elem: GeometricElement): string {
    const lines: string[] = [];
    lines.push(`(${elem.is2d() ? "2D" : "3D"}) Category: ${elem.category}`);
    lines.push(`Model: ${elem.model}`);
    if (this.includePlacement) {
      lines.push(`Range: ${this.stringify(elem.calculateRange3d())}`);
      lines.push(`Transform: ${this.stringify(elem.getPlacementTransform())}`);
    }

    return lines.join("\n");
  }

  public summarizePartReferences(id: Id64String, is2d: boolean): string {
    const refIds = this.iModel.nativeDb.findGeometryPartReferences([id], is2d);
    return `Part references (${refIds.length}): ${refIds.join()}`;
  }

  public getElementGeom(id: Id64String): ElementGeom | undefined {
    const elem = this.iModel.elements.getElement<Element>({ id, wantGeometry: true });
    let iterator: GeometryStreamIterator | undefined;
    let geometricElement: GeometricElement | undefined;
    if (elem instanceof GeometricElement) {
      geometricElement = elem;
      if (geometricElement.is2d())
        iterator = GeometryStreamIterator.fromGeometricElement2d(geometricElement);
      else
        iterator = GeometryStreamIterator.fromGeometricElement3d(geometricElement as GeometricElement3dProps);
    } else if (elem instanceof GeometryPart) {
      iterator = GeometryStreamIterator.fromGeometryPart(elem);
    }

    return undefined !== iterator ? { iterator, geometricElement } : undefined;
  }

  public summarizeRange3d(range: Range3d): string {
    return `SubGraphicRange: ${this.stringify(range)}`;
  }

  public summarizePrimitive(lines: string[], primitive: TextStringPrimitive | ImagePrimitive): void {
    const summary = primitive.type;
    if (GeometrySummaryVerbosity.Basic >= this.verbosity) {
      lines.push(summary);
      return;
    }

    const json = this.stringify(primitive.type === "textString" ? primitive.textString : primitive.image);
    if (GeometrySummaryVerbosity.Detailed >= this.verbosity) {
      lines.push(`${summary}: ${json}`);
      return;
    }

    lines.push(`${summary}:`);
    lines.push(json);
  }

  public summarizeBRep(lines: string[], brep: BRepEntity.DataProps): void {
    const summary = "brep";
    if (GeometrySummaryVerbosity.Basic >= this.verbosity) {
      lines.push(summary);
      return;
    }

    const json = this.stringify({ type: brep.type, transform: brep.transform, faceSymbology: brep.faceSymbology });
    if (GeometrySummaryVerbosity.Detailed >= this.verbosity) {
      lines.push(`${summary}: ${json}`);
      return;
    }

    lines.push(`${summary}:`);
    lines.push(json);
  }

  public summarizePartReference(partId: string, partToLocal?: Transform): string {
    let line = `part id: ${partId}`;
    if (undefined !== partToLocal)
      line = `${line} transform: ${this.stringify(partToLocal)}`;

    return line;
  }

  public summarizeGeometryQuery(lines: string[], query: AnyGeometryQuery): void {
    switch (this.verbosity) {
      case GeometrySummaryVerbosity.Detailed:
        lines.push(this.summarizeGeometryQueryDetailed(query));
        break;
      case GeometrySummaryVerbosity.Full:
        lines.push(this.summarizeGeometryQueryFull(query));
        break;
      default:
        lines.push(this.summarizeGeometryQueryBasic(query));
        break;
    }
  }

  public summarizeGeometryQueryBasic(query: AnyGeometryQuery): string {
    switch (query.geometryCategory) {
      case "solid":
        return query.solidPrimitiveType;
      case "curvePrimitive":
        return query.curvePrimitiveType;
      case "curveCollection":
        return query.curveCollectionType;
      default:
        return query.geometryCategory;
    }
  }

  public summarizeGeometryQueryFull(query: AnyGeometryQuery): string {
    return this.geometryQueryToJson(query);
  }

  public geometryQueryToJson(query: AnyGeometryQuery): string {
    try {
      const json = IModelJson.Writer.toIModelJson(query);
      const str = JSON.stringify(json);
      return this.wantSquish ? this.squish(str) : str;
    } catch (err) {
      return err.toString();
    }
  }

  // Earlin likes to put tons of whitespace + newlines into his JSON. Remove it.
  public squish(str: string): string {
    return str.replace(/\s+/g, "");
  }

  public stringify(obj: object): string {
    const json = JSON.stringify(obj);
    return this.wantSquish ? this.squish(json) : json;
  }

  public summarizeGeometryQueryDetailed(query: AnyGeometryQuery): string {
    let summary = `${this.summarizeGeometryQueryBasic(query)}: `;
    switch (query.geometryCategory) {
      case "solid":
        return summary + this.summarizeSolidPrimitive(query);
      case "curvePrimitive":
        return summary + this.summarizeCurvePrimitive(query);
      case "curveCollection":
        return summary + this.summarizeCurveCollection(query);
      case "pointCollection":
        return `${summary} numPoints: ${query.points.length}`;
      case "bsurf":
        return `${summary}'
        ' poleDimension: ${query.poleDimension}'
        ' numPolesTotal: ${query.numPolesTotal()}'
        ' degree[U,V]: ${JSON.stringify([query.degreeUV(UVSelect.uDirection), query.degreeUV(UVSelect.VDirection)])}'
        ' order[U,V]: ${JSON.stringify([query.orderUV(UVSelect.uDirection), query.orderUV(UVSelect.VDirection)])}'
        ' numSpan[U,V]: ${JSON.stringify([query.numSpanUV(UVSelect.uDirection), query.numSpanUV(UVSelect.VDirection)])}'
        ' numPoles[U,V]: ${JSON.stringify([query.numPolesUV(UVSelect.uDirection), query.numPolesUV(UVSelect.VDirection)])}'
        ' poleStep[U,V]: ${JSON.stringify([query.poleStepUV(UVSelect.uDirection), query.poleStepUV(UVSelect.VDirection)])}`;
      case "polyface": {
        const data = query.data;
        summary = `${summary} pointCount: ${data.point.length}'
        ' pointIndexCount: ${data.pointIndex.length}`;
        if (query.twoSided)
          summary = `${summary} (two-sided)`;
        if (undefined !== data.normal)
          summary = `${summary} normalCount: ${data.normal.length}`;
        if (undefined !== data.param)
          summary = `${summary} paramCount: ${data.param.length}`;
        if (undefined !== data.color)
          summary = `${summary} colorCount: ${data.color.length}`;

        return summary;
      }
      case "point":
        return summary + this.geometryQueryToJson(query);
    }
  }

  public summarizeSolidPrimitive(solid: SolidPrimitive): string {
    const summary: string = solid.capped ? " capped" : " uncapped";
    switch (solid.solidPrimitiveType) {
      case "box":
        const box: Box = (solid as Box);
        return `${summary}'
        ' baseOrigin: ${JSON.stringify(box.getBaseOrigin().toJSON())}'
        ' topOrigin: ${JSON.stringify(box.getTopOrigin().toJSON())}'
        ' baseX: ${box.getBaseX()}'
        ' baseY: ${box.getBaseY()}`;
      case "cone":
        const cone: Cone = solid as Cone;
        return `${summary}'
        ' baseCenterPoint: ${JSON.stringify(cone.getCenterA())}'
        ' topCenterPoint: ${JSON.stringify(cone.getCenterB())}'
        ' baseCenterRadius: ${JSON.stringify(cone.getRadiusA())}'
        ' topCenterRadius: ${JSON.stringify(cone.getRadiusB())}`;
      case "sphere":
        const sphere: Sphere = solid as Sphere;
        return `${summary}'
        ' centerPoint: ${JSON.stringify(sphere.cloneCenter().toJSON())}'
        ' radius: ${JSON.stringify(sphere.trueSphereRadius())}`;
      case "linearSweep":
        const linearSweep: LinearSweep = solid as LinearSweep;
        return `${summary}'
        ' vector: ${linearSweep.cloneSweepVector().toJSON()}'
        ' curves${this.summarizeCurveCollection(linearSweep.getCurvesRef())}`;
      case "rotationalSweep":
        const rotationalSweep: RotationalSweep = solid as RotationalSweep;
        const axis = rotationalSweep.cloneAxisRay();
        return `${summary}'
        ' center: ${axis.origin.toJSON()}'
        ' axis: ${JSON.stringify(axis.direction.toJSON())}'
        ' sweepAngle: ${rotationalSweep.getSweep().degrees}`;
      case "ruledSweep":
        const ruledSweep: RuledSweep = solid as RuledSweep;
        const summarizedCollection = ruledSweep.cloneContours().map((curveCollection) => this.summarizeCurveCollection(curveCollection));
        return `${summary}'
        ' isClosedVolume${ruledSweep.isClosedVolume}'
        ' contours: ${JSON.stringify(summarizedCollection)}`;
      case "torusPipe":
        const torusPipe: TorusPipe = solid as TorusPipe;
        const vectorX = torusPipe.cloneVectorX();
        const vectorY = torusPipe.cloneVectorY();
        const sweep = torusPipe.getSweepAngle();
        if (torusPipe.getIsReversed()) {
          vectorY.scaleInPlace(-1.0);
          sweep.setRadians(-sweep.radians);
        }
        return `${summary}'
        ' center: ${torusPipe.cloneCenter().toJSON()}'
        ' xyVectors: ${JSON.stringify([vectorX.toJSON(), vectorY.toJSON()])}'
        ' majorRadius: ${torusPipe.getMajorRadius()}'
        ' minorRadius: ${torusPipe.getMinorRadius()}'
        ' sweepAngle: ${sweep.degrees}`;
    }
  }

  public summarizeCurvePrimitive(curve: CurvePrimitive): string {
    let summary: string = "";
    const writer = new IModelJson.Writer();
    switch (curve.curvePrimitiveType) {
      case "arc":
        const arc: Arc3d = curve as Arc3d;
        summary = `${summary} center: ${JSON.stringify(arc.center.toJSON())}`;
        if (undefined !== arc.circularRadius)
          summary = `${summary} radius: ${arc.circularRadius()}`;
        summary = `${summary}'
        ' vectorX:${arc.vector0.toJSON()}'
        ' vectorY:${arc.vector90.toJSON()}'
        ' sweepStartEnd [${arc.sweep.startDegrees}, ${arc.sweep.endDegrees}]`
          + ` curveLength: ${curve.curveLength()}`;
        return summary;
      case "lineSegment":
        const lineSegment: LineSegment3d = curve as LineSegment3d;
        summary = `${summary} points: ${JSON.stringify(lineSegment.toJSON())}`;
        summary = `${summary} curveLength: ${curve.curveLength()}`;
        return summary;
      case "lineString":
        const lineString: LineString3d = curve as LineString3d;
        summary = `${summary} pointCount: ${lineString.numPoints()}'
        ' curveLength: ${curve.curveLength()}`;
        return summary;
      case "bsplineCurve":
        const bsplineCurve: BSplineCurve3d = curve as BSplineCurve3d;
        summary = `${summary}'
        ' curveOrder: ${bsplineCurve.order}'
        ' controlPointsCount: ${bsplineCurve.numPoles}'
        ' curveLength: ${curve.curveLength()}`;
        return summary;
      case "interpolationCurve":
        const interpolationCurve: InterpolationCurve3d = curve as InterpolationCurve3d;
        const interpolationProps = interpolationCurve.cloneProps();
        summary = `${summary}'
        ' curveOrder: ${interpolationProps.order}'
        ' controlPointsCount: ${interpolationProps.fitPoints.length}`;
        return summary;
      case "akimaCurve":
        const akimaCurve: AkimaCurve3d = curve as AkimaCurve3d;
        const akimaProps = akimaCurve.cloneProps();
        summary = `${summary}'
          ' controlPointsCount: ${akimaProps.fitPoints.length}`;
        return summary;
      case "bezierCurve":
        const bezierCurve: BezierCurveBase = curve as BezierCurveBase;
        summary = `${summary}'
        ' curveOrder: ${bezierCurve.order}'
        ' controlPointsCount: ${bezierCurve.numPoles}'
        ' curveLength: ${curve.curveLength()}`;
        return summary;
      case "transitionSpiral":
        const transitionSpiral: TransitionSpiral3d = curve as TransitionSpiral3d;
        const json = writer.handleTransitionSpiral(transitionSpiral);
        summary = summary + JSON.stringify(json);
        return summary;
      case "curveChainWithDistanceIndex":
        const curveChainWithDistanceIndex: CurveChainWithDistanceIndex = curve as CurveChainWithDistanceIndex;
        const path = curveChainWithDistanceIndex.path;
        summary = `${summary}'
        ' curveLength: ${curve.curveLength()}'
        ' isOpen: ${path.isOpenPath}`;
        return summary;
    }
  }

  public summarizeCurveCollection(curves: CurveCollection): string {
    let summary: string = "";
    switch (curves.curveCollectionType) {
      case "loop":
        const loop: Loop = curves as Loop;
        summary = `${summary} isInner: ${loop.isInner}`;
        break;
      case "path":
        const path: Path = curves as Path;
        summary = `${summary} isOpen: ${path.isOpenPath}`;
        break;
    }

    return `${summary}'
    ' numCurves: ${curves.collectCurvePrimitives().length}'
    ' boundary: ${curves.dgnBoundaryType()}`;
  }
}

/** @internal */
export function generateGeometrySummaries(request: GeometrySummaryRequestProps, iModel: IModelDb): string {
  const generator = new ResponseGenerator(request, iModel);
  return generator.generateSummaries();
}
