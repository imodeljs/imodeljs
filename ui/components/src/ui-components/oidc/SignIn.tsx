/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OIDC
 */

import "./SignIn.scss";
import classnames from "classnames";
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { CommonProps } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";
import { Button } from "@itwin/itwinui-react";

// cspell:ignore signingin

/** Properties for the [[SignIn]] component
 * @public
 */
export interface SignInProps extends CommonProps {
  /** Handler for clicking the Sign-In button */
  onSignIn: () => void;
  /** Handler for clicking the Register link */
  onRegister?: () => void;
  /** Handler for clicking the Offline link */
  onOffline?: () => void;
  /** Disable the signin button after the sign-in process has started. If unspecified defaults to true.
   * @internal
   */
  disableSignInOnClick?: boolean;
  /** Show a message when signing in
   * @internal
   */
  signingInMessage?: string;
}

/** @internal */
interface SignInState {
  isSigningIn: boolean;
  prompt: string;
  signInButton: string;
  profilePrompt: string;
  registerAnchor: string;
  offlineButton: string;
}

/**
 * SignIn React presentational component
 * @public
 */
export class SignIn extends React.PureComponent<SignInProps, SignInState> {

  constructor(props: SignInProps) {
    super(props);

    this.state = {
      isSigningIn: false,
      prompt: UiComponents.translate("signIn.prompt"),
      signInButton: UiComponents.translate("signIn.signInButton"),
      profilePrompt: UiComponents.translate("signIn.profilePrompt"),
      registerAnchor: UiComponents.translate("signIn.register"),
      offlineButton: UiComponents.translate("signIn.offlineButton"),
    };
  }

  private _onSignInClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    this._onSigningIn();
  };

  private _onSigningIn = () => {
    this.setState({ isSigningIn: true });
    this.props.onSignIn();
  };

  private _handleKeyUp = (event: React.KeyboardEvent, onActivate?: () => void) => {
    const key = event.key;

    switch (key) {
      case SpecialKey.Enter:
      case SpecialKey.Space:
        onActivate && onActivate();
        break;
    }
  };

  public override render() {
    const disableSignInOnClick = this.props.disableSignInOnClick === undefined ? true : this.props.disableSignInOnClick; // disableSignInOnClick defaults to true!
    return (
      <div className={classnames("components-signin", this.props.className)} style={this.props.style}>
        <div className="components-signin-content">
          <span className="icon icon-user" />
          {(this.state.isSigningIn && this.props.signingInMessage !== undefined) ?
            <span className="components-signin-prompt">{this.props.signingInMessage}</span> :
            <span className="components-signin-prompt">{this.state.prompt}</span>
          }
          <Button className="components-signin-button" styleType="cta" disabled={this.state.isSigningIn && disableSignInOnClick}
            onClick={this._onSignInClick} onKeyUp={(e) => this._handleKeyUp(e, this._onSigningIn)}>
            {this.state.signInButton}
          </Button>
          {this.props.onRegister !== undefined &&
            <span className="components-signin-register">
              {this.state.profilePrompt}
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a onClick={this.props.onRegister} onKeyUp={(e) => this._handleKeyUp(e, this.props.onRegister)} role="link" tabIndex={0}>
                {this.state.registerAnchor}
              </a>
            </span>
          }
          {this.props.onOffline !== undefined &&
            // eslint-disable-next-line jsx-a11y/anchor-is-valid
            <a className="components-signin-offline" onClick={this.props.onOffline} onKeyUp={(e) => this._handleKeyUp(e, this.props.onOffline)} role="link" tabIndex={0}>
              {this.state.offlineButton}
            </a>
          }
        </div>
      </div>
    );
  }
}
