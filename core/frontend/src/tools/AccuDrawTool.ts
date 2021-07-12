/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { BentleyStatus } from "@bentley/bentleyjs-core";
import { Geometry, Matrix3d, Point3d, Transform, Vector3d } from "@bentley/geometry-core";
import { AccuDraw, AccuDrawFlags, CompassMode, ContextMode, ItemField, KeyinStatus, LockedStates, RotationMode, ThreeAxes } from "../AccuDraw";
import { TentativeOrAccuSnap } from "../AccuSnap";
import { ACSDisplayOptions, AuxCoordSystemState } from "../AuxCoordSys";
import { SnapDetail } from "../HitDetail";
import { IModelApp } from "../IModelApp";
import { DecorateContext } from "../ViewContext";
import { Viewport } from "../Viewport";
import { BeButtonEvent, CoordinateLockOverrides, CoreTools, EventHandled, InputCollector, Tool } from "./Tool";

// cSpell:ignore dont unlockedz

function normalizedDifference(point1: Point3d, point2: Point3d, out: Vector3d): number { return point2.vectorTo(point1).normalizeWithLength(out).mag; }
function normalizedCrossProduct(vec1: Vector3d, vec2: Vector3d, out: Vector3d): number { return vec1.crossProduct(vec2, out).normalizeWithLength(out).mag; }
/**
 * A shortcut may require no user input (immediate) or it may install a tool to collect the needed input. AccuDrawShortcuts are how users control AccuDraw.
 * A tool implementor should not use this class to setup AccuDraw, instead use AccuDrawHintBuilder to provide hints.
 * @alpha
 */
export class AccuDrawShortcuts {
  public static rotateAxesByPoint(isSnapped: boolean, aboutCurrentZ: boolean): boolean {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return false;

    const vp = accudraw.currentView;
    if (!vp)
      return false;

    const point = accudraw.point;
    if (!vp.view.is3d())
      point.z = 0.0;

    if (aboutCurrentZ)
      accudraw.hardConstructionPlane(point, point, accudraw.planePt, accudraw.axes.z, vp, isSnapped);
    else
      accudraw.softConstructionPlane(point, point, accudraw.planePt, accudraw.axes.z, vp, isSnapped);

    // Snap point and compass origin coincide...
    const xVec = new Vector3d();
    if (normalizedDifference(point, accudraw.planePt, xVec) < Geometry.smallAngleRadians)
      return false;

    accudraw.axes.x.setFrom(xVec);

    if (RotationMode.Context !== accudraw.rotationMode)
      accudraw.setRotationMode(RotationMode.Context);

    accudraw.flags.contextRotMode = ContextMode.XAxis;
    accudraw.flags.lockedRotation = false;

    accudraw.updateRotation();

    // Always want index line to display for x-Axis...changing rotation clears this...so it flashes...
    accudraw.indexed |= LockedStates.X_BM;
    return true;
  }

  public static updateACSByPoints(acs: AuxCoordSystemState, vp: Viewport, points: Point3d[], isDynamics: boolean): boolean {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return false;

    let accept = false;
    const vec = [new Vector3d(), new Vector3d(), new Vector3d()];
    acs.setOrigin(points[0]);
    switch (points.length) {
      case 1:
        acs.setRotation(vp.rotation);
        if (!isDynamics) {
          accudraw.published.origin.setFrom(points[0]);
          accudraw.published.flags = AccuDrawFlags.SetOrigin;
          accudraw.flags.fixedOrg = true;
        }
        break;

      case 2:
        if (normalizedDifference(points[1], points[0], vec[0]) < 0.00001) {
          accept = true;
          break;
        }

        if (vp.view.is3d()) {
          if (normalizedCrossProduct(accudraw.axes.y, vec[0], vec[1]) < 0.00001) {
            vec[2].set(0.0, 0.0, 1.0);

            if (normalizedCrossProduct(vec[2], vec[0], vec[1]) < 0.00001) {
              vec[2].set(0.0, 1.0, 0.0);
              normalizedCrossProduct(vec[2], vec[0], vec[1]);
            }
          }

          normalizedCrossProduct(vec[0], vec[1], vec[2]);
          acs.setRotation(Matrix3d.createRows(vec[0], vec[1], vec[2]));

          if (!isDynamics) {
            accudraw.published.origin.setFrom(points[0]);
            accudraw.published.flags = AccuDrawFlags.SetOrigin | AccuDrawFlags.SetNormal;
            accudraw.published.vector.setFrom(vec[0]);
          }
          break;
        }

        vec[2].set(0.0, 0.0, 1.0);
        normalizedCrossProduct(vec[2], vec[0], vec[1]);
        acs.setRotation(Matrix3d.createRows(vec[0], vec[1], vec[2]));
        accept = true;
        break;

      case 3:
        if (normalizedDifference(points[1], points[0], vec[0]) < 0.00001 ||
          normalizedDifference(points[2], points[0], vec[1]) < 0.00001 ||
          normalizedCrossProduct(vec[0], vec[1], vec[2]) < 0.00001) {
          accept = true;
          break;
        }

        normalizedCrossProduct(vec[2], vec[0], vec[1]);
        acs.setRotation(Matrix3d.createRows(vec[0], vec[1], vec[2]));
        accept = true;
        break;
    }

    return accept;
  }

  public static processPendingHints() { IModelApp.accuDraw.processHints(); }

  public static requestInputFocus() {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    accudraw.grabInputFocus();
    accudraw.refreshDecorationsAndDynamics();
  }

