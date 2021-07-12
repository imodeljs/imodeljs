/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import * as React from "react";
import { IconSpec } from "@bentley/ui-core";
import { Backstage } from "../backstage/Backstage";
import { CoreTools } from "../tools/CoreToolDefinitions";
import { SelectionContextToolDefinitions } from "../selection/SelectionContextItemDef";
import { ItemList } from "../shared/ItemMap";
import { ToolWidget } from "./ToolWidget";

/** Properties that can be used to append items to the default set of toolbar items of [[ReviewToolWidget]].
 * @beta
 */
export interface ReviewToolWidgetProps {
  /** Item to add before the default items in the horizontal toolbar */
  prefixHorizontalItems?: ItemList;
  /** Item to add after the default items in the horizontal toolbar */
  suffixHorizontalItems?: ItemList;
  /** Item to add before the default items in the vertical toolbar */
  prefixVerticalItems?: ItemList;
  /** Item to add after the default items in the vertical toolbar */
  suffixVerticalItems?: ItemList;
  /** Controls visibility of hide/isolate tools that act on a selection set's categories/models */
  showCategoryAndModelsContextTools?: boolean;
  /** Icon specification for application button */
  iconSpec?: IconSpec;
}

/** Default Tool Widget for standard "review" applications. Provides standard tools to review, and measure elements.
 * This definition will also show a overflow button if there is not enough room to display all the toolbar buttons.
 * @beta
 */
export class ReviewToolWidget extends React.Component<ReviewToolWidgetProps, any> {

  private _horizontalToolbarItems = this.props.showCategoryAndModelsContextTools ?
    new ItemList([
      CoreTools.clearSelectionItemDef,
      SelectionContextToolDefinitions.hideSectionToolGroup,
      SelectionContextToolDefinitions.isolateSelectionToolGroup,
      SelectionContextToolDefinitions.emphasizeElementsItemDef,
    ])
    :
    new ItemList([
      CoreTools.clearSelectionItemDef,
      SelectionContextToolDefinitions.hideElementsItemDef,
      SelectionContextToolDefinitions.isolateElementsItemDef,
      SelectionContextToolDefinitions.emphasizeElementsItemDef,
    ]);

  private _verticalToolbarItems = new ItemList([
    CoreTools.selectElementCommand,
    CoreTools.measureToolGroup,
    CoreTools.sectionToolGroup,
  ]);

  public override render() {
    let appButtonCommandItemDef = Backstage.backstageToggleCommand; // eslint-disable-line deprecation/deprecation
    if (this.props.iconSpec) {
      appButtonCommandItemDef = Backstage.getBackstageToggleCommand(this.props.iconSpec); // eslint-disable-line deprecation/deprecation
    }

    const horizontalToolbarItems = new ItemList();
    // istanbul ignore else
    if (this.props.prefixHorizontalItems) horizontalToolbarItems.addItems(this.props.prefixHorizontalItems);
    // istanbul ignore else
    if (this._horizontalToolbarItems) horizontalToolbarItems.addItems(this._horizontalToolbarItems);
    // istanbul ignore else
    if (this.props.suffixHorizontalItems) horizontalToolbarItems.addItems(this.props.suffixHorizontalItems);

    const verticalToolbarItems = new ItemList();
    // istanbul ignore else
    if (this.props.prefixVerticalItems) verticalToolbarItems.addItems(this.props.prefixVerticalItems);
    // istanbul ignore else
    if (this._verticalToolbarItems) verticalToolbarItems.addItems(this._verticalToolbarItems);
    // istanbul ignore else
    if (this.props.suffixVerticalItems) verticalToolbarItems.addItems(this.props.suffixVerticalItems);

    return (
      <ToolWidget // eslint-disable-line deprecation/deprecation
        appButton={appButtonCommandItemDef}
        horizontalItems={horizontalToolbarItems}
        verticalItems={verticalToolbarItems}
      />
    );
  }
}
