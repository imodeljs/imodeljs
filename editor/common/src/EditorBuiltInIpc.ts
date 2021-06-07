/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { CompressedId64Set, Id64String, IModelStatus } from "@bentley/bentleyjs-core";
import { Matrix3dProps, Range3dProps, TransformProps } from "@bentley/geometry-core";
import { EcefLocationProps, ElementGeometryDataEntry, ElementGeometryInfo, ElementGeometryOpcode, GeometricElementProps, GeometryPartProps } from "@bentley/imodeljs-common";
import { EditCommandIpc } from "./EditorIpc";

/** @alpha */
export const editorBuiltInCmdIds = {
  cmdBasicManipulation: "basicManipulation",
};

/** @alpha */
export interface FlatBufferGeometricElementData {
  /** The geometry stream data */
  entryArray: ElementGeometryDataEntry[];
  /** Whether entries are supplied local to placement transform or in world coordinates */
  isWorld?: boolean;
  /** If true, create geometry that displays oriented to face the camera */
  viewIndependent?: boolean;
}

/** @alpha */
export interface FlatBufferGeometryPartData {
  /** The geometry stream data */
  entryArray: ElementGeometryDataEntry[];
  /** If true, create geometry part with 2d geometry */
  is2dPart?: boolean;
}

/** @alpha */
export interface FlatBufferGeometryFilter {
  /** Optional limit on number of displayable entries to accept */
  maxDisplayable?: number;
  /** Optional array of displayable opCodes to accept */
  accept?: ElementGeometryOpcode[];
  /** Optional array of displayable opCodes to reject */
  reject?: ElementGeometryOpcode[];
  /** Optional geometry type filter
   * curves - true to accept single curves and paths
   * surfaces - true to accept loops, planar regions, open polyfaces, and sheet bodies
   * solids - true to accept capped solids, closed polyfaces, and solid bodies
   */
  geometry?: { curves: boolean, surfaces: boolean, solids: boolean };
}

/** @alpha */
export interface BasicManipulationCommandIpc extends EditCommandIpc {
  deleteElements: (ids: CompressedId64Set) => Promise<IModelStatus>;
  transformPlacement: (ids: CompressedId64Set, transform: TransformProps) => Promise<IModelStatus>;
  rotatePlacement: (ids: CompressedId64Set, matrix: Matrix3dProps, aboutCenter: boolean) => Promise<IModelStatus>;

  /** Create and insert a new geometric element.
   * @param props Properties for the new [GeometricElement]($backend)
   * @param data Optional binary format GeometryStream representation used in lieu of [[GeometricElementProps.geom]].
   * @see [GeometryStream]($docs/learning/common/geometrystream.md), [ElementGeometry]($backend)
   * @throws [[IModelError]] if unable to insert the element
   */
  insertGeometricElement(props: GeometricElementProps, data?: FlatBufferGeometricElementData): Promise<Id64String>;

  /** Create and insert a new geometry part element.
   * @param props Properties for the new [GeometryPart]($backend)
   * @param data Optional binary format GeometryStream representation used in lieu of [[GeometryPartProps.geom]].
   * @see [GeometryStream]($docs/learning/common/geometrystream.md), [ElementGeometry]($backend)
   * @throws [[IModelError]] if unable to insert the element
   */
  insertGeometryPart(props: GeometryPartProps, data?: FlatBufferGeometryPartData): Promise<Id64String>;

  /** Update an existing geometric element.
   * @param propsOrId Properties or element id to update for an existing [GeometricElement]($backend)
   * @param data Optional binary format GeometryStream representation used in lieu of [[GeometricElementProps.geom]].
   * @see [GeometryStream]($docs/learning/common/geometrystream.md), [ElementGeometry]($backend)
   * @throws [[IModelError]] if unable to update the element
   */
  updateGeometricElement(propsOrId: GeometricElementProps | Id64String, data?: FlatBufferGeometricElementData): Promise<void>;

  /** Request geometry from an existing element. Because a GeometryStream can be large and may contain information
   * that is not always useful to frontend code, filter options are provided to restrict what GeometryStreams are returned.
   * For example, a tool may only be interested in a GeometryStream that stores a single CurveCollection.
   * @param id Element id of an existing [GeometricElement]($backend) or [GeometryPart]($backend).
   * @param filter Optional criteria for accepting a GeometryStream.
   * @see [GeometryStream]($docs/learning/common/geometrystream.md), [ElementGeometry]($backend)
   * @throws [[IModelError]] if unable to query the element
   */
  requestElementGeometry(id: Id64String, filter?: FlatBufferGeometryFilter): Promise<ElementGeometryInfo | undefined>;

  /** Update the project extents for the iModel.
   * @param extents New project extents.
   * @throws [[IModelError]] if unable to update the extents property.
   */
  updateProjectExtents: (extents: Range3dProps) => Promise<void>;

  /** Update the position of the iModel on the earth.
   * @param ecefLocation New ecef location properties.
   * @throws [[IModelError]] if unable to update the ecef location property.
   * @note Clears the geographic coordinate reference system of the iModel, should only be called if invalid.
   */
  updateEcefLocation: (ecefLocation: EcefLocationProps) => Promise<void>;
}
