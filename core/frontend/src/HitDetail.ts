/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LocatingElements
 */
import { Id64 } from "@bentley/bentleyjs-core";
import { Arc3d, CurvePrimitive, LineSegment3d, LineString3d, Path, Point3d, Transform, Vector3d, XYZProps } from "@bentley/geometry-core";
import { GeometryClass, LinePixels } from "@bentley/imodeljs-common";
import { IModelApp } from "./IModelApp";
import { IModelConnection } from "./IModelConnection";
import { GraphicType } from "./render/GraphicBuilder";
import { IconSprites, Sprite } from "./Sprites";
import { DecorateContext } from "./ViewContext";
import { ScreenViewport } from "./Viewport";

/** @public */
export enum SnapMode {
  Nearest = 1,
  NearestKeypoint = 1 << 1,
  MidPoint = 1 << 2,
  Center = 1 << 3,
  Origin = 1 << 4,
  Bisector = 1 << 5,
  Intersection = 1 << 6,
}

/** @public */
export enum SnapHeat {
  None = 0,
  NotInRange = 1,   // "of interest", but out of range
  InRange = 2,
}

/** The procedure that generated this Hit.
 * @public
 */
export enum HitSource {
  None = 0,
  FromUser = 1,
  MotionLocate = 2,
  AccuSnap = 3,
  TentativeSnap = 4,
  DataPoint = 5,
  Application = 6,
  EditAction = 7,
  EditActionSS = 8,
}

/** What was being tested to generate this hit. This is not the element or
 * GeometricPrimitive that generated the Hit, it is an indication of whether it is an edge or interior hit.
 * @public
 */
export enum HitGeomType {
  None = 0,
  Point = 1,
  Segment = 2,
  Curve = 3,
  Arc = 4,
  Surface = 5,
}

/** Classification of GeometricPrimitive that generated the Hit.
 * @public
 */
export enum HitParentGeomType {
  None = 0,
  Wire = 1,
  Sheet = 2,
  Solid = 3,
  Mesh = 4,
  Text = 5,
}

/** @public */
export enum HitPriority {
  WireEdge = 0,
  PlanarEdge = 1,
  NonPlanarEdge = 2,
  SilhouetteEdge = 3,
  PlanarSurface = 4,
  NonPlanarSurface = 5,
  Unknown = 6,
}

/** @public */
export enum HitDetailType {
  Hit = 1,
  Snap = 2,
  Intersection = 3,
}

/** A HitDetail stores the result when locating geometry displayed in a view.
 * It holds an approximate location on an element (or decoration) from a *pick*.
 * @public
 */
export class HitDetail {
  private readonly _iModel?: IModelConnection;
  /** @internal chiefly for debugging. */
  public readonly tileId?: string;
  /** @alpha */
  public readonly isClassifier: boolean;

  /** Create a new HitDetail from the inputs to and results of a locate operation.
   * @param testPoint The world coordinate space point that was used as the locate point.
   * @param viewport The view the locate operation was performed in.
   * @param hitSource The procedure that requested the locate operation.
   * @param hitPoint The approximate world coordinate location on the geometry identified by this HitDetail.
   * @param sourceId The source of the geometry, either a persistent element id or pickable decoration id.
   * @param priority The hit geometry priority/classification.
   * @param distXY The xy distance to hit in view coordinates.
   * @param distFraction The near plane distance fraction to hit.
   * @param subCategoryId The SubCategory for a persistent element hit.
   * @param geometryClass The GeometryClass for a persistent element hit.
   * @param iModel The IModelConnection from which the hit originated. This should almost always be left undefined, unless the hit is known to have originated from an iModel other than the one associated with the viewport.
   * @param modelId Optionally the Id of the [[ModelState]] from which the hit originated.
   * @param tileId Optionally the Id of the Tile from which the hit originated.
   * @param isClassifier Optionally whether the hit originated from a reality model classification.
   */
  public constructor(public readonly testPoint: Point3d, public readonly viewport: ScreenViewport, public readonly hitSource: HitSource,
    public readonly hitPoint: Point3d, public readonly sourceId: string, public readonly priority: HitPriority, public readonly distXY: number, public readonly distFraction: number,
    public readonly subCategoryId?: string, public readonly geometryClass?: GeometryClass, public readonly modelId?: string, iModel?: IModelConnection, tileId?: string, isClassifier?: boolean) {
    this._iModel = iModel;
    this.tileId = tileId;
    this.isClassifier = undefined !== isClassifier ? isClassifier : false;
  }

