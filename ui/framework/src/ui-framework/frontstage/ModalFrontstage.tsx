/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Frontstage
 */

import "./ModalFrontstage.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { BackButton } from "@bentley/ui-ninezone";
import { UiFramework } from "../UiFramework";

/**
 * Properties for the [[ModalFrontstage]] React component
 * @public
 */
export interface ModalFrontstageProps extends CommonProps {
  /** Title displayed at the top of the modal Frontstage */
  title: string;
  /** Indicates whether the modal Frontstage is open */
  isOpen?: boolean;
  /** Callback for navigating back from the modal Frontstage. This is normally connected to Redux. */
  navigateBack?: () => any;
  /** Callback for closing the modal Frontstage. This is normally connected to Redux. */
  closeModal: () => any;
  /** An optional React node displayed in the upper right of the modal Frontstage. */
  appBarRight?: React.ReactNode;
}

/**
 * ModalFrontstage React component
 * @public
 */
export class ModalFrontstage extends React.Component<ModalFrontstageProps> {
  private _backButtonTitle = UiFramework.translate("modalFrontstage.backButtonTitle");

  constructor(props: ModalFrontstageProps) {
    super(props);
  }

  private _onGoBack = () => {
    if (this.props.navigateBack)
      this.props.navigateBack();
    this.props.closeModal();
  };

  public override render() {
    const classNames = classnames(
      "uifw-modal-frontstage",
      this.props.isOpen && "uifw-modal-open",
      this.props.className,
    );

    return (
      <>
        <div className={classNames} style={this.props.style}>
          <div className="uifw-modal-app-bar">
            <BackButton className="nz-toolbar-button-app"
              onClick={this._onGoBack}
              icon={
                <i className="icon icon-progress-backward" />
              }
              title={this._backButtonTitle}
            />
            <span className="uicore-text-headline">{this.props.title}</span>
            {this.props.appBarRight &&
              <span className="uifw-modal-app-bar-right">{this.props.appBarRight}</span>
            }
          </div>
          <div className="uifw-modal-stage-content">
            {this.props.children}
          </div>
        </div>
        <div className="uifw-modal-frontstage-overlay" />
      </>
    );
  }
}
