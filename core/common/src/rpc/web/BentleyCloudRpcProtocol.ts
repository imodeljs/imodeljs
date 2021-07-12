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

enum AppMode {
  MilestoneReview = "1",
  WorkGroupEdit = "2",
}

/** An http protocol for Bentley cloud RPC interface deployments.
 * @public
 */
export abstract class BentleyCloudRpcProtocol extends WebAppRpcProtocol {
  public override checkToken = true;

  /** The name of various HTTP request headers based on client's request context */
  public override serializedClientRequestContextHeaderNames: SerializedClientRequestContext = {
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
  };

  /** The name of the RPC protocol version header. */
  public override protocolVersionHeaderName = "X-Protocol-Version";

  /** Returns the operation specified by an OpenAPI-compatible URI path. */
  public override getOperationFromPath(path: string): SerializedRpcOperation {
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
  public override supplyPathForOperation(operation: RpcOperation, request: RpcRequest | undefined) {
    const prefix = this.pathPrefix;
    const appTitle = this.info.title;
    const appVersion = this.info.version;
    const operationId = `${operation.interfaceDefinition.interfaceName}-${operation.interfaceVersion}-${operation.operationName}`;

    let appMode: string = "";
    let contextId: string = "";
    let iModelId: string = "";
    let routeChangeSetId: string | undefined;
    /* Note: The changeSetId field is omitted in the route in the case of ReadWrite connections since the connection is generally expected to be at the
     * latest version and not some specific changeSet. Also, for the first version (before any changeSets), the changeSetId in the route is arbitrarily
     * set to "0" instead of an empty string, since the latter is more un-intuitive for a route. However, in all other use cases, including the changeSetId
     * held by the IModelRpcProps itself, the changeSetId of "" (i.e., empty string) signifies the first version - this is more intuitive and retains
     * compatibility with the majority of use cases. */

    if (request === undefined) {
      appMode = "{modeId}";
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

      if (token.openMode === OpenMode.Readonly) {
        // Use "0" if changeSetId omitted or empty string.
        routeChangeSetId = token.changeSetId || "0";
        appMode = AppMode.MilestoneReview;
      } else {
        appMode = AppMode.WorkGroupEdit;
      }
    }

    return `${prefix}/${appTitle}/${appVersion}/mode/${appMode}/context/${contextId}/imodel/${iModelId}${!!routeChangeSetId ? `/changeset/${routeChangeSetId}` : ""}/${operationId}`;
  }

  /**
   * Inflates the IModelRpcProps from the URL path for each request on the backend.
   * @note This function updates the IModelRpcProps value supplied in the request body.
   */
  public override inflateToken(tokenFromBody: IModelRpcProps, request: SerializedRpcRequest): IModelRpcProps {
    const urlPathComponents = request.path.split("/");

    const iModelKey = tokenFromBody.key;
    let openMode = tokenFromBody.openMode;
    let iModelId = tokenFromBody.iModelId;
    let contextId = tokenFromBody.contextId;
    let changeSetId = tokenFromBody.changeSetId;

    for (let i = 0; i <= urlPathComponents.length; ++i) {
      const key = urlPathComponents[i];
      const value = urlPathComponents[i + 1];
      if (key === "mode") {
        openMode = (value === AppMode.WorkGroupEdit) ? OpenMode.ReadWrite : OpenMode.Readonly;
        ++i;
      } else if (key === "context") {
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

    return { key: iModelKey, contextId, iModelId, changeSetId, openMode };
  }

  /** Returns the OpenAPI-compatible URI path parameters for an RPC operation.
   * @internal
   */
  public supplyPathParametersForOperation(_operation: RpcOperation): OpenAPIParameter[] {
    return [
      { name: "modeId", in: "path", required: true, schema: { type: "string" } },
      { name: "contextId", in: "path", required: true, schema: { type: "string" } },
      { name: "iModelId", in: "path", required: true, schema: { type: "string" } },
      { name: "changeSetId", in: "path", required: false, schema: { type: "string" } },
    ];
  }
}
