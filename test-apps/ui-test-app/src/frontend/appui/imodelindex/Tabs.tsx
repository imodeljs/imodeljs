/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./Tabs.scss";
import classnames from "classnames";
import * as React from "react";

/**
 * Properties for the [[Tab]] component.
 * @internal
 */
export interface TabProps {
  label?: string;
  icon?: string;
  isSeparator?: boolean;
  index?: number;
  selectedTabIndex?: number;
  onTabClicked?: () => any;
}

/**
 * Specific Tab component for IModelIndex.
 * @internal
 */
export class Tab extends React.Component<TabProps> {
  public static defaultProps: Partial<TabProps> = {
    label: "",
    icon: "",
    selectedTabIndex: 0,
  };

  private _onClick = () => {
    if (this.props.onTabClicked) {
      this.props.onTabClicked();
    }
  };

  public override render() {
    const isActive = this.props.index === this.props.selectedTabIndex!;
    const classes = classnames("tabs-style-linemove", isActive && "tab-active");
    const icon = classnames("icon", this.props.icon);
    return (
      <li className={classes} onClick={this._onClick}>
        <a>
          <span className={icon} />
          <span className="text">{this.props.label}</span>
        </a>
      </li>
    );
  }
}

/** Properties for the [[ProjectTabs]] component
 * @internal
 */
export interface TabsProps {
  onClick?: (tabIndex: number) => any;
  defaultTab: number;
}

interface TabsState {
  activeTab: number;
}

/**
 * List of tabs.
 * @internal
 */
export class Tabs extends React.Component<TabsProps, TabsState> {

  constructor(props: TabsProps, context?: any) {
    super(props, context);

    this.state = { activeTab: this.props.defaultTab };
  }

  public override componentDidUpdate() {
    if (this.props.defaultTab !== this.state.activeTab)
      this.setState((_, props) => ({ activeTab: props.defaultTab }));
  }

  // set active tab
  private _handleTabClick = (tabIndex: number, onTabClick: () => any) => {
    this.setState({ activeTab: tabIndex });

    // fire the tab onClick
    if (onTabClick) {
      onTabClick();
    }

    // fire the tabs onClick
    if (this.props.onClick)
      this.props.onClick(tabIndex);
  };

  private renderChildren() {
    return React.Children.map(this.props.children, (child: any, i) => {
      return React.cloneElement(child, {
        isActive: i === this.state.activeTab,
        index: i,
        selectedTabIndex: this.state.activeTab,
        onTabClicked: this._handleTabClick.bind(this, i, child.props.onTabClicked),
      });
    });
  }

  public override render() {
    return (
      <div className="tabstrip">
        <nav>
          <ul>
            {this.renderChildren()}
          </ul>
        </nav>
      </div>
    );
  }
}
