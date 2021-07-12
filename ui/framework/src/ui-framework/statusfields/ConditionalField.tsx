/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import * as _ from "lodash";
import * as React from "react";
import { StatusFieldProps } from "./StatusFieldProps";

/**
 * Properties supported by [[ConditionalField]] component.
 * @public
 */
export interface ConditionalFieldProps extends StatusFieldProps {
  /** Function to be called to return a boolean value. If the boolean value is different than the component's state value setState is
   * called to update the value and trigger a re-render.
   */
  boolFunc: (props: StatusFieldProps) => boolean;
  /** Optional, default/initial boolean value that is saved in the components state. If
   * not defined it will default to true.
   */
  defaultValue?: boolean;
}

/**
 * State for the [[ConditionalField]] component.
 * @internal
 */
interface ConditionalFieldState {
  boolValue: boolean;
}

/**
 * A component that expects its children to be a function that will be passed the current component Props.
 * @public
 */
export class ConditionalField extends React.PureComponent<ConditionalFieldProps, ConditionalFieldState> {
  /** @internal */
  public override readonly state: ConditionalFieldState;

  constructor(props: ConditionalFieldProps) {
    super(props);
    this.state = {
      boolValue: undefined !== props.defaultValue ? props.defaultValue : true,
    };
  }

  private _resolveBooleanValue = (): void => {
    const boolValue = this.props.boolFunc(this.props);
    if (this.state.boolValue !== boolValue) {
      this.setState({ boolValue });
    }
  };

  public override componentDidMount() {
    this._resolveBooleanValue();
  }

  public override componentDidUpdate(prevProps: ConditionalFieldProps) {
    if (!_.isEqual(prevProps, this.props))
      this._resolveBooleanValue();
  }

  private _hasNoChildren = (children: any) => React.Children.count(children) === 0;

  public override render(): React.ReactNode {
    const {
      // do not bleed our props
      children, eventIds, boolFunc, defaultValue, // eslint-disable-line @typescript-eslint/no-unused-vars
      // eslint-disable-next-line comma-dangle
      ...otherProps // pass-through props
    } = this.props as any;
    const boolValue = this.state.boolValue;

    return (
      typeof children === "function" ?
        children(boolValue, otherProps)
        : !this._hasNoChildren(children)
          ? React.Children.only(children)
          : null
    );
  }
}
