/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert } from "@bentley/bentleyjs-core";
import { Range3d } from "@bentley/geometry-core";
import { Frustum, FrustumPlanes, RenderMode, ViewFlags } from "@bentley/imodeljs-common";
import { Decorations } from "../Decorations";
import { SurfaceType } from "../primitives/VertexTable";
import { GraphicList, RenderGraphic } from "../RenderGraphic";
import { AnimationBranchState } from "../GraphicBranch";
import { BranchStack } from "./BranchStack";
import { BatchState } from "./BatchState";
import { BranchState } from "./BranchState";
import {
  DrawCommands, PopBatchCommand, PopBranchCommand, PopClipCommand, PopCommand, PrimitiveCommand, PushBatchCommand,
  PushBranchCommand, PushClipCommand, PushCommand, PushStateCommand,
} from "./DrawCommand";
import { Batch, Branch, Graphic, GraphicsArray } from "./Graphic";
import { Layer, LayerContainer } from "./Layer";
import { LayerCommandLists } from "./LayerCommands";
import { MeshGraphic } from "./Mesh";
import { Primitive } from "./Primitive";
import { CompositeFlags, RenderOrder, RenderPass } from "./RenderFlags";
import { TargetGraphics } from "./TargetGraphics";
import { Target } from "./Target";
import { ClipVolume } from "./ClipVolume";

/** A list of DrawCommands to be rendered, ordered by render pass.
 * @internal
 */
export class RenderCommands implements Iterable<DrawCommands> {
  private _frustumPlanes?: FrustumPlanes;
  private readonly _scratchFrustum = new Frustum();
  private readonly _scratchRange = new Range3d();
  private readonly _commands = new Array<DrawCommands>(RenderPass.COUNT);
  private _target: Target;
  private _stack: BranchStack; // refers to the Target's BranchStack
  private _batchState: BatchState; // refers to the Target's BatchState
  private _forcedRenderPass: RenderPass = RenderPass.None;
  private _addLayersAsNormalGraphics = false;
  private _opaqueOverrides = false;
  private _translucentOverrides = false;
  private _addTranslucentAsOpaque = false; // true when rendering for _ReadPixels to force translucent items to be drawn in opaque pass.
  private readonly _layers: LayerCommandLists;

  public get target(): Target { return this._target; }

  public [Symbol.iterator](): Iterator<DrawCommands> {
    return this._commands[Symbol.iterator]();
  }

  public get isEmpty(): boolean {
    for (const commands of this._commands)
      if (0 < commands.length)
        return false;

    return true;
  }

  public get isDrawingLayers() {
    switch (this._forcedRenderPass) {
      case RenderPass.OpaqueLayers:
      case RenderPass.TranslucentLayers:
      case RenderPass.OverlayLayers:
        return true;
      default:
        return false;
    }
  }

  public get currentViewFlags(): ViewFlags { return this._stack.top.viewFlags; }
  public get compositeFlags(): CompositeFlags {
    let flags = CompositeFlags.None;
    if (this.hasCommands(RenderPass.Translucent))
      flags |= CompositeFlags.Translucent;

    if (this.hasCommands(RenderPass.Hilite) || this.hasCommands(RenderPass.HiliteClassification) || this.hasCommands(RenderPass.HilitePlanarClassification))
      flags |= CompositeFlags.Hilite;

    if (this.target.wantAmbientOcclusion)
      flags |= CompositeFlags.AmbientOcclusion;

    return flags;
  }

  private get _curBatch(): Batch | undefined { return this._batchState.currentBatch; }

  public hasCommands(pass: RenderPass): boolean { return 0 !== this.getCommands(pass).length; }
  public isOpaquePass(pass: RenderPass): boolean { return pass >= RenderPass.OpaqueLinear && pass <= RenderPass.OpaqueGeneral; }

  constructor(target: Target, stack: BranchStack, batchState: BatchState) {
    this._target = target;
    this._stack = stack;
    this._batchState = batchState;
    this._layers = new LayerCommandLists(this);

    for (let i = 0; i < RenderPass.COUNT; ++i)
      this._commands[i] = [];
  }

  public reset(target: Target, stack: BranchStack, batchState: BatchState): void {
    this._target = target;
    this._stack = stack;
    this._batchState = batchState;
    this.clear();
  }

