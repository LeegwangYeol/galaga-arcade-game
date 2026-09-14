/**
 * Galaga Arcade Web Game — Milestone 3 Adversarial & Stress Test Suite
 * 
 * Challenger: m3_challenger_1
 * 
 * Empirical verification of:
 * 1. Docking interruption stress testing (death, capture, edge-clamping, re-triggering during docking).
 * 2. Asymmetrical partial destruction (left hull vs right hull, boundary clamping, center gap probe).
 * 3. Invulnerability boundary conditions and zero-lives lifecycle management.
 * 4. Weapon quota transition during mid-flight dual-to-single downscaling.
 * 5. High-speed Swept CCD tunneling prevention.
 * 6. Non-controllable firing and lifecycle repetition edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Player } from '../../src/entities/Player';
import { Bullet, BulletManager } from '../../src/entities/Bullet';
import { Game } from '../../src/core/Game';
import type { Rect } from '../../src/types';

function checkAABB(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

describe('M3 Challenger 1: Adversarial Stress Test Suite', () => {
  let player: Player;
  let bulletManager: BulletManager;

  beforeEach(() => {
    player = new Player({ x: 112, y: Player.BASELINE_Y, lives: 3 });
    bulletManager = new BulletManager();
  });

  // ==========================================================================
  // 1. Docking Interruption & State Machine Stress
  // ==========================================================================
  describe('1. Docking Interruption & State Machine Stress', () => {
    it('handles lethal damage to player ship mid-docking and cancels rescued fighter', () => {
      const onExplode = vi.fn();
      player.onExplode = onExplode;

      // Start rescue docking
      player.startRescue(160, 60);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      // Advance docking partially (0.5s descent)
      player.update(0.5);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.y).toBeCloseTo(60 + 120 * 0.5, 2);

      // Lethal collision on player ship
      const bulletThreat: Rect = {
        x: player.x - 4,
        y: player.y - 4,
        width: 8,
        height: 8,
      };
      const hit = player.hitTestAndDamage(bulletThreat);
      expect(hit).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
      expect(player.rescuedFighter.active).toBe(false);
      expect(onExplode).toHaveBeenCalledWith(player.x, player.y, false);

      // Advance through death animation (1.2s)
      player.update(Player.DEATH_DURATION);

      // Player should respawn as SINGLE fighter, NOT dual
      expect(player.state).toBe('respawning');
      expect(player.isDual).toBe(false);
      expect(player.rescuedFighter.active).toBe(false);

      // Complete respawn invulnerability
      player.update(Player.INVULNERABLE_DURATION);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
    });

    it('rejects tractor beam capture attempts while in docking state', () => {
      player.startRescue(140, 50);
      expect(player.state).toBe('docking');

      // Attempt to initiate tractor beam capture
      player.startCapture(112, 60);

      // State MUST remain docking
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);
    });

    it('clamps dual ship correctly when docking completes at extreme left boundary', () => {
      player.x = 12; // Single fighter minimum boundary
      player.startRescue(10, 240); // Rescued fighter near baseline to left
      expect(player.state).toBe('docking');

      // Advance 1 frame to trigger docking completion
      player.update(0.1);

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      // Dual boundary requires min x = 16
      expect(player.x).toBe(16);
      expect(player.rescuedFighter.active).toBe(false);
    });

    it('clamps dual ship correctly when docking completes at extreme right boundary', () => {
      player.x = 212; // Single fighter maximum boundary
      player.startRescue(220, 240); // Rescued fighter near baseline to right
      expect(player.state).toBe('docking');

      // Advance 1 frame to trigger docking completion
      player.update(0.1);

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      // Dual boundary requires max x = 208
      expect(player.x).toBe(208);
      expect(player.rescuedFighter.active).toBe(false);
    });

    it('handles multiple rapid startRescue calls idempotently without state corruption', () => {
      player.startRescue(100, 50);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.x).toBe(100);

      // Re-trigger rescue from different coordinates
      player.startRescue(180, 70);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.x).toBe(180);
      expect(player.rescuedFighter.y).toBe(70);

      // Advance to completion
      for (let i = 0; i < 150; i++) {
        player.update(1 / 60);
      }
      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
    });

    it('triggers game over when docking ship is destroyed with 1 life remaining', () => {
      const onGameOver = vi.fn();
      player.lives = 1;
      player.onGameOver = onGameOver;

      player.startRescue(140, 50);
      expect(player.state).toBe('docking');

      const threat: Rect = { x: player.x - 2, y: player.y - 2, width: 4, height: 4 };
      player.hitTestAndDamage(threat);

      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(0);

      player.update(Player.DEATH_DURATION);
      expect(onGameOver).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. Asymmetrical Partial Destruction Stress Tests
  // ==========================================================================
  describe('2. Asymmetrical Partial Destruction & Hitbox Bounds', () => {
    it('correctly shifts center to right when left hull is destroyed at left boundary', () => {
      player.isDual = true;
      player.x = 16; // Minimum dual boundary

      const threat: Rect = { x: 2, y: 246, width: 6, height: 6 }; // Collides with left hull (0..15)
      const hit = player.hitTestAndDamage(threat);

      expect(hit).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.lives).toBe(3);
      // Shift 16 + 8 = 24
      expect(player.x).toBe(24);
    });

    it('correctly shifts center to left and clamps when right hull destroyed at right boundary', () => {
      player.isDual = true;
      player.x = 208; // Maximum dual boundary

      const threat: Rect = { x: 215, y: 246, width: 6, height: 6 }; // Collides with right hull (209..224)
      const hit = player.hitTestAndDamage(threat);

      expect(hit).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.lives).toBe(3);
      // Shift 208 - 8 = 200
      expect(player.x).toBe(200);
    });

    it('destroys single hull immediately and deducts 1 life', () => {
      player.isDual = false;
      player.state = 'normal';
      player.x = 112;

      const threat: Rect = { x: 110, y: 246, width: 4, height: 6 };
      const hit = player.hitTestAndDamage(threat);

      expect(hit).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
    });

    it('evaluates hitbox coverage across dual fighter horizontal span', () => {
      player.isDual = true;
      player.x = 112;

      // Left hull covers [96, 111], Right hull covers [113, 128]
      // Full dual hitbox from getHitbox covers [96, 128]
      const dualHitbox = player.getHitbox();
      expect(dualHitbox.x).toBe(96);
      expect(dualHitbox.width).toBe(32);
      expect(dualHitbox.y).toBe(244);
      expect(dualHitbox.height).toBe(12);

      // Test left flank collision
      const leftFlank: Rect = { x: 97, y: 246, width: 4, height: 4 };
      expect(checkAABB(leftFlank, dualHitbox)).toBe(true);

      // Test right flank collision
      const rightFlank: Rect = { x: 123, y: 246, width: 4, height: 4 };
      expect(checkAABB(rightFlank, dualHitbox)).toBe(true);

      // Test wide enemy collision (e.g. Boss Galaga diving body 16x16)
      const bossAlien: Rect = { x: 104, y: 240, width: 16, height: 16 };
      const hitBoth = player.hitTestAndDamage(bossAlien);
      expect(hitBoth).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
    });

    it('documents empirical behavior of standard 2px enemy bullet fired at exact center seam', () => {
      player.isDual = true;
      player.x = 112;

      // Standard enemy bullet (width: 2) centered at player.x (112): x spans [111, 113]
      const centerBullet: Rect = {
        x: 111,
        y: 246,
        width: 2,
        height: 4,
      };

      // Left hull: [96, 111], Right hull: [113, 128]
      // Because left hull ends at 111 and right hull starts at 113:
      // checkAABB([111, 113], [96, 111]) -> 111 < 111 is FALSE
      // checkAABB([111, 113], [113, 128]) -> 113 > 113 is FALSE
      const hit = player.hitTestAndDamage(centerBullet);
      // Seamless dual fighter hitbox eliminates center seam 2px gap (M24 Remediation)
      expect(hit).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Invulnerability Boundary Conditions & Zero-Lives Edge Cases
  // ==========================================================================
  describe('3. Invulnerability Boundary Conditions & Zero Lives', () => {
    it('is strictly immune to all damage during exact 3.0s invulnerability window', () => {
      player.respawn();
      expect(player.isInvulnerable()).toBe(true);

      const threat: Rect = { x: player.x - 4, y: player.y - 4, width: 8, height: 8 };

      // At t = 0.0s (timer = 3.0s) -> immune
      expect(player.hitTestAndDamage(threat)).toBe(false);

      // At t = 2.99s (timer = 0.01s) -> immune
      player.update(2.99);
      expect(player.isInvulnerable()).toBe(true);
      expect(player.hitTestAndDamage(threat)).toBe(false);

      // At t = 3.00s (timer = 0.0s) -> transitions to normal and becomes vulnerable
      player.update(0.02);
      expect(player.isInvulnerable()).toBe(false);
      expect(player.state).toBe('normal');

      // Now hit should land
      expect(player.hitTestAndDamage(threat)).toBe(true);
      expect(player.state).toBe('destroyed');
    });

    it('preserves score and respawns cleanly when lives remain', () => {
      player.score = 5400;
      player.destroy();
      expect(player.score).toBe(5400);

      player.update(Player.DEATH_DURATION);
      expect(player.state).toBe('respawning');
      expect(player.score).toBe(5400);
      expect(player.lives).toBe(2);
    });

    it('correctly maps toData() contract across all 7 states', () => {
      // Normal
      player.state = 'normal';
      expect(player.toData().state).toBe('ALIVE');

      // Capturing
      player.state = 'capturing';
      expect(player.toData().state).toBe('CAPTURING');

      // Captured
      player.state = 'captured';
      expect(player.toData().state).toBe('CAPTURED');

      // Docking
      player.state = 'docking';
      expect(player.toData().state).toBe('DOCKING');

      // Dual
      player.state = 'dual';
      expect(player.toData().state).toBe('DUAL');

      // Destroyed
      player.state = 'destroyed';
      expect(player.toData().state).toBe('DESTROYED');

      // Respawning
      player.state = 'respawning';
      expect(player.toData().state).toBe('RESPAWNING');
    });

    it('documents repeated onGameOver invocation on continuous updates in destroyed state', () => {
      const onGameOver = vi.fn();
      player.lives = 1;
      player.onGameOver = onGameOver;

      player.destroy();
      expect(player.lives).toBe(0);

      // First completion of death duration
      player.update(Player.DEATH_DURATION);
      expect(onGameOver).toHaveBeenCalledTimes(1);

      // Subsequent update while in destroyed state
      player.update(1 / 60);
      expect(onGameOver).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // 4. Weapon Quota Transition & Zero-Allocation Pool Stress
  // ==========================================================================
  describe('4. Weapon Quota Mid-Flight Transition & CCD', () => {
    it('enforces single quota immediately after dual fighter downscales to single', () => {
      player.isDual = true;

      // Fire 2 twin salvos (4 active missiles)
      const fireSpy = vi.fn();
      player.onFire = fireSpy;

      expect(player.attemptFire()).toBe(true);
      player.activeMissileCount = 2;

      player.update(0.12);
      expect(player.attemptFire()).toBe(true);
      player.activeMissileCount = 4;

      // Quota is saturated for dual (4/4)
      player.update(0.12);
      expect(player.attemptFire()).toBe(false);

      // Left hull destroyed -> becomes single fighter with 4 missiles in flight
      const leftThreat: Rect = { x: player.x - 14, y: player.y - 4, width: 4, height: 4 };
      player.hitTestAndDamage(leftThreat);
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');

      // Single quota is 2. With 4 active missiles, single ship CANNOT fire
      expect(player.canFire).toBe(false);
      expect(player.attemptFire()).toBe(false);

      // Missile 1 recycles (active = 3) -> still cannot fire (3 >= 2)
      player.activeMissileCount = 3;
      expect(player.canFire).toBe(false);

      // Missile 2 recycles (active = 2) -> still cannot fire (2 >= 2)
      player.activeMissileCount = 2;
      expect(player.canFire).toBe(false);

      // Missile 3 recycles (active = 1) -> now single ship CAN fire 1 shot!
      player.activeMissileCount = 1;
      expect(player.canFire).toBe(true);
      expect(player.attemptFire()).toBe(true);
    });

    it('prevents high-speed bullet tunneling using Swept CCD', () => {
      const bullet = new Bullet(1);
      // Spawn bullet at y = 200 traveling at -480 px/s
      bullet.init(100, 200, 0, -480, 'PLAYER');

      // Thin enemy collider (1px height) at y = 195
      const thinEnemy: Rect = { x: 98, y: 195, width: 10, height: 1 };

      // Update 1 frame (dt = 1/60 -> moves 8px to y = 192)
      bullet.update(1 / 60);

      // Swept box spans y from 189 to 203 (covering entire 8px displacement!)
      const sweptBox = bullet.getSweptHitbox();
      expect(checkAABB(sweptBox, thinEnemy)).toBe(true);
    });

    it('handles rapid bullet recycling and pool stress without GC churn or leak', () => {
      const pool = bulletManager.getPool();
      expect(pool.getActiveCount()).toBe(0);

      // Rapidly fire and recycle 200 bullets
      for (let i = 0; i < 200; i++) {
        const b = bulletManager.fireEnemyBullet(100, 50, 100, 250, 200);
        expect(b).not.toBeNull();
        expect(b?.active).toBe(true);
        if (b) {
          bulletManager.recycle(b);
          expect(b.active).toBe(false);
        }
      }

      expect(bulletManager.getEnemyBulletCount()).toBe(0);
      expect(pool.getActiveCount()).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Game Coordinator Master Integration
  // ==========================================================================
  describe('5. Game Coordinator Integration & Life Sync', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
    });

    it('synchronizes lives and handles game over lifecycle through Game loop', () => {
      game.startGame();
      expect(game.lives).toBe(3);
      expect(game.getPlayer().lives).toBe(3);

      // Fast-forward stage intro
      game.update(2.3);
      expect(game.state).toBe('PLAYING');

      // Inflict damage to player
      game.getPlayer().destroy();
      expect(game.getPlayer().lives).toBe(2);

      // Game syncs lives on update
      game.update(1 / 60);
      expect(game.lives).toBe(2);

      // Fast forward respawn
      game.update(Player.DEATH_DURATION);
      expect(game.getPlayer().state).toBe('respawning');

      // Inflict 2nd and 3rd lethal damage
      game.getPlayer().destroy();
      game.update(Player.DEATH_DURATION);
      expect(game.lives).toBe(1);

      game.getPlayer().destroy();
      expect(game.getPlayer().lives).toBe(0);
      game.update(Player.DEATH_DURATION);

      // Verify Game transitioned to GAME_OVER
      expect(game.state).toBe('GAME_OVER');
      expect(game.lives).toBe(0);
    });
  });
});
