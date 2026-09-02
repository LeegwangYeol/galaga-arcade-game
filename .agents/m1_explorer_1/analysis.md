# Milestone 1: Build & Configuration Architecture Analysis

## 1. Executive Summary

Milestone 1 establishes the foundational infrastructure for the **Galaga Arcade Web Game**. The primary goals are:
1. **Deterministic, zero-dependency runtime**: Build an authentic Galaga arcade clone using pure HTML5 Canvas 2D and Web Audio API without external game frameworks or heavy runtime bloat.
2. **Lightning-fast development & production bundling**: Leverage Vite 6 with TypeScript 5.7+ for instant HMR, strict type checking, and optimized static asset generation targeting `dist/`.
3. **Flawless Vercel deployment**: Configure `vercel.json` with industry-standard security headers (strict CSP, clickjacking defense, MIME protection) and aggressive static caching for sub-100ms asset delivery.
4. **Authentic retro arcade presentation**: Deliver an `index.html` featuring CRT arcade cabinet styling, crisp pixel-art scaling (`image-rendering: pixelated`), mobile viewport optimization (`viewport-fit=cover`, touch gesture suppression), and Google Fonts retro typography.
5. **Robust test harness integration**: Provide embedded Vitest configuration for seamless unit testing of mathematical models (Bézier curves, Vector2), physics, and state machines.

---

## 2. Configuration Design & Specifications

### 2.1 `package.json`

#### Design Decisions & Rationale:
- **Zero Runtime Dependencies**: The game is authored in pure TypeScript/Canvas 2D/Web Audio API. Keeping `dependencies` empty ensures zero external supply-chain vulnerabilities, zero licensing conflicts, zero bundle bloat, and maximum 60fps rendering predictability.
- **Strict Development Toolchain**:
  - `vite`: Fast ESM development server and Rollup-based static bundler.
  - `typescript`: Type checker and compiler.
  - `vitest`: Ultra-fast ESM-native test runner compatible with Vite configuration.
  - `@types/node`: Standard Node.js environment type declarations.
- **Essential Scripts**:
  - `"dev"`: Starts local development server on port 3000.
  - `"build"`: Runs strict type check (`tsc --noEmit`) before executing Vite production build.
  - `"preview"`: Previews the built production bundle on port 3000.
  - `"typecheck"`: Standalone TypeScript static verification script.
  - `"test"`: Executes Vitest unit tests in single-run CI mode.
  - `"test:watch"`: Interactive test runner during development.

#### Proposed `package.json`:
```json
{
  "name": "galaga-arcade",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Authentic Galaga 1981 arcade clone built with TypeScript, HTML5 Canvas 2D, and Web Audio API",
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 3000",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "typescript": "^5.7.3",
    "vite": "^6.1.0",
    "vitest": "^3.0.5"
  }
}
```

---

### 2.2 `tsconfig.json`

#### Design Decisions & Rationale:
- **Target `ES2022` & Module `ESNext`**: Emits modern, clean ECMAScript syntax (class fields, private methods, top-level await) fully supported across all modern evergreen browsers and Vercel edge runtimes.
- **`moduleResolution: "bundler"`**: Matches modern Vite 6 / TypeScript 5 module resolution rules.
- **Maximum Strictness & Safety**:
  - `strict: true`: Enables all strict type-checking options.
  - `noUncheckedIndexedAccess: true`: Forces explicit handling of undefined array/object indexing, preventing runtime `TypeError: Cannot read property of undefined` in game entity arrays and bullet pools.
  - `noImplicitOverride: true`: Ensures class inheritance (e.g. `Enemy` subclasses `Zako`, `Goei`, `BossGalaga`) explicitly documents method overrides.
  - `noFallthroughCasesInSwitch: true`: Crucial for state machine dispatch (`GameState`, `FlightStage`, `TractorBeamState`).
  - `isolatedModules: true`: Guarantees transpilability under Vite's esbuild transform pipeline.
- **Types**: Includes `node` and `vitest/globals` to support test suites without repetitive test imports.

