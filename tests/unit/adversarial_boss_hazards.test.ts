/**
 * Galaga Arcade Web Game — Milestone 12 Adversarial Boss Hazards & Projectile Systems Stress Suite
 * 
 * Empirical Adversarial Verification:
 * 1. Bullet pool capacity under extreme bullet hell saturation (Stage 50 Phase 3 dual 6-arm spiral).
 *    - Pool recycling, bounds clamping at 256, and zero crashes.
 * 2. Gravitational tear numerical stability in Stage 20 (Singularity test at r = 0).
 *    - Softened denominator epsilon = 18px prevents NaN or Infinity.
 * 3. Gray goo cloud bullet dissolution in Stage 30.
 *    - Bullets entering radius are reliably recycled and quotas restored.
 * 4. Telekinetic stun pulse player speed reduction in Stage 40.
 *    - Player horizontal speed clamped by 75% and restored after timer expires.
 * 5. Mega-beam collision in Stage 50.
 *    - Safe pocket on canvas flanks (x < 45px or safe flank) takes zero damage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { BULLET_CONFIG } from '../../src/entities/Bullet';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';
import { DimensionalLeviathan } from '../../src/core/boss/bosses/DimensionalLeviathan';
import { NaniteColossus } from '../../src/core/boss/bosses/NaniteColossus';
import { PsionicHarbinger } from '../../src/core/boss/bosses/PsionicHarbinger';

describe('Milestone 12: Adversarial Boss Hazards & Projectile Systems Stress Suite', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  // ==========================================================================
  // 1. Bullet Pool Capacity & Bullet Hell Saturation (Stage 50 Phase 3)
  // ==========================================================================
  describe('Area 1: Bullet Pool Capacity Under Extreme Bullet Hell Saturation', () => {
    it('survives extended Stage 50 Phase 3 dual 6-arm spiral barrage with pool bounded at 256 and zero crashes', () => {
      const aeternum = new AeternumCore(game);

      // Transition to Phase 3
      aeternum.update(2.5, 112, 250);
      for (const sat of aeternum.satellites) {
        sat.takeDamage(25);
      }
      aeternum.update(2.1, 112, 250);
      aeternum.takeDamage(200);
      aeternum.update(2.1, 112, 250);
      expect(aeternum.phase).toBe('PHASE_3');

      const pool = game.bulletManager.getPool();
      expect(pool.getMaxSize()).toBe(BULLET_CONFIG.POOL_MAX_SIZE);
      expect(BULLET_CONFIG.POOL_MAX_SIZE).toBe(256);

      // Simulate 1,200 frames at 60 FPS (20 seconds of continuous bullet hell)
      // Dual 6-arm cannons fire 12 bullets every 0.25s = 48 bullets/sec => ~960 bullets attempted
      for (let frame = 0; frame < 1200; frame++) {
        expect(() => {
          aeternum.update(1 / 60, 112, 250);
          game.bulletManager.update(1 / 60);
        }).not.toThrow();

        const activeEnemy = game.bulletManager.getEnemyBulletCount();
        const activePool = pool.getActiveCount();
        const capacity = pool.getCapacity();

        // Invariants:
        // 1. Bullet count never exceeds 256
        expect(activeEnemy).toBeLessThanOrEqual(256);
        expect(activeEnemy).toBeGreaterThanOrEqual(0);
        // 2. Pool capacity never exceeds 256
        expect(capacity).toBeLessThanOrEqual(256);
        // 3. Pool active count equals or bounds active bullets
        expect(activePool).toBeLessThanOrEqual(256);
      }

      // Verify all active bullets have strictly valid finite coordinates
      game.bulletManager.forEachActiveEnemyBullet((bullet) => {
        expect(Number.isFinite(bullet.position.x)).toBe(true);
        expect(Number.isFinite(bullet.position.y)).toBe(true);
        expect(Number.isFinite(bullet.velocity.x)).toBe(true);
        expect(Number.isFinite(bullet.velocity.y)).toBe(true);
        expect(Number.isNaN(bullet.position.x)).toBe(false);
        expect(Number.isNaN(bullet.position.y)).toBe(false);
      });
    });

    it('enforces hard capacity clamping when saturated at 256 bullets without throwing', () => {
      // Forcefully fill pool to 256
      while (game.bulletManager.getEnemyBulletCount() < 256) {
        const b = game.bulletManager.fireEnemyBulletWithVector(112, 50, 0, 100);
        expect(b).not.toBeNull();
      }

      expect(game.bulletManager.getEnemyBulletCount()).toBe(256);
      expect(game.bulletManager.getPool().getActiveCount()).toBe(256);

      // Attempting to spawn additional bullet must return null safely
      const overflowBullet = game.bulletManager.fireEnemyBulletWithVector(112, 50, 0, 100);
      expect(overflowBullet).toBeNull();
      expect(game.bulletManager.getEnemyBulletCount()).toBe(256);

      // Aeternum Phase 3 attempting to fire wave while pool is 100% saturated
      const aeternum = new AeternumCore(game);
      aeternum.update(2.5, 112, 250);
      for (const s of aeternum.satellites) s.takeDamage(25);
      aeternum.update(2.1, 112, 250);
      aeternum.takeDamage(200);
      aeternum.update(2.1, 112, 250);

      expect(() => {
        // Force fire trigger
        aeternum.update(0.3, 112, 250);
      }).not.toThrow();

      // Count remains strictly clamped at 256
      expect(game.bulletManager.getEnemyBulletCount()).toBe(256);
    });

    it('recycles out-of-bounds projectiles and recovers free capacity for new waves', () => {
      // Spawn 10 bullets moving downward fast
      for (let i = 0; i < 10; i++) {
        game.bulletManager.fireEnemyBulletWithVector(112, 280, 0, 300);
      }
      expect(game.bulletManager.getEnemyBulletCount()).toBe(10);

      // Update 0.1s -> bullets move to y = 310 (past BOUNDS_MARGIN = 8 -> max height 296)
      game.bulletManager.update(0.1);

      // All 10 bullets should be recycled
      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);

      // Clear cleans up any remaining active bullets
      game.bulletManager.clear();
      expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
    });
  });

  // ==========================================================================
  // 2. Gravitational Tear Numerical Stability (Stage 20 Singularity r = 0)
  // ==========================================================================
  describe('Area 2: Gravitational Tear Numerical Stability (Singularity r = 0 Test)', () => {
    it('guarantees numerical stability when a player missile is placed exactly at r = 0 (singularity)', () => {
      const leviathan = new DimensionalLeviathan(game);
      leviathan.update(2.5, 112, 250); // Enter Phase 1
      leviathan.update(3.6, 112, 250); // Shift to Void Shroud (tears activated)

      expect(leviathan.tears[0]!.active).toBe(true);
      const tear = leviathan.tears[0]!;
      const tearX = tear.x; // 60
      const tearY = tear.y; // 110

      // Deactivate second tear to isolate singularity physics of tear 0
      leviathan.tears[1]!.active = false;

      // Fire player missile placed EXACTLY at the singularity coordinates (r = 0)
      const bullet = game.bulletManager.firePlayerBullet(tearX, tearY, false, 480);
      expect(bullet).not.toBeNull();
      bullet!.position.x = tearX;
      bullet!.position.y = tearY;

      const initialVx = bullet!.velocity.x; // 0
      const initialVy = bullet!.velocity.y; // -480

      // Execute update tick
      expect(() => {
        leviathan.update(0.016667, 112, 250);
      }).not.toThrow();

      // Theoretical derivation:
      // dx = tear.x - bullet.x = 0, dy = tear.y - bullet.y = 0
      // distSq = 0, epsSq = 18 * 18 = 324
      // denom = (0 + 324)^1.5 = 18^3 = 5832
      // ax = (G * 0) / 5832 = 0, ay = (G * 0) / 5832 = 0
      // Therefore velocity remains strictly finite and unchanged!
      expect(Number.isFinite(bullet!.velocity.x)).toBe(true);
      expect(Number.isFinite(bullet!.velocity.y)).toBe(true);
      expect(Number.isNaN(bullet!.velocity.x)).toBe(false);
      expect(Number.isNaN(bullet!.velocity.y)).toBe(false);

      expect(bullet!.velocity.x).toBe(initialVx);
      expect(bullet!.velocity.y).toBe(initialVy);
    });

    it('confirms softened denominator epsilon = 18px prevents overflow across sub-pixel distances', () => {
      const leviathan = new DimensionalLeviathan(game);
      leviathan.update(2.5, 112, 250);
      leviathan.update(3.6, 112, 250); // Void Shroud
      const tear = leviathan.tears[0]!;
      // Deactivate second tear to measure single tear deflection profile
      leviathan.tears[1]!.active = false;

      // Adversarial test matrix with sub-pixel and boundary offsets
      const testOffsets = [
        1e-15,             // Below 64-bit float machine epsilon at x=60 (absorbs to 0)
        1e-9,              // Microscopic sub-pixel offset
        1e-6,
        0.0001,
        0.01,
        0.5,
        1.0,
        18.0 / Math.SQRT2, // Peak theoretical acceleration radius (~12.728px)
        18.0,              // Exactly at epsilon boundary
        50.0,
      ];

      for (const r of testOffsets) {
        game.bulletManager.clear();
        // Place bullet at offset r along x-axis from tear
        const b = game.bulletManager.firePlayerBullet(tear.x - r, tear.y, false, 480);
        expect(b).not.toBeNull();

        leviathan.update(0.016667, 112, 250);

        expect(Number.isFinite(b!.velocity.x)).toBe(true);
        expect(Number.isFinite(b!.velocity.y)).toBe(true);
        expect(Number.isNaN(b!.velocity.x)).toBe(false);
        expect(Number.isNaN(b!.velocity.y)).toBe(false);

        // Deflection accelerates towards tear (ax >= 0 since tear.x >= bullet.x)
        expect(b!.velocity.x).toBeGreaterThanOrEqual(0);
        if (r >= 1e-9) {
          expect(b!.velocity.x).toBeGreaterThan(0);
        }

        // Theoretical maximum acceleration bound:
        // a_max = G / (3 * sqrt(3) / 2 * eps^2) ~ G / (2.598 * 324) ~ 320000 / 841.77 ~ 380 px/s^2
        // per frame (dt = 0.016667), delta_vx <= 380 * 0.0167 ~ 6.35 px/s
        expect(b!.velocity.x).toBeLessThan(15.0);
      }
    });

    it('simultaneously tests both gravitational tears with dual bullets at both singularities', () => {
      const leviathan = new DimensionalLeviathan(game);
      leviathan.update(2.5, 112, 250);
      leviathan.update(3.6, 112, 250);

      const tear0 = leviathan.tears[0]!;
      const tear1 = leviathan.tears[1]!;

      const b0 = game.bulletManager.firePlayerBullet(tear0.x, tear0.y, true, 480, 0, -480, 4);
      const b1 = game.bulletManager.firePlayerBullet(tear1.x, tear1.y, true, 480, 0, -480, 4);

      expect(b0).not.toBeNull();
      expect(b1).not.toBeNull();

      expect(() => {
        leviathan.update(0.016667, 112, 250);
      }).not.toThrow();

      expect(Number.isFinite(b0!.velocity.x)).toBe(true);
      expect(Number.isFinite(b0!.velocity.y)).toBe(true);
      expect(Number.isFinite(b1!.velocity.x)).toBe(true);
      expect(Number.isFinite(b1!.velocity.y)).toBe(true);
      expect(Number.isNaN(b0!.velocity.x)).toBe(false);
      expect(Number.isNaN(b1!.velocity.x)).toBe(false);

      // Symmetrical cross-attraction: b0 is pulled to the right by tear1, b1 is pulled to the left by tear0
      expect(b0!.velocity.x).toBeGreaterThan(0);
      expect(b1!.velocity.x).toBeLessThan(0);
    });
  });

  // ==========================================================================
  // 3. Gray Goo Cloud Bullet Dissolution (Stage 30)
  // ==========================================================================
  describe('Area 3: Gray Goo Cloud Bullet Dissolution in Stage 30', () => {
    it('reliably dissolves and recycles player bullets entering gray goo cloud radius', () => {
      const colossus = new NaniteColossus(game);
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75);
      for (const c of colossus.miniConstructs) c.takeDamage(18);
      colossus.update(2.1, 112, 250); // Phase 2
      colossus.update(0.05, 112, 250);

      const cloud = colossus.clouds[0]!;
      expect(cloud.active).toBe(true);

      // Fire player missile into the interior of the cloud (dist = 10 < cloud.radius = 24)
      const bullet = game.bulletManager.firePlayerBullet(cloud.x, cloud.y + 10, false, 480);
      expect(bullet).not.toBeNull();
      expect(bullet!.active).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(1);

      // Colossus update detects bullet within cloud radius and recycles it
      colossus.update(0.016, 112, 250);

      expect(bullet!.active).toBe(false);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
    });

    it('differentiates boundary conditions: dissolves interior bullets while sparing exterior bullets', () => {
      const colossus = new NaniteColossus(game);
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75);
      for (const c of colossus.miniConstructs) c.takeDamage(18);
      colossus.update(2.1, 112, 250);
      colossus.update(0.05, 112, 250);

      const cloud = colossus.clouds[0]!;
      const R = cloud.radius; // 24

      // Bullet Inside: dist = R - 1 (23px)
      const insideBullet = game.bulletManager.firePlayerBullet(cloud.x + (R - 1), cloud.y, true, 480, 0, -480, 4);
      // Bullet Outside: dist = R + 2 (26px)
      const outsideBullet = game.bulletManager.firePlayerBullet(cloud.x + (R + 2), cloud.y, true, 480, 0, -480, 4);

      expect(insideBullet).not.toBeNull();
      expect(outsideBullet).not.toBeNull();
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);

      colossus.update(0.016, 112, 250);

      // Inside bullet must be dissolved and recycled
      expect(insideBullet!.active).toBe(false);
      // Outside bullet must remain active and unaffected
      expect(outsideBullet!.active).toBe(true);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(1);
    });

    it('restores player missile quota after dissolution without quota leaks', () => {
      const colossus = new NaniteColossus(game);
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75);
      for (const c of colossus.miniConstructs) c.takeDamage(18);
      colossus.update(2.1, 112, 250);
      colossus.update(0.05, 112, 250);

      const cloud = colossus.clouds[0]!;

      // Single fighter max quota = 2
      const b1 = game.bulletManager.firePlayerBullet(cloud.x, cloud.y, false, 480);
      const b2 = game.bulletManager.firePlayerBullet(cloud.x + 2, cloud.y, false, 480);
      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();

      // Quota is now full (2/2)
      expect(game.bulletManager.canPlayerFire(false)).toBe(false);
      expect(game.bulletManager.firePlayerBullet(112, 250, false, 480)).toBeNull();

      // Update dissolves both
      colossus.update(0.016, 112, 250);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);

      // Player can immediately fire 2 fresh missiles again
      expect(game.bulletManager.canPlayerFire(false)).toBe(true);
      const b3 = game.bulletManager.firePlayerBullet(112, 250, false, 480);
      const b4 = game.bulletManager.firePlayerBullet(112, 250, false, 480);
      expect(b3).not.toBeNull();
      expect(b4).not.toBeNull();
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);
    });
  });

  // ==========================================================================
  // 4. Telekinetic Stun Pulse Player Speed Reduction (Stage 40)
  // ==========================================================================
  describe('Area 4: Telekinetic Stun Pulse Player Speed Reduction in Stage 40', () => {
    it('clamps player horizontal speed by 75% when stunned and restores full speed after 1.25s expiration', () => {
      game.startGame();
      game.setState('PLAYING');

      // Fast forward Stage 40 to Phase 2
      const harbinger = new PsionicHarbinger(game);
      harbinger.update(2.5, 112, 250);
      harbinger.takeDamage(90);
      harbinger.update(1.9, 112, 250); // Enter Phase 2

      // 1. Measure normal baseline player movement
      game.player.x = 100;
      (game.inputHandler.getState() as { moveRight: boolean }).moveRight = true;
      (game.inputHandler.getState() as { moveLeft: boolean }).moveLeft = false;

      const baselineStartX = game.player.x;
      game.update(1 / 60);
      const normalDelta = game.player.x - baselineStartX;
      // Normal speed: 260 px/s * (1/60s) = 4.3333 px
      expect(normalDelta).toBeCloseTo(4.3333, 2);

      // 2. Trigger Telekinetic Stun Pulse
      game.bossManager.playerStunTimer = 1.25;
      expect(game.bossManager.playerStunTimer).toBe(1.25);

      // Measure stunned player movement
      const stunnedStartX = game.player.x;
      game.update(1 / 60);
      const stunnedDelta = game.player.x - stunnedStartX;

      // In Game.ts: this.player.x = prevPlayerX + (this.player.x - prevPlayerX) * 0.25
      // Clamped speed: 4.3333 * 0.25 = 1.0833 px (exact 75% speed reduction)
      expect(stunnedDelta).toBeCloseTo(normalDelta * 0.25, 2);
      expect(stunnedDelta).toBeLessThan(1.5);

      // 3. Advance through stun duration (1.25s) until timer expires
      // 1.25s @ 60 FPS = 75 frames. Advance 80 frames.
      // Turn off move inputs during wait so player stays centered
      (game.inputHandler.getState() as { moveRight: boolean }).moveRight = false;
      for (let i = 0; i < 80; i++) {
        game.update(1 / 60);
      }

      // Timer must be expired and clamped to 0
      expect(game.bossManager.playerStunTimer).toBe(0);

      // 4. Measure restored player movement from center (x = 100)
      game.player.x = 100;
      (game.inputHandler.getState() as { moveRight: boolean }).moveRight = true;
      const restoredStartX = game.player.x;
      game.update(1 / 60);
      const restoredDelta = game.player.x - restoredStartX;

      // Full 100% normal speed restored
      expect(restoredDelta).toBeCloseTo(normalDelta, 2);
    });

    it('enforces boundary clamping [12, 212] while stunned without jitter or overflow', () => {
      game.startGame();
      game.setState('PLAYING');

      // Place player near right boundary (single fighter max = 212)
      game.player.x = 211;
      game.bossManager.playerStunTimer = 1.0;
      (game.inputHandler.getState() as { moveRight: boolean }).moveRight = true;
      (game.inputHandler.getState() as { moveLeft: boolean }).moveLeft = false;

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60);
        expect(game.player.x).toBeLessThanOrEqual(212);
        expect(game.player.x).toBeGreaterThanOrEqual(12);
      }
      expect(game.player.x).toBeCloseTo(212, 1);

      // Move left to min boundary (single fighter min = 12)
      (game.inputHandler.getState() as { moveRight: boolean }).moveRight = false;
      (game.inputHandler.getState() as { moveLeft: boolean }).moveLeft = true;

      for (let i = 0; i < 300; i++) {
        game.update(1 / 60);
        expect(game.player.x).toBeLessThanOrEqual(212);
        expect(game.player.x).toBeGreaterThanOrEqual(12);
      }
      expect(game.player.x).toBe(12);
    });

    it('refreshes stun timer cleanly upon successive stun wave impacts', () => {
      game.bossManager.playerStunTimer = 0.4;
      // Re-stun
      game.bossManager.playerStunTimer = 1.25;
      expect(game.bossManager.playerStunTimer).toBe(1.25);

      // Decrements cleanly per frame
      game.bossManager.update(0.25, 112, 250);
      expect(game.bossManager.playerStunTimer).toBeCloseTo(1.0, 3);
    });
  });

  // ==========================================================================
  // 5. Mega-Beam Collision & Flank Safe Pocket (Stage 50)
  // ==========================================================================
  describe('Area 5: Mega-Beam Collision and Flank Safe Pockets in Stage 50', () => {
    it('verifies safe pocket on canvas flanks (x < 45px and x > 179px) takes zero damage when beam is centered', () => {
      const aeternum = new AeternumCore(game);
      aeternum.update(2.5, 112, 250);
      for (const s of aeternum.satellites) s.takeDamage(25);
      aeternum.update(2.1, 112, 250); // Enter Phase 2

      // Force beam into active firing state centered at canvas center (112)
      aeternum.megaBeam.active = true;
      aeternum.megaBeam.firing = true;
      aeternum.megaBeam.fireTimer = 2.0;
      aeternum.megaBeam.centerX = 112;
      aeternum.megaBeam.width = 134; // 60% of 224px
      aeternum.megaBeam.sweepSpeed = 0; // lock center for boundary analysis

      // Beam column: [112 - 67, 112 + 67] = [45px, 179px]
      // Left Safe Flank: x < 45px
      // Right Safe Flank: x > 179px

      const initialLives = game.player.lives;

      // 1. Test Left Flank Safe Pocket (x = 30px)
      game.player.x = 30;
      game.player.y = 250;
      aeternum.update(0.016, game.player.x, game.player.y);
      expect(game.player.lives).toBe(initialLives);

      // 2. Test Right Flank Safe Pocket (x = 195px)
      game.player.x = 195;
      game.player.y = 250;
      aeternum.update(0.016, game.player.x, game.player.y);
      expect(game.player.lives).toBe(initialLives);

      // 3. Test Inside Beam Column (x = 112px) -> Must take damage
      game.player.x = 112;
      game.player.y = 250;
      aeternum.update(0.016, game.player.x, game.player.y);
      expect(game.player.lives).toBeLessThan(initialLives);
    });

    it('verifies exact pixel boundary precision of mega-beam hazard edges', () => {
      const aeternum = new AeternumCore(game);
      aeternum.update(2.5, 112, 250);
      for (const s of aeternum.satellites) s.takeDamage(25);
      aeternum.update(2.1, 112, 250); // Phase 2

      aeternum.megaBeam.active = true;
      aeternum.megaBeam.firing = true;
      aeternum.megaBeam.fireTimer = 2.0;
      aeternum.megaBeam.centerX = 112;
      aeternum.megaBeam.width = 134;
      aeternum.megaBeam.sweepSpeed = 0;

      // Beam boundaries: left = 45, right = 179
      // A. Just outside left beam edge (x = 44px) -> Safe!
      game.player.x = 44;
      game.player.y = 250;
      const livesBeforeSafe = game.player.lives;
      aeternum.update(0.016, game.player.x, game.player.y);
      expect(game.player.lives).toBe(livesBeforeSafe);

      // B. Just outside right beam edge (x = 180px) -> Safe!
      game.player.x = 180;
      game.player.y = 250;
      aeternum.update(0.016, game.player.x, game.player.y);
      expect(game.player.lives).toBe(livesBeforeSafe);
    });

    it('guarantees an evasive safe pocket always exists during lateral beam sweeps', () => {
      const aeternum = new AeternumCore(game);
      aeternum.update(2.5, 112, 250);
      for (const s of aeternum.satellites) s.takeDamage(25);
      aeternum.update(2.1, 112, 250);

      aeternum.megaBeam.active = true;
      aeternum.megaBeam.firing = true;
      aeternum.megaBeam.width = 134;

      // Case 1: Beam swept to maximum right limit (centerX = 157)
      // left = 157 - 67 = 90. Safe pocket is x in [8, 89] (> 40% of screen)
      aeternum.megaBeam.centerX = 157;
      game.player.x = 40; // in left pocket
      game.player.y = 250;
      const lives1 = game.player.lives;
      aeternum.update(0.016, game.player.x, game.player.y);
      expect(game.player.lives).toBe(lives1);

      // Case 2: Beam swept to maximum left limit (centerX = 67)
      // right = 67 + 67 = 134. Safe pocket is x in [135, 216] (> 40% of screen)
      aeternum.megaBeam.centerX = 67;
      game.player.x = 180; // in right pocket
      game.player.y = 250;
      const lives2 = game.player.lives;
      aeternum.update(0.016, game.player.x, game.player.y);
      expect(game.player.lives).toBe(lives2);
    });
  });
});
