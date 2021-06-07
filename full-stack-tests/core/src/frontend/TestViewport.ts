/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Id64String, SortedArray } from "@bentley/bentleyjs-core";
import { ColorDef, Feature, GeometryClass } from "@bentley/imodeljs-common";
import {
  IModelApp, IModelConnection, OffScreenViewport, Pixel, ScreenViewport, Tile, TileTreeLoadStatus, Viewport, ViewRect,
} from "@bentley/imodeljs-frontend";

function compareFeatures(lhs?: Feature, rhs?: Feature): number {
  if (undefined === lhs && undefined === rhs)
    return 0;
  else if (undefined === lhs)
    return -1;
  else if (undefined === rhs)
    return 1;
  else
    return lhs.compare(rhs);
}

export function comparePixelData(lhs: Pixel.Data, rhs: Pixel.Data): number {
  let diff = lhs.distanceFraction - rhs.distanceFraction;
  if (0 === diff) {
    diff = lhs.type - rhs.type;
    if (0 === diff) {
      diff = lhs.planarity - rhs.planarity;
      if (0 === diff) {
        diff = compareFeatures(lhs.feature, rhs.feature);
      }
    }
  }

  return diff;
}

export class PixelDataSet extends SortedArray<Pixel.Data> {
  public constructor() {
    super((lhs: Pixel.Data, rhs: Pixel.Data) => comparePixelData(lhs, rhs));
  }

  public get array(): Pixel.Data[] { return this._array; }

  public containsFeature(elemId?: Id64String, subcatId?: Id64String, geomClass?: GeometryClass) {
    return this.containsWhere((pxl) =>
      (undefined === elemId || pxl.elementId === elemId) &&
      (undefined === subcatId || pxl.subCategoryId === subcatId) &&
      (undefined === geomClass || pxl.geometryClass === geomClass));
  }
  public containsElement(id: Id64String) { return this.containsWhere((pxl) => pxl.elementId === id); }
  public containsPlanarity(planarity: Pixel.Planarity) { return this.containsWhere((pxl) => pxl.planarity === planarity); }
  public containsGeometryType(type: Pixel.GeometryType) { return this.containsWhere((pxl) => pxl.type === type); }
  public containsGeometry(type: Pixel.GeometryType, planarity: Pixel.Planarity) { return this.containsWhere((pxl) => pxl.type === type && pxl.planarity === planarity); }
  public containsWhere(criterion: (pxl: Pixel.Data) => boolean) {
    for (const pixel of this.array)
      if (criterion(pixel))
        return true;

    return false;
  }
}

export class Color {
  public readonly v: number;
  public readonly r: number;
  public readonly g: number;
  public readonly b: number;
  public readonly a: number;

  // val is uint32 repr as AABBGGRR
  public constructor(val: number) {
    this.v = val;

    // ">>> 0" required to force unsigned because javascript is a brilliantly-designed language.
    this.r = ((val & 0x000000ff) >>> 0x00) >>> 0;
    this.g = ((val & 0x0000ff00) >>> 0x08) >>> 0;
    this.b = ((val & 0x00ff0000) >>> 0x10) >>> 0;
    this.a = ((val & 0xff000000) >>> 0x18) >>> 0;
  }

  public static from(val: number) { return new Color(val); }
  public static fromRgba(r: number, g: number, b: number, a: number) {
    const v = (r | (g << 0x08) | (b << 0x10) | (a << 0x18)) >>> 0;
    return Color.from(v);
  }

  public static fromColorDef(def: ColorDef): Color {
    const colors = def.colors;
    return Color.fromRgba(colors.r, colors.g, colors.b, 0xff - colors.t);
  }

  public compare(rhs: Color): number {
    return this.v - rhs.v;
  }

  public equalsColorDef(def: ColorDef): boolean {
    const colors = def.colors;
    return colors.r === this.r && colors.g === this.g && colors.b === this.b && colors.t === 0xff - this.a;
  }
}

