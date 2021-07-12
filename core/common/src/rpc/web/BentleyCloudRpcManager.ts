/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { RpcInterfaceDefinition } from "../../RpcInterface";
import { RpcManager } from "../../RpcManager";
import { RpcConfiguration } from "../core/RpcConfiguration";
import { RpcRequestEvent } from "../core/RpcConstants";
import { RpcRequest, RpcRequestEventHandler } from "../core/RpcRequest";
import { BentleyCloudRpcProtocol } from "./BentleyCloudRpcProtocol";
import { OpenAPIInfo } from "./OpenAPI";
import { RpcRoutingToken } from "../core/RpcRoutingToken";

/** Initialization parameters for BentleyCloudRpcConfiguration.
 * @public
 */
export interface BentleyCloudRpcParams {
  /** Identifies the remote server that implements a set of RpcInterfaces. Note that the ID of the remote server is not a URI or hostname. It is a string that matches a key in the orchestrator's app registry. */
  info: OpenAPIInfo;
  /** The protocol for Bentley cloud RPC interface deployments */
  protocol?: typeof BentleyCloudRpcProtocol;
  /** The URI of the orchestrator that will route requests to the remote RpcInterface server. If not supplied, this default to the origin of the Web page. This is required only when calling initializeClient and only if the server is not the origin of the Web page. */
  uriPrefix?: string;
  /** Handler for RPC request events. */
  pendingRequestListener?: RpcRequestEventHandler;
}

/** Operating parameters for Bentley cloud RPC interface deployments.
 * @public
 */
export abstract class BentleyCloudRpcConfiguration extends RpcConfiguration {
  /** Access-Control header values for backend servers that serve frontends using BentleyCloudRpcProtocol. */
  public static readonly accessControl = {
    allowOrigin: "*",
    allowMethods: "POST, GET, OPTIONS",
    allowHeaders: "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Correlation-Id, X-Session-Id, X-Application-Id, X-Application-Version, X-User-Id, X-Protocol-Version",
  };

  /** The protocol of the configuration. */
  public abstract override readonly protocol: BentleyCloudRpcProtocol;
}

/** Coordinates usage of RPC interfaces for Bentley cloud deployments.
 * @public
 */
export class BentleyCloudRpcManager extends RpcManager {
  /** Initializes BentleyCloudRpcManager for the frontend of an application. */
  public static initializeClient(params: BentleyCloudRpcParams, interfaces: RpcInterfaceDefinition[], routing: RpcRoutingToken = RpcRoutingToken.default): BentleyCloudRpcConfiguration {
    return BentleyCloudRpcManager.performInitialization(params, interfaces, routing);
  }

  /** Initializes BentleyCloudRpcManager for the backend of an application. */
  public static initializeImpl(params: BentleyCloudRpcParams, interfaces: RpcInterfaceDefinition[]): BentleyCloudRpcConfiguration {
    return BentleyCloudRpcManager.performInitialization(params, interfaces);
  }

  private static performInitialization(params: BentleyCloudRpcParams, interfaces: RpcInterfaceDefinition[], routing: RpcRoutingToken = RpcRoutingToken.default): BentleyCloudRpcConfiguration {
    const protocol = class extends (params.protocol || BentleyCloudRpcProtocol) {
      public override pathPrefix = params.uriPrefix || "";
      public info = params.info;
    };

    const config = class extends BentleyCloudRpcConfiguration {
      public interfaces = () => interfaces;
      public protocol: BentleyCloudRpcProtocol = new protocol(this);
      public override routing = routing;
    };

    for (const def of interfaces) {
      RpcConfiguration.assignWithRouting(def, routing, config);
    }

    const instance = RpcConfiguration.obtain(config);
    RpcConfiguration.initializeInterfaces(instance);

    if (params.pendingRequestListener) {
      const listener = params.pendingRequestListener;

      RpcRequest.events.addListener((type, request) => {
        if (type === RpcRequestEvent.PendingUpdateReceived && request.protocol === instance.protocol) {
          listener(type, request);
        }
      });
    }

    return instance;
  }
}
