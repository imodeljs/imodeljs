/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { shallow } from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { Direction, getToolbarItemProps, PanelsProvider, Toolbar, ToolbarItem, ToolbarItemProps, ToolbarPanelAlignment } from "../../ui-ninezone";
import { mount } from "../Utils";

class Item extends React.Component implements ToolbarItem {
  public panel = document.createElement("div");
  public history = document.createElement("div");

  public override render() {
    return <div></div>;
  }
}

describe("<Toolbar />", () => {
  it("should render", () => {
    mount(<Toolbar />);
  });

  it("renders correctly", () => {
    shallow(<Toolbar />).should.matchSnapshot();
  });

  it("renders with expandsTo", () => {
    const sut = shallow(
      <Toolbar
        expandsTo={Direction.Right}
      />,
    );
    const renderProp = sut.find(PanelsProvider).prop("children");
    const rendered = shallow(renderProp!(undefined) as React.ReactElement<{}>);
    rendered.should.matchSnapshot();
  });

  it("renders with item", () => {
    const rendered = mount(
      <Toolbar
        items={
          <>
            <Item />
          </>
        }
        expandsTo={Direction.Right}
      />,
    );
    rendered.should.matchSnapshot();
  });

  it("renders with panelAlignment", () => {
    const sut = shallow(
      <Toolbar
        panelAlignment={ToolbarPanelAlignment.End}
      />,
    );
    const renderProp = sut.find(PanelsProvider).prop("children");
    const rendered = shallow(renderProp!(undefined) as React.ReactElement<{}>);
    rendered.should.matchSnapshot();
  });
});

class ExpandableItem extends React.Component<ToolbarItemProps<Item>> {
  public override render() {
    return <Item ref={this.props.toolbarItemRef} />;
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const BadItem = () => <div></div>;

class SwitchItem extends React.Component<{}, { isExpandable: boolean }> {
  public override readonly state = {
    isExpandable: false,
  };

  public override render() {
    if (this.state.isExpandable)
      return <ExpandableItem {...this.props} />;
    return <BadItem />;
  }
}

describe("<PanelsProvider />", () => {
  it("should append panels", () => {
    const panels = document.createElement("div");
    const appendChild = sinon.stub(panels, "appendChild").callsFake((newChild: Node) => newChild);
    mount(
      <PanelsProvider
        items={
          <>
            <ExpandableItem />
            <BadItem />
            <ExpandableItem />
          </>
        }
        panels={panels}
      >
        {(items) => items}
      </PanelsProvider>,
    );
    appendChild.calledTwice.should.true;
  });

  it("should remove existing panels", () => {
    const panels = document.createElement("div");
    panels.appendChild(document.createElement("div"));
    panels.appendChild(document.createElement("div"));
    const removeChild = sinon.spy(panels, "removeChild");
    mount(
      <PanelsProvider
        items={
          <ExpandableItem />
        }
        panels={panels}
      >
        {(items) => items}
      </PanelsProvider>,
    );
    removeChild.calledTwice.should.true;
  });

  it("should not clone if item is not a valid element", () => {
    const children = sinon.fake(() => null);
    mount(
      <PanelsProvider
        items="!element"
        panels={null}
      >
        {children}
      </PanelsProvider>,
    );
    children.calledOnce.should.true;
    children.calledWith(sinon.match.array.deepEquals([])).should.true;
  });

  it("should force update", () => {
    const sut = mount(
      <PanelsProvider
        items={
          <>
            <ExpandableItem />
            <SwitchItem />
            <ExpandableItem />
          </>
        }
        panels={null}
      >
        {(items) => items}
      </PanelsProvider>,
    );
    const instance = sut.instance();
    const forceUpdateSpy = sinon.spy(instance, "forceUpdate");
    const switchItem = sut.find(SwitchItem);
    switchItem.setState({ isExpandable: true });

    forceUpdateSpy.calledOnce.should.true;
  });
});

describe("getToolbarItemProps", () => {
  it("should return toolbarItemRef", () => {
    const sut = getToolbarItemProps({
      toolbarItemRef: "abc",
    });
    expect(sut).to.eql({ toolbarItemRef: "abc" });
  });

  it("should return empty object if toolbarItemRef is not set", () => {
    const sut = getToolbarItemProps({
      tir: "abc",
    });
    expect(sut).to.eql({});
  });
});
