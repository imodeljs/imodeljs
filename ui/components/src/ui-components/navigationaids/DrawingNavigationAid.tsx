/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NavigationAids
 */

import "./DrawingNavigationAid.scss";
import classnames from "classnames";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Constant, Geometry, Matrix3d, Point2d, Point3d, Point4d, Vector3d } from "@bentley/geometry-core";
import { IModelApp, IModelConnection, ScreenViewport, ViewManager, Viewport, ViewState } from "@bentley/imodeljs-frontend";
import { CommonProps } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";
import { ViewportComponentEvents, ViewRotationChangeEventArgs } from "../viewport/ViewportComponentEvents";
import { SpecialKey } from "@bentley/ui-abstract";

// cSpell:ignore Quaternion Quaternions unrotate
/* eslint-disable jsx-a11y/click-events-have-key-events */

/**
 * Enum for mode that minimap is currently in
 * @internal
 */
export enum MapMode {
  Opened = "map-opened",
  Closed = "map-closed",
}

/** Properties for the [[DrawingNavigationAid]] component
 * @beta
 */
export interface DrawingNavigationAidProps extends CommonProps {
  iModelConnection: IModelConnection;
  viewport?: Viewport;

  // used only in testing

  /** @internal */
  animationTime?: number;
  /** @internal */
  openSize?: Vector3d;
  /** @internal */
  closeSize?: Vector3d;
  /** @internal */
  initialMapMode?: MapMode;
  /** @internal */
  onAnimationEnd?: () => void;
  /** @internal */
  initialRotateMinimapWithView?: boolean;
  /** @internal */
  initialView?: ViewState;
  /** @internal */
  viewManagerOverride?: ViewManager;
  /** @internal */
  screenViewportOverride?: typeof ScreenViewport;
}

/** @internal */
interface DrawingNavigationAidState {
  startOrigin: Point3d;
  origin: Point3d;
  extents: Vector3d;
  startRotation: Matrix3d;
  rotation: Matrix3d;

  startMapOrigin: Point3d;
  mapOrigin: Point3d;
  startMapExtents: Vector3d;
  mapExtents: Vector3d;

  mouseStart: Point2d;
  panningDirection: Vector3d;
  startDrawingZoom: number;
  drawingZoom: number;

  mode: MapMode;
  animation: number;

  isMoving: boolean;
  isPanning: boolean;

  viewId: string;
  view: ViewState | undefined;

  rotateMinimapWithView: boolean;
}

/**
 * A Drawing Navigation Aid.
 * @beta
 */
export class DrawingNavigationAid extends React.Component<DrawingNavigationAidProps, DrawingNavigationAidState> {
  private _rootElement: HTMLDivElement | null = null;
  private _viewContainerElement: HTMLDivElement | null = null;
  private _viewElement: HTMLDivElement | null = null;
  private _rootOffset: ClientRect = { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0 };
  private _viewport: Viewport | undefined;
  private _animationFrame: any;
  private _mounted: boolean = false;

  /** @internal */
  public override readonly state: Readonly<DrawingNavigationAidState>;

  constructor(props: DrawingNavigationAidProps) {
    super(props);
    const mode = props.initialMapMode || MapMode.Closed;
    const mapExtents = mode === MapMode.Closed ? this._getClosedMapSize() : this._getOpenedMapSize();
    const startMapExtents = mapExtents;

    this.state = {
      startOrigin: Point3d.createZero(),
      origin: Point3d.createZero(),
      extents: Vector3d.create(1, 1, 1),
      startRotation: Matrix3d.createIdentity(),
      rotation: Matrix3d.createIdentity(),

      startMapOrigin: Point3d.createZero(),
      mapOrigin: Point3d.createZero(),
      startMapExtents,
      mapExtents,

      mouseStart: Point2d.createZero(),
      panningDirection: Vector3d.createZero(),
      startDrawingZoom: 1.0,
      drawingZoom: 1.0,

      mode,
      animation: 1.0,

      viewId: props.initialView !== undefined ? props.initialView.id : "",
      view: props.initialView,

      isMoving: false,
      isPanning: false,
      rotateMinimapWithView: props.initialRotateMinimapWithView !== undefined ? props.initialRotateMinimapWithView : false,
    };
  }

