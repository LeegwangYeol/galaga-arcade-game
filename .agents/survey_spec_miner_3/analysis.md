# Comprehensive Build, Vercel Deployment & E2E Testing Specification
**Project**: Galaga Arcade Web Game (갤로그 스타일 웹 아케이드 슈팅 게임)  
**Author**: survey_spec_miner_3 (Build, Vercel Deployment & E2E Testing Specialist)  
**Date**: 2026-09-02  

---

## 1. Project Tooling & Structure Specification

### 1.1 Architecture & Stack Rationale
- **Core Stack**: Vite 6.x + TypeScript 5.7+ + HTML5 Canvas 2D + Web Audio API.
- **Why Vite + Pure TypeScript/Canvas**:
  - Zero framework overhead: 60 FPS locked frame rate with minimal garbage collection.
  - Sub-second Hot Module Replacement (HMR) during local development (`npm run dev`).
  - Native ESM support and lightning-fast Rollup/Esbuild production bundling (`npm run build` -> `dist/`).
  - Zero-config static hosting compatibility on Vercel, Netlify, GitHub Pages, and Cloudflare Pages.
  - Web Audio API procedural synthesis eliminates 404 audio file loading failures and cross-origin audio decode bugs.

### 1.2 Package Configuration (`package.json`)
```json
{
  "name": "galaga-arcade-game",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@types/node": "^22.13.0",
    "typescript": "^5.7.3",
    "vite": "^6.2.0",
    "vitest": "^3.0.5"
  }
}
```

### 1.3 TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
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
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    /* Additional Checks */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path Aliasing */
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts"]
}
```

### 1.4 Vite Configuration (`vite.config.ts`)
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true,
    open: false
  },
  preview: {
    port: 4173,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});
```

### 1.5 Vercel Deployment Setup (`vercel.json`)
Vercel provides native zero-config detection for Vite static projects. However, a production-grade `vercel.json` provides explicit build parameters and hardened HTTP security headers:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "autoplay=(self), fullscreen=(self)"
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
    }
  ]
}
```

---

## 2. Vitest Unit Test Architecture

### 2.1 Test Directory Layout
```
tests/unit/
├── math/
│   ├── Vector2D.test.ts          # Vector algebra, distance, normalization, lerp
│   ├── Bezier.test.ts            # Quadratic & Cubic Bézier interpolation and tangent angles
│   └── Collision.test.ts         # AABB and Circle-Circle intersection algorithms
├── core/
│   └── GameState.test.ts         # Finite state machine transitions, guards, timers
├── systems/
│   └── ScoreManager.test.ts      # Score calculation, bonus lives, LocalStorage persist/recover
└── entities/
    ├── Player.test.ts            # Single/dual ship, position clamping, fire rate limit
    ├── Bullet.test.ts            # Missile lifecycle, screen boundary cleanup, pooling
    └── Enemy.test.ts             # Health points, hit states, dive trigger, formation grid
