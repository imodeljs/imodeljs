/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModelHubClient
 */
import { ClientRequestContext, GuidString, Logger } from "@bentley/bentleyjs-core";
import { ContextType } from "@bentley/context-registry-client";
import { AccessToken, AuthorizedClientRequestContext, ECJsonTypeMap, request, RequestOptions, Response, WsgInstance } from "@bentley/itwin-client";
import { IModelHubClientLoggerCategory } from "../IModelHubClientLoggerCategories";
import { IModelBaseHandler } from "./BaseHandler";
import { ArgumentCheck } from "./Errors";
import {
  BaseEventSAS, EventBaseHandler, EventListener, GetEventOperationToRequestType, IModelHubBaseEvent, ListenerSubscription,
} from "./EventsBase";

const loggerCategory: string = IModelHubClientLoggerCategory.IModelHub;

/** Type of [[IModelHubGlobalEvent]]. Global Event type is used to define which events you wish to receive from your [[GlobalEventSubscription]]. See [[GlobalEventSubscriptionHandler.create]] and [[GlobalEventSubscriptionHandler.update]].
 * @internal
 */
export type GlobalEventType =
  /** Sent when an iModel is put into the archive. See [[SoftiModelDeleteEvent]].
   * @internal Rename to SoftIModelDeleteEvent
   */
  "SoftiModelDeleteEvent" |
  /** Sent when an archived iModel is completely deleted from the storage. See [[HardiModelDeleteEvent]].
   * @internal Rename to HardIModelDeleteEvent
   */
  "HardiModelDeleteEvent" |
  /** Sent when an iModel is created. See [[IModelCreatedEvent]].
   * @internal Rename to IModelCreatedEvent
   */
  "iModelCreatedEvent" |
  /** Sent when a [[ChangeSet]] is pushed. See [[ChangeSetCreatedEvent]]. */
  "ChangeSetCreatedEvent" |
  /** Sent when a named [[Version]] is created. See [[NamedVersionCreatedEvent]]. */
  "NamedVersionCreatedEvent" |
  /** Sent when a new [[Checkpoint]] is generated. See [[GlobalCheckpointCreatedEvent]]. */
  "CheckpointCreatedEvent" |
  /** Sent when a new [[CheckpointV2]] is generated. See [[GlobalCheckpointV2CreatedEvent]]. */
  "CheckpointV2CreatedEvent";

/** Base type for all iModelHub global events.
 * @internal
 */
export abstract class IModelHubGlobalEvent extends IModelHubBaseEvent {
  /** Id of the iModel that caused this event. */
  public iModelId?: GuidString;
  /** Id of the [[Project]] that this iModel belongs to. */
  public projectId?: string;
  /** Id of the context ([[Project]] or [[Asset]]) that this iModel belongs to. */
  public contextId?: string;
  /** Type of the context ([[Project]] or [[Asset]]) that this iModel belongs to. */
  public contextTypeId?: ContextType;

  /** Construct this global event from object instance.
   * @param obj Object instance.
   * @internal
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.iModelId = obj.iModelId;
    this.projectId = obj.ProjectId;
    this.contextId = obj.ContextId;

    const contextTypeId = obj.ContextTypeId as number;
    switch (contextTypeId) {
      case ContextType.Asset:
      case ContextType.Project:
        this.contextTypeId = contextTypeId;
        break;
      default:
        this.contextTypeId = ContextType.Unknown;
    }
  }
}

/** Sent when an iModel is put into the archive. See [[IModelHandler.delete]].
 * @internal Rename to SoftIModelDeleteEvent
 */
export class SoftiModelDeleteEvent extends IModelHubGlobalEvent {
}

/** Sent when an archived iModel is completely deleted from the storage. Sent after some time passes after [[IModelHandler.delete]] and iModel is no longer kept in the archive. iModel is kept at least 30 days in the archive.
 * @internal Rename to HardIModelDeleteEvent
 */
export class HardiModelDeleteEvent extends IModelHubGlobalEvent {
}

/** Sent when an iModel is created. See [[IModelHandler.create]].
 * @internal
 */
export class IModelCreatedEvent extends IModelHubGlobalEvent {
}

/** Sent when a [[ChangeSet]] is pushed. See [[ChangeSetHandler.create]]. Sent together with [[ChangeSetPostPushEvent]].
 * @internal
 */
export class ChangeSetCreatedEvent extends IModelHubGlobalEvent {
  public changeSetId?: string;
  public changeSetIndex?: string;
  public briefcaseId?: number;

