/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

/** Contains metadata about memory consumed by the render system or aspect thereof.
 * @internal
 */
export namespace RenderMemory {
  /** Describes memory consumed by a particular type of resource.
   * @internal
   */
  export class Consumers {
    public totalBytes = 0; // total number of bytes consumed by all consumers
    public maxBytes = 0; // largest number of bytes consumed by a single consumer
    public count = 0; // total number of consumers of this type

    public addConsumer(numBytes: number): void {
      this.totalBytes += numBytes;
      this.maxBytes = Math.max(this.maxBytes, numBytes);
      ++this.count;
    }

    public clear(): void {
      this.totalBytes = this.maxBytes = this.count = 0;
    }
  }

  /** @internal */
  export enum BufferType {
    Surfaces = 0,
    VisibleEdges,
    SilhouetteEdges,
    PolylineEdges,
    Polylines,
    PointStrings,
    PointClouds,
    Instances,
    Terrain,
    RealityMesh,

    COUNT,
  }

  /** Describes memory consumed by GPU-allocated buffers.
   * @internal
   */
  export class Buffers extends Consumers {
    public readonly consumers: Consumers[];

    public constructor() {
      super();
      this.consumers = [];
      for (let i = 0; i < BufferType.COUNT; i++)
        this.consumers[i] = new Consumers();
    }

    public get surfaces() { return this.consumers[BufferType.Surfaces]; }
    public get visibleEdges() { return this.consumers[BufferType.VisibleEdges]; }
    public get silhouetteEdges() { return this.consumers[BufferType.SilhouetteEdges]; }
    public get polylineEdges() { return this.consumers[BufferType.PolylineEdges]; }
    public get polylines() { return this.consumers[BufferType.Polylines]; }
    public get pointStrings() { return this.consumers[BufferType.PointStrings]; }
    public get pointClouds() { return this.consumers[BufferType.PointClouds]; }
    public get instances() { return this.consumers[BufferType.Instances]; }
    public get terrain() { return this.consumers[BufferType.Terrain]; }
    public get reality() { return this.consumers[BufferType.RealityMesh]; }

    public override clear(): void {
      for (const consumer of this.consumers)
        consumer.clear();

      super.clear();
    }

    public addBuffer(type: BufferType, numBytes: number): void {
      this.addConsumer(numBytes);
      this.consumers[type].addConsumer(numBytes);
    }
  }

  /** @internal */
  export enum ConsumerType {
    Textures = 0,
    VertexTables,
    FeatureTables,
    FeatureOverrides,
    ClipVolumes,
    PlanarClassifiers,
    ShadowMaps,
    TextureAttachments,
    ThematicTextures,
    COUNT,
  }

  /** @internal */
  export class Statistics {
    private _totalBytes = 0;
    public readonly consumers: Consumers[];
    public readonly buffers = new Buffers();

    public constructor() {
      this.consumers = [];
      for (let i = 0; i < ConsumerType.COUNT; i++)
        this.consumers[i] = new Consumers();
    }

    public get totalBytes(): number { return this._totalBytes; }
    public get textures() { return this.consumers[ConsumerType.Textures]; }
    public get vertexTables() { return this.consumers[ConsumerType.VertexTables]; }
    public get featureTables() { return this.consumers[ConsumerType.FeatureTables]; }
    public get thematicTextures() { return this.consumers[ConsumerType.ThematicTextures]; }
    public get featureOverrides() { return this.consumers[ConsumerType.FeatureOverrides]; }
    public get clipVolumes() { return this.consumers[ConsumerType.ClipVolumes]; }
    public get planarClassifiers() { return this.consumers[ConsumerType.PlanarClassifiers]; }
    public get shadowMaps() { return this.consumers[ConsumerType.ShadowMaps]; }
    public get textureAttachments() { return this.consumers[ConsumerType.TextureAttachments]; }

    public addBuffer(type: BufferType, numBytes: number): void {
      this._totalBytes += numBytes;
      this.buffers.addBuffer(type, numBytes);
    }

    public addConsumer(type: ConsumerType, numBytes: number): void {
      this._totalBytes += numBytes;
      this.consumers[type].addConsumer(numBytes);
    }

    public clear(): void {
      this._totalBytes = 0;
      this.buffers.clear();
      for (const consumer of this.consumers)
        consumer.clear();
    }

    public addTexture(numBytes: number) { this.addConsumer(ConsumerType.Textures, numBytes); }
    public addVertexTable(numBytes: number) { this.addConsumer(ConsumerType.VertexTables, numBytes); }
    public addFeatureTable(numBytes: number) { this.addConsumer(ConsumerType.FeatureTables, numBytes); }
    public addThematicTexture(numBytes: number) { this.addConsumer(ConsumerType.ThematicTextures, numBytes); }
    public addFeatureOverrides(numBytes: number) { this.addConsumer(ConsumerType.FeatureOverrides, numBytes); }
    public addClipVolume(numBytes: number) { this.addConsumer(ConsumerType.ClipVolumes, numBytes); }
    public addPlanarClassifier(numBytes: number) { this.addConsumer(ConsumerType.PlanarClassifiers, numBytes); }
    public addShadowMap(numBytes: number) { this.addConsumer(ConsumerType.ShadowMaps, numBytes); }
    public addTextureAttachment(numBytes: number) { this.addConsumer(ConsumerType.TextureAttachments, numBytes); }

    public addSurface(numBytes: number) { this.addBuffer(BufferType.Surfaces, numBytes); }
    public addVisibleEdges(numBytes: number) { this.addBuffer(BufferType.VisibleEdges, numBytes); }
    public addSilhouetteEdges(numBytes: number) { this.addBuffer(BufferType.SilhouetteEdges, numBytes); }
    public addPolylineEdges(numBytes: number) { this.addBuffer(BufferType.PolylineEdges, numBytes); }
    public addPolyline(numBytes: number) { this.addBuffer(BufferType.Polylines, numBytes); }
    public addPointString(numBytes: number) { this.addBuffer(BufferType.PointStrings, numBytes); }
    public addPointCloud(numBytes: number) { this.addBuffer(BufferType.PointClouds, numBytes); }
    public addTerrain(numBytes: number) {
      this.addBuffer(BufferType.Terrain, numBytes);
    }
    public addRealityMesh(numBytes: number) {
      this.addBuffer(BufferType.RealityMesh, numBytes);
    }
    public addInstances(numBytes: number) { this.addBuffer(BufferType.Instances, numBytes); }
  }

  /** @internal */
  export interface Consumer {
    collectStatistics(stats: Statistics): void;
  }
}
