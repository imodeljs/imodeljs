/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ElementState
 */

import { GuidString, Id64, Id64String } from "@bentley/bentleyjs-core";
import { Code, ElementProps, EntityProps, RelatedElement } from "@bentley/imodeljs-common";
import { IModelConnection } from "./IModelConnection";

/** The "state" of an Entity as represented in a web browser. Every subclass of EntityState handles one BIS class.
 * @public
 */
export class EntityState implements EntityProps {
  /** The name of the BIS schema for this class.
   * @note Subclasses from other than the BisCore domain must override the static member "schemaName" with their schema name.
   */
  public static get schemaName() { return "BisCore"; }

  private get _ctor(): typeof EntityState { return this.constructor as typeof EntityState; }

  /** The name of the BIS class associated with this class.
   * @note Every subclass of EntityState **MUST** override this method to identify its BIS class.
   * Failure to do so will ordinarily result in an error when the class is registered, since there may only
   * be one JavaScript class for a given BIS class (usually the errant class will collide with its superclass.)
   */
  public static get className() { return "Entity"; }

  /** The name of the BIS class associated with this class. */
  public get className(): string { return this._ctor.className; }

  /** The Id of this Entity. May be invalid if the Entity has not yet been saved in the database. */
  public readonly id: Id64String;
  /** The iModel from which this Entity was loaded */
  public readonly iModel: IModelConnection;
  /** The full class name in the form "schema:class". */
  public readonly classFullName: string;
  /** Optional [json properties]($docs/bis/intro/element-fundamentals.md#jsonproperties) of this Entity. */
  public readonly jsonProperties: { [key: string]: any };

  /** Constructor for EntityState
   * @param props the properties of the Entity for this EntityState
   * @param iModel the iModel from which this EntityState is to be constructed
   * @param _state source EntityState for clone
   */
  constructor(props: EntityProps, iModel: IModelConnection, _state?: EntityState) {
    this.classFullName = props.classFullName ? props.classFullName : this._ctor.classFullName;
    this.iModel = iModel;
    this.id = Id64.fromJSON(props.id);
    this.jsonProperties = props.jsonProperties ? JSON.parse(JSON.stringify(props.jsonProperties)) : {}; // make sure we have our own copy
  }

  /** @internal */
  public toJSON(): EntityProps {
    const val: any = {};
    val.classFullName = this.classFullName;
    if (Id64.isValid(this.id))
      val.id = this.id;
    if (this.jsonProperties && Object.keys(this.jsonProperties).length > 0)
      val.jsonProperties = this.jsonProperties;
    return val;
  }

  /** Return true if this EntityState is equal to another one. */
  public equals(other: this): boolean { return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON()); }

  /** Make an independent copy of this EntityState */
  public clone(iModel?: IModelConnection): this { return new this._ctor(this.toJSON(), iModel ? iModel : this.iModel, this) as this; }

  /** Get full BIS class name of this Entity in the form "SchemaName:ClassName".  */
  public static get classFullName(): string { return `${this.schemaName}:${this.className}`; }
}

/** The "state" of an Element as represented in a web browser.
 * @public
 */
export class ElementState extends EntityState implements ElementProps {
  /** @internal */
  public static get className() { return "Element"; }

  /** The ModelId of the [Model]($docs/bis/intro/model-fundamentals.md) containing this element */
  public readonly model: Id64String;
  /** The [Code]($docs/bis/intro/codes.md) for this element */
  public readonly code: Code;
  /** The parent Element of this, or undefined if no parent. */
  public readonly parent?: RelatedElement;
  /** A [FederationGuid]($docs/bis/intro/element-fundamentals.md#federationguid) assigned to this element by some other federated database */
  public readonly federationGuid?: GuidString;
  /** A [user-assigned label]($docs/bis/intro/element-fundamentals.md#userlabel) for this element. */
  public readonly userLabel?: string;

  constructor(props: ElementProps, iModel: IModelConnection) {
    super(props, iModel);
    this.code = Code.fromJSON(props.code);
    this.model = RelatedElement.idFromJson(props.model);
    this.parent = RelatedElement.fromJSON(props.parent);
    if (undefined !== props.federationGuid)
      this.federationGuid = props.federationGuid;
    if (undefined !== props.userLabel)
      this.userLabel = props.userLabel;
  }

  /** Obtain this element's JSON representation. Subclasses of ElementState typically override this method with a more
   * specific return type.
   */
  public toJSON(): ElementProps {
    const val = super.toJSON() as ElementProps;
    if (Id64.isValid(this.code.spec))
      val.code = this.code;

    val.model = this.model;
    val.parent = this.parent;
    val.federationGuid = this.federationGuid;
    val.userLabel = this.userLabel;
    return val;
  }
}
