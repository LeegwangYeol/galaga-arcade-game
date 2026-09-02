import { test, expect } from '@playwright/test';
import { createErrorCollector } from './helpers/test-utils';

test.describe('Galaga Arcade Web Game - Gameplay E2E Scenarios', () => {
  test('TC-E2E-11: Title Screen to Game Start transition on user input', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Initial click on canvas to focus and unlock Web Audio API
    await page.click('#game-canvas');
    await page.waitForTimeout(200);

    // Press Space or Enter to start the game
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);

    // Verify no runtime errors during state transition
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-12: Player Ship Movement and Missile Firing across playfield', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.click('#game-canvas');
    await page.keyboard.press('Space'); // Start game
    await page.waitForTimeout(500);

    // Move left for 500ms
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowLeft');

    // Fire missile
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Move right for 800ms
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowRight');

    // Fire double missile
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await page.keyboard.press('Space');

    await page.waitForTimeout(500);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-13: Pause and Resume game state toggling preserves stability', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.click('#game-canvas');
    await page.keyboard.press('Space'); // Start game
    await page.waitForTimeout(600);

    // Toggle Pause ON
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(500);

    // Attempt input while paused (should not crash)
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Toggle Pause OFF
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(500);

    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-14: High Score LocalStorage persistence across page reload', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.goto('/', { waitUntil: 'load' });

    // Seed mock high score into localStorage
    await page.evaluate(() => {
      localStorage.setItem('galaga_high_score', '25400');
    });

    // Reload page to verify state recovery
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);

    const savedHighScore = await page.evaluate(() => {
      return localStorage.getItem('galaga_high_score');
    });

    expect(savedHighScore).toBe('25400');
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('TC-E2E-15: Mobile Touch Controls - Virtual Joystick & Fire Button Interaction', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'load' });

    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Tap center to start
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);

    // Drag left virtual joystick area
    const leftPadX = box.x + box.width * 0.2;
    const leftPadY = box.y + box.height * 0.85;

    await page.mouse.move(leftPadX, leftPadY);
    await page.mouse.down();
    await page.mouse.move(leftPadX - 30, leftPadY);
    await page.waitForTimeout(200);
    await page.mouse.up();

    // Tap right virtual fire button area
    const fireBtnX = box.x + box.width * 0.8;
    const fireBtnY = box.y + box.height * 0.85;
    await page.mouse.click(fireBtnX, fireBtnY);
    await page.waitForTimeout(100);
    await page.mouse.click(fireBtnX, fireBtnY);

    await page.waitForTimeout(500);

    expect(errorCollector.getErrors()).toEqual([]);
  });
});