  /** Get the type of HitDetail.
   * @returns HitDetailType.Hit if this is a HitDetail, HitDetailType.Snap if it is a SnapDetail
   */
  public getHitType(): HitDetailType { return HitDetailType.Hit; }

  /** Get the *hit point* for this HitDetail. Returns the approximate point on the element that caused the hit when not a SnapDetail or IntersectDetail.
   * For a snap that is *hot*, the *exact* point on the Element for the snap mode is returned, otherwise the close point on the hit geometry is returned.
   */
  public getPoint(): Point3d { return this.hitPoint; }

  /** Determine if this HitPoint is from the same source as another HitDetail. */
  public isSameHit(otherHit?: HitDetail): boolean { return (undefined !== otherHit && this.sourceId === otherHit.sourceId && this.iModel === otherHit.iModel); }
  /** Return whether sourceId is for a persistent element and not a pickable decoration. */
  public get isElementHit(): boolean { return !Id64.isInvalid(this.sourceId) && !Id64.isTransient(this.sourceId); }
  // return whether the sourceId is for a model (reality models etc.)
  public get isModelHit(): boolean {
    return this.modelId === this.sourceId;
  }
  // return whether the hit point is from map.
  public get isMapHit(): boolean { return undefined !== this.viewport.mapLayerFromHit(this); }

  /** Create a deep copy of this HitDetail */
  public clone(): HitDetail {
    const val = new HitDetail(this.testPoint, this.viewport, this.hitSource, this.hitPoint, this.sourceId, this.priority, this.distXY, this.distFraction, this.subCategoryId, this.geometryClass, this.modelId, this._iModel, this.tileId, this.isClassifier);
    return val;
  }

  /** Draw this HitDetail as a Decoration. Causes the picked element to *flash* */
  public draw(_context: DecorateContext) {
    this.viewport.flashedId = this.sourceId;
  }

  /** Get the tooltip content for this HitDetail. */
  public async getToolTip(): Promise<HTMLElement | string> {
    let toolTipPromise = this.isElementHit ? IModelApp.viewManager.overrideElementToolTip(this) : IModelApp.viewManager.getDecorationToolTip(this);
    for (const toolTipProvider of IModelApp.viewManager.toolTipProviders)
      toolTipPromise = toolTipProvider.augmentToolTip(this, toolTipPromise);
    return toolTipPromise;
  }

  /** The IModelConnection from which the hit originated. In some cases this may not be the same as the iModel associated with the Viewport -
   * for example, if a [[TiledGraphicsProvider]] is used to display graphics from a different iModel in the viewport.
   * This HitDetail's element, subcategory, and model Ids are defined in the context of this IModelConnection.
   */
  public get iModel(): IModelConnection { return undefined !== this._iModel ? this._iModel : this.viewport.iModel; }

  /** Returns true if this hit originated from an [[IModelConnection]] other than the one associated with the [[Viewport]].
   * @see [[iModel]].
   */
  public get isExternalIModelHit(): boolean { return this.iModel !== this.viewport.iModel; }
}

/** A SnapDetail is generated from the result of [IModelDb.requestSnap]($backend) call. In addition to the HitDetail about the reason the element was *picked*,
 * it holds the *exact* point on the element from the snapping logic, plus additional information that varies with the type of element and snap mode.
 * @public
 */
export class SnapDetail extends HitDetail {
  /** A sprite to show the user the type of snap performed */
  public sprite?: Sprite;
  /** HitPoint adjusted by snap */
  public readonly snapPoint: Point3d;
  /** AccuSnap/AccuDraw can adjust the point after the snap. */
  public readonly adjustedPoint: Point3d;
  /** Curve primitive for snap. */
  public primitive?: CurvePrimitive;
  /** Surface normal at snapPoint */
  public normal?: Vector3d;
  /** The HitGeomType of this SnapDetail */
  public geomType?: HitGeomType;
  /** The HitGeomType of this SnapDetail */
  public parentGeomType?: HitParentGeomType;

