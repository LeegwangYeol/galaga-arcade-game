import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { NaniteColossus } from '../../src/core/boss/bosses/NaniteColossus';

describe('Milestone 12: Stage 30 — Nanite Swarm Colossus (나노머신 거신)', () => {
  let game: Game;
  let colossus: NaniteColossus;

  beforeEach(() => {
    game = new Game();
    colossus = new NaniteColossus(game);
  });

  it('initializes with 150 HP and 4 pre-allocated Mini-Constructs', () => {
    expect(colossus.maxHealth).toBe(150);
    expect(colossus.health).toBe(150);
    expect(colossus.miniConstructs.length).toBe(4);
    expect(colossus.isSplit).toBe(false);
  });

  it('splits into 4 Mini-Constructs when damaged to <= 50% HP (75 HP)', () => {
    // Fast-forward INTRO
    colossus.update(2.5, 112, 250);
    expect(colossus.phase).toBe('PHASE_1');

    colossus.takeDamage(75);
    expect(colossus.health).toBe(75);
    expect(colossus.isSplit).toBe(true);
    expect(colossus.miniConstructs.every((c) => c.active)).toBe(true);
    expect(colossus.miniConstructs.every((c) => c.health === 18)).toBe(true);
  });

  it('protects main Colossus from damage while in split state', () => {
    colossus.update(2.5, 112, 250);
    colossus.takeDamage(75); // Trigger split
    expect(colossus.isProtectedBySubUnits()).toBe(true);

    const res = colossus.takeDamage(20);
    expect(res.wasDamaged).toBe(false);
    expect(res.shieldAbsorbed).toBe(true);
    expect(colossus.health).toBe(75);
  });

  it('updates Mini-Constructs along Lissajous curves and allows destroying them individually', () => {
    colossus.update(2.5, 112, 250);
    colossus.takeDamage(75);

    const initialX = colossus.miniConstructs[0]!.x;
    colossus.update(0.5, 112, 250);
    // Position should update along curve
    expect(colossus.miniConstructs[0]!.x).not.toBe(initialX);

    // Destroy 3 of 4 constructs
    colossus.miniConstructs[0]!.takeDamage(18);
    colossus.miniConstructs[1]!.takeDamage(18);
    colossus.miniConstructs[2]!.takeDamage(18);
    expect(colossus.miniConstructs.filter((c) => c.active).length).toBe(1);
    expect(colossus.isSplit).toBe(true);
  });

  it('transitions to Phase 2 with 2.0s invulnerability when all 4 constructs are defeated', () => {
    colossus.update(2.5, 112, 250);
    colossus.takeDamage(75);

    // Destroy all 4 constructs
    for (const c of colossus.miniConstructs) {
      c.takeDamage(18);
    }

    expect(colossus.isSplit).toBe(false);
    expect(colossus.phase).toBe('TRANSITION_1_2');
    expect(colossus.invulnerableTimer).toBe(2.0);
    expect(colossus.isInvulnerable()).toBe(true);

    // Advance through transition into Phase 2
    colossus.update(2.1, 112, 250);
    expect(colossus.phase).toBe('PHASE_2');
    expect(colossus.isInvulnerable()).toBe(false);
  });

  it('deploys 2 Nanite Gray Goo clouds in Phase 2 that dissolve player missiles', () => {
    colossus.update(2.5, 112, 250);
    colossus.takeDamage(75);
    for (const c of colossus.miniConstructs) {
      c.takeDamage(18);
    }
    colossus.update(2.1, 112, 250); // Enter Phase 2

    // First update in Phase 2 to calculate active cloud coordinates
    colossus.update(0.05, 112, 250);

    // Fire player bullet directly inside cloud 0's position
    const c0 = colossus.clouds[0]!;
    const bullet = game.bulletManager.firePlayerBullet(c0.x, c0.y, false, 480);
    expect(bullet).not.toBeNull();
    expect(game.bulletManager.getPlayerBulletCount()).toBe(1);

    // Update colossus which checks cloud boundaries and recycles intersecting bullets
    colossus.update(0.01, 112, 250);
    expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
    expect(bullet!.active).toBe(false);
  });

  it('awards 30,000 points on defeat', () => {
    colossus.update(2.5, 112, 250);
    colossus.takeDamage(75);
    for (const c of colossus.miniConstructs) {
      c.takeDamage(18);
    }
    colossus.update(2.1, 112, 250); // Enter Phase 2

    const initialScore = game.scoreManager.score;
    const res = colossus.takeDamage(75);
    expect(res.destroyed).toBe(true);
    expect(game.scoreManager.score - initialScore).toBe(30000);
  });

  it('verifies Game.resolveCollisions damages Mini-Constructs during Stage 30 split phase (No Softlock)', () => {
    const battleGame = new Game();
    battleGame.scoreManager.reset(3, 30);
    battleGame.setState('STAGE_INTRO');
    battleGame.stateTimer = 2.5;
    battleGame.update(1 / 60);

    const boss = battleGame.bossManager.activeBoss as NaniteColossus;
    expect(boss).not.toBeNull();
    // Verify all 4 mini constructs are pre-registered in formation enemies
    expect(battleGame.formationManager.enemies.length).toBe(5); // Colossus + 4 constructs

    // Advance intro and trigger split
    boss.update(2.5, 112, 250);
    boss.takeDamage(75);
    expect(boss.isSplit).toBe(true);

    const c0 = boss.miniConstructs[0]!;
    expect(c0.active).toBe(true);
    const initialHealth = c0.health;

    // Fire bullet positioned right at construct 0
    battleGame.bulletManager.firePlayerBullet(c0.x, c0.y, false, 480);
    expect(battleGame.bulletManager.getPlayerBulletCount()).toBe(1);

    // Resolve collision
    battleGame.resolveCollisions();

    // Verify construct took damage and bullet was consumed
    expect(c0.health).toBe(initialHealth - 1);
    expect(battleGame.bulletManager.getPlayerBulletCount()).toBe(0);
  });
});
