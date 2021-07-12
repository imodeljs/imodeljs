/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ContentView
 */

import { Id64String } from "@bentley/bentleyjs-core";
import {
  DrawingViewState, IModelApp, IModelConnection, OrthographicViewState, ScreenViewport, SheetViewState, SpatialViewState, ViewState,
} from "@bentley/imodeljs-frontend";
import { ConfigurableCreateInfo, ConfigurableUiControlType } from "../configurableui/ConfigurableUiControl";
import { CubeNavigationAidControl } from "../navigationaids/CubeNavigationAidControl";
import { DrawingNavigationAidControl } from "../navigationaids/DrawingNavigationAidControl";
import { SheetNavigationAidControl } from "../navigationaids/SheetNavigationAid";
import { ViewUtilities } from "../utils/ViewUtilities";
import { ContentControl, SupportsViewSelectorChange } from "./ContentControl";
import { ContentViewManager } from "./ContentViewManager";

/** The base class for Frontstage Viewport content controls.
 * @public
 */
export class ViewportContentControl extends ContentControl implements SupportsViewSelectorChange {
  private _viewport: ScreenViewport | undefined;
  private _isReady: Promise<void>;
  private _viewportReadyCallback?: () => void;

  /** Creates an instance of ViewportContentControl.
   * @param info         An object that the subclass must pass to this base class.
   * @param options      Options provided via the applicationData in a [[ContentProps]].
   */
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this._isReady = new Promise<void>((onSuccess: () => void, _onFailure: () => void): void => {
      this._viewportReadyCallback = onSuccess;
    });
  }

  /** Gets the type of ConfigurableUiControl, which is 'Viewport' in this case */
  public override getType(): ConfigurableUiControlType { return ConfigurableUiControlType.Viewport; }

  /** Returns true if this control is a Viewport control. */
  public override get isViewport(): boolean { return true; }

  /** The underlying ScreenViewport */
  public override get viewport(): ScreenViewport | undefined { return this._viewport; }
  public override set viewport(v: ScreenViewport | undefined) {
    this._viewport = v;
    this.setIsReady();
  }

  /** Returns a promise that resolves when the control is ready for usage.
   */
  public setIsReady(): void {
    // istanbul ignore else
    if (this._viewportReadyCallback) {
      this._viewportReadyCallback();
    }
  }

  /** Returns a promise that resolves when the control is ready for usage.
   */
  public override get isReady(): Promise<void> { return this._isReady; }

  /** Called when this ContentControl is activated */
  public override onActivated(): void {
    super.onActivated();
  }

  /** Get the NavigationAidControl associated with this ContentControl */
  public override get navigationAidControl(): string {
    let navigationAidId = "";

    // istanbul ignore else
    if (this.viewport) {
      navigationAidId = this._getNavigationAid(this.viewport.view.classFullName);
    }

    return navigationAidId;
  }

  /**
   * Fetches appropriate NavigationAid based on the class of the current viewport.
   * @param classFullName The full name of the current viewport class.
   * @returns The ID of the navigation aid to be displayed.
   */
  private _getNavigationAid = (classFullName: string) => {
    const className = ViewUtilities.getBisBaseClass(classFullName);
    let navigationAidId = "";

    switch (className) {
      case SheetViewState.className:
        navigationAidId = SheetNavigationAidControl.navigationAidId;
        break;
      case DrawingViewState.className:
        navigationAidId = DrawingNavigationAidControl.navigationAidId;
        break;
      case SpatialViewState.className:
      case OrthographicViewState.className:
        navigationAidId = CubeNavigationAidControl.navigationAidId;
        break;
    }

    return navigationAidId;
  };

  /** Returns true if this control supports processing ViewSelector changes. */
  public get supportsViewSelectorChange(): boolean { return true; }

  /** Process a ViewSelector change. */
  // istanbul ignore next
  public async processViewSelectorChange(iModel: IModelConnection, viewDefinitionId: Id64String, viewState: ViewState, name: string): Promise<void> {
    if (this.viewport) {
      if (IModelApp.viewManager && this.viewport === IModelApp.viewManager.selectedView)
        this.viewport.changeView(viewState);
    } else {
      this.reactNode = this.getReactElementForViewSelectorChange(iModel, viewDefinitionId, viewState, name);
    }
    ContentViewManager.refreshActiveContent(this.reactNode);
  }

  /** Get the React.Element for a ViewSelector change. */
  // istanbul ignore next
  public getReactElementForViewSelectorChange(_iModel: IModelConnection, _viewDefinitionId: Id64String, _viewState: ViewState, _name: string): React.ReactNode { return null; }
}
