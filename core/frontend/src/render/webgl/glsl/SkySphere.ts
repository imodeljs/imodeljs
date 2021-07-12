/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { Angle, Point3d, Vector3d } from "@bentley/geometry-core";
import { Npc } from "@bentley/imodeljs-common";
import { WebGLContext } from "@bentley/webgl-compatibility";
import { AttributeMap } from "../AttributeMap";
import { SkySphereViewportQuadGeometry } from "../CachedGeometry";
import { fromSumOf, FrustumUniformType } from "../FrustumUniforms";
import { TextureUnit } from "../RenderFlags";
import { FragmentShaderComponent, ShaderType, VariableType } from "../ShaderBuilder";
import { ShaderProgram } from "../ShaderProgram";
import { System } from "../System";
import { TechniqueId } from "../TechniqueId";
import { Texture } from "../Texture";
import { assignFragColor } from "./Fragment";
import { createViewportQuadBuilder } from "./ViewportQuad";

const computeGradientValue = `
  // For the gradient sky it's good enough to calculate these in the vertex shader.
  vec3 eyeToVert = a_worldPos - u_worldEye;
  float radius = sqrt(eyeToVert.x * eyeToVert.x + eyeToVert.y * eyeToVert.y);
  float zValue = eyeToVert.z - radius * u_zOffset;
  float d = atan(zValue, radius);
  if (u_skyParams.x < 0.0) { // 2-color gradient
    d = 0.5 - d / 3.14159265359;
    return vec4(d, 0.0, 0.0, 0.0);
  }
  d = d / 1.570796326795;
  return vec4(d, 1.0 - (d - horizonSize) / (1.0 - horizonSize), 1.0 - (-d - horizonSize) / (1.0 - horizonSize), (d + horizonSize) / (horizonSize * 2.0));
`;

const computeSkySphereColorGradient = `
  if (u_skyParams.x < 0.0) // 2-color
    return vec4(mix(u_zenithColor, u_nadirColor, v_gradientValue.x), 1.0);

  if (v_gradientValue.x > horizonSize) // above horizon
    return vec4(mix(u_zenithColor, u_skyColor, pow(v_gradientValue.y, u_skyParams.y)), 1.0);
  else if (v_gradientValue.x < -horizonSize) // below horizon
    return vec4(mix(u_nadirColor, u_groundColor, pow(v_gradientValue.z, u_skyParams.z)), 1.0);

  return vec4(mix(u_groundColor, u_skyColor, v_gradientValue.w), 1.0);
`;

const computeEyeToVert = "v_eyeToVert = a_worldPos - u_worldEye;";

const computeSkySphereColorTexture = `
  // For the texture we must calculate these per pixel.  Alternatively we could use a finer mesh.
  float radius = sqrt(v_eyeToVert.x * v_eyeToVert.x + v_eyeToVert.y * v_eyeToVert.y);
  float zValue = v_eyeToVert.z - radius * u_zOffset;
  float u = 0.25 - (atan(v_eyeToVert.y, v_eyeToVert.x) + u_rotation) / 6.28318530718;
  float v = 0.5 - atan(zValue, radius) / 3.14159265359;
  if (u < 0.0)
    u += 1.0;
  if (v < 0.0)
    v += 1.0;
  return TEXTURE(s_skyTxtr, vec2(u, v));
`;

const scratch3Floats = new Float32Array(3);
const scratchVec3 = new Vector3d();
const scratchPoint3 = new Point3d();

/** @internal */
function modulateColor(colorIn: Float32Array, t: number, colorOut: Float32Array): void {
  const b = 1.0 - t;
  colorOut[0] = colorIn[0] * b;
  colorOut[1] = colorIn[1] * b;
  colorOut[2] = colorIn[2] * b;
}

