/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PhysicalMaterial
 */

import { IModelDb, PhysicalMaterial } from "@bentley/imodeljs-backend";
import { DefinitionElementProps } from "@bentley/imodeljs-common";

/** Aggregate is a bis:PhysicalMaterial representing a broad category of coarse to medium grained particulate material typically used in construction as
 * well as base material under foundations, roadways, and railways.
 * @public
 */
export class Aggregate extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Aggregate"; }
  public constructor(props: DefinitionElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Aluminum is a bis:PhysicalMaterial representing aluminum (atomic symbol Al) or one of its alloys.
 * @public
 */
export class Aluminum extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Aluminum"; }
  public constructor(props: DefinitionElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Asphalt is a bis:PhysicalMaterial representing a mixture of a bituminous binder and aggregates. Asphalt is typically used for roadway surfacing.
 * @public
 */
export class Asphalt extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Asphalt"; }
  public constructor(props: DefinitionElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Concrete is a bis:PhysicalMaterial representing a mixture of hydraulic cement, aggregates, water and optionally other materials.
 * @public
 */
export class Concrete extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Concrete"; }
  public constructor(props: DefinitionElementProps, iModel: IModelDb) { super(props, iModel); }
}

/** Steel is a bis:PhysicalMaterial representing an alloy of iron, carbon and other elements.
 * @public
 */
export class Steel extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Steel"; }
  public constructor(props: DefinitionElementProps, iModel: IModelDb) { super(props, iModel); }
}
