/**
 * Milestone 3 Adversarial Challenge Test Suite
 * 
 * Focus: Bullet Quota, Rapid-Fire Point-Blank Spamming, State Transitions & Projectile Kinematics
 * 
 * Test Scenarios:
 * 1. Rapid-fire point-blank spamming (firing when missiles hit and recycle in 0/1 frames, 1000+ iterations).
 * 2. Bullet quota clamping during single -> dual and dual -> single transitions.
 * 3. Enemy bullet directional aiming at extreme angles, zero distance, microscopic offsets, and off-screen bounds.
 * 4. Swept Continuous Collision Detection (CCD) box calculations across all velocity vectors.
 * 5. Pool invariant preservation under stress and double-release attempts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bullet, BulletManager } from '../../src/entities/Bullet';
import { Player, type BulletSpawnRequest } from '../../src/entities/Player';
import type { Rect } from '../../src/types';

describe('M3 Adversarial Challenge: Bullet Quota & Projectile Kinematics', () => {
  // ==========================================================================
  // 1. Rapid-Fire Point-Blank Spamming
  // ==========================================================================
  describe('1. Rapid-Fire Point-Blank Spamming & Immediate Recycling', () => {
    let bulletManager: BulletManager;
    let player: Player;

    beforeEach(() => {
      bulletManager = new BulletManager();
      player = new Player({ x: 112, y: 250, lives: 3 });

      player.onFire = (spawns: BulletSpawnRequest[]) => {
        for (const s of spawns) {
          bulletManager.firePlayerBullet(s.x, s.y, player.isDual, Math.abs(s.vy));
        }
        player.activeMissileCount = bulletManager.getPlayerBulletCount();
      };
    });

    it('survives 1,000 rapid-fire point-blank shots with 0-frame recycling without quota drift', () => {
      let totalFired = 0;
      let totalRecycled = 0;

      for (let i = 0; i < 1000; i++) {
        // Fast-forward cooldown (120ms)
        player.update(0.12);

        // Player fires
        const fired = player.attemptFire();
        expect(fired).toBe(true);
        totalFired++;

        expect(bulletManager.getPlayerBulletCount()).toBe(1);
        expect(player.activeMissileCount).toBe(1);

        // Simulate point-blank target collision in the exact same frame:
        // Find active bullet and recycle it immediately
        let hitBullet: Bullet | null = null;
        bulletManager.forEachActivePlayerBullet((b) => {
          hitBullet = b;
        });

        expect(hitBullet).not.toBeNull();
        if (hitBullet) {
          bulletManager.recycle(hitBullet);
          totalRecycled++;
          player.activeMissileCount = bulletManager.getPlayerBulletCount();
        }

        // Active counts must return to exactly 0
        expect(bulletManager.getPlayerBulletCount()).toBe(0);
        expect(player.activeMissileCount).toBe(0);
      }

      expect(totalFired).toBe(1000);
      expect(totalRecycled).toBe(1000);

      // Verify ObjectPool invariants
      const pool = bulletManager.getPool();
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount() + pool.getActiveCount()).toBe(pool.getCapacity());
    });

    it('handles dual fighter point-blank rapid spamming with asymmetrical collisions', () => {
      player.isDual = true;

      for (let i = 0; i < 500; i++) {
        player.update(0.12);

        const fired = player.attemptFire();
        expect(fired).toBe(true);
        expect(bulletManager.getPlayerBulletCount()).toBe(2);
        expect(player.activeMissileCount).toBe(2);

        // Only Left missile hits point blank, Right missile misses and flies away
        let leftBullet: Bullet | null = null;
        let rightBullet: Bullet | null = null;

        bulletManager.forEachActivePlayerBullet((b) => {
          if (b.position.x < player.x) {
            leftBullet = b;
          } else {
            rightBullet = b;
          }
        });

        expect(leftBullet).not.toBeNull();
        expect(rightBullet).not.toBeNull();

        // Recycle left bullet immediately
        if (leftBullet) {
          bulletManager.recycle(leftBullet);
          player.activeMissileCount = bulletManager.getPlayerBulletCount();
        }

        expect(bulletManager.getPlayerBulletCount()).toBe(1);
        expect(player.activeMissileCount).toBe(1);

        // Player tries to fire again in dual mode:
        // active = 1, dual max = 4. Dual requires capacity for 2 bullets (active <= 2).
        // Since active = 1 <= 2, player can fire!
        player.update(0.12);
        const firedSecond = player.attemptFire();
        expect(firedSecond).toBe(true);

        // Now total active bullets = 1 + 2 = 3
        expect(bulletManager.getPlayerBulletCount()).toBe(3);
        expect(player.activeMissileCount).toBe(3);

        // Player tries to fire third time in dual mode:
        // active = 3 > 2 -> must be blocked!
        player.update(0.12);
        const firedThird = player.attemptFire();
        expect(firedThird).toBe(false);

        // Clear all remaining active bullets to reset for next loop
        bulletManager.clear();
        player.activeMissileCount = 0;
      }
    });

    it('safely rejects defensive double-release / double-recycle without underflowing counts', () => {
      const b1 = bulletManager.firePlayerBullet(100, 200, false);
      expect(b1).not.toBeNull();
      expect(bulletManager.getPlayerBulletCount()).toBe(1);

      if (b1) {
        // First recycle: Success
        const res1 = bulletManager.recycle(b1);
        expect(res1).toBe(true);
        expect(bulletManager.getPlayerBulletCount()).toBe(0);

        // Second recycle: Rejected safely
        const res2 = bulletManager.recycle(b1);
        expect(res2).toBe(false);
        expect(bulletManager.getPlayerBulletCount()).toBe(0); // Clamped at 0, NOT -1

        // Third recycle: Rejected safely
        const res3 = bulletManager.recycle(b1);
        expect(res3).toBe(false);
        expect(bulletManager.getPlayerBulletCount()).toBe(0);
      }
    });

    it('prevents firing when cooldown has 0.0001s remaining and permits upon exact zero', () => {
      player.attemptFire();
      expect(player.fireCooldownTimer).toBe(Player.FIRE_COOLDOWN); // 0.12s

      // Update 0.1199s (almost elapsed)
      player.update(0.1199);
      expect(player.fireCooldownTimer).toBeGreaterThan(0);
      expect(player.attemptFire()).toBe(false);

      // Update remaining 0.0002s (fully elapsed)
      player.update(0.0002);
      expect(player.fireCooldownTimer).toBe(0);

      // Recycle the previous missile to free quota
      bulletManager.clear();
      player.activeMissileCount = 0;

      expect(player.attemptFire()).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Single <-> Dual Transition Quota Clamping
  // ==========================================================================
  describe('2. Single <-> Dual Transition Quota Clamping', () => {
    let bulletManager: BulletManager;
    let player: Player;

    beforeEach(() => {
      bulletManager = new BulletManager();
      player = new Player({ x: 112, y: 250, lives: 3 });

      player.onFire = (spawns: BulletSpawnRequest[]) => {
        for (const s of spawns) {
          bulletManager.firePlayerBullet(s.x, s.y, player.isDual, Math.abs(s.vy));
        }
        player.activeMissileCount = bulletManager.getPlayerBulletCount();
      };
    });

    it('allows expanding from single quota (2) to dual quota (4) upon docking', () => {
      // Step 1: Single fighter fires 2 bullets (quota saturated)
      expect(player.attemptFire()).toBe(true);
      player.update(0.12);
      expect(player.attemptFire()).toBe(true);
      expect(bulletManager.getPlayerBulletCount()).toBe(2);
      expect(player.activeMissileCount).toBe(2);

      // Attempt 3rd single shot: Blocked
      player.update(0.12);
      expect(player.attemptFire()).toBe(false);

      // Step 2: Rescued fighter docks, transitioning state to 'dual'
      player.state = 'dual';
      expect(player.isDual).toBe(true);

      // Dual quota is 4, current active is 2. Dual firing needs room for 2 bullets.
      // 2 <= 4 - 2 is true, so player can fire twin bullets!
      expect(player.attemptFire()).toBe(true);
      expect(bulletManager.getPlayerBulletCount()).toBe(4);
      expect(player.activeMissileCount).toBe(4);

      // Step 3: Dual quota is now 4 (fully saturated). Next shot blocked.
      player.update(0.12);
      expect(player.attemptFire()).toBe(false);
    });

    it('strictly clamps quota when transitioning from Dual (4 bullets) to Single via partial destruction', () => {
      // Step 1: Dual fighter fires 4 bullets
      player.isDual = true;
      expect(player.attemptFire()).toBe(true);
      player.update(0.12);
      expect(player.attemptFire()).toBe(true);
      expect(bulletManager.getPlayerBulletCount()).toBe(4);
      expect(player.activeMissileCount).toBe(4);

      // Step 2: Left hull destroyed in collision -> transitions to 'normal' (Single)
      const leftThreat: Rect = { x: player.x - 14, y: player.y - 4, width: 4, height: 6 };
      const damaged = player.hitTestAndDamage(leftThreat);
      expect(damaged).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);

      // 4 missiles are still flying on screen!
      expect(bulletManager.getPlayerBulletCount()).toBe(4);
      expect(player.activeMissileCount).toBe(4);

      // Single fighter max quota is 2. Active is 4. Player CANNOT fire.
      player.update(0.12);
      expect(player.attemptFire()).toBe(false);

      // Recycle 1 bullet: active = 3. Still exceeds single quota (2).
      const bullets: Bullet[] = [];
      bulletManager.forEachActivePlayerBullet((b) => bullets.push(b));
      expect(bullets.length).toBe(4);

      const b0 = bullets[0];
      if (b0) bulletManager.recycle(b0);
      player.activeMissileCount = bulletManager.getPlayerBulletCount();
      expect(player.activeMissileCount).toBe(3);

      player.update(0.12);
      expect(player.attemptFire()).toBe(false);

      // Recycle 2nd bullet: active = 2. Equals single quota (2). Still cannot fire.
      const b1 = bullets[1];
      if (b1) bulletManager.recycle(b1);
      player.activeMissileCount = bulletManager.getPlayerBulletCount();
      expect(player.activeMissileCount).toBe(2);

      player.update(0.12);
      expect(player.attemptFire()).toBe(false);

      // Recycle 3rd bullet: active = 1. Below single quota (2). Now CAN fire!
      const b2 = bullets[2];
      if (b2) bulletManager.recycle(b2);
      player.activeMissileCount = bulletManager.getPlayerBulletCount();
      expect(player.activeMissileCount).toBe(1);

      player.update(0.12);
      expect(player.attemptFire()).toBe(true);
      expect(bulletManager.getPlayerBulletCount()).toBe(2);
      expect(player.activeMissileCount).toBe(2);
    });

    it('prohibits weapon firing in non-controllable states (capturing, captured, destroyed) during update', () => {
      const fireSpy = vi.fn((spawns: BulletSpawnRequest[]) => {
        for (const s of spawns) {
          bulletManager.firePlayerBullet(s.x, s.y, player.isDual, Math.abs(s.vy));
        }
        player.activeMissileCount = bulletManager.getPlayerBulletCount();
      });
      player.onFire = fireSpy;
      const fireInput = {
        moveLeft: false,
        moveRight: false,
        fire: true,
        pause: false,
        restart: false,
        pointerX: null,
        pointerActive: false,
        touchLeft: false,
        touchRight: false,
        touchFire: false,
      };

      // Capturing state: update ignores fire input
      player.state = 'capturing';
      player.update(0.1, fireInput);
      expect(fireSpy).not.toHaveBeenCalled();

      // Captured state: update ignores fire input
      player.state = 'captured';
      player.update(0.1, fireInput);
      expect(fireSpy).not.toHaveBeenCalled();

      // Destroyed state: update ignores fire input
      player.state = 'destroyed';
      player.update(0.1, fireInput);
      expect(fireSpy).not.toHaveBeenCalled();

      // Respawning state: player CAN steer and fire while blinking invulnerable
      player.respawn();
      expect(player.state).toBe('respawning');
      player.update(0.1, fireInput);
      expect(fireSpy).toHaveBeenCalledTimes(1);
      expect(bulletManager.getPlayerBulletCount()).toBe(1);
    });
  });

  // ==========================================================================
  // 3. Enemy Bullet Directional Aiming & Kinematics at Extreme Angles
  // ==========================================================================
  describe('3. Enemy Bullet Directional Aiming & Kinematics', () => {
    let bulletManager: BulletManager;

    beforeEach(() => {
      bulletManager = new BulletManager();
    });

    it('handles zero-distance aiming (target == origin) without NaN or Infinity', () => {
      const bullet = bulletManager.fireEnemyBullet(112, 100, 112, 100, 200);
      expect(bullet).not.toBeNull();
      if (!bullet) return;

      expect(Number.isNaN(bullet.velocity.x)).toBe(false);
      expect(Number.isNaN(bullet.velocity.y)).toBe(false);
      expect(Number.isFinite(bullet.velocity.x)).toBe(true);
      expect(Number.isFinite(bullet.velocity.y)).toBe(true);

      // Defaults to downward trajectory when dist <= 0.001
      expect(bullet.velocity.x).toBe(0);
      expect(bullet.velocity.y).toBe(200);
      expect(bullet.angle).toBeCloseTo(Math.PI / 2, 4);
    });

    it('handles microscopic sub-pixel distance (dx = 1e-10, dy = 1e-10) without division-by-zero', () => {
      const bullet = bulletManager.fireEnemyBullet(100, 100, 100 + 1e-10, 100 + 1e-10, 220);
      expect(bullet).not.toBeNull();
      if (!bullet) return;

      expect(Number.isNaN(bullet.velocity.x)).toBe(false);
      expect(Number.isNaN(bullet.velocity.y)).toBe(false);
      expect(bullet.velocity.x).toBe(0);
      expect(bullet.velocity.y).toBe(220);
    });

    it('computes accurate unit vectors and angles for all 8 cardinal and diagonal directions', () => {
      const speed = 200;
      const testCases = [
        { name: 'Right (0 deg)', tx: 200, ty: 100, expVx: 200, expVy: 0, expAngle: 0 },
        { name: 'Down-Right (45 deg)', tx: 200, ty: 200, expVx: 200 * Math.SQRT1_2, expVy: 200 * Math.SQRT1_2, expAngle: Math.PI / 4 },
        { name: 'Down (90 deg)', tx: 100, ty: 200, expVx: 0, expVy: 200, expAngle: Math.PI / 2 },
        { name: 'Down-Left (135 deg)', tx: 0, ty: 200, expVx: -200 * Math.SQRT1_2, expVy: 200 * Math.SQRT1_2, expAngle: (3 * Math.PI) / 4 },
        { name: 'Left (180 deg)', tx: 0, ty: 100, expVx: -200, expVy: 0, expAngle: Math.PI },
        { name: 'Up-Left (225 deg)', tx: 0, ty: 0, expVx: -200 * Math.SQRT1_2, expVy: -200 * Math.SQRT1_2, expAngle: (-3 * Math.PI) / 4 },
        { name: 'Up (270 deg)', tx: 100, ty: 0, expVx: 0, expVy: -200, expAngle: -Math.PI / 2 },
        { name: 'Up-Right (315 deg)', tx: 200, ty: 0, expVx: 200 * Math.SQRT1_2, expVy: -200 * Math.SQRT1_2, expAngle: -Math.PI / 4 },
      ];

      for (const tc of testCases) {
        const bullet = bulletManager.fireEnemyBullet(100, 100, tc.tx, tc.ty, speed);
        expect(bullet).not.toBeNull();
        if (!bullet) continue;

        expect(bullet.velocity.x).toBeCloseTo(tc.expVx, 2);
        expect(bullet.velocity.y).toBeCloseTo(tc.expVy, 2);
        expect(bullet.angle).toBeCloseTo(tc.expAngle, 2);

        // Vector magnitude must equal speed exactly
        const mag = Math.sqrt(bullet.velocity.x ** 2 + bullet.velocity.y ** 2);
        expect(mag).toBeCloseTo(speed, 2);
      }
    });

    it('handles extreme steep angles (almost vertical / almost horizontal)', () => {
      // Steep vertical (dx = 1, dy = 10000)
      const steepVert = bulletManager.fireEnemyBullet(100, 100, 101, 10100, 240);
      expect(steepVert).not.toBeNull();
      if (steepVert) {
        expect(steepVert.velocity.x).toBeCloseTo(0.024, 2);
        expect(steepVert.velocity.y).toBeCloseTo(240, 2);
      }

      // Steep horizontal (dx = 10000, dy = 1)
      const steepHoriz = bulletManager.fireEnemyBullet(100, 100, 10100, 101, 240);
      expect(steepHoriz).not.toBeNull();
      if (steepHoriz) {
        expect(steepHoriz.velocity.x).toBeCloseTo(240, 2);
        expect(steepHoriz.velocity.y).toBeCloseTo(0.024, 2);
      }
    });

    it('handles astronomical off-screen coordinates safely', () => {
      const farBullet = bulletManager.fireEnemyBullet(
        -1_000_000,
        -1_000_000,
        1_000_000,
        1_000_000,
        180
      );
      expect(farBullet).not.toBeNull();
      if (farBullet) {
        expect(farBullet.velocity.x).toBeCloseTo(180 * Math.SQRT1_2, 2);
        expect(farBullet.velocity.y).toBeCloseTo(180 * Math.SQRT1_2, 2);
      }
    });
  });

  // ==========================================================================
  // 4. Swept CCD Hitbox & Continuous Collision Invariants
  // ==========================================================================
  describe('4. Swept Continuous Collision Detection (CCD)', () => {
    it('generates accurate swept AABBs for high-speed upward player missiles', () => {
      const bullet = new Bullet(1);
      bullet.init(100, 250, 0, -480, 'PLAYER');

      // Update 1 frame at 60 FPS (dt = 1/60s -> -8px)
      bullet.update(1 / 60);
      expect(bullet.prevPosition.y).toBe(250);
      expect(bullet.position.y).toBe(242);

      const swept = bullet.getSweptHitbox();
      // Missile width = 2, height = 6. HalfW = 1, HalfH = 3.
      // X: [100 - 1, 100 + 1] -> x: 99, width: 2
      // Y: [min(250, 242) - 3, max(250, 242) + 3] = [239, 253] -> y: 239, height: 14
      expect(swept.x).toBe(99);
      expect(swept.width).toBe(2);
      expect(swept.y).toBe(239);
      expect(swept.height).toBe(14);
    });

    it('generates accurate swept AABBs for diagonal fast enemy bullets', () => {
      const bullet = new Bullet(2);
      bullet.init(50, 50, 120, 160, 'ENEMY');

      // Update 0.05s (vx*dt = +6px, vy*dt = +8px)
      bullet.update(0.05);
      expect(bullet.position.x).toBe(56);
      expect(bullet.position.y).toBe(58);

      const swept = bullet.getSweptHitbox();
      // Enemy width = 2, height = 4. HalfW = 1, HalfH = 2.
      // X: [50 - 1, 56 + 1] = [49, 57] -> x: 49, width: 8
      // Y: [50 - 2, 58 + 2] = [48, 60] -> y: 48, height: 12
      expect(swept.x).toBe(49);
      expect(swept.width).toBe(8);
      expect(swept.y).toBe(48);
      expect(swept.height).toBe(12);
    });

    it('generates identical static and swept boxes when velocity is zero', () => {
      const bullet = new Bullet(3);
      bullet.init(100, 100, 0, 0, 'PLAYER');
      bullet.update(1 / 60);

      const staticBox = bullet.getHitbox();
      const sweptBox = bullet.getSweptHitbox();

      expect(sweptBox).toEqual(staticBox);
    });
  });

  // ==========================================================================
  // 5. 4-Quadrant Boundary Traversal & Out-of-Bounds Recycling
  // ==========================================================================
  describe('5. 4-Quadrant Boundary Traversal & Out-of-Bounds Recycling', () => {
    let bulletManager: BulletManager;

    beforeEach(() => {
      bulletManager = new BulletManager();
    });

    it('recycles projectiles escaping through Top, Bottom, Left, and Right edges', () => {
      // 1. Top escape (Player missile)
      const topB = bulletManager.firePlayerBullet(100, 0, false);
      expect(topB).not.toBeNull();
      bulletManager.update(0.05); // y = 0 - 24 = -24 < -8
      expect(bulletManager.getPlayerBulletCount()).toBe(0);
      expect(topB?.active).toBe(false);

      // 2. Bottom escape (Enemy bullet)
      const bottomB = bulletManager.fireEnemyBullet(100, 280, 100, 300, 200);
      expect(bottomB).not.toBeNull();
      bulletManager.update(0.1); // y = 280 + 20 = 300 > 288 + 8 (296)
      expect(bulletManager.getEnemyBulletCount()).toBe(0);
      expect(bottomB?.active).toBe(false);

      // 3. Left escape (Enemy bullet)
      const leftB = bulletManager.fireEnemyBullet(0, 100, -100, 100, 200);
      expect(leftB).not.toBeNull();
      bulletManager.update(0.1); // x = 0 - 20 = -20 < -8
      expect(bulletManager.getEnemyBulletCount()).toBe(0);
      expect(leftB?.active).toBe(false);

      // 4. Right escape (Enemy bullet)
      const rightB = bulletManager.fireEnemyBullet(220, 100, 300, 100, 200);
      expect(rightB).not.toBeNull();
      bulletManager.update(0.1); // x = 220 + 20 = 240 > 224 + 8 (232)
      expect(bulletManager.getEnemyBulletCount()).toBe(0);
      expect(rightB?.active).toBe(false);
    });

    it('clears all active projectiles cleanly and resets counters upon game reset', () => {
      bulletManager.firePlayerBullet(50, 100, true);
      bulletManager.firePlayerBullet(70, 100, true);
      bulletManager.fireEnemyBullet(100, 50, 100, 250, 200);
      bulletManager.fireEnemyBullet(120, 50, 120, 250, 200);

      expect(bulletManager.getPlayerBulletCount()).toBe(2);
      expect(bulletManager.getEnemyBulletCount()).toBe(2);
      expect(bulletManager.getPool().getActiveCount()).toBe(4);

      bulletManager.clear();

      expect(bulletManager.getPlayerBulletCount()).toBe(0);
      expect(bulletManager.getEnemyBulletCount()).toBe(0);
      expect(bulletManager.getPool().getActiveCount()).toBe(0);
    });
  });
});
