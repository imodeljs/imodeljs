/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert } from "@bentley/bentleyjs-core";
import {
  CurveChain, IndexedPolyface, Loop, Path, Point3d, PolyfaceBuilder, PolyfaceQuery, Range3d, SolidPrimitive, StrokeOptions, SweepContour, Transform,
} from "@bentley/geometry-core";
import { DisplayParams } from "../DisplayParams";
import { PolyfacePrimitive, PolyfacePrimitiveList } from "../Polyface";
import { StrokesPrimitive, StrokesPrimitiveList, StrokesPrimitivePointList, StrokesPrimitivePointLists } from "../Strokes";

/** @internal */
export type PrimitiveGeometryType = Loop | Path | IndexedPolyface | SolidPrimitive;

/** @internal */
export abstract class Geometry {
  public readonly transform: Transform;
  public readonly tileRange: Range3d;
  public readonly displayParams: DisplayParams;

  public constructor(transform: Transform, tileRange: Range3d, displayParams: DisplayParams) {
    this.transform = transform;
    this.tileRange = tileRange;
    this.displayParams = displayParams;
  }

  public static createFromPointString(pts: Point3d[], tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry {
    return new PrimitivePointStringGeometry(pts, tf, tileRange, params);
  }

  public static createFromLineString(pts: Point3d[], tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry {
    return new PrimitiveLineStringGeometry(pts, tf, tileRange, params);
  }

  public static createFromLoop(loop: Loop, tf: Transform, tileRange: Range3d, params: DisplayParams, disjoint: boolean): Geometry {
    return new PrimitiveLoopGeometry(loop, tf, tileRange, params, disjoint);
  }

  public static createFromSolidPrimitive(primitive: SolidPrimitive, tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry {
    return new SolidPrimitiveGeometry(primitive, tf, tileRange, params);
  }

  public static createFromPath(path: Path, tf: Transform, tileRange: Range3d, params: DisplayParams, disjoint: boolean): Geometry {
    return new PrimitivePathGeometry(path, tf, tileRange, params, disjoint);
  }

  public static createFromPolyface(ipf: IndexedPolyface, tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry {
    return new PrimitivePolyfaceGeometry(ipf, tf, tileRange, params);
  }

  protected abstract _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined;
  protected abstract _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;

  public getPolyfaces(tolerance: number): PolyfacePrimitiveList | undefined {
    const facetOptions = StrokeOptions.createForFacets();
    facetOptions.chordTol = tolerance;
    if (this.displayParams.isTextured)
      facetOptions.needParams = true;

    if (!this.displayParams.ignoreLighting) // ###TODO don't generate normals for 2d views.
      facetOptions.needNormals = true;

    return this._getPolyfaces(facetOptions);
  }

  public getStrokes(tolerance: number): StrokesPrimitiveList | undefined {
    const strokeOptions = StrokeOptions.createForCurves();
    strokeOptions.chordTol = tolerance;
    return this._getStrokes(strokeOptions);
  }

  public get hasTexture() { return this.displayParams.isTextured; }
  public doDecimate() { return false; }
  public doVertexCluster() { return true; }
  public part() { return undefined; }
}

/** @internal */
export class PrimitivePathGeometry extends Geometry {
  public readonly path: Path;
  public readonly isDisjoint: boolean;

  public constructor(path: Path, tf: Transform, range: Range3d, params: DisplayParams, isDisjoint: boolean) {
    super(tf, range, params);
    this.path = path;
    this.isDisjoint = isDisjoint;
  }

  protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined { return undefined; }

  protected _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
    return PrimitivePathGeometry.getStrokesForLoopOrPath(this.path, facetOptions, this.displayParams, this.isDisjoint, this.transform);
  }

  public static getStrokesForLoopOrPath(loopOrPath: Loop | Path, facetOptions: StrokeOptions, params: DisplayParams, isDisjoint: boolean, transform: Transform): StrokesPrimitiveList | undefined {
    const strksList = new StrokesPrimitiveList();

    if (!loopOrPath.isAnyRegionType || params.wantRegionOutline) {
      const strksPts: StrokesPrimitivePointLists = new StrokesPrimitivePointLists();
      PrimitivePathGeometry.collectCurveStrokes(strksPts, loopOrPath, facetOptions, transform);

      if (strksPts.length > 0) {
        const isPlanar = loopOrPath.isAnyRegionType;
        assert(isPlanar === params.wantRegionOutline);
        const strksPrim: StrokesPrimitive = StrokesPrimitive.create(params, isDisjoint, isPlanar);
        strksPrim.strokes = strksPts;
        strksList.push(strksPrim);
      }
    }

    return strksList;
  }

  private static collectCurveStrokes(strksPts: StrokesPrimitivePointLists, loopOrPath: CurveChain, facetOptions: StrokeOptions, trans: Transform) {
    const strokes = loopOrPath.getPackedStrokes(facetOptions);
    if (undefined !== strokes) {
      const pts = strokes.getPoint3dArray();
      trans.multiplyPoint3dArrayInPlace(pts);
      strksPts.push(new StrokesPrimitivePointList(pts));
    }
  }
}

/** @internal */
export class PrimitivePointStringGeometry extends Geometry {
  public readonly pts: Point3d[];

  public constructor(pts: Point3d[], tf: Transform, range: Range3d, params: DisplayParams) {
    super(tf, range, params);
    this.pts = pts;
  }

  protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
    return undefined;
  }

  protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
    const strksList = new StrokesPrimitiveList();
    const strksPts = new StrokesPrimitivePointLists(new StrokesPrimitivePointList(this.pts));

    const strksPrim: StrokesPrimitive = StrokesPrimitive.create(this.displayParams, true, false);
    strksPrim.strokes = strksPts;
    strksPrim.transform(this.transform);
    strksList.push(strksPrim);

    return strksList;
  }
}

/** @internal */
export class PrimitiveLineStringGeometry extends Geometry {
  public readonly pts: Point3d[];

