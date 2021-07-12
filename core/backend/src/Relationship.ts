/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Relationships
 */

import { DbOpcode, DbResult, Id64, Id64String, Logger } from "@bentley/bentleyjs-core";
import { IModelError, IModelStatus, RelationshipProps, SourceAndTarget } from "@bentley/imodeljs-common";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { ECSqlStatement } from "./ECSqlStatement";
import { Entity } from "./Entity";
import { IModelDb } from "./IModelDb";

export { SourceAndTarget, RelationshipProps } from "@bentley/imodeljs-common"; // for backwards compatibility

const loggerCategory = BackendLoggerCategory.Relationship;

/** Base class for all link table ECRelationships
 * @public
 */
export class Relationship extends Entity implements RelationshipProps {
  /** @internal */
  public static override get className(): string { return "Relationship"; }
  public readonly sourceId: Id64String;
  public readonly targetId: Id64String;

  /** @internal */
  constructor(props: RelationshipProps, iModel: IModelDb) {
    super(props, iModel);
    this.sourceId = Id64.fromJSON(props.sourceId);
    this.targetId = Id64.fromJSON(props.targetId);
  }

  /** @internal */
  public override toJSON(): RelationshipProps {
    const val = super.toJSON() as RelationshipProps;
    val.sourceId = this.sourceId;
    val.targetId = this.targetId;
    return val;
  }

  /**
   * Callback invoked by saveChanges on an ElementDrivesElement relationship when its input has changed or is the output of some upstream relationship whose input has changed.
   * This callback is invoked after the input element has been processed by upstream relationships.
   * A subclass of ElementDrivesElement can re-implement this static method to take some action. onRootChanged may modify the output element only.
   * @param _props The ElementDrivesElement relationship instance.
   * @param _iModel The iModel
   */
  public static onRootChanged(_props: RelationshipProps, _iModel: IModelDb): void { }

  /**
   * Callback invoked by saveChanges on an ElementDrivesElement relationship when the relationship instance has been deleted.
   * A subclass of ElementDrivesElement can re-implement this static method to take some action.
   * @param _props The deleted ElementDrivesElement relationship instance.
   * @param _iModel The iModel
   */
  public static onDeletedDependency(_props: RelationshipProps, _iModel: IModelDb): void { }

  /** Insert this Relationship into the iModel. */
  public insert(): Id64String { return this.iModel.relationships.insertInstance(this); }
  /** Update this Relationship in the iModel. */
  public update() { this.iModel.relationships.updateInstance(this); }
  /** Delete this Relationship from the iModel. */
  public delete() { this.iModel.relationships.deleteInstance(this); }

  public static getInstance<T extends Relationship>(iModel: IModelDb, criteria: Id64String | SourceAndTarget): T { return iModel.relationships.getInstance(this.classFullName, criteria); }

  /** Add a request for the locks that would be needed to carry out the specified operation.
   * @param opcode The operation that will be performed on the Relationship instance.
   */
  public override buildConcurrencyControlRequest(opcode: DbOpcode): void {
    if (this.iModel.isBriefcaseDb()) {
      this.iModel.concurrencyControl.buildRequestForRelationship(this, opcode);
    }
  }
}

/** A Relationship where one Element refers to another Element
 * @public
 */
export class ElementRefersToElements extends Relationship {
  /** @internal */
  public static override get className(): string { return "ElementRefersToElements"; }
  /** Create an instance of the Relationship.
   * @param iModel The iModel that will contain the relationship
   * @param sourceId The sourceId of the relationship, that is, the driver element
   * @param targetId The targetId of the relationship, that is, the driven element
   * @return an instance of the specified class.
   */
  public static create<T extends ElementRefersToElements>(iModel: IModelDb, sourceId: Id64String, targetId: Id64String): T {
    return iModel.relationships.createInstance({ sourceId, targetId, classFullName: this.classFullName }) as T;
  }
  /** Insert a new instance of the Relationship.
   * @param iModel The iModel that will contain the relationship
   * @param sourceId The sourceId of the relationship, that is, the driver element
   * @param targetId The targetId of the relationship, that is, the driven element
   * @return The Id of the inserted Relationship.
   */
  public static insert<T extends ElementRefersToElements>(iModel: IModelDb, sourceId: Id64String, targetId: Id64String): Id64String {
    const relationship: T = this.create(iModel, sourceId, targetId);
    return iModel.relationships.insertInstance(relationship);
  }
}

/** Relates a [[DrawingGraphic]] to the [[Element]] that it represents
 * @public
 */
