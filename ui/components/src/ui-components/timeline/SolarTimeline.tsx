/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Timeline
 */

// component is in alpha state - it may change after usability testing - test coverage not complete
/* istanbul ignore file */

import "./SolarTimeline.scss";
import classnames from "classnames";
import * as React from "react";
import { GetHandleProps, Handles, Rail, Slider, SliderItem, Ticks } from "react-compound-slider";
import { ColorByName, ColorDef, HSVColor } from "@bentley/imodeljs-common";
import { RelativePosition, TimeDisplay } from "@bentley/ui-abstract";
import { BodyText, CommonProps, ElementResizeObserver, Popup, Tooltip } from "@bentley/ui-core";
import { UiComponents } from "../../ui-components/UiComponents";
import { HueSlider } from "../color/HueSlider";
import { SaturationPicker } from "../color/SaturationPicker";
import { ColorSwatch } from "../color/Swatch";
import { SolarDataProvider } from "./interfaces";
import { PlayButton } from "./PlayerButton";
import { SpeedTimeline } from "./SpeedTimeline";
import { adjustDateToTimezone, DatePicker } from "../datepicker/DatePicker";
import { TimeField, TimeSpec } from "../datepicker/TimeField";

// cSpell:ignore millisec solarsettings showticks shadowcolor solartimeline

const millisecPerMinute = 1000 * 60;
const millisecPerHour = millisecPerMinute * 60;
const millisecPerDay = millisecPerHour * 24;
const scrubberIncrement = 1;
const defaultPlaybackDuration = 40 * 1000; // 40 seconds
const addZero = (i: number) => {
  return (i < 10) ? `0${i}` : i;
};

// *******************************************************
// HANDLE COMPONENT
// *******************************************************
interface HandleProps {
  domain: number[];
  handle: SliderItem;
  getHandleProps: GetHandleProps;
}

class Handle extends React.Component<HandleProps> {
  public override render() {
    const {
      domain: [min, max],
      handle: { id, value, percent },
      getHandleProps,
    } = this.props;

    return (
      <div
        className="solar-handle"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        style={{ left: `${percent}%` }}
        {...getHandleProps(id)}>
        <div /><div /><div />
      </div>
    );
  }
}

// *******************************************************
// TOOLTIP RAIL
// *******************************************************
interface TooltipRailProps {
  activeHandleID: string;
  getRailProps: (props: object) => object;
  getEventData: (e: Event) => object;
  formatTime: (millisec: number) => string;
  dayStartMs: number;
  sunrise: number; // offset from day start in milliseconds
  sunset: number;  // offset from day start in milliseconds
}

interface TooltipRailState {
  value: number | null;
  percent: number | null;
  tooltipTarget: HTMLDivElement | undefined;
}

class TooltipRail extends React.Component<TooltipRailProps, TooltipRailState> {

  public static defaultProps = {
    disabled: false,
  };

  constructor(props: TooltipRailProps) {
    super(props);

    this.state = {
      value: null,
      percent: null,
      tooltipTarget: undefined,
    };
  }

  private _onMouseEnter = () => {
    document.addEventListener("mousemove", this._onMouseMove);
  };

  private _onMouseLeave = () => {
    this.setState({ value: null, percent: null });
    document.removeEventListener("mousemove", this._onMouseMove);
  };

  private _onMouseMove = (e: Event) => {
    const { activeHandleID, getEventData } = this.props;

    if (activeHandleID) {
      this.setState({ value: null, percent: null });
    } else {
      this.setState(getEventData(e));
    }
  };

  private _handleTooltipTarget = (element: HTMLDivElement | null) => {
    this.setState({
      tooltipTarget: element || undefined,
    });
  };

