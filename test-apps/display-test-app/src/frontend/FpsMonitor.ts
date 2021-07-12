/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  IModelApp, NotifyMessageDetails, OutputMessagePriority, PerformanceMetrics, ScreenViewport, Target, Tool, Viewport,
} from "@bentley/imodeljs-frontend";

export interface FpsMonitorProps {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;
  output: HTMLSpanElement;
}

export class FpsMonitor {
  private readonly _checkbox: HTMLInputElement;
  private readonly _label: HTMLLabelElement;
  private readonly _output: HTMLSpanElement;
  private _enabled = false;
  private _prevTime = 0;
  private _frameCount = 0;

  public constructor(props: FpsMonitorProps) {
    this._checkbox = props.checkbox;
    this._label = props.label;
    this._output = props.output;

    IModelApp.viewManager.onViewOpen.addListener((vp: ScreenViewport) => this.onViewOpen(vp));
    this._checkbox.addEventListener("click", () => this.enabled = this._checkbox.checked);
  }

  private onViewOpen(vp: ScreenViewport): void {
    if (this._enabled)
      vp.continuousRendering = true;
  }

  public get enabled() { return this._enabled; }
  public set enabled(enabled: boolean) {
    if (enabled === this.enabled)
      return;

    this._enabled = enabled;
    this._frameCount = 0;
    for (const vp of IModelApp.viewManager)
      vp.continuousRendering = enabled;

    this._label.innerText = `FPS${this.enabled ? ":" : ""}`;
    this._output.innerText = "";
    if (enabled) {
      this._prevTime = performance.now();
      requestAnimationFrame(() => this.update());
    }
  }

  private update(): void {
    if (!this.enabled)
      return;

    ++this._frameCount;
    const curTime = performance.now();
    if (curTime >= this._prevTime + 1000) {
      const fps = (this._frameCount * 1000) / (curTime - this._prevTime);
      this._output.innerText = fps.toFixed(2);

      this._prevTime = curTime;
      this._frameCount = 0;
    }

    requestAnimationFrame(() => this.update());
  }
}

export class RecordFpsTool extends Tool {
  public static override toolId = "RecordFps";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  private _hadContinuousRendering = false;
  private _numFramesToRecord = 0;
  private _numFramesRecorded = 0;
  private _metrics?: PerformanceMetrics;
  private _dispose?: () => void;

  public override run(numFramesToRecord = 150): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp || 0 >= numFramesToRecord)
      return true;

    this._numFramesToRecord = numFramesToRecord;
    this._hadContinuousRendering = vp.continuousRendering;
    vp.continuousRendering = true;

    this._metrics = new PerformanceMetrics(false, true);
    (vp.target as Target).performanceMetrics = this._metrics;

    this._dispose = vp.onRender.addListener((viewport) => this.update(viewport));

    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Recording..."));
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    let numFramesToRecord;
    if (1 === args.length) {
      numFramesToRecord = parseInt(args[0], 10);
      if (Number.isNaN(numFramesToRecord))
        return true;
    }

    return this.run(numFramesToRecord);
  }

  private update(vp: Viewport): void {
    if (++this._numFramesRecorded < this._numFramesToRecord)
      return;

    if (undefined !== this._dispose)
      this._dispose();

    (vp.target as Target).performanceMetrics = undefined;
    vp.continuousRendering = this._hadContinuousRendering;

    const metrics = this._metrics!;
    const fps = (metrics.spfTimes.length / metrics.spfSum).toFixed(2);

    const msg = new NotifyMessageDetails(OutputMessagePriority.Info, `FPS ${fps}`);
    IModelApp.notifications.outputMessage(msg);
  }
}
