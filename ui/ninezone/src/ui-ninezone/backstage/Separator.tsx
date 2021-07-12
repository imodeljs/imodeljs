/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import "./Separator.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Item separator in the [[Backstage]] component.
 * @beta
 */
export class BackstageSeparator extends React.PureComponent<CommonProps> {
  public override render() {
    const className = classnames(
      "nz-backstage-separator",
      this.props.className);

    return (
      <li className={className} style={this.props.style} role="separator" />
    );
  }
}
