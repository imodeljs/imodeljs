/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { mount, shallow } from "enzyme";
import * as faker from "faker";
import * as React from "react";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { Orientation, ResizableContainerObserver } from "@bentley/ui-core";
import { PropertyCategoryBlock } from "../../../ui-components/propertygrid/component/PropertyCategoryBlock";
import { PropertyGrid } from "../../../ui-components/propertygrid/component/PropertyGrid";
import {
  IPropertyDataProvider, PropertyCategory, PropertyData, PropertyDataChangeEvent,
} from "../../../ui-components/propertygrid/PropertyDataProvider";
import { ResolvablePromise } from "../../test-helpers/misc";
import TestUtils from "../../TestUtils";
import { fireEvent, render } from "@testing-library/react";
import { PropertyGridCommons } from "../../../ui-components/propertygrid/component/PropertyGridCommons";
/* eslint-disable @typescript-eslint/naming-convention */

describe("PropertyGrid", () => {

  const categories: PropertyCategory[] = [
    { name: "Group_1", label: "Group 1", expand: true },
    { name: "Group_2", label: "Group 2", expand: false },
  ];
  const records: PropertyRecord[] = [
    TestUtils.createPrimitiveStringProperty("CADID1", "0000 0005 00E0 02D8"),
    TestUtils.createPrimitiveStringProperty("CADID2", "0000 0005 00E0 02D8"),
  ];
  let dataProvider: IPropertyDataProvider;

  beforeEach(() => {
    const evt = new PropertyDataChangeEvent();
    dataProvider = {
      onDataChanged: evt,
      getData: async (): Promise<PropertyData> => ({
        label: PropertyRecord.fromString(faker.random.word()),
        description: faker.random.words(),
        categories,
        records: {
          Group_1: [records[0]],
          Group_2: [records[1]],
        },
      }),
    };
  });

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  after(() => {
    TestUtils.terminateUiComponents();
  });

  describe("rendering", () => {

    it("renders correctly horizontally", async () => {
      const wrapper = mount(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={dataProvider} isOrientationFixed={true} />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      expect(wrapper.find(".components-property-list--horizontal").first().exists()).to.be.true;
    });

    it("renders correctly vertically", async () => {
      const wrapper = mount(<PropertyGrid orientation={Orientation.Vertical} dataProvider={dataProvider} isOrientationFixed={true} />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      expect(wrapper.find(".components-property-list--vertical").first().exists()).to.be.true;
    });

    it("renders PropertyCategoryBlocks correctly", async () => {
      const wrapper = mount(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={dataProvider} />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      let categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "First category block does not exist").to.be.true;

      categoryBlock = wrapper.find(PropertyCategoryBlock).at(1);
      expect(categoryBlock.exists(), "Second category block does not exist").to.be.true;
    });

    it("renders nested property categories", async () => {
      const parentCategory: PropertyCategory = {
        name: "ParentCategory",
        label: "Parent",
        expand: true,
      };
      const childCategory: PropertyCategory = {
        name: "ChildCategory",
        label: "Child",
        expand: true,
      };
      parentCategory.childCategories = [childCategory];
      dataProvider = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString(faker.random.word()),
          description: faker.random.words(),
          categories: [parentCategory],
          records: {
            [childCategory.name]: [TestUtils.createPrimitiveStringProperty("test", "Test", "Test")],
          },
        }),
      };
      const wrapper = mount(<PropertyGrid dataProvider={dataProvider} />);
      await TestUtils.flushAsyncOperations();
      wrapper.update();

      const categoryBlocks = wrapper.find(PropertyCategoryBlock);
      expect(categoryBlocks.length).to.eq(2);
    });

    it("sets passed onPropertyLinkClick event handler to records with link property", async () => {
      const testOnClick = (_text: string) => [];
      const testNestedRecord1 = TestUtils.createPrimitiveStringProperty("CADID1", "0000 0005 00E0 02D8");
      const testNestedRecord2 = TestUtils.createPrimitiveStringProperty("CADID1", "0000 0005 00E0 02D8");
      // eslint-disable-next-line quote-props
      const testStructRecord = TestUtils.createStructProperty("testStructRecord", { "testProperty": testNestedRecord2 });
      const testArrayRecord = TestUtils.createArrayProperty("testArrayRecord", [testNestedRecord1, testStructRecord]);
      testNestedRecord1.links = {
        onClick: testOnClick,
      };
      testNestedRecord2.links = {
        onClick: testOnClick,
      };
      testStructRecord.links = {
        onClick: testOnClick,
      };

      dataProvider.getData = async (): Promise<PropertyData> => ({
        label: PropertyRecord.fromString(faker.random.word()),
        description: faker.random.words(),
        categories: [...categories],
        records: {
          Group_1: [testArrayRecord],
          Group_2: [records[0]],
        },
      });
      const propertyLinkClickFnSpy = sinon.spy();
      const wrapper = mount(<PropertyGrid
        orientation={Orientation.Horizontal}
        dataProvider={dataProvider}
        onPropertyLinkClick={propertyLinkClickFnSpy} />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      testNestedRecord1.links.onClick("test");
      testStructRecord.links.onClick("test");
      testNestedRecord2.links.onClick("test");

      expect(propertyLinkClickFnSpy.calledThrice).to.be.true;
    });

    it("renders PropertyCategoryBlock as collapsed when it gets clicked", async () => {
      const wrapper = mount<PropertyGrid>(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={dataProvider} />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".iui-header").simulate("click");

      const isExpanded = wrapper.state().categories[0].category.expand;
      expect(isExpanded, "Category did not get collapsed").to.be.false;
    });

    it("keeps the collapsed state of PropertyCategoryBlock when data is refreshed", async () => {
      const rootCategory1: PropertyCategory = {
        name: "RootCategory1",
        label: "Root1",
        expand: true,
      };
      const childCategory: PropertyCategory = {
        name: "ChildCategory",
        label: "Child",
        expand: false,
      };
      rootCategory1.childCategories = [childCategory];
      const rootCategory2: PropertyCategory = {
        name: "RootCategory2",
        label: "Root2",
        expand: false,
      };
      dataProvider = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString(faker.random.word()),
          description: faker.random.words(),
          categories: [rootCategory1, rootCategory2],
          records: {
            [childCategory.name]: [TestUtils.createPrimitiveStringProperty("test", "Test", "Test")],
          },
        }),
      };

      const wrapper = mount<PropertyGrid>(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={dataProvider} />);
      await TestUtils.flushAsyncOperations();
      wrapper.update();

      const rootCategoryBlock1 = wrapper.find(PropertyCategoryBlock).at(0);
      const childCategoryBlock = wrapper.find(PropertyCategoryBlock).at(1);
      const rootCategoryBlock2 = wrapper.find(PropertyCategoryBlock).at(2);

      rootCategoryBlock1.find(".iui-header").first().simulate("click");
      childCategoryBlock.find(".iui-header").simulate("click");
      rootCategoryBlock2.find(".iui-header").simulate("click");

      expect(wrapper.state().categories[0].category.expand, "First root category did not get collapsed").to.be.false;
      expect(wrapper.state().categories[0].children[0].category.expand, "Child category did not get expanded").to.be.true;
      expect(wrapper.state().categories[1].category.expand, "Second root category did not get expanded").to.be.true;

      // Refresh PropertyGrid data.
      dataProvider.onDataChanged.raiseEvent();
      await TestUtils.flushAsyncOperations();

      expect(wrapper.state().categories[0].category.expand, "First root category did not stay collapsed").to.be.false;
      expect(wrapper.state().categories[0].children[0].category.expand, "Child category did not stay expanded").to.be.true;
      expect(wrapper.state().categories[1].category.expand, "Second root category did not stay expanded").to.be.true;
    });

    it("rerenders if data in the provider changes", async () => {
      const wrapper = mount(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={dataProvider} />);

      dataProvider.getData = async (): Promise<PropertyData> => ({
        label: PropertyRecord.fromString(faker.random.word()),
        description: faker.random.words(),
        categories: [...categories, { name: "Group_3", label: "Group 3", expand: false }],
        records: {
          Group_1: [records[0]],
          Group_2: [records[1]],
          Group_3: [],
        },
      });
      dataProvider.onDataChanged.raiseEvent();

      await TestUtils.flushAsyncOperations();
      wrapper.update();

      const categoryBlocks = wrapper.find(PropertyCategoryBlock);
      expect(categoryBlocks.children().length).to.be.eq(3);
    });

    it("rerenders when provider changes", async () => {
      const wrapper = mount(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={dataProvider} />);
      await TestUtils.flushAsyncOperations();
      wrapper.update();
      expect(wrapper.find(PropertyCategoryBlock).children().length).to.eq(2);

      const provider2 = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString("two"),
          categories: [categories[0]],
          records: {
            Group_1: [PropertyRecord.fromString("test", "test")],
          },
        }),
      };
      wrapper.setProps({ dataProvider: provider2 });
      await TestUtils.flushAsyncOperations();
      wrapper.update();
      expect(wrapper.find(PropertyCategoryBlock).children().length).to.eq(1);
    });

    it("doesn't rerender on intermediate data changes", async () => {
      const data: PropertyData = {
        label: PropertyRecord.fromString(faker.random.word()),
        categories: [{ label: faker.random.word(), name: "test", expand: true }],
        records: {
          test: [
            new PropertyRecord(
              { valueFormat: PropertyValueFormat.Primitive, displayValue: faker.random.word() },
              { typename: faker.database.type(), name: faker.random.word(), displayLabel: faker.random.word() }),
          ],
        },
      };
      const dataPromise = new ResolvablePromise<PropertyData>();
      const dataFake = sinon.fake.returns(dataPromise);
      dataProvider.getData = dataFake;

      // first render
      shallow(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={dataProvider} />);
      expect(dataFake).to.be.calledOnce;

      // simulate multiple onDataChanged calls
      for (let i = 1; i <= 10; ++i)
        dataProvider.onDataChanged.raiseEvent();

      // resolve the data promise
      await dataPromise.resolve(data);

      // expect data to be requested one more time for the last change,
      // but not for intermediate ones
      expect(dataFake).to.be.calledTwice;
    });

    it("changes orientation when props change", async () => {
      const propertyGridMount = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isOrientationFixed={true}
        />);

      await TestUtils.flushAsyncOperations();
      propertyGridMount.update();

      expect(propertyGridMount.state("orientation")).to.be.eq(Orientation.Horizontal);

      propertyGridMount.setProps({ orientation: Orientation.Vertical });

      expect(propertyGridMount.state("orientation")).to.be.eq(Orientation.Vertical);
    });

    describe("responsive behavior", () => {

      it("changes orientation when width is lower than 300", async () => {
        const propertyGridMount = mount(
          <PropertyGrid
            dataProvider={dataProvider}
            horizontalOrientationMinWidth={275}
            isOrientationFixed={false}
          />);

        await TestUtils.flushAsyncOperations();
        propertyGridMount.update();

        const resizeDetector = propertyGridMount.find(ResizableContainerObserver);
        expect(resizeDetector.length).to.eq(1);

        resizeDetector.prop("onResize")!(250, 400);
        propertyGridMount.update();

        expect(propertyGridMount.state("orientation")).to.be.eq(Orientation.Vertical);

        resizeDetector.prop("onResize")!(274, 400);
        propertyGridMount.update();

        expect(propertyGridMount.state("orientation")).to.be.eq(Orientation.Vertical);

        resizeDetector.prop("onResize")!(400, 400);
        propertyGridMount.update();

        expect(propertyGridMount.state("orientation")).to.be.eq(Orientation.Horizontal);

        resizeDetector.prop("onResize")!(400, 500);
        propertyGridMount.update();

        expect(propertyGridMount.state("orientation")).to.be.eq(Orientation.Horizontal);
      });

    });

  });

  describe("property selection", () => {

    it("calls onPropertySelectionChanged when property gets clicked and selection is enabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}
          onPropertySelectionChanged={onPropertySelectionChanged}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components--clickable").simulate("click");

      expect(onPropertySelectionChanged.called).to.be.true;
    });

    it("deselects if clicked a 2nd time", async () => {
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components--clickable").simulate("click");
      wrapper.update();
      expect(wrapper.find(".components--selected").length).to.eq(1);

      categoryBlock.find(".components--clickable").simulate("click");
      wrapper.update();
      expect(wrapper.find(".components--selected").length).to.eq(0);
    });

    it("does not call onPropertySelectionChanged when property gets clicked and selection is disabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={false}
          onPropertySelectionChanged={onPropertySelectionChanged}
          isOrientationFixed={true}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components-property-record--horizontal").simulate("click");

      expect(onPropertySelectionChanged.called).to.be.false;
    });

    it("calls onPropertySelectionChanged when property gets right clicked and right click selection is enabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={true}
          onPropertySelectionChanged={onPropertySelectionChanged}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components--clickable").simulate("contextMenu");

      expect(onPropertySelectionChanged.called).to.be.true;
    });

    it("calls onPropertySelectionChanged once when property gets right clicked after left clicked and both left and right click selections are enabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionOnRightClickEnabled={true}
          isPropertySelectionEnabled={true}
          onPropertySelectionChanged={onPropertySelectionChanged}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components--clickable").simulate("click");
      categoryBlock.find(".components--clickable").simulate("contextMenu");

      expect(onPropertySelectionChanged.callCount).to.be.equal(2);
    });

    it("does not deselect if right clicked a 2nd time", async () => {
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={true}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components--clickable").simulate("contextMenu");
      wrapper.update();
      expect(wrapper.find(".components--selected").length).to.eq(1);

      categoryBlock.find(".components--clickable").simulate("contextMenu");
      wrapper.update();
      expect(wrapper.find(".components--selected").length).to.eq(1);
    });

    it("deselects if left clicked after right clicked", async () => {
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={true}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components--clickable").simulate("contextMenu");
      wrapper.update();
      expect(wrapper.find(".components--selected").length).to.eq(1);

      categoryBlock.find(".components--clickable").simulate("click");
      wrapper.update();
      expect(wrapper.find(".components--selected").length).to.eq(0);
    });

    it("does not call onPropertySelectionChanged when property gets right clicked and selection is disabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={false}
          onPropertySelectionChanged={onPropertySelectionChanged}
          isOrientationFixed={true}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components-property-record--horizontal").simulate("contextMenu");

      expect(onPropertySelectionChanged.called).to.be.false;
    });
  });

  describe("property editing", () => {

    it("starts editor on click & commits on Enter", async () => {
      const spyMethod = sinon.spy();
      const wrapper = render(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertyEditingEnabled={true}
          onPropertyUpdated={spyMethod}
        />);

      await TestUtils.flushAsyncOperations();

      const clickable = wrapper.container.querySelector(".components--clickable");
      expect(clickable).not.to.be.null;
      fireEvent.click(clickable!);

      expect(wrapper.container.querySelector("input.components-cell-editor")).not.to.be.null;

      const inputNode = wrapper.container.querySelector("input");
      expect(inputNode).not.to.be.null;
      fireEvent.keyDown(inputNode as HTMLElement, { key: "Enter" });
      await TestUtils.flushAsyncOperations();
      expect(spyMethod).to.be.calledOnce;
    });

    it("does not start editor on click if not selected yet", async () => {
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}   // when this is true, user must click once to select then again to edit
          isPropertyEditingEnabled={true}
        />);

      await TestUtils.flushAsyncOperations();

      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      categoryBlock.find(".components--clickable").simulate("click");
      wrapper.update();

      expect(wrapper.find(".components-cell-editor").length).to.eq(0);
    });

    it("starts editor on click if clicked before to select", async () => {
      const wrapper = render(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertySelectionEnabled={true}   // when this is true, user must click once to select then again to edit
          isPropertyEditingEnabled={true}
        />);

      await TestUtils.flushAsyncOperations();

      const clickable = wrapper.container.querySelector(".components--clickable");
      expect(clickable).not.to.be.null;
      fireEvent.click(clickable!);
      expect(wrapper.container.querySelector(".components--selected")).not.to.be.null;

      fireEvent.click(clickable!);
      expect(wrapper.container.querySelector("input.components-cell-editor")).not.to.be.null;

      const inputNode = wrapper.container.querySelector("input");
      expect(inputNode).not.to.be.null;
      fireEvent.keyDown(inputNode as HTMLElement, { key: "Escape" });
      await TestUtils.flushAsyncOperations();
      expect(wrapper.container.querySelector(".components-cell-editor"), "Cell editor did not disappear after pressing Escape").to.be.null;
    });

  });

  describe("property hover", () => {
    it("enables property hovering", async () => {
      const wrapper = render(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          isPropertyHoverEnabled={true}
        />);

      await wrapper.findByText("Group 1");
      expect(wrapper.container.querySelector(".components--hoverable")).not.to.be.null;
    });
  });

  describe("context menu", () => {

    it("calls onPropertyContextMenu callback when right clicked on a property", async () => {
      const callback = sinon.spy();
      const wrapper = mount(
        <PropertyGrid
          orientation={Orientation.Horizontal}
          dataProvider={dataProvider}
          onPropertyContextMenu={callback}
          isOrientationFixed={true}
        />);
      await TestUtils.flushAsyncOperations();
      wrapper.update();

      const categoryBlock = wrapper.find(PropertyCategoryBlock).at(0);
      expect(categoryBlock.exists(), "Category block does not exist").to.be.true;

      const propertyView = categoryBlock.find(".components-property-record--horizontal");
      propertyView.simulate("contextMenu");
      expect(callback).to.be.calledOnce;
      expect(callback.firstCall.args[0].propertyRecord).to.deep.eq(records[0]);
    });

  });

  it("handles onDataChanged event subscriptions when mounting, changing props and unmounting", () => {
    const evt1 = new PropertyDataChangeEvent();
    const providerMock1 = moq.Mock.ofType<IPropertyDataProvider>();
    providerMock1.setup(async (x) => x.getData()).returns(async () => ({ label: PropertyRecord.fromString(""), categories: [], records: {} }));
    providerMock1.setup((x) => x.onDataChanged).returns(() => evt1);

    const evt2 = new PropertyDataChangeEvent();
    const providerMock2 = moq.Mock.ofType<IPropertyDataProvider>();
    providerMock2.setup(async (x) => x.getData()).returns(async () => ({ label: PropertyRecord.fromString(""), categories: [], records: {} }));
    providerMock2.setup((x) => x.onDataChanged).returns(() => evt2);

    const pane = shallow(<PropertyGrid orientation={Orientation.Horizontal} dataProvider={providerMock1.object} />);
    expect(evt1.numberOfListeners).to.eq(1, "listener should be added when component is mounted");

    pane.setProps({ orientation: Orientation.Horizontal, dataProvider: providerMock1.object });
    expect(evt1.numberOfListeners).to.eq(1, "additional listener should not be added when data provider doesn't change");

    pane.setProps({ orientation: Orientation.Horizontal, dataProvider: providerMock2.object });
    expect(evt1.numberOfListeners).to.eq(0, "listener should be removed when data provider is not used anymore");
    expect(evt2.numberOfListeners).to.eq(1, "listener should be added when data provider changes");

    pane.unmount();
    expect(evt2.numberOfListeners).to.eq(0, "listener should be removed when component is unmounted");
  });

});
describe("PropertyGrid Commons", () => {

  describe("getLinks", () => {

    it("detects url link", () => {
      const testLinkWithIndexes = { link: "Link: https://www.testLink.com", linkIndexes: { start: 6, end: 30 } };
      const linkResult = PropertyGridCommons.getLinks(testLinkWithIndexes.link);
      expect(linkResult.length).to.be.equal(1);
      expect(linkResult[0].start).to.be.equal(testLinkWithIndexes.linkIndexes.start);
      expect(linkResult[0].end).to.be.equal(testLinkWithIndexes.linkIndexes.end);
    });

  });

  describe("handleLinkClick", () => {
    const locationMockRef: moq.IMock<Location> = moq.Mock.ofInstance(location);
    let spy: sinon.SinonStub<[(string | undefined)?, (string | undefined)?, (string | undefined)?, (boolean | undefined)?], Window | null>;

    before(() => {
      location = locationMockRef.object;
    });

    after(() => {
      locationMockRef.reset();
    });

    afterEach(() => {
      spy.restore();
    });

    it("opens new window if the link text was found without http schema", async () => {
      spy = sinon.stub(window, "open");
      spy.returns(null);

      PropertyGridCommons.handleLinkClick("www.testLink.com");
      expect(spy).to.be.calledOnceWith("http://www.testLink.com", "_blank");
    });

    it("opens new window if the link text was found in record with http schema", async () => {
      spy = sinon.stub(window, "open");
      spy.returns(null);

      PropertyGridCommons.handleLinkClick("http://www.testLink.com");
      expect(spy).to.be.calledOnceWith("http://www.testLink.com", "_blank");
    });

    it("does not open new window if there were no url links", async () => {
      spy = sinon.stub(window, "open");
      spy.returns(null);

      PropertyGridCommons.handleLinkClick("not an url link");
      PropertyGridCommons.handleLinkClick("testEmail@mail.com");
      sinon.assert.notCalled(spy);
    });

    it("sets location href value to value got in the text if it is an email link", async () => {
      PropertyGridCommons.handleLinkClick("someOtherLink@mail.com");
      expect(locationMockRef.object.href).to.be.equal("mailto:someOtherLink@mail.com");
    });

    it("sets location href value to value got in the text if it is an ProjectWise Explorer link", async () => {
      PropertyGridCommons.handleLinkClick("pw://server.bentley.com:datasource-01/Documents/ProjectName");
      expect(locationMockRef.object.href).to.be.equal("pw://server.bentley.com:datasource-01/Documents/ProjectName");
    });

    it("calls window.open.focus if window.open returns not null", () => {
      const windowMock = moq.Mock.ofType<Window>();
      windowMock.setup((x) => x.focus());

      spy = sinon.stub(window, "open");
      spy.returns(windowMock.object);

      PropertyGridCommons.handleLinkClick("www.testLink.com");

      expect(spy).to.be.calledOnceWith("http://www.testLink.com", "_blank");
      windowMock.verify((x) => x.focus(), moq.Times.once());
    });
  });

});
