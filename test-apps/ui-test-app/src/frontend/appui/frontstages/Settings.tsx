/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Settings
 */

import "./Settings.scss";
import * as React from "react";
import { connect } from "react-redux";
import {  Toggle } from "@bentley/ui-core";
import {  FrameworkAccuDraw, UiFramework } from "@bentley/ui-framework";
import { SampleAppIModelApp } from "../..";

/** UiSettingsPage displaying the active settings. */
class UiSettingsPageComponent extends React.Component {
  private _accuDrawNotificationsTitle: string = UiFramework.i18n.translate("SampleApp:settingsStage.accuDrawNotificationsTitle");
  private _accuDrawNotificationsDescription: string = UiFramework.i18n.translate("SampleApp:settingsStage.accuDrawNotificationsDescription");

  private _onAccuDrawNotificationsChange = async () => {
    FrameworkAccuDraw.displayNotifications = !FrameworkAccuDraw.displayNotifications;

    await SampleAppIModelApp.appUiSettings.accuDrawNotifications.saveSetting(SampleAppIModelApp.uiSettings);
  };

  public render(): React.ReactNode {
    return (
      <div className="uifw-settings">
        <SettingsItem title={this._accuDrawNotificationsTitle} description={this._accuDrawNotificationsDescription}
          settingUi={ <Toggle isOn={FrameworkAccuDraw.displayNotifications} showCheckmark={false} onChange={this._onAccuDrawNotificationsChange} /> }
        />
      </div>
    );
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ConnectedUiSettingsPage = connect(mapStateToProps, mapDispatchToProps)(UiSettingsPageComponent);

interface SettingsItemProps {
  title: string;
  description: string;
  settingUi: React.ReactNode;
}

function SettingsItem(props: SettingsItemProps) {
  const { title, description, settingUi } = props;

  return (
    <div className="uifw-settings-item">
      <div className="panel left-panel">
        <span className="title">{title}</span>
        <span className="description">{description}</span>
      </div>
      <div className="panel right-panel">
        {settingUi}
      </div>
    </div>
  );
}
