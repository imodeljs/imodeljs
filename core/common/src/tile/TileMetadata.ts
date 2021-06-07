/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tile
 */

import {
  assert, ByteStream, compareBooleans, compareBooleansOrUndefined, compareNumbers, compareNumbersOrUndefined, compareStringsOrUndefined, Id64String,
} from "@bentley/bentleyjs-core";
import { Range3d, Vector3d } from "@bentley/geometry-core";
import { BatchType } from "../FeatureTable";
import { TileProps } from "../TileProps";
import { CurrentImdlVersion, FeatureTableHeader, ImdlFlags, ImdlHeader } from "./IModelTileIO";
import { TileReadError, TileReadStatus } from "./TileIO";

// cspell:ignore imdl mult bitfield

// NB: These constants correspond to those defined in Tile.cpp.
namespace Constants {
  export const tileScreenSize = 512;
  export const minToleranceRatioMultiplier = 2;
  export const minToleranceRatio = tileScreenSize * minToleranceRatioMultiplier;
  export const untransformedNodeValue = 0xffffffff;
}

/** Describes an iModel tile tree.
 * @internal
 */
export interface TileTreeMetadata {
  readonly modelId: Id64String;
  readonly is2d: boolean;
  readonly contentRange?: Range3d;
}

/** Describes the contents of an iModel tile.
 * @internal
 */
export interface TileContentMetadata {
  readonly contentRange: Range3d;
  readonly isLeaf: boolean;
  readonly sizeMultiplier?: number;
  readonly emptySubRangeMask: number;
}

/** Describes an iModel tile.
 * @internal
 */
export interface TileMetadata extends TileContentMetadata {
  readonly contentId: string;
  readonly range: Range3d;
}

/** @internal */
export interface TileOptions {
  readonly maximumMajorTileFormatVersion: number;
  readonly enableInstancing: boolean;
  readonly enableImprovedElision: boolean;
  readonly ignoreAreaPatterns: boolean;
  readonly enableExternalTextures: boolean;
  readonly useProjectExtents: boolean;
  readonly disableMagnification: boolean;
  readonly alwaysSubdivideIncompleteTiles: boolean;
}

/** @internal */
export const defaultTileOptions: TileOptions = Object.freeze({
  maximumMajorTileFormatVersion: CurrentImdlVersion.Major,
  enableInstancing: true,
  enableImprovedElision: true,
  ignoreAreaPatterns: false,
  enableExternalTextures: true,
  useProjectExtents: true,
  disableMagnification: false,
  alwaysSubdivideIncompleteTiles: false,
});

/** @internal */
export function getMaximumMajorTileFormatVersion(maxMajorVersion: number, formatVersion?: number): number {
  // The `formatVersion` input is from the backend, telling us precisely the maximum major+minor version it can produce.
  // Ensure we do not request tiles of a newer major version than backend can supply or it can read; and also limit major version
  // to that optionally configured by the app.
  let majorVersion = maxMajorVersion;
  if (undefined !== formatVersion)
    majorVersion = Math.min((formatVersion >>> 0x10), majorVersion);

  // Version number less than 1 is invalid - ignore
  majorVersion = Math.max(majorVersion, 1);

  // Version number greater than current known version ignored
  majorVersion = Math.min(majorVersion, CurrentImdlVersion.Major);

  // Version numbers are integers - round down
  return Math.max(Math.floor(majorVersion), 1);
}

/** Flags controlling the structure of a tile tree. The flags are part of the tile tree's Id.
 * @alpha
 */
export enum TreeFlags {
  None = 0,
  UseProjectExtents = 1 << 0, // Use project extents as the basis of the tile tree's range.
  EnforceDisplayPriority = 1 << 1, // For 3d plan projection models, group graphics into layers based on subcategory.
}

/** Describes a tile tree used to draw the contents of a model, possibly with embedded animation.
 * @internal
 */
