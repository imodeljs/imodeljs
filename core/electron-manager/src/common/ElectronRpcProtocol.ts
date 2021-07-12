/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { BentleyStatus } from "@bentley/bentleyjs-core";
import { IModelError, IpcSocket, RpcInterface, RpcInterfaceDefinition, RpcProtocol } from "@bentley/imodeljs-common";
import { ElectronIpcTransport, initializeIpc, IpcTransportMessage } from "./ElectronIpcTransport";
import { ElectronRpcConfiguration } from "./ElectronRpcManager";
import { ElectronRpcRequest } from "./ElectronRpcRequest";

/** RPC interface protocol for an Electron-based application.
 * @beta
 */
export class ElectronRpcProtocol extends RpcProtocol {
  public static instances: Map<string, ElectronRpcProtocol> = new Map();
  public ipcSocket: IpcSocket;

  /** The RPC request class for this protocol. */
  public readonly requestType = ElectronRpcRequest;

  /** Specifies where to break large binary request payloads. */
  public override transferChunkThreshold = 48 * 1024 * 1024;

  /** @internal */
  public requests: Map<string, ElectronRpcRequest> = new Map();

  /** @internal */
  public readonly transport: ElectronIpcTransport<IpcTransportMessage, IpcTransportMessage>;

  /** Constructs an Electron protocol. */
  public constructor(configuration: ElectronRpcConfiguration, ipcSocket: IpcSocket) {
    super(configuration);
    this.ipcSocket = ipcSocket;
    this.transport = initializeIpc(this);
  }

  /** @internal */
  public override onRpcClientInitialized(definition: RpcInterfaceDefinition, _client: RpcInterface): void {
    this.registerInterface(definition);
  }

  /** @internal */
  public override onRpcImplInitialized(definition: RpcInterfaceDefinition, _impl: RpcInterface): void {
    this.registerInterface(definition);
  }

  /** @internal */
  public override onRpcClientTerminated(definition: RpcInterfaceDefinition, _client: RpcInterface): void {
    this.purgeInterface(definition);
  }

  /** @internal */
  public override onRpcImplTerminated(definition: RpcInterfaceDefinition, _impl: RpcInterface): void {
    this.purgeInterface(definition);
  }

  private registerInterface(definition: RpcInterfaceDefinition) {
    if (ElectronRpcProtocol.instances.has(definition.interfaceName))
      throw new IModelError(BentleyStatus.ERROR, `RPC interface "${definition.interfaceName}"" is already associated with a protocol.`);

    ElectronRpcProtocol.instances.set(definition.interfaceName, this);
  }

  private purgeInterface(definition: RpcInterfaceDefinition) {
    ElectronRpcProtocol.instances.delete(definition.interfaceName);
  }
}
