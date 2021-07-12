/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OIDC
 */

import "./SignOut.scss";
import * as React from "react";
import { ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { isFrontendAuthorizationClient } from "@bentley/frontend-authorization-client";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { UserInfo } from "@bentley/itwin-client";
import { getUserColor } from "@bentley/ui-core";
import { Button } from "@itwin/itwinui-react";
import { FrontstageManager, ModalFrontstageInfo } from "../frontstage/FrontstageManager";
import { UiFramework } from "../UiFramework";

// cSpell:Ignore userprofile signoutprompt

/** Modal frontstage displaying sign out form.
 * @public
 */
export class SignOutModalFrontstage implements ModalFrontstageInfo {
  public title: string = UiFramework.translate("userProfile.userprofile");
  private _signOut = UiFramework.translate("userProfile.signout");
  private _signOutPrompt = UiFramework.translate("userProfile.signoutprompt");
  private _userInfo: UserInfo | undefined = undefined;

  constructor(userInfo?: UserInfo) {
    this._userInfo = userInfo;
  }

  private _getInitials(): string {
    let initials: string = "";

    // istanbul ignore else
    if (this._userInfo && this._userInfo.profile) {
      // istanbul ignore else
      if (this._userInfo.profile.firstName.length > 0)
        initials += this._userInfo.profile.firstName[0];
      // istanbul ignore else
      if (this._userInfo.profile.lastName.length > 0)
        initials += this._userInfo.profile.lastName[0];
    }

    return initials;
  }

  private _getFullName(): string {
    let name: string = "";
    // istanbul ignore else
    if (this._userInfo && this._userInfo.profile) {
      name = `${this._userInfo.profile.firstName} ${this._userInfo.profile.lastName}`;
    }

    return name;
  }

  private _onSignOut = async () => {
    FrontstageManager.closeModalFrontstage();

    const authorizationClient = IModelApp.authorizationClient;

    // istanbul ignore next
    if (isFrontendAuthorizationClient(authorizationClient))
      await authorizationClient.signOut(new ClientRequestContext());
    else
      Logger.logError(UiFramework.loggerCategory(this), "IModelApp.authorizationClient must be set for signOut");
  };

  public get content(): React.ReactNode {
    const initials = this._getInitials();
    const fullName = this._getFullName();
    const email = (this._userInfo && this._userInfo.email && typeof this._userInfo.email.id === "string") ? this._userInfo.email.id : /* istanbul ignore next */ "";
    const organization = (this._userInfo && this._userInfo.organization) ? this._userInfo.organization.name : /* istanbul ignore next */ "";
    const color = getUserColor(email);

    return (
      <div className="uifw-user-profile">
        <div className="profile-info">
          <span className="circle" style={{ backgroundColor: color }}>{initials}</span>
          <span>{fullName}</span>
          <span>{email}</span>
          <span>{organization}</span>
        </div>
        <div className="user-profile-separator" />
        <div className="signout">
          <span>{this._signOut}</span>
          <span>{this._signOutPrompt}</span>
          <Button size="large" styleType="cta" onClick={this._onSignOut}>{this._signOut}</Button>
        </div>
      </div>
    );
  }
}
