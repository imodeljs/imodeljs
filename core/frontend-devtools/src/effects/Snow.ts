/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Effects
 */

import { dispose } from "@bentley/bentleyjs-core";
import { Point2d, Range1d, Range2d, Vector2d } from "@bentley/geometry-core";
import { RenderTexture } from "@bentley/imodeljs-common";
import {
  DecorateContext, Decorator, GraphicType, imageElementFromUrl, IModelApp, ParticleCollectionBuilder, ParticleProps, Tool, Viewport,
} from "@bentley/imodeljs-frontend";
import { parseToggle } from "../tools/parseToggle";
import { randomFloat, randomInteger } from "./Random";

/** Represents one particle displayed by a [[SnowDecorator]].
 * Particle positions are in [CoordSystem.View]($frontend).
 * @beta
 */
export interface SnowParticle extends ParticleProps {
  /** Make x, y, and z from ParticleProps writable. */
  x: number;
  y: number;
  z: number;

  /** Current velocity, in pixels per second. */
  velocity: Vector2d;
}

/** Parameters controlling how a [[SnowDecorator]] works.
 * @beta
 */
export interface SnowParams {
  /** The number of snow particles to produce. This could alternatively be expressed as a density so that small viewports would not be more crowded than larger ones. */
  numParticles: number;
  /** Range from which to randomly select each particle's size, in pixels. */
  sizeRange: Range1d;
  /** Range from which to randomly select each particle's transparency. */
  transparencyRange: Range1d;
  /** Range from which to randomly select each particle's initial velocity, in pixels per second. */
  velocityRange: Range2d;
  /** Range from which to randomly select an acceleration to apply to each particle's velocity each frame, in pixels per second squared, to simulate wind. */
  accelerationRange: Range2d;
  /** Wind velocity in pixels per second in X. */
  windVelocity: number;
}

/** The default snow effect parameters used by newly-created SnowDecorators. */
const defaultSnowParams: SnowParams = {
  numParticles: 2000,
  sizeRange: Range1d.createXX(3, 22),
  transparencyRange: Range1d.createXX(0, 50),
  velocityRange: new Range2d(-30, 50, 30, 130),
  accelerationRange: new Range2d(-1, -0.25, 1, 0.25),
  windVelocity: 0,
};

/** Simulates snowfall in a [Viewport]($frontend) using particle effects.
 * @see [[SnowEffect]] for a [Tool]($frontend) that toggles this decorator.
 * @see [ParticleCollectionBuilder]($frontend) for defining custom particle effects.
 * @beta
 */
export class SnowDecorator implements Decorator {
  /** The viewport being decorated. */
  public readonly viewport: Viewport;
  /** Invoked when this decorator is to be destroyed. */
  public readonly dispose: VoidFunction;
  /** The initial width and height of the viewport, from which we randomly select each particle's initial position. */
  private readonly _dimensions: Point2d;
  /** The list of particles being drawn. */
  private readonly _particles: SnowParticle[] = [];
  /** The image to display for each particle. */
  private _texture?: RenderTexture;
  /** The last time `updateParticles()` was invoked, in milliseconds. */
  private _lastUpdateTime: number;
  private readonly _params: SnowParams;

  private constructor(viewport: Viewport, texture: RenderTexture | undefined) {
    this._params = { ...defaultSnowParams };
    this.viewport = viewport;
    this._dimensions = new Point2d(viewport.viewRect.width, viewport.viewRect.height);
    this._lastUpdateTime = Date.now();
    this._texture = texture;

    // Tell the viewport to re-render the decorations every frame so that the snow particles animate smoothly.
    const removeOnRender = viewport.onRender.addListener(() => viewport.invalidateDecorations());

    // When the viewport is resized, replace this decorator with a new one to match the new dimensions.
    const removeOnResized = viewport.onResized.addListener(() => {
      // Transfer ownership of the texture to the new decorator.
      const tex = this._texture;
      this._texture = undefined;
      this.dispose();
      new SnowDecorator(viewport, tex);
    });

    // When the viewport is destroyed, dispose of this decorator too.
    const removeOnDispose = viewport.onDisposed.addListener(() => this.dispose());
    const removeDecorator = IModelApp.viewManager.addDecorator(this);

    this.dispose = () => {
      removeDecorator();
      removeOnRender();
      removeOnDispose();
      removeOnResized();
      this._texture = dispose(this._texture);
      SnowDecorator._decorators.delete(viewport);
    };

    SnowDecorator._decorators.set(viewport, this);

    // Initialize the particles.
    for (let i = 0; i < this._params.numParticles; i++)
      this._particles.push(this.emit(true));
  }

