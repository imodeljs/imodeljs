/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Numerics
 */

import { Geometry } from "../Geometry";
import { GrowableBlockedArray } from "../geometry3d/GrowableBlockedArray";
import { GrowableXYArray } from "../geometry3d/GrowableXYArray";
import { GrowableXYZArray } from "../geometry3d/GrowableXYZArray";
import { Point2d } from "../geometry3d/Point2dVector2d";
import { Point3d } from "../geometry3d/Point3dVector3d";

/**
 * Blocked array with operations to sort and cluster with a tolerance.
 * * Primary sorting is along an "arbitrary" sort vector.
 * @internal
 */
export class ClusterableArray extends GrowableBlockedArray {
  //  (This is pretty strange)
  // The sort vector is (1,c, c*c, ...)
  // Setting c = 1 makes it 1,1,1 which may be useful for visual scans during debug.
  // c with some inobvious digits makes it unlikely that there will be multiple points on a perpendicular to the sort vector.
  private static readonly _vectorFactor = 0.8732;  // use 1.0 to rig easy tests.
  /** Return a component of the sort vector. */
  public static sortVectorComponent(index: number): number {
    let c = 1.0;
    for (let i = 1; i < index; i++) c *= ClusterableArray._vectorFactor;
    return c;
  }
  private _numCoordinatePerPoint: number;
  private _numExtraDataPerPoint: number;
  /**
   * @param numCoordinatePerPoint number of coordinates per point
   * @param  numExtraDataPerPoint of extra data values per point.
   * @param initialBlockCapacity predicted number of points.  (This does not have to be accurate)
   */
  public constructor(numCoordinatePerPoint: number, numExtraDataPerPoint: number, initialBlockCapacity: number) {
    super(1 + numCoordinatePerPoint + numExtraDataPerPoint, initialBlockCapacity);
    this._numExtraDataPerPoint = numExtraDataPerPoint;
    this._numCoordinatePerPoint = numCoordinatePerPoint;
  }
  /** load a block, placing data[i] at block[i+1] to allow sort coordinate first.
   * @param data array of numDataPerBlock values.
   */
  public override addBlock(data: number[]) {
    const i0 = this.newBlockIndex() + 1;
    const n = Math.min(this.numPerBlock - 1, data.length);
    for (let i = 0; i < n; i++)
      this._data[i0 + i] = data[i];
  }
  /** add a block with directly 2 to 5 listed content parameters.
   * This assumes numDataPerPoint is sufficient for the parameters provided.
   */
  public addDirect(x0: number, x1: number, x2?: number, x3?: number, x4?: number) {
    const i0 = this.newBlockIndex();
    this._data[i0 + 1] = x0;
    this._data[i0 + 2] = x1;
    if (x2 !== undefined) this._data[i0 + 3] = x2;
    if (x3 !== undefined) this._data[i0 + 4] = x3;
    if (x4 !== undefined) this._data[i0 + 5] = x4;
  }

  /** add a block directly from a Point2d with 0 to 3 extras
   * This assumes numDataPerPoint is sufficient for the parameters provided.
   */
  public addPoint2d(xy: Point2d, a?: number, b?: number, c?: number) {
    const i0 = this.newBlockIndex();
    this._data[i0 + 1] = xy.x;
    this._data[i0 + 2] = xy.y;
    if (a !== undefined)
      this._data[i0 + 3] = a;
    if (b !== undefined)
      this._data[i0 + 4] = b;
    if (c !== undefined)
      this._data[i0 + 5] = c;
  }

