/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./Navigation.scss";
import classnames from "classnames";
import * as React from "react";

/** Highlight style of the Navigation List. */
export enum NavigationHighlightStyle {
  movingbar, // highlight bar will move (animate) up and down the list
  bar,       // bar will fill (animate)
}

/** Properties for the [[NavigationItem]] component */
export interface NavigationItemProps {
  label?: string;
  icon?: string;
  index?: number;
  selectedTabIndex?: number;
  highlightStyle?: NavigationHighlightStyle;
  onClicked?: () => any;
}

/**
 * A single navigation item
 */
export class NavigationItem extends React.Component<NavigationItemProps> {
  public static defaultProps: Partial<NavigationItemProps> = {
    label: "",
    icon: "",
    selectedTabIndex: 0,
  };

  private _onClick = () => {
    if (this.props.onClicked) {
      this.props.onClicked();
    }
  };

  public renderMovebarIndicator() {
    const percentageOffset = this.props.selectedTabIndex! * 100;
    const translate = `translate(0,${percentageOffset}%)`;
    const translateStyle: React.CSSProperties = { transform: translate, zIndex: 2 };
    return (
      <div className="open-navbar-movebarindicator" style={translateStyle}></div>
    );
  }

  public renderBarIndicator() {
    return (
      <div className="open-navbar-movebarindicator"></div>
    );
  }

  public renderMoveBar() {
    const isActive = this.props.index === this.props.selectedTabIndex!;
    const classes = classnames("navnode", isActive && "active");
    const icon = classnames("icon", this.props.icon);
    return (
      <li className={classes} onClick={this._onClick}>
        <span className={icon} />
        <span className="label">{this.props.label}</span>
        {this.props.highlightStyle === NavigationHighlightStyle.movingbar && this.props.index === 0 && this.renderMovebarIndicator()}
        {this.props.highlightStyle === NavigationHighlightStyle.bar && this.renderBarIndicator()}
      </li>
    );
  }

  public renderBar() {
    const isActive = this.props.index === this.props.selectedTabIndex!;
    const classes = classnames(isActive && "active");
    const icon = classnames("icon", this.props.icon);
    return (
      <li className={classes} onClick={this._onClick}>
        <span className={icon} />
        <span className="label">{this.props.label}</span>
        <div className="open-navbar-barindicator"></div>
      </li>
    );
  }

  public override render() {
    if (this.props.highlightStyle === NavigationHighlightStyle.movingbar)
      return this.renderMoveBar();
    else
      return this.renderBar();
  }
}

/** Properties for the [[NavigationList]] component */
export interface NavigationListProps {
  onClick?: (navItem: NavigationItem) => any;
  onExpandChanged?: (isPinned: boolean) => any;
  defaultTab: number;
  highlightStyle?: NavigationHighlightStyle;
}

interface NavigationListState {
  activeTab: number;
  isPinned: boolean;
}

/**
 * Navigation component for IModel open
 */
export class NavigationList extends React.Component<NavigationListProps, NavigationListState> {

  public static defaultProps: Partial<NavigationListProps> = {
    highlightStyle: NavigationHighlightStyle.movingbar,
  };

  constructor(props: NavigationListProps, context?: any) {
    super(props, context);

    this.state = { activeTab: this.props.defaultTab, isPinned: false };
  }

  private _handleClick = (tabIndex: number) => {
    this.setState({ activeTab: tabIndex });
  };

  // toggle pinned state
  private _handleExpandClick = () => {
    this.setState(
      (prevState) => ({ isPinned: !prevState.isPinned }),
      () => { this._handleOnPinClick(); });
  };

  // handle pin clicked
  private _handleOnPinClick = () => {
    if (this.props.onExpandChanged)
      this.props.onExpandChanged(this.state.isPinned);
  };

  private renderChildren() {
    return React.Children.map(this.props.children, (child: any, i) => {
      return React.cloneElement(child, {
        isActive: i === this.state.activeTab,
        index: i,
        selectedTabIndex: this.state.activeTab,
        highlightStyle: this.props.highlightStyle,
        onClicked: this._handleClick.bind(this, i),
      });
    });
  }

  public override render() {
    const classNavbar = classnames("open-navbar", this.state.isPinned && "pinned");
    return (
      <div className={classNavbar}>
        <div className="expander">
          <span className="icon icon-chevron-right" onClick={this._handleExpandClick} />
          <span className="icon icon-pin" title="Pin the navigation pane" onClick={this._handleExpandClick} />
          <span className="icon icon-chevron-left" onClick={this._handleExpandClick} />
        </div>
        <ul>
          {this.renderChildren()}
        </ul>
      </div>
    );
  }
}
