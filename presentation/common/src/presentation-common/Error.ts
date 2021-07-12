/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { BentleyError, GetMetaDataFunction, LogFunction } from "@bentley/bentleyjs-core";

/**
 * Status codes used by Presentation APIs.
 * @public
 */
export enum PresentationStatus {
  /** Success result. */
  Success = 0,

  /** Request was cancelled. */
  Canceled = 1,

  /** Error: Unknown */
  Error = 0x10000,

  /** Error: Backend is not initialized. */
  NotInitialized = Error + 1,

  /**
   * Error: Attempting to use something after disposal.
   * @deprecated The value is not used anymore.
   */
  UseAfterDisposal = Error + 2,

  /** Error: Argument is invalid. */
  InvalidArgument = Error + 3,

  /**
   * Error: Received invalid response.
   * @deprecated The value is not used anymore.
   */
  InvalidResponse = Error + 4,

  /**
   * Error: Requested content when there is none.
   * @deprecated The value is not used anymore.
   */
  NoContent = Error + 5,

  /**
   * Error: Backend needs to be synced with client state.
   * @deprecated The value is not used anymore.
   */
  BackendOutOfSync = Error + 6,

  /**
   * Timeout for the request was reached which prevented it from being fulfilled. Frontend may
   * repeat the request.
   */
  BackendTimeout = Error + 7,
}

/**
 * An error type thrown by Presentation APIs.
 * @public
 */
export class PresentationError extends BentleyError {

  /**
   * Creates an instance of Error.
   * @param errorNumber Error code
   * @param message Optional brief description of the error. The `message` property combined with the `name`
   * property is used by the `Error.prototype.toString()` method to create a string representation of the Error.
   * @param log Optional log function which logs the error.
   * @param getMetaData Optional function that returns meta-data related to an error.
   */
  public constructor(errorNumber: PresentationStatus, message?: string, log?: LogFunction, getMetaData?: GetMetaDataFunction) {
    super(errorNumber, message, log, "Presentation", getMetaData);
  }

  /**
   * Returns the name of each error status. The name is used by the `Error.prototype.toString()`
   * method to create a string representation of the error.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  protected override _initName(): string {
    let value = PresentationStatus[this.errorNumber];
    if (!value)
      value = `Unknown Error (${this.errorNumber})`;
    return value;
  }
}
