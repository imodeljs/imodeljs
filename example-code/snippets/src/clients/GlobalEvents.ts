/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { AgentAuthorizationClient, BackendAuthorizationClientConfiguration } from "@bentley/backend-itwin-client";
import { ClientRequestContext, Config, Logger } from "@bentley/bentleyjs-core";
import { GetEventOperationType, GlobalEventSAS, GlobalEventSubscription, IModelHubClient, IModelHubGlobalEvent } from "@bentley/imodelhub-client";
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

// __PUBLISH_EXTRACT_START__ GlobalEventHandler.createListener.authenticate.example-code
async function authenticate(): Promise<AccessToken> {
  const requestContext = new ClientRequestContext();
  return authorizationClient.getAccessToken(requestContext);
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ GlobalEventHandler.createListener.callback.example-code
function processGlobalEvent(event: IModelHubGlobalEvent): void {
  Logger.logInfo("example", `Global Event of the type ${typeof event} received.`);
}
// __PUBLISH_EXTRACT_END__

// enclosing function avoids compile and code analysis errors.
export async function testit() {
  const accessToken = new MockAccessToken();
  const requestContext = new ClientRequestContext("b0f0808d-e76f-4615-acf4-95aa1b78eba5");
  const authorizedRequestContext = new AuthorizedClientRequestContext(accessToken, "b0f0808d-e76f-4615-acf4-95aa1b78eba5");

  // __PUBLISH_EXTRACT_START__ GlobalEventSubscriptionsHandler.create.example-code
  const id = "c41580e2-6ac9-473c-9194-2c9a36187dbd";
  const subscription: GlobalEventSubscription = await imodelHubClient.globalEvents
    .subscriptions.create(authorizedRequestContext, id, ["iModelCreatedEvent", "NamedVersionCreatedEvent"]);
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ GlobalEventHandler.getSASToken.example-code
  const sasToken: GlobalEventSAS = await imodelHubClient.globalEvents.getSASToken(authorizedRequestContext);
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ GlobalEventHandler.getEvent.example-code
  const globalEvent: IModelHubGlobalEvent | undefined = await imodelHubClient.globalEvents
    .getEvent(requestContext, sasToken.sasToken!, sasToken.baseAddress!, subscription.wsgId, 60);
  // __PUBLISH_EXTRACT_END__

  if (globalEvent)
    return;

  // __PUBLISH_EXTRACT_START__ GlobalEventHandler.getEvent.lock.example-code
  const globalEventWithLock: IModelHubGlobalEvent | undefined = await imodelHubClient.globalEvents
    .getEvent(requestContext, sasToken.sasToken!, sasToken.baseAddress!, subscription.wsgId, 60, GetEventOperationType.Peek);
  // __PUBLISH_EXTRACT_END__

  if (!globalEventWithLock)
    return;

  // __PUBLISH_EXTRACT_START__ GlobalEventHandler.getEvent.delete.example-code
  await globalEventWithLock.delete(authorizedRequestContext);
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ GlobalEventHandler.createListener.create.example-code
  const deleteCallback = await imodelHubClient.globalEvents // eslint-disable-line @typescript-eslint/await-thenable
    .createListener(authorizedRequestContext, authenticate, subscription.wsgId, processGlobalEvent);
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ GlobalEventHandler.createListener.delete.example-code
  // Delete callback when events should be no longer received
  deleteCallback();
  // __PUBLISH_EXTRACT_END__
}