#### Proposed `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "noEmit": true,

    /* Strict Type-Checking Options */
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    /* Additional Quality Checks */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,

    /* Interop and Environment */
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node", "vitest/globals"]
  },
  "include": [
    "src/**/*",
    "tests/**/*",
    "vite.config.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

---

### 2.3 `vite.config.ts`

#### Design Decisions & Rationale:
- **`base: './'`**: Ensures all bundled asset URLs (scripts, fonts, icons) are relative, allowing portable hosting in subdirectories or static server roots without path breakage.
- **Server & Preview Port 3000**: Aligns with user and project specifications (`port: 3000`, `host: true` for mobile LAN testing).
- **Production Build Configuration**:
  - `outDir: 'dist'`: Standard build output directory.
  - `emptyOutDir: true`: Cleans stale build artifacts before compiling.
  - `sourcemap: true`: Enables production debugging and error tracing.
  - `target: 'es2022'`: Ensures small bundle size by avoiding polyfill overhead.
- **Vitest Integration**: Native test config block with `defineConfig` from `vitest/config` to allow direct execution of `npm test`.

#### Proposed `vite.config.ts`:
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: true,
    open: false,
  },
  preview: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    minify: 'esbuild',
    assetsInlineLimit: 4096,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

---

### 2.4 `vercel.json`

#### Design Decisions & Rationale:
- **Security Headers**:
  - `Content-Security-Policy`:
    - `default-src 'self'`: Restricts loading from untrusted domains.
    - `script-src 'self' 'unsafe-inline'`: Permits Vite scripts and inline bootstrapping.
    - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`: Permits arcade styling and Google Fonts.
    - `font-src 'self' https://fonts.gstatic.com data:`: Loads retro pixel fonts.
    - `connect-src 'self'`: Prevents rogue network calls.
    - `frame-ancestors 'none'`: Prevents clickjacking by blocking embedding inside iframes.
    - `object-src 'none'`: Disables plugins like Flash / Java.
  - `X-Frame-Options: "DENY"`: Additional clickjacking defense.
  - `X-Content-Type-Options: "nosniff"`: Prevents MIME-confusion attacks.
  - `Referrer-Policy: "strict-origin-when-cross-origin"`: Protects user privacy.
  - `Permissions-Policy: "camera=(), microphone=(), geolocation=(), payment=()"`: Drops unnecessary browser hardware permissions.
- **Cache Optimization**:
  - `/assets/(.*)` is cached immutably for 1 year (`max-age=31536000, immutable`) because Vite generates hashed asset filenames.
  - HTML documents (`/(.*)`) use `must-revalidate` (`max-age=0, must-revalidate`) to guarantee instant updates on new deployments.

#### Proposed `vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), payment=()"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*)\\.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    }
  ]
}
```

---

### 2.5 `index.html`

#### Design Decisions & Rationale:
- **Arcade Screen Ratio & Canvas Dimensions**:
  - Virtual Native Resolution: $224 \times 288$ ($7:9$ vertical arcade ratio).
  - High-DPI Logical Resolution: $448 \times 576$ ($2 \times$ scale for crisp text and sprites).
- **Pixelated Image Rendering**:
  - Employs `image-rendering: pixelated`, `-webkit-crisp-edges`, `-moz-crisp-edges`, and `crisp-edges` to prevent bilinear blurring on scaling.
- **Mobile & Touch Handling**:
  - Viewport: `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
  - `touch-action: none` and `user-select: none` on the body and canvas to prevent mobile scroll, double-tap zoom, and long-press selection.
- **CRT Aesthetics**:
  - Deep arcade black `#030306` with subtle dark blue glow and optional subtle CRT scanline effect.
  - Centered arcade frame with letterboxing.
  - Google Font `'Press Start 2P'` loaded for authentic Namco 1981 arcade typography.
- **Virtual Mobile Touch Controls**:
  - Left / Right steering touch zones and a prominent tactile Fire button configured for touch devices.

