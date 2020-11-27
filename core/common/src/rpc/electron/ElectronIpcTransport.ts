/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { BentleyStatus, isElectronRenderer } from "@bentley/bentleyjs-core";
import { IModelError } from "../../IModelError";
import { RpcSerializedValue } from "../core/RpcMarshaling";
import { RpcRequestFulfillment, SerializedRpcRequest } from "../core/RpcProtocol";
import { ElectronRpcProtocol } from "./ElectronRpcProtocol";
import { ElectronRpcRequest } from "./ElectronRpcRequest";
import { ElectronRpcConfiguration, IModelElectronIpc } from "./ElectronRpcManager";
import { RpcPushChannel, RpcPushConnection } from "../core/RpcPush";
import { ElectronPushConnection, ElectronPushTransport } from "./ElectronPush";

const OBJECTS_CHANNEL = "imodeljs.rpc.objects";
const DATA_CHANNEL = "imodeljs.rpc.data";

interface PartialPayload { id: string, index: number, data: Uint8Array }

/** @internal */
export interface IpcTransportMessage { id: string, parameters?: RpcSerializedValue, result?: RpcSerializedValue }

/** @internal */
export abstract class ElectronIpcTransport<TIn extends IpcTransportMessage = IpcTransportMessage, TOut extends IpcTransportMessage = IpcTransportMessage> {
  private _ipc: IModelElectronIpc;
  private _partials: Map<string, { message: TIn, received: number } | PartialPayload[]>;
  protected _protocol: ElectronRpcProtocol;

  public get protocol() { return this._protocol; }

  public sendRequest(request: SerializedRpcRequest) {
    const value = this._extractValue(request);
    this._send(request, value);
  }

  public constructor(ipc: IModelElectronIpc, protocol: ElectronRpcProtocol) {
    this._ipc = ipc;
    this._protocol = protocol;
    this._partials = new Map();
    this._setupDataChannel();
    this._setupObjectsChannel();
    this.setupPush();
  }

  protected setupPush() { }

  private _setupDataChannel() {
    this._ipc.on(DATA_CHANNEL, async (evt: any, chunk: PartialPayload) => {
      let pending = this._partials.get(chunk.id);
      if (!pending) {
        pending = [];
        this._partials.set(chunk.id, pending);
      }

      if (Array.isArray(pending)) {
        pending.push(chunk);
      } else {
        ++pending.received;

        const value = this._extractValue(pending.message);
        value.data[chunk.index] = chunk.data;

        if (pending.received === (value.chunks || 0)) {
          this.handleComplete(pending.message.id, evt);
        }
      }
    });
  }

  private _setupObjectsChannel() {
    this._ipc.on(OBJECTS_CHANNEL, async (evt: any, message: TIn) => {
      const pending = this._partials.get(message.id);
      if (pending && !Array.isArray(pending)) {
        throw new IModelError(BentleyStatus.ERROR, `Message already received for id "${message.id}".`);
      }

      const partial = { message, received: 0 };
      this._partials.set(message.id, partial);
      const value = this._extractValue(partial.message);

      if (pending && Array.isArray(pending)) {
        for (const chunk of pending) {
          ++partial.received;
          value.data[chunk.index] = chunk.data;
        }
      }

      if (partial.received === (value.chunks || 0)) {
        this.handleComplete(message.id, evt);
      }
    });
  }

  private _extractValue(t: IpcTransportMessage): RpcSerializedValue {
    if (t.parameters) {
      return t.parameters;
    }

    if (t.result) {
      return t.result;
    }

    throw new IModelError(BentleyStatus.ERROR, "Unknown value type.");
  }

  private _send(message: IpcTransportMessage, value: RpcSerializedValue, evt?: any) {
    const chunks = value.data;
    if (chunks.length) {
      value.chunks = chunks.length;
      value.data = [];
    }

    this.performSend(OBJECTS_CHANNEL, message, evt);

    for (let index = 0; index !== chunks.length; ++index) {
      const chunk: PartialPayload = { id: message.id, index, data: chunks[index] };
      this.performSend(DATA_CHANNEL, chunk, evt);
    }
  }

