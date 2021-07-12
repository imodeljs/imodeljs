/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import "@bentley/presentation-frontend/lib/test/_helpers/MockFrontendEnvironment";
import { expect } from "chai";
import * as faker from "faker";
import * as path from "path";
import * as sinon from "sinon";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { I18N } from "@bentley/imodeljs-i18n";
import {
  Content, DefaultContentDisplayTypes, Descriptor, DisplayValue, FieldDescriptorType, Item, KeySet, NestedContentValue, PresentationError,
  SortDirection as PresentationSortDirection, RelationshipMeaning, ValuesDictionary,
} from "@bentley/presentation-common";
import { createTestContentDescriptor, createTestSimpleContentField } from "@bentley/presentation-common/lib/test/_helpers/Content";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { PromiseContainer } from "@bentley/presentation-common/lib/test/_helpers/Promises";
import {
  createRandomDescriptor, createRandomECInstanceKey, createRandomNestedContentField, createRandomPrimitiveField,
} from "@bentley/presentation-common/lib/test/_helpers/random";
import { Presentation, PresentationManager } from "@bentley/presentation-frontend";
import { RowItem } from "@bentley/ui-components";
import { HorizontalAlignment, SortDirection } from "@bentley/ui-core";
import { CacheInvalidationProps } from "../../presentation-components/common/ContentDataProvider";
import { initializeLocalization } from "../../presentation-components/common/Utils";
import { PresentationTableDataProvider, TABLE_DATA_PROVIDER_DEFAULT_PAGE_SIZE } from "../../presentation-components/table/DataProvider";
import { mockPresentationManager } from "../_helpers/UiComponents";

/**
 * This is just a helper class to provide public access to
 * protected methods of PresentationTableDataProvider
 */
class Provider extends PresentationTableDataProvider {
  public override invalidateCache(props: CacheInvalidationProps) { super.invalidateCache(props); }
  public override shouldConfigureContentDescriptor() { return super.shouldConfigureContentDescriptor(); } // eslint-disable-line deprecation/deprecation
  public override configureContentDescriptor(descriptor: Descriptor) { return super.configureContentDescriptor(descriptor); } // eslint-disable-line deprecation/deprecation
  public override getDescriptorOverrides() { return super.getDescriptorOverrides(); }
}

