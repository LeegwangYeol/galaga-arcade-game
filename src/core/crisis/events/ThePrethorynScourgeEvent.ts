/**
 * The Prethoryn Scourge Crisis Event
 * Organic Infestation: Defeated enemies burst into micro-spores; chitin regenerative shields.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

interface MicroSpore {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  active: boolean;
}

export class ThePrethorynScourgeEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.THE_PRETHORYN_SCOURGE;
  public readonly name = 'THE PRETHORYN SCOURGE';
  public readonly flavorText = 'ORGANIC SWARM INFECTION';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private lastEnemyCount: number = 0;
  private enemyLastHitMap: Map<string | number, number> = new Map();
  private bioAuraPhase: number = 0;

  // Zero-allocation pool of 32 micro-spores
  private sporePool: MicroSpore[] = [];

  constructor() {
    super();
    for (let i = 0; i < 32; i++) {
      this.sporePool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 3.0, active: false });
    }
  }

  protected override onInit(): void {
    this.lastEnemyCount = 0;
    this.enemyLastHitMap.clear();
    this.bioAuraPhase = 0;
    for (const spore of this.sporePool) {
      spore.active = false;
    }
  }

  protected override onActivated(): void {
    this.enemyLastHitMap.clear();

    // Grant +1 Chitin Shield to all living formation enemies
    if (this.context?.formationManager) {
      const enemies = this.context.formationManager.enemies || [];
      for (const enemy of enemies) {
        if (enemy.active && enemy.state !== 'INACTIVE') {
          enemy.maxShield = Math.max(enemy.maxShield || 0, (enemy.shield || 0) + 1);
          enemy.shield = (enemy.shield || 0) + 1;
        }
      }
      this.lastEnemyCount = this.context.formationManager.getLivingCount
        ? this.context.formationManager.getLivingCount()
        : (this.context.formationManager.getLivingEnemies?.().length ?? 0);
    }
  }

  protected override onActiveUpdate(dt: number): void {
    this.bioAuraPhase += 4 * dt;
    const { formationManager, player } = this.context;

    // 1. Spore Rupture Check on Enemy Death
    if (formationManager) {
      const living = formationManager.getLivingEnemies?.() ?? [];
      const currentCount = formationManager.getLivingCount
        ? formationManager.getLivingCount()
        : living.length;

      if (currentCount < this.lastEnemyCount) {
        for (const enemy of formationManager.enemies || []) {
          if (enemy.state === 'EXPLODING' && (enemy.deathTimer === undefined || enemy.deathTimer >= 0.1)) {
            this.spawnSpores(enemy.x, enemy.y);
          }
        }
      }
      this.lastEnemyCount = currentCount;

      // 2. Chitin Shield Cellular Regeneration (after 5s undamaged)
      for (const enemy of living) {
        const enemyId = enemy.id ?? `${enemy.x}_${enemy.y}`;
        const lastHit = this.enemyLastHitMap.get(enemyId) ?? 0;
        if (this.elapsedTime - lastHit >= 5.0 && (enemy.shield || 0) < (enemy.maxShield || 1)) {
          enemy.shield = (enemy.shield || 0) + 1;
          this.enemyLastHitMap.set(enemyId, this.elapsedTime);
        }
      }
    }

    // 3. Update Micro-Spores & Collision with Player
    for (const spore of this.sporePool) {
      if (!spore.active) continue;
      spore.life += dt;
      spore.x += spore.vx * dt + Math.sin(spore.life * 10) * 20 * dt;
      spore.y += spore.vy * dt;

      if (spore.y > 290 || spore.life >= spore.maxLife) {
        spore.active = false;
        continue;
      }

      // Check collision with player
      if (player && (player.state === 'normal' || player.state === 'ALIVE' || player.state === 'dual' || player.state === 'DUAL')) {
        const invuln = (typeof player.isInvulnerable === 'function' ? player.isInvulnerable() : (player.invulnerableTimer > 0));
        if (!invuln && Math.abs(spore.x - player.x) < 8 && Math.abs(spore.y - player.y) < 8) {
          spore.active = false;
          if (typeof player.destroy === 'function') {
            player.destroy();
          } else if (typeof player.onExplode === 'function') {
            player.onExplode(player.x, player.y, player.isDual);
          }
        }
      }
    }
  }

  private spawnSpores(x: number, y: number): void {
    let spawned = 0;
    for (const spore of this.sporePool) {
      if (!spore.active) {
        spore.active = true;
        spore.x = x;
        spore.y = y;
        const angle = Math.PI / 2 + (spawned === 0 ? -0.4 : 0.4);
        const speed = 140 + Math.random() * 30;
        spore.vx = Math.cos(angle) * speed;
        spore.vy = Math.sin(angle) * speed;
        spore.life = 0;
        spawned++;
        if (spawned >= 2) break;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();

    // 1. Organic Infestation Tendrils on Edges
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8, 144, 0, 288);
    ctx.moveTo(224, 0);
    ctx.quadraticCurveTo(216, 144, 224, 288);
    ctx.stroke();

    // 2. Bio-Acid Micro-Spores
    for (const spore of this.sporePool) {
      if (spore.active) {
        ctx.fillStyle = '#39FF14';
        ctx.fillRect(Math.floor(spore.x - 1), Math.floor(spore.y - 1), 3, 3);
        ctx.fillStyle = '#FF7518';
        ctx.fillRect(Math.floor(spore.x), Math.floor(spore.y), 1, 1);
      }
    }

    // 3. Chitinous Shield Membranes
    if (this.context?.formationManager) {
      ctx.strokeStyle = 'rgba(173, 255, 47, 0.50)';
      ctx.lineWidth = 1;
      const enemies = this.context.formationManager.enemies || [];
      for (const enemy of enemies) {
        if (enemy.active && (enemy.shield || 0) > 0) {
          ctx.beginPath();
          const r = 11 + Math.sin(this.bioAuraPhase + enemy.x) * 1.5;
          ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  protected override onDeactivated(): void {
    for (const spore of this.sporePool) spore.active = false;
  }

  protected override onReset(): void {
    this.onInit();
  }
}
