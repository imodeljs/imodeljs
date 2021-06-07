/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModelApp
 */

const copyrightNotice = 'Copyright © 2017-2021 <a href="https://www.bentley.com" target="_blank" rel="noopener noreferrer">Bentley Systems, Inc.</a>';

import {
  BeDuration, BentleyStatus, ClientRequestContext, DbResult, dispose, Guid, GuidString, Logger, SerializedClientRequestContext,
} from "@bentley/bentleyjs-core";
import { FrontendAuthorizationClient } from "@bentley/frontend-authorization-client";
import { IModelClient } from "@bentley/imodelhub-client";
import { IModelStatus, RpcConfiguration, RpcInterfaceDefinition, RpcRequest } from "@bentley/imodeljs-common";
import { I18N, I18NOptions } from "@bentley/imodeljs-i18n";
import { IncludePrefix } from "@bentley/itwin-client";
import { ConnectSettingsClient, SettingsAdmin } from "@bentley/product-settings-client";
import { TelemetryManager } from "@bentley/telemetry-client";
import { UiAdmin } from "@bentley/ui-abstract";
import { queryRenderCompatibility, WebGLRenderCompatibilityInfo } from "@bentley/webgl-compatibility";
import { AccuDraw } from "./AccuDraw";
import { AccuSnap } from "./AccuSnap";
import * as auxCoordState from "./AuxCoordSys";
import * as categorySelectorState from "./CategorySelectorState";
import * as displayStyleState from "./DisplayStyleState";
import * as drawingViewState from "./DrawingViewState";
import { ElementLocateManager } from "./ElementLocateManager";
import { EntityState } from "./EntityState";
import { ExtensionAdmin } from "./extension/ExtensionAdmin";
import { FrontendHubAccess, IModelHubFrontend } from "./FrontendHubAccess";
import { FrontendLoggerCategory } from "./FrontendLoggerCategory";
import { FrontendRequestContext } from "./FrontendRequestContext";
import * as modelselector from "./ModelSelectorState";
import * as modelState from "./ModelState";
import { NotificationManager } from "./NotificationManager";
import { QuantityFormatter } from "./quantity-formatting/QuantityFormatter";
import { RenderSystem } from "./render/RenderSystem";
import { System } from "./render/webgl/System";
import * as sheetState from "./SheetViewState";
import * as spatialViewState from "./SpatialViewState";
import { TentativePoint } from "./TentativePoint";
import { MapLayerFormatRegistry, MapLayerOptions, TileAdmin } from "./tile/internal";
import * as accudrawTool from "./tools/AccuDrawTool";
import * as clipViewTool from "./tools/ClipViewTool";
import * as extensionTool from "./tools/ExtensionTool";
import * as idleTool from "./tools/IdleTool";
import * as measureTool from "./tools/MeasureTool";
import * as selectTool from "./tools/SelectTool";
import { ToolRegistry } from "./tools/Tool";
import { ToolAdmin } from "./tools/ToolAdmin";
import * as viewTool from "./tools/ViewTool";
import { ViewManager } from "./ViewManager";
import * as viewState from "./ViewState";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("./IModeljs-css");

// cSpell:ignore noopener noreferrer gprid forin nbsp csrf xsrf

/** Options that can be supplied with [[IModelAppOptions]] to customize frontend security.
 * @public
 */
export interface FrontendSecurityOptions {
  /** Configures protection from Cross Site Request Forgery attacks. */
  readonly csrfProtection?: {
    /** If enabled, IModelApp will extract the CSRF token for the current session from the document's cookies and send it with each request as a header value. */
    readonly enabled: boolean;
    /** Defaults to XSRF-TOKEN. */
    readonly cookieName?: string;
    /** Defaults to X-XSRF-TOKEN. */
    readonly headerName?: string;
  };
}

/** Options that can be supplied to [[IModelApp.startup]] to customize frontend behavior.
 * @public
 */