  /** @internal */
  public override render(): React.ReactNode {
    const {
      startOrigin, origin, extents,
      startRotation, rotation,
      startMapOrigin, mapOrigin,
      startMapExtents, mapExtents,
      startDrawingZoom, drawingZoom,
      animation,
      viewId,
      mode, rotateMinimapWithView,
    } = this.state;

    const a = DrawingNavigationAid._animationFn(animation);
    const rot = Matrix3d.createFromQuaternion(Point4d.interpolateQuaternions(startRotation.toQuaternion(), a, rotation.toQuaternion()));
    const or = startOrigin.interpolate(a, origin);
    const map = startMapOrigin.interpolate(a, mapOrigin);
    const sz = startMapExtents.interpolate(a, mapExtents);
    const dz = Geometry.interpolate(startDrawingZoom, a, drawingZoom);

    const rootStyle: React.CSSProperties = {
      width: sz.x, height: sz.y,
      ...this.props.style,
    };
    const is3D = this._isViewport3D();

    const tOr = rotateMinimapWithView || is3D ? rotation.multiplyVector(Vector3d.createFrom(or)) : Vector3d.createFrom(or);
    const tMap = rotateMinimapWithView || is3D ? rotation.multiplyVector(Vector3d.createFrom(map)) : Vector3d.createFrom(map);

    const tPosX = (tOr.x - extents.x / 2 - tMap.x) * dz + sz.x / 2;
    const tPosY = (-tOr.y - extents.y / 2 + tMap.y) * dz + sz.y / 2;
    const viewWindowStyle = {
      transform: `translate(${tPosX}px, ${tPosY}px)`,
      height: extents.y * dz,
      width: extents.x * dz,
    };
    if (!rotateMinimapWithView && !is3D)
      viewWindowStyle.transform =
        "matrix3d(" +
        `${rot.at(0, 0)}, ${rot.at(1, 0)}, ${rot.at(2, 0)}, 0, ` +
        `${rot.at(0, 1)}, ${rot.at(1, 1)}, ${rot.at(2, 1)}, 0, ` +
        `${rot.at(0, 2)}, ${rot.at(1, 2)}, ${rot.at(2, 2)}, 0, ` +
        `${tPosX}, ${tPosY}, 0, 1)`;
    const isAnimating = animation !== 1 && !startMapExtents.isExactEqual(mapExtents);
    if (mode === MapMode.Opened || isAnimating) {
      rootStyle.position = "fixed";
      rootStyle.right = window.innerWidth - this._rootOffset.right;
      rootStyle.top = this._rootOffset.top;
    }

    const halfExtents = extents.scale(.5);
    const offset = rotateMinimapWithView || is3D ? Vector3d.createZero() : rotation.multiplyTransposeVector(halfExtents).minus(halfExtents);

    const unrotateLabel = UiComponents.translate("drawing.unrotate");
    const e = sz.scale(1 / dz);
    const halfMapExtents = e.scale(.5);
    const mapOffset = rotateMinimapWithView || is3D ? rotation.multiplyTransposeVector(halfMapExtents) : halfMapExtents;
    const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;
    const screenViewport = this.props.screenViewportOverride ? this.props.screenViewportOverride : /* istanbul ignore next */ ScreenViewport;
    const nodes = (
      <div className={classnames("components-drawing-navigation-aid", this.props.className)}
        data-testid="components-drawing-navigation-aid"
        ref={this._rootElementRef}
        onWheel={this._handleWheel}
        onMouseDown={this._handleDrawingMouseDown}
        style={rootStyle}
        role="presentation">
        <DrawingNavigationCanvas view={this.state.view} viewManagerOverride={viewManager} screenViewportOverride={screenViewport} viewId={viewId} origin={map.plus(offset).minus(mapOffset)} extents={e} zoom={dz} rotation={rotateMinimapWithView || is3D ? rotation : Matrix3d.createIdentity()} />
        <div className="drawing-container"
          data-testid="drawing-container"
          ref={this._viewContainerElementRef}>
          <div className="drawing-view-window"
            data-testid="drawing-view-window"
            onMouseDown={this._handleWindowMouseDown}
            onTouchStart={this._handleWindowTouchStart}
            style={viewWindowStyle}
            ref={this._viewElementRef}
            role="presentation" />
          {!is3D &&
            <div className={classnames("toggle-rotate-style", "icon", "icon-rotate-left", { checked: rotateMinimapWithView })} data-testid="toggle-rotate-style"
              style={mode === MapMode.Closed && !isAnimating ? { bottom: 2, left: 2 } : {}}
              title={UiComponents.translate("drawing.rotateStyle")}
              onClick={this._toggleRotationMode}
              role="presentation" />}
          {!rot.isIdentity &&
            <div className="unrotate-button" data-testid="drawing-unrotate-button" style={mode === MapMode.Closed && !isAnimating ? { top: 2 } : {}} onClick={this._handleUnrotate}
              role="button" tabIndex={-1}
            >
              {unrotateLabel}
            </div>
          }
          {mode === MapMode.Opened && !isAnimating && <>
            <div className="close" data-testid="drawing-close-button" onClick={this._closeLargeMap} role="button" tabIndex={-1}>
              <div className="close-icon icon icon-sort-up" />
            </div>
            <div className="zoom">
              <div className="zoom-button icon icon-add" data-testid="drawing-zoom-in-button" onClick={this._handleZoomIn} role="button" tabIndex={-1} />
              <div className="zoom-button icon icon-remove-2" data-testid="drawing-zoom-out-button" onClick={this._handleZoomOut} role="button" tabIndex={-1} />
            </div>
          </>}
        </div>
      </div>
    );
    if (mode === MapMode.Closed && (animation === 1.0 || startMapExtents.isExactEqual(mapExtents))) {
      return nodes;
    } else {
      let drawingPortal = document.querySelector("#components-drawing-portal");
      if (!drawingPortal) {
        drawingPortal = document.createElement("div");
        drawingPortal.id = "components-drawing-portal";
        document.body.appendChild(drawingPortal);
      }
      return ReactDOM.createPortal(nodes, drawingPortal);
    }
  }

