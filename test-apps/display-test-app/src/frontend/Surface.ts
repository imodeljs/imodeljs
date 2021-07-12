/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { KeyinField, parseArgs } from "@bentley/frontend-devtools";
import { Range3d } from "@bentley/geometry-core";
import { Cartographic } from "@bentley/imodeljs-common";
import { BlankConnection, BlankConnectionProps, IModelApp, Tool } from "@bentley/imodeljs-frontend";
import { DisplayTestApp } from "./App";
import { BrowserFileSelector, selectFileName } from "./FileOpen";
import { FpsMonitor } from "./FpsMonitor";
import { NotificationsWindow } from "./Notifications";
import { addSnapModes } from "./SnapModes";
import { TileLoadIndicator } from "./TileLoadIndicator";
import { createToolButton, ToolBar } from "./ToolBar";
import { Viewer, ViewerProps } from "./Viewer";
import { Dock, NamedWindow, NamedWindowProps, Window, WindowProps } from "./Window";
import { openStandaloneIModel } from "./openStandaloneIModel";
import { setTitle } from "./Title";
import { openAnalysisStyleExample } from "./AnalysisStyleExample";
import { openDecorationGeometryExample } from "./DecorationGeometryExample";

// cspell:ignore textbox topdiv

export class Surface {
  public readonly element: HTMLElement;
  public readonly keyinField: KeyinField;
  private readonly _keyinDiv: HTMLElement;
  private readonly _toolbarDiv: HTMLElement;
  private readonly _windows: Window[] = [];
  public readonly notifications: NotificationsWindow;
  private readonly _toolbar: ToolBar;
  public readonly browserFileSelector?: BrowserFileSelector;
  public readonly openReadWrite: boolean;

  public static get instance() { return DisplayTestApp.surface; }

  public constructor(surfaceDiv: HTMLElement, toolbarDiv: HTMLElement, browserFileSelector: BrowserFileSelector | undefined, openReadWrite: boolean) {
    // Ensure iModel gets closed on page close/reload
    window.onbeforeunload = () => this.closeAllViewers();

    this.element = surfaceDiv;
    this.openReadWrite = openReadWrite;
    this.browserFileSelector = browserFileSelector;
    this._toolbarDiv = toolbarDiv;
    this._toolbar = this.createToolBar();
    this._toolbarDiv.appendChild(this._toolbar.element);

    addSnapModes(document.getElementById("snapModesContainer")!);
    new TileLoadIndicator(document.getElementById("tileLoadIndicatorContainer") as HTMLDivElement);
    new FpsMonitor({
      checkbox: document.getElementById("fps-checkbox") as HTMLInputElement,
      label: document.getElementById("fps-label") as HTMLLabelElement,
      output: document.getElementById("fps-output") as HTMLSpanElement,
    });

    this._keyinDiv = document.getElementById("keyin-entry")!;
    this.keyinField = new KeyinField({
      parent: this._keyinDiv,
      baseId: "dtaKeyinField",
      historyLength: 50,
    });
    this.keyinField.textBox.textbox.addEventListener("keydown", (e) => {
      if ("Escape" === e.key || "`" === e.key) {
        this.keyinField.loseFocus();
        e.preventDefault();
        e.stopPropagation();
      }
    });
    this.keyinField.textBox.div.className = "keyin-entry";
    this.keyinField.textBox.textbox.className = "keyin-entry-textbox";

    this.notifications = new NotificationsWindow(this, { title: "Notifications", width: 800, height: 800, maxStoredMessages: 50 });
    this.addWindow(this.notifications);

    document.addEventListener("keydown", (e) => {
      const handler = this.getKeyboardShortcutHandler(e);
      if (undefined !== handler) {
        handler();
        e.preventDefault();
      }
    });

    window.onresize = () => {
      for (const window of this._windows) {
        if (window.isDocked)
          window.updateDock();
        else
          window.ensureInSurface();
      }
    };

    IModelApp.viewManager.onSelectedViewportChanged.addListener((args) => {
      if (null !== this._toolbarDiv.firstChild)
        this._toolbarDiv.removeChild(this._toolbarDiv.firstChild);

      if (undefined !== args.previous) {
        const previous = this.findViewerByViewportId(args.previous.viewportId);
        if (undefined !== previous)
          previous.onDeselected();
      }

      if (undefined !== args.current) {
        const current = this.findViewerByViewportId(args.current.viewportId);
        if (undefined !== current) {
          current.onSelected();
          this._toolbarDiv.appendChild(current.toolBar.element);
          this.focus(current);
          return;
        }
      }

      this._toolbarDiv.appendChild(this._toolbar.element);
      this.focus(this.notifications);
    });
  }

