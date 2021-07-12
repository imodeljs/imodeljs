/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LinearReferencing
 */

import { assert, DbResult, Id64String } from "@bentley/bentleyjs-core";
import { ECSqlStatement, ElementAspect, IModelDb, PhysicalElement, SpatialLocationElement } from "@bentley/imodeljs-backend";
import { Code, ElementProps, GeometricElement3dProps, IModelError, PhysicalElementProps, RelatedElement } from "@bentley/imodeljs-common";
import {
  ComparisonOption, LinearLocationReference, LinearlyLocatedAttributionProps, LinearlyReferencedAtLocationAspectProps,
  LinearlyReferencedAtLocationProps, LinearlyReferencedFromToLocationAspectProps, LinearlyReferencedFromToLocationProps,
  LinearlyReferencedLocationType, QueryParams, ReferentElementProps,
} from "@bentley/linear-referencing-common";
import { LinearlyReferencedAtLocation, LinearlyReferencedFromToLocation } from "./LinearReferencingElementAspects";
import {
  ILinearLocationLocatesElement, ILinearlyLocatedAlongILinearElement, ILinearlyLocatedAttributesElement, IReferentReferencesElement,
} from "./LinearReferencingRelationships";

/** Base class for Spatial Location Element subclasses representing properties whose value is located along a Linear-Element and only applies to a portion of an Element.
 * @beta
 */
export abstract class LinearlyLocatedAttribution extends SpatialLocationElement implements LinearlyLocatedAttributionProps, LinearlyLocatedBase {
  /** @internal */
  public static override get className(): string { return "LinearlyLocatedAttribution"; }

  public attributedElement?: ILinearlyLocatedAttributesElement;

  public constructor(props: LinearlyLocatedAttributionProps, iModel: IModelDb) {
    super(props, iModel);
    this.attributedElement = RelatedElement.fromJSON(props.attributedElement);
  }

  public getLinearElementId(): Id64String | undefined {
    return LinearlyLocated.getLinearElementId(this.iModel, this.id);
  }
}

/** Base class for Spatial Location Element implementations that are linearly located along a Linear-Element.
 * @beta
 */
export abstract class LinearLocationElement extends SpatialLocationElement implements LinearlyLocatedBase {
  /** @internal */
  public static override get className(): string { return "LinearLocationElement"; }

  public constructor(props: GeometricElement3dProps, iModel: IModelDb) {
    super(props, iModel);
  }

  public getLinearElementId(): Id64String | undefined {
    return LinearlyLocated.getLinearElementId(this.iModel, this.id);
  }
}

/** Linear Referencing Location attached to an Element not inherently Linearly Referenced.
 * @beta
 */
