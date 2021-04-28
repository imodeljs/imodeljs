/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { DepthType } from "@bentley/webgl-compatibility";
import { IModelApp } from "../../../IModelApp";
import { GL } from "../../../render/webgl/GL";
import { RenderState } from "../../../render/webgl/RenderState";
import { System } from "../../../render/webgl/System";

function withinTolerance(x: number, y: number): boolean {
  const tol: number = 0.1e-6;
  const z = x - y;
  return z >= -tol && z <= tol;
}

describe("RenderState", () => {
  before(async () => {
    await IModelApp.startup();
  });
  after(async () => IModelApp.shutdown());

  it("should compare as expected", () => {
    // Test equality
    let a = new RenderState();
    assert.isTrue(a.equals(a), "expected RenderState to equal itself");

    const b = new RenderState();
    assert.isTrue(a.equals(b), "expected 2 new RenderStates to equal eachother");
    assert.isTrue(b.equals(a), "expected RenderState.equal to be commutative");

    a.flags.depthTest = true;
    assert.isFalse(a.equals(b), "expected RenderState.equal to return false for different states");
    b.flags.depthTest = true;
    assert.isTrue(a.equals(b), "expected RenderState.equal to return true for same states");
    a.flags.depthTest = false;
    b.flags.depthTest = false;

    // Test properties
    b.frontFace = GL.FrontFace.Clockwise; // make different than the default
    assert.isFalse(a.equals(b), "expected different frontFace to compare as !equal");
    b.frontFace = GL.FrontFace.CounterClockwise; // set back to default value
    assert.isTrue(a.equals(b), "expected same frontFace to compare as equal");

    b.cullFace = GL.CullFace.Front;
    assert.isFalse(a.equals(b), "expected different cullFace to compare as !equal");
    b.cullFace = GL.CullFace.Back;
    assert.isTrue(a.equals(b), "expected same cullFace to compare as equal");

    b.depthFunc = GL.DepthFunc.NotEqual;
    assert.isFalse(a.equals(b), "expected different depthFunc to compare as !equal");
    b.depthFunc = GL.DepthFunc.LessOrEqual;
    assert.isTrue(a.equals(b), "expected same depthFunc to compare as equal");

    // Test flags
    b.flags.cull = true;
    assert.isFalse(a.equals(b), "expected different cull flag to compare as !equal");
    b.flags.cull = false;
    assert.isTrue(a.equals(b), "expected same cull flag to compare as equal");

    b.flags.depthTest = true;
    assert.isFalse(a.equals(b), "expected different depthTest flag to compare as !equal");
    b.flags.depthTest = false;
    assert.isTrue(a.equals(b), "expected same depthTest flag to compare as equal");

    b.flags.blend = true;
    assert.isFalse(a.equals(b), "expected different blend flag to compare as !equal");
    b.flags.blend = false;
    assert.isTrue(a.equals(b), "expected same blend flag to compare as equal");

    b.flags.stencilTest = true;
    assert.isFalse(a.equals(b), "expected different stencilTest flag to compare as !equal");
    b.flags.stencilTest = false;
    assert.isTrue(a.equals(b), "expected same stencilTest flag to compare as equal");

    b.flags.depthMask = false;
    assert.isFalse(a.equals(b), "expected different depthMask flag to compare as !equal");
    b.flags.depthMask = true;
    assert.isTrue(a.equals(b), "expected same depthMask flag to compare as equal");

    // Test blending
    b.blend.setColor([0.0, 0.0, 0.0, 1.0]);
    assert.isFalse(a.equals(b), "expected different blend color to compare as !equal");
    b.blend.setColor([0.0, 0.0, 0.0, 0.0]);
    assert.isTrue(a.equals(b), "expected same blend color to compare as equal");

    b.blend.equationRgb = GL.BlendEquation.Subtract;
    assert.isFalse(a.equals(b), "expected different blend equationRgb to compare as !equal");
    b.blend.equationRgb = GL.BlendEquation.Add;
    assert.isTrue(a.equals(b), "expected same blend equationRgb to compare as equal");

    b.blend.equationAlpha = GL.BlendEquation.Subtract;
    assert.isFalse(a.equals(b), "expected different blend equationAlpha to compare as !equal");
    b.blend.equationAlpha = GL.BlendEquation.Add;
    assert.isTrue(a.equals(b), "expected same blend equationAlpha to compare as equal");

    b.blend.setBlendFunc(GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultDst);
    assert.isFalse(a.equals(b), "expected different blend function src to compare as !equal");
    b.blend.setBlendFunc(GL.BlendFactor.One, GL.BlendFactor.DefaultDst);
    assert.isTrue(a.equals(b), "expected same blend function src to compare as equal");

    b.blend.setBlendFunc(GL.BlendFactor.DefaultSrc, GL.BlendFactor.AlphaSaturate);
    assert.isFalse(a.equals(b), "expected different blend function dst to compare as !equal");
    b.blend.setBlendFunc(GL.BlendFactor.DefaultSrc, GL.BlendFactor.Zero);
    assert.isTrue(a.equals(b), "expected same blend function dst to compare as equal");

    b.blend.setBlendFuncSeparate(GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultDst, GL.BlendFactor.DefaultDst);
    assert.isFalse(a.equals(b), "expected different blend function src rgb to compare as !equal");
    b.blend.setBlendFuncSeparate(GL.BlendFactor.One, GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultDst, GL.BlendFactor.DefaultDst);
    assert.isTrue(a.equals(b), "expected same blend function src rgb to compare as equal");

    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultDst, GL.BlendFactor.DefaultDst);
    assert.isFalse(a.equals(b), "expected different blend function dst rgb to compare as !equal");
    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.One, GL.BlendFactor.DefaultDst, GL.BlendFactor.DefaultDst);
    assert.isTrue(a.equals(b), "expected same blend function dst rgb to compare as equal");

    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultSrc, GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultDst);
    assert.isFalse(a.equals(b), "expected different blend function src alpha to compare as !equal");
    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultSrc, GL.BlendFactor.Zero, GL.BlendFactor.DefaultDst);
    assert.isTrue(a.equals(b), "expected same blend function src alpha to compare as equal");

    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultDst, GL.BlendFactor.AlphaSaturate);
    assert.isFalse(a.equals(b), "expected different blend function dst alpha to compare as !equal");
    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultDst, GL.BlendFactor.Zero);
    assert.isTrue(a.equals(b), "expected same blend function dst alpha to compare as !equal");

    // Test Stencil
    b.stencilMask = 0xF0;
    assert.isFalse(a.equals(b), "expected different stnecilMask to compare as !equal");
    b.stencilMask = 0xFFFFFFFF;
    assert.isTrue(a.equals(b), "expected same stnecilMask to compare as equal");

    b.stencil.frontFunction.function = GL.StencilFunction.Greater;
    assert.isFalse(a.equals(b), "expected different stencil frontFunction to compare as !equal");
    b.stencil.frontFunction.function = GL.StencilFunction.Always;
    assert.isTrue(a.equals(b), "expected same stencil frontFunction to compare as equal");

    b.stencil.backFunction.function = GL.StencilFunction.Greater;
    assert.isFalse(a.equals(b), "expected different stencil backFunction to compare as !equal");
    b.stencil.backFunction.function = GL.StencilFunction.Always;
    assert.isTrue(a.equals(b), "expected same stencil backFunction to compare as equal");

    b.stencil.frontFunction.ref = 0x08;
    assert.isFalse(a.equals(b), "expected different stencil frontRef to compare as !equal");
    b.stencil.frontFunction.ref = 0;
    assert.isTrue(a.equals(b), "expected same stencil frontRef to compare as equal");

    b.stencil.backFunction.ref = 0x08;
    assert.isFalse(a.equals(b), "expected different stencil backRef to compare as !equal");
    b.stencil.backFunction.ref = 0;
    assert.isTrue(a.equals(b), "expected same stencil backRef to compare as equal");

    b.stencil.frontFunction.mask = 0x08;
    assert.isFalse(a.equals(b), "expected different stencil fronMask to compare as !equal");
    b.stencil.frontFunction.mask = 0xFFFFFFFF;
    assert.isTrue(a.equals(b), "expected same stencil fronMask to compare as equal");

    b.stencil.backFunction.mask = 0x08;
    assert.isFalse(a.equals(b), "expected different stencil backMask to compare as !equal");
    b.stencil.backFunction.mask = 0xFFFFFFFF;
    assert.isTrue(a.equals(b), "expected same stencil backMask to compare as equal");

    b.stencil.frontOperation.fail = GL.StencilOperation.IncrWrap;
    assert.isFalse(a.equals(b), "expected different stencil frontOperation fail to compare as !equal");
    b.stencil.frontOperation.fail = GL.StencilOperation.Keep;
    assert.isTrue(a.equals(b), "expected same stencil frontOperation fail to compare as equal");

    b.stencil.frontOperation.zFail = GL.StencilOperation.IncrWrap;
    assert.isFalse(a.equals(b), "expected different stencil frontOperation zFail to compare as !equal");
    b.stencil.frontOperation.zFail = GL.StencilOperation.Keep;
    assert.isTrue(a.equals(b), "expected same stencil frontOperation zFail to compare as equal");

    b.stencil.frontOperation.zPass = GL.StencilOperation.IncrWrap;
    assert.isFalse(a.equals(b), "expected different stencil frontOperation zPass to compare as !equal");
    b.stencil.frontOperation.zPass = GL.StencilOperation.Keep;
    assert.isTrue(a.equals(b), "expected same stencil frontOperation zPass to compare as equal");

    b.stencil.backOperation.fail = GL.StencilOperation.IncrWrap;
    assert.isFalse(a.equals(b), "expected different stencil backOperation fail to compare as !equal");
    b.stencil.backOperation.fail = GL.StencilOperation.Keep;
    assert.isTrue(a.equals(b), "expected same stencil backOperation fail to compare as equal");

    b.stencil.backOperation.zFail = GL.StencilOperation.IncrWrap;
    assert.isFalse(a.equals(b), "expected different stencil backOperation zFail to compare as !equal");
    b.stencil.backOperation.zFail = GL.StencilOperation.Keep;
    assert.isTrue(a.equals(b), "expected same stencil backOperation zFail to compare as equal");

    b.stencil.backOperation.zPass = GL.StencilOperation.IncrWrap;
    assert.isFalse(a.equals(b), "expected different stencil backOperation zPass to compare as !equal");
    b.stencil.backOperation.zPass = GL.StencilOperation.Keep;
    assert.isTrue(a.equals(b), "expected same stencil backOperation zPass to compare as equal");

    // Test constructor, clone and coppy
    a = new RenderState(b);
    assert.isTrue(a.equals(b), "expected constructor copied RenderState to compare as equal");

    a = b.clone();
    assert.isTrue(a.equals(b), "expected cloned RenderState to compare as equal");

    a.flags.depthTest = true;
    assert.isFalse(b.equals(a), "expected modified cloned RenderState to compare as !equal");

    b.copyFrom(a);
    assert.isTrue(b.equals(a), "expected copyFrom RenderState to compare as equal");

    // Test again with all properties set to non-default values.
    b.frontFace = GL.FrontFace.Clockwise;
    b.cullFace = GL.CullFace.Front;
    b.depthFunc = GL.DepthFunc.NotEqual;
    b.flags.cull = true;
    b.flags.depthTest = true;
    b.flags.blend = true;
    b.flags.stencilTest = true;
    b.flags.depthMask = false;
    b.blend.setColor([0.0, 0.0, 0.0, 1.0]);
    b.blend.equationRgb = GL.BlendEquation.Subtract;
    b.blend.equationAlpha = GL.BlendEquation.Subtract;
    b.blend.setBlendFunc(GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultDst);
    b.blend.setBlendFunc(GL.BlendFactor.DefaultSrc, GL.BlendFactor.AlphaSaturate);
    b.blend.setBlendFuncSeparate(GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultDst, GL.BlendFactor.DefaultDst);
    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultDst, GL.BlendFactor.DefaultDst);
    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultSrc, GL.BlendFactor.AlphaSaturate, GL.BlendFactor.DefaultDst);
    b.blend.setBlendFuncSeparate(GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultSrc, GL.BlendFactor.DefaultDst, GL.BlendFactor.AlphaSaturate);
    b.stencilMask = 0xF0;
    b.stencil.frontFunction.function = GL.StencilFunction.Greater;
    b.stencil.backFunction.function = GL.StencilFunction.Greater;
    b.stencil.frontFunction.ref = 0x08;
    b.stencil.backFunction.ref = 0x08;
    b.stencil.frontFunction.mask = 0x08;
    b.stencil.backFunction.mask = 0x08;
    b.stencil.frontOperation.fail = GL.StencilOperation.IncrWrap;
    b.stencil.frontOperation.zFail = GL.StencilOperation.IncrWrap;
    b.stencil.frontOperation.zPass = GL.StencilOperation.IncrWrap;
    b.stencil.backOperation.fail = GL.StencilOperation.IncrWrap;
    b.stencil.backOperation.zFail = GL.StencilOperation.IncrWrap;
    b.stencil.backOperation.zPass = GL.StencilOperation.IncrWrap;
    a = new RenderState(b);
    assert.isTrue(a.equals(b), "expected constructor copied non-default RenderState to compare as equal");
    a = b.clone();
    assert.isTrue(a.equals(b), "expected cloned non-default RenderState to compare as equal");
    a = new RenderState();
    a.copyFrom(b);
    assert.isTrue(a.equals(b), "expected copyFrom non-default RenderState to compare as equal");
  });

  it("should have expected initial WebGL context state", () => {
    if (!IModelApp.hasRenderSystem) {
      return;
    }

    // A default-constructed RenderState object should match the initial state of a newly-created WebGLRenderingContext.
    const gl = System.instance.context;
    const rs = new RenderState();

    type TestCase = [number, number | boolean];
    const testCases: TestCase[] = [
      [GL.Capability.FrontFace, rs.frontFace],
      [GL.Capability.CullFaceMode, rs.cullFace],
      [GL.Capability.DepthFunc, rs.depthFunc],
      [GL.Capability.StencilWriteMask, rs.stencilMask],
      [GL.Capability.CullFace, rs.flags.cull],
      [GL.Capability.DepthTest, rs.flags.depthTest],
      [GL.Capability.Blend, rs.flags.blend],
      [GL.Capability.StencilTest, rs.flags.stencilTest],
      [GL.Capability.DepthWriteMask, rs.flags.depthMask],

      [GL.Capability.BlendEquationRGB, rs.blend.equationRgb],
      [GL.Capability.BlendEquationAlpha, rs.blend.equationAlpha],
      [GL.Capability.BlendSrcRgb, rs.blend.functionSourceRgb],
      [GL.Capability.BlendSrcAlpha, rs.blend.functionSourceAlpha],
      [GL.Capability.BlendDstRgb, rs.blend.functionDestRgb],
      [GL.Capability.BlendDstAlpha, rs.blend.functionDestAlpha],

      [GL.Capability.StencilFrontFunc, rs.stencil.frontFunction.function],
      [GL.Capability.StencilFrontRef, rs.stencil.frontFunction.ref],
      [GL.Capability.StencilFrontWriteMask, rs.stencil.frontFunction.mask],
      [GL.Capability.StencilFrontOpFail, rs.stencil.frontOperation.fail],
      [GL.Capability.StencilFrontOpZFail, rs.stencil.frontOperation.zFail],
      [GL.Capability.StencilFrontOpZPass, rs.stencil.frontOperation.zPass],

      [GL.Capability.StencilBackFunc, rs.stencil.backFunction.function],
      [GL.Capability.StencilBackRef, rs.stencil.backFunction.ref],
      [GL.Capability.StencilBackWriteMask, rs.stencil.backFunction.mask],
      [GL.Capability.StencilBackOpFail, rs.stencil.backOperation.fail],
      [GL.Capability.StencilBackOpZFail, rs.stencil.backOperation.zFail],
      [GL.Capability.StencilBackOpZPass, rs.stencil.backOperation.zPass],
    ];

    for (const testCase of testCases) {
      const actualValue = gl.getParameter(testCase[0]);
      expect(testCase[1]).to.equal(actualValue);
    }

    const glBlendColor = gl.getParameter(GL.Capability.BlendColor);
    const rsBlendColor = rs.blend.color;
    for (let i = 0; i < 4; i++)
      expect(rsBlendColor[i]).to.equal(glBlendColor[i]);
  });

  it("should apply state", () => {
    if (!IModelApp.hasRenderSystem) {
      return;
    }

    const gl = System.instance.context;

    const prevState = new RenderState();
    const newState = new RenderState();

    prevState.copyFrom(newState);
    newState.flags.cull = true;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.CullFace) === true, "cull flag should now be enabled");

    prevState.copyFrom(newState);
    newState.flags.depthTest = true;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.DepthTest) === true, "depthTest flag should now be enabled");

    prevState.copyFrom(newState);
    newState.flags.blend = true;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.Blend) === true, "blend flag should now be enabled");

    if (true || DepthType.TextureUnsignedInt24Stencil8 === System.instance.capabilities.maxDepthType) {
      prevState.copyFrom(newState);
      newState.flags.stencilTest = true;
      newState.apply(prevState);
      assert.isTrue(gl.getParameter(GL.Capability.StencilTest) === true, "stencilTest flag should now be enabled");
    }

    newState.frontFace = GL.FrontFace.Clockwise;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.FrontFace) === GL.FrontFace.Clockwise, "frontFace should now be Clockwise");

    prevState.copyFrom(newState);
    newState.cullFace = GL.CullFace.Front;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.CullFaceMode) === GL.CullFace.Front, "cullFace should now be Front");

    prevState.copyFrom(newState);
    newState.depthFunc = GL.DepthFunc.GreaterOrEqual;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.DepthFunc) === GL.DepthFunc.GreaterOrEqual, "depthFunc should now be GreaterOrEqual");

    prevState.copyFrom(newState);
    newState.flags.depthMask = false;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.DepthWriteMask) === false, "depthMask flag should now be disabled");

    prevState.copyFrom(newState);
    newState.stencilMask = 0x03;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.StencilWriteMask) === 0x03, "stencilMask should now be 0x03");

    prevState.copyFrom(newState);
    newState.blend.setColor([0.1, 0.2, 0.3, 0.4]);
    newState.apply(prevState);
    const blendColor = gl.getParameter(GL.Capability.BlendColor);
    assert.isTrue(withinTolerance(blendColor[0], 0.1), "blendColor[0] should now be 0.1");
    assert.isTrue(withinTolerance(blendColor[1], 0.2), "blendColor[1] should now be 0.2");
    assert.isTrue(withinTolerance(blendColor[2], 0.3), "blendColor[2] should now be 0.3");
    assert.isTrue(withinTolerance(blendColor[3], 0.4), "blendColor[3] should now be 0.4");

    prevState.copyFrom(newState);
    newState.blend.equationRgb = GL.BlendEquation.ReverseSubtract;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.BlendEquationRGB) === GL.BlendEquation.ReverseSubtract, "blend.equationRgb should now be ReverseSubtract");

    prevState.copyFrom(newState);
    newState.blend.equationAlpha = GL.BlendEquation.Subtract;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.BlendEquationAlpha) === GL.BlendEquation.Subtract, "blend.equationAlpha should now be Subtract");

    prevState.copyFrom(newState);
    newState.blend.functionSourceRgb = GL.BlendFactor.OneMinusSrcColor;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.BlendSrcRgb) === GL.BlendFactor.OneMinusSrcColor, "blend.functionSourceRgb should now be OneMinusSrcColor");

    prevState.copyFrom(newState);
    newState.blend.functionSourceAlpha = GL.BlendFactor.OneMinusSrcAlpha;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.BlendSrcAlpha) === GL.BlendFactor.OneMinusSrcAlpha, "blend.functionSourceAlpha should now be OneMinusSrcAlpha");

    prevState.copyFrom(newState);
    newState.blend.functionDestRgb = GL.BlendFactor.OneMinusDstColor;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.BlendDstRgb) === GL.BlendFactor.OneMinusDstColor, "blend.functionDestRgb should now be OneMinusDstColor");

    prevState.copyFrom(newState);
    newState.blend.functionDestAlpha = GL.BlendFactor.OneMinusDstAlpha;
    newState.apply(prevState);
    assert.isTrue(gl.getParameter(GL.Capability.BlendDstAlpha) === GL.BlendFactor.OneMinusDstAlpha, "blend.functionDestAlpha should now be OneMinusDstAlpha");
  });
});
