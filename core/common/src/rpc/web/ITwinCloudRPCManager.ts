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
import { ITwinCloudRpcProtocol } from "./ITwinCloudRpcProtocol";
import { OpenAPIInfo } from "./OpenAPI";
import { RpcRoutingToken } from "../core/RpcRoutingToken";
import { IModelReadRpcInterface, IModelTileRpcInterface } from "../../imodeljs-common";

/** Initialization parameters for ITwinCloudRpcConfiguration.
 * @public
 */
export interface ITwinCloudRpcParams {
  /** Identifies the remote server that implements a set of RpcInterfaces. Note that the ID of the remote server is not a URI or hostname. It is a string that matches a key in the orchestrator's app registry. */
  info: OpenAPIInfo;
  /** The protocol for ITwin cloud RPC interface deployments */
  protocol?: typeof ITwinCloudRpcProtocol;
  /** The URI of the orchestrator that will route requests to the remote RpcInterface server. If not supplied, this default to the origin of the Web page. This is required only when calling initializeClient and only if the server is not the origin of the Web page. */
  apiName: string;
  /** The URI of the orchestrator that will route requests to the remote RpcInterface server. If not supplied, this default to the origin of the Web page. This is required only when calling initializeClient and only if the server is not the origin of the Web page. */
  uriPrefix?: string;
  /** Handler for RPC request events. */
  pendingRequestListener?: RpcRequestEventHandler;
}

/** Operating parameters for ITwin cloud RPC interface deployments.
 * @public
 */
export abstract class ITwinCloudRpcConfiguration extends RpcConfiguration {
  /** Access-Control header values for backend servers that serve frontends using ITwinCloudRpcProtocol. */
  public static readonly accessControl = {
    allowOrigin: "*",
    allowMethods: "POST, GET, OPTIONS",
    allowHeaders: "Content-Type, Accept, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Correlation-Id, X-Session-Id, X-Application-Id, X-Application-Version, X-User-Id, X-Protocol-Version",
  };

  /** The protocol of the configuration. */
  public abstract readonly protocol: ITwinCloudRpcProtocol;
}

/** Coordinates usage of RPC interfaces for ITwin cloud deployments.
 * @public
 */
export class ITwinCloudRpcManager extends RpcManager {
  public static initialize(): ITwinCloudRpcConfiguration {
    const defaultParams: ITwinCloudRpcParams = {
      info: {
        title: "general-purpose-imodeljs-backend",
        version: "v2.0",
      },
      apiName: "visualization",
    };

    const defaultInterfaces: RpcInterfaceDefinition[] = [
      IModelReadRpcInterface,
      IModelTileRpcInterface,
    ];

    return ITwinCloudRpcManager.performInitialization(defaultParams, defaultInterfaces, RpcRoutingToken.default);
  }

  /** Initializes ITwinCloudRpcManager for the frontend of an application. */
  public static initializeClient(params: ITwinCloudRpcParams, interfaces: RpcInterfaceDefinition[], routing: RpcRoutingToken = RpcRoutingToken.default): ITwinCloudRpcConfiguration {
    return ITwinCloudRpcManager.performInitialization(params, interfaces, routing);
  }

  /** Initializes ITwinCloudRpcManager for the backend of an application. */
  public static initializeImpl(params: ITwinCloudRpcParams, interfaces: RpcInterfaceDefinition[]): ITwinCloudRpcConfiguration {
    return ITwinCloudRpcManager.performInitialization(params, interfaces);
  }

  private static performInitialization(params: ITwinCloudRpcParams, interfaces: RpcInterfaceDefinition[], routing: RpcRoutingToken = RpcRoutingToken.default): ITwinCloudRpcConfiguration {
    const protocol = class extends (params.protocol || ITwinCloudRpcProtocol) {
      public pathPrefix = params.uriPrefix || "";
      public info = params.info;
    };

    const config = class extends ITwinCloudRpcConfiguration {
      public interfaces = () => interfaces;
      public protocol: ITwinCloudRpcProtocol = new protocol(this);
      public routing = routing;
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
