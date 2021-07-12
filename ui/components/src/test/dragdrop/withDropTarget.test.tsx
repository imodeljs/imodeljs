/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import { wrapInTestContext } from "react-dnd-test-utils";
import ReactTestUtils from "react-dom/test-utils";
import * as sinon from "sinon";
import { cleanup, render } from "@testing-library/react";
import { DragSourceArguments, withDragSource, withDropTarget } from "../../ui-components";
import { createDnDRenderer } from "../tree/deprecated/hocs/withDragDrop.test";

describe("withDragSource", () => {
  class TestComponent extends React.Component<any> {
    public override render(): React.ReactNode {
      return <div> test </div>;
    }
  }
  afterEach(cleanup);

  describe("Wrapped component", () => {
    const TestDragSource = withDragSource(TestComponent); // eslint-disable-line deprecation/deprecation
    const BaseComponent = TestDragSource.DecoratedComponent;
    it("mounts wrapped component", () => {
      render(<BaseComponent dragProps={{}} connectDragSource={(e: any) => e} />);
    });
  });
  it("Drop functionality", () => {
    const TestDropTarget = withDropTarget(TestComponent); // eslint-disable-line deprecation/deprecation
    const TestDragSource = withDragSource(TestDropTarget); // eslint-disable-line deprecation/deprecation
    const ContextTestDragSource = wrapInTestContext(TestDragSource);
    const renderIntoDocument = createDnDRenderer();
    const onDragSourceBegin = sinon.spy((args: DragSourceArguments) => { // eslint-disable-line deprecation/deprecation
      args.dataObject = { test: true };
      return args;
    });
    const onDragSourceEnd = sinon.spy();
    const onDropTargetDrop = sinon.spy();
    const onDropTargetOver = sinon.spy();
    const canDropTargetDrop = sinon.spy(() => {
      return true;
    });
    const dragProps = { onDragSourceBegin, onDragSourceEnd, objectType: "test" };
    const dropProps = { onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] };
    const ref = React.createRef<any>();
    const root = renderIntoDocument(
      <ContextTestDragSource
        dragProps={dragProps}
        dropProps={dropProps}
        ref={ref}
      />
    );

    // Obtain a reference to the backend
    const backend = ref.current.getManager().getBackend();
    const dragSource = ReactTestUtils.findRenderedComponentWithType<any, any>(root as any, TestDragSource);
    const dropTarget = ReactTestUtils.findRenderedComponentWithType<any, any>(root as any, TestDropTarget);

    backend.simulateBeginDrag([dragSource.getHandlerId()]);
    // simulateHover must be called twice
    backend.simulateHover([dropTarget.getHandlerId()]);
    backend.simulateHover([dropTarget.getHandlerId()]);
    backend.simulateDrop();
    backend.simulateEndDrag();

    expect(onDropTargetOver).to.have.been.calledOnce;
    expect(onDropTargetOver).to.have.been.calledWith(sinon.match({ dataObject: { test: true } }));

    expect(onDropTargetDrop).to.have.been.calledOnce;
    expect(onDropTargetDrop).to.have.been.calledWith(sinon.match({ dataObject: { test: true } }));
  });
});