  public override render() {
    const { value, percent } = this.state;
    const { formatTime, activeHandleID, getRailProps, dayStartMs, sunrise, sunset } = this.props;
    const leftOffset = (sunrise / millisecPerDay) * 100;
    const sunWidth = ((sunset - sunrise) / millisecPerDay) * 100;

    return (
      <>
        {!activeHandleID && value ? (
          <div className="rail-tooltip" ref={this._handleTooltipTarget} style={{ left: `${percent}%` }}>
            <Tooltip
              className="components-rail-tooltip"
              target={this.state.tooltipTarget}
              visible
            >
              {formatTime(dayStartMs + value)}
            </Tooltip>
          </div>
        ) : null}
        <div className="rail-inner" />
        <div
          className="rail-outer"
          {...getRailProps({
            onMouseEnter: this._onMouseEnter,
            onMouseLeave: this._onMouseLeave,
          })}
        />
        <div className="rail-solar" style={{ left: `${leftOffset}%`, width: `${sunWidth}%` }} />
      </>
    );
  }
}

// *******************************************************
// TICK COMPONENT
// *******************************************************
interface TickProps {
  tick: SliderItem;
  count: number;
  index: number;
  width: number;
  formatTick: (millisec: number) => string;
}

function Tick({ tick, count, formatTick }: TickProps) {
  return (
    <div>
      <div className="tick-mark" style={{ left: `${tick.percent}%` }} />
      <div className="tick-label" style={{ marginLeft: `${-(100 / count) / 2}%`, width: `${100 / count}%`, left: `${tick.percent}%` }}>
        {formatTick(tick.value)}
      </div>
    </div>
  );
}

interface TimelineProps extends CommonProps {
  dayStartMs: number;
  sunRiseOffsetMs: number;
  sunSetOffsetMs: number;
  currentTimeOffsetMs: number;
  formatTick?: (millisec: number) => string;
  formatTime: (millisec: number) => string;
  onChange?: (values: ReadonlyArray<number>) => void;
  onUpdate?: (values: ReadonlyArray<number>) => void;
}

interface TimelineState {
  sunriseTooltipTarget: HTMLSpanElement | undefined;
  sunsetTooltipTarget: HTMLSpanElement | undefined;
  timelineElement: HTMLDivElement | null;
}

class Timeline extends React.PureComponent<TimelineProps, TimelineState> {
  private _timelineRef = React.createRef<HTMLDivElement>();
  public override readonly state = {
    sunriseTooltipTarget: undefined,
    sunsetTooltipTarget: undefined,
    timelineElement: null,
  };

  private _getTickValues = (width: number) => {
    const tickValues: number[] = [];
    let tickIncrement = millisecPerHour;
    if (width > 600 && width < 900)
      tickIncrement = millisecPerHour * 2;
    else if (width <= 600)
      tickIncrement = millisecPerHour * 4;

    let tickValue = 0;
    while (tickValue <= millisecPerDay) {
      tickValues.push(tickValue);
      tickValue += tickIncrement;
    }
    return tickValues;
  };

  private _handleSunriseTooltipTarget = (element: HTMLSpanElement | null) => {
    this.setState({
      sunriseTooltipTarget: element || undefined,
    });
  };

  private _handleSunsetTooltipTarget = (element: HTMLSpanElement | null) => {
    this.setState({
      sunsetTooltipTarget: element || undefined,
    });
  };

  /** @internal */
  public override componentDidMount() {
    this.setState({ timelineElement: this._timelineRef.current });
  }

