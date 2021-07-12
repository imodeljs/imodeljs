/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { IModelApp, Tool, TwoWayViewportSync, Viewport } from "@bentley/imodeljs-frontend";

/** Connect or disconnect two viewports using TwoWayViewportSync. */
export class SyncViewportsTool extends Tool {
  public static override toolId = "SyncViewports";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 2; }

  private static _vp1?: Viewport;
  private static _vp2?: Viewport;
  private static _removeListeners?: VoidFunction;
  private static _sync = new TwoWayViewportSync();

  public override run(vp1?: Viewport, vp2?: Viewport): boolean {
    const that = SyncViewportsTool;
    if (!vp1 && !vp2) {
      that.disconnect();
    } else if (vp1 && vp2 && vp1 !== vp2) {
      if (vp1 === that._vp1 && vp2 === that._vp2)
        that.disconnect();
      else
        that.connect(vp1, vp2);
    }

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    switch (args.length) {
      case 0:
        return this.run();
      case 2:
        const vpId1 = Number.parseInt(args[0], 10);
        const vpId2 = Number.parseInt(args[1], 10);
        if (Number.isNaN(vpId1) || Number.isNaN(vpId2) || vpId1 === vpId2)
          return true;

        let vp1, vp2;
        for (const vp of IModelApp.viewManager) {
          if (vp.viewportId === vpId1)
            vp1 = vp;
          else if (vp.viewportId === vpId2)
            vp2 = vp;
        }

        if (vp1 && vp2)
          return this.run(vp1, vp2);
    }

    return true;
  }

  private static connect(vp1: Viewport, vp2: Viewport): void {
    this.disconnect();
    this._sync.connect(vp1, vp2);
    this._vp1 = vp1;
    this._vp2 = vp2;
    const dispose1 = vp1.onDisposed.addOnce(() => this.disconnect());
    const dispose2 = vp2.onDisposed.addOnce(() => this.disconnect());
    this._removeListeners = () => { dispose1(); dispose2(); };
  }

  private static disconnect(): void {
    this._sync.disconnect();
    if (this._removeListeners) {
      this._removeListeners();
      this._removeListeners = undefined;
    }

    this._vp1 = this._vp2 = undefined;
  }
}
