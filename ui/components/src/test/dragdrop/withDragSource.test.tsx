/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as React from "react";
import { ConnectDragSource } from "react-dnd";
import { wrapInTestContext } from "react-dnd-test-utils";
import * as sinon from "sinon";
import { cleanup, render } from "@testing-library/react";
import { DragSourceArguments, DragSourceProps, withDragSource } from "../../ui-components";
import { createDnDRenderer } from "../tree/deprecated/hocs/withDragDrop.test";

describe("withDragSource", () => {
  class TestComponent extends React.Component<{
    dragProps: DragSourceProps; // eslint-disable-line deprecation/deprecation
    connectDragSource?: ConnectDragSource;
  }> {
    public override render() {
      return <div> test </div>;
    }
  }
  afterEach(cleanup);

  describe("Wrapped component", () => {
    const testDragSource = withDragSource(TestComponent); // eslint-disable-line deprecation/deprecation
    const BaseComponent = testDragSource.DecoratedComponent;
    it("mounts wrapped component", () => {
      render(<BaseComponent dragProps={{}} connectDragSource={(e: any) => e} />);
    });
  });
  it("Drag functionality", () => {
    const TestDragSource = withDragSource(TestComponent); // eslint-disable-line deprecation/deprecation
    const ContextTestDragSource = wrapInTestContext(TestDragSource);
    const renderIntoDocument = createDnDRenderer(TestDragSource);
    const onDragSourceBegin = (args: DragSourceArguments) => { // eslint-disable-line deprecation/deprecation
      args.dataObject = { test: true };
      return args;
    };
    const beginSpy = sinon.spy(onDragSourceBegin);
    const onDragSourceEnd = sinon.fake();
    const ref = React.createRef<any>();
    const root = renderIntoDocument(
      <ContextTestDragSource
        dragProps={{ onDragSourceBegin: beginSpy, onDragSourceEnd, objectType: "test" }}
        ref={ref}
      />
    ) as any;
    // Obtain a reference to the backend
    const backend = ref.current.getManager().getBackend();

    backend.simulateBeginDrag([root.getHandlerId()]);
    expect(beginSpy).to.have.been.calledOnce;
    expect(beginSpy).to.have.been.calledWith(sinon.match({ dataObject: { test: true } }));

    backend.simulateEndDrag();
    expect(onDragSourceEnd).to.have.been.calledOnce;
    expect(onDragSourceEnd).to.have.been.calledWith(sinon.match({ dataObject: { test: true } }));
  });
});