  protected performSend(channel: string, message: any, evt: any) {
    (evt ? evt.sender : this._ipc).send(channel, message);
  }

  protected abstract handleComplete(id: string, evt: any): void;

  /** @internal */
  public sendResponse(message: TOut, evt: any) {
    const value = this._extractValue(message);
    this._send(message, value, evt);
  }

  protected loadMessage(id: string) {
    const partial = this._partials.get(id);
    if (!partial || Array.isArray(partial)) {
      throw new IModelError(BentleyStatus.ERROR, `Incomplete transmission for id "${id}".`);
    }

    this._partials.delete(id);
    return partial.message;
  }
}

/** @internal */
export class FrontendIpcTransport extends ElectronIpcTransport<RpcRequestFulfillment> {
  private _pushTransport?: ElectronPushTransport;

  protected setupPush() {
    const pushTransport = new ElectronPushTransport(this);
    this._pushTransport = pushTransport;
    RpcPushChannel.setup(pushTransport);
  }

  protected async handleComplete(id: string) {
    const message = this.loadMessage(id);

    if (this._pushTransport && this._pushTransport.consume(message)) {
      return;
    }

    const protocol = this._protocol;
    const request = protocol.requests.get(message.id) as ElectronRpcRequest;
    request.notifyResponse(message);
  }
}

/** @internal */
export class BackendIpcTransport extends ElectronIpcTransport<SerializedRpcRequest, RpcRequestFulfillment> {
  private _browserWindow: any;

  protected setupPush() {
    RpcPushConnection.for = (channel, client) => new ElectronPushConnection(channel, client, this);
    RpcPushChannel.enabled = true;
  }

  protected async handleComplete(id: string, evt: any) {
    const message = this.loadMessage(id);

    let response: RpcRequestFulfillment;
    try {
      const protocol = this._protocol;
      response = await protocol.fulfill(message);
    } catch (err) {
      response = await RpcRequestFulfillment.forUnknownError(message, err);
    }

    const raw = response.rawResult;
    response.rawResult = undefined; // Otherwise, it will be serialized in IPC layer and large responses will then crash the app
    this.sendResponse(response, evt);
    response.rawResult = raw;
  }

  protected performSend(channel: string, message: any, evt: any) {
    if (evt) {
      return super.performSend(channel, message, evt);
    }

    this._requireBrowserWindow();
    const target = ElectronRpcConfiguration.targetWindowId;
    const windows = target ? [this._browserWindow.fromId(target)] : this._browserWindow.getAllWindows();
    windows.forEach((window: any) => window.webContents.send(channel, message));
  }

  private _requireBrowserWindow() {
    if (this._browserWindow) {
      return;
    }

    try { // Wrapping require in a try/catch signals to webpack that this is only an optional dependency
      this._browserWindow = require("electron").BrowserWindow; // eslint-disable-line @typescript-eslint/no-var-requires
    } catch (err) {
      throw new IModelError(BentleyStatus.ERROR, `Error requiring electron`, undefined, undefined, () => err);
    }
  }
}

let transport: ElectronIpcTransport | undefined;

/** @internal */
export function initializeIpc(protocol: ElectronRpcProtocol) {
  if (transport)
    throw new IModelError(BentleyStatus.ERROR, `Electron IPC already initialized.`);

  try { // Wrapping require in a try/catch signals to webpack that this is only an optional dependency
    if (isElectronRenderer) {

      // If we're running with nodeIntegration=false, ElectronPreload.ts defines `window.imodeljs_api` and require() won't work.
      // If we're running with nodeIntegration=true (e.g. from tests), ElectronPreload won't have run, just use ipcRenderer.

      const electronIpc = (window as any).imodeljs_api ?? require("electron").ipcRenderer; // eslint-disable-line @typescript-eslint/no-var-requires
      transport = new FrontendIpcTransport(electronIpc, protocol);
    } else {
      transport = new BackendIpcTransport(require("electron").ipcMain, protocol); // eslint-disable-line @typescript-eslint/no-var-requires
    }
  } catch (_err) {
    throw new IModelError(BentleyStatus.ERROR, `cannot load electron`);
  }

  return transport;
}
