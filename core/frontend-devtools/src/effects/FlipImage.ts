/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Effects
 */

import { ScreenSpaceEffectBuilder, Tool, UniformType, VaryingType } from "@bentley/imodeljs-frontend";
import { parseArgs } from "../tools/parseArgs";
import { AddEffectTool, refreshViewportsForEffect } from "./EffectTools";

let flipHorizontal = false;
let flipVertical = false;
let flipColor = false;

/** An extremely simple and mostly useless effect intended to demonstrate the basics of creating a screen-space effect.
 * It flips the Viewport's image on the x and/or y axis, and/or inverts the color of each pixel.
 * @beta
 */
export class FlipImageEffect extends AddEffectTool {
  public static override toolId = "FlipImageEffect";

  protected get effectName() { return "flip"; }
  protected get textureCoordFromPosition() { return true; }

  protected get source() {
    return {
      // Compute texture coordinate for use in fragment shader.
      vertex: `
        void effectMain(vec4 pos) {
          vec2 uv = textureCoordFromPosition(pos);
          if (u_flipHorizontal)
            uv.x = 1.0 - uv.x;

          if (u_flipVertical)
            uv.y = 1.0 - uv.y;

          v_uv = uv;
        }`,
      // Sample the original image to flip on x and/or y axis, then invert its color.
      fragment: `
        vec4 effectMain() {
          vec4 color = sampleSourcePixel();
          if (u_flipColor) {
            color.r = 1.0 - color.r;
            color.g = 1.0 - color.g;
            color.b = 1.0 - color.b;
          }

          return color;
        }`,
      // Because we're moving pixels around, we must tell the render system where the source pixel was originally located - otherwise
      // element locate will not work correctly.
      sampleSourcePixel: "return TEXTURE(u_diffuse, v_uv);",
    };
  }

  protected defineEffect(builder: ScreenSpaceEffectBuilder): void {
    // Don't bother applying the effect if nothing is to be flipped.
    builder.shouldApply = (_context) => flipHorizontal || flipVertical || flipColor;

    // Define the varying for the texture coordinate.
    builder.addVarying("v_uv", VaryingType.Vec2);

    // Hook up the uniforms.
    builder.addUniform({
      name: "u_flipHorizontal",
      type: UniformType.Bool,
      bind: (uniform, _context) => uniform.setUniform1i(flipHorizontal ? 1 : 0),
    });
    builder.addUniform({
      name: "u_flipVertical",
      type: UniformType.Bool,
      bind: (uniform, _context) => uniform.setUniform1i(flipVertical ? 1 : 0),
    });
    builder.addUniform({
      name: "u_flipColor",
      type: UniformType.Bool,
      bind: (uniform, _context) => uniform.setUniform1i(flipColor ? 1 : 0),
    });
  }
}

/** Configure the [[FlipImageEffect]].
 * @beta
 */
export class FlipImageConfig extends Tool {
  public static override toolId = "FlipImageConfig";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 3; }

  public override run(horizontal?: boolean, vertical?: boolean, color?: boolean): boolean {
    flipHorizontal = !!horizontal;
    flipVertical = !!vertical;
    flipColor = !!color;

    refreshViewportsForEffect("fdt flip");
    return true;
  }

  public override parseAndRun(...input: string[]): boolean {
    const args = parseArgs(input);
    return this.run(args.getBoolean("h"), args.getBoolean("v"), args.getBoolean("c"));
  }
}
