/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./Scrubber.scss";
import * as React from "react";
import { GetTrackProps, Handles, Rail, Slider, SliderItem, Tracks } from "react-compound-slider";
import { CommonProps } from "@bentley/ui-core";

// istanbul ignore next - WIP
const formatDuration = (value: number) => {
  const addZero = (i: number) => {
    return (i < 10) ? `0${i}` : i;
  };

  const date = new Date(value);
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  return `${addZero(minutes)}:${addZero(seconds)}`;
};

const formatDate = (startDate: Date, endDate: Date, fraction: number) => {
  const delta = (endDate.getTime() - startDate.getTime()) * fraction;
  const date = new Date(startDate.getTime() + delta);
  return date.toLocaleDateString();
};

// istanbul ignore next - WIP
const formatTime = (startDate: Date, endDate: Date, fraction: number) => {
  const delta = (endDate.getTime() - startDate.getTime()) * fraction;
  const date = new Date(startDate.getTime() + delta);
  return date.toLocaleTimeString();
};

// *******************************************************
// TOOLTIP RAIL
// *******************************************************
interface TooltipRailProps {
  activeHandleID?: string;
  getRailProps: (props: object) => object;
  getEventData: (e: Event) => object;
  startDate?: Date;
  endDate?: Date;
  showTime?: boolean;
  isPlaying: boolean;  // used to not show tooltip at mouse location if timeline is playing
}

interface TooltipRailState {
  value: number | null;
  percent: number | null;
}

class TooltipRail extends React.Component<TooltipRailProps, TooltipRailState> {
  private _isMounted = false;
  public static defaultProps = {
    disabled: false,
  };

  constructor(props: TooltipRailProps) {
    super(props);

    this.state = { value: null, percent: null };
  }

  public override componentDidMount() {
    this._isMounted = true;
  }

  public override componentWillUnmount() {
    this._isMounted = false;
    document.removeEventListener("mousemove", this._onMouseMove);
  }

  // istanbul ignore next - WIP
  private _onMouseEnter = () => {
    document.addEventListener("mousemove", this._onMouseMove);
  };

  // istanbul ignore next - WIP
  private _onMouseLeave = () => {
    if (this._isMounted)
      this.setState({ value: null, percent: null });
    document.removeEventListener("mousemove", this._onMouseMove);
  };

  // istanbul ignore next - WIP
  private _onMouseMove = (e: Event) => {
    const { activeHandleID, getEventData } = this.props;
    if (this._isMounted) {
      if (activeHandleID) {
        this.setState({ value: null, percent: null });
      } else {
        this.setState(getEventData(e));
      }
    }
  };

  // istanbul ignore next - WIP
  public override render() {
    const { value, percent } = this.state;
    const { activeHandleID, getRailProps, isPlaying, startDate, endDate, showTime } = this.props;
    let toolTip = "";

    if (startDate && endDate && showTime)
      toolTip = `${formatDate(startDate, endDate, percent! / 100)} ${formatTime(startDate, endDate, percent! / 100)}`;
    else if (startDate && endDate)
      toolTip = formatDate(startDate, endDate, percent! / 100);
    else
      toolTip = formatDuration(value!);

    return (
      <>
        {!activeHandleID && value && !isPlaying ? (
          <div className="tooltip-rail" style={{ left: `${percent}%` }}>
            <div className="tooltip">
              <span className="tooltip-text">{toolTip}</span>
            </div>
          </div>
        ) : null}
        <div
          className="rail"
          {...getRailProps({
            onMouseEnter: this._onMouseEnter,
            onMouseLeave: this._onMouseLeave,
          })}
        />
        <div className="rail-center" />
      </>
    );
  }
}

// *******************************************************
// HANDLE COMPONENT
// *******************************************************
interface HandleProps {
  key: string;
  handle: SliderItem;
  disabled?: boolean;
  showTooltipWhenPlaying?: boolean;
  showTooltipOnMouseOver?: boolean;
  startDate?: Date;
  endDate?: Date;
  showTime?: boolean;
  domain: number[];
  getHandleProps: (id: string, config: object) => object;
}

interface HandleState {
  mouseOver: boolean;
}

class Handle extends React.Component<HandleProps, HandleState> {
  public static defaultProps = {
    disabled: false,
  };

