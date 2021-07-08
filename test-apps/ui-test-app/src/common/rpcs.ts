/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  IModelReadRpcInterface, IModelTileRpcInterface, IModelWriteRpcInterface, RpcInterfaceDefinition,
  SnapshotIModelRpcInterface,
} from "@bentley/imodeljs-common";
import { PresentationRpcInterface } from "@bentley/presentation-common";
import { Config } from "@bentley/bentleyjs-core";

/**
 * Returns a list of RPCs supported by this application
 */
export function getSupportedRpcs(): RpcInterfaceDefinition[] {

  if (Config.App.has("imjs_TESTAPP_ALLOW_WRITE") && (Config.App.get("imjs_TESTAPP_ALLOW_WRITE") === "1")) {
    // eslint-disable-next-line no-console
    console.log("Using ReadWrite RPC Interfaces");
    return [
      IModelReadRpcInterface,
      IModelTileRpcInterface,
      SnapshotIModelRpcInterface,
      PresentationRpcInterface,
      IModelWriteRpcInterface, // eslint-disable-line deprecation/deprecation
    ];
  }

  // eslint-disable-next-line no-console
  console.log("Using Readonly RPC Interfaces");

  return [
    IModelReadRpcInterface,
    IModelTileRpcInterface,
    SnapshotIModelRpcInterface,
    PresentationRpcInterface,
  ];

}
