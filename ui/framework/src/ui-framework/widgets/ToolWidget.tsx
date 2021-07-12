/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import * as React from "react";
import { CommonProps, Icon } from "@bentley/ui-core";
import { AppButton, Direction, Tools as NZ_ToolsWidget } from "@bentley/ui-ninezone";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { CommandItemDef } from "../shared/CommandItemDef";
import { UiShowHideManager } from "../utils/UiShowHideManager";
import { ToolbarWidgetDefBase } from "./ToolbarWidgetBase";
import { ToolWidgetProps, WidgetType } from "./WidgetDef";
import { UiFramework } from "../UiFramework";

/** Definition of a Tool Widget normally displayed in the top left zone in the 9-Zone Layout system.
 *  @public @deprecated use ToolWidgetComposer instead
 */
export class ToolWidgetDef extends ToolbarWidgetDefBase {
  private _appButton: CommandItemDef | undefined;
  private _reactNode: React.ReactNode;
  private _backstageLabel = UiFramework.translate("buttons.openBackstageMenu");

  constructor(props: ToolWidgetProps) {
    super(props);

    this._appButton = props.appButton;

    this.widgetType = WidgetType.Tool;
    this.verticalDirection = (props.verticalDirection !== undefined) ? props.verticalDirection : Direction.Right;

    const activeStageName = FrontstageManager.activeFrontstageDef ? FrontstageManager.activeFrontstageDef.id : /* istanbul ignore next */"";
    this.widgetBaseName = `[${activeStageName}]ToolWidget`;
  }

  public override get reactNode(): React.ReactNode {
    // istanbul ignore else
    if (!this._reactNode)
      this._reactNode = <ToolWidgetWithDef toolWidgetDef={this} />;

    return this._reactNode;
  }

  /** @deprecated use reactNode */
  // istanbul ignore next
  public override get reactElement(): React.ReactNode {
    return this.reactNode;
  }

  public renderCornerItem(): React.ReactNode | undefined {
    if (this._appButton) {
      return (
        <AppButton
          onClick={this._appButton.execute}
          icon={
            <Icon iconSpec={this._appButton.iconSpec} />
          }
          title={this._appButton.tooltip || this._backstageLabel}
        />
      );
    }

    return undefined;
  }
}

/** Properties for the [[ToolWidget]] React component.
 *  @public @deprecated use ToolWidgetComposer instead
 */
export interface ToolWidgetPropsEx extends ToolWidgetProps, CommonProps {
  button?: React.ReactNode;
  horizontalToolbar?: React.ReactNode;
  verticalToolbar?: React.ReactNode;
}

/** State for the [[ToolWidget]] React component.
 * @internal
 */
interface ToolWidgetState {
  toolWidgetDef: ToolWidgetDef; // eslint-disable-line deprecation/deprecation
}

/** ToolWidget React component.
 *  @public @deprecated use ToolWidgetComposer instead
 */
export class ToolWidget extends React.Component<ToolWidgetPropsEx, ToolWidgetState> { // eslint-disable-line deprecation/deprecation

  /** @internal */
  public override readonly state: Readonly<ToolWidgetState>;

  constructor(props: ToolWidgetPropsEx) { // eslint-disable-line deprecation/deprecation
    super(props);

    this.state = { toolWidgetDef: new ToolWidgetDef(props) }; // eslint-disable-line deprecation/deprecation
  }

  public override componentDidUpdate(prevProps: ToolWidgetPropsEx, _prevState: ToolWidgetState) { // eslint-disable-line deprecation/deprecation
    if (this.props !== prevProps) {
      this.setState((_, props) => ({ toolWidgetDef: new ToolWidgetDef(props) })); // eslint-disable-line deprecation/deprecation
    }
  }

  public override render(): React.ReactNode {
    return (
      <ToolWidgetWithDef
        className={this.props.className}
        style={this.props.style}
        toolWidgetDef={this.state.toolWidgetDef}
        button={this.props.button}
        horizontalToolbar={this.props.horizontalToolbar}
        verticalToolbar={this.props.verticalToolbar}
      />
    );
  }
}

/** Properties for the Tool Widget React component.
 */
interface Props extends CommonProps {
  toolWidgetDef: ToolWidgetDef; // eslint-disable-line deprecation/deprecation
  button?: React.ReactNode;
  horizontalToolbar?: React.ReactNode;
  verticalToolbar?: React.ReactNode;
}

interface ToolWidgetWithDefState {
  horizontalToolbar: React.ReactNode;
  verticalToolbar: React.ReactNode;
  cornerItem: React.ReactNode;
}

/** Tool Widget React component.
 */
class ToolWidgetWithDef extends React.Component<Props, ToolWidgetWithDefState> {
  constructor(props: Props) {
    super(props);

    const horizontalToolbar = (this.props.horizontalToolbar) ? this.props.horizontalToolbar : this.props.toolWidgetDef.renderHorizontalToolbar();
    const verticalToolbar = (this.props.verticalToolbar) ? this.props.verticalToolbar : this.props.toolWidgetDef.renderVerticalToolbar();
    const cornerItem = (this.props.button !== undefined) ? this.props.button : this.props.toolWidgetDef.renderCornerItem();
    this.state = { horizontalToolbar, verticalToolbar, cornerItem };
  }

  private reloadToolbars() {
    const horizontalToolbar = (this.props.horizontalToolbar) ? this.props.horizontalToolbar : /* istanbul ignore next */ this.props.toolWidgetDef.renderHorizontalToolbar();
    const verticalToolbar = (this.props.verticalToolbar) ? /* istanbul ignore next */ this.props.verticalToolbar : this.props.toolWidgetDef.renderVerticalToolbar();
    this.setState({ horizontalToolbar, verticalToolbar });
  }

  public override componentDidUpdate(prevProps: Props) {
    if (this.props !== prevProps)
      this.reloadToolbars();
  }

  public override render(): React.ReactNode {
    return (
      <NZ_ToolsWidget
        className={this.props.className}
        style={this.props.style}
        button={this.state.cornerItem}
        horizontalToolbar={this.state.horizontalToolbar}
        verticalToolbar={this.state.verticalToolbar}
        preserveSpace={true}
        onMouseEnter={UiShowHideManager.handleWidgetMouseEnter}
      />
    );
  }
}
