/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import classnames from "classnames";
import * as React from "react";
import { WidgetZoneId } from "../manager/Zones";
import { Arrow } from "./Arrow";
import { MergeTargetProps } from "./Merge";
import { ZoneTarget } from "./Zone";

/** Properties of [[BackTarget]] component.
 * @alpha
 */
export interface BackTargetProps extends MergeTargetProps {
  /** Describes back target arrow rotation. */
  zoneIndex: WidgetZoneId;
}

/** Zone target used to merge widget back to initial zone.
 * @alpha
 */
export class BackTarget extends React.PureComponent<BackTargetProps> {
  public override render() {
    const { className, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    const targetClassName = classnames(
      "nz-zones-target-back",
      this.props.className);

    return (
      <ZoneTarget
        className={targetClassName}
        {...props}
      >
        <Arrow zoneIndex={this.props.zoneIndex} />
      </ZoneTarget>
    );
  }
}
