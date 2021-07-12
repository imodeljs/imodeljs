/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Analytical
 */

import { ElementRefersToElements } from "@bentley/imodeljs-backend";

/** Relates an AnalyticalElement to the SpatialLocationElement or PhysicalElement it is simulating within the specialized analytical perspective.
 * @beta
 */
export class AnalyticalSimulatesSpatialElement extends ElementRefersToElements {
  /** @internal */
  public static override get className(): string { return "AnalyticalSimulatesSpatialElement"; }
}
