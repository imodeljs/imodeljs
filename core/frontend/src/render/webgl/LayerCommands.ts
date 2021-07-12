/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, compareNumbers, compareStrings, SortedArray } from "@bentley/bentleyjs-core";
import {
  DrawCommand, DrawCommands, PopBatchCommand, PopBranchCommand, PopCommand, PushBatchCommand, PushBranchCommand, PushCommand,
} from "./DrawCommand";
import { Layer, LayerContainer } from "./Layer";
import { RenderCommands } from "./RenderCommands";
import { RenderPass } from "./RenderFlags";
import { Target } from "./Target";

type OpCode = "Idle" | "Container" | "Branch" | "Batch" | "Layer";

abstract class State {
  public readonly map: LayerCommandMap;
  protected abstract get opcode(): OpCode;

  protected constructor(map: LayerCommandMap) {
    this.map = map;
  }

  protected executeTransition(newState: State, func: () => void): void {
    this.map.state = newState;
    func();
    newState.exit();
    this.map.state = this;
  }

  protected exit(): void { }

  protected throwStateError(operation: string): void {
    // Using assert because these are intended for developers.
    assert(false, `Invalid layer command: operation '${operation}' unimplemented for state '${this.opcode}'`);
  }

  public processLayers(_container: LayerContainer, _func: () => void): void {
    this.throwStateError("processLayers");
  }

  public pushAndPop(push: PushCommand, _pop: PopCommand, func: () => void): void {
    if ("pushBatch" === push.opcode)
      this.processBatch(push, func);
    else if ("pushBranch" === push.opcode)
      this.processBranch(push, func);
    else
      this.throwStateError("unhandled push command");
  }

  protected processBranch(_push: PushBranchCommand, _func: () => void): void {
    this.throwStateError("processBranch");
  }

  protected processBatch(_push: PushBatchCommand, _func: () => void): void {
    this.throwStateError("processBatch");
  }

  public set currentLayer(_layer: Layer | undefined) {
    this.throwStateError("setCurrentLayer");
  }

  public addCommands(_commands: DrawCommand[]): void {
    this.throwStateError("addCommands");
  }
}

class IdleState extends State {
  protected get opcode(): OpCode { return "Idle"; }

  public constructor(map: LayerCommandMap) {
    super(map);
  }

  public override processLayers(container: LayerContainer, func: () => void): void {
    this.executeTransition(new ContainerState(this, container), func);
  }
}

class ContainerState extends State {
  public readonly elevation: number;
  protected get opcode(): OpCode { return "Container"; }

  public constructor(idle: IdleState, container: LayerContainer) {
    super(idle.map);
    this.elevation = container.elevation;
  }

  protected override processBranch(push: PushBranchCommand, func: () => void): void {
    this.executeTransition(new BranchState(this, push), func);
  }
}

class BranchState extends State {
  public readonly pushCommand: PushBranchCommand;
  public readonly containerState: ContainerState;
  private readonly _layerCommands = new Set<LayerCommands>();

  protected get opcode(): OpCode { return "Branch"; }

  public constructor(containerState: ContainerState, pushCommand: PushBranchCommand) {
    super(containerState.map);
    this.containerState = containerState;
    this.pushCommand = pushCommand;
  }

  protected override processBatch(push: PushBatchCommand, func: () => void): void {
    this.executeTransition(new BatchState(this, push), func);
  }

  public markLayer(cmds: LayerCommands): void {
    if (!this._layerCommands.has(cmds)) {
      cmds.commands.push(this.pushCommand);
      this._layerCommands.add(cmds);
    }
  }

  protected override exit(): void {
    for (const cmds of this._layerCommands)
      cmds.commands.push(PopBranchCommand.instance);
  }
}

class BatchState extends State {
  public readonly branchState: BranchState;
  public readonly pushCommand: PushBatchCommand;

  protected get opcode(): OpCode { return "Batch"; }

  public constructor(branchState: BranchState, pushCommand: PushBatchCommand) {
    super(branchState.map);
    this.branchState = branchState;
    this.pushCommand = pushCommand;
  }

  public override set currentLayer(layer: Layer | undefined) {
    if (undefined === layer)
      this.throwStateError("currentLayer = undefined");
    else
      this.map.state = new LayerState(this, layer);
  }
}

class LayerState extends State {
  private readonly _batchState: BatchState;
  public readonly commands: LayerCommands;

  protected get opcode(): OpCode { return "Layer"; }

