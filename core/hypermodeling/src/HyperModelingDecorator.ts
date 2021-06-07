/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module HyperModeling
 */

import { Transform, XAndY } from "@bentley/geometry-core";
import { AbstractToolbarProps } from "@bentley/ui-abstract";
import {
  ChangeFlags, DecorateContext, Decorator, IModelApp, IModelConnection, ScreenViewport, SpatialViewState, TiledGraphicsProvider, ViewClipTool,
} from "@bentley/imodeljs-frontend";
import { SectionMarker, SectionMarkerSet } from "./SectionMarkers";
import { SectionDrawingLocationState } from "./SectionDrawingLocationState";
import { createSectionGraphicsProvider } from "./SectionGraphicsProvider";
import { PopupToolbarManager, PopupToolbarProvider } from "./PopupToolbar";
import { HyperModeling } from "./HyperModeling";
import { SectionMarkerConfig } from "./HyperModelingConfig";

async function createMarkers(vp: ScreenViewport): Promise<SectionMarkerSet | undefined> {
  if (!vp.view.isSpatialView())
    return undefined;

  const states = await SectionDrawingLocationState.queryAll(vp.iModel);
  if (0 === states.length)
    return undefined;

  const markers = states.map((state) => new SectionMarker(state));
  return new SectionMarkerSet(vp, markers);
}

class MarkerToolbarProvider implements PopupToolbarProvider {
  private readonly _viewport: ScreenViewport;
  public readonly marker: SectionMarker;
  public readonly toolbarProps: AbstractToolbarProps;
  public readonly onToolbarItemExecuted: (id: string) => void;

  public constructor(marker: SectionMarker, decorator: HyperModelingDecorator) {
    this.marker = marker;
    this._viewport = decorator.viewport;
    this.toolbarProps = HyperModeling.markerHandler.getToolbarProps(marker, decorator);
    this.onToolbarItemExecuted = (id) => HyperModeling.markerHandler.executeCommand(id, marker, decorator); // eslint-disable-line @typescript-eslint/promise-function-async
  }

  public get overToolbarHotspot() {
    return this.marker.isHilited;
  }

  public get toolbarLocation(): XAndY {
    return IModelApp.uiAdmin.createXAndY(this.marker.rect.right, this.marker.rect.top);
  }

  public get htmlElement() {
    return this._viewport.canvas;
  }
}

/** A [Decorator]($frontend) that displays a [[SectionMarker]] for each [SectionDrawingLocation]($backend) in the view.
 * Clicking on a marker toggles the section and the display of associated 2d graphics.
 * Hovering over a marker opens a mini toolbar with additional interactions.
 * @see [[SectionMarkerHandler]] to customize the marker interactions.
 * @see [[HyperModeling.startOrStop]] to enable or disable the decorator for a viewport.
 * @public
 */
export class HyperModelingDecorator implements Decorator {
  /** The set of [[SectionMarker]]s controlled by this decorator. */
  public readonly markers: SectionMarkerSet;
  private _config: SectionMarkerConfig;
  private readonly _removeEventListeners = new Array<() => void>();
  private readonly _iModel: IModelConnection;
  private _needSync = false;
  private _toolbarProvider?: MarkerToolbarProvider;
  private _tiledGraphicsProvider?: TiledGraphicsProvider;
  private _activeMarker?: SectionMarker;
  private _appliedSpatialView?: SpatialViewState;
  /** @internal */
  public syncImmediately = false;

  /** Create a new decorator and register it with the [ViewManager]($frontend). Typically invoked indirectly via [[HyperModeling.startOrStop]]. */
  public static async create(vp: ScreenViewport, config: SectionMarkerConfig): Promise<HyperModelingDecorator | undefined> {
    const markers = await createMarkers(vp);
    return undefined !== markers ? new HyperModelingDecorator(markers, config) : undefined;
  }

