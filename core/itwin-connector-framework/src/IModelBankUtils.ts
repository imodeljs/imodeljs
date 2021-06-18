/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { IModelBankClient, IModelClient } from "@bentley/imodelhub-client";
import { assert } from "@bentley/bentleyjs-core";
import { UrlFileHandler } from "@bentley/backend-itwin-client";

/** Arguments that describe the iModelBank server environment used by the job
 * @alpha
 */
export class IModelBankArgs {
  /** The URL of the iModelBank server or gateway */
  public url?: string;
  /** The access to pass to iModelBank server */
  public getToken?: () => Promise<AccessToken>;
  /** The GUID of the iModel that the bank serves. This is used to name to local briefcase and as a means of checking that the URL is correct. */
  public iModelId?: string;
  /** The GUID of the context for the iModel. */
  public contextId?: string;
  /** Storage type used in iModelBank. */
  public storageType?: string;
  /** Optional. Friendly name of the iModel. */
  public iModelName?: string;
  /** The number of times to retry a failed pull, merge, and/or push. (0 means that the framework will try operations only once and will not re-try them in case of failure.) */
  public maxRetryCount: number = 3;
  /** The maximum number of seconds to wait during retries (each retry waits randomly between 0 and this maximum). */
  public maxRetryWait: number = 5;
}

/** Helps set up to work with iModelBank
 * @alpha
 */
export class IModelBankUtils {

  public static isValidArgs(bankArgs: IModelBankArgs): boolean {
    return bankArgs.url !== undefined && bankArgs.iModelId !== undefined;
  }

  public static makeIModelClient(bankArgs: IModelBankArgs): IModelClient {
    assert(bankArgs.url !== undefined);
    return new IModelBankClient(bankArgs.url, new UrlFileHandler()); // TODO: Check with Karolis that this is the right file handler
  }

  public static async initialize(bankArgs: IModelBankArgs, _requestContext: AuthorizedClientRequestContext, _iModelClient: IModelClient) {
    if (bankArgs.url === undefined || bankArgs.iModelId === undefined) {
      throw new Error("Need to supply at lesat the URL and iModelId");
    }

    // TODO

  }

}
