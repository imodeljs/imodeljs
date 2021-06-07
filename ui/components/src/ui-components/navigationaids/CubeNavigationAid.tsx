/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NavigationAids
 */

import "./CubeNavigationAid.scss";
import classnames from "classnames";
import * as React from "react";
import { Angle, AxisIndex, AxisOrder, Geometry, Matrix3d, Point2d, Vector2d, Vector3d, XYAndZ } from "@bentley/geometry-core";
import { IModelConnection, Viewport } from "@bentley/imodeljs-frontend";
import { CommonProps, Cube, Face } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";
import { ViewportComponentEvents, ViewRotationChangeEventArgs } from "../viewport/ViewportComponentEvents";

/** @public */
export enum CubeNavigationHitBoxX {
  None = 0,
  Right = 1,
  Left = -1,
}
/** @internal
 * @deprecated Use [[CubeNavigationHitBoxX]] */
export enum HitBoxX {
  None = 0,
  Right = 1,
  Left = -1,
}
/** @public */
export enum CubeNavigationHitBoxY {
  None = 0,
  Back = 1,
  Front = -1,
}

/** @internal
 * @deprecated Use [[CubeNavigationHitBoxY]] */
export enum HitBoxY {
  None = 0,
  Back = 1,
  Front = -1,
}

/** @public */
export enum CubeNavigationHitBoxZ {
  None = 0,
  Top = 1,
  Bottom = -1,
}
/** @internal
 * @deprecated [[CubeNavigationHitBoxZ]] */
export enum HitBoxZ {
  None = 0,
  Top = 1,
  Bottom = -1,
}

interface CubeNavigationRotationMap {
  up: Face;
  down: Face;
  left: Face;
  right: Face;
}

const cubeNavigationFaceLocs: { [key: string]: Vector3d } = {
  [Face.Left]: Vector3d.create(CubeNavigationHitBoxX.Left, CubeNavigationHitBoxY.None, CubeNavigationHitBoxZ.None),
  [Face.Right]: Vector3d.create(CubeNavigationHitBoxX.Right, CubeNavigationHitBoxY.None, CubeNavigationHitBoxZ.None),
  [Face.Back]: Vector3d.create(CubeNavigationHitBoxX.None, CubeNavigationHitBoxY.Back, CubeNavigationHitBoxZ.None),
  [Face.Front]: Vector3d.create(CubeNavigationHitBoxX.None, CubeNavigationHitBoxY.Front, CubeNavigationHitBoxZ.None),
  [Face.Bottom]: Vector3d.create(CubeNavigationHitBoxX.None, CubeNavigationHitBoxY.None, CubeNavigationHitBoxZ.Bottom),
  [Face.Top]: Vector3d.create(CubeNavigationHitBoxX.None, CubeNavigationHitBoxY.None, CubeNavigationHitBoxZ.Top),
};

const cubeNavigationFaceRotations: { [key: string]: Matrix3d } = {
  [Face.Left]: Matrix3d.createRowValues(0, -1, 0, 0, 0, 1, -1, 0, 0),
  [Face.Right]: Matrix3d.createRowValues(0, 1, 0, 0, 0, 1, 1, 0, 0),
  [Face.Back]: Matrix3d.createRowValues(-1, 0, 0, 0, 0, 1, 0, 1, 0),
  [Face.Front]: Matrix3d.createRowValues(1, 0, 0, 0, 0, 1, 0, -1, 0),
  [Face.Bottom]: Matrix3d.createRowValues(1, 0, 0, 0, -1, 0, 0, 0, -1),
  [Face.Top]: Matrix3d.createRowValues(1, 0, 0, 0, 1, 0, 0, 0, 1),
};

// data relating Up/Down/Left/Right directions relative to every surface
const cubeNavigationRoutes: { [key: string]: CubeNavigationRotationMap } = {
  [Face.Front]: { up: Face.Top, down: Face.Bottom, left: Face.Left, right: Face.Right },
  [Face.Back]: { up: Face.Top, down: Face.Bottom, left: Face.Right, right: Face.Left },
  [Face.Top]: { up: Face.Back, down: Face.Front, left: Face.Left, right: Face.Right },
  [Face.Bottom]: { up: Face.Front, down: Face.Back, left: Face.Left, right: Face.Right },
  [Face.Right]: { up: Face.Top, down: Face.Bottom, left: Face.Front, right: Face.Back },
  [Face.Left]: { up: Face.Top, down: Face.Bottom, left: Face.Back, right: Face.Front },
};

