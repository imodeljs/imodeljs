/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./Timeline.scss";
import classnames from "classnames";
import * as React from "react";
import { Handles, Rail, Slider, SliderItem, Ticks } from "react-compound-slider";
import { CommonProps } from "@bentley/ui-core";
import { Milestone } from "./interfaces";

// istanbul ignore next
const formatDate = (value: number) => {
  let date = new Date();
  if (value)
    date = new Date(value);
  return date.toLocaleDateString();
};

// *******************************************************
// NEEDLE -- deprecated
// *******************************************************
/** @internal
 * @deprecated
 */
interface NeedleProps {
  startDate: Date;
  endDate: Date;
  selectedDate: Date;
}

/** @internal
 * @deprecated
 */
// istanbul ignore next
// eslint-disable-next-line deprecation/deprecation
function Needle({ startDate, endDate, selectedDate }: NeedleProps) {
  const percent = (selectedDate.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime()) * 100;
  return (
    <div className="needle" style={{ left: `${percent}%` }} />
  );
}

// *******************************************************
// TOOLTIP RAIL -- deprecated
// *******************************************************
/** @internal
 * @deprecated
 */
// istanbul ignore next
interface TooltipRailProps {
  activeHandleID: string;
  getRailProps: (props: object) => object;
  getEventData: (e: Event) => object;
}

interface TooltipRailState {
  value: number | null;
  percent: number | null;
}

/** @internal
 * @deprecated
 */
// istanbul ignore next
// eslint-disable-next-line deprecation/deprecation
class TooltipRail extends React.Component<TooltipRailProps, TooltipRailState> {

  public static defaultProps = {
    disabled: false,
  };

  // eslint-disable-next-line deprecation/deprecation
  constructor(props: TooltipRailProps) {
    super(props);

    this.state = { value: null, percent: null };
  }

  // istanbul ignore next - WIP
  private _onMouseEnter = () => {
    document.addEventListener("mousemove", this._onMouseMove);
  };

  // istanbul ignore next - WIP
  private _onMouseLeave = () => {
    this.setState({ value: null, percent: null });
    document.removeEventListener("mousemove", this._onMouseMove);
  };

  // istanbul ignore next - WIP
  private _onMouseMove = (e: Event) => {
    const { activeHandleID, getEventData } = this.props;

    if (activeHandleID) {
      this.setState({ value: null, percent: null });
    } else {
      this.setState(getEventData(e));
    }
  };

