/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Timeline
 */

import "./TimelineComponent.scss";
import classnames from "classnames";
import * as React from "react";
import { GenericUiEventArgs, RelativePosition, UiAdmin } from "@bentley/ui-abstract";
import { UiComponents } from "../UiComponents";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { InlineEdit } from "./InlineEdit";
import { PlaybackSettings, TimelinePausePlayAction, TimelinePausePlayArgs } from "./interfaces";
import { PlayButton, PlayerButton } from "./PlayerButton";
import { Scrubber } from "./Scrubber";

// cspell:ignore millisec

const slowSpeed = 60 * 1000;
const mediumSpeed = 20 * 1000;
const fastSpeed = 10 * 1000;

/** @public */
interface TimelineComponentProps {
  startDate?: Date; // start date
  endDate?: Date;   // end date
  totalDuration: number;  // total duration in milliseconds
  initialDuration?: number;  // initial value for current duration in milliseconds
  /* For future use. This prop will always be treated as true. */
  minimized?: boolean;  // show in minimized mode
  repeat?: boolean;  // repeat animation indefinitely
  showDuration?: boolean; // show the duration instead of time
  onChange?: (duration: number) => void; // callback with current value (as a fraction)
  onPlayPause?: (playing: boolean) => void; // callback triggered when play/pause button is pressed
  onJump?: (forward: boolean) => void; // callback triggered when backward/forward buttons are pressed
  onSettingsChange?: (arg: PlaybackSettings) => void; // callback triggered when a setting is changed
  /* For future use. This prop will always be treated as true */
  alwaysMinimized?: boolean; // always display in miniMode with no expand menu
  componentId?: string; // must be set to use TimelineComponentEvents
}

/** @public */
interface TimelineComponentState {
  isSettingsOpen: boolean; // settings popup is opened or closed
  isPlaying: boolean; // timeline is currently playing or paused
  /* For future use. This will always be true */
  minimized?: boolean; // minimized mode
  currentDuration: number; // current duration in milliseconds
  totalDuration: number;  // total duration in milliseconds
  repeat: boolean; // automatically restart when the timeline is finished playing
}

/** Component used to playback timeline data
 * @public
 */
export class TimelineComponent extends React.Component<TimelineComponentProps, TimelineComponentState> {
  private _timeLastCycle = 0;
  private _requestFrame = 0;
  private _unmounted = false;
  private _settings: HTMLElement | null = null;
  private _expandLabel: string = "Expand";
  private _minimizeLabel: string = "Minimize";
  private _repeatLabel: string = "Repeat";
  private _removeListener?: () => void;

  constructor(props: TimelineComponentProps) {
    super(props);

    this.state = {
      isSettingsOpen: false,
      isPlaying: false,
      minimized: true,
      currentDuration: props.initialDuration ? props.initialDuration : /* istanbul ignore next */ 0,
      totalDuration: this.props.totalDuration,
      repeat: this.props.repeat ? true : false,
    };

    this._expandLabel = UiComponents.translate("timeline.expand");
    this._minimizeLabel = UiComponents.translate("timeline.minimize");
    this._repeatLabel = UiComponents.translate("timeline.repeat");
    // istanbul ignore else
    if (this.props.componentId) { // can't handle an event if we have no id
      this._removeListener = UiAdmin.onGenericUiEvent.addListener(this._handleTimelinePausePlayEvent);
    }
  }

  public componentWillUnmount() {
    if (this._removeListener)
      this._removeListener();
    window.cancelAnimationFrame(this._requestFrame);
    this._unmounted = true;
  }

  public shouldComponentUpdate(nextProps: TimelineComponentProps, nextState: TimelineComponentState) {
    let result = false;

    // istanbul ignore next
    if (nextState !== this.state || nextProps !== this.props ||
      nextProps.startDate !== this.props.startDate ||
      nextProps.endDate !== this.props.endDate ||
      nextProps.initialDuration !== this.props.initialDuration ||
      nextProps.repeat !== this.props.repeat
    )
      result = true;

    return result;
  }

  public componentDidUpdate(prevProps: TimelineComponentProps) {
    // istanbul ignore else
    if (this.props.initialDuration !== prevProps.initialDuration) {
      this._setDuration(this.props.initialDuration ? this.props.initialDuration : /* istanbul ignore next */ 0);
    }

    // istanbul ignore else
    if (this.props.repeat !== prevProps.repeat) {
      this._changeRepeatSetting(this.props.repeat);
    }

    // istanbul ignore else
    if (this.props.totalDuration !== prevProps.totalDuration) {
      this._onSetTotalDuration(this.props.totalDuration);
    }
  }
  private _handleTimelinePausePlayEvent = (args: GenericUiEventArgs): void => {
    const timelineArgs = args as TimelinePausePlayArgs;
    // istanbul ignore else
    if (!timelineArgs || this.props.componentId !== timelineArgs.uiComponentId || timelineArgs.timelineAction === undefined)
      return;

    let startPlaying: boolean;
    switch (timelineArgs.timelineAction) {
      case TimelinePausePlayAction.Play:
        startPlaying = true;
        break;
      case TimelinePausePlayAction.Pause:
        startPlaying = false;
        break;
      case TimelinePausePlayAction.Toggle:
        startPlaying = !this.state.isPlaying;
        break;
      // istanbul ignore next
      default:
        return; // throw error?
    }
    if (startPlaying)
      this._onPlay();
    else
      this._onPause();
  };