  private _isViewport3D = () => {
    return this.state.view !== undefined && this.state.view.is3d();
  };

  private _rootElementRef = (el: HTMLDivElement | null) => {
    this._rootElement = el;
  };

  private _viewElementRef = (el: HTMLDivElement | null) => {
    this._viewElement = el;
  };

  private _viewContainerElementRef = (el: HTMLDivElement | null) => {
    this._viewContainerElement = el;
  };

  private _lastTime: number | undefined;

  private static _animationFn = (t: number) => t < .5 ? 2 * t ** 2 : -1 + (4 - 2 * t) * t;
  private _animation = () => {
    const t = Date.now();
    const delta = this._lastTime ? t - this._lastTime : 16;
    this._lastTime = t;
    if (this.state.animation !== 1) {
      const animation = Math.min(1, this.state.animation + delta / (1000 * (this.props.animationTime || 0.4)));
      this._updateFrustum();

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
    const hasViewportMoved = !this.state.origin.isAlmostEqual(this.state.startOrigin) ||
      !this.state.rotation.isAlmostEqual(this.state.startRotation);
    const startMapOrigin = Point3d.createFrom(this.state.mapOrigin);
    const startMapExtents = Vector3d.createFrom(this.state.mapExtents);
    const startDrawingZoom = this.state.drawingZoom;
    const startOrigin = this.state.origin;
    const startRotation = this.state.rotation;
    // istanbul ignore next
    if (this._mounted) {
      this.setState({ startMapOrigin, startDrawingZoom, startOrigin, startRotation, startMapExtents }, () => {
        // istanbul ignore else
        if (this.props.onAnimationEnd)
          this.props.onAnimationEnd();
        if (hasViewportMoved)
          this._updateFrustum(true);
      });
    }
  };

  private _lastPanTime: number | undefined;

  private _panAnimation = () => {
    const t = Date.now();
    if (this._lastPanTime === undefined)
      this._lastPanTime = t - 16.667;
    const delta = t - this._lastPanTime;
    this._lastPanTime = t;
    // istanbul ignore else
    if (!this.state.panningDirection.isAlmostZero && this.state.isMoving) {
      const { panningDirection } = this.state;
      const offset = panningDirection.scale(delta / 1000 / this.state.drawingZoom);
      const mapOrigin = this.state.mapOrigin.plus(offset);

      const origin = this.state.origin.plus(offset);
      this._updateFrustum();
      // istanbul ignore next
      if (this._mounted) {
        this.setState({ mapOrigin, origin, panningDirection }, () => {
          this._animationFrame = setTimeout(this._panAnimation, 16.667);
        });
      }
    } else {
      this._lastPanTime = undefined;
      this._updateFrustum(true);
    }
  };

  public override componentDidMount() {
    this._mounted = true;
    ViewportComponentEvents.onViewRotationChangeEvent.addListener(this._handleViewRotationChangeEvent);
    window.addEventListener("mousedown", this._handleMouseDown as any);
    window.addEventListener("mouseup", this._handleMouseDragEnd as any);
    window.addEventListener("mousemove", this._handleMouseDrag as any);
    window.addEventListener("keyup", this._handleKeyUp as any);
  }

  public override componentWillUnmount() {
    ViewportComponentEvents.onViewRotationChangeEvent.removeListener(this._handleViewRotationChangeEvent);
    window.removeEventListener("mousedown", this._handleMouseDown as any);
    window.removeEventListener("mouseup", this._handleMouseDragEnd as any);
    window.removeEventListener("mousemove", this._handleMouseDrag as any);
    window.removeEventListener("keyup", this._handleKeyUp as any);
    clearTimeout(this._animationFrame);
    if (this.props.onAnimationEnd)
      this.props.onAnimationEnd();

    const rt = document.getElementById("components-drawing-portal") as HTMLDivElement;
    if (rt && rt.parentElement !== null && rt.children.length === 0) {
      rt.parentElement.removeChild(rt);
    }
    this._mounted = false;
  }

  // Synchronize with rotation coming from the Viewport
  private _handleViewRotationChangeEvent = (args: ViewRotationChangeEventArgs) => {
    // istanbul ignore else
    if (!this.state.isMoving && !this.state.isPanning && this.props.viewport === args.viewport) {
      const extents = args.viewport.view.getExtents().clone();
      const rotation = args.viewport.view.getRotation().clone();
      const halfExtents = extents.scale(.5);
      const offset = this.state.rotateMinimapWithView || this._isViewport3D() ? rotation.multiplyTransposeVector(halfExtents) : halfExtents;
      const origin = args.viewport.view.getOrigin().plus(offset);
      const deltaZoom = (this.state.extents.x - extents.x) / this.state.extents.x;
      let drawingZoom = this.state.drawingZoom / (1 - deltaZoom);
      const deltaOrigin = origin.minus(this.state.origin);
      let mapOrigin = this.state.mapOrigin.plus(deltaOrigin);
      mapOrigin = mapOrigin.plus(Vector3d.createFrom(origin.minus(mapOrigin)).scale(deltaZoom));
      if (this.state.viewId !== args.viewport.view.id) {
        const rect = this.state.rotateMinimapWithView || this._isViewport3D() ? extents : DrawingNavigationAid.findRotatedWindowDimensions(extents, rotation);
        const maxRectDim = Math.max(rect.y, rect.x);
        const maxExtentDim = Math.max(this.state.mapExtents.x, this.state.mapExtents.y);
        drawingZoom = maxExtentDim / (3 * maxRectDim);
        mapOrigin = origin.clone();
        this._viewport = args.viewport;
        this.setState({ viewId: args.viewport.view.id, view: args.viewport.view.clone() });
      }
      // istanbul ignore next
      if (this._mounted) {
        this.setState({
          startOrigin: origin, origin, extents,
          startRotation: rotation, rotation,
          startMapOrigin: mapOrigin, mapOrigin,
          startDrawingZoom: drawingZoom, drawingZoom,
        });
      }
    }
  };

  private _updateFrustum = (complete: boolean = false) => {
    const halfExtents = this.state.extents.scale(.5);
    const offset = this.state.rotateMinimapWithView || this._isViewport3D() ? this.state.rotation.multiplyTransposeVector(halfExtents) : halfExtents;
    const origin = this.state.origin.minus(offset);
    ViewportComponentEvents.setDrawingViewportState(origin, this.state.rotation, complete);
  };

  private _toggleRotationMode = () => {
    const rotateMinimapWithView = !this.state.rotateMinimapWithView;
    this.setState({ rotateMinimapWithView }, () => {
      if (this._viewport)
        this._handleViewRotationChangeEvent({ viewport: this._viewport });
    });
  };

  private _handleKeyUp = (event: React.KeyboardEvent) => {
    // istanbul ignore else
    if (event.key === SpecialKey.Escape && this.state.mode === MapMode.Opened) {
      this._closeLargeMap();
    }
  };

  private _lastClientXY: Point2d = Point2d.createZero();
  private _processWindowDrag(movement: Point2d) {
    const vect = Vector3d.create(movement.x / this.state.drawingZoom, -movement.y / this.state.drawingZoom, 0);
    const offset = this.state.rotateMinimapWithView || this._isViewport3D() ? this.state.rotation.multiplyTransposeVector(vect) : vect;
    const origin = this.state.origin.plus(offset);
    const panningDirection = this._getPanVector();
    const wasAlmostZero = this.state.panningDirection.isAlmostZero;
    this.setState({ startOrigin: origin, origin, panningDirection, isPanning: false }, () => {
      this._updateFrustum();
      if (wasAlmostZero && !this.state.panningDirection.isAlmostZero) {
        this._animationFrame = setTimeout(this._panAnimation, 16.667);
      }
    });
  }
  private _processWindowEndDrag() {
    this.setState({ isMoving: false });
    this._updateFrustum(true);
    if (this.state.mode === MapMode.Closed) {
      setTimeout(() => {
        const startMapOrigin = this.state.mapOrigin;
        const mapOrigin = this.state.origin.clone();
        // istanbul ignore next
        if (this._mounted) {
          this.setState({ startMapOrigin, mapOrigin, animation: 0 }, () => {
            this._animationFrame = setTimeout(this._animation, 16.667);
          });
        }
      }, 0);
    }
  }

  private _handleMouseDown = (event: React.MouseEvent) => {
    // Used only to determine if mouse was moved between mousedown and mouseup
    const mouseStart = Point2d.create(event.clientX, event.clientY);
    this.setState({ mouseStart });
    this._lastClientXY = Point2d.create(event.clientX, event.clientY);
  };

  private _handleDrawingMouseDown = (event: React.MouseEvent) => {
    if (this.state.mode === MapMode.Opened) {
      event.preventDefault();
      this.setState({ isPanning: true });
    }
  };

  private _handleWindowMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    this.setState({ isMoving: true });
  };

