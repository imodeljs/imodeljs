/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import "./TileLoadingIndicator.scss";
import classnames from "classnames";
import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import { IModelApp, ScreenViewport } from "@bentley/imodeljs-frontend";
import { ProgressLinear } from "@itwin/itwinui-react";
import { UiFramework } from "../../UiFramework";
import { StatusFieldProps } from "../StatusFieldProps";

let onViewOpen: (vp: ScreenViewport) => void;
let onRenderUpdate: () => void;

/** State for the [[TileLoadingIndicator]] component
 * @internal
 */
interface TileLoadingIndicatorState {
  label: string;
  progress: number;
  enabled: boolean;
  finished: boolean;
}

/** TileLoadingIndicator React component
 * @beta
 */
export class TileLoadingIndicator extends React.PureComponent<StatusFieldProps, TileLoadingIndicatorState> {
  private _removeViewOpenListener?: () => void;
  private _removeOnRenderListener?: () => void;

  constructor(props: StatusFieldProps) {
    super(props);
    this.state = { label: "", progress: 0, enabled: false, finished: true };
  }

  private _update(vp: ScreenViewport) {
    const requested = vp.numRequestedTiles;
    const ready = vp.numReadyTiles;
    const total = ready + requested;
    const pctComplete = (total > 0) ? (ready / total) * 100 : /* istanbul ignore next */ 100;
    let enabled = this.state.enabled;
    let finished = this.state.finished;

    // istanbul ignore else
    if (!enabled && total !== 0 && pctComplete !== 100)
      enabled = true;

    if (enabled && (total === 0 || pctComplete === 100))
      enabled = false;

    if (pctComplete === 100 && !finished) {
      finished = true;
      Logger.logTrace(UiFramework.loggerCategory(this), `Tiles Finished Loading`);
      Logger.logTrace(UiFramework.loggerCategory(this), `Tiles Load Report (tiles finished / tiles requested):  ${ready} / ${total}`);
    }

    // istanbul ignore else
    if (pctComplete !== 100 && finished)
      finished = false;

    this.setState({ label: `${ready} / ${total}`, progress: pctComplete, enabled, finished });
  }

  private _onViewOpen(vp: ScreenViewport) {
    onRenderUpdate = () => this._update(vp);

    // istanbul ignore if
    if (this._removeOnRenderListener)
      this._removeOnRenderListener();
    this._removeOnRenderListener = vp.onRender.addListener(onRenderUpdate, this);
  }

  public override componentDidMount() {
    // istanbul ignore next
    if (!IModelApp.viewManager)
      return;

    // get selected viewport
    const vp = IModelApp.viewManager.selectedView;

    // if view exists bind update routine to onRender loop, otherwise do so once the onViewOpen event runs
    if (vp) {
      this._onViewOpen(vp);
    } else {
      // istanbul ignore next
      onViewOpen = (_vp: ScreenViewport) => this._onViewOpen(_vp);
      this._removeViewOpenListener = IModelApp.viewManager.onViewOpen.addListener(onViewOpen, this);
    }
  }

  public override componentWillUnmount() {
    // istanbul ignore next
    if (!IModelApp.viewManager)
      return;

    // istanbul ignore else
    if (this._removeViewOpenListener)
      this._removeViewOpenListener();

    // istanbul ignore else
    if (this._removeOnRenderListener)
      this._removeOnRenderListener();
  }

  /** Renders TileLoadingIndicator */
  public override render() {
    const classes = classnames(
      "uifw-tile-loading-bar",
      this.state.enabled && "uifw-tile-loading-bar-visible",
      this.props.isInFooterMode && "nz-footer-mode",
      this.props.className,
    );
    return (
      <div className={classes} style={this.props.style}>
        <span>{this.state.label}</span>
        <ProgressLinear value={this.state.progress} />
      </div>
    );
  }
}
