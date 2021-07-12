/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import ReactDOM from "react-dom";
import { HitDetail, ViewManager } from "@bentley/imodeljs-frontend";
import { FavoritePropertiesRenderer, PropertyValueRendererManager } from "@bentley/ui-components";
import { FavoritePropertiesDataProvider } from "@bentley/presentation-components";
import { Leading } from "@itwin/itwinui-react";
import { appendContent } from "./appendContent";

/** Subclass of ViewManager that adds Favorite properties to the tooltip
 */
export class AppViewManager extends ViewManager {

  private _favoritePropertiesDataProvider: FavoritePropertiesDataProvider;
  private _favoritePropertiesRenderer: FavoritePropertiesRenderer;

  public constructor(public displayOldTooltipWhenNoFavorites: boolean) {
    super();

    this._favoritePropertiesDataProvider = new FavoritePropertiesDataProvider();
    this._favoritePropertiesRenderer = new FavoritePropertiesRenderer();
  }

  /** Get the tooltip for a persistent element.
   * Calls the backend method [Element.getToolTipMessage]($backend), and replaces all instances of `${localizeTag}` with localized string from IModelApp.i18n.
   */
  public override async getElementToolTip(hit: HitDetail): Promise<HTMLElement | string> {
    const tooltipContainer = document.createElement("div");
    const propertyData = await this._favoritePropertiesDataProvider.getData(hit.iModel, hit.sourceId);
    const hasFavorites = this._favoritePropertiesRenderer.hasFavorites(propertyData);

    const propertyValueRendererManager = PropertyValueRendererManager.defaultManager;
    const titleValue = propertyValueRendererManager.render(propertyData.label);

    const titleDiv = document.createElement("div");
    ReactDOM.render(React.createElement(Leading, null, titleValue), titleDiv);
    appendContent(tooltipContainer, titleDiv);

    const gapDiv = document.createElement("div");
    gapDiv.className = "uifw-card-gap";
    appendContent(tooltipContainer, gapDiv);

    if (hasFavorites) {
      const favorites = this._favoritePropertiesRenderer.renderFavorites(propertyData);
      appendContent(tooltipContainer, favorites);
    } else if (this.displayOldTooltipWhenNoFavorites) {
      const content = await super.getElementToolTip(hit);
      appendContent(tooltipContainer, content);
    }

    return tooltipContainer;
  }
}
