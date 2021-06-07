/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NativeApp
 */

import { BeEvent, Config, GuidString, Logger, SessionProps } from "@bentley/bentleyjs-core";
import {
  BriefcaseDownloader, BriefcaseProps, IModelVersion, InternetConnectivityStatus, IpcSocketFrontend, LocalBriefcaseProps,
  NativeAppAuthorizationConfiguration, nativeAppChannel, NativeAppFunctions, NativeAppNotifications, nativeAppNotify, OverriddenBy,
  RequestNewBriefcaseProps, StorageValue, SyncMode,
} from "@bentley/imodeljs-common";
import { AccessToken, AccessTokenProps, ProgressCallback, RequestGlobalOptions } from "@bentley/itwin-client";
import { FrontendLoggerCategory } from "./FrontendLoggerCategory";
import { IModelApp } from "./imodeljs-frontend";
import { AsyncMethodsOf, IpcApp, IpcAppOptions, NotificationHandler, PromiseReturnType } from "./IpcApp";
import { NativeAppLogger } from "./NativeAppLogger";

/** Properties for specifying the BriefcaseId for downloading. May either specify a BriefcaseId directly (preferable) or, for
 * backwards compatibility, a [SyncMode]($common). If [SyncMode.PullAndPush]($common) is supplied, a new briefcaseId will be acquired.
 * @public
 */
export type DownloadBriefcaseId =
  { syncMode?: SyncMode, briefcaseId?: never } |
  { briefcaseId: number, syncMode?: never };

/**
* Options to download a briefcase
* @public
*/
export type DownloadBriefcaseOptions = DownloadBriefcaseId & {
  /** the full path for the briefcase file */
  fileName?: string;
  /** interval for calling progress function, in milliseconds */
  progressInterval?: number;
};

/** NativeApp notifications from backend */
class NativeAppNotifyHandler extends NotificationHandler implements NativeAppNotifications {
  public get channelName() { return nativeAppNotify; }
  public notifyInternetConnectivityChanged(status: InternetConnectivityStatus) {
    Logger.logInfo(FrontendLoggerCategory.NativeApp, "Internet connectivity changed");
    NativeApp.onInternetConnectivityChanged.raiseEvent(status);
  }
  public notifyUserStateChanged(props?: AccessTokenProps) {
    IModelApp.authorizationClient?.onUserStateChanged.raiseEvent(props ? AccessToken.fromJson(props) : undefined);
  }
}

/**
 * Object to be set as `IModelApp.authorizationClient` for the frontend of NativeApps.
 * Since NativeApps use the backend for all authorization, this class sends signIn/signOut requests to the backend
 * and then listens for the `onUserStateChanged` event to cache the accessToken. The token is cached
 * here on the frontend because it is used for every RPC operation, even when we're running as a NativeApp.
 * We must therefore check for expiration and request refreshes as/when necessary.
 * @public
 */
export class NativeAppAuthorization {
  private _config?: NativeAppAuthorizationConfiguration;
  private _cachedToken?: AccessToken;
  private _refreshingToken = false;
  protected _expireSafety = 60 * 10; // seconds before real expiration time so token will be refreshed before it expires
  public readonly onUserStateChanged = new BeEvent<(token?: AccessToken) => void>();
  public get hasSignedIn() { return this._cachedToken !== undefined; }
  public get isAuthorized(): boolean { return this.hasSignedIn && !this._cachedToken!.isExpired(this._expireSafety); }

  /** ctor for NativeAppAuthorization
   * @param config if present, overrides backend supplied configuration. Generally not necessary, should be supplied
   * in [NativeHostOpts]($backend)
   */
  public constructor(config?: NativeAppAuthorizationConfiguration) {
    this._config = config;
    this.onUserStateChanged.addListener((token?: AccessToken) => {
      this._cachedToken = token;
    });
  }

  /** Used to initialize the the backend authorization. Must be awaited before any other methods are called */
  public async initialize(props: SessionProps): Promise<void> {
    this._expireSafety = await NativeApp.callNativeHost("initializeAuth", props, this._config);
  }

  /** Called to start the sign-in process. Subscribe to onUserStateChanged to be notified when sign-in completes */
  public async signIn(): Promise<void> {
    return NativeApp.callNativeHost("signIn");
  }

  /** Called to start the sign-out process. Subscribe to onUserStateChanged to be notified when sign-out completes */
  public async signOut(): Promise<void> {
    return NativeApp.callNativeHost("signOut");
  }

