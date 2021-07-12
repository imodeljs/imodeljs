/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert } from "@bentley/bentleyjs-core";
import { AttributeMap } from "../AttributeMap";
import { Material } from "../Material";
import { SurfaceBitIndex, SurfaceFlags, TextureUnit } from "../RenderFlags";
import { FragmentShaderComponent, ProgramBuilder, ShaderBuilder, ShaderBuilderFlags, VariableType, VertexShaderComponent } from "../ShaderBuilder";
import { System } from "../System";
import { FeatureMode, IsAnimated, IsClassified, IsInstanced, IsShadowable, IsThematic, TechniqueFlags } from "../TechniqueFlags";
import { TechniqueId } from "../TechniqueId";
import { Texture } from "../Texture";
import { addAnimation } from "./Animation";
import { unpackFloat } from "./Clipping";
import { addColor } from "./Color";
import { addChooseWithBitFlagFunctions, addExtractNthBit, addFrustum, addShaderFlags } from "./Common";
import { addUnpackAndNormalize2Bytes, decodeDepthRgb, unquantize2d } from "./Decode";
import {
  addFeatureSymbology, addMaxAlpha, addRenderOrder, addRenderOrderConstants, addSurfaceDiscard, addSurfaceHiliter, FeatureSymbologyOptions,
} from "./FeatureSymbology";
import {
  addAltPickBufferOutputs, addFragColorWithPreMultipliedAlpha, addPickBufferOutputs, addWhiteOnWhiteReversal, assignFragColor,
} from "./Fragment";
import { addLighting } from "./Lighting";
import { addSurfaceMonochrome } from "./Monochrome";
import { addColorPlanarClassifier, addFeaturePlanarClassifier, addHilitePlanarClassifier, addOverrideClassifierColor } from "./PlanarClassification";
import { addRenderPass } from "./RenderPass";
import { addSolarShadowMap } from "./SolarShadowMapping";
import { addThematicDisplay, getComputeThematicIndex } from "./Thematic";
import { addTranslucency } from "./Translucency";
import { addFeatureAndMaterialLookup, addModelViewMatrix, addNormalMatrix, addProjectionMatrix } from "./Vertex";
import { wantMaterials } from "../Mesh";

// NB: Textures do not contain pre-multiplied alpha.
const sampleSurfaceTexture = `
vec4 sampleSurfaceTexture() {
  return TEXTURE(s_texture, v_texCoord);
}
`;

const applyMaterialColor = `
  float useMatColor = float(use_material);
  vec3 rgb = mix(baseColor.rgb, mat_rgb.rgb, useMatColor * mat_rgb.a);
  float a = mix(baseColor.a, mat_alpha.x, useMatColor * mat_alpha.y);
  return vec4(rgb, a);
`;

// if this is a raster glyph, the sampled color has already been modified - do not modify further.
// Mix diffuse color with texel based on texture weight.
// Replace with diffuse RGB if RGB overridden.
// Replace with diffuse alpha if alpha overridden.
// Multiply texel alpha with diffuse alpha if specified.
const applyTextureWeight = `
  bool applyTexture = !u_applyGlyphTex && isSurfaceBitSet(kSurfaceBit_HasTexture);
  float textureWeight = applyTexture ? mat_texture_weight : 0.0;
  vec3 rgb = mix(baseColor.rgb, g_surfaceTexel.rgb, textureWeight);
  rgb = chooseVec3WithBitFlag(rgb, baseColor.rgb, surfaceFlags, kSurfaceBit_OverrideRgb);

  float a = applyTexture ? baseColor.a * g_surfaceTexel.a : baseColor.a;

  return vec4(rgb, a);
`;

const decodeFragMaterialParams = `
void decodeMaterialParams(vec4 params) {
  mat_weights = unpackAndNormalize2Bytes(params.x);

  vec2 texAndSpecR = unpackAndNormalize2Bytes(params.y);
  mat_texture_weight = texAndSpecR.x;

  vec2 specGB = unpackAndNormalize2Bytes(params.z);
  mat_specular = vec4(texAndSpecR.y, specGB, params.w);
}
`;

