/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import * as path from "path";
import { UrlFileHandler } from "@bentley/backend-itwin-client";
import { Logger, LogLevel, ProcessDetector } from "@bentley/bentleyjs-core";
import { loadEnv } from "@bentley/config-loader";
import { ElectronHost, ElectronHostOptions } from "@bentley/electron-manager/lib/ElectronBackend";
import { IModelBankClient } from "@bentley/imodelhub-client";
import { IModelHost, IModelHostConfiguration, LocalhostIpcHost } from "@bentley/imodeljs-backend";
import {
  IModelReadRpcInterface, IModelTileRpcInterface, IModelWriteRpcInterface, RpcInterfaceDefinition, RpcManager,
  SnapshotIModelRpcInterface,
} from "@bentley/imodeljs-common";
import { AndroidHost, IOSHost, MobileHostOpts } from "@bentley/mobile-manager/lib/MobileBackend";
import { DtaConfiguration } from "../common/DtaConfiguration";
import { DtaRpcInterface } from "../common/DtaRpcInterface";
import { FakeTileCacheService } from "./FakeTileCacheService";
import { BasicManipulationCommand, EditCommandAdmin } from "@bentley/imodeljs-editor-backend";

class DisplayTestAppRpc extends DtaRpcInterface {

  public override async readExternalSavedViews(bimFileName: string): Promise<string> {
    if (ProcessDetector.isMobileAppBackend && process.env.DOCS) {
      const docPath = process.env.DOCS;
      bimFileName = path.join(docPath, bimFileName);
    }

    const esvFileName = this.createEsvFilename(bimFileName);
    if (!fs.existsSync(esvFileName))
      return "";

    const jsonStr = fs.readFileSync(esvFileName).toString();
    return jsonStr ?? "";
  }

  public override async writeExternalSavedViews(bimFileName: string, namedViews: string): Promise<void> {
    if (ProcessDetector.isMobileAppBackend && process.env.DOCS) {
      const docPath = process.env.DOCS;
      bimFileName = path.join(docPath, bimFileName);
    }

    const esvFileName = this.createEsvFilename(bimFileName);
    return this.writeExternalFile(esvFileName, namedViews);
  }

  public override async writeExternalFile(fileName: string, content: string): Promise<void> {
    const filePath = this.getFilePath(fileName);
    if (!fs.existsSync(filePath))
      this.createFilePath(filePath);

    if (fs.existsSync(fileName))
      fs.unlinkSync(fileName);

    fs.writeFileSync(fileName, content);
  }

  private createFilePath(filePath: string) {
    const files = filePath.split(/\/|\\/); // /\.[^/.]+$/ // /\/[^\/]+$/
    let curFile = "";
    for (const file of files) {
      if (file === "")
        break;

      curFile += `${file}\\`;
      if (!fs.existsSync(curFile))
        fs.mkdirSync(curFile);
    }
  }

  private getFilePath(fileName: string): string {
    const slashIndex = fileName.lastIndexOf("/");
    const backSlashIndex = fileName.lastIndexOf("\\");
    if (slashIndex > backSlashIndex)
      return fileName.substring(0, slashIndex);
    else
      return fileName.substring(0, backSlashIndex);
  }

  private createEsvFilename(fileName: string): string {
    const dotIndex = fileName.lastIndexOf(".");
    if (-1 !== dotIndex)
      return `${fileName.substring(0, dotIndex)}_ESV.json`;
    return `${fileName}.sv`;
  }
}

export const getRpcInterfaces = (): RpcInterfaceDefinition[] => {
  const rpcs: RpcInterfaceDefinition[] = [
    DtaRpcInterface,
    IModelReadRpcInterface,
    IModelTileRpcInterface,
    IModelWriteRpcInterface,
    SnapshotIModelRpcInterface,
  ];

  return rpcs;
};

