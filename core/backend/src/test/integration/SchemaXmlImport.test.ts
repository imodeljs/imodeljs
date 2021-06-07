/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { GuidString } from "@bentley/bentleyjs-core";
import { AuthorizedBackendRequestContext, IModelHost, PhysicalElement } from "../../imodeljs-backend";
import { HubMock } from "../HubMock";
import { IModelTestUtils, TestUserType } from "../IModelTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "./HubUtility";

// Configuration needed
//    imjs_test_manager_user_name
//    imjs_test_manager_user_password
//    imjs_oidc_browser_test_client_id
//    imjs_oidc_browser_test_redirect_uri
//    imjs_oidc_browser_test_scopes
//      - Required: "openid imodelhub context-registry-service:read-only"

describe("Schema XML Import Tests (#integration)", () => {
  let requestContext: AuthorizedBackendRequestContext;
  let testContextId: string;
  let readWriteTestIModelId: GuidString;

  before(async () => {
    HubMock.startup("schemaImport");
    requestContext = await IModelTestUtils.getUserContext(TestUserType.Manager);
    testContextId = await HubUtility.getTestContextId(requestContext);
    readWriteTestIModelId = await HubUtility.recreateIModel(requestContext, testContextId, HubUtility.generateUniqueName("ReadWriteTest"));
  });

  after(async () => {
    try {
      await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: testContextId, iModelId: readWriteTestIModelId });
      HubMock.shutdown();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(err);
    }
  });

  it("should import schema XML", async () => {
    const schemaFilePath = path.join(KnownTestLocations.assetsDir, "Test3.ecschema.xml");
    const schemaString = fs.readFileSync(schemaFilePath, "utf8");

    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: testContextId, iModelId: readWriteTestIModelId });
    await iModel.importSchemaStrings(requestContext, [schemaString]); // will throw an exception if import fails

    const testDomainClass = iModel.getMetaData("Test3:Test3Element"); // will throw on failure

    assert.equal(testDomainClass.baseClasses.length, 1);
    assert.equal(testDomainClass.baseClasses[0], PhysicalElement.classFullName);
    iModel.close();
  });

});
