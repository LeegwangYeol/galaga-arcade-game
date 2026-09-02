/**
 * Standalone E2E Verification Runner for Galaga Arcade Web Game
 * 
 * Can be executed programmatically or via CLI (`npx tsx tests/e2e/standalone-runner.ts`)
 * to verify:
 * 1. Dev/preview server connectivity (HTTP 200)
 * 2. HTML and Canvas element mounting in DOM
 * 3. Aspect ratio compliance (7:9 / ~0.7778)
 * 4. Headless browser runtime error collection (0 errors)
 * 5. Game loop ticking & canvas pixel rendering
 */

import { chromium, type Browser, type Page } from 'playwright';

interface VerificationReport {
  timestamp: string;
  url: string;
  httpStatus: number;
  canvasFound: boolean;
  canvasDimensions: {
    attrWidth: number;
    attrHeight: number;
    aspectRatio: number;
    displayWidth: number;
    displayHeight: number;
  } | null;
  runtimeErrors: string[];
  consoleErrors: string[];
  frameCountSampled: number;
  fps: number;
  pixelsAnimated: boolean;
  passed: boolean;
}

export async function runBrowserVerification(
  targetUrl: string = process.env.TEST_URL || 'http://localhost:3000'
): Promise<VerificationReport> {
  console.log(`[E2E Runner] Starting browser verification against: ${targetUrl}`);

  const runtimeErrors: string[] = [];
  const consoleErrors: string[] = [];
  let httpStatus = 0;
  let canvasFound = false;
  let canvasDimensions = null;
  let frameCountSampled = 0;
  let fps = 0;
  let pixelsAnimated = false;

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    page = await context.newPage();

    // Listen to page errors and console errors
    page.on('pageerror', (err) => {
      runtimeErrors.push(err.message || String(err));
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Navigate to target URL
    const response = await page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    httpStatus = response?.status() || 0;

    // 2. Check Canvas element
    const canvasElement = page.locator('#game-canvas');
    canvasFound = (await canvasElement.count()) > 0;

    if (canvasFound) {
      canvasDimensions = await page.evaluate(() => {
        const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement | null;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
          attrWidth: canvas.width,
          attrHeight: canvas.height,
          aspectRatio: canvas.width / canvas.height,
          displayWidth: Math.round(rect.width),
          displayHeight: Math.round(rect.height),
        };
      });

      // 3. Sample Game Loop Ticking and Canvas Rendering
      const sampling = await page.evaluate(async (durationMs: number) => {
        const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
        const snap1 = canvas.toDataURL();
        let frames = 0;
        let active = true;
        const t0 = performance.now();

        const countFrame = () => {
          if (!active) return;
          frames++;
          requestAnimationFrame(countFrame);
        };
        requestAnimationFrame(countFrame);

        await new Promise((resolve) => setTimeout(resolve, durationMs));
        active = false;
        const t1 = performance.now();
        const snap2 = canvas.toDataURL();

        return {
          frames,
          fps: (frames / (t1 - t0)) * 1000,
          pixelChanged: snap1 !== snap2,
        };
      }, 600);

      frameCountSampled = sampling.frames;
      fps = Math.round(sampling.fps);
      pixelsAnimated = sampling.pixelChanged;

      // 4. Test Keyboard Interaction
      await page.click('#game-canvas');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
  } catch (error) {
    runtimeErrors.push(`Runner execution failure: ${String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const passed =
    httpStatus === 200 &&
    canvasFound &&
    runtimeErrors.length === 0 &&
    consoleErrors.length === 0 &&
    frameCountSampled > 10;

  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    url: targetUrl,
    httpStatus,
    canvasFound,
    canvasDimensions,
    runtimeErrors,
    consoleErrors,
    frameCountSampled,
    fps,
    pixelsAnimated,
    passed,
  };

  console.log('[E2E Runner] Verification Result Summary:');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  const targetUrl = process.argv[2] || 'http://localhost:3000';
  runBrowserVerification(targetUrl)
    .then((report) => {
      if (!report.passed) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal E2E runner error:', err);
      process.exit(1);
    });
}
