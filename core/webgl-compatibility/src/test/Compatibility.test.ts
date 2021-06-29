/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Capabilities } from "../Capabilities";
import {
  queryRenderCompatibility, WebGLContext, WebGLFeature, WebGLRenderCompatibilityStatus,
} from "../RenderCompatibility";

let createContext = (canvas: HTMLCanvasElement, useWebGL2: boolean, contextAttributes?: WebGLContextAttributes): WebGLContext | undefined => {
  let context = useWebGL2 ? canvas.getContext("webgl2", contextAttributes) : canvas.getContext("webgl", contextAttributes);
  if (null === context) {
    context = canvas.getContext("experimental-webgl", contextAttributes) as WebGLRenderingContext | null; // IE, Edge...
    if (null === context) {
      return undefined;
    }
  }
  return context;
};

function makeTestContext(useWebGL2 = false): WebGLContext {
  const canvas = document.createElement("canvas");
  const context = createContext(canvas, useWebGL2);
  expect(context).not.to.be.undefined;
  return context!;
}

class OverriddenFunctions {
  public origCreateContext = createContext;

  public overrideCreateContext(newGetParameter?: (ctx: WebGLContext, pname: number) => any, useContextAttributes: boolean = true) {
    createContext = (canvas, useWebGL2, attr) => {
      const ctx = this.origCreateContext(canvas, useWebGL2, useContextAttributes ? attr : undefined);
      if (undefined !== ctx && undefined !== newGetParameter) {
        const origGetParameter = ctx.getParameter; // eslint-disable-line @typescript-eslint/unbound-method
        ctx.getParameter = (pname: number) => { // eslint-disable-line @typescript-eslint/unbound-method
          const result = newGetParameter(ctx, pname);
          if (result !== undefined)
            return result;
          const boundGetParameter = origGetParameter.bind(ctx);
          return boundGetParameter(pname);
        };
      }
      return ctx;
    };
  }

  public restore() {
    createContext = this.origCreateContext;
  }
}

