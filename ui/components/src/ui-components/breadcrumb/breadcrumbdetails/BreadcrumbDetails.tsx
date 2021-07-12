/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Breadcrumb
 */

import classnames from "classnames";
import * as React from "react";
import { using } from "@bentley/bentleyjs-core";
import { CommonProps } from "@bentley/ui-core";
import { getPropertyRecordAsString } from "../../common/getPropertyRecordAsString";
import { Table, TableProps } from "../../table/component/Table";
import { ColumnDescription, RowItem, TableDataProvider } from "../../table/TableDataProvider";
import {
  BeInspireTree, BeInspireTreeEvent, BeInspireTreeNode, BeInspireTreeNodeConfig, BeInspireTreeNodes, MapPayloadToInspireNodeCallback, toNodes,
} from "../../tree/deprecated/component/BeInspireTree";
import { DelayLoadedTreeNodeItem, ImmediatelyLoadedTreeNodeItem, isTreeDataProviderInterface, TreeNodeItem } from "../../tree/TreeDataProvider";
import { UiComponents } from "../../UiComponents";
import { BreadcrumbPath, BreadcrumbUpdateEventArgs } from "../BreadcrumbPath";
import { BreadcrumbTreeUtils, DataRowItem } from "../BreadcrumbTreeUtils";

/* eslint-disable deprecation/deprecation */

/** Properties for the [[BreadcrumbDetails]] component
 * @beta
 */
export interface BreadcrumbDetailsProps extends CommonProps {
  /** Path data object shared by Breadcrumb component */
  path: BreadcrumbPath;
  columns?: ColumnDescription[];
  renderTable?: (props: TableProps, node: TreeNodeItem | undefined, children: TreeNodeItem[]) => React.ReactNode;
  /** Callback triggered when child node is loaded with an asynchronous dataProvider. */
  onChildrenLoaded?: (parent: TreeNodeItem, children: TreeNodeItem[]) => void;
  /** Callback triggered when root nodes are loaded with an asynchronous dataProvider. */
  onRootNodesLoaded?: (nodes: TreeNodeItem[]) => void;
  /** @internal */
  onRender?: () => void;
}

/** @internal */
interface BreadcrumbDetailsState {
  table?: TableDataProvider;
  childNodes?: TreeNodeItem[];
  modelReady: boolean;
}

/**
 * A Table containing all children of tree node specified in path.
 * Used in conjunction with [[Breadcrumb]] to see children of current path.
 * @beta
 */
export class BreadcrumbDetails extends React.Component<BreadcrumbDetailsProps, BreadcrumbDetailsState> {
  private _tree!: BeInspireTree<TreeNodeItem>;
  private _mounted: boolean = false;

  public override readonly state: BreadcrumbDetailsState;

  /** @internal */
  constructor(props: BreadcrumbDetailsProps) {
    super(props);
    this.state = {
      modelReady: isTreeDataProviderInterface(props.path.getDataProvider()) ? false : true,
    };
    this._recreateTree();
  }

  /** @internal */
  public override componentDidMount() {
    this._mounted = true;
    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();
    const dataProvider = this.props.path.getDataProvider();
    const node = this.props.path.getCurrentNode();
    this._updateTree(node ? this._tree.node(node.id) : undefined);
    if (isTreeDataProviderInterface(dataProvider) && dataProvider.onTreeNodeChanged)
      dataProvider.onTreeNodeChanged.addListener(this._treeChange);
    this.props.path.BreadcrumbUpdateEvent.addListener(this._pathChange);
  }

  /** @internal */
  public override componentWillUnmount() {
    this._mounted = false;
    this._tree.removeAllListeners();
    const dataProvider = this.props.path.getDataProvider();
    if (isTreeDataProviderInterface(dataProvider) && dataProvider.onTreeNodeChanged)
      dataProvider.onTreeNodeChanged.removeListener(this._treeChange);
    this.props.path.BreadcrumbUpdateEvent.removeListener(this._pathChange);
  }

  /** @internal */
  public override componentDidUpdate(prevProps: BreadcrumbDetailsProps) {
    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();
    if (!this.props.path.BreadcrumbUpdateEvent.has(this._pathChange)) {
      this.props.path.BreadcrumbUpdateEvent.addListener(this._pathChange);
      prevProps.path.BreadcrumbUpdateEvent.removeListener(this._pathChange);
    }
  }

