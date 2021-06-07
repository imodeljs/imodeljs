/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ContentView
 */

import "./DefaultViewOverlay.scss";
import * as React from "react";
import { IModelApp, ScreenViewport, Viewport } from "@bentley/imodeljs-frontend";
import { SolarDataProvider, SolarTimeline, TimelineComponent, TimelineDataProvider } from "@bentley/ui-components";
import { SyncUiEventArgs, SyncUiEventDispatcher, SyncUiEventId } from "../syncui/SyncUiEventDispatcher";
import { AnalysisAnimationTimelineDataProvider } from "../timeline/AnalysisAnimationProvider";
import { ScheduleAnimationTimelineDataProvider } from "../timeline/ScheduleAnimationProvider";
import { SolarTimelineDataProvider } from "../timeline/SolarTimelineDataProvider";
import { ContentViewManager } from "./ContentViewManager";

/** Props of Viewport Overlay Control that show timelines
 */
interface Props {
  viewport: ScreenViewport;
  onPlayPause?: (playing: boolean) => void; // callback with play/pause button is pressed
}

interface State {
  showOverlay: boolean;
  dataProvider?: TimelineDataProvider;
  solarDataProvider?: SolarDataProvider;
}

/** Overlay for iModel Viewport that will show either schedule, analysis, or solar timelines.
 * @alpha
 */
// istanbul ignore next
export class DefaultViewOverlay extends React.Component<Props, State> {
  private _componentMounted = false;
  private _removeListener?: () => void | undefined;

  constructor(props: any) {
    super(props);

    this.state = { dataProvider: undefined, showOverlay: false };
  }

  private _handleDisplayStyleChange = () => {
    setImmediate(() => {
      // reset to beginning of animation
      if (this.state.dataProvider) {
        if (this.state.dataProvider.onAnimationFractionChanged)
          this.state.dataProvider.onAnimationFractionChanged(0);

        if (this.props.viewport) {
          this.props.viewport.timePoint = undefined;
          this.props.viewport.analysisFraction = 0;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this._setTimelineDataProvider(this.props.viewport);
    });
  };

  public componentDidMount() {
    SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
    this._removeListener = this.props.viewport.onDisplayStyleChanged.addListener(this._handleDisplayStyleChange, this);
    this._componentMounted = true;
    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this._setTimelineDataProvider(this.props.viewport);
    });
  }

  private setShowOverlayState(): void {
    let showOverlay = this.isInActiveContentControl();
    if (showOverlay && this.state.solarDataProvider)
      showOverlay = this.state.solarDataProvider.shouldShowTimeline;
    if (showOverlay !== this.state.showOverlay) this.setState({ showOverlay });
  }

