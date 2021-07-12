/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BentleyStatus } from "@bentley/bentleyjs-core";
import { IModelError } from "@bentley/imodeljs-common";
import { GLTimerResult, GLTimerResultCallback } from "../RenderSystem";
import { System } from "./System";

abstract class DisjointTimerExtension {
  public abstract get isSupported(): boolean;
  public abstract didDisjointEventHappen(): boolean;
  public abstract createQuery(): WebGLQuery;
  public abstract deleteQuery(q: WebGLQuery): void;
  public abstract beginQuery(q: WebGLQuery): void;
  public abstract endQuery(): void;
  public abstract isResultAvailable(q: WebGLQuery): boolean;
  public abstract getResult(q: WebGLQuery): number;
}

class DisjointTimerExtensionWebGL1 extends DisjointTimerExtension {
  private _e: any; // EXT_disjoint_timer_query, not available in lib.dom.d.ts
  private _context: WebGLRenderingContext;

  public constructor(system: System) {
    super();
    this._e = system.capabilities.queryExtensionObject<any>("EXT_disjoint_timer_query");
    this._context = system.context;
  }

  public get isSupported(): boolean { return this._e !== undefined; }

  public didDisjointEventHappen(): boolean {
    return this._context.getParameter(this._e.GPU_DISJOINT_EXT);
  }

  public createQuery(): WebGLQuery { return this._e.createQueryEXT() as WebGLQuery; }
  public deleteQuery(q: WebGLQuery) { this._e.deleteQueryEXT(q); }

  public beginQuery(q: WebGLQuery) { this._e.beginQueryEXT(this._e.TIME_ELAPSED_EXT, q); }
  public endQuery() { this._e.endQueryEXT(this._e.TIME_ELAPSED_EXT); }

  public isResultAvailable(q: WebGLQuery): boolean {
    return this._e.getQueryObjectEXT(q, this._e.QUERY_RESULT_AVAILABLE_EXT);
  }
  public getResult(q: WebGLQuery): number {
    return this._e.getQueryObjectEXT(q, this._e.QUERY_RESULT_EXT);
  }
}
class DisjointTimerExtensionWebGL2 extends DisjointTimerExtension {
  private _e: any; // EXT_disjoint_timer_query, not available in lib.dom.d.ts
  private _context: WebGL2RenderingContext;

  public constructor(system: System) {
    super();
    if (system.capabilities.isWebGL2) {
      this._e = system.capabilities.queryExtensionObject<any>("EXT_disjoint_timer_query_webgl2");
      if (this._e === undefined) // If webgl2 timer doesn't work, attempt to use the older disjoint timer
        this._e = system.capabilities.queryExtensionObject<any>("EXT_disjoint_timer_query");
    } else
      this._e = undefined;
    this._context = system.context as WebGL2RenderingContext;
  }

  public get isSupported(): boolean { return this._e !== undefined; }

  public didDisjointEventHappen(): boolean {
    return this._context.getParameter(this._e.GPU_DISJOINT_EXT);
  }

  public createQuery(): WebGLQuery { return this._context.createQuery() as WebGLQuery; }
  public deleteQuery(q: WebGLQuery) { this._context.deleteQuery(q); }

  public beginQuery(q: WebGLQuery) { this._context.beginQuery(this._e.TIME_ELAPSED_EXT, q); }
  public endQuery() { this._context.endQuery(this._e.TIME_ELAPSED_EXT); }

  public isResultAvailable(q: WebGLQuery): boolean {
    return this._context.getQueryParameter(q, this._context.QUERY_RESULT_AVAILABLE);
  }
  public getResult(q: WebGLQuery): number {
    return this._context.getQueryParameter(q, this._context.QUERY_RESULT);
  }
}

interface QueryEntry {
  label: string;
  query: WebGLQuery;
  children?: QueryEntry[];
}

/** Record GPU hardware queries to profile independent of CPU.
 *
 * This is a wrapper around EXT_disjoint_timer_query. The extension should be available in the following browsers:
 *  * Chrome 67 and later
 *  * Chromium-based Edge
 *  * Firefox (with webgl.enable-privileged-extensions set to true in about:config)
 *
 * EXT_disjoint_timer_query only supports one active query per context without nesting. This wrapper keeps an internal stack to make
 * nesting work.
 *
 * The extension API makes timestamps look like a better solution than disjoint timers, but they are not actually supported.
 * See https://bugs.chromium.org/p/chromium/issues/detail?id=595172
 * @internal
 */