/** The default tolerance (1.0e-6) is appropriate if very dirty viewing operations are expected. */
const DEFAULT_TOLERANCE = 1.0e-6;

/** @internal */
export enum CubeHover {
  None = 0,
  Hover,
  Active,
}

/** Properties for the [[CubeNavigationAid]] component
 * @public
 */
export interface CubeNavigationAidProps extends CommonProps {
  iModelConnection: IModelConnection;
  viewport?: Viewport;

  // used only in testing

  /** @internal */
  onAnimationEnd?: () => void;
  /** @internal */
  animationTime?: number;
}

/** @public */
interface CubeNavigationAidState {
  dragging: boolean;
  startRotMatrix: Matrix3d;
  endRotMatrix: Matrix3d;
  animation: number;
  hoverMap: { [key: string]: CubeHover };
  face: Face;
}

/** Cube Navigation Aid Component
 * @public
 */
export class CubeNavigationAid extends React.Component<CubeNavigationAidProps, CubeNavigationAidState> {
  private _start: Vector2d = Vector2d.createZero();
  /** @internal */
  public readonly state: Readonly<CubeNavigationAidState> = {
    dragging: false,
    startRotMatrix: Matrix3d.createIdentity(),
    endRotMatrix: Matrix3d.createIdentity(),
    animation: 1,
    hoverMap: {},
    face: Face.Top,
  };

  private _lastTime: number | undefined;
  private _animationFrame: any;
  private _mounted: boolean = false;
  private _labels: { [key: string]: string } = {
    [Face.Right]: UiComponents.translate("cube.right"),
    [Face.Left]: UiComponents.translate("cube.left"),
    [Face.Back]: UiComponents.translate("cube.back"),
    [Face.Front]: UiComponents.translate("cube.front"),
    [Face.Top]: UiComponents.translate("cube.top"),
    [Face.Bottom]: UiComponents.translate("cube.bottom"),
  };

  /** @internal */
  public componentDidMount() {
    this._mounted = true;
    ViewportComponentEvents.onViewRotationChangeEvent.addListener(this._handleViewRotationChangeEvent);

    // set initial rotation
    if (this.props.viewport) {
      const newMatrix = this.props.viewport.view.getRotation().clone();
      this.setState({ startRotMatrix: newMatrix, endRotMatrix: newMatrix, animation: 1 });
    }
  }

  /** @internal */
  public componentWillUnmount() {
    ViewportComponentEvents.onViewRotationChangeEvent.removeListener(this._handleViewRotationChangeEvent);
    clearTimeout(this._animationFrame);
    this._mounted = false;
  }

  // Synchronize with rotation coming from the Viewport
  private _handleViewRotationChangeEvent = (args: ViewRotationChangeEventArgs) => {
    const { animation, dragging, endRotMatrix } = this.state;
    // istanbul ignore else
    if (this.props.viewport === args.viewport && animation >= 1 && !dragging) {
      const newMatrix = this.props.viewport.view.getRotation().clone();
      if (!endRotMatrix.isAlmostEqual(newMatrix)) {
        this.setState({ startRotMatrix: newMatrix, endRotMatrix: newMatrix, animation: 1, face: Face.None });
      }
    }
  };

  private _animation = () => {
    const t = Date.now();
    const delta = this._lastTime ? t - this._lastTime : 16;
    this._lastTime = t;
    if (this.state.animation !== 1) {
      const animation = Math.min(1, this.state.animation + delta / (1000 * (this.props.animationTime || /* istanbul ignore next */ 0.4)));

      // istanbul ignore next
      if (this._mounted) {
        this.setState({ animation }, () => {
          this._animationFrame = setTimeout(this._animation, 16.667);
        });
      }
    } else {
      this._lastTime = undefined;
      this._animationEnd();
    }
  };

  private _animationEnd = () => {
    ViewportComponentEvents.setCubeMatrix(this.state.endRotMatrix, this.state.face, true);
    const startRotMatrix = this.state.endRotMatrix.clone();
    // istanbul ignore next
    if (this._mounted) {
      this.setState({ startRotMatrix }, () => {
        // istanbul ignore else
        if (this.props.onAnimationEnd)
          this.props.onAnimationEnd();
      });
    }
  };

