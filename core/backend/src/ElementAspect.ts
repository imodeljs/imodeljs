/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ElementAspects
 */

import { ChannelRootAspectProps, ElementAspectProps, ExternalSourceAspectProps, RelatedElement } from "@bentley/imodeljs-common";
import { Entity } from "./Entity";
import { IModelDb } from "./IModelDb";
import { ECSqlStatement } from "./ECSqlStatement";
import { DbResult, Id64String } from "@bentley/bentleyjs-core";

/** Argument for the `ElementAspect.onXxx` static methods
 * @beta
 */
export interface OnAspectArg {
  /** The iModel for the aspect affected by this event. */
  iModel: IModelDb;
}
/** Argument for the `ElementAspect.onXxx` static methods that supply the properties of an aspect to be inserted or updated.
 * @beta
 */
export interface OnAspectPropsArg extends OnAspectArg {
  /** The new properties of the aspect affected by this event. */
  props: Readonly<ElementAspectProps>;
}
/** Argument for the `ElementAspect.onXxx` static methods that only supply the Id of the affected aspect.
 * @beta
 */
export interface OnAspectIdArg extends OnAspectArg {
  /** The Id of the aspect affected by this event */
  aspectId: Id64String;
}

/** An Element Aspect is a class that defines a set of properties that are related to (and owned by) a single element.
 * Semantically, an ElementAspect can be considered part of the Element. Thus, an ElementAspect is deleted if its owning Element is deleted.
 * BIS Guideline: Subclass ElementUniqueAspect or ElementMultiAspect rather than subclassing ElementAspect directly.
 * @public
 */
export class ElementAspect extends Entity implements ElementAspectProps {
  /** @internal */
  public static override get className(): string { return "ElementAspect"; }
  public element: RelatedElement;

  /** @internal */
  constructor(props: ElementAspectProps, iModel: IModelDb) {
    super(props, iModel);
    this.element = RelatedElement.fromJSON(props.element)!;
  }

  /** @internal */
  public override toJSON(): ElementAspectProps {
    const val = super.toJSON() as ElementAspectProps;
    val.element = this.element;
    return val;
  }

  /** Called before a new ElementAspect is inserted.
   * @note throw an exception to disallow the insert
   * @note If you override this method, you must call super.
   * @beta
   */
  protected static onInsert(_arg: OnAspectPropsArg): void { }

  /** Called after a new ElementAspect was inserted.
   * @note If you override this method, you must call super.
   * @beta
   */
  protected static onInserted(_arg: OnAspectPropsArg): void { }

  /** Called before an ElementAspect is updated.
   * @note throw an exception to disallow the update
   * @note If you override this method, you must call super.
   * @beta
   */
  protected static onUpdate(_arg: OnAspectPropsArg): void { }

  /** Called after an ElementAspect was updated.
   * @note If you override this method, you must call super.
   * @beta
   */
  protected static onUpdated(_arg: OnAspectPropsArg): void { }

  /** Called before an ElementAspect is deleted.
   * @note throw an exception to disallow the delete
   * @note If you override this method, you must call super.
   * @beta
   */
  protected static onDelete(_arg: OnAspectIdArg): void { }

  /** Called after an ElementAspect was deleted.
   * @note If you override this method, you must call super.
   * @beta
   */
  protected static onDeleted(_arg: OnAspectIdArg): void { }
}

/** An Element Unique Aspect is an ElementAspect where there can be only zero or one instance of the Element Aspect class per Element.
 * @public
 */
export class ElementUniqueAspect extends ElementAspect {
  /** @internal */
  public static override get className(): string { return "ElementUniqueAspect"; }
}

/** An Element Multi-Aspect is an ElementAspect where there can be **n** instances of the Element Aspect class per Element.
 * @public
 */
export class ElementMultiAspect extends ElementAspect {
  /** @internal */
  public static override get className(): string { return "ElementMultiAspect"; }
}

/** A ChannelRootAspect identifies an Element as the root of a *channel* which is a subset of the overall iModel hierarchy that is independently maintained.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.10
 * @public
 */
export class ChannelRootAspect extends ElementUniqueAspect {
  /** @internal */
  public static override get className(): string { return "ChannelRootAspect"; }

  /** The owner of the channel */
  public owner: string;

