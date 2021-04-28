/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { ImageSource, ImageSourceFormat, RenderTexture } from "@bentley/imodeljs-common";
import { Capabilities, WebGLContext } from "@bentley/webgl-compatibility";
import { IModelApp } from "../../../IModelApp";
import { IModelConnection } from "../../../IModelConnection";
import { MockRender } from "../../../render/MockRender";
import { RenderSystem } from "../../../render/RenderSystem";
import { System } from "../../../render/webgl/System";
import { TileAdmin } from "../../../tile/internal";

function _createCanvas(): HTMLCanvasElement | undefined {
  const canvas = document.createElement("canvas");
  if (null === canvas)
    return undefined;
  return canvas;
}

describe("Render Compatibility", () => {
  // NB: We assume software rendering for these tests because puppeteer only supports software rendering.
  // Further, we run in the context of Chrome, whose Swift software renderer fully supports our renderer.
  // We will run this test using WebGL1 since you cannot disable frag_depth in WebGL2.
  it("should turn off logarithmicZBuffer if the gl frag depth extension is not available", () => {
    const canvas = _createCanvas();
    expect(canvas).to.not.be.undefined;
    const context = System.createContext(canvas!, false);
    expect(context).to.not.be.undefined;

    let renderSysOpts: RenderSystem.Options = { logarithmicDepthBuffer: false, useWebGL2: false };
    let testSys = System.create(renderSysOpts);
    expect(testSys.options.logarithmicDepthBuffer).to.be.false;
    renderSysOpts = { logarithmicDepthBuffer: true, useWebGL2: false };
    testSys = System.create(renderSysOpts);
    expect(testSys.options.logarithmicDepthBuffer).to.equal(testSys.capabilities.supportsFragDepth);
    renderSysOpts = { logarithmicDepthBuffer: true, disabledExtensions: ["EXT_frag_depth"], useWebGL2: false };
    testSys = System.create(renderSysOpts);
    expect(testSys.options.logarithmicDepthBuffer).to.be.false;
  });

  it("should return webgl context if webgl2 is unsupported", () => {
    const canvas = _createCanvas();
    expect(canvas).to.not.be.undefined;
    // force canvas to fail context creation if webgl2 is requested
    const originalMethod = canvas!.getContext.bind(canvas);
    (canvas as any).getContext = (contextId: any, args?: any) => {
      if (contextId === "webgl2")
        return null;
      return originalMethod(contextId, args);
    };
    const context = System.createContext(canvas!, false);
    expect(context).to.not.be.undefined;
    expect(context instanceof WebGL2RenderingContext).to.be.false;
    expect(context instanceof WebGLRenderingContext).to.be.true;
  });
});

describe("Instancing", () => {
  class TestApp extends MockRender.App {
    public static async test(enableInstancing: boolean, supportsInstancing: boolean, expectEnabled: boolean): Promise<void> {
      const tileAdminProps: TileAdmin.Props = { enableInstancing };
      const renderSysOpts: RenderSystem.Options = { useWebGL2: false }; // use WebGL1 since instanced arrays cannot be disabled in WebGL2
      if (!supportsInstancing)
        renderSysOpts.disabledExtensions = ["ANGLE_instanced_arrays"];

      await IModelApp.startup({
        renderSys: renderSysOpts,
        tileAdmin: tileAdminProps,
      });

      expect(IModelApp.tileAdmin.enableInstancing).to.equal(expectEnabled);
      await IModelApp.shutdown();
    }
  }

  after(async () => {
    // make sure app shut down if exception occurs during test
    if (IModelApp.initialized)
      await TestApp.shutdown();
  });

  it("should enable instancing if supported and requested", async () => {
    await TestApp.test(true, true, true);
  });

  it("should not enable instancing if requested but not supported", async () => {
    await TestApp.test(true, false, false);
  });

  it("should not enable instancing if supported but not requested", async () => {
    await TestApp.test(false, true, false);
  });

  it("should not enable instancing if neither requested nor supported", async () => {
    await TestApp.test(false, false, false);
  });
});