  public constructor(pts: Point3d[], tf: Transform, range: Range3d, params: DisplayParams) {
    super(tf, range, params);
    this.pts = pts;
  }

  protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
    return undefined;
  }

  protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
    const strksList = new StrokesPrimitiveList();
    const strksPts = new StrokesPrimitivePointLists(new StrokesPrimitivePointList(this.pts));

    const strksPrim: StrokesPrimitive = StrokesPrimitive.create(this.displayParams, false, false);
    strksPrim.strokes = strksPts;
    strksPrim.transform(this.transform);
    strksList.push(strksPrim);

    return strksList;
  }
}

/** @internal */
export class PrimitiveLoopGeometry extends Geometry {
  public readonly loop: Loop;
  public readonly isDisjoint: boolean;

  public constructor(loop: Loop, tf: Transform, range: Range3d, params: DisplayParams, isDisjoint: boolean) {
    super(tf, range, params);
    this.loop = loop;
    this.isDisjoint = isDisjoint;
  }

  protected _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
    if (!this.loop.isAnyRegionType) {
      return undefined;
    }

    // The following is good for single loop things according to Earlin.
    const contour = SweepContour.createForLinearSweep(this.loop);
    if (contour !== undefined) {
      const pfBuilder: PolyfaceBuilder = PolyfaceBuilder.create(facetOptions);
      contour.emitFacets(pfBuilder, false, this.transform); // build facets and emit them to the builder
      const polyface = pfBuilder.claimPolyface();
      const wantEdges = DisplayParams.RegionEdgeType.Default === this.displayParams.regionEdgeType;
      const isPlanar = true;
      return new PolyfacePrimitiveList(PolyfacePrimitive.create(this.displayParams, polyface, wantEdges, isPlanar));
    } // ###TODO: this approach might not work with holes

    return undefined;
  }

  protected _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
    return PrimitivePathGeometry.getStrokesForLoopOrPath(this.loop, facetOptions, this.displayParams, this.isDisjoint, this.transform);
  }
}

/** @internal */
export class PrimitivePolyfaceGeometry extends Geometry {
  public readonly polyface: IndexedPolyface;

  public constructor(polyface: IndexedPolyface, tf: Transform, range: Range3d, params: DisplayParams) {
    super(tf, range, params);
    this.polyface = polyface;
  }

  protected _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
    if (!this.hasTexture) {
      if (this.polyface.data.param)
        this.polyface.data.param.clear();

      if (this.polyface.data.paramIndex)
        this.polyface.data.paramIndex = [];
    }

    if (!facetOptions.needNormals) {
      if (this.polyface.data.normal)
        this.polyface.data.normal.clear();

      if (this.polyface.data.normalIndex)
        this.polyface.data.normalIndex = [];
    } else if (!this.polyface.data.normal || 0 === this.polyface.data.normal.length) {
      PolyfaceQuery.buildAverageNormals(this.polyface);
    }

    assert(this.transform.isIdentity);
    return new PolyfacePrimitiveList(PolyfacePrimitive.create(this.displayParams, this.polyface));
  }

  protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined { return undefined; }
}

class SolidPrimitiveGeometry extends Geometry {
  private readonly _primitive: SolidPrimitive;

  public constructor(primitive: SolidPrimitive, tf: Transform, range: Range3d, params: DisplayParams) {
    super(tf, range, params);
    this._primitive = primitive;
  }

  protected _getStrokes() { return undefined; }

  protected _getPolyfaces(opts: StrokeOptions): PolyfacePrimitiveList {
    const builder = PolyfaceBuilder.create(opts);
    builder.addGeometryQuery(this._primitive);
    return new PolyfacePrimitiveList(PolyfacePrimitive.create(this.displayParams, builder.claimPolyface()));
  }
}
