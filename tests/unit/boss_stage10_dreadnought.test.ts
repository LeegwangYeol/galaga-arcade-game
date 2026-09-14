import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { CyberDreadnought } from '../../src/core/boss/bosses/CyberDreadnought';
import { SpriteRenderer } from '../../src/renderer/SpriteRenderer';

describe('Milestone 12: Stage 10 — Cyber Dreadnought (사이버 전함)', () => {
  let game: Game;
  let dreadnought: CyberDreadnought;

  beforeEach(() => {
    game = new Game();
    dreadnought = new CyberDreadnought(game);
  });

  it('initializes with 80 HP, 2 turrets, and 2 escort drones', () => {
    expect(dreadnought.maxHealth).toBe(80);
    expect(dreadnought.health).toBe(80);
    expect(dreadnought.turretLeft.active).toBe(true);
    expect(dreadnought.turretRight.active).toBe(true);
    expect(dreadnought.escortLeft.active).toBe(true);
    expect(dreadnought.escortRight.active).toBe(true);
    expect(dreadnought.turretLeft.health).toBe(15);
    expect(dreadnought.turretRight.health).toBe(15);
    expect(dreadnought.escortLeft.health).toBe(5);
    expect(dreadnought.escortRight.health).toBe(5);
  });

  it('protects core bulkheads while turrets are operational', () => {
    // Fast-forward INTRO
    dreadnought.update(2.5, 112, 250);
    expect(dreadnought.phase).toBe('PHASE_1');

    expect(dreadnought.isProtectedBySubUnits()).toBe(true);
    const damageResult = dreadnought.takeDamage(10);
    expect(damageResult.wasDamaged).toBe(false);
    expect(damageResult.shieldAbsorbed).toBe(true);
    expect(dreadnought.health).toBe(80);
  });

  it('allows core damage once both turrets are destroyed', () => {
    dreadnought.update(2.5, 112, 250);
    dreadnought.turretLeft.takeDamage(15);
    dreadnought.turretRight.takeDamage(15);

    expect(dreadnought.isProtectedBySubUnits()).toBe(false);
    const damageResult = dreadnought.takeDamage(10);
    expect(damageResult.wasDamaged).toBe(true);
    expect(dreadnought.health).toBe(70);
  });

  it('triggers Phase 1 to Phase 2 transition at <= 50% HP (40 HP) with 1.5s invulnerability', () => {
    dreadnought.update(2.5, 112, 250);
    dreadnought.turretLeft.takeDamage(15);
    dreadnought.turretRight.takeDamage(15);

    dreadnought.takeDamage(40);
    expect(dreadnought.health).toBe(40);
    expect(dreadnought.phase).toBe('TRANSITION_1_2');
    expect(dreadnought.invulnerableTimer).toBe(1.5);
    expect(dreadnought.isInvulnerable()).toBe(true);

    // Advances timer through transition
    dreadnought.update(1.6, 112, 250);
    expect(dreadnought.phase).toBe('PHASE_2');
    expect(dreadnought.isInvulnerable()).toBe(false);
  });

  it('emits 4-arm rotating spiral bullet rings in Phase 2', () => {
    dreadnought.update(2.5, 112, 250);
    dreadnought.turretLeft.takeDamage(15);
    dreadnought.turretRight.takeDamage(15);
    dreadnought.takeDamage(40);
    dreadnought.update(1.6, 112, 250); // Enter Phase 2

    const initialBullets = game.bulletManager.getEnemyBulletCount();
    // Advance Phase 2 by 0.4s to trigger spiral fire (interval = 0.35s)
    dreadnought.update(0.4, 112, 250);
    const newBullets = game.bulletManager.getEnemyBulletCount();
    expect(newBullets - initialBullets).toBe(4); // 4 arms
  });

  it('charges and fires aimed railgun in Phase 2', () => {
    dreadnought.update(2.5, 112, 250);
    dreadnought.turretLeft.takeDamage(15);
    dreadnought.turretRight.takeDamage(15);
    dreadnought.takeDamage(40);
    dreadnought.update(1.6, 112, 250);

    // Advance 2.9s to initiate charging (interval = 2.8s)
    dreadnought.update(2.9, 112, 250);
    // Advance 0.7s to finish charging (charge = 0.6s) and fire
    const initialBullets = game.bulletManager.getEnemyBulletCount();
    dreadnought.update(0.7, 112, 250);
    expect(game.bulletManager.getEnemyBulletCount()).toBeGreaterThan(initialBullets);
  });

  it('awards 10,000 points and triggers power-up drop on defeat', () => {
    dreadnought.update(2.5, 112, 250);
    dreadnought.turretLeft.takeDamage(15);
    dreadnought.turretRight.takeDamage(15);
    dreadnought.takeDamage(40);
    dreadnought.update(1.6, 112, 250);

    const initialScore = game.scoreManager.score;
    const result = dreadnought.takeDamage(40);

    expect(result.destroyed).toBe(true);
    expect(dreadnought.phase).toBe('DEFEATED');
    expect(game.scoreManager.score - initialScore).toBe(10000);
  });

  it('renders escort drones with registered ZAKO_WING_0 sprite without missing definition warnings', () => {
    SpriteRenderer.initialize();
    expect(SpriteRenderer.hasDefinition('ZAKO_WING_0')).toBe(true);

    let drawImageCalled = 0;
    const mockCtx = {
      drawImage: () => { drawImageCalled++; },
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      fillRect: () => {},
    } as unknown as CanvasRenderingContext2D;

    dreadnought.escortLeft.render(mockCtx);
    expect(drawImageCalled).toBeGreaterThan(0);
  });
});
