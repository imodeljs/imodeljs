/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { assert, BeDuration, ClientRequestContext, Id64Array, Logger } from "@bentley/bentleyjs-core";
import {
  CloudStorageContainerDescriptor, CloudStorageContainerUrl, CloudStorageTileCache, ElementGraphicsRequestProps, IModelRpcProps,
  IModelTileRpcInterface, IModelTileTreeProps, RpcInterface, RpcInvocation, RpcManager, RpcPendingResponse,
  SyncMode,
  TileTreeContentIds, TileVersionInfo,
} from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { IModelHost } from "../IModelHost";
import { PromiseMemoizer, QueryablePromise } from "../PromiseMemoizer";
import { RpcBriefcaseUtility } from "./RpcBriefcaseUtility";

interface TileContent {
  content: Uint8Array;
  metadata?: object;
}

interface TileRequestProps {
  requestContext: ClientRequestContext;
  tokenProps: IModelRpcProps;
  treeId: string;
}

function generateTileRequestKey(props: TileRequestProps): string {
  const token = props.tokenProps;
  return `${JSON.stringify({
    key: token.key,
    contextId: token.contextId,
    iModelId: token.iModelId,
    changeSetId: token.changeSetId,
  })}:${props.treeId}`;
}

abstract class TileRequestMemoizer<Result, Props extends TileRequestProps> extends PromiseMemoizer<Result> {
  private readonly _loggerCategory = BackendLoggerCategory.IModelTileRequestRpc;
  protected abstract get _operationName(): string;
  protected abstract addMetadata(metadata: any, props: Props): void;
  protected abstract stringify(props: Props): string;
  protected abstract get _timeoutMilliseconds(): number;

  private makeMetadata(props: Props): any {
    const meta = { ...props.tokenProps };
    this.addMetadata(meta, props);
    return meta;
  }

  protected constructor(memoizeFn: (props: Props) => Promise<Result>, generateKeyFn: (props: Props) => string) {
    super(memoizeFn, generateKeyFn);
  }

  private _superMemoize = this.memoize;
  public override memoize = (props: Props): QueryablePromise<Result> => {
    return this._superMemoize(props);
  };

  private _superDeleteMemoized = this.deleteMemoized;
  public override deleteMemoized = (props: Props) => {
    this._superDeleteMemoized(props);
  };

  private log(status: string, props: Props): void {
    const descr = `${this._operationName}(${this.stringify(props)})`;
    Logger.logTrace(this._loggerCategory, `Backend ${status} ${descr}`, () => this.makeMetadata(props));
  }

  protected async perform(props: Props): Promise<Result> {
    props.requestContext.enter();
    this.log("received", props);

    const tileQP = this.memoize(props);

    await BeDuration.race(this._timeoutMilliseconds, tileQP.promise).catch(() => { });
    // Note: Rejections must be caught so that the memoization entry can be deleted

    props.requestContext.enter();

    if (tileQP.isPending) {
      this.log("issuing pending status for", props);
      throw new RpcPendingResponse();
    }

    this.deleteMemoized(props);

    if (tileQP.isFulfilled) {
      this.log("completed", props);
      return tileQP.result!;
    }

    assert(tileQP.isRejected);
    this.log("rejected", props);
    throw tileQP.error; // eslint-disable-line no-throw-literal
  }
}

async function getTileTreeProps(props: TileRequestProps): Promise<IModelTileTreeProps> {
  const db = await RpcBriefcaseUtility.findOrOpen(props.requestContext as AuthorizedClientRequestContext, props.tokenProps, SyncMode.FixedVersion);
  props.requestContext.enter();
  return db.tiles.requestTileTreeProps(props.requestContext, props.treeId);
}

class RequestTileTreePropsMemoizer extends TileRequestMemoizer<IModelTileTreeProps, TileRequestProps> {
  protected get _timeoutMilliseconds() { return IModelHost.tileTreeRequestTimeout; }
  protected get _operationName() { return "requestTileTreeProps"; }
  protected stringify(props: TileRequestProps): string { return props.treeId; }
  protected addMetadata(meta: any, props: TileRequestProps): void {
    meta.treeId = props.treeId;
  }

  private static _instance?: RequestTileTreePropsMemoizer;

  private constructor() {
    super(getTileTreeProps, generateTileRequestKey);
  }

  public static async perform(props: TileRequestProps): Promise<IModelTileTreeProps> {
    if (undefined === this._instance)
      this._instance = new RequestTileTreePropsMemoizer();

    return this._instance.perform(props);
  }
}

interface TileContentRequestProps extends TileRequestProps {
  contentId: string;
}

async function getTileContent(props: TileContentRequestProps): Promise<TileContent> {
  const db = await RpcBriefcaseUtility.findOrOpen(props.requestContext as AuthorizedClientRequestContext, props.tokenProps, SyncMode.FixedVersion);
  props.requestContext.enter();
  const tile = await db.tiles.requestTileContent(props.requestContext, props.treeId, props.contentId);
  props.requestContext.enter();
  return {
    content: tile.content,
    metadata: {
      backendName: IModelHost.applicationId,
      tileGenerationTime: tile.elapsedSeconds.toString(),
      tileSize: tile.content.byteLength.toString(),
    },
  };
}

