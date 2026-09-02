/**
 * Galaga Arcade Web Game — Milestone 8 Final Adversarial Stress & Hardening Test Suite (m8_challenger_1)
 * 
 * Tier 5 White-Box Adversarial Stress Testing across all subsystems:
 * 
 * Section 1: Long-Session Endurance & Zero-Allocation Invariance (500+ Game Loop Ticks)
 * Section 2: Extreme Boundary Conditions & Simultaneous Event Resolution
 * Section 3: Rapid Stage Advancement & Challenging Stage Telemetry (Stages 1 to 5+)
 * Section 4: Dual Fighter Asymmetrical Destruction & Boundary Clamping Under Stress
 * Section 5: Delta Spikes, Numerical Stability & High-Frequency Firing Saturation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { BulletManager } from '../../src/entities/Bullet';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { FormationManager } from '../../src/systems/FormationManager';
import { ParticleSystem } from '../../src/systems/ParticleSystem';
import { ScoreManager } from '../../src/systems/ScoreManager';
import { BezierCurve } from '../../src/math/Bezier';
import { EnemyType, EnemyState, type InputState } from '../../src/types';

describe('M8 Challenger 1: Tier 5 Full Engine Adversarial Hardening Suite', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    vi.stubGlobal('localStorage', storageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ==========================================================================
  // Section 1: Long-Session Endurance & Zero-Allocation Invariance (500+ Ticks)
  // ==========================================================================

  describe('1. Long-Session Endurance & Zero-Allocation Invariance (500 Ticks)', () => {
    it('simulates 500 game loop ticks with continuous wave transitions, attacks, pooling, and score accumulation without leaks or coordinate drifts', () => {
      const game = new Game();
      game.startGame();
      expect(game.state).toBe('STAGE_INTRO');

      // Fast-forward through STAGE_INTRO (2.2s = ~132 ticks of 1/60s)
      for (let i = 0; i < 140; i++) {
        game.update(1 / 60);
      }
      expect(game.state).toBe('PLAYING');

      // Setup dynamic input provider mock once outside loop
      const inputHandler = game.getInputHandler();
      let moveDir = 1;
      let isFiring = false;

      const simulatedInput: InputState = {
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

      vi.spyOn(inputHandler, 'getState').mockImplementation(() => {
        simulatedInput.moveLeft = moveDir < 0;
        simulatedInput.moveRight = moveDir > 0;
        simulatedInput.fire = isFiring;
        return simulatedInput;
      });

      const bulletPool = game.getBulletManager().getPool();

      // Run 500 continuous ticks of intense 60 FPS gameplay
      for (let tick = 0; tick < 500; tick++) {
        // Toggle direction every 60 ticks
        if (tick % 60 === 0) {
          moveDir = -moveDir;
        }

        isFiring = tick % 15 === 0;

        // Advance game engine 1 frame (16.6667 ms)
        game.update(1 / 60);

        // Simulate enemies taking hits occasionally
        if (tick % 40 === 0) {
          const living = game.getFormationManager().getLivingEnemies();
          if (living.length > 0) {
            const victim = living[0];
            if (victim) {
              victim.takeDamage(99);
              game.getScoreManager().addScoreForEnemy(victim.type, false);
            }
          }
        }

        // Check player boundaries every frame
        const p = game.getPlayer();
        expect(p.x).toBeGreaterThanOrEqual(12);
        expect(p.x).toBeLessThanOrEqual(212);
        expect(p.y).toBe(Player.BASELINE_Y);
      }

      // 1. Verify Player coordinates remain strictly finite
      const p = game.getPlayer();
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);

      // 2. Verify Starfield coordinates wrap properly without NaN
      const starfield = game.getStarfield();
      const stars = starfield.getStars();
      for (const star of stars) {
        expect(Number.isFinite(star.x)).toBe(true);
        expect(Number.isFinite(star.y)).toBe(true);
        expect(star.x).toBeGreaterThanOrEqual(0);
        expect(star.x).toBeLessThanOrEqual(Game.VIRTUAL_WIDTH);
        expect(star.y).toBeGreaterThanOrEqual(0);
        expect(star.y).toBeLessThanOrEqual(Game.VIRTUAL_HEIGHT);
      }

      // 3. Verify Bullet counts never exceed quota (2 for single fighter)
      const playerBulletCount = game.getBulletManager().getPlayerBulletCount();
      expect(playerBulletCount).toBeLessThanOrEqual(2);
      expect(playerBulletCount).toBeGreaterThanOrEqual(0);

      // 4. Verify bullet pool remained bounded (no runaway leaks)
      expect(bulletPool.getCapacity()).toBeLessThanOrEqual(128);
      expect(bulletPool.getActiveCount()).toBeLessThanOrEqual(16);

      // 5. Verify ScoreManager accumulated points without overflow or NaN
      expect(game.score).toBeGreaterThan(0);
      expect(Number.isFinite(game.score)).toBe(true);

      // 6. Verify render pipeline executes on 500-tick state without throwing
      expect(() => game.render()).not.toThrow();

      game.destroy();
    });

    it('verifies zero-allocation particle and bullet recycling stability over 1000 rapid cycles', () => {
      const bulletManager = new BulletManager();
      const particleSystem = new ParticleSystem();

      // Acquire and recycle 1000 bullets and particles
      for (let cycle = 0; cycle < 1000; cycle++) {
        // Fire bullet
        const b = bulletManager.firePlayerBullet(112, 250, false);
        if (b) {
          bulletManager.update(0.1); // Move
          bulletManager.recycle(b);
        }

        // Spawn explosion particles
        particleSystem.spawnPlayerExplosion(112, 250);
        particleSystem.update(0.1);
      }

      // Bullets should be completely recycled back to 0 active
      expect(bulletManager.getPlayerBulletCount()).toBe(0);
      expect(bulletManager.getPool().getActiveCount()).toBe(0);

      // Pool capacity should remain strictly bounded
      expect(bulletManager.getPool().getCapacity()).toBeLessThanOrEqual(128);
    });

    it('guarantees harmonic formation math maintains stable coordinates across extended elapsed times (t = 10,000s)', () => {
      const fm = new FormationManager();

      const testTimes = [0, 10, 100, 1000, 5000, 10000];
      for (const t of testTimes) {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 10; c++) {
            const pos = fm.getSlotPosition(r, c, t);
            expect(Number.isFinite(pos.x)).toBe(true);
            expect(Number.isFinite(pos.y)).toBe(true);
            // X coordinate within playfield width [0, 224]
            expect(pos.x).toBeGreaterThan(0);
            expect(pos.x).toBeLessThan(224);
            // Y coordinate within top half [40, 150]
            expect(pos.y).toBeGreaterThanOrEqual(40);
            expect(pos.y).toBeLessThanOrEqual(150);
          }
        }
      }
    });
  });

  // ==========================================================================
  // Section 2: Extreme Boundary Conditions & Simultaneous Event Resolution
  // ==========================================================================

  describe('2. Extreme Boundary Conditions & Simultaneous Event Resolution', () => {
    it('handles simultaneous Player death and Boss Galaga death in the exact same tick', () => {
      const game = new Game();
      game.startGame();
      game.setState('PLAYING');

      const player = game.getPlayer();
      player.state = 'normal';
      player.invulnerableTimer = 0;
      expect(player.isInvulnerable()).toBe(false);

      const boss = new Enemy({
        id: 999,
        type: EnemyType.BOSS,
        x: player.x,
        y: player.y - 40, // Directly in front of player
      });
      boss.state = EnemyState.DIVING_SOLO;
      boss.health = 1;
      game.getFormationManager().enemies.push(boss);

      // 1. Player fires a missile directly at Boss
      const playerMissile = game.getBulletManager().firePlayerBullet(boss.x, boss.y + 2);
      expect(playerMissile).not.toBeNull();

      // 2. In the same tick, an enemy bullet hits the player
      const enemyBullet = game.getBulletManager().fireEnemyBullet(player.x, player.y - 2, player.x, player.y, 200);
      expect(enemyBullet).not.toBeNull();

      const initialLives = player.lives;

      // Execute collision resolution
      expect(() => game.resolveCollisions()).not.toThrow();

      // 1. Boss should be destroyed by player missile
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);

      // 2. Player should be destroyed by enemy bullet
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(initialLives - 1);

      // 3. Score awarded for diving Boss kill (400 pts)
      expect(game.score).toBe(400);

      // 4. Game update proceeds cleanly without crash
      expect(() => game.update(1 / 60)).not.toThrow();

      game.destroy();
    });

    it('handles simultaneous Player death while Tractor Beam is capturing player (Interrupted Capture)', () => {
      const game = new Game();
      game.startGame();
      game.setState('PLAYING');

      const player = game.getPlayer();
      player.state = 'normal';
      player.invulnerableTimer = 0;

      const boss = new Enemy({
        id: 888,
        type: EnemyType.BOSS,
        x: 112,
        y: 100,
      });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.health = 1;
      game.getFormationManager().enemies.push(boss);

      const tractorBeam = game.getTractorBeam();
      tractorBeam.activate(boss);
      tractorBeam.update(0.6); // Fully expanded to HOLDING

      // Player starts capture ascension
      player.startCapture(boss.x, boss.y);
      expect(player.state).toBe('capturing');

      // Now destroy the Boss while player is in mid-ascension ('capturing')
      boss.takeDamage(99);
      if (tractorBeam.isActive() && tractorBeam.getBoss() === boss) {
        tractorBeam.deactivate(true);
      }

      // Tractor beam deactivates
      expect(tractorBeam.isActive()).toBe(false);

      // If player takes direct bullet or damage, player explodes cleanly
      player.destroy();
      expect(player.state).toBe('destroyed');

      expect(() => game.update(1 / 60)).not.toThrow();
      game.destroy();
    });

    it('rejects Tractor Beam capture against Dual Fighter strictly', () => {
      const game = new Game();
      game.startGame();
      game.setState('PLAYING');

      const player = game.getPlayer();
      player.isDual = true;
      player.invulnerableTimer = 0;
      expect(player.isDual).toBe(true);

      const boss = new Enemy({
        id: 777,
        type: EnemyType.BOSS,
        x: player.x,
        y: 100,
      });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      game.getFormationManager().enemies.push(boss);

      const tractorBeam = game.getTractorBeam();
      tractorBeam.activate(boss);
      tractorBeam.update(0.6); // Fully expanded to HOLDING

      // Position player right inside the beam cone
      player.x = boss.x;
      player.y = 250;

      // Resolve collisions
      game.resolveCollisions();

      // Dual fighter must NOT be captured
      expect(player.state).toBe('dual');
      expect(tractorBeam.getState()).toBe('HOLDING'); // Not transitioned to CAPTURING

      game.destroy();
    });

    it('handles player moving out of Tractor Beam cone before capture (successful escape)', () => {
      const tractorBeam = new TractorBeam();
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 80 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;

      tractorBeam.activate(boss);
      tractorBeam.update(0.6); // Expand beam fully to bottom Y = 280

      const player = new Player({ x: 112, y: 250 });

      // Player inside beam cone
      expect(tractorBeam.containsPoint(player.x, player.y)).toBe(true);

      // Player maneuvers horizontally to x = 30 (outside beam)
      player.x = 30;
      expect(tractorBeam.containsPoint(player.x, player.y)).toBe(false);

      // Tractor beam expires naturally after holding duration
      for (let i = 0; i < 300; i++) {
        tractorBeam.update(1 / 60);
      }
      expect(tractorBeam.isActive()).toBe(false);
      expect(player.state).toBe('normal');
    });

    it('handles successful rescue when diving Boss with captured fighter is destroyed', () => {
      const game = new Game();
      game.startGame();
      game.setState('PLAYING');

      const player = game.getPlayer();
      player.state = 'normal';
      player.invulnerableTimer = 0;

      const boss = new Enemy({
        id: 601,
        type: EnemyType.BOSS,
        x: 112,
        y: 120,
      });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.health = 1;

      const capturedFighter = new Enemy({
        id: 602,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 128,
        y: 120,
      });
      capturedFighter.state = EnemyState.DIVING_ESCORT;
      capturedFighter.escortBoss = boss;
      boss.hasCapturedFighter = true;
      boss.capturedFighterEnemy = capturedFighter;
      boss.escortCount = 1;

      game.getFormationManager().enemies.push(boss);
      game.getFormationManager().enemies.push(capturedFighter);

      // Player fires bullet at Boss
      const bullet = game.getBulletManager().firePlayerBullet(boss.x, boss.y + 2);
      expect(bullet).not.toBeNull();

      // Resolve collision
      game.resolveCollisions();

      // 1. Boss destroyed
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);

      // 2. Captured fighter becomes inactive and player enters 'docking' rescue state
      expect(capturedFighter.active).toBe(false);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      // 3. Fast-forward docking convergence
      for (let i = 0; i < 150; i++) {
        player.update(1 / 60);
      }

      // 4. Player successfully converges into Dual Fighter
      expect(player.isDual).toBe(true);
      expect(player.state).toBe('dual');

      game.destroy();
    });

    it('handles turncoat divergence when Boss with captured fighter is destroyed in formation', () => {
      const game = new Game();
      game.startGame();
      game.setState('PLAYING');

      const player = game.getPlayer();
      player.state = 'normal';

      const boss = new Enemy({
        id: 501,
        type: EnemyType.BOSS,
        x: 112,
        y: 60,
      });
      boss.state = EnemyState.IN_FORMATION;
      boss.health = 1;

      const capturedFighter = new Enemy({
        id: 502,
        type: EnemyType.CAPTURED_FIGHTER,
        x: 128,
        y: 60,
      });
      capturedFighter.state = EnemyState.IN_FORMATION;
      capturedFighter.escortBoss = boss;
      boss.hasCapturedFighter = true;
      boss.capturedFighterEnemy = capturedFighter;
      boss.escortCount = 1;

      game.getFormationManager().enemies.push(boss);
      game.getFormationManager().enemies.push(capturedFighter);

      // Player missile hits Boss while Boss is in formation (NOT diving)
      const bullet = game.getBulletManager().firePlayerBullet(boss.x, boss.y + 2);
      expect(bullet).not.toBeNull();

      game.resolveCollisions();

      // Boss destroyed
      expect(boss.health).toBe(0);

      // Captured fighter diverges into hostile turncoat
      expect(capturedFighter.state).toBe(EnemyState.CAPTURED_HOSTILE);
      expect(capturedFighter.escortBoss).toBeNull();

      game.destroy();
    });
  });

  // ==========================================================================
  // Section 3: Rapid Stage Advancement & Challenging Stage Telemetry
  // ==========================================================================

  describe('3. Rapid Stage Advancement & Challenging Stage Telemetry (Stages 1 to 5+)', () => {
    it('verifies challenging stage identification formula isChallengingStage(stage)', () => {
      const game = new Game();

      // Authentic Galaga: Stage 3, 7, 11, 15, 19, 23, 27, 31... are Challenging Stages
      expect(game.isChallengingStage(1)).toBe(false);
      expect(game.isChallengingStage(2)).toBe(false);
      expect(game.isChallengingStage(3)).toBe(true);
      expect(game.isChallengingStage(4)).toBe(false);
      expect(game.isChallengingStage(5)).toBe(false);
      expect(game.isChallengingStage(6)).toBe(false);
      expect(game.isChallengingStage(7)).toBe(true);
      expect(game.isChallengingStage(8)).toBe(false);
      expect(game.isChallengingStage(11)).toBe(true);
      expect(game.isChallengingStage(15)).toBe(true);
      expect(game.isChallengingStage(19)).toBe(true);

      game.destroy();
    });

    it('simulates rapid stage advancement through stages 1 to 5 with accurate challenging hit bonuses', () => {
      const game = new Game();
      game.startGame();

      // --- Stage 1 (Normal) ---
      expect(game.stage).toBe(1);
      game.setState('STAGE_CLEAR');
      game.stateTimer = 2.0;
      game.update(1 / 60); // Advance to Stage 2

      // --- Stage 2 (Normal) ---
      expect(game.stage).toBe(2);
      expect(game.state).toBe('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);
      expect(game.state).toBe('PLAYING');

      game.setState('STAGE_CLEAR');
      game.stateTimer = 2.0;
      game.update(1 / 60); // Advance to Stage 3

      // --- Stage 3 (Challenging Stage 1) ---
      expect(game.stage).toBe(3);
      expect(game.state).toBe('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);
      expect(game.state).toBe('CHALLENGING_STAGE');

      // Simulate scoring 40 hits (perfect bonus)
      game.getScoreManager().recordShotFired(40);
      for (let i = 0; i < 40; i++) {
        game.getScoreManager().recordShotHit(1);
        game.getScoreManager().recordChallengingHit(1);
      }
      expect(game.getScoreManager().challengingHits).toBe(40);

      const scoreBeforeBonus = game.score;

      // Trigger stage clear callback
      if (game.formationManager.onStageClear) {
        game.formationManager.onStageClear();
      }
      expect(game.state).toBe('STAGE_CLEAR');

      // Perfect bonus = 10,000 points
      expect(game.score).toBe(scoreBeforeBonus + 10000);

      // Advance through Stage 3 clear intermission
      game.stateTimer = 3.0;
      game.update(1 / 60);

      // --- Stage 4 (Normal) ---
      expect(game.stage).toBe(4);
      expect(game.state).toBe('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);
      expect(game.state).toBe('PLAYING');

      // Advance to Stage 5
      game.setState('STAGE_CLEAR');
      game.stateTimer = 2.0;
      game.update(1 / 60);

      // --- Stage 5 (Normal) ---
      expect(game.stage).toBe(5);

      // Verify Telemetry
      const sm = game.getScoreManager();
      expect(sm.shotsFired).toBe(40);
      expect(sm.shotsHit).toBe(40);
      expect(sm.getAccuracyPercentage()).toBe(100);

      game.destroy();
    });

    it('accurately evaluates all Challenging Stage bonus point tiers', () => {
      const sm = new ScoreManager();

      // 0 hits -> 0 pts
      expect(sm.addChallengingStageBonus(0).addedScore).toBe(0);

      // Partial hits (e.g. 15 hits -> 15 * 100 = 1500 pts)
      expect(sm.addChallengingStageBonus(15).addedScore).toBe(1500);

      // 39 hits -> 3900 pts
      expect(sm.addChallengingStageBonus(39).addedScore).toBe(3900);

      // 40 hits (perfect) -> 10,000 pts
      expect(sm.addChallengingStageBonus(40).addedScore).toBe(10000);

      // >40 hits (overshoot clamped) -> 10,000 pts
      expect(sm.addChallengingStageBonus(50).addedScore).toBe(10000);
    });
  });

  // ==========================================================================
  // Section 4: Dual Fighter Asymmetrical Destruction & Boundary Clamping
  // ==========================================================================

  describe('4. Dual Fighter Asymmetrical Destruction & Boundary Clamping', () => {
    it('destroys left hull when hit on left side and converts cleanly to single fighter', () => {
      const player = new Player({ x: 100, y: 250 });
      player.isDual = true;
      player.invulnerableTimer = 0;
      expect(player.isDual).toBe(true);

      const explodeSpy = vi.fn();
      player.onExplode = explodeSpy;

      // Hitbox for left hull: x - 16..x - 1 (84..99)
      const leftThreat = { x: 88, y: 246, width: 4, height: 4 };
      const hit = player.hitTestAndDamage(leftThreat);

      expect(hit).toBe(true);
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');
      expect(explodeSpy).toHaveBeenCalledWith(92, 250, true);
    });

    it('destroys right hull when hit on right side and converts cleanly to single fighter', () => {
      const player = new Player({ x: 100, y: 250 });
      player.isDual = true;
      player.invulnerableTimer = 0;

      const explodeSpy = vi.fn();
      player.onExplode = explodeSpy;

      // Hitbox for right hull: x + 1..x + 16 (101..116)
      const rightThreat = { x: 108, y: 246, width: 4, height: 4 };
      const hit = player.hitTestAndDamage(rightThreat);

      expect(hit).toBe(true);
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');
      expect(explodeSpy).toHaveBeenCalledWith(108, 250, true);
    });

    it('destroys both hulls on catastrophic center impact', () => {
      const player = new Player({ x: 100, y: 250, lives: 3 });
      player.isDual = true;
      player.invulnerableTimer = 0;

      // Wide threat spanning both hulls (80..120)
      const wideThreat = { x: 80, y: 246, width: 40, height: 8 };
      const hit = player.hitTestAndDamage(wideThreat);

      expect(hit).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
    });

    it('enforces stricter boundary clamping for Dual Fighter [16, 208] vs Single Fighter [12, 212]', () => {
      const player = new Player({ x: 0, y: 250 });

      // Single fighter left clamp
      player.clampPosition();
      expect(player.x).toBe(12);

      // Single fighter right clamp
      player.x = 300;
      player.clampPosition();
      expect(player.x).toBe(212);

      // Dual fighter left clamp (wider hull)
      player.isDual = true;
      player.x = 0;
      player.clampPosition();
      expect(player.x).toBe(16);

      // Dual fighter right clamp
      player.x = 300;
      player.clampPosition();
      expect(player.x).toBe(208);
    });
  });

  // ==========================================================================
  // Section 5: Delta Spikes, Numerical Stability & Firing Saturation
  // ==========================================================================

  describe('5. Delta Spikes, Numerical Stability & Firing Saturation', () => {
    it('handles extreme dt spikes (dt = 0, dt = -0.016, dt = 5.0s) safely without throwing or NaN', () => {
      const game = new Game();
      game.startGame();
      game.setState('PLAYING');

      // 1. Zero dt
      expect(() => game.update(0)).not.toThrow();

      // 2. Negative dt
      expect(() => game.update(-0.016)).not.toThrow();

      // 3. Huge lag spike (5.0s tab freeze recovery)
      expect(() => game.update(5.0)).not.toThrow();

      // Verify player coordinates remain finite
      expect(Number.isFinite(game.getPlayer().x)).toBe(true);
      expect(Number.isFinite(game.getPlayer().y)).toBe(true);

      game.destroy();
    });

    it('strictly throttles rapid fire trigger saturation (100 fire attempts in 1 tick)', () => {
      const player = new Player({ x: 112, y: 250 });
      let firedBullets = 0;
      player.onFire = (spawns) => {
        firedBullets += spawns.length;
        player.activeMissileCount += spawns.length;
      };

      // Hammer fire trigger 100 times in 1 frame
      for (let i = 0; i < 100; i++) {
        player.attemptFire();
      }

      // Single fighter may only fire 1 missile per trigger, and at most 2 active on screen
      expect(firedBullets).toBe(1); // Only 1 fired due to cooldown timer
      expect(player.canFire).toBe(false);
    });

    it('evaluates Bézier curves gracefully under boundary and degenerate t values', () => {
      const curve = new BezierCurve(
        { x: 10, y: 10 },
        { x: 20, y: 50 },
        { x: 80, y: 50 },
        { x: 100, y: 10 }
      );

      // t < 0
      const neg = curve.evaluate(-0.5);
      expect(Number.isFinite(neg.x)).toBe(true);
      expect(Number.isFinite(neg.y)).toBe(true);

      // t > 1
      const pos = curve.evaluate(1.5);
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);

      // Tangent and heading
      const heading = curve.heading(0.5);
      expect(Number.isFinite(heading)).toBe(true);
    });
  });
});
