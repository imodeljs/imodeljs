/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module SyncUi
 */

import * as React from "react";
import { SyncUiEventArgs, SyncUiEventDispatcher } from "./SyncUiEventDispatcher";

/**
 * Properties supported by [[BooleanSyncUiListener]] component.
 * @public
 */
export interface BooleanListenerProps {
  /** One or more SyncUi event Ids that will trigger the function to be called. */
  eventIds: string[];
  /** Function to be called to return a boolean value. If the boolean value is different than the component's state value setState is
   * called to update the value and trigger a re-render.
   */
  boolFunc: () => boolean;
  /** Optional, default/initial boolean value that is saved in the components state. If
   * not defined it will default to true.
   */
  defaultValue?: boolean;
}

/**
 * State for the [[BooleanSyncUiListener]] component.
 * @internal
 */
interface BooleanListenerState {
  boolValue: boolean;
}

// cSpell:Ignore Unmounting
/**
 * A component that expect its children to be a function that will be passed the current boolValue state.
 * @public
 */
export class BooleanSyncUiListener extends React.Component<BooleanListenerProps, BooleanListenerState> {
  private _componentUnmounting = false;

  /** @internal */
  public override readonly state: BooleanListenerState;

  constructor(props: BooleanListenerProps) {
    super(props);
    this.state = {
      boolValue: undefined !== props.defaultValue ? props.defaultValue : true,
    };
  }

  private _handleVisibilitySyncUiEvent = (args: SyncUiEventArgs): void => {
    /* istanbul ignore next */
    if (this._componentUnmounting)
      return;

    /* istanbul ignore else */
    if (this.props.eventIds.some((value: string): boolean => args.eventIds.has(value.toLowerCase()))) {
      const boolValue = this.props.boolFunc();
      /* istanbul ignore else */
      if (this.state.boolValue !== boolValue) {
        this.setState({ boolValue });
      }
    }
  };

  public override componentDidMount() {
    /* istanbul ignore else */
    if ((this.props.boolFunc !== undefined) && this.props.eventIds.length > 0)
      SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleVisibilitySyncUiEvent);
  }

  public override componentWillUnmount() {
    /* istanbul ignore else */
    if ((this.props.boolFunc !== undefined) && this.props.eventIds.length > 0) {
      this._componentUnmounting = true;
      SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleVisibilitySyncUiEvent);
    }
  }

  // istanbul ignore next
  private _hasNoChildren = (children: any) => React.Children.count(children) === 0;

  public override render(): React.ReactNode {
    const {
      // do not bleed our props
      children, eventIds, boolFunc, defaultValue, // eslint-disable-line @typescript-eslint/no-unused-vars
      // eslint-disable-next-line comma-dangle
      ...otherProps // pass-through props
    } = this.props;
    const boolValue = this.state.boolValue;

    return (
      typeof children === "function" ?
        children(boolValue, otherProps)
        : /* istanbul ignore next */ !this._hasNoChildren(children)
          ? React.Children.only(children)
          : null
    );
  }
}
