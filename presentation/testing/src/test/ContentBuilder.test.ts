/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect, use } from "chai";
import ChaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import * as moq from "typemoq";
import { BeEvent, Guid, Id64String } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import {
  CategoryDescription, Content, DefaultContentDisplayTypes, Descriptor, DisplayValue, Field, Item, KeySet, PrimitiveTypeDescription,
  PropertyValueFormat, RegisteredRuleset, Ruleset, Value, ValuesDictionary,
} from "@bentley/presentation-common";
import { Presentation, PresentationManager, RulesetManager } from "@bentley/presentation-frontend";
import { ContentBuilder, IContentBuilderDataProvider } from "../presentation-testing/ContentBuilder";

use(ChaiAsPromised);

class EmptyDataProvider implements IContentBuilderDataProvider {
  // Verifies that given keyset matches a template, otherwise it throws an error
  private _keyVerificationFunction: ((keyset: KeySet) => void) | undefined;

  constructor(keyVerificationFunction?: (keyset: KeySet) => void) {
    this._keyVerificationFunction = keyVerificationFunction;
  }

  private _keyset: KeySet | undefined;
  public getContentSetSize = async () => 0;
  public getContent = async (): Promise<Readonly<Content> | undefined> => undefined;

  public set keys(keyset: KeySet) {
    if (this._keyVerificationFunction)
      this._keyVerificationFunction(keyset);
    this._keyset = keyset;
  }
  public get keys() {
    return this._keyset ? this._keyset : new KeySet();
  }
}

function createItem(values: ValuesDictionary<Value>) {
  const displayValues: ValuesDictionary<DisplayValue> = {};
  for (const key in values) {
    if (values.hasOwnProperty(key)) {
      displayValues[key] = "";
    }
  }
  return new Item(
    Object.keys(values).map((key) => ({ className: "testClass", id: key })),
    "Test class",
    "",
    undefined,
    values,
    displayValues,
    [],
  );
}

async function getContent(items: Array<ValuesDictionary<Value>>, descriptor: Descriptor) {
  return new Content(descriptor, items.map(createItem));
}

const createCategoryDescription = (): CategoryDescription => ({
  name: "test",
  label: "test",
  priority: 1,
  description: "",
  expand: false,
});

const createStringTypeDescription = (): PrimitiveTypeDescription => ({
  valueFormat: PropertyValueFormat.Primitive,
  typeName: "string",
});

class DataProvider extends EmptyDataProvider {
  public descriptor = new Descriptor({
    displayType: "Grid",
    selectClasses: [],
    fields: [
      new Field(createCategoryDescription(), "width", "width", createStringTypeDescription(), false, 1),
      new Field(createCategoryDescription(), "title", "title", createStringTypeDescription(), false, 1),
      new Field(createCategoryDescription(), "radius", "radius", createStringTypeDescription(), false, 1),
    ],
    contentFlags: 1,
  });
  public values = [
    { title: "Item", height: 15, width: 16 },
    { title: "Circle", radius: 13 },
  ];
  public override getContentSetSize = async () => this.values.length;
  public override getContent = async () => getContent(this.values, this.descriptor);
}

async function getEmptyContent(props: { descriptor: Readonly<Descriptor> }) {
  return new Content(props.descriptor, []);
}

interface TestInstance {
  schemaName: string;
  className: string;
  ids: Array<{ id: Id64String }>;
}

function verifyInstanceKey(instanceKey: [string, Set<string>], instances: TestInstance[]) {
  const className = instanceKey[0];
  const ids = Array.from(instanceKey[1].values());
  for (const instance of instances) {
    if (`${instance.schemaName}:${instance.className}` === className) {
      for (const idEntry of instance.ids) {
        if (!ids.includes(idEntry.id)) {
          throw new Error(`Wrong id provided - '${idEntry.id}'`);
        }
      }
      return;
    }
  }
  throw new Error(`Wrong className provided - '${className}'`);
}

function verifyKeyset(keyset: KeySet, testInstances: TestInstance[], verificationSpy: sinon.SinonSpy) {
  verificationSpy();
  for (const entry of keyset.instanceKeys.entries()) {
    verifyInstanceKey(entry, testInstances);
  }
}

const createThrowingQueryFunc = (instances: TestInstance[]) => {
  return async function* (query: string) {
    if (query.includes("SELECT s.Name")) {
      for (const row of instances)
        yield row;
      return;
    }
    throw new Error("Test error");
  };
};

const createQueryFunc = (instances: TestInstance[]) => {
  return async function* (query: string) {
    if (query.includes("SELECT s.Name")) {
      for (const row of instances)
        yield row;
      return;
    }

    for (const entry of instances) {
      if (query.includes(`"${entry.schemaName}"."${entry.className}"`)) {
        for (const id of entry.ids)
          yield id;
        return;
      }
    }
  };
};

