/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Timeline
 */

import { Cartographic, ColorByName, ColorDef, SolarShadowSettings } from "@bentley/imodeljs-common";
import { DisplayStyle3dState, ScreenViewport, ViewState } from "@bentley/imodeljs-frontend";
import { BaseSolarDataProvider } from "@bentley/ui-components";

// the interface and class are in alpha state - it may change after usability testing - test coverage not complete
/* istanbul ignore file */

/** Default Solar Data Provider interface for getting and setting solar position from iModels view definitions.
 * @alpha
 */
export class SolarTimelineDataProvider extends BaseSolarDataProvider {
  protected _viewState: ViewState;

  protected get _displayStyle3d(): DisplayStyle3dState | undefined {
    return undefined !== this._viewport && this._viewport.view.is3d() ? this._viewport.view.displayStyle : undefined;
  }

  /** constructor that takes an optional viewport and optional position on globe that is used if the imodel is not "GeoLocated"  */
  constructor(viewState: ViewState, viewport?: ScreenViewport, longitude?: number, latitude?: number) {
    super(viewport, longitude, latitude);
    this._viewState = viewState;

    if (viewState.is3d()) {
      this.supportsTimelineAnimation = true;
      this._cartographicCenter = this.getCartographicCenter(viewState.iModel);
    } else {
      this._cartographicCenter = Cartographic.fromDegrees(this.longitude, this.latitude, 0.0);
    }

    this._projectTimeZoneOffset = this.getZone(this._cartographicCenter);
    this.initializeData(this._projectTimeZoneOffset);
    this.onTimeChanged(this.timeOfDay);
  }

  public override get shouldShowTimeline() {
    const style = this._displayStyle3d;
    return undefined !== style && style.viewFlags.shadows;
  }

  public override onTimeChanged = (time: Date) => {
    if (this._viewport && this._viewport.view.is3d()) {
      this._viewport.view.displayStyle.setSunTime(time.getTime());
    }
  };

  public override get shadowColor(): ColorDef {
    const style = this._displayStyle3d;
    return style ? style.settings.solarShadows.color.toColorDef() : ColorDef.create(ColorByName.gray);
  }

  public override set shadowColor(color: ColorDef) {
    const displayStyle = this._displayStyle3d;
    if (!displayStyle)
      return;

    const prevColor = displayStyle.settings.solarShadows.color;
    const newColor = color.colors;
    if (prevColor.r === newColor.r && prevColor.g === newColor.g && prevColor.b === newColor.b)
      return;

    const newSettings = displayStyle.settings.solarShadows.toJSON();
    if (!newSettings)
      return;

    newSettings.color = color.tbgr;
    displayStyle.settings.solarShadows = SolarShadowSettings.fromJSON(newSettings);
  }
}
