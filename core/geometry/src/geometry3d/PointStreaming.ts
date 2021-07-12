/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module CartesianGeometry
 */

import { LineStringDataVariant, MultiLineStringDataVariant } from "../topology/Triangulation";
import { GrowableXYZArray } from "./GrowableXYZArray";
import { IndexedXYZCollection } from "./IndexedXYZCollection";
/* eslint-disable @typescript-eslint/naming-convention, no-empty */
import { Point3d } from "./Point3dVector3d";
import { Range3d } from "./Range";

//
// remarks: point array variants . . .
//  * [[x,y,z], ...]
//  * [[Point3d, Point3d]
//  * [GrowableXYZArray, ..]
//
/**
 * "no-op" base class for stream handlers
 * @internal
 */
export class PointStreamXYZHandlerBase {
  public startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void { }
  public handleXYZ(_x: number, _y: number, _z: number): void { }
  public endChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void { }
}
/** Base class for handling points in pairs.
 * * Callers implement handleXYZXYZ to receive point pairs.
 * * Callers may implement startChain and endChain.
 *   * Beware that if startChain is implemented it must call super.startChain () to reset internal x0, y0,z0 to undefined.
 *   * If that is not done, a point pair will appear from the end of previous chain to start of new chain.
 *   * This (intermediate base) class does NOT override startChain
 */
export class PointStreamXYZXYZHandlerBase extends PointStreamXYZHandlerBase {
  private _x0?: number;
  private _y0?: number;
  private _z0?: number;
  public override handleXYZ(x: number, y: number, z: number): void {
    if (this._x0 !== undefined)
      this.handleXYZXYZ(this._x0, this._y0!, this._z0!, x, y, z);
    this._x0 = x;
    this._y0 = y;
    this._z0 = z;
  }
  public override startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void {
    this._x0 = this._y0 = this._z0 = undefined;
  }
  /**
   * Handler function called successively for each point0, point1 pair.  Concrete class should implement this.
   * @param _x0 x coordinate at point 0
   * @param _y0 y coordinate of point 0
   * @param _z0 z coordinate of point 0
   * @param _x1 x coordinate of point 1
   * @param _y1 y coordinate of point 1
   * @param _z1 z coordinate of point 1
   */
  public handleXYZXYZ(_x0: number, _y0: number, _z0: number, _x1: number, _y1: number, _z1: number): void { }
}
/**
 * Concrete class to handle startChain, handleXYZ and endChain calls and return a (one-level deep array of
 * GrowableXYZArray
 */
export class PointStreamGrowableXYZArrayCollector extends PointStreamXYZHandlerBase {
  private _pointArrays?: GrowableXYZArray[];
  private _currentData?: GrowableXYZArray;
  public override startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void {
    this._currentData = undefined;
  }
  public override handleXYZ(x: number, y: number, z: number): void {
    if (!this._currentData)
      this._currentData = new GrowableXYZArray();
    this._currentData.pushXYZ(x, y, z);
  }
  public override endChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void {
    if (this._currentData !== undefined) {
      if (this._pointArrays === undefined)
        this._pointArrays = [];
      this._pointArrays.push(this._currentData);
      this._currentData = undefined;
    }
  }
  /** Return MultiLineStringDataVariant as an array of GrowableXYZArray */
  public claimArrayOfGrowableXYZArray(): GrowableXYZArray[] | undefined {
    const result = this._pointArrays;
    this._pointArrays = undefined;
    return result;
  }
}
/**
 * PointStream handler to collect the range of points.
 */
export class PointStreamRangeCollector extends PointStreamXYZHandlerBase {
  private _range?: Range3d = Range3d.createNull();
  public override handleXYZ(x: number, y: number, z: number): void {
    if (!this._range)
      this._range = Range3d.createNull();
    this._range.extendXYZ(x, y, z);
  }
  public claimResult(): Range3d {
    const range = this._range;
    this._range = undefined;
    if (!range)
      return Range3d.createNull();
    return range;
  }
}

export class PointStringDeepXYZArrayCollector {
  // The 0 entry in this stack "should" always end up as a single array.
  // Hypothetically some caller might have do start-end that put multiple things
  // there.  Hence the 0 entry (not the array itself) is the collected result.
  private _resultStack: any[];
  private _xyzFunction: (x: number, y: number, z: number) => any;
  /**
   *
   * @param xyzFunction function to map (x,y,z) to the leaf object type in the arrays.
   */
  public constructor(xyzFunction: (x: number, y: number, z: number) => any) {
    this._xyzFunction = xyzFunction;
    this._resultStack = [];
    // create the [0] placeholder.
    this._resultStack.push([]);
  }

  public startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void {
    this._resultStack.push([]);
  }

  public handleXYZ(x: number, y: number, z: number): void {
    this._resultStack[this._resultStack.length - 1].push(this._xyzFunction(x, y, z));
  }
  public endChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void {
    const q = this._resultStack[this._resultStack.length - 1];
    this._resultStack.pop();
    this._resultStack[this._resultStack.length - 1].push(q);
  }

  public claimResult(): any[] {
    const r = this._resultStack[0];
    if (r.length === 1)
      return r[0];
    return r;
  }
}
/**
 * class for converting variant point data into more specific forms.
 * @internal
 */
export class VariantPointDataStream {
  private static _workPoint?: Point3d;
  /** Invoke a callback with each x,y,z from an array of points in variant forms.
   * @param startChainCallback called to announce the beginning of points (or recursion)
   * @param pointCallback (index, x,y,z) = function to receive point coordinates one by one
   * @param endChainCallback called to announce the end of handling of an array.
   */
  public static streamXYZ(data: MultiLineStringDataVariant, handler: PointStreamXYZHandlerBase) {
    let numPoint = 0;
    if (Array.isArray(data)) {
      // If the first entry is a point, expect the entire array to be points.
      // otherwise recurse to each member of this array.
      if (data.length > 0 && Point3d.isAnyImmediatePointType(data[0])) {
        handler.startChain(data, true);
        for (const p of data) {
          const x = Point3d.accessX(p);
          const y = Point3d.accessY(p);
          const z = Point3d.accessZ(p, 0) as number;
          if (x !== undefined && y !== undefined)
            handler.handleXYZ(x, y, z);
          numPoint++;
        }
        handler.endChain(data, true);
      } else {
        // This is an array that does not immediately have points.
        handler.startChain(data, false);
        for (const child of data) {
          numPoint += this.streamXYZ((child as unknown) as LineStringDataVariant, handler);
        }
        handler.endChain(data, false);
      }
    } else if (data instanceof IndexedXYZCollection) {
      handler.startChain(data, true);
      const q = VariantPointDataStream._workPoint = Point3d.create(0, 0, 0, VariantPointDataStream._workPoint);
      for (let i = 0; i < data.length; i++) {
        data.getPoint3dAtCheckedPointIndex(i, q);
        numPoint++;
        handler.handleXYZ(q.x, q.y, q.z);
      }
      handler.endChain(data, true);
    }
    return numPoint;
  }

}
