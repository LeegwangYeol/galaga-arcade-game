/**
 * Galaga Arcade Web Game — High-Performance Particle Explosion System
 * 
 * Features:
 * 1. Zero runtime Garbage Collection allocations via ObjectPool<Particle> with 250 capacity.
 * 2. Physical kinematics with exponential drag damping and gravitational drift.
 * 3. Authentic arcade explosion presets (Small Alien, Boss Galaga + Shockwave, Player Ship Debris, Tractor Beam Sparkles).
 * 4. Crisp pixel-art integer rendering on 224x288 virtual canvas.
 */

import { ObjectPool } from '../core/ObjectPool';
import type { Poolable, Vector2D } from '../types';
import { PALETTE } from '../renderer/SpriteRenderer';

export type ParticleType = 'SPARK' | 'DEBRIS' | 'SHOCKWAVE' | 'BEAM_SPARKLE';
export type ExplosionType = 'SMALL' | 'BOSS' | 'PLAYER' | 'HIT' | 'DOCKING';
export type AlphaCurve = 'linear' | 'quad' | 'flash';

/**
 * Individual particle entity satisfying the Poolable contract.
 */
export class Particle implements Poolable {
  public id: number = 0;
  public active: boolean = false;

  // Spatial Kinematics
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public ax: number = 0; // Horizontal acceleration
  public ay: number = 0; // Vertical acceleration (e.g. gravity)
  public drag: number = 0.95;

  // Visual Properties
  public color: string = PALETTE.WHITE;
  public size: number = 1;
  public width: number = 1;
  public height: number = 1;
  public rotation: number = 0;
  public vRot: number = 0; // Angular velocity (rad/s)
  public alphaCurve: AlphaCurve = 'linear';

  // Lifespan Timers
  public life: number = 0;
  public maxLife: number = 1.0;

  // Shockwave Ring Properties
  public isShockwave: boolean = false;
  public shockwaveRadius: number = 0;
  public shockwaveMaxRadius: number = 38;

  // Particle Category
  public type: ParticleType = 'SPARK';

  /**
   * Reset method invoked when recycling particle back to pool.
   */
  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
    this.drag = 0.95;
    this.color = PALETTE.WHITE;
    this.size = 1;
    this.width = 1;
    this.height = 1;
    this.rotation = 0;
    this.vRot = 0;
    this.alphaCurve = 'linear';
    this.life = 0;
    this.maxLife = 1.0;
    this.isShockwave = false;
    this.shockwaveRadius = 0;
    this.shockwaveMaxRadius = 38;
    this.type = 'SPARK';
  }

  /**
   * Returns current position as Vector2D.
   */
  public get position(): Vector2D {
    return { x: this.x, y: this.y };
  }

  /**
   * Returns current velocity as Vector2D.
   */
  public get velocity(): Vector2D {
    return { x: this.vx, y: this.vy };
  }
}

export interface ParticleSystemConfig {
  maxParticles?: number;
}

export class ParticleSystem {
  public static readonly DEFAULT_MAX_PARTICLES = 250;

  private pool: ObjectPool<Particle>;
  private nextParticleId: number = 1;

  // Pre-cached color arrays for zero-allocation palette lookups
  private static readonly SMALL_ALIEN_COLORS = [
    PALETTE.YELLOW,
    PALETTE.ORANGE,
    PALETTE.WHITE,
    PALETTE.RED,
  ];

  private static readonly BOSS_EXPLOSION_COLORS = [
    PALETTE.GREEN,
    PALETTE.BLUE_LIGHT,
    PALETTE.BLUE_CYAN,
    PALETTE.YELLOW,
    PALETTE.WHITE,
  ];

  private static readonly PLAYER_EXPLOSION_COLORS = [
    PALETTE.WHITE,
    PALETTE.RED,
    PALETTE.BLUE_LIGHT,
    PALETTE.BLUE_CYAN,
    PALETTE.YELLOW,
  ];

  private static readonly TRACTOR_SPARKLE_COLORS = [
    PALETTE.BLUE_CYAN,
    PALETTE.YELLOW,
    PALETTE.WHITE,
  ];

  private static readonly HIT_SPARK_COLORS = [
    PALETTE.YELLOW,
    PALETTE.WHITE,
  ];