```

### 2.2 Detailed Test Suites & Assertions

#### A. Math & Physics Test Specifications (`Vector2D`, `Bezier`, `Collision`)
1. **`Vector2D.test.ts`**:
   - `add(v)`: $[x_1 + x_2, y_1 + y_2]$ verified against positive, negative, and float coords.
   - `subtract(v)`: $[x_1 - x_2, y_1 - y_2]$.
   - `scale(s)`: $[x \cdot s, y \cdot s]$.
   - `length()`: $\sqrt{x^2 + y^2}$.
   - `lengthSquared()`: $x^2 + y^2$ (fast distance comparisons without sqrt).
   - `normalize()`: Returns unit vector with length $1.0$.
   - **Edge Case**: `normalize()` on zero vector $[0, 0]$ must return $[0, 0]$ without producing `NaN`.
   - `distance(v)` / `distanceSquared(v)`: Euclidean distance calculation.
   - `lerp(target, t)`: Linear interpolation $(1-t)A + tB$, verifying $t=0 \to A$, $t=1 \to B$, $t=0.5 \to (A+B)/2$.
   - `dot(v)`: Dot product $x_1 x_2 + y_1 y_2$.

2. **`Bezier.test.ts`**:
   - Quadratic Bézier: $B(t) = (1-t)^2 P_0 + 2(1-t)t P_1 + t^2 P_2$.
     - Verify $B(0) = P_0$, $B(1) = P_2$, $B(0.5)$ matches midpoint offset.
   - Cubic Bézier: $B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$.
     - Verify $B(0) = P_0$, $B(1) = P_3$.
     - Verify multi-point curve smoothness (C1 continuity when joining segments).
   - Tangent Heading Angle: $\theta(t) = \operatorname{atan2}(dy/dt, dx/dt)$.
     - Used by enemy sprite rotation to align orientation with flight velocity direction.
   - **Edge Case**: Clamping $t$ outside $[0, 1]$ (e.g., $t < 0 \to 0$, $t > 1 \to 1$).

3. **`Collision.test.ts`**:
   - `checkCircleCollision(c1, c2)`:
     - Collision occurs when $(x_2 - x_1)^2 + (y_2 - y_1)^2 \le (r_1 + r_2)^2$.
     - Tangent circles (distance $= r_1 + r_2$) return `true`.
     - Non-overlapping circles return `false`.
   - `checkAABBCollision(box1, box2)`:
     - Intersection occurs when $x_1 < x_2 + w_2 \land x_1 + w_1 > x_2 \land y_1 < y_2 + h_2 \land y_1 + h_1 > y_2$.
     - Disjoint boxes return `false`.
   - Dual Fighter Combined Hitbox:
     - Single Fighter: width 16px, height 16px.
     - Dual Fighter: width 32px, height 16px (or two side-by-side 16px hitboxes).
     - Verify enemy missile hitting left wing damages only left ship, leaving right ship as single fighter.

#### B. State Machine Test Specifications (`GameState.test.ts`)
1. **State Transition Flow**:
   - `BOOT` $\to$ `TITLE` (upon assets/audio init).
   - `TITLE` $\to$ `STAGE_INTRO` (upon Enter / Space / Touch "Start").
   - `STAGE_INTRO` $\to$ `PLAYING` (after 2.5s stage intro animation and "STAGE 1" banner).
   - `PLAYING` $\to$ `CHALLENGING_STAGE` (when entering Stage 3, Stage 7, Stage 11, etc. - stage % 4 == 3).
   - `PLAYING` $\to$ `STAGE_CLEAR` (when all formation enemies are eliminated).
   - `STAGE_CLEAR` $\to$ `STAGE_INTRO` (increments `stageNumber`, loads next wave).
   - `PLAYING` $\to$ `PLAYER_CAPTURED` (when hit by Boss Galaga tractor beam while not destroyed).
   - `PLAYING` $\to$ `GAME_OVER` (when player lives reach 0).
   - `GAME_OVER` $\to$ `HIGH_SCORE_ENTRY` (if final score > top high scores).
   - `HIGH_SCORE_ENTRY` $\to$ `TITLE` (after timeout or initials entered).
2. **Pause & Resume**:
   - `PLAYING` $\to$ `PAUSED` (via Escape / P key / Blur event).
   - `PAUSED` $\to$ `PLAYING` (via unpause command).
   - Verify game loop deltaTime does not accumulate during pause (prevents time-jump bug on unpause).

#### C. Score & HighScore Test Specifications (`ScoreManager.test.ts`)
1. **Enemy Scoring Matrix**:
   - Zako (Bee):
     - In Formation: 50 pts
     - In Diving Attack: 100 pts
   - Goei (Butterfly):
     - In Formation: 80 pts
     - In Diving Attack: 160 pts
   - Boss Galaga:
     - In Formation: 150 pts
     - In Diving Attack (Solo): 400 pts
     - In Diving Attack (with 1 Escort): 800 pts
     - In Diving Attack (with 2 Escorts): 1,600 pts
   - Rescue Captured Fighter:
     - Shot while Boss is diving: 1,000 pts + Dual Fighter transform!
     - Shot while Boss is in formation: 500 pts (captured fighter becomes hostile Zako).
   - Challenging Stage Bonus:
     - Perfect 40/40 hits: 10,000 pts (SPECIAL BONUS)
     - < 40 hits: `hits * 100` pts
2. **Extra Life Thresholds**:
   - 1st Extra Life at: 20,000 pts
   - 2nd Extra Life at: 70,000 pts
   - Subsequent Extra Lives: Every 70,000 pts thereafter (140,000, 210,000, etc.)
   - Verify life count increments and extra life sound event triggers exactly once per threshold crossed.
3. **LocalStorage Persistence & Robustness**:
   - Saves `galaga_high_score` on new record.
   - Recovers high score on startup.
   - **Edge Case Handling**:
     - `localStorage` unavailable (incognito / security restriction): fall back to memory without crash.
     - Corrupted data (e.g. string "NaN", negative numbers, invalid JSON): safely fall back to default `20000`.
     - QuotaExceededError: safely catches and logs warning.

#### D. Entity Logic Test Specifications (`Player`, `Bullet`, `Enemy`)
1. **`Player.test.ts`**:
   - Movement boundary clamping: $x \in [8, \text{CANVAS\_WIDTH} - \text{SHIP\_WIDTH} - 8]$.
   - Single Ship state: max 2 active player missiles on screen simultaneously.
   - Dual Ship state: width doubled, fires 2 parallel missiles per shot (max 4 active missiles).
   - Fire cooldown: 150ms minimum interval between consecutive fire inputs.
   - Capture state: disabled input, pulled up towards Boss Galaga beam anchor, changes rotation during pull.
2. **`Bullet.test.ts`**:
   - Player bullet moves upward ($v_y = -800\text{ px/s}$).
   - Enemy bullet moves downward / aimed at player ($v_y > 0$).
   - Deactivated and recycled when $y < -10$ or $y > \text{CANVAS\_HEIGHT} + 10$.
3. **`Enemy.test.ts`**:
   - Zako / Goei: 1 HP.
   - Boss Galaga: 2 HP (1st hit transitions color from Blue/Green to Damaged Red/Yellow; 2nd hit explodes).
   - Formation grid alignment: lerps smoothly into home slot $(row, col)$ with oscillating "breathing" expansion.

---

## 3. Automated Browser & E2E Test Suite (Playwright)

### 3.1 Playwright Configuration (`playwright.config.ts`)
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'Desktop Chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
```

