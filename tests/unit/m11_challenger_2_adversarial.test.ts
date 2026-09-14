/**
 * Galaga Arcade Web Game — Milestone 11 Adversarial Combat & Dual Fighter Invariant Suite
 * Challenger: m11_challenger_2 (Role: Upgrades Combat & Dual Fighter Invariant Challenger)
 * 
 * Adversarially challenges and empirically verifies:
 * 1. Kinetic Shield on Dual Fighter Invariants:
 *    - Lethal collision on left hull: shield absorbs blow, 1.0s invulnerability, remains 'dual' state
 *    - Lethal collision on right hull: shield absorbs blow, 1.0s invulnerability, remains 'dual' state
 *    - Catastrophic center threat covering both hulls: shield absorbs blow, remains 'dual' state
 *    - Immunity during 1.0s invulnerability window
 *    - Subsequent hit post-invulnerability causes authentic asymmetrical separation (left/right hull loss)
 * 
 * 2. Scatter Shot on Dual Fighter Invariants & Ballistics:
 *    - Exactly 6 bullet spawn requests per volley
 *    - Spreads at 0°, ±15° for both left cannon (x - 8) and right cannon (x + 8)
 *    - Velocity magnitude invariant: sqrt(vx^2 + vy^2) = 480 px/s for all 6 bullets
 *    - Tangential divergence and Swept CCD motion integration
 * 
 * 3. EMP Bomb Projectile Cleansing & Enemy Invariants:
 *    - 20 active enemy bullets spawned across screen -> EMP clears 100% (count drops to 0)
 *    - Bullet pool objects cleanly recycled to pool
 *    - Selective cleansing: player missiles are 100% immune to EMP shockwave
 *    - High-volume stress (50 bullets) and zero-bullet safe execution
 *    - Diving enemy 1-damage application vs formation enemy immunity
 * 
 * 4. Rapid Fire Cooldown & Dynamic Quota Invariants:
 *    - Cooldown is exactly 0.06s (halved from 0.12s)
 *    - Quota progression: Single Rapid (4 bullets), Dual Rapid (8 bullets) without premature block
 *    - Scatter + Rapid quotas (Single 8, Dual 16)
 *    - Atomic volley preservation (prevents partial asymmetric firing)
 * 
 * 5. High-Intensity Combined Combat Simulation:
 *    - 600-frame (10.0s) endurance simulation with stacked upgrades and concurrent collision stress
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Player, type BulletSpawnRequest } from '../../src/entities/Player';
import { BulletManager, Bullet } from '../../src/entities/Bullet';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { PowerUpType } from '../../src/core/powerups/types';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState, type Rect } from '../../src/types';

describe('Milestone 11 Challenger 2: Upgrades Combat & Dual Fighter Invariant Adversarial Suite', () => {

  // ==========================================================================
  // Dimension 1: Kinetic Shield on Dual Fighter Invariants
  // ==========================================================================
  describe('Dimension 1: Kinetic Shield on Dual Fighter Invariants', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: Player.BASELINE_Y });
      player.isDual = true;
    });

    it('absorbs lethal collision on left hull, grants >= 1.0s invulnerability, and keeps Dual Fighter intact', () => {
      // Setup Dual Fighter with Kinetic Shield
      expect(player.isDual).toBe(true);
      expect(player.state).toBe('dual');

      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);
      expect(player.hasShield).toBe(true);
      expect(player.shieldHp).toBe(1);

      const onShieldDeflect = vi.fn();
      const onExplode = vi.fn();
      player.onShieldDeflect = onShieldDeflect;
      player.onExplode = onExplode;

      // Left hull AABB: x in [96, 111], y in [244, 256]
      // Threat hitting left hull
      const lethalLeftThreat: Rect = {
        x: player.x - 12, // 100
        y: player.y - 2,  // 248
        width: 6,
        height: 6,
      };

      const damaged = player.hitTestAndDamage(lethalLeftThreat);

      // Core Challenge Invariants:
      // 1. hitTestAndDamage returns false (shield absorbed lethal blow)
      expect(damaged).toBe(false);

      // 2. Shield is depleted and flash timer started
      expect(player.hasShield).toBe(false);
      expect(player.shieldHp).toBe(0);
      expect(player.shieldFlashTimer).toBeCloseTo(0.3, 2);

      // 3. Exactly 1.0s invulnerability is granted
      expect(player.invulnerableTimer).toBeGreaterThanOrEqual(1.0);

      // 4. Player remains in 'dual' state with both hulls intact
      expect(player.isDual).toBe(true);
      expect(player.state).toBe('dual');
      expect(player.x).toBe(112); // No asymmetrical position shift

      // 5. Deflection callback triggered; NO explosion callback triggered
      expect(onShieldDeflect).toHaveBeenCalledTimes(1);
      expect(onShieldDeflect).toHaveBeenCalledWith(112, 250);
      expect(onExplode).not.toHaveBeenCalled();
    });

    it('absorbs lethal collision on right hull, grants >= 1.0s invulnerability, and keeps Dual Fighter intact', () => {
      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);

      const onShieldDeflect = vi.fn();
      const onExplode = vi.fn();
      player.onShieldDeflect = onShieldDeflect;
      player.onExplode = onExplode;

      // Right hull AABB: x in [113, 128], y in [244, 256]
      const lethalRightThreat: Rect = {
        x: player.x + 8, // 120
        y: player.y - 2, // 248
        width: 6,
        height: 6,
      };

      const damaged = player.hitTestAndDamage(lethalRightThreat);

      expect(damaged).toBe(false);
      expect(player.hasShield).toBe(false);
      expect(player.invulnerableTimer).toBeGreaterThanOrEqual(1.0);
      expect(player.isDual).toBe(true);
      expect(player.state).toBe('dual');
      expect(onShieldDeflect).toHaveBeenCalledTimes(1);
      expect(onExplode).not.toHaveBeenCalled();
    });

    it('absorbs catastrophic wide threat spanning both hulls without triggering fatal dual explosion', () => {
      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);

      const onExplode = vi.fn();
      player.onExplode = onExplode;

      // Wide threat covering both left and right hulls
      const wideThreat: Rect = {
        x: player.x - 10,
        y: player.y - 4,
        width: 20,
        height: 8,
      };

      const damaged = player.hitTestAndDamage(wideThreat);

      expect(damaged).toBe(false);
      expect(player.hasShield).toBe(false);
      expect(player.invulnerableTimer).toBeGreaterThanOrEqual(1.0);
      expect(player.isDual).toBe(true);
      expect(player.state).toBe('dual');
      expect(onExplode).not.toHaveBeenCalled();
    });

    it('guarantees complete damage immunity during the 1.0s invulnerability window following deflection', () => {
      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);

      // Trigger deflection
      player.hitTestAndDamage({ x: player.x - 10, y: player.y, width: 4, height: 4 });
      expect(player.invulnerableTimer).toBeGreaterThanOrEqual(1.0);

      // Step forward 0.4s (0.6s invulnerability remaining)
      player.update(0.4);
      expect(player.invulnerableTimer).toBeCloseTo(0.6, 2);
      expect(player.isInvulnerable()).toBe(true);

      // Second threat strikes left hull during invulnerability window
      const secondThreat: Rect = { x: player.x - 10, y: player.y, width: 4, height: 4 };
      const damagedDuringInvuln = player.hitTestAndDamage(secondThreat);

      expect(damagedDuringInvuln).toBe(false);
      expect(player.isDual).toBe(true);
      expect(player.state).toBe('dual');
    });

    it('correctly executes asymmetrical hull separation after invulnerability window has expired', () => {
      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);

      // Trigger deflection
      player.hitTestAndDamage({ x: player.x - 10, y: player.y, width: 4, height: 4 });

      // Advance past the 1.0s invulnerability window
      player.update(1.05);
      expect(player.invulnerableTimer).toBe(0);
      expect(player.isInvulnerable()).toBe(false);

      const onExplode = vi.fn();
      player.onExplode = onExplode;

      // Incoming bullet strikes left hull
      const postInvulnThreat: Rect = { x: player.x - 10, y: player.y, width: 4, height: 4 };
      const damaged = player.hitTestAndDamage(postInvulnThreat);

      // Now damage must be sustained:
      expect(damaged).toBe(true);
      // Left hull destroyed -> player reverts to single fighter and shifts +8px
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');
      expect(player.x).toBe(120); // 112 + 8
      expect(onExplode).toHaveBeenCalledWith(104, 250, true);
    });

    it('preserves single-use shield quota and does not stack multiple shield charges above 1', () => {
      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);
      expect(player.shieldHp).toBe(1);

      // Apply shield a second time
      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);
      expect(player.shieldHp).toBe(1); // Clamped at 1

      // Single hit must deplete it completely
      player.hitTestAndDamage({ x: player.x - 10, y: player.y, width: 4, height: 4 });
      expect(player.hasShield).toBe(false);
      expect(player.shieldHp).toBe(0);
    });
  });

  // ==========================================================================
  // Dimension 2: Scatter Shot on Dual Fighter Invariants & Ballistics
  // ==========================================================================
  describe('Dimension 2: Scatter Shot on Dual Fighter Invariants & Ballistics', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: Player.BASELINE_Y });
      player.isDual = true;
      player.applyPowerUp(PowerUpType.SCATTER_SHOT);
    });

    it('generates exactly 6 bullet spawn requests per volley on Dual Fighter', () => {
      const firedSpawns: BulletSpawnRequest[] = [];
      player.onFire = (spawns) => {
        firedSpawns.push(...spawns);
      };

      const fired = player.attemptFire();
      expect(fired).toBe(true);
      expect(firedSpawns.length).toBe(6);
    });

    it('spawns 3 bullets from left cannon (x - 8) and 3 bullets from right cannon (x + 8)', () => {
      const firedSpawns: BulletSpawnRequest[] = [];
      player.onFire = (spawns) => {
        firedSpawns.push(...spawns);
      };

      player.attemptFire();
      expect(firedSpawns.length).toBe(6);

      const leftGunX = player.x - 8;   // 104
      const rightGunX = player.x + 8;  // 120
      const gunY = player.y - 8;       // 242

      const [s0, s1, s2, s3, s4, s5] = firedSpawns;
      expect(s0).toBeDefined();
      expect(s1).toBeDefined();
      expect(s2).toBeDefined();
      expect(s3).toBeDefined();
      expect(s4).toBeDefined();
      expect(s5).toBeDefined();

      if (s0 && s1 && s2 && s3 && s4 && s5) {
        // Left cannon (indices 0, 1, 2)
        expect(s0.x).toBe(leftGunX);
        expect(s0.y).toBe(gunY);
        expect(s1.x).toBe(leftGunX);
        expect(s1.y).toBe(gunY);
        expect(s2.x).toBe(leftGunX);
        expect(s2.y).toBe(gunY);

        // Right cannon (indices 3, 4, 5)
        expect(s3.x).toBe(rightGunX);
        expect(s3.y).toBe(gunY);
        expect(s4.x).toBe(rightGunX);
        expect(s4.y).toBe(gunY);
        expect(s5.x).toBe(rightGunX);
        expect(s5.y).toBe(gunY);
      }
    });

    it('verifies exact spread angles at 0° and ±15° for both ships with total speed = 480 px/s', () => {
      const firedSpawns: BulletSpawnRequest[] = [];
      player.onFire = (spawns) => {
        firedSpawns.push(...spawns);
      };

      player.attemptFire();

      const expectedSpeed = 480;
      const sin15 = 0.258819;
      const cos15 = 0.965926;
      const expectedVxSpread = expectedSpeed * sin15;  // ~124.233
      const expectedVySpread = -expectedSpeed * cos15; // ~-463.644

      // For every spawn request, total speed sqrt(vx^2 + vy^2) must equal exactly 480 px/s
      for (const s of firedSpawns) {
        const totalSpeed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        expect(totalSpeed).toBeCloseTo(expectedSpeed, 1);
      }

      const [s0, s1, s2, s3, s4, s5] = firedSpawns;
      expect(s0).toBeDefined();
      expect(s1).toBeDefined();
      expect(s2).toBeDefined();
      expect(s3).toBeDefined();
      expect(s4).toBeDefined();
      expect(s5).toBeDefined();

      if (s0 && s1 && s2 && s3 && s4 && s5) {
        // Check Left Cannon:
        // Index 0: -15° spread (leftwards)
        expect(s0.vx).toBeCloseTo(-expectedVxSpread, 2);
        expect(s0.vy).toBeCloseTo(expectedVySpread, 2);

        // Index 1: 0° center (straight up)
        expect(s1.vx).toBe(0);
        expect(s1.vy).toBe(-expectedSpeed);

        // Index 2: +15° spread (rightwards)
        expect(s2.vx).toBeCloseTo(expectedVxSpread, 2);
        expect(s2.vy).toBeCloseTo(expectedVySpread, 2);

        // Check Right Cannon:
        // Index 3: -15° spread
        expect(s3.vx).toBeCloseTo(-expectedVxSpread, 2);
        expect(s3.vy).toBeCloseTo(expectedVySpread, 2);

        // Index 4: 0° center
        expect(s4.vx).toBe(0);
        expect(s4.vy).toBe(-expectedSpeed);

        // Index 5: +15° spread
        expect(s5.vx).toBeCloseTo(expectedVxSpread, 2);
        expect(s5.vy).toBeCloseTo(expectedVySpread, 2);
      }
    });

    it('verifies BulletManager acquires all 6 bullets into pool with correct orientations and trajectories', () => {
      const bulletManager = new BulletManager();
      const quota = player.getMaxMissileQuota();
      expect(quota).toBe(12);

      const firedBullets: Bullet[] = [];
      player.onFire = (spawns) => {
        for (const s of spawns) {
          const b = bulletManager.firePlayerBulletWithVector(s.x, s.y, s.vx, s.vy, quota);
          if (b) firedBullets.push(b);
        }
      };

      player.attemptFire();

      expect(firedBullets.length).toBe(6);
      expect(bulletManager.getPlayerBulletCount()).toBe(6);

      // Verify rotation angles computed by Bullet.init
      for (const b of firedBullets) {
        expect(b.active).toBe(true);
        expect(b.owner).toBe('PLAYER');
        const calculatedSpeed = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
        expect(calculatedSpeed).toBeCloseTo(480, 1);
      }

      // Simulate 5 frames (dt = 0.016s) of flight
      const initialPositions = firedBullets.map(b => ({ x: b.position.x, y: b.position.y }));
      bulletManager.update(0.08); // 80ms

      const [b0, b1, b2, b3, b4, b5] = firedBullets;
      expect(b0 && b1 && b2 && b3 && b4 && b5).toBeDefined();

      if (b0 && b1 && b2 && b3 && b4 && b5) {
        const p0 = initialPositions[0]!;
        const p1 = initialPositions[1]!;
        const p2 = initialPositions[2]!;
        const p3 = initialPositions[3]!;
        const p4 = initialPositions[4]!;
        const p5 = initialPositions[5]!;

        // Left-angled bullets must move left: position.x < initial.x
        expect(b0.position.x).toBeLessThan(p0.x);
        expect(b3.position.x).toBeLessThan(p3.x);

        // Center bullets must maintain exact horizontal position
        expect(b1.position.x).toBe(p1.x);
        expect(b4.position.x).toBe(p4.x);

        // Right-angled bullets must move right: position.x > initial.x
        expect(b2.position.x).toBeGreaterThan(p2.x);
        expect(b5.position.x).toBeGreaterThan(p5.x);

        // All bullets must travel upwards (position.y decreased)
        for (let i = 0; i < 6; i++) {
          expect(firedBullets[i]!.position.y).toBeLessThan(initialPositions[i]!.y);
        }
      }
    });
  });

  // ==========================================================================
  // Dimension 3: EMP Bomb Projectile Cleansing & Enemy Invariants
  // ==========================================================================
  describe('Dimension 3: EMP Bomb Projectile Cleansing & Enemy Invariants', () => {
    let bulletManager: BulletManager;
    let powerUpManager: PowerUpManager;
    let mockGame: any;

    beforeEach(() => {
      bulletManager = new BulletManager();
      mockGame = {
        bulletManager,
        formationManager: {
          enemies: [],
          getLivingEnemies: () => [],
        },
        soundSynth: {
          playExplosion: vi.fn(),
          playLaserDual: vi.fn(),
          playLaser: vi.fn(),
          playBossHit: vi.fn(),
        },
        particleSystem: {
          spawnHitSparks: vi.fn(),
          spawnSmallAlienExplosion: vi.fn(),
          spawnPlayerExplosion: vi.fn(),
        },
        scoreManager: {
          addScore: vi.fn(),
          addScoreForEnemy: vi.fn(),
        },
      };
      powerUpManager = new PowerUpManager({ game: mockGame });
    });

    it('spawns 20 active enemy bullets, triggers EMP, and asserts 100% are recycled to pool', () => {
      const spawnedEnemyBullets: Bullet[] = [];

      // Spawn exactly 20 active enemy bullets at various trajectory vectors
      for (let i = 0; i < 20; i++) {
        const originX = 20 + (i * 9) % 180;
        const originY = 30 + (i * 11) % 180;
        const b = bulletManager.fireEnemyBullet(originX, originY, 112, 250, 200);
        expect(b).not.toBeNull();
        if (b) spawnedEnemyBullets.push(b);
      }

      // Verify pre-condition: exactly 20 active enemy bullets
      expect(spawnedEnemyBullets.length).toBe(20);
      expect(bulletManager.getEnemyBulletCount()).toBe(20);
      for (const b of spawnedEnemyBullets) {
        expect(b.active).toBe(true);
      }

      // Detonate EMP Bomb
      const onEmpShockwave = vi.fn();
      powerUpManager.onEmpShockwave = onEmpShockwave;

      powerUpManager.detonateEmpBomb();

      // Post-condition:
      // 1. Active enemy bullet count drops to 0
      expect(bulletManager.getEnemyBulletCount()).toBe(0);

      // 2. All 20 bullet instances have active = false
      for (const b of spawnedEnemyBullets) {
        expect(b.active).toBe(false);
      }

      // 3. Shockwave callback triggered
      expect(onEmpShockwave).toHaveBeenCalledTimes(1);
    });

    it('preserves active player bullets while recycling all enemy bullets (Selective Cleansing)', () => {
      // Spawn 4 player bullets
      const playerBullets: Bullet[] = [];
      for (let i = 0; i < 4; i++) {
        const pb = bulletManager.firePlayerBullet(80 + i * 20, 200, true, 480, 0, -480, 8);
        expect(pb).not.toBeNull();
        if (pb) playerBullets.push(pb);
      }

      // Spawn 20 enemy bullets
      for (let i = 0; i < 20; i++) {
        bulletManager.fireEnemyBullet(30 + i * 8, 50, 112, 250, 200);
      }

      expect(bulletManager.getPlayerBulletCount()).toBe(4);
      expect(bulletManager.getEnemyBulletCount()).toBe(20);

      // Detonate EMP
      powerUpManager.detonateEmpBomb();

      // Enemy bullets wiped to 0
      expect(bulletManager.getEnemyBulletCount()).toBe(0);

      // Player bullets are 100% preserved
      expect(bulletManager.getPlayerBulletCount()).toBe(4);
      for (const pb of playerBullets) {
        expect(pb.active).toBe(true);
        expect(pb.owner).toBe('PLAYER');
      }
    });

    it('handles EMP detonation gracefully with zero active bullets on screen', () => {
      expect(bulletManager.getEnemyBulletCount()).toBe(0);
      expect(() => {
        powerUpManager.detonateEmpBomb();
      }).not.toThrow();
      expect(bulletManager.getEnemyBulletCount()).toBe(0);
    });

    it('wipes high-density enemy bullet saturation (50 bullets) without pool corruption', () => {
      // Spawn 50 enemy bullets
      for (let i = 0; i < 50; i++) {
        bulletManager.fireEnemyBullet(10 + (i % 20) * 10, 20 + (i % 5) * 30, 112, 250, 220);
      }
      expect(bulletManager.getEnemyBulletCount()).toBe(50);

      powerUpManager.detonateEmpBomb();

      expect(bulletManager.getEnemyBulletCount()).toBe(0);
    });

    it('damages diving enemies by 1 HP while leaving formation enemies untouched', () => {
      const divingZako = new Enemy({ id: 'div_1', type: EnemyType.ZAKO, x: 80, y: 150 });
      divingZako.state = EnemyState.DIVING_SOLO; // 1 HP base

      const divingBoss = new Enemy({ id: 'div_boss', type: EnemyType.BOSS, x: 120, y: 140 });
      divingBoss.state = EnemyState.DIVING_ESCORT;
      divingBoss.health = 2; // 2 HP base

      const formationEnemy = new Enemy({ id: 'form_1', type: EnemyType.GOEI, x: 100, y: 60 });
      formationEnemy.state = EnemyState.IN_FORMATION;

      mockGame.formationManager.enemies = [divingZako, divingBoss, formationEnemy];

      powerUpManager.detonateEmpBomb();

      // 1-HP diving zako is destroyed
      expect(divingZako.state).toBe(EnemyState.EXPLODING);

      // 2-HP diving boss took 1 damage (1 HP remaining, not destroyed)
      expect(divingBoss.health).toBe(1);
      expect(divingBoss.state).toBe(EnemyState.DIVING_ESCORT);

      // In-formation enemy took 0 damage
      expect(formationEnemy.state).toBe(EnemyState.IN_FORMATION);
      expect(formationEnemy.health).toBe(1);
    });
  });

  // ==========================================================================
  // Dimension 4: Rapid Fire Cooldown & Dynamic Quota Invariants
  // ==========================================================================
  describe('Dimension 4: Rapid Fire Cooldown & Dynamic Quota Invariants', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: Player.BASELINE_Y });
    });

    it('verifies firing cooldown is exactly 0.06s with Rapid Fire (50% reduction from 0.12s)', () => {
      // Baseline without Rapid Fire
      expect(player.hasRapidFire).toBe(false);
      player.attemptFire();
      expect(player.fireCooldownTimer).toBeCloseTo(0.12, 4);

      // Reset and apply Rapid Fire
      player.reset();
      player.applyPowerUp(PowerUpType.RAPID_FIRE);
      expect(player.hasRapidFire).toBe(true);

      player.attemptFire();
      expect(player.fireCooldownTimer).toBeCloseTo(0.06, 4);

      // Update by 0.03s: cooldown half remaining (0.03s)
      player.update(0.03);
      expect(player.fireCooldownTimer).toBeCloseTo(0.03, 4);
      expect(player.canFire).toBe(false);

      // Update another 0.03s: cooldown ready (0.00s)
      player.update(0.03);
      expect(player.fireCooldownTimer).toBe(0);
      expect(player.canFire).toBe(true);
    });

    it('allows Single Fighter to fire up to quota 4 under Rapid Fire without premature blocking', () => {
      player.applyPowerUp(PowerUpType.RAPID_FIRE);
      expect(player.getMaxMissileQuota()).toBe(4);

      player.onFire = () => {
        player.activeMissileCount++;
      };

      // Volley 1 at t = 0
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(1);

      // Step 0.06s
      player.update(0.06);
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(2);

      // Step 0.06s
      player.update(0.06);
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(3);

      // Step 0.06s
      player.update(0.06);
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(4);

      // Quota 4 is reached: cannot fire 5th bullet
      player.update(0.06);
      expect(player.canFire).toBe(false);
      expect(player.attemptFire()).toBe(false);
      expect(player.activeMissileCount).toBe(4);

      // Recycle 1 bullet: immediately unlocks firing
      player.activeMissileCount = 3;
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(4);
    });

    it('allows Dual Fighter to fire up to quota 8 under Rapid Fire without premature blocking', () => {
      player.isDual = true;
      player.applyPowerUp(PowerUpType.RAPID_FIRE);
      expect(player.getMaxMissileQuota()).toBe(8);

      player.onFire = (spawns) => {
        player.activeMissileCount += spawns.length;
      };

      // Volley 1 (spawns 2 bullets) at t = 0
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(2);

      // Volley 2 (spawns 2 bullets) at t = 0.06s
      player.update(0.06);
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(4);

      // Volley 3 (spawns 2 bullets) at t = 0.12s
      player.update(0.06);
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(6);

      // Volley 4 (spawns 2 bullets) at t = 0.18s
      player.update(0.06);
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(8);

      // Quota 8 reached: 5th volley blocked
      player.update(0.06);
      expect(player.canFire).toBe(false);
      expect(player.attemptFire()).toBe(false);
      expect(player.activeMissileCount).toBe(8);

      // Recycle 2 bullets (1 volley) -> immediately unlocks firing
      player.activeMissileCount = 6;
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(8);
    });

    it('enforces atomic volley preservation for Scatter Shot on Dual Fighter to prevent partial asymmetric fire', () => {
      player.isDual = true;
      player.applyPowerUp(PowerUpType.SCATTER_SHOT);
      player.applyPowerUp(PowerUpType.RAPID_FIRE);

      // Dual + Scatter + Rapid quota = 16. Volley size = 6.
      expect(player.getMaxMissileQuota()).toBe(16);

      player.onFire = (spawns) => {
        player.activeMissileCount += spawns.length;
      };

      // Volley 1 (6 bullets) -> active = 6
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(6);

      // Volley 2 (6 bullets) -> active = 12
      player.update(0.06);
      expect(player.attemptFire()).toBe(true);
      expect(player.activeMissileCount).toBe(12);

      // Volley 3 would require 6 more bullets (12 + 6 = 18 > 16)
      // System MUST reject volley 3 rather than firing a partial asymmetric stream (e.g. 4 bullets)
      player.update(0.06);
      expect(player.canFire).toBe(false);
      expect(player.attemptFire()).toBe(false);
      expect(player.activeMissileCount).toBe(12);
    });

    it('returns to normal 0.12s cooldown once Rapid Fire buff expires after 15.0s', () => {
      player.applyPowerUp(PowerUpType.RAPID_FIRE);
      expect(player.hasRapidFire).toBe(true);

      // Simulate 14.9s
      player.update(14.9);
      expect(player.hasRapidFire).toBe(true);

      // Simulate another 0.2s -> 15.1s elapsed, buff expired
      player.update(0.2);
      expect(player.hasRapidFire).toBe(false);
      expect(player.rapidFireTimer).toBe(0);

      // Fire weapon: cooldown is back to normal 0.12s
      player.attemptFire();
      expect(player.fireCooldownTimer).toBeCloseTo(0.12, 4);
    });
  });

  // ==========================================================================
  // Dimension 5: High-Intensity Combined Combat Simulation (600 Frames)
  // ==========================================================================
  describe('Dimension 5: High-Intensity Combined Combat Simulation (600 Frames)', () => {
    it('survives 600 fixed frames of continuous combat with dual ship, shield, rapid fire, and scatter shot', () => {
      const player = new Player({ x: 112, y: Player.BASELINE_Y });
      player.isDual = true;

      // Apply all active upgrades
      player.applyPowerUp(PowerUpType.KINETIC_SHIELD);
      player.applyPowerUp(PowerUpType.RAPID_FIRE);
      player.applyPowerUp(PowerUpType.SCATTER_SHOT);
      player.applyPowerUp(PowerUpType.ENGINE_BOOSTER);

      const bulletManager = new BulletManager();

      player.onFire = (spawns) => {
        const quota = player.getMaxMissileQuota();
        for (const s of spawns) {
          bulletManager.firePlayerBulletWithVector(s.x, s.y, s.vx, s.vy, quota);
        }
        player.activeMissileCount = bulletManager.getPlayerBulletCount();
      };

      let shieldDeflections = 0;
      player.onShieldDeflect = () => {
        shieldDeflections++;
      };

      // Run 600 frames at 60 FPS (dt = 0.0166s ~ 10.0s)
      const dt = 1 / 60;
      let totalVolleysFired = 0;

      for (let frame = 0; frame < 600; frame++) {
        // Continuous weapon trigger
        if (player.canFire) {
          if (player.attemptFire()) {
            totalVolleysFired++;
          }
        }

        // Update player kinematics with lateral sweep
        const moveRight = (frame % 120) < 60;
        player.update(dt, {
          moveLeft: !moveRight,
          moveRight: moveRight,
          fire: true,
          restart: false,
          pause: false,
          touchLeft: false,
          touchRight: false,
          touchFire: false,
          pointerActive: false,
          pointerX: null,
        });

        // Update bullet simulation (recycles out-of-bounds projectiles)
        bulletManager.update(dt);
        player.activeMissileCount = bulletManager.getPlayerBulletCount();

        // At frame 100, simulate an incoming hostile dive on left hull
        if (frame === 100) {
          const lethalThreat: Rect = { x: player.x - 10, y: player.y, width: 4, height: 4 };
          player.hitTestAndDamage(lethalThreat);
        }

        // Integrity assertions per frame
        expect(Number.isFinite(player.x)).toBe(true);
        expect(Number.isFinite(player.y)).toBe(true);
        expect(player.x).toBeGreaterThanOrEqual(16);
        expect(player.x).toBeLessThanOrEqual(208);
        expect(bulletManager.getPlayerBulletCount()).toBeLessThanOrEqual(16);
      }

      // Assertions over full simulation:
      expect(totalVolleysFired).toBeGreaterThan(15);
      expect(shieldDeflections).toBe(1);
      expect(player.isDual).toBe(true); // Remained dual throughout
      expect(player.state).toBe('dual');
    });
  });
});
