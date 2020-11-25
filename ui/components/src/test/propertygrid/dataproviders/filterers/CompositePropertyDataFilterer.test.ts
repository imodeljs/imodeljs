/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord } from "@bentley/ui-abstract";
import {
  CompositeFilterType, CompositePropertyDataFilterer,
} from "../../../../ui-components/propertygrid/dataproviders/filterers/CompositePropertyDataFilterer";
import {
  IPropertyDataFilterer, PropertyFilterChangeEvent,
} from "../../../../ui-components/propertygrid/dataproviders/filterers/PropertyDataFiltererBase";
import { PropertyCategory } from "../../../../ui-components/propertygrid/PropertyDataProvider";
import { TestUtils } from "../../../TestUtils";

describe("CompositePropertyDataFilterer", () => {

  const testRecord = TestUtils.createPrimitiveStringProperty("Test", "Test");
  const testCategory = { name: "Cat1", label: "Category 1", expand: true, childCategories: [] };
  const testRecordArray: PropertyRecord[] = [TestUtils.createPrimitiveStringProperty("TestParent", "TestParent")];
  const testCategoryArray: PropertyCategory[] = [{ name: "Par1", label: "Parent 1", expand: true, childCategories: [] }];
  let leftFilterMock = moq.Mock.ofType<IPropertyDataFilterer>();
  let rightFilterMock = moq.Mock.ofType<IPropertyDataFilterer>();

  let leftOnFilterChanged: PropertyFilterChangeEvent;
  let rightOnFilterChanged: PropertyFilterChangeEvent;

  beforeEach(() => {
    leftFilterMock = moq.Mock.ofType<IPropertyDataFilterer>();
    rightFilterMock = moq.Mock.ofType<IPropertyDataFilterer>();

    leftOnFilterChanged = new PropertyFilterChangeEvent();
    rightOnFilterChanged = new PropertyFilterChangeEvent();

    leftFilterMock.setup((x) => x.onFilterChanged).returns(() => leftOnFilterChanged);
    rightFilterMock.setup((x) => x.onFilterChanged).returns(() => rightOnFilterChanged);
  });

  describe("AND operator", () => {
    it("Should listen to on change events", () => {
      const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);
      const changeSpy = sinon.spy();

      compositeFilter.onFilterChanged.addListener(changeSpy);

      expect(changeSpy.callCount).to.be.equal(0);

      leftOnFilterChanged.raiseEvent();
      expect(changeSpy.callCount).to.be.equal(1);

      rightOnFilterChanged.raiseEvent();
      expect(changeSpy.callCount).to.be.equal(2);
    });

    describe("isActive", () => {
      it("Should return filtering disabled if both filters disabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => false);
        rightFilterMock.setup((x) => x.isActive).returns(() => false);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(false);
      });

      it("Should return filtering enabled if left filter enabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => true);
        rightFilterMock.setup((x) => x.isActive).returns(() => false);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(true);
      });

      it("Should return filtering enabled if right filter enabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => false);
        rightFilterMock.setup((x) => x.isActive).returns(() => true);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(true);
      });

      it("Should return filtering enabled if both filters enabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => true);
        rightFilterMock.setup((x) => x.isActive).returns(() => true);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(true);
      });
    });

    describe("matchesFilter", () => {
      it("Should not match PropertyRecord if both filters do not match", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should not match PropertyCategory if both filters do not match", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should not match PropertyRecord if left filter does not match", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should not match PropertyCategory if left filter does not match", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should not match PropertyRecord if right filter does not match", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should not match PropertyCategory if right filter does not match", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should match PropertyRecord if both filters match", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should match PropertyCategory if both filters match", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should return true for shouldExpandNodeParents and shouldForceIncludeChildren when either filter returns these as true when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should return true for shouldExpandNodeParents and shouldForceIncludeChildren when either filter returns these as true when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should return matchesCount equal to the sum of matchesCount of right and left filters if both of them match when Filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 2, value: 3 } }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 6, value: 7 } });
      });

      it("Should return matchesCount equal to the sum of matchesCount of right and left filters if both of them match when Filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 2, value: 3 } }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.And, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 6, value: 7 } });
      });
    });
  });

  describe("OR operator", () => {
    it("Should listen to on change events", () => {
      const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);
      const changeSpy = sinon.spy();

      compositeFilter.onFilterChanged.addListener(changeSpy);

      expect(changeSpy.callCount).to.be.equal(0);

      leftOnFilterChanged.raiseEvent();
      expect(changeSpy.callCount).to.be.equal(1);

      rightOnFilterChanged.raiseEvent();
      expect(changeSpy.callCount).to.be.equal(2);
    });

    describe("isActive", () => {
      it("Should return filtering disabled if both filters disabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => false);
        rightFilterMock.setup((x) => x.isActive).returns(() => false);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(false);
      });

      it("Should return filtering enabled if left filter enabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => true);
        rightFilterMock.setup((x) => x.isActive).returns(() => false);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(true);
      });

      it("Should return filtering enabled if right filter enabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => false);
        rightFilterMock.setup((x) => x.isActive).returns(() => true);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(true);
      });

      it("Should return filtering enabled if both filters enabled", () => {
        leftFilterMock.setup((x) => x.isActive).returns(() => true);
        rightFilterMock.setup((x) => x.isActive).returns(() => true);

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        expect(compositeFilter.isActive).to.be.equal(true);
      });
    });

    describe("matchesFilter", () => {
      it("Should not match PropertyRecord if both filters do not match", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should not match PropertyCategory if both filters do not match", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it("Should match PropertyRecord if left filter matches", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should match PropertyCategory if left filter matches", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should match PropertyRecord if right filter matches", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should match PropertyCategory if right filter matches", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should match PropertyRecord if both filters match", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should match PropertyCategory if both filters match", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should return true for shouldExpandNodeParents and shouldForceIncludeChildren when either filter returns these as true when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should return true for shouldExpandNodeParents and shouldForceIncludeChildren when either filter returns these as true when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldExpandNodeParents: true }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should return matchesCount equal to the matchesCount of left filter if right filter doesn't match when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } });
      });

      it("Should return matchesCount equal to the matchesCount of left filter if right filter doesn't match when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } });
      });

      it("Should return matchesCount equal to the matchesCount of right filter if left filter doesn't match when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } });
      });

      it("Should return matchesCount equal to the matchesCount of right filter if left filter doesn't match when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: false }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } });
      });

      it("Should return matchesCount equal to the sum of matchesCount of right and left filters if both of them match when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 1 } }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 8, value: 5 } });
      });

      it("Should return matchesCount equal to the sum of matchesCount of right and left filters if both of them match when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 1 } }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 8, value: 5 } });
      });

      it("Should return matchesCount with undefined value count if both of the filterers had undefined value count when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: undefined } }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: undefined } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 8, value: undefined } });
      });

      it("Should return matchesCount with undefined value count if both of the filterers had undefined value count when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: undefined } }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 4, value: undefined } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 8, value: undefined } });
      });

      it("Should return matchesCount with undefined label count if both of the filterers had undefined label count when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 1 } }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 5 } });
      });

      it("Should return matchesCount with undefined label count if both of the filterers had undefined label count when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 1 } }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 5 } });
      });

      it("Should return matchesCount equal to the defined variables of the filterers if opposing variables were undefined when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 5, value: undefined } }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 5, value: 4 } });
      });

      it("Should return matchesCount equal to the defined variables of the filterers if opposing variables were undefined  when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 5, value: undefined } }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: 4 } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: 5, value: 4 } });
      });

      it("Should return matchesCount values equal to undefined if both filterers matchesCount values were undefined when filtering PropertyRecord", async () => {
        leftFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } }));
        rightFilterMock.setup(async (x) => x.recordMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.recordMatchesFilter(testRecord, testRecordArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });

      it("Should return matchesCount values equal to undefined if both filterers matchesCount values were undefined when filtering PropertyCategory", async () => {
        leftFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } }));
        rightFilterMock.setup(async (x) => x.categoryMatchesFilter(moq.It.isAny(), moq.It.isAny())).returns(async () => ({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } }));

        const compositeFilter = new CompositePropertyDataFilterer(leftFilterMock.object, CompositeFilterType.Or, rightFilterMock.object);

        const matchResult = await compositeFilter.categoryMatchesFilter(testCategory, testCategoryArray);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldForceIncludeDescendants: true, shouldExpandNodeParents: true, matchesCount: { label: undefined, value: undefined } });
      });
    });
  });
});
