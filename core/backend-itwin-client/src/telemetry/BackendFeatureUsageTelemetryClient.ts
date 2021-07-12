/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Telemetry
 */

import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { FrontendFeatureUsageTelemetryClient, UsageLoggingClient } from "@bentley/usage-logging-client";
import { BackendTelemetryClient, BackendTelemetryEvent } from "./BackendTelemetryClient";
import { ImsClientAuthIntrospectionManager } from "./ImsClientAuthIntrospectionManager";

/**
 * @internal
 * Backend wrapper around [[UsageLoggingClient]] that implements [[TelemetryClient]].
 * Includes additional client and host information not calculated by [[FrontendFeatureUsageTelemetryClient]]
 */
export class BackendFeatureUsageTelemetryClient extends BackendTelemetryClient {
  private readonly _usageLoggingClient = new UsageLoggingClient();
  protected override readonly _backendMachineName: string;

  public constructor(config: {
    backendMachineName: string;
    backendApplicationId?: string;
    backendApplicationVersion?: string;
    clientAuthManager?: ImsClientAuthIntrospectionManager;
  }) {
    super(config.backendMachineName, config.backendApplicationId, config.backendApplicationVersion, config.clientAuthManager);
    this._backendMachineName = config.backendMachineName;
  }

  protected async _postTelemetry(requestContext: AuthorizedClientRequestContext, backendTelemetryEvent: BackendTelemetryEvent): Promise<void> {
    const featureLogEntry = FrontendFeatureUsageTelemetryClient.getFeatureLogEntry(backendTelemetryEvent, this._backendMachineName);
    await this._usageLoggingClient.logFeatureUsage(requestContext, featureLogEntry);
  }
}
