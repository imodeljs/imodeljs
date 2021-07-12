/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { CompressedId64Set, DbResult, Id64String, IModelStatus } from "@bentley/bentleyjs-core";
import { Matrix3d, Matrix3dProps, Point3d, PointString3d, Range3d, Range3dProps, Transform, TransformProps } from "@bentley/geometry-core";
import { GeometricElement, IModelDb } from "@bentley/imodeljs-backend";
import { BRepEntity, EcefLocation, EcefLocationProps, ElementGeometry, ElementGeometryFunction, ElementGeometryInfo, ElementGeometryRequest, ElementGeometryUpdate, FilePropertyProps, GeometricElementProps, GeometryPartProps, GeometryStreamBuilder, IModelError } from "@bentley/imodeljs-common";
import { BasicManipulationCommandIpc, editorBuiltInCmdIds, FlatBufferGeometricElementData, FlatBufferGeometryFilter, FlatBufferGeometryPartData } from "@bentley/imodeljs-editor-common";
import { EditCommand } from "./EditCommand";

/** @alpha */
export class BasicManipulationCommand extends EditCommand implements BasicManipulationCommandIpc {
  public static override commandId = editorBuiltInCmdIds.cmdBasicManipulation;

  public constructor(iModel: IModelDb, protected _str: string) { super(iModel); }

  public async deleteElements(ids: CompressedId64Set): Promise<IModelStatus> {
    for (const id of CompressedId64Set.iterable(ids))
      this.iModel.elements.deleteElement(id);

    return IModelStatus.Success;
  }

  public async transformPlacement(ids: CompressedId64Set, transProps: TransformProps): Promise<IModelStatus> {
    const transform = Transform.fromJSON(transProps);

    for (const id of CompressedId64Set.iterable(ids)) {
      const element = this.iModel.elements.getElement<GeometricElement>(id);

      if (!element.placement.isValid)
        continue; // Ignore assembly parents w/o geometry, etc...

      element.placement.multiplyTransform(transform);
      this.iModel.elements.updateElement(element);
    }

    return IModelStatus.Success;
  }

  public async rotatePlacement(ids: CompressedId64Set, matrixProps: Matrix3dProps, aboutCenter: boolean): Promise<IModelStatus> {
    const matrix = Matrix3d.fromJSON(matrixProps);

    for (const id of CompressedId64Set.iterable(ids)) {
      const element = this.iModel.elements.getElement<GeometricElement>(id);

      if (!element.placement.isValid)
        continue; // Ignore assembly parents w/o geometry, etc...

      const fixedPoint = aboutCenter ? element.placement.calculateRange().center : Point3d.createFrom(element.placement.origin);
      const transform = Transform.createFixedPointAndMatrix(fixedPoint, matrix);

      element.placement.multiplyTransform(transform);
      this.iModel.elements.updateElement(element);
    }

    return IModelStatus.Success;
  }

  public async insertGeometricElement(props: GeometricElementProps, data?: FlatBufferGeometricElementData): Promise<Id64String> {
    const newElem = this.iModel.elements.createElement(props);
    const newId = this.iModel.elements.insertElement(newElem);
    if (undefined === data)
      return newId;

    const updateProps: ElementGeometryUpdate = {
      elementId: newId,
      entryArray: data.entryArray,
      isWorld: data.isWorld,
      viewIndependent: data.viewIndependent,
    };

    const status = this.iModel.elementGeometryUpdate(updateProps);
    if (DbResult.BE_SQLITE_OK !== status) {
      this.iModel.elements.deleteElement(newId); // clean up element...
      throw new IModelError(status, "Error updating element geometry");
    }

    return newId;
  }

  public async insertGeometryPart(props: GeometryPartProps, data?: FlatBufferGeometryPartData): Promise<Id64String> {
    if (undefined === props.geom && undefined !== data) {
      const builder = new GeometryStreamBuilder();
      builder.appendGeometry(PointString3d.create(Point3d.createZero()));
      props.geom = builder.geometryStream; // can't insert a DgnGeometryPart without geometry...
    }

    const newElem = this.iModel.elements.createElement(props);
    const newId = this.iModel.elements.insertElement(newElem);
    if (undefined === data)
      return newId;

    const updateProps: ElementGeometryUpdate = {
      elementId: newId,
      entryArray: data.entryArray,
      is2dPart: data.is2dPart,
    };

    const status = this.iModel.elementGeometryUpdate(updateProps);
    if (DbResult.BE_SQLITE_OK !== status) {
      this.iModel.elements.deleteElement(newId); // clean up element...
      throw new IModelError(status, "Error updating part geometry");
    }

    return newId;
  }