  /** Constructor for SnapDetail.
   * @param from The HitDetail that created this snap
   * @param snapMode The SnapMode used to create this SnapDetail
   * @param heat The SnapHeat of this SnapDetail
   * @param snapPoint The snapped point in the element
   */
  public constructor(from: HitDetail, public snapMode: SnapMode = SnapMode.Nearest, public heat: SnapHeat = SnapHeat.None, snapPoint?: XYZProps) {
    super(from.testPoint, from.viewport, from.hitSource, from.hitPoint, from.sourceId, from.priority, from.distXY, from.distFraction, from.subCategoryId, from.geometryClass, from.modelId, from.iModel, from.tileId, from.isClassifier);
    this.snapPoint = Point3d.fromJSON(snapPoint ? snapPoint : from.hitPoint);
    this.adjustedPoint = this.snapPoint.clone();
    this.sprite = IconSprites.getSpriteFromUrl(SnapDetail.getSnapSpriteUrl(snapMode));
  }

  /** Returns `HitDetailType.Snap` */
  public override getHitType(): HitDetailType { return HitDetailType.Snap; }
  /** Get the snap point if this SnapDetail is *hot*, the pick point otherwise. */
  public override getPoint(): Point3d { return this.isHot ? this.snapPoint : super.getPoint(); }
  /** Return true if the pick point was closer than the snap aperture from the generated snap point. */
  public get isHot(): boolean { return this.heat !== SnapHeat.None; }
  /** Determine whether the [[adjustedPoint]] is different than the [[snapPoint]]. This happens, for example, when points are adjusted for grids, acs plane snap, and AccuDraw. */
  public get isPointAdjusted(): boolean { return !this.adjustedPoint.isExactEqual(this.snapPoint); }
  /** Change the snap point. */
  public setSnapPoint(point: Point3d, heat: SnapHeat) { this.snapPoint.setFrom(point); this.adjustedPoint.setFrom(point); this.heat = heat; }

  /** Set curve primitive and HitGeometryType for this SnapDetail. */
  public setCurvePrimitive(primitive?: CurvePrimitive, localToWorld?: Transform, geomType?: HitGeomType): void {
    this.primitive = primitive;
    this.geomType = undefined;

    // Only HitGeomType.Point and HitGeomType.Surface are valid without a curve primitive.
    if (undefined === this.primitive) {
      if (HitGeomType.Point === geomType || HitGeomType.Surface === geomType)
        this.geomType = geomType;
      return;
    }

    if (undefined !== localToWorld)
      this.primitive.tryTransformInPlace(localToWorld);

    if (this.primitive instanceof Arc3d)
      this.geomType = HitGeomType.Arc;
    else if (this.primitive instanceof LineSegment3d)
      this.geomType = HitGeomType.Segment;
    else if (this.primitive instanceof LineString3d)
      this.geomType = HitGeomType.Segment;
    else
      this.geomType = HitGeomType.Curve;

    // Set curve primitive geometry type override...
    //  - HitGeomType.Point with arc/ellipse denotes center.
    //  - HitGeomType.Surface with any curve primitive denotes an interior hit.
    if (undefined !== geomType && HitGeomType.None !== geomType)
      this.geomType = geomType;
  }

  /** Make a copy of this SnapDetail. */
  public override clone(): SnapDetail {
    const val = new SnapDetail(this, this.snapMode, this.heat, this.snapPoint);
    val.sprite = this.sprite;
    val.geomType = this.geomType;
    val.parentGeomType = this.parentGeomType;
    val.adjustedPoint.setFrom(this.adjustedPoint);
    if (undefined !== this.primitive)
      val.primitive = this.primitive.clone() as CurvePrimitive;
    if (undefined !== this.normal)
      val.normal = this.normal.clone();
    return val;
  }

