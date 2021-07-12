/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utils
 */

/** @beta */
export class AbandonedError extends Error { }

/**
 * An object that returns a Promise when you call [[init]], but supplies a way to abandon the promise if it is no longer relevant.
 * When you call abandon, the promise will be rejected. You must supply a [[run]] method to the constructor that
 * creates the real Promise for the underlying action. Notice that to use this class there are really two
 * Promises involved that are chained together. That makes this class less efficient than just using a Promise directly.
 */
class PromiseWithAbandon<T> {
  /** Method to abandon the Promise created by [[init]] while it is outstanding. The promise will be rejected. */
  public abandon!: (msg?: string) => void;
  private _resolve!: (val: any) => void;

  /** Create a PromiseWithAbandon. After this call you must call [[init]] to create the underlying Promise.
   * @param _run The method that creates the underlying Promise.
   * @param _args An array of args to be passed to run when [[start]] is called.
   */
  constructor(private _run: (...args: any[]) => Promise<T>, private _args: any[]) { }

  /** Create a Promise that is chained to the underlying Promise, but is connected to the abandon method. */
  public async init(msg: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.abandon = (message?: string) => reject(new AbandonedError(message ?? msg));
      this._resolve = resolve;
    });
  }

  /** Call the [[run]] method supplied to the ctor to start the underlying Promise. */
  public async start() {
    try {
      this._resolve(await this._run(...this._args));
    } catch (err) {
      this.abandon(err.msg); // turn all errors from execution into abandoned errors, but keep the message
    }
  }
}

/**
 * Orchestrator of a one-at-a-time activity. This concept is useful only for *replaceable* operations (that is, operations where subsequent requests replace and obviate
 * the need for previous requests. E.g. over slow HTTP connections, without this class, the stream of requests can overwhelm the connection, and cause the HTTP
 * request queue to grow such that the delay to service new requests is unbounded.
 *
 * With this class, we issue the initial request immediately. When the second request arrives before the first one completes, it becomes *pending*. If subsequent
 * requests arrive with a pending request, the current pending request is *abandoned* (its Promise is rejected) and the new request becomes pending.
 * When the active request completes, the pending request (if present) is started. In this manner there will only ever be one outstanding HTTP request for this type
 * of operation, but the first and last request will always eventually complete.
 * @beta
 */
export class OneAtATimeAction<T> {
  private _active?: PromiseWithAbandon<T>;
  private _pending?: PromiseWithAbandon<T>;
  private _run: (...args: any[]) => Promise<T>;
  public msg: string;

  /** Ctor for OneAtATimePromise.
   * @param run The method that performs an action that creates the Promise.
   */
  constructor(run: (...args: any[]) => Promise<T>, msg = "abandoned") { this._run = run; this.msg = msg; }

  /** Add a new request to this OneAtATimePromise. The request will only run when no other outstanding requests are active.
   * @note Callers of this method *must* handle AbandonedError rejections.
   */
  public async request(...args: any[]): Promise<T> {
    const entry = new PromiseWithAbandon<T>(this._run, args); // create an "abandon-able promise" object
    const promise = entry.init(this.msg); // create the Promise from PromiseWithAbandon. Note: this must be called before we call start.

    if (this._active !== undefined) { // is there an active request?
      if (this._pending) // yes. If there is also a pending request, this one replaces it and previous one is abandoned
        this._pending.abandon(); // rejects previous call to this method, throwing AbandonedError.
      this._pending = entry;
    } else {
      this._active = entry; // this is the first request, start it.
      entry.start(); // eslint-disable-line @typescript-eslint/no-floating-promises
    }

    try {
      return await promise;
    } finally {
      // do all of this whether promise was fulfilled or rejected
      this._active = this._pending; // see if there's a pending request waiting
      this._pending = undefined; // clear pending
      if (this._active)
        this._active.start(); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
  }
}
