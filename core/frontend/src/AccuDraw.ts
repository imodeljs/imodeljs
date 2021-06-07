/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module AccuDraw
 */
import { BentleyStatus } from "@bentley/bentleyjs-core";
import {
  Arc3d, AxisOrder, CurveCurve, CurvePrimitive, Geometry, IModelJson as GeomJson, LineSegment3d, LineString3d, Matrix3d, Plane3dByOriginAndUnitNormal, Point2d, Point3d,
  PointString3d, Ray3d, Transform, Vector3d,
} from "@bentley/geometry-core";
import { ColorByName, ColorDef, GeometryStreamProps, LinePixels } from "@bentley/imodeljs-common";
import { TentativeOrAccuSnap } from "./AccuSnap";
import { ACSDisplayOptions, AuxCoordSystemState } from "./AuxCoordSys";
import { HitDetail, SnapDetail, SnapHeat, SnapMode } from "./HitDetail";
import { IModelApp } from "./IModelApp";
import { GraphicBuilder, GraphicType } from "./render/GraphicBuilder";
import { StandardViewId } from "./StandardView";
import { BeButton, BeButtonEvent, CoordinateLockOverrides, InputCollector, InputSource } from "./tools/Tool";
import { ViewTool } from "./tools/ViewTool";
import { DecorateContext } from "./ViewContext";
import { linePlaneIntersect } from "./LinePlaneIntersect";
import { ScreenViewport, Viewport } from "./Viewport";
import { ViewState } from "./ViewState";
import { QuantityType } from "./quantity-formatting/QuantityFormatter";
import { ParseError, Parser, QuantityParseResult } from "@bentley/imodeljs-quantity";

// cspell:ignore dont primitivetools

/** @internal */
export enum AccuDrawFlags {
  SetModePolar = 1,
  SetModeRect = 1 << 1,
  SetOrigin = (1 << 2),
  FixedOrigin = (1 << 3),
  SetRMatrix = (1 << 4),
  SetXAxis = (1 << 5),
  SetNormal = (1 << 6),
  SetDistance = (1 << 7),
  LockDistance = (1 << 8),
  Lock_X = (1 << 9),
  Lock_Y = (1 << 10),
  Lock_Z = (1 << 11),
  Disable = (1 << 12),
  OrientDefault = (1 << 14),
  SetFocus = (1 << 15),
  OrientACS = (1 << 17),
  SetXAxis2 = (1 << 18),
  LockAngle = (1 << 19),
  AlwaysSetOrigin = SetOrigin | (1 << 21),
  RedrawCompass = (1 << 22),
  UpdateRotation = (1 << 23),
  SmartRotation = (1 << 24),
}

/** @internal */
export enum CompassMode {
  Polar = 0,
  Rectangular = 1,
}

/** @alpha */
export enum RotationMode {
  Top = 1,
  Front = 2,
  Side = 3,
  View = 4,
  ACS = 5,
  Context = 6,
}

/** @internal */
export enum LockedStates {
  NONE_LOCKED = 0,
  X_BM = (1),
  Y_BM = (1 << 1),
  VEC_BM = (1 << 2),
  DIST_BM = (1 << 3),
  XY_BM = (X_BM | Y_BM),
  ANGLE_BM = (XY_BM | VEC_BM),
}

/** @internal */
export enum CurrentState {
  NotEnabled = 0, // Compass disabled/unwanted for this session.
  Deactivated = 1, // Compass deactivated but CAN be activated by user.
  Inactive = 2, // Compass not displayed awaiting automatic activation (default tool state).
  Active = 3, // Compass displayed and adjusting points.
}

/** @internal */
export enum ContextMode {
  Locked = 0,
  XAxis = 1,
  YAxis = 2,
  ZAxis = 3,
  XAxis2 = 4,
  None = 15,
}

/** @alpha */
export enum ItemField {
  DIST_Item = 0,
  ANGLE_Item = 1,
  X_Item = 2,
  Y_Item = 3,
  Z_Item = 4,
}

/** @internal */
export enum KeyinStatus {
  Dynamic = 0,
  Partial = 1,
  DontUpdate = 2,
}

const enum Constants { // eslint-disable-line no-restricted-syntax
  MAX_SAVED_VALUES = 20,
  SMALL_ANGLE = 1.0e-12,
  SMALL_DELTA = 0.00001,
}

/** @internal */
export class AccudrawData {
  public flags = 0; // AccuDrawFlags
  public readonly origin = new Point3d(); // used if ACCUDRAW_SetOrigin
  public readonly delta = new Point3d(); // if ACCUDRAW_Lock_X, etc.
  public readonly rMatrix = new Matrix3d(); // if ACCUDRAW_SetRMatrix/ACCUDRAW_Set3dMatrix
  public readonly vector = new Vector3d(); // if ACCUDRAW_SetXAxis, etc.
  public distance = 0; // if ACCUDRAW_SetDistance
  public angle = 0; // if ACCUDRAW_SetAngle
  public zero() { this.flags = this.distance = this.angle = 0; this.origin.setZero(); this.delta.setZero(); this.vector.setZero(); this.rMatrix.setIdentity(); }
}

/** @internal */
export class Flags {
  public redrawCompass = false;
  public dialogNeedsUpdate = false;
  public rotationNeedsUpdate = true;
  public lockedRotation = false;
  public indexLocked = false;
  public haveValidOrigin = false;
  public fixedOrg = false;
  public auxRotationPlane = RotationMode.Top;
  public contextRotMode = 0;
  public baseRotation = RotationMode.View;
  public baseMode = 0;
  public pointIsOnPlane = false; // whether rawPointOnPlane is on compass plane
  public softAngleLock = false;
  public bearingFixToPlane2D = false;
  public inDataPoint = false;
  public ignoreDataButton = false;
  public animateRotation = false;
}

/** @internal */
export class RoundOff {
  public active = false;
  public units = new Set<number>();
}

/** @internal */
export class SavedState {
  public state = CurrentState.NotEnabled;
  public mode = CompassMode.Polar;
  public rotationMode = RotationMode.View;
  public readonly axes = new ThreeAxes();
  public readonly origin = new Point3d();
  public auxRotationPlane = 0;
  public contextRotMode = 0;
  public fixedOrg = false;
  public ignoreDataButton = true; // By default the data point that terminates a view tool or input collector should be ignored...
  public ignoreFlags: AccuDrawFlags = 0;
}

/** @internal */
class SavedCoords {
  public nSaveValues = 0;
  public readonly savedValues: number[] = [];
  public readonly savedValIsAngle: boolean[] = [];
}

/** @internal */
export class ThreeAxes {
  public readonly x = Vector3d.unitX();
  public readonly y = Vector3d.unitY();
  public readonly z = Vector3d.unitZ();
  public setFrom(other: ThreeAxes) {
    this.x.setFrom(other.x);
    this.y.setFrom(other.y);
    this.z.setFrom(other.z);
  }
  public fromMatrix3d(rMatrix: Matrix3d): void {
    rMatrix.getRow(0, this.x);
    rMatrix.getRow(1, this.y);
    rMatrix.getRow(2, this.z);
  }
  public static createFromMatrix3d(rMatrix: Matrix3d, result?: ThreeAxes): ThreeAxes {
    result = result ? result : new ThreeAxes();
    result.fromMatrix3d(rMatrix);
    return result;
  }
  public toMatrix3d(out?: Matrix3d) { return Matrix3d.createRows(this.x, this.y, this.z, out); }
  public clone(): ThreeAxes { const out = new ThreeAxes(); out.setFrom(this); return out; }
  public equals(other: ThreeAxes): boolean { return this.x.isExactEqual(other.x) && this.y.isExactEqual(other.y) && this.z.isExactEqual(other.z); }
}

/** Accudraw is an aide for entering coordinate data.
 * @internal
 */
export class AccuDraw {
  /** @internal */
  public currentState = CurrentState.NotEnabled; // Compass state
  /** @internal */
  public compassMode = CompassMode.Rectangular; // Compass mode
  /** @internal */
  public rotationMode = RotationMode.View; // Compass rotation
  /** @internal */
  public currentView?: ScreenViewport; // will be nullptr if view not yet defined
  /** @internal */
  public readonly published = new AccudrawData(); // Staging area for hints
  /** @internal */
  public readonly origin = new Point3d(); // origin point...not on compass plane when z != 0.0
  /** @internal */
  public readonly axes = new ThreeAxes(); // X, Y and Z vectors (3d rotation matrix)
  /** @internal */
  public readonly delta = Vector3d.unitZ(); // dialog items (x, y & z)
  private _distance = 0; // current distance
  private _angle = 0; // current angle
  /** @internal */
  public locked = LockedStates.NONE_LOCKED; // axis/distance locked bit mask
  /** @internal */
  public indexed = LockedStates.NONE_LOCKED; // axis/distance indexed bit mask
  private readonly _distanceRoundOff = new RoundOff(); // distance round off enabled and unit
  private readonly _angleRoundOff = new RoundOff(); // angle round off enabled and unit
  /** @internal */
  public readonly flags = new Flags(); // current state flags
  private readonly _fieldLocked: boolean[] = []; // locked state of fields
  private readonly _keyinStatus: KeyinStatus[] = []; // state of input field
  /** @internal */
  public readonly savedStateViewTool = new SavedState(); // Restore point for shortcuts/tools...
  /** @internal */
  public readonly savedStateInputCollector = new SavedState(); // Restore point for shortcuts/tools...
  private readonly _savedCoords = new SavedCoords(); // History of previous angles/distances...
  /** @internal */
  public readonly baseAxes = new ThreeAxes(); // Used for "context" base rotation to hold arbitrary rotation w/o needing to change ACS...
  /** @internal */
  public readonly lastAxes = new ThreeAxes(); // Last result from UpdateRotation, replaces cM.rMatrix...
  private _lastDistance = 0; // previous saved distance or distance indexing tick
  private _tolerance = 0; // computed view based indexing tolerance
  private _percentChanged = 0; // Compass animation state
  private _threshold = 0; // Threshold for automatic x/y field focus change.
  /** @internal */
  public readonly planePt = new Point3d(); // same as origin unless non-zero locked z value
  private readonly _rawDelta = new Point2d(); // used by rect fix point
  private readonly _rawPoint = new Point3d(); // raw uor point passed to fix point
  private readonly _rawPointOnPlane = new Point3d(); // adjusted rawPoint by applying hard/soft construction plane
  /** @internal */
  public readonly point = new Point3d(); // current cursor point
  /** @internal */
  public readonly vector = Vector3d.unitZ(); // current/last good locked direction
  private _xIsNegative = false; // Last delta.x was negative
  private _yIsNegative = false; // Last delta.y was negative
  private _xIsExplicit = false; // Sign of delta.x established from user input input, don't allow +/- side flip.
  private _yIsExplicit = false; // Sign of delta.y established from user input input, don't allow +/- side flip.
  public dontMoveFocus = false; // Disable automatic focus change when user is entering input.
  /** @internal */
  public newFocus = ItemField.X_Item; // Item to move focus to (X_Item or Y_Item) for automatic focus change.
  private readonly _rMatrix = new Matrix3d();
  /** @internal */
  protected _acsPickId?: string;

  // Compass Display Preferences...
  /** @internal */
  protected _compassSizeInches = 0.44;
  /** @internal */
  protected _animationFrames = 12;
  /** @internal */
  protected _indexToleranceInches = 0.11;
  /** @internal */
  protected readonly _frameColor = ColorDef.create(ColorByName.lightGrey);
  /** @internal */
  protected readonly _fillColor = ColorDef.create(ColorByName.blue);
  /** @internal */
  protected readonly _xColor = ColorDef.create(ColorByName.red);
  /** @internal */
  protected readonly _yColor = ColorDef.create(ColorByName.green);
  /** @internal */
  protected readonly _indexColor = ColorDef.create(ColorByName.white);
  /** @internal */
  protected readonly _frameColorNoFocus = ColorDef.create(ColorByName.darkGrey);
  /** @internal */
  protected readonly _fillColorNoFocus = ColorDef.create(ColorByName.lightGrey);

  // User Preference Settings...
  public smartKeyin = true;
  public floatingOrigin = true;
  public stickyZLock = false;
  public alwaysShowCompass = false;
  public contextSensitive = true;
  public axisIndexing = true;
  public distanceIndexing = true;
  public autoFocusFields = true;
  public autoPointPlacement = false;
  private static _tempRot = new Matrix3d();

  /** @internal */
  public onInitialized() { this.enableForSession(); }
  /** @internal */
  public getRotation(rMatrix?: Matrix3d): Matrix3d { if (!rMatrix) rMatrix = this._rMatrix; Matrix3d.createRows(this.axes.x, this.axes.y, this.axes.z, rMatrix); return rMatrix; }

  public get isActive(): boolean { return CurrentState.Active === this.currentState; }
  public get isEnabled(): boolean { return (this.currentState > CurrentState.NotEnabled); }
  public get isInactive(): boolean { return (CurrentState.Inactive === this.currentState); }
  public get isDeactivated(): boolean { return (CurrentState.Deactivated === this.currentState); }
  /** @internal */
  protected setNewFocus(index: ItemField) { this.newFocus = index; }
  /** @internal */
  public getFieldLock(index: ItemField): boolean { return this._fieldLocked[index]; }
  /** @internal */
  public getKeyinStatus(index: ItemField): KeyinStatus { return this._keyinStatus[index]; }

  /** Implement this method to set focus to the AccuDraw UI.
   * @internal
   */
  public grabInputFocus() { }

  /** @internal */
  public activate(): void {
    // Upgrade state to inactive so upgradeToActiveState knows it is ok to move to active...
    if (CurrentState.Deactivated === this.currentState)
      this.currentState = CurrentState.Inactive;
    this.upgradeToActiveState();
  }

  /** @internal */
  public deactivate() {
    this.downgradeInactiveState();
    // Don't allow compass to come back until user re-enables it...
    if (CurrentState.Inactive === this.currentState)
      this.currentState = CurrentState.Deactivated;
  }

  /** @internal */
  public setCompassMode(mode: CompassMode): void {
    if (mode === this.compassMode) return;
    this.compassMode = mode;
    this.onCompassModeChange();
  }

  /** @internal */
  public setRotationMode(mode: RotationMode): void {
    if (mode === this.rotationMode) return;
    this.rotationMode = mode;
    this.onRotationModeChange();
  }

  /** @internal */
  public setFieldLock(index: ItemField, locked: boolean): void {
    if (locked === this._fieldLocked[index]) return;
    this._fieldLocked[index] = locked;
    this.onFieldLockChange(index);
  }

  /** @internal */
  public setKeyinStatus(index: ItemField, status: KeyinStatus): void {
    this._keyinStatus[index] = status;
    if (KeyinStatus.Dynamic !== status)
      this.dontMoveFocus = true;
    if (KeyinStatus.Partial === status)
      this._threshold = Math.abs(ItemField.X_Item === index ? this._rawDelta.y : this._rawDelta.x) + this._tolerance;
  }

