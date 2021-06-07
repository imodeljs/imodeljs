/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Elements
 */

import {
  assert, CompressedId64Set, DbOpcode, GuidString, Id64, Id64Set, Id64String, JsonUtils, OrderedId64Array,
} from "@bentley/bentleyjs-core";
import { Range3d, Transform } from "@bentley/geometry-core";
import { LockLevel } from "@bentley/imodelhub-client";
import {
  AxisAlignedBox3d, BisCodeSpec, Code, CodeScopeProps, CodeSpec, DefinitionElementProps, ElementAlignedBox3d, ElementProps, EntityMetaData,
  GeometricElement2dProps, GeometricElement3dProps, GeometricElementProps, GeometricModel2dProps, GeometricModel3dProps, GeometryPartProps,
  GeometryStreamProps, IModel, InformationPartitionElementProps, LineStyleProps, ModelProps, PhysicalElementProps, PhysicalTypeProps, Placement2d,
  Placement3d, RelatedElement, RenderSchedule, RenderTimelineProps, RepositoryLinkProps, SectionDrawingLocationProps, SectionDrawingProps, SectionType,
  SheetBorderTemplateProps, SheetProps, SheetTemplateProps, SubjectProps, TypeDefinition, TypeDefinitionElementProps, UrlLinkProps,
} from "@bentley/imodeljs-common";
import { ConcurrencyControl } from "./ConcurrencyControl";
import { Entity } from "./Entity";
import { IModelCloneContext } from "./IModelCloneContext";
import { IModelDb } from "./IModelDb";
import { DefinitionModel, DrawingModel, PhysicalModel } from "./Model";
import { SubjectOwnsSubjects } from "./NavigationRelationship";

/** Argument for the `Element.onXxx` static methods
 * @beta
 */
export interface OnElementArg {
  /** The iModel for the Element affected by this method. */
  iModel: IModelDb;
}

/** Argument for `Element.onInsert` and `Element.onUpdate` static methods.
 * @beta
 */
export interface OnElementPropsArg extends OnElementArg {
  /** The properties of the Element affected by this method.
   * @note the properties may be modified. If so the modified values will be inserted/updated.
   */
  props: ElementProps;
}

/** Argument for the `Element.onXxx` static methods that only supply the Id of the affected Element.
 * @beta
 */
export interface OnElementIdArg extends OnElementArg {
  /** The Id of the Element affected by this method */
  id: Id64String;
}

/** Argument for the `Element.onChildXxx` static methods
 * @beta
 */
export interface OnChildElementArg extends OnElementArg {
  parentId: Id64String;
}

/** Argument for the `Element.onChildXxx` static methods that supply the properties of the child Element to be inserted or updated.
 * @beta
 */
export interface OnChildElementPropsArg extends OnChildElementArg {
  /** The new properties of the child Element for this method. */
  childProps: Readonly<ElementProps>;
}

/** Argument for the `Element.onChildXxx` static methods that only supply the Id of the child Element.
 * @beta
 */
export interface OnChildElementIdArg extends OnChildElementArg {
  /** The Id of the child element for this method */
  childId: Id64String;
}

/** Argument for the `Element.onSubModelInsert` static method
 * @beta
 */
export interface OnSubModelPropsArg extends OnElementArg {
  /** The properties of the prospective sub-model */
  subModelProps: ModelProps;
}

/** Argument for several `Element.onSubModelXxx` static methods
 * @beta
 */
export interface OnSubModelIdArg extends OnElementArg {
  /** The modelId of the sub Model */
  subModelId: Id64String;
}

/** Elements are the smallest individually identifiable building blocks for modeling the real world in an iModel.
 * Each element represents an entity in the real world. Sets of Elements (contained in [[Model]]s) are used to model
 * other Elements that represent larger scale real world entities. Using this recursive modeling strategy,
 * Elements can represent entities at any scale. Elements can represent physical things or abstract concepts
 * or simply be information records.
 *
 * Every Element has a 64-bit id (inherited from Entity) that uniquely identifies it within an iModel. Every Element also
 * has a "code" that identifies its meaning in the real world. Additionally, Elements may have a "federationGuid"
 * to hold a GUID, if the element was assigned that GUID by some other federated database. The iModel database enforces
 * uniqueness of id, code, and federationGuid.
 *
 * See:
 * * [Element Fundamentals]($docs/bis/intro/element-fundamentals.md)
 * * [Working with schemas and elements in TypeScript]($docs/learning/backend/SchemasAndElementsInTypeScript.md)
 * * [Creating elements]($docs/learning/backend/CreateElements.md)
 * @public
 */
export class Element extends Entity implements ElementProps {
  /** @internal */
  public static get className(): string { return "Element"; }
  /** @internal */
  public static get protectedOperations() { return ["onInsert", "onUpdate", "onDelete"]; }

  /** The ModelId of the [Model]($docs/bis/intro/model-fundamentals.md) containing this element */
  public readonly model: Id64String;
  /** The [Code]($docs/bis/intro/codes.md) for this element */
  public code: Code;
  /** The parent element, if present, of this element. */
  public parent?: RelatedElement;
  /** A [FederationGuid]($docs/bis/intro/element-fundamentals.md#federationguid) assigned to this element by some other federated database */
  public federationGuid?: GuidString;
  /** A [user-assigned label]($docs/bis/intro/element-fundamentals.md#userlabel) for this element. */
  public userLabel?: string;
  /** Optional [json properties]($docs/bis/intro/element-fundamentals.md#jsonproperties) of this element. */
  public readonly jsonProperties: { [key: string]: any };

  /** constructor for Element.
   * @internal
   */
  constructor(props: ElementProps, iModel: IModelDb) {
    super(props, iModel);
    this.code = Code.fromJSON(props.code);  // TODO: Validate props.code - don't silently fail if it is the wrong type
    this.model = RelatedElement.idFromJson(props.model);
    this.parent = RelatedElement.fromJSON(props.parent);
    this.federationGuid = props.federationGuid;
    this.userLabel = props.userLabel;
    this.jsonProperties = { ...props.jsonProperties }; // make sure we have our own copy
  }

  /** Disclose the codes and locks needed to perform the specified operation on this element
   * @param req the request to populate
   * @param props the version of the element that will be written
   * @param iModel the iModel
   * @param opcode the operation
   * @param original a pre-change copy of the element. Passed only in the case of Update.
   * @beta
   */
  public static populateRequest(req: ConcurrencyControl.Request, props: ElementProps, iModel: IModelDb, opcode: DbOpcode, original: ElementProps | undefined) {
    assert(iModel.isBriefcaseDb());
    if (!iModel.isBriefcaseDb()) {
      return;
    }
    switch (opcode) {
      case DbOpcode.Insert: {
        if (Code.isValid(props.code) && !Code.isEmpty(props.code))
          req.addCodes([props.code]);
        req.addLocks([ConcurrencyControl.Request.getModelLock(props.model, LockLevel.Shared)]);
        break;
      }
      case DbOpcode.Delete: {
        assert(props.id !== undefined);
        req.addLocks([ConcurrencyControl.Request.getElementLock(props.id, LockLevel.Exclusive)]);

        // Elements.deleteElement will automatically delete children, so we must automatically request the necessary resources for the children.
        iModel.elements.queryChildren(props.id).forEach((childId) => {
          this.populateRequest(req, { ...props, id: childId } as ElementProps, iModel, opcode, original); // (Rather than load the child's props, just fake it. We know that only the id property is needed. Likewise, pass anything for "original", since it's not used in the delete case. )
        });
        break;
      }
      case DbOpcode.Update: {
        assert(props.id !== undefined);
        req.addLocks([ConcurrencyControl.Request.getElementLock(props.id, LockLevel.Exclusive)]);

        assert(original !== undefined && original.id === props.id);
        if (original !== undefined) {

          if (Code.isValid(props.code) && !Code.isEmpty(props.code) && !Code.equalCodes(props.code, original.code))
            req.addCodes([props.code]);

          if (props.model !== original.model)
            req.addLocks([ConcurrencyControl.Request.getModelLock(original.model, LockLevel.Shared)]);
        }
        break;
      }
    }
  }

