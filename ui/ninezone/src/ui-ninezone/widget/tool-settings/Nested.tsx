/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ToolSettings
 */

import "./Nested.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[NestedToolSettings]] component.
 * @beta
 */
export interface NestedToolSettingsProps extends CommonProps {
  /** Back button. */
  backButton?: React.ReactNode;
  /** Tool settings content or content container. I.e. [[ScrollableToolSettings]] */
  children?: React.ReactNode;
  /** Settings title. */
  title?: string;
}

/** Used in [[ToolSettings]] component to display nested tool settings.
 * @beta
 */
export class NestedToolSettings extends React.PureComponent<NestedToolSettingsProps> {
  public override render() {
    const className = classnames(
      "nz-widget-toolSettings-nested",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        <div className="nz-header">
          <div className="nz-button">
            {this.props.backButton}
          </div>
          <div className="nz-title">
            {this.props.title}
          </div>
        </div>
        {this.props.children}
      </div>
    );
  }
}
