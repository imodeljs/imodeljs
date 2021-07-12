/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import "./StagePanel.scss";
import classnames from "classnames";
import * as React from "react";
import { StagePanelType, StagePanelTypeHelpers } from "../../stage-panels/StagePanel";
import { SafeAreaInsets, SafeAreaInsetsHelpers } from "../../utilities/SafeAreaInsets";
import { MergeTargetProps } from "./Merge";
import { WidgetTarget } from "./Target";

/** Properties of [[StagePanel]] component.
 * @beta
 */
export interface StagePanelTargetProps extends MergeTargetProps {
  /** Describes respected safe area insets. */
  safeAreaInsets?: SafeAreaInsets;
  /** Stage panel type. */
  type: StagePanelType;
}

/** Zone target used to merge widgets to stage panels.
 * @beta
 */
export class StagePanelTarget extends React.PureComponent<StagePanelTargetProps> {
  public override render() {
    const { className, safeAreaInsets, ...props } = this.props;
    const targetClassName = classnames(
      "nz-zones-target-stagePanel",
      StagePanelTypeHelpers.getCssClassName(this.props.type),
      safeAreaInsets && SafeAreaInsetsHelpers.getCssClassNames(safeAreaInsets),
      className);
    return (
      <WidgetTarget
        className={targetClassName}
        {...props}
      />
    );
  }
}
