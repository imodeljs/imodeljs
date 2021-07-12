/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Expandable
 */

import "./ExpandableBlock.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";

/** Properties for the [[ExpandableBlock]] React component
 * @public
 */
export interface ExpandableBlockProps extends CommonProps {
  /** Label */
  title: string|JSX.Element;
  /** Indicates whether the ExpandableBlock is expanded */
  isExpanded: boolean;
  /** Callback function for click event */
  onClick: React.MouseEventHandler<HTMLDivElement>;
  /** Callback function for key press event */
  onKeyPress?: React.KeyboardEventHandler<HTMLDivElement>;
  /** Callback function for key down event */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  /** Additional text displayed in the block below the label and in a smaller font size */
  caption?: string;
  /** Custom tooltip for the component.
   * @beta
   */
  tooltip?: string;
}

/** ExpandableBlock React component is a container that shows and hides child content.
 * @public
 */
export class ExpandableBlock extends React.PureComponent<ExpandableBlockProps> {

  public override render() {
    const cName = classnames(
      "uicore-expandable-blocks-block",
      this.props.caption && "with-caption",
      this.props.isExpanded ? "is-expanded" : "is-collapsed",
      this.props.className,
    );
    const ariaExpanded = this.props.isExpanded ? "true" : "false";
    const tabIndex = (this.props.onKeyPress || this.props.onKeyDown) ? 0 : undefined;

    const title = this.props.tooltip ?? (typeof this.props.title == "string" ? this.props.title : undefined);

    return (
      <div className={cName} style={this.props.style}>
        <div role="button" aria-expanded={ariaExpanded} className="header" onClick={this.props.onClick}
          onKeyPress={this.props.onKeyPress} onKeyDown={this.props.onKeyDown} tabIndex={tabIndex}>
          <div className="icon-container">
            <i className="icon icon-chevron-right" />
          </div>
          {this.props.caption &&
            <div className="caption" title={this.props.caption}>
              {this.props.caption}
            </div>
          }
          <div className="title" title={title}>
            {this.props.title}
          </div>
        </div>
        <div className="content">
          {this.props.isExpanded && this.props.children}
        </div>
      </div>
    );
  }
}
