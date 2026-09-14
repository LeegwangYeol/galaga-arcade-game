/**
 * Milestone 15 Adversarial Challenge: QA Cheat Controller & State Transitions Fuzzing
 * 
 * Tests:
 * 1. Rapid Stage Skipping Fuzzing:
 *    - 100 consecutive rapid skips across random valid stages (1..50), negative stages, and > 50 stages.
 *    - Boundary inputs (0, float, NaN, Infinity, null, undefined).
 *    - Interleaved game loop ticks and rapid multi-boss jumping.
 * 2. Extreme State Skipping:
 *    - Skipping mid Aeternum Mega-Beam firing (Stage 50 boss).
 *    - Skipping mid The Contingency rogue AI pulse & glitching.
 *    - Skipping mid The Unbidden gravitational spacetime rift distortion.
 *    - Skipping mid Player destruction sequence.
 *    - Skipping while game state is GAME_OVER.
 *    - Verification of zero unhandled exceptions, zero NaN coordinates, and clean state recovery.
 * 3. Idempotency & Edge Invocation:
 *    - Calling setInvincible(true) / setInvincible(false) repeatedly.
 *    - Calling fillEnergy() repeatedly with normal, extreme, and invalid values.
 *    - Calling killAllEnemies() repeatedly on already empty / cleared screens.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { CrisisEventType } from '../../src/core/crisis/types';
import { Player } from '../../src/entities/Player';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import type { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';

/**
 * Asserts that all entity coordinates and velocities across the game are valid, finite numbers (non-NaN).
 */
function assertNoNaNCoordinates(game: Game): void {
  // 1. Player coordinates
  expect(Number.isFinite(game.player.x)).toBe(true);
  expect(Number.isFinite(game.player.y)).toBe(true);
  expect(Number.isNaN(game.player.x)).toBe(false);
  expect(Number.isNaN(game.player.y)).toBe(false);
  expect(Number.isFinite(game.player.vx)).toBe(true);
  expect(Number.isFinite(game.player.vy)).toBe(true);

  // 2. Active Boss coordinates
  if (game.bossManager?.activeBoss && game.bossManager.activeBoss.active) {
    const boss = game.bossManager.activeBoss;
    expect(Number.isFinite(boss.x)).toBe(true);
    expect(Number.isFinite(boss.y)).toBe(true);
    expect(Number.isNaN(boss.x)).toBe(false);
    expect(Number.isNaN(boss.y)).toBe(false);

    for (const sub of boss.subUnits) {
      if (sub.active) {
        expect(Number.isFinite(sub.x)).toBe(true);
        expect(Number.isFinite(sub.y)).toBe(true);
      }
    }
  }

  // 3. Living Formation Enemies
  if (game.formationManager) {
    const living = game.formationManager.getLivingEnemies();
    for (const enemy of living) {
      if (enemy.active) {
        expect(Number.isFinite(enemy.x)).toBe(true);
        expect(Number.isFinite(enemy.y)).toBe(true);
        expect(Number.isNaN(enemy.x)).toBe(false);
        expect(Number.isNaN(enemy.y)).toBe(false);
      }
    }
  }

  // 4. Projectile positions
  if (game.bulletManager) {
    const checkBullet = (b: any) => {
      if (b.active && b.position) {
        expect(Number.isFinite(b.position.x)).toBe(true);
        expect(Number.isFinite(b.position.y)).toBe(true);
        expect(Number.isNaN(b.position.x)).toBe(false);
        expect(Number.isNaN(b.position.y)).toBe(false);
      }
    };
    if (typeof (game.bulletManager as any).forEachActivePlayerBullet === 'function') {
      (game.bulletManager as any).forEachActivePlayerBullet(checkBullet);
    }
    if (typeof (game.bulletManager as any).forEachActiveEnemyBullet === 'function') {
      (game.bulletManager as any).forEachActiveEnemyBullet(checkBullet);
    }
  }
}

