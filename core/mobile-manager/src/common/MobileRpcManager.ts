/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { ProcessDetector } from "@bentley/bentleyjs-core";
import { RpcConfiguration, RpcEndpoint, RpcInterfaceDefinition } from "@bentley/imodeljs-common";
import { MobileRpcProtocol } from "./MobileRpcProtocol";

/** RPC supported mobile platforms.
 * @beta
 */
export enum RpcMobilePlatform {
  Unknown,
  Android,
  iOS,
}

/** Holds configuration for the RpcInterfaces used by the application.
 * @beta
 */
export abstract class MobileRpcConfiguration extends RpcConfiguration {
  /** @internal */
  public static setup = {
    obtainPort: () => 0,
    checkPlatform: () => typeof (process) !== "undefined" && (process.platform as any) === "ios",
  };

  public abstract override protocol: MobileRpcProtocol;
  private static _args: any;
  private static getArgs(): any {
    if (typeof window !== "object" || typeof window.location !== "object" || typeof window.location.hash !== "string") {
      return Object.freeze({});
    }
    const queryArgs: any = {};
    try {
      const matches = window.location.hash.match(/([^#=&]+)(=([^&]*))?/g);
      if (matches) {
        for (const comp of matches) {
          const array = comp.split("=");
          if (array.length === 2) {
            const key = decodeURIComponent(array[0]);
            const val = decodeURIComponent(array[1]);
            queryArgs[key] = val;
          }
        }
      }
    } catch { }
    return Object.freeze(queryArgs);
  }
  private static getMobilePlatform(): RpcMobilePlatform {
    if (!MobileRpcConfiguration.args.platform)
      return RpcMobilePlatform.Unknown;

    const win: any = window;
    if (/android/i.test(MobileRpcConfiguration.args.platform)) {
      return RpcMobilePlatform.Android;
    }

    if (/iOS|iPadOS/i.test(MobileRpcConfiguration.args.platform) && !win.MSStream) {
      return RpcMobilePlatform.iOS;
    }

    return RpcMobilePlatform.Unknown;
  }
  /** Read the mobile rpc args */
  public static get args(): any {
    if (!this._args) {
      this._args = MobileRpcConfiguration.getArgs();
    }
    return this._args;
  }

  /** Return type of mobile platform using browser userAgent */
  public static get platform(): RpcMobilePlatform { return MobileRpcConfiguration.getMobilePlatform(); }

  /** Check if backend running on mobile
   * @deprecated use ProcessDetector.isMobileAppBackend
   */
  public static get isMobileBackend() { return ProcessDetector.isMobileAppBackend; }

  /** Check if frontend running on mobile
   * @deprecated use ProcessDetector.isMobileAppFrontend
   */
  public static get isMobileFrontend() { return ProcessDetector.isMobileAppFrontend; }

  /** Check if frontend running on ios
   * @deprecated use ProcessDetector.isIOSAppFrontend
   */
  public static get isIOSFrontend() { return ProcessDetector.isIOSAppFrontend; }
}

/** Coordinates usage of RPC interfaces for an Mobile-based application.
 * @beta
 */
export class MobileRpcManager {
  /** @internal */
  public static async ready() {
    return new Promise<void>(async (resolve) => {
      while (!(global as any).__iTwinJsRpcReady) {
        await new Promise((r) => setTimeout(r));
      }

      resolve();
    });
  }

  private static performInitialization(interfaces: RpcInterfaceDefinition[], endPoint: RpcEndpoint): MobileRpcConfiguration {
    const config = class extends MobileRpcConfiguration {
      public interfaces = () => interfaces;
      public protocol: MobileRpcProtocol = new MobileRpcProtocol(this, endPoint);
    };

    for (const def of interfaces) {
      RpcConfiguration.assign(def, () => config);
    }

    const instance = RpcConfiguration.obtain(config);
    RpcConfiguration.initializeInterfaces(instance);

    return instance;
  }

  /** Initializes MobileRpcManager for the frontend of an application. */
  public static initializeClient(interfaces: RpcInterfaceDefinition[]): MobileRpcConfiguration {
    return MobileRpcManager.performInitialization(interfaces, RpcEndpoint.Frontend);
  }
  /** Initializes MobileRpcManager for the backend of an application. */
  public static initializeImpl(interfaces: RpcInterfaceDefinition[]): MobileRpcConfiguration {
    return MobileRpcManager.performInitialization(interfaces, RpcEndpoint.Backend);
  }
}

