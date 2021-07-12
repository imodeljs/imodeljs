/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "@bentley/bentleyjs-core";
import { DiagnosticsPanel } from "@bentley/frontend-devtools";
import { IModelApp, Viewport } from "@bentley/imodeljs-frontend";
import { Surface } from "./Surface";
import { Window } from "./Window";

export class DebugWindow extends Window {
  private readonly _windowId: string;
  private readonly _panel: DiagnosticsPanel;
  private readonly _dispose: () => void;
  private _isOpen = false;

  public constructor(viewport: Viewport) {
    super(Surface.instance, { top: 0, left: 0 });

    this._panel = new DiagnosticsPanel(viewport, { exclude: { keyin: true } });
    this._panel.element.className = "debugPanel";

    this._panel.element.style.height = "auto";
    this._panel.element.style.top = "0px";
    this._panel.element.style.left = "0px";
    this._panel.element.style.zIndex = "inherit";

    this.contentDiv.appendChild(this._panel.element);

    this.title = `[ ${viewport.viewportId} ] Diagnostics`;
    this._windowId = `debugPanel-${viewport.viewportId}`;
    this.isPinned = true;

    this._dispose = IModelApp.viewManager.onSelectedViewportChanged.addListener((args) => {
      this.container.style.display = args.current === viewport ? "flex" : "none";
    });
  }

  public dispose(): void {
    this._panel.dispose();
    this.hide();
    this._dispose();
  }

  public override get isResizable() { return false; }
  public get windowId() { return this._windowId; }

  public toggle(): void {
    if (this._isOpen)
      this.hide();
    else
      this.show();
  }

  public show(): void {
    if (!this._isOpen) {
      this.surface.addWindow(this);
      this.surface.element.appendChild(this.container);
      this._isOpen = true;
      const w = this._panel.element.clientWidth + 2;
      const h = this._panel.element.clientHeight;
      this._header.resizeContent(w, h);
    }
  }

  public hide(): void {
    if (this._isOpen) {
      this.surface.close(this);
      assert(!this._isOpen);
    }
  }

  public override onClosed(): void {
    this._isOpen = false;
  }
}