  private static _animationFn = (t: number) => t < .5 ? 2 * t ** 2 : -1 + (4 - 2 * t) * t;

  private static _isMatrixFace = (matrix: Matrix3d): boolean => {
    let sum = 0;
    for (const coff of matrix.coffs) {
      if (Geometry.isAlmostEqualNumber(Math.abs(coff), 1))
        sum++;
    }
    // Assuming matrix is a proper rotation matrix:
    // if matrix viewing a face, there will be a total of 3 values either almost -1, or almost 1.
    return sum === 3;
  };

  public render(): React.ReactNode {
    const { animation, startRotMatrix, endRotMatrix } = this.state;
    const visible = CubeNavigationAid._isMatrixFace(endRotMatrix) && animation === 1.0;
    const rotMatrix = CubeNavigationAid._interpolateRotMatrix(startRotMatrix, animation, endRotMatrix);
    if (rotMatrix !== startRotMatrix && rotMatrix !== endRotMatrix)
      ViewportComponentEvents.setCubeMatrix(rotMatrix, Face.None);

    const faces: { [key: string]: React.ReactNode } = {};
    for (const key in this._labels) {
      // istanbul ignore else
      if (this._labels.hasOwnProperty(key)) {
        const f = key as Face;
        const label = this._labels[f];
        faces[f] =
          <NavCubeFace
            face={f}
            label={label}
            hoverMap={this.state.hoverMap}
            onFaceCellClick={this._handleFaceCellClick}
            onFaceCellHoverChange={this._handleCellHoverChange} />;
      }
    }

    const cubeClassNames = classnames(
      "nav-cube",
      this.state.dragging && "cube-dragging",
    );

    const upTitle = this.getArrowTitle(Pointer.Up);
    const downTitle = this.getArrowTitle(Pointer.Down);
    const leftTitle = this.getArrowTitle(Pointer.Left);
    const rightTitle = this.getArrowTitle(Pointer.Right);

    return (
      <div className={classnames("components-cube-container", this.props.className)}
        style={this.props.style}
        data-testid="components-cube-navigation-aid"
        onMouseDown={this._handleBoxMouseDown}
        onTouchStart={this._handleBoxTouchStart}
        role="presentation"
      >
        <div className={"cube-element-container"}>
          <Cube
            className={cubeClassNames}
            rotMatrix={rotMatrix}
            faces={faces} />
        </div>
        <PointerButton data-testid="cube-pointer-button-up"
          visible={visible} pointerType={Pointer.Up} onArrowClick={this._onArrowClick} title={upTitle} />
        <PointerButton data-testid="cube-pointer-button-down"
          visible={visible} pointerType={Pointer.Down} onArrowClick={this._onArrowClick} title={downTitle} />
        <PointerButton data-testid="cube-pointer-button-left"
          visible={visible} pointerType={Pointer.Left} onArrowClick={this._onArrowClick} title={leftTitle} />
        <PointerButton data-testid="cube-pointer-button-right"
          visible={visible} pointerType={Pointer.Right} onArrowClick={this._onArrowClick} title={rightTitle} />
      </div>
    );
  }

  private _handleCellHoverChange = (vect: Vector3d, state: CubeHover) => {
    const hoverMap = this.state.hoverMap;
    hoverMap[`${vect.x}-${vect.y}-${vect.z}`] = state;
    this.setState({ hoverMap });
  };

  private static _getMatrixFace = (rotMatrix: Matrix3d): Face => {
    if (!CubeNavigationAid._isMatrixFace(rotMatrix)) {
      return Face.None;
    }

    let matrixFace = Face.None;

    for (const face in cubeNavigationFaceRotations) {
      // istanbul ignore else
      if (face in cubeNavigationFaceRotations) {
        const loc = cubeNavigationFaceRotations[face];
        if (rotMatrix.isAlmostEqual(loc)) {
          matrixFace = face as Face;
          break;
        }
      }
    }

    return matrixFace;
  };

