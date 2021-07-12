/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Schema
 */

import * as path from "path";
import { AuthStatus, ClientRequestContext, DbResult, Logger } from "@bentley/bentleyjs-core";
import { IModelError } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { ClassRegistry } from "../ClassRegistry";
import { IModelDb } from "../IModelDb";
import { KnownLocations } from "../IModelHost";
import { Schema, Schemas } from "../Schema";
import * as elementsModule from "./FunctionalElements";

const loggerCategory: string = BackendLoggerCategory.Functional;

/** @public */
export class FunctionalSchema extends Schema {
  public static override get schemaName(): string { return "Functional"; }
  public static get schemaFilePath(): string { return path.join(KnownLocations.nativeAssetsDir, "ECSchemas", "Domain", `${FunctionalSchema.schemaName}.ecschema.xml`); }
  public static registerSchema() {
    if (this !== Schemas.getRegisteredSchema(this.schemaName)) {
      Schemas.unregisterSchema(this.schemaName);
      Schemas.registerSchema(this);
      ClassRegistry.registerModule(elementsModule, this);
    }
  }

  /** @deprecated Use [[schemaFilePath]] and IModelDb.importSchemas instead */
  public static async importSchema(requestContext: AuthorizedClientRequestContext | ClientRequestContext, iModelDb: IModelDb) {
    // NOTE: this concurrencyControl logic was copied from IModelDb.importSchema
    requestContext.enter();
    if (iModelDb.isBriefcaseDb()) {
      if (!(requestContext instanceof AuthorizedClientRequestContext)) {
        throw new IModelError(AuthStatus.Error, "Importing the schema requires an AuthorizedClientRequestContext");
      }
      await iModelDb.concurrencyControl.locks.lockSchema(requestContext);
      requestContext.enter();
    }
    const stat = iModelDb.nativeDb.importFunctionalSchema();
    if (DbResult.BE_SQLITE_OK !== stat) {
      throw new IModelError(stat, "Error importing Functional schema", Logger.logError, loggerCategory);
    }
    // FunctionalDomain (C++) does not create Category or other Elements on import
  }
}