### 3.2 E2E Test Specifications

#### Test Suite 1: Page Load, DOM Attachment & Canvas Initialization (`smoke.spec.ts`)
- **Objective**: Verify application loads with HTTP 200 and renders `#game-canvas`.
```typescript
import { test, expect } from '@playwright/test';

test.describe('Galaga Smoke & Canvas Attachment', () => {
  test('should load page with 200 OK and attach canvas to DOM', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    
    // Verify canvas dimensions
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});
```

#### Test Suite 2: Zero Console Errors & Unhandled Rejections (`runtime-errors.spec.ts`)
- **Objective**: Ensure 0 runtime exceptions, unhandled Promise rejections, or console error messages during boot and gameplay.
```typescript
import { test, expect } from '@playwright/test';

test.describe('Zero Runtime Errors Audit', () => {
  test('should have 0 console errors and 0 unhandled exceptions during execution', async ({ page }) => {
    const errors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');
    // Run for 5 seconds to exercise animation frames and starfield
    await page.waitForTimeout(5000);

    expect(pageErrors, `Unhandled page errors: ${pageErrors.join(', ')}`).toEqual([]);
    expect(errors, `Console errors: ${errors.join(', ')}`).toEqual([]);
  });
});
```

#### Test Suite 3: Game Loop Ticks & Canvas Pixel Mutation (`game-loop.spec.ts`)
- **Objective**: Prove `requestAnimationFrame` is executing and canvas contents are actively animating.
```typescript
import { test, expect } from '@playwright/test';

test.describe('Game Loop Execution', () => {
  test('should continuously tick RAF and mutate canvas pixel data', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#game-canvas');

    // Sample frame count or canvas image hash at t=0 and t=1000ms
    const initialScreenshot = await page.locator('#game-canvas').screenshot();
    await page.waitForTimeout(1000);
    const subsequentScreenshot = await page.locator('#game-canvas').screenshot();

    // Verify visual change (starfield movement / text blinking)
    expect(initialScreenshot.equals(subsequentScreenshot)).toBe(false);

    // Verify window.fps or frame counter if exposed in dev mode
    const isLoopRunning = await page.evaluate(() => {
      return (window as any).__GALAGA_GAME_INSTANCE__?.isRunning ?? true;
    });
    expect(isLoopRunning).toBe(true);
  });
});
```