const decodeMaterialColor = `
void decodeMaterialColor(vec4 rgba) {
  mat_rgb = vec4(rgba.rgb, float(rgba.r >= 0.0));
  mat_alpha = vec2(rgba.a, float(rgba.a >= 0.0));
}
`;

// defaults: (0x6699, 0xffff, 0xffff, 13.5)
const computeMaterialParams = `
  const vec4 defaults = vec4(26265.0, 65535.0, 65535.0, 13.5);
  return use_material ? g_materialParams : defaults;
`;

// The 8-bit material index is stored with the 24-bit feature index, in the high byte.
const readMaterialAtlas = `
void readMaterialAtlas() {
  float materialAtlasStart = u_vertParams.z * u_vertParams.w + u_numColors;
  float materialIndex = g_featureAndMaterialIndex.w * 4.0 + materialAtlasStart;

  vec2 tc = computeLUTCoords(materialIndex, u_vertParams.xy, g_vert_center, 1.0);
  vec4 rgba = TEXTURE(u_vertLUT, tc);

  tc = computeLUTCoords(materialIndex + 1.0, u_vertParams.xy, g_vert_center, 1.0);
  vec4 weightsAndFlags = floor(TEXTURE(u_vertLUT, tc) * 255.0 + 0.5);

  tc = computeLUTCoords(materialIndex + 2.0, u_vertParams.xy, g_vert_center, 1.0);
  vec3 specularRgb = floor(TEXTURE(u_vertLUT, tc) * 255.0 + 0.5).rgb;

  tc = computeLUTCoords(materialIndex + 3.0, u_vertParams.xy, g_vert_center, 1.0);
  vec4 packedSpecularExponent = TEXTURE(u_vertLUT, tc);

  float flags = weightsAndFlags.w;
  mat_rgb = vec4(rgba.rgb, float(flags == 1.0 || flags == 3.0));
  mat_alpha = vec2(rgba.a, float(flags == 2.0 || flags == 3.0));

  float specularExponent = unpackFloat(packedSpecularExponent);
  g_materialParams.x = weightsAndFlags.y + weightsAndFlags.z * 256.0;
  g_materialParams.y = 255.0 + specularRgb.r * 256.0;
  g_materialParams.z = specularRgb.g + specularRgb.b * 256.0;
  g_materialParams.w = specularExponent;
}
`;

const computeMaterial = `
  if (u_surfaceFlags[kSurfaceBitIndex_HasMaterialAtlas]) {
    readMaterialAtlas();
  } else {
    decodeMaterialColor(u_materialColor);
    g_materialParams = u_materialParams;
  }
`;