  private _handleMouseDrag = (event: React.MouseEvent) => {
    const mouse = Point2d.create(event.clientX, event.clientY);
    const movement = mouse.minus(this._lastClientXY);
    if (this.state.isMoving) {
      // add scaled mouse movement
      this._processWindowDrag(movement);
    } else  {
      // istanbul ignore else
      if (this.state.isPanning && this.state.mode === MapMode.Opened) {
        const vect = Vector3d.create(movement.x / this.state.drawingZoom, -movement.y / this.state.drawingZoom, 0);
        const offset = this.state.rotateMinimapWithView || this._isViewport3D() ? this.state.rotation.multiplyTransposeVector(vect) : vect;
        const mapOrigin = this.state.mapOrigin.minus(offset);
        this.setState({ startMapOrigin: mapOrigin, mapOrigin });
      }
    }
    this._lastClientXY = mouse;
  };

  private _handleMouseDragEnd = (event: React.MouseEvent) => {
    const mouse = Point2d.create(event.clientX, event.clientY);
    if (mouse.isAlmostEqual(this.state.mouseStart) &&
      this.state.mode === MapMode.Closed &&
      (event.target === this._viewContainerElement || event.target === this._viewElement)) {
      this._openLargeMap();
    } else if (this.state.isMoving) {
      this._processWindowEndDrag();
    } else if (this.state.isPanning) {
      // istanbul ignore else
      if (this.state.mode === MapMode.Opened) {
        event.stopPropagation();
        this.setState({ isPanning: false });
      }
    } else if ((!(event.target instanceof Node) || this._rootElement && !this._rootElement.contains(event.target)) && mouse.isAlmostEqual(this.state.mouseStart)) {
      this._closeLargeMap();
    }
    this._lastClientXY = Point2d.create(event.clientX, event.clientY);
  };

