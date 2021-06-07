/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NativeApp
 */

import { join } from "path";
import { AuthStatus, BeEvent, ClientRequestContext, Config, GuidString, SessionProps } from "@bentley/bentleyjs-core";
import {
  BriefcaseProps, IModelError, InternetConnectivityStatus, LocalBriefcaseProps, NativeAppAuthorizationConfiguration, nativeAppChannel, NativeAppFunctions,
  NativeAppNotifications, nativeAppNotify, OverriddenBy, RequestNewBriefcaseProps, StorageValue,
} from "@bentley/imodeljs-common";
import { AccessToken, AccessTokenProps, ImsAuthorizationClient, RequestGlobalOptions } from "@bentley/itwin-client";
import { BriefcaseManager } from "./BriefcaseManager";
import { Downloads } from "./CheckpointManager";
import { IModelHost } from "./IModelHost";
import { IpcHandler, IpcHost, IpcHostOpts } from "./IpcHost";
import { NativeAppStorage } from "./NativeAppStorage";

/** @internal */
export abstract class NativeAppAuthorizationBackend extends ImsAuthorizationClient {
  protected _accessToken?: AccessToken;
  public abstract signIn(): Promise<void>;
  public abstract signOut(): Promise<void>;
  protected abstract refreshToken(): Promise<AccessToken>;
  public config?: NativeAppAuthorizationConfiguration;
  public expireSafety = 60 * 10; // refresh token 10 minutes before real expiration time
  public issuerUrl?: string;

  protected constructor(config?: NativeAppAuthorizationConfiguration) {
    super();
    this.config = config;
  }

  public get isAuthorized(): boolean {
    return undefined !== this._accessToken && !this._accessToken.isExpired(this.expireSafety);
  }

  public setAccessToken(token?: AccessToken) {
    if (token === this._accessToken)
      return;
    this._accessToken = token;
    NativeHost.onUserStateChanged.raiseEvent(token);
  }

  public async getAccessToken(): Promise<AccessToken> {
    if (!this.isAuthorized)
      this.setAccessToken(await this.refreshToken());
    return this._accessToken!;
  }

  public getClientRequestContext() { return ClientRequestContext.fromJSON(IModelHost.session); }

  public async initialize(config?: NativeAppAuthorizationConfiguration) {
    this.config = config ?? this.config;
    if (!this.config)
      throw new IModelError(AuthStatus.Error, "Must specify a valid configuration when initializing authorization");
    if (this.config.expiryBuffer)
      this.expireSafety = this.config.expiryBuffer;
    this.issuerUrl = this.config.issuerUrl ?? await this.getUrl(this.getClientRequestContext());
  }
}

/**
 * Implementation of NativeAppFunctions
 */
class NativeAppHandler extends IpcHandler implements NativeAppFunctions {
  public get channelName() { return nativeAppChannel; }

  public async setAccessTokenProps(token: AccessTokenProps) {
    NativeHost.authorization.setAccessToken(AccessToken.fromJson(token));
  }
  public async initializeAuth(props: SessionProps, config?: NativeAppAuthorizationConfiguration): Promise<number> {
    IModelHost.session.applicationId = props.applicationId;
    IModelHost.applicationVersion = props.applicationVersion;
    IModelHost.sessionId = props.sessionId;

    await NativeHost.authorization.initialize(config);
    return NativeHost.authorization.expireSafety;
  }
  public async signIn(): Promise<void> {
    return NativeHost.authorization.signIn();
  }
  public async signOut(): Promise<void> {
    return NativeHost.authorization.signOut();
  }
  public async getAccessTokenProps(): Promise<AccessTokenProps> {
    return (await NativeHost.authorization.getAccessToken()).toJSON();
  }
  public async checkInternetConnectivity(): Promise<InternetConnectivityStatus> {
    return NativeHost.checkInternetConnectivity();
  }
  public async overrideInternetConnectivity(by: OverriddenBy, status: InternetConnectivityStatus): Promise<void> {
    NativeHost.overrideInternetConnectivity(by, status);
  }
  public async getConfig(): Promise<any> {
    return Config.App.getContainer();
  }
  public async acquireNewBriefcaseId(iModelId: GuidString): Promise<number> {
    return BriefcaseManager.acquireNewBriefcaseId(await IModelHost.getAuthorizedContext(), iModelId);
  }
  public async getBriefcaseFileName(props: BriefcaseProps): Promise<string> {
    return BriefcaseManager.getFileName(props);
  }
  public async downloadBriefcase(request: RequestNewBriefcaseProps, reportProgress: boolean, progressInterval?: number): Promise<LocalBriefcaseProps> {
    const args = {
      ...request,
      onProgress: (_a: number, _b: number) => checkAbort(),
    };

    if (reportProgress) {
      const interval = progressInterval ?? 250; // by default, only send progress events every 250 milliseconds
      let nextTime = Date.now() + interval;
      args.onProgress = (loaded, total) => {
        const now = Date.now();
        if (loaded >= total || now >= nextTime) {
          nextTime = now + interval;
          IpcHost.send(`nativeApp.progress-${request.iModelId}`, { loaded, total });
        }
        return checkAbort();
      };
    }

    const downloadPromise = BriefcaseManager.downloadBriefcase(await IModelHost.getAuthorizedContext(), args);
    const checkAbort = () => {
      const job = Downloads.isInProgress(args.fileName!);
      return (job && (job.request as any).abort === 1) ? 1 : 0;
    };
    return downloadPromise;
  }