  constructor(props: HandleProps) {
    super(props);

    this.state = { mouseOver: false };
  }

  // istanbul ignore next - WIP
  private _onMouseEnter = () => {
    this.setState({ mouseOver: true });
  };

  // istanbul ignore next - WIP
  private _onMouseLeave = () => {
    this.setState({ mouseOver: false });
  };

  // istanbul ignore next - WIP
  public override render() {
    const {
      domain: [min, max],
      handle: { id, value, percent },
      showTooltipWhenPlaying,
      showTooltipOnMouseOver,
      showTime,
      startDate,
      endDate,
      getHandleProps,
    } = this.props;
    const { mouseOver } = this.state;
    let toolTip = "";

    if (startDate && endDate && showTime)
      toolTip = `${formatDate(startDate, endDate, percent / 100)} ${formatTime(startDate, endDate, percent / 100)}`;
    else if (startDate && endDate)
      toolTip = formatDate(startDate, endDate, percent / 100);
    else
      toolTip = formatDuration(value);

    return (
      <>
        {(showTooltipWhenPlaying || (mouseOver && showTooltipOnMouseOver)) &&
          <div className="tooltip-rail" style={{ left: `${percent}%` }}>
            <div className="tooltip">
              <span className="tooltip-text">{toolTip}</span>
            </div>
          </div>
        }
        <div
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="scrubber-handle"
          style={{ left: `${percent}%` }}
          {...getHandleProps(id, {
            onMouseEnter: this._onMouseEnter,
            onMouseLeave: this._onMouseLeave,
          })}>
          <div /><div /><div />
        </div>
      </>
    );
  }
}

// *******************************************************
// TRACK COMPONENT
// *******************************************************
interface ITrackProps {
  source: SliderItem;
  target: SliderItem;
  getTrackProps: GetTrackProps;
}

function Track({ source, target, getTrackProps }: ITrackProps) {
  return (
    <div className="scrubber-track" style={{ left: `${source.percent}%`, width: `${target.percent - source.percent}%` }}
      {...getTrackProps()}
    />
  );
}

/** Properties for Scrubber/Slider used on timeline control
 * @internal
 */
export interface ScrubberProps extends CommonProps {
  currentDuration: number;
  totalDuration: number;
  isPlaying: boolean;
  inMiniMode: boolean;
  startDate?: Date;
  endDate?: Date;
  showTime?: boolean;
  onChange?: (values: ReadonlyArray<number>) => void;
  onUpdate?: (values: ReadonlyArray<number>) => void;
  onSlideStart?: () => void;
}

/** Scrubber/Slider for timeline control
 * @internal
 */
export class Scrubber extends React.Component<ScrubberProps> {

  public override render() {
    const { currentDuration, totalDuration, onChange, onUpdate, onSlideStart, isPlaying, inMiniMode, startDate, endDate, showTime } = this.props;
    const domain = [0, totalDuration];
    const showTooltip = isPlaying && inMiniMode;
    const showMouseTooltip = !isPlaying && inMiniMode;

    return (
      <Slider
        className={this.props.className}
        mode={1}
        step={1}
        domain={domain}
        onUpdate={onUpdate}
        onChange={onChange}
        onSlideStart={onSlideStart}
        values={[currentDuration]}
      >
        <Rail>
          {(railProps) => <TooltipRail {...railProps} isPlaying={isPlaying} startDate={startDate} endDate={endDate} showTime={showTime} />}
        </Rail>
        <Handles>
          {({ handles, getHandleProps }) => (
            <div className="slider-handles">
              {handles.map((handle) => (
                <Handle
                  key={handle.id}
                  showTooltipWhenPlaying={showTooltip}
                  showTooltipOnMouseOver={showMouseTooltip}
                  startDate={startDate}
                  endDate={endDate}
                  handle={handle}
                  domain={domain}
                  showTime={showTime}
                  getHandleProps={getHandleProps}
                />
              ))}
            </div>
          )}
        </Handles>
        <Tracks right={false}>
          {({ tracks, getTrackProps }) => (
            <div className="slider-tracks">
              {tracks.map(({ id, source, target }) => (
                <Track
                  key={id}
                  source={source}
                  target={target}
                  getTrackProps={getTrackProps}
                />
              ))}
            </div>
          )}
        </Tracks>
      </Slider>
    );
  }
}
