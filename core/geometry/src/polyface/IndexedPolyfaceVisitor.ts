/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Polyface
 */
import { Point2d } from "../geometry3d/Point2dVector2d";
import { PolyfaceData } from "./PolyfaceData";
import { IndexedPolyface, Polyface, PolyfaceVisitor } from "./Polyface";
import { Geometry } from "../Geometry";
/* eslint-disable @bentley/prefer-get */
/**
 * An `IndexedPolyfaceVisitor` is an iterator-like object that "visits" facets of a mesh.
 * * The visitor extends a `PolyfaceData ` class, so it can at any time hold all the data of a single facet.
 * @public
 */
export class IndexedPolyfaceVisitor extends PolyfaceData implements PolyfaceVisitor {
  private _currentFacetIndex: number;
  private _nextFacetIndex: number;
  private _numWrap: number;
  private _numEdges: number;
  private _polyface: IndexedPolyface;
  // to be called from static factory method that validates the polyface ...
  protected constructor(facets: IndexedPolyface, numWrap: number) {
    super(facets.data.normalCount > 0, facets.data.paramCount > 0, facets.data.colorCount > 0, facets.twoSided);
    this._polyface = facets;
    this._numWrap = numWrap;
    if (facets.data.auxData)
      this.auxData = facets.data.auxData.createForVisitor();

    this.reset();
    this._numEdges = 0;
    this._nextFacetIndex = 0;
    this._currentFacetIndex = -1;

  }
  /** Return the client polyface object. */
  public clientPolyface(): Polyface { return this._polyface; }
  /** Set the number of vertices duplicated (e.g. 1 for start and end) in arrays in the visitor. */
  public setNumWrap(numWrap: number) { this._numWrap = numWrap; }

  /** Return the number of edges in the current facet.
   * * Not that if this visitor has `numWrap` greater than zero, the number of edges is smaller than the number of points.
   */
  public get numEdgesThisFacet(): number { return this._numEdges; }
  /** Create a visitor for iterating the facets of `polyface`, with indicated number of points to be added to each facet to produce closed point arrays
   * Typical wrap counts are:
   * * 0 -- leave the point arrays with "missing final edge"
   * * 1 -- add point 0 as closure point
   * * 2 -- add points 0 and 1 as closure and wrap point.  This is useful when vertex visit requires two adjacent vectors, e.g. for cross products.
   */
  public static create(polyface: IndexedPolyface, numWrap: number): IndexedPolyfaceVisitor {
    return new IndexedPolyfaceVisitor(polyface, numWrap);
  }
  /** Advance the iterator to a particular facet in the client polyface */
  public moveToReadIndex(facetIndex: number): boolean {
    if (!this._polyface.isValidFacetIndex(facetIndex))
      return false;
    this._currentFacetIndex = facetIndex;
    this._nextFacetIndex = facetIndex + 1;
    this._numEdges = this._polyface.numEdgeInFacet(facetIndex);
    this.resizeAllDataArrays(this._numEdges + this._numWrap);
    this.gatherIndexedData(this._polyface.data, this._polyface.facetIndex0(this._currentFacetIndex), this._polyface.facetIndex1(this._currentFacetIndex), this._numWrap);
    return true;
  }
  /** Advance the iterator to a the 'next' facet in the client polyface */
  public moveToNextFacet(): boolean {
    if (this._nextFacetIndex !== this._currentFacetIndex)
      return this.moveToReadIndex(this._nextFacetIndex);
    this._nextFacetIndex++;
    return true;
  }

  /** Reset the iterator to start at the first facet of the polyface. */
  public reset(): void {
    this.moveToReadIndex(0);
    this._nextFacetIndex = 0; // so immediate moveToNextFacet stays here.
  }

  /**
   * Attempts to extract the distance parameter for the given vertex index on the current facet
   * Returns the distance parameter as a point. Returns undefined on failure.
   */
  public tryGetDistanceParameter(index: number, result?: Point2d): Point2d | undefined {
    if (index >= this.numEdgesThisFacet)
      return undefined;

    if (this.param === undefined || this._polyface.data.face.length === 0)
      return undefined;

    const faceData = this._polyface.tryGetFaceData(this._currentFacetIndex);
    if (!faceData)
      return undefined;
    return faceData.convertParamXYToDistance(this.param.getXAtUncheckedPointIndex(index), this.param.getYAtUncheckedPointIndex(index), result);
  }