export interface IModelAppOptions {
  /** If present, supplies the [[IModelClient]] for this session. */
  imodelClient?: IModelClient;
  /** If present, supplies the Id of this application. Applications must set this to the Bentley Global Product Registry Id (GPRID) for usage logging. */
  applicationId?: string;
  /** If present, supplies the version of this application. Must be set for usage logging. */
  applicationVersion?: string;
  /** If present, supplies the [[SettingsAdmin]] for this session. */
  settings?: SettingsAdmin;
  /** If present, supplies the [[ViewManager]] for this session. */
  viewManager?: ViewManager;
  /** If present, supplies Map Layer Options for this session such as Azure Access Keys
   * @beta
  */
  mapLayerOptions?: MapLayerOptions;
  /** If present, supplies the properties with which to initialize the [[TileAdmin]] for this session. */
  tileAdmin?: TileAdmin.Props;
  /** If present, supplies the [[NotificationManager]] for this session. */
  notifications?: NotificationManager;
  /** If present, supplies the [[ToolAdmin]] for this session. */
  toolAdmin?: ToolAdmin;
  /** If present, supplies the [[AccuDraw]] for this session.
   * @internal
   */
  accuDraw?: AccuDraw;
  /** If present, supplies the [[AccuSnap]] for this session. */
  accuSnap?: AccuSnap;
  /** If present, supplies the [[I18N]] for this session. May be either an I18N instance or an I18NOptions used to create an I18N */
  i18n?: I18N | I18NOptions;
  /** If present, supplies the authorization information for various frontend APIs */
  authorizationClient?: FrontendAuthorizationClient;
  /** If present, supplies security options for the frontend. */
  security?: FrontendSecurityOptions;
  /** @internal */
  sessionId?: GuidString;
  /** @internal */
  locateManager?: ElementLocateManager;
  /** @internal */
  tentativePoint?: TentativePoint;
  /** @internal */
  quantityFormatter?: QuantityFormatter;
  /** @internal */
  renderSys?: RenderSystem | RenderSystem.Options;
  /** If present, supplies the [[ExtensionAdmin]] for this session.
   * @beta
   */
  extensionAdmin?: ExtensionAdmin;
  /** If present, supplies the [[UiAdmin]] for this session. */
  uiAdmin?: UiAdmin;
  rpcInterfaces?: RpcInterfaceDefinition[];
}

/** Options for [[IModelApp.makeModalDiv]]
 *  @internal
 */
export interface ModalOptions {
  /** Width for the Modal dialog box. */
  width?: number;
  /** The dialog should be dismissed if the user clicks anywhere or hits Enter or Escape on the keyboard. */
  autoClose?: boolean;
  /** Show an 'x' in the upper right corner to close the dialog */
  closeBox?: boolean;
  /** The parent for the semi transparent *darkening* div. If not present, use `document.body` */
  rootDiv?: HTMLElement;
}

/** Return type for [[IModelApp.makeModalDiv]]
 * @internal
 */
export interface ModalReturn {
  /** The modal HTMLDivElement created. */
  modal: HTMLDivElement;
  /** A function that can be set as an event handler to stop the modal dialog. This can be used if `autoClose` or `closeBox` are not enabled. */
  stop: (_ev: Event) => void;
}

/** We hang the IModelApp object off the global `window` object in IModelApp.startup for debugging purposes.
 * It's removed in IModelApp.shutdown.
 */
interface IModelAppForDebugger {
  iModelAppForDebugger?: typeof IModelApp;
}

/**
 * Global singleton that connects the user interface with the iModel.js services. There can be only one IModelApp active in a session. All
 * members of IModelApp are static, and it serves as a singleton object for gaining access to session information.
 *
 * Before any interactive operations may be performed by the `@bentley/imodeljs-frontend package`, [[IModelApp.startup]] must be called.
 * Applications may customize the frontend behavior of iModel.js by supplying options to [[IModelApp.startup]].
 *
 * @public
 */