export class DrawingGraphicRepresentsElement extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "DrawingGraphicRepresentsElement"; }
}

/** Relates a [[GraphicalElement3d]] to the [[Element]] that it represents
 * @public
 */
export class GraphicalElement3dRepresentsElement extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "GraphicalElement3dRepresentsElement"; }
}

/** Relates a [[SynchronizationConfigLink]] to N [[ExternalSource]] instances.
 * Each relationship instance represents an external source processed by the synchronization configuration.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class SynchronizationConfigProcessesSources extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "SynchronizationConfigProcessesSources"; }
}

/** Relates a [[SynchronizationConfigLink]] to *root* [[ExternalSource]] instances.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class SynchronizationConfigSpecifiesRootSources extends SynchronizationConfigProcessesSources {
  /** @internal */
  public static override get className(): string { return "SynchronizationConfigSpecifiesRootSources"; }
}

/** Properties that are common to all types of link table ECRelationships
 * @public
 */
export interface ElementGroupsMembersProps extends RelationshipProps {
  memberPriority: number;
}

/** An ElementRefersToElements relationship where one Element *groups* a set of other Elements.
 * @public
 */
export class ElementGroupsMembers extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "ElementGroupsMembers"; }
  public memberPriority: number;

  constructor(props: ElementGroupsMembersProps, iModel: IModelDb) {
    super(props, iModel);
    this.memberPriority = props.memberPriority;
  }

  public static override create<T extends ElementRefersToElements>(iModel: IModelDb, sourceId: Id64String, targetId: Id64String, memberPriority: number = 0): T {
    const props: ElementGroupsMembersProps = { sourceId, targetId, memberPriority, classFullName: this.classFullName };
    return iModel.relationships.createInstance(props) as T;
  }
}

/** Relates a [[DefinitionGroup]] to its [[DefinitionElement]] members.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.10
 * @public
 */
export class DefinitionGroupGroupsDefinitions extends ElementGroupsMembers {
  /** @internal */
  public static override get className(): string { return "DefinitionGroupGroupsDefinitions"; }
}

/** Represents group membership where the group Element (and its properties) impart information about the member Elements above mere membership.
 * Implies that properties of the group should be considered as properties of its members.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.11
 * @public
 */
export class GroupImpartsToMembers extends ElementGroupsMembers {
  /** @internal */
  public static override get className(): string { return "GroupImpartsToMembers"; }
}

/** Relates an [[ExternalSourceGroup]] to its [[ExternalSource]] members.
 * @note The associated ECClass was added to the BisCore schema in version 1.0.13
 * @beta
 */
export class ExternalSourceGroupGroupsSources extends ElementGroupsMembers {
  /** @internal */
  public static override get className(): string { return "ExternalSourceGroupGroupsSources"; }
}

/** Properties that are common to all types of ElementDrivesElements
 * @beta
 */
export interface ElementDrivesElementProps extends RelationshipProps {
  status: number;
  priority: number;
}

