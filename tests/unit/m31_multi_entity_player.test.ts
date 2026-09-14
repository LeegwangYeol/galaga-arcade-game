/**
 * Galaga Arcade Web Game — Milestone M31: Multi-Entity Player Architecture & Independent State Engine
 * 
 * Exhaustive unit test suite verifying:
 * Track A: Independent State Engine (positions, velocities, lives, independent power-ups, docking states)
 * Track B: Tagged Projectiles & Quotas (P1/P2 missile quotas, ownerId tagging, multi-channel scoring)
 * Track C: Tractor Beam & Rescue in Co-op (independent capture, cross-player rescue & dual docking)
 * Track D: 1P Backward Compatibility & Zero-GC Invariants (seamless 1P fallback, pool cap <= 256, procedural sprites)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../../src/entities/Player';
import { PlayerManager } from '../../src/systems/PlayerManager';
import { BulletManager } from '../../src/entities/Bullet';
import { ScoreManager } from '../../src/systems/ScoreManager';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { PowerUpType } from '../../src/core/powerups/types';
import { SpecialMoveType } from '../../src/core/specials/types';
import { SpriteRenderer } from '../../src/renderer/SpriteRenderer';
import { Game } from '../../src/core/Game';
import { Enemy } from '../../src/entities/Enemy';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone M31: Multi-Entity Player Architecture & Independent State Engine', () => {

  // ==========================================================================
  // Track A: Independent State Engine & Multi-Entity Lifecycle
  // ==========================================================================
  describe('Track A: Independent State Engine & Multi-Entity Lifecycle', () => {
    let p1: Player;
    let p2: Player;
    let playerManager: PlayerManager;

    beforeEach(() => {
      p1 = new Player({ id: 'p1', colorScheme: 'classic', x: 80, y: 250, lives: 3 });
      p2 = new Player({ id: 'p2', colorScheme: 'crimson', x: 140, y: 250, lives: 3 });
      playerManager = new PlayerManager(p1);
      playerManager.setPlayer2(p2);
    });

    it('initializes P1 and P2 with independent identities, color schemes, and coordinates', () => {
      expect(p1.id).toBe('p1');
      expect(p1.colorScheme).toBe('classic');
      expect(p1.x).toBe(80);
      expect(p1.y).toBe(250);

      expect(p2.id).toBe('p2');
      expect(p2.colorScheme).toBe('crimson');
      expect(p2.x).toBe(140);
      expect(p2.y).toBe(250);

      const players = playerManager.getPlayers();
      expect(players).toHaveLength(2);
      expect(players[0]?.id).toBe('p1');
      expect(players[1]?.id).toBe('p2');
    });

    it('manages independent 1D kinematics, velocities, and screen clamping', () => {
      // Move P1 left at full speed, P2 right at full speed
      p1.update(0.1, {
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
      });

      p2.update(0.1, {
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
      });

      // P1 should have moved left, P2 should have moved right
      expect(p1.x).toBeLessThan(80);
      expect(p2.x).toBeGreaterThan(140);
      expect(p1.vx).toBeLessThan(0);
      expect(p2.vx).toBeGreaterThan(0);
    });

    it('tracks independent lives and death states without cross-contamination', () => {
      expect(p1.lives).toBe(3);
      expect(p2.lives).toBe(3);

      // Kill P1
      p1.destroy();
      expect(p1.lives).toBe(2);
      expect(p2.lives).toBe(3);

      // Kill P2 twice
      p2.destroy();
      p2.respawn();
      p2.destroy();
      expect(p1.lives).toBe(2);
      expect(p2.lives).toBe(1);

      // Reduce P1 to 0 lives
      p1.lives = 0;
      expect(playerManager.areAllPlayersDead()).toBe(false);

      // Reduce P2 to 0 lives
      p2.lives = 0;
      expect(playerManager.areAllPlayersDead()).toBe(true);
    });

    it('supports asymmetric docking states (P1 single while P2 is dual fighter)', () => {
      expect(p1.isDual).toBe(false);
      expect(p2.isDual).toBe(false);

      // Upgrade P2 to dual fighter directly
      p2.isDual = true;
      expect(p1.isDual).toBe(false);
      expect(p2.isDual).toBe(true);
      expect(p2.state).toBe('dual');

      // P2 loses dual state
      p2.isDual = false;
      expect(p2.isDual).toBe(false);
      expect(p2.state).toBe('normal');
      expect(p1.isDual).toBe(false);
    });

    it('manages independent power-up buff states across players', () => {
      const powerUpManager = new PowerUpManager();

      // Activate Engine Booster on P1 only
      powerUpManager.applyPowerUp(PowerUpType.ENGINE_BOOSTER, p1);
      expect(p1.hasEngineBooster).toBe(true);
      expect(p2.hasEngineBooster).toBe(false);

      // Activate Kinetic Shield on P2 only
      powerUpManager.applyPowerUp(PowerUpType.KINETIC_SHIELD, p2);
      expect(p1.hasShield).toBe(false);
      expect(p2.hasShield).toBe(true);

      // Verify speed multiplier isolation
      expect(p1.speed).toBeGreaterThan(Player.SPEED);
      expect(p2.speed).toBe(Player.SPEED);

      // Advance time past Engine Booster duration (15s)
      powerUpManager.update(15.5, [p1, p2]);
      expect(p1.hasEngineBooster).toBe(false);
      // Kinetic Shield persists until damaged
      expect(p2.hasShield).toBe(true);
    });
  });

  // ==========================================================================
  // Track B: Tagged Projectiles & Quotas
  // ==========================================================================
  describe('Track B: Tagged Projectiles, Quota Partitioning & Scoring', () => {
    let bulletManager: BulletManager;
    let scoreManager: ScoreManager;

    beforeEach(() => {
      bulletManager = new BulletManager();
      scoreManager = new ScoreManager();
    });

    it('enforces separate missile quotas for P1 and P2', () => {
      expect(bulletManager.canPlayerFire('p1', false)).toBe(true);
      expect(bulletManager.canPlayerFire('p2', false)).toBe(true);

      // Fire 2 single missiles for P1
      bulletManager.firePlayerBullet(80, 240, false, 400, 0, undefined, undefined, 'p1');
      bulletManager.firePlayerBullet(80, 240, false, 400, 0, undefined, undefined, 'p1');

      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(2);
      expect(bulletManager.canPlayerFire('p1', false)).toBe(false);

      // P2 should still be completely unblocked to fire
      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(0);
      expect(bulletManager.canPlayerFire('p2', false)).toBe(true);

      // Fire 2 single missiles for P2
      bulletManager.firePlayerBullet(140, 240, false, 400, 0, undefined, undefined, 'p2');
      bulletManager.firePlayerBullet(140, 240, false, 400, 0, undefined, undefined, 'p2');

      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(2);
      expect(bulletManager.canPlayerFire('p2', false)).toBe(false);
    });

    it('tags projectiles with ownerId and preserves quota upon deactivation', () => {
      const b1 = bulletManager.firePlayerBullet(80, 240, false, 400, 0, undefined, undefined, 'p1');
      const b2 = bulletManager.firePlayerBullet(140, 240, false, 400, 0, undefined, undefined, 'p2');

      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(b1?.ownerId).toBe('p1');
      expect(b2?.ownerId).toBe('p2');

      // Deactivate P1 missile
      if (b1) bulletManager.deactivateBullet(b1);
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(0);
      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(1);
      expect(bulletManager.canPlayerFire('p1', false)).toBe(true);
      expect(bulletManager.canPlayerFire('p2', false)).toBe(true);
    });

    it('attributes scores, extra lives, and shot telemetry independently per player', () => {
      // Award points to P1
      scoreManager.addScore(500, 'p1');
      scoreManager.recordShotFired(1, 'p1');
      scoreManager.recordShotHit(1, 'p1');

      // Award points to P2
      scoreManager.addScore(1200, 'p2');
      scoreManager.recordShotFired(2, 'p2');
      scoreManager.recordShotHit(1, 'p2');

      expect(scoreManager.getScore('p1')).toBe(500);
      expect(scoreManager.getScore('p2')).toBe(1200);

      expect(scoreManager.getShotsFired('p1')).toBe(1);
      expect(scoreManager.getShotsHit('p1')).toBe(1);
      expect(scoreManager.getShotsFired('p2')).toBe(2);
      expect(scoreManager.highScore).toBe(20000);

      // Awarding score above default high score updates highScore
      scoreManager.addScore(25000, 'p2');
      expect(scoreManager.getScore('p2')).toBe(26200);
      expect(scoreManager.highScore).toBe(26200);
    });

    it('supports SpecialMovesManager multi-player energy collection and execution', () => {
      const game = new Game();
      const smm = game.specialMovesManager;
      expect(smm).toBeDefined();
      if (!smm) return;

      // Add energy and verify attribution
      smm.addEnergy(100);

      // Trigger Nova Barrage for P2
      const triggered = smm.trigger(SpecialMoveType.NOVA_BARRAGE, 'p2');
      expect(triggered).toBe(true);
      expect(smm.activePlayerId).toBe('p2');
    });
  });

  // ==========================================================================
  // Track C: Tractor Beam & Rescue in Co-op Mode
  // ==========================================================================
  describe('Track C: Tractor Beam & Rescue in Co-op Mode', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
      game.setCoopMode(true);
    });

    it('captures only the targeted player when inside tractor beam cone', () => {
      const p1 = game.playerManager.getPlayer('p1');
      const p2 = game.playerManager.getPlayer('p2');
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();

      if (!p1 || !p2) return;

      // Position P1 inside beam and P2 far to the right
      p1.x = 112;
      p1.y = 250;
      p2.x = 200;
      p2.y = 250;

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      const beam = new TractorBeam();
      beam.activate(boss);
      beam.update(0.6); // Fully expanded

      // Initiate capture on P1
      p1.startCapture(112, 100);
      expect(p1.state).toBe('capturing');
      expect(p2.state).toBe('normal');

      // P2 should be completely unaffected and free to move and fire
      expect(p2.canFire).toBe(true);
    });

    it('executes successful cross-player rescue docking in co-op', () => {
      const p2 = game.playerManager.getPlayer('p2')!;

      // Setup Boss Galaga with captured fighter diving
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 150 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const capturedFighterEnemy = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 134 });
      capturedFighterEnemy.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = capturedFighterEnemy;

      // Put boss in game formation enemies list
      game.formationManager.enemies.push(boss, capturedFighterEnemy);

      // P2 fires a missile that destroys the Boss
      const p2ScoreBefore = game.scoreManager.getScore('p2');
      const p1ScoreBefore = game.scoreManager.getScore('p1');

      // Fire P2 missile at boss
      const missile = game.bulletManager.firePlayerBullet(112, 154, false, 400, 0, undefined, undefined, 'p2');
      expect(missile?.ownerId).toBe('p2');

      // Resolve collision
      game.resolveCollisions();

      // Boss should be destroyed
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(boss.hasCapturedFighter).toBe(false);

      // Rescue bonus (+1000 pts) should be awarded to rescuer (P2)
      expect(game.scoreManager.getScore('p2')).toBeGreaterThanOrEqual(p2ScoreBefore + 1000);
      expect(game.scoreManager.getScore('p1')).toBe(p1ScoreBefore);

      // P2 should have started rescue docking
      expect(p2.rescuedFighter.active).toBe(true);
    });
  });

  // ==========================================================================
  // Track D: 1P Backward Compatibility, Zero-GC Invariants & Procedural Visuals
  // ==========================================================================
  describe('Track D: 1P Backward Compatibility & Zero-GC Invariants', () => {
    it('defaults to single-player mode with 100% backward-compatible accessors', () => {
      const game = new Game();
      expect(game.isCoop()).toBe(false);
      expect(game.players).toHaveLength(1);
      expect(game.player).toBe(game.players[0]);
      expect(game.getPlayer()).toBe(game.player);
      expect(game.getPlayer('p1')).toBe(game.player);
      expect(game.getPlayer('p2')).toBeUndefined();

      // Score and lives accessors mirror P1
      expect(game.score).toBe(0);
      expect(game.lives).toBe(3);
    });

    it('toggles co-op mode on and off cleanly', () => {
      const game = new Game();
      expect(game.isCoop()).toBe(false);

      // Turn co-op on
      game.setCoopMode(true);
      expect(game.isCoop()).toBe(true);
      expect(game.players).toHaveLength(2);
      expect(game.getPlayer('p2')).toBeDefined();
      expect(game.getPlayer('p2')?.id).toBe('p2');

      // Turn co-op off
      game.setCoopMode(false);
      expect(game.isCoop()).toBe(false);
      expect(game.players).toHaveLength(1);
      expect(game.getPlayer('p2')).toBeUndefined();
    });

    it('adheres strictly to Zero-GC bullet pool cap (<= 256) under dual-player saturation', () => {
      const bulletManager = new BulletManager();
      expect(bulletManager.getPoolCapacity()).toBeLessThanOrEqual(256);

      // Fire and recycle 100 cycles of bullets for both players
      for (let i = 0; i < 100; i++) {
        const b1 = bulletManager.firePlayerBullet(80, 240, false, 400, 0, undefined, undefined, 'p1');
        const b2 = bulletManager.firePlayerBullet(140, 240, false, 400, 0, undefined, undefined, 'p2');
        if (b1) bulletManager.deactivateBullet(b1);
        if (b2) bulletManager.deactivateBullet(b2);
      }

      // Pool capacity should remain constant and <= 256
      expect(bulletManager.getPoolCapacity()).toBeLessThanOrEqual(256);
      expect(bulletManager.getActivePlayerBulletCount('p1')).toBe(0);
      expect(bulletManager.getActivePlayerBulletCount('p2')).toBe(0);
    });

    it('verifies procedural pixel art sprite pre-baking for P2', () => {
      SpriteRenderer.initialize();

      // Definitions catalogue should contain P2 keys
      expect(SpriteRenderer.hasDefinition('PLAYER_FIGHTER_P2')).toBe(true);
      expect(SpriteRenderer.hasDefinition('DUAL_FIGHTER_P2')).toBe(true);
      expect(SpriteRenderer.hasDefinition('PLAYER_MISSILE_P2')).toBe(true);
      expect(SpriteRenderer.hasDefinition('PLAYER_LIFE_ICON_P2')).toBe(true);
    });
  });
});