  public decorate(context: DecorateContext): void {
    if (context.viewport !== this.viewport || !this._texture)
      return;

    // Update the particles.
    const now = Date.now();
    const deltaMillis = now - this._lastUpdateTime;
    this._lastUpdateTime = now;
    this.updateParticles(deltaMillis / 1000);

    // Create particle graphics.
    const builder = ParticleCollectionBuilder.create({
      viewport: this.viewport,
      isViewCoords: true,
      texture: this._texture,
      size: (this._params.sizeRange.high - this._params.sizeRange.low) / 2,
    });

    for (const particle of this._particles)
      builder.addParticle(particle);

    const graphic = builder.finish();
    if (graphic)
      context.addDecoration(GraphicType.ViewOverlay, graphic);
  }

  /** Change some of the parameters affecting this decorator. */
  public configure(params: Partial<SnowParams>): void {
    for (const key of Object.keys(params)) {
      const val = (params as any)[key];
      if (undefined !== val)
        (this._params as any)[key] = val;
    }
  }

  /** Emit a new particle with randomized properties. */
  private emit(randomizeHeight: boolean): SnowParticle {
    return {
      x: randomInteger(0, this._dimensions.x),
      y: randomizeHeight ? randomInteger(0, this._dimensions.y) : 0,
      z: 0,
      size: randomInteger(this._params.sizeRange.low, this._params.sizeRange.high),
      transparency: randomInteger(this._params.transparencyRange.low, this._params.transparencyRange.high),
      velocity: new Vector2d(randomFloat(this._params.velocityRange.low.x, this._params.velocityRange.high.x),
        randomFloat(this._params.velocityRange.low.y, this._params.velocityRange.high.y)),
    };
  }

  // Update the positions and velocities of all the particles based on the amount of time that has passed since the last update.
  private updateParticles(elapsedSeconds: number): void {
    // Determine if someone changed the desired number of particles.
    const particleDiscrepancy = this._params.numParticles - this._particles.length;
    if (particleDiscrepancy > 0) {
      // Birth new particles up to the new maximum.
      for (let i = 0; i < particleDiscrepancy; i++)
        this._particles.push(this.emit(true));
    } else {
      // Destroy extra particles.
      this._particles.length = this._params.numParticles;
    }

    const acceleration = new Vector2d();
    const velocity = new Vector2d();
    for (let i = 0; i < this._particles.length; i++) {
      // Apply some acceleration to produce random drift.
      const particle = this._particles[i];
      acceleration.set(randomFloat(this._params.accelerationRange.low.x, this._params.accelerationRange.high.x),
        randomFloat(this._params.accelerationRange.low.y, this._params.accelerationRange.high.y));

      acceleration.scale(elapsedSeconds, acceleration);
      particle.velocity.plus(acceleration, particle.velocity);

      // Apply velocity.
      particle.velocity.clone(velocity);
      velocity.scale(elapsedSeconds, velocity);
      particle.x += velocity.x;
      particle.y += velocity.y;

      // Apply wind
      particle.x += this._params.windVelocity * elapsedSeconds;

      // Particles that travel beyond the viewport's left or right edges wrap around to the other side.
      if (particle.x < 0)
        particle.x = this._dimensions.x - 1;
      else if (particle.x >= this._dimensions.x)
        particle.x = 0;

      // Particles that travel beyond the viewport's bottom or top edges are replaced by newborn particles.
      if (particle.y < 0 || particle.y >= this._dimensions.y)
        this._particles[i] = this.emit(false);
    }
  }

  private static readonly _decorators = new Map<Viewport, SnowDecorator>();

  /** Toggle this decorator for the specified viewport.
   * @param viewport The viewport to which the effect should be applied or removed.
   * @param enable `true` to enable the effect, `false` to disable it, or `undefined` to toggle the current state.
   */
  public static async toggle(viewport: Viewport, enable?: boolean): Promise<void> {
    const decorator = this._decorators.get(viewport);
    if (undefined === enable)
      enable = undefined === decorator;

    if (undefined !== decorator && !enable)
      decorator.dispose();
    else if (undefined === decorator && enable) {
      // Create a texture to use for the particles.
      // Note: the decorator takes ownership of the texture, and disposes of it when the decorator is disposed.
      const isOwned = true;
      const params = new RenderTexture.Params(undefined, undefined, isOwned);
      const image = await imageElementFromUrl("./sprites/particle_snow.png");
      const texture = IModelApp.renderSystem.createTextureFromImage(image, true, undefined, params);

      new SnowDecorator(viewport, texture);
    }
  }
}

/** Toggles a decorator that simulates snow using particle effects.
 * @see [[SnowDecorator]] for the implementation of the decorator.
 * @beta
 */
export class SnowEffect extends Tool {
  public static override toolId = "SnowEffect";

  public override run(enable?: boolean): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp)
      SnowDecorator.toggle(vp, enable); // eslint-disable-line @typescript-eslint/no-floating-promises

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}
