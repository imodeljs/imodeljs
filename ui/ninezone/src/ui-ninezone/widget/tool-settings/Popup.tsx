/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Footer
 */

import "./Popup.scss";
import classnames from "classnames";
import * as React from "react";
import { RelativePosition } from "@bentley/ui-abstract";
import { CommonProps, Popup } from "@bentley/ui-core";

/** Properties of [[ToolSettingsPopup]] component.
 * @beta
 */
export interface ToolSettingsPopupProps extends CommonProps {
  /** Popup content. */
  children?: React.ReactNode;
  /** Describes if the popup is open. */
  isOpen?: boolean;
  /** Function called when the popup is closed. */
  onClose?: () => void;
  /** Popup target. */
  target?: HTMLElement | null;
}

/** Popup component used in [[ToolSettings]] component.
 * @beta
 */
export class ToolSettingsPopup extends React.PureComponent<ToolSettingsPopupProps> {
  public override render() {
    const { className, ...props } = this.props;
    return (
      <Popup
        className={classnames(
          "nz-widget-toolSettings-popup",
          className,
        )}
        position={RelativePosition.Bottom}
        showArrow
        showShadow={false}
        {...props}
      >
        <div className="nz-content">
          {this.props.children}
        </div>
      </Popup>
    );
  }
}