  // Helper method for GUI implementation...
  public static async itemFieldNavigate(index: ItemField, str: string, forward: boolean): Promise<void> {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    if (accudraw.getFieldLock(index))
      accudraw.saveCoordinate(index, accudraw.getValueByIndex(index));

    if (!accudraw.isActive && KeyinStatus.Partial === accudraw.getKeyinStatus(index)) {
      await accudraw.processFieldInput(index, str, true);
    } else {
      accudraw.setKeyinStatus(index, KeyinStatus.Dynamic);
      accudraw.onFieldValueChange(index);
    }

    const vp = accudraw.currentView;
    const is3d = vp ? vp.view.is3d() : false;
    const isPolar = (CompassMode.Polar === accudraw.compassMode);
    switch (index) {
      case ItemField.DIST_Item:
        index = ((is3d && !forward) ? ItemField.Z_Item : ItemField.ANGLE_Item);
        break;

      case ItemField.ANGLE_Item:
        index = ((is3d && forward) ? ItemField.Z_Item : ItemField.DIST_Item);
        break;

      case ItemField.X_Item:
        index = ((is3d && !forward) ? ItemField.Z_Item : ItemField.Y_Item);
        break;

      case ItemField.Y_Item:
        index = ((is3d && forward) ? ItemField.Z_Item : ItemField.X_Item);
        break;

      case ItemField.Z_Item:
        index = (forward ? (isPolar ? ItemField.DIST_Item : ItemField.X_Item) : (isPolar ? ItemField.ANGLE_Item : ItemField.Y_Item));
        break;
    }

    accudraw.setKeyinStatus(index, KeyinStatus.Partial);
    accudraw.setFocusItem(index);
    accudraw.dontMoveFocus = true;
  }

  public static itemFieldNewInput(index: ItemField): void { IModelApp.accuDraw.setKeyinStatus(index, KeyinStatus.Partial); }

  public static async itemFieldAcceptInput(index: ItemField, str: string): Promise<void> {
    const accudraw = IModelApp.accuDraw;
    await accudraw.processFieldInput(index, str, true);
    accudraw.setKeyinStatus(index, KeyinStatus.Dynamic);

    if (accudraw.getFieldLock(index))
      accudraw.saveCoordinate(index, accudraw.getValueByIndex(index));

    const vp = accudraw.currentView;
    if (accudraw.isActive) {
      if (!vp)
        return;

      if (CompassMode.Polar === accudraw.compassMode)
        accudraw.fixPointPolar(vp);
      else
        accudraw.fixPointRectangular(vp);

      accudraw.flags.dialogNeedsUpdate = true;
      return;
    }

    const is3d = vp ? vp.view.is3d() : false;
    const isPolar = (CompassMode.Polar === accudraw.compassMode);
    switch (index) {
      case ItemField.DIST_Item:
        index = ItemField.ANGLE_Item;
        break;

      case ItemField.ANGLE_Item:
        index = (is3d ? ItemField.Z_Item : ItemField.DIST_Item);
        break;

      case ItemField.X_Item:
        index = ItemField.Y_Item;
        break;

      case ItemField.Y_Item:
        index = (is3d ? ItemField.Z_Item : ItemField.X_Item);
        break;

      case ItemField.Z_Item:
        index = (isPolar ? ItemField.DIST_Item : ItemField.X_Item);
        break;
    }
    accudraw.setFocusItem(index);
  }

  public static itemFieldLockToggle(index: ItemField): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    if (accudraw.getFieldLock(index)) {
      switch (index) {
        case ItemField.DIST_Item:
          accudraw.distanceLock(true, false);
          break;

        case ItemField.ANGLE_Item:
          accudraw.angleLock();
          break;

        case ItemField.X_Item:
          accudraw.clearTentative();
          accudraw.locked |= LockedStates.X_BM;
          break;

        case ItemField.Y_Item:
          accudraw.clearTentative();
          accudraw.locked |= LockedStates.Y_BM;
          break;

        case ItemField.Z_Item:
          accudraw.clearTentative();
          break;
      }

      return;
    }

    switch (index) {
      case ItemField.DIST_Item:
        accudraw.locked &= ~LockedStates.DIST_BM;
        break;

      case ItemField.ANGLE_Item:
        accudraw.locked &= ~LockedStates.ANGLE_BM;
        break;

      case ItemField.X_Item:
        accudraw.locked &= ~LockedStates.X_BM;
        break;

      case ItemField.Y_Item:
        accudraw.locked &= ~LockedStates.Y_BM;
        break;

      case ItemField.Z_Item:
        break;
    }

