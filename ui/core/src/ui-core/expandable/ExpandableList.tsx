/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Expandable
 */

import "./ExpandableList.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";

/** Properties for [[ExpandableList]] component
 * @public
 */
export interface ExpandableListProps extends CommonProps {
  /** Index of the default active block */
  defaultActiveBlock?: number;
  /** Indicates whether to allow only one expanded block */
  singleExpandOnly?: boolean;
  /** Indicates whether the single expanded block is collapsible */
  singleIsCollapsible?: boolean;
}

/** @internal */
interface ExpandableListState {
  activeBlock: number;
}

/**
 * ExpandableList React component is a container for ExpandableBlock components.
 * @public
 */
export class ExpandableList extends React.PureComponent<ExpandableListProps, ExpandableListState> {

  constructor(props: ExpandableListProps) {
    super(props);

    this.state = { activeBlock: this.props.defaultActiveBlock! };
  }

  public static defaultProps: Partial<ExpandableListProps> = {
    singleExpandOnly: false,
    defaultActiveBlock: 0,
  };

  // set active block
  private _handleBlockClick = (index: number, onClick: () => any) => {
    let activeBlock = index;

    if (this.props.singleIsCollapsible && index === this.state.activeBlock)
      activeBlock = -1;

    this.setState({ activeBlock });

    // istanbul ignore else
    if (onClick) {
      onClick(); // fire the ExpandableBlock onClick
    }
  };

  private renderBlocks() {
    return React.Children.map(this.props.children, (child: any, i) => {
      return React.cloneElement(child, {
        key: i,
        isExpanded: (this.props.singleExpandOnly) ? i === this.state.activeBlock : child.props.isExpanded,
        onClick: this._handleBlockClick.bind(this, i, child.props.onClick),
      });
    });
  }

  /** @internal */
  public override componentDidUpdate(prevProps: ExpandableListProps) {
    if (this.props.defaultActiveBlock !== prevProps.defaultActiveBlock && this.props.defaultActiveBlock !== this.state.activeBlock) {
      this.setState((_, props) => ({ activeBlock: props.defaultActiveBlock! }));
    }
  }

  public override render(): JSX.Element {
    return (
      <div className={classnames("uicore-expandable-blocks-list", this.props.className)} style={this.props.style}>
        {this.renderBlocks()}
      </div>
    );
  }
}
