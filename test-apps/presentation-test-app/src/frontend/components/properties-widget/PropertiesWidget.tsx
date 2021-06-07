/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import "./PropertiesWidget.css";
import * as React from "react";
import { IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { Field } from "@bentley/presentation-common";
import {
  DiagnosticsProps, FavoritePropertiesDataFilterer, IPresentationPropertyDataProvider, PresentationPropertyDataProvider,
  usePropertyDataProviderWithUnifiedSelection,
} from "@bentley/presentation-components";
import { FavoritePropertiesScope, Presentation } from "@bentley/presentation-frontend";
import { PropertyRecord } from "@bentley/ui-abstract";
import {
  ActionButtonRendererProps, CompositeFilterType, CompositePropertyDataFilterer, DisplayValuePropertyDataFilterer, FilteredPropertyData,
  FilteringInput, FilteringInputStatus, FilteringPropertyDataProvider, LabelPropertyDataFilterer, PropertyCategory, PropertyCategoryLabelFilterer,
  PropertyData, PropertyGridContextMenuArgs, useAsyncValue, useDebouncedAsyncValue, VirtualizedPropertyGridWithDataProvider,
} from "@bentley/ui-components";
import { HighlightInfo } from "@bentley/ui-components/lib/ui-components/common/HighlightingComponentProps";
import { ContextMenuItem, ContextMenuItemProps, FillCentered, GlobalContextMenu, Orientation, Toggle, useDisposable } from "@bentley/ui-core";
import { DiagnosticsSelector } from "../diagnostics-selector/DiagnosticsSelector";

const FAVORITES_SCOPE = FavoritePropertiesScope.IModel;

export interface Props {
  imodel: IModelConnection;
  rulesetId?: string;
  onFindSimilar?: (propertiesProvider: IPresentationPropertyDataProvider, record: PropertyRecord) => void;
}

export function PropertiesWidget(props: Props) {
  const { imodel, rulesetId, onFindSimilar } = props;
  const [diagnosticsOptions, setDiagnosticsOptions] = React.useState<DiagnosticsProps>({ ruleDiagnostics: undefined, devDiagnostics: undefined });

  const [filterText, setFilterText] = React.useState("");
  const [isFavoritesFilterActive, setIsFavoritesFilterActive] = React.useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(0);
  const [activeHighlight, setActiveHighlight] = React.useState<HighlightInfo>();

  const setFilter = React.useCallback((filter) => {
    if (filter !== filterText)
      setFilterText(filter);
  }, [filterText]);

  const [filteringResult, setFilteringResult] = React.useState<FilteredPropertyData>();
  const resultSelectorProps = React.useMemo(() => {
    return filteringResult?.matchesCount !== undefined ? {
      onSelectedChanged: (index: React.SetStateAction<number>) => setActiveMatchIndex(index),
      resultCount: filteringResult.matchesCount,
    } : undefined;
  }, [filteringResult]);

  const onFilteringStateChanged = React.useCallback((newFilteringResult: FilteredPropertyData | undefined) => {
    setFilteringResult(newFilteringResult);
    if (newFilteringResult?.getMatchByIndex)
      setActiveHighlight(newFilteringResult.getMatchByIndex(activeMatchIndex));
  }, [activeMatchIndex]);

  return (
    <div className="PropertiesWidget">
      <h3>{IModelApp.i18n.translate("Sample:controls.properties.widget-label")}</h3>
      <DiagnosticsSelector onDiagnosticsOptionsChanged={setDiagnosticsOptions} />
      {rulesetId
        ? (<div className="SearchBar">
          <FilteringInput
            onFilterCancel={() => { setFilter(""); }}
            onFilterClear={() => { setFilter(""); }}
            onFilterStart={(newFilter) => { setFilter(newFilter); }}
            style={{ flex: "auto" }}
            resultSelectorProps={resultSelectorProps}
            status={filterText.length !== 0 ? FilteringInputStatus.FilteringFinished : FilteringInputStatus.ReadyToFilter}
          />
          <Toggle
            title="Favorites"
            onChange={(on) => setIsFavoritesFilterActive(on)}
          />
        </div>)
        : null}
      <div className="ContentContainer">
        {rulesetId
          ? <PropertyGrid
            imodel={imodel}
            rulesetId={rulesetId}
            filtering={{ filter: filterText, onlyFavorites: isFavoritesFilterActive, activeHighlight, onFilteringStateChanged }}
            onFindSimilar={onFindSimilar}
            diagnostics={diagnosticsOptions}
          />
          : null
        }
      </div>
    </div>
  );
}

interface PropertyGridProps {
  imodel: IModelConnection;
  rulesetId: string;
  diagnostics: DiagnosticsProps;
  filtering: {
    filter: string;
    onlyFavorites: boolean;
    activeHighlight?: HighlightInfo;
    onFilteringStateChanged: (result: FilteredPropertyData | undefined) => void;
  };
  onFindSimilar?: (propertiesProvider: IPresentationPropertyDataProvider, record: PropertyRecord) => void;
}
function PropertyGrid(props: PropertyGridProps) {
  const { imodel, rulesetId, diagnostics, filtering, onFindSimilar: onFindSimilarProp } = props;

  const dataProvider = useDisposable(React.useCallback(
    () => {
      const provider = new AutoExpandingPropertyDataProvider({ imodel, ruleset: rulesetId, ...diagnostics });
      provider.isNestedPropertyCategoryGroupingEnabled = true;
      return provider;
    }, [imodel, rulesetId, diagnostics]));
  const { isOverLimit, numSelectedElements } = usePropertyDataProviderWithUnifiedSelection({ dataProvider });

  const renderFavoritesActionButton = React.useCallback((buttonProps: ActionButtonRendererProps) => (<FavoritePropertyActionButton {...buttonProps} dataProvider={dataProvider} />), [dataProvider]);
  const renderCopyActionButton = React.useCallback(() => <CopyActionButton />, []);

  const { filter: filterText, onlyFavorites, activeHighlight, onFilteringStateChanged } = filtering;
  const [filteringProvDataChanged, setFilteringProvDataChanged] = React.useState({});
  const filteringDataProvider = useDisposable(React.useCallback(() => {
    const valueFilterer = new DisplayValuePropertyDataFilterer(filterText);
    const labelFilterer = new LabelPropertyDataFilterer(filterText);
    const categoryFilterer = new PropertyCategoryLabelFilterer(filterText);
    const favoriteFilterer = new FavoritePropertiesDataFilterer({ source: dataProvider, favoritesScope: FAVORITES_SCOPE, isActive: onlyFavorites });

    const recordFilterer = new CompositePropertyDataFilterer(labelFilterer, CompositeFilterType.Or, valueFilterer);
    const textFilterer = new CompositePropertyDataFilterer(recordFilterer, CompositeFilterType.Or, categoryFilterer);
    const favoriteTextFilterer = new CompositePropertyDataFilterer(textFilterer, CompositeFilterType.And, favoriteFilterer);
    const filteringDataProv = new FilteringPropertyDataProvider(dataProvider, favoriteTextFilterer);
    filteringDataProv.onDataChanged.addListener(() => {
      setFilteringProvDataChanged({});
    });
    return filteringDataProv;
  }, [dataProvider, filterText, onlyFavorites]));

  const { value: filteringResult } = useDebouncedAsyncValue(React.useCallback(async () => {
    return filteringDataProvider.getData();
  }, [filteringDataProvider, filteringProvDataChanged])); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    onFilteringStateChanged(filteringResult);
  }, [filteringResult, onFilteringStateChanged]);

  const [contextMenuArgs, setContextMenuArgs] = React.useState<PropertyGridContextMenuArgs>();
  const onPropertyContextMenu = React.useCallback((args: PropertyGridContextMenuArgs) => {
    args.event.persist();
    setContextMenuArgs(args);
  }, []);
  const onCloseContextMenu = React.useCallback(() => {
    setContextMenuArgs(undefined);
  }, []);
  const onFindSimilar = React.useCallback((property: PropertyRecord) => {
    if (onFindSimilarProp)
      onFindSimilarProp(dataProvider, property);
    setContextMenuArgs(undefined);
  }, [onFindSimilarProp, dataProvider]);

  if (numSelectedElements === 0) {
    return <FillCentered>{IModelApp.i18n.translate("Sample:property-grid.no-elements-selected")}</FillCentered>;
  }

  if (isOverLimit) {
    return <FillCentered>{IModelApp.i18n.translate("Sample:property-grid.too-many-elements-selected")}</FillCentered>;
  }

  return <>
    <VirtualizedPropertyGridWithDataProvider
      dataProvider={filteringDataProvider}
      isPropertyHoverEnabled={true}
      onPropertyContextMenu={onPropertyContextMenu}
      actionButtonRenderers={[renderFavoritesActionButton, renderCopyActionButton]}
      orientation={Orientation.Horizontal}
      horizontalOrientationMinWidth={500}
      highlight={(filterText && filterText.length !== 0)
        ? { highlightedText: filterText, activeHighlight, filteredTypes: filteringResult?.filteredTypes }
        : undefined
      }
    />
    {contextMenuArgs && <PropertiesWidgetContextMenu args={contextMenuArgs} dataProvider={dataProvider} onFindSimilar={onFindSimilar} onCloseContextMenu={onCloseContextMenu} />}
  </>;
}

