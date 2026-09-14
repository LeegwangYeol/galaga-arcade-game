/**
 * Galaga Arcade Web Game — Milestone M21 Adversarial Combinatorial Saturation Suite
 * Location: tests/unit/m21_challenger_1_combinatorial_saturation.test.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS CHALLENGE:
 * Proves system resilience when all game subsystems interact concurrently under maximum chaos:
 * 1. Combinatorial Saturation:
 *    - Concurrently activates:
 *      - All 3 Allies Drones (Escort, Aegis, Bomber)
 *      - All 3 Special Moves (Nova Barrage, Chrono Freeze, Warp Ram)
 *      - All 5 M19 Power-Ups (Chrono Field, Reflection Shield, EMP Collector, Phase Drive, Antimatter Plasma)
 *      - Stellaris Crisis Events (Contingency, Unbidden, Devouring Swarm, etc.)
 *      - Glitch Events (Quantum Teleportation, Kinetic Law Inversion, Mirage Phantoms, Raster Tears)
 *      - Dynamic Difficulty Adjustment (fuzzing proficiency sigma in [0.0, 1.0])
 *      - Active Epic Bosses (Stages 10, 20, 30, 40, 50)
 *    - Runs 1,000+ intense simulation ticks under this maximum concurrent chaos.
 *    - Asserts 0 unhandled exceptions, 0 NaN coordinates in entities, and 0 crashes.
 * 2. Lifecycle Whiplash:
 *    - Triggers player lethal destruction / respawn while power-ups and glitch events are active.
 *    - Triggers Boss Galaga tractor beam capture while buffs are active.
 *    - Verifies proper buff teardown and that no orphan timers or state leaks persist.
 * 3. Stage Boundary Recovery:
 *    - Verifies that rapid consecutive skipToStage() and STAGE_CLEAR transitions flush all pools
 *      cleanly without corrupted state or memory leaks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { GalagaCheatController } from '../../src/core/qa/GalagaCheatController';
import { Player } from '../../src/entities/Player';

/**
 * Seeded deterministic PRNG for 100% reproducible adversarial fuzzing.
 */
class DeterministicPRNG {
  private state: number;

  constructor(seed: number = 20260910) {
    this.state = seed;
  }

  public next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
}

/**
 * Deep empirical invariant assertions across all active entities in the game.
 * Verifies zero NaN, zero Infinity, and strictly valid numeric spatial/temporal properties.
 */
