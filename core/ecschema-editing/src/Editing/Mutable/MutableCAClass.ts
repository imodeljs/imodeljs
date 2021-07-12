/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { CustomAttributeClass, CustomAttributeContainerType } from "@bentley/ecschema-metadata";

/**
 * @internal
 * An abstract class used for Schema editing.
 */
export abstract class MutableCAClass extends CustomAttributeClass {
  public abstract override setContainerType(containerType: CustomAttributeContainerType): void;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
