/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import { Guid, GuidString } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestFrontendAuthorizationClient, TestUsers } from "@bentley/oidc-signin-tool/lib/frontend";

import { TestUtility } from "./TestUtility";
import { IModelApp, IModelAppOptions, MapLayerSettingsService, MapLayerSource } from "@bentley/imodeljs-frontend";
import { SettingsResult, SettingsStatus } from "@bentley/product-settings-client";

chai.should();
describe("MapLayerSettingsService (#integration)", () => {
  let contextId: GuidString;
  let iModelId: GuidString;
  let requestContext: AuthorizedClientRequestContext;
  const testName: string = `test${Guid.createValue()}`;

  before(async () => {
    const authorizationClient = await TestUtility.initializeTestProject(TestUtility.testContextName, TestUsers.regular);
    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);

    new TestFrontendAuthorizationClient(requestContext.accessToken);
    const options: IModelAppOptions = {
      authorizationClient,
    };
    await IModelApp.shutdown();
    await IModelApp.startup(options);
    contextId = await TestUtility.queryContextIdByName(TestUtility.testContextName);
    chai.assert.isDefined(contextId);
    iModelId = await TestUtility.queryIModelIdbyName(contextId, TestUtility.testIModelNames.readOnly);
    chai.assert.isDefined(iModelId);

  });
  after(async () => {
    await IModelApp.shutdown();
  });

  it.skip("should store and retrieve layer", async () => {
    const layer = MapLayerSource.fromJSON({
      url: "test12345",
      name: testName,
      formatId: "test12345",
      transparentBackground: true,
    });
    chai.assert.isDefined(layer);
    let sources = await MapLayerSettingsService.getSourcesFromSettingsService(contextId, iModelId);
    let foundSource = sources.some((value) => { return value.name === testName; }); // expect not to find it bc we haven't stored yet.
    chai.expect(foundSource).to.be.false;
    const success = await MapLayerSettingsService.storeSourceInSettingsService(layer!, false, contextId, iModelId);
    chai.assert.isTrue(success);

    sources = await MapLayerSettingsService.getSourcesFromSettingsService(contextId, iModelId);
    foundSource = sources.some((value) => { return value.name === testName; });
    chai.expect(foundSource).to.be.true;
    const settingsResult: SettingsResult = await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, testName, true, contextId);
    chai.expect(settingsResult.status).to.be.equal(SettingsStatus.Success);
  });

  it("should not be able to store model setting if same setting exists as project setting", async () => {
    const layer = MapLayerSource.fromJSON({
      url: "test12345",
      name: testName,
      formatId: "test12345",
      transparentBackground: true,
    });
    let success = await MapLayerSettingsService.storeSourceInSettingsService(layer!, false, contextId, iModelId);
    chai.assert.isTrue(success);
    success = await MapLayerSettingsService.storeSourceInSettingsService(layer!, true, contextId, iModelId);
    chai.assert.isFalse(success); // cant store model setting that collides with a project setting expect a false
    const settingsResult: SettingsResult = await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, testName, true, contextId);
    chai.expect(settingsResult.status).to.be.equal(SettingsStatus.Success);
  });

  it("should be able to store project setting if same setting exists as project setting", async () => {
    const layer = MapLayerSource.fromJSON({
      url: "test12345",
      name: testName,
      formatId: "test12345",
      transparentBackground: true,
    });
    let success = await MapLayerSettingsService.storeSourceInSettingsService(layer!, true, contextId, iModelId);
    chai.assert.isTrue(success);
    success = await MapLayerSettingsService.storeSourceInSettingsService(layer!, false, contextId, iModelId);
    chai.assert.isTrue(success);
    const settingsResult: SettingsResult = await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, testName, true, contextId);
    chai.expect(settingsResult.status).to.be.equal(SettingsStatus.Success);
  });

  it("should be able to delete a mapSource stored on project and imodel level", async () => {
    const layer = MapLayerSource.fromJSON({
      url: "test12345",
      name: testName,
      formatId: "test12345",
      transparentBackground: true,
    });
    let success = await MapLayerSettingsService.storeSourceInSettingsService(layer!, true, contextId, iModelId);
    chai.assert.isTrue(success);
    success = await MapLayerSettingsService.deleteSharedSettings(layer!, contextId, iModelId);
    chai.assert.isTrue(success);
    success = await MapLayerSettingsService.storeSourceInSettingsService(layer!, false, contextId, iModelId);
    chai.assert.isTrue(success);
    success = await MapLayerSettingsService.deleteSharedSettings(layer!, contextId, iModelId);
    chai.assert.isTrue(success);
  });
});
