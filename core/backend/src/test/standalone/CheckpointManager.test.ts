/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import { ClientRequestContext, Guid } from "@bentley/bentleyjs-core";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { CheckpointManager, V1CheckpointManager, V2CheckpointManager } from "../../CheckpointManager";
import { SnapshotDb } from "../../IModelDb";
import { IModelHost } from "../../imodeljs-backend";
import { IModelJsFs } from "../../IModelJsFs";
import { IModelTestUtils } from "../IModelTestUtils";

describe("V1 Checkpoint Manager", () => {
  it("empty props", async () => {
    const props = {
      contextId: "",
      iModelId: "",
      changeSetId: "",
      requestContext: new AuthorizedClientRequestContext(new AccessToken()),
    };
    assert.equal(V1CheckpointManager.getFileName(props), path.join(IModelHost.cacheDir, "imodels", "checkpoints", "first.bim"));
  });

  it("changeset only props", async () => {
    const props = {
      contextId: "",
      iModelId: "",
      changeSetId: "1234",
      requestContext: new AuthorizedClientRequestContext(new AccessToken()),
    };
    assert.equal(V1CheckpointManager.getFileName(props), path.join(IModelHost.cacheDir, "imodels", "checkpoints", "1234.bim"));
  });

  it("changeset+context props", async () => {
    const props = {
      contextId: "5678",
      iModelId: "",
      changeSetId: "1234",
      requestContext: new AuthorizedClientRequestContext(new AccessToken()),
    };
    assert.equal(V1CheckpointManager.getFileName(props), path.join(IModelHost.cacheDir, "imodels", "checkpoints", "1234.bim"));
  });

  it("changeset+context+imodel props", async () => {
    const props = {
      contextId: "5678",
      iModelId: "910",
      changeSetId: "1234",
      requestContext: new AuthorizedClientRequestContext(new AccessToken()),
    };
    assert.equal(V1CheckpointManager.getFileName(props), path.join(IModelHost.cacheDir, "imodels", "910", "checkpoints", "1234.bim"));
  });

  it("getFolder", async () => {
    assert.equal(V1CheckpointManager.getFolder("1234"), path.join(IModelHost.cacheDir, "imodels", "1234", "checkpoints"));
    assert.equal(V1CheckpointManager.getFolder(""), path.join(IModelHost.cacheDir, "imodels", "checkpoints"));
  });

  it("should fix invalid dbGuid during download", async () => {
    const dbPath = IModelTestUtils.prepareOutputFile("IModel", "TestCheckpoint.bim");
    const snapshot = SnapshotDb.createEmpty(dbPath, { rootSubject: { name: "test" } });
    const iModelId = Guid.createValue();  // This is wrong - it should be `snapshot.getGuid()`!
    const contextId = Guid.createValue();
    const changeSetId = IModelTestUtils.generateChangeSetId();
    snapshot.nativeDb.saveProjectGuid(Guid.normalize(contextId));
    snapshot.nativeDb.saveLocalValue("ParentChangeSetId", changeSetId);
    snapshot.saveChanges();

    assert.notEqual(iModelId, snapshot.nativeDb.getDbGuid()); // Ensure the Snapshot dbGuid and iModelId are different
    snapshot.close();

    sinon.stub(V2CheckpointManager, "downloadCheckpoint").callsFake(async (arg) => {
      IModelJsFs.copySync(dbPath, arg.localFile);
      return changeSetId;
    });

    const ctx = ClientRequestContext.current as AuthorizedClientRequestContext;
    const localFile = IModelTestUtils.prepareOutputFile("IModel", "TestCheckpoint2.bim");

    const request = { localFile, checkpoint: { requestContext: ctx, contextId, iModelId, changeSetId } };
    await CheckpointManager.downloadCheckpoint(request);
    const db = SnapshotDb.openCheckpointV1(localFile, request.checkpoint);
    assert.equal(iModelId, db.nativeDb.getDbGuid(), "expected the V1 Checkpoint download to fix the improperly set dbGuid.");
  });
});

describe("Checkpoint Manager", () => {

  afterEach(() => {
    sinon.restore();
  });

  it("open missing local file should return undefined", async () => {
    const checkpoint = {
      contextId: "5678",
      iModelId: "910",
      changeSetId: "1234",
      requestContext: new AuthorizedClientRequestContext(new AccessToken()),
    };
    const request = {
      localFile: V1CheckpointManager.getFileName(checkpoint),
      checkpoint,
    };
    const db = CheckpointManager.tryOpenLocalFile(request);
    assert.isUndefined(db);
  });

  it("open a bad bim file should return undefined", async () => {
    const checkpoint = {
      contextId: "5678",
      iModelId: "910",
      changeSetId: "1234",
      requestContext: new AuthorizedClientRequestContext(new AccessToken()),  // Why is this on CheckpointProps rather than DownloadRequest
    };

    // Setup a local file
    const folder = V1CheckpointManager.getFolder(checkpoint.iModelId);
    if (!IModelJsFs.existsSync(folder))
      IModelJsFs.recursiveMkDirSync(folder);

    const outputFile = V1CheckpointManager.getFileName(checkpoint);
    if (IModelJsFs.existsSync(outputFile))
      IModelJsFs.unlinkSync(outputFile);

    IModelJsFs.writeFileSync(outputFile, "Testing");

    // Attempt to open the file
    const request = {
      localFile: V1CheckpointManager.getFileName(checkpoint),
      checkpoint,
    };
    const db = CheckpointManager.tryOpenLocalFile(request);
    assert.isUndefined(db);
  });

});
