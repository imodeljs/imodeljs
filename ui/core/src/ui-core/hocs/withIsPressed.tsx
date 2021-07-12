/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Common
 */

import * as React from "react";

/** Properties for [[withIsPressed]] React higher-order component
 * @public
 */
export interface WithIsPressedProps {
  /** initial value for pressed status */
  isPressed?: boolean;
  /** callback function for [isPressed] change */
  onIsPressedChange?: (isPressed: boolean) => void;
}

/** withIsPressed is a React higher-order component that adds pointer and mouse events.
 * @public
 */
export const withIsPressed = <ComponentProps extends {}>(
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Component: React.ComponentType<ComponentProps>,
) => {
  return class WithIsPressed extends React.PureComponent<ComponentProps & WithIsPressedProps> {
    public handleOnPointerDown = () => {
      this.changeIsPressed(true);
    };

    public handleOnPointerUp = () => {
      this.changeIsPressed(false);
    };

    public handleOnMouseLeave = () => {
      this.changeIsPressed(false);
    };

    public changeIsPressed = (isPressed: boolean) => {
      if (this.props.isPressed === isPressed)
        return;

      this.props.onIsPressedChange && this.props.onIsPressedChange(isPressed);
    };

    public override render() {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { isPressed, onIsPressedChange, ...props } = this.props; // todo: better solution to rest object of intersected type
      return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div className="withispressed-wrapper"
          onMouseDown={this.handleOnPointerDown}
          onMouseUp={this.handleOnPointerUp}
          onTouchStart={this.handleOnPointerDown}
          onTouchEnd={this.handleOnPointerUp}
          onMouseLeave={this.handleOnMouseLeave}
        >
          <Component {...props as ComponentProps} {...this.state} />
        </div>
      );
    }
  };
};