export class ColorSet extends SortedArray<Color> {
  public constructor() { super((lhs: Color, rhs: Color) => lhs.compare(rhs)); }
  public get array(): Color[] { return this._array; }
}

// Read depth, geometry type, and feature for each pixel. Return only the unique ones.
function readUniquePixelData(vp: Viewport, readRect?: ViewRect, excludeNonLocatable = false): PixelDataSet {
  const rect = undefined !== readRect ? readRect : vp.viewRect;
  const set = new PixelDataSet();
  vp.readPixels(rect, Pixel.Selector.All, (pixels: Pixel.Buffer | undefined) => {
    if (undefined === pixels)
      return;

    const sRect = rect.clone();
    sRect.left = vp.cssPixelsToDevicePixels(sRect.left);
    sRect.right = vp.cssPixelsToDevicePixels(sRect.right);
    sRect.bottom = vp.cssPixelsToDevicePixels(sRect.bottom);
    sRect.top = vp.cssPixelsToDevicePixels(sRect.top);

    for (let x = sRect.left; x < sRect.right; x++)
      for (let y = sRect.top; y < sRect.bottom; y++)
        set.insert(pixels.getPixel(x, y));
  }, excludeNonLocatable);

  return set;
}

function readPixel(vp: Viewport, x: number, y: number, excludeNonLocatable?: boolean): Pixel.Data {
  const pixels = readUniquePixelData(vp, new ViewRect(x, y, x + 1, y + 1), excludeNonLocatable);
  expect(pixels.length).to.equal(1);
  return pixels.array[0];
}

// Read colors for each pixel; return the unique ones.
function readUniqueColors(vp: Viewport, readRect?: ViewRect): ColorSet {
  const rect = undefined !== readRect ? readRect : vp.viewRect;
  const buffer = vp.readImage(rect)!;
  expect(buffer).not.to.be.undefined;
  const u32 = new Uint32Array(buffer.data.buffer);
  const colors = new ColorSet();
  for (const rgba of u32)
    colors.insert(Color.from(rgba));

  return colors;
}

function readColor(vp: Viewport, x: number, y: number): Color {
  const colors = readUniqueColors(vp, new ViewRect(x, y, x + 1, y + 1));
  expect(colors.length).to.equal(1);
  return colors.array[0];
}

function areAllChildTilesLoaded(parent?: Tile): boolean {
  if (!parent)
    return true;
  else if (TileTreeLoadStatus.Loading === (parent as any)._childrenLoadStatus)
    return false;

  const kids = parent.children;
  if (!kids)
    return true;

  for (const kid of kids)
    if (!areAllChildTilesLoaded(kid))
      return false;

  return true;
}

function areAllTilesLoaded(vp: Viewport): boolean {
  if (vp.numRequestedTiles > 0 || !vp.areAllTileTreesLoaded)
    return false;

  // In addition to ViewState.areAllTileTreesLoaded, ensure all child tiles are loaded (for map tiles).
  let allLoaded = true;
  vp.forEachTileTreeRef((ref) => {
    allLoaded = allLoaded && ref.isLoadingComplete && areAllChildTilesLoaded(ref.treeOwner.tileTree?.rootTile);
  });

  return allLoaded;
}

// Utility functions added to Viewport by TestViewport.
export interface TestableViewport {
  // Block until all tiles appropriate for rendering the current view have been loaded.
  waitForAllTilesToRender(): Promise<void>;
  // Asynchronously draw one frame. In the case of an on-screen viewport, this blocks until the next tick of the ViewManager's render loop.
  drawFrame(): Promise<void>;
  // Read pixel data within rectangular region and return unique pixels.
  readUniquePixelData(readRect?: ViewRect, excludeNonLocatable?: boolean): PixelDataSet;
  // Read pixel colors within rectangular region and return unique colors.
  readUniqueColors(readRect?: ViewRect): ColorSet;
  // Return the color of the pixel at (x, y).
  readColor(x: number, y: number): Color;
  // Return the pixel at (x, y).
  readPixel(x: number, y: number, excludeNonLocatable?: boolean): Pixel.Data;
  // True if all tiles appropriate for rendering the current view have been loaded.
  areAllTilesLoaded: boolean;
}

