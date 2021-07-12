/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { RpcInterfaceDefinition } from "../RpcInterface";
import { RpcConfiguration, RpcDefaultConfiguration } from "./core/RpcConfiguration";

/** An RpcManager that uses RpcDefaultConfiguration/RpcDirectProtocol to make client stubs invoke
 * registered server impls as direct method calls within the same JavaScript context. In other words,
 * TestRpcManager sets up a protocol that uses our remoting mechanism but cuts out the communication
 * part of it. (No IPC or XHR is used or required.)
 * Nevertheless, all of the rest of the call marshalling and operation monitoring mechanism is used.
 * That makes TestRpcManager a way to write simple, single-process integration tests for frontends
 * and backends that actually use RpcInterfaces. Note that to write such a single-process integration
 * test, you must make *both* client and server use TestRpcManager to configure their RpcInterfaces.
 * It will not work if one side uses TestRpcManager and the other uses some other protocol (say, cloud).
 * That means that you must actually program the backend to know when it is running in direct test
 * mode and to employ TestRpcManager in that case.
 * @internal
 */
export class TestRpcManager {
  public static initialize(interfaces: RpcInterfaceDefinition[]) {
    const config = class extends RpcDefaultConfiguration {
      public override interfaces: any = () => interfaces;
    };

    for (const def of interfaces)
      RpcConfiguration.assign(def, () => RpcDefaultConfiguration);

    const instance = RpcConfiguration.obtain(config);
    RpcConfiguration.initializeInterfaces(instance);
  }
}
