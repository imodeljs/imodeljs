/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Message
 */

import "./Dialog.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[Dialog]] component.
 * @beta
 */
export interface DialogProps extends CommonProps {
  /** Dialog content.  */
  children?: React.ReactNode;
  /** Dialog title bar. See [[TitleBar]] */
  titleBar?: React.ReactNode;
}

/** Dialog used in footer indicators.
 * @note See [[MessageCenter]], [[ToolAssistance]]
 * @beta
 */
export class Dialog extends React.PureComponent<DialogProps> {
  public override render() {
    const className = classnames(
      "nz-footer-dialog-dialog",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        <div>
          {this.props.titleBar}
        </div>
        <div>
          {this.props.children}
        </div>
      </div>
    );
  }
}
