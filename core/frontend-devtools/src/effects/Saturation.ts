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

/** Adjusts the saturation of colors in a viewport.
 * @beta
 */
export class SaturationEffect extends AddEffectTool {
  public static override toolId = "SaturationEffect";

  protected get effectName() { return "Saturation"; }
  protected get textureCoordFromPosition() { return true; }

  protected get source() {
    // rgb <-> hsl conversion routines from https://gamedev.stackexchange.com/questions/59797/glsl-shader-change-hue-saturation-brightness
    return {
      // Vertex shader simply computes texture coordinate for source pixel.
      vertex: `
        void effectMain(vec4 pos) {
          v_texCoord = textureCoordFromPosition(pos);
        }`,
      // Fragment shader converts color to HSV, adjusts the saturation, and converts back to RGB.
      fragment: `
        vec3 rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

          float d = q.x - min(q.w, q.y);
          float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        vec4 effectMain() {
          vec4 color = TEXTURE(u_diffuse, v_texCoord);
          color.rgb = rgb2hsv(color.rgb);
          color.rgb.y = color.rgb.y * u_saturationMult;
          color.rgb = hsv2rgb(color.rgb);
          return color;
        }`,
    };
  }

  protected defineEffect(builder: ScreenSpaceEffectBuilder): void {
    builder.addVarying("v_texCoord", VaryingType.Vec2);
    builder.addUniform({
      name: "u_saturationMult",
      type: UniformType.Float,
      bind: (uniform) => uniform.setUniform1f(SaturationConfig.multiplier),
    });
  }
}

/** Configures the [[SaturationEffect]].
 * @beta
 */
export class SaturationConfig extends Tool {
  public static override toolId = "SaturationConfig";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  /** Multiplier applied to the saturation of each color in the source image. */
  public static multiplier = 2.0;

  public override run(multiplier?: number): boolean {
    SaturationConfig.multiplier = multiplier ?? 2.0;
    refreshViewportsForEffect("fdt Saturation");
    return true;
  }

  public override parseAndRun(...input: string[]): boolean {
    const args = parseArgs(input);
    return this.run(args.getFloat("s"));
  }
}

