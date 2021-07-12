/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Viewport
 */

import * as React from "react";
import { Id64String, Logger } from "@bentley/bentleyjs-core";
import { Point3d, Transform } from "@bentley/geometry-core";
import { NpcCenter } from "@bentley/imodeljs-common";
import {
  IModelApp, IModelConnection, ScreenViewport,
  TentativePoint, ToolSettings, ViewManager,
  Viewport, ViewState,
} from "@bentley/imodeljs-frontend";

import { CommonProps } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";
import {
  CubeRotationChangeEventArgs, DrawingViewportChangeEventArgs, StandardRotationChangeEventArgs, ViewportComponentEvents,
} from "./ViewportComponentEvents";

/** Type for a ViewState prop
 * @public
 */
export type ViewStateProp = ViewState | (() => ViewState);

/**
 * Properties for [[ViewportComponent]] component.
 * @public
 */
export interface ViewportProps extends CommonProps {
  /** IModel to display */
  imodel: IModelConnection;
  /** Id of a default view definition to load as a starting point */
  viewDefinitionId?: Id64String;
  /** ViewState to use as a starting point */
  viewState?: ViewStateProp;
  /** Function to get a reference to the ScreenViewport */
  viewportRef?: (v: ScreenViewport) => void;

  /** @internal */
  onContextMenu?: (e: React.MouseEvent) => boolean;
  /** @internal */
  getViewOverlay?: (viewport: ScreenViewport) => React.ReactNode;
  /** @internal used only for testing */
  viewManagerOverride?: ViewManager;
  /** @internal used only for testing */
  screenViewportOverride?: typeof ScreenViewport;
  /** @internal used only for testing */
  tentativePointOverride?: TentativePoint;
}

/** @internal */
interface ViewportState {
  viewId: string;
}

/**
 * A viewport React component that creates a ScreenViewport.
 * @public
 */
export class ViewportComponent extends React.Component<ViewportProps, ViewportState> {

  private _viewportDiv: React.RefObject<HTMLDivElement>;
  private _vp?: ScreenViewport;
  private _viewClassFullName: string = "";
  private _lastTargetPoint?: Point3d;
  private _mounted: boolean = false;

  public constructor(props: ViewportProps) {
    super(props);
    this._viewportDiv = React.createRef<HTMLDivElement>();
    this.state = {
      viewId: "",
    };
  }

  private _handleDisconnectFromViewManager = () => {
    const screenViewport = this._vp;
    const parentDiv = this._viewportDiv.current;

    if (screenViewport) {
      const viewManager = IModelApp.viewManager;
      viewManager.dropViewport(screenViewport, true);
      screenViewport.onViewChanged.removeListener(this._handleViewChanged);
      this._vp = undefined;
    }
    // istanbul ignore else
    if (parentDiv) {
      const parentWindow = parentDiv.ownerDocument.defaultView as Window;
      parentWindow.removeEventListener("beforeunload", this._handleDisconnectFromViewManager, false);
    }
  };

  public override async componentDidMount() {
    this._mounted = true;

    // istanbul ignore next
    if (!this._viewportDiv.current) {
      Logger.logError(UiComponents.loggerCategory(this), `Parent <div> failed to load`);
      return;
    }

    const viewState = await this.getViewState();
    if (viewState === undefined) {
      Logger.logError(UiComponents.loggerCategory(this), `Failed to obtain ViewState`);
      return;
    }

    /* istanbul ignore next */
    if (!this._mounted)
      return;

    const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;
    const screenViewportFactory = this.props.screenViewportOverride ? this.props.screenViewportOverride : /* istanbul ignore next */ ScreenViewport;
    const parentDiv = this._viewportDiv.current;
    const screenViewport = screenViewportFactory.create(parentDiv, viewState);
    this._vp = screenViewport;
    viewManager.addViewport(this._vp);

    const parentWindow = parentDiv.ownerDocument.defaultView as Window;
    parentWindow.addEventListener("beforeunload", this._handleDisconnectFromViewManager, false);

    ViewportComponentEvents.initialize();
    ViewportComponentEvents.onDrawingViewportChangeEvent.addListener(this._handleDrawingViewportChangeEvent);
    ViewportComponentEvents.onCubeRotationChangeEvent.addListener(this._handleCubeRotationChangeEvent);
    ViewportComponentEvents.onStandardRotationChangeEvent.addListener(this._handleStandardRotationChangeEvent);

    this._vp.onViewChanged.addListener(this._handleViewChanged);
    this._viewClassFullName = this._vp.view.classFullName;
    this.setState({ viewId: this._vp.view.id });

    /* istanbul ignore else */
    if (this.props.viewportRef)
      this.props.viewportRef(this._vp);
  }

