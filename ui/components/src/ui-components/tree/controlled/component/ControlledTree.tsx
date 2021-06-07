/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import * as React from "react";
import { CommonProps, FillCentered, SpinnerSize } from "@bentley/ui-core";
import { DelayedSpinner } from "../../../common/DelayedSpinner";
import { SelectionMode } from "../../../common/selection/SelectionModes";
import { UiComponents } from "../../../UiComponents";
import { HighlightableTreeProps } from "../../HighlightingEngine";
import { TreeImageLoader } from "../../ImageLoader";
import { toRxjsObservable } from "../Observable";
import { TreeEventDispatcher } from "../TreeEventDispatcher";
import { TreeEvents } from "../TreeEvents";
import { isTreeModelNode, TreeModelNode, TreeModelNodePlaceholder, VisibleTreeNodes } from "../TreeModel";
import { ITreeNodeLoader } from "../TreeNodeLoader";
import { TreeNodeRenderer, TreeNodeRendererProps } from "./TreeNodeRenderer";
import { RenderedItemsRange, TreeRenderer, TreeRendererProps } from "./TreeRenderer";

/**
 * Properties for [[ControlledTree]]
 * @public
 */
export interface ControlledTreeProps extends CommonProps {
  /** Flat list of nodes to be rendered in tree. */
  visibleNodes: VisibleTreeNodes;
  /** Node loader used to load root nodes and placeholder nodes. */
  nodeLoader: ITreeNodeLoader;
  /** Tree events handler. */
  treeEvents: TreeEvents;
  /** Mode of nodes' selection in tree. */
  selectionMode: SelectionMode;
  /**
   * Specifies whether to show node description or not. It is used in default node renderer and to determine node height.
   * If custom node renderer and node height callbacks are used it does nothing.
   */
  descriptionsEnabled?: boolean;
  /**
   * Specifies whether to show node icon or not. It is used in default node renderer.
   * If custom node renderer is used it does nothing.
   */
  iconsEnabled?: boolean;
  /**
   * Used to highlight matches when filtering tree.
   * It is passed to treeRenderer.
   */
  nodeHighlightingProps?: HighlightableTreeProps;
  /** Custom renderer to be used to render a tree. */
  treeRenderer?: (props: TreeRendererProps) => React.ReactElement;
  /** Custom renderer to be used while root nodes is loading. */
  spinnerRenderer?: () => React.ReactElement;
  /** Custom renderer to be used when there is no data to show in tree. */
  noDataRenderer?: () => React.ReactElement;
  /**
   * Callback that is invoked when rendered items range changes.
   * @alpha
   */
  onItemsRendered?: (items: RenderedItemsRange) => void;
}

/**
 * React tree component which rendering is fully controlled from outside.
 * @public
 */
export function ControlledTree(props: ControlledTreeProps) {
  const nodeHeight = useNodeHeight(!!props.descriptionsEnabled);
  const imageLoader = React.useMemo(() => new TreeImageLoader(), []);
  const nodeRenderer = React.useCallback((nodeProps: TreeNodeRendererProps) => (
    <TreeNodeRenderer
      {...nodeProps}
      descriptionEnabled={props.descriptionsEnabled}
      imageLoader={props.iconsEnabled ? imageLoader : undefined}
    />
  ), [props.descriptionsEnabled, props.iconsEnabled, imageLoader]);

  const eventDispatcher = useEventDispatcher(props.nodeLoader, props.treeEvents, props.selectionMode, props.visibleNodes);

  const treeProps: TreeRendererProps = React.useMemo(() => ({
    nodeRenderer,
    nodeHeight,
    treeActions: eventDispatcher,
    nodeLoader: props.nodeLoader,
    visibleNodes: props.visibleNodes,
    nodeHighlightingProps: props.nodeHighlightingProps,
    onItemsRendered: props.onItemsRendered,
  }), [nodeRenderer, nodeHeight, eventDispatcher, props.nodeLoader, props.visibleNodes, props.nodeHighlightingProps, props.onItemsRendered]);

  const loading = useRootNodeLoader(props.visibleNodes, props.nodeLoader);
  const noData = props.visibleNodes.getNumRootNodes() === 0;
  return (
    <Loader loading={loading} noData={noData} spinnerRenderer={props.spinnerRenderer} noDataRenderer={props.noDataRenderer}>
      {props.treeRenderer ? props.treeRenderer(treeProps) : <TreeRenderer {...treeProps} />}
    </Loader>
  );
}

function useRootNodeLoader(visibleNodes: VisibleTreeNodes, nodeLoader: ITreeNodeLoader): boolean {
  React.useEffect(() => {
    if (visibleNodes.getNumRootNodes() === undefined) {
      const subscription = toRxjsObservable(nodeLoader.loadNode(visibleNodes.getModel().getRootNode(), 0)).subscribe();
      return () => subscription.unsubscribe();
    }

    return () => { };
  }, [visibleNodes, nodeLoader]);

  return visibleNodes.getNumRootNodes() === undefined;
}

function useEventDispatcher(nodeLoader: ITreeNodeLoader, treeEvents: TreeEvents, selectionMode: SelectionMode, visibleNodes: VisibleTreeNodes) {
  /* istanbul ignore next */
  const getVisibleNodes = React.useCallback(() => visibleNodes, [visibleNodes]);
  const eventDispatcher = React.useMemo(() => new TreeEventDispatcher(treeEvents, nodeLoader, selectionMode), [treeEvents, nodeLoader, selectionMode]);

  React.useEffect(() => {
    eventDispatcher.setVisibleNodes(getVisibleNodes);
  }, [eventDispatcher, getVisibleNodes]);

  return eventDispatcher;
}

interface LoaderProps {
  loading: boolean;
  noData: boolean;
  spinnerRenderer?: () => React.ReactElement;
  noDataRenderer?: () => React.ReactElement;
  children: JSX.Element;
}

function Loader(props: LoaderProps) {
  if (props.loading) {
    return props.spinnerRenderer
      ? props.spinnerRenderer()
      : (
        <div className="components-controlledTree-loader">
          <DelayedSpinner size={SpinnerSize.Large} />
        </div>
      );
  }
  if (props.noData) {
    return props.noDataRenderer
      ? props.noDataRenderer()
      : (
        <FillCentered>
          <p className="components-controlledTree-errorMessage">
            {UiComponents.translate("general.noData")}
          </p>
        </FillCentered>
      );
  }

  return props.children;
}

function useNodeHeight(
  descriptionsEnabled: boolean,
): (node: TreeModelNode | TreeModelNodePlaceholder) => number {
  return React.useCallback(
    (node: TreeModelNode | TreeModelNodePlaceholder): number => {
      const contentHeight = (isTreeModelNode(node) && descriptionsEnabled && node && node.description) ? 43 : 24;
      const borderSize = 1;
      // Not counting node's border size twice because we want neighboring borders to overlap
      return contentHeight + borderSize;
    },
    [descriptionsEnabled],
  );
}