  /** Obtain the decorator associated with the specified viewport, if any. */
  public static getForViewport(vp: ScreenViewport): HyperModelingDecorator | undefined {
    for (const decorator of IModelApp.viewManager.decorators)
      if (decorator instanceof HyperModelingDecorator && decorator.viewport === vp)
        return decorator;

    return undefined;
  }

  /** The viewport into which this decorator draws its [[SectionMarker]]s. */
  public get viewport(): ScreenViewport {
    return this.markers.viewport;
  }

  /** The currently active marker. A marker typically becomes active when the user clicks on it.
   * @see [[setActiveMarker]] to change the active marker without user interaction.
   */
  public get activeMarker(): SectionMarker | undefined {
    return this._activeMarker;
  }

  /** @internal */
  public get config(): SectionMarkerConfig {
    return this._config;
  }

  /** Replaces the current marker display configuration, overwriting all previous settings. Passing `undefined` resets all settings to defaults.
   * @see [[updateConfiguration]] to override specific aspects of the configuration
   * @see [[HyperModeling.replaceConfiguration]] to replace the global configuration.
   */
  public replaceConfiguration(config?: SectionMarkerConfig): void {
    this._config = config ? { ...config } : {};
    this.requestSync();
  }

  /** Overrides specific aspects of the current marker display configuration.
   * Any field that is not `undefined` will be replaced in the current configuration; the rest will retain their current values.
   * @see [[replaceConfiguration]] to override all settings.
   * @see [[HyperModeling.updateConfiguration]] to update the global configuration.
   */
  public updateConfiguration(config: SectionMarkerConfig): void {
    this._config = {
      ignoreModelSelector: config.ignoreModelSelector ?? this._config.ignoreModelSelector,
      ignoreCategorySelector: config.ignoreCategorySelector ?? this._config.ignoreCategorySelector,
      hiddenSectionTypes: config.hiddenSectionTypes ?? this._config.hiddenSectionTypes,
    };

    this.requestSync();
  }

  /** Sets the currently active marker. This function is invoked when the user clicks on a marker, but may also be called manually to produce the same result.
   * Changing the active marker first deactivates the currently active marker, if any; then activates the specified marker, if supplied.
   * Returns false if marker activation fails.
   * @see [[activeMarker]] to obtain the currently active section marker.
   * @see [[SectionMarkerHandler.activateMarker]] to control what happens when a marker is activated.
   * @see [[SectionMarkerHandler.deactivateMarker]] to control what happens when a marker is deactivated.
   */
  public async setActiveMarker(marker: SectionMarker | undefined): Promise<boolean> {
    if (marker === this.activeMarker)
      return true;

    if (this.activeMarker) {
      this.activeMarker.setActive(false);
      await HyperModeling.markerHandler.deactivateMarker(this.activeMarker, this);
      this._activeMarker = undefined;
    }

    if (marker) {
      if (!await HyperModeling.markerHandler.activateMarker(marker, this)) {
        this.requestSync();
        return false;
      }

      marker.setActive(true);
      this._activeMarker = marker;
    }

    this.requestSync();
    return true;
  }

  /** @internal */
  public readonly useCachedDecorations = true;

  /** @internal */
  public decorate(context: DecorateContext): void {
    if (this.viewport.view.is3d())
      this.markers.addDecoration(context);
  }

  private constructor(markers: SectionMarkerSet, config: SectionMarkerConfig) {
    this.markers = markers;
    this._config = { ...config };
    this._iModel = this.viewport.iModel;

    this.viewport.onChangeView.addOnce(() => {
      this.requestSync();
    });

    this._removeEventListeners.push(this.viewport.onViewportChanged.addListener((_, changeFlags) => this.onViewportChanged(changeFlags)));
    this._removeEventListeners.push(this.viewport.onDisposed.addListener(() => this.dispose()));

    for (const marker of markers.markers) {
      marker.onMouseEnterEvent.addListener((mkr) => this.showToolbarAfterTimeout(mkr));
      marker.onMouseButtonEvent.addListener((mkr) => this.toggleMarker(mkr)); // eslint-disable-line @typescript-eslint/promise-function-async
    }

    this.updateMarkerVisibility();
    IModelApp.viewManager.addDecorator(this);
  }

