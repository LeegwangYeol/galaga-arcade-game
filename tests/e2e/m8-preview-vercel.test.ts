import { test, expect } from '@playwright/test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Milestone 8 - Production Build & Vercel Preview Serving Harness', () => {
  let server: http.Server;
  let baseUrl: string;
  const rootDir = process.cwd();
  const distDir = path.resolve(rootDir, 'dist');
  const vercelJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'vercel.json'), 'utf-8'));

  // Custom static server that emulates Vercel edge header injection & cleanUrls routing
  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      let reqPath = req.url?.split('?')[0] || '/';
      if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
      }

      // Emulate Vercel headers based on vercel.json rules
      vercelJson.headers.forEach((rule: any) => {
        const regex = new RegExp('^' + rule.source.replace(/\(\.\*\)/g, '.*') + '$');
        if (regex.test(reqPath)) {
          rule.headers.forEach((h: any) => {
            res.setHeader(h.key, h.value);
          });
        }
      });

      const filePath = path.join(distDir, reqPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.map': 'application/json; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
          '.json': 'application/json',
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.writeHead(200);
        fs.createReadStream(filePath).pipe(res);
      } else {
        // Fallback for SPA or cleanUrls
        const fallbackPath = path.join(distDir, 'index.html');
        if (fs.existsSync(fallbackPath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.writeHead(200);
          fs.createReadStream(fallbackPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('Vercel Header Compliance: Serves index.html with exact CSP, Frame, and Cache-Control headers', async ({ request }) => {
    const res = await request.get(`${baseUrl}/`);
    expect(res.status()).toBe(200);
    const headers = res.headers();

    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=()');
    expect(headers['x-xss-protection']).toBe('1; mode=block');
    expect(headers['cache-control']).toBe('public, max-age=0, must-revalidate');
  });

  test('Vercel Header Compliance: Serves bundled assets with immutable caching header', async ({ request }) => {
    const assets = fs.readdirSync(path.join(distDir, 'assets'));
    const jsAsset = assets.find((f) => f.endsWith('.js'))!;
    expect(jsAsset).toBeDefined();

    const res = await request.get(`${baseUrl}/assets/${jsAsset}`);
    expect(res.status()).toBe(200);
    const headers = res.headers();

    expect(headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headers['content-type']).toContain('application/javascript');
  });

  test('Production E2E: Headless browser loads production dist build with 0 runtime or CSP errors', async ({ page }) => {
    const runtimeErrors: string[] = [];
    const consoleErrors: string[] = [];
    const cspViolations: string[] = [];

    page.on('pageerror', (err) => runtimeErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Navigate to production preview
    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Canvas must be rendered and mounted
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();

    const canvasMeta = await page.evaluate(() => {
      const c = document.querySelector('#game-canvas') as HTMLCanvasElement | null;
      return c ? { width: c.width, height: c.height } : null;
    });

    expect(canvasMeta).not.toBeNull();
    expect(canvasMeta?.width).toBe(224);
    expect(canvasMeta?.height).toBe(288);

    // Start game via Space key
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Move player and fire
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Assert 0 runtime errors and 0 console errors
    expect(runtimeErrors).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
    expect(cspViolations).toHaveLength(0);
  });
});
