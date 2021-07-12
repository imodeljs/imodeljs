/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Common
 */

import * as React from "react";
import { Timer } from "../utils/Timer";

/** Properties for [[withTimeout]] React higher-order component
 * @public
 */
export interface WithTimeoutProps {
  /** Timeout duration in milliseconds */
  timeout: number;
  /** Callback function for timeout */
  onTimeout?: () => void;
}

/** withTimeout is a React higher-order component that adds timeout support.
 * @public
 */
export const withTimeout = <ComponentProps extends {}>(
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Component: React.ComponentType<ComponentProps>,
) => {
  return class WithTimeout extends React.PureComponent<ComponentProps & WithTimeoutProps> {
    public timer: Timer = new Timer(0);

    public override componentDidMount(): void {
      this.timer.setOnExecute(() => this.props.onTimeout && this.props.onTimeout());
      this.startTimer(this.props.timeout);
    }

    public override componentDidUpdate(_prevProps: Readonly<ComponentProps & WithTimeoutProps>): void {
      this.startTimer(this.props.timeout);
    }

    public override componentWillUnmount(): void {
      this.timer.stop();
    }

    public override render() {
      const { timeout, onTimeout, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
      return (
        <Component {...props as ComponentProps} {...this.state} />
      );
    }

    public startTimer(timeout: number) {
      if (this.timer.isRunning)
        return;

      this.timer.delay = timeout;
      this.timer.start();
    }
  };
};
