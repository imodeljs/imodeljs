/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PhysicalMaterial
 */

import * as path from "path";
import { ClassRegistry, KnownLocations, Schema, Schemas } from "@bentley/imodeljs-backend";
import * as elementsModule from "./PhysicalMaterialElements";

/** The PhysicalMaterialSchema contains standard physical material classes.
 * A physical material defines the matter that makes up physical elements.
 * @see [PhysicalMaterial]($backend)
 * @public
 */
export class PhysicalMaterialSchema extends Schema {
  public static override get schemaName(): string { return "PhysicalMaterial"; }
  public static get schemaFilePath(): string { return path.join(KnownLocations.nativeAssetsDir, "ECSchemas", "Domain", `${PhysicalMaterialSchema.schemaName}.ecschema.xml`); }

  public static registerSchema() {
    if (this !== Schemas.getRegisteredSchema(this.schemaName)) {
      Schemas.unregisterSchema(this.schemaName);
      Schemas.registerSchema(this);
      ClassRegistry.registerModule(elementsModule, this);
    }
  }
}