  public collectGraphicsForPlanarProjection(scene: GraphicList): void {
    assert(this._forcedRenderPass === RenderPass.None);
    assert(!this._addLayersAsNormalGraphics);

    this._addLayersAsNormalGraphics = true;
    this.addGraphics(scene);
    this._addLayersAsNormalGraphics = false;
  }

  public addGraphics(scene: GraphicList, forcedPass: RenderPass = RenderPass.None): void {
    this._forcedRenderPass = forcedPass;
    scene.forEach((entry: RenderGraphic) => (entry as Graphic).addCommands(this));
    this._forcedRenderPass = RenderPass.None;
  }

  /** Add backgroundMap graphics to their own render pass. */
  public addBackgroundMapGraphics(backgroundMapGraphics: GraphicList): void {
    this._forcedRenderPass = RenderPass.BackgroundMap;
    backgroundMapGraphics.forEach((entry: RenderGraphic) => (entry as Graphic).addCommands(this));
    this._forcedRenderPass = RenderPass.None;
  }
  /** Add overlay graphics to the world overlay pass */
  public addOverlayGraphics(overlayGraphics: GraphicList): void {
    this._forcedRenderPass = RenderPass.WorldOverlay;
    overlayGraphics.forEach((entry: RenderGraphic) => (entry as Graphic).addCommands(this));
    this._forcedRenderPass = RenderPass.None;
  }

  public addDecorations(dec: GraphicList, forcedPass: RenderPass = RenderPass.None): void {
    this._forcedRenderPass = forcedPass;
    for (const entry of dec) {
      (entry as Graphic).addCommands(this);
    }

    this._forcedRenderPass = RenderPass.None;
  }

  public addWorldDecorations(decs: GraphicList): void {
    const world = this.target.getWorldDecorations(decs);
    this.pushAndPopBranch(world, () => {
      for (const entry of world.branch.entries) {
        (entry as Graphic).addCommands(this);
      }
    });
  }

  private addPickableDecorations(decs: Decorations): void {
    if (undefined !== decs.normal) {
      for (const normal of decs.normal) {
        const gf = normal as Graphic;
        if (gf.isPickable)
          gf.addCommands(this);
      }
    }

    if (undefined !== decs.world) {
      const world = this.target.getWorldDecorations(decs.world);
      this.pushAndPopBranch(world, () => {
        for (const gf of world.branch.entries) {
          if ((gf as Graphic).isPickable)
            (gf as Graphic).addCommands(this);
        }
      });
    }
  }

  public addBackground(gf?: Graphic): void {
    if (undefined === gf)
      return;

    assert(RenderPass.None === this._forcedRenderPass);

    this._forcedRenderPass = RenderPass.Background;
    this.pushAndPopState(this.target.decorationsState, () => gf.addCommands(this));
    this._forcedRenderPass = RenderPass.None;
  }

  public addSkyBox(gf?: Graphic): void {
    if (undefined === gf)
      return;

    assert(RenderPass.None === this._forcedRenderPass);

    this._forcedRenderPass = RenderPass.SkyBox;
    this.pushAndPopState(this.target.decorationsState, () => gf.addCommands(this));
    this._forcedRenderPass = RenderPass.None;
  }

