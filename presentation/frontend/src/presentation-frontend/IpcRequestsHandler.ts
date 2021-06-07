/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { AsyncMethodsOf, IpcApp, PromiseReturnType } from "@bentley/imodeljs-frontend";
import {
  NodeKey, NodeKeyJSON, PRESENTATION_IPC_CHANNEL_NAME, PresentationIpcInterface, RulesetVariable, RulesetVariableJSON, SetRulesetVariableParams,
  UpdateHierarchyStateParams,
} from "@bentley/presentation-common";

/** @internal */
export class IpcRequestsHandler {
  public readonly clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  private async call<T extends AsyncMethodsOf<PresentationIpcInterface>>(methodName: T, ...args: Parameters<PresentationIpcInterface[T]>): Promise<PromiseReturnType<PresentationIpcInterface[T]>> {
    return IpcApp.callIpcChannel(PRESENTATION_IPC_CHANNEL_NAME, methodName, ...args);
  }

  public async setRulesetVariable(params: Omit<SetRulesetVariableParams<RulesetVariable>, "clientId">) {
    const jsonParams: SetRulesetVariableParams<RulesetVariableJSON> = {
      ...params,
      clientId: this.clientId,
      variable: RulesetVariable.toJSON(params.variable),
    };
    return this.call("setRulesetVariable", jsonParams);
  }

  public async updateHierarchyState(params: Omit<UpdateHierarchyStateParams<NodeKey>, "clientId">) {
    const jsonParams: UpdateHierarchyStateParams<NodeKeyJSON> = {
      ...params,
      clientId: this.clientId,
      nodeKeys: params.nodeKeys.map(NodeKey.toJSON),
    };
    return this.call("updateHierarchyState", jsonParams);
  }
}
