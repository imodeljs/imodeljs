/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Effects
 */

import { assert } from "@bentley/bentleyjs-core";
import { ScreenSpaceEffectBuilder, Tool, UniformType, VaryingType } from "@bentley/imodeljs-frontend";
import { AddEffectTool, refreshViewportsForEffect } from "./EffectTools";
import { parseArgs } from "../tools/parseArgs";

/** Adds a screen-space effect to the selected [[Viewport]] to simulate the lens distortion produced by real-world cameras with very wide fields of view.
 * Based on https://www.decarpentier.nl/lens-distortion
 * The effect is improved considerably by enabling anti-aliasing (e.g., via [RenderSystem.Options.antialiasSamples]($frontend) at startup, or using the `fdt aasamples` key-in`).
 * @note Because this effect applies a non-linear transform to each pixel, operations like snapping to geometry will not work properly. Element locate will work however - @see [ScreenSpaceEffectSource.sampleSourcePixel]($frontend).
 * @beta
 */
export class LensDistortionEffect extends AddEffectTool {
  public static override toolId = "LensDistortionEffect";

  protected get effectName() { return "lensdistortion"; }
  protected get textureCoordFromPosition() { return true; }

  protected get source() {
    return {
      vertex: `
        void effectMain(vec4 position) {
          vec2 uv = textureCoordFromPosition(position);
          float scaledHeight = strength * height;
          float cylAspectRatio = aspectRatio * cylindricalRatio;
          float aspectDiagSq = aspectRatio * aspectRatio + 1.0;
          float diagSq = scaledHeight * scaledHeight * aspectDiagSq;
          vec2 signedUV = (2.0 * uv + vec2(-1.0, -1.0));

          float z = 0.5 * sqrt(diagSq + 1.0) + 0.5;
          float ny = (z - 1.0) / (cylAspectRatio * cylAspectRatio + 1.0);

          vUVDot = sqrt(ny) * vec2(cylAspectRatio, 1.0) * signedUV;
          vUV = vec3(0.5, 0.5, 1.0) * z + vec3(-0.5, -0.5, 0.0);
          vUV.xy += uv;
        }`,
      // We simply shift pixels - we don't alter their colors.
      fragment: `
        vec4 effectMain() {
          return sampleSourcePixel();
        }`,
      // Because we're moving pixels around, we must tell the render system where the source pixel was originally located - otherwise
      // element locate will not work correctly.
      sampleSourcePixel: `
        vec3 uv = dot(vUVDot, vUVDot) * vec3(-0.5, -0.5, -1.0) + vUV;
        return TEXTURE_PROJ(u_diffuse, uv);
      `,
    };
  }

  protected defineEffect(builder: ScreenSpaceEffectBuilder): void {
    // Lens distortion is only applicable to views with the camera enabled.
    builder.shouldApply = (context) => context.viewport.isCameraOn;

    builder.addVarying("vUV", VaryingType.Vec3);
    builder.addVarying("vUVDot", VaryingType.Vec2);

    builder.addUniform({
      name: "strength",
      type: UniformType.Float,
      bind: (uniform) => uniform.setUniform1f(LensDistortionConfig.strength),
    });
    builder.addUniform({
      name: "cylindricalRatio",
      type: UniformType.Float,
      bind: (uniform) => uniform.setUniform1f(LensDistortionConfig.cylindricalRatio),
    });
    builder.addUniform({
      name: "aspectRatio",
      type: UniformType.Float,
      bind: (uniform, context) => uniform.setUniform1f(context.viewport.viewRect.aspect),
    });
    builder.addUniform({
      name: "height",
      type: UniformType.Float,
      bind: (uniform, context) => {
        assert(context.viewport.view.isCameraEnabled());
        const fov = context.viewport.view.camera.lens.radians;
        const height = Math.tan(fov / 2) / context.viewport.viewRect.aspect;
        uniform.setUniform1f(height);
      },
    });
  }
}

/** Configures the [[LensDistortionEffect]].
 * @beta
 */
export class LensDistortionConfig extends Tool {
  public static override toolId = "LensDistortionConfig";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 2; }

  public static strength = 0.5;
  public static cylindricalRatio = 0.5;

  public override run(strength?: number, ratio?: number): boolean {
    LensDistortionConfig.strength = strength ?? 0.5;
    LensDistortionConfig.cylindricalRatio = ratio ?? 0.5;
    refreshViewportsForEffect("fdt lensdistortion");
    return true;
  }

  public override parseAndRun(...input: string[]): boolean {
    const args = parseArgs(input);
    return this.run(args.getFloat("s"), args.getFloat("r"));
  }
}