/** A Relationship indicating that one Element *drives* another Element.
 * An ElementDrivesElement relationship defines a one-way "driving" relationship from the source to the target.
 * When the source of an ElementDrivesElement relationship changes, the ElementDrivesElement itself can get a callback, and both the source and target elements can get callbacks.
 * By inserting ElementDrivesElement relationships, an app can create and store an acyclic directed graph of dependencies between elements.
 *
 * # Defining dependencies
 * Create an ElementDrivesElement relationship to specify that the source element drives the target element.
 * For example, to specify that element e1 drives element e2, create a relationship between them like this:
 * ```ts
 *  const ede = ElementDrivesElement.create(iModel, e1id, e2id);
 *  ede.insert();
 * ```
 * This creates a persistent relationship. The fact that e1 drives e2 is persisted in the iModel.
 *
 * # Defining dependency graphs
 * When you create multiple ElementDrivesElement relationships, you create a network of dependencies. The target of one may be the source of another.
 * A change in the content of an DgnElement can therefore trigger changes to many downstream elements.
 *
 * For example, to make element e1 drive element e2 and e2 drive another element, e3, create two relationships like this:
 * ```ts
 *  const ede12 = ElementDrivesElement.create(iModel, e1id, e2id);
 *  const ede23 = ElementDrivesElement.create(iModel, e2id, e3id);
 *  ede12.insert();
 *  ede23.insert();
 * ```
 * Those two relationships create this graph:
 * ```
 * e1 --> e2 --> e3
 * ```
 * Where the "-->" is meant to represent a driving relationship.
 *
 * The order in which you create the relationships does not matter.
 * The graph indicates that e3 depends on e2 and e2 depends on e1.
 *
 * An ElementDrivesElement relationship is between one source element and one target element.
 * Many ElementDrivesElement relationships can point to a given element, and many can point out of it.
 * Thus, you can define many:many relationships.
 * For example:
 * ```ts
 *  const ede12 = ElementDrivesElement.create(iModel, e1id, e2id);
 *  const ede112 = ElementDrivesElement.create(iModel, e11id, e2id);
 *  const ede23 = ElementDrivesElement.create(iModel, e2id, e3id);
 *  const ede231 = ElementDrivesElement.create(iModel, e2id, e31id);
 *  ede12.insert();
 *  ede112.insert();
 *  ede23.insert();
 *  ede231.insert();
 * ```
 * Creates this graph:
 * ```
 * e1        e3
 *    \    /
 *      e2
 *    /    \
 * e11       e31
 * ```
 * e2 depends on both e1 and e11. e2 then drives e3 and e31.
 *
 * In an ElementDrivesElement dependency graph, the relationships are the "edges" and the Elements are the "nodes".
 * The following terms are used when referring to the elements (nodes) in a dependency graph:
 * * Inputs - The sources of all edges that point to the element. This includes all upstream elements that flow into the element.
 * * Outputs - The targets of all edges that point out of the element. This includes all downstream elements.
 *
 * #Subgraph Processing
 * When changes are made, iModel.js finds and processes only the part of the overall graph that is affected. So, for example,
 * suppose we have this graph:
 * ```
 * e1 --> e2 --> e3
 * ```
 * If e1 changes, then the subgraph to be processed is equal to the full graph, as shown.
 *
 * If only e2 changes, then the subgraph to be processed is just:
 * ```
 *       e2 --> e3
 * ```
 * If only e3 changes, then the subgraph consists of e3 by itself.
 *
 * Returning to the second example above, suppose we have this graph:
 * ```
 * e1        e3
 *    \    /
 *      e2
 *    /    \
 * e11       e31
 * ```
 * If e1 is changed, the affected subgraph is:
 * ```
 * e1        e3
 *    \    /
 *      e2
 *         \
 *           e31
 * ```
 * If e2 is changed, the affected subgraph is:
 * ```
 *           e3
 *         /
 *      e2
 *         \
 *           e31
 * ```
 * # Callbacks
 * Once iModel.js has found the affected subgraph to process, it propagates changes through it by making callbacks.
 * Classes for both elements (nodes) and ElementDrivesElements relationships (edges) can receive callbacks.
 *
 * ## ElementDrivesElement Callbacks
 * The following callbacks are invoked on ElementDrivesElement relationship classes (edges):
 * * onRootChanged
 * * onDeletedDependency
 *
 * Note that these are static methods. Their default implementations do nothing.
 * To receive and act on these callbacks, a domain should define a subclass of ElementDrivesElement and use that to create relationships.
 * The subclass should then implement the callbacks that it would like to act on.
 *
 * A ElementDrivesElement subclass callback is expected to make changes to the output element only!
 *
 * ## Element Callbacks
 * The following callbacks are invoked on Element classes (nodes):
 * * Element.onBeforeOutputsHandled
 * * Element.onAllInputsHandled
 *
 * ## Order
 * Callbacks are invoked by BriefcaseDb.saveChanges.
 * They are invoked in dependency (topological) order: driving elements first, then driven elements.
 *
 * Each callback is invoked only once. No matter how many times a given element was changed during the transaction,
 * a callback such as ElementDrivesElement.onRootChanged will be invoked only once.
 * In the same way, no matter how many of its inputs were changed, a callback such as Element.onAllInputsHandled will be
 * invoked only once.
 *
 * For example, suppose we have a graph:
 * ```
 * e1 --> e2 --> e3
 * ```
 *
 * Suppose that e1 is directly modified. No callbacks are made at that time.
 * Later, when BriefcaseDb.saveChanges is called, the following callbacks are made, in order:
 * 1. Element.onBeforeOutputsHandled e1
 * 1. ElementDrivesElement.onRootChanged e1->e2
 * 1. Element.onAllInputsHandled e2
 * 1. ElementDrivesElement.onRootChanged e2->e3
 * 1. Element.onAllInputsHandled e3
 *
 * Suppose that e3 is modified directly and BriefcaseDb.saveChanges is called.
 * Since no input to a relationship was changed, the sub-graph will be empty, and no callbacks will be made.
 *
 * Returning to the second example above, suppose we have this graph:
 * ```
 * e1        e3
 *    \    /
 *      e2
 *    /    \
 * e11       e31
 * ```
 * If e1 is changed and BriefcaseDb.saveChanges is called, the subgraph is:
 * ```
 * e1        e3
 *    \    /
 *      e2
 *         \
 *           e31
 * ```
 * The callbacks are:
 * 1. Element.onBeforeOutputsHandled e1
 * 1. ElementDrivesElement.onRootChanged e1->e2
 * 1. Element.onAllInputsHandled e2
 * 1. ElementDrivesElement.onRootChanged e2->e3
 * 1. Element.onAllInputsHandled e3
 * 1. ElementDrivesElement.onRootChanged e2->e31
 * 1. Element.onAllInputsHandled e31
 *
 * (The ElementDrivesElement.)
 *
 * #Errors
 * Circular dependencies are not permitted. If a cycle is detected, that is treated as a fatal error. All ElementDrivesElement relationships
 * involved in a cycle will have their status set to 1, indicating a failure.
 *
 * A callback may call txnManager.reportError to reject an invalid change. It can classify the error as fatal or just a warning.
 * A callback make set the status value of an ElementDrivesElement instance to 1 to indicate a processing falure in that edge.
 *
 * After BriefcaseDb.saveChanges is called, an app should check db.txns.validationErrors and db.txns.hasFatalError to find out if graph-evaluation failed.
 *
 * @beta
 */
