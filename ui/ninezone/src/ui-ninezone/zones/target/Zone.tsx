/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import "./Zone.scss";
import classnames from "classnames";
import * as React from "react";
import { MergeTargetProps } from "./Merge";
import { WidgetTarget } from "./Target";

/** Zone target component used by [[BackTarget]] and [[MergeTarget]] components.
 * @internal
 */
export class ZoneTarget extends React.PureComponent<MergeTargetProps> {
  public override render() {
    return (
      <div
        className={classnames("nz-zones-target-zone", this.props.className)}
        style={this.props.style}
      >
        <WidgetTarget
          onTargetChanged={this.props.onTargetChanged}
        >
          {this.props.children}
        </WidgetTarget>
      </div>
    );
  }
}
