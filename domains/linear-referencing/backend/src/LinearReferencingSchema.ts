/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LinearReferencing
 */

import * as path from "path";
import { ClassRegistry, KnownLocations, Schema, Schemas } from "@bentley/imodeljs-backend";
import * as aspectsModule from "./LinearReferencingElementAspects";
import * as elementsModule from "./LinearReferencingElements";
import * as relationshipsModule from "./LinearReferencingRelationships";

/** Schema for the LinearReferencing domain.
 * [Linear referencing](https://en.wikipedia.org/wiki/Linear_referencing) is the method of storing geographic locations by using relative positions along a measured linear feature.
 * @beta
 */
export class LinearReferencingSchema extends Schema {
  public static override get schemaName(): string { return "LinearReferencing"; }
  public static get schemaFilePath(): string { return path.join(KnownLocations.nativeAssetsDir, "ECSchemas", "Domain", "LinearReferencing.ecschema.xml"); }
  public static registerSchema() {
    if (this !== Schemas.getRegisteredSchema(this.schemaName)) {
      Schemas.unregisterSchema(this.schemaName);
      Schemas.registerSchema(this);

      ClassRegistry.registerModule(elementsModule, this);
      ClassRegistry.registerModule(aspectsModule, this);
      ClassRegistry.registerModule(relationshipsModule, this);
    }
  }
}