  public override render() {
    const { formatTick, formatTime, onChange, onUpdate, dayStartMs, sunSetOffsetMs, sunRiseOffsetMs, currentTimeOffsetMs } = this.props;
    const domain = [0, millisecPerDay];
    const className = classnames("solar-slider", this.props.className, formatTick && "showticks");
    const sunRiseFormat = formatTime(dayStartMs + sunRiseOffsetMs);
    const sunSetFormat = formatTime(dayStartMs + sunSetOffsetMs);
    return (
      <div className={className}>
        <span className="sunrise" ref={this._handleSunriseTooltipTarget}>
          &#x2600;
          <Tooltip
            target={this.state.sunriseTooltipTarget}
          >
            {sunRiseFormat}
          </Tooltip>
        </span>
        <div ref={this._timelineRef} className="ui-component-solar-slider-sizer">
          <ElementResizeObserver watchedElement={this.state.timelineElement}
            render={({ width }) => (
              <Slider
                mode={(curr, next) => {
                  // hodgepodge way to get around type issue in react-compound-slider package
                  const nextValue = ((next[0] as unknown) as MySliderModeValue).val;
                  if (nextValue > sunSetOffsetMs || nextValue < sunRiseOffsetMs) {
                    return curr;
                  }
                  return next;
                }}
                step={scrubberIncrement}
                domain={domain}
                rootStyle={{ position: "relative", height: "100%", flex: "1", margin: "0 10px" }}
                onChange={onChange}
                onUpdate={onUpdate}
                values={[currentTimeOffsetMs]}>
                <Rail>
                  {(railProps) => <TooltipRail {...railProps} dayStartMs={dayStartMs} sunset={sunSetOffsetMs} sunrise={sunRiseOffsetMs} formatTime={formatTime} />}
                </Rail>
                <Handles>
                  {({ handles, getHandleProps }) => (
                    <div className="slider-handles">
                      {handles.map((handle: SliderItem) => (
                        <Handle
                          key={handle.id}
                          handle={handle}
                          domain={[sunRiseOffsetMs, sunSetOffsetMs]}
                          getHandleProps={getHandleProps}
                        />
                      ))}
                    </div>
                  )}
                </Handles>
                {formatTick && width &&
                  <Ticks values={this._getTickValues(width)}>
                    {({ ticks }) => (
                      <div className="slider-ticks">
                        {ticks.map((tick: any, index: number) => (
                          <Tick
                            key={tick.id}
                            tick={tick}
                            count={ticks.length}
                            width={width}
                            index={index}
                            formatTick={formatTick}
                          />
                        ))}
                      </div>
                    )}
                  </Ticks>
                }
              </Slider>
            )}
          />
        </div>
        <span className="sunset" ref={this._handleSunsetTooltipTarget}>
          &#x263D;
          <Tooltip target={this.state.sunsetTooltipTarget}>
            {sunSetFormat}
          </Tooltip>
        </span>
      </div>
    );
  }
}

interface SolarTimelineComponentProps {
  dataProvider: SolarDataProvider;  // provides date, sunrise, sunset in millisecs, also contains timezone offset from UTC, and updates the display style to current time.
  onPlayPause?: (playing: boolean) => void; // callback triggered when play/pause button is pressed
  duration?: number;  // playback duration in milliseconds
  speed?: number;
}

interface SolarTimelineComponentState {
  isPlaying: boolean;     // timeline is currently playing or paused
  isDateOpened: boolean;  // date picker is opened
  isSettingsOpened: boolean;  // settings popup is opened
  dayStartMs: number;
  sunRiseOffsetMs: number;
  sunSetOffsetMs: number;
  sunDeltaMs: number;
  currentTimeOffsetMs: number;
  speed: number;
  loop: boolean;
  isExpanded: boolean;
  shadowColor: ColorDef;
  duration: number;  // playback duration in milliseconds
  adjustedDuration: number;  // playback duration in milliseconds/ speed
}

/** create local type that can be used to retrieve slider values */
interface MySliderModeValue {
  key: string;
  val: number;
}

/** Solar Timeline
 * @alpha
 */