  public async requestCancelDownloadBriefcase(fileName: string): Promise<boolean> {
    const job = Downloads.isInProgress(fileName);
    if (job)
      (job.request as any).abort = 1;
    return job !== undefined;
  }

  public async deleteBriefcaseFiles(fileName: string): Promise<void> {
    await BriefcaseManager.deleteBriefcaseFiles(fileName, await IModelHost.getAuthorizedContext());
  }

  public async getCachedBriefcases(iModelId?: GuidString): Promise<LocalBriefcaseProps[]> {
    return BriefcaseManager.getCachedBriefcases(iModelId);
  }

  public async storageMgrOpen(storageId: string): Promise<string> {
    return NativeAppStorage.open(storageId).id;
  }

  public async storageMgrClose(storageId: string, deleteIt: boolean): Promise<void> {
    NativeAppStorage.find(storageId).close(deleteIt);
  }

  public async storageMgrNames(): Promise<string[]> {
    return NativeAppStorage.getStorageNames();
  }

  public async storageGet(storageId: string, key: string): Promise<StorageValue | undefined> {
    return NativeAppStorage.find(storageId).getData(key);
  }

  public async storageSet(storageId: string, key: string, value: StorageValue): Promise<void> {
    NativeAppStorage.find(storageId).setData(key, value);
  }

  public async storageRemove(storageId: string, key: string): Promise<void> {
    NativeAppStorage.find(storageId).removeData(key);
  }

  public async storageKeys(storageId: string): Promise<string[]> {
    return NativeAppStorage.find(storageId).getKeys();
  }

  public async storageRemoveAll(storageId: string): Promise<void> {
    NativeAppStorage.find(storageId).removeAll();
  }
}

/** Options for [[NativeHost.startup]]
 * @public */
export interface NativeHostOpts extends IpcHostOpts {
  nativeHost?: {
    /** Application name. Used, for example, to name the settings file. If not supplied, defaults to "iTwinApp". */
    applicationName?: string;
  };
}

/**
 * Backend for desktop/mobile native applications
 * @public
 */
export class NativeHost {
  private static _reachability?: InternetConnectivityStatus;
  private static _applicationName: string;
  private constructor() { } // no instances - static methods only

  /** @internal */
  public static get authorization() { return IModelHost.authorizationClient as NativeAppAuthorizationBackend; }

  /** Event called when the user's sign-in state changes - this may be due to calls to signIn(), signOut() or because the token was refreshed */
  public static readonly onUserStateChanged = new BeEvent<(token?: AccessToken) => void>();

  /** Event called when the internet connectivity changes, if known. */
  public static readonly onInternetConnectivityChanged = new BeEvent<(status: InternetConnectivityStatus) => void>();

  private static _appSettingsCacheDir?: string;

  /** Get the local cache folder for application settings */
  public static get appSettingsCacheDir(): string {
    if (this._appSettingsCacheDir === undefined)
      this._appSettingsCacheDir = join(IModelHost.cacheDir, "appSettings");
    return this._appSettingsCacheDir;
  }

  /** Send a notification to the NativeApp connected to this NativeHost. */
  public static notifyNativeFrontend<T extends keyof NativeAppNotifications>(methodName: T, ...args: Parameters<NativeAppNotifications[T]>) {
    return IpcHost.send(nativeAppNotify, methodName, ...args);
  }

  private static _isValid = false;
  public static get isValid(): boolean { return this._isValid; }
  public static get applicationName() { return this._applicationName; }
  /** Get the settings store for this NativeHost. */
  public static get settingsStore() {
    return NativeAppStorage.open(this.applicationName);
  }

  /**
   * Start the backend of a native app.
   * @note this method calls [[IpcHost.startup]] internally.
   */
  public static async startup(opt?: NativeHostOpts): Promise<void> {
    if (!this.isValid) {
      this._isValid = true;
      this.onInternetConnectivityChanged.addListener((status: InternetConnectivityStatus) =>
        NativeHost.notifyNativeFrontend("notifyInternetConnectivityChanged", status));
      this.onUserStateChanged.addListener((token?: AccessToken) =>
        NativeHost.notifyNativeFrontend("notifyUserStateChanged", token?.toJSON()));
      this._applicationName = opt?.nativeHost?.applicationName ?? "iTwinApp";
    }

    await IpcHost.startup(opt);
    if (IpcHost.isValid)  // for tests, we use NativeHost but don't have a frontend
      NativeAppHandler.register();
  }

  /** Shutdown native app backend. Also calls [[IpcHost.shutdown]] */
  public static async shutdown(): Promise<void> {
    this._isValid = false;
    this.onInternetConnectivityChanged.clear();
    this.onUserStateChanged.clear();
    await IpcHost.shutdown();
  }

  /** get current value of internet connectivity */
  public static checkInternetConnectivity(): InternetConnectivityStatus {
    return this._reachability ?? InternetConnectivityStatus.Online;
  }

  /**
   * Override internet connectivity state
   * @param _overridenBy who overrode the value.
   * @internal
   */
  public static overrideInternetConnectivity(_overridenBy: OverriddenBy, status: InternetConnectivityStatus): void {
    if (this._reachability !== status) {
      this._reachability = status;
      RequestGlobalOptions.online = this._reachability === InternetConnectivityStatus.Online;
      this.onInternetConnectivityChanged.raiseEvent(status);
    }
  }
}
