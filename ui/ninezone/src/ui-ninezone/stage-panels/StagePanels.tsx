/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StagePanels
 */

import "./StagePanels.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[StagePanels]] component.
 * @beta
 */
export interface StagePanelsProps extends CommonProps {
  /** Bottom panel. I.e. [[StagePanel]] */
  bottomPanel?: React.ReactNode;
  /** Stage panels content. */
  children?: React.ReactNode;
  /** Left panel. I.e. [[StagePanel]] */
  leftPanel?: React.ReactNode;
  /** Right panel. I.e. [[StagePanel]] */
  rightPanel?: React.ReactNode;
  /** Top panel. I.e. [[StagePanel]] */
  topPanel?: React.ReactNode;
}

/** Stage panels component of 9-Zone UI app.
 * @beta
 */
export class StagePanels extends React.PureComponent<StagePanelsProps> {
  public override render() {
    const className = classnames(
      "nz-stagePanels-stagePanels",
      this.props.className);
    return (
      <div
        className={className}
        style={this.props.style}
      >
        <div className="nz-panel">
          {this.props.leftPanel}
        </div>
        <div className="nz-rows">
          <div className="nz-panel">
            {this.props.topPanel}
          </div>
          <div className="nz-content">
            {this.props.children}
          </div>
          <div className="nz-panel">
            {this.props.bottomPanel}
          </div>
        </div>
        <div className="nz-panel">
          {this.props.rightPanel}
        </div>
      </div>
    );
  }
}
