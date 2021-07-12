/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import * as React from "react";
import { UserInfo } from "@bentley/itwin-client";
import { CommonProps, getUserColor } from "@bentley/ui-core";
import { UserProfile as NZ_UserProfile } from "@bentley/ui-ninezone";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { SignOutModalFrontstage } from "../oidc/SignOut";
import { SafeAreaContext } from "../safearea/SafeAreaContext";
import { UiFramework } from "../UiFramework";
import { Backstage } from "./Backstage";

// cSpell:ignore safearea

/** Properties for the [[Backstage]] React component.
 * @public
 */
export interface UserProfileBackstageItemProps extends CommonProps {
  userInfo: UserInfo;
  onOpenSignOut?: () => void;
}

/** User Profile Backstage React component.
 * @public
 */
export class UserProfileBackstageItem extends React.PureComponent<UserProfileBackstageItemProps> {

  public override render(): React.ReactNode | undefined {
    let content: React.ReactNode = null;

    const userInfo = this.props.userInfo;

    // istanbul ignore else
    if (userInfo) {
      let emailId = "";
      if (userInfo.email && userInfo.email.id) {
        if (typeof userInfo.email.id === "string")
          emailId = userInfo.email.id;
        else {
          const ids = userInfo.email.id as string[];
          if (ids.length)
            emailId = ids[0];
        }
      }
      const firstName = userInfo.profile ? userInfo.profile.firstName : "";
      const lastName = userInfo.profile ? userInfo.profile.lastName : "";

      content = (
        <SafeAreaContext.Consumer>
          {(safeAreaInsets) => (
            <NZ_UserProfile
              color={getUserColor(emailId)}
              initials={this._getInitials(firstName, lastName)}
              onClick={this._onOpenSignOut}
              safeAreaInsets={safeAreaInsets}
            >
              {this._getFullName(firstName, lastName)}
            </NZ_UserProfile>
          )}
        </SafeAreaContext.Consumer>

      );
    }

    return content;
  }

  private _onOpenSignOut = () => {
    Backstage.hide(); // eslint-disable-line deprecation/deprecation

    const manager = UiFramework.backstageManager;
    manager.close();

    FrontstageManager.openModalFrontstage(new SignOutModalFrontstage(this.props.userInfo));

    // istanbul ignore else
    if (this.props.onOpenSignOut)
      this.props.onOpenSignOut();
  };

  private _getInitials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`;
  }

  private _getFullName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`;
  }
}
