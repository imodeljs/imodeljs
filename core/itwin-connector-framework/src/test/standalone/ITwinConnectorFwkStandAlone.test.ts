/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelJsFs, SnapshotDb } from "@bentley/imodeljs-backend";
import { BentleyStatus } from "@bentley/bentleyjs-core";
import { ConnectorTestUtils } from "../ConnectorTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { ConnectorJobDefArgs, ConnectorRunner } from "../../ConnectorRunner";

import * as path from "path";

describe("iTwin Connector Fwk StandAlone", () => {

  before(async () => {
    ConnectorTestUtils.setupLogging();
    ConnectorTestUtils.setupDebugLogLevels();
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);
    await ConnectorTestUtils.startBackend();
  });

  after(async () => {
    await ConnectorTestUtils.shutdownBackend();
  });

  it("Parse response file", async () => {
    // const fileName = "@lib/test/assets/connectorCommandLineParams.txt";
    /* This test can't work because the staging directory is hard-coded to M:\ and iModelBridgeFwk's constructor calls BriefcaseManager.Initialize with that path */
    // const fwk = IModelBridgeFwk.fromArgs([fileName]);
    // expect(undefined !== fwk);
  });

  it("Should create empty snapshot and synchronize source data", async () => {
    const connectorJobDef = new ConnectorJobDefArgs();
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    connectorJobDef.sourcePath = assetFile;
    connectorJobDef.connectorModule = "./test/integration/TestiTwinConnector.js";
    connectorJobDef.outputDir = KnownTestLocations.outputDir;
    connectorJobDef.isSnapshot = true;

    const runner = new ConnectorRunner(connectorJobDef);
    const fileName = `${path.basename(assetFile, path.extname(assetFile))}.bim`;
    const filePath = path.join(KnownTestLocations.outputDir, fileName);
    const status = await runner.synchronize();
    expect(status === BentleyStatus.SUCCESS);
    const imodel = SnapshotDb.openFile(filePath);
    ConnectorTestUtils.verifyIModel(imodel, connectorJobDef);
    imodel.close();
  });
});