  private createToolBar(): ToolBar {
    const div = IModelApp.makeHTMLElement("div", { className: "topdiv" });
    const tb = new ToolBar(div);

    tb.addItem(createToolButton({
      iconUnicode: "\ue9cc", // "briefcases"
      tooltip: "Open iModel from disk",
      click: () => {
        this.openIModel(); // eslint-disable-line @typescript-eslint/no-floating-promises
      },
    }));

    tb.addItem(createToolButton({
      iconUnicode: "\ue9d8", // "property-data"
      tooltip: "Open Blank Connection",
      click: () => {
        this.openBlankConnection(); // eslint-disable-line @typescript-eslint/no-floating-promises
      },
    }));

    tb.addItem(createToolButton({
      iconUnicode: "\uea32", // play
      tooltip: "Analysis Style Example",
      click: async () => {
        this.openBlankConnection({ // eslint-disable-line @typescript-eslint/no-floating-promises
          name: "Analysis Style Example",
          extents: new Range3d(0, 0, -30, 100, 100, 20),
        }).then(async (viewer) => openAnalysisStyleExample(viewer));
      },
    }));

    tb.addItem(createToolButton({
      iconUnicode: "\ue9d8",
      tooltip: "Decoration Geometry Example",
      click: async () => {
        this.openBlankConnection({ // eslint-disable-line @typescript-eslint/no-floating-promises
          name: "Decoration Geometry Example",
          extents: new Range3d(-1, -1, -1, 13, 2, 2),
        }).then(async (viewer) => openDecorationGeometryExample(viewer));
      },
    }));

    return tb;
  }

  // create a new blank connection for testing backgroundMap and reality models.
  private async openBlankConnection(props?: Partial<BlankConnectionProps>): Promise<Viewer> {
    const iModel = BlankConnection.create({
      location: props?.location ?? Cartographic.fromDegrees(-75.686694, 40.065757, 0), // near Exton pa
      extents: props?.extents ?? new Range3d(-1000, -1000, -100, 1000, 1000, 100),
      name: props?.name ?? "blank connection test",
    });

    const viewer = await this.createViewer({ iModel });
    viewer.dock(Dock.Full);
    return viewer;
  }

  private async openIModel(filename?: string): Promise<void> {
    if (undefined === filename) {
      filename = await selectFileName(this.browserFileSelector);
      if (undefined === filename)
        return;
    }

    try {
      const iModel = await openStandaloneIModel(filename, this.openReadWrite);
      setTitle(iModel);
      const viewer = await this.createViewer({ iModel });
      viewer.dock(Dock.Full);
    } catch (err) {
      alert(`Error opening iModel: ${err.toString()}`);
    }
  }

  public get firstViewer(): Viewer | undefined {
    for (const window of this._windows)
      if (window instanceof Viewer)
        return window;

    return undefined;
  }

  public async openFile(filename?: string): Promise<void> {
    const viewer = this.firstViewer;
    return undefined !== viewer ? viewer.openFile(filename) : this.openIModel(filename);
  }

  private getKeyboardShortcutHandler(e: KeyboardEvent): (() => void) | undefined {
    if (e.repeat)
      return undefined;

    const key = e.key;
    if ("`" === key)
      return () => this.keyinField.focus();

    if (!e.ctrlKey)
      return undefined;

    switch (key) {
      case "[":
      case "]":
        return () => this.focusNextOrPrevious("]" === key);
    }

    const focused = this.focusedWindow;
    if (undefined === focused)
      return undefined;

    let dock: Dock | undefined;
    switch (key) {
      case "\\":
        return () => {
          if (focused instanceof Viewer)
            this.addViewer(focused.clone());
        };
      case "|":
        return () => this.close(focused);
      case "n":
        // NB: This doesn't work in Chrome (it doesn't give us the keydown event for ctrl-n)
        return () => {
          if (focused !== this.notifications)
            this.notifications.focus();
          else
            this.focusNext();
        };
      case "p":
        return () => this.togglePin(focused);
      case "i":
        return () => focused.dock(Dock.Full);
      case "m":
        return () => focused.undock();
      case "h":
        dock = Dock.Left;
        break;
      case "l":
        dock = Dock.Right;
        break;
      case "k":
        dock = Dock.Top;
        break;
      case "j":
        dock = Dock.Bottom;
        break;
    }

    if (undefined !== dock)
      return () => focused.addDock(dock!);

    return undefined;
  }