export class SolarTimeline extends React.PureComponent<SolarTimelineComponentProps, SolarTimelineComponentState> {
  private _datePicker: HTMLElement | null = null;
  private _settings: HTMLElement | null = null;
  private _requestFrame = 0;
  private _unmounted = false;
  private _timeLastCycle = 0;
  private _totalPlayTime = 0;
  private _settingsPopupTitle = UiComponents.i18n.translate("UiComponents:solarsettings.shadowcolor");
  private _playLabel = UiComponents.i18n.translate("UiComponents:solartimeline.play");
  private _settingLabel = UiComponents.i18n.translate("UiComponents:solartimeline.settings");
  private _loopLabel = UiComponents.i18n.translate("UiComponents:timeline.repeat");
  private _speedLabel = UiComponents.i18n.translate("UiComponents:solartimeline.speed");
  private _expandLabel = UiComponents.i18n.translate("UiComponents:timeline.expand");
  private _minimizeLabel = UiComponents.i18n.translate("UiComponents:timeline.minimize");
  private _dateTimeLabel = UiComponents.i18n.translate("UiComponents:solartimeline.dateTime");

  private _months = [
    UiComponents.i18n.translate("UiComponents:month.short.january"),
    UiComponents.i18n.translate("UiComponents:month.short.february"),
    UiComponents.i18n.translate("UiComponents:month.short.march"),
    UiComponents.i18n.translate("UiComponents:month.short.april"),
    UiComponents.i18n.translate("UiComponents:month.short.may"),
    UiComponents.i18n.translate("UiComponents:month.short.june"),
    UiComponents.i18n.translate("UiComponents:month.short.july"),
    UiComponents.i18n.translate("UiComponents:month.short.august"),
    UiComponents.i18n.translate("UiComponents:month.short.september"),
    UiComponents.i18n.translate("UiComponents:month.short.october"),
    UiComponents.i18n.translate("UiComponents:month.short.november"),
    UiComponents.i18n.translate("UiComponents:month.short.december"),
  ];

  private _timeLabel = UiComponents.translate("datepicker.time");
  private _amLabel = UiComponents.i18n.translate("UiComponents:time.am");
  private _pmLabel = UiComponents.i18n.translate("UiComponents:time.pm");
  private readonly _presetColors = [
    ColorDef.create(ColorByName.grey),
    ColorDef.create(ColorByName.lightGrey),
    ColorDef.create(ColorByName.darkGrey),
    ColorDef.create(ColorByName.lightBlue),
    ColorDef.create(ColorByName.lightGreen),
    ColorDef.create(ColorByName.darkGreen),
    ColorDef.create(ColorByName.tan),
    ColorDef.create(ColorByName.darkBrown),
  ];

  constructor(props: SolarTimelineComponentProps) {
    super(props);

    const dayStartMs = this.props.dataProvider.dayStartMs;
    const sunRiseOffsetMs = this.props.dataProvider.sunrise.getTime() - dayStartMs;
    const sunSetOffsetMs = this.props.dataProvider.sunset.getTime() - dayStartMs;
    const sunDeltaMs = sunSetOffsetMs - sunRiseOffsetMs;
    const sunOffsetMs = this.props.dataProvider.timeOfDay.getTime() - dayStartMs;
    const currentTimeOffsetMs = this.ensureRange(sunOffsetMs, sunRiseOffsetMs, sunSetOffsetMs);
    const shadowColor = this.props.dataProvider.shadowColor;
    const duration = this.props.duration ? this.props.duration : defaultPlaybackDuration;
    const speed = this.props.speed ? this.props.speed : 2;
    const adjustedDuration = duration / speed;
    this.setPlaybackTimeBySunTime(currentTimeOffsetMs, sunRiseOffsetMs, sunDeltaMs, adjustedDuration);

    this.state = {
      isDateOpened: false,
      isSettingsOpened: false,
      isPlaying: false,
      dayStartMs,
      sunRiseOffsetMs,
      sunSetOffsetMs,
      sunDeltaMs,
      currentTimeOffsetMs,
      speed,
      isExpanded: false,
      loop: false,
      shadowColor,
      duration,
      adjustedDuration,
    };
  }

  public override componentWillUnmount() {
    window.cancelAnimationFrame(this._requestFrame);
    this._unmounted = true;
  }

