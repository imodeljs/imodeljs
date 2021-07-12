/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import {
  ConfigurableCreateInfo, ConfigurableUiManager, ContentViewManager, IModelViewportControlOptions,
  IModelViewportControl as UIFW_IModelViewportControl, ViewSelector, ViewUtilities,
} from "@bentley/ui-framework";
// uncomment following to test overriding default view overlay
// import { ScreenViewport } from "@bentley/imodeljs-frontend";
// import { MyCustomViewOverlay } from "../frontstages/FrontstageUi2";

/** iModel Viewport Control
 */
export class IModelViewportControl extends UIFW_IModelViewportControl {
  public static override get id() {
    return "TestApp.IModelViewport";
  }

  constructor(info: ConfigurableCreateInfo, options: IModelViewportControlOptions) {
    super(info, { ...options, deferNodeInitialization: true });  // force deferNodeInitialization for subclass
  }

  /** Get the React component that will be shown when no iModel data is available */
  protected override getNoContentReactElement(options: IModelViewportControlOptions): React.ReactNode {
    return <MockIModelViewport bgColor={options.bgColor ? options.bgColor : "black"} />;
  }

  /** Returns a promise that resolves when the control is ready for usage.
   */
  public override get isReady(): Promise<void> {
    if (this._viewState)
      return super.isReady;
    else
      return Promise.resolve();
  }

  /* uncomment to test overriding view overlay
  protected _getViewOverlay = (_viewport: ScreenViewport): React.ReactNode => {
    return < MyCustomViewOverlay />;
  }
  */

  public override onActivated(): void {
    super.onActivated();

    // Demo for showing only the same type of view in ViewSelector - See ViewsFrontstage.tsx, <ViewSelector> listenForShowUpdates
    if (this.viewport)
      ViewSelector.updateShowSettings(
        ViewUtilities.isSpatialView(this.viewport),
        ViewUtilities.isDrawingView(this.viewport),
        ViewUtilities.isSheetView(this.viewport),
        false);
  }
}

// This is used for fake viewports (those with no ViewState and/or ImodelConnection)
interface MockIModelViewportProps {
  bgColor?: string;
}

/** MockIModelViewport used when imodelConnection and ViewState are not defined
 * @internal
 */
class MockIModelViewport extends React.Component<MockIModelViewportProps> {
  private _htmlCanvas!: HTMLCanvasElement;

  public override render(): React.ReactNode {
    const divStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
      backgroundColor: this.props.bgColor,
    };
    const canvasStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
    };

    return (
      <div className="ContentViewPane" style={divStyle}>
        <canvas className="uifw-unselectable" style={canvasStyle} ref={(element: any) => { this._htmlCanvas = element; }}
          onMouseMove={this._onMouseMove}
          onMouseLeave={this._onMouseLeave}
          onMouseDown={this._onMouseDown}
          onMouseUp={this._onMouseUp}
        />
      </div>
    );
  }

  private drawCanvas(event: React.MouseEvent<HTMLCanvasElement>, isMouseDown: boolean) {
    const canvas = this._htmlCanvas;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const boundingRect: DOMRect = (event.nativeEvent.target as any).getBoundingClientRect();
      const canvasX = (event.clientX - boundingRect.left);
      const canvasY = (event.clientY - boundingRect.top);

      // clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // draw the text
      ctx.font = "10px Arial";
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      const text = `Mouse Info:  X: ${canvasX} Y: ${canvasY} Down: ${isMouseDown}`;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
  }

  private _onMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    this.drawCanvas(event, ContentViewManager.isMouseDown);
  };

  private _onMouseLeave = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = this._htmlCanvas;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const boundingRect: DOMRect = (event.nativeEvent.target as any).getBoundingClientRect();
      ctx.clearRect(0, 0, boundingRect.width, boundingRect.height);
    }
  };

  private _onMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    this.drawCanvas(event, true);
    event.preventDefault();
  };

  private _onMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    this.drawCanvas(event, false);
  };
}

ConfigurableUiManager.registerControl(IModelViewportControl.id, IModelViewportControl);
