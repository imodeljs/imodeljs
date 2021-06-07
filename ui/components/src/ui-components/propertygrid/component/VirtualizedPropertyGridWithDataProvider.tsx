/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module PropertyGrid
 */

import React from "react";
import { SpinnerSize } from "@bentley/ui-core";
import { DelayedSpinner } from "../../common/DelayedSpinner";
import { HighlightingComponentProps } from "../../common/HighlightingComponentProps";
import { FilteredType } from "../dataproviders/filterers/PropertyDataFiltererBase";
import { usePropertyGridEventHandler, usePropertyGridModel, usePropertyGridModelSource } from "../internal/PropertyGridHooks";
import { PropertyCategoryRendererManager } from "../PropertyCategoryRendererManager";
import { IPropertyDataProvider } from "../PropertyDataProvider";
import { CommonPropertyGridProps } from "./PropertyGridCommons";
import { VirtualizedPropertyGrid } from "./VirtualizedPropertyGrid";

/** Properties for [[VirtualizedPropertyGridWithDataProvider]] React component
 * @beta
 */
export interface VirtualizedPropertyGridWithDataProviderProps extends CommonPropertyGridProps {
  dataProvider: IPropertyDataProvider;
  highlight?: HighlightingComponentProps & {
    filteredTypes?: FilteredType[];
  };
  propertyCategoryRendererManager?: PropertyCategoryRendererManager;
}

/**
 * VirtualizedPropertyGrid React Component which takes dataProvider and
 * sets up default implementations for IPropertyGridModelSource nad IPropertyGridEventHandler
 * @beta
 */
export function VirtualizedPropertyGridWithDataProvider(props: VirtualizedPropertyGridWithDataProviderProps) {
  // eslint-disable-next-line deprecation/deprecation
  const modelSource = usePropertyGridModelSource({ dataProvider: props.dataProvider, onPropertyLinkClick: props.onPropertyLinkClick });
  const model = usePropertyGridModel({ modelSource });
  const eventHandler = usePropertyGridEventHandler({ modelSource });

  if (!model) {
    return (
      <div className="components-virtualized-property-grid-loader">
        <DelayedSpinner size={SpinnerSize.Large} />
      </div>
    );
  }

  return (<VirtualizedPropertyGrid {...props} model={model} eventHandler={eventHandler} />);
}
