/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Extension, IModelApp } from "@bentley/imodeljs-frontend";

export class LoadingTestExtension extends Extension {
  /** Invoked the first time this extension is loaded. */
  public override async onLoad(): Promise<void> {
    (IModelApp as any).extensionLoaded = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  /** Invoked each time this extension is loaded. */
  public async onExecute(): Promise<void> {
    (IModelApp as any).extensionExecuted = Date.now();
  }
}

// Register the extension with the extensionAdmin.
// NOTE: The name used here is how the Extension is registered with the Extension server it is hosted on.
IModelApp.extensionAdmin.register(new LoadingTestExtension("loadingTestExtension"));