function addMaterial(builder: ProgramBuilder): void {
  const frag = builder.frag;
  assert(undefined !== frag.find("v_surfaceFlags"));

  frag.addGlobal("mat_texture_weight", VariableType.Float);
  frag.addGlobal("mat_weights", VariableType.Vec2); // diffuse, specular
  frag.addGlobal("mat_specular", VariableType.Vec4); // rgb, exponent

  addUnpackAndNormalize2Bytes(frag);
  frag.addFunction(decodeFragMaterialParams);
  frag.addInitializer("decodeMaterialParams(v_materialParams);");

  addChooseWithBitFlagFunctions(frag);
  frag.set(FragmentShaderComponent.ApplyMaterialOverrides, applyTextureWeight);

  const vert = builder.vert;
  vert.addGlobal("mat_rgb", VariableType.Vec4); // a = 0 if not overridden, else 1
  vert.addGlobal("mat_alpha", VariableType.Vec2); // a = 0 if not overridden, else 1
  vert.addGlobal("use_material", VariableType.Boolean);
  if (System.instance.capabilities.isWebGL2)
    vert.addInitializer("use_material = (0u == (surfaceFlags & kSurfaceBit_IgnoreMaterial));");
  else
    vert.addInitializer("use_material = !nthBitSet(surfaceFlags, kSurfaceBit_IgnoreMaterial);");

  // Uniform material
  vert.addFunction(decodeMaterialColor);
  vert.addUniform("u_materialColor", VariableType.Vec4, (prog) => {
    prog.addGraphicUniform("u_materialColor", (uniform, params) => {
      const info = wantMaterials(params.target.currentViewFlags) ? params.geometry.materialInfo : undefined;
      const mat = undefined !== info && !info.isAtlas ? info : Material.default;
      uniform.setUniform4fv(mat.rgba);
    });
  });

  vert.addUniform("u_materialParams", VariableType.Vec4, (prog) => {
    prog.addGraphicUniform("u_materialParams", (uniform, params) => {
      const info = wantMaterials(params.target.currentViewFlags) ? params.geometry.materialInfo : undefined;
      const mat = undefined !== info && !info.isAtlas ? info : Material.default;
      uniform.setUniform4fv(mat.fragUniforms);
    });
  });

  // Material atlas
  addFeatureAndMaterialLookup(vert);
  vert.addFunction(unpackFloat);
  vert.addFunction(readMaterialAtlas);
  vert.addUniform("u_numColors", VariableType.Float, (prog) => {
    prog.addGraphicUniform("u_numColors", (uniform, params) => {
      const info = params.geometry.materialInfo;
      const numColors = undefined !== info && info.isAtlas ? info.vertexTableOffset : 0;
      uniform.setUniform1f(numColors);
    });
  });

  vert.addGlobal("g_materialParams", VariableType.Vec4);
  vert.set(VertexShaderComponent.ComputeMaterial, computeMaterial);
  vert.set(VertexShaderComponent.ApplyMaterialColor, applyMaterialColor);
  builder.addFunctionComputedVarying("v_materialParams", VariableType.Vec4, "computeMaterialParams", computeMaterialParams);
}

const computePositionPrelude = `
  vec4 pos = MAT_MV * rawPos;
`;

// We used to use gl.polygonOffset() for blanking regions, but that doesn't work with logarithmic depth buffer which overwrites the
// computed Z. Instead we must manually offset in vertex shader. We do this even if log depth is not enabled/supported.
// NOTE: If log depth is *not* supported, then the hilite surface vertex shaders previously would still include this logic, but the
// fragment shaders would not use v_eyeSpace. Some Ubuntu 20.04 graphics drivers cleverly and correctly optimized out the varying and the uniform,
// causing an exception when gl.getProgramLocation() failed. So, omit this bit in that case.
const adjustEyeSpace = `
  v_eyeSpace = pos.xyz;
  const float blankingRegionOffset = 2.0 / 65536.0;
  if (kRenderOrder_BlankingRegion == u_renderOrder)
    v_eyeSpace.z -= blankingRegionOffset * (u_frustum.y - u_frustum.x);
`;

const computePositionPostlude = `
  return u_proj * pos;
`;

function createCommon(instanced: IsInstanced, animated: IsAnimated, shadowable: IsShadowable, isThematic: IsThematic, isHiliter: boolean): ProgramBuilder {
  const attrMap = AttributeMap.findAttributeMap(TechniqueId.Surface, IsInstanced.Yes === instanced);
  const builder = new ProgramBuilder(attrMap, instanced ? ShaderBuilderFlags.InstancedVertexTable : ShaderBuilderFlags.VertexTable);
  const vert = builder.vert;

  if (animated)
    addAnimation(vert, true, isThematic);

  if (shadowable)
    addSolarShadowMap(builder);

  addProjectionMatrix(vert);
  addModelViewMatrix(vert);

  let computePosition;
  if (isHiliter && !System.instance.supportsLogZBuffer) {
    computePosition = computePositionPrelude + computePositionPostlude;
  } else {
    addFrustum(builder);
    addRenderOrder(builder.vert);
    addRenderOrderConstants(builder.vert);
    builder.addVarying("v_eyeSpace", VariableType.Vec3);
    computePosition = computePositionPrelude + adjustEyeSpace + computePositionPostlude;
  }

  vert.set(VertexShaderComponent.ComputePosition, computePosition);

  return builder;
}