  // istanbul ignore next - unable to test touch
  private _handleWindowTouchStart = (event: any) => {
    if (1 !== event.targetTouches.length)
      return;
    window.addEventListener("touchmove", this._onTouchMove, false);
    window.addEventListener("touchend", this._onTouchEnd, false);
    const mouseStart = Point2d.create(event.targetTouches[0].clientX, event.targetTouches[0].clientY);
    this.setState({ mouseStart });
    this._lastClientXY = mouseStart.clone();
    this.setState({ isMoving: true });
  };

  // istanbul ignore next - unable to test touch
  private _onTouchMove = (event: TouchEvent) => {
    if (1 !== event.targetTouches.length)
      return;
    const mouse = Point2d.create(event.targetTouches[0].clientX, event.targetTouches[0].clientY);
    const movement = mouse.minus(this._lastClientXY);
    // add scaled mouse movement
    this._processWindowDrag(movement);
    this._lastClientXY = mouse;
  };

  // istanbul ignore next - unable to test touch
  private _onTouchEnd = (event: TouchEvent) => {
    if (0 !== event.targetTouches.length)
      return;
    this._processWindowEndDrag();
    if (0 !== event.changedTouches.length)
      this._lastClientXY = Point2d.create(event.changedTouches[0].clientX, event.changedTouches[0].clientY); // Doesn't seem necessary...but _handleMouseDragEnd sets it...
    window.removeEventListener("touchmove", this._onTouchMove);
    window.removeEventListener("touchend", this._onTouchEnd);
  };

