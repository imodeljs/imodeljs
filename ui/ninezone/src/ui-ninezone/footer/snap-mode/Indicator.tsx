/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module SnapMode
 */

import "./Indicator.scss";
import classnames from "classnames";
import * as React from "react";
import { FooterIndicator, FooterIndicatorProps } from "../Indicator";

/** Properties of [[SnapMode]] component.
 * @beta
 */
export interface SnapModeProps extends FooterIndicatorProps {
  /** Indicator label. */
  children?: string;
  /** Indicator icon. */
  icon?: React.ReactNode;
  /** Clickable part of the indicator. */
  indicatorRef?: React.Ref<HTMLDivElement>;
  /** Function called when indicator is clicked. */
  onClick?: () => void;
}

/** Snap mode indicator used in [[Footer]] component.
 * @note Used with [[SnapModePanel]] component.
 * @beta
 */
export class SnapMode extends React.PureComponent<SnapModeProps> {
  public override render() {
    const { children, className, icon, indicatorRef, onClick, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    return (
      <FooterIndicator
        className={classnames("nz-footer-snapMode-indicator", this.props.className)}
        {...props}
      >
        <div // eslint-disable-line jsx-a11y/click-events-have-key-events
          className="nz-indicator"
          onClick={onClick}
          ref={indicatorRef}
          role="button"
          tabIndex={-1}
        >
          {children !== undefined &&
            <span className="nz-label">{children}</span>
          }
          <div
            className="nz-icon"
          >
            {icon}
          </div>
        </div>
      </FooterIndicator>
    );
  }
}
