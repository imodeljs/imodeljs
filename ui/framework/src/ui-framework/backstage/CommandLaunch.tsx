/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import { CommandHandler } from "@bentley/ui-abstract";
import { BackstageItem as NZ_BackstageItem } from "@bentley/ui-ninezone";
import { withSafeArea } from "../safearea/SafeAreaContext";
import { SyncUiEventArgs, SyncUiEventDispatcher } from "../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../UiFramework";
import { PropsHelper } from "../utils/PropsHelper";
import { Backstage } from "./Backstage";
import { BackstageItemProps, BackstageItemState } from "./BackstageItemProps";
import { BackstageItemUtilities } from "./BackstageItemUtilities";

// cspell:ignore safearea

// eslint-disable-next-line @typescript-eslint/naming-convention
const BackstageItem = withSafeArea(NZ_BackstageItem);

/** Properties for a [[CommandLaunchBackstageItem]] component
 * @public
 */
export interface CommandLaunchBackstageItemProps extends BackstageItemProps, CommandHandler { // eslint-disable-line deprecation/deprecation
  /** Unique Id for this backstage item. */
  commandId: string;
}

/** Backstage item that launches a Command
 * @public
 */
export class CommandLaunchBackstageItem extends React.PureComponent<CommandLaunchBackstageItemProps, BackstageItemState> { // eslint-disable-line deprecation/deprecation

  /** @internal */
  public override readonly state: Readonly<BackstageItemState>; // eslint-disable-line deprecation/deprecation
  private _componentUnmounting = false;  // used to ensure _handleSyncUiEvent callback is not processed after componentWillUnmount is called
  private _stateSyncIds: string[] = [];  // local version of syncId that are lower cased

  constructor(props: CommandLaunchBackstageItemProps) {
    super(props);

    if (props.stateSyncIds)
      this._stateSyncIds = props.stateSyncIds.map((value) => value.toLowerCase());

    this.state = BackstageItemUtilities.getBackstageItemStateFromProps(props);
  }

  public override componentDidMount() {
    if (this.props.stateFunc && this._stateSyncIds.length > 0)
      SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
  }

  public override componentWillUnmount() {
    this._componentUnmounting = true;
    /* istanbul ignore else */
    if (this.props.stateFunc && this._stateSyncIds.length > 0)
      SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
  }

  private _handleSyncUiEvent = (args: SyncUiEventArgs): void => {
    /* istanbul ignore next */
    if (this._componentUnmounting)
      return;

    /* istanbul ignore else */
    if (SyncUiEventDispatcher.hasEventOfInterest(args.eventIds, this._stateSyncIds)) {
      /* istanbul ignore else */
      if (this.props.stateFunc) {
        const newState = this.props.stateFunc(this.state);
        /* istanbul ignore next */
        if (!PropsHelper.isShallowEqual(newState, this.state))
          this.setState((_prevState) => newState);
      }
    }
  };

  public execute = (): void => {
    Backstage.hide(); // eslint-disable-line deprecation/deprecation

    if (this.props.execute) {
      if (this.props.getCommandArgs)
        this.props.execute(this.props.getCommandArgs());
      else
        this.props.execute(this.props.parameters);
    } else
      Logger.logError(UiFramework.loggerCategory(this), `'${this.props.commandId}' has no execute() function`);
  };

  // deprecated class
  // istanbul ignore next
  public override componentDidUpdate(_prevProps: CommandLaunchBackstageItemProps) {
    const updatedState = BackstageItemUtilities.getBackstageItemStateFromProps(this.props);
    if (!PropsHelper.isShallowEqual(updatedState, this.state))
      this.setState((_prevState) => updatedState);
  }

  // TODO: add tooltip, subtitle, aria-label? to NZ_BackstageItem
  public override render(): React.ReactNode {
    return (
      <BackstageItem
        icon={PropsHelper.getIcon(this.state.iconSpec)}
        isActive={this.state.isActive}
        isDisabled={!this.state.isEnabled}
        key={this.props.commandId}
        onClick={this.execute}
      >
        {this.state.label}
      </BackstageItem>
    );
  }
}
