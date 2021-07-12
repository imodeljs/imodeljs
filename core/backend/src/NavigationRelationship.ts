/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Relationships
 */

// NOTE: A NavigationRelationship is not an Entity, so is not registered in the ClassRegistry.
// NOTE: It does, however, have a classFullName property for consistency with Entity subclasses.

import { Id64String } from "@bentley/bentleyjs-core";
import { RelatedElement, TypeDefinition } from "@bentley/imodeljs-common";

/** Relates a parent Element to child Elements which represent parts of the Entity modeled by the parent Element.
 * @public
 */
export class ElementOwnsChildElements extends RelatedElement {
  public static classFullName = "BisCore:ElementOwnsChildElements";
  public constructor(parentId: Id64String, relClassName: string = ElementOwnsChildElements.classFullName) {
    super({ id: parentId, relClassName });
  }
}

/** Relates a parent [[Subject]] to [[Subject]] child elements.
 * @public
 */
export class SubjectOwnsSubjects extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:SubjectOwnsSubjects";
  public constructor(parentId: Id64String, relClassName: string = SubjectOwnsSubjects.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[Subject]] to [[InformationPartitionElement]] child elements.
 * @public
 */
export class SubjectOwnsPartitionElements extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:SubjectOwnsPartitionElements";
  public constructor(parentId: Id64String, relClassName: string = SubjectOwnsPartitionElements.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[Category]] to [[SubCategory]] child elements.
 * @public
 */
export class CategoryOwnsSubCategories extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:CategoryOwnsSubCategories";
  public constructor(parentId: Id64String, relClassName: string = CategoryOwnsSubCategories.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[RenderMaterial]] to [[RenderMaterial]] child elements.
 * @public
 */
