/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Picker
 */

import "@bentley/ui-ninezone/lib/ui-ninezone/toolbar/item/expandable/group/tool/Tool.scss";
import "./ListPicker.scss";
import classnames from "classnames";
import * as React from "react";
import { PopupItem } from "@bentley/ui-components";
import { CommonProps, Icon, SizeProps, withOnOutsideClick } from "@bentley/ui-core";
import { containHorizontally, ExpandableItem, Group, GroupColumn, Item, Panel, withContainIn } from "@bentley/ui-ninezone";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { FrameworkVersionSwitch } from "../hooks/useFrameworkVersion";
import { ToolbarDragInteractionContext } from "../toolbar/DragInteraction";
import { UiFramework } from "../UiFramework";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ContainedGroup = withOnOutsideClick(withContainIn(Group), undefined, false);

/** Enum for the list picker item type
 * @beta
 */
export enum ListItemType {
  Item = 0, // eslint-disable-line @typescript-eslint/no-shadow
  Separator = 1,
  Container = 2,
}

/** List picker item
 * @beta
 */
export interface ListItem {
  [key: string]: any;
  name?: string;
  enabled: boolean;
  type?: ListItemType;
  children?: ListItem[];
}

/** Properties for the [[ListPickerBase]] component
 * @beta
 */
export interface ListPickerProps {
  title: string;
  items: ListItem[];
  iconSpec?: string | React.ReactNode;
  setEnabled: (item: ListItem, enabled: boolean) => any;
  onExpanded?: (expand: boolean) => void;
  onSizeKnown?: (size: SizeProps) => void;
}

/** State for the [[ListPickerBase]] component
 * @internal
 */
interface ListPickerState {
  expanded: boolean;
}

let lastOpenedPicker: ListPickerBase | undefined;

/** Properties for the [[ListPickerItem]] component
 * @beta
 */
export interface ListPickerItemProps extends CommonProps {
  key: any;
  isActive?: boolean;
  isFocused?: boolean;
  onClick?: () => void;
  label?: string;
}

/** List Picker Item React component
 * @beta
 */
export class ListPickerItem extends React.PureComponent<ListPickerItemProps> {
  /** Renders ListPickerItem */
  public override render() {
    const itemClassName = classnames(
      "ListPicker-item",
      this.props.isActive && "is-active",
      this.props.isFocused && "is-focused",
      this.props.className,
    );
    // TODO - if cut off, show a title
    const title: string | undefined = (this.props.label && this.props.label.length > 25) ? this.props.label : undefined;

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div className={itemClassName} onClick={this.props.onClick} role="button" tabIndex={-1}>
        <div className="label" title={title}>
          {this.props.label}
        </div>
      </div>
    );
  }
}

/** Properties for the [[ExpandableSection]] component
 * @beta
 */
export interface ExpandableSectionProps extends CommonProps {
  title?: string;
  expanded?: boolean;
}

/** State for the [[ExpandableSection]] component
 * @internal
 */
interface ExpandableSectionState {
  expanded: boolean;
}

/** Expandable Section React component used by [[ListPickerBase]]
 * @beta
 */
export class ExpandableSection extends React.PureComponent<ExpandableSectionProps, ExpandableSectionState> {
  /** Creates an ExpandableSection */
  constructor(props: ExpandableSectionProps) {
    super(props);
    this.state = { expanded: !!this.props.expanded };
  }

  private _onClick = () => {
    this.setState((prevState) => ({ expanded: !prevState.expanded }));
  };