  public render() {
    const { value, percent } = this.state;
    const { activeHandleID, getRailProps } = this.props;

    // istanbul ignore next - WIP
    return (
      <>
        {!activeHandleID && value ? (
          <div className="tooltip-rail" style={{ left: `${percent}%` }}>
            <div className="tooltip">
              <span className="tooltip-text">{formatDate(value)}</span>
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
/** @internal
 * @deprecated
 */
// istanbul ignore next
interface HandleProps {
  key: string;
  handle: SliderItem;
  isActive: boolean;
  disabled?: boolean;
  domain: number[];
  // eslint-disable-next-line deprecation/deprecation
  milestone: Milestone;
  getHandleProps: (id: string, config: object) => object;
}

/** @internal
 * @deprecated
 */
// istanbul ignore next
interface HandleState {
  mouseOver: boolean;
}

/** @internal
 * @deprecated
 */
// istanbul ignore next
// eslint-disable-next-line deprecation/deprecation
class Handle extends React.Component<HandleProps, HandleState> {
  public static defaultProps = {
    disabled: false,
  };

  // eslint-disable-next-line deprecation/deprecation
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
  public render() {
    const {
      domain: [min, max],
      handle: { id, value, percent },
      isActive,
      disabled,
      getHandleProps,
      milestone,
    } = this.props;
    const { mouseOver } = this.state;
    return (
      <>
        {(mouseOver || isActive) && !disabled ? (
          <div className="tooltip-rail" style={{ left: `${percent}%` }}>
            <div className="tooltip">
              <span className="tooltip-text">{formatDate(value)}</span>
            </div>
          </div>
        ) : null}
        <div
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="handle"
          style={{ left: `${percent}%` }}
          {...getHandleProps(id, {
            onMouseEnter: this._onMouseEnter,
            onMouseLeave: this._onMouseLeave,
          })} >
          <span>{milestone.label}</span>
        </div>
      </>
    );
  }
}

// *******************************************************
// TICK COMPONENT
// *******************************************************
/** @internal
 * @deprecated
 */
// istanbul ignore next
interface TickProps {
  tick: SliderItem;
  count: number;
  index: number;
}

// istanbul ignore next
// eslint-disable-next-line deprecation/deprecation
function Tick({ tick, count, index }: TickProps) {
  if (index === 0) {
    return (
      <span className="tick-label start">Start</span>
    );
  } else if (index === (count - 1)) {
    return (
      <span className="tick-label end">End</span>
    );
  } else {
    return (
      <>
        <div className="tick-line" style={{ left: `${tick.percent}%` }} />
        <span className="tick-label tick" style={{ left: `${tick.percent}%` }}>{index}yr</span>
      </>
    );
  }
}

// {formatDate(tick.value)}

/** Properties used to show milestone timeline in timeline player control
 * @internal
 * @deprecated
 */
// istanbul ignore next
export interface TimelineProps extends CommonProps {
  startDate: Date;
  endDate: Date;
  selectedDate: Date;
  // eslint-disable-next-line deprecation/deprecation
  milestones?: Milestone[];
  isPlaying: boolean;
  onChange?: (values: ReadonlyArray<number>) => void;
  onUpdate?: (values: ReadonlyArray<number>) => void;
  onSlideStart?: () => void;
}

// istanbul ignore next
interface TimelineState {
  ticks: number[];
}

/** Component used to show milestone timeline in timeline player control
 * @internal
 * @deprecated
 */
// istanbul ignore next
// eslint-disable-next-line deprecation/deprecation
export class Timeline extends React.Component<TimelineProps, TimelineState> {

  // eslint-disable-next-line deprecation/deprecation
  constructor(props: TimelineProps) {
    super(props);

    // istanbul ignore else
    if (props.endDate && props.startDate) {
      const quarter = (props.endDate.getTime() - props.startDate.getTime()) / 4;

      // compute the ticks
      const ticks: number[] = [];
      ticks.push(props.startDate.getTime());
      // for (let i = this.props.startDate.getTime(); i <= (this.props.endDate.getTime()); i += oneDay) {
      for (let i = 1; i < 4; i++) {
        const newDate = props.startDate.getTime() + (quarter * i);
        ticks.push(newDate);
      }
      ticks.push(props.endDate.getTime());
      this.state = { ticks };
    }
  }

  private _milestones = (): number[] => {
    const { milestones } = this.props;
    const handles: number[] = [];

    // istanbul ignore else
    if (milestones) {
      // eslint-disable-next-line deprecation/deprecation
      milestones.forEach((milestone: Milestone) => handles.push(milestone.date.getTime()));
    }

    return handles;
  };

  public render() {
    const { startDate, endDate, selectedDate, milestones, onChange, onUpdate } = this.props;
    const domain = [startDate.getTime(), endDate.getTime()];

    return (
      <div className={classnames("timeline", this.props.className)}>
        <Slider
          mode={1}
          step={1}
          domain={domain}
          rootStyle={{ position: "relative", height: "100%", margin: "0 60px" }}
          onUpdate={onUpdate}
          onChange={onChange}
          values={this._milestones()}
        >
          <Rail>
            {(railProps) => <TooltipRail {...railProps} />}
          </Rail>
          <Handles>
            {({ handles, activeHandleID, getHandleProps }) => (
              <div className="slider-handles">
                {handles.map((handle: SliderItem, index: number) => (
                  <Handle
                    key={handle.id}
                    handle={handle}
                    domain={domain}
                    isActive={handle.id === activeHandleID}
                    milestone={milestones![index]}
                    getHandleProps={getHandleProps}
                  />
                ))}
              </div>
            )}
          </Handles>
          <Ticks values={this.state.ticks}>
            {({ ticks }) => (
              <div className="slider-ticks">
                {ticks.map((tick: any, index: number) => (
                  <Tick
                    key={tick.id}
                    tick={tick}
                    count={ticks.length}
                    index={index} />
                ))}
              </div>
            )}
          </Ticks>
          <Needle startDate={startDate} endDate={endDate} selectedDate={selectedDate} />
        </Slider>
      </div>
    );
  }
}
