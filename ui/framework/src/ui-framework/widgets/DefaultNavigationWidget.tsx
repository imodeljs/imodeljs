/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import * as React from "react";
import { CoreTools } from "../tools/CoreToolDefinitions";
import { connectIModelConnection } from "../redux/connectIModel";
import { ItemList } from "../shared/ItemMap";
import { UiFramework } from "../UiFramework";
import { NavigationWidget } from "./NavigationWidget";

/** Properties that can be used to append items to the default set of toolbar items of [[DefaultNavigationWidget]].
 * @beta @deprecated use BasicNavigationWidget instead
 */
export interface DefaultNavigationProps {
  /** Item to add before the default items in the horizontal toolbar */
  prefixHorizontalItems?: ItemList;
  /** Item to add after the default items in the horizontal toolbar */
  suffixHorizontalItems?: ItemList;
  /** Item to add before the default items in the vertical toolbar */
  prefixVerticalItems?: ItemList;
  /** Item to add after the default items in the vertical toolbar */
  suffixVerticalItems?: ItemList;
}

/** Default Navigation Widget for zone 3. Provides standard view manipulation tools and displays registered Navigation Aids as corner item.
 * This definition will also show a overflow button if there is not enough room to display all the toolbar buttons.
 * @beta @deprecated use BasicNavigationWidget instead
 */
export class DefaultNavigationWidget extends React.Component<DefaultNavigationProps> { // eslint-disable-line deprecation/deprecation

  private _horizontalToolbarItems = new ItemList([
    CoreTools.rotateViewCommand,
    CoreTools.panViewCommand,
    CoreTools.fitViewCommand,
    CoreTools.windowAreaCommand,
    CoreTools.viewUndoCommand,
    CoreTools.viewRedoCommand,
  ]);

  private _verticalToolbarItems = new ItemList([
    CoreTools.walkViewCommand,
    CoreTools.toggleCameraViewCommand,
  ]);

  public override render() {
    const horizontalToolbarItems = new ItemList();
    if (this.props.prefixHorizontalItems) horizontalToolbarItems.addItems(this.props.prefixHorizontalItems);
    // istanbul ignore else
    if (this._horizontalToolbarItems) horizontalToolbarItems.addItems(this._horizontalToolbarItems);
    if (this.props.suffixHorizontalItems) horizontalToolbarItems.addItems(this.props.suffixHorizontalItems);

    const verticalToolbarItems = new ItemList();
    if (this.props.prefixVerticalItems) verticalToolbarItems.addItems(this.props.prefixVerticalItems);
    // istanbul ignore else
    if (this._verticalToolbarItems) verticalToolbarItems.addItems(this._verticalToolbarItems);
    if (this.props.suffixVerticalItems) verticalToolbarItems.addItems(this.props.suffixVerticalItems);

    return (
      <NavigationWidget // eslint-disable-line deprecation/deprecation
        navigationAidId="CubeNavigationAid"
        iModelConnection={UiFramework.getIModelConnection()}
        horizontalItems={horizontalToolbarItems}
        verticalItems={verticalToolbarItems}
      />
    );
  }
}

/** DefaultNavigationWidget that is connected to the IModelConnection property in the Redux store. The application must set up the Redux store and include the FrameworkReducer.
 * @beta @deprecated use BasicNavigationWidget instead
 */
export const IModelConnectedNavigationWidget = connectIModelConnection(null, null)(DefaultNavigationWidget); // eslint-disable-line @typescript-eslint/naming-convention, deprecation/deprecation
