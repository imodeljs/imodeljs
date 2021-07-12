/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Favorite
 */

import "./FavoritePropertyList.scss";
import * as React from "react";
import { Orientation } from "@bentley/ui-core";
import { PropertyValueRendererManager } from "../properties/ValueRendererManager";
import { PropertyList } from "../propertygrid/component/PropertyList";
import { PropertyData } from "../propertygrid/PropertyDataProvider";

/** Properties for [[FavoritePropertyList]] React component
 * @alpha
 */
export interface FavoritePropertyListProps {
  propertyData: PropertyData;
  propertyValueRendererManager?: PropertyValueRendererManager;
  orientation?: Orientation;
}

/** Favorite Property List React component
 * @alpha
 */
export class FavoritePropertyList extends React.PureComponent<FavoritePropertyListProps> {
  /** @internal */
  public override render() {
    if (this.props.propertyData.records.Favorite !== undefined) {
      const propertyValueRendererManager = this.props.propertyValueRendererManager ?? PropertyValueRendererManager.defaultManager;
      const orientation = this.props.orientation ?? Orientation.Horizontal;
      return (
        <div className="components-favorite-property-list">
          <PropertyList
            orientation={orientation}
            properties={this.props.propertyData.records.Favorite}
            columnRatio={1 / 3}
            propertyValueRendererManager={propertyValueRendererManager}
          />
        </div>
      );
    }
    return null;
  }
}