/** @internal */
export function createSurfaceHiliter(instanced: IsInstanced, classified: IsClassified): ProgramBuilder {
  const builder = createCommon(instanced, IsAnimated.No, IsShadowable.No, IsThematic.No, true);

  addSurfaceFlags(builder, true, false);
  addTexture(builder, IsAnimated.No, IsThematic.No);
  if (classified) {
    addHilitePlanarClassifier(builder);
    builder.vert.addGlobal("feature_ignore_material", VariableType.Boolean, "false");
    builder.frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);
  } else {
    addSurfaceHiliter(builder);
  }

  return builder;
}

const isSurfaceBitSet = `
bool isSurfaceBitSet(float flag) { return nthBitSet(surfaceFlags, flag); }
`;
const isSurfaceBitSet2 = `
bool isSurfaceBitSet(uint flag) { return 0u != (surfaceFlags & flag); }
`;

/** @internal */
function addSurfaceFlagsLookup(builder: ShaderBuilder) {
  builder.addConstant("kSurfaceBitIndex_HasTexture", VariableType.Int, SurfaceBitIndex.HasTexture.toString());
  builder.addConstant("kSurfaceBitIndex_ApplyLighting", VariableType.Int, SurfaceBitIndex.ApplyLighting.toString());
  builder.addConstant("kSurfaceBitIndex_HasNormals", VariableType.Int, SurfaceBitIndex.HasNormals.toString());
  builder.addConstant("kSurfaceBitIndex_IgnoreMaterial", VariableType.Int, SurfaceBitIndex.IgnoreMaterial.toString());
  builder.addConstant("kSurfaceBitIndex_TransparencyThreshold", VariableType.Int, SurfaceBitIndex.TransparencyThreshold.toString());
  builder.addConstant("kSurfaceBitIndex_BackgroundFill", VariableType.Int, SurfaceBitIndex.BackgroundFill.toString());
  builder.addConstant("kSurfaceBitIndex_HasColorAndNormal", VariableType.Int, SurfaceBitIndex.HasColorAndNormal.toString());
  builder.addConstant("kSurfaceBitIndex_OverrideRgb", VariableType.Int, SurfaceBitIndex.OverrideRgb.toString());
  builder.addConstant("kSurfaceBitIndex_NoFaceFront", VariableType.Int, SurfaceBitIndex.NoFaceFront.toString());
  builder.addConstant("kSurfaceBitIndex_HasMaterialAtlas", VariableType.Int, SurfaceBitIndex.HasMaterialAtlas.toString());

  // Surface flags which get modified in vertex shader are still passed to fragment shader as a single float & are thus
  // used differently there & so require different constants.  Unused constants are commented out.
  builder.addBitFlagConstant("kSurfaceBit_HasTexture", SurfaceBitIndex.HasTexture);
  builder.addBitFlagConstant("kSurfaceBit_IgnoreMaterial", SurfaceBitIndex.IgnoreMaterial);
  builder.addBitFlagConstant("kSurfaceBit_OverrideRgb", SurfaceBitIndex.OverrideRgb);

  // Only need masks for flags modified in vertex shader
  const suffix = System.instance.capabilities.isWebGL2 ? "u" : ".0";
  const type = System.instance.capabilities.isWebGL2 ? VariableType.Uint : VariableType.Float;
  builder.addConstant("kSurfaceMask_HasTexture", type, SurfaceFlags.HasTexture.toString() + suffix);
  builder.addConstant("kSurfaceMask_IgnoreMaterial", type, SurfaceFlags.IgnoreMaterial.toString() + suffix);
  builder.addConstant("kSurfaceMask_OverrideRgb", type, SurfaceFlags.OverrideRgb.toString() + suffix);

  addExtractNthBit(builder);
  if (System.instance.capabilities.isWebGL2) {
    builder.addFunction(isSurfaceBitSet2);
    builder.addGlobal("surfaceFlags", VariableType.Uint);
  } else {
    builder.addFunction(isSurfaceBitSet);
    builder.addGlobal("surfaceFlags", VariableType.Float);
  }
}

