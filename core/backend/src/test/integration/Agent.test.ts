import { assert } from "chai";
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { AgentAuthorizationClient, AgentAuthorizationClientConfiguration } from "@bentley/backend-itwin-client";
import { ClientRequestContext, Config } from "@bentley/bentleyjs-core";
import { AuthorizedBackendRequestContext } from "../../imodeljs-backend";
import { IModelTestUtils } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";

// Configuration needed
//    imjs_agent_test_client_id
//    imjs_agent_test_client_secret

describe("Agent iModel Download (#integration)", () => {
  let testProjectId: string;
  let testReadIModelId: string;
  let requestContext: AuthorizedBackendRequestContext;

  before(async () => {
    // IModelTestUtils.setupDebugLogLevels();

    const agentConfiguration: AgentAuthorizationClientConfiguration = {
      clientId: Config.App.getString("imjs_agent_test_client_id"),
      clientSecret: Config.App.getString("imjs_agent_test_client_secret"),
      scope: "imodelhub context-registry-service:read-only",
    };

    const agentClient = new AgentAuthorizationClient(agentConfiguration);
    const jwt = await agentClient.getAccessToken(new ClientRequestContext());
    requestContext = new AuthorizedBackendRequestContext(jwt);
    requestContext.enter();

    testProjectId = await HubUtility.getTestContextId(requestContext);
    testReadIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.readOnly);
  });

  it("Agent should be able to open a checkpoint", async () => {
    const iModelDb = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext, contextId: testProjectId, iModelId: testReadIModelId });
    assert.isDefined(iModelDb);
    iModelDb.close();
  });

});
