
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Elements
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { Point3d } from "@bentley/geometry-core";
import {
  BisCodeSpec, Code, CodeScopeSpec, ExternalSourceAttachmentProps, ExternalSourceAttachmentRole, ExternalSourceProps, IModel, RelatedElement,
  SynchronizationConfigLinkProps,
} from "@bentley/imodeljs-common";
import { InformationReferenceElement, UrlLink } from "./Element";
import { IModelDb } from "./IModelDb";
import { ExternalSourceAttachmentAttachesSource, ExternalSourceIsInRepository } from "./NavigationRelationship";

/** An ExternalSource refers to an 'information container' found in a repository. In some cases, the container is the entire repository.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class ExternalSource extends InformationReferenceElement {
  /** The repository that contains this ExternalSource. */
  public repository?: ExternalSourceIsInRepository;
  /** The name of the iModel Connecter that processed this ExternalSource. */
  public connectorName?: string;
  /** The version of the iModel Connecter that processed this ExternalSource. */
  public connectorVersion?: string;
  /** @internal */
  public static override get className(): string { return "ExternalSource"; }
  /** @internal */
  public constructor(props: ExternalSourceProps, iModel: IModelDb) {
    super(props, iModel);
    if (props.repository) this.repository = new ExternalSourceIsInRepository(RelatedElement.idFromJson(props.repository));
  }
  /** @internal */
  public override toJSON(): ExternalSourceProps { // This override only specializes the return type
    return super.toJSON() as ExternalSourceProps; // Entity.toJSON takes care of auto-handled properties
  }
  /** The [[CodeSpec]] for ExternalSource elements is not automatically created, so this method ensures that it exists. */
  public static ensureCodeSpec(iModelDb: IModelDb): Id64String {
    try {
      const codeSpec = iModelDb.codeSpecs.getByName(BisCodeSpec.externalSource);
      return codeSpec.id;
    } catch (e) {
      return iModelDb.codeSpecs.insert(BisCodeSpec.externalSource, CodeScopeSpec.Type.Repository);
    }
  }
  /** Create a Code for an ExternalSource element given a name that is meant to be unique within the scope of the iModel.
   * @param iModelDb  The IModelDb
   * @param codeValue The ExternalSource name
   * @see [[ensureCodeSpec]]
   */
  public static createCode(iModelDb: IModelDb, codeValue: string): Code {
    const codeSpec = iModelDb.codeSpecs.getByName(BisCodeSpec.externalSource);
    return new Code({ spec: codeSpec.id, scope: IModel.rootSubjectId, value: codeValue });
  }
}

/** Attachment of an ExternalSource
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class ExternalSourceAttachment extends InformationReferenceElement {
  /** The [[ExternalSource]] that is attached by this ExternalSourceAttachment. */
  public attaches?: ExternalSourceAttachmentAttachesSource;
  /** Specifies whether the attached [[ExternalSource]] provides context or models a part of the whole. */
  public role?: ExternalSourceAttachmentRole;
  /** The translation or offset in global coordinates of the attached [[ExternalSource]] relative to the ExternalSource that attaches it. */
  public translation?: Point3d;
  /** The Yaw angle (in degrees) of the attached [[ExternalSource]] relative to the ExternalSource that attaches it. */
  public yaw?: number;
  /** The Pitch angle (in degrees) of the attached [[ExternalSource]] relative to the ExternalSource that attaches it. */
  public pitch?: number;
  /** The Roll angle (in degrees) of the attached [[ExternalSource]] relative to the ExternalSource that attaches it. */
  public roll?: number;
  /** The scale of the attached [[ExternalSource]] relative to the ExternalSource that attaches it. */
  public scale?: Point3d;
  /** @internal */
  public static override get className(): string { return "ExternalSourceAttachment"; }
  /** @internal */
  public constructor(props: ExternalSourceAttachmentProps, iModel: IModelDb) {
    super(props, iModel);
    if (props.attaches) this.attaches = new ExternalSourceAttachmentAttachesSource(RelatedElement.idFromJson(props.attaches));
    if (props.translation) this.translation = Point3d.fromJSON(props.translation);
    if (props.scale) this.scale = Point3d.fromJSON(props.scale);
  }
  /** @internal */
  public override toJSON(): ExternalSourceAttachmentProps { // This override only specializes the return type
    return super.toJSON() as ExternalSourceAttachmentProps; // Entity.toJSON takes care of auto-handled properties
  }
  /** The [[CodeSpec]] for ExternalSourceAttachment elements is not automatically created, so this method ensures that it exists. */
  public static ensureCodeSpec(iModelDb: IModelDb): Id64String {
    try {
      const codeSpec = iModelDb.codeSpecs.getByName(BisCodeSpec.externalSourceAttachment);
      return codeSpec.id;
    } catch (e) {
      return iModelDb.codeSpecs.insert(BisCodeSpec.externalSourceAttachment, CodeScopeSpec.Type.ParentElement);
    }
  }
  /** Create a Code for an ExternalSourceAttachment element given a name that is meant to be unique within the scope of its parent [[ExternalSource]].
   * @param iModelDb  The IModelDb
   * @param scopeElementId The parent ExternalSource
   * @param codeValue The ExternalSourceAttachment name
   * @see [[ensureCodeSpec]]
   */
  public static createCode(iModelDb: IModelDb, scopeElementId: Id64String, codeValue: string): Code {
    const codeSpec = iModelDb.codeSpecs.getByName(BisCodeSpec.externalSourceAttachment);
    return new Code({ spec: codeSpec.id, scope: scopeElementId, value: codeValue });
  }
}

/** A group of ExternalSources that are collectively a source of information for one or more elements.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class ExternalSourceGroup extends ExternalSource {
  /** @internal */
  public static override get className(): string { return "ExternalSourceGroup"; }
  /** @internal */
  public constructor(props: ExternalSourceProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** Link to the Configuration for an iModel Synchronization Job
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class SynchronizationConfigLink extends UrlLink {
  /** Date/Time of last successful run of this synchronization configuration */
  public lastSuccessfulRun?: string;
  /** @internal */
  public static override get className(): string { return "SynchronizationConfigLink"; }
  /** @internal */
  public constructor(props: SynchronizationConfigLinkProps, iModel: IModelDb) {
    super(props, iModel);
  }
  /** @internal */
  public override toJSON(): SynchronizationConfigLinkProps { // This override only specializes the return type
    return super.toJSON() as SynchronizationConfigLinkProps; // Entity.toJSON takes care of auto-handled properties
  }
}

