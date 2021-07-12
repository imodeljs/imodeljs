/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Settings
 */

import "./Settings.scss";
import * as React from "react";
import { FrameworkAccuDraw, UiFramework } from "@bentley/ui-framework";
import { ToggleSwitch } from "@itwin/itwinui-react";

/** UiSettingsPage displaying the active settings. */
export class AccudrawSettingsPageComponent extends React.Component {
  private _accuDrawNotificationsTitle: string = UiFramework.i18n.translate("SampleApp:settingsStage.accuDrawNotificationsTitle");
  private _accuDrawNotificationsDescription: string = UiFramework.i18n.translate("SampleApp:settingsStage.accuDrawNotificationsDescription");

  private _onAccuDrawNotificationsChange = async () => {
    FrameworkAccuDraw.displayNotifications = !FrameworkAccuDraw.displayNotifications;
  };

  public override render(): React.ReactNode {
    return (
      <div className="uifw-settings">
        <SettingsItem title={this._accuDrawNotificationsTitle} description={this._accuDrawNotificationsDescription}
          settingUi={<ToggleSwitch checked={FrameworkAccuDraw.displayNotifications} onChange={this._onAccuDrawNotificationsChange} />}
        />
      </div>
    );
  }
}

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
