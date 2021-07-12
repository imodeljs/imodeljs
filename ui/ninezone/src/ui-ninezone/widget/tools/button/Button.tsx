/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Button.scss";
import classnames from "classnames";
import * as React from "react";
import {
  calculateBackdropFilterBlur, calculateBoxShadowOpacity, calculateToolbarOpacity, CommonProps, getToolbarBackdropFilter, getToolbarBackgroundColor,
  getToolbarBoxShadow, TOOLBAR_BACKDROP_FILTER_BLUR_DEFAULT, TOOLBAR_BOX_SHADOW_OPACITY_DEFAULT, TOOLBAR_OPACITY_DEFAULT,
} from "@bentley/ui-core";

/** Properties of [[ToolbarButton]] component.
 * @alpha
 */
export interface ToolbarButtonProps extends CommonProps {
  /** Button content. */
  children?: React.ReactNode;
  /** Function called when the button is clicked. */
  onClick?: () => void;
  /** Indicates whether to use a small App button */
  small?: boolean;
  /** Mouse proximity to button */
  mouseProximity?: number;
  /** Tooltip for button */
  title?: string;
}

/** Basic toolbar button. Used in [[Toolbar]] component.
 * @alpha
 */
export class ToolbarButton extends React.PureComponent<ToolbarButtonProps> {
  public override render() {
    const className = classnames(
      "nz-toolbar-button-button",
      this.props.className);
    const buttonStyle: React.CSSProperties = {
      ...this.props.style,
    };

    if (this.props.small) {
      let backgroundOpacity = TOOLBAR_OPACITY_DEFAULT;
      let boxShadowOpacity = TOOLBAR_BOX_SHADOW_OPACITY_DEFAULT;
      let filterBlur = TOOLBAR_BACKDROP_FILTER_BLUR_DEFAULT;

      if (this.props.mouseProximity !== undefined) {
        backgroundOpacity = calculateToolbarOpacity(this.props.mouseProximity);
        boxShadowOpacity = calculateBoxShadowOpacity(this.props.mouseProximity);
        filterBlur = calculateBackdropFilterBlur(this.props.mouseProximity);
      }

      buttonStyle.backgroundColor = getToolbarBackgroundColor(backgroundOpacity);
      buttonStyle.boxShadow = getToolbarBoxShadow(boxShadowOpacity);
      buttonStyle.backdropFilter = getToolbarBackdropFilter(filterBlur);
    }

    return (
      <button
        className={className}
        style={buttonStyle}
        onClick={this.props.onClick}
        title={this.props.title}
      >
        {!this.props.small &&
          <div className="nz-gradient" />
        }
        {this.props.children}
      </button>
    );
  }
}
