/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { StopWatch } from "@bentley/bentleyjs-core";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, Tool, Viewport } from "@bentley/imodeljs-frontend";

class TileLoadTimer {
  private readonly _vp: Viewport;
  private readonly _stopwatch: StopWatch;
  private _cleanup?: () => void;

  public constructor(vp: Viewport) {
    this._vp = vp;
    this._stopwatch = new StopWatch();

    // Purge tile trees for all models.
    IModelApp.viewManager.refreshForModifiedModels(undefined);

    const removeOnRender = vp.onRender.addListener(() => this.onRender());
    const removeOnClose = vp.iModel.onClose.addOnce(() => this.cancel());
    this._cleanup = () => { removeOnRender(); removeOnClose(); };

    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Tile loading timer started."));
    this._stopwatch.start();
  }

  private cancel(): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Tile loading timer canceled."));
    this.stop();
  }

  private stop(): void {
    if (undefined !== this._cleanup) {
      this._cleanup();
      this._cleanup = undefined;
    }
  }

  private onRender(): void {
    // ###TODO: May be intermediate frames during which children props have been asynchronously requested but no outstanding tile requests.
    if (!this._vp.areAllTileTreesLoaded || 0 < this._vp.numRequestedTiles)
      return;

    this._stopwatch.stop();
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Tiles loaded in ${this._stopwatch.elapsedSeconds.toFixed(4)} seconds.`));

    this.stop();
  }
}

/** Unloads all tile trees, then starts a timer that stops when all tile trees and tiles required for the view are ready.
 * Outputs the elapsed time to notifications manager.
 * @beta
 */
export class MeasureTileLoadTimeTool extends Tool {
  public static override toolId = "MeasureTileLoadTime";

  /** This method runs the tool, unloading all tile trees, then starts a timer that stops when all tile trees and tiles required for the view are ready. It will then output the elapsed time to notifications manager.
   * @param _args this parameter is unused
   */
  public override run(_args: any[]): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp)
      new TileLoadTimer(vp);

    return true;
  }
}
