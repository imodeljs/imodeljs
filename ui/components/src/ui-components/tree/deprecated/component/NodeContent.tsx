/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import "./NodeContent.scss";
import classnames from "classnames";
import * as React from "react";
import { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { CommonProps, shallowDiffers, TreeNodePlaceholder } from "@bentley/ui-core";
import { ItemStyle, ItemStyleProvider } from "../../../properties/ItemStyle";
import { PropertyContainerType, PropertyValueRendererContext, PropertyValueRendererManager } from "../../../properties/ValueRendererManager";
import { UiComponents } from "../../../UiComponents";
import { HighlightableTreeNodeProps, HighlightingEngine } from "../../HighlightingEngine";
import { TreeNodeItem } from "../../TreeDataProvider";
import { CellEditingEngine } from "../CellEditingEngine";
import { BeInspireTreeNode } from "./BeInspireTree";

/* eslint-disable deprecation/deprecation */

/** Properties for [[TreeNodeContent]] component
 * @internal @deprecated
 */
export interface TreeNodeContentProps extends CommonProps {
  node: BeInspireTreeNode<TreeNodeItem>;
  showDescription?: boolean;
  highlightProps?: HighlightableTreeNodeProps;
  valueRendererManager: PropertyValueRendererManager;
  cellEditing?: CellEditingEngine;

  /**
   * Called when all of the component tasks are done.
   * There are 3 different conditions:
   * * Props and node did not update so there is no need to render.
   * * Provided label function was synchronous and the render finished.
   * * Provided label function was asynchronous and the second render finished.
   */
  onFinalRenderComplete?: (renderId: string) => void;
  /**
   * Id specified by the parent component to identify all
   * nodes rendered at one request
   */
  renderId?: string;
}

/** @internal @deprecated */
export interface TreeNodeContentState {
  label: React.ReactNode;
  renderInfo?: {
    timestamp: number;
    counter: number;
  };
}

/** React component for displaying [[TreeNode]] label
 * @internal @deprecated
 */
export class TreeNodeContent extends React.Component<TreeNodeContentProps, TreeNodeContentState> {
  public constructor(props: TreeNodeContentProps) {
    super(props);
    this.state = {
      label: <TreeNodePlaceholder level={0} data-testid={"node-label-placeholder"} />,
    };
  }

  private getStyle(style?: ItemStyle, isSelected?: boolean): React.CSSProperties {
    return ItemStyleProvider.createStyle(style ? /* istanbul ignore next */ style : {}, isSelected);
  }

  private nodeToPropertyRecord(node: BeInspireTreeNode<TreeNodeItem>) {
    const value: PrimitiveValue = {
      displayValue: node.text,
      value: node.text,
      valueFormat: PropertyValueFormat.Primitive,
    };
    const property: PropertyDescription = {
      displayLabel: UiComponents.translate("general.label"),
      typename: "string",
      name: "node_label",
    };

    return new PropertyRecord(value, property);
  }

  private getLabel(props: TreeNodeContentProps) {
    // handle filtered matches' highlighting
    let labelElement: React.ReactNode = props.node.text;
    if (props.highlightProps)
      labelElement = HighlightingEngine.renderNodeLabel(props.node.text, props.highlightProps);

    // handle custom cell rendering
    const context: PropertyValueRendererContext = {
      containerType: PropertyContainerType.Tree,
      decoratedTextElement: labelElement,
      style: props.node.payload ? this.getStyle(props.node.payload.style, props.node.selected()) : /* istanbul ignore next */ undefined,
    };

    const nodeRecord = this.nodeToPropertyRecord(props.node);
    return props.valueRendererManager.render(nodeRecord, context);
  }

  private _onLabelStateChanged = () => {
    if (this.props.renderId && this.props.onFinalRenderComplete)
      this.props.onFinalRenderComplete(this.props.renderId);
  };

  private updateLabel(props: TreeNodeContentProps) {
    const label = this.getLabel(props);
    this.setState({ label }, this._onLabelStateChanged);
  }

  public override componentDidMount() {
    this.updateLabel(this.props);
    this.setState((_, props) => ({ renderInfo: createRenderInfo(props.node) }));
  }

  private static doPropsDiffer(props1: TreeNodeContentProps, props2: TreeNodeContentProps) {
    return shallowDiffers(props1.highlightProps, props2.highlightProps)
      || props1.valueRendererManager !== props2.valueRendererManager
      || props1.cellEditing !== props2.cellEditing
      || props1.showDescription !== props2.showDescription;
  }

  private static needsLabelUpdate(state: TreeNodeContentState, prevProps: TreeNodeContentProps, nextProps: TreeNodeContentProps) {
    if (this.doPropsDiffer(prevProps, nextProps)) {
      return true;
    }
    if (nextProps.node.itree!.dirtyTimestamp && (!state.renderInfo || state.renderInfo.timestamp < nextProps.node.itree!.dirtyTimestamp || state.renderInfo.counter < nextProps.node.itree!.dirtyCounter!)) {
      return true;
    }
    return false;
  }

  public override componentDidUpdate(prevProps: TreeNodeContentProps) {
    if (TreeNodeContent.needsLabelUpdate(this.state, prevProps, this.props)) {
      this.updateLabel(this.props);
    }

    const renderInfo = createRenderInfo(this.props.node);
    // istanbul ignore else
    if (renderInfo !== this.state.renderInfo)
      this.setState({ renderInfo });
  }

  public override shouldComponentUpdate(nextProps: TreeNodeContentProps, nextState: TreeNodeContentState) {
    if (this.state.label !== nextState.label || TreeNodeContent.needsLabelUpdate(nextState, this.props, nextProps))
      return true;

    // istanbul ignore else
    if (nextState.label) {
      // This is an anti-pattern, but it's main purpose is for testing.
      // We need to know when all of the nodes have finished rendering
      // and asynchronous updates make it very difficult.
      // If it should not render, let the parent know that it's
      // already fully rendered
      if (nextProps.renderId && nextProps.onFinalRenderComplete)
        nextProps.onFinalRenderComplete(nextProps.renderId);
    }

    return false;
  }

  public override render() {
    // handle cell editing
    let editor: JSX.Element | undefined;
    if (this.props.cellEditing && this.props.cellEditing.isEditingEnabled(this.props.node)) {
      // if cell editing is enabled, return editor instead of the label
      const style = this.props.node.payload ? this.getStyle(this.props.node.payload.style, this.props.node.selected()) : /* istanbul ignore next */ undefined;
      editor = this.props.cellEditing.renderEditor(this.props.node, style);
    }

    const isDescriptionEnabled = this.props.node.payload && this.props.node.payload.description && this.props.showDescription;

    const containerClassName = classnames(
      "components-tree-node-content",
      isDescriptionEnabled ? "with-description" : undefined,
      this.props.className,
    );

    const descriptionClassName = classnames(
      "components-tree-node-description",
      editor ? "with-editor" : undefined,
    );

    return (
      <div className={containerClassName} style={this.props.style}>
        {editor ? editor : this.state.label}
        {isDescriptionEnabled ?
          <div className={descriptionClassName}>
            {this.props.node.payload!.description}
          </div>
          : undefined}
      </div>
    );
  }
}

const createRenderInfo = (node: BeInspireTreeNode<TreeNodeItem>) => ({
  timestamp: node.itree!.dirtyTimestamp || 0,
  counter: node.itree!.dirtyCounter || 0,
});
