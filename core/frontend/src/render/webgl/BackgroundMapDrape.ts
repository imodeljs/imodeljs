/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose } from "@bentley/bentleyjs-core";
import { Matrix4d, Plane3dByOriginAndUnitNormal, Point3d, Vector3d } from "@bentley/geometry-core";
import { ColorDef, Frustum, FrustumPlanes, RenderTexture } from "@bentley/imodeljs-common";
import { GraphicsCollectorDrawArgs, MapTileTreeReference, TileTreeReference } from "../../tile/internal";
import { SceneContext } from "../../ViewContext";
import { ViewState3d } from "../../ViewState";
import { FeatureSymbology } from "../FeatureSymbology";
import { RenderGraphic } from "../RenderGraphic";
import { BatchState } from "./BatchState";
import { BranchStack } from "./BranchStack";
import { FrameBuffer } from "./FrameBuffer";
import { GL } from "./GL";
import { PlanarTextureProjection } from "./PlanarTextureProjection";
import { RenderCommands } from "./RenderCommands";
import { RenderPass } from "./RenderFlags";
import { System } from "./System";
import { Target } from "./Target";
import { Texture, TextureHandle } from "./Texture";
import { TextureDrape } from "./TextureDrape";

/** @internal */
export class BackgroundMapDrape extends TextureDrape {
  private _fbo?: FrameBuffer;
  private readonly _graphics: RenderGraphic[] = [];
  private _frustum?: Frustum;
  private _width = 0;
  private _height = 0;
  private _mapTree: MapTileTreeReference;
  private _drapedTree: TileTreeReference;
  private static _postProjectionMatrix = Matrix4d.createRowValues(
    0, 1, 0, 0,
    0, 0, -1, 0,
    1, 0, 0, 0,
    0, 0, 0, 1);
  private _debugFrustum?: Frustum;
  private _debugFrustumGraphic?: RenderGraphic = undefined;
  private readonly _symbologyOverrides = new FeatureSymbology.Overrides();
  private readonly _bgColor = ColorDef.from(0, 0, 0, 255);
  private readonly _plane = Plane3dByOriginAndUnitNormal.create(Point3d.createZero(), Vector3d.create(0, 0, 1))!;

  private constructor(drapedTree: TileTreeReference, mapTree: MapTileTreeReference) {
    super();
    this._drapedTree = drapedTree;
    this._mapTree = mapTree;
  }

  public override get isDisposed(): boolean { return super.isDisposed && undefined === this._fbo; }

  public override dispose() {
    super.dispose();
    this._fbo = dispose(this._fbo);
  }

  public addGraphic(graphic: RenderGraphic) {
    this._graphics.push(graphic);
  }

  public static create(draped: TileTreeReference, map: MapTileTreeReference): BackgroundMapDrape {
    return new BackgroundMapDrape(draped, map);
  }

  public collectGraphics(context: SceneContext) {
    this._graphics.length = 0;
    if (undefined === context.viewingSpace)
      return;

    const viewState = context.viewingSpace.view as ViewState3d;
    if (undefined === viewState)
      return;

    const tileTree = this._mapTree.treeOwner.load();
    if (undefined === tileTree || !this._mapTree.initializeImagery())
      return;

    const requiredWidth = 2 * Math.max(context.target.viewRect.width, context.target.viewRect.height);     // TBD - Size to textured area.
    const requiredHeight = requiredWidth;

    if (requiredWidth !== this._width || requiredHeight !== this._height)
      this.dispose();

    this._width = requiredWidth;
    this._height = requiredHeight;

    const targetTree = this._drapedTree.treeOwner.tileTree;
    const args = this._drapedTree.createDrawArgs(context);
    if (!targetTree || !args)
      return;

    const targetTiles = targetTree.selectTiles(args);

    const projection = PlanarTextureProjection.computePlanarTextureProjection(this._plane, context, { tiles: targetTiles, location: args.location }, [this._mapTree], viewState, this._width, this._height);
    if (!projection.textureFrustum || !projection.projectionMatrix || !projection.worldToViewMap)
      return;

    this._frustum = projection.textureFrustum;
    this._debugFrustum = projection.debugFrustum;
    this._projectionMatrix = projection.projectionMatrix;

    const drawArgs = GraphicsCollectorDrawArgs.create(context, this, this._mapTree, new FrustumPlanes(this._frustum), projection.worldToViewMap);
    if (undefined !== drawArgs)
      tileTree.draw(drawArgs);

    if (context.target.debugControl && context.target.debugControl.displayDrapeFrustum) {
      this._debugFrustumGraphic = dispose(this._debugFrustumGraphic);
      const builder = context.createSceneGraphicBuilder();
      builder.setSymbology(ColorDef.green, ColorDef.green, 1);
      builder.addFrustum(context.viewingSpace.getFrustum());
      builder.setSymbology(ColorDef.red, ColorDef.red, 1);
      builder.addFrustum(this._debugFrustum!);
      builder.setSymbology(ColorDef.white, ColorDef.white, 1);
      builder.addFrustum(this._frustum);
      this._debugFrustumGraphic = builder.finish();
    }
  }