#### Proposed `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="description" content="Authentic 1981 Galaga Arcade Classic reconstructed with HTML5 Canvas 2D and Web Audio API" />
  <meta name="theme-color" content="#030306" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <title>Galaga — 1981 Arcade Classic</title>

  <!-- Google Fonts: Press Start 2P for authentic Namco 8-bit typography -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />

  <style>
    :root {
      --bg-color: #030306;
      --cabinet-border: #1a1a2e;
      --accent-red: #ff2a2a;
      --accent-yellow: #ffff00;
      --accent-cyan: #00ffff;
      --font-arcade: 'Press Start 2P', monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--bg-color);
      font-family: var(--font-arcade);
      color: #ffffff;
      touch-action: none;
    }

    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      background: radial-gradient(circle at center, #0a0a18 0%, #030306 100%);
    }

    #app-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      max-width: 100vw;
      max-height: 100vh;
      max-height: 100dvh;
    }

    .canvas-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 30px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 100, 255, 0.2);
      border-radius: 4px;
      overflow: hidden;
      background-color: #000000;
    }

    #gameCanvas {
      display: block;
      /* Authentic Crisp Pixelated Upscaling */
      image-rendering: -moz-crisp-edges;
      image-rendering: -webkit-crisp-edges;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      background-color: #000000;
    }

    /* Subtle CRT Scanline Overlay */
    .scanlines {
      pointer-events: none;
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0),
        rgba(255, 255, 255, 0) 50%,
        rgba(0, 0, 0, 0.25) 50%,
        rgba(0, 0, 0, 0.25)
      );
      background-size: 100% 4px;
      z-index: 10;
      opacity: 0.6;
    }

    /* Mobile Virtual Controls Overlay */
    #touch-controls {
      display: none;
      position: absolute;
      bottom: 12px;
      left: 0;
      width: 100%;
      padding: 0 20px;
      box-sizing: border-box;
      justify-content: space-between;
      align-items: center;
      pointer-events: none;
      z-index: 20;
    }

    .touch-btn {
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.15);
      border: 2px solid rgba(255, 255, 255, 0.4);
      color: #ffffff;
      border-radius: 50%;
      font-family: var(--font-arcade);
      font-size: 14px;
      user-select: none;
      touch-action: none;
      box-shadow: 0 4px 8px rgba(0,0,0,0.5);
      transition: background-color 0.1s, transform 0.1s;
    }

    .touch-btn:active, .touch-btn.active {
      background: rgba(255, 42, 42, 0.6);
      transform: scale(0.92);
    }

    .dpad-container {
      display: flex;
      gap: 16px;
    }

    .dpad-btn {
      width: 60px;
      height: 60px;
    }

    .fire-btn {
      width: 72px;
      height: 72px;
      background: rgba(255, 42, 42, 0.3);
      border-color: rgba(255, 42, 42, 0.7);
      color: #ffcccc;
    }

    /* Show touch controls on touch devices / narrow screens */
    @media (hover: none) and (pointer: coarse), (max-width: 600px) {
      #touch-controls {
        display: flex;
      }
    }
  </style>
</head>
<body>
  <div id="app-container">
    <div class="canvas-wrapper">
      <canvas id="gameCanvas" width="448" height="576" aria-label="Galaga Arcade Game Screen" role="img"></canvas>
      <div class="scanlines" aria-hidden="true"></div>
    </div>

    <!-- Virtual Touch Controls for Mobile Devices -->
    <div id="touch-controls" aria-hidden="true">
      <div class="dpad-container">
        <button id="btn-left" class="touch-btn dpad-btn" aria-label="Move Left">◀</button>
        <button id="btn-right" class="touch-btn dpad-btn" aria-label="Move Right">▶</button>
      </div>
      <button id="btn-fire" class="touch-btn fire-btn" aria-label="Fire Missile">FIRE</button>
    </div>
  </div>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

---

### 2.6 `.gitignore`

#### Proposed `.gitignore`:
```
# Dependencies
node_modules/
.pnp
.pnp.js

# Build Outputs
dist/
dist-ssr/
*.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Editor & OS Metadata
.DS_Store
Thumbs.db
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Testing & Coverage
coverage/
playwright-report/
test-results/

# Teamwork Agent Artifacts
.agents/
```

---

## 3. Dependency & Tooling Compatibility Verification

1. **Vite 6 + TypeScript 5.7**: Fully compatible with ES2022 output, ESNext modules, and bundler resolution.
2. **Vitest 3**: Seamlessly consumes `vite.config.ts` without needing duplicate babel/jest configurations.
3. **Vercel Zero-Config Deployment**: Vercel automatically detects `vite` framework, detects `dist` output, and applies all `vercel.json` security and cache headers.
4. **HTML5 Canvas & Web Audio API**: 100% native browser standards. Zero external CDNs required for audio or assets.

---

## 4. Downstream Implementation Plan for Milestone 1

1. Write `package.json` to workspace root.
2. Write `tsconfig.json` to workspace root.
3. Write `vite.config.ts` to workspace root.
4. Write `vercel.json` to workspace root.
5. Write `index.html` to workspace root.
6. Write `.gitignore` to workspace root.
7. Run `npm install` to install dependencies.
8. Verify `npm run typecheck`, `npm run build`, and `npm run test`.
9. Initialize local Git repository and perform initial commit for M1.
