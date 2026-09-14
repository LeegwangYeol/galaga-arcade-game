/**
 * Galaga Arcade Web Game — Abstract Base Boss & Boss Sub-Unit Classes
 * 
 * Implements deterministic multi-phase lifecycle state machine, hit registration,
 * swept collision compatibility, and zero-allocation pre-allocated arrays.
 */

import { Enemy, type EnemyDamageResult } from '../../entities/Enemy';
import { SpriteRenderer } from '../../renderer/SpriteRenderer';
import { EnemyType, EnemyState, type Rect } from '../../types';
import type { Game } from '../Game';
import type { BossPhaseId, BossType, IBossEntity } from './types';

export class BossSubUnit extends Enemy {
  public parentBoss: BaseBoss;
  public subUnitType: string;
  public spriteId: string;
  public customHitboxSize: { width: number; height: number };
  public isInvulnerableUnit: boolean = false;

  constructor(
    parentBoss: BaseBoss,
    id: number | string,
    subUnitType: string,
    spriteId: string,
    maxHp: number,
    width: number,
    height: number
  ) {
    super({
      id,
      type: EnemyType.GOEI,
      x: 0,
      y: 0,
      health: maxHp,
      maxHealth: maxHp,
    });
    this.parentBoss = parentBoss;
    this.subUnitType = subUnitType;
    this.spriteId = spriteId;
    this.customHitboxSize = { width, height };
    this.state = EnemyState.DIVING_SOLO;
    this.active = false;
    this.canShoot = false;
  }

  public override getHitbox(): Rect {
    return {
      x: this.x - this.customHitboxSize.width / 2,
      y: this.y - this.customHitboxSize.height / 2,
      width: this.customHitboxSize.width,
      height: this.customHitboxSize.height,
    };
  }

  public override takeDamage(amount: number = 1): EnemyDamageResult {
    if (!this.active || this.health <= 0) {
      return { destroyed: false, points: 0, wasDamaged: false };
    }

    if (this.isInvulnerableUnit) {
      return { destroyed: false, points: 0, wasDamaged: false, shieldAbsorbed: true };
    }

    this.health -= amount;
    this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;

    if (this.health <= 0) {
      this.health = 0;
      this.active = false;
      this.state = EnemyState.EXPLODING;
      this.deathTimer = Enemy.EXPLOSION_DURATION;
      this.parentBoss.onSubUnitDestroyed(this);
      return {
        destroyed: true,
        points: 500,
        wasDamaged: true,
        remainingHealth: 0,
      };
    }

    return {
      destroyed: false,
      points: 0,
      wasDamaged: true,
      remainingHealth: this.health,
    };
  }

  public override render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    if (this.spriteId) {
      SpriteRenderer.draw(ctx, this.spriteId, this.x, this.y, {
        rotation: this.rotation,
      });
    }
  }
}

export abstract class BaseBoss extends Enemy implements IBossEntity {
  public readonly isEpicBoss: boolean = true;
  public game: Game;
  public bossType: BossType;
  public name: string;
  public bossName: string;
  public stage: number;
  public width: number;
  public height: number;
  public phase: BossPhaseId = 'INTRO';
  public phaseTimer: number = 0;
  public invulnerableTimer: number = 0;
  public introTimer: number = 0;
  public defeatTimer: number = 0;
  public stateTimer: number = 0;
  public isDefeated: boolean = false;
  public scoreBonus: number = 10000;
  public targetY: number = 52;
  public subUnits: BossSubUnit[] = [];

  constructor(
    game: Game,
    config: {
      type: BossType;
      name: string;
      stage: number;
      maxHealth: number;
      width: number;
      height: number;
      scoreBonus: number;
    }
  ) {
    super({
      id: 9990 + config.stage,
      type: EnemyType.BOSS,
      x: 112,
      y: -40,
      health: config.maxHealth,
      maxHealth: config.maxHealth,
    });
    this.game = game;
    this.bossType = config.type;
    this.name = config.name;
    this.bossName = config.name;
    this.stage = config.stage;
    this.width = config.width;
    this.height = config.height;
    this.scoreBonus = config.scoreBonus;
    this.state = EnemyState.DIVING_SOLO;
    this.active = true;
    this.phase = 'INTRO';
    this.introTimer = 2.0;
  }

  public isInvulnerable(): boolean {
    return (
      this.invulnerableTimer > 0 ||
      this.phase === 'INTRO' ||
      this.phase === 'TRANSITION_1_2' ||
      this.phase === 'TRANSITION_2_3' ||
      this.phase === 'DEFEATED'
    );
  }

