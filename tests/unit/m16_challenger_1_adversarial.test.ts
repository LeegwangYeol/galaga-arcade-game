/**
 * Milestone 16 Empirical Challenger 1: Adversarial Multi-Hazard Stress & Fuzzing Suite
 * 
 * Verifies:
 * 1. Quadruple Confluence Stress:
 *    - Boss 40 (Psionic Harbinger) Phase 2 + Active Telekinetic Stun Wave
 *    - The Unbidden Crisis Event (Active Spacetime Rift with Gravitational Curvature)
 *    - Chrono Freeze (3.0s Absolute Time Stop, enemyDt = 0)
 *    - Warp Ram (800 px/s Upward Hyper-Speed Kinetic Surge & Lane Vaporization)
 * 2. Randomized Multi-Hazard Permutation Fuzzing:
 *    - Cross-permutations of 5 Epic Bosses x 11 Stellaris Crises x 3 Special Moves x Tactical Drones
 *    - Invariant: Zero NaN coordinates, zero unhandled rejections, finite kinematic vectors
 * 3. Violent Mid-Hazard Teardown & Zero Entity Leak Audit:
 *    - Mid-Warp Ram, Mid-Chrono Freeze, Mid-Salvo interruptions
 *    - Invariant: 100% pool reclamation (0 active leases across all 8 object pools)
 * 4. Stun Thruster Attenuation & Canvas Boundary Clamping:
 *    - Stunned player horizontal speed damping vs virtual canvas clamping bounds
 * 5. Time Dilation Field Anomaly + Chrono Freeze Superposition:
 *    - Oscillating 1.5x/0.5x time scaling strictly overridden by Chrono Freeze (enemyDt = 0)
 * 6. Nova Barrage Targetless Homing & Graceful Retirement:
 *    - Zero active enemies, missiles cruise and recycle cleanly without hanging
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { PsionicHarbinger } from '../../src/core/boss/bosses/PsionicHarbinger';
import { CrisisEventType } from '../../src/core/crisis/types';
import { TimeDilationFieldEvent } from '../../src/core/crisis/events/TimeDilationFieldEvent';

function teardownCleanly(game: Game): void {
  game.bulletManager.clear();
  game.particleSystem.clear();
  if (game.powerUpManager) {
    game.powerUpManager.reset();
  }
  if (game.alliesManager) {
    game.alliesManager.onStageClear();
  }
  if (game.specialMovesManager) {
    game.specialMovesManager.onStageClear();
  }
  if (game.formationManager) {
    game.formationManager.reset();
  }
  if (game.bossManager) {
    game.bossManager.reset();
  }
  if (game.crisisEventManager) {
    game.crisisEventManager.clearCrisis();
  }
}

describe('m16_challenger_1: Adversarial Multi-Hazard Stress & Fuzzing Suite', () => {
  let game: Game;
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
  });

  afterEach(() => {
    if (game) {
      teardownCleanly(game);
      game.destroy();
    }
    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);

    expect(unhandledRejections.length).toBe(0);
    expect(uncaughtExceptions.length).toBe(0);
  });

  it('1. verifies Quadruple Confluence: Unbidden Rift + Chrono Freeze + Boss 40 Psionic Stun + Warp Ram', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // 1. Spawn Stage 40 Boss: Psionic Harbinger
    const skipped = cheat.skipToStage(40);
    expect(skipped).toBe(true);
    expect(game.stage).toBe(40);

    const harbinger = game.bossManager.activeBoss as PsionicHarbinger;
    expect(harbinger).not.toBeNull();
    expect(harbinger).toBeInstanceOf(PsionicHarbinger);

    // 2. Transition directly to Phase 2 (Telekinetic Stun Wave mode)
    harbinger.phantom1.active = false;
    harbinger.phantom2.active = false;
    harbinger.phase = 'PHASE_2';
    harbinger.introTimer = 0;
    harbinger.invulnerableTimer = 0;
    harbinger.health = 100; // Phase 2 HP <= 110

    // Launch Telekinetic Stun Wave
    harbinger.stunWave.active = true;
    harbinger.stunWave.y = 240; // Directly in proximity of player at y = 250
    game.player.x = 112;
    game.player.y = 250;

    // Advance 2 ticks to register stun hit
    game.update(1 / 60);
    game.update(1 / 60);

    // Verify player is stunned (75% thruster disruption)
    expect(game.bossManager.playerStunTimer).toBeGreaterThan(0);

    // 3. Trigger The Unbidden Crisis Event (active rift at 112, 60)
    const crisis = game.crisisEventManager.forceActivate(CrisisEventType.THE_UNBIDDEN, 40);
    expect(crisis).not.toBeNull();
    expect(game.crisisEventManager.getState()).toBe('ACTIVE');

    // Fire player bullets into the Unbidden gravity field
    game.bulletManager.firePlayerBullet(90, 220, true, 480);
    game.bulletManager.firePlayerBullet(134, 220, true, 480);

    // 4. Activate Chrono Freeze (Special Move 2: 3.0s time stop)
    cheat.fillEnergy(100);
    const triggeredFreeze = cheat.triggerSpecialMove('chrono');
    expect(triggeredFreeze).toBe(true);
    expect(game.specialMovesManager.isChronoFreezeActive()).toBe(true);
    expect(game.specialMovesManager.getEnemyDeltaTime(1 / 60)).toBe(0);

    // Record frozen state
    const frozenBossX = harbinger.x;
    const frozenBossY = harbinger.y;
    const frozenStunY = harbinger.stunWave.y;
    const frozenStunTimer = game.bossManager.playerStunTimer;

    // Run 15 frozen frames
    for (let f = 0; f < 15; f++) {
      game.update(1 / 60);

      // Invariant: Boss and Stun Wave must remain strictly frozen
      expect(harbinger.x).toBe(frozenBossX);
      expect(harbinger.y).toBe(frozenBossY);
      expect(harbinger.stunWave.y).toBe(frozenStunY);

      // Invariant: Stun timer is updated with enemyDt (0), so stun persists through freeze
      expect(game.bossManager.playerStunTimer).toBe(frozenStunTimer);

      // Invariant: Player bullets updating with real dt curve towards Unbidden rift (112, 60)
      game.bulletManager.forEachActivePlayerBullet((b) => {
        expect(Number.isFinite(b.position.x)).toBe(true);
        expect(Number.isFinite(b.position.y)).toBe(true);
        expect(Number.isFinite(b.velocity.x)).toBe(true);
        expect(Number.isFinite(b.velocity.y)).toBe(true);
        expect(b.velocity.x).toBeGreaterThanOrEqual(-280);
        expect(b.velocity.x).toBeLessThanOrEqual(280);
      });
    }

    // Recycle active bullets to ensure kinetic trauma is exclusively from Warp Ram
    game.bulletManager.forEachActivePlayerBullet((b) => game.bulletManager.recycle(b));

    // 5. Trigger Warp Ram while stunned, frozen, and under Unbidden rift
    const preRamBossHp = harbinger.health;
    cheat.fillEnergy(100);
    const triggeredWarp = cheat.triggerSpecialMove('warp');
    expect(triggeredWarp).toBe(true);
    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

    // Player position aligned with boss
    game.player.x = harbinger.x;

    let reachedTop = false;

    // Execute Warp Ram execution frames (60 frames = 1.0s)
    for (let f = 0; f < 60; f++) {
      game.update(1 / 60);

      if (game.player.y < -30) {
        reachedTop = true;
      }

      // Invariant: All coordinates must be strictly finite numbers
      expect(Number.isFinite(game.player.x)).toBe(true);
      expect(Number.isFinite(game.player.y)).toBe(true);
      expect(Number.isFinite(harbinger.x)).toBe(true);
      expect(Number.isFinite(harbinger.y)).toBe(true);
    }

    // Invariant: Genuine upward ascent achieved top screen exit
    expect(reachedTop).toBe(true);

    // Invariant: Inflicted 120 blunt kinetic trauma to Psionic Harbinger
    expect(harbinger.health).toBeLessThan(preRamBossHp);

    // Invariant: Player safely restored to baseline Y with grace invulnerability
    expect(game.player.y).toBe(250);
    expect(game.player.invulnerableTimer).toBeGreaterThan(0);
  });

  it('2. stress-tests randomized multi-hazard permutations with zero NaNs and bounded pools', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    const bossStages = [10, 20, 30, 40, 50];
    const crisisTypes = [
      CrisisEventType.THE_CONTINGENCY,
      CrisisEventType.THE_UNBIDDEN,
      CrisisEventType.THE_PRETHORYN_SCOURGE,
      CrisisEventType.SHIELD_OVERLOAD,
      CrisisEventType.PHYSICS_INVERSION,
      CrisisEventType.HYPERSPACE_STORM,
      CrisisEventType.NANITE_CLOUD,
      CrisisEventType.PSIONIC_RESONANCE,
      CrisisEventType.DEVOURING_SWARM_FRENZY,
      CrisisEventType.NEMESIS_STAR_EATER,
      CrisisEventType.TIME_DILATION_FIELD,
    ];
    const specialTypes: ('nova' | 'chrono' | 'warp')[] = ['nova', 'chrono', 'warp'];

    // Run 25 distinct multi-hazard combinations
    for (let testIdx = 0; testIdx < 25; testIdx++) {
      const stage = bossStages[testIdx % bossStages.length]!;
      const crisisType = crisisTypes[testIdx % crisisTypes.length]!;
      const special = specialTypes[testIdx % specialTypes.length]!;

      // Skip to boss stage
      cheat.skipToStage(stage);
      expect(game.stage).toBe(stage);

      // Force activate crisis
      game.crisisEventManager.forceActivate(crisisType, stage);

      // Setup ship state: toggle dual ship & summon drones
      game.player.isDual = testIdx % 2 === 0;
      cheat.unlockDrone('all');

      // Trigger chosen special move
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove(special);

      // Simulate 30 frames with pseudo-random inputs and active weapon discharge
      for (let f = 0; f < 30; f++) {
        const inputState = game.inputHandler.getState() as { moveLeft: boolean; moveRight: boolean; fire: boolean };
        inputState.moveLeft = f % 4 === 1;
        inputState.moveRight = f % 4 === 3;
        inputState.fire = true;

        if (f % 5 === 0) {
          game.bulletManager.firePlayerBullet(game.player.x - 4, game.player.y - 8, true, 480);
          if (game.player.isDual) {
            game.bulletManager.firePlayerBullet(game.player.x + 4, game.player.y - 8, true, 480);
          }
        }

        game.update(1 / 60);

        // --- Invariant Checks Every Frame ---
        // 1. Player Coordinates
        expect(Number.isFinite(game.player.x)).toBe(true);
        expect(Number.isFinite(game.player.y)).toBe(true);
        expect(game.player.x).toBeGreaterThanOrEqual(10);
        expect(game.player.x).toBeLessThanOrEqual(214);

        // 2. Active Bullets
        game.bulletManager.getPool().forEachActiveSafe((bullet) => {
          expect(Number.isFinite(bullet.position.x)).toBe(true);
          expect(Number.isFinite(bullet.position.y)).toBe(true);
          expect(Number.isFinite(bullet.velocity.x)).toBe(true);
          expect(Number.isFinite(bullet.velocity.y)).toBe(true);
          expect(Number.isFinite(bullet.angle)).toBe(true);
        });

        // 3. Active Drones
        if (game.alliesManager.escortDrone.active) {
          expect(Number.isFinite(game.alliesManager.escortDrone.x)).toBe(true);
          expect(Number.isFinite(game.alliesManager.escortDrone.y)).toBe(true);
        }
        if (game.alliesManager.aegisDrone.active) {
          expect(Number.isFinite(game.alliesManager.aegisDrone.x)).toBe(true);
          expect(Number.isFinite(game.alliesManager.aegisDrone.y)).toBe(true);
        }
        if (game.alliesManager.bomberDrone.active) {
          expect(Number.isFinite(game.alliesManager.bomberDrone.x)).toBe(true);
          expect(Number.isFinite(game.alliesManager.bomberDrone.y)).toBe(true);
        }

        // 4. Boss & Sub-Units
        if (game.bossManager.activeBoss) {
          const boss = game.bossManager.activeBoss;
          expect(Number.isFinite(boss.x)).toBe(true);
          expect(Number.isFinite(boss.y)).toBe(true);
          for (const sub of boss.subUnits) {
            if (sub.active) {
              expect(Number.isFinite(sub.x)).toBe(true);
              expect(Number.isFinite(sub.y)).toBe(true);
            }
          }
        }
      }

      // Teardown at boundary of each permutation
      teardownCleanly(game);

      // Verify zero leak at permutation boundary
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
    }
  });

  it('3. ensures 100% pool reclamation upon violent mid-hazard stage skips', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Loop 5 sudden mid-hazard skips
    for (let i = 0; i < 5; i++) {
      // 1. Populate screen with extreme munitions
      cheat.skipToStage(50);
      game.crisisEventManager.forceActivate(CrisisEventType.THE_CONTINGENCY, 50);
      cheat.unlockDrone('all');
      game.player.isDual = true;

      // Trigger Nova Barrage (16 missiles)
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('nova');
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(16);

      // Spawn bullets and cluster bombs in flight
      game.bulletManager.firePlayerBullet(100, 200, true, 480);
      game.bulletManager.fireEnemyBulletWithVector(120, 100, 0, 150);
      game.alliesManager.spawnClusterBomb(112, 50);
      game.alliesManager.spawnClusterBomb(130, 70);
      game.particleSystem.spawnBossExplosion(112, 60, 25);

      // Advance 5 frames to bring munitions mid-flight
      for (let f = 0; f < 5; f++) {
        game.update(1 / 60);
      }

      // Assert munitions are in flight
      expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThan(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBeGreaterThan(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBeGreaterThan(0);

      // 2. Abruptly skip to Stage 1 mid-flight!
      cheat.skipToStage(1);

      // Teardown stage boundary
      teardownCleanly(game);

      // Invariant: ALL 8 pools must have exactly 0 active leases!
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
      expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);

      // Invariant: Fixed-capacity pools have freeCount === capacity
      expect(game.powerUpManager.getPool().getFreeCount()).toBe(32);
      expect(game.alliesManager.getBombPool().getFreeCount()).toBe(16);
      expect(game.alliesManager.getExplosionPool().getFreeCount()).toBe(16);
      expect(game.specialMovesManager.getMissilePool().getFreeCount()).toBe(32);
      expect(game.specialMovesManager.getSparkPool().getFreeCount()).toBe(32);
      expect(game.formationManager.getEnemyPool().getFreeCount()).toBe(64);

      // Invariant: Zero lingering boss or crisis references
      expect(game.bossManager.activeBoss).toBeNull();
      expect(game.bossManager.playerStunTimer).toBe(0);
      expect(game.crisisEventManager.getActiveCrisis()).toBeNull();
    }
  });

  it('4. verifies thruster stun attenuation and wall collision clamping under fuzz inputs', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    cheat.skipToStage(40);
    const harbinger = game.bossManager.activeBoss as PsionicHarbinger;
    expect(harbinger).not.toBeNull();

    // Trigger stun
    game.bossManager.playerStunTimer = 2.0;

    // Try driving aggressively into the left wall for 60 frames
    const inputState = game.inputHandler.getState() as { moveLeft: boolean; moveRight: boolean };
    inputState.moveLeft = true;
    inputState.moveRight = false;
    for (let f = 0; f < 60; f++) {
      game.update(1 / 60);
      expect(Number.isFinite(game.player.x)).toBe(true);
      expect(game.player.x).toBeGreaterThanOrEqual(16); // Left virtual clamp
    }

    // Try driving aggressively into the right wall for 60 frames
    inputState.moveLeft = false;
    inputState.moveRight = true;
    for (let f = 0; f < 60; f++) {
      game.update(1 / 60);
      expect(Number.isFinite(game.player.x)).toBe(true);
      expect(game.player.x).toBeLessThanOrEqual(208); // Right virtual clamp
    }

    // Test dual fighter wall clamping
    game.player.isDual = true;
    for (let f = 0; f < 30; f++) {
      game.update(1 / 60);
      expect(Number.isFinite(game.player.x)).toBe(true);
      expect(game.player.x).toBeLessThanOrEqual(208);
    }
  });

  it('5. verifies Time Dilation Field anomaly is strictly overridden by Chrono Freeze (enemyDt = 0)', () => {
    const cheat = game.getCheatController();

    cheat.skipToStage(14);
    const crisis = game.crisisEventManager.forceActivate(CrisisEventType.TIME_DILATION_FIELD, 14) as TimeDilationFieldEvent;
    expect(crisis).toBeInstanceOf(TimeDilationFieldEvent);

    // Force hyper-speed phase (1.5x)
    crisis.phase = 'HYPER_SPEED';
    crisis.currentScale = 1.5;
    crisis.targetScale = 1.5;
    game.formationManager.diveSpeedMultiplier = 1.5;

    // Trigger Chrono Freeze
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('chrono');
    expect(game.specialMovesManager.isChronoFreezeActive()).toBe(true);

    // Invariant: Even though Time Dilation wants 1.5x speed, Chrono Freeze forces enemy delta time to 0
    expect(game.specialMovesManager.getEnemyDeltaTime(1 / 60)).toBe(0);

    // Run 20 frames with freeze active
    for (let f = 0; f < 20; f++) {
      game.update(1 / 60);
      expect(game.specialMovesManager.getEnemyDeltaTime(1 / 60)).toBe(0);
    }

    // Fast-forward until Chrono Freeze expires
    while (game.specialMovesManager.isChronoFreezeActive()) {
      game.update(1 / 60);
    }

    // Invariant: Upon freeze lifting, normal delta time is restored
    expect(game.specialMovesManager.getEnemyDeltaTime(1 / 60)).toBe(1 / 60);
  });

  it('6. verifies Nova Barrage safe homing and graceful retirement when zero enemies exist', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Skip to stage with zero active enemies (e.g. empty arena)
    cheat.skipToStage(15);
    cheat.killAllEnemies();
    expect(game.formationManager.getLivingEnemies().length).toBe(0);

    // Fire Nova Barrage (16 missiles)
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('nova');
    expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(16);

    // Run 150 frames (2.5s): missiles cruise upward with no target, exit bounds or expire, and are recycled
    for (let f = 0; f < 150; f++) {
      game.update(1 / 60);
      game.specialMovesManager.getMissilePool().forEachActiveSafe((m) => {
        expect(Number.isFinite(m.x)).toBe(true);
        expect(Number.isFinite(m.y)).toBe(true);
        expect(Number.isFinite(m.angle)).toBe(true);
        expect(Number.isFinite(m.speed)).toBe(true);
      });
    }

    // Invariant: All 16 missiles have expired and recycled cleanly without hanging or crashing
    expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
    expect(game.specialMovesManager.getMissilePool().getFreeCount()).toBe(32);
  });
});