export interface PrimaryTileTreeId {
  /** Describes the type of tile tree. */
  type: BatchType.Primary;
  /** Whether to include edges in tile content. */
  edgesRequired: boolean;
  /** Id of the [DisplayStyle]($backend) holding the [[RenderSchedule]] script to be applied to the tiles. */
  animationId?: Id64String;
  /** Id of the transform node within the [[RenderSchedule]] script to be applied to the tiles. */
  animationTransformNodeId?: number;
  /** If true, meshes within the tiles will be grouped into nodes based on the display priority associated with their subcategories,
   * for ensuring the graphics display with correct priority.
   */
  enforceDisplayPriority?: boolean;
  /** If defined, the compact string representation of a clip vector applied to the tiles to produce cut geometry at the intersections with the clip planes.
   * Any geometry *not* intersecting the clip planes is omitted from the tiles.
   * @see [ClipVector.toCompactString[($geometry-core).
   */
  sectionCut?: string;
}

/** Describes a tile tree that can classify the contents of other tile trees using the model's geometry.
 * @internal
 */
export interface ClassifierTileTreeId {
  type: BatchType.VolumeClassifier | BatchType.PlanarClassifier;
  expansion: number;
  animationId?: Id64String;
  animationTransformNodeId?: number;
}

function animationIdToString(animationId: Id64String, nodeId: number | undefined): string {
  if (undefined === nodeId)
    nodeId = Constants.untransformedNodeValue;

  return `A:${animationId}_#${nodeId.toString(16)}_`;
}

/** Describes the Id of an iModel tile tree.
 * @internal
 */
export type IModelTileTreeId = PrimaryTileTreeId | ClassifierTileTreeId;

/** Convert a tile tree Id to its string representation.
 * @internal
 */
export function iModelTileTreeIdToString(modelId: Id64String, treeId: IModelTileTreeId, options: TileOptions): string {
  let idStr = "";
  let flags = options.useProjectExtents ? TreeFlags.UseProjectExtents : TreeFlags.None;

  if (BatchType.Primary === treeId.type) {
    if (undefined !== treeId.animationId)
      idStr = `${idStr}${animationIdToString(treeId.animationId, treeId.animationTransformNodeId)}`;
    else if (treeId.enforceDisplayPriority) // animation and priority are currently mutually exclusive
      flags |= TreeFlags.EnforceDisplayPriority;

    const edges = treeId.edgesRequired ? "" : "E:0_";
    const sectionCut = treeId.sectionCut ? `S${treeId.sectionCut}s` : "";
    idStr = `${idStr}${edges}${sectionCut}`;
  } else {
    const typeStr = BatchType.PlanarClassifier === treeId.type ? "CP" : "C";
    idStr = `${idStr + typeStr}:${treeId.expansion.toFixed(6)}_`;

    if (BatchType.VolumeClassifier === treeId.type)
      flags |= TreeFlags.UseProjectExtents;

    if (undefined !== treeId.animationId)
      idStr = `${idStr}${animationIdToString(treeId.animationId, treeId.animationTransformNodeId)}`;
  }

  const version = getMaximumMajorTileFormatVersion(options.maximumMajorTileFormatVersion);
  if (version >= 4) {
    const prefix = `${version.toString(16)}_${flags.toString(16)}-`;
    idStr = prefix + idStr;
  }

  return idStr + modelId;
}

/** Ordinal comparison of two tile tree Ids, e.g., for use in sorted containers.
 * @internal
 */
export function compareIModelTileTreeIds(lhs: IModelTileTreeId, rhs: IModelTileTreeId): number {
  let cmp = compareNumbers(lhs.type, rhs.type);
  if (0 === cmp) {
    cmp = compareStringsOrUndefined(lhs.animationId, rhs.animationId);
    if (0 === cmp)
      cmp = compareNumbersOrUndefined(lhs.animationTransformNodeId, rhs.animationTransformNodeId);
  }

  if (0 !== cmp)
    return cmp;

  // NB: The redundant checks on BatchType below are to satisfy compiler.
  assert(lhs.type === rhs.type);
  if (BatchType.Primary === lhs.type && BatchType.Primary === rhs.type) {
    cmp = compareBooleans(lhs.edgesRequired, rhs.edgesRequired);
    if (0 === cmp) {
      cmp = compareBooleansOrUndefined(lhs.enforceDisplayPriority, rhs.enforceDisplayPriority);
      if (0 === cmp)
        cmp = compareStringsOrUndefined(lhs.sectionCut, rhs.sectionCut);
    }
  } else if (BatchType.Primary !== lhs.type && BatchType.Primary !== rhs.type) {
    cmp = compareNumbers(lhs.expansion, rhs.expansion);
  }

  return cmp;
}