function generateTileContentKey(props: TileContentRequestProps): string {
  return `${generateTileRequestKey(props)}:${props.contentId}`;
}

class RequestTileContentMemoizer extends TileRequestMemoizer<TileContent, TileContentRequestProps> {
  protected get _timeoutMilliseconds() { return IModelHost.tileContentRequestTimeout; }
  protected get _operationName() { return "requestTileContent"; }
  protected stringify(props: TileContentRequestProps): string { return `${props.treeId}:${props.contentId}`; }
  protected addMetadata(meta: any, props: TileContentRequestProps): void {
    meta.treeId = props.treeId;
    meta.contentId = props.contentId;
  }

  private static _instance?: RequestTileContentMemoizer;

  private constructor() {
    super(getTileContent, generateTileContentKey);
  }

  public static get instance() {
    if (undefined === this._instance)
      this._instance = new RequestTileContentMemoizer();

    return this._instance;
  }

  public static async perform(props: TileContentRequestProps): Promise<TileContent> {
    return this.instance.perform(props);
  }
}

/** @internal */
export class IModelTileRpcImpl extends RpcInterface implements IModelTileRpcInterface {
  public static register() { RpcManager.registerImpl(IModelTileRpcInterface, IModelTileRpcImpl); }

  public async requestTileTreeProps(tokenProps: IModelRpcProps, treeId: string): Promise<IModelTileTreeProps> {
    const requestContext = ClientRequestContext.current;
    return RequestTileTreePropsMemoizer.perform({ requestContext, tokenProps, treeId });
  }

  public async purgeTileTrees(tokenProps: IModelRpcProps, modelIds: Id64Array | undefined): Promise<void> {
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    // `undefined` gets forwarded as `null`...
    if (null === modelIds)
      modelIds = undefined;

    const db = await RpcBriefcaseUtility.findOrOpen(requestContext, tokenProps, SyncMode.FixedVersion);
    requestContext.enter();
    return db.nativeDb.purgeTileTrees(modelIds);
  }

  public async generateTileContent(tokenProps: IModelRpcProps, treeId: string, contentId: string, guid: string | undefined): Promise<Uint8Array> {
    const requestContext = ClientRequestContext.current;
    const tile = await RequestTileContentMemoizer.perform({ requestContext, tokenProps, treeId, contentId });

    // ###TODO: Verify the guid supplied by the front-end matches the guid stored in the model?
    if (IModelHost.usingExternalTileCache)
      IModelHost.tileUploader.cacheTile(tokenProps, treeId, contentId, tile.content, guid, tile.metadata);

    return tile.content;
  }

  public async requestTileContent(tokenProps: IModelRpcProps, treeId: string, contentId: string, _unused?: () => boolean, guid?: string): Promise<Uint8Array> {
    return this.generateTileContent(tokenProps, treeId, contentId, guid);
  }

  public async getTileCacheContainerUrl(_tokenProps: IModelRpcProps, id: CloudStorageContainerDescriptor): Promise<CloudStorageContainerUrl> {
    const invocation = RpcInvocation.current(this);

    if (!IModelHost.usingExternalTileCache) {
      return CloudStorageContainerUrl.empty();
    }

    const expiry = CloudStorageTileCache.getCache().supplyExpiryForContainerUrl(id);
    const clientIp = (IModelHost.restrictTileUrlsByClientIp && invocation.request.ip) ? invocation.request.ip : undefined;
    return IModelHost.tileCacheService.obtainContainerUrl(id, expiry, clientIp);
  }

  public async isUsingExternalTileCache(): Promise<boolean> { // eslint-disable-line @bentley/prefer-get
    return IModelHost.usingExternalTileCache;
  }

  public async queryVersionInfo(): Promise<TileVersionInfo> {
    return IModelHost.platform.getTileVersionInfo();
  }

  /** @internal */
  public async requestElementGraphics(rpcProps: IModelRpcProps, request: ElementGraphicsRequestProps): Promise<Uint8Array | undefined> {
    const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
    const iModel = await RpcBriefcaseUtility.findOrOpen(requestContext, rpcProps, SyncMode.FixedVersion);
    requestContext.enter();
    return iModel.generateElementGraphics(request);
  }
}

/** @internal */
export async function cancelTileContentRequests(tokenProps: IModelRpcProps, contentIds: TileTreeContentIds[]): Promise<void> {
  const requestContext = ClientRequestContext.current as AuthorizedClientRequestContext;
  const iModel = await RpcBriefcaseUtility.findOrOpen(requestContext, tokenProps, SyncMode.FixedVersion);
  requestContext.enter();

  const props: TileContentRequestProps = {
    requestContext,
    tokenProps,
    treeId: "",
    contentId: "",
  };

  for (const entry of contentIds) {
    props.treeId = entry.treeId;
    for (const contentId of entry.contentIds) {
      props.contentId = contentId;
      RequestTileContentMemoizer.instance.deleteMemoized(props);
    }

    iModel.nativeDb.cancelTileContentRequests(entry.treeId, entry.contentIds);
  }
}
