import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestone 8 Challenger - Vercel & Production Build Empirical Audit', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const distDir = path.resolve(rootDir, 'dist');
  const vercelJsonPath = path.resolve(rootDir, 'vercel.json');
  const viteConfigPath = path.resolve(rootDir, 'vite.config.ts');
  const packageJsonPath = path.resolve(rootDir, 'package.json');

  describe('1. Vercel Configuration (vercel.json) Security & Routing Verification', () => {
    it('vercel.json exists and is valid JSON', () => {
      expect(fs.existsSync(vercelJsonPath)).toBe(true);
      const content = fs.readFileSync(vercelJsonPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toBeTypeOf('object');
    });

    it('vercel.json includes cleanUrls: true for canonical routing', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
      expect(parsed.cleanUrls).toBe(true);
    });

    it('vercel.json defines strict security headers for all routes (/(.*))', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
      expect(Array.isArray(parsed.headers)).toBe(true);

      const catchAllRule = parsed.headers.find((h: any) => h.source === '/(.*)');
      expect(catchAllRule).toBeDefined();

      const headerMap: Record<string, string> = {};
      catchAllRule.headers.forEach((h: any) => {
        headerMap[h.key] = h.value;
      });

      // Verify Content-Security-Policy
      expect(headerMap['Content-Security-Policy']).toBeDefined();
      const csp = headerMap['Content-Security-Policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com data:");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("media-src 'self' data: blob:");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");

      // Verify X-Frame-Options
      expect(headerMap['X-Frame-Options']).toBe('DENY');

      // Verify X-Content-Type-Options
      expect(headerMap['X-Content-Type-Options']).toBe('nosniff');

      // Verify Referrer-Policy
      expect(headerMap['Referrer-Policy']).toBe('strict-origin-when-cross-origin');

      // Verify Permissions-Policy
      expect(headerMap['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=(), payment=()');

      // Verify X-XSS-Protection
      expect(headerMap['X-XSS-Protection']).toBe('1; mode=block');
    });

    it('vercel.json configures immutable CDN caching for hashed static assets', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
      const assetRule = parsed.headers.find((h: any) => h.source === '/assets/(.*)');
      expect(assetRule).toBeDefined();

      const cacheControl = assetRule.headers.find((h: any) => h.key === 'Cache-Control');
      expect(cacheControl).toBeDefined();
      expect(cacheControl.value).toBe('public, max-age=31536000, immutable');
    });

    it('vercel.json configures no-cache revalidation for HTML entry files', () => {
      const parsed = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
      const htmlRule = parsed.headers.find((h: any) => h.source === '/(.*)\\.html');
      expect(htmlRule).toBeDefined();

      const cacheControl = htmlRule.headers.find((h: any) => h.key === 'Cache-Control');
      expect(cacheControl).toBeDefined();
      expect(cacheControl.value).toBe('public, max-age=0, must-revalidate');
    });
  });

  describe('2. Vite Configuration & Package.json Production Readiness', () => {
    it('package.json specifies standard build and preview scripts', () => {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      expect(pkg.scripts.build).toBe('tsc --noEmit && vite build');
      expect(pkg.scripts.preview).toBe('vite preview --port 3000');
    });

    it('vite.config.ts uses relative base path (./) for universal CDN/Vercel compatibility', () => {
      const config = fs.readFileSync(viteConfigPath, 'utf-8');
      expect(config).toContain("base: './'");
      expect(config).toContain("outDir: 'dist'");
      expect(config).toContain("target: 'es2022'");
      expect(config).toContain("minify: 'esbuild'");
    });
  });

  describe('3. Production Build Artifacts (dist/) Verification', () => {
    it('dist directory exists and contains index.html', () => {
      expect(fs.existsSync(distDir)).toBe(true);
      const indexPath = path.join(distDir, 'index.html');
      expect(fs.existsSync(indexPath)).toBe(true);
    });

    it('dist/index.html references bundled JS module via relative path', () => {
      const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
      expect(html).toMatch(/<script\s+type="module"\s+crossorigin\s+src="\.\/assets\/index-[A-Za-z0-9_-]+\.js"><\/script>/);
      expect(html).toContain('id="game-canvas"');
      expect(html).toContain('id="touch-controls"');
    });

    it('dist/assets contains bundled JS and source map', () => {
      const assetsDir = path.join(distDir, 'assets');
      expect(fs.existsSync(assetsDir)).toBe(true);
      const files = fs.readdirSync(assetsDir);

      const jsFiles = files.filter(f => f.startsWith('index-') && f.endsWith('.js'));
      const mapFiles = files.filter(f => f.startsWith('index-') && f.endsWith('.js.map'));

      expect(jsFiles.length).toBeGreaterThanOrEqual(1);
      expect(mapFiles.length).toBeGreaterThanOrEqual(1);

      const jsPath = path.join(assetsDir, jsFiles[0]!);
      const stat = fs.statSync(jsPath);

      // Raw bundle size must be under 300 KB (actual is ~148 KB)
      expect(stat.size).toBeLessThan(300 * 1024);
      expect(stat.size).toBeGreaterThan(10 * 1024);
    });

    it('bundled JS contains no unresolved dev imports or raw TypeScript', () => {
      const assetsDir = path.join(distDir, 'assets');
      const files = fs.readdirSync(assetsDir);
      const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'))!;
      const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');

      expect(jsContent).not.toContain('import.meta.hot');
      expect(jsContent).not.toContain('/src/main.ts');
      expect(jsContent).not.toContain('interface ');
      expect(jsContent).not.toContain(': Vector2D');
    });
  });
});
