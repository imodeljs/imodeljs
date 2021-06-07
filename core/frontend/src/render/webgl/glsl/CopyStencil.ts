/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { ColorDef, SpatialClassifierInsideDisplay, SpatialClassifierOutsideDisplay } from "@bentley/imodeljs-common";
import { WebGLContext } from "@bentley/webgl-compatibility";
import { AttributeMap } from "../AttributeMap";
import { BoundaryType, ScreenPointsGeometry, SingleTexturedViewportQuadGeometry, VolumeClassifierGeometry } from "../CachedGeometry";
import { FloatRgb, FloatRgba } from "../FloatRGBA";
import { TextureUnit } from "../RenderFlags";
import { FragmentShaderComponent, ProgramBuilder, ShaderBuilder, VariableType, VertexShaderComponent } from "../ShaderBuilder";
import { ShaderProgram } from "../ShaderProgram";
import { System } from "../System";
import { TechniqueId } from "../TechniqueId";
import { Texture2DHandle } from "../Texture";
import { assignFragColor } from "./Fragment";
import { unquantizeVertexPosition } from "./Vertex";
import { createViewportQuadBuilder } from "./ViewportQuad";

const computehiliteColor = "return vec4(u_hilite_color.rgb, 1.0);";

const computeSetBlendColor = "return u_blend_color;";

const computeBlendTextureColor = "return TEXTURE(u_blendTexture, v_texCoord);";

const computeTexCoord = "v_texCoord = (rawPosition.xy + 1.0) * 0.5;";

const checkDiscardBackgroundByZ = `
  if (u_boundaryType == kBoundaryType_Out)
    return TEXTURE(u_depthTexture, v_texCoord).r == 1.0;
  return false;
`;

const depthFromTexture = "return TEXTURE(u_depthTexture, v_texCoord).r;";

const computePosition = `
  gl_PointSize = 1.0; // Need to set the point size since we are drawing points with this.
  float z = TEXTURE(u_depthTexture, (rawPos.xy + 1.0) * 0.5).r * 2.0 - 1.0;
  return vec4(rawPos.x, rawPos.y, z, 1.0);
`;

const unquantizeVertexPosition2d = `
vec4 unquantizeVertexPosition(vec2 pos, vec3 origin, vec3 scale) { return unquantizePosition(vec3(pos.x, pos.y, 0.0), origin, scale); }
`;

const scratchColor = FloatRgba.fromColorDef(ColorDef.white);

/** @internal */
function addBoundaryTypeConstants(builder: ShaderBuilder): void {
  // NB: These are the bit positions of each flag in OvrFlags enum - not the flag values
  builder.addConstant("kBoundaryType_Out", VariableType.Int, "0");
  builder.addConstant("kBoundaryType_In", VariableType.Int, "1");
  builder.addConstant("kBoundaryType_Selected", VariableType.Int, "2");
}

/** @internal */
function setScratchColor(display: number, hilite: FloatRgb, hAlpha: number): void {
  switch (display) {
    case SpatialClassifierOutsideDisplay.Dimmed:
      scratchColor.set(0.0, 0.0, 0.0, 0.3);
      break;
    case SpatialClassifierOutsideDisplay.Off:
      scratchColor.set(0.0, 0.0, 0.0, 0.8);
      break;
    case SpatialClassifierOutsideDisplay.On:
      scratchColor.set(0.0, 0.0, 0.0, 0.0);
      break;
    default: // Hilite or ByElementColor (though ByElementColor should never use this shader)
      scratchColor.set(hilite.red, hilite.green, hilite.blue, hAlpha);
      break;
  }
}

/** @internal */
export function createVolClassColorUsingStencilProgram(context: WebGLContext): ShaderProgram {
  const builder = createViewportQuadBuilder(false);
  const frag = builder.frag;
  frag.set(FragmentShaderComponent.ComputeBaseColor, computehiliteColor);
  frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);
  frag.addUniform("u_hilite_color", VariableType.Vec4, (prog) => {
    prog.addGraphicUniform("u_hilite_color", (uniform, params) => {
      const useLighting = params.geometry.getFlashMode(params);
      if (useLighting) {
        const hiliteColor = params.target.uniforms.hilite.hiliteColor;
        scratchColor.set(hiliteColor.red, hiliteColor.green, hiliteColor.blue, 1.0);
      } else
        scratchColor.set(1.0, 1.0, 1.0, 0.0);
      scratchColor.bind(uniform);
    });
  });

  builder.vert.headerComment = "//!V! VolClassColorUsingStencil";
  builder.frag.headerComment = "//!F! VolClassColorUsingStencil";

  return builder.buildProgram(context);
}

/** @internal */
export function createVolClassCopyZProgram(context: WebGLContext): ShaderProgram {
  const builder = createViewportQuadBuilder(true);

  builder.addInlineComputedVarying("v_texCoord", VariableType.Vec2, computeTexCoord); // TODO: I think this is not necessary because it's already added from the create above

  const frag = builder.frag;
  frag.set(FragmentShaderComponent.ComputeBaseColor, computeSetBlendColor);
  frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);

  frag.addUniform("u_blend_color", VariableType.Vec4, (prog) => {
    prog.addGraphicUniform("u_blend_color", (uniform, _params) => {
      scratchColor.set(0.0, 0.0, 0.0, 0.0);
      scratchColor.bind(uniform);
    });
  });

  frag.addUniform("u_depthTexture", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("u_depthTexture", (uniform, params) => {
      const geom = params.geometry as SingleTexturedViewportQuadGeometry;
      Texture2DHandle.bindSampler(uniform, geom.texture, TextureUnit.Zero);
    });
  });

  if (!System.instance.capabilities.isWebGL2)
    frag.addExtension("GL_EXT_frag_depth");
  frag.set(FragmentShaderComponent.FinalizeDepth, depthFromTexture);

  builder.vert.headerComment = "//!V! VolClassCopyZ";
  builder.frag.headerComment = "//!F! VolClassCopyZ";

  return builder.buildProgram(context);
}

