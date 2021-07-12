/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MessageCenter
 */

import "./Indicator.scss";
import classnames from "classnames";
import * as React from "react";
import { FooterIndicator, FooterIndicatorProps } from "../Indicator";

/** Properties of [[MessageCenter]] component.
 * @beta
 */
export interface MessageCenterProps extends FooterIndicatorProps {
  /** Message center balloon content. */
  children?: string;
  /** Clickable part of the indicator. */
  indicatorRef?: React.Ref<HTMLDivElement>;
  /** Message center label. */
  label?: string;
  /** Function called when indicator is clicked. */
  onClick?: () => void;
  /** Message center dialog target. */
  targetRef?: React.Ref<HTMLDivElement>;
}

/** Message center indicator used in [[Footer]] component.
 * @note Used with [[MessageCenterDialog]] component.
 * @beta
 */
export class MessageCenter extends React.PureComponent<MessageCenterProps> {
  public override render() {
    const { children, className, indicatorRef, label, onClick, targetRef, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    return (
      <FooterIndicator
        className={classnames("nz-footer-messageCenter-indicator", this.props.className)}
        {...props}
      >
        <div // eslint-disable-line jsx-a11y/click-events-have-key-events
          className="nz-indicator"
          onClick={onClick}
          ref={indicatorRef}
          role="button"
          tabIndex={-1}
        >
          {label !== undefined &&
            <span className="nz-label">{label}</span>
          }
          <div className="nz-container">
            <div className="nz-balloon">
              <div className="nz-arrow" />
              <div className="nz-content">
                {children}
              </div>
            </div>
            <div
              className="nz-target"
              ref={targetRef}
            />
          </div>
        </div>
      </FooterIndicator>
    );
  }
}