  // recursively update the animation until we hit the end or the pause button is clicked
  private _updateAnimation = (_timestamp: number) => {
    // istanbul ignore else
    if (!this.state.isPlaying || this._unmounted) {
      window.cancelAnimationFrame(this._requestFrame);
      return;
    }

    const currentTime = new Date().getTime();
    this._totalPlayTime += (currentTime - this._timeLastCycle);
    this._timeLastCycle = currentTime;
    let percentComplete = this._totalPlayTime / this.state.adjustedDuration;
    if (percentComplete > 1)
      percentComplete = 1;

    let newPlayingState = true;

    // calculate the next sun time base on the percentage playback complete - should be int value as that is step amount for slider
    let nextSunOffset = Math.floor(this.state.sunRiseOffsetMs + (percentComplete * this.state.sunDeltaMs));

    if (percentComplete > 0.99) {
      if (!this.state.loop) {
        newPlayingState = false;
        nextSunOffset = this.state.sunSetOffsetMs;
        window.cancelAnimationFrame(this._requestFrame);
      } else {
        nextSunOffset = this.state.sunRiseOffsetMs;
        this._totalPlayTime = 0;
      }
    }

    if (this.props.dataProvider.onTimeChanged) {
      const currentSunTime = new Date(this.state.dayStartMs + nextSunOffset);
      this.props.dataProvider.onTimeChanged(currentSunTime);
    }

    this.setState({ isPlaying: newPlayingState, currentTimeOffsetMs: nextSunOffset }, () => {
      if (newPlayingState)
        this._requestFrame = window.requestAnimationFrame(this._updateAnimation);
    });
  };

  private _play(sunTimeMs: number) {
    this._timeLastCycle = new Date().getTime();

    // start playing
    this.setState({ isPlaying: true, currentTimeOffsetMs: sunTimeMs }, () => {
      this._requestFrame = window.requestAnimationFrame(this._updateAnimation);
      // istanbul ignore else
      if (this.props.onPlayPause)
        this.props.onPlayPause(true);
    });
  }

  // user clicked pause button
  private _onPause = () => {
    // istanbul ignore if
    if (!this.state.isPlaying)
      return;

    const currentTime = new Date().getTime();
    this._totalPlayTime += (currentTime - this._timeLastCycle);

    // stop requesting frames
    window.cancelAnimationFrame(this._requestFrame);

    // stop playing
    this.setState({ isPlaying: false });

    // istanbul ignore else
    if (this.props.onPlayPause)
      this.props.onPlayPause(false);
  };

  // user clicked play button
  private _onPlay = () => {
    // istanbul ignore if
    if (this.state.isPlaying)
      return;

    if (this.state.currentTimeOffsetMs >= this.state.sunSetOffsetMs || this.state.currentTimeOffsetMs <= this.state.sunRiseOffsetMs) {
      this._totalPlayTime = 0;
      this._play(this.state.sunRiseOffsetMs);
    } else {
      this._play(this.state.currentTimeOffsetMs);
    }
  };

  private setPlaybackTimeBySunTime(sunOffsetMs: number, sunRiseOffsetMs: number, sunDeltaMs: number, adjustedDuration?: number) {
    this._totalPlayTime = ((sunOffsetMs - sunRiseOffsetMs) / (sunDeltaMs)) * ((adjustedDuration) ? adjustedDuration : this.state.adjustedDuration);
  }

