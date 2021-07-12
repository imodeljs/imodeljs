/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Point3d, Range1d } from "@bentley/geometry-core";
import { calculateSunriseOrSunset, Cartographic } from "@bentley/imodeljs-common";
import { Viewport } from "@bentley/imodeljs-frontend";
import { createToolButton, ToolBarDropDown } from "./ToolBar";

interface TimelineProvider {
  /** Time range in any units. */
  duration: Range1d;
  /** Supply a description of the current time in same units as `this.duration`. */
  getDescription(time: number): string;
  /** Update state based on current time in same units as `this.duration`. */
  update(time: number, vp: Viewport): void;
  /** Get current time from viewport. */
  getCurrentTime(vp: Viewport): number;
  /** Called when user interacts with the timeline, by pressing Start or adjusting slider. */
  onInteraction?: () => void;
}

class AnalysisTimelineProvider {
  public readonly duration = Range1d.createXX(0, 100);

  public getDescription(time: number): string {
    return `${time.toFixed(0)}%`;
  }

  public update(time: number, vp: Viewport): void {
    vp.displayStyle.settings.analysisFraction = time / 100;
  }

  public getCurrentTime(vp: Viewport): number {
    return vp.displayStyle.settings.analysisFraction * 100;
  }
}

class SolarTimelineProvider {
  public readonly duration: Range1d;
  private _active = false;

  public constructor(vp: Viewport) {
    let cartoCenter;
    if (vp.iModel.isGeoLocated) {
      const projectExtents = vp.iModel.projectExtents;
      const projectCenter = Point3d.createAdd2Scaled(projectExtents.low, .5, projectExtents.high, .5);
      cartoCenter = vp.iModel.spatialToCartographicFromEcef(projectCenter);
    } else {
      cartoCenter = Cartographic.fromDegrees(-75.17035, 39.954927, 0.0);
    }

    const today = new Date(Date.now());
    const sunrise = calculateSunriseOrSunset(today, cartoCenter, true);
    const sunset = calculateSunriseOrSunset(today, cartoCenter, false);
    this.duration = Range1d.createXX(sunrise.getTime(), sunset.getTime());
  }

  public getDescription(time: number): string {
    return new Date(time).toTimeString();
  }

  public update(time: number, vp: Viewport): void {
    if (this._active && vp.displayStyle.is3d()) {
      vp.displayStyle.setSunTime(time);
      vp.invalidateRenderPlan();
    }
  }

  public getCurrentTime(_vp: Viewport): number {
    // NB: All we have is the solar direction - cannot compute date from that.
    return this.duration.low;
  }

  public onInteraction(): void {
    this._active = true;
  }
}

class ScheduleTimelineProvider {
  public readonly duration: Range1d;

  public constructor(duration: Range1d) {
    this.duration = duration;
  }

  public getDescription(time: number): string {
    return new Date(time * 1000).toString();
  }

  public update(time: number, vp: Viewport): void {
    vp.timePoint = time;
  }

  public getCurrentTime(vp: Viewport): number {
    return vp.timePoint ?? this.duration.low;
  }
}

class NoOpTimelineProvider {
  public readonly duration = Range1d.createXX(0, 100);

  public getDescription(_time: number): string {
    return "No animation available for this view.";
  }

  public update(_time: number, _vp: Viewport): void { }

  public getCurrentTime(_vp: Viewport): number {
    return this.duration.low;
  }
}

function createTimelineProvider(vp: Viewport): TimelineProvider {
  if (vp.displayStyle.scheduleScript)
    return new ScheduleTimelineProvider(vp.displayStyle.scheduleScript.duration);

  if (vp.displayStyle.settings.analysisStyle)
    return new AnalysisTimelineProvider();

  if (vp.displayStyle.is3d())
    return new SolarTimelineProvider(vp);

  return new NoOpTimelineProvider();
}

class TimelinePanel extends ToolBarDropDown {
  private readonly _vp: Viewport;
  private _provider: TimelineProvider;
  private _totalMillis: number;
  private _elapsedMillis = 0;
  private _lastMillis = Date.now();
  private _isPlaying = false;

  private readonly _element: HTMLElement;
  private readonly _messageElement: HTMLElement;
  private readonly _durationElement: HTMLInputElement;
  private readonly _slider: HTMLInputElement;
  private readonly _playButton: HTMLElement;
  private readonly _pauseButton: HTMLElement;