  public override componentWillUnmount() {
    this._mounted = false;
    this._handleDisconnectFromViewManager();
    ViewportComponentEvents.onDrawingViewportChangeEvent.removeListener(this._handleDrawingViewportChangeEvent);
    ViewportComponentEvents.onCubeRotationChangeEvent.removeListener(this._handleCubeRotationChangeEvent);
    ViewportComponentEvents.onStandardRotationChangeEvent.removeListener(this._handleStandardRotationChangeEvent);
  }

  public override async componentDidUpdate(prevProps: ViewportProps) {
    if (this.props.imodel === prevProps.imodel &&
      this.props.viewState === prevProps.viewState &&
      this.props.viewDefinitionId === prevProps.viewDefinitionId)
      return;

    /* istanbul ignore else */
    if (this._vp) {
      const viewState = await this.getViewState();
      if (viewState === undefined) {
        Logger.logError(UiComponents.loggerCategory(this), `Failed to obtain ViewState`);
        return;
      }

      this._vp.changeView(viewState);

      /* istanbul ignore else */
      if (this._mounted)
        this.setState({ viewId: this._vp.view.id });
    }
  }

  private async getViewState(): Promise<ViewState | undefined> {
    let viewState: ViewState;

    if (this.props.viewState) {
      if (typeof this.props.viewState === "function")
        viewState = this.props.viewState();
      else
        viewState = this.props.viewState;
    } else if (this.props.viewDefinitionId) {
      viewState = await this.props.imodel.views.load(this.props.viewDefinitionId);
      if (!viewState) {
        Logger.logError(UiComponents.loggerCategory(this), `View state failed to load`);
        return undefined;
      } else {
        return viewState;
      }
    } else {
      Logger.logError(UiComponents.loggerCategory(this), `Either viewDefinitionId or viewState must be provided as a ViewportComponent Prop`);
      return undefined;
    }

    return viewState.clone();
  }

  private _handleDrawingViewportChangeEvent = (args: DrawingViewportChangeEventArgs) => {
    const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;

    /* istanbul ignore else */
    if (this._vp && viewManager.selectedView === this._vp) {
      this._vp.view.setOrigin(args.origin);
      this._vp.view.setRotation(args.rotation);
      this._vp.synchWithView({ noSaveInUndo: args.complete !== true });
    }
  };

  private _getRotatePoint(vp: ScreenViewport): Point3d {
    const tentativePoint = this.props.tentativePointOverride ? this.props.tentativePointOverride : /* istanbul ignore next */ IModelApp.tentativePoint;
    if (tentativePoint.isActive)
      return tentativePoint.getPoint();

    /* istanbul ignore else */
    if (undefined !== vp.viewCmdTargetCenter) {
      const testPt = vp.worldToView(vp.viewCmdTargetCenter);
      const viewRect = vp.viewRect;
      if (viewRect.containsPoint(testPt))
        return vp.viewCmdTargetCenter;
      vp.viewCmdTargetCenter = undefined;
    }

    if (undefined !== this._lastTargetPoint) {
      const testPt = vp.worldToView(this._lastTargetPoint);
      const viewRect = vp.viewRect.clone();
      viewRect.scaleAboutCenter(0.25, 0.25);
      // istanbul ignore next hard to reach because of mocks
      if (viewRect.containsPoint(testPt))
        return this._lastTargetPoint;
      this._lastTargetPoint = undefined;
    }

    const visiblePoint = vp.pickNearestVisibleGeometry(vp.npcToWorld(NpcCenter), vp.pixelsFromInches(ToolSettings.viewToolPickRadiusInches));
    this._lastTargetPoint = (undefined !== visiblePoint ? visiblePoint : vp.view.getTargetPoint());
    return this._lastTargetPoint;
  }

