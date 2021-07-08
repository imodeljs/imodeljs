/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as Azure from "@azure/storage-blob";
import { GuidString } from "@bentley/bentleyjs-core";
import {
  BatchType, ContentIdProvider, defaultTileOptions, IModelTileRpcInterface, iModelTileTreeIdToString, RpcManager, RpcRegistry,
} from "@bentley/imodeljs-common";
import { TestUsers, TestUtility } from "@bentley/oidc-signin-tool";
import { IModelDb } from "../../IModelDb";
import { AuthorizedBackendRequestContext, GeometricModel3d, IModelHost, IModelHostConfiguration } from "../../imodeljs-backend";
import { IModelTestUtils } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";

interface TileContentRequestProps {
  treeId: string;
  contentId: string;
  guid: string;
}

// Goes through models in imodel until it finds a root tile for a non empty model, returns tile content request props for that tile
async function getTileProps(iModel: IModelDb, requestContext: AuthorizedBackendRequestContext): Promise<TileContentRequestProps | undefined> {
  const queryParams = { from: GeometricModel3d.classFullName, limit: IModelDb.maxLimit };
  for (const modelId of iModel.queryEntityIds(queryParams)) {
    let model;
    try {
      model = iModel.models.getModel<GeometricModel3d>(modelId);
    } catch (err) {
      continue;
    }

    if (model.isNotSpatiallyLocated || model.isTemplate)
      continue;

    const treeId = iModelTileTreeIdToString(modelId, { type: BatchType.Primary, edgesRequired: false }, defaultTileOptions);
    const treeProps = await iModel.tiles.requestTileTreeProps(requestContext, treeId);
    // Ignore empty tile trees.
    if (treeProps.rootTile.maximumSize === 0 && treeProps.rootTile.isLeaf === true)
      continue;

    let guid = model.geometryGuid || iModel.changeset.id || "first";
    if (treeProps.contentIdQualifier)
      guid = `${guid}_${treeProps.contentIdQualifier}`;

    const idProvider = ContentIdProvider.create(true, defaultTileOptions);
    const contentId = idProvider.rootContentId;

    return {
      treeId,
      contentId,
      guid,
    };
  }

  return undefined;
}

describe("TileUpload (#integration)", () => {
  let requestContext: AuthorizedBackendRequestContext;
  let testIModelId: GuidString;
  let testContextId: GuidString;
  let tileRpcInterface: IModelTileRpcInterface;
  let serviceUrl: Azure.ServiceURL;

  before(async () => {
    // Shutdown IModelHost to allow this test to use it.
    await IModelTestUtils.shutdownBackend();

    const config = new IModelHostConfiguration();

    // Default account and key for azurite
    config.tileCacheCredentials = {
      service: "azure",
      account: "devstoreaccount1",
      accessKey: "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
    };

    await IModelTestUtils.startBackend(config);

    assert.isTrue(IModelHost.usingExternalTileCache);
    IModelHost.applicationId = "TestApplication";

    RpcManager.initializeInterface(IModelTileRpcInterface);
    tileRpcInterface = RpcRegistry.instance.getImplForInterface<IModelTileRpcInterface>(IModelTileRpcInterface);

    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
    testContextId = await HubUtility.getTestContextId(requestContext);
    testIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.stadium);

    // Get URL for cached tile
    const credentials = new Azure.SharedKeyCredential(config.tileCacheCredentials.account, config.tileCacheCredentials.accessKey);
    const pipeline = Azure.StorageURL.newPipeline(credentials);
    serviceUrl = new Azure.ServiceURL(`http://127.0.0.1:10000/${credentials.accountName}`, pipeline);

    // Point tileCacheService towards azurite URL
    (IModelHost.tileCacheService as any)._service = serviceUrl;

    // Open and close the iModel to ensure it works and is closed
    const iModel = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext, contextId: testContextId, iModelId: testIModelId });
    assert.isDefined(iModel);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
  });

  after(async () => {
    // Re-start backend with default config
    await IModelTestUtils.shutdownBackend();
    await IModelTestUtils.startBackend();
  });

  it("should upload tile to external cache with metadata", async () => {
    const iModel = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext, contextId: testContextId, iModelId: testIModelId });
    assert.isDefined(iModel);

    // Generate tile
    // eslint-disable-next-line deprecation/deprecation
    const tileProps = await getTileProps(iModel, requestContext);
    assert.isDefined(tileProps);
    const tile = await tileRpcInterface.requestTileContent(iModel.getRpcProps(), tileProps!.treeId, tileProps!.contentId, undefined, tileProps!.guid); // eslint-disable-line deprecation/deprecation

    // Uploads to the cloud storage tile cache happen asynchronously. Don't resolve until they have all finished.
    await Promise.all(IModelHost.tileUploader.activeUploads);

    // Query tile from tile cache
    const containerUrl = Azure.ContainerURL.fromServiceURL(serviceUrl, testIModelId);
    const blobUrl = Azure.BlobURL.fromContainerURL(containerUrl, `tiles/${tileProps!.treeId}/${tileProps!.guid}/${tileProps!.contentId}`);
    const blockBlobUrl = Azure.BlockBlobURL.fromBlobURL(blobUrl);
    const blobProperties = await blockBlobUrl.getProperties(Azure.Aborter.none);

    // Verify metadata in blob properties
    assert.isDefined(blobProperties.metadata);
    assert.isDefined(blobProperties.metadata!.tilegenerationtime);
    assert.equal(blobProperties.metadata!.backendname, IModelHost.applicationId);
    assert.equal(blobProperties.metadata!.tilesize, tile.byteLength.toString());

    await blockBlobUrl.delete(Azure.Aborter.none);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
  });
});