export class IModelApp {
  private static _initialized = false;
  private static _accuDraw: AccuDraw;
  private static _accuSnap: AccuSnap;
  private static _applicationId: string;
  private static _applicationVersion: string;
  private static _i18n: I18N;
  private static _locateManager: ElementLocateManager;
  private static _notifications: NotificationManager;
  private static _extensionAdmin: ExtensionAdmin;
  private static _quantityFormatter: QuantityFormatter;
  private static _renderSystem?: RenderSystem;
  private static _settings: SettingsAdmin;
  private static _tentativePoint: TentativePoint;
  private static _tileAdmin: TileAdmin;
  private static _toolAdmin: ToolAdmin;
  private static _viewManager: ViewManager;
  private static _uiAdmin: UiAdmin;
  private static _wantEventLoop = false;
  private static _animationRequested = false;
  private static _animationInterval: BeDuration | undefined = BeDuration.fromSeconds(1);
  private static _animationIntervalId?: number;
  private static _securityOptions: FrontendSecurityOptions;
  private static _mapLayerFormatRegistry: MapLayerFormatRegistry;
  private static _hubAccess: FrontendHubAccess;

  // No instances of IModelApp may be created. All members are static and must be on the singleton object IModelApp.
  protected constructor() { }

  /** Provides authorization information for various frontend APIs */
  public static authorizationClient?: FrontendAuthorizationClient;
  /** The [[ToolRegistry]] for this session. */
  public static readonly tools = new ToolRegistry();
  /** A uniqueId for this session */
  public static sessionId: GuidString;
  /** The [[MapLayerProviderRegistry]] for this session.
   * @internal
   */
  public static get mapLayerFormatRegistry(): MapLayerFormatRegistry { return this._mapLayerFormatRegistry; }
  /** The [[RenderSystem]] for this session. */
  public static get renderSystem(): RenderSystem { return this._renderSystem!; }
  /** The [[ViewManager]] for this session. */
  public static get viewManager(): ViewManager { return this._viewManager; }

  /** The [[NotificationManager]] for this session. */
  public static get notifications(): NotificationManager { return this._notifications; }
  /** The [[TileAdmin]] for this session. */
  public static get tileAdmin(): TileAdmin { return this._tileAdmin; }
  /** The [[QuantityFormatter]] for this session.
   * @alpha
   */
  public static get quantityFormatter(): QuantityFormatter { return this._quantityFormatter; }
  /** The [[ToolAdmin]] for this session. */
  public static get toolAdmin(): ToolAdmin { return this._toolAdmin; }
  /** The [[AccuDraw]] for this session.
   * @internal
   */
  public static get accuDraw(): AccuDraw { return this._accuDraw; }
  /** The [[AccuSnap]] for this session. */
  public static get accuSnap(): AccuSnap { return this._accuSnap; }
  /** @internal */
  public static get locateManager(): ElementLocateManager { return this._locateManager; }
  /** @internal */
  public static get tentativePoint(): TentativePoint { return this._tentativePoint; }
  /** The [[I18N]] for this session. */
  public static get i18n(): I18N { return this._i18n; }
  /** The [[SettingsAdmin]] for this session. */
  public static get settings(): SettingsAdmin { return this._settings; }
  /** The Id of this application. Applications must set this to the Global Product Registry ID (GPRID) for usage logging. */
  public static get applicationId(): string { return this._applicationId; }
  /** The version of this application. Must be set for usage logging. */
  public static get applicationVersion(): string { return this._applicationVersion; }
  /** @internal */
  public static get initialized() { return this._initialized; }

  /**
   * @deprecated access to IModelHub should generally be through the higher level apis.
   * For internal methods, use [[hubAccess]].
   * If you really need to call the IModelClient api directly, use [[IModelHubFrontend.iModelClient]]
   */
  public static get iModelClient(): IModelClient { return IModelHubFrontend.iModelClient; }

  /** Provides access to the IModelHub implementation for this IModelApp.
   * @internal
   */
  public static get hubAccess(): FrontendHubAccess { return this._hubAccess; }

