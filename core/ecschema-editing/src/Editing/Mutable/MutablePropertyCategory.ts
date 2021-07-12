/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { PropertyCategory } from "@bentley/ecschema-metadata";

/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutablePropertyCategory extends PropertyCategory {
  public abstract override setPriority(priority: number): void;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
