/**
 * Milestone 15 — Playwright Automated 50-Round Memory Bot & E2E Verification
 * 
 * Verifies:
 * 1. Global window.__GALAGA_CHEAT__ controller presence and method execution in real browser.
 * 2. Rapid headless automated 50-round traversal through all 50 stages.
 * 3. 0 JavaScript runtime errors, uncaught exceptions, and console.error events across 50 rounds.
 * 4. DOM and Canvas attachment, letterbox aspect ratio, and active continuous rendering.
 */

import { test, expect } from '@playwright/test';
import { createErrorCollector, verifyCanvasRendering, getCanvasDimensions } from './helpers/test-utils';

test.describe('Milestone 15: Automated 50-Round Memory Bot & Browser E2E Suite', () => {
  test.setTimeout(120000); // 2-minute limit for complete 50-stage traversal

  test('TC-M15-E2E-BOT: 50-round continuous simulation bot with zero errors and clean canvas rendering', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // 1. Navigate to application entry point
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // 2. Verify Canvas attachment and initial aspect ratio
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeAttached();
    await expect(canvas).toBeVisible();

    const dimensions = await getCanvasDimensions(page, '#game-canvas');
    expect(dimensions).not.toBeNull();
    const expectedAspectRatio = 224 / 288;
    expect(dimensions!.attrAspectRatio).toBeCloseTo(expectedAspectRatio, 2);

    // 3. Verify window.__GALAGA_CHEAT__ controller mounting
    await page.waitForFunction(() => typeof (window as any).__GALAGA_CHEAT__ !== 'undefined');

    const cheatStatus = await page.evaluate(() => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      return {
        hasSkip: typeof cheat?.skipToStage === 'function',
        hasCrisis: typeof cheat?.triggerCrisis === 'function',
        hasBoss: typeof cheat?.spawnBoss === 'function',
        hasSpecial: typeof cheat?.triggerSpecialMove === 'function',
        hasInvincible: typeof cheat?.setInvincible === 'function',
        hasDrone: typeof cheat?.unlockDrone === 'function',
        hasEnergy: typeof cheat?.fillEnergy === 'function',
        hasKill: typeof cheat?.killAllEnemies === 'function',
        hasScore: typeof cheat?.setScore === 'function',
        hasLives: typeof cheat?.addLives === 'function',
        hasGameState: typeof cheat?.getGameState === 'function',
      };
    });

    expect(cheatStatus.hasSkip).toBe(true);
    expect(cheatStatus.hasCrisis).toBe(true);
    expect(cheatStatus.hasBoss).toBe(true);
    expect(cheatStatus.hasSpecial).toBe(true);
    expect(cheatStatus.hasInvincible).toBe(true);
    expect(cheatStatus.hasDrone).toBe(true);
    expect(cheatStatus.hasEnergy).toBe(true);
    expect(cheatStatus.hasKill).toBe(true);
    expect(cheatStatus.hasScore).toBe(true);
    expect(cheatStatus.hasLives).toBe(true);
    expect(cheatStatus.hasGameState).toBe(true);

    // 4. Activate Invincibility and initiate 50-round traversal
    const traversalResults = await page.evaluate(async () => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      cheat.setInvincible(true);

      const visitedStages: number[] = [];
      const bossSnapshots: number[] = [];
      const checkpoints: { stage: number; state: string; score: number }[] = [];

      for (let s = 1; s <= 50; s++) {
        cheat.skipToStage(s);

        // Periodically activate drones and special moves
        if (s % 10 === 0) {
          cheat.unlockDrone('all');
          cheat.triggerSpecialMove('nova');
          bossSnapshots.push(s);
        } else if (s % 5 === 0) {
          cheat.triggerSpecialMove('chrono');
        }

        const state = cheat.getGameState();
        visitedStages.push(state.stage);

        if ([1, 10, 20, 30, 40, 50].includes(s)) {
          checkpoints.push({
            stage: state.stage,
            state: state.state,
            score: state.score,
          });
        }

        // Allow at least 1 animation frame for rendering and DOM update
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      return {
        visitedCount: visitedStages.length,
        visitedStages,
        bossSnapshots,
        checkpoints,
        finalState: cheat.getGameState(),
      };
    });

    // 5. Verify Traversal Results
    expect(traversalResults.visitedCount).toBe(50);
    expect(traversalResults.visitedStages[0]).toBe(1);
    expect(traversalResults.visitedStages[49]).toBe(50);
    expect(traversalResults.bossSnapshots).toEqual([10, 20, 30, 40, 50]);
    expect(traversalResults.finalState.stage).toBe(50);
    expect(traversalResults.finalState.isInvincible).toBe(true);

    // 6. Verify Canvas is still actively rendering frames after 50 rounds
    const rendering = await verifyCanvasRendering(page, '#game-canvas', 400);
    expect(rendering.frameCount).toBeGreaterThan(5);
    expect(rendering.pixelChanged).toBe(true);

    // 7. Verify zero JavaScript errors / console errors occurred across the entire run
    const errors = errorCollector.getErrors();
    expect(errors).toEqual([]);
  });
});