export class ElementDrivesElement extends Relationship implements ElementDrivesElementProps {
  /** @internal */
  public static override get className(): string { return "ElementDrivesElement"; }
  /** Relationship status
   * * 0 indicates no errors. iModel.js sets this after a successful evaluation.
   * * 1 indicates that this driving relationship could not be evaluated. The callback itself can set this to indicate that it failed to process the input changes. Also, iModel.js sets this if it finds that the relationship is part of a circular dependency.
   * * 0x80 The app or callback can set this to tell iModel.js not propagate changes through this relationship.
   */
  public status: number;
  /** Affects the order in which relationships are processed in the case where two relationships have the same output. */
  public priority: number;

  /** @internal */
  constructor(props: ElementDrivesElementProps, iModel: IModelDb) {
    super(props, iModel);
    this.status = props.status;
    this.priority = props.priority;
  }

  public static create<T extends ElementRefersToElements>(iModel: IModelDb, sourceId: Id64String, targetId: Id64String, priority: number = 0): T {
    const props: ElementDrivesElementProps = { sourceId, targetId, priority, status: 0, classFullName: this.classFullName };
    return iModel.relationships.createInstance(props) as T;
  }
}

/** Manages [[Relationship]]s.
 * @public
 */
export class Relationships {
  private _iModel: IModelDb;

  /** @internal */
  constructor(iModel: IModelDb) { this._iModel = iModel; }

  /** Create a new instance of a Relationship.
   * @param props The properties of the new Relationship.
   * @throws [[IModelError]] if there is a problem creating the Relationship.
   */
  public createInstance(props: RelationshipProps): Relationship { return this._iModel.constructEntity<Relationship>(props); }