  private needsRefresh(vp: Viewport): boolean {
    if (!this.isEnabled || this.isDeactivated)
      return false;

    // Get snap point from AccuSnap/Tentative or use raw point...
    let distance = 0.0;
    let snapPt = this._rawPoint;
    const ptP = this.point;
    const snap = TentativeOrAccuSnap.getCurrentSnap();

    if (snap) {
      snapPt = snap.snapPoint;
      distance = ptP.distance(snapPt);
    }

    const isRectMode = (CompassMode.Rectangular === this.compassMode);
    const offsetSnap = ((TentativeOrAccuSnap.isHot || IModelApp.tentativePoint.isActive) && ((this.locked) || (distance > 0.0)));

    // XY Offset:
    if (offsetSnap) {
      if (isRectMode) {
        let xIsOffset = false, yIsOffset = false;

        const vec = ptP.vectorTo(this._rawPointOnPlane);
        const xOffset = vec.dotProduct(this.axes.x);
        const yOffset = vec.dotProduct(this.axes.y);

        xIsOffset = (Math.abs(xOffset) > 1.0);
        yIsOffset = (Math.abs(yOffset) > 1.0);

        if (xIsOffset || yIsOffset)
          return true;
      }
    }

    const isOnCompassPlane = (!vp.view.is3d() || this.flags.pointIsOnPlane || this.isZLocked(vp));

    // Z Offset:
    if (offsetSnap) {
      if (isOnCompassPlane) {
        const zOffset = snapPt.distance(this._rawPointOnPlane);
        if (zOffset > Constants.SMALL_ANGLE || zOffset < -Constants.SMALL_ANGLE)
          return true;
      }
    }

    // Fat Point:
    if (offsetSnap)
      return true;

    let axisIsIndexed = false;

    // Axis Indexing:
    if (isRectMode) {
      if ((this.indexed & LockedStates.XY_BM) && (this.flags.pointIsOnPlane || this._fieldLocked[ItemField.Z_Item]))
        axisIsIndexed = true;
    } else {
      if ((this.indexed & LockedStates.ANGLE_BM || this.locked & LockedStates.ANGLE_BM) && (this.flags.pointIsOnPlane || this._fieldLocked[ItemField.Z_Item]))
        axisIsIndexed = true;
    }

    if (axisIsIndexed)
      return true;

    // Distance Indexing:
    if (this.indexed & LockedStates.DIST_BM)
      return true;

    // XY Lock:
    if (isRectMode) {
      const locked = this.locked & LockedStates.XY_BM;

      if ((0 !== locked) && isOnCompassPlane) {
        switch (locked) {
          case LockedStates.X_BM:
          case LockedStates.Y_BM:
          case LockedStates.XY_BM:
            return true;
        }
      }
    }

    return false;
  }

  /** @internal */
  public adjustPoint(pointActive: Point3d, vp: ScreenViewport, fromSnap: boolean): boolean {
    if (!this.isEnabled)
      return false;

    const lastWasIndexed = (0 !== this.indexed);
    let pointChanged = false, handled = false;

    if (0.0 !== pointActive.z && !vp.isPointAdjustmentRequired)
      pointActive.z = 0.0;

    if (1.0 !== vp.view.getAspectRatioSkew())
      this.downgradeInactiveState(); // Disable AccuDraw if skew is applied with AccuDraw already active...

    if (this.isInactive) {
      this.point.setFrom(pointActive);
      this.currentView = vp;

      this.fixPoint(pointActive, vp);

      if (!fromSnap && IModelApp.accuSnap.currHit)
        this.flags.redrawCompass = true;
    } else if (this.isActive) {
      const lastPt = this.point.clone();
      this.fixPoint(pointActive, vp);
      pointChanged = !lastPt.isExactEqual(this.point);
      this.processHints();
      handled = true;
    } else {
      this.currentView = vp; // Keep view up to date...
    }

    // If redraw of compass isn't required (yet!) check if needed...
    if (!this.flags.redrawCompass && this.isActive) {
      // Redraw required to erase/draw old/new indexing geometry...
      if (pointChanged && (lastWasIndexed || this.needsRefresh(vp)))
        this.flags.redrawCompass = true;
    }
    // Redraw is necessary, force decorators to be called...
    if (this.flags.redrawCompass)
      vp.invalidateDecorations();

    return handled;
  }

  private setDefaultOrigin(vp?: Viewport): void {
    if (!vp || this.locked || this._fieldLocked[ItemField.Z_Item])
      return;

    const view = vp.view;
    const rMatrix = view.getRotation();
    const acsOrigin = vp.getAuxCoordOrigin();
    rMatrix.multiplyVectorInPlace(acsOrigin);

    const origin = view.getCenter();
    view.getRotation().multiplyVectorInPlace(origin);
    origin.z = acsOrigin.z;
    view.getRotation().multiplyTransposeVectorInPlace(origin);

    this.origin.setFrom(origin); // View center at acs z...
    this.planePt.setFrom(origin);
  }

  /** @internal */
  public isZLocked(vp: Viewport): boolean {
    if (this._fieldLocked[ItemField.Z_Item])
      return true;
    if (vp.isSnapAdjustmentRequired) //  && TentativeOrAccuSnap.isHot())
      return true;

    return false;
  }

  /** @internal */
  public accountForAuxRotationPlane(rot: ThreeAxes, plane: RotationMode): void {
    // ACS mode now can have "front" and "side" variations...
    switch (plane) {
      case RotationMode.Top:
        return;

      case RotationMode.Front:
        const temp = rot.y.clone();
        rot.y.setFrom(rot.z);
        temp.scale(-1.0, rot.z);
        return;

      case RotationMode.Side:
        const temp0 = rot.x.clone();
        rot.x.setFrom(rot.y);
        rot.y.setFrom(rot.z);
        rot.z.setFrom(temp0);
    }
  }

  private accountForACSContextLock(vec: Vector3d): void {
    // Base rotation is relative to ACS when ACS context lock is enabled...
    if (!this.currentView || !this.currentView.isContextRotationRequired)
      return;

    const rMatrix = AccuDraw.getStandardRotation(StandardViewId.Top, this.currentView, true);
    rMatrix.multiplyTransposeVectorInPlace(vec);
  }

  private static useACSContextRotation(vp: Viewport, isSnap: boolean): boolean {
    if (isSnap) {
      if (!vp.isSnapAdjustmentRequired)
        return false;
    } else {
      if (!vp.isContextRotationRequired)
        return false;
    }
    return true;
  }

  /** Gets X, Y or Z vector from top, front, (right) side, ACS, or View. */
  private getStandardVector(whichVec: number): Vector3d {
    const vp = this.currentView;
    let rMatrix: Matrix3d;
    let myAxes: ThreeAxes;
    const vecP = Vector3d.createZero();
    switch (this.flags.baseRotation) {
      case RotationMode.Top:
        switch (whichVec) {
          case 0: vecP.x = 1.0; break;
          case 1: vecP.y = 1.0; break;
          case 2: vecP.z = 1.0; break;
        }
        this.accountForACSContextLock(vecP);
        break;

      case RotationMode.Front:
        switch (whichVec) {
          case 0: vecP.x = 1.0; break;
          case 1: vecP.z = 1.0; break;
          case 2: vecP.y = -1.0; break;
        }
        this.accountForACSContextLock(vecP);
        break;

      case RotationMode.Side:
        switch (whichVec) {
          case 0: vecP.y = 1.0; break;
          case 1: vecP.z = 1.0; break;
          case 2: vecP.x = 1.0; break;
        }
        this.accountForACSContextLock(vecP);
        break;

      case RotationMode.ACS:
        rMatrix = vp ? vp.getAuxCoordRotation() : Matrix3d.createIdentity();
        myAxes = ThreeAxes.createFromMatrix3d(rMatrix);
        this.accountForAuxRotationPlane(myAxes, this.flags.auxRotationPlane);
        switch (whichVec) {
          case 0: vecP.setFrom(myAxes.x); break;
          case 1: vecP.setFrom(myAxes.y); break;
          case 2: vecP.setFrom(myAxes.z); break;
        }
        break;

      case RotationMode.View:
        rMatrix = vp ? vp.rotation : Matrix3d.createIdentity();
        rMatrix.getRow(whichVec, vecP);
        break;

      case RotationMode.Context:
        myAxes = this.baseAxes.clone();
        this.accountForAuxRotationPlane(myAxes, this.flags.auxRotationPlane);
        switch (whichVec) {
          case 0: vecP.setFrom(myAxes.x); break;
          case 1: vecP.setFrom(myAxes.y); break;
          case 2: vecP.setFrom(myAxes.z); break;
        }
        break;
    }
    return vecP;
  }

  private getBestViewedRotationFromXVector(rotation: ThreeAxes, vp: Viewport): void {
    const viewZ = vp.rotation.getRow(2);
    const vec1 = this.getStandardVector(2);
    const vec2 = this.getStandardVector(1);
    const vec3 = this.getStandardVector(0);
    const rot1 = vec1.crossProduct(rotation.x);
    const rot2 = vec2.crossProduct(rotation.x);
    const rot3 = vec3.crossProduct(rotation.x);
    const useRot1 = (rot1.normalizeWithLength(rot1).mag > 0.00001);
    const useRot2 = (rot2.normalizeWithLength(rot2).mag > 0.00001);
    const useRot3 = (rot3.normalizeWithLength(rot3).mag > 0.00001);
    const dot1 = (useRot1 ? Math.abs(rotation.x.crossProduct(rot1).dotProduct(viewZ)) : -1.0);
    const dot2 = (useRot2 ? Math.abs(rotation.x.crossProduct(rot2).dotProduct(viewZ)) : -1.0);
    const dot3 = (useRot3 ? Math.abs(rotation.x.crossProduct(rot3).dotProduct(viewZ)) : -1.0);
    const max = Math.max(dot1, dot2, dot3);

    if (Geometry.isDistanceWithinTol(dot1 - dot2, 0.1) && (max !== dot3))
      rotation.y.setFrom(rot1);
    else if (max === dot1)
      rotation.y.setFrom(rot1);
    else if (max === dot2)
      rotation.y.setFrom(rot2);
    else
      rotation.y.setFrom(rot3);

    rotation.z.setFrom(rotation.x.crossProduct(rotation.y));
  }

  private getRotationFromVector(rotation: ThreeAxes, whichVec: number): void {
    let vec: Vector3d;
    switch (whichVec) {
      case 0:
        vec = this.getStandardVector(2);
        vec.crossProduct(rotation.x, rotation.y);

        if (rotation.y.normalizeWithLength(rotation.y).mag < .00001) {
          vec = this.getStandardVector(1);
          vec.crossProduct(rotation.x, rotation.y);
          rotation.y.normalizeInPlace();
        }

        rotation.x.crossProduct(rotation.y, rotation.z);
        break;

      case 1:
        vec = this.getStandardVector(2);
        vec.crossProduct(rotation.y, rotation.x);

        if (rotation.x.normalizeWithLength(rotation.x).mag < .00001) {
          vec = this.getStandardVector(0);
          vec.crossProduct(rotation.y, rotation.x);
          rotation.x.normalizeInPlace();
        }

        rotation.x.crossProduct(rotation.y, rotation.z);
        break;

      case 2:
        vec = this.getStandardVector(0);
        rotation.z.crossProduct(vec, rotation.y);

        if (rotation.y.normalizeWithLength(rotation.y).mag < .00001) {
          vec = this.getStandardVector(1);
          vec.crossProduct(rotation.z, rotation.x);
          rotation.x.normalizeInPlace();
          rotation.z.crossProduct(rotation.x, rotation.y);
        } else {
          rotation.y.crossProduct(rotation.z, rotation.x);
        }
        break;
    }
  }

  /** @internal */
  public updateRotation(animate: boolean = false, newRotationIn?: Matrix3d): void {
    let clearLocks = true;
    const oldRotation = this.axes.clone();
    let rMatrix: Matrix3d;
    let newRotation: ThreeAxes;

    if (!newRotationIn)
      newRotation = this.axes.clone(); // for axis based
    else
      newRotation = ThreeAxes.createFromMatrix3d(newRotationIn); // for animating context rotation change...

    const vp = this.currentView;
    const useACS = vp ? vp.isContextRotationRequired : false;

    switch (this.rotationMode) {
      case RotationMode.Top:
        // Get standard rotation relative to ACS when ACS context lock is enabled...
        newRotation.fromMatrix3d(AccuDraw.getStandardRotation(StandardViewId.Top, vp, useACS));
        this.flags.lockedRotation = true;
        break;

      case RotationMode.Front:
        // Get standard rotation relative to ACS when ACS context lock is enabled...
        newRotation.fromMatrix3d(AccuDraw.getStandardRotation(StandardViewId.Front, vp, useACS));
        this.flags.lockedRotation = true;
        break;

      case RotationMode.Side:
        // Get standard rotation relative to ACS when ACS context lock is enabled...
        newRotation.fromMatrix3d(AccuDraw.getStandardRotation(StandardViewId.Right, vp, useACS));
        this.flags.lockedRotation = true;
        break;

      case RotationMode.ACS:
        rMatrix = vp ? vp.getAuxCoordRotation() : Matrix3d.createIdentity();
        newRotation.fromMatrix3d(rMatrix);
        this.accountForAuxRotationPlane(newRotation, this.flags.auxRotationPlane);
        this.flags.lockedRotation = true;
        break;

      case RotationMode.View:
        rMatrix = vp ? vp.rotation : Matrix3d.createIdentity();
        newRotation.fromMatrix3d(rMatrix);
        this.flags.lockedRotation = false;
        break;

      case RotationMode.Context:
        switch (this.flags.contextRotMode) {
          case ContextMode.XAxis:
            this.getRotationFromVector(newRotation, 0);
            clearLocks = (LockedStates.Y_BM !== this.locked || !oldRotation.x.isExactEqual(newRotation.x)); // Try to keep locked axis when tool being unsuspended...
            break;

          case ContextMode.XAxis2:
            if (vp)
              this.getBestViewedRotationFromXVector(newRotation, vp); // Use base rotation axis that results in compass being most closely aligned to view direction....
            else
              this.getRotationFromVector(newRotation, 0);
            clearLocks = (LockedStates.Y_BM !== this.locked || !oldRotation.x.isExactEqual(newRotation.x)); // Try to keep locked axis when tool being unsuspended...
            break;

          case ContextMode.YAxis:
            this.getRotationFromVector(newRotation, 1);
            clearLocks = (LockedStates.X_BM !== this.locked || !oldRotation.y.isExactEqual(newRotation.y)); // Try to keep locked axis when tool being unsuspended...
            break;

          case ContextMode.ZAxis:
            this.getRotationFromVector(newRotation, 2);
            break;

          case ContextMode.Locked:
            break;
        }
        break;
    }

    const isChanged = !oldRotation.equals(newRotation);

    // unlock stuff if rotation has changed
    if (isChanged && clearLocks && (CompassMode.Rectangular === this.compassMode || !this._fieldLocked[ItemField.DIST_Item] || animate)) {
      this.locked = this.indexed = LockedStates.NONE_LOCKED;
      this.unlockAllFields();
    }

    this.axes.setFrom(newRotation);
    this.lastAxes.setFrom(newRotation);
    this.flags.redrawCompass = true;

    // If animate frame preference is set...
    if (!animate || !vp)
      return;

    // AccuDrawAnimatorPtr animator = AccuDrawAnimator:: Create();
    // viewport -> SetAnimator(* animator);
    // animator -> ChangeOfRotation(Matrix3d:: FromColumnVectors(oldRotation[0], oldRotation[1], oldRotation[2]));
  }

  /** @internal */
  public enableForSession(): void {
    if (CurrentState.NotEnabled === this.currentState)
      this.currentState = CurrentState.Inactive;
  }

  /** @internal */
  public disableForSession(): void {
    this.currentState = CurrentState.NotEnabled;
    this.flags.redrawCompass = true; // Make sure decorators are called so we don't draw (i.e. erase AccuDraw compass)
  }

  /** @internal */
  public setLastPoint(pt: Point3d): void {
    const viewport = this.currentView;
    if (!viewport)
      return;

    const ev = new BeButtonEvent({ point: pt, rawPoint: pt, viewPoint: viewport.worldToView(pt), viewport });
    IModelApp.toolAdmin.setAdjustedDataPoint(ev);
  }

  /** @internal */
  public async sendDataPoint(pt: Point3d, viewport: ScreenViewport): Promise<void> {
    const ev = new BeButtonEvent({ point: pt, rawPoint: pt, viewPoint: viewport.worldToView(pt), viewport, inputSource: InputSource.Mouse, isDown: true });

    // Send both down and up events...
    await IModelApp.toolAdmin.sendButtonEvent(ev);
    ev.isDown = false;
    return IModelApp.toolAdmin.sendButtonEvent(ev);
  }

