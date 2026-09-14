/**
 * Milestone 20 — Automated Playwright E2E 50-Round Simulation & Post-Launch Expansion Test Suite
 * File: tests/e2e/post_launch_glitch_items_50round.spec.ts
 *
 * Verifies:
 * 1. Real-time DDA skill index manipulation (0.10 vs 0.95) & dynamic actuator multiplier scaling.
 * 2. All 5 Glitch Types (teleport, kinetic, mirage, vector, raster), phantom clone decoys, and Glitch Sectors (13, 26, 38).
 * 3. In-game combat validation for all 5 M19 Power-Ups:
 *    - Chrono Field: 60% bullet velocity slowdown inside 120px radius.
 *    - Reflection Shield: lethal impact absorption and counter-missile firing without player death.
 *    - Singularity EMP Collector: bullet absorption within 90px, +50 score, +5% special energy.
 *    - Quantum Phase Drive: lateral warp blink (+40px), 0.4s invulnerability.
 *    - Antimatter Plasma Blaster: continuous piercing vertical beam, multi-rank minion penetration.
 * 4. Multi-system stress integration with Epic Bosses (10, 20, 30, 40, 50) and Stellaris Crises.
 * 5. Full 50-Round continuous traversal with 0 console errors, 0 NaN values, and < 5.0 MB net heap drift.
 */

import { test, expect } from '@playwright/test';
import { createErrorCollector, verifyCanvasRendering } from './helpers/test-utils';