  public createNamedWindow(props: NamedWindowProps): NamedWindow {
    const window = new NamedWindow(this, props);
    this.element.appendChild(window.container);
    this.addWindow(window);
    return window;
  }

  public async createViewer(props: ViewerProps): Promise<Viewer> {
    const viewer = await Viewer.create(this, props);
    this.addViewer(viewer);
    return viewer;
  }

  public addViewer(viewer: Viewer): void {
    this.addWindow(viewer);
    IModelApp.viewManager.addViewport(viewer.viewport);
  }

  public addWindow(window: Window): void {
    this._windows.push(window);
    window.ensureInSurface();
    this.updateWindowsUi();
    this.focus(window);
  }

  private updateWindowsUi(): void {
    this._windows.forEach((window: Window) => window.updateUi());
  }

  public focus(window: Window): void {
    const index = this._windows.indexOf(window);
    if (index < 1) {
      if (0 === index)
        window.onFocus(); // for when we initially create the first window...

      // not found, or already focused.
      return;
    }

    this._windows.splice(index, 1);
    this._windows.unshift(window);
    this.updateFocus();

    // ###TODO: This should only apply if you CLICKED on the window to focus it.
    this.keyinField.loseFocus();
  }

  public focusNext() { this.focusNextOrPrevious(true); }
  public focusPrevious() { this.focusNextOrPrevious(false); }
  private focusNextOrPrevious(next: boolean): void {
    // Focusing a window moves it to the front of the _windows array. So that array is ordered by most-recently- to least-recently-focused.
    if (next) {
      const front = this._windows[0];
      this._windows.splice(0, 1);
      this._windows.push(front);
    } else {
      const back = this._windows.pop()!;
      this._windows.unshift(back);
    }

    this.updateFocus();
  }

  public togglePin(window: Window): void {
    window.isPinned = !window.isPinned;
    this.updateFocus();
  }

  private updateFocus(): void {
    let zIndex = 10 + this._windows.length;
    let first = true;
    for (const w of this._windows) {
      if (first) {
        w.onFocus();
        first = false;
      } else {
        w.onLoseFocus();
      }

      const z = zIndex + (w.isPinned ? 100 : 0);
      w.container.style.zIndex = z.toString();
      zIndex -= 1;
    }
  }

  public findViewerByViewportId(id: number): Viewer | undefined {
    for (const window of this._windows)
      if (window instanceof Viewer && window.viewport.viewportId === id)
        return window;

    return undefined;
  }

  public get hasMultipleViewers(): boolean {
    let num = 0;
    for (const window of this._windows) {
      if (window instanceof Viewer) {
        ++num;
        if (num > 1)
          return true;
      }
    }

    return false;
  }

  public findWindowById(id: string): Window | undefined {
    return this._windows.find((x) => x.windowId === id);
  }

  public get focusedWindow(): Window | undefined {
    return this._windows[0];
  }

  public close(window: Window): void {
    if (window.isCloseable)
      this.forceClose(window);
  }

  public closeAllViewers(): void {
    const viewers = this._windows.filter((x) => x instanceof Viewer);
    for (const viewer of viewers)
      this.forceClose(viewer);
  }

  public forceClose(window: Window): void {
    // NB: Must do this before computing index, because closing a Viewer changes the selected viewport which changes focus which changes order of windows in array.
    window.onClosing();
    const index = this._windows.indexOf(window);
    if (-1 !== index) {
      this._windows.splice(index, 1);
      this.element.removeChild(window.container);
      window.onClosed();
    }
    this.updateWindowsUi();
  }

  public onResetIModel(viewer: Viewer): void {
    for (const window of this._windows)
      if (window instanceof Viewer && window !== viewer)
        this.forceClose(window);
  }

  public async selectFileName(): Promise<string | undefined> {
    return selectFileName(this.browserFileSelector);
  }
}

