/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { Readable, Writable } from "stream";
import { RpcConfiguration } from "../core/RpcConfiguration";
import { RpcContentType, RpcRequestStatus, WEB_RPC_CONSTANTS } from "../core/RpcConstants";
import { RpcOperation } from "../core/RpcOperation";
import { RpcProtocol } from "../core/RpcProtocol";
import { OpenAPIInfo, OpenAPIParameter, RpcOpenAPIDescription } from "./OpenAPI";
import { WebAppRpcLogging } from "./WebAppRpcLogging";
import { WebAppRpcRequest } from "./WebAppRpcRequest";
import { CommonLoggerCategory, RpcInterface, RpcManager } from "../../imodeljs-common";
import { RpcRoutingToken } from "../core/RpcRoutingToken";
import { Logger } from "@bentley/bentleyjs-core";

class InitializeInterface extends RpcInterface {
  public static readonly interfaceName = "InitializeInterface";
  public static readonly interfaceVersion = "1.0.0";
  public async initialize() { return this.forward(arguments); }

  public static createRequest(protocol: WebAppRpcProtocol) {
    const routing = RpcRoutingToken.generate();

    const config = class extends RpcConfiguration {
      public interfaces = () => [InitializeInterface];
      public protocol = protocol;
    };

    RpcConfiguration.assignWithRouting(InitializeInterface, routing, config);

    const instance = RpcConfiguration.obtain(config);
    RpcConfiguration.initializeInterfaces(instance);

    const client = RpcManager.getClientForInterface(InitializeInterface, routing);
    return new (protocol.requestType)(client, "initialize", []);
  }
}

/** An HTTP server request object.
 * @public
 */
export interface HttpServerRequest extends Readable {
  httpVersion: string;
  httpVersionMajor: number;
  httpVersionMinor: number;
  connection: any;
  headers: { [header: string]: string | string[] | undefined };
  rawHeaders: string[];
  trailers: { [key: string]: string | undefined };
  rawTrailers: string[];
  setTimeout(msecs: number, callback: () => void): this;
  url?: string;
  statusCode?: number;
  statusMessage?: string;
  socket: any;
  destroy(error?: Error): void;
  body: string | Buffer;
  path: string;
  method: string;
  ip?: string;
  header: (field: string) => string | undefined;
}

/** An HTTP server response object.
 * @public
 */
export interface HttpServerResponse extends Writable {
  send(body?: any): HttpServerResponse;
  status(code: number): HttpServerResponse;
  set(field: string, value: string): void;
}

/** The HTTP application protocol.
 * @public
 */
export abstract class WebAppRpcProtocol extends RpcProtocol {
  public override preserveStreams = true;

  private _initialized: Promise<void> | undefined;

  /** @internal */
  public allowedHeaders: Set<string> = new Set();

  /** @internal */
  public async initialize() {
    if (this._initialized) {
      return this._initialized;
    }

    return this._initialized = new Promise(async (resolve) => {
      try {
        const request = InitializeInterface.createRequest(this);
        const response = await request.preflight();
        if (response && response.ok) {
          (response.headers.get("Access-Control-Allow-Headers") || "").split(",").forEach((v) => this.allowedHeaders.add(v.trim()));
        }
      } catch (err) {
        Logger.logWarning(CommonLoggerCategory.RpcInterfaceFrontend, "Unable to discover backend capabilities.", () => err);
      }

      resolve();
    });
  }

  /** Convenience handler for an RPC operation get request for an HTTP server. */
  public async handleOperationGetRequest(req: HttpServerRequest, res: HttpServerResponse) {
    return this.handleOperationPostRequest(req, res);
  }

  /** Convenience handler for an RPC operation post request for an HTTP server. */
  public async handleOperationPostRequest(req: HttpServerRequest, res: HttpServerResponse) {
    const request = await WebAppRpcRequest.parseRequest(this, req);
    const fulfillment = await this.fulfill(request);
    WebAppRpcRequest.sendResponse(this, request, fulfillment, res);
  }

  /** Convenience handler for an OpenAPI description request for an HTTP server. */
  public handleOpenApiDescriptionRequest(_req: HttpServerRequest, res: HttpServerResponse) {
    const description = JSON.stringify(this.openAPIDescription);
    res.send(description);
  }

  /** Converts an HTTP content type value to an RPC content type value. */
  public static computeContentType(httpType: string | null | undefined): RpcContentType {
    if (!httpType)
      return RpcContentType.Unknown;

    if (httpType.indexOf(WEB_RPC_CONSTANTS.ANY_TEXT) === 0) {
      return RpcContentType.Text;
    } else if (httpType.indexOf(WEB_RPC_CONSTANTS.BINARY) === 0) {
      return RpcContentType.Binary;
    } else if (httpType.indexOf(WEB_RPC_CONSTANTS.MULTIPART) === 0) {
      return RpcContentType.Multipart;
    } else {
      return RpcContentType.Unknown;
    }
  }

  /** The OpenAPI-compatible info object for this protocol. */
  public abstract info: OpenAPIInfo;

  /** An optional prefix for RPC operation URI paths. */
  public pathPrefix: string = "";

  /** The RPC request class for this protocol. */
  public readonly requestType = WebAppRpcRequest;

  /** Supplies the status corresponding to a protocol-specific code value. */
  public override getStatus(code: number): RpcRequestStatus {
    switch (code) {
      case 404: return RpcRequestStatus.NotFound;
      case 202: return RpcRequestStatus.Pending;
      case 200: return RpcRequestStatus.Resolved;
      case 500: return RpcRequestStatus.Rejected;
      case 204: return RpcRequestStatus.NoContent;
      case 502: return RpcRequestStatus.BadGateway;
      case 503: return RpcRequestStatus.ServiceUnavailable;
      case 504: return RpcRequestStatus.GatewayTimeout;
      default: return RpcRequestStatus.Unknown;
    }
  }

  /** Supplies the protocol-specific code corresponding to a status value. */
  public override getCode(status: RpcRequestStatus): number {
    switch (status) {
      case RpcRequestStatus.NotFound: return 404;
      case RpcRequestStatus.Pending: return 202;
      case RpcRequestStatus.Resolved: return 200;
      case RpcRequestStatus.Rejected: return 500;
      case RpcRequestStatus.NoContent: return 204;
      case RpcRequestStatus.BadGateway: return 502;
      case RpcRequestStatus.ServiceUnavailable: return 503;
      case RpcRequestStatus.GatewayTimeout: return 504;
      default: return 501;
    }
  }

  /** Whether an HTTP status code indicates a request timeout. */
  public isTimeout(code: number): boolean {
    return code === 504;
  }

  /** An OpenAPI-compatible description of this protocol.
   * @internal
   */
  public get openAPIDescription() { return new RpcOpenAPIDescription(this); }

  /** Returns the OpenAPI-compatible URI path parameters for an RPC operation.
   * @internal
   */
  public abstract supplyPathParametersForOperation(_operation: RpcOperation): OpenAPIParameter[];

  /** Constructs an HTTP protocol. */
  public constructor(configuration: RpcConfiguration) {
    super(configuration);
    this.events.addListener(WebAppRpcLogging.logProtocolEvent);
  }
}