  /** Construct this event from object instance.
   * @param obj Object instance.
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.changeSetId = obj.ChangeSetId;
    this.changeSetIndex = obj.ChangeSetIndex;
    this.briefcaseId = obj.BriefcaseId;
  }
}

/** Sent when a named [[Version]] is created. See [[VersionHandler.create]].
 * @internal
 */
export class NamedVersionCreatedEvent extends IModelHubGlobalEvent {
  public versionId?: GuidString;
  public versionName?: string;
  public changeSetId?: string;

  /** Construct this event from object instance.
   * @param obj Object instance.
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.versionId = obj.VersionId;
    this.versionName = obj.VersionName;
    this.changeSetId = obj.ChangeSetId;
  }
}

/** Sent when a new [[Checkpoint]] is generated. [[Checkpoint]]s can be generated daily when there are new [[ChangeSet]]s pushed or when a new [[Version]] is created.
 * @internal
 */
export class GlobalCheckpointCreatedEvent extends IModelHubGlobalEvent {
  public changeSetIndex?: string;
  public changeSetId?: string;
  public versionId?: GuidString;

  /** Construct this event from object instance.
   * @param obj Object instance.
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.changeSetIndex = obj.ChangeSetIndex;
    this.changeSetId = obj.ChangeSetId;
    this.versionId = obj.VersionId;
  }
}

/** Sent when a new [[CheckpointV2]] is generated. [[CheckpointV2]] might be created for every [[ChangeSet]].
 * @internal
 */
export class GlobalCheckpointV2CreatedEvent extends IModelHubGlobalEvent {
  public changeSetIndex?: string;
  public changeSetId?: string;
  public versionId?: GuidString;

