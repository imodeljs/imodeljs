/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */

import { assert, BeEvent, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { IModelError, RpcRequest } from "@bentley/imodeljs-common";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { AuthorizedBackendRequestContext } from "./BackendRequestContext";
import { BriefcaseDb } from "./IModelDb";
import { IModelHost } from "./IModelHost";

const loggerCategory: string = BackendLoggerCategory.IModelDb;

/* eslint-disable deprecation/deprecation */

/** Monitors backend activity.
 * @beta
 * @deprecated auto-push is no longer supported and will be removed in 3.0.
 */
export interface AppActivityMonitor {
  /** Check if the app is idle, that is, not busy. */
  isIdle: boolean;
}

/** An implementation of AppActivityMonitor that should be suitable for most backends.
 * @beta
 * @deprecated auto-push is no longer supported and will be removed in 3.0.
 */
export class BackendActivityMonitor implements AppActivityMonitor {
  // intervalMillis - the length of time in seconds of inactivity that indicates that the backend is in a lull.
  constructor(public idleIntervalSeconds: number = 1) {
  }

  public get isIdle(): boolean {
    // If it has been over the specified amount of time since the last request was received,
    // then we *guess* the backend is in a lull and that the lull will continue for a similar amount of time.
    const millisSinceLastPost: number = Date.now() - RpcRequest.aggregateLoad.lastRequest;
    return (millisSinceLastPost >= (this.idleIntervalSeconds * 1000));

  }
}

/** Configuration for AutoPush.
 * @beta
 * @deprecated auto-push is no longer supported and will be removed in 3.0.
 */
export interface AutoPushParams {
  /** Desired delay in seconds between pushes. */
  pushIntervalSecondsMin: number;
  /** Maximum delay in seconds until the next push. */
  pushIntervalSecondsMax: number;
  /** Should AutoPush automatically schedule pushes? If not, the app must call [[AutoPush#scheduleNextPush]] */
  autoSchedule: boolean;
}

/** Identifies the current state of an AutoPush object.
 * @beta
 * @deprecated auto-push is no longer supported and will be removed in 3.0.
 */
export enum AutoPushState {
  NotRunning,
  Scheduled,
  Pushing,
}

/** Identifies an AutoPush event.
 * @beta
 * @deprecated auto-push is no longer supported and will be removed in 3.0.
 */
export enum AutoPushEventType {
  PushStarted,
  PushFinished,
  PushFailed,
  PushCancelled,
}

/** The signature of an AutoPush event handler.
 * @beta
 * @deprecated auto-push is no longer supported and will be removed in 3.0.
 */
export type AutoPushEventHandler = (etype: AutoPushEventType, autoPush: AutoPush) => void;

/** Use AutoPush to automatically push local changes to a specified IModel. To do this,
 * create an AutoPush object, specifying the BriefcaseDb that should be monitored.
 * The instance registers itself to react to events and timers. Often, backend will start
 * auto-pushing when a BriefcaseDb is opened for read-write.
 *
 * *Example:*
 * ``` ts
 * [[include:BriefcaseDb.onOpened]]
 * ```
 * A service or agent would normally get its [[AutoPushParams]] parameters from data provided
 * at deployment time. For example, a service might read configuration data from a .json file
 * that is deployed with the service.
 * ``` json
 * {
 *    "autoPush": {
 *      "pushIntervalSecondsMin": ${MYSERVICE-AUTOPUSH-INTERVAL-MIN},
 *      "pushIntervalSecondsMax": ${MYSERVICE-AUTOPUSH-INTERVAL-MAX},
 *      "autoSchedule": true
 *    },
 * }
 * ```
 * Note that the values of some of the configuration
 * property values are defined by placeholders denoted by `${some-macro-name}`. These placeholders
 * are to be replaced by EnvMacroSubst.replaceInProperties with the values of environment
 * values of the same names. These environment variables would typically be set by the deployment
 * mechanism from deployment parameters.
 *
 * The service would read the configuration like this:
 * ``` ts
 * [[include:Service.readConfig]]
 * ```
 * @beta
 * @deprecated auto-push is no longer supported and will be removed in 3.0.
 */
export class AutoPush {
  private _iModel: BriefcaseDb;
  private _autoSchedule: boolean;
  private _pushIntervalMillisMin: number;
  private _pushIntervalMillisMax: number;
  private _endOfPushMillis: number;      // the time the last push finished (in unix milliseconds)
  private _startOfPushMillis: number;    // the time the last push was started (in unix milliseconds)
  private _state: AutoPushState;
  private _activityMonitor: AppActivityMonitor;
  private _lastPushError: any;
  private _pendingTimeout: any | undefined;
  /** Events raised by AutoPush. See [[AutoPushEventType]] */
  public event: BeEvent<AutoPushEventHandler>;

  /** Construct an AutoPushManager.
   * @param params  Auto-push configuration parameters
   * @param activityMonitor The activity monitor that will tell me when the app is idle. Defaults to BackendActivityMonitor with a 1 second idle period.
   */
  constructor(iModel: BriefcaseDb, params: AutoPushParams, activityMonitor?: AppActivityMonitor) {
    AutoPush.validateAutoPushParams(params);
    iModel.onBeforeClose.addListener(() => this.cancel());
    this._iModel = iModel;
    this._activityMonitor = activityMonitor || new BackendActivityMonitor();
    this._pushIntervalMillisMin = params.pushIntervalSecondsMin * 1000;
    this._pushIntervalMillisMax = params.pushIntervalSecondsMax * 1000;
    this._endOfPushMillis = Date.now(); // not true, but this sets the mark for detecting when we reach the max
    this._startOfPushMillis = this._endOfPushMillis + 1; // initialize to invalid duration
    this._lastPushError = undefined;
    this._state = AutoPushState.NotRunning;
    this._pendingTimeout = undefined;
    this.event = new BeEvent<AutoPushEventHandler>();
    this._autoSchedule = params.autoSchedule;
    if (this._autoSchedule)
      this.scheduleNextPush();
  }

  /** Check that 'params' is a valid AutoPushParams object. This is useful when you read params from a .json file. */
  public static validateAutoPushParams(params: any) {
    const reqProps = ["pushIntervalSecondsMin", "pushIntervalSecondsMax", "autoSchedule"];
    for (const reqProp of reqProps) {
      if (!params.hasOwnProperty(reqProp)) {
        throw new IModelError(IModelStatus.BadArg, `Invalid AutoPushParams object - missing required property: ${reqProp}`, Logger.logError, loggerCategory);
      }
    }
  }

  /** Cancel the next auto-push. Note that this also turns off auto-scheduling. */
  public cancel(): void {
    this._autoSchedule = false;

    if (this._state !== AutoPushState.Scheduled) {
      return;
    }

    clearTimeout(this._pendingTimeout);
    this._pendingTimeout = undefined;
    this._state = AutoPushState.NotRunning;
    this.onPushCancelled();
  }

  /** The autoSchedule property */
  public get autoSchedule(): boolean { return this._autoSchedule; }
  public set autoSchedule(v: boolean) {
    this._autoSchedule = v;
    if (v)
      this.scheduleNextAutoPushIfNecessary();
  }

  /** The IModelDb that this is auto-pushing. */
  public get iModel(): BriefcaseDb { return this._iModel; }

  /** The time that the last push finished in unix milliseconds. Returns 0 if no push has yet been done. */
  public get endOfLastPushMillis() { return (this._startOfPushMillis <= this._endOfPushMillis) ? this._endOfPushMillis : 0; }

  /** The length of time in milliseconds that the last push required to finish. Returns -1 if no push has yet been done. */
  public get durationOfLastPushMillis() { return this._endOfPushMillis - this._startOfPushMillis; }

  /** Check the current state of this AutoPush. */
  public get state(): AutoPushState { return this._state; }

  /** The last push error, if any.  */
  public get lastError(): any | undefined { return this._lastPushError; }

  // Schedules an auto-push, if none is already scheduled.
  public scheduleNextAutoPushIfNecessary() {
    if (this._state === AutoPushState.NotRunning)
      this.scheduleNextPush();
  }

  /** Schedules an auto-push. */
  public scheduleNextPush(intervalSeconds?: number) {
    assert(this._state === AutoPushState.NotRunning);
    const intervalMillis = intervalSeconds ? (intervalSeconds * 1000) : this._pushIntervalMillisMin;
    this._pendingTimeout = setTimeout(() => this.doAutoPush(), intervalMillis);
    this._state = AutoPushState.Scheduled;
    Logger.logTrace(loggerCategory, `AutoPush - next push in ${(intervalMillis / 1000)} seconds...`);
  }

  public async reserveCodes(): Promise<void> {
    const requestContext = await this.getRequestContext();
    return this._iModel.concurrencyControl.request(requestContext);
  }

  private _requestContext?: AuthorizedBackendRequestContext;
  private async getRequestContext(): Promise<AuthorizedBackendRequestContext> {
    // Create or refresh requestContext as necessary
    // todo: replace this logic to check the validity of the accessToken
    const accessToken = await IModelHost.getAccessToken();
    if (!this._requestContext || this._requestContext.accessToken !== accessToken)
      this._requestContext = new AuthorizedBackendRequestContext(accessToken);

    return this._requestContext;
  }

  /** Callback invoked just before auto-pushing */
  private onPushStart() {
    Logger.logTrace(loggerCategory, "AutoPush - pushing...");
    this._state = AutoPushState.Pushing;
    this._startOfPushMillis = Date.now();
    if (this.event)
      this.event.raiseEvent(AutoPushEventType.PushStarted, this);
  }

  /** Callback invoked when the next scheduled autopush is cancelled */
  private onPushCancelled() {
    Logger.logTrace(loggerCategory, "AutoPush - cancelling.");
    assert(this._state === AutoPushState.NotRunning);
    if (this.event)
      this.event.raiseEvent(AutoPushEventType.PushCancelled, this);
  }

  /** Callback invoked just after auto-pushing */
  private onPushEnd() {
    this._endOfPushMillis = Date.now();
    this._state = AutoPushState.NotRunning;
    this._pendingTimeout = undefined;
    this._lastPushError = undefined;
    Logger.logTrace(loggerCategory, "AutoPush - pushed.", () => this._iModel.getRpcProps());
    if (this._autoSchedule)
      this.scheduleNextPush();
    if (this.event)
      this.event.raiseEvent(AutoPushEventType.PushFinished, this); // handler can cancel, if it wants to
  }

  private onPushEndWithError(err: any) {
    this._state = AutoPushState.NotRunning;
    this._pendingTimeout = undefined;
    this._lastPushError = err;
    Logger.logInfo(loggerCategory, "AutoPush - push failed", () => err);
    if (this._autoSchedule)
      this.scheduleNextPush();
    if (this.event)
      this.event.raiseEvent(AutoPushEventType.PushFailed, this);  // handler can cancel, if it wants to
  }

  //  Push changes, if there are changes and only if the backend is idle.
  private doAutoPush() {
    // Nothing to push?
    if (!this.iModel.txns.hasLocalChanges) {
      this.cancel();
      this.scheduleNextPush();
      return;
    }

    if (this.iModel === undefined) {
      Logger.logInfo(loggerCategory, "AutoPush - No iModel! Cancelling...");
      this.cancel();
      return;
    }

    //  If the previous push is still in progress ...
    if (this._state === AutoPushState.Pushing) {
      assert(this._pendingTimeout !== undefined);
      Logger.logInfo(loggerCategory, "AutoPush - Attempt to auto-push while push is in progress. Re-scheduling.");
      if (this._autoSchedule)
        this.scheduleNextPush();  // wait a while before trying another one.
      else
        this.cancel();          // don't push
      return;
    }

    // If the backend is busy, then put off the push for a little while, and wait for a lull.
    if (!this._activityMonitor.isIdle && ((Date.now() - this._endOfPushMillis) < this._pushIntervalMillisMax)) {
      Logger.logInfo(loggerCategory, "AutoPush - Attempt to auto-push while backend is busy. Re-scheduling.");
      this.cancel();
      this.scheduleNextPush();
      return;
    }

    // We are either in lull or we have put off this push long enough. Start to push accumulated changes now.
    this.onPushStart();
    this.getRequestContext()
      .then(async (requestContext: AuthorizedBackendRequestContext) => this.iModel.pushChanges(requestContext, "auto-push"))
      .then(() => this.onPushEnd())
      .catch((reason) => this.onPushEndWithError(reason));

    // Note that pushChanges is async. We don't await it or even return it. That is because, doAutoPush is always called on a timer. That is,
    // the caller is node, and so the caller won't await it or otherwise deal with the Promise. That's fine, we just want to kick
    // off the push and let it run concurrently, as the service gets back to doing other things.
    // Yes, you can interleave other service operations, even inserts and updates and saveChanges, with a push. That is because
    // pushChanges keeps track of the last local Txn that should process. It is no problem to add more while push is in progress.
  }

}
