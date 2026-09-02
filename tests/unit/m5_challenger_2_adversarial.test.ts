/**
 * Galaga Arcade Web Game — Milestone 5 Challenger 2 Adversarial Stress Test Suite
 * 
 * Exhaustively probes:
 * 1. Dual Fighter rescue docking at extreme screen edges (x = 12, 16, 208, 212) and moving flank tracking.
 * 2. Killing diving Boss Galaga with 2 Goei escorts AND a captured fighter (score breakdown + rescue docking trigger).
 * 3. Turncoat hostile fighter dive peeling, aimed bullet firing at player, bullet collision & ramming.
 * 4. Player death during rescued fighter descent (clean state cleanup, no phantom/ghost docked ships, Game Over).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState, type InputState } from '../../src/types';

describe('Milestone 5 Challenger 2: Rescue Docking & Turncoat Combat Stress Tests', () => {
  let game: Game;

  const defaultInput: InputState = {
    moveLeft: false,
    moveRight: false,
    fire: false,
    pause: false,
    restart: false,
    pointerActive: false,
    pointerX: null,
    touchLeft: false,
    touchRight: false,
    touchFire: false,
  };

  beforeEach(() => {
    game = new Game();
  });

  // ==========================================================================
  // Challenge 1: Dual Fighter Rescue Docking at Extreme Screen Edges
  // ==========================================================================
  describe('1. Rescue Docking at Extreme Screen Edges & Flank Tracking', () => {
    it('executes rescue docking when active player is at extreme left boundary (x = 16)', () => {
      const player = game.getPlayer();
      player.reset(16, Player.BASELINE_Y, 2);
      expect(player.x).toBe(16);

      const onDocked = vi.fn();
      player.onDocked = onDocked;

      // Rescued fighter starts at top-center (x = 112, y = 80)
      player.startRescue(112, 80);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      // Step physics until docking convergence completes
      const dt = 1 / 60;
      let docked = false;
      for (let f = 0; f < 180; f++) {
        // Player holds left key against boundary
        player.update(dt, {
          ...defaultInput,
          moveLeft: true,
        });

        if (player.state === 'dual') {
          docked = true;
          break;
        }
      }

      expect(docked).toBe(true);
      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.rescuedFighter.active).toBe(false);
      // Dual fighter bounds check: minX for dual is 16, span is [0, 32]
      expect(player.x).toBeGreaterThanOrEqual(16);
      expect(player.x).toBeLessThanOrEqual(208);
      expect(player.getHitbox().width).toBe(32);
      expect(onDocked).toHaveBeenCalledTimes(1);
    });

    it('executes rescue docking when active player is at extreme right boundary (x = 208)', () => {
      const player = game.getPlayer();
      player.reset(208, Player.BASELINE_Y, 2);
      expect(player.x).toBe(208);

      const onDocked = vi.fn();
      player.onDocked = onDocked;

      // Rescued fighter starts at top-left (x = 40, y = 80)
      player.startRescue(40, 80);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      const dt = 1 / 60;
      let docked = false;
      for (let f = 0; f < 180; f++) {
        // Player holds right key against boundary
        player.update(dt, {
          ...defaultInput,
          moveRight: true,
        });

        if (player.state === 'dual') {
          docked = true;
          break;
        }
      }

      expect(docked).toBe(true);
      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.rescuedFighter.active).toBe(false);
      // Dual fighter bounds check: maxX for dual is 208, span is [192, 224]
      expect(player.x).toBeLessThanOrEqual(208);
      expect(player.x).toBeGreaterThanOrEqual(16);
      expect(player.getHitbox().width).toBe(32);
      expect(onDocked).toHaveBeenCalledTimes(1);
    });

    it('handles single ship absolute min/max bounds (x = 12, x = 212) during docking', () => {
      const player = game.getPlayer();
      // Single ship can reach x = 12
      player.reset(12, Player.BASELINE_Y, 2);
      expect(player.x).toBe(12);

      player.startRescue(12, 50);
      expect(player.state).toBe('docking');

      // Complete docking
      while (player.state === 'docking') {
        player.update(1 / 60, { ...defaultInput, moveLeft: true });
      }

      // After dual docking, player x is centered and valid
      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.x).toBeGreaterThanOrEqual(16);
      expect(player.x).toBeLessThanOrEqual(208);

      // Holding left pushes dual fighter to absolute minX (16)
      for (let f = 0; f < 10; f++) {
        player.update(1 / 60, { ...defaultInput, moveLeft: true });
      }
      expect(player.x).toBe(16);
      const hitbox = player.getHitbox();
      expect(hitbox.x).toBe(0); // [0, 32] perfectly aligns with screen left edge
      expect(hitbox.width).toBe(32);
    });

    it('handles rapid cross-screen steering (x = 16 -> x = 208) while rescued fighter is descending', () => {
      const player = game.getPlayer();
      player.reset(16, Player.BASELINE_Y, 2);

      player.startRescue(112, 50);
      expect(player.state).toBe('docking');

      const dt = 1 / 60;
      // Steer full throttle to the right
      for (let f = 0; f < 60; f++) {
        player.update(dt, {
          ...defaultInput,
          moveRight: true,
        });

        // Verify rescued fighter coordinates remain valid numbers and within screen margins
        expect(Number.isFinite(player.rescuedFighter.x)).toBe(true);
        expect(Number.isFinite(player.rescuedFighter.y)).toBe(true);
        expect(Number.isNaN(player.rescuedFighter.x)).toBe(false);
        expect(Number.isNaN(player.rescuedFighter.y)).toBe(false);
      }

      // Finish descent
      while (player.state === 'docking') {
        player.update(dt);
      }

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.x).toBeGreaterThanOrEqual(16);
      expect(player.x).toBeLessThanOrEqual(208);
    });

    it('handles high-frequency left/right oscillation during docking descent', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 2);

      player.startRescue(112, 60);
      expect(player.state).toBe('docking');

      const dt = 1 / 60;
      // Rapid left/right jitter
      for (let f = 0; f < 100; f++) {
        const moveLeft = f % 2 === 0;
        player.update(dt, {
          ...defaultInput,
          moveLeft,
          moveRight: !moveLeft,
        });

        expect(Number.isFinite(player.rescuedFighter.x)).toBe(true);
        expect(Number.isFinite(player.rescuedFighter.y)).toBe(true);
      }

      while (player.state === 'docking') {
        player.update(dt);
      }

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
    });

    it('enforces steering during docking and unlocks 4-missile dual firing upon completion', () => {
      const player = game.getPlayer();
      player.reset(100, Player.BASELINE_Y, 2);

      const firedSpawns: any[] = [];
      player.onFire = (spawns) => firedSpawns.push(...spawns);

      player.startRescue(100, 80);
      expect(player.state).toBe('docking');

      // During docking animation, weapons are locked until docking completes
      expect(player.canFire).toBe(false);
      expect(player.attemptFire()).toBe(false);

      // Complete docking
      while (player.state === 'docking') {
        player.update(1 / 60);
      }

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.canFire).toBe(true);

      // Dual Fighter can fire 2 pairs (4 missiles total)
      // Pair 1
      expect(player.attemptFire()).toBe(true);
      expect(firedSpawns.length).toBe(2);
      player.activeMissileCount = 2;
      player.update(0.12); // Cooldown

      // Pair 2
      expect(player.attemptFire()).toBe(true);
      expect(firedSpawns.length).toBe(4);
      player.activeMissileCount = 4;
      player.update(0.12);

      // Pair 3 blocked by 4-missile limit
      expect(player.attemptFire()).toBe(false);
      expect(firedSpawns.length).toBe(4);
    });
  });

  // ==========================================================================
  // Challenge 2: Killing Diving Boss with 2 Goei Escorts + Captured Fighter
  // ==========================================================================
  describe('2. Killing Diving Boss Galaga with 2 Goei Escorts + Captured Fighter', () => {
    it('awards 1600 pts (Boss dive with 2 escorts) + 1000 pts (Rescue bonus) and triggers rescue docking', () => {
      game.startGame();
      game.update(2.3); // Enter PLAYING state
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 2);

      const formation = game.getFormationManager();
      const bullets = game.getBulletManager();

      // Create Boss diving with 2 Goei escorts AND holding a captured fighter
      const boss = new Enemy({ id: 101, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.escortCount = 2;
      boss.hasCapturedFighter = true;

      const capturedFighter = new Enemy({
        id: 102,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 112,
        y: 104,
      });
      capturedFighter.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = capturedFighter;
      capturedFighter.escortBoss = boss;

      const goei1 = new Enemy({ id: 103, type: EnemyType.GOEI, x: 92, y: 120 });
      goei1.state = EnemyState.DIVING_ESCORT;
      goei1.escortBoss = boss;

      const goei2 = new Enemy({ id: 104, type: EnemyType.GOEI, x: 132, y: 120 });
      goei2.state = EnemyState.DIVING_ESCORT;
      goei2.escortBoss = boss;

      formation.enemies.push(boss, capturedFighter, goei1, goei2);

      const startingScore = game.score;

      // Hit 1 on Boss: 2 HP -> 1 HP (Blue/Green damage flash)
      bullets.firePlayerBullet(112, 126, false);
      game.resolveCollisions();
      expect(boss.health).toBe(1);
      expect(boss.state).toBe(EnemyState.DIVING_ESCORT);
      expect(game.score).toBe(startingScore);

      // Hit 2 on Boss: 1 HP -> 0 HP (Destroyed!)
      bullets.firePlayerBullet(112, 126, false);
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);

      // Score check:
      // Boss kill with 2 escorts = 1600 pts
      // Rescue trigger bonus = +1000 pts
      // Total added score = 2600 pts
      expect(game.score).toBe(startingScore + 2600);

      // Captured fighter escort enemy entity must be deactivated
      expect(capturedFighter.active).toBe(false);
      expect(capturedFighter.state).toBe(EnemyState.INACTIVE);

      // Player must transition to docking state
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      // Goei escorts must remain alive and continue diving
      expect(goei1.active).toBe(true);
      expect(goei1.state).toBe(EnemyState.DIVING_ESCORT);
      expect(goei2.active).toBe(true);
      expect(goei2.state).toBe(EnemyState.DIVING_ESCORT);

      // Let docking complete
      while (player.state === 'docking') {
        player.update(1 / 60);
      }

      // Docking completion awards another +1000 pts (Game.ts onDocked hook)
      expect(player.isDual).toBe(true);
      expect(game.score).toBe(startingScore + 3600);
    });

    it('handles killing 1 Goei escort first, then killing Boss holding captured fighter (800 pts + 1000 pts)', () => {
      game.startGame();
      game.update(2.3);

      const formation = game.getFormationManager();
      const bullets = game.getBulletManager();

      const boss = new Enemy({ id: 201, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.escortCount = 2;
      boss.hasCapturedFighter = true;

      const capturedFighter = new Enemy({
        id: 202,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 112,
        y: 104,
      });
      capturedFighter.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = capturedFighter;
      capturedFighter.escortBoss = boss;

      const goei1 = new Enemy({ id: 203, type: EnemyType.GOEI, x: 92, y: 120 });
      goei1.state = EnemyState.DIVING_ESCORT;
      goei1.escortBoss = boss;

      formation.enemies.push(boss, capturedFighter, goei1);

      const score0 = game.score;

      // 1. Destroy Goei 1 (awards 160 pts diving Goei, reduces boss.escortCount from 2 to 1)
      bullets.firePlayerBullet(92, 126, false);
      game.resolveCollisions();
      expect(goei1.health).toBe(0);
      expect(goei1.state).toBe(EnemyState.EXPLODING);
      expect(boss.escortCount).toBe(1);
      expect(game.score).toBe(score0 + 160);

      // 2. Destroy Boss (2 hits)
      bullets.firePlayerBullet(112, 126, false);
      game.resolveCollisions();
      bullets.firePlayerBullet(112, 126, false);
      game.resolveCollisions();

      // Boss with 1 escort = 800 pts, rescue bonus = 1000 pts -> +1800 pts
      expect(boss.health).toBe(0);
      expect(game.score).toBe(score0 + 160 + 1800);
      expect(game.getPlayer().state).toBe('docking');
    });

    it('handles killing both Goei escorts first, then killing Boss holding captured fighter (400 pts + 1000 pts)', () => {
      game.startGame();
      game.update(2.3);

      const formation = game.getFormationManager();
      const bullets = game.getBulletManager();

      const boss = new Enemy({ id: 251, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.escortCount = 2;
      boss.hasCapturedFighter = true;

      const capturedFighter = new Enemy({
        id: 252,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 112,
        y: 104,
      });
      capturedFighter.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = capturedFighter;
      capturedFighter.escortBoss = boss;

      const goei1 = new Enemy({ id: 253, type: EnemyType.GOEI, x: 92, y: 120 });
      goei1.state = EnemyState.DIVING_ESCORT;
      goei1.escortBoss = boss;

      const goei2 = new Enemy({ id: 254, type: EnemyType.GOEI, x: 132, y: 120 });
      goei2.state = EnemyState.DIVING_ESCORT;
      goei2.escortBoss = boss;

      formation.enemies.push(boss, capturedFighter, goei1, goei2);

      const score0 = game.score;

      // 1. Destroy Goei 1 (160 pts)
      bullets.firePlayerBullet(92, 126, false);
      game.resolveCollisions();
      expect(boss.escortCount).toBe(1);

      // 2. Destroy Goei 2 (160 pts)
      bullets.firePlayerBullet(132, 126, false);
      game.resolveCollisions();
      expect(boss.escortCount).toBe(0);

      // 3. Destroy Boss (2 hits)
      bullets.firePlayerBullet(112, 126, false);
      game.resolveCollisions();
      bullets.firePlayerBullet(112, 126, false);
      game.resolveCollisions();

      // Boss with 0 escorts = 400 pts, rescue bonus = 1000 pts
      expect(boss.health).toBe(0);
      expect(game.score).toBe(score0 + 160 + 160 + 400 + 1000);
      expect(game.getPlayer().state).toBe('docking');
    });

    it('accidentally shooting captured fighter during 2-Goei Boss dive awards 1000 pts without rescue', () => {
      game.startGame();
      game.update(2.3);

      const formation = game.getFormationManager();
      const bullets = game.getBulletManager();

      const boss = new Enemy({ id: 301, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.escortCount = 2;
      boss.hasCapturedFighter = true;

      const capturedFighter = new Enemy({
        id: 302,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 112,
        y: 104,
      });
      capturedFighter.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = capturedFighter;
      capturedFighter.escortBoss = boss;

      formation.enemies.push(boss, capturedFighter);

      const score0 = game.score;

      // Player bullet hits captured fighter directly (at y = 104)
      bullets.firePlayerBullet(112, 108, false);
      game.resolveCollisions();

      expect(capturedFighter.health).toBe(0);
      expect(capturedFighter.state).toBe(EnemyState.EXPLODING);
      expect(game.score).toBe(score0 + 1000);
      expect(boss.hasCapturedFighter).toBe(false);
      expect(boss.capturedFighterEnemy).toBeNull();
      // Player is NOT docking
      expect(game.getPlayer().state).not.toBe('docking');
    });
  });

  // ==========================================================================
  // Challenge 3: Turncoat Fighter Firing Bullets & Hostile Dive Combat
  // ==========================================================================
  describe('3. Turncoat Fighter Hostile Combat & Firing Behavior', () => {
    it('turns captured fighter into CAPTURED_HOSTILE and launches solo dive when Boss is killed in formation', () => {
      game.startGame();
      game.update(2.3);

      const formation = game.getFormationManager();
      const bullets = game.getBulletManager();

      const boss = new Enemy({ id: 401, type: EnemyType.BOSS, x: 112, y: 52 });
      boss.state = EnemyState.IN_FORMATION;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 402, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 36 });
      escort.state = EnemyState.IN_FORMATION;
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      formation.enemies.push(boss, escort);

      // Destroy Boss in formation
      bullets.firePlayerBullet(112, 58, false);
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);

      // Escort must become CAPTURED_HOSTILE with active dive flight path
      expect(escort.state).toBe(EnemyState.CAPTURED_HOSTILE);
      expect(escort.escortBoss).toBeNull();
      expect(escort.flightPath).not.toBeNull();
      expect(game.getPlayer().state).not.toBe('docking');
    });

    it('turncoat fighter fires aimed bullets at player during dive attack', () => {
      const bullets = game.getBulletManager();
      const formation = game.getFormationManager();

      const turncoat = new Enemy({
        id: 501,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 100,
        y: 80,
      });
      turncoat.active = true;
      turncoat.state = EnemyState.CAPTURED_HOSTILE;
      turncoat.fireCooldownTimer = 0; // Ready to shoot

      turncoat.onFireBullet = (req) => {
        bullets.fireEnemyBullet(req.originX, req.originY, req.targetX, req.targetY, req.speed);
      };

      formation.enemies.push(turncoat);

      expect(bullets.getEnemyBulletCount()).toBe(0);

      // Update formation: turncoat in y in [60, 220] fires bullet
      formation.update(1 / 60, 112, 250);

      // Enemy bullet pool must now contain an active bullet directed at player
      expect(bullets.getEnemyBulletCount()).toBeGreaterThan(0);
      let foundBullet = false;
      bullets.forEachActiveEnemyBullet((b) => {
        if (b.active) {
          foundBullet = true;
          expect(b.velocity.y).toBeGreaterThan(0); // Directed downward toward player
        }
      });
      expect(foundBullet).toBe(true);
    });

    it('turncoat fighter bullets can hit and destroy the player ship', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);
      expect(player.state).toBe('normal');

      // Spawn hostile enemy bullet directly overlapping player ship (player hitbox Y is [244, 256])
      const bullets = game.getBulletManager();
      bullets.fireEnemyBullet(112, 248, 112, 250, 200);
      expect(bullets.getEnemyBulletCount()).toBe(1);

      game.resolveCollisions();

      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
      expect(bullets.getEnemyBulletCount()).toBe(0); // Bullet recycled on impact
    });

    it('turncoat fighter ramming directly into player ship causes mutual destruction', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      const turncoat = new Enemy({
        id: 601,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 112,
        y: 250, // Direct overlap
      });
      turncoat.active = true;
      turncoat.state = EnemyState.CAPTURED_HOSTILE;
      game.getFormationManager().enemies.push(turncoat);

      game.resolveCollisions();

      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
      expect(turncoat.health).toBeLessThanOrEqual(0);
      expect(turncoat.state).toBe(EnemyState.EXPLODING);
    });

    it('player destroying diving turncoat fighter scores 1000 pts', () => {
      const turncoat = new Enemy({
        id: 701,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 112,
        y: 150,
      });
      turncoat.active = true;
      turncoat.state = EnemyState.CAPTURED_HOSTILE;
      game.getFormationManager().enemies.push(turncoat);

      const score0 = game.score;

      game.getBulletManager().firePlayerBullet(112, 156, false);
      game.resolveCollisions();

      expect(turncoat.health).toBe(0);
      expect(turncoat.state).toBe(EnemyState.EXPLODING);
      expect(game.score).toBe(score0 + 1000);
    });

    it('turncoat fighter safely wraps screen bottom and returns to formation if surviving dive', () => {
      const turncoat = new Enemy({
        id: 751,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 112,
        y: 280,
      });
      turncoat.active = true;
      turncoat.state = EnemyState.CAPTURED_HOSTILE;
      turncoat.returnSlotX = 112;
      turncoat.returnSlotY = 52;
      turncoat.vy = 200;

      // Update past screen bottom (y > 304)
      turncoat.update(0.2, 112, 250);

      expect(turncoat.state).toBe(EnemyState.RETURNING_TO_FORMATION);
      expect(turncoat.y).toBe(-16); // Re-enters at top
    });
  });

  // ==========================================================================
  // Challenge 4: Player Death During Rescued Fighter Descent
  // ==========================================================================
  describe('4. Player Death During Rescued Fighter Descent & Clean Cleanup', () => {
    it('cleans up rescued fighter state when player dies mid-descent with reserve lives (no ghost ship)', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 2);

      // Start rescue docking
      player.startRescue(140, 100);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      // Player is hit by an enemy projectile during descent
      const threatBox = { x: 108, y: 246, width: 8, height: 8 };
      const hit = player.hitTestAndDamage(threatBox);

      expect(hit).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(1);
      // Rescued fighter must immediately be deactivated
      expect(player.rescuedFighter.active).toBe(false);

      // Advance through death timer (1.2s)
      player.update(1.2);
      expect(player.state).toBe('respawning');
      expect(player.isDual).toBe(false);
      expect(player.rescuedFighter.active).toBe(false);

      // Advance through respawn invulnerability (3.0s)
      player.update(3.0);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.rescuedFighter.active).toBe(false);
      expect(player.getHitbox().width).toBe(12); // Single ship width
    });

    it('triggers GAME OVER cleanly when player dies during rescue docking with 0 reserve lives', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 1); // Last remaining life
      const onGameOver = vi.fn();
      player.onGameOver = onGameOver;

      player.startRescue(112, 100);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      // Kill player during docking
      player.destroy();
      expect(player.lives).toBe(0);
      expect(player.rescuedFighter.active).toBe(false);

      // Advance death delay
      player.update(1.2);
      expect(onGameOver).toHaveBeenCalledTimes(1);
      expect(player.rescuedFighter.active).toBe(false);
    });

    it('resets rescued fighter on explicit reset() and respawn() calls', () => {
      const player = game.getPlayer();
      player.rescuedFighter.active = true;
      player.rescuedFighter.x = 99;

      player.reset();
      expect(player.rescuedFighter.active).toBe(false);

      player.rescuedFighter.active = true;
      player.respawn();
      expect(player.rescuedFighter.active).toBe(false);
    });

    it('verifies asymmetrical hull destruction on Dual Fighter after successful rescue docking', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      // Complete rescue docking into Dual Fighter
      player.startRescue(112, 80);
      while (player.state === 'docking') {
        player.update(1 / 60);
      }
      expect(player.isDual).toBe(true);
      expect(player.lives).toBe(3);

      // 1. Enemy bullet clips left hull (x in [96..111])
      const leftBullet = { x: 100, y: 246, width: 4, height: 4 };
      const hitLeft = player.hitTestAndDamage(leftBullet);
      expect(hitLeft).toBe(true);
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');
      expect(player.lives).toBe(3); // NO LIFE LOSS for partial hull destruction!

      // 2. Subsequent enemy bullet hits surviving single ship hull
      const centerBullet = { x: player.x - 2, y: 246, width: 4, height: 4 };
      const hitCenter = player.hitTestAndDamage(centerBullet);
      expect(hitCenter).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2); // Life decremented on single hull loss
    });
  });
});
