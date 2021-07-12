/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module UiSettings
 */

import { UiSettingsResult, UiSettingsStatus, UiSettingsStorage } from "./UiSettingsStorage";

/**
 * Implementation of [[UiSettings]] using Window.sessionStorage.
 * @public
 */
export class SessionSettingsStorage implements UiSettingsStorage {

  constructor(public w: Window = window) { }

  public async getSetting(settingNamespace: string, settingName: string): Promise<UiSettingsResult> {
    const setting = this.w.sessionStorage.getItem(`${settingNamespace}.${settingName}`);
    if (setting !== null)
      return { status: UiSettingsStatus.Success, setting: JSON.parse(setting) };
    else
      return { status: UiSettingsStatus.NotFound };
  }

  public async saveSetting(settingNamespace: string, settingName: string, setting: any): Promise<UiSettingsResult> {
    this.w.sessionStorage.setItem(`${settingNamespace}.${settingName}`, JSON.stringify(setting));
    return { status: UiSettingsStatus.Success };
  }

  public async deleteSetting(settingNamespace: string, settingName: string): Promise<UiSettingsResult> {
    const name = `${settingNamespace}.${settingName}`;
    const setting = this.w.sessionStorage.getItem(name);
    if (setting === null)
      return { status: UiSettingsStatus.NotFound };
    this.w.sessionStorage.removeItem(name);
    return { status: UiSettingsStatus.Success };
  }
}

/** Alias for [[SessionSettingsStorage]]
 * @beta
 * @deprecated use [SessionSettingsStorage]($ui-core) instead
 */
export class SessionUiSettings extends SessionSettingsStorage {
  constructor(w: Window = window) { super (w);}
}
