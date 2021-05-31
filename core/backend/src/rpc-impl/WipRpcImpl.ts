/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { ChangedElements, IModelRpcProps, RpcInterface, RpcManager, SyncMode } from "@bentley/imodeljs-common";
import { WipRpcInterface } from "@bentley/imodeljs-common/lib/rpc/WipRpcInterface";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ChangedElementsManager } from "../ChangedElementsManager";
import { ChangeSummaryManager } from "../ChangeSummaryManager";
import { BriefcaseDb } from "../IModelDb";

/** The backend implementation of WipRpcInterface.
 * @internal
 */
export class WipRpcImpl extends RpcInterface implements WipRpcInterface {

  public static register() { RpcManager.registerImpl(WipRpcInterface, WipRpcImpl); }
  public async placeholder(_tokenProps: IModelRpcProps): Promise<string> { return "placeholder"; }

  public async isChangeCacheAttached(tokenProps: IModelRpcProps): Promise<boolean> {
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    return ChangeSummaryManager.isChangeCacheAttached(await BriefcaseDb.findOrOpen(requestContext, tokenProps, SyncMode.PullAndPush));
  }

  public async attachChangeCache(tokenProps: IModelRpcProps): Promise<void> {
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    ChangeSummaryManager.attachChangeCache(await BriefcaseDb.findOrOpen(requestContext, tokenProps, SyncMode.PullAndPush));
  }

  public async getChangedElements(tokenProps: IModelRpcProps, startChangesetId: string, endChangesetId: string): Promise<ChangedElements | undefined> {
    return ChangedElementsManager.getChangedElements(tokenProps.iModelId!, startChangesetId, endChangesetId);
  }

  public async isChangesetProcessed(tokenProps: IModelRpcProps, changesetId: string): Promise<boolean> {
    return ChangedElementsManager.isProcessed(tokenProps.iModelId!, changesetId);
  }
}
