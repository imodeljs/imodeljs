/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

import "@bentley/ui-ninezone/lib/ui-ninezone/toolbar/item/expandable/group/Panel.scss";
import "./PopupButton.scss";
import classnames from "classnames";
import * as React from "react";
import { ConditionalBooleanValue, ConditionalStringValue, SpecialKey, StringGetter } from "@bentley/ui-abstract";
import { BadgeUtilities, CommonProps, Icon, SizeProps, withOnOutsideClick } from "@bentley/ui-core";
import { ExpandableItem, Item } from "@bentley/ui-ninezone";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { KeyboardShortcutManager } from "../keyboardshortcut/KeyboardShortcut";
import { BaseItemState } from "../shared/ItemDefBase";
import { ItemProps } from "../shared/ItemProps";
import { SyncUiEventArgs, SyncUiEventDispatcher } from "../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../UiFramework";
import { PropsHelper } from "../utils/PropsHelper";
import { ToolbarDragInteractionContext } from "./DragInteraction";

/* eslint-disable deprecation/deprecation */

// cSpell:ignore popupbutton

// eslint-disable-next-line @typescript-eslint/naming-convention
const DivWithOnOutsideClick = withOnOutsideClick((props: React.HTMLProps<HTMLDivElement>) => (<div {...props} />), undefined, true);

/** Arguments of [[PopupButtonChildrenRenderProp]].
 * @public
 * @deprecated use PopupItem in ToolbarWithOverflow or popupPanelNode in CustomItemDef
 */
export interface PopupButtonChildrenRenderPropArgs {
  closePanel: () => void;
}

/** Type of [[PopupButtonProps.children]] when used as render prop.
 * @public
 * @deprecated use PopupItem in ToolbarWithOverflow or popupPanelNode in CustomItemDef
 */
export type PopupButtonChildrenRenderProp = (args: PopupButtonChildrenRenderPropArgs) => React.ReactNode;

/** Properties for the [[PopupButton]] React component
 * @public
 * @deprecated use PopupItem in ToolbarWithOverflow or popupPanelNode in CustomItemDef
 */
export interface PopupButtonProps extends ItemProps, CommonProps {
  children?: React.ReactNode | PopupButtonChildrenRenderProp;
  onExpanded?: (expand: boolean) => void;
  onSizeKnown?: (size: SizeProps) => void;
  noPadding?: boolean;
}

const isFunction = <T extends (...args: any) => any>(node: React.ReactNode): node is T => {
  if (typeof node === "function")
    return true;
  return false;
};

/**
 * Used to provide custom popup button in toolbar.
 * @public
 * @deprecated use PopupItem in ToolbarWithOverflow or popupPanelNode in CustomItemDef
 */
export class PopupButton extends React.Component<PopupButtonProps, BaseItemState> {
  private _label: string | StringGetter | ConditionalStringValue = "";
  private _componentUnmounting = false;
  private _closeOnPanelOpened = true;
  private _ref = React.createRef<HTMLDivElement>();
  private _isMounted = false;

  constructor(props: PopupButtonProps) {
    super(props);

    if (props.label)
      this._label = props.label;
    // istanbul ignore else
    else if (props.labelKey)
      this._label = UiFramework.i18n.translate(props.labelKey);

    this.state = {
      isVisible: undefined !== props.isVisible ? props.isVisible : true, // eslint-disable-line deprecation/deprecation
      isEnabled: undefined !== props.isEnabled ? props.isEnabled : true, // eslint-disable-line deprecation/deprecation
      isActive: undefined !== props.isActive ? props.isActive : false,
      isPressed: undefined !== props.isPressed ? props.isPressed : false,
    };
  }

  public get label(): string {
    return PropsHelper.getStringFromSpec(this._label);
  }

  /** Minimizes the expandable component. */
  public minimize = () => {
    if (this._isMounted)
      this.setState({
        isPressed: false,
      });
  };

