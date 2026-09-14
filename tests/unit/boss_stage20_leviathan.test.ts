import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { DimensionalLeviathan } from '../../src/core/boss/bosses/DimensionalLeviathan';

describe('Milestone 12: Stage 20 — Dimensional Leviathan (차원수 레비아탄)', () => {
  let game: Game;
  let leviathan: DimensionalLeviathan;

  beforeEach(() => {
    game = new Game();
    leviathan = new DimensionalLeviathan(game);
  });

  it('initializes with 120 HP, begins in materialized state, and creates 2 pre-allocated tears', () => {
    expect(leviathan.maxHealth).toBe(120);
    expect(leviathan.health).toBe(120);
    expect(leviathan.isMaterialized).toBe(true);
    expect(leviathan.tears.length).toBe(2);
  });

  it('oscillates between Materialized (3.5s) and Void Shroud (2.0s) in Phase 1', () => {
    // Fast forward INTRO (2.0s)
    leviathan.update(2.5, 112, 250);
    expect(leviathan.phase).toBe('PHASE_1');
    expect(leviathan.isMaterialized).toBe(true);
    expect(leviathan.isInvulnerable()).toBe(false);

    // After 3.6s, shifts into Void Shroud
    leviathan.update(3.6, 112, 250);
    expect(leviathan.isMaterialized).toBe(false);
    expect(leviathan.isInvulnerable()).toBe(true);

    // After 2.1s, shifts back to Materialized
    leviathan.update(2.1, 112, 250);
    expect(leviathan.isMaterialized).toBe(true);
    expect(leviathan.isInvulnerable()).toBe(false);
  });

  it('blocks damage while in Void Shroud dematerialized state', () => {
    leviathan.update(2.5, 112, 250);
    // Force Void Shroud
    leviathan.isMaterialized = false;
    expect(leviathan.isInvulnerable()).toBe(true);

    const res = leviathan.takeDamage(10);
    expect(res.wasDamaged).toBe(false);
    expect(res.shieldAbsorbed).toBe(true);
    expect(leviathan.health).toBe(120);
  });

  it('activates Dimensional Tears in Void Shroud and applies gravitational deflection to player missiles', () => {
    leviathan.update(2.5, 112, 250);
    leviathan.update(3.6, 112, 250); // Shifts to Void Shroud
    expect(leviathan.tears[0]!.active).toBe(true);
    expect(leviathan.tears[1]!.active).toBe(true);

    // Fire player missile near tear 1 (at x=60, y=110)
    const bullet = game.bulletManager.firePlayerBullet(55, 130, false, 480);
    expect(bullet).not.toBeNull();
    const initialVx = bullet!.velocity.x;

    // Update leviathan which applies softened gravity deflection to player bullets
    leviathan.update(0.1, 112, 250);
    // Horizontal velocity vx should be deflected toward the tear (x=60 > x=55 => ax > 0)
    expect(bullet!.velocity.x).toBeGreaterThan(initialVx);
  });

  it('transitions to Phase 2 at <= 50% HP (60 HP) with 1.8s invulnerability', () => {
    leviathan.update(2.5, 112, 250);
    leviathan.isMaterialized = true;

    leviathan.takeDamage(60);
    expect(leviathan.health).toBe(60);
    expect(leviathan.phase).toBe('TRANSITION_1_2');
    expect(leviathan.invulnerableTimer).toBe(1.8);
    expect(leviathan.isInvulnerable()).toBe(true);

    // All tears should be deactivated
    expect(leviathan.tears.every((t) => !t.active)).toBe(true);

    // Advance through transition
    leviathan.update(1.9, 112, 250);
    expect(leviathan.phase).toBe('PHASE_2');
  });

  it('exerts horizontal suction vortex pull on player in Phase 2', () => {
    leviathan.update(2.5, 112, 250);
    leviathan.isMaterialized = true;
    leviathan.takeDamage(60);
    leviathan.update(1.9, 112, 250); // Enter Phase 2

    // Place player to the left of center (e.g. x = 40)
    game.player.x = 40;
    leviathan.update(0.2, game.player.x, game.player.y);

    // Player should be pulled toward boss center (112) -> player.x increases
    expect(game.player.x).toBeGreaterThan(40);
  });

  it('fires radial shockwaves with rotating safe-sector gap in Phase 2', () => {
    leviathan.update(2.5, 112, 250);
    leviathan.isMaterialized = true;
    leviathan.takeDamage(60);
    leviathan.update(1.9, 112, 250); // Enter Phase 2

    // Advance frames to trigger shockwave (interval = 2.4s)
    for (let i = 0; i < 150; i++) {
      leviathan.update(1 / 60, 112, 250);
    }
    const activeWave = leviathan.shockwaves.find((w) => w.active);
    expect(activeWave).toBeDefined();
    expect(activeWave?.radius).toBeGreaterThan(0);
    expect(activeWave?.safeWidthRad).toBe(0.70);
  });

  it('awards 20,000 points on defeat', () => {
    leviathan.update(2.5, 112, 250);
    leviathan.isMaterialized = true;
    leviathan.takeDamage(60);
    leviathan.update(1.9, 112, 250);

    const initialScore = game.scoreManager.score;
    const result = leviathan.takeDamage(60);
    expect(result.destroyed).toBe(true);
    expect(game.scoreManager.score - initialScore).toBe(20000);
  });
});