  private static _interpolateRotMatrix = (start: Matrix3d, anim: number, end: Matrix3d): Matrix3d => {
    if (anim === 0)
      return start;
    if (anim === 1 || start.isAlmostEqual(end))
      return end;
    const startInverse = start.transpose();
    const diff = end.multiplyMatrixMatrix(startInverse);
    const angleAxis = diff.getAxisAndAngleOfRotation();
    // istanbul ignore else
    if (angleAxis.ok) {
      const angle = Angle.createRadians(angleAxis.angle.radians * CubeNavigationAid._animationFn(anim));
      const newDiff = Matrix3d.createRotationAroundVector(angleAxis.axis, angle);
      // istanbul ignore else
      if (newDiff) {
        const newMatrix = newDiff.multiplyMatrixMatrix(start);
        return newMatrix;
      }
    }
    // istanbul ignore next
    return end;
  };

  private static correctSmallNumber(value: number, tolerance: number): number {
    return Math.abs(value) < tolerance ? 0 : value;
  }

  /**
   * Snap coordinates of a vector to zero and to each other so that the vector prefers to be
   * * perpendicular to a face of the unit cube.
   * * or pass through a nearby vertex or edge of the unit cube.
   * @param zVector existing z vector.
   * @param tolerance tolerance to determine if a z vector component is close to zero or 1.
   */
  private static snapVectorToCubeFeatures(zVector: XYAndZ, tolerance: number): Vector3d {
    const x = CubeNavigationAid.correctSmallNumber(zVector.x, tolerance);
    let y = CubeNavigationAid.correctSmallNumber(zVector.y, tolerance);
    let z = CubeNavigationAid.correctSmallNumber(zVector.z, tolerance);

    const xx = Math.abs(x);
    const yy = Math.abs(y);
    const zz = Math.abs(z);

    // adjust any adjacent pair of near equal values to the first.
    // istanbul ignore next
    if (Geometry.isSameCoordinate(xx, yy, tolerance)) {
      y = Geometry.split3WaySign(y, -xx, xx, xx);
    }
    if (Geometry.isSameCoordinate(yy, zz, tolerance)) {
      z = Geometry.split3WaySign(z, -yy, yy, yy);
    }
    if (Geometry.isSameCoordinate(xx, zz, tolerance)) {
      z = Geometry.split3WaySign(z, -xx, xx, xx);
    }
    return Vector3d.create(x, y, z);
  }

  /**
   * Adjust a worldToView matrix to favor both
   * * direct view at faces, edges, and corners of a view cube.
   * * heads up
   * @param worldToView candidate matrix
   * @param tolerance tolerance for cleaning up fuzz.  The default (1.0e-6) is appropriate if very dirty viewing operations are expected.
   * @param result optional result.
   */
  private static snapWorldToViewMatrixToCubeFeatures(worldToView: Matrix3d, tolerance: number, result?: Matrix3d): Matrix3d {
    const oldZ = worldToView.rowZ();
    const newZ = CubeNavigationAid.snapVectorToCubeFeatures(oldZ, tolerance);
    // If newZ is true up or down, it will have true 0 for x and y.
    // special case this to take x direction from the input.
    // istanbul ignore next
    if (newZ.x === 0.0 && newZ.y === 0) {
      const perpVector = worldToView.rowX();
      result = Matrix3d.createRigidFromColumns(newZ, perpVector, AxisOrder.ZXY, result)!;
    } else {
      result = Matrix3d.createRigidViewAxesZTowardsEye(newZ.x, newZ.y, newZ.z, result);
    }
    // istanbul ignore else
    if (result)
      result.transposeInPlace();
    return result;
  }

  private getArrowRotationAndFace(arrow: Pointer): { newRotation: Matrix3d, face: Face } {
    const localRotationAxis = Vector3d.create(0, 0, 0);
    switch (arrow) {
      case Pointer.Up:
        localRotationAxis.x = -1.0;
        break;
      case Pointer.Down:
        localRotationAxis.x = 1.0;
        break;
      case Pointer.Left:
        localRotationAxis.y = -1.0;
        break;
      default:
        localRotationAxis.y = 1.0;
        break;
    }
    const localRotation = Matrix3d.createRotationAroundVector(localRotationAxis, Angle.createDegrees(-90))!;
    const newRotation = localRotation.multiplyMatrixMatrix(this.state.endRotMatrix);
    CubeNavigationAid.snapWorldToViewMatrixToCubeFeatures(newRotation, DEFAULT_TOLERANCE, newRotation);
    const face = CubeNavigationAid._getMatrixFace(newRotation);
    return { newRotation, face };
  }

