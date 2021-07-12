/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ProcessDetector } from "@bentley/bentleyjs-core";
import { BrowserAuthorizationCallbackHandler } from "@bentley/frontend-authorization-client";
import { CloudStorageContainerUrl, CloudStorageTileCache, RpcConfiguration, TileContentIdentifier } from "@bentley/imodeljs-common";
import { IModelApp, IModelConnection, NativeApp, RenderDiagnostics, RenderSystem } from "@bentley/imodeljs-frontend";
import { AccessToken } from "@bentley/itwin-client";
import { WebGLExtensionName } from "@bentley/webgl-compatibility";
import { DtaConfiguration } from "../common/DtaConfiguration";
import { DisplayTestApp } from "./App";
import { openStandaloneIModel } from "./openStandaloneIModel";
import { Surface } from "./Surface";
import { setTitle } from "./Title";
import { showStatus } from "./Utils";
import { Dock } from "./Window";

const configuration: DtaConfiguration = {};

// Retrieves the configuration for starting SVT from configuration.json file located in the built public folder
async function retrieveConfiguration(): Promise<void> {
  return new Promise<void>((resolve, _reject) => {
    if (ProcessDetector.isMobileAppFrontend) {
      if (window) {
        const urlParams = new URLSearchParams(window.location.hash);
        urlParams.forEach((val, key) => {
          (configuration as any)[key] = val;
          Object.assign(configuration, { iModelName: urlParams.get("iModelName") });
        });
      }
      const newConfigurationInfo = JSON.parse(window.localStorage.getItem("imodeljs:env")!);
      Object.assign(configuration, newConfigurationInfo);
      resolve();
    } else {
      const request: XMLHttpRequest = new XMLHttpRequest();
      request.open("GET", "configuration.json");
      request.setRequestHeader("Cache-Control", "no-cache");
      request.onreadystatechange = ((_event: Event) => {
        if (request.readyState === XMLHttpRequest.DONE) {
          if (request.status === 200) {
            const newConfigurationInfo: any = JSON.parse(request.responseText);
            Object.assign(configuration, newConfigurationInfo);
            resolve();
          }
        }
      });
      request.send();
    }
  });
}

async function openIModel(filename: string, writable: boolean): Promise<IModelConnection> {
  configuration.standalone = true;
  const iModelConnection = await openStandaloneIModel(filename, writable);
  configuration.iModelName = iModelConnection.name;
  return iModelConnection;
}

// Wraps the signIn process
// @return Promise that resolves to true after signIn is complete
async function signIn(): Promise<boolean> {
  if (!NativeApp.isValid) // for browser, frontend handles redirect. For native apps, backend handles it
    await BrowserAuthorizationCallbackHandler.handleSigninCallback("http://localhost:3000/signin-callback");

  const auth = IModelApp.authorizationClient!;
  if (auth.isAuthorized)
    return true;

  return new Promise<boolean>((resolve, reject) => {
    auth.onUserStateChanged.addOnce((token?: AccessToken) =>
      resolve(token !== undefined));
    auth.signIn().catch((err) => reject(err));
  });
}

class FakeTileCache extends CloudStorageTileCache {
  public constructor() { super(); }

  protected override async requestResource(container: CloudStorageContainerUrl, id: TileContentIdentifier): Promise<Response> {
    const init: RequestInit = {
      headers: container.headers,
      method: "GET",
    };

    const url = `${container.url}/${this.formResourceName(id)}`;
    return fetch(url, init);
  }
}