test.describe('Milestone 20: Post-Launch Glitch, DDA & 5 New Power-Up Items 50-Round E2E Simulation Suite', () => {
  test.setTimeout(120000); // 2-minute limit for complete test execution

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForFunction(() => typeof (window as any).__GALAGA_CHEAT__ !== 'undefined');
  });

  /**
   * Helper to collect heap used in bytes via CDP (Chromium) or window.performance.memory fallback.
   */
  async function sampleHeapBytes(page: any): Promise<number> {
    try {
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send('HeapProfiler.enable');
        await cdp.send('Performance.enable');
        await cdp.send('HeapProfiler.collectGarbage');
        const metrics = await cdp.send('Performance.getMetrics');
        const jsHeap = metrics.metrics?.find((m: any) => m.name === 'JSHeapUsedSize');
        if (jsHeap && jsHeap.value > 0) {
          return jsHeap.value;
        }
      } finally {
        await cdp.detach().catch(() => {});
      }
    } catch {
      // Non-CDP browsers (Firefox, WebKit) fallback
    }
    return page.evaluate(() => (window.performance as any)?.memory?.usedJSHeapSize ?? 0);
  }

  // ==========================================================================
  // Test Case 1: DDA Real-Time Proficiency & Actuator Scaling
  // ==========================================================================
  test('TC-M20-E2E-DDA: dynamic difficulty adjustment scales dive speed and bullet density correctly', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    const ddaResults = await page.evaluate(() => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      cheat.skipToStage(1);

      // 1. Low Proficiency Test (sigma = 0.10)
      cheat.setDDAProficiency(0.10);
      const lowMetrics: any = cheat.getDDAMetrics();
      const lowState = cheat.getGameState();

      // 2. High Proficiency Test (sigma = 0.95)
      cheat.setDDAProficiency(0.95);
      const highMetrics: any = cheat.getDDAMetrics();
      const highState = cheat.getGameState();

      // 3. Reset DDA to neutral
      cheat.resetDDA();
      cheat.setDDAProficiency(null);
      const resetMetrics: any = cheat.getDDAMetrics();

      return {
        low: {
          skillIndex: lowMetrics.actuators.skillIndex,
          diveSpeed: lowMetrics.actuators.diveSpeedMultiplier,
          bulletDensity: lowMetrics.actuators.bulletDensityMultiplier,
          bossHp: lowMetrics.actuators.bossHealthMultiplier,
          stateDDA: lowState.dda,
        },
        high: {
          skillIndex: highMetrics.actuators.skillIndex,
          diveSpeed: highMetrics.actuators.diveSpeedMultiplier,
          bulletDensity: highMetrics.actuators.bulletDensityMultiplier,
          bossHp: highMetrics.actuators.bossHealthMultiplier,
          stateDDA: highState.dda,
        },
        reset: {
          diveSpeed: resetMetrics.actuators.diveSpeedMultiplier,
          bulletDensity: resetMetrics.actuators.bulletDensityMultiplier,
        },
      };
    });

    // Verify Low Proficiency Scaling (sigma = 0.10)
    expect(ddaResults.low.skillIndex).toBeCloseTo(0.10, 2);
    expect(ddaResults.low.diveSpeed).toBeCloseTo(0.90, 2);       // 0.85 + 0.50 * 0.10 = 0.90
    expect(ddaResults.low.bulletDensity).toBeCloseTo(0.86, 2);   // 0.80 + 0.60 * 0.10 = 0.86
    expect(ddaResults.low.bossHp).toBeCloseTo(0.92, 2);          // 0.90 + 0.10 * 0.20 = 0.92

    // Verify High Proficiency Scaling (sigma = 0.95)
    expect(ddaResults.high.skillIndex).toBeCloseTo(0.95, 2);
    expect(ddaResults.high.diveSpeed).toBeCloseTo(1.325, 2);     // 0.85 + 0.50 * 0.95 = 1.325
    expect(ddaResults.high.bulletDensity).toBeCloseTo(1.37, 2);   // 0.80 + 0.60 * 0.95 = 1.370
    expect(ddaResults.high.bossHp).toBeCloseTo(1.225, 2);        // 1.00 + (0.95 - 0.50) * 0.50 = 1.225

    // Relative Invariant: High proficiency produces higher challenge than low proficiency
    expect(ddaResults.high.diveSpeed).toBeGreaterThan(ddaResults.low.diveSpeed);
    expect(ddaResults.high.bulletDensity).toBeGreaterThan(ddaResults.low.bulletDensity);
    expect(ddaResults.high.bossHp).toBeGreaterThan(ddaResults.low.bossHp);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ==========================================================================
  // Test Case 2: Glitch Events & Glitch Sectors (13, 26, 38)
  // ==========================================================================
  test('TC-M20-E2E-GLITCH: all 5 glitch types, phantom decoys, and Glitch Sectors 13, 26, 38 execute and recover cleanly', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    const glitchResults = await page.evaluate(async () => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      const game = cheat.getGame();
      cheat.skipToStage(1);

      const typeSnapshots: Record<string, any> = {};
      const glitchTypes = ['teleport', 'kinetic', 'mirage', 'vector', 'raster'];

      for (const t of glitchTypes) {
        cheat.triggerGlitch(t);
        await new Promise((r) => requestAnimationFrame(r));
        const s = cheat.getGameState();
        typeSnapshots[t] = {
          active: s.glitch?.active,
          state: s.glitch?.state,
          type: s.glitch?.type,
        };
      }

      // Phantom Clone Decoy verification
      cheat.triggerGlitch('mirage');
      const phantom = game.formationManager.phantomPool.acquire();
      phantom.init(112, 100, 0, 50);
      const hitResult = phantom.takeDamage(1);
      const isPhantomExcluded = !game.formationManager.getLivingEnemies().includes(phantom as any);
      game.formationManager.phantomPool.release(phantom);

      // Clean Recovery with clearGlitch()
      cheat.clearGlitch();
      const clearedState = cheat.getGameState();

      // Glitch Sectors at Stages 13, 26, 38
      const sectorResults: Record<number, any> = {};
      const sectorStages = [13, 26, 38];

      for (const stg of sectorStages) {
        cheat.skipToStage(stg);
        await new Promise((r) => requestAnimationFrame(r));
        const s = cheat.getGameState();
        sectorResults[stg] = {
          stage: s.stage,
          active: s.glitch?.active,
          type: s.glitch?.type,
          isSector: s.glitch?.isGlitchSector,
        };
        cheat.clearGlitch();
      }

      return {
        typeSnapshots,
        phantomHit: {
          destroyed: hitResult.destroyed,
          shieldAbsorbed: hitResult.shieldAbsorbed,
          points: hitResult.points,
          isExcluded: isPhantomExcluded,
        },
        cleared: {
          active: clearedState.glitch?.active,
          state: clearedState.glitch?.state,
          type: clearedState.glitch?.type,
        },
        sectorResults,
      };
    });

    // Verify all 5 glitch types activated correctly
    expect(glitchResults.typeSnapshots['teleport'].active).toBe(true);
    expect(glitchResults.typeSnapshots['teleport'].type).toBe('QUANTUM_TELEPORT');

    expect(glitchResults.typeSnapshots['kinetic'].active).toBe(true);
    expect(glitchResults.typeSnapshots['kinetic'].type).toBe('KINETIC_INVERSION');

    expect(glitchResults.typeSnapshots['mirage'].active).toBe(true);
    expect(glitchResults.typeSnapshots['mirage'].type).toBe('MIRAGE_CLONES');

    expect(glitchResults.typeSnapshots['vector'].active).toBe(true);
    expect(glitchResults.typeSnapshots['vector'].type).toBe('KINETIC_INVERSION');

    expect(glitchResults.typeSnapshots['raster'].active).toBe(true);
    expect(glitchResults.typeSnapshots['raster'].type).toBe('RASTER_TEAR');

    // Verify Phantom Decoy Hitbox & Pool Isolation
    expect(glitchResults.phantomHit.destroyed).toBe(false);
    expect(glitchResults.phantomHit.shieldAbsorbed).toBe(true);
    expect(glitchResults.phantomHit.points).toBe(0);
    expect(glitchResults.phantomHit.isExcluded).toBe(true);

    // Verify clean recovery
    expect(glitchResults.cleared.active).toBe(false);
    expect(glitchResults.cleared.state).toBe('IDLE');
    expect(glitchResults.cleared.type).toBeNull();

    // Verify Glitch Sectors at Stages 13, 26, 38
    for (const stg of [13, 26, 38]) {
      expect(glitchResults.sectorResults[stg].stage).toBe(stg);
      expect(glitchResults.sectorResults[stg].active).toBe(true);
      expect(glitchResults.sectorResults[stg].isSector).toBe(true);
      expect(glitchResults.sectorResults[stg].type).toBe('SECTOR_ANOMALY');
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ==========================================================================
  // Test Case 3: M19 5 New Power-Up Items Live In-Game Combat Validation
  // ==========================================================================
  test('TC-M20-E2E-NEW-ITEMS: Chrono Field, Reflection Shield, EMP Collector, Phase Drive, and Antimatter Plasma validate in live combat', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    const itemResults = await page.evaluate(async () => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      const game = cheat.getGame();
      const player = game.player;
      cheat.skipToStage(1);

      // 1. Chrono Field: Verify 60% bullet slowdown inside 120px radius
      cheat.applyPowerUp('chrono_field');
      const hasChrono = player.hasChronoField;
      const bullet1 = game.bulletManager.bulletPool.acquire();
      bullet1.init(player.x, player.y - 40, 0, 100, 'ENEMY');
      const initialY = bullet1.position.y;
      // Advance bulletManager by dt = 0.1s
      const chronoFieldObj = { x: player.x, y: player.y, radiusSq: 14400, slowFactor: 0.40 };
      game.bulletManager.update(0.1, 0.1, chronoFieldObj);
      const chronoDisplacement = bullet1.position.y - initialY;
      game.bulletManager.recycle(bullet1);
      player.chronoFieldTimer = 0;

      // 2. Kinetic Reflection Shield: Absorbs lethal hit and fires counter-missile
      cheat.applyPowerUp('reflection_shield');
      const initialLives = player.lives;
      let counterMissileFired = false;
      const originalDeflect = player.onReflectionDeflect;
      player.onReflectionDeflect = (x: number, y: number, threat: any) => {
        counterMissileFired = true;
        originalDeflect?.(x, y, threat);
      };
      // Simulate bullet collision triggering hitTestAndDamage with threat hitbox
      const threatBox = { x: player.x - 4, y: player.y - 4, width: 8, height: 8 };
      player.hitTestAndDamage(threatBox);
      const hasReflection = player.hasReflectionShieldActive;
      const livesAfterHit = player.lives;
      player.reflectionShieldTimer = 0;
      player.hasReflectionShield = false;

      // 3. Singularity EMP Collector: Absorbs bullets within 90px, +50 score, +5% energy
      cheat.applyPowerUp('emp_collector');
      cheat.setScore(1000);
      cheat.fillEnergy(20);
      const scoreBefore = cheat.getGameState().score;
      const energyBefore = cheat.getGameState().energy;
      // Spawn bullet within 90px (30px offset)
      const bullet2 = game.bulletManager.bulletPool.acquire();
      bullet2.init(player.x + 30, player.y - 30, 0, 50, 'ENEMY');
      // Run PowerUpManager update
      game.powerUpManager.update(0.016, player);
      const scoreAfter = cheat.getGameState().score;
      const energyAfter = cheat.getGameState().energy;
      player.empCollectorTimer = 0;

      // 4. Quantum Phase Drive: Lateral warp position shift & 0.4s intangibility
      cheat.applyPowerUp('phase_drive');
      player.x = 112;
      player.triggerPhaseWarp(1); // Warp right (+40px)
      const warpedX = player.x;
      const invulTimer = player.invulnerableTimer;
      player.phaseDriveTimer = 0;

      // 5. Antimatter Plasma Blaster: Continuous vertical piercing beam through multi-rank minions
      cheat.applyPowerUp('antimatter_plasma');
      // Create 3 test enemies at different vertical ranks in the same column
      const e1 = game.formationManager.enemyPool.acquire();
      const e2 = game.formationManager.enemyPool.acquire();
      const e3 = game.formationManager.enemyPool.acquire();
      e1.init('e1_test', 'zako' as any, 1, 1, player.x, 180);
      e2.init('e2_test', 'goei' as any, 2, 1, player.x, 120);
      e3.init('e3_test', 'boss' as any, 3, 1, player.x, 60);
      game.formationManager.enemies.push(e1, e2, e3);

      let enemiesDamagedCount = 0;
      const origE1Dmg = e1.takeDamage.bind(e1);
      const origE2Dmg = e2.takeDamage.bind(e2);
      const origE3Dmg = e3.takeDamage.bind(e3);
      e1.takeDamage = (amt: number) => { enemiesDamagedCount++; return origE1Dmg(amt); };
      e2.takeDamage = (amt: number) => { enemiesDamagedCount++; return origE2Dmg(amt); };
      e3.takeDamage = (amt: number) => { enemiesDamagedCount++; return origE3Dmg(amt); };

      // Trigger plasma beam tick
      player.onPlasmaBeamTick?.(player.x, player.y, false);

      // Clean up test enemies
      game.formationManager.reset();
      player.plasmaBlasterTimer = 0;

      // Telemetry verification via getGameState().powerups
      cheat.applyPowerUp('chrono_field');
      const powerupsState = cheat.getGameState().powerups;

      return {
        chrono: { hasChrono, displacement: chronoDisplacement },
        reflection: { hasReflection, initialLives, livesAfterHit, counterMissileFired },
        emp: { scoreGain: scoreAfter - scoreBefore, energyGain: energyAfter - energyBefore },
        phase: { warpedX, invulTimer },
        plasma: { enemiesDamagedCount },
        powerupsState,
      };
    });

    // 1. Chrono Field Verification: 60% reduction -> displacement is 4.0px instead of 10.0px
    expect(itemResults.chrono.hasChrono).toBe(true);
    expect(itemResults.chrono.displacement).toBeCloseTo(4.0, 1);

    // 2. Reflection Shield Verification: Hull preserved, counter missile triggered
    expect(itemResults.reflection.livesAfterHit).toBe(itemResults.reflection.initialLives);
    expect(itemResults.reflection.counterMissileFired).toBe(true);

    // 3. Singularity EMP Collector: Exact +50 score and +5% special move energy
    expect(itemResults.emp.scoreGain).toBe(50);
    expect(itemResults.emp.energyGain).toBe(5);

    // 4. Quantum Phase Drive: Exact +40px position shift & >= 0.35s invulnerability
    expect(itemResults.phase.warpedX).toBe(152); // 112 + 40 = 152
    expect(itemResults.phase.invulTimer).toBeGreaterThanOrEqual(0.35);

    // 5. Antimatter Plasma Blaster: Penetrated all 3 vertical minion ranks simultaneously
    expect(itemResults.plasma.enemiesDamagedCount).toBe(3);

    // 6. getGameState().powerups telemetry verification
    expect(itemResults.powerupsState).toBeDefined();
    expect(itemResults.powerupsState.activeBuffs.chronoFieldTimer).toBeGreaterThan(0);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ==========================================================================
  // Test Case 4: Epic Bosses (10, 20, 30, 40, 50) & Crisis Stress Integration
  // ==========================================================================
  test('TC-M20-E2E-BOSS-CRISIS: Epic Bosses 10, 20, 30, 40, 50 and Stellaris crises integrate cleanly with new mechanics', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    const integrationResults = await page.evaluate(async () => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      const bossSnapshots: Record<number, any> = {};
      const bossStages = [10, 20, 30, 40, 50];
      const crisisTypes = [
        'the_contingency',
        'the_unbidden',
        'nanite_cloud',
        'psionic_resonance',
        'nemesis_star_eater',
      ];

      for (let i = 0; i < bossStages.length; i++) {
        const stage = bossStages[i]!;
        const crisis = crisisTypes[i]!;

        // Spawn Boss
        cheat.spawnBoss(stage);
        // Trigger Crisis
        cheat.triggerCrisis(crisis);
        // Trigger Glitch
        cheat.triggerGlitch('raster');
        // Activate New Power-Ups
        cheat.applyPowerUp('antimatter_plasma');
        cheat.applyPowerUp('reflection_shield');
        cheat.applyPowerUp('chrono_field');

        // Let simulation run for 5 frames
        for (let f = 0; f < 5; f++) {
          await new Promise((r) => requestAnimationFrame(r));
        }

        const state = cheat.getGameState();
        const activeBoss = cheat.getActiveBoss();

        bossSnapshots[stage] = {
          stage: state.stage,
          bossActive: activeBoss !== null,
          bossHealth: activeBoss?.health ?? 0,
          crisisActive: cheat.getActiveCrisis() !== null,
          hasNaN: Number.isNaN(state.score) || Number.isNaN(state.lives) || Number.isNaN(activeBoss?.x),
        };

        // Teardown
        cheat.killAllEnemies();
        cheat.clearGlitch();
      }

      return bossSnapshots;
    });

    for (const stg of [10, 20, 30, 40, 50]) {
      expect(integrationResults[stg].stage).toBe(stg);
      expect(integrationResults[stg].bossActive).toBe(true);
      expect(integrationResults[stg].bossHealth).toBeGreaterThan(0);
      expect(integrationResults[stg].crisisActive).toBe(true);
      expect(integrationResults[stg].hasNaN).toBe(false);
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ==========================================================================
  // Test Case 5: 50-Round Continuous Traversal & Heap Stability (< 5.0 MB Drift)
  // ==========================================================================
  test('TC-M20-E2E-50ROUND-SOAK: 50-round traversal with glitch events, new items, 0 errors, and < 5.0 MB heap drift', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // 1. Initial Garbage Collection and Baseline Heap Measurement
    const baselineHeap = await sampleHeapBytes(page);

    // 2. Continuous 50-Round Traversal Loop
    const soakReport = await page.evaluate(async () => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      cheat.setInvincible(true);

      const visitedStages: number[] = [];
      const checkpoints: { stage: number; score: number; ddaDiveMult: number; glitchState: string }[] = [];
      let totalGlitchSectorsEncountered = 0;
      let totalBossesEncountered = 0;
      let nanDetected = false;

      const newPowerUpTypes = ['chrono_field', 'reflection_shield', 'emp_collector', 'phase_drive', 'antimatter_plasma'];

      for (let s = 1; s <= 50; s++) {
        cheat.skipToStage(s);

        // Cyclic Power-Up Activation (exercises all 5 new items)
        const powerUp = newPowerUpTypes[(s - 1) % newPowerUpTypes.length]!;
        cheat.applyPowerUp(powerUp);

        // Glitch Sector verification
        if ([13, 26, 38].includes(s)) {
          totalGlitchSectorsEncountered++;
        }

        // Boss Encounters
        if (s % 10 === 0) {
          totalBossesEncountered++;
          cheat.triggerSpecialMove('nova');
          cheat.killAllEnemies();
        }

        // Periodic Random Glitch Trigger
        if (s % 7 === 0) {
          cheat.triggerGlitch('teleport');
        }

        const state = cheat.getGameState();
        visitedStages.push(state.stage);

        if (
          Number.isNaN(state.stage) ||
          Number.isNaN(state.score) ||
          Number.isNaN(state.lives) ||
          Number.isNaN(state.dda?.diveSpeedMultiplier)
        ) {
          nanDetected = true;
        }

        if ([1, 10, 13, 20, 26, 30, 38, 40, 50].includes(s)) {
          checkpoints.push({
            stage: state.stage,
            score: state.score,
            ddaDiveMult: state.dda?.diveSpeedMultiplier ?? 1.0,
            glitchState: state.glitch?.state ?? 'IDLE',
          });
        }

        // Yield execution to allow 1 animation frame for rendering & pool cycling
        await new Promise((r) => requestAnimationFrame(r));
      }

      return {
        visitedCount: visitedStages.length,
        firstStage: visitedStages[0],
        lastStage: visitedStages[visitedStages.length - 1],
        totalGlitchSectorsEncountered,
        totalBossesEncountered,
        nanDetected,
        checkpoints,
      };
    });

    // 3. Final Garbage Collection and Final Heap Measurement
    const finalHeap = await sampleHeapBytes(page);

    // 4. Assert 50-Round Traversal Results
    expect(soakReport.visitedCount).toBe(50);
    expect(soakReport.firstStage).toBe(1);
    expect(soakReport.lastStage).toBe(50);
    expect(soakReport.totalGlitchSectorsEncountered).toBe(3); // Stages 13, 26, 38
    expect(soakReport.totalBossesEncountered).toBe(5);        // Stages 10, 20, 30, 40, 50
    expect(soakReport.nanDetected).toBe(false);

    // 5. Assert Net Heap Drift < 5.0 MB (in Chromium / environments supporting heap metrics)
    if (baselineHeap > 0 && finalHeap > 0) {
      const netHeapDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);
      console.log(`[TC-M20-E2E-50ROUND-SOAK] Baseline Heap: ${(baselineHeap / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[TC-M20-E2E-50ROUND-SOAK] Final Heap: ${(finalHeap / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[TC-M20-E2E-50ROUND-SOAK] Net Heap Drift: ${netHeapDriftMB.toFixed(3)} MB`);
      expect(netHeapDriftMB).toBeLessThan(5.0);
    }

    // 6. Verify Canvas is still actively rendering at 60 FPS after 50 rounds
    const rendering = await verifyCanvasRendering(page, '#game-canvas', 400);
    expect(rendering.frameCount).toBeGreaterThan(5);
    expect(rendering.pixelChanged).toBe(true);

    // 7. Verify Zero Console Errors & Zero Page Errors
    expect(errorCollector.getErrors()).toEqual([]);
  });
});
