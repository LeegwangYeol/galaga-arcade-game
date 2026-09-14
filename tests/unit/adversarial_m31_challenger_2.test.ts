/**
 * Galaga Arcade Web Game — Milestone M31 Adversarial Empirical Verification Suite 2
 * 
 * Adversarial Challenger 2 (m31_challenger_2):
 * Focus Areas:
 * 1. Co-op Tractor Beam Capture & Cross-Player Rescue Mechanics
 * 2. Independent Elimination & Co-op Game Over Lifecycle
 * 3. Zero-GC Invariants & Memory Leak Stress (1,000 Co-op Frames Simulation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState, InputState } from '../../src/types';

describe('Milestone M31 Adversarial Empirical Verification Suite 2 (m31_challenger_2)', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
  });

  // ==========================================================================
  // Section 1: Co-op Tractor Beam Capture & Cross-Player Rescue Mechanics
  // ==========================================================================
  describe('1. Co-op Tractor Beam Capture & Cross-Player Rescue', () => {
    it('captures P1 while P2 remains fully mobile, outside beam, and capable of firing', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(112, 250, 3);
      p2.reset(190, 250, 3);

      const boss = new Enemy({ id: 101, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      game.formationManager.enemies.push(boss);

      game.tractorBeam.activate(boss);
      // Advance tractor beam expansion
      for (let i = 0; i < 40; i++) {
        game.tractorBeam.update(1 / 60);
      }
      expect(game.tractorBeam.isActive()).toBe(true);
      expect(game.tractorBeam.canCapture()).toBe(true);

      // P1 is at x=112 (inside beam), P2 is at x=190 (outside beam)
      expect(game.tractorBeam.containsPoint(p1.x, p1.y)).toBe(true);
      expect(game.tractorBeam.containsPoint(p2.x, p2.y)).toBe(false);

      // Trigger capture check
      game.resolveCollisions();

      expect(p1.state).toBe('capturing');
      expect(p2.state).toBe('normal');

      // P2 must remain completely controllable and capable of firing
      expect(p2.canFire).toBe(true);
      const prevP2X = p2.x;
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
      expect(p2.x).toBeGreaterThan(prevP2X);

      // P2 fires missile
      const bullet = game.bulletManager.firePlayerBullet(p2.x, p2.y - 8, false, 480, 0, undefined, undefined, 'p2');
      expect(bullet).not.toBeNull();
      expect(bullet?.ownerId).toBe('p2');
      expect(game.bulletManager.getActivePlayerBulletCount('p2')).toBe(1);
    });

    it('collapses tractor beam immediately if P2 destroys Boss Galaga mid-capture', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(112, 250, 3);
      p2.reset(190, 250, 3);

      const boss = new Enemy({ id: 102, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.health = 1;
      game.formationManager.enemies.push(boss);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6);
      p1.startCapture(boss.x, boss.y);
      expect(p1.state).toBe('capturing');

      // P2 fires bullet directly at boss
      game.bulletManager.firePlayerBullet(112, 106, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // Boss destroyed
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);

      // Beam must collapse and P1 capture must be cancelled
      expect(game.tractorBeam.isActive()).toBe(false);
      expect(p1.state).toBe('normal');
      expect(p1.isInvulnerable()).toBe(true);
      expect(p1.invulnerableTimer).toBeGreaterThan(0);
    });

    it('awards 1,000 pts rescue bonus to P2 and initiates docking descent when P2 destroys diving Boss holding captured fighter', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 2);
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 103, type: EnemyType.BOSS, x: 140, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 104, type: EnemyType.CAPTURED_FIGHTER, x: 140, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p1ScoreBefore = game.scoreManager.getScore('p1');
      const p2ScoreBefore = game.scoreManager.getScore('p2');

      // P2 fires fatal shot at Boss Galaga
      game.bulletManager.firePlayerBullet(140, 126, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(escort.active).toBe(false);

      // P2 receives +1,000 pts rescue bonus
      expect(game.scoreManager.getScore('p2')).toBeGreaterThanOrEqual(p2ScoreBefore + 1000);
      expect(game.scoreManager.getScore('p1')).toBe(p1ScoreBefore);

      // Empirical verification of docking descent:
      // Rescuer (P2) has active rescued fighter descending from boss position
      expect(p2.rescuedFighter.active).toBe(true);
      expect(p2.state).toBe('docking');
      expect(p2.rescuedFighter.x).toBe(140);
      expect(p2.rescuedFighter.y).toBe(120);

      // Simulate descent frames and verify descent speed
      const initialY = p2.rescuedFighter.y;
      p2.update(0.2);
      expect(p2.rescuedFighter.y).toBeGreaterThan(initialY);
      expect(p2.rescuedFighter.y).toBeCloseTo(initialY + Player.RESCUE_DESCENT_SPEED * 0.2, 1);

      // Complete docking
      for (let i = 0; i < 120; i++) {
        p2.update(1 / 60);
        if (p2.state === 'dual') break;
      }
      expect(p2.state).toBe('dual');
      expect(p2.isDual).toBe(true);
      expect(p2.rescuedFighter.active).toBe(false);
    });

    it('investigates captured fighter state when P1 was captured vs rescued', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 starts with 1 life
      p1.reset(112, 250, 1);
      p2.reset(180, 250, 3);

      const boss = new Enemy({ id: 105, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6);

      p1.startCapture(boss.x, boss.y);
      expect(p1.state).toBe('capturing');

      // Complete capture
      for (let i = 0; i < 180; i++) {
        p1.update(1 / 60);
        if (p1.state === 'captured') break;
      }

      // P1 lost its only life
      expect(p1.lives).toBe(0);
      expect(p1.state).toBe('captured');

      // P2 is still alive and playing
      expect(p2.lives).toBe(3);
      expect(p2.state).toBe('normal');
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
    });
  });

  // ==========================================================================
  // Section 2: Independent Elimination & Co-op Game Over Lifecycle
  // ==========================================================================
  describe('2. Independent Elimination & Co-op Game Over Lifecycle', () => {
    it('does NOT trigger GAME_OVER when P1 loses all 3 lives while P2 has lives', () => {
      game.startGame();
      // Advance past STAGE_INTRO (2.2s = 132 ticks) + INVULNERABLE_DURATION (3.0s = 180 ticks) -> 330 ticks (5.5s)
      for (let i = 0; i < 330; i++) {
        game.update(1 / 60);
      }
      expect(game.state).toBe('PLAYING');

      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      expect(p1.lives).toBe(3);
      expect(p2.lives).toBe(3);
      expect(p1.state).toBe('normal');
      expect(p2.state).toBe('normal');

      // P1 loses life 1
      p1.destroy();
      expect(p1.lives).toBe(2);
      p1.update(Player.DEATH_DURATION + 0.1); // Finish death timer -> respawn
      expect(p1.state).toBe('respawning');
      p1.update(Player.INVULNERABLE_DURATION + 0.1); // Finish respawn timer -> normal
      expect(p1.state).toBe('normal');

      // P1 loses life 2
      p1.destroy();
      expect(p1.lives).toBe(1);
      p1.update(Player.DEATH_DURATION + 0.1);
      expect(p1.state).toBe('respawning');
      p1.update(Player.INVULNERABLE_DURATION + 0.1);
      expect(p1.state).toBe('normal');

      // P1 loses life 3 (all lives exhausted)
      p1.destroy();
      expect(p1.lives).toBe(0);
      p1.update(Player.DEATH_DURATION + 0.1);

      // P1 is eliminated / revive pending
      expect(['destroyed', 'revive_pending']).toContain(p1.state);
      expect(p1.lives).toBe(0);

      // Assert Game state: MUST NOT BE GAME_OVER
      expect(game.state).toBe('PLAYING');
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.playerManager.getActiveCount()).toBe(1);
      expect(game.playerManager.getLivingPlayers()).toHaveLength(1);
      expect(game.playerManager.getLivingPlayers()[0]).toBe(p2);

      // P2 must continue playing normally
      expect(p2.lives).toBe(3);
      expect(p2.state).toBe('normal');
      expect(p2.canFire).toBe(true);

      // P2 can steer and fire
      const prevX = p2.x;
      p2.update(0.1, {
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
      expect(p2.x).toBeLessThan(prevX);
    });

    it('triggers GAME_OVER strictly when BOTH players have exhausted all lives', () => {
      game.startGame();
      for (let i = 0; i < 330; i++) {
        game.update(1 / 60);
      }
      expect(game.state).toBe('PLAYING');

      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // Eliminate P1 completely
      p1.lives = 0;
      p1.destroy();
      p1.update(Player.DEATH_DURATION + 0.1);
      expect(['destroyed', 'revive_pending']).toContain(p1.state);

      expect(game.state).toBe('PLAYING');

      // Eliminate P2 completely
      p2.lives = 0;
      p2.destroy();
      p2.update(Player.DEATH_DURATION + 0.1);
      expect(['destroyed', 'revive_pending']).toContain(p2.state);

      // Advance simulation past 10.0s revive countdown so both players transition from revive_pending to eliminated
      for (let i = 0; i < 630; i++) {
        game.update(1 / 60);
      }

      // Now both players are eliminated
      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.playerManager.getActiveCount()).toBe(0);

      // Verify GAME_OVER state triggered
      expect(game.state).toBe('GAME_OVER');
    });

    it('handles symmetrical reverse elimination: P2 eliminated first, P1 continues until both fall', () => {
      game.startGame();
      for (let i = 0; i < 330; i++) {
        game.update(1 / 60);
      }
      expect(game.state).toBe('PLAYING');

      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // Eliminate P2 first
      p2.lives = 0;
      p2.destroy();
      p2.update(Player.DEATH_DURATION + 0.1);
      expect(['destroyed', 'revive_pending']).toContain(p2.state);

      // P1 is still alive -> No GAME_OVER
      expect(game.state).toBe('PLAYING');
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.playerManager.getActiveCount()).toBe(1);
      expect(game.playerManager.getLivingPlayers()[0]).toBe(p1);

      // Eliminate P1
      p1.lives = 0;
      p1.destroy();
      p1.update(Player.DEATH_DURATION + 0.1);
      expect(['destroyed', 'revive_pending']).toContain(p1.state);

      // Advance simulation past 10.0s revive countdown so both players transition from revive_pending to eliminated
      for (let i = 0; i < 630; i++) {
        game.update(1 / 60);
      }

      // Both eliminated -> GAME_OVER
      expect(game.state).toBe('GAME_OVER');
    });
  });

  // ==========================================================================
  // Section 3: Zero-GC & Memory Leak Stress (1,000 Co-op Frames)
  // ==========================================================================
  describe('3. Zero-GC Invariants & Memory Leak Stress (1,000 Co-op Frames)', () => {
    it('simulates 1,000 co-op frames with rapid concurrent firing, damage, and respawns without pool growth beyond 256', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      const bm = game.bulletManager;
      const pool = bm.getPool();

      // Ensure players are in active normal state initially
      p1.reset(80, 250, 3);
      p2.reset(144, 250, 3);
      p1.update(Player.INVULNERABLE_DURATION + 0.1); // Finish respawn timer
      p2.update(Player.INVULNERABLE_DURATION + 0.1);
      expect(p1.state).toBe('normal');
      expect(p2.state).toBe('normal');

      const initialCap = pool.getCapacity();
      expect(initialCap).toBeLessThanOrEqual(256);

      let p1ShotCount = 0;
      let p2ShotCount = 0;

      const fullInput: InputState = {
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

      // 1,000 continuous simulation ticks at 60 Hz
      for (let frame = 0; frame < 1000; frame++) {
        const dt = 1 / 60;

        // Alternate steering to exercise kinematic boundary clamping
        const steerLeft = (frame % 120) < 60;
        const input: InputState = {
          ...fullInput,
          moveLeft: steerLeft,
          moveRight: !steerLeft,
        };

        // P1 attempts to fire (in normal or dual state)
        const p1CanShootState = p1.state === 'normal' || p1.state === 'dual';
        if (p1CanShootState && bm.canPlayerFire('p1', p1.isDual)) {
          const b = bm.firePlayerBullet(p1.x, p1.y - 8, p1.isDual, 480, 0, undefined, undefined, 'p1');
          if (b) p1ShotCount++;
        }

        // P2 attempts to fire (in normal or dual state)
        const p2CanShootState = p2.state === 'normal' || p2.state === 'dual';
        if (p2CanShootState && bm.canPlayerFire('p2', p2.isDual)) {
          const b = bm.firePlayerBullet(p2.x, p2.y - 8, p2.isDual, 480, 0, undefined, undefined, 'p2');
          if (b) p2ShotCount++;
        }

        // Update bullets and players
        bm.update(dt);
        p1.update(dt, input);
        p2.update(dt, input);

        // Intermittent weapon upgrades & respawns:
        if (frame === 200) {
          p1.isDual = true; // Upgrade P1 to dual
        }
        if (frame === 400) {
          p2.isDual = true; // Upgrade P2 to dual
        }
        if (frame === 600) {
          p1.destroy(); // Destroy P1
        }
        if (frame === 630) {
          p1.respawn(); // Respawn P1
          p1.update(Player.INVULNERABLE_DURATION + 0.1); // Advance past respawn delay
        }
        if (frame === 800) {
          p2.destroy(); // Destroy P2
        }
        if (frame === 830) {
          p2.respawn(); // Respawn P2
          p2.update(Player.INVULNERABLE_DURATION + 0.1);
        }

        // Mid-simulation invariants checked every frame:
        const p1Active = bm.getActivePlayerBulletCount('p1');
        const p2Active = bm.getActivePlayerBulletCount('p2');
        const totalActive = pool.getActiveCount();
        const cap = pool.getCapacity();

        expect(p1Active).toBeLessThanOrEqual(4);
        expect(p2Active).toBeLessThanOrEqual(4);
        expect(totalActive).toBe(p1Active + p2Active);
        expect(cap).toBeLessThanOrEqual(256);

        // Verify no NaN values
        expect(Number.isFinite(p1.x)).toBe(true);
        expect(Number.isFinite(p2.x)).toBe(true);
      }

      // Assert both players fired extensively
      expect(p1ShotCount).toBeGreaterThan(40);
      expect(p2ShotCount).toBeGreaterThan(40);

      // Verify clean clear behavior
      bm.clear();

      // Invariants post-clear:
      expect(pool.getActiveCount()).toBe(0);
      expect(bm.getActivePlayerBulletCount('p1')).toBe(0);
      expect(bm.getActivePlayerBulletCount('p2')).toBe(0);
      expect(pool.getCapacity()).toBeLessThanOrEqual(256);
    });

    it('verifies 10,000 rapid acquire and release cycles produce zero pool leakage', () => {
      const bm = game.bulletManager;
      const pool = bm.getPool();
      const initialCapacity = pool.getCapacity();

      for (let cycle = 0; cycle < 10000; cycle++) {
        const b1 = bm.firePlayerBullet(80, 240, false, 480, 0, undefined, undefined, 'p1');
        const b2 = bm.firePlayerBullet(140, 240, false, 480, 0, undefined, undefined, 'p2');

        expect(b1).not.toBeNull();
        expect(b2).not.toBeNull();

        if (b1) bm.deactivateBullet(b1);
        if (b2) bm.deactivateBullet(b2);
      }

      expect(pool.getActiveCount()).toBe(0);
      expect(bm.getActivePlayerBulletCount('p1')).toBe(0);
      expect(bm.getActivePlayerBulletCount('p2')).toBe(0);
      // Capacity must remain bounded and never grow unbounded
      expect(pool.getCapacity()).toBeLessThanOrEqual(256);
      expect(pool.getCapacity()).toBe(initialCapacity);
    });
  });

  describe('4. Full End-to-End Co-op Tractor Beam Capture & Cross-Player Rescue Flow', () => {
    it('simulates full live capture of P1 by Boss Galaga followed by P2 rescue and docking', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(112, 250, 2);
      p2.reset(180, 250, 3);
      p1.update(Player.INVULNERABLE_DURATION + 0.1);
      p2.update(Player.INVULNERABLE_DURATION + 0.1);

      // Step 1: Boss Galaga initiates Tractor Beam
      const boss = new Enemy({ id: 201, type: EnemyType.BOSS, x: 112, y: 80 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.health = 1;
      game.formationManager.enemies.push(boss);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6);

      // Step 2: P1 is captured in tractor beam
      p1.startCapture(boss.x, boss.y);
      expect(p1.state).toBe('capturing');

      // P2 is free and mobile
      expect(p2.state).toBe('normal');
      expect(p2.canFire).toBe(true);

      // Step 3: P1 ascends along beam to completion (2.5s)
      for (let i = 0; i < 160; i++) {
        p1.update(1 / 60);
        if (p1.state === 'captured') break;
      }

      // Capture completed: p1 lives decremented, onCapturedComplete attached escort, and p1 automatically respawned
      expect(p1.lives).toBe(1); // 2 -> 1 life
      expect(p1.state).toBe('respawning');

      // Escort was attached to Boss via onCapturedComplete callback
      expect(boss.hasCapturedFighter).toBe(true);
      expect(boss.capturedFighterEnemy).toBeDefined();

      const capturedFighter = boss.capturedFighterEnemy!;
      expect(capturedFighter.type).toBe(EnemyType.CAPTURED_FIGHTER);

      // P1 advances past respawn invulnerability to normal single fighter
      p1.update(Player.INVULNERABLE_DURATION + 0.1);
      expect(p1.state).toBe('normal');

      // Step 4: Boss Galaga dives with captured escort
      boss.state = EnemyState.DIVING_ESCORT;
      capturedFighter.state = EnemyState.DIVING_ESCORT;

      // Step 5: P2 destroys Boss Galaga
      const p2ScoreBefore = game.scoreManager.getScore('p2');
      const p1ScoreBefore = game.scoreManager.getScore('p1');

      game.bulletManager.firePlayerBullet(boss.x, boss.y + 6, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // Boss destroyed, escort deactivated
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(capturedFighter.active).toBe(false);

      // P2 awarded 1,000 pts rescue bonus
      expect(game.scoreManager.getScore('p2')).toBeGreaterThanOrEqual(p2ScoreBefore + 1000);
      expect(game.scoreManager.getScore('p1')).toBe(p1ScoreBefore);

      // Rescued fighter begins docking descent towards P2 (the rescuer)
      expect(p2.state).toBe('docking');
      expect(p2.rescuedFighter.active).toBe(true);

      // P1 is NOT docking; P1 continues playing as single fighter
      expect(p1.state).toBe('normal');
      expect(p1.rescuedFighter.active).toBe(false);

      // Step 6: Rescued fighter descends and docks with P2
      const startDescentY = p2.rescuedFighter.y;
      p2.update(0.2);
      expect(p2.rescuedFighter.y).toBeGreaterThan(startDescentY);

      for (let i = 0; i < 120; i++) {
        p2.update(1 / 60);
        if (p2.state === 'dual') break;
      }

      // P2 is now a formidable Dual Fighter!
      expect(p2.state).toBe('dual');
      expect(p2.isDual).toBe(true);
      expect(p2.rescuedFighter.active).toBe(false);

      // P1 remains intact as single fighter
      expect(p1.state).toBe('normal');
      expect(p1.isDual).toBe(false);
    });
  });
});