export class LinearLocation extends LinearLocationElement {
  /** @internal */
  public static override get className(): string { return "LinearLocation"; }
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) {
    super(props, iModel);
  }

  private static toProps(modelId: Id64String, categoryId: Id64String): GeometricElement3dProps {
    const props: GeometricElement3dProps = {
      classFullName: LinearLocation.classFullName,
      category: categoryId,
      model: modelId,
      code: Code.createEmpty(),
    };

    return props;
  }

  public static create(iModel: IModelDb, modelId: Id64String, categoryId: Id64String): LinearLocation {
    return new LinearLocation(this.toProps(modelId, categoryId), iModel);
  }

  public static insertFromTo(iModel: IModelDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String {
    const newId = LinearlyLocated.insertFromTo(iModel, this.toProps(modelId, categoryId), linearElementId, fromToPosition);

    ILinearLocationLocatesElement.insert(iModel, newId, locatedElementId);

    return newId;
  }

  public insertFromTo(iModel: IModelDb, linearElementId: Id64String, fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String {
    const newId = LinearlyLocated.insertFromTo(iModel, this, linearElementId, fromToPosition);

    ILinearLocationLocatesElement.insert(iModel, newId, locatedElementId);

    return newId;
  }

  public static insertAt(iModel: IModelDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String {
    const newId = LinearlyLocated.insertAt(iModel, this.toProps(modelId, categoryId), linearElementId, atPosition);

    ILinearLocationLocatesElement.insert(iModel, newId, locatedElementId);

    return newId;
  }

  public insertAt(iModel: IModelDb, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String {
    const newId = LinearlyLocated.insertAt(iModel, this, linearElementId, atPosition);

    ILinearLocationLocatesElement.insert(iModel, newId, locatedElementId);

    return newId;
  }
}

/** Base class for Physical Elements that are inherently linearly located along a Linear-Element.
 * @beta
 */
export abstract class LinearPhysicalElement extends PhysicalElement {
  /** @internal */
  public static override get className(): string { return "LinearPhysicalElement"; }

  public constructor(props: PhysicalElementProps, iModel: IModelDb) {
    super(props, iModel);
  }
}

/** Spatial Location Element that can play the role of a Referent (known location along a Linear-Element).
 * @beta
 */
export abstract class ReferentElement extends SpatialLocationElement implements ReferentElementProps, LinearlyLocatedBase {
  /** @internal */
  public static override get className(): string { return "ReferentElement"; }

  public referencedElement?: IReferentReferencesElement;

  public constructor(props: ReferentElementProps, iModel: IModelDb) {
    super(props, iModel);
    this.referencedElement = RelatedElement.fromJSON(props.referencedElement);
  }

  public getLinearElementId(): Id64String | undefined {
    return LinearlyLocated.getLinearElementId(this.iModel, this.id);
  }
}

/** Referent-implementation turning any bis:SpatialElement not inherently Linearly-Referenced into a Referent for Linear-Referencing purposes.
 * @beta
 */
export class Referent extends ReferentElement {
  /** @internal */
  public static override get className(): string { return "Referent"; }
  public constructor(props: ReferentElementProps, iModel: IModelDb) {
    super(props, iModel);
  }

  private static toProps(modelId: Id64String, categoryId: Id64String, referencedElementId: Id64String): ReferentElementProps {
    const props: ReferentElementProps = {
      classFullName: LinearLocation.classFullName,
      category: categoryId,
      model: modelId,
      code: Code.createEmpty(),
      referencedElement: new IReferentReferencesElement(referencedElementId),
    };

    return props;
  }

  public static create(iModel: IModelDb, modelId: Id64String, categoryId: Id64String, referencedElementId: Id64String): Referent {
    return new Referent(this.toProps(modelId, categoryId, referencedElementId), iModel);
  }

  public static insertAt(iModel: IModelDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, referencedElementId: Id64String): Id64String {
    return LinearlyLocated.insertAt(iModel, this.toProps(modelId, categoryId, referencedElementId), linearElementId, atPosition);
  }

  public insertAt(iModel: IModelDb, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps): Id64String {
    return LinearlyLocated.insertAt(iModel, this, linearElementId, atPosition);
  }
}

abstract class ECSQLGenImpl {
  public abstract genSelect(): string;
  public selectDistinct(): boolean {
    return false;
  }
  public abstract genFromJoin(): string;
  public abstract genWhere(bindVals?: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string;
  public abstract genOrderBy(): string;
}

class AtAndFromToECSQLGenImpl extends ECSQLGenImpl {
  public genSelect(): string {
    return "coalesce(AtLocation.AtPosition.DistanceAlongFromStart, FromToLocation.FromPosition.DistanceAlongFromStart) StartDistanceAlong, " +
      "coalesce(AtLocation.AtPosition.DistanceAlongFromStart, FromToLocation.ToPosition.DistanceAlongFromStart) StopDistanceAlong, " +
      "coalesce(AtLocation.ECInstanceId, FromToLocation.ECInstanceId) LocationAspectId ";
  }
  public override selectDistinct(): boolean {
    return true;
  }
  public genFromJoin(): string {
    return "LEFT JOIN LinearReferencing.LinearlyReferencedAtLocation AtLocation ON LinearlyLocated.InstanceId = AtLocation.Element.Id " +
      "LEFT JOIN LinearReferencing.LinearlyReferencedFromToLocation FromToLocation ON LinearlyLocated.InstanceId = FromToLocation.Element.Id ";
  }
  public genWhere(bindVals: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string {
    const fromCompOp: string = (inclusiveFrom === undefined || inclusiveFrom) ? ">=" : ">";
    const toCompOp: string = (inclusiveTo === undefined || inclusiveTo) ? "<=" : "<";

    let ecSql = "";
    if (from !== undefined && to !== undefined) {
      ecSql += "(AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? AND AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += toCompOp;
      ecSql += " ?) OR (FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? AND FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += toCompOp; ecSql += " ?) " +
        "OR (FromToLocation.ToPosition.DistanceAlongFromStart ";
      ecSql += fromCompOp;
      ecSql += " ? AND FromToLocation.ToPosition.DistanceAlongFromStart "; ecSql += toCompOp;
      ecSql += " ?) OR (FromToLocation.FromPosition.DistanceAlongFromStart <= ? AND FromToLocation.ToPosition.DistanceAlongFromStart >= ?) ";

      bindVals.push(from); bindVals.push(to);
      bindVals.push(from); bindVals.push(to);
      bindVals.push(from); bindVals.push(to);
      bindVals.push(from); bindVals.push(to);
    } else if (from !== undefined) {
      ecSql += "AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? OR FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? ";

      bindVals.push(from);
      bindVals.push(from);
      bindVals.push(from);
    } else if (to !== undefined) {
      ecSql += "AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += toCompOp;
      ecSql += " ? OR FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += toCompOp;
      ecSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart "; ecSql += toCompOp; ecSql += " ? ";

      bindVals.push(to);
      bindVals.push(to);
      bindVals.push(to);
    } else {
      ecSql += "(AtLocation.AtPosition.DistanceAlongFromStart IS NOT NULL) OR ";
      ecSql += "(FromToLocation.FromPosition.DistanceAlongFromStart IS NOT NULL) ";
    }

    return ecSql;
  }
  public genOrderBy(): string {
    return "coalesce(AtLocation.AtPosition.DistanceAlongFromStart, FromToLocation.FromPosition.DistanceAlongFromStart)";
  }
}

class FromToECSQLGenImpl extends ECSQLGenImpl {
  public genSelect(): string {
    return "FromToLocation.FromPosition.DistanceAlongFromStart StartDistanceAlong, FromToLocation.ToPosition.DistanceAlongFromStart StopDistanceAlong, FromToLocation.ECInstanceId LocationAspectId ";
  }
  public genFromJoin(): string {
    return "INNER JOIN LinearReferencing.LinearlyReferencedFromToLocation FromToLocation ON LinearlyLocated.InstanceId = FromToLocation.Element.Id ";
  }
  public genWhere(bindVals: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string {
    const fromCompOp: string = (inclusiveFrom === undefined || inclusiveFrom) ? ">=" : ">";
    const toCompOp: string = (inclusiveTo === undefined || inclusiveTo) ? "<=" : "<";

    let ecSql = "";
    if (from !== undefined && to !== undefined) {
      ecSql += "AND ((FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? AND FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += toCompOp;
      ecSql += " ?) OR (FromToLocation.ToPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? AND FromToLocation.ToPosition.DistanceAlongFromStart "; ecSql += toCompOp;
      ecSql += " ?) OR (FromToLocation.FromPosition.DistanceAlongFromStart <= ? AND FromToLocation.ToPosition.DistanceAlongFromStart >= ?)) ";

      bindVals.push(from); bindVals.push(to);
      bindVals.push(from); bindVals.push(to);
      bindVals.push(from); bindVals.push(to);
    } else if (from !== undefined) {
      ecSql += "AND (FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart "; ecSql += fromCompOp; ecSql += " ?)";

      bindVals.push(from); bindVals.push(from);
    } else if (to !== undefined) {
      ecSql += "AND (FromToLocation.FromPosition.DistanceAlongFromStart "; ecSql += toCompOp;
      ecSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart "; ecSql += toCompOp; ecSql += " ?) ";

      bindVals.push(to); bindVals.push(to);
    } else {
      ecSql += "FromToLocation.FromPosition.DistanceAlongFromStart IS NOT NULL ";
    }

    return ecSql;
  }
  public genOrderBy(): string {
    return "FromToLocation.FromPosition.DistanceAlongFromStart";
  }
}

class AtECSQLGenImpl extends ECSQLGenImpl {
  public genSelect(): string {
    return "AtLocation.AtPosition.DistanceAlongFromStart StartDistanceAlong, AtLocation.AtPosition.DistanceAlongFromStart StopDistanceAlong, AtLocation.ECInstanceId LocationAspectId ";
  }
  public genFromJoin(): string {
    return "INNER JOIN LinearReferencing.LinearlyReferencedAtLocation AtLocation ON LinearlyLocated.InstanceId = AtLocation.Element.Id ";
  }
  public genWhere(bindVals: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string {
    const fromCompOp: string = (inclusiveFrom === undefined || inclusiveFrom) ? ">=" : ">";
    const toCompOp: string = (inclusiveTo === undefined || inclusiveTo) ? "<=" : "<";

    let ecSql = "";
    if (from !== undefined && to !== undefined) {
      ecSql += "AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += fromCompOp;
      ecSql += " ? AND AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += toCompOp; ecSql += " ? ";

      bindVals.push(from); bindVals.push(to);
    } else if (from !== undefined) {
      ecSql += "AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += fromCompOp; ecSql += " ? ";

      bindVals.push(from);
    } else if (to !== undefined) {
      ecSql += "AtLocation.AtPosition.DistanceAlongFromStart "; ecSql += toCompOp; ecSql += " ? ";

      bindVals.push(to);
    } else
      ecSql += "AtLocation.AtPosition.DistanceAlongFromStart IS NOT NULL ";

    return ecSql;
  }
  public genOrderBy(): string {
    return "AtLocation.AtPosition.DistanceAlongFromStart";
  }
}

class QueryLinearLocationsECSQLGen {
  private readonly _params: QueryParams;
  private _ecSql: string;

  private _addSelectClause(impl: ECSQLGenImpl): void {
    let select = "SELECT ";

    if (impl.selectDistinct())
      select += "DISTINCT ";

    select += "LinearlyLocated.InstanceId LinearlyLocatedId, printf('%s:%s', meta.ECSchemaDef.Name, meta.ECClassDef.Name) LinearlyLocatedClassFullName, ";
    select += impl.genSelect();

    this._ecSql += select;
  }

  private _parseClassFullName(classFullName: string): [string, string] | undefined {
    const parts = classFullName.split(":");
    if (parts.length !== 2)
      return undefined;

    return [parts[0], parts[1]];
  }

  private _genLinearlyLocated(): string {
    return "meta.ECSchemaDef JOIN meta.ECClassDef USING meta.SchemaOwnsClasses JOIN " +
      "(SELECT coalesce(Located.TargetECInstanceId, Along.SourceECInstanceId) InstanceId, " +
      "coalesce(Located.TargetECClassId, Along.SourceECClassId) ClassId " +
      "FROM LinearReferencing.ILinearlyLocatedAlongILinearElement Along LEFT JOIN " +
      "LinearReferencing.ILinearLocationLocatesElement Located ON Along.SourceECInstanceId = Located.SourceECInstanceId " +
      "WHERE Along.TargetECInstanceId = ?) LinearlyLocated ON meta.ECClassDef.ECInstanceId = LinearlyLocated.ClassId ";
  }

  private _addFromClause(impl: ECSQLGenImpl/* bvector<double>& bindVals */): void {
    let from = "FROM ";
    from += this._genLinearlyLocated();
    from += impl.genFromJoin();

    this._ecSql += from;
  }

  private _addWhereClause(impl: ECSQLGenImpl, bindVals: any[]) {
    let where = "WHERE ";

    where += impl.genWhere(
      bindVals,
      this._params.fromDistanceAlong,
      (this._params.fromComparisonOption === undefined ||
        this._params.fromComparisonOption === ComparisonOption.Inclusive),
      this._params.toDistanceAlong,
      (this._params.toComparisonOption === undefined ||
        this._params.toComparisonOption === ComparisonOption.Inclusive));

    if (this._params.linearlyLocatedClassFullNames !== undefined) {
      if (where.length > 6)
        where += "AND ";

      if (1 === this._params.linearlyLocatedClassFullNames.length) {
        const classFullName = this._params.linearlyLocatedClassFullNames[0];
        const schemaNameClassName = this._parseClassFullName(classFullName);
        if (schemaNameClassName === undefined)
          throw new IModelError(0, "Invalid full class name");

        where += `meta.ECSchemaDef.Name='${schemaNameClassName[0]}' AND meta.ECClassDef.Name='${schemaNameClassName[1]}' `;
      } else if (1 < this._params.linearlyLocatedClassFullNames.length) {
        where += "(";
        for (const classFullName of this._params.linearlyLocatedClassFullNames) {
          if (classFullName === undefined)
            continue;

          const schemaNameClassName = this._parseClassFullName(classFullName);
          if (schemaNameClassName === undefined)
            continue;

          where += `(meta.ECSchemaDef.Name='${schemaNameClassName[0]}' AND meta.ECClassDef.Name='${schemaNameClassName[1]}') OR `;
        }

        where = where.substr(0, where.length - 4); // Removing last OR
        where += ") ";
      }
    }

    this._ecSql += where;
  }

  private _addOrderByClause(impl: ECSQLGenImpl): void {
    let orderBy = "ORDER BY ";
    orderBy += impl.genOrderBy();

    this._ecSql += orderBy;
  }

  private _createImpl(): ECSQLGenImpl {
    if (this._params.linearlyReferencedLocationTypeFilter === undefined ||
      this._params.linearlyReferencedLocationTypeFilter === LinearlyReferencedLocationType.Any) {
      return new AtAndFromToECSQLGenImpl();
    } else if (this._params.linearlyReferencedLocationTypeFilter === LinearlyReferencedLocationType.FromTo) {
      return new FromToECSQLGenImpl();
    } else {
      return new AtECSQLGenImpl();
    }
  }

  public constructor(params: QueryParams) {
    this._params = params;
    this._ecSql = "";
  }

  public generate(linearElementId: Id64String): [string, any[]] {
    this._ecSql = "";
    const impl = this._createImpl();

    const bindVals: any[] = [linearElementId];
    this._addSelectClause(impl);
    this._addFromClause(impl);
    this._addWhereClause(impl, bindVals);
    this._addOrderByClause(impl);

    return [this._ecSql, bindVals];
  }
}

/** A class offering services for LinearlyLocated elements.
 * @beta
 */
export class LinearlyLocated {
  private static insertBasic(iModel: IModelDb, elProps: ElementProps, linearElementId: Id64String): Id64String {
    const newId = iModel.elements.insertElement(elProps);

    const linearlyLocatedAlongLinearElement =
      ILinearlyLocatedAlongILinearElement.create(iModel, newId, linearElementId);
    linearlyLocatedAlongLinearElement.insert();

    return newId;
  }

  /** Insert a new LinearlyLocated element into an iModel at a specific location along an existing Linear-Element.
   * @param iModel The iModel to insert the new element into.
   * @param elProps The properties of the new element.
   * @param linearElementId The Id of the Linear-Element along which the new LinearlyLocated will be inserted.
   * @param atPosition Linear position.
   * @returns The newly inserted element's Id.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insertAt(iModel: IModelDb, elProps: ElementProps, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps): Id64String {
    const newId: Id64String = this.insertBasic(iModel, elProps, linearElementId);

    LinearlyReferencedAtLocation.insert(iModel, newId, atPosition.atPosition,
      (atPosition.fromReferent === undefined) ? undefined : atPosition.fromReferent.id);

    return newId;
  }

  /** Insert a new LinearlyLocated element into an iModel at a specific from-to location along an existing Linear-Element.
   * @param iModel The iModel to insert the new element into.
   * @param elProps The properties of the new element.
   * @param linearElementId The Id of the Linear-Element along which the new LinearlyLocated will be inserted.
   * @param fromToPosition Linear position.
   * @returns The newly inserted element's Id.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insertFromTo(iModel: IModelDb, elProps: ElementProps, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps): Id64String {
    const newId: Id64String = this.insertBasic(iModel, elProps, linearElementId);

    LinearlyReferencedFromToLocation.insert(iModel, newId,
      fromToPosition.fromPosition, fromToPosition.toPosition,
      (fromToPosition.fromPositionFromReferent === undefined) ? undefined : fromToPosition.fromPositionFromReferent.id,
      (fromToPosition.toPositionFromReferent === undefined) ? undefined : fromToPosition.toPositionFromReferent.id);

    return newId;
  }

  private static getLinearLocations<T>(iModel: IModelDb, linearlyLocatedElementId: Id64String, fullClassName: string): T[] {
    const aspects: ElementAspect[] =
      iModel.elements.getAspects(linearlyLocatedElementId, fullClassName);

    if (aspects.length === 0)
      return [];

    const retVal: T[] = [];
    for (const aspect of aspects) {
      const linearAspect = (aspect as unknown) as T;
      retVal.push(linearAspect);
    }

    return retVal;
  }

  private static queryFirstLinearLocationAspectId(iModel: IModelDb, linearlyLocatedElementId: Id64String, className: string): Id64String | undefined {
    let aspectId: Id64String | undefined;

    iModel.withPreparedStatement(`SELECT ECInstanceId FROM LinearReferencing.${className} WHERE Element.Id=? LIMIT 1`,
      (stmt: ECSqlStatement) => {
        stmt.bindId(1, linearlyLocatedElementId);
        if (stmt.step() === DbResult.BE_SQLITE_ROW)
          aspectId = stmt.getValue(0).getId();
      });

    return aspectId;
  }

  /** Query for LinearlyReferenced AtLocation aspects owned by the specified LinearlyLocated Element.
   * @param iModel The iModel to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query aspects about.
   * @returns Returns an array of LinearlyReferencedAtLocation.
   * @throws [[IModelError]]
   */
  public static getAtLocations(iModel: IModelDb, linearlyLocatedElementId: Id64String): LinearlyReferencedAtLocation[] {
    return this.getLinearLocations<LinearlyReferencedAtLocation>(
      iModel, linearlyLocatedElementId, "LinearReferencing:LinearlyReferencedAtLocation");
  }

  /** Query for the single LinearlyReferenced AtLocation aspect owned by the specified LinearlyLocated Element. If more than one aspect is expected, use [[getAtLocations]] instead.
   * @param iModel The iModel to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query about.
   * @returns Returns an LinearlyReferencedAtLocation or undefined is none is found.
   * @throws [[IModelError]]
   */
  public static getAtLocation(iModel: IModelDb, linearlyLocatedElementId: Id64String): LinearlyReferencedAtLocation | undefined {
    const linearLocations = this.getAtLocations(iModel, linearlyLocatedElementId);
    if (linearLocations.length === 0)
      return undefined;
    else {
      assert(linearLocations.length === 1);
      return linearLocations[0];
    }
  }

  /** Update an existing LinearlyReferencedAtLocation aspect within the iModel.
   * @param iModel The iModel to update.
   * @param linearlyLocatedElementId The Id of the owning Linearly Located Element.
   * @param linearLocationProps The properties to use to update the LinearlyReferencedAtLocation aspect.
   * @param aspectId The Id of the aspect to update. If not known, the first aspectId will be looked-up.
   * @throws [[IModelError]]
   */
  public static updateAtLocation(iModel: IModelDb, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedAtLocationProps,
    aspectId?: Id64String): void {
    let linearLocAspectId: Id64String;
    if (aspectId !== undefined)
      linearLocAspectId = aspectId;
    else {
      linearLocAspectId = this.queryFirstLinearLocationAspectId(iModel, linearlyLocatedElementId, "LinearlyReferencedAtLocation")!;
    }

    const linearLocationAspectProps: LinearlyReferencedAtLocationAspectProps = {
      id: linearLocAspectId,
      element: { id: linearlyLocatedElementId },
      classFullName: "LinearReferencing:LinearlyReferencedAtLocation",
      atPosition: linearLocationProps.atPosition,
      fromReferent: linearLocationProps.fromReferent,
    };

    iModel.elements.updateAspect(linearLocationAspectProps);
  }

  /** Update an existing LinearlyReferencedFromToLocation aspect within the iModel.
   * @param iModel The iModel to update.
   * @param linearlyLocatedElementId The Id of the owning Linearly Located Element.
   * @param linearLocationProps The properties to use to update the LinearlyReferencedFromToLocation aspect.
   * @param aspectId The Id of the aspect to update. If not known, the first aspectId will be looked-up.
   * @throws [[IModelError]]
   */
  public static updateFromToLocation(iModel: IModelDb, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedFromToLocationProps,
    aspectId?: Id64String): void {
    let linearLocAspectId: Id64String;
    if (aspectId !== undefined)
      linearLocAspectId = aspectId;
    else {
      linearLocAspectId = this.queryFirstLinearLocationAspectId(iModel, linearlyLocatedElementId, "LinearlyReferencedFromToLocation")!;
    }

    const linearLocationAspectProps: LinearlyReferencedFromToLocationAspectProps = {
      id: linearLocAspectId,
      element: { id: linearlyLocatedElementId, relClassName: "LinearReferencing:ILinearlyLocatedOwnsFromToLocations" },
      classFullName: "LinearReferencing:LinearlyReferencedFromToLocation",
      fromPosition: linearLocationProps.fromPosition,
      fromPositionFromReferent: linearLocationProps.fromPositionFromReferent,
      toPosition: linearLocationProps.toPosition,
      toPositionFromReferent: linearLocationProps.toPositionFromReferent,
    };

    iModel.elements.updateAspect(linearLocationAspectProps);
  }

  /** Query for the Id of the Linear-Element along which the specified LinearlyLocated Element is located.
   * @param iModel The iModel to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query a Linear-Element for.
   * @returns Returns the Id of the Linear-Element or undefined is none is assigned.
   */
  public static getLinearElementId(iModel: IModelDb, linearlyLocatedElementId: Id64String): Id64String | undefined {
    let linearElementId: Id64String | undefined;
    iModel.withPreparedStatement(
      "SELECT TargetECInstanceId FROM LinearReferencing.ILinearlyLocatedAlongILinearElement WHERE SourceECInstanceId = ?",
      (stmt: ECSqlStatement) => {
        stmt.bindId(1, linearlyLocatedElementId);

        if (DbResult.BE_SQLITE_ROW === stmt.step())
          linearElementId = stmt.getValue(0).getId();
        else
          linearElementId = undefined;
      });

    return linearElementId;
  }

  /** Query for LinearlyReferenced FromToLocation aspects owned by the specified LinearlyLocated Element.
   * @param iModel The iModel to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query aspects about.
   * @returns Returns an array of LinearlyReferencedFromToLocation.
   * @throws [[IModelError]]
   */
  public static getFromToLocations(iModel: IModelDb, linearlyLocatedElementId: Id64String): LinearlyReferencedFromToLocation[] {
    return this.getLinearLocations<LinearlyReferencedFromToLocation>(
      iModel, linearlyLocatedElementId, "LinearReferencing:LinearlyReferencedFromToLocation");
  }

  /** Query for the single LinearlyReferenced FromToLocation aspect owned by the specified LinearlyLocated Element. If more than one aspect is expected, use [[getFromToLocations]] instead.
   * @param iModel The iModel to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query about.
   * @returns Returns an LinearlyReferencedFromToLocation or undefined is none is found.
   * @throws [[IModelError]]
   */
  public static getFromToLocation(iModel: IModelDb, linearlyLocatedElementId: Id64String): LinearlyReferencedFromToLocation | undefined {
    const linearLocations = this.getFromToLocations(iModel, linearlyLocatedElementId);
    if (linearLocations.length === 0)
      return undefined;
    else {
      assert(linearLocations.length === 1);
      return linearLocations[0];
    }
  }
}

/** Base interface to optionally be implemented by Elements inherently Linearly-Located. Implementors should choose the
 * appropriate sub-interface rather than implementing LinearlyLocatedBase directly.
 * @beta
 */
export interface LinearlyLocatedBase {
  getLinearElementId(): Id64String | undefined;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always a single at-position.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedSingleAt extends LinearlyLocatedBase {
  getAtLocation(): LinearlyReferencedAtLocation | undefined;
  updateAtLocation(linearLocation: LinearlyReferencedAtLocationProps, aspectId?: Id64String): void;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always at-positions.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedMultipleAt extends LinearlyLocatedBase {
  getAtLocations(): LinearlyReferencedAtLocation[];
  updateAtLocation(linearLocation: LinearlyReferencedAtLocationProps, aspectId: Id64String): void;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always a single from-to-position.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedSingleFromTo extends LinearlyLocatedBase {
  getFromToLocation(): LinearlyReferencedFromToLocation | undefined;
  updateFromToLocation(linearLocation: LinearlyReferencedFromToLocationProps, aspectId?: Id64String): void;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always from-to-positions.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedMultipleFromTo extends LinearlyLocatedBase {
  getFromToLocations(): LinearlyReferencedFromToLocation[];
  updateFromToLocation(linearLocation: LinearlyReferencedFromToLocationProps, aspectId: Id64String): void;
}

/** A class offering services for linearly-located data along a Linear-Element.
 * @beta
 */
export class LinearElement {
  /** Query for LinearLocationReferences based on specified query parameters.
   * @returns Returns an array of LinearLocationReferences.
   * @throws [[IModelError]]
   */
  public static queryLinearLocations(iModel: IModelDb, linearElementId: Id64String, queryParams: QueryParams): LinearLocationReference[] {
    const ecSqlGen = new QueryLinearLocationsECSQLGen(queryParams);
    const ecsqlAndBindVals = ecSqlGen.generate(linearElementId);

    const linearLocationRefs: LinearLocationReference[] = [];
    iModel.withPreparedStatement(ecsqlAndBindVals[0], (stmt: ECSqlStatement) => {
      stmt.bindValues(ecsqlAndBindVals[1]);

      while (DbResult.BE_SQLITE_ROW === stmt.step()) {
        const linearLocationRef: LinearLocationReference = {
          linearlyLocatedId: stmt.getValue(0).getId(),
          linearlyLocatedClassFullName: stmt.getValue(1).getString(),
          startDistanceAlong: stmt.getValue(2).getDouble(),
          stopDistanceAlong: stmt.getValue(3).getDouble(),
          locationAspectId: stmt.getValue(4).getId(),
        };

        linearLocationRefs.push(linearLocationRef);
      }
    });

    return linearLocationRefs;
  }
}
