/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { DbOpcode, GuidString, Id64Array, Id64String, IModelStatus } from "@bentley/bentleyjs-core";
import { LockLevel } from "@bentley/imodelhub-client";
import { ChangesetId } from "../ChangesetProps";
import { CodeProps } from "../Code";
import { AxisAlignedBox3dProps } from "../geometry/Placement";
import { IModelConnectionProps, IModelRpcOpenProps, IModelRpcProps } from "../IModel";
import { RpcInterface } from "../RpcInterface";
import { RpcManager } from "../RpcManager";
import { SubCategoryAppearance } from "../SubCategoryAppearance";
import { RpcRoutingToken } from "./core/RpcRoutingToken";

/* eslint-disable deprecation/deprecation */

/** The RPC interface for writing to an iModel.
 * All operations require read+write access.
 * This interface is not normally used directly. See IModelConnection for higher-level and more convenient API for accessing iModels from a frontend.
 * @internal
 * @deprecated use IPC for writing to iModels
 */
export abstract class IModelWriteRpcInterface extends RpcInterface {
  /** Returns the IModelWriteRpcInterface client instance for the frontend. */
  public static getClient(): IModelWriteRpcInterface { return RpcManager.getClientForInterface(IModelWriteRpcInterface); }

  /** Returns the IModelWriteRpcInterface client instance for a custom RPC routing configuration. */
  public static getClientForRouting(token: RpcRoutingToken): IModelWriteRpcInterface { return RpcManager.getClientForInterface(IModelWriteRpcInterface, token); }

  /** The immutable name of the interface. */
  public static readonly interfaceName = "IModelWriteRpcInterface";

  /** The version of the interface. */
  public static interfaceVersion = "0.5.2";

  /*===========================================================================================
      NOTE: Any add/remove/change to the methods below requires an update of the interface version.
      NOTE: Please consult the README in this folder for the semantic versioning rules.
  ===========================================================================================*/
  /** @deprecated use BriefcaseConnection with IpcHost/IpcApp */
  public async openForWrite(_iModelToken: IModelRpcOpenProps): Promise<IModelConnectionProps> { return this.forward(arguments); }
  public async saveChanges(_iModelToken: IModelRpcProps, _description?: string): Promise<void> { return this.forward(arguments); }
  public async hasUnsavedChanges(_iModelToken: IModelRpcProps): Promise<boolean> { return this.forward(arguments); }
  public async hasPendingTxns(_iModelToken: IModelRpcProps): Promise<boolean> { return this.forward(arguments); }
  public async updateProjectExtents(_iModelToken: IModelRpcProps, _newExtents: AxisAlignedBox3dProps): Promise<void> { return this.forward(arguments); }
  public async saveThumbnail(_iModelToken: IModelRpcProps, _val: Uint8Array): Promise<void> { return this.forward(arguments); }

  public async requestResources(_tokenProps: IModelRpcProps, _elementIds: Id64Array, _modelIds: Id64Array, _opcode: DbOpcode): Promise<void> { return this.forward(arguments); }
  public async doConcurrencyControlRequest(_tokenProps: IModelRpcProps): Promise<void> { return this.forward(arguments); }
  public async lockModel(_tokenProps: IModelRpcProps, _modelId: Id64String, _level: LockLevel): Promise<void> { return this.forward(arguments); }
  public async synchConcurrencyControlResourcesCache(_tokenProps: IModelRpcProps): Promise<void> { return this.forward(arguments); }

  /**
   * @deprecated Use [[IModelWriteRpcInterface.pullAndMergeChanges]] and [[IModelWriteRpcInterface.pushChanges]] instead
   */
  public async pullMergePush(_tokenProps: IModelRpcProps, _comment: string, _doPush: boolean): Promise<GuidString> { return this.forward(arguments); }

  /**
   * @deprecated The parent change set id is always maintained in the IModelConnection
   */
  public async getParentChangeset(_iModelToken: IModelRpcProps): Promise<ChangesetId> { return this.forward(arguments); }

  public async pullAndMergeChanges(_tokenProps: IModelRpcProps): Promise<IModelConnectionProps> { return this.forward(arguments); }
  public async pushChanges(_tokenProps: IModelRpcProps, _description: string): Promise<IModelConnectionProps> { return this.forward(arguments); }

  /** @deprecated monitor BriefcaseTxns events. */
  public async getModelsAffectedByWrites(_tokenProps: IModelRpcProps): Promise<Id64String[]> { return []; }

  /** @deprecated use BriefcaseConnection with IpcHost/IpcApp */
  public async deleteElements(_tokenProps: IModelRpcProps, _ids: Id64Array): Promise<void> { return this.forward(arguments); }
  /** @deprecated use BriefcaseConnection with IpcHost/IpcApp */
  public async createAndInsertPhysicalModel(_tokenProps: IModelRpcProps, _newModelCode: CodeProps, _privateModel: boolean): Promise<Id64String> { return this.forward(arguments); }
  /** @deprecated use BriefcaseConnection with IpcHost/IpcApp */
  public async createAndInsertSpatialCategory(_tokenProps: IModelRpcProps, _scopeModelId: Id64String, _categoryName: string, _appearance: SubCategoryAppearance.Props): Promise<Id64String> { return this.forward(arguments); }

  /** @deprecated use BriefcaseConnection with IpcHost/IpcApp */
  public async undoRedo(_rpc: IModelRpcProps, _undo: boolean): Promise<IModelStatus> {
    return this.forward(arguments);
  }
}
