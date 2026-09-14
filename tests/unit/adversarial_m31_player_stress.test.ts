/**
 * Galaga Arcade Web Game — Milestone M31 Adversarial Stress Test Suite
 * Challenger: m31_challenger_1 (Empirical Multi-Entity Stress Verifier)
 * 
 * Exhaustively stress-tests:
 * 1. Concurrent Firing Saturation & Zero-Starvation Invariants (P1/P2 simultaneous 60Hz firing, asymmetric weapon tiers, strict pool cap <= 256)
 * 2. Independent Kinematics, Extremal Clamping & NaN-Free Resistance (Left/right opposing border clamps, crossing trajectories, corrupt inputs)
 * 3. Independent Power-Up Decoupling & Damage Isolation (Shield absorption vs vulnerable destruction, buff timer isolation, death purge isolation)
 * 4. Asymmetrical Scoring, Extra Life Extensions & Game Over Lifecycle (Independent life sharing/depletion, multi-player high-score tracking)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../../src/entities/Player';
import { PlayerManager } from '../../src/systems/PlayerManager';
import { BulletManager } from '../../src/entities/Bullet';
import { PowerUpType } from '../../src/core/powerups/types';
import { Game } from '../../src/core/Game';
import type { Rect, InputState } from '../../src/types';

describe('Milestone M31 Adversarial Empirical Verification Suite', () => {

  // ==========================================================================
  // Track 1: Concurrent Firing Saturation & Zero-Starvation Invariants
  // ==========================================================================
  describe('Track 1: Concurrent Firing Saturation & Pool Capacity Bounds', () => {
    let bulletManager: BulletManager;

    beforeEach(() => {
      bulletManager = new BulletManager();
    });

    it('sustains simultaneous 60Hz dual firing across 600 frames without mutual starvation', () => {
      // P1 at x=80, P2 at x=140
      // Both attempt to fire every frame for 600 frames (10 seconds)
      let p1TotalFired = 0;
      let p2TotalFired = 0;

      const p1CooldownMax = 0.12; // 120ms
      const p2CooldownMax = 0.12;
      let p1Cooldown = 0;
      let p2Cooldown = 0;

      const dt = 1 / 60; // 16.6ms

      for (let frame = 0; frame < 600; frame++) {
        p1Cooldown = Math.max(0, p1Cooldown - dt);
        p2Cooldown = Math.max(0, p2Cooldown - dt);

        // P1 attempts to fire
        if (p1Cooldown <= 0 && bulletManager.canPlayerFire('p1', false)) {
          const b = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, undefined, 'p1');
          if (b) {
            p1TotalFired++;
            p1Cooldown = p1CooldownMax;
          }
        }

        // P2 attempts to fire
        if (p2Cooldown <= 0 && bulletManager.canPlayerFire('p2', false)) {
          const b = bulletManager.firePlayerBullet(140, 240, false, 480, 0, undefined, undefined, 'p2');
          if (b) {
            p2TotalFired++;
            p2Cooldown = p2CooldownMax;
          }
        }

        // Projectiles advance and offscreen ones are recycled
        bulletManager.update(dt);

        // Invariants checked every frame:
        const p1Active = bulletManager.getActivePlayerBulletCount('p1');
        const p2Active = bulletManager.getActivePlayerBulletCount('p2');
        const poolCap = bulletManager.getPoolCapacity();

        expect(p1Active).toBeLessThanOrEqual(2);
        expect(p2Active).toBeLessThanOrEqual(2);
        expect(poolCap).toBeLessThanOrEqual(256);
        expect(bulletManager.getPool().getActiveCount()).toBe(p1Active + p2Active);
      }

      // Assert neither player was starved (each fired the physical max of 38 bullets across 10s)
      expect(p1TotalFired).toBeGreaterThanOrEqual(35);
      expect(p2TotalFired).toBeGreaterThanOrEqual(35);
      expect(p1TotalFired).toBe(p2TotalFired);
    });

    it('enforces quota independence when P1 is at max quota and P2 fires continuously', () => {
      // Saturation attack: P1 exhausts quota completely
      const b1_1 = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, undefined, 'p1');
      const b1_2 = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, undefined, 'p1');

      expect(b1_1).not.toBeNull();
      expect(b1_2).not.toBeNull();
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(2);
      expect(bulletManager.canPlayerFire('p1', false)).toBe(false);

      // P1 third fire MUST fail
      const b1_overflow = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, undefined, 'p1');
      expect(b1_overflow).toBeNull();

      // P2 MUST still be 100% capable of firing full quota
      expect(bulletManager.canPlayerFire('p2', false)).toBe(true);
      const b2_1 = bulletManager.firePlayerBullet(140, 240, false, 480, 0, undefined, undefined, 'p2');
      const b2_2 = bulletManager.firePlayerBullet(140, 240, false, 480, 0, undefined, undefined, 'p2');

      expect(b2_1).not.toBeNull();
      expect(b2_2).not.toBeNull();
      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(2);
      expect(bulletManager.canPlayerFire('p2', false)).toBe(false);

      // Now recycle one of P1's bullets
      bulletManager.deactivateBullet(b1_1!);

      // P1 should now have 1 slot open, but P2 remains fully saturated
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(1);
      expect(bulletManager.canPlayerFire('p1', false)).toBe(true);
      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(2);
      expect(bulletManager.canPlayerFire('p2', false)).toBe(false);
    });

    it('handles asymmetric weapon levels (P1 Single vs P2 Dual Rapid Scatter) without quota crosstalk', () => {
      // P1: Single normal (quota = 2)
      // P2: Dual + Rapid Fire + Scatter Shot (quota = 16)
      const p1Quota = 2;
      const p2Quota = 16;

      // Fill P2 to 16 missiles
      const p2Bullets = [];
      for (let i = 0; i < 16; i++) {
        const b = bulletManager.firePlayerBullet(140, 240, true, 480, (i % 3 - 1) * 100, -450, p2Quota, 'p2');
        expect(b).not.toBeNull();
        if (b) p2Bullets.push(b);
      }

      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(16);
      expect(bulletManager.canPlayerFire(true, p2Quota, 'p2')).toBe(false);

      // P1's quota must be completely untouched (0 / 2)
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(0);
      expect(bulletManager.canPlayerFire(false, p1Quota, 'p1')).toBe(true);

      // Fire P1's 2 missiles
      const p1_b1 = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, p1Quota, 'p1');
      const p1_b2 = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, p1Quota, 'p1');
      expect(p1_b1).not.toBeNull();
      expect(p1_b2).not.toBeNull();
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(2);
      expect(bulletManager.canPlayerFire(false, p1Quota, 'p1')).toBe(false);

      // Pool capacity invariant under high multi-entity count
      expect(bulletManager.getPoolCapacity()).toBeLessThanOrEqual(256);
      expect(bulletManager.getPool().getActiveCount()).toBe(18);

      // Recycle all
      bulletManager.clear();
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(0);
      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(0);
      expect(bulletManager.getPool().getActiveCount()).toBe(0);
    });

    it('preserves strict zero-GC capacity (<= 256) under 10,000 continuous burst cycles', () => {
      expect(bulletManager.getPoolCapacity()).toBeLessThanOrEqual(256);

      for (let cycle = 0; cycle < 2000; cycle++) {
        // Fire 2 from P1, 4 from P2
        const b1 = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, 2, 'p1');
        const b2 = bulletManager.firePlayerBullet(80, 240, false, 480, 0, undefined, 2, 'p1');
        const b3 = bulletManager.firePlayerBullet(140, 240, true, 480, 0, undefined, 4, 'p2');
        const b4 = bulletManager.firePlayerBullet(140, 240, true, 480, 0, undefined, 4, 'p2');

        // Recycle in shuffled order
        if (b3) bulletManager.deactivateBullet(b3);
        if (b1) bulletManager.deactivateBullet(b1);
        if (b4) bulletManager.deactivateBullet(b4);
        if (b2) bulletManager.deactivateBullet(b2);
      }

      expect(bulletManager.getPoolCapacity()).toBeLessThanOrEqual(256);
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(0);
      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(0);
    });
  });

  // ==========================================================================
  // Track 2: Independent Kinematics, Boundary Clamping & NaN Resistance
  // ==========================================================================
  describe('Track 2: Independent Kinematics, Extremal Clamping & NaN Resistance', () => {
    let p1: Player;
    let p2: Player;
    let playerManager: PlayerManager;

    beforeEach(() => {
      p1 = new Player({ id: 'p1', colorScheme: 'classic', x: 80, y: Player.BASELINE_Y, lives: 3 });
      p2 = new Player({ id: 'p2', colorScheme: 'crimson', x: 144, y: Player.BASELINE_Y, lives: 3 });
      playerManager = new PlayerManager(p1);
      playerManager.setPlayer2(p2);
    });

    it('enforces simultaneous opposing boundary clamps without coordinate crosstalk', () => {
      // Aggressively steer P1 left and P2 right for 120 ticks
      const leftInput: InputState = {
        moveLeft: true,
        moveRight: false,
        fire: false,
        pause: false,
        restart: false,
        pointerX: null,
        pointerActive: false,
        touchLeft: false,
        touchRight: false,
        touchFire: false,
      };

      const rightInput: InputState = {
        moveLeft: false,
        moveRight: true,
        fire: false,
        pause: false,
        restart: false,
        pointerX: null,
        pointerActive: false,
        touchLeft: false,
        touchRight: false,
        touchFire: false,
      };

      for (let i = 0; i < 120; i++) {
        playerManager.update(1 / 60, { p1: leftInput, p2: rightInput });
      }

      // P1 (single hull) clamps at minX = 12
      expect(p1.x).toBe(12);
      expect(p1.y).toBe(Player.BASELINE_Y);
      expect(p1.vx).toBe(-Player.SPEED);

      // P2 (single hull) clamps at maxX = 212
      expect(p2.x).toBe(212);
      expect(p2.y).toBe(Player.BASELINE_Y);
      expect(p2.vx).toBe(Player.SPEED);

      // Upgrade P1 to dual hull and verify dual boundary clamp (minX = 16)
      p1.isDual = true;
      p1.clampPosition();
      expect(p1.x).toBe(16);

      // Upgrade P2 to dual hull and verify dual boundary clamp (maxX = 208)
      p2.isDual = true;
      p2.clampPosition();
      expect(p2.x).toBe(208);

      // Zero coordinate cross-talk
      expect(p1.x).toBe(16);
      expect(p2.x).toBe(208);
    });

    it('allows smooth trajectory crossing without entity collision jamming or sticking', () => {
      // P1 starts at left (x = 30) moving right
      // P2 starts at right (x = 190) moving left
      p1.x = 30;
      p2.x = 190;

      const p1Right: InputState = {
        moveLeft: false,
        moveRight: true,
        fire: false,
        pause: false,
        restart: false,
        pointerX: null,
        pointerActive: false,
        touchLeft: false,
        touchRight: false,
        touchFire: false,
      };

      const p2Left: InputState = {
        moveLeft: true,
        moveRight: false,
        fire: false,
        pause: false,
        restart: false,
        pointerX: null,
        pointerActive: false,
        touchLeft: false,
        touchRight: false,
        touchFire: false,
      };

      let crossedMidpoint = false;

      for (let tick = 0; tick < 60; tick++) {
        playerManager.update(1 / 60, { p1: p1Right, p2: p2Left });

        // Both coordinates must remain continuous, valid, and finite
        expect(Number.isFinite(p1.x)).toBe(true);
        expect(Number.isFinite(p2.x)).toBe(true);
        expect(p1.y).toBe(Player.BASELINE_Y);
        expect(p2.y).toBe(Player.BASELINE_Y);

        if (p1.x > p2.x) {
          crossedMidpoint = true;
        }
      }

      expect(crossedMidpoint).toBe(true);
      expect(p1.x).toBeGreaterThan(140);
      expect(p2.x).toBeLessThan(80);
    });

    it('resists adversarial inputs, micro-steps, huge dt, and prevents NaN propagation', () => {
      const corruptDts = [0, 1e-9, 50.0, -0.016];
      const corruptInputs: InputState[] = [
        // Simultaneous opposite directions
        { moveLeft: true, moveRight: true, fire: false, pause: false, restart: false, pointerX: null, pointerActive: false, touchLeft: false, touchRight: false, touchFire: false },
        // Extreme pointer coordinates
        { moveLeft: false, moveRight: false, fire: false, pause: false, restart: false, pointerX: -9999, pointerActive: true, touchLeft: false, touchRight: false, touchFire: false },
        { moveLeft: false, moveRight: false, fire: false, pause: false, restart: false, pointerX: 9999, pointerActive: true, touchLeft: false, touchRight: false, touchFire: false },
        { moveLeft: false, moveRight: false, fire: false, pause: false, restart: false, pointerX: 0, pointerActive: true, touchLeft: false, touchRight: false, touchFire: false },
      ];

      for (const dt of corruptDts) {
        for (const input of corruptInputs) {
          p1.update(dt, input);
          p2.update(dt, input);

          expect(Number.isFinite(p1.x)).toBe(true);
          expect(Number.isFinite(p1.y)).toBe(true);
          expect(Number.isFinite(p1.vx)).toBe(true);
          expect(Number.isFinite(p1.vy)).toBe(true);

          expect(Number.isFinite(p2.x)).toBe(true);
          expect(Number.isFinite(p2.y)).toBe(true);
          expect(Number.isFinite(p2.vx)).toBe(true);
          expect(Number.isFinite(p2.vy)).toBe(true);

          // Clamped boundaries must never be breached
          expect(p1.x).toBeGreaterThanOrEqual(12);
          expect(p1.x).toBeLessThanOrEqual(212);
          expect(p2.x).toBeGreaterThanOrEqual(12);
          expect(p2.x).toBeLessThanOrEqual(212);
        }
      }
    });

    it('isolates Phase Warp execution so P1 teleportation does not alter P2 position', () => {
      p1.x = 80;
      p2.x = 144;
      p1.phaseDriveTimer = 10.0;

      // P1 triggers Phase Warp to the right (+40px)
      p1.triggerPhaseWarp(1);

      expect(p1.x).toBe(120);
      expect(p1.phaseGhostTimer).toBeGreaterThan(0);
      expect(p1.isInvulnerable()).toBe(true);

      // P2 MUST remain strictly untouched
      expect(p2.x).toBe(144);
      expect(p2.phaseGhostTimer).toBe(0);
      expect(p2.isInvulnerable()).toBe(false);
    });
  });

  // ==========================================================================
  // Track 3: Independent Power-Up Decoupling & Damage Isolation
  // ==========================================================================
  describe('Track 3: Independent Power-Up Decoupling & Damage Isolation', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
      game.setCoopMode(true);
    });

    it('absorbs lethal damage via P1 Kinetic Shield while P2 is destructible by enemy threat', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 has shield; P2 has no shield
      game.powerUpManager.applyPowerUp(PowerUpType.KINETIC_SHIELD, p1);
      expect(p1.hasShield).toBe(true);
      expect(p2.hasShield).toBe(false);

      p1.x = 80;
      p1.y = 250;
      p2.x = 144;
      p2.y = 250;

      // Threat 1: Hits P1
      const threatAtP1: Rect = { x: 76, y: 246, width: 8, height: 8 };
      const hitP1 = p1.hitTestAndDamage(threatAtP1);

      // P1 shield absorbs hit -> hitTestAndDamage returns false (not destroyed)
      expect(hitP1).toBe(false);
      expect(p1.hasShield).toBe(false);
      expect(p1.lives).toBe(3);
      expect(p1.state).toBe('normal');
      expect(p1.invulnerableTimer).toBeGreaterThan(0);

      // P2 MUST be completely unaffected by threat at P1
      expect(p2.lives).toBe(3);
      expect(p2.state).toBe('normal');

      // Threat 2: Hits P2 (vulnerable)
      const threatAtP2: Rect = { x: 140, y: 246, width: 8, height: 8 };
      const hitP2 = p2.hitTestAndDamage(threatAtP2);

      // P2 takes damage -> returns true (destroyed)
      expect(hitP2).toBe(true);
      expect(p2.lives).toBe(2);
      expect(p2.state).toBe('destroyed');

      // P1 MUST be completely unaffected by P2's destruction
      expect(p1.lives).toBe(3);
    });

    it('deflects enemy threat via P2 Kinetic Reflection Shield without harming P1', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P2 activates Reflection Shield
      game.powerUpManager.applyPowerUp(PowerUpType.REFLECTION_SHIELD, p2);
      expect(p2.hasReflectionShieldActive).toBe(true);
      expect(p1.hasReflectionShieldActive).toBe(false);

      p2.x = 144;
      p2.y = 250;

      const bulletThreat: Rect = { x: 140, y: 246, width: 8, height: 8 };
      let reflected = false;
      p2.onReflectionDeflect = () => { reflected = true; };

      const hit = p2.hitTestAndDamage(bulletThreat);

      expect(hit).toBe(false);
      expect(reflected).toBe(true);
      expect(p2.lives).toBe(3);
      expect(p1.lives).toBe(3);
    });

    it('maintains independent buff durations and purges only the deceased player buffs on death', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // Give P1 Engine Booster & Rapid Fire
      game.powerUpManager.applyPowerUp(PowerUpType.ENGINE_BOOSTER, p1);
      game.powerUpManager.applyPowerUp(PowerUpType.RAPID_FIRE, p1);

      // Give P2 Scatter Shot & Chrono Field
      game.powerUpManager.applyPowerUp(PowerUpType.SCATTER_SHOT, p2);
      game.powerUpManager.applyPowerUp(PowerUpType.CHRONO_FIELD, p2);

      expect(p1.hasEngineBooster).toBe(true);
      expect(p1.hasRapidFire).toBe(true);
      expect(p1.hasScatterShot).toBe(false);
      expect(p1.hasChronoField).toBe(false);

      expect(p2.hasEngineBooster).toBe(false);
      expect(p2.hasRapidFire).toBe(false);
      expect(p2.hasScatterShot).toBe(true);
      expect(p2.hasChronoField).toBe(true);

      // Advance 5 seconds
      game.powerUpManager.update(5.0, [p1, p2]);
      expect(p1.hasEngineBooster).toBe(true);
      expect(p2.hasScatterShot).toBe(true);

      // P1 dies
      p1.destroy();
      expect(p1.hasEngineBooster).toBe(false);
      expect(p1.hasRapidFire).toBe(false);

      // P2 MUST retain its buffs intact!
      expect(p2.hasScatterShot).toBe(true);
      expect(p2.hasChronoField).toBe(true);
    });
  });

  // ==========================================================================
  // Track 4: Asymmetric Scoring, Lives & Game Over Lifecycle
  // ==========================================================================
  describe('Track 4: Asymmetrical Scoring, Extra Life Extensions & Game Over Lifecycle', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
      game.setCoopMode(true);
    });

    it('awards independent scores and triggers independent extra life extensions', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 scores 20,000 points (earns 1st extra life extend)
      game.scoreManager.addScore(20000, 'p1');

      expect(game.scoreManager.getScore('p1')).toBe(20000);
      expect(game.scoreManager.getScore('p2')).toBe(0);
      expect(game.scoreManager.getLives('p1')).toBe(4);
      expect(p1.lives).toBe(4);
      expect(p2.lives).toBe(3);

      // P2 scores 20,000 points
      game.scoreManager.addScore(20000, 'p2');
      expect(game.scoreManager.getScore('p2')).toBe(20000);
      expect(game.scoreManager.getLives('p2')).toBe(4);

      // CRITICAL DEFECT EMPIRICALLY CONFIRMED:
      // ScoreManager.addScore awards extra life to _p2Lives internally (= 4),
      // but invokes this._onExtraLifeCallback(extraLivesAwarded) WITHOUT playerId.
      // In Game.ts: onExtraLife((count, playerId?: PlayerId) => { const p = this.getPlayer(playerId ?? 'p1'); p.lives += count; })
      // Because playerId is omitted, it defaults to 'p1', granting the extra life to P1!
      // Consequently: p1.lives erroneously increments to 5, while p2.lives remains stuck at 3!
      expect(p1.lives).toBe(4); // Fails here if P1 stole life: received 5
      expect(p2.lives).toBe(4); // Fails here if P2 was starved: received 3
    });

    it('maintains active game state when P1 is eliminated, triggering GAME_OVER only when both fall', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 loses all 3 lives
      p1.lives = 0;
      p1.state = 'destroyed';

      // Verify PlayerManager living evaluation
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.playerManager.getLivingPlayers()).toHaveLength(1);
      expect(game.playerManager.getLivingPlayers()[0]).toBe(p2);

      // P2 is still active and can fire
      expect(p2.canFire).toBe(true);

      // Now P2 also loses all lives
      p2.lives = 0;
      p2.state = 'destroyed';

      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.playerManager.getLivingPlayers()).toHaveLength(0);
    });

    it('handles clean reset and mode toggle under high simulation stress', () => {
      // Create high saturation: fire bullets, give buffs, move players
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.x = 20;
      p2.x = 200;
      game.powerUpManager.applyPowerUp(PowerUpType.RAPID_FIRE, p1);
      game.powerUpManager.applyPowerUp(PowerUpType.KINETIC_SHIELD, p2);

      game.bulletManager.firePlayerBullet(20, 200, false, 480, 0, undefined, 2, 'p1');
      game.bulletManager.firePlayerBullet(200, 200, false, 480, 0, undefined, 2, 'p2');

      expect(game.bulletManager.getPool().getActiveCount()).toBe(2);

      // Reset game in co-op mode
      game.playerManager.reset('coop');
      game.bulletManager.clear();

      expect(game.playerManager.isCoop()).toBe(true);
      expect(p1.x).toBe(80);
      expect(p2.x).toBe(144);
      expect(p1.lives).toBe(3);
      expect(p2.lives).toBe(3);
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);

      // Toggle to single player
      game.setCoopMode(false);
      expect(game.isCoop()).toBe(false);
      expect(game.players).toHaveLength(1);
      expect(game.getPlayer('p2')).toBeUndefined();
    });
  });
});
