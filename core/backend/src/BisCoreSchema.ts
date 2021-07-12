/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Schema
 */

import * as path from "path";
import * as categoryMod from "./Category";
import { ClassRegistry } from "./ClassRegistry";
import * as elementMod from "./Element";
import * as aspectMod from "./ElementAspect";
import * as externalSourceMod from "./ExternalSource";
import { KnownLocations } from "./IModelHost";
import * as materialMod from "./Material";
import * as modelMod from "./Model";
import * as linkMod from "./Relationship";
import { Schema, Schemas } from "./Schema";
import * as textureMod from "./Texture";
import * as viewMod from "./ViewDefinition";
import * as displayStyleMod from "./DisplayStyle";

/**
 * The [BisCore]($docs/bis/intro/schemas-domains.md) schema is the lowest level Schema in an iModel.
 *
 * It is automatically registered when [[IModelHost.startup]] is called.
 *
 * ** Example:**
 * ``` ts
 * [[include:BisCore.registerSchemaAndGetClass]]
 * ```
 * @public
 */
export class BisCoreSchema extends Schema {
  public static override get schemaName(): string { return "BisCore"; }
  public static get schemaFilePath(): string { return path.join(KnownLocations.nativeAssetsDir, "ECSchemas", "Dgn", `${BisCoreSchema.schemaName}.ecschema.xml`); }

  /** @internal */
  public static registerSchema() {
    if (this === Schemas.getRegisteredSchema(this.schemaName))
      return;

    Schemas.unregisterSchema(this.schemaName);
    Schemas.registerSchema(this);

    // this list should include all backend .ts files with implementations of Entity-based classes. Order does not matter.
    [
      elementMod,
      aspectMod,
      modelMod,
      categoryMod,
      viewMod,
      linkMod,
      textureMod,
      materialMod,
      externalSourceMod,
      displayStyleMod,
    ].forEach((module) => ClassRegistry.registerModule(module, this));
  }
}