const initSurfaceFlags = `
  surfaceFlags = u_surfaceFlags[kSurfaceBitIndex_HasTexture] ? kSurfaceMask_HasTexture : 0.0;
  surfaceFlags += u_surfaceFlags[kSurfaceBitIndex_IgnoreMaterial] ? kSurfaceMask_IgnoreMaterial : 0.0;
  surfaceFlags += u_surfaceFlags[kSurfaceBitIndex_OverrideRgb] ? kSurfaceMask_OverrideRgb : 0.0;
`;
const initSurfaceFlags2 = `
  surfaceFlags = u_surfaceFlags[kSurfaceBitIndex_HasTexture] ? kSurfaceMask_HasTexture : 0u;
  surfaceFlags += u_surfaceFlags[kSurfaceBitIndex_IgnoreMaterial] ? kSurfaceMask_IgnoreMaterial : 0u;
  surfaceFlags += u_surfaceFlags[kSurfaceBitIndex_OverrideRgb] ? kSurfaceMask_OverrideRgb : 0u;
`;

const computeBaseSurfaceFlags = `
  bool hasTexture = u_surfaceFlags[kSurfaceBitIndex_HasTexture];
  if (feature_ignore_material) {
    if (hasTexture) {
      hasTexture = false;
      surfaceFlags -= kSurfaceMask_HasTexture;
    }

    surfaceFlags += kSurfaceMask_IgnoreMaterial;
  }
`;

// Textured surfaces (including raster glyphs) always *multiply* the sampled alpha by the alpha override.
const computeColorSurfaceFlags = `
  if (feature_rgb.r >= 0.0)
    surfaceFlags += kSurfaceMask_OverrideRgb;
`;

const returnSurfaceFlags = "  return surfaceFlags;\n";
const returnSurfaceFlags2 = "  return float(surfaceFlags);\n";

const computeSurfaceFlags = computeBaseSurfaceFlags;
const computeSurfaceFlagsWithColor = computeBaseSurfaceFlags + computeColorSurfaceFlags;

/** @internal */
export const octDecodeNormal = `
vec3 octDecodeNormal(vec2 e) {
  e = e / 255.0 * 2.0 - 1.0;
  vec3 n = vec3(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
  if (n.z < 0.0) {
    vec2 signNotZero = vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
    n.xy = (1.0 - abs(n.yx)) * signNotZero;
  }

  return normalize(n);
}
`;

const computeNormal = `
  vec2 tc = g_vertexBaseCoords;
  tc.x += 3.0 * g_vert_stepX;
  vec4 enc = floor(TEXTURE(u_vertLUT, tc) * 255.0 + 0.5);
  vec2 normal = u_surfaceFlags[kSurfaceBitIndex_HasColorAndNormal] ? enc.xy : g_vertexData2;
  return u_surfaceFlags[kSurfaceBitIndex_HasNormals] ? normalize(MAT_NORM * octDecodeNormal(normal)) : vec3(0.0);
`;

const computeAnimatedNormal = `
  if (u_animNormalParams.x >= 0.0)
    return normalize(MAT_NORM * computeAnimationNormal(u_animNormalParams.x, u_animNormalParams.y, u_animNormalParams.z));
${computeNormal}`;

const applyBackgroundColor = `
  return u_surfaceFlags[kSurfaceBitIndex_BackgroundFill] ? vec4(u_bgColor.rgb, 1.0) : baseColor;
`;

const computeTexCoord = `
  vec2 tc = g_vertexBaseCoords;
  tc.x += 3.0 * g_vert_stepX;
  vec4 rgba = floor(TEXTURE(u_vertLUT, tc) * 255.0 + 0.5);
  vec2 qcoords = vec2(decodeUInt16(rgba.xy), decodeUInt16(rgba.zw));
  return chooseVec2WithBitFlag(vec2(0.0), unquantize2d(qcoords, u_qTexCoordParams), surfaceFlags, kSurfaceBit_HasTexture);
`;
const computeAnimatedTexCoord = `
  if (u_animScalarQParams.x >= 0.0)
    return computeAnimationParam(u_animScalarParams.x, u_animScalarParams.y, u_animScalarParams.z, u_animScalarQParams.x, u_animScalarQParams.y);
${computeTexCoord}`;
const getSurfaceColor = `
vec4 getSurfaceColor() { return v_color; }
`;

