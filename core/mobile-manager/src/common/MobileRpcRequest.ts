/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { RpcRequest, RpcRequestFulfillment, RpcSerializedValue } from "@bentley/imodeljs-common";
import { MobileRpcProtocol } from "./MobileRpcProtocol";

/** @beta */
export class MobileRpcRequest extends RpcRequest {
  private _res: (value: number) => void = () => undefined;
  private _fulfillment: RpcRequestFulfillment | undefined = undefined;

  /** Convenience access to the protocol of this request. */
  public override readonly protocol: MobileRpcProtocol = this.client.configuration.protocol as any;

  /** Sends the request. */
  protected async send(): Promise<number> {
    this.protocol.requests.set(this.id, this);
    const parts = await MobileRpcProtocol.encodeRequest(this);
    this.protocol.sendToBackend(parts);
    return new Promise<number>((resolve) => { this._res = resolve; });
  }

  /** Loads the request. */
  protected async load(): Promise<RpcSerializedValue> {
    const fulfillment = this._fulfillment;
    if (!fulfillment) {
      throw new Error("No request fulfillment available.");
    }

    return fulfillment.result;
  }

  /** Sets request header values. */
  protected setHeader(_name: string, _value: string): void {
    // No implementation
  }

  /** @internal */
  public notifyResponse(fulfillment: RpcRequestFulfillment) {
    this._fulfillment = fulfillment;
    this._res(fulfillment.status);
  }
}