type ContextMenuItemInfo = ContextMenuItemProps & React.Attributes & { label: string };
interface PropertiesWidgetContextMenuProps {
  dataProvider: PresentationPropertyDataProvider;
  args: PropertyGridContextMenuArgs;
  onCloseContextMenu: () => void;
  onFindSimilar?: (property: PropertyRecord) => void;
}
function PropertiesWidgetContextMenu(props: PropertiesWidgetContextMenuProps) {
  const { dataProvider, args: { propertyRecord: property }, onFindSimilar: onFindSimilarProp, onCloseContextMenu } = props;
  const imodel = dataProvider.imodel;

  const onFindSimilar = React.useCallback(() => {
    if (onFindSimilarProp)
      onFindSimilarProp(property);
  }, [onFindSimilarProp, property]);

  const addFavorite = React.useCallback(async (propertyField: Field) => {
    await Presentation.favoriteProperties.add(propertyField, imodel, FAVORITES_SCOPE);
    onCloseContextMenu();
  }, [onCloseContextMenu, imodel]);

  const removeFavorite = React.useCallback(async (propertyField: Field) => {
    await Presentation.favoriteProperties.remove(propertyField, imodel, FAVORITES_SCOPE);
    onCloseContextMenu();
  }, [onCloseContextMenu, imodel]);

  const asyncItems = useDebouncedAsyncValue(React.useCallback(async () => {
    const field = await dataProvider.getFieldByPropertyRecord(property);
    const items: ContextMenuItemInfo[] = [];
    if (field !== undefined) {
      if (Presentation.favoriteProperties.has(field, imodel, FAVORITES_SCOPE)) {
        items.push({
          key: "remove-favorite",
          onSelect: async () => removeFavorite(field),
          title: IModelApp.i18n.translate("Sample:controls.properties.context-menu.remove-favorite.description"),
          label: IModelApp.i18n.translate("Sample:controls.properties.context-menu.remove-favorite.label"),
        });
      } else {
        items.push({
          key: "add-favorite",
          onSelect: async () => addFavorite(field),
          title: IModelApp.i18n.translate("Sample:controls.properties.context-menu.add-favorite.description"),
          label: IModelApp.i18n.translate("Sample:controls.properties.context-menu.add-favorite.label"),
        });
      }
    }
    if (onFindSimilarProp) {
      items.push({
        key: "find-similar",
        onSelect: onFindSimilar,
        title: IModelApp.i18n.translate("Sample:controls.properties.context-menu.find-similar.description"),
        label: IModelApp.i18n.translate("Sample:controls.properties.context-menu.find-similar.label"),
      });
    }
    return items;
  }, [imodel, dataProvider, property, addFavorite, removeFavorite, onFindSimilar, onFindSimilarProp]));

  if (!asyncItems.value || asyncItems.value.length === 0)
    return null;

  return (
    <GlobalContextMenu
      opened={true}
      onOutsideClick={onCloseContextMenu}
      onEsc={onCloseContextMenu}
      identifier="PropertiesWidget"
      x={props.args.event.clientX}
      y={props.args.event.clientY}
    >
      {asyncItems.value.map((item) =>
        <ContextMenuItem key={item.key} onSelect={item.onSelect} title={item.title}>
          {item.label}
        </ContextMenuItem>
      )}
    </GlobalContextMenu>
  );
}

