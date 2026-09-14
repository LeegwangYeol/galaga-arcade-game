import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { BaseBoss } from '../../src/core/boss/BaseBoss';

describe('Milestone 12: Boss Stage Progression & Engine Integration', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  it('keeps game.state strictly as "PLAYING" during boss stages 10, 20, 30, 40, and 50', () => {
    const bossStages = [10, 20, 30, 40, 50];

    for (const st of bossStages) {
      game.scoreManager.reset(3, st);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      expect(game.state).toBe('PLAYING');
      expect(game.formationManager.enemies.length).toBeGreaterThan(0);
      expect(game.bossManager.isBossActive()).toBe(true);
      expect(game.bossManager.activeBoss).toBeInstanceOf(BaseBoss);

      for (const e of game.formationManager.enemies) {
        expect(Number.isFinite(e.x)).toBe(true);
        expect(Number.isFinite(e.y)).toBe(true);
      }
    }
  });

  it('registers boss and sub-units in formation.enemies and enables swept AABB collisions', () => {
    game.scoreManager.reset(3, 10);
    game.setState('STAGE_INTRO');
    game.stateTimer = 2.5;
    game.update(1 / 60);

    const boss = game.bossManager.activeBoss!;
    expect(boss).not.toBeNull();
    // Fast-forward boss intro so it descends to y=52
    boss.update(2.5, 112, 250);

    // Fire player missile directly through boss position
    game.bulletManager.firePlayerBullet(boss.x, boss.y, false, 480);
    expect(game.bulletManager.getPlayerBulletCount()).toBe(1);

    // Run collision check
    game.resolveCollisions();
    // Bullet should hit and be recycled
    expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
  });

  it('triggers onStageClear naturally when the active boss is destroyed and all enemies are eliminated', () => {
    game.scoreManager.reset(3, 10);
    game.setState('STAGE_INTRO');
    game.stateTimer = 2.5;
    game.update(1 / 60);

    const boss = game.bossManager.activeBoss!;
    expect(boss).not.toBeNull();
    boss.update(2.5, 112, 250);

    // Deactivate protecting sub-units and defeat boss
    for (const sub of boss.subUnits) {
      sub.active = false;
    }
    boss.takeDamage(100);
    expect(boss.phase).toBe('DEFEATED');
    boss.defeatTimer = 0;
    boss.update(0.1, 112, 250);
    expect(boss.active).toBe(false);

    // Deactivate all sub-units in formation.enemies
    for (const e of game.formationManager.enemies) {
      e.active = false;
    }

    // Update formation manager: livingCount drops to 0, triggering onStageClear
    game.formationManager.update(1 / 60, 112, 250);
    expect(game.state).toBe('STAGE_CLEAR');
  });

  it('seamlessly advances from Stage 50 defeat into Stage 51 (Prestige loop)', () => {
    game.scoreManager.reset(3, 50);
    game.setState('STAGE_INTRO');
    game.stateTimer = 2.5;
    game.update(1 / 60);

    expect(game.stage).toBe(50);
    expect(game.bossManager.isBossActive()).toBe(true);

    // Defeat stage 50 boss
    const aeternum = game.bossManager.activeBoss!;
    aeternum.takeDamage(400);
    aeternum.defeatTimer = 0;
    aeternum.update(0.1, 112, 250);

    for (const e of game.formationManager.enemies) {
      e.active = false;
    }

    game.formationManager.update(1 / 60, 112, 250);
    expect(game.state).toBe('STAGE_CLEAR');

    // Fast-forward STAGE_CLEAR to advance stage
    game.stateTimer = 3.0;
    game.update(1 / 60);

    expect(game.stage).toBe(51);
    expect(game.state).toBe('STAGE_INTRO');
  });

  it('guarantees zero-GC pool bounds under continuous boss bullet hell saturation', () => {
    game.scoreManager.reset(3, 50);
    game.setState('STAGE_INTRO');
    game.stateTimer = 2.5;
    game.update(1 / 60);

    const aeternum = game.bossManager.activeBoss!;
    aeternum.update(2.5, 112, 250);
    // Enter Phase 3
    aeternum.phase = 'PHASE_3';
    aeternum.invulnerableTimer = 0;

    // Simulate 300 frames of dual 6-arm spiral bullet hell
    for (let f = 0; f < 300; f++) {
      aeternum.update(1 / 60, 112, 250);
      game.bulletManager.update(1 / 60);
    }

    // Active bullets must stay well within POOL_MAX_SIZE (256)
    const enemyBullets = game.bulletManager.getEnemyBulletCount();
    expect(enemyBullets).toBeGreaterThan(10);
    expect(enemyBullets).toBeLessThanOrEqual(256);
  });
});
