/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LocatingElements
 */

import { BeDuration } from "@bentley/bentleyjs-core";
import { CurveCurve, CurvePrimitive, GeometryQuery, IModelJson as GeomJson, Point2d, Point3d, Transform, Vector3d, XAndY } from "@bentley/geometry-core";
import { SnapRequestProps } from "@bentley/imodeljs-common";
import { ElementLocateManager, HitListHolder, LocateAction, LocateFilterStatus, LocateResponse, SnapStatus } from "./ElementLocateManager";
import { HitDetail, HitDetailType, HitGeomType, HitList, HitPriority, HitSource, IntersectDetail, SnapDetail, SnapHeat, SnapMode } from "./HitDetail";
import { IModelApp } from "./IModelApp";
import { CanvasDecoration } from "./render/CanvasDecoration";
import { IconSprites, Sprite, SpriteLocation } from "./Sprites";
import { BeButton, BeButtonEvent, BeTouchEvent, InputSource } from "./tools/Tool";
import { ToolSettings } from "./tools/ToolSettings";
import { DecorateContext } from "./ViewContext";
import { Decorator } from "./ViewManager";
import { ScreenViewport, Viewport } from "./Viewport";

// cspell:ignore dont primitivetools

/** Virtual cursor for using AccuSnap with touch input.
 * @internal
 */
export class TouchCursor implements CanvasDecoration {
  public position = new Point3d();
  public viewport: Viewport;
  protected _offsetPosition = new Point3d();
  protected _size: number;
  protected _yOffset: number;
  protected _isSelected = false;
  protected _isDragging = false;
  protected _inTouchTap = false;

  protected constructor(vp: ScreenViewport) {
    this._size = vp.pixelsFromInches(0.3);
    this._yOffset = this._size * 1.75;
    this.viewport = vp;
  }

  protected setPosition(vp: Viewport, worldLocation: Point3d): boolean {
    const pointNpc = vp.worldToNpc(worldLocation);
    if (pointNpc.z < 0.0 || pointNpc.z > 1.0)
      pointNpc.z = 0.5; // move inside frustum.

    const viewLocation = vp.npcToView(pointNpc);
    if (!vp.viewRect.containsPoint(viewLocation))
      return false; // outside this viewport rect

    viewLocation.x = Math.floor(viewLocation.x) + 0.5; viewLocation.y = Math.floor(viewLocation.y) + 0.5; viewLocation.z = 0.0;
    const offsetLocation = new Point3d(viewLocation.x, viewLocation.y - this._yOffset, viewLocation.z);
    if (!vp.viewRect.containsPoint(offsetLocation))
      return false; // outside this viewport rect

    this.position.setFrom(viewLocation);
    this._offsetPosition.setFrom(offsetLocation);
    if (vp !== this.viewport) {
      this.viewport.invalidateDecorations();
      this.viewport = vp;
    }
    vp.invalidateDecorations();
    return true;
  }