    accudraw.dontMoveFocus = false;
    accudraw.clearTentative();
  }

  public static itemRotationModeChange(rotation: RotationMode): void {
    const accudraw = IModelApp.accuDraw;
    const vp = accudraw.currentView;
    const is3d = vp ? vp.view.is3d() : true;

    if (!is3d && (RotationMode.Front === rotation || RotationMode.Side === rotation))
      accudraw.setRotationMode(RotationMode.Top);

    accudraw.flags.baseRotation = rotation;
    accudraw.updateRotation(true);
  }

  // Shortcut implementations for GUI entry points...
  public static setOrigin(explicitOrigin?: Point3d): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    if (explicitOrigin) {
      accudraw.published.origin.setFrom(explicitOrigin);
      accudraw.flags.haveValidOrigin = true;
    } else if (accudraw.isInactive || accudraw.isDeactivated) {
      // If AccuSnap is active use adjusted snap point, otherwise use last data point...
      const snap = TentativeOrAccuSnap.getCurrentSnap(false);
      if (undefined !== snap) {
        accudraw.published.origin.setFrom(snap.isPointAdjusted ? snap.adjustedPoint : snap.getPoint());
        accudraw.flags.haveValidOrigin = true;
      } else {
        const ev = new BeButtonEvent();
        IModelApp.toolAdmin.fillEventFromLastDataButton(ev);

        if (ev.viewport) {
          accudraw.published.origin.setFrom(ev.point);
          accudraw.flags.haveValidOrigin = true;
        } else {
          // NOTE: If current point isn't valid setDefaultOrigin will be called...
          accudraw.published.origin.setFrom(accudraw.point);
        }
      }
    } else {
      accudraw.published.origin.setFrom(accudraw.point);
      accudraw.flags.haveValidOrigin = true;
      accudraw.setLastPoint(accudraw.published.origin);
    }

    accudraw.clearTentative();
    const vp = accudraw.currentView;

    // NOTE: _AdjustPoint should have been called to have setup currentView...
    if (vp && !vp.view.is3d())
      accudraw.published.origin.z = 0.0;

    accudraw.origin.setFrom(accudraw.published.origin);
    accudraw.point.setFrom(accudraw.published.origin);
    accudraw.planePt.setFrom(accudraw.published.origin);
    accudraw.published.flags |= AccuDrawFlags.SetOrigin;
    accudraw.activate();
    accudraw.refreshDecorationsAndDynamics();
  }

  public static changeCompassMode(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    let axisLockStatus = accudraw.locked & LockedStates.XY_BM;

    if (axisLockStatus) {
      if (CompassMode.Rectangular === accudraw.compassMode) {
        if (axisLockStatus & LockedStates.X_BM && accudraw.delta.x !== 0.0)
          axisLockStatus &= ~LockedStates.X_BM;

        if (axisLockStatus & LockedStates.Y_BM && accudraw.delta.y !== 0.0)
          axisLockStatus &= ~LockedStates.Y_BM;
      }
    }

    accudraw.changeCompassMode(true);
    if (axisLockStatus) {
      if (CompassMode.Rectangular === accudraw.compassMode) {
        accudraw.delta.x = accudraw.delta.y = 0.0;

        if (axisLockStatus & LockedStates.X_BM)
          accudraw.setFieldLock(ItemField.X_Item, true);
        else if (axisLockStatus & LockedStates.Y_BM)
          accudraw.setFieldLock(ItemField.Y_Item, true);
      } else {
        accudraw.setFieldLock(ItemField.ANGLE_Item, true);
      }
      accudraw.locked = axisLockStatus;
    }
    accudraw.flags.baseMode = accudraw.compassMode;
    accudraw.refreshDecorationsAndDynamics();
  }

  public static lockSmart(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    const accuSnap = IModelApp.accuSnap;

    // Don't want AccuSnap to influence axis or Z...
    if (accuSnap.isHot) {
      accuSnap.clear();

      const vp = accudraw.currentView;
      if (vp) {
        if (CompassMode.Polar === accudraw.compassMode)
          accudraw.fixPointPolar(vp);
        else
          accudraw.fixPointRectangular(vp);
      }
    }

    if (CompassMode.Polar === accudraw.compassMode) {
      const isSnapped = accudraw.clearTentative();
      if (accudraw.locked & LockedStates.ANGLE_BM) { // angle locked (unlock it)
        accudraw.setFieldLock(ItemField.ANGLE_Item, false);
        accudraw.locked &= ~LockedStates.ANGLE_BM;
      } else if (accudraw.getFieldLock(ItemField.DIST_Item)) { // distance locked (unlock it)
        accudraw.setFieldLock(ItemField.DIST_Item, false);
        accudraw.locked &= ~LockedStates.DIST_BM;
      } else if (isSnapped) {
        accudraw.doLockAngle(isSnapped);
      } else if (accudraw.indexed & LockedStates.ANGLE_BM) { // angle indexed (lock it)
        accudraw.angleLock();
      } else {
        if (Math.abs(accudraw.vector.dotProduct(accudraw.axes.x)) > Math.abs(accudraw.vector.dotProduct(accudraw.axes.y)))
          accudraw.indexed |= LockedStates.Y_BM;
        else
          accudraw.indexed |= LockedStates.X_BM;
        accudraw.angleLock();
      }
      accudraw.refreshDecorationsAndDynamics();
      return;
    }

    if (accudraw.locked) { // if locked, unlock
      accudraw.clearTentative();
      accudraw.locked &= ~LockedStates.XY_BM;
      accudraw.setFieldLock(ItemField.X_Item, false);
      accudraw.setFieldLock(ItemField.Y_Item, false);
      if (accudraw.getFieldLock(ItemField.Z_Item) && accudraw.delta.z === 0.0 && !accudraw.stickyZLock)
        accudraw.setFieldLock(ItemField.Z_Item, false);
    } else { // lock to nearest axis
      if (accudraw.clearTentative()) {
        if (Math.abs(accudraw.delta.x) >= Geometry.smallAngleRadians && Math.abs(accudraw.delta.y) >= Geometry.smallAngleRadians) {
          accudraw.doLockAngle(false);
          return;
        }
      }

      const vp = accudraw.currentView;
      if (Math.abs(accudraw.delta.x) > Math.abs(accudraw.delta.y)) {
        accudraw.delta.y = 0.0;
        accudraw.onFieldValueChange(ItemField.Y_Item);
        accudraw.locked |= LockedStates.Y_BM;
        accudraw.locked &= ~LockedStates.X_BM;
        accudraw.setFieldLock(ItemField.X_Item, false);
        accudraw.setFieldLock(ItemField.Y_Item, true);
        accudraw.setFieldLock(ItemField.Z_Item, vp ? vp.view.is3d() : false);
      } else {
        accudraw.delta.x = 0.0;
        accudraw.onFieldValueChange(ItemField.X_Item);
        accudraw.locked |= LockedStates.X_BM;
        accudraw.locked &= ~LockedStates.Y_BM;
        accudraw.setFieldLock(ItemField.Y_Item, false);
        accudraw.setFieldLock(ItemField.X_Item, true);
        accudraw.setFieldLock(ItemField.Z_Item, vp ? vp.view.is3d() : false);
      }

      if (!accudraw.flags.lockedRotation) {
        accudraw.flags.lockedRotation = true;
        accudraw.flags.contextRotMode = ContextMode.Locked;
        accudraw.setRotationMode(RotationMode.Context);
      }
    }
    accudraw.refreshDecorationsAndDynamics();
  }

  public static lockX(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    accudraw.clearTentative();

    if (CompassMode.Rectangular !== accudraw.compassMode) {
      const vp = accudraw.currentView;
      if (!vp)
        return;

      accudraw.fixPointRectangular(vp);
      accudraw.changeCompassMode(true);
    }

    if (accudraw.getFieldLock(ItemField.X_Item)) {
      accudraw.setFieldLock(ItemField.X_Item, false);
      accudraw.locked = accudraw.locked & ~LockedStates.X_BM;
    } else {
      accudraw.saveCoordinate(ItemField.X_Item, accudraw.delta.x);
      accudraw.setFieldLock(ItemField.X_Item, true);
      accudraw.locked = accudraw.locked | LockedStates.X_BM;
    }
    accudraw.refreshDecorationsAndDynamics();
  }

  public static lockY(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    accudraw.clearTentative();

    if (CompassMode.Rectangular !== accudraw.compassMode) {
      const vp = accudraw.currentView;
      if (!vp)
        return;

      accudraw.fixPointRectangular(vp);
      accudraw.changeCompassMode(true);
    }

    if (accudraw.getFieldLock(ItemField.Y_Item)) {
      accudraw.setFieldLock(ItemField.Y_Item, false);
      accudraw.locked = accudraw.locked & ~LockedStates.Y_BM;
    } else {
      accudraw.saveCoordinate(ItemField.Y_Item, accudraw.delta.y);
      accudraw.setFieldLock(ItemField.Y_Item, true);
      accudraw.locked = accudraw.locked | LockedStates.Y_BM;
    }
    accudraw.refreshDecorationsAndDynamics();
  }

  public static lockZ(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    const vp = accudraw.currentView;
    if (!vp || !vp.view.is3d())
      return;

    const isSnapped = accudraw.clearTentative();

    if (accudraw.getFieldLock(ItemField.Z_Item)) {
      accudraw.setFieldLock(ItemField.Z_Item, false);
    } else {
      // Move focus to Z field...
      if (!isSnapped && accudraw.autoFocusFields) {
        accudraw.setFocusItem(ItemField.Z_Item);
        accudraw.dontMoveFocus = true;
      }
      accudraw.setFieldLock(ItemField.Z_Item, true);
    }
    accudraw.refreshDecorationsAndDynamics();
  }

  public static lockDistance(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    const isSnapped = accudraw.clearTentative();

    if (CompassMode.Polar !== accudraw.compassMode) {
      const vp = accudraw.currentView;
      if (!vp)
        return;

      accudraw.locked = 0;
      accudraw.fixPointPolar(vp);
      accudraw.changeCompassMode(true);
    }

    if (accudraw.getFieldLock(ItemField.DIST_Item)) {
      accudraw.setFieldLock(ItemField.DIST_Item, false);
      accudraw.locked &= ~LockedStates.DIST_BM;

      accudraw.setKeyinStatus(ItemField.DIST_Item, KeyinStatus.Dynamic); // Need to clear partial status if locked by entering distance since focus stays in distance field...
    } else {
      // Move focus to distance field...
      if (!isSnapped && accudraw.autoFocusFields)
        accudraw.setFocusItem(ItemField.DIST_Item);
      accudraw.distanceLock(true, true);
    }
    accudraw.refreshDecorationsAndDynamics();
  }

  public static lockAngle(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;
    accudraw.doLockAngle(accudraw.clearTentative());
    accudraw.refreshDecorationsAndDynamics();
  }

  public lockIndex(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    if (accudraw.flags.indexLocked) {
      if (accudraw.locked)
        AccuDrawShortcuts.lockSmart();

      accudraw.flags.indexLocked = false;
    } else {
      if (CompassMode.Polar === accudraw.compassMode) {
        if (accudraw.indexed & LockedStates.XY_BM) {
          accudraw.setFieldLock(ItemField.ANGLE_Item, true);
          accudraw.angleLock();
        }

        if (accudraw.indexed & LockedStates.DIST_BM)
          AccuDrawShortcuts.lockDistance();
      } else {
        if (accudraw.indexed & LockedStates.X_BM) {
          AccuDrawShortcuts.lockX();

          if (accudraw.indexed & LockedStates.DIST_BM)
            AccuDrawShortcuts.lockY();
        }

        if (accudraw.indexed & LockedStates.Y_BM) {
          AccuDrawShortcuts.lockY();

          if (accudraw.indexed & LockedStates.DIST_BM)
            AccuDrawShortcuts.lockX();
        }

        if (accudraw.indexed & LockedStates.DIST_BM && !(accudraw.indexed & LockedStates.XY_BM)) {
          if (accudraw.locked & LockedStates.X_BM)
            AccuDrawShortcuts.lockY();
          else
            AccuDrawShortcuts.lockX();
        }
      }

      accudraw.flags.indexLocked = true;
    }

    accudraw.refreshDecorationsAndDynamics();
  }

  public static setStandardRotation(rotation: RotationMode): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    if (RotationMode.Context === rotation) {
      const axes = accudraw.baseAxes.clone();
      accudraw.accountForAuxRotationPlane(axes, accudraw.flags.auxRotationPlane);
      accudraw.setContextRotation(axes.toMatrix3d(), false, true);
      accudraw.refreshDecorationsAndDynamics();
      return;
    } else {
      accudraw.flags.baseRotation = rotation;
      accudraw.setRotationMode(rotation);
    }
    accudraw.updateRotation(true);
    accudraw.refreshDecorationsAndDynamics();
  }

  public static alignView(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    const vp = accudraw.currentView;
    if (!vp)
      return;

    const newMatrix = accudraw.getRotation();
    if (newMatrix.isExactEqual(vp.rotation))
      return;

    const targetMatrix = newMatrix.multiplyMatrixMatrix(vp.rotation);
    const rotateTransform = Transform.createFixedPointAndMatrix(vp.view.getTargetPoint(), targetMatrix);
    const newFrustum = vp.getFrustum();
    newFrustum.multiply(rotateTransform);

    vp.view.setupFromFrustum(newFrustum);
    vp.synchWithView();
    vp.animateFrustumChange();

    accudraw.refreshDecorationsAndDynamics();
  }

  public static rotateToBase(): void { this.setStandardRotation(IModelApp.accuDraw.flags.baseRotation); }

  public static rotateToACS(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;
    // NOTE: Match current ACS orientation..reset auxRotationPlane to top!
    accudraw.flags.auxRotationPlane = RotationMode.Top;
    this.setStandardRotation(RotationMode.ACS);
  }

  public static rotateCycle(): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    const vp = accudraw.currentView;
    if (!vp || !vp.view.is3d())
      return;

    let rotation: RotationMode;
    switch (accudraw.rotationMode) {
      case RotationMode.View:
      case RotationMode.Side:
        rotation = RotationMode.Top;
        break;

      case RotationMode.Top:
        rotation = RotationMode.Front;
        break;

      case RotationMode.Front:
        rotation = RotationMode.Side;
        break;

      case RotationMode.Context:
        rotation = RotationMode.Context;

        if (rotation !== accudraw.flags.baseRotation) {
          accudraw.baseAxes.setFrom(accudraw.axes);
          accudraw.flags.auxRotationPlane = RotationMode.Top;
          accudraw.flags.baseRotation = rotation;
        } else {
          const axes = accudraw.baseAxes.clone();
          accudraw.accountForAuxRotationPlane(axes, accudraw.flags.auxRotationPlane);
          if (!accudraw.axes.equals(axes))
            accudraw.changeBaseRotationMode(rotation);
        }

        switch (accudraw.flags.auxRotationPlane) {
          case RotationMode.Front:
            accudraw.flags.auxRotationPlane = RotationMode.Side;
            break;

          case RotationMode.Side:
            accudraw.flags.auxRotationPlane = RotationMode.Top;
            break;

          case RotationMode.Top:
            accudraw.flags.auxRotationPlane = RotationMode.Front;
            break;
        }
        break;

      case RotationMode.ACS:
        rotation = RotationMode.ACS;
        switch (accudraw.flags.auxRotationPlane) {
          case RotationMode.Front:
            accudraw.flags.auxRotationPlane = RotationMode.Side;
            break;
          case RotationMode.Side:
            accudraw.flags.auxRotationPlane = RotationMode.Top;
            break;
          case RotationMode.Top:
            accudraw.flags.auxRotationPlane = RotationMode.Front;
            break;
        }
        break;

      default:
        return;
    }

    this.setStandardRotation(rotation);
  }

  public static rotate90(axis: number): void {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return;

    const newRotation = new ThreeAxes();

    accudraw.locked = accudraw.indexed = 0;
    accudraw.unlockAllFields();

    switch (axis) {
      case 0:
        newRotation.x.setFrom(accudraw.axes.x);
        newRotation.z.setFrom(accudraw.axes.y);
        newRotation.z.crossProduct(newRotation.x, newRotation.y);
        break;

      case 1:
        newRotation.x.setFrom(accudraw.axes.z);
        newRotation.y.setFrom(accudraw.axes.y);
        newRotation.x.crossProduct(newRotation.y, newRotation.z);
        break;

      case 2:
        newRotation.x.setFrom(accudraw.axes.y);
        newRotation.z.setFrom(accudraw.axes.z);
        newRotation.z.crossProduct(newRotation.x, newRotation.y);
        break;
    }

    accudraw.setContextRotation(newRotation.toMatrix3d(), true, true);
    accudraw.refreshDecorationsAndDynamics();
  }

  public static rotateAxes(aboutCurrentZ: boolean): void {
    IModelApp.tools.run("AccuDraw.RotateAxes", aboutCurrentZ);
  }

  public static rotateToElement(): void {
    IModelApp.tools.run("AccuDraw.RotateElement");
  }

  public static defineACSByElement(): void {
    IModelApp.tools.run("AccuDraw.DefineACSByElement");
  }

  public static defineACSByPoints() {
    IModelApp.tools.run("AccuDraw.DefineACSByPoints");
  }

  public static getACS(acsName: string | undefined, useOrigin: boolean, useRotation: boolean): BentleyStatus {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return BentleyStatus.ERROR;

    const vp = accudraw.currentView;
    if (!vp)
      return BentleyStatus.ERROR;

    let currRotation = 0, currBaseRotation = 0;
    const axes = new ThreeAxes();

    if (!useRotation) {
      // Save current rotation, event listener on ACS change will orient AccuDraw to ACS...
      currRotation = accudraw.rotationMode;
      currBaseRotation = accudraw.flags.baseRotation;
      axes.setFrom(accudraw.axes);
    }

    if (acsName && "" !== acsName) {
      //   // See if this ACS already exists...
      //   DgnCode acsCode = AuxCoordSystem:: CreateCode(vp -> GetViewControllerR().GetViewDefinition(), acsName);
      //   DgnElementId acsId = vp -> GetViewController().GetDgnDb().Elements().QueryElementIdByCode(acsCode);

      //   if (!acsId.IsValid())
      //     return ERROR;

      //   AuxCoordSystemCPtr auxElm = vp -> GetViewController().GetDgnDb().Elements().Get<AuxCoordSystem>(acsId);

      //   if (!auxElm.IsValid())
      //     return ERROR;

      //   AuxCoordSystemPtr acsPtr = auxElm -> MakeCopy<AuxCoordSystem>();

      //   if (!acsPtr.IsValid())
      //     return ERROR;

      //   AuxCoordSystemCR oldACS = vp -> GetViewController().GetAuxCoordinateSystem();

      //   if (!useOrigin)
      //     acsPtr -> SetOrigin(oldACS.GetOrigin());

      //   if (!useRotation)
      //     acsPtr -> SetRotation(oldACS.GetRotation());

      //   AccuDraw:: UpdateAuxCoordinateSystem(* acsPtr, * vp);
    }

    const currentACS = vp.view.auxiliaryCoordinateSystem;

    if (useOrigin) {
      accudraw.origin.setFrom(currentACS.getOrigin());
      accudraw.point.setFrom(accudraw.origin);
      accudraw.planePt.setFrom(accudraw.origin);
    }

    if (useRotation) {
      accudraw.flags.auxRotationPlane = RotationMode.Top;
      this.setStandardRotation(RotationMode.ACS);
    } else {
      this.itemFieldUnlockAll();

      accudraw.setRotationMode(currRotation);
      accudraw.flags.baseRotation = currBaseRotation;
      accudraw.axes.setFrom(axes);

      if (RotationMode.ACS === accudraw.flags.baseRotation) {
        const acs = currentACS.clone();

        const rMatrix = accudraw.getRotation();
        acs.setRotation(rMatrix);

        AccuDraw.updateAuxCoordinateSystem(acs, vp);
      }

      accudraw.published.flags &= ~AccuDrawFlags.OrientACS;
    }

    return BentleyStatus.SUCCESS;
  }

  public static writeACS(_acsName: string): BentleyStatus {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isEnabled)
      return BentleyStatus.ERROR;

    const vp = accudraw.currentView;
    if (!vp)
      return BentleyStatus.ERROR;

    // const origin = accudraw.origin;
    // const rMatrix = accudraw.getRotation();
    // AuxCoordSystemPtr acsPtr = AuxCoordSystem:: CreateFrom(vp -> GetViewController().GetAuxCoordinateSystem());
    // acsPtr -> SetOrigin(origin);
    // acsPtr -> SetRotation(rMatrix);
    // acsPtr -> SetType(CompassMode.Polar == accudraw.getCompassMode() ? ACSType :: Cylindrical : ACSType:: Rectangular);
    // acsPtr -> SetCode(AuxCoordSystem:: CreateCode(vp -> GetViewControllerR().GetViewDefinition(), nullptr != acsName ? acsName : ""));
    // acsPtr -> SetDescription("");

    // if (acsName && '\0' != acsName[0]) {
    //   DgnDbStatus status;
    //   acsPtr -> Insert(& status);

    //   if (DgnDbStatus:: Success != status)
    //   return BentleyStatus.ERROR;
    // }

    // AccuDraw:: UpdateAuxCoordinateSystem(* acsPtr, * vp);

    // accudraw.flags.baseRotation = RotationMode.ACS;
    // accudraw.SetRotationMode(RotationMode.ACS);

    return BentleyStatus.SUCCESS;
  }

  public static itemFieldUnlockAll(): void {
    const accudraw = IModelApp.accuDraw;
    if (accudraw.isEnabled)
      accudraw.unlockAllFields();
  }

  /** @internal Temporary keyboard shortcuts. */
  public static processShortcutKey(keyEvent: KeyboardEvent): boolean {
    switch (keyEvent.key.toLowerCase()) {
      case "enter":
        AccuDrawShortcuts.lockSmart();
        return true;
      case "x":
        AccuDrawShortcuts.lockX();
        return true;
      case "y":
        AccuDrawShortcuts.lockY();
        return true;
      case "z":
        AccuDrawShortcuts.lockZ();
        return true;
      case "a":
        AccuDrawShortcuts.lockAngle();
        return true;
      case "d":
        AccuDrawShortcuts.lockDistance();
        return true;
      case "m":
        AccuDrawShortcuts.changeCompassMode();
        return true;
      case "t":
        AccuDrawShortcuts.setStandardRotation(RotationMode.Top);
        return true;
      case "f":
        AccuDrawShortcuts.setStandardRotation(RotationMode.Front);
        return true;
      case "s":
        AccuDrawShortcuts.setStandardRotation(RotationMode.Side);
        return true;
      case "v":
        AccuDrawShortcuts.setStandardRotation(RotationMode.View);
        return true;
      case "o":
        AccuDrawShortcuts.setOrigin();
        return true;
      case "c":
        AccuDrawShortcuts.rotateCycle();
        return true;
      case "q":
        AccuDrawShortcuts.rotateAxes(true);
        return true;
      case "e":
        AccuDrawShortcuts.rotateToElement();
        return true;
      case "r":
        AccuDrawShortcuts.defineACSByPoints();
        return true;
    }

    return false;
  }
}

