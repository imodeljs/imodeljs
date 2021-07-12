/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as faker from "faker";
import * as React from "react";
import { VariableSizeList } from "react-window";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { Orientation } from "@bentley/ui-core";
import { act, fireEvent, getByTitle, render, waitForDomChange, waitForElement } from "@testing-library/react";
import { HighlightingComponentProps } from "../../../ui-components/common/HighlightingComponentProps";
import {
  VirtualizedPropertyGridWithDataProvider, VirtualizedPropertyGridWithDataProviderProps,
} from "../../../ui-components/propertygrid/component/VirtualizedPropertyGridWithDataProvider";
import { FilteredType } from "../../../ui-components/propertygrid/dataproviders/filterers/PropertyDataFiltererBase";
import * as FlatPropertyRendererExports from "../../../ui-components/propertygrid/internal/flat-properties/FlatPropertyRenderer";
import { PropertyCategoryRendererManager } from "../../../ui-components/propertygrid/PropertyCategoryRendererManager";
import {
  IPropertyDataProvider, PropertyCategory, PropertyData, PropertyDataChangeEvent,
} from "../../../ui-components/propertygrid/PropertyDataProvider";
import { ResolvablePromise } from "../../test-helpers/misc";
import TestUtils from "../../TestUtils";

describe("VirtualizedPropertyGridWithDataProvider", () => {
  const categories: PropertyCategory[] = [
    { name: "Group_1", label: "Group 1", expand: true },
    { name: "Group_2", label: "Group 2", expand: false },
  ];
  const records: PropertyRecord[] = [
    TestUtils.createPrimitiveStringProperty("CADID1", "0000 0005 00E0 02D8"),
    TestUtils.createPrimitiveStringProperty("CADID2", "0000 0005 00E0 02D8"),
  ];
  let dataProvider: IPropertyDataProvider;
  let defaultProps: VirtualizedPropertyGridWithDataProviderProps;

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  after(() => {
    TestUtils.terminateUiComponents();
  });

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
    defaultProps = {
      dataProvider,
      orientation: Orientation.Horizontal,
      width: 500,
      height: 1200,
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("rendering", () => {
    it("renders correctly horizontally", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          orientation={Orientation.Horizontal}
          isOrientationFixed={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      expect(container.querySelector(".components-property-record--horizontal")).to.be.not.null;
    });

    it("renders correctly vertically", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          orientation={Orientation.Vertical}
          isOrientationFixed={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      expect(container.querySelector(".components-property-record--vertical")).to.be.not.null;
    });

    it("renders horizontally by default", async () => {
      const { container, findByText } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          orientation={undefined}
          isOrientationFixed={true}
        />,
      );

      await findByText("Group 1");
      expect(container.querySelector(".components-property-record--horizontal")).to.be.not.null;
    });

    it("renders PropertyCategoryBlocks correctly", async () => {
      const { container } = render(<VirtualizedPropertyGridWithDataProvider {...defaultProps} />);

      await TestUtils.flushAsyncOperations();

      const categoryBlocks = container.querySelectorAll(".virtualized-grid-node-category");
      expect(categoryBlocks.length, "Wrong amount of categories").to.be.equal(2);

      expect(categoryBlocks[0].textContent).to.be.equal("Group 1");
      expect(categoryBlocks[1].textContent).to.be.equal("Group 2");
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

      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider  {...defaultProps} dataProvider={dataProvider} />,
      );
      await TestUtils.flushAsyncOperations();

      const categoryBlocks = container.querySelectorAll(".virtualized-grid-node-category");
      expect(categoryBlocks.length, "Wrong amount of categories").to.be.equal(2);
    });

    it("sets passed onPropertyLinkClick event handler to records with link property", async () => {
      const testOnClick = (_text: string) => [];
      const testNestedRecord1 = TestUtils.createPrimitiveStringProperty("CADID1", "0000 0005 00E0 02D8");
      const testNestedRecord2 = TestUtils.createPrimitiveStringProperty("CADID1", "0000 0005 00E0 02D8");
      const testStructRecord = TestUtils.createStructProperty("testStructRecord", { testProperty: testNestedRecord2 });
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
      render(
        <VirtualizedPropertyGridWithDataProvider {...defaultProps} onPropertyLinkClick={propertyLinkClickFnSpy} />,
      );

      await TestUtils.flushAsyncOperations();

      testNestedRecord1.links.onClick("test");
      testStructRecord.links.onClick("test");
      testNestedRecord2.links.onClick("test");

      expect(propertyLinkClickFnSpy.calledThrice).to.be.true;
    });

    it("renders PropertyCategoryBlock as collapsed when it gets clicked", async () => {
      const { container } = render(<VirtualizedPropertyGridWithDataProvider  {...defaultProps} />);

      await TestUtils.flushAsyncOperations();

      let categoryChild = container.querySelector(".virtualized-grid-node span[title=\"CADID1\"]");
      expect(categoryChild, "Category child is not rendered").to.not.be.null;

      const categoryBlocks = container.querySelectorAll(".virtualized-grid-node-category .iui-header");
      expect(categoryBlocks.length, "Wrong amount of categories").to.be.equal(2);
      const categoryBlock = categoryBlocks[0];

      fireEvent.click(categoryBlock);

      categoryChild = container.querySelector(".virtualized-grid-node span[title=\"CADID1\"]");
      expect(categoryChild, "Category child rendered").to.be.null;
    });

    it("keeps the collapsed state of PropertyCategoryBlock when non-nested data is refreshed", async () => {
      const rootCategory1: PropertyCategory = {
        name: "RootCategory1",
        label: "Root1",
        expand: true,
      };
      const childCategory1: PropertyCategory = {
        name: "ChildCategory1",
        label: "Child",
        expand: true,
      };
      rootCategory1.childCategories = [childCategory1];
      const rootCategory2: PropertyCategory = {
        name: "RootCategory2",
        label: "Root2",
        expand: false,
      };
      const childCategory2: PropertyCategory = {
        name: "ChildCategory2",
        label: "Child",
        expand: true,
      };
      rootCategory2.childCategories = [childCategory2];
      dataProvider = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString(faker.random.word()),
          description: faker.random.words(),
          categories: [rootCategory1, rootCategory2],
          records: {
            [rootCategory1.name]: [TestUtils.createPrimitiveStringProperty("rootCategory1Property", "Test", "Test")],
            [childCategory1.name]: [TestUtils.createPrimitiveStringProperty("childCategory1Property", "Test", "Test")],
            [rootCategory2.name]: [TestUtils.createPrimitiveStringProperty("rootCategory2Property", "Test", "Test")],
            [childCategory2.name]: [TestUtils.createPrimitiveStringProperty("childCategory2Property", "Test", "Test")],
          },
          reusePropertyDataState: true,
        }),
      };

      const { findByText, getByText, queryByText } = render(
        <VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={dataProvider} />,
      );

      await findByText("Root1");

      expect(getByText("rootCategory1Property")).to.be.not.null;
      expect(getByText("childCategory1Property")).to.be.not.null;
      expect(queryByText("rootCategory2Property")).to.be.null;
      expect(queryByText("childCategory2Property")).to.be.null;

      fireEvent.click(getByText("Root1"));
      fireEvent.click(getByText("Root2"));

      expect(queryByText("rootCategory1Property")).to.be.null;
      expect(queryByText("childCategory1Property")).to.be.null;
      expect(getByText("rootCategory2Property")).to.be.not.null;
      expect(getByText("childCategory2Property")).to.be.not.null;

      // Refresh PropertyGrid data.
      act(() => dataProvider.onDataChanged.raiseEvent());
      await waitForDomChange();

      expect(queryByText("rootCategory1Property")).to.be.null;
      expect(queryByText("childCategory1Property")).to.be.null;
      expect(getByText("rootCategory2Property")).to.be.not.null;
      expect(getByText("childCategory2Property")).to.be.not.null;
    });

    it("keeps the collapsed state of PropertyCategoryBlock when nested data is refreshed", async () => {
      const rootCategory1: PropertyCategory = {
        name: "RootCategory1",
        label: "Root1",
        expand: true,
      };
      const childCategory1: PropertyCategory = {
        name: "ChildCategory1",
        label: "Child1",
        expand: false,
      };
      rootCategory1.childCategories = [childCategory1];
      const rootCategory2: PropertyCategory = {
        name: "RootCategory2",
        label: "Root2",
        expand: true,
      };
      const childCategory2: PropertyCategory = {
        name: "ChildCategory2",
        label: "Child2",
        expand: true,
      };
      rootCategory2.childCategories = [childCategory2];
      dataProvider = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString(faker.random.word()),
          description: faker.random.words(),
          categories: [rootCategory1, rootCategory2],
          records: {
            [rootCategory1.name]: [TestUtils.createPrimitiveStringProperty("rootCategory1Property", "Test", "Test")],
            [childCategory1.name]: [TestUtils.createPrimitiveStringProperty("childCategory1Property", "Test", "Test")],
            [rootCategory2.name]: [TestUtils.createPrimitiveStringProperty("rootCategory2Property", "Test", "Test")],
            [childCategory2.name]: [TestUtils.createPrimitiveStringProperty("childCategory2Property", "Test", "Test")],
          },
          reusePropertyDataState: true,
        }),
      };

      const { findByText, getByText, queryByText } = render(
        <VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={dataProvider} />,
      );

      await findByText("Root1");

      expect(queryByText("childCategory1Property")).to.be.null;
      expect(getByText("childCategory2Property")).to.be.not.null;

      fireEvent.click(getByText("Child1"));
      fireEvent.click(getByText("Child2"));

      expect(getByText("childCategory1Property")).to.be.not.null;
      expect(queryByText("childCategory2Property")).to.be.null;

      // Refresh PropertyGrid data.
      act(() => dataProvider.onDataChanged.raiseEvent());
      await waitForDomChange();

      expect(getByText("childCategory1Property")).to.be.not.null;
      expect(queryByText("childCategory2Property")).to.be.null;
    });

    it("rerenders if data if the provider changes", async () => {
      const { container } = render(<VirtualizedPropertyGridWithDataProvider {...defaultProps} />);

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

      const categoryBlocks = container.querySelectorAll(".virtualized-grid-node-category");
      expect(categoryBlocks.length).to.be.eq(3);
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
      render(<VirtualizedPropertyGridWithDataProvider {...defaultProps} />);
      await TestUtils.flushAsyncOperations();

      expect(dataFake).to.be.calledOnce;

      // simulate multiple onDataChanged calls
      for (let i = 1; i <= 10; ++i)
        dataProvider.onDataChanged.raiseEvent();

      // resolve the data promise
      await dataPromise.resolve(data);

      // expect data to be requested two more times.
      // Since the first request is already resolved, it should call once for initial change and once for the last change,
      // but not for intermediate ones
      await TestUtils.flushAsyncOperations();
      expect(dataFake).to.be.calledThrice;
    });

    it("changes orientation when props change", async () => {
      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          orientation={Orientation.Horizontal}
          isOrientationFixed={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      expect(container.querySelector(".components-property-record--horizontal")).to.be.not.null;

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          orientation={Orientation.Vertical}
          isOrientationFixed={true}
        />,
      );

      expect(container.querySelector(".components-property-record--vertical")).to.be.not.null;
    });

    it("changes orientation when props change and size is not specified", async () => {
      sinon.stub(HTMLElement.prototype, "offsetHeight").get(() => 1200);
      sinon.stub(HTMLElement.prototype, "offsetWidth").get(() => 500);

      const { container, rerender, findByText } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          width={undefined}
          height={undefined}
          orientation={Orientation.Horizontal}
          isOrientationFixed={true}
        />,
      );

      await findByText("Group 1");
      expect(container.querySelector(".components-property-record--horizontal")).to.be.not.null;

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          width={undefined}
          height={undefined}
          orientation={Orientation.Vertical}
          isOrientationFixed={true}
        />,
      );

      expect(container.querySelector(".components-property-record--vertical")).to.be.not.null;
    });

    it("doesn't change orientation when props change if not necessary", async () => {
      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          orientation={Orientation.Horizontal}
          isOrientationFixed={true}
        />,
      );
      await TestUtils.flushAsyncOperations();
      expect(container.querySelector(".components-property-record--horizontal")).to.be.not.null;

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          orientation={Orientation.Horizontal}
          isOrientationFixed={false}
        />,
      );
      expect(container.querySelector(".components-property-record--horizontal")).to.be.not.null;
    });

    describe("custom category renderers", () => {
      interface SetupDataProviderArgs {
        expandCustomCategory: boolean;
      }

      function setupDataProvider(customCategoryName: string, { expandCustomCategory }: SetupDataProviderArgs): IPropertyDataProvider {
        const rootCategory1: PropertyCategory = {
          name: customCategoryName,
          label: customCategoryName,
          expand: expandCustomCategory,
          renderer: { name: "test_renderer" },
        };
        return {
          onDataChanged: new PropertyDataChangeEvent(),
          getData: async (): Promise<PropertyData> => ({
            label: PropertyRecord.fromString("test_label"),
            description: "test_description",
            categories: [rootCategory1],
            records: {
              [rootCategory1.name]: [TestUtils.createPrimitiveStringProperty("rootCategory1Property", "Test", "Test")],
            },
            reusePropertyDataState: true,
          }),
        };
      }

      before(() => {
        // eslint-disable-next-line react/display-name
        PropertyCategoryRendererManager.defaultManager.addRenderer("test_renderer", () => () => <>Custom renderer</>);
      });

      after(() => {
        PropertyCategoryRendererManager.defaultManager.removeRenderer("test_renderer");
      });

      it("uses custom category renderer when category specifies one", async () => {
        dataProvider = setupDataProvider("test_category", { expandCustomCategory: true });
        const { findByText } = render(
          <VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={dataProvider} />,
        );
        expect(await findByText("Custom renderer")).not.to.be.null;
      });

      it("uses property category renderer manager from props when available", async () => {
        dataProvider = setupDataProvider("test_category", { expandCustomCategory: true });
        const rendererManager = new PropertyCategoryRendererManager();
        // eslint-disable-next-line react/display-name
        rendererManager.addRenderer("test_renderer", () => () => <>Test renderer from props</>);
        const { findByText } = render(
          <VirtualizedPropertyGridWithDataProvider
            {...defaultProps}
            dataProvider={dataProvider}
            propertyCategoryRendererManager={rendererManager}
          />,
        );
        expect(await findByText("Test renderer from props")).not.to.be.null;
      });

      it("updates node height on expansion", async () => {
        sinon.stub(HTMLElement.prototype, "getBoundingClientRect").get(() => () => ({ height: 500 }));
        dataProvider = setupDataProvider("test_category", { expandCustomCategory: false });

        const { baseElement, findByText } = render(
          <VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={dataProvider} />,
        );

        const category = await findByText("test_category");
        expect(baseElement.querySelector(".iui-expanded")).to.not.exist;
        const node = baseElement.querySelector(".virtualized-grid-node") as HTMLElement;
        expect(node.style.height).to.be.equal("39px");

        fireEvent.click(category);
        expect(baseElement.querySelector(".iui-expanded")).to.exist;
        expect(node.style.height).to.be.equal("536px");
      });

      it("updates node height on collapse", async () => {
        sinon.stub(HTMLElement.prototype, "getBoundingClientRect").get(() => () => ({ height: 500 }));
        dataProvider = setupDataProvider("test_category", { expandCustomCategory: true });

        const { baseElement, findByText } = render(
          <VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={dataProvider} />,
        );

        const category = await findByText("test_category");
        const node = baseElement.querySelector(".virtualized-grid-node") as HTMLElement;
        expect(node.style.height).to.be.equal("536px");

        fireEvent.click(category);
        expect(node.style.height).to.be.equal("39px");
      });
    });
  });

  describe("dynamic node heights", () => {
    const StubComponent: React.FC<FlatPropertyRendererExports.FlatPropertyRendererProps> = (props) => {
      React.useLayoutEffect(() => props.onHeightChanged!(15));
      return <>Stub Component</>;
    };

    beforeEach(() => {
      const rootCategory: PropertyCategory = {
        name: "root",
        label: "Root Category",
        expand: true,
      };

      defaultProps.dataProvider = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async () => ({
          label: PropertyRecord.fromString("Test Label"),
          description: faker.random.words(),
          categories: [rootCategory],
          records: {
            [rootCategory.name]: [TestUtils.createMultilineTextPropertyRecord("testProperty", "Test")],
          },
        }),
      };

      sinon.stub(FlatPropertyRendererExports, "FlatPropertyRenderer").callsFake(StubComponent);
    });

    it("reacts to node height change", async () => {
      const { findByText, baseElement } = render(<VirtualizedPropertyGridWithDataProvider {...defaultProps} />);
      await findByText("Stub Component");

      const node = baseElement.querySelectorAll(".virtualized-grid-node")[1] as HTMLElement;
      expect(node.style.height).to.be.equal("26px");
    });

    it("adds more height to dynamic nodes when orientation is vertical", async () => {
      const { findByText, baseElement } = render(
        <VirtualizedPropertyGridWithDataProvider {...defaultProps} orientation={Orientation.Vertical} />,
      );
      await findByText("Stub Component");

      const node = baseElement.querySelectorAll(".virtualized-grid-node")[1] as HTMLElement;
      expect(node.style.height).to.be.equal("41px");
    });
  });

  describe("property selection", () => {
    it("calls onPropertySelectionChanged when property gets clicked and selection is enabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={true}
          onPropertySelectionChanged={onPropertySelectionChanged}
        />,
      );

      await TestUtils.flushAsyncOperations();

      expect(onPropertySelectionChanged.called).to.be.false;

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);

      const clickableComponent = clickableComponents[0];
      fireEvent.click(clickableComponent);

      expect(onPropertySelectionChanged.called).to.be.true;
    });

    it("deselects if clicked a 2nd time", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider {...defaultProps} isPropertySelectionEnabled={true} />,
      );

      await TestUtils.flushAsyncOperations();

      expect(container.querySelectorAll(".components--selected").length).to.be.equal(0);

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);
      const clickableComponent = clickableComponents[0];
      fireEvent.click(clickableComponent);

      expect(container.querySelectorAll(".components--selected").length).to.be.equal(1);

      fireEvent.click(clickableComponent);

      expect(container.querySelectorAll(".components--selected").length).to.be.equal(0);
    });

    it("does not call onPropertySelectionChanged when property gets clicked and selection is disabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={false}
          onPropertySelectionChanged={onPropertySelectionChanged}
          isOrientationFixed={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const renderedRecords = container.querySelectorAll(".components-property-record--horizontal");
      expect(renderedRecords.length).to.be.greaterThan(0);

      fireEvent.click(renderedRecords[0]);

      expect(onPropertySelectionChanged.called).to.be.false;
    });

    it("calls onPropertySelectionChanged when property gets right clicked and right click selection is enabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={true}
          onPropertySelectionChanged={onPropertySelectionChanged}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);

      fireEvent.contextMenu(clickableComponents[0]);

      expect(onPropertySelectionChanged.called).to.be.true;
    });

    it("calls onPropertySelectionChanged once when property gets right clicked after left clicked and both left and right click selections are enabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionOnRightClickEnabled={true}
          isPropertySelectionEnabled={true}
          onPropertySelectionChanged={onPropertySelectionChanged}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);

      const clickableComponent = clickableComponents[0];

      fireEvent.click(clickableComponent);
      fireEvent.contextMenu(clickableComponent);

      expect(onPropertySelectionChanged.callCount).to.be.equal(2);
    });

    it("does not deselect if right clicked a 2nd time", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);
      const clickableComponent = clickableComponents[0];

      fireEvent.contextMenu(clickableComponent);
      expect(container.querySelectorAll(".components--selected").length).to.eq(1);

      fireEvent.contextMenu(clickableComponent);
      expect(container.querySelectorAll(".components--selected").length).to.eq(1);
    });

    it("deselects if left clicked after right clicked", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);
      const clickableComponent = clickableComponents[0];

      fireEvent.contextMenu(clickableComponent);
      expect(container.querySelectorAll(".components--selected").length).to.eq(1);

      fireEvent.click(clickableComponent);
      expect(container.querySelectorAll(".components--selected").length).to.eq(0);
    });

    it("does not call onPropertySelectionChanged when property gets right clicked and selection is disabled", async () => {
      const onPropertySelectionChanged = sinon.spy();
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={true}
          isPropertySelectionOnRightClickEnabled={false}
          onPropertySelectionChanged={onPropertySelectionChanged}
          isOrientationFixed={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);

      fireEvent.contextMenu(clickableComponents[0]);

      expect(onPropertySelectionChanged.called).to.be.false;
    });
  });

  describe("property hover", () => {
    it("enables property hovering", async () => {
      const { findByText, getByRole } = render(
        <VirtualizedPropertyGridWithDataProvider {...defaultProps} isPropertyHoverEnabled={true} />,
      );

      await findByText("Group 1");
      expect([...getByRole("presentation").classList.values()]).to.contain("components--hoverable");
    });
  });

  describe("property editing", () => {
    it("starts editor on click & commits on Enter", async () => {
      const spyMethod = sinon.spy();
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertyEditingEnabled={true}
          onPropertyUpdated={spyMethod}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);

      fireEvent.click(clickableComponents[0]);

      const cellEditors = container.querySelectorAll("input.components-cell-editor");
      expect(cellEditors.length).to.be.equal(1);

      fireEvent.keyDown(cellEditors[0], { key: "Enter" });

      await TestUtils.flushAsyncOperations();

      expect(spyMethod).to.be.calledOnce;
    });

    it("does not start editor on click if not selected yet", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={true}   // when this is true, user must click once to select then again to edit
          isPropertyEditingEnabled={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);

      fireEvent.click(clickableComponents[0]);

      expect(container.querySelectorAll(".components-cell-editor").length).to.be.equal(0);
    });

    it("starts editor on click if clicked before to select", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          isPropertySelectionEnabled={true}   // when this is true, user must click once to select then again to edit
          isPropertyEditingEnabled={true}
        />,
      );

      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components--clickable");
      expect(clickableComponents.length).to.be.greaterThan(0);
      fireEvent.click(clickableComponents[0]);

      expect(container.querySelectorAll(".components--selected").length).to.be.equal(1);

      fireEvent.click(clickableComponents[0]);

      const cellEditors = container.querySelectorAll("input.components-cell-editor");
      expect(cellEditors.length).to.be.equal(1);

      const inputNode = cellEditors[0];
      fireEvent.keyDown(inputNode, { key: "Escape" });

      await TestUtils.flushAsyncOperations();

      expect(container.querySelectorAll(".components-cell-editor").length, "Cell editor did not disappear after pressing Escape").to.eq(0);
    });
  });

  describe("context menu", () => {
    it("calls onPropertyContextMenu callback when right clicked on a property", async () => {
      const callback = sinon.spy();
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          onPropertyContextMenu={callback}
          isOrientationFixed={true}
        />,
      );
      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".components-property-record--horizontal");
      expect(clickableComponents.length).to.be.greaterThan(0);
      fireEvent.contextMenu(clickableComponents[0]);

      expect(callback).to.be.calledOnce;
      expect(callback.firstCall.args[0].propertyRecord).to.deep.eq(records[0]);
    });
  });

  describe("Nested border tests", () => {
    it("Wraps simple content in nested borders correctly", async () => {
      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider {...defaultProps} isOrientationFixed={true} />,
      );
      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".virtualized-grid-node");
      expect(clickableComponents.length).to.be.equal(3);

      expect(clickableComponents[0].querySelector(".virtualized-grid-node > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[1].querySelector(".virtualized-grid-node > .nested-border-middle.nested-border-bottom > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[2].querySelector(".virtualized-grid-node > .virtualized-grid-node-content")).to.be.not.null;
    });

    it("Wraps nested content in nested borders correctly", async () => {
      const parentCategory: PropertyCategory = {
        name: "ParentCategory",
        label: "Parent",
        expand: true,
      };
      const childCategory1: PropertyCategory = {
        name: "ChildCategory1",
        label: "Child",
        expand: true,
      };
      const childCategory2: PropertyCategory = {
        name: "ChildCategory2",
        label: "Child",
        expand: true,
      };
      parentCategory.childCategories = [childCategory1, childCategory2];
      dataProvider = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString(faker.random.word()),
          description: faker.random.words(),
          categories: [parentCategory],
          records: {
            [parentCategory.name]: [
              TestUtils.createArrayProperty("testArray", [
                TestUtils.createPrimitiveStringProperty("test1", "Test", "Test"),
                TestUtils.createPrimitiveStringProperty("test2", "Test", "Test"),
                TestUtils.createPrimitiveStringProperty("test3", "Test", "Test"),
              ], true),
            ],
            [childCategory1.name]: [
              TestUtils.createPrimitiveStringProperty("test4", "Test", "Test"),
              TestUtils.createStructProperty("testStruct", {
                test5: TestUtils.createPrimitiveStringProperty("test5", "Test", "Test"),
                test6: TestUtils.createPrimitiveStringProperty("test6", "Test", "Test"),
                test7: TestUtils.createPrimitiveStringProperty("test7", "Test", "Test"),
              }, true),
            ],
            [childCategory2.name]: [],
          },
        }),
      };

      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={dataProvider}
          isOrientationFixed={true}
        />,
      );
      await TestUtils.flushAsyncOperations();

      const clickableComponents = container.querySelectorAll(".virtualized-grid-node");
      expect(clickableComponents.length).to.be.equal(12);

      expect(clickableComponents[0].querySelector(".virtualized-grid-node > .virtualized-grid-node-category")).to.be.not.null;
      expect(clickableComponents[1].querySelector(".virtualized-grid-node > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[2].querySelector(".virtualized-grid-node > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[3].querySelector(".virtualized-grid-node > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[4].querySelector(".virtualized-grid-node > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;

      expect(clickableComponents[5].querySelector(".virtualized-grid-node > .nested-border-middle > .virtualized-grid-node-category")).to.be.not.null;
      expect(clickableComponents[6].querySelector(".virtualized-grid-node > .nested-border-middle > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[7].querySelector(".virtualized-grid-node > .nested-border-middle > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[8].querySelector(".virtualized-grid-node > .nested-border-middle > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[9].querySelector(".virtualized-grid-node > .nested-border-middle > .nested-border-middle > .virtualized-grid-node-content")).to.be.not.null;
      expect(clickableComponents[10].querySelector(".virtualized-grid-node > .nested-border-middle > .nested-border-middle.nested-border-bottom > .virtualized-grid-node-content")).to.be.not.null;

      expect(clickableComponents[11].querySelector(".virtualized-grid-node > .nested-border-middle.nested-border-bottom > .virtualized-grid-node-category")).to.be.not.null;
    });
  });

  describe("Should virtualize property rendering", () => {
    it("Should render less than provided data, when provided 1000 records", async () => {
      const parentCategory: PropertyCategory = {
        name: "ParentCategory",
        label: "Parent",
        expand: true,
      };
      dataProvider = {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString(faker.random.word()),
          description: faker.random.words(),
          categories: [parentCategory],
          records: {
            [parentCategory.name]: Array.from({ length: 1000 }).map((_, index) => TestUtils.createPrimitiveStringProperty(`test${index}`, "Test", "Test")),
          },
        }),
      };

      const { container } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={dataProvider}
          isOrientationFixed={true}
        />,
      );
      await TestUtils.flushAsyncOperations();

      const gridNodes = container.querySelectorAll(".virtualized-grid-node");
      expect(gridNodes.length).to.be.greaterThan(0);
      expect(gridNodes.length).to.be.lessThan(1000);
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

    const { rerender, unmount } = render(
      <VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={providerMock1.object} />,
    );
    expect(evt1.numberOfListeners).to.eq(1, "listener should be added when component is mounted");

    rerender(<VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={providerMock1.object} />);
    expect(evt1.numberOfListeners).to.eq(1, "additional listener should not be added when data provider doesn't change");

    rerender(<VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={providerMock2.object} />);
    expect(evt1.numberOfListeners).to.eq(0, "listener should be removed when data provider is not used anymore");
    expect(evt2.numberOfListeners).to.eq(1, "listener should be added when data provider changes");

    unmount();
    expect(evt2.numberOfListeners).to.eq(0, "listener should be removed when component is unmounted");
  });

  describe("Should handle scrolling to item", () => {
    const parentCategory: PropertyCategory = {
      name: "ParentCategory",
      label: "Parent",
      expand: true,
    };
    const highlightValue: HighlightingComponentProps & {
      filteredTypes: FilteredType[];
    } = {
      highlightedText: "test",
      activeHighlight: {
        highlightedItemIdentifier: "test2",
        highlightIndex: 0,
      },
      filteredTypes: [FilteredType.Value],
    };
    const highlightCategory: HighlightingComponentProps & {
      filteredTypes: FilteredType[];
    } = {
      highlightedText: "PARENT",
      activeHighlight: {
        highlightedItemIdentifier: "ParentCategory",
        highlightIndex: 0,
      },
      filteredTypes: [FilteredType.Category],
    };
    const highlightLabel: HighlightingComponentProps & {
      filteredTypes: FilteredType[];
    } = {
      highlightedText: "test",
      activeHighlight: {
        highlightedItemIdentifier: "test2",
        highlightIndex: 0,
      },
      filteredTypes: [FilteredType.Label],
    };
    const highlight1: HighlightingComponentProps & {
      filteredTypes?: FilteredType[];
    } = {
      highlightedText: "Test",
      activeHighlight: {
        highlightedItemIdentifier: "testtest",
        highlightIndex: 0,
      },
    };

    it("scrolls to highlighted value when highlight is updated", async () => {
      const providerMock = moq.Mock.ofType<IPropertyDataProvider>();
      providerMock.setup(async (x) => x.getData()).returns(async () => ({
        label: PropertyRecord.fromString(""), categories: [parentCategory],
        records: {
          [parentCategory.name]: Array.from({ length: 10 }).map((_, index) => TestUtils.createPrimitiveStringProperty(`test${index}`, "Test", "Test")),
        },
      }));
      const evt = new PropertyDataChangeEvent();
      providerMock.setup((x) => x.onDataChanged).returns(() => evt);

      const scrollToItemFake = sinon.fake();
      sinon.replace(VariableSizeList.prototype, "scrollToItem", scrollToItemFake);

      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlight1}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlightValue}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      expect(scrollToItemFake).to.have.been.calledOnceWithExactly(3);
    });

    it("scrolls to highlighted category when highlight is updated", async () => {
      const providerMock = moq.Mock.ofType<IPropertyDataProvider>();
      providerMock.setup(async (x) => x.getData()).returns(async () => ({
        label: PropertyRecord.fromString(""), categories: [parentCategory],
        records: {
          [parentCategory.name]: Array.from({ length: 10 }).map((_, index) => TestUtils.createPrimitiveStringProperty(`test${index}`, "Test", "Test")),
        },
      }));
      const evt = new PropertyDataChangeEvent();
      providerMock.setup((x) => x.onDataChanged).returns(() => evt);

      const scrollToItemFake = sinon.fake();
      sinon.replace(VariableSizeList.prototype, "scrollToItem", scrollToItemFake);

      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlight1}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlightCategory}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      expect(scrollToItemFake).to.have.been.calledOnceWithExactly(0);
    });

    it("scrolls to highlighted label when highlight is updated", async () => {
      const providerMock = moq.Mock.ofType<IPropertyDataProvider>();
      providerMock.setup(async (x) => x.getData()).returns(async () => ({
        label: PropertyRecord.fromString(""), categories: [parentCategory],
        records: {
          [parentCategory.name]: Array.from({ length: 10 }).map((_, index) => TestUtils.createPrimitiveStringProperty(`test${index}`, "Test", "Test")),
        },
      }));
      const evt = new PropertyDataChangeEvent();
      providerMock.setup((x) => x.onDataChanged).returns(() => evt);

      const scrollToItemFake = sinon.fake();
      sinon.replace(VariableSizeList.prototype, "scrollToItem", scrollToItemFake);

      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlight1}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlightLabel}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      expect(scrollToItemFake).to.have.been.calledOnceWithExactly(3);
    });

    it("doesn't scroll to item when activeMatch is not provided", async () => {
      const providerMock = moq.Mock.ofType<IPropertyDataProvider>();
      providerMock.setup(async (x) => x.getData()).returns(async () => ({
        label: PropertyRecord.fromString(""), categories: [parentCategory],
        records: {
          [parentCategory.name]: Array.from({ length: 10 }).map((_, index) => TestUtils.createPrimitiveStringProperty(`test${index}`, "Test", "Test")),
        },
      }));
      const evt = new PropertyDataChangeEvent();
      providerMock.setup((x) => x.onDataChanged).returns(() => evt);

      const scrollToItemFake = sinon.fake();
      sinon.replace(VariableSizeList.prototype, "scrollToItem", scrollToItemFake);

      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlight1}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={{ highlightedText: "test" }}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });
      expect(scrollToItemFake).to.not.have.been.called;

      rerender(<VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={providerMock.object} />);
      await waitForElement(() => getByTitle(container, "test9"), { container });
      expect(scrollToItemFake).to.not.have.been.called;
    });

    it("doesn't scroll to item when there are no items in the grid", async () => {
      const providerMock = moq.Mock.ofType<IPropertyDataProvider>();
      providerMock.setup(async (x) => x.getData()).returns(async () => ({ label: PropertyRecord.fromString(""), categories: [], records: {} }));
      const evt = new PropertyDataChangeEvent();
      providerMock.setup((x) => x.onDataChanged).returns(() => evt);

      const scrollToItemFake = sinon.fake();
      sinon.replace(VariableSizeList.prototype, "scrollToItem", scrollToItemFake);

      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlightValue}
        />,
      );
      await waitForElement(() => container.querySelector(".components-virtualized-property-grid"));

      rerender(<VirtualizedPropertyGridWithDataProvider {...defaultProps} dataProvider={providerMock.object} />);
      await waitForElement(() => container.querySelector(".components-virtualized-property-grid"));

      expect(scrollToItemFake).to.not.have.been.called;
    });

    it("doesn't scroll to item if there is no matching item in the grid", async () => {
      const highlight3 = {
        highlightedText: "test",
        activeHighlight: {
          highlightedItemIdentifier: "falseTest2",
          highlightIndex: 0,
        },
        filteredTypes: [FilteredType.Value],
      };

      const providerMock = moq.Mock.ofType<IPropertyDataProvider>();
      providerMock.setup(async (x) => x.getData()).returns(async () => ({
        label: PropertyRecord.fromString(""), categories: [parentCategory],
        records: {
          [parentCategory.name]: Array.from({ length: 10 }).map((_, index) => TestUtils.createPrimitiveStringProperty(`test${index}`, "Test", "Test")),
        },
      }));
      const evt = new PropertyDataChangeEvent();
      providerMock.setup((x) => x.onDataChanged).returns(() => evt);

      const scrollToItemFake = sinon.fake();
      sinon.replace(VariableSizeList.prototype, "scrollToItem", scrollToItemFake);

      const { container, rerender } = render(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlight1}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });

      rerender(
        <VirtualizedPropertyGridWithDataProvider
          {...defaultProps}
          dataProvider={providerMock.object}
          highlight={highlight3}
        />,
      );
      await waitForElement(() => getByTitle(container, "test9"), { container });
      expect(scrollToItemFake).to.not.have.been.called;
    });
  });
});
