/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LinearReferencing
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { ElementRefersToElements } from "@bentley/imodeljs-backend";
import { RelatedElement } from "@bentley/imodeljs-common";

/** Relationship indicating the Linear-Element along which concrete instances mixing-in ILinearlyLocated are located.
 * @beta
 */
export class ILinearlyLocatedAlongILinearElement extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "ILinearlyLocatedAlongILinearElement"; }
}

/** Relationship indicating bis:Element being linearly-located by a concrete instance mixing-in ILinearLocationElement.
 * @beta
 */
export class ILinearLocationLocatesElement extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "ILinearLocationLocatesElement"; }
}

/** Relationship associating Linear-Elements with the elements they came from.
 * @beta
 */
export class ILinearElementProvidedBySource extends RelatedElement {
  public static classFullName = "LinearReferencing:ILinearElementProvidedBySource";
  public constructor(sourceId: Id64String, relClassName: string = ILinearElementProvidedBySource.classFullName) {
    super({ id: sourceId, relClassName });
  }
}

/** Relationship indicating the bis:Element being attributed by a concrete instance mixing-in ILinearlyLocatedAttribution.
 * @beta
 */
export class ILinearlyLocatedAttributesElement extends RelatedElement {
  public static classFullName = "LinearReferencing:ILinearlyLocatedAttributesElement";
  public constructor(attributedElementId: Id64String, relClassName: string = ILinearlyLocatedAttributesElement.classFullName) {
    super({ id: attributedElementId, relClassName });
  }
}

/** Relationship indicating the bis:SpatialElement being used as Referent for Linear Referencing purposes.
 * @beta
 */
export class IReferentReferencesElement extends RelatedElement {
  public static classFullName = "LinearReferencing:IReferentReferencesElement";
  public constructor(referencedElementId: Id64String, relClassName: string = IReferentReferencesElement.classFullName) {
    super({ id: referencedElementId, relClassName });
  }
}

/** Relationship indicating the referent used by a particular linearly-referenced At position.
 * @beta
 */
export class LinearlyReferencedAtPositionRefersToReferent extends RelatedElement {
  public static classFullName = "LinearReferencing:LinearlyReferencedAtPositionRefersToReferent";
  public constructor(referentId: Id64String, relClassName: string = IReferentReferencesElement.classFullName) {
    super({ id: referentId, relClassName });
  }
}

/** Relationship indicating the referent used by a particular linearly-referenced From position.
 * @beta
 */
export class LinearlyReferencedFromPositionRefersToReferent extends RelatedElement {
  public static classFullName = "LinearReferencing:LinearlyReferencedFromPositionRefersToReferent";
  public constructor(referentId: Id64String, relClassName: string = LinearlyReferencedFromPositionRefersToReferent.classFullName) {
    super({ id: referentId, relClassName });
  }
}

/** Relationship indicating the referent used by a particular linearly-referenced To position.
 * @beta
 */
export class LinearlyReferencedToPositionRefersToReferent extends RelatedElement {
  public static classFullName = "LinearReferencing:LinearlyReferencedToPositionRefersToReferent";
  public constructor(referentId: Id64String, relClassName: string = LinearlyReferencedToPositionRefersToReferent.classFullName) {
    super({ id: referentId, relClassName });
  }
}
