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

/** Applies a [vignette](https://en.wikipedia.org/wiki/Vignetting) effect to the viewport.
 * From https://github.com/TyLindberg/glsl-vignette/blob/master/advanced.glsl.
 * @beta
 */
export class VignetteEffect extends AddEffectTool {
  public static override toolId = "VignetteEffect";

  protected get effectName() { return "Vignette"; }
  protected get textureCoordFromPosition() { return true; }

  protected get source() {
    return {
      vertex: `
        void effectMain(vec4 pos) {
          v_texCoord = textureCoordFromPosition(pos);
        }
      `,
      fragment: `
        float sdSquare(vec2 point, float width) {
          vec2 d = abs(point) - width;
          return min(max(d.x,d.y),0.0) + length(max(d,0.0));
        }

        float vignette(vec2 uv, vec2 size, float roundness, float smoothness) {
          // Center UVs
          uv -= 0.5;

          // Shift UVs based on the larger of width or height
          float minWidth = min(size.x, size.y);
          uv.x = sign(uv.x) * clamp(abs(uv.x) - abs(minWidth - size.x), 0.0, 1.0);
          uv.y = sign(uv.y) * clamp(abs(uv.y) - abs(minWidth - size.y), 0.0, 1.0);

          // Signed distance calculation
          float boxSize = minWidth * (1.0 - roundness);
          float dist = sdSquare(uv, boxSize) - (minWidth * roundness);

          return 1.0 - smoothstep(0.0, smoothness, dist);
        }

        vec4 effectMain() {
          return TEXTURE(u_diffuse, v_texCoord) * vignette(v_texCoord, u_size, u_roundness, u_smoothness);
        }
      `,
    };
  }

  protected defineEffect(builder: ScreenSpaceEffectBuilder): void {
    builder.addVarying("v_texCoord", VaryingType.Vec2);
    builder.addUniform({
      name: "u_size",
      type: UniformType.Vec2,
      bind: (uniform) => uniform.setUniform2fv(VignetteConfig.size),
    });
    builder.addUniform({
      name: "u_roundness",
      type: UniformType.Float,
      bind: (uniform) => uniform.setUniform1f(VignetteConfig.roundness),
    });
    builder.addUniform({
      name: "u_smoothness",
      type: UniformType.Float,
      bind: (uniform) => uniform.setUniform1f(VignetteConfig.smoothness),
    });
  }
}

/** Configures the [[VignetteEffect]].
 * @beta
 */
export class VignetteConfig extends Tool {
  public static override toolId = "VignetteConfig";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 4; }

  /** Size of the vignette in the form (width/2, height/2). e.g., to make the vignette start fading in halfway between the center and edges of
   * UV space, use (0.25, 0.25).
   */
  public static readonly size = new Float32Array([0.25, 0.25]);

  /** How round the vignette will be, from 0.0 (perfectly rectangular) to 1.0 (perfectly round). */
  public static roundness = 1.0;

  /** How quickly the vignette fades in. The vignette starts fading in at the edge of the values provided by `size` and will be
   * fully faded in at (size.x + smoothness, size.y * smoothness). A value of 0.0 produces a hard edge.
   */
  public static smoothness = 0.5;

  public override run(width?: number, height?: number, roundness?: number, smoothness?: number): boolean {
    const config = VignetteConfig;
    config.size[0] = width ?? config.size[0];
    config.size[1] = height ?? config.size[1];
    config.roundness = roundness ?? config.roundness;
    config.smoothness = smoothness ?? config.smoothness;

    refreshViewportsForEffect("fdt Vignette");
    return true;
  }

  public override parseAndRun(...input: string[]): boolean {
    const args = parseArgs(input);
    return this.run(args.getFloat("w"), args.getFloat("h"), args.getFloat("r"), args.getFloat("s"));
  }
}