  /** @internal */
  public clearTentative(): boolean {
    if (!IModelApp.tentativePoint.isActive)
      return false;

    const wasSnapped = IModelApp.tentativePoint.isSnapped;
    IModelApp.tentativePoint.clear(true);
    return wasSnapped;
  }

  /** @internal */
  public async doAutoPoint(index: ItemField, mode: CompassMode): Promise<void> {
    const vp = this.currentView;
    if (!vp)
      return;

    if (CompassMode.Polar === mode) {
      if (!this.autoPointPlacement)
        return;

      if (this._fieldLocked[ItemField.DIST_Item] && (this._fieldLocked[ItemField.ANGLE_Item] || this.indexed & LockedStates.ANGLE_BM) && KeyinStatus.Dynamic === this._keyinStatus[index]) {
        this.fixPointPolar(vp);
        return this.sendDataPoint(this.point, vp);
      }

      return;
    }

    if (this._fieldLocked[ItemField.X_Item] && this._fieldLocked[ItemField.Y_Item]) {
      if (!this.isActive) {
        if (!vp.view.is3d() || this._fieldLocked[ItemField.Z_Item]) {
          const globalOrigin = new Point3d();

          if (vp.view.isSpatialView())
            globalOrigin.setFrom(vp.view.iModel.globalOrigin);

          return this.sendDataPoint(globalOrigin.plus(this.delta), vp);
        }

        return;
      }

      if (!this.autoPointPlacement || KeyinStatus.Dynamic !== this._keyinStatus[index])
        return;

      this.origin.plus3Scaled(this.axes.x, this.delta.x, this.axes.y, this.delta.y, this.axes.z, this.delta.z, this.point);
      return this.sendDataPoint(this.point, vp);
    }

    if (!this.autoPointPlacement || KeyinStatus.Dynamic !== this._keyinStatus[index])
      return;

    if ((ItemField.X_Item === index && this._fieldLocked[ItemField.X_Item] && (this.indexed & LockedStates.Y_BM)) || (ItemField.Y_Item === index && this._fieldLocked[ItemField.Y_Item] && (this.indexed & LockedStates.X_BM))) {
      this.origin.plus3Scaled(this.axes.x, this.delta.x, this.axes.y, this.delta.y, this.axes.z, this.delta.z, this.point);
      return this.sendDataPoint(this.point, vp);
    }
  }

  /** @internal */
  public getValueByIndex(index: ItemField): number {
    switch (index) {
      case ItemField.X_Item: return this.delta.x;
      case ItemField.Y_Item: return this.delta.y;
      case ItemField.Z_Item: return this.delta.z;
      case ItemField.DIST_Item: return this._distance;
      case ItemField.ANGLE_Item: return this._angle;
      default:
        return 0.0;
    }
  }

  /** @internal */
  public setValueByIndex(index: ItemField, value: number): void {
    switch (index) {
      case ItemField.X_Item:
        this.delta.x = value;
        break;
      case ItemField.Y_Item:
        this.delta.y = value;
        break;
      case ItemField.Z_Item:
        this.delta.z = value;
        break;
      case ItemField.DIST_Item:
        this._distance = value;
        break;
      case ItemField.ANGLE_Item:
        this._angle = value;
        break;
    }
  }

  private updateVector(angle: number): void {
    this.vector.set(Math.cos(angle), Math.sin(angle), 0.0);
    const rMatrix = this.getRotation();
    rMatrix.multiplyTransposeVector(this.vector);
  }

  private stringToDistance(str: string): QuantityParseResult {
    const parserSpec = IModelApp.quantityFormatter.findParserSpecByQuantityType(QuantityType.Length);
    if(parserSpec)
      return parserSpec.parseToQuantityValue(str);
    return {ok: false, error: ParseError.InvalidParserSpec};
  }

  private stringToAngle(inString: string): QuantityParseResult {
    // Need to update once there is an official "Bearing" QuantityType. Once available then
    // use QuantityType.Angle for isBearing=false and "Bearing" for isBearing=true.
    const parserSpec = IModelApp.quantityFormatter.findParserSpecByQuantityType(QuantityType.Angle);
    if (parserSpec)
      return parserSpec.parseToQuantityValue(inString);
    return {ok: false, error: ParseError.InvalidParserSpec};
  }

  private updateFieldValue(index: ItemField, input: string, _out: { isBearing: boolean }): BentleyStatus {
    if (input.length === 0)
      return BentleyStatus.ERROR;

    if (input.length === 1)
      switch (input) {
        case ":":
        case "-":
        case "+":
        case ".":
          return BentleyStatus.ERROR;
      }

    let parseResult;

    switch (index) {
      case ItemField.DIST_Item:
        parseResult = this.stringToDistance(input);
        if (Parser.isParsedQuantity(parseResult)) {
          this._distance = parseResult.value;
          break;
        }
        return BentleyStatus.ERROR;

      case ItemField.ANGLE_Item:
        parseResult =this.stringToAngle(input);
        if (Parser.isParsedQuantity(parseResult)) {
          this._angle = parseResult.value;
          break;
        }
        return BentleyStatus.ERROR;

      case ItemField.X_Item:
        parseResult = this.stringToDistance(input);
        if (Parser.isParsedQuantity(parseResult)) {
          this.delta.x = parseResult.value;

          this._xIsExplicit = (input[0] === "+" || input[0] === "-");
          if (!this._xIsExplicit) {
            if (this.smartKeyin && this.isActive && this._xIsNegative === (this.delta.x >= 0.0))
              this.delta.x = -this.delta.x;
          }
          break;
        }
        return BentleyStatus.ERROR;

      case ItemField.Y_Item:
        parseResult = this.stringToDistance(input);
        if (Parser.isParsedQuantity(parseResult)) {
          this.delta.y = parseResult.value;

          this._yIsExplicit = (input[0] === "+" || input[0] === "-");
          if (!this._yIsExplicit) {
            if (this.smartKeyin && this.isActive && this._yIsNegative === (this.delta.y >= 0.0))
              this.delta.y = -this.delta.y;
          }
          break;
        }
        return BentleyStatus.ERROR;

      case ItemField.Z_Item:
        parseResult = this.stringToDistance(input);
        if (Parser.isParsedQuantity(parseResult)) {
          this.delta.z = parseResult.value;
          break;
        }
        return BentleyStatus.ERROR;
    }

    return BentleyStatus.SUCCESS;
  }

  /** @internal */
  public unlockAllFields(): void {
    this.locked = 0;

    if (CompassMode.Polar === this.compassMode) {
      if (this._fieldLocked[ItemField.DIST_Item])
        this.setFieldLock(ItemField.DIST_Item, false);

      if (this._fieldLocked[ItemField.ANGLE_Item])
        this.setFieldLock(ItemField.ANGLE_Item, false);
    } else {
      if (this._fieldLocked[ItemField.X_Item])
        this.setFieldLock(ItemField.X_Item, false);

      if (this._fieldLocked[ItemField.Y_Item])
        this.setFieldLock(ItemField.Y_Item, false);
    }

    if (this._fieldLocked[ItemField.Z_Item]) {
      if (this.stickyZLock)
        this.delta.z = 0.0;
      else
        this.setFieldLock(ItemField.Z_Item, false);
    }

    this.setKeyinStatus(ItemField.DIST_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.ANGLE_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.X_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.Y_Item, KeyinStatus.Dynamic);
    this.setKeyinStatus(ItemField.Z_Item, KeyinStatus.Dynamic);

    if (!this.smartKeyin)
      this.setFocusItem(CompassMode.Polar === this.compassMode ? ItemField.DIST_Item : ItemField.X_Item);

    this.dontMoveFocus = false;
  }

  /** produces the normal vector of the closest plane to the view which
   * contains inVec (uses true view rotation, never auxiliary)
   */
  private planeByVectorAndView(normalVec: Vector3d, inVec: Vector3d, vp: Viewport): boolean {
    if (!vp.view.is3d()) {
      normalVec.setFrom(Vector3d.unitZ());
      return true;
    }

    const viewNormal = vp.rotation.getRow(2);
    const yVec = viewNormal.crossProduct(inVec);

    if (!yVec.normalizeInPlace()) {
      normalVec.setFrom(viewNormal);
      return false;
    }

    inVec.crossProduct(yVec, normalVec);
    return true;
  }

  private handleDegeneratePolarCase(): void {
    if (!(this.locked & LockedStates.DIST_BM))
      this._distance = 0.0;

    if (this.locked & LockedStates.VEC_BM) {
      this._angle = Math.acos(this.vector.dotProduct(this.axes.x));
    } else if (this.locked & LockedStates.Y_BM) {
      this.vector.setFrom(this.axes.y);
      this._angle = Math.PI / 2.0;
      this.indexed = this.locked;
    } else if (this.locked & LockedStates.X_BM) {
      this.vector.setFrom(this.axes.x);
      this._angle = 0.0;
      this.indexed = this.locked;
    } else {
      // use last good vector
      this._angle = Math.acos(this.vector.dotProduct(this.axes.x));
    }
    this.origin.plusScaled(this.vector, this._distance, this.point);
  }

  private rawDeltaIsValid(rawDelta: number): boolean {
    /* Cursor Distance (*(+/-)) sense testing is not valid when raw delta is
       meaningless (0.0)...to make this change safer only reject the
       raw delta if unit or grid lock is also on. */
    if (0.0 !== rawDelta)
      return true;

    // The "I don't want grid lock" flag can be set by tools to override the default behavior...
    if (0 === (IModelApp.toolAdmin.toolState.coordLockOvr & CoordinateLockOverrides.Grid))
      return true;

    return (!IModelApp.toolAdmin.gridLock);
  }

  /** @internal */
  public async processFieldInput(index: ItemField, input: string, synchText: boolean): Promise<void> {
    const isBearing = false;

    if (BentleyStatus.SUCCESS !== this.updateFieldValue(index, input, { isBearing })) {
      const saveKeyinStatus = this._keyinStatus[index]; // Don't want this to change when entering '.', etc.
      this.updateFieldLock(index, false);
      this._keyinStatus[index] = saveKeyinStatus;
      return;
    }

    switch (index) {
      case ItemField.DIST_Item:
        this.distanceLock(synchText, true);
        await this.doAutoPoint(index, CompassMode.Polar);
        break;

      case ItemField.ANGLE_Item:
        this.setFieldLock(index, true);

        if (synchText) {
          this.onFieldValueChange(index);
          this.setKeyinStatus(index, KeyinStatus.Dynamic);
        }

        if (!isBearing || !this.flags.bearingFixToPlane2D)
          this.updateVector(this._angle);
        else
          this.vector.set(Math.cos(this._angle), Math.sin(this._angle), 0.0);

        this.locked |= LockedStates.VEC_BM;
        await this.doAutoPoint(index, CompassMode.Polar);
        break;

      case ItemField.X_Item:
      case ItemField.Y_Item:
        this.locked |= (ItemField.X_Item === index) ? LockedStates.X_BM : LockedStates.Y_BM;

      // falls through
      case ItemField.Z_Item:
        this.setFieldLock(index, true);
        if (synchText) {
          this.onFieldValueChange(index);
          this.setKeyinStatus(index, KeyinStatus.Dynamic);
        }

        await this.doAutoPoint(index, this.compassMode);
        break;
    }

    this.refreshDecorationsAndDynamics();
  }

  /** @internal */
  public updateFieldLock(index: ItemField, locked: boolean): void {
    if (locked) {
      if (!this._fieldLocked[index]) {
        this.setFieldLock(index, true);

        switch (index) {
          case ItemField.DIST_Item:
            this.distanceLock(true, false);
            break;

          case ItemField.ANGLE_Item:
            this.angleLock();
            break;

          case ItemField.X_Item:
            this.locked |= LockedStates.X_BM;
            break;

          case ItemField.Y_Item:
            this.locked |= LockedStates.Y_BM;
            break;

          case ItemField.Z_Item:
            break;
        }
      }
      return;
    }

    switch (index) {
      case ItemField.DIST_Item:
        this.locked &= ~LockedStates.DIST_BM;
        break;

      case ItemField.ANGLE_Item:
        this.locked &= ~LockedStates.VEC_BM;
        break;

      case ItemField.X_Item:
        this.locked &= ~LockedStates.X_BM;
        break;

      case ItemField.Y_Item:
        this.locked &= ~LockedStates.Y_BM;
        break;
    }

    if (index !== ItemField.Z_Item || !this.stickyZLock)
      this.setFieldLock(index, false);

    this.setKeyinStatus(index, KeyinStatus.Dynamic);
  }

  /** @internal */
  public static getSnapRotation(snap: SnapDetail, currentVp: Viewport | undefined, out?: Matrix3d): Matrix3d | undefined {
    const vp = (undefined !== currentVp) ? currentVp : snap.viewport;
    const rotation = out ? out : new Matrix3d();
    const viewZ = vp.rotation.rowZ();
    const snapLoc = (undefined !== snap.primitive ? snap.primitive.closestPoint(snap.snapPoint, false) : undefined);

    if (undefined !== snapLoc) {
      const frame = snap.primitive!.fractionToFrenetFrame(snapLoc.fraction);
      const frameZ = (undefined !== frame ? frame.matrix.columnZ() : Vector3d.unitZ());
      let xVec = (undefined !== frame ? frame.matrix.columnX() : Vector3d.unitX());
      const zVec = (vp.view.allow3dManipulations() ? (undefined !== snap.normal ? snap.normal.clone() : frameZ.clone()) : Vector3d.unitZ());

      if (!vp.isCameraOn && viewZ.isPerpendicularTo(zVec))
        zVec.setFrom(viewZ);

      xVec.normalizeInPlace();
      zVec.normalizeInPlace();

      let yVec = xVec.unitCrossProduct(zVec);

      if (undefined !== yVec) {
        const viewX = vp.rotation.rowX();
        if (snap.primitive instanceof LineString3d) {
          if (Math.abs(xVec.dotProduct(viewX)) < Math.abs(yVec.dotProduct(viewX)))
            xVec = yVec;
          if (xVec.dotProduct(viewX) < 0.0)
            xVec.negate(xVec);
        } else {
          const ray = snap.primitive!.fractionToPointAndUnitTangent(0.0);
          if (ray.direction.dotProduct(viewX) < 0.0 && ray.direction.dotProduct(xVec) > 0.0)
            xVec.negate(xVec);
        }

        if (zVec.dotProduct(viewZ) < 0.0)
          zVec.negate(zVec);

        yVec = xVec.unitCrossProduct(zVec);

        if (undefined !== yVec) {
          rotation.setColumns(xVec, yVec, zVec);
          Matrix3d.createRigidFromMatrix3d(rotation, AxisOrder.XZY, rotation);
          rotation.transposeInPlace();

          return rotation;
        }
      }
    }

    if (undefined !== snap.normal) {
      const zVec = (vp.view.allow3dManipulations() ? snap.normal.clone() : Vector3d.unitZ());

      if (!vp.isCameraOn && viewZ.isPerpendicularTo(zVec))
        zVec.setFrom(viewZ);

      zVec.normalizeInPlace();
      Matrix3d.createRigidHeadsUp(zVec, undefined, rotation);
      rotation.transposeInPlace();

      return rotation;
    }

    return undefined;
  }

  /** @internal */
  public static getStandardRotation(nStandard: StandardViewId, vp: Viewport | undefined, useACS: boolean, out?: Matrix3d): Matrix3d {
    const rMatrix = out ? out : new Matrix3d();
    rMatrix.setFrom(ViewState.getStandardViewMatrix(nStandard));
    const useVp = vp ? vp : IModelApp.viewManager.selectedView;
    if (!useACS || !useVp)
      return rMatrix;

    rMatrix.multiplyMatrixMatrix(useVp.getAuxCoordRotation(AccuDraw._tempRot), rMatrix);
    return rMatrix;
  }