/** @internal */
export class AccuDrawSetOriginTool extends Tool {
  public static override toolId = "AccuDraw.SetOrigin";
  public override run(): boolean { AccuDrawShortcuts.setOrigin(); return true; }
}

/** @internal */
export class AccuDrawSetLockSmartTool extends Tool {
  public static override toolId = "AccuDraw.LockSmart";
  public override run(): boolean { AccuDrawShortcuts.lockSmart(); return true; }
}

/** @internal */
export class AccuDrawSetLockXTool extends Tool {
  public static override toolId = "AccuDraw.LockX";
  public override run(): boolean { AccuDrawShortcuts.lockX(); return true; }
}

/** @internal */
export class AccuDrawSetLockYTool extends Tool {
  public static override toolId = "AccuDraw.LockY";
  public override run(): boolean { AccuDrawShortcuts.lockY(); return true; }
}

/** @internal */
export class AccuDrawSetLockZTool extends Tool {
  public static override toolId = "AccuDraw.LockZ";
  public override run(): boolean { AccuDrawShortcuts.lockZ(); return true; }
}

/** @internal */
export class AccuDrawSetLockDistanceTool extends Tool {
  public static override toolId = "AccuDraw.LockDistance";
  public override run(): boolean { AccuDrawShortcuts.lockDistance(); return true; }
}

