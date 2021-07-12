/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { RadialButton, RadialMenu } from "@bentley/ui-core";

export interface TestRadialMenuProps {
  opened: boolean;
  onClose?: () => void;
}

export interface TestRadialMenuState {
  opened: boolean;
  data: any;
}

export class TestRadialMenu extends React.Component<TestRadialMenuProps, TestRadialMenuState> {
  public override readonly state: Readonly<TestRadialMenuState>;

  constructor(props: TestRadialMenuProps) {
    super(props);
    const data = [
      { label: "Browse", icon: "icon-browse-2" },
      { label: "Properties", icon: "icon-properties-list" },
      { label: "Status", icon: "icon-status-update" },
      { label: "App 2", icon: "icon-fill" },
      { label: "App 1", icon: "icon-process" },
      { label: "Tools", icon: "icon-tools" },
      { label: "Settings", icon: "icon-settings" },
      { label: "Navigation", icon: "icon-view-navigation" },
    ];
    this.state = {
      opened: this.props.opened,
      data,
    };
  }

  public override render(): JSX.Element {
    return (
      <RadialMenu
        left={"50%"}
        top={"50%"}
        opened={this.state.opened}
        onBlur={this._close}
        onEsc={this._close}
        innerRadius={55} outerRadius={140}>
        {this.state.data.map((obj: any, index: any) => {
          return (
            <RadialButton
              key={index}
              icon={obj.icon}
              onSelect={this._close}>{obj.label}</RadialButton>
          );
        })}
      </RadialMenu>
    );
  }

  private _close = () => {
    this.setState({ opened: false }, () => {
      if (this.props.onClose)
        this.props.onClose();
    });
  };

  public override componentDidUpdate(prevProps: TestRadialMenuProps) {
    if (prevProps.opened !== this.props.opened) {
      this.setState((_, props) => ({ opened: props.opened }));
    }
  }
}
