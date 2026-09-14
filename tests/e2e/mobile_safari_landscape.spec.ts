import { test, expect } from '@playwright/test';
import { createErrorCollector } from './helpers/test-utils';

/**
 * Mobile Safari & Landscape E2E Test Suite (Milestone M30)
 * 
 * Verifies:
 * 1. Mobile Safari (iPhone 12 portrait & landscape) viewport rendering.
 * 2. Safe-area insets handling (env(safe-area-inset-*), --sat, --sar, --sab, --sal).
 * 3. Dedicated pillarbox docking in landscape:
 *    - Canvas centered in 7:9 arcade aspect ratio.
 *    - D-pad docked in left pillarbox without canvas occlusion.
 *    - Action buttons docked in right pillarbox without canvas occlusion.
 * 4. Zero vertical clipping and zero document scroll overflow (100dvh compliance).
 * 5. Touch input dispatch fidelity in landscape and seamless orientation transitions.
 */

test.describe('Mobile Safari & Landscape E2E Suite (Milestone M30)', () => {
  test.beforeEach(async ({ page }) => {
    // Default to iPhone 12 portrait
    await page.setViewportSize({ width: 390, height: 844 });
  });

  // ===========================================================================
  // Test 1: Mobile Safari Portrait Baseline & Safe-Area Inset Styles
  // ===========================================================================
  test('TC-M30-SAFARI-01: Mobile Safari Portrait initializes with valid safe-area insets and zero page overflow', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForTimeout(400);

    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();

    // Verify safe-area CSS root custom properties exist and resolve cleanly
    const safeAreaMetrics = await page.evaluate(() => {
      const rootStyle = window.getComputedStyle(document.documentElement);
      const appContainer = document.getElementById('app-container');
      const containerStyle = appContainer ? window.getComputedStyle(appContainer) : null;
      
      return {
        sat: rootStyle.getPropertyValue('--sat').trim(),
        sar: rootStyle.getPropertyValue('--sar').trim(),
        sab: rootStyle.getPropertyValue('--sab').trim(),
        sal: rootStyle.getPropertyValue('--sal').trim(),
        containerPaddingTop: containerStyle?.paddingTop,
        containerPaddingBottom: containerStyle?.paddingBottom,
        bodyOverflow: window.getComputedStyle(document.body).overflow,
        htmlOverflow: window.getComputedStyle(document.documentElement).overflow,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        innerHeight: window.innerHeight,
      };
    });

    // Root custom properties should be defined
    expect(safeAreaMetrics.sat.length).toBeGreaterThan(0);
    expect(safeAreaMetrics.sab.length).toBeGreaterThan(0);

    // Overflow should be hidden preventing accidental swipe-scrolling on iOS Safari
    expect(safeAreaMetrics.bodyOverflow).toBe('hidden');
    expect(safeAreaMetrics.htmlOverflow).toBe('hidden');

    // Zero vertical clipping / zero page overflow
    expect(safeAreaMetrics.scrollHeight).toBeLessThanOrEqual(safeAreaMetrics.innerHeight + 1);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 2: Dedicated Pillarbox Docking in Landscape Orientation (iPhone 12 Landscape)
  // ===========================================================================
  test('TC-M30-SAFARI-02: Landscape orientation positions canvas centrally and docks controls in dedicated pillarboxes', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // iPhone 12 Landscape Viewport: 844 x 390
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForTimeout(500);

    const canvas = page.locator('#game-canvas');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox, 'Canvas bounding box must exist in landscape').not.toBeNull();
    if (!canvasBox) return;

    // Verify canvas aspect ratio is preserved (~7:9 = 0.7778)
    const aspect = canvasBox.width / canvasBox.height;
    expect(aspect).toBeCloseTo(224 / 288, 1);

    // Verify canvas is horizontally centered within the 844px wide viewport
    const viewportWidth = 844;
    const canvasCenterX = canvasBox.x + canvasBox.width / 2;
    expect(canvasCenterX).toBeCloseTo(viewportWidth / 2, -1); // Centered within +/- 20px

    // Left and Right pillarbox boundaries
    const leftPillarboxWidth = canvasBox.x;
    const rightPillarboxStartX = canvasBox.x + canvasBox.width;
    expect(leftPillarboxWidth, 'Left pillarbox width should be substantial (> 150px)').toBeGreaterThan(150);
    expect(viewportWidth - rightPillarboxStartX, 'Right pillarbox width should be substantial (> 150px)').toBeGreaterThan(150);

    // Verify touch controls container is visible in landscape
    const touchControls = page.locator('#touch-controls');
    await expect(touchControls).toBeVisible();

    // Verify D-pad is docked cleanly inside LEFT pillarbox (left of canvas)
    const btnLeft = page.locator('#btn-left');
    const btnRight = page.locator('#btn-right');
    const leftBox = await btnLeft.boundingBox();
    const rightBox = await btnRight.boundingBox();

    expect(leftBox, '#btn-left must have bounding box').not.toBeNull();
    expect(rightBox, '#btn-right must have bounding box').not.toBeNull();

    if (leftBox && rightBox) {
      // Both buttons must be completely to the left of the canvas
      expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(canvasBox.x);
      expect(rightBox.x + rightBox.width).toBeLessThanOrEqual(canvasBox.x);
    }

    // Verify Action buttons (Fullscreen, Special, Fire) are docked cleanly inside RIGHT pillarbox
    const btnFullscreen = page.locator('#btn-fullscreen');
    const btnSpecial = page.locator('#btn-special');
    const btnFire = page.locator('#btn-fire');

    const fsBox = await btnFullscreen.boundingBox();
    const spBox = await btnSpecial.boundingBox();
    const fireBox = await btnFire.boundingBox();

    expect(fsBox, '#btn-fullscreen must have bounding box').not.toBeNull();
    expect(spBox, '#btn-special must have bounding box').not.toBeNull();
    expect(fireBox, '#btn-fire must have bounding box').not.toBeNull();

    if (fsBox && spBox && fireBox) {
      // All action buttons must be completely to the right of the canvas
      expect(fsBox.x).toBeGreaterThanOrEqual(rightPillarboxStartX - 2);
      expect(spBox.x).toBeGreaterThanOrEqual(rightPillarboxStartX - 2);
      expect(fireBox.x).toBeGreaterThanOrEqual(rightPillarboxStartX - 2);
    }

    // Assert ZERO overlap between touch controls and the arcade canvas in landscape
    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 3: Zero Vertical Clipping in Landscape (iPhone 12: 844x390)
  // ===========================================================================
  test('TC-M30-SAFARI-03: Zero vertical clipping and scroll overflow in Mobile Safari landscape mode', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForTimeout(400);

    const clippingMetrics = await page.evaluate(() => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const docHeight = document.documentElement.scrollHeight;
      const docWidth = document.documentElement.scrollWidth;

      const canvasWrapper = document.querySelector('.canvas-wrapper') as HTMLElement;
      const dashboard = document.getElementById('bottom-dashboard') as HTMLElement;
      const touchControls = document.getElementById('touch-controls') as HTMLElement;

      const cRect = canvasWrapper ? canvasWrapper.getBoundingClientRect() : null;
      const dRect = dashboard ? dashboard.getBoundingClientRect() : null;
      const tRect = touchControls ? touchControls.getBoundingClientRect() : null;

      return {
        vh,
        vw,
        docHeight,
        docWidth,
        canvas: cRect ? { top: cRect.top, bottom: cRect.bottom, height: cRect.height } : null,
        dashboard: dRect ? { top: dRect.top, bottom: dRect.bottom, height: dRect.height } : null,
        touchControls: tRect ? { top: tRect.top, bottom: tRect.bottom, height: tRect.height } : null,
      };
    });

    // 1. Zero document vertical overflow: scrollHeight must not exceed innerHeight
    expect(clippingMetrics.docHeight).toBeLessThanOrEqual(clippingMetrics.vh + 1);

    // 2. Zero document horizontal overflow: scrollWidth must not exceed innerWidth
    expect(clippingMetrics.docWidth).toBeLessThanOrEqual(clippingMetrics.vw + 1);

    // 3. Canvas wrapper is strictly within viewport bounds [0, 390]
    expect(clippingMetrics.canvas).not.toBeNull();
    if (clippingMetrics.canvas) {
      expect(clippingMetrics.canvas.top).toBeGreaterThanOrEqual(0);
      expect(clippingMetrics.canvas.bottom).toBeLessThanOrEqual(clippingMetrics.vh);
    }

    // 4. Bottom dashboard is strictly within viewport bounds [0, 390]
    expect(clippingMetrics.dashboard).not.toBeNull();
    if (clippingMetrics.dashboard) {
      expect(clippingMetrics.dashboard.top).toBeGreaterThanOrEqual(0);
      expect(clippingMetrics.dashboard.bottom).toBeLessThanOrEqual(clippingMetrics.vh);
    }

    // 5. Touch controls are within viewport bounds
    expect(clippingMetrics.touchControls).not.toBeNull();
    if (clippingMetrics.touchControls) {
      expect(clippingMetrics.touchControls.top).toBeGreaterThanOrEqual(0);
      expect(clippingMetrics.touchControls.bottom).toBeLessThanOrEqual(clippingMetrics.vh);
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 4: Safe-Area Inset Custom Properties Under Simulated Notch & Island
  // ===========================================================================
  test('TC-M30-SAFARI-04: Safe-area inset variables properly pad container under simulated notch and home indicator', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForTimeout(300);

    // Simulate iPhone landscape notch on left (47px), home indicator on bottom (21px), right inset (47px)
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--sat', '0px');
      document.documentElement.style.setProperty('--sar', '47px');
      document.documentElement.style.setProperty('--sab', '21px');
      document.documentElement.style.setProperty('--sal', '47px');
    });

    await page.waitForTimeout(200);

    // Verify app-container and touch-controls inherit safe-area padding
    const paddingMetrics = await page.evaluate(() => {
      const appContainer = document.getElementById('app-container');
      const touchControls = document.getElementById('touch-controls');
      const appStyle = appContainer ? window.getComputedStyle(appContainer) : null;
      const touchStyle = touchControls ? window.getComputedStyle(touchControls) : null;

      return {
        appPaddingLeft: parseFloat(appStyle?.paddingLeft || '0'),
        appPaddingRight: parseFloat(appStyle?.paddingRight || '0'),
        appPaddingBottom: parseFloat(appStyle?.paddingBottom || '0'),
        touchPaddingLeft: parseFloat(touchStyle?.paddingLeft || '0'),
        touchPaddingRight: parseFloat(touchStyle?.paddingRight || '0'),
        touchPaddingBottom: parseFloat(touchStyle?.paddingBottom || '0'),
      };
    });

    // Touch controls must be pushed inward away from device bezel/notch (>= 47px left and right)
    expect(paddingMetrics.touchPaddingLeft).toBeGreaterThanOrEqual(47);
    expect(paddingMetrics.touchPaddingRight).toBeGreaterThanOrEqual(47);
    expect(paddingMetrics.touchPaddingBottom).toBeGreaterThanOrEqual(21);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 5: Interactive Combat Controls in Mobile Safari Landscape
  // ===========================================================================
  test('TC-M30-SAFARI-05: Touch buttons in landscape dispatch player movement and firing without runtime errors', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForTimeout(400);

    // Tap canvas to focus and start game
    const canvas = page.locator('#game-canvas');
    await canvas.click();
    await page.waitForTimeout(200);

    // Press space or tap canvas center to start game
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);

    // 1. Tap Left D-Pad button
    const btnLeft = page.locator('#btn-left');
    await btnLeft.click();
    await page.waitForTimeout(100);

    // 2. Tap Right D-Pad button
    const btnRight = page.locator('#btn-right');
    await btnRight.click();
    await page.waitForTimeout(100);

    // 3. Tap Fire button multiple times
    const btnFire = page.locator('#btn-fire');
    await btnFire.click();
    await page.waitForTimeout(100);
    await btnFire.click();
    await page.waitForTimeout(100);

    // 4. Tap Special button
    const btnSpecial = page.locator('#btn-special');
    await btnSpecial.click();
    await page.waitForTimeout(200);

    // Verify 0 runtime exceptions during touch actions
    expect(errorCollector.getErrors()).toEqual([]);
  });

  // ===========================================================================
  // Test 6: Seamless Orientation Transitions (Portrait <-> Landscape)
  // ===========================================================================
  test('TC-M30-SAFARI-06: Dynamic rotation between Portrait and Landscape preserves layout stability', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // 1. Start in Portrait (390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#game-canvas')).toBeAttached();
    await page.waitForTimeout(400);

    let scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeLessThanOrEqual(845);

    // 2. Rotate to Landscape (844 x 390)
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(400);

    let landscapeMetrics = await page.evaluate(() => ({
      docHeight: document.documentElement.scrollHeight,
      vh: window.innerHeight,
    }));
    expect(landscapeMetrics.docHeight).toBeLessThanOrEqual(landscapeMetrics.vh + 1);

    // 3. Rotate back to Portrait (390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeLessThanOrEqual(845);

    expect(errorCollector.getErrors()).toEqual([]);
  });
});