  /** @internal */
  public static getDefaultClosedMapSize = (): Vector3d => {
    return Vector3d.create(96, 96);
  };

  /** @internal */
  public static getDefaultOpenedMapSize = (paddingX: number = 0, paddingY: number = 0): Vector3d => {
    return Vector3d.create(window.innerWidth / 3 - 2 * (window.innerWidth - paddingX), window.innerHeight / 3 - 2 * paddingY);
  };

  private _getClosedMapSize = (): Vector3d => {
    if (this.props.closeSize === undefined)
      return DrawingNavigationAid.getDefaultClosedMapSize();
    return this.props.closeSize;
  };
  private _getOpenedMapSize = (): Vector3d => {
    if (this.props.openSize === undefined)
      return DrawingNavigationAid.getDefaultOpenedMapSize(this._rootOffset.right, this._rootOffset.top);
    return this.props.openSize;
  };

  private _openLargeMap = () => {
    // istanbul ignore else
    if (this.state.mode === MapMode.Closed && this.state.animation === 1.0) {
      // istanbul ignore else
      if (this._rootElement) {
        const rect = this._rootElement.getBoundingClientRect();
        this._rootOffset = rect;
      }
      const startMapExtents = Vector3d.createFrom(this.state.mapExtents);
      const mapExtents = this._getOpenedMapSize();
      this.setState({
        mode: MapMode.Opened,
        isMoving: false, isPanning: false,
        mapExtents, startMapExtents,
        animation: 0,
      }, () => {
        this._animationFrame = setTimeout(this._animation);
      });
    }
  };

  private _closeLargeMap = () => {
    // istanbul ignore else
    if (this.state.mode === MapMode.Opened && this.state.animation === 1.0) {
      const startMapOrigin = this.state.mapOrigin;
      const mapOrigin = this.state.origin.clone();
      const startMapExtents = Vector3d.createFrom(this.state.mapExtents);
      const mapExtents = this._getClosedMapSize();
      const rect = this.state.rotateMinimapWithView || this._isViewport3D() ? this.state.extents : DrawingNavigationAid.findRotatedWindowDimensions(this.state.extents, this.state.rotation);
      const maxRectDim = Math.max(rect.y, rect.x);
      const maxExtentDim = Math.max(mapExtents.x, mapExtents.y);
      const drawingZoom = maxExtentDim / (3 * maxRectDim);
      const startDrawingZoom = this.state.drawingZoom;
      this.setState({
        mode: MapMode.Closed,
        startMapOrigin, mapOrigin,
        startDrawingZoom, drawingZoom,
        isMoving: false, isPanning: false,
        startMapExtents, mapExtents,
        panningDirection: Vector3d.createZero(),
        animation: 0,
      }, () => {
        this._animationFrame = setTimeout(this._animation, 16.667);
      });
    }
  };

