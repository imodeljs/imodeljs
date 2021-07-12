/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  DelayedPromiseWithProps, ECClass, ECObjectsError, ECObjectsStatus, EntityClass, Mixin, NavigationProperty,
  parseStrengthDirection, RelationshipClass, StrengthDirection,
} from "@bentley/ecschema-metadata";

/**
 * Hackish approach that works like a "friend class" so we can access protected members without making them public.
 * @internal
 */
export abstract class MutableEntityClass extends EntityClass {
  public abstract override addMixin(mixin: Mixin): any;
  public abstract override createNavigationProperty(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty>;
  public abstract override createNavigationPropertySync(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty;
  public abstract override setDisplayLabel(displayLabel: string): void;
}

/** @internal */
export async function createNavigationProperty(ecClass: ECClass, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty> {
  if (await ecClass.getProperty(name))
    throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${ecClass.name}.`);

  let resolvedRelationship: RelationshipClass | undefined;
  if (typeof (relationship) === "string") {
    resolvedRelationship = await ecClass.schema.lookupItem<RelationshipClass>(relationship);
  } else
    resolvedRelationship = relationship;

  if (!resolvedRelationship)
    throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided RelationshipClass, ${relationship}, is not a valid RelationshipClassInterface.`);

  if (typeof (direction) === "string") {
    const tmpDirection = parseStrengthDirection(direction);
    if (undefined === tmpDirection)
      throw new ECObjectsError(ECObjectsStatus.InvalidStrengthDirection, `The provided StrengthDirection, ${direction}, is not a valid StrengthDirection.`);
    direction = tmpDirection;
  }

  const lazyRelationship = new DelayedPromiseWithProps(resolvedRelationship.key, async () => resolvedRelationship!);
  return new NavigationProperty(ecClass, name, lazyRelationship, direction);
}

/** @internal */
export function createNavigationPropertySync(ecClass: ECClass, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty {
  if (ecClass.getPropertySync(name))
    throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${ecClass.name}.`);

  let resolvedRelationship: RelationshipClass | undefined;
  if (typeof (relationship) === "string") {
    resolvedRelationship = ecClass.schema.lookupItemSync<RelationshipClass>(relationship);
  } else
    resolvedRelationship = relationship;

  if (!resolvedRelationship)
    throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided RelationshipClass, ${relationship}, is not a valid RelationshipClassInterface.`);

  if (typeof (direction) === "string") {
    const tmpDirection = parseStrengthDirection(direction);
    if (undefined === tmpDirection)
      throw new ECObjectsError(ECObjectsStatus.InvalidStrengthDirection, `The provided StrengthDirection, ${direction}, is not a valid StrengthDirection.`);
    direction = tmpDirection;
  }

  const lazyRelationship = new DelayedPromiseWithProps(resolvedRelationship.key, async () => resolvedRelationship!);
  return new NavigationProperty(ecClass, name, lazyRelationship, direction);
}
