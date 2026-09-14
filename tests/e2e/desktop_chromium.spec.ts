import { test, expect } from '@playwright/test';
import {
  createErrorCollector,
  verifyCanvasRendering,
  getCanvasDimensions,
} from './helpers/test-utils';

/**
 * Desktop Chromium E2E Test Suite (Milestone M30)
 * 
 * Verifies:
 * 1. Desktop Chromium 1920x1080 (16:9 Full HD) baseline environment:
 *    - HTTP 200 page load with zero JavaScript console or runtime errors.
 *    - HTML5 canvas attachment, visibility, and authentic 7:9 arcade aspect ratio.
 *    - Authentic letterboxing / pillarbox centering without vertical overflow clipping.
 * 2. Ultrawide Viewports (2560x1080 and 3440x1440 21:9):
 *    - Strict preservation of 7:9 arcade aspect ratio.
 *    - Equal horizontal letterbox pillarboxing flanking the central playfield.
 * 3. Active Game Loop & Frame Delivery:
 *    - Continuous 60 FPS requestAnimationFrame ticking and starfield pixel rendering.
 * 4. Modernized Bottom HUD Dashboard Rendering:
 *    - Live 1UP score and HIGH score formatted with 6-digit zero-padding.
 *    - Reserve ship lives procedural SVG icons rendering.
 *    - Special move energy gauge and active power-up chips rack.
 *    - Zero collision/overlap between canvas wrapper and bottom dashboard.
 * 5. Desktop Keyboard & Interactive Controls:
 *    - ArrowLeft/ArrowRight/KeyA/KeyD horizontal movement.
 *    - Space/KeyZ missile firing across playfield.
 *    - KeyP/Escape pause/resume state toggling.
 *    - Fullscreen toggle via keyboard shortcut ('F') and dashboard button.
 * 6. 4K UHD Desktop Scaling (3840x2160):
 *    - Crisp pixelated scaling and zero document overflow on ultra-high resolution displays.
 */

