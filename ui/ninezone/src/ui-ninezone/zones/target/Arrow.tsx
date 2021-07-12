/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import "./Arrow.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { WidgetZoneId } from "../manager/Zones";

/** Properties of [[Arrow]] component.
 * @internal
 */
export interface ArrowProps extends CommonProps {
  /** Describes arrow rotation. */
  zoneIndex: WidgetZoneId;
}

/** Arrow icon used in [[MergeTarget]], [[BackTarget]] components.
 * @internal
 */
export class Arrow extends React.PureComponent<ArrowProps> {
  public override render() {
    const className = classnames(
      "nz-zones-target-arrow",
      `nz-zone-${this.props.zoneIndex}`,
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      />
    );
  }
}
