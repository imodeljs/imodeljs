/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { TestRunner, TestSetsProps } from "./TestRunner";
import { ClientRequestContext, ProcessDetector } from "@bentley/bentleyjs-core";
import { ElectronApp } from "@bentley/electron-manager/lib/ElectronFrontend";
import {
  BentleyCloudRpcManager, IModelReadRpcInterface, IModelTileRpcInterface, RpcConfiguration, SnapshotIModelRpcInterface,
} from "@bentley/imodeljs-common";
import { FrontendRequestContext, IModelApp, IModelAppOptions, NativeAppAuthorization } from "@bentley/imodeljs-frontend";
import { BrowserAuthorizationClient, BrowserAuthorizationClientConfiguration } from "@bentley/frontend-authorization-client";
import { I18NOptions } from "@bentley/imodeljs-i18n";
import { HyperModeling, SectionMarker, SectionMarkerHandler } from "@bentley/hypermodeling-frontend";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";

/** Prevents the hypermodeling markers from displaying in the viewport and obscuring the image. */
class MarkerHandler extends SectionMarkerHandler {
  public override isMarkerVisible(_marker: SectionMarker) {
    return false;
  }
}

export class DisplayPerfTestApp {
  public static async startup(iModelApp?: IModelAppOptions): Promise<void> {
    iModelApp = iModelApp ?? {};
    iModelApp.i18n = { urlTemplate: "locales/en/{{ns}}.json" } as I18NOptions;

    iModelApp.rpcInterfaces = [DisplayPerfRpcInterface, IModelTileRpcInterface, SnapshotIModelRpcInterface, IModelReadRpcInterface];
    if (ProcessDetector.isElectronAppFrontend)
      await ElectronApp.startup({ iModelApp });
    else
      await IModelApp.startup(iModelApp);

    await HyperModeling.initialize({ markerHandler: new MarkerHandler() });

    IModelApp.animationInterval = undefined;
  }
}

async function createOidcClient(requestContext: ClientRequestContext): Promise<NativeAppAuthorization | BrowserAuthorizationClient> {
  const scope = "openid email profile organization imodelhub context-registry-service:read-only reality-data:read product-settings-service projectwise-share urlps-third-party";

  if (ProcessDetector.isElectronAppFrontend) {
    const clientId = "imodeljs-electron-test";
    const redirectUri = "http://localhost:3000/signin-callback";
    const oidcConfiguration = { clientId, redirectUri, scope: `${scope} offline_access` };
    const desktopClient = new NativeAppAuthorization(oidcConfiguration);
    await desktopClient.initialize(requestContext);
    return desktopClient;
  } else {
    const clientId = "imodeljs-spa-test";
    const redirectUri = "http://localhost:3000/signin-callback";
    const oidcConfiguration: BrowserAuthorizationClientConfiguration = { clientId, redirectUri, scope: `${scope} imodeljs-router`, responseType: "code" };
    const browserClient = new BrowserAuthorizationClient(oidcConfiguration);
    return browserClient;
  }
}

// Wraps the signIn process
// In the case of use in web applications:
// - called the first time to start the signIn process - resolves to false
// - called the second time as the Authorization provider redirects to cause the application to refresh/reload - resolves to false
// - called the third time as the application redirects back to complete the authorization - finally resolves to true
// In the case of use in electron applications:
// - promise wraps around a registered call back and resolves to true when the sign in is complete
// @return Promise that resolves to true only after signIn is complete. Resolves to false until then.
async function signIn(): Promise<boolean> {
  const requestContext = new FrontendRequestContext();
  const oidcClient = await createOidcClient(requestContext);

  IModelApp.authorizationClient = oidcClient;
  if (oidcClient.isAuthorized)
    return true;

  const retPromise = new Promise<boolean>((resolve, _reject) => {
    oidcClient.onUserStateChanged.addListener((token) => {
      resolve(token !== undefined);
    });
  });

  await oidcClient.signIn(requestContext);
  return retPromise;
}

async function main() {
  try {
    const configStr = await DisplayPerfRpcInterface.getClient().getDefaultConfigs();
    const props = JSON.parse(configStr) as TestSetsProps;

    if (props.signIn)
      await signIn();

    const runner = new TestRunner(props);
    await runner.run();
  } catch (err) {
    alert(err.toString());
  }

  return IModelApp.shutdown();
}

window.onload = async () => {
  // Choose RpcConfiguration based on whether we are in electron or browser
  RpcConfiguration.developmentMode = true;
  RpcConfiguration.disableRoutingValidation = true;

  if (!ProcessDetector.isElectronAppFrontend && !ProcessDetector.isMobileAppFrontend) {
    const uriPrefix = "http://localhost:3001";
    BentleyCloudRpcManager.initializeClient({ info: { title: "DisplayPerformanceTestApp", version: "v1.0" }, uriPrefix }, [DisplayPerfRpcInterface, IModelTileRpcInterface, SnapshotIModelRpcInterface, IModelReadRpcInterface]);
  }

  await DisplayPerfTestApp.startup();
  await main();
};