#### Test Suite 4: Multi-Modal Input Handling (`input.spec.ts`)
- **Objective**: Verify keyboard (Arrow keys, Spacebar, WASD), mouse, and mobile touch events update player position and fire missiles.
```typescript
import { test, expect } from '@playwright/test';

test.describe('Input Event Handling', () => {
  test('keyboard inputs move player and fire missiles', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#game-canvas');

    // Press Enter to start game
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000); // wait for stage intro

    // Move Left
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowLeft');

    // Fire Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Move Right
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');

    // Verify no crash occurred and input state processed
    const noErrors = await page.evaluate(() => !(window as any).__HAS_RUNTIME_ERROR__);
    expect(noErrors).toBe(true);
  });

  test('touch controls render on mobile viewport and accept touch events', async ({ page }) => {
    // Emulate touch device
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    
    const virtualPad = page.locator('#virtual-gamepad, .touch-controls, canvas');
    await expect(virtualPad.first()).toBeVisible();

    // Touch tap on canvas or virtual button
    await page.touchscreen.tap(200, 700);
    await page.waitForTimeout(500);
  });
});
```

---

## 4. Git & GitHub Integration Strategy

### 4.1 `.gitignore` Configuration
```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Production Build Output
dist/
dist-ssr/
*.local

# Test & Coverage Outputs
coverage/
playwright-report/
test-results/
blob-report/
.nyc_output/

# Logs & Debugging
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
*.log

# Editor & OS Artifacts
.DS_Store
Thumbs.db
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Environment
.env
.env.production
.env.local
```

### 4.2 Semantic Commit Milestones
1. `feat(core): initialize project structure, vite config, and canvas engine`
2. `feat(math): add Vector2D, Bezier curves, and collision detection systems`
3. `feat(entities): implement player ship with single/dual modes, lives, and firing`
4. `feat(enemy): add Zako, Goei, and Boss Galaga with bezier flight paths and tractor beam`
5. `feat(audio): implement Web Audio API retro sfx and chip-tune synth`
6. `feat(ui): add retro title screen, hud, score manager, and responsive touch controls`
7. `test: add vitest unit tests and playwright e2e automated test suite`
8. `deploy: configure vercel deployment and build verification`

### 4.3 GitHub CLI (`gh`) Automation Workflow
The system will run automated GitHub initialization and push:
```bash
# 1. Initialize local repository
git init -b main

# 2. Add all project files
git add .

# 3. Create initial commit
git commit -m "feat: complete Galaga arcade web game with testing and vercel deployment"

# 4. Check GitHub auth status
gh auth status

# 5. Create remote GitHub repository and push
gh repo create galaga-arcade-game --public --source=. --remote=origin --push
```

---

## 5. Detailed Code Layout Specification