  public addPrimitiveCommand(command: PrimitiveCommand, pass?: RenderPass): void {
    if (undefined === pass)
      pass = command.getRenderPass(this.target);

    if (RenderPass.None === pass) // Edges will return none if they don't want to draw at all (edges not turned on).
      return;

    if (RenderPass.None !== this._forcedRenderPass) {
      // Add the command to the forced render pass (background).
      this.getCommands(this._forcedRenderPass).push(command);
      return;
    }

    const haveFeatureOverrides = (this._opaqueOverrides || this._translucentOverrides) && command.opcode && command.hasFeatures;

    if (RenderPass.Translucent === pass && this._addTranslucentAsOpaque) {
      switch (command.renderOrder) {
        case RenderOrder.PlanarLitSurface:
        case RenderOrder.PlanarUnlitSurface:
        case RenderOrder.BlankingRegion:
          pass = RenderPass.OpaquePlanar;
          break;
        case RenderOrder.LitSurface:
        case RenderOrder.UnlitSurface:
          pass = RenderPass.OpaqueGeneral;
          break;
        default:
          pass = RenderPass.OpaqueLinear;
          break;
      }
    }

    switch (pass) {
      // If this command ordinarily renders translucent, but some features have been overridden to be opaque, must draw in both passes
      case RenderPass.Translucent:
        if (this._opaqueOverrides && haveFeatureOverrides && !command.primitive.cachedGeometry.alwaysRenderTranslucent) {
          let opaquePass: RenderPass;
          switch (command.renderOrder) {
            case RenderOrder.PlanarLitSurface:
            case RenderOrder.PlanarUnlitSurface:
            case RenderOrder.BlankingRegion:
              opaquePass = RenderPass.OpaquePlanar;
              break;
            case RenderOrder.LitSurface:
            case RenderOrder.UnlitSurface:
              opaquePass = RenderPass.OpaqueGeneral;
              break;
            default:
              opaquePass = RenderPass.OpaqueLinear;
              break;
          }
          this.getCommands(opaquePass).push(command);
        }
        break;
      // If this command ordinarily renders opaque, but some features have been overridden to be translucent,
      // must draw in both passes unless we are overriding translucent geometry to draw in the opaque pass for _ReadPixels.
      case RenderPass.OpaqueLinear:
      case RenderPass.OpaquePlanar:
        // Want these items to draw in general opaque pass so they are not in pick data.
        if (!command.hasFeatures)
          pass = RenderPass.OpaqueGeneral;
      /* falls through */
      case RenderPass.OpaqueGeneral:
        if (this._translucentOverrides && haveFeatureOverrides && !this._addTranslucentAsOpaque)
          this.getCommands(RenderPass.Translucent).push(command);
        break;
    }

    this.getCommands(pass).push(command);
  }

  public getCommands(pass: RenderPass): DrawCommands {
    let idx = pass as number;
    assert(idx < this._commands.length);
    if (idx >= this._commands.length)
      idx -= 1;

    return this._commands[idx];
  }

  public replaceCommands(pass: RenderPass, cmds: DrawCommands): void {
    const idx = pass as number;
    this._commands[idx].splice(0);
    this._commands[idx] = cmds;
  }

  public addHiliteBranch(branch: Branch, pass: RenderPass): void {
    this.pushAndPopBranchForPass(pass, branch, () => {
      branch.branch.entries.forEach((entry: RenderGraphic) => (entry as Graphic).addHiliteCommands(this, pass));
    });
  }

  public processLayers(container: LayerContainer): void {
    assert(RenderPass.None === this._forcedRenderPass);
    if (RenderPass.None !== this._forcedRenderPass)
      return;

    this._forcedRenderPass = container.renderPass;
    this._layers.processLayers(container, () => container.graphic.addCommands(this));
    this._forcedRenderPass = RenderPass.None;
  }

  public addLayerCommands(layer: Layer): void {
    if (this._addLayersAsNormalGraphics) {
      // GraphicsCollectorDrawArgs wants to collect graphics to project to a plane for masking.
      // It bypasses PlanProjectionTreeReference.createDrawArgs which would otherwise wrap the graphics in a LayerContainer.
      assert(this._forcedRenderPass === RenderPass.None);
      this._forcedRenderPass = RenderPass.OpaqueGeneral;
      layer.graphic.addCommands(this);
      this._forcedRenderPass = RenderPass.None;
      return;
    }

    assert(this.isDrawingLayers);
    if (!this.isDrawingLayers)
      return;

    // Let the graphic add its commands. Afterward, pull them out and add them to the LayerCommands.
    this._layers.currentLayer = layer;
    layer.graphic.addCommands(this);

    const cmds = this.getCommands(this._forcedRenderPass);
    this._layers.addCommands(cmds);

    cmds.length = 0;
    this._layers.currentLayer = undefined;
  }

  public addHiliteLayerCommands(graphic: Graphic, pass: RenderPass): void {
    assert(this.isDrawingLayers || this._addLayersAsNormalGraphics);
    if (!this.isDrawingLayers && !this._addLayersAsNormalGraphics)
      return;

    const prevPass = this._forcedRenderPass;
    this._forcedRenderPass = RenderPass.None;

    graphic.addHiliteCommands(this, pass);

    this._forcedRenderPass = prevPass;
  }

  private getAnimationBranchState(branch: Branch): AnimationBranchState | undefined {
    const animId = branch.branch.animationId;
    return undefined !== animId ? this.target.animationBranches?.get(animId) : undefined;
  }

