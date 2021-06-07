/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */
import { assert, ClientRequestContext, DbOpcode, GuidString, Id64, Id64Array, Id64String, IModelStatus } from "@bentley/bentleyjs-core";
import { Range3d } from "@bentley/geometry-core";
import { LockLevel, LockType } from "@bentley/imodelhub-client";
import {
  AxisAlignedBox3dProps, Code, CodeProps, ElementProps, ImageSourceFormat, IModel, IModelConnectionProps, IModelRpcProps, IModelWriteRpcInterface,
  RelatedElement, RpcInterface, RpcManager, SubCategoryAppearance, SyncMode, ThumbnailProps,
} from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { AuthorizedBackendRequestContext } from "../BackendRequestContext";
import { SpatialCategory } from "../Category";
import { ConcurrencyControl } from "../ConcurrencyControl";
import { PhysicalPartition } from "../Element";
import { BriefcaseDb, IModelDb, StandaloneDb } from "../IModelDb";
import { PhysicalModel } from "../Model";
import { SubjectOwnsPartitionElements } from "../NavigationRelationship";
import { RpcBriefcaseUtility } from "./RpcBriefcaseUtility";

class EditingFunctions {
  public static async createAndInsertPartition(rqctx: AuthorizedBackendRequestContext, iModelDb: IModelDb, newModelCode: CodeProps): Promise<Id64String> {
    assert(Code.isValid(newModelCode));
    const modeledElementProps: ElementProps = {
      classFullName: PhysicalPartition.classFullName,
      parent: new SubjectOwnsPartitionElements(IModel.rootSubjectId),
      model: IModel.repositoryModelId,
      code: newModelCode,
    };
    const modeledElement = iModelDb.elements.createElement(modeledElementProps);
    if (iModelDb.isBriefcaseDb() && !iModelDb.concurrencyControl.isBulkMode) {
      await iModelDb.concurrencyControl.requestResources(rqctx, [{ element: modeledElement, opcode: DbOpcode.Insert }]);
      rqctx.enter();
    }
    return iModelDb.elements.insertElement(modeledElement);
  }

  public static async createAndInsertPhysicalModel(rqctx: AuthorizedBackendRequestContext, iModelDb: IModelDb, modeledElementRef: RelatedElement, privateModel: boolean = false): Promise<Id64String> {
    const newModel = iModelDb.models.createModel({ modeledElement: modeledElementRef, classFullName: PhysicalModel.classFullName, isPrivate: privateModel });
    if (iModelDb.isBriefcaseDb() && !iModelDb.concurrencyControl.isBulkMode) {
      await iModelDb.concurrencyControl.requestResources(rqctx, [], [{ model: newModel, opcode: DbOpcode.Insert }]);
      rqctx.enter();
    }
    return iModelDb.models.insertModel(newModel);
  }

  public static async createAndInsertPhysicalPartitionAndModel(rqctx: AuthorizedBackendRequestContext, iModelDb: IModelDb, newModelCode: CodeProps, privateModel: boolean = false): Promise<Id64String> {
    const eid = await this.createAndInsertPartition(rqctx, iModelDb, newModelCode);
    rqctx.enter();
    const modeledElementRef = new RelatedElement({ id: eid });
    const mid = await this.createAndInsertPhysicalModel(rqctx, iModelDb, modeledElementRef, privateModel);
    rqctx.enter();
    assert(mid === eid);
    return eid;
  }

  public static async createAndInsertSpatialCategory(rqctx: AuthorizedBackendRequestContext, iModelDb: IModelDb, scopeModelId: Id64String, categoryName: string, appearance: SubCategoryAppearance.Props): Promise<Id64String> {
    const category = SpatialCategory.create(iModelDb, scopeModelId, categoryName);
    if (iModelDb.isBriefcaseDb() && !iModelDb.concurrencyControl.isBulkMode) {
      await iModelDb.concurrencyControl.requestResources(rqctx, [{ element: category, opcode: DbOpcode.Insert }]);
      rqctx.enter();
    }
    const categoryId = iModelDb.elements.insertElement(category);
    category.setDefaultAppearance(appearance);
    return categoryId;
  }
}

/**
 * The backend implementation of IModelWriteRpcInterface.
 * @internal
 */
export class IModelWriteRpcImpl extends RpcInterface implements IModelWriteRpcInterface {
  public static register() { RpcManager.registerImpl(IModelWriteRpcInterface, IModelWriteRpcImpl); }

  public async openForWrite(tokenProps: IModelRpcProps): Promise<IModelConnectionProps> {
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    return RpcBriefcaseUtility.openWithTimeout(requestContext, tokenProps, SyncMode.PullAndPush);
  }

  public async saveChanges(tokenProps: IModelRpcProps, description?: string): Promise<void> {
    IModelDb.findByKey(tokenProps.key).saveChanges(description);
  }

  public async hasUnsavedChanges(tokenProps: IModelRpcProps): Promise<boolean> {
    return IModelDb.findByKey(tokenProps.key).nativeDb.hasUnsavedChanges();
  }

  public async hasPendingTxns(tokenProps: IModelRpcProps): Promise<boolean> {
    return IModelDb.findByKey(tokenProps.key).nativeDb.hasPendingTxns();
  }

  public async getParentChangeset(tokenProps: IModelRpcProps): Promise<string> {
    return BriefcaseDb.findByKey(tokenProps.key).changeSetId;
  }