export class CreateWindowTool extends Tool {
  public static override toolId = "CreateWindow";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return undefined; }

  public override run(props: NamedWindowProps): boolean {
    DisplayTestApp.surface.createNamedWindow(props);
    return true;
  }

  public override parseAndRun(...inputArgs: string[]): boolean {
    let name: string | undefined;
    const props: WindowProps = {};

    const args = parseArgs(inputArgs);
    const id = args.get("id");
    if (undefined !== id)
      name = id;

    const title = args.get("title");
    if (undefined !== title)
      props.title = title;

    const sides: Array<"top" | "left" | "width" | "height"> = ["top", "left", "width", "height"];
    for (const key of sides) {
      const value = args.getInteger(key);
      if (undefined !== value)
        props[key] = value;
    }

    if (undefined !== name) {
      const namedProps: NamedWindowProps = { id: name, ...props };
      this.run(namedProps);
    }

    return true;
  }
}

export abstract class WindowIdTool extends Tool {
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public abstract execute(_window: Window): void;

  public override run(windowId?: string): boolean {
    const window = undefined !== windowId ? Surface.instance.findWindowById(windowId) : Surface.instance.focusedWindow;
    if (undefined !== window)
      this.execute(window);

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}

export class FocusWindowTool extends WindowIdTool {
  public static override toolId = "FocusWindow";
  public execute(window: Window): void {
    window.focus();
  }
}

export class MaximizeWindowTool extends WindowIdTool {
  public static override toolId = "MaximizeWindow";
  public execute(window: Window): void {
    if (!window.isDocked)
      window.dock(Dock.Full);
  }
}

export class RestoreWindowTool extends WindowIdTool {
  public static override toolId = "RestoreWindow";
  public execute(window: Window): void {
    window.undock();
  }
}

export class CloseWindowTool extends WindowIdTool {
  public static override toolId = "CloseWindow";
  public execute(window: Window): void {
    Surface.instance.close(window);
  }
}
export class ResizeWindowTool extends Tool {
  public static override toolId = "ResizeWindow";
  public static override get minArgs() { return 2; }
  public static override get maxArgs() { return 3; }

  public override run(width: number, height: number, id?: string): boolean {
    const window = undefined !== id ? Surface.instance.findWindowById(id) : Surface.instance.focusedWindow;
    if (undefined !== window)
      window.resizeContent(width, height);

    return true;
  }

  // width height [id]
  public override parseAndRun(...args: string[]): boolean {
    const w = parseInt(args[0], 10);
    const h = parseInt(args[1], 10);
    if (!Number.isNaN(w) || !Number.isNaN(h))
      this.run(w, h, args[2]);

    return true;
  }
}

export class DockWindowTool extends Tool {
  public static override toolId = "DockWindow";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(dock: Dock, windowId?: string): boolean {
    const window = undefined !== windowId ? Surface.instance.findWindowById(windowId) : Surface.instance.focusedWindow;
    if (undefined !== window)
      window.dock(dock);

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    let dock = 0;
    for (const c of args[0].toLowerCase()) {
      switch (c) {
        case "l":
          dock |= Dock.Left;
          break;
        case "r":
          dock |= Dock.Right;
          break;
        case "t":
          dock |= Dock.Top;
          break;
        case "b":
          dock |= Dock.Bottom;
          break;
        default:
          return true;
      }
    }

    if (0 !== dock)
      this.run(dock, args[1]);

    return true;
  }
}

export class CloneViewportTool extends Tool {
  public static override toolId = "CloneViewport";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(viewportId?: number): boolean {
    if (undefined === viewportId) {
      const selectedView = IModelApp.viewManager.selectedView;
      if (undefined === selectedView)
        return true;

      viewportId = selectedView.viewportId;
    }

    const surface = DisplayTestApp.surface;
    const viewer = surface.findViewerByViewportId(viewportId);
    if (undefined !== viewer)
      surface.addViewer(viewer.clone());

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const viewportId = parseInt(args[0], 10);
    return undefined !== viewportId && !Number.isNaN(viewportId) && this.run(viewportId);
  }
}

export class OpenIModelTool extends Tool {
  public static override toolId = "OpenIModel";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(filename?: string): boolean {
    Surface.instance.openFile(filename); // eslint-disable-line @typescript-eslint/no-floating-promises
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}

export class CloseIModelTool extends Tool {
  public static override toolId = "CloseIModel";

  public override run(): boolean {
    Surface.instance.closeAllViewers();
    return true;
  }
}

export class ReopenIModelTool extends Tool {
  public static override toolId = "ReopenIModel";

  public override run(): boolean {
    const viewer = Surface.instance.firstViewer;
    if (undefined !== viewer)
      viewer.openFile(viewer.viewport.iModel.key); // eslint-disable-line @typescript-eslint/no-floating-promises

    return true;
  }
}
