/**
 * Galaga Arcade Web Game — Adversarial Stress Test Suite: Milestone 13 Allies Support System
 * 
 * Challenger 1 Adversarial Verification Suite:
 * 1. Player Missile Quota Isolation & Anti-Starvation Guarantees
 * 2. Aegis Drone Shield Synchronization & Multi-Frame Persistence
 * 3. Aegis Drone Point-Defense Flak & Pool Memory Safety
 * 4. Bomber Drone Cluster Bomb Coverage, Clamping & Numeric Sanity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { AlliesManager } from '../../src/core/allies/AlliesManager';
import { EscortDrone } from '../../src/core/allies/drones/EscortDrone';
import { AegisDrone } from '../../src/core/allies/drones/AegisDrone';
import { BomberDrone } from '../../src/core/allies/drones/BomberDrone';
import { ClusterBomb } from '../../src/core/allies/pools/ClusterBomb';
import { BombExplosion } from '../../src/core/allies/pools/BombExplosion';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';
import { PowerUpType } from '../../src/core/powerups/types';

describe('Adversarial M13 — Allies Support System Stress Harness', () => {
  let game: Game;
  let alliesManager: AlliesManager;

  beforeEach(() => {
    game = new Game();
    alliesManager = game.getAlliesManager();
  });

  // ==========================================================================
  // 1. Player Missile Quota Isolation & Cross-Starvation Resistance
  // ==========================================================================
  describe('1. Player Missile Quota Isolation & Anti-Starvation Guarantees', () => {
    let escort: EscortDrone;

    beforeEach(() => {
      escort = alliesManager.escortDrone;
      escort.activate(0, 112, 250);
      game.state = 'PLAYING';
    });

    it('Escort Drone sustained rapid autofire does NOT starve single player missile quota (max 2)', () => {
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(game.player.activeMissileCount).toBe(0);
      expect(game.player.canFire).toBe(true);

      // Simulate sustained drone autofire for 30 cycles (30 * 0.35s = 10.5s)
      for (let i = 0; i < 30; i++) {
        escort.update(0.35, 112, 250);
      }

      expect(escort.shotsFired).toBe(30);

      // Player bullet count must be strictly 0
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(game.player.activeMissileCount).toBe(0);

      // Single player must be able to fire 2 full missiles without impediment
      expect(game.player.canFire).toBe(true);
      const shot1 = game.player.attemptFire();
      expect(shot1).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(1);
      expect(game.player.activeMissileCount).toBe(1);

      // Reset fire cooldown to test immediate consecutive shot
      game.player.fireCooldownTimer = 0;
      expect(game.player.canFire).toBe(true);
      const shot2 = game.player.attemptFire();
      expect(shot2).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);
      expect(game.player.activeMissileCount).toBe(2);

      // Player quota saturated at 2
      game.player.fireCooldownTimer = 0;
      expect(game.player.canFire).toBe(false);
      const shot3 = game.player.attemptFire();
      expect(shot3).toBe(false);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);
    });

    it('Escort Drone sustained rapid autofire does NOT starve dual fighter missile quota (max 4)', () => {
      game.player.isDual = true;
      expect(game.player.isDual).toBe(true);
      expect(game.player.getMaxMissileQuota()).toBe(4);

      // Rapid drone autofire 20 times
      for (let i = 0; i < 20; i++) {
        escort.update(0.35, 112, 250);
      }
      expect(escort.shotsFired).toBe(20);

      // Player quota is completely unconsumed
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(game.player.activeMissileCount).toBe(0);
      expect(game.player.canFire).toBe(true);

      // Fire 1st dual volley (2 missiles)
      const volley1 = game.player.attemptFire();
      expect(volley1).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);
      expect(game.player.activeMissileCount).toBe(2);

      // Fire 2nd dual volley (2 missiles -> 4 total)
      game.player.fireCooldownTimer = 0;
      expect(game.player.canFire).toBe(true);
      const volley2 = game.player.attemptFire();
      expect(volley2).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(4);
      expect(game.player.activeMissileCount).toBe(4);

      // 3rd volley must be rejected due to 4-missile dual quota
      game.player.fireCooldownTimer = 0;
      expect(game.player.canFire).toBe(false);
      const volley3 = game.player.attemptFire();
      expect(volley3).toBe(false);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(4);
    });

    it('Reverse Isolation: saturated player quota does NOT block or starve Escort Drone autofire', () => {
      // Saturate single player quota
      game.bulletManager.firePlayerBullet(112, 240, false);
      game.bulletManager.firePlayerBullet(112, 230, false);
      game.player.activeMissileCount = game.bulletManager.getPlayerBulletCount();
      expect(game.player.activeMissileCount).toBe(2);
      expect(game.bulletManager.canPlayerFire(false)).toBe(false);

      const initialDroneShots = escort.shotsFired;

      // Drone autofires past interval
      escort.update(0.4, 112, 250);
      expect(escort.shotsFired).toBe(initialDroneShots + 1);

      // Drone fires another bolt
      escort.update(0.4, 112, 250);
      expect(escort.shotsFired).toBe(initialDroneShots + 2);

      // Player missile count remains strictly 2, unaffected by drone firing
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);
    });

    it('Recycling independence: despawn of drone bullets never decrements or underflows player bullet count', () => {
      // Fire 1 player bullet
      game.bulletManager.firePlayerBullet(112, 250, false);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(1);

      // Fire 5 drone bullets
      for (let i = 0; i < 5; i++) {
        escort.firePlasmaBolt();
      }

      // Player count is still 1
      expect(game.bulletManager.getPlayerBulletCount()).toBe(1);

      // Advance physics so drone bullets travel offscreen top (y < -8)
      // Speed 460 px/s => in 0.7s moves ~322px
      for (let i = 0; i < 7; i++) {
        game.bulletManager.update(0.1);
      }

      // Both player bullet and drone bullets recycled, player bullet count should be 0 (never negative)
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(game.bulletManager.getPlayerBulletCount()).toBeGreaterThanOrEqual(0);
    });

    it('Survives 1,000 interleaved fire-and-recycle ticks with concurrent drone fire and player input', () => {
      let totalPlayerFired = 0;

      for (let tick = 0; tick < 1000; tick++) {
        const dt = 1 / 60;

        // Drone updates and fires every 0.35s
        escort.update(dt, game.player.x, game.player.y);

        // Player randomly attempts to fire
        if (tick % 5 === 0 && game.player.canFire) {
          const fired = game.player.attemptFire();
          if (fired) totalPlayerFired++;
        }

        // Advance projectiles and game state
        game.bulletManager.update(dt);
        game.player.update(dt);
        game.player.activeMissileCount = game.bulletManager.getPlayerBulletCount();

        // INVARIANTS:
        expect(game.bulletManager.getPlayerBulletCount()).toBeGreaterThanOrEqual(0);
        expect(game.bulletManager.getPlayerBulletCount()).toBeLessThanOrEqual(2);
        expect(game.player.activeMissileCount).toBeLessThanOrEqual(2);
        expect(escort.shotsFired).toBeGreaterThanOrEqual(0);
      }

      expect(totalPlayerFired).toBeGreaterThan(10);
      expect(escort.shotsFired).toBeGreaterThan(10);
    });

    it('Preserves quota isolation when player possesses Scatter Shot (3-way spread) buff', () => {
      game.powerUpManager.applyPowerUp(PowerUpType.SCATTER_SHOT, game.player);
      expect(game.player.hasScatterShot).toBe(true);
      expect(game.player.getMaxMissileQuota()).toBe(6);

      // Fire drone bolts continuously
      for (let i = 0; i < 10; i++) {
        escort.update(0.35, 112, 250);
      }
      expect(escort.shotsFired).toBe(10);

      // Player bullet count remains 0
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);

      // Player can fire full 3-way spread (3 bullets per volley, max 2 volleys = 6 bullets)
      const firedVolley1 = game.player.attemptFire();
      expect(firedVolley1).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(3);

      game.player.fireCooldownTimer = 0;
      const firedVolley2 = game.player.attemptFire();
      expect(firedVolley2).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(6);

      // Quota saturated at 6
      game.player.fireCooldownTimer = 0;
      expect(game.player.canFire).toBe(false);

      // Drone can still fire without error
      escort.firePlasmaBolt();
      expect(escort.shotsFired).toBe(11);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(6);
    });
  });

  // ==========================================================================
  // 2. Aegis Drone Shield Synchronization & Multi-Frame Persistence
  // ==========================================================================
  describe('2. Aegis Drone Shield Synchronization & Multi-Frame Persistence', () => {
    let aegis: AegisDrone;

    beforeEach(() => {
      aegis = alliesManager.aegisDrone;
      aegis.activate(0, 112, 250);
      game.state = 'PLAYING';
    });

    it('Restored shield persists across 300 consecutive frames of PowerUpManager.update(dt) without being canceled', () => {
      // Ensure shield is completely depleted initially
      game.player.hasShield = false;
      game.player.shieldHp = 0;
      game.powerUpManager.buffState.hasShield = false;

      // Charge Aegis drone past 6.0s pulse interval
      aegis.update(6.1, 112, 250);

      expect(aegis.shieldsRepaired).toBe(1);
      expect(game.player.hasShield).toBe(true);
      expect(game.player.shieldHp).toBe(1);
      expect(game.powerUpManager.buffState.hasShield).toBe(true);

      // Simulate 300 frames (5.0s at 60 FPS) of PowerUpManager updates
      for (let frame = 0; frame < 300; frame++) {
        game.powerUpManager.update(1 / 60, game.player);

        // Invariant: PowerUpManager must NOT overwrite hasShield to false!
        expect(game.player.hasShield).toBe(true);
        expect(game.powerUpManager.buffState.hasShield).toBe(true);
      }
    });

    it('Shield remains fully synchronized across integrated Game.update() cycles', () => {
      game.player.hasShield = false;
      game.player.shieldHp = 0;
      game.powerUpManager.buffState.hasShield = false;

      // Run game loop for 400 ticks (6.67 seconds)
      for (let tick = 0; tick < 400; tick++) {
        game.update(1 / 60);
      }

      // After 6.67s, Aegis should have triggered repair pulse
      expect(aegis.shieldsRepaired).toBeGreaterThanOrEqual(1);
      expect(game.player.hasShield).toBe(true);
      expect(game.player.shieldHp).toBe(1);
      expect(game.powerUpManager.buffState.hasShield).toBe(true);

      // Run another 300 ticks with shield active
      for (let tick = 0; tick < 300; tick++) {
        game.update(1 / 60);
        expect(game.player.hasShield).toBe(true);
        expect(game.powerUpManager.buffState.hasShield).toBe(true);
      }
    });

    it('Shield absorbs incoming hostile enemy bullet, resets cleanly, and initiates new Aegis cycle', () => {
      // 1. Grant shield via Aegis
      aegis.emitRepairPulse();
      expect(game.player.hasShield).toBe(true);
      expect(game.player.shieldHp).toBe(1);
      expect(game.powerUpManager.buffState.hasShield).toBe(true);

      // 2. Incoming enemy bullet impacts player ship
      const bulletHitbox = {
        x: game.player.x - 1,
        y: game.player.y - 2,
        width: 2,
        height: 4,
      };

      const destroyed = game.player.hitTestAndDamage(bulletHitbox);

      // Deflected by shield: destroyed is false, shield is consumed
      expect(destroyed).toBe(false);
      expect(game.player.hasShield).toBe(false);
      expect(game.player.shieldHp).toBe(0);
      expect(game.player.invulnerableTimer).toBeGreaterThan(0);

      // 3. Aegis monitors depleted shield and begins 6.0s charge
      aegis.update(3.0, 112, 250);
      expect(aegis.shieldsRepaired).toBe(1); // Not ready yet

      aegis.update(3.1, 112, 250);
      expect(aegis.shieldsRepaired).toBe(2); // Restored!
      expect(game.player.hasShield).toBe(true);
      expect(game.player.shieldHp).toBe(1);
    });

    it('Clamps shieldHp to maximum of 1, preventing runaway shield stacking', () => {
      game.player.hasShield = false;
      game.player.shieldHp = 0;

      // Pulse 1
      aegis.emitRepairPulse();
      expect(game.player.shieldHp).toBe(1);

      // Pulse 2
      aegis.emitRepairPulse();
      expect(game.player.shieldHp).toBe(1);

      // Pulse 3
      aegis.emitRepairPulse();
      expect(game.player.shieldHp).toBe(1);

      // 100 update ticks while shield is active
      for (let i = 0; i < 100; i++) {
        aegis.update(0.1, 112, 250);
        expect(game.player.shieldHp).toBeLessThanOrEqual(1);
      }
    });

    it('Synchronizes shield for Dual Fighter configuration protecting both ship hulls', () => {
      game.player.isDual = true;
      game.player.hasShield = false;
      game.player.shieldHp = 0;

      aegis.emitRepairPulse();
      expect(game.player.hasShield).toBe(true);
      expect(game.player.shieldHp).toBe(1);
      expect(game.powerUpManager.buffState.hasShield).toBe(true);

      // Test hit on left hull (x - 8)
      const leftHullHitbox = {
        x: game.player.x - 10,
        y: game.player.y - 4,
        width: 4,
        height: 8,
      };

      const leftHitResult = game.player.hitTestAndDamage(leftHullHitbox);
      expect(leftHitResult).toBe(false); // Shield absorbed!
      expect(game.player.isDual).toBe(true); // Neither hull destroyed
      expect(game.player.hasShield).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Aegis Drone Point-Defense Flak & Pool Memory Safety
  // ==========================================================================
  describe('3. Aegis Drone Point-Defense Flak & Pool Memory Safety', () => {
    let aegis: AegisDrone;

    beforeEach(() => {
      aegis = alliesManager.aegisDrone;
      aegis.activate(0, 112, 250);
      game.state = 'PLAYING';
    });

    it('Intercepts enemy bullet at exact 12px point-defense boundary and recycles to pool', () => {
      // Place bullet at exactly distance = 12px (dx = 12, dy = 0)
      const bullet = game.bulletManager.fireEnemyBulletWithVector(aegis.x + 12, aegis.y, 0, 100);
      expect(bullet).not.toBeNull();
      expect(bullet?.active).toBe(true);
      expect(game.bulletManager.getEnemyBulletCount()).toBe(1);

      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();

      expect(bullet?.active).toBe(false);
      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
    });

    it('Does NOT intercept enemy bullet outside 12px boundary (e.g. 12.01px or 13px)', () => {
      // Place bullet outside boundary (dx = 13, dy = 0)
      const bullet = game.bulletManager.fireEnemyBulletWithVector(aegis.x + 13, aegis.y, 0, 100);
      expect(bullet).not.toBeNull();
      expect(bullet?.active).toBe(true);
      expect(game.bulletManager.getEnemyBulletCount()).toBe(1);

      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();

      // Outside radius: bullet must remain active
      expect(bullet?.active).toBe(true);
      expect(game.bulletManager.getEnemyBulletCount()).toBe(1);
    });

    it('Intercepts bullet positioned at zero distance directly on drone origin', () => {
      const bullet = game.bulletManager.fireEnemyBulletWithVector(aegis.x, aegis.y, 0, 150);
      expect(bullet).not.toBeNull();
      expect(bullet?.active).toBe(true);

      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();

      expect(bullet?.active).toBe(false);
      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
    });

    it('Simultaneously neutralizes multiple hostile bullets within 12px radius without skipping', () => {
      const spawned = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        const bx = aegis.x + Math.cos(angle) * 8; // 8px from center <= 12px
        const by = aegis.y + Math.sin(angle) * 8;
        const b = game.bulletManager.fireEnemyBulletWithVector(bx, by, 0, 120);
        expect(b).not.toBeNull();
        spawned.push(b!);
      }

      expect(game.bulletManager.getEnemyBulletCount()).toBe(8);

      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();

      // All 8 must be neutralized
      for (const b of spawned) {
        expect(b.active).toBe(false);
      }
      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
    });

    it('Defensive idempotency: repeated interceptHostileBullets() calls never double-free or corrupt pool', () => {
      const bullet = game.bulletManager.fireEnemyBulletWithVector(aegis.x + 5, aegis.y + 5, 0, 100);
      expect(bullet).not.toBeNull();
      expect(game.bulletManager.getEnemyBulletCount()).toBe(1);

      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();
      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);

      // Call interceptHostileBullets() 5 more times in immediate succession
      for (let i = 0; i < 5; i++) {
        aegis.pointDefenseCooldown = 0;
        expect(() => aegis.interceptHostileBullets()).not.toThrow();
        expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
      }

      // Explicitly attempt manual double-recycle on the already released bullet
      const doubleRecycleResult = game.bulletManager.recycle(bullet!);
      expect(doubleRecycleResult).toBe(false); // Safeguarded!
      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
    });

    it('Selective targeting: NEVER intercepts player missiles, escort drone bolts, or special munitions', () => {
      // Spawn player missile within 5px of Aegis drone
      const playerBullet = game.bulletManager.firePlayerBullet(aegis.x + 3, aegis.y, false);
      expect(playerBullet).not.toBeNull();
      expect(playerBullet?.active).toBe(true);

      // Spawn escort drone bolt within 5px of Aegis drone
      const droneBolt = game.bulletManager.fireDroneBullet(aegis.x - 3, aegis.y);
      expect(droneBolt).not.toBeNull();
      expect(droneBolt?.active).toBe(true);

      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();

      // Neither player missile nor drone bolt should be intercepted
      expect(playerBullet?.active).toBe(true);
      expect(droneBolt?.active).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(1);
    });

    it('Stress: 50 dense enemy bullet cluster intercepted with 100% clean recovery and 0 leaks', () => {
      for (let i = 0; i < 50; i++) {
        const r = (i / 50) * 11; // All within 0 to 11px
        const theta = i * 0.5;
        game.bulletManager.fireEnemyBulletWithVector(
          aegis.x + Math.cos(theta) * r,
          aegis.y + Math.sin(theta) * r,
          0,
          100
        );
      }

      expect(game.bulletManager.getEnemyBulletCount()).toBe(50);

      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();

      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);

      // Verify that after 50 bullets are recycled, new bullets can be spawned freely
      const newBullet = game.bulletManager.fireEnemyBulletWithVector(100, 100, 0, 100);
      expect(newBullet).not.toBeNull();
      expect(newBullet?.active).toBe(true);
      expect(game.bulletManager.getEnemyBulletCount()).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Bomber Drone Cluster Bomb Coverage, Clamping & Numeric Sanity
  // ==========================================================================
  describe('4. Bomber Drone Cluster Bomb Coverage, Clamping & Numeric Sanity', () => {
    let bomber: BomberDrone;

    beforeEach(() => {
      bomber = alliesManager.bomberDrone;
    });

    it('Traverses playfield from X < 0 to X > 224 with strictly finite coordinates (zero NaN/Infinity)', () => {
      bomber.activate(0, -50, 36);
      expect(bomber.x).toBe(-50);
      expect(bomber.y).toBe(36);

      // Advance across the screen in small dt steps
      const steps = 60; // 60 * 0.05s = 3.0s => travel 3.0 * 140 = 420px
      for (let i = 0; i < steps; i++) {
        bomber.update(0.05);

        expect(Number.isFinite(bomber.x)).toBe(true);
        expect(Number.isFinite(bomber.y)).toBe(true);
        expect(Number.isFinite(bomber.vx)).toBe(true);
        expect(Number.isFinite(bomber.vy)).toBe(true);
        expect(Number.isNaN(bomber.x)).toBe(false);
        expect(Number.isNaN(bomber.y)).toBe(false);
      }

      // Beyond X > 248, bomber must deactivate
      expect(bomber.x).toBeGreaterThan(248);
      expect(bomber.active).toBe(false);
    });

    it('Strictly restricts bomb drops to playable range [16, 208] px and clamps to max 6 bombs', () => {
      bomber.activate(0, -20, 36);

      let droppedOutsideRange = false;
      const originalDrop = bomber.dropClusterBomb.bind(bomber);
      bomber.dropClusterBomb = () => {
        if (bomber.x < 16 || bomber.x > 208) {
          droppedOutsideRange = true;
        }
        originalDrop();
      };

      // Sweep through entire flight
      for (let i = 0; i < 100; i++) {
        bomber.update(0.05);
      }

      expect(droppedOutsideRange).toBe(false);
      expect(bomber.bombsDropped).toBeGreaterThan(0);
      expect(bomber.bombsDropped).toBeLessThanOrEqual(6);
    });

    it('Handles extreme spawn coordinates for ClusterBomb without producing NaN or Infinity', () => {
      const testCoordinates = [
        { x: -100, y: -50 },
        { x: 0, y: 0 },
        { x: 112, y: 36 },
        { x: 224, y: 100 },
        { x: 300, y: 350 },
      ];

      for (const coords of testCoordinates) {
        const bomb = alliesManager.spawnClusterBomb(coords.x, coords.y, 0, 150, 105);
        if (!bomb) continue;

        // Verify initial state
        expect(Number.isFinite(bomb.x)).toBe(true);
        expect(Number.isFinite(bomb.y)).toBe(true);
        expect(Number.isFinite(bomb.vx)).toBe(true);
        expect(Number.isFinite(bomb.vy)).toBe(true);

        // Update physics
        for (let t = 0; t < 20; t++) {
          const alive = bomb.update(0.05);
          expect(Number.isFinite(bomb.x)).toBe(true);
          expect(Number.isFinite(bomb.y)).toBe(true);
          expect(Number.isFinite(bomb.vy)).toBe(true);
          expect(Number.isNaN(bomb.x)).toBe(false);
          expect(Number.isNaN(bomb.y)).toBe(false);

          if (!alive) break;
        }
      }
    });

    it('ClusterBomb update handles zero dt, extreme dt, and varied timesteps safely', () => {
      const bomb = new ClusterBomb(1);
      bomb.init(100, 36, 0, 150, 105);

      // Zero dt tick
      const alive0 = bomb.update(0);
      expect(alive0).toBe(true);
      expect(bomb.x).toBe(100);
      expect(bomb.y).toBe(36);
      expect(Number.isFinite(bomb.vy)).toBe(true);

      // Normal dt tick
      const alive1 = bomb.update(0.016667);
      expect(alive1).toBe(true);
      expect(bomb.y).toBeGreaterThan(36);
      expect(Number.isFinite(bomb.vy)).toBe(true);

      // Huge dt tick triggering altitude detonation
      const aliveHuge = bomb.update(1.0);
      expect(aliveHuge).toBe(false); // Detonates!
      expect(Number.isFinite(bomb.x)).toBe(true);
      expect(Number.isFinite(bomb.y)).toBe(true);
    });

    it('BombExplosion shockwave expansion calculates strictly finite radius and alpha across all phases', () => {
      const exp = new BombExplosion(1);
      exp.init(112, 105, 28, 2, 0.4);

      expect(exp.currentRadius).toBe(4);
      expect(Number.isFinite(exp.currentRadius)).toBe(true);

      // Step through explosion expansion
      let frames = 0;
      while (exp.active && frames < 50) {
        exp.update(0.02);
        frames++;

        expect(Number.isFinite(exp.currentRadius)).toBe(true);
        expect(Number.isNaN(exp.currentRadius)).toBe(false);
        expect(exp.currentRadius).toBeGreaterThanOrEqual(4);
        expect(exp.currentRadius).toBeLessThanOrEqual(28.001);

        const progress = Math.min(1.0, exp.timer / exp.maxLife);
        const alpha = Math.max(0, 1.0 - progress);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(alpha)).toBe(true);
      }

      expect(exp.active).toBe(false);
    });

    it('Multi-hit prevention: shockwave damages edge and center enemies exactly once per explosion', () => {
      // Spawn 3 enemies across playfield: left edge (X=16), center (X=112), right edge (X=208)
      const enemyLeft = new Enemy({ id: 'zako_edge_l', type: EnemyType.ZAKO, x: 16, y: 100 });
      const enemyCenter = new Enemy({ id: 'zako_center', type: EnemyType.ZAKO, x: 112, y: 100 });
      const enemyRight = new Enemy({ id: 'zako_edge_r', type: EnemyType.ZAKO, x: 208, y: 100 });

      const enemies = [enemyLeft, enemyCenter, enemyRight];
      for (const e of enemies) {
        e.state = EnemyState.IN_FORMATION;
        game.formationManager.enemies.push(e);
      }

      // Detonate explosion covering left enemy
      const expLeft = alliesManager.spawnExplosion(16, 100, 28, 2);
      expect(expLeft).not.toBeNull();

      // Resolve collisions on 1st frame
      alliesManager.resolveCollisions(enemies);
      expect(expLeft?.hasHit('zako_edge_l')).toBe(true);
      expect(enemyLeft.health).toBeLessThanOrEqual(0);

      // Reset left enemy health to test repeat immunity from same explosion
      enemyLeft.health = 10;
      enemyLeft.state = EnemyState.IN_FORMATION;

      // Resolve collisions on 2nd frame with same explosion
      alliesManager.resolveCollisions(enemies);

      // Enemy health must NOT be deducted again because expLeft already recorded hit
      expect(enemyLeft.health).toBe(10);
    });

    it('ClusterBomb pool saturation and graceful recovery: rejects 17th acquisition and recovers cleanly', () => {
      const pool = alliesManager.getBombPool();
      expect(pool.getMaxSize()).toBe(16);

      const activeBombs: ClusterBomb[] = [];
      for (let i = 0; i < 16; i++) {
        const b = alliesManager.spawnClusterBomb(i * 10, 36);
        expect(b).not.toBeNull();
        activeBombs.push(b!);
      }

      expect(pool.getActiveCount()).toBe(16);

      // 17th request must be rejected safely with null (no crash, autoExpand = false)
      const overflow = alliesManager.spawnClusterBomb(100, 36);
      expect(overflow).toBeNull();
      expect(pool.getActiveCount()).toBe(16);

      // Detonate all 16 bombs
      for (const b of activeBombs) {
        b.timer = b.maxLife; // trigger expiration
      }

      alliesManager.update(0.1);

      // All 16 bombs must be detonated and released back to pool
      expect(pool.getActiveCount()).toBe(0);

      // Can lease from pool again without issue
      const freshBomb = alliesManager.spawnClusterBomb(100, 36);
      expect(freshBomb).not.toBeNull();
      expect(pool.getActiveCount()).toBe(1);
    });
  });
});