  public getCurvePrimitive(singleSegment: boolean = true): CurvePrimitive | undefined {
    if (!singleSegment || undefined === this.primitive)
      return this.primitive;

    if (this.primitive instanceof LineString3d) {
      const ls = this.primitive;
      if (ls.points.length > 2) {
        const loc = ls.closestPoint(this.snapPoint, false);
        const nSegments = ls.points.length - 1;
        const uSegRange = (1.0 / nSegments);
        let segmentNo = Math.floor(loc.fraction / uSegRange);
        if (segmentNo >= nSegments)
          segmentNo = nSegments - 1;
        return LineSegment3d.create(ls.points[segmentNo], ls.points[segmentNo + 1]);
      }
    }

    return this.primitive;
  }

  public override draw(context: DecorateContext) {
    if (undefined !== this.primitive) {
      let singleSegment = false;
      switch (this.snapMode) {
        case SnapMode.Center:
        case SnapMode.Origin:
        case SnapMode.Bisector:
          break; // Snap point for these is computed using entire linestring, not just the hit segment...

        default: {
          singleSegment = true;
          break;
        }
      }

      const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
      const outline = context.viewport.hilite.color.adjustedForContrast(context.viewport.view.backgroundColor, 50);
      const centerLine = context.viewport.hilite.color.adjustedForContrast(outline, 175);
      const path = Path.create(this.getCurvePrimitive(singleSegment)!);

      builder.setSymbology(outline, outline, 6);
      builder.addPath(path);

      builder.setSymbology(centerLine, centerLine, 2);
      builder.addPath(path);

      context.addDecorationFromBuilder(builder);
      return;
    }
    super.draw(context);
  }

  private static getSnapSpriteUrl(snapType: SnapMode): string {
    switch (snapType) {
      case SnapMode.Nearest: return "sprites/SnapPointOn.png";
      case SnapMode.NearestKeypoint: return "sprites/SnapKeypoint.png";
      case SnapMode.MidPoint: return "sprites/SnapMidpoint.png";
      case SnapMode.Center: return "sprites/SnapCenter.png";
      case SnapMode.Origin: return "sprites/SnapOrigin.png";
      case SnapMode.Bisector: return "sprites/SnapBisector.png";
      case SnapMode.Intersection: return "sprites/SnapIntersection.png";
    }
    return "";
  }
}

/** @public */
export class IntersectDetail extends SnapDetail {
  public constructor(from: SnapDetail, heat: SnapHeat = SnapHeat.None, snapPoint: XYZProps, public readonly otherPrimitive: CurvePrimitive, public readonly otherId: string) {
    super(from, SnapMode.Intersection, heat, snapPoint);
    this.primitive = from.primitive;
    this.normal = from.normal; // Preserve normal from primary snap location for AccuDraw smart rotation...
  }

  public override draw(context: DecorateContext) {
    if (undefined !== this.primitive && undefined !== this.otherPrimitive) {
      const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
      const outline = context.viewport.hilite.color.adjustedForContrast(context.viewport.view.backgroundColor, 50);
      const centerLine = context.viewport.hilite.color.adjustedForContrast(outline, 175);
      const path1 = Path.create(this.primitive);
      const path2 = Path.create(this.otherPrimitive);

      builder.setSymbology(outline, outline, 6);
      builder.addPath(path1);
      builder.addPath(path2);

      builder.setSymbology(centerLine, centerLine, 2);
      builder.addPath(path1);
      builder.setSymbology(centerLine, centerLine, 2, LinePixels.Code2);
      builder.addPath(path2);

      context.addDecorationFromBuilder(builder);
      return;
    }
    super.draw(context);
  }
}

/** The result of a "locate" is a sorted list of objects that satisfied the search criteria (a HitList). Earlier hits in the list
 * are somehow *better* than those later on.
 * @public
 */
export class HitList<T extends HitDetail> {
  public hits: T[] = [];
  public currHit = -1;
  public get length(): number { return this.hits.length; }
  public empty(): void { this.hits.length = 0; this.currHit = -1; }
  public resetCurrentHit(): void { this.currHit = -1; }

  /** Get a hit from a particular index into a HitList
   * return the requested hit from the HitList or undefined
   */
  public getHit(hitNum: number): T | undefined {
    if (hitNum < 0) hitNum = this.length - 1;
    return (hitNum >= this.length) ? undefined : this.hits[hitNum];
  }