  /** @internal */
  public static getCurrentOrientation(vp: Viewport, checkAccuDraw: boolean, checkACS: boolean, rMatrix?: Matrix3d): Matrix3d | undefined {
    if (checkAccuDraw && IModelApp.accuDraw.isActive)
      return IModelApp.accuDraw.getRotation(rMatrix);

    const useVp = vp ? vp : IModelApp.viewManager.selectedView;
    if (!useVp)
      return Matrix3d.createIdentity(rMatrix);

    if (checkACS && useVp.isContextRotationRequired)
      return useVp.getAuxCoordRotation(rMatrix);

    return useVp.rotation;
  }

  /** @internal */
  public static updateAuxCoordinateSystem(acs: AuxCoordSystemState, vp: Viewport, allViews: boolean = true): void {
    // When modeling with multiple spatial views open, you'd typically want the same ACS in all views...
    if (allViews && vp.view.isSpatialView()) {
      for (const otherVp of IModelApp.viewManager) {
        if (otherVp !== vp && otherVp.view.isSpatialView())
          otherVp.view.setAuxiliaryCoordinateSystem(acs);
      }
    }

    vp.view.setAuxiliaryCoordinateSystem(acs);

    // NOTE: Change AccuDraw's base rotation to ACS.
    IModelApp.accuDraw.setContext(AccuDrawFlags.OrientACS);
  }

  /** @internal */
  public distanceLock(synchText: boolean, saveInHistory: boolean): void {
    this.locked |= LockedStates.DIST_BM;

    if (!this._fieldLocked[ItemField.DIST_Item])
      this.setFieldLock(ItemField.DIST_Item, true);

    if (saveInHistory)
      this.saveCoordinate(ItemField.DIST_Item, this._distance);

    if (synchText) {
      this.onFieldValueChange(ItemField.DIST_Item);
      this.setKeyinStatus(ItemField.DIST_Item, KeyinStatus.Dynamic);
    }
  }

  /** @internal */
  public angleLock(): void {
    if (this.indexed & LockedStates.Y_BM)
      this.locked |= LockedStates.Y_BM;
    else if (this.indexed & LockedStates.X_BM)
      this.locked |= LockedStates.X_BM;
    else
      this.locked |= LockedStates.VEC_BM;

    this.clearTentative();

    if (!this._fieldLocked[ItemField.ANGLE_Item]) {
      this.setFieldLock(ItemField.ANGLE_Item, true);
      this.setKeyinStatus(ItemField.ANGLE_Item, KeyinStatus.Dynamic);
    }

    this.flags.lockedRotation = true;
    this.flags.softAngleLock = false;
  }

  /** @internal */
  public doLockAngle(isSnapped: boolean): void {
    if (CompassMode.Polar !== this.compassMode) {
      this.locked = LockedStates.NONE_LOCKED;
      this._rawPoint.setFrom(this.point);

      const vp = this.currentView;
      if (vp)
        this.fixPointPolar(vp);

      this.changeCompassMode(true);
    }

    this.setFieldLock(ItemField.ANGLE_Item, !this._fieldLocked[ItemField.ANGLE_Item]);

    if (this._fieldLocked[ItemField.ANGLE_Item]) {
      // Move focus to angle field...
      if (!isSnapped && this.autoFocusFields)
        this.setFocusItem(ItemField.ANGLE_Item);

      this.angleLock();

      if (!isSnapped)
        this.flags.softAngleLock = true;
    } else {
      this.locked &= ~LockedStates.ANGLE_BM;
      this.saveCoordinate(ItemField.ANGLE_Item, this._angle);
    }
  }

  /** @internal */
  public saveCoordinate(index: ItemField, value: number): void {
    const isAngle = (ItemField.ANGLE_Item === index);
    let currIndex = this._savedCoords.nSaveValues + 1;

    if (currIndex >= Constants.MAX_SAVED_VALUES)
      currIndex = 0;

    if (this._savedCoords.savedValues[this._savedCoords.nSaveValues] === value && this._savedCoords.savedValIsAngle[this._savedCoords.nSaveValues] === isAngle)
      return;

    if (isAngle) {
      // don't accept 0, 90, -90, and 180 degrees
      if (value === 0.0 || value === Math.PI || value === (Math.PI / 2.0) || value === -Math.PI)
        return;
    } else {
      // don't accept zero
      value = Math.abs(value);
      if (value < Constants.SMALL_ANGLE)
        return;
    }

    this._savedCoords.savedValues[currIndex] = value;
    this._savedCoords.savedValIsAngle[currIndex] = isAngle;
    this._savedCoords.nSaveValues = currIndex;

    if (!isAngle)
      this._lastDistance = value;
  }

  /** @internal */
  public changeCompassMode(animate: boolean = false): void {
    this.setCompassMode(CompassMode.Polar === this.compassMode ? CompassMode.Rectangular : CompassMode.Polar);

    const viewport = this.currentView;
    if (!animate || !viewport)
      return;

    // AccuDrawAnimatorPtr animator = AccuDrawAnimator:: Create();
    // viewport.setAnimator(* animator);
    // animator -> ChangeOfMode();
  }

  /** @internal */
  public changeBaseRotationMode(mode: RotationMode): void {
    if (mode > RotationMode.Context)
      return;

    if (RotationMode.Context === mode) {
      // See if it is better to stay with the current base rotation (only care about z)...
      if (RotationMode.Context !== this.flags.baseRotation) {
        const baseRMatrix = this.getBaseRotation();
        const baseZ = baseRMatrix.getRow(2);

        if (baseZ.isParallelTo(this.axes.z, true))
          return;
      }

      this.baseAxes.setFrom(this.axes);
      this.flags.auxRotationPlane = RotationMode.Top;
    }

    this.flags.baseRotation = mode;
  }

  private getBaseRotation(): Matrix3d {
    const vp = this.currentView;
    let baseRMatrix: Matrix3d;
    const useAcs = vp ? vp.isContextRotationRequired : false;
    switch (this.flags.baseRotation) {
      case RotationMode.Top: {
        baseRMatrix = AccuDraw.getStandardRotation(StandardViewId.Top, vp, useAcs)!;
        break;
      }

      case RotationMode.Front: {
        baseRMatrix = AccuDraw.getStandardRotation(StandardViewId.Front, vp, useAcs)!;
        break;
      }

      case RotationMode.Side: {
        baseRMatrix = AccuDraw.getStandardRotation(StandardViewId.Right, vp, useAcs)!;
        break;
      }

      case RotationMode.ACS: {
        baseRMatrix = vp ? vp.getAuxCoordRotation() : Matrix3d.createIdentity();
        const axes = ThreeAxes.createFromMatrix3d(baseRMatrix);
        this.accountForAuxRotationPlane(axes, this.flags.auxRotationPlane);
        axes.toMatrix3d(baseRMatrix);
        break;
      }

      case RotationMode.View: {
        baseRMatrix = vp ? vp.rotation : Matrix3d.createIdentity();
        break;
      }

      case RotationMode.Context: {
        const axes = new ThreeAxes();
        axes.setFrom(this.baseAxes);
        this.accountForAuxRotationPlane(axes, this.flags.auxRotationPlane);
        baseRMatrix = axes.toMatrix3d();
        break;
      }

      default: {
        baseRMatrix = Matrix3d.createIdentity();
        break;
      }
    }
    return baseRMatrix;
  }

  /** @internal */
  public setContextRotation(rMatrix: Matrix3d, locked: boolean, animate: boolean): void {
    this.flags.lockedRotation = locked;
    this.flags.contextRotMode = locked ? ContextMode.Locked : ContextMode.None;
    this.setRotationMode(RotationMode.Context);
    this.updateRotation(animate, rMatrix);
  }

  private clearContext(): void {
    this.published.flags = 0;
    this.flags.rotationNeedsUpdate = true;
    this.flags.fixedOrg = false;

    this.setNewFocus(ItemField.X_Item);
    this.unlockAllFields();

    if (this.rotationMode !== this.flags.baseRotation)
      this.setRotationMode(this.flags.baseRotation);

    if (this.compassMode !== this.flags.baseMode)
      this.setCompassMode(this.flags.baseMode);
  }

  /** @internal */
  public setContext(flags: AccuDrawFlags, originP?: Point3d, orientationP?: Matrix3d | Vector3d, deltaP?: Vector3d, distanceP?: number, angleP?: number, transP?: Transform): BentleyStatus {
    this.published.flags |= flags;

    if (flags & AccuDrawFlags.SetOrigin && originP) {
      this.published.origin.setFrom(originP);

      if (transP)
        transP.multiplyPoint3d(this.published.origin, this.published.origin);
    }

    if (deltaP) {
      this.published.delta.setFrom(deltaP);

      if (transP)
        this.published.delta.scaleInPlace(transP.matrix.columnX().magnitude());
    }

    if (typeof distanceP === "number") {
      this.published.distance = distanceP;

      if (transP)
        this.published.distance *= transP.matrix.columnX().magnitude();
    }

    if (typeof angleP === "number")
      this.published.angle = angleP;

    if (orientationP) {
      if (flags & AccuDrawFlags.SetXAxis || flags & AccuDrawFlags.SetNormal || flags & AccuDrawFlags.SetXAxis2) {
        this.published.vector.setFrom(orientationP as Vector3d);

        if (transP)
          transP.matrix.multiplyVectorInPlace(this.published.vector);

        this.published.vector.normalizeInPlace();
      } else if (flags & AccuDrawFlags.SetRMatrix) {
        this.published.rMatrix.setFrom(orientationP as Matrix3d);

        if (transP) {
          this.published.rMatrix.multiplyMatrixMatrix(transP.matrix, this.published.rMatrix);
          this.published.rMatrix.normalizeColumnsInPlace();
        }
      }
    }

    if (flags) {
      this.onEventCommon();
      if (!this.flags.haveValidOrigin)
        this.setDefaultOrigin(this.currentView);
    }

    return this.isEnabled ? BentleyStatus.SUCCESS : BentleyStatus.ERROR;
  }

  private onEventCommon(): void {
    if (this.published.flags & AccuDrawFlags.RedrawCompass) {
      this.flags.indexLocked = true;
      this.flags.redrawCompass = true;
    }

    if (this.published.flags & AccuDrawFlags.UpdateRotation) {
      this.flags.indexLocked = true;
      this.flags.contextRotMode = ContextMode.XAxis;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
      this.flags.indexLocked = true;
    }
  }

  /** @internal */
  public onPrimitiveToolInstall(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();
    this.saveLockedCoords();
    // Setup default starting tool state...
    this.currentState = CurrentState.Inactive;
    this.clearContext();
    if (this.alwaysShowCompass)
      this.activate();

    return false;
  }

  /** @internal */
  public onViewToolInstall(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();

    const tool = IModelApp.toolAdmin.activeTool;
    if (tool && !(tool instanceof ViewTool))
      this.saveState(this.savedStateViewTool); // Save AccuDraw state of tool being suspended...

    this.currentState = CurrentState.Deactivated; // Default to disabled for view tools.
    return false;
  }

  /** @internal */
  public onViewToolExit(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();
    this.restoreState(this.savedStateViewTool); // Restore AccuDraw state of suspended tool...
    return false;
  }

  /** @internal */
  public onInputCollectorInstall(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();

    const tool = IModelApp.toolAdmin.activeTool;
    if (tool && !(tool instanceof InputCollector))
      this.saveState(this.savedStateInputCollector); // Save AccuDraw state of tool being suspended...

    this.currentState = CurrentState.Inactive; // Default to inactive for input collectors.
    return false;
  }

  /** @internal */
  public onInputCollectorExit(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();
    this.restoreState(this.savedStateInputCollector); // Restore AccuDraw state of suspended tool...
    return false;
  }

  /** @internal */
  public saveState(stateBuffer: SavedState): void {
    stateBuffer.state = this.currentState;
    stateBuffer.mode = this.compassMode;
    stateBuffer.rotationMode = this.rotationMode;
    stateBuffer.axes.setFrom(this.axes);
    stateBuffer.origin.setFrom(this.origin);
    stateBuffer.auxRotationPlane = this.flags.auxRotationPlane;
    stateBuffer.contextRotMode = this.flags.contextRotMode;
    stateBuffer.fixedOrg = this.flags.fixedOrg;
    stateBuffer.ignoreDataButton = true;
    stateBuffer.ignoreFlags = 0;
  }

  /** @internal */
  public restoreState(stateBuffer: SavedState): void {
    if (0 === (stateBuffer.ignoreFlags & AccuDrawFlags.Disable)) {
      this.currentState = stateBuffer.state;
    }

    if (0 === (stateBuffer.ignoreFlags & AccuDrawFlags.SetOrigin)) {
      this.origin.setFrom(stateBuffer.origin);
      this.planePt.setFrom(stateBuffer.origin);
    }

    if (0 === (stateBuffer.ignoreFlags & AccuDrawFlags.SetRMatrix)) {
      this.axes.setFrom(stateBuffer.axes);
      this.setRotationMode(stateBuffer.rotationMode);
      this.flags.auxRotationPlane = stateBuffer.auxRotationPlane;
      this.flags.contextRotMode = stateBuffer.contextRotMode;
    }

    this.flags.fixedOrg = stateBuffer.fixedOrg;
    this.setCompassMode(stateBuffer.mode);
    this.updateRotation();

    if (stateBuffer.ignoreDataButton)
      this.flags.ignoreDataButton = (this.flags.inDataPoint ? true : false);
  }

  private getCompassPlanePoint(point: Point3d, vp: Viewport): boolean {
    point.setFrom(this.origin); // Isn't this just planePt?!? Maybe at display time it is not setup yet?!?
    if (this._fieldLocked[ItemField.Z_Item] && vp.view.is3d()) {
      if (0.0 !== this.delta.z && !(this.delta.z < Constants.SMALL_ANGLE && this.delta.z > -Constants.SMALL_ANGLE)) {
        point.addScaledInPlace(this.axes.z, this.delta.z);
        return true;
      }
    }
    return false;
  }

  private getDisplayTransform(vp: Viewport): Transform {
    const rMatrix = (!this.flags.animateRotation || 0.0 === this._percentChanged) ? this.axes.toMatrix3d() : this.lastAxes.toMatrix3d();
    const origin = new Point3d(); // Compass origin is adjusted by active z-lock...
    this.getCompassPlanePoint(origin, vp);
    const scale = vp.pixelsFromInches(this._compassSizeInches) * vp.getPixelSizeAtPoint(origin);

    rMatrix.transposeInPlace();
    rMatrix.scaleColumns(scale, scale, scale, rMatrix);
    return Transform.createRefs(origin, rMatrix);
  }

  private setIndexingTolerance(vp: Viewport) {
    const origin = new Point3d(); // Compass origin is adjusted by active z-lock...
    this.getCompassPlanePoint(origin, vp);
    this._tolerance = vp.pixelsFromInches(this._indexToleranceInches) * vp.getPixelSizeAtPoint(origin);
    if (Constants.SMALL_ANGLE > this._tolerance)
      this._tolerance = Constants.SMALL_ANGLE;
  }

