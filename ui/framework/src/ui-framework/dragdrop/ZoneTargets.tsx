/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { BackTarget, MergeTarget, WidgetZoneId, ZoneTargetType } from "@bentley/ui-ninezone";
import { TargetChangeHandler } from "../frontstage/FrontstageComposer";

/** Properties for the [[ZoneTargets]] component.
 * @internal
 */
export interface ZoneTargetsProps extends CommonProps {
  zoneId: WidgetZoneId;
  dropTarget: ZoneTargetType | undefined;
  targetChangeHandler: TargetChangeHandler;
}

/** Zone Targets React component.
 * @internal
 */
export class ZoneTargets extends React.Component<ZoneTargetsProps> {
  public override render(): React.ReactNode {
    switch (this.props.dropTarget) {
      case ZoneTargetType.Merge:
        return (
          <MergeTarget
            className={this.props.className}
            onTargetChanged={(isTargeted) => this.props.targetChangeHandler.handleTargetChanged(this.props.zoneId, ZoneTargetType.Merge, isTargeted)}
            style={this.props.style}
          />
        );
      case ZoneTargetType.Back:
        return (
          <BackTarget
            className={this.props.className}
            onTargetChanged={(isTargeted) => this.props.targetChangeHandler.handleTargetChanged(this.props.zoneId, ZoneTargetType.Back, isTargeted)}
            style={this.props.style}
            zoneIndex={this.props.zoneId}
          />
        );
      default:
        return null;
    }
  }
}