  /** Called before a new Element is inserted.
   * @note throw an exception to disallow the insert
   * @note If you override this method, you must call super.
   * @note `this` is the class of the Element to be inserted
   * @beta
   */
  protected static onInsert(arg: OnElementPropsArg): void {
    if (arg.iModel.isBriefcaseDb()) {
      arg.iModel.concurrencyControl.onElementWrite(this, arg.props, DbOpcode.Insert);
    }
  }

  /** Called after a new Element was inserted.
   * @note If you override this method, you must call super.
   * @note `this` is the class of the Element that was inserted
   * @beta
   */
  protected static onInserted(arg: OnElementIdArg): void {
    if (arg.iModel.isBriefcaseDb()) {
      arg.iModel.concurrencyControl.onElementWritten(this, arg.id, DbOpcode.Insert);
    }
  }

  /** Called before an Element is updated.
   * @note throw an exception to disallow the update
   * @note If you override this method, you must call super.
   * @note `this` is the class of the Element to be updated
   * @beta
   */
  protected static onUpdate(arg: OnElementPropsArg): void {
    if (arg.iModel.isBriefcaseDb()) {
      arg.iModel.concurrencyControl.onElementWrite(this, arg.props, DbOpcode.Update);
    }
  }

  /** Called after an Element was updated.
   * @note If you override this method, you must call super.
   * @note `this` is the class of the Element that was updated
   * @beta
   */
  protected static onUpdated(arg: OnElementIdArg): void {
    if (arg.iModel.isBriefcaseDb()) {
      arg.iModel.concurrencyControl.onElementWritten(this, arg.id, DbOpcode.Update);
    }
  }

  /** Called before an Element is deleted.
   * @note throw an exception to disallow the delete
   * @note If you override this method, you must call super.
   * @note `this` is the class of the Element to be deleted
   * @beta
   */
  protected static onDelete(arg: OnElementIdArg): void {
    if (arg.iModel.isBriefcaseDb()) {
      const props = arg.iModel.elements.tryGetElementProps(arg.id);
      if (props !== undefined)
        arg.iModel.concurrencyControl.onElementWrite(this, props, DbOpcode.Delete);
    }
  }

  /** Called after an Element was deleted.
   * @note If you override this method, you must call super.
   * @note `this` is the class of the Element that was deleted
   * @beta
   */
  protected static onDeleted(_arg: OnElementIdArg): void { }

  /** Called when an element with an instance of this class as its parent is about to be deleted.
   * @note throw an exception if the element should not be deleted
   * @note implementers should not presume that the element was deleted if this method does not throw,
   * since the delete may fail for other reasons. Instead, rely on [[onChildDeleted]] for that purpose.
   * @note `this` is the class of the parent Element whose child will be deleted
   * @beta
   */
  protected static onChildDelete(_arg: OnChildElementIdArg): void { }

  /** Called after an element with an instance of this class as its parent was successfully deleted.
   * @note `this` is the class of the parent Element whose child was deleted
   * @beta
   */
  protected static onChildDeleted(_arg: OnChildElementIdArg): void { }

  /** Called when a *new element* with an instance of this class as its parent is about to be inserted.
   * @note throw an exception if the element should not be inserted
   * @note `this` is the class of the prospective parent Element.
   * @beta
   */
  protected static onChildInsert(_arg: OnChildElementPropsArg): void { }

  /** Called after a *new element* with an instance of this class as its parent was inserted.
   * @note `this` is the class of the parent Element.
   * @beta
   */
  protected static onChildInserted(_arg: OnChildElementIdArg): void { }

  /** Called when an element with an instance of this class as its parent is about to be updated.
   * @note throw an exception if the element should not be updated
   * @note `this` is the class of the parent Element.
   * @beta
   */
  protected static onChildUpdate(_arg: OnChildElementPropsArg): void { }

  /** Called after an element with an instance of this the class as its parent was updated.
   * @note `this` is the class of the parent Element.
   * @beta
   */
  protected static onChildUpdated(_arg: OnChildElementIdArg): void { }

  /** Called when an *existing element* is about to be updated so that an instance of this class will become its new parent.
   * @note throw an exception if the element should not be added
   * @note `this` is the class of the prospective parent Element.
   * @beta
   */
  protected static onChildAdd(_arg: OnChildElementPropsArg): void { }

  /** Called after an *existing element* has been updated so that an instance of this class is its new parent.
   * @note `this` is the class of the new parent Element.
   * @beta
   */
  protected static onChildAdded(_arg: OnChildElementIdArg): void { }

  /** Called when an element with an instance of this class as its parent is about to be updated change to a different parent.
   * @note throw an exception if the element should not be dropped
   * @note `this` is the class of the parent Element.
   * @beta
   */
  protected static onChildDrop(_arg: OnChildElementIdArg): void { }

  /** Called after an element with an instance of this class as its previous parent was updated to have a new parent.
   * @note `this` is the class of the previous parent Element.
   * @beta
   */
  protected static onChildDropped(_arg: OnChildElementIdArg): void { }

  /** Called when an instance of this class is being *sub-modeled* by a new Model.
   * @note throw an exception if model should not be inserted
   * @note `this` is the class of Element to be sub-modeled.
   * @beta
   */
  protected static onSubModelInsert(_arg: OnSubModelPropsArg): void { }

  /** Called after an instance of this class was *sub-modeled* by a new Model.
   * @note `this` is the class of Element that is now sub-modeled.
   * @beta
   */
  protected static onSubModelInserted(_arg: OnSubModelIdArg): void { }

  /** Called when a sub-model of an instance of this class is being deleted.
   * @note throw an exception if model should not be deleted
   * @note `this` is the class of Element that is sub-modeled.
   * @beta
   */
  protected static onSubModelDelete(_arg: OnSubModelIdArg): void { }

  /** Called after a sub-model of an instance of this class was deleted.
   * @note `this` is the class of Element that was sub-modeled.
   * @beta
   */
  protected static onSubModelDeleted(_arg: OnSubModelIdArg): void { }

  /** Called during the iModel transformation process after an Element from the source iModel was *cloned* for the target iModel.
   * The transformation process automatically handles remapping BisCore properties and those that are properly described in ECSchema.
   * This callback is only meant to be overridden if there are other Ids in non-standard locations that need to be remapped or other data that needs to be fixed up after the clone.
   * @param _context The context that persists any remapping between the source iModel and target iModel.
   * @param _sourceProps The ElementProps for the source Element that was cloned.
   * @param _targetProps The ElementProps that are a result of the clone. These can be further modified.
   * @note If you override this method, you must call super.
   * @beta
   */
  protected static onCloned(_context: IModelCloneContext, _sourceProps: ElementProps, _targetProps: ElementProps): void { }

  /** Called when a *root* element in a subgraph is changed and before its outputs are processed.
   * This special callback is made when:
   * * the element is part of an [[ElementDrivesElement]] graph, and
   * * the element has no inputs, and
   * * none of the element's outputs have been processed.
   * @see [[ElementDrivesElement]] for more on element dependency graphs.
   * @beta
   */
  protected static onBeforeOutputsHandled(_id: Id64String, _iModel: IModelDb): void { }

