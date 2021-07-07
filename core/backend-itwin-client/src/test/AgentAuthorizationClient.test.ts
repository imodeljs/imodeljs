/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import { Client, Issuer } from "openid-client";
import * as path from "path";
import { BeDuration, ClientRequestContext, Config } from "@bentley/bentleyjs-core";
import { loadEnv } from "@bentley/config-loader";
import { AccessToken, IncludePrefix } from "@bentley/itwin-client";
import { AgentAuthorizationClient, AgentAuthorizationClientConfiguration } from "../backend-itwin-client";
import { HubAccessTestValidator } from "./HubAccessTestValidator";

loadEnv(path.join(__dirname, "..", "..", ".env"));

chai.should();

describe("AgentAuthorizationClient (#integration)", () => {

  let validator: HubAccessTestValidator;
  const requestContext = new ClientRequestContext();

  let agentConfiguration: AgentAuthorizationClientConfiguration;

  before(async () => {
    validator = await HubAccessTestValidator.getInstance();

    agentConfiguration = {
      clientId: Config.App.getString("imjs_agent_test_client_id"),
      clientSecret: Config.App.getString("imjs_agent_test_client_secret"),
      scope: "imodelhub rbac-user:external-client reality-data:read urlps-third-party context-registry-service:read-only imodeljs-backend-2686",
    };

  });

  it("should discover token end points correctly", async () => {
    const client = new AgentAuthorizationClient(agentConfiguration);
    const url: string = await client.getUrl(requestContext);

    const issuer: Issuer<Client> = await client.discoverEndpoints(requestContext);
    chai.expect(issuer.token_endpoint).equals(`${url}/connect/token`);
    chai.expect(issuer.authorization_endpoint).equals(`${url}/connect/authorize`);
    chai.expect(issuer.introspection_endpoint).equals(`${url}/connect/introspect`);
  });

  it("should get valid OIDC tokens for agent applications", async () => {
    const agentClient = new AgentAuthorizationClient(agentConfiguration);
    const now = Date.now();
    const jwt: AccessToken = await agentClient.getAccessToken(requestContext);

    const expiresAt = jwt.getExpiresAt();
    chai.assert.isDefined(expiresAt);
    chai.assert.isAbove(expiresAt!.getTime(), now);

    const startsAt = jwt.getStartsAt();
    chai.assert.isDefined(startsAt);
    chai.assert.isAtLeast(startsAt!.getTime(), expiresAt!.getTime() - 1 * 60 * 60 * 1000); // Starts atleast 1 hour before expiry

    await validator.validateContextRegistryAccess(jwt);
    await validator.validateIModelHubAccess(jwt);

    const refreshJwt: AccessToken = await agentClient.getAccessToken(requestContext);
    await validator.validateContextRegistryAccess(refreshJwt);
    await validator.validateIModelHubAccess(refreshJwt);
  });

  it("should not refresh token unless necessary", async () => {
    const agentClient = new AgentAuthorizationClient(agentConfiguration);

    const jwt: AccessToken = await agentClient.getAccessToken(requestContext);

    // Refresh after a second, and the token should remain the same
    await BeDuration.wait(1000);
    let refreshJwt: AccessToken = await agentClient.getAccessToken(requestContext);
    chai.assert.strictEqual(refreshJwt, jwt);

    // Set the expiry of the token to be 2 min from now, and the token should remain the same
    const twoMinFromNow = new Date(Date.now() + 2 * 60 * 1000);
    const jwtExpiresAtTwoMinFromNow = new AccessToken(jwt.toTokenString(IncludePrefix.No), jwt.getStartsAt(), twoMinFromNow, jwt.getUserInfo());
    (agentClient as any)._accessToken = jwtExpiresAtTwoMinFromNow;
    refreshJwt = await agentClient.getAccessToken(requestContext);
    chai.assert.strictEqual(refreshJwt, jwtExpiresAtTwoMinFromNow);

    // Set the expiry of the token to be less than a min from now, and the token should be refreshed
    const lessThanMinFromNow = new Date(Date.now() + 59 * 1000);
    const jwtExpiresAtLessThanMinFromNow = new AccessToken(jwt.toTokenString(IncludePrefix.No), jwt.getStartsAt(), lessThanMinFromNow, jwt.getUserInfo());
    (agentClient as any)._accessToken = jwtExpiresAtLessThanMinFromNow;
    refreshJwt = await agentClient.getAccessToken(requestContext);
    chai.assert.notStrictEqual(refreshJwt.toTokenString(IncludePrefix.No), jwtExpiresAtLessThanMinFromNow.toTokenString(IncludePrefix.No));
  });

  it("should allow customization of expiry", async () => {
    const configuration = { ...agentConfiguration, expireSafety: 5 * 60 }; // 5 minutes before expiry
    const agentClient = new AgentAuthorizationClient(configuration);

    const jwt: AccessToken = await agentClient.getAccessToken(requestContext);

    // Refresh after a second, and the token should remain the same
    await BeDuration.wait(1000);
    let refreshJwt: AccessToken = await agentClient.getAccessToken(requestContext);
    chai.assert.strictEqual(refreshJwt, jwt);

    // Set the expiry of the token to be 10 seconds after expireSafety, and the token should remain the same
    const tenSecondsAfterExpiry = new Date(Date.now() + 60 * 60 + (configuration.expireSafety + 10) * 1000);
    const jwtNotExpired = new AccessToken(jwt.toTokenString(IncludePrefix.No), jwt.getStartsAt(), tenSecondsAfterExpiry, jwt.getUserInfo());
    (agentClient as any)._accessToken = jwtNotExpired;
    refreshJwt = await agentClient.getAccessToken(requestContext);
    chai.assert.strictEqual(refreshJwt, jwtNotExpired);

    // Set the expiry of the token to be 10 seconds before expireSafety, and the token should be refreshed
    const tenSecondsBeforeExpiry = new Date(Date.now() + 60 * 60 - (configuration.expireSafety + 10) * 1000);
    const jwtExpired = new AccessToken(jwt.toTokenString(IncludePrefix.No), jwt.getStartsAt(), tenSecondsBeforeExpiry, jwt.getUserInfo());
    (agentClient as any)._accessToken = jwtExpired;
    refreshJwt = await agentClient.getAccessToken(requestContext);
    chai.assert.notStrictEqual(refreshJwt.toTokenString(IncludePrefix.No), jwtExpired.toTokenString(IncludePrefix.No));

    // Refresh should refresh right away irrespective of expiry state
    const refreshJwt2 = await agentClient.refreshAccessToken(requestContext);
    chai.assert.notStrictEqual(refreshJwt2.toTokenString(IncludePrefix.No), refreshJwt.toTokenString(IncludePrefix.No));
  });
});
