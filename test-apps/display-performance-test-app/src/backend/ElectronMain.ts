/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "@bentley/bentleyjs-core";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";
import { initializeBackend } from "./backend";
import { ElectronHost } from "@bentley/electron-manager/lib/ElectronBackend";

const dptaElectronMain = async () => {

  // Start the backend
  await initializeBackend();

  let debug = true;
  process.argv.forEach((arg) => {
    if (arg.split(".").pop() === "json")
      DisplayPerfRpcInterface.jsonFilePath = arg;
    else if (arg === "no_debug")
      debug = false;
  });

  const autoOpenDevTools = (undefined === process.env.SVT_NO_DEV_TOOLS) && debug;
  const maximizeWindow = (undefined === process.env.SVT_NO_MAXIMIZE_WINDOW); // Make max window the default

  await ElectronHost.openMainWindow({ width: 1280, height: 800, show: !maximizeWindow });
  assert(ElectronHost.mainWindow !== undefined);

  if (maximizeWindow) {
    ElectronHost.mainWindow.maximize(); // maximize before showing to avoid resize event on startup
    ElectronHost.mainWindow.show();
  }
  if (autoOpenDevTools)
    ElectronHost.mainWindow.webContents.toggleDevTools();

  // Handle custom keyboard shortcuts
  ElectronHost.app.on("web-contents-created", (_e, wc) => {
    wc.on("before-input-event", (event, input) => {
      // CTRL + SHIFT + I  ==> Toggle DevTools
      if (input.key === "I" && input.control && !input.alt && !input.meta && input.shift) {
        if (ElectronHost.mainWindow)
          ElectronHost.mainWindow.webContents.toggleDevTools();

        event.preventDefault();
      }
    });
  });
};

// execute this immediately when we load
dptaElectronMain(); // eslint-disable-line @typescript-eslint/no-floating-promises
