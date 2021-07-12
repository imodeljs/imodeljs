/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModelHubClient
 */
import { ClientRequestContext, GuidString, Id64, Id64String, Logger } from "@bentley/bentleyjs-core";
import { AccessToken, AuthorizedClientRequestContext, ECJsonTypeMap, request, Response, WsgInstance } from "@bentley/itwin-client";
import { IModelHubClientLoggerCategory } from "../IModelHubClientLoggerCategories";
import { IModelBaseHandler } from "./BaseHandler";
import { CodeState } from "./Codes";
import { ArgumentCheck } from "./Errors";
import {
  BaseEventSAS, EventBaseHandler, EventListener, GetEventOperationToRequestType, IModelHubBaseEvent, ListenerSubscription,
} from "./EventsBase";
import { LockLevel, LockType } from "./Locks";

/* eslint-disable @typescript-eslint/no-shadow */

const loggerCategory: string = IModelHubClientLoggerCategory.IModelHub;

/** Type of [[IModelHubEvent]]. Event type is used to define which events you wish to receive from your [[EventSubscription]]. See [[EventSubscriptionHandler.create]] and [[EventSubscriptionHandler.update]].
 * @public
 */
export enum IModelHubEventType {
  /** Sent when one or more [[Lock]]s are updated. See [[LockEvent]].
   * @internal
   */
  LockEvent = "LockEvent",
  /** Sent when all [[Lock]]s for a [[Briefcase]] are deleted. See [[AllLocksDeletedEvent]].
   * @internal
   */
  AllLocksDeletedEvent = "AllLocksDeletedEvent",
  /** Sent when a [[ChangeSet]] is successfully pushed. See [[ChangeSetPostPushEvent]]. */
  ChangeSetPostPushEvent = "ChangeSetPostPushEvent",
  /** Sent when a [[ChangeSet]] push has started. See [[ChangeSetPrePushEvent]]. */
  ChangeSetPrePushEvent = "ChangeSetPrePushEvent",
  /** Sent when one or more [Code]($common)s are updated. See [[CodeEvent]].
   * @internal
   */
  CodeEvent = "CodeEvent",
  /** Sent when all [Code]($common)s for a [[Briefcase]] are deleted. See [[AllCodesDeletedEvent]].
   * @internal
   */
  AllCodesDeletedEvent = "AllCodesDeletedEvent",
  /** Sent when a [[Briefcase]] is deleted. See [[BriefcaseDeletedEvent]].
   * @internal
   */
  BriefcaseDeletedEvent = "BriefcaseDeletedEvent",
  /** Sent when an iModel is deleted. See [[iModelDeletedEvent]]. */
  iModelDeletedEvent = "iModelDeletedEvent",
  /** Sent when a new named [[Version]] is created. See [[VersionEvent]]. */
  VersionEvent = "VersionEvent",
  /**
   * Sent when a new [[Checkpoint]] is generated. See [[CheckpointCreatedEvent]].
   * @internal
   */
  CheckpointCreatedEvent = "CheckpointCreatedEvent",
  /**
   * Sent when a new [[CheckpointV2]] is generated. See [[CheckpointV2CreatedEvent]].
   * @internal
   */
  CheckpointV2CreatedEvent = "CheckpointV2CreatedEvent",
}

/* eslint-enable @typescript-eslint/no-shadow */

/** @internal @deprecated Use [[IModelHubEventType]] instead */
export type EventType = "LockEvent" | "AllLocksDeletedEvent" | "ChangeSetPostPushEvent" | "ChangeSetPrePushEvent" | "CodeEvent" | "AllCodesDeletedEvent" | "BriefcaseDeletedEvent" | "iModelDeletedEvent" | "VersionEvent" | "CheckpointCreatedEvent" | "CheckpointV2CreatedEvent";

/** Base type for all iModelHub events.
 * @public
 */
export abstract class IModelHubEvent extends IModelHubBaseEvent {
  /** Id of the iModel where the event occurred. */
  public iModelId?: GuidString;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.iModelId = this.eventTopic;
  }
}

/** Base type for iModelHub events that have BriefcaseId.
 * @public
 */
export abstract class BriefcaseEvent extends IModelHubEvent {
  /** Id of the [[Briefcase]] involved in this event. */
  public briefcaseId: number;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.briefcaseId = obj.BriefcaseId;
  }
}

/** Sent when one or more [[Lock]]s are updated. Lock updates can be very frequent, so it's recommended to not to subscribe to LockEvents, if it's not necessary.
 * @internal
 */
