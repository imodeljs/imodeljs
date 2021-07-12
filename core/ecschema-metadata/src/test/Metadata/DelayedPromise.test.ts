/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { DelayedPromise, DelayedPromiseWithProps } from "../../DelayedPromise";

describe("DelayedPromise", () => {
  it("should not start until awaited", async () => {
    const asyncOp = sinon.spy(async () => 42);
    const promise = new DelayedPromise(asyncOp);

    expect(asyncOp.notCalled).to.be.true;
    expect(await promise).to.equal(42);
    expect(asyncOp.calledOnce).to.be.true;
  });

  it("should not start until manually started", async () => {
    const asyncOp = sinon.spy(async () => 76);
    const promise = new DelayedPromise(asyncOp);

    expect(asyncOp.notCalled).to.be.true;
    await expect(promise.start()).to.eventually.equal(76);
    expect(asyncOp.calledOnce).to.be.true;
  });

  it("should not start until a resolution callback is attached", async () => {
    const asyncOp = sinon.spy(async () => 20);
    const promise = new DelayedPromise(asyncOp);
    const callback = sinon.spy((_: number) => "foo");

    expect(asyncOp.notCalled).to.be.true;
    expect(await promise.then(callback)).to.equal("foo");
    expect(asyncOp.calledOnce).to.be.true;

    expect(callback.calledOnce).to.be.true;
    expect(callback.calledWithExactly(20)).to.be.true;
  });

  it("should not start until a rejection callback is attached", async () => {
    const error = new Error("I like to throw things");
    const asyncOp = sinon.spy(async () => { throw error; });
    const promise = new DelayedPromise(asyncOp);
    const callback = sinon.spy((_: Error) => "bar");

    expect(asyncOp.notCalled).to.be.true;
    expect(await promise.catch(callback)).to.equal("bar");
    expect(asyncOp.calledOnce).to.be.true;

    expect(callback.calledOnce).to.be.true;
    expect(callback.calledWithExactly(error)).to.be.true;
  });

  it("should only ever start once", async () => {
    const asyncOp = sinon.spy(async () => "foo");
    const promise = new DelayedPromise(asyncOp);

    expect(asyncOp.notCalled).to.be.true;
    expect(await promise).to.equal("foo");
    expect(await promise).to.equal("foo");
    await expect(promise).to.eventually.equal("foo");
    await expect(promise).to.eventually.equal("foo");
    await expect(promise.start()).to.eventually.equal("foo");
    await expect(promise.start()).to.eventually.equal("foo");
    expect(asyncOp.calledOnce).to.be.true;
  });
});

describe("DelayedPromiseWithProps", () => {
  class Base {
    public get inheritedGetter() { return "value"; }
    public inheritedMethod() { return "something"; }
    public overriddenMethod() { return "this"; }
  }
  class PropsClass extends Base {
    public realProp = true;
    public get getterProp() { return 5; }
    public classMethod() { return 42; }
    public override overriddenMethod() { return "that"; }
  }

  it("should contain getters for all added properties", async () => {
    const props = new PropsClass();

    const promise = new DelayedPromiseWithProps(props, async () => undefined);
    expect(promise.realProp).to.be.true;
    expect(promise.getterProp).to.equal(5);
    expect(promise.classMethod).to.exist;
    expect(promise.classMethod()).to.equal(42);
    expect(promise.inheritedGetter).to.equal("value");
    expect(promise.inheritedMethod).to.exist;
    expect(promise.inheritedMethod()).to.equal("something");
    expect(promise.overriddenMethod).to.exist;
    expect(promise.overriddenMethod()).to.equal("that");

    props.realProp = false;
    expect(promise.realProp).to.be.false;
  });
});
