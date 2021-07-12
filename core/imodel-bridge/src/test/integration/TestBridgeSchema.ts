/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { ClassRegistry, Schema, Schemas } from "@bentley/imodeljs-backend";
import { KnownTestLocations } from "../KnownTestLocations";
import * as elementsModule from "./TestBridgeElements";
import * as modelsModule from "./TestBridgeModels";

/** Schema class for the TestBridge domain.
 * @beta
 */
export class TestBridgeSchema extends Schema {
  public static override get schemaName(): string { return "TestBridge"; }
  public static get schemaFilePath(): string {
    return path.join(KnownTestLocations.assetsDir, "TestBridge.ecschema.xml");
  }
  public static registerSchema() {
    if (this !== Schemas.getRegisteredSchema(this.schemaName)) {
      Schemas.unregisterSchema(this.schemaName);
      Schemas.registerSchema(this);

      ClassRegistry.registerModule(elementsModule, this);
      ClassRegistry.registerModule(modelsModule, this);
    }
  }
}