  private _onArrowClick = (arrow: Pointer) => {
    const { newRotation, face } = this.getArrowRotationAndFace(arrow);
    this._animateRotation(newRotation, face);
  };

  private getArrowTitle(arrow: Pointer) {
    const { face } = this.getArrowRotationAndFace(arrow);
    return this._labels[face];
  }

  private _lastClientXY: Vector2d = Vector2d.createZero();
  private _processDrag(mousePos: Vector2d) {
    // istanbul ignore else
    if (!this._start.isAlmostEqual(mousePos)) {
      const movement = mousePos.minus(this._lastClientXY);
      const diff = movement.scale(0.05);

      const yaw = Angle.createRadians(diff.x);
      const pitch = Angle.createRadians(diff.y);

      const matX = Matrix3d.createRotationAroundAxisIndex(AxisIndex.X, pitch);
      const matZ = Matrix3d.createRotationAroundAxisIndex(AxisIndex.Z, yaw);

      const mat = matX.multiplyMatrixMatrix(this.state.startRotMatrix).multiplyMatrixMatrix(matZ);
      this._setRotation(mat, CubeNavigationAid._getMatrixFace(mat));
      if (!this.state.dragging)
        this.setState({ dragging: true });
    }
    this._lastClientXY = mousePos;
  }

  private _handleBoxMouseDown = (event: any) => {
    event.preventDefault();
    // only start listening after drag is confirmed. Ie. the 3D box is clicked.
    window.addEventListener("mousemove", this._onMouseMove, false);
    window.addEventListener("mouseup", this._onMouseUp, false);
    this._lastClientXY = Vector2d.create(event.clientX, event.clientY);
    this._start = this._lastClientXY;
  };

  private _onMouseMove = (event: MouseEvent) => {
    const mousePos = Vector2d.create(event.clientX, event.clientY);
    this._processDrag(mousePos);
  };

  private _onMouseUp = () => {
    if (this.state.dragging) {
      this.setState({ dragging: false });
      ViewportComponentEvents.setCubeMatrix(this.state.endRotMatrix, CubeNavigationAid._getMatrixFace(this.state.endRotMatrix), true);
    }

    // remove so event only triggers after this.onMouseStartDrag
    window.removeEventListener("mousemove", this._onMouseMove);
    window.removeEventListener("mouseup", this._onMouseUp);
  };

  // istanbul ignore next - unable to test touch
  private _handleBoxTouchStart = (event: any) => {
    if (1 !== event.targetTouches.length)
      return;
    window.addEventListener("touchmove", this._onTouchMove, false);
    window.addEventListener("touchend", this._onTouchEnd, false);
    this._lastClientXY = Vector2d.create(event.targetTouches[0].clientX, event.targetTouches[0].clientY);
    this._start = this._lastClientXY;
  };

  // istanbul ignore next - unable to test touch
  private _onTouchMove = (event: TouchEvent) => {
    if (1 !== event.targetTouches.length)
      return;
    const mousePos = Vector2d.create(event.targetTouches[0].clientX, event.targetTouches[0].clientY);
    this._processDrag(mousePos);
  };

  // istanbul ignore next - unable to test touch
  private _onTouchEnd = (event: TouchEvent) => {
    if (0 !== event.targetTouches.length)
      return;

    if (this.state.dragging) {
      this.setState({ dragging: false });
      ViewportComponentEvents.setCubeMatrix(this.state.endRotMatrix, CubeNavigationAid._getMatrixFace(this.state.endRotMatrix), true);
    }

    window.removeEventListener("touchmove", this._onTouchMove);
    window.removeEventListener("touchend", this._onTouchEnd);
  };