  /** Returns a promise that resolves to the AccessToken if signed in.
   * - The token is ensured to be valid *at least* for the buffer of time specified by the configuration.
   * - The token is refreshed if it's possible and necessary.
   * - This method must be called to refresh the token - the client does NOT automatically monitor for token expiry.
   * - Getting or refreshing the token will trigger the [[onUserStateChanged]] event.
   */
  public async getAccessToken(): Promise<AccessToken> {
    // if we have a valid token, return it. Otherwise call backend to refresh the token.
    if (!this.isAuthorized) {
      if (this._refreshingToken) {
        return Promise.reject(); // short-circuits any recursive use of this function
      }

      this._refreshingToken = true;
      this._cachedToken = AccessToken.fromJson(await NativeApp.callNativeHost("getAccessTokenProps"));
      this._refreshingToken = false;
    }

    return this._cachedToken!;
  }
}

/**
 * Options for [[NativeApp.startup]]
 * @public
 */
export interface NativeAppOpts extends IpcAppOptions {
  nativeApp?: {
    /** if present, [[IModelApp.authorizationClient]] will be set to an instance of NativeAppAuthorization and will be initialized.
     * @deprecated Initialize authorization for native applications at the backend
     */
    authConfig?: NativeAppAuthorizationConfiguration;
    /** if true, do not attempt to initialize AuthorizationClient
     * @deprecated Initialize authorization for native applications at the backend
     */
    noInitializeAuthClient?: boolean;
  };
}

/**
 * The frontend of a native application
 * @see [Native Applications]($docs/learning/NativeApps.md)
 * @public
 */
export class NativeApp {
  public static async callNativeHost<T extends AsyncMethodsOf<NativeAppFunctions>>(methodName: T, ...args: Parameters<NativeAppFunctions[T]>) {
    return IpcApp.callIpcChannel(nativeAppChannel, methodName, ...args) as PromiseReturnType<NativeAppFunctions[T]>;
  }

  private static _storages = new Map<string, Storage>();
  private static _onOnline = async () => {
    await NativeApp.setConnectivity(OverriddenBy.Browser, InternetConnectivityStatus.Online);
  };
  private static _onOffline = async () => {
    await NativeApp.setConnectivity(OverriddenBy.Browser, InternetConnectivityStatus.Offline);
  };
  private static async setConnectivity(by: OverriddenBy, status: InternetConnectivityStatus) {
    RequestGlobalOptions.online = (status === InternetConnectivityStatus.Online);
    await this.callNativeHost("overrideInternetConnectivity", by, status);
  }
  private static hookBrowserConnectivityEvents() {
    if (typeof window === "object" && window.ononline && window.onoffline) {
      window.addEventListener("online", this._onOnline);
      window.addEventListener("offline", this._onOffline);
    }
  }
  private static unhookBrowserConnectivityEvents() {
    if (typeof window === "object" && window.ononline && window.onoffline) {
      window.removeEventListener("online", this._onOnline);
      window.removeEventListener("offline", this._onOffline);
    }
  }
  /** event called when internet connectivity changes, if known */
  public static onInternetConnectivityChanged = new BeEvent<(status: InternetConnectivityStatus) => void>();

  /** determine whether the app currently has internet connectivity, if known */
  public static async checkInternetConnectivity(): Promise<InternetConnectivityStatus> {
    return this.callNativeHost("checkInternetConnectivity");
  }
  /** @internal */
  public static async overrideInternetConnectivity(status: InternetConnectivityStatus): Promise<void> {
    return this.callNativeHost("overrideInternetConnectivity", OverriddenBy.User, status);
  }
  private static _isValid = false;
  public static get isValid(): boolean { return this._isValid; }

  /**
   * This is called by either ElectronApp.startup or MobileApp.startup - it should not be called directly
   * @internal
   */
  public static async startup(ipc: IpcSocketFrontend, opts?: NativeAppOpts) {
    await IpcApp.startup(ipc, opts);
    if (this._isValid)
      return;
    this._isValid = true;

    NativeAppNotifyHandler.register(); // receives notifications from backend

    Config.App.merge(await this.callNativeHost("getConfig"));
    NativeApp.hookBrowserConnectivityEvents();

    // initialize current online state.
    if (window.navigator.onLine) {
      RequestGlobalOptions.online = window.navigator.onLine;
      await this.setConnectivity(OverriddenBy.Browser, window.navigator.onLine ? InternetConnectivityStatus.Online : InternetConnectivityStatus.Offline);
    }

    const auth = new NativeAppAuthorization(opts?.nativeApp?.authConfig); // eslint-disable-line deprecation/deprecation
    IModelApp.authorizationClient = auth;
    const connStatus = await NativeApp.checkInternetConnectivity();
    if (opts?.nativeApp?.authConfig && true !== opts?.nativeApp?.noInitializeAuthClient && connStatus === InternetConnectivityStatus.Online) { // eslint-disable-line deprecation/deprecation
      await auth.initialize({ applicationId: IModelApp.applicationId, applicationVersion: IModelApp.applicationVersion, sessionId: IModelApp.sessionId });
    }
  }

