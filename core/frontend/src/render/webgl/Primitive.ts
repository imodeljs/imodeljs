/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose } from "@bentley/bentleyjs-core";
import { InstancedGraphicParams } from "../InstancedGraphicParams";
import { RenderMemory } from "../RenderMemory";
import { PrimitiveVisibility } from "../RenderTarget";
import { CachedGeometry, LUTGeometry, SkySphereViewportQuadGeometry } from "./CachedGeometry";
import { DrawParams, PrimitiveCommand } from "./DrawCommand";
import { Graphic } from "./Graphic";
import { InstanceBuffers, InstancedGeometry } from "./InstancedGeometry";
import { RenderCommands } from "./RenderCommands";
import { RenderOrder, RenderPass } from "./RenderFlags";
import { ShaderProgramExecutor } from "./ShaderProgram";
import { System } from "./System";
import { Target } from "./Target";
import { TechniqueId } from "./TechniqueId";

/** @internal */
export class Primitive extends Graphic {
  public cachedGeometry: CachedGeometry;
  public isPixelMode: boolean = false;

  protected constructor(cachedGeom: CachedGeometry) { super(); this.cachedGeometry = cachedGeom; }

  public static create(createGeom: () => CachedGeometry | undefined, instances?: InstancedGraphicParams): Primitive | undefined {
    const instanceBuffers = undefined !== instances ? InstanceBuffers.create(instances, false) : undefined;
    if (undefined === instanceBuffers && undefined !== instances)
      return undefined;

    return this.createShared(createGeom, instanceBuffers);
  }

  public static createShared(createGeom: () => CachedGeometry | undefined, instances?: InstanceBuffers): Primitive | undefined {
    let geom = createGeom();
    if (undefined === geom)
      return undefined;

    if (undefined !== instances) {
      assert(geom instanceof LUTGeometry, "Invalid geometry type for instancing");
      geom = new InstancedGeometry(geom, true, instances);

      // Ensure range computed immediately so we can discard the Float32Array holding the instance transforms...
      geom.computeRange();
    }

    return new this(geom);
  }

  public get isDisposed(): boolean { return this.cachedGeometry.isDisposed; }
  public get isPickable() { return false; }

  public dispose() {
    dispose(this.cachedGeometry);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.cachedGeometry.collectStatistics(stats);
  }

  public getRenderPass(target: Target) {
    if (this.isPixelMode)
      return RenderPass.ViewOverlay;

    switch (target.primitiveVisibility) {
      case PrimitiveVisibility.Uninstanced:
        if (this.cachedGeometry.isInstanced)
          return RenderPass.None;
        break;
      case PrimitiveVisibility.Instanced:
        if (!this.cachedGeometry.isInstanced)
          return RenderPass.None;
        break;
    }

    return this.cachedGeometry.getRenderPass(target);
  }

  public get hasFeatures(): boolean { return this.cachedGeometry.hasFeatures; }

  public addCommands(commands: RenderCommands): void { commands.addPrimitive(this); }

  public override addHiliteCommands(commands: RenderCommands, pass: RenderPass): void {
    // Edges do not contribute to hilite pass.
    // Note that IsEdge() does not imply geom->ToEdge() => true...polylines can be edges too...
    if (!this.isEdge)
      commands.getCommands(pass).push(new PrimitiveCommand(this));
  }

  public get hasAnimation(): boolean { return this.cachedGeometry.hasAnimation; }
  public get isInstanced(): boolean { return this.cachedGeometry.isInstanced; }
  public get isLit(): boolean { return this.cachedGeometry.isLitSurface; }
  public get isEdge(): boolean { return this.cachedGeometry.isEdge; }
  public get renderOrder(): RenderOrder { return this.cachedGeometry.renderOrder; }
  public get hasMaterialAtlas(): boolean { return this.cachedGeometry.hasMaterialAtlas; }

  public override toPrimitive(): Primitive { return this; }

  private static _drawParams?: DrawParams;

  public static freeParams(): void { Primitive._drawParams = undefined; }

  public draw(shader: ShaderProgramExecutor): void {
    // ###TODO: local to world should be pushed before we're invoked...we shouldn't need to pass (or copy) it
    if (undefined === Primitive._drawParams)
      Primitive._drawParams = new DrawParams();

    const drawParams = Primitive._drawParams;
    drawParams.init(shader.params, this.cachedGeometry);
    shader.draw(drawParams);
  }

  public get techniqueId(): TechniqueId { return this.cachedGeometry.techniqueId; }
}

/** @internal */
export class SkyCubePrimitive extends Primitive {
  public constructor(cachedGeom: CachedGeometry) { super(cachedGeom); }

  public override draw(shader: ShaderProgramExecutor): void {
    // Alter viewport to maintain square aspect ratio of skybox images even as viewRect resizes
    const vh = shader.target.viewRect.height;
    const vw = shader.target.viewRect.width;
    if (vw > vh)
      System.instance.context.viewport(0, -(vw - vh) / 2, vw, vw);
    else
      System.instance.context.viewport(-(vh - vw) / 2, 0, vh, vh);

    super.draw(shader); // Draw the skybox cubemap

    System.instance.context.viewport(0, 0, vw, vh); // Restore viewport
  }
}

/** @internal */
export class SkySpherePrimitive extends Primitive {
  public constructor(cachedGeom: CachedGeometry) {
    super(cachedGeom);
    assert(cachedGeom instanceof SkySphereViewportQuadGeometry);
  }

  public override draw(shader: ShaderProgramExecutor): void {
    (this.cachedGeometry as SkySphereViewportQuadGeometry).initWorldPos(shader.target);
    super.draw(shader); // Draw the skybox sphere
  }
}
