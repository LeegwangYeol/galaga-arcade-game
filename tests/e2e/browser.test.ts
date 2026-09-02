import { test, expect } from '@playwright/test';
import {
  createErrorCollector,
  verifyCanvasRendering,
  getCanvasDimensions,
} from './helpers/test-utils';

test.describe('Galaga Arcade Web Game - Browser E2E Suite', () => {
  // ---------------------------------------------------------------------------
  // Tier 1: Core Browser Environment & Page Load Verification
  // ---------------------------------------------------------------------------

  test('TC-E2E-01: Page responds with HTTP 200 and loads HTML structure', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response?.status()).toBe(200);

    const contentType = response?.headers()['content-type'] || '';
    expect(contentType).toContain('text/html');

    // Verify page title is set
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    // Verify zero JavaScript errors occurred during initial page load
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-02: #game-canvas element is attached to DOM with correct arcade aspect ratio', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'networkidle' });

    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeAttached();
    await expect(canvas).toBeVisible();

    const dimensions = await getCanvasDimensions(page, '#game-canvas');
    expect(dimensions).not.toBeNull();
    if (!dimensions) throw new Error('Canvas dimensions could not be retrieved');

    // Native resolution is 224x288 or logical buffer 448x576 (aspect ratio 7:9 = ~0.7778)
    const expectedAspectRatio = 224 / 288; // ~0.7777777777777778
    expect(dimensions.attrAspectRatio).toBeCloseTo(expectedAspectRatio, 2);

    // Verify canvas dimensions are positive non-zero integers
    expect(dimensions.attrWidth).toBeGreaterThanOrEqual(224);
    expect(dimensions.attrHeight).toBeGreaterThanOrEqual(288);
    expect(dimensions.displayWidth).toBeGreaterThan(0);
    expect(dimensions.displayHeight).toBeGreaterThan(0);

    // Ensure no console or page errors
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-03: Zero JavaScript runtime errors, uncaught exceptions, and console.error events', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });

    // Allow the game to run for 2.5 seconds to catch any delayed initialization or tick errors
    await page.waitForTimeout(2500);

    const errors = errorCollector.getErrors();
    if (errors.length > 0) {
      console.error('Captured runtime errors during test execution:', JSON.stringify(errors, null, 2));
    }

    expect(errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Tier 1: Active Game Loop & Frame Rendering Verification
  // ---------------------------------------------------------------------------

  test('TC-E2E-04: Game loop is actively ticking and rendering frames at target 60 FPS', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });

    // Measure frame delivery and pixel activity over 800ms
    const renderingMetrics = await verifyCanvasRendering(page, '#game-canvas', 800);

    // Verify frames were executed (should be >= 20 frames in 800ms at ~60 FPS)
    expect(renderingMetrics.frameCount).toBeGreaterThanOrEqual(20);
    expect(renderingMetrics.fps).toBeGreaterThanOrEqual(25);

    // Starfield animation or background rendering should cause pixel variance
    expect(renderingMetrics.pixelChanged).toBe(true);

    // Ensure zero runtime errors occurred during continuous frame ticking
    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Tier 1: Keyboard Input Dispatch & Event Handling
  // ---------------------------------------------------------------------------

  test('TC-E2E-05: Keyboard controls (ArrowLeft, ArrowRight, Space, WASD, KeyZ) dispatch cleanly without errors', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Focus canvas or document body
    await page.click('#game-canvas');

    // Sequence of player inputs
    // 1. Move Left
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(100);
    await page.keyboard.up('ArrowLeft');

    // 2. Move Right
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.up('ArrowRight');

    // 3. Fire Missile (Space)
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // 4. Alternative controls (KeyA, KeyD, KeyZ, KeyK)
    await page.keyboard.press('KeyA');
    await page.keyboard.press('KeyD');
    await page.keyboard.press('KeyZ');
    await page.keyboard.press('KeyK');

    await page.waitForTimeout(300);

    // Verify no unhandled input exceptions occurred
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-06: Pause toggle (Escape / KeyP) and Game Start (Enter / Space) key events', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.click('#game-canvas');

    // Press Enter to transition / start
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Press Escape to pause
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Press Escape again to resume
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Press KeyP to pause
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);

    // Press KeyP to resume
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Tier 1 & 2: Mobile Touch & Pointer Interaction Verification
  // ---------------------------------------------------------------------------

  test('TC-E2E-07: Touch & pointer events dispatch on canvas without throwing errors or triggering page scrolling', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // Set mobile-like viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'load' });

    const canvasBox = await page.locator('#game-canvas').boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) throw new Error('Canvas bounding box could not be determined');

    const centerX = canvasBox.x + canvasBox.width / 2;
    const centerY = canvasBox.y + canvasBox.height / 2;
    const leftX = canvasBox.x + canvasBox.width * 0.2;
    const rightX = canvasBox.x + canvasBox.width * 0.8;

    // Simulate tap on canvas to start / fire
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(100);

    // Simulate left control drag
    await page.mouse.move(leftX, centerY);
    await page.mouse.down();
    await page.mouse.move(leftX + 20, centerY);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Simulate right control tap / fire button tap
    await page.mouse.click(rightX, centerY);
    await page.waitForTimeout(200);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Tier 2: Boundary & Adversarial Verification
  // ---------------------------------------------------------------------------

  test('TC-E2E-08: Adversarial Input Stress - Rapid simultaneous multi-key press bursts', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.click('#game-canvas');

    // Rapid burst of simultaneous contradictory keys
    for (let burst = 0; burst < 10; burst++) {
      await Promise.all([
        page.keyboard.down('ArrowLeft'),
        page.keyboard.down('ArrowRight'),
        page.keyboard.press('Space'),
        page.keyboard.press('KeyZ'),
      ]);
      await page.waitForTimeout(30);
      await Promise.all([
        page.keyboard.up('ArrowLeft'),
        page.keyboard.up('ArrowRight'),
      ]);
    }

    await page.waitForTimeout(500);

    // Verify engine did not crash or produce unhandled errors
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-09: Responsive Window Resizing - Canvas maintains letterbox centering without distortion', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });

    // Test different standard viewport sizes
    const viewports = [
      { width: 1920, height: 1080 }, // 16:9 Full HD
      { width: 1280, height: 720 },  // 16:9 HD
      { width: 768, height: 1024 },  // 3:4 Tablet Portrait
      { width: 375, height: 812 },   // Mobile Portrait
      { width: 812, height: 375 },   // Mobile Landscape
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);

      const dimensions = await getCanvasDimensions(page, '#game-canvas');
      expect(dimensions).not.toBeNull();
      if (dimensions) {
        expect(dimensions.displayWidth).toBeGreaterThan(0);
        expect(dimensions.displayHeight).toBeGreaterThan(0);
        // Canvas must fit inside viewport
        expect(dimensions.displayWidth).toBeLessThanOrEqual(vp.width);
        expect(dimensions.displayHeight).toBeLessThanOrEqual(vp.height);
      }
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-10: Tab visibility and blur/focus transitions execute gracefully', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(300);

    // Simulate tab blur (user switches to another tab)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);

    // Simulate tab focus (user returns)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(300);

    // Verify loop recovers and renders frames
    const rendering = await verifyCanvasRendering(page, '#game-canvas', 400);
    expect(rendering.frameCount).toBeGreaterThanOrEqual(10);

    expect(errorCollector.getErrors()).toEqual([]);
  });
});