const setupStandaloneConfiguration = () => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // (needed temporarily to use self-signed cert to communicate with iModelBank via https)
  loadEnv(path.join(__dirname, "..", "..", ".env"));

  const configuration: DtaConfiguration = {};
  if (ProcessDetector.isMobileAppBackend)
    return configuration;

  // Currently display-test-app ONLY supports opening files from local disk - i.e., "standalone" mode.
  // At some point we will reinstate ability to open from hub.
  configuration.standalone = true;
  configuration.iModelName = process.env.SVT_STANDALONE_FILENAME;
  configuration.standalonePath = process.env.SVT_STANDALONE_FILEPATH; // optional (browser-use only)
  configuration.viewName = process.env.SVT_STANDALONE_VIEWNAME; // optional

  if (undefined !== process.env.SVT_DISABLE_DIAGNOSTICS)
    configuration.enableDiagnostics = false;

  if (undefined !== process.env.SVT_STANDALONE_SIGNIN)
    configuration.signInForStandalone = true;

  if (undefined !== process.env.SVT_READ_WRITE)
    configuration.openReadWrite = true;

  if (undefined !== process.env.SVT_DISABLE_INSTANCING)
    configuration.disableInstancing = true;

  if (undefined !== process.env.SVT_NO_IMPROVED_ELISION)
    configuration.enableImprovedElision = false;

  if (undefined !== process.env.SVT_IGNORE_AREA_PATTERNS)
    configuration.ignoreAreaPatterns = true;

  if (undefined !== process.env.SVT_NO_EXTERNAL_TEXTURES)
    configuration.enableExternalTextures = false;

  if (undefined !== process.env.SVT_DISABLE_MAGNIFICATION)
    configuration.disableMagnification = true;

  if (undefined !== process.env.SVT_DEBUG_SHADERS)
    configuration.debugShaders = true;

  configuration.useProjectExtents = undefined === process.env.SVT_NO_USE_PROJECT_EXTENTS;

  const parseSeconds = (key: string) => {
    const env = process.env[key];
    if (!env)
      return undefined;

    const val = Number.parseInt(env, 10);
    return Number.isNaN(val) ? undefined : val;
  };

  configuration.tileTreeExpirationSeconds = parseSeconds("SVT_TILETREE_EXPIRATION_SECONDS");
  configuration.tileExpirationSeconds = parseSeconds("SVT_TILE_EXPIRATION_SECONDS");

  const maxToSkipVar = process.env.SVT_MAX_TILES_TO_SKIP;
  if (undefined !== maxToSkipVar) {
    const maxToSkip = Number.parseInt(maxToSkipVar, 10);
    if (!Number.isNaN(maxToSkip))
      configuration.maxTilesToSkip = maxToSkip;
  }

  const minSpatialTolEnv = process.env.SVT_MIN_SPATIAL_TOLERANCE;
  if (undefined !== minSpatialTolEnv) {
    const minSpatialTol = Number.parseFloat(minSpatialTolEnv);
    if (!Number.isNaN(minSpatialTol))
      configuration.minimumSpatialTolerance = minSpatialTol;
  }

  if (undefined !== process.env.SVT_DISABLE_LOG_Z)
    configuration.logarithmicZBuffer = false;

  if (undefined !== process.env.SVT_ENABLE_MAP_TEXTURE_FILTER)
    configuration.filterMapTextures = true;

  if (undefined !== process.env.SVT_DISABLE_MAP_DRAPE_TEXTURE_FILTER)
    configuration.filterMapDrapeTextures = false;

  if (undefined !== process.env.SVT_PRESERVE_SHADER_SOURCE_CODE)
    configuration.preserveShaderSourceCode = true;

  if (undefined !== process.env.SVT_DISABLE_DPI_AWARE_VIEWPORTS)
    configuration.dpiAwareViewports = false;

  const devicePixelRatioOverrideVar = process.env.SVT_DEVICE_PIXEL_RATIO_OVERRIDE;
  if (undefined !== devicePixelRatioOverrideVar) {
    const devicePixelRatioOverride = Number.parseFloat(devicePixelRatioOverrideVar);
    if (!Number.isNaN(devicePixelRatioOverride))
      configuration.devicePixelRatioOverride = devicePixelRatioOverride;
  }

  if (undefined !== process.env.SVT_DPI_LOD)
    configuration.dpiAwareLOD = true;

  const aaSamplesVar = process.env.SVT_AASAMPLES;
  if (undefined !== aaSamplesVar && "0" !== aaSamplesVar && "false" !== aaSamplesVar.toLowerCase()) {
    const aaSamples = Number.parseInt(aaSamplesVar, 10);
    if (!Number.isNaN(aaSamples))
      configuration.antialiasSamples = aaSamples;
  }

  const useWebGL2Var = process.env.SVT_USE_WEBGL2;
  if (undefined !== useWebGL2Var && ("0" === useWebGL2Var || "false" === useWebGL2Var.toLowerCase()))
    configuration.useWebGL2 = false;

  const extensions = process.env.SVT_DISABLED_EXTENSIONS;
  if (undefined !== extensions)
    configuration.disabledExtensions = extensions.split(";");

  configuration.useFakeCloudStorageTileCache = undefined !== process.env.SVT_FAKE_CLOUD_STORAGE;

  configuration.disableEdges = undefined !== process.env.SVT_DISABLE_EDGE_DISPLAY;
  configuration.alwaysLoadEdges = undefined !== process.env.SVT_ALWAYS_LOAD_EDGES;
  configuration.alwaysSubdivideIncompleteTiles = undefined !== process.env.SVT_SUBDIVIDE_INCOMPLETE;

  const configPathname = path.normalize(path.join(__dirname, "..", "..", "build", "configuration.json"));
  try { fs.writeFileSync(configPathname, JSON.stringify(configuration), "utf8"); } catch { }

  return configuration;
};

