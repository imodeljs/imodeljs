/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as semver from "semver";
import { BentleyError, OpenMode, SerializedClientRequestContext } from "@bentley/bentleyjs-core";
import { executeBackendCallback } from "@bentley/certa/lib/utils/CallbackUtils";
import {
  IModelReadRpcInterface, IModelRpcProps, NoContentError, RpcConfiguration, RpcInterface, RpcInterfaceDefinition, RpcManager, RpcOperation, RpcOperationPolicy,
  RpcProtocol, RpcRequest, RpcRequestEvent, RpcRequestStatus, RpcResponseCacheControl, RpcSerializedValue, WipRpcInterface,
} from "@bentley/imodeljs-common";
import { BackendTestCallbacks } from "../common/SideChannels";
import {
  AttachedInterface, MultipleClientsInterface, RpcTransportTest, RpcTransportTestImpl, TestNotFoundResponse, TestNotFoundResponseCode, TestOp1Params, TestRpcInterface, TestRpcInterface2,
  TokenValues, ZeroMajorRpcInterface,
} from "../common/TestRpcInterface";
import { currentEnvironment } from "./_Setup.test";

/* eslint-disable @typescript-eslint/unbound-method */
// cspell:ignore oldvalue newvalue

const timeout = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const testToken: IModelRpcProps = { key: "test", contextId: "test", iModelId: "test", changeSetId: "test", openMode: OpenMode.Readonly };

