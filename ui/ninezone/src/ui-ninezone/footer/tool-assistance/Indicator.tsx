/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ToolAssistance
 */

import "./Indicator.scss";
import classnames from "classnames";
import * as React from "react";
import { FooterIndicator, FooterIndicatorProps } from "../Indicator";

/** Properties of [[ToolAssistance]] component.
 * @beta
 */
export interface ToolAssistanceProps extends FooterIndicatorProps {
  /** Indicator label. */
  children?: string;
  /** Indicator icons. */
  icons?: React.ReactNode;
  /** Clickable part of the indicator. */
  indicatorRef?: React.Ref<HTMLDivElement>;
  /** Function called when indicator is clicked. */
  onClick?: () => void;
}

/** Tool assistance indicator used in [[Footer]] component.
 * @note Used with [[ToolAssistanceDialog]] component.
 * @beta
 */
export class ToolAssistance extends React.PureComponent<ToolAssistanceProps> {
  public override render() {
    const { children, className, icons, indicatorRef, onClick, title, ...props } = this.props;
    return (
      <FooterIndicator
        className={classnames("nz-footer-toolAssistance-indicator", className)}
        {...props}
      >
        <div // eslint-disable-line jsx-a11y/click-events-have-key-events
          className="nz-indicator"
          onClick={onClick}
          ref={indicatorRef}
          role="button"
          tabIndex={-1}
          title={title}
        >
          <div className="nz-icons">
            {icons}
          </div>
          {children !== undefined &&
            <span className="nz-content">{children}</span>
          }
          <div className="nz-triangle" />
        </div>
      </FooterIndicator>
    );
  }
}