  /** note the day passed in is in the time of the current user not in project time because the date picker works in
   * local time  */
  private _onDayClick = (day: Date) => {
    const selectedDate = new Date(day.getTime() + this.state.currentTimeOffsetMs);
    this.props.dataProvider.setDateAndTime(selectedDate);
    const dayStartMs = this.props.dataProvider.dayStartMs;
    const sunRiseOffsetMs = this.props.dataProvider.sunrise.getTime() - dayStartMs;
    const sunSetOffsetMs = this.props.dataProvider.sunset.getTime() - dayStartMs;
    const sunDeltaMs = sunSetOffsetMs - sunRiseOffsetMs;

    const sunOffsetMs = this.ensureRange(this.state.currentTimeOffsetMs, sunRiseOffsetMs, sunSetOffsetMs);
    this.setPlaybackTimeBySunTime(sunOffsetMs, sunRiseOffsetMs, sunDeltaMs);

    /** call dataProvider to update display style */
    if (this.props.dataProvider.onTimeChanged)
      this.props.dataProvider.onTimeChanged(this.props.dataProvider.timeOfDay);

    this.setState({ dayStartMs, sunRiseOffsetMs, sunSetOffsetMs, currentTimeOffsetMs: sunOffsetMs, sunDeltaMs, isDateOpened: false }, () => {
      this._timeLastCycle = new Date().getTime();
    });
  };

  private _onTimeChanged = (time: TimeSpec) => {
    // compute the current date (with time)
    const dayStartMs = this.props.dataProvider.dayStartMs;
    const sunTime = (time.hours * millisecPerHour) + (time.minutes * millisecPerMinute);
    const dateWithNewTime = new Date(dayStartMs + sunTime);
    this.props.dataProvider.setDateAndTime(dateWithNewTime, true);

    // notify the provider to update style
    if (this.props.dataProvider.onTimeChanged)
      this.props.dataProvider.onTimeChanged(dateWithNewTime);

    const currentTimeOffsetMs = this.ensureRange(sunTime, this.state.sunRiseOffsetMs, this.state.sunSetOffsetMs);

    this.setPlaybackTimeBySunTime(currentTimeOffsetMs, this.state.sunRiseOffsetMs, this.state.sunDeltaMs);
    this._timeLastCycle = new Date().getTime();

    // update the timeline
    this.setState({ currentTimeOffsetMs });
  };

  private _onCloseDayPicker = () => {
    this.setState({ isDateOpened: false });
  };

  private _onOpenDayPicker = () => {
    this.setState((prevState) => ({ isDateOpened: !prevState.isDateOpened }));
  };

  private _onCloseSettingsPopup = () => {
    this.setState({ isSettingsOpened: false });
  };

  private _onOpenSettingsPopup = () => {
    this.setState((prevState) => ({ isSettingsOpened: !prevState.isSettingsOpened }));
  };

  private ensureRange(value: number, min: number, max: number): number {
    return Math.max(Math.min(value, max), min);
  }

  private processSunTimeChange(sunTime: number) {
    if (sunTime === this.state.currentTimeOffsetMs)
      return;

    const currentTimeOffsetMs = this.ensureRange(sunTime, this.state.sunRiseOffsetMs, this.state.sunSetOffsetMs);

    if (this.props.dataProvider.onTimeChanged) {
      const currentSunTime = new Date(this.state.dayStartMs + currentTimeOffsetMs);
      this.props.dataProvider.onTimeChanged(currentSunTime);
    }

    this.setState({ currentTimeOffsetMs }, () => {
      const currentTime = new Date().getTime();
      this._timeLastCycle = currentTime;
      const percentComplete = (currentTimeOffsetMs - this.state.sunRiseOffsetMs) / this.state.sunDeltaMs;
      this._totalPlayTime = percentComplete * this.state.adjustedDuration;
    });
  }

  private _onUpdate = (values: ReadonlyArray<number>) => {
    if (!this.state.isPlaying)
      this.processSunTimeChange(values[0]);
  };

  private _onChange = (values: ReadonlyArray<number>) => {
    if (!this.state.isPlaying)
      this.processSunTimeChange(values[0]);
  };

  private _onSpeedChange = (value: number) => {
    const adjustedDuration = this.state.duration / value;
    this.setState({ speed: value, adjustedDuration });
  };

  private _onToggleLoop = () => {
    this.setState((prevState) => ({ loop: !prevState.loop }));
  };

