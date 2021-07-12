/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ToolAssistance
 */

import "./NewDot.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** 'New' dot used in Tool assistance instruction component.
 * @internal
 */
export class NewDot extends React.PureComponent<CommonProps> {
  public override render() {
    const className = classnames(
      "nz-footer-toolAssistance-newDot",
      this.props.className);

    return (
      <span
        className={className}
        style={this.props.style}
      />
    );
  }
}
