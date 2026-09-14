/**
 * Galaga Arcade Web Game — Milestone M19 Adversarial Combat & Kinematics Test Suite
 * Location: tests/unit/m19_challenger_2_adversarial.test.ts
 * 
 * Adversarial Verifications:
 * 1. Chrono Field:
 *    - Exact 60% deceleration (0.40x) for enemy bullets within R < 120px, and 1.0x at R > 120px.
 *    - Radial angular invariance for 8 directions inside 80px radius (all slowed by 60%).
 *    - Vertical distance invariance outside field (130px away, full 1.0x speed).
 *    - Player missiles immunity from Chrono Field deceleration (maintain full -480 px/s).
 *    - Diving enemy kinematics observation within and outside 120px radius.
 * 2. Kinetic Reflection Shield:
 *    - Saturation under 20 simultaneous bullets: total absorption, no NaN or negative HP, 0 deaths.
 *    - Reflection counter-missiles spawn without starving player fire quota (player count == 0).
 *    - Multi-wave barrage over time: HP clamping (never negative) and timer-dependent barrier protection.
 *    - Dual Fighter hull protection and nearest-target homing.
 * 3. Singularity EMP Collector:
 *    - 30-bullet simultaneous cluster absorption within 90px radius.
 *    - Exact +50 score and +5% special energy per bullet.
 *    - Energy ceiling invariant: strict clamp to <= 100.0 without overflow.
 *    - Boundary sharpness tolerance: 89.5px absorbed vs 90.5px untouched.
 * 4. Quantum Phase Drive:
 *    - Single fighter boundary clamping (left x=12, right x=212).
 *    - Dual fighter boundary clamping (left x=16, right x=208).
 *    - 0.4s intangibility window (lethal threats absorbed during [0, 0.4s), damage after 0.4s).
 *    - 0.5s cooldown preventing warp spamming.
 * 5. Antimatter Plasma Blaster:
 *    - Multi-rank piercing: 5 rows (40 enemies) sliced simultaneously in 1 tick.
 *    - Penetration invariant: front-rank destruction does NOT stop beam from piercing rows 2-5.
 *    - Dual beam twin-column piercing.
 *    - 10 Hz rate throttling: exactly 10 ticks over 1.0s (10x 0.1s steps, or 60-61 frames at 60 FPS).
 *    - Frame lag delta accumulation (0.25s dt -> exactly 2 ticks).
 *    - Boss damage throttling: controlled discrete damage preventing instant boss melting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { BulletManager, Bullet } from '../../src/entities/Bullet';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { PowerUpType } from '../../src/core/powerups/types';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState, type Rect } from '../../src/types';

describe('M19 Adversarial Challenge: Combat & Kinematics Verification', () => {
  let game: Game;
  let player: Player;
  let bulletManager: BulletManager;
  let powerUpManager: PowerUpManager;

  beforeEach(() => {
    game = new Game();
    player = game.player;
    bulletManager = game.bulletManager;
    powerUpManager = game.powerUpManager;
  });

  afterEach(() => {
    game.destroy();
  });

  // ==========================================================================
  // 1. Chrono Field Deceleration Accuracy & Kinematics
  // ==========================================================================
  describe('1. Chrono Field Deceleration Accuracy & Kinematics', () => {
    it('CF-1: verifies exact 60% deceleration (0.40x) inside 120px and exact 1.0x outside 120px', () => {
      // Player is at (112, 250)
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.CHRONO_FIELD, player);
      expect(player.hasChronoField).toBe(true);

      const chronoField = { x: player.x, y: player.y, radiusSq: 14400, slowFactor: 0.40 };

      // Bullet A: inside field (R = 50px away: x=112, y=200)
      // Speed = 200 px/s downward
      const bulletInside = bulletManager.fireEnemyBulletWithVector(112, 200, 0, 200);
      // Bullet B: outside field (R = 150px away: x=112, y=100)
      // Speed = 200 px/s downward
      const bulletOutside = bulletManager.fireEnemyBulletWithVector(112, 100, 0, 200);

      expect(bulletInside).not.toBeNull();
      expect(bulletOutside).not.toBeNull();

      const dt = 0.05; // 50ms
      bulletManager.update(dt, dt, chronoField);

      // BulletInside moved at 0.40 * 200 px/s * 0.05s = 4.0px (200 -> 204)
      expect(bulletInside!.position.y).toBeCloseTo(204.0, 3);

      // BulletOutside moved at 1.00 * 200 px/s * 0.05s = 10.0px (100 -> 110)
      expect(bulletOutside!.position.y).toBeCloseTo(110.0, 3);
    });

    it('CF-2: radial angular test — verifies 8-directional bullets inside 80px and in-bounds outside bullets', () => {
      // Position player at center (112, 150)
      player.x = 112;
      player.y = 150;
      const chronoField = { x: player.x, y: player.y, radiusSq: 14400, slowFactor: 0.40 };

      const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -(3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4];
      const speed = 100; // 100 px/s
      const insideBullets: Bullet[] = [];

      for (const angle of angles) {
        // Inside radius 80px (80px < 120px)
        const inX = player.x + 80 * Math.cos(angle);
        const inY = player.y + 80 * Math.sin(angle);
        const vx = speed * Math.cos(angle);
        const vy = speed * Math.sin(angle);
        const bIn = bulletManager.fireEnemyBulletWithVector(inX, inY, vx, vy);
        if (bIn) insideBullets.push(bIn);
      }
      expect(insideBullets).toHaveLength(8);

      // Outside bullets placed along vertical line at R = 130px (130px > 120px, staying within arena 0..288)
      // Top outside bullet at y = 150 - 130 = 20
      const bOutTop = bulletManager.fireEnemyBulletWithVector(112, 20, 0, 100);
      // Bottom outside bullet at y = 150 + 130 = 280
      const bOutBottom = bulletManager.fireEnemyBulletWithVector(112, 280, 0, -100);

      expect(bOutTop).not.toBeNull();
      expect(bOutBottom).not.toBeNull();

      const dt = 0.1; // 100ms
      bulletManager.update(dt, dt, chronoField);

      // Inside bullets must each have moved exactly speed * dt * 0.40 = 4.0 px along their vector
      for (let i = 0; i < 8; i++) {
        const angle = angles[i]!;
        const origX = player.x + 80 * Math.cos(angle);
        const origY = player.y + 80 * Math.sin(angle);
        const expectedX = origX + speed * Math.cos(angle) * dt * 0.40;
        const expectedY = origY + speed * Math.sin(angle) * dt * 0.40;

        const b = insideBullets[i]!;
        expect(b.position.x).toBeCloseTo(expectedX, 2);
        expect(b.position.y).toBeCloseTo(expectedY, 2);
      }

      // Outside top bullet moved at 1.00x speed: 100 * 0.1 * 1.0 = 10px (20 -> 30)
      expect(bOutTop!.position.y).toBeCloseTo(30.0, 2);
      // Outside bottom bullet moved at 1.00x speed: -100 * 0.1 * 1.0 = -10px (280 -> 270)
      expect(bOutBottom!.position.y).toBeCloseTo(270.0, 2);
    });

    it('CF-3: player missiles are completely immune to Chrono Field deceleration', () => {
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.CHRONO_FIELD, player);

      const chronoField = { x: player.x, y: player.y, radiusSq: 14400, slowFactor: 0.40 };

      // Fire player missile directly from player coordinates (inside Chrono Field)
      const playerMissile = bulletManager.firePlayerBullet(112, 240);
      expect(playerMissile).not.toBeNull();
      expect(playerMissile!.owner).toBe('PLAYER');
      expect(playerMissile!.velocity.y).toBe(-480); // Standard player missile speed is -480 px/s

      const dt = 0.05;
      bulletManager.update(dt, dt, chronoField);

      // Player missile must move at full 1.0x speed: -480 * 0.05 = -24px (240 -> 216)
      expect(playerMissile!.position.y).toBeCloseTo(216.0, 2);
    });

    it('CF-4: empirical observation of diving enemy kinematics with Chrono Field', () => {
      // Setup diving enemy inside 120px radius
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.CHRONO_FIELD, player);

      const enemy = new Enemy({
        id: 'test_zako_cf',
        type: EnemyType.ZAKO,
        x: 112,
        y: 200, // 50px from player (< 120px)
        row: 1,
        col: 1,
      });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;
      enemy.diveSpeed = 160;
      enemy.vy = 160; // Downward velocity

      const initialY = enemy.y;
      const dt = 0.1;

      // Update enemy via standard engine loop call
      enemy.update(dt, player.x, player.y);

      // Empirical Observation:
      // Enemy advance: y increases by 160 * 0.1 = 16px (200 -> 216)
      // This empirically confirms that enemy dive kinematics currently evaluate at full 1.0x dt,
      // while bullet kinematics evaluate at 0.40x dt in BulletManager.
      expect(enemy.y).toBeCloseTo(216.0, 2);
      expect(enemy.y).not.toBe(initialY);
    });
  });

  // ==========================================================================
  // 2. Kinetic Reflection Shield Saturation & Invariant Hardening
  // ==========================================================================
  describe('2. Kinetic Reflection Shield Saturation & Invariant Hardening', () => {
    it('RS-1: 20 simultaneous bullets saturation — absorbed, no NaN, no negative HP, 0 deaths', () => {
      player.x = 112;
      player.y = 250;
      player.lives = 3;
      powerUpManager.applyPowerUp(PowerUpType.REFLECTION_SHIELD, player);

      expect(player.hasReflectionShieldActive).toBe(true);
      expect(player.reflectionShieldHp).toBe(3);

      const initialLives = player.lives;
      let counterMissileCount = 0;
      player.onReflectionDeflect = vi.fn((x, y, _threat) => {
        counterMissileCount++;
        bulletManager.fireReflectionMissile(x, y - 6, 112, 50, 600);
      });

      // Fire 20 enemy bullets simultaneously overlapping player hitbox
      const bullets: Bullet[] = [];
      for (let i = 0; i < 20; i++) {
        const b = bulletManager.fireEnemyBulletWithVector(112, 250, 0, 100);
        if (b) bullets.push(b);
      }
      expect(bullets).toHaveLength(20);

      // Process collision for all 20 bullets in the same tick
      for (const bullet of bullets) {
        const hitBox = bullet.getHitbox();
        const damaged = player.hitTestAndDamage(hitBox);
        expect(damaged).toBe(false); // Every threat absorbed!
      }

      // Invariants:
      expect(player.lives).toBe(initialLives); // No life lost!
      expect(player.state).toBe('normal');
      expect(player.reflectionShieldHp).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(player.reflectionShieldHp)).toBe(true);
      expect(Number.isNaN(player.reflectionShieldHp)).toBe(false);

      // Deflection counter-missile fired on initial impact
      expect(counterMissileCount).toBeGreaterThanOrEqual(1);

      // Player primary fire quota is NOT starved by counter-missiles:
      expect(bulletManager.getPlayerBulletCount()).toBe(0);

      // Counter-missiles are present in active player-side projectiles:
      const playerBullets = bulletManager.getActivePlayerBullets();
      expect(playerBullets.length).toBeGreaterThanOrEqual(1);
      expect(playerBullets[0]!.velocity.y).toBeCloseTo(-600, 1);
    });

    it('RS-2: multi-wave barrage over time — shield HP never goes below 0 and no NaN', () => {
      player.x = 112;
      player.y = 250;
      player.lives = 3;
      powerUpManager.applyPowerUp(PowerUpType.REFLECTION_SHIELD, player);

      player.onReflectionDeflect = vi.fn((x, y) => {
        bulletManager.fireReflectionMissile(x, y - 6, 112, 50, 600);
      });

      // Simulate 8 successive hits spaced by 0.6s (greater than 0.5s invulnerability window)
      for (let wave = 0; wave < 8; wave++) {
        // Expire invulnerability timer
        player.invulnerableTimer = 0;

        const threat: Rect = { x: 110, y: 248, width: 4, height: 4 };
        const damaged = player.hitTestAndDamage(threat);

        // While shield timer is active, damage is absorbed
        expect(damaged).toBe(false);

        // reflectionShieldHp must never become negative or NaN
        expect(player.reflectionShieldHp).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(player.reflectionShieldHp)).toBe(false);
        expect(Number.isFinite(player.reflectionShieldHp)).toBe(true);
      }

      // After 8 hits, HP must be clamped at 0
      expect(player.reflectionShieldHp).toBe(0);
    });

    it('RS-3: dual fighter hull protection and nearest target homing', () => {
      // Put player into dual fighter mode
      player.x = 112;
      player.y = 250;
      (player as any)._state = 'dual';
      expect(player.isDual).toBe(true);

      powerUpManager.applyPowerUp(PowerUpType.REFLECTION_SHIELD, player);

      // Place an enemy at (180, 80)
      const enemy = new Enemy({
        id: 'target_goei',
        type: EnemyType.GOEI,
        x: 180,
        y: 80,
        row: 1,
        col: 5,
      });
      enemy.active = true;
      game.formationManager.addEnemy(enemy);

      let targetedX = 0;
      let targetedY = 0;
      player.onReflectionDeflect = vi.fn((x, y) => {
        // Nearest enemy search logic mirroring Game.ts
        let minDistSq = Infinity;
        for (const e of game.formationManager.enemies) {
          if (e.active) {
            const dx = e.x - x;
            const dy = e.y - y;
            const dSq = dx * dx + dy * dy;
            if (dSq < minDistSq) {
              minDistSq = dSq;
              targetedX = e.x;
              targetedY = e.y;
            }
          }
        }
        bulletManager.fireReflectionMissile(x, y - 6, targetedX, targetedY, 600);
      });

      // Hit left hull: (x - 16, y) = (96, 250)
      const leftThreat: Rect = { x: 94, y: 248, width: 4, height: 4 };
      const damaged = player.hitTestAndDamage(leftThreat);

      expect(damaged).toBe(false); // Absorbed!
      expect(player.isDual).toBe(true); // Ship was NOT split!
      expect(targetedX).toBe(180);
      expect(targetedY).toBe(80);
    });
  });

  // ==========================================================================
  // 3. Singularity EMP Collector Multi-Bullet Siphon & Energy Capping
  // ==========================================================================
  describe('3. Singularity EMP Collector Siphon & Energy Capping', () => {
    it('EMP-1: siphons 30 simultaneous bullets within 90px and awards exact +50 score and +5% energy', () => {
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.EMP_COLLECTOR, player);
      expect(player.hasEmpCollector).toBe(true);
      expect(powerUpManager.buffState.empCollectorTimer).toBe(5.0);

      const scoreBeforeBullets = game.scoreManager.score;

      // Spawn 30 bullets inside 90px radius (at R = 40px)
      const insideBullets: Bullet[] = [];
      for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const bx = player.x + 40 * Math.cos(angle);
        const by = player.y + 40 * Math.sin(angle);
        const b = bulletManager.fireEnemyBulletWithVector(bx, by, 0, 50);
        if (b) insideBullets.push(b);
      }
      expect(insideBullets).toHaveLength(30);

      // Spawn 10 bullets outside 90px radius (at R = 150px vertical distance)
      const outsideBullets: Bullet[] = [];
      for (let i = 0; i < 10; i++) {
        const by = player.y - 130 - i * 5;
        const b = bulletManager.fireEnemyBulletWithVector(112, by, 0, 50);
        if (b) outsideBullets.push(b);
      }
      expect(outsideBullets).toHaveLength(10);

      // Run update
      powerUpManager.update(0.016, player);

      // All 30 inside bullets must be recycled
      for (const b of insideBullets) {
        expect(b.active).toBe(false);
      }

      // All 10 outside bullets must remain active
      for (const b of outsideBullets) {
        expect(b.active).toBe(true);
      }

      // Score: scoreBeforeBullets + 30 * 50
      expect(game.scoreManager.score).toBe(scoreBeforeBullets + 30 * 50);

      // Energy: 30 * 5% = 150%, but capped strictly to 100!
      expect(game.specialMovesManager.energy).toBe(100);
      expect(game.specialMovesManager.energy).toBeLessThanOrEqual(100);
    });

    it('EMP-2: energy capping invariant — prevents overflow past 100 from high baseline', () => {
      player.x = 112;
      player.y = 250;
      game.specialMovesManager.energy = 92; // 92% full

      powerUpManager.applyPowerUp(PowerUpType.EMP_COLLECTOR, player);

      // Spawn 4 bullets inside radius (+20% energy)
      for (let i = 0; i < 4; i++) {
        bulletManager.fireEnemyBulletWithVector(112, 240 + i * 2, 0, 10);
      }

      powerUpManager.update(0.016, player);

      // 92 + 20 = 112 -> must clamp to 100.0
      expect(game.specialMovesManager.energy).toBe(100);
      expect(game.specialMovesManager.isReady()).toBe(true);
    });

    it('EMP-3: boundary sharpness tolerance at 90px (89.5px absorbed vs 90.5px untouched)', () => {
      player.x = 112;
      player.y = 200;
      powerUpManager.applyPowerUp(PowerUpType.EMP_COLLECTOR, player);

      // Bullet A: at dy = -89.5px (R^2 = 8010.25 <= 8100)
      const bNear = bulletManager.fireEnemyBulletWithVector(112, 200 - 89.5, 0, 10);
      // Bullet B: at dy = -90.5px (R^2 = 8190.25 > 8100)
      const bFar = bulletManager.fireEnemyBulletWithVector(112, 200 - 90.5, 0, 10);

      expect(bNear).not.toBeNull();
      expect(bFar).not.toBeNull();

      powerUpManager.update(0.016, player);

      expect(bNear!.active).toBe(false); // Absorbed!
      expect(bFar!.active).toBe(true);   // Untouched!
    });
  });

  // ==========================================================================
  // 4. Quantum Phase Drive Viewport Clamping & Intangibility
  // ==========================================================================
  describe('4. Quantum Phase Drive Viewport Clamping & Intangibility', () => {
    it('PD-1: single fighter boundary clamping — strictly enforces [12, 212] arena limits', () => {
      player.applyPowerUp(PowerUpType.PHASE_DRIVE);
      expect(player.hasPhaseDrive).toBe(true);

      // Left edge boundary tests
      player.x = 12;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(-1); // Warp left
      expect(player.x).toBe(12);   // Clamped to 12

      player.x = 25;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(-1); // 25 - 40 = -15 -> clamped to 12
      expect(player.x).toBe(12);

      // Right edge boundary tests
      player.x = 212;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(1);  // Warp right
      expect(player.x).toBe(212);  // Clamped to 212

      player.x = 195;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(1);  // 195 + 40 = 235 -> clamped to 212
      expect(player.x).toBe(212);
    });

    it('PD-2: dual fighter boundary clamping — strictly enforces [16, 208] arena limits', () => {
      (player as any)._state = 'dual';
      expect(player.isDual).toBe(true);
      player.applyPowerUp(PowerUpType.PHASE_DRIVE);

      // Dual left clamp
      player.x = 16;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(-1);
      expect(player.x).toBe(16);

      player.x = 30;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(-1); // 30 - 40 = -10 -> clamped to 16
      expect(player.x).toBe(16);

      // Dual right clamp
      player.x = 208;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(1);
      expect(player.x).toBe(208);

      player.x = 190;
      player.phaseWarpCooldown = 0;
      player.triggerPhaseWarp(1); // 190 + 40 = 230 -> clamped to 208
      expect(player.x).toBe(208);
    });

    it('PD-3: 0.4s intangibility window — immune during [0, 0.4s), vulnerable after 0.4s', () => {
      player.x = 112;
      player.y = 250;
      player.lives = 3;
      player.applyPowerUp(PowerUpType.PHASE_DRIVE);

      player.triggerPhaseWarp(1); // Warps to 152, grants 0.4s invulnerability
      expect(player.invulnerableTimer).toBeCloseTo(0.4, 2);

      const threat: Rect = { x: player.x - 4, y: player.y - 4, width: 8, height: 8 };

      // At t = 0.1s: immune
      player.update(0.1);
      expect(player.isInvulnerable()).toBe(true);
      expect(player.hitTestAndDamage(threat)).toBe(false);
      expect(player.lives).toBe(3);

      // At t = 0.25s: still immune
      player.update(0.15);
      expect(player.isInvulnerable()).toBe(true);
      expect(player.hitTestAndDamage(threat)).toBe(false);
      expect(player.lives).toBe(3);

      // At t = 0.45s: intangibility expired!
      player.update(0.20);
      expect(player.isInvulnerable()).toBe(false);
      expect(player.invulnerableTimer).toBe(0);

      // Threat now lands damage
      const damaged = player.hitTestAndDamage(threat);
      expect(damaged).toBe(true);
    });

    it('PD-4: 0.5s cooldown prevents rapid warp spamming', () => {
      player.x = 100;
      player.applyPowerUp(PowerUpType.PHASE_DRIVE);

      player.triggerPhaseWarp(1); // Warps from 100 to 140
      expect(player.x).toBe(140);
      expect(player.phaseWarpCooldown).toBe(0.5);

      // Immediate second attempt while on cooldown must be ignored
      player.triggerPhaseWarp(1);
      expect(player.x).toBe(140); // Did not warp!

      // Advance 0.25s: still on cooldown
      player.update(0.25);
      expect(player.phaseWarpCooldown).toBeCloseTo(0.25, 2);
      player.triggerPhaseWarp(1);
      expect(player.x).toBe(140); // Still blocked!

      // Advance another 0.3s (cooldown reaches 0)
      player.update(0.3);
      expect(player.phaseWarpCooldown).toBe(0);
      player.triggerPhaseWarp(1); // Now warps to 180!
      expect(player.x).toBe(180);
    });
  });

  // ==========================================================================
  // 5. Antimatter Plasma Blaster Multi-Rank Piercing & Throttled 10 Hz
  // ==========================================================================
  describe('5. Antimatter Plasma Blaster Multi-Rank Piercing & 10 Hz Throttling', () => {
    it('PB-1: multi-rank piercing — continuous lance slices through all 5 vertical rows simultaneously', () => {
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.ANTIMATTER_PLASMA, player);
      expect(player.hasAntimatterPlasma).toBe(true);

      // Create 5 enemies in a vertical column at x = 112 (rows 1 through 5)
      const columnEnemies: Enemy[] = [];
      for (let row = 1; row <= 5; row++) {
        const enemy = new Enemy({
          id: `rank_enemy_${row}`,
          type: EnemyType.GOEI,
          x: 112,
          y: 40 + row * 25, // y = 65, 90, 115, 140, 165
          row,
          col: 4,
          health: 2,
        });
        enemy.active = true;
        game.formationManager.addEnemy(enemy);
        columnEnemies.push(enemy);
      }

      // Enemy in an adjacent column at x = 150 (outside beam width)
      const offAxisEnemy = new Enemy({
        id: 'off_axis_enemy',
        type: EnemyType.ZAKO,
        x: 150,
        y: 100,
        row: 3,
        col: 6,
        health: 1,
      });
      offAxisEnemy.active = true;
      game.formationManager.addEnemy(offAxisEnemy);

      expect(columnEnemies).toHaveLength(5);

      // Advance 0.1s to trigger exactly 1 plasma beam damage tick
      player.update(0.10);

      // ALL 5 enemies in column must take 1 damage (HP: 2 -> 1)
      for (let i = 0; i < 5; i++) {
        const ce = columnEnemies[i]!;
        expect(ce.health).toBe(1);
        expect(ce.active).toBe(true);
      }

      // Off-axis enemy must be untouched (HP: 1)
      expect(offAxisEnemy.health).toBe(1);

      // Advance another 0.1s (second tick): all 5 enemies take second damage and are destroyed
      player.update(0.10);
      for (let i = 0; i < 5; i++) {
        const ce = columnEnemies[i]!;
        expect(ce.health).toBe(0);
        expect(ce.state).toBe(EnemyState.EXPLODING);
      }
    });

    it('PB-2: dual beam mode slices two vertical columns simultaneously', () => {
      (player as any)._state = 'dual';
      expect(player.isDual).toBe(true);
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.ANTIMATTER_PLASMA, player);

      // Left beam is at x - 8 = 104, Right beam is at x + 8 = 120
      const leftEnemy = new Enemy({
        id: 'left_col_enemy',
        type: EnemyType.ZAKO,
        x: 104,
        y: 100,
        row: 2,
        col: 3,
        health: 1,
      });
      leftEnemy.active = true;
      game.formationManager.addEnemy(leftEnemy);

      const rightEnemy = new Enemy({
        id: 'right_col_enemy',
        type: EnemyType.ZAKO,
        x: 120,
        y: 100,
        row: 2,
        col: 5,
        health: 1,
      });
      rightEnemy.active = true;
      game.formationManager.addEnemy(rightEnemy);

      // Advance 0.1s (1 tick)
      player.update(0.10);

      expect(leftEnemy.health).toBe(0);
      expect(rightEnemy.health).toBe(0);
    });

    it('PB-3: 10 Hz rate throttling — exactly 10 damage ticks processed over 1.0s elapsed', () => {
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.ANTIMATTER_PLASMA, player);

      let tickCount = 0;
      player.onPlasmaBeamTick = vi.fn(() => {
        tickCount++;
      });

      // 10 steps of 0.10s = 1.0s elapsed
      for (let step = 0; step < 10; step++) {
        player.update(0.10);
      }

      // Exactly 10 ticks must fire (10 Hz rate)
      expect(tickCount).toBe(10);
    });

    it('PB-4: lag spike accumulator — dt = 0.25s executes exactly 2 discrete ticks without tick loss', () => {
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.ANTIMATTER_PLASMA, player);

      let tickCount = 0;
      player.onPlasmaBeamTick = vi.fn(() => {
        tickCount++;
      });

      // Large frame delta (e.g. background tab or garbage collection pause)
      player.update(0.25);

      // 0.25s / 0.10s = 2 full ticks, with 0.05s remainder
      expect(tickCount).toBe(2);
      expect((player as any).plasmaTickTimer).toBeCloseTo(0.05, 3);

      // Another 0.06s update (total remainder 0.11s) triggers the 3rd tick
      player.update(0.06);
      expect(tickCount).toBe(3);
    });

    it('PB-5: boss damage throttling — deals controlled discrete damage without instant boss melting', () => {
      player.x = 112;
      player.y = 250;
      powerUpManager.applyPowerUp(PowerUpType.ANTIMATTER_PLASMA, player);

      // Setup mock Boss Galaga at (112, 60) with 20 HP
      const boss = new Enemy({
        id: 'stage_boss',
        type: EnemyType.BOSS,
        x: 112,
        y: 60,
        row: 1,
        col: 4,
        health: 20,
      });
      boss.active = true;
      game.formationManager.addEnemy(boss);

      // Run 5 discrete 0.10s ticks (0.50s total elapsed)
      for (let step = 0; step < 5; step++) {
        player.update(0.10);
      }

      // Boss HP must drop from 20 to 15 (exactly 5 damage dealt)
      expect(boss.health).toBe(15);
      expect(boss.active).toBe(true);
    });
  });
});
