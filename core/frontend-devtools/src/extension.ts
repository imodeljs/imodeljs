/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Extension, IModelApp } from "@bentley/imodeljs-frontend";
import { FrontendDevTools } from "./FrontEndDevTools";

/** iModel.js extension wrapper for the package
 * @internal published to the bentley imjs extension registry
 */
export class FrontendDevToolsExtension extends Extension {
  public override async onLoad(_args: string[]): Promise<void> {
    await FrontendDevTools.initialize();
  }

  public async onExecute(_args: string[]): Promise<void> {
    // this extension has no "execute" routine
  }
}

IModelApp.extensionAdmin.register(new FrontendDevToolsExtension("frontend-devtools"));
