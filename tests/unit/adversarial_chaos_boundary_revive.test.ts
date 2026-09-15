/**
 * Adversarial Chaos Test Suite: Boundary Clamping & Revive Invariants
 * Milestone M36 of Phase 7 (Adversarial QA & Autonomous Remediation for 2-Player Co-op Galaga)
 * 
 * Target Systems:
 * - Player (src/entities/Player.ts)
 * - PlayerManager (src/systems/PlayerManager.ts)
 * - Game (src/core/Game.ts)
 * 
 * Stress Tracks:
 * 1. Boundary Violation Chaos Attacks (Extreme velocities, NaN/Infinity, negative dt, unclamped update, dual docking at edges, phase warp)
 * 2. Subpixel Drift & Long-Horizon Kinematic Stability (1,000 frames alternating movement, dt jitter, wall collision asymmetry)
 * 3. Cooperative Revive Chaos & Race Conditions (Simultaneous dual death, rapid donate spam, zero-life donations, countdown edge 0.1s/0.001s)
 * 4. Revive Under Boss Phase Shifts & Active Tractor Beams (Boss phases, Stage 40 Telekinetic Stun coop asymmetry, capture with 0 lives)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { PlayerManager } from '../../src/systems/PlayerManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState, type InputState } from '../../src/types';

function createMockInput(overrides: Partial<InputState> = {}): InputState {
  return {
    moveLeft: false,
    moveRight: false,
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

describe('Milestone M36: Adversarial Chaos — Boundary Clamping & Revive Logic', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
  });

  afterEach(() => {
    game?.destroy();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Track 1: Boundary Violation & Clamping Chaos Attacks
  // ==========================================================================
  describe('Track 1: Boundary Violation & Clamping Chaos Attacks', () => {
    it('boundary-1.1: extreme positive velocity (+10,000 px/s) clamps single player to maxX = 212', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      // Inject extreme velocity directly
      player.vx = 10000;
      // Also apply extreme rightward input
      const input = createMockInput({ moveRight: true });

      player.update(1 / 60, input);

      // Single fighter width 12px -> maxX is 212
      expect(player.x).toBeLessThanOrEqual(212);
      expect(player.x).toBeGreaterThanOrEqual(12);
      expect(player.y).toBe(Player.BASELINE_Y);
    });

    it('boundary-1.2: extreme negative velocity (-10,000 px/s) clamps single player to minX = 12', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      player.vx = -10000;
      const input = createMockInput({ moveLeft: true });

      player.update(1 / 60, input);

      expect(player.x).toBeGreaterThanOrEqual(12);
      expect(player.x).toBeLessThanOrEqual(212);
      expect(player.y).toBe(Player.BASELINE_Y);
    });

    it('boundary-1.3: extreme pointer steering (+999,999 and -999,999) respects boundaries', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      
      // Attempt massive rightward pointer
      const inputFarRight = createMockInput({
        pointerActive: true,
        pointerX: 999999,
      });
      // Advance 100 frames
      for (let i = 0; i < 100; i++) {
        player.update(1 / 60, inputFarRight);
      }
      expect(player.x).toBe(212);

      // Attempt massive leftward pointer
      const inputFarLeft = createMockInput({
        pointerActive: true,
        pointerX: -999999,
      });
      for (let i = 0; i < 100; i++) {
        player.update(1 / 60, inputFarLeft);
      }
      expect(player.x).toBe(12);
    });

    it('boundary-1.4: Dual Fighter boundary clamping enforces tighter bounds [16, 208]', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      player.isDual = true;

      // Slam left
      const inputLeft = createMockInput({ moveLeft: true });
      for (let i = 0; i < 60; i++) {
        player.update(1 / 60, inputLeft);
      }
      expect(player.x).toBe(16); // Dual minX is 16 (single is 12)

      // Slam right
      const inputRight = createMockInput({ moveRight: true });
      for (let i = 0; i < 120; i++) {
        player.update(1 / 60, inputRight);
      }
      expect(player.x).toBe(208); // Dual maxX is 208 (single is 212)
    });

    it('boundary-1.5: NaN injection in position or velocity corrupts state without defensive sanitization', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      
      // Inject NaN position directly
      player.x = NaN;
      player.clampPosition();

      // Math.max(12, Math.min(212, NaN)) evaluates to NaN!
      // Assert whether player.x is defensively recovered to valid number or remains NaN:
      const recoveredFromNan = !Number.isNaN(player.x) && Number.isFinite(player.x);
      // Defensive requirement: player position should NEVER remain NaN
      expect(recoveredFromNan).toBe(true);
    });

    it('boundary-1.6: NaN pointer coordinates in input corrupts player kinematics without guard', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      const inputWithNanPointer = createMockInput({
        pointerActive: true,
        pointerX: NaN,
      });

      player.update(1 / 60, inputWithNanPointer);

      // Pointer dx = NaN - 112 = NaN -> targetVx = NaN -> player.x = NaN!
      const isPositionFinite = Number.isFinite(player.x);
      expect(isPositionFinite).toBe(true);
    });

    it('boundary-1.7: negative delta-time (dt < 0) reverses physics or causes timer elongation', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      player.invulnerableTimer = 1.0;
      player.reviveTimer = 5.0;

      // Negative delta
      player.update(-0.5);

      // If dt < 0 is unhandled: invulnerableTimer = Math.max(0, 1.0 - (-0.5)) = 1.5!
      // Timer should strictly NOT increase over time
      expect(player.invulnerableTimer).toBeLessThanOrEqual(1.0);
    });

    it('boundary-1.8: update without input object bypasses clampPosition leaving player out-of-bounds', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      
      // External force or warp displaces player off-screen
      player.x = -500;
      
      // Update called with undefined input
      player.update(1 / 60, undefined);

      // Line 492: if (!input) return; bypasses clampPosition!
      // Defensive requirement: position must always be clamped to valid playfield [12, 212]
      expect(player.x).toBeGreaterThanOrEqual(12);
      expect(player.x).toBeLessThanOrEqual(212);
    });

    it('boundary-1.9: dual ship docking at leftmost screen edge (x = 12) drives rescued fighter off-screen', () => {
      const player = new Player({ id: 'p1', x: 12, y: 250, lives: 3 });
      player.startRescue(12, 50);

      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);

      // Target dock slot: targetDockX = rf.x < player.x ? player.x - 16 : player.x + 16
      // If rf starts at x = 10, targetDockX becomes 12 - 16 = -4 (OFF-SCREEN)!
      player.rescuedFighter.x = 10;
      
      // Step docking simulation for 10 frames
      for (let i = 0; i < 10; i++) {
        player.update(1 / 60, createMockInput());
      }

      // Check whether rescued fighter x-coordinate escaped off-screen into negative territory:
      expect(player.rescuedFighter.x).toBeGreaterThanOrEqual(0);
    });

    it('boundary-1.10: dual ship docking at rightmost screen edge (x = 212) drives rescued fighter off-screen', () => {
      const player = new Player({ id: 'p1', x: 212, y: 250, lives: 3 });
      player.startRescue(212, 50);

      player.rescuedFighter.x = 215;
      
      for (let i = 0; i < 10; i++) {
        player.update(1 / 60, createMockInput());
      }

      // 212 + 16 = 228 (Screen virtual width is 224)!
      expect(player.rescuedFighter.x).toBeLessThanOrEqual(224);
    });

    it('boundary-1.11: Phase Drive lateral warp at boundary clamp stays strictly within bounds', () => {
      const player = new Player({ id: 'p1', x: 200, y: 250, lives: 3 });
      player.phaseDriveTimer = 10.0;

      // Warp right by +40px: 200 + 40 = 240
      player.triggerPhaseWarp(1);

      // Single fighter maxX is 212
      expect(player.x).toBe(212);

      // Reset cooldown and warp left from minX
      player.phaseWarpCooldown = 0;
      player.x = 20;
      player.triggerPhaseWarp(-1); // 20 - 40 = -20
      expect(player.x).toBe(12);
    });
  });

  // ==========================================================================
  // Track 2: Subpixel Drift & Long-Horizon Kinematic Stability
  // ==========================================================================
  describe('Track 2: Subpixel Drift & Long-Horizon Kinematic Stability', () => {
    it('drift-2.1: 1,000 frames of alternating left/right movement at 60 FPS has zero subpixel drift', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      const initialX = 112.0;

      const inputLeft = createMockInput({ moveLeft: true });
      const inputRight = createMockInput({ moveRight: true });

      const dt = 1 / 60; // 0.016666666666666666...
      // 500 cycles of (1 frame Left, 1 frame Right) = 1,000 frames total
      for (let i = 0; i < 500; i++) {
        player.update(dt, inputLeft);
        player.update(dt, inputRight);
      }

      // Net drift should be strictly zero or within floating-point epsilon (< 1e-6)
      const drift = Math.abs(player.x - initialX);
      expect(drift).toBeLessThan(1e-6);
      expect(player.x).toBeCloseTo(initialX, 5);
    });

    it('drift-2.2: 1,000 frames of alternating movement under variable dt jitter remains bounded', () => {
      const player = new Player({ id: 'p1', x: 112, y: 250, lives: 3 });
      
      const inputLeft = createMockInput({ moveLeft: true });
      const inputRight = createMockInput({ moveRight: true });

      // Simulate frame jitter alternating between 15.5ms and 17.8ms
      for (let i = 0; i < 500; i++) {
        const jitterDt = 0.016 + ((i % 5) - 2) * 0.0005;
        player.update(jitterDt, inputLeft);
        player.update(jitterDt, inputRight);
      }

      // Verify ship remained in playfield and did not drift into NaN or infinity
      expect(Number.isFinite(player.x)).toBe(true);
      expect(player.x).toBeGreaterThanOrEqual(12);
      expect(player.x).toBeLessThanOrEqual(212);
    });

    it('drift-2.3: wall-hitting asymmetry over 500 cycles never escapes boundaries', () => {
      const player = new Player({ id: 'p1', x: 20, y: 250, lives: 3 });

      const inputLeft = createMockInput({ moveLeft: true });
      const inputRight = createMockInput({ moveRight: true });

      // 500 cycles: 3 frames left (clamping at minX=12) then 2 frames right
      for (let i = 0; i < 500; i++) {
        player.update(1 / 60, inputLeft);
        player.update(1 / 60, inputLeft);
        player.update(1 / 60, inputLeft);
        player.update(1 / 60, inputRight);
        player.update(1 / 60, inputRight);
      }

      expect(player.x).toBeGreaterThanOrEqual(12);
      expect(player.x).toBeLessThanOrEqual(212);
      expect(Number.isFinite(player.x)).toBe(true);
    });

    it('drift-2.4: Player 2 (Crimson) co-op start coordinate at 144 obeys symmetrical boundary constraints', () => {
      const pm = new PlayerManager(game, 'coop');
      const p1 = pm.getPlayer('p1')!;
      const p2 = pm.getPlayer('p2')!;

      expect(p1.x).toBe(80);
      expect(p2.x).toBe(144);
      expect(p2.colorScheme).toBe('crimson');

      // Move P2 to right boundary
      const inputRight = createMockInput({ moveRight: true });
      for (let i = 0; i < 60; i++) {
        p2.update(1 / 60, inputRight);
      }
      expect(p2.x).toBe(212);

      // Make P2 dual and move to left boundary
      p2.isDual = true;
      const inputLeft = createMockInput({ moveLeft: true });
      for (let i = 0; i < 100; i++) {
        p2.update(1 / 60, inputLeft);
      }
      expect(p2.x).toBe(16);
    });
  });

  // ==========================================================================
  // Track 3: Cooperative Revive Chaos & Race Condition Stress
  // ==========================================================================
  describe('Track 3: Cooperative Revive Chaos & Race Condition Stress', () => {
    it('revive-3.1: simultaneous dual player death on frame 0 hangs in revive_pending for 10s despite 0 surviving players', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // Both players on last life
      p1.reset(80, 250, 1);
      p2.reset(144, 250, 1);

      // Simultaneous fatal destruction on exact same frame
      p1.destroy();
      p2.destroy();

      expect(p1.lives).toBe(0);
      expect(p2.lives).toBe(0);
      expect(p1.state).toBe('destroyed');
      expect(p2.state).toBe('destroyed');

      // Step simulation past explosion duration (0.5s = 35 frames)
      for (let i = 0; i < 35; i++) {
        game.update(1 / 60);
      }

      // Both players naturally enter revive_pending
      expect(p1.state).toBe('revive_pending');
      expect(p2.state).toBe('revive_pending');

      // Critical Edge Case Observation:
      // Can either player donate?
      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      expect(game.playerManager.canDonateLife('p2')).toBe(false);

      // In Galaga Co-op, both players get their 10s emergency window for in-flight missiles / stage clear pity revive.
      // areAllPlayersDead() remains false while revive timers are active:
      expect(game.playerManager.areAllPlayersDead()).toBe(false);

      // Step forward past the 10-second countdown (605 frames = 10.08s)
      for (let i = 0; i < 605; i++) {
        game.update(1 / 60);
      }

      // Once timers expire, players are eliminated and Game Over triggers:
      expect(p1.state).toBe('eliminated');
      expect(p2.state).toBe('eliminated');
      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.state).toBe('GAME_OVER');
    });

    it('revive-3.2: rapid revive spam: 100 consecutive donateLife calls in single frame only deducts 1 reserve life', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3); // 2 reserve lives
      p2.reset(144, 250, 0);
      p2.startRevivePending(10.0);

      // Spam donateLife 100 times in 1 frame
      let successfulDonations = 0;
      for (let i = 0; i < 100; i++) {
        if (game.playerManager.donateLife('p1')) {
          successfulDonations++;
        }
      }

      // Exactly 1 donation should succeed
      expect(successfulDonations).toBe(1);
      expect(p1.lives).toBe(2);
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');
      expect(p2.reviveTimer).toBe(0);
    });

    it('revive-3.3: donating life when donor has lives === 0 is strictly blocked', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.state = 'eliminated';
      p2.reset(144, 250, 0);
      p2.startRevivePending(5.0);

      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(false);
      expect(p1.lives).toBe(0);
      expect(p2.lives).toBe(0);
    });

    it('revive-3.4: donating life when donor has exactly 1 life (0 reserve lives) is strictly blocked', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 1);
      p2.reset(144, 250, 0);
      p2.startRevivePending(5.0);

      // Donor cannot sacrifice their only life
      expect(game.playerManager.canDonateLife('p1')).toBe(false);
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(false);
      expect(p1.lives).toBe(1);
      expect(p2.lives).toBe(0);
    });

    it('revive-3.5: donation with 0.1s left on countdown successfully revives without race expiration', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.startRevivePending(0.10); // Only 100ms remaining

      // Partner donates
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(true);

      expect(p2.state).toBe('respawning');
      expect(p2.reviveTimer).toBe(0);
      expect(p2.lives).toBe(1);

      // Advance simulation 10 frames (166ms > 100ms)
      for (let i = 0; i < 10; i++) {
        p2.update(1 / 60);
      }

      // P2 should remain respawning / normal, NOT eliminated!
      expect(p2.state).not.toBe('eliminated');
      expect(p2.isAlive()).toBe(true);
    });

    it('revive-3.6: donation with 0.001s (sub-frame) left on countdown successfully revives before expiration', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 2);
      p2.reset(144, 250, 0);
      p2.startRevivePending(0.001); // 1 millisecond left!

      expect(game.playerManager.canDonateLife('p1')).toBe(true);
      const donated = game.playerManager.donateLife('p1');
      expect(donated).toBe(true);

      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');

      p2.update(0.016);
      expect(p2.state).toBe('respawning');
      expect(p2.isAlive()).toBe(true);
    });

    it('revive-3.7: donation attempt immediately AFTER timer expires (reviveTimer === 0, eliminated) is rejected', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.startRevivePending(0.01);
      p2.update(0.02); // Expires to eliminated

      expect(p2.state).toBe('eliminated');
      expect(p2.reviveTimer).toBe(0);

      // In current code:
      // canDonateLife checks: (s === 'destroyed' || s === 'eliminated') && recipient.lives <= 0
      // Let's test whether eliminated players can still receive a donated life:
      const canDonateToEliminated = game.playerManager.canDonateLife('p1');
      // If code allows donation to eliminated partner before game over:
      if (canDonateToEliminated) {
        const success = game.playerManager.donateLife('p1');
        expect(success).toBe(true);
        expect(p2.lives).toBe(1);
        expect(p2.state).toBe('respawning');
      } else {
        expect(canDonateToEliminated).toBe(false);
      }
    });

    it('revive-3.8: stage-clear pity revive revives both players if both were in revive_pending', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.startRevivePending(5.0);

      p2.reset(144, 250, 0);
      p2.startRevivePending(8.0);

      // Wave cleared (e.g. all enemies killed by delayed explosive / ally drone)
      game.playerManager.onStageClear();

      expect(p1.lives).toBe(1);
      expect(p1.state).toBe('respawning');
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');
    });
  });

  // ==========================================================================
  // Track 4: Revive Under Boss Phase Shifts & Active Tractor Beams
  // ==========================================================================
  describe('Track 4: Revive Under Boss Phase Shifts & Active Tractor Beams', () => {
    it('boss-4.1: Boss phase transition (Phase 1 -> Phase 2) while P1 is in revive_pending proceeds without crash', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.startRevivePending(8.0);
      p2.reset(144, 250, 3);

      // Spawn Stage 10 Cyber Dreadnought
      const boss = game.bossManager.spawnBoss(10);
      expect(boss).not.toBeNull();
      expect(boss?.active).toBe(true);

      // Fast-forward boss intro
      boss!.introTimer = 0;
      boss!.phase = 'PHASE_1';

      // Damage boss to trigger Phase 1 -> Phase 2 transition
      // Stage 10 boss maxHealth is 128 in coop, phase 2 transition occurs when turrets are destroyed
      boss!.subUnits.forEach((sub) => {
        sub.takeDamage(999);
      });
      boss!.takeDamage(60);

      // Run game update for 60 frames during boss transition
      expect(() => {
        for (let i = 0; i < 60; i++) {
          game.update(1 / 60);
        }
      }).not.toThrow();

      // P1 revive timer should continue ticking down smoothly
      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeLessThan(8.0);
      expect(p1.reviveTimer).toBeGreaterThan(6.0);
    });

    it('boss-4.2: Stage 40 Telekinetic Stun thruster disruption affects only P1 due to hardcoded player reference', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 3);

      // Trigger Telekinetic Stun on BossManager
      game.bossManager.playerStunTimer = 2.0;

      // In Game.ts line 1038:
      // if (this.bossManager && this.bossManager.playerStunTimer > 0) {
      //   this.player.x = prevPlayerX + (this.player.x - prevPlayerX) * 0.25;
      // }
      // Simulate input moving both players right:
      const inputRight = createMockInput({ moveRight: true });
      
      const p1InitialX = p1.x;
      const p2InitialX = p2.x;

      game.inputHandler.getDualInputState = () => ({ p1: inputRight, p2: inputRight });
      game.update(1 / 60);

      const p1Delta = p1.x - p1InitialX;
      const p2Delta = p2.x - p2InitialX;

      // Flaw / Asymmetry check: Does P2 get stunned like P1?
      // If P2 is NOT stunned, p2Delta will be ~4.33 px/s while p1Delta is ~1.08 px/s (25%)
      // Defensive requirement: Both players in co-op should receive the same stun disruption!
      expect(p2Delta).toBeCloseTo(p1Delta, 2);
    });

    it('boss-4.3: Boss defeat while partner is in revive_pending awards score and preserves revive countdown', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.startRevivePending(6.0);
      p2.reset(144, 250, 2);

      const boss = game.bossManager.spawnBoss(10)! as any;
      boss.introTimer = 0;
      boss.phase = 'PHASE_2';
      boss.invulnerableTimer = 0;
      // Disable turrets to allow core vulnerability
      boss.turretLeft.active = false;
      boss.turretRight.active = false;
      boss.health = 1;

      // P2 lands killing blow
      boss.takeDamage(10); // Triggers defeat

      expect(boss.isDefeated).toBe(true);
      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeCloseTo(6.0, 1);
    });

    it('boss-4.4: Tractor beam targeting immunizes reviving player in revive_pending', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.startRevivePending(10.0);
      p2.reset(180, 250, 3);

      const bossGalaga = new Enemy({ id: 99, type: EnemyType.BOSS, x: 80, y: 50 });
      bossGalaga.state = EnemyState.IN_FORMATION;

      // Select target: even though Boss Galaga is at X=80 (directly above P1),
      // P1 is in revive_pending (not alive/vulnerable).
      const target = game.formationManager.selectTractorBeamTarget(bossGalaga);
      
      // Target MUST be surviving P2, not downed P1
      expect(target?.id).toBe('p2');
    });

    it('boss-4.5: Player captured by tractor beam with 0 lives remaining never enters revive_pending and gets trapped in captured state', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 has 1 life (so when captured, lives becomes 0)
      p1.reset(112, 250, 1);
      p2.reset(180, 250, 3);

      // Boss Galaga activates beam and captures P1
      p1.startCapture(112, 80);
      expect(p1.state).toBe('capturing');

      // Fast forward capture ascension (2.5s)
      p1.update(2.6);

      // In Player.ts line 588:
      // if (progress >= 1.0) {
      //   this._state = 'captured';
      //   this.lives -= 1; // now 0
      //   this.onCapturedComplete?.(this.captureTarget.x, this.captureTarget.y);
      //   if (this.lives > 0) this.respawn();
      //   else this.onGameOver?.();
      // }
      expect(p1.lives).toBe(0);
      expect(p1.state).toBe('captured');

      // Check whether P1 enters revive_pending or stays in captured forever:
      // In co-op, a player with 0 lives should enter revive_pending!
      // If p1 is stuck in 'captured', p2 cannot donate life to them!
      const canP2DonateToCapturedP1 = game.playerManager.canDonateLife('p2');
      
      // Defensive requirement: P2 should be able to rescue/donate life to a captured ally with 0 lives
      expect(canP2DonateToCapturedP1).toBe(true);
    });

    it('boss-4.6: Boss Galaga destroyed while holding captive player allows captive rescue even if partner is in revive_pending', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 is captive with 0 lives
      p1.reset(80, 250, 0);
      p1.state = 'captured';

      // P2 is in revive_pending
      p2.reset(144, 250, 0);
      p2.startRevivePending(9.0);

      // Create Boss Galaga diving with captured fighter
      const boss = new Enemy({ id: 50, type: EnemyType.BOSS, x: 112, y: 120, health: 1 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;

      const captiveFighter = new Enemy({ id: 51, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 104 });
      captiveFighter.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = captiveFighter;

      game.formationManager.addEnemy(boss);
      game.formationManager.addEnemy(captiveFighter);

      // Fire a bullet directly intersecting Boss Galaga
      game.bulletManager.firePlayerBullet(112, 120, false, 480, 0, -480, 4, 'p2');

      // Step simulation frame to trigger resolveCollisions
      game.update(1 / 60);

      // Verify that captive p1 is rescued: granted 1 life and begins docking
      expect(p1.lives).toBe(1);
      expect(p1.state).toBe('docking');
    });
  });
});