  public draw(target: Target) {
    if (undefined !== this._debugFrustumGraphic)
      target.graphics.foreground.push(this._debugFrustumGraphic);

    if (undefined === this._frustum || this._graphics.length === 0)
      return;

    if (undefined === this._fbo) {
      const colorTextureHandle = TextureHandle.createForAttachment(this._width, this._height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);
      if (undefined === colorTextureHandle) {
        assert(false, "Failed to create planar texture");
        return;
      }
      this._texture = new Texture(new RenderTexture.Params(undefined, RenderTexture.Type.TileSection, true), colorTextureHandle);
      this._fbo = FrameBuffer.create([colorTextureHandle]);
    }
    if (undefined === this._fbo) {
      assert(false, "unable to create frame buffer object");
      return;
    }

    System.instance.glTimer.beginOperation("Terrain Projection");

    const prevState = System.instance.currentRenderState.clone();
    System.instance.context.viewport(0, 0, this._width, this._height);

    const prevPlan = target.plan;
    const drawingParams = PlanarTextureProjection.getTextureDrawingParams(target);
    const stack = new BranchStack();
    stack.changeRenderPlan(drawingParams.viewFlags, prevPlan.is3d, prevPlan.hline);
    stack.setSymbologyOverrides(this._symbologyOverrides);

    const batchState = new BatchState(stack);
    System.instance.applyRenderState(drawingParams.state);

    target.uniforms.style.changeBackgroundColor(this._bgColor); // Avoid white on white reversal. Will be reset below in changeRenderPlan().
    target.changeFrustum(this._frustum, this._frustum.getFraction(), true);

    const prevProjMatrix = target.uniforms.frustum.projectionMatrix;
    target.uniforms.frustum.changeProjectionMatrix(BackgroundMapDrape._postProjectionMatrix.multiplyMatrixMatrix(prevProjMatrix));

    target.uniforms.branch.pushState(stack.top);

    const renderCommands = new RenderCommands(target, stack, batchState);
    renderCommands.addGraphics(this._graphics, RenderPass.OpaqueGeneral);

    const system = System.instance;
    const gl = system.context;
    const useMRT = System.instance.capabilities.supportsDrawBuffers;

    system.frameBufferStack.execute(this._fbo, true, false, () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(GL.BufferBit.Color);
      if (!useMRT) target.compositor.currentRenderTargetIndex = 0;
      target.techniques.execute(target, renderCommands.getCommands(RenderPass.OpaqueGeneral), RenderPass.PlanarClassification);    // Draw these with RenderPass.PlanarClassification (rather than Opaque...) so that the pick ordering is avoided.
    });

    target.uniforms.branch.pop();

    batchState.reset();   // Reset the batch Ids...
    target.changeRenderPlan(prevPlan);

    system.applyRenderState(prevState);
    gl.viewport(0, 0, target.viewRect.width, target.viewRect.height); // Restore viewport
    system.glTimer.endOperation();
  }
}