export const initializeDtaBackend = async (hostOpts?: ElectronHostOptions & MobileHostOpts) => {
  const dtaConfig = setupStandaloneConfiguration();

  const iModelHost = new IModelHostConfiguration();
  iModelHost.logTileLoadTimeThreshold = 3;
  iModelHost.logTileSizeThreshold = 500000;

  let logLevel = LogLevel.None;
  if (ProcessDetector.isMobileAppBackend) {
    // Does not seem DtaConfiguration is used anymore.
  } else {
    if (dtaConfig.customOrchestratorUri)
      iModelHost.imodelClient = new IModelBankClient(dtaConfig.customOrchestratorUri, new UrlFileHandler());

    if (dtaConfig.useFakeCloudStorageTileCache)
      iModelHost.tileCacheCredentials = { service: "external", account: "", accessKey: "" };

    const logLevelEnv = process.env.SVT_LOG_LEVEL as string;
    if (undefined !== logLevelEnv)
      logLevel = Logger.parseLogLevel(logLevelEnv);
  }

  const opts = {
    iModelHost,
    electronHost: hostOpts,
    nativeHost: {
      applicationName: "display-test-app",
    },
    mobileHost: hostOpts?.mobileHost,
  };

  /** register the implementation of our RPCs. */
  RpcManager.registerImpl(DtaRpcInterface, DisplayTestAppRpc);
  if (ProcessDetector.isElectronAppBackend) {
    await ElectronHost.startup(opts);
    EditCommandAdmin.register(BasicManipulationCommand);
  } else if (ProcessDetector.isIOSAppBackend) {
    await IOSHost.startup(opts);
  } else if (ProcessDetector.isAndroidAppBackend) {
    await AndroidHost.startup(opts);
  } else {
    await LocalhostIpcHost.startup(opts);
  }

  // Set up logging (by default, no logging is enabled)
  Logger.initializeToConsole();
  Logger.setLevelDefault(logLevel);
  Logger.setLevel("SVT", LogLevel.Trace);

  if (dtaConfig.useFakeCloudStorageTileCache)
    IModelHost.tileCacheService = new FakeTileCacheService(path.normalize(path.join(__dirname, "tiles")), "http://localhost:3001"); // puts the cache in "./lib/backend/tiles" and serves them from "http://localhost:3001/tiles"
};
