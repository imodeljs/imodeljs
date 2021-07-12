/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import ReactTestUtils from "react-dom/test-utils";
import { wrapInTestContext } from "react-dnd-test-utils";
import * as sinon from "sinon";
import { PropertyRecord } from "@bentley/ui-abstract";
import { cleanup, render } from "@testing-library/react";
import { DEPRECATED_Tree as Tree } from "../../../../ui-components";
import {
  DragSourceArguments, DragSourceProps, DropEffects, DropStatus, DropTargetArguments, DropTargetProps,
} from "../../../../ui-components/dragdrop/DragDropDef";
import { BeInspireTree } from "../../../../ui-components/tree/deprecated/component/BeInspireTree";
import { DEPRECATED_withTreeDragDrop } from "../../../../ui-components/tree/deprecated/hocs/withDragDrop";
import { TreeNodeItem } from "../../../../ui-components/tree/TreeDataProvider";

/* eslint-disable deprecation/deprecation */

class ClassComponent extends React.Component {
  public override render() {
    return <>{this.props.children}</>;
  }
}

/** @internal */
export function createDnDRenderer(type?: any): typeof ReactTestUtils.renderIntoDocument {
  return (element: any) => {
    const root = ReactTestUtils.renderIntoDocument(
      <ClassComponent>
        {element}
      </ClassComponent>
    );
    if (type)
      return ReactTestUtils.findRenderedComponentWithType(root as any, type);
    return root;
  };
}