describe("RpcInterface", () => {
  class LocalInterface extends RpcInterface {
    public static readonly interfaceName = "LocalInterface";
    public static interfaceVersion = "0.0.0";
    public async op(): Promise<void> { return this.forward(arguments); }
  }

  const initializeLocalInterface = () => {
    RpcManager.registerImpl(LocalInterface, class extends RpcInterface {
      public async op(): Promise<void> { return undefined as any; }
    });

    RpcManager.initializeInterface(LocalInterface);
  };

  const terminateLocalInterface = () => {
    RpcManager.terminateInterface(LocalInterface);
  };

  it("should marshal data over the wire", async () => {
    const params: TestOp1Params = { a: 1, b: 1 };
    const remoteSum = await TestRpcInterface.getClient().op1(params);
    assert.strictEqual(remoteSum, params.a + params.b);
  });

  it("should report aggregate operation load profile information", async () => {
    const load = RpcRequest.aggregateLoad;
    const frontendInitialReq = load.lastRequest;
    const frontendInitialResp = load.lastResponse;

    await timeout(10);

    const backendAggregate1 = await TestRpcInterface.getClient().op7();
    assert.isAbove(load.lastRequest, frontendInitialReq);
    assert.isAbove(load.lastResponse, frontendInitialResp);

    await timeout(10);

    const backendAggregate2 = await TestRpcInterface.getClient().op7();
    assert.isAbove(backendAggregate2.lastRequest, backendAggregate1.lastRequest);
    assert.isAbove(backendAggregate2.lastResponse, backendAggregate1.lastResponse);
  });

  it("should support pending operations", async () => {
    const op8 = RpcOperation.lookup(TestRpcInterface, "op8");

    let receivedPending = false;

    const removeListener = RpcRequest.events.addListener((type: RpcRequestEvent, request: RpcRequest) => {
      if (type !== RpcRequestEvent.PendingUpdateReceived || request.operation !== op8)
        return;

      request.retryInterval = 1;
      assert.isFalse(receivedPending);
      receivedPending = true;
      assert.equal(request.extendedStatus, TestRpcInterface.OP8_PENDING_MESSAGE);
    });

    op8.policy.retryInterval = () => 1;

    const response1 = await TestRpcInterface.getClient().op8(1, 1);
    assert.equal(response1.initializer, TestRpcInterface.OP8_INITIALIZER);
    assert.equal(response1.sum, 2);

    const response2 = await TestRpcInterface.getClient().op8(2, 2);
    assert.equal(response2.initializer, TestRpcInterface.OP8_INITIALIZER);
    assert.equal(response2.sum, 4);

    assert.isTrue(receivedPending);
    removeListener();

    assert(await executeBackendCallback(BackendTestCallbacks.resetOp8Initializer));
  });

  it("should support supplied RPC implementation instances", async () => {
    try {
      await TestRpcInterface2.getClient().op1(1);
      assert(false);
    } catch (err) {
      assert(true);
    }

    assert(await executeBackendCallback(BackendTestCallbacks.registerTestRpcImpl2Class));

    const response1 = await TestRpcInterface2.getClient().op1(1);
    assert.equal(response1, 1);

    assert(await executeBackendCallback(BackendTestCallbacks.replaceTestRpcImpl2Instance));

    const response2 = await TestRpcInterface2.getClient().op1(2);
    assert.equal(response2, 2);

    assert(await executeBackendCallback(BackendTestCallbacks.unregisterTestRpcImpl2Class));
  });

  it("should allow access to request and invocation objects and allow a custom request id", async () => {
    const customId = "customId";
    let expectedRequest: RpcRequest = undefined as any;
    const backupFn = RpcConfiguration.requestContext.getId;
    RpcConfiguration.requestContext.getId = (request: RpcRequest) => {
      assert(!expectedRequest);
      expectedRequest = request;
      return customId;
    };

    const client = TestRpcInterface.getClient();
    const response = client.op9(customId);
    const associatedRequest = RpcRequest.current(client);
    assert.strictEqual(associatedRequest, expectedRequest);
    assert.equal(associatedRequest.id, customId);

    try {
      assert.equal(await response, customId);
    } catch (reason) {
      assert(false, reason);
    }

    RpcConfiguration.requestContext.getId = backupFn;
  });

  it("should marshal errors over the wire", async () => {
    try {
      await TestRpcInterface.getClient().op10();
      assert(false);
    } catch (err) {
      assert(err instanceof BentleyError);
    }
  });

  it("should allow void return values when using RpcDirectProtocol", async () => {
    initializeLocalInterface();
    await RpcManager.getClientForInterface(LocalInterface).op();
    terminateLocalInterface();
  });

  it("should allow terminating interfaces", async () => {
    try { await RpcManager.getClientForInterface(LocalInterface).op(); assert(false); } catch (err) { assert(true); }
    initializeLocalInterface();
    await RpcManager.getClientForInterface(LocalInterface).op();
    terminateLocalInterface();
    try { await RpcManager.getClientForInterface(LocalInterface).op(); assert(false); } catch (err) { assert(true); }
    initializeLocalInterface();
    await RpcManager.getClientForInterface(LocalInterface).op();
    terminateLocalInterface();
  });

  it("should allow resolving a 'not found' state for a request", async () => {
    const removeResolver = RpcRequest.notFoundHandlers.addListener((request, _response, resubmit, reject) => {
      if (!(_response.hasOwnProperty("isTestNotFoundResponse")))
        return;

      const response = _response as TestNotFoundResponse;

      setTimeout(() => {
        if (response.code === TestNotFoundResponseCode.CanRecover) {
          assert.strictEqual("oldvalue", request.parameters[0]);
          request.parameters[0] = "newvalue";
          resubmit();
        } else if (response.code === TestNotFoundResponseCode.Fatal) {
          reject(response.code);
        }
      }, 0);
    });

    const opResponse = await TestRpcInterface.getClient().op11("oldvalue", 0);
    assert.strictEqual(opResponse, "newvalue");

    try {
      await TestRpcInterface.getClient().op11("newvalue", 1); // op11 is hard-coded to fail fatally the second time to test reject()
      assert(false);
    } catch (err) {
      assert.strictEqual(err, TestNotFoundResponseCode.Fatal);
      assert(true);
    }

    removeResolver();
  });

  it("should describe available RPC endpoints from the frontend", async () => {
    const controlChannel = IModelReadRpcInterface.getClient().configuration.controlChannel;
    const controlInterface = (controlChannel as any)._channelInterface as RpcInterfaceDefinition;
    const originalName = controlInterface.interfaceName;
    const originalVersion = IModelReadRpcInterface.interfaceVersion;
    const controlPolicy = RpcOperation.lookup(controlInterface, "describeEndpoints").policy;

    const simulateIncompatible = () => {
      const interfaces: string[] = [];
      ((controlChannel as any)._configuration as RpcConfiguration).interfaces().forEach((definition) => {
        interfaces.push(definition.interfaceName === "IModelReadRpcInterface" ? `${definition.interfaceName}@0.0.0` : `${definition.interfaceName}@${definition.interfaceVersion}`);
      });

      const id = interfaces.sort().join(",");
      if (typeof (btoa) !== "undefined")
        return btoa(id);

      return Buffer.from(id, "binary").toString("base64");
    };

    const endpoints = await RpcManager.describeAvailableEndpoints();
    assert.equal(endpoints[0].interfaceName, "IModelReadRpcInterface");
    assert.equal(endpoints[0].operationNames[0], "openForRead");
    assert(typeof (endpoints[0].interfaceVersion) === "string");
    assert.isTrue(endpoints[0].compatible);

    const removeListener = RpcRequest.events.addListener((type: RpcRequestEvent, req: RpcRequest) => {
      if (type === RpcRequestEvent.StatusChanged && req.status === RpcRequestStatus.Resolved) {
        Object.defineProperty(controlInterface, "interfaceName", { value: simulateIncompatible() });
        IModelReadRpcInterface.interfaceVersion = originalVersion;
      }
    });
    assert(await executeBackendCallback(BackendTestCallbacks.setIncompatibleInterfaceVersion));

    const endpointsMismatch = await RpcManager.describeAvailableEndpoints();
    assert.isFalse(endpointsMismatch[0].compatible);
    removeListener();

    controlPolicy.sentCallback = () => { };
    Object.defineProperty(controlInterface, "interfaceName", { value: originalName });
    assert(await executeBackendCallback(BackendTestCallbacks.restoreIncompatibleInterfaceVersion));

    const endpointsRestored = await RpcManager.describeAvailableEndpoints();
    assert.isTrue(endpointsRestored[0].compatible);

    const originalToken = RpcOperation.fallbackToken;
    RpcOperation.fallbackToken = { key: "test", contextId: "test", iModelId: "test", changeSetId: "test", openMode: OpenMode.Readonly };
    assert.equal(controlPolicy.token(undefined as any)!.contextId, "test");
    RpcOperation.fallbackToken = originalToken;
    assert.equal(controlPolicy.token(undefined as any)!.contextId, originalToken ? originalToken.contextId : "none");
  });

  it("should support retrieving binary resources from the backend", async () => {
    const data = await TestRpcInterface.getClient().op12();
    assert.equal(data.byteLength, 4);
    assert.equal(data[0], 1);
    assert.equal(data[1], 2);
    assert.equal(data[2], 3);
    assert.equal(data[3], 4);
  });

  it("should support sending binary resources to the backend", async () => {
    const data = new Uint8Array(4);
    data[0] = 1;
    data[1] = 2;
    data[2] = 3;
    data[3] = 4;
    await TestRpcInterface.getClient().op13(data);
  });

  it("should reject a mismatched RPC interface request", async () => {
    const realVersion = TestRpcInterface.interfaceVersion;
    const realVersionZ = ZeroMajorRpcInterface.interfaceVersion;

    // Wait until after each test request is serialized before resetting the interfaceVersions
    const originalSerialize = TestRpcInterface.getClient().configuration.protocol.serialize;
    TestRpcInterface.getClient().configuration.protocol.serialize = async (request) => {
      const retVal = await originalSerialize(request);
      TestRpcInterface.interfaceVersion = realVersion;
      ZeroMajorRpcInterface.interfaceVersion = realVersionZ;
      return retVal;
    };

    const test = async (code: string | null, expectValid: boolean, c: TestRpcInterface | ZeroMajorRpcInterface) => {
      assert(code !== null);

      TestRpcInterface.interfaceVersion = code as string;
      ZeroMajorRpcInterface.interfaceVersion = code as string;

      let err: Error | undefined;
      try {
        await c.op1({ a: 0, b: 0 });
      } catch (error) {
        err = error;
      }

      if (err && expectValid)
        assert(false, `Unexpected error: ${err.stack}`);

      if (!err && !expectValid)
        assert(false, "Expected error, but none was thrown.");
    };

    const client = TestRpcInterface.getClient();
    const clientZ = ZeroMajorRpcInterface.getClient();

    await test("", false, client);
    await test("", false, clientZ);

    const current = semver.parse(realVersion)!;
    const currentZ = semver.parse(realVersionZ)!;

    await test(current.format(), true, client);
    await test(currentZ.format(), true, clientZ);

    const incMajor = semver.parse(realVersion)!;
    incMajor.inc("major");

    const incMajorZ = semver.parse(realVersionZ)!;
    incMajorZ.inc("major");

    await (test(incMajor.format(), false, client));
    await (test(incMajorZ.format(), false, clientZ));

    const incMinor = semver.parse(realVersion)!;
    incMinor.inc("minor");

    const incMinorZ = semver.parse(realVersionZ)!;
    incMinorZ.inc("minor");

    await (test(incMinor.format(), false, client));
    await (test(incMinorZ.format(), false, clientZ));

    const incPatch = semver.parse(realVersion)!;
    incPatch.inc("patch");

    const incPatchZ = semver.parse(realVersionZ)!;
    incPatchZ.inc("patch");

    await (test(incPatch.format(), true, client));
    await (test(incPatchZ.format(), false, clientZ));

    const incPre = semver.parse(realVersion)!;
    incPre.inc("prerelease");

    const incPreZ = semver.parse(realVersionZ)!;
    incPreZ.inc("prerelease");

    await (test(incPre.format(), false, client));
    await (test(incPreZ.format(), false, clientZ));

    const decMajor = semver.parse(realVersion)!;
    --decMajor.major;

    const decMajorZ = semver.parse(realVersionZ)!;
    --decMajorZ.major;

    await (test(decMajor.format(), false, client));
    await (test(decMajorZ.format(), false, clientZ));

    const decMinor = semver.parse(realVersion)!;
    --decMinor.minor;

    const decMinorZ = semver.parse(realVersionZ)!;
    --decMinorZ.minor;

    await (test(decMinor.format(), true, client));
    await (test(decMinorZ.format(), false, clientZ));

    const decPatch = semver.parse(realVersion)!;
    --decPatch.patch;

    const decPatchZ = semver.parse(realVersionZ)!;
    --decPatchZ.patch;

    await (test(decPatch.format(), true, client));
    await (test(decPatchZ.format(), true, clientZ));

    TestRpcInterface.getClient().configuration.protocol.serialize = originalSerialize;
  });

  it("should validate transport method", async () => {
    function compareBytes(x: Uint8Array, y: Uint8Array) {
      if (x.byteLength !== y.byteLength) {
        return false;
      }

      for (let i = 0; i !== x.byteLength; ++i) {
        if (x[i] !== y[i]) {
          return false;
        }
      }

      return true;
    }

    const abc = "abc";
    const one = 1;
    const oneZero = new Uint8Array([1, 0, 1, 0]);
    const zeroOne = new Uint8Array([0, 1, 0, 1]);

    const client = RpcTransportTest.getClient();

    // exercise
    assert.equal(await client.primitive(abc), RpcTransportTestImpl.mutateString(abc));
    assert(compareBytes(await client.binary(oneZero), RpcTransportTestImpl.mutateBits(oneZero)));
    const mixed = await client.mixed(abc, zeroOne);
    assert.equal(mixed[0], RpcTransportTestImpl.mutateString(abc));
    assert(compareBytes(mixed[1], RpcTransportTestImpl.mutateBits(zeroOne)));
    const nested = await client.nested({ a: { x: oneZero, y: one }, b: abc, c: zeroOne });
    assert(compareBytes(nested.a.x, RpcTransportTestImpl.mutateBits(oneZero)));
    assert.equal(nested.a.y, RpcTransportTestImpl.mutateNumber(one));
    assert.equal(nested.b, RpcTransportTestImpl.mutateString(abc));
    assert(compareBytes(nested.c, RpcTransportTestImpl.mutateBits(zeroOne)));

    // stress
    const singleStressTest = async () => {
      const nested2 = await client.nested({ a: { x: oneZero, y: one }, b: abc, c: zeroOne });
      assert(compareBytes(nested2.a.x, RpcTransportTestImpl.mutateBits(oneZero)));
      assert.equal(nested2.a.y, RpcTransportTestImpl.mutateNumber(one));
      assert.equal(nested2.b, RpcTransportTestImpl.mutateString(abc));
      assert(compareBytes(nested2.c, RpcTransportTestImpl.mutateBits(zeroOne)));
    };
    const promises = new Array<Promise<void>>();
    for (let i = 0; i !== 100; ++i) {
      promises.push(singleStressTest());
    }
    await Promise.all(promises);
  });

  it("should support cacheable responses", async () => {
    RpcOperation.lookup(TestRpcInterface, "op14").policy.allowResponseCaching = () => RpcResponseCacheControl.Immutable;
    assert.equal(2, await TestRpcInterface.getClient().op14(1, 1));
  });

  it("should successfully call WipRpcInterface.placeholder", async () => {
    const s: string = await WipRpcInterface.getClient().placeholder(testToken);
    assert.equal(s, "placeholder");
  });

  it("should send app version to backend", async () => {
    const backupFn = RpcConfiguration.requestContext.serialize;

    RpcConfiguration.requestContext.serialize = async (_request): Promise<SerializedClientRequestContext> => {
      const serializedContext: SerializedClientRequestContext = {
        id: _request.id,
        applicationId: "",
        applicationVersion: "testbed1",
        sessionId: "",
      };
      return serializedContext;
    };

    try {
      await TestRpcInterface.getClient().op15();
      assert(true);
    } catch (err) {
      assert(false);
    } finally {
      RpcConfiguration.requestContext.serialize = backupFn;
    }
  });

  it("should transport imodel tokens correctly", async () => {
    RpcOperation.lookup(TestRpcInterface, "op16").policy.token = new RpcOperationPolicy().token;

    async function check(key: string, contextId?: string, iModelId?: string, changeSetId?: string, openMode?: OpenMode) {
      const token: IModelRpcProps = { key, contextId, iModelId, changeSetId, openMode };
      const values: TokenValues = { key, contextId, iModelId, changeSetId, openMode };
      assert.isTrue(await TestRpcInterface.getClient().op16(token, values));
    }

    await check("key1", "context1", "imodel1", "change1", OpenMode.ReadWrite);
    await check("key1", "context1", "imodel1", "", OpenMode.ReadWrite);
    await check("key1", "context1", "imodel1", undefined, OpenMode.ReadWrite);
    await check("", "context1", "imodel1", "change1", OpenMode.ReadWrite);

    await check("key1", "context1", "imodel1", "change1", OpenMode.Readonly);
    await check("key1", "context1", "imodel1", "", OpenMode.Readonly);
    await check("", "context1", "imodel1", "change1", OpenMode.Readonly);
  });

  it("should recover when the underlying transport is replaced, resend all active requests, and disregard any zombie responses", async () => {
    class TestInterface extends RpcInterface {
      public static interfaceName = "TestInterface";
      public static interfaceVersion = "0.0.0";
      public req1() { }
      public req2() { }
      public req3() { }
    }

    RpcManager.initializeInterface(TestInterface);

    class Resolver<T> {
      public promise: Promise<T>;
      public resolve() { }
      constructor(private _value: () => T) { this.promise = new Promise((callback, _) => this.resolve = () => callback(this._value())); }
    }

    const backend: Map<string, Resolver<number>> = new Map();
    const frontend = RpcRequest.activeRequests;
    const pending: Set<Promise<void>> = new Set();
    let replaced = 0;
    let completed = 0;

    class TestRequest extends RpcRequest {
      protected setHeader(_name: string, _value: string): void { }

      protected async send(): Promise<number> {
        assert.isFalse(backend.has(this.id));

        const resolver = new Resolver(() => RpcRequestStatus.Resolved);
        assert(frontend.has(this.id));
        backend.set(this.id, resolver);

        if (replaced) {
          resolver.resolve();
          backend.delete(this.id);
        } else if (backend.size === 3) {
          assert(frontend.has(requests[0].id) && frontend.has(requests[1].id) && frontend.has(requests[2].id));
          frontend.forEach((req) => req.cancel());
          backend.forEach((completer) => completer.resolve()); // should be ignored on the frontend...no load call will happen
          backend.clear();
          ++replaced;
        }

        return resolver.promise;
      }

      protected async load(): Promise<RpcSerializedValue> {
        assert.equal(1, replaced);
        return RpcSerializedValue.create(this.parameters[0]);
      }

      public override dispose(): void {
        ++completed;
        assert.equal(this.parameters[0], (this as any)._raw);
        super.dispose();
      }
    }

    const client = new TestInterface();
    const requests = [new TestRequest(client, "req1", ["1"]), new TestRequest(client, "req2", ["2"]), new TestRequest(client, "req3", ["3"])];

    assert.equal(replaced, 0);
    assert.equal(frontend.size, 0);
    assert.equal(backend.size, 0);
    assert.equal(completed, 0);

    await Promise.all(requests.map(async (r) => r.submit()));
    pending.clear();

    assert.equal(replaced, 1);
    assert.equal(frontend.size, 0);
    assert.equal(backend.size, 0);
    assert.equal(completed, 0);

    await Promise.all(requests.map(async (r) => r.submit()));
    pending.clear();

    assert.equal(replaced, 1);
    assert.equal(frontend.size, 0);
    assert.equal(backend.size, 0);
    assert.equal(completed, 3);
  });

  it("should support multiple clients per interface", async () => {
    if (currentEnvironment !== "http") {
      return;
    }

    const config1 = MultipleClientsInterface.config1;
    const client1 = MultipleClientsInterface.getClientWithRouting(config1);
    assert.isTrue(await client1.check(config1.id));

    const config2 = MultipleClientsInterface.config2;
    const client2 = MultipleClientsInterface.getClientWithRouting(config2);
    assert.isTrue(await client2.check(config2.id));
  });

  it("should support attaching interfaces to existing configurations", async () => {
    if (currentEnvironment !== "http") {
      return;
    }

    const ping = await AttachedInterface.getClient().ping();
    assert.isTrue(ping);
  });

  it("should support no content (quiet) errors.", async () => {
    const pv = RpcProtocol.protocolVersion;
    (RpcProtocol as any).protocolVersion = 0;

    try {
      await TestRpcInterface.getClient().op17();
      assert(false);
    } catch (err) {
      assert(!(err instanceof NoContentError));
    }

    (RpcProtocol as any).protocolVersion = pv;

    try {
      await TestRpcInterface.getClient().op17();
      assert(false);
    } catch (err) {
      assert(err instanceof NoContentError);
    }
  });
});