  private displayAlignments(graphic: GraphicBuilder, vp: Viewport): void {
    const bgColor = vp.view.backgroundColor;
    const colorIndex = this._indexColor.adjustedForContrast(bgColor, 130);
    const origin = new Point3d(); // Compass origin is adjusted by active z-lock...
    // For non-zero Z value draw indicator line from plane point to compass origin...
    if (this.getCompassPlanePoint(origin, vp)) {
      const colorZ = this._frameColor.adjustedForContrast(bgColor, 155);
      graphic.setSymbology(colorZ, colorZ, 2);
      graphic.addLineString([origin, this.origin]);
      graphic.setSymbology(colorZ, colorZ, 4);
      graphic.addPointString([this.origin]);
    }

    // Get snap point from AccuSnap/Tentative or use raw point...
    let distance = 0.0;
    let snapPt = this._rawPoint;

    const snap = TentativeOrAccuSnap.getCurrentSnap();
    if (snap) {
      snapPt = snap.snapPoint;
      distance = this.point.distance(snapPt);
    }

    const isRectMode = (CompassMode.Rectangular === this.compassMode);
    const offsetSnap = ((TentativeOrAccuSnap.isHot || IModelApp.tentativePoint.isActive) && ((this.locked) || (distance > 0.0)));

    // XY Offset:
    if (offsetSnap) {
      if (isRectMode) {
        const vec = this.point.vectorTo(this._rawPointOnPlane);
        const xOffset = vec.dotProduct(this.axes.x);
        const yOffset = vec.dotProduct(this.axes.y);
        const xIsOffset = (Math.abs(xOffset) > 1.0);
        const yIsOffset = (Math.abs(yOffset) > 1.0);

        if (xIsOffset) {
          if (yIsOffset) {  /* both */
            const pts: Point3d[] = [
              this.point,
              this.point.plusScaled(this.axes.y, yOffset),
              this._rawPointOnPlane,
              this.point.plusScaled(this.axes.x, xOffset)];
            pts[4] = pts[0];
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(pts);
          } else {  /* just X */
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString([this.point, this._rawPointOnPlane]);
          }
        } else if (yIsOffset) {  /* just Y */
          graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
          graphic.addLineString([this.point, this._rawPointOnPlane]);
        }
      }
    }

    const isOnCompassPlane = (!vp.view.is3d() || this.flags.pointIsOnPlane || this.isZLocked(vp));

    // Z Offset:
    if (offsetSnap) {
      if (isOnCompassPlane) {
        if (isRectMode) {
          const zOffset = snapPt.distance(this._rawPointOnPlane);
          if (zOffset > Constants.SMALL_ANGLE || zOffset < -Constants.SMALL_ANGLE) {
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString([this._rawPointOnPlane, this._rawPoint]);
          }
        } else {
          graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
          graphic.addLineString([this.point, this._rawPoint]);
        }
      }
    }

    // Fat Point:
    if (offsetSnap) {
      graphic.setSymbology(colorIndex, colorIndex, 8);
      graphic.addPointString([this.point]);
    }

    let axisIsIndexed = false;

    // Axis Indexing:
    if (isRectMode) {
      if ((this.indexed & LockedStates.XY_BM) && (this.flags.pointIsOnPlane || this._fieldLocked[ItemField.Z_Item]))
        axisIsIndexed = true;
    } else {
      if ((this.indexed & LockedStates.ANGLE_BM || this.locked & LockedStates.ANGLE_BM) && (this.flags.pointIsOnPlane || this._fieldLocked[ItemField.Z_Item]))
        axisIsIndexed = true;
    }

    if (axisIsIndexed) {
      graphic.setSymbology(colorIndex, colorIndex, 4);
      graphic.addLineString([this.point, this.planePt]);
    }

    // Distance Indexing:
    if (this.indexed & LockedStates.DIST_BM) {
      const len = this._tolerance; // Show tick mark based on _GetIndexToleranceInches for length...
      let vec: Vector3d;

      if (isRectMode) {
        let index = this.indexed & LockedStates.XY_BM;

        if (!index)
          index = this.locked & LockedStates.XY_BM;

        vec = (index === LockedStates.X_BM) ? this.axes.x : this.axes.y;
      } else {
        const deltaVec = this.origin.vectorTo(this.point);
        vec = this.axes.z.crossProduct(deltaVec);
        vec.normalizeInPlace();
      }

      graphic.setSymbology(colorIndex, colorIndex, 3);
      graphic.addLineString([this.point.plusScaled(vec, len), this.point.plusScaled(vec, -len)]);
    }

    // XY Lock:
    if (isRectMode && !axisIsIndexed) {
      const locked = this.locked & LockedStates.XY_BM;

      if ((0 !== locked) && isOnCompassPlane) {
        const pts: Point3d[] = [this.point, this.point, this.point];

        if (locked & LockedStates.X_BM)
          pts[2].setFrom(this.planePt.plusScaled(this.axes.x, this.delta.x));

        if (locked & LockedStates.Y_BM)
          pts[0].setFrom(this.planePt.plusScaled(this.axes.y, this.delta.y));

        switch (locked) {
          case LockedStates.X_BM:
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString([pts[1], pts[2]]);
            break;

          case LockedStates.Y_BM:
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString([pts[0], pts[1]]);
            break;

          case LockedStates.XY_BM:
            graphic.setSymbology(colorIndex, colorIndex, 2, LinePixels.Code5);
            graphic.addLineString(pts);
            break;
        }
      }
    }
  }

  /** @internal */
  public testDecorationHit(id: string): boolean { return id === this._acsPickId; }
  /** @internal */
  public getDecorationGeometry(hit: HitDetail): GeometryStreamProps | undefined {
    if (!hit.viewport.viewFlags.acsTriad)
      return undefined;
    const geomData = GeomJson.Writer.toIModelJson(PointString3d.create(hit.viewport.view.auxiliaryCoordinateSystem.getOrigin()));
    if (undefined === geomData)
      return undefined;
    const acsGeom: GeometryStreamProps = [geomData];
    return acsGeom;
  }

  /** @internal */
  public decorate(context: DecorateContext) {
    if (context.viewport.viewFlags.acsTriad) {
      context.viewport.view.auxiliaryCoordinateSystem.display(context, (ACSDisplayOptions.CheckVisible | ACSDisplayOptions.Active));
      if (undefined === this._acsPickId)
        this._acsPickId = context.viewport.iModel.transientIds.next;
      const acsPickBuilder = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined, this._acsPickId);
      const color = ColorDef.blue.adjustedForContrast(context.viewport.view.backgroundColor, 50);
      acsPickBuilder.setSymbology(color, color, 6);
      acsPickBuilder.addPointString([context.viewport.view.auxiliaryCoordinateSystem.getOrigin()]);
      context.addDecorationFromBuilder(acsPickBuilder);
    }

    // Make sure this is cleared even if we do nothing...redraw might have been to make compass go away...
    this.flags.redrawCompass = false;

    // Check that AccuDraw is enabled...
    if (!this.isActive)
      return;

    const vp = context.viewport;
    if (this.currentView !== vp) // Do nothing if AccuDraw is not enabled for this view...
      return;

    this.setIndexingTolerance(vp);

    // Display indexing lines, distance locks, etc. without compass transform...
    let builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
    this.displayAlignments(builder, vp);
    context.addDecorationFromBuilder(builder);

    // Create a new graphics with the compass transform and scale so that compass size is 1.0...
    builder = context.createGraphicBuilder(GraphicType.WorldOverlay, this.getDisplayTransform(vp));

    const hasFocus = this.hasInputFocus;
    const bgColor = vp.view.backgroundColor;
    const frameColor = (hasFocus ? this._frameColor : this._frameColorNoFocus).adjustedForContrast(bgColor, 155);
    const fillColor = (hasFocus ? this._fillColor : this._fillColorNoFocus).adjustedForContrast(bgColor, 75);
    const xColor = (hasFocus ? this._xColor : this._frameColorNoFocus).adjustedForContrast(bgColor, 155);
    const yColor = (hasFocus ? this._yColor : this._frameColorNoFocus).adjustedForContrast(bgColor, 155);
    const shadowColor = frameColor;

    // Display compass frame...
    builder.setSymbology(shadowColor, fillColor, 1);
    const center = Point3d.createZero();

    if (this.flags.animateRotation || 0.0 === this._percentChanged) {
      if (CompassMode.Polar === this.compassMode) {
        const ellipse = Arc3d.createXYEllipse(center, 1, 1);
        builder.addArc(ellipse, true, true);
        builder.addArc(ellipse, false, false);
      } else {
        const pts: Point3d[] = [
          new Point3d(-1.0, 1.0, 0.0),
          new Point3d(1.0, 1.0, 0.0),
          new Point3d(1.0, -1.0, 0.0),
          new Point3d(-1.0, -1.0, 0.0)];
        pts[4] = pts[0].clone();
        builder.addShape(pts);
        builder.addLineString(pts);
      }
    } else {
      let nSides, radius;
      const minSides = 7, maxSides = 24, factor = 1.0 / 5.0;

      // if currently animating change to polar need to get larger radius...go between 1.0 && 1.0 * sqrt (2.0)
      if (CompassMode.Polar === this.compassMode) {
        nSides = minSides + Math.floor(maxSides * this._percentChanged);
        radius = 1.0 + factor - (factor * this._percentChanged);
      } else {
        nSides = (maxSides - Math.floor(maxSides * this._percentChanged)) + minSides;
        radius = 1.0 + (factor * this._percentChanged);
      }

      let angle = 0.0; const delta = (Math.PI * 2) / nSides;
      const pts: Point3d[] = [];

      for (let iSide = 0; iSide < nSides; iSide++, angle += delta)
        pts[iSide] = new Point3d(radius * Math.cos(angle), radius * Math.sin(angle), 0.0);
      pts[nSides] = pts[0].clone();

      builder.addShape(pts);
      builder.addLineString(pts);
    }

    // Display sticky z-lock indicator as frame inset...
    if (this._fieldLocked[ItemField.Z_Item] && this.stickyZLock && vp.view.is3d()) {
      builder.setSymbology(frameColor, fillColor, 1);

      if (CompassMode.Polar === this.compassMode) {
        const ellipse = Arc3d.createXYEllipse(center, .5, .5);
        builder.addArc(ellipse, false, false);
      } else {
        const pts: Point3d[] = [
          new Point3d(-0.5, 0.5, 0.0),
          new Point3d(0.5, 0.5, 0.0),
          new Point3d(0.5, -0.5, 0.0),
          new Point3d(-0.5, -0.5, 0.0)];
        pts[4] = pts[0].clone();
        builder.addLineString(pts);
      }
    }

    // Display compass center mark...
    builder.setSymbology(frameColor, frameColor, 8);
    builder.addPointString([center]);

    // Display positive "X" tick...
    builder.setSymbology(xColor, xColor, 4);
    builder.addLineString([new Point3d(1.2, 0.0, 0.0), new Point3d(0.8, 0.0, 0.0)]);

    // Display negative "X" tick...
    builder.setSymbology(frameColor, frameColor, 1);
    builder.addLineString([new Point3d(-1.2, 0.0, 0.0), new Point3d(-0.8, 0.0, 0.0)]);

    // Display positive "Y" tick...
    builder.setSymbology(yColor, yColor, 4);
    builder.addLineString([new Point3d(0.0, 1.2, 0.0), new Point3d(0.0, 0.8, 0.0)]);

    // Display negative "Y" tick...
    builder.setSymbology(frameColor, frameColor, 1);
    builder.addLineString([new Point3d(0.0, -1.2, 0.0), new Point3d(0.0, -0.8, 0.0)]);

