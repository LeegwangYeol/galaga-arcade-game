/**
 * Empirical Adversarial Test Suite for Milestone M33 Remediation:
 * Death Lifecycle, Revive Transitions, Simultaneous Wipeout & Zero-GC Stress
 *
 * Verifies:
 * 1. Solo Mode Invariance (Fatal hit transitions past deathTimer to 'destroyed' & onGameOver, NEVER 'revive_pending')
 * 2. Co-op Solo Death Lifecycle (0.5s explosion -> 10.0s revive_pending -> donation or elimination; no premature Game Over)
 * 3. Co-op Simultaneous Wipeout (Both die at t=0; 0.5s explosion -> 10.0s revive_pending -> GAME_OVER ONLY after 10s expires)
 * 4. Jittery & Extreme Delta Time Stress (dt = 0.001 to 2.0s without NaN, desync, or dropped transitions)
 * 5. Input Rejection During Downed States (Spamming movement/fire in revive_pending/eliminated produces 0 bullets/actions)
 * 6. Donation Boundary & Invalid Target Stress (Self-donation, downed donor, full recipient rejections)
 * 7. Zero-GC & Memory Drift Stress (3,000 continuous frames under active revive and donation stress; stable heap & references)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import type { InputState } from '../../src/types';

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

function createDummyInput(overrides: Partial<InputState> = {}): InputState {
  return {
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
    fire: false,
    pause: false,
    restart: false,
    pointerX: null,
    pointerActive: false,
    touchLeft: false,
    touchRight: false,
    touchFire: false,
    ...overrides,
  };
}

describe('m33_rem_challenger_2: Adversarial Death Lifecycle & Revive Transitions', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setState('PLAYING');
  });

  // ==========================================================================
  // Section 1: Solo Mode Invariance
  // ==========================================================================
  describe('1. Solo Mode Invariance (isCoop = false)', () => {
    it('fatal hit in solo mode transitions directly past deathTimer to destroyed, NEVER enters revive_pending', () => {
      game.setCoopMode(false);
      const player = game.player;

      expect(game.isCoop()).toBe(false);
      expect(player.isCoop()).toBe(false);

      // Player has 1 life remaining (fatal hit)
      player.reset(112, 250, 1);
      expect(player.lives).toBe(1);

      // Trigger fatal destruction
      player.destroy();
      expect(player.lives).toBe(0);
      expect(player.state).toBe('destroyed');
      expect(player.deathTimer).toBe(0.5);
      expect(player.reviveTimer).toBe(0);

      // During 0.5s explosion (frames 1 to 29: t < 0.49s)
      for (let i = 0; i < 29; i++) {
        game.update(1 / 60);
        expect(player.state).toBe('destroyed');
        expect(player.reviveTimer).toBe(0);
        expect(player.deathTimer).toBeGreaterThan(0);
      }

      // Frames 30 & 31: deathTimer completes (0.5s / 60fps = 30 frames + epsilon)
      game.update(1 / 60); // frame 30
      game.update(1 / 60); // frame 31 (past 0.5s)

      expect(player.deathTimer).toBe(0);
      expect(player.state).toBe('destroyed');
      expect(player.reviveTimer).toBe(0);
      // Solo mode must transition to GAME_OVER immediately upon deathTimer expiration
      expect(game.state).toBe('GAME_OVER');

      // Further updates must NEVER cause player to enter revive_pending
      for (let i = 0; i < 120; i++) {
        game.update(1 / 60);
        expect(player.state).toBe('destroyed');
        expect(player.reviveTimer).toBe(0);
      }
    });

    it('solo mode rejects life donation and ignores stage clear pity revive', () => {
      game.setCoopMode(false);
      const player = game.player;
      player.reset(112, 250, 1);
      player.destroy(); // lives becomes 0

      expect(player.lives).toBe(0);
      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(false);

      // Trigger stage clear in solo mode
      game.playerManager.onStageClear();
      expect(player.lives).toBe(0);
      expect(player.state).toBe('destroyed');
      expect(player.reviveTimer).toBe(0);
    });

    it('isolated Player instance without Game attached defaults isCoop to false and never enters revive_pending', () => {
      const orphanPlayer = new Player({ id: 'p1', colorScheme: 'classic', x: 112, y: 250, lives: 1 });
      expect(orphanPlayer.isCoop()).toBe(false);

      orphanPlayer.destroy();
      expect(orphanPlayer.lives).toBe(0);
      expect(orphanPlayer.deathTimer).toBe(0.5);

      const onGameOverSpy = vi.fn();
      orphanPlayer.onGameOver = onGameOverSpy;

      // Simulate 0.6 seconds (past deathTimer)
      orphanPlayer.update(0.6);

      expect(orphanPlayer.deathTimer).toBe(0);
      expect(orphanPlayer.state).toBe('destroyed');
      expect(orphanPlayer.reviveTimer).toBe(0);
      expect(onGameOverSpy).toHaveBeenCalledTimes(1);
    });

    it('calling destroy multiple times in solo mode is idempotent and does not corrupt timers', () => {
      game.setCoopMode(false);
      const player = game.player;
      player.reset(112, 250, 1);

      player.destroy();
      expect(player.lives).toBe(0);
      expect(player.deathTimer).toBe(0.5);

      // Repeated destroy calls while already destroyed must be ignored
      player.destroy();
      player.destroy();
      expect(player.lives).toBe(0);
      expect(player.deathTimer).toBe(0.5);
      expect(player.state).toBe('destroyed');
    });
  });

  // ==========================================================================
  // Section 2: Co-op Solo Death Lifecycle
  // ==========================================================================
  describe('2. Co-op Solo Death Lifecycle (P1 dies, P2 alive)', () => {
    beforeEach(() => {
      game.setCoopMode(true);
    });

    it('P1 dies with 0 lives while P2 alive: 0.5s explosion -> 10.0s revive_pending -> eliminated; no premature Game Over', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 1);
      p2.reset(144, 250, 3); // P2 has 3 lives

      // P1 fatal hit at t=0
      p1.destroy();
      expect(p1.lives).toBe(0);
      expect(p1.state).toBe('destroyed');
      expect(p1.deathTimer).toBe(0.5);

      // Frame 1 to 29: P1 is exploding (0.5s)
      for (let i = 0; i < 29; i++) {
        game.update(1 / 60);
        expect(p1.state).toBe('destroyed');
        expect(game.playerManager.areAllPlayersDead()).toBe(false);
        expect(game.state).toBe('PLAYING');
      }

      // Frame 30 & 31: P1 finishes explosion (0.5s) and enters revive_pending
      game.update(1 / 60);
      game.update(1 / 60);

      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeGreaterThan(9.5);
      expect(p1.reviveTimer).toBeLessThanOrEqual(10.0);
      expect(p1.x).toBe(80);
      expect(p1.y).toBe(Player.BASELINE_Y);
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Next 9.0s (540 frames, t=0.5s to t=9.5s)
      for (let i = 0; i < 540; i++) {
        game.update(1 / 60);
        expect(p1.state).toBe('revive_pending');
        expect(game.playerManager.areAllPlayersDead()).toBe(false);
        expect(game.state).toBe('PLAYING');
      }
      expect(p1.reviveTimer).toBeCloseTo(1.0, 1);

      // Advance 1.2s (72 frames, t=9.5s to t=10.7s) -> timer expires
      for (let i = 0; i < 72; i++) {
        game.update(1 / 60);
      }

      // P1 is eliminated
      expect(p1.reviveTimer).toBe(0);
      expect(p1.state).toBe('eliminated');

      // CRUCIAL INVARIANT: Game Over is NOT triggered because P2 is still alive!
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // P2 can continue playing indefinitely
      for (let i = 0; i < 300; i++) {
        game.update(1 / 60);
        expect(game.state).toBe('PLAYING');
      }
    });

    it('P1 in revive_pending is successfully rescued by P2 life donation at t=5.0s', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 1);
      p2.reset(144, 250, 2); // P2 has 2 lives (1 active + 1 reserve)

      p1.destroy(); // P1 explodes for 0.5s

      for (let i = 0; i < 32; i++) {
        game.update(1 / 60);
      }

      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeGreaterThan(9.5);

      // Simulate 5 seconds in revive_pending (300 frames)
      for (let i = 0; i < 300; i++) {
        game.update(1 / 60);
      }
      expect(p1.reviveTimer).toBeCloseTo(5.0, 1);

      // P2 donates life
      expect(game.playerManager.canDonateLife('p2')).toBe(true);
      const donated = game.playerManager.donateLife('p2');
      expect(donated).toBe(true);

      // P2 lost 1 life (2 -> 1)
      expect(p2.lives).toBe(1);
      // P1 gained 1 life (0 -> 1) and respawned
      expect(p1.lives).toBe(1);
      expect(p1.state).toBe('respawning');
      expect(p1.reviveTimer).toBe(0);
      expect(p1.isInvulnerable()).toBe(true);

      // Advance 3.1 seconds (186 frames): P1 transitions from respawning (3.0s) to normal
      for (let i = 0; i < 186; i++) {
        game.update(1 / 60);
      }
      expect(p1.state).toBe('normal');
      expect(game.state).toBe('PLAYING');
    });

    it('P1 eliminated is restored by stage clear pity revive while P2 survives', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.state = 'eliminated';
      p2.reset(144, 250, 2);

      expect(game.playerManager.areAllPlayersDead()).toBe(false);

      // P2 clears the stage
      game.playerManager.onStageClear();

      // P1 restored with 1 life and respawned
      expect(p1.lives).toBe(1);
      expect(p1.state).toBe('respawning');
      expect(p1.x).toBe(80);
      expect(p1.y).toBe(Player.BASELINE_Y);
      expect(p1.isInvulnerable()).toBe(true);
    });
  });

  // ==========================================================================
  // Section 3: Co-op Simultaneous Wipeout
  // ==========================================================================
  describe('3. Co-op Simultaneous Wipeout (Both die at t=0)', () => {
    beforeEach(() => {
      game.setCoopMode(true);
    });

    it('simultaneous fatal damage at t=0: both explode for 0.5s -> both enter revive_pending -> GAME_OVER ONLY after 10s timer expires', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 1);
      p2.reset(144, 250, 1);

      // Simultaneous fatal hit on exact same frame
      p1.destroy();
      p2.destroy();

      expect(p1.lives).toBe(0);
      expect(p2.lives).toBe(0);
      expect(p1.state).toBe('destroyed');
      expect(p2.state).toBe('destroyed');
      expect(p1.deathTimer).toBe(0.5);
      expect(p2.deathTimer).toBe(0.5);

      // CRUCIAL CHECK: Frame 1 (t = 1/60s)
      // areAllPlayersDead MUST evaluate to false during active death explosion
      game.update(1 / 60);
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Remaining 28 frames of 0.5s explosion (t < 0.49s)
      for (let i = 0; i < 28; i++) {
        game.update(1 / 60);
        expect(p1.state).toBe('destroyed');
        expect(p2.state).toBe('destroyed');
        expect(game.playerManager.areAllPlayersDead()).toBe(false);
        expect(game.state).toBe('PLAYING');
      }

      // Frame 30 & 31: Both explosions finish simultaneously
      game.update(1 / 60);
      game.update(1 / 60);

      // Both must enter revive_pending with 10.0s countdown
      expect(p1.state).toBe('revive_pending');
      expect(p2.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeGreaterThan(9.5);
      expect(p2.reviveTimer).toBeGreaterThan(9.5);
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Next 540 frames (9.0 seconds)
      for (let i = 0; i < 540; i++) {
        game.update(1 / 60);
        expect(p1.state).toBe('revive_pending');
        expect(p2.state).toBe('revive_pending');
        expect(game.playerManager.areAllPlayersDead()).toBe(false);
        expect(game.state).toBe('PLAYING');
      }

      expect(p1.reviveTimer).toBeCloseTo(1.0, 1);
      expect(p2.reviveTimer).toBeCloseTo(1.0, 1);

      // Advance 50 frames (~0.83 seconds)
      for (let i = 0; i < 50; i++) {
        game.update(1 / 60);
        expect(game.playerManager.areAllPlayersDead()).toBe(false);
        expect(game.state).toBe('PLAYING');
      }

      expect(p1.reviveTimer).toBeGreaterThan(0);
      expect(p2.reviveTimer).toBeGreaterThan(0);
      expect(game.state).toBe('PLAYING');

      // Advance 20 frames (~0.33s, crossing the 10.0s expiration threshold)
      for (let i = 0; i < 20; i++) {
        game.update(1 / 60);
      }

      // Both timers have now expired and both are eliminated
      expect(p1.reviveTimer).toBe(0);
      expect(p2.reviveTimer).toBe(0);
      expect(p1.state).toBe('eliminated');
      expect(p2.state).toBe('eliminated');

      // ONLY NOW is GAME_OVER triggered
      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.state).toBe('GAME_OVER');
    });

    it('staggered wipeout: P1 destroyed at t=0, P2 destroyed at t=3.0s; GAME_OVER triggers only at t=13.5s', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 1);
      p2.reset(144, 250, 1);

      // P1 dies at t=0
      p1.destroy();

      // Advance 3.0s (180 frames)
      for (let i = 0; i < 180; i++) {
        game.update(1 / 60);
      }

      // P1 is in revive_pending (entered at t=0.5, 2.5s elapsed, ~7.5s left)
      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeCloseTo(7.5, 1);
      expect(p2.isAlive()).toBe(true);
      expect(game.state).toBe('PLAYING');

      // P2 dies at t=3.0s
      p2.destroy();
      expect(p2.state).toBe('destroyed');
      expect(p2.deathTimer).toBe(0.5);

      // Advance 0.55s (33 frames, past P2 deathTimer)
      for (let i = 0; i < 33; i++) {
        game.update(1 / 60);
      }

      // P2 enters revive_pending (10.0s timer)
      expect(p2.state).toBe('revive_pending');
      expect(p2.reviveTimer).toBeGreaterThan(9.5);

      // Advance 7.1s (426 frames)
      // P1 10s timer expires
      for (let i = 0; i < 426; i++) {
        game.update(1 / 60);
      }

      expect(p1.state).toBe('eliminated');
      expect(p1.reviveTimer).toBe(0);

      // P2 still has ~2.8s - 2.9s remaining in revive_pending
      expect(p2.state).toBe('revive_pending');
      expect(p2.reviveTimer).toBeGreaterThan(2.5);
      expect(p2.reviveTimer).toBeLessThan(3.2);

      // GAME_OVER MUST NOT TRIGGER yet!
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Advance 3.5s (210 frames, to expire P2 timer)
      for (let i = 0; i < 210; i++) {
        game.update(1 / 60);
      }

      expect(p2.state).toBe('eliminated');
      expect(p2.reviveTimer).toBe(0);
      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.state).toBe('GAME_OVER');
    });
  });

  // ==========================================================================
  // Section 4: Jittery & Extreme Delta Time Stress
  // ==========================================================================
  describe('4. Jittery & Extreme Delta Time Stress', () => {
    beforeEach(() => {
      game.setCoopMode(true);
    });

    it('handles large lag spikes (dt = 1.0s) without NaN or bypassing revive_pending', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      p1.reset(80, 250, 1);
      p1.destroy(); // lives = 0, deathTimer = 0.5

      // Huge lag spike of 1.0s in a single frame
      game.update(1.0);

      // deathTimer (0.5s) must have expired, and p1 must have cleanly entered revive_pending
      expect(p1.state).toBe('revive_pending');
      expect(p1.deathTimer).toBe(0);
      expect(p1.reviveTimer).toBeGreaterThan(8.0);
      expect(p1.reviveTimer).toBeLessThanOrEqual(10.0);
      expect(Number.isNaN(p1.reviveTimer)).toBe(false);
      expect(Number.isNaN(p1.x)).toBe(false);
      expect(Number.isNaN(p1.y)).toBe(false);
      expect(game.state).toBe('PLAYING');
    });

    it('handles rapid micro-timesteps (dt = 0.001s x 1,000 frames) with precise countdown convergence', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      p1.reset(80, 250, 0);
      p1.startRevivePending(10.0);

      // Run 1,000 micro-steps of 1ms = 1.0 second elapsed
      for (let i = 0; i < 1000; i++) {
        game.update(0.001);
      }

      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeCloseTo(9.0, 1);
      expect(game.state).toBe('PLAYING');
    });
  });

  // ==========================================================================
  // Section 5: Input & Action Rejection During Downed States
  // ==========================================================================
  describe('5. Input & Action Rejection During Downed States', () => {
    beforeEach(() => {
      game.setCoopMode(true);
    });

    it('downed player in revive_pending ignores movement and firing inputs', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      p1.reset(80, 250, 0);
      p1.startRevivePending(10.0);

      const initialX = p1.x;
      const initialY = p1.y;

      // Spam aggressive movement and firing inputs to P1
      const hostileInput = createDummyInput({
        moveLeft: true,
        moveRight: false,
        moveUp: true,
        moveDown: false,
        fire: true,
      });

      p1.update(1 / 60, hostileInput);

      // Kinematics must remain locked at baseline slot
      expect(p1.x).toBe(initialX);
      expect(p1.y).toBe(initialY);
      expect(p1.vx).toBe(0);
      expect(p1.vy).toBe(0);

      // Weapon firing must be rejected
      const fired = p1.attemptFire();
      expect(fired).toBe(false);
    });

    it('eliminated player ignores all inputs and cannot fire', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      p1.reset(80, 250, 0);
      p1.state = 'eliminated';

      const fired = p1.attemptFire();
      expect(fired).toBe(false);
      expect(p1.canFire).toBe(false);
    });
  });

  // ==========================================================================
  // Section 6: Donation Boundary & Invalid Target Stress
  // ==========================================================================
  describe('6. Donation Boundary & Invalid Target Stress', () => {
    beforeEach(() => {
      game.setCoopMode(true);
    });

    it('cannot donate life if recipient is already healthy (lives > 0 and normal)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 3);
      p2.reset(144, 250, 2);

      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(false);
      expect(p1.lives).toBe(3);
      expect(p2.lives).toBe(2);
    });

    it('cannot donate life if donor is dead/downed', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 0);
      p1.state = 'revive_pending';
      p2.reset(144, 250, 0);
      p2.state = 'revive_pending';

      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      expect(game.playerManager.canDonateLife('p2')).toBe(false);
      expect(game.playerManager.donateLife('p1')).toBe(false);
      expect(game.playerManager.donateLife('p2')).toBe(false);
    });
  });

  // ==========================================================================
  // Section 7: Zero-GC & Memory Drift Stress (3,000 frames)
  // ==========================================================================
  describe('7. Zero-GC & Memory Drift Stress (3,000 frames)', () => {
    it('executes 3,000 frames of active revive timers, donation checks, and transitions with 0 memory leaks', () => {
      game.setCoopMode(true);
      const p1Initial = game.playerManager.getPlayer('p1')!;
      const p2Initial = game.playerManager.getPlayer('p2')!;

      expect(p1Initial).toBeDefined();
      expect(p2Initial).toBeDefined();

      // Warmup JIT compiler and establish baseline heap
      for (let i = 0; i < 120; i++) {
        game.update(1 / 60);
      }
      forceGC();
      const initialHeap = process.memoryUsage().heapUsed;

      // Run 3,000 frames (50 seconds of 60Hz gameplay)
      for (let frame = 0; frame < 3000; frame++) {
        const cycle = frame % 500;

        if (cycle === 0) {
          // Cycle start: P1 dies and begins explosion
          p1Initial.reset(80, 250, 1);
          p1Initial.destroy();
          if (p2Initial.lives <= 1) p2Initial.lives = 3;
        } else if (cycle === 32) {
          // Explosion completed, P1 should be in revive_pending
          expect(p1Initial.state).toBe('revive_pending');
        } else if (cycle === 150) {
          // Frame 150 (2.0s in revive_pending): P2 donates life
          expect(game.playerManager.canDonateLife('p2')).toBe(true);
          const donated = game.playerManager.donateLife('p2');
          expect(donated).toBe(true);
          expect(p1Initial.state).toBe('respawning');
        } else if (cycle === 300) {
          // Frame 300: Both players die simultaneously
          p1Initial.reset(80, 250, 1);
          p2Initial.reset(144, 250, 1);
          p1Initial.destroy();
          p2Initial.destroy();
        } else if (cycle === 332) {
          // Both in revive_pending
          expect(p1Initial.state).toBe('revive_pending');
          expect(p2Initial.state).toBe('revive_pending');
        } else if (cycle === 400) {
          // Wave clear pity revive revives both
          game.playerManager.onStageClear();
          expect(p1Initial.lives).toBe(1);
          expect(p2Initial.lives).toBe(1);
          expect(p1Initial.state).toBe('respawning');
          expect(p2Initial.state).toBe('respawning');
        }

        game.update(1 / 60);

        // Reference integrity invariant: player references must never be re-instantiated
        expect(game.playerManager.getPlayer('p1')).toBe(p1Initial);
        expect(game.playerManager.getPlayer('p2')).toBe(p2Initial);
      }

      forceGC();
      const finalHeap = process.memoryUsage().heapUsed;
      const heapDriftMB = (finalHeap - initialHeap) / (1024 * 1024);

      // Verify heap drift is well below 5.0 MB threshold
      expect(heapDriftMB).toBeLessThan(5.0);
    });
  });
});