  public constructor(vp: Viewport, parent: HTMLElement, durationInSeconds: number) {
    super();
    this._vp = vp;
    this._totalMillis = 1000 * durationInSeconds;
    this._provider = this.createProvider();

    this._element = document.createElement("div");
    this._element.className = "toolMenu";
    this._element.style.display = "block";
    this._element.style.cssFloat = "left";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    this._playButton = createToolButton({
      iconUnicode: "\uea32",
      click: () => this.start(),
    });
    this._pauseButton = createToolButton({
      iconUnicode: "\uea33",
      click: () => this.pause(),
    });

    controls.appendChild(this._playButton);
    controls.appendChild(this._pauseButton);
    this._pauseButton.style.display = "none";

    const durationDiv = document.createElement("div");
    const durationLabel = document.createElement("label");
    durationLabel.innerText = "Duration: ";
    durationLabel.htmlFor = "anim_duration";
    durationDiv.appendChild(durationLabel);

    this._durationElement = document.createElement("input");
    this._durationElement.id = "anim_duration";
    this._durationElement.type = "number";
    this._durationElement.min = "0";
    this._durationElement.step = "0.1";
    this._durationElement.value = durationInSeconds.toString();
    this._durationElement.style.width = "4em";
    this._durationElement.innerHTML = " second(s)";
    this._durationElement.onchange = () => this.updateDuration();
    durationDiv.appendChild(this._durationElement);
    controls.appendChild(durationDiv);

    this._element.appendChild(controls);

    this._slider = document.createElement("input");
    this._slider.type = "range";
    this._slider.min = "0";
    this._slider.max = "1000";
    this._slider.value = "0";
    this._slider.className = "slider";
    this._slider.addEventListener("input", () => this.processSliderAdjustment());
    this._element.appendChild(this._slider);

    this._messageElement = document.createElement("div");
    this._element.appendChild(this._messageElement);

    parent.appendChild(this._element);

    this.update();
  }

  public get isOpen() {
    return "none" !== this._element.style.display;
  }

  protected _open(): void {
    this._element.style.display = "block";
  }

  protected _close(): void {
    this._element.style.display = "none";
  }

  public override get onViewChanged(): Promise<void> {
    // Change the provider before invoking update
    this._provider = this.createProvider();
    if (this._isPlaying)
      this.pause();
    else
      this.update();

    return Promise.resolve();
  }

  private start(): void {
    if (this._isPlaying)
      return;

    this.onInteraction();
    this._isPlaying = true;
    this._pauseButton.style.display = "block";
    this._playButton.style.display = "none";

    this.update();
    this._lastMillis = Date.now();
    this.queueAnimationFrame();
  }

  private pause(): void {
    if (!this._isPlaying)
      return;

    this._isPlaying = false;
    this._pauseButton.style.display = "none";
    this._playButton.style.display = "block";

    this._lastMillis = Date.now();
    this.update();
    this.queueAnimationFrame();
  }

  private onAnimationFrame(): void {
    if (!this._isPlaying)
      return;

    const now = Date.now();
    const elapsed = now - this._lastMillis;
    this._lastMillis = now;
    this._elapsedMillis += elapsed;

    this.update();

    if (this._elapsedMillis >= this._totalMillis)
      this._elapsedMillis = 0;

    this.queueAnimationFrame();
  }

  private queueAnimationFrame(): void {
    requestAnimationFrame(() => this.onAnimationFrame());
  }

  private update(): void {
    const fraction = Math.min(1, this._elapsedMillis / this._totalMillis);
    this._slider.value = (fraction * 1000).toString();

    const point = this._provider.duration.fractionToPoint(fraction);
    this._provider.update(point, this._vp);

    this._messageElement.innerText = this._provider.getDescription(point);
  }

  private processSliderAdjustment(): void {
    this.onInteraction();
    const sliderValue = parseInt(this._slider.value, 10);
    const fraction = sliderValue / 1000;
    this._elapsedMillis = fraction * this._totalMillis;
    this._lastMillis = Date.now();
    this.update();
  }

  private updateDuration(): void {
    const seconds = parseInt(this._durationElement.value, 10);
    if (Number.isNaN(seconds) || seconds <= 0)
      return;

    const fraction = Math.min(1, this._elapsedMillis / this._totalMillis);
    this._totalMillis = seconds * 1000;
    this._elapsedMillis = fraction * this._totalMillis;
    this._lastMillis = Date.now();

    this.update();
  }

  private onInteraction(): void {
    if (this._provider.onInteraction)
      this._provider.onInteraction();
  }

  private createProvider(): TimelineProvider {
    const provider = createTimelineProvider(this._vp);

    const time = provider.getCurrentTime(this._vp);
    const timeFraction = (time - provider.duration.low) / provider.duration.length();
    this._elapsedMillis = timeFraction * this._totalMillis;

    return provider;
  }
}

export function createTimeline(vp: Viewport, parent: HTMLElement, durationInSeconds: number): ToolBarDropDown {
  return new TimelinePanel(vp, parent, durationInSeconds);
}
