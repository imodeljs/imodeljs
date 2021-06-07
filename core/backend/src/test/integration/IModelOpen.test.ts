/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BentleyError, GuidString } from "@bentley/bentleyjs-core";
import { IModelVersion } from "@bentley/imodeljs-common";
import { AccessToken } from "@bentley/itwin-client";
import { TestUsers, TestUtility } from "@bentley/oidc-signin-tool";
import { assert, expect } from "chai";
import { SnapshotDb } from "../../IModelDb";
import { AuthorizedBackendRequestContext, BriefcaseManager, IModelHost } from "../../imodeljs-backend";
import { IModelTestUtils } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";

describe("IModelOpen (#integration)", () => {

  let requestContext: AuthorizedBackendRequestContext;
  let testIModelId: GuidString;
  let testContextId: GuidString;
  let testChangeSetId: string;

  before(async () => {
    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
    testContextId = await HubUtility.getTestContextId(requestContext);
    requestContext.enter();

    testIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.stadium);
    testChangeSetId = await HubUtility.queryLatestChangeSetId(requestContext, testIModelId);
  });

  const deleteTestIModelCache = () => {
    const path = (BriefcaseManager as any).getIModelPath(testIModelId);
    (BriefcaseManager as any).deleteFolderAndContents(path);
  };

  it("Unauthorized requests should cause an obvious error", async () => {
    const badToken = new AccessToken("ThisIsABadToken");
    const badRequestContext = new AuthorizedBackendRequestContext(badToken);

    // Try the bad request context
    await expect(IModelTestUtils.downloadAndOpenCheckpoint({ requestContext: badRequestContext, contextId: testContextId, iModelId: testIModelId }))
      .to.be.rejectedWith(BentleyError).to.eventually.have.property("status", 401);

    await expect(IModelTestUtils.downloadAndOpenCheckpoint({ requestContext: badRequestContext, contextId: testContextId, iModelId: testIModelId, asOf: IModelVersion.asOfChangeSet(testChangeSetId).toJSON() }))
      .to.be.rejectedWith(BentleyError).to.eventually.have.property("status", 401);
  });

  it("should be able to handle simultaneous open calls", async () => {
    // Clean folder to re-fetch briefcase
    deleteTestIModelCache();

    const numTries = 100;
    const version = IModelVersion.asOfChangeSet(testChangeSetId).toJSON();

    // Open iModel with no timeout, and ensure all promises resolve to the same briefcase
    const openPromises = new Array<Promise<SnapshotDb>>();
    for (let ii = 0; ii < numTries; ii++) {
      const open = IModelTestUtils.downloadAndOpenCheckpoint({ requestContext, contextId: testContextId, iModelId: testIModelId, asOf: version });
      openPromises.push(open);
    }
    const iModels = await Promise.all(openPromises);
    const pathname = iModels[0].pathName;
    for (let ii = 1; ii < numTries; ii++) {
      assert.strictEqual(iModels[ii].pathName, pathname);
    }
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModels[0]);
  });

  it("should be able to open a version that requires many merges", async () => {
    // Clean folder to refetch briefcase
    deleteTestIModelCache();

    const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId: testIModelId });
    const numChangeSets = changeSets.length;
    assert.isAbove(numChangeSets, 10);

    const iModel = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext, contextId: testContextId, iModelId: testIModelId, asOf: IModelVersion.asOfChangeSet(changeSets[9].id).toJSON() });
    assert.isDefined(iModel);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
  });

});
