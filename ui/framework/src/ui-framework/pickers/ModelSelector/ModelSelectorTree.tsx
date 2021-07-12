/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Picker
 */

import classnames from "classnames";
import * as React from "react";
import { ModelProps, ModelQueryParams } from "@bentley/imodeljs-common";
import { SpatialModelState, SpatialViewState } from "@bentley/imodeljs-frontend";
import { NodeKey } from "@bentley/presentation-common";
import { DEPRECATED_treeWithFilteringSupport } from "@bentley/presentation-components";
import { DEPRECATED_Tree, FilteringInput, SelectionMode, TreeNodeItem } from "@bentley/ui-components";
import {
  CheckBoxInfo, CheckBoxState, ContextMenuItem, GlobalContextMenu, ImageCheckBox, isPromiseLike, LoadingSpinner, NodeCheckboxRenderProps, SpinnerSize, UiCore,
} from "@bentley/ui-core";
import { UiFramework } from "../../UiFramework";
import { ListItem, ListItemType } from "../ListPicker";
import { CategoryModelTreeProps, CategoryModelTreeState, Groups } from "./ModelSelectorDefinitions";

/**
 * Tree which displays and manages models or categories contained in an iModel.
 * @internal @deprecated
 */
// istanbul ignore next
export class CategoryModelTree extends React.Component<CategoryModelTreeProps, CategoryModelTreeState> {
  private _optionsElement: HTMLElement | null = null;
  private _allNodeIds: string[] = [];
  private _isMounted = false;
  private _searchLabel = UiCore.translate("general.search");
  private _closeLabel = UiCore.translate("dialog.close");

  constructor(props: CategoryModelTreeProps) {
    super(props);
    this._initState();
  }

  private _initState() {
    this.state = { // eslint-disable-line react/no-direct-mutation-state
      activeGroup: this.props.activeGroup,
      checkboxInfo: this.createCheckBoxInfoCallback(),
      isLoading: false,
      isOptionsOpened: false,
      filterInfo: {},
      showSearchBox: false,
    };
  }

  /** @internal */
  public override componentDidMount() {
    this._isMounted = true;
    if (this.props.activeView) {
      this.props.activeView.onViewedModelsChanged.addListener(
        this._onViewedModelsChanged,
      );
      this.props.activeView.onViewedCategoriesChanged.addListener(
        this._onViewedCategoriesChanged,
      );
    }
  }

  /** @internal */
  public override componentDidUpdate(
    prevProps: CategoryModelTreeProps,
    _prevState: CategoryModelTreeState,
  ) {
    if (prevProps.activeView) {
      prevProps.activeView.onViewedModelsChanged.removeListener(
        this._onViewedModelsChanged,
      );
      prevProps.activeView.onViewedCategoriesChanged.removeListener(
        this._onViewedCategoriesChanged,
      );
    }
    if (this.props.activeView) {
      this.props.activeView.onViewedModelsChanged.addListener(
        this._onViewedModelsChanged,
      );
      this.props.activeView.onViewedCategoriesChanged.addListener(
        this._onViewedCategoriesChanged,
      );
    }
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
  }

  private _onViewedModelsChanged = () => {
    this._resetCheckBoxState();
  };

  private _onViewedCategoriesChanged = () => {
    this._resetCheckBoxState();
  };

  private createCheckBoxInfoCallback() {
    const combine = (status: CheckBoxInfo) => ({
      isVisible: true,
      ...status,
    });
    return (node: TreeNodeItem): CheckBoxInfo | Promise<CheckBoxInfo> => {
      const status = this.getNodeCheckBoxInfo(node);
      if (isPromiseLike(status)) return status.then(combine);
      return combine(status);
    };
  }

