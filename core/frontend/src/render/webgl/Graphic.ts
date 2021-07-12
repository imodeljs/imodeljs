/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose } from "@bentley/bentleyjs-core";
import { Transform } from "@bentley/geometry-core";
import { ElementAlignedBox3d, FeatureAppearanceProvider, PackedFeatureTable, ThematicDisplayMode, ViewFlags } from "@bentley/imodeljs-common";
import { IModelConnection } from "../../IModelConnection";
import { FeatureSymbology } from "../FeatureSymbology";
import { GraphicBranch, GraphicBranchFrustum, GraphicBranchOptions } from "../GraphicBranch";
import { GraphicList, RenderGraphic } from "../RenderGraphic";
import { BatchOptions } from "../GraphicBuilder";
import { RenderMemory } from "../RenderMemory";
import { ClipVolume } from "./ClipVolume";
import { WebGLDisposable } from "./Disposable";
import { FeatureOverrides } from "./FeatureOverrides";
import { PlanarClassifier } from "./PlanarClassifier";
import { Primitive } from "./Primitive";
import { RenderCommands } from "./RenderCommands";
import { RenderPass } from "./RenderFlags";
import { Target } from "./Target";
import { TextureDrape } from "./TextureDrape";
import { EdgeSettings } from "./EdgeSettings";
import { ThematicSensors } from "./ThematicSensors";

/** @internal */
export abstract class Graphic extends RenderGraphic implements WebGLDisposable {
  public abstract addCommands(_commands: RenderCommands): void;
  public abstract get isDisposed(): boolean;
  public abstract get isPickable(): boolean;
  public addHiliteCommands(_commands: RenderCommands, _pass: RenderPass): void { assert(false); }
  public toPrimitive(): Primitive | undefined { return undefined; }
}

export class GraphicOwner extends Graphic {
  private readonly _graphic: Graphic;

  public constructor(graphic: Graphic) {
    super();
    this._graphic = graphic;
  }

  public get graphic(): RenderGraphic { return this._graphic; }

  private _isDisposed = false;
  public get isDisposed(): boolean { return this._isDisposed; }
  public dispose(): void { this._isDisposed = true; }
  public disposeGraphic(): void {
    this.graphic.dispose();
  }
  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.graphic.collectStatistics(stats);
  }

  public addCommands(commands: RenderCommands): void {
    this._graphic.addCommands(commands);
  }
  public override get isPickable(): boolean {
    return this._graphic.isPickable;
  }
  public override addHiliteCommands(commands: RenderCommands, pass: RenderPass): void {
    this._graphic.addHiliteCommands(commands, pass);
  }
  public override toPrimitive(): Primitive | undefined {
    return this._graphic.toPrimitive();
  }
}

/** Transiently assigned to a Batch while rendering a frame, reset afterward. Used to provide context for pick IDs.
 * @internal
 */
export interface BatchContext {
  batchId: number;
  iModel?: IModelConnection;
}

interface PerTargetBatchData {
  readonly target: Target;
  featureOverrides?: FeatureOverrides;
  thematicSensors?: ThematicSensors;
}

function disposePerTargetBatchData(ptd: PerTargetBatchData): void {
  ptd.featureOverrides = dispose(ptd.featureOverrides);
  ptd.thematicSensors = dispose(ptd.thematicSensors);
}

/** @internal */
export class Batch extends Graphic {
  public readonly graphic: RenderGraphic;
  public readonly featureTable: PackedFeatureTable;
  public readonly range: ElementAlignedBox3d;
  private readonly _context: BatchContext = { batchId: 0 };
  private readonly _perTargetData: PerTargetBatchData[] = [];
  private readonly _options: BatchOptions;

  // Chiefly for debugging.
  public get tileId(): string | undefined {
    return this._options.tileId;
  }

  public get locateOnly(): boolean {
    return true === this._options.locateOnly;
  }

  public get batchId() { return this._context.batchId; }
  public get batchIModel() { return this._context.iModel; }
  public setContext(batchId: number, iModel: IModelConnection | undefined) {
    this._context.batchId = batchId;
    this._context.iModel = iModel;
  }
  public resetContext() {
    this._context.batchId = 0;
    this._context.iModel = undefined;
  }

  public constructor(graphic: RenderGraphic, features: PackedFeatureTable, range: ElementAlignedBox3d, options?: BatchOptions) {
    super();
    this.graphic = graphic;
    this.featureTable = features;
    this.range = range;
    this._options = options ?? {};
  }

  private _isDisposed = false;
  public get isDisposed(): boolean {
    return this._isDisposed && 0 === this._perTargetData.length;
  }

  // Note: This does not remove FeatureOverrides from the array, but rather disposes of the WebGL resources they contain
  public dispose() {
    dispose(this.graphic);

    for (const ptd of this._perTargetData) {
      ptd.target.onBatchDisposed(this);
      disposePerTargetBatchData(ptd);
    }

    this._perTargetData.length = 0;
    this._isDisposed = true;
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.graphic.collectStatistics(stats);
    stats.addFeatureTable(this.featureTable.byteLength);
    for (const ptd of this._perTargetData) {
      if (ptd.featureOverrides)
        stats.addFeatureOverrides(ptd.featureOverrides.byteLength);

      if (ptd.thematicSensors)
        stats.addThematicTexture(ptd.thematicSensors.bytesUsed);
    }
  }