  /** @internal */
  public static async shutdown() {
    NativeApp.unhookBrowserConnectivityEvents();
    await NativeAppLogger.flush();
    await IpcApp.shutdown();
    this._isValid = false;
  }

  public static async requestDownloadBriefcase(contextId: string, iModelId: string, downloadOptions: DownloadBriefcaseOptions,
    asOf: IModelVersion = IModelVersion.latest(), progress?: ProgressCallback): Promise<BriefcaseDownloader> {

    let stopProgressEvents = () => { };
    if (progress !== undefined) {
      stopProgressEvents = IpcApp.addListener(`nativeApp.progress-${iModelId}`, (_evt: Event, data: { loaded: number, total: number }) => {
        progress(data);
      });
    }

    const briefcaseId = (undefined !== downloadOptions.briefcaseId) ? downloadOptions.briefcaseId :
      (downloadOptions.syncMode === SyncMode.PullOnly ? 0 : await this.callNativeHost("acquireNewBriefcaseId", iModelId));

    const fileName = downloadOptions.fileName ?? await this.getBriefcaseFileName({ briefcaseId, iModelId });
    const requestProps: RequestNewBriefcaseProps = { iModelId, briefcaseId, contextId, asOf: asOf.toJSON(), fileName };

    const doDownload = async (): Promise<void> => {
      try {
        await this.callNativeHost("downloadBriefcase", requestProps, progress !== undefined, downloadOptions.progressInterval);
      } finally {
        stopProgressEvents();
      }
    };

    const requestCancel = async (): Promise<boolean> => {
      const status = await this.callNativeHost("requestCancelDownloadBriefcase", fileName);
      if (status)
        stopProgressEvents();
      return status;
    };

    return { briefcaseId, fileName, downloadPromise: doDownload(), requestCancel };
  }

  /** Get the full path filename for a briefcase within the briefcase cache */
  public static async getBriefcaseFileName(props: BriefcaseProps): Promise<string> {
    return this.callNativeHost("getBriefcaseFileName", props);
  }

  /** Delete an existing briefcase
   * @param fileName the briefcase fileName
   */
  public static async deleteBriefcase(fileName: string): Promise<void> {
    await this.callNativeHost("deleteBriefcaseFiles", fileName);
  }

  /**  Get a list of all briefcase files held in the local briefcase cache directory */
  public static async getCachedBriefcases(iModelId?: GuidString): Promise<LocalBriefcaseProps[]> {
    return this.callNativeHost("getCachedBriefcases", iModelId);
  }

  /**
   * Open a [[Storage]]. Creates a new Storage with that name if it does not already exist.
   * @param name Should be a local filename without an extension.
   * @returns a Promise for the [[Storage]].
   */
  public static async openStorage(name: string): Promise<Storage> {
    if (this._storages.has(name))
      return this._storages.get(name)!;

    const storage = new Storage(await this.callNativeHost("storageMgrOpen", name));
    this._storages.set(storage.id, storage);
    return storage;
  }

  /**
   * Close a Storage and optionally delete it.
   * @param storage normally not call directly instead use Storage.close()
   * @param deleteStorage if true, delete the storage from disk after closing it.
   */
  public static async closeStorage(storage: Storage, deleteStorage: boolean = false): Promise<void> {
    if (!this._storages.has(storage.id))
      throw new Error(`Storage [Id=${storage.id}] not open`);

    await this.callNativeHost("storageMgrClose", storage.id, deleteStorage);
    this._storages.delete(storage.id);
  }

  /** Get the list of existing Storages on the local disk. */
  public static async getStorageNames(): Promise<string[]> {
    return NativeApp.callNativeHost("storageMgrNames");
  }
}

/**
 *  A local disk-based cache for key value pairs for NativeApps.
 * @note This should be used only for local caching, since its not guaranteed to exist permanently.
 * @public
 */
export class Storage {
  constructor(public readonly id: string) { }

  /** Get the value for a key */
  public async getData(key: string): Promise<StorageValue | undefined> {
    return NativeApp.callNativeHost("storageGet", this.id, key);
  }

  /** Set value for a key */
  public async setData(key: string, value: StorageValue): Promise<void> {
    return NativeApp.callNativeHost("storageSet", this.id, key, value);
  }

  /**
   * Return an array of all keys in this Storage.
   * @note This can be expensive, depending on the number of keys present.
   */
  public async getKeys(): Promise<string[]> {
    return NativeApp.callNativeHost("storageKeys", this.id);
  }

  /** Remove a key and its data. */
  public async removeData(key: string): Promise<void> {
    return NativeApp.callNativeHost("storageRemove", this.id, key);
  }

  /** Remove all keys and their data. */
  public async removeAll(): Promise<void> {
    return NativeApp.callNativeHost("storageRemoveAll", this.id);
  }
}
