/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Loading
 */

import "./LoadingSpinner.scss";
import * as React from "react";
import { Spinner, SpinnerProps } from "./Spinner";

/** Properties for [[LoadingSpinner]] component
 * @public
 */
export interface LoadingSpinnerProps extends SpinnerProps {
  /** Message (text) displayed */
  message?: string;
  /** Position the message above or below the spinner (defaults to bottom) */
  messageOnTop?: boolean;
}

/**
 * A loading spinner component that optionally shows a text message.
 * @public
 */
export class LoadingSpinner extends React.PureComponent<LoadingSpinnerProps> {
  public static defaultProps: Partial<LoadingSpinnerProps> = {
    messageOnTop: false,
  };

  public override render() {
    return (
      <div className="core-ls">
        {(this.props.message && this.props.messageOnTop) && <span className="ls-message-top">{this.props.message}</span>}
        <Spinner size={this.props.size} sizeClass={this.props.sizeClass} />
        {(this.props.message && !this.props.messageOnTop) && <span className="ls-message-bottom">{this.props.message}</span>}
      </div>
    );
  }
}
