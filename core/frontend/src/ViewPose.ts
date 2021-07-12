/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */

import { BeTimePoint } from "@bentley/bentleyjs-core";
import { Angle, Matrix3d, Point2d, Point3d, Vector3d } from "@bentley/geometry-core";
import { Camera } from "@bentley/imodeljs-common";
import { ViewState, ViewState2d, ViewState3d } from "./ViewState";

/** The "pose" for a view. This is either the volume or area, depending on whether the view is 3d or 2d,
 * plus the camera position/angle, if it is enabled.
 * @note a ViewPose is immutable.
 * @public
 */
export abstract class ViewPose {
  public undoTime?: BeTimePoint; // the time this pose was created, if it is saved in the view undo stack.
  public abstract equalState(view: ViewState): boolean;
  public abstract equal(other: ViewPose): boolean;
  public abstract origin: Point3d;
  public abstract extents: Vector3d;
  public abstract rotation: Matrix3d;

  public get center() {
    const delta = this.rotation.multiplyTransposeVector(this.extents);
    return this.origin.plusScaled(delta, 0.5);
  }

  public get target() { return this.center; }
  public get zVec() { return this.rotation.getRow(2); }
  public constructor(public cameraOn: boolean) { }
}

/** @internal */
export class ViewPose3d extends ViewPose {
  public readonly origin: Point3d;
  public readonly extents: Vector3d;
  public readonly rotation: Matrix3d;
  public readonly camera: Camera;

  public constructor(view: ViewState3d) {
    super(view.isCameraOn);
    this.origin = view.origin.clone();
    this.extents = view.extents.clone();
    this.rotation = view.rotation.clone();
    this.camera = view.camera.clone();
  }

  public override get target() {
    return this.cameraOn ? this.camera.eye.plusScaled(this.rotation.getRow(2), -1.0 * this.camera.focusDist) : this.center;
  }

  public equal(other: ViewPose3d) {
    return this.cameraOn === other.cameraOn &&
      this.origin.isAlmostEqual(other.origin) &&
      this.extents.isAlmostEqual(other.extents) &&
      this.rotation.isAlmostEqual(other.rotation) &&
      (!this.cameraOn || this.camera.equals(other.camera));
  }

  public equalState(view: ViewState3d): boolean {
    return this.cameraOn === view.isCameraOn &&
      this.origin.isAlmostEqual(view.origin) &&
      this.extents.isAlmostEqual(view.extents) &&
      this.rotation.isAlmostEqual(view.rotation) &&
      (!this.cameraOn || this.camera.equals(view.camera));
  }
}

/** @internal */
export class ViewPose2d extends ViewPose {
  public readonly origin2: Point2d;
  public readonly delta: Point2d;
  public readonly angle: Angle;

  public constructor(view: ViewState2d) {
    super(false);
    this.origin2 = view.origin.clone();
    this.delta = view.delta.clone();
    this.angle = view.angle.clone();
  }

  public equal(other: ViewPose2d) {
    return this.origin2.isAlmostEqual(other.origin) &&
      this.delta.isAlmostEqual(other.delta) &&
      this.angle.isAlmostEqualNoPeriodShift(other.angle);
  }

  public equalState(view: ViewState2d): boolean {
    return this.origin2.isAlmostEqual(view.origin) &&
      this.delta.isAlmostEqual(view.delta) &&
      this.angle.isAlmostEqualNoPeriodShift(view.angle);
  }

  public get origin() { return new Point3d(this.origin2.x, this.origin2.y); }
  public get extents() { return new Vector3d(this.delta.x, this.delta.y); }
  public get rotation() { return Matrix3d.createRotationAroundVector(Vector3d.unitZ(), this.angle)!; }
}