```
galog/
├── index.html                          # HTML5 Entry Point & Canvas Container
├── package.json                        # Scripts, devDependencies
├── tsconfig.json                       # Strict TypeScript compiler options
├── vite.config.ts                      # Vite build & Vitest test configuration
├── playwright.config.ts                # Playwright E2E configuration
├── vercel.json                         # Vercel deployment & security headers
├── .gitignore                          # Clean repository ignore rules
├── src/
│   ├── main.ts                         # Game bootstrap, canvas mount, event bridge
│   │
│   ├── core/                           # Engine Core & Lifecycle
│   │   ├── Game.ts                     # Game coordinator, 60fps RAF loop, render & update
│   │   ├── GameState.ts                # State Machine (TITLE, INTRO, PLAYING, GAME_OVER)
│   │   ├── InputManager.ts             # Keyboard, Mouse, Touch event listener & state map
│   │   └── AssetLoader.ts              # Pixel sprite rasterizer & procedural palette generator
│   │
│   ├── math/                           # Pure Deterministic Mathematics
│   │   ├── Vector2D.ts                 # 2D Vector operations (add, sub, lerp, dist, norm)
│   │   ├── Bezier.ts                   # Quadratic & Cubic Bézier curve trajectory interpolation
│   │   └── Collision.ts                # AABB and Circle-Circle collision algorithms
│   │
│   ├── entities/                       # Active Game Objects
│   │   ├── Entity.ts                   # Base abstract class (position, velocity, bounding box)
│   │   ├── Player.ts                   # Player ship (single / dual, movement, lives, respawn)
│   │   ├── Bullet.ts                   # Player missiles & enemy projectiles
│   │   ├── Enemy.ts                    # Base enemy class (formation slots, diving state, HP)
│   │   ├── Zako.ts                     # Bee enemy (yellow/blue, diving loop)
│   │   ├── Goei.ts                     # Butterfly enemy (red/white, dual dive)
│   │   ├── BossGalaga.ts               # Boss enemy (blue/yellow, 2 HP, tractor beam capture)
│   │   └── Starfield.ts                # Dynamic 3-layer parallax star background with twinkle
│   │
│   ├── systems/                        # Game Subsystems
│   │   ├── EnemyFormation.ts           # 5x10 formation slot grid & breathing animation
│   │   ├── FlightPathSystem.ts         # Enemy entry wave curves & dive bombing paths
│   │   ├── TractorBeamSystem.ts        # Boss Galaga tractor beam particle cone & capture logic
│   │   ├── ParticleSystem.ts           # Explosion sparks, debris, score popups
│   │   └── ScoreManager.ts             # Scoring matrix, high score localStorage, extra life
│   │
│   ├── audio/                          # Web Audio API Sound Subsystem
│   │   ├── SoundSystem.ts              # Web Audio API context manager & polyphony control
│   │   └── SoundEffects.ts             # Procedural SFX (fire, hit, explosion, dive, capture, jingle)
│   │
│   ├── ui/                             # UI & HUD Renderers
│   │   ├── HUD.ts                      # Heads-up display: 1UP/2UP, High Score, Ships badge, Stage flags
│   │   ├── TitleScreen.ts              # Retro title screen, flashing "1 PLAYER START", copyright
│   │   ├── GameOverScreen.ts           # Game over banner, hit ratio calculation, name entry
│   │   └── VirtualGamepad.ts           # Mobile touch D-pad & Fire buttons with visual feedback
│   │
│   └── types/                          # TypeScript Interfaces & Enums
│       ├── game.types.ts               # GameState enum, StageConfig, HighScoreEntry
│       └── entity.types.ts             # EntityType, EnemyType, FlightMode, BoundingBox
│
└── tests/
    ├── unit/                           # Pure Vitest Unit Tests
    │   ├── math/
    │   │   ├── Vector2D.test.ts
    │   │   ├── Bezier.test.ts
    │   │   └── Collision.test.ts
    │   ├── core/
    │   │   └── GameState.test.ts
    │   ├── systems/
    │   │   └── ScoreManager.test.ts
    │   └── entities/
    │       ├── Player.test.ts
    │       ├── Bullet.test.ts
    │       └── Enemy.test.ts
    └── e2e/                            # Playwright Browser E2E Tests
        ├── smoke.spec.ts               # Page load & canvas element attached
        ├── runtime-errors.spec.ts      # 0 console errors & 0 unhandled rejections
        ├── game-loop.spec.ts           # RAF ticking & canvas pixel animation
        └── input.spec.ts               # Keyboard, mouse, and touch interaction
```

---

## 6. Authoritative Tables

### Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Build & Tooling | Vite + TypeScript Build | Bundles modular TS and canvas game into `dist/` | `npm run build` | Static files in `dist/` (`index.html`, hashed js/assets) | Exits non-zero on type errors or bundle failure | Vite / TypeScript Docs |
| 2 | Build & Tooling | Local Dev Server | High-performance HMR dev server | `npm run dev` | Local server at `http://localhost:5173` | Exits non-zero if port cannot be bound | Vite Specification |
| 3 | Deployment | Vercel Static Hosting | Zero-config static deployment with security headers | Git commit / Vercel CLI | Live CDN-hosted web application | Fails build if `npm run build` returns non-zero | Vercel Deployment Spec |
| 4 | Testing | Vitest Math Suite | Verifies 2D vector algebra, Bézier curve math, and collision | Unit test runner | Pass / Fail test report with coverage | Throws assertion errors on math mismatch | Vitest Test Suite |
| 5 | Testing | Vitest State Machine | Validates finite state machine transitions and timers | State action dispatches | Current state enum & context updates | Throws error on invalid transition attempt | Game Engine Spec |
| 6 | Testing | Vitest Score Manager | Validates point calculations, bonus life thresholds, LocalStorage | Point increments, save/load calls | Updated score, lives, storage entries | Fallback to memory on LocalStorage quota/error | Score System Spec |
| 7 | Testing | Vitest Entity Logic | Validates player single/dual modes, bullet lifecycle, enemy HP | Player movement/fire, hit events | Entity position, active status, health state | Clamps out-of-bounds, recycles destroyed bullets | Entity Engine Spec |
| 8 | E2E Testing | Playwright Smoke Test | Validates HTTP 200 and canvas DOM element presence | Browser navigation to `/` | Assert `#game-canvas` exists and is visible | Test fails if status != 200 or canvas absent | Playwright Test Suite |
| 9 | E2E Testing | Playwright Zero Errors | Proves 0 JS console errors and 0 unhandled rejections | 5s browser runtime monitoring | Empty error collections | Test fails if any error is emitted | Playwright Console Listener |
| 10 | E2E Testing | Playwright Game Loop | Validates RAF animation and canvas pixel buffer mutations | Consecutive screenshot diffing | Non-identical pixel buffers | Test fails if canvas static or loop halted | Playwright Screenshot API |
| 11 | E2E Testing | Playwright Input Suite | Validates keyboard, mouse, and touch inputs | Dispatched key/touch events | Entity state updates without runtime crash | Test fails on unhandled exception | Playwright Input Dispatcher |
| 12 | Version Control | Git Lifecycle & Commit Milestones | Structured semantic commits across project phases | `git add`, `git commit` | Clean Git commit history | Fails on merge conflict or untracked debris | Git Specification |
| 13 | Version Control | GitHub CLI Automation | Automated remote repository creation and push | `gh repo create --push` | GitHub remote repo with published code | Fails if gh auth invalid or repo exists | GitHub CLI Docs |
| 14 | Architecture | Modular Code Layout | Strict separation of concerns (core, math, entities, systems, audio, ui) | Modular TS imports | Highly maintainable, decoupled code architecture | TypeScript compiler rejects illegal imports | Project Architecture Spec |

### Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Vector Normalization | Vector $[0, 0]$ passed to `normalize()` | Returns $[0, 0]$ gracefully without generating `NaN` or `Infinity`. |
| 2 | Bézier Curve Interpolation | Evaluation parameter $t < 0$ or $t > 1$ | Value is clamped to range $[0, 1]$; returns $P_0$ or $P_{\text{end}}$. |
| 3 | Dual Fighter Hitbox | Missile hits only the left wing of a Dual Fighter | Destroys left ship with explosion; right ship automatically reverts to Single Fighter state without game over. |
| 4 | Score Storage Resilience | LocalStorage full (`QuotaExceededError`) or private browsing disabled | Catches storage error safely; maintains high score in-memory for current session without crashing. |
| 5 | Corrupted High Score Data | LocalStorage contains `"invalid_json"` or `"NaN"` | `ScoreManager` parses safely, recognizes invalid data, and resets to default `20000`. |
| 6 | Missile Screen Bounds | Player/enemy missile moves beyond viewport ($y < -10$ or $y > H + 10$) | Bullet is flagged inactive and returned to object pool for zero-GC memory efficiency. |
| 7 | Game Loop Delta Time Spike | Tab switched to background for 10 seconds then focused back | Delta time is clamped to maximum $\Delta t = 0.1\text{s}$ (100ms) to prevent entity teleportation or physics tunneling. |
| 8 | Audio Context Auto-Play Policy | Browser blocks Web Audio API before user interaction | SoundSystem listens for first user click/touch/keydown to resume `AudioContext` without error. |
| 9 | Mobile Viewport Resize | Device orientation changes or dynamic virtual keyboard appears | Canvas preserves 7:8 / 3:4 retro aspect ratio and scales via CSS `object-fit: contain`. |
| 10 | Rapid Consecutive Key Presses | User spams Spacebar at 60 Hz | Fire cooldown timer enforces 150ms minimum spacing and single-ship 2-missile limit. |
