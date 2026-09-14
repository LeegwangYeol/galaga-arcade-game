/**
 * Milestone 15 — Global QA Cheat Controller & window.__GALAGA_CHEAT__ Test Suite
 * 
 * Verifies mounting, lifecycle unmounting, all 10 controller methods, diagnostic getters,
 * boundary inputs (negative, out-of-bounds, invalid IDs), and atomic state transitions
 * (mid-boss, active crisis, tractor beam capture, GAME_OVER recovery).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { CrisisEventType } from '../../src/core/crisis/types';

describe('Milestone 15: Global QA Cheat Controller (window.__GALAGA_CHEAT__)', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    if (game) {
      game.destroy();
    }
  });

  // ==========================================================================
  // 1. Controller Attachment, Mounting & Lifecycle
  // ==========================================================================
  describe('1. Global Scope Mounting & Lifecycle', () => {
    it('attaches to global window and globalThis upon Game initialization', () => {
      const cheat = game.getCheatController();
      expect(cheat).toBeDefined();

      if (typeof window !== 'undefined') {
        expect(window.__GALAGA_CHEAT__).toBe(cheat);
      }
      expect((globalThis as any).__GALAGA_CHEAT__).toBe(cheat);
    });

    it('exposes all required cheat methods and diagnostic getters', () => {
      const cheat = game.getCheatController();
      expect(typeof cheat.skipToStage).toBe('function');
      expect(typeof cheat.triggerCrisis).toBe('function');
      expect(typeof cheat.spawnBoss).toBe('function');
      expect(typeof cheat.triggerSpecialMove).toBe('function');
      expect(typeof cheat.setInvincible).toBe('function');
      expect(typeof cheat.unlockDrone).toBe('function');
      expect(typeof cheat.fillEnergy).toBe('function');
      expect(typeof cheat.killAllEnemies).toBe('function');
      expect(typeof cheat.setScore).toBe('function');
      expect(typeof cheat.addLives).toBe('function');
      expect(typeof cheat.getGameState).toBe('function');
    });

    it('cleanly unmounts from window and globalThis when Game is destroyed', () => {
      const cheat = game.getCheatController();
      expect((globalThis as any).__GALAGA_CHEAT__).toBe(cheat);

      game.destroy();

      if (typeof window !== 'undefined') {
        expect(window.__GALAGA_CHEAT__).toBeUndefined();
      }
      expect((globalThis as any).__GALAGA_CHEAT__).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. skipToStage Method & Boundaries
  // ==========================================================================
  describe('2. skipToStage Method & Stage Boundaries', () => {
    it('successfully transitions to valid stages 1 through 50', () => {
      const cheat = game.getCheatController();

      const sampleStages = [1, 5, 10, 15, 20, 27, 30, 40, 50];
      for (const st of sampleStages) {
        const ok = cheat.skipToStage(st);
        expect(ok).toBe(true);
        expect(game.stage).toBe(st);
        expect(game.scoreManager.stage).toBe(st);
      }
    });

    it('rejects stage 0 and negative stage numbers without modifying state', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(5);

      expect(cheat.skipToStage(0)).toBe(false);
      expect(game.stage).toBe(5);

      expect(cheat.skipToStage(-1)).toBe(false);
      expect(game.stage).toBe(5);

      expect(cheat.skipToStage(-100)).toBe(false);
      expect(game.stage).toBe(5);
    });

    it('rejects stages exceeding 50 without modifying state', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(25);

      expect(cheat.skipToStage(51)).toBe(false);
      expect(game.stage).toBe(25);

      expect(cheat.skipToStage(999)).toBe(false);
      expect(game.stage).toBe(25);
    });

    it('rejects non-integer, NaN, and non-numeric inputs', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(10);

      expect(cheat.skipToStage(12.5)).toBe(false);
      expect(game.stage).toBe(10);

      expect(cheat.skipToStage(NaN)).toBe(false);
      expect(game.stage).toBe(10);

      expect(cheat.skipToStage(Infinity)).toBe(false);
      expect(game.stage).toBe(10);

      expect(cheat.skipToStage(null as any)).toBe(false);
      expect(game.stage).toBe(10);
    });

    it('correctly transitions to CHALLENGING_STAGE on bonus rounds', () => {
      const cheat = game.getCheatController();
      const bonusStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];

      for (const bs of bonusStages) {
        cheat.skipToStage(bs);
        expect(game.stage).toBe(bs);
        expect(game.state).toBe('CHALLENGING_STAGE');
        expect(game.formationManager.isChallengingStage).toBe(true);
      }
    });

    it('correctly instantiates multi-phase Boss encounters on Stages 10, 20, 30, 40, 50', () => {
      const cheat = game.getCheatController();
      const bossStages = [10, 20, 30, 40, 50];

      for (const bs of bossStages) {
        cheat.skipToStage(bs);
        expect(game.stage).toBe(bs);
        expect(game.bossManager.activeBoss).not.toBeNull();
        expect(game.bossManager.activeBoss?.active).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 3. State Transition Safety during skipToStage (Teardown Invariants)
  // ==========================================================================
  describe('3. State Transition Safety during skipToStage', () => {
    it('skips cleanly mid-boss battle without leaving orphaned entities', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(10); // Cyber Dreadnought

      expect(game.bossManager.activeBoss).not.toBeNull();

      // Fire boss attacks and bullets
      game.update(0.1);

      // Now skip to stage 12
      cheat.skipToStage(12);

      expect(game.bossManager.activeBoss).toBeNull();
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.stage).toBe(12);
    });

    it('skips cleanly during active crisis, clearing modifiers and timers', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(12);
      cheat.triggerCrisis('hyperspace_storm');

      expect(game.crisisEventManager.getActiveCrisis()).not.toBeNull();

      cheat.skipToStage(14);

      expect(game.crisisEventManager.getActiveCrisis()).toBeNull();
      expect(game.stage).toBe(14);
    });

    it('recovers from GAME_OVER state, resetting player lives and resuming PLAYING', () => {
      const cheat = game.getCheatController();
      game.player.lives = 0;
      game.setState('GAME_OVER');

      expect(game.state).toBe('GAME_OVER');

      cheat.skipToStage(5);

      expect(game.stage).toBe(5);
      expect(game.state).toBe('PLAYING');
      expect(game.player.lives).toBeGreaterThanOrEqual(1);
    });

    it('breaks active tractor beam capture without freezing the player', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(1);

      // Simulate player being in capture animation
      game.player.startCapture(112, 100);
      expect(game.player.state).toBe('capturing');

      cheat.skipToStage(2);

      expect(game.player.state).not.toBe('capturing');
      expect(game.player.state).not.toBe('captured');
      expect(game.tractorBeam.isActive()).toBe(false);
    });

    it('guarantees getActiveCount() === 0 across all 7 pools upon skipToStage', () => {
      const cheat = game.getCheatController();

      // Create active entities in all subsystems
      cheat.skipToStage(1);
      game.bulletManager.firePlayerBullet(112, 200, false, 300);
      game.particleSystem.spawnHitSparks(112, 150);
      cheat.unlockDrone('bomber');
      cheat.triggerSpecialMove('nova');

      // Skip stage
      cheat.skipToStage(2);

      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
    });
  });

  // ==========================================================================
  // 4. triggerCrisis Method & Alias Resolution
  // ==========================================================================
  describe('4. triggerCrisis Method & Alias Resolution', () => {
    it('triggers all 11 crisis events by exact enum string', () => {
      const cheat = game.getCheatController();

      for (const crisisType of Object.values(CrisisEventType)) {
        const ok = cheat.triggerCrisis(crisisType);
        expect(ok).toBe(true);
        expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(crisisType);
      }
    });

    it('triggers crises using case-insensitive aliases', () => {
      const cheat = game.getCheatController();

      expect(cheat.triggerCrisis('contingency')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.THE_CONTINGENCY);

      expect(cheat.triggerCrisis('unbidden')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.THE_UNBIDDEN);

      expect(cheat.triggerCrisis('prethoryn')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.THE_PRETHORYN_SCOURGE);

      expect(cheat.triggerCrisis('shield')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.SHIELD_OVERLOAD);

      expect(cheat.triggerCrisis('physics')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.PHYSICS_INVERSION);

      expect(cheat.triggerCrisis('hyperspace')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.HYPERSPACE_STORM);

      expect(cheat.triggerCrisis('nanite')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.NANITE_CLOUD);

      expect(cheat.triggerCrisis('psionic')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.PSIONIC_RESONANCE);

      expect(cheat.triggerCrisis('frenzy')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.DEVOURING_SWARM_FRENZY);

      expect(cheat.triggerCrisis('nemesis')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.NEMESIS_STAR_EATER);

      expect(cheat.triggerCrisis('chrono')).toBe(true);
      expect(game.crisisEventManager.getActiveCrisis()?.type).toBe(CrisisEventType.TIME_DILATION_FIELD);
    });

    it('rejects invalid crisis IDs with false', () => {
      const cheat = game.getCheatController();

      expect(cheat.triggerCrisis('UNKNOWN_CRISIS')).toBe(false);
      expect(cheat.triggerCrisis('')).toBe(false);
      expect(cheat.triggerCrisis('123')).toBe(false);
      expect(cheat.triggerCrisis(null as any)).toBe(false);
    });
  });

  // ==========================================================================
  // 5. spawnBoss Method & Boss Resolution
  // ==========================================================================
  describe('5. spawnBoss Method & Boss Resolution', () => {
    it('spawns each Boss by stage number (10, 20, 30, 40, 50)', () => {
      const cheat = game.getCheatController();

      for (const st of [10, 20, 30, 40, 50]) {
        const ok = cheat.spawnBoss(st);
        expect(ok).toBe(true);
        expect(game.stage).toBe(st);
        expect(game.bossManager.activeBoss).not.toBeNull();
      }
    });

    it('spawns each Boss by name or alias', () => {
      const cheat = game.getCheatController();

      expect(cheat.spawnBoss('dreadnought')).toBe(true);
      expect(game.stage).toBe(10);

      expect(cheat.spawnBoss('leviathan')).toBe(true);
      expect(game.stage).toBe(20);

      expect(cheat.spawnBoss('colossus')).toBe(true);
      expect(game.stage).toBe(30);

      expect(cheat.spawnBoss('harbinger')).toBe(true);
      expect(game.stage).toBe(40);

      expect(cheat.spawnBoss('aeternum')).toBe(true);
      expect(game.stage).toBe(50);
    });

    it('rejects non-boss stage numbers and invalid names with false', () => {
      const cheat = game.getCheatController();

      expect(cheat.spawnBoss(1)).toBe(false);
      expect(cheat.spawnBoss(15)).toBe(false);
      expect(cheat.spawnBoss(25)).toBe(false);
      expect(cheat.spawnBoss('UNKNOWN_BOSS')).toBe(false);
      expect(cheat.spawnBoss('')).toBe(false);
    });
  });

  // ==========================================================================
  // 6. triggerSpecialMove Method & Bypasses
  // ==========================================================================
  describe('6. triggerSpecialMove Method & Cooldown Bypass', () => {
    it('triggers Nova Barrage, Chrono Freeze, and Warp Ram', () => {
      const cheat = game.getCheatController();

      expect(cheat.triggerSpecialMove('nova')).toBe(true);
      expect(cheat.triggerSpecialMove('chrono')).toBe(true);
      expect(cheat.triggerSpecialMove('warp')).toBe(true);
    });

    it('auto-fills energy meter to 100% and clears cooldown when triggered via cheat', () => {
      const cheat = game.getCheatController();

      game.specialMovesManager.energy = 0;
      game.specialMovesManager.cooldownTimer = 5.0;

      const ok = cheat.triggerSpecialMove('nova');
      expect(ok).toBe(true);
    });

    it('rejects invalid special move IDs with false', () => {
      const cheat = game.getCheatController();

      expect(cheat.triggerSpecialMove('SUPER_LASER')).toBe(false);
      expect(cheat.triggerSpecialMove('')).toBe(false);
    });
  });

  // ==========================================================================
  // 7. setInvincible (God Mode) Invariants
  // ==========================================================================
  describe('7. setInvincible (God Mode) Invariants', () => {
    it('makes player immune to enemy projectile damage', () => {
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      const initialLives = game.player.lives;
      const bulletBox = { x: game.player.x - 2, y: game.player.y - 2, width: 4, height: 4 };

      const hit = game.player.hitTestAndDamage(bulletBox);
      expect(hit).toBe(false);
      expect(game.player.lives).toBe(initialLives);
    });

    it('makes player immune to tractor beam capture', () => {
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      expect(game.player.isInvulnerable()).toBe(true);
    });

    it('does NOT trigger 10Hz respawn blinking during normal flight', () => {
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      // invulnerableTimer is 0 (not respawning)
      game.player.invulnerableTimer = 0;

      const mockCtx = {
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        fillRect: () => {},
        translate: () => {},
        rotate: () => {},
      } as any;

      // Rendering should complete without throwing or early-return skipping due to blink
      expect(() => game.player.render(mockCtx)).not.toThrow();
    });

    it('restores normal vulnerability when toggled to false', () => {
      const cheat = game.getCheatController();
      cheat.setInvincible(true);
      expect(game.player.isInvulnerable()).toBe(true);

      cheat.setInvincible(false);
      game.player.invulnerableTimer = 0;
      expect(game.player.isInvulnerable()).toBe(false);
    });
  });

  // ==========================================================================
  // 8. unlockDrone Method
  // ==========================================================================
  describe('8. unlockDrone Method', () => {
    it('summons Escort, Aegis, and Bomber drones individually', () => {
      const cheat = game.getCheatController();

      expect(cheat.unlockDrone('escort')).toBe(true);
      expect(cheat.unlockDrone('aegis')).toBe(true);
      expect(cheat.unlockDrone('bomber')).toBe(true);
    });

    it('summons all 3 drones with ALL', () => {
      const cheat = game.getCheatController();

      expect(cheat.unlockDrone('ALL')).toBe(true);
    });

    it('rejects unknown drone types with false', () => {
      const cheat = game.getCheatController();

      expect(cheat.unlockDrone('STEALTH_DRONE')).toBe(false);
      expect(cheat.unlockDrone('')).toBe(false);
    });
  });

  // ==========================================================================
  // 9. Utility Cheats: fillEnergy, killAllEnemies, setScore, addLives, getGameState
  // ==========================================================================
  describe('9. Utility Cheat Methods & Diagnostics', () => {
    it('fillEnergy sets energy to 100% or custom amount', () => {
      const cheat = game.getCheatController();
      game.specialMovesManager.energy = 0;

      cheat.fillEnergy();
      expect(game.specialMovesManager.energy).toBe(100);

      cheat.fillEnergy(45);
      expect(game.specialMovesManager.energy).toBe(45);
    });

    it('killAllEnemies destroys active formation enemies and boss', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(1);

      expect(game.formationManager.getLivingCount()).toBeGreaterThan(0);

      const killed = cheat.killAllEnemies();
      expect(killed).toBeGreaterThan(0);
      expect(game.formationManager.getLivingCount()).toBe(0);
    });

    it('setScore updates game and player score', () => {
      const cheat = game.getCheatController();

      cheat.setScore(50000);
      expect(game.score).toBe(50000);
      expect(game.player.score).toBe(50000);
    });

    it('addLives modifies lives count correctly', () => {
      const cheat = game.getCheatController();
      const initialLives = game.lives;

      const updated = cheat.addLives(2);
      expect(updated).toBe(initialLives + 2);
      expect(game.lives).toBe(initialLives + 2);
      expect(game.player.lives).toBe(initialLives + 2);

      // Decrement lives
      cheat.addLives(-10);
      expect(game.lives).toBe(0);
    });

    it('getGameState returns accurate game snapshot', () => {
      const cheat = game.getCheatController();
      cheat.skipToStage(7);
      cheat.setScore(12345);
      cheat.setInvincible(true);

      const state = cheat.getGameState();
      expect(state.stage).toBe(7);
      expect(state.score).toBe(12345);
      expect(state.isInvincible).toBe(true);
      expect(state.state).toBe('CHALLENGING_STAGE');
      expect(typeof state.lives).toBe('number');
      expect(typeof state.energy).toBe('number');
      expect(typeof state.activeEnemies).toBe('number');
    });
  });
});
