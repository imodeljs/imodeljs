/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, IModelAppOptions } from "./IModelApp";
import { AnimationBranchStates } from "./render/GraphicBranch";
import { RenderSystem } from "./render/RenderSystem";
import { RenderTarget } from "./render/RenderTarget";
import { ViewRect } from "./ViewRect";

/**
 * A RenderTarget for applications that must run in environments where WebGL is not present.
 * This is typically used in tests.
 * @internal
 */
export class NullTarget extends RenderTarget {
  public get analysisFraction(): number { return 0; }
  public set analysisFraction(_fraction: number) { }
  public get renderSystem() { return undefined as any; }
  public get viewRect(): ViewRect { return new ViewRect(); }
  public get wantInvertBlackBackground(): boolean { return false; }
  public override get animationBranches(): AnimationBranchStates | undefined { return undefined; }
  public override set animationBranches(_branches: AnimationBranchStates | undefined) { }
  public onDestroy(): void { }
  public override reset(): void { }
  public changeScene(): void { }
  public changeDynamics(): void { }
  public changeDecorations(): void { }
  public changeRenderPlan(): void { }
  public drawFrame(_sceneMilSecElapsed?: number): void { }
  public override overrideFeatureSymbology(): void { }
  public override setHiliteSet(): void { }
  public override setFlashed(): void { }
  public setViewRect(): void { }
  public override onResized(): void { }
  public override dispose(): void { }
  public updateViewRect(): boolean { return false; }
  public readPixels(): void { }
  public override readImage() { return undefined; }
  public get screenSpaceEffects(): Iterable<string> { return []; }
  public set screenSpaceEffects(_effects: Iterable<string>) { }
}

/**
 * A RenderSystem for applications that must run in environments where WebGL is not present.
 * This is typically used in tests.
 * @internal
 */
export class NullRenderSystem extends RenderSystem {
  public get isValid(): boolean { return false; }
  public doIdleWork(): boolean { return false; }
  public createTarget() { return new NullTarget(); }
  public createOffscreenTarget() { return new NullTarget(); }
  public createGraphic() { return undefined as any; }
  public createGraphicList() { return undefined as any; }
  public createGraphicBranch() { return undefined as any; }
  public createBatch() { return undefined as any; }
  public dispose() { }
  public constructor() { super(); }
}

/**
 * A class for applications that must run in environments where WebGL is not present.
 * This is typically used in tests.
 * @internal
 */
export class NoRenderApp {
  public static async startup(opts?: IModelAppOptions): Promise<void> {
    opts = opts ? opts : {};
    opts.renderSys = new NullRenderSystem();
    await IModelApp.startup(opts);
  }
}
