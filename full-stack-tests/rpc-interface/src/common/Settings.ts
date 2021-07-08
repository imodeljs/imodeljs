/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BackendAuthorizationClientConfiguration } from "@bentley/backend-itwin-client";
import { LogLevel } from "@bentley/bentleyjs-core";
import { DevToolsRpcInterface, IModelReadRpcInterface, IModelTileRpcInterface, IModelWriteRpcInterface } from "@bentley/imodeljs-common";
import { TestUserCredentials } from "@bentley/oidc-signin-tool";
import { PresentationRpcInterface } from "@bentley/presentation-common";

/* eslint-disable @typescript-eslint/indent */

export interface Backend {
  version: string;
  location: string;
  name: string;
  path: string;
}

/**
 * Holds the information required to u identify an iModel
 */
export interface IModelData {
  useName: boolean; // Defines whether or not to use the name of the iModel
  id?: string; // The iModel Id - This is not required
  name?: string; // The name is not required to actually get the iModel, only the id.
  useProjectName: boolean;
  projectId?: string;
  projectName?: string;
  changeSetId?: string;
}

export function getRpcInterfaces(settings: Settings) {
  const rpcInterfaces = [];
  if (settings.runDevToolsRpcTests)
    rpcInterfaces.push(DevToolsRpcInterface);
  if (settings.runPresentationRpcTests)
    rpcInterfaces.push(PresentationRpcInterface);
  if (settings.runiModelReadRpcTests)
    rpcInterfaces.push(IModelReadRpcInterface);
  if (settings.runiModelWriteRpcTests)
    rpcInterfaces.push(IModelWriteRpcInterface); // eslint-disable-line deprecation/deprecation
  if (settings.runiModelTileRpcTests)
    rpcInterfaces.push(IModelTileRpcInterface);

  return rpcInterfaces;
}

function checkEnabled(envVariable: string | undefined): boolean {
  if (undefined === envVariable)
    return false;

  const regex = /true/i;
  return regex.test(envVariable);
}

export class Settings {
  private _backend: Backend = {} as Backend;
  public env: number = 0;
  public oidcClientId!: string;
  public oidcScopes!: string;
  public oidcRedirect!: string;
  public imsUrl!: string;
  public gprid?: string;
  public logLevel?: number;
  public users: TestUserCredentials[] = [];
  public clientConfiguration?: BackendAuthorizationClientConfiguration;

  public iModels: IModelData[] = [];
  public get iModel(): IModelData { return this.iModels[0]; }
  public get writeIModel(): IModelData { return this.iModels[1]; }
  public get user(): TestUserCredentials { return this.users[0]; }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public get Backend(): Backend { return this._backend; }

  public get runiModelTileRpcTests(): boolean { return checkEnabled(process.env.RPC_IMODELTILE_ENABLE); }
  public get runPresentationRpcTests(): boolean { return checkEnabled(process.env.RPC_PRESENTATION_ENABLE); }
  public get runiModelReadRpcTests(): boolean { return checkEnabled(process.env.RPC_IMODELREAD_ENABLE); }
  public get runiModelWriteRpcTests(): boolean { return checkEnabled(process.env.RPC_IMODELWRITE_ENABLE); }
  public get runDevToolsRpcTests(): boolean { return checkEnabled(process.env.RPC_DEVTOOLS_ENABLE); }

  constructor(env: NodeJS.ProcessEnv) {
    const isFrontend = (typeof (process) === "undefined");
    if (!isFrontend && undefined === env.TF_BUILD) {
      const path = require("path"); // eslint-disable-line @typescript-eslint/no-var-requires
      const dotenv = require("dotenv"); // eslint-disable-line @typescript-eslint/no-var-requires
      const dotenvExpand = require("dotenv-expand"); // eslint-disable-line @typescript-eslint/no-var-requires
      // First check in process.cwd() for the config
      let result = dotenv.config();
      if (result.error) {
        const potential = path.resolve(process.cwd(), "..", "..", "..", "imodeljs-config", ".env");
        result = dotenv.config({ path: potential });
        if (result.error)
          throw result.error;
      }

      dotenvExpand(result);
    }

    if (isFrontend)
      globalThis.process = { browser: true, env } as any;

    // Loads the config out of the environment.
    this.load();
  }

