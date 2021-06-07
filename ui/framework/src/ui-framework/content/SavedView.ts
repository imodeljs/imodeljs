/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ContentView
 */

import { EmphasizeElementsProps, ViewStateProps } from "@bentley/imodeljs-common";
import {
  DrawingViewState, EmphasizeElements, IModelConnection, ScreenViewport, SheetViewState, SpatialViewState, ViewState,
} from "@bentley/imodeljs-frontend";
import { ViewUtilities } from "../utils/ViewUtilities";

/** SavedViewProps interface for sharing ViewState and EmphasizeElements information.
 * @public
 */
export interface SavedViewProps extends ViewStateProps {
  bisBaseClass: string;
  emphasizeElementsProps?: EmphasizeElementsProps;
}

/** SavedView class. Used to serialize/deserialize a ViewState.
 * @public
 */
export class SavedView {

  /** Create a ViewState from the SavedView */
  public static async viewStateFromProps(iModelConnection: IModelConnection, savedViewProps: SavedViewProps): Promise<ViewState | undefined> {
    const props: ViewStateProps = {
      viewDefinitionProps: savedViewProps.viewDefinitionProps,
      categorySelectorProps: savedViewProps.categorySelectorProps,
      modelSelectorProps: savedViewProps.modelSelectorProps,
      displayStyleProps: savedViewProps.displayStyleProps,
      sheetProps: savedViewProps.sheetProps,
      sheetAttachments: savedViewProps.sheetAttachments,
    };

    let viewState: ViewState | undefined;

    if (ViewUtilities.isSpatial(savedViewProps.bisBaseClass))
      viewState = SpatialViewState.createFromProps(props, iModelConnection);
    else if (ViewUtilities.isDrawing(savedViewProps.bisBaseClass))
      viewState = DrawingViewState.createFromProps(props, iModelConnection);
    else {
      // istanbul ignore else
      if (ViewUtilities.isSheet(savedViewProps.bisBaseClass))
        viewState = SheetViewState.createFromProps(props, iModelConnection);
    }

    // istanbul ignore else
    if (viewState)
      await viewState.load();

    return viewState;
  }

  /** Apply EmphasizeElements from the SavedView */
  public static emphasizeElementsFromProps(vp: ScreenViewport, savedViewProps: SavedViewProps): boolean {
    let changed = false;
    if (savedViewProps.emphasizeElementsProps) {
      const emphasizeElements = new EmphasizeElements();
      changed = emphasizeElements.fromJSON(savedViewProps.emphasizeElementsProps, vp);
    }
    return changed;
  }

  /** Create props for a ViewState */
  public static viewStateToProps(viewState: ViewState): SavedViewProps {
    const savedViewProps = viewState.toProps() as SavedViewProps;
    savedViewProps.bisBaseClass = ViewUtilities.getBisBaseClass(viewState.classFullName);
    return savedViewProps;
  }

  /** Create props for an EmphasizeElements and store in SavedViewProps */
  public static emphasizeElementsToProps(vp: ScreenViewport, savedViewProps: SavedViewProps): void {
    const ee = EmphasizeElements.get(vp);
    const emphasizeElementsProps = ee ? ee.toJSON(vp) : undefined;
    savedViewProps.emphasizeElementsProps = emphasizeElementsProps;
  }

}
