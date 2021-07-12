/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ToolSettings
 */

import * as React from "react";
import { CommonProps, PointProps, RectangleProps } from "@bentley/ui-core";
import {
  ResizeHandle, TitleBarButton, ToolSettings, ToolSettingsTab, WidgetZoneId, Zone, ZoneManagerProps, ZoneTargetType,
} from "@bentley/ui-ninezone";
import { ZoneTargets } from "../../dragdrop/ZoneTargets";
import { TargetChangeHandler, WidgetChangeHandler } from "../../frontstage/FrontstageComposer";
import { FrontstageManager } from "../../frontstage/FrontstageManager";
import { SafeAreaContext } from "../../safearea/SafeAreaContext";
import { UiFramework } from "../../UiFramework";
import { UiShowHideManager } from "../../utils/UiShowHideManager";
import { getFloatingZoneBounds, getFloatingZoneStyle } from "../FrameworkZone";
import { Outline } from "../Outline";
import { ToolSettingsManager } from "./ToolSettingsManager";
import { onEscapeSetFocusToHome } from "../../hooks/useEscapeSetFocusToHome";

// cSpell:ignore safearea

/** State for the ToolSettingsZone content.
 */
enum ToolSettingsZoneContent {
  Closed,
  ToolSettings, // eslint-disable-line @typescript-eslint/no-shadow
}

/** State for the [[ToolSettingsZone]].
 */
interface ToolSettingsZoneState {
  toolSettingsZoneContent: ToolSettingsZoneContent;
  title: string;
}

/** Properties for the [[ToolSettingsZone]] React component.
 * @internal
 */
export interface ToolSettingsZoneProps extends CommonProps {
  dropTarget: ZoneTargetType | undefined;
  getWidgetContentRef: (id: WidgetZoneId) => React.Ref<HTMLDivElement>;
  isHidden: boolean;
  isClosed: boolean;
  lastPosition: PointProps | undefined;
  targetChangeHandler: TargetChangeHandler;
  targetedBounds: RectangleProps | undefined;
  widgetChangeHandler: WidgetChangeHandler;
  zone: ZoneManagerProps;
}

/** Tool Settings Zone React component.
 * @internal
 */
export class ToolSettingsZone extends React.PureComponent<ToolSettingsZoneProps, ToolSettingsZoneState> {
  private _hiddenVisibility: React.CSSProperties = {
    visibility: "hidden",
  };
  private _widget = React.createRef<ToolSettings>();

  /** @internal */
  public override readonly state: Readonly<ToolSettingsZoneState>;

  constructor(props: ToolSettingsZoneProps) {
    super(props);

    const title = `${ToolSettingsManager.activeToolLabel}`;

    this.state = {
      toolSettingsZoneContent: this.props.isClosed ? ToolSettingsZoneContent.Closed : ToolSettingsZoneContent.ToolSettings,
      title,
    };
  }

  private _handleToolActivatedEvent = (): void => {
    // Update tool settings title when active tool changes.
    const title = `${ToolSettingsManager.activeToolLabel}`;
    this.setState({ title });
  };

  public override componentDidMount(): void {
    FrontstageManager.onToolActivatedEvent.addListener(this._handleToolActivatedEvent);
  }

  public override componentWillUnmount(): void {
    FrontstageManager.onToolActivatedEvent.removeListener(this._handleToolActivatedEvent);
  }

  public override render(): React.ReactNode {
    const bounds = getFloatingZoneBounds(this.props.zone);
    const zIndexStyle = getFloatingZoneStyle(this.props.zone);
    return (
      <SafeAreaContext.Consumer>
        {(safeAreaInsets) => (
          <span style={zIndexStyle}>
            <Zone
              bounds={bounds}
              className={this.props.className}
              id={this.props.zone.id}
              isFloating={!!this.props.zone.floating}
              isHidden={this.props.isHidden}
              safeAreaInsets={safeAreaInsets}
              style={this.props.style}
            >
              {this.getToolSettingsWidget()}
            </Zone>
            <Zone
              bounds={this.props.zone.bounds}
              id={this.props.zone.id}
              safeAreaInsets={safeAreaInsets}
            >
              <ZoneTargets
                zoneId={this.props.zone.id}
                dropTarget={this.props.dropTarget}
                targetChangeHandler={this.props.targetChangeHandler}
              />
            </Zone>
            <Outline bounds={this.props.targetedBounds} />
          </span>
        )}
      </SafeAreaContext.Consumer>
    );
  }

  private _processClick = () => {
    this.setState((prevState) => {
      let toolSettingsZoneContent = ToolSettingsZoneContent.Closed;

      if (prevState.toolSettingsZoneContent === ToolSettingsZoneContent.Closed)
        toolSettingsZoneContent = ToolSettingsZoneContent.ToolSettings;
      return {
        toolSettingsZoneContent,
      };
    });
  };

  private getToolSettingsWidget(): React.ReactNode {
    if (this.state.toolSettingsZoneContent === ToolSettingsZoneContent.Closed) {

      return (
        <ToolSettingsTab
          onClick={this._processClick}
          onKeyDown={onEscapeSetFocusToHome}
          title={this.state.title}
          onMouseEnter={UiShowHideManager.handleWidgetMouseEnter}
        >
          <i className="icon icon-settings" />
        </ToolSettingsTab>
      );
    }

    return (
      <ToolSettings
        buttons={
          <div style={this.props.zone.floating && this._hiddenVisibility}>
            <TitleBarButton
              onClick={this._processClick}
              title={UiFramework.translate("general.minimize")}
            >
              <i className={"icon icon-chevron-up"} />
            </TitleBarButton>
          </div>
        }
        contentRef={this.props.getWidgetContentRef(this.props.zone.id)}
        fillZone={this.props.zone.isLayoutChanged && !!this.props.zone.floating}
        lastPosition={this.props.lastPosition}
        onDrag={this.props.zone.allowsMerging ? this.props.widgetChangeHandler.handleTabDrag : undefined}
        onDragEnd={this.props.widgetChangeHandler.handleTabDragEnd}
        onDragStart={this._handleDragStart}
        onResize={this.props.zone.floating && this._handleResize}
        onMouseEnter={UiShowHideManager.handleWidgetMouseEnter}
        ref={this._widget}
        title={this.state.title}
      />
    );
  }

  private _handleDragStart = (initialPosition: PointProps) => {
    if (!this._widget.current)
      return;
    const bounds = this._widget.current.getBounds();
    this.props.widgetChangeHandler.handleTabDragStart(this.props.zone.id, 0, initialPosition, bounds);
  };

  private _handleResize = (resizeBy: number, handle: ResizeHandle) => {
    this.props.widgetChangeHandler.handleResize(this.props.zone.id, resizeBy, handle, 0);
  };
}
