/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";

import { IModelJsFs, SnapshotDb } from "@bentley/imodeljs-backend";
import { BentleyStatus } from "@bentley/bentleyjs-core";

import { BridgeTestUtils } from "../BridgeTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { BridgeJobDefArgs, BridgeRunner } from "../../BridgeRunner";

import * as path from "path";
import { BadgersIssueReporter } from "../../BadgersIssueReporter";

describe("IModelBridgeFwkStandAlone", () => {

  before(async () => {
    BridgeTestUtils.setupLogging();
    BridgeTestUtils.setupDebugLogLevels();
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);
    await BridgeTestUtils.startBackend();
  });

  after(async () => {
    await BridgeTestUtils.shutdownBackend();
  });

  it("Parse response file", async () => {
    // const fileName = "@lib/test/assets/bridgeCommandLineParams.txt";
    /* This test can't work because the staging directory is hard-coded to M:\ and iModelBridgeFwk's constructor calls BriefcaseManager.Initialize with that path */
    // const fwk = IModelBridgeFwk.fromArgs([fileName]);
    // expect(undefined !== fwk);
  });

  it("Should create empty snapshot and synchronize source data", async () => {
    const bridgeJobDef = new BridgeJobDefArgs();
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestBridge.json");
    bridgeJobDef.sourcePath = assetFile;
    bridgeJobDef.bridgeModule = "./test/integration/TestiModelBridge.js";
    bridgeJobDef.outputDir = KnownTestLocations.outputDir;
    bridgeJobDef.isSnapshot = true;

    const runner = new BridgeRunner(bridgeJobDef);
    const fileName = `${path.basename(assetFile, path.extname(assetFile))}.bim`;
    const filePath = path.join(KnownTestLocations.outputDir, fileName);
    const issueReporter = new BadgersIssueReporter("", "", "", "TestBridge.json", undefined, assetFile, KnownTestLocations.outputDir);
    issueReporter.recordSourceFileInfo("TestBridge.json", "TestBridge", "TestBridge", "itemType", "dataSource", "state", "failureReason", true, 200, true);
    runner.setIssueReporter(issueReporter);
    const status = await runner.synchronize();
    expect(status === BentleyStatus.SUCCESS);
    const imodel = SnapshotDb.openFile(filePath);
    BridgeTestUtils.verifyIModel(imodel, bridgeJobDef);
    imodel.close();
  });
});
