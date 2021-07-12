/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, ScreenViewport } from "@bentley/imodeljs-frontend";
import { PropertyValueFormat } from "@bentley/ui-abstract";
import { CheckBoxState, ImageCheckBox, Input, NodeCheckboxRenderProps, useDisposable, WebFontIcon } from "@bentley/ui-core";
import {
  AbstractTreeNodeLoaderWithProvider, ControlledTree, DelayLoadedTreeNodeItem, HighlightableTreeProps, ITreeDataProvider,
  MutableTreeModel,
  MutableTreeModelNode,
  SelectionMode, TreeCheckboxStateChangeEventArgs, TreeDataProvider, TreeEventHandler, TreeImageLoader, TreeModel, TreeModelChanges, TreeModelSource, TreeNodeItem, TreeNodeLoader,
  TreeNodeRenderer, TreeNodeRendererProps, TreeRenderer, TreeRendererProps, useVisibleTreeNodes,
} from "@bentley/ui-components";
import { MapLayerSettings, MapSubLayerProps, MapSubLayerSettings } from "@bentley/imodeljs-common";
import { StyleMapLayerSettings } from "../Interfaces";
import { SubLayersDataProvider } from "./SubLayersDataProvider";
import { MapLayersUiItemsProvider } from "../MapLayersUiItemsProvider";
import "./SubLayersTree.scss";

