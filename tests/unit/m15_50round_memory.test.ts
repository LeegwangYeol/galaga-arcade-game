/**
 * Milestone 15 — 50-Round Memory Bot & Zero-Leak Verification Test Suite
 * 
 * Verifies:
 * 1. Headless automated 50-stage traversal across all 50 rounds (1..50).
 * 2. Strict < 5.0 MB net heap growth invariant between Stage 1 and Stage 50.
 * 3. Strict pool capacity upper bounds across all 8 object pools (no runaway autoExpand).
 * 4. Strict getActiveCount() === 0 invariant across all pools upon stage teardown.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';

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
    // Fallback if V8 sandboxed
  }
}

describe('Milestone 15: 50-Round Memory Bot & Zero-Leak Profiling', () => {
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

  it('traverses all 50 rounds with < 5.0 MB net heap growth and bounded pools', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // 1. Warmup & JIT Stabilization (60 update ticks at Stage 1)
    cheat.skipToStage(1);
    for (let t = 0; t < 60; t++) {
      if (t % 10 === 0) {
        game.bulletManager.firePlayerBullet(112, 240, false, 300);
      }
      game.update(1 / 60);
    }
    cheat.killAllEnemies();
    cheat.skipToStage(1);

    forceGC();

    const baselineHeap = process.memoryUsage().heapUsed;
    const checkpointHeap: Record<number, number> = { 1: baselineHeap };
    const stagesEncountered: number[] = [];
    const bossStagesEncountered: number[] = [];
    const challengingStagesEncountered: number[] = [];

    // 2. Automated 50-Round Traversal
    for (let stage = 1; stage <= 50; stage++) {
      stagesEncountered.push(stage);
      const skipped = cheat.skipToStage(stage);
      expect(skipped).toBe(true);
      expect(game.stage).toBe(stage);

      if (DifficultyCalculator.isBossStage(stage)) {
        bossStagesEncountered.push(stage);
        expect(game.bossManager.activeBoss).not.toBeNull();
      }

      if (DifficultyCalculator.isChallengingStage(stage)) {
        challengingStagesEncountered.push(stage);
        expect(game.formationManager.isChallengingStage).toBe(true);
      }

      // Simulate combat: fire bullets, move player, update entities for 20 frames
      for (let f = 0; f < 20; f++) {
        // Player firing
        if (f % 5 === 0) {
          game.bulletManager.firePlayerBullet(game.player.x, game.player.y - 10, false, 300);
        }

        // Periodic allies drone and special move exercise
        if (stage % 5 === 0 && f === 0) {
          cheat.unlockDrone('bomber');
          cheat.triggerSpecialMove('nova');
        }

        game.update(1 / 60);

        // Damage boss if present
        if (game.bossManager.activeBoss?.active && f % 5 === 0) {
          game.bossManager.activeBoss.takeDamage(50);
        }
      }

      // Defeat remaining entities
      cheat.killAllEnemies();

      // Teardown for next stage
      cheat.skipToStage(stage);

      // Verify all 7 active object pools have strictly 0 active items
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);

      // Verify pool capacities remain strictly within max capacity limits
      expect(game.bulletManager.getPool().getCapacity()).toBeLessThanOrEqual(256);
      expect(game.particleSystem.getPool().getCapacity()).toBeLessThanOrEqual(256);
      expect(game.powerUpManager.getPool().getCapacity()).toBeLessThanOrEqual(32);
      expect(game.alliesManager.getBombPool().getCapacity()).toBeLessThanOrEqual(16);
      expect(game.alliesManager.getExplosionPool().getCapacity()).toBeLessThanOrEqual(16);
      expect(game.specialMovesManager.getMissilePool().getCapacity()).toBeLessThanOrEqual(32);
      expect(game.specialMovesManager.getSparkPool().getCapacity()).toBeLessThanOrEqual(32);
      expect(game.formationManager.getEnemyPool().getCapacity()).toBeLessThanOrEqual(64);

      if ([10, 20, 30, 40, 50].includes(stage)) {
        forceGC();
        checkpointHeap[stage] = process.memoryUsage().heapUsed;
      }
    }

    // 3. Post-Traversal Garbage Collection & Final Heap Sample
    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const netDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

    // Assertions
    expect(stagesEncountered.length).toBe(50);
    expect(bossStagesEncountered).toEqual([10, 20, 30, 40, 50]);
    expect(challengingStagesEncountered.length).toBe(12);

    // Strict < 5.0 MB Net Heap Drift Invariant
    expect(netDriftMB).toBeLessThan(5.0);
  });
});