function FavoritePropertyActionButton(props: ActionButtonRendererProps & { dataProvider: PresentationPropertyDataProvider }) {
  const { property, dataProvider } = props;
  const field = useAsyncValue(React.useMemo(async () => dataProvider.getFieldByPropertyRecord(property), [dataProvider, property]));
  return (
    <div>
      {
        (field && (Presentation.favoriteProperties.has(field, dataProvider.imodel, FAVORITES_SCOPE) || props.isPropertyHovered))
          ? <FavoriteFieldActionButton field={field} imodel={dataProvider.imodel} />
          : undefined
      }
    </div>
  );
}

function FavoriteFieldActionButton(props: { imodel: IModelConnection, field: Field }) {
  const { field, imodel } = props;
  const toggleFavoriteProperty = React.useCallback(async () => {
    if (Presentation.favoriteProperties.has(field, imodel, FAVORITES_SCOPE))
      await Presentation.favoriteProperties.remove(field, imodel, FAVORITES_SCOPE);
    else
      await Presentation.favoriteProperties.add(field, imodel, FAVORITES_SCOPE);
  }, [field, imodel]);
  return (
    <div className="favorite-action-button" onClick={toggleFavoriteProperty} onKeyDown={toggleFavoriteProperty} role="button" tabIndex={0}>
      {Presentation.favoriteProperties.has(field, imodel, FAVORITES_SCOPE) ?
        <div style={{ width: "20px", height: "20px", background: "orange" }} /> :
        <div style={{ width: "20px", height: "20px", background: "blue" }} />}
    </div>
  );
}

function CopyActionButton() {
  return (
    <div className="copy-action-button" style={{ height: "20px" }}>
      Copy
    </div>
  );
}

class AutoExpandingPropertyDataProvider extends PresentationPropertyDataProvider {
  public async getData(): Promise<PropertyData> {
    const result = await super.getData();
    this.expandCategories(result.categories);
    return result;
  }

  private expandCategories(categories: PropertyCategory[]) {
    categories.forEach((category: PropertyCategory) => {
      category.expand = true;
      if (category.childCategories)
        this.expandCategories(category.childCategories);
    });
  }
}