  /** When setting one or more indices to undefined you must call dropNulls afterwards */
  public setHit(i: number, p: T | undefined): void {
    if (i < 0 || i >= this.length)
      return;
    this.hits[i] = p!;
  }

  public dropNulls(): void {
    const hits = this.hits;
    this.hits = [];
    for (const hit of hits)
      this.hits.push(hit);
  }

  public getNextHit(): T | undefined { this.currHit++; return this.getCurrentHit(); }
  public getCurrentHit(): T | undefined { return -1 === this.currHit ? undefined : this.getHit(this.currHit); }

  public setCurrentHit(hit: T): void {
    this.resetCurrentHit();
    for (let thisHit; undefined !== (thisHit = this.getNextHit());) {
      if (thisHit === hit)
        return;
    }
  }

  /** remove the current hit from the list. */
  public removeCurrentHit() { this.removeHit(this.currHit); }

  /** remove a hit in the list. */
  public removeHit(hitNum: number) {
    if (hitNum < 0)                   // Support -1 == END
      hitNum = this.length - 1;

    if (hitNum <= this.currHit)
      this.currHit = -1;

    if (hitNum >= this.length)        // Locate calls GetNextHit, which increments currHit, until it goes beyond the end of size of the array.
      return;                         // Then Reset call RemoteCurrentHit, which passes in currHit. When it is out of range, we do nothing.

    this.hits.splice(hitNum, 1);
  }

  /** search through list and remove any hits that contain a specified element id. */
  public removeHitsFrom(sourceId: string): boolean {
    let removedOne = false;

    // walk backwards through list so we don't have to worry about what happens on remove
    for (let i = this.length - 1; i >= 0; i--) {
      const thisHit = this.hits[i];
      if (thisHit && sourceId === thisHit.sourceId) {
        removedOne = true;
        this.removeHit(i);
      }
    }
    return removedOne;
  }

  private getPriorityZOverride(priority: HitPriority): number {
    switch (priority) {
      case HitPriority.WireEdge:
      case HitPriority.PlanarEdge:
      case HitPriority.NonPlanarEdge:
        return 0;
      case HitPriority.SilhouetteEdge:
        return 1;
      case HitPriority.PlanarSurface:
      case HitPriority.NonPlanarSurface:
        return 2;
      default:
        return 3;
    }
  }

  /** compare two hits for insertion into list. */
  public compare(hit1: HitDetail | undefined, hit2: HitDetail | undefined): -1 | 1 | 0 {
    if (!hit1 || !hit2)
      return 0;

    const zOverride1 = this.getPriorityZOverride(hit1.priority);
    const zOverride2 = this.getPriorityZOverride(hit2.priority);

    // Prefer edges over surfaces, this is more important than z because we know the edge isn't obscured...
    if (zOverride1 < zOverride2) return -1;
    if (zOverride1 > zOverride2) return 1;

    // Compare xy distance from pick point, prefer hits closer to center...
    if (hit1.distXY < hit2.distXY) return -1;
    if (hit1.distXY > hit2.distXY) return 1;

    // Compare distance fraction, prefer hits closer to eye...
    if (hit1.distFraction > hit2.distFraction) return -1;
    if (hit1.distFraction < hit2.distFraction) return 1;

    // Compare geometry class, prefer path/region hits over surface hits when all else is equal...
    if (hit1.priority < hit2.priority) return -1;
    if (hit1.priority > hit2.priority) return 1;

    return 0;
  }

  /** Add a new hit to the list. Hits are sorted according to their priority and distance. */
  public addHit(newHit: T): number {
    if (0 === this.hits.length) {
      this.hits.push(newHit);
      return 0;
    }
    let index = 0;
    for (; index < this.hits.length; ++index) {
      const oldHit = this.hits[index];
      const comparison = this.compare(newHit, oldHit);
      if (comparison < 0)
        break;
    }

    this.hits.splice(index, 0, newHit);
    return index;
  }

  /** Insert a new hit into the list at the supplied index. */
  public insertHit(i: number, hit: T): void {
    if (i < 0 || i >= this.length)
      this.hits.push(hit);
    else
      this.hits.splice(i, 0, hit);
  }
}