export class RenderMaterialOwnsRenderMaterials extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:RenderMaterialOwnsRenderMaterials";
  public constructor(parentId: Id64String, relClassName: string = RenderMaterialOwnsRenderMaterials.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent Element to child Elements which represent **hidden** parts of the Entity.
 * @public
 */
export class ElementEncapsulatesElements extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:ElementEncapsulatesElements";
  public constructor(parentId: Id64String, relClassName: string = ElementEncapsulatesElements.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[PhysicalElement]] to [[PhysicalElement]] children that it assembles.
 * @public
 */
export class PhysicalElementAssemblesElements extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:PhysicalElementAssemblesElements";
  public constructor(parentId: Id64String, relClassName: string = PhysicalElementAssemblesElements.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[ExternalSource]] to its [[ExternalSourceAttachment]] children.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class ExternalSourceOwnsAttachments extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:ExternalSourceOwnsAttachments";
  public constructor(parentId: Id64String, relClassName: string = ExternalSourceOwnsAttachments.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a parent [[FolderLink]] to its [[RepositoryLink]] children.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class FolderContainsRepositories extends ElementOwnsChildElements {
  public static override classFullName = "BisCore:FolderContainsRepositories";
  public constructor(parentId: Id64String, relClassName: string = FolderContainsRepositories.classFullName) {
    super(parentId, relClassName);
  }
}

/** Relates a [[GeometricElement2d]] to its [[TypeDefinitionElement]]
 * @public
 */
export class GeometricElement2dHasTypeDefinition extends TypeDefinition {
  public static classFullName = "BisCore:GeometricElement2dHasTypeDefinition";
  public constructor(id: Id64String, relClassName: string = GeometricElement2dHasTypeDefinition.classFullName) {
    super({ id, relClassName });
  }
}

/** Relates a [[GraphicalElement2d]] to its [[GraphicalType2d]]
 * @public
 */
export class GraphicalElement2dIsOfType extends GeometricElement2dHasTypeDefinition {
  public static override classFullName = "BisCore:GraphicalElement2dIsOfType";
  public constructor(id: Id64String, relClassName: string = GraphicalElement2dIsOfType.classFullName) {
    super(id, relClassName);
  }
}

/** Relates a [[GeometricElement3d]] to its [[TypeDefinitionElement]]
 * @public
 */
export class GeometricElement3dHasTypeDefinition extends TypeDefinition {
  public static classFullName = "BisCore:GeometricElement3dHasTypeDefinition";
  public constructor(id: Id64String, relClassName: string = GeometricElement3dHasTypeDefinition.classFullName) {
    super({ id, relClassName });
  }
}

/** Relates a [[SpatialLocationElement]] to its [[SpatialLocationType]]
 * @public
 */
export class SpatialLocationIsOfType extends GeometricElement3dHasTypeDefinition {
  public static override classFullName = "BisCore:SpatialLocationIsOfType";
  public constructor(id: Id64String, relClassName: string = SpatialLocationIsOfType.classFullName) {
    super(id, relClassName);
  }
}

/** Relates a [[PhysicalElement]] to its [[PhysicalType]]
 * @public
 */
export class PhysicalElementIsOfType extends GeometricElement3dHasTypeDefinition {
  public static override classFullName = "BisCore:PhysicalElementIsOfType";
  public constructor(id: Id64String, relClassName: string = PhysicalElementIsOfType.classFullName) {
    super(id, relClassName);
  }
}

/** Relates a [[PhysicalElement]] to its [[PhysicalMaterial]]
 * @public
 */
export class PhysicalElementIsOfPhysicalMaterial extends RelatedElement {
  public static classFullName = "BisCore:PhysicalElementIsOfPhysicalMaterial";
  public constructor(id: Id64String) {
    super({ id });
  }
}

/** Relates a [[PhysicalType]] to its [[PhysicalMaterial]]
 * @public
 */
export class PhysicalTypeIsOfPhysicalMaterial extends RelatedElement {
  public static classFullName = "BisCore:PhysicalTypeIsOfPhysicalMaterial";
  public constructor(id: Id64String) {
    super({ id });
  }
}

/** Relates an [[Element]] and an [[ElementUniqueAspect]] that it owns.
 * @public
 */
export class ElementOwnsUniqueAspect extends RelatedElement {
  public static classFullName = "BisCore:ElementOwnsUniqueAspect";
  public constructor(elementId: Id64String, relClassName: string = ElementOwnsUniqueAspect.classFullName) {
    super({ id: elementId, relClassName });
  }
}

/** Relates an [[Element]] and an [[ElementMultiAspect]] that it owns.
 * @public
 */
export class ElementOwnsMultiAspects extends RelatedElement {
  public static classFullName = "BisCore:ElementOwnsMultiAspects";
  public constructor(elementId: Id64String, relClassName: string = ElementOwnsMultiAspects.classFullName) {
    super({ id: elementId, relClassName });
  }
}

/** Relates an [[Element]] and an [[ExternalSourceAspect]] that it owns.
 * @public
 */
export class ElementOwnsExternalSourceAspects extends ElementOwnsMultiAspects {
  public static override classFullName = "BisCore:ElementOwnsExternalSourceAspects";
  public constructor(elementId: Id64String, relClassName: string = ElementOwnsExternalSourceAspects.classFullName) {
    super(elementId, relClassName);
  }
}

/** Relates an [[ExternalSource]] to the [[RepositoryLink]] that it is persisted in.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class ExternalSourceIsInRepository extends RelatedElement {
  public static classFullName = "BisCore:ExternalSourceIsInRepository";
  public constructor(repositoryId: Id64String, relClassName: string = ExternalSourceIsInRepository.classFullName) {
    super({ id: repositoryId, relClassName });
  }
}

/** Relates an [[ExternalSource]] to the [[RepositoryLink]] that it is persisted in.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class ExternalSourceAttachmentAttachesSource extends RelatedElement {
  public static classFullName = "BisCore:ExternalSourceAttachmentAttachesSource";
  public constructor(externalSourceId: Id64String, relClassName: string = ExternalSourceAttachmentAttachesSource.classFullName) {
    super({ id: externalSourceId, relClassName });
  }
}