  private pushAndPopBranchForPass(pass: RenderPass, branch: Branch, func: () => void): void {
    assert(!this.isDrawingLayers);

    const animState = this.getAnimationBranchState(branch);
    if (animState?.omit)
      return;

    assert(RenderPass.None !== pass);

    this._stack.pushBranch(branch);
    if (branch.planarClassifier)
      branch.planarClassifier.pushBatchState(this._batchState);

    const cmds = this.getCommands(pass);
    const clip = animState?.clip as ClipVolume | undefined;
    const pushClip = undefined !== clip ? new PushClipCommand(clip) : undefined;
    if (pushClip)
      cmds.push(pushClip);

    const push = new PushBranchCommand(branch);
    cmds.push(push);

    func();

    this._stack.pop();
    if (cmds[cmds.length - 1] === push) {
      cmds.pop();
      if (pushClip)
        cmds.pop();
    } else {
      cmds.push(PopBranchCommand.instance);
      if (pushClip)
        cmds.push(PopClipCommand.instance);
    }
  }

  private pushAndPop(push: PushCommand, pop: PopCommand, func: () => void): void {
    if (this.isDrawingLayers) {
      this._commands[RenderPass.Hilite].push(push);
      this._layers.pushAndPop(push, pop, func);

      const cmds = this._commands[RenderPass.Hilite];
      if (0 < cmds.length && cmds[cmds.length - 1] === push)
        cmds.pop();
      else
        cmds.push(pop);

      return;
    }

    if (RenderPass.None === this._forcedRenderPass) {
      // Need to make sure the push command precedes any subsequent commands added to any render pass.
      for (const cmds of this._commands)
        cmds.push(push);
    } else {
      // May want to add hilite commands as well - add the push command to that pass.
      this._commands[this._forcedRenderPass].push(push);
      this._commands[RenderPass.Hilite].push(push);
    }

    func();

    // Remove push command from any passes that didn't receive any commands; add the pop command to any passes that did.
    if (RenderPass.None === this._forcedRenderPass) {
      for (const cmds of this._commands) {
        assert(0 < cmds.length);
        if (0 < cmds.length && cmds[cmds.length - 1] === push)
          cmds.pop();
        else
          cmds.push(pop);
      }
    } else {
      assert(0 < this._commands[this._forcedRenderPass].length);
      assert(0 < this._commands[RenderPass.Hilite].length);

      let cmds = this._commands[this._forcedRenderPass];
      if (cmds[cmds.length - 1] === push)
        cmds.pop();
      else
        cmds.push(pop);

      cmds = this._commands[RenderPass.Hilite];
      if (cmds[cmds.length - 1] === push)
        cmds.pop();
      else
        cmds.push(pop);
    }
  }

  public pushAndPopBranch(branch: Branch, func: () => void): void {
    const animState = this.getAnimationBranchState(branch);
    if (animState?.omit)
      return;

    if (animState?.clip)
      this.pushAndPop(new PushClipCommand(animState.clip as ClipVolume), PopClipCommand.instance, () => this._pushAndPopBranch(branch, func));
    else
      this._pushAndPopBranch(branch, func);
  }

  private _pushAndPopBranch(branch: Branch, func: () => void): void {
    this._stack.pushBranch(branch);
    if (branch.planarClassifier)
      branch.planarClassifier.pushBatchState(this._batchState);

    this.pushAndPop(new PushBranchCommand(branch), PopBranchCommand.instance, func);

    this._stack.pop();
  }

  public pushAndPopState(state: BranchState, func: () => void): void {
    this._stack.pushState(state);
    this.pushAndPop(new PushStateCommand(state), PopBranchCommand.instance, func);
    this._stack.pop();
  }

  public clear(): void {
    assert(this._batchState.isEmpty);
    this._clearCommands();
  }

  private _clearCommands(): void {
    this._commands.forEach((cmds: DrawCommands) => { cmds.splice(0); });
    this._layers.clear();
  }

  public initForPickOverlays(sceneOverlays: GraphicList, overlayDecorations: GraphicList | undefined): void {
    this._clearCommands();

    this._addTranslucentAsOpaque = true;

    for (const sceneGf of sceneOverlays)
      (sceneGf as Graphic).addCommands(this);

    if (undefined !== overlayDecorations) {
      this.pushAndPopState(this.target.decorationsState, () => {
        for (const overlay of overlayDecorations) {
          const gf = overlay as Graphic;
          if (gf.isPickable)
            gf.addCommands(this);
        }
      });
    }

    this._addTranslucentAsOpaque = false;
  }