  /** add a block with directly from a Point2d with 0 to 3 extras
   * This assumes numDataPerPoint is sufficient for the parameters provided.
   */
  public addPoint3d(xyz: Point3d, a?: number, b?: number, c?: number) {
    const i0 = this.newBlockIndex();
    this._data[i0 + 1] = xyz.x;
    this._data[i0 + 2] = xyz.y;
    this._data[i0 + 3] = xyz.z;
    if (a !== undefined)
      this._data[i0 + 4] = a;
    if (b !== undefined)
      this._data[i0 + 5] = b;
    if (c !== undefined)
      this._data[i0 + 6] = c;
  }
  /** Get the xy coordinates by point index. */
  public getPoint2d(blockIndex: number, result?: Point2d): Point2d {
    const i0 = this.blockIndexToDoubleIndex(blockIndex);
    return Point2d.create(this._data[i0 + 1], this._data[i0 + 2], result);
  }
  /** Get the xyZ coordinates by point index. */
  public getPoint3d(blockIndex: number, result?: Point3d): Point3d {
    const i0 = this.blockIndexToDoubleIndex(blockIndex);
    return Point3d.create(this._data[i0 + 1], this._data[i0 + 2], this._data[i0 + 3], result);
  }
  /** Return a single extra data value */
  public getExtraData(blockIndex: number, i: number): number {
    const i0 = this.blockIndexToDoubleIndex(blockIndex);
    return this._data[i0 + 1 + this._numCoordinatePerPoint + i];
  }
  /** Return a single data value */
  public getData(blockIndex: number, i: number): number {
    const i0 = this.blockIndexToDoubleIndex(blockIndex);
    return this._data[i0 + i];
  }

  /** Set a single extra data value */
  public setExtraData(blockIndex: number, i: number, value: number): void {
    const i0 = this.blockIndexToDoubleIndex(blockIndex);
    this._data[i0 + 1 + this._numCoordinatePerPoint + i] = value;
  }