  private _getPanVector = () => {
    const is3D = this._isViewport3D();
    const rect = this.state.rotateMinimapWithView || is3D ? this.state.extents : DrawingNavigationAid.findRotatedWindowDimensions(this.state.extents, this.state.rotation);

    const mapExtents = this.state.mapExtents.scale(1 / this.state.drawingZoom);

    const maxMagnitude = 80; // maximum acceleration
    const magnitudeTravel = 30; // How far, in pixels, that magnitude increases from 0 to max acceleration

    const diff = Vector3d.createFrom(this.state.origin.minus(this.state.mapOrigin));
    const diffVector = this.state.rotateMinimapWithView || is3D ? this.state.rotation.multiplyVector(diff) : diff;

    // capture any values
    const magnitudeVector = Vector3d.create(
      Math.max(0, Math.abs(diffVector.x) - (mapExtents.x - rect.x) / 2),
      Math.max(0, Math.abs(diffVector.y) - (mapExtents.y - rect.y) / 2),
    );
    if (magnitudeVector.isAlmostZero)
      return Vector3d.createZero();
    const magnitude = Math.min(magnitudeVector.magnitude() * this.state.drawingZoom, magnitudeTravel) / magnitudeTravel * maxMagnitude;

    const vect = Vector3d.createFrom(this.state.origin.minus(this.state.mapOrigin)); // vect will never be zero or magnitude would also be zero
    const norm = vect.normalize();
    return norm!.scale(magnitude); // norm is only undefined when vect is zero, in which it would have returned at magnitudeVector.isAlmostZero
  };

  private _handleWheel = (event: React.WheelEvent) => {
    // istanbul ignore else
    if (this.state.mode === MapMode.Opened && this.state.animation === 1) {
      const { mapOrigin, drawingZoom } = this.state;
      const mapSize = this._getOpenedMapSize();

      const mouseX = event.clientX - this._rootOffset.right + mapSize.x / 2;
      const mouseY = event.clientY - this._rootOffset.top - mapSize.y / 2;
      const is3D = this._isViewport3D();
      if (event.deltaY < 0) {
        const zoom = drawingZoom * 1.1;
        const vect = Vector3d.create(mouseX * 0.1 / zoom, -mouseY * 0.1 / zoom, 0);
        const offset = this.state.rotateMinimapWithView || is3D ? this.state.rotation.multiplyTransposeVector(vect) : vect;
        const m = mapOrigin.plus(offset);
        this.setState({ mapOrigin: m, drawingZoom: zoom });
      }
      if (event.deltaY > 0) {
        const zoom = drawingZoom / 1.1;
        const vect = Vector3d.create(mouseX * 0.1 / drawingZoom, -mouseY * 0.1 / drawingZoom, 0);
        const offset = this.state.rotateMinimapWithView || is3D ? this.state.rotation.multiplyTransposeVector(vect) : vect;
        const m = mapOrigin.minus(offset);
        this.setState({ mapOrigin: m, drawingZoom: zoom });
      }
    }
  };

  private _handleZoomIn = () => {
    const zoom = this.state.drawingZoom * 1.4;
    this.setState({ drawingZoom: zoom });
  };

  private _handleZoomOut = () => {
    const zoom = this.state.drawingZoom / 1.4;
    this.setState({ drawingZoom: zoom });
  };

  private _handleUnrotate = () => {
    const startRotation = this.state.rotation;
    const halfExtents = this.state.extents.scale(.5);
    const offset = this.state.rotateMinimapWithView || this._isViewport3D() ? Vector3d.createZero() : this.state.rotation.multiplyTransposeVector(halfExtents).minus(halfExtents);
    const startOrigin = this.state.origin;
    const origin = this.state.origin.plus(offset);
    const startMapOrigin = this.state.mapOrigin;
    const mapOrigin = this.state.mapOrigin.plus(offset);
    this.setState({ animation: 0, startOrigin, origin, startMapOrigin, mapOrigin, startRotation, rotation: Matrix3d.createIdentity() }, () => {
      this._animationFrame = setTimeout(this._animation, 16.667);
    });
  };

