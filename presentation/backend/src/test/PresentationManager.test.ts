/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable deprecation/deprecation */
import "@bentley/presentation-common/lib/test/_helpers/Promises";
import { expect } from "chai";
import * as faker from "faker";
import * as path from "path";
import * as sinon from "sinon";
import * as moq from "typemoq";
import { ClientRequestContext, DbResult, using } from "@bentley/bentleyjs-core";
import { BriefcaseDb, ECSqlStatement, ECSqlValue, IModelDb, IModelHost, IpcHost } from "@bentley/imodeljs-backend";
import {
  ArrayTypeDescription, Content, ContentDescriptorRequestOptions, ContentFlags, ContentJSON, ContentRequestOptions, DefaultContentDisplayTypes,
  Descriptor, DescriptorJSON, DiagnosticsOptions, DiagnosticsScopeLogs, DisplayLabelRequestOptions, DisplayLabelsRequestOptions,
  DistinctValuesRequestOptions, ElementProperties, ElementPropertiesRequestOptions, ExtendedContentRequestOptions, ExtendedHierarchyRequestOptions,
  FieldDescriptor, FieldDescriptorType, FieldJSON, getLocalesDirectory, HierarchyCompareInfo, HierarchyCompareInfoJSON, HierarchyCompareOptions,
  HierarchyRequestOptions, InstanceKey, IntRulesetVariable, ItemJSON, KeySet, KindOfQuantityInfo, LabelDefinition, LabelRequestOptions,
  NestedContentFieldJSON, NodeJSON, NodeKey, Paged, PageOptions, PresentationError, PresentationUnitSystem, PrimitiveTypeDescription,
  PropertiesFieldJSON, PropertyInfoJSON, PropertyJSON, RegisteredRuleset, RequestPriority, Ruleset, SelectClassInfoJSON, SelectionInfo,
  SelectionScope, StandardNodeTypes, StructTypeDescription, VariableValueTypes,
} from "@bentley/presentation-common";
import {
  createTestCategoryDescription, createTestContentDescriptor, createTestContentItem, createTestSimpleContentField,
} from "@bentley/presentation-common/lib/test/_helpers/Content";
import { createTestECClassInfo } from "@bentley/presentation-common/lib/test/_helpers/EC";
import {
  createRandomCategory, createRandomDescriptor, createRandomDescriptorJSON, createRandomECClassInfoJSON, createRandomECInstanceKey,
  createRandomECInstanceKeyJSON, createRandomECInstancesNodeJSON, createRandomECInstancesNodeKey, createRandomECInstancesNodeKeyJSON, createRandomId,
  createRandomLabelDefinitionJSON, createRandomNodePathElementJSON, createRandomRelatedClassInfoJSON, createRandomRelationshipPathJSON,
  createRandomRuleset,
} from "@bentley/presentation-common/lib/test/_helpers/random";
import { PRESENTATION_BACKEND_ASSETS_ROOT, PRESENTATION_COMMON_ASSETS_ROOT } from "../presentation-backend/Constants";
import { NativePlatformDefinition, NativePlatformRequestTypes } from "../presentation-backend/NativePlatform";
import { PresentationIpcHandler } from "../presentation-backend/PresentationIpcHandler";
import {
  HierarchyCacheMode, HybridCacheConfig, PresentationManager, PresentationManagerMode, PresentationManagerProps,
} from "../presentation-backend/PresentationManager";
import { RulesetManagerImpl } from "../presentation-backend/RulesetManager";
import { RulesetVariablesManagerImpl } from "../presentation-backend/RulesetVariablesManager";
import { SelectionScopesHelper } from "../presentation-backend/SelectionScopesHelper";
import { UpdatesTracker } from "../presentation-backend/UpdatesTracker";
import { WithClientRequestContext } from "../presentation-backend/Utils";

const deepEqual = require("deep-equal"); // eslint-disable-line @typescript-eslint/no-var-requires