describe('Milestone 15 Adversarial Verification: QA Cheat Controller & State Fuzzing', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    if (game) {
      game.destroy();
    }
  });

  // ==========================================================================
  // Dimension 1: Rapid Stage Skipping Fuzzing Harness (100 Rapid Transitions)
  // ==========================================================================
  describe('Dimension 1: Rapid Stage Skipping Fuzzing Harness', () => {
    it('executes 100 rapid stage skips across random valid, negative, and out-of-bounds stages without crashing or desyncing', () => {
      const cheat = game.getCheatController();
      expect(cheat).toBeDefined();

      // Pseudo-random deterministic generator for repeatable fuzzing
      let seed = 123456789;
      function nextRandom(): number {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      // Predefined boundary values to inject into fuzz sequence
      const negativeStages = [-1, -2, -5, -10, -25, -50, -999, -Infinity];
      const overflowStages = [51, 52, 60, 75, 100, 250, 9999, Infinity];
      const malformedStages = [0, 0.5, 1.2, 10.99, 25.5, 50.1, NaN, null as any, undefined as any, '10' as any];

      let currentValidStage = game.stage; // Starts at 1

      for (let i = 0; i < 100; i++) {
        const roll = nextRandom();
        let targetStage: any;
        let expectedValid: boolean;

        if (roll < 0.60) {
          // 60% chance: Valid integer in [1, 50]
          targetStage = Math.floor(nextRandom() * 50) + 1;
          expectedValid = true;
        } else if (roll < 0.75) {
          // 15% chance: Negative stage
          targetStage = negativeStages[Math.floor(nextRandom() * negativeStages.length)];
          expectedValid = false;
        } else if (roll < 0.90) {
          // 15% chance: Stage > 50
          targetStage = overflowStages[Math.floor(nextRandom() * overflowStages.length)];
          expectedValid = false;
        } else {
          // 10% chance: Non-integer, NaN, or malformed type
          targetStage = malformedStages[Math.floor(nextRandom() * malformedStages.length)];
          expectedValid = false;
        }

        const success = cheat.skipToStage(targetStage);

        if (expectedValid) {
          expect(success).toBe(true);
          expect(game.stage).toBe(targetStage);
          expect(game.scoreManager.stage).toBe(targetStage);
          currentValidStage = targetStage;

          // Check appropriate game state
          if (DifficultyCalculator.isChallengingStage(targetStage)) {
            expect(game.state).toBe('CHALLENGING_STAGE');
          } else {
            expect(game.state).toBe('PLAYING');
          }
        } else {
          expect(success).toBe(false);
          // Stage must remain unchanged at last valid stage
          expect(game.stage).toBe(currentValidStage);
        }

        // Every 10 iterations, simulate game loop tick and verify zero NaNs
        if (i % 10 === 0) {
          expect(() => game.update(1 / 60)).not.toThrow();
          assertNoNaNCoordinates(game);
        }
      }

      // Final post-fuzz verification
      expect(game.stage).toBe(currentValidStage);
      expect(() => game.update(1 / 60)).not.toThrow();
      assertNoNaNCoordinates(game);
      expect(game.bulletManager.getPool().getActiveCount()).toBeLessThanOrEqual(
        game.bulletManager.getPool().getCapacity()
      );
    });

    it('survives rapid back-to-back jumping across all 5 Boss stages and Challenging stages', () => {
      const cheat = game.getCheatController();

      const sequence = [
        10, // Boss: Cyber Dreadnought
        20, // Boss: Dimensional Leviathan
        3,  // Challenging Stage 1
        30, // Boss: Nanite Swarm Colossus
        7,  // Challenging Stage 2
        40, // Boss: Psionic Shroud Harbinger
        11, // Challenging Stage 3
        50, // Boss: Aeternum Star-Eater Core
        15, // Challenging Stage 4
        10, // Back to Boss 10
        1,  // Normal Stage 1
      ];

      for (const st of sequence) {
        const ok = cheat.skipToStage(st);
        expect(ok).toBe(true);
        expect(game.stage).toBe(st);

        // Run 5 ticks to activate internal entity AI
        for (let t = 0; t < 5; t++) {
          game.update(1 / 60);
        }

        assertNoNaNCoordinates(game);

        if (DifficultyCalculator.isBossStage(st)) {
          expect(game.bossManager.activeBoss).not.toBeNull();
          expect(game.bossManager.activeBoss?.active).toBe(true);
        } else {
          expect(game.bossManager.activeBoss).toBeNull();
        }

        if (DifficultyCalculator.isChallengingStage(st)) {
          expect(game.state).toBe('CHALLENGING_STAGE');
        }
      }
    });

    it('recycles all 7 munition and entity pools to 0 active leases after heavy combat spam and rapid skips', () => {
      const cheat = game.getCheatController();

      for (let cycle = 0; cycle < 5; cycle++) {
        cheat.skipToStage(12);

        // Saturate combat with missiles, sparks, drones, and particles
        for (let b = 0; b < 10; b++) {
          game.bulletManager.firePlayerBullet(80 + b * 6, 220, false, 350);
        }
        game.particleSystem.spawnHitSparks(112, 120);
        game.particleSystem.spawnSmallAlienExplosion(90, 80);
        cheat.unlockDrone('bomber');
        cheat.triggerSpecialMove('nova');

        // Verify active leases exist
        expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThan(0);
        expect(game.particleSystem.getPool().getActiveCount()).toBeGreaterThan(0);

        // Instantly skip to another stage
        cheat.skipToStage(13);

        // All 7 pools must immediately evaluate to 0 active entities
        expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
        expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
        expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
        expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
        expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
      }
    });
  });

  // ==========================================================================
  // Dimension 2: Extreme State Skipping & Recovery
  // ==========================================================================
  describe('Dimension 2: Extreme State Skipping & Clean Recovery', () => {
    it('skips cleanly while in the middle of Aeternum Mega-Beam sweep firing on Stage 50', () => {
      const cheat = game.getCheatController();

      // 1. Skip to Stage 50
      const skippedTo50 = cheat.skipToStage(50);
      expect(skippedTo50).toBe(true);
      expect(game.stage).toBe(50);

      const aeternum = game.bossManager.activeBoss as AeternumCore;
      expect(aeternum).not.toBeNull();
      expect(aeternum.bossName).toBe('AETERNUM STAR-EATER CORE');

      // 2. Put Aeternum into Phase 2 active Mega-Beam firing
      aeternum.phase = 'PHASE_2';
      aeternum.megaBeam.active = true;
      aeternum.megaBeam.charging = false;
      aeternum.megaBeam.firing = true;
      aeternum.megaBeam.fireTimer = 1.8;
      aeternum.megaBeam.centerX = 112;
      aeternum.megaBeam.sweepSpeed = 50;
      aeternum.megaBeam.sweepDir = 1;

      // Update 5 frames with active beam sweep
      for (let f = 0; f < 5; f++) {
        game.update(1 / 60);
      }
      expect(aeternum.megaBeam.firing).toBe(true);

      // 3. Skip stage right in the middle of the Mega-Beam firing
      expect(() => cheat.skipToStage(1)).not.toThrow();

      // 4. Assert clean teardown and state recovery
      expect(game.stage).toBe(1);
      expect(game.state).toBe('PLAYING');
      expect(game.bossManager.activeBoss).toBeNull();
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);

      // Verify zero NaNs on player and enemies
      assertNoNaNCoordinates(game);

      // Player must be alive, positioned correctly, and responsive
      expect(game.player.state).toBe('normal');
      expect(game.player.x).toBe(112);
      expect(game.player.y).toBe(Player.BASELINE_Y);

      // Run 30 full ticks to confirm zero post-skip exceptions
      for (let tick = 0; tick < 30; tick++) {
        expect(() => game.update(1 / 60)).not.toThrow();
      }
      assertNoNaNCoordinates(game);
    });

    it('skips cleanly while in the middle of The Contingency rogue AI pulse and firing glitch', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(15);

      // Activate The Contingency
      const crisisActivated = cheat.triggerCrisis('contingency');
      expect(crisisActivated).toBe(true);

      const crisis = game.crisisEventManager.getActiveCrisis();
      expect(crisis).not.toBeNull();
      expect(crisis?.type).toBe(CrisisEventType.THE_CONTINGENCY);

      // Advance into active pulsing
      (crisis as any).isPulsing = true;
      (crisis as any).pulseRadius = 160;

      // Simulate 10 frames of EMP pulse and glitching
      for (let f = 0; f < 10; f++) {
        game.update(1 / 60);
      }

      // Skip stage mid-glitch
      expect(() => cheat.skipToStage(20)).not.toThrow();

      // Crisis must be cleanly terminated
      expect(game.crisisEventManager.getActiveCrisis()).toBeNull();
      expect(game.stage).toBe(20); // Stage 20 Boss
      expect(game.bossManager.activeBoss).not.toBeNull();

      assertNoNaNCoordinates(game);

      // Ticking 30 frames
      for (let t = 0; t < 30; t++) {
        expect(() => game.update(1 / 60)).not.toThrow();
      }
      assertNoNaNCoordinates(game);
    });

    it('skips cleanly while in the middle of The Unbidden gravitational rift distortion', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(18);

      // Activate The Unbidden
      cheat.triggerCrisis('unbidden');
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.THE_UNBIDDEN);

      // Fire player projectiles so they are actively curved by gravity
      game.bulletManager.firePlayerBullet(90, 200, false, 320);
      game.bulletManager.firePlayerBullet(134, 200, false, 320);

      // Update 10 frames to bend bullets
      for (let f = 0; f < 10; f++) {
        game.update(1 / 60);
      }

      // Skip stage mid-distortion
      expect(() => cheat.skipToStage(22)).not.toThrow();

      expect(game.crisisEventManager.getActiveCrisis()).toBeNull();
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.stage).toBe(22);

      assertNoNaNCoordinates(game);

      // Confirm continuous stable ticks
      for (let t = 0; t < 20; t++) {
        expect(() => game.update(1 / 60)).not.toThrow();
      }
      assertNoNaNCoordinates(game);
    });

    it('skips cleanly and resurrects player in the middle of Player destruction sequence', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(5);

      // Forcibly destroy player
      game.player.state = 'destroyed';
      game.player.deathTimer = 1.4;
      game.player.lives = 1;
      game.particleSystem.spawnPlayerExplosion(game.player.x, game.player.y);

      expect(game.player.state).toBe('destroyed');

      // Skip stage while exploding
      expect(() => cheat.skipToStage(8)).not.toThrow();

      expect(game.stage).toBe(8);
      expect(game.state).toBe('PLAYING');
      expect(game.player.state).toBe('normal');
      expect(game.player.deathTimer).toBe(0);
      expect(game.player.x).toBe(112);
      expect(game.player.y).toBe(Player.BASELINE_Y);
      expect(game.player.lives).toBeGreaterThanOrEqual(1);

      assertNoNaNCoordinates(game);

      // Update 20 frames
      for (let t = 0; t < 20; t++) {
        expect(() => game.update(1 / 60)).not.toThrow();
      }
      assertNoNaNCoordinates(game);
    });

    it('skips cleanly and revives gameplay from GAME_OVER state', () => {
      const cheat = game.getCheatController();

      // Trigger Game Over
      game.player.lives = 0;
      game.lives = 0;
      game.player.state = 'destroyed';
      game.setState('GAME_OVER');

      expect(game.state).toBe('GAME_OVER');

      // Skip to stage 25 from Game Over
      expect(() => cheat.skipToStage(25)).not.toThrow();

      expect(game.state).toBe('PLAYING');
      expect(game.stage).toBe(25);
      expect(game.player.state).toBe('normal');
      expect(game.player.lives).toBeGreaterThanOrEqual(1);
      expect(game.lives).toBeGreaterThanOrEqual(1);

      assertNoNaNCoordinates(game);

      for (let t = 0; t < 20; t++) {
        expect(() => game.update(1 / 60)).not.toThrow();
      }
      assertNoNaNCoordinates(game);
    });
  });

  // ==========================================================================
  // Dimension 3: Idempotency & Edge Invocation Verification
  // ==========================================================================
  describe('Dimension 3: Idempotency & Edge Invocation Verification', () => {
    it('calling setInvincible(true) repeatedly is strictly idempotent and does not corrupt state', () => {
      const cheat = game.getCheatController();

      // Call 50 times consecutively
      for (let i = 0; i < 50; i++) {
        cheat.setInvincible(true);
      }

      expect(game.player.isInvincibleCheat).toBe(true);
      expect(game.player.isInvulnerable()).toBe(true);

      // Simulate hits
      const hit = game.player.hitTestAndDamage({ x: 100, y: 250, width: 24, height: 24 });
      expect(hit).toBe(false);

      // Toggle off 50 times
      for (let i = 0; i < 50; i++) {
        cheat.setInvincible(false);
      }

      expect(game.player.isInvincibleCheat).toBe(false);

      // Rapidly alternate 100 times
      for (let i = 0; i < 100; i++) {
        cheat.setInvincible(i % 2 === 0);
      }
      expect(game.player.isInvincibleCheat).toBe(false); // 99 % 2 !== 0
    });

    it('calling fillEnergy() repeatedly with normal, extreme, and malformed values maintains [0, 100] bounds', () => {
      const cheat = game.getCheatController();

      // 1. Default fill 50 times
      for (let i = 0; i < 50; i++) {
        cheat.fillEnergy();
        expect(game.specialMovesManager.energy).toBe(100);
        expect(game.specialMovesManager.cooldownTimer).toBe(0);
      }

      // 2. Custom values
      cheat.fillEnergy(42);
      expect(game.specialMovesManager.energy).toBe(42);

      cheat.fillEnergy(0);
      expect(game.specialMovesManager.energy).toBe(0);

      // 3. Clamping underflow & overflow
      cheat.fillEnergy(-500);
      expect(game.specialMovesManager.energy).toBe(0);

      cheat.fillEnergy(99999);
      expect(game.specialMovesManager.energy).toBe(100);

      // 4. Boundary numbers: NaN and Infinity default safely to 100
      cheat.fillEnergy(NaN);
      expect(game.specialMovesManager.energy).toBe(100);

      cheat.fillEnergy(Infinity);
      expect(game.specialMovesManager.energy).toBe(100);

      cheat.fillEnergy(-Infinity);
      expect(game.specialMovesManager.energy).toBe(100);
    });

    it('calling killAllEnemies() repeatedly on an empty screen returns 0 and does not crash', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(1);

      // First kill destroys actual wave
      const firstKill = cheat.killAllEnemies();
      expect(firstKill).toBeGreaterThan(0);
      expect(game.formationManager.getLivingCount()).toBe(0);

      // Subsequent 50 calls on empty screen
      for (let i = 0; i < 50; i++) {
        const killed = cheat.killAllEnemies();
        expect(killed).toBe(0);
      }

      // Particle pool should not be flooded with empty explosions
      expect(game.formationManager.getLivingCount()).toBe(0);

      // Run 20 update frames on empty formation
      for (let t = 0; t < 20; t++) {
        expect(() => game.update(1 / 60)).not.toThrow();
      }
      assertNoNaNCoordinates(game);
    });

    it('calling skipToStage on the identical current stage is safe and re-initializes cleanly', () => {
      const cheat = game.getCheatController();

      for (let i = 0; i < 10; i++) {
        const ok = cheat.skipToStage(10); // Boss stage
        expect(ok).toBe(true);
        expect(game.stage).toBe(10);
        expect(game.bossManager.activeBoss).not.toBeNull();
      }

      assertNoNaNCoordinates(game);
    });
  });
});
