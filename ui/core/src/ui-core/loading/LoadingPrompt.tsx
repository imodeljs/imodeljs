/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Loading
 */

import "./LoadingPrompt.scss";
import classnames from "classnames";
import * as React from "react";
import { Button, ProgressLinear } from "@itwin/itwinui-react";
import { LoadingBar } from "./LoadingBar";
import { LoadingSpinner } from "./LoadingSpinner";
import { LoadingStatus } from "./LoadingStatus";
import { CommonProps } from "../utils/Props";

// cspell:ignore loadingprompt

/** Properties for [[LoadingPrompt]] component
 * @public
 */
export interface LoadingPromptProps extends CommonProps {
  /** Title */
  title: string;
  /** Message displayed below the title (optional) */
  message?: string;
  /** Determine if a percentage bar is displayed (isDeterminate=true), otherwise a loading spinner or indeterminate progress bar is shown. */
  isDeterminate: boolean;
  /** Show current status and percentage. Default is false (not shown) */
  showStatus: boolean;
  /** Show cancel button. Default is false (not shown) */
  showCancel: boolean;
  /** Current loading status text (optional). Only shown if showStatus=true and isDeterminate=true */
  status: string;
  /** Current percentage.  Only used if isDeterminate=true */
  percent: number;
  /** Show percentage at the end of the loading bar (optional). Only shown if isDeterminate=true and showStatus=false */
  showPercentage: boolean;
  /** Show indeterminate progress bar instead of loading spinner */
  showIndeterminateBar: boolean;
  /** Function called when Cancel button is clicked. */
  onCancel?: () => void;

  /** Determine if a loading bar is displayed (isDeterminate=true), otherwise a loading spinner or indeterminate progress bar is shown
   * @deprecated Use isDeterminate instead
   */
  isDeterministic: boolean;
}

/**
 * A component to display during loading that optionally shows percentage, status text and a cancel button.
 * @public
 */
export class LoadingPrompt extends React.PureComponent<LoadingPromptProps> {
  public static defaultProps: Partial<LoadingPromptProps> = {
    showPercentage: false,
    showStatus: false,
    showCancel: false,
    isDeterminate: false,
    showIndeterminateBar: false,
    percent: 0,
    status: "",
  };

  public override render() {
    // eslint-disable-next-line deprecation/deprecation
    const isDeterminate = this.props.isDeterminate || this.props.isDeterministic;

    return (
      <div className={classnames("core-loadingprompt", this.props.className)} style={this.props.style}>
        <span className="title">{this.props.title}</span>
        {this.props.message && <span className="message">{this.props.message}</span>}
        {isDeterminate && <LoadingBar style={{ width: "100%" }} percent={this.props.percent} showPercentage={this.props.showPercentage} />}
        {(isDeterminate && this.props.showStatus) &&
          <LoadingStatus style={{ marginTop: ".5em", width: "100%", fontSize: ".75em" }} percent={this.props.percent} message={this.props.status} />}
        {!isDeterminate && (this.props.showIndeterminateBar ? <ProgressLinear indeterminate /> : <LoadingSpinner />)}
        {this.props.showCancel && <Button className="loading-prompt-cancel" onClick={this.props.onCancel}>Cancel</Button>}
      </div>
    );
  }
}