/** @internal */
export function createVolClassCopyZUsingPointsProgram(context: WebGLContext): ShaderProgram {
  const attrMap = AttributeMap.findAttributeMap(TechniqueId.VolClassCopyZ, false);
  const builder = new ProgramBuilder(attrMap);

  const vert = builder.vert;
  vert.replaceFunction(unquantizeVertexPosition, unquantizeVertexPosition2d);
  vert.addUniform("u_depthTexture", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("u_depthTexture", (uniform, params) => {
      const geom = params.geometry as ScreenPointsGeometry;
      Texture2DHandle.bindSampler(uniform, geom.zTexture, TextureUnit.Zero);
    });
  });
  vert.set(VertexShaderComponent.ComputePosition, computePosition);

  const frag = builder.frag;
  frag.set(FragmentShaderComponent.ComputeBaseColor, computeSetBlendColor);
  frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);

  frag.addUniform("u_blend_color", VariableType.Vec4, (prog) => {
    prog.addGraphicUniform("u_blend_color", (uniform, _params) => {
      scratchColor.set(0.0, 0.0, 0.0, 0.0);
      scratchColor.bind(uniform);
    });
  });

  builder.vert.headerComment = "//!V! VolClassCopyZUsingPoints";
  builder.frag.headerComment = "//!F! VolClassCopyZUsingPoints";

  return builder.buildProgram(context);
}

/** @internal */
export function createVolClassSetBlendProgram(context: WebGLContext): ShaderProgram {
  const builder = createViewportQuadBuilder(true);

  builder.addInlineComputedVarying("v_texCoord", VariableType.Vec2, computeTexCoord);

  const frag = builder.frag;
  addBoundaryTypeConstants(frag);
  frag.set(FragmentShaderComponent.CheckForEarlyDiscard, checkDiscardBackgroundByZ);
  frag.set(FragmentShaderComponent.ComputeBaseColor, computeSetBlendColor);
  frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);

  frag.addUniform("u_boundaryType", VariableType.Int, (prog) => {
    prog.addGraphicUniform("u_boundaryType", (uniform, params) => {
      const geom = params.geometry as VolumeClassifierGeometry;
      uniform.setUniform1i(geom.boundaryType);
    });
  });

  frag.addUniform("u_blend_color", VariableType.Vec4, (prog) => {
    prog.addGraphicUniform("u_blend_color", (uniform, params) => {
      const geom = params.geometry as VolumeClassifierGeometry;
      const hiliteColor = params.target.uniforms.hilite.hiliteColor;
      const hiliteAlpha = params.target.uniforms.hilite.hiliteSettings.visibleRatio;
      switch (geom.boundaryType) {
        case BoundaryType.Outside:
          setScratchColor(params.target.activeVolumeClassifierProps!.flags.outside, hiliteColor, hiliteAlpha);
          break;
        case BoundaryType.Inside:
          setScratchColor(params.target.activeVolumeClassifierProps!.flags.inside, hiliteColor, hiliteAlpha);
          break;
        case BoundaryType.Selected:
          // setScratchColor(params.target.activeVolumeClassifierProps!.flags.selected, hiliteColor, hiliteAlpha);
          setScratchColor(SpatialClassifierInsideDisplay.Hilite, hiliteColor, hiliteAlpha); // option for how to display selected classifiers has been removed, always just hilite
          break;
      }
      scratchColor.bind(uniform);
    });
  });

  frag.addUniform("u_depthTexture", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("u_depthTexture", (uniform, params) => {
      const geom = params.geometry as VolumeClassifierGeometry;
      Texture2DHandle.bindSampler(uniform, geom.texture, TextureUnit.Zero);
    });
  });

  builder.vert.headerComment = "//!V! VolClassSetBlend";
  builder.frag.headerComment = "//!F! VolClassSetBlend";

  return builder.buildProgram(context);
}

/** @internal */
export function createVolClassBlendProgram(context: WebGLContext): ShaderProgram {
  const builder = createViewportQuadBuilder(true);

  builder.addInlineComputedVarying("v_texCoord", VariableType.Vec2, computeTexCoord);

  const frag = builder.frag;
  frag.set(FragmentShaderComponent.ComputeBaseColor, computeBlendTextureColor);
  frag.set(FragmentShaderComponent.AssignFragData, assignFragColor);

  frag.addUniform("u_blendTexture", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("u_blendTexture", (uniform, params) => {
      const geom = params.geometry as SingleTexturedViewportQuadGeometry;
      Texture2DHandle.bindSampler(uniform, geom.texture, TextureUnit.Zero);
    });
  });

  builder.vert.headerComment = "//!V! VolClassBlend";
  builder.frag.headerComment = "//!F! VolClassBlend";

  return builder.buildProgram(context);
}
