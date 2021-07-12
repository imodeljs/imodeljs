/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BentleyCloudRpcConfiguration, BentleyCloudRpcProtocol, OpenAPIInfo } from "@bentley/imodeljs-common";
import * as http from "http";
import * as sinon from "sinon";
import { IModelJsExpressServer } from "../ExpressServer";

export class FakeBentleyCloudRpcConfiguration extends BentleyCloudRpcConfiguration {

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private static info: OpenAPIInfo = { title: "randomTitle", version: "randomVersion" };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private protocolClass = class extends BentleyCloudRpcProtocol {
    public override pathPrefix = "randomPathPrefix";
    public info = FakeBentleyCloudRpcConfiguration.info;
  };

  /** @implements */
  public interfaces = () => [];

  /** @implements */
  public protocol: BentleyCloudRpcProtocol = new this.protocolClass(this);
}

const fakeHttpServer = {
  listen: async (_opts: any, cb: any) => {
    await new Promise((resolve) => setImmediate(resolve));
    cb();
  },
} as any;

export class TestIModelJsExpressServer extends IModelJsExpressServer {
  public get expressApp() { return this._app; }

  // Wrap base initialize so we configure express app, but don't actually listen on any ports
  public override async initialize(port: number) {
    const httpStub = sinon.stub(http, "createServer").returns(fakeHttpServer);
    const server = super.initialize(port);
    httpStub.restore();
    return server;
  }
}