  /** Renders ExpandableSection */
  public override render() {
    const className = classnames(
      "nz-toolbar-item-expandable-group-group",
      this.props.className,
    );

    const icon = this.state.expanded ? <i className="icon icon-chevron-down" /> : <i className="icon icon-chevron-right" />;

    return (
      <Panel className={className} style={this.props.style} key={this.props.title}>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div onClick={this._onClick}
          className={this.state.expanded ? "ListPickerInnerContainer-header-expanded" : "ListPickerInnerContainer-header"}
          role="button" tabIndex={-1} aria-expanded={this.state.expanded}
        >
          <div className="ListPickerInnerContainer-header-content">
            <div className="ListPickerInnerContainer-expander">{icon}</div>
            <div className="ListPickerInnerContainer-title">{this.props.title}</div>
          </div>
        </div>
        {this.state.expanded ?
          <GroupColumn>
            {this.props.children}
          </GroupColumn> : <div />
        }
      </Panel>
    );
  }
}

function getListPanel(props: ListPickerProps): React.ReactNode {
  const expandSingleSection = (): boolean => {
    const populatedContainers = props.items.filter((item: ListItem) => {
      return (item.type === ListItemType.Container && item.children!.length !== 0);
    });
    return populatedContainers.length === 1;
  };

  const listItemToElement = (item: ListItem, itemIndex: number) => {
    switch (item.type) {
      case ListItemType.Item:
        return (
          <ListPickerItem
            {...props}
            key={itemIndex.toString()}
            label={item.name}
            isActive={item.enabled}
            onClick={
              // istanbul ignore next
              () => { props.setEnabled(item, !item.enabled); }
            }
          />
        );
      case ListItemType.Separator:
        return (
          <div key={itemIndex.toString()} className="ListPicker-separator" />
        );
      case ListItemType.Container:
        if (item.children!.length !== 0) {
          return (
            <ExpandableSection
              key={itemIndex.toString()}
              title={item.name}
              className="ListPickerInnerContainer"
              expanded={expandSingleSection()}
            >
              <GroupColumn>
                {item.children!.map(listItemToElement)}
              </GroupColumn>
            </ExpandableSection>
          );
        } else {
          return (<div key={itemIndex.toString()} />);
        }
      // istanbul ignore next
      default:
        return (<div key={itemIndex.toString()} />);
    }
  };

  return (
    <ContainedGroup
      className="ListPickerContainer"
      columns={
        <GroupColumn className="ListPicker-column">
          {props.items.map(listItemToElement)}
        </GroupColumn>}
      containFn={containHorizontally}
      title={props.title}
    />
  );
}

/**
 * List picker base class.
 * Used to provide an expandable list of items to enable/disable items.
 * @beta
 */
export class ListPickerBase extends React.PureComponent<ListPickerProps, ListPickerState> {
  private _isMounted = false;
  private _closeOnPanelOpened = true;
  private _ref = React.createRef<HTMLDivElement>();

  /** Creates a ListPickerBase */
  constructor(props: any) {
    super(props);
    this.state = {
      expanded: false,
    };
  }

