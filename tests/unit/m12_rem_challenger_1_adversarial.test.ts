import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { NaniteColossus } from '../../src/core/boss/bosses/NaniteColossus';
import { CyberDreadnought } from '../../src/core/boss/bosses/CyberDreadnought';
import { PsionicHarbinger } from '../../src/core/boss/bosses/PsionicHarbinger';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';
import { EnemyState } from '../../src/types';

describe('m12_rem_challenger_1: Adversarial Stage 30 & Sub-Unit Collision Lifecycle', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  describe('1. Stage 30 Mini-Constructs Split, Collision, Elimination & Phase 2 Reassembly', () => {
    it('1.1 Splits at exactly 50% HP (75 HP) and activates all 4 mini-constructs with 18 HP', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60); // Spawns boss via stage intro transition to PLAYING

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      expect(colossus).toBeInstanceOf(NaniteColossus);
      expect(colossus.maxHealth).toBe(150);
      expect(colossus.health).toBe(150);
      expect(colossus.isSplit).toBe(false);

      // Fast-forward boss intro descent
      colossus.update(2.5, 112, 250);
      expect(colossus.phase).toBe('PHASE_1');

      // 4 constructs pre-registered in formation enemies
      expect(colossus.miniConstructs.length).toBe(4);
      expect(colossus.miniConstructs.every((c) => !c.active)).toBe(true);

      // Damage to 76 HP (above 50% threshold)
      colossus.takeDamage(74);
      expect(colossus.health).toBe(76);
      expect(colossus.isSplit).toBe(false);

      // Damage 1 more to reach 75 HP (exactly 50%)
      colossus.takeDamage(1);
      expect(colossus.health).toBe(75);
      expect(colossus.isSplit).toBe(true);
      expect(colossus.miniConstructs.every((c) => c.active)).toBe(true);
      expect(colossus.miniConstructs.every((c) => c.health === 18)).toBe(true);
    });

    it('1.2 Mini-constructs are in FormationManager enemies and participate in getLivingEnemies()', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);

      // Pre-split: living enemies should only be the main colossus
      let living = game.formationManager.getLivingEnemies();
      expect(living.length).toBe(1);
      expect(living[0]).toBe(colossus);

      // Trigger split
      colossus.takeDamage(75);
      expect(colossus.isSplit).toBe(true);

      // Post-split: living enemies must include colossus + 4 active constructs
      living = game.formationManager.getLivingEnemies();
      expect(living.length).toBe(5);
      for (const construct of colossus.miniConstructs) {
        expect(living).toContain(construct);
      }
    });

    it('1.3 Main Colossus is invulnerable while split; bullets hitting it are absorbed without HP reduction', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75);
      expect(colossus.isSplit).toBe(true);
      expect(colossus.health).toBe(75);

      // Fire 5 player bullets directly at Colossus body
      for (let i = 0; i < 5; i++) {
        game.bulletManager.firePlayerBullet(colossus.x, colossus.y, false, 480);
        expect(game.bulletManager.getPlayerBulletCount()).toBe(1);
        game.resolveCollisions();
        expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
        // HP must remain exactly 75
        expect(colossus.health).toBe(75);
      }
    });

    it('1.4 Player missiles hit, damage, and eliminate each Mini-Construct individually (18 hits each)', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75); // Split

      const initialScore = game.scoreManager.score;

      // Eliminate constructs 0, 1, 2 sequentially with 18 bullets each
      for (let cIdx = 0; cIdx < 3; cIdx++) {
        const construct = colossus.miniConstructs[cIdx]!;
        expect(construct.active).toBe(true);

        for (let hit = 1; hit <= 18; hit++) {
          const expectedHp = 18 - hit;
          game.bulletManager.firePlayerBullet(construct.x, construct.y, false, 480);
          expect(game.bulletManager.getPlayerBulletCount()).toBe(1);

          game.resolveCollisions();
          expect(game.bulletManager.getPlayerBulletCount()).toBe(0); // Bullet consumed

          if (expectedHp > 0) {
            expect(construct.health).toBe(expectedHp);
            expect(construct.active).toBe(true);
          } else {
            // Destroyed!
            expect(construct.health).toBe(0);
            expect(construct.active).toBe(false);
            expect(construct.state).toBe(EnemyState.EXPLODING);
          }
        }

        // Colossus must STILL be in split state since not all 4 are eliminated
        expect(colossus.isSplit).toBe(true);
        expect(colossus.phase).toBe('PHASE_1');
      }

      // 3 constructs destroyed = 3 * 500 points
      expect(game.scoreManager.score - initialScore).toBe(1500);

      // 1 construct remaining
      expect(colossus.miniConstructs.filter((c) => c.active).length).toBe(1);
      const lastConstruct = colossus.miniConstructs[3]!;
      expect(lastConstruct.active).toBe(true);

      // Now eliminate construct 3 (hits 1 to 17)
      for (let hit = 1; hit <= 17; hit++) {
        game.bulletManager.firePlayerBullet(lastConstruct.x, lastConstruct.y, false, 480);
        game.resolveCollisions();
        expect(lastConstruct.health).toBe(18 - hit);
        expect(lastConstruct.active).toBe(true);
        expect(colossus.isSplit).toBe(true);
      }

      // 18th hit destroys the 4th construct!
      game.bulletManager.firePlayerBullet(lastConstruct.x, lastConstruct.y, false, 480);
      game.resolveCollisions();

      expect(lastConstruct.health).toBe(0);
      expect(lastConstruct.active).toBe(false);
      expect(lastConstruct.state).toBe(EnemyState.EXPLODING);

      // All 4 eliminated -> Phase transition triggered!
      expect(colossus.isSplit).toBe(false);
      expect(colossus.phase).toBe('TRANSITION_1_2');
      expect(colossus.invulnerableTimer).toBe(2.0);
      expect(colossus.isInvulnerable()).toBe(true);
    });

    it('1.5 Eliminating all 4 mini-constructs transitions to Phase 2 (Overclocked Titan) after 2.0s', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75);

      // Destroy all 4 constructs via direct damage
      for (const construct of colossus.miniConstructs) {
        construct.takeDamage(18);
      }

      expect(colossus.isSplit).toBe(false);
      expect(colossus.phase).toBe('TRANSITION_1_2');
      expect(colossus.invulnerableTimer).toBe(2.0);

      // During 2.0s transition, boss is invulnerable
      colossus.update(1.0, 112, 250);
      expect(colossus.phase).toBe('TRANSITION_1_2');
      expect(colossus.isInvulnerable()).toBe(true);

      // Advance past 2.0s
      colossus.update(1.1, 112, 250);
      expect(colossus.phase).toBe('PHASE_2');
      expect(colossus.isInvulnerable()).toBe(false);

      // Phase 2 started: Gray Goo clouds are active
      expect(colossus.clouds.length).toBe(2);
      expect(colossus.clouds.every((c) => c.active)).toBe(true);
    });

    it('1.6 In Phase 2, Colossus takes direct damage from player bullets outside Gray Goo clouds and awards 30,000 pts', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75);
      for (const c of colossus.miniConstructs) {
        c.takeDamage(18);
      }
      colossus.update(2.1, 112, 250); // Enter Phase 2
      expect(colossus.phase).toBe('PHASE_2');
      expect(colossus.health).toBe(75);

      const preDefeatScore = game.scoreManager.score;

      // Fire bullet directly at Colossus
      game.bulletManager.firePlayerBullet(colossus.x, colossus.y, false, 480);
      game.resolveCollisions();
      expect(colossus.health).toBe(74);

      // Damage Colossus down to 0 HP
      const killResult = colossus.takeDamage(74);
      expect(killResult.destroyed).toBe(true);
      expect(colossus.phase).toBe('DEFEATED');
      expect(game.scoreManager.score - preDefeatScore).toBe(30000);
    });

    it('1.7 Swept AABB collision reliably hits mini-construct moving along Lissajous trajectory', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75); // Split

      // Advance Colossus and constructs by several frames to let Lissajous motion run
      for (let f = 0; f < 30; f++) {
        colossus.update(1 / 60, 112, 250);
      }

      const construct = colossus.miniConstructs[0]!;
      expect(construct.active).toBe(true);
      const hpBefore = construct.health;

      // Spawn bullet slightly below construct (simulating bullet moving up towards it)
      const bullet = game.bulletManager.firePlayerBullet(construct.x, construct.y + 4, false, 480);
      expect(bullet).not.toBeNull();

      // Resolve collision with swept AABB
      game.resolveCollisions();
      expect(construct.health).toBe(hpBefore - 1);
      expect(bullet!.active).toBe(false);
    });

    it('1.8 Dual Fighter simultaneously hits two distinct mini-constructs in the same frame', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75);

      const c0 = colossus.miniConstructs[0]!;
      const c1 = colossus.miniConstructs[1]!;

      // Fire 2 bullets simultaneously at c0 and c1
      game.bulletManager.firePlayerBullet(c0.x, c0.y, true, 480);
      game.bulletManager.firePlayerBullet(c1.x, c1.y, true, 480);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);

      game.resolveCollisions();

      expect(c0.health).toBe(17);
      expect(c1.health).toBe(17);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
    });
  });

  describe('2. Sub-Unit Double-Update (120Hz) and Double-Render Prevention', () => {
    it('2.1 NaniteColossus mini-constructs receive exactly 1 update and 1 render per 60Hz tick during PLAYING', () => {
      game.scoreManager.reset(3, 30);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60); // Transitions to PLAYING, spawns boss
      expect(game.state).toBe('PLAYING');

      const colossus = game.bossManager.activeBoss as NaniteColossus;
      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75); // Activate mini-constructs

      // Spy on each mini-construct's update and render methods
      const updateSpies = colossus.miniConstructs.map((c) => vi.spyOn(c, 'update'));
      const renderSpies = colossus.miniConstructs.map((c) => vi.spyOn(c, 'render'));

      // Run 60 frames (1 full second at 60 FPS)
      const FRAMES = 60;
      for (let f = 0; f < FRAMES; f++) {
        game.update(1 / 60);
        game.render();
      }

      // Assert that each active construct was updated EXACTLY FRAMES times (60Hz, NOT 120Hz)
      for (let i = 0; i < colossus.miniConstructs.length; i++) {
        expect(updateSpies[i]).toHaveBeenCalledTimes(FRAMES);
        expect(renderSpies[i]).toHaveBeenCalledTimes(FRAMES);
      }
    });

    it('2.2 Stage 10 CyberDreadnought sub-units receive exactly 1 update and 1 render per tick', () => {
      game.scoreManager.reset(3, 10);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);
      expect(game.state).toBe('PLAYING');

      const boss = game.bossManager.activeBoss as CyberDreadnought;
      expect(boss).toBeInstanceOf(CyberDreadnought);
      boss.update(2.5, 112, 250);

      const activeSubs = boss.getActiveSubUnits();
      expect(activeSubs.length).toBeGreaterThan(0);

      const updateSpies = activeSubs.map((s) => vi.spyOn(s, 'update'));
      const renderSpies = activeSubs.map((s) => vi.spyOn(s, 'render'));

      const FRAMES = 30;
      for (let f = 0; f < FRAMES; f++) {
        game.update(1 / 60);
        game.render();
      }

      for (let i = 0; i < activeSubs.length; i++) {
        expect(updateSpies[i]).toHaveBeenCalledTimes(FRAMES);
        expect(renderSpies[i]).toHaveBeenCalledTimes(FRAMES);
      }
    });

    it('2.3 Stage 40 PsionicHarbinger phantom clones receive exactly 1 update and 1 render per tick', () => {
      game.scoreManager.reset(3, 40);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);
      expect(game.state).toBe('PLAYING');

      const boss = game.bossManager.activeBoss as PsionicHarbinger;
      expect(boss).toBeInstanceOf(PsionicHarbinger);
      boss.update(2.5, 112, 250);

      const activeSubs = boss.getActiveSubUnits();
      expect(activeSubs.length).toBe(2);

      const updateSpies = activeSubs.map((s) => vi.spyOn(s, 'update'));
      const renderSpies = activeSubs.map((s) => vi.spyOn(s, 'render'));

      const FRAMES = 30;
      for (let f = 0; f < FRAMES; f++) {
        game.update(1 / 60);
        game.render();
      }

      for (let i = 0; i < activeSubs.length; i++) {
        expect(updateSpies[i]).toHaveBeenCalledTimes(FRAMES);
        expect(renderSpies[i]).toHaveBeenCalledTimes(FRAMES);
      }
    });

    it('2.4 Stage 50 AeternumCore orbital satellites receive exactly 1 update and 1 render per tick', () => {
      game.scoreManager.reset(3, 50);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);
      expect(game.state).toBe('PLAYING');

      const boss = game.bossManager.activeBoss as AeternumCore;
      expect(boss).toBeInstanceOf(AeternumCore);
      boss.update(2.5, 112, 250);

      const activeSubs = boss.getActiveSubUnits();
      expect(activeSubs.length).toBe(4);

      const updateSpies = activeSubs.map((s) => vi.spyOn(s, 'update'));
      const renderSpies = activeSubs.map((s) => vi.spyOn(s, 'render'));

      const FRAMES = 30;
      for (let f = 0; f < FRAMES; f++) {
        game.update(1 / 60);
        game.render();
      }

      for (let i = 0; i < activeSubs.length; i++) {
        expect(updateSpies[i]).toHaveBeenCalledTimes(FRAMES);
        expect(renderSpies[i]).toHaveBeenCalledTimes(FRAMES);
      }
    });

    it('2.5 Standalone BaseBoss instance safely updates and renders sub-units when not in FormationManager', () => {
      const standaloneGame = new Game();
      const colossus = new NaniteColossus(standaloneGame);

      // Verify sub-units are NOT in formationManager.enemies
      for (const sub of colossus.subUnits) {
        expect(standaloneGame.formationManager.enemies.includes(sub)).toBe(false);
      }

      colossus.update(2.5, 112, 250);
      colossus.takeDamage(75); // Split -> subUnits become active

      const updateSpies = colossus.miniConstructs.map((c) => vi.spyOn(c, 'update'));
      const renderSpies = colossus.miniConstructs.map((c) => vi.spyOn(c, 'render'));

      // Direct call to colossus.update and colossus.render
      colossus.update(1 / 60, 112, 250);
      colossus.render(standaloneGame.ctx);

      // Standalone mode delegates update and render to BaseBoss fallback loop
      for (let i = 0; i < colossus.miniConstructs.length; i++) {
        expect(updateSpies[i]).toHaveBeenCalledTimes(1);
        expect(renderSpies[i]).toHaveBeenCalledTimes(1);
      }
    });
  });
});
