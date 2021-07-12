/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import "./PropertyLabelRenderer.scss";
import * as React from "react";
import { PropertyLabelRenderer, PropertyLabelRendererProps } from "./PropertyLabelRenderer";

/** Properties of a [[PrimitivePropertyLabelRenderer]] React component
 * @public
 */
export interface PrimitivePropertyLabelRendererProps extends PropertyLabelRendererProps {
  /** Additional class name for the label wrapper */
  className?: string;
  /** Offset from the left side in pixels. */
  offset?: number;
}

/** A React component that renders a primitive property label
 * @public
 */
export class PrimitivePropertyLabelRenderer extends React.PureComponent<PrimitivePropertyLabelRendererProps> {
  public override render() {
    const { className, offset, children, ...rest } = this.props;
    return (
      <span
        className={`components-primitive-property-label-renderer ${className ? className : ""}`}
        style={PropertyLabelRenderer.getStyle(offset)}
      >
        <PropertyLabelRenderer {...rest}>{children}</PropertyLabelRenderer>
      </span>
    );
  }
}
