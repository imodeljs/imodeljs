/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module AccuDraw
 */

import "./MenuButton.scss";
import * as React from "react";
import { ContextMenu, Icon, PointProps, Size, SizeProps } from "@bentley/ui-core";
import { SquareButton, SquareButtonProps } from "./SquareButton";

/** @alpha */
export interface MenuButtonProps extends SquareButtonProps {
  /** Center point */
  point: PointProps;
  /** Function called when size is known. */
  onSizeKnown?: (size: SizeProps) => void;
}

/** @internal */
interface MenuButtonState {
  expanded: boolean;
}

/** @alpha */
export class MenuButton extends React.PureComponent<MenuButtonProps, MenuButtonState> {
  private _menu: ContextMenu | null = null;

  constructor(props: MenuButtonProps) {
    super(props);

    this.state = {
      expanded: false,
    };
  }

  public override render() {
    const { point, className, style, onSizeKnown, ...buttonProps } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars

    const divStyle: React.CSSProperties = {
      top: point.y,
      left: point.x,
    };

    return (
      <div className="uifw-menu-button" style={divStyle} ref={(e) => this.setDivRef(e)}>
        <SquareButton {...buttonProps} className={className} style={style} onClick={this._handleClick}>
          <Icon iconSpec="icon-more-2" />
        </SquareButton>
        <ContextMenu
          ref={(el) => { this._menu = el; }}
          selectedIndex={0}
          onSelect={this._handleClose}
          onOutsideClick={this._handleClose}
          onEsc={this._handleClose}
          opened={this.state.expanded}
          autoflip={false}>
          {this.props.children}
        </ContextMenu>
      </div>
    );
  }

  private setDivRef(div: HTMLDivElement | null) {
    // istanbul ignore else
    if (div) {
      const rect = div.getBoundingClientRect();
      const size = new Size(rect.width, rect.height);

      // istanbul ignore else
      if (this.props.onSizeKnown)
        this.props.onSizeKnown(size);
    }
  }

  private _open = () => {
    this.setState(
      { expanded: true },
      () => {
        // istanbul ignore else
        if (this._menu)
          this._menu.focus();
      });
  };

  private _handleClick = (event: any) => {
    if (this.state.expanded) {
      event.stopPropagation();
      this.setState({ expanded: false });
    } else {
      this._open();
    }
  };

  // istanbul ignore next
  private _handleClose = () => {
    this.setState({ expanded: false });
  };

}
