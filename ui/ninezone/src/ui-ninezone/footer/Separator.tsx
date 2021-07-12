/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Footer
 */

import "./Separator.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, NoChildrenProps } from "@bentley/ui-core";

/** Properties of [[FooterSeparator]] component.
 * @public
 */
export interface FooterSeparatorProps extends CommonProps, NoChildrenProps {
}

/** Footer indicator separator used in [[Footer]] component.
 * @public
 */
export class FooterSeparator extends React.PureComponent<FooterSeparatorProps> {
  public override render() {
    const className = classnames(
      "nz-footer-separator",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      />
    );
  }
}
