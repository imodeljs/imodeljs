/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Elements
 */

import { Id64String } from "@bentley/bentleyjs-core";
import {
  FunctionalElementProps, IModel, InformationPartitionElementProps, ModelProps, RelatedElement, TypeDefinitionElementProps,
} from "@bentley/imodeljs-common";
import { InformationPartitionElement, RoleElement, TypeDefinitionElement } from "../Element";
import { IModelDb } from "../IModelDb";
import { RoleModel } from "../Model";
import { SubjectOwnsPartitionElements } from "../NavigationRelationship";
import { DrawingGraphicRepresentsElement, ElementRefersToElements } from "../Relationship";

/** A FunctionalPartition element is a key part of the iModel information hierarchy and is always parented
 * to a Subject and broken down by a FunctionalModel.
 * @public
 */
export class FunctionalPartition extends InformationPartitionElement {
  /** @internal */
  public static override get className(): string { return "FunctionalPartition"; }
  /** @internal */
  public constructor(props: InformationPartitionElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A container for persisting FunctionalElements.
 * @public
 */
export class FunctionalModel extends RoleModel {
  /** @internal */
  public static override get className(): string { return "FunctionalModel"; }
  public constructor(props: ModelProps, iModel: IModelDb) {
    super(props, iModel);
  }
  /** Insert a FunctionalPartition and a FunctionalModel that breaks it down.
   * @param iModelDb Insert into this iModel
   * @param parentSubjectId The FunctionalPartition will be inserted as a child of this Subject element.
   * @param name The name of the FunctionalPartition that the new FunctionalModel will break down.
   * @returns The Id of the newly inserted FunctionalPartition and FunctionalModel (same value).
   * @throws [[IModelError]] if there is an insert problem.
   */
  public static insert(iModelDb: IModelDb, parentSubjectId: Id64String, name: string): Id64String {
    const partitionProps: InformationPartitionElementProps = {
      classFullName: FunctionalPartition.classFullName,
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(parentSubjectId),
      code: FunctionalPartition.createCode(iModelDb, parentSubjectId, name),
    };
    const partitionId = iModelDb.elements.insertElement(partitionProps);
    return iModelDb.models.insertModel({
      classFullName: this.classFullName,
      modeledElement: { id: partitionId },
    });
  }
}

/** A FunctionalElement captures functional requirements that will ultimately be fulfilled by a PhysicalElement.
 * @public
 */
export abstract class FunctionalElement extends RoleElement implements FunctionalElementProps {
  /** @internal */
  public static override get className(): string { return "FunctionalElement"; }
  /** @internal */
  public constructor(props: FunctionalElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A FunctionalBreakdownElement is a *folder* node in the functional hierarchy.
 * @public
 */
export abstract class FunctionalBreakdownElement extends FunctionalElement {
  /** @internal */
  public static override get className(): string { return "FunctionalBreakdownElement"; }
  /** @internal */
  public constructor(props: FunctionalElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** @public */
export class FunctionalComposite extends FunctionalBreakdownElement {
  /** @internal */
  public static override get className(): string { return "FunctionalComposite"; }
  /** @internal */
  public constructor(props: FunctionalElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A FunctionalComponentElement is a *leaf* node in the functional hierarchy.
 * @public
 */
export abstract class FunctionalComponentElement extends FunctionalElement {
  /** @internal */
  public static override get className(): string { return "FunctionalComponentElement"; }
  /** @internal */
  public constructor(props: FunctionalElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** Defines a set of properties (the 'type') that can be associated with a Functional Element.
 * @public
 */
export abstract class FunctionalType extends TypeDefinitionElement {
  /** @internal */
  public static override get className(): string { return "FunctionalType"; }
  /** @internal */
  public constructor(props: TypeDefinitionElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** Relates a [[FunctionalElement]] to its [[FunctionalType]]
 * @public
 */
export class FunctionalElementIsOfType extends RelatedElement {
  /** @internal */
  public static get className(): string { return "FunctionalElementIsOfType"; }
  public static classFullName = "Functional:FunctionalElementIsOfType";
  public constructor(id: Id64String, relClassName: string = FunctionalElementIsOfType.classFullName) {
    super({ id, relClassName });
  }
}

/** Relates a [[PhysicalElement]] to the [[FunctionalElement]] elements that it fulfills.
 * @public
 */
export class PhysicalElementFulfillsFunction extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "PhysicalElementFulfillsFunction"; }
}

/** Relates a [[DrawingGraphic]] to the [[FunctionalElement]] that it represents
 * @public
 */
export class DrawingGraphicRepresentsFunctionalElement extends DrawingGraphicRepresentsElement {
  /** @internal */
  public static override get className(): string { return "DrawingGraphicRepresentsFunctionalElement"; }
}