/** Flags controlling how tile content is produced. The flags are part of the ContentId.
 * @alpha
 */
export enum ContentFlags {
  None = 0,
  AllowInstancing = 1 << 0,
  ImprovedElision = 1 << 1,
  IgnoreAreaPatterns = 1 << 2,
  ExternalTextures = 1 << 3,
}

/** Describes the components of a tile's content Id.
 *
 * The depth specifies how many subdivisions from the root tile are to be performed to reach the sub-volume of interest.
 *
 * The i, j, and k parameters specify how to subdivide the tile's volume. Each sub-division is performed along the longest axis of the
 * volume. The volume is first sub-divided based on `i`, then the result sub-divided based on `j`, and finally that result sub-divided
 * based on `k`.
 *
 * The multiplier is an integer - generally a power of two - multiplied by the screen size of a tile (512 pixels) used to
 * produce a higher-resolution tile for the same volume.
 * @internal
 */
interface ContentIdSpec {
  depth: number;
  i: number;
  j: number;
  k: number;
  multiplier: number;
}

/** Contains logic for working with tile content Ids according to a specific content Id scheme. Which scheme is used depends on
 * the major version of the tile format.
 * @internal
 */
export abstract class ContentIdProvider {
  public readonly majorFormatVersion: number;
  public readonly contentFlags: ContentFlags;

  protected constructor(formatVersion: number, contentFlags: ContentFlags) {
    this.majorFormatVersion = formatVersion;
    this.contentFlags = contentFlags;
  }

  public get rootContentId(): string {
    return this.computeId(0, 0, 0, 0, 1);
  }

  public idFromParentAndMultiplier(parentId: string, multiplier: number): string {
    const lastSepPos = parentId.lastIndexOf(this._separator);
    assert(-1 !== lastSepPos);
    return parentId.substring(0, lastSepPos + 1) + multiplier.toString(16);
  }

  public specFromId(id: string): ContentIdSpec {
    const parts = id.split(this._separator);
    const len = parts.length;
    assert(len >= 5);
    return {
      depth: parseInt(parts[len - 5], 16),
      i: parseInt(parts[len - 4], 16),
      j: parseInt(parts[len - 3], 16),
      k: parseInt(parts[len - 2], 16),
      multiplier: parseInt(parts[len - 1], 16),
    };
  }

  public idFromSpec(spec: ContentIdSpec): string {
    return this.computeId(spec.depth, spec.i, spec.j, spec.k, spec.multiplier);
  }

  protected join(depth: number, i: number, j: number, k: number, mult: number): string {
    const sep = this._separator;
    return depth.toString(16) + sep + i.toString(16) + sep + j.toString(16) + sep + k.toString(16) + sep + mult.toString(16);
  }

  protected abstract get _separator(): string;
  protected abstract computeId(depth: number, i: number, j: number, k: number, mult: number): string;

  /** formatVersion is the maximum major version supported by the back-end supplying the tile tree.
   * Must ensure front-end does not request tiles of a format the back-end cannot supply, and back-end does
   * not supply tiles of a format the front-end doesn't recognize.
   */
  public static create(allowInstancing: boolean, options: TileOptions, formatVersion?: number): ContentIdProvider {
    const majorVersion = getMaximumMajorTileFormatVersion(options.maximumMajorTileFormatVersion, formatVersion);
    assert(majorVersion > 0);
    assert(Math.floor(majorVersion) === majorVersion);
    switch (majorVersion) {
      case 0:
      case 1:
        return new ContentIdV1Provider(majorVersion);
      case 2:
      case 3:
        return new ContentIdV2Provider(majorVersion, allowInstancing, options);
      default:
        return new ContentIdV4Provider(allowInstancing, options, majorVersion);
    }
  }
}

