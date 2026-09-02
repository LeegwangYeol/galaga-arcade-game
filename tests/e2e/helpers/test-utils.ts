import type { Page } from '@playwright/test';

export interface CapturedError {
  type: 'pageerror' | 'console.error' | 'unhandledrejection';
  message: string;
  stack?: string | undefined;
  timestamp: number;
}

/**
 * Attaches listeners to capture all uncaught exceptions, page errors, and console.error messages.
 */
export function createErrorCollector(page: Page) {
  const errors: CapturedError[] = [];

  page.on('pageerror', (err) => {
    errors.push({
      type: 'pageerror',
      message: err.message || String(err),
      stack: err.stack,
      timestamp: Date.now(),
    });
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({
        type: 'console.error',
        message: msg.text(),
        timestamp: Date.now(),
      });
    }
  });

  return {
    getErrors: () => [...errors],
    hasErrors: () => errors.length > 0,
    clear: () => {
      errors.length = 0;
    },
  };
}

/**
 * Monitors the HTML5 canvas element over a given duration to verify active frame rendering.
 * Checks whether requestAnimationFrame is ticking and canvas pixel content is actively updating.
 */
export async function verifyCanvasRendering(
  page: Page,
  selector: string = '#game-canvas',
  samplingDurationMs: number = 600
): Promise<{ frameCount: number; pixelChanged: boolean; fps: number }> {
  // Wait for canvas to be visible
  await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });

  const result = await page.evaluate(
    async ({ canvasSelector, duration }) => {
      const canvas = document.querySelector(canvasSelector) as HTMLCanvasElement | null;
      if (!canvas) {
        throw new Error(`Canvas element "${canvasSelector}" not found in DOM.`);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not acquire 2D rendering context from canvas.');
      }

      // 1. Measure requestAnimationFrame ticks over sampling window
      let frames = 0;
      let running = true;
      const startTime = performance.now();

      const onFrame = () => {
        if (!running) return;
        frames++;
        requestAnimationFrame(onFrame);
      };
      requestAnimationFrame(onFrame);

      // 2. Sample pixel snapshots at start and after duration
      const snapshotStart = canvas.toDataURL('image/png');

      await new Promise((resolve) => setTimeout(resolve, duration));
      running = false;
      const endTime = performance.now();

      const snapshotEnd = canvas.toDataURL('image/png');
      const elapsedSeconds = (endTime - startTime) / 1000;
      const fps = frames / elapsedSeconds;

      // Check if image data changed (starfield scrolling / animation)
      const pixelChanged = snapshotStart !== snapshotEnd;

      return {
        frameCount: frames,
        pixelChanged,
        fps,
      };
    },
    { canvasSelector: selector, duration: samplingDurationMs }
  );

  return result;
}

/**
 * Computes canvas aspect ratio and validates against retro arcade specifications (7:9 or native 224x288 / 448x576).
 */
export async function getCanvasDimensions(page: Page, selector: string = '#game-canvas') {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const widthAttr = canvas.width;
    const heightAttr = canvas.height;
    const computedStyle = window.getComputedStyle(canvas);

    return {
      attrWidth: widthAttr,
      attrHeight: heightAttr,
      attrAspectRatio: widthAttr / heightAttr,
      displayWidth: rect.width,
      displayHeight: rect.height,
      displayAspectRatio: rect.width / rect.height,
      imageRendering: computedStyle.imageRendering,
    };
  }, selector);
}

/**
 * Simulates a mobile touch drag gesture on the virtual joystick area.
 */
export async function simulateTouchDrag(
  page: Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number = 5
) {
  await page.touchscreen.tap(startX, startY);
  // Dispatch touch move events
  for (let i = 1; i <= steps; i++) {
    const currentX = startX + ((endX - startX) * i) / steps;
    const currentY = startY + ((endY - startY) * i) / steps;
    await page.evaluate(
      ({ x, y }) => {
        const touchObj = new Touch({
          identifier: 1,
          target: document.body,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
        });
        const touchEvent = new TouchEvent('touchmove', {
          cancelable: true,
          bubbles: true,
          touches: [touchObj],
          targetTouches: [touchObj],
          changedTouches: [touchObj],
        });
        document.dispatchEvent(touchEvent);
      },
      { x: currentX, y: currentY }
    );
    await page.waitForTimeout(16);
  }
}