export class LockEvent extends BriefcaseEvent {
  /** [[LockType]] of the updated Locks. */
  public lockType: LockType;
  /** [[LockLevel]] of the updated Locks. */
  public lockLevel: LockLevel;
  /** Id's of the updated Locks. */
  public objectIds: Id64String[];
  /** Id of the [[ChangeSet]] Locks were released with. */
  public releasedWithChangeSet?: string;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.lockType = LockType[obj.LockType as keyof typeof LockType];
    this.lockLevel = LockLevel[obj.LockLevel as keyof typeof LockLevel];
    this.objectIds = (obj.ObjectIds as string[]).map((value: string) => Id64.fromJSON(value));
    this.releasedWithChangeSet = obj.ReleasedWithChangeSet;
  }
}

/** Sent when all [[Lock]]s for a [[Briefcase]] are deleted. Can occur when calling [[LockHandler.deleteAll]] or [[BriefcaseHandler.delete]].
 * @internal
 */
export class AllLocksDeletedEvent extends BriefcaseEvent {
}

/** Sent when a [[ChangeSet]] is successfully pushed. See [[ChangeSetHandler.create]]. It's sent when a new [[ChangeSet]] is successfully pushed to an iModel. See [[ChangeSetPrePushEvent]] for the event indicating the start of a ChangeSet push.
 * @public
 */
export class ChangeSetPostPushEvent extends BriefcaseEvent {
  /** Id of the ChangeSet that was pushed. */
  public changeSetId: string;
  /** Index of the ChangeSet that was pushed. */
  public changeSetIndex: string;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.changeSetId = obj.ChangeSetId;
    this.changeSetIndex = obj.ChangeSetIndex;
  }
}

/** Sent when a [[ChangeSet]] push has started. See [[ChangeSetHandler.create]]. ChangeSetPrePushEvent indicates that iModelHub allowed one of the [[Briefcase]]s to push a ChangeSet and all other push attempts will fail, until this push times out or succeeds. See [[ChangeSetPostPushEvent]] for an event indicating a successful push.
 * @public
 */
export class ChangeSetPrePushEvent extends IModelHubEvent {
}

/** Sent when one or more [Code]($common)s are updated. See [[CodeHandler.update]]. Code updates can be very frequent, so it's recommended to not to subscribe to CodeEvents, if it's not necessary.
 * @internal
 */
export class CodeEvent extends BriefcaseEvent {
  /** Id of the [CodeSpec]($common) for the updated Codes. */
  public codeSpecId: Id64String;
  /** Scope of the updated Codes. */
  public codeScope: string;
  /** Array of the updated Code values. */
  public values: string[];
  /** State Codes were updated to. */
  public state: CodeState = CodeState.Reserved;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.codeSpecId = Id64.fromJSON(obj.CodeSpecId);
    this.codeScope = obj.CodeScope;
    this.values = obj.Values;
    this.state = obj.State;
  }
}

/** Sent when all [Code]($common)s for a [[Briefcase]] are deleted. Can occur when calling [[CodeHandler.deleteAll]] or [[BriefcaseHandler.delete]].
 * @internal
 */
export class AllCodesDeletedEvent extends BriefcaseEvent {
}

/** Sent when a [[Briefcase]] is deleted. See [[BriefcaseHandler.delete]].
 * @internal
 */
export class BriefcaseDeletedEvent extends BriefcaseEvent {
}

/** Sent when an iModel is deleted. See [[IModelHandler.delete]]. [[EventSubscription]] will be deleted 5 minutes after iModel is deleted, removing all events from subscription queues, making it possible for this event to be missed if not retrieved immediately.
 * @public
 */
export class IModelDeletedEvent extends IModelHubEvent {
}

/** Sent when a new named [[Version]] is created. See [[VersionHandler.create]].
 * @public
 */
export class VersionEvent extends IModelHubEvent {
  /** Id of the created Version. */
  public versionId: GuidString;
  /** Name of the created Version. */
  public versionName: string;
  /** Id of the [[ChangeSet]] that this Version was created for.  */
  public changeSetId: string;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
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
export class CheckpointCreatedEvent extends IModelHubEvent {
  /** Index of the [[ChangeSet]] this [[Checkpoint]] was created for.  */
  public changeSetIndex: string;
  /** Id of the [[ChangeSet]] this [[Checkpoint]] was created for.  */
  public changeSetId: string;
  /** Id of the [[Version]] this [[Checkpoint]] was created for. */
  public versionId?: GuidString;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
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
export class CheckpointV2CreatedEvent extends IModelHubEvent {
  /** Index of the [[ChangeSet]] this [[CheckpointV2]] was created for.  */
  public changeSetIndex: string;
  /** Id of the [[ChangeSet]] this [[CheckpointV2]] was created for.  */
  public changeSetId: string;
  /** Id of the [[Version]] this [[CheckpointV2]] was created for. */
  public versionId?: GuidString;

