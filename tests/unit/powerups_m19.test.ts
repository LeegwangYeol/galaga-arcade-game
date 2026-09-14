/**
 * Galaga Arcade Web Game — Milestone M19 Power-Up Test Suite
 * Location: tests/unit/powerups_m19.test.ts
 * 
 * Verifies:
 * 1. 5 New Power-Up Types & Configs (Chrono Field, Reflection Shield, EMP Collector, Phase Drive, Antimatter Plasma)
 * 2. Stage-Tiered Loot Table Protection (Stage <= 10 classic 5-item, Stage >= 11 expanded 10-item)
 * 3. Challenging Stage Canon (Strict 0% drop rate)
 * 4. Item 1: Chrono Field 120px Localized Bullet Deceleration (0.40x)
 * 5. Item 2: Kinetic Reflection Shield Deflection & Homing Counter-Missiles (600 px/s)
 * 6. Item 3: Singularity EMP Collector 90px Vortex (+50 pts & +5% energy)
 * 7. Item 4: Quantum Phase Drive Double-Tap / Shift Warp Blink (±40px, 0.4s intangibility)
 * 8. Item 5: Antimatter Plasma Blaster Continuous Piercing Lance with 10 Hz Damage Throttling
 * 9. ObjectPool<PowerUpItem> Capacity Invariant (Strictly 32, zero heap churn)
 * 10. QA Cheat Controller Power-Up Aliases & Dispatch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { PowerUpType, POWERUP_CONFIGS, normalizePowerUpType } from '../../src/core/powerups/types';
import { Player } from '../../src/entities/Player';
import { BulletManager } from '../../src/entities/Bullet';
import { EnemyType, type Rect } from '../../src/types';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { GalagaCheatController } from '../../src/core/qa/GalagaCheatController';
import { SpriteRenderer } from '../../src/renderer/SpriteRenderer';

describe('Milestone M19: 5+ New Creative Power-Ups & Utility Items', () => {
  let powerUpManager: PowerUpManager;
  let player: Player;
  let bulletManager: BulletManager;

  beforeEach(() => {
    powerUpManager = new PowerUpManager();
    player = new Player({ x: 112, y: 250, lives: 3 });
    bulletManager = new BulletManager();
  });

  // ==========================================================================
  // 1. Type Normalization & Static Metadata Configuration
  // ==========================================================================
  describe('1. Type Normalization & Metadata Configuration', () => {
    it('defines all 5 new canonical PowerUpType enum entries', () => {
      expect(PowerUpType.CHRONO_FIELD).toBe('CHRONO_FIELD');
      expect(PowerUpType.REFLECTION_SHIELD).toBe('REFLECTION_SHIELD');
      expect(PowerUpType.EMP_COLLECTOR).toBe('EMP_COLLECTOR');
      expect(PowerUpType.PHASE_DRIVE).toBe('PHASE_DRIVE');
      expect(PowerUpType.ANTIMATTER_PLASMA).toBe('ANTIMATTER_PLASMA');
    });

    it('normalizes case-insensitive aliases and shorthand identifiers', () => {
      expect(normalizePowerUpType('chrono')).toBe(PowerUpType.CHRONO_FIELD);
      expect(normalizePowerUpType('chrono_field')).toBe(PowerUpType.CHRONO_FIELD);
      expect(normalizePowerUpType('reflection')).toBe(PowerUpType.REFLECTION_SHIELD);
      expect(normalizePowerUpType('reflection_shield')).toBe(PowerUpType.REFLECTION_SHIELD);
      expect(normalizePowerUpType('collector')).toBe(PowerUpType.EMP_COLLECTOR);
      expect(normalizePowerUpType('emp_collector')).toBe(PowerUpType.EMP_COLLECTOR);
      expect(normalizePowerUpType('phase')).toBe(PowerUpType.PHASE_DRIVE);
      expect(normalizePowerUpType('phase_drive')).toBe(PowerUpType.PHASE_DRIVE);
      expect(normalizePowerUpType('plasma')).toBe(PowerUpType.ANTIMATTER_PLASMA);
      expect(normalizePowerUpType('antimatter_plasma')).toBe(PowerUpType.ANTIMATTER_PLASMA);
    });

    it('provides valid static configurations for all 10 items in POWERUP_CONFIGS', () => {
      const allTypes = Object.values(PowerUpType);
      expect(allTypes).toHaveLength(10);

      for (const type of allTypes) {
        const config = POWERUP_CONFIGS[type];
        expect(config).toBeDefined();
        expect(config.name).toBeTruthy();
        expect(config.spriteId).toBeTruthy();
        expect(config.primaryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(config.secondaryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(config.baseWeight).toBeGreaterThan(0);
        expect(config.description).toBeTruthy();
      }
    });

    it('verifies SpriteRenderer registers all 10x10 powerup sprite definitions', () => {
      SpriteRenderer.initialize();
      const expectedSprites = [
        'POWERUP_CHRONO_FIELD',
        'POWERUP_REFLECTION_SHIELD',
        'POWERUP_EMP_COLLECTOR',
        'POWERUP_PHASE_DRIVE',
        'POWERUP_ANTIMATTER_PLASMA',
      ];
      for (const spriteId of expectedSprites) {
        expect(SpriteRenderer.hasSprite(spriteId)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 2. Stage-Tiered Weighted Loot Distribution & Challenging Stage Canon
  // ==========================================================================
  describe('2. Stage-Tiered Weighted Loot Distribution', () => {
    it('strictly restricts drops to classic 5 items for Stage <= 10 (Adversarial Protection)', () => {
      const counts: Record<PowerUpType, number> = {
        [PowerUpType.RAPID_FIRE]: 0,
        [PowerUpType.KINETIC_SHIELD]: 0,
        [PowerUpType.SCATTER_SHOT]: 0,
        [PowerUpType.EMP_BOMB]: 0,
        [PowerUpType.ENGINE_BOOSTER]: 0,
        [PowerUpType.CHRONO_FIELD]: 0,
        [PowerUpType.REFLECTION_SHIELD]: 0,
        [PowerUpType.EMP_COLLECTOR]: 0,
        [PowerUpType.PHASE_DRIVE]: 0,
        [PowerUpType.ANTIMATTER_PLASMA]: 0,
      };

      const TRIALS = 20_000;
      for (let i = 0; i < TRIALS; i++) {
        // Defaults to stage = 1
        const type = powerUpManager.rollLootType(EnemyType.ZAKO, 1);
        counts[type]++;
      }

      // Classic weights: 30%, 25%, 20%, 15%, 10%
      expect(counts[PowerUpType.RAPID_FIRE] / TRIALS).toBeCloseTo(0.30, 1);
      expect(counts[PowerUpType.KINETIC_SHIELD] / TRIALS).toBeCloseTo(0.25, 1);
      expect(counts[PowerUpType.SCATTER_SHOT] / TRIALS).toBeCloseTo(0.20, 1);
      expect(counts[PowerUpType.ENGINE_BOOSTER] / TRIALS).toBeCloseTo(0.15, 1);
      expect(counts[PowerUpType.EMP_BOMB] / TRIALS).toBeCloseTo(0.10, 1);

      // All 5 M19 new powerups must strictly yield 0 drops in stage <= 10
      expect(counts[PowerUpType.CHRONO_FIELD]).toBe(0);
      expect(counts[PowerUpType.REFLECTION_SHIELD]).toBe(0);
      expect(counts[PowerUpType.EMP_COLLECTOR]).toBe(0);
      expect(counts[PowerUpType.PHASE_DRIVE]).toBe(0);
      expect(counts[PowerUpType.ANTIMATTER_PLASMA]).toBe(0);
    });

    it('enables all 10 powerups for Stage >= 11 (Expanded Loot Table)', () => {
      const counts: Record<PowerUpType, number> = {
        [PowerUpType.RAPID_FIRE]: 0,
        [PowerUpType.KINETIC_SHIELD]: 0,
        [PowerUpType.SCATTER_SHOT]: 0,
        [PowerUpType.EMP_BOMB]: 0,
        [PowerUpType.ENGINE_BOOSTER]: 0,
        [PowerUpType.CHRONO_FIELD]: 0,
        [PowerUpType.REFLECTION_SHIELD]: 0,
        [PowerUpType.EMP_COLLECTOR]: 0,
        [PowerUpType.PHASE_DRIVE]: 0,
        [PowerUpType.ANTIMATTER_PLASMA]: 0,
      };

      const TRIALS = 30_000;
      for (let i = 0; i < TRIALS; i++) {
        const type = powerUpManager.rollLootType(EnemyType.ZAKO, 12);
        counts[type]++;
      }

      // Every single power-up type must drop in stage >= 11
      for (const type of Object.values(PowerUpType)) {
        expect(counts[type]).toBeGreaterThan(1000);
      }
    });

    it('strictly guarantees all 12 Challenging Stages yield zero drops', () => {
      const challengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
      for (const stage of challengingStages) {
        expect(DifficultyCalculator.isChallengingStage(stage)).toBe(true);
        expect(powerUpManager.computeDropChance(stage, EnemyType.ZAKO, false)).toBe(0);
        expect(powerUpManager.computeDropChance(stage, EnemyType.BOSS, true)).toBe(0);
        expect(powerUpManager.spawnDrop(100, 100, stage, EnemyType.BOSS, true)).toBeNull();
      }
    });
  });

  // ==========================================================================
  // 3. Item 1: Chrono Field Kinematics & Bullet Deceleration
  // ==========================================================================
  describe('3. Item 1: Chrono Field (Temporal Dilation)', () => {
    it('activates Chrono Field buff and updates timers correctly', () => {
      powerUpManager.applyPowerUp(PowerUpType.CHRONO_FIELD, player);
      expect(player.hasChronoField).toBe(true);
      expect(player.chronoFieldTimer).toBe(6.0);
      expect(powerUpManager.buffState.chronoFieldTimer).toBe(6.0);

      // Advance time by 2.0s
      powerUpManager.update(2.0, player);
      expect(player.chronoFieldTimer).toBeCloseTo(4.0, 2);
      expect(player.hasChronoField).toBe(true);

      // Advance remaining time
      powerUpManager.update(4.5, player);
      expect(player.chronoFieldTimer).toBe(0);
      expect(player.hasChronoField).toBe(false);
    });

    it('slows enemy bullets within 120px by 60% (0.40x effective dt)', () => {
      // Spawn two enemy bullets: one close (inside 120px) and one far (outside 120px)
      // Player is at (112, 250)
      const insideBullet = bulletManager.fireEnemyBulletWithVector(112, 200, 0, 100); // 50px away
      const outsideBullet = bulletManager.fireEnemyBulletWithVector(112, 50, 0, 100);  // 200px away

      expect(insideBullet).not.toBeNull();
      expect(outsideBullet).not.toBeNull();

      // Update with Chrono Field active around player at (112, 250)
      const dt = 0.1; // 100ms
      const chronoField = { x: 112, y: 250, radiusSq: 14400, slowFactor: 0.40 };
      bulletManager.update(dt, dt, chronoField);

      // insideBullet moved at 0.4x speed: 100 px/s * 0.1s * 0.4 = 4px (200 -> 204)
      expect(insideBullet!.position.y).toBeCloseTo(204, 2);

      // outsideBullet moved at 1.0x speed: 100 px/s * 0.1s = 10px (50 -> 60)
      expect(outsideBullet!.position.y).toBeCloseTo(60, 2);
    });
  });

  // ==========================================================================
  // 4. Item 2: Kinetic Reflection Shield & Homing Counter-Missiles
  // ==========================================================================
  describe('4. Item 2: Kinetic Reflection Shield (Counter-Projectiles)', () => {
    it('absorbs incoming lethal threats and triggers onReflectionDeflect', () => {
      player.applyPowerUp(PowerUpType.REFLECTION_SHIELD);
      expect(player.hasReflectionShieldActive).toBe(true);
      expect(player.reflectionShieldHp).toBe(3);

      const onDeflect = vi.fn();
      player.onReflectionDeflect = onDeflect;

      // Bullet threat overlapping player at (112, 250)
      const threat: Rect = { x: 110, y: 248, width: 4, height: 4 };
      const damaged = player.hitTestAndDamage(threat);

      expect(damaged).toBe(false); // Hit absorbed!
      expect(onDeflect).toHaveBeenCalledTimes(1);
      expect(player.reflectionShieldHp).toBe(2);
      expect(player.hasReflectionShieldActive).toBe(true);
    });

    it('BulletManager.fireReflectionMissile spawns high-speed homing projectile without starving player quota', () => {
      const missile = bulletManager.fireReflectionMissile(112, 240, 112, 50, 600);
      expect(missile).not.toBeNull();
      expect(missile!.active).toBe(true);
      expect(missile!.velocity.y).toBeCloseTo(-600, 1);

      // Standard player fire count is preserved (quota untouched)
      expect(bulletManager.getPlayerBulletCount()).toBe(0);

      // Missile is included in getActivePlayerBullets() so it harms enemies
      const playerBullets = bulletManager.getActivePlayerBullets();
      expect(playerBullets).toContain(missile);

      // Recycling cleanly returns to pool
      bulletManager.recycle(missile!);
      expect(missile!.active).toBe(false);
      expect(bulletManager.getActivePlayerBullets()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 5. Item 3: Singularity EMP Collector
  // ==========================================================================
  describe('5. Item 3: Singularity EMP Collector (Bullet Siphon)', () => {
    it('activates Singularity Collector buff', () => {
      player.applyPowerUp(PowerUpType.EMP_COLLECTOR);
      expect(player.hasEmpCollector).toBe(true);
      expect(player.empCollectorTimer).toBe(5.0);
    });

    it('siphons bullets within 90px in PowerUpManager.update', () => {
      const mockGame: any = {
        bulletManager: new BulletManager(),
        scoreManager: { addScore: vi.fn() },
        specialMovesManager: { addEnergy: vi.fn() },
        particleSystem: { spawnHitSparks: vi.fn() },
        soundSynth: { playEmpBulletAbsorb: vi.fn() },
      };
      powerUpManager.setGame(mockGame);

      powerUpManager.applyPowerUp(PowerUpType.EMP_COLLECTOR, player);
      expect(powerUpManager.buffState.empCollectorTimer).toBe(5.0);

      // Spawn bullet inside 90px radius (player is at 112, 250; bullet at 112, 200 -> 50px away)
      const b1 = mockGame.bulletManager.fireEnemyBulletWithVector(112, 200, 0, 50);
      // Spawn bullet outside 90px radius (bullet at 112, 50 -> 200px away)
      const b2 = mockGame.bulletManager.fireEnemyBulletWithVector(112, 50, 0, 50);

      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();

      // Run update tick
      powerUpManager.update(0.016, player);

      // b1 absorbed!
      expect(b1!.active).toBe(false);
      expect(mockGame.scoreManager.addScore).toHaveBeenCalledWith(50);
      expect(mockGame.specialMovesManager.addEnergy).toHaveBeenCalledWith(5);
      expect(mockGame.soundSynth.playEmpBulletAbsorb).toHaveBeenCalled();

      // b2 untouched!
      expect(b2!.active).toBe(true);
    });
  });

  // ==========================================================================
  // 6. Item 4: Quantum Phase Drive
  // ==========================================================================
  describe('6. Item 4: Quantum Phase Drive (Phase Blink)', () => {
    it('enables Phase Drive and triggers warp blink with 0.4s intangibility', () => {
      player.applyPowerUp(PowerUpType.PHASE_DRIVE);
      expect(player.hasPhaseDrive).toBe(true);
      expect(player.phaseDriveTimer).toBe(15.0);

      const initialX = player.x; // 112
      player.triggerPhaseWarp(1); // Warp right

      expect(player.x).toBe(initialX + 40); // 152
      expect(player.invulnerableTimer).toBeCloseTo(0.4, 2);
      expect(player.phaseWarpCooldown).toBe(0.5);

      // Threat during intangibility deals 0 damage
      const threat: Rect = { x: player.x - 2, y: player.y - 2, width: 4, height: 4 };
      expect(player.hitTestAndDamage(threat)).toBe(false);
    });

    it('clamps warp blink within arena boundaries', () => {
      player.applyPowerUp(PowerUpType.PHASE_DRIVE);
      player.x = 200;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(1); // Would go to 240, clamped to 212
      expect(player.x).toBe(212);

      player.x = 20;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(-1); // Would go to -20, clamped to 12
      expect(player.x).toBe(12);
    });
  });

  // ==========================================================================
  // 7. Item 5: Antimatter Plasma Blaster
  // ==========================================================================
  describe('7. Item 5: Antimatter Plasma Blaster (Continuous Lance)', () => {
    it('activates Antimatter Plasma buff and throttles ticks at 10 Hz', () => {
      player.applyPowerUp(PowerUpType.ANTIMATTER_PLASMA);
      expect(player.hasAntimatterPlasma).toBe(true);
      expect(player.plasmaBlasterTimer).toBe(7.0);

      const onTick = vi.fn();
      player.onPlasmaBeamTick = onTick;

      // Advance 0.05s (no tick yet)
      player.update(0.05);
      expect(onTick).not.toHaveBeenCalled();

      // Advance another 0.06s (total 0.11s -> 1 tick fired)
      player.update(0.06);
      expect(onTick).toHaveBeenCalledTimes(1);

      // Advance 0.20s (2 more ticks fired)
      player.update(0.20);
      expect(onTick).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // 8. ObjectPool<PowerUpItem> Invariant & Teardown Verification
  // ==========================================================================
  describe('8. ObjectPool Capacity & Lifecycle Invariants', () => {
    it('maintains strict capacity 32 without auto-expansion under load', () => {
      const pool = powerUpManager.getPool();
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getMaxSize()).toBe(32);

      const leased = [];
      for (let i = 0; i < 32; i++) {
        const item = powerUpManager.spawnPowerUp(100, 100, PowerUpType.CHRONO_FIELD);
        expect(item).not.toBeNull();
        leased.push(item);
      }

      // Pool is full at capacity 32
      expect(pool.getActiveCount()).toBe(32);
      expect(pool.getCapacity()).toBe(32);

      // 33rd attempt returns null (no auto-expand)
      const overflow = powerUpManager.spawnPowerUp(100, 100, PowerUpType.REFLECTION_SHIELD);
      expect(overflow).toBeNull();
      expect(pool.getCapacity()).toBe(32);

      // Clean teardown
      powerUpManager.reset();
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getCapacity()).toBe(32);
    });

    it('clears all active buff timers on reset and player death', () => {
      powerUpManager.buffState.chronoFieldTimer = 5;
      powerUpManager.buffState.reflectionShieldTimer = 10;
      powerUpManager.buffState.hasReflectionShield = true;
      powerUpManager.buffState.empCollectorTimer = 4;
      powerUpManager.buffState.phaseDriveTimer = 12;
      powerUpManager.buffState.plasmaBlasterTimer = 6;

      powerUpManager.onPlayerDeath();

      expect(powerUpManager.buffState.chronoFieldTimer).toBe(0);
      expect(powerUpManager.buffState.reflectionShieldTimer).toBe(0);
      expect(powerUpManager.buffState.hasReflectionShield).toBe(false);
      expect(powerUpManager.buffState.empCollectorTimer).toBe(0);
      expect(powerUpManager.buffState.phaseDriveTimer).toBe(0);
      expect(powerUpManager.buffState.plasmaBlasterTimer).toBe(0);
    });
  });

  // ==========================================================================
  // 9. QA Cheat Controller Power-Up Aliases & API
  // ==========================================================================
  describe('9. QA Cheat Controller Power-Up Aliases', () => {
    it('spawns and applies all 5 new power-up items via GalagaCheatController', () => {
      const mockGame: any = {
        powerUpManager,
        player,
        bulletManager,
        particleSystem: { clear: vi.fn(), spawnHitSparks: vi.fn() },
        tractorBeam: { reset: vi.fn() },
        soundSynth: { stopTractorBeam: vi.fn(), stopAll: vi.fn(), playLaser: vi.fn() },
      };

      const cheat = new GalagaCheatController(mockGame);

      // Spawn powerups
      expect(cheat.spawnPowerUp('chrono')).toBe(true);
      expect(cheat.spawnPowerUp('reflection')).toBe(true);
      expect(cheat.spawnPowerUp('collector')).toBe(true);
      expect(cheat.spawnPowerUp('phase')).toBe(true);
      expect(cheat.spawnPowerUp('plasma')).toBe(true);

      // Apply powerups directly
      expect(cheat.applyPowerUp('chrono_field')).toBe(true);
      expect(player.hasChronoField).toBe(true);

      expect(cheat.applyPowerUp('reflection_shield')).toBe(true);
      expect(player.hasReflectionShieldActive).toBe(true);

      expect(cheat.applyPowerUp('emp_collector')).toBe(true);
      expect(player.hasEmpCollector).toBe(true);

      expect(cheat.applyPowerUp('phase_drive')).toBe(true);
      expect(player.hasPhaseDrive).toBe(true);

      expect(cheat.applyPowerUp('antimatter_plasma')).toBe(true);
      expect(player.hasAntimatterPlasma).toBe(true);

      cheat.destroy();
    });
  });
});
