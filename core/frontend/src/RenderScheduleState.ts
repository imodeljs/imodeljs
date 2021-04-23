/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */

import { Id64, Id64String } from "@bentley/bentleyjs-core";
import { Range1d, Transform } from "@bentley/geometry-core";
import { RenderSchedule } from "@bentley/imodeljs-common";
import { IModelApp } from "./IModelApp";
import { FeatureSymbology } from "./render/FeatureSymbology";
import { AnimationBranchState, AnimationBranchStates } from "./render/GraphicBranch";

function formatBranchId(modelId: Id64String, branchId: number): string {
  return branchId < 0 ? "" : `${modelId}_Node_${branchId.toString()}`;
}

function addAnimationBranch(modelId: Id64String, timeline: RenderSchedule.Timeline, branchId: number, branches: AnimationBranchStates, time: number): void {
  const clipVector = timeline.getClipVector(time);
  const clip = clipVector ? IModelApp.renderSystem.createClipVolume(clipVector) : undefined;
  if (clip)
    branches.set(formatBranchId(modelId, branchId), { clip });
}

export class RenderScheduleState extends RenderSchedule.ScriptReference {
  public get duration(): Range1d {
    return this.script.duration;
  }

  public get containsFeatureOverrides(): boolean {
    return this.script.containsFeatureOverrides;
  }

  public getAnimationBranches(time: number): AnimationBranchStates | undefined {
    if (!this.script.containsModelClipping && !this.script.requiresBatching)
      return undefined;

    const branches = new Map<string, AnimationBranchState>();
    for (const model of this.script.modelTimelines) {
      addAnimationBranch(model.modelId, model, -1, branches, time);
      for (let i = 0; i < model.elementTimelines.length; i++) {
        const elem = model.elementTimelines[i];
        const branchId = i + 1;
        if (elem.getVisibility(time) <= 0)
          branches.set(formatBranchId(model.modelId, branchId), { omit: true });
        else
          addAnimationBranch(model.modelId, elem, branchId, branches, time);
      }
    }

    return branches;
  }

  public getTransformNodeIds(modelId: Id64String): ReadonlyArray<number> | undefined {
    return this.script.getTransformBatchIds(modelId);
  }

  public getTransform(modelId: Id64String, nodeId: number, time: number): Readonly<Transform> | undefined {
    return this.script.getTransform(modelId, nodeId, time);
  }

  public getSymbologyOverrides(overrides: FeatureSymbology.Overrides, time: number): void {
    this.script.addSymbologyOverrides(overrides, time);
  }

  public getModelAnimationId(modelId: Id64String): Id64String | undefined {
    // Only if the script contains animation (cutting plane, transform or visibility by node ID) do we require separate tilesets for animations.
    if (Id64.isTransient(modelId))
      return undefined;

    for (const modelTimeline of this.script.modelTimelines)
      if (modelTimeline.modelId === modelId && modelTimeline.requiresBatching)
        return this.sourceId;

    return undefined;
  }
}
