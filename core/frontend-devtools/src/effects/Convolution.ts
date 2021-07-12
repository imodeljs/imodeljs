/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Effects
 */

import { ScreenSpaceEffectBuilder, UniformType, VaryingType } from "@bentley/imodeljs-frontend";
import { AddEffectTool } from "./EffectTools";

/** Adds one of a collection of "convolution kernels" that alter a [Viewport]($frontend)'s image by blending neighboring pixels.
 * Based on https://webglfundamentals.org/webgl/lessons/webgl-image-processing-continued.html
 * @beta
 */
export abstract class ConvolutionEffect extends AddEffectTool {
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 0; }

  protected abstract get matrix(): number[];

  protected get textureCoordFromPosition() { return true; }

  protected get source() {
    return {
      // The vertex shader simply computes the texture coordinate for use in the fragment shader.
      vertex: `
        void effectMain(vec4 pos) {
          v_texCoord = textureCoordFromPosition(pos);
        }`,
      // The fragment shader samples the pixel and its neighbors and applies the kernel.
      fragment: `
        vec4 effectMain() {
          vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;
          vec4 colorSum =
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2(-1, -1)) * u_kernel[0] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2( 0, -1)) * u_kernel[1] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2( 1, -1)) * u_kernel[2] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2(-1,  0)) * u_kernel[3] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2( 0,  0)) * u_kernel[4] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2( 1,  0)) * u_kernel[5] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2(-1,  1)) * u_kernel[6] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2( 0,  1)) * u_kernel[7] +
            TEXTURE(u_diffuse, v_texCoord + onePixel * vec2( 1,  1)) * u_kernel[8] ;
          return vec4((colorSum / u_kernelWeight).rgb, 1);
        }`,
    };
  }

  protected defineEffect(builder: ScreenSpaceEffectBuilder): void {
    // Define the varying for the texture coordinate.
    builder.addVarying("v_texCoord", VaryingType.Vec2);

    // Hook up the uniforms.
    const matrix = this.matrix;
    builder.addUniform({
      name: "u_textureSize",
      type: UniformType.Vec2,
      bind: (uniform, context) => {
        const rect = context.viewport.viewRect;
        uniform.setUniform2fv([rect.width, rect.height]);
      },
    });
    builder.addUniformArray({
      name: "u_kernel",
      type: UniformType.Float,
      length: matrix.length,
      bind: (uniform) => uniform.setUniform1fv(matrix),
    });

    let weight = matrix.reduce((prev, curr) => prev + curr);
    if (weight <= 0)
      weight = 1;

    builder.addUniform({
      name: "u_kernelWeight",
      type: UniformType.Float,
      bind: (uniform) => uniform.setUniform1f(weight),
    });
  }
}

/** Adds a gaussian blur screen-space effect to the selected Viewport.
 * @beta
 */
export class GaussianBlurEffect extends ConvolutionEffect {
  public static override toolId = "GaussianBlurEffect";
  protected get effectName() { return "blur"; }
  protected get matrix() {
    return [
      0.045, 0.122, 0.045,
      0.122, 0.332, 0.122,
      0.045, 0.122, 0.045,
    ];
  }
}

/** Adds a screen-space unsharpen effect to the selected Viewport.
 * @beta
 */
export class UnsharpenEffect extends ConvolutionEffect {
  public static override toolId = "UnsharpenEffect";
  protected get effectName() { return "unsharpen"; }
  protected get matrix() {
    return [
      -1, -1, -1,
      -1, 9, -1,
      -1, -1, -1,
    ];
  }
}

/** Adds a screen-space emboss effect to the selected Viewport.
 * @beta
 */
export class EmbossEffect extends ConvolutionEffect {
  public static override toolId = "EmbossEffect";
  protected get effectName() { return "emboss"; }
  protected get matrix() {
    return [
      -2, -1, 0,
      -1, 1, 1,
      0, 1, 2,
    ];
  }
}

/** Adds a screen-space sharpen effect to the selected Viewport.
 * @beta
 */
export class SharpenEffect extends ConvolutionEffect {
  public static override toolId = "SharpenEffect";
  protected get effectName() { return "sharpen"; }
  protected get matrix() {
    return [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0,
    ];
  }
}

/** Adds a screen-space sharpness effect to the selected Viewport.
 * @beta
 */
export class SharpnessEffect extends ConvolutionEffect {
  public static override toolId = "SharpnessEffect";
  protected get effectName() { return "sharpness"; }
  protected get matrix() {
    return [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0,
    ];
  }
}

/** Adds a screen-space edge-detection effect to the selected Viewport.
 * @beta
 */
export class EdgeDetectionEffect extends ConvolutionEffect {
  public static override toolId = "EdgeDetectionEffect";
  protected get effectName() { return "edgedetect"; }
  protected get matrix() {
    return [
      -5, 0, 0,
      0, 0, 0,
      0, 0, 5,
    ];
  }
}
