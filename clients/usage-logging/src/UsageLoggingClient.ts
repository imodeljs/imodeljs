/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module UsageLogging
 */
import { BentleyStatus, Guid, GuidString, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext, Client, request, RequestOptions, Response } from "@bentley/itwin-client";
import { FeatureLogEntryJson, LogEntryConverter } from "./LogEntryConverter";
import { UsageLoggingClientLoggerCategory } from "./UsageLoggingClientLoggerCategories";

const loggerCategory: string = UsageLoggingClientLoggerCategory.Client;

/** Represents one of the potential usage types.
 * See also
 *  - [[UsageLogEntry]], [[FeatureLogEntry]]
 *  - *UsageType* entry on [ULAS Swagger](https://connect-ulastm.bentley.com/Bentley.ULAS.SwaggerUI/SwaggerWebApp/?urls.primaryName=ULAS%20Posting%20Service%20v1)
 *  site (section *Models*)
 * @internal
 */
export enum UsageType {
  Production, Trial, Beta, HomeUse, PreActivation,
}

/** Represents the version of the product logging usage or features.
 * See also [[UsageLogEntry]], [[FeatureLogEntry]].
 * @internal
 */
export interface ProductVersion {
  major: number;
  minor: number;
  sub1?: number;
  sub2?: number;
}

/**
 * Usage log entry data that is submitted to the ULAS Posting Service.
 * See also
 *  - [[UlasClient]]
 *  - *UsageLogEntry* entry on [ULAS Swagger](https://connect-ulastm.bentley.com/Bentley.ULAS.SwaggerUI/SwaggerWebApp/index.html?urls.primaryName=ULAS%20Posting%20Service%20v1)
 *  site (section *Models*)
 * @internal
 */
export class UsageLogEntry {
  /** The GUID of the context that the usage should be associated with. */
  public contextId?: GuidString;

  /** Name of the client machine from which usage is logged */
  public readonly hostName: string;

  /** The type of usage that occurred on the client. It is acting as a filter to eliminate records from log processing that
   * should not count towards a customer’s peak processing.
   */
  public readonly usageType: UsageType;

  /** Timestamp against which the usage is logged.
   * It is set at construction time of this object.
   */
  public readonly timestamp: string;