  protected drawHandle(ctx: CanvasRenderingContext2D, filled: boolean): void {
    ctx.beginPath();
    ctx.moveTo(-this._size, 0);
    ctx.bezierCurveTo(-this._size, -this._size * 0.85, -this._size * 0.6, -this._yOffset * 0.6, 0, -this._yOffset * 0.8);
    ctx.bezierCurveTo(this._size * 0.6, -this._yOffset * 0.6, this._size, -this._size * 0.85, this._size, 0);
    ctx.arc(0, 0, this._size, 0, Math.PI);
    if (filled) ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, this._size * 0.75, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-this._size * 0.4, 0);
    ctx.lineTo(this._size * 0.4, 0);
    ctx.moveTo(-this._size * 0.4, this._size * 0.25);
    ctx.lineTo(this._size * 0.4, this._size * 0.25);
    ctx.stroke();
  }

  public drawDecoration(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,.75)";
    ctx.fillStyle = "white";
    ctx.strokeRect(-2, -(this._yOffset + 2), 5, 5);
    ctx.fillRect(-1, -(this._yOffset + 1), 3, 3);

    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.fillStyle = this._isSelected ? "rgba(35,187,252,.25)" : "rgba(255,215,0,.25)";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 10;
    this.drawHandle(ctx, true);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this._isSelected ? "rgba(35,187,252,.75)" : "rgba(255,215,0,.75)";
    ctx.shadowBlur = 0;
    this.drawHandle(ctx, false);
  }

  protected isSelected(pt: XAndY): boolean { return this.position.distance(Point3d.create(pt.x, pt.y)) < this._size; }
  public isButtonHandled(ev: BeButtonEvent): boolean { return (BeButton.Data === ev.button && InputSource.Touch === ev.inputSource && !this._inTouchTap); }

  public doTouchMove(ev: BeTouchEvent): boolean {
    if (undefined === ev.viewport || !ev.isSingleTouch)
      return false;
    if (!this._isDragging || !this.setPosition(ev.viewport, ev.point))
      return false;
    ev.viewPoint = this._offsetPosition;
    IModelApp.toolAdmin.convertTouchMoveToMotion(ev); // eslint-disable-line @typescript-eslint/no-floating-promises
    return true;
  }

  public doTouchMoveStart(ev: BeTouchEvent, startEv: BeTouchEvent): boolean {
    if (undefined === ev.viewport || !ev.isSingleTouch)
      return false;
    return (this._isDragging = this.isSelected(startEv.viewPoint));
  }

  public doTouchStart(ev: BeTouchEvent): void {
    this._isSelected = ev.isSingleTouch && this.isSelected(ev.viewPoint);
    if (undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();
  }

  public doTouchEnd(ev: BeTouchEvent): void {
    if (this._isDragging && undefined !== ev.viewport)
      IModelApp.toolAdmin.currentInputState.fromPoint(ev.viewport, this._offsetPosition, InputSource.Touch); // Current location should reflect virtual cursor offset...
    this._isSelected = this._isDragging = false;
    if (undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();
  }

  public async doTouchTap(ev: BeTouchEvent): Promise<boolean> {
    if (undefined === ev.viewport || !ev.isSingleTouch || 1 !== ev.tapCount)
      return false;
    if (!this.isSelected(ev.viewPoint)) {
      if (!this.setPosition(ev.viewport, ev.point))
        return false;
      ev.viewPoint = this._offsetPosition;
      IModelApp.toolAdmin.convertTouchMoveToMotion(ev); // eslint-disable-line @typescript-eslint/no-floating-promises
      return false;
    }
    ev.viewPoint = this._offsetPosition;
    this._inTouchTap = true;
    await IModelApp.toolAdmin.convertTouchTapToButtonDownAndUp(ev);
    this._inTouchTap = false;
    return true;
  }

  public static createFromTouchTap(ev: BeTouchEvent): TouchCursor | undefined {
    if (undefined === ev.viewport || !ev.isSingleTouch || 1 !== ev.tapCount)
      return undefined;
    const touchCursor = new TouchCursor(ev.viewport);
    if (!touchCursor.setPosition(ev.viewport, ev.point) && !touchCursor.setPosition(ev.viewport, ev.viewport.view.getCenter()))
      return undefined;
    ev.viewPoint = touchCursor._offsetPosition;
    IModelApp.toolAdmin.convertTouchMoveToMotion(ev); // eslint-disable-line @typescript-eslint/no-floating-promises
    return touchCursor;
  }
}

/** AccuSnap is an aide for snapping to interesting points on elements or decorations as the cursor moves over them.
 * @see [Using AccuSnap]($docs/learning/frontend/primitivetools.md#AccuSnap)
 * @public
 */
export class AccuSnap implements Decorator {
  /** Currently active hit */
  public currHit?: HitDetail;
  /** Current list of hits. */
  public aSnapHits?: HitList<HitDetail>;
  /** Views that need to be flashed */
  public readonly needFlash = new Set<Viewport>();
  /** Views that are already flashed */
  public readonly areFlashed = new Set<Viewport>();
  /** The "+" that indicates where the snap point is */
  public readonly cross = new SpriteLocation();
  /** The icon that indicates what type of snap is active */
  public readonly icon = new SpriteLocation();
  /** The icon that indicates an error */
  public readonly errorIcon = new SpriteLocation();
  /** Reason key for last error */
  public errorKey?: string;
  /** localized message explaining why last error was generated. */
  public explanation?: string;
  /** Number of times "suppress" has been called -- unlike suspend this is not automatically cleared by tools */
  private _suppressed = 0;
  /** Location of cursor when we last checked for motion */
  private readonly _lastCursorPos = new Point2d();
  /** @internal */
  public readonly toolState = new AccuSnap.ToolState();
  /** @internal */
  protected _settings = new AccuSnap.Settings();
  /** @internal */
  public touchCursor?: TouchCursor;
  /** Current request for tooltip message. */
  private _toolTipPromise?: Promise<Promise<void>>;

  /** @internal */
  public onInitialized() { }
  private get _searchDistance(): number { return this.isLocateEnabled ? 1.0 : this._settings.searchDistance; }
  private get _hotDistanceInches(): number { return IModelApp.locateManager.apertureInches * this._settings.hotDistanceFactor; }
  /** Whether locate of elements under the cursor is enabled by the current InteractiveTool.
   * @public
   */
  public get isLocateEnabled(): boolean { return this.toolState.locate; }
  /** Whether snapping to elements under the cursor is enabled by the current InteractiveTool.
   * @public
   */
  public get isSnapEnabled(): boolean { return this.toolState.enabled; }
  /** Whether the user setting for snapping is enabled. Snapping is done only when both the user and current InteractiveTool have enabled it.
   * @public
   */
  public get isSnapEnabledByUser(): boolean { return this._settings.enableFlag; }
  private isFlashed(view: Viewport): boolean { return (this.areFlashed.has(view)); }
  private needsFlash(view: Viewport): boolean { return (this.needFlash.has(view)); }
  private setNeedsFlash(view: Viewport) { this.needFlash.add(view); this.clearIsFlashed(view); view.invalidateDecorations(); }
  private setIsFlashed(view: Viewport) { this.areFlashed.add(view); }
  private clearIsFlashed(view: Viewport) { this.areFlashed.delete(view); }
  private static toSnapDetail(hit?: HitDetail): SnapDetail | undefined { return (hit && hit instanceof SnapDetail) ? hit : undefined; }
  /** @internal */
  public getCurrSnapDetail(): SnapDetail | undefined { return AccuSnap.toSnapDetail(this.currHit); }
  /** Determine whether there is a current hit that is *hot*. */
  public get isHot(): boolean { const currSnap = this.getCurrSnapDetail(); return !currSnap ? false : currSnap.isHot; }

  /** @internal */
  public destroy(): void { this.currHit = undefined; this.aSnapHits = undefined; }
  private get _doSnapping(): boolean { return this.isSnapEnabled && this.isSnapEnabledByUser && !this._isSnapSuspended; }
  private get _isSnapSuspended(): boolean { return (0 !== this._suppressed || 0 !== this.toolState.suspended); }

  /** Get the current snap divisor to use to use for SnapMode.NearestKeypoint.
   * @public
   */
  public get keypointDivisor() { return 2; }

  /** Get the current active SnapModes. SnapMode position determines priority, with the first entry being the highest. The SnapDetail will be returned for the first SnapMode that produces a hot snap.
   * @public
   */
  public getActiveSnapModes(): SnapMode[] {
    const snaps: SnapMode[] = [];
    snaps.push(SnapMode.NearestKeypoint);
    return snaps;
  }

  /** Can be implemented by a subclass of AccuSnap to implement a SnapMode override that applies only to the next point.
   * This method will be called whenever a new tool is installed and on button events.
   * @internal
   */
  public synchSnapMode(): void { }

  /** Check whether current tentative snap has valid curve geometry for finding extended intersections. */
  private get _searchForExtendedIntersections(): boolean {
    const snap = IModelApp.tentativePoint.getCurrSnap();
    return (undefined !== snap && undefined !== snap.primitive);
  }

  /**
   * Check to see whether its appropriate to generate an AccuSnap point, given the current user
   * and command settings, and whether a tentative point is currently active.
   */
  public get isActive(): boolean {
    // Unless we're snapping in intersect mode (to find extended intersections), skip if tentative point active...
    if (IModelApp.tentativePoint.isActive) {
      if (!this._doSnapping || !this._searchForExtendedIntersections)
        return false;

      const snaps = this.getActiveSnapModes();
      for (const snap of snaps) {
        if (snap === SnapMode.Intersection)
          return true;
      }

      return false;
    }

    return this._doSnapping || this.isLocateEnabled;
  }

  private initializeForCheckMotion(): void {
    this._lastCursorPos.setFrom(IModelApp.toolAdmin.currentInputState.lastMotion);
  }

  /** Clear the current AccuSnap info. */
  public clear(): void { this.setCurrHit(undefined); }
  /** @internal */
  public setCurrHit(newHit?: HitDetail): void {
    const newSnap = AccuSnap.toSnapDetail(newHit);
    const currSnap = this.getCurrSnapDetail();
    const sameElem = (undefined !== newHit && newHit.isSameHit(this.currHit));
    const sameHit = (sameElem && !newSnap);
    const sameSnap = (sameElem && undefined !== newSnap && undefined !== currSnap);
    const samePt = (sameHit || (sameSnap && newSnap!.snapPoint.isAlmostEqual(currSnap!.snapPoint)));
    const sameHot = (sameHit || (sameSnap && (this.isHot === newSnap!.isHot)));
    const sameBaseSnapMode = (!newSnap || !currSnap || newSnap.snapMode === currSnap.snapMode);
    const sameType = (sameHot && (!currSnap || (currSnap.getHitType() === newHit!.getHitType())));

    // see if it is the same point on the same element, the hot flags are the same multiple snaps, and the snap modes are the same
    if (samePt && sameType && sameBaseSnapMode) {
      // we know that nothing about the screen could change, just save the new hit and return to avoid screen flash
      this.currHit = newHit;
      return;
    }

    this.erase();

    // if we hit the same element with the same "hotness" as last time, we don't need to erase it
    //  multiple snaps: but only if the old and new snap modes are the same
    if (!sameHot || !sameBaseSnapMode) {
      this.unFlashViews();
      this.setFlashHit(newHit);
    }

    // if we didn't get a new hit, we're done
    if (undefined === (this.currHit = newHit))
      return;

    // draw sprites for this hit
    this.showSnapSprite();
  }

  /** flash a hit in a single view. */
  private flashHitInView(hit: HitDetail, context: DecorateContext) {
    const viewport = context.viewport;
    if (!viewport || !this.hitShouldBeHilited(hit) || !this.needsFlash(viewport))
      return;

    hit.draw(context);
    this.setIsFlashed(viewport);
  }

  private setNeedsFlashView(view: Viewport) {
    if (!this.isFlashed(view) && !this.needsFlash(view))
      this.setNeedsFlash(view);
  }

  /** flash a hit in its view. */
  private setFlashHit(hit?: HitDetail): void {
    if (hit !== undefined && this.hitShouldBeHilited(hit))
      this.setNeedsFlashView(hit.viewport);
  }

  /** @internal */
  public erase(): void {
    this.clearToolTip(undefined); // make sure there's no tooltip up.
    this.clearSprites(); // remove all sprites from the screen
  }

  private showElemInfo(viewPt: XAndY, vp: ScreenViewport, hit: HitDetail, delay: BeDuration): void {
    if (!IModelApp.viewManager.doesHostHaveFocus || undefined !== this._toolTipPromise)
      return;

    const promise = this._toolTipPromise = delay.executeAfter(async () => {
      if (promise !== this._toolTipPromise)
        return; // we abandoned this request during delay
      try {
        const msg = await IModelApp.toolAdmin.getToolTip(hit);
        if (this._toolTipPromise === promise) // have we abandoned this request while awaiting getToolTip?
          this.showLocateMessage(viewPt, vp, msg);
      } catch (error) { } // happens if getToolTip was canceled
    });
  }

  private showLocateMessage(viewPt: XAndY, vp: ScreenViewport, msg: HTMLElement | string) {
    if (IModelApp.viewManager.doesHostHaveFocus)
      vp.openToolTip(msg, viewPt);
  }

  /** @internal */
  public displayToolTip(viewPt: XAndY, vp: ScreenViewport, uorPt?: Point3d): void {
    // if the tooltip is already displayed, or if user doesn't want it, quit.
    if (!this._settings.toolTip || !IModelApp.notifications.isToolTipSupported || IModelApp.notifications.isToolTipOpen)
      return;

    const accuSnapHit = this.currHit;
    const tpHit = IModelApp.tentativePoint.getCurrSnap();

    // if we don't have either an AccuSnap or a tentative point hit, quit.
    if (!accuSnapHit && !tpHit && !this.errorIcon.isActive)
      return;

    let theHit: HitDetail | undefined;

    // determine which type of hit
    if (tpHit) {
      if (uorPt) {
        // see if he came back somewhere near the currently snapped element
        const aperture = (this._settings.stickyFactor * vp.pixelsFromInches(IModelApp.locateManager.apertureInches) / 2.0) + 1.5;
        if (!IModelApp.locateManager.picker.testHit(tpHit, vp, uorPt, aperture, IModelApp.locateManager.options))
          return;
      }
      theHit = tpHit;
    } else {
      theHit = accuSnapHit;
    }

    // if we're currently showing an error, get the error message...otherwise display hit info...
    if (!this.errorIcon.isActive && theHit) {
      this.showElemInfo(viewPt, vp, theHit, this._settings.toolTipDelay);
      return;
    }

    // If we have an error explanation...use it as is!
    if (this.explanation) {
      this.showLocateMessage(viewPt, vp, this.explanation);
      return;
    }

    // if we don't have an explanation yet, translate the error code.
    if (!this.errorKey)
      return;

    this.explanation = IModelApp.i18n.translate(this.errorKey);
    if (!this.explanation)
      return;

    this.showLocateMessage(viewPt, vp, this.explanation);
  }

  /** @internal */
  public clearToolTip(ev?: BeButtonEvent): void {
    // Throw away any stale request for a tooltip message
    this._toolTipPromise = undefined;
    if (!IModelApp.notifications.isToolTipOpen)
      return;

    if (ev && (5 > ev.viewPoint.distanceXY(IModelApp.notifications.toolTipLocation)))
      return;

    IModelApp.notifications.clearToolTip();
  }

  /** Display the sprites for the current snap to indicate its position on the screen and what snap mode it represents. */
  private showSnapSprite(): void {
    const snap = this.getCurrSnapDetail();
    if (!snap)
      return;

    const crossPt = snap.snapPoint;
    const viewport = snap.viewport;
    const crossSprite = IconSprites.getSpriteFromUrl(snap.isHot ? "sprites/SnapCross.png" : "sprites/SnapUnfocused.png");

    this.cross.activate(crossSprite, viewport, crossPt);

    const snapSprite = snap.sprite;
    if (snapSprite)
      this.icon.activate(snapSprite, viewport, AccuSnap.adjustIconLocation(viewport, crossPt, snapSprite.size));
  }

  private static adjustIconLocation(vp: Viewport, input: Point3d, iconSize: XAndY): Point3d {
    const out = vp.worldToView(input);
    out.x += (iconSize.x / 3.0);
    out.y -= (iconSize.y * 1.3);
    return vp.viewToWorld(out, out);
  }

  /** try to indicate what's wrong with the current point (why we're not snapping). */
  private showSnapError(out: LocateResponse, ev: BeButtonEvent) {
    this.explanation = out.explanation;
    this.errorKey = out.reason;
    this.errorIcon.deactivate();

    const vp = ev.viewport!;
    let errorSprite: Sprite | undefined;
    switch (out.snapStatus) {
      case SnapStatus.FilteredByApp:
        errorSprite = IconSprites.getSpriteFromUrl("sprites/SnapAppFiltered.png");
        break;

      case SnapStatus.FilteredByAppQuietly:
        this.errorKey = undefined;
        break;

      case SnapStatus.NotSnappable:
        errorSprite = IconSprites.getSpriteFromUrl("sprites/SnapNotSnappable.png");
        this.errorKey = ElementLocateManager.getFailureMessageKey("NotSnappable");
        break;
    }

    if (!errorSprite)
      return;

    const spriteSize = errorSprite.size;
    const pt = AccuSnap.adjustIconLocation(vp, ev.rawPoint, spriteSize);

    this.errorIcon.activate(errorSprite, vp, pt);
  }

  private clearSprites() {
    this.errorIcon.deactivate();
    this.cross.deactivate();
    this.icon.deactivate();
  }

  /** determine whether a hit should be hilited or not. */
  private hitShouldBeHilited(hit: HitDetail | undefined): boolean {
    if (!hit)
      return false;

    if (hit.isModelHit || hit.isMapHit)
      return false;       // Avoid annoying flashing of reality models.

    const snap = AccuSnap.toSnapDetail(hit);
    return !snap || snap.isHot || this._settings.hiliteColdHits;
  }

  private unFlashViews() {
    this.needFlash.clear();
    this.areFlashed.forEach((vp) => {
      vp.setFlashed(undefined);
    });
    this.areFlashed.clear();
  }

  /** @internal */
  public adjustPointIfHot(pt: Point3d, view: Viewport): void {
    const currSnap = this.getCurrSnapDetail();

    if (!currSnap || !currSnap.isHot || view !== currSnap.viewport)
      return;

    pt.setFrom(currSnap.adjustedPoint);
  }

  /** Implemented by sub-classes to update ui to show current enabled state.
   * @internal
   */
  public onEnabledStateChange(_isEnabled: boolean, _wasEnabled: boolean) { }

  /** @internal */
  public getHitAndList(holder: HitListHolder): HitDetail | undefined {
    const hit = this.currHit;
    if (hit) {
      holder.setHitList(this.aSnapHits);
      this.aSnapHits = undefined;
    }
    return hit;
  }

  private initCmdState() { this.toolState.suspended = 0; }

  /** @internal */
  public suspend(doSuspend: boolean) {
    const previousDoSnapping = this._doSnapping;
    if (doSuspend)
      this.toolState.suspended++;
    else if (this.toolState.suspended > 0)
      this.toolState.suspended--;

    this.onEnabledStateChange(this._doSnapping, previousDoSnapping);
  }

  /** @internal */
  public suppress(doSuppress: boolean): number {
    const previousDoSnapping = this._doSnapping;
    if (doSuppress)
      this._suppressed++;
    else if (this._suppressed > 0)
      this._suppressed--;

    this.onEnabledStateChange(this._doSnapping, previousDoSnapping);
    return this._suppressed;
  }

  /** Turn AccuSnap on or off */
  public enableSnap(yesNo: boolean) {
    const previousDoSnapping = this._doSnapping;
    this.toolState.enabled = yesNo;
    if (!yesNo) {
      this.clear();
      if (undefined !== this.touchCursor && !this.wantVirtualCursor) {
        this.touchCursor = undefined;
        IModelApp.viewManager.invalidateDecorationsAllViews();
      }
    }
    this.onEnabledStateChange(this._doSnapping, previousDoSnapping);
  }

  /** @internal */
  public intersectXY(tpSnap: SnapDetail, second: SnapDetail): IntersectDetail | undefined {
    // Get single segment curve from each snap to intersect...
    const tpSegment = tpSnap.getCurvePrimitive();
    if (undefined === tpSegment)
      return undefined;
    const segment = second.getCurvePrimitive();
    if (undefined === segment)
      return undefined;

    const worldToView = second.viewport.worldToViewMap.transform0;
    const detail = CurveCurve.intersectionProjectedXYPairs(worldToView, tpSegment, true, segment, true);
    if (0 === detail.length)
      return undefined;

    let closeIndex = 0;
    if (detail.length > 1) {
      const snapPt = worldToView.multiplyPoint3d(HitGeomType.Point === tpSnap.geomType && HitGeomType.Point !== second.geomType ? second.getPoint() : tpSnap.getPoint(), 1); // Don't check distance from arc centers...
      let lastDist: number | undefined;

      for (let i = 0; i < detail.length; i++) {
        const testPt = worldToView.multiplyPoint3d(detail[i].detailA.point, 1);
        const testDist = snapPt.realDistanceXY(testPt);

        if (undefined !== testDist && (undefined === lastDist || testDist < lastDist)) {
          lastDist = testDist;
          closeIndex = i;
        }
      }
    }

    const intersect = new IntersectDetail(tpSnap, SnapHeat.InRange, detail[closeIndex].detailA.point, segment, second.sourceId); // Should be ok to share hit detail with tentative...
    intersect.primitive = tpSegment; // Just save single segment that was intersected for line strings/shapes...

    return intersect;
  }

  /** @internal */
  public static async requestSnap(thisHit: HitDetail, snapModes: SnapMode[], hotDistanceInches: number, keypointDivisor: number, hitList?: HitList<HitDetail>, out?: LocateResponse): Promise<SnapDetail | undefined> {
    if (thisHit.isModelHit || thisHit.isMapHit || thisHit.isClassifier) {
      if (snapModes.includes(SnapMode.Nearest)) {
        if (out) out.snapStatus = SnapStatus.Success;
        return new SnapDetail(thisHit, SnapMode.Nearest, SnapHeat.InRange);
      } else if (1 === snapModes.length && snapModes.includes(SnapMode.Intersection)) {
        if (out) out.snapStatus = SnapStatus.NoSnapPossible;
        return undefined;
      } else {
        if (out) out.snapStatus = SnapStatus.Success;
        const realitySnap = new SnapDetail(thisHit, SnapMode.Nearest, SnapHeat.None);
        realitySnap.sprite = undefined; // Don't show a snap mode that isn't applicable, but still accept hit point...
        return realitySnap;
      }
    }

    if (undefined !== thisHit.subCategoryId && !thisHit.isExternalIModelHit) {
      const appearance = thisHit.viewport.getSubCategoryAppearance(thisHit.subCategoryId);
      if (appearance.dontSnap) {
        if (out) {
          out.snapStatus = SnapStatus.NotSnappable;
          out.explanation = IModelApp.i18n.translate(ElementLocateManager.getFailureMessageKey("NotSnappableSubCategory"));
        }
        return undefined;
      }
    }

    const requestProps: SnapRequestProps = {
      id: thisHit.sourceId,
      testPoint: thisHit.testPoint,
      closePoint: thisHit.hitPoint,
      worldToView: thisHit.viewport.worldToViewMap.transform0.toJSON(),
      viewFlags: thisHit.viewport.viewFlags,
      snapModes,
      snapAperture: thisHit.viewport.pixelsFromInches(hotDistanceInches),
      snapDivisor: keypointDivisor,
      subCategoryId: thisHit.subCategoryId,
      geometryClass: thisHit.geometryClass,
    };

    if (!thisHit.isElementHit) {
      const thisGeom = IModelApp.viewManager.getDecorationGeometry(thisHit);
      if (undefined === thisGeom) {
        if (out) out.snapStatus = SnapStatus.NoSnapPossible;
        return undefined;
      }
      requestProps.decorationGeometry = [{ id: thisHit.sourceId, geometryStream: thisGeom }];
    }

    if (snapModes.includes(SnapMode.Intersection)) {
      if (undefined !== hitList) {
        for (const hit of hitList.hits) {
          if (thisHit.sourceId === hit.sourceId || thisHit.iModel !== hit.iModel)
            continue;

          if (!hit.isElementHit) {
            const geom = IModelApp.viewManager.getDecorationGeometry(hit);
            if (undefined === geom)
              continue;
            if (undefined === requestProps.decorationGeometry)
              requestProps.decorationGeometry = [{ id: thisHit.sourceId, geometryStream: geom }];
            else
              requestProps.decorationGeometry.push({ id: thisHit.sourceId, geometryStream: geom });
          }

          if (undefined === requestProps.intersectCandidates)
            requestProps.intersectCandidates = [hit.sourceId];
          else
            requestProps.intersectCandidates.push(hit.sourceId);

          if (5 === requestProps.intersectCandidates.length)
            break; // Search for intersection with a few of the next best hits...
        }
      }

      if (1 === snapModes.length && undefined === requestProps.intersectCandidates) {
        if (out) out.snapStatus = SnapStatus.NoSnapPossible;
        return undefined; // Don't make back end request when only doing intersection snap when we don't have another hit to intersect with...
      }
    }

    const result = await thisHit.iModel.requestSnap(requestProps);

    if (out) out.snapStatus = result.status;
    if (result.status !== SnapStatus.Success)
      return undefined;

    const parseCurve = (json: any): CurvePrimitive | undefined => {
      const parsed = undefined !== json ? GeomJson.Reader.parse(json) : undefined;
      return parsed instanceof GeometryQuery && "curvePrimitive" === parsed.geometryCategory ? parsed : undefined;
    };

    // If this hit is from a plan projection model, apply the model's elevation to the snap point for display.
    // Likewise, if it is a hit on a model with a display transform, apply the model's transform to the snap point.
    let snapPoint = result.snapPoint!;
    const elevation = undefined !== thisHit.modelId ? thisHit.viewport.view.getModelElevation(thisHit.modelId) : 0;
    if (0 !== elevation || undefined !== thisHit.viewport.view.modelDisplayTransformProvider) {
      const adjustedSnapPoint = Point3d.fromJSON(snapPoint);
      thisHit.viewport.view.transformPointByModelDisplayTransform(thisHit.modelId, adjustedSnapPoint, false);
      adjustedSnapPoint.z += elevation;
      snapPoint = adjustedSnapPoint;
    }

    const snap = new SnapDetail(thisHit, result.snapMode, result.heat, snapPoint);

    // Apply model's elevation and display transform to curve for display.
    let transform;
    if (undefined !== thisHit.modelId && undefined !== thisHit.viewport.view.modelDisplayTransformProvider) {
      transform = thisHit.viewport.view.getModelDisplayTransform(thisHit.modelId, Transform.createIdentity());
      if (0 !== elevation)
        transform.origin.set(0, 0, elevation);
    } else if (0 !== elevation) {
      transform = Transform.createTranslationXYZ(0, 0, elevation);
    }

    snap.setCurvePrimitive(parseCurve(result.curve), transform, result.geomType);
    if (undefined !== result.parentGeomType)
      snap.parentGeomType = result.parentGeomType;
    if (undefined !== result.hitPoint) {
      snap.hitPoint.setFromJSON(result.hitPoint); // Update hitPoint from readPixels with exact point location corrected to surface/edge geometry...
      thisHit.viewport.view.transformPointByModelDisplayTransform(thisHit.modelId, snap.hitPoint, false);
    }
    if (undefined !== result.normal) {
      snap.normal = Vector3d.fromJSON(result.normal);
      thisHit.viewport.view.transformNormalByModelDisplayTransform(thisHit.modelId, snap.normal);
    }

    if (SnapMode.Intersection !== snap.snapMode)
      return snap;

    if (undefined === result.intersectId)
      return undefined;

    const otherPrimitive = parseCurve(result.intersectCurve);
    if (undefined === otherPrimitive)
      return undefined;

    const intersect = new IntersectDetail(snap, snap.heat, snap.snapPoint, otherPrimitive, result.intersectId);
    return intersect;
  }

  private async getAccuSnapDetail(hitList: HitList<HitDetail>, out: LocateResponse): Promise<SnapDetail | undefined> {
    const thisHit = hitList.getNextHit();
    if (undefined === thisHit)
      return undefined;

    const filterStatus: LocateFilterStatus = (this.isLocateEnabled ? await IModelApp.locateManager.filterHit(thisHit, LocateAction.AutoLocate, out) : LocateFilterStatus.Accept);
    if (LocateFilterStatus.Accept !== filterStatus) {
      out.snapStatus = SnapStatus.FilteredByApp;
      return undefined;
    }

    let snapModes: SnapMode[];
    if (IModelApp.tentativePoint.isActive) {
      snapModes = [];
      snapModes.push(SnapMode.Nearest); // Special case: isActive only allows snapping with tentative to find extended intersections...
    } else {
      snapModes = this.getActiveSnapModes(); // Get the list of point snap modes to consider
    }

    const thisSnap = await AccuSnap.requestSnap(thisHit, snapModes, this._hotDistanceInches, this.keypointDivisor, hitList, out);
    if (undefined === thisSnap)
      return undefined;

    if (IModelApp.tentativePoint.isActive) {
      const tpSnap = IModelApp.tentativePoint.getCurrSnap();
      if (undefined === tpSnap)
        return undefined;
      const intersectSnap = this.intersectXY(tpSnap, thisSnap);
      if (undefined === intersectSnap)
        return undefined;
      hitList.setCurrentHit(thisHit);
      return intersectSnap;
    }

    IModelApp.accuDraw.onSnap(thisSnap); // AccuDraw can adjust nearest snap to intersection of circle (polar distance lock) or line (axis lock) with snapped to curve...
    hitList.setCurrentHit(thisHit);
    return thisSnap;
  }

  private findHits(ev: BeButtonEvent, force: boolean = false): SnapStatus {
    // When using AccuSnap to locate elements, we have to start with the datapoint adjusted
    // for locks and not the raw point. Otherwise, when grid/unit lock are on, we locate elements by
    // points not on the grid. This causes them to be "pulled" off the grid when they are accepted. On
    // the other hand, when NOT locating, we need to use the raw point so we can snap to elements
    // away from the grid.

    const testPoint = this.isLocateEnabled ? ev.point : ev.rawPoint;
    const vp = ev.viewport!;
    const picker = IModelApp.locateManager.picker;
    const options = IModelApp.locateManager.options.clone(); // Copy to avoid changing out from under active Tool...

    // NOTE: Since TestHit will use the same HitSource as the input hit we only need to sets this for DoPick...
    options.hitSource = this.isSnapEnabled ? HitSource.AccuSnap : HitSource.MotionLocate;

    let aperture = (vp.pixelsFromInches(IModelApp.locateManager.apertureInches) / 2.0) + 1.5;
    this.initializeForCheckMotion();
    aperture *= this._searchDistance;

    if (0 === picker.doPick(vp, testPoint, aperture, options)) {
      this.aSnapHits = undefined; // Clear any previous hit list so reset won't cycle through hits cursor is no longer over, etc.
      return SnapStatus.NoElements;
    }

    this.aSnapHits = picker.getHitList(true); // take ownership of the pickElem hit list.

    // see if we should keep the current hit
    const canBeSticky = !force && this.aSnapHits.length > 1 && this.currHit && (HitDetailType.Intersection !== this.currHit.getHitType() && this.currHit.priority < HitPriority.PlanarSurface);
    if (canBeSticky) {
      for (let iHit = 1; iHit < this.aSnapHits.length; ++iHit) {
        const thisHit = this.aSnapHits.hits[iHit];
        if (!thisHit.isSameHit(this.currHit))
          continue;
        this.aSnapHits.removeHit(iHit);
        this.aSnapHits.insertHit(0, thisHit);
        break;
      }
    }

    return SnapStatus.Success;
  }

  private async findLocatableHit(ev: BeButtonEvent, newSearch: boolean, out: LocateResponse): Promise<HitDetail | undefined> {
    out.snapStatus = SnapStatus.NoElements;

    if (newSearch) {
      this.aSnapHits = undefined;
      // search for new hits, but if the cursor is still close to the current hit, don't throw away list.
      if (SnapStatus.Success !== (out.snapStatus = this.findHits(ev)))
        return undefined;
    } else {
      if (!this.aSnapHits) {
        out.snapStatus = SnapStatus.NoElements;
        return undefined;
      }
    }

    const thisList = this.aSnapHits!;
    let thisHit: HitDetail | undefined;
    let firstRejected;
    const filterResponse = new LocateResponse();

    // keep looking through hits until we find one that is accu-snappable.
    while (undefined !== (thisHit = thisList.getNextHit())) {
      if (LocateFilterStatus.Accept === await IModelApp.locateManager.filterHit(thisHit, LocateAction.AutoLocate, filterResponse))
        return thisHit;
      // we only care about the status of the first hit.
      if (undefined !== firstRejected)
        continue;
      firstRejected = filterResponse.clone();
      firstRejected.snapStatus = SnapStatus.FilteredByApp;
    }

    if (undefined !== firstRejected)
      out.setFrom(firstRejected);

    // Reset current hit index to go back to first hit on next AccuSnap reset event...
    thisList.resetCurrentHit();
    return undefined;
  }

  /** When in auto-locate mode, advance to the next hit without searching again.
   * @internal
   */
  public async resetButton(): Promise<SnapStatus> {
    let hit: HitDetail | undefined;
    const out = new LocateResponse();
    out.snapStatus = SnapStatus.Disabled;

    this.clearToolTip(undefined);

    const ev = new BeButtonEvent();
    IModelApp.toolAdmin.fillEventFromCursorLocation(ev);

    if (this._doSnapping) {
      // if we don't have any more candidate hits, get a new list at the current location
      if (!this.aSnapHits || (0 === this.aSnapHits.length)) {
        out.snapStatus = this.findHits(ev);
        hit = (SnapStatus.Success !== out.snapStatus) ? undefined : await this.getAccuSnapDetail(this.aSnapHits!, out);
      } else {
        // drop the current hit from the list and then retest the list (without the dropped hit) to find the new snap
        this.aSnapHits.removeCurrentHit();
        hit = await this.getAccuSnapDetail(this.aSnapHits, out);
      }
    } else if (this.isLocateEnabled) {
      hit = await this.findLocatableHit(ev, false, out); // get next AccuSnap path (or undefined)
    }

    // set the current hit
    if (hit || this.currHit)
      this.setCurrHit(hit);

    // indicate errors
    this.showSnapError(out, ev);
    return out.snapStatus;
  }

  /** Find the best snap point according to the current cursor location
   * @internal
   */
  public async onMotion(ev: BeButtonEvent): Promise<void> {
    this.clearToolTip(ev);
    const out = new LocateResponse();
    out.snapStatus = SnapStatus.Disabled;

    let hit: HitDetail | undefined;
    if (this.isActive) {
      if (this._doSnapping) {
        out.snapStatus = this.findHits(ev);
        hit = (SnapStatus.Success !== out.snapStatus) ? undefined : await this.getAccuSnapDetail(this.aSnapHits!, out);
      } else if (this.isLocateEnabled) {
        hit = await this.findLocatableHit(ev, true, out);
      }
    }

    // set the current hit and display the sprite (based on snap's KeypointType)
    if (hit || this.currHit)
      this.setCurrHit(hit);

    // set up active error before calling displayToolTip to indicate error or show locate message...
    this.showSnapError(out, ev);
    this.displayToolTip(ev.viewPoint, ev.viewport!, ev.rawPoint);

    if (undefined !== this.touchCursor && InputSource.Mouse === ev.inputSource) {
      this.touchCursor = undefined;
      IModelApp.viewManager.invalidateDecorationsAllViews();
    }
  }

  /** @internal */
  public onPreButtonEvent(ev: BeButtonEvent): boolean { return (undefined !== this.touchCursor) ? this.touchCursor.isButtonHandled(ev) : false; }
  /** @internal */
  public onTouchStart(ev: BeTouchEvent): void { if (undefined !== this.touchCursor) this.touchCursor.doTouchStart(ev); }
  /** @internal */
  public onTouchEnd(ev: BeTouchEvent): void { if (undefined !== this.touchCursor && 0 === ev.touchCount) this.touchCursor.doTouchEnd(ev); }
  /** @internal */
  public onTouchCancel(ev: BeTouchEvent): void { if (undefined !== this.touchCursor) this.touchCursor.doTouchEnd(ev); }
  /** @internal */
  public onTouchMove(ev: BeTouchEvent): boolean { return (undefined !== this.touchCursor) ? this.touchCursor.doTouchMove(ev) : false; }
  /** @internal */
  public onTouchMoveStart(ev: BeTouchEvent, startEv: BeTouchEvent): boolean { return (undefined !== this.touchCursor) ? this.touchCursor.doTouchMoveStart(ev, startEv) : false; }

  /** @internal */
  public get wantVirtualCursor(): boolean {
    return this._doSnapping || (this.isLocateEnabled && ToolSettings.enableVirtualCursorForLocate);
  }

  /** @internal */
  public async onTouchTap(ev: BeTouchEvent): Promise<boolean> {
    if (undefined !== this.touchCursor)
      return this.touchCursor.doTouchTap(ev);
    if (!this.wantVirtualCursor)
      return false;
    this.touchCursor = TouchCursor.createFromTouchTap(ev);
    if (undefined === this.touchCursor)
      return false;
    // Give active tool an opportunity to update it's tool assistance since event won't be passed along...
    const tool = IModelApp.toolAdmin.activeTool;
    if (undefined === tool)
      return true;
    tool.onSuspend();
    tool.onUnsuspend();
    return true;
  }

  private flashElements(context: DecorateContext): void {
    const viewport = context.viewport;
    if (this.currHit) {
      if (this.needsFlash(viewport))
        this.flashHitInView(this.currHit, context);
      return;
    }

    const hit = IModelApp.tentativePoint.getCurrSnap();
    if (hit && !(hit.isModelHit || hit.isMapHit)) // Don't hilite reality models.
      hit.draw(context);
  }

  /** @internal */
  public decorate(context: DecorateContext): void {
    if (undefined !== this.touchCursor && this.touchCursor.viewport === context.viewport)
      context.addCanvasDecoration(this.touchCursor, true);

    this.flashElements(context);

    if (this.cross.isActive) {
      this.cross.decorate(context);
      this.icon.decorate(context);
    }

    this.errorIcon.decorate(context);
  }

  private clearElemFromHitList(element: string) {
    if (this.aSnapHits)
      this.aSnapHits.removeHitsFrom(element);
  }

  /** @internal */
  public clearIfElement(sourceId: string): void {
    this.clearElemFromHitList(sourceId);

    const hit = this.currHit;
    if (hit && hit.sourceId === sourceId) {
      this.destroy();
    }
  }

  /** Enable locating elements.
   * @public
   */
  public enableLocate(yesNo: boolean) {
    this.toolState.locate = yesNo;
    if (!yesNo && undefined !== this.touchCursor && !this.wantVirtualCursor) {
      this.touchCursor = undefined;
      IModelApp.viewManager.invalidateDecorationsAllViews();
    }
  }

  /** Called whenever a new [[Tool]] is started.
   * @internal
   */
  public onStartTool(): void {
    this.initCmdState();
    this.enableSnap(false);
    this.enableLocate(false);
    IModelApp.tentativePoint.clear(true);
  }

  /**
   * Force AccuSnap to reevaluate the snap at the current cursor location.
   * This is useful of an application changes the snap mode and wants AccuSnap to choose it immediately, without
   * requiring the user to move the mouse.
   * @internal
   */
  public async reEvaluate() {
    if (this.getCurrSnapDetail()) {
      const ev = new BeButtonEvent();
      IModelApp.toolAdmin.fillEventFromCursorLocation(ev);
      return this.onMotion(ev);
    }
  }
}

/** @internal */
export class TentativeOrAccuSnap {
  public static get isHot(): boolean { return IModelApp.accuSnap.isHot || IModelApp.tentativePoint.isSnapped; }

  public static getCurrentSnap(checkIsHot: boolean = true): SnapDetail | undefined {
    // Checking for a hot AccuSnap hit before checking tentative is probably necessary for extended intersections?
    if (IModelApp.accuSnap.isHot)
      return IModelApp.accuSnap.getCurrSnapDetail();

    if (IModelApp.tentativePoint.isSnapped)
      return IModelApp.tentativePoint.currSnap;

    return (checkIsHot ? undefined : IModelApp.accuSnap.getCurrSnapDetail());
  }

  public static getCurrentPoint(): Point3d {
    if (IModelApp.accuSnap.isHot) {
      const snap = IModelApp.accuSnap.getCurrSnapDetail();
      if (snap)
        return snap.adjustedPoint;
    }

    return IModelApp.tentativePoint.getPoint();
  }

  public static getCurrentView(): ScreenViewport | undefined {
    const snap = IModelApp.accuSnap.getCurrSnapDetail();
    return snap ? snap.viewport : IModelApp.tentativePoint.viewport;
  }
}

/** @public */
export namespace AccuSnap { // eslint-disable-line no-redeclare
  export class ToolState {
    public enabled = false;
    public locate = false;
    public suspended = 0;
    public setFrom(other: ToolState): void {
      this.enabled = other.enabled;
      this.locate = other.locate;
      this.suspended = other.suspended;
    }
    public clone(): ToolState { const val = new ToolState(); val.setFrom(this); return val; }
  }

  export class Settings {
    public hotDistanceFactor = 1.2;
    public stickyFactor = 1.0;
    public searchDistance = 2.0;
    public hiliteColdHits = true;
    public enableFlag = true;
    public toolTip = true;
    public toolTipDelay = BeDuration.fromSeconds(.5); // delay before tooltip pops up
  }
}