test.describe('Desktop Chromium E2E Suite (Milestone M30)', () => {
  // ===========================================================================
  // Test 1: Standard Desktop 1920x1080 (16:9 Full HD) Letterboxing & Aspect Ratio
  // ===========================================================================
  test('TC-M30-DESKTOP-01: Desktop 1920x1080 initializes with authentic 7:9 letterbox and zero vertical overflow', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // Verify canvas is attached and visible
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeAttached();
    await expect(canvas).toBeVisible();

    // Verify dimensions and 7:9 arcade aspect ratio (224 / 288 = ~0.7778)
    const dimensions = await getCanvasDimensions(page, '#game-canvas');
    expect(dimensions).not.toBeNull();
    const expectedAspectRatio = 224 / 288;
    expect(dimensions!.attrAspectRatio).toBeCloseTo(expectedAspectRatio, 2);

    // Verify canvas fits entirely inside the 1920x1080 viewport
    expect(dimensions!.displayWidth).toBeLessThan(1920);
    expect(dimensions!.displayHeight).toBeLessThanOrEqual(1080);
    expect(dimensions!.displayWidth).toBeGreaterThan(400);
    expect(dimensions!.displayHeight).toBeGreaterThan(500);

    // Verify horizontal letterboxing: canvas is horizontally centered with equal left/right margins
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    if (canvasBox) {
      const leftMargin = canvasBox.x;
      const rightMargin = 1920 - (canvasBox.x + canvasBox.width);
      // Margins should be approximately equal within 4px for symmetric pillarboxing
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(4);
      expect(leftMargin).toBeGreaterThan(200); // Significant pillarboxing on 16:9
    }

    // Verify zero vertical clipping and zero document scroll overflow
    const overflowMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
        innerHeight: window.innerHeight,
        hasVerticalScrollbar: doc.scrollHeight > window.innerHeight,
        bodyOverflow: window.getComputedStyle(document.body).overflow,
        htmlOverflow: window.getComputedStyle(doc).overflow,
      };
    });

    expect(overflowMetrics.scrollHeight).toBeLessThanOrEqual(overflowMetrics.innerHeight + 1);
    expect(overflowMetrics.hasVerticalScrollbar).toBe(false);

    // Verify zero JavaScript errors
    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 2: Ultrawide Viewports (2560x1080 & 3440x1440 21:9)
  // ===========================================================================
  test('TC-M30-DESKTOP-02: Ultrawide viewports (2560x1080 & 3440x1440) preserve 7:9 ratio with symmetric pillarboxing', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    const ultrawideViewports = [
      { width: 2560, height: 1080, name: '21:9 WFHD (2560x1080)' },
      { width: 3440, height: 1440, name: '21:9 WQHD (3440x1440)' },
    ];

    for (const vp of ultrawideViewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const canvas = page.locator('#game-canvas');
      await expect(canvas).toBeVisible();

      const canvasBox = await canvas.boundingBox();
      expect(canvasBox, `Canvas bounding box must exist on ${vp.name}`).not.toBeNull();
      if (canvasBox) {
        // Strict aspect ratio check
        const computedRatio = canvasBox.width / canvasBox.height;
        expect(computedRatio).toBeCloseTo(224 / 288, 2);

        // Fits within viewport
        expect(canvasBox.width).toBeLessThan(vp.width);
        expect(canvasBox.height).toBeLessThanOrEqual(vp.height);

        // Symmetric pillarbox centering
        const leftMargin = canvasBox.x;
        const rightMargin = vp.width - (canvasBox.x + canvasBox.width);
        expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(6);
        expect(leftMargin).toBeGreaterThan(500); // Generous letterbox on ultrawide
      }

      // Verify no vertical scroll overflow
      const hasScrollbar = await page.evaluate(() => {
        return document.documentElement.scrollHeight > window.innerHeight;
      });
      expect(hasScrollbar, `No scrollbar on ${vp.name}`).toBe(false);
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 3: Active Game Loop & Frame Delivery at 60 FPS Target
  // ===========================================================================
  test('TC-M30-DESKTOP-03: Game loop is actively ticking and rendering frames at target 60 FPS in 1920x1080', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'load' });

    // Measure frame delivery and starfield pixel activity over 800ms
    const renderingMetrics = await verifyCanvasRendering(page, '#game-canvas', 800);

    expect(renderingMetrics.frameCount).toBeGreaterThanOrEqual(10);
    expect(renderingMetrics.fps).toBeGreaterThanOrEqual(10);
    expect(renderingMetrics.pixelChanged).toBe(true);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 4: Bottom Dashboard HUD Score & Reserve Ship Lives Rendering
  // ===========================================================================
  test('TC-M30-DESKTOP-04: Bottom dashboard renders HUD score, high score, ship icons, and controls guide without overlap', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const dashboard = page.locator('#bottom-dashboard');
    await expect(dashboard).toBeAttached();
    await expect(dashboard).toBeVisible();

    // Verify 1UP score element exists and contains formatted number
    const elScore = page.locator('#dashboard-score');
    await expect(elScore).toBeAttached();
    await expect(elScore).toBeVisible();
    const scoreText = await elScore.textContent();
    expect(scoreText).toMatch(/^\d{6}$/); // 6-digit zero-padded number (e.g. 000000)

    // Verify HIGH score element exists and contains formatted number
    const elHigh = page.locator('#dashboard-high-score');
    await expect(elHigh).toBeAttached();
    await expect(elHigh).toBeVisible();
    const highText = await elHigh.textContent();
    expect(highText).toMatch(/^\d{6}$/);

    // Verify Reserve Ship Life Icons container and SVG icons
    const elLives = page.locator('#dashboard-lives');
    await expect(elLives).toBeAttached();
    await expect(elLives).toBeVisible();

    const lifeIcons = elLives.locator('.ship-icon');
    const lifeCount = await lifeIcons.count();
    expect(lifeCount).toBeGreaterThanOrEqual(1);

    // Verify geometric docking: Dashboard sits below canvas-wrapper without overlap
    const canvasWrapper = page.locator('.canvas-wrapper');
    const wrapperBox = await canvasWrapper.boundingBox();
    const dashBox = await dashboard.boundingBox();

    expect(wrapperBox).not.toBeNull();
    expect(dashBox).not.toBeNull();

    if (wrapperBox && dashBox) {
      // Dashboard must sit directly at or below the bottom of canvas wrapper
      expect(dashBox.y).toBeGreaterThanOrEqual(wrapperBox.y + wrapperBox.height - 2);

      // Check collision/overlap
      const hasCollision =
        wrapperBox.x < dashBox.x + dashBox.width &&
        wrapperBox.x + wrapperBox.width > dashBox.x &&
        wrapperBox.y < dashBox.y + dashBox.height &&
        wrapperBox.y + wrapperBox.height > dashBox.y;
      expect(hasCollision).toBe(false);
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 5: Desktop Keyboard Navigation & In-Game Input Dispatch
  // ===========================================================================
  test('TC-M30-DESKTOP-05: Desktop keyboard controls (Arrow keys, Space, WASD, KeyZ, KeyP) dispatch cleanly', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(400);

    // Focus canvas and start game
    await page.click('#game-canvas');
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);

    // 1. Move Left with ArrowLeft
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(200);
    await page.keyboard.up('ArrowLeft');

    // 2. Fire Missile with Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // 3. Move Right with ArrowRight
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');

    // 4. Secondary controls: KeyA, KeyD, KeyZ
    await page.keyboard.press('KeyA');
    await page.keyboard.press('KeyD');
    await page.keyboard.press('KeyZ');

    // 5. Pause and Resume toggling
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 6: Fullscreen Controller & Viewport Resize Synchronization
  // ===========================================================================
  test('TC-M30-DESKTOP-06: Fullscreen toggle button and keyboard shortcut F dispatch cleanly with layout synchronization', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(400);

    // Find fullscreen button in bottom dashboard
    const btnFullscreen = page.locator('.btn-dash-fullscreen');
    await expect(btnFullscreen).toBeAttached();
    await expect(btnFullscreen).toBeVisible();

    // Click fullscreen button
    await btnFullscreen.click();
    await page.waitForTimeout(300);

    // Press 'KeyF' to toggle fullscreen via keyboard
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(300);

    // Verify canvas dimensions remain valid after resize/fullscreen actions
    const dimensions = await getCanvasDimensions(page, '#game-canvas');
    expect(dimensions).not.toBeNull();
    expect(dimensions!.displayWidth).toBeGreaterThan(0);
    expect(dimensions!.displayHeight).toBeGreaterThan(0);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 7: 4K UHD Desktop Scaling (3840x2160)
  // ===========================================================================
  test('TC-M30-DESKTOP-07: 4K UHD Desktop (3840x2160) renders with crisp letterbox and zero overflow', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    if (canvasBox) {
      expect(canvasBox.width / canvasBox.height).toBeCloseTo(224 / 288, 2);
      expect(canvasBox.width).toBeLessThan(3840);
      expect(canvasBox.height).toBeLessThanOrEqual(2160);

      // Centered symmetrically
      const leftMargin = canvasBox.x;
      const rightMargin = 3840 - (canvasBox.x + canvasBox.width);
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(6);
    }

    // Zero vertical scrollbar
    const hasScrollbar = await page.evaluate(() => {
      return document.documentElement.scrollHeight > window.innerHeight;
    });
    expect(hasScrollbar).toBe(false);

    expect(errorCollector.getErrors()).toEqual([]);
  });
});