  public async updateGeometricElement(propsOrId: GeometricElementProps | Id64String, data?: FlatBufferGeometricElementData): Promise<void> {
    let props: GeometricElementProps;
    if (typeof propsOrId === "string") {
      if (undefined === data)
        throw new IModelError(DbResult.BE_SQLITE_ERROR, "Flatbuffer data required for update by id");
      props = this.iModel.elements.getElement<GeometricElement>(propsOrId);
    } else {
      props = propsOrId;
    }

    if (undefined === props.id)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "Element id required for update");

    this.iModel.elements.updateElement(props);
    if (undefined === data)
      return;

    const updateProps: ElementGeometryUpdate = {
      elementId: props.id,
      entryArray: data.entryArray,
      isWorld: data.isWorld,
      viewIndependent: data.viewIndependent,
    };

    const status = this.iModel.elementGeometryUpdate(updateProps);
    if (DbResult.BE_SQLITE_OK !== status) {
      throw new IModelError(status, "Error updating element geometry");
    }
  }

  public async requestElementGeometry(elementId: Id64String, filter?: FlatBufferGeometryFilter): Promise<ElementGeometryInfo | undefined> {
    let accepted;

    const onGeometry: ElementGeometryFunction = (info: ElementGeometryInfo): void => {
      accepted = info;

      if (undefined !== filter) {
        let numDisplayable = 0;

        for (const entry of info.entryArray) {
          if (!ElementGeometry.isDisplayableEntry(entry))
            continue;

          numDisplayable++;
          if (filter.maxDisplayable && numDisplayable > filter.maxDisplayable) {
            accepted = undefined;
            break;
          }

          if (filter.reject && filter.reject.some((opcode) => entry.opcode === opcode)) {
            accepted = undefined;
            break;
          }

          if (filter.accept && !filter.accept.some((opcode) => entry.opcode === opcode)) {
            accepted = undefined;
            break;
          }

          if (undefined === filter.geometry)
            continue;

          let entityType;
          if (filter.geometry.curves && !(filter.geometry.surfaces || filter.geometry.solids))
            entityType = ElementGeometry.isCurve(entry) ? BRepEntity.Type.Wire : undefined; // skip surface/solid opcodes...
          else
            entityType = ElementGeometry.getBRepEntityType(entry);

          switch (entityType) {
            case BRepEntity.Type.Wire:
              if (!filter.geometry.curves)
                accepted = undefined;
              break;
            case BRepEntity.Type.Sheet:
              if (!filter.geometry.surfaces)
                accepted = undefined;
              break;
            case BRepEntity.Type.Solid:
              if (!filter.geometry.solids)
                accepted = undefined;
              break;
            default:
              accepted = undefined;
              break;
          }

          if (undefined === accepted)
            break;
        }
      }
    };

    const requestProps: ElementGeometryRequest = {
      onGeometry,
      elementId,
    };

    if (DbResult.BE_SQLITE_OK !== this.iModel.elementGeometryRequest(requestProps))
      return undefined;

    return accepted;
  }

  public async updateProjectExtents(extents: Range3dProps): Promise<void> {
    const newExtents = new Range3d();
    newExtents.setFromJSON(extents);

    if (newExtents.isNull)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "Invalid project extents");

    this.iModel.updateProjectExtents(newExtents);

    // Set source from calculated to user so connectors preserve the change.
    const unitsProps: FilePropertyProps = { name: "Units", namespace: "dgn_Db" };
    const unitsStr = this.iModel.queryFilePropertyString(unitsProps);

    if (undefined !== unitsStr) {
      const unitsVal = JSON.parse(unitsStr);
      const calculated = 1;

      if (calculated !== unitsVal.extentsSource) {
        unitsVal.extentsSource = calculated;
        this.iModel.saveFileProperty(unitsProps, JSON.stringify(unitsVal));
      }
    }
  }

  public async updateEcefLocation(ecefLocation: EcefLocationProps): Promise<void> {
    // Clear GCS that caller already determined was invalid...
    this.iModel.deleteFileProperty({ name: "DgnGCS", namespace: "dgn_Db" });

    const newEcefLocation = new EcefLocation(ecefLocation);
    this.iModel.updateEcefLocation(newEcefLocation);
  }
}