  /** Called on an element in a graph after all of its inputs have been processed and before its outputs are processed.
   * This callback is made when:
   * * the specified element is part of an [[ElementDrivesElement]] graph, and
   * * there was a direct change to some element upstream in the dependency graph.
   * * all upstream elements in the graph have been processed.
   * * none of the downstream elements have been processed.
   * This method is not called if none of the element's inputs were changed.
   * @see [[ElementDrivesElement]] for more on element dependency graphs.
   * @beta
   */
  protected static onAllInputsHandled(_id: Id64String, _iModel: IModelDb): void { }

  /** Save this Element's properties to an object for serializing to JSON.
   * @internal
   */
  public toJSON(): ElementProps {
    const val = super.toJSON() as ElementProps;

    if (Code.isValid(this.code))
      val.code = this.code;

    val.model = this.model;
    val.userLabel = this.userLabel;
    val.federationGuid = this.federationGuid;
    if (this.parent) val.parent = this.parent;
    if (Object.keys(this.jsonProperties).length > 0)
      val.jsonProperties = this.jsonProperties;
    return val;
  }

  /** Collect the Ids of this element's *predecessors* at this level of the class hierarchy.
   * A *predecessor* is an element that had to be inserted before this element could have been inserted.
   * This is important for cloning operations but can be useful in other situations as well.
   * @param predecessorIds The Id64Set to populate with predecessor Ids.
   * @note In order to clone/transform an element, all predecessor elements must have been previously cloned and remapped within the [IModelCloneContext]($backend).
   * @note This should be overridden (with `super` called) at each level the class hierarchy that introduces predecessors.
   * @see getPredecessorIds
   * @beta
   */
  protected collectPredecessorIds(predecessorIds: Id64Set): void {
    predecessorIds.add(this.model); // The modeledElement is a predecessor
    if (this.code.scope && Id64.isValidId64(this.code.scope))
      predecessorIds.add(this.code.scope); // The element that scopes the code is a predecessor
    if (this.parent)
      predecessorIds.add(this.parent.id); // A parent element is a predecessor
  }

  /** Get the Ids of this element's *predecessors*. A *predecessor* is an element that had to be inserted before this element could have been inserted.
   * This is important for cloning operations but can be useful in other situations as well.
   * @see collectPredecessorIds
   * @beta
   */
  public getPredecessorIds(): Id64Set {
    const predecessorIds = new Set<Id64String>();
    this.collectPredecessorIds(predecessorIds);
    return predecessorIds;
  }

  /** Get the class metadata for this element. */
  public getClassMetaData(): EntityMetaData | undefined { return this.iModel.classMetaDataRegistry.find(this.classFullName); }

  private getAllUserProperties(): any { if (!this.jsonProperties.UserProps) this.jsonProperties.UserProps = new Object(); return this.jsonProperties.UserProps; }

  /** Get a set of JSON user properties by namespace */
  public getUserProperties(namespace: string) { return this.getAllUserProperties()[namespace]; }

  /** Change a set of user JSON properties of this Element by namespace. */
  public setUserProperties(nameSpace: string, value: any) { this.getAllUserProperties()[nameSpace] = value; }

  /** Remove a set of JSON user properties, specified by namespace, from this Element */
  public removeUserProperties(nameSpace: string) { delete this.getAllUserProperties()[nameSpace]; }

  /** Get a JSON property of this element, by namespace */
  public getJsonProperty(nameSpace: string): any { return this.jsonProperties[nameSpace]; }
  public setJsonProperty(nameSpace: string, value: any) { this.jsonProperties[nameSpace] = value; }

  /** Get a display label for this Element. By default returns userLabel if present, otherwise code value. */
  public getDisplayLabel(): string { return this.userLabel ?? this.code.value; }

  /** Get a list of HTML strings that describe this Element for the tooltip. Strings will be listed on separate lines in the tooltip.
   * Any instances of the pattern `%{tag}` will be replaced by the localized value of tag.
   */
  public getToolTipMessage(): string[] {
    const addKey = (key: string) => `<b>%{iModelJs:Element.${key}}:</b> `; // %{iModelJs:Element.xxx} is replaced with localized value of xxx in frontend.
    const msg: string[] = [];
    const display = this.getDisplayLabel();
    msg.push(display ? display : `${addKey("Id") + this.id}, ${addKey("Type")}${this.className}`);

    if (this instanceof GeometricElement)
      msg.push(addKey("Category") + this.iModel.elements.getElement(this.category).getDisplayLabel());

    msg.push(addKey("Model") + this.iModel.elements.getElement(this.model).getDisplayLabel());
    return msg;
  }

  /** Insert this Element into the iModel. */
  public insert() { return this.iModel.elements.insertElement(this); }
  /** Update this Element in the iModel. */
  public update() { this.iModel.elements.updateElement(this); }
  /** Delete this Element from the iModel. */
  public delete() { this.iModel.elements.deleteElement(this.id); }

  /** Add a request for locks, code reservations, and anything else that would be needed to carry out the specified operation.
   * @param opcode The operation that will be performed on the element.
   */
  public buildConcurrencyControlRequest(opcode: DbOpcode): void {
    if (this.iModel.isBriefcaseDb()) {
      this.iModel.concurrencyControl.buildRequestForElement(this, opcode);
    }
  }
}

/** An abstract base class to model real world entities that intrinsically have geometry.
 * @public
 */
export abstract class GeometricElement extends Element implements GeometricElementProps {
  /** @internal */
  public static get className(): string { return "GeometricElement"; }
  /** The Id of the [[Category]] for this GeometricElement. */
  public category: Id64String;
  /** The GeometryStream for this GeometricElement. */
  public geom?: GeometryStreamProps;
  /** The origin, orientation, and bounding box of this GeometricElement. */
  public abstract get placement(): Placement2d | Placement3d;

  /** @internal */
  public constructor(props: GeometricElementProps, iModel: IModelDb) {
    super(props, iModel);
    this.category = Id64.fromJSON(props.category);
    this.geom = props.geom;
  }

  /** Type guard for instanceof [[GeometricElement3d]] */
  public is3d(): this is GeometricElement3d { return this instanceof GeometricElement3d; }
  /** Type guard for instanceof [[GeometricElement2d]] */
  public is2d(): this is GeometricElement2d { return this instanceof GeometricElement2d; }
  /** Get the [Transform]($geometry) from the Placement of this GeometricElement */
  public getPlacementTransform(): Transform { return this.placement.transform; }
  public calculateRange3d(): AxisAlignedBox3d { return this.placement.calculateRange(); }

  /** @internal */
  public toJSON(): GeometricElementProps {
    const val = super.toJSON() as GeometricElementProps;
    val.category = this.category;
    if (this.geom)
      val.geom = this.geom;
    return val;
  }
  /** @internal */
  protected collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    predecessorIds.add(this.category);
    // TODO: GeometryPartIds?
  }
}

/** An abstract base class to model real world entities that intrinsically have 3d geometry.
 * See [how to create a GeometricElement3d]($docs/learning/backend/CreateElements.md#GeometricElement3d).
 * @public
 */
export abstract class GeometricElement3d extends GeometricElement implements GeometricElement3dProps {
  /** @internal */
  public static get className(): string { return "GeometricElement3d"; }
  public placement: Placement3d;
  public typeDefinition?: TypeDefinition;

  /** @internal */
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) {
    super(props, iModel);
    this.placement = Placement3d.fromJSON(props.placement);
    if (props.typeDefinition)
      this.typeDefinition = TypeDefinition.fromJSON(props.typeDefinition);
  }

  /** @internal */
  public toJSON(): GeometricElement3dProps {
    const val = super.toJSON() as GeometricElement3dProps;
    val.placement = this.placement;
    if (undefined !== this.typeDefinition) { val.typeDefinition = this.typeDefinition; }
    return val;
  }

  /** @internal */
  protected collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    if (undefined !== this.typeDefinition) { predecessorIds.add(this.typeDefinition.id); }
  }
}

