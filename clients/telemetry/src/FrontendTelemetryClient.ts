/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Telemetry
 */

import { GuidString } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TelemetryClient, TelemetryEvent } from "./TelemetryClient";

/**
 * @alpha
 * General telemetry event data augmented with data obtained from an [[AuthorizedClientRequestContext]]
 */
export class ClientTelemetryEvent extends TelemetryEvent {
  protected static readonly _iModelJsVersion: string = require("../package.json").version; // eslint-disable-line @typescript-eslint/no-var-requires
  public get iModelJsVersion(): string { return ClientTelemetryEvent._iModelJsVersion; }
  /** Unique identifier for the current activity. Useful for correlating any actions performed during a specific activity. */
  public readonly activityId?: GuidString;
  /** Unique identifier for the current user session. */
  public readonly sessionId?: GuidString;
  /** Application ID configured for the client application. */
  public readonly clientApplicationId?: string;
  /** Application version configured for the client application. */
  public readonly clientApplicationVersion?: string;
  /** Client-configured ID of the current user */
  public readonly clientUserId?: string;
  /** Client-configured ID of the current user's organization */
  public readonly clientUserOrgId?: string;
  /** Client-configured name of the current user's organization */
  public readonly clientUserOrgName?: string;

  public constructor(telemetryEvent: TelemetryEvent, requestContext: AuthorizedClientRequestContext) {
    super(telemetryEvent.eventName, telemetryEvent.eventId, telemetryEvent.contextId, telemetryEvent.iModelId, telemetryEvent.changeSetId, telemetryEvent.time, telemetryEvent.additionalProperties);

    this.activityId = requestContext.activityId;
    this.sessionId = requestContext.sessionId;
    this.clientApplicationId = requestContext.applicationId;
    this.clientApplicationVersion = requestContext.applicationVersion;
    this.clientUserId = requestContext.accessToken.getUserInfo()?.id;
    this.clientUserOrgId = requestContext.accessToken.getUserInfo()?.organization?.name;
    this.clientUserOrgName = requestContext.accessToken.getUserInfo()?.organization?.id;
  }

  public override getProperties(): { [key: string]: any } {
    const properties = super.getProperties();

    properties.activityId = this.activityId;
    properties.sessionId = this.sessionId;
    properties.clientApplicationId = this.clientApplicationId;
    properties.clientApplicationVersion = this.clientApplicationVersion;
    properties.clientUserId = this.clientUserId;
    properties.clientUserOrgName = this.clientUserOrgName;
    properties.clientUserOrgId = this.clientUserOrgId;

    return properties;
  }
}

/**
 * @alpha
 * General template class for telemetry clients to be used by frontend clients
 */
export abstract class FrontendTelemetryClient implements TelemetryClient {
  protected constructor() {
  }

  public async postTelemetry(requestContext: AuthorizedClientRequestContext, telemetryEvent: TelemetryEvent): Promise<void> {
    const frontendTelemetryEvent = new ClientTelemetryEvent(telemetryEvent, requestContext);
    await this._postTelemetry(requestContext, frontendTelemetryEvent);
  }

  protected abstract _postTelemetry(requestContext: AuthorizedClientRequestContext, telemetryEvent: ClientTelemetryEvent): Promise<void>;
}