  /** Minimizes the expandable component. */
  public minimize = () => {
    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        expanded: false,
      });
  };

  /** Checks if ExpandableItem is expanded. */
  public isExpanded = () => {
    return this.state.expanded;
  };

  /** @internal */
  public override componentDidMount() {
    this._isMounted = true;
    FrontstageManager.onToolPanelOpenedEvent.addListener(this._handleToolPanelOpenedEvent);
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
    FrontstageManager.onToolPanelOpenedEvent.addListener(this._handleToolPanelOpenedEvent);
  }

  /** Renders ListPickerBase */
  public override render() {
    const icon = this.props.iconSpec ? /* istanbul ignore next */ (typeof this.props.iconSpec === "string" ?
      /* istanbul ignore next */ <Icon iconSpec={this.props.iconSpec} /> : <i className="icon uifw-item-svg-icon">{this.props.iconSpec}</i>) :
      <i className="icon icon-list" />;

    return (
      <ToolbarDragInteractionContext.Consumer>
        {(isEnabled) => {
          return (
            <ExpandableItem
              {...this.props}
              hideIndicator={isEnabled}
              panel={this.getExpandedContent()}
            >
              <div ref={this._ref}>
                <Item
                  icon={icon}
                  onClick={this._handleClick}
                  onSizeKnown={this.props.onSizeKnown}
                  title={this.props.title}
                />
              </div>
            </ExpandableItem>
          );
        }}
      </ToolbarDragInteractionContext.Consumer>
    );
  }

  /** Returns the list with the items */
  public getExpandedContent(): React.ReactNode {
    if (!this.state.expanded)
      return undefined;

    const expandSingleSection = (): boolean => {
      const populatedContainers = this.props.items.filter((item: ListItem) => {
        return (item.type === ListItemType.Container && item.children!.length !== 0);
      });
      return populatedContainers.length === 1;
    };

    const listItemToElement = (item: ListItem, itemIndex: number) => {
      switch (item.type) {
        case ListItemType.Item:
          return (
            <ListPickerItem
              {...this.props}
              key={itemIndex.toString()}
              label={item.name}
              isActive={item.enabled}
              onClick={() => { this.props.setEnabled(item, !item.enabled); }}
            />
          );
        case ListItemType.Separator:
          return (
            <div key={itemIndex.toString()} className="ListPicker-separator" />
          );
        case ListItemType.Container:
          if (item.children!.length !== 0) {
            return (
              <ExpandableSection
                key={itemIndex.toString()}
                title={item.name}
                className="ListPickerInnerContainer"
                expanded={expandSingleSection()}
              >
                <GroupColumn>
                  {item.children!.map(listItemToElement)}
                </GroupColumn>
              </ExpandableSection>
            );
          } else {
            return (<div key={itemIndex.toString()} />);
          }
        default:
          return (<div key={itemIndex.toString()} />);
      }
    };

    return (
      <ContainedGroup
        className="ListPickerContainer"
        columns={
          <GroupColumn className="ListPicker-column">
            {this.props.items.map(listItemToElement)}
          </GroupColumn>}
        containFn={containHorizontally}
        onOutsideClick={this._handleOnOutsideClick}
        title={this.props.title}
      />
    );
  }

  private _handleOnOutsideClick = (e: MouseEvent) => {
    if (!this._ref.current || !(e.target instanceof Node) || this._ref.current.contains(e.target))
      return;
    this.minimize();
    this.props.onExpanded && this.props.onExpanded(false);
  };

  private _handleToolPanelOpenedEvent = () => {
    if (!this._closeOnPanelOpened)
      return;
    this.minimize();
  };

  private _handleClick = () => {
    // istanbul ignore next
    if (!this._isMounted)
      return;

    this.setState((prevState) => {
      const expanded = !prevState.expanded;
      return {
        expanded,
      };
    }, () => {
      const expanded = this.state.expanded;
      if (expanded) {
        // Minimize any other list picker that has been opened
        // This is to mimic Bimium's behavior where pickers only close when other pickers are opened
        if (lastOpenedPicker && lastOpenedPicker !== this && lastOpenedPicker.isExpanded())
          lastOpenedPicker.minimize();

        lastOpenedPicker = this;

        this._closeOnPanelOpened = false;
        expanded && FrontstageManager.onToolPanelOpenedEvent.emit();
        this._closeOnPanelOpened = true;
      }

      this.props.onExpanded && this.props.onExpanded(expanded);
    });
  };
}

/**
 * List picker toolbar popup item.
 * Used to provide an expandable list of items to enable/disable items.
 * @beta
 */
function ListPickerPopupItem(props: ListPickerProps) {
  const icon = props.iconSpec ? /* istanbul ignore next */ (typeof props.iconSpec === "string" ? <Icon iconSpec={props.iconSpec} /> :
    <i className="icon uifw-item-svg-icon">{props.iconSpec}</i>) : <Icon iconSpec="icon-list" />;

  return (
    <ToolbarDragInteractionContext.Consumer>
      {(isEnabled) => {
        return <PopupItem
          hideIndicator={isEnabled}
          icon={icon}
          title={props.title}
          panel={getListPanel(props)}
        />;
      }}
    </ToolbarDragInteractionContext.Consumer>
  );
}

/** Properties for the [[ListPicker]] component
 * @beta
 */