export class GLTimer {
  private _extension: DisjointTimerExtension;
  private _queryStack: QueryEntry[];
  private _resultsCallback?: GLTimerResultCallback;

  private constructor(system: System) {
    if (system.capabilities.isWebGL2)
      this._extension = new DisjointTimerExtensionWebGL2(system);
    else
      this._extension = new DisjointTimerExtensionWebGL1(system);
    this._queryStack = [];
    this._resultsCallback = undefined;
  }

  // This class is necessarily a singleton per context because of the underlying extension it wraps.
  // System is expected to call create in its constructor.
  public static create(system: System): GLTimer {
    return new GLTimer(system);
  }

  public get isSupported(): boolean { return this._extension.isSupported; }

  public set resultsCallback(callback: GLTimerResultCallback | undefined) {
    if (this._queryStack.length !== 0)
      throw new IModelError(BentleyStatus.ERROR, "Do not set resultsCallback when a frame is already being drawn");

    this._resultsCallback = callback;
  }

  public beginOperation(label: string) {
    if (!this._resultsCallback)
      return;

    this.pushQuery(label);
  }

  public endOperation() {
    if (!this._resultsCallback)
      return;
    if (this._queryStack.length === 0)
      throw new IModelError(BentleyStatus.ERROR, "Mismatched calls to beginOperation/endOperation");

    this.popQuery();
  }

  public beginFrame() {
    if (!this._resultsCallback)
      return;
    if (this._queryStack.length !== 0)
      throw new IModelError(BentleyStatus.ERROR, "Already recording timing for a frame");

    const query = this._extension.createQuery();
    this._extension.beginQuery(query);
    this._queryStack.push({ label: "Total", query, children: [] });
  }

  public endFrame() {
    if (!this._resultsCallback)
      return;
    if (this._queryStack.length !== 1)
      throw new IModelError(BentleyStatus.ERROR, "Missing at least one endOperation call");

    this._extension.endQuery();
    const root = this._queryStack.pop()!;
    const userCallback = this._resultsCallback;

    const queryCallback = () => {
      if (this._extension.didDisjointEventHappen()) {
        // Have to throw away results for this frame after disjoint event occurs.
        this.cleanupAfterDisjointEvent(root);
        return;
      }

      // It takes more one or more frames for results to become available.
      // Only checking time for root since it will always be the last query completed.
      if (!this._extension.isResultAvailable(root.query)) {
        setTimeout(queryCallback, 0);
        return;
      }

      const processQueryEntry = (queryEntry: QueryEntry): GLTimerResult => {
        const time = this._extension.getResult(queryEntry.query);
        this._extension.deleteQuery(queryEntry.query);

        const result: GLTimerResult = { label: queryEntry.label, nanoseconds: time };
        if (queryEntry.children === undefined)
          return result;

        result.children = [];
        for (const child of queryEntry.children) {
          const childResult = processQueryEntry(child);
          result.children.push(childResult);
          result.nanoseconds += childResult.nanoseconds;
        }
        return result;
      };

      userCallback(processQueryEntry(root));
    };
    setTimeout(queryCallback, 0);
  }

  private cleanupAfterDisjointEvent(queryEntry: QueryEntry) {
    this._extension.deleteQuery(queryEntry.query);
    if (!queryEntry.children)
      return;
    for (const child of queryEntry.children)
      this.cleanupAfterDisjointEvent(child);
  }

  private pushQuery(label: string) {
    this._extension.endQuery();

    const query = this._extension.createQuery();
    this._extension.beginQuery(query);

    const activeQuery = this._queryStack[this._queryStack.length - 1];
    const queryEntry: QueryEntry = { label, query };
    this._queryStack.push(queryEntry);

    if (activeQuery.children === undefined)
      activeQuery.children = [queryEntry];
    else
      activeQuery.children.push(queryEntry);
  }

  private popQuery() {
    this._extension.endQuery();
    this._queryStack.pop();

    const activeQuery = this._queryStack[this._queryStack.length - 1];
    this._extension.beginQuery(activeQuery.query);
  }
}
