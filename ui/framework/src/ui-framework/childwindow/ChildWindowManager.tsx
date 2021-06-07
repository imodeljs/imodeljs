/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module ChildWindowManager
 */

import "./ChildWindowManager.scss";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { copyStyles } from "./CopyStyles";
import { Provider } from "react-redux";
import { UiFramework } from "../UiFramework";
import { StateManager } from "../redux/StateManager";
import { UiSettingsProvider } from "../uisettings/useUiSettings";
import { PopupRenderer } from "../popup/PopupManager";
import { ModelessDialogRenderer } from "../dialog/ModelessDialogManager";
import { ModalDialogRenderer } from "../dialog/ModalDialogManager";
import { CursorPopupMenu, FrameworkVersion } from "../../ui-framework";
import { FrontstageManager } from "../frontstage/FrontstageManager";
const childHtml = `<!DOCTYPE html>
<html>

<head>
  <meta charset="utf-8" />
  <style>
    html,
    body {
      height: 100%;
      width: 100%;
      margin: 0;
      overflow: hidden;
    }

    #root {
      height: 100%;
    }
  </style>
</head>
<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
</body>
</html>`;

/** @beta */
export interface OpenChildWindowInfo {
  childWindowId: string;
  window: Window;
  parentWindow: Window;
}

/** @beta */
export interface ChildWindowLocationProps {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Supports opening a child browser window from the main application window. The child window is managed by the main application
 * and is running in the same security context. The application must deliver the html file iTwinPopup.html along side its index.html.
 * See also: [Child Window Manager]($docs/learning/ui/framework/ChildWindows.md)
 * @beta */
export class ChildWindowManager {
  private _openChildWindows: OpenChildWindowInfo[] = [];

  public get openChildWindows() {
    return this._openChildWindows;
  }

  public findChildWindow(childWindowId: string | undefined): OpenChildWindowInfo | undefined {
    if (undefined === childWindowId)
      return undefined;

    return this.openChildWindows.find((openWindow) => openWindow.childWindowId === childWindowId);
  }

  public findChildWindowId(contentWindow: Window | undefined | null): string | undefined {
    if (!contentWindow)
      return undefined;

    const childWindow = this.openChildWindows.find((openWindow) => openWindow.window === contentWindow);
    return childWindow?.childWindowId;
  }

  // istanbul ignore next
  private renderChildWindowContents(childWindow: Window, childWindowId: string, content: React.ReactNode) {
    const reactConnectionDiv = childWindow.document.getElementById("root");
    if (reactConnectionDiv) {
      // set openChildWindows now so components can use it when they mount
      this._openChildWindows.push({
        childWindowId,
        window: childWindow,
        parentWindow: window,
      });

      setTimeout(() => {
        copyStyles(childWindow.document);
        childWindow.document.documentElement.setAttribute("data-theme", UiFramework.getColorTheme());
        setImmediate(() => {
          ReactDOM.render(
            <Provider store={StateManager.store} >
              <UiSettingsProvider settingsStorage={UiFramework.getUiSettingsStorage()}>
                <FrameworkVersion version="2">
                  <div className="uifw-child-window-container-host">
                    <PopupRenderer />
                    <ModalDialogRenderer />
                    <ModelessDialogRenderer />
                    <CursorPopupMenu />
                    <div className="uifw-child-window-container nz-widget-widget">
                      {content}
                    </div>
                  </div>
                </FrameworkVersion>
              </UiSettingsProvider>
            </Provider>,
            reactConnectionDiv
          );
        });
      });

      childWindow.onbeforeunload = () => {
        const frontStageDef = FrontstageManager.activeFrontstageDef;
        if (frontStageDef) {
          void frontStageDef.saveChildWindowSizeAndPosition(childWindowId, childWindow).then(() => {
            this.closeChildWindow(childWindowId, false);
          });
        }
      };
    }
  }

  /** Close all child/pop-out windows. This typically is called when the frontstage is changed. */
  public closeAllChildWindows() {
    // istanbul ignore next
    this.openChildWindows.forEach((openChildWindow) => openChildWindow.window.close());
    this._openChildWindows = [];
  }

  public closeChildWindow = (childWindowId: string, processWindowClose = true) => {
    const windowIndex = this.openChildWindows.findIndex((openWindow) => openWindow.childWindowId === childWindowId);
    if (-1 === windowIndex)
      return false;
    const childWindow = this.openChildWindows[windowIndex];
    this.openChildWindows.splice(windowIndex, 1);
    if (processWindowClose) {
      childWindow.window.close();
    } else {
      // call the following to convert popout to docked widget
      const frontStageDef = FrontstageManager.activeFrontstageDef;
      frontStageDef && frontStageDef.dockPopoutWidgetContainer(childWindowId);
    }
    return true;
  };

  // istanbul ignore next
  private adjustWidowLocation(location: ChildWindowLocationProps, center?: boolean): ChildWindowLocationProps {
    const outLocation = { ...location };
    if (0 === location.top && 0 === location.left) {
      center = center ?? true;

      // Prepare position of the new window to be centered against the 'parent' window.
      if (center) {
        outLocation.left =
          window.top.outerWidth / 2 + window.top.screenX - location.width / 2;
        outLocation.top =
          window.top.outerHeight / 2 + window.top.screenY - location.height / 2;
      } else {
        if (undefined !== window.screenLeft && undefined !== window.screenTop) {
          outLocation.top = window.screenTop + location.top;
          outLocation.left = window.screenLeft + location.left;
        }
      }
    }
    return outLocation;
  }

  // istanbul ignore next
  public openChildWindow(childWindowId: string, title: string, content: React.ReactNode, location: ChildWindowLocationProps, useDefaultPopoutUrl?: boolean) {
    // first check to see if content is already open in child window
    if (this.openChildWindows.findIndex((openWindow) => openWindow.childWindowId === childWindowId) >= 0) {
      return false;
    }

    location = this.adjustWidowLocation(location);
    const url = useDefaultPopoutUrl ? "/iTwinPopup.html" : "";
    const childWindow = window.open(url, "", `width=${location.width},height=${location.height},left=${location.left},top=${location.top},menubar=no,resizable=yes,scrollbars=no,status=no,location=no`);
    if (!childWindow)
      return false;
    if (0 === url.length) {
      childWindow.document.write(childHtml);
      this.renderChildWindowContents(childWindow, childWindowId, content);
    } else {
      childWindow.addEventListener("load", () => {
        childWindow.document.title = title;
        this.renderChildWindowContents(childWindow, childWindowId, content);
      }, false);
    }

    window.addEventListener("beforeunload", () => {
      const frontStageDef = FrontstageManager.activeFrontstageDef;
      if (frontStageDef) {
        this.closeChildWindow(childWindowId, true);
      }
    }, false);

    return true;
  }
}