  private _handleSyncUiEvent = (args: SyncUiEventArgs): void => {
    // istanbul ignore if
    if (this._componentUnmounting) return;

    let refreshState = false;
    let newState: BaseItemState = { ...this.state };

    // istanbul ignore else
    if (this.props.stateSyncIds && this.props.stateSyncIds.length > 0) // eslint-disable-line deprecation/deprecation
      refreshState = this.props.stateSyncIds.some((value: string): boolean => args.eventIds.has(value.toLowerCase())); // eslint-disable-line deprecation/deprecation

    // istanbul ignore else
    if (refreshState) {
      // istanbul ignore else
      if (this.props.stateFunc) // eslint-disable-line deprecation/deprecation
        newState = this.props.stateFunc(newState); // eslint-disable-line deprecation/deprecation
      // istanbul ignore next
      if ((this.state.isActive !== newState.isActive) || (this.state.isEnabled !== newState.isEnabled) || (this.state.isVisible !== newState.isVisible)) {
        if (this._isMounted)
          this.setState({ isActive: newState.isActive, isEnabled: newState.isEnabled, isVisible: newState.isVisible });
      }
    }
  };

  public override componentDidMount() {
    this._isMounted = true;
    SyncUiEventDispatcher.onSyncUiEvent.addListener(this._handleSyncUiEvent);
    FrontstageManager.onToolPanelOpenedEvent.addListener(this._handleToolPanelOpenedEvent);
  }

  public override componentWillUnmount() {
    this._isMounted = false;
    this._componentUnmounting = true;
    SyncUiEventDispatcher.onSyncUiEvent.removeListener(this._handleSyncUiEvent);
    FrontstageManager.onToolPanelOpenedEvent.addListener(this._handleToolPanelOpenedEvent);
  }

  private _handleToolPanelOpenedEvent = () => {
    if (!this._closeOnPanelOpened)
      return;
    this.minimize();
  };

  private _handleKeyDown = (e: React.KeyboardEvent): void => {
    // istanbul ignore next
    if (e.key === SpecialKey.Escape) {
      this.minimize();
      KeyboardShortcutManager.setFocusToHome();
    }
  };

  /** Renders PopupButton */
  public override render() {
    if (!this.state.isVisible)
      return null;

    const icon = <Icon iconSpec={this.props.iconSpec} />;
    const badge = BadgeUtilities.getComponentForBadgeType(this.props.badgeType);
    const { isDisabled, ...otherProps } = this.props;
    return (
      <ToolbarDragInteractionContext.Consumer>
        {(isDragEnabled) => {
          return (
            <ExpandableItem
              {...otherProps}
              isDisabled={ConditionalBooleanValue.getValue(isDisabled)}
              hideIndicator={isDragEnabled}
              panel={this.getExpandedContent()}
            >
              <div ref={this._ref}>
                <Item
                  badge={badge}
                  icon={icon}
                  onKeyDown={this._handleKeyDown}
                  onClick={this._handleClick}
                  onSizeKnown={this.props.onSizeKnown}
                  title={this.label}
                />
              </div>
            </ExpandableItem>
          );
        }}
      </ToolbarDragInteractionContext.Consumer>
    );
  }

  /** Returns expanded content panel */
  private getExpandedContent(): React.ReactNode {
    if (!this.state.isPressed)
      return undefined;

    const classNames = classnames(
      "nz-toolbar-item-expandable-group-panel",
      this.props.noPadding && "uifw-popupbutton-noPadding",
    );

    return (
      <DivWithOnOutsideClick
        className={classNames}
        onOutsideClick={this._handleOutsideClick}
      >
        {isFunction<PopupButtonChildrenRenderProp>(this.props.children) ? this.props.children({
          closePanel: this.minimize,
        }) : this.props.children}
      </DivWithOnOutsideClick>
    );
  }

  private _handleClick = () => {
    // istanbul ignore else
    if (this._isMounted)
      this.setState((prevState) => {
        const isPressed = !prevState.isPressed;
        return {
          isPressed,
        };
      }, () => {
        const expand = !!this.state.isPressed;

        this._closeOnPanelOpened = false;
        expand && FrontstageManager.onToolPanelOpenedEvent.emit();
        this._closeOnPanelOpened = true;

        this.props.onExpanded && this.props.onExpanded(expand);
      });
  };

  private _handleOutsideClick = (e: MouseEvent) => {
    this._ref.current && (e.target instanceof Node) && !this._ref.current.contains(e.target) && this.minimize();
  };
}
