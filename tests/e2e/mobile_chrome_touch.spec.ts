import { test, expect } from '@playwright/test';
import { createErrorCollector } from './helpers/test-utils';

test.describe('Mobile Chrome Viewport & Virtual Touch Controls E2E (Milestone M30)', () => {
  test.beforeEach(async ({ page }) => {
    // Emulate Pixel 5 mobile viewport
    await page.setViewportSize({ width: 393, height: 851 });
  });

  test('TC-M30-TOUCH-01: Virtual touch controls display cleanly on Mobile Chrome (Pixel 5)', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Verify touch controls container exists and is visible in mobile viewport
    const touchControls = page.locator('#touch-controls');
    await expect(touchControls).toBeAttached();
    await expect(touchControls).toBeVisible();

    // Verify all 5 touch buttons are attached and visible
    const buttons = [
      { id: '#btn-left', label: 'Move Left' },
      { id: '#btn-right', label: 'Move Right' },
      { id: '#btn-fullscreen', label: 'Toggle Fullscreen' },
      { id: '#btn-special', label: 'Special Move' },
      { id: '#btn-fire', label: 'Fire Missile' },
    ];

    for (const btn of buttons) {
      const locator = page.locator(btn.id);
      await expect(locator).toBeAttached();
      await expect(locator).toBeVisible();
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-M30-TOUCH-02: All touch targets satisfy accessibility minimum size (>= 48px)', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const buttonSelectors = [
      '#btn-left',
      '#btn-right',
      '#btn-fullscreen',
      '#btn-special',
      '#btn-fire',
    ];

    for (const selector of buttonSelectors) {
      const locator = page.locator(selector);
      const box = await locator.boundingBox();
      expect(box, `Bounding box for ${selector} must exist`).not.toBeNull();
      if (box) {
        expect(
          box.width,
          `Touch target width for ${selector} (${box.width}px) must be >= 48px`
        ).toBeGreaterThanOrEqual(48);
        expect(
          box.height,
          `Touch target height for ${selector} (${box.height}px) must be >= 48px`
        ).toBeGreaterThanOrEqual(48);
      }
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-M30-TOUCH-03: Zero collision/overlap between virtual touch controls and #bottom-dashboard in Mobile Portrait', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const dashboard = page.locator('#bottom-dashboard');
    await expect(dashboard).toBeAttached();
    await expect(dashboard).toBeVisible();

    const dashBox = await dashboard.boundingBox();
    expect(dashBox, '#bottom-dashboard bounding box must be retrievable').not.toBeNull();
    if (!dashBox) return;

    // Check collision with the touch-controls container
    const touchControls = page.locator('#touch-controls');
    const touchBox = await touchControls.boundingBox();
    expect(touchBox, '#touch-controls bounding box must be retrievable').not.toBeNull();

    if (touchBox) {
      const hasContainerCollision =
        touchBox.x < dashBox.x + dashBox.width &&
        touchBox.x + touchBox.width > dashBox.x &&
        touchBox.y < dashBox.y + dashBox.height &&
        touchBox.y + touchBox.height > dashBox.y;

      expect(
        hasContainerCollision,
        `#touch-controls (top: ${touchBox.y}, bottom: ${touchBox.y + touchBox.height}) must not collide with #bottom-dashboard (top: ${dashBox.y}, bottom: ${dashBox.y + dashBox.height})`
      ).toBe(false);

      // In portrait, touch-controls should sit cleanly below the bottom-dashboard
      expect(touchBox.y).toBeGreaterThanOrEqual(dashBox.y + dashBox.height - 1);
    }

    // Check collision for every individual touch button
    const buttonSelectors = [
      '#btn-left',
      '#btn-right',
      '#btn-fullscreen',
      '#btn-special',
      '#btn-fire',
    ];

    for (const selector of buttonSelectors) {
      const btnBox = await page.locator(selector).boundingBox();
      expect(btnBox, `Button ${selector} bounding box must be retrievable`).not.toBeNull();
      if (btnBox) {
        const hasButtonCollision =
          btnBox.x < dashBox.x + dashBox.width &&
          btnBox.x + btnBox.width > dashBox.x &&
          btnBox.y < dashBox.y + dashBox.height &&
          btnBox.y + btnBox.height > dashBox.y;

        expect(
          hasButtonCollision,
          `Button ${selector} (top: ${btnBox.y}, bottom: ${btnBox.y + btnBox.height}) must not collide with #bottom-dashboard (top: ${dashBox.y}, bottom: ${dashBox.y + dashBox.height})`
        ).toBe(false);
      }
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-M30-TOUCH-04: Zero collision/overlap in Mobile Landscape orientation', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // Switch to landscape viewport (Pixel 5 landscape: 851x393)
    await page.setViewportSize({ width: 851, height: 393 });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const dashboard = page.locator('#bottom-dashboard');
    const dashBox = await dashboard.boundingBox();
    expect(dashBox).not.toBeNull();
    if (!dashBox) return;

    const buttonSelectors = [
      '#btn-left',
      '#btn-right',
      '#btn-fullscreen',
      '#btn-special',
      '#btn-fire',
    ];

    for (const selector of buttonSelectors) {
      const btnBox = await page.locator(selector).boundingBox();
      expect(btnBox).not.toBeNull();
      if (btnBox) {
        // In landscape, buttons are docked on left/right wings, while bottom-dashboard is center-docked
        const hasCollision =
          btnBox.x < dashBox.x + dashBox.width &&
          btnBox.x + btnBox.width > dashBox.x &&
          btnBox.y < dashBox.y + dashBox.height &&
          btnBox.y + btnBox.height > dashBox.y;

        expect(
          hasCollision,
          `In landscape, ${selector} (x: ${btnBox.x}, w: ${btnBox.width}) must not collide with #bottom-dashboard (x: ${dashBox.x}, w: ${dashBox.width})`
        ).toBe(false);

        // Verify minimum 48px touch target is also maintained in landscape
        expect(btnBox.width).toBeGreaterThanOrEqual(48);
        expect(btnBox.height).toBeGreaterThanOrEqual(48);
      }
    }

    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-M30-TOUCH-05: Multi-touch and pointer actions dispatch cleanly on virtual controls', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Click canvas to start game
    const canvas = page.locator('#game-canvas');
    const canvasBox = await canvas.boundingBox();
    if (canvasBox) {
      await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      await page.waitForTimeout(300);
    }

    // Tap Left button
    const btnLeft = page.locator('#btn-left');
    await btnLeft.dispatchEvent('pointerdown');
    await page.waitForTimeout(100);
    await btnLeft.dispatchEvent('pointerup');

    // Tap Right button
    const btnRight = page.locator('#btn-right');
    await btnRight.dispatchEvent('pointerdown');
    await page.waitForTimeout(100);
    await btnRight.dispatchEvent('pointerup');

    // Tap Fire button
    const btnFire = page.locator('#btn-fire');
    await btnFire.dispatchEvent('pointerdown');
    await page.waitForTimeout(100);
    await btnFire.dispatchEvent('pointerup');

    // Tap Special button
    const btnSpecial = page.locator('#btn-special');
    await btnSpecial.dispatchEvent('pointerdown');
    await page.waitForTimeout(100);
    await btnSpecial.dispatchEvent('pointerup');

    // Tap Fullscreen button
    const btnFullscreen = page.locator('#btn-fullscreen');
    await btnFullscreen.dispatchEvent('pointerdown');
    await page.waitForTimeout(100);
    await btnFullscreen.dispatchEvent('pointerup');

    await page.waitForTimeout(400);

    // Verify no unhandled JavaScript errors or page crashes
    expect(errorCollector.getErrors()).toEqual([]);
  });
});