    context.addDecorationFromBuilder(builder); // add compass as world overlay decorator
  }

  private checkRotation(): void {
    this.updateRotation();

    if (RotationMode.View === this.rotationMode || !this.flags.lockedRotation)
      return;

    const vp = this.currentView;
    if (!vp || vp.isCameraOn)
      return;

    const viewZRoot = vp.rotation.getRow(2);
    if (!this.axes.z.isPerpendicularTo(viewZRoot))
      return;

    const preferY = (Math.abs(this.axes.x.dotProduct(viewZRoot)) < Math.abs(this.axes.y.dotProduct(viewZRoot)));

    // NOTE: Cycle rotation to get one that isn't edge-on...
    switch (this.rotationMode) {
      case RotationMode.Top:
        this.setRotationMode(preferY ? RotationMode.Front : RotationMode.Side);
        break;
      case RotationMode.Front:
        this.setRotationMode(preferY ? RotationMode.Top : RotationMode.Side);
        break;
      case RotationMode.Side:
        this.setRotationMode(preferY ? RotationMode.Top : RotationMode.Front);
        break;
      case RotationMode.ACS:
        switch (this.flags.auxRotationPlane) {
          case RotationMode.Top:
            this.flags.auxRotationPlane = preferY ? RotationMode.Front : RotationMode.Side;
            break;
          case RotationMode.Front:
            this.flags.auxRotationPlane = preferY ? RotationMode.Top : RotationMode.Side;
            break;
          case RotationMode.Side:
            this.flags.auxRotationPlane = preferY ? RotationMode.Top : RotationMode.Front;
            break;
          default:
            return;
        }
        break;
      default:
        return;
    }

    this.updateRotation();
    this.flags.baseRotation = this.rotationMode;
  }

  private saveLockedCoords(): void {
    if (CompassMode.Polar === this.compassMode) {
      if (this._fieldLocked[ItemField.DIST_Item])
        this.saveCoordinate(ItemField.DIST_Item, this._distance);
      if (this._fieldLocked[ItemField.ANGLE_Item])
        this.saveCoordinate(ItemField.ANGLE_Item, this._angle);
    } else {
      if (this._fieldLocked[ItemField.X_Item])
        this.saveCoordinate(ItemField.X_Item, this.delta.x);
      if (this._fieldLocked[ItemField.Y_Item])
        this.saveCoordinate(ItemField.Y_Item, this.delta.y);
    }

    const vp = this.currentView;
    if (vp && vp.view.is3d()) {
      if (this._fieldLocked[ItemField.Z_Item])
        this.saveCoordinate(ItemField.Z_Item, this.delta.z);
    }
  }

  /** @internal */
  public onCompassModeChange(): void { }
  /** @internal */
  public onRotationModeChange(): void { }
  /** @internal */
  public onFieldLockChange(_index: ItemField) { }
  /** @internal */
  public onFieldValueChange(_index: ItemField) { }
  /** @internal */
  public get hasInputFocus() { return true; }
  /** @internal */
  public setFocusItem(_index: ItemField) { }

  private static getMinPolarMag(origin: Point3d): number {
    return (1.0e-12 * (1.0 + origin.magnitude()));
  }

  /** projects cursor onto plane in view, or returns an error */
  private constructionPlane(outPtP: Point3d, inPtP: Point3d, pointOnPlaneP: Point3d, normalVectorP: Vector3d, vp: Viewport, perpendicular: boolean): BentleyStatus {
    let fromPtP: Point3d;
    let dotProduct: number;
    let distance: number;
    let projectionVector = new Vector3d();

    if (perpendicular) {
      if (AccuDraw.useACSContextRotation(vp, true)) { // Project along ACS axis to AccuDraw plane...
        const rMatrix = vp.getAuxCoordRotation(AccuDraw._tempRot);
        const axes = ThreeAxes.createFromMatrix3d(rMatrix);
        this.accountForAuxRotationPlane(axes, this.flags.auxRotationPlane);
        linePlaneIntersect(outPtP, inPtP, axes.z, pointOnPlaneP, normalVectorP, false);
      } else {
        projectionVector = inPtP.vectorTo(pointOnPlaneP);
        distance = projectionVector.dotProduct(normalVectorP);
        inPtP.plusScaled(normalVectorP, distance, outPtP);
      }
    } else {
      const isCamera = vp.isCameraOn;
      if (vp.view.is3d() && isCamera) {
        const cameraPos = vp.view.getEyePoint();
        fromPtP = cameraPos;
        fromPtP.vectorTo(inPtP, projectionVector).normalizeInPlace();
      } else {
        const rMatrix = vp.rotation;
        fromPtP = inPtP;
        rMatrix.getRow(2, projectionVector);
      }

      dotProduct = projectionVector.dotProduct(normalVectorP);

      if (Math.abs(dotProduct) < Constants.SMALL_DELTA)
        return BentleyStatus.ERROR; // PARALLEL;

      distance = (normalVectorP.dotProduct(pointOnPlaneP) - normalVectorP.dotProduct(fromPtP)) / dotProduct;

      if (isCamera && distance < Constants.SMALL_DELTA)
        return BentleyStatus.ERROR; // BEHIND_EYE_POINT;

      fromPtP.plusScaled(projectionVector, distance, outPtP);
    }

    return BentleyStatus.SUCCESS;
  }

  /** @internal */
  public softConstructionPlane(outPtP: Point3d, inPtP: Point3d, pointOnPlaneP: Point3d, normalVectorP: Vector3d, vp: Viewport, isSnap: boolean): boolean {
    if (!vp.isPointAdjustmentRequired) {
      outPtP.setFrom(inPtP);
      return true;
    }

    if (isSnap) {
      outPtP.setFrom(inPtP);
      const delta = pointOnPlaneP.vectorTo(outPtP);
      return (Math.abs(normalVectorP.dotProduct(delta)) < Constants.SMALL_DELTA);
    }
    if (BentleyStatus.SUCCESS !== this.constructionPlane(outPtP, inPtP, pointOnPlaneP, normalVectorP, vp, false)) {
      const viewNormal = vp.rotation.getRow(2);
      this.constructionPlane(outPtP, inPtP, pointOnPlaneP, viewNormal, vp, false);
      this.constructionPlane(outPtP, outPtP, pointOnPlaneP, normalVectorP, vp, true);
      return false;
    }
    return true;
  }

  /** @internal */
  public hardConstructionPlane(outPtP: Point3d, inPtP: Point3d, pointOnPlaneP: Point3d, normalVectorP: Vector3d, vp: Viewport, isSnap: boolean): boolean {
    if (!vp.isPointAdjustmentRequired) {
      outPtP.setFrom(inPtP);
      return true;
    }

    if (BentleyStatus.SUCCESS !== this.constructionPlane(outPtP, inPtP, pointOnPlaneP, normalVectorP, vp, isSnap)) {
      const viewNormal = vp.rotation.getRow(2);
      this.constructionPlane(outPtP, inPtP, pointOnPlaneP, viewNormal, vp, false);
      this.constructionPlane(outPtP, outPtP, pointOnPlaneP, normalVectorP, vp, true);
    }

    return true;
  }

  private static allowAxisIndexing(pointIsOnPlane: boolean): boolean {
    // NOTE: Normally we don't want indexing overriding a hot snap location. The
    //       exception to this is nearest snap. If the nearest snap is in the plane
    //       of the AccuDraw compass, it is confusing not having axis indexing.
    if (!TentativeOrAccuSnap.isHot)
      return true;

    if (!pointIsOnPlane)
      return false;

    const snapDetail = IModelApp.accuSnap.getCurrSnapDetail();
    return (undefined !== snapDetail && (SnapMode.Nearest === snapDetail.snapMode));
  }

  private applyDistanceRoundOff(distance: number, vp: Viewport): number | undefined {
    if (!this._distanceRoundOff.active || !this._distanceRoundOff.units.size)
      return undefined;

    let roundValue = this._distanceRoundOff.units.values().next().value;

    if (this._distanceRoundOff.units.size > 1) {
      // NOTE: Set isn't ordered, find smallest entry...
      this._distanceRoundOff.units.forEach((thisRoundValue) => {
        if (thisRoundValue < roundValue)
          roundValue = thisRoundValue;
      });

      if (vp.viewDelta.magnitudeXY() < roundValue)
        return undefined; // Smallest rounding value is larger than view...don't use...

      const smallScreenDist = 0.0787402; // ~2 mm...
      const pixelSize = vp.getPixelSizeAtPoint(this.origin);
      const screenDist = vp.pixelsFromInches(smallScreenDist) * pixelSize;

      this._distanceRoundOff.units.forEach((thisRoundValue) => {
        if (thisRoundValue > roundValue && thisRoundValue < screenDist)
          roundValue = thisRoundValue;
      });
    }

    if (roundValue <= 0.0)
      return undefined;

    return roundValue * Math.floor((distance / roundValue) + 0.5);
  }

  private applyAngleRoundOff(angle: number, distance: number, vp: Viewport): number | undefined {
    if (!this._angleRoundOff.active || !this._angleRoundOff.units.size)
      return undefined;

    let roundValue = this._angleRoundOff.units.values().next().value;

    if (this._angleRoundOff.units.size > 1) {
      // NOTE: Set isn't ordered, find smallest entry...
      this._angleRoundOff.units.forEach((thisRoundValue) => {
        if (thisRoundValue < roundValue)
          roundValue = thisRoundValue;
      });

      const circumference = 2.0 * Math.PI * distance;
      const roundDist = circumference / ((2.0 * Math.PI) / roundValue);

      if (vp.viewDelta.magnitudeXY() < roundDist)
        return undefined; // Smallest rounding value is larger than view...don't use...

      const smallScreenDist = 0.0787402; // ~2 mm...
      const pixelSize = vp.getPixelSizeAtPoint(this.origin);
      const screenDist = vp.pixelsFromInches(smallScreenDist) * pixelSize;

      this._angleRoundOff.units.forEach((thisRoundValue) => {
        const thisRoundDist = circumference / ((2.0 * Math.PI) / thisRoundValue);
        if (thisRoundValue > roundValue && thisRoundDist < screenDist)
          roundValue = thisRoundValue;
      });
    }

    if (roundValue <= 0.0)
      return undefined;

    return roundValue * Math.floor((angle / roundValue) + 0.5);
  }

  /** @internal */
  public fixPointPolar(vp: Viewport): void {
    let angleChanged = false;
    let distChanged = false;
    const zLocked = this.isZLocked(vp);
    const xyCorrection = new Point3d();

    this.planePt.setFrom(this.origin);

    if (zLocked && !(this.delta.z < Constants.SMALL_ANGLE && this.delta.z > -Constants.SMALL_ANGLE))
      this.planePt.addScaledInPlace(this.axes.z, this.delta.z);

    if (this.locked & LockedStates.VEC_BM) {
      if (!TentativeOrAccuSnap.isHot) {
        const normVec = new Vector3d();
        this.planeByVectorAndView(normVec, this.vector, vp);
        this.softConstructionPlane(this._rawPointOnPlane, this._rawPoint, this.planePt, normVec, vp, false);
      } else {
        this._rawPointOnPlane.setFrom(this._rawPoint);
        this.flags.pointIsOnPlane = false;
      }
    } else {
      if (zLocked) {
        this.hardConstructionPlane(this._rawPointOnPlane, this._rawPoint, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot);
        this.flags.pointIsOnPlane = true;
      } else {
        this.flags.pointIsOnPlane = (this.softConstructionPlane(this._rawPointOnPlane, this._rawPoint, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot) || !!(this.locked & LockedStates.XY_BM));
      }
    }

    let delta: Vector3d;
    if (zLocked)
      delta = this.planePt.vectorTo(this._rawPointOnPlane);
    else
      delta = this.origin.vectorTo(this._rawPointOnPlane);

    const minPolarMag = AccuDraw.getMinPolarMag(this.origin);

    let mag: number;
    if (this.locked & LockedStates.VEC_BM) {
      mag = delta.dotProduct(this.vector);
      xyCorrection.x -= delta.x - mag * this.vector.x;
      xyCorrection.y -= delta.y - mag * this.vector.y;
      xyCorrection.z -= delta.z - mag * this.vector.z;
      this.vector.scale(mag, delta);
      if (mag < 0.0)
        mag = -mag;
      if (mag < minPolarMag) {
        this.handleDegeneratePolarCase();
        return;
      }

      this.flags.pointIsOnPlane = (Math.abs(this.axes.z.dotProduct(delta)) < Constants.SMALL_DELTA);
    } else {
      mag = delta.magnitude();
      if (mag < minPolarMag) {
        this.handleDegeneratePolarCase();
        return;
      }
    }

    const newPt = this._rawPointOnPlane.plus(xyCorrection);
    xyCorrection.setZero();

    // measure angle
    const rotVec = new Point3d();
    rotVec.x = this.axes.x.dotProduct(delta);

    // NOTE: Always return angle relative to compass plane...used to return "angle out of plane" for points off plane.
    rotVec.y = this.axes.y.dotProduct(delta);
    this._angle = Math.atan2(rotVec.y, rotVec.x);

    // constrain angle
    if (this.flags.pointIsOnPlane && !(this.locked & LockedStates.VEC_BM)) {
      if (!TentativeOrAccuSnap.isHot) {
        const newAngle = this.applyAngleRoundOff(this._angle, mag, vp);
        if (undefined !== newAngle) {
          angleChanged = true;
          this._angle = newAngle;
          xyCorrection.x += Math.cos(this._angle) * mag - rotVec.x;
          xyCorrection.y += Math.sin(this._angle) * mag - rotVec.y;
          rotVec.x = Math.cos(this._angle) * mag;
          rotVec.y = Math.sin(this._angle) * mag;
        }
      }

      if (this.locked & LockedStates.X_BM || (AccuDraw.allowAxisIndexing(this.flags.pointIsOnPlane) && (rotVec.x < this._tolerance && rotVec.x > - this._tolerance) && !this.flags.indexLocked && this.axisIndexing)) {
        this.indexed |= LockedStates.X_BM; // indexed in X

        xyCorrection.x -= rotVec.x;
        rotVec.x = 0.0;

        if (TentativeOrAccuSnap.isHot)
          xyCorrection.z -= delta.dotProduct(this.axes.z);

        this._angle = (rotVec.y < 0.0) ? -Math.PI / 2.0 : Math.PI / 2.0;
        angleChanged = true;
      }

      if (this.locked & LockedStates.Y_BM || (AccuDraw.allowAxisIndexing(this.flags.pointIsOnPlane) && (rotVec.y < this._tolerance && rotVec.y > -this._tolerance) && !this.flags.indexLocked && this.axisIndexing)) {
        if (this.indexed & LockedStates.X_BM) { // both indexed
          this.handleDegeneratePolarCase();
          return;
        }

        this.indexed |= LockedStates.Y_BM; // indexed in Y
        xyCorrection.y -= rotVec.y;

        if (TentativeOrAccuSnap.isHot)
          xyCorrection.z -= delta.dotProduct(this.axes.z);

        rotVec.y = 0.0;
        this._angle = (rotVec.x < 0.0) ? Math.PI : 0.0;
        angleChanged = true;
      }

      if (angleChanged) {
        this.axes.x.scale(rotVec.x, delta);
        delta.addScaledInPlace(this.axes.y, rotVec.y);
        mag = delta.magnitude();
        if (mag < minPolarMag) {
          this.handleDegeneratePolarCase();
          return;
        }
      }
    }

    // constrain distance
    const oldMag = mag;

    if (this.locked & LockedStates.DIST_BM) { // distance locked
      mag = this._distance;
      distChanged = true;
      this.indexed &= ~LockedStates.DIST_BM;
    } else if (!TentativeOrAccuSnap.isHot) { // if non-snap, try rounding and aligning
      const newDist = this.applyDistanceRoundOff(mag, vp);
      if (undefined !== newDist) {
        distChanged = true;
        mag = newDist;
      }

      if (Geometry.isDistanceWithinTol(mag - this._lastDistance, this._tolerance) && !this.flags.indexLocked && this.distanceIndexing) {
        this.indexed |= LockedStates.DIST_BM; // distance indexed
        mag = this._lastDistance;
        distChanged = true;
      }
    }

    // project to corrected point
    newPt.plus3Scaled(this.axes.x, xyCorrection.x, this.axes.y, xyCorrection.y, this.axes.z, xyCorrection.z, newPt);

    // display index highlight even if snapped
    if (TentativeOrAccuSnap.isHot && this.flags.pointIsOnPlane) {
      if (Math.abs(rotVec.x) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.X_BM;
      else if (Math.abs(rotVec.y) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.Y_BM;
    }

    if (distChanged) {
      if (mag < minPolarMag && mag > -minPolarMag) {
        this.handleDegeneratePolarCase();
        return;
      }

      // adjust corrected point for distance indexing
      newPt.addScaledInPlace(delta, mag / oldMag - 1.0);
      delta.scaleInPlace(mag / oldMag);
    }

    // save corrected point
    this.point.setFrom(newPt);

    // finish up
    this._distance = mag;

    if (!(this.locked & LockedStates.VEC_BM))
      delta.scale(1.0 / mag, this.vector);

    if (this.locked & LockedStates.XY_BM)
      this.indexed |= this.locked;

    if (!zLocked)
      this.delta.z = (this.flags.pointIsOnPlane) ? 0.0 : delta.dotProduct(this.axes.z);
  }

  /** @internal */
  public fixPointRectangular(vp: Viewport): void {
    const zLocked = this.isZLocked(vp);
    const xyCorrection = new Vector3d();

    this.planePt.setFrom(this.origin);
    this.indexed = 0;

    if (zLocked) {
      this.flags.pointIsOnPlane = (this.delta.z < Constants.SMALL_ANGLE && this.delta.z > -Constants.SMALL_ANGLE);
      if (!this.flags.pointIsOnPlane)
        this.planePt.addScaledInPlace(this.axes.z, this.delta.z);
      this.hardConstructionPlane(this._rawPointOnPlane, this._rawPoint, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot);
    } else {
      this.flags.pointIsOnPlane = this.softConstructionPlane(this._rawPointOnPlane, this._rawPoint, this.origin, this.axes.z, vp, TentativeOrAccuSnap.isHot);
    }

    const trueDelta = this.origin.vectorTo(this._rawPointOnPlane);
    this._rawDelta.x = trueDelta.dotProduct(this.axes.x);
    this._xIsNegative = (this._rawDelta.x < -Constants.SMALL_ANGLE);

    this._rawDelta.y = trueDelta.dotProduct(this.axes.y);
    this._yIsNegative = (this._rawDelta.y < -Constants.SMALL_ANGLE);

    if (!zLocked)
      this.delta.z = (this.flags.pointIsOnPlane) ? 0.0 : trueDelta.dotProduct(this.axes.z);

    if (AccuDraw.allowAxisIndexing(this.flags.pointIsOnPlane)) {
      if (!(this.locked & LockedStates.X_BM)) { // not locked in x
        const roundedDeltaX = this.applyDistanceRoundOff(this._rawDelta.x, vp); // round x
        if (undefined !== roundedDeltaX) {
          xyCorrection.x = roundedDeltaX - this._rawDelta.x;
          this._rawDelta.x = roundedDeltaX;
        }

        if (this._rawDelta.x < this._tolerance && this._rawDelta.x > -this._tolerance &&
          !this.flags.indexLocked && this.axisIndexing) { // index x
          this.indexed |= LockedStates.X_BM; // indexed in X
          xyCorrection.x -= this._rawDelta.x;
          this._rawDelta.x = 0.0;
        }
      }
      if (!(this.locked & LockedStates.Y_BM)) {
        const roundedDeltaY = this.applyDistanceRoundOff(this._rawDelta.y, vp); // round y
        if (undefined !== roundedDeltaY) {
          xyCorrection.y = roundedDeltaY - this._rawDelta.y;
          this._rawDelta.y = roundedDeltaY;
        }

        if (this._rawDelta.y < this._tolerance && this._rawDelta.y > -this._tolerance &&
          !this.flags.indexLocked && this.axisIndexing) { // index y
          this.indexed |= LockedStates.Y_BM; // indexed in Y
          xyCorrection.y -= this._rawDelta.y;
          this._rawDelta.y = 0.0;
        }
      }
    }

    if (this.locked & LockedStates.X_BM) {
      if (this.rawDeltaIsValid(this._rawDelta.x)) {
        // cursor changed sides, reverse value
        if ((this.delta.x < -Constants.SMALL_ANGLE) !== this._xIsNegative &&
          this.smartKeyin && this._keyinStatus[ItemField.X_Item] === KeyinStatus.Partial &&
          !this._xIsExplicit)
          this.delta.x = -this.delta.x;
      }

      xyCorrection.x = this.delta.x - this._rawDelta.x;
    } else {
      const lastDist = (this._rawDelta.x < 0.0) ? (-this._lastDistance) : this._lastDistance;

      if (!TentativeOrAccuSnap.isHot && ((this.locked & LockedStates.Y_BM) || (this.indexed & LockedStates.Y_BM)) && !(this.indexed & LockedStates.X_BM) &&
        Geometry.isDistanceWithinTol(this._rawDelta.x - lastDist, this._tolerance) &&
        !this.flags.indexLocked && this.distanceIndexing) {
        xyCorrection.x += lastDist - this._rawDelta.x;
        this.delta.x = lastDist;
        this.indexed |= LockedStates.DIST_BM;
      } else {
        this.delta.x = this._rawDelta.x;
      }
    }

    if (this.locked & LockedStates.Y_BM) {
      if (this.rawDeltaIsValid(this._rawDelta.y)) {
        // cursor changed sides, reverse value
        if ((this.delta.y < -Constants.SMALL_ANGLE) !== this._yIsNegative &&
          this.smartKeyin && this._keyinStatus[ItemField.Y_Item] === KeyinStatus.Partial &&
          !this._yIsExplicit)
          this.delta.y = -this.delta.y;
      }

      xyCorrection.y = this.delta.y - this._rawDelta.y;
    } else {
      const lastDist = (this._rawDelta.y < Constants.SMALL_ANGLE) ? - this._lastDistance : this._lastDistance;

      if (!TentativeOrAccuSnap.isHot && ((this.locked & LockedStates.X_BM) || (this.indexed & LockedStates.X_BM)) && !(this.indexed & LockedStates.Y_BM) &&
        Geometry.isDistanceWithinTol(this._rawDelta.y - lastDist, this._tolerance) &&
        !this.flags.indexLocked && this.distanceIndexing) {
        xyCorrection.y += lastDist - this._rawDelta.y;
        this.delta.y = lastDist;
        this.indexed |= LockedStates.DIST_BM;
      } else {
        this.delta.y = this._rawDelta.y;
      }
    }

    this._rawPointOnPlane.plus2Scaled(this.axes.x, xyCorrection.x, this.axes.y, xyCorrection.y, this.point);

    if (zLocked && !this.flags.pointIsOnPlane)
      this.hardConstructionPlane(this.point, this.point, this.planePt, this.axes.z, vp, TentativeOrAccuSnap.isHot);

    if ((this.locked & LockedStates.X_BM && this.delta.x === 0.0) || (this.locked & LockedStates.Y_BM && this.delta.y === 0.0)) {
      this.indexed |= this.locked; // to display index highlight
    } else if (TentativeOrAccuSnap.isHot) {
      if (Math.abs(this.delta.x) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.X_BM;
      else if (Math.abs(this.delta.y) < Constants.SMALL_ANGLE)
        this.indexed |= LockedStates.Y_BM;
    }

    const lock = this.locked & LockedStates.XY_BM;
    const index = this.indexed & LockedStates.XY_BM;

    if (lock === LockedStates.Y_BM && index !== LockedStates.X_BM) {
      if (this._keyinStatus[ItemField.Y_Item] !== KeyinStatus.Dynamic) {
        if (Math.abs(this._rawDelta.x) < this._threshold)
          return;
      }

      this.newFocus = ItemField.X_Item;
      this.dontMoveFocus = false;
    } else if (lock === LockedStates.X_BM && index !== LockedStates.Y_BM) {
      if (this._keyinStatus[ItemField.X_Item] !== KeyinStatus.Dynamic) {
        if (Math.abs(this._rawDelta.y) < this._threshold)
          return;
      }

      this.newFocus = ItemField.Y_Item;
      this.dontMoveFocus = false;
    } else {
      this.newFocus = ((Math.abs(this._rawDelta.x) > Math.abs(this._rawDelta.y)) ? ItemField.X_Item : ItemField.Y_Item);
    }
  }

  private fixPoint(pointActive: Point3d, vp: ScreenViewport): void {
    if (this.isActive && ((vp !== this.currentView) || this.flags.rotationNeedsUpdate)) {
      this.currentView = vp;

      if (!(this.locked & LockedStates.ANGLE_BM || this._fieldLocked[ItemField.Z_Item])) {
        // origin not locked down...may change when vie changes...
        if (!this.flags.haveValidOrigin)
          this.setDefaultOrigin(vp);

        // in a view based rotation, and the view has changed, so update the rotation...
        if (!this.flags.lockedRotation) {
          this.updateRotation();
          this.flags.rotationNeedsUpdate = false;
        }
      }
    }
    if (this.isInactive || this.isDeactivated) {
      this.point.setFrom(pointActive);
      this.currentView = vp;
      this.processHints();
      return;
    }
    if (this.isActive) {
      this._rawPoint.setFrom(pointActive);
      this.currentView = vp;
      this.flags.dialogNeedsUpdate = true;

      if (TentativeOrAccuSnap.isHot && CompassMode.Polar === this.compassMode)
        this.indexed = this.locked;
      else
        this.indexed = LockedStates.NONE_LOCKED;

      if (CompassMode.Polar === this.compassMode)
        this.fixPointPolar(vp);
      else
        this.fixPointRectangular(vp);

      pointActive.setFrom(this.point);
    } else if (CompassMode.Rectangular === this.compassMode) {
      if (this._fieldLocked[ItemField.X_Item])
        pointActive.x = this.delta.x;

      if (this._fieldLocked[ItemField.Y_Item])
        pointActive.y = this.delta.y;

      if (this._fieldLocked[ItemField.Z_Item])
        pointActive.z = this.delta.z;
    }
  }

  /** @internal */
  public refreshDecorationsAndDynamics(): void {
    // Immediately process hints and show dynamics using adjusted point when not called from button down...
    if (!this.flags.inDataPoint)
      this.processHints();

    // Make sure AccuDraw updates its decorations...
    if (undefined !== this.currentView)
      this.currentView.invalidateDecorations();

    // Make sure active tool updates its dynamics. NOTE: Need point adjusted for new locks, etc.
    IModelApp.toolAdmin.updateDynamics(undefined, undefined, true);
  }

  /** @internal */
  public upgradeToActiveState(): boolean {
    if (!this.isEnabled)
      return false;

    this.onEventCommon();

    if (!this.isInactive)
      return false;

    const vp = this.currentView;
    if (!vp || 1.0 !== vp.view.getAspectRatioSkew())
      return false; // Disallow AccuDraw being enabled for exaggerated views...

    // NOTE: If ACS Plane lock setup initial and base rotation to ACS...
    if (vp && AccuDraw.useACSContextRotation(vp, false)) {
      this.setRotationMode(RotationMode.ACS);
      this.flags.baseRotation = RotationMode.ACS;
      this.flags.auxRotationPlane = RotationMode.Top;
    }

    if (this.published.flags & AccuDrawFlags.SmartRotation) {
      const snap = TentativeOrAccuSnap.getCurrentSnap(false);
      if (undefined !== snap) {
        const rotation = AccuDraw.getSnapRotation(snap, vp);
        if (undefined !== rotation) {
          this.setContextRotation(rotation, true, false);
          this.changeBaseRotationMode(RotationMode.Context);
        }
      }
    }

    this.checkRotation();

    // Compass will jump to correct location when fixPoint is called...but we don't want to see the jump...
    if (!this.flags.haveValidOrigin)
      this.setDefaultOrigin(vp);

    // Initialize rawPoint data...invalid for alignments until next fixPoint...
    this._rawPoint.setFrom(this.point);
    this._rawPointOnPlane.setFrom(this.point);

    // Upgrade state to enabled...want compass to display...
    this.currentState = CurrentState.Active;

    return false;
  }

  /** @internal */
  public downgradeInactiveState(): boolean {
    if (!this.isEnabled)
      return false;
    this.onEventCommon();
    if (!this.isActive)
      return false;
    // Downgrade state back to inactive...
    this.currentState = CurrentState.Inactive;
    return false;
  }

  /** @internal */
  public onBeginDynamics(): boolean { return this.upgradeToActiveState(); }
  /** @internal */
  public onEndDynamics(): boolean { return this.downgradeInactiveState(); }

  /** Implemented by sub-classes to update ui fields to show current deltas or coordinates when inactive.
   * Should also choose active x or y input field in rectangular mode based on cursor position when
   * axis isn't locked to support "smart lock".
   * @internal
   */
  public onMotion(_ev: BeButtonEvent): void { }

  /** @internal */
  public onPreButtonEvent(ev: BeButtonEvent): boolean {
    if (BeButton.Reset === ev.button && !ev.isDown && !ev.isDragging) {
      if (IModelApp.tentativePoint.isActive && this.isActive) {
        IModelApp.tentativePoint.clear(true);
        this.refreshDecorationsAndDynamics();
        return true;
      }

      if (this.isEnabled)
        this.onEventCommon();
      return false;
    }

    if (BeButton.Data !== ev.button || !ev.isDown || !this.isEnabled)
      return false;

    this.onEventCommon();
    this.flags.inDataPoint = true;
    if (this.currentState < CurrentState.Inactive)
      return false;
    if (!this.currentView)
      this.currentView = ev.viewport;
    this.updateRotation();
    return false;
  }

  /** @internal */
  public onPostButtonEvent(ev: BeButtonEvent): boolean {
    if (BeButton.Data !== ev.button || !ev.isDown || !this.isEnabled)
      return false;

    this.onEventCommon();

    if (this.flags.ignoreDataButton) {
      // NOTE: Ignore this data point, was used to terminate a viewing command or input collector...
      this.flags.ignoreDataButton = false;
    } else if (!this.flags.fixedOrg && this.currentState >= CurrentState.Inactive) {
      /* set origin to last point placed unless its being set elsewhere */
      if (((!this.contextSensitive &&
        !(this.published.flags & (AccuDrawFlags.AlwaysSetOrigin ^ AccuDrawFlags.SetOrigin))) ||
        !(this.published.flags & AccuDrawFlags.SetOrigin))) {
        this.published.flags |= AccuDrawFlags.SetOrigin;

        if (this.currentState >= CurrentState.Inactive)
          this.published.origin.setFrom(ev.point);
        else
          this.published.origin.setFrom(this.point);
      }

      this.saveLockedCoords();
      this.processHints();

      if (this.currentState >= CurrentState.Inactive)
        this.updateRotation();
    }

    this.flags.inDataPoint = false;
    this.flags.indexLocked = false;
    return false;
  }

  /** @internal */
  public onTentative(): boolean {
    if (this.isActive || this.isInactive)
      this.grabInputFocus(); // AccuDraw gets input focus on a tentative

    return false;
  }

  private intersectXYCurve(snap: SnapDetail, curve: CurvePrimitive, usePointOnSnap: boolean) {
    if (undefined === this.currentView)
      return;

    const curveSegment = snap.getCurvePrimitive(); // Get single segment of linestring/shape...
    if (undefined === curveSegment)
      return;

    const worldToView = this.currentView.worldToViewMap.transform0;
    const detail = CurveCurve.intersectionProjectedXYPairs(worldToView, usePointOnSnap ? curveSegment : curve, true, usePointOnSnap ? curve : curveSegment, true);
    if (0 === detail.length)
      return;

    let closeIndex = 0;
    if (detail.length > 1) {
      const snapPt = worldToView.multiplyPoint3d(snap.getPoint(), 1);
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

    snap.setSnapPoint(detail[closeIndex].detailA.point, SnapHeat.NotInRange);
  }

  private intersectLine(snap: SnapDetail, linePt: Point3d, unitVec: Vector3d) {
    const vec = Vector3d.createStartEnd(linePt, snap.getPoint());
    const endPt = linePt.plusScaled(unitVec, vec.dotProduct(unitVec));
    const cpLine = LineSegment3d.create(linePt, endPt);
    this.intersectXYCurve(snap, cpLine, true); // Get point on snapped curve, not AccuDraw axis. Snap point isn't required to be in AccuDraw plane when Z isn't locked.
  }

  private intersectCircle(snap: SnapDetail, center: Point3d, normal: Vector3d, radius: number) {
    const matrix = Matrix3d.createRigidHeadsUp(normal);
    const vector0 = matrix.columnX();
    const vector90 = matrix.columnY();
    vector0.scaleToLength(radius, vector0);
    vector90.scaleToLength(radius, vector90);
    const cpArc = Arc3d.create(center, vector0, vector90);
    this.intersectXYCurve(snap, cpArc, false); // Get point on AccuDraw distance circle, not snapped curve. Want to preserve distance constraint with apparent intersection in XY.
  }

  /** @internal */
  public onSnap(snap: SnapDetail): boolean {
    // If accudraw is locked, adjust near snap point to be the nearest point on this element, CONSTRAINED by the accudraw lock.
    if (!this.isActive || !this.locked)
      return false;

    if (SnapMode.Nearest !== snap.snapMode)
      return false;

    if (!snap.primitive)
      return false;

    switch (this.locked) {
      case LockedStates.VEC_BM: {
        this.intersectLine(snap, this.origin, this.vector);
        break;
      }

      case LockedStates.X_BM: {
        const refPt = (CompassMode.Rectangular === this.compassMode) ? this.planePt.plusScaled(this.axes.x, this.delta.x) : this.origin;
        this.intersectLine(snap, refPt, this.axes.y);
        break;
      }

      case LockedStates.Y_BM: {
        const refPt = (CompassMode.Rectangular === this.compassMode) ? this.planePt.plusScaled(this.axes.y, this.delta.y) : this.origin;
        this.intersectLine(snap, refPt, this.axes.x);
        break;
      }

      case LockedStates.DIST_BM: {
        this.intersectCircle(snap, this.origin, this.axes.z, this._distance);
        break;
      }
    }

    return false;
  }

  /** @internal */
  public onSelectedViewportChanged(previous: ScreenViewport | undefined, current: ScreenViewport | undefined): void {
    // In case previous is closing, always update AccuDraw to current view...
    if (undefined !== this.currentView && this.currentView === previous)
      this.currentView = current;

    // Reset AccuDraw when iModel or view type changes...
    if (undefined !== current && undefined !== previous &&
      (current.view.classFullName === previous.view.classFullName) &&
      (current.view.iModel === previous.view.iModel))
      return;

    this._acsPickId = undefined;
    this.currentView = undefined;
    this.flags.redrawCompass = false;

    this.flags.baseRotation = RotationMode.View;
    this.flags.auxRotationPlane = RotationMode.Top;
    this.flags.rotationNeedsUpdate = true;

    this.flags.haveValidOrigin = false;
    this.flags.indexLocked = false;
    this.flags.bearingFixToPlane2D = false;

    this.setRotationMode(RotationMode.View);
    this.updateRotation();

    this.saveState(this.savedStateViewTool);
    this.saveState(this.savedStateInputCollector);
  }

  private doProcessHints(): void {
    if (!this.floatingOrigin) {
      if (this.published.flags & AccuDrawFlags.SetOrigin)
        this.unlockAllFields();
      return;
    }

    // Set Context Origin
    if (this.published.flags & AccuDrawFlags.SetOrigin) {
      if (this.floatingOrigin) {
        this.origin.setFrom(this.published.origin);
        this.point.setFrom(this.origin);
        this.planePt.setFrom(this.origin);
      }
      this.flags.haveValidOrigin = true;
      this.setLastPoint(this.origin);
      this.unlockAllFields();
      this.updateRotation();
    }

    if (!this.contextSensitive)
      return;

    // Mode -- Polar or Rectangular
    if (this.published.flags & (AccuDrawFlags.SetModePolar | AccuDrawFlags.SetModeRect)) {
      if (this.compassMode !== ((this.published.flags & AccuDrawFlags.SetModePolar) ? CompassMode.Polar : CompassMode.Rectangular))
        this.changeCompassMode();
    }

    // Fixed Origin
    if (this.published.flags & AccuDrawFlags.FixedOrigin)
      this.flags.fixedOrg = true;

    // Save Distance
    if (this.published.flags & (AccuDrawFlags.SetDistance | AccuDrawFlags.LockDistance))
      this.saveCoordinate(ItemField.DIST_Item, this.published.distance);

    const vp = this.currentView;
    // Do Context Rotation
    if (this.published.flags & AccuDrawFlags.SetRMatrix) {
      this.axes.fromMatrix3d(this.published.rMatrix);
      this.flags.lockedRotation = true;
      this.flags.contextRotMode = ContextMode.Locked;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
    } else if (this.published.flags & AccuDrawFlags.SetXAxis) {
      this.axes.x.setFrom(this.published.vector);
      this.flags.contextRotMode = ContextMode.XAxis;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
    } else if (this.published.flags & AccuDrawFlags.SetXAxis2) {
      this.axes.x.setFrom(this.published.vector);
      this.flags.contextRotMode = ContextMode.XAxis2;
      this.setRotationMode(RotationMode.Context);
      this.updateRotation();
    } else if (this.published.flags & AccuDrawFlags.SetNormal) {
      if (vp && vp.view.is3d()) {
        this.axes.z.setFrom(this.published.vector);
        this.flags.contextRotMode = ContextMode.ZAxis;
        this.setRotationMode(RotationMode.Context);
        this.updateRotation();
      }
    } else if (this.published.flags & AccuDrawFlags.OrientACS) {
      this.flags.lockedRotation = true;
      this.flags.baseRotation = RotationMode.ACS;
      this.setRotationMode(RotationMode.ACS);
      this.updateRotation();
    } else if (this.isInactive || (this.published.flags & AccuDrawFlags.OrientDefault)) {
      this.setRotationMode(this.flags.baseRotation);
      this.updateRotation();
    }

    // Lock Items
    switch (this.compassMode) {
      case CompassMode.Polar:
        if (this.published.flags & AccuDrawFlags.LockDistance) {
          this._distance = this.published.distance;
          this.distanceLock(true, true);
        }

        if (this.published.flags & AccuDrawFlags.LockAngle) {
          this.updateVector(this.published.angle);
          this.indexed = LockedStates.NONE_LOCKED;
          this.angleLock();
          this.saveCoordinate(ItemField.ANGLE_Item, this.published.angle);
        }
        break;

      case CompassMode.Rectangular:
        if ((this.published.flags & AccuDrawFlags.Lock_X)) {
          this.locked |= LockedStates.X_BM;
          this.delta.x = this.published.delta.x;
          this.setFieldLock(ItemField.X_Item, true);
          this.saveCoordinate(ItemField.X_Item, this.published.delta.x);
        }

        if ((this.published.flags & AccuDrawFlags.Lock_Y)) {
          this.locked |= LockedStates.Y_BM;
          this.delta.y = this.published.delta.y;
          this.setFieldLock(ItemField.Y_Item, true);
          this.saveCoordinate(ItemField.Y_Item, this.published.delta.y);
        }

        if ((this.published.flags & AccuDrawFlags.Lock_Z)) {
          if (vp && vp.view.is3d()) {
            this.delta.z = this.published.delta.z;
            this.setFieldLock(ItemField.Z_Item, true);
            this.saveCoordinate(ItemField.Z_Item, this.published.delta.z);
          }
        }
        break;
    }
  }

  /** @internal */
  public processHints(): void {
    if (!this.published.flags || !this.isEnabled)
      return;

    if (this.published.flags & AccuDrawFlags.Disable) {
      this.published.flags = 0;
      this.currentState = CurrentState.Deactivated;
      return;
    }
    const setFocus: boolean = !!(this.published.flags & AccuDrawFlags.SetFocus);
    const smartRotation: boolean = !!(this.published.flags & AccuDrawFlags.SmartRotation);
    this.doProcessHints();
    this.published.zero();
    if (smartRotation && this.isInactive) // Preserve smart rotation hint until when/if AccuDraw is enabled for the current tool...
      this.published.flags = AccuDrawFlags.SmartRotation;
    if (this.isEnabled || setFocus)
      this.grabInputFocus();
  }
}

/** Specify the rotation to return from [[AccuDrawHintBuilder.getContextRotation]].
 * @public
 */
export enum ContextRotationId { Top, Front, Left, Bottom, Back, Right, View, Face }

/** [[AccuDrawHintBuilder]] is an [[InteractiveTool]] helper class that facilitates AccuDraw interaction.
 * Accudraw is an aide for entering coordinate data.
 * A tool does not directly change the current AccuDraw state; the tool's job is merely
 * to supply "hints" to AccuDraw regarding its preferred AccuDraw configuration for the
 * current tool state. User settings such as "Context Sensitivity" and "Floating Origin"
 * affect how and which hints are applied. Additionally the user can drive AccuDraw
 * through keyboard shortcuts.
 * @see [Using AccuDraw]($docs/learning/frontend/primitivetools.md#AccuDraw)*
 * @public
 */
export class AccuDrawHintBuilder {
  private _flagOrigin = false;
  private _flagNormal = false;
  private _flagRotation = false;
  private _flagXAxis = false;
  private _flagXAxis2 = false;
  private _flagDistance = false;
  private _flagAngle = false;
  private _flagModePolar = false;
  private _flagModeRectangular = false;
  private _origin?: Point3d;
  private _axis?: Vector3d;
  private _rMatrix?: Matrix3d;
  private _distance = 0;
  private _angle = 0;

  /** Don't automatically set compass origin to point from data button events */
  public setOriginFixed = false;
  /** Override "fixed" and "floating" origin settings for [[setOrigin] hint */
  public setOriginAlways = false;
  /** Lock current distance value in polar mode */
  public setLockDistance = false;
  /** Lock current angle value in polar mode */
  public setLockAngle = false;
  /** Lock current x delta value in rectanglar mode */
  public setLockX = false;
  /** Lock current y delta value in rectanglar mode  */
  public setLockY = false;
  /** Lock current z delta value in 3d views */
  public setLockZ = false;
  /** Set the initial compass orientation from the current [[SnapDetail]] when activating */
  public enableSmartRotation = false;

  /** Add hint to specify a new compass origin */
  public setOrigin(origin: Point3d): void { this._origin = origin.clone(); this._flagOrigin = true; }

  /** Add hint to fully specify compass orientation from a Matrix3d */
  public setMatrix(matrix: Matrix3d): boolean {
    const invMatrix = matrix.inverse();
    if (undefined === invMatrix)
      return false;
    this.setRotation(invMatrix);
    return true;
  }

  /** @internal Add hint to fully specify compass orientation from a Matrix3d in row format */
  public setRotation(rowMatrix: Matrix3d): void { this._rMatrix = rowMatrix.clone(); this._flagRotation = true; this._flagXAxis = this._flagNormal = false; }

  /** Add hint to change compass orientation by combining the supplied x axis direction with the current base rotation */
  public setXAxis(xAxis: Vector3d): void { this._axis = xAxis.clone(); this._flagXAxis = true; this._flagRotation = this._flagNormal = this._flagXAxis2 = false; }

  /** Add hint to change compass orientation by combining the supplied x axis direction with the current base rotation preferring the result most closely aligned to the view */
  public setXAxis2(xAxis: Vector3d): void { this._axis = xAxis.clone(); this._flagXAxis2 = true; this._flagRotation = this._flagNormal = this._flagXAxis = false; }

  /** Add hint to change compass orientation by combining the supplied z axis direction with the current base rotation */
  public setNormal(normal: Vector3d): void { this._axis = normal.clone(); this._flagNormal = true; this._flagRotation = this._flagXAxis = this._flagXAxis2 = false; }

  /** Add hint to change compass to polar mode */
  public setModePolar(): void { this._flagModePolar = true; this._flagModeRectangular = false; }

  /** Add hint to change compass to rectangular mode */
  public setModeRectangular(): void { this._flagModeRectangular = true; this._flagModePolar = false; }

  /** Set current distance value in polar mode */
  public setDistance(distance: number): void { this._distance = distance; this._flagDistance = true; }

  /** Set current angle value in polar mode */
  public setAngle(angle: number): void { this._angle = angle; this._flagAngle = true; }

  /** Enable AccuDraw for the current tool without sending any hints */
  public static activate(): void { IModelApp.accuDraw.activate(); }

  /** Disable AccuDraw for the current tool */
  public static deactivate(): void { IModelApp.accuDraw.deactivate(); }

  /** Whether AccuDraw is enabled by the host application this session and can be used */
  public static get isEnabled(): boolean { return IModelApp.accuDraw.isEnabled; }

  /** Whether AccuDraw compass is currently displayed and points are being adjusted */
  public static get isActive(): boolean { return IModelApp.accuDraw.isEnabled; }

  /**
   * Provide hints to AccuDraw using the current builder state.
   * @return true if hints were successfully sent.
   */
  public sendHints(activate = true): boolean {
    let flags = 0;
    if (this._flagOrigin) flags |= AccuDrawFlags.SetOrigin;
    if (this.setOriginFixed) flags |= AccuDrawFlags.FixedOrigin;
    if (this.setOriginAlways) flags |= AccuDrawFlags.AlwaysSetOrigin;
    if (this._flagRotation) flags |= AccuDrawFlags.SetRMatrix;
    if (this._flagXAxis) flags |= AccuDrawFlags.SetXAxis;
    if (this._flagXAxis2) flags |= AccuDrawFlags.SetXAxis2;
    if (this._flagNormal) flags |= AccuDrawFlags.SetNormal;
    if (this._flagModePolar) flags |= AccuDrawFlags.SetModePolar;
    if (this._flagModeRectangular) flags |= AccuDrawFlags.SetModeRect;
    if (this.setLockDistance) flags |= AccuDrawFlags.LockDistance;
    if (this.setLockAngle) flags |= AccuDrawFlags.LockAngle;
    if (this.setLockX) flags |= AccuDrawFlags.Lock_X;
    if (this.setLockY) flags |= AccuDrawFlags.Lock_Y;
    if (this.setLockZ) flags |= AccuDrawFlags.Lock_Z;
    if (this.enableSmartRotation) flags |= AccuDrawFlags.SmartRotation;

    const accuDraw = IModelApp.accuDraw;
    if (BentleyStatus.SUCCESS !== accuDraw.setContext(flags, this._origin, this._flagRotation ? this._rMatrix : this._axis, undefined, this._flagDistance ? this._distance : undefined, this._flagAngle ? this._angle : undefined))
      return false; // Not enabled for this session...

    if (activate)
      accuDraw.activate(); // If not already enabled (ex. dynamics not started) most/all callers would want to enable it now (optional activate arg provided just in case)...

    return true;
  }

  /** Create a [[Ray3d]] whose origin is the supplied space point and direction is into the view */
  public static getBoresite(spacePt: Point3d, vp: Viewport, checkAccuDraw: boolean = false, checkACS: boolean = false): Ray3d {
    if (checkAccuDraw && IModelApp.accuDraw.isActive)
      return Ray3d.create(spacePt, IModelApp.accuDraw.getRotation().getRow(2).negate());

    if (checkACS && vp.isContextRotationRequired)
      return Ray3d.create(spacePt, vp.getAuxCoordRotation().getRow(2).negate());

    const eyePoint = vp.worldToViewMap.transform1.columnZ();
    const direction = Vector3d.createFrom(eyePoint);
    const aa = Geometry.conditionalDivideFraction(1, eyePoint.w);
    if (aa !== undefined) {
      const xyzEye = direction.scale(aa);
      direction.setFrom(spacePt.vectorTo(xyzEye));
    }
    direction.scaleToLength(-1.0, direction);
    return Ray3d.create(spacePt, direction);
  }

  /** Return ray intersection with a plane defined by a point and normal
   * @see [[getBoresite]]
   */
  public static projectPointToPlaneInView(spacePt: Point3d, planePt: Point3d, planeNormal: Vector3d, vp: Viewport, checkAccuDraw: boolean = false, checkACS: boolean = false): Point3d | undefined {
    const plane = Plane3dByOriginAndUnitNormal.create(planePt, planeNormal);
    if (undefined === plane)
      return undefined;
    const rayToEye = AccuDrawHintBuilder.getBoresite(spacePt, vp, checkAccuDraw, checkACS);
    const projectedPt = Point3d.createZero();
    if (undefined === rayToEye.intersectionWithPlane(plane, projectedPt))
      return undefined;
    return projectedPt;
  }

  /** Return ray intersection with a line defined by a point and direction
   * @see [[getBoresite]]
   */
  public static projectPointToLineInView(spacePt: Point3d, linePt: Point3d, lineDirection: Vector3d, vp: Viewport, checkAccuDraw: boolean = false, checkACS: boolean = false): Point3d | undefined {
    const lineRay = Ray3d.create(linePt, lineDirection);
    const rayToEye = AccuDrawHintBuilder.getBoresite(spacePt, vp, checkAccuDraw, checkACS);
    if (rayToEye.direction.isParallelTo(lineRay.direction, true))
      return lineRay.projectPointToRay(spacePt);
    const matrix = Matrix3d.createRigidFromColumns(lineRay.direction, rayToEye.direction, AxisOrder.XZY);
    if (undefined === matrix)
      return undefined;
    const plane = Plane3dByOriginAndUnitNormal.create(linePt, matrix.columnZ());
    if (undefined === plane)
      return undefined;
    const projectedPt = Point3d.createZero();
    if (undefined === rayToEye.intersectionWithPlane(plane, projectedPt))
      return undefined;
    return lineRay.projectPointToRay(projectedPt);
  }

  /** Return a [[Matrix3d]] representing the current working plane specified by AccuDraw, [[Viewport.auxCoordSystem]], or [[Viewport.rotation]]. */
  public static getCurrentRotation(vp: Viewport, checkAccuDraw: boolean, checkACS: boolean, matrix?: Matrix3d): Matrix3d | undefined {
    const current = AccuDraw.getCurrentOrientation(vp, checkAccuDraw, checkACS, matrix);
    return (undefined !== current ? current.inverse() : undefined);
  }

  /** Return a [[Matrix3d]] corresponding to the supplied [[ContextRotationId]].
   * A [[ContextRotationId]] that corresponds to a standard view, "Top", "Front", etc. will return a [[Matrix3d]] that
   * is relative to the current [[Viewport.auxCoordSystem]] when ACS context lock is enabled.
   * @see [[ToolAdmin.acsContextLock]]
   */
  public static getContextRotation(id: ContextRotationId, vp: Viewport): Matrix3d | undefined {
    switch (id) {
      case ContextRotationId.Top:
        return AccuDraw.getStandardRotation(StandardViewId.Top, vp, vp.isContextRotationRequired).inverse();
      case ContextRotationId.Front:
        return AccuDraw.getStandardRotation(StandardViewId.Front, vp, vp.isContextRotationRequired).inverse();
      case ContextRotationId.Left:
        return AccuDraw.getStandardRotation(StandardViewId.Left, vp, vp.isContextRotationRequired).inverse();
      case ContextRotationId.Bottom:
        return AccuDraw.getStandardRotation(StandardViewId.Bottom, vp, vp.isContextRotationRequired).inverse();
      case ContextRotationId.Back:
        return AccuDraw.getStandardRotation(StandardViewId.Back, vp, vp.isContextRotationRequired).inverse();
      case ContextRotationId.Right:
        return AccuDraw.getStandardRotation(StandardViewId.Right, vp, vp.isContextRotationRequired).inverse();
      case ContextRotationId.View:
        return vp.view.getRotation().inverse();
      case ContextRotationId.Face:
        const snap = TentativeOrAccuSnap.getCurrentSnap(false);
        if (undefined === snap || undefined === snap.normal)
          return undefined;
        const normal = Vector3d.createZero();
        const boresite = this.getBoresite(snap.hitPoint, vp);
        if (snap.normal.dotProduct(boresite.direction) < 0.0)
          normal.setFrom(snap.normal);
        else
          snap.normal.negate(normal);
        return Matrix3d.createRigidHeadsUp(normal);
    }
  }
}