  private _onHandleViewChanged = (vp: Viewport) => {
    const viewId = this.state.dataProvider
      ? this.state.dataProvider.viewId
      : this.state.solarDataProvider
        ? this.state.solarDataProvider.viewId
        : "";
    if (vp.view.id !== viewId) {
      setImmediate(() => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._setTimelineDataProvider(vp as ScreenViewport);
      });
    } else {
      this.setShowOverlayState();
    }
  };

  public componentWillUnmount() {
    this._componentMounted = false;
    SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
    if (this.state.solarDataProvider && this.state.solarDataProvider.viewport) {
      if (this.state.solarDataProvider.viewport.onViewChanged)
        this.state.solarDataProvider.viewport.onViewChanged.removeListener(
          this._onHandleViewChanged,
        );
    }

    const activeContentControl = ContentViewManager.getActiveContentControl();
    if (activeContentControl && activeContentControl.viewport) {
      activeContentControl.viewport.analysisFraction = 0;
      activeContentControl.viewport.timePoint = undefined;
    }
    if (this._removeListener)
      this._removeListener();
  }

  private isInActiveContentControl(): boolean {
    const activeContentControl = ContentViewManager.getActiveContentControl();
    if (activeContentControl && activeContentControl.viewport) {
      if (activeContentControl.viewport.view.id === this.props.viewport.view.id) {
        return true;
      }
    }
    return false;
  }

  private _handleSyncUiEvent = (args: SyncUiEventArgs): void => {
    // istanbul ignore if
    if (this._componentMounted) return;

    // since this is a tool button automatically monitor the activation of tools so the active state of the button is updated.
    if (args.eventIds.has(SyncUiEventId.ActiveContentChanged)) {
      this.setShowOverlayState();
    }
    if (args.eventIds.has(SyncUiEventId.ContentControlActivated)) {
      this.setShowOverlayState();
    }
    if (args.eventIds.has(SyncUiEventId.FrontstageReady)) {
      this.setShowOverlayState();
    }
  };

  private async _getTimelineDataProvider(viewport: ScreenViewport): Promise<TimelineDataProvider | undefined> {
    let timelineDataProvider: TimelineDataProvider;

    timelineDataProvider = new ScheduleAnimationTimelineDataProvider(viewport.view, viewport);
    if (timelineDataProvider.supportsTimelineAnimation) {
      const dataLoaded = await timelineDataProvider.loadTimelineData();
      if (dataLoaded) {
        // double the default duration
        timelineDataProvider.updateSettings({ duration: 40 * 1000 });
        viewport.onViewChanged.removeListener(this._onHandleViewChanged);
        viewport.onViewChanged.addListener(this._onHandleViewChanged);
        return timelineDataProvider;
      }
    } else {
      timelineDataProvider = new AnalysisAnimationTimelineDataProvider(viewport.view, viewport);
      if (timelineDataProvider.supportsTimelineAnimation) {
        const dataLoaded = await timelineDataProvider.loadTimelineData();
        if (dataLoaded) {
          viewport.onViewChanged.removeListener(this._onHandleViewChanged);
          viewport.onViewChanged.addListener(this._onHandleViewChanged);
          return timelineDataProvider;
        }
      }
    }
    return undefined;
  }

  private _getSolarDataProvider(viewport: ScreenViewport): SolarDataProvider | undefined {
    if (IModelApp.renderSystem.options.displaySolarShadows) {
      if (this.state.solarDataProvider && this.state.solarDataProvider.viewport === viewport)
        return this.state.solarDataProvider;

      const solarDataProvider: SolarDataProvider = new SolarTimelineDataProvider(viewport.view, viewport);
      if (solarDataProvider.supportsTimelineAnimation) {
        viewport.onViewChanged.removeListener(this._onHandleViewChanged);
        viewport.onViewChanged.addListener(this._onHandleViewChanged);
        return solarDataProvider;
      }
    }

    return undefined;
  }

  private async _setTimelineDataProvider(viewport: ScreenViewport): Promise<void> {
    const dataProvider = await this._getTimelineDataProvider(viewport);
    if (dataProvider && dataProvider.supportsTimelineAnimation) {
      this.setState({
        dataProvider,
        showOverlay: this.isInActiveContentControl(),
        solarDataProvider: undefined,
      });
      return;
    }
    const solarDataProvider = this._getSolarDataProvider(viewport);
    if (solarDataProvider && solarDataProvider.supportsTimelineAnimation) {
      let showOverlay = this.isInActiveContentControl();
      if (showOverlay && !solarDataProvider.shouldShowTimeline) showOverlay = false;
      this.setState({ solarDataProvider, showOverlay, dataProvider: undefined });
      return;
    }
    this.setState({
      dataProvider: undefined,
      showOverlay: false,
      solarDataProvider: undefined,
    });
  }

  public render(): React.ReactNode {
    if (this.state.showOverlay) {
      if (this.state.solarDataProvider) {
        return (
          <div className="uifw-view-overlay">
            <div className="uifw-animation-overlay">
              <SolarTimeline dataProvider={this.state.solarDataProvider} />
            </div>
          </div>
        );
      }

      // handle both schedule and analysis animations
      if (this.state.dataProvider) {
        return (
          <div className="uifw-view-overlay">
            <div className="uifw-animation-overlay">
              <TimelineComponent
                startDate={this.state.dataProvider.start}
                endDate={this.state.dataProvider.end}
                initialDuration={this.state.dataProvider.initialDuration}
                totalDuration={this.state.dataProvider.duration}
                minimized={true}
                onChange={this.state.dataProvider.onAnimationFractionChanged}
                onPlayPause={this.props.onPlayPause}
              />
            </div>
          </div>
        );
      }
    }
    return null;
  }
}
