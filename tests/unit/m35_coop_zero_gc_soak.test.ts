/**
 * Milestone M35: Co-op Zero-GC Long-Session Soak & Object Pool Invariants (5,000 Frames)
 * File: tests/unit/m35_coop_zero_gc_soak.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { EnemyType } from '../../src/types';

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

function teardownStageBoundary(game: Game): void {
  game.bulletManager.clear();
  game.particleSystem.clear();
  if (game.powerUpManager) game.powerUpManager.reset();
  if (game.alliesManager) game.alliesManager.onStageClear();
  if (game.specialMovesManager) game.specialMovesManager.onStageClear();
  if (game.formationManager) game.formationManager.reset();
  if (game.bossManager) game.bossManager.reset();
  if (game.crisisEventManager) {
    game.crisisEventManager.clearCrisis();
    game.crisisEventManager.onStageClear();
  }
  if (game.glitchEventManager) game.glitchEventManager.clearGlitch();
  if (game.playerManager) game.playerManager.onStageClear();
}

function assertAllPoolsHygiene(game: Game, context: string): void {
  const bulletPool = game.bulletManager.getPool();
  expect(bulletPool.getActiveCount(), `${context}: bulletPool activeCount`).toBe(0);
  expect(bulletPool.getCapacity(), `${context}: bulletPool capacity`).toBeLessThanOrEqual(256);

  const particlePool = game.particleSystem.getPool();
  expect(particlePool.getActiveCount(), `${context}: particlePool activeCount`).toBe(0);
  expect(particlePool.getCapacity(), `${context}: particlePool capacity`).toBeLessThanOrEqual(256);

  const powerUpPool = game.powerUpManager.getPool();
  expect(powerUpPool.getActiveCount(), `${context}: powerUpPool activeCount`).toBe(0);
  expect(powerUpPool.getCapacity(), `${context}: powerUpPool capacity`).toBeLessThanOrEqual(32);

  const enemyPool = game.formationManager.getEnemyPool();
  expect(enemyPool.getActiveCount(), `${context}: enemyPool activeCount`).toBe(0);
  expect(enemyPool.getCapacity(), `${context}: enemyPool capacity`).toBeLessThanOrEqual(64);

  const phantomPool = game.formationManager.getPhantomPool();
  expect(phantomPool.getActiveCount(), `${context}: phantomPool activeCount`).toBe(0);
  expect(phantomPool.getCapacity(), `${context}: phantomPool capacity`).toBeLessThanOrEqual(8);

  const bombPool = game.alliesManager.getBombPool();
  expect(bombPool.getActiveCount(), `${context}: bombPool activeCount`).toBe(0);
  expect(bombPool.getCapacity(), `${context}: bombPool capacity`).toBeLessThanOrEqual(16);

  const explosionPool = game.alliesManager.getExplosionPool();
  expect(explosionPool.getActiveCount(), `${context}: explosionPool activeCount`).toBe(0);
  expect(explosionPool.getCapacity(), `${context}: explosionPool capacity`).toBeLessThanOrEqual(16);

  const missilePool = game.specialMovesManager.getMissilePool();
  expect(missilePool.getActiveCount(), `${context}: missilePool activeCount`).toBe(0);
  expect(missilePool.getCapacity(), `${context}: missilePool capacity`).toBeLessThanOrEqual(32);

  const sparkPool = game.specialMovesManager.getSparkPool();
  expect(sparkPool.getActiveCount(), `${context}: sparkPool activeCount`).toBe(0);
  expect(sparkPool.getCapacity(), `${context}: sparkPool capacity`).toBeLessThanOrEqual(32);
}

function assertZeroNaN(game: Game, context: string): void {
  for (const p of game.playerManager.getPlayers()) {
    expect(Number.isFinite(p.x), `${context}: Player ${p.id} X must be finite`).toBe(true);
    expect(Number.isFinite(p.y), `${context}: Player ${p.id} Y must be finite`).toBe(true);
    expect(Number.isNaN(p.x), `${context}: Player ${p.id} X is NaN`).toBe(false);
    expect(Number.isNaN(p.y), `${context}: Player ${p.id} Y is NaN`).toBe(false);
  }
}

describe('Milestone M35: Co-op Zero-GC Long-Session Soak (5,000 Frames)', { timeout: 60000 }, () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
    game.startGame();
    game.setState('PLAYING');
  });

  afterEach(() => {
    if (game) game.destroy();
  });

  it('simulates 5,000 frames of intensive co-op combat with < 5.0 MB heap drift and 0 pool leaks', () => {
    const cheat = game.getCheatController();
    const p1 = game.playerManager.getPlayer('p1')!;
    const p2 = game.playerManager.getPlayer('p2')!;

    // Warmup JIT compiler and initial pool allocations (120 ticks)
    for (let t = 0; t < 120; t++) {
      game.update(1 / 60);
    }
    teardownStageBoundary(game);

    forceGC();
    const baselineHeap = process.memoryUsage().heapUsed;

    const TOTAL_FRAMES = 5000;
    const CHECKPOINT_INTERVAL = 1000;
    const heapCheckpoints: number[] = [];

    for (let frame = 1; frame <= TOTAL_FRAMES; frame++) {
      // 1. Independent Player Sweeping Kinematics
      p1.x = 80 + Math.sin(frame * 0.05) * 40;
      p2.x = 144 + Math.cos(frame * 0.05) * 40;

      // 2. Concurrent Alternating Missile Firing
      if (frame % 4 === 0) {
        game.bulletManager.firePlayerBullet(p1.x, p1.y - 10, false, 360, 0, undefined, undefined, 'p1');
      }
      if (frame % 4 === 2) {
        game.bulletManager.firePlayerBullet(p2.x, p2.y - 10, false, 360, 0, undefined, undefined, 'p2');
      }

      // 3. Enemy Formation Diving & Firing
      if (frame % 60 === 0) {
        const living = game.formationManager.getLivingEnemies();
        if (living.length > 0) {
          game.formationManager.peelOffSolo(living[0]!, p1.x);
        } else {
          game.formationManager.spawnStage(2);
        }
      }
      if (frame % 25 === 0) {
        game.bulletManager.fireEnemyBullet(112, 70, p2.x, p2.y, 180);
      }

      // 4. Co-op Revive Pending & Life Donation Cycling
      if (frame % 700 === 300) {
        p2.startRevivePending(10.0);
      }
      if (frame % 700 === 360) {
        if (p1.lives <= 1) p1.lives = 3; // Replenish reserve lives for test continuity
        if (game.playerManager.canDonateLife('p1')) {
          game.playerManager.donateLife('p1');
        }
      }

      // 5. Periodic Power-Up & Glitch Injection
      if (frame % 350 === 0) {
        cheat.spawnPowerUp('chrono_field', 100, 50);
      }
      if (frame % 500 === 0) {
        cheat.triggerGlitch('mirage');
        game.formationManager.spawnMirageClones(112, 90, EnemyType.GOEI);
      }

      // 6. Simulation Tick Update
      game.update(1 / 60);

      // 7. Checkpoint Heap Profiling every 1,000 frames
      if (frame % CHECKPOINT_INTERVAL === 0) {
        forceGC();
        const currentHeap = process.memoryUsage().heapUsed;
        const driftMB = (currentHeap - baselineHeap) / (1024 * 1024);
        heapCheckpoints.push(driftMB);
        expect(driftMB, `Frame ${frame} heap drift must be < 5.0 MB`).toBeLessThan(5.0);
        assertZeroNaN(game, `Frame ${frame}`);
      }
    }

    // Teardown & Verify Final State
    teardownStageBoundary(game);
    assertAllPoolsHygiene(game, 'Post-5000-Frame Soak Teardown');

    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const finalDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

    expect(heapCheckpoints).toHaveLength(5);
    expect(finalDriftMB, 'Final 5,000-frame net heap drift must be < 5.0 MB').toBeLessThan(5.0);
  });
});
