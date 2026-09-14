import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';

describe('Milestone 12: Stage 50 — Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)', () => {
  let game: Game;
  let aeternum: AeternumCore;

  beforeEach(() => {
    game = new Game();
    aeternum = new AeternumCore(game);
  });

  it('initializes with 300 HP across 3 phases and 4 orbital satellite generators', () => {
    expect(aeternum.maxHealth).toBe(300);
    expect(aeternum.health).toBe(300);
    expect(aeternum.satellites.length).toBe(4);
    expect(aeternum.satellites.every((s) => s.active)).toBe(true);
    expect(aeternum.satellites.every((s) => s.health === 25)).toBe(true);
  });

  it('protects core with Planetary Shield Matrix while any satellite is alive', () => {
    aeternum.update(2.5, 112, 250); // Enter Phase 1
    expect(aeternum.isProtectedBySubUnits()).toBe(true);

    const res = aeternum.takeDamage(50);
    expect(res.wasDamaged).toBe(false);
    expect(res.shieldAbsorbed).toBe(true);
    expect(aeternum.health).toBe(300);
  });

  it('updates satellites along elliptical orbits and allows destroying them', () => {
    aeternum.update(2.5, 112, 250);
    const initialX = aeternum.satellites[0]!.x;
    aeternum.update(0.5, 112, 250);
    expect(aeternum.satellites[0]!.x).not.toBe(initialX);

    // Destroy 3 satellites
    aeternum.satellites[0]!.takeDamage(25);
    aeternum.satellites[1]!.takeDamage(25);
    aeternum.satellites[2]!.takeDamage(25);
    expect(aeternum.isProtectedBySubUnits()).toBe(true); // 4th still alive
  });

  it('transitions to Phase 2 with 2.0s invulnerability when all 4 satellites are destroyed', () => {
    aeternum.update(2.5, 112, 250);
    for (const sat of aeternum.satellites) {
      sat.takeDamage(25);
    }

    expect(aeternum.isProtectedBySubUnits()).toBe(false);
    expect(aeternum.phase).toBe('TRANSITION_1_2');
    expect(aeternum.invulnerableTimer).toBe(2.0);
    expect(aeternum.isInvulnerable()).toBe(true);

    // Advance through transition
    aeternum.update(2.1, 112, 250);
    expect(aeternum.phase).toBe('PHASE_2');
    expect(aeternum.isInvulnerable()).toBe(false);
  });

  it('charges and fires 134px wide Dark Matter Mega-Beam in Phase 2', () => {
    aeternum.update(2.5, 112, 250);
    for (const sat of aeternum.satellites) {
      sat.takeDamage(25);
    }
    aeternum.update(2.1, 112, 250); // Enter Phase 2

    // Advance cooldown (2.5s) to trigger charge
    aeternum.update(2.6, 112, 250);
    expect(aeternum.megaBeam.charging).toBe(true);
    expect(aeternum.megaBeam.width).toBe(134);

    // Advance charge (1.6s) to fire beam
    aeternum.update(1.7, 112, 250);
    expect(aeternum.megaBeam.firing).toBe(true);

    // Test player inside beam column takes damage
    game.player.x = aeternum.megaBeam.centerX;
    game.player.y = 250;
    const initialLives = game.player.lives;
    aeternum.update(0.05, game.player.x, game.player.y);
    expect(game.player.lives).toBeLessThan(initialLives);
  });

  it('transitions to Phase 3 (Enrage) at <= 33% HP (100 HP) with 2.0s invulnerability', () => {
    aeternum.update(2.5, 112, 250);
    for (const sat of aeternum.satellites) {
      sat.takeDamage(25);
    }
    aeternum.update(2.1, 112, 250); // Enter Phase 2

    // Deplete HP down to 100
    aeternum.takeDamage(200);
    expect(aeternum.health).toBe(100);
    expect(aeternum.phase).toBe('TRANSITION_2_3');
    expect(aeternum.invulnerableTimer).toBe(2.0);
    expect(aeternum.isInvulnerable()).toBe(true);

    // Advance through transition into Phase 3
    aeternum.update(2.1, 112, 250);
    expect(aeternum.phase).toBe('PHASE_3');
    expect(aeternum.isInvulnerable()).toBe(false);
  });

  it('fires dual 6-arm counter-rotating spiral bullet hell in Phase 3', () => {
    aeternum.update(2.5, 112, 250);
    for (const sat of aeternum.satellites) {
      sat.takeDamage(25);
    }
    aeternum.update(2.1, 112, 250);
    aeternum.takeDamage(200);
    aeternum.update(2.1, 112, 250); // Enter Phase 3

    const initialCount = game.bulletManager.getEnemyBulletCount();
    // Advance 0.3s to fire spiral wave (interval = 0.25s)
    aeternum.update(0.3, 112, 250);
    const newCount = game.bulletManager.getEnemyBulletCount();
    // Dual 6-arm cannons = 6 + 6 = 12 bullets per wave
    expect(newCount - initialCount).toBe(12);
  });

  it('awards 50,000 victory bonus points and drops power-up on final raid defeat', () => {
    aeternum.update(2.5, 112, 250);
    for (const sat of aeternum.satellites) {
      sat.takeDamage(25);
    }
    aeternum.update(2.1, 112, 250);
    aeternum.takeDamage(200);
    aeternum.update(2.1, 112, 250); // Enter Phase 3

    const initialScore = game.scoreManager.score;
    const res = aeternum.takeDamage(100);

    expect(res.destroyed).toBe(true);
    expect(aeternum.phase).toBe('DEFEATED');
    expect(game.scoreManager.score - initialScore).toBe(50000);
  });
});