  public async updateProjectExtents(tokenProps: IModelRpcProps, newExtents: AxisAlignedBox3dProps): Promise<void> {
    IModelDb.findByKey(tokenProps.key).updateProjectExtents(Range3d.fromJSON(newExtents));
  }

  public async saveThumbnail(tokenProps: IModelRpcProps, val: Uint8Array): Promise<void> {
    const int32Val = new Uint32Array(val.buffer, 0, 6);
    const props: ThumbnailProps = { format: int32Val[1] === ImageSourceFormat.Jpeg ? "jpeg" : "png", width: int32Val[2], height: int32Val[3], image: new Uint8Array(val.buffer, 24, int32Val[0]) };
    const id = Id64.fromLocalAndBriefcaseIds(int32Val[4], int32Val[5]);
    if (!Id64.isValid(id) || props.width === undefined || props.height === undefined || props.image.length <= 0)
      throw new Error("bad args");

    if (0 !== IModelDb.findByKey(tokenProps.key).views.saveThumbnail(id, props))
      throw new Error("failed to save thumbnail");
  }

  public async lockModel(tokenProps: IModelRpcProps, modelId: Id64String, level: LockLevel): Promise<void> {
    const iModelDb = BriefcaseDb.findByKey(tokenProps.key);
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    const request = new ConcurrencyControl.Request();
    request.addLocks([{ type: LockType.Model, objectId: modelId, level }]);
    return iModelDb.concurrencyControl.request(requestContext, request);
  }

  public async synchConcurrencyControlResourcesCache(tokenProps: IModelRpcProps): Promise<void> {
    const iModelDb = BriefcaseDb.findByKey(tokenProps.key);
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    return iModelDb.concurrencyControl.syncCache(requestContext);
  }

  public async pullMergePush(tokenProps: IModelRpcProps, comment: string, doPush: boolean): Promise<GuidString> {
    const iModelDb = BriefcaseDb.findByKey(tokenProps.key);
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    await iModelDb.pullAndMergeChanges(requestContext);
    requestContext.enter();
    const parentChangeSetId = iModelDb.changeSetId;
    if (doPush)
      await iModelDb.pushChanges(requestContext, comment);
    return parentChangeSetId;
  }

  public async pullAndMergeChanges(tokenProps: IModelRpcProps): Promise<IModelConnectionProps> {
    const iModelDb = BriefcaseDb.findByKey(tokenProps.key);
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    await iModelDb.pullAndMergeChanges(requestContext);
    return iModelDb.getConnectionProps();
  }

  public async pushChanges(tokenProps: IModelRpcProps, description: string): Promise<IModelConnectionProps> {
    const iModelDb = BriefcaseDb.findByKey(tokenProps.key);
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    await iModelDb.pushChanges(requestContext, description);
    return iModelDb.getConnectionProps();
  }

  public async doConcurrencyControlRequest(tokenProps: IModelRpcProps): Promise<void> {
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    const iModelDb = BriefcaseDb.findByKey(tokenProps.key);
    const rqctx = new AuthorizedBackendRequestContext(requestContext.accessToken);
    return iModelDb.concurrencyControl.request(rqctx);
  }

  public async getModelsAffectedByWrites(_tokenProps: IModelRpcProps): Promise<Id64String[]> {
    return [];
  }

  public async deleteElements(tokenProps: IModelRpcProps, ids: Id64Array) {
    const iModelDb = IModelDb.findByKey(tokenProps.key);
    ids.forEach((id) => iModelDb.elements.deleteElement(id));
  }

  public async requestResources(tokenProps: IModelRpcProps, elementIds: Id64Array, modelIds: Id64Array, opcode: DbOpcode): Promise<void> {
    // Don't check if we are in bulk mode - assume the caller knows what he is doing.
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    const iModelDb = BriefcaseDb.findByKey(tokenProps.key);
    const elements = elementIds.map((id: string) => ({ element: iModelDb.elements.getElement(id), opcode }));
    const models = modelIds.map((id: string) => ({ model: iModelDb.models.getModel(id), opcode }));
    return iModelDb.concurrencyControl.requestResources(requestContext, elements, models);
  }

  public async createAndInsertPhysicalModel(tokenProps: IModelRpcProps, newModelCode: CodeProps, privateModel: boolean): Promise<Id64String> {
    const iModelDb = IModelDb.findByKey(tokenProps.key);
    return EditingFunctions.createAndInsertPhysicalPartitionAndModel(ClientRequestContext.current as AuthorizedClientRequestContext, iModelDb, newModelCode, privateModel);
  }

  public async createAndInsertSpatialCategory(tokenProps: IModelRpcProps, scopeModelId: Id64String, categoryName: string, appearance: SubCategoryAppearance.Props): Promise<Id64String> {
    const iModelDb = IModelDb.findByKey(tokenProps.key);
    return EditingFunctions.createAndInsertSpatialCategory(ClientRequestContext.current as AuthorizedClientRequestContext, iModelDb, scopeModelId, categoryName, appearance);
  }

  public async undoRedo(rpc: IModelRpcProps, undo: boolean): Promise<IModelStatus> {
    const db = IModelDb.findByKey(rpc.key);
    if (db instanceof BriefcaseDb || db instanceof StandaloneDb)
      return undo ? db.txns.reverseSingleTxn() : db.txns.reinstateTxn();
    return IModelStatus.WrongIModel;
  }
}
