/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import "./PropertyLabelRenderer.scss";
import * as React from "react";
import { PrimitivePropertyLabelRendererProps } from "./PrimitivePropertyLabelRenderer";
import { PropertyLabelRenderer } from "./PropertyLabelRenderer";

/** Properties for the [[NonPrimitivePropertyLabelRenderer]] React component
 * @public
 */
export interface NonPrimitivePropertyLabelRendererProps extends PrimitivePropertyLabelRendererProps {
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

/**
 * A React component that renders a non-primitive property label.
 * It renders an animated arrow with text which expands when label is clicked.
 * @public
 */
export class NonPrimitivePropertyLabelRenderer extends React.PureComponent<NonPrimitivePropertyLabelRendererProps> {
  private _onClick = () => {
    if (this.props.isExpanded)
      this.props.onCollapse();
    else
      this.props.onExpand();
  };

  public override render() {
    return (
      <div
        style={PropertyLabelRenderer.getStyle(this.props.offset)}
        className={`components-nonprimitive-property-label-renderer ${this.props.className ? this.props.className : ""}`}
        onClick={this._onClick}
        role="presentation"
      >
        <div className={(this.props.isExpanded ? " components-expanded" : "")}>
          <i className="icon icon-chevron-right" />
        </div>
        <PropertyLabelRenderer renderColon={this.props.renderColon}>{this.props.children}</PropertyLabelRenderer>
      </div>
    );
  }
}
