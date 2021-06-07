/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as child_process from "child_process";
import * as fs from "fs";
import * as fsextra from "fs-extra";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { Config, Logger } from "@bentley/bentleyjs-core";
import { FrontendAuthorizationClient } from "@bentley/frontend-authorization-client";
import { IModelBankClient, IModelBankFileSystemContextClient, IModelCloudEnvironment } from "@bentley/imodelhub-client";
import { IModelBankBasicAuthorizationClient } from "@bentley/imodelhub-client/lib/imodelbank/IModelBankBasicAuthorizationClient";
import { IModelBankDummyAuthorizationClient } from "@bentley/imodelhub-client/lib/imodelbank/IModelBankDummyAuthorizationClient";
import { UserInfo } from "@bentley/itwin-client";
import { workDir } from "./TestConstants";
import { createIModelBankFileHandler } from "./FileHandler";
import { TestIModelHubOidcAuthorizationClient } from "../TestIModelHubOidcAuthorizationClient";

// To run tests with imodel-bank integration:
// set NODE_EXTRA_CA_CERTS=D:\dev\imodeljs\full-stack-tests\rpc\local_dev_server.crt
// set imjs_test_imodel_bank to true to run tests with imodel-bank. Then either:
// set imjs_test_imodel_bank_url to specify the url to locally deployed orchestrator
// or set the following so the tests would deploy a local orchestrator themselves:
// set imjs_test_imodel_bank_run_orchestrator=%SrcRoot%\imodel-bank\local-orchestrator\lib\server.js
// set imjs_test_imodel_bank_logging_config=<somewhere>logging.config.json

let imodelBankClient: IModelBankClient;

const authorizationClientFactory = (authScheme: string, userInfo: UserInfo | undefined, userCredentials: any): FrontendAuthorizationClient => {
  switch (authScheme) {
    case "bearer":
      return new TestIModelHubOidcAuthorizationClient(userInfo, userCredentials);
    case "basic":
      return new IModelBankBasicAuthorizationClient(userInfo, userCredentials);
    default:
      return new IModelBankDummyAuthorizationClient(userInfo, userCredentials);
  }
};

export function setIModelBankClient(_client: IModelBankClient) {
  imodelBankClient = _client;
}

export function getIModelBankCloudEnv(): IModelCloudEnvironment {
  if (Config.App.has("imjs_test_imodel_bank_run_orchestrator"))
    return launchLocalOrchestrator();

  const orchestratorUrl: string = Config.App.get("imjs_test_imodel_bank_url", "");

  const authScheme: string = String(Config.App.get("imjs_test_imodel_bank_auth_scheme")).toLowerCase();
  const getAuthorizationClient = (userInfo: UserInfo | undefined, userCredentials: any): FrontendAuthorizationClient =>
    authorizationClientFactory(authScheme, userInfo, userCredentials);

  let bankClient: IModelBankClient;
  if (imodelBankClient)
    bankClient = imodelBankClient;
  else
    bankClient = new IModelBankClient(orchestratorUrl, createIModelBankFileHandler());

  const contextMgr = new IModelBankFileSystemContextClient(orchestratorUrl);

  const cloudEnv = {
    isIModelHub: false,
    contextMgr,
    imodelClient: bankClient,
    getAuthorizationClient,
    shutdown: async () => 0,
    startup: async () => { },
  };

  return cloudEnv;
}

function launchLocalOrchestrator(): IModelCloudEnvironment {

  const loggingCategory = "backend-itwin-client.IModelBankCloudEnv";

  const bankFsRoot = path.join(workDir, "bankfs");

  if (fs.existsSync(bankFsRoot))
    fsextra.removeSync(bankFsRoot);
  fsextra.mkdirpSync(bankFsRoot);

  const cfg = require(path.resolve(__dirname, "../assets/local_orchestrator.config.json")); // eslint-disable-line @typescript-eslint/no-var-requires
  cfg.baseUrl = "https://localhost";
  cfg.port = 4000;
  cfg.imodelfsRoot = bankFsRoot;
  cfg.certFile = path.resolve(__dirname, "../assets/local_dev_server.crt");
  cfg.keyFile = path.resolve(__dirname, "../assets/local_dev_server.key");

  const serverConfigFile = path.join(workDir, "local_orchestrator.config.json");
  fs.writeFileSync(serverConfigFile, JSON.stringify(cfg));
  const loggingConfigFile = Config.App.get("imjs_test_imodel_bank_logging_config", "");
  const backendRegistryFile = path.resolve(__dirname, "../assets/local_orchestrator.backend.registry.json");

  const runOrchestratorJs = Config.App.get("imjs_test_imodel_bank_run_orchestrator");

  const cmdargs = [
    runOrchestratorJs,
    serverConfigFile,
    loggingConfigFile,
    backendRegistryFile,
  ];

  const proc = child_process.spawn("node", cmdargs, { stdio: "inherit" });

  async function pingServer(url: string, maxConnectAttempts: number, pauseBeforePingMillis: number): Promise<void> {
    let attempt = 1;
    do {
      try {
        await pingServerOnce(url, attempt * pauseBeforePingMillis);
      } catch (err) {
        if (err.errno === "ECONNREFUSED") {
          continue;
        } else {
          throw err;
        }
      }
      return;
    } while (++attempt < maxConnectAttempts);
    throw new Error("ECONNREFUSED");
  }

  async function pingServerOnce(url: string, pauseMillis: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        https.get(`${url}/sv1.1/Plugins`, (response: http.IncomingMessage) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Unexpected response. Not an iModelBank or iModelManager server? statusCode=${response.statusCode}`));
          } else {
            response.setEncoding("utf8"); // nodejs docs say "the callback must take care to consume the response data" (https://nodejs.org/api/http.html#http_http_get_options_callback)
            response.on("data", () => { });
            response.on("end", () => { resolve(); });
          }
        }).on("error", (err: Error) => {  // connection error
          reject(err);
        });
      }, pauseMillis);
    });
  }

  async function doStartup(): Promise<void> {
    const url = `${cfg.baseUrl}:${cfg.port}`;
    try {
      await pingServer(url, 10, 1000);
    } catch (err) {
      Logger.logError(loggingCategory, `Error pinging ${url}, server did not startup in time.`);
      throw err;
    }
  }

  async function doShutdown(): Promise<number> {
    return new Promise((resolve, reject) => {
      proc.on("exit", (code: number | null, _signal: string | null) => {
        resolve(code ? code : 0);
      });
      proc.on("error", (err: Error) => {
        reject(err);
      });
      proc.kill();
    });
  }

  const authScheme: string = String(Config.App.get("imjs_test_imodel_bank_auth_scheme")).toLowerCase();
  const getAuthorizationClient = (userInfo: UserInfo | undefined, userCredentials: any): FrontendAuthorizationClient =>
    authorizationClientFactory(authScheme, userInfo, userCredentials);

  const orchestratorUrl = `${cfg.baseUrl}:${cfg.port}`;
  const bankClient = new IModelBankClient(orchestratorUrl, createIModelBankFileHandler());
  const contextMgr = new IModelBankFileSystemContextClient(orchestratorUrl);

  const cloudEnv = {
    isIModelHub: false,
    contextMgr,
    imodelClient: bankClient,
    getAuthorizationClient,
    shutdown: doShutdown,
    startup: doStartup,
  };

  return cloudEnv;
}
