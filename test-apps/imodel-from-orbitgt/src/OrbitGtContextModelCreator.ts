/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import { Id64, Id64String } from "@bentley/bentleyjs-core";
import { Range3d, StandardViewIndex } from "@bentley/geometry-core";
import {
  CategorySelector, DefinitionModel, DisplayStyle3d, IModelDb, ModelSelector, PhysicalModel, SnapshotDb, SpatialViewDefinition,
} from "@bentley/imodeljs-backend";
import { AxisAlignedBox3d, Cartographic, ContextRealityModelProps, EcefLocation, RenderMode, ViewFlags } from "@bentley/imodeljs-common";
import {
  ALong, CRSManager, Downloader, OnlineEngine, OPCReader, OrbitGtBounds, PageCachedFile, PointCloudReader, UrlFS,
} from "@bentley/orbitgt-core";
import { DownloaderNode } from "@bentley/orbitgt-core/lib/system/runtime/DownloaderNode";

interface OrbitGtPointCloudProps {
  rdsUrl?: string;
  accountName: string;
  sasToken: string;
  containerName: string;
  blobFileName: string;
}

/** */
export class OrbitGtContextIModelCreator {
  public iModelDb: IModelDb;
  public definitionModelId: Id64String = Id64.invalid;
  public physicalModelId: Id64String = Id64.invalid;

  /**
   * Constructor
   * @param iModelFileName the output iModel file name
   * @param url the reality model URL
   */
  public constructor(private _props: OrbitGtPointCloudProps, iModelFileName: string, private _name: string) {
    fs.unlink(iModelFileName, ((_err) => { }));
    this.iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Reality Model Context" } });
  }
  /** Perform the import */
  public async create(): Promise<void> {
    const { rdsUrl, accountName, containerName, blobFileName, sasToken } = this._props;
    try {
      this.definitionModelId = DefinitionModel.insert(this.iModelDb, IModelDb.rootSubjectId, "Definitions");
      this.physicalModelId = PhysicalModel.insert(this.iModelDb, IModelDb.rootSubjectId, "Empty Model");

      if (Downloader.INSTANCE == null) Downloader.INSTANCE = new DownloaderNode();
      if (CRSManager.ENGINE == null) CRSManager.ENGINE = await OnlineEngine.create();

      let blobFileURL: string = blobFileName;
      if (accountName.length > 0) blobFileURL = UrlFS.getAzureBlobSasUrl(accountName, containerName, blobFileName, sasToken);
      const urlFS: UrlFS = new UrlFS();

      // wrap a caching layer (16 MB) around the blob file
      const blobFileSize: ALong = await urlFS.getFileLength(blobFileURL);
      const blobFile: PageCachedFile = new PageCachedFile(urlFS, blobFileURL, blobFileSize, 128 * 1024 /* pageSize */, 128 /* maxPageCount */);
      const fileReader: PointCloudReader = await OPCReader.openFile(blobFile, blobFileURL, true/* lazyLoading */);

      let fileCrs = fileReader.getFileCRS();
      if (fileCrs == null)
        fileCrs = "";
      const bounds = fileReader.getFileBounds();
      let worldRange = Range3d.createXYZXYZ(bounds.getMinX(), bounds.getMinY(), bounds.getMinZ(), bounds.getMaxX(), bounds.getMaxY(), bounds.getMaxZ());
      let geoLocated = false;
      if (fileCrs.length > 0) {
        await CRSManager.ENGINE.prepareForArea(fileCrs, bounds);
        const wgs84Crs = "4978";
        await CRSManager.ENGINE.prepareForArea(wgs84Crs, new OrbitGtBounds());

        const ecefBounds = CRSManager.transformBounds(bounds, fileCrs, wgs84Crs);
        const ecefRange = Range3d.createXYZXYZ(ecefBounds.getMinX(), ecefBounds.getMinY(), ecefBounds.getMinZ(), ecefBounds.getMaxX(), ecefBounds.getMaxY(), ecefBounds.getMaxZ());
        const ecefCenter = ecefRange.localXYZToWorld(.5, .5, .5)!;
        const cartoCenter = Cartographic.fromEcef(ecefCenter)!;
        cartoCenter.height = 0;
        const ecefLocation = EcefLocation.createFromCartographicOrigin(cartoCenter);
        this.iModelDb.setEcefLocation(ecefLocation);
        const ecefToWorld = ecefLocation.getTransform().inverse()!;
        worldRange = ecefToWorld.multiplyRange(ecefRange);
        geoLocated = true;
      }
      const orbitGtBlob = { rdsUrl, containerName, blobFileName, accountName, sasToken };
      this.insertSpatialView("OrbitGT Model View", worldRange, [{ tilesetUrl: "", orbitGtBlob, name: this._name }], geoLocated);
      this.iModelDb.updateProjectExtents(worldRange);
      this.iModelDb.saveChanges();
    } catch (error) {
      process.stdout.write(`Error creating model from: ${blobFileName} Error: ${error}`);
    }
  }

  /** Insert a SpatialView configured to display the GeoJSON data that was converted/imported. */
  protected insertSpatialView(viewName: string, range: AxisAlignedBox3d, realityModels: ContextRealityModelProps[], geoLocated: boolean): Id64String {
    const modelSelectorId: Id64String = ModelSelector.insert(this.iModelDb, this.definitionModelId, viewName, [this.physicalModelId]);
    const categorySelectorId: Id64String = CategorySelector.insert(this.iModelDb, this.definitionModelId, viewName, []);
    const vf = new ViewFlags();
    vf.backgroundMap = geoLocated;
    vf.renderMode = RenderMode.SmoothShade;
    vf.cameraLights = true;
    const displayStyleId: Id64String = DisplayStyle3d.insert(this.iModelDb, this.definitionModelId, viewName, { viewFlags: vf, contextRealityModels: realityModels });
    return SpatialViewDefinition.insertWithCamera(this.iModelDb, this.definitionModelId, viewName, modelSelectorId, categorySelectorId, displayStyleId, range, StandardViewIndex.Iso);
  }
}
