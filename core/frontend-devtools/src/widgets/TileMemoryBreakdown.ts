/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widgets
 */

import { IModelApp, IModelConnection, RenderMemory, Tile } from "@bentley/imodeljs-frontend";

interface TileMemoryCounter {
  numTiles: number;
  bytesUsed: number;
}

enum TileMemorySelector {
  Selected, // Tiles selected for display by at least one viewport.
  Ancestors, // Ancestors of selected tiles, themselves not selected for display by any viewport.
  Descendants, // Descendants of selected tiles, themselves not selected for display by any viewport.
  Orphaned, // Tiles not selected for display having no ancestors nor descendants selected for display.
  Count,
}

class TileMemoryTracer {
  private readonly _stats = new RenderMemory.Statistics();
  private readonly _processedTiles = new Set<Tile>();
  public readonly counters: TileMemoryCounter[] = [];
  public numSelected = 0;

  public get numTiles() {
    return this._processedTiles.size;
  }

  public constructor() {
    for (let i = 0; i < TileMemorySelector.Count; i++)
        this.counters.push({ numTiles: 0, bytesUsed: 0 });
  }

  public update(): void {
    this.reset();

    const imodels = new Set<IModelConnection>();
    const selectedTiles = new Set<Tile>();
    IModelApp.viewManager.forEachViewport((vp) => {
      imodels.add(vp.iModel);
      const tiles = IModelApp.tileAdmin.getTilesForViewport(vp)?.selected;
      if (tiles)
        for (const tile of tiles)
          selectedTiles.add(tile);
    });

    for (const selected of selectedTiles)
      this.add(selected, TileMemorySelector.Selected);

    for (const selected of selectedTiles) {
      this.processParent(selected.parent);
      this.processChildren(selected.children);
    }

    for (const imodel of imodels) {
      imodel.tiles.forEachTreeOwner((owner) => {
        const tree = owner.tileTree;
        if (tree)
          this.processOrphan(tree.rootTile);
      });
    }
  }

  private reset(): void {
    this._processedTiles.clear();
    this.numSelected = 0;
    for (const counter of this.counters)
      counter.numTiles = counter.bytesUsed = 0;
  }

  private add(tile: Tile, selector: TileMemorySelector): void {
    this._processedTiles.add(tile);
    this._stats.clear();
    tile.collectStatistics(this._stats);

    const bytesUsed = this._stats.totalBytes;
    if (bytesUsed > 0) {
      const counter = this.counters[selector];
      ++counter.numTiles;
      counter.bytesUsed += bytesUsed;
    }
  }

  private processParent(parent: Tile | undefined): void {
    if (parent && !this._processedTiles.has(parent)) {
      this.add(parent, TileMemorySelector.Ancestors);
      this.processParent(parent.parent);
    }
  }

  private processChildren(children: Tile[] | undefined): void {
    if (!children)
      return;

    for (const child of children) {
      if (!this._processedTiles.has(child)) {
        this.add(child, TileMemorySelector.Descendants);
        this.processChildren(child.children);
      }
    }
  }

  private processOrphan(tile: Tile): void {
    if (!this._processedTiles.has(tile))
      this.add(tile, TileMemorySelector.Orphaned);

    const children = tile.children;
    if (children)
      for (const child of children)
        this.processOrphan(child);
  }
}

/*
export class TileMemoryBreakdown {
  private readonly _tracer = new TileMemoryTracer();
  private readonly _div: HTMLDivElement;
  private _curIntervalId?: NodeJS.Timer;

  public constructor(parent: HTMLElement) {
    createCheck
}
  */