// If we have texture weight < 1.0 we must compute the element/material color first then mix with texture color
// in ApplyMaterialOverrides(). Do the sample once, here, and store in a global variable for possible later use.
// If a glyph texture, must mix getSurfaceColor() with texture color so texture color alpha is applied 100% and
// surface color rgb is scaled by texture color rgb (latter is full white originally but stretched via mipmapping).
const computeBaseColor = `
  g_surfaceTexel = sampleSurfaceTexture();
  vec4 surfaceColor = getSurfaceColor();

  if (!u_applyGlyphTex)
    return surfaceColor;

  // Compute color for raster glyph.
  const vec3 white = vec3(1.0);
  const vec3 epsilon = vec3(0.0001);
  const vec3 almostWhite = white - epsilon;

  // set to black if almost white and reverse white-on-white is on
  bvec3 isAlmostWhite = greaterThan(surfaceColor.rgb, almostWhite);
  surfaceColor.rgb = (u_reverseWhiteOnWhite && isAlmostWhite.r && isAlmostWhite.g && isAlmostWhite.b ? vec3(0.0, 0.0, 0.0) : surfaceColor.rgb);
  return vec4(surfaceColor.rgb * g_surfaceTexel.rgb, g_surfaceTexel.a);
`;

const surfaceFlagArray = new Int32Array(SurfaceBitIndex.Count);

/** @internal */
export function addSurfaceFlags(builder: ProgramBuilder, withFeatureOverrides: boolean, withFeatureColor: boolean) {
  addSurfaceFlagsLookup(builder.vert);
  addSurfaceFlagsLookup(builder.frag);

  let compute = (System.instance.capabilities.isWebGL2 ? initSurfaceFlags2 : initSurfaceFlags);
  if (withFeatureOverrides)
    compute += `${withFeatureColor ? computeSurfaceFlagsWithColor : computeSurfaceFlags}\n`;
  compute += (System.instance.capabilities.isWebGL2 ? returnSurfaceFlags2 : returnSurfaceFlags);
  builder.addFunctionComputedVarying("v_surfaceFlags", VariableType.Float, "computeSurfaceFlags", compute);

  if (System.instance.capabilities.isWebGL2)
    builder.frag.addInitializer("surfaceFlags = uint(floor(v_surfaceFlags + 0.5));");
  else
    builder.frag.addInitializer("surfaceFlags = floor(v_surfaceFlags + 0.5);");

  builder.addUniformArray("u_surfaceFlags", VariableType.Boolean, SurfaceBitIndex.Count, (prog) => {
    prog.addGraphicUniform("u_surfaceFlags", (uniform, params) => {
      assert(undefined !== params.geometry.asSurface);
      const mesh = params.geometry.asSurface;
      mesh.computeSurfaceFlags(params.programParams, surfaceFlagArray);
      uniform.setUniform1iv(surfaceFlagArray);
    });
  });
}

function addNormal(builder: ProgramBuilder, instanced: IsInstanced, animated: IsAnimated) {
  addNormalMatrix(builder.vert, instanced);

  builder.vert.addFunction(octDecodeNormal);
  addChooseWithBitFlagFunctions(builder.vert);
  builder.addFunctionComputedVarying("v_n", VariableType.Vec3, "computeLightingNormal", animated ? computeAnimatedNormal : computeNormal);

  // Set to true to colorize surfaces based on normals (in world space).
  // You must also set checkMaxVarying to false in ProgramBuilder.buildProgram to avoid assertions, if using a non-optimized build.
  const debugNormals = false;
  if (debugNormals) {
    builder.frag.set(FragmentShaderComponent.ApplyDebugColor, "return vec4(vec3(v_normal / 2.0 + 0.5), baseColor.a);");
    builder.addFunctionComputedVarying("v_normal", VariableType.Vec3, "computeDebugNormal", `
      vec2 tc = g_vertexBaseCoords;
      tc.x += 3.0 * g_vert_stepX;
      vec4 enc = floor(TEXTURE(u_vertLUT, tc) * 255.0 + 0.5);
      vec2 normal = u_surfaceFlags[kSurfaceBitIndex_HasColorAndNormal] ? enc.xy : g_vertexData2;
      return u_surfaceFlags[kSurfaceBitIndex_HasNormals] ? normalize(octDecodeNormal(normal)) : vec3(0.0);
    `);
  }
}

