/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./RpcImpl";
// Sets up certa to allow a method on the frontend to get an access token
import "@bentley/oidc-signin-tool/lib/certa/certaBackend";
import * as http from "http";
import * as path from "path";
import { Logger, LogLevel, ProcessDetector } from "@bentley/bentleyjs-core";
import { loadEnv } from "@bentley/config-loader";
import { ElectronHost } from "@bentley/electron-manager/lib/ElectronBackend";
import { IModelJsExpressServer } from "@bentley/express-server";
import { FileNameResolver, IModelHost, IModelHostConfiguration } from "@bentley/imodeljs-backend";
import { BentleyCloudRpcManager, RpcConfiguration } from "@bentley/imodeljs-common";
import { BasicManipulationCommand, EditCommandAdmin } from "@bentley/imodeljs-editor-backend";
import { rpcInterfaces } from "../common/RpcInterfaces";
import { CloudEnv } from "./cloudEnv";
import * as testCommands from "./TestEditCommands";

import serveHandler = require("serve-handler");
/* eslint-disable no-console */

async function init() {
  loadEnv(path.join(__dirname, "..", "..", ".env"));
  RpcConfiguration.developmentMode = true;

  // Bootstrap the cloud environment
  await CloudEnv.initialize();

  const iModelHost = new IModelHostConfiguration();
  iModelHost.imodelClient = CloudEnv.cloudEnv.imodelClient;
  iModelHost.concurrentQuery.concurrent = 2;
  iModelHost.concurrentQuery.pollInterval = 5;

  if (ProcessDetector.isElectronAppBackend) {
    await ElectronHost.startup({ electronHost: { rpcInterfaces }, iModelHost });
    EditCommandAdmin.registerModule(testCommands);
    EditCommandAdmin.register(BasicManipulationCommand);
  } else {
    const rpcConfig = BentleyCloudRpcManager.initializeImpl({ info: { title: "full-stack-test", version: "v1.0" } }, rpcInterfaces);

    // create a basic express web server
    const port = Number(process.env.CERTA_PORT || 3011) + 2000;
    const server = new IModelJsExpressServer(rpcConfig.protocol);
    await server.initialize(port);
    console.log(`Web backend for full-stack-tests listening on port ${port}`);

    await new Promise((resolve) => {
      http.createServer(async (request, response) => {
        return serveHandler(request, response, {
          cleanUrls: false,
          public: "lib",
          headers: [{ source: "*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }],
        });
      }).listen(Number(process.env.CERTA_PORT ?? 3011) + 4000, undefined, undefined, resolve);
    });
    await IModelHost.startup(iModelHost);
  }

  // Start the backend
  IModelHost.snapshotFileNameResolver = new BackendTestAssetResolver();

  Logger.initializeToConsole();
  Logger.setLevel("imodeljs-backend.IModelReadRpcImpl", LogLevel.Error);  // Change to trace to debug
  Logger.setLevel("imodeljs-backend.IModelDb", LogLevel.Error);  // Change to trace to debug
  Logger.setLevel("Performance", LogLevel.Error);  // Change to Info to capture
  Logger.setLevel("imodeljs-backend.ConcurrencyControl", LogLevel.Error);
}

/** A FileNameResolver for resolving test iModel files from core/backend */
class BackendTestAssetResolver extends FileNameResolver {
  /** Resolve a base file name to a full path file name in the core/backend/lib/test/assets/ directory. */
  public override tryResolveFileName(inFileName: string): string {
    if (path.isAbsolute(inFileName)) {
      return inFileName;
    }
    return path.join(__dirname, "../../../../core/backend/lib/test/assets/", inFileName);
  }
  /** Resolve a key (for testing FileNameResolver) */
  public override tryResolveKey(fileKey: string): string | undefined {
    switch (fileKey) {
      case "test-key": return this.tryResolveFileName("test.bim");
      case "test2-key": return this.tryResolveFileName("test2.bim");
      default: return undefined;
    }
  }
}

module.exports = init();