describe("TableDataProvider", () => {

  let rulesetId: string;
  let provider: Provider;
  let invalidateCacheSpy: sinon.SinonSpy<[CacheInvalidationProps], void>;
  let presentationManagerMock: moq.IMock<PresentationManager>;
  const imodelMock = moq.Mock.ofType<IModelConnection>();

  before(() => {
    rulesetId = faker.random.word();
  });

  beforeEach(async () => {
    const mocks = mockPresentationManager();
    presentationManagerMock = mocks.presentationManager;
    Presentation.setPresentationManager(presentationManagerMock.object);
    Presentation.setI18nManager(new I18N("", {
      urlTemplate: `file://${path.resolve("public/locales")}/{{lng}}/{{ns}}.json`,
    }));
    await initializeLocalization();

    provider = new Provider({ imodel: imodelMock.object, ruleset: rulesetId });
    provider.keys = new KeySet([createRandomECInstanceKey()]);
    invalidateCacheSpy = sinon.spy(provider, "invalidateCache");
  });

  afterEach(() => {
    Presentation.terminate();
  });

  const createEmptyContentItem = (): Item => {
    return new Item([createRandomECInstanceKey()], faker.random.words(),
      "", undefined, {}, {}, []);
  };
  const createContent = (recordsCount: number, itemsGenerator: () => Item = createEmptyContentItem): Content => {
    const descriptor = createRandomDescriptor();
    const records = new Array<Item>();
    while (recordsCount--) {
      records.push(itemsGenerator());
    }
    return new Content(descriptor, records);
  };
  const createSingleRecordContent = (itemsGenerator?: () => Item) => createContent(1, itemsGenerator);

  describe("constructor", () => {

    it("sets display type to GRID", () => {
      expect(provider.displayType).to.eq(DefaultContentDisplayTypes.Grid);
    });

    it("sets default sorting properties", () => {
      expect(provider.sortColumnKey).to.be.undefined;
      expect(provider.sortDirection).to.eq(SortDirection.NoSort);
    });

    it("sets default page size", () => {
      expect(provider.pagingSize).to.be.eq(TABLE_DATA_PROVIDER_DEFAULT_PAGE_SIZE);
    });

  });

  describe("getRowKey", () => {

    it("returns valid deserialized InstanceKey", () => {
      const key = createRandomECInstanceKey();
      const row: RowItem = {
        key: JSON.stringify(key),
        cells: [],
      };
      const result = provider.getRowKey(row);
      expect(result).to.deep.eq(key);
    });

  });

  describe("invalidateCache", () => {

    it("resets filtering, sorting, memoized columns and raises onColumnsChanged event when 'descriptor' flag is set", async () => {
      const onColumnsChangedSpy = sinon.spy(provider.onColumnsChanged, "raiseEvent");
      presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
        .returns(async () => createRandomDescriptor());

      provider.filterExpression = faker.random.words();
      await provider.sort(0, SortDirection.Descending);

      invalidateCacheSpy.resetHistory();
      onColumnsChangedSpy.resetHistory();

      provider.invalidateCache({ descriptor: true });

      expect(provider.filterExpression).to.be.undefined;
      expect(provider.sortColumnKey).to.be.undefined;
      expect(provider.sortDirection).to.eq(SortDirection.NoSort);
      expect(provider.getColumns.cache.keys).to.be.empty;
      expect(onColumnsChangedSpy).to.be.calledOnce;
    });

    it("resets memoized columns and raises onColumnsChanged event when 'descriptorConfiguration' flag is set", () => {
      const onColumnsChangedSpy = sinon.spy(provider.onColumnsChanged, "raiseEvent");

      provider.invalidateCache({ descriptorConfiguration: true });

      expect(provider.getColumns.cache.keys).to.be.empty;
      expect(onColumnsChangedSpy).to.be.calledOnce;
    });

    it("resets cached pages and raises onRowsChanged event when 'size' flag is set", async () => {
      const onRowsChangedSpy = sinon.spy(provider.onRowsChanged, "raiseEvent");

      const getContentMock = moq.Mock.ofInstance((provider as any).getContent);
      getContentMock.setup((x) => x(moq.It.isAny())).returns(async () => createSingleRecordContent());
      (provider as any).getContent = getContentMock.object;

      expect(await provider.getRow(0)).to.not.be.undefined;
      expect(provider.getLoadedRow(0)).to.not.be.undefined;

      provider.invalidateCache({ size: true });

      expect(provider.getLoadedRow(0)).to.be.undefined;
      expect(onRowsChangedSpy).to.be.calledOnce;
    });

    it("resets cached pages and raises onRowsChanged event when 'content' flag is set", async () => {
      const onRowsChangedSpy = sinon.spy(provider.onRowsChanged, "raiseEvent");

      const getContentMock = moq.Mock.ofInstance((provider as any).getContent);
      getContentMock.setup((x) => x(moq.It.isAny())).returns(async () => createSingleRecordContent());
      getContentMock.object.cache = { clear: () => { } };
      (provider as any).getContent = getContentMock.object;

      expect(await provider.getRow(0)).to.not.be.undefined;
      expect(provider.getLoadedRow(0)).to.not.be.undefined;

      provider.invalidateCache({ content: true });

      expect(provider.getLoadedRow(0)).to.be.undefined;
      expect(onRowsChangedSpy).to.be.calledOnce;
    });

  });

  describe("shouldConfigureContentDescriptor", () => {

    it("return false", () => {
      expect(provider.shouldConfigureContentDescriptor()).to.be.false;
    });

  });

  describe("filterExpression", () => {

    it("sets a different filterExpression and clears caches", () => {
      provider.filterExpression = "test 1";
      expect(provider.filterExpression).to.eq("test 1");
      invalidateCacheSpy.resetHistory();

      provider.filterExpression = "test 2";
      expect(provider.filterExpression).to.eq("test 2");
      expect(invalidateCacheSpy).to.be.calledOnce;
    });

    it("doesn't clear caches if setting to the same filterExpression", () => {
      provider.filterExpression = "test";
      expect(provider.filterExpression).to.eq("test");
      invalidateCacheSpy.resetHistory();

      provider.filterExpression = "test";
      expect(provider.filterExpression).to.eq("test");
      expect(invalidateCacheSpy).to.not.be.called;
    });

    it("applies filter expression to descriptor overrides", () => {
      provider.filterExpression = "test";
      expect(provider.getDescriptorOverrides()).to.deep.eq({
        displayType: provider.displayType,
        filterExpression: "test",
      });
    });

  });

  describe("sort", () => {

    it("throws when trying to sort by invalid column", async () => {
      const source = createRandomDescriptor(undefined, []);
      presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
        .returns(async () => source);
      await expect(provider.sort(0, SortDirection.NoSort)).to.eventually.be.rejectedWith(PresentationError);
    });

    it("invalidates descriptor configuration and content", async () => {
      const source = createRandomDescriptor();
      presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
        .returns(async () => source);
      const invalidateCacheMock = moq.Mock.ofInstance(provider.invalidateCache);
      provider.invalidateCache = invalidateCacheMock.object;
      await provider.sort(0, SortDirection.NoSort);
      invalidateCacheMock.verify((x) => x({ descriptorConfiguration: true, content: true }), moq.Times.once());
    });

    it("sets sorting properties", async () => {
      const source = createRandomDescriptor();
      presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
        .returns(async () => source);

      await provider.sort(0, SortDirection.Descending);
      expect(provider.sortColumnKey).to.eq((await provider.getColumns())[0].key);
      expect(provider.sortDirection).to.eq(SortDirection.Descending);
      expect(provider.getDescriptorOverrides()).to.deep.eq({
        displayType: provider.displayType,
        sorting: {
          field: { type: FieldDescriptorType.Name, fieldName: provider.sortColumnKey },
          direction: PresentationSortDirection.Descending,
        },
      });

      await provider.sort(0, SortDirection.Ascending);
      expect(provider.sortColumnKey).to.eq((await provider.getColumns())[0].key);
      expect(provider.sortDirection).to.eq(SortDirection.Ascending);
      expect(provider.getDescriptorOverrides()).to.deep.eq({
        displayType: provider.displayType,
        sorting: {
          field: { type: FieldDescriptorType.Name, fieldName: provider.sortColumnKey },
          direction: PresentationSortDirection.Ascending,
        },
      });

      await provider.sort(0, SortDirection.NoSort);
      expect(provider.sortColumnKey).to.eq((await provider.getColumns())[0].key);
      expect(provider.sortDirection).to.eq(SortDirection.NoSort);
      expect(provider.getDescriptorOverrides()).to.deep.eq({
        displayType: provider.displayType,
      });
    });

  });

  describe("sortColumn", () => {

    it("returns undefined when no sorting column is set", async () => {
      expect(await provider.sortColumn).to.be.undefined;
    });

    it("returns valid sorting column", async () => {
      const source = createRandomDescriptor();
      presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
        .returns(async () => source);
      await provider.sort(0, SortDirection.Descending);
      const sortingColumn = await provider.sortColumn;
      expect(sortingColumn).to.eq((await provider.getColumns())[0]);
    });

  });

  describe("getColumns", () => {

    it("returns valid column descriptions", async () => {
      const descriptor = createRandomDescriptor();
      (provider as any).getContentDescriptor = () => descriptor;
      const cols = await provider.getColumns();
      expect(cols).to.matchSnapshot();
    });

    it("returns empty list when descriptor is undefined", async () => {
      (provider as any).getContentDescriptor = () => undefined;
      const cols = await provider.getColumns();
      expect(cols).to.deep.eq([]);
    });

    it("sorts columns by priority and label", async () => {
      (provider as any).getContentDescriptor = () => createTestContentDescriptor({
        fields: [
          createTestSimpleContentField({ priority: 2, label: "C" }),
          createTestSimpleContentField({ priority: 2, label: "B" }),
          createTestSimpleContentField({ priority: 1, label: "A" }),
        ],
      });
      const cols = await provider.getColumns();
      expect(cols).to.containSubset([{
        label: "B",
      }, {
        label: "C",
      }, {
        label: "A",
      }]);
    });

    it("returns one column descriptor when display type is list", async () => {
      const descriptor = createRandomDescriptor(DefaultContentDisplayTypes.List);
      (provider as any).getContentDescriptor = () => descriptor;
      const cols = await provider.getColumns();
      expect(cols.length).to.be.eq(1);
      expect(cols).to.matchSnapshot();
    });

    it("extracts nested fields of sameInstance", async () => {
      const childFields = [createRandomPrimitiveField(), createRandomPrimitiveField()];
      const childNestedField = createRandomNestedContentField(childFields);
      childNestedField.relationshipMeaning = RelationshipMeaning.SameInstance;
      const fields = [createRandomPrimitiveField(), createRandomPrimitiveField(), childNestedField];
      const nestedField = createRandomNestedContentField(fields);
      nestedField.relationshipMeaning = RelationshipMeaning.SameInstance;
      const descriptor = createRandomDescriptor(undefined, [nestedField]);
      (provider as any).getContentDescriptor = () => descriptor;
      const cols = await provider.getColumns();
      expect(cols.length).to.be.eq(4);
      expect(cols[0].label).to.be.eq(fields[0].label);
      expect(cols[1].label).to.be.eq(fields[1].label);
      expect(cols[2].label).to.be.eq(childFields[0].label);
      expect(cols[3].label).to.be.eq(childFields[1].label);
    });

    it("memoizes result", async () => {
      const descriptor = createRandomDescriptor();
      const resultPromiseContainer = new PromiseContainer<Descriptor>();
      const getContentDescriptorMock = moq.Mock.ofInstance(() => (provider as any).getContentDescriptor);
      getContentDescriptorMock.setup((x) => x()).returns(async () => resultPromiseContainer.promise).verifiable(moq.Times.once());
      getContentDescriptorMock.setup((x) => x()).verifiable(moq.Times.never());
      (provider as any).getContentDescriptor = getContentDescriptorMock.object;

      const requests = [1, 2].map(async () => provider.getColumns());
      resultPromiseContainer.resolve(descriptor);
      const response = await Promise.all(requests);
      expect(response[0]).to.deep.eq(response[1], "both responses should be equal");
      presentationManagerMock.verifyAll();
    });

  });

  describe("getRowsCount", () => {

    it("returns count from base class", async () => {
      const size = faker.random.number();
      (provider as any).getContentSetSize = () => size;
      const count = await provider.getRowsCount();
      expect(count).to.eq(size);
    });

  });

  describe("getRow", () => {

    it("returns undefined when content is undefined", async () => {
      (provider as any).getContent = async () => undefined;
      const row = await provider.getRow(0);
      expect(row).to.be.undefined;
    });

    it("returns undefined when content contains no records", async () => {
      (provider as any).getContent = async () => createContent(0);
      const row = await provider.getRow(0);
      expect(row).to.be.undefined;
    });

    it("throws when content record is invalid - contains invalid number of primary keys", async () => {
      const record = createEmptyContentItem();
      record.primaryKeys = [];
      (provider as any).getContent = async () => new Content(createRandomDescriptor(), [record]);
      await expect(provider.getRow(0)).to.eventually.be.rejectedWith(PresentationError);
    });

    it("requests content in pages", async () => {
      provider = new Provider({
        imodel: imodelMock.object,
        ruleset: rulesetId,
        pageSize: 2,
        cachedPagesCount: 10,
      });
      const contentResolver = [0, 1].map(() => new PromiseContainer<Content>());

      const getContentMock = moq.Mock.ofInstance((provider as any).getContent);
      (provider as any).getContent = getContentMock.object;
      getContentMock.setup((x) => x({ start: 0, size: 2 })).returns(async () => contentResolver[0].promise).verifiable(moq.Times.once());
      getContentMock.setup((x) => x({ start: 2, size: 2 })).returns(async () => contentResolver[1].promise).verifiable(moq.Times.once());

      // request rows without await to make sure paging is handled properly (new
      // pages are not created while other pages for the same position are being loaded)
      const requests = [0, 1, 2].map(async (index) => provider.getRow(index));
      contentResolver.forEach((resolver) => resolver.resolve(createContent(2)));
      const rows = await Promise.all(requests);
      rows.forEach((row) => expect(row).to.not.be.undefined);

      // verify the last row in second page is also loaded (even though we didn't request it)
      expect(provider.getLoadedRow(3)).to.not.be.undefined;

      // verify getContent was called once per page
      getContentMock.verifyAll();
    });

    it("returns valid row item", async () => {
      const descriptor = createRandomDescriptor();
      const values: ValuesDictionary<any> = {};
      const displayValues: ValuesDictionary<any> = {};
      descriptor.fields.forEach((field) => {
        values[field.name] = faker.random.word();
        displayValues[field.name] = faker.random.words();
      });
      const record = new Item([createRandomECInstanceKey()],
        faker.random.words(), faker.random.word(), undefined, values, displayValues, []);
      (provider as any).getContent = async () => new Content(descriptor, [record]);
      const row = await provider.getRow(0);
      expect(row).to.matchSnapshot();
    });

    it("extracts rows with nested sameInstance field and sets mergedFieldsCount if there was more than one value in the nestedField", async () => {
      const fields = [createRandomPrimitiveField(), createRandomPrimitiveField()];
      const nestedField = createRandomNestedContentField(fields);
      nestedField.relationshipMeaning = RelationshipMeaning.SameInstance;
      const descriptor = createRandomDescriptor(undefined, [nestedField]);
      const values = {
        [nestedField.name]: [{
          primaryKeys: [createRandomECInstanceKey()],
          values: {
            [nestedField.nestedFields[0].name]: faker.random.word(),
            [nestedField.nestedFields[1].name]: faker.random.word(),
          },
          displayValues: {
            [nestedField.nestedFields[0].name]: faker.random.words(),
            [nestedField.nestedFields[1].name]: faker.random.words(),
          },
          mergedFieldNames: [],
        }, {
          primaryKeys: [createRandomECInstanceKey()],
          values: {
            [nestedField.nestedFields[0].name]: faker.random.word(),
            [nestedField.nestedFields[1].name]: faker.random.word(),
          },
          displayValues: {
            [nestedField.nestedFields[0].name]: faker.random.words(),
            [nestedField.nestedFields[1].name]: faker.random.words(),
          },
          mergedFieldNames: [],
        }] as NestedContentValue[],
      };
      const displayValues = {
        [nestedField.name]: [{
          primaryKeys: [createRandomECInstanceKey()],
          values: {
            [nestedField.nestedFields[0].name]: faker.random.word(),
            [nestedField.nestedFields[1].name]: faker.random.word(),
          },
          displayValues: {
            [nestedField.nestedFields[0].name]: faker.random.words(),
            [nestedField.nestedFields[1].name]: faker.random.words(),
          },
          mergedFieldNames: [],
        }, {
          primaryKeys: [createRandomECInstanceKey()],
          values: {
            [nestedField.nestedFields[0].name]: faker.random.word(),
            [nestedField.nestedFields[1].name]: faker.random.word(),
          },
          displayValues: {
            [nestedField.nestedFields[0].name]: faker.random.words(),
            [nestedField.nestedFields[1].name]: faker.random.words(),
          },
          mergedFieldNames: [],
        }] as DisplayValue[],
      };
      const record = new Item([createRandomECInstanceKey()],
        faker.random.words(), faker.random.word(), undefined, values, displayValues, []);
      (provider as any).getContent = async () => new Content(descriptor, [record]);
      const row = await provider.getRow(0);
      expect(row.cells.length).to.eq(2);

      expect(row.cells[0].mergedCellsCount).to.eq(2);
      expect(row.cells[0].alignment).to.eq(HorizontalAlignment.Center);
      expect(row.cells[1].mergedCellsCount).to.be.undefined;
      expect(row.cells[1].alignment).to.be.undefined;
    });

    it("extracts rows with nested sameInstance field and doesn't set mergedFieldsCount if there is only one value in the nestedField", async () => {
      const childFields = [createRandomPrimitiveField(), createRandomPrimitiveField()];
      const childNestedField = createRandomNestedContentField(childFields);
      childNestedField.relationshipMeaning = RelationshipMeaning.SameInstance;
      const fields = [createRandomPrimitiveField(), createRandomPrimitiveField(), childNestedField];
      const nestedField = createRandomNestedContentField(fields);
      nestedField.relationshipMeaning = RelationshipMeaning.SameInstance;
      const descriptor = createRandomDescriptor(undefined, [nestedField]);
      const values = {
        [nestedField.name]: [{
          primaryKeys: [createRandomECInstanceKey()],
          values: {
            [nestedField.nestedFields[0].name]: faker.random.word(),
            [nestedField.nestedFields[1].name]: faker.random.word(),
            [childNestedField.name]: [{
              primaryKeys: [createRandomECInstanceKey()],
              values: {
                [childFields[0].name]: faker.random.words(),
                [childFields[1].name]: faker.random.words(),
              },
              displayValues: {
                [childFields[0].name]: faker.random.words(),
                [childFields[1].name]: faker.random.words(),
              },
              mergedFieldNames: [],
            }] as NestedContentValue[],
          },
          displayValues: {
            [nestedField.nestedFields[0].name]: faker.random.words(),
            [nestedField.nestedFields[1].name]: faker.random.words(),
          },
          mergedFieldNames: [],
        }] as NestedContentValue[],
      };
      const displayValues = {
        [nestedField.name]: [{
          primaryKeys: [createRandomECInstanceKey()],
          values: {
            [nestedField.nestedFields[0].name]: faker.random.word(),
            [nestedField.nestedFields[1].name]: faker.random.word(),
          },
          displayValues: {
            [nestedField.nestedFields[0].name]: faker.random.words(),
            [nestedField.nestedFields[1].name]: faker.random.words(),
          },
          mergedFieldNames: [],
        }] as DisplayValue[],
      };
      const record = new Item([createRandomECInstanceKey()],
        faker.random.words(), faker.random.word(), undefined, values, displayValues, []);
      (provider as any).getContent = async () => new Content(descriptor, [record]);
      const row = await provider.getRow(0);
      expect(row.cells.length).to.eq(4);

      expect(row.cells[0].mergedCellsCount).to.be.undefined;
      expect(row.cells[0].alignment).to.be.undefined;
      expect(row.cells[1].mergedCellsCount).to.be.undefined;
      expect(row.cells[1].alignment).to.be.undefined;
      expect(row.cells[2].mergedCellsCount).to.be.undefined;
      expect(row.cells[2].alignment).to.be.undefined;
      expect(row.cells[3].mergedCellsCount).to.be.undefined;
      expect(row.cells[3].alignment).to.be.undefined;
    });

    it("extracts rows with nested sameInstance field and doesn't set mergedFieldsCount if there are no values in the nestedFields", async () => {
      const childFields = [createRandomPrimitiveField(), createRandomPrimitiveField()];
      const childNestedField = createRandomNestedContentField(childFields);
      childNestedField.relationshipMeaning = RelationshipMeaning.SameInstance;
      const fields = [createRandomPrimitiveField(), createRandomPrimitiveField(), childNestedField];
      const nestedField = createRandomNestedContentField(fields);
      nestedField.relationshipMeaning = RelationshipMeaning.SameInstance;
      const descriptor = createRandomDescriptor(undefined, [nestedField]);
      const values = {
        [nestedField.name]: [],
      };
      const displayValues = {
        [nestedField.name]: [],
      };
      const record = new Item([createRandomECInstanceKey()],
        faker.random.words(), faker.random.word(), undefined, values, displayValues, []);
      (provider as any).getContent = async () => new Content(descriptor, [record]);
      const row = await provider.getRow(0);
      expect(row.cells.length).to.eq(4);

      expect(row.cells[0].mergedCellsCount).to.be.undefined;
      expect(row.cells[0].alignment).to.be.undefined;
      expect(row.cells[1].mergedCellsCount).to.be.undefined;
      expect(row.cells[1].alignment).to.be.undefined;
      expect(row.cells[2].mergedCellsCount).to.be.undefined;
      expect(row.cells[2].alignment).to.be.undefined;
      expect(row.cells[3].mergedCellsCount).to.be.undefined;
      expect(row.cells[3].alignment).to.be.undefined;
    });

    it("returns valid row when display type is list", async () => {
      const descriptor = createRandomDescriptor(DefaultContentDisplayTypes.List);
      const values: ValuesDictionary<any> = {};
      const displayValues: ValuesDictionary<any> = {};
      const record = new Item([createRandomECInstanceKey()],
        faker.random.words(), faker.random.word(), undefined, values, displayValues, []);
      (provider as any).getContent = async () => new Content(descriptor, [record]);
      const row = await provider.getRow(0);
      expect(row).to.matchSnapshot();
    });

  });

});