  /**
   * Attempts to extract the normalized parameter (0,1) for the given vertex index on the current facet.
   * Returns the normalized parameter as a point. Returns undefined on failure.
   */
  public tryGetNormalizedParameter(index: number, result?: Point2d): Point2d | undefined {
    if (index >= this.numEdgesThisFacet)
      return undefined;

    if (this.param === undefined || this._polyface.data.face.length === 0)
      return undefined;

    const faceData = this._polyface.tryGetFaceData(this._currentFacetIndex);
    if (!faceData)
      return undefined;
    return faceData.convertParamXYToNormalized(this.param.getXAtUncheckedPointIndex(index), this.param.getYAtUncheckedPointIndex(index), result);
  }
  /** Return the index (in the client polyface) of the current facet */
  public currentReadIndex(): number { return this._currentFacetIndex; }
  /** Return the point index of vertex i within the currently loaded facet */
  public clientPointIndex(i: number): number { return this.pointIndex[i]; }
  /** Return the param index of vertex i within the currently loaded facet */
  public clientParamIndex(i: number): number { return this.paramIndex ? this.paramIndex[i] : -1; }
  /** Return the normal index of vertex i within the currently loaded facet */
  public clientNormalIndex(i: number): number { return this.normalIndex ? this.normalIndex[i] : -1; }
  /** Return the color index of vertex i within the currently loaded facet */
  public clientColorIndex(i: number): number { return this.colorIndex ? this.colorIndex[i] : -1; }
  /** Return the aux data index of vertex i within the currently loaded facet */
  public clientAuxIndex(i: number): number { return this.auxData ? this.auxData.indices[i] : -1; }

  /** clear the contents of all arrays.  Use this along with transferDataFrom methods to build up new facets */
  public clearArrays(): void {
    if (this.point !== undefined)
      this.point.length = 0;
    if (this.param !== undefined)
      this.param.length = 0;
    if (this.normal !== undefined)
      this.normal.length = 0;
    if (this.color !== undefined)
      this.color.length = 0;
  }
  /** transfer data from a specified index of the other visitor as new data in this visitor. */
  public pushDataFrom(other: PolyfaceVisitor, index: number): void {
    this.point.pushFromGrowableXYZArray(other.point, index);
    if (this.color && other.color && index < other.color.length)
      this.color.push(other.color[index]);
    if (this.param && other.param && index < other.param.length)
      this.param.pushFromGrowableXYArray(other.param, index);
    if (this.normal && other.normal && index < other.normal.length)
      this.normal.pushFromGrowableXYZArray(other.normal, index);
  }
  /** transfer interpolated data from the other visitor.
   * * all data values are interpolated at `fraction` between `other` values at index0 and index1.
   */
  public pushInterpolatedDataFrom(other: PolyfaceVisitor, index0: number, fraction: number, index1: number): void {
    this.point.pushInterpolatedFromGrowableXYZArray(other.point, index0, fraction, index1);
    if (this.color && other.color && index0 < other.color.length && index1 < other.color.length)
      this.color.push(interpolateColor(other.color[index0], fraction, other.color[index1]));
    if (this.param && other.param && index0 < other.param.length && index1 < other.param.length)
      this.param.pushInterpolatedFromGrowableXYArray(other.param, index0, fraction, index1);
    if (this.normal && other.normal && index0 < other.normal.length && index1 < other.normal.length)
      this.normal.pushInterpolatedFromGrowableXYZArray(other.normal, index0, fraction, index1);
  }

}
/**
 * * shift to right by shiftBits.
 * * mask off the low 8 bits
 * * interpolate the number
 * * truncate to floor
 * * shift left
 * * Hence all numbers in and out of the floating point are 0..255.
 * @param color0
 * @param fraction
 * @param color1
 * @param shiftBits
 */
function interpolateByte(color0: number, fraction: number, color1: number, shiftBits: number): number {
  color0 = (color0 >>> shiftBits) & 0xFF;
  color1 = (color1 >>> shiftBits) & 0xFF;
  const color = Math.floor(color0 + fraction * (color1 - color0)) & 0xFF;
  return color << shiftBits;
}

