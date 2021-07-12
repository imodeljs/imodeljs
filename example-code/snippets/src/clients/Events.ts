/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { AgentAuthorizationClient, BackendAuthorizationClientConfiguration } from "@bentley/backend-itwin-client";
import { ClientRequestContext, Config, Guid, GuidString, Logger } from "@bentley/bentleyjs-core";
import { EventSAS, EventSubscription, IModelHubClient, IModelHubEvent } from "@bentley/imodelhub-client";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";

class MockAccessToken extends AccessToken {
  public constructor() { super(""); }
  public override toTokenString() { return ""; }
}

const clientConfig: BackendAuthorizationClientConfiguration = {
  clientId: Config.App.get("imjs_agent_test_client_id"),
  clientSecret: Config.App.get("imjs_agent_test_client_secret"),
  scope: Config.App.get("imjs_oidc_browser_test_scopes"),
};

const authorizationClient = new AgentAuthorizationClient(clientConfig);
const imodelHubClient: IModelHubClient = new IModelHubClient();
const imodelId: GuidString = Guid.createValue();

// __PUBLISH_EXTRACT_START__ EventHandler.createListener.authenticate.example-code
async function authenticate(): Promise<AccessToken> {
  const requestContext = new ClientRequestContext();
  return authorizationClient.getAccessToken(requestContext);
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ EventHandler.createListener.callback.example-code
function processEvent(event: IModelHubEvent): void {
  Logger.logInfo("example", `Event of the type ${typeof event} received.`);
}
// __PUBLISH_EXTRACT_END__

// enclosing function avoids compile errors and code analysis report.
export async function testit() {
  const accessToken = new MockAccessToken();
  const requestContext = new ClientRequestContext("b0f0808d-e76f-4615-acf4-95aa1b78eba5");
  const authorizedRequestContext = new AuthorizedClientRequestContext(accessToken, "b0f0808d-e76f-4615-acf4-95aa1b78eba5");
  // __PUBLISH_EXTRACT_START__ EventSubscriptionsHandler.create.example-code
  const subscription: EventSubscription = await imodelHubClient.events
    .subscriptions.create(authorizedRequestContext, imodelId, ["ChangeSetPostPushEvent", "VersionEvent"]); // eslint-disable-line deprecation/deprecation
  // __PUBLISH_EXTRACT_END__
  // __PUBLISH_EXTRACT_START__ EventHandler.getSASToken.example-code
  const sasToken: EventSAS = await imodelHubClient.events.getSASToken(authorizedRequestContext, imodelId);
  // __PUBLISH_EXTRACT_END__
  // __PUBLISH_EXTRACT_START__ EventHandler.getEvent.example-code
  const event: IModelHubEvent | undefined = await imodelHubClient.events
    .getEvent(requestContext, sasToken.sasToken!, sasToken.baseAddress!, subscription.wsgId, 60);
  // __PUBLISH_EXTRACT_END__
  if (!event)
    return;
  // __PUBLISH_EXTRACT_START__ EventHandler.createListener.create.example-code
  const deleteCallback = await imodelHubClient.events  // eslint-disable-line @typescript-eslint/await-thenable
    .createListener(requestContext, authenticate, subscription.wsgId, imodelId, processEvent);
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ EventHandler.createListener.delete.example-code
  deleteCallback();
  // __PUBLISH_EXTRACT_END__
}
