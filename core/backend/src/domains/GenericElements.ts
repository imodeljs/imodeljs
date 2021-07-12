/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Elements
 */

import { Id64String } from "@bentley/bentleyjs-core";
import {
  CalloutProps, DefinitionElementProps, ElementProps, GeometricElement2dProps, GeometricElement3dProps, GeometricModel3dProps, IModel,
  InformationPartitionElementProps, ModelProps, PhysicalElementProps, PhysicalTypeProps, TypeDefinitionElementProps, ViewAttachmentLabelProps,
} from "@bentley/imodeljs-common";
import {
  Document, GraphicalElement2d, GraphicalElement3d, GraphicalPartition3d, GraphicalType2d, GroupInformationElement, GroupInformationPartition,
  PhysicalElement, PhysicalType, SpatialLocationElement,
} from "../Element";
import { IModelDb } from "../IModelDb";
import { PhysicalMaterial } from "../Material";
import { GraphicalModel3d, GroupInformationModel } from "../Model";
import { SubjectOwnsPartitionElements } from "../NavigationRelationship";

/** A graphical detailing symbol that is placed on a [[Drawing]] or [[Sheet]].
 * @public
 */
export abstract class DetailingSymbol extends GraphicalElement2d {
  /** @internal */
  public static override get className(): string { return "DetailingSymbol"; }
  public constructor(props: GeometricElement2dProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A graphical DetailingSymbol that contains title text.
 * @public
 */
export class TitleText extends DetailingSymbol {
  /** @internal */
  public static override get className(): string { return "TitleText"; }
  public constructor(props: GeometricElement2dProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A graphical DetailingSymbol that contains a view attachment label.
 * @public
 */
export class ViewAttachmentLabel extends DetailingSymbol implements ViewAttachmentLabelProps {
  /** @internal */
  public static override get className(): string { return "ViewAttachmentLabel"; }
  public constructor(props: ViewAttachmentLabelProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A graphical DetailingSymbol that calls out a reference to another drawing.
 *  @public
 */
export abstract class Callout extends DetailingSymbol implements CalloutProps {
  /** @internal */
  public static override get className(): string { return "Callout"; }
  public constructor(props: CalloutProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A graphical Callout that references a section drawing.
 * @public
 */
export class SectionCallout extends Callout {
  /** @internal */
  public static override get className(): string { return "SectionCallout"; }
  public constructor(props: CalloutProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A graphical Callout that references an elevation drawing.
 * @public
 */
export class ElevationCallout extends Callout {
  /** @internal */
  public static override get className(): string { return "ElevationCallout"; }
  public constructor(props: CalloutProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A graphical Callout that references a plan drawing.
 * @public
 */
export class PlanCallout extends Callout {
  /** @internal */
  public static override get className(): string { return "PlanCallout"; }
  public constructor(props: CalloutProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A graphical Callout that references a detail drawing.
 * @public
 */
export class DetailCallout extends Callout {
  /** @internal */
  public static override get className(): string { return "DetailCallout"; }
  public constructor(props: CalloutProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A generic container for persisting BisCore:GraphicalElement3d instances.
 * @public
 */
export class GenericGraphicalModel3d extends GraphicalModel3d {
  /** @internal */
  public static override get className(): string { return "GraphicalModel3d"; }
  public constructor(props: GeometricModel3dProps, iModel: IModelDb) {
    super(props, iModel);
  }
  /** Insert a BisCore:GraphicalPartition3d and a Generic:GraphicalModel3d that sub-models it.
   * @param iModelDb Insert into this iModel
   * @param parentSubjectId The GraphicalPartition3d will be inserted as a child of this Subject element.
   * @param name The name of the GraphicalPartition3d that the new Generic:GraphicalModel3d will sub-model.
   * @param isPlanProjection Optional value (default is false) that indicates if the contents of this model are expected to be in an XY plane.
   * @returns The Id of the newly inserted GraphicalPartition3d and GraphicalModel3d (same value).
   * @throws [[IModelError]] if there is an insert problem.
   */
  public static insert(iModelDb: IModelDb, parentSubjectId: Id64String, name: string, isPlanProjection?: boolean): Id64String {
    const partitionProps: InformationPartitionElementProps = {
      classFullName: GraphicalPartition3d.classFullName,
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(parentSubjectId),
      code: GraphicalPartition3d.createCode(iModelDb, parentSubjectId, name),
    };
    const partitionId = iModelDb.elements.insertElement(partitionProps);
    const modelProps: GeometricModel3dProps = {
      classFullName: this.classFullName,
      modeledElement: { id: partitionId },
      isPlanProjection,
    };
    return iModelDb.models.insertModel(modelProps);
  }
}

/** The Generic:Graphic3d class is used when 3D graphics cannot be further classified.
 * @note More-specific BisCore:GraphicalElement3d subclasses should be used wherever possible.
 * @public
 */
export class Graphic3d extends GraphicalElement3d {
  /** @internal */
  public static override get className(): string { return "Graphic3d"; }
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** The Generic:PhysicalObject class is used when physical elements cannot be further classified.
 * @note More-specific BisCore:PhysicalElement subclasses should be used wherever possible.
 * @public
 */
export class PhysicalObject extends PhysicalElement {
  /** @internal */
  public static override get className(): string { return "PhysicalObject"; }
  public constructor(props: PhysicalElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** The Generic:SpatialLocation class is used when spatial locations cannot be further classified.
 * @note More-specific BisCore:SpatialLocationElement subclasses should be used wherever possible.
 * @public
 */
export class SpatialLocation extends SpatialLocationElement {
  /** @internal */
  public static override get className(): string { return "SpatialLocation"; }
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** A generic container for BisCore:GroupInformationElement instances.
 * @public
 */
export class GroupModel extends GroupInformationModel {
  /** @internal */
  public static override get className(): string { return "GroupModel"; }
  public constructor(props: ModelProps, iModel: IModelDb) {
    super(props, iModel);
  }
  /** Insert a GroupInformationPartition and a GroupModel that breaks it down.
   * @param iModelDb Insert into this iModel
   * @param parentSubjectId The GroupInformationPartition will be inserted as a child of this Subject element.
   * @param name The name of the GroupInformationPartition that the new GroupModel will break down.
   * @returns The Id of the newly inserted GroupModel.
   * @throws [[IModelError]] if there is an insert problem.
   */
  public static insert(iModelDb: IModelDb, parentSubjectId: Id64String, name: string): Id64String {
    const partitionProps: InformationPartitionElementProps = {
      classFullName: GroupInformationPartition.classFullName,
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(parentSubjectId),
      code: GroupInformationPartition.createCode(iModelDb, parentSubjectId, name),
    };
    const partitionId = iModelDb.elements.insertElement(partitionProps);
    return iModelDb.models.insertModel({
      classFullName: this.classFullName,
      modeledElement: { id: partitionId },
    });
  }
}

/** The Generic:Group class is used when the group cannot be further classified.
 * @public
 */
export class Group extends GroupInformationElement {
  /** @internal */
  public static override get className(): string { return "Group"; }
  public constructor(props: ElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** The Generic:Document class is used when a document cannot be further classified.
 * @note More-specific BisCore:Document subclasses should be used wherever possible.
 * @public
 */
export class GenericDocument extends Document {
  /** @internal */
  public static override get className(): string { return "Document"; }
  public constructor(props: ElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** The Generic:PhysicalMaterial class is used when the physical material cannot be further classified.
 * @note More-specific BisCore:PhysicalMaterial subclasses should be used wherever possible.
 * @public
 */
export class GenericPhysicalMaterial extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "PhysicalMaterial"; }
  public constructor(props: DefinitionElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** The Generic:PhysicalType class is used when the physical type cannot be further classified.
 * @note More-specific BisCore:PhysicalType subclasses should be used wherever possible.
 * @public
 */
export class GenericPhysicalType extends PhysicalType {
  /** @internal */
  public static override get className(): string { return "PhysicalType"; }
  public constructor(props: PhysicalTypeProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** The Generic:GraphicalType2d class is used when graphical types cannot be further classified.
 * @note More-specific BisCore:GraphicalType2d subclasses should be used wherever possible.
 * @public
 */
export class GenericGraphicalType2d extends GraphicalType2d {
  /** @internal */
  public static override get className(): string { return "GraphicalType2d"; }
  public constructor(props: TypeDefinitionElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}