  private _onToggleDisplay = () => {
    this.setState((prevState) => ({ isExpanded: !prevState.isExpanded }));
  };

  private _formatTick = (millisec: number) => {
    const hour = millisec / millisecPerHour;
    const abbrev = (hour < 12) ? this._amLabel : (hour === 24) ? this._amLabel : this._pmLabel;
    const newHour = (hour === 0) ? 12 : (hour <= 12) ? hour : hour - 12;
    return `${newHour}${abbrev}`;
  };

  private _formatTime = (millisec: number) => {
    const date = new Date(millisec);
    // convert project date to browser locale date
    const localTime = adjustDateToTimezone(date, this.props.dataProvider.timeZoneOffset * 60);
    let hours = localTime.getHours();
    const minutes = addZero(date.getMinutes());
    const abbrev = (hours < 12) ? this._amLabel : (hours === 24) ? this._amLabel : this._pmLabel;
    hours = (hours > 12) ? hours - 12 : hours;
    return `${hours}:${minutes} ${abbrev}`;
  };

  private _onPresetColorPick = (shadowColor: ColorDef) => {
    this.setState({ shadowColor }, () => this.props.dataProvider.shadowColor = shadowColor);
  };

  private _handleHueOrSaturationChange = (hueOrSaturation: HSVColor) => {
    if (hueOrSaturation.s === 0)  // for a ColorDef to be created from hsv s can't be 0
      hueOrSaturation = hueOrSaturation.clone(undefined, 0.5);

    const shadowColor = hueOrSaturation.toColorDef();
    this.setState({ shadowColor }, () => this.props.dataProvider.shadowColor = shadowColor);
  };

  public getLocalTime(ticks: number): Date {
    const projectTime = new Date(ticks);
    // convert project date to browser locale date
    return adjustDateToTimezone(projectTime, this.props.dataProvider.timeZoneOffset * 60);
  }