  private _handleFaceCellClick = (pos: Vector3d, face: Face) => {
    const { endRotMatrix } = this.state;
    let rotMatrix = Matrix3d.createRigidViewAxesZTowardsEye(pos.x, pos.y, pos.z).inverse();
    // istanbul ignore else
    if (rotMatrix) {
      // if isMatrixFace and user is clicking on top/bottom, the current matrix face must be top or bottom
      if (!CubeNavigationAid._isMatrixFace(endRotMatrix) && (face === Face.Top || face === Face.Bottom)) {
        const angleAxis = endRotMatrix.getAxisAndAngleOfRotation();
        // istanbul ignore else
        if (angleAxis.ok) {
          const xAx = endRotMatrix.columnX();
          const a = Math.atan2(xAx.y, xAx.x);
          const r = Math.round(a * 2 / Math.PI) * Math.PI / 2; // round to quarter turn intervals
          const rot = Matrix3d.createRotationAroundAxisIndex(AxisIndex.Z, Angle.createRadians(r));
          rotMatrix = rot.multiplyMatrixMatrix(rotMatrix);
        }
      }
      this._animateRotation(rotMatrix, face);
    }
    window.removeEventListener("mousemove", this._onMouseMove);
  };

  private _animateRotation = (endRotMatrix: Matrix3d, face: Face) => {
    if (this.state.endRotMatrix.isAlmostEqual(endRotMatrix))
      return;
    // set animation variables, let css transitions animate it.
    this._animationFrame = setTimeout(this._animation, 16.667);
    this.setState((prevState) => ({
      startRotMatrix: prevState.endRotMatrix, endRotMatrix,
      animation: 0,
      face,
    }));
  };

  private _setRotation = (endRotMatrix: Matrix3d, face: Face) => {
    ViewportComponentEvents.setCubeMatrix(endRotMatrix, face);
    // set variables, with animTime at 0 to prevent animation.
    this.setState({
      startRotMatrix: endRotMatrix,
      endRotMatrix,
      animation: 1,
      face,
    });
  };
}

/** @internal */
export interface NavCubeFaceProps extends React.AllHTMLAttributes<HTMLDivElement> {
  face: Face;
  label: string;
  hoverMap: { [key: string]: CubeHover };
  onFaceCellClick: (vector: Vector3d, face: Face) => void;
  onFaceCellHoverChange: (vector: Vector3d, state: CubeHover) => void;
}

/** @internal */
export class NavCubeFace extends React.Component<NavCubeFaceProps> {
  public render(): React.ReactNode {
    const { face, hoverMap, onFaceCellClick, onFaceCellHoverChange, label } = this.props;
    return (
      <div className="nav-cube-face" data-testid="nav-cube-face">
        {[-1, 0, 1].map((y: number) => {
          return (
            <FaceRow key={y} center={y === 0}>
              {[-1, 0, 1].map((x: number) => {
                return (
                  <FaceCell
                    key={x}
                    onFaceCellHoverChange={onFaceCellHoverChange}
                    onFaceCellClick={onFaceCellClick}
                    hoverMap={hoverMap}
                    vector={NavCubeFace.faceCellToPos(face, x, y)}
                    face={face}
                    center={x === 0}>
                    {x === 0 && y === 0 &&
                      label}
                  </FaceCell>
                );
              })}
            </FaceRow>
          );
        })}
      </div>
    );
  }
  public static faceCellToPos = (face: Face, x: number, y: number) => {
    const faceVect = cubeNavigationFaceLocs[face];
    const route = cubeNavigationRoutes[face];

    const faceX = x < 0 ? route.left : x > 0 ? route.right : Face.None;
    const xVect = faceX !== Face.None ? cubeNavigationFaceLocs[faceX] : Vector3d.createZero();

    const faceY = y < 0 ? route.up : y > 0 ? route.down : Face.None;
    const yVect = faceY !== Face.None ? cubeNavigationFaceLocs[faceY] : Vector3d.createZero();

    return faceVect.plus(xVect).plus(yVect);
  };
}

interface FaceRowProps extends React.AllHTMLAttributes<HTMLDivElement> {
  center?: boolean;
}

class FaceRow extends React.Component<FaceRowProps> {
  public render(): React.ReactNode {
    const { center, children, ...props } = this.props;
    const classNames = classnames(
      "face-row",
      center && "cube-center",
    );
    return <div className={classNames} {...props}>{children}</div>;
  }
}

/** @internal */
export interface FaceCellProps extends React.AllHTMLAttributes<HTMLDivElement> {
  center?: boolean;
  onFaceCellClick: (vector: Vector3d, face: Face) => void;
  onFaceCellHoverChange: (vector: Vector3d, state: CubeHover) => void;
  hoverMap: { [key: string]: CubeHover };
  vector: Vector3d;
  face: Face;
}

