/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { UnitSystem } from "@bentley/ecschema-metadata";

/**
 * @internal
 * Used for schema editing.
 */
export abstract class MutableUnitSystem extends UnitSystem {
  public abstract override setDisplayLabel(displayLabel: string): void;
}
