/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert, compareNumbers, IndexMap } from "@bentley/bentleyjs-core";
import { ColorDef, ColorIndex } from "@bentley/imodeljs-common";

/** @internal */
export class ColorMap extends IndexMap<number> {
  private _hasTransparency: boolean = false;

  public constructor() { super(compareNumbers, 0xffff); }

  public hasColor(color: number): boolean { return -1 !== this.indexOf(color); }

  public override insert(color: number): number {
    // The table should never contain a mix of opaque and translucent colors.
    if (this.isEmpty)
      this._hasTransparency = ColorMap.isTranslucent(color);
    else
      assert(ColorMap.isTranslucent(color) === this.hasTransparency);

    return super.insert(color);
  }

  public get hasTransparency(): boolean { return this._hasTransparency; }
  public get isUniform(): boolean { return 1 === this.length; }

  public toColorIndex(index: ColorIndex, indices: number[]): void {
    index.reset();
    if (0 === this.length) {
      assert(false, "empty color map");
      return;
    } else if (1 === this.length) {
      index.initUniform(this._array[0].value);
    } else {
      const colors = new Uint32Array(this.length);
      for (const entry of this._array)
        colors[entry.index] = entry.value;

      index.initNonUniform(colors, indices, this.hasTransparency);
    }
  }

  private static isTranslucent(tbgr: number) {
    return !ColorDef.isOpaque(tbgr);
  }
}