/** @internal */
export class FaceCell extends React.Component<FaceCellProps> {
  private _startMouse: Point2d | undefined;
  public render(): React.ReactNode {
    const { center, children, onFaceCellClick, onFaceCellHoverChange, hoverMap, face, vector, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { x, y, z } = vector;
    const n = `${x}-${y}-${z}`;
    const hover = hoverMap[n] === CubeHover.Hover;
    const active = hoverMap[n] === CubeHover.Active;
    const classNames = classnames(
      "face-cell",
      center && "cube-center",
      hover && "cube-hover",
      active && "cube-active",
    );

    // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
    return <div
      onMouseDown={this._handleMouseDown}
      onMouseUp={this._handleMouseUp}
      onMouseOver={this._handleMouseOver}
      onMouseOut={this._handleMouseOut}
      onTouchStart={this._handleTouchStart}
      onTouchEnd={this._handleTouchEnd}
      data-testid={`nav-cube-face-cell-${face}-${n}`}
      className={classNames}
      role="presentation"
      {...props}
    >
      {children}
    </div>;
  }
  private _handleMouseOver = () => {
    const { vector } = this.props;
    this.props.onFaceCellHoverChange(vector, CubeHover.Hover);
  };
  private _handleMouseOut = () => {
    const { vector } = this.props;
    this.props.onFaceCellHoverChange(vector, CubeHover.None);
  };
  private _handleMouseDown = (event: React.MouseEvent) => {
    const { clientX, clientY } = event;
    this.handlePointerDown(clientX, clientY);
  };
  private _handleMouseUp = (event: React.MouseEvent) => {
    const { clientX, clientY } = event;
    this.handlePointerUp(clientX, clientY);
  };

  private _handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.targetTouches.length === 1 && this.handlePointerDown(event.targetTouches[0].clientX, event.targetTouches[0].clientY);
  };

  private _handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.changedTouches.length === 1 && this.handlePointerUp(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
  };

  private handlePointerDown(x: number, y: number) {
    const { vector } = this.props;
    this._startMouse = Point2d.create(x, y);
    this.props.onFaceCellHoverChange(vector, CubeHover.Active);
  }

  private handlePointerUp(x: number, y: number) {
    const { vector, face } = this.props;
    this.props.onFaceCellHoverChange(vector, CubeHover.None);
    const mouse = Point2d.create(x, y);
    if (this._startMouse && this._startMouse.isAlmostEqual(mouse)) {
      const isFace = Math.abs(vector.x) + Math.abs(vector.y) + Math.abs(vector.z) === 1;
      this.props.onFaceCellClick(vector, isFace ? face : Face.None);
    }
  }
}

enum Pointer {
  None = 0,
  Up,
  Down,
  Left,
  Right,
}

const pointerIconClass: { [key: number]: string } = {
  [Pointer.Up]: "icon-caret-down",
  [Pointer.Down]: "icon-caret-up",
  [Pointer.Left]: "icon-caret-right",
  [Pointer.Right]: "icon-caret-left",
};

const pointerClass: { [key: number]: string } = {
  [Pointer.Up]: "cube-up",
  [Pointer.Down]: "cube-down",
  [Pointer.Left]: "cube-left",
  [Pointer.Right]: "cube-right",
};

interface PointerProps extends React.AllHTMLAttributes<HTMLDivElement> {
  visible: boolean;
  pointerType: Pointer;
  onArrowClick(pointer: Pointer): void;
  title: string;
  ["data-testid"]?: string;
}

class PointerButton extends React.Component<PointerProps> {
  public render(): React.ReactNode {
    const { visible, pointerType, onArrowClick, title, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    const classes = classnames(
      "cube-pointer", "icon",
      pointerClass[pointerType],
      pointerIconClass[pointerType],
      visible && "cube-visible",
    );

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div className={classes} role="button" tabIndex={-1} title={title} {...props}
        onClick={this._handleClick} />
    );
  }
  private _handleClick = (event: React.MouseEvent) => {
    const { pointerType } = this.props;
    event.preventDefault();
    this.props.onArrowClick(pointerType);
  };
}