  // user clicked backward button
  private _onBackward = () => {
    // istanbul ignore else
    if (this.props.onJump)
      this.props.onJump(false);
  };

  // user clicked forward button
  private _onForward = () => {
    // istanbul ignore else
    if (this.props.onJump)
      this.props.onJump(true);
  };

  // user clicked play button
  private _onPlay = () => {
    // istanbul ignore if
    if (this.state.isPlaying)
      return;

    // timeline was complete, restart from the beginning
    if (this.state.currentDuration >= this.state.totalDuration) {
      this._replay();
    } else
      this._play();

    // istanbul ignore else
    if (this.props.onPlayPause)
      this.props.onPlayPause(true);
  };

  // user clicked pause button
  private _onPause = () => {
    // istanbul ignore if
    if (!this.state.isPlaying)
      return;

    // stop requesting frames
    window.cancelAnimationFrame(this._requestFrame);

    // stop playing
    this.setState({ isPlaying: false });

    // istanbul ignore else
    if (this.props.onPlayPause)
      this.props.onPlayPause(false);
  };

  // user clicked on timeline rail or dragged scrubber handle
  private _onTimelineChange = (values: ReadonlyArray<number>) => {
    const currentDuration = values[0];
    this._setDuration(currentDuration);
  };

  // set the current duration, which will call the OnChange callback
  private _setDuration = (currentDuration: number) => {
    this._timeLastCycle = new Date().getTime();
    if (!this._unmounted)
      this.setState({ currentDuration });
    // istanbul ignore else
    if (this.props.onChange) {
      const fraction = currentDuration / this.state.totalDuration;
      this.props.onChange(fraction);
    }
  };

  // recursively update the animation until we hit the end or the pause button is clicked
  private _updateAnimation = (_timestamp: number) => {
    // istanbul ignore else
    if (!this.state.isPlaying && !this._unmounted) {
      return;
    }

    // update duration
    const currentTime = new Date().getTime();
    const millisecondsElapsed = currentTime - this._timeLastCycle;
    const duration = this.state.currentDuration + millisecondsElapsed;
    this._setDuration(duration);

    // stop the animation!
    if (duration >= this.state.totalDuration) {
      window.cancelAnimationFrame(this._requestFrame);
      this.setState({ isPlaying: false });
      if (this.state.repeat)
        this._replay();
      else {
        // istanbul ignore else
        if (this.props.onPlayPause)
          this.props.onPlayPause(false);
      }

      return;
    }

    // continue the animation - request the next frame
    this._requestFrame = window.requestAnimationFrame(this._updateAnimation);
  };

  private _play() {
    // start playing
    this.setState({ isPlaying: true }, () => {
      // request the next frame
      this._timeLastCycle = new Date().getTime();
      this._requestFrame = window.requestAnimationFrame(this._updateAnimation);
    });
  }

  private _replay = () => {
    // timeline was complete, restart from the beginning
    this.setState({ currentDuration: 0 }, (() => this._play()));
  };

  private _displayTime(millisec: number) {
    const addZero = (i: number) => {
      return (i < 10) ? `0${i}` : i;
    };

    const date = new Date(millisec);
    // const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return `${addZero(minutes)}:${addZero(seconds)}`;
  }

  private _getMilliseconds(time: string) {
    // istanbul ignore else - WIP
    if (time.indexOf(":") !== -1) {
      return (Number(time.split(":")[0]) * 60 + Number(time.split(":")[1])) * 1000;
    } else {
      return Number(time) * 1000;
    }
  }

  // user changed the total duration
  private _onTotalDurationChange = (value: string) => {
    // NOTE: we should reset the current duration to 0
    const milliseconds = this._getMilliseconds(value);
    this._onSetTotalDuration(milliseconds);
  };

  private _onSettingsClick = () => {
    this.setState((prevState) => ({ isSettingsOpen: !prevState.isSettingsOpen }));
  };

  private _onCloseSettings = () => {
    this.setState({ isSettingsOpen: false });
  };

  // istanbul ignore next - WIP
  private _onModeChanged = () => {
    this.setState(
      (prevState) => ({ minimized: !prevState.minimized, isSettingsOpen: false }),
      () => {
        if (this.props.onSettingsChange) {
          this.props.onSettingsChange({ minimized: this.state.minimized });
        }
      });
  };
  private _changeRepeatSetting = (newValue?: boolean) => {
    // istanbul ignore else
    if (newValue !== undefined) {
      this.setState(
        () => ({ repeat: newValue, isSettingsOpen: false }),
        () => {
          // istanbul ignore else
          if (this.props.onSettingsChange) {
            this.props.onSettingsChange({ loop: this.state.repeat });
          }
        });
    }
  };