interface ToolbarProps {
  searchField?: React.ReactNode;
  children?: React.ReactNode[];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function Toolbar(props: ToolbarProps) {
  return (
    <div className="map-manager-sublayer-tree-toolbar">
      <div className="tree-toolbar-action-buttons">
        {props.children}
      </div>
      {props.searchField && <div className="tree-toolbar-searchbox">
        {props.searchField}
      </div>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function SubLayersPanel({ mapLayer, viewport }: { mapLayer: StyleMapLayerSettings, viewport: ScreenViewport | undefined }) {
  const [noneAvailableLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:SubLayers.NoSubLayers"));
  if (!viewport || (undefined === mapLayer.subLayers || 0 === mapLayer.subLayers.length)) {
    return <div className="map-manager-sublayer-panel">
      <div>{noneAvailableLabel}</div>
    </div>;
  }

  return (
    <SubLayersTree mapLayer={mapLayer} />
  );
}

function getSubLayerProps(subLayerSettings: MapSubLayerSettings[]): MapSubLayerProps[] {
  return subLayerSettings.map((subLayer) => subLayer.toJSON());
}

function getStyleMapLayerSettings(settings: MapLayerSettings, isOverlay: boolean): StyleMapLayerSettings {
  return {
    visible: settings.visible,
    name: settings.name,
    url: settings.url,
    transparency: settings.transparency,
    transparentBackground: settings.transparentBackground,
    subLayers: settings.subLayers ? getSubLayerProps(settings.subLayers) : undefined,
    showSubLayers: true,
    isOverlay,
    provider: IModelApp.mapLayerFormatRegistry.createImageryProvider(settings),
  };
}

/**
 * Tree Control that displays sub-layer hierarchy
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function SubLayersTree(props: { mapLayer: StyleMapLayerSettings }) {
  const [placeholderLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:SubLayers.SearchPlaceholder"));
  const [allOnLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:SubLayers.AllOn"));
  const [allOffLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:SubLayers.AllOff"));
  const [mapLayer, setMapLayer] = React.useState(props.mapLayer);
  const [layerFilterString, setLayerFilterString] = React.useState<string>("");

  // create data provider to get some nodes to show in tree
  // `React.useMemo' is used avoid creating new object on each render cycle
  const dataProvider = React.useMemo(() => new SubLayersDataProvider(mapLayer), [mapLayer]);

  const {
    modelSource,
    nodeLoader,
    nodeHighlightingProps,
  } = useTreeFiltering(dataProvider, layerFilterString);

  // create custom event handler. It handles all tree event same as `TreeEventHandler` but additionally
  // it selects/deselects node when checkbox is checked/unchecked and vice versa.
  // `useDisposable` takes care of disposing old event handler when new is created in case 'nodeLoader' has changed
  // `React.useCallback` is used to avoid creating new callback that creates handler on each render
  const eventHandler = useDisposable(React.useCallback(() => new SubLayerCheckboxHandler(mapLayer, nodeLoader), [nodeLoader, mapLayer]));

  // get list of visible nodes to render in `ControlledTree`. This is a flat list of nodes in tree model.
  // `useVisibleTreeNodes` uses 'modelSource' to get flat list of nodes and listens for model changes to
  // re-render component with updated nodes list
  const visibleNodes = useVisibleTreeNodes(modelSource);

  const showAll = React.useCallback(async () => {
    const vp = IModelApp.viewManager.selectedView;
    const displayStyle = vp?.displayStyle;
    if (displayStyle && vp) {
      const indexInDisplayStyle = displayStyle ? displayStyle.findMapLayerIndexByNameAndUrl(mapLayer.name, mapLayer.url, mapLayer.isOverlay) : -1;
      displayStyle.changeMapSubLayerProps({ visible: true }, -1, indexInDisplayStyle, mapLayer.isOverlay);
      vp.invalidateRenderPlan();
      const updatedMapLayer = displayStyle.mapLayerAtIndex(indexInDisplayStyle, mapLayer.isOverlay);
      if (updatedMapLayer) {
        setMapLayer(getStyleMapLayerSettings(updatedMapLayer, mapLayer.isOverlay));
      }
    }
  }, [mapLayer]);

  const hideAll = React.useCallback(async () => {
    const vp = IModelApp.viewManager.selectedView;
    const displayStyle = vp?.displayStyle;
    if (displayStyle && vp) {
      const indexInDisplayStyle = displayStyle ? displayStyle.findMapLayerIndexByNameAndUrl(mapLayer.name, mapLayer.url, mapLayer.isOverlay) : -1;
      displayStyle.changeMapSubLayerProps({ visible: false }, -1, indexInDisplayStyle, mapLayer.isOverlay);
      const updatedMapLayer = displayStyle.mapLayerAtIndex(indexInDisplayStyle, mapLayer.isOverlay);
      if (updatedMapLayer) {
        setMapLayer(getStyleMapLayerSettings(updatedMapLayer, mapLayer.isOverlay));
      }
      vp.invalidateRenderPlan();
    }
  }, [mapLayer]);

  const handleFilterTextChanged = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setLayerFilterString(event.target.value);
  }, []);

  return <>
    <div className="map-manager-sublayer-tree">
      <Toolbar
        searchField={
          <Input type="text" className="map-manager-source-list-filter"
            placeholder={placeholderLabel}
            value={layerFilterString}
            onChange={handleFilterTextChanged} />
        }
      >
        {mapLayer.provider?.mutualExclusiveSubLayer ? undefined : [
          <button key="show-all-btn" title={allOnLabel} onClick={showAll}>
            <WebFontIcon iconName="icon-visibility" />
          </button>,
          <button key="hide-all-btn" title={allOffLabel} onClick={hideAll}>
            <WebFontIcon iconName="icon-visibility-hide-2" />
          </button>,
        ]}
      </Toolbar>
      <ControlledTree
        nodeLoader={nodeLoader}
        selectionMode={SelectionMode.None}
        treeEvents={eventHandler}
        visibleNodes={visibleNodes}
        treeRenderer={nodeWithEyeCheckboxTreeRenderer}
        nodeHighlightingProps={nodeHighlightingProps}
      />
    </div>
  </>;
}

/** TreeEventHandler derived class that handler processing changes to subLayer visibility */
class SubLayerCheckboxHandler extends TreeEventHandler {
  private _removeModelChangedListener: () => void;

  constructor(private _mapLayer: StyleMapLayerSettings, nodeLoader: AbstractTreeNodeLoaderWithProvider<TreeDataProvider>) {
    super({ modelSource: nodeLoader.modelSource, nodeLoader, collapsedChildrenDisposalEnabled: true });
    this._removeModelChangedListener = this.modelSource.onModelChanged.addListener(this.onModelChanged);
  }

  public override dispose() {
    this._removeModelChangedListener();
    super.dispose();
  }

  // Cascade state
  // Children on unnamed groups must get disabled in the tree view, because
  // they get rendered anyway.
  private cascadeStateToAllChildren(model: MutableTreeModel, parentId?: string) {
    const children = model.getChildren(parentId);
    if (children === undefined)
      return;

    for (const childID of children) {
      const childNode = childID ? model.getNode(childID) : undefined;

      if (childNode)
        this.syncNodeStateWithParent(model, childNode);

      // Drill down the tree.
      this.cascadeStateToAllChildren(model, childID);
    }
  }

  private applyMutualExclusiveState(model: MutableTreeModel, nodeId: string) {
    const changedNode = model.getNode(nodeId);
    if (changedNode?.checkbox.state === CheckBoxState.Off)
      return;

    for (const node of model.iterateTreeModelNodes()) {
      if (node.id === changedNode?.id)
        continue;

      if (node && node.checkbox.state === CheckBoxState.On)
        node.checkbox.state = CheckBoxState.Off;
    }
  }

  //-----------------------------------------------------------------------
  // Listen to model changes
  //------------------------------------------------------------------------
  // This is required because nodes are delay loaded in the model until
  // they are made visible (i.e. parent node is expanded).  So even though
  // you might have created nodes in the data provided with a proper
  // initial state, by the time it gets loaded, their state might have became
  // out of date in the TreeView's active model.  So whenever a node
  // is added, when must confirm its state matches the current model
  // (i.e. state of their parent.)
  public onModelChanged = (args: [TreeModel, TreeModelChanges]) => {
    this.modelSource.modifyModel((model) => {
      const addedNodes = args[1].addedNodeIds.map((id) => model.getNode(id));
      addedNodes.forEach((node) => {
        if (!node)
          return;

        this.syncNodeStateWithParent(model, node);
      });
    });
  };

  private static isUnnamedGroup(subLayer: MapSubLayerProps | undefined): boolean {
    if (!subLayer)
      return false;

    return (!subLayer.name || subLayer.name.length === 0) && (subLayer.children !== undefined && subLayer.children.length > 0);
  }

  // Ensure the state of changed node matches the state of its parent.
  private syncNodeStateWithParent(model: MutableTreeModel, changedNode: MutableTreeModelNode) {
    // Lookup node parent. If non exists, I assume thats the root node,
    // and it must have a proper initial state.
    const parentNode = changedNode.parentId ? model.getNode(changedNode.parentId) : undefined;
    if (!parentNode)
      return;

    if (!changedNode.checkbox)
      return; // don't see why this would happen, but if there is no checkbox, we cant do much here.

    const parentLayerId = undefined !== parentNode.item.extendedData?.subLayerId ? parentNode.item.extendedData?.subLayerId : parentNode.item.id;
    const parentSubLayer = this._mapLayer.subLayers?.find((subLayer) => subLayer.id === parentLayerId);

    // If parent is disabled, then children must be too.
    // Also, Non-visible unnamed group must have their children disabled (unamed groups have visibility inherence)
    if (parentNode.checkbox.isDisabled || (SubLayerCheckboxHandler.isUnnamedGroup(parentSubLayer) && parentNode.checkbox.state === CheckBoxState.Off)) {
      changedNode.checkbox.isDisabled = true;
      changedNode.checkbox.state = CheckBoxState.Off;
    } else {
      // Visibility state from StyleMapLayerSettings applies
      const subLayerId = undefined !== changedNode.item.extendedData?.subLayerId ? changedNode.item.extendedData?.subLayerId : changedNode.item.id;
      const foundSubLayer = this._mapLayer.subLayers?.find((subLayer) => subLayer.id === subLayerId);
      changedNode.checkbox.isDisabled = false;
      changedNode.checkbox.state = foundSubLayer?.visible ? CheckBoxState.On : CheckBoxState.Off;
    }
  }

  /** Changes nodes checkboxes states until event is handled or handler is disposed */
  public override onCheckboxStateChanged({ stateChanges }: TreeCheckboxStateChangeEventArgs) {
    // call base checkbox handling
    const baseHandling = super.onCheckboxStateChanged({ stateChanges });

    // subscribe to checkbox state changes to new checkbox states and do some additional work with them
    const selectionHandling = stateChanges.subscribe({
      next: (changes) => {
        const vp = IModelApp.viewManager.selectedView;
        const displayStyle = vp?.displayStyle;
        const indexInDisplayStyle = displayStyle ? displayStyle.findMapLayerIndexByNameAndUrl(this._mapLayer.name, this._mapLayer.url, this._mapLayer.isOverlay) : -1;
        changes.forEach((change) => {
          const isSelected = (change.newState === CheckBoxState.On);

          const subLayerId = undefined !== change.nodeItem.extendedData?.subLayerId ? change.nodeItem.extendedData?.subLayerId : change.nodeItem.id;

          // Get the previously visible node if any
          let prevVisibleLayer: MapSubLayerProps | undefined;
          if (this._mapLayer.provider?.mutualExclusiveSubLayer) {
            prevVisibleLayer = this._mapLayer.subLayers?.find((subLayer) => subLayer.visible && subLayer.id !== subLayerId);
          }

          // Update sublayer object, otherwise state would get out of sync with DisplayStyle each time the TreeView is re-rendered
          const foundSubLayer = this._mapLayer.subLayers?.find((subLayer) => subLayer.id === subLayerId);
          if (foundSubLayer)
            foundSubLayer.visible = isSelected;
          if (prevVisibleLayer?.visible)
            prevVisibleLayer.visible = false;

          // Update displaystyle state
          if (-1 !== indexInDisplayStyle && displayStyle) {
            if (prevVisibleLayer && prevVisibleLayer.id !== undefined)
              displayStyle.changeMapSubLayerProps({ visible: false }, prevVisibleLayer.id, indexInDisplayStyle, this._mapLayer.isOverlay);
            displayStyle.changeMapSubLayerProps({ visible: isSelected }, subLayerId, indexInDisplayStyle, this._mapLayer.isOverlay);
          }

          // Cascade state
          this.modelSource.modifyModel((model) => {
            if (this._mapLayer.provider?.mutualExclusiveSubLayer)
              this.applyMutualExclusiveState(model, change.nodeItem.id);
            this.cascadeStateToAllChildren(model, change.nodeItem.id);
          });
        });

        if (vp)
          vp.invalidateRenderPlan();
      },
    });
    // stop handling selection when checkboxes handling is stopped
    baseHandling?.add(selectionHandling);
    return baseHandling;
  }
}

/** Custom checkbox renderer that renders checkbox as an eye */
const eyeCheckboxRenderer = (props: NodeCheckboxRenderProps) => (
  <ImageCheckBox
    checked={props.checked}
    disabled={props.disabled}
    imageOn="icon-visibility"
    imageOff="icon-visibility-hide-2"
    onClick={props.onChange}
    tooltip={props.title}
  />
);

/** Custom node renderer. It uses default 'TreeNodeRenderer' but overrides default checkbox renderer to render checkbox as an eye */
const imageLoader = new TreeImageLoader();
const nodeWithEyeCheckboxRenderer = (props: TreeNodeRendererProps) => (
  <TreeNodeRenderer
    {...props}
    checkboxRenderer={eyeCheckboxRenderer}
    imageLoader={imageLoader}
  />
);

/** Custom tree renderer. It uses default `TreeRenderer` but overrides default node renderer to render node with custom checkbox */
const nodeWithEyeCheckboxTreeRenderer = (props: TreeRendererProps) => (
  <TreeRenderer
    {...props}
    nodeRenderer={nodeWithEyeCheckboxRenderer}
  />
);

function useTreeFiltering(
  dataProvider: ITreeDataProvider,
  filter: string,
) {
  const nodeLoader = useFilteredProvider(dataProvider, filter);
  const nodeHighlightingProps = useNodeHighlightingProps(filter);
  return {
    nodeLoader,
    modelSource: nodeLoader.modelSource,
    nodeHighlightingProps,
  };
}

function useFilteredProvider(
  dataProvider: ITreeDataProvider,
  filter: string,
) {
  const filteredProvider = React.useMemo(() => {
    return new FilteredTreeDataProvider(dataProvider, filter);
  }, [dataProvider, filter]);

  const nodeLoader = React.useMemo(() => {
    return new TreeNodeLoader(filteredProvider, new TreeModelSource());
  }, [filteredProvider]);

  return nodeLoader;
}

function useNodeHighlightingProps(
  filter: string,
) {
  const [nodeHighlightingProps, setNodeHighlightingProps] = React.useState<HighlightableTreeProps>();

  React.useEffect(() => {
    if (filter === "") {
      setNodeHighlightingProps(undefined);
      return;
    }
    setNodeHighlightingProps({
      searchText: filter,
      activeMatch: undefined,
    });
  }, [filter]);

  return nodeHighlightingProps;
}

class FullTreeHierarchy {
  private _dataProvider: ITreeDataProvider;
  private _hierarchy = new Map<string | undefined, DelayLoadedTreeNodeItem[]>();
  private _init: Promise<void>;

  public constructor(dataProvider: ITreeDataProvider) {
    this._dataProvider = dataProvider;

    this._init = (async () => {
      await this.initNode();
    })();
  }

  private async initNode(parent?: TreeNodeItem) {
    const nodes = await this._dataProvider.getNodes(parent);
    this._hierarchy.set(parent?.id, nodes);
    for (const node of nodes) {
      await this.initNode(node);
    }
  }

  public async getHierarchy() {
    await this._init;
    return this._hierarchy;
  }
}

class FilteredTreeHierarchy {
  private _fullHierarchy: FullTreeHierarchy;
  private _filter: string;
  private _filtered = new Map<string | undefined, DelayLoadedTreeNodeItem[]>();
  private _init: Promise<void>;

  public constructor(dataProvider: ITreeDataProvider, filter: string) {
    this._fullHierarchy = new FullTreeHierarchy(dataProvider);
    this._filter = filter;

    this._init = (async () => {
      await this.init();
    })();
  }

  private async init() {
    const hierarchy = await this._fullHierarchy.getHierarchy();
    if (this._filter === "") {
      this._filtered = hierarchy;
      return;
    }
    this.filterNodes(hierarchy);
  }

  /** Initializes `this._filtered` field. Returns a node if it matches a filter. */
  private filterNodes(hierarchy: Map<string | undefined, DelayLoadedTreeNodeItem[]>, current?: DelayLoadedTreeNodeItem): DelayLoadedTreeNodeItem | undefined {
    const matches = current ? this.matchesFilter(current) : false;
    const children = hierarchy.get(current?.id);
    if (!children)
      return matches ? current : undefined;

    const matchedChildren = new Array<DelayLoadedTreeNodeItem>();
    for (const child of children) {
      const matchedChild = this.filterNodes(hierarchy, child);
      matchedChild && matchedChildren.push(matchedChild);
    }

    const hasChildren = matchedChildren.length > 0;
    const included = matches || hasChildren;
    let filtered: DelayLoadedTreeNodeItem | undefined;
    if (included) {
      this._filtered.set(current?.id, matchedChildren);

      // Return a modified copy of current node (to persist initial hierarchy when filter is cleared).
      if (current) {
        filtered = {
          ...current,
          hasChildren,
          autoExpand: hasChildren ? true : current.autoExpand,
        };
      }
    }
    return filtered;
  }

  private matchesFilter(node: TreeNodeItem) {
    if (node.label.value.valueFormat !== PropertyValueFormat.Primitive)
      return false;

    const value = node.label.value.displayValue?.toLowerCase();
    if (!value)
      return false;
    return value.includes(this._filter.toLowerCase());
  }

  public async getHierarchy() {
    await this._init;
    return this._filtered;
  }
}

class FilteredTreeDataProvider implements ITreeDataProvider {
  private _hierarchy: FilteredTreeHierarchy;

  public constructor(
    parentDataProvider: ITreeDataProvider,
    filter: string,
  ) {
    this._hierarchy = new FilteredTreeHierarchy(parentDataProvider, filter);
  }

  public async getNodes(parent?: TreeNodeItem) {
    const hierarchy = await this._hierarchy.getHierarchy();
    const nodes = hierarchy.get(parent?.id);
    return nodes || [];
  }

  public async getNodesCount(parent?: TreeNodeItem) {
    const hierarchy = await this._hierarchy.getHierarchy();
    const nodes = hierarchy.get(parent?.id);
    return nodes?.length || 0;
  }
}