  /** Construct this event from object instance.
   * @param obj Object instance.
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.changeSetIndex = obj.ChangeSetIndex;
    this.changeSetId = obj.ChangeSetId;
    this.versionId = obj.VersionId;
  }
}

type GlobalEventConstructor = (new (handler?: IModelBaseHandler, sasToken?: string) => IModelHubGlobalEvent);
/** Get constructor from GlobalEventType name. */
function constructorFromEventType(type: GlobalEventType): GlobalEventConstructor {
  switch (type) {
    case "SoftiModelDeleteEvent":
      return SoftiModelDeleteEvent;
    case "HardiModelDeleteEvent":
      return HardiModelDeleteEvent;
    case "iModelCreatedEvent":
      return IModelCreatedEvent;
    case "ChangeSetCreatedEvent":
      return ChangeSetCreatedEvent;
    case "NamedVersionCreatedEvent":
      return NamedVersionCreatedEvent;
    case "CheckpointCreatedEvent":
      return GlobalCheckpointCreatedEvent;
    case "CheckpointV2CreatedEvent":
      return GlobalCheckpointV2CreatedEvent;
  }
}

/** Parse [[IModelHubGlobalEvent]] from response object.
 * @param response Response object to parse.
 * @returns Appropriate global event object.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function ParseGlobalEvent(response: Response, handler?: IModelBaseHandler, sasToken?: string): IModelHubGlobalEvent {
  const constructor: GlobalEventConstructor = constructorFromEventType(response.header["content-type"]);
  const globalEvent = new constructor(handler, sasToken);
  globalEvent.fromJson({ ...response.header, ...response.body });
  return globalEvent;
}

/** Subscription to receive [[IModelHubGlobalEvent]]s. Each subscription has a separate queue for events that it hasn't read yet. Global event subscriptions do not expire and must be deleted by the user. Use wsgId of this instance for the methods that require subscriptionId. See [[GlobalEventSubscriptionHandler]].
 * @internal
 */
@ECJsonTypeMap.classToJson("wsg", "GlobalScope.GlobalEventSubscription", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class GlobalEventSubscription extends WsgInstance {
  @ECJsonTypeMap.propertyToJson("wsg", "properties.EventTypes")
  public eventTypes?: GlobalEventType[];

  @ECJsonTypeMap.propertyToJson("wsg", "properties.SubscriptionId")
  public subscriptionId?: string;
}

/** Shared access signature token for getting [[IModelHubGlobalEvent]]s. It's used to authenticate for [[GlobalEventHandler.getEvent]]. To receive an instance call [[GlobalEventHandler.getSASToken]].
 * @internal
 */
@ECJsonTypeMap.classToJson("wsg", "GlobalScope.GlobalEventSAS", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class GlobalEventSAS extends BaseEventSAS {
}

/** Handler for managing [[GlobalEventSubscription]]s.
 * Use [[GlobalEventHandler.Subscriptions]] to get an instance of this class.
 * @internal
 */
export class GlobalEventSubscriptionHandler {
  private _handler: IModelBaseHandler;

  /** Constructor for GlobalEventSubscriptionHandler.
   * @param handler Handler for WSG requests.
   * @internal
   */
  constructor(handler: IModelBaseHandler) {
    this._handler = handler;
  }

  /** Get relative url for GlobalEventSubscription requests.
   * @param instanceId Id of the subscription.
   */
  private getRelativeUrl(instanceId?: string) {
    return `/Repositories/Global--Global/GlobalScope/GlobalEventSubscription/${instanceId || ""}`;
  }

  /** Create a [[GlobalEventSubscription]]. You can use this to get or update the existing subscription instance, if you only have the original subscriptionId.
   * @param requestContext The client request context
   * @param subscriptionId Guid to be used by global event subscription. It will be a part of the resulting subscription id.
   * @param globalEvents Array of GlobalEventTypes to subscribe to.
   * @return Created GlobalEventSubscription instance.
   * @throws [[IModelHubError]] with [IModelHubStatus.EventSubscriptionAlreadyExists]($bentley) if [[GlobalEventSubscription]] already exists with the specified subscriptionId.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async create(requestContext: AuthorizedClientRequestContext, subscriptionId: GuidString, globalEvents: GlobalEventType[]) {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Creating global event subscription", () => ({ subscriptionId }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("subscriptionId", subscriptionId);

    let subscription = new GlobalEventSubscription();
    subscription.eventTypes = globalEvents;
    subscription.subscriptionId = subscriptionId;

    subscription = await this._handler.postInstance<GlobalEventSubscription>(requestContext, GlobalEventSubscription, this.getRelativeUrl(), subscription);
    requestContext.enter();
    Logger.logTrace(loggerCategory, "Created global event subscription", () => ({ subscriptionId }));
    return subscription;
  }

  /** Update a [[GlobalEventSubscription]]. Can change the [[GlobalEventType]]s specified in the subscription. Must be a valid subscription that was previously created with [[GlobalEventSubscriptionHandler.create]].
   * @param requestContext The client request context.
   * @param subscription Updated GlobalEventSubscription.
   * @return GlobalEventSubscription instance from iModelHub after update.
   * @throws [[IModelHubError]] with [IModelHubStatus.EventSubscriptionDoesNotExist]($bentley) if [[GlobalEventSubscription]] does not exist with the specified subscription.wsgId.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async update(requestContext: AuthorizedClientRequestContext, subscription: GlobalEventSubscription): Promise<GlobalEventSubscription> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, `Updating global event subscription with instance id: ${subscription.wsgId}`, () => ({ subscriptionId: subscription.subscriptionId }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.defined("subscription", subscription);
    ArgumentCheck.validGuid("subscription.wsgId", subscription.wsgId);

    const updatedSubscription = await this._handler.postInstance<GlobalEventSubscription>(requestContext, GlobalEventSubscription, this.getRelativeUrl(subscription.wsgId), subscription);
    requestContext.enter();
    Logger.logTrace(loggerCategory, `Updated global event subscription with instance id: ${subscription.wsgId}`, () => ({ subscriptionId: subscription.subscriptionId }));
    return updatedSubscription;
  }

  /** Delete a [[GlobalEventSubscription]].
   * @param requestContext The client request context.
   * @param subscriptionId WSG Id of the GlobalEventSubscription.
   * @returns Resolves if the GlobalEventSubscription has been successfully deleted.
   * @throws [[IModelHubError]] with [IModelHubStatus.EventSubscriptionDoesNotExist]($bentley) if GlobalEventSubscription does not exist with the specified subscription.wsgId.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async delete(requestContext: AuthorizedClientRequestContext, subscriptionId: string): Promise<void> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Deleting global event subscription", () => ({ subscriptionId }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("subscriptionInstanceId", subscriptionId);

    await this._handler.delete(requestContext, this.getRelativeUrl(subscriptionId));
    requestContext.enter();
    Logger.logTrace(loggerCategory, "Deleted global event subscription", () => ({ subscriptionId }));
  }
}

/** Type of [[GlobalEventHandler.getEvent]] operations.
 * @internal
 */
export enum GetEventOperationType {
  /** Event will be immediately removed from queue. */
  Destructive = 0,
  /** Event will be locked instead of removed. It has to be later removed via [[IModelHubBaseEvent.delete]]. */
  Peek,
}

/** Handler for receiving [[IModelHubGlobalEvent]]s.
 * Use [[IModelClient.GlobalEvents]] to get an instance of this class.
 * @internal
 */
export class GlobalEventHandler extends EventBaseHandler {
  private _subscriptionHandler: GlobalEventSubscriptionHandler | undefined;

  /** Constructor for GlobalEventHandler.
   * @param handler Handler for WSG requests.
   * @internal
   */
  constructor(handler: IModelBaseHandler) {
    super();
    this._handler = handler;
  }

  /** Get a handler for managing [[GlobalEventSubscription]]s. */
  public get subscriptions(): GlobalEventSubscriptionHandler {
    if (!this._subscriptionHandler) {
      this._subscriptionHandler = new GlobalEventSubscriptionHandler(this._handler);
    }

    return this._subscriptionHandler;
  }

  /** Get relative url for GlobalEventSAS requests. */
  private getGlobalEventSASRelativeUrl(): string {
    return `/Repositories/Global--Global/GlobalScope/GlobalEventSAS/`;
  }

  /** Get global event SAS Token. Used to authenticate for [[GlobalEventHandler.getEvent]].
   * @param requestContext The client request context
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async getSASToken(requestContext: AuthorizedClientRequestContext): Promise<GlobalEventSAS> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Getting global event SAS token");
    ArgumentCheck.defined("requestContext", requestContext);

    const globalEventSAS = await this._handler.postInstance<GlobalEventSAS>(requestContext, GlobalEventSAS, this.getGlobalEventSASRelativeUrl(), new GlobalEventSAS());
    requestContext.enter();
    Logger.logTrace(loggerCategory, "Got global event SAS token");
    return globalEventSAS;
  }

  /** Get absolute url for global event requests.
   * @param baseAddress Base address for the serviceBus.
   * @param subscriptionId Id of the subscription instance.
   * @param timeout Optional timeout for long polling.
   */
  private getGlobalEventUrl(baseAddress: string, subscriptionId: string, timeout?: number): string {
    let url: string = `${baseAddress}/Subscriptions/${subscriptionId}/messages/head`;

    if (timeout) {
      url = `${url}?timeout=${timeout}`;
    }

    return url;
  }

  /** Get an [[IModelHubGlobalEvent]] from the [[GlobalEventSubscription]]. You can use long polling timeout, to have requests return when events are available (or request times out), rather than returning immediately when no events are found.
   * @param requestContext The client request context
   * @param sasToken SAS Token used to authenticate. See [[GlobalEventSAS.sasToken]].
   * @param baseAddress Address for the events. See [[GlobalEventSAS.baseAddress]].
   * @param subscriptionId Id of the subscription to the topic. See [[GlobalEventSubscription]].
   * @param timeout Optional timeout duration in seconds for request, when using long polling.
   * @return IModelHubGlobalEvent if it exists, undefined otherwise.
   * @throws [[IModelHubClientError]] with [IModelHubStatus.UndefinedArgumentError]($bentley) or [IModelHubStatus.InvalidArgumentError]($bentley) if one of the arguments is undefined or has an invalid value.
   * @throws [[ResponseError]] if request has failed.
   */
  public async getEvent(requestContext: ClientRequestContext, sasToken: string, baseAddress: string, subscriptionId: string, timeout?: number, getOperation: GetEventOperationType = GetEventOperationType.Destructive): Promise<IModelHubGlobalEvent | undefined> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Getting global event from subscription", () => ({ subscriptionId }));
    ArgumentCheck.defined("sasToken", sasToken);
    ArgumentCheck.defined("baseAddress", baseAddress);
    ArgumentCheck.defined("subscriptionInstanceId", subscriptionId);

    let options: RequestOptions;
    if (getOperation === GetEventOperationType.Destructive)
      options = await this.getEventRequestOptions(GetEventOperationToRequestType.GetDestructive, sasToken, timeout);
    else if (getOperation === GetEventOperationType.Peek)
      options = await this.getEventRequestOptions(GetEventOperationToRequestType.GetPeek, sasToken, timeout);
    else // Unknown operation type.
      return undefined;

    const result = await request(requestContext, this.getGlobalEventUrl(baseAddress, subscriptionId, timeout), options);
    requestContext.enter();
    if (result.status === 204) {
      Logger.logTrace(loggerCategory, "No events found on subscription", () => ({ subscriptionId }));
      return undefined;
    }

    const event = ParseGlobalEvent(result, this._handler, sasToken);
    Logger.logTrace(loggerCategory, "Got Global Event from subscription", () => ({ subscriptionId }));
    return event;
  }

  /** Create a listener for long polling events from a [[GlobalEventSubscription]]. When event is received from the subscription, every registered listener callback is called. This continuously waits for events until all created listeners for that subscriptionInstanceId are deleted. [[GlobalEventSAS]] token expirations are handled automatically, [[AccessToken]] expiration is handled by calling authenticationCallback to get a new token.
   * @param authenticationCallback Callback used to get AccessToken. Only the first registered authenticationCallback for this subscriptionId will be used.
   * @param subscriptionInstanceId Id of GlobalEventSubscription.
   * @param listener Callback that is called when an [[IModelHubGlobalEvent]] is received.
   * @returns Function that deletes the created listener.
   * @throws [[IModelHubClientError]] with [IModelHubStatus.UndefinedArgumentError]($bentley) or [IModelHubStatus.InvalidArgumentError]($bentley) if one of the arguments is undefined or has an invalid value.
   */
  public createListener(requestContext: AuthorizedClientRequestContext, authenticationCallback: () => Promise<AccessToken>, subscriptionInstanceId: string, listener: (event: IModelHubGlobalEvent) => void): () => void {
    requestContext.enter();
    ArgumentCheck.defined("subscriptionInstanceId", subscriptionInstanceId);
    const subscription = new ListenerSubscription();
    subscription.authenticationCallback = authenticationCallback;
    subscription.getEvent = async (sasToken: string, baseAddress: string, id: string, timeout?: number) =>
      this.getEvent(requestContext, sasToken, baseAddress, id, timeout);
    subscription.getSASToken = async (reqContext: AuthorizedClientRequestContext) => this.getSASToken(reqContext);
    subscription.id = subscriptionInstanceId;
    return EventListener.create(subscription, listener);
  }
}