/** @internal */
export function addTexture(builder: ProgramBuilder, animated: IsAnimated, isThematic: IsThematic, isPointCloud = false) {
  if (isThematic) {
    builder.addInlineComputedVarying("v_thematicIndex", VariableType.Float, getComputeThematicIndex(builder.vert.usesInstancedGeometry, isPointCloud, true));
  } else {
    builder.vert.addFunction(unquantize2d);
    addChooseWithBitFlagFunctions(builder.vert);
    builder.addFunctionComputedVarying("v_texCoord", VariableType.Vec2, "computeTexCoord", animated ? computeAnimatedTexCoord : computeTexCoord);
    builder.vert.addUniform("u_qTexCoordParams", VariableType.Vec4, (prog) => {
      prog.addGraphicUniform("u_qTexCoordParams", (uniform, params) => {
        const surfGeom = params.geometry.asSurface!;
        if (surfGeom.useTexture(params.programParams)) {
          const uvQParams = surfGeom.lut.uvQParams;
          if (undefined !== uvQParams) {
            uniform.setUniform4fv(uvQParams);
          }
        }
      });
    });
    builder.frag.addFunction(sampleSurfaceTexture);
  }

  builder.frag.addUniform("s_texture", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("s_texture", (uniform, params) => {
      const surfGeom = params.geometry.asSurface!;
      if (params.geometry.supportsThematicDisplay && params.target.wantThematicDisplay) { // NB: if thematic display is enabled, bind the thematic texture and ignore any applied surface textures
        params.target.uniforms.thematic.bindTexture(uniform, TextureUnit.SurfaceTexture);
      } else if (surfGeom.useTexture(params.programParams)) {
        const texture = (params.geometry.hasAnimation && params.target.analysisTexture) ? (params.target.analysisTexture as Texture) : surfGeom.texture;
        assert(undefined !== texture);
        texture.texture.bindSampler(uniform, TextureUnit.SurfaceTexture);
      } else {
        System.instance.ensureSamplerBound(uniform, TextureUnit.SurfaceTexture);
      }
    });
  });
}

export const discardClassifiedByAlpha = `
  if (u_no_classifier_discard)
    return false;

  bool hasAlpha = alpha <= s_maxAlpha;
  bool isOpaquePass = (kRenderPass_OpaqueLinear <= u_renderPass && kRenderPass_OpaqueGeneral >= u_renderPass);
  bool isTranslucentPass = kRenderPass_Translucent == u_renderPass;
  return (isOpaquePass && hasAlpha) || (isTranslucentPass && !hasAlpha);
`;

// Target.readPixels() renders everything in opaque pass. It turns off textures for normal surfaces but keeps them for things like 3d view attachment tiles.
// We want to discard fully-transparent pixels of those things during readPixels() so that we don't locate the attachment unless the cursor is over a
// non-transparent pixel of it.
const discardTransparentTexel = `return isSurfaceBitSet(kSurfaceBit_HasTexture) && alpha < (1.0 / 255.0);`;