// main entry point.
const dtaFrontendMain = async () => {
  RpcConfiguration.developmentMode = true; // needed for snapshots in web apps
  RpcConfiguration.disableRoutingValidation = true;

  // retrieve, set, and output the global configuration variable
  await retrieveConfiguration(); // (does a fetch)
  console.log("Configuration", JSON.stringify(configuration)); // eslint-disable-line no-console

  // Start the app. (This tries to fetch a number of localization json files from the origin.)
  const renderSystemOptions: RenderSystem.Options = {
    disabledExtensions: configuration.disabledExtensions as WebGLExtensionName[],
    preserveShaderSourceCode: true === configuration.preserveShaderSourceCode,
    logarithmicDepthBuffer: false !== configuration.logarithmicZBuffer,
    filterMapTextures: true === configuration.filterMapTextures,
    filterMapDrapeTextures: false !== configuration.filterMapDrapeTextures,
    dpiAwareViewports: false !== configuration.dpiAwareViewports,
    devicePixelRatioOverride: configuration.devicePixelRatioOverride,
    dpiAwareLOD: true === configuration.dpiAwareLOD,
    useWebGL2: false !== configuration.useWebGL2,
    planProjections: true,
    debugShaders: true === configuration.debugShaders,
    antialiasSamples: configuration.antialiasSamples,
  };

  const tileAdminProps = DisplayTestApp.tileAdminProps;
  if (configuration.disableInstancing)
    tileAdminProps.enableInstancing = false;

  if (false === configuration.enableImprovedElision)
    tileAdminProps.enableImprovedElision = false;

  if (configuration.ignoreAreaPatterns)
    tileAdminProps.ignoreAreaPatterns = true;

  if (false === configuration.useProjectExtents)
    tileAdminProps.useProjectExtents = false;

  if (configuration.disableMagnification)
    tileAdminProps.disableMagnification = true;

  tileAdminProps.enableExternalTextures = (configuration.enableExternalTextures !== false);
  tileAdminProps.tileTreeExpirationTime = configuration.tileTreeExpirationSeconds;
  tileAdminProps.tileExpirationTime = configuration.tileExpirationSeconds;
  tileAdminProps.maximumLevelsToSkip = configuration.maxTilesToSkip;
  tileAdminProps.alwaysRequestEdges = true === configuration.alwaysLoadEdges;
  tileAdminProps.minimumSpatialTolerance = configuration.minimumSpatialTolerance;
  tileAdminProps.alwaysSubdivideIncompleteTiles = true === configuration.alwaysSubdivideIncompleteTiles;

  if (configuration.useFakeCloudStorageTileCache)
    (CloudStorageTileCache as any)._instance = new FakeTileCache();

  await DisplayTestApp.startup(configuration, renderSystemOptions);
  if (false !== configuration.enableDiagnostics)
    IModelApp.renderSystem.enableDiagnostics(RenderDiagnostics.All);

  if (!configuration.standalone && !configuration.customOrchestratorUri) {
    alert("Standalone iModel required. Set SVT_STANDALONE_FILENAME in environment");

    return;
  }

  const uiReady = displayUi(); // Get the browser started loading our html page and the svgs that it references but DON'T WAIT

  try {
    if (!configuration.standalone || configuration.signInForStandalone) {
      while (!await signIn()) {
        alert("please sign in");
      }
    }

    let iModel: IModelConnection | undefined;
    const iModelName = configuration.iModelName;
    if (undefined !== iModelName) {
      const writable = configuration.openReadWrite ?? false;
      iModel = await openIModel(iModelName, writable);
      setTitle(iModel);
    }

    await uiReady; // Now wait for the HTML UI to finish loading.
    await initView(iModel);
  } catch (reason) {
    alert(reason);
    return;
  }
};

async function documentLoaded(): Promise<void> {
  const readyState = /^complete$/;
  if (readyState.test(document.readyState))
    return;

  return new Promise<void>((resolve) => {
    const listener = () => {
      if (readyState.test(document.readyState)) {
        document.removeEventListener("readystatechange", listener);
        resolve();
      }
    };

    document.addEventListener("readystatechange", listener);
    listener();
  });
}

async function initView(iModel: IModelConnection | undefined) {
  // open the specified view
  showStatus("opening View", configuration.viewName);

  const fileSelector = undefined !== configuration.standalonePath ? {
    directory: configuration.standalonePath,
    input: document.getElementById("browserFileSelector") as HTMLInputElement,
  } : undefined;

  DisplayTestApp.surface = new Surface(document.getElementById("app-surface")!, document.getElementById("toolBar")!, fileSelector, configuration.openReadWrite ?? false);

  // We need layout to complete so that the div we want to stick our viewport into has non-zero dimensions.
  // Consistently reproducible for some folks, not others...
  await documentLoaded();

  if (undefined !== iModel) {
    const viewer = await DisplayTestApp.surface.createViewer({
      iModel,
      defaultViewName: configuration.viewName,
      disableEdges: true === configuration.disableEdges,
    });

    viewer.dock(Dock.Full);
  }

  showStatus("View Ready");
  hideSpinner();
}

// Set up the HTML UI elements and wire them to our functions
async function displayUi() {
  return new Promise<void>(async (resolve) => { // eslint-disable-line @typescript-eslint/no-misused-promises
    showSpinner();
    resolve();
  });
}

function showSpinner() {
  const spinner = document.getElementById("spinner") as HTMLElement;
  spinner.style.display = "block";
}

function hideSpinner() {
  const spinner = document.getElementById("spinner");
  if (spinner)
    spinner.style.display = "none";
}

// Entry point - run the main function
dtaFrontendMain(); // eslint-disable-line @typescript-eslint/no-floating-promises
