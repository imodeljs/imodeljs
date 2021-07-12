/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { dispose } from "@bentley/bentleyjs-core";
import { Transform } from "@bentley/geometry-core";
import { ElementAlignedBox3d, PackedFeatureTable } from "@bentley/imodeljs-common";
import { IModelApp, IModelAppOptions } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { ViewRect } from "../ViewRect";
import { Decorations } from "./Decorations";
import { GraphicBranch, GraphicBranchOptions } from "./GraphicBranch";
import { GraphicBuilderOptions } from "./GraphicBuilder";
import { Pixel } from "./Pixel";
import { PrimitiveBuilder } from "./primitives/geometry/GeometryListBuilder";
import { PointCloudArgs } from "./primitives/PointCloudPrimitive";
import { MeshParams, PointStringParams, PolylineParams } from "./primitives/VertexTable";
import { GraphicList, RenderGraphic } from "./RenderGraphic";
import { RenderMemory } from "./RenderMemory";
import { RenderPlan } from "./RenderPlan";
import { RenderSystem } from "./RenderSystem";
import { RenderTarget } from "./RenderTarget";
import { Scene } from "./Scene";

/** Contains extensible mock implementations of the various components of a RenderSystem, intended for use in tests.
 * Use these for tests instead of the default RenderSystem wherever possible because:
 *  (1) Electron has a bug on Windows in which it fails to obtain a WebGLRenderingContext when running inside a VM (e.g., during CI job); and
 *  (2) To decouple the logic which uses aspects of the RenderSystem from the full implementation.
 * Any and all of these types can be extended for the purposes of specific tests.
 * To use this:
 *  (1) If overriding anything in the implementation supplied herein, pass a SystemFactory function to MockRender.App.systemFactory.
 *  (2) Call MockRender.App.startup() instead of IModelApp.startup() before tests begin.
 *  (3) Likewise call MockRender.App.shutdown() when finished. This resets the SystemFactory to its default.
 * @internal
 */
export namespace MockRender {
  /** @internal */
  export abstract class Target extends RenderTarget {
    protected constructor(private readonly _system: RenderSystem) { super(); }

    public get renderSystem(): RenderSystem { return this._system; }
    public get wantInvertBlackBackground() { return false; }
    public get analysisFraction() { return 0; }
    public set analysisFraction(_fraction: number) { }
    public changeScene(_scene: Scene) { }
    public changeDynamics(_dynamics?: GraphicList) { }
    public changeDecorations(_decs: Decorations) { }
    public changeRenderPlan(_plan: RenderPlan) { }
    public drawFrame(_sceneTime?: number) { }
    public updateViewRect() { return false; }
    public readPixels(_rect: ViewRect, _selector: Pixel.Selector, receiver: Pixel.Receiver, _excludeNonLocatable: boolean) { receiver(undefined); }
    public get screenSpaceEffects(): Iterable<string> { return []; }
    public set screenSpaceEffects(_effects: Iterable<string>) { }
  }

  /** @internal */
  export class OnScreenTarget extends Target {
    public constructor(system: RenderSystem, private readonly _canvas: HTMLCanvasElement) { super(system); }

    public get viewRect() { return new ViewRect(0, 0, this._canvas.clientWidth, this._canvas.clientHeight); }
    public setViewRect(_rect: ViewRect, _temp: boolean) { }
  }

  /** @internal */
  export class OffScreenTarget extends Target {
    public constructor(system: RenderSystem, private readonly _viewRect: ViewRect) { super(system); }

    public get viewRect() { return this._viewRect; }
    public setViewRect(rect: ViewRect, _temp: boolean) { this._viewRect.setFrom(rect); }
  }

  /** @internal */
  export class Builder extends PrimitiveBuilder {
    public constructor(system: System, options: GraphicBuilderOptions) {
      super(system, options);
    }
  }

  /** @internal */
  export class Graphic extends RenderGraphic {
    public constructor() { super(); }

    public dispose() { }
    public collectStatistics(_stats: RenderMemory.Statistics): void { }
  }

  /** @internal */
  export class List extends Graphic {
    public constructor(public readonly graphics: RenderGraphic[]) { super(); }

    public override dispose() {
      for (const graphic of this.graphics)
        dispose(graphic);

      this.graphics.length = 0;
    }
  }

  /** @internal */
  export class Branch extends Graphic {
    public constructor(public readonly branch: GraphicBranch, public readonly transform: Transform, public readonly options?: GraphicBranchOptions) { super(); }

    public override dispose() { this.branch.dispose(); }
  }

  /** @internal */
  export class Batch extends Graphic {
    public constructor(public readonly graphic: RenderGraphic, public readonly featureTable: PackedFeatureTable, public readonly range: ElementAlignedBox3d) { super(); }

    public override dispose() {
      dispose(this.graphic);
    }
  }

  /** @internal */
  export class System extends RenderSystem {
    public get isValid() { return true; }
    public dispose(): void { }
    public override get maxTextureSize() { return 4096; }

    public constructor() { super(); }

    public doIdleWork(): boolean { return false; }

    public createTarget(canvas: HTMLCanvasElement): OnScreenTarget { return new OnScreenTarget(this, canvas); }
    public createOffscreenTarget(rect: ViewRect): RenderTarget { return new OffScreenTarget(this, rect); }

    public createGraphic(options: GraphicBuilderOptions) {
      return new Builder(this, options);
    }

    public createGraphicList(primitives: RenderGraphic[]) { return new List(primitives); }
    public createGraphicBranch(branch: GraphicBranch, transform: Transform, options?: GraphicBranchOptions) { return new Branch(branch, transform, options); }
    public createBatch(graphic: RenderGraphic, features: PackedFeatureTable, range: ElementAlignedBox3d) { return new Batch(graphic, features, range); }

    public override createMesh(_params: MeshParams) { return new Graphic(); }
    public override createPolyline(_params: PolylineParams) { return new Graphic(); }
    public override createPointString(_params: PointStringParams) { return new Graphic(); }
    public override createPointCloud(_args: PointCloudArgs, _imodel: IModelConnection) { return new Graphic(); }
  }

  /** @internal */
  export type SystemFactory = () => RenderSystem;

  /** An implementation of IModelApp which uses a MockRender.System by default.
   * @internal
   */
  export class App {
    public static systemFactory: SystemFactory = () => App.createDefaultRenderSystem();

    public static async startup(opts?: IModelAppOptions): Promise<void> {
      opts = opts ? opts : {};
      opts.renderSys = this.systemFactory();
      await IModelApp.startup(opts);
    }
    public static async shutdown(): Promise<void> {
      this.systemFactory = () => App.createDefaultRenderSystem();
      await IModelApp.shutdown();
    }

    protected static createDefaultRenderSystem() { return new System(); }
  }
}
