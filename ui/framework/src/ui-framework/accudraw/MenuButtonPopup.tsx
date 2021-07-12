/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module AccuDraw
 */

import * as React from "react";
import { Size, SizeProps } from "@bentley/ui-core";
import { PopupManager, PopupPropsBase } from "../popup/PopupManager";
import { MenuButton } from "./MenuButton";

/** @alpha */
export interface MenuButtonPopupProps extends PopupPropsBase {
  content: React.ReactNode;
}

/** @internal */
interface MenuButtonPopupState {
  size: Size;
}

/** Popup component for Menu Buttons
 * @alpha
 */
export class MenuButtonPopup extends React.PureComponent<MenuButtonPopupProps, MenuButtonPopupState> {
  /** @internal */
  public override readonly state = {
    size: new Size(-1, -1),
  };

  private _onSizeKnown = (newSize: SizeProps) => {
    // istanbul ignore else
    if (!this.state.size.equals(newSize))
      this.setState({ size: Size.create(newSize) });
  };

  /** @internal */
  public override render() {
    const point = PopupManager.getPopupPosition(this.props.el, this.props.pt, this.props.offset, this.state.size);

    return (
      <MenuButton key={this.props.id}
        point={point}
        onSizeKnown={this._onSizeKnown}
      >
        {this.props.content}
      </MenuButton>
    );
  }
}
