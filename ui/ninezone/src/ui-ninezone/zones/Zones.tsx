/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import "./Zones.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[Zones]] component.
 * @beta
 */
export interface ZonesProps extends CommonProps {
  /** Actual zones. I.e. [[Zone]] */
  children?: React.ReactNode;
  /** Describes if the zones component is hidden. */
  isHidden?: boolean;
}

/** Zones container component of 9-Zone UI app.
 * @beta
 */
export class Zones extends React.PureComponent<ZonesProps> {
  public override render() {
    const { isHidden } = this.props;
    const className = classnames(
      "nz-zones-zones",
      isHidden && "nz-hidden",
      this.props.className);
    return (
      <div
        className={className}
        style={this.props.style}
      >
        {this.props.children}
      </div>
    );
  }
}