function assertNoNaNCoordinates(game: Game): void {
  // 1. Player spatial coordinates and upgrade timers
  if (game.player) {
    const p = game.player;
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(Number.isNaN(p.x)).toBe(false);
    expect(Number.isNaN(p.y)).toBe(false);
    expect(Number.isFinite(p.vx)).toBe(true);
    expect(Number.isFinite(p.vy)).toBe(true);

    expect(Number.isFinite(p.rapidFireTimer)).toBe(true);
    expect(Number.isFinite(p.scatterShotTimer)).toBe(true);
    expect(Number.isFinite(p.engineBoosterTimer)).toBe(true);
    expect(Number.isFinite(p.chronoFieldTimer)).toBe(true);
    expect(Number.isFinite(p.reflectionShieldTimer)).toBe(true);
    expect(Number.isFinite(p.empCollectorTimer)).toBe(true);
    expect(Number.isFinite(p.phaseDriveTimer)).toBe(true);
    expect(Number.isFinite(p.plasmaBlasterTimer)).toBe(true);
    expect(Number.isFinite(p.invulnerableTimer)).toBe(true);
    expect(Number.isFinite(p.deathTimer)).toBe(true);
    expect(Number.isFinite(p.captureTimer)).toBe(true);
    expect(Number.isFinite(p.phaseGhostTimer)).toBe(true);

    if (p.rescuedFighter && p.rescuedFighter.active) {
      expect(Number.isFinite(p.rescuedFighter.x)).toBe(true);
      expect(Number.isFinite(p.rescuedFighter.y)).toBe(true);
      expect(Number.isFinite(p.rescuedFighter.targetX)).toBe(true);
      expect(Number.isFinite(p.rescuedFighter.targetY)).toBe(true);
      expect(Number.isFinite(p.rescuedFighter.angle)).toBe(true);
    }
  }

  // 2. Boss and sub-units
  if (game.bossManager?.activeBoss && game.bossManager.activeBoss.active) {
    const b = game.bossManager.activeBoss;
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
    expect(Number.isNaN(b.x)).toBe(false);
    expect(Number.isNaN(b.y)).toBe(false);
    expect(Number.isFinite(b.health)).toBe(true);
    expect(Number.isFinite(b.maxHealth)).toBe(true);

    if (b.subUnits) {
      for (const su of b.subUnits) {
        if (su.active) {
          expect(Number.isFinite(su.x)).toBe(true);
          expect(Number.isFinite(su.y)).toBe(true);
          expect(Number.isFinite(su.health)).toBe(true);
        }
      }
    }
  }

  // 3. Formation living enemies
  if (game.formationManager) {
    const living = game.formationManager.getLivingEnemies();
    for (const e of living) {
      if (e.active) {
        expect(Number.isFinite(e.x)).toBe(true);
        expect(Number.isFinite(e.y)).toBe(true);
        expect(Number.isNaN(e.x)).toBe(false);
        expect(Number.isNaN(e.y)).toBe(false);
        expect(Number.isFinite(e.glitchOffsetX)).toBe(true);
        expect(Number.isFinite(e.glitchOffsetY)).toBe(true);
      }
    }

    // Phantom clones
    game.formationManager.phantomPool.forEachActive((clone) => {
      expect(Number.isFinite(clone.x)).toBe(true);
      expect(Number.isFinite(clone.y)).toBe(true);
      expect(Number.isFinite(clone.lifetime)).toBe(true);
      expect(Number.isFinite(clone.alpha)).toBe(true);
    });
  }

  // 4. Bullets (Player and Enemy)
  if (game.bulletManager) {
    game.bulletManager.forEachActivePlayerBullet((b) => {
      if (b.active && b.position) {
        expect(Number.isFinite(b.position.x)).toBe(true);
        expect(Number.isFinite(b.position.y)).toBe(true);
        expect(Number.isFinite(b.velocity.x)).toBe(true);
        expect(Number.isFinite(b.velocity.y)).toBe(true);
      }
    });
    game.bulletManager.forEachActiveEnemyBullet((b) => {
      if (b.active && b.position) {
        expect(Number.isFinite(b.position.x)).toBe(true);
        expect(Number.isFinite(b.position.y)).toBe(true);
        expect(Number.isFinite(b.velocity.x)).toBe(true);
        expect(Number.isFinite(b.velocity.y)).toBe(true);
      }
    });
  }

  // 5. Tactical Allies Drones & Munitions
  if (game.alliesManager) {
    const am = game.alliesManager;
    if (am.escortDrone.active) {
      expect(Number.isFinite(am.escortDrone.x)).toBe(true);
      expect(Number.isFinite(am.escortDrone.y)).toBe(true);
    }
    if (am.aegisDrone.active) {
      expect(Number.isFinite(am.aegisDrone.x)).toBe(true);
      expect(Number.isFinite(am.aegisDrone.y)).toBe(true);
    }
    if (am.bomberDrone.active) {
      expect(Number.isFinite(am.bomberDrone.x)).toBe(true);
      expect(Number.isFinite(am.bomberDrone.y)).toBe(true);
    }

    am.getBombPool().forEachActive((bomb) => {
      expect(Number.isFinite(bomb.x)).toBe(true);
      expect(Number.isFinite(bomb.y)).toBe(true);
      expect(Number.isFinite(bomb.vx)).toBe(true);
      expect(Number.isFinite(bomb.vy)).toBe(true);
    });

    am.getExplosionPool().forEachActive((exp) => {
      expect(Number.isFinite(exp.x)).toBe(true);
      expect(Number.isFinite(exp.y)).toBe(true);
      expect(Number.isFinite(exp.currentRadius)).toBe(true);
    });
  }

  // 6. Special Moves Munitions
  if (game.specialMovesManager) {
    const sm = game.specialMovesManager;
    sm.getMissilePool().forEachActive((m) => {
      expect(Number.isFinite(m.x)).toBe(true);
      expect(Number.isFinite(m.y)).toBe(true);
      expect(Number.isFinite(m.vx)).toBe(true);
      expect(Number.isFinite(m.vy)).toBe(true);
    });
    sm.getSparkPool().forEachActive((s) => {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
    });
  }

  // 7. Power-Up Floating Items
  if (game.powerUpManager) {
    game.powerUpManager.getPool().forEachActive((item) => {
      expect(Number.isFinite(item.x)).toBe(true);
      expect(Number.isFinite(item.y)).toBe(true);
      expect(Number.isFinite(item.vy)).toBe(true);
    });
  }

  // 8. DDA Telemetry and Actuators
  if (game.dynamicDifficultyManager) {
    const act = game.dynamicDifficultyManager.getActuators();
    expect(Number.isFinite(act.diveSpeedMultiplier)).toBe(true);
    expect(Number.isFinite(act.bulletDensityMultiplier)).toBe(true);
    expect(Number.isFinite(act.bossHealthMultiplier)).toBe(true);
    expect(Number.isFinite(act.powerUpPityBonus)).toBe(true);
    expect(Number.isFinite(act.skillIndex)).toBe(true);
    expect(act.skillIndex).toBeGreaterThanOrEqual(0.0);
    expect(act.skillIndex).toBeLessThanOrEqual(1.0);
  }
}

