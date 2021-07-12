/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { RpcConfiguration, RpcDefaultConfiguration, RpcInterfaceDefinition } from "@bentley/imodeljs-common";

export class TestRpcManager {
  public static initializeClient(interfaces: RpcInterfaceDefinition[]) {
    const config = class extends RpcDefaultConfiguration {
      public override interfaces: any = () => interfaces;
    };

    for (const def of interfaces)
      RpcConfiguration.assign(def, () => config);

    const instance = RpcConfiguration.obtain(config);
    try {
      RpcConfiguration.initializeInterfaces(instance);
    } catch (_e) {
      // this may fail with "Error: RPC interface "xxx" is already initialized." because
      // multiple different tests want to set up rpc interfaces
    }
  }
}