  /** this value is used as cluster terminator in the Uint232rray of indcies. */
  public static readonly clusterTerminator = 0xFFffFFff;
  /** Test if `x` is the cluster terminator value. */
  public static isClusterTerminator(x: number): boolean { return x === ClusterableArray.clusterTerminator; }
  /** Return an array giving clusters of blocks with similar coordinates.
   *
   * * The contents of each block is assumed to be set up so the primary sort coordinate is first.
   *
   * ** simple coordinate blocks (x,y) or (x,y,z) would work fine but have occasional performance problems because points with same x would generate big blocks of
   * candidates for clusters.
   * ** The usual solution is to u value which is a dot product along some skew direction and have the blocks contain (u,x,y) or (u,x,y,z) for 2d versus 3d.
   * ** apply setupPrimaryClusterSort to prepare that!!!
   * * After a simple lexical sort, consecutive blocks that are within tolerance in the 0 component
   * are inspected.  Within that candidate set, all blocks that are within tolerance for ALL components are clustered.
   * * In the output cluster array, clusters are terminated a invalid index. Test for the invalid index with GrowableBlockArray.isClusterTerminator (x)
   */
  public clusterIndicesLexical(clusterTolerance: number = Geometry.smallMetricDistance): Uint32Array {
    // install primary sort key
    this.setupPrimaryClusterSort();
    // presort by all coordinates ....
    const firstSort = this.sortIndicesLexical();
    const clusterIndices = new Uint32Array(2 * firstSort.length);  // worst case: no duplicates, each index goes in followed by terminator.
    let m = 0;  // number of cluster indices
    const n = this.numBlocks; // and this must match firstSort.length !!
    let clusterStartBlockIndex = 0;
    let candidateBlockIndex = 0;
    let barrierU = 0.0;
    let i = 0;
    let j = 0;

    const k0 = 1;   // beginning of active column for distance
    const k1 = 1 + this._numCoordinatePerPoint;
    for (i = 0; i < n; i++) {
      clusterStartBlockIndex = firstSort[i];
      if (!ClusterableArray.isClusterTerminator(clusterStartBlockIndex)) {
        // unused block, so it becomes a cluster...
        clusterIndices[m++] = clusterStartBlockIndex;
        barrierU = this.component(clusterStartBlockIndex, 0) + clusterTolerance;
        firstSort[i] = ClusterableArray.clusterTerminator;
        for (j = i + 1; j < n; j++) {
          candidateBlockIndex = firstSort[j];
          if (candidateBlockIndex === ClusterableArray.clusterTerminator) continue; // nearby in sort direction but already in a cluster.
          if (this.component(candidateBlockIndex, 0) >= barrierU) break;
          if (this.distanceBetweenSubBlocks(clusterStartBlockIndex, candidateBlockIndex, k0, k1) < clusterTolerance) {
            clusterIndices[m++] = candidateBlockIndex;            // The candidate is in the block
            firstSort[j] = ClusterableArray.clusterTerminator;  // and it will not be reused as future block base
          }
        }
        clusterIndices[m++] = ClusterableArray.clusterTerminator;
      }
    }
    // Alas, the clusterIndices array has fluff at the end.  So it has to be copied.
    return clusterIndices.slice(0, m);
  }
  /** setup (overwrite!!) the "0" component with the dot product of numClusterCoordinate later components with a non-axis aligned vector.
   * This is normally called before clusterIndicesLexical.
   */
  public setupPrimaryClusterSort() {
    const nb = this.numBlocks;
    const nc = this._numCoordinatePerPoint;
    const vector = new Float64Array(nc);
    vector[0] = 1.0;
    for (let c = 1; c < nc; c++) vector[c] = vector[c - 1] * ClusterableArray._vectorFactor;
    let k = 0;
    let dot = 0.0;
    const data = this._data;
    for (let b = 0; b < nb; b++) {
      k = this.blockIndexToDoubleIndex(b);
      dot = 0.0;
      for (let c = 0; c < nc; c++) { dot += vector[c] * data[k + 1 + c]; }
      data[k] = dot;
    }
  }
  /** Convert the cluster data to an array of tuples with point i in the form
   * `[i, primarySortCoordinate, [x,y,..], [extraData0, extraData1, ...]]`
   */
  public toJSON(): any[] {
    const result: any[] = [];
    for (let b = 0; b < this.numBlocks; b++) {
      let i = this.blockIndexToDoubleIndex(b);
      const chunk: any[] = [b, this._data[i++]];
      const coordinates = [];
      for (let c = 0; c < this._numCoordinatePerPoint; c++)coordinates.push(this._data[i++]);
      chunk.push(coordinates);
      for (let c = 0; c < this._numExtraDataPerPoint; c++)
        chunk.push(this._data[i++]);
      result.push(chunk);
    }
    return result;
  }
  /**
   * Return an array of indices from block index to cluster index.
   * @param clusteredBlocks clusters of block indices followed by separators.
   */
  public createIndexBlockToClusterIndex(clusteredBlocks: Uint32Array): Uint32Array {
    const numBlocks = this.numBlocks;
    const blockToCluster = new Uint32Array(numBlocks);
    blockToCluster.fill(ClusterableArray.clusterTerminator);
    let numCluster = 0;
    for (const b of clusteredBlocks) {
      if (b >= numBlocks) {
        numCluster++;
      } else {
        blockToCluster[b] = numCluster;
      }
    }
    return blockToCluster;
  }
  /**
   * Return an array of indices from block index to index of its cluster's start in the cluster index array.
   * @param clusteredBlocks clusters of block indices followed by separators.
   */
  public createIndexBlockToClusterStart(clusteredBlocks: Uint32Array): Uint32Array {
    const n = clusteredBlocks.length;
    const numBlocks = this.numBlocks;
    const blockToClusterStart = new Uint32Array(numBlocks);
    const terminator = ClusterableArray.clusterTerminator;
    blockToClusterStart.fill(terminator);
    let clusterStart = 0;
    for (let i = 0; i < n; i++) {
      const k = clusteredBlocks[i];
      if (k > numBlocks) {
        clusterStart = i + 1;
      } else {
        blockToClusterStart[k] = clusterStart;
      }
    }
    return blockToClusterStart;
  }
  /** count the clusters in the clusteredBlocks array. */
  public countClusters(clusteredBlocks: Uint32Array): number {
    let numClusters = 0;
    const terminator = ClusterableArray.clusterTerminator;
    for (const b of clusteredBlocks) {
      if (b === terminator)
        numClusters++;
    }
    return numClusters;
  }
  /** create a reverse index: given a cluster index k, clusterToClusterStart[k] is the place
   * the cluster's block indices appear in clusterBlocks
   */
  public createIndexClusterToClusterStart(clusteredBlocks: Uint32Array): Uint32Array {
    let numCluster = this.countClusters(clusteredBlocks);
    const clusterToClusterStart = new Uint32Array(numCluster);
    const terminator = ClusterableArray.clusterTerminator;
    clusterToClusterStart.fill(terminator);
    const n = clusteredBlocks.length;
    let clusterStart = 0;
    for (let i = 0; i < n; i++) {
      const k = clusteredBlocks[i];
      if (k === terminator) {
        clusterStart = i + 1;
      } else if (i === clusterStart) {
        clusterToClusterStart[numCluster++] = clusterStart;
      }
    }
    return clusterToClusterStart;
  }

