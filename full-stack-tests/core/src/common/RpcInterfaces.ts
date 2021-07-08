/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ClientRequestContextProps, GuidString } from "@bentley/bentleyjs-core";
import {
  DevToolsRpcInterface, IModelReadRpcInterface, IModelRpcProps, IModelTileRpcInterface, IModelWriteRpcInterface,
  RpcInterface, RpcManager, SnapshotIModelRpcInterface, WipRpcInterface,
} from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContextProps } from "@bentley/itwin-client";

export interface CloudEnvProps {
  iModelBank?: {
    url: string;
  };
  iModelHub?: {
    region: string;
  };
}

export abstract class TestRpcInterface extends RpcInterface {
  public static readonly interfaceName = "TestRpcInterface";
  public static interfaceVersion = "1.1.1";

  public static getClient(): TestRpcInterface {
    return RpcManager.getClientForInterface(TestRpcInterface);
  }
  public async restartIModelHost(): Promise<void> {
    return this.forward(arguments);
  }
  public async createChangeSummary(_iModelRpcProps: IModelRpcProps): Promise<void> {
    return this.forward(arguments);
  }
  public async deleteChangeCache(_iModelRpcProps: IModelRpcProps): Promise<void> {
    return this.forward(arguments);
  }
  public async executeTest(_iModelRpcProps: IModelRpcProps, _testName: string, _params: any): Promise<any> {
    return this.forward(arguments);
  }
  public async reportRequestContext(): Promise<ClientRequestContextProps> {
    return this.forward(arguments);
  }
  public async reportAuthorizedRequestContext(): Promise<AuthorizedClientRequestContextProps> {
    return this.forward(arguments);
  }
  public async getCloudEnv(): Promise<CloudEnvProps> {
    return this.forward(arguments);
  }
  public async purgeCheckpoints(_iModelId: string): Promise<void> {
    return this.forward(arguments);
  }
}

export abstract class EventsTestRpcInterface extends RpcInterface {
  public static readonly interfaceName = "EventsTestRpcInterface";
  public static interfaceVersion = "0.1.0";

  public static getClient(): EventsTestRpcInterface {
    return RpcManager.getClientForInterface(EventsTestRpcInterface);
  }

  // Set a event that would be fired from backend and received on frontend.
  public async echo(_id: GuidString, _message: string): Promise<void> { return this.forward(arguments); }
}

export const rpcInterfaces = [
  IModelReadRpcInterface,
  IModelTileRpcInterface,
  IModelWriteRpcInterface, // eslint-disable-line deprecation/deprecation
  SnapshotIModelRpcInterface,
  TestRpcInterface,
  WipRpcInterface,
  DevToolsRpcInterface,
  EventsTestRpcInterface,
];