// NB: These tests run in chromium via puppeteer. On non-Windows platforms, it uses software rendering. On Windows, it uses hardware rendering if available.
describe("Render Compatibility", () => {
  let overriddenFunctions: OverriddenFunctions;

  before(() => {
    overriddenFunctions = new OverriddenFunctions();
  });

  after(() => {
    overriddenFunctions.restore();
  });

  it("should provide error message if failed to produce context", () => {
    const compatibility = queryRenderCompatibility(false, createContext);
    expect(compatibility.contextErrorMessage !== undefined).to.equal(WebGLRenderCompatibilityStatus.MajorPerformanceCaveat === compatibility.status);
  });

  it("should query proper render compatibility info assuming not enough texture units", () => {
    overriddenFunctions.overrideCreateContext((ctx: WebGLContext, pname: number): any => {
      if (ctx.MAX_TEXTURE_IMAGE_UNITS === pname)
        return 0;
      return undefined;
    });

    const compatibility = queryRenderCompatibility(false, createContext);
    expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.MissingRequiredFeatures);
    expect(compatibility.missingRequiredFeatures.indexOf(WebGLFeature.MinimalTextureUnits)).to.not.equal(-1);
    overriddenFunctions.restore();
  });

  it("should query proper render compatibility info assuming lack of MRT support", () => {
    overriddenFunctions.overrideCreateContext((ctx: WebGLContext, pname: number): any => {
      const dbExt = ctx.getExtension("WEBGL_draw_buffers");
      if (null === dbExt)
        return undefined;
      if (dbExt.MAX_COLOR_ATTACHMENTS_WEBGL === pname)
        return 0;
      return undefined;
    }, false);

    const compatibility = queryRenderCompatibility(false, createContext);
    expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.MissingOptionalFeatures);
    expect(compatibility.missingOptionalFeatures.indexOf(WebGLFeature.MrtTransparency)).to.not.equal(-1);
    expect(compatibility.missingOptionalFeatures.indexOf(WebGLFeature.MrtPick)).to.not.equal(-1);
    overriddenFunctions.restore();
  });

  it("should query proper render compatibility info assuming lack of uint element index support", () => {
    const context = makeTestContext();
    const caps = new Capabilities();
    const compatibility = caps.init(context, ["OES_element_index_uint"]);
    expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.MissingRequiredFeatures);
    expect(compatibility.missingRequiredFeatures.indexOf(WebGLFeature.UintElementIndex)).to.not.equal(-1);
  });

  it("should query proper render compatibility info assuming lack of depth texture support", () => {
    const context = makeTestContext();
    const caps = new Capabilities();
    const compatibility = caps.init(context, ["WEBGL_depth_texture"]);
    expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.MissingOptionalFeatures);
    expect(compatibility.missingOptionalFeatures.indexOf(WebGLFeature.DepthTexture)).to.not.equal(-1);
  });

  it("should turn off logarithmicZBuffer if the gl frag depth extension is not available", () => {
    const context = makeTestContext();
    const caps = new Capabilities();
    const compatibility = caps.init(context, ["EXT_frag_depth"]);
    expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.MissingOptionalFeatures);
    expect(compatibility.missingOptionalFeatures.indexOf(WebGLFeature.FragDepth)).to.not.equal(-1);
    expect(caps.supportsFragDepth).to.be.false;
  });

  it("should query proper render compatibility info assuming lack of instancing support", () => {
    const context = makeTestContext();
    const caps = new Capabilities();
    const compatibility = caps.init(context, ["ANGLE_instanced_arrays"]);
    expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.MissingOptionalFeatures);
    expect(compatibility.missingOptionalFeatures.indexOf(WebGLFeature.Instancing)).to.not.equal(-1);
  });

  it("should query proper render compatibility info assuming lack of standard derivatives support", () => {
    const context = makeTestContext();
    const caps = new Capabilities();
    const compatibility = caps.init(context, ["OES_standard_derivatives"]);
    expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.MissingOptionalFeatures);
    expect(compatibility.missingOptionalFeatures.indexOf(WebGLFeature.StandardDerivatives)).to.not.equal(-1);
  });

  it("detects early Z culling driver bug", () => {
    const renderers = [
      [ "ANGLE (Intel(R) HD Graphics 630 Direct3D11 vs_5_0 ps_5_0)", true ],
      [ "ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)", true ],
      [ "ANGLE (Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)", true ],
      [ "ANGLE (Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)", true ],
      [ "ANGLE (Intel HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)", false ],

      // Bug only confirmed on 620 and 630
      [ "ANGLE (Intel(R) HD Graphics 610 Direct3D11 vs_5_0 ps_5_0)", false ],
      [ "ANGLE (Intel(R) HD Graphics 610 Direct3D11 vs_5_0 ps_5_0)", false ],
      [ "ANGLE (Intel(R) HD Graphics 615 Direct3D11 vs_5_0 ps_5_0)", false ],
      [ "ANGLE (Intel(R) HD Graphics 500 Direct3D11 vs_5_0 ps_5_0)", false ],
      [ "ANGLE (Intel(R) UHD Graphics 520 Direct3D11 vs_5_0 ps_5_0)", false ],
      [ "ANGLE (Intel(R) UHD Graphics 615 Direct3D11 vs_5_0 ps_5_0)", false ],
      [ "ANGLE (Intel(R) UHD Graphics 500 Direct3D11 vs_5_0 ps_5_0)", false ],
      [ "ANGLE (Intel(R) UHD Graphics 520 Direct3D11 vs_5_0 ps_5_0)", false ],

      // Bug only confirmed for Direct3D11; if Direct3D11 not present, we're not on Windows or using a different renderer.
      [ "ANGLE (Intel(R) HD Graphics 630)", false ],
      [ "ANGLE (Intel(R) UHD Graphics 630)", false ],
      [ "ANGLE (Intel(R) HD Graphics 620)", false ],
      [ "ANGLE (Intel(R) UHD Graphics 620)", false ],
      [ "ANGLE (Intel HD Graphics 620)", false ],
      [ "ANGLE (Intel(R) UHD Graphics 610)", false ],

      // Bug only confirmed on Windows; if ANGLE not present, we're not running on Windows.
      [ "Intel(R) HD Graphics 630", false ],
      [ "Intel(R) UHD Graphics 630", false ],
      [ "Intel(R) HD Graphics 620", false ],
      [ "Intel(R) UHD Graphics 620", false ],
      [ "Intel HD Graphics 620", false ],
      [ "Intel(R) UHD Graphics 610", false ],

      [ "ANGLE (NVIDIA GeForce GTX 970 Direct3D11 vs_5_0 ps_5_0)", false ],
    ];

    for (const renderer of renderers) {
      overriddenFunctions.overrideCreateContext((ctx: WebGLContext, pname: number) => {
        const ext = ctx.getExtension("WEBGL_debug_renderer_info");
        if (ext && pname === ext.UNMASKED_RENDERER_WEBGL)
          return renderer[0];

        return undefined;
      });

      const context = makeTestContext(true);
      const caps = new Capabilities();
      const compatibility = caps.init(context);

      expect(compatibility.status).to.equal(WebGLRenderCompatibilityStatus.AllOkay);

      const expected = renderer[1] ? true : undefined;
      expect(compatibility.driverBugs.fragDepthDoesNotDisableEarlyZ).to.equal(expected);
      expect(caps.driverBugs.fragDepthDoesNotDisableEarlyZ).to.equal(expected);
    }
  });
});