  /** @internal */
  public static findRotatedWindowDimensions = (extents: Vector3d, rotation: Matrix3d) => {
    const cos = rotation.at(0, 0);
    const sin = rotation.at(1, 0);
    // extents.x/y should be divided in half, but we don't have to do that immediately.
    const cosWidth = cos * extents.x;
    const sinHeight = sin * extents.y;

    const sinWidth = cos * extents.x;
    const cosHeight = sin * extents.y;

    const a = Math.atan2(sin, cos);

    if (a % Math.PI >= 0 && a % Math.PI < Math.PI / 2) {
      const y1 = -cosHeight - sinWidth;
      const x2 = cosWidth + sinHeight;
      const y3 = cosHeight + sinWidth;
      const x4 = -cosWidth - sinHeight;
      // Instead, divide total difference
      return Vector3d.create(Math.abs(x2 - x4) / 2, Math.abs(y1 - y3) / 2);
    } else {
      const x1 = -cosWidth + sinHeight;
      const y2 = -cosHeight + sinWidth;
      const x3 = cosWidth - sinHeight;
      const y4 = cosHeight - sinWidth;
      return Vector3d.create(Math.abs(x1 - x3) / 2, Math.abs(y2 - y4) / 2);
    }
  };
}

/** @internal */
export interface DrawingNavigationCanvasProps {
  view: ViewState | undefined;
  viewId?: string;
  origin: Point3d;
  extents: Vector3d;
  zoom: number;
  rotation: Matrix3d;
  viewManagerOverride?: ViewManager;
  screenViewportOverride?: typeof ScreenViewport;
  canvasSizeOverride?: boolean;
}

/** @internal */
export class DrawingNavigationCanvas extends React.Component<DrawingNavigationCanvasProps> {
  private _canvasElement: HTMLDivElement | null = null;
  private _vp?: ScreenViewport;
  public override render(): React.ReactNode {
    return (
      <div className="drawing-canvas"
        data-testid="drawing-canvas"
        ref={this._canvasElementRef}>
      </div>
    );
  }
  public override componentDidMount() {
    if (this._canvasElement && this.props.view !== undefined) {
      const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;
      /* istanbul ignore next */
      const screenViewport = this.props.screenViewportOverride ? this.props.screenViewportOverride : /* istanbul ignore next */ ScreenViewport;
      const previousView = viewManager.selectedView;
      this._vp = screenViewport.create(this._canvasElement, this.props.view);
      this.customizeViewport(this._vp);
      viewManager.addViewport(this._vp);
      viewManager.setSelectedView(previousView); // switch to original viewport
      this._update();
    }
  }

  private customizeViewport(vp: ScreenViewport): void {
    /* istanbul ignore next */
    if (vp.logo.style)
      vp.logo.style.display = "none";
    vp.viewFlags.acsTriad = false;
  }

  private _update = () => {
    // istanbul ignore else
    if (this._vp) {
      const max = Math.max(this.props.extents.x, this.props.extents.y);
      this._vp.view.extentLimits = { max, min: Constant.oneMillimeter };
      this._vp.view.setOrigin(this.props.origin);
      this._vp.view.setRotation(this.props.rotation);
      this._vp.view.setExtents(this.props.extents);
      this._vp.applyViewState(this._vp.view);
    }
  };

  public override componentDidUpdate(oldProps: DrawingNavigationCanvasProps) {
    const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;
    if (this.props.view !== undefined) {
      if (oldProps.view !== this.props.view) {
        const screenViewport = this.props.screenViewportOverride ? this.props.screenViewportOverride : /* istanbul ignore next */ ScreenViewport;
        if (oldProps !== undefined && oldProps.viewId !== "" && oldProps.viewId !== this.props.viewId && this._vp) {
          viewManager.dropViewport(this._vp, true);
        }
        // istanbul ignore else
        if (this._canvasElement && (this.props.canvasSizeOverride || /* istanbul ignore next */ (this._canvasElement.clientWidth !== 0 && this._canvasElement.clientHeight !== 0))) {
          const previousView = viewManager.selectedView;
          this._vp = screenViewport.create(this._canvasElement, this.props.view.clone());
          this.customizeViewport(this._vp);
          viewManager.addViewport(this._vp);
          viewManager.setSelectedView(previousView); // switch to original viewport
          this._update();
        }
      } else if (!this.props.origin.isExactEqual(oldProps.origin) || !this.props.extents.isExactEqual(oldProps.extents) || this.props.zoom !== oldProps.zoom || !this.props.rotation.isExactEqual(oldProps.rotation)) {
        this._update();
      }
    }
  }

  public override componentWillUnmount() {
    if (this._vp) {
      const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;
      viewManager.dropViewport(this._vp, true);
    }
  }

  private _canvasElementRef = (el: HTMLDivElement | null) => {
    this._canvasElement = el;
  };

}
