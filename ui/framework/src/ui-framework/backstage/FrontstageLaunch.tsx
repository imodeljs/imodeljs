/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import { BackstageItem as NZ_BackstageItem } from "@bentley/ui-ninezone";
import { FrontstageActivatedEventArgs, FrontstageManager } from "../frontstage/FrontstageManager";
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

/** Properties for a [[FrontstageLaunchBackstageItem]] component
 * @public
 */
export interface FrontstageLaunchBackstageItemProps extends BackstageItemProps { // eslint-disable-line deprecation/deprecation
  /** id of the frontstage */
  frontstageId: string;
}

/** Backstage item that activates a Frontstage
 * @public
 */
export class FrontstageLaunchBackstageItem extends React.PureComponent<FrontstageLaunchBackstageItemProps, BackstageItemState> { // eslint-disable-line deprecation/deprecation
  /** @internal */
  public override readonly state: Readonly<BackstageItemState>; // eslint-disable-line deprecation/deprecation
  private _componentUnmounting = false;  // used to ensure _handleSyncUiEvent callback is not processed after componentWillUnmount is called
  private _stateSyncIds: string[] = [];  // local version of syncId that are lower cased

  constructor(props: FrontstageLaunchBackstageItemProps) {
    super(props);

    if (props.stateSyncIds)
      this._stateSyncIds = props.stateSyncIds.map((value) => value.toLowerCase());

    const state = BackstageItemUtilities.getBackstageItemStateFromProps(props);
    /* istanbul ignore else */
    if (this.props.isActive === undefined)
      state.isActive = FrontstageManager.activeFrontstageId === this.props.frontstageId;
    this.state = state;
  }

  public override componentDidMount() {
    if (this.props.stateFunc && this._stateSyncIds.length > 0)
      SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
    FrontstageManager.onFrontstageActivatedEvent.addListener(this._handleFrontstageActivatedEvent);
  }

  public override componentWillUnmount() {
    this._componentUnmounting = true;
    /* istanbul ignore else */
    if (this.props.stateFunc && this._stateSyncIds.length > 0)
      SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
    FrontstageManager.onFrontstageActivatedEvent.removeListener(this._handleFrontstageActivatedEvent);
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
        /* istanbul ignore else */
        if (!PropsHelper.isShallowEqual(newState, this.state))
          this.setState((_prevState) => newState);
      }
    }
  };

  public execute = (): void => {
    Backstage.hide(); // eslint-disable-line deprecation/deprecation

    const frontstageDef = FrontstageManager.findFrontstageDef(this.props.frontstageId);
    if (frontstageDef)
      FrontstageManager.setActiveFrontstageDef(frontstageDef); // eslint-disable-line @typescript-eslint/no-floating-promises
    else
      Logger.logError(UiFramework.loggerCategory(this), `Frontstage with id '${this.props.frontstageId}' not found`);
  };

  public override componentDidUpdate(_prevProps: FrontstageLaunchBackstageItemProps) {
    const updatedState = BackstageItemUtilities.getBackstageItemStateFromProps(this.props);
    updatedState.isActive = FrontstageManager.activeFrontstageId === this.props.frontstageId;
    if (!PropsHelper.isShallowEqual(updatedState, this.state))
      this.setState((_prevState) => updatedState);
  }

  private _handleFrontstageActivatedEvent = (args: FrontstageActivatedEventArgs) => {
    const isActive = args.activatedFrontstageDef.id === this.props.frontstageId;
    /* istanbul ignore else */
    if (isActive !== this.state.isActive)
      this.setState({ isActive });
  };

  // TODO: add tooltip, aria-label? to NZ_BackstageItem
  public override render(): React.ReactNode {
    return (
      <BackstageItem
        icon={PropsHelper.getIcon(this.state.iconSpec)}
        isActive={this.state.isActive}
        isDisabled={!this.state.isEnabled}
        key={this.props.frontstageId}
        onClick={this.execute}
        subtitle={this.state.subtitle}
      >
        {this.state.label}
      </BackstageItem>
    );
  }
}
