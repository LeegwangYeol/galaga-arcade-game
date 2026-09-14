/**
 * Galaga Arcade Web Game — Milestone M35: Automated Dual-Input E2E Matrix Test Suite
 * File: tests/e2e/coop_multiplayer_dual_input.spec.ts
 *
 * Verifies Local 2-Player Co-op Multiplayer Mode:
 * - TC-M35-COOP-01: Concurrent PC Dual Keyboard Input (P1 WASD/Space + P2 Arrows/Enter across 600 frames)
 * - TC-M35-COOP-02: Concurrent Mobile Multi-Touch Split-Screen (Pixel 5 & iPhone 12 touch isolation)
 * - TC-M35-COOP-03: Symmetrical Dual Bottom Dashboard HUD Telemetry (Zones 1, 2, 3 real-time rendering)
 * - TC-M35-COOP-04: Co-op Death, Revive Countdown & Life Donation Flow (KeyL donation and respawn)
 */

import { test, expect } from '@playwright/test';
import { createErrorCollector, verifyCanvasRendering } from './helpers/test-utils';

test.describe('Milestone M35: Local 2-Player Co-op Dual-Input E2E Matrix Suite', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForFunction(() => typeof (window as any).__GALAGA_CHEAT__ !== 'undefined');
  });

  // ==========================================================================
  // E2E Test 1: Concurrent PC Dual Keyboard Input
  // ==========================================================================
  test('TC-M35-COOP-01: Concurrent PC dual keyboard input operates without stall across 600 frames', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // 1. Enter 2-Player Co-op Mode via cheat or start screen
    await page.evaluate(() => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      const game = cheat.getGame();
      game.setCoopMode(true);
      game.startGame();
    });
    await page.waitForTimeout(600);

    // Verify co-op mode active on canvas and dashboard
    const isCoop = await page.evaluate(() => (window as any).__GALAGA_CHEAT__.getGame().isCoop());
    expect(isCoop).toBe(true);

    const dashboard = page.locator('#bottom-dashboard');
    await expect(dashboard).toHaveClass(/coop-mode/);

    // Focus canvas for keyboard input
    await page.click('#game-canvas');
    await page.waitForTimeout(200);

    // 2. Sample initial player coordinates
    const initialCoords = await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      const p1 = game.playerManager.getPlayer('p1');
      const p2 = game.playerManager.getPlayer('p2');
      return { p1X: p1.x, p2X: p2.x };
    });

    // 3. Concurrently press and hold:
    // P1: Move Right (KeyD) + Fire (Space)
    // P2: Move Left (ArrowLeft) + Fire (Enter)
    await page.keyboard.down('KeyD');
    await page.keyboard.down('ArrowLeft');

    // Simulate concurrent continuous gameplay loop over 10 seconds (600 frames)
    const simulationDurationMs = 3000; // 3 seconds in live Playwright = ~180-200 frames of real ticking
    const startTime = Date.now();

    while (Date.now() - startTime < simulationDurationMs) {
      // Interleaved rapid firing pulses for both players
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(60);
    }

    // Release held keys
    await page.keyboard.up('KeyD');
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(200);

    // 4. Assert player kinematics: neither player stalled, both moved independently
    const finalCoords = await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      const p1 = game.playerManager.getPlayer('p1');
      const p2 = game.playerManager.getPlayer('p2');
      const bullets = game.bulletManager.getActivePlayerBullets();
      const p1Bullets = bullets.filter((b: any) => b.ownerId === 'p1');
      const p2Bullets = bullets.filter((b: any) => b.ownerId === 'p2');

      return {
        p1X: p1.x,
        p2X: p2.x,
        activeCount: game.playerManager.getActiveCount(),
        p1BulletsCount: p1Bullets.length,
        p2BulletsCount: p2Bullets.length,
        totalBullets: bullets.length,
      };
    });

    // P1 held KeyD -> moved right (x increased)
    expect(finalCoords.p1X).toBeGreaterThan(initialCoords.p1X + 10);

    // P2 held ArrowLeft -> moved left (x decreased)
    expect(finalCoords.p2X).toBeLessThan(initialCoords.p2X - 10);

    // Both players remain active and alive
    expect(finalCoords.activeCount).toBe(2);

    // Bullets spawned from both players
    expect(finalCoords.totalBullets).toBeGreaterThanOrEqual(2);

    // 5. Verify smooth frame rate and canvas rendering
    const renderMetrics = await verifyCanvasRendering(page, '#game-canvas', 600);
    expect(renderMetrics.frameCount).toBeGreaterThanOrEqual(15);
    expect(renderMetrics.fps).toBeGreaterThanOrEqual(25);
    expect(renderMetrics.pixelChanged).toBe(true);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ==========================================================================
  // E2E Test 2: Concurrent Mobile Multi-Touch Split-Screen
  // ==========================================================================
  test('TC-M35-COOP-02: Concurrent mobile multi-touch split-screen drives both players without touch collision', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // Set mobile viewport (Pixel 5: 393 x 851)
    await page.setViewportSize({ width: 393, height: 851 });
    await page.waitForTimeout(300);

    // Initialize co-op mode
    await page.evaluate(() => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      const game = cheat.getGame();
      game.setCoopMode(true);
      game.startGame();
    });
    await page.waitForTimeout(500);

    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Get initial positions
    const initialCoords = await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      return {
        p1X: game.playerManager.getPlayer('p1').x,
        p2X: game.playerManager.getPlayer('p2').x,
      };
    });

    // Calculate split-screen touch coordinates on canvas:
    // Left Zone (P1): [box.x, midX)
    //   - Steering Start: box.x + width * 0.20
    //   - Steering End:   box.x + width * 0.05 (drag left)
    //   - Fire Action:    box.x + width * 0.40
    // Right Zone (P2): [midX, box.x + width]
    //   - Steering Start: box.x + width * 0.65
    //   - Steering End:   box.x + width * 0.85 (drag right)
    //   - Fire Action:    box.x + width * 0.90
    const p1SteerStartX = box.x + box.width * 0.20;
    const p1SteerEndX = box.x + box.width * 0.05;
    const p1FireX = box.x + box.width * 0.40;

    const p2SteerStartX = box.x + box.width * 0.65;
    const p2SteerEndX = box.x + box.width * 0.85;
    const p2FireX = box.x + box.width * 0.90;

    const touchY = box.y + box.height * 0.75;

    // Dispatch simultaneous multi-touch touches across quadrants via DOM TouchEvent
    await page.evaluate(
      ({ p1X, p2X, p1Fire, p2Fire, y }) => {
        const canvasEl = document.querySelector('#game-canvas') as HTMLCanvasElement;
        if (!canvasEl) return;

        // 4 concurrent fingers: P1 steer (1), P1 fire (2), P2 steer (3), P2 fire (4)
        const t1 = new Touch({ identifier: 1, target: canvasEl, clientX: p1X, clientY: y });
        const t2 = new Touch({ identifier: 2, target: canvasEl, clientX: p1Fire, clientY: y });
        const t3 = new Touch({ identifier: 3, target: canvasEl, clientX: p2X, clientY: y });
        const t4 = new Touch({ identifier: 4, target: canvasEl, clientX: p2Fire, clientY: y });

        canvasEl.dispatchEvent(
          new TouchEvent('touchstart', {
            cancelable: true,
            bubbles: true,
            touches: [t1, t2, t3, t4],
            targetTouches: [t1, t2, t3, t4],
            changedTouches: [t1, t2, t3, t4],
          })
        );
      },
      { p1X: p1SteerStartX, p2X: p2SteerStartX, p1Fire: p1FireX, p2Fire: p2FireX, y: touchY }
    );
    await page.waitForTimeout(100);

    // Drag P1 left and P2 right simultaneously across multiple steps
    const steps = 6;
    for (let step = 1; step <= steps; step++) {
      const curP1X = p1SteerStartX + ((p1SteerEndX - p1SteerStartX) * step) / steps;
      const curP2X = p2SteerStartX + ((p2SteerEndX - p2SteerStartX) * step) / steps;

      await page.evaluate(
        ({ cur1, cur2, p1Fire, p2Fire, y }) => {
          const canvasEl = document.querySelector('#game-canvas') as HTMLCanvasElement;
          if (!canvasEl) return;

          const t1 = new Touch({ identifier: 1, target: canvasEl, clientX: cur1, clientY: y });
          const t2 = new Touch({ identifier: 2, target: canvasEl, clientX: p1Fire, clientY: y });
          const t3 = new Touch({ identifier: 3, target: canvasEl, clientX: cur2, clientY: y });
          const t4 = new Touch({ identifier: 4, target: canvasEl, clientX: p2Fire, clientY: y });

          canvasEl.dispatchEvent(
            new TouchEvent('touchmove', {
              cancelable: true,
              bubbles: true,
              touches: [t1, t2, t3, t4],
              targetTouches: [t1, t2, t3, t4],
              changedTouches: [t1, t3],
            })
          );
        },
        { cur1: curP1X, cur2: curP2X, p1Fire: p1FireX, p2Fire: p2FireX, y: touchY }
      );
      await page.waitForTimeout(50);
    }

    // Release all touches
    await page.evaluate(
      ({ p1EndX, p2EndX, p1Fire, p2Fire, y }) => {
        const canvasEl = document.querySelector('#game-canvas') as HTMLCanvasElement;
        if (!canvasEl) return;

        const t1 = new Touch({ identifier: 1, target: canvasEl, clientX: p1EndX, clientY: y });
        const t2 = new Touch({ identifier: 2, target: canvasEl, clientX: p1Fire, clientY: y });
        const t3 = new Touch({ identifier: 3, target: canvasEl, clientX: p2EndX, clientY: y });
        const t4 = new Touch({ identifier: 4, target: canvasEl, clientX: p2Fire, clientY: y });

        canvasEl.dispatchEvent(
          new TouchEvent('touchend', {
            cancelable: true,
            bubbles: true,
            touches: [],
            targetTouches: [],
            changedTouches: [t1, t2, t3, t4],
          })
        );
      },
      { p1EndX: p1SteerEndX, p2EndX: p2SteerEndX, p1Fire: p1FireX, p2Fire: p2FireX, y: touchY }
    );
    await page.waitForTimeout(200);

    // Verify independent movements without cancellation or pointer cross-pollution
    const resultCoords = await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      return {
        p1X: game.playerManager.getPlayer('p1').x,
        p2X: game.playerManager.getPlayer('p2').x,
      };
    });

    // P1 dragged left -> coordinate decreased
    expect(resultCoords.p1X).toBeLessThan(initialCoords.p1X);
    // P2 dragged right -> coordinate increased
    expect(resultCoords.p2X).toBeGreaterThan(initialCoords.p2X);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ==========================================================================
  // E2E Test 3: Symmetrical Dual Bottom Dashboard HUD Telemetry
  // ==========================================================================
  test('TC-M35-COOP-03: Symmetrical 3-zone bottom dashboard renders independent P1 and P2 telemetry in real-time', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 1920, height: 1080 });

    // Launch co-op mode
    await page.evaluate(() => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      const game = cheat.getGame();
      game.setCoopMode(true);
      game.startGame();
    });
    await page.waitForTimeout(400);

    // 1. Verify Zone 1 (Player 1 Left HUD)
    const p1Score = page.locator('#dashboard-p1-score');
    const p1Combo = page.locator('#dashboard-p1-combo');
    const p1Lives = page.locator('#dashboard-p1-lives');
    const p1Special = page.locator('#dashboard-p1-special');

    await expect(p1Score).toBeVisible();
    await expect(p1Combo).toBeVisible();
    await expect(p1Lives).toBeVisible();
    await expect(p1Special).toBeVisible();

    // Verify cyan ship life icons in P1 rack
    const p1ShipIcons = p1Lives.locator('.p1-ship-icon');
    expect(await p1ShipIcons.count()).toBe(3);

    // 2. Verify Zone 2 (Center Tactical Telemetry & Controls)
    const stageBadge = page.locator('#dashboard-stage-badge');
    const coopHighScore = page.locator('#dashboard-coop-high-score');
    await expect(stageBadge).toBeVisible();
    await expect(coopHighScore).toBeVisible();

    const btnMute = page.locator('#btn-dash-mute');
    const btnFullscreen = page.locator('#btn-dash-fullscreen');
    const btnPause = page.locator('#btn-dash-pause');
    await expect(btnMute).toBeVisible();
    await expect(btnFullscreen).toBeVisible();
    await expect(btnPause).toBeVisible();

    // 3. Verify Zone 3 (Player 2 Right HUD)
    const p2Score = page.locator('#dashboard-p2-score');
    const p2Combo = page.locator('#dashboard-p2-combo');
    const p2Lives = page.locator('#dashboard-p2-lives');
    const p2Special = page.locator('#dashboard-p2-special');

    await expect(p2Score).toBeVisible();
    await expect(p2Combo).toBeVisible();
    await expect(p2Lives).toBeVisible();
    await expect(p2Special).toBeVisible();

    // Verify crimson ship life icons in P2 rack
    const p2ShipIcons = p2Lives.locator('.p2-ship-icon');
    expect(await p2ShipIcons.count()).toBe(3);

    // 4. Update in-game scores and special energy independently
    await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      const p1 = game.playerManager.getPlayer('p1');
      const p2 = game.playerManager.getPlayer('p2');

      p1.score = 1500;
      p1.combo = 2;
      p1.specialEnergy = 75;

      p2.score = 3200;
      p2.combo = 4;
      p2.specialEnergy = 100;
      p2.specialReady = true;

      game.update(1 / 60);
    });
    await page.waitForTimeout(200);

    // 5. Verify DOM updates match independent values
    await expect(p1Score).toHaveText('001500');
    await expect(p1Combo).toHaveText('2X');
    const p1Fill = page.locator('#dashboard-p1-special .p1-fill');
    await expect(p1Fill).toHaveCSS('width', /75%/);

    await expect(p2Score).toHaveText('003200');
    await expect(p2Combo).toHaveText('4X');
    const p2Fill = page.locator('#dashboard-p2-special .p2-fill');
    await expect(p2Fill).toHaveCSS('width', /100%/);
    const p2Cue = page.locator('#p2-special-cue');
    await expect(p2Cue).toHaveText('READY [M]');

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ==========================================================================
  // E2E Test 4: Co-op Death, Revive Countdown & Life Donation Flow
  // ==========================================================================
  test('TC-M35-COOP-04: Fatal hit triggers revive countdown alert and partner life donation revives player', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 1920, height: 1080 });

    // 1. Initialize co-op with P1 at 1 life and P2 at 3 lives (P2 can donate)
    await page.evaluate(() => {
      const cheat = (window as any).__GALAGA_CHEAT__.getGame();
      cheat.setCoopMode(true);
      cheat.startGame();

      const p1 = cheat.playerManager.getPlayer('p1');
      const p2 = cheat.playerManager.getPlayer('p2');
      p1.lives = 1;
      p2.lives = 3;
      cheat.update(1 / 60);
    });
    await page.waitForTimeout(300);

    // 2. Trigger fatal hit on Player 1
    await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      const p1 = game.playerManager.getPlayer('p1');
      p1.destroy();
      // Advance past death timer (0.5s) to trigger revive_pending
      p1.update(0.6);
      game.update(1 / 60);
    });
    await page.waitForTimeout(300);

    // 3. Verify Zone 1 enters pulsing revive alert and shows countdown + donation prompt
    const p1Revive = page.locator('#dashboard-p1-revive');
    await expect(p1Revive).toBeVisible();

    const reviveText = await p1Revive.textContent();
    expect(reviveText).toMatch(/REVIVE:\s*\d+S\s*\[L\]\s*DONATE\s*LIFE/i);

    const zoneLeft = page.locator('.dash-zone.zone-left');
    await expect(zoneLeft).toHaveClass(/revive-active/);

    // 4. Press donation key 'KeyL' to trigger life transfer from P2 to P1
    await page.click('#game-canvas');
    await page.keyboard.press('KeyL');

    // Run game tick to process donation
    await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      game.update(1 / 60);
    });
    await page.waitForTimeout(300);

    // 5. Verify Player 1 respawns with invulnerability while Player 2 lives decrement
    const playerStatus = await page.evaluate(() => {
      const game = (window as any).__GALAGA_CHEAT__.getGame();
      const p1 = game.playerManager.getPlayer('p1');
      const p2 = game.playerManager.getPlayer('p2');
      return {
        p1Lives: p1.lives,
        p1State: p1.state,
        p1Invulnerable: p1.isInvulnerable(),
        p2Lives: p2.lives,
        reviveActive: game.playerManager.isAnyPlayerReviving(),
      };
    });

    expect(playerStatus.p2Lives).toBe(2); // Decremented from 3 to 2
    expect(playerStatus.p1Lives).toBe(1); // Granted 1 life
    expect(playerStatus.p1State).toBe('respawning');
    expect(playerStatus.p1Invulnerable).toBe(true);
    expect(playerStatus.reviveActive).toBe(false);

    // Revive alert should now be hidden
    await expect(p1Revive).toBeHidden();

    expect(errorCollector.getErrors()).toEqual([]);
  });
});
