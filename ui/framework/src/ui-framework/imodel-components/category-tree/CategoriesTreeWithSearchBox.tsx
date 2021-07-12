/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModelComponents
 */

import "./CategoriesTreeWithSearchBox.scss";
import * as React from "react";
import { BeUiEvent } from "@bentley/bentleyjs-core";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { IPresentationTreeDataProvider } from "@bentley/presentation-components";
import { FilteringInput } from "@bentley/ui-components";
import { CategoryTree, CategoryTreeProps, toggleAllCategories } from "./CategoriesTree";

/** @internal
 * @deprecated */
export interface CategoryTreeWithSearchBoxProps extends CategoryTreeProps {
  showSearchBox?: boolean;
  showAll?: BeUiEvent<void>;
  hideAll?: BeUiEvent<void>;
}

/**
 * @internal
 * @deprecated for backwards compatibility with visibility widget
 */
export function CategoryTreeWithSearchBox(props: CategoryTreeWithSearchBoxProps) { // eslint-disable-line deprecation/deprecation
  const { showSearchBox, showAll, hideAll, ...strippedProps } = props;
  const [filter, setFilter] = React.useState("");
  const [activeMatchIndex, setActiveMatchIndex] = React.useState<number>();
  const [matchesCount, setMatchesCount] = React.useState<number>();
  const [filteredProvider, setFilteredProvider] = React.useState<IPresentationTreeDataProvider>();

  const cancelFilter = React.useCallback(/* istanbul ignore next */() => {
    setMatchesCount(undefined);
    setFilter("");
    setFilteredProvider(undefined);
  }, []);
  const startFilter = React.useCallback((newFilter: string) => {
    setMatchesCount(undefined);
    setFilter(newFilter);
  }, []);
  const selectedChanged = React.useCallback((index: number) => setActiveMatchIndex(index), []);
  const filterApplied = React.useCallback((provider: IPresentationTreeDataProvider, count: number) => {
    setMatchesCount(count);
    setFilteredProvider(provider);
  }, []);

  // istanbul ignore next
  const viewManager = strippedProps.viewManager ?? IModelApp.viewManager;
  // istanbul ignore next
  const activeView = strippedProps.activeView ?? viewManager.getFirstOpenView();
  React.useEffect(
    () => showAll?.addListener(async () => toggleAllCategories(viewManager, strippedProps.iModel, true, activeView, true, filteredProvider)),
    [showAll, viewManager, strippedProps.iModel, activeView, filteredProvider],
  );
  React.useEffect(
    () => hideAll?.addListener(async () => toggleAllCategories(viewManager, strippedProps.iModel, false, activeView, true, filteredProvider)),
    [hideAll, viewManager, strippedProps.iModel, activeView, filteredProvider],
  );

  const isFiltering = !!filter && matchesCount === undefined;
  return (<div className="ui-fw-categories-tree-with-search">
    {showSearchBox && <FilteringInput
      filteringInProgress={isFiltering}
      onFilterCancel={cancelFilter}
      onFilterClear={cancelFilter}
      onFilterStart={startFilter}
      resultSelectorProps={{
        onSelectedChanged: selectedChanged,
        resultCount: matchesCount ?? 0,
      }}
    />}
    <CategoryTree
      {...strippedProps}
      filterInfo={{ filter, activeMatchIndex }}
      onFilterApplied={filterApplied}
    />
  </div>);
}