  public initForReadPixels(gfx: TargetGraphics): void {
    this.clear();

    // Set flag to force translucent geometry to be put into the opaque pass.
    this._addTranslucentAsOpaque = true;

    // Add the scene graphics.
    this.addGraphics(gfx.foreground);

    // Also add any pickable decorations.
    if (undefined !== gfx.decorations)
      this.addPickableDecorations(gfx.decorations);

    // Also background map is pickable
    this.addBackgroundMapGraphics(gfx.background);

    this._addTranslucentAsOpaque = false;

    this.setupClassificationByVolume();
    this._layers.outputCommands();
  }

  public initForRender(gfx: TargetGraphics): void {
    this.clear();

    this.addGraphics(gfx.foreground);
    this.addBackgroundMapGraphics(gfx.background);
    this.addOverlayGraphics(gfx.overlays);

    const dynamics = gfx.dynamics;
    if (dynamics && dynamics.length > 0)
      this.addDecorations(dynamics);

    const dec = gfx.decorations;
    if (undefined !== dec) {
      this.addBackground(dec.viewBackground as Graphic);

      this.addSkyBox(dec.skyBox as Graphic);

      if (undefined !== dec.normal && 0 < dec.normal.length)
        this.addGraphics(dec.normal);

      if (undefined !== dec.world && 0 < dec.world.length)
        this.addWorldDecorations(dec.world);

      this.pushAndPopState(this.target.decorationsState, () => {
        if (undefined !== dec.viewOverlay && 0 < dec.viewOverlay.length)
          this.addDecorations(dec.viewOverlay, RenderPass.ViewOverlay);

        if (undefined !== dec.worldOverlay && 0 < dec.worldOverlay.length)
          this.addDecorations(dec.worldOverlay, RenderPass.WorldOverlay);
      });
    }

    this.setupClassificationByVolume();
    this._layers.outputCommands();
  }

  public addPrimitive(prim: Primitive): void {
    // ###TODO Would be nice if we could detect outside active volume here, but active volume only applies to specific render passes
    // if (this.target.isGeometryOutsideActiveVolume(prim.cachedGeometry))
    //   return;

    if (undefined !== this._frustumPlanes) { // See if we can cull this primitive.
      if (RenderPass.Classification === prim.getRenderPass(this.target)) {
        const geom = prim.cachedGeometry;
        geom.computeRange(this._scratchRange);
        let frustum = Frustum.fromRange(this._scratchRange, this._scratchFrustum);
        frustum = frustum.transformBy(this.target.currentTransform, frustum);
        if (FrustumPlanes.Containment.Outside === this._frustumPlanes.computeFrustumContainment(frustum)) {
          return;
        }
      }
    }

    const command = new PrimitiveCommand(prim);
    this.addPrimitiveCommand(command);

    if (RenderPass.None === this._forcedRenderPass && prim.isEdge) {
      const vf: ViewFlags = this.target.currentViewFlags;
      if (vf.renderMode !== RenderMode.Wireframe && vf.hiddenEdges)
        this.addPrimitiveCommand(command, RenderPass.HiddenEdge);
    }
  }

  public addBranch(branch: Branch): void {
    this.pushAndPopBranch(branch, () => {
      branch.branch.entries.forEach((entry: RenderGraphic) => (entry as Graphic).addCommands(this));
    });
  }

  public computeBatchHiliteRenderPass(batch: Batch): RenderPass {
    let pass = RenderPass.Hilite;
    if (batch.graphic instanceof MeshGraphic) {
      const mg = batch.graphic;
      if (SurfaceType.VolumeClassifier === mg.surfaceType)
        pass = RenderPass.HiliteClassification;
    } else if (batch.graphic instanceof GraphicsArray) {
      const ga = batch.graphic;
      if (ga.graphics[0] instanceof MeshGraphic) {
        const mg = ga.graphics[0];
        if (SurfaceType.VolumeClassifier === mg.surfaceType)
          pass = RenderPass.HiliteClassification;
      } else if (ga.graphics[0] instanceof Branch) {
        const b = ga.graphics[0];
        if (b.branch.entries.length > 0 && b.branch.entries[0] instanceof MeshGraphic) {
          const mg = b.branch.entries[0];
          if (SurfaceType.VolumeClassifier === mg.surfaceType)
            pass = RenderPass.HiliteClassification;
        }
      }
    }
    return pass;
  }

