/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { Vector3d } from "@bentley/geometry-core";
import { RenderSchedule } from "@bentley/imodeljs-common";
import { IModelApp, RenderScheduleState, Tool } from "@bentley/imodeljs-frontend";

enum FadeMode { X, Y, Z, Transparent }

/** This tool applies a transition in X, Y, Z, or transparency.
 * @beta
 */
export class RealityTransitionTool extends Tool {
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }
  public static override toolId = "RealityTransition";
  /** This method runs the tool, applying a transition in X, Y, Z, or transparency.
   * @param fadeMode whether to apply the transition in X, Y, Z, or transparency
   */
  public override run(fadeMode: FadeMode = FadeMode.X): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return true;

    const displayStyle = vp.displayStyle;
    const view = vp.view;
    const timeNow = Date.now(), timeEnd = timeNow + 1000.0 * 60.0 * 60.0;
    const range = vp.iModel.projectExtents;
    const directions = [Vector3d.create(1, 0, 0), Vector3d.create(0, 1, 0), Vector3d.create(0, 0, 1)];
    const modelInTimeline: RenderSchedule.ModelTimelineProps = { modelId: "", elementTimelines: [] };
    const modelOutTimeline: RenderSchedule.ModelTimelineProps = { modelId: "", elementTimelines: [] };

    switch (fadeMode) {
      case FadeMode.Transparent: {
        const fadeInTimeline = new Array<RenderSchedule.VisibilityEntryProps>();
        fadeInTimeline.push({ time: timeNow, interpolation: 2, value: 100.0 });
        fadeInTimeline.push({ time: timeEnd, interpolation: 2, value: 0.0 });
        const fadeOutTimeline = new Array<RenderSchedule.VisibilityEntryProps>();
        fadeOutTimeline.push({ time: timeNow, interpolation: 2, value: 0.0 });
        fadeOutTimeline.push({ time: timeEnd, interpolation: 2, value: 100.0 });
        modelInTimeline.visibilityTimeline = fadeInTimeline;
        modelOutTimeline.visibilityTimeline = fadeOutTimeline;
        break;
      }

      default: {
        const direction = directions[fadeMode - FadeMode.X];
        const clipInTimeline = new Array<RenderSchedule.CuttingPlaneEntryProps>();
        clipInTimeline.push({ time: timeNow, interpolation: 2, value: { position: [range.low.x, range.low.y, range.low.z], direction: [direction.x, direction.y, direction.z] } });
        clipInTimeline.push({ time: timeEnd, interpolation: 2, value: { position: [range.high.x, range.high.y, range.high.z], direction: [direction.x, direction.y, direction.z] } });
        const clipOutTimeline = new Array<RenderSchedule.CuttingPlaneEntryProps>();
        clipOutTimeline.push({ time: timeNow, interpolation: 2, value: { position: [range.low.x, range.low.y, range.low.z], direction: [-direction.x, -direction.y, -direction.z] } });
        clipOutTimeline.push({ time: timeEnd, interpolation: 2, value: { position: [range.high.x, range.high.y, range.high.z], direction: [-direction.x, -direction.y, -direction.z] } });
        modelInTimeline.cuttingPlaneTimeline = clipInTimeline;
        modelOutTimeline.cuttingPlaneTimeline = clipOutTimeline;
        break;
      }
    }

    const scriptProps: RenderSchedule.ScriptProps = [];
    view.forEachModel((model) => {
      scriptProps.push({
        ...(model.jsonProperties.tilesetUrl ? modelOutTimeline : modelInTimeline),
        modelId: model.id,
      });
    });

    displayStyle.forEachRealityModel((model) => {
      const modelId = model.treeRef?.treeOwner.tileTree?.modelId;
      if (modelId) {
        scriptProps.push({
          ...modelOutTimeline,
          modelId,
          realityModelUrl: model.url,
        });
      }
    });

    const script = RenderSchedule.Script.fromJSON(scriptProps);
    if (script) {
      displayStyle.setScheduleState(new RenderScheduleState(displayStyle.id, script));
      vp.timePoint = script.duration.low;
    }

    return true;
  }

  /** Executes this tool's run method.
   * @param args the first entry of this array contains either "x", "y", "z", or "transparent", indicating the type of transition to apply.
   * @see [[run]]
   */
  public override parseAndRun(...args: string[]): boolean {
    const transitionNames = [
      "x",
      "y",
      "z",
      "transparent",
    ];
    let fade = FadeMode.X;
    if (0 !== args.length) {
      const arg = args[0].toLowerCase();
      for (let i = 0; i < transitionNames.length; i++) {
        if (arg === transitionNames[i]) {
          fade = i;
          break;
        }
      }
    }

    return this.run(fade);
  }
}