  /** @internal */
  constructor(props: ChannelRootAspectProps, iModel: IModelDb) {
    super(props, iModel);
    this.owner = props.owner;
  }

  /** @internal */
  public override toJSON(): ChannelRootAspectProps {
    const val = super.toJSON() as ChannelRootAspectProps;
    val.owner = this.owner;
    return val;
  }

  /** Insert a ChannelRootAspect on the specified element. */
  public static insert(iModel: IModelDb, ownerId: Id64String, ownerDescription: string) {
    const props: ChannelRootAspectProps = {
      classFullName: ChannelRootAspect.classFullName,
      element: { id: ownerId },
      owner: ownerDescription,
    };
    iModel.elements.insertAspect(props);
  }
}

/** An ElementMultiAspect that stores synchronization information for an Element originating from an external source.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.2
 * @public
 */
export class ExternalSourceAspect extends ElementMultiAspect implements ExternalSourceAspectProps {
  /** @internal */
  public static override get className(): string { return "ExternalSourceAspect"; }

  /** An element that scopes the combination of `kind` and `identifier` to uniquely identify the object from the external source. */
  public scope: RelatedElement;
  /** The identifier of the object in the source repository. */
  public identifier: string;
  /** The kind of object within the source repository. */
  public kind: string;
  /** The cryptographic hash (any algorithm) of the source object's content. If defined, it must be guaranteed to change when the source object's content changes. */
  public checksum?: string;
  /** An optional value that is typically a version number or a pseudo version number like last modified time.
   * It will be used by the synchronization process to detect that a source object is unchanged so that computing a cryptographic hash can be avoided.
   * If present, this value must be guaranteed to change when any of the source object's content changes.
   */
  public version?: string;
  /** A place where additional JSON properties can be stored. For example, provenance information or properties relating to the synchronization process. */
  public jsonProperties?: string;
  /** The source of the imported/synchronized object. Should point to an instance of [ExternalSource]($backend). */
  public source?: RelatedElement;

  /** @internal */
  constructor(props: ExternalSourceAspectProps, iModel: IModelDb) {
    super(props, iModel);
    this.scope = RelatedElement.fromJSON(props.scope)!;
    this.source = RelatedElement.fromJSON(props.source);
    this.identifier = props.identifier;
    this.kind = props.kind;
    this.checksum = props.checksum;
    this.version = props.version;
    this.jsonProperties = props.jsonProperties;
  }

  /**  Look up the ElementId of the element that contains an aspect with the specified Scope, Kind, and Identifier
   */
  public static findBySource(iModelDb: IModelDb, scope: Id64String, kind: string, identifier: string): { elementId?: Id64String, aspectId?: Id64String } {
    const sql = `SELECT Element.Id, ECInstanceId FROM ${ExternalSourceAspect.classFullName} WHERE (Scope.Id=:scope AND Kind=:kind AND Identifier=:identifier)`;
    let elementId: Id64String | undefined;
    let aspectId: Id64String | undefined;
    iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      statement.bindId("scope", scope);
      statement.bindString("kind", kind);
      statement.bindString("identifier", identifier);
      if (DbResult.BE_SQLITE_ROW === statement.step()) {
        elementId = statement.getValue(0).getId();
        aspectId = statement.getValue(1).getId();
      }
    });
    return { elementId, aspectId };
  }

  /** @internal */
  public override toJSON(): ExternalSourceAspectProps {
    const val = super.toJSON() as ExternalSourceAspectProps;
    val.scope = this.scope;
    val.source = this.source;
    val.identifier = this.identifier;
    val.kind = this.kind;
    val.checksum = this.checksum;
    val.version = this.version;
    val.jsonProperties = this.jsonProperties;
    return val;
  }
}

/** @public */
export namespace ExternalSourceAspect { // eslint-disable-line no-redeclare
  /** Standard values for the `Kind` property of `ExternalSourceAspect`.
   * @public
   */
  export enum Kind {
    /** Indicates that the [[ExternalSourceAspect]] is storing [[Element]] provenance */
    Element = "Element",
    /** Indicates that the [[ExternalSourceAspect]] is storing [[Relationship]] provenance */
    Relationship = "Relationship",
    /** Indicates that the [[ExternalSourceAspect]] is storing *scope* provenance
     * @see [[ExternalSourceAspect.scope]]
     */
    Scope = "Scope",
  }
}