  /** Construct this event from object instance.
   * @param obj Object instance.
   * @internal
   */
  public override fromJson(obj: any) {
    super.fromJson(obj);
    this.changeSetIndex = obj.ChangeSetIndex;
    this.changeSetId = obj.ChangeSetId;
    this.versionId = obj.VersionId;
  }
}

/** Get EventConstructor which can be used to construct IModelHubEvent
 * @internal
 */
type EventConstructor = (new () => IModelHubEvent);

/** Get constructor from EventType name.
 * @internal
 */
export function constructorFromEventType(type: IModelHubEventType): EventConstructor {
  switch (type) {
    case IModelHubEventType.LockEvent:
      return LockEvent;
    case IModelHubEventType.AllLocksDeletedEvent:
      return AllLocksDeletedEvent;
    case IModelHubEventType.ChangeSetPostPushEvent:
      return ChangeSetPostPushEvent;
    case IModelHubEventType.ChangeSetPrePushEvent:
      return ChangeSetPrePushEvent;
    case IModelHubEventType.CodeEvent:
      return CodeEvent;
    case IModelHubEventType.AllCodesDeletedEvent:
      return AllCodesDeletedEvent;
    case IModelHubEventType.BriefcaseDeletedEvent:
      return BriefcaseDeletedEvent;
    case IModelHubEventType.iModelDeletedEvent:
      return IModelDeletedEvent;
    case IModelHubEventType.VersionEvent:
      return VersionEvent;
    case IModelHubEventType.CheckpointCreatedEvent:
      return CheckpointCreatedEvent;
    case IModelHubEventType.CheckpointV2CreatedEvent:
      return CheckpointV2CreatedEvent;
  }
}

/** Parse [[IModelHubEvent]] from response object.
 * @param response Response object to parse.
 * @returns Appropriate event object.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function ParseEvent(response: Response) {
  const constructor: EventConstructor = constructorFromEventType(response.header["content-type"]);
  const event = new constructor();
  event.fromJson(response.body);
  return event;
}

/** Subscription to receive [[IModelHubEvent]]s. Each subscription has a separate queue for events that it hasn't read yet. Subscriptions are deleted, if they are inactive for an hour. Use wsgId of this instance for the methods that require subscriptionId. See [[EventSubscriptionHandler]].
 * @public
 */
@ECJsonTypeMap.classToJson("wsg", "iModelScope.EventSubscription", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class EventSubscription extends WsgInstance {
  /** Types of the [[IModelHubEvent]]s that this subscription listens to. */
  @ECJsonTypeMap.propertyToJson("wsg", "properties.EventTypes")
  public eventTypes?: IModelHubEventType[];
}

/** Shared access signature token for getting [[IModelHubEvent]]s. It's used to authenticate for [[EventHandler.getEvent]]. To receive an instance call [[EventHandler.getSASToken]].
 * @public
 */
@ECJsonTypeMap.classToJson("wsg", "iModelScope.EventSAS", { schemaPropertyName: "schemaName", classPropertyName: "className" })
export class EventSAS extends BaseEventSAS {
}

/** Handler for managing [[EventSubscription]]s. Use [[EventHandler.Subscriptions]] to get an instance of this class.
 * @public
 */
export class EventSubscriptionHandler {
  private _handler: IModelBaseHandler;

  /** Constructor for EventSubscriptionHandler.
   * @param handler Handler for WSG requests.
   */
  constructor(handler: IModelBaseHandler) {
    this._handler = handler;
  }

  /** Get relative url for EventSubscription requests.
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param instanceId Id of the subscription.
   */
  private getRelativeUrl(iModelId: GuidString, instanceId?: string) {
    return `/Repositories/iModel--${iModelId}/iModelScope/EventSubscription/${instanceId || ""}`;
  }

  /** Create an [[EventSubscription]].
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param events Array of IModelHubEventTypes to subscribe to.
   * @return Created EventSubscription instance.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async create(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, events: IModelHubEventType[]): Promise<EventSubscription>;
  /**
   * Create an [[EventSubscription]].
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param events Array of EventTypes to subscribe to.
   * @return Created EventSubscription instance.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   * @internal @deprecated Use IModelHubEventType enum for `events` instead.
   */
  public async create(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, events: EventType[]): Promise<EventSubscription>; // eslint-disable-line @typescript-eslint/unified-signatures, deprecation/deprecation
  public async create(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, events: IModelHubEventType[] | EventType[]) { // eslint-disable-line deprecation/deprecation
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Creating event subscription on iModel", () => ({ iModelId }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("iModelId", iModelId);
    ArgumentCheck.nonEmptyArray("events", events);

    let subscription = new EventSubscription();
    subscription.eventTypes = events as IModelHubEventType[];

    subscription = await this._handler.postInstance<EventSubscription>(requestContext, EventSubscription, this.getRelativeUrl(iModelId), subscription);
    requestContext.enter();
    Logger.logTrace(loggerCategory, "Created event subscription on iModel", () => ({ iModelId }));
    return subscription;
  }

  /** Update an [[EventSubscription]]. Can change the [[EventType]]s specified in the subscription. Must be a valid subscription that was previously created with [[EventSubscriptionHandler.create]] that hasn't expired.
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param subscription Updated EventSubscription.
   * @return EventSubscription instance from iModelHub after update.
   * @throws [[IModelHubError]] with [IModelHubStatus.EventSubscriptionDoesNotExist]($bentley) if [[EventSubscription]] does not exist with the specified subscription.wsgId.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async update(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, subscription: EventSubscription): Promise<EventSubscription> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Updating event subscription on iModel", () => ({ iModelId }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("iModelId", iModelId);
    ArgumentCheck.defined("subscription", subscription);
    ArgumentCheck.validGuid("subscription.wsgId", subscription.wsgId);

    const updatedSubscription = await this._handler.postInstance<EventSubscription>(requestContext, EventSubscription, this.getRelativeUrl(iModelId, subscription.wsgId), subscription);
    requestContext.enter();

    Logger.logTrace(loggerCategory, "Updated event subscription on iModel", () => ({ iModelId }));
    return updatedSubscription;
  }

  /** Delete an [[EventSubscription]].
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param eventSubscriptionId Id of the EventSubscription.
   * @returns Resolves if the EventSubscription has been successfully deleted.
   * @throws [[IModelHubError]] with [IModelHubStatus.EventSubscriptionDoesNotExist]($bentley) if EventSubscription does not exist with the specified subscription.wsgId.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async delete(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, eventSubscriptionId: string): Promise<void> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, `Deleting event subscription ${eventSubscriptionId} from iModel`, () => ({ iModelId }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("iModelId", iModelId);
    ArgumentCheck.validGuid("eventSubscriptionId", eventSubscriptionId);

    await this._handler.delete(requestContext, this.getRelativeUrl(iModelId, eventSubscriptionId));
    requestContext.enter();
    Logger.logTrace(loggerCategory, `Deleted event subscription ${eventSubscriptionId} from iModel`, () => ({ iModelId }));
  }
}

/** Handler for receiving [[IModelHubEvent]]s. Use [[IModelClient.Events]] to get an instance of this class.
 * @public
 */
export class EventHandler extends EventBaseHandler {
  private _subscriptionHandler: EventSubscriptionHandler | undefined;

  /** Constructor for EventHandler.
   * @param handler Handler for WSG requests.
   * @internal
   */
  constructor(handler: IModelBaseHandler) {
    super();
    this._handler = handler;
  }

  /** Get a handler for managing [[EventSubscription]]s. */
  public get subscriptions(): EventSubscriptionHandler {
    if (!this._subscriptionHandler) {
      this._subscriptionHandler = new EventSubscriptionHandler(this._handler);
    }

    return this._subscriptionHandler;
  }

  /** Get relative url for EventSAS requests.
   * @param iModelId Id of the iModel. See [[HubIModel]].
   */
  private getEventSASRelativeUrl(iModelId: GuidString): string {
    return `/Repositories/iModel--${iModelId}/iModelScope/EventSAS/`;
  }

  /** Get event SAS Token. Used to authenticate for [[EventHandler.getEvent]].
   * @param requestContext The client request context
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @return SAS Token to connect to the topic.
   * @throws [Common iModelHub errors]($docs/learning/iModelHub/CommonErrors)
   */
  public async getSASToken(requestContext: AuthorizedClientRequestContext, iModelId: GuidString): Promise<EventSAS> {
    Logger.logInfo(loggerCategory, "Getting event SAS token from iModel", () => ({ iModelId }));
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.validGuid("iModelId", iModelId);

    const eventSAS = await this._handler.postInstance<EventSAS>(requestContext, EventSAS, this.getEventSASRelativeUrl(iModelId), new EventSAS());
    requestContext.enter();
    Logger.logTrace(loggerCategory, "Got event SAS token from iModel", () => ({ iModelId }));
    return eventSAS;
  }

  /** Get absolute url for event requests.
   * @param baseAddress Base address for the serviceBus.
   * @param subscriptionId Id of the subscription.
   * @param timeout Optional timeout for long polling.
   */
  private getEventUrl(baseAddress: string, subscriptionId: string, timeout?: number): string {
    let url: string = `${baseAddress}/Subscriptions/${subscriptionId}/messages/head`;

    if (timeout) {
      url = `${url}?timeout=${timeout}`;
    }

    return url;
  }

  /** Get [[IModelHubEvent]] from the [[EventSubscription]]. You can use long polling timeout, to have requests return when events are available (or request times out), rather than returning immediately when no events are found.
   * @param requestContext The client request context
   * @param sasToken SAS Token used to authenticate. See [[EventSAS.sasToken]].
   * @param baseAddress Address for the events. See [[EventSAS.baseAddress]].
   * @param subscriptionId Id of the subscription to the topic. See [[EventSubscription]].
   * @param timeout Optional timeout duration in seconds for request, when using long polling.
   * @return IModelHubEvent if it exists, undefined otherwise.
   * @throws [[IModelHubClientError]] with [IModelHubStatus.UndefinedArgumentError]($bentley) or [IModelHubStatus.InvalidArgumentError]($bentley) if one of the arguments is undefined or has an invalid value.
   * @throws [ResponseError]($itwin-client) if request has failed.
   */
  public async getEvent(requestContext: ClientRequestContext, sasToken: string, baseAddress: string, subscriptionId: string, timeout?: number): Promise<IModelHubEvent | undefined> {
    requestContext.enter();
    Logger.logInfo(loggerCategory, "Getting event from subscription", () => ({ subscriptionId }));
    ArgumentCheck.defined("sasToken", sasToken);
    ArgumentCheck.defined("baseAddress", baseAddress);
    ArgumentCheck.validGuid("subscriptionId", subscriptionId);

    const options = await this.getEventRequestOptions(GetEventOperationToRequestType.GetDestructive, sasToken, timeout);

    const result = await request(requestContext, this.getEventUrl(baseAddress, subscriptionId, timeout), options);
    requestContext.enter();
    if (result.status === 204) {
      Logger.logTrace(loggerCategory, "No events found on subscription", () => ({ subscriptionId }));
      return undefined;
    }

    const event = ParseEvent(result);
    Logger.logTrace(loggerCategory, "Got event from subscription", () => ({ subscriptionId }));
    return event;
  }

  /** Create a listener for long polling events from an [[EventSubscription]]. When event is received from the subscription, every registered listener callback is called. This continuously waits for events until all created listeners for that subscriptionId are deleted. [[EventSAS]] token expirations are handled automatically, [AccessToken]($itwin-client) expiration is handled by calling authenticationCallback to get a new token.
   * @param requestContext The client request context
   * @param authenticationCallback Callback used to get AccessToken. Only the first registered authenticationCallback for this subscriptionId will be used.
   * @param subscriptionId Id of EventSubscription.
   * @param iModelId Id of the iModel. See [[HubIModel]].
   * @param listener Callback that is called when an [[IModelHubEvent]] is received.
   * @returns Function that deletes the created listener.
   * @throws [[IModelHubClientError]] with [IModelHubStatus.UndefinedArgumentError]($bentley) or [IModelHubStatus.InvalidArgumentError]($bentley) if one of the arguments is undefined or has an invalid value.
   */
  public createListener<T extends IModelHubEvent>(requestContext: ClientRequestContext, authenticationCallback: () => Promise<AccessToken>, subscriptionId: string, iModelId: GuidString, listener: (event: T) => void): () => void {
    requestContext.enter();
    ArgumentCheck.defined("requestContext", requestContext);
    ArgumentCheck.defined("authenticationCallback", authenticationCallback);
    ArgumentCheck.validGuid("subscriptionId", subscriptionId);
    ArgumentCheck.validGuid("iModelId", iModelId);

    const subscription = new ListenerSubscription();
    subscription.authenticationCallback = authenticationCallback;
    subscription.getEvent = async (sasToken: string, baseAddress: string, id: string, timeout?: number) =>
      this.getEvent(requestContext, sasToken, baseAddress, id, timeout);
    subscription.getSASToken = async (requestContextArg: AuthorizedClientRequestContext) => this.getSASToken(requestContextArg, iModelId);
    subscription.id = subscriptionId;
    return EventListener.create(subscription, listener as (e: IModelHubBaseEvent) => void);
  }
}