/** @internal */
export class AccuDrawSetLockAngleTool extends Tool {
  public static override toolId = "AccuDraw.LockAngle";
  public override run(): boolean { AccuDrawShortcuts.lockAngle(); return true; }
}

/** @internal */
export class AccuDrawChangeModeTool extends Tool {
  public static override toolId = "AccuDraw.ChangeMode";
  public override run(): boolean { AccuDrawShortcuts.changeCompassMode(); return true; }
}

/** @internal */
export class AccuDrawRotateCycleTool extends Tool {
  public static override toolId = "AccuDraw.RotateCycle";
  public override run(): boolean { AccuDrawShortcuts.rotateCycle(); return true; }
}

/** @internal */
export class AccuDrawRotateTopTool extends Tool {
  public static override toolId = "AccuDraw.RotateTop";
  public override run(): boolean { AccuDrawShortcuts.setStandardRotation(RotationMode.Top); return true; }
}

/** @internal */
export class AccuDrawRotateFrontTool extends Tool {
  public static override toolId = "AccuDraw.RotateFront";
  public override run(): boolean { AccuDrawShortcuts.setStandardRotation(RotationMode.Front); return true; }
}

/** @internal */
export class AccuDrawRotateSideTool extends Tool {
  public static override toolId = "AccuDraw.RotateSide";
  public override run(): boolean { AccuDrawShortcuts.setStandardRotation(RotationMode.Side); return true; }
}