  private onViewportChanged(changeFlags: ChangeFlags): void {
    if (this.viewport.iModel !== this._iModel) {
      this.dispose();
      return;
    }

    if (changeFlags.viewedCategories || changeFlags.viewedModels || changeFlags.viewedCategoriesPerModel)
      this.requestSync();

    if (changeFlags.viewState) {
      // If we're looking at a different view now, and we did not initiate that, turn off the active marker.
      if (this.viewport.view !== this._appliedSpatialView)
        this.setActiveMarker(undefined); // eslint-disable-line @typescript-eslint/no-floating-promises
      else
        this._appliedSpatialView = undefined;
    }
  }

  private async toggleMarker(marker: SectionMarker): Promise<void> {
    await this.setActiveMarker(marker === this.activeMarker ? undefined : marker);
  }

  private dropTiledGraphicsProvider(): void {
    if (undefined === this._tiledGraphicsProvider)
      return;

    this.viewport.dropTiledGraphicsProvider(this._tiledGraphicsProvider);
    this._tiledGraphicsProvider = undefined;
  }

  /** @internal */
  public dispose(): void {
    if (!IModelApp.viewManager.dropDecorator(this))
      return;

    for (const remove of this._removeEventListeners)
      remove();

    this.dropTiledGraphicsProvider();
  }

  private showToolbarAfterTimeout(marker: SectionMarker): void {
    if (this._toolbarProvider?.marker !== marker)
      this._toolbarProvider = new MarkerToolbarProvider(marker, this);

    PopupToolbarManager.showToolbarAfterTimeout(this._toolbarProvider);
  }

  /** Toggles whether the clip volume associated with the specified marker is applied to the view. */
  public toggleClipVolume(marker: SectionMarker, enable: boolean): void {
    ViewClipTool.enableClipVolume(this.viewport);
    ViewClipTool.setViewClip(this.viewport, enable ? marker.state.clip : undefined);
  }

  /** Toggles the specified section marker.
   * Enabling the section applies the frustum and clip volume of the marker's spatial view to the viewport, and displays the 2d section graphics and sheet annotations.
   * Disabling the section disables the clip volume and 2d graphics.
   * @see [[toggleClipVolume]] to toggle only the clip volume.
   * @see [[toggleAttachment]] to toggle only the attachment graphics.
   */
  public async toggleSection(marker: SectionMarker, enable: boolean): Promise<boolean> {
    if (enable) {
      if (this.viewport.view.is3d()) {
        // Preserve the view settings; apply only the frustum and clip volume
        const spatialView = await marker.state.tryLoadSpatialView();
        if (!spatialView)
          return false;

        const aligned = await this.alignToSpatialView(marker);
        if (!aligned)
          return false;

        this.toggleClipVolume(marker, true);
      } else if (!await this.applySpatialView(marker)) {
        return false;
      }
    } else {
      this.toggleClipVolume(marker, false);
    }

    this.requestSync();
    return this.toggleAttachment(marker, enable);
  }

  /** Toggles display of 2d section graphics and sheet annotations for the specified marker.
   * @see [[toggleSection]] to apply the spatial view and clip volume in addition to the attachment graphics.
   */
  public async toggleAttachment(marker: SectionMarker, enable: boolean): Promise<boolean> {
    this.dropTiledGraphicsProvider();
    if (enable) {
      this._tiledGraphicsProvider = await createSectionGraphicsProvider(marker.state);
      this.viewport.addTiledGraphicsProvider(this._tiledGraphicsProvider);
    }

    return true;
  }