  private _handleCubeRotationChangeEvent = (args: CubeRotationChangeEventArgs) => {
    const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;

    /* istanbul ignore else */
    if (this._vp && viewManager.selectedView === this._vp) {
      const rotMatrix = args.rotMatrix;

      /* istanbul ignore else */
      if (this._vp.rotation !== rotMatrix) {
        const inverse = rotMatrix.transpose(); // rotation is from current nav cube state...
        const center = this._getRotatePoint(this._vp);
        const targetMatrix = inverse.multiplyMatrixMatrix(this._vp.view.getRotation());
        const worldTransform = Transform.createFixedPointAndMatrix(center, targetMatrix);
        const frustum = this._vp.getWorldFrustum();
        frustum.multiply(worldTransform);
        this._vp.view.setupFromFrustum(frustum);
        this._vp.synchWithView({ noSaveInUndo: !args.complete });
      }
    }
  };

  private _handleStandardRotationChangeEvent = (args: StandardRotationChangeEventArgs) => {
    const viewManager = this.props.viewManagerOverride ? this.props.viewManagerOverride : /* istanbul ignore next */ IModelApp.viewManager;

    /* istanbul ignore else */
    if (this._vp && viewManager.selectedView === this._vp) {
      // this._vp.view.setStandardRotation(args.standardRotation);
      this._vp.view.setRotationAboutPoint(ViewState.getStandardViewMatrix(args.standardRotation));
      this._vp.synchWithView();
    }
  };

  private _handleViewChanged = (vp: Viewport) => {
    ViewportComponentEvents.setViewMatrix(vp);

    /* istanbul ignore else */
    if (this._viewClassFullName !== vp.view.classFullName) {
      setTimeout(() => {
        ViewportComponentEvents.onViewClassFullNameChangedEvent.emit({ viewport: vp, oldName: this._viewClassFullName, newName: vp.view.classFullName });
        this._viewClassFullName = vp.view.classFullName;
      });
    }

    /* istanbul ignore else */
    if (this.state.viewId !== vp.view.id) {
      setTimeout(() => {
        ViewportComponentEvents.onViewIdChangedEvent.emit({ viewport: vp, oldId: this.state.viewId, newId: vp.view.id });

        /* istanbul ignore next - flaky mounted condition in the setTimeout */
        if (this._mounted)
          this.setState({ viewId: vp.view.id });
      });
    }
  };

  private _handleContextMenu = (e: React.MouseEvent): boolean => {
    e.preventDefault();
    if (this.props.onContextMenu)
      this.props.onContextMenu(e);
    return false;
  };

  public override render() {
    const viewOverlay = this._vp && this.props.getViewOverlay ? this.props.getViewOverlay(this._vp) : null;

    const parentDivStyle: React.CSSProperties = {
      height: "100%", width: "100%", position: "relative",
    };

    const viewportDivStyle: React.CSSProperties = {
      height: "100%", width: "100%",
      ...this.props.style,
    };

    return (
      <div style={parentDivStyle}>
        <div
          ref={this._viewportDiv}
          data-testid="viewport-component"
          className={this.props.className}
          style={viewportDivStyle}
          onContextMenu={this._handleContextMenu}
        />
        {viewOverlay}
      </div>
    );
  }
}
