/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ContentView
 */

import * as React from "react";
import { Id64String } from "@bentley/bentleyjs-core";
import { IModelConnection, ScreenViewport, ViewState } from "@bentley/imodeljs-frontend";
import { viewWithUnifiedSelection } from "@bentley/presentation-components";
import { ViewportComponent, ViewStateProp } from "@bentley/ui-components";
import { FillCentered } from "@bentley/ui-core";

import { FrontstageManager } from "../../ui-framework";
import { ConfigurableCreateInfo } from "../configurableui/ConfigurableUiControl";
import { ConfigurableUiManager } from "../configurableui/ConfigurableUiManager";
import { connectIModelConnectionAndViewState } from "../redux/connectIModel";
import { UiFramework } from "../UiFramework";
import { DefaultViewOverlay } from "./DefaultViewOverlay";
import { ViewportContentControl } from "./ViewportContentControl";
import { StandardRotationNavigationAidControl } from "../navigationaids/StandardRotationNavigationAid";
import { UiError } from "@bentley/ui-abstract";

// create a HOC viewport component that supports unified selection
// eslint-disable-next-line @typescript-eslint/naming-convention
const UnifiedSelectionViewport = viewWithUnifiedSelection(ViewportComponent);

/** Viewport that is connected to the IModelConnection property in the Redux store. The application must set up the Redux store and include the FrameworkReducer.
 * @beta
 */
export const IModelConnectedViewport = connectIModelConnectionAndViewState(null, null)(UnifiedSelectionViewport); // eslint-disable-line @typescript-eslint/naming-convention

/** [[IModelViewportControl]] options. These options are set in the applicationData property of the [[ContentProps]].
 * @beta
 */
export interface IModelViewportControlOptions {
  /** ViewState or a function to return a ViewState */
  viewState?: ViewStateProp;
  /** IModelConnection of data in Viewport */
  iModelConnection?: IModelConnection | (() => IModelConnection);
  /** Optional property to disable the use of the DefaultViewOverlay */
  disableDefaultViewOverlay?: boolean;
  /** Optional background color which may be used if viewState and iModelConnection are undefined */
  bgColor?: string;
  /** Optional property to always use the supplied `viewState` property instead of using viewport.view when set */
  alwaysUseSuppliedViewState?: boolean;
  /** Optional property to supply custom view overlay. Uses when caller want to supply custom overlay component. */
  supplyViewOverlay?: (_viewport: ScreenViewport) => React.ReactNode;
  /** Optional property to defer reactNode initialization until first reactNode property in needed. Useful when subclassing the `IModelViewportControl`. */
  deferNodeInitialization?: boolean;
}

/** iModel Viewport Control
 * @beta
 */
// istanbul ignore next
export class IModelViewportControl extends ViewportContentControl {
  public static get id() {
    return "UiFramework.IModelViewportControl";
  }
  protected _disableDefaultViewOverlay: boolean;
  protected _viewState: ViewStateProp | undefined;
  protected _iModelConnection: IModelConnection | undefined;
  protected _alwaysUseSuppliedViewState: boolean;
  private _userSuppliedViewOverlay?: (_viewport: ScreenViewport) => React.ReactNode;

  constructor(info: ConfigurableCreateInfo, protected _options: IModelViewportControlOptions) {
    super(info, _options);

    this._disableDefaultViewOverlay = _options.disableDefaultViewOverlay ?? false;
    this._alwaysUseSuppliedViewState = _options.alwaysUseSuppliedViewState ?? false;
    this._userSuppliedViewOverlay = _options.supplyViewOverlay;

    if (!_options.deferNodeInitialization)
      this.initializeReactNode();
  }