  public addBatch(batch: Batch): void {
    if (batch.locateOnly && !this.target.isReadPixelsInProgress)
      return;

    // Batches (aka element tiles) should only draw during ordinary (translucent or opaque) passes.
    // They may draw during both, or neither.
    // NB: This is no longer true - pickable overlay decorations are defined as Batches. Problem?
    // assert(RenderPass.None === this._forcedRenderPass);
    assert(!this._opaqueOverrides && !this._translucentOverrides);
    assert(undefined === this._curBatch);

    // If all features are overridden to be invisible, draw no graphics in this batch
    const overrides = batch.getOverrides(this.target);
    if (overrides.allHidden)
      return;

    if (!batch.range.isNull) {
      // ###TODO Would be nice if we could detect outside active volume here, but active volume only applies to specific render passes
      // if (this.target.isRangeOutsideActiveVolume(batch.range))
      //   return;

      if (undefined !== this._frustumPlanes) {
        let frustum = Frustum.fromRange(batch.range, this._scratchFrustum);
        frustum = frustum.transformBy(this.target.currentTransform, frustum);
        if (FrustumPlanes.Containment.Outside === this._frustumPlanes.computeFrustumContainment(frustum)) {
          return;
        }
      }
    }

    const classifier = this._stack.top.planarClassifier;

    this._batchState.push(batch, true);

    this.pushAndPop(new PushBatchCommand(batch), PopBatchCommand.instance, () => {
      if (this.currentViewFlags.transparency) {
        this._opaqueOverrides = overrides.anyOpaque;
        this._translucentOverrides = overrides.anyTranslucent;

        if (undefined !== classifier) {
          this._opaqueOverrides = this._opaqueOverrides || classifier.anyOpaque;
          this._translucentOverrides = this._translucentOverrides || classifier.anyTranslucent;
        }
      }

      // If we have an active volume classifier then force all batches for the reality data being classified into a special render pass.
      let savedForcedRenderPass = RenderPass.None;
      if (undefined !== this.target.activeVolumeClassifierModelId && batch.featureTable.modelId === this.target.activeVolumeClassifierModelId) {
        savedForcedRenderPass = this._forcedRenderPass;
        this._forcedRenderPass = RenderPass.VolumeClassifiedRealityData;
      }

      (batch.graphic as Graphic).addCommands(this);

      if (RenderPass.VolumeClassifiedRealityData === this._forcedRenderPass)
        this._forcedRenderPass = savedForcedRenderPass;

      // If the batch contains hilited features, need to render them in the hilite pass
      const anyHilited = overrides.anyHilited;
      const planarClassifierHilited = undefined !== classifier && classifier.anyHilited;
      if (anyHilited || planarClassifierHilited)
        (batch.graphic as Graphic).addHiliteCommands(this, planarClassifierHilited ? RenderPass.HilitePlanarClassification : this.computeBatchHiliteRenderPass(batch));

    });

    this._opaqueOverrides = this._translucentOverrides = false;
    this._batchState.pop();
  }

  // Define a culling frustum. Commands associated with Graphics whose ranges do not intersect the frustum will be skipped.
  public setCheckRange(frustum: Frustum) { this._frustumPlanes = new FrustumPlanes(frustum); }
  // Clear the culling frustum.
  public clearCheckRange(): void { this._frustumPlanes = undefined; }

  private setupClassificationByVolume(): void {
    // To make it easier to process the classifiers individually, set up a secondary command list for them where they
    // are each separated by their own pushes & pops so that they can easily be drawn individually.  This now supports
    // nested branches and batches.
    const groupedCmds = this._commands[RenderPass.Classification];
    const byIndexCmds = this._commands[RenderPass.ClassificationByIndex];
    const pushCommands: DrawCommands = []; // will contain current set of pushes ahead of a primitive
    for (const cmd of groupedCmds) {
      switch (cmd.opcode) {
        case "pushBranch":
        case "pushBatch":
        case "pushState":
          pushCommands.push(cmd);
          break;
        case "drawPrimitive":
          for (const pushCmd of pushCommands) {
            byIndexCmds.push(pushCmd);
          }
          byIndexCmds.push(cmd);
          for (let i = pushCommands.length - 1; i >= 0; --i) {
            if ("pushBatch" === pushCommands[i].opcode)
              byIndexCmds.push(PopBatchCommand.instance);
            else // should be eith pushBranch or pushState opcode
              byIndexCmds.push(PopBranchCommand.instance);
          }
          break;
        case "popBatch":
        case "popBranch":
          pushCommands.pop();
          break;
      }
    }
  }
}