/** @internal */
export class AccuDrawRotateViewTool extends Tool {
  public static override toolId = "AccuDraw.RotateView";
  public override run(): boolean { AccuDrawShortcuts.setStandardRotation(RotationMode.View); return true; }
}

/** @internal */
abstract class AccuDrawShortcutsTool extends InputCollector {
  private _cancel: boolean;
  public constructor() { super(); this._cancel = true; }
  public override onPostInstall(): void { super.onPostInstall(); this.initLocateElements(false, true, undefined, CoordinateLockOverrides.None); this.doManipulationStart(); } // NOTE: InputCollector inherits suspended primitive's state, set everything...
  public override onCleanup(): void { this.doManipulationStop(this._cancel); }
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> { if (this.doManipulation(ev, false)) { this._cancel = false; this.exitTool(); } return EventHandled.No; }
  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> { this.doManipulation(ev, true); }
  public override exitTool() { super.exitTool(); AccuDrawShortcuts.requestInputFocus(); } // re-grab focus when auto-focus tool setting set...

  public activateAccuDrawOnStart() { return true; }
  public doManipulationStart() { if (this.activateAccuDrawOnStart()) IModelApp.accuDraw.activate(); this.doManipulation(undefined, true); }
  public doManipulationStop(cancel: boolean) { if (!cancel) IModelApp.accuDraw.savedStateInputCollector.ignoreFlags = this.onManipulationComplete(); }
  public onManipulationComplete(): AccuDrawFlags { return 0; }
  public abstract doManipulation(ev: BeButtonEvent | undefined, isMotion: boolean): boolean;
}

