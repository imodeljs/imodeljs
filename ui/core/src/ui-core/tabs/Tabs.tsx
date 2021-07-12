/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tabs
 */

import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";
import { Orientation } from "../enums/Orientation";
import { ItemKeyboardNavigator } from "../focus/ItemKeyboardNavigator";
import { IconHelper } from "../utils/IconHelper";

/** TabLabel provides ability to define label, icon, and tooltip for a tab entry. The tooltip can be defined as JSX|Element
 *  to support react-tooltip component or a string that will be use to set the title property.
 * @beta
 */
export interface TabLabel {
  label: string;
  subLabel?: string;
  icon?: string | JSX.Element;
  tabId: string; /* optional id added to tab so it can be used by react-tooltip  */
  /** tooltip allows JSX.Element to support styled tooltips like react-tooltip. */
  tooltip?: string | JSX.Element;
  disabled?: boolean;
}

function isTabLabelWithIcon(item: string|TabLabel): item is TabLabel {
  return (typeof item !== "string") && !!(item ).icon;
}

function isTabLabel(item: string|TabLabel): item is TabLabel {
  return (typeof item !== "string");
}

/** Properties for the [[HorizontalTabs]] and [[VerticalTabs]] components
 * @public
 */
export interface TabsProps extends React.AllHTMLAttributes<HTMLUListElement>, CommonProps {
  /** Text shown for each tab @beta */
  labels: Array <string|TabLabel>;
  /** Handler for activating a tab */
  onActivateTab?: (index: number) => any;
  /** Index of the initial active tab */
  activeIndex?: number;
  /** Indicates whether the bar on the active tab is green instead of the default blue */
  green?: boolean;

  /** Handler for clicking on a label
   * @deprecated Use `onActivateTab` instead
   */
  onClickLabel?: (index: number) => any;
}

/** State for [[Tabs]] component
 * @internal
 */
interface TabsState {
  activeIndex: number;
}

/** Properties for the base [[Tabs]] component
 * @public
 */
export interface MainTabsProps extends TabsProps {
  /** Main CSS class name */
  mainClassName: string;
  /** Orientation of the Tabs list */
  orientation: Orientation;
}

/** Tabs meant to represent the current position in a page/section
 * @public
 */
export class Tabs extends React.PureComponent<MainTabsProps, TabsState> {
  private _anchorRefs: Array<React.RefObject<HTMLAnchorElement>> = [];
  private _itemKeyboardNavigator: ItemKeyboardNavigator;

  constructor(props: MainTabsProps) {
    super(props);

    const activeIndex = this.validateActiveIndex(props.activeIndex);
    this.state = {
      activeIndex,
    };

    props.labels.forEach(() => this._anchorRefs.push(React.createRef<HTMLAnchorElement>()));
    this._itemKeyboardNavigator = new ItemKeyboardNavigator(this._handleFocusItem, this._activateTab);
  }

  private validateActiveIndex(idx?: number): number {
    let activeIndex = 0;
    if (idx && idx >= 0 && idx < this.props.labels.length)
      activeIndex = idx;
    return activeIndex;
  }

  /** @internal */
  public override componentDidMount() {
    this._itemKeyboardNavigator.itemCount = this.props.labels.length;
    this._itemKeyboardNavigator.orientation = this.props.orientation;
  }

  /** @internal */
  public override componentDidUpdate(prevProps: MainTabsProps) {
    if (prevProps.labels !== this.props.labels)
      this._itemKeyboardNavigator.itemCount = this.props.labels.length;

    if (prevProps.orientation !== this.props.orientation)
      this._itemKeyboardNavigator.orientation = this.props.orientation;

    if (prevProps.activeIndex !== this.props.activeIndex) {
      let hadFocus = false;
      const element = this._anchorRefs[this.state.activeIndex].current;
      // istanbul ignore else
      if (element && document.activeElement === element)
        hadFocus = true;
      const activeIndex = this.validateActiveIndex(this.props.activeIndex);

      this.setState(
        () => ({ activeIndex }),
        () => {
          // istanbul ignore else
          if (hadFocus) {
            const newElement = this._anchorRefs[activeIndex].current;
            // istanbul ignore else
            if (newElement)
              newElement.focus();
          }
        });
    }
  }

  private _handleFocusItem = (index: number) => {
    const itemRef = this._anchorRefs[index];
    // istanbul ignore else
    if (itemRef && itemRef.current)
      itemRef.current.focus();
  };

  private _handleTabClick = (index: number) => {
    this._activateTab(index);
  };

  /** Handle keydown on tabs */
  private _handleKeyDownEvent(event: React.KeyboardEvent, index: number) {
    this._itemKeyboardNavigator.handleKeyDownEvent(event, index);
  }

  /** Handle keyup on tabs */
  private _handleKeyUpEvent(event: React.KeyboardEvent, index: number) {
    this._itemKeyboardNavigator.handleKeyUpEvent(event, index);
  }

  private _activateTab = (index: number) => {
    this.props.onClickLabel && this.props.onClickLabel(index);  // eslint-disable-line deprecation/deprecation
    this.props.onActivateTab && this.props.onActivateTab(index);
    this.setState({ activeIndex: index });
  };

  /** @internal */
  public override render(): JSX.Element {
    const ulClassNames = classnames(
      this.props.mainClassName,
      this.props.green && "uicore-tabs-green",
      this.props.className,
    );

    const anyIconsPresent = (this.props.labels.reduce ((a, b) => a + (isTabLabelWithIcon(b) ? 1 : 0), 0)) > 0;

    return (
      <ul className={ulClassNames} style={this.props.style}
        role="tablist"
        aria-orientation={this.props.orientation === Orientation.Vertical ? "vertical" : "horizontal"}
      >
        {this.props.labels.map((label, index) => {
          let disabled;
          let tooltipElement: JSX.Element|undefined;
          let title: string|undefined;
          let subLabel: string|undefined;
          let tabId = "";
          let icon;
          if (isTabLabel(label)) {
            icon = IconHelper.getIconReactNode (label.icon);
            subLabel = label.subLabel;
            disabled = label.disabled;
            tabId = label.tabId;
            if (React.isValidElement(label.tooltip))
              tooltipElement = label.tooltip;
            else if (typeof label.tooltip === "string")
              title = label.tooltip;
          }
          return <li key={index} title={title}
            className={classnames(index === this.state.activeIndex && "core-active", disabled && "core-tab-item-disabled")}
            role="tab"
            aria-selected={index === this.state.activeIndex}
            data-for={`${tabId}`} /* to support react-tooltip */
          >
            {tooltipElement}
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a ref={this._anchorRefs[index]}
              tabIndex={index === this.state.activeIndex ? 0 : -1}
              onClick={() => this._handleTabClick(index)}
              onKeyDown={(event) => this._handleKeyDownEvent(event, index)}
              onKeyUp={(event) => this._handleKeyUpEvent(event, index)}
              data-testid={`${tabId}`}
              role="button"
            > <div className={classnames("uicore-tabs-inline-label", disabled && "core-tab-item-disabled")}>
                {anyIconsPresent && <span className="uicore-tabs-icon">{icon}</span>}
                <div className="uicore-tabs-label-subLabel-container">
                  <span>{(typeof label === "string") ? label : label.label}</span>
                  {subLabel && <span className="uicore-tabs-subLabel">{subLabel}</span>}
                </div>
              </div>
            </a>
          </li>;
        }
        )}
      </ul>
    );
  }
}