/** The original (major version 1) tile format used a content Id scheme of the format
 * `depth/i/j/k/multiplier`.
 * @internal
 */
class ContentIdV1Provider extends ContentIdProvider {
  public constructor(majorVersion: number) {
    super(majorVersion, ContentFlags.None);
  }

  protected get _separator() { return "/"; }
  protected computeId(depth: number, i: number, j: number, k: number, mult: number): string {
    return this.join(depth, i, j, k, mult);
  }
}

/** Tile formats 2 and 3 use a content Id scheme encoding styling flags and the major format version
 * into the content Id, of the format `_majorVersion_flags_depth_i_j_k_multiplier`.
 * @internal
 */
class ContentIdV2Provider extends ContentIdProvider {
  private readonly _prefix: string;

  public constructor(majorVersion: number, allowInstancing: boolean, options: TileOptions) {
    const flags = (allowInstancing && options.enableInstancing) ? ContentFlags.AllowInstancing : ContentFlags.None;
    super(majorVersion, flags);
    this._prefix = this._separator + majorVersion.toString(16) + this._separator + flags.toString(16) + this._separator;
  }

  protected get _separator() { return "_"; }
  protected computeId(depth: number, i: number, j: number, k: number, mult: number): string {
    return this._prefix + this.join(depth, i, j, k, mult);
  }
}

/** Tile formats 4+ encode styling flags but not major format version. (The version is specified by the tile tree's Id).
 * Format: `-flags-depth-i-j-k-multiplier`.
 * @internal
 */
class ContentIdV4Provider extends ContentIdProvider {
  private readonly _prefix: string;

  public constructor(allowInstancing: boolean, options: TileOptions, majorVersion: number) {
    let flags = (allowInstancing && options.enableInstancing) ? ContentFlags.AllowInstancing : ContentFlags.None;
    if (options.enableImprovedElision)
      flags = flags | ContentFlags.ImprovedElision;

    if (options.ignoreAreaPatterns)
      flags = flags | ContentFlags.IgnoreAreaPatterns;

    if (options.enableExternalTextures)
      flags = flags | ContentFlags.ExternalTextures;

    super(majorVersion, flags);
    this._prefix = this._separator + flags.toString(16) + this._separator;
  }

  protected get _separator() { return "-"; }
  protected computeId(depth: number, i: number, j: number, k: number, mult: number): string {
    return this._prefix + this.join(depth, i, j, k, mult);
  }
}

/** @internal */
export function bisectTileRange3d(range: Range3d, takeUpper: boolean): void {
  const diag = range.diagonal();
  const pt = takeUpper ? range.high : range.low;
  if (diag.x > diag.y && diag.x > diag.z)
    pt.x = (range.low.x + range.high.x) / 2.0;
  else if (diag.y > diag.z)
    pt.y = (range.low.y + range.high.y) / 2.0;
  else
    pt.z = (range.low.z + range.high.z) / 2.0;
}

/** @internal */
export function bisectTileRange2d(range: Range3d, takeUpper: boolean): void {
  const diag = range.diagonal();
  const pt = takeUpper ? range.high : range.low;
  if (diag.x > diag.y)
    pt.x = (range.low.x + range.high.x) / 2.0;
  else
    pt.y = (range.low.y + range.high.y) / 2.0;
}

/** Given a description of a tile, compute the ranges which would result from sub-dividing its range into 4 or 8 sub-volumes.
 * @internal
 */