  public override getHitbox(): Rect {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height,
    };
  }

  public override takeDamage(amount: number = 1): EnemyDamageResult {
    if (!this.active || this.health <= 0 || this.isInvulnerable()) {
      return {
        destroyed: false,
        points: 0,
        wasDamaged: false,
        shieldAbsorbed: true,
        remainingHealth: this.health,
      };
    }

    // Protection check for bosses with shield units (e.g. turrets or satellites)
    if (this.isProtectedBySubUnits()) {
      return {
        destroyed: false,
        points: 0,
        wasDamaged: false,
        shieldAbsorbed: true,
        remainingHealth: this.health,
      };
    }

    this.health -= amount;
    this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;

    // Check phase transition thresholds
    this.checkPhaseTransitions();

    if (this.health <= 0) {
      this.health = 0;
      this.triggerDefeat();
      return {
        destroyed: true,
        points: this.scoreBonus,
        wasDamaged: true,
        remainingHealth: 0,
      };
    }

    return {
      destroyed: false,
      points: 0,
      wasDamaged: true,
      remainingHealth: this.health,
    };
  }

  public isProtectedBySubUnits(): boolean {
    return false;
  }

  public checkPhaseTransitions(): void {
    // Overridden by concrete bosses
  }

  public triggerDefeat(): void {
    if (this.isDefeated) return;
    this.isDefeated = true;
    this.phase = 'DEFEATED';
    this.defeatTimer = 2.5;

    // Award score bonus
    this.game.scoreManager?.addScore(this.scoreBonus);

    // Guaranteed power-up drop
    this.game.powerUpManager?.spawnDrop(this.x, this.y, this.stage, EnemyType.BOSS, true);

    // Deactivate all remaining sub-units
    for (const sub of this.subUnits) {
      if (sub.active) {
        sub.active = false;
        sub.state = EnemyState.EXPLODING;
        sub.deathTimer = 0.3;
      }
    }
  }

  public onSubUnitDestroyed(_subUnit: BossSubUnit): void {
    // Hook for concrete bosses
  }

  public getActiveSubUnits(): BossSubUnit[] {
    return this.subUnits.filter((s) => s.active);
  }

  public override update(dt: number, playerX: number, playerY: number): void {
    this.stateTimer += dt;
    this.phaseTimer += dt;

    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= dt;
    }
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    // 1. Intro Entrance Handling
    if (this.phase === 'INTRO') {
      this.introTimer -= dt;
      // Smoothly descend to targetY
      this.y += (this.targetY - this.y) * Math.min(1, dt * 3.0);
      if (this.introTimer <= 0) {
        this.y = this.targetY;
        this.phase = 'PHASE_1';
        this.phaseTimer = 0;
      }
      return;
    }

    // 2. Transition Handlers
    if (this.phase === 'TRANSITION_1_2') {
      if (this.invulnerableTimer <= 0) {
        this.phase = 'PHASE_2';
        this.phaseTimer = 0;
        this.onPhase2Started();
      }
      return;
    }

    if (this.phase === 'TRANSITION_2_3') {
      if (this.invulnerableTimer <= 0) {
        this.phase = 'PHASE_3';
        this.phaseTimer = 0;
        this.onPhase3Started();
      }
      return;
    }

    // 3. Defeated State Handling
    if (this.phase === 'DEFEATED') {
      this.defeatTimer -= dt;
      if (Math.random() < 0.4) {
        const ox = (Math.random() - 0.5) * this.width;
        const oy = (Math.random() - 0.5) * this.height;
        this.game.particleSystem?.spawnHitSparks(this.x + ox, this.y + oy);
      }
      if (this.defeatTimer <= 0) {
        this.active = false;
        this.state = EnemyState.INACTIVE;
      }
      return;
    }

    // 4. Update Concrete Boss AI & Attacks
    this.updateBoss(dt, playerX, playerY);

    // 5. Update Sub-units (if not already managed by FormationManager)
    for (const sub of this.subUnits) {
      if (sub.active && !this.game.formationManager?.enemies.includes(sub)) {
        sub.update(dt, playerX, playerY);
      }
    }
  }

  public onPhase2Started(): void {}
  public onPhase3Started(): void {}

  public abstract updateBoss(dt: number, playerX: number, playerY: number): void;
  public abstract renderBoss(ctx: CanvasRenderingContext2D): void;

  public override render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    // Render active sub-units (if not already managed by FormationManager)
    for (const sub of this.subUnits) {
      if (sub.active && !this.game.formationManager?.enemies.includes(sub)) {
        sub.render(ctx);
      }
    }

    // Render flash or invulnerability indicator
    if (this.isInvulnerable() && Math.floor(Date.now() / 80) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      this.renderBoss(ctx);
      ctx.restore();
    } else {
      this.renderBoss(ctx);
    }
  }

  public override reset(): void {
    super.reset();
    this.phase = 'INTRO';
    this.phaseTimer = 0;
    this.invulnerableTimer = 0;
    this.introTimer = 2.0;
    this.defeatTimer = 0;
    this.isDefeated = false;
    for (const sub of this.subUnits) {
      sub.reset();
    }
  }
}