  /** @internal */
  public static get hasRenderSystem() { return this._renderSystem !== undefined && this._renderSystem.isValid; }
  /** The [[ExtensionAdmin]] for this session.
   * @beta
   */
  public static get extensionAdmin() { return this._extensionAdmin; }
  /** The [[UiAdmin]] for this session. */
  public static get uiAdmin() { return this._uiAdmin; }
  /** The requested security options for the frontend. */
  public static get securityOptions() { return this._securityOptions; }
  /** The [[TelemetryManager]] for this session
   * @internal
   */
  public static readonly telemetry: TelemetryManager = new TelemetryManager();

  /** Map of classFullName to EntityState class */
  private static _entityClasses = new Map<string, typeof EntityState>();

  /** Register all of the subclasses of EntityState from a module.
   * @internal
   */
  public static registerModuleEntities(moduleObj: any) {
    for (const thisMember in moduleObj) { // eslint-disable-line guard-for-in
      const thisEntityState = moduleObj[thisMember];
      if (thisEntityState.prototype instanceof EntityState) {
        this.registerEntityState(thisEntityState.classFullName, thisEntityState);
      }
    }
  }

  /** Register an EntityState class by its classFullName
   * @internal
   */
  public static registerEntityState(classFullName: string, classType: typeof EntityState) {
    const lowerName = classFullName.toLowerCase();
    if (this._entityClasses.has(lowerName)) {
      const errMsg = `Class ${classFullName} is already registered. Make sure static schemaName and className members are correct on class ${classType.name}`;
      Logger.logError(FrontendLoggerCategory.IModelConnection, errMsg);
      throw new Error(errMsg);
    }

    this._entityClasses.set(lowerName, classType);
  }

  /** @internal */
  public static lookupEntityClass(classFullName: string) { return this._entityClasses.get(classFullName.toLowerCase()); }

  /**
   * Obtain WebGL rendering compatibility information for the client system.  This information describes whether the client meets the
   * minimum rendering capabilities.  It also describes whether the system lacks any optional capabilities that could improve quality
   * and/or performance.
   */
  public static queryRenderCompatibility(): WebGLRenderCompatibilityInfo {
    if (undefined === System.instance || undefined === System.instance.options.useWebGL2)
      return queryRenderCompatibility(true, System.createContext);
    else
      return queryRenderCompatibility(System.instance.options.useWebGL2, System.createContext);
  }

  /**
   * This method must be called before any iModel.js frontend services are used.
   * In your code, somewhere before you use any iModel.js services, call [[IModelApp.startup]]. E.g.:
   * ``` ts
   * IModelApp.startup( {applicationId: myAppId, i18n: myi18Opts} );
   * ```
   * @param opts The options for configuring IModelApp
   */
  public static async startup(opts?: IModelAppOptions): Promise<void> {
    if (this._initialized)
      return; // we're already initialized, do nothing.
    this._initialized = true;

    // Setup a current context for all requests that originate from this frontend
    const requestContext = new FrontendRequestContext();
    requestContext.enter();

    opts = opts ?? {};
    this._securityOptions = opts.security || {};

    // Make IModelApp globally accessible for debugging purposes. We'll remove it on shutdown.
    (window as IModelAppForDebugger).iModelAppForDebugger = this;

    // Initialize basic application details before log messages are sent out
    this.sessionId = (opts.sessionId !== undefined) ? opts.sessionId : Guid.createValue();
    this._applicationId = (opts.applicationId !== undefined) ? opts.applicationId : "2686";  // Default to product id of iModel.js
    this._applicationVersion = (opts.applicationVersion !== undefined) ? opts.applicationVersion : "1.0.0";
    this.authorizationClient = opts.authorizationClient;

    this._hubAccess = IModelHubFrontend;
    IModelHubFrontend.setIModelClient(opts.imodelClient);

    this._setupRpcRequestContext();

    // get the localization system set up so registering tools works. At startup, the only namespace is the system namespace.
    this._i18n = (opts.i18n instanceof I18N) ? opts.i18n : new I18N("iModelJs", opts.i18n);

    // first register all the core tools. Subclasses may choose to override them.
    const coreNamespace = this.i18n.registerNamespace("CoreTools");
    [
      selectTool,
      idleTool,
      viewTool,
      clipViewTool,
      measureTool,
      accudrawTool,
      extensionTool,
    ].forEach((tool) => this.tools.registerModule(tool, coreNamespace));

    this.registerEntityState(EntityState.classFullName, EntityState);
    [
      modelState,
      sheetState,
      viewState,
      drawingViewState,
      spatialViewState,
      displayStyleState,
      modelselector,
      categorySelectorState,
      auxCoordState,
    ].forEach((module) => this.registerModuleEntities(module));

    const defaultMapLayerOptions: MapLayerOptions = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      MapboxImagery: { key: "access_token", value: "pk%2EeyJ1IjoibWFwYm94YmVudGxleSIsImEiOiJjaWZvN2xpcW00ZWN2czZrcXdreGg2eTJ0In0%2Ef7c9GAxz6j10kZvL%5F2DBHg" },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      BingMaps: { key: "key", value: "AtaeI3QDNG7Bpv1L53cSfDBgBKXIgLq3q-xmn_Y2UyzvF-68rdVxwAuje49syGZt" },
    };
    if (opts.mapLayerOptions) {
      // if we were passed maplayeroptions, fill in any gaps with defaultMapLayerOptions
      for (const key of Object.keys(defaultMapLayerOptions)) {
        if (opts.mapLayerOptions[key])
          continue;
        opts.mapLayerOptions[key] = defaultMapLayerOptions[key];
      }
    } else {
      opts.mapLayerOptions = defaultMapLayerOptions;
    }

