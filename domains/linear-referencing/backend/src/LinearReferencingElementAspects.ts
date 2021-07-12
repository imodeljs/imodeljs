/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LinearReferencing
 */

import { Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import { ElementMultiAspect, IModelDb } from "@bentley/imodeljs-backend";
import { RelatedElement } from "@bentley/imodeljs-common";
import {
  DistanceExpressionProps, LinearlyReferencedAtLocationAspectProps, LinearlyReferencedFromToLocationAspectProps,
} from "@bentley/linear-referencing-common";
import {
  LinearlyReferencedAtPositionRefersToReferent, LinearlyReferencedFromPositionRefersToReferent, LinearlyReferencedToPositionRefersToReferent,
} from "./LinearReferencingRelationships";

/** Core structure carrying linearly-referenced information.
 * @beta
 */
export class DistanceExpression implements DistanceExpressionProps {
  public distanceAlongFromStart: number;
  public lateralOffsetFromILinearElement?: number;
  public verticalOffsetFromILinearElement?: number;
  public distanceAlongFromReferent?: number;

  constructor(props: DistanceExpressionProps) {
    this.distanceAlongFromStart = JsonUtils.asDouble(props.distanceAlongFromStart);
    this.lateralOffsetFromILinearElement = JsonUtils.asDouble(props.lateralOffsetFromILinearElement);
    this.verticalOffsetFromILinearElement = JsonUtils.asDouble(props.verticalOffsetFromILinearElement);
    this.distanceAlongFromReferent = JsonUtils.asDouble(props.distanceAlongFromReferent);
  }

  public static fromJSON(json: DistanceExpressionProps): DistanceExpression { return new DistanceExpression(json); }
}

/** Base class for multi-aspects carrying linearly-referenced locations.
 * @beta
 */
export class LinearlyReferencedLocation extends ElementMultiAspect {
  /** @internal */
  public static override get className(): string { return "LinearlyReferencedLocation"; }
}

/** Concrete multi-aspect class carrying 'at' linearly-referenced positions along a Linear-Element.
 * @beta
 */
export class LinearlyReferencedAtLocation extends LinearlyReferencedLocation implements LinearlyReferencedAtLocationAspectProps {
  /** @internal */
  public static override get className(): string { return "LinearlyReferencedAtLocation"; }

  public atPosition: DistanceExpression;
  public fromReferent?: LinearlyReferencedAtPositionRefersToReferent;

  constructor(props: LinearlyReferencedAtLocationAspectProps, iModel: IModelDb) {
    super(props, iModel);
    this.atPosition = DistanceExpression.fromJSON(props.atPosition);
    this.fromReferent = RelatedElement.fromJSON(props.fromReferent);
  }

  private static toProps(locatedElementId: Id64String, at: DistanceExpression, fromReferentId?: Id64String): LinearlyReferencedAtLocationAspectProps {
    const props: LinearlyReferencedAtLocationAspectProps = {
      classFullName: LinearlyReferencedAtLocation.classFullName,
      element: { id: locatedElementId },
      atPosition: at,
      fromReferent: (fromReferentId === undefined) ? undefined : new LinearlyReferencedAtPositionRefersToReferent(fromReferentId),
    };

    return props;
  }

  public static create(iModel: IModelDb, locatedElementId: Id64String,
    at: DistanceExpression, fromReferentId?: Id64String): LinearlyReferencedAtLocation {
    return new LinearlyReferencedAtLocation(this.toProps(locatedElementId, at, fromReferentId), iModel);
  }

  public static insert(iModel: IModelDb, locatedElementId: Id64String,
    at: DistanceExpression, fromReferentId?: Id64String): void {
    iModel.elements.insertAspect(this.toProps(locatedElementId, at, fromReferentId));
  }
}

/** Concrete multi-aspect class carrying 'from-to' linearly-referenced positions along a Linear-Element.
 * @beta
 */
export class LinearlyReferencedFromToLocation extends LinearlyReferencedLocation implements LinearlyReferencedFromToLocationAspectProps {
  /** @internal */
  public static override get className(): string { return "LinearlyReferencedFromToLocation"; }

  public fromPosition: DistanceExpression;
  public fromPositionFromReferent?: LinearlyReferencedFromPositionRefersToReferent;
  public toPosition: DistanceExpression;
  public toPositionFromReferent?: LinearlyReferencedToPositionRefersToReferent;

  constructor(props: LinearlyReferencedFromToLocationAspectProps, iModel: IModelDb) {
    super(props, iModel);
    this.fromPosition = DistanceExpression.fromJSON(props.fromPosition);
    this.toPosition = DistanceExpression.fromJSON(props.toPosition);
    this.fromPositionFromReferent = RelatedElement.fromJSON(props.fromPositionFromReferent);
    this.toPositionFromReferent = RelatedElement.fromJSON(props.toPositionFromReferent);
  }

  private static toProps(locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): LinearlyReferencedFromToLocationAspectProps {
    const props: LinearlyReferencedFromToLocationAspectProps = {
      classFullName: LinearlyReferencedFromToLocation.classFullName,
      element: { id: locatedElementId },
      fromPosition: from,
      fromPositionFromReferent: (fromReferentId === undefined) ? undefined : new LinearlyReferencedFromPositionRefersToReferent(fromReferentId),
      toPosition: to,
      toPositionFromReferent: (toReferentId === undefined) ? undefined : new LinearlyReferencedToPositionRefersToReferent(toReferentId),
    };

    return props;
  }

  public static create(iModel: IModelDb, locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): LinearlyReferencedFromToLocation {
    return new LinearlyReferencedFromToLocation(this.toProps(locatedElementId, from, to, fromReferentId, toReferentId), iModel);
  }

  public static insert(iModel: IModelDb, locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): void {
    iModel.elements.insertAspect(this.toProps(locatedElementId, from, to, fromReferentId, toReferentId));
  }
}
