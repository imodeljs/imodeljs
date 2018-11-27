/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
"use strict";

const chalk = require("chalk");
const {
  spawn,
  handleInterrupts
} = require("./utils/simpleSpawn");

exports.command = "start-frontend";
exports.describe = chalk.bold("Runs the app's frontend in development mode. Should be run in parallel with start-backend.");
exports.builder = (yargs) =>
  yargs.options({
    "noWeb": {
      type: "boolean",
      describe: `Don't start a web browser.`
    },
    "useConfigLoader": {
      type: "boolean",
      describe: "Use auto locate imodel.js config folder",
    },
  });

let devServerInfo;

exports.handler = async (argv) => {
  if (argv.useConfigLoader) {
    process.env.IMODELJS_USE_CONFIG_LOADER = "yes";
  }
  // Do this as the first thing so that any code reading it knows the right env.
  require("./utils/initialize")("development");

  const paths = require("../config/paths");
  const config = require("../config/webpack.config.frontend.dev");
  const checkRequiredFiles = require("react-dev-utils/checkRequiredFiles");
  const openBrowser = require("react-dev-utils/openBrowser");
  const {
    choosePort
  } = require("react-dev-utils/WebpackDevServerUtils");
  const {
    startFrontendDevServer
  } = require("./utils/webpackWrappers");

  // Warn and crash if required files are missing
  if (!checkRequiredFiles([paths.appHtml, paths.appIndexJs])) {
    process.exit(1);
  }

  // Tools like Cloud9 rely on this.
  const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  // We attempt to use the default port but if it is busy, we offer the user to
  // run on a different port. `detect()` Promise resolves to the next free port.
  const port = await choosePort(HOST, DEFAULT_PORT);

  if (port == null) {
    // We have not found a port.
    process.exit(1);
  }

  // Now start the devServer...
  // This is a webpack watch that will also serve webpack assets generated by the compiler over a web sever.
  devServerInfo = await startFrontendDevServer(config, HOST, port); // Resolves on first successful build.

  // ..and open the browser:
  if (!argv.noWeb) {
    openBrowser(devServerInfo.urls.localUrlForBrowser);
  }
};

// This is required to correctly handle SIGINT on windows.
handleInterrupts(() => {
  if (devServerInfo && devServerInfo.instance)
    devServerInfo.instance.close();
});