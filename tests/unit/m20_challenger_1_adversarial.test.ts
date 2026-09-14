/**
 * Galaga Arcade Web Game — Milestone M20 Adversarial Challenger Test Suite
 * Location: tests/unit/m20_challenger_1_adversarial.test.ts
 *
 * Empirical Adversarial Verification Dimensions:
 * 1. DDA Bounds & Adversarial Edge Cases:
 *    - Extreme proficiency inputs (-5.0, 100.0, NaN, Infinity, -Infinity, null, malformed).
 *    - Actuator clamping strictly within theoretical bounds ([0.85, 1.35], [0.80, 1.40], [0.90, 1.25]).
 *    - Actuator behavior under extreme dynamic event floods (100k hits, 100k fatalities).
 *    - Reset invariants and neutral fallback state.
 * 2. Glitch Event Fuzzing & Teardown Invariants:
 *    - Garbage glitch type fuzzing ('nonsense_string', symbols, invalid text) -> safe false returns.
 *    - Valid glitch types and case-insensitive aliases -> safe true returns.
 *    - Rapid sequential trigger-clear cycles: 50 consecutive cycles verifying phantomPool.getActiveCount() === 0,
 *      no orphaned clones, zero enemy offset residue, and complete telemetry reset.
 *    - Glitch Sector transitions on Stages 13, 26, 38 and immediate skip-away clean state restoration.
 *    - Strict immunity for Challenging Stages and Epic Boss encounters.
 * 3. Power-Up Spawn & Apply Fuzzing:
 *    - Pool capacity exhaustion: 40 consecutive spawnPowerUp calls on 32-capacity pool (32 true, 8 false, 0 crashes).
 *    - Object pool capacity invariant (strictly 32 entities, zero auto-expansion).
 *    - applyPowerUp fuzzing with all 10 power-up types and canonical aliases (all true).
 *    - applyPowerUp fuzzing with invalid/malformed names (all false).
 *    - getGameState().powerups telemetry verification across spawning, buff application, countdown, and teardown.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { GlitchEventType } from '../../src/core/glitch/types';
import { EnemyType } from '../../src/types';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { GalagaCheatController } from '../../src/core/qa/GalagaCheatController';

/**
 * Asserts that all entity coordinates and velocities across the game are valid, finite numbers (non-NaN).
 */
function assertNoNaNCoordinates(game: Game): void {
  // 1. Player coordinates
  if (game.player) {
    expect(Number.isFinite(game.player.x)).toBe(true);
    expect(Number.isFinite(game.player.y)).toBe(true);
    expect(Number.isNaN(game.player.x)).toBe(false);
    expect(Number.isNaN(game.player.y)).toBe(false);
    expect(Number.isFinite(game.player.vx)).toBe(true);
    expect(Number.isFinite(game.player.vy)).toBe(true);
  }

  // 2. Active Boss coordinates
  if (game.bossManager?.activeBoss && game.bossManager.activeBoss.active) {
    const boss = game.bossManager.activeBoss;
    expect(Number.isFinite(boss.x)).toBe(true);
    expect(Number.isFinite(boss.y)).toBe(true);
    expect(Number.isNaN(boss.x)).toBe(false);
    expect(Number.isNaN(boss.y)).toBe(false);
  }

  // 3. Living Formation Enemies
  if (game.formationManager) {
    const living = game.formationManager.getLivingEnemies();
    for (const enemy of living) {
      if (enemy.active) {
        expect(Number.isFinite(enemy.x)).toBe(true);
        expect(Number.isFinite(enemy.y)).toBe(true);
        expect(Number.isNaN(enemy.x)).toBe(false);
        expect(Number.isNaN(enemy.y)).toBe(false);
      }
    }
  }

  // 4. Projectiles
  if (game.bulletManager) {
    const checkBullet = (b: any) => {
      if (b.active && b.position) {
        expect(Number.isFinite(b.position.x)).toBe(true);
        expect(Number.isFinite(b.position.y)).toBe(true);
        expect(Number.isNaN(b.position.x)).toBe(false);
        expect(Number.isNaN(b.position.y)).toBe(false);
      }
    };
    if (typeof (game.bulletManager as any).forEachActivePlayerBullet === 'function') {
      (game.bulletManager as any).forEachActivePlayerBullet(checkBullet);
    }
    if (typeof (game.bulletManager as any).forEachActiveEnemyBullet === 'function') {
      (game.bulletManager as any).forEachActiveEnemyBullet(checkBullet);
    }
  }
}

describe('Milestone M20 Adversarial Verification: QA Cheat Controller, DDA & Glitch Invariants', () => {
  let game: Game;
  let cheat: GalagaCheatController;

  beforeEach(() => {
    game = new Game();
    game.startGame();
    cheat = game.getCheatController();
    expect(cheat).toBeDefined();
  });

  afterEach(() => {
    if (cheat) {
      cheat.destroy();
    }
    if (game) {
      game.destroy();
    }
  });

  // ==========================================================================
  // TARGET 1: DDA Bounds & Adversarial Edge Cases
  // ==========================================================================
  describe('Target 1: DDA Bounds & Adversarial Edge Cases', () => {
    it('1.1: safely rejects extreme and malformed proficiency values (-5.0, 100.0, NaN, Infinity, -Infinity) without throwing', () => {
      const initialMetrics = cheat.getDDAMetrics() as any;

      // Extreme negative input
      expect(cheat.setDDAProficiency(-5.0)).toBe(false);
      expect(cheat.setDDAProficiency(-0.0001)).toBe(false);
      expect(cheat.setDDAProficiency(-Infinity)).toBe(false);

      // Extreme positive input
      expect(cheat.setDDAProficiency(1.0001)).toBe(false);
      expect(cheat.setDDAProficiency(100.0)).toBe(false);
      expect(cheat.setDDAProficiency(9999.9)).toBe(false);
      expect(cheat.setDDAProficiency(Infinity)).toBe(false);

      // Malformed inputs
      expect(cheat.setDDAProficiency(NaN)).toBe(false);
      expect(cheat.setDDAProficiency('0.5' as any)).toBe(false);
      expect(cheat.setDDAProficiency(undefined as any)).toBe(false);
      expect(cheat.setDDAProficiency({} as any)).toBe(false);

      // Ensure state is uncorrupted after invalid calls
      const afterBadCalls = cheat.getDDAMetrics() as any;
      expect(afterBadCalls.actuators.diveSpeedMultiplier).toBe(initialMetrics.actuators.diveSpeedMultiplier);
      expect(afterBadCalls.actuators.bulletDensityMultiplier).toBe(initialMetrics.actuators.bulletDensityMultiplier);
      expect(afterBadCalls.actuators.bossHealthMultiplier).toBe(initialMetrics.actuators.bossHealthMultiplier);

      // Null clears override cleanly
      expect(cheat.setDDAProficiency(null)).toBe(true);
    });

    it('1.2: correctly evaluates boundary proficiency inputs (0.0, 0.50, 1.0) to exact theoretical minimums, neutrals, and maximums', () => {
      // 1. Minimum proficiency boundary (sigma = 0.0)
      expect(cheat.setDDAProficiency(0.0)).toBe(true);
      const minMetrics = cheat.getDDAMetrics() as any;
      const minState = cheat.getGameState();
      expect(minMetrics.actuators.skillIndex).toBe(0.0);
      expect(minMetrics.actuators.diveSpeedMultiplier).toBeCloseTo(0.85, 3);
      expect(minMetrics.actuators.bulletDensityMultiplier).toBeCloseTo(0.80, 3);
      expect(minMetrics.actuators.bossHealthMultiplier).toBeCloseTo(0.90, 3);
      expect(minState.dda?.diveSpeedMultiplier).toBeCloseTo(0.85, 3);
      expect(minState.dda?.bulletDensityMultiplier).toBeCloseTo(0.80, 3);
      expect(minState.dda?.bossHealthMultiplier).toBeCloseTo(0.90, 3);

      // 2. Neutral proficiency boundary (sigma = 0.50)
      expect(cheat.setDDAProficiency(0.50)).toBe(true);
      const neutralMetrics = cheat.getDDAMetrics() as any;
      const neutralState = cheat.getGameState();
      expect(neutralMetrics.actuators.skillIndex).toBe(0.50);
      expect(neutralMetrics.actuators.diveSpeedMultiplier).toBeCloseTo(1.10, 3);
      expect(neutralMetrics.actuators.bulletDensityMultiplier).toBeCloseTo(1.10, 3);
      expect(neutralMetrics.actuators.bossHealthMultiplier).toBeCloseTo(1.00, 3);
      expect(neutralState.dda?.diveSpeedMultiplier).toBeCloseTo(1.10, 3);
      expect(neutralState.dda?.bulletDensityMultiplier).toBeCloseTo(1.10, 3);
      expect(neutralState.dda?.bossHealthMultiplier).toBeCloseTo(1.00, 3);

      // 3. Maximum proficiency boundary (sigma = 1.0)
      expect(cheat.setDDAProficiency(1.0)).toBe(true);
      const maxMetrics = cheat.getDDAMetrics() as any;
      const maxState = cheat.getGameState();
      expect(maxMetrics.actuators.skillIndex).toBe(1.0);
      expect(maxMetrics.actuators.diveSpeedMultiplier).toBeCloseTo(1.35, 3);
      expect(maxMetrics.actuators.bulletDensityMultiplier).toBeCloseTo(1.40, 3);
      expect(maxMetrics.actuators.bossHealthMultiplier).toBeCloseTo(1.25, 3);
      expect(maxState.dda?.diveSpeedMultiplier).toBeCloseTo(1.35, 3);
      expect(maxState.dda?.bulletDensityMultiplier).toBeCloseTo(1.40, 3);
      expect(maxState.dda?.bossHealthMultiplier).toBeCloseTo(1.25, 3);
    });

    it('1.3: enforces strict clamping invariants ([0.85, 1.35], [0.80, 1.40], [0.90, 1.25]) across 1,000 chaotic fuzzed inputs', () => {
      const dda = game.dynamicDifficultyManager;
      expect(dda).toBeDefined();

      let seed = 987654321;
      function pseudoRandom(): number {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      for (let i = 0; i < 1000; i++) {
        // Chaotic proficiency override: range [-10.0, 10.0] including extreme and boundary values
        const rawProficiency = (pseudoRandom() - 0.5) * 20.0;
        dda.setProficiencyOverride(rawProficiency);

        const actuators = dda.getActuators();
        const metrics = dda.getMetrics();

        // 1. Skill index must be clamped in [0.0, 1.0]
        expect(actuators.skillIndex).toBeGreaterThanOrEqual(0.0);
        expect(actuators.skillIndex).toBeLessThanOrEqual(1.0);
        expect(metrics.effectiveSkillIndex).toBeGreaterThanOrEqual(0.0);
        expect(metrics.effectiveSkillIndex).toBeLessThanOrEqual(1.0);

        // 2. Dive Speed Multiplier strictly clamped in [0.85, 1.35]
        expect(actuators.diveSpeedMultiplier).toBeGreaterThanOrEqual(0.85);
        expect(actuators.diveSpeedMultiplier).toBeLessThanOrEqual(1.35);
        expect(dda.getDiveSpeedMultiplier()).toBeGreaterThanOrEqual(0.85);
        expect(dda.getDiveSpeedMultiplier()).toBeLessThanOrEqual(1.35);

        // 3. Bullet Density Multiplier strictly clamped in [0.80, 1.40]
        expect(actuators.bulletDensityMultiplier).toBeGreaterThanOrEqual(0.80);
        expect(actuators.bulletDensityMultiplier).toBeLessThanOrEqual(1.40);
        expect(dda.getBulletDensityMultiplier()).toBeGreaterThanOrEqual(0.80);
        expect(dda.getBulletDensityMultiplier()).toBeLessThanOrEqual(1.40);

        // 4. Boss Health Multiplier strictly clamped in [0.90, 1.25]
        expect(actuators.bossHealthMultiplier).toBeGreaterThanOrEqual(0.90);
        expect(actuators.bossHealthMultiplier).toBeLessThanOrEqual(1.25);
        expect(dda.getBossHealthMultiplier()).toBeGreaterThanOrEqual(0.90);
        expect(dda.getBossHealthMultiplier()).toBeLessThanOrEqual(1.25);

        // 5. Power-Up Pity Bonus strictly clamped in [0.00, 0.25]
        expect(actuators.powerUpPityBonus).toBeGreaterThanOrEqual(0.00);
        expect(actuators.powerUpPityBonus).toBeLessThanOrEqual(0.25);
        expect(dda.getPowerUpPityBonus()).toBeGreaterThanOrEqual(0.00);
        expect(dda.getPowerUpPityBonus()).toBeLessThanOrEqual(0.25);
      }
    });

    it('1.4: survives extreme dynamic event floods (100,000 hits and 100,000 player deaths) with zero NaN and strict clamp preservation', () => {
      const dda = game.dynamicDifficultyManager;
      dda.setProficiencyOverride(null); // Real-time calculation mode

      // Flood 100,000 player fatalities
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          dda.recordPlayerDamage(true, 100);
        }
      }).not.toThrow();

      // Step simulation clock 10 seconds to process rolling buffers
      dda.update(10.0, 0, 0);

      let actuators = dda.getActuators();
      expect(Number.isFinite(actuators.diveSpeedMultiplier)).toBe(true);
      expect(Number.isFinite(actuators.bulletDensityMultiplier)).toBe(true);
      expect(Number.isFinite(actuators.bossHealthMultiplier)).toBe(true);
      expect(actuators.diveSpeedMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(actuators.diveSpeedMultiplier).toBeLessThanOrEqual(1.35);

      // Flood 100,000 accurate hits and huge score
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          dda.recordShotFired(100);
          dda.recordShotHit(100);
          dda.recordScoreGain(50000);
        }
      }).not.toThrow();

      // Step simulation clock
      dda.update(10.0, 5, 50000000);

      actuators = dda.getActuators();
      expect(Number.isFinite(actuators.diveSpeedMultiplier)).toBe(true);
      expect(Number.isFinite(actuators.bulletDensityMultiplier)).toBe(true);
      expect(Number.isFinite(actuators.bossHealthMultiplier)).toBe(true);
      expect(actuators.diveSpeedMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(actuators.diveSpeedMultiplier).toBeLessThanOrEqual(1.35);
      expect(actuators.bulletDensityMultiplier).toBeGreaterThanOrEqual(0.80);
      expect(actuators.bulletDensityMultiplier).toBeLessThanOrEqual(1.40);
      expect(actuators.bossHealthMultiplier).toBeGreaterThanOrEqual(0.90);
      expect(actuators.bossHealthMultiplier).toBeLessThanOrEqual(1.25);
    });

    it('1.5: resetDDA() completely flushes rolling buffers and restores actuators to neutral defaults', () => {
      // Corrupt state with extreme values
      cheat.setDDAProficiency(0.99);
      game.dynamicDifficultyManager.recordPlayerDamage(true, 50);
      game.dynamicDifficultyManager.recordScoreGain(1000000);

      // Call cheat controller reset
      cheat.resetDDA();

      const metrics = cheat.getDDAMetrics() as any;
      expect(metrics.actuators.skillIndex).toBe(0.50);
      expect(metrics.actuators.diveSpeedMultiplier).toBe(1.10);
      expect(metrics.actuators.bulletDensityMultiplier).toBe(1.10);
      expect(metrics.actuators.bossHealthMultiplier).toBe(1.00);
      expect(metrics.actuators.powerUpPityBonus).toBe(0.00);
    });
  });

  // ==========================================================================
  // TARGET 2: Glitch Event Fuzzing & Teardown Invariants
  // ==========================================================================
  describe('Target 2: Glitch Event Fuzzing & Teardown Invariants', () => {
    it('2.1: rejects garbage glitch strings and malformed inputs with safe boolean return and zero state corruption', () => {
      const glitchManager = game.glitchEventManager;
      expect(glitchManager).toBeDefined();

      const initialTelemetry = glitchManager.getTelemetry();
      expect(initialTelemetry.active).toBe(false);
      expect(initialTelemetry.state).toBe('IDLE');

      // Battery of invalid non-empty strings
      const garbageInputs = [
        'nonsense_string',
        'invalid_glitch',
        'SELECT * FROM glitch',
        '123456',
        '!@#$%^&*()',
        'undefined',
        'null',
        'NaN',
        'false',
        'quantum_fake',
        'mirage_invalid_long_name_test',
      ];

      for (const garbage of garbageInputs) {
        const result = cheat.triggerGlitch(garbage);
        expect(result).toBe(false);

        // Assert zero state mutation
        const tel = glitchManager.getTelemetry();
        expect(tel.active).toBe(false);
        expect(tel.state).toBe('IDLE');
        expect(tel.type).toBeNull();
      }

      // Explicit empty string and whitespace default to random glitch (valid documented fallback)
      expect(cheat.triggerGlitch('')).toBe(true);
      cheat.clearGlitch();
      expect(cheat.triggerGlitch('   ')).toBe(true);
      cheat.clearGlitch();
    });

    it('2.2: successfully triggers all canonical glitch types and documented aliases', () => {
      const glitchTypes = [
        { input: 'teleport', expected: GlitchEventType.QUANTUM_TELEPORT },
        { input: 'quantum', expected: GlitchEventType.QUANTUM_TELEPORT },
        { input: 'kinetic', expected: GlitchEventType.KINETIC_INVERSION },
        { input: 'inversion', expected: GlitchEventType.KINETIC_INVERSION },
        { input: 'vector', expected: GlitchEventType.KINETIC_INVERSION },
        { input: 'mirage', expected: GlitchEventType.MIRAGE_CLONES },
        { input: 'clone', expected: GlitchEventType.MIRAGE_CLONES },
        { input: 'raster', expected: GlitchEventType.RASTER_TEAR },
        { input: 'tear', expected: GlitchEventType.RASTER_TEAR },
        { input: 'scanline', expected: GlitchEventType.RASTER_TEAR },
        { input: 'chroma', expected: GlitchEventType.CHROMATIC_ABERRATION },
        { input: 'chromatic', expected: GlitchEventType.CHROMATIC_ABERRATION },
        { input: 'xor', expected: GlitchEventType.XOR_NOISE },
        { input: 'noise', expected: GlitchEventType.XOR_NOISE },
        { input: 'hex', expected: GlitchEventType.HEX_SCRAMBLE },
        { input: 'scramble', expected: GlitchEventType.HEX_SCRAMBLE },
        { input: 'sector', expected: GlitchEventType.SECTOR_ANOMALY },
        { input: 'QUANTUM_TELEPORT', expected: GlitchEventType.QUANTUM_TELEPORT },
        { input: 'MIRAGE_CLONES', expected: GlitchEventType.MIRAGE_CLONES },
      ];

      for (const { input, expected } of glitchTypes) {
        const res = cheat.triggerGlitch(input);
        expect(res).toBe(true);

        const tel = game.glitchEventManager.getTelemetry();
        expect(tel.active).toBe(true);
        expect(tel.state).toBe('ACTIVE');
        expect(tel.type).toBe(expected);

        // Clear before next
        cheat.clearGlitch();
        expect(game.glitchEventManager.getTelemetry().active).toBe(false);
      }
    });

    it('2.3: executes 50 consecutive rapid triggerGlitch() -> clearGlitch() cycles with zero orphaned entities and clean enemy resets', () => {
      const glitchManager = game.glitchEventManager;
      const formation = game.formationManager;
      expect(formation).toBeDefined();
      expect(formation.phantomPool).toBeDefined();

      const testTypes = ['mirage', 'kinetic', 'teleport', 'raster', 'chroma', 'xor', 'hex', 'sector'];

      for (let cycle = 0; cycle < 50; cycle++) {
        const type = testTypes[cycle % testTypes.length]!;

        // 1. Trigger glitch
        const triggered = cheat.triggerGlitch(type);
        expect(triggered).toBe(true);

        // 2. Spawn phantom clones during mirage glitch to simulate active combat clones
        if (type === 'mirage' || cycle % 3 === 0) {
          formation.spawnMirageClones(100, 150, EnemyType.GOEI);
          expect(formation.phantomPool.getActiveCount()).toBeGreaterThan(0);
        }

        // 3. Mutate some diving enemies into glitched kinematic states
        const enemies = formation.getLivingEnemies();
        for (let eIdx = 0; eIdx < Math.min(4, enemies.length); eIdx++) {
          const enemy = enemies[eIdx]!;
          enemy.isGlitched = true;
          enemy.glitchOffsetX = 15.5;
          enemy.glitchOffsetY = -8.2;
          enemy.glitchDisplacementX = 22.0;
          enemy.glitchDisplacementY = -14.0;
          enemy.glitchKinematicVx = 75.0;
          enemy.glitchKinematicVy = 120.0;
        }

        // 4. Update simulation frame to tick glitch timers
        game.update(0.016);

        // 5. Immediately clear glitch
        cheat.clearGlitch();

        // 6. Assert strict post-clear invariants
        expect(formation.phantomPool.getActiveCount()).toBe(0);

        for (const enemy of formation.enemies) {
          if (enemy.active) {
            expect(enemy.isGlitched).toBe(false);
            expect(enemy.glitchOffsetX).toBe(0);
            expect(enemy.glitchOffsetY).toBe(0);
            expect(enemy.glitchDisplacementX).toBe(0);
            expect(enemy.glitchDisplacementY).toBe(0);
            expect(enemy.glitchKinematicVx).toBe(0);
            expect(enemy.glitchKinematicVy).toBe(0);
          }
        }

        const tel = glitchManager.getTelemetry();
        expect(tel.active).toBe(false);
        expect(tel.state).toBe('IDLE');
        expect(tel.type).toBeNull();
        expect(tel.isGlitchSector).toBe(false);
        expect(tel.timer).toBe(0);

        assertNoNaNCoordinates(game);
      }
    });

    it('2.4: triggers dedicated Glitch Sector anomaly on stages 13, 26, 38 with duration 9999', () => {
      const glitchSectors = [13, 26, 38];

      for (const stage of glitchSectors) {
        cheat.skipToStage(stage);

        const tel = game.glitchEventManager.getTelemetry();
        const gameState = cheat.getGameState();

        expect(tel.active).toBe(true);
        expect(tel.state).toBe('ACTIVE');
        expect(tel.type).toBe(GlitchEventType.SECTOR_ANOMALY);
        expect(tel.isGlitchSector).toBe(true);
        expect(tel.timer).toBeGreaterThan(9000); // 9999s persistent duration

        expect(gameState.glitch?.active).toBe(true);
        expect(gameState.glitch?.isGlitchSector).toBe(true);
        expect(gameState.glitch?.type).toBe(GlitchEventType.SECTOR_ANOMALY);
      }
    });

    it('2.5: immediately cleans up glitch sector state when skipping away from stages 13, 26, 38', () => {
      // 1. Skip to Stage 13 (Glitch Sector)
      cheat.skipToStage(13);
      expect(game.glitchEventManager.getTelemetry().isGlitchSector).toBe(true);

      // Spawn some mirage clones
      game.formationManager.spawnMirageClones(112, 100);
      expect(game.formationManager.phantomPool.getActiveCount()).toBe(2);

      // 2. Skip to Stage 14 (Normal Stage)
      cheat.skipToStage(14);
      let tel = game.glitchEventManager.getTelemetry();
      expect(tel.isGlitchSector).toBe(false);
      expect(tel.active).toBe(false);
      expect(tel.type).toBeNull();
      expect(game.formationManager.phantomPool.getActiveCount()).toBe(0);

      // 3. Skip to Stage 26 (Glitch Sector)
      cheat.skipToStage(26);
      expect(game.glitchEventManager.getTelemetry().isGlitchSector).toBe(true);

      // 4. Skip to Stage 27 (Challenging Stage - strictly immune)
      cheat.skipToStage(27);
      tel = game.glitchEventManager.getTelemetry();
      expect(tel.isGlitchSector).toBe(false);
      expect(tel.active).toBe(false);
      expect(tel.type).toBeNull();

      // 5. Skip to Stage 38 (Glitch Sector)
      cheat.skipToStage(38);
      expect(game.glitchEventManager.getTelemetry().isGlitchSector).toBe(true);

      // 6. Skip to Stage 40 (Epic Boss Stage - strictly immune)
      cheat.skipToStage(40);
      tel = game.glitchEventManager.getTelemetry();
      expect(tel.isGlitchSector).toBe(false);
      expect(tel.active).toBe(false);
      expect(tel.type).toBeNull();
    });

    it('2.6: enforces strict glitch immunity for all 12 Challenging Stages and Epic Boss encounters', () => {
      const challengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
      const bossStages = [10, 20, 30, 40, 50];

      // Challenging stages
      for (const st of challengingStages) {
        expect(DifficultyCalculator.isChallengingStage(st)).toBe(true);
        cheat.skipToStage(st);

        const tel = game.glitchEventManager.getTelemetry();
        expect(tel.active).toBe(false);
        expect(tel.isGlitchSector).toBe(false);
        expect(tel.type).toBeNull();
      }

      // Epic boss stages
      for (const st of bossStages) {
        cheat.skipToStage(st);

        const tel = game.glitchEventManager.getTelemetry();
        expect(tel.active).toBe(false);
        expect(tel.isGlitchSector).toBe(false);
        expect(tel.type).toBeNull();
      }
    });
  });

  // ==========================================================================
  // TARGET 3: Power-Up Spawn & Apply Fuzzing
  // ==========================================================================
  describe('Target 3: Power-Up Spawn & Apply Fuzzing', () => {
    it('3.1: saturates power-up pool to capacity 32 and safely rejects 33rd to 40th spawn attempts without crashing', () => {
      const manager = game.powerUpManager;
      expect(manager).toBeDefined();

      const pool = manager.getPool();
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getActiveCount()).toBe(0);

      const spawnResults: boolean[] = [];

      // Call spawnPowerUp 40 consecutive times
      for (let i = 0; i < 40; i++) {
        const result = cheat.spawnPowerUp('rapid_fire', 30 + (i % 8) * 20, 40 + Math.floor(i / 8) * 15);
        spawnResults.push(result);
      }

      // Exactly first 32 calls succeed (true)
      for (let i = 0; i < 32; i++) {
        expect(spawnResults[i]).toBe(true);
      }

      // Calls 33 through 40 must safely return false (zero crashes)
      for (let i = 32; i < 40; i++) {
        expect(spawnResults[i]).toBe(false);
      }

      // Verify pool state invariants
      expect(pool.getActiveCount()).toBe(32);
      expect(pool.getFreeCount()).toBe(0);
      expect(pool.isFull()).toBe(true);
      expect(pool.getCapacity()).toBe(32); // Strictly NO dynamic auto-expansion
      expect(manager.getActiveCount()).toBe(32);

      // Verify gameState reflects exactly 32 active items
      const gameState = cheat.getGameState();
      expect(gameState.powerups?.activeItemCount).toBe(32);
    });

    it('3.2: recycles all 32 leased power-ups upon stage skip or reset without memory leaks', () => {
      // Saturate pool
      for (let i = 0; i < 32; i++) {
        cheat.spawnPowerUp('reflection_shield');
      }
      expect(game.powerUpManager.getActiveCount()).toBe(32);

      // Skip stage
      cheat.skipToStage(2);

      // Assert complete pool flush
      const pool = game.powerUpManager.getPool();
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(32);
      expect(pool.isFull()).toBe(false);
      expect(game.powerUpManager.getActiveCount()).toBe(0);

      // Can re-acquire all 32 items immediately
      for (let i = 0; i < 32; i++) {
        expect(cheat.spawnPowerUp('chrono_field')).toBe(true);
      }
      expect(pool.getActiveCount()).toBe(32);
    });

    it('3.3: successfully applies all 10 power-up types and canonical aliases via applyPowerUp', () => {
      const testCases = [
        { name: 'rapid', buffKey: 'rapidFireTimer', minVal: 8.0 },
        { name: 'rapid_fire', buffKey: 'rapidFireTimer', minVal: 8.0 },
        { name: 'overclock', buffKey: 'rapidFireTimer', minVal: 8.0 },
        { name: 'shield', buffKey: 'hasShield', boolVal: true },
        { name: 'kinetic_shield', buffKey: 'hasShield', boolVal: true },
        { name: 'barrier', buffKey: 'hasShield', boolVal: true },
        { name: 'scatter', buffKey: 'scatterShotTimer', minVal: 8.0 },
        { name: 'scatter_shot', buffKey: 'scatterShotTimer', minVal: 8.0 },
        { name: 'multishot', buffKey: 'scatterShotTimer', minVal: 8.0 },
        { name: 'booster', buffKey: 'engineBoosterTimer', minVal: 8.0 },
        { name: 'speed', buffKey: 'engineBoosterTimer', minVal: 8.0 },
        { name: 'chrono', buffKey: 'chronoFieldTimer', minVal: 6.0 },
        { name: 'time_dilation', buffKey: 'chronoFieldTimer', minVal: 6.0 },
        { name: 'reflection', buffKey: 'hasReflectionShield', boolVal: true },
        { name: 'reflect', buffKey: 'hasReflectionShield', boolVal: true },
        { name: 'collector', buffKey: 'empCollectorTimer', minVal: 5.0 },
        { name: 'singularity', buffKey: 'empCollectorTimer', minVal: 5.0 },
        { name: 'phase', buffKey: 'phaseDriveTimer', minVal: 15.0 },
        { name: 'warp_drive', buffKey: 'phaseDriveTimer', minVal: 15.0 },
        { name: 'plasma', buffKey: 'plasmaBlasterTimer', minVal: 7.0 },
        { name: 'antimatter', buffKey: 'plasmaBlasterTimer', minVal: 7.0 },
        { name: 'plasma_blaster', buffKey: 'plasmaBlasterTimer', minVal: 7.0 },
      ];

      for (const tc of testCases) {
        // Reset before each test
        game.powerUpManager.reset();

        const success = cheat.applyPowerUp(tc.name);
        expect(success).toBe(true);

        const buffs = game.powerUpManager.getActiveBuffs();
        if (tc.boolVal !== undefined) {
          expect((buffs as any)[tc.buffKey]).toBe(tc.boolVal);
        } else if (tc.minVal !== undefined) {
          expect((buffs as any)[tc.buffKey]).toBeGreaterThanOrEqual(tc.minVal);
        }
      }

      // Test EMP Bomb immediate screen-clear detonation & bonus score
      const initialScore = game.score;
      expect(cheat.applyPowerUp('emp')).toBe(true);
      expect(game.score).toBe(initialScore + 500);

      expect(cheat.applyPowerUp('bomb')).toBe(true);
      expect(game.score).toBe(initialScore + 1000);
    });

    it('3.4: rejects invalid and malformed power-up names with safe boolean return and zero player corruption', () => {
      const invalidNames = [
        '',
        '   ',
        'invalid_powerup',
        'super_nuke',
        'god_mode',
        '123456',
        '!@#$%^',
        'null',
        'undefined',
        'NaN',
        'nuclear_missile',
        'death_ray',
      ];

      for (const invalid of invalidNames) {
        expect(cheat.applyPowerUp(invalid)).toBe(false);
        expect(cheat.spawnPowerUp(invalid)).toBe(false);
      }

      // Assert zero buffs applied
      const buffs = game.powerUpManager.getActiveBuffs();
      expect(buffs.rapidFireTimer).toBe(0);
      expect(buffs.scatterShotTimer).toBe(0);
      expect(buffs.engineBoosterTimer).toBe(0);
      expect(buffs.hasShield).toBe(false);
      expect(buffs.chronoFieldTimer).toBe(0);
      expect(buffs.hasReflectionShield).toBe(false);
      expect(buffs.empCollectorTimer).toBe(0);
      expect(buffs.phaseDriveTimer).toBe(0);
      expect(buffs.plasmaBlasterTimer).toBe(0);

      assertNoNaNCoordinates(game);
    });

    it('3.5: verifies getGameState().powerups accurately reflects active buff timers, flags, and item count', () => {
      // Transition to PLAYING state to allow update loop execution
      cheat.skipToStage(1);

      // 1. Initial State
      let gs = cheat.getGameState();
      expect(gs.powerups).toBeDefined();
      expect(gs.powerups?.activeItemCount).toBe(0);
      expect(gs.powerups?.activeBuffs.rapidFireTimer).toBe(0);
      expect(gs.powerups?.activeBuffs.hasShield).toBe(false);
      expect(gs.powerups?.activeBuffs.hasReflectionShield).toBe(false);

      // 2. Spawn 3 powerups
      cheat.spawnPowerUp('rapid_fire');
      cheat.spawnPowerUp('reflection_shield');
      cheat.spawnPowerUp('chrono_field');

      gs = cheat.getGameState();
      expect(gs.powerups?.activeItemCount).toBe(3);

      // 3. Apply multiple buffs
      cheat.applyPowerUp('chrono_field');
      cheat.applyPowerUp('reflection_shield');
      cheat.applyPowerUp('plasma');

      gs = cheat.getGameState();
      expect(gs.powerups?.activeBuffs.chronoFieldTimer).toBeGreaterThanOrEqual(6.0);
      expect(gs.powerups?.activeBuffs.hasReflectionShield).toBe(true);
      expect(gs.powerups?.activeBuffs.reflectionShieldTimer).toBeGreaterThanOrEqual(12.0);
      expect(gs.powerups?.activeBuffs.plasmaBlasterTimer).toBeGreaterThanOrEqual(7.0);

      // 4. Tick simulation by 2 seconds in PLAYING state
      game.update(2.0);

      gs = cheat.getGameState();
      expect(gs.powerups?.activeBuffs.chronoFieldTimer).toBeCloseTo(4.0, 1);
      expect(gs.powerups?.activeBuffs.plasmaBlasterTimer).toBeCloseTo(5.0, 1);
      expect(gs.powerups?.activeBuffs.reflectionShieldTimer).toBeCloseTo(10.0, 1);

      // 5. Stage skip flushes both active buffs and active items
      cheat.skipToStage(5);

      gs = cheat.getGameState();
      expect(gs.powerups?.activeItemCount).toBe(0);
      expect(gs.powerups?.activeBuffs.chronoFieldTimer).toBe(0);
      expect(gs.powerups?.activeBuffs.hasReflectionShield).toBe(false);
      expect(gs.powerups?.activeBuffs.plasmaBlasterTimer).toBe(0);
    });
  });
});