  constructor(config?: ParticleSystemConfig) {
    const maxCapacity = config?.maxParticles ?? ParticleSystem.DEFAULT_MAX_PARTICLES;

    this.pool = new ObjectPool<Particle>({
      factory: () => {
        const p = new Particle();
        p.id = this.nextParticleId++;
        return p;
      },
      reset: (p) => p.reset(),
      initialSize: maxCapacity,
      maxSize: maxCapacity,
      autoExpand: false, // Strict zero-allocation upper bound
    });
  }

  // ==========================================================================
  // 1. Explosion Spawning Presets
  // ==========================================================================

  /**
   * Spawns an arcade explosion preset at the specified coordinates.
   */
  public spawnExplosion(x: number, y: number, type: ExplosionType = 'SMALL'): void {
    switch (type) {
      case 'SMALL':
        this.spawnSmallAlienExplosion(x, y);
        break;
      case 'BOSS':
        this.spawnBossExplosion(x, y);
        break;
      case 'PLAYER':
        this.spawnPlayerExplosion(x, y);
        break;
      case 'HIT':
        this.spawnHitSparks(x, y);
        break;
      case 'DOCKING':
        this.spawnDockingSparkles(x, y);
        break;
    }
  }

  /**
   * Preset 1: Small Alien Explosion (Zako, Goei, Transform)
   * 16-24 fiery yellow/orange/white/red sparks with 0.3s lifespan.
   */
  public spawnSmallAlienExplosion(x: number, y: number, particleCount: number = 20): void {
    const count = Math.max(16, Math.min(24, particleCount));
    const colors = ParticleSystem.SMALL_ALIEN_COLORS;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const baseAngle = (Math.PI * 2 * i) / count;
      const anglePerturbation = (Math.random() - 0.5) * 0.3;
      const angle = baseAngle + anglePerturbation;
      const speed = 40 + Math.random() * 50; // 40 - 90 px/s

      p.active = true;
      p.type = 'SPARK';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = 0;
      p.drag = 0.93 + Math.random() * 0.02; // 0.93 - 0.95
      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.YELLOW;
      p.size = Math.random() > 0.7 ? 2 : 1;
      p.width = p.size;
      p.height = p.size;
      p.life = 0;
      p.maxLife = 0.25 + Math.random() * 0.10; // 0.25 - 0.35s
      p.alphaCurve = 'linear';
    }
  }

  /**
   * Preset 2: Boss Galaga Explosion & Expanding Shockwave Ring
   * 32-48 green/blue/cyan/yellow sparks + 1 expanding shockwave ring (0.6s lifespan).
   */
  public spawnBossExplosion(x: number, y: number, particleCount: number = 40): void {
    const count = Math.max(32, Math.min(48, particleCount));
    const colors = ParticleSystem.BOSS_EXPLOSION_COLORS;

    // A. Multi-tiered Radial Sparks
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const isInnerSpark = i % 2 === 0;
      const speed = isInnerSpark
        ? 90 + Math.random() * 50 // 90 - 140 px/s fast core
        : 40 + Math.random() * 40; // 40 - 80 px/s outer ember

      p.active = true;
      p.type = 'SPARK';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = 0;
      p.drag = 0.94 + Math.random() * 0.02; // 0.94 - 0.96
      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.GREEN;
      
      const sizeRoll = Math.random();
      p.size = sizeRoll > 0.85 ? 3 : sizeRoll > 0.50 ? 2 : 1;
      p.width = p.size;
      p.height = p.size;
      p.life = 0;
      p.maxLife = 0.50 + Math.random() * 0.15; // 0.50 - 0.65s
      p.alphaCurve = isInnerSpark ? 'linear' : 'quad';
    }

    // B. Expanding Shockwave Ring
    const shockwave = this.pool.acquire();
    if (shockwave) {
      shockwave.active = true;
      shockwave.type = 'SHOCKWAVE';
      shockwave.isShockwave = true;
      shockwave.x = x;
      shockwave.y = y;
      shockwave.vx = 0;
      shockwave.vy = 0;
      shockwave.ax = 0;
      shockwave.ay = 0;
      shockwave.drag = 1.0;
      shockwave.color = PALETTE.BLUE_CYAN;
      shockwave.size = 1;
      shockwave.shockwaveRadius = 2;
      shockwave.shockwaveMaxRadius = 38;
      shockwave.life = 0;
      shockwave.maxLife = 0.55; // 0.55s ring expansion
      shockwave.alphaCurve = 'linear';
    }
  }

  /**
   * Preset 3: Player Ship Destruction & Fragmentation
   * 40-60 multi-color debris fragments, structural hull shards, and fine sparks (0.8s lifespan).
   */
  public spawnPlayerExplosion(x: number, y: number, particleCount: number = 50): void {
    const count = Math.max(40, Math.min(60, particleCount));
    const colors = ParticleSystem.PLAYER_EXPLOSION_COLORS;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const roll = Math.random();

      p.active = true;
      p.x = x;
      p.y = y;

      if (roll < 0.60) {
        // Category A: Fine high-velocity sparks (60%)
        const speed = 100 + Math.random() * 60; // 100 - 160 px/s
        p.type = 'SPARK';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.ax = 0;
        p.ay = 0;
        p.drag = 0.95;
        p.size = 1;
        p.width = 1;
        p.height = 1;
        p.life = 0;
        p.maxLife = 0.65 + Math.random() * 0.15;
        p.alphaCurve = 'linear';
      } else if (roll < 0.85) {
        // Category B: Tumbling structural shrapnel (25%)
        const speed = 60 + Math.random() * 50; // 60 - 110 px/s
        p.type = 'DEBRIS';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.ax = 0;
        p.ay = 15; // Mild downward gravity
        p.drag = 0.96;
        p.size = 2;
        p.width = 2;
        p.height = 2;
        p.rotation = Math.random() * Math.PI * 2;
        p.vRot = (Math.random() - 0.5) * 12; // Tumbling spin
        p.life = 0;
        p.maxLife = 0.75 + Math.random() * 0.15;
        p.alphaCurve = 'quad';
      } else {
        // Category C: Heavy hull chunks (15%)
        const speed = 30 + Math.random() * 40; // 30 - 70 px/s
        p.type = 'DEBRIS';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.ax = 0;
        p.ay = 35; // Downward gravity
        p.drag = 0.96;
        p.size = 3;
        p.width = Math.random() > 0.5 ? 3 : 2;
        p.height = p.width === 3 ? 2 : 3;
        p.rotation = Math.random() * Math.PI * 2;
        p.vRot = (Math.random() - 0.5) * 8;
        p.life = 0;
        p.maxLife = 0.80 + Math.random() * 0.15;
        p.alphaCurve = 'quad';
      }

      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.WHITE;
    }
  }

  /**
   * Preset 4: Tractor Beam Energy Sparkle Particles
   * Spawns single or small burst of ionic sparkles inside beam cone.
   */
  public spawnTractorSparkle(
    x: number,
    y: number,
    vx: number = (Math.random() - 0.5) * 20,
    vy: number = 50 + Math.random() * 40
  ): Particle | null {
    const p = this.pool.acquire();
    if (!p) return null;

    const colors = ParticleSystem.TRACTOR_SPARKLE_COLORS;

    p.active = true;
    p.type = 'BEAM_SPARKLE';
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.ax = 0;
    p.ay = 0;
    p.drag = 0.98;
    p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.BLUE_CYAN;
    p.size = Math.random() > 0.6 ? 2 : 1;
    p.width = p.size;
    p.height = p.size;
    p.life = 0;
    p.maxLife = 0.20 + Math.random() * 0.15; // 0.20 - 0.35s
    p.alphaCurve = 'linear';

    return p;
  }

  /**
   * Preset 5: Hit Sparks (Non-Lethal projectile impact)
   */
  public spawnHitSparks(x: number, y: number, count: number = 6): void {
    const colors = ParticleSystem.HIT_SPARK_COLORS;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 60; // 70 - 130 px/s

      p.active = true;
      p.type = 'SPARK';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = 0;
      p.drag = 0.90;
      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.YELLOW;
      p.size = 1;
      p.width = 1;
      p.height = 1;
      p.life = 0;
      p.maxLife = 0.12 + Math.random() * 0.06; // 0.12 - 0.18s
      p.alphaCurve = 'linear';
    }
  }

  /**
   * Preset 6: Dual Fighter Docking Sparkles
   */
  public spawnDockingSparkles(x: number, y: number, count: number = 20): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2; // Upward fan
      const speed = 40 + Math.random() * 60;

      p.active = true;
      p.type = 'SPARK';
      p.x = x + (Math.random() - 0.5) * 16;
      p.y = y + (Math.random() - 0.5) * 8;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = -20; // Upward buoyant float
      p.drag = 0.96;
      p.color = Math.random() > 0.5 ? PALETTE.YELLOW : PALETTE.BLUE_CYAN;
      p.size = Math.random() > 0.5 ? 2 : 1;
      p.width = p.size;
      p.height = p.size;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.20;
      p.alphaCurve = 'linear';
    }
  }

  // ==========================================================================
  // 2. Fixed Timestep Update Pipeline
  // ==========================================================================

  /**
   * Updates physics, drag, and lifespans for all active particles.
   * Delta time (dt) is in seconds.
   */
  public update(dt: number): void {
    const dragExponent = Math.min(2.0, dt * 60);

    this.pool.forEachActiveSafe((p) => {
      p.life += dt;

      // Recycle if life expired
      if (p.life >= p.maxLife) {
        this.pool.release(p);
        return;
      }

      if (p.isShockwave) {
        // Expand shockwave ring
        const progress = p.life / p.maxLife;
        p.shockwaveRadius = 2 + progress * (p.shockwaveMaxRadius - 2);
      } else {
        // Kinematic integration
        p.vx += p.ax * dt;
        p.vy += p.ay * dt;

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Exponential drag damping
        const effectiveDrag = Math.pow(p.drag, dragExponent);
        p.vx *= effectiveDrag;
        p.vy *= effectiveDrag;

        // Angular rotation for debris
        if (p.vRot !== 0) {
          p.rotation += p.vRot * dt;
        }
      }
    });
  }

  // ==========================================================================
  // 3. Crisp Pixel Rendering Pipeline
  // ==========================================================================

  /**
   * Renders all active particles onto the 2D canvas with crisp pixel snapping.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.pool.getActiveCount() === 0) return;

    this.pool.forEachActive((p) => {
      const progress = p.life / p.maxLife;
      let alpha = 1.0;

      switch (p.alphaCurve) {
        case 'linear':
          alpha = Math.max(0, 1.0 - progress);
          break;
        case 'quad':
          alpha = Math.max(0, 1.0 - progress * progress);
          break;
        case 'flash':
          alpha = progress <= 0.15 ? 1.0 : Math.max(0, (1.0 - progress) / 0.85);
          break;
      }

      if (alpha <= 0.01) return;

      ctx.globalAlpha = Math.min(1.0, alpha);

      if (p.isShockwave) {
        // Render crisp expanding shockwave circle
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
          Math.floor(p.x),
          Math.floor(p.y),
          Math.floor(p.shockwaveRadius),
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else if (p.vRot !== 0 && p.type === 'DEBRIS') {
        // Rotated debris shard
        ctx.save();
        ctx.translate(Math.floor(p.x), Math.floor(p.y));
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(
          -Math.floor(p.width / 2),
          -Math.floor(p.height / 2),
          p.width,
          p.height
        );
        ctx.restore();
      } else {
        // Standard non-rotated crisp pixel rectangle
        ctx.fillStyle = p.color;
        const px = Math.floor(p.x - p.width / 2);
        const py = Math.floor(p.y - p.height / 2);
        ctx.fillRect(px, py, p.width, p.height);
      }
    });

    // Reset global alpha for subsequent render layers
    ctx.globalAlpha = 1.0;
  }

  // ==========================================================================
  // 4. Lifecycle & Diagnostics
  // ==========================================================================

  /**
   * Immediately deactivates and clears all active particles.
   */
  public clear(): void {
    this.pool.clear();
  }

  /**
   * Returns internal object pool instance.
   */
  public getPool(): ObjectPool<Particle> {
    return this.pool;
  }

  /**
   * Returns count of currently active particles.
   */
  public getActiveCount(): number {
    return this.pool.getActiveCount();
  }

  /**
   * Returns maximum capacity of particle pool.
   */
  public getCapacity(): number {
    return this.pool.getCapacity();
  }

  public getMaxSize(): number {
    return this.pool.getMaxSize();
  }
}