export function computeChildTileRanges(tile: TileMetadata, root: TileTreeMetadata): Array<{ range: Range3d, isEmpty: boolean }> {
  const emptyMask = tile.emptySubRangeMask;
  const is2d = root.is2d;
  const bisectRange = is2d ? bisectTileRange2d : bisectTileRange3d;

  const ranges: Array<{ range: Range3d, isEmpty: boolean }> = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < (is2d ? 1 : 2); k++) {
        const emptyBit = 1 << (i + j * 2 + k * 4);
        const isEmpty = 0 !== (emptyMask & emptyBit);

        const range = tile.range.clone();
        bisectRange(range, 0 === i);
        bisectRange(range, 0 === j);
        if (!is2d)
          bisectRange(range, 0 === k);

        ranges.push({ range, isEmpty });
      }
    }
  }

  return ranges;
}

/** Given a description of the parent tile, obtain the properties of its child tiles, and the number of empty children.
 * @internal
 */
export function computeChildTileProps(parent: TileMetadata, idProvider: ContentIdProvider, root: TileTreeMetadata): { children: TileProps[], numEmpty: number } {
  let numEmpty = 0;
  const children: TileProps[] = [];

  // Leaf nodes have no children
  if (parent.isLeaf)
    return { children, numEmpty };

  // One child, same volume as parent, but higher-resolution.
  if (undefined !== parent.sizeMultiplier) {
    const sizeMultiplier = parent.sizeMultiplier * 2;
    const contentId = idProvider.idFromParentAndMultiplier(parent.contentId, sizeMultiplier);
    children.push({
      contentId,
      range: parent.range,
      contentRange: parent.contentRange,
      sizeMultiplier,
      isLeaf: false,
      maximumSize: Constants.tileScreenSize,
    });

    return { children, numEmpty };
  }

  // Sub-divide parent's range into 4 (for 2d trees) or 8 (for 3d trees) child tiles.
  const parentSpec = idProvider.specFromId(parent.contentId);
  const childSpec: ContentIdSpec = { ...parentSpec };
  childSpec.depth = parentSpec.depth + 1;

  // This mask is a bitfield in which an 'on' bit indicates sub-volume containing no geometry.
  // Don't bother creating children or requesting content for such empty volumes.
  const emptyMask = parent.emptySubRangeMask;

  // Spatial tree range == project extents; content range == model range.
  // Trivially reject children whose ranges are entirely outside model range.
  let treeContentRange = root.contentRange;
  if (undefined !== treeContentRange && treeContentRange.containsRange(parent.range)) {
    // Parent is wholly within model range - don't bother testing child ranges against it.
    treeContentRange = undefined;
  }

  const is2d = root.is2d;
  const bisectRange = is2d ? bisectTileRange2d : bisectTileRange3d;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < (is2d ? 1 : 2); k++) {
        const emptyBit = 1 << (i + j * 2 + k * 4);
        if (0 !== (emptyMask & emptyBit)) {
          // volume is known to contain no geometry.
          ++numEmpty;
          continue;
        }

        const range = parent.range.clone();
        bisectRange(range, 0 === i);
        bisectRange(range, 0 === j);
        if (!is2d)
          bisectRange(range, 0 === k);

        if (undefined !== treeContentRange && !range.intersectsRange(treeContentRange)) {
          // volume is within project extents but entirely outside model range
          ++numEmpty;
          continue;
        }

        childSpec.i = parentSpec.i * 2 + i;
        childSpec.j = parentSpec.j * 2 + j;
        childSpec.k = parentSpec.k * 2 + k;

        const childId = idProvider.idFromSpec(childSpec);
        children.push({ contentId: childId, range, maximumSize: Constants.tileScreenSize });
      }
    }
  }

  return { children, numEmpty };
}

/** @internal */
export interface TileContentDescription extends TileContentMetadata {
  readonly featureTableStartPos: number;
}

/** Deserializes tile content metadata.
 * @throws [[TileReadError]]
 * @internal
 */
