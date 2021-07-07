/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module BrowserAuthorization
 */

import { UserManager, UserManagerSettings } from "oidc-client";
import { BrowserAuthorizationLogger } from "./BrowserAuthorizationLogger";

/**
 * Base class for [[BrowserAuthorizationClient]]
 * @public
 */
export abstract class BrowserAuthorizationBase<TConfig> {
  protected _userManager?: UserManager;

  protected _basicSettings: TConfig;
  protected _advancedSettings?: UserManagerSettings;

  protected constructor(configuration: TConfig) {
    this._basicSettings = configuration;
    BrowserAuthorizationLogger.initializeLogger();
  }

  /**
   * Allows for advanced options to be supplied to the underlying UserManager.
   * This function should be called directly after object construction.
   * Any settings supplied via this method will override the corresponding settings supplied via the constructor.
   * @throws if called after the internal UserManager has already been created.
   * @internal
   */
  public setAdvancedSettings(settings: UserManagerSettings): void {
    if (this._userManager) {
      throw new Error("Cannot supply advanced settings to BrowserAuthorizationClient after the underlying UserManager has already been created.");
    }

    this._advancedSettings = settings;
  }
}
