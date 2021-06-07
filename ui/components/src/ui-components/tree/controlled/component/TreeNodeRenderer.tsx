/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import * as React from "react";
import { CommonProps, NodeCheckboxProps, NodeCheckboxRenderer, TreeNode } from "@bentley/ui-core";
import { ImageRenderer } from "../../../common/ImageRenderer";
import { PropertyValueRendererManager } from "../../../properties/ValueRendererManager";
import { HighlightableTreeNodeProps } from "../../HighlightingEngine";
import { ITreeImageLoader } from "../../ImageLoader";
import { TreeComponentTestId } from "../../TreeComponentTestId";
import { TreeActions } from "../TreeActions";
import { CheckBoxInfo, TreeModelNode } from "../TreeModel";
import { TreeNodeContent } from "./NodeContent";
import { TreeNodeEditorRenderer } from "./TreeNodeEditor";

/**
 * Properties for [[TreeNodeRenderer]].
 * @public
 */
export interface TreeNodeRendererProps extends CommonProps {
  node: TreeModelNode;
  treeActions: TreeActions;

  /** Properties used to highlight matches when tree is filtered. */
  nodeHighlightProps?: HighlightableTreeNodeProps;

  /**
   * Callback used to detect when label is rendered. It is used by TreeRenderer for scrolling to active match.
   * @internal
   */
  onLabelRendered?: (node: TreeModelNode) => void;
}

/**
 * Extended properties for [[TreeNodeRenderer]].
 * @beta
 */
export interface ExtendedTreeNodeRendererProps extends TreeNodeRendererProps {
  /** Callback to render custom checkbox. */
  checkboxRenderer?: NodeCheckboxRenderer;
  /** Callback to render custom node editor when node is in editing mode. */
  nodeEditorRenderer?: TreeNodeEditorRenderer;
  /** Specifies whether to show descriptions or not. */
  descriptionEnabled?: boolean;
  /** Image loader used to load icon. */
  imageLoader?: ITreeImageLoader;
}

/**
 * Default component for rendering tree node.
 * @beta
 */
export const TreeNodeRenderer = React.memo((props: ExtendedTreeNodeRendererProps) => { // eslint-disable-line @typescript-eslint/naming-convention
  const label = (
    <TreeNodeContent
      key={props.node.id}
      node={props.node}
      showDescription={props.descriptionEnabled}
      valueRendererManager={PropertyValueRendererManager.defaultManager}
      highlightProps={props.nodeHighlightProps}
      onLabelRendered={props.onLabelRendered}
      nodeEditorRenderer={props.nodeEditorRenderer}
    />
  );

  function onExpansionToggle() {
    if (props.node.isExpanded)
      props.treeActions.onNodeCollapsed(props.node.id);
    else
      props.treeActions.onNodeExpanded(props.node.id);
  }

  const createCheckboxProps = (checkboxInfo: CheckBoxInfo): NodeCheckboxProps => ({
    state: checkboxInfo.state,
    tooltip: checkboxInfo.tooltip,
    isDisabled: checkboxInfo.isDisabled,
    onClick: (newState) => props.treeActions.onNodeCheckboxClicked(props.node.id, newState),
  });

  return (
    <TreeNode
      data-testid={TreeComponentTestId.Node}
      className={props.className}
      checkboxProps={props.node.checkbox.isVisible ? createCheckboxProps(props.node.checkbox) : undefined}
      style={props.style}
      isExpanded={props.node.isExpanded}
      isSelected={props.node.isSelected}
      isLoading={props.node.isLoading}
      isLeaf={props.node.numChildren === 0}
      icon={props.imageLoader ? <TreeNodeIcon node={props.node} imageLoader={props.imageLoader} /> : undefined}
      label={label}
      level={props.node.depth}
      onClick={(event) => props.treeActions.onNodeClicked(props.node.id, event)}
      onMouseDown={() => props.treeActions.onNodeMouseDown(props.node.id)}
      onMouseMove={() => props.treeActions.onNodeMouseMove(props.node.id)}
      onClickExpansionToggle={onExpansionToggle}
      renderOverrides={{ renderCheckbox: props.checkboxRenderer }}
    />
  );
});

interface TreeNodeIconProps {
  node: TreeModelNode;
  imageLoader: ITreeImageLoader;
}

function TreeNodeIcon(props: TreeNodeIconProps) {
  const { imageLoader, node } = props;
  const image = imageLoader.load(node.item);

  if (!image)
    return null;

  const renderer = new ImageRenderer();
  return <>{renderer.render(image)}</>;
}