export function readTileContentDescription(stream: ByteStream, sizeMultiplier: number | undefined, is2d: boolean, options: TileOptions, isVolumeClassifier: boolean): TileContentDescription {
  stream.reset();

  const header = new ImdlHeader(stream);
  if (!header.isValid)
    throw new TileReadError(TileReadStatus.InvalidHeader);
  else if (!header.isReadableVersion)
    throw new TileReadError(TileReadStatus.NewerMajorVersion);

  // Skip the feature table.
  const featureTableStartPos = stream.curPos;
  const ftHeader = FeatureTableHeader.readFrom(stream);
  if (undefined === ftHeader)
    throw new TileReadError(TileReadStatus.InvalidFeatureTable);

  stream.curPos = featureTableStartPos + ftHeader.length;

  // Determine subdivision based on header data.
  const completeTile = 0 === (header.flags & ImdlFlags.Incomplete);
  const emptyTile = completeTile && 0 === header.numElementsIncluded && 0 === header.numElementsExcluded;
  let isLeaf = (emptyTile || isVolumeClassifier); // Current classifier algorithm supports only a single tile.
  if (!isLeaf) {
    // Non-spatial (2d) models are of arbitrary scale and contain geometry like line work and especially text which
    // can be adversely affected by quantization issues when zooming in closely.
    const maxLeafTolerance = 1.0;

    // Must sub-divide if tile explicitly specifies...
    let canSkipSubdivision = 0 === (header.flags & ImdlFlags.DisallowMagnification);
    // ...or in 2d, or if app explicitly disabled magnification, or tolerance large enough to risk quantization error...
    canSkipSubdivision = canSkipSubdivision && !is2d && !options.disableMagnification && header.tolerance <= maxLeafTolerance;
    // ...or app specifies incomplete tiles must always be sub-divided.
    canSkipSubdivision = canSkipSubdivision && (completeTile || !options.alwaysSubdivideIncompleteTiles);
    if (canSkipSubdivision) {
      const minElementsPerTile = 100;
      if (completeTile && 0 === header.numElementsExcluded && header.numElementsIncluded <= minElementsPerTile) {
        const containsCurves = 0 !== (header.flags & ImdlFlags.ContainsCurves);
        if (!containsCurves)
          isLeaf = true;
        else if (undefined === sizeMultiplier)
          sizeMultiplier = 1.0;
      } else if (undefined === sizeMultiplier && header.numElementsIncluded + header.numElementsExcluded <= minElementsPerTile) {
        sizeMultiplier = 1.0;
      }
    }
  }

  return {
    featureTableStartPos,
    contentRange: header.contentRange,
    isLeaf,
    sizeMultiplier,
    emptySubRangeMask: header.emptySubRanges,
  };
}

const scratchRangeDiagonal = new Vector3d();

/** Compute the chord tolerance for the specified tile of the given range with the specified size multiplier.
 * @internal
 */
export function computeTileChordTolerance(tile: TileMetadata, is3d: boolean): number {
  if (tile.range.isNull)
    return 0;

  const diagonal = tile.range.diagonal(scratchRangeDiagonal);
  const diagDist = is3d ? diagonal.magnitude() : diagonal.magnitudeXY();

  const mult = Math.max(tile.sizeMultiplier ?? 1, 1);
  return diagDist / (Constants.minToleranceRatio * Math.max(1, mult));
}

/** Deserializes tile metadata.
 * @internal
 */
export class TileMetadataReader {
  private readonly _is2d: boolean;
  private readonly _isVolumeClassifier: boolean;
  private readonly _options: TileOptions;

  public constructor(type: BatchType, is2d: boolean, options: TileOptions) {
    this._is2d = is2d;
    this._isVolumeClassifier = BatchType.VolumeClassifier === type;
    this._options = options;
  }

  /** Produce metadata from the specified tile content.
   * @throws [[TileReadError]]
   */
  public read(stream: ByteStream, props: TileProps): TileMetadata {
    const content = readTileContentDescription(stream, props.sizeMultiplier, this._is2d, this._options, this._isVolumeClassifier);
    return {
      contentRange: content.contentRange,
      isLeaf: content.isLeaf,
      sizeMultiplier: content.sizeMultiplier,
      emptySubRangeMask: content.emptySubRangeMask,
      range: Range3d.fromJSON(props.range),
      contentId: props.contentId,
    };
  }
}