/** A 3d Graphical Element
 * @public
 */
export abstract class GraphicalElement3d extends GeometricElement3d {
  /** @internal */
  public static get className(): string { return "GraphicalElement3d"; }
  /** @internal */
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) { super(props, iModel); }
}

/** An abstract base class to model information entities that intrinsically have 2d geometry.
 * @public
 */
export abstract class GeometricElement2d extends GeometricElement implements GeometricElement2dProps {
  /** @internal */
  public static get className(): string { return "GeometricElement2d"; }
  public placement: Placement2d;
  public typeDefinition?: TypeDefinition;

  /** @internal */
  public constructor(props: GeometricElement2dProps, iModel: IModelDb) {
    super(props, iModel);
    this.placement = Placement2d.fromJSON(props.placement);
    if (props.typeDefinition)
      this.typeDefinition = TypeDefinition.fromJSON(props.typeDefinition);
  }

  /** @internal */
  public toJSON(): GeometricElement2dProps {
    const val = super.toJSON() as GeometricElement2dProps;
    val.placement = this.placement;
    if (undefined !== this.typeDefinition) { val.typeDefinition = this.typeDefinition; }
    return val;
  }

  /** @internal */
  protected collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    if (undefined !== this.typeDefinition) { predecessorIds.add(this.typeDefinition.id); }
  }
}

/** An abstract base class for 2d Geometric Elements that are used to convey information within graphical presentations (like drawings).
 * @public
 */
export abstract class GraphicalElement2d extends GeometricElement2d {
  /** @internal */
  public static get className(): string { return "GraphicalElement2d"; }
  /** @internal */
  public constructor(props: GeometricElement2dProps, iModel: IModelDb) { super(props, iModel); }
}

/** 2d element used to annotate drawings and sheets.
 * @public
 */
export class AnnotationElement2d extends GraphicalElement2d {
  /** @internal */
  public static get className(): string { return "AnnotationElement2d"; }
  /** @internal */
  public constructor(props: GeometricElement2dProps, iModel: IModelDb) { super(props, iModel); }
}

/** 2d element used to persist graphics for use in drawings.
 * @public
 */
export class DrawingGraphic extends GraphicalElement2d {
  /** @internal */
  public static get className(): string { return "DrawingGraphic"; }
  /** @internal */
  public constructor(props: GeometricElement2dProps, iModel: IModelDb) { super(props, iModel); }
}

/** 2D Text Annotation
 * @public
 */
export class TextAnnotation2d extends AnnotationElement2d {
  /** @internal */
  public static get className(): string { return "TextAnnotation2d"; }
  /** @internal */
  public constructor(props: GeometricElement2dProps, iModel: IModelDb) { super(props, iModel); }
}

/** 3D Text Annotation
 * @public
 */
export class TextAnnotation3d extends GraphicalElement3d {
  /** @internal */
  public static get className(): string { return "TextAnnotation3d"; }
  /** @internal */
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) { super(props, iModel); }
}

/** An Element that occupies real world space. Its coordinates are in the project space of its iModel.
 * @public
 */
export abstract class SpatialElement extends GeometricElement3d {
  /** @internal */
  public static get className(): string { return "SpatialElement"; }
  /** @internal */
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) { super(props, iModel); }
}

/** An Element that is spatially located, has mass, and can be *touched*.
 * @public
 */
export abstract class PhysicalElement extends SpatialElement {
  /** @internal */
  public static get className(): string { return "PhysicalElement"; }
  /** If defined, the [[PhysicalMaterial]] that makes up this PhysicalElement. */
  public physicalMaterial?: RelatedElement;
  /** @internal */
  public constructor(props: PhysicalElementProps, iModel: IModelDb) {
    super(props, iModel);
    this.physicalMaterial = RelatedElement.fromJSON(props.physicalMaterial);
  }
  /** @internal */
  public toJSON(): PhysicalElementProps {
    const val = super.toJSON() as PhysicalElementProps;
    val.physicalMaterial = this.physicalMaterial?.toJSON();
    return val;
  }
}

/** Identifies a *tracked* real world location but has no mass and cannot be *touched*.
 * @public
 */
export abstract class SpatialLocationElement extends SpatialElement {
  /** @internal */
  public static get className(): string { return "SpatialLocationElement"; }
  /** @internal */
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) { super(props, iModel); }
}

/** A Volume Element is a Spatial Location Element that is restricted to defining a volume.
 * @public
 */
export class VolumeElement extends SpatialLocationElement {
  /** @internal */
  public static get className(): string { return "VolumeElement"; }
  /** @internal */
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) { super(props, iModel); }
}

/** A SectionDrawingLocation element identifies the location of a [[SectionDrawing]] in the context of a [[SpatialModel]].
 * @note The associated ECClass was added to the BisCore schema in version 1.0.11.
 * @public
 */
export class SectionDrawingLocation extends SpatialLocationElement {
  /** The Id of the [[ViewDefinition]] to which this location refers. */
  public sectionView: RelatedElement;

  /** @internal */
  public static get className(): string { return "SectionDrawingLocation"; }

  public constructor(props: SectionDrawingLocationProps, iModel: IModelDb) {
    super(props, iModel);
    this.sectionView = RelatedElement.fromJSON(props.sectionView) ?? RelatedElement.none;
  }

  /** @internal */
  public toJSON(): SectionDrawingLocationProps {
    return {
      ...super.toJSON(),
      sectionView: this.sectionView.toJSON(),
    };
  }
}

/** Information Content Element is an abstract base class for modeling pure information entities. Only the
 * core framework should directly subclass from Information Content Element. Domain and application developers
 * should start with the most appropriate subclass of Information Content Element.
 * @public
 */
