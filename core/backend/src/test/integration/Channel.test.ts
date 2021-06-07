/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { DbOpcode, GuidString, Id64String } from "@bentley/bentleyjs-core";
import { IModel, SubCategoryAppearance } from "@bentley/imodeljs-common";
import { BriefcaseManager } from "../../BriefcaseManager";
import { SpatialCategory } from "../../Category";
import { ConcurrencyControl } from "../../ConcurrencyControl";
import { InformationPartitionElement, Subject } from "../../Element";
import { BriefcaseDb, IModelDb } from "../../IModelDb";
import { AuthorizedBackendRequestContext, ChannelRootAspect } from "../../imodeljs-backend";
import { DictionaryModel } from "../../Model";
import { HubMock } from "../HubMock";
import { IModelTestUtils, TestUserType } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";

function createAndInsertSpatialCategory(testIModel: IModelDb, name: string): Id64String {
  const dictionary: DictionaryModel = testIModel.models.getModel<DictionaryModel>(IModel.dictionaryId);
  const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, name);
  return SpatialCategory.insert(testIModel, IModel.dictionaryId, newCategoryCode.value, new SubCategoryAppearance({ color: 0xff0000 }));
}

describe("Channel Control (#integration)", () => {
  let readWriteTestIModelId: GuidString;
  let testProjectId: string;
  let managerRequestContext: AuthorizedBackendRequestContext;
  let m2: Id64String;
  let m3: Id64String;
  let modelInRepositoryChannel: Id64String;
  let catId: Id64String;
  let channel2: Id64String;
  let channel3: Id64String;
  let el21: Id64String;

  before(async () => {
    HubMock.startup("channels");
    managerRequestContext = await IModelTestUtils.getUserContext(TestUserType.Manager);
    testProjectId = await HubUtility.getTestContextId(managerRequestContext);
    readWriteTestIModelId = await HubUtility.recreateIModel(managerRequestContext, testProjectId, "ChannelControlIModel");
  });

  after(async () => {
    try {
      HubMock.shutdown();
    } catch (err) {
    }
  });

  it("should create channels (#integration)", async () => {
    const props = await BriefcaseManager.downloadBriefcase(managerRequestContext, { contextId: testProjectId, iModelId: readWriteTestIModelId });
    managerRequestContext.enter();
    const imodel1 = await BriefcaseDb.open(managerRequestContext, { fileName: props.fileName });
    managerRequestContext.enter();
    imodel1.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    imodel1.concurrencyControl.startBulkMode();

    // We are currently in NO channel
    assert.isUndefined(imodel1.concurrencyControl.channel.channelRoot);

    // Being in NO channel means that we can write to any non-exclusive channel, including the repository channel.

    // Create some shared elements

    //  -- Channel root elements
    //    This also demonstrates that you can create new channels while you are in NO channel. (Below we verify that you cannot create a new channel while in a normal channel.)
    channel2 = imodel1.elements.insertElement(IModelTestUtils.createJobSubjectElement(imodel1, "channel2")); // Create one of the channels to mimic the way bridges set them up.
    channel3 = imodel1.elements.insertElement(Subject.create(imodel1, imodel1.elements.getRootSubject().id, "channel3"));
    const channel3Info = "this is channel3"; // could be an object or anything you like
    ChannelRootAspect.insert(imodel1, channel3, channel3Info); // Create one of the channels using the new aspect in the way iModel.js apps would set them up.

    //  -- a PhysicalPartition that is right off of the root.
    modelInRepositoryChannel = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(imodel1, IModelTestUtils.getUniqueModelCode(imodel1, "modelInRepositoryChannel"), true, IModel.rootSubjectId)[1];

    //  -- a SpatialCategory in the DictionaryModel for all channels to share.
    catId = createAndInsertSpatialCategory(imodel1, "category");

    await imodel1.concurrencyControl.request(managerRequestContext);

    // Before saving, verify that ...

    // You cannot enter a channel unless you first save
    assert.throws(() => imodel1.concurrencyControl.channel.channelRoot = channel2); // ChannelConstraintError
    imodel1.saveChanges();

    // You cannot enter a channel unless you first push
    assert.throws(() => imodel1.concurrencyControl.channel.channelRoot = channel2); // ChannelConstraintError;

    await imodel1.pushChanges(managerRequestContext, "channel roots created");

    // Populate channel2
    imodel1.concurrencyControl.channel.channelRoot = channel2;
    m2 = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(imodel1, IModelTestUtils.getUniqueModelCode(imodel1, "m2"), true, channel2)[1];
    await imodel1.concurrencyControl.request(managerRequestContext);
    imodel1.saveChanges();

    // Before saving, verify that ...

    // You cannot switch channels unless you first push
    assert.throws(() => imodel1.concurrencyControl.channel.channelRoot = channel3); // ChannelConstraintError

    await imodel1.pushChanges(managerRequestContext, "channel2 populated");

    // Switch to channel3 and populate it.
    imodel1.concurrencyControl.channel.channelRoot = channel3;
    m3 = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(imodel1, IModelTestUtils.getUniqueModelCode(imodel1, "m3"), true, channel3)[1];
    await imodel1.concurrencyControl.request(managerRequestContext);
    imodel1.saveChanges();
    await imodel1.pushChanges(managerRequestContext, "channel3 populated");

    //  Switch back to channel2 and write more stuff to it.
    imodel1.concurrencyControl.channel.channelRoot = channel2;
    el21 = imodel1.elements.insertElement(IModelTestUtils.createPhysicalObject(imodel1, m2, catId));
    await imodel1.concurrencyControl.request(managerRequestContext);
    imodel1.saveChanges();
    await imodel1.pushChanges(managerRequestContext, "more channel2 changes");

    // The setup is now:

    // Model:   Elements within model
    // -----    ---------------------
    // m1:      el1
    //            +- channel2       +-- channel3
    //                +- m2              +- m3
    // m2:                 el21

    // Do some queries. (It doesn't matter what channel we are in.)
    const cctl = imodel1.concurrencyControl.channel;

    const e1 = imodel1.elements.getElement(IModelDb.rootSubjectId);
    assert.isFalse(cctl.isChannelRoot(e1));
    assert.isTrue(cctl.getChannelOfElement(e1) instanceof ConcurrencyControl.RepositoryChannelInfo);

    const channel2Props = imodel1.elements.getElement(channel2);
    assert.isTrue(cctl.isChannelRoot(channel2Props));
    const cpi = cctl.getChannelOfElement(channel2Props);
    assert.isTrue(cpi instanceof ConcurrencyControl.ChannelRootInfo);
    assert.isFalse(!(cpi instanceof ConcurrencyControl.ChannelRootInfo));
    assert.equal(cpi.channelRoot, channel2);

    const el21props = imodel1.elements.getElement(el21);
    assert.isFalse(cctl.isChannelRoot(el21props));
    const ci = cctl.getChannelOfElement(el21props);
    assert.isTrue(!(ci instanceof ConcurrencyControl.ChannelRootInfo));
    assert.equal(ci.channelRoot, channel2);

    const cim3 = cctl.getChannelOfModel(m3);
    assert.isTrue(!(cim3 instanceof ConcurrencyControl.ChannelRootInfo));
    assert.equal(cim3.channelRoot, channel3);

    //  More channel constraints
    const req = new ConcurrencyControl.Request();
    const opcode = DbOpcode.Insert;

    cctl.channelRoot = channel2;

    //  -- while in channel2...

    //    -- you cannot insert a new channel
    const newChannelParent = IModelTestUtils.createJobSubjectElement(imodel1, "channel-new");
    assert.throws(() => cctl.checkCanWriteElementToCurrentChannel(newChannelParent, req, opcode)); // I am calling onElementWrite directly only for testing purposes. A real app should never call this method directly.

    //    -- you can write to channel2
    const e22 = IModelTestUtils.createPhysicalObject(imodel1, m2, catId);
    assert.doesNotThrow(() => cctl.checkCanWriteElementToCurrentChannel(e22, req, opcode));

    //    -- you cannot write to channel3
    const e31 = IModelTestUtils.createPhysicalObject(imodel1, m3, catId);
    assert.throws(() => cctl.checkCanWriteElementToCurrentChannel(e31, req, opcode));

    assert.isTrue(imodel1.concurrencyControl.pendingRequest.isEmpty);
    assert.isFalse(imodel1.txns.hasUnsavedChanges);
    assert.isFalse(imodel1.txns.hasPendingTxns);

    const newModelCode = InformationPartitionElement.createCode(imodel1, channel2, "channel-constraint-test-new-model-code");
    assert.throws(() => IModelTestUtils.createAndInsertPhysicalPartitionAndModel(imodel1, newModelCode, true, channel3));

    assert.isTrue(imodel1.concurrencyControl.pendingRequest.isEmpty);
    assert.isFalse(imodel1.txns.hasUnsavedChanges);
    assert.isFalse(imodel1.txns.hasPendingTxns);

    // (You can, nevertheless, get information about channel3)
    const channel3Props = imodel1.elements.getElement(channel3);
    assert.isTrue(cctl.isChannelRoot(channel3Props));
    assert.equal(channel3Info, cctl.getChannelRootInfo(channel3Props));

    //        You can write to channel2. This also proves that the rejection above was exception-safe.
    //        The Code should remain unused; there should be no duplicates in the pendingRequest, etc.
    IModelTestUtils.createAndInsertPhysicalPartitionAndModel(imodel1, newModelCode, true, channel2);
    assert.isFalse(imodel1.concurrencyControl.pendingRequest.isEmpty);
    assert.isTrue(imodel1.txns.hasUnsavedChanges);
    assert.isFalse(imodel1.txns.hasPendingTxns);
    await imodel1.concurrencyControl.request(managerRequestContext); // (will throw if pendingRequest has dups)
    assert.isTrue(imodel1.concurrencyControl.pendingRequest.isEmpty);
    imodel1.saveChanges(newModelCode.value);
    assert.isTrue(imodel1.concurrencyControl.pendingRequest.isEmpty);
    assert.isFalse(imodel1.txns.hasUnsavedChanges);
    assert.isTrue(imodel1.txns.hasPendingTxns);
    await imodel1.pushChanges(managerRequestContext, newModelCode.value || "");

    //    -- you cannot write elements with a Code that is scoped to a different channel
    const newModelCodeM3 = InformationPartitionElement.createCode(imodel1, channel3, "channel-constraint-test-new-model-code-channel3-scope");
    assert.throws(() => IModelTestUtils.createAndInsertPhysicalPartitionAndModel(imodel1, newModelCodeM3, true, channel2));

    assert.isTrue(imodel1.concurrencyControl.pendingRequest.isEmpty);
    assert.isFalse(imodel1.txns.hasUnsavedChanges);
    assert.isFalse(imodel1.txns.hasPendingTxns);

    //    -- you cannot write to the shared model
    const elementInSharedModel = IModelTestUtils.createPhysicalObject(imodel1, modelInRepositoryChannel, catId);
    assert.throws(() => cctl.checkCanWriteElementToCurrentChannel(e31, req, opcode));

    //  -- while in NO channel ...

    cctl.channelRoot = undefined; // => no channel
    assert.doesNotThrow(() => cctl.checkCanWriteElementToCurrentChannel(elementInSharedModel, req, opcode)); // you can write to the repository channel
    assert.throws(() => cctl.checkCanWriteElementToCurrentChannel(e22, req, opcode)); // you cannot write to any normal private channel
    assert.throws(() => cctl.checkCanWriteElementToCurrentChannel(e31, req, opcode));

    // TODO: Verify that you can write to a normal, non-private channel

    imodel1.close();
  });

});