  public override render() {
    const { dataProvider } = this.props;
    const { speed, loop, currentTimeOffsetMs, isExpanded, sunRiseOffsetMs, sunSetOffsetMs } = this.state;
    const localTime = this.getLocalTime(this.state.dayStartMs + this.state.currentTimeOffsetMs);
    const formattedTime = this._formatTime(dataProvider.dayStartMs + currentTimeOffsetMs);
    const formattedDate = `${this._months[localTime.getMonth()]}, ${localTime.getDate()}`;

    const colorSwatchStyle: React.CSSProperties = {
      width: `100%`,
      height: `100%`,
    };
    const expandMinimizeLabel = isExpanded ? this._expandLabel : this._minimizeLabel;

    return (
      <div className={classnames("solar-timeline-wrapper", isExpanded && "expanded")} >
        <Timeline className="solar-timeline-expanded"
          dayStartMs={dataProvider.dayStartMs}
          sunSetOffsetMs={sunSetOffsetMs}
          sunRiseOffsetMs={sunRiseOffsetMs}
          currentTimeOffsetMs={currentTimeOffsetMs}
          onChange={this._onChange}
          onUpdate={this._onUpdate}
          formatTime={this._formatTime}
          formatTick={this._formatTick}
        />
        <div className="header">
          <PlayButton tooltip={this._playLabel} className="play-button" isPlaying={this.state.isPlaying} onPlay={this._onPlay} onPause={this._onPause} />
          <button data-testid="solar-date-time-button" title={this._dateTimeLabel} className="current-date" ref={(element) => this._datePicker = element} onClick={this._onOpenDayPicker}>
            <span>{formattedDate}</span>
            <span>/</span>
            <span>{formattedTime}</span>
            <span className="icon icon-calendar" />
          </button>
          <Popup style={{ border: "none" }} offset={11} target={this._datePicker} isOpen={this.state.isDateOpened} onClose={this._onCloseDayPicker} position={RelativePosition.Top}>
            <div className="components-date-picker-calendar-popup-panel" data-testid="components-date-picker-calendar-popup-panel">
              <DatePicker selected={localTime} onDateChange={this._onDayClick} showFocusOutline={false} />
              <div className="time-container">
                <BodyText className="time-label">{this._timeLabel}</BodyText>
                <TimeField time={{ hours: localTime.getHours(), minutes: localTime.getMinutes(), seconds: 0 }} timeDisplay={TimeDisplay.H12MC} onTimeChange={this._onTimeChanged} />
              </div>
            </div>
          </Popup>
          <Timeline className="solar-timeline"
            dayStartMs={dataProvider.dayStartMs}
            sunSetOffsetMs={sunSetOffsetMs}
            sunRiseOffsetMs={sunRiseOffsetMs}
            currentTimeOffsetMs={currentTimeOffsetMs}
            onChange={this._onChange}
            onUpdate={this._onUpdate}
            formatTime={this._formatTime}
          />
          <div className="speed-container">
            <span title={this._speedLabel}>{speed}x</span>
            <SpeedTimeline className="speed" onChange={this._onSpeedChange} speed={this.state.speed} />
          </div>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
          <span title={this._loopLabel}
            className={classnames("icon", "icon-media-controls-loop", !loop && "no-loop-playback", loop && "loop-playback")} onClick={this._onToggleLoop}
            role="button" tabIndex={-1}
          ></span>
          <button data-testid="shadow-settings-button" title={this._settingLabel} className="shadow-settings-button" ref={(element) => this._settings = element} onClick={this._onOpenSettingsPopup}>
            <span className="icon icon-settings" />
          </button>
          <Popup className="shadow-settings-popup" target={this._settings} offset={11} isOpen={this.state.isSettingsOpened} onClose={this._onCloseSettingsPopup} position={RelativePosition.Top}>
            <div className="shadow-settings-popup-container" >
              <div className="shadow-settings-header">{this._settingsPopupTitle}</div>
              <div className="shadow-settings-color">
                <div className="shadow-settings-color-top">
                  <SaturationPicker hsv={this.state.shadowColor.toHSV()} onSaturationChange={this._handleHueOrSaturationChange} />
                </div>
                <div className="shadow-settings-color-bottom">
                  <div className="shadow-settings-color-bottom-left">
                    <HueSlider hsv={this.state.shadowColor.toHSV()} onHueChange={this._handleHueOrSaturationChange} isHorizontal={true} />
                  </div>
                  <div className="shadow-settings-color-bottom-right">
                    <ColorSwatch style={colorSwatchStyle} colorDef={this.state.shadowColor} round={false} />
                  </div>
                </div>
              </div>
              <div className="shadow-settings-color-presets">
                <ColorSwatch colorDef={this._presetColors[0]} round={false} onColorPick={this._onPresetColorPick} />
                <ColorSwatch colorDef={this._presetColors[1]} round={false} onColorPick={this._onPresetColorPick} />
                <ColorSwatch colorDef={this._presetColors[2]} round={false} onColorPick={this._onPresetColorPick} />
                <ColorSwatch colorDef={this._presetColors[3]} round={false} onColorPick={this._onPresetColorPick} />
                <ColorSwatch colorDef={this._presetColors[4]} round={false} onColorPick={this._onPresetColorPick} />
                <ColorSwatch colorDef={this._presetColors[5]} round={false} onColorPick={this._onPresetColorPick} />
                <ColorSwatch colorDef={this._presetColors[6]} round={false} onColorPick={this._onPresetColorPick} />
                <ColorSwatch colorDef={this._presetColors[7]} round={false} onColorPick={this._onPresetColorPick} />
              </div>
            </div>
          </Popup>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
          <span title={expandMinimizeLabel} data-testid="solar-timeline-toggle-expand" className="expanded-icon icon icon-chevron-up" onClick={this._onToggleDisplay}
            role="button" tabIndex={-1}
          ></span>
        </div>
      </div>
    );
  }
}