  public addCommands(commands: RenderCommands): void {
    commands.addBatch(this);
  }

  public override get isPickable(): boolean {
    return true;
  }

  private getPerTargetData(target: Target): PerTargetBatchData {
    let ptd = this._perTargetData.find((x) => x.target === target);
    if (!ptd) {
      ptd = { target };
      this._perTargetData.push(ptd);
      target.addBatch(this);
    }

    return ptd;
  }

  public getThematicSensors(target: Target): ThematicSensors {
    assert(target.plan.thematic !== undefined, "thematic display settings must exist");
    assert(target.plan.thematic.displayMode === ThematicDisplayMode.InverseDistanceWeightedSensors, "thematic display mode must be sensor-based");
    assert(target.plan.thematic.sensorSettings.sensors.length > 0, "must have at least one sensor to process");

    const ptd = this.getPerTargetData(target);
    if (ptd.thematicSensors && !ptd.thematicSensors.matchesTarget(target))
      ptd.thematicSensors = dispose(ptd.thematicSensors);

    if (!ptd.thematicSensors)
      ptd.thematicSensors = ThematicSensors.create(target, this.range);

    ptd.thematicSensors.update(target.uniforms.frustum.viewMatrix);

    return ptd.thematicSensors;
  }

  public getOverrides(target: Target): FeatureOverrides {
    const ptd = this.getPerTargetData(target);
    if (!ptd.featureOverrides) {
      ptd.featureOverrides = FeatureOverrides.createFromTarget(target, this._options);
      ptd.featureOverrides.initFromMap(this.featureTable);
    }

    ptd.featureOverrides.update(this.featureTable);
    return ptd.featureOverrides;
  }

  public onTargetDisposed(target: Target) {
    const index = this._perTargetData.findIndex((x) => x.target === target);
    if (-1 === index)
      return;

    const ptd = this._perTargetData[index];
    disposePerTargetBatchData(ptd);
    this._perTargetData.splice(index, 1);
  }
}

/** @internal */
export class Branch extends Graphic {
  public readonly branch: GraphicBranch;
  public localToWorldTransform: Transform;
  public readonly clips?: ClipVolume;
  public readonly planarClassifier?: PlanarClassifier;
  public readonly textureDrape?: TextureDrape;
  public readonly edgeSettings?: EdgeSettings;
  public readonly iModel?: IModelConnection; // used chiefly for readPixels to identify context of picked Ids.
  public readonly frustum?: GraphicBranchFrustum;
  public readonly appearanceProvider?: FeatureAppearanceProvider;

  public constructor(branch: GraphicBranch, localToWorld: Transform, viewFlags?: ViewFlags, opts?: GraphicBranchOptions) {
    super();
    this.branch = branch;
    this.localToWorldTransform = localToWorld;

    if (undefined !== viewFlags)
      branch.setViewFlags(viewFlags);

    if (!opts)
      return;

    this.appearanceProvider = opts.appearanceProvider;
    this.clips = opts.clipVolume as ClipVolume | undefined;
    this.iModel = opts.iModel;
    this.frustum = opts.frustum;

    if (opts.hline)
      this.edgeSettings = EdgeSettings.create(opts.hline);

    if (opts.classifierOrDrape instanceof PlanarClassifier)
      this.planarClassifier = opts.classifierOrDrape;
    else if (opts.classifierOrDrape instanceof TextureDrape)
      this.textureDrape = opts.classifierOrDrape;
  }

  public get isDisposed(): boolean {
    return 0 === this.branch.entries.length;
  }

  public dispose() {
    this.branch.dispose();
  }

  public override get isPickable(): boolean {
    return this.branch.entries.some((gf) => (gf as Graphic).isPickable);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.branch.collectStatistics(stats);
  }

  public addCommands(commands: RenderCommands): void {
    commands.addBranch(this);
  }

  public override addHiliteCommands(commands: RenderCommands, pass: RenderPass): void {
    commands.addHiliteBranch(this, pass);
  }
}

/** @internal */
export class WorldDecorations extends Branch {
  public constructor(viewFlags: ViewFlags) {
    super(new GraphicBranch(), Transform.identity, viewFlags);

    // World decorations ignore all the symbology overrides for the "scene" geometry...
    this.branch.symbologyOverrides = new FeatureSymbology.Overrides();
  }

  public init(decs: GraphicList): void {
    this.branch.clear();
    for (const dec of decs) {
      this.branch.add(dec);
    }
  }
}
/** @internal */
export class GraphicsArray extends Graphic {
  // Note: We assume the graphics array we get contains undisposed graphics to start
  constructor(public graphics: RenderGraphic[]) { super(); }

  public get isDisposed(): boolean { return 0 === this.graphics.length; }

  public override get isPickable(): boolean {
    return this.graphics.some((x) => (x as Graphic).isPickable);
  }

  public dispose() {
    for (const graphic of this.graphics)
      dispose(graphic);
    this.graphics.length = 0;
  }

  public addCommands(commands: RenderCommands): void {
    for (const graphic of this.graphics) {
      (graphic as Graphic).addCommands(commands);
    }
  }

  public override addHiliteCommands(commands: RenderCommands, pass: RenderPass): void {
    for (const graphic of this.graphics) {
      (graphic as Graphic).addHiliteCommands(commands, pass);
    }
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    for (const graphic of this.graphics)
      graphic.collectStatistics(stats);
  }
}