  private _recreateTree() {
    this._tree = new BeInspireTree<TreeNodeItem>({
      dataProvider: this.props.path.getDataProvider(),
      mapPayloadToInspireNodeConfig: BreadcrumbDetails.inspireNodeFromTreeNodeItem,
    });
    this._tree.on(BeInspireTreeEvent.ModelLoaded, this._onModelLoaded);
    this._tree.on(BeInspireTreeEvent.ChildrenLoaded, this._onChildrenLoaded);
    this._tree.ready.then(this._onModelReady); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  /** @internal */
  public override shouldComponentUpdate(nextProps: BreadcrumbDetailsProps, nextState: BreadcrumbDetailsState): boolean {
    if (this.state.modelReady !== nextState.modelReady) {
      // always render when state.modelReady changes
      return true;
    }

    // istanbul ignore if
    if (!nextState.modelReady) {
      // if we got here and model is not ready - don't render
      return false;
    }

    const cNode = nextProps.path.getCurrentNode();
    const current = cNode ? this._tree.node(cNode.id) : undefined;
    // otherwise, render when any of the following props / state change
    return this.props.renderTable !== nextProps.renderTable
      || this.props.path !== nextProps.path
      || this.state.table !== nextState.table
      || (current !== undefined && /* istanbul ignore next */ current.isDirty());
  }

  private _onModelLoaded = (rootNodes: BeInspireTreeNodes<TreeNodeItem>) => {
    const node = this.props.path.getCurrentNode();
    if (node === undefined)
      this._updateTree(undefined);
    if (this.props.onRootNodesLoaded)
      this.props.onRootNodesLoaded(rootNodes.map((n) => n.payload!));
  };

  private _onChildrenLoaded = (parentNode: BeInspireTreeNode<TreeNodeItem>) => {
    const node = this.props.path.getCurrentNode();
    if (node !== undefined) {
      const iNode = this._tree.node(node.id);
      this._updateTree(iNode);
    }
    const children = parentNode.getChildren();
    if (this.props.onChildrenLoaded)
      this.props.onChildrenLoaded(parentNode.payload!, toNodes<TreeNodeItem>(children).map((c) => c.payload!));
  };

  private _onModelReady = () => {
    // istanbul ignore else
    if (this._mounted)
      this.setState({ modelReady: true });
  };

  private _onTreeNodeChanged = (_items: Array<TreeNodeItem | undefined>) => {
    using((this._tree as any).pauseRendering(), async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
      await this._tree.reload();
    });
  };

  private static inspireNodeFromTreeNodeItem(item: TreeNodeItem, remapper: MapPayloadToInspireNodeCallback<TreeNodeItem>): BeInspireTreeNodeConfig {
    const node: BeInspireTreeNodeConfig = {
      id: item.id,
      text: getPropertyRecordAsString(item.label),
      itree: {
        state: { collapsed: false },
      },
    };
    if (item.icon)
      node.itree!.icon = item.icon;
    if ((item as DelayLoadedTreeNodeItem).hasChildren)
      node.children = true;
    else if ((item as ImmediatelyLoadedTreeNodeItem).children)
      node.children = (item as ImmediatelyLoadedTreeNodeItem).children!.map((p) => remapper(p, remapper));
    return node;
  }

  private _treeChange = () => {
    const currentNode = this.props.path.getCurrentNode();
    this._updateTree(currentNode ? this._tree.node(currentNode.id) : undefined);
  };
  private _pathChange = (args: BreadcrumbUpdateEventArgs) => {
    this._updateTree(args.currentNode ? this._tree.node(args.currentNode.id) : undefined);
    if (isTreeDataProviderInterface(args.oldDataProvider) && args.oldDataProvider.onTreeNodeChanged) {
      // unsubscribe from previous data provider `onTreeNodeChanged` events
      args.oldDataProvider.onTreeNodeChanged.removeListener(this._onTreeNodeChanged);
    }
    if (isTreeDataProviderInterface(args.dataProvider) && args.dataProvider.onTreeNodeChanged) {
      // subscribe for new data provider `onTreeNodeChanged` events
      args.dataProvider.onTreeNodeChanged.addListener(this._onTreeNodeChanged);
    }
    if (args.dataProvider !== args.oldDataProvider) {
      // istanbul ignore else
      if (this._mounted)
        this.setState({ modelReady: false }, () => {
          this._recreateTree();
        });
    }
  };
  private _updateTree = (node: BeInspireTreeNode<TreeNodeItem> | undefined) => {
    const childNodes = (node ? toNodes<TreeNodeItem>(node.getChildren()) : this._tree.nodes()).map((child) => child.payload!);
    if (childNodes.length === 0) {
      const parents = node ? toNodes<TreeNodeItem>(node.getParents()).map((child) => child.payload!) : [];
      parents.reverse();
      if (parents.length > 1)
        this.props.path.setCurrentNode(parents[parents.length - 2]);
      else if (parents.length === 1)
        this.props.path.setCurrentNode(undefined);
    }
    const table = BreadcrumbTreeUtils.aliasNodeListToTableDataProvider(childNodes, this.props.columns || [
      { key: "icon", label: UiComponents.translate("breadcrumb.icon"), icon: true },
      { key: "label", label: UiComponents.translate("breadcrumb.name") },
      { key: "description", label: UiComponents.translate("breadcrumb.description") },
    ], this.props.path.getDataProvider());
    // istanbul ignore else hard to control whether mounted or not
    if (this._mounted)
      this.setState({ table, childNodes });
  };

  /** @internal */
  public override render(): React.ReactNode {
    const node = this.props.path.getCurrentNode();
    if (node) {
      const iNode = this._tree.node(node.id);
      if (iNode) {
        iNode.setDirty(false);
      }
    }
    const { childNodes } = this.state;
    const renderTable = this.props.renderTable ? this.props.renderTable : this.renderTable;
    return (
      <div className={classnames("components-breadcrumb-details", this.props.className)} style={this.props.style}>
        {
          this.state.table && childNodes &&
          renderTable({
            dataProvider: this.state.table,
            onRowsSelected: async (rowIterator: AsyncIterableIterator<RowItem>, replace: boolean) => {
              const iteratorResult = await rowIterator.next();
              // istanbul ignore else should always be false
              if (!iteratorResult.done) {
                const row = iteratorResult.value as DataRowItem;
                this.props.path.setCurrentNode(row._node);
              }
              return replace;
            },
          }, node, childNodes)
        }
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private renderTable = (props: TableProps, _node: TreeNodeItem | undefined, _children: TreeNodeItem[]) => {
    return <Table {...props} onRender={this.props.onRender} />;
  };
}