  /**
   * Sort terminator-delimited subsets of an array of indices into the table, using a single extraData index as sort key.
   * @param blockedIndices [in] indices, organized as blocks of good indices terminated by the clusterTerminator.
   * @param extraDataIndex index of the extra data key.
   */
  public sortSubsetsBySingleKey(blockedIndices: Uint32Array, dataIndex: number) {
    const dataOffset = 1 + dataIndex;
    let kBegin = 0;
    let swap;
    let key0, key1;
    const numK = blockedIndices.length;
    for (let kEnd = 0; kEnd < numK; kEnd++) {
      if (blockedIndices[kEnd] === ClusterableArray.clusterTerminator) {
        // sort blockedIndices[kBegin ,= k < kEnd].
        //  (search for minimum remaining, swap  . . )
        for (let k0 = kBegin; k0 + 1 < kEnd; k0++) {
          key0 = this.getWithinBlock(blockedIndices[k0], dataOffset);
          for (let k1 = k0 + 1; k1 < kEnd; k1++) {
            key1 = this.getWithinBlock(blockedIndices[k1], dataOffset);
            if (key1 < key0) {
              swap = blockedIndices[k0];
              blockedIndices[k0] = blockedIndices[k1];
              blockedIndices[k1] = swap;
              key0 = key1;
            }
          }
        }
        kBegin = kEnd + 1;
      }
    }
  }
  /**
   * Returns packed points with indices mapping old to new.
   * @param data points to cluster.
   */
  public static clusterPoint3dArray(data: Point3d[], tolerance: number = Geometry.smallMetricDistance):
    PackedPointsWithIndex {
    const clusterArray = new ClusterableArray(3, 0, data.length);
    data.forEach((p: Point3d) => {
      clusterArray.addDirect(p.x, p.y, p.z);
    });
    const order = clusterArray.clusterIndicesLexical(tolerance);
    const result = new PackedPointsWithIndex(data.length);
    let currentClusterIndex = 0;
    let numThisCluster = 0;
    order.forEach((k: number) => {
      if (ClusterableArray.isClusterTerminator(k)) {
        currentClusterIndex++;
        numThisCluster = 0;
      } else {
        if (numThisCluster === 0)
          result.packedPoints.push(data[k].clone());
        result.oldToNew[k] = currentClusterIndex;
        numThisCluster++;
      }
    });
    return result;
  }

  /**
   * Returns packed points with indices mapping old to new.
   * @param data points to cluster.
   */
  public static clusterGrowablePoint2dArray(source: GrowableXYArray, tolerance: number = Geometry.smallMetricDistance): PackedPoint2dsWithIndex {
    const clusterArray = new ClusterableArray(2, 0, source.length);
    const p = Point2d.create();
    const numSourcePoint = source.length;
    for (let i = 0; i < numSourcePoint; i++) {
      source.getPoint2dAtUncheckedPointIndex(i, p);
      clusterArray.addDirect(p.x, p.y);
    }
    const order = clusterArray.clusterIndicesLexical(tolerance);
    const numPackedPoints = clusterArray.countClusters(order);
    const result = new PackedPoint2dsWithIndex(source.length, numPackedPoints);
    let currentClusterIndex = 0;
    let numThisCluster = 0;
    order.forEach((k: number) => {
      if (ClusterableArray.isClusterTerminator(k)) {
        currentClusterIndex++;
        numThisCluster = 0;
      } else {
        if (numThisCluster === 0) // This is the first encounter with a new cluster
          result.growablePackedPoints.pushFromGrowableXYArray(source, k);
        result.oldToNew[k] = currentClusterIndex;
        numThisCluster++;
      }
    });
    return result;
  }

