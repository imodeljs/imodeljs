/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Effects
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { Point3d, Range1d, Vector3d } from "@bentley/geometry-core";
import { RenderTexture } from "@bentley/imodeljs-common";
import {
  DecorateContext, GraphicType, HitDetail, imageElementFromUrl, IModelApp, IModelConnection, ParticleCollectionBuilder, ParticleProps, Tool,
} from "@bentley/imodeljs-frontend";
import { randomFloat, randomFloatInRange, randomIntegerInRange, randomPositionInRange } from "./Random";

/** Represents one particle in the system. */
class Particle implements ParticleProps {
  /** Current position in the particle system's local coordinate space. */
  public readonly position: Point3d;
  /** Current velocity in meters per second. */
  public readonly velocity: Vector3d;
  /** Current age in seconds, incremented each frame. */
  public age = 0;
  /** Maximum age in seconds. When `this.age` exceeds `this.lifetime`, the particle expires. */
  public readonly lifetime: number;
  /** Particle size in meters. */
  public size: number;
  /** Particle transparency in [0..255]. */
  public transparency = 0;

  public get x() { return this.position.x; }
  public get y() { return this.position.y; }
  public get z() { return this.position.z; }

  public constructor(position: Point3d, velocity: Vector3d, lifetime: number, size: number) {
    this.position = position;
    this.velocity = velocity;
    this.lifetime = lifetime;
    this.size = size;
  }

  public get isExpired() { return this.age >= this.lifetime; }
}

/** Emits particles in a sphere with its center at the origin.
 * Each particle is emitted from the center of the sphere with random velocity toward the surface of the sphere.
 */
class ParticleEmitter {
  /** Range from which each particle's initial speed in meters per second will be selected. */
  public readonly speedRange = Range1d.createXX(1, 2);
  /** Range from which each particle's lifetime in seconds will be selected. */
  public readonly lifetimeRange = Range1d.createXX(5, 10);
  /** Range from which each particle's size in meters will be selected. */
  public readonly sizeRange = Range1d.createXX(0.2, 1.0);
  /** Range from which the number of particles emitted will be selected. */
  public numParticlesRange = Range1d.createXX(1600, 2200);

  /** Emit an explosion of particles from the center of the sphere. */
  public emit(): Particle[] {
    const particles = [];
    const numParticles = randomIntegerInRange(this.numParticlesRange);
    for (let i = 0; i < numParticles; i++) {
      const velocity = new Vector3d(randomFloat(-1.0, 1.0), randomFloat(-1.0, 1.0), randomFloat(-1.0, 1.0));
      velocity.normalizeInPlace();
      velocity.scaleInPlace(randomFloatInRange(this.speedRange));

      const lifetime = randomFloatInRange(this.lifetimeRange);
      const size = randomFloatInRange(this.sizeRange);
      particles.push(new Particle(new Point3d(0, 0, 0), velocity, lifetime, size));
    }

    return particles;
  }
}

class ParticleSystem {
  private readonly _origin: Point3d;
  private readonly _pickableId: Id64String;
  private readonly _emitter = new ParticleEmitter();
  private _numEmissions: number;
  private readonly _texture: RenderTexture;
  private _lastUpdateTime: number;
  private _particles: Particle[] = [];
  private readonly _scratchVector3d = new Vector3d();
  private _dispose?: VoidFunction;
  /** Acceleration in Z applied to particles, in meters per second squared. */
  public gravity = -3;

  public static numEmissionsRange = Range1d.createXX(1, 5);

  public constructor(texture: RenderTexture, iModel: IModelConnection, numEmissions: number) {
    this._texture = texture;
    this._pickableId = iModel.transientIds.next;
    this._numEmissions = numEmissions;
    this._lastUpdateTime = Date.now();

    this._origin = randomPositionInRange(iModel.projectExtents);

    this._dispose = iModel.onClose.addListener(() => this.dispose());
  }

  public dispose(): void {
    if (this._dispose) {
      this._dispose();
      this._dispose = undefined;
    }

    IModelApp.viewManager.dropDecorator(this);
    this._texture.dispose();
  }

  public update(): void {
    const now = Date.now();
    let deltaMillis = now - this._lastUpdateTime;
    deltaMillis = Math.min(100, deltaMillis);
    this._lastUpdateTime = now;

    let numParticles = this._particles.length;
    if (numParticles === 0) {
      this._numEmissions--;
      if (this._numEmissions < 0)
        this.dispose();
      else
        this._particles = this._emitter.emit();

      return;
    }

    const elapsedSeconds = deltaMillis / 1000;
    for (let i = 0; i < numParticles; i++) {
      const particle = this._particles[i];
      this.updateParticle(particle, elapsedSeconds);
      if (particle.isExpired) {
        this._particles[i] = this._particles[numParticles - 1];
        --i;
        --numParticles;
      }
    }

    this._particles.length = numParticles;
  }

  private updateParticle(particle: Particle, elapsedSeconds: number): void {
    const velocity = particle.velocity.clone(this._scratchVector3d);
    velocity.scale(elapsedSeconds, velocity);
    velocity.z += elapsedSeconds * this.gravity;
    particle.position.addInPlace(velocity);
    particle.transparency = 255 * (particle.age / particle.lifetime);

    particle.age += elapsedSeconds;
  }

  public decorate(context: DecorateContext): void {
    if (!context.viewport.view.isSpatialView())
      return;

    this.update();

    const builder = ParticleCollectionBuilder.create({
      viewport: context.viewport,
      texture: this._texture,
      size: (this._emitter.sizeRange.high - this._emitter.sizeRange.low) / 2,
      transparency: 0,
      origin: this._origin,
      pickableId: this._pickableId,
    });

    for (const particle of this._particles)
      builder.addParticle(particle);

    const graphic = builder.finish();
    if (graphic) {
      context.addDecoration(GraphicType.WorldDecoration, graphic);
      context.viewport.onRender.addOnce((vp) => vp.invalidateDecorations());
    }
  }

  public testDecorationHit(id: Id64String): boolean {
    return id === this._pickableId;
  }

  public async getDecorationToolTip(_hit: HitDetail): Promise<HTMLElement | string> {
    return "Explosion effect";
  }

  public static async addDecorator(iModel: IModelConnection): Promise<void> {
    // Note: The decorator takes ownership of the texture, and disposes of it when the decorator is disposed.
    const isOwned = true;
    const params = new RenderTexture.Params(undefined, undefined, isOwned);
    const image = await imageElementFromUrl("./sprites/particle_explosion.png");
    const texture = IModelApp.renderSystem.createTextureFromImage(image, true, undefined, params);
    if (texture)
      IModelApp.viewManager.addDecorator(new ParticleSystem(texture, iModel, randomIntegerInRange(this.numEmissionsRange)));
  }
}

/** This tool applies an explosion particle effect used for testing [ParticleCollectionBuilder]($frontend).
 * @beta
 */
export class ExplosionEffect extends Tool {
  public static override toolId = "ExplosionEffect";

  /** This method runs the tool, applying an explosion particle effect. */
  public override run(): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp)
      ParticleSystem.addDecorator(vp.iModel); // eslint-disable-line @typescript-eslint/no-floating-promises

    return true;
  }
}
