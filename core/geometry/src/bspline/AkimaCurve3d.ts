/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Bspline
 */

import { Point3d } from "../geometry3d/Point3dVector3d";
import { Geometry } from "../Geometry";
import { Point3dArray } from "../geometry3d/PointHelpers";
import { ProxyCurve } from "../curve/ProxyCurve";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { BSplineCurve3d } from "./BSplineCurve";
import { GeometryQuery } from "../curve/GeometryQuery";
import { Transform } from "../geometry3d/Transform";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { XYZProps } from "../geometry3d/XYZProps";

/**
 * fitPoints  [[AkimaCurve3d]]
 * * This is a "json compatible" version of the serializer-friendly [[AkimaCurve3dOptions]]
 * @public
 */
 export interface AkimaCurve3dProps {
 /** Points that the curve must pass through */
 fitPoints: XYZProps[];
}

/**
 * fitPoints and end condition data for [[AkimaCurve3d]]
 * * This is a "typed object" version of the serializer-friendly [[AkimaCurve3dProps]]
 * * Typical use cases rarely require all parameters, so the constructor does not itemize them as parameters.
 * @public
 */
export class AkimaCurve3dOptions {
  public fitPoints: Point3d[];
  /**
   *
   * @param fitPoints points to CAPTURE
   * @param knots array to CAPTURE
   */
  public constructor(fitPoints?: Point3d[]) {
    this.fitPoints = fitPoints  ? fitPoints : [];
  }

 /** Points that the curve must pass through.
  * First and last 2 points are "beyond the end" for control of end slope.
 fitPoints: Point3d[];

/** Clone with strongly typed members reduced to simple json. */
  public cloneAsAkimaCurve3dProps(): AkimaCurve3dProps {
    const props = {
      fitPoints: Point3dArray.cloneDeepJSONNumberArrays(this.fitPoints),
    };
    return props;
  }
/** Clone with strongly typed members reduced to simple json. */
  public clone(): AkimaCurve3dOptions {
    const clone = new AkimaCurve3dOptions(Point3dArray.clonePoint3dArray(this.fitPoints));
    return clone;
  }

/** Clone with strongly typed members reduced to simple json. */
public static create(source: AkimaCurve3dProps): AkimaCurve3dOptions {
  const result = new AkimaCurve3dOptions(Point3dArray.clonePoint3dArray(source.fitPoints));
  return result;
}

  public static areAlmostEqual(dataA: AkimaCurve3dOptions | undefined, dataB: AkimaCurve3dOptions | undefined): boolean {
    if (dataA === undefined && dataB === undefined)
      return true;
    if (dataA !== undefined && dataB !== undefined) {
        return Geometry.almostEqualArrays(dataA.fitPoints, dataB.fitPoints, (a: Point3d, b: Point3d) => a.isAlmostEqual(b));
    }
    return false;
  }
}

/**
 * Interpolating curve.
 * * Derive from [[ProxyCurve]]
 * * Use a [[BSplineCurve3d]] as the proxy
 * *
 * @public
 */
export class AkimaCurve3d extends ProxyCurve  {
  public readonly curvePrimitiveType = "interpolationCurve";
  private _options: AkimaCurve3dOptions;
  /**
   * CAPTURE properties and proxy curve.
   */
private constructor(properties: AkimaCurve3dOptions, proxyCurve: CurvePrimitive) {
    super(proxyCurve);
  this._options = properties;
  }
  public override dispatchToGeometryHandler(handler: GeometryHandler) {
    return handler.handleAkimaCurve3d(this);
  }
/**
 * Create an [[AkimaCurve3d]] based on points, knots, and other properties in the [[AkimaCurve3dProps]] or [[AkimaCurve3dOptions]].
 * * This saves a COPY OF the options or props.
 * * Use createCapture () if the options or props can be used without copy
 */
  public static create(options: AkimaCurve3dOptions | AkimaCurve3dProps): AkimaCurve3d | undefined {
    let optionsCopy;
    if (options instanceof AkimaCurve3dOptions) {
      optionsCopy = options.clone();
    } else {
      optionsCopy = AkimaCurve3dOptions.create(options);
    }
    return AkimaCurve3d.createCapture(optionsCopy);
  }

  public static createCapture(options: AkimaCurve3dOptions): AkimaCurve3d | undefined{
    const proxyCurve = BSplineCurve3d.createFromAkimaCurve3dOptions(options);
    if (proxyCurve)
      return new AkimaCurve3d(options, proxyCurve);
    return undefined;
  }

  /** Return a (copy of) the defining points, packed as a Float64Array */
  public copyFitPointsFloat64Array(): Float64Array {
    return Point3dArray.cloneXYZPropsAsFloat64Array(this._options.fitPoints);
  }

  /**
   * Return json key-value pairs for for this [[AkimaCurve3d]].
   * @returns
   */
  public toJSON(): any {
    return this._options.cloneAsAkimaCurve3dProps();
  }
  /** Clone the [[AkimaCurve3dProps]] object in this [[AkimaCurve3dProps]] */
  public cloneProps(): AkimaCurve3dProps {
    return this._options.cloneAsAkimaCurve3dProps();
  }

  /**
   * Reverse the curve direction.
   * * This updates both the defining properties and the proxy bspline.
   */
  public reverseInPlace(): void {
    this._proxyCurve.reverseInPlace();
    this._options.fitPoints.reverse();
  }
  /**
   * Transform this [[AkimaCurve3d]] and its defining data in place
   */
  public tryTransformInPlace(transform: Transform): boolean {
    const proxyOk = this._proxyCurve.tryTransformInPlace(transform);
    if (proxyOk) {
      transform.multiplyPoint3dArray(this._options.fitPoints);
    }
    return proxyOk;
  }
  /**
   * Return a transformed clone.
   */
  public cloneTransformed(transform: Transform): GeometryQuery | undefined {
    const myClone = this.clone();
    if (myClone && myClone?.tryTransformInPlace(transform))
      return myClone;
    return undefined;
  }
  /**
   * Return a clone.
   */
  public clone(): GeometryQuery | undefined {
    const proxyClone = this._proxyCurve.clone();
    if (proxyClone) {
      return new AkimaCurve3d(this._options.clone (), proxyClone as CurvePrimitive);
    }
    return undefined;
  }
/** Test if `other` is also an [[AkimaCurve3d]] */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof AkimaCurve3d; }

  public override isAlmostEqual(other: GeometryQuery): boolean{
    if (other instanceof AkimaCurve3d) {
      return AkimaCurve3dOptions.areAlmostEqual(this._options, other._options);
    }
    return false;
  }
}