describe("ContentBuilder", () => {
  const imodelMock = moq.Mock.ofType<IModelConnection>();

  describe("createContent", () => {
    const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
    const rulesetMock = moq.Mock.ofType<Ruleset>();
    const rulesetManagerMock = moq.Mock.ofType<RulesetManager>();

    before(() => {
      rulesetMock.setup((ruleset) => ruleset.id).returns(() => "1");
    });

    beforeEach(() => {
      rulesetManagerMock.setup(async (x) => x.add(moq.It.isAny())).returns(async (ruleset) => new RegisteredRuleset(ruleset, Guid.createValue(), () => { }));
      presentationManagerMock.reset();
      presentationManagerMock.setup((manager) => manager.rulesets()).returns(() => rulesetManagerMock.object);
      // eslint-disable-next-line deprecation/deprecation
      presentationManagerMock.setup(async (manager) => manager.getContent(moq.It.isAny())).returns(getEmptyContent);
      presentationManagerMock.setup((x) => x.onIModelContentChanged).returns(() => new BeEvent());
      Presentation.setPresentationManager(presentationManagerMock.object);
    });

    it("returns empty records when there is no content returned from presentation", async () => {
      const builder = new ContentBuilder({ imodel: imodelMock.object });
      let content = await builder.createContent("1", []);
      expect(content).to.be.empty;

      presentationManagerMock.verify((manager) => manager.rulesets(), moq.Times.never());
      content = await builder.createContent(rulesetMock.object, []);
      presentationManagerMock.verify((manager) => manager.rulesets(), moq.Times.once());
      expect(content).to.be.empty;

      content = await builder.createContent("1", [], DefaultContentDisplayTypes.List);
      expect(content).to.be.empty;
    });

    it("returns empty records when there is no content in the supplied data provider", async () => {
      const builder = new ContentBuilder({ imodel: imodelMock.object, dataProvider: new EmptyDataProvider() });
      const content = await builder.createContent("1", []);
      expect(content).to.be.empty;
    });

    it("returns correct records when there is content in the supplied data provider", async () => {
      const dataProvider = new DataProvider();
      const builder = new ContentBuilder({ imodel: imodelMock.object, dataProvider });
      const content = await builder.createContent("1", []);
      expect(content.length).to.equal(dataProvider.values.length * dataProvider.descriptor.fields.length);
    });
  });

  describe("createContentForAllClasses", () => {
    const testInstances: TestInstance[] = [
      {
        className: "Class1",
        schemaName: "Schema1",
        ids: [{ id: "0x2" }, { id: "0x3" }],
      },
      {
        className: "Class2",
        schemaName: "Schema2",
        ids: [{ id: "0x5" }, { id: "0x6" }],
      },
    ];

    before(() => {
      imodelMock.reset();
      const f = createQueryFunc(testInstances);
      imodelMock.setup((imodel) => imodel.query(moq.It.isAny(), moq.It.isAny(), moq.It.isAny())).returns(f);
    });

    it("returns all required instances with empty records", async () => {
      const verificationSpy = sinon.spy();

      const builder = new ContentBuilder({
        imodel: imodelMock.object,
        dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
      });

      const content = await builder.createContentForAllInstances("1");

      expect(content.length).to.equal(2);

      expect(content.find((c) => c.className === "Schema1:Class1")).to.not.be.undefined;
      expect(content.find((c) => c.className === "Schema2:Class2")).to.not.be.undefined;

      expect(content[0].records).to.be.empty;
      expect(content[1].records).to.be.empty;

      expect(verificationSpy.calledTwice).to.be.true;
    });
  });

  describe("createContentForInstancePerClass", () => {
    context("test instances have ids", () => {
      const testInstances: TestInstance[] = [
        {
          className: "Class1",
          schemaName: "Schema1",
          ids: [{ id: "0x1" }],
        },
        {
          className: "Class2",
          schemaName: "Schema2",
          ids: [{ id: "0x9" }],
        },
      ];

      it("returns all required instances with empty records", async () => {
        imodelMock.reset();
        imodelMock.setup((imodel) => imodel.query(moq.It.isAny(), moq.It.isAny(), moq.It.isAny())).returns(createQueryFunc(testInstances));

        const verificationSpy = sinon.spy();

        const builder = new ContentBuilder({
          imodel: imodelMock.object,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        const content = await builder.createContentForInstancePerClass("1");

        expect(content.length).to.equal(2);

        expect(content.find((c) => c.className === "Schema1:Class1")).to.not.be.undefined;
        expect(content.find((c) => c.className === "Schema2:Class2")).to.not.be.undefined;

        expect(content[0].records).to.be.empty;
        expect(content[1].records).to.be.empty;

        expect(verificationSpy.calledTwice).to.be.true;
      });

      it("throws when id query throws an unexpected error", async () => {
        imodelMock.reset();
        imodelMock.setup((imodel) => imodel.query(moq.It.isAny(), moq.It.isAny(), moq.It.isAny())).returns(createThrowingQueryFunc(testInstances));

        const verificationSpy = sinon.spy();

        const builder = new ContentBuilder({
          imodel: imodelMock.object,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        await expect(builder.createContentForInstancePerClass("1")).to.be.rejectedWith("Test error");
      });
    });

    context("test instances have no ids", () => {
      const testInstances: TestInstance[] = [{ className: "Class1", schemaName: "Schema1", ids: [] }];

      before(() => {
        imodelMock.reset();
        imodelMock.setup((imodel) => imodel.query(moq.It.isAny(), moq.It.isAny(), moq.It.isAny())).returns(createQueryFunc(testInstances));
      });

      it("returns an empty list", async () => {
        const verificationSpy = sinon.spy();

        const builder = new ContentBuilder({
          imodel: imodelMock.object,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        const content = await builder.createContentForInstancePerClass("1");

        expect(content).to.be.empty;
        expect(verificationSpy.notCalled).to.be.true;
      });
    });
  });
});
