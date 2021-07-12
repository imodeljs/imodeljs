/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Analytical
 */

import { GeometricElement3d, IModelDb, InformationPartitionElement, TypeDefinitionElement } from "@bentley/imodeljs-backend";
import { GeometricElement3dProps, TypeDefinitionElementProps } from "@bentley/imodeljs-common";

/** An AnalyticalPartition element indicates that there is a specialized analytical perspective within
 * the overall information hierarchy. An AnalyticalPartition subclass is always parented to a Subject
 * and broken down by an AnalyticalModel.
 * @see [[AnalyticalModel]]
 * @beta
 */
export class AnalyticalPartition extends InformationPartitionElement {
  /** @internal */
  public static override get className(): string { return "AnalyticalPartition"; }
}

/** Spatially located, simulating zero or more SpatialLocationElement or PhysicalElement instances in light of a specialized analytical perspective.
 * @beta
 */
export abstract class AnalyticalElement extends GeometricElement3d {
  /** @internal */
  public static override get className(): string { return "AnalyticalElement"; }
  /** @internal */
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) { super(props, iModel); }
}

/** Defines a shared set of properties (the 'type') that can be associated with an AnalyticalElement.
 * It is not meant to replace a PhysicalType if it is available.
 * @beta
 */
export abstract class AnalyticalType extends TypeDefinitionElement {
  /** @internal */
  public static override get className(): string { return "AnalyticalType"; }
  /** @internal */
  constructor(props: TypeDefinitionElementProps, iModel: IModelDb) { super(props, iModel); }
}
