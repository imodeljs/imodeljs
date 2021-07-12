/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WorkflowTask
 */

import { Logger } from "@bentley/bentleyjs-core";
import { UiEvent } from "@bentley/ui-core";
import { ItemDefBase } from "../shared/ItemDefBase";
import { ItemProps } from "../shared/ItemProps";
import { UiFramework } from "../UiFramework";
import { Task, TaskManager } from "./Task";

/** Properties for a [[Workflow]].
 * @public
 */
export interface WorkflowProps extends ItemProps {
  id: string;
  defaultTaskId: string;
  tasks: string[];
  isDefault?: boolean;
}

/** Workflow Properties List definition.
 * @public
 */
export interface WorkflowPropsList {
  defaultWorkflowId: string;
  workflows: WorkflowProps[];
}

/** Workflow class.
 * A Workflow is a defined sequence of tasks used to accomplish a goal.
 * @public
 */
export class Workflow extends ItemDefBase {
  /** Id of the Workflow */
  public workflowId: string;
  /** Default Task Id */
  public defaultTaskId: string;
  /** Active Task Id */
  public activeTaskId: string | null = null;
  /** Indicates whether this Workflow is the default */
  public isDefault: boolean;

  private _taskIds: string[];
  private _tasks: Map<string, Task> = new Map<string, Task>();

  constructor(workflowDef: WorkflowProps) {
    super(workflowDef);

    this.workflowId = workflowDef.id;
    this.defaultTaskId = workflowDef.defaultTaskId;
    this._taskIds = workflowDef.tasks;
    this.isDefault = (workflowDef.isDefault !== undefined) ? workflowDef.isDefault : true;

    this._taskIds.map((taskId: string, _index: number) => {
      const task = TaskManager.findTask(taskId);
      // istanbul ignore else
      if (task)
        this._tasks.set(taskId, task);
    });
  }

  /** Gets the Id of the Workflow. */
  public get id(): string {
    return this.workflowId;
  }

  /** Gets the active Task. */
  public get activeTask(): Task | undefined {
    if (!this.activeTaskId)
      return undefined;

    return this._tasks.get(this.activeTaskId);
  }

  /** Gets a Task with a given Id.
   * @param taskId Id of the Task to get
   */
  public getTask(taskId: string): Task | undefined {
    return this._tasks.get(taskId);
  }

  /** Gets the last active Task. If no Task is active, it returns the default Task.
   */
  public get lastActiveTask(): Task | undefined {
    if (!this.activeTaskId) {
      return this.getTask(this.defaultTaskId);
    }

    return this.getTask(this.activeTaskId);
  }

  /** Determines if the Workflow is active.
   */
  public override get isActive(): boolean {
    let isActive = false;

    if (WorkflowManager.activeWorkflow === this)
      isActive = true;

    return isActive;
  }

  public override set isActive(_: boolean) {
    // do nothing - needed because subclassing from ItemDefBase
  }

  /** Sets a Task as active.
   * @param task  The Task to set as active
   */
  public setActiveTask(task: Task) {
    this.activeTaskId = task.taskId;
    task.onActivated(); // eslint-disable-line @typescript-eslint/no-floating-promises
    WorkflowManager.onTaskActivatedEvent.emit({ task, taskId: task.id, workflow: this, workflowId: this.id });
  }

  /** Gets an array of sorted Tasks in the Workflow. */
  public getSortedTasks(): Task[] {
    const sortedTasks = new Array<Task>();

    for (const key of this._tasks.keys()) {
      const task: Task | undefined = this._tasks.get(key);
      // istanbul ignore else
      if (task && task.isVisible) // eslint-disable-line deprecation/deprecation
        sortedTasks.push(task);
    }

    sortedTasks.sort((a: Task, b: Task) => {
      return a.label.localeCompare(b.label);
    });

    return sortedTasks;
  }

}

/** Workflow Activated Event Args class.
 * @public
 */
export interface WorkflowActivatedEventArgs {
  workflowId?: string;
  workflow?: Workflow;
}

/** Workflow Activated Event class.
 * @public
 */
export class WorkflowActivatedEvent extends UiEvent<WorkflowActivatedEventArgs> { }

/** Task Activated Event Args class.
 * @public
 */
export interface TaskActivatedEventArgs {
  taskId?: string;
  task?: Task;

  workflowId: string;
  workflow: Workflow;
}

/** Task Activated Event class.
 * @public
 */
export class TaskActivatedEvent extends UiEvent<TaskActivatedEventArgs> { }

/** Workflow Manager class.
 * @public
 */
