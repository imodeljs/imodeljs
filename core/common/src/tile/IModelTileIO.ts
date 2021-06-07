/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tile
 */

import { assert, ByteStream } from "@bentley/bentleyjs-core";
import { Range3d } from "@bentley/geometry-core";
import { ElementAlignedBox3d } from "../geometry/Placement";
import { nextPoint3d64FromByteStream, TileFormat, TileHeader } from "./TileIO";

/** Flags describing the geometry contained within a tile in iMdl format.
 * @internal
 */
export enum ImdlFlags {
  /** No special flags */
  None = 0,
  /** The tile contains some curved geometry */
  ContainsCurves = 1 << 0,
  /** Some geometry within the tile range was omitted based on its size */
  Incomplete = 1 << 2,
  /** The tile must be refined by sub-division, not magnification. */
  DisallowMagnification = 1 << 3,
}

/** Describes the maximum major and minor version of the iMdl tile format supported by this version of this package.
 * @internal
 */
export enum CurrentImdlVersion {
  /** The unsigned 16-bit major version number. If the major version specified in the tile header is greater than this value, then this
   * front-end is not capable of reading the tile content. Otherwise, this front-end can read the tile content even if the header specifies a
   * greater minor version than CurrentVersion.Minor, although some data may be skipped.
   */
  Major = 24,
  /** The unsigned 16-bit minor version number. If the major version in the tile header is equal to CurrentVersion.Major, then this package can
   * read the tile content even if the minor version in the tile header is greater than this value, although some data may be skipped.
   */
  Minor = 0,
  /** The unsigned 32-bit version number derived from the 16-bit major and minor version numbers. */
  Combined = (Major << 0x10) | Minor,
}

/** Header embedded at the beginning of binary tile data in iMdl format describing its contents.
 * @internal
 */
export class ImdlHeader extends TileHeader {
  /** The size of this header in bytes. */
  public readonly headerLength: number;
  /** Flags describing the geometry contained within the tile */
  public readonly flags: ImdlFlags;
  /** A bounding box no larger than the tile's range, tightly enclosing the tile's geometry; or a null range if the tile is empty */
  public readonly contentRange: ElementAlignedBox3d;
  /** The chord tolerance in meters at which the tile's geometry was faceted */
  public readonly tolerance: number;
  /** The number of elements which contributed at least some geometry to the tile content */
  public readonly numElementsIncluded: number;
  /** The number of elements within the tile range which contributed no geometry to the tile content */
  public readonly numElementsExcluded: number;
  /** The total number of bytes in the binary tile data, including this header */
  public readonly tileLength: number;
  /** A bitfield wherein each set bit indicates an empty sub-volume. */
  public readonly emptySubRanges: number;

  public get versionMajor(): number { return this.version >>> 0x10; }
  public get versionMinor(): number { return (this.version & 0xffff) >>> 0; }

  public get isValid(): boolean { return TileFormat.IModel === this.format; }
  public get isReadableVersion(): boolean { return this.versionMajor <= CurrentImdlVersion.Major; }

  /** Deserialize a header from the binary data at the stream's current position.
   * If the binary data does not contain a valid header, the Header will be marked 'invalid'.
   */
  public constructor(stream: ByteStream) {
    super(stream);
    this.headerLength = stream.nextUint32;
    this.flags = stream.nextUint32;

    this.contentRange = new Range3d();
    nextPoint3d64FromByteStream(stream, this.contentRange.low);
    nextPoint3d64FromByteStream(stream, this.contentRange.high);

    this.tolerance = stream.nextFloat64;
    this.numElementsIncluded = stream.nextUint32;
    this.numElementsExcluded = stream.nextUint32;
    this.tileLength = stream.nextUint32;

    // empty sub-volume bit field introduced in format v02.00
    this.emptySubRanges = this.versionMajor >= 2 ? stream.nextUint32 : 0;

    // Skip any unprocessed bytes in header
    const remainingHeaderBytes = this.headerLength - stream.curPos;
    assert(remainingHeaderBytes >= 0);
    stream.advance(remainingHeaderBytes);

    if (stream.isPastTheEnd)
      this.invalidate();
  }
}

/** Header preceding the feature table embedded in an iMdl tile's content.
 * @internal
 */
export class FeatureTableHeader {
  public static readFrom(stream: ByteStream) {
    const length = stream.nextUint32;
    const maxFeatures = stream.nextUint32;
    const count = stream.nextUint32;
    return stream.isPastTheEnd ? undefined : new FeatureTableHeader(length, maxFeatures, count);
  }

  public static sizeInBytes = 12;

  private constructor(public readonly length: number,
    public readonly maxFeatures: number,
    public readonly count: number) { }
}