  private _onRepeatChanged = () => {
    this.setState(
      (prevState) => ({ repeat: !prevState.repeat, isSettingsOpen: false }),
      () => {
      // istanbul ignore else
        if (this.props.onSettingsChange) {
          this.props.onSettingsChange({ loop: this.state.repeat });
        }
      });
  };

  private _currentDate = (): Date => {
    const fraction = this.state.currentDuration / this.state.totalDuration;
    if (this.props.endDate && this.props.startDate) {
      const timeElapsed = (this.props.endDate.getTime() - this.props.startDate.getTime()) * fraction;
      return new Date(this.props.startDate.getTime() + timeElapsed);
    }
    return new Date();
  };

  private _onSetTotalDuration = (milliseconds: number) => {
    this.setState(
      { totalDuration: milliseconds, isSettingsOpen: false },
      () => {
        // istanbul ignore else
        if (this.props.onSettingsChange) {
          this.props.onSettingsChange({ duration: milliseconds });
        }
      });
  };

  private _renderSettings = () => {
    const expandName = (this.state.minimized) ? this._expandLabel : this._minimizeLabel;
    const hasDates = this.props.startDate && this.props.endDate;
    const alwaysMinimized = this.props.alwaysMinimized;
    const { totalDuration } = this.state;
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <span data-testid="timeline-settings" className="timeline-settings icon icon-more-vertical-2" ref={(element) => this._settings = element} onClick={this._onSettingsClick}
          role="button" tabIndex={-1} title={UiComponents.translate("button.label.settings")}
        ></span>
        <ContextMenu parent={this._settings} isOpened={this.state.isSettingsOpen} onClickOutside={this._onCloseSettings.bind(this)} position={RelativePosition.BottomRight}>
          {!alwaysMinimized && hasDates && <ContextMenuItem name={expandName} onClick={this._onModeChanged} />}
          <ContextMenuItem name={this._repeatLabel} checked={this.state.repeat} onClick={this._onRepeatChanged} />
          <ContextMenuItem isSeparator={true} />
          <ContextMenuItem name={UiComponents.translate("timeline.slow")} checked={totalDuration === slowSpeed} onClick={this._onSetTotalDuration.bind(this, slowSpeed)} />
          <ContextMenuItem name={UiComponents.translate("timeline.medium")} checked={totalDuration === mediumSpeed} onClick={this._onSetTotalDuration.bind(this, mediumSpeed)} />
          <ContextMenuItem name={UiComponents.translate("timeline.fast")} checked={totalDuration === fastSpeed} onClick={this._onSetTotalDuration.bind(this, fastSpeed)} />
        </ContextMenu>
      </>
    );
  };

  public render() {
    const { startDate, endDate, showDuration } = this.props;
    const { currentDuration, totalDuration, minimized } = this.state;
    const currentDate = this._currentDate();
    const durationString = this._displayTime(currentDuration);
    const totalDurationString = this._displayTime(totalDuration);
    const hasDates = startDate && endDate;
    const miniMode = minimized || !hasDates;

    return (
      <div data-testid="timeline-component" className={classnames("timeline-component", miniMode && "minimized", hasDates && "has-dates")} >
        <div className="header">
          <PlayButton className="play-button" isPlaying={this.state.isPlaying} onPlay={this._onPlay} onPause={this._onPause} />
          <PlayerButton className="play-backward" icon="icon-caret-left" onClick={this._onBackward}
            title={UiComponents.translate("timeline.backward")} />
          <PlayerButton className="play-button-step" icon="icon-media-controls-circular-play"
            isPlaying={this.state.isPlaying} onPlay={this._onPlay} onPause={this._onPause}
            title={UiComponents.translate("timeline.step")} />
          <PlayerButton className="play-forward" icon="icon-caret-right" onClick={this._onForward}
            title={UiComponents.translate("timeline.backward")} />
          <span className="current-date">{currentDate.toLocaleDateString()}</span>
          {!miniMode && this._renderSettings()}
        </div>
        <div className="scrubber">
          <PlayButton className="play-button" isPlaying={this.state.isPlaying} onPlay={this._onPlay} onPause={this._onPause} />
          <div className="start-time-container">
            {hasDates && <span className="start-date">{startDate!.toLocaleDateString()}</span>}
            {hasDates && !showDuration && <span className="start-time">{startDate!.toLocaleTimeString()}</span>}
            {showDuration && <span className="duration-start-time">{durationString}</span>}
          </div>
          <Scrubber
            className="slider"
            currentDuration={this.state.currentDuration}
            totalDuration={totalDuration}
            startDate={startDate}
            endDate={endDate}
            isPlaying={this.state.isPlaying}
            inMiniMode={miniMode}
            showTime={!showDuration}
            onChange={this._onTimelineChange}
            onUpdate={this._onTimelineChange}
          />
          <div className="end-time-container">
            {hasDates && <span className="end-date">{endDate!.toLocaleDateString()}</span>}
            {hasDates && !showDuration && <span className="end-time">{endDate!.toLocaleTimeString()}</span>}
            {showDuration && <InlineEdit className="duration-end-time" defaultValue={totalDurationString} onChange={this._onTotalDurationChange} />}
          </div>
          {miniMode && this._renderSettings()}
        </div>
      </div>
    );
  }
}