  /**
   * Returns packed points with indices mapping old to new.
   * @param data points to cluster.
   */
  public static clusterGrowablePoint3dArray(source: GrowableXYZArray, tolerance: number = Geometry.smallMetricDistance):
    PackedPointsWithIndex {
    const clusterArray = new ClusterableArray(3, 0, source.length);
    const p = Point3d.create();
    const numSourcePoint = source.length;
    for (let i = 0; i < numSourcePoint; i++) {
      source.getPoint3dAtUncheckedPointIndex(i, p);
      clusterArray.addDirect(p.x, p.y, p.z);
    }
    const order = clusterArray.clusterIndicesLexical(tolerance);
    const result = new PackedPointsWithIndex(source.length);
    const numPackedPoints = clusterArray.countClusters(order);
    result.growablePackedPoints = new GrowableXYZArray(numPackedPoints);
    let currentClusterIndex = 0;
    let numThisCluster = 0;
    order.forEach((k: number) => {
      if (ClusterableArray.isClusterTerminator(k)) {
        currentClusterIndex++;
        numThisCluster = 0;
      } else {
        if (numThisCluster === 0) // This is the first encounter with a new cluster
          result.growablePackedPoints!.pushFromGrowableXYZArray(source, k);
        result.oldToNew[k] = currentClusterIndex;
        numThisCluster++;
      }
    });
    return result;
  }
}

/**
 * @internal
 */
function updateIndices(indices: number[], oldToNew: Uint32Array): boolean {
  let numErrors = 0;
  indices.forEach((value: number, i: number, data: number[]) => {
    if (value < oldToNew.length) {
      data[i] = oldToNew[value];
    } else numErrors++;
  });
  return numErrors === 0;
}

/**
 * Data carrier class for
 * * packedPoints = an array of Point3d
 * * oldToNew = array of indices from some prior Point3d[] to the packed points.
 * @internal
 */
class PackedPointsWithIndex {
  /** Array of Point3d */
  public packedPoints: Point3d[];
  /** array of coordinates packed in GrowableXYZArray  */
  public growablePackedPoints: GrowableXYZArray | undefined;
  /** mapping from old point index to new point index. */
  public oldToNew: Uint32Array;
  /** integer value for unknown index. */
  public static readonly invalidIndex = 0xFFFFffff;

  /** construct a PackedPoints object with
   * * empty packedPoints array
   * * oldToNew indices all initialized to PackedPoints.invalidIndex
   */
  constructor(numOldIndexEntry: number) {
    this.packedPoints = [];
    this.oldToNew = new Uint32Array(numOldIndexEntry);
    for (let i = 0; i < numOldIndexEntry; i++) {
      this.oldToNew[i] = PackedPointsWithIndex.invalidIndex;
    }
  }
  /**
   * Use the oldToNew array to update an array of "old" indices.
   * @param indices array of indices into prepacked array.
   * @returns true if all input indices were valid for the oldToNew array.
   */
  public updateIndices(indices: number[]): boolean {
    return updateIndices(indices, this.oldToNew);
  }
}

/**
 * @internal
 */
class PackedPoint2dsWithIndex {
  /** array of coordinates packed in GrowableXYArray  */
  public growablePackedPoints: GrowableXYArray;
  /** mapping from old point index to new point index. */
  public oldToNew: Uint32Array;
  /** integer value for unknown index. */
  public static readonly invalidIndex = 0xFFFFffff;

  /** construct a PackedPoints object with
   * * empty packedPoints array
   * * oldToNew indices all initialized to PackedPoints.invalidIndex
   */
  constructor(numOldIndexEntry: number, numPackedPoints: number) {
    this.growablePackedPoints = new GrowableXYArray(numPackedPoints);
    this.oldToNew = new Uint32Array(numOldIndexEntry);
    for (let i = 0; i < numOldIndexEntry; i++) {
      this.oldToNew[i] = PackedPoint2dsWithIndex.invalidIndex;
    }
  }
  /**
   * Use the oldToNew array to update an array of "old" indices.
   * @param indices array of indices into prepacked array.
   * @returns true if all input indices were valid for the oldToNew array.
   */
  public updateIndices(indices: number[]): boolean {
    return updateIndices(indices, this.oldToNew);
  }
}
