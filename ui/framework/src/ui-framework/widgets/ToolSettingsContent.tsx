/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./ToolSettingsContent.scss";
import classnames from "classnames";
import * as React from "react";
import { ResizableContainerObserver } from "@bentley/ui-core";
import { HorizontalAnchor, ToolSettingsWidgetMode, WidgetContent } from "@bentley/ui-ninezone";

/** @internal */
interface ToolSettingsContentProps {
  anchor: HorizontalAnchor;
  mode: ToolSettingsWidgetMode;
}

interface ToolSettingsContentState {
  availableContentWidth: number;
}

/**  @internal */
export class ToolSettingsContent extends React.PureComponent<ToolSettingsContentProps, ToolSettingsContentState> {
  private _container = React.createRef<HTMLDivElement>();
  private _measurer = React.createRef<HTMLDivElement>();

  public override readonly state: ToolSettingsContentState = {
    availableContentWidth: 0,
  };

  public override render(): React.ReactNode | undefined {
    const className = classnames(
      "uifw-tool-settings-content",
      this.props.mode === ToolSettingsWidgetMode.TitleBar && "uifw-title-bar",
      this.props.mode === ToolSettingsWidgetMode.Tab && "uifw-tab",
    );

    return (
      <WidgetContent
        anchor={this.props.anchor}
        className={className}
        containerRef={this._container}
        content={<ToolSettingsContentContext.Provider value={{
          availableContentWidth: this.state.availableContentWidth,
        }}>
          {this.props.children}
          <div className="uifw-zone-measurer">
            <ResizableContainerObserver onResize={this._handleResize} />
          </div>
          <div className="uifw-measurer" ref={this._measurer} />
          <div className="uifw-expander" />
        </ToolSettingsContentContext.Provider>}
      />
    );
  }

  private _handleResize = () => {
    const container = this._container.current;
    const measurer = this._measurer.current;

    // istanbul ignore next
    if (!container || !measurer)
      return;

    container.classList.add("uifw-measure");
    const measurerBounds = measurer.getBoundingClientRect();
    container.classList.remove("uifw-measure");

    this.setState({ availableContentWidth: measurerBounds.width });
  };
}

/** @internal */
export interface ToolSettingsContentContextProps {
  readonly availableContentWidth: number;
}

/** @internal */
export const ToolSettingsContentContext = React.createContext<ToolSettingsContentContextProps>({ // eslint-disable-line @typescript-eslint/naming-convention
  availableContentWidth: 0,
});