  /** Aligns the viewport to face the specified marker's section plane. */
  public alignView(marker: SectionMarker): void {
    const placement = marker.state.placement.transform;
    const origin = placement.origin;
    const matrix = placement.matrix;

    const vp = this.viewport;
    const targetMatrix = matrix.multiplyMatrixMatrix(vp.rotation);
    const rotateTransform = Transform.createFixedPointAndMatrix(origin, targetMatrix);

    const startFrustum = vp.getFrustum();
    const newFrustum = startFrustum.clone();
    newFrustum.multiply(rotateTransform);

    if (startFrustum.equals(newFrustum))
      return;

    vp.view.setupFromFrustum(newFrustum);
    vp.synchWithView();
    vp.animateFrustumChange();
  }

  /** Opens the marker's drawing view in the decorator's viewport. Returns false if the drawing view could not be loaded. */
  public async openSection(marker: SectionMarker): Promise<boolean> {
    const viewState = await marker.state.tryLoadDrawingView();
    if (viewState)
      this.viewport.changeView(viewState);

    return undefined !== viewState;
  }

  /** Opens marker's sheet view in the decorator's viewport and zooms in on the associated [ViewAttachment]($backend). Returns false if no view
   * attachment exists or the sheet view could not be loaded.
   */
  public async openSheet(marker: SectionMarker): Promise<boolean> {
    if (undefined === marker.state.viewAttachment)
      return false;

    const viewState = await marker.state.tryLoadSheetView();
    if (!viewState)
      return false;

    this.viewport.changeView(viewState);
    await this.viewport.zoomToElements(marker.state.viewAttachment.id);
    return true;
  }

  /** Aligns the view to match the frustum of the spatial view associated with the specified marker.
   * @param marker The marker whose spatial view's frustum should be applied.
   * @returns false if the frustum could not be applied, e.g. because the spatial view could not be loaded or the viewport is viewing a 2d model.
   * @see [[alignView]] to align to the *section plane*, which may differ.
   * @see [[toggleSection]] to also apply the clip volume.
   */
  public async alignToSpatialView(marker: SectionMarker): Promise<boolean> {
    if (!this.viewport.view.is3d())
      return false;

    const spatialView = await marker.state.tryLoadSpatialView();
    if (!spatialView)
      return false;

    this.viewport.view.setOrigin(spatialView.getOrigin());
    this.viewport.view.setExtents(spatialView.getExtents());
    this.viewport.view.setRotation(spatialView.getRotation());
    this.viewport.synchWithView({ animateFrustumChange: true });

    return true;
  }

  /** Applies the marker's spatial view - including its clip volume - to the decorator's viewport.
   * Returns false if the spatial view could not be loaded.
   * @see [[toggleSection]].
   * @see [[toggleClipVolume]].
   */
  public async applySpatialView(marker: SectionMarker): Promise<boolean> {
    const viewState = await marker.state.tryLoadSpatialView();
    if (viewState) {
      this._appliedSpatialView = viewState;
      this.viewport.changeView(viewState);
    }

    return undefined !== viewState;
  }

  /** Request that the visibility of the section markers be recomputed. It is only necessary to call this if you have overridden [[SectionMarkerHandler.isMarkerVisible]]; if so, you should invoke
   * this method when the criteria governing your `isMarkerVisible` method have changed.
   */
  public requestSync(): void {
    if (this.syncImmediately) {
      this.sync();
    } else if (!this._needSync) {
      this._needSync = true;
      requestAnimationFrame(() => this.sync());
    }
  }

  private sync(): void {
    this._needSync = false;
    if (this.viewport.view.is3d() && this.updateMarkerVisibility()) {
      this.markers.markDirty();
      this.viewport.invalidateCachedDecorations(this);
    }
  }

  private isMarkerVisible(marker: SectionMarker): boolean {
    if (undefined !== this.activeMarker)
      return marker === this.activeMarker;

    return HyperModeling.markerHandler.isMarkerVisible(marker, this, this._config);
  }

  private updateMarkerVisibility(): boolean {
    let changed = false;
    for (const marker of this.markers.markers) {
      const wasVisible = marker.visible;
      marker.visible = this.isMarkerVisible(marker);
      changed = changed || (marker.visible !== wasVisible);
    }

    return changed;
  }
}