    this._renderSystem = (opts.renderSys instanceof RenderSystem) ? opts.renderSys : this.createRenderSys(opts.renderSys);

    this._settings = (opts.settings !== undefined) ? opts.settings : new ConnectSettingsClient(this.applicationId);
    this._viewManager = (opts.viewManager !== undefined) ? opts.viewManager : new ViewManager();
    this._tileAdmin = await TileAdmin.create(opts.tileAdmin);
    this._notifications = (opts.notifications !== undefined) ? opts.notifications : new NotificationManager();
    this._toolAdmin = (opts.toolAdmin !== undefined) ? opts.toolAdmin : new ToolAdmin();
    this._accuDraw = (opts.accuDraw !== undefined) ? opts.accuDraw : new AccuDraw();
    this._accuSnap = (opts.accuSnap !== undefined) ? opts.accuSnap : new AccuSnap();
    this._locateManager = (opts.locateManager !== undefined) ? opts.locateManager : new ElementLocateManager();
    this._tentativePoint = (opts.tentativePoint !== undefined) ? opts.tentativePoint : new TentativePoint();
    this._extensionAdmin = (opts.extensionAdmin !== undefined) ? opts.extensionAdmin : new ExtensionAdmin({});
    this._quantityFormatter = (opts.quantityFormatter !== undefined) ? opts.quantityFormatter : new QuantityFormatter();
    this._uiAdmin = (opts.uiAdmin !== undefined) ? opts.uiAdmin : new UiAdmin();
    this._mapLayerFormatRegistry = new MapLayerFormatRegistry(opts.mapLayerOptions);

    [
      this.renderSystem,
      this.viewManager,
      this.toolAdmin,
      this.accuDraw,
      this.accuSnap,
      this.locateManager,
      this.tentativePoint,
      this.extensionAdmin,
      this.uiAdmin,
    ].forEach((sys) => {
      if (sys)
        sys.onInitialized();
    });

