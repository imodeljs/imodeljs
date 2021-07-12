/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module UiSettings
 */

import { UiSettingsResult, UiSettingsStatus, UiSettingsStorage } from "./UiSettingsStorage";

/**
 * Implementation of [[UiSettingsStorage]] using Window.localStorage.
 * @public
 */
export class LocalSettingsStorage implements UiSettingsStorage {

  constructor(public w: Window = window) { }

  public async getSetting(settingNamespace: string, settingName: string): Promise<UiSettingsResult> {
    const setting = this.w.localStorage.getItem(`${settingNamespace}.${settingName}`);
    if (setting !== null)
      return { status: UiSettingsStatus.Success, setting: JSON.parse(setting) };
    else
      return { status: UiSettingsStatus.NotFound };
  }

  public async saveSetting(settingNamespace: string, settingName: string, setting: any): Promise<UiSettingsResult> {
    this.w.localStorage.setItem(`${settingNamespace}.${settingName}`, JSON.stringify(setting));
    return { status: UiSettingsStatus.Success };
  }

  public async deleteSetting(settingNamespace: string, settingName: string): Promise<UiSettingsResult> {
    const name = `${settingNamespace}.${settingName}`;
    const setting = this.w.localStorage.getItem(name);
    if (setting === null)
      return { status: UiSettingsStatus.NotFound };
    this.w.localStorage.removeItem(name);
    return { status: UiSettingsStatus.Success };
  }
}

/** Alias for [[LocalSettingsStorage]]
 * @beta
 * @deprecated use [LocalSettingsStorage]($ui-core) instead
 */
export class LocalUiSettings extends LocalSettingsStorage {
  constructor(w: Window = window) { super (w);}
}

