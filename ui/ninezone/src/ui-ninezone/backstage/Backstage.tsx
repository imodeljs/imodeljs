/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import "./Backstage.scss";
import classnames from "classnames";
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { CommonProps } from "@bentley/ui-core";
import { SafeAreaInsets, SafeAreaInsetsHelpers } from "../utilities/SafeAreaInsets";

/** Properties of [[Backstage]] component.
 * @beta
 */
export interface BackstageProps extends CommonProps {
  /** Backstage items and separators. I.e. [[BackstageItem]], [[BackstageSeparator]] */
  children?: React.ReactNode;
  /** Optional footer content. */
  footer?: React.ReactNode;
  /** Optional header content. I.e. [[UserProfile]] */
  header?: React.ReactNode;
  /** Describes if the backstage is open. */
  isOpen?: boolean;
  /** Function called when backstage is closed. */
  onClose?: () => void;
  /** Describes respected safe area insets. */
  safeAreaInsets?: SafeAreaInsets;
  /** Describes if a ghosting overlay is shown. */
  showOverlay: boolean;
}

/** Default properties of [[Backstage]] component.
 * @beta
 */
export type BackstageDefaultProps = Pick<BackstageProps, "showOverlay">;

/** Backstage component of 9-Zone UI app.
 * @beta
 */
export class Backstage extends React.PureComponent<BackstageProps> {
  public static readonly defaultProps: BackstageDefaultProps = {
    showOverlay: true,
  };

  public override componentDidMount(): void {
    document.addEventListener("keydown", this._onEsc, false);
  }

  public override componentWillUnmount() {
    document.removeEventListener("keydown", this._onEsc, false);
  }

  public override render() {
    const overlayClassName = classnames(
      "nz-backstage-backstage_overlay",
      this.props.isOpen && "nz-open",
      this.props.showOverlay && "nz-overlay");
    const backstageClassName = classnames(
      "nz-backstage-backstage",
      this.props.isOpen && "nz-open",
      this.props.safeAreaInsets && SafeAreaInsetsHelpers.getCssClassNames(this.props.safeAreaInsets),
      this.props.className);
    return (
      <>
        <div className={overlayClassName} onClick={this._onClose} role="presentation" />
        <div className={backstageClassName} style={this.props.style}>
          {this.props.header &&
            <div className="nz-header">
              {this.props.header}
            </div>
          }
          <ul role="menu">
            {this.props.children}
          </ul>
          {this.props.footer &&
            <div className="nz-footer">
              {this.props.footer}
            </div>
          }
        </div>
      </>
    );
  }

  private _onClose = () => {
    this.props.onClose && this.props.onClose();
  };

  private _onEsc = (event: KeyboardEvent): void => {
    if (this.props.isOpen && event.key === SpecialKey.Escape) {
      this._onClose();
    }
  };
}
