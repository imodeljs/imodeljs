/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { LazyLoadedEntityClass, Mixin, NavigationProperty, RelationshipClass, StrengthDirection } from "@bentley/ecschema-metadata";

/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutableMixin extends Mixin {
  public abstract override setAppliesTo(entityClass: LazyLoadedEntityClass): void;
  public abstract override createNavigationProperty(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty>;
  public abstract override createNavigationPropertySync(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