    // process async onInitialized methods
    await this.quantityFormatter.onInitialized();
  }

  /** Must be called before the application exits to release any held resources. */
  public static async shutdown() {
    if (!this._initialized)
      return;

    (window as IModelAppForDebugger).iModelAppForDebugger = undefined;

    this._wantEventLoop = false;
    window.removeEventListener("resize", IModelApp.requestNextAnimation);
    this.clearIntervalAnimation();
    [this.toolAdmin, this.viewManager, this.tileAdmin].forEach((sys) => sys.onShutDown());
    this._renderSystem = dispose(this._renderSystem);
    this._entityClasses.clear();
    this.authorizationClient = undefined;
    this._initialized = false;
  }

  /** Controls how frequently the application polls for changes that may require a new animation frame to be requested.
   * Such changes include resizing a Viewport or changing the device pixel ratio by zooming in or out in the browser.
   * The default interval is 1 second. It may be desirable to override the default for specific apps and/or devices.
   *  - Increasing the interval can conserve battery life on battery-powered devices at the expense of slower response to resize events.
   *  - An application that only displays a single Viewport whose dimensions only change when the dimensions of the application window change, and which does not support changing application zoom level, could disable the interval altogether.
   * @param interval The interval at which to poll for changes. If undefined (or negative), the application will never poll. If zero, the application will poll as frequently as possible.
   * @beta
   */
  public static get animationInterval(): BeDuration | undefined { return IModelApp._animationInterval; }
  public static set animationInterval(interval: BeDuration | undefined) {
    if (undefined !== interval && interval.isTowardsPast)
      interval = undefined;

    if (interval !== IModelApp._animationInterval) {
      IModelApp._animationInterval = interval;
      if (IModelApp._wantEventLoop)
        IModelApp.requestIntervalAnimation();
    }
  }

  /** @internal */
  public static requestNextAnimation() {
    if (!IModelApp._animationRequested) {
      IModelApp._animationRequested = true;
      requestAnimationFrame(IModelApp.eventLoop);
    }
  }

  /** @internal */
  private static clearIntervalAnimation(): void {
    if (undefined !== IModelApp._animationIntervalId) {
      window.clearInterval(IModelApp._animationIntervalId);
      IModelApp._animationIntervalId = undefined;
    }
  }

  /** @internal */
  private static requestIntervalAnimation(): void {
    IModelApp.clearIntervalAnimation();

    if (undefined !== IModelApp.animationInterval)
      IModelApp._animationIntervalId = window.setInterval(() => {
        IModelApp.requestNextAnimation();
      }, IModelApp.animationInterval.milliseconds);
  }

  /** @internal */
  public static startEventLoop() {
    if (!IModelApp._wantEventLoop) {
      IModelApp._wantEventLoop = true;
      window.addEventListener("resize", IModelApp.requestNextAnimation);
      IModelApp.requestIntervalAnimation();
      IModelApp.requestNextAnimation();
    }
  }

  /** Strictly for tests. @internal */
  public static stopEventLoop() {
    this._wantEventLoop = false;
  }

  /** The main event processing loop for Tools and rendering. */
  private static eventLoop() {
    IModelApp._animationRequested = false;
    if (!IModelApp._wantEventLoop) // flag turned on at startup
      return;

    try {
      IModelApp.toolAdmin.processEvent(); // eslint-disable-line @typescript-eslint/no-floating-promises
      IModelApp.viewManager.renderLoop();
      IModelApp.tileAdmin.process();
    } catch (exception) {
      ToolAdmin.exceptionHandler(exception); // eslint-disable-line @typescript-eslint/no-floating-promises

      IModelApp._wantEventLoop = false;
      IModelApp._animationRequested = true; // unrecoverable after exception, don't request any further frames.
      window.removeEventListener("resize", IModelApp.requestNextAnimation);
    }
  }

  /** @internal */
  public static createRenderSys(opts?: RenderSystem.Options): RenderSystem { return System.create(opts); }

  private static _setupRpcRequestContext() {
    RpcConfiguration.requestContext.getId = (_request: RpcRequest): string => {
      const id = ClientRequestContext.current.useContextForRpc ? ClientRequestContext.current.activityId : Guid.createValue(); // Use any context explicitly set for an RPC call if possible
      ClientRequestContext.current.useContextForRpc = false; // Reset flag so it doesn't get used inadvertently for next RPC call
      return id;
    };

    RpcConfiguration.requestContext.serialize = async (_request: RpcRequest): Promise<SerializedClientRequestContext> => {
      const id = _request.id;
      let authorization: string | undefined;
      let userId: string | undefined;
      if (IModelApp.authorizationClient?.hasSignedIn) {
        // todo: need to subscribe to token change events to avoid getting the string equivalent and compute length
        try {
          const accessToken = await IModelApp.authorizationClient.getAccessToken();
          authorization = accessToken.toTokenString(IncludePrefix.Yes);
          const userInfo = accessToken.getUserInfo();
          if (userInfo)
            userId = userInfo.id;
        } catch (err) {
          // The application may go offline
        }
      }
      const serialized: SerializedClientRequestContext = {
        id,
        applicationId: this.applicationId,
        applicationVersion: this.applicationVersion,
        sessionId: this.sessionId,
        authorization,
        userId,
      };

      const csrf = IModelApp.securityOptions.csrfProtection;
      if (csrf && csrf.enabled) {
        const cookieName = csrf.cookieName || "XSRF-TOKEN";
        const cookieValue = document.cookie.split("; ").find((r) => r.startsWith(`${cookieName}=`));

        if (cookieValue) {
          const headerName = csrf.headerName || "X-XSRF-TOKEN";
          const headerValue = cookieValue.split("=")[1];
          serialized.csrfToken = { headerName, headerValue };
        }
      }

      return serialized;
    };
  }

  /** Shortcut for creating an HTMLElement with optional parent, className, id, innerHTML, innerText
   *  @internal
   */
  public static makeHTMLElement<K extends keyof HTMLElementTagNameMap>(type: K, opt?: {
    /** The parent for the new HTMLElement */
    parent?: HTMLElement;
    /** The className for the new HTMLElement */
    className?: string;
    /** The Id for the new HTMLElement */
    id?: string;
    /** innerHTML for the new HTMLElement */
    innerHTML?: string;
    /** innerText for the new HTMLElement */
    innerText?: string;
  }) {
    const el = document.createElement(type);
    if (undefined !== opt) {
      if (undefined !== opt.className)
        el.className = opt.className;
      if (undefined !== opt.id)
        el.id = opt.id;
      if (undefined !== opt.innerHTML)
        el.innerHTML = opt.innerHTML;
      if (undefined !== opt.innerText)
        el.innerText = opt.innerText;
      if (undefined !== opt.parent)
        opt.parent.appendChild(el);
    }
    return el;
  }

  /** Make a modal dialog on top of the root of the application. The returned HTMLDivElement will be placed topmost, all other application
   * windows will be covered with a semi-transparent background that intercepts all key/mouse/touch events until the modal is dismissed.
   * @param options The options that describe how the modal should work.
   * @internal
   */
  public static makeModalDiv(options: ModalOptions): ModalReturn {
    const root = options.rootDiv ? options.rootDiv : document.body;
    // create the overlay div to "black out" the application to indicate everything is inactive until the modal has been dismissed.
    const overlay = IModelApp.makeHTMLElement("div", { parent: root, className: "imodeljs-modal-overlay" });
    overlay.tabIndex = -1; // so we can catch keystroke events

    // function to remove modal dialog
    const stop = (ev: Event) => { root.removeChild(overlay); ev.stopPropagation(); };

    if (options.autoClose) {
      overlay.onclick = overlay.oncontextmenu = stop;
      overlay.onkeydown = overlay.onkeyup = (ev: KeyboardEvent) => { // ignore all keystrokes other than enter and escape
        switch (ev.key) {
          case "Enter":
          case "Escape":
            stop(ev);
            return;
        }
        ev.stopPropagation();
      };
      overlay.focus();
    }

    const modal = IModelApp.makeHTMLElement("div", { parent: overlay, className: "imodeljs-modal" });
    if (undefined !== options.width) {
      modal.style.width = `${options.width}px`;
      // allow the dialog to be smaller than the width
      modal.style.maxWidth = `min(100% - (2 * var(--width-border)), ${options.width}px)`;
    }
    if (options.closeBox) {
      const close = IModelApp.makeHTMLElement("p", { parent: modal, className: "imodeljs-modal-close" });
      close.innerText = "\u00d7"; // unicode "times" symbol
      close.onclick = stop;
    }

    return { modal, stop };
  }

  /** Applications may implement this method to supply a Logo Card.
   * @beta
   */
  public static applicationLogoCard?: () => HTMLTableRowElement;

  /** Make a new Logo Card. Call this method from your implementation of [[IModelApp.applicationLogoCard]]
   * @param opts Options for Logo Card
   * @beta
   */
  public static makeLogoCard(
    opts: {
      /** The heading to be put at the top of this logo card inside an <h2>. May include HTML. */
      heading: string | HTMLElement;
      /** The URL or HTMLImageElement for the icon on this logo card. */
      iconSrc?: string | HTMLImageElement;
      /** The width of the icon, if `iconSrc` is a string. Default is 64. */
      iconWidth?: number;
      /** A *notice* string to be shown on the logo card. May include HTML.  */
      notice?: string | HTMLElement;
    }): HTMLTableRowElement {
    const card = IModelApp.makeHTMLElement("tr");
    const iconCell = IModelApp.makeHTMLElement("td", { parent: card, className: "logo-card-logo" });
    if (undefined !== opts.iconSrc) {
      if (typeof opts.iconSrc === "string") {
        const logo = IModelApp.makeHTMLElement("img");
        logo.src = opts.iconSrc;
        logo.width = opts.iconWidth ? opts.iconWidth : 64;
        opts.iconSrc = logo;
      }
      iconCell.appendChild(opts.iconSrc);
    }
    const noticeCell = IModelApp.makeHTMLElement("td", { parent: card, className: "logo-card-message" });
    if (undefined !== opts.heading) {
      if (typeof opts.heading === "string")
        IModelApp.makeHTMLElement("h2", { parent: noticeCell, innerHTML: opts.heading });
      else
        noticeCell.appendChild(opts.heading);
    }
    if (undefined !== opts.notice) {
      if (typeof opts.notice === "string")
        IModelApp.makeHTMLElement("p", { parent: noticeCell, innerHTML: opts.notice });
      else
        noticeCell.appendChild(opts.notice);
    }
    return card;
  }

  /** Make the logo card for the iModel.js library itself. This card gets placed at the top of the stack.
   *  @internal
   */
  public static makeIModelJsLogoCard() {
    return this.makeLogoCard({
      iconSrc: "images/about-imodeljs.svg",
      heading: `<span style="font-weight:normal">${this.i18n.translate("Notices.PoweredBy")}</span>&nbsp;iModel.js`,
      notice: `${require("../package.json").version}<br>${copyrightNotice}`, // eslint-disable-line @typescript-eslint/no-var-requires
    });
  }

  /** Format the tooltip strings returned by [[IModelConnection.getToolTipMessage]].
   * @alpha
   */
  public static formatElementToolTip(msg: string[]): HTMLElement {
    let out = "";
    msg.forEach((line) => out += `${IModelApp.i18n.translateKeys(line)}<br>`);
    const div = document.createElement("div");
    div.innerHTML = out;
    return div;
  }

  /** Localize an error status from iModel.js
   * @param status one of the status values from [[BentleyStatus]], [[IModelStatus]] or [[DbResult]]
   * @returns a localized error message
   * @beta
   */
  public static translateStatus(status: number) {
    let key: { scope: string, val: string, status?: string };
    if (typeof status !== "number") {
      key = { scope: "Errors", val: "IllegalValue" };
    } else {
      key = { scope: "BentleyStatus", val: BentleyStatus[status] };
      if (!key.val)
        key = { scope: "IModelStatus", val: IModelStatus[status] };
      if (!key.val)
        key = { scope: "DbResult", val: DbResult[status] };
      if (!key.val)
        key = { scope: "Errors", val: "Status", status: status.toString() };
    }

    return this.i18n.translate(`${key.scope}.${key.val}`, key);
  }
}