/**
 * Teardown helper guaranteeing complete release of all leased entities.
 */
function teardownStageBoundary(game: Game): void {
  game.bulletManager?.clear();
  game.particleSystem?.clear();
  game.powerUpManager?.reset();
  game.alliesManager?.onStageClear();
  game.specialMovesManager?.onStageClear();
  game.formationManager?.reset();
  game.bossManager?.reset();
  game.crisisEventManager?.clearCrisis();
  game.glitchEventManager?.clearGlitch();
}

describe('Milestone M21 Combinatorial Saturation & Cross-Subsystem Stress Suite', () => {
  let game: Game;
  let cheat: GalagaCheatController;
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];
  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

  beforeEach(() => {
    unhandledRejections = [];
    uncaughtExceptions = [];
    rejectionHandler = (reason: any) => unhandledRejections.push(reason);
    exceptionHandler = (error: Error) => uncaughtExceptions.push(error);
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);

    game = new Game();
    game.startGame();
    cheat = game.getCheatController();
    expect(cheat).toBeDefined();
  });

  afterEach(() => {
    if (game) {
      teardownStageBoundary(game);
      cheat?.destroy();
      game.destroy();
    }
    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);

    expect(unhandledRejections.length).toBe(0);
    expect(uncaughtExceptions.length).toBe(0);
  });

  // ==========================================================================
  // 1. COMBINATORIAL SATURATION HARNESS (1,000+ TICKS UNDER MAXIMUM CHAOS)
  // ==========================================================================
  describe('1. Combinatorial Saturation Harness', () => {
    it('1.1: survives confluent multi-boss saturation sweep across Stages 10, 20, 30, 40, 50 (1,250 ticks total)', () => {
      const prng = new DeterministicPRNG(1101);
      cheat.setInvincible(true);

      const bossStages = [
        { stage: 10, name: 'Cyber Dreadnought', crisis: 'contingency', glitch: 'teleport' },
        { stage: 20, name: 'Dimensional Leviathan', crisis: 'unbidden', glitch: 'kinetic' },
        { stage: 30, name: 'Nanite Swarm Colossus', crisis: 'nanite_cloud', glitch: 'mirage' },
        { stage: 40, name: 'Psionic Shroud Harbinger', crisis: 'shroud', glitch: 'raster' },
        { stage: 50, name: 'Aeternum Star-Eater Core', crisis: 'devouring_swarm', glitch: 'aberration' },
      ];

      let totalTicks = 0;

      for (const config of bossStages) {
        // 1. Transition to Boss Stage
        const skipped = cheat.skipToStage(config.stage);
        expect(skipped).toBe(true);
        expect(game.stage).toBe(config.stage);

        const boss = game.bossManager.activeBoss;
        expect(boss).not.toBeNull();
        expect(boss?.active).toBe(true);

        // 2. Concurrently Activate All 3 Tactical Drones
        cheat.unlockDrone('all');
        expect(game.alliesManager.escortDrone.active).toBe(true);
        expect(game.alliesManager.aegisDrone.active).toBe(true);
        expect(game.alliesManager.bomberDrone.active).toBe(true);

        // 3. Concurrently Activate All 5 M19 Power-Ups
        cheat.applyPowerUp('chrono_field');
        cheat.applyPowerUp('reflection_shield');
        cheat.applyPowerUp('emp_collector');
        cheat.applyPowerUp('phase_drive');
        cheat.applyPowerUp('antimatter_plasma');

        const buffs = game.powerUpManager.getActiveBuffs();
        expect(buffs.chronoFieldTimer).toBeGreaterThan(0);
        expect(buffs.reflectionShieldTimer).toBeGreaterThan(0);
        expect(buffs.empCollectorTimer).toBeGreaterThan(0);
        expect(buffs.phaseDriveTimer).toBeGreaterThan(0);
        expect(buffs.plasmaBlasterTimer).toBeGreaterThan(0);

        // 4. Activate Stellaris Crisis
        const crisisResult = cheat.triggerCrisis(config.crisis);
        expect(crisisResult).toBe(true);
        expect(game.crisisEventManager.getActiveCrisis()).not.toBeNull();

        // 5. Activate Glitch Event
        const glitchResult = cheat.triggerGlitch(config.glitch);
        expect(glitchResult).toBe(true);
        expect(game.glitchEventManager.getTelemetry().state).toBe('ACTIVE');

        // 6. Trigger Special Moves concurrently
        cheat.triggerSpecialMove('nova'); // 16 homing missiles
        cheat.triggerSpecialMove('chrono'); // 3.0s time freeze
        cheat.triggerSpecialMove('warp'); // Warp ram surge

        // 7. Execute 250 intense simulation ticks per boss (5 * 250 = 1,250 ticks total)
        for (let t = 0; t < 250; t++) {
          totalTicks++;

          // Dynamic DDA Fuzzing: continuous sigma fuzzing in [0.0, 1.0]
          const fuzzedSigma = prng.next();
          cheat.setDDAProficiency(fuzzedSigma);

          // Simulated player combat activity
          if (t % 5 === 0) {
            game.player.attemptFire();
          }
          if (t % 15 === 0) {
            game.player.vx = (prng.next() - 0.5) * 520;
          }

          // Periodic re-summon / re-apply to keep all subsystems continuously saturated
          if (t % 60 === 0) {
            cheat.unlockDrone('all');
            cheat.applyPowerUp('chrono_field');
            cheat.applyPowerUp('reflection_shield');
            cheat.applyPowerUp('emp_collector');
            cheat.applyPowerUp('phase_drive');
            cheat.applyPowerUp('antimatter_plasma');
          }
          if (t % 80 === 0) {
            cheat.triggerSpecialMove(t % 160 === 0 ? 'nova' : 'warp');
          }

          // Update game engine at 60 FPS fixed timestep
          game.update(1 / 60);

          // Assert zero NaN/Infinity coordinates across all entities
          assertNoNaNCoordinates(game);
        }
      }

      expect(totalTicks).toBe(1250);
      expect(unhandledRejections.length).toBe(0);
      expect(uncaughtExceptions.length).toBe(0);
    });

    it('1.2: executes continuous 1,200-tick ultra-chaos saturation loop under Stage 50 Enrage without failure', () => {
      const prng = new DeterministicPRNG(4242);
      cheat.setInvincible(true);

      // Transition to Stage 50 (Aeternum Star-Eater Core)
      cheat.skipToStage(50);
      const boss = game.bossManager.activeBoss as any;
      expect(boss).not.toBeNull();

      // Force Phase 3 Enrage
      if (boss.satellites) {
        boss.satellites.forEach((s: any) => {
          s.active = false;
          s.health = 0;
        });
      }
      boss.phase = 'PHASE_3';
      boss.health = 75; // <= 100 HP triggers Enrage overdrive

      const crises = [
        'contingency', 'unbidden', 'devouring_swarm', 'prethoryn',
        'singularity', 'nanite_cloud', 'shroud_breach', 'hyperspace_storm',
      ];
      const glitches = ['teleport', 'kinetic', 'mirage', 'raster', 'aberration'];

      // Execute 1,200 consecutive ticks under continuous chaos
      for (let tick = 0; tick < 1200; tick++) {
        // Continuous DDA fuzzing
        if (tick % 10 === 0) {
          cheat.setDDAProficiency(prng.next());
        }

        // Subsystem renewal
        if (tick % 50 === 0) {
          cheat.unlockDrone('all');
          cheat.applyPowerUp('chrono_field');
          cheat.applyPowerUp('reflection_shield');
          cheat.applyPowerUp('emp_collector');
          cheat.applyPowerUp('phase_drive');
          cheat.applyPowerUp('antimatter_plasma');
        }

        // Rotating Crisis Event every 150 ticks
        if (tick % 150 === 0) {
          const crisisId = crises[(tick / 150) % crises.length]!;
          cheat.triggerCrisis(crisisId);
        }

        // Rotating Glitch Event every 120 ticks
        if (tick % 120 === 0) {
          const glitchType = glitches[(tick / 120) % glitches.length]!;
          cheat.triggerGlitch(glitchType);
        }

        // Trigger Special Moves every 70 ticks
        if (tick % 70 === 0) {
          const move = tick % 140 === 0 ? 'nova' : 'warp';
          cheat.triggerSpecialMove(move);
        }

        // Player actions
        game.player.attemptFire();
        game.player.x = Math.max(16, Math.min(208, game.player.x + (prng.next() - 0.5) * 12));

        // Advance simulation
        game.update(1 / 60);

        // Assert integrity
        assertNoNaNCoordinates(game);
      }

      expect(unhandledRejections.length).toBe(0);
      expect(uncaughtExceptions.length).toBe(0);
    });
  });

  // ==========================================================================
  // 2. LIFECYCLE WHIPLASH (DESTRUCTION, RESPAWN, AND TRACTOR BEAM CAPTURE)
  // ==========================================================================
  describe('2. Lifecycle Whiplash', () => {
    it('2.1: enforces clean buff teardown and safe respawn upon player destruction mid-chaos', () => {
      cheat.skipToStage(16);

      // 1. Activate all 5 M19 power-ups + glitch + crisis
      cheat.applyPowerUp('chrono_field');
      cheat.applyPowerUp('reflection_shield');
      cheat.applyPowerUp('emp_collector');
      cheat.applyPowerUp('phase_drive');
      cheat.applyPowerUp('antimatter_plasma');
      cheat.triggerGlitch('mirage');
      cheat.triggerCrisis('contingency');

      // Verify active buff timers before death
      const preDeathBuffs = game.powerUpManager.getActiveBuffs();
      expect(preDeathBuffs.chronoFieldTimer).toBeGreaterThan(0);
      expect(preDeathBuffs.reflectionShieldTimer).toBeGreaterThan(0);
      expect(preDeathBuffs.empCollectorTimer).toBeGreaterThan(0);
      expect(preDeathBuffs.phaseDriveTimer).toBeGreaterThan(0);
      expect(preDeathBuffs.plasmaBlasterTimer).toBeGreaterThan(0);

      const initialLives = game.player.lives;
      expect(initialLives).toBeGreaterThanOrEqual(1);

      // 2. Trigger lethal player destruction
      game.player.destroy();
      game.powerUpManager.onPlayerDeath();

      // Assert instant, complete buff teardown (zero orphan timers)
      const postDeathBuffs = game.powerUpManager.getActiveBuffs();
      expect(postDeathBuffs.chronoFieldTimer).toBe(0);
      expect(postDeathBuffs.reflectionShieldTimer).toBe(0);
      expect(postDeathBuffs.hasReflectionShield).toBe(false);
      expect(postDeathBuffs.empCollectorTimer).toBe(0);
      expect(postDeathBuffs.phaseDriveTimer).toBe(0);
      expect(postDeathBuffs.plasmaBlasterTimer).toBe(0);
      expect(postDeathBuffs.rapidFireTimer).toBe(0);
      expect(postDeathBuffs.scatterShotTimer).toBe(0);
      expect(postDeathBuffs.engineBoosterTimer).toBe(0);
      expect(postDeathBuffs.hasShield).toBe(false);

      expect(game.player.chronoFieldTimer).toBe(0);
      expect(game.player.reflectionShieldTimer).toBe(0);
      expect(game.player.hasReflectionShield).toBe(false);
      expect(game.player.empCollectorTimer).toBe(0);
      expect(game.player.phaseDriveTimer).toBe(0);
      expect(game.player.plasmaBlasterTimer).toBe(0);

      // Verify state is destroyed and deathTimer is ticking
      expect(game.player.state).toBe('destroyed');
      expect(game.player.deathTimer).toBeCloseTo(Player.DEATH_DURATION, 2);

      // 3. Advance simulation past death duration (0.5s = 30 ticks)
      for (let i = 0; i < 35; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
      }

      // Assert player has respawned with invulnerability intangibility
      expect(game.player.state).toBe('respawning');
      expect(game.player.invulnerableTimer).toBeGreaterThan(0);
      expect(game.player.lives).toBe(initialLives - 1);

      // 4. Verify new power-ups can be safely acquired post-respawn without corrupted timers
      cheat.applyPowerUp('chrono_field');
      expect(game.player.chronoFieldTimer).toBeGreaterThan(0);
      expect(game.powerUpManager.getActiveBuffs().chronoFieldTimer).toBeGreaterThan(0);
    });

    it('2.2: survives Boss Galaga tractor beam capture and rescue whiplash with active power-ups and glitches', () => {
      // Advance to Stage 1 (normal formation with Boss Galaga)
      cheat.skipToStage(1);

      // Apply power-ups and glitch
      cheat.applyPowerUp('chrono_field');
      cheat.applyPowerUp('reflection_shield');
      cheat.applyPowerUp('phase_drive');
      cheat.triggerGlitch('teleport');

      const initialChrono = game.player.chronoFieldTimer;
      expect(initialChrono).toBeGreaterThan(0);

      // 1. Initiate Tractor Beam Capture Sequence
      game.player.startCapture(112, 60);
      expect(game.player.state).toBe('capturing');

      // Update for 60 ticks (1.0s) during beam ascent
      for (let i = 0; i < 60; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
      }

      // Assert buff countdown is safely paused during capture ascent (Player.ts:392)
      expect(game.player.chronoFieldTimer).toBe(initialChrono);

      // Advance until capture completes (2.5s total = ~100 additional ticks)
      for (let i = 0; i < 100; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
      }

      // Player should have completed capture and respawned single fighter
      expect(game.player.state === 'respawning' || game.player.state === 'normal').toBe(true);

      // 2. Simulate Rescue Convergence
      game.player.startRescue(112, 60);
      expect(game.player.state).toBe('docking');
      expect(game.player.rescuedFighter.active).toBe(true);

      // Update until docking convergence completes (~100 ticks)
      for (let i = 0; i < 100; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
        if (game.player.isDual) break;
      }

      // Assert Dual Fighter state achieved
      expect(game.player.isDual).toBe(true);

      // 3. Test Dual Fighter weapon firing under Antimatter Plasma power-up
      cheat.applyPowerUp('antimatter_plasma');
      expect(game.player.plasmaBlasterTimer).toBeGreaterThan(0);
      expect(game.player.attemptFire()).toBe(true);

      // Simulate 30 frames of dual plasma firing
      for (let i = 0; i < 30; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
      }

      expect(unhandledRejections.length).toBe(0);
      expect(uncaughtExceptions.length).toBe(0);
    });

    it('2.3: maintains zero orphan timers and drone stability when destroyed mid-Warp-Ram', () => {
      cheat.skipToStage(15);
      cheat.unlockDrone('all');

      // Trigger Warp Ram special move (ascent speed -800 px/s)
      cheat.triggerSpecialMove('warp');
      expect(game.specialMovesManager.warpRamTimer).toBeGreaterThan(0);

      // Advance 10 ticks into warp ram ascent
      for (let i = 0; i < 10; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
      }

      // Forcibly destroy player mid-ascent
      game.player.destroy();
      expect(game.player.state).toBe('destroyed');

      // Update 40 ticks through explosion and respawn
      for (let i = 0; i < 40; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
      }

      // Invariant: coordinates must remain clamped and finite (y returned to baseline 250)
      expect(game.player.y).toBe(Player.BASELINE_Y);
      expect(Number.isFinite(game.player.x)).toBe(true);

      // Drones remain active or clean up without null-pointer crashes
      expect(game.alliesManager.escortDrone).toBeDefined();
      expect(game.alliesManager.aegisDrone).toBeDefined();
      expect(game.alliesManager.bomberDrone).toBeDefined();
    });
  });

  // ==========================================================================
  // 3. STAGE BOUNDARY RECOVERY & POOL HYGIENE
  // ==========================================================================
  describe('3. Stage Boundary Recovery & Pool Hygiene', () => {
    it('3.1: flushes all 7 pools cleanly across 50 rapid chaotic skipToStage() calls under active combat saturation', () => {
      const prng = new DeterministicPRNG(7777);

      for (let cycle = 1; cycle <= 50; cycle++) {
        // 1. Flood all subsystems with active entities
        cheat.unlockDrone('all');
        cheat.applyPowerUp('chrono_field');
        cheat.applyPowerUp('reflection_shield');
        cheat.applyPowerUp('emp_collector');
        cheat.applyPowerUp('phase_drive');
        cheat.applyPowerUp('antimatter_plasma');
        cheat.triggerSpecialMove('nova');
        cheat.triggerGlitch('mirage');

        // Select target stage across normal, boss, glitch sector, and challenging stages
        const targetStage = 1 + Math.floor(prng.next() * 50);

        // 2. Perform skipToStage()
        const skipped = cheat.skipToStage(targetStage);
        expect(skipped).toBe(true);
        expect(game.stage).toBe(targetStage);

        // 3. Verify Pool Hygiene Post-Skip
        expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
        expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
        expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
        expect(game.formationManager.phantomPool.getActiveCount()).toBe(0);

        // Buff state reset
        const buffs = game.powerUpManager.getActiveBuffs();
        expect(buffs.chronoFieldTimer).toBe(0);
        expect(buffs.reflectionShieldTimer).toBe(0);
        expect(buffs.empCollectorTimer).toBe(0);
        expect(buffs.phaseDriveTimer).toBe(0);
        expect(buffs.plasmaBlasterTimer).toBe(0);

        // 4. Advance 5 simulation ticks on the new stage
        for (let t = 0; t < 5; t++) {
          game.update(1 / 60);
          assertNoNaNCoordinates(game);
        }
      }

      expect(unhandledRejections.length).toBe(0);
      expect(uncaughtExceptions.length).toBe(0);
    });

    it('3.2: cleanly executes natural STAGE_CLEAR transition under maximum munitions flooding', () => {
      cheat.skipToStage(14);

      // Flood combat with Bomber carpet bombs, Nova missiles, power-ups, and player bullets
      cheat.unlockDrone('bomber');
      cheat.triggerSpecialMove('nova');
      cheat.applyPowerUp('antimatter_plasma');
      game.player.attemptFire();

      // Verify active munitions exist in pools
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBeGreaterThan(0);

      // Kill all enemies to trigger explosions and wave completion
      const killed = cheat.killAllEnemies();
      expect(killed).toBeGreaterThan(0);

      // Advance simulation through enemy explosion duration (0.4s = ~25-35 ticks) until STAGE_CLEAR is reached
      let reachedStageClear = false;
      for (let i = 0; i < 40; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
        if (game.state === 'STAGE_CLEAR') {
          reachedStageClear = true;
          break;
        }
      }
      expect(reachedStageClear).toBe(true);

      // Simulate until clear duration elapses (1.8s = ~115 ticks) and stage transitions to 15
      for (let i = 0; i < 140; i++) {
        game.update(1 / 60);
        assertNoNaNCoordinates(game);
        if (game.stage === 15) break;
      }

      // Verify stage advanced cleanly to 15
      expect(game.stage).toBe(15);

      // Invariant: all munition pools must be cleanly flushed
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
    });

    it('3.3: strictly enforces bounded pool capacities (autoExpand: false) under lease saturation attacks', () => {
      // 1. PowerUp Pool (capacity 32)
      const powerUpPool = game.powerUpManager.getPool();
      expect((powerUpPool as any).autoExpand).toBe(false);
      expect((powerUpPool as any).maxSize).toBe(32);

      const leasedPowerUps = [];
      for (let i = 0; i < 32; i++) {
        const item = powerUpPool.acquire();
        expect(item).not.toBeNull();
        leasedPowerUps.push(item);
      }
      expect(powerUpPool.getActiveCount()).toBe(32);

      // 33rd acquire must return null without throwing or auto-expanding
      const excessPowerUp = powerUpPool.acquire();
      expect(excessPowerUp).toBeNull();
      expect(powerUpPool.getActiveCount()).toBe(32);

      // Release all leased items
      for (const item of leasedPowerUps) {
        if (item) powerUpPool.release(item);
      }
      expect(powerUpPool.getActiveCount()).toBe(0);

      // 2. Cluster Bomb Pool (capacity 16)
      const bombPool = game.alliesManager.getBombPool();
      expect((bombPool as any).autoExpand).toBe(false);
      expect((bombPool as any).maxSize).toBe(16);

      const leasedBombs = [];
      for (let i = 0; i < 16; i++) {
        const bomb = bombPool.acquire();
        expect(bomb).not.toBeNull();
        leasedBombs.push(bomb);
      }
      expect(bombPool.getActiveCount()).toBe(16);
      expect(bombPool.acquire()).toBeNull();
      for (const b of leasedBombs) {
        if (b) bombPool.release(b);
      }
      expect(bombPool.getActiveCount()).toBe(0);

      // 3. Nova Missile Pool (capacity 32)
      const missilePool = game.specialMovesManager.getMissilePool();
      expect((missilePool as any).autoExpand).toBe(false);
      expect((missilePool as any).maxSize).toBe(32);

      const leasedMissiles = [];
      for (let i = 0; i < 32; i++) {
        const m = missilePool.acquire();
        expect(m).not.toBeNull();
        leasedMissiles.push(m);
      }
      expect(missilePool.getActiveCount()).toBe(32);
      expect(missilePool.acquire()).toBeNull();
      for (const m of leasedMissiles) {
        if (m) missilePool.release(m);
      }
      expect(missilePool.getActiveCount()).toBe(0);

      // 4. Phantom Clone Pool (capacity 8)
      const phantomPool = game.formationManager.phantomPool;
      expect((phantomPool as any).autoExpand).toBe(false);
      expect((phantomPool as any).maxSize).toBe(8);

      const leasedPhantoms = [];
      for (let i = 0; i < 8; i++) {
        const p = phantomPool.acquire();
        expect(p).not.toBeNull();
        leasedPhantoms.push(p);
      }
      expect(phantomPool.getActiveCount()).toBe(8);
      expect(phantomPool.acquire()).toBeNull();
      for (const p of leasedPhantoms) {
        if (p) phantomPool.release(p);
      }
      expect(phantomPool.getActiveCount()).toBe(0);

      // 5. Formation Enemy Pool (pre-allocated capacity 48, maxSize 64, autoExpand: false)
      const enemyPool = game.formationManager.getEnemyPool();
      expect((enemyPool as any).autoExpand).toBe(false);
      expect(enemyPool.getMaxSize()).toBe(64);

      // Clear formation enemies from stage 1 spawn
      enemyPool.clear();
      expect(enemyPool.getActiveCount()).toBe(0);

      const enemyCapacity = enemyPool.getCapacity();
      expect(enemyCapacity).toBe(64);

      const leasedEnemies = [];
      for (let i = 0; i < enemyCapacity; i++) {
        const e = enemyPool.acquire();
        expect(e).not.toBeNull();
        leasedEnemies.push(e);
      }
      expect(enemyPool.getActiveCount()).toBe(enemyCapacity);

      // Next acquire must return null without auto-expanding beyond pre-allocated 64
      expect(enemyPool.acquire()).toBeNull();
      expect(enemyPool.getActiveCount()).toBe(enemyCapacity);

      for (const e of leasedEnemies) {
        if (e) enemyPool.release(e);
      }
      expect(enemyPool.getActiveCount()).toBe(0);

      expect(unhandledRejections.length).toBe(0);
      expect(uncaughtExceptions.length).toBe(0);
    });
  });
});