/** @internal */
export function createSurfaceBuilder(flags: TechniqueFlags): ProgramBuilder {
  const builder = createCommon(flags.isInstanced, flags.isAnimated, flags.isShadowable, flags.isThematic, false);
  addShaderFlags(builder);

  const feat = flags.featureMode;
  let opts = FeatureMode.Overrides === feat ? FeatureSymbologyOptions.Surface : FeatureSymbologyOptions.None;
  if (flags.isClassified) {
    opts &= ~FeatureSymbologyOptions.Alpha;
    addColorPlanarClassifier(builder, flags.isTranslucent, flags.isThematic);
  }

  if (flags.isThematic) {
    addThematicDisplay(builder);
  }

  addFeatureSymbology(builder, feat, opts);
  addSurfaceFlags(builder, FeatureMode.Overrides === feat, true);
  addSurfaceDiscard(builder, flags);
  addNormal(builder, flags.isInstanced, flags.isAnimated);

  // In HiddenLine mode, we must compute the base color (plus feature overrides etc) in order to get the alpha, then replace with background color (preserving alpha for the transparency threshold test).
  addChooseWithBitFlagFunctions(builder.frag);
  builder.frag.set(FragmentShaderComponent.FinalizeBaseColor, applyBackgroundColor);
  builder.frag.addUniform("u_bgColor", VariableType.Vec3, (prog) => {
    prog.addProgramUniform("u_bgColor", (uniform, params) => {
      params.target.uniforms.style.bindBackgroundRgb(uniform);
    });
  });

  addTexture(builder, flags.isAnimated, flags.isThematic);

  builder.frag.addUniform("u_applyGlyphTex", VariableType.Boolean, (prog) => {
    prog.addGraphicUniform("u_applyGlyphTex", (uniform, params) => {
      const surfGeom = params.geometry.asSurface!;
      uniform.setUniform1i(surfGeom.useTexture(params.programParams) && surfGeom.isGlyph ? 1 : 0);
    });
  });

  // Fragment and Vertex
  addColor(builder);

  // Fragment
  builder.frag.addFunction(getSurfaceColor);
  addLighting(builder);
  addWhiteOnWhiteReversal(builder.frag);

  if (flags.isTranslucent) {
    addTranslucency(builder);
  } else {
    if (FeatureMode.None === feat) {
      addFragColorWithPreMultipliedAlpha(builder.frag);
    } else {
      builder.frag.set(FragmentShaderComponent.DiscardByAlpha, discardTransparentTexel);
      if (!flags.isClassified)
        addOverrideClassifierColor(builder, flags.isThematic);
      else
        addFeaturePlanarClassifier(builder);

      builder.frag.addFunction(decodeDepthRgb);
      if (flags.isEdgeTestNeeded || flags.isClassified)
        addPickBufferOutputs(builder.frag);
      else
        addAltPickBufferOutputs(builder.frag);
    }
  }

  builder.frag.addGlobal("g_surfaceTexel", VariableType.Vec4);
  builder.frag.set(FragmentShaderComponent.ComputeBaseColor, (flags.isThematic === IsThematic.No) ? computeBaseColor : "return getSurfaceColor();");

  if (flags.isClassified)
    addClassificationTranslucencyDiscard(builder);

  addSurfaceMonochrome(builder.frag);
  addMaterial(builder);

  return builder;
}

export function addClassificationTranslucencyDiscard(builder: ProgramBuilder) {
  // For unclassified geometry, we need to render in both the translucent and opaque passes if any feature transparency overrides are applied that would change the default render pass used.
  // Those shaders compute the transparency in the vertex shader and discard the vertex in one pass or the other.
  // For classified geometry, the transparency comes from the classifier geometry (when using Display.ElementColor), so even if there are no feature overrides, we may need to draw in both passes.
  // Since the transparency is not known until the fragment shader, we must perform the discard there instead.
  addMaxAlpha(builder.frag);
  addRenderPass(builder.frag);

  // Do not discard transparent classified geometry if we're trying to do a pick...
  builder.frag.addUniform("u_no_classifier_discard", VariableType.Boolean, (prog) => {
    prog.addProgramUniform("u_no_classifier_discard", (uniform, params) => {
      uniform.setUniform1i(params.target.isReadPixelsInProgress ? 1 : 0);
    });
  });

  builder.frag.set(FragmentShaderComponent.DiscardByAlpha, discardClassifiedByAlpha);
}
