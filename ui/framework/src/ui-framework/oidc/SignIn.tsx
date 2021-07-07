/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OIDC
 */

import * as React from "react";
import { ClientRequestContext, ProcessDetector } from "@bentley/bentleyjs-core";
import { FrontendAuthorizationClient } from "@bentley/frontend-authorization-client";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { SignIn as SignInBase } from "@bentley/ui-components";
import { CommonProps } from "@bentley/ui-core";
import { UiFramework } from "../UiFramework";

/** Properties for the [[SignIn]] component
 * @public
 */
export interface SignInProps extends CommonProps {
  /** Handler called after sign-in has completed */
  onSignedIn?: () => void;
  /** Handler for the Register link */
  onRegister?: () => void;
  /** Handler for the Offline link */
  onOffline?: () => void;

  /** @internal */
  onStartSignIn?: () => void;
}

/**
 * SignIn React component.
 * `IModelApp.authorizationClient.signIn` is called when the "Sign In" button is pressed,
 * then `props.onSignedIn` is called after sign-in has completed.
 * @public
 */
export class SignIn extends React.PureComponent<SignInProps> {
  /** Oidc Frontend Client object */
  private _oidcClient: FrontendAuthorizationClient | undefined;

  constructor(props: SignInProps) {
    super(props);
  }

  public componentDidMount() {
    this._oidcClient = IModelApp.authorizationClient;

    // istanbul ignore if
    if (this._oidcClient?.isAuthorized)
      this._oidcClient.onUserStateChanged.addListener(this._onUserStateChanged);
  }

  // istanbul ignore next
  private _onUserStateChanged() {
    // istanbul ignore next
    if (this._oidcClient?.isAuthorized && this.props.onSignedIn)
      this.props.onSignedIn();
  }

  public componentWillUnmount() {
    this._oidcClient?.onUserStateChanged.removeListener(this._onUserStateChanged);
  }

  private _onStartSignin = async () => {
    this._oidcClient?.signIn(new ClientRequestContext()); // eslint-disable-line @typescript-eslint/no-floating-promises

    // istanbul ignore else
    if (this.props.onStartSignIn)
      this.props.onStartSignIn();
  };

  public render() {

    /*
     * Note: In the case of electron, the signin happens in a disconnected web browser. We therefore show
     * a message to direc the user to the browser. Also, since we cannot capture the errors in the browser,
     * to clear the state of the signin UI, we instead allow signin button to be clicked multiple times.
     * See https://authguidance.com/2018/01/11/desktop-apps-overview/ for the pattern
     */
    let disableSignInOnClick = true;
    let signingInMessage: string | undefined;
    // istanbul ignore next
    if (ProcessDetector.isElectronAppFrontend) {
      disableSignInOnClick = false;
      const signingInMessageStringId = `UiFramework:signIn.signingInMessage`;
      signingInMessage = UiFramework.i18n.translate(signingInMessageStringId);
    }

    return <SignInBase className={this.props.className} style={this.props.style}
      onSignIn={this._onStartSignin}
      onRegister={this.props.onRegister}
      onOffline={this.props.onOffline}
      disableSignInOnClick={disableSignInOnClick}
      signingInMessage={signingInMessage}
    />;
  }
}