  /** Loads the necessary variables from `process.env`.
   */
  private load() {

    // Parse environment
    if (undefined !== process.env.ENVIRONMENT)
      this.env = parseInt(process.env.ENVIRONMENT, 10);

    // Parse OIDC
    if (undefined === process.env.OIDC_CLIENT_ID)
      throw new Error("Missing the 'OIDC_CLIENT_ID' setting.");
    this.oidcClientId = process.env.OIDC_CLIENT_ID!;

    if (undefined === process.env.OIDC_SCOPES)
      throw new Error("Missing the 'OIDC_SCOPES' setting");
    this.oidcScopes = process.env.OIDC_SCOPES;

    this.oidcRedirect = (undefined === process.env.OIDC_REDIRECT) ? "http://localhost:5000" : process.env.OIDC_REDIRECT;

    // Parse GPRId
    if (undefined !== process.env.GPRID)
      this.gprid = process.env.GPRID;

    //  Parse the iModel variables
    if (!process.env.IMODEL_PROJECTID && !process.env.IMODEL_PROJECTNAME)
      throw new Error("Missing the 'IMODEL_PROJECTID' or 'IMODEL_PROJECTNAME' setting.");

    if (!process.env.IMODEL_IMODELID && !process.env.IMODEL_IMODELNAME)
      throw new Error("Missing the 'IMODEL_IMODELID' or 'IMODEL_IMODELNAME' setting.");

    // Note: This is kind of messy but we don't sign-in to resolve the Names into IDs until the TestContext.
    this.iModels.push({
      useName: !process.env.IMODEL_IMODELID,
      id: process.env.IMODEL_IMODELID,
      name: process.env.IMODEL_IMODELNAME,
      useProjectName: !process.env.IMODEL_PROJECTID,
      projectId: process.env.IMODEL_PROJECTID,
      projectName: process.env.IMODEL_PROJECTNAME,

      // Neither of the next 2 are needed but since they'll be undefined anyway, just always set it.
      changeSetId: process.env.IMODEL_CHANGESETID,
    });

    // If write rpc interface is defined expect a separate iModel to be used.
    if (this.runiModelWriteRpcTests) {
      if (!process.env.IMODEL_WRITE_PROJECTID && !process.env.IMODEL_WRITE_PROJECTNAME)
        throw new Error("Missing the 'IMODEL_WRITE_PROJECTID' or 'IMODEL_WRITE_PROJECTNAME' setting.");

      if (!process.env.IMODEL_WRITE_IMODELID && !process.env.IMODEL_WRITE_IMODELNAME)
        throw new Error("Missing the 'IMODEL_WRITE_IMODELID' or 'IMODEL_WRITE_IMODELNAME' setting.");

      this.iModels.push({
        useName: !process.env.IMODEL_WRITE_IMODELID,
        id: process.env.IMODEL_WRITE_IMODELID,
        name: process.env.IMODEL_WRITE_IMODELNAME,
        useProjectName: !process.env.IMODEL_WRITE_PROJECTID,
        projectId: process.env.IMODEL_WRITE_PROJECTID,
        projectName: process.env.IMODEL_WRITE_PROJECTNAME,
      });
    }

    // Parse logging level
    if (undefined !== process.env.LOG_LEVEL) {
      const level = parseInt(process.env.LOG_LEVEL, 10);
      if (!isNaN(level) && undefined !== LogLevel[level])
        this.logLevel = level;
    }

    // Get backend data
    if (undefined === process.env.BACKEND_LOCATION)
      throw new Error("Missing the 'BACKEND_LOCATION' setting.");
    this._backend.location = process.env.BACKEND_LOCATION;

    if (undefined === process.env.BACKEND_VERSION)
      throw new Error("Missing the 'BACKEND_VERSION' setting.");
    this._backend.version = process.env.BACKEND_VERSION;

    if (undefined === process.env.BACKEND_NAME)
      throw new Error("Missing the 'BACKEND_NAME' setting.");
    this._backend.name = process.env.BACKEND_NAME;

    // Get users
    this.users.push({
      email: process.env.USER_WITH_ACCESS_USERNAME || "",
      password: process.env.USER_WITH_ACCESS_PASSWORD || "",
    });

    // Get client configuration
    if (undefined !== process.env.CLIENT_WITH_ACCESS_ID && undefined !== process.env.CLIENT_WITH_ACCESS_SECRET && undefined !== process.env.CLIENT_WITH_ACCESS_SCOPES) {
      this.clientConfiguration = {
        clientId: process.env.CLIENT_WITH_ACCESS_ID,
        clientSecret: process.env.CLIENT_WITH_ACCESS_SECRET,
        scope: process.env.CLIENT_WITH_ACCESS_SCOPES,
      };
    }
  }

  public toString(): string {
    return `Configurations:
      backend location: ${this.Backend.location},
      backend name: ${this.Backend.name},
      backend version: ${this.Backend.version},
      oidc client id: ${this.oidcClientId},
      oidc scopes: ${this.oidcScopes},
      applicationId: ${this.gprid},
      log level: ${this.logLevel},
      testing iModelTileRpcTests: ${this.runiModelTileRpcTests},
      testing PresentationRpcTest: ${this.runPresentationRpcTests},
      testing iModelReadRpcTests: ${this.runiModelReadRpcTests},
      testing DevToolsRpcTests: ${this.runDevToolsRpcTests},
      testing iModelWriteRpcTests: ${this.runiModelWriteRpcTests}`;
  }
}
