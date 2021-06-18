/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { ClassRegistry, Schema, Schemas } from "@bentley/imodeljs-backend";
import { KnownTestLocations } from "../KnownTestLocations";
import * as elementsModule from "./TestConnectorElements";
import * as modelsModule from "./TestConnectorModels";

/** Schema class for the TestConnector domain.
 * @beta
 */
export class TestConnectorSchema extends Schema {
  public static get schemaName(): string { return "TestConnector"; }
  public static get schemaFilePath(): string {
    return path.join(KnownTestLocations.assetsDir, "TestConnector.ecschema.xml");
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
