/**
 * Adversarial Unit Test Suite for Milestone M33:
 * Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics
 *
 * Focus Areas:
 * 1. Simultaneous & Sequential Player Elimination Invariants
 * 2. Life Donation Race Conditions & Boundary Timing
 * 3. Tactical Tractor Beam Proximity & Dual Immunity Stress
 * 4. Symmetrical Cross-Player Rescue & Turncoat Divergence
 * 5. Zero-GC Simulation (3,000 simulated frames)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

function forceGC(): void {
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
    (globalThis as any).gc();
    return;
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    if (typeof gc === 'function') {
      gc();
      gc();
    }
  } catch {
    // Fallback if V8 sandbox restricts gc
  }
}

describe('Adversarial M33 Stress Suite: Revive, Donation Races & Tractor Rescue', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
    game.setState('PLAYING');
  });

  // ==========================================================================
  // Track 1: Simultaneous & Sequential Player Elimination Invariants
  // ==========================================================================
  describe('1. Simultaneous & Sequential Player Elimination Invariants', () => {
    it('simultaneous explosive wipeout: independent 10s timers, areAllPlayersDead stays false until BOTH expire', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // Simultaneous death on exact same frame with 0 reserve lives
      p1.reset(80, 250, 0);
      p2.reset(144, 250, 0);
      p1.startRevivePending(10.0);
      p2.startRevivePending(10.0);

      expect(p1.state).toBe('revive_pending');
      expect(p2.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBe(10.0);
      expect(p2.reviveTimer).toBe(10.0);
      expect(game.playerManager.areAllPlayersDead()).toBe(false);

      // Advance 5.0 seconds (300 frames of 1/60s)
      for (let i = 0; i < 300; i++) {
        game.update(1 / 60);
      }

      expect(p1.reviveTimer).toBeCloseTo(5.0, 1);
      expect(p2.reviveTimer).toBeCloseTo(5.0, 1);
      expect(p1.state).toBe('revive_pending');
      expect(p2.state).toBe('revive_pending');
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Advance 4.5 more seconds (total 9.5s)
      for (let i = 0; i < 270; i++) {
        game.update(1 / 60);
      }

      expect(p1.reviveTimer).toBeCloseTo(0.5, 1);
      expect(p2.reviveTimer).toBeCloseTo(0.5, 1);
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Advance past 10.0s (0.6s -> total 10.1s)
      for (let i = 0; i < 36; i++) {
        game.update(1 / 60);
      }

      expect(p1.reviveTimer).toBe(0);
      expect(p2.reviveTimer).toBe(0);
      expect(p1.state).toBe('eliminated');
      expect(p2.state).toBe('eliminated');
      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.state).toBe('GAME_OVER');
    });

    it('staggered death: P1 dies at t=0, P2 dies at t=5.0s. At t=10.1s GAME_OVER does NOT trigger until t=15.1s', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 dies at t=0 with 0 lives; P2 is alive with 1 life
      p1.reset(80, 250, 0);
      p1.startRevivePending(10.0);
      p2.reset(144, 250, 1);
      p2.state = 'normal';

      expect(game.playerManager.areAllPlayersDead()).toBe(false);

      // Simulate 5.0 seconds
      for (let i = 0; i < 300; i++) {
        game.update(1 / 60);
      }

      expect(p1.reviveTimer).toBeCloseTo(5.0, 1);
      expect(p2.isAlive()).toBe(true);
      expect(game.playerManager.areAllPlayersDead()).toBe(false);

      // P2 dies at t=5.0s with 0 lives
      p2.lives = 0;
      p2.startRevivePending(10.0);

      // Advance 5.1s (total t=10.1s from start, 5.1s after P2 death)
      for (let i = 0; i < 306; i++) {
        game.update(1 / 60);
      }

      // P1 timer expired at 10.0s and transitioned to eliminated
      expect(p1.reviveTimer).toBe(0);
      expect(p1.state).toBe('eliminated');

      // P2 timer still has ~4.9s remaining!
      expect(p2.reviveTimer).toBeCloseTo(4.9, 1);
      expect(p2.state).toBe('revive_pending');

      // Crucial invariant: GAME_OVER must NOT trigger because P2 is still in revive_pending!
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Advance 4.0s (total t=14.1s, P2 has ~0.9s left)
      for (let i = 0; i < 240; i++) {
        game.update(1 / 60);
      }
      expect(p2.reviveTimer).toBeCloseTo(0.9, 1);
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Advance remaining 1.1s (total t=15.2s, P2 timer expires)
      for (let i = 0; i < 66; i++) {
        game.update(1 / 60);
      }

      expect(p2.reviveTimer).toBe(0);
      expect(p2.state).toBe('eliminated');
      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.state).toBe('GAME_OVER');
    });

    it('empirical audit of Player.updateDestroyed lifecycle: observes state transition when lives drop to 0', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      p1.reset(80, 250, 1);
      p1.destroy(); // lives becomes 0, deathTimer = 0.8
      expect(p1.lives).toBe(0);

      // Advance through death explosion animation (0.8s)
      for (let i = 0; i < 50; i++) {
        p1.update(1 / 60);
      }

      // Verified M33 remediation: in co-op mode, Player.updateDestroyed transitions to 'revive_pending'
      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeGreaterThan(9.0);
      expect(p1.reviveTimer).toBeLessThanOrEqual(10.0);
    });
  });

  // ==========================================================================
  // Track 2: Life Donation Race Conditions & Boundary Timing
  // ==========================================================================
  describe('2. Life Donation Race Conditions & Boundary Timing', () => {
    it('strict rejection when donor has only 1 life (no reserve lives to spare)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 1); // 1 active life, 0 reserve lives
      p2.reset(144, 250, 0);
      p2.startRevivePending(10.0);

      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(false);

      // Invariant: donor lives unchanged, recipient remains in revive_pending with 0 lives
      expect(p1.lives).toBe(1);
      expect(p2.lives).toBe(0);
      expect(p2.state).toBe('revive_pending');
      expect(p2.reviveTimer).toBe(10.0);
    });

    it('rapid double-donation attempt on consecutive frames: only 1 life deducted, recipient respawns cleanly', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 2); // 2 lives (1 active + 1 reserve)
      p2.reset(144, 250, 0);
      p2.startRevivePending(10.0);

      // Frame 1: first donation
      const first = game.playerManager.donateLife('p1');
      expect(first).toBe(true);
      expect(p1.lives).toBe(1);
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');

      // Frame 2: immediate second donation attempt
      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      const second = game.playerManager.donateLife('p1');
      expect(second).toBe(false);

      // Donor cannot accidentally kill itself to 0 lives; recipient stays at 1
      expect(p1.lives).toBe(1);
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');
    });

    it('last-millisecond donation at t = 0.05s: partner rescued, timer cleared, expiration averted', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.startRevivePending(0.05);

      expect(p2.reviveTimer).toBe(0.05);

      // Execute life donation with 0.05s left
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(true);

      expect(p1.lives).toBe(2);
      expect(p2.lives).toBe(1);
      expect(p2.reviveTimer).toBe(0);
      expect(p2.state).toBe('respawning');

      // Advance by 0.1s (past original expiry)
      game.update(0.1);

      // Recipient must NOT be eliminated
      expect(p2.state).not.toBe('eliminated');
      expect(p2.isAlive()).toBe(true);
      expect(game.state).toBe('PLAYING');
    });

    it('donation after elimination (t = 0s, state = "eliminated"): partner can still be revived by donation', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.state = 'eliminated';
      p2.reviveTimer = 0;

      // canDonateLife should allow reviving an eliminated ally if donor has spare lives
      expect(game.playerManager.canDonateLife('p1')).toBe(true);

      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(true);

      expect(p1.lives).toBe(2);
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');
      expect(p2.isInvulnerable()).toBe(true);
      expect(game.scoreManager.getLives('p2')).toBe(1);
    });

    it('donation to destroyed player with 0 lives: revives and respawns partner', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.state = 'destroyed';

      expect(game.playerManager.canDonateLife('p1')).toBe(true);
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(true);

      expect(p1.lives).toBe(2);
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');
    });
  });

  // ==========================================================================
  // Track 3: Tactical Tractor Beam Proximity & Dual Immunity Stress
  // ==========================================================================
  describe('3. Tactical Tractor Beam Proximity & Dual Immunity Stress', () => {
    it('both players are Dual Fighters: tractor beam dive is completely suppressed (returns null)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p1.isDual = true;
      p2.reset(160, 250, 3);
      p2.isDual = true;

      const boss = new Enemy({ id: 201, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;

      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target).toBeNull();
    });

    it('one Dual Fighter, one Single Fighter: Boss ignores closer Dual fighter and targets distant Single fighter', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 is Dual Fighter right under Boss (x = 112, dx = 0)
      p1.reset(112, 250, 3);
      p1.isDual = true;

      // P2 is Single Fighter far away (x = 20, dx = 92)
      p2.reset(20, 250, 3);
      p2.isDual = false;

      const boss = new Enemy({ id: 202, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;

      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target).not.toBeNull();
      expect(target?.id).toBe('p2'); // Targets P2 despite P1 being horizontally right beneath Boss!
    });

    it('symmetrical check: P2 is Dual Fighter close to Boss, P1 is Single Fighter far away', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 is Single Fighter far away (x = 200, dx = 88)
      p1.reset(200, 250, 3);
      p1.isDual = false;

      // P2 is Dual Fighter close to Boss (x = 112, dx = 0)
      p2.reset(112, 250, 3);
      p2.isDual = true;

      const boss = new Enemy({ id: 203, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;

      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target).not.toBeNull();
      expect(target?.id).toBe('p1'); // Targets P1 ignoring closer Dual P2
    });

    it('single fighter is invulnerable or eliminated: suppresses tractor beam targeting (returns null)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p1.isDual = true;
      p2.reset(160, 250, 3);
      p2.isDual = false;
      p2.invulnerableTimer = 3.0; // P2 is temporarily invulnerable

      const boss = new Enemy({ id: 204, type: EnemyType.BOSS, x: 160, y: 50 });
      boss.state = EnemyState.IN_FORMATION;

      // Invulnerable target cannot be captured
      expect(game.formationManager.selectTractorBeamTarget(boss)).toBeNull();

      // Dead target cannot be captured
      p2.invulnerableTimer = 0;
      p2.state = 'eliminated';
      p2.lives = 0;
      expect(game.formationManager.selectTractorBeamTarget(boss)).toBeNull();
    });
  });

  // ==========================================================================
  // Track 4: Symmetrical Cross-Player Rescue & Turncoat Divergence
  // ==========================================================================
  describe('4. Symmetrical Cross-Player Rescue & Turncoat Divergence', () => {
    it('direction A: P1 rescues downed P2 from diving Boss Galaga (1,000 pts bonus, 2.0s invulnerability)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(160, 250, 0);
      p2.state = 'revive_pending';

      const boss = new Enemy({ id: 301, type: EnemyType.BOSS, x: 140, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 302, type: EnemyType.CAPTURED_FIGHTER, x: 140, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p2';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p1ScoreBefore = game.scoreManager.getScore('p1');

      // P1 fires fatal shot at Boss Galaga
      game.bulletManager.firePlayerBullet(140, 126, false, 480, 0, undefined, undefined, 'p1');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(escort.active).toBe(false);

      // Rescuer (P1) earns 1,000 pts rescue bonus + 400 pts diving Boss
      expect(game.scoreManager.getScore('p1')).toBe(p1ScoreBefore + 1400);

      // Downed P2 is liberated into docking descent
      expect(p2.rescuedFighter.active).toBe(true);
      expect(p2.state).toBe('docking');

      // Complete P2 docking descent
      for (let i = 0; i < 150; i++) {
        p2.update(1 / 60);
        if ((p2.state as string) === 'normal') break;
      }

      expect(p2.state).toBe('normal');
      expect(p2.lives).toBe(1);
      expect(p2.invulnerableTimer).toBe(2.0);
    });

    it('direction B: P2 rescues eliminated P1 from diving Boss Galaga (1,000 pts bonus, 2.0s invulnerability)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.state = 'eliminated';
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 303, type: EnemyType.BOSS, x: 100, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 304, type: EnemyType.CAPTURED_FIGHTER, x: 100, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p2ScoreBefore = game.scoreManager.getScore('p2');

      // P2 fires fatal shot at Boss Galaga
      game.bulletManager.firePlayerBullet(100, 126, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(escort.active).toBe(false);

      // Rescuer (P2) earns 1,000 pts rescue bonus + 400 pts diving Boss
      expect(game.scoreManager.getScore('p2')).toBe(p2ScoreBefore + 1400);

      // Downed P1 is liberated into docking descent
      expect(p1.rescuedFighter.active).toBe(true);
      expect(p1.state).toBe('docking');

      // Complete P1 docking descent
      for (let i = 0; i < 150; i++) {
        p1.update(1 / 60);
        if ((p1.state as string) === 'normal') break;
      }

      expect(p1.state).toBe('normal');
      expect(p1.lives).toBe(1);
      expect(p1.invulnerableTimer).toBe(2.0);
    });

    it('turncoat divergence: Boss destroyed in formation -> captive turns into CAPTURED_HOSTILE attacker', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 305, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 306, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 34 });
      escort.state = EnemyState.IN_FORMATION;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      // P2 shoots Boss in formation
      game.bulletManager.firePlayerBullet(112, 56, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // Invariant: Boss destroyed, escort converted into hostile attacker (NOT rescued into docking)
      expect(boss.health).toBe(0);
      expect(escort.state).toBe(EnemyState.CAPTURED_HOSTILE);
      expect(escort.escortBoss).toBeNull();
      expect(escort.active).toBe(true);

      // Neither player should enter docking state
      expect(p1.state).toBe('normal');
      expect(p2.state).toBe('normal');
      expect(p1.rescuedFighter.active).toBe(false);
      expect(p2.rescuedFighter.active).toBe(false);
    });

    it('mid-capture rescue: destroying Boss during active tractor beam cancels capture with 1.0s shield', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 307, type: EnemyType.BOSS, x: 80, y: 80 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.health = 1;

      // P1 is being captured by Boss
      p1.startCapture(80, 80);
      expect(p1.state).toBe('capturing');

      game.tractorBeam.activate(boss);
      game.formationManager.enemies.push(boss);

      // Partner P2 destroys the Boss before capture finishes
      game.bulletManager.firePlayerBullet(80, 86, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // Boss destroyed, tractor beam collapsed, P1 capture cancelled with 1.0s shield
      expect(boss.health).toBe(0);
      expect(game.tractorBeam.isActive()).toBe(false);
      expect(p1.state).toBe('normal');
      expect(p1.invulnerableTimer).toBe(1.0);
    });

    it('both players already Dual Fighters: destroying diving Boss awards 1,000 pts but does not create triple ship', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // Both players are already Dual Fighters
      p1.reset(80, 250, 3);
      p1.isDual = true;
      p2.reset(160, 250, 3);
      p2.isDual = true;

      const boss = new Enemy({ id: 308, type: EnemyType.BOSS, x: 120, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 309, type: EnemyType.CAPTURED_FIGHTER, x: 120, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p1ScoreBefore = game.scoreManager.getScore('p1');

      // P1 destroys diving Boss
      game.bulletManager.firePlayerBullet(120, 126, false, 480, 0, undefined, undefined, 'p1');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(escort.active).toBe(false);

      // Rescuer still receives 1,000 pts rescue bonus
      expect(game.scoreManager.getScore('p1')).toBe(p1ScoreBefore + 1400);

      // Neither player starts docking (they are already dual, cannot form triple ship)
      expect(p1.state).not.toBe('docking');
      expect(p2.state).not.toBe('docking');
      expect(p1.isDual).toBe(true);
      expect(p2.isDual).toBe(true);
    });
  });

  // ==========================================================================
  // Track 5: Zero-GC Simulation (3,000 simulated frames)
  // ==========================================================================
  describe('5. Zero-GC Simulation (3,000 simulated frames)', () => {
    it('runs 3,000 simulated frames of reviving / rescue descent with 0 reference churn and stable heap', () => {
      const p1Initial = game.playerManager.getPlayer('p1');
      const p2Initial = game.playerManager.getPlayer('p2');

      expect(p1Initial).toBeDefined();
      expect(p2Initial).toBeDefined();

      // Warmup JIT compiler and run initial GC
      for (let i = 0; i < 60; i++) {
        game.update(1 / 60);
      }
      forceGC();
      const initialHeap = process.memoryUsage().heapUsed;

      // Simulate 3,000 frames (50 seconds of 60Hz gameplay)
      for (let frame = 0; frame < 3000; frame++) {
        // Periodically trigger state transitions to stress pooling & references
        if (frame % 600 === 0) {
          // P2 dies and starts revive
          const p2 = game.playerManager.getPlayer('p2')!;
          p2.lives = 0;
          p2.startRevivePending(10.0);
        } else if (frame % 600 === 180) {
          // P1 donates life at frame 180 of the cycle (3.0s in)
          const p1 = game.playerManager.getPlayer('p1')!;
          if (p1.lives <= 1) p1.lives = 3;
          game.playerManager.donateLife('p1');
        } else if (frame % 600 === 360) {
          // Trigger docking rescue descent
          const p2 = game.playerManager.getPlayer('p2')!;
          p2.startRescue(112, 60);
        }

        game.update(1 / 60);

        // Verify player object references are immutable and never re-allocated
        expect(game.playerManager.getPlayer('p1')).toBe(p1Initial);
        expect(game.playerManager.getPlayer('p2')).toBe(p2Initial);
      }

      forceGC();
      const finalHeap = process.memoryUsage().heapUsed;
      const heapDriftBytes = finalHeap - initialHeap;
      const heapDriftMB = heapDriftBytes / (1024 * 1024);

      // Verify heap drift is well under 5MB across 3,000 continuous frames
      expect(heapDriftMB).toBeLessThan(5.0);
    });
  });
});
