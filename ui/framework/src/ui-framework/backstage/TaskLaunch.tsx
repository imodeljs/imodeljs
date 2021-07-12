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
import { withSafeArea } from "../safearea/SafeAreaContext";
import { SyncUiEventArgs, SyncUiEventDispatcher } from "../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../UiFramework";
import { PropsHelper } from "../utils/PropsHelper";
import { TaskActivatedEventArgs, WorkflowManager } from "../workflow/Workflow";
import { Backstage } from "./Backstage";
import { BackstageItemProps, BackstageItemState } from "./BackstageItemProps";
import { BackstageItemUtilities } from "./BackstageItemUtilities";

// cspell:ignore safearea

// eslint-disable-next-line @typescript-eslint/naming-convention
const BackstageItem = withSafeArea(NZ_BackstageItem);

/** Properties for a [[TaskLaunchBackstageItem]] component
 * @public
 */
export interface TaskLaunchBackstageItemProps extends BackstageItemProps { // eslint-disable-line deprecation/deprecation
  /** Workflow Id */
  workflowId: string;
  /** Task Id */
  taskId: string;
}

/** Backstage item that activates a Task
 * @public
 */
export class TaskLaunchBackstageItem extends React.PureComponent<TaskLaunchBackstageItemProps, BackstageItemState> { // eslint-disable-line deprecation/deprecation

  /** @internal */
  public override readonly state: Readonly<BackstageItemState>; // eslint-disable-line deprecation/deprecation
  private _componentUnmounting = false;  // used to ensure _handleSyncUiEvent callback is not processed after componentWillUnmount is called
  private _stateSyncIds: string[] = [];  // local version of syncId that are lower cased

  constructor(props: TaskLaunchBackstageItemProps) {
    super(props);

    if (props.stateSyncIds)
      this._stateSyncIds = props.stateSyncIds.map((value) => value.toLowerCase());

    const state = BackstageItemUtilities.getBackstageItemStateFromProps(props);
    /* istanbul ignore else */
    if (this.props.isActive === undefined)
      state.isActive = WorkflowManager.activeTaskId === this.props.taskId && WorkflowManager.activeWorkflowId === this.props.workflowId;
    this.state = state;
  }

  public override componentDidMount() {
    if (this.props.stateFunc && this._stateSyncIds.length > 0)
      SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
    WorkflowManager.onTaskActivatedEvent.addListener(this._handleTaskActivatedEvent);
  }

  public override componentWillUnmount() {
    this._componentUnmounting = true;
    if (this.props.stateFunc && this._stateSyncIds.length > 0)
      SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
    WorkflowManager.onTaskActivatedEvent.removeListener(this._handleTaskActivatedEvent);
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

  public get id(): string {
    return `${this.props.workflowId}:${this.props.taskId}`;
  }

  public execute = (): void => {
    Backstage.hide(); // eslint-disable-line deprecation/deprecation

    const workflow = WorkflowManager.findWorkflow(this.props.workflowId);
    if (workflow) {
      const task = workflow.getTask(this.props.taskId);
      if (task)
        WorkflowManager.setActiveWorkflowAndTask(workflow, task); // eslint-disable-line @typescript-eslint/no-floating-promises
      else
        Logger.logError(UiFramework.loggerCategory(this), `Task with id '${this.props.taskId}' not found`);
    } else
      Logger.logError(UiFramework.loggerCategory(this), `Workflow with id '${this.props.workflowId}' not found`);
  };

  public override componentDidUpdate(_prevProps: TaskLaunchBackstageItemProps) {
    const updatedState = BackstageItemUtilities.getBackstageItemStateFromProps(this.props);
    updatedState.isActive = WorkflowManager.activeTaskId === this.props.taskId && WorkflowManager.activeWorkflowId === this.props.workflowId;
    if (!PropsHelper.isShallowEqual(updatedState, this.state))
      this.setState((_prevState) => updatedState);
  }

  private _handleTaskActivatedEvent = (args: TaskActivatedEventArgs) => {
    const isActive = args.taskId === this.props.taskId && args.workflowId === this.props.workflowId;
    /* istanbul ignore else */
    if (isActive !== this.state.isActive)
      this.setState({ isActive });
  };

  // TODO: add tooltip, subtitle, aria-label? to NZ_BackstageItem
  public override render(): React.ReactNode {
    return (
      <BackstageItem
        icon={PropsHelper.getIcon(this.state.iconSpec)}
        isActive={this.state.isActive}
        isDisabled={!this.state.isEnabled}
        key={this.id}
        onClick={this.execute}
      >
        {this.state.label}
      </BackstageItem>
    );
  }
}