  /** Creates a new UsageLogEntry object.
   *  This also sets the timestamp against which the usage will be logged.
   *  @param hostName Name of the client machine from which usage is logged.
   *  @param usageType Usage type (see [[UsageType]])
   *  @param contextId The GUID of the context that the usage should be associated with.
   */
  public constructor(hostName: string, usageType: UsageType, contextId?: GuidString) {
    this.hostName = hostName;
    this.usageType = usageType;
    this.contextId = contextId;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Standard feature log entry data that is submitted to the ULAS Posting Service.
 * See also
 *  - [[UlasClient]]
 *  - *FeatureLogEntry* entry on [ULAS Swagger](https://connect-ulastm.bentley.com/Bentley.ULAS.SwaggerUI/SwaggerWebApp/index.html?urls.primaryName=ULAS%20Posting%20Service%20v1)
 *  site (section *Models*)
 * @internal
 */
export class FeatureLogEntry {
  /** Additional user-defined metadata for the feature usage. */
  public additionalData: { [key: string]: string } = {};

  public correlationId = Guid.createValue();

  /**
   * Time at which feature usage began
   * Defaults to current time
   */
  public startTime: Date = new Date();

  /**
   * Time at which feature usage ended
   * Defaults to current time
   */
  public endTime: Date = new Date();

  /** Creates a new FeatureLogEntry object.
   *  This also sets the timestamp against which the feature will be logged.
   *  @param featureId Feature ID from the Global Feature Registry which is being logged.
   *  @param hostName Name of the client machine from which the feature is being logged.
   *  @param usageType Usage type (see [[UsageType]])
   *  @param contextId The GUID of the context that the usage should be associated with.
   */
  public constructor(
    /** ID of the feature to log (from the Global Feature Registry). */
    public readonly featureId: GuidString,
    /** Name of the client machine from which usage is logged. */
    public readonly hostName: string,
    /** The type of usage that occurred on the client. It is acting as a filter to eliminate records from log processing that
     * should not count towards a customer’s peak processing.
     */
    public readonly usageType: UsageType,
    /** The GUID of the context that the usage should be associated with. */
    public readonly contextId?: GuidString,
  ) { }
}

/**
 * Feature log entry data that can be independently submitted to the ULAS Posting Service to denote the start of a feature usage session.
 * @internal
 */
export class StartFeatureLogEntry extends FeatureLogEntry {
  public override readonly startTime: Date;
  public override readonly endTime = new Date("0001-01-01T00:00:00Z"); // ULAS spec dictates that start feature usage entries use the default date for endDate

  /**
   * @param featureId
   * @param hostName
   * @param usageType
   * @param contextId
   * @param startTime Sets the startTime of the feature entry if provided, defaults to the current time when omitted.
   */
  public constructor(featureId: GuidString, hostName: string, usageType: UsageType, contextId?: GuidString, startTime: Date = new Date()) {
    super(featureId, hostName, usageType, contextId);
    this.startTime = startTime;
  }
}

/**
 * Feature log entry data that can be independently submitted to the ULAS Posting Service to denote the end of a feature usage session.
 * Expected to always be paired with a corresponding StartFeatureLogEntry (related via correlationId)
 * @internal
 */
export class EndFeatureLogEntry extends FeatureLogEntry {
  public override readonly startTime = new Date("0001-01-01T00:00:00Z"); // ULAS spec dictates that end feature usage entries use the default date for startDate
  public override readonly endTime: Date;

  private constructor(featureId: GuidString, hostName: string, usageType: UsageType, contextId?: GuidString, endTime: Date = new Date()) {
    super(featureId, hostName, usageType, contextId);
    this.endTime = endTime;
  }

  /**
   * Creates a feature log entry denoting the end of a usage session using a corresponding start entry.
   * @param startEntry
   * @param endTime Sets the end time of the feature entry if provided, defaults to the current time when omitted.
   */
  public static createFromStartEntry(startEntry: StartFeatureLogEntry, endTime?: Date): EndFeatureLogEntry {
    const endEntry = new EndFeatureLogEntry(startEntry.featureId, startEntry.hostName, startEntry.usageType, startEntry.contextId, endTime);
    endEntry.correlationId = startEntry.correlationId;
    return endEntry;
  }
}

/**
 * Response from posting a [[UsageLogEntry]] or [[FeatureLogEntry]] with the [[UlasClient]].
 * See also *LogPostingResponse* entry on [ULAS Swagger](https://connect-ulastm.bentley.com/Bentley.ULAS.SwaggerUI/SwaggerWebApp/?urls.primaryName=ULAS%20Posting%20Service%20v1)
 * site (section *Models*)
 * @internal
 */
export interface LogPostingResponse {
  /* The overall status of the request. */
  status: BentleyStatus;
  /* The message localized in client's language. */
  message: string;
  /* The time in milliseconds it took to complete the request submitted by the client. */
  time: number;
  /* The unique ID of the request assigned by the server when handling the client's request. */
  requestId: GuidString;
}

/**
 * Client for the Bentley Usage Logging & Analysis Services (ULAS).
 * See also the two `POST` requests on [ULAS Swagger](https://connect-ulastm.bentley.com/Bentley.ULAS.SwaggerUI/SwaggerWebApp/?urls.primaryName=ULAS%20Posting%20Service%20v1)
 * @internal
 */
export class UsageLoggingClient extends Client {
  private static readonly _buddiSearchKey: string = "UsageLoggingServices.RealtimeLogging.Url";

  /** Creates an instance of UlasClient. */
  constructor() { super(); }

  /**
   * Gets name/key to query the service URLs from the URL Discovery Service ("Buddi")
   * @returns Search key for the URL.
   */
  protected getUrlSearchKey(): string { return UsageLoggingClient._buddiSearchKey; }

  protected override async setupOptionDefaults(options: RequestOptions): Promise<void> {
    await super.setupOptionDefaults(options);
    options.useCorsProxy = true;
  }

  /**
   * Logs one or more feature entries via the ULAS service.
   * @param requestContext The client request context.
   * @param featureEntries One or more feature log entries.
   * @returns Response from the service.
   */
  public async logFeatureUsage(requestContext: AuthorizedClientRequestContext, ...featureEntries: FeatureLogEntry[]): Promise<LogPostingResponse> {
    requestContext.enter();

    const featureLogEntryJson = []; // ULAS spec always expects an array of feature logs
    for (const entry of featureEntries) {
      const entryJson: FeatureLogEntryJson = LogEntryConverter.toFeatureLogJson(requestContext, entry);
      featureLogEntryJson.push(entryJson);
    }

    const baseUrl = await this.getUrl(requestContext);
    requestContext.enter();
    const featurePostUrl = `${baseUrl}/featureLog`;

    return this.logEntry(requestContext, featurePostUrl, featureLogEntryJson);
  }

  private async logEntry(requestContext: AuthorizedClientRequestContext, postUrl: string, jsonBody: any): Promise<LogPostingResponse> {
    const token = requestContext.accessToken;
    const authString: string = token.toTokenString();
    const options: RequestOptions = {
      method: "POST",
      headers: { authorization: authString },
      body: jsonBody,
    };

    await this.setupOptionDefaults(options);
    requestContext.enter();
    if (Logger.isEnabled(loggerCategory, LogLevel.Trace))
      Logger.logTrace(loggerCategory, `Sending Usage Log REST request...`, () => ({ url: postUrl, body: jsonBody }));

    const resp: Response = await request(requestContext, postUrl, options);
    requestContext.enter();
    const requestDetails = { url: postUrl, body: jsonBody, response: resp };
    if (Logger.isEnabled(loggerCategory, LogLevel.Trace))
      Logger.logTrace(loggerCategory, `Sent Usage Log REST request.`, () => requestDetails);

    const respBody: any = resp.body;
    if (!respBody || !respBody.status || respBody.status.toLowerCase() !== "success")
      throw new Error(`Post Usage Log REST request failed ${!!respBody.msg ? `: ${respBody.msg}` : ""}. Details: ${JSON.stringify(requestDetails)}`);

    return { status: BentleyStatus.SUCCESS, message: !!respBody.msg ? respBody.msg : "", time: !!respBody.time ? respBody.time : -1, requestId: respBody.reqID };
  }
}