export interface ListPickerPropsExtended extends ListPickerProps {
  enableAllFunc?: () => void;
  disableAllFunc?: () => void;
  invertFunc?: () => void;
}

/**
 * List Picker that lets the user pick from a list of items to enable/disable
 * It also provides options to enable all, disable all and invert selection
 * @beta
 */
export class ListPicker extends React.Component<ListPickerPropsExtended> {
  public static get Key_All() { return -3; }
  public static get Key_None() { return -2; }
  public static get Key_Invert() { return -1; }
  public static get Key_Separator() { return -4; }

  /** Creates a ListPicker */
  constructor(props: ListPickerPropsExtended) {
    super(props);
  }

  // Creates an array of items containing the separator and special requests (all, none, invert)
  private createItems(items: ListItem[]): ListItem[] {
    const newItems: ListItem[] = [];

    // Create special buttons (All/None/Invert)
    if (this.props.enableAllFunc) {
      let allEnabled = true;
      items.map((item: ListItem) => { allEnabled = allEnabled && item.enabled; });
      newItems.push({ key: ListPicker.Key_All, name: UiFramework.translate("pickerButtons.all"), enabled: allEnabled, type: ListItemType.Item });
    }
    if (this.props.disableAllFunc) {
      let allDisabled = false;
      items.map((item: ListItem) => { allDisabled = allDisabled || item.enabled; });
      newItems.push({ key: ListPicker.Key_None, name: UiFramework.translate("pickerButtons.none"), enabled: !allDisabled, type: ListItemType.Item });
    }
    if (this.props.invertFunc) {
      newItems.push({ key: ListPicker.Key_Invert, name: UiFramework.translate("pickerButtons.invert"), enabled: false, type: ListItemType.Item });
    }
    if (this.props.enableAllFunc || this.props.disableAllFunc || this.props.invertFunc) {
      newItems.push({ key: ListPicker.Key_Separator, name: UiFramework.translate("pickerButtons.separator"), enabled: false, type: ListItemType.Separator });
    }

    // Push items
    items.map((item) => { newItems.push(item); });
    return newItems;
  }

  /**
   * Checks if item is a special item.
   * @param item Item to check
   */
  public isSpecialItem(item: ListItem) {
    return item.key === ListPicker.Key_All || item.key === ListPicker.Key_Invert || item.key === ListPicker.Key_None || item.type !== ListItemType.Item || item.key === ListPicker.Key_Separator;
  }

  // Handle enabling/disabling the items
  // This will call the this.props.setEnabled function to provide the parent with a chance to process it
  private _setEnabled = (item: ListItem, enabled: boolean) => {
    if (this.isSpecialItem(item)) {
      switch (item.key) {
        case ListPicker.Key_All: {
          // istanbul ignore else
          if (this.props.enableAllFunc)
            this.props.enableAllFunc();
          return;
        }
        case ListPicker.Key_None: {
          // istanbul ignore else
          if (this.props.disableAllFunc)
            this.props.disableAllFunc();
          return;
        }
        case ListPicker.Key_Invert: {
          // istanbul ignore else
          if (this.props.invertFunc)
            this.props.invertFunc();
          return;
        }
      }
    }

    // Call on parent to do processing of the item
    this.props.setEnabled(item, enabled);
  };

  /** Renders ListPicker */
  public override render() {
    return (
      <FrameworkVersionSwitch
        v1={
          <ListPickerBase
            {...this.props}
            title={this.props.title}
            setEnabled={this._setEnabled}
            onExpanded={this.props.onExpanded}
            items={this.createItems(this.props.items)}
            iconSpec={this.props.iconSpec}
          />
        }
        v2={
          <ListPickerPopupItem
            {...this.props}
            title={this.props.title}
            setEnabled={this._setEnabled}
            onExpanded={this.props.onExpanded}
            items={this.createItems(this.props.items)}
            iconSpec={this.props.iconSpec}
          />
        }
      />
    );
  }
}