/** @internal */
export function createSkySphereProgram(context: WebGLContext, isGradient: boolean): ShaderProgram {
  const attrMap = AttributeMap.findAttributeMap(isGradient ? TechniqueId.SkySphereGradient : TechniqueId.SkySphereTexture, false);
  const builder = createViewportQuadBuilder(false, attrMap);
  if (isGradient) {
    builder.addFunctionComputedVarying("v_gradientValue", VariableType.Vec4, "computeGradientValue", computeGradientValue);
    builder.addGlobal("horizonSize", VariableType.Float, ShaderType.Both, "0.0015", true);
  } else
    builder.addInlineComputedVarying("v_eyeToVert", VariableType.Vec3, computeEyeToVert);

  const vert = builder.vert;
  vert.addUniform("u_worldEye", VariableType.Vec3, (shader) => {
    shader.addGraphicUniform("u_worldEye", (uniform, params) => {
      const frustum = params.target.planFrustum;
      if (FrustumUniformType.Perspective === params.target.uniforms.frustum.type) {
        // compute eye point from frustum.
        const farLowerLeft = frustum.getCorner(Npc.LeftBottomRear);
        const nearLowerLeft = frustum.getCorner(Npc.LeftBottomFront);
        const scale = 1.0 / (1.0 - params.target.planFraction);
        const zVec = Vector3d.createStartEnd(farLowerLeft, nearLowerLeft, scratchVec3);
        const cameraPosition = fromSumOf(farLowerLeft, zVec, scale, scratchPoint3);
        scratch3Floats[0] = cameraPosition.x;
        scratch3Floats[1] = cameraPosition.y;
        scratch3Floats[2] = cameraPosition.z;
        uniform.setUniform3fv(scratch3Floats);
      } else {
        const delta = Vector3d.createStartEnd(frustum.getCorner(Npc.LeftBottomRear), frustum.getCorner(Npc.LeftBottomFront), scratchVec3);
        const pseudoCameraHalfAngle = 22.5;
        const diagonal = frustum.getCorner(Npc.LeftBottomRear).distance(frustum.getCorner(Npc.RightTopRear));
        const focalLength = diagonal / (2 * Math.atan(pseudoCameraHalfAngle * Angle.radiansPerDegree));
        let zScale = focalLength / delta.magnitude();
        if (zScale < 1.000001)
          zScale = 1.000001; // prevent worldEye front being on or inside the frustum front plane
        const worldEye = Point3d.createAdd3Scaled(frustum.getCorner(Npc.LeftBottomRear), .5, frustum.getCorner(Npc.RightTopRear), .5, delta, zScale, scratchPoint3);
        scratch3Floats[0] = worldEye.x;
        scratch3Floats[1] = worldEye.y;
        scratch3Floats[2] = worldEye.z;
        uniform.setUniform3fv(scratch3Floats);
      }
    });
  });
  if (isGradient) {
    vert.addUniform("u_skyParams", VariableType.Vec3, (shader) => {
      shader.addGraphicUniform("u_skyParams", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        uniform.setUniform3fv(geom.typeAndExponents);
      });
    });
    vert.addUniform("u_zOffset", VariableType.Float, (shader) => {
      shader.addGraphicUniform("u_zOffset", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        uniform.setUniform1f(geom.zOffset);
      });
    });
  }

  const frag = builder.frag;
  if (isGradient) {
    frag.addUniform("u_skyParams", VariableType.Vec3, (shader) => {
      shader.addGraphicUniform("u_skyParams", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        uniform.setUniform3fv(geom.typeAndExponents);
      });
    });
    frag.addUniform("u_zenithColor", VariableType.Vec3, (shader) => {
      shader.addGraphicUniform("u_zenithColor", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        const plan = params.target.plan;
        if (plan.backgroundMapOn && plan.isGlobeMode3D) {
          modulateColor(geom.zenithColor, plan.globalViewTransition, scratch3Floats);
          uniform.setUniform3fv(scratch3Floats);
        } else
          uniform.setUniform3fv(geom.zenithColor);
      });
    });
    frag.addUniform("u_skyColor", VariableType.Vec3, (shader) => {
      shader.addGraphicUniform("u_skyColor", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        const plan = params.target.plan;
        if (plan.backgroundMapOn && plan.isGlobeMode3D) {
          modulateColor(geom.skyColor, plan.globalViewTransition, scratch3Floats);
          uniform.setUniform3fv(scratch3Floats);
        } else
          uniform.setUniform3fv(geom.skyColor);
      });
    });
    frag.addUniform("u_groundColor", VariableType.Vec3, (shader) => {
      shader.addGraphicUniform("u_groundColor", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        const plan = params.target.plan;
        if (plan.backgroundMapOn) {
          let clr = geom.skyColor;
          if (-1 === geom.typeAndExponents[0]) // 2-color gradient
            clr = geom.zenithColor;
          if (plan.isGlobeMode3D) {
            modulateColor(clr, plan.globalViewTransition, scratch3Floats);
            uniform.setUniform3fv(scratch3Floats);
          } else
            uniform.setUniform3fv(clr);
        } else {
          uniform.setUniform3fv(geom.groundColor);
        }
      });
    });
    frag.addUniform("u_nadirColor", VariableType.Vec3, (shader) => {
      shader.addGraphicUniform("u_nadirColor", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        const plan = params.target.plan;
        if (plan.backgroundMapOn) {
          let clr = geom.skyColor;
          if (-1 === geom.typeAndExponents[0]) // 2-color gradient
            clr =  geom.nadirColor;
          if (plan.isGlobeMode3D) {
            modulateColor(clr, plan.globalViewTransition, scratch3Floats);
            uniform.setUniform3fv(scratch3Floats);
          } else
            uniform.setUniform3fv(clr);
        } else {
          uniform.setUniform3fv(geom.nadirColor);
        }
      });
    });
    frag.set(FragmentShaderComponent.ComputeBaseColor, computeSkySphereColorGradient);
  } else {
    frag.addUniform("s_skyTxtr", VariableType.Sampler2D, (shader) => {
      shader.addGraphicUniform("s_skyTxtr", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        if (undefined !== geom.skyTexture)
          (geom.skyTexture as Texture).texture.bindSampler(uniform, TextureUnit.Zero);
        else
          System.instance.ensureSamplerBound(uniform, TextureUnit.FeatureSymbology);
      });
    });
    frag.addUniform("u_zOffset", VariableType.Float, (shader) => {
      shader.addGraphicUniform("u_zOffset", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        uniform.setUniform1f(geom.zOffset);
      });
    });
    frag.addUniform("u_rotation", VariableType.Float, (shader) => {
      shader.addGraphicUniform("u_rotation", (uniform, params) => {
        const geom = params.geometry as SkySphereViewportQuadGeometry;
        uniform.setUniform1f(geom.rotation);
      });
    });
    frag.set(FragmentShaderComponent.ComputeBaseColor, computeSkySphereColorTexture);
  }
  frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);

  builder.vert.headerComment = `//!V! SkySphere-${isGradient ? "Gradient" : "Texture"}`;
  builder.frag.headerComment = `//!F! SkySphere-${isGradient ? "Gradient" : "Texture"}`;

  return builder.buildProgram(context);
}
