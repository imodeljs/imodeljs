/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModelBankClient
 */
import { assert, ClientRequestContext } from "@bentley/bentleyjs-core";
import { FileHandler } from "@bentley/itwin-client";
import { IModelBaseHandler } from "../imodelhub/BaseHandler";

/**
 * This class acts as the WsgClient for other iModelBank Handlers.
 * @internal
 */
export class IModelBankHandler extends IModelBaseHandler {

  /**
   * Creates an instance of IModelBankWsgClient.
   * @param handler The upload/download handler to use -- backends only.
   * @param keepAliveDuration TBD
   */
  public constructor(url: string, handler: FileHandler | undefined, keepAliveDuration = 30000) {
    super(keepAliveDuration, handler);
    this.baseUrl = url;
    if (url.startsWith("http://")) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this._agent = require("http").Agent({ keepAlive: keepAliveDuration > 0, keepAliveMsecs: keepAliveDuration });
    }
  }

  protected override getUrlSearchKey(): string { assert(false, "Bentley cloud-specific method should be factored out of WsgClient base class"); return ""; }

  public override baseUrl?: string;

  public override async getUrl(_requestContext: ClientRequestContext, excludeApiVersion?: boolean): Promise<string> {
    if (this._url)
      return this._url;

    this._url = this.baseUrl;
    if (!excludeApiVersion) {
      this._url += `/${this.apiVersion}`;
    }
    return this._url!;
  }
}
