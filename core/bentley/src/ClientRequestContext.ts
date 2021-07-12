/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utils
 */

import { Guid, GuidString } from "./Id";

// cSpell:ignore csrf

/** Properties that identify a session.
 * @public
 */
export interface SessionProps {
  /** Used for logging and usage tracking to identify the application  */
  applicationId: string;

  /** Used for logging and usage tracking to identify the application version  */
  applicationVersion: string;

  /** Used for logging to identify a session  */
  sessionId: GuidString;
}

/** The properties of ClientRequestContext.
 * @public
 */
export interface ClientRequestContextProps extends SessionProps {
  /** Used for logging to correlate all service requests that originated from this client request */
  readonly activityId?: GuidString;
}

/** Provides generic context for a server application to get details of a particular
 * request that originated at the client. This context is used to pass information for various
 * purposes including usage tracking and logging. Services that require authorization are
 * passed an instance of the subclass:
 * [AuthorizedClientRequestContext]($itwin-client)
 * @see [ClientRequestContext rules]($docs/learning/backend/managingclientrequestcontext.md).
 * @see [AuthorizedClientRequestContext]($itwin-client)
 * @public
 */
export class ClientRequestContext {
  /** Used for logging to correlate all service requests that originated from this client request */
  public readonly activityId: GuidString;

  /** Used for logging and usage tracking to identify the application that created this client request */
  public readonly applicationId: string;

  /** Used for logging and usage tracking to identify the application version that created this client request */
  public readonly applicationVersion: string;

  /** Used for logging to identify the session that created this client request */
  public readonly sessionId: GuidString;

  /** Create a new ClientRequestContext */
  public constructor(activityId: GuidString = Guid.createValue(), applicationId: string = "", applicationVersion: string = "", sessionId: GuidString = Guid.empty) {
    this.activityId = activityId;
    this.applicationId = applicationId;
    this.applicationVersion = applicationVersion;
    this.sessionId = sessionId;
    this._useContextForRpc = false;
  }

  /** Get the current client request context */
  public static get current() { return ClientRequestContext._current; }
  protected static _current: ClientRequestContext = new ClientRequestContext();

  /**
   * Set or reset the current ClientRequestContext to be this object. Should be called by async functions and the functions that they call
   * at every resume point. See [ClientRequestContext rules]($docs/learning/backend/managingclientrequestcontext.md).
   */
  public enter(): this {
    ClientRequestContext._current = this;
    return this;
  }

  /** Setup use of this context for the next RPC call
   * @internal
   */
  private _useContextForRpc: boolean;
  public get useContextForRpc(): boolean { return this._useContextForRpc; }
  public set useContextForRpc(value: boolean) { this._useContextForRpc = value; }
  /** @internal */
  public toJSON(): ClientRequestContextProps {
    return {
      activityId: this.activityId,
      applicationId: this.applicationId,
      applicationVersion: this.applicationVersion,
      sessionId: this.sessionId,
    };
  }
  public static fromJSON(json: ClientRequestContextProps): ClientRequestContext {
    return new ClientRequestContext(json.activityId, json.applicationId, json.applicationVersion, json.sessionId);
  }
}

/** Serialized format for sending the client request context across the RPC layer
 * @public
 */
export interface SerializedClientRequestContext {
  id: string;
  applicationId: string;
  applicationVersion: string;
  sessionId: string;
  authorization?: string;
  userId?: string;
  accept?: string;
  csrfToken?: { headerName: string, headerValue: string };
}

/** Used by Logger to set ClientRequestContext metadata
 * @internal
 */
export const addClientRequestContext = (metaData: any) => {
  const requestContext = ClientRequestContext.current;
  metaData.ActivityId = requestContext.activityId;
  metaData.SessionId = requestContext.sessionId;
  metaData.ApplicationId = requestContext.applicationId;
  metaData.ApplicationVersion = requestContext.applicationVersion;
};