describe("ExternalTextures", () => {
  class TestApp extends MockRender.App {
    public static async test(enableExternalTextures: boolean, expectEnabled: boolean): Promise<void> {
      const tileAdminProps: TileAdmin.Props = { enableExternalTextures };
      const renderSysOpts: RenderSystem.Options = { useWebGL2: false }; // use WebGL1 since instanced arrays cannot be disabled in WebGL2

      await IModelApp.startup({
        renderSys: renderSysOpts,
        tileAdmin: tileAdminProps,
      });

      expect(IModelApp.tileAdmin.enableExternalTextures).to.equal(expectEnabled);
      await IModelApp.shutdown();
    }
  }

  after(async () => {
    // make sure app shut down if exception occurs during test
    if (IModelApp.initialized)
      await TestApp.shutdown();
  });

  it("should enable external textures if requested", async () => {
    await TestApp.test(true, true);
  });

  it("should not enable external textures if not requested", async () => {
    await TestApp.test(false, false);
  });
});

describe("RenderSystem", () => {
  it("should override webgl context attributes", () => {
    const expectAttributes = (system: System, expected: WebGLContextAttributes) => {
      const attrs = system.context.getContextAttributes()!;
      expect(attrs).not.to.be.null;
      expect(attrs.premultipliedAlpha).to.equal(expected.premultipliedAlpha);
      expect(attrs.preserveDrawingBuffer).to.equal(expected.preserveDrawingBuffer);
      expect(attrs.antialias).to.equal(expected.antialias);
      expect(attrs.powerPreference).to.equal(expected.powerPreference);
    };

    const defaultSys = System.create();
    expectAttributes(defaultSys, { antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance" });

    const sys1Attrs: WebGLContextAttributes = { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: "low-power" };
    const sys1 = System.create({ contextAttributes: sys1Attrs });
    expectAttributes(sys1, sys1Attrs);

    // Override only some attributes; use defaults for others.
    const sys2Attrs: WebGLContextAttributes = { antialias: false, preserveDrawingBuffer: true };
    const sys2 = System.create({ contextAttributes: sys2Attrs });
    expectAttributes(sys2, { ...sys2Attrs, powerPreference: "high-performance", premultipliedAlpha: true });
  });

  describe("createTextureFromImageSource", () => {
    const imodel = {} as unknown as IModelConnection;

    class TestSystem extends System {
      public static readonly requestedIds = new Array<string | undefined>();

      public static reset(): void {
        this.requestedIds.length = 0;
      }

      public constructor(canvas: HTMLCanvasElement, context: WebGLContext, capabilities: Capabilities, options: RenderSystem.Options) {
        super(canvas, context, capabilities, options);

        const map = this.getIdMap(imodel);
        const createTextureFromImageSource = map.createTextureFromImageSource.bind(map);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        map.createTextureFromImageSource = async (source: ImageSource, params: RenderTexture.Params) => {
          TestSystem.requestedIds.push(params.key);
          return createTextureFromImageSource(source, params);
        };
      }
    }

    // This is an encoded png containing a 3x3 square with white in top left pixel, blue in middle pixel, and green in
    // bottom right pixel.  The rest of the square is red.
    const imageSource = new ImageSource(new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 3, 0, 0, 0, 3, 8, 2, 0, 0, 0, 217, 74, 34,
      232, 0, 0, 0, 1, 115, 82, 71, 66, 0, 174, 206, 28, 233, 0, 0, 0, 4, 103, 65, 77, 65, 0, 0, 177, 143, 11, 252, 97, 5, 0, 0,
      0, 9, 112, 72, 89, 115, 0, 0, 14, 195, 0, 0, 14, 195, 1, 199, 111, 168, 100, 0, 0, 0, 24, 73, 68, 65, 84, 24, 87, 99, 248, 15,
      4, 12, 12, 64, 4, 198, 64, 46, 132, 5, 162, 254, 51, 0, 0, 195, 90, 10, 246, 127, 175, 154, 145, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]), ImageSourceFormat.Png);

    before(async () => {
      await IModelApp.startup({
        renderSys: TestSystem.create(),
      });
    });

    afterEach(() => {
      TestSystem.reset();
    });

    after(async () => {
      await IModelApp.shutdown();
    });

    async function requestTexture(key: string | undefined, source?: ImageSource): Promise<RenderTexture | undefined> {
      const params = new RenderTexture.Params(key, RenderTexture.Type.Normal);
      return IModelApp.renderSystem.createTextureFromImageSource(source ?? imageSource, imodel, params);
    }

    function expectPendingRequests(expectedCount: number): void {
      const map = System.instance.getIdMap(imodel);
      expect(map.texturesFromImageSources.size).to.equal(expectedCount);
    }

    function expectRequestedIds(expected: Array<string | undefined>): void {
      expect(TestSystem.requestedIds).to.deep.equal(expected);
    }

    it("should decode image only once for multiple requests for same texture", async () => {
      const p1 = requestTexture("a");
      expectPendingRequests(1);
      expectRequestedIds(["a"]);
      const p2 = requestTexture("a");
      expectPendingRequests(1);
      expectRequestedIds(["a"]);

      const t1 = await p1;
      expectPendingRequests(0);
      const t2 = await p2;
      expect(t1).to.equal(t2);
      expect(t1).not.to.be.undefined;

      t1!.dispose();
    });

    it("should decode each different image once", async () => {
      const p1 = requestTexture("b");
      expectPendingRequests(1);
      expectRequestedIds(["b"]);
      const p2 = requestTexture("c");
      expectPendingRequests(2);
      expectRequestedIds(["b", "c"]);

      const t1 = await p1;
      const t2 = await p2;
      expectPendingRequests(0);
      expect(t1).not.to.equal(t2);

      expect(t1).not.to.be.undefined;
      expect(t2).not.to.be.undefined;

      t1!.dispose();
      t2!.dispose();
    });

    it("should not record pending requests for unnamed textures", async () => {
      const p1 = requestTexture(undefined);
      const p2 = requestTexture(undefined);
      expectPendingRequests(0);
      expectRequestedIds([undefined, undefined]);

      const t1 = await p1;
      const t2 = await p2;
      expect(t1).not.to.equal(t2);

      t1!.dispose();
      t2!.dispose();
    });

    it("should not record requests for previously-created textures", async () => {
      const p1 = requestTexture("d");
      expectPendingRequests(1);
      const t1 = await p1;
      expectPendingRequests(0);
      expectRequestedIds(["d"]);

      const p2 = requestTexture("d");
      expectPendingRequests(0);
      expectRequestedIds(["d"]);

      const p3 = requestTexture("d");
      expectPendingRequests(0);
      expectRequestedIds(["d"]);

      const t2 = await p2;
      expect(t2).to.equal(t1);

      const t3 = await p3;
      expect(t3).to.equal(t1);

      t1!.dispose();
    });

    it("should return undefined and delete pending request on error", async () => {
      const source = new ImageSource(new Uint8Array([0, 1, 2, 3, 4]), ImageSourceFormat.Png);
      const p1 = requestTexture("e", source);
      expectPendingRequests(1);
      expectRequestedIds(["e"]);

      const t1 = await p1;
      expect(t1).to.be.undefined;
      expectPendingRequests(0);

      const p2 = requestTexture("e");
      expectPendingRequests(1);
      expectRequestedIds(["e", "e"]);

      const t2 = await p2;
      expect(t2).not.to.be.undefined;
      expectPendingRequests(0);

      t2!.dispose();
    });

    it("should return undefined after render system is disposed", async () => {
      const idmap = System.instance.getIdMap(imodel);
      const promise = requestTexture("f");
      expect(idmap.texturesFromImageSources.size).to.equal(1);

      await IModelApp.shutdown();
      const texture = await promise;
      expect(texture).to.be.undefined;
      expect(idmap.texturesFromImageSources.size).to.equal(0);
    });
  });

  describe("context loss", () => {
    const contextLossHandler = RenderSystem.contextLossHandler;

    beforeEach(async () => {
      await IModelApp.startup();
    });

    afterEach(async () => {
      RenderSystem.contextLossHandler = contextLossHandler;
      await IModelApp.shutdown();
    });

    it("invokes handler", async () => {
      let contextLost = false;
      RenderSystem.contextLossHandler = async () => {
        contextLost = true;
        return Promise.resolve();
      };

      async function waitForContextLoss(): Promise<void> {
        if (contextLost)
          return Promise.resolve();

        await new Promise<void>((resolve: any) => setTimeout(resolve, 10));
        return waitForContextLoss();
      }

      const debugControl = IModelApp.renderSystem.debugControl!;
      expect(debugControl).not.to.be.undefined;

      expect(debugControl.loseContext()).to.be.true;
      await waitForContextLoss();
    });
  });
});