  /** Check classFullName to ensure it is a link table relationship class. */
  private checkRelationshipClass(classFullName: string) {
    if (!this._iModel.nativeDb.isLinkTableRelationship(classFullName.replace(".", ":"))) {
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `Class '${classFullName}' must be a relationship class and it should be subclass of BisCore:ElementRefersToElements or BisCore:ElementDrivesElement.`, Logger.logWarning, loggerCategory);
    }
  }

  /** Insert a new relationship instance into the iModel. The relationship provided must be subclass of BisCore:ElementRefersToElements or BisCore:ElementDrivesElement.
   * @param props The properties of the new relationship.
   * @returns The Id of the newly inserted relationship.
   * @note The id property of the props object is set as a side effect of this function.
   * @throws [[IModelError]] if unable to insert the relationship instance.
   */
  public insertInstance(props: RelationshipProps): Id64String {
    this.checkRelationshipClass(props.classFullName);
    const val = this._iModel.nativeDb.insertLinkTableRelationship(props);
    if (val.error)
      throw new IModelError(val.error.status, "Error inserting relationship instance", Logger.logWarning, loggerCategory);

    props.id = Id64.fromJSON(val.result);
    return props.id;
  }

  /** Update the properties of an existing relationship instance in the iModel.The relationship provided must be subclass of BisCore:ElementRefersToElements or BisCore:ElementDrivesElement.
   * @param props the properties of the relationship instance to update. Any properties that are not present will be left unchanged.
   * @throws [[IModelError]] if unable to update the relationship instance.
   */
  public updateInstance(props: RelationshipProps): void {
    this.checkRelationshipClass(props.classFullName);
    const error = this._iModel.nativeDb.updateLinkTableRelationship(props);
    if (error !== DbResult.BE_SQLITE_OK)
      throw new IModelError(error, "Error updating relationship instance", Logger.logWarning, loggerCategory);
  }

  /** Delete an Relationship instance from this iModel.The relationship provided must be subclass of BisCore:ElementRefersToElements or BisCore:ElementDrivesElement.
   * @param id The Id of the Relationship to be deleted
   * @throws [[IModelError]]
   */
  public deleteInstance(props: RelationshipProps): void {
    this.checkRelationshipClass(props.classFullName);
    const error = this._iModel.nativeDb.deleteLinkTableRelationship(props);
    if (error !== DbResult.BE_SQLITE_DONE)
      throw new IModelError(error, "", Logger.logWarning, loggerCategory);
  }

  /** Get the props of a Relationship instance
   * @param relClassFullName The full class name of the relationship in the form of "schema:class"
   * @param criteria Either the relationship instanceId or the source and target Ids
   * @throws [IModelError]($common) if the relationship is not found or cannot be loaded.
   * @see tryGetInstanceProps
   */
  public getInstanceProps<T extends RelationshipProps>(relClassFullName: string, criteria: Id64String | SourceAndTarget): T {
    const relationshipProps = this.tryGetInstanceProps<T>(relClassFullName, criteria);
    if (undefined === relationshipProps) {
      throw new IModelError(IModelStatus.NotFound, "Relationship not found", Logger.logWarning, loggerCategory);
    }
    return relationshipProps;
  }

  /** Get the props of a Relationship instance
   * @param relClassFullName The full class name of the relationship in the form of "schema:class"
   * @param criteria Either the relationship instanceId or the source and target Ids
   * @returns The RelationshipProps or `undefined` if the relationship is not found.
   * @note Useful for cases when a relationship may or may not exist and throwing an `Error` would be overkill.
   * @see getInstanceProps
   */
  public tryGetInstanceProps<T extends RelationshipProps>(relClassFullName: string, criteria: Id64String | SourceAndTarget): T | undefined {
    let props: T | undefined;
    if (typeof criteria === "string") {
      props = this._iModel.withPreparedStatement(`SELECT * FROM ${relClassFullName} WHERE ecinstanceid=?`, (stmt: ECSqlStatement) => {
        stmt.bindId(1, criteria);
        return DbResult.BE_SQLITE_ROW === stmt.step() ? stmt.getRow() as T : undefined;
      });
    } else {
      props = this._iModel.withPreparedStatement(`SELECT * FROM ${relClassFullName} WHERE SourceECInstanceId=? AND TargetECInstanceId=?`, (stmt: ECSqlStatement) => {
        stmt.bindId(1, criteria.sourceId);
        stmt.bindId(2, criteria.targetId);
        return DbResult.BE_SQLITE_ROW === stmt.step() ? stmt.getRow() as T : undefined;
      });
    }
    if (undefined !== props) {
      props.classFullName = (props as any).className.replace(".", ":");
    }
    return props;
  }

  /** Get a Relationship instance
   * @param relClassFullName The full class name of the relationship in the form of "schema:class"
   * @param criteria Either the relationship instanceId or the source and target Ids
   * @throws [IModelError]($common) if the relationship is not found or cannot be loaded.
   * @see tryGetInstance
   */
  public getInstance<T extends Relationship>(relClassSqlName: string, criteria: Id64String | SourceAndTarget): T {
    return this._iModel.constructEntity<T>(this.getInstanceProps(relClassSqlName, criteria));
  }

  /** Get a Relationship instance
   * @param relClassFullName The full class name of the relationship in the form of "schema:class"
   * @param criteria Either the relationship instanceId or the source and target Ids
   * @returns The relationship or `undefined` if the relationship is not found.
   * @note Useful for cases when a relationship may or may not exist and throwing an `Error` would be overkill.
   * @see getInstance
   */
  public tryGetInstance<T extends Relationship>(relClassFullName: string, criteria: Id64String | SourceAndTarget): T | undefined {
    const relationshipProps = this.tryGetInstanceProps<T>(relClassFullName, criteria);
    return undefined !== relationshipProps ? this._iModel.constructEntity<T>(relationshipProps) : undefined;
  }
}
