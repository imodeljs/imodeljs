/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./PlayerButton.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";

/** Player button used by buttons on timeline control
 * @internal
 */
export class PlayerButton extends React.PureComponent<any> {
  private _onClick = () => {
    // istanbul ignore else
    if (this.props.onClick)
      this.props.onClick();
  };

  public override render() {
    const { icon, title } = this.props;
    return (
      <button data-testid={this.props.className} className={classnames("player-button", this.props.className)} onClick={this._onClick} title={title}>
        <span className={classnames("icon", !!icon)}></span>
      </button>
    );
  }
}

/** Properties for Play/Pause button used on timeline control
 * @internal
 */
export interface PlayerButtonProps extends CommonProps {
  isPlaying: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  tooltip?: string;
}

interface PlayButtonState {
  isPlaying: boolean;
}

/** Play/Pause button used on timeline control
 * @internal
 */
export class PlayButton extends React.Component<PlayerButtonProps, PlayButtonState> {

  constructor(props: PlayerButtonProps, context?: any) {
    super(props, context);

    this.state = { isPlaying: this.props.isPlaying };
  }

  /** @internal */
  public override componentDidUpdate() {
    if (this.props.isPlaying !== this.state.isPlaying) {
      this.setState((_, props) => ({ isPlaying: props.isPlaying }));
    }
  }

  private _onClick = () => {
    const _isPlaying = !this.state.isPlaying;

    this.setState({ isPlaying: _isPlaying });

    if (_isPlaying) {
      // istanbul ignore else
      if (this.props.onPlay)
        this.props.onPlay();
    } else {
      // istanbul ignore else
      if (this.props.onPause)
        this.props.onPause();
    }
  };

  public override render() {
    const { tooltip } = this.props;
    const iconClassName = this.state.isPlaying ? "icon icon-media-controls-pause" : "icon icon-media-controls-play";
    let title = tooltip;

    if (!title)
      title = UiComponents.translate(this.state.isPlaying ? "timeline.pause" : "timeline.play");

    return (
      <button data-testid={this.props.className} title={title} className={classnames("player-button", this.props.className)} onClick={this._onClick}>
        <span className={iconClassName}></span>
      </button>
    );
  }
}
