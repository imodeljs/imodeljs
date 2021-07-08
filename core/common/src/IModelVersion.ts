/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */

import { BentleyStatus, GuidString, IModelStatus } from "@bentley/bentleyjs-core";
import { ChangeSet, ChangeSetQuery, IModelClient, VersionQuery } from "@bentley/imodelhub-client";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ChangesetId } from "./ChangesetProps";
import { IModelError } from "./IModelError";

/** Properties for IModelVersion
 * @public
 */
export type IModelVersionProps =
  { first: true, latest?: never, afterChangeSetId?: never, versionName?: never } |
  { latest: true, first?: never, afterChangeSetId?: never, versionName?: never } |
  { afterChangeSetId: string, first?: never, latest?: never, versionName?: never } |
  { versionName: string, first?: never, latest?: never, afterChangeSetId?: never };

/** Option to specify the version of the iModel to be acquired and used
 * @public
 */
export class IModelVersion {
  private _first?: boolean;
  private _latest?: boolean;
  private _afterChangeSetId?: string;
  private _versionName?: string;

  private constructor() { }

  /** Describes the first version of the iModel */
  public static first(): IModelVersion {
    const version = new IModelVersion();
    version._first = true;
    return version;
  }

  /** Describes the latest version of the iModel  */
  public static latest(): IModelVersion {
    const version = new IModelVersion();
    version._latest = true;
    return version;
  }

  /** Describes a version of the iModel by the last change set that needs
   * to be applied or merged to the iModel.
   * Note that all ChangeSets up to and and including the specified ChangeSet
   * needs to be applied.
   * If the changeSetId is an empty string, it is assumed to be the first version
   * before any change sets have been applied.
   */
  public static asOfChangeSet(changeSetId: string): IModelVersion {
    const version = new IModelVersion();

    if (changeSetId === "") {
      version._first = true;
      return version;
    }

    version._afterChangeSetId = changeSetId;
    return version;
  }

  /** Describes a version of the iModel with the specified version name  */
  public static named(versionName: string): IModelVersion {
    const version = new IModelVersion();
    version._versionName = versionName;
    return version;
  }

  public toJSON(): IModelVersionProps {
    return this._versionName ? { versionName: this._versionName } :
      this._afterChangeSetId ? { afterChangeSetId: this._afterChangeSetId } :
        this._first ? { first: this._first } :
          { latest: true };
  }

  /** Creates a version from an IModelVersionProps */
  public static fromJSON(json: IModelVersionProps): IModelVersion {
    const version = new IModelVersion();
    version._first = json.first;
    version._afterChangeSetId = json.afterChangeSetId;
    version._latest = json.latest;
    version._versionName = json.versionName;
    return version;
  }

  /** Creates a version from an untyped JSON object
   * @deprecated use fromJSON
  */
  public static fromJson(jsonObj: any): IModelVersion {
    const version = new IModelVersion();
    Object.assign(version, jsonObj);
    return version;
  }

  /** Returns true if this describes the first version */
  public get isFirst(): boolean { return !!this._first; }

  /** Returns true if this describes the latest version */
  public get isLatest(): boolean { return !!this._latest; }

  /** Returns the last change set id to be applied to the iModel
   * to get to this specified version. @see asOfChangeSet().
   * Note that this method does not attempt to resolve the change set
   * if this describes the first version, last version, named version, etc.
   * @see evaluateChangeSet() for those use cases.
   */
  public getAsOfChangeSet(): ChangesetId | undefined { return this._afterChangeSetId; }

  /** Returns the name of the version if this describes a named version. @see named() */
  public getName(): string | undefined { return this._versionName; }

  /** Evaluate the ChangeSet Id corresponding to the version. All change sets up to and including
   * the returned ChangeSet Id need to be applied to update the iModel to this version.
   * Returns an empty string if this contains the first version (before any change sets). If the
   * version was already specified as of a ChangeSet, the method simply returns
   * that Id without any validation.
   * @deprecated use IModelHost/IModelApp hubAccess.getChangesetIdFromVersion
   */
  public async evaluateChangeSet(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, imodelClient: IModelClient): Promise<ChangesetId> {
    if (this._first)
      return "";

    if (this._afterChangeSetId)
      return this._afterChangeSetId;

    if (this._latest)
      return IModelVersion.getLatestChangeSetId(requestContext, imodelClient, iModelId); // eslint-disable-line deprecation/deprecation

    if (this._versionName)
      return IModelVersion.getChangeSetFromNamedVersion(requestContext, imodelClient, iModelId, this._versionName); // eslint-disable-line deprecation/deprecation

    throw new IModelError(BentleyStatus.ERROR, "Invalid version");
  }

  /** Gets the last change set that was applied to the imodel
   * @internal - public only so tests can catch calls to it and fail.
   * @deprecated use IModelHost/IModelApp hubAccess.getChangesetIdFromVersion
   */
  public static async getLatestChangeSetId(requestContext: AuthorizedClientRequestContext, imodelClient: IModelClient, iModelId: GuidString): Promise<ChangesetId> {
    const changeSets: ChangeSet[] = await imodelClient.changeSets.get(requestContext, iModelId, new ChangeSetQuery().top(1).latest());
    return (changeSets.length === 0) ? "" : changeSets[changeSets.length - 1].wsgId;
  }

  /** Get the change set from the specified named version
   * @internal - public only so tests can catch calls to it and fail.
   * @deprecated use IModelHost/IModelApp hubAccess.getChangesetIdFromVersion
   */
  public static async getChangeSetFromNamedVersion(requestContext: AuthorizedClientRequestContext, imodelClient: IModelClient, iModelId: GuidString, versionName: string): Promise<ChangesetId> {
    const versions = await imodelClient.versions.get(requestContext, iModelId, new VersionQuery().select("ChangeSetId").byName(versionName));

    if (!versions[0] || !versions[0].changeSetId)
      throw new IModelError(IModelStatus.NotFound, `Named version ${versionName} not found`);

    return versions[0].changeSetId;
  }
}