/**
 * Interpolate each byte of color0 and color1 as integers.
 * @param color0 32 bit color (e.g. rgb+transparency)
 * @param fraction fractional position.  This is clamped to 0..1 to prevent byte values outside their 0..255 range.
 * @param color1
 * @param shiftBits
 * @internal
 */
export function interpolateColor(color0: number, fraction: number, color1: number) {
  // don't allow fractions outside the individual byte ranges.
  fraction = Geometry.clamp(fraction, 0, 1);
  // interpolate each byte in place ....
  /*
  const byte0 = interpolateLowByte(color0 & 0xFF, fraction, color1 & 0xFF);
  const byte1 = interpolateLowByte((color0 & 0xFF00) >>> 8, fraction, (color1 & 0xFF00) >>> 8) << 8;
  const byte2 = interpolateLowByte((color0 & 0xFF0000) >>> 16, fraction, (color1 & 0xFF0000) >>> 16) << 16;
  const byte3 = interpolateLowByte((color0 & 0xFF000000) >>> 24, fraction, (color1 & 0xFF000000) >>> 24) << 24;
  */
  const byte0 = interpolateByte(color0, fraction, color1, 0);
  const byte1 = interpolateByte(color0, fraction, color1, 8);
  const byte2 = interpolateByte(color0, fraction, color1, 16);
  const byte3 = interpolateByte(color0, fraction, color1, 24);

  return (byte0 | byte1 | byte2 | byte3);
}

/**
 * An `IndexedPolyfaceSubsetVisitor` is an IndexedPolyfaceVisitor which only visits a subset of facets in the polyface.
 * * The subset is defined by an array of facet indices provided when this visitor is created.
 * * Within the subset visitor, "facetIndex" is understood as index within the subset array:
 *   * moveToNextFacet moves only within the subset
 *   * moveToReadIndex(i) moves underlying visitor's parentFacetIndex(i)
 * @public
 */
export class IndexedPolyfaceSubsetVisitor extends IndexedPolyfaceVisitor {
  private _parentFacetIndices: number[];
  // index WITHIN THE _activeFacetIndices array.
  private _nextActiveIndex: number;
  private constructor(polyface: IndexedPolyface, activeFacetIndices: number[], numWrap: number) {
    super(polyface, numWrap);
    this._parentFacetIndices = activeFacetIndices.slice();
    this._nextActiveIndex = 0;
  }
  /** Create a visitor for iterating a subset of the facets of `polyface`, with indicated number of points to be added to each facet to produce closed point arrays
   * * Typical wrap counts are:
   *   * 0 -- leave the point arrays with "missing final edge"
   *   * 1 -- add point 0 as closure point
   *   * 2 -- add points 0 and 1 as closure and wrap point.  This is useful when vertex visit requires two adjacent vectors, e.g. for cross products.
   * * The activeFacetIndices array indicates all facets to be visited.
   */
  public static createSubsetVisitor(polyface: IndexedPolyface, activeFacetIndices: number[], numWrap: number): IndexedPolyfaceSubsetVisitor {
    return new IndexedPolyfaceSubsetVisitor(polyface, activeFacetIndices.slice(), numWrap);
  }
  /** Advance the iterator to a particular facet in the client polyface */
  public override moveToReadIndex(activeIndex: number): boolean {
    if (activeIndex >= 0 && activeIndex <= this._parentFacetIndices.length) {
      this._nextActiveIndex = activeIndex;
      return super.moveToReadIndex(this._parentFacetIndices[activeIndex++]);
    }
    return false;
  }
  /** Advance the iterator to a the 'next' facet in the client polyface */
  public override moveToNextFacet(): boolean {
    if (this._nextActiveIndex < this._parentFacetIndices.length) {
      const result = this.moveToReadIndex(this._nextActiveIndex);
      if (result) {
        this._nextActiveIndex++;
        return true;
      }
    }
    return false;
  }
  /** Reset the iterator to start at the first facet of the polyface. */
  public override reset(): void {
    this._nextActiveIndex = 0;
  }
  /** return the parent facet index of the indicated index within the active facets */
  public parentFacetIndex(activeIndex: number): number | undefined {
    if (activeIndex >= 0 && activeIndex <= this._nextActiveIndex) {
      return this._parentFacetIndices[activeIndex];
    }
    return undefined;
  }
}
