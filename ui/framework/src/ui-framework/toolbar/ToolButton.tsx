/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

import * as React from "react";
import { IModelApp, Tool } from "@bentley/imodeljs-frontend";
import { ConditionalStringValue, StringGetter } from "@bentley/ui-abstract";
import { BadgeUtilities, CommonProps, Icon } from "@bentley/ui-core";
import { getToolbarItemProps, Item } from "@bentley/ui-ninezone";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { BaseItemState } from "../shared/ItemDefBase";
import { ToolItemProps } from "../shared/ItemProps";
import { SyncUiEventArgs, SyncUiEventDispatcher, SyncUiEventId } from "../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../UiFramework";
import { PropsHelper } from "../utils/PropsHelper";
import { onEscapeSetFocusToHome } from "../hooks/useEscapeSetFocusToHome";

/** Properties for the [[ToolButton]] React Component.
 * @public
 */
export interface ToolButtonProps extends ToolItemProps, CommonProps { }

/** Tool Button React Component.
 * @public
 */
export class ToolButton extends React.Component<ToolButtonProps, BaseItemState> {
  private _componentUnmounting = false;
  private _label: string | StringGetter | ConditionalStringValue = "";

  /** @internal */
  public override readonly state: Readonly<BaseItemState>;

  constructor(props: ToolItemProps) {
    super(props);

    if (props.label)
      this._label = props.label;
    else if (props.labelKey)
      this._label = UiFramework.i18n.translate(props.labelKey);

    this.state = {
      isVisible: undefined !== props.isVisible ? props.isVisible : true, // eslint-disable-line deprecation/deprecation
      isEnabled: undefined !== props.isEnabled ? props.isEnabled : true, // eslint-disable-line deprecation/deprecation
      isActive: undefined !== props.isActive ? props.isActive : false,
      isPressed: undefined !== props.isPressed ? props.isPressed : false,
    };
  }

  private _handleSyncUiEvent = (args: SyncUiEventArgs): void => {
    // istanbul ignore if
    if (this._componentUnmounting) return;

    let refreshState = false;
    let newState: BaseItemState = { ...this.state };

    // since this is a tool button automatically monitor the activation of tools so the active state of the button is updated.
    if (args.eventIds.has(SyncUiEventId.ToolActivated)) {
      newState.isActive = this.props.toolId === FrontstageManager.activeToolId;
      refreshState = true;
    }

    if (!refreshState && this.props.stateSyncIds && this.props.stateSyncIds.length > 0) // eslint-disable-line deprecation/deprecation
      refreshState = this.props.stateSyncIds.some((value: string): boolean => args.eventIds.has(value.toLowerCase())); // eslint-disable-line deprecation/deprecation

    if (refreshState) {
      if (this.props.stateFunc) // eslint-disable-line deprecation/deprecation
        newState = this.props.stateFunc(newState); // eslint-disable-line deprecation/deprecation

      // istanbul ignore else
      if ((this.state.isActive !== newState.isActive) ||
      /* istanbul ignore next */ (this.state.isEnabled !== newState.isEnabled) ||
      /* istanbul ignore next */ (this.state.isVisible !== newState.isVisible)) {
        this.setState({
          isActive: newState.isActive,
          isEnabled: newState.isEnabled,
          isVisible: newState.isVisible,
        });
      }
    }
  };

  public override componentDidMount() {
    SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
  }

  public override componentWillUnmount() {
    this._componentUnmounting = true;
    SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
  }

  private _execute = () => {
    if (this.props.execute) {
      this.props.execute();
    } else {
      const thisTool: typeof Tool | undefined = IModelApp.tools.find(this.props.toolId);
      // istanbul ignore else
      if (thisTool)
        (new thisTool()).run();
    }
  };

  public get label(): string {
    return PropsHelper.getStringFromSpec(this._label);
  }

  public override render(): React.ReactNode {
    if (!this.state.isVisible)
      return null;

    const icon = <Icon iconSpec={this.props.iconSpec} />;
    const toolbarItemProps = getToolbarItemProps(this.props);
    const badge = BadgeUtilities.getComponentForBadgeType(this.props.badgeType);

    return (
      <Item
        {...toolbarItemProps}
        className={this.props.className}
        style={this.props.style}
        isActive={this.state.isActive}
        isDisabled={!this.state.isEnabled}
        title={this.label}
        key={this.props.toolId}
        onClick={this._execute}
        onKeyDown={onEscapeSetFocusToHome}
        icon={icon}
        badge={badge}
      />
    );
  }
}
