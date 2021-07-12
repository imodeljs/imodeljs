/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ProjectTabs.scss";
import classnames from "classnames";
import * as React from "react";

/**
 * Properties for the [[ProjectTab]] component. A temporary tab component.  Do not reuse!
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
 * A temporary tab component.  Do not reuse!
 * @internal
 */
export class ProjectTab extends React.Component<TabProps> {
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

  public renderIndicator() {
    const percentageOffset = this.props.selectedTabIndex! * 100;
    const translate = `translate(0,${percentageOffset}%)`;
    const translateStyle: React.CSSProperties = { transform: translate };

    return (
      <div className="tab-indicator" style={translateStyle}></div>
    );
  }

  // {this.props.index === 0 && this.renderIndicator()}

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
 * List of tabs.  Do not reuse!
 * @internal
 */
export class ProjectTabs extends React.Component<TabsProps, TabsState> {

  constructor(props: TabsProps, context?: any) {
    super(props, context);

    this.state = { activeTab: this.props.defaultTab };
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
      <div className="tabs">
        <nav>
          <ul>
            {this.renderChildren()}
          </ul>
        </nav>
      </div>
    );
  }
}