  public constructor(batchState: BatchState, layer: Layer) {
    super(batchState.map);
    this._batchState = batchState;

    this.commands = this.map.getCommands(layer, batchState.branchState.containerState.elevation);
    this._batchState.branchState.markLayer(this.commands);
    this.commands.commands.push(batchState.pushCommand);
  }

  public override set currentLayer(layer: Layer | undefined) {
    if (undefined === layer) {
      this.commands.commands.push(PopBatchCommand.instance);
      this.map.state = this._batchState;
    } else {
      this.throwStateError("currentLayer != undefined");
    }
  }

  public override pushAndPop(push: PushCommand, pop: PopCommand, func: () => void): void {
    this.commands.commands.push(push);
    func();
    this.commands.commands.push(pop);
  }

  public override addCommands(commands: DrawCommand[]): void {
    for (const command of commands)
      this.commands.commands.push(command);
  }
}

/** DrawCommands associated with one Layer, drawn during the Layers render pass. */
class LayerCommands {
  public readonly layerId: string;
  public readonly priority: number;
  public readonly elevation: number;
  public readonly commands: DrawCommand[] = [];

  public constructor(layerId: string, priority: number, elevation: number) {
    this.layerId = layerId;
    this.priority = priority;
    this.elevation = elevation;
  }
}

class LayerCommandMap extends SortedArray<LayerCommands> {
  public readonly target: Target;
  public state: State;

  public constructor(target: Target) {
    // Layers with different view Z draw in ascending order by Z.
    // Layers with same elevation draw in ascending order by priority.
    // Layers with same elevation and priority draw in indeterminate order.
    super((lhs: LayerCommands, rhs: LayerCommands) => {
      let cmp = compareNumbers(lhs.elevation, rhs.elevation);
      if (0 === cmp) {
        cmp = compareNumbers(lhs.priority, rhs.priority);
        if (0 === cmp)
          cmp = compareStrings(lhs.layerId, rhs.layerId);
      }

      return cmp;
    });

    this.target = target;
    this.state = new IdleState(this);
  }

  public override clear(): void {
    super.clear();
    assert(this.state instanceof IdleState);
  }

  public getCommands(layer: Layer, elevation: number): LayerCommands {
    for (const entry of this._array)
      if (entry.layerId === layer.layerId && entry.elevation === elevation)
        return entry;

    const cmds = new LayerCommands(layer.layerId, layer.getPriority(this.target), elevation);
    this.insert(cmds);
    return cmds;
  }

  public outputCommands(cmds: DrawCommand[]): void {
    for (const entry of this._array)
      for (const cmd of entry.commands)
        cmds.push(cmd);
  }
}

/** @internal */
export class LayerCommandLists {
  private readonly _maps: LayerCommandMap[] = [];
  private readonly _renderCommands: RenderCommands;
  private _activeMap?: LayerCommandMap;

  public constructor(cmds: RenderCommands) {
    this._renderCommands = cmds;
  }

  public clear(): void {
    this._maps.length = 0;
  }

  public processLayers(container: LayerContainer, func: () => void): void {
    assert(undefined === this._activeMap);
    const pass = container.renderPass;
    this._activeMap = this._maps[pass];
    if (undefined === this._activeMap) {
      this._activeMap = new LayerCommandMap(this._renderCommands.target);
      this._maps[pass] = this._activeMap;
    }

    this._activeMap.state.processLayers(container, func);
    this._activeMap = undefined;
  }

  public set currentLayer(layer: Layer | undefined) {
    assert(undefined !== this._activeMap);
    this._activeMap.state.currentLayer = layer;
  }

  public addCommands(cmds: DrawCommands): void {
    assert(undefined !== this._activeMap);
    this._activeMap.state.addCommands(cmds);
  }

  public pushAndPop(push: PushCommand, pop: PopCommand, func: () => void): void {
    assert(undefined !== this._activeMap);
    this._activeMap.state.pushAndPop(push, pop, func);
  }

  public outputCommands(): void {
    this.outputCommandsForPass(RenderPass.OpaqueLayers);
    this.outputCommandsForPass(RenderPass.TranslucentLayers);
    this.outputCommandsForPass(RenderPass.OverlayLayers);
  }

  private outputCommandsForPass(pass: RenderPass): void {
    const map = this._maps[pass];
    if (undefined !== map)
      map.outputCommands(this._renderCommands.getCommands(pass));
  }
}