/** @internal */
export class AccuDrawRotateAxesTool extends AccuDrawShortcutsTool {
  public static override toolId = "AccuDraw.RotateAxes";
  public static override get maxArgs(): number { return 1; }
  protected _immediateMode: boolean = false;
  public constructor(public aboutCurrentZ: boolean = true) { super(); }

  public override onInstall(): boolean {
    const accudraw = IModelApp.accuDraw;
    if (!accudraw.isActive)
      return false; // Require compass to already be active for this shortcut...

    if (this.aboutCurrentZ)
      accudraw.changeBaseRotationMode(RotationMode.Context); // Establish current orientation as base; base Z is used when defining compass rotation by x axis...

    if (accudraw.clearTentative() || IModelApp.accuSnap.isHot ||
      (CompassMode.Polar === accudraw.compassMode && accudraw.getFieldLock(ItemField.ANGLE_Item)) ||
      (CompassMode.Polar !== accudraw.compassMode && accudraw.getFieldLock(ItemField.X_Item) && accudraw.getFieldLock(ItemField.Y_Item))) {
      if (AccuDrawShortcuts.rotateAxesByPoint(true, this.aboutCurrentZ)) {
        AccuDrawShortcuts.itemFieldUnlockAll();
        accudraw.refreshDecorationsAndDynamics();
        this._immediateMode = true;
      }
    }
    return true;
  }

  public override onPostInstall(): void {
    if (this._immediateMode) {
      this.exitTool();
      return;
    }
    super.onPostInstall();
  }

  public override onManipulationComplete(): AccuDrawFlags { return AccuDrawFlags.SetRMatrix; }
  public override doManipulationStart(): void {
    super.doManipulationStart();
    CoreTools.outputPromptByKey("AccuDraw.RotateAxes.Prompts.FirstPoint");
  }

  public doManipulation(ev: BeButtonEvent | undefined, isMotion: boolean): boolean {
    const vp = ev ? ev.viewport : IModelApp.accuDraw.currentView;
    if (!vp)
      return true;
    AccuDrawShortcuts.rotateAxesByPoint(TentativeOrAccuSnap.isHot, this.aboutCurrentZ);
    vp.invalidateDecorations();
    if (!isMotion)
      AccuDrawShortcuts.itemFieldUnlockAll();
    return true;
  }

  public override parseAndRun(...args: any[]): boolean {
    for (const arg of args) {
      if (arg.toLowerCase() === "unlockedz")
        this.aboutCurrentZ = false;
    }
    return this.run(args);
  }
}

/** @internal */
export class AccuDrawRotateElementTool extends AccuDrawShortcutsTool {
  public static override toolId = "AccuDraw.RotateElement";
  public moveOrigin: boolean = !IModelApp.accuDraw.isActive; // By default use current origin if AccuDraw is already enabled...
  public override onInstall(): boolean { return IModelApp.accuDraw.isEnabled; } // Require compass to be enabled for this session...

  public override onManipulationComplete(): AccuDrawFlags {
    let ignoreFlags = AccuDrawFlags.SetRMatrix | AccuDrawFlags.Disable; // If AccuDraw wasn't active when the shortcut started, let it remain active for suspended tool when shortcut completes...
    if (this.moveOrigin)
      ignoreFlags |= AccuDrawFlags.SetOrigin;
    return ignoreFlags;
  }

  public override doManipulationStart(): void {
    super.doManipulationStart();
    CoreTools.outputPromptByKey("AccuDraw.RotateElement.Prompts.FirstPoint");
  }