export abstract class InformationContentElement extends Element {
  /** @internal */
  public static get className(): string { return "InformationContentElement"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Element used in conjunction with bis:ElementDrivesElement relationships to bundle multiple inputs before
 * driving the output element.
 * @beta
 */
export abstract class DriverBundleElement extends InformationContentElement {
  /** @internal */
  public static get className(): string { return "DriverBundleElement"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Information Reference is an abstract base class for modeling entities whose main purpose is to reference something else.
 * @public
 */
export abstract class InformationReferenceElement extends InformationContentElement {
  /** @internal */
  public static get className(): string { return "InformationReferenceElement"; }
  /** @internal */
  public constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** A Subject is an information element that describes what this repository (or part thereof) is about.
 * See [how to create a Subject element]$(docs/learning/backend/CreateElements.md#Subject).
 * @public
 */
export class Subject extends InformationReferenceElement implements SubjectProps {
  /** @internal */
  public static get className(): string { return "Subject"; }
  public description?: string;
  /** @internal */
  public constructor(props: SubjectProps, iModel: IModelDb) { super(props, iModel); }
  /** @internal */
  public toJSON(): SubjectProps { // This override only specializes the return type
    return super.toJSON() as SubjectProps; // Entity.toJSON takes care of auto-handled properties
  }
  /** Create a Code for a Subject given a name that is meant to be unique within the scope of its parent Subject.
   * @param iModelDb The IModelDb
   * @param parentSubjectId The Id of the parent Subject that provides the scope for names of its child Subjects.
   * @param codeValue The child Subject name
   */
  public static createCode(iModelDb: IModelDb, parentSubjectId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModelDb.codeSpecs.getByName(BisCodeSpec.subject);
    return new Code({ spec: codeSpec.id, scope: parentSubjectId, value: codeValue });
  }
  /** Create a Subject
   * @param iModelDb The IModelDb
   * @param parentSubjectId The new Subject will be a child of this Subject
   * @param name The name (codeValue) of the Subject
   * @param description The optional description of the Subject
   * @returns The newly constructed Subject
   * @throws [[IModelError]] if there is a problem creating the Subject
   */
  public static create(iModelDb: IModelDb, parentSubjectId: Id64String, name: string, description?: string): Subject {
    const subjectProps: SubjectProps = {
      classFullName: this.classFullName,
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsSubjects(parentSubjectId),
      code: this.createCode(iModelDb, parentSubjectId, name),
      description,
    };
    return new Subject(subjectProps, iModelDb);
  }
  /** Insert a Subject
   * @param iModelDb Insert into this IModelDb
   * @param parentSubjectId The new Subject will be inserted as a child of this Subject
   * @param name The name (codeValue) of the Subject
   * @param description The optional description of the Subject
   * @returns The Id of the newly inserted Subject
   * @throws [[IModelError]] if there is a problem inserting the Subject
   */
  public static insert(iModelDb: IModelDb, parentSubjectId: Id64String, name: string, description?: string): Id64String {
    const subject = this.create(iModelDb, parentSubjectId, name, description);
    return iModelDb.elements.insertElement(subject);
  }
}

/** An InformationContentElement that identifies the content of a document.
 * The realized form of a document is called a DocumentCarrier (different class than Document).
 * For example, a will is a legal document. The will published into a PDF file is an ElectronicDocumentCopy.
 * The will printed onto paper is a PrintedDocumentCopy.
 * In this example, the Document only identifies, names, and tracks the content of the will.
 * @public
 */
export abstract class Document extends InformationContentElement {
  /** @internal */
  public static get className(): string { return "Document"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** A document that represents a drawing, that is, a two-dimensional graphical representation of engineering data. A Drawing element is usually modelled by a [[DrawingModel]].
 * @public
 */
export class Drawing extends Document {
  /** @internal */
  public static get className(): string { return "Drawing"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }

  /** Create a Code for a Drawing given a name that is meant to be unique within the scope of the specified DocumentListModel.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the DocumentListModel that contains the Drawing and provides the scope for its name.
   * @param codeValue The Drawing name
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.drawing);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /** Insert a Drawing element and a DrawingModel that breaks it down.
   * @param iModelDb Insert into this iModel
   * @param documentListModelId Insert the new Drawing into this DocumentListModel
   * @param name The name of the Drawing.
   * @returns The Id of the newly inserted Drawing element and the DrawingModel that breaks it down (same value).
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, documentListModelId: Id64String, name: string): Id64String {
    const drawingProps: ElementProps = {
      classFullName: this.classFullName,
      model: documentListModelId,
      code: this.createCode(iModelDb, documentListModelId, name),
    };
    const drawingId: Id64String = iModelDb.elements.insertElement(drawingProps);
    const model: DrawingModel = iModelDb.models.createModel({
      classFullName: DrawingModel.classFullName,
      modeledElement: { id: drawingId },
    });
    return iModelDb.models.insertModel(model);
  }
}

/** A document that represents a section drawing, that is, a graphical documentation derived from a planar
 * section of a spatial view. A SectionDrawing element is modelled by a [[SectionDrawingModel]] or a [[GraphicalModel3d]].
 * @public
 */
export class SectionDrawing extends Drawing {
  /** The type of section used to generate the drawing. */
  public sectionType: SectionType;
  /** The spatial view from which the section was generated. */
  public spatialView: RelatedElement;

  /** @internal */
  public static get className(): string { return "SectionDrawing"; }

  /** @internal */
  constructor(props: SectionDrawingProps, iModel: IModelDb) {
    super(props, iModel);
    this.sectionType = JsonUtils.asInt(props.sectionType, SectionType.Section);
    this.spatialView = RelatedElement.fromJSON(props.spatialView) ?? RelatedElement.none;
  }

  /** @internal */
  public toJSON(): SectionDrawingProps {
    return {
      ...super.toJSON(),
      sectionType: this.sectionType,
      spatialView: this.spatialView.toJSON(),
    };
  }
}

/** The template for a SheetBorder
 * @public
 */
export class SheetBorderTemplate extends Document implements SheetBorderTemplateProps {
  /** @internal */
  public static get className(): string { return "SheetBorderTemplate"; }
  public height?: number;
  public width?: number;
  /** @internal */
  public constructor(props: SheetBorderTemplateProps, iModel: IModelDb) { super(props, iModel); }
}

/** The template for a [[Sheet]]
 * @public
 */
export class SheetTemplate extends Document implements SheetTemplateProps {
  /** @internal */
  public static get className(): string { return "SheetTemplate"; }
  public height?: number;
  public width?: number;
  public border?: Id64String;
  /** @internal */
  constructor(props: SheetTemplateProps, iModel: IModelDb) { super(props, iModel); }
  /** @internal */
  protected collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    if (undefined !== this.border) { predecessorIds.add(this.border); }
  }
}

/** A digital representation of a *sheet of paper*. Modeled by a [[SheetModel]].
 * @public
 */
export class Sheet extends Document implements SheetProps {
  /** @internal */
  public static get className(): string { return "Sheet"; }
  public height: number;
  public width: number;
  public scale?: number;
  public sheetTemplate?: Id64String;
  /** @internal */
  constructor(props: SheetProps, iModel: IModelDb) {
    super(props, iModel);
    this.height = JsonUtils.asDouble(props.height);
    this.width = JsonUtils.asDouble(props.width);
    this.scale = props.scale;
    this.sheetTemplate = props.sheetTemplate ? Id64.fromJSON(props.sheetTemplate) : undefined;
  }
  /** @internal */
  protected collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    if (undefined !== this.sheetTemplate) { predecessorIds.add(this.sheetTemplate); }
  }
  /** Create a Code for a Sheet given a name that is meant to be unique within the scope of the specified DocumentListModel.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the DocumentListModel that contains the Sheet and provides the scope for its name.
   * @param codeValue The Sheet name
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.sheet);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }
}

/** An Information Carrier carries information, but is not the information itself. For example, the arrangement
 * of ink on paper or the sequence of electronic bits are information carriers.
 * @deprecated BisCore will focus on the information itself and not how it is carried.
 * @note This TypeScript class should not be removed until the (deprecated) InformationCarrierElement class is removed from the BisCore schema.
 * @internal
 */
export abstract class InformationCarrierElement extends Element {
  /** @internal */
  public static get className(): string { return "InformationCarrierElement"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** An Information Carrier that carries a Document. An electronic file is a good example.
 * @deprecated BisCore will focus on the information itself and not how it is carried.
 * @note This TypeScript class should not be removed until the (deprecated) DocumentCarrier class is removed from the BisCore schema.
 * @internal
 */
export abstract class DocumentCarrier extends InformationCarrierElement {  // eslint-disable-line deprecation/deprecation
  /** @internal */
  public static get className(): string { return "DocumentCarrier"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Information Record Element is an abstract base class for modeling information records. Information Record
 * Element is the default choice if no other subclass of Information Content Element makes sense.
 * @public
 */
export abstract class InformationRecordElement extends InformationContentElement {
  /** @internal */
  public static get className(): string { return "InformationRecordElement"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** A Definition Element holds configuration-related information that is meant to be referenced / shared.
 * @public
 */
export abstract class DefinitionElement extends InformationContentElement implements DefinitionElementProps {
  /** @internal */
  public static get className(): string { return "DefinitionElement"; }
  /** If true, don't show this DefinitionElement in user interface lists. */
  public isPrivate: boolean;
  /** @internal */
  constructor(props: DefinitionElementProps, iModel: IModelDb) { super(props, iModel); this.isPrivate = true === props.isPrivate; }
  /** @internal */
  public toJSON(): DefinitionElementProps {
    const val = super.toJSON() as DefinitionElementProps;
    val.isPrivate = this.isPrivate;
    return val;
  }
}

/** This abstract class unifies DefinitionGroup and DefinitionContainer for relationship endpoint purposes.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.10
 * @public
 */
export abstract class DefinitionSet extends DefinitionElement {
  /** @internal */
  public static get className(): string { return "DefinitionSet"; }
}

/** A DefinitionContainer exclusively owns a set of DefinitionElements contained within its sub-model (of type DefinitionModel).
 * @note The associated ECClass was added to the BisCore schema in version 1.0.10
 * @public
 */
export class DefinitionContainer extends DefinitionSet {
  /** @internal */
  public static get className(): string { return "DefinitionContainer"; }
  /** Create a DefinitionContainer
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that will contain this DefinitionContainer element.
   * @param code The Code for this DefinitionContainer.
   * @param isPrivate The optional hint, that if `true` means it should not be displayed in the UI.
   * @returns The newly constructed DefinitionContainer
   * @note There is not a predefined CodeSpec for DefinitionContainer elements, so it is the responsibility of the domain or application to create one.
   * @throws [[IModelError]] if there is a problem creating the DefinitionContainer
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, code: Code, isPrivate?: boolean): DefinitionContainer {
    const elementProps: DefinitionElementProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code,
      isPrivate,
    };
    return new DefinitionContainer(elementProps, iModelDb);
  }
  /** Insert a DefinitionContainer and its sub-model.
   * @param iModelDb Insert into this IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that will contain this DefinitionContainer element.
   * @param code The Code for this DefinitionContainer.
   * @param isPrivate The optional hint, that if `true` means it should not be displayed in the UI.
   * @returns The Id of the newly inserted DefinitionContainer and its newly inserted sub-model (of type DefinitionModel).
   * @note There is not a predefined CodeSpec for DefinitionContainer elements, so it is the responsibility of the domain or application to create one.
   * @throws [[IModelError]] if there is a problem inserting the DefinitionContainer
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, code: Code, isPrivate?: boolean): Id64String {
    const containerElement = this.create(iModelDb, definitionModelId, code, isPrivate);
    const containerElementId = iModelDb.elements.insertElement(containerElement);
    const containerSubModelProps: ModelProps = {
      classFullName: DefinitionModel.classFullName,
      modeledElement: { id: containerElementId },
      isPrivate,
    };
    iModelDb.models.insertModel(containerSubModelProps);
    return containerElementId;
  }
}

/** A non-exclusive set of DefinitionElements grouped using the DefinitionGroupGroupsDefinitions relationship.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.10
 * @public
 */
export class DefinitionGroup extends DefinitionSet {
  /** @internal */
  public static get className(): string { return "DefinitionGroup"; }
  /** Create a DefinitionGroup
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that will contain this DefinitionGroup element.
   * @param code The Code for this DefinitionGroup
   * @param isPrivate The optional hint, that if `true` means it should not be displayed in the UI.
   * @returns The newly constructed DefinitionGroup
   * @note There is not a predefined CodeSpec for DefinitionGroup elements, so it is the responsibility of the domain or application to create one.
   * @throws [[IModelError]] if there is a problem creating the DefinitionGroup
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, code: Code, isPrivate?: boolean): DefinitionGroup {
    const elementProps: DefinitionElementProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code,
      isPrivate,
    };
    return new DefinitionGroup(elementProps, iModelDb);
  }
}

/** Defines a set of properties (the *type*) that may be associated with an element.
 * @public
 */
export abstract class TypeDefinitionElement extends DefinitionElement implements TypeDefinitionElementProps {
  /** @internal */
  public static get className(): string { return "TypeDefinitionElement"; }
  public recipe?: RelatedElement;
  /** @internal */
  constructor(props: TypeDefinitionElementProps, iModel: IModelDb) { super(props, iModel); }
  /** @internal */
  protected collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    if (undefined !== this.recipe) { predecessorIds.add(this.recipe.id); }
  }
}

/** Defines a recipe for generating instances from a definition.
 * @beta
 */
export abstract class RecipeDefinitionElement extends DefinitionElement {
  /** @internal */
  public static get className(): string { return "RecipeDefinitionElement"; }
  /** @internal */
  constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Defines a set of properties (the *type*) that can be associated with a Physical Element. A Physical
 * Type has a strong correlation with something that can be ordered from a catalog since all instances
 * share a common set of properties.
 * @public
 */
export abstract class PhysicalType extends TypeDefinitionElement {
  /** @internal */
  public static get className(): string { return "PhysicalType"; }
  /** If defined, the [[PhysicalMaterial]] that makes up this PhysicalType. */
  public physicalMaterial?: RelatedElement;
  /** @internal */
  constructor(props: PhysicalTypeProps, iModel: IModelDb) {
    super(props, iModel);
    this.physicalMaterial = RelatedElement.fromJSON(props.physicalMaterial);
  }
  /** @internal */
  public toJSON(): PhysicalTypeProps {
    const val = super.toJSON() as PhysicalTypeProps;
    val.physicalMaterial = this.physicalMaterial?.toJSON();
    return val;
  }
  /** Create a Code for a PhysicalType element given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the DefinitionModel that contains the PhysicalType element and provides the scope for its name.
   * @param codeValue The PhysicalType name
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.physicalType);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }
}

/** Defines a set of properties (the *type*) that can be associated with a spatial location.
 * @public
 */
export abstract class SpatialLocationType extends TypeDefinitionElement {
  /** @internal */
  public static get className(): string { return "SpatialLocationType"; }
  /** @internal */
  constructor(props: TypeDefinitionElementProps, iModel: IModelDb) { super(props, iModel); }

  /** Create a Code for a SpatialLocationType element given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the DefinitionModel that contains the SpatialLocationType element and provides the scope for its name.
   * @param codeValue The SpatialLocationType name
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.spatialLocationType);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }
}

/** A TemplateRecipe3d is a DefinitionElement that has a sub-model that contains the 3d template elements.
 * @beta
 */
export class TemplateRecipe3d extends RecipeDefinitionElement {
  /** @internal */
  public static get className(): string { return "TemplateRecipe3d"; }
  /** @internal */
  public constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
  /** Create a Code for a TemplateRecipe3d given a name that is meant to be unique within the scope of its Model.
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that contains this TemplateRecipe3d element.
   * @param codeValue The name of the TemplateRecipe3d element.
   */
  public static createCode(iModelDb: IModelDb, definitionModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModelDb.codeSpecs.getByName(BisCodeSpec.templateRecipe3d);
    return new Code({ spec: codeSpec.id, scope: definitionModelId, value: codeValue });
  }
  /** Create a TemplateRecipe3d
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that contains this TemplateRecipe3d element.
   * @param name The name (Code.value) of the TemplateRecipe3d
   * @returns The newly constructed TemplateRecipe3d
   * @throws [[IModelError]] if there is a problem creating the TemplateRecipe3d
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, name: string, isPrivate?: boolean): TemplateRecipe3d {
    const elementProps: DefinitionElementProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iModelDb, definitionModelId, name),
      isPrivate,
    };
    return new TemplateRecipe3d(elementProps, iModelDb);
  }
  /** Insert a TemplateRecipe3d and a PhysicalModel (sub-model) that will contain the 3d template elements.
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that contains this TemplateRecipe3d element.
   * @param name The name (Code.value) of the TemplateRecipe3d
   * @returns The Id of the newly inserted TemplateRecipe3d and the PhysicalModel that sub-models it.
   * @throws [[IModelError]] if there is a problem inserting the TemplateRecipe3d or its sub-model.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string, isPrivate?: boolean): Id64String {
    const element = this.create(iModelDb, definitionModelId, name, isPrivate);
    const modeledElementId: Id64String = iModelDb.elements.insertElement(element);
    const modelProps: GeometricModel3dProps = {
      classFullName: PhysicalModel.classFullName,
      modeledElement: { id: modeledElementId },
      isTemplate: true,
    };
    return iModelDb.models.insertModel(modelProps); // will be the same value as modeledElementId
  }
}

/** Defines a set of properties (the *type*) that can be associated with a 2D Graphical Element.
 * @public
 */
export abstract class GraphicalType2d extends TypeDefinitionElement {
  /** @internal */
  public static get className(): string { return "GraphicalType2d"; }
  /** @internal */
  public constructor(props: TypeDefinitionElementProps, iModel: IModelDb) { super(props, iModel); }

  /** Create a Code for a GraphicalType2d element given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the DefinitionModel that contains the GraphicalType2d element and provides the scope for its name.
   * @param codeValue The GraphicalType2d name
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.graphicalType2d);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }
}

/** A recipe that uses a 2D template for creating new instances.
 * @beta
 */
export class TemplateRecipe2d extends RecipeDefinitionElement {
  /** @internal */
  public static get className(): string { return "TemplateRecipe2d"; }
  /** @internal */
  public constructor(props: ElementProps, iModel: IModelDb) { super(props, iModel); }
  /** Create a Code for a TemplateRecipe2d given a name that is meant to be unique within the scope of its Model.
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that contains this TemplateRecipe2d element.
   * @param codeValue The name of the TemplateRecipe2d element.
   */
  public static createCode(iModelDb: IModelDb, definitionModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModelDb.codeSpecs.getByName(BisCodeSpec.templateRecipe2d);
    return new Code({ spec: codeSpec.id, scope: definitionModelId, value: codeValue });
  }
  /** Create a TemplateRecipe2d
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that contains this TemplateRecipe2d element.
   * @param name The name (Code.value) of the TemplateRecipe2d
   * @returns The newly constructed TemplateRecipe2d
   * @throws [[IModelError]] if there is a problem creating the TemplateRecipe2d
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, name: string, isPrivate?: boolean): TemplateRecipe2d {
    const elementProps: DefinitionElementProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iModelDb, definitionModelId, name),
      isPrivate,
    };
    return new TemplateRecipe2d(elementProps, iModelDb);
  }
  /** Insert a TemplateRecipe2d and a DrawingModel (sub-model) that will contain the 2d template elements.
   * @param iModelDb The IModelDb
   * @param definitionModelId The Id of the [DefinitionModel]($backend) that contains this TemplateRecipe2d element.
   * @param name The name (Code.value) of the TemplateRecipe2d
   * @returns The Id of the newly inserted TemplateRecipe2d and the PhysicalModel that sub-models it.
   * @throws [[IModelError]] if there is a problem inserting the TemplateRecipe2d or its sub-model.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string, isPrivate?: boolean): Id64String {
    const element = this.create(iModelDb, definitionModelId, name, isPrivate);
    const modeledElementId: Id64String = iModelDb.elements.insertElement(element);
    const modelProps: GeometricModel2dProps = {
      classFullName: DrawingModel.classFullName,
      modeledElement: { id: modeledElementId },
      isTemplate: true,
    };
    return iModelDb.models.insertModel(modelProps); // will be the same value as modeledElementId
  }
}

/** An abstract base class for elements that establishes a particular modeling perspective for its parent Subject.
 * Instances are always sub-modeled by a specialization of Model of the appropriate modeling perspective.
 * @see [iModel Information Hierarchy]($docs/bis/intro/top-of-the-world), [[Subject]], [[Model]]
 * @public
 */
export abstract class InformationPartitionElement extends InformationContentElement implements InformationPartitionElementProps {
  /** @internal */
  public static get className(): string { return "InformationPartitionElement"; }
  /** A human-readable string describing the intent of the partition. */
  public description?: string;
  /** @internal */
  public constructor(props: InformationPartitionElementProps, iModel: IModelDb) { super(props, iModel); }
  /** @internal */
  public toJSON(): InformationPartitionElementProps { // This override only specializes the return type
    return super.toJSON() as InformationPartitionElementProps; // Entity.toJSON takes care of auto-handled properties
  }
  /** Create a code that can be used for any subclass of InformationPartitionElement.
   * @param iModelDb The IModelDb
   * @param parentSubjectId The Id of the parent Subject that provides the scope for names of its child InformationPartitionElements.
   * @param codeValue The InformationPartitionElement name
   */
  public static createCode(iModel: IModelDb, parentSubjectId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.informationPartitionElement);
    return new Code({ spec: codeSpec.id, scope: parentSubjectId, value: codeValue });
  }
}

/** A DefinitionPartition element establishes a *Definition* modeling perspective for its parent Subject.
 * A DefinitionPartition is always sub-modeled by a DefinitionModel.
 * @see [[DefinitionModel]]
 * @public
 */
export class DefinitionPartition extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "DefinitionPartition"; }
}

/** A DocumentPartition element establishes a *Document* modeling perspective for its parent Subject.
 * A DocumentPartition is always sub-modeled by a DocumentListModel.
 * @see [[DocumentListModel]]
 * @public
 */
export class DocumentPartition extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "DocumentPartition"; }
}

/** A GroupInformationPartition element establishes a *Group Information* modeling perspective for its parent Subject.
 * A GroupInformationPartition is always sub-modeled by a GroupInformationModel.
 * @see [[GroupInformationModel]]
 * @public
 */
export class GroupInformationPartition extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "GroupInformationPartition"; }
}

/** A GraphicalPartition3d element establishes a *3D Graphical* modeling perspective for its parent Subject.
 * A GraphicalPartition3d is always sub-modeled by a GraphicalModel3d.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.8
 * @see [[GraphicalModel3d]]
 * @public
 */
export class GraphicalPartition3d extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "GraphicalPartition3d"; }
}

/** An InformationRecordPartition element establishes a *Information Record* modeling perspective for its parent Subject.
 * A InformationRecordPartition is always sub-modeled by an InformationRecordModel.
 * @see [[InformationRecordModel]]
 * @public
 */
export class InformationRecordPartition extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "InformationRecordPartition"; }
}

/** A LinkPartition element establishes a *Link* modeling perspective for its parent Subject. A LinkPartition is always sub-modeled by a LinkModel.
 * @see [[LinkModel]]
 * @public
 */
export class LinkPartition extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "LinkPartition"; }
}

/** A PhysicalPartition element establishes a *Physical* modeling perspective for its parent Subject. A PhysicalPartition is always sub-modeled by a PhysicalModel.
 * @see [[PhysicalModel]]
 * @public
 */
export class PhysicalPartition extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "PhysicalPartition"; }
}

/** A SpatialLocationPartition element establishes a *SpatialLocation* modeling perspective for its parent Subject.
 * A SpatialLocationPartition is always sub-modeled by a SpatialLocationModel.
 * @see [[SpatialLocationModel]]
 * @public
 */
export class SpatialLocationPartition extends InformationPartitionElement {
  /** @internal */
  public static get className(): string { return "SpatialLocationPartition"; }
}

/** Group Information is an abstract base class for modeling entities whose main purpose is to reference a group of related elements.
 * @public
 */
export abstract class GroupInformationElement extends InformationReferenceElement {
  /** @internal */
  public static get className(): string { return "GroupInformationElement"; }
}

/** An information element that specifies a link.
 * @public
 */
export abstract class LinkElement extends InformationReferenceElement {
  /** @internal */
  public static get className(): string { return "LinkElement"; }
  /** Create a Code for a LinkElement given a name that is meant to be unique within the scope of the specified Model.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the Model that contains the LinkElement and provides the scope for its name.
   * @param codeValue The LinkElement name
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.linkElement);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }
}

/** An information element that specifies a URL link.
 * @public
 */
export class UrlLink extends LinkElement implements UrlLinkProps {
  /** @internal */
  public static get className(): string { return "UrlLink"; }
  public description?: string;
  public url?: string;

  /** @internal */
  public constructor(props: UrlLinkProps, iModel: IModelDb) {
    super(props, iModel);
    this.description = props.description;
    this.url = props.url;
  }

  /** @internal */
  public toJSON(): UrlLinkProps {
    const val = super.toJSON() as UrlLinkProps;
    val.description = this.description;
    val.url = this.url;
    return val;
  }
}

/** Represents a folder-like structure that organizes repositories (typically files) in an external system.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @alpha
 */
export class FolderLink extends UrlLink {
  /** @internal */
  public static get className(): string { return "FolderLink"; }
}

/** An information element that links to a repository.
 * @public
 */
export class RepositoryLink extends UrlLink implements RepositoryLinkProps {
  /** @internal */
  public static get className(): string { return "RepositoryLink"; }
  public repositoryGuid?: GuidString;
  /** @note This property was added to the BisCore schema in version 1.0.13 */
  public format?: string;

  /** @internal */
  public constructor(props: RepositoryLinkProps, iModel: IModelDb) {
    super(props, iModel);
    this.repositoryGuid = props.repositoryGuid;
    this.format = props.format;
  }

  /** @internal */
  public toJSON(): RepositoryLinkProps {
    const val = super.toJSON() as RepositoryLinkProps;
    val.repositoryGuid = this.repositoryGuid;
    val.format = this.format;
    return val;
  }
}

/** An information element that links to an embedded file.
 * @public
 */
export class EmbeddedFileLink extends LinkElement {
  /** @internal */
  public static get className(): string { return "EmbeddedFileLink"; }
}

/** A real world entity is modeled as a Role Element when a set of external circumstances define an important
 * role (one that is worth tracking) that is not intrinsic to the entity playing the role. For example,
 * a person can play the role of a teacher or a rock can play the role of a boundary marker.
 * @public
 */
export abstract class RoleElement extends Element {
  /** @internal */
  public static get className(): string { return "RoleElement"; }
}

/** A Definition Element that specifies a collection of geometry that is meant to be reused across Geometric
 * Element instances. Leveraging Geometry Parts can help reduce file size and improve display performance.
 * @public
 */
export class GeometryPart extends DefinitionElement implements GeometryPartProps {
  /** @internal */
  public static get className(): string { return "GeometryPart"; }
  public geom?: GeometryStreamProps;
  public bbox: ElementAlignedBox3d;
  /** @internal */
  public constructor(props: GeometryPartProps, iModel: IModelDb) {
    super(props, iModel);
    this.geom = props.geom;
    this.bbox = Range3d.fromJSON(props.bbox);
  }

  /** @internal */
  public toJSON(): GeometryPartProps {
    const val = super.toJSON() as GeometryPartProps;
    val.geom = this.geom;
    val.bbox = this.bbox;
    return val;
  }

  /** Create a Code for a GeometryPart element given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the DefinitionModel that contains the GeometryPart element and provides the scope for its name.
   * @param codeValue The GeometryPart name
   * @note GeometryPart elements are not required to be named (have a non-empty Code).
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.geometryPart);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }
}

/** The definition element for a line style
 * @public
 */
export class LineStyle extends DefinitionElement implements LineStyleProps {
  /** @internal */
  public static get className(): string { return "LineStyle"; }
  public description?: string;
  public data!: string;
  /** @internal */
  constructor(props: LineStyleProps, iModel: IModelDb) { super(props, iModel); }

  /** Create a Code for a LineStyle definition given a name that is meant to be unique within the scope of the specified model.
   * @param iModel The IModel
   * @param scopeModelId The Id of the DefinitionModel that contains the LineStyle and provides the scope for its name.
   * @param codeValue The name of the LineStyle
   * @returns A LineStyle Code
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    return new Code({ spec: iModel.codeSpecs.getByName(BisCodeSpec.lineStyle).id, scope: scopeModelId, value: codeValue });
  }
}

/** Describes how to animate a view of a [[GeometricModel]] to show change over time using a [RenderSchedule.Script]($common).
 * @note This class was introduced in version 01.00.13 of the BisCore ECSchema. It should only be used with [[IModelDb]]s containing that version or newer.
 * @public
 */
export class RenderTimeline extends InformationRecordElement {
  /** @internal */
  public static get className(): string { return "RenderTimeline"; }
  /** A human-readable description of the timeline, which may be an empty string. */
  public description: string;
  /** The JSON representation of the instructions for visualizing change over time.
   * @see [RenderSchedule.Script]($common) for the API for working with the script.
   */
  public scriptProps: RenderSchedule.ScriptProps;

  /** @internal */
  protected constructor(props: RenderTimelineProps, iModel: IModelDb) {
    super(props, iModel);
    this.description = props.description ?? "";
    this.scriptProps = RenderTimeline.parseScriptProps(props.script);
  }

  public static fromJSON(props: RenderTimelineProps, iModel: IModelDb): RenderTimeline {
    return new RenderTimeline(props, iModel);
  }

  public toJSON(): RenderTimelineProps {
    const props = super.toJSON() as RenderTimelineProps;
    if (this.description.length > 0)
      props.description = this.description;

    props.script = JSON.stringify(this.scriptProps);
    return props;
  }

  private static parseScriptProps(json: string): RenderSchedule.ScriptProps {
    try {
      return JSON.parse(json);
    } catch (_) {
      return [];
    }
  }

  /** @alpha */
  protected collectPredecessorIds(ids: Id64Set): void {
    super.collectPredecessorIds(ids);
    const script = RenderSchedule.Script.fromJSON(this.scriptProps);
    script?.discloseIds(ids);
  }

  /** @alpha */
  protected static onCloned(context: IModelCloneContext, sourceProps: RenderTimelineProps, targetProps: RenderTimelineProps): void {
    super.onCloned(context, sourceProps, targetProps);
    if (context.isBetweenIModels)
      targetProps.script = JSON.stringify(this.remapScript(context, this.parseScriptProps(targetProps.script)));
  }

  /** Remap Ids when cloning a RenderSchedule.Script between iModels on a DisplayStyle or RenderTimeline.
   * @internal
   */
  public static remapScript(context: IModelCloneContext, input: RenderSchedule.ScriptProps): RenderSchedule.ScriptProps {
    const scriptProps: RenderSchedule.ScriptProps = [];
    if (!Array.isArray(input))
      return scriptProps;

    const elementIds = new OrderedId64Array();
    for (const model of input) {
      const modelId = context.findTargetElementId(model.modelId);
      if (!Id64.isValid(modelId))
        continue;

      model.modelId = modelId;
      scriptProps.push(model);
      for (const element of model.elementTimelines) {
        elementIds.clear();
        for (const sourceId of RenderSchedule.ElementTimeline.getElementIds(element.elementIds)) {
          const targetId = context.findTargetElementId(sourceId);
          if (Id64.isValid(targetId))
            elementIds.insert(targetId);
        }

        element.elementIds = CompressedId64Set.compressIds(elementIds);
      }
    }

    return scriptProps;
  }
}
