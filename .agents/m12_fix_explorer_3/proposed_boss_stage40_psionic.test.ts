import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { PsionicHarbinger } from '../../src/core/boss/bosses/PsionicHarbinger';

describe('Milestone 12: Stage 40 — Psionic Shroud Harbinger (장막의 사자)', () => {
  let game: Game;
  let harbinger: PsionicHarbinger;

  beforeEach(() => {
    game = new Game();
    harbinger = new PsionicHarbinger(game);
  });

  it('initializes with 180 HP, True Core, and 2 Illusory Phantom Clones', () => {
    expect(harbinger.maxHealth).toBe(180);
    expect(harbinger.health).toBe(180);
    expect(harbinger.phantom1.active).toBe(true);
    expect(harbinger.phantom2.active).toBe(true);
    expect(harbinger.phantom1.isInvulnerableUnit).toBe(true);
    expect(harbinger.phantom2.isInvulnerableUnit).toBe(true);
  });

  it('absorbs 0 damage on phantom clones while true core takes damage', () => {
    harbinger.update(2.5, 112, 250); // Enter Phase 1

    // Phantom hit: 0 damage
    const resP1 = harbinger.phantom1.takeDamage(10);
    expect(resP1.wasDamaged).toBe(false);
    expect(resP1.shieldAbsorbed).toBe(true);

    // True core hit: takes full damage
    const resCore = harbinger.takeDamage(20);
    expect(resCore.wasDamaged).toBe(true);
    expect(harbinger.health).toBe(160);
  });

  it('executes shell-game rotation swap periodically', () => {
    harbinger.update(2.5, 112, 250); // Enter Phase 1
    const initialX = harbinger.x;

    // Advance 6.1s to trigger shuffle (interval = 6.0s)
    harbinger.update(6.1, 112, 250);
    // Positions change during circular swap
    expect(harbinger.x).not.toBe(initialX);

    // Advance 1.6s to complete 1.5s shuffle
    harbinger.update(1.6, 112, 250);
    // After shuffle, core occupies one of the 3 discrete slots: 48, 112, or 176
    expect([48, 112, 176]).toContain(Math.round(harbinger.x));
  });

  it('transitions to Phase 2 at <= 50% HP (90 HP) with 1.8s invulnerability', () => {
    harbinger.update(2.5, 112, 250);
    harbinger.takeDamage(90);

    expect(harbinger.health).toBe(90);
    expect(harbinger.phase).toBe('TRANSITION_1_2');
    expect(harbinger.invulnerableTimer).toBe(1.8);
    expect(harbinger.isInvulnerable()).toBe(true);

    // Both phantoms should be deactivated
    expect(harbinger.phantom1.active).toBe(false);
    expect(harbinger.phantom2.active).toBe(false);

    // Advance through transition
    harbinger.update(1.9, 112, 250);
    expect(harbinger.phase).toBe('PHASE_2');
    expect(harbinger.isInvulnerable()).toBe(false);
  });

  it('charges and unleashes telekinetic stun wave in Phase 2, disrupting player thrusters', () => {
    game.setState('PLAYING');

    // 1. Measure normal baseline movement without stun (260 px/s => ~4.33px per frame)
    const baselinePrevX = game.player.x;
    (game.inputHandler.getState() as { moveRight: boolean }).moveRight = true;
    game.update(1 / 60);
    const baselineMoved = game.player.x - baselinePrevX;
    expect(baselineMoved).toBeCloseTo(4.3333, 2);

    // Reset input for stun wave sequence
    (game.inputHandler.getState() as { moveRight: boolean }).moveRight = false;

    // 2. Harbinger transitions to Phase 2 and prepares stun wave
    harbinger.update(2.5, 112, 250);
    harbinger.takeDamage(90);
    harbinger.update(1.9, 112, 250); // Enter Phase 2

    // Advance frames to initiate and finish charge (3.8s cooldown + 0.8s charge = 4.6s => ~280 frames)
    for (let i = 0; i < 285; i++) {
      harbinger.update(1 / 60, 112, 250);
    }
    expect(harbinger.stunWave.active).toBe(true);

    // Advance wave until it reaches baseline (y ~ 250)
    for (let i = 0; i < 60; i++) {
      harbinger.update(1 / 60, 112, 250);
      if (game.bossManager.playerStunTimer > 0) break;
    }
    expect(game.bossManager.playerStunTimer).toBeGreaterThan(0);

    // 3. Verify thruster speed disruption in Game.ts:
    // With stun active, player horizontal speed is cut by 75% (retaining 25% baseline velocity)
    const stunnedPrevX = game.player.x;
    (game.inputHandler.getState() as { moveRight: boolean }).moveRight = true;
    game.update(1 / 60);
    const stunnedMoved = game.player.x - stunnedPrevX;

    // Assert genuine, non-zero speed dampening (~1.08px vs ~4.33px baseline)
    expect(stunnedMoved).toBeGreaterThan(0.5);
    expect(stunnedMoved).toBeCloseTo(1.0833, 2);
    expect(stunnedMoved).toBeCloseTo(baselineMoved * 0.25, 2);
    expect(stunnedMoved).toBeLessThan(2.0);
  });

  it('awards 40,000 points on defeat', () => {
    harbinger.update(2.5, 112, 250);
    harbinger.takeDamage(90);
    harbinger.update(1.9, 112, 250);

    const initialScore = game.scoreManager.score;
    const res = harbinger.takeDamage(90);
    expect(res.destroyed).toBe(true);
    expect(game.scoreManager.score - initialScore).toBe(40000);
  });
});