class OffScreenTestViewport extends OffScreenViewport implements TestableViewport {
  public readUniquePixelData(readRect?: ViewRect, excludeNonLocatable = false): PixelDataSet { return readUniquePixelData(this, readRect, excludeNonLocatable); }
  public readUniqueColors(readRect?: ViewRect): ColorSet { return readUniqueColors(this, readRect); }
  public readColor(x: number, y: number): Color { return readColor(this, x, y); }
  public readPixel(x: number, y: number, excludeNonLocatable?: boolean): Pixel.Data { return readPixel(this, x, y, excludeNonLocatable); }
  public get areAllTilesLoaded(): boolean { return areAllTilesLoaded(this); }

  public async waitForAllTilesToRender(): Promise<void> {
    this.renderFrame();

    // NB: ToolAdmin loop is not turned on, and this viewport is not tracked by ViewManager - must manually pump tile request scheduler.
    IModelApp.tileAdmin.process();

    if (this.areAllTilesLoaded)
      return;

    await new Promise<void>((resolve: any) => setTimeout(resolve, 100));

    // This viewport isn't added to ViewManager, so it won't be notified (and have its scene invalidated) when new tiles become loaded.
    this.invalidateScene();
    return this.waitForAllTilesToRender();
  }

  public static async createTestViewport(viewId: Id64String, imodel: IModelConnection, width: number, height: number): Promise<OffScreenTestViewport> {
    const view = await imodel.views.load(viewId);
    const rect = new ViewRect(0, 0, width, height);
    const vp = this.create({ view, viewRect: rect}) as OffScreenTestViewport;
    expect(vp).instanceof(OffScreenTestViewport);
    return vp;
  }

  public async drawFrame(): Promise<void> {
    this.renderFrame();

    // NB: ToolAdmin loop is not turned on, and this viewport is not tracked by ViewManager - must manually pump tile request scheduler.
    IModelApp.tileAdmin.process();
  }
}

export class ScreenTestViewport extends ScreenViewport implements TestableViewport {
  private _frameRendered: boolean = false;

  public readUniquePixelData(readRect?: ViewRect, excludeNonLocatable = false): PixelDataSet { return readUniquePixelData(this, readRect, excludeNonLocatable); }
  public readUniqueColors(readRect?: ViewRect): ColorSet { return readUniqueColors(this, readRect); }
  public readColor(x: number, y: number): Color { return readColor(this, x, y); }
  public readPixel(x: number, y: number, excludeNonLocatable?: boolean): Pixel.Data { return readPixel(this, x, y, excludeNonLocatable); }
  public get areAllTilesLoaded(): boolean { return areAllTilesLoaded(this); }

  private async waitForRenderFrame(): Promise<void> {
    if (this._frameRendered) {
      this._frameRendered = false;
      return;
    }

    this.onRender.addOnce((_) => { this._frameRendered = true; });
    await new Promise<void>((resolve: any) => requestAnimationFrame(resolve));
    return this.waitForRenderFrame();
  }

  public async waitForAllTilesToRender(): Promise<void> {
    // NB: This viewport is registered with ViewManager, so render loop and tile request scheduler are pumping.
    await this.drawFrame();
    if (this.areAllTilesLoaded)
      return;

    await this.waitForRenderFrame();
    return this.waitForAllTilesToRender();
  }

  public async drawFrame(): Promise<void> {
    // Let the render loop tick - expect renderFrame() to be invoked based on state of SyncFlags.
    return this.waitForRenderFrame();
  }