  public updateOrientation(snap: SnapDetail, vp: Viewport): boolean {
    const accudraw = IModelApp.accuDraw;
    const rMatrix = AccuDraw.getSnapRotation(snap, vp);
    if (undefined === rMatrix)
      return false;
    const origin = this.moveOrigin ? snap.snapPoint : accudraw.origin;
    accudraw.setContext(AccuDrawFlags.AlwaysSetOrigin | AccuDrawFlags.SetRMatrix, origin, rMatrix);
    return true;
  }

  public doManipulation(ev: BeButtonEvent | undefined, isMotion: boolean): boolean {
    const vp = ev ? ev.viewport : IModelApp.accuDraw.currentView;
    if (!vp)
      return true;

    const snapDetail = TentativeOrAccuSnap.getCurrentSnap(false);
    if (undefined === snapDetail || !this.updateOrientation(snapDetail, vp))
      return true;

    if (undefined === ev)
      AccuDrawShortcuts.processPendingHints();
    if (!isMotion)
      IModelApp.accuDraw.changeBaseRotationMode(RotationMode.Context); // Hold temporary rotation for tool duration when not updating ACS...
    return true;
  }
}

/** @internal */
export class DefineACSByElementTool extends AccuDrawShortcutsTool {
  public static override toolId = "AccuDraw.DefineACSByElement";
  private _origin = Point3d.create();
  private _rMatrix = Matrix3d.createIdentity();
  private _acs?: AuxCoordSystemState;

  public override activateAccuDrawOnStart(): boolean { return false; }
  public override onManipulationComplete(): AccuDrawFlags { return AccuDrawFlags.SetRMatrix; }

  public override doManipulationStart(): void {
    super.doManipulationStart();
    CoreTools.outputPromptByKey("AccuDraw.DefineACSByElement.Prompts.FirstPoint");
  }

  public updateOrientation(snap: SnapDetail, vp: Viewport): boolean {
    const rMatrix = AccuDraw.getSnapRotation(snap, vp);
    if (undefined === rMatrix)
      return false;
    this._origin = snap.snapPoint;
    this._rMatrix = rMatrix;
    return true;
  }

  public doManipulation(ev: BeButtonEvent | undefined, isMotion: boolean): boolean {
    const vp = ev ? ev.viewport : undefined;
    if (!vp)
      return true;

    const snapDetail = TentativeOrAccuSnap.getCurrentSnap(false);
    if (undefined === snapDetail || !this.updateOrientation(snapDetail, vp))
      return true;
    IModelApp.viewManager.invalidateDecorationsAllViews();
    if (isMotion)
      return true;

    if (!this._acs)
      this._acs = vp.view.auxiliaryCoordinateSystem.clone();
    this._acs.setOrigin(this._origin);
    this._acs.setRotation(this._rMatrix);
    AccuDraw.updateAuxCoordinateSystem(this._acs, vp);
    AccuDrawShortcuts.rotateToACS();
    return true;
  }

  public override decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!this._acs)
      this._acs = vp.view.auxiliaryCoordinateSystem.clone();
    this._acs.setOrigin(this._origin);
    this._acs.setRotation(this._rMatrix);
    this._acs.display(context, ACSDisplayOptions.Active | ACSDisplayOptions.Dynamics);
  }
}

/** @internal */
export class DefineACSByPointsTool extends AccuDrawShortcutsTool {
  public static override toolId = "AccuDraw.DefineACSByPoints";
  private readonly _points: Point3d[] = [];
  private _acs?: AuxCoordSystemState;

  public override activateAccuDrawOnStart(): boolean { return false; }
  public override onManipulationComplete(): AccuDrawFlags { return AccuDrawFlags.SetRMatrix; }

  public override doManipulationStart(): void {
    super.doManipulationStart();
    const tentativePoint = IModelApp.tentativePoint;
    if (!tentativePoint.isActive) {
      CoreTools.outputPromptByKey("AccuDraw.DefineACSByPoints.Prompts.FirstPoint");
      return;
    }

    const origin = tentativePoint.getPoint().clone();
    CoreTools.outputPromptByKey("AccuDraw.DefineACSByPoints.Prompts.SecondPoint");
    IModelApp.accuDraw.setContext(AccuDrawFlags.SetOrigin | AccuDrawFlags.FixedOrigin, origin);
    this._points.push(origin);
    tentativePoint.clear(true);
  }

  public doManipulation(ev: BeButtonEvent | undefined, isMotion: boolean): boolean {
    if (!ev || !ev.viewport)
      return true;

    IModelApp.viewManager.invalidateDecorationsAllViews();
    if (isMotion)
      return false;

    IModelApp.accuDraw.activate();
    this._points.push(ev.point.clone());

    const vp = ev.viewport;
    if (!this._acs)
      this._acs = vp.view.auxiliaryCoordinateSystem.clone();

    if (AccuDrawShortcuts.updateACSByPoints(this._acs, vp, this._points, false)) {
      AccuDraw.updateAuxCoordinateSystem(this._acs, vp);
      AccuDrawShortcuts.rotateToACS();
      return true;
    }

    CoreTools.outputPromptByKey(`AccuDraw.DefineACSByPoints.Prompts${1 === this._points.length ? ".SecondPoint" : ".NextPoint"}`);
    return false;
  }

  public override decorate(context: DecorateContext): void {
    const tmpPoints: Point3d[] = [];
    this._points.forEach((pt) => tmpPoints.push(pt));

    const ev = new BeButtonEvent();
    IModelApp.toolAdmin.fillEventFromCursorLocation(ev);
    tmpPoints.push(ev.point);

    const vp = context.viewport;
    if (!this._acs)
      this._acs = vp.view.auxiliaryCoordinateSystem.clone();

    AccuDrawShortcuts.updateACSByPoints(this._acs, vp, tmpPoints, true);
    this._acs.display(context, ACSDisplayOptions.Active | ACSDisplayOptions.Dynamics);
  }
}
