/**
 * Galaga Arcade Web Game — Milestone 13: Special Moves Subsystem Unit Test Suite
 * 
 * Verifies Energy Gauge accumulation (0..100), trigger preconditions, 5.0s cooldown,
 * Nova Barrage 16-missile salvo with Proportional Navigation, Chrono Freeze 3.0s
 * absolute time stop (enemyDt = 0), Dimensional Warp Ram hyper-speed kinetic sweep,
 * and Energy Spark magnetic pull & collection mechanics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { SpecialMovesManager } from '../../src/core/specials/SpecialMovesManager';
import { SpecialMoveType } from '../../src/core/specials/types';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 13 — Special Moves Subsystem', () => {
  let game: Game;
  let specialManager: SpecialMovesManager;

  beforeEach(() => {
    game = new Game();
    specialManager = game.getSpecialMovesManager();
  });

  describe('1. Energy Gauge & Trigger Preconditions', () => {
    it('initializes with 0 energy and clamps additions within [0, 100]', () => {
      expect(specialManager.energy).toBe(0);
      expect(specialManager.isReady()).toBe(false);

      specialManager.addEnergy(45);
      expect(specialManager.energy).toBe(45);
      expect(specialManager.isReady()).toBe(false);

      specialManager.addEnergy(70);
      expect(specialManager.energy).toBe(100);
      expect(specialManager.isReady()).toBe(true);

      // Clamped above 100
      specialManager.addEnergy(50);
      expect(specialManager.energy).toBe(100);
    });

    it('enforces 5.0s cooldown lockout after triggering', () => {
      specialManager.addEnergy(100);
      expect(specialManager.isReady()).toBe(true);

      // Trigger Nova Barrage
      const triggered = specialManager.trigger();
      expect(triggered).toBe(true);
      expect(specialManager.energy).toBe(0);
      expect(specialManager.cooldownTimer).toBe(5.0);
      expect(specialManager.isReady()).toBe(false);

      // Even if energy is instantly recharged to 100 during cooldown, cannot re-trigger
      specialManager.addEnergy(100);
      expect(specialManager.isReady()).toBe(false);
      expect(specialManager.trigger()).toBe(false);

      // Advance cooldown by 3.0s (2.0s remaining)
      specialManager.update(3.0);
      expect(specialManager.cooldownTimer).toBeCloseTo(2.0);
      expect(specialManager.isReady()).toBe(false);

      // Clear remaining cooldown
      specialManager.update(2.1);
      expect(specialManager.cooldownTimer).toBe(0);
      expect(specialManager.isReady()).toBe(true);
    });

    it('cycles through all 3 special moves sequentially', () => {
      expect(specialManager.selectedMove).toBe(SpecialMoveType.NOVA_BARRAGE);

      specialManager.cycleSpecial();
      expect(specialManager.selectedMove).toBe(SpecialMoveType.CHRONO_FREEZE);

      specialManager.cycleSpecial();
      expect(specialManager.selectedMove).toBe(SpecialMoveType.WARP_RAM);

      specialManager.cycleSpecial();
      expect(specialManager.selectedMove).toBe(SpecialMoveType.NOVA_BARRAGE);
    });
  });

  describe('2. Nova Barrage (16-Missile Proportional Navigation Salvo)', () => {
    beforeEach(() => {
      specialManager.selectedMove = SpecialMoveType.NOVA_BARRAGE;
      specialManager.addEnergy(100);
    });

    it('spawns a 16-missile salvo fanning out radially across [-PI/4, PI/4]', () => {
      const triggered = specialManager.trigger();
      expect(triggered).toBe(true);

      let missileCount = 0;
      specialManager.getMissilePool().forEachActive((missile) => {
        missileCount++;
        expect(missile.speed).toBeGreaterThanOrEqual(300);
        expect(missile.damage).toBe(8);
      });

      expect(missileCount).toBe(16);
    });

    it('guides homing missiles toward target enemies via Proportional Navigation', () => {
      const enemy = new Enemy({
        id: 'target_goei',
        type: EnemyType.GOEI,
        x: 180,
        y: 80,
      });
      enemy.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(enemy);

      specialManager.trigger();

      // Acquire initial angle of first active missile
      let initialAngle = 0;
      specialManager.getMissilePool().forEachActive((missile) => {
        if (initialAngle === 0) {
          missile.target = enemy;
          initialAngle = missile.angle;
        }
      });

      // Update missile flight
      for (let i = 0; i < 5; i++) {
        specialManager.update(0.05);
      }

      // Missile should adjust angle toward enemy target
      let adjustedAngle = 0;
      specialManager.getMissilePool().forEachActive((missile) => {
        if (missile.target === enemy && adjustedAngle === 0) {
          adjustedAngle = missile.angle;
        }
      });

      expect(adjustedAngle).not.toBe(0);
    });

    it('resolves missile collisions, damages enemies, and releases missiles', () => {
      const enemy = new Enemy({
        id: 'target_zako',
        type: EnemyType.ZAKO,
        x: 112,
        y: 100,
      });
      enemy.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(enemy);

      specialManager.trigger();

      // Move one missile directly into enemy hitbox
      let testMissile: any = null;
      specialManager.getMissilePool().forEachActive((missile) => {
        if (!testMissile) {
          testMissile = missile;
          missile.x = 112;
          missile.y = 100;
        }
      });

      expect(testMissile).not.toBeNull();

      // Resolve collisions
      specialManager.resolveCollisions(game.formationManager.getLivingEnemies());

      // Enemy takes lethal damage
      expect(enemy.health).toBeLessThanOrEqual(0);
      expect(enemy.state).toBe(EnemyState.EXPLODING);
    });
  });

  describe('3. Chrono Freeze (3.0s Absolute Time Stop Invariant)', () => {
    beforeEach(() => {
      specialManager.selectedMove = SpecialMoveType.CHRONO_FREEZE;
      specialManager.addEnergy(100);
    });

    it('activates 3.0s time stop invariant where enemyDt = 0 while player moves normally', () => {
      expect(specialManager.isChronoFreezeActive()).toBe(false);

      const triggered = specialManager.trigger();
      expect(triggered).toBe(true);
      expect(specialManager.isChronoFreezeActive()).toBe(true);
      expect(specialManager.chronoFreezeTimer).toBeCloseTo(3.0);

      // Verify enemy delta-time calculation
      expect(specialManager.getEnemyDeltaTime(0.016)).toBe(0);

      // Advance by 1.5s
      specialManager.update(1.5);
      expect(specialManager.isChronoFreezeActive()).toBe(true);
      expect(specialManager.chronoFreezeTimer).toBeCloseTo(1.5);

      // Advance past 3.0s window
      specialManager.update(1.6);
      expect(specialManager.isChronoFreezeActive()).toBe(false);
      expect(specialManager.getEnemyDeltaTime(0.016)).toBe(0.016);
    });

    it('freezes hostile enemy bullets in place during Chrono Freeze while player bullets move', () => {
      // Fire one enemy bullet and one player bullet
      const enemyBullet = game.bulletManager.fireEnemyBullet(100, 100, 0, 200);
      const playerBullet = game.bulletManager.firePlayerBullet(112, 240);

      expect(enemyBullet).not.toBeNull();
      expect(playerBullet).not.toBeNull();

      const initialEnemyY = enemyBullet!.position.y;
      const initialPlayerY = playerBullet!.position.y;

      // Trigger Chrono Freeze
      specialManager.trigger();

      // Run Game.update(0.1)
      game.update(0.1);

      // Enemy bullet must remain frozen at initial position (enemyDt = 0)
      expect(enemyBullet!.position.y).toBe(initialEnemyY);

      // Player bullet moves upward normally (playerDt = 0.1s => -480 * 0.1 = -48px)
      expect(playerBullet!.position.y).toBeLessThan(initialPlayerY);
    });
  });

  describe('4. Dimensional Warp Ram (Hyper-Speed Invulnerable Swept Ram)', () => {
    beforeEach(() => {
      specialManager.selectedMove = SpecialMoveType.WARP_RAM;
      specialManager.addEnergy(100);
    });

    it('grants absolute player invulnerability during hyper-speed charge + 0.5s grace window', () => {
      expect(specialManager.isWarpRamActive()).toBe(false);

      specialManager.trigger();
      expect(specialManager.isWarpRamActive()).toBe(true);
      expect(specialManager.warpRamTimer).toBe(1.0);

      // Player invulnerability timer must be at least 1.5s (1.0s duration + 0.5s grace)
      expect(game.player.invulnerableTimer).toBeGreaterThanOrEqual(1.5);
      expect(game.player.isInvulnerable()).toBe(true);
    });

    it('sweeps player vertically at 800px/s and wraps safely back to baseline', () => {
      const startY = game.player.y;
      specialManager.trigger();

      // Advance by 0.1s => moves up by 80px
      specialManager.update(0.1);
      expect(game.player.y).toBeCloseTo(startY - 80);

      // Finish the 1.0s warp ram
      for (let i = 0; i < 15; i++) {
        specialManager.update(0.1);
      }

      // Player must be safely restored to baseline Y
      expect(specialManager.isWarpRamActive()).toBe(false);
      expect(game.player.y).toBe(startY);
    });

    it('inflicts 120 kinetic impact damage to enemies colliding with swept flight lane', () => {
      const enemy = new Enemy({
        id: 'ram_target_zako',
        type: EnemyType.ZAKO,
        x: game.player.x,
        y: 150,
      });
      enemy.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(enemy);

      specialManager.trigger();

      // Update warp ram until player sweeps through Y=150 (250 - 800 * 0.125 = 150)
      specialManager.update(0.125);

      // Resolve swept lane collisions
      specialManager.resolveCollisions(game.formationManager.getLivingEnemies());

      // Enemy takes massive 120 damage and is destroyed
      expect(enemy.health).toBeLessThanOrEqual(0);
      expect(enemy.state).toBe(EnemyState.EXPLODING);
    });
  });

  describe('5. Energy Sparks & Magnetic Attraction', () => {
    it('spawns energy sparks with harmonic oscillation flutter', () => {
      const spark = specialManager.spawnSpark(100, 100, 15.0);
      expect(spark).not.toBeNull();
      expect(spark?.active).toBe(true);
      expect(spark?.value).toBe(15.0);

      expect(spark!.x).toBe(100);
      spark!.update(0.1);
      expect(spark!.y).toBeGreaterThan(100); // Falling downward
    });

    it('magnetically funnels energy sparks toward player when distance < 42px', () => {
      // Spawn spark 30px away from player (within 42px magnetic radius)
      const spark = specialManager.spawnSpark(game.player.x + 25, game.player.y - 15, 15.0);
      expect(spark).not.toBeNull();

      const initialVx = spark!.vx;
      spark!.update(0.1, game.player);

      // Magnetic acceleration pulls spark toward player
      expect(spark!.vx).toBeLessThan(initialVx); // Pulled left toward player
    });

    it('collecting energy spark increases special gauge by +15% and awards points', () => {
      const initialEnergy = specialManager.energy;
      const initialScore = game.scoreManager.score;

      // Spawn spark directly on player
      const spark = specialManager.spawnSpark(game.player.x, game.player.y, 15.0);
      expect(spark).not.toBeNull();

      // Resolve collection collision
      specialManager.resolveCollisions(game.formationManager.getLivingEnemies());

      expect(specialManager.energy).toBe(initialEnergy + 15.0);
      expect(game.scoreManager.score).toBeGreaterThan(initialScore);
      expect(spark!.active).toBe(false);
    });
  });
});