describe("PresentationManager", () => {

  before(async () => {
    try {
      await IModelHost.startup();
    } catch (e) {
      let isLoaded = false;
      try {
        IModelHost.platform;
        isLoaded = true;
      } catch (_e) { }
      if (!isLoaded)
        throw e; // re-throw if startup() failed to set up NativePlatform
    }
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  const setupIModelForElementKey = (imodelMock: moq.IMock<IModelDb>, key: InstanceKey) => {
    imodelMock.setup((x) => x.withPreparedStatement(moq.It.isAnyString(), moq.It.isAny())).callback((_q, cb) => {
      const valueMock = moq.Mock.ofType<ECSqlValue>();
      valueMock.setup((x) => x.getClassNameForClassId()).returns(() => key.className);
      const stmtMock = moq.Mock.ofType<ECSqlStatement>();
      stmtMock.setup((x) => x.step()).returns(() => DbResult.BE_SQLITE_ROW);
      stmtMock.setup((x) => x.getValue(0)).returns(() => valueMock.object);
      cb(stmtMock.object);
    });
  };

  const setupIModelForNoResultStatement = (imodelMock: moq.IMock<IModelDb>) => {
    imodelMock.setup((x) => x.withPreparedStatement(moq.It.isAnyString(), moq.It.isAny())).callback((_q, cb) => {
      const stmtMock = moq.Mock.ofType<ECSqlStatement>();
      stmtMock.setup((x) => x.step()).returns(() => DbResult.BE_SQLITE_DONE);
      cb(stmtMock.object);
    });
  };

  describe("constructor", () => {

    describe("uses default native library implementation if not overridden", () => {

      it("creates without props", () => {
        const constructorSpy = sinon.spy(IModelHost.platform, "ECPresentationManager");
        using(new PresentationManager(), (manager) => {
          expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(IModelHost.platform.ECPresentationManager);
          expect(constructorSpy).to.be.calledOnceWithExactly({
            id: "",
            localeDirectories: [getLocalesDirectory(PRESENTATION_COMMON_ASSETS_ROOT)],
            taskAllocationsMap: { [RequestPriority.Preload]: 1, [RequestPriority.Max]: 1 },
            mode: IModelHost.platform.ECPresentationManagerMode.ReadWrite,
            isChangeTrackingEnabled: false,
            cacheConfig: { mode: HierarchyCacheMode.Disk, directory: "" },
            contentCacheSize: undefined,
            useMmap: undefined,
            defaultFormats: {},
          });
        });
      });

      it("creates with props", () => {
        const constructorSpy = sinon.spy(IModelHost.platform, "ECPresentationManager");
        const testLocale = faker.random.locale();
        const testTaskAllocations = { [999]: 111 };
        const cacheConfig = {
          mode: HierarchyCacheMode.Memory,
        };
        const formatProps = {
          composite: {
            includeZero: true,
            spacer: " ",
            units: [
              { label: "'", name: "IN" },
            ],
          },
          formatTraits: "KeepSingleZero|KeepDecimalPoint|ShowUnitLabel",
          precision: 4,
          type: "Decimal",
          uomSeparator: "",
        };
        const defaultFormats = {
          length: { unitSystems: [PresentationUnitSystem.BritishImperial], format: formatProps },
        };
        const props: PresentationManagerProps = {
          id: faker.random.uuid(),
          presentationAssetsRoot: "/test",
          localeDirectories: [testLocale, testLocale],
          taskAllocationsMap: testTaskAllocations,
          mode: PresentationManagerMode.ReadWrite,
          updatesPollInterval: 1,
          cacheConfig,
          contentCacheSize: 999,
          useMmap: 666,
          defaultFormats,
        };
        const expectedCacheConfig = {
          mode: HierarchyCacheMode.Memory,
        };
        using(new PresentationManager(props), (manager) => {
          expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(IModelHost.platform.ECPresentationManager);
          expect(constructorSpy).to.be.calledOnceWithExactly({
            id: props.id,
            localeDirectories: [getLocalesDirectory("/test"), testLocale],
            taskAllocationsMap: testTaskAllocations,
            mode: IModelHost.platform.ECPresentationManagerMode.ReadWrite,
            isChangeTrackingEnabled: true,
            cacheConfig: expectedCacheConfig,
            contentCacheSize: 999,
            defaultFormats: { length: { unitSystems: [PresentationUnitSystem.BritishImperial], serializedFormat: JSON.stringify(formatProps) } },
            useMmap: 666,
          });
        });
      });

      it("creates with disk cache config", () => {
        const constructorSpy = sinon.spy(IModelHost.platform, "ECPresentationManager");
        using(new PresentationManager({ cacheConfig: { mode: HierarchyCacheMode.Disk } }), (manager) => {
          expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(IModelHost.platform.ECPresentationManager);
          expect(constructorSpy).to.be.calledOnceWithExactly({
            id: "",
            localeDirectories: [getLocalesDirectory(PRESENTATION_COMMON_ASSETS_ROOT)],
            taskAllocationsMap: { [RequestPriority.Preload]: 1, [RequestPriority.Max]: 1 },
            mode: IModelHost.platform.ECPresentationManagerMode.ReadWrite,
            isChangeTrackingEnabled: false,
            cacheConfig: { mode: HierarchyCacheMode.Disk, directory: "" },
            contentCacheSize: undefined,
            useMmap: undefined,
            defaultFormats: {},
          });
        });
        constructorSpy.resetHistory();
        const cacheConfig = {
          mode: HierarchyCacheMode.Disk,
          directory: faker.random.word(),
        };
        const expectedConfig = { ...cacheConfig, directory: path.resolve(cacheConfig.directory) };
        using(new PresentationManager({ cacheConfig }), (manager) => {
          expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(IModelHost.platform.ECPresentationManager);
          expect(constructorSpy).to.be.calledOnceWithExactly({
            id: "",
            localeDirectories: [getLocalesDirectory(PRESENTATION_COMMON_ASSETS_ROOT)],
            taskAllocationsMap: { [RequestPriority.Preload]: 1, [RequestPriority.Max]: 1 },
            mode: IModelHost.platform.ECPresentationManagerMode.ReadWrite,
            isChangeTrackingEnabled: false,
            cacheConfig: expectedConfig,
            contentCacheSize: undefined,
            useMmap: undefined,
            defaultFormats: {},
          });
        });
      });

      it("creates with hybrid cache config", () => {
        const constructorSpy = sinon.spy(IModelHost.platform, "ECPresentationManager");
        using(new PresentationManager({ cacheConfig: { mode: HierarchyCacheMode.Hybrid } }), (manager) => {
          expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(IModelHost.platform.ECPresentationManager);
          expect(constructorSpy).to.be.calledOnceWithExactly({
            id: "",
            localeDirectories: [getLocalesDirectory(PRESENTATION_COMMON_ASSETS_ROOT)],
            taskAllocationsMap: { [RequestPriority.Preload]: 1, [RequestPriority.Max]: 1 },
            mode: IModelHost.platform.ECPresentationManagerMode.ReadWrite,
            isChangeTrackingEnabled: false,
            cacheConfig: { mode: HierarchyCacheMode.Hybrid, disk: undefined },
            contentCacheSize: undefined,
            useMmap: undefined,
            defaultFormats: {},
          });
        });
        constructorSpy.resetHistory();
        const cacheConfig: HybridCacheConfig = {
          mode: HierarchyCacheMode.Hybrid,
          disk: {
            mode: HierarchyCacheMode.Disk,
            directory: faker.random.word(),
          },
        };
        const expectedConfig = {
          ...cacheConfig, disk: { ...cacheConfig.disk, directory: path.resolve(cacheConfig.disk!.directory!) },
        };
        using(new PresentationManager({ cacheConfig }), (manager) => {
          expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(IModelHost.platform.ECPresentationManager);
          expect(constructorSpy).to.be.calledOnceWithExactly({
            id: "",
            localeDirectories: [getLocalesDirectory(PRESENTATION_COMMON_ASSETS_ROOT)],
            taskAllocationsMap: { [RequestPriority.Preload]: 1, [RequestPriority.Max]: 1 },
            mode: IModelHost.platform.ECPresentationManagerMode.ReadWrite,
            isChangeTrackingEnabled: false,
            cacheConfig: expectedConfig,
            contentCacheSize: undefined,
            useMmap: undefined,
            defaultFormats: {},
          });
        });
      });

    });

    it("uses addon implementation supplied through props", () => {
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      using(new PresentationManager({ addon: nativePlatformMock.object }), (manager) => {
        expect(manager.getNativePlatform()).eq(nativePlatformMock.object);
      });
    });

    describe("addon setup based on props", () => {

      const addon = moq.Mock.ofType<NativePlatformDefinition>();
      beforeEach(() => {
        addon.reset();
      });

      it("sets up primary ruleset directories if supplied", () => {
        const dirs = ["test1", "test2", "test2"];
        const addonDirs = [path.join(PRESENTATION_BACKEND_ASSETS_ROOT, "primary-presentation-rules"), "test1", "test2"];
        addon.setup((x) => x.setupRulesetDirectories(addonDirs)).verifiable();
        using(new PresentationManager({ addon: addon.object, rulesetDirectories: dirs }), (pm: PresentationManager) => { pm; });
        addon.verifyAll();
      });

      it("sets up presentation backend's primary ruleset directories using `presentationAssetsRoot` as string if supplied", () => {
        const addonDirs = [path.join("/test", "primary-presentation-rules")];
        addon.setup((x) => x.setupRulesetDirectories(addonDirs)).verifiable();
        using(new PresentationManager({ addon: addon.object, presentationAssetsRoot: "/test" }), (pm: PresentationManager) => { pm; });
        addon.verifyAll();
      });

      it("sets up presentation backend's primary ruleset directories using `presentationAssetsRoot.backend` if supplied", () => {
        const addonDirs = [path.join("/backend-test", "primary-presentation-rules")];
        addon.setup((x) => x.setupRulesetDirectories(addonDirs)).verifiable();
        using(new PresentationManager({ addon: addon.object, presentationAssetsRoot: { backend: "/backend-test", common: "/common-test" } }), (_pm: PresentationManager) => { });
        addon.verifyAll();
      });

      it("sets up supplemental ruleset directories if supplied", () => {
        const dirs = ["test1", "test2", "test2"];
        const addonDirs = [path.join(PRESENTATION_BACKEND_ASSETS_ROOT, "supplemental-presentation-rules"), "test1", "test2"];
        addon
          .setup((x) => x.setupSupplementalRulesetDirectories(addonDirs))
          .verifiable();
        using(new PresentationManager({ addon: addon.object, supplementalRulesetDirectories: dirs }), (_pm: PresentationManager) => { });
        addon.verifyAll();
      });

      it("sets up presentation backend's supplemental ruleset directories using `presentationAssetsRoot` as string if supplied", () => {
        const addonDirs = [path.join("/test", "supplemental-presentation-rules")];
        addon
          .setup((x) => x.setupSupplementalRulesetDirectories(addonDirs))
          .verifiable();
        using(new PresentationManager({ addon: addon.object, presentationAssetsRoot: "/test" }), (_pm: PresentationManager) => { });
        addon.verifyAll();
      });

      it("sets up presentation backend's supplemental ruleset directories using `presentationAssetsRoot.backend` if supplied", () => {
        const addonDirs = [path.join("/backend-test", "supplemental-presentation-rules")];
        addon
          .setup((x) => x.setupSupplementalRulesetDirectories(addonDirs))
          .verifiable();
        using(new PresentationManager({ addon: addon.object, presentationAssetsRoot: { backend: "/backend-test", common: "/common-test" } }), (_pm: PresentationManager) => { });
        addon.verifyAll();
      });

      it("sets up default locale directories", () => {
        const constructorSpy = sinon.spy(IModelHost.platform, "ECPresentationManager");
        using(new PresentationManager({}), (_manager) => { });
        expect(constructorSpy).to.be.calledOnce;
        expect(constructorSpy.firstCall.firstArg).to.containSubset({
          localeDirectories: [getLocalesDirectory(PRESENTATION_COMMON_ASSETS_ROOT)],
        });
      });

      it("sets up default locale directories using `presentationAssetsRoot` as string if supplied", () => {
        const constructorSpy = sinon.spy(IModelHost.platform, "ECPresentationManager");
        using(new PresentationManager({ presentationAssetsRoot: "/test" }), (_manager) => { });
        expect(constructorSpy).to.be.calledOnce;
        expect(constructorSpy.firstCall.firstArg).to.containSubset({
          localeDirectories: [getLocalesDirectory("/test")],
        });
      });

      it("sets up default locale directories using `presentationAssetsRoot.common` if supplied", () => {
        const constructorSpy = sinon.spy(IModelHost.platform, "ECPresentationManager");
        using(new PresentationManager({ presentationAssetsRoot: { backend: "/backend-test", common: "/common-test" } }), (_manager) => { });
        expect(constructorSpy).to.be.calledOnce;
        expect(constructorSpy.firstCall.firstArg).to.containSubset({
          localeDirectories: [getLocalesDirectory("/common-test")],
        });
      });

      it("sets up active locale if supplied", () => {
        const locale = faker.random.locale();
        using(new PresentationManager({ addon: addon.object, activeLocale: locale }), (manager) => {
          expect(manager.activeLocale).to.eq(locale);
        });
      });

      it("subscribes for `BriefcaseDb.onOpened` event if `enableSchemasPreload` is set", () => {
        using(new PresentationManager({ addon: addon.object, enableSchemasPreload: false }), (_) => {
          expect(BriefcaseDb.onOpened.numberOfListeners).to.eq(0);
        });
        using(new PresentationManager({ addon: addon.object, enableSchemasPreload: true }), (_) => {
          expect(BriefcaseDb.onOpened.numberOfListeners).to.eq(1);
        });
      });

      it("creates an `UpdateTracker` when in read-write mode, `updatesPollInterval` is specified and IPC host is available", () => {
        sinon.stub(IpcHost, "isValid").get(() => true);
        sinon.stub(PresentationIpcHandler, "register").returns(() => { });

        const tracker = sinon.createStubInstance(UpdatesTracker) as unknown as UpdatesTracker;
        const stub = sinon.stub(UpdatesTracker, "create").returns(tracker);
        using(new PresentationManager({ addon: addon.object, mode: PresentationManagerMode.ReadWrite, updatesPollInterval: 123 }), (_) => {
          expect(stub).to.be.calledOnceWith(sinon.match({ pollInterval: 123 }));
          expect(tracker.dispose).to.not.be.called; // eslint-disable-line @typescript-eslint/unbound-method
        });
        expect(tracker.dispose).to.be.calledOnce; // eslint-disable-line @typescript-eslint/unbound-method
      });

      it("doesn't create an `UpdateTracker` when IPC host is unavailable", () => {
        sinon.stub(IpcHost, "isValid").get(() => false);
        const stub = sinon.stub(UpdatesTracker, "create");
        using(new PresentationManager({ addon: addon.object, mode: PresentationManagerMode.ReadWrite, updatesPollInterval: 123 }), (_) => {
          expect(stub).to.not.be.called;
        });
      });

    });

  });

  describe("props", () => {

    it("returns empty object if initialized without props", () => {
      using(new PresentationManager(undefined), (newManager) => {
        expect(newManager.props).to.deep.eq({});
      });
    });

    it("returns initialization props", () => {
      const props = { activeLocale: faker.random.locale() };
      using(new PresentationManager(props), (newManager) => {
        expect(newManager.props).to.equal(props);
      });
    });

  });

  describe("activeLocale", () => {

    const addonMock = moq.Mock.ofType<NativePlatformDefinition>();
    beforeEach(() => {
      addonMock.reset();
    });

    it("uses manager's activeLocale when not specified in request options", async () => {
      const imodelMock = moq.Mock.ofType<IModelDb>();
      const rulesetId = faker.random.word();
      const locale = faker.random.locale().toLowerCase();
      await using(new PresentationManager({ addon: addonMock.object, activeLocale: locale }), async (manager) => {
        addonMock
          .setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.is((serializedRequest: string): boolean => {
            const request = JSON.parse(serializedRequest);
            return request.params.locale === locale;
          })))
          .returns(async () => ({ result: "{}" }))
          .verifiable(moq.Times.once());
        await manager.getNodesCount({ requestContext: ClientRequestContext.current, imodel: imodelMock.object, rulesetOrId: rulesetId });
        addonMock.verifyAll();
      });
    });

    it("ignores manager's activeLocale when locale is specified in request options", async () => {
      const imodelMock = moq.Mock.ofType<IModelDb>();
      const rulesetId = faker.random.word();
      const locale = faker.random.locale().toLowerCase();
      await using(new PresentationManager({ addon: addonMock.object, activeLocale: faker.random.locale().toLowerCase() }), async (manager) => {
        expect(manager.activeLocale).to.not.eq(locale);
        addonMock
          .setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.is((serializedRequest: string): boolean => {
            const request = JSON.parse(serializedRequest);
            return request.params.locale === locale;
          })))
          .returns(async () => ({ result: "{}" }))
          .verifiable(moq.Times.once());
        await manager.getNodesCount({ requestContext: ClientRequestContext.current, imodel: imodelMock.object, rulesetOrId: rulesetId, locale });
        addonMock.verifyAll();
      });
    });

  });

  describe("activeUnitSystem", () => {

    const addonMock = moq.Mock.ofType<NativePlatformDefinition>();
    beforeEach(() => {
      addonMock.reset();
    });

    it("uses manager's activeUnitSystem when not specified in request options", async () => {
      const imodelMock = moq.Mock.ofType<IModelDb>();
      const rulesetId = faker.random.word();
      const unitSystem = PresentationUnitSystem.UsSurvey;
      await using(new PresentationManager({ addon: addonMock.object, activeUnitSystem: unitSystem }), async (manager) => {
        addonMock
          .setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.is((serializedRequest: string): boolean => {
            const request = JSON.parse(serializedRequest);
            return request.params.unitSystem === unitSystem;
          })))
          .returns(async () => ({ result: "null" }))
          .verifiable(moq.Times.once());
        await manager.getContentDescriptor({ requestContext: ClientRequestContext.current, imodel: imodelMock.object, rulesetOrId: rulesetId, displayType: "", keys: new KeySet() });
        addonMock.verifyAll();
      });
    });

    it("ignores manager's activeLocale when locale is specified in request options", async () => {
      const imodelMock = moq.Mock.ofType<IModelDb>();
      const rulesetId = faker.random.word();
      const unitSystem = PresentationUnitSystem.UsSurvey;
      await using(new PresentationManager({ addon: addonMock.object, activeLocale: PresentationUnitSystem.Metric }), async (manager) => {
        expect(manager.activeUnitSystem).to.not.eq(unitSystem);
        addonMock
          .setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.is((serializedRequest: string): boolean => {
            const request = JSON.parse(serializedRequest);
            return request.params.unitSystem === unitSystem;
          })))
          .returns(async () => ({ result: "null" }))
          .verifiable(moq.Times.once());
        await manager.getContentDescriptor({ requestContext: ClientRequestContext.current, imodel: imodelMock.object, rulesetOrId: rulesetId, unitSystem, displayType: "", keys: new KeySet() });
        addonMock.verifyAll();
      });
    });

  });

  describe("vars", () => {

    const addon = moq.Mock.ofType<NativePlatformDefinition>();

    it("returns variables manager", () => {
      const manager = new PresentationManager({ addon: addon.object });
      const vars = manager.vars(faker.random.word());
      expect(vars).to.be.instanceOf(RulesetVariablesManagerImpl);
    });

  });

  describe("rulesets", () => {

    const addon = moq.Mock.ofType<NativePlatformDefinition>();

    it("returns rulesets manager", () => {
      const manager = new PresentationManager({ addon: addon.object });
      expect(manager.rulesets()).to.be.instanceOf(RulesetManagerImpl);
    });

  });

  describe("dispose", () => {

    it("calls native platform dispose when manager is disposed", () => {
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      const manager = new PresentationManager({ addon: nativePlatformMock.object });
      manager.dispose();
      manager.dispose();
      // note: verify native platform's `dispose` called only once
      nativePlatformMock.verify((x) => x.dispose(), moq.Times.once());
    });

    it("unsubscribes from `IModelDb.onOpened` event if `enableSchemasPreload` is set", () => {
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      const manager = new PresentationManager({ addon: nativePlatformMock.object, enableSchemasPreload: true });
      expect(BriefcaseDb.onOpened.numberOfListeners).to.eq(1);
      manager.dispose();
      expect(BriefcaseDb.onOpened.numberOfListeners).to.eq(0);
    });

    it("throws when attempting to use native platform after disposal", () => {
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      const manager = new PresentationManager({ addon: nativePlatformMock.object });
      manager.dispose();
      expect(() => manager.getNativePlatform()).to.throw(PresentationError);
    });

    it("unregisters PresentationIpcHandler if IpcHost is valid", () => {
      sinon.stub(IpcHost, "isValid").get(() => true);
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      const unregisterSpy = sinon.spy();
      sinon.stub(PresentationIpcHandler, "register").returns(unregisterSpy);
      const manager = new PresentationManager({ addon: nativePlatformMock.object });
      manager.dispose();
      expect(unregisterSpy).to.be.calledOnce;
    });

  });

  describe("getRulesetId", () => {

    let manager: PresentationManager;

    beforeEach(() => {
      const addon = moq.Mock.ofType<NativePlatformDefinition>();
      manager = new PresentationManager({ addon: addon.object });
    });

    afterEach(() => {
      manager.dispose();
    });

    it("returns correct id when input is a string", () => {
      const rulesetId = faker.random.word();
      expect(manager.getRulesetId(rulesetId)).to.eq(rulesetId);
    });

    it("returns correct id when input is a ruleset", async () => {
      const ruleset = await createRandomRuleset();
      expect(manager.getRulesetId(ruleset)).to.contain(ruleset.id);
    });

    it("returns correct id when input is a ruleset and in one-backend-one-frontend mode", async () => {
      sinon.stub(IpcHost, "isValid").get(() => true);
      sinon.stub(IpcHost, "handle");
      manager = new PresentationManager({ addon: moq.Mock.ofType<NativePlatformDefinition>().object });
      const ruleset = await createRandomRuleset();
      expect(manager.getRulesetId(ruleset)).to.eq(ruleset.id);
    });

  });

  describe("handling options", () => {

    const addonMock = moq.Mock.ofType<NativePlatformDefinition>();
    const imodelMock = moq.Mock.ofType<IModelDb>();
    let manager: PresentationManager;

    beforeEach(() => {
      addonMock.reset();
      manager = new PresentationManager({ addon: addonMock.object });
    });

    it("registers ruleset if `rulesetOrId` is a ruleset", async () => {
      const ruleset = await createRandomRuleset();
      addonMock
        .setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.isAny()))
        .returns(async () => ({ result: "{}" }))
        .verifiable(moq.Times.once());
      addonMock
        .setup((x) => x.addRuleset(moq.It.isAnyString()))
        .returns(() => ({ result: "hash" }))
        .verifiable(moq.Times.once());
      await manager.getNodesCount({ requestContext: ClientRequestContext.current, imodel: imodelMock.object, rulesetOrId: ruleset });
      addonMock.verifyAll();
    });

    it("doesn't register ruleset if `rulesetOrId` is a string", async () => {
      const rulesetId = faker.random.word();
      addonMock
        .setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.isAny()))
        .returns(async () => ({ result: "{}" }))
        .verifiable(moq.Times.once());
      addonMock
        .setup((x) => x.addRuleset(moq.It.isAnyString()))
        .returns(() => ({ result: "hash" }))
        .verifiable(moq.Times.never());
      await manager.getNodesCount({ requestContext: ClientRequestContext.current, imodel: imodelMock.object, rulesetOrId: rulesetId });
      addonMock.verifyAll();
    });

    it("sends diagnostic options to native platform and invokes handler with diagnostic results", async () => {
      const diagnosticOptions: DiagnosticsOptions = {
        perf: true,
        editor: "info",
        dev: "warning",
      };
      const diagnosticsResult: DiagnosticsScopeLogs = {
        scope: "test",
        duration: 123,
      };
      const diagnosticsListener = sinon.spy();
      addonMock
        .setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.is((reqStr) => sinon.match(diagnosticOptions).test(JSON.parse(reqStr).params.diagnostics))))
        .returns(async () => ({ result: "{}", diagnostics: diagnosticsResult }))
        .verifiable(moq.Times.once());
      await manager.getNodesCount({ requestContext: ClientRequestContext.current, imodel: imodelMock.object, rulesetOrId: "ruleset", diagnostics: { ...diagnosticOptions, handler: diagnosticsListener } });
      addonMock.verifyAll();
      expect(diagnosticsListener).to.be.calledOnceWith([diagnosticsResult]);
    });

  });

  describe("preloading schemas", () => {

    it("calls addon's `forceLoadSchemas` on `IModelDb.onOpened` events", () => {
      const imodelMock = moq.Mock.ofType<BriefcaseDb>();
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      nativePlatformMock.setup((x) => x.getImodelAddon(imodelMock.object)).verifiable(moq.Times.atLeastOnce());
      using(new PresentationManager({ addon: nativePlatformMock.object, enableSchemasPreload: true }), (_) => {
        const context = new ClientRequestContext();
        BriefcaseDb.onOpened.raiseEvent(context, imodelMock.object);
        nativePlatformMock.verify(async (x) => x.forceLoadSchemas(moq.It.isAny()), moq.Times.once());
      });
    });

  });

  describe("addon results conversion to Presentation objects", () => {

    let testData: any;
    const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
    const imodelMock = moq.Mock.ofType<IModelDb>();
    let manager: PresentationManager;
    beforeEach(async () => {
      testData = {
        rulesetOrId: await createRandomRuleset(),
        pageOptions: { start: faker.random.number(), size: faker.random.number() } as PageOptions,
        displayType: faker.random.word(),
        selectionInfo: {
          providerName: faker.random.word(),
          level: faker.random.number(),
        } as SelectionInfo,
      };
      nativePlatformMock.reset();
      nativePlatformMock.setup((x) => x.getImodelAddon(imodelMock.object)).verifiable(moq.Times.atLeastOnce());
      manager = new PresentationManager({ addon: nativePlatformMock.object });
      sinon.stub(manager, "rulesets").returns(sinon.createStubInstance(RulesetManagerImpl, {
        add: sinon.stub<[Ruleset], RegisteredRuleset>().callsFake((ruleset) => new RegisteredRuleset(ruleset, "", () => { })),
      }));
    });
    afterEach(() => {
      manager.dispose();
      nativePlatformMock.verifyAll();
    });

    const setup = (addonResponse: any) => {
      const serialized = JSON.stringify(addonResponse);
      nativePlatformMock.setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.isAnyString()))
        .returns(async () => ({ result: JSON.stringify(addonResponse) }));
      return JSON.parse(serialized);
    };
    const verifyMockRequest = (expectedParams: any) => {
      // verify the addon was called with correct params
      nativePlatformMock.verify(async (x) => x.handleRequest(moq.It.isAny(), moq.It.is((serializedParam: string): boolean => {
        const param = JSON.parse(serializedParam);
        expectedParams = JSON.parse(JSON.stringify(expectedParams));
        return deepEqual(param, expectedParams);
      })), moq.Times.once());
    };
    const verifyWithSnapshot = (result: any, expectedParams: any, recreateSnapshot: boolean = false) => {
      // verify the addon was called with correct params
      verifyMockRequest(expectedParams);
      // verify the manager correctly used addonResponse to create its result
      expect(result).to.matchSnapshot(recreateSnapshot);
    };
    const verifyWithExpectedResult = (actualResult: any, expectedResult: any, expectedParams: any) => {
      // verify the addon was called with correct params
      verifyMockRequest(expectedParams);
      // verify the manager correctly used addonResponse to create its result
      expect(actualResult).to.deep.eq(expectedResult);
    };

    describe("getNodes", () => {

      it("[deprecated] returns child nodes", async () => {
        // what the addon receives
        const parentNodeKeyJSON = createRandomECInstancesNodeKeyJSON();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetChildren,
          params: {
            nodeKey: parentNodeKeyJSON,
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse: NodeJSON[] = [{
          key: {
            type: StandardNodeTypes.ECInstancesNode,
            pathFromRoot: ["p1"],
            instanceKeys: [createRandomECInstanceKeyJSON()],
          },
          labelDefinition: LabelDefinition.fromLabelString("test2"),
        }, {
          key: {
            type: "type 2",
            pathFromRoot: ["p1", "p3"],
          },
          labelDefinition: LabelDefinition.fromLabelString("test3"),
        }];
        setup(addonResponse);

        // test
        const options: Paged<HierarchyRequestOptions<IModelDb>> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const result = await manager.getNodes(ClientRequestContext.current, options, NodeKey.fromJSON(parentNodeKeyJSON)); // eslint-disable-line deprecation/deprecation
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns root nodes", async () => {
        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetRootNodes,
          params: {
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse: NodeJSON[] = [{
          key: {
            type: "type1",
            pathFromRoot: ["p1", "p2", "p3"],
          },
          labelDefinition: LabelDefinition.fromLabelString("test1"),
          description: "description1",
          imageId: "img_1",
          foreColor: "foreColor1",
          backColor: "backColor1",
          fontStyle: "fontStyle1",
          hasChildren: true,
          isSelectionDisabled: true,
          isEditable: true,
          isChecked: true,
          isCheckboxVisible: true,
          isCheckboxEnabled: true,
          isExpanded: true,
        }, {
          key: {
            type: StandardNodeTypes.ECInstancesNode,
            pathFromRoot: ["p1"],
            instanceKeys: [createRandomECInstanceKeyJSON()],
          },
          labelDefinition: LabelDefinition.fromLabelString("test2"),
          description: "description2",
          imageId: "",
          foreColor: "",
          backColor: "",
          fontStyle: "",
          hasChildren: false,
          isSelectionDisabled: false,
          isEditable: false,
          isChecked: false,
          isCheckboxVisible: false,
          isCheckboxEnabled: false,
          isExpanded: false,
        }, {
          key: {
            type: "some node",
            pathFromRoot: ["p1", "p3"],
          },
          labelDefinition: LabelDefinition.fromLabelString("test2"),
        }];
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<Paged<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const result = await manager.getNodes(options);
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns child nodes", async () => {
        // what the addon receives
        const parentNodeKeyJSON = createRandomECInstancesNodeKeyJSON();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetChildren,
          params: {
            nodeKey: parentNodeKeyJSON,
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse: NodeJSON[] = [{
          key: {
            type: StandardNodeTypes.ECInstancesNode,
            pathFromRoot: ["p1"],
            instanceKeys: [createRandomECInstanceKeyJSON()],
          },
          labelDefinition: LabelDefinition.fromLabelString("test2"),
        }, {
          key: {
            type: "type 2",
            pathFromRoot: ["p1", "p3"],
          },
          labelDefinition: LabelDefinition.fromLabelString("test3"),
        }];
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<Paged<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: NodeKey.fromJSON(parentNodeKeyJSON),
        };
        const result = await manager.getNodes(options);
        verifyWithSnapshot(result, expectedParams);
      });

    });

    describe("getNodesCount", () => {

      it("[deprecated] returns child nodes count", async () => {
        // what the addon receives
        const parentNodeKeyJSON = createRandomECInstancesNodeKeyJSON();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetChildrenCount,
          params: {
            nodeKey: parentNodeKeyJSON,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse = 789;
        setup(addonResponse);

        // test
        const options: HierarchyRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getNodesCount(ClientRequestContext.current, options, NodeKey.fromJSON(parentNodeKeyJSON));
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

      it("returns root nodes count", async () => {
        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetRootNodesCount,
          params: {
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse = 456;
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getNodesCount(options);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

      it("returns child nodes count", async () => {
        // what the addon receives
        const parentNodeKeyJSON = createRandomECInstancesNodeKeyJSON();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetChildrenCount,
          params: {
            nodeKey: parentNodeKeyJSON,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse = 789;
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: NodeKey.fromJSON(parentNodeKeyJSON),
        };
        const result = await manager.getNodesCount(options);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

    });

    describe("[deprecated] getNodesAndCount", () => {

      it("returns root nodes and root nodes count", async () => {
        // what the addon receives
        const pageOptions = { start: 0, size: 2 };
        const expectedGetRootNodesParams = {
          requestId: NativePlatformRequestTypes.GetRootNodes,
          params: {
            paging: pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };
        const expectedGetRootNodesCountParams = {
          requestId: NativePlatformRequestTypes.GetRootNodesCount,
          params: {
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
            paging: pageOptions,
          },
        };

        // what the addon returns
        const addonGetRootNodesResponse: NodeJSON[] = [{
          key: {
            type: "type1",
            pathFromRoot: ["p1", "p2", "p3"],
          },
          labelDefinition: LabelDefinition.fromLabelString("test1"),
          description: "description1",
          imageId: "img_1",
          foreColor: "foreColor1",
          backColor: "backColor1",
          fontStyle: "fontStyle1",
          hasChildren: true,
          isSelectionDisabled: true,
          isEditable: true,
          isChecked: true,
          isCheckboxVisible: true,
          isCheckboxEnabled: true,
          isExpanded: true,
        }, {
          key: {
            type: StandardNodeTypes.ECInstancesNode,
            pathFromRoot: ["p1"],
            instanceKeys: [createRandomECInstanceKeyJSON()],
          },
          labelDefinition: LabelDefinition.fromLabelString("test2"),
          description: "description2",
          imageId: "",
          foreColor: "",
          backColor: "",
          fontStyle: "",
          hasChildren: false,
          isSelectionDisabled: false,
          isEditable: false,
          isChecked: false,
          isCheckboxVisible: false,
          isCheckboxEnabled: false,
          isExpanded: false,
        }, {
          key: {
            type: "some node",
            pathFromRoot: ["p1", "p3"],
          },
          labelDefinition: LabelDefinition.fromLabelString("test2"),
        }];
        const addonGetRootNodesCountResponse = 456;

        setup(addonGetRootNodesCountResponse);
        setup(addonGetRootNodesResponse);

        const options: Paged<HierarchyRequestOptions<IModelDb>> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: pageOptions,
        };
        const result = await manager.getNodesAndCount(ClientRequestContext.current, options); // eslint-disable-line deprecation/deprecation

        verifyWithSnapshot(result.nodes, expectedGetRootNodesParams);
        verifyWithExpectedResult(result.count, addonGetRootNodesCountResponse, expectedGetRootNodesCountParams);
      });

      it("returns child nodes and child node count", async () => {
        // what the addon receives
        const pageOptions = { start: 0, size: 2 };
        const parentNodeKeyJSON = createRandomECInstancesNodeKeyJSON();
        const expectedGetChildNodesParams = {
          requestId: NativePlatformRequestTypes.GetChildren,
          params: {
            nodeKey: parentNodeKeyJSON,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
            paging: pageOptions,
          },
        };
        const expectedGetChildNodeCountParams = {
          requestId: NativePlatformRequestTypes.GetChildrenCount,
          params: {
            nodeKey: parentNodeKeyJSON,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
            paging: pageOptions,
          },
        };

        // what the addon returns
        const addonGetChildNodesResponse: NodeJSON[] = [{
          key: {
            type: StandardNodeTypes.ECInstancesNode,
            pathFromRoot: ["p1"],
            instanceKeys: [createRandomECInstanceKeyJSON()],
          },
          labelDefinition: LabelDefinition.fromLabelString("test2"),
        }, {
          key: {
            type: "type 2",
            pathFromRoot: ["p1", "p3"],
          },
          labelDefinition: LabelDefinition.fromLabelString("test3"),
        }];
        const addonGetChildNodeCountResponse = 789;

        setup(addonGetChildNodeCountResponse);
        setup(addonGetChildNodesResponse);

        // test
        const options: Paged<HierarchyRequestOptions<IModelDb>> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: pageOptions,
        };
        const result = await manager.getNodesAndCount(ClientRequestContext.current, options, NodeKey.fromJSON(parentNodeKeyJSON)); // eslint-disable-line deprecation/deprecation

        verifyWithSnapshot(result.nodes, expectedGetChildNodesParams);
        verifyWithExpectedResult(result.count, addonGetChildNodeCountResponse, expectedGetChildNodeCountParams);
      });

    });

    describe("getFilteredNodePaths", () => {

      it("[deprecated] returns filtered node paths", async () => {
        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetFilteredNodePaths,
          params: {
            filterText: "filter",
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what addon returns
        const addonResponse = [createRandomNodePathElementJSON(0)];
        setup(addonResponse);

        // test
        const options: HierarchyRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getFilteredNodePaths(ClientRequestContext.current, options, "filter");
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns filtered node paths", async () => {
        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetFilteredNodePaths,
          params: {
            filterText: "filter",
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what addon returns
        const addonResponse = [createRandomNodePathElementJSON(0)];
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<HierarchyRequestOptions<IModelDb> & { filterText: string }> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          filterText: "filter",
        };
        const result = await manager.getFilteredNodePaths(options);
        verifyWithSnapshot(result, expectedParams);
      });

    });

    describe("getNodePaths", () => {

      it("[deprecated] returns node paths", async () => {
        // what the addon receives
        const keyJsonArray = [[createRandomECInstanceKeyJSON(), createRandomECInstanceKeyJSON()]];
        const keyArray = [keyJsonArray[0].map((json) => InstanceKey.fromJSON(json))];
        const markedIndex = faker.random.number();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetNodePaths,
          params: {
            paths: keyJsonArray,
            markedIndex,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what addon returns
        const addonResponse = [createRandomNodePathElementJSON(0)];
        setup(addonResponse);

        // test
        const options: HierarchyRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getNodePaths(ClientRequestContext.current, options, keyArray, markedIndex);
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns node paths", async () => {
        // what the addon receives
        const keyJsonArray = [[createRandomECInstanceKeyJSON(), createRandomECInstanceKeyJSON()]];
        const keyArray = [keyJsonArray[0].map((json) => InstanceKey.fromJSON(json))];
        const markedIndex = faker.random.number();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetNodePaths,
          params: {
            paths: keyJsonArray,
            markedIndex,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what addon returns
        const addonResponse = [createRandomNodePathElementJSON(0)];
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<HierarchyRequestOptions<IModelDb> & { paths: InstanceKey[][], markedIndex: number }> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paths: keyArray,
          markedIndex,
        };
        const result = await manager.getNodePaths(options);
        verifyWithSnapshot(result, expectedParams);
      });

    });

    describe("compareHierarchies", () => {

      it("[deprecated] addon to compare hierarchies after ruleset change", async () => {
        const var1: IntRulesetVariable = { id: "var", type: VariableValueTypes.Int, value: 123 };
        const var2: IntRulesetVariable = { id: "var", type: VariableValueTypes.Int, value: 465 };
        const nodeKey = createRandomECInstancesNodeKey();

        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.CompareHierarchies,
          params: {
            prevRulesetId: "test",
            prevRulesetVariables: JSON.stringify([var1]),
            currRulesetId: "test",
            currRulesetVariables: JSON.stringify([var2]),
            expandedNodeKeys: JSON.stringify([NodeKey.toJSON(nodeKey)]),
          },
        };

        // what the addon returns
        const unprocessedResponse: HierarchyCompareInfoJSON = {
          changes: [{
            type: "Insert",
            position: 1,
            node: createRandomECInstancesNodeJSON(),
          }],
        };
        const addonResponse = setup(unprocessedResponse);

        // test
        const options: HierarchyCompareOptions<IModelDb, NodeKey> = {
          imodel: imodelMock.object,
          prev: {
            rulesetOrId: "test",
            rulesetVariables: [var1],
          },
          rulesetOrId: "test",
          rulesetVariables: [var2],
          expandedNodeKeys: [nodeKey],
        };
        const result = await manager.compareHierarchies(ClientRequestContext.current, options);
        verifyWithExpectedResult(result, HierarchyCompareInfo.fromJSON(addonResponse).changes, expectedParams);
      });

      it("requests addon to compare hierarchies based on ruleset and variables' changes", async () => {
        const var1: IntRulesetVariable = { id: "var", type: VariableValueTypes.Int, value: 123 };
        const var2: IntRulesetVariable = { id: "var", type: VariableValueTypes.Int, value: 465 };
        const nodeKey = createRandomECInstancesNodeKey();

        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.CompareHierarchies,
          params: {
            prevRulesetId: "test",
            prevRulesetVariables: JSON.stringify([var1]),
            currRulesetId: "test",
            currRulesetVariables: JSON.stringify([var2]),
            expandedNodeKeys: JSON.stringify([NodeKey.toJSON(nodeKey)]),
          },
        };

        // what the addon returns
        const unprocessedResponse: HierarchyCompareInfoJSON = {
          changes: [{
            type: "Insert",
            position: 1,
            node: createRandomECInstancesNodeJSON(),
          }],
        };
        const addonResponse = setup(unprocessedResponse);

        // test
        const options: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          prev: {
            rulesetOrId: "test",
            rulesetVariables: [var1],
          },
          rulesetOrId: "test",
          rulesetVariables: [var2],
          expandedNodeKeys: [nodeKey],
        };
        const result = await manager.compareHierarchies(options);
        verifyWithExpectedResult(result, HierarchyCompareInfo.fromJSON(addonResponse), expectedParams);
      });

      it("requests addon to compare hierarchies based on ruleset changes", async () => {
        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.CompareHierarchies,
          params: {
            prevRulesetId: "test",
            prevRulesetVariables: JSON.stringify([]),
            currRulesetId: "test",
            currRulesetVariables: JSON.stringify([]),
            expandedNodeKeys: JSON.stringify([]),
          },
        };

        // what the addon returns
        const addonResponse: HierarchyCompareInfoJSON = {
          changes: [{
            type: "Delete",
            target: createRandomECInstancesNodeJSON().key,
            parent: createRandomECInstancesNodeJSON().key,
            position: 123,
          }],
        };
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          prev: {
            rulesetOrId: "test",
          },
          rulesetOrId: "test",
        };
        const result = await manager.compareHierarchies(options);
        verifyWithExpectedResult(result, HierarchyCompareInfo.fromJSON(addonResponse), expectedParams);
      });

      it("requests addon to compare hierarchies based on ruleset variables' changes", async () => {
        const var1: IntRulesetVariable = { id: "var", type: VariableValueTypes.Int, value: 123 };
        const var2: IntRulesetVariable = { id: "var", type: VariableValueTypes.Int, value: 465 };

        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.CompareHierarchies,
          params: {
            prevRulesetId: "test",
            prevRulesetVariables: JSON.stringify([var1]),
            currRulesetId: "test",
            currRulesetVariables: JSON.stringify([var2]),
            expandedNodeKeys: JSON.stringify([]),
          },
        };

        // what the addon returns
        const addonResponse: HierarchyCompareInfoJSON = {
          changes: [{
            type: "Update",
            target: createRandomECInstancesNodeJSON().key,
            changes: {},
          }],
        };
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          prev: {
            rulesetVariables: [var1],
          },
          rulesetOrId: "test",
          rulesetVariables: [var2],
        };
        const result = await manager.compareHierarchies(options);
        verifyWithExpectedResult(result, HierarchyCompareInfo.fromJSON(addonResponse), expectedParams);
      });

      it("returns empty result if neither ruleset nor ruleset variables changed", async () => {
        nativePlatformMock.reset();
        const result = await manager.compareHierarchies({
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          prev: {},
          rulesetOrId: "test",
        });
        nativePlatformMock.verify(async (x) => x.handleRequest(moq.It.isAny(), moq.It.isAny()), moq.Times.never());
        expect(result).to.deep.eq({ changes: [] });
      });

      it("throws when trying to compare hierarchies with different ruleset ids", async () => {
        nativePlatformMock.reset();
        const options: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          prev: {
            rulesetOrId: "1",
          },
          rulesetOrId: "2",
          expandedNodeKeys: [],
        };
        await expect(manager.compareHierarchies(options)).to.eventually.be.rejected;
        nativePlatformMock.verify(async (x) => x.handleRequest(moq.It.isAny(), moq.It.isAny()), moq.Times.never());
      });

      it("uses manager's `activeLocale` for comparison", async () => {
        manager.activeLocale = "test";

        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.CompareHierarchies,
          params: {
            prevRulesetId: "test",
            prevRulesetVariables: "[]",
            currRulesetId: "test",
            currRulesetVariables: "[]",
            locale: "test",
            expandedNodeKeys: "[]",
          },
        };

        // what the addon returns
        const addonResponse: HierarchyCompareInfoJSON = {
          changes: [],
        };
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          prev: {
            rulesetOrId: "test",
          },
          rulesetOrId: "test",
          expandedNodeKeys: [],
        };
        const result = await manager.compareHierarchies(options);
        verifyWithExpectedResult(result, HierarchyCompareInfo.fromJSON(addonResponse), expectedParams);
      });

      it("uses `locale` from options for comparison", async () => {
        manager.activeLocale = "manager's locale";

        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.CompareHierarchies,
          params: {
            prevRulesetId: "test",
            prevRulesetVariables: "[]",
            currRulesetId: "test",
            currRulesetVariables: "[]",
            locale: "options locale",
            expandedNodeKeys: "[]",
          },
        };

        // what the addon returns
        const addonResponse: HierarchyCompareInfoJSON = {
          changes: [],
        };
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          prev: {
            rulesetOrId: "test",
          },
          rulesetOrId: "test",
          locale: "options locale",
          expandedNodeKeys: [],
        };
        const result = await manager.compareHierarchies(options);
        verifyWithExpectedResult(result, HierarchyCompareInfo.fromJSON(addonResponse), expectedParams);
      });

    });

    describe("loadHierarchy", () => {

      it("[deprecated] requests hierarchy load", async () => {
        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.LoadHierarchy,
          params: {
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what addon returns
        setup("");

        // test
        const options: HierarchyRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        await manager.loadHierarchy(ClientRequestContext.current, options);

        // verify the addon was called with correct params
        verifyMockRequest(expectedParams);
      });

      it("requests hierarchy load", async () => {
        // what the addon receives
        const expectedParams = {
          requestId: NativePlatformRequestTypes.LoadHierarchy,
          params: {
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what addon returns
        setup("");

        // test
        const options: WithClientRequestContext<HierarchyRequestOptions<IModelDb>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        await manager.loadHierarchy(options);

        // verify the addon was called with correct params
        verifyMockRequest(expectedParams);
      });

    });

    describe("getContentDescriptor", () => {

      it("[deprecated] returns content descriptor", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContentDescriptor,
          params: {
            displayType: testData.displayType,
            keys: keys.toJSON(),
            selection: testData.selectionInfo,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse: DescriptorJSON = {
          connectionId: faker.random.uuid(),
          inputKeysHash: faker.random.uuid(),
          contentOptions: faker.random.objectElement(),
          displayType: testData.displayType,
          selectClasses: [{
            selectClassInfo: createRandomECClassInfoJSON(),
            isSelectPolymorphic: true,
            pathToPrimaryClass: createRandomRelationshipPathJSON(1),
            relatedPropertyPaths: [createRandomRelationshipPathJSON(1)],
            navigationPropertyClasses: [createRandomRelatedClassInfoJSON()],
            relatedInstanceClasses: [createRandomRelatedClassInfoJSON()],
          }],
          fields: [{
            name: "Primitive property field with editor",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            } as PrimitiveTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            editor: {
              name: faker.random.word(),
              params: {
                ["some_param"]: faker.random.number(),
              },
            },
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "string",
                enumerationInfo: {
                  choices: [{
                    label: faker.random.words(),
                    value: faker.random.uuid(),
                  }, {
                    label: faker.random.words(),
                    value: faker.random.uuid(),
                  }],
                  isStrict: faker.random.boolean(),
                },
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON, {
            name: "Complex array of structs property field",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string[]",
              valueFormat: "Array",
              memberType: {
                typeName: "SomeClass",
                valueFormat: "Struct",
                members: [{
                  name: faker.random.word(),
                  label: faker.random.words(),
                  type: {
                    typeName: "string",
                    valueFormat: "Primitive",
                  },
                }, {
                  name: faker.random.word(),
                  label: faker.random.words(),
                  type: {
                    typeName: "string[]",
                    valueFormat: "Array",
                    memberType: {
                      typeName: "string",
                      valueFormat: "Primitive",
                    },
                  } as ArrayTypeDescription,
                }],
              } as StructTypeDescription,
            } as ArrayTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "double",
                kindOfQuantity: {
                  name: faker.random.word(),
                  label: faker.random.words(),
                  persistenceUnit: faker.random.word(),
                } as KindOfQuantityInfo,
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON, {
            name: "Nested content field",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: faker.random.word(),
              valueFormat: "Struct",
              members: [{
                name: faker.random.word(),
                label: faker.random.words(),
                type: {
                  typeName: "string",
                  valueFormat: "Primitive",
                },
              }],
            } as StructTypeDescription,
            contentClassInfo: createRandomECClassInfoJSON(),
            pathToPrimaryClass: createRandomRelationshipPathJSON(1),
            nestedFields: [{
              name: "Simple property field",
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              },
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
            } as FieldJSON],
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            autoExpand: faker.random.boolean(),
          } as NestedContentFieldJSON],
          contentFlags: 0,
        };
        setup(addonResponse);

        // test
        const options: ContentRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getContentDescriptor(ClientRequestContext.current, options, testData.displayType, keys, testData.selectionInfo);
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns content descriptor", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContentDescriptor,
          params: {
            displayType: testData.displayType,
            keys: keys.toJSON(),
            selection: testData.selectionInfo,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse: DescriptorJSON = {
          connectionId: faker.random.uuid(),
          inputKeysHash: faker.random.uuid(),
          contentOptions: faker.random.objectElement(),
          displayType: testData.displayType,
          selectClasses: [{
            selectClassInfo: createRandomECClassInfoJSON(),
            isSelectPolymorphic: true,
            pathToPrimaryClass: createRandomRelationshipPathJSON(1),
            relatedPropertyPaths: [createRandomRelationshipPathJSON(1)],
            navigationPropertyClasses: [createRandomRelatedClassInfoJSON()],
            relatedInstanceClasses: [createRandomRelatedClassInfoJSON()],
          }],
          fields: [{
            name: "Primitive property field with editor",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            } as PrimitiveTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            editor: {
              name: faker.random.word(),
              params: {
                ["some_param"]: faker.random.number(),
              },
            },
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "string",
                enumerationInfo: {
                  choices: [{
                    label: faker.random.words(),
                    value: faker.random.uuid(),
                  }, {
                    label: faker.random.words(),
                    value: faker.random.uuid(),
                  }],
                  isStrict: faker.random.boolean(),
                },
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON, {
            name: "Complex array of structs property field",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string[]",
              valueFormat: "Array",
              memberType: {
                typeName: "SomeClass",
                valueFormat: "Struct",
                members: [{
                  name: faker.random.word(),
                  label: faker.random.words(),
                  type: {
                    typeName: "string",
                    valueFormat: "Primitive",
                  },
                }, {
                  name: faker.random.word(),
                  label: faker.random.words(),
                  type: {
                    typeName: "string[]",
                    valueFormat: "Array",
                    memberType: {
                      typeName: "string",
                      valueFormat: "Primitive",
                    },
                  } as ArrayTypeDescription,
                }],
              } as StructTypeDescription,
            } as ArrayTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "double",
                kindOfQuantity: {
                  name: faker.random.word(),
                  label: faker.random.words(),
                  persistenceUnit: faker.random.word(),
                } as KindOfQuantityInfo,
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON, {
            name: "Nested content field",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: faker.random.word(),
              valueFormat: "Struct",
              members: [{
                name: faker.random.word(),
                label: faker.random.words(),
                type: {
                  typeName: "string",
                  valueFormat: "Primitive",
                },
              }],
            } as StructTypeDescription,
            contentClassInfo: createRandomECClassInfoJSON(),
            pathToPrimaryClass: createRandomRelationshipPathJSON(1),
            nestedFields: [{
              name: "Simple property field",
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              },
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
            } as FieldJSON],
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            autoExpand: faker.random.boolean(),
          } as NestedContentFieldJSON],
          contentFlags: 0,
        };
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<ContentDescriptorRequestOptions<IModelDb, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          displayType: testData.displayType,
          keys,
          selection: testData.selectionInfo,
        };
        const result = await manager.getContentDescriptor(options);
        verifyWithSnapshot(result, expectedParams);
      });

    });

    describe("getContentSetSize", () => {

      it("[deprecated] returns content set size", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContentSetSize,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse = faker.random.number();
        setup(addonResponse);

        // test
        const options: ContentRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getContentSetSize(ClientRequestContext.current, options, descriptor, keys);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

      it("returns content set size", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContentSetSize,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse = faker.random.number();
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          keys,
          descriptor,
        };
        const result = await manager.getContentSetSize(options);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

      it("returns content set size when descriptor overrides are passed instead of descriptor", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContentSetSize,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: {
              displayType: descriptor.displayType,
            },
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse = faker.random.number();
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          descriptor: descriptor.createDescriptorOverrides(),
          keys,
        };
        const result = await manager.getContentSetSize(options);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

    });

    describe("getContent", () => {

      it("[deprecated] returns content", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const fieldName = faker.random.word();
        const addonResponse = {
          descriptor: {
            displayType: descriptor.displayType,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [{
              name: fieldName,
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              } as PrimitiveTypeDescription,
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
              properties: [{
                property: {
                  classInfo: createRandomECClassInfoJSON(),
                  name: faker.random.word(),
                  type: "string",
                } as PropertyInfoJSON,
                relatedClassPath: [],
              } as PropertyJSON],
            } as PropertiesFieldJSON],
            contentFlags: 0,
          } as DescriptorJSON,
          contentSet: [{
            primaryKeys: [createRandomECInstanceKeyJSON()],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: createRandomLabelDefinitionJSON(),
            imageId: faker.random.uuid(),
            values: {
              [fieldName]: faker.random.words(),
            },
            displayValues: {
              [fieldName]: faker.random.words(),
            },
            mergedFieldNames: [],
          } as ItemJSON],
        } as ContentJSON;
        setup(addonResponse);

        // test
        const options: Paged<ContentRequestOptions<IModelDb>> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const result = await manager.getContent(ClientRequestContext.current, options, descriptor, keys);
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns content", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const fieldName = faker.random.word();
        const addonResponse = {
          descriptor: {
            displayType: descriptor.displayType,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [{
              name: fieldName,
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              } as PrimitiveTypeDescription,
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
              properties: [{
                property: {
                  classInfo: createRandomECClassInfoJSON(),
                  name: faker.random.word(),
                  type: "string",
                } as PropertyInfoJSON,
                relatedClassPath: [],
              } as PropertyJSON],
            } as PropertiesFieldJSON],
            contentFlags: 0,
          } as DescriptorJSON,
          contentSet: [{
            primaryKeys: [createRandomECInstanceKeyJSON()],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: createRandomLabelDefinitionJSON(),
            imageId: faker.random.uuid(),
            values: {
              [fieldName]: faker.random.words(),
            },
            displayValues: {
              [fieldName]: faker.random.words(),
            },
            mergedFieldNames: [],
          } as ItemJSON],
        } as ContentJSON;
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor,
          keys,
        };
        const result = await manager.getContent(options);
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns content for BisCore:Element instances when concrete key is found", async () => {
        // what the addon receives
        const baseClassKey = { className: "BisCore:Element", id: createRandomId() };
        const concreteClassKey = { className: faker.random.word(), id: baseClassKey.id };
        setupIModelForElementKey(imodelMock, concreteClassKey);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet([concreteClassKey]).toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const fieldName = faker.random.word();
        const addonResponse = {
          descriptor: {
            displayType: descriptor.displayType,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [{
              name: fieldName,
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              } as PrimitiveTypeDescription,
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
              properties: [{
                property: {
                  classInfo: createRandomECClassInfoJSON(),
                  name: faker.random.word(),
                  type: "string",
                } as PropertyInfoJSON,
                relatedClassPath: [],
              } as PropertyJSON],
            } as PropertiesFieldJSON],
            contentFlags: 0,
          } as DescriptorJSON,
          contentSet: [{
            primaryKeys: [createRandomECInstanceKeyJSON()],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: createRandomLabelDefinitionJSON(),
            imageId: faker.random.uuid(),
            values: {
              [fieldName]: faker.random.words(),
            },
            displayValues: {
              [fieldName]: faker.random.words(),
            },
            mergedFieldNames: [],
          } as ItemJSON],
        } as ContentJSON;
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor,
          keys: new KeySet([baseClassKey]),
        };
        const result = await manager.getContent(options);
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns content for BisCore:Element instances when concrete key is not found", async () => {
        // what the addon receives
        const baseClassKey = { className: "BisCore:Element", id: createRandomId() };
        setupIModelForNoResultStatement(imodelMock);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet([baseClassKey]).toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const fieldName = faker.random.word();
        const addonResponse = {
          descriptor: {
            displayType: descriptor.displayType,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [{
              name: fieldName,
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              } as PrimitiveTypeDescription,
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
              properties: [{
                property: {
                  classInfo: createRandomECClassInfoJSON(),
                  name: faker.random.word(),
                  type: "string",
                } as PropertyInfoJSON,
                relatedClassPath: [],
              } as PropertyJSON],
            } as PropertiesFieldJSON],
            contentFlags: 0,
          } as DescriptorJSON,
          contentSet: [{
            primaryKeys: [createRandomECInstanceKeyJSON()],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: createRandomLabelDefinitionJSON(),
            imageId: faker.random.uuid(),
            values: {
              [fieldName]: faker.random.words(),
            },
            displayValues: {
              [fieldName]: faker.random.words(),
            },
            mergedFieldNames: [],
          } as ItemJSON],
        } as ContentJSON;
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor,
          keys: new KeySet([baseClassKey]),
        };
        const result = await manager.getContent(options);
        verifyWithSnapshot(result, expectedParams);
      });

      it("returns content when descriptor overrides are passed instead of descriptor", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: {
              displayType: descriptor.displayType,
            },
            paging: testData.pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const fieldName = faker.random.word();
        const addonResponse = {
          descriptor: {
            displayType: descriptor.displayType,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [{
              name: fieldName,
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              } as PrimitiveTypeDescription,
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
              properties: [{
                property: {
                  classInfo: createRandomECClassInfoJSON(),
                  name: faker.random.word(),
                  type: "string",
                } as PropertyInfoJSON,
                relatedClassPath: [],
              } as PropertyJSON],
            } as PropertiesFieldJSON],
            contentFlags: 0,
          } as DescriptorJSON,
          contentSet: [{
            primaryKeys: [createRandomECInstanceKeyJSON()],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: createRandomLabelDefinitionJSON(),
            imageId: faker.random.uuid(),
            values: {
              [fieldName]: faker.random.words(),
            },
            displayValues: {
              [fieldName]: faker.random.words(),
            },
            mergedFieldNames: [],
          } as ItemJSON],
        } as ContentJSON;
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: descriptor.createDescriptorOverrides(),
          keys,
        };
        const result = await manager.getContent(options);
        verifyWithSnapshot(result, expectedParams);
      });

    });

    describe("[deprecated] getContentAndSize", () => {

      it("returns content and content set size", async () => {
        // what the addon receives
        const pageOptions = { start: 0, size: 2 };
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const expectedGetContentParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            paging: pageOptions,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };
        const expectedGetContentSetSizeParams = {
          requestId: NativePlatformRequestTypes.GetContentSetSize,
          params: {
            keys: keys.toJSON(),
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
            paging: pageOptions,
          },
        };

        // what the addon returns
        const fieldName = faker.random.word();
        const addonGetContentResponse = {
          descriptor: {
            displayType: descriptor.displayType,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [{
              name: fieldName,
              category: createRandomCategory(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              } as PrimitiveTypeDescription,
              isReadonly: faker.random.boolean(),
              priority: faker.random.number(),
              properties: [{
                property: {
                  classInfo: createRandomECClassInfoJSON(),
                  name: faker.random.word(),
                  type: "string",
                } as PropertyInfoJSON,
                relatedClassPath: [],
              } as PropertyJSON],
            } as PropertiesFieldJSON],
            contentFlags: 0,
          } as DescriptorJSON,
          contentSet: [{
            primaryKeys: [createRandomECInstanceKeyJSON()],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: createRandomLabelDefinitionJSON(),
            imageId: faker.random.uuid(),
            values: {
              [fieldName]: faker.random.words(),
            },
            displayValues: {
              [fieldName]: faker.random.words(),
            },
            mergedFieldNames: [],
          } as ItemJSON],
        } as ContentJSON;
        const addonGetContentSetSizeResponse = faker.random.number();

        setup(addonGetContentSetSizeResponse);
        setup(addonGetContentResponse);

        // test
        const options: Paged<ContentRequestOptions<IModelDb>> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: pageOptions,
        };
        const result = await manager.getContentAndSize(ClientRequestContext.current, options, descriptor, keys);

        verifyWithSnapshot(result.content, expectedGetContentParams);
        verifyWithExpectedResult(result.size, addonGetContentSetSizeResponse, expectedGetContentSetSizeParams);
      });

    });

    describe("[deprecated] getDistinctValues", () => {

      it("returns distinct values", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const fieldName = faker.random.word();
        const maximumValueCount = faker.random.number();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetDistinctValues,
          params: {
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            keys: keys.toJSON(),
            fieldName,
            maximumValueCount,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse = [faker.random.word(), faker.random.word(), faker.random.word()];
        setup(addonResponse);

        // test
        const options: ContentRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getDistinctValues(ClientRequestContext.current, options, descriptor,
          keys, fieldName, maximumValueCount);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

      it("passes 0 for maximumValueCount by default", async () => {
        // what the addon receives
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetDistinctValues,
          params: {
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            keys: { instanceKeys: [], nodeKeys: [] },
            fieldName: "",
            maximumValueCount: 0,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
          },
        };

        // what the addon returns
        const addonResponse: string[] = [];
        setup(addonResponse);

        // test
        const options: ContentRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        const result = await manager.getDistinctValues(ClientRequestContext.current, options, descriptor, new KeySet(), "");
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

    });

    describe("getPagedDistinctValues", () => {

      it("returns distinct values", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstancesNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const fieldDescriptor: FieldDescriptor = {
          type: FieldDescriptorType.Name,
          fieldName: faker.random.word(),
        };
        const pageOpts: PageOptions = {
          start: 1,
          size: 2,
        };
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetPagedDistinctValues,
          params: {
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            keys: keys.toJSON(),
            fieldDescriptor,
            rulesetId: manager.getRulesetId(testData.rulesetOrId),
            paging: pageOpts,
          },
        };

        // what the addon returns
        const addonResponse = {
          total: 1,
          items: [{
            displayValue: "test",
            groupedRawValues: ["test"],
          }],
        };
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<DistinctValuesRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          descriptor,
          keys,
          fieldDescriptor,
          paging: pageOpts,
        };
        const result = await manager.getPagedDistinctValues(options);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

    });

    describe("getElementProperties", () => {

      it("returns element properties", async () => {
        // what the addon receives
        const elementKey = { className: "BisCore:Element", id: "0x123" };
        setupIModelForElementKey(imodelMock, elementKey);

        const expectedContentParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet([elementKey]).toJSON(),
            descriptorOverrides: {
              displayType: DefaultContentDisplayTypes.PropertyPane,
              contentFlags: ContentFlags.ShowLabels,
            },
            rulesetId: "ElementProperties",
          },
        };

        // what the addon returns
        const addonContentResponse = new Content(
          createTestContentDescriptor({
            fields: [
              createTestSimpleContentField({
                name: "test",
                label: "Test Field",
                category: createTestCategoryDescription({ label: "Test Category" }),
              }),
            ],
          }),
          [
            createTestContentItem({
              label: "test label",
              classInfo: createTestECClassInfo({ label: "Test Class" }),
              primaryKeys: [{ className: "TestSchema:TestClass", id: "0x123" }],
              values: {
                test: "test value",
              },
              displayValues: {
                test: "test display value",
              },
            }),
          ],
        ).toJSON();
        setup(addonContentResponse);

        // test
        const options: WithClientRequestContext<ElementPropertiesRequestOptions<IModelDb>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          elementId: elementKey.id,
        };
        const expectedResponse: ElementProperties = {
          class: "Test Class",
          id: "0x123",
          label: "test label",
          items: {
            ["Test Category"]: {
              type: "category",
              items: {
                ["Test Field"]: {
                  type: "primitive",
                  value: "test display value",
                },
              },
            },
          },
        };
        const result = await manager.getElementProperties(options);
        verifyMockRequest(expectedContentParams);
        expect(result).to.deep.eq(expectedResponse);
      });

    });

    describe("getDisplayLabelDefinition", () => {

      it("[deprecated] returns label from native addon", async () => {
        // what the addon receives
        const key = createRandomECInstanceKey();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetDisplayLabel,
          params: {
            key,
          },
        };

        // what the addon returns
        const addonResponse = createRandomLabelDefinitionJSON();
        setup(addonResponse);

        // test
        const options: LabelRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
        };
        const result = await manager.getDisplayLabelDefinition(ClientRequestContext.current, options, key);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

      it("returns label from native addon", async () => {
        // what the addon receives
        const key = createRandomECInstanceKey();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetDisplayLabel,
          params: {
            key,
          },
        };

        // what the addon returns
        const addonResponse = createRandomLabelDefinitionJSON();
        setup(addonResponse);

        // test
        const options: WithClientRequestContext<DisplayLabelRequestOptions<IModelDb, InstanceKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          key,
        };
        const result = await manager.getDisplayLabelDefinition(options);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

    });

    describe("getDisplayLabelDefinitions", () => {

      it("[deprecated] returns labels from list content", async () => {
        // what the addon receives
        const keys = [createRandomECInstanceKey(), createRandomECInstanceKey()];
        const labels = [createRandomLabelDefinitionJSON(), createRandomLabelDefinitionJSON()];
        const expectedContentParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet(keys).toJSON(),
            descriptorOverrides: {
              displayType: DefaultContentDisplayTypes.List,
              contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
              hiddenFieldNames: [],
            },
            rulesetId: "RulesDrivenECPresentationManager_RulesetId_DisplayLabel",
          },
        };

        // what the addon returns
        const addonContentResponse = {
          descriptor: {
            connectionId: faker.random.uuid(),
            inputKeysHash: faker.random.uuid(),
            contentOptions: {},
            displayType: DefaultContentDisplayTypes.List,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [],
            contentFlags: 0,
          } as DescriptorJSON,
          // note: return in wrong order to verify the resulting labels are still in the right order
          contentSet: [1, 0].map((index): ItemJSON => ({
            primaryKeys: [keys[index]],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: labels[index],
            imageId: faker.random.uuid(),
            values: {},
            displayValues: {},
            mergedFieldNames: [],
          })),
        } as ContentJSON;
        setup(addonContentResponse);

        // test
        const options: LabelRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
        };
        const result = await manager.getDisplayLabelDefinitions(ClientRequestContext.current, options, keys);
        verifyMockRequest(expectedContentParams);
        expect(result).to.deep.eq(labels);
      });

      it("returns labels from list content", async () => {
        // what the addon receives
        const keys = [createRandomECInstanceKey(), createRandomECInstanceKey()];
        const labels = [createRandomLabelDefinitionJSON(), createRandomLabelDefinitionJSON()];
        const expectedContentParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet(keys).toJSON(),
            descriptorOverrides: {
              displayType: DefaultContentDisplayTypes.List,
              contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
              hiddenFieldNames: [],
            },
            rulesetId: "RulesDrivenECPresentationManager_RulesetId_DisplayLabel",
          },
        };

        // what the addon returns
        const addonContentResponse = {
          descriptor: {
            connectionId: faker.random.uuid(),
            inputKeysHash: faker.random.uuid(),
            contentOptions: {},
            displayType: DefaultContentDisplayTypes.List,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [],
            contentFlags: 0,
          } as DescriptorJSON,
          // note: return in wrong order to verify the resulting labels are still in the right order
          contentSet: [1, 0].map((index): ItemJSON => ({
            primaryKeys: [keys[index]],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: labels[index],
            imageId: faker.random.uuid(),
            values: {},
            displayValues: {},
            mergedFieldNames: [],
          })),
        } as ContentJSON;
        setup(addonContentResponse);

        // test
        const options: WithClientRequestContext<DisplayLabelsRequestOptions<IModelDb, InstanceKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          keys,
        };
        const result = await manager.getDisplayLabelDefinitions(options);
        verifyMockRequest(expectedContentParams);
        expect(result).to.deep.eq(labels);
      });

      it("returns labels for BisCore:Element instances", async () => {
        // what the addon receives
        const baseClassKey = { className: "BisCore:Element", id: createRandomId() };
        const concreteClassKey = { className: faker.random.word(), id: baseClassKey.id };
        setupIModelForElementKey(imodelMock, concreteClassKey);
        const label = createRandomLabelDefinitionJSON();
        const expectedContentParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet([concreteClassKey]).toJSON(),
            descriptorOverrides: {
              displayType: DefaultContentDisplayTypes.List,
              contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
              hiddenFieldNames: [],
            },
            rulesetId: "RulesDrivenECPresentationManager_RulesetId_DisplayLabel",
          },
        };

        // what the addon returns
        const addonContentResponse = {
          descriptor: {
            connectionId: faker.random.uuid(),
            inputKeysHash: faker.random.uuid(),
            contentOptions: {},
            displayType: DefaultContentDisplayTypes.List,
            selectClasses: [{
              selectClassInfo: createRandomECClassInfoJSON(),
              isSelectPolymorphic: true,
              pathToPrimaryClass: [],
              relatedPropertyPaths: [],
              navigationPropertyClasses: [],
              relatedInstanceClasses: [],
            } as SelectClassInfoJSON],
            fields: [],
            contentFlags: 0,
          } as DescriptorJSON,
          // note: return in wrong order to verify the resulting labels are still in the right order
          contentSet: [{
            primaryKeys: [concreteClassKey],
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: label,
            imageId: faker.random.uuid(),
            values: {},
            displayValues: {},
            mergedFieldNames: [],
          }],
        } as ContentJSON;
        setup(addonContentResponse);

        // test
        const options: WithClientRequestContext<DisplayLabelsRequestOptions<IModelDb, InstanceKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          keys: [baseClassKey],
        };
        const result = await manager.getDisplayLabelDefinitions(options);
        verifyMockRequest(expectedContentParams);
        expect(result).to.deep.eq([label]);
      });

      it("returns empty labels if content doesn't contain item with request key", async () => {
        const keys = [createRandomECInstanceKey()];
        const expectedContentParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet(keys).toJSON(),
            descriptorOverrides: {
              displayType: DefaultContentDisplayTypes.List,
              contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
              hiddenFieldNames: [],
            },
            rulesetId: "RulesDrivenECPresentationManager_RulesetId_DisplayLabel",
          },
        };

        // what the addon returns
        const addonContentResponse = {
          descriptor: createRandomDescriptorJSON(),
          contentSet: [{
            primaryKeys: [createRandomECInstanceKeyJSON()], // different than input key
            classInfo: createRandomECClassInfoJSON(),
            labelDefinition: createRandomLabelDefinitionJSON(),
            imageId: faker.random.uuid(),
            values: {},
            displayValues: {},
            mergedFieldNames: [],
          }],
        } as ContentJSON;
        setup(addonContentResponse);

        // test
        const options: WithClientRequestContext<DisplayLabelsRequestOptions<IModelDb, InstanceKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          keys,
        };
        const result = await manager.getDisplayLabelDefinitions(options);
        verifyMockRequest(expectedContentParams);
        expect(result).to.deep.eq([{ displayValue: "", rawValue: "", typeName: "" }]);
      });

      it("returns empty labels if content is undefined", async () => {
        const keys = [createRandomECInstanceKey()];
        const expectedContentParams = {
          requestId: NativePlatformRequestTypes.GetContent,
          params: {
            keys: new KeySet(keys).toJSON(),
            descriptorOverrides: {
              displayType: DefaultContentDisplayTypes.List,
              contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
              hiddenFieldNames: [],
            },
            rulesetId: "RulesDrivenECPresentationManager_RulesetId_DisplayLabel",
          },
        };

        // what the addon returns
        setup(null);

        // test
        const options: WithClientRequestContext<DisplayLabelsRequestOptions<IModelDb, InstanceKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: imodelMock.object,
          keys,
        };
        const result = await manager.getDisplayLabelDefinitions(options);
        verifyMockRequest(expectedContentParams);
        expect(result).to.deep.eq([{ displayValue: "", rawValue: "", typeName: "" }]);
      });

    });

    it("throws on invalid addon response", async () => {
      nativePlatformMock.setup(async (x) => x.handleRequest(moq.It.isAny(), moq.It.isAnyString())).returns(() => (undefined as any));
      const options: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
        requestContext: ClientRequestContext.current,
        imodel: imodelMock.object,
        rulesetOrId: testData.rulesetOrId,
      };
      return expect(manager.getNodesCount(options)).to.eventually.be.rejectedWith(Error);
    });

  });

  describe("getSelectionScopes", () => {

    const addon = moq.Mock.ofType<NativePlatformDefinition>();
    const imodel = moq.Mock.ofType<IModelDb>();
    let manager: PresentationManager;

    beforeEach(() => {
      addon.reset();
      imodel.reset();
      manager = new PresentationManager({ addon: addon.object });
    });

    afterEach(() => {
      manager.dispose();
    });

    it("[deprecated] requests scopes from `SelectionScopesHelper`", async () => {
      const scopes = new Array<SelectionScope>();
      const stub = sinon.stub(SelectionScopesHelper, "getSelectionScopes").returns(scopes);
      const result = await manager.getSelectionScopes(ClientRequestContext.current, { imodel: imodel.object });
      expect(stub).to.be.calledOnce;
      expect(result).to.deep.eq(scopes);
    });

    it("requests scopes from `SelectionScopesHelper`", async () => {
      const scopes = new Array<SelectionScope>();
      const stub = sinon.stub(SelectionScopesHelper, "getSelectionScopes").returns(scopes);
      const result = await manager.getSelectionScopes({ requestContext: ClientRequestContext.current, imodel: imodel.object });
      expect(stub).to.be.calledOnce;
      expect(result).to.deep.eq(scopes);
    });

  });

  describe("computeSelection", () => {

    const addon = moq.Mock.ofType<NativePlatformDefinition>();
    const imodel = moq.Mock.ofType<IModelDb>();
    let manager: PresentationManager;

    beforeEach(() => {
      addon.reset();
      imodel.reset();
      manager = new PresentationManager({ addon: addon.object });
    });

    afterEach(() => {
      manager.dispose();
    });

    it("[deprecated] computes selection using `SelectionScopesHelper`", async () => {
      const ids = [createRandomId()];
      const resultKeys = new KeySet();
      const stub = sinon.stub(SelectionScopesHelper, "computeSelection").resolves(resultKeys);
      const result = await manager.computeSelection(ClientRequestContext.current, { imodel: imodel.object }, ids, "test scope");
      expect(stub).to.be.calledOnceWith({ imodel: imodel.object }, ids, "test scope");
      expect(result).to.eq(resultKeys);
    });

    it("computes selection using `SelectionScopesHelper`", async () => {
      const ids = [createRandomId()];
      const resultKeys = new KeySet();
      const stub = sinon.stub(SelectionScopesHelper, "computeSelection").resolves(resultKeys);
      const result = await manager.computeSelection({ requestContext: ClientRequestContext.current, imodel: imodel.object, ids, scopeId: "test scope" });
      expect(stub).to.be.calledOnceWith({ imodel: imodel.object }, ids, "test scope");
      expect(result).to.eq(resultKeys);
    });

  });

});
