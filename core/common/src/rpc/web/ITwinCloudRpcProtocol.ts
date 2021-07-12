/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { URL } from "url";
import { BentleyStatus, Logger, OpenMode, SerializedClientRequestContext } from "@bentley/bentleyjs-core";
import { CommonLoggerCategory } from "../../CommonLoggerCategory";
import { IModelRpcProps } from "../../IModel";
import { IModelError } from "../../IModelError";
import { RpcConfiguration } from "../core/RpcConfiguration";
import { RpcOperation } from "../core/RpcOperation";
import { SerializedRpcOperation, SerializedRpcRequest } from "../core/RpcProtocol";
import { RpcRequest } from "../core/RpcRequest";
import { OpenAPIParameter } from "./OpenAPI";
import { WebAppRpcProtocol } from "./WebAppRpcProtocol";

/** An http protocol for Bentley cloud RPC interface deployments.
 * @public
 */
export abstract class ITwinCloudRpcProtocol extends WebAppRpcProtocol {
  public checkToken = true;

  /** The name of various HTTP request headers based on client's request context */
  public serializedClientRequestContextHeaderNames: SerializedClientRequestContext = {
    /** The name of the HTTP request id header. */
    id: "X-Correlation-Id",

    /** The name of the HTTP application id header. */
    applicationId: "X-Application-Id",

    /** The name of the HTTP application version header. */
    applicationVersion: "X-Application-Version",

    /** The name of the HTTP session id header. */
    sessionId: "X-Session-Id",

    /** The name of the HTTP authorization header. */
    authorization: "Authorization",

    /** The id of the authorized user */
    userId: "X-User-Id",

    /** The content types the client can understand */
    accept: "Accept",
  };

  /** The name of the RPC protocol version header. */
  public protocolVersionHeaderName = "X-Protocol-Version";

  /** Returns the operation specified by an OpenAPI-compatible URI path. */
  public getOperationFromPath(path: string): SerializedRpcOperation {
    const url = new URL(path, "https://localhost/");
    const components = url.pathname.split("/");

    const operationComponent = components.slice(-1)[0];
    const encodedRequest = url.searchParams.get("parameters") || "";

    const firstHyphen = operationComponent.indexOf("-");
    const lastHyphen = operationComponent.lastIndexOf("-");
    const interfaceDefinition = operationComponent.slice(0, firstHyphen);
    const interfaceVersion = operationComponent.slice(firstHyphen + 1, lastHyphen);
    const operationName = operationComponent.slice(lastHyphen + 1);

    return { interfaceDefinition, operationName, interfaceVersion, encodedRequest };
  }

  /** Supplies the OpenAPI-compatible URI path for an RPC operation. */
  public supplyPathForOperation(operation: RpcOperation, request: RpcRequest | undefined) {
    const prefix = this.pathPrefix;
    const apiName = this.apiName;
    const operationName = `${operation.interfaceDefinition}-${operation.operationName}`;

    let contextId: string = "";
    let iModelId: string = "";
    let routeChangeSetId: string | undefined;
    /* Note: The changeSetId field is omitted in the route in the case of ReadWrite connections since the connection is generally expected to be at the
     * latest version and not some specific changeSet. Also, for the first version (before any changeSets), the changeSetId in the route is arbitrarily
     * set to "0" instead of an empty string, since the latter is more un-intuitive for a route. However, in all other use cases, including the changeSetId
     * held by the IModelRpcProps itself, the changeSetId of "" (i.e., empty string) signifies the first version - this is more intuitive and retains
     * compatibility with the majority of use cases. */

    if (request === undefined) {
      contextId = "{contextId}";
      iModelId = "{iModelId}";
      routeChangeSetId = "{changeSetId}";
    } else {
      let token = operation.policy.token(request) || RpcOperation.fallbackToken;

      if (!token || !token.iModelId) {
        if (RpcConfiguration.disableRoutingValidation) {
          token = { key: "" };
        } else {
          throw new IModelError(BentleyStatus.ERROR, "Invalid iModelToken for RPC operation request", Logger.logError, CommonLoggerCategory.RpcInterfaceFrontend);
        }
      }

      contextId = encodeURIComponent(token.contextId || "");
      iModelId = encodeURIComponent(token.iModelId!);
      routeChangeSetId = token.changeSetId || "0";
    }

    return `${prefix}/${apiName}/context/${contextId}/imodel/${iModelId}${!!routeChangeSetId ? `/changeset/${routeChangeSetId}` : ""}/${operationName}`;
  }

  /**
   * Inflates the IModelRpcProps from the URL path for each request on the backend.
   * @note This function updates the IModelRpcProps value supplied in the request body.
   */
  public inflateToken(tokenFromBody: IModelRpcProps, request: SerializedRpcRequest): IModelRpcProps {
    const urlPathComponents = request.path.split("/");

    const iModelKey = tokenFromBody.key;
    let iModelId = tokenFromBody.iModelId;
    let contextId = tokenFromBody.contextId;
    let changeSetId = tokenFromBody.changeSetId;

    for (let i = 0; i <= urlPathComponents.length; ++i) {
      const key = urlPathComponents[i];
      const value = urlPathComponents[i + 1];
      if (key === "context") {
        contextId = value;
        ++i;
      } else if (key === "imodel") {
        iModelId = value;
        ++i;
      } else if (key === "changeset") {
        changeSetId = (value === "0") ? "" : value;
        ++i;
      }
    }

    return { key: iModelKey, contextId, iModelId, changeSetId };
  }

  /** Returns the OpenAPI-compatible URI path parameters for an RPC operation.
   * @internal
   */
  public supplyPathParametersForOperation(_operation: RpcOperation): OpenAPIParameter[] {
    return [
      { name: "contextId", in: "path", required: true, schema: { type: "string" } },
      { name: "iModelId", in: "path", required: true, schema: { type: "string" } },
      { name: "changeSetId", in: "path", required: false, schema: { type: "string" } },
    ];
  }
}
