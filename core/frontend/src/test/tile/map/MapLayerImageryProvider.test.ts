/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import { MapLayerSettings, ServerError } from "@bentley/imodeljs-common";
import { RequestBasicCredentials } from "@bentley/itwin-client";
import { IModelApp } from "../../../IModelApp";
import {
  MapLayerImageryProvider, MapLayerImageryProviderStatus, WmsCapabilities, WmsMapLayerImageryProvider, WmtsCapabilities, WmtsMapLayerImageryProvider,
} from "../../../tile/internal";

chai.use(chaiAsPromised);

const wmsSampleSource = { formatId: "WMS", url: "https://localhost/wms", name: "Test WMS" };

describe("WmsMapLayerImageryProvider", () => {
  const sandbox = sinon.createSandbox();

  afterEach(async () => {
    sandbox.restore();
  });

  it("initialize() should handle 401 error from WmsCapabilities", async () => {
    const settings = MapLayerSettings.fromJSON(wmsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");

    const createSub = sandbox.stub(WmsCapabilities, "create").callsFake(async function _(_url: string, _credentials?: RequestBasicCredentials, _ignoreCache?: boolean) {
      // eslint-disable-next-line no-throw-literal
      throw { status: 401 };
    });
    const provider = new WmsMapLayerImageryProvider(settings);
    await provider.initialize();
    chai.expect(createSub.calledOnce).to.true;
    chai.expect(provider.status).to.equals(MapLayerImageryProviderStatus.RequireAuth);
  });

  it("initialize() should handle 401 error from WmtsCapabilities", async () => {
    const settings = MapLayerSettings.fromJSON(wmsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");

    const createSub = sandbox.stub(WmtsCapabilities, "create").callsFake(async function _(_url: string, _credentials?: RequestBasicCredentials, _ignoreCache?: boolean) {
      // eslint-disable-next-line no-throw-literal
      throw { status: 401 };
    });
    const provider = new WmtsMapLayerImageryProvider(settings);
    await provider.initialize();
    chai.expect(createSub.calledOnce).to.true;
    chai.expect(provider.status).to.equals(MapLayerImageryProviderStatus.RequireAuth);
  });

  it("initialize() should handle unknown exception from WmsCapabilities", async () => {
    const settings = MapLayerSettings.fromJSON(wmsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");

    sandbox.stub(WmsCapabilities, "create").callsFake(async function _(_url: string, _credentials?: RequestBasicCredentials, _ignoreCache?: boolean) {
      throw { someError: "error" }; // eslint-disable-line no-throw-literal
    });
    const provider = new WmsMapLayerImageryProvider(settings);
    await chai.expect(provider.initialize()).to.be.rejectedWith(ServerError);
  });

  it("initialize() should handle unknown exception from WmtsCapabilities", async () => {
    const settings = MapLayerSettings.fromJSON(wmsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");

    sandbox.stub(WmtsCapabilities, "create").callsFake(async function _(_url: string, _credentials?: RequestBasicCredentials, _ignoreCache?: boolean) {
      throw { someError: "error" }; // eslint-disable-line no-throw-literal
    });
    const provider = new WmtsMapLayerImageryProvider(settings);
    await chai.expect(provider.initialize()).to.be.rejectedWith(ServerError);
  });

  it("loadTile should not throw and return appropriate object", async () => {
    const settings = MapLayerSettings.fromJSON(wmsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");

    // Test with empty body
    const makeTileRequestStub = sandbox.stub(MapLayerImageryProvider.prototype, "makeTileRequest").callsFake(async function (_url: string) {
      const header: any = { "content-type": "image/png" };
      // const header: any = {};
      // header["content-type"] = "image/png";
      return Promise.resolve({ body: [], text: undefined, status: 200, header });
    });
    const provider = new WmsMapLayerImageryProvider(settings);
    let tileData = await provider.loadTile(0, 0, 0);
    chai.expect(tileData).to.undefined;

    // test fake png
    makeTileRequestStub.restore();
    sandbox.stub(MapLayerImageryProvider.prototype, "makeTileRequest").callsFake(async function (_url: string) {
      const header: any = {};
      header["content-type"] = "image/png";
      return Promise.resolve({ body: [0, 0, 0], text: undefined, status: 200, header });
    });
    tileData = await provider.loadTile(0, 0, 0);
    chai.expect(tileData).to.not.undefined;

    // test fake jpg
    makeTileRequestStub.restore();
    sandbox.stub(MapLayerImageryProvider.prototype, "makeTileRequest").callsFake(async function (_url: string) {
      const header: any = {};
      header["content-type"] = "image/jpeg";
      return Promise.resolve({ body: [0, 0, 0], text: undefined, status: 200, header });
    });
    tileData = await provider.loadTile(0, 0, 0);
    chai.expect(tileData).to.not.undefined;

    // test invalid content type
    makeTileRequestStub.restore();
    sandbox.stub(MapLayerImageryProvider.prototype, "makeTileRequest").callsFake(async function (_url: string) {
      const header: any = {};
      header["content-type"] = "image/strangeFormat";
      return Promise.resolve({ body: [0, 0, 0], text: undefined, status: 200, header });
    });
    tileData = await provider.loadTile(0, 0, 0);
    chai.expect(tileData).to.undefined;

  });
});

//
// This suite depends on IModelApp
describe("MapLayerImageryProvider with IModelApp", () => {
  const sandbox = sinon.createSandbox();
  beforeEach(async () => {
    await IModelApp.startup();
  });

  afterEach(async () => {
    sandbox.restore();
    await IModelApp.shutdown();
  });

  it("loadTile() should call IModelApp.notifications.outputMessage", async () => {
    const settings = MapLayerSettings.fromJSON(wmsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");
    const provider = new WmsMapLayerImageryProvider(settings);
    const outputMessageSpy = sinon.spy(IModelApp.notifications, "outputMessage");

    // Make the tile fetch fails with error 401
    let makeTileRequestStub = sandbox.stub(MapLayerImageryProvider.prototype, "makeTileRequest").callsFake(async function (_url: string) {
      // eslint-disable-next-line no-throw-literal
      throw { status: 401 };
    });

    const raiseEventSpy = sinon.spy(provider.onStatusChanged, "raiseEvent");

    await provider.loadTile(0, 0, 0);

    // 'outputMessage' should not be called because no successful tile request occurred.
    chai.expect(outputMessageSpy.calledOnce).to.false;
    // Status should have changed
    chai.expect(provider.status).to.be.equals(MapLayerImageryProviderStatus.RequireAuth);
    // Event should have been triggered
    chai.expect(raiseEventSpy.getCalls().length).to.equals(1);

    // Now lets have a successful tile request
    makeTileRequestStub.restore();
    makeTileRequestStub = sandbox.stub(MapLayerImageryProvider.prototype, "makeTileRequest").callsFake(async function (_url: string) {
      return Promise.resolve({ body: undefined, text: undefined, status: 200, header: undefined });
    });
    await provider.loadTile(0, 0, 0);
    // Event should not have been triggered again
    chai.expect(raiseEventSpy.getCalls().length).to.equals(1);

    // .. and now a 401 failure
    makeTileRequestStub.restore();
    makeTileRequestStub = sandbox.stub(MapLayerImageryProvider.prototype, "makeTileRequest").callsFake(async function (_url: string) {
      // eslint-disable-next-line no-throw-literal
      throw { status: 401 };
    });
    await provider.loadTile(0, 0, 0);
    // Output message should have been called that time (because we had a previous successful request)
    chai.expect(outputMessageSpy.calledOnce).to.true;
    // Status should remains to 'RequireAuth'
    chai.expect(provider.status).to.be.equals(MapLayerImageryProviderStatus.RequireAuth);
    // Event should not have been triggered again
    chai.expect(raiseEventSpy.getCalls().length).to.equals(1);
  });
});

const wmtsSampleSource = { formatId: "WMTS", url: "https://localhost/wmts", name: "Test WMTS" };
describe("WmtsMapLayerImageryProvider", () => {
  const sandbox = sinon.createSandbox();

  afterEach(async () => {
    sandbox.restore();
  });

  it("initialize() should handle unknown exception from WmsCapabilities", async () => {
    const settings = MapLayerSettings.fromJSON(wmtsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");

    sandbox.stub(WmsCapabilities, "create").callsFake(async function _(_url: string, _credentials?: RequestBasicCredentials, _ignoreCache?: boolean) {
      throw { someError: "error" }; // eslint-disable-line no-throw-literal
    });
    const provider = new WmsMapLayerImageryProvider(settings);
    await chai.expect(provider.initialize()).to.be.rejectedWith(ServerError);
  });

  it("initialize() should handle unknown exception from WmtsCapabilities", async () => {
    const settings = MapLayerSettings.fromJSON(wmtsSampleSource);
    if (!settings)
      chai.assert.fail("Could not create settings");

    sandbox.stub(WmtsCapabilities, "create").callsFake(async function _(_url: string, _credentials?: RequestBasicCredentials, _ignoreCache?: boolean) {
      throw { someError: "error" }; // eslint-disable-line no-throw-literal
    });
    const provider = new WmtsMapLayerImageryProvider(settings);
    await chai.expect(provider.initialize()).to.be.rejectedWith(ServerError);
  });

});