  public dispose(): void {
    if (!this.isDisposed) {
      IModelApp.viewManager.dropViewport(this, false); // do not allow dropViewport() to call dispose()...
      super.dispose();
      document.body.removeChild(this.parentDiv);
    }
  }

  public static async createTestViewport(viewId: Id64String, imodel: IModelConnection, width: number, height: number): Promise<ScreenTestViewport> {
    const div = document.createElement("div");
    div.style.width = `${width}px`;
    div.style.height = `${height}px`;

    // Ensure viewport is exact specified dimensions - not fit to containing document.
    div.style.position = "absolute";
    div.style.top = div.style.left = "0px";

    document.body.appendChild(div);

    const view = await imodel.views.load(viewId);

    // NB: Don't allow ACS triad etc to interfere with tests...
    view.viewFlags.acsTriad = view.viewFlags.grid = false;

    const vp = this.create(div, view) as ScreenTestViewport;
    expect(vp).instanceof(ScreenTestViewport);
    IModelApp.viewManager.addViewport(vp);
    return vp;
  }
}

// Represents an on-screen or off-screen viewport.
export type TestViewport = Viewport & TestableViewport;

// Create an off-screen viewport for tests.
export async function createOffScreenTestViewport(viewId: Id64String, imodel: IModelConnection, width: number, height: number): Promise<TestViewport> {
  return OffScreenTestViewport.createTestViewport(viewId, imodel, width, height);
}

// Create an on-screen viewport for tests. The viewport is added to the ViewManager on construction, and dropped on disposal.
export async function createOnScreenTestViewport(viewId: Id64String, imodel: IModelConnection, width: number, height: number, devicePixelRatio?: number): Promise<ScreenTestViewport> {
  const vp = await ScreenTestViewport.createTestViewport(viewId, imodel, width, height);
  if (undefined !== devicePixelRatio) {
    const debugControl = vp.target.debugControl;
    if (undefined !== debugControl)
      debugControl.devicePixelRatioOverride = devicePixelRatio;
  }

  return vp;
}

export async function testOnScreenViewport(viewId: Id64String, imodel: IModelConnection, width: number, height: number, test: (vp: ScreenTestViewport) => Promise<void>, devicePixelRatio?: number): Promise<void> {
  if (!IModelApp.initialized)
    return;

  // ###TODO: Make ScreenTestViewport integrate properly with the (non-continuous) render loop...
  const onscreen = await createOnScreenTestViewport(viewId, imodel, width, height, devicePixelRatio);
  onscreen.continuousRendering = true;
  try {
    await test(onscreen);
  } finally {
    onscreen.continuousRendering = false;
    onscreen.dispose();
  }
}

export async function testOffScreenViewport(viewId: Id64String, imodel: IModelConnection, width: number, height: number, test: (vp: TestViewport) => Promise<void>): Promise<void> {
  if (!IModelApp.initialized)
    return;

  const offscreen = await createOffScreenTestViewport(viewId, imodel, width, height);
  try {
    await test(offscreen);
  } finally {
    offscreen.dispose();
  }
}

// Execute a test against both an off-screen and on-screen viewport.
export async function testViewports(viewId: Id64String, imodel: IModelConnection, width: number, height: number, test: (vp: TestViewport) => Promise<void>, devicePixelRatio?: number): Promise<void> {
  if (!IModelApp.initialized)
    return;

  await testOnScreenViewport(viewId, imodel, width, height, test, devicePixelRatio);
  await testOffScreenViewport(viewId, imodel, width, height, test);
}

/** Execute a test against both an off-screen and on-screen viewport at varying device pixel ratios. */
export async function testViewportsWithDpr(imodel: IModelConnection, rect: ViewRect, test: (vp: TestViewport) => Promise<void>): Promise<void> {
  const devicePixelRatios = [1.0, 1.25, 1.5, 2.0];
  for (const dpr of devicePixelRatios)
    await testViewports("0x24", imodel, rect.width, rect.height, test, dpr);
}