  protected initializeReactNode() {
    const options = this._options;

    if (options.viewState)
      this._viewState = options.viewState;

    const iModelConnection = (typeof options.iModelConnection === "function") ? options.iModelConnection() : options.iModelConnection;

    if (this._viewState && iModelConnection) {
      /** Passing _determineViewState as a function reference; it is not called here. */
      this._reactNode = this.getImodelViewportReactElement(iModelConnection, this._determineViewState);
    } else {
      if (UiFramework.getIModelConnection() && UiFramework.getDefaultViewState()) {
        this._reactNode = this.getImodelConnectedViewportReactElement();
      } else {
        this._reactNode = this.getNoContentReactElement(options);
        this.setIsReady();
      }
    }
  }

  protected override getReactNode(): React.ReactNode {
    if (!React.isValidElement(this._reactNode) && this._options.deferNodeInitialization)
      this.initializeReactNode();

    return this.getKeyedReactNode();
  }

  /**
   * This is passed as a function to the ViewportComponent as the `viewState` prop in getImodelViewportReactElement().
   * It is called by ViewportComponent on a mount to resolve the viewState.
   */
  private _determineViewState = (): ViewState => {
    let viewState: ViewState;

    if (this.viewport && !this._alwaysUseSuppliedViewState)
      viewState = this.viewport.view;
    else if (this._viewState) {
      if (typeof this._viewState === "function")
        viewState = this._viewState();
      else
        viewState = this._viewState;
    } else
      throw new UiError(UiFramework.loggerCategory(this), "No ViewState could be determined");

    return viewState!;
  };

  /** Get the React component that will contain the Viewport */
  protected getImodelConnectedViewportReactElement(): React.ReactNode {
    return <IModelConnectedViewport
      viewportRef={(v: ScreenViewport) => {
        this.viewport = v;
        // for convenience, if window defined bind viewport to window
        if (undefined !== window)
          (window as any).viewport = v;
        if (!FrontstageManager.isLoading)
          FrontstageManager.activeFrontstageDef?.setActiveViewFromViewport(v);
      }}
      getViewOverlay={this._getViewOverlay}
    />;
  }

  /** Get the React component that will contain the Viewport */
  protected getImodelViewportReactElement(iModelConnection: IModelConnection, viewState: ViewStateProp): React.ReactNode {
    return <UnifiedSelectionViewport
      viewState={viewState}
      imodel={iModelConnection}
      viewportRef={(v: ScreenViewport) => {
        this.viewport = v;
        // for convenience, if window defined bind viewport to window
        if (undefined !== window)
          (window as any).viewport = v;
        if (!FrontstageManager.isLoading)
          FrontstageManager.activeFrontstageDef?.setActiveViewFromViewport(v);
      }}
      getViewOverlay={this._getViewOverlay}
    />;
  }

  /** Get the React component that will be shown when no iModel data is available */
  protected getNoContentReactElement(_options: IModelViewportControlOptions): React.ReactNode {
    const noContent = UiFramework.translate("general.no-content");
    return <FillCentered> {noContent} </FillCentered>;
  }

  /** Get the React.Element for a ViewSelector change. */
  public override getReactElementForViewSelectorChange(iModelConnection: IModelConnection, _unusedViewDefinitionId: Id64String, viewState: ViewState, _name: string): React.ReactNode {
    return this.getImodelViewportReactElement(iModelConnection, viewState);
  }

  /** Get the default ViewOverlay unless parameter is set to not use it. May be override in an application specific sub-class  */
  protected _getViewOverlay = (viewport: ScreenViewport): React.ReactNode => {
    if (this._userSuppliedViewOverlay)
      return this._userSuppliedViewOverlay(viewport);

    if (this._disableDefaultViewOverlay)
      return null;

    return <DefaultViewOverlay viewport={viewport} />;
  };

  /** Get the NavigationAidControl associated with this ContentControl */
  public override get navigationAidControl(): string {
    if (this.viewport)
      return super.navigationAidControl;
    else
      return StandardRotationNavigationAidControl.navigationAidId;
  }
}

ConfigurableUiManager.registerControl(IModelViewportControl.id, IModelViewportControl);