describe("Tree withDragDrop HOC", () => {

  afterEach(cleanup);

  const TreeWithDragDrop = DEPRECATED_withTreeDragDrop(Tree);
  const DragDropTree = wrapInTestContext(TreeWithDragDrop);

  const renderIntoDocument = createDnDRenderer(TreeWithDragDrop);

  it("should render", () => {
    const tree = [{ label: PropertyRecord.fromString("Raw Node", "label"), id: "1", description: "node description" }];
    render(<DragDropTree dataProvider={tree} />);
  });
  it("should render with drag/drop props", () => {
    const dragProps: DragSourceProps = {
      onDragSourceBegin: (args: any) => args,
      onDragSourceEnd: () => undefined,
      objectType: () => "test",
    };
    const dropProps: DropTargetProps = {
      onDropTargetOver: () => undefined,
      onDropTargetDrop: (args: any) => args,
      canDropTargetDrop: () => true,
      objectTypes: ["test"],
    };
    const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
    render(<DragDropTree dataProvider={tree} dragProps={dragProps} dropProps={dropProps} />);
  });
  it("should return DragDrop row when renderRow is called", async () => {
    const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
    const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ objectType: "test" }} />) as any;
    const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
    await iTree.ready;
    const node = iTree.node(tree[0].id);
    const treeNode = root.renderNode(node, { node, renderLabel: { node } });
    expect(treeNode).to.exist;
  });
  describe("Drag callbacks", () => {
    it("should have no drag callback when no dragProps are provided", () => {
      const root = renderIntoDocument(<DragDropTree dataProvider={[]} />) as any;
      expect(root.createNodeDragProps([])).to.be.empty;
    });
    it("should have no drag callback when currentNode is undefined(unset)", () => {
      const root = renderIntoDocument(<DragDropTree dataProvider={[]} />) as any;
      expect(root.createNodeDragProps()).to.be.empty;
    });
    it("should forward extendedData from tree node into DragDrop dataObject", async () => {
      const onDragSourceBegin = sinon.spy((args: DragSourceArguments) => args);
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description", extendedData: { testData: true } }];
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ onDragSourceBegin, objectType: "test" }} />) as any;
      const callbacks = root.createNodeDragProps(iTree.node(tree[0].id)) as DragSourceProps;
      const ret = callbacks.onDragSourceBegin!({ dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } });
      expect(onDragSourceBegin).to.have.been.calledWithMatch({ dataObject: { testData: true } });
      expect(ret.dataObject).to.contain({ testData: true });
    });
    it("should forward extendedData from tree node without onDragSourceBegin input callback", async () => {
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description", extendedData: { testData: true } }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ objectType: "test" }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDragProps(iTree.node(tree[0].id)) as DragSourceProps;
      const ret = callbacks.onDragSourceBegin!({ dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } });
      expect(ret.dataObject).to.contain({ testData: true });
    });
    it("should add properties to dataObject from onDragSourceBegin and pass them on", async () => {
      const onDragSourceBegin = (args: DragSourceArguments) => {
        args.dataObject = { test: true };
        return args;
      };
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ onDragSourceBegin, objectType: "test" }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDragProps(iTree.node(tree[0].id)) as DragSourceProps;
      const ret = callbacks.onDragSourceBegin!({ dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } });
      expect(ret.dataObject).to.contain({ test: true });
    });
    it("should set parentObject to dataProvider when on root node", async () => {
      const onDragSourceBegin = sinon.spy((args: DragSourceArguments) => args);
      const onDragSourceEnd = sinon.spy();
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ onDragSourceBegin, onDragSourceEnd, objectType: "test" }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDragProps(iTree.node(tree[0].id)) as DragSourceProps;
      const ret = callbacks.onDragSourceBegin!({ dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } });
      expect(onDragSourceBegin).to.be.calledWithMatch({ parentObject: tree });
      expect(ret.parentObject).to.equal(tree);
      callbacks.onDragSourceEnd!({ dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } });
      expect(onDragSourceEnd).to.be.calledWithMatch({ parentObject: tree });
    });
    it("should set parentObject to payload of parent when not on root node", async () => {
      const onDragSourceBegin = sinon.spy((args: DragSourceArguments) => args);
      const onDragSourceEnd = sinon.spy();
      const tree = [{
        label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description", children: [
          { label: PropertyRecord.fromString("Raw Child Node"), id: "1.1", description: "child node description" },
        ],
      }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ onDragSourceBegin, onDragSourceEnd, objectType: "test" }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDragProps(iTree.node(tree[0].children[0].id)) as DragSourceProps;
      const ret = callbacks.onDragSourceBegin!({ dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } });
      expect(onDragSourceBegin).to.be.calledWithMatch({ parentObject: tree[0] });
      expect(ret.parentObject).to.deep.equal(tree[0]);
      callbacks.onDragSourceEnd!({ dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } });
      expect(onDragSourceEnd).to.be.calledWithMatch({ parentObject: tree[0] });
    });
    it("should pass constant objectType through", async () => {
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ objectType: "test" }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDragProps(iTree.node(tree[0].id)) as DragSourceProps;
      const ret = (callbacks.objectType as any)();
      expect(ret).to.equal("test");
    });
    it("should pass data through for functional objectType", async () => {
      const objectType = sinon.spy((data: { testType: string } | any) => data.testType);
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description", extendedData: { testType: "function-test" } }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dragProps={{ objectType }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDragProps(iTree.node(tree[0].id)) as DragSourceProps;
      const ret = (callbacks.objectType as any)();
      expect(ret).to.equal("function-test");
    });
  });
  describe("Drop callbacks", () => {
    it("should have no drop callback when no dropProps are provided", () => {
      const root = renderIntoDocument(<DragDropTree dataProvider={[]} />) as any;
      expect(root.createNodeDropProps([])).to.be.empty;
    });
    it("should add dropLocation as dataProvider to dropProps callbacks", () => {
      const onDropTargetDrop = sinon.spy();
      const onDropTargetOver = sinon.spy();
      const canDropTargetDrop = sinon.spy((_args: DropTargetArguments) => true);
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] }} />) as any;
      const callbacks = root.createTreeDropProps() as DropTargetProps;
      const args = { dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } };
      callbacks.onDropTargetDrop!(args);
      expect(onDropTargetDrop).to.be.calledWithMatch({ dropLocation: tree });

      callbacks.onDropTargetOver!(args);
      expect(onDropTargetOver).to.be.calledWithMatch({ dropLocation: tree });

      callbacks.canDropTargetDrop!(args);
      expect(canDropTargetDrop).to.be.calledWithMatch({ dropLocation: tree });
    });
    it("should add dropLocation as item to dropProps callbacks", async () => {
      const onDropTargetDrop = sinon.spy();
      const onDropTargetOver = sinon.spy();
      const canDropTargetDrop = sinon.spy((_args: DropTargetArguments) => true);
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDropProps(iTree.node(tree[0].id)) as DropTargetProps;
      const args = { dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } };
      callbacks.onDropTargetDrop!(args);
      expect(onDropTargetDrop).to.be.calledWithMatch({ dropLocation: tree[0] });

      callbacks.onDropTargetOver!(args);
      expect(onDropTargetOver).to.be.calledWithMatch({ dropLocation: tree[0] });

      callbacks.canDropTargetDrop!(args);
      expect(canDropTargetDrop).to.be.calledWithMatch({ dropLocation: tree[0] });
    });
    it("should add dropLocation as item to dropProps callback returns without input callback", async () => {
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ objectTypes: ["test"] }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDropProps(iTree.node(tree[0].id)) as DropTargetProps;
      const args = { dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } };
      const ret1 = callbacks.onDropTargetDrop!(args);
      expect(ret1.dropLocation).to.deep.equal(tree[0]);

      const ret2 = callbacks.canDropTargetDrop!(args);
      expect(ret2).to.be.true;
    });
    it("should add dropLocation as dataProvider to dropProps callback returns without input callback", () => {
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ objectTypes: ["test"] }} />) as any;
      const callbacks = root.createTreeDropProps() as DropTargetProps;
      const args = { dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None, clientOffset: { x: 0, y: 0 }, initialClientOffset: { x: 0, y: 0 } };
      const ret1 = callbacks.onDropTargetDrop!(args);
      expect(ret1.dropLocation).to.deep.equal(tree);

      const ret2 = callbacks.canDropTargetDrop!(args);
      expect(ret2).to.be.true;
    });
    it("should not set row if dropped on center 1/3", async () => {
      const onDropTargetDrop = sinon.spy();
      const onDropTargetOver = sinon.spy();
      const canDropTargetDrop = sinon.spy((_args: DropTargetArguments) => true);
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDropProps(iTree.node(tree[0].id)) as DropTargetProps;
      const args = {
        dataObject: undefined, row: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None,
        clientOffset: { x: 50, y: 5 }, initialClientOffset: { x: 0, y: 0 }, dropRect: { top: 0, left: 0, bottom: 0, right: 0, width: 100, height: 10 },
      };
      callbacks.onDropTargetOver!(args);
      expect(onDropTargetOver).to.be.calledWithMatch({ row: undefined });

      callbacks.onDropTargetDrop!(args);
      expect(onDropTargetDrop).to.be.calledWithMatch({ row: undefined });

      callbacks.canDropTargetDrop!(args);
      expect(canDropTargetDrop).to.be.calledWithMatch({ row: undefined });
    });
    it("should not increment row if dropped on top 1/3", async () => {
      const onDropTargetDrop = sinon.spy();
      const onDropTargetOver = sinon.spy();
      const canDropTargetDrop = sinon.spy((_args: DropTargetArguments) => true);
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDropProps(iTree.node(tree[0].id)) as DropTargetProps;
      const args = {
        dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None,
        clientOffset: { x: 50, y: 1.66 }, initialClientOffset: { x: 0, y: 0 }, dropRect: { top: 0, left: 0, bottom: 0, right: 0, width: 100, height: 10 },
      };
      callbacks.onDropTargetDrop!(args);
      expect(onDropTargetDrop).to.be.calledWithMatch({ row: 0 });

      callbacks.onDropTargetOver!(args);
      expect(onDropTargetOver).to.be.calledWithMatch({ row: 0 });

      callbacks.canDropTargetDrop!(args);
      expect(canDropTargetDrop).to.be.calledWithMatch({ row: 0 });
    });
    it("should increment row if dropped on bottom 1/3", async () => {
      const onDropTargetDrop = sinon.spy();
      const onDropTargetOver = sinon.spy();
      const canDropTargetDrop = sinon.spy((_args: DropTargetArguments) => true);
      const tree = [{ label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description" }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDropProps(iTree.node(tree[0].id)) as DropTargetProps;
      const args = {
        dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None,
        clientOffset: { x: 50, y: 8.33 }, initialClientOffset: { x: 0, y: 0 }, dropRect: { top: 0, left: 0, bottom: 0, right: 0, width: 100, height: 10 },
      };
      callbacks.onDropTargetDrop!(args);
      expect(onDropTargetDrop).to.be.calledWithMatch({ row: 1 });

      callbacks.onDropTargetOver!(args);
      expect(onDropTargetOver).to.be.calledWithMatch({ row: 1 });
    });
    it("should not increment row if dropped on top 1/3", async () => {
      const onDropTargetDrop = sinon.spy();
      const onDropTargetOver = sinon.spy();
      const canDropTargetDrop = sinon.spy((_args: DropTargetArguments) => true);
      const tree = [{
        label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description", children: [
          { label: PropertyRecord.fromString("Raw Child Node"), id: "1.1", description: "child node description" },
        ],
      }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDropProps(iTree.node(tree[0].children[0].id)) as DropTargetProps;
      const args = {
        dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None,
        clientOffset: { x: 50, y: 1.66 }, initialClientOffset: { x: 0, y: 0 }, dropRect: { top: 0, left: 0, bottom: 0, right: 0, width: 100, height: 10 },
      };
      callbacks.onDropTargetOver!(args);
      expect(onDropTargetOver).to.be.calledWithMatch({ row: 0 });

      callbacks.onDropTargetDrop!(args);
      expect(onDropTargetDrop).to.be.calledWithMatch({ row: 0 });

      callbacks.canDropTargetDrop!(args);
      expect(canDropTargetDrop).to.be.calledWithMatch({ row: 0 });
    });
    it("should increment row if dropped on bottom 1/3", async () => {
      const onDropTargetDrop = sinon.spy();
      const onDropTargetOver = sinon.spy();
      const canDropTargetDrop = sinon.spy((_args: DropTargetArguments) => true);
      const tree = [{
        label: PropertyRecord.fromString("Raw Node"), id: "1", description: "node description", children: [
          { label: PropertyRecord.fromString("Raw Child Node"), id: "1.1", description: "child node description" },
        ],
      }];
      const root = renderIntoDocument(<DragDropTree dataProvider={tree} dropProps={{ onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes: ["test"] }} />) as any;
      const iTree = new BeInspireTree<TreeNodeItem>({ dataProvider: tree, mapPayloadToInspireNodeConfig: Tree.inspireNodeFromTreeNodeItem });
      await iTree.ready;
      const callbacks = root.createNodeDropProps(iTree.node(tree[0].children[0].id)) as DropTargetProps;
      const args = {
        dataObject: undefined, dropEffect: DropEffects.Move, dropStatus: DropStatus.None,
        clientOffset: { x: 50, y: 8.33 }, initialClientOffset: { x: 0, y: 0 }, dropRect: { top: 0, left: 0, bottom: 0, right: 0, width: 100, height: 10 },
      };
      callbacks.onDropTargetDrop!(args);
      expect(onDropTargetDrop).to.be.calledWithMatch({ row: 1 });

      callbacks.onDropTargetOver!(args);
      expect(onDropTargetOver).to.be.calledWithMatch({ row: 1 });
    });
  });
});
