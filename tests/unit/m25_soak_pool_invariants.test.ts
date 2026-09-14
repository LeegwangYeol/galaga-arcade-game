/**
 * Milestone M25: Swarm Hardening, Zero-GC Verification & Pool Invariants Soak Test Suite
 * Author: m25_worker
 * Location: tests/unit/m25_soak_pool_invariants.test.ts
 *
 * Verification Objectives:
 * 1. 50-Round Continuous Traversal & Heap Drift Invariant:
 *    - Simulates 7,000+ game engine combat ticks across Stages 1..50.
 *    - Exercises M19 power-ups, glitch anomalies, bosses (10, 20, 30, 40, 50),
 *      Stellaris crises, tactical allies drones, and special moves.
 *    - Strictly asserts all 9 object pools enforce capacity bounds and flush to
 *      getActiveCount() === 0 at stage boundaries and game over.
 *    - Asserts net heap drift < 5.0 MB (target < 1.0 MB).
 * 2. Maximum Simultaneous Saturation Invariant:
 *    - Simultaneously saturates all 9 object pools to peak capacities on Glitch Sector Stage 26.
 *    - Asserts mid-action abrupt stage boundary teardowns achieve zero un-recycled leases.
 * 3. Erratic Stage Boundary Whiplash Invariant:
 *    - Survives erratic non-linear stage whiplash across Stages 1..50 with complete pool recycling.
 * 4. Kinematic Continuity Invariant:
 *    - Verifies frame-to-frame displacements across long-play sessions.
 *    - Strictly asserts no position jumps > 3.0 px/frame upon formation docking / re-entry
 *      and enforces physical dive kinematic boundaries without unphysical coordinate leaps.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { FormationManager } from '../../src/systems/FormationManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyState, EnemyType } from '../../src/types';
import { DroneType } from '../../src/core/allies/types';

// ============================================================================
// Constants & Configuration
// ============================================================================
const M19_POWER_UPS = ['chrono', 'reflection', 'emp', 'phase', 'antimatter'] as const;
const GLITCH_TYPES = ['teleport', 'kinetic', 'mirage', 'vector', 'raster'] as const;
const CRISIS_TYPES = [
  'contingency',
  'unbidden',
  'scourge',
  'stellarite',
  'wraith',
  'gray_tempest',
  'dimensional_horror',
  'shroud_incursion',
  'spectral_dread',
  'terminal_decree',
  'crisis_matrix',
] as const;

// ============================================================================
// Helper: Force V8 Garbage Collection
// ============================================================================
function forceGC(): void {
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
    (globalThis as any).gc();
    return;
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    if (typeof gc === 'function') {
      gc();
      gc();
    }
  } catch {
    // V8 sandbox fallback
  }
}

// ============================================================================
// Helper: Stage Boundary Teardown Protocol
// ============================================================================
function teardownStageBoundary(game: Game): void {
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
    game.crisisEventManager.onStageClear();
  }
  if (game.glitchEventManager) {
    game.glitchEventManager.clearGlitch();
  }
}

// ============================================================================
// Helper: Strict Pool Hygiene & Capacity Invariants on All 9 Pools
// ============================================================================
function assertAll9PoolsHygiene(game: Game, context: string): void {
  // 1. bulletPool (max 256)
  const bulletPool = game.bulletManager.getPool();
  expect(bulletPool.getActiveCount(), `${context}: bulletPool activeCount must be 0`).toBe(0);
  expect(bulletPool.getCapacity(), `${context}: bulletPool capacity must be <= 256`).toBeLessThanOrEqual(256);
  expect(bulletPool.getCapacity(), `${context}: bulletPool capacity <= getMaxSize()`).toBeLessThanOrEqual(bulletPool.getMaxSize());
  expect(bulletPool.getFreeCount(), `${context}: bulletPool freeCount must equal capacity`).toBe(bulletPool.getCapacity());

  // 2. particlePool (max 256, initial 250)
  const particlePool = game.particleSystem.getPool();
  expect(particlePool.getActiveCount(), `${context}: particlePool activeCount must be 0`).toBe(0);
  expect(particlePool.getCapacity(), `${context}: particlePool capacity must be <= 256`).toBeLessThanOrEqual(256);
  expect(particlePool.getCapacity(), `${context}: particlePool capacity <= getMaxSize()`).toBeLessThanOrEqual(particlePool.getMaxSize());
  expect(particlePool.getFreeCount(), `${context}: particlePool freeCount must equal capacity`).toBe(particlePool.getCapacity());

  // 3. powerUpPool (max 32)
  const powerUpPool = game.powerUpManager.getPool();
  expect(powerUpPool.getActiveCount(), `${context}: powerUpPool activeCount must be 0`).toBe(0);
  expect(powerUpPool.getCapacity(), `${context}: powerUpPool capacity must be <= 32`).toBeLessThanOrEqual(32);
  expect(powerUpPool.getCapacity(), `${context}: powerUpPool capacity <= getMaxSize()`).toBeLessThanOrEqual(powerUpPool.getMaxSize());
  expect(powerUpPool.getFreeCount(), `${context}: powerUpPool freeCount must equal capacity`).toBe(powerUpPool.getCapacity());

  // 4. enemyPool (max 64)
  const enemyPool = game.formationManager.getEnemyPool();
  expect(enemyPool.getActiveCount(), `${context}: enemyPool activeCount must be 0`).toBe(0);
  expect(enemyPool.getCapacity(), `${context}: enemyPool capacity must be <= 64`).toBeLessThanOrEqual(64);
  expect(enemyPool.getCapacity(), `${context}: enemyPool capacity <= getMaxSize()`).toBeLessThanOrEqual(enemyPool.getMaxSize());
  expect(enemyPool.getFreeCount(), `${context}: enemyPool freeCount must equal capacity`).toBe(enemyPool.getCapacity());

  // 5. phantomPool (max 8)
  const phantomPool = game.formationManager.getPhantomPool();
  expect(phantomPool.getActiveCount(), `${context}: phantomPool activeCount must be 0`).toBe(0);
  expect(phantomPool.getCapacity(), `${context}: phantomPool capacity must be <= 8`).toBeLessThanOrEqual(8);
  expect(phantomPool.getCapacity(), `${context}: phantomPool capacity <= getMaxSize()`).toBeLessThanOrEqual(phantomPool.getMaxSize());
  expect(phantomPool.getFreeCount(), `${context}: phantomPool freeCount must equal capacity`).toBe(phantomPool.getCapacity());

  // 6. bombPool (max 16)
  const bombPool = game.alliesManager.getBombPool();
  expect(bombPool.getActiveCount(), `${context}: bombPool activeCount must be 0`).toBe(0);
  expect(bombPool.getCapacity(), `${context}: bombPool capacity must be <= 16`).toBeLessThanOrEqual(16);
  expect(bombPool.getCapacity(), `${context}: bombPool capacity <= getMaxSize()`).toBeLessThanOrEqual(bombPool.getMaxSize());
  expect(bombPool.getFreeCount(), `${context}: bombPool freeCount must equal capacity`).toBe(bombPool.getCapacity());

  // 7. explosionPool (max 16)
  const explosionPool = game.alliesManager.getExplosionPool();
  expect(explosionPool.getActiveCount(), `${context}: explosionPool activeCount must be 0`).toBe(0);
  expect(explosionPool.getCapacity(), `${context}: explosionPool capacity must be <= 16`).toBeLessThanOrEqual(16);
  expect(explosionPool.getCapacity(), `${context}: explosionPool capacity <= getMaxSize()`).toBeLessThanOrEqual(explosionPool.getMaxSize());
  expect(explosionPool.getFreeCount(), `${context}: explosionPool freeCount must equal capacity`).toBe(explosionPool.getCapacity());

  // 8. missilePool (max 32)
  const missilePool = game.specialMovesManager.getMissilePool();
  expect(missilePool.getActiveCount(), `${context}: missilePool activeCount must be 0`).toBe(0);
  expect(missilePool.getCapacity(), `${context}: missilePool capacity must be <= 32`).toBeLessThanOrEqual(32);
  expect(missilePool.getCapacity(), `${context}: missilePool capacity <= getMaxSize()`).toBeLessThanOrEqual(missilePool.getMaxSize());
  expect(missilePool.getFreeCount(), `${context}: missilePool freeCount must equal capacity`).toBe(missilePool.getCapacity());

  // 9. sparkPool (max 32)
  const sparkPool = game.specialMovesManager.getSparkPool();
  expect(sparkPool.getActiveCount(), `${context}: sparkPool activeCount must be 0`).toBe(0);
  expect(sparkPool.getCapacity(), `${context}: sparkPool capacity must be <= 32`).toBeLessThanOrEqual(32);
  expect(sparkPool.getCapacity(), `${context}: sparkPool capacity <= getMaxSize()`).toBeLessThanOrEqual(sparkPool.getMaxSize());
  expect(sparkPool.getFreeCount(), `${context}: sparkPool freeCount must equal capacity`).toBe(sparkPool.getCapacity());
}

// ============================================================================
// Helper: Coordinate & State NaN Invariant Check
// ============================================================================
function assertZeroNaN(game: Game, context: string): void {
  // 1. Player
  expect(Number.isNaN(game.player.x), `${context}: Player X is NaN`).toBe(false);
  expect(Number.isNaN(game.player.y), `${context}: Player Y is NaN`).toBe(false);
  expect(Number.isNaN(game.player.vx), `${context}: Player Vx is NaN`).toBe(false);
  expect(Number.isNaN(game.player.vy), `${context}: Player Vy is NaN`).toBe(false);
  expect(Number.isFinite(game.player.x), `${context}: Player X is infinite`).toBe(true);
  expect(Number.isFinite(game.player.y), `${context}: Player Y is infinite`).toBe(true);

  // 2. Formation Enemies
  for (const enemy of game.formationManager.enemies) {
    if (!enemy.active) continue;
    expect(Number.isNaN(enemy.x), `${context}: Enemy #${enemy.id} X is NaN`).toBe(false);
    expect(Number.isNaN(enemy.y), `${context}: Enemy #${enemy.id} Y is NaN`).toBe(false);
    expect(Number.isNaN(enemy.vx), `${context}: Enemy #${enemy.id} Vx is NaN`).toBe(false);
    expect(Number.isNaN(enemy.vy), `${context}: Enemy #${enemy.id} Vy is NaN`).toBe(false);
    expect(Number.isNaN(enemy.rotation), `${context}: Enemy #${enemy.id} rotation is NaN`).toBe(false);
    expect(Number.isFinite(enemy.x), `${context}: Enemy #${enemy.id} X is infinite`).toBe(true);
    expect(Number.isFinite(enemy.y), `${context}: Enemy #${enemy.id} Y is infinite`).toBe(true);
  }

  // 3. Phantom Clones
  game.formationManager.phantomPool.forEachActive((clone) => {
    expect(Number.isNaN(clone.x), `${context}: Phantom clone X is NaN`).toBe(false);
    expect(Number.isNaN(clone.y), `${context}: Phantom clone Y is NaN`).toBe(false);
    expect(Number.isFinite(clone.x), `${context}: Phantom clone X is infinite`).toBe(true);
    expect(Number.isFinite(clone.y), `${context}: Phantom clone Y is infinite`).toBe(true);
  });

  // 4. Bullets
  game.bulletManager.getPool().forEachActive((bullet) => {
    expect(Number.isNaN(bullet.position.x), `${context}: Bullet X is NaN`).toBe(false);
    expect(Number.isNaN(bullet.position.y), `${context}: Bullet Y is NaN`).toBe(false);
    expect(Number.isFinite(bullet.position.x), `${context}: Bullet X is infinite`).toBe(true);
    expect(Number.isFinite(bullet.position.y), `${context}: Bullet Y is infinite`).toBe(true);
  });

  // 5. Active Boss
  if (game.bossManager?.activeBoss && game.bossManager.activeBoss.active) {
    const boss = game.bossManager.activeBoss;
    expect(Number.isNaN(boss.x), `${context}: Boss X is NaN`).toBe(false);
    expect(Number.isNaN(boss.y), `${context}: Boss Y is NaN`).toBe(false);
    expect(Number.isFinite(boss.x), `${context}: Boss X is infinite`).toBe(true);
    expect(Number.isFinite(boss.y), `${context}: Boss Y is infinite`).toBe(true);
  }
}

// ============================================================================
// Kinematic Telemetry Engine (Self-Contained for M25 Invariant Verification)
// ============================================================================
export interface WarpRecord {
  enemyId: string | number;
  enemyType: EnemyType;
  fromState: EnemyState;
  toState: EnemyState;
  prevPos: { x: number; y: number };
  currPos: { x: number; y: number };
  deltaDistance: number;
  maxAllowed: number;
  frame: number;
  classification: string;
}

export class KinematicTelemetryMonitor {
  private prevMap = new Map<
    string | number,
    {
      x: number;
      y: number;
      state: EnemyState;
    }
  >();
  public readonly anomalies: WarpRecord[] = [];
  public readonly allDeltas: number[] = [];
  public totalChecks: number = 0;

  public readonly dt: number;
  public readonly maxVelocity: number;
  public readonly toleranceMargin: number;
  public readonly screenHeight: number;

  constructor(options?: { dt?: number; maxVelocity?: number; toleranceMargin?: number; screenHeight?: number }) {
    this.dt = options?.dt ?? 1 / 60;
    this.maxVelocity = options?.maxVelocity ?? 480;
    this.toleranceMargin = options?.toleranceMargin ?? 4.0;
    this.screenHeight = options?.screenHeight ?? 288;
  }

  public getMaxAllowedDisplacement(dt: number, toState?: EnemyState): number {
    if (toState === EnemyState.IN_FORMATION) {
      return 120 * dt + 1.0; // 3.0 px at 60Hz
    }
    return this.maxVelocity * dt + this.toleranceMargin; // 12.0 px at 60Hz
  }

  public reset(): void {
    this.prevMap.clear();
    this.anomalies.length = 0;
    this.allDeltas.length = 0;
    this.totalChecks = 0;
  }

  public checkEnemy(enemy: Enemy, frame: number, dt: number = this.dt): WarpRecord | null {
    if (!enemy.active || enemy.state === EnemyState.INACTIVE || enemy.state === EnemyState.EXPLODING) {
      this.prevMap.delete(enemy.id);
      return null;
    }

    const prev = this.prevMap.get(enemy.id);
    if (!prev) {
      this.prevMap.set(enemy.id, {
        x: enemy.x,
        y: enemy.y,
        state: enemy.state,
      });
      return null;
    }

    this.totalChecks++;
    const prevX = prev.x;
    const prevY = prev.y;
    const prevState = prev.state;

    const dx = enemy.x - prevX;
    const dy = enemy.y - prevY;
    const dist = Math.hypot(dx, dy);
    this.allDeltas.push(dist);

    const maxAllowed = this.getMaxAllowedDisplacement(dt, enemy.state);

    const isToroidalWrap =
      (prevY >= this.screenHeight && enemy.y <= 0) ||
      (prevY <= 0 && enemy.y >= this.screenHeight);

    const isBothOffScreen =
      (prevY < 0 || prevY > this.screenHeight) &&
      (enemy.y < 0 || enemy.y > this.screenHeight);

    const isOffScreenWrap = isToroidalWrap || isBothOffScreen;
    const isIntentionalGlitch = Boolean(
      enemy.isTeleporting || (enemy.isGlitched && enemy.teleportTimer > 0)
    );

    let anomaly: WarpRecord | null = null;

    if (dist > maxAllowed && !isOffScreenWrap && !isIntentionalGlitch) {
      anomaly = {
        enemyId: enemy.id,
        enemyType: enemy.type,
        fromState: prevState,
        toState: enemy.state,
        prevPos: { x: prevX, y: prevY },
        currPos: { x: enemy.x, y: enemy.y },
        deltaDistance: dist,
        maxAllowed,
        frame,
        classification: 'UNEXPLAINED_ONSCREEN_WARP',
      };
      this.anomalies.push(anomaly);
    }

    this.prevMap.set(enemy.id, {
      x: enemy.x,
      y: enemy.y,
      state: enemy.state,
    });

    return anomaly;
  }
}

// ============================================================================
// Test Suite: Milestone M25 Soak, Zero-GC & Pool Invariants
// ============================================================================
describe('Milestone M25: Swarm Hardening, Zero-GC Verification & Pool Invariants Suite', () => {
  let game: Game;
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];

  const rejectionHandler = (reason: any) => unhandledRejections.push(reason);
  const exceptionHandler = (error: any) => uncaughtExceptions.push(error);

  beforeEach(() => {
    unhandledRejections = [];
    uncaughtExceptions = [];
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);

    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    process.removeListener('unhandledRejection', rejectionHandler);
    process.removeListener('uncaughtException', exceptionHandler);

    if (game) {
      game.destroy();
    }

    expect(unhandledRejections, 'Unhandled promise rejections encountered during soak').toHaveLength(0);
    expect(uncaughtExceptions, 'Uncaught exceptions encountered during soak').toHaveLength(0);
  });

  // ==========================================================================
  // Test 1: 50-Round Continuous Traversal & Heap Drift Invariant
  // ==========================================================================
  it('simulates 50-round continuous traversal (7,000+ combat simulation ticks) across Stages 1..50 with all 9 pools bounded, flushed to getActiveCount() === 0, and net heap drift < 5.0 MB', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Warmup JIT & initial pool allocation (60 ticks)
    cheat.skipToStage(1);
    for (let t = 0; t < 60; t++) {
      if (t % 10 === 0) {
        game.bulletManager.firePlayerBullet(112, 240, false, 300);
      }
      game.update(1 / 60);
    }
    teardownStageBoundary(game);

    forceGC();
    const baselineHeap = process.memoryUsage().heapUsed;

    let totalTicksSimulated = 0;
    let stageBoundariesVerified = 0;
    const TOTAL_STAGES = 50;
    const TICKS_PER_STAGE = 140; // 50 * 140 = 7,000 combat ticks (+ clear frames > 7,150 ticks total)

    for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
      // 1. Pre-Stage Boundary Teardown & Hygiene Check
      teardownStageBoundary(game);
      assertAll9PoolsHygiene(game, `Stage ${stage} (Pre-Spawn Boundary)`);
      stageBoundariesVerified++;

      // 2. Advance to Stage via Cheat Controller
      const skipped = cheat.skipToStage(stage);
      expect(skipped, `skipToStage(${stage}) should succeed`).toBe(true);

      // 3. Cycle M19 Power-Up Items
      const powerUp = M19_POWER_UPS[(stage - 1) % M19_POWER_UPS.length]!;
      cheat.applyPowerUp(powerUp);

      // Exercise falling capsule motion
      if (stage % 2 === 0) {
        cheat.spawnPowerUp(powerUp, 40 + (stage % 10) * 14, 45);
      }

      // 4. Cycle Glitch Event Anomalies
      const glitch = GLITCH_TYPES[(stage - 1) % GLITCH_TYPES.length]!;
      cheat.triggerGlitch(glitch);
      if (glitch === 'mirage') {
        game.formationManager.spawnMirageClones(112, 85, EnemyType.GOEI);
      }

      // 5. Boss Encounters (Stages 10, 20, 30, 40, 50)
      if (stage % 10 === 0 && game.bossManager) {
        expect(game.bossManager.activeBoss).not.toBeNull();
      }

      // 6. Stellaris Crisis Events (Stage > 10)
      if (stage > 10 && stage % 3 === 0 && game.crisisEventManager) {
        const crisisType = CRISIS_TYPES[(stage - 11) % CRISIS_TYPES.length]!;
        cheat.triggerCrisis(crisisType);
      }

      // 7. Tactical Allies Drone Support
      if (stage % 4 === 0 && game.alliesManager) {
        game.alliesManager.summonDrone(DroneType.BOMBER);
        game.alliesManager.spawnClusterBomb(70 + (stage % 8) * 12, 55);
        game.alliesManager.spawnExplosion(112, 95, 24, 2);
      }

      // 8. Special Moves & Energy Munitions
      if (stage % 3 === 0 && game.specialMovesManager) {
        cheat.fillEnergy(100);
        const specialId = stage % 3 === 0 ? 'nova' : stage % 3 === 1 ? 'chrono' : 'warp';
        cheat.triggerSpecialMove(specialId);
        game.specialMovesManager.spawnSpark(90 + (stage % 6) * 10, 110);
      }

      // 9. Formation Diving Peel-Off
      const formationEnemies = game.formationManager.enemies.filter(
        (e) => e.active && e.state === EnemyState.IN_FORMATION
      );
      if (formationEnemies.length > 0) {
        game.formationManager.peelOffSolo(formationEnemies[0]!, game.player.x);
      }
      if (formationEnemies.length > 1) {
        game.formationManager.peelOffSolo(formationEnemies[1]!, game.player.x);
      }

      // 10. Live Combat Simulation Loop (140 ticks per stage)
      for (let tick = 0; tick < TICKS_PER_STAGE; tick++) {
        // Player weapon firing
        if (tick % 5 === 0) {
          game.bulletManager.firePlayerBullet(game.player.x - 4, game.player.y - 10, false, 360);
          game.bulletManager.firePlayerBullet(game.player.x + 4, game.player.y - 10, false, 360);
        }

        // Enemy weapon firing
        if (tick % 20 === 0) {
          game.bulletManager.fireEnemyBullet(112, 75, game.player.x, game.player.y, 180);
        }

        // Diver peeling
        if (tick % 60 === 0) {
          const living = game.formationManager.getLivingEnemies();
          if (living.length > 0 && living[0]!.state === EnemyState.IN_FORMATION) {
            game.formationManager.peelOffSolo(living[0]!, game.player.x);
          }
        }

        // Damage active boss
        if (game.bossManager?.activeBoss?.active && tick % 5 === 0) {
          game.bossManager.activeBoss.takeDamage(25);
        }

        // Advance simulation tick
        game.update(1 / 60);
        totalTicksSimulated++;

        // Finite coordinate and non-NaN check
        if (tick === 0 || tick === Math.floor(TICKS_PER_STAGE / 2)) {
          assertZeroNaN(game, `Stage ${stage} Tick ${tick}`);
        }
      }

      // 11. Defeat living enemies
      cheat.killAllEnemies();

      // 12. Advance 3 frames for explosion processing
      for (let t = 0; t < 3; t++) {
        game.update(1 / 60);
        totalTicksSimulated++;
      }

      // 13. Post-Clear Boundary Teardown & Hygiene Check
      teardownStageBoundary(game);
      assertAll9PoolsHygiene(game, `Stage ${stage} (Post-Clear Boundary)`);
      stageBoundariesVerified++;

      // Periodic garbage collection at milestone intervals
      if (stage % 10 === 0) {
        forceGC();
      }
    }

    // 14. Game Over State Transition Flush Invariant
    game.setState('GAME_OVER');
    expect(game.state).toBe('GAME_OVER');
    assertAll9PoolsHygiene(game, 'Final Game Over Boundary Teardown');

    // 15. Verify Simulation Count & Boundary Checks
    expect(totalTicksSimulated).toBeGreaterThanOrEqual(7000);
    expect(stageBoundariesVerified).toBe(TOTAL_STAGES * 2); // 100 stage boundary hygiene assertions

    // 16. Final Garbage Collection & Heap Drift Verification
    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const netHeapDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

    // Strictly assert net heap drift across 7,000+ ticks is < 5.0 MB (target < 1.0 MB)
    expect(netHeapDriftMB).toBeLessThan(5.0);
  });

  // ==========================================================================
  // Test 2: Maximum Simultaneous Saturation Invariant
  // ==========================================================================
  it('guarantees zero un-recycled leases across all 9 pools under maximum simultaneous saturation on Glitch Sector Stage 26', () => {
    const cheat = game.getCheatController();
    cheat.skipToStage(26);

    // 1. bulletPool saturation: fire 40 player & enemy bullets
    for (let i = 0; i < 20; i++) {
      game.bulletManager.firePlayerBullet(30 + i * 8, 200, false, 320);
      game.bulletManager.fireEnemyBullet(40 + i * 8, 80, 112, 240, 180);
    }
    expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThanOrEqual(20);

    // 2. particlePool saturation: spawn 8 boss explosions and 8 player explosions
    for (let i = 0; i < 8; i++) {
      game.particleSystem.spawnBossExplosion(40 + i * 18, 65);
      game.particleSystem.spawnPlayerExplosion(112, 240);
    }
    expect(game.particleSystem.getPool().getActiveCount()).toBeGreaterThanOrEqual(20);

    // 3. powerUpPool saturation: spawn 15 falling capsules
    for (let i = 0; i < 15; i++) {
      cheat.spawnPowerUp(M19_POWER_UPS[i % M19_POWER_UPS.length]!, 35 + i * 11, 55);
    }
    expect(game.powerUpManager.getPool().getActiveCount()).toBeGreaterThanOrEqual(10);

    // 4. enemyPool saturation: 40 formation enemies
    expect(game.formationManager.getEnemyPool().getActiveCount()).toBeGreaterThanOrEqual(40);

    // 5. phantomPool saturation: max out 8 phantom clones
    for (let i = 0; i < 16; i++) {
      game.formationManager.spawnMirageClones(70 + (i % 4) * 18, 85, EnemyType.GOEI);
    }
    expect(game.formationManager.getPhantomPool().getActiveCount()).toBe(8);

    // 6. bombPool & explosionPool saturation: bomber drone strikes
    game.alliesManager.summonDrone(DroneType.BOMBER);
    for (let i = 0; i < 6; i++) {
      game.alliesManager.spawnClusterBomb(50 + i * 20, 45);
      game.alliesManager.spawnExplosion(50 + i * 20, 115, 24, 2);
    }
    expect(game.alliesManager.getBombPool().getActiveCount()).toBeGreaterThanOrEqual(1);
    expect(game.alliesManager.getExplosionPool().getActiveCount()).toBeGreaterThanOrEqual(1);

    // 7. missilePool & sparkPool saturation: special nova barrage & energy sparks
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('nova');
    for (let i = 0; i < 10; i++) {
      game.specialMovesManager.spawnSpark(60 + i * 11, 130);
    }
    expect(
      game.specialMovesManager.getMissilePool().getActiveCount() +
        game.specialMovesManager.getSparkPool().getActiveCount()
    ).toBeGreaterThanOrEqual(5);

    // Mid-Action Abrupt Stage Boundary Teardown
    teardownStageBoundary(game);

    // STRICT INVARIANT: All 9 pools must instantly register exactly 0 active leases
    assertAll9PoolsHygiene(game, 'Post-Max-Saturation Boundary Teardown');

    // Run 30 simulation ticks post-teardown to ensure zero ghost revivals
    for (let t = 0; t < 30; t++) {
      game.update(1 / 60);
    }
    assertAll9PoolsHygiene(game, 'Post-Saturation Quiescence (30 Ticks Later)');
  });

  // ==========================================================================
  // Test 3: Erratic Stage Boundary Whiplash Invariant
  // ==========================================================================
  it('survives erratic non-linear stage whiplash across Stages 1..50 under mid-flight weapon load with complete pool recycling', () => {
    const cheat = game.getCheatController();
    const whiplashStages = [1, 50, 13, 26, 38, 10, 40, 20, 30, 1, 50];

    for (const targetStage of whiplashStages) {
      const skipped = cheat.skipToStage(targetStage);
      expect(skipped).toBe(true);

      // Generate mid-flight weapon and entity load
      cheat.applyPowerUp(M19_POWER_UPS[targetStage % M19_POWER_UPS.length]!);
      cheat.triggerGlitch(GLITCH_TYPES[targetStage % GLITCH_TYPES.length]!);
      game.alliesManager.summonDrone(DroneType.BOMBER);
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('nova');

      // Simulate 15 combat ticks
      for (let t = 0; t < 15; t++) {
        game.bulletManager.firePlayerBullet(game.player.x, game.player.y - 10, false, 320);
        game.update(1 / 60);
      }

      // Assert stage boundary teardown completely recycles all 9 pools
      teardownStageBoundary(game);
      assertAll9PoolsHygiene(game, `Whiplash Jump to Stage ${targetStage}`);
    }
  });

  // ==========================================================================
  // Test 4: Kinematic Continuity Invariant (Displacements <= 3.0 px/frame)
  // ==========================================================================
  it('verifies kinematic continuity under long-play sessions asserting no position jumps > 3.0 px/frame upon docking and physical kinematic limits', () => {
    const formation = new FormationManager();
    const detector = new KinematicTelemetryMonitor({ dt: 1 / 60 });

    const dockingDeltas: number[] = [];

    // ------------------------------------------------------------------------
    // Section A: Sub-Wave Entry & Formation Docking across Combat Stages (1, 2, 4, 5)
    // ------------------------------------------------------------------------
    const combatStages = [1, 2, 4, 5];
    for (const stage of combatStages) {
      formation.reset();
      detector.reset();

      formation.spawnStage(stage);
      expect(formation.isEntryWaveActive).toBe(true);

      const stageEnemies = formation.enemies.filter((e) => e.active);
      expect(stageEnemies.length).toBeGreaterThan(0);

      const prevPositions = new Map<string | number, { x: number; y: number; state: EnemyState }>();

      // Simulate 360 frames of sub-wave entry and arrival docking
      for (let frame = 1; frame <= 360; frame++) {
        formation.update(1 / 60);

        for (const enemy of formation.enemies) {
          if (!enemy.active) continue;

          const prev = prevPositions.get(enemy.id);
          if (prev) {
            const delta = Math.hypot(enemy.x - prev.x, enemy.y - prev.y);

            // Record exact docking transition delta when transitioning into IN_FORMATION
            if (prev.state !== EnemyState.IN_FORMATION && enemy.state === EnemyState.IN_FORMATION) {
              dockingDeltas.push(delta);
              // Strict invariant: docking jump must never exceed 3.0 px/frame
              expect(delta, `Enemy #${enemy.id} docking jump must be <= 3.0 px`).toBeLessThanOrEqual(3.0);
            }
          }

          prevPositions.set(enemy.id, { x: enemy.x, y: enemy.y, state: enemy.state });
          detector.checkEnemy(enemy, frame, 1 / 60);
        }
      }

      // Assert zero unphysical warp violations occurred
      expect(detector.anomalies, `Stage ${stage} subwave entry warp violations`).toHaveLength(0);
    }

    // ------------------------------------------------------------------------
    // Section B: Dive, Toroidal Re-Entry & Exponential Docking Cycles
    // ------------------------------------------------------------------------
    formation.reset();
    detector.reset();
    formation.spawnStage(2);
    formation.isEntryWaveActive = false;

    // Fast-forward initial slot placement
    formation.update(1 / 60);

    // Test peel-off and re-entry across different enemy tiers (Zako, Goei, Boss)
    const testDivers = [
      formation.enemies.find((e) => e.row === 4 && e.col === 0)!, // Outer Zako (max breathing expansion)
      formation.enemies.find((e) => e.row === 2 && e.col === 2)!, // Mid-row Goei
      formation.enemies.find((e) => e.type === EnemyType.BOSS)!,   // Boss Galaga
    ];

    for (const diver of testDivers) {
      expect(diver).toBeDefined();

      formation.peelOffSolo(diver, 112);
      expect(diver.state).toBe(EnemyState.DIVING_SOLO);

      let prevX = diver.x;
      let prevY = diver.y;
      let prevState = diver.state;
      let inFormationFrames = 0;

      for (let frame = 1; frame <= 600; frame++) {
        formation.update(1 / 60);

        const delta = Math.hypot(diver.x - prevX, diver.y - prevY);

        // Check docking transition
        if (prevState !== EnemyState.IN_FORMATION && diver.state === EnemyState.IN_FORMATION) {
          dockingDeltas.push(delta);
          expect(delta, `Diver #${diver.id} re-entry docking jump must be <= 3.0 px`).toBeLessThanOrEqual(3.0);
        }

        prevX = diver.x;
        prevY = diver.y;
        prevState = diver.state;

        detector.checkEnemy(diver, frame, 1 / 60);

        if (diver.state === EnemyState.IN_FORMATION) {
          inFormationFrames++;
          if (inFormationFrames >= 5) break;
        }
      }

      expect(inFormationFrames).toBeGreaterThanOrEqual(3);
    }

    expect(detector.anomalies, 'Dive and re-entry warp anomalies').toHaveLength(0);

    // ------------------------------------------------------------------------
    // Section C: Long-Session Harmonic Formation Oscillation (1,000 Frames)
    // ------------------------------------------------------------------------
    detector.reset();
    const livingEnemies = formation.enemies.filter((e) => e.active && e.state === EnemyState.IN_FORMATION);
    expect(livingEnemies.length).toBeGreaterThanOrEqual(30);

    for (let frame = 1; frame <= 1000; frame++) {
      formation.update(1 / 60);

      for (const enemy of livingEnemies) {
        detector.checkEnemy(enemy, frame, 1 / 60);
      }
    }

    // Natural breathing oscillation maximum displacement is <= 1.1 px (well under 3.0 px)
    expect(detector.anomalies, 'Formation breathing oscillation anomalies').toHaveLength(0);

    // ------------------------------------------------------------------------
    // Section D: Overall Telemetry Aggregation
    // ------------------------------------------------------------------------
    expect(dockingDeltas.length).toBeGreaterThan(0);
    const maxDockingDelta = Math.max(...dockingDeltas);
    // Strict invariant: Maximum docking delta across all evaluated cycles must be <= 3.0 px/frame
    expect(maxDockingDelta).toBeLessThanOrEqual(3.0);
  });
});
