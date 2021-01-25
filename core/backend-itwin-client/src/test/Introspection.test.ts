/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { MemoryIntrospectionResponseCache } from "../oidc/introspection/IntrospectionResponseCache";
import { IntrospectionResponse } from "../oidc/introspection/IntrospectionResponse";

describe("MemoryIntrospectionResponseCache", async () => {
  it("adds the token to the cache with a valid expiration", async () => {
    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test",
      scope: "test",
      exp: Date.now() + 10000, // make the timeout long enough it won't be removed.
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    const res = await newCache.get("test");
    assert.isDefined(res);
    assert.equal(res?.client_id, "test");
  });

  it("does not add the token to the cache when the token is already expired", async () => {
    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test",
      scope: "test",
      exp: new Date().getTime() / 1000 - 10000, // make the timeout prior to the time right now.
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    const res = await newCache.get("test");
    assert.isUndefined(res);
  });

  it("does not add to the cache if missing an expiration in response object", async () => {
    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test",
      scope: "test",
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    const res = await newCache.get("test");
    assert.isUndefined(res);
  });

  it("adds the response to the cache and removes it after a timeout", async () => {
    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test",
      scope: "test",
      exp: (new Date().getTime() + 10) / 1000,
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    let res = await newCache.get("test");
    assert.isDefined(res);
    assert.equal(res?.client_id, "test");

    // set timeout to go past timeout
    await (new Promise<void>((resolve: any) => setTimeout(resolve, 50)));

    // the key should be removed
    res = await newCache.get("test");
    assert.isUndefined(res);
  });
});