  private getNodeCheckBoxInfo(
    node: TreeNodeItem,
  ): CheckBoxInfo | Promise<CheckBoxInfo> {
    const key = this.state.activeGroup.dataProvider.getNodeKey(node);
    const nodeId = NodeKey.isInstancesNodeKey(key) ? key.instanceKeys[0].id : "";
    const item = this._getItem(nodeId);
    if (item && this.props.activeView) {
      const view = this.props.activeView.view as SpatialViewState;
      let state = CheckBoxState.Off;
      const group = this.state.activeGroup.id;
      if (
        (group === Groups.Models && view.modelSelector.models.has(item.key)) ||
        (group === Groups.Categories &&
          view.categorySelector.categories.has(item.key))
      )
        state = CheckBoxState.On;
      return { isDisabled: false, isVisible: true, state };
    }
    return {};
  }

  private async onCheckboxStateChange(
    stateChanges: Array<{
      node: TreeNodeItem;
      newState: CheckBoxState;
    }>,
  ) {
    const nodesToEnable: TreeNodeItem[] = [];
    const nodesToDisable: TreeNodeItem[] = [];
    for (const { node, newState } of stateChanges) {
      if (newState === CheckBoxState.On) {
        nodesToEnable.push(node);
      } else {
        nodesToDisable.push(node);
      }
    }

    if (nodesToEnable.length > 0) {
      this._manageNodesState(nodesToEnable, true); // eslint-disable-line @typescript-eslint/no-floating-promises
    }

    if (nodesToDisable.length > 0) {
      this._manageNodesState(nodesToDisable, false); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private renderNodeCheckbox(props: NodeCheckboxRenderProps): React.ReactNode {
    return (
      <ImageCheckBox
        checked={props.checked}
        disabled={props.disabled}
        imageOn="icon-visibility"
        imageOff="icon-visibility-hide-2"
        onClick={props.onChange}
        tooltip={UiFramework.translate(props.checked ? "modelTree.status.visible" : "modelTree.status.hidden")}
      />
    );
  }

  /**
   * Enable or disable all items and nodes
   * @param enable Specifies if items and nodes should be enabled or disabled
   */
  private async _onSetEnableAll(enable: boolean) {
    this.setState({ isLoading: true });
    this._onCloseContextMenu();
    if (this._allNodeIds.length === 0)
      this._allNodeIds = await this._fetchAllNodeIds();
    this._setItemStates(this._allNodeIds, enable); // eslint-disable-line @typescript-eslint/no-floating-promises

    if (this._isMounted)
      this.setState({
        isLoading: false,
        checkboxInfo: this.createCheckBoxInfoCallback(),
      });
  }

  private async _fetchAllNodeIds(): Promise<string[]> {
    if (this.state.activeGroup.id === Groups.Models) {
      const nodeIds = await this._fetchAllModelNodeIds();
      return nodeIds;
    }
    if (this.state.activeGroup.id === Groups.Categories) {
      const nodeIds = await this._fetchAllCategoryNodeIds();
      return nodeIds;
    }
    return [];
  }

  private async _fetchAllModelNodeIds(): Promise<string[]> {
    const modelQueryParams: ModelQueryParams = {
      from: SpatialModelState.classFullName,
      wantPrivate: false,
    };
    let curModelProps: ModelProps[] = new Array<ModelProps>();

    if (this.props.iModelConnection)
      curModelProps = await this.props.iModelConnection.models.queryProps(
        modelQueryParams,
      );

    const ids: string[] = [];
    for (const modelProps of curModelProps) {
      ids.push(modelProps.id ? modelProps.id.toString() : "");
    }

    return ids;
  }

  private async _fetchAllCategoryNodeIds(): Promise<string[]> {
    if (!this.props.activeView) return [];
    const view = this.props.activeView.view as SpatialViewState;
    const selectUsedSpatialCategoryIds =
      "SELECT DISTINCT Category.Id as id from BisCore.GeometricElement3d WHERE Category.Id IN (SELECT ECInstanceId from BisCore.SpatialCategory)";
    const selectUsedDrawingCategoryIds =
      "SELECT DISTINCT Category.Id as id from BisCore.GeometricElement2d WHERE Model.Id=? AND Category.Id IN (SELECT ECInstanceId from BisCore.DrawingCategory)";
    const ecsql = view.is3d()
      ? selectUsedSpatialCategoryIds
      : selectUsedDrawingCategoryIds;
    const ecsql2 =
      // eslint-disable-next-line prefer-template
      "SELECT ECInstanceId as id, UserLabel as label, CodeValue as code FROM " +
      (view.is3d() ? "BisCore.SpatialCategory" : "BisCore.DrawingCategory") +
      " WHERE ECInstanceId IN (" +
      ecsql +
      ")";
    const ids = [];

    if (this.props.iModelConnection) {
      const rowIterator = this.props.iModelConnection.query(ecsql2);
      for await (const row of rowIterator) {
        ids.push(row.id);
      }
    }

    return ids;
  }

  /** Invert display on all items and state of all nodes */
  private async _onInvertAll() {
    this.setState({ isLoading: true });
    this._onCloseContextMenu();
    this._invertEnableOnAllItems();
    if (this._isMounted)
      this.setState({
        isLoading: false,
        checkboxInfo: this.createCheckBoxInfoCallback(),
      });
  }

  /** Invert display on all items */
  private _invertEnableOnAllItems() {
    const enabledItems = [];
    const disabledItems = [];
    for (const item of this.state.activeGroup.items) {
      item.enabled = !item.enabled;
      item.enabled ? enabledItems.push(item) : disabledItems.push(item);
    }
    this.state.activeGroup.setEnabled(enabledItems, true);
    this.state.activeGroup.setEnabled(disabledItems, false);
  }

  /** @internal */
  public override render() {
    const listClassName = classnames("uifw-modelselector", "show");
    return (
      <div className={listClassName}>
        {this._getToolbar()}
        <div className="modelselector-content">
          {this.state.isLoading ? this._getSpinner() : this._getTree()}
        </div>
      </div>
    );
  }

  private _getToolbar() {
    return (
      <div className="modelselector-toolbar">
        {this.state.showSearchBox && (
          <FilteringInput
            filteringInProgress={
              (this.state.filterInfo && this.state.filterInfo.filtering) ||
              false
            }
            onFilterCancel={this._onFilterCancel.bind(this)}
            onFilterClear={this._onFilterClear.bind(this)}
            onFilterStart={this._onFilterStart.bind(this)}
            resultSelectorProps={{
              onSelectedChanged: this._onSelectedMatchChanged,
              resultCount:
                (this.state.filterInfo && this.state.filterInfo.matchesCount) ||
                0,
            }}
          />
        )}
        <div className="option-group">
          {!this.state.showSearchBox ?
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <span
              className="icon icon-search"
              onClick={this._onToggleSearchBox.bind(this)}
              role="button"
              tabIndex={-1}
              title={this._searchLabel}
            /> :
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <span
              className="icon icon-close"
              onClick={this._onToggleSearchBox.bind(this)}
              role="button"
              tabIndex={-1}
              title={this._closeLabel}
            />
          }
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
          <span
            className="options icon icon-more-2"
            title={UiFramework.translate("categoriesModels.options")}
            onClick={this._onShowOptions.bind(this)}
            ref={(element) => {
              this._optionsElement = element;
            }}
            role="button"
            tabIndex={-1}
          />
          <GlobalContextMenu
            opened={this.state.isOptionsOpened}
            x={this._getOptionsX()}
            y={this._getOptionsY()}
            onOutsideClick={this._onCloseContextMenu}
          >
            <ContextMenuItem
              key={0}
              icon="icon-visibility"
              onClick={this._onSetEnableAll.bind(this, true)}
            >
              {UiFramework.translate("pickerButtons.showAll")}
            </ContextMenuItem>
            <ContextMenuItem
              key={1}
              icon="icon-visibility-hide-2"
              onClick={this._onSetEnableAll.bind(this, false)}
            >
              {UiFramework.translate("pickerButtons.hideAll")}
            </ContextMenuItem>
            <ContextMenuItem
              key={2}
              icon="icon-visibility-invert"
              onClick={this._onInvertAll.bind(this)}
            >
              {UiFramework.translate("pickerButtons.invert")}
            </ContextMenuItem>
          </GlobalContextMenu>
        </div>
      </div>
    );
  }

  private _getOptionsX() {
    if (!this._optionsElement) return 0;
    const rect = this._optionsElement.getBoundingClientRect();
    return rect.right;
  }

  private _getOptionsY() {
    if (!this._optionsElement) return 0;
    const rect = this._optionsElement.getBoundingClientRect();
    return rect.bottom;
  }

  private _onToggleSearchBox() {
    this._onFilterClear();
    this.setState((prevState) => ({
      showSearchBox: !prevState.showSearchBox,
      filterInfo: {
        ...prevState.filterInfo,
        filter: "",
        filtering: false,
      },
    }));
  }

  private _onFilterCancel() {
    if (!this.state.filterInfo) return;

    this.setState((prevState) => ({
      filterInfo: {
        ...prevState.filterInfo,
        filter: "",
        filtering: false,
      },
    }));
  }

  private _onFilterClear() {
    if (!this.state.filterInfo) return;

    this.setState((prevState) => ({
      filterInfo: {
        ...prevState.filterInfo,
        filter: "",
        filtering: false,
      },
    }));
  }

  private _onFilterStart(filter: string) {
    if (!this.state.filterInfo) return;

    this.setState((prevState) => ({
      filterInfo: {
        ...prevState.filterInfo,
        filter,
        filtering: true,
      },
    }));
  }

  private _onSelectedMatchChanged(index: number) {
    if (this.state.filterInfo && index !== this.state.filterInfo.matchesCount) {
      this.setState((prevState) => ({
        filterInfo: {
          ...prevState.filterInfo,
          activeMatchIndex: index,
        },
      }));
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private async onFilterApplied(_filter?: string): Promise<void> {
    if (this.state.filterInfo && this.state.filterInfo.filtering) {
      this.setState((prevState) => ({
        filterInfo: {
          ...prevState.filterInfo,
          filtering: false,
        },
      }));
    }
  }

  private _onMatchesCounted(count: number) {
    if (this.state.filterInfo && count !== this.state.filterInfo.matchesCount) {
      this.setState((prevState) => ({
        filterInfo: {
          ...prevState.filterInfo,
          matchesCount: count,
        },
      }));
    }
  }

  private _onShowOptions(event: any) {
    event.stopPropagation();
    this.setState((prevState) => ({
      isOptionsOpened: !prevState.isOptionsOpened,
    }));
  }

  private _onCloseContextMenu = () => {
    this.setState({ isOptionsOpened: false });
  };

  private _getSpinner() {
    return <LoadingSpinner size={SpinnerSize.Large} />;
  }

  private _getTree() {
    return (
      <CategoryModelFilterTree
        dataProvider={this.state.activeGroup.dataProvider}
        filter={this.state.filterInfo ? this.state.filterInfo.filter : ""}
        onFilterApplied={async (filter) => this.onFilterApplied(filter)}
        onMatchesCounted={(count) => this._onMatchesCounted(count)}
        activeMatchIndex={
          this.state.filterInfo ? this.state.filterInfo.activeMatchIndex : 0
        }
        selectionMode={SelectionMode.SingleAllowDeselect}
        onNodeExpanded={async (node) => this._onNodeExpanded(node)}
        showDescriptions={true}
        checkboxInfo={this.state.checkboxInfo}
        onCheckboxClick={async (stateChange) =>
          this.onCheckboxStateChange(stateChange)
        }
        showIcons={true}
        renderOverrides={{
          renderCheckbox: this.renderNodeCheckbox,
        }}
        pageSize={5}
      />
    );
  }

  // Nodes only expand if active group is "Categories"
  private async _onNodeExpanded(node: TreeNodeItem) {
    const categories: ListItem[] = this.state.activeGroup.items;
    const key = this.state.activeGroup.dataProvider.getNodeKey(node);
    const nodeId = NodeKey.isInstancesNodeKey(key) ? key.instanceKeys[0].id : "";
    const ecsql = `SELECT ECInstanceId as id FROM BisCore.SubCategory WHERE Parent.Id=${nodeId}`;
    const rows = [];

    if (this.props.iModelConnection) {
      const rowIterator = this.props.iModelConnection.query(ecsql);
      for await (const row of rowIterator) {
        rows.push(row);
      }
    }

    for (const row of rows) {
      const existingItem = categories.find((category) => {
        return row.id === category.key;
      });

      if (!existingItem) {
        const category: ListItem = {
          key: row.id as string,
          enabled: this.props.activeView
            ? this.props.activeView.view.categorySelector.has(row.id as string)
            : false,
          type: ListItemType.Item,
        };
        categories.push(category);
      }
    }

    this.setState((prevState) => ({
      activeGroup: {
        ...prevState.activeGroup,
        items: categories,
      },
      checkboxInfo: this.createCheckBoxInfoCallback(),
    }));
  }

  private async _manageNodesState(nodes: TreeNodeItem[], enable: boolean) {
    const nodeIds = this._getNodeIds(nodes);
    await this._setItemStates(nodeIds, enable);

    if (this._isMounted)
      this.setState({
        checkboxInfo: this.createCheckBoxInfoCallback(),
      });
  }

  private _getNodeIds(nodes: TreeNodeItem[]) {
    const nodeIds: string[] = [];
    nodes.forEach((node) => {
      const key = this.state.activeGroup.dataProvider.getNodeKey(node);
      const id = NodeKey.isInstancesNodeKey(key) ? key.instanceKeys[0].id : "";
      nodeIds.push(id);
    });
    return nodeIds;
  }
  /**
   * Set item and node state after input change
   * @param treeItemIds Ids of items to set state on
   * @param enable Flag to enable or disable item, determined by checkBoxState if not specified
   */
  private async _setItemStates(treeItemIds: string[], enable: boolean) {
    this._setEnableItems(treeItemIds, enable);

    if (this.state.activeGroup.id === Groups.Categories)
      treeItemIds.forEach((treeItemId: string) => {
        this._setEnableChildren(treeItemId, enable); // eslint-disable-line @typescript-eslint/no-floating-promises
      });
  }

  /**
   * Set display flag on an item based on toggled node.
   * @param treeNodeIds  Ids of Nodes related to toggled display item.
   */
  private _setEnableItems(treeNodeIds: string[], enable: boolean) {
    treeNodeIds.forEach((treeNodeId: string) => {
      const item = this._getItem(treeNodeId);
      item.enabled = enable;
      this.state.activeGroup.setEnabled([item], enable);
    });
    if (this._isMounted)
      this.setState({
        checkboxInfo: this.createCheckBoxInfoCallback(),
      });
  }

  /**
   * Find an item specified by a node based on shared key.
   * @param treeNodeId Tree node ID to match.
   * @returns Specified item from list. Defaults to first item if none found.
   */
  private _getItem(treeNodeId: string): ListItem {
    const items = this.state.activeGroup.items;
    for (const item of items) {
      if (treeNodeId === item.key) {
        return item;
      }
    }
    return items[0];
  }

  private async _setEnableChildren(nodeId: string, enable: boolean) {
    const childNodeIds = await this._fetchChildNodes(nodeId);
    this._setEnableItems(childNodeIds, enable);
  }

  private async _fetchChildNodes(nodeId: string): Promise<string[]> {
    const ecsql = `SELECT ECInstanceId as id FROM BisCore.SubCategory WHERE Parent.Id=${nodeId}`;
    const childIds = [];

    if (this.props.iModelConnection) {
      const rowIterator = this.props.iModelConnection.query(ecsql);
      for await (const row of rowIterator) {
        childIds.push(row.id);
      }
    }

    return childIds;
  }

  private _resetCheckBoxState() {
    if (this._isMounted)
      this.setState({
        checkboxInfo: this.createCheckBoxInfoCallback(),
      });
  }
}

/**
 * Tree component with support for filtering
 * @internal
 */
const CategoryModelFilterTree = DEPRECATED_treeWithFilteringSupport(DEPRECATED_Tree); // eslint-disable-line @typescript-eslint/naming-convention, deprecation/deprecation