export class WorkflowManager {
  private static _workflows: Map<string, Workflow> = new Map<string, Workflow>();
  private static _activeWorkflow: Workflow | undefined;
  private static _defaultWorkflowId: string;

  /** Get Workflow Activated event. */
  public static readonly onWorkflowActivatedEvent = new WorkflowActivatedEvent();
  /** Get Task Activated event. */
  public static readonly onTaskActivatedEvent = new TaskActivatedEvent();

  /** Loads one or more Workflows.
   * @param workflowPropsList  the list of Workflows to load
   */
  public static loadWorkflows(workflowPropsList: WorkflowPropsList) {
    this.setDefaultWorkflowId(workflowPropsList.defaultWorkflowId);
    WorkflowManager.loadWorkflowDefs(workflowPropsList.workflows);
  }

  private static loadWorkflowDefs(workflowDefs: WorkflowProps[]) {
    workflowDefs.map((workflowProps: WorkflowProps) => {
      WorkflowManager.loadWorkflow(workflowProps);
    });
  }

  /** Loads a Workflow.
   * @param workflowProps  Properties of the Workflow to load
   */
  public static loadWorkflow(workflowProps: WorkflowProps) {
    const workflow = new Workflow(workflowProps);
    WorkflowManager.addWorkflow(workflowProps.id, workflow);
  }

  /** Adds a Workflow.
   * @param workflowId  Id of the Workflow to add
   * @param workflow    The Workflow to add
   */
  public static addWorkflow(workflowId: string, workflow: Workflow) {
    this._workflows.set(workflowId, workflow);
  }

  /** Finds a Workflow with a given Id.
   * @param workflowId  Id of the Workflow to find
   * @returns The Workflow if found, or undefined if not found
   */
  public static findWorkflow(workflowId: string): Workflow | undefined {
    return this._workflows.get(workflowId);
  }

  /** Sets the active Workflow
   * @param workflow  The Workflow to set as active
   */
  public static setActiveWorkflow(workflow: Workflow | undefined): void {
    this._activeWorkflow = workflow;
    WorkflowManager.onWorkflowActivatedEvent.emit({ workflow, workflowId: workflow ? workflow.id : undefined });
  }

  /** Sets the active Workflow and Task
   * @param workflow  The Workflow to set as active
   * @param task      The Task to set as active
   */
  public static async setActiveWorkflowAndTask(workflow: Workflow, task: Task): Promise<void> {
    // istanbul ignore else
    if (!workflow.isActive)
      this.setActiveWorkflow(workflow);

    // istanbul ignore else
    if (!task.isActive)
      workflow.setActiveTask(task);
  }

  /** Gets the active Workflow */
  public static get activeWorkflow(): Workflow | undefined {
    return this._activeWorkflow;
  }

  /** Gets the active Workflow id */
  public static get activeWorkflowId(): string {
    if (this._activeWorkflow !== undefined)
      return this._activeWorkflow.id;
    return "";
  }

  /** Gets the active Task */
  public static get activeTask(): Task | undefined {
    if (this._activeWorkflow !== undefined)
      return this._activeWorkflow.activeTask;
    return undefined;
  }

  /** Gets the active Task id */
  public static get activeTaskId(): string {
    if (this._activeWorkflow !== undefined) {
      // istanbul ignore else
      if (this._activeWorkflow.activeTask)
        return this._activeWorkflow.activeTask.id;
    }
    return "";
  }

  /** Gets the Id of the default Workflow */
  public static get defaultWorkflowId(): string {
    return this._defaultWorkflowId;
  }

  /** Sets the Id of the default Workflow */
  public static setDefaultWorkflowId(id: string): void {
    this._defaultWorkflowId = id;
  }

  /** Removes a Workflow
   * @param workflow  The Workflow to remove
   */
  public static removeWorkflow(workflow: Workflow): boolean {
    const id = workflow.id;
    let result = false;

    if (this._workflows.get(id)) {
      this._workflows.delete(id);
      result = true;
    } else {
      Logger.logError(UiFramework.loggerCategory(this), `removeWorkflow: Workflow with id '${id}' not found`);
      result = false;
    }

    return result;
  }

  public static getSortedWorkflows(): Workflow[] {
    const sortedWorkflows = new Array<Workflow>();

    for (const key of this._workflows.keys()) {
      const workflow = this._workflows.get(key);
      // istanbul ignore else
      if (workflow)
        sortedWorkflows.push(workflow);
    }

    sortedWorkflows.sort((a: Workflow, b: Workflow) => {
      return a.label.localeCompare(b.label);
    });

    return sortedWorkflows;
  }
}
