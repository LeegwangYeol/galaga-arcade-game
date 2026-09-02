# Galaga Web Arcade — Canvas 2D & Web Audio Architecture Analysis

**Author**: survey_explorer_2 (Canvas 2D & Web Audio Architecture Specialist)  
**Date**: 2026-09-02  
**Target Platform**: HTML5 Canvas 2D / Web Audio API / TypeScript / Vite / Vercel  
**Status**: Comprehensive Survey & Architectural Specification  

---

## Executive Summary

This document establishes the architectural blueprint for the **Galaga Web Arcade** game engine, focusing specifically on:
1. **Canvas 2D 60 FPS Rendering Pipeline**: Virtual resolution scaling, procedural pixel-matrix sprite generation (0 external image assets), multi-layered parallax starfield simulation, and high-performance particle explosion systems.
2. **Pure Procedural Web Audio Synthesizer**: 100% code-synthesized 8-bit sound effects, jingles, and fanfares using the standard Web Audio API (0 audio file 404 risks, 0ms load delay), with robust browser autoplay unlocking.
3. **Responsive Multi-Input & Touch Controller**: Unified input abstraction supporting Keyboard, Mouse/Pointer tracking, and Mobile Touch virtual controls with zero scrolling jitter and coordinate transformation.
4. **Deterministic 60 FPS Game Loop & Memory Optimization**: Fixed-timestep accumulator physics loop (`16.6667ms`), spiral-of-death capping, and zero-allocation object pools eliminating Garbage Collection (GC) pauses.

---

## 1. Canvas 2D Engine & Rendering Pipeline

### 1.1 Fixed Virtual Resolution & Pixel-Art Scaling Architecture

Galaga originally operated on a portrait arcade CRT display with a native resolution of **224 × 288 pixels** (aspect ratio **3:4** / **7:9** approx). To achieve authentic arcade aesthetics while ensuring responsiveness across ultra-wide monitors, 4K displays, tablets, and smartphones, the engine implements a **Dual-Resolution Virtual Coordinate Pipeline**.

```
+-----------------------------------------------------------------------+
|  Browser Viewport (e.g. 1920x1080, 414x896 mobile, 2560x1440)         |
|                                                                       |
|        Pillarbox / Letterbox Margin (Black Background)               |
|       +-------------------------------------------------------+       |
|       |                                                       |       |
|       |   Scaled Display Canvas (e.g. 672 x 864 px, 3x integer)|       |
|       |   CSS: image-rendering: pixelated;                    |       |
|       |        touch-action: none;                            |       |
|       |   +-----------------------------------------------+   |       |
|       |   |                                               |   |       |
|       |   |  Internal Virtual Coordinate Space: 224 x 288 |   |       |
|       |   |  (Logical Canvas Buffer: 224 x 288 or 448x576) |   |       |
|       |   |  - Starfield layer (z: 0)                     |   |       |
|       |   |  - Particle layer (z: 1)                      |   |       |
|       |   |  - Enemy Formation / Dive layer (z: 2)        |   |       |
|       |   |  - Player / Dual Fighter layer (z: 3)         |   |       |
|       |   |  - Missiles & Enemy Bullets (z: 4)            |   |       |
|       |   |  - Tractor Beam FX layer (z: 5)               |   |       |
|       |   |  - HUD & Stage Badges layer (z: 6)            |   |       |
|       |   +-----------------------------------------------+   |       |
|       +-------------------------------------------------------+       |
+-----------------------------------------------------------------------+
```

#### Coordinate Transformation Specification
- **Internal Virtual Width ($W_v$)**: `224` px (or `448` px at 2x subpixel resolution for ultra-crisp bullet physics).
- **Internal Virtual Height ($H_v$)**: `288` px (or `576` px at 2x).
- **Aspect Ratio ($AR$)**: $224 / 288 \approx 0.7778$ ($3:4$ portrait standard).

```typescript
export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  virtualWidth: number;
  virtualHeight: number;
}

export class ScreenManager {
  public static readonly VIRTUAL_WIDTH = 224;
  public static readonly VIRTUAL_HEIGHT = 288;

  public static calculateTransform(windowWidth: number, windowHeight: number): ViewportTransform {
    const targetAspect = ScreenManager.VIRTUAL_WIDTH / ScreenManager.VIRTUAL_HEIGHT;
    const windowAspect = windowWidth / windowHeight;

    let displayWidth: number;
    let displayHeight: number;

    if (windowAspect < targetAspect) {
      // Screen is narrower than game aspect -> fit to width (Letterbox top/bottom)
      displayWidth = windowWidth;
      displayHeight = windowWidth / targetAspect;
    } else {
      // Screen is wider than game aspect -> fit to height (Pillarbox left/right)
      displayHeight = windowHeight;
      displayWidth = windowHeight * targetAspect;
    }

    const scale = displayWidth / ScreenManager.VIRTUAL_WIDTH;
    const offsetX = (windowWidth - displayWidth) / 2;
    const offsetY = (windowHeight - displayHeight) / 2;

    return {
      scale,
      offsetX,
      offsetY,
      displayWidth,
      displayHeight,
      virtualWidth: ScreenManager.VIRTUAL_WIDTH,
      virtualHeight: ScreenManager.VIRTUAL_HEIGHT,
    };
  }
}
```

#### Canvas CSS & Context Rendering Configuration
To prevent browser anti-aliasing blur and guarantee sharp pixel boundaries:
```css
#game-canvas {
  image-rendering: -moz-crisp-edges;
  image-rendering: -webkit-crisp-edges;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  user-select: none;
  touch-action: none;
  display: block;
  background-color: #000000;
}
```
In JavaScript/TypeScript:
```typescript
ctx.imageSmoothingEnabled = false;
```

---

### 1.2 Pure Procedural Pixel-Sprite Engine (Zero Asset Loading)

Instead of relying on external `.png` or `.svg` asset files which introduce HTTP 404 network failure points, CORS issues, and asset loading latency, all Galaga sprites are defined as **procedural 16x16 / 32x16 indexed pixel color matrices**.

At application boot, each sprite matrix is baked onto an individual offscreen `HTMLCanvasElement` or `ImageBitmap` via `OffscreenCanvas`. During runtime rendering, drawing a sprite requires only a single high-speed `ctx.drawImage()` call.

```
       Procedural Bit-Matrix               Offscreen Canvas Cache                 Runtime Draw
  [ [0,0,1,1,0,0], [0,1,2,2,1,0] ]  --->   [ Tiny 16x16 Canvas ]   --->  ctx.drawImage(cache, x, y)
       (Static Definition)                    (Baked at Init)                  (60 FPS Blit)
```

#### Palette Color Table
```typescript
export const PALETTE = {
  TRANSPARENT: 'rgba(0,0,0,0)',
  WHITE: '#FFFFFF',
  RED: '#E70000',
  BLUE_NAVY: '#000088',
  BLUE_CYAN: '#00FFFF',
  BLUE_LIGHT: '#5B93FF',
  YELLOW: '#FFFF00',
  ORANGE: '#FF7F00',
  GREEN: '#00E700',
  PINK_MAGENTA: '#FF007F',
  GREY_LIGHT: '#AAAAAA',
  GREY_DARK: '#555555',
  PURPLE: '#9900EE',
} as const;
```

#### Authentic Sprite Matrix Definitions (Sample Specification)

```typescript
export interface SpriteSheetDefinition {
  name: string;
  width: number;
  height: number;
  frames: string[][][]; // [frameIndex][row][col] -> Palette Color or '.' for transparent
}

export const SPRITE_DEFINITIONS: Record<string, SpriteSheetDefinition> = {
  // Player Fighter (Single Ship: 15x16)
  PLAYER_FIGHTER: {
    name: 'player_fighter',
    width: 15,
    height: 16,
    frames: [
      [
        ['.','.','.','.','.','.','.','W','.','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','.','W','.','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','R','W','R','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','R','W','R','.','.','.','.','.','.'],
        ['.','.','.','.','.','W','W','W','W','W','.','.','.','.','.'],
        ['.','.','.','.','.','W','R','R','R','W','.','.','.','.','.'],
        ['.','.','.','.','W','W','R','R','R','W','W','.','.','.','.'],
        ['.','.','.','.','W','W','W','W','W','W','W','.','.','.','.'],
        ['.','W','.','.','W','B','B','W','B','B','W','.','.','W','.'],
        ['.','W','.','W','W','B','B','W','B','B','W','W','.','W','.'],
        ['.','W','.','W','W','W','W','W','W','W','W','W','.','W','.'],
        ['W','W','W','W','W','R','R','R','R','R','W','W','W','W','W'],
        ['W','R','R','W','W','R','R','R','R','R','W','W','R','R','W'],
        ['W','R','R','W','W','W','W','W','W','W','W','W','R','R','W'],
        ['W','W','W','W','.','.','R','R','R','.','.','W','W','W','W'],
        ['.','W','W','.','.','.','R','.','R','.','.','.','W','W','.']
      ]
    ]
  },

  // Zako (Yellow/Blue Bee - 2 Animation Frames)
  ZAKO: {
    name: 'zako',
    width: 16,
    height: 16,
    frames: [
      // Frame 0: Wings Open
      [
        ['.','.','.','.','.','.','Y','Y','Y','Y','.','.','.','.','.','.'],
        ['.','.','.','.','.','Y','Y','Y','Y','Y','Y','.','.','.','.','.'],
        ['.','.','.','.','Y','Y','R','Y','Y','R','Y','Y','.','.','.','.'],
        ['.','.','.','Y','Y','Y','R','Y','Y','R','Y','Y','Y','.','.','.'],
        ['.','C','C','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','C','C','.'],
        ['C','C','C','C','Y','Y','Y','Y','Y','Y','Y','Y','C','C','C','C'],
        ['C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C'],
        ['C','C','.','C','C','C','B','B','B','B','C','C','C','.','C','C'],
        ['.','.','.','.','C','B','B','B','B','B','B','C','.','.','.','.'],
        ['.','.','.','.','.','B','Y','Y','Y','Y','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','Y','R','R','Y','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','Y','R','R','Y','B','.','.','.','.','.'],
        ['.','.','.','.','.','.','B','Y','Y','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','.','B','B','.','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.']
      ],
      // Frame 1: Wings Closed / Flapping
      [
        ['.','.','.','.','.','.','Y','Y','Y','Y','.','.','.','.','.','.'],
        ['.','.','.','.','.','Y','Y','Y','Y','Y','Y','.','.','.','.','.'],
        ['.','.','.','.','Y','Y','R','Y','Y','R','Y','Y','.','.','.','.'],
        ['.','.','.','Y','Y','Y','R','Y','Y','R','Y','Y','Y','.','.','.'],
        ['.','.','C','C','Y','Y','Y','Y','Y','Y','Y','Y','C','C','.','.'],
        ['.','C','C','C','C','Y','Y','Y','Y','Y','Y','C','C','C','C','.'],
        ['.','C','C','C','C','C','C','C','C','C','C','C','C','C','C','.'],
        ['.','.','C','C','C','C','B','B','B','B','C','C','C','C','.','.'],
        ['.','.','.','C','C','B','B','B','B','B','B','C','C','.','.','.'],
        ['.','.','.','.','.','B','Y','Y','Y','Y','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','Y','R','R','Y','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','Y','R','R','Y','B','.','.','.','.','.'],
        ['.','.','.','.','.','.','B','Y','Y','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','.','B','B','.','.','.','.','.','.','.'],
        ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.']
      ]
    ]
  },

  // Boss Galaga (Healthy Green/Blue, 2 Frames)
  BOSS_GALAGA: {
    name: 'boss_galaga',
    width: 16,
    height: 16,
    frames: [
      // Frame 0
      [
        ['.','.','.','.','.','.','G','G','G','G','.','.','.','.','.','.'],
        ['.','.','.','.','.','G','G','G','G','G','G','.','.','.','.','.'],
        ['.','.','.','.','G','G','B','B','B','B','G','G','.','.','.','.'],
        ['.','.','.','G','G','B','B','Y','Y','B','B','G','G','.','.','.'],
        ['.','.','G','G','G','B','Y','Y','Y','Y','B','G','G','G','.','.'],
        ['.','G','G','G','G','G','B','B','B','B','G','G','G','G','G','.'],
        ['G','G','B','B','G','G','G','G','G','G','G','G','B','B','G','G'],
        ['G','B','B','B','B','G','G','G','G','G','G','B','B','B','B','G'],
        ['G','B','B','B','B','B','B','B','B','B','B','B','B','B','B','G'],
        ['.','G','B','B','B','B','B','B','B','B','B','B','B','B','G','.'],
        ['.','.','G','G','B','B','B','B','B','B','B','B','G','G','.','.'],
        ['.','.','.','G','G','G','B','B','B','B','G','G','G','.','.','.'],
        ['.','.','.','.','G','G','G','G','G','G','G','G','.','.','.','.'],
        ['.','.','.','.','.','G','B','B','B','B','G','.','.','.','.','.'],
        ['.','.','.','.','.','G','B','.','.','B','G','.','.','.','.','.'],
        ['.','.','.','.','.','.','B','.','.','B','.','.','.','.','.','.']
      ],
      // Frame 1: Flap
      [
        ['.','.','.','.','.','.','G','G','G','G','.','.','.','.','.','.'],
        ['.','.','.','.','.','G','G','G','G','G','G','.','.','.','.','.'],
        ['.','.','.','.','G','G','B','B','B','B','G','G','.','.','.','.'],
        ['.','.','.','G','G','B','B','Y','Y','B','B','G','G','.','.','.'],
        ['.','.','.','G','G','B','Y','Y','Y','Y','B','G','G','.','.','.'],
        ['.','.','G','G','G','G','B','B','B','B','G','G','G','G','.','.'],
        ['.','G','G','B','B','G','G','G','G','G','G','B','B','G','G','.'],
        ['G','G','B','B','B','B','G','G','G','G','B','B','B','B','G','G'],
        ['G','B','B','B','B','B','B','B','B','B','B','B','B','B','B','G'],
        ['.','G','B','B','B','B','B','B','B','B','B','B','B','B','G','.'],
        ['.','.','G','G','B','B','B','B','B','B','B','B','G','G','.','.'],
        ['.','.','.','G','G','G','B','B','B','B','G','G','G','.','.','.'],
        ['.','.','.','.','G','G','G','G','G','G','G','G','.','.','.','.'],
        ['.','.','.','.','.','G','B','B','B','B','G','.','.','.','.','.'],
        ['.','.','.','.','.','G','B','.','.','B','G','.','.','.','.','.'],
        ['.','.','.','.','.','.','B','.','.','B','.','.','.','.','.','.']
      ]
    ]
  },

  // Player Missiles (3x8)
  PLAYER_MISSILE: {
    name: 'player_missile',
    width: 3,
    height: 8,
    frames: [
      [
        ['.','Y','.'],
        ['.','Y','.'],
        ['.','R','.'],
        ['.','R','.'],
        ['W','W','W'],
        ['W','W','W'],
        ['.','W','.'],
        ['.','W','.']
      ]
    ]
  },

  // Enemy Bullet (3x6)
  ENEMY_BULLET: {
    name: 'enemy_bullet',
    width: 3,
    height: 6,
    frames: [
      [
        ['.','R','.'],
        ['R','Y','R'],
        ['R','Y','R'],
        ['R','Y','R'],
        ['R','Y','R'],
        ['.','R','.']
      ]
    ]
  }
};
```

#### Sprite Baker Implementation
```typescript
export class SpriteRenderer {
  private static cache: Map<string, HTMLCanvasElement> = new Map();

  public static initialize(): void {
    const colorMap: Record<string, string> = {
      'W': PALETTE.WHITE,
      'R': PALETTE.RED,
      'B': PALETTE.BLUE_LIGHT,
      'C': PALETTE.BLUE_CYAN,
      'Y': PALETTE.YELLOW,
      'O': PALETTE.ORANGE,
      'G': PALETTE.GREEN,
      'P': PALETTE.PINK_MAGENTA,
      'U': PALETTE.PURPLE,
    };

    for (const [key, def] of Object.entries(SPRITE_DEFINITIONS)) {
      def.frames.forEach((frame, frameIdx) => {
        const offscreen = document.createElement('canvas');
        offscreen.width = def.width;
        offscreen.height = def.height;
        const ctx = offscreen.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;

        for (let r = 0; r < def.height; r++) {
          for (let c = 0; c < def.width; c++) {
            const char = frame[r]?.[c];
            if (char && char !== '.') {
              ctx.fillStyle = colorMap[char] || PALETTE.WHITE;
              ctx.fillRect(c, r, 1, 1);
            }
          }
        }

        const cacheKey = `${key}_${frameIdx}`;
        SpriteRenderer.cache.set(cacheKey, offscreen);
      });
    }
  }

  public static draw(
    ctx: CanvasRenderingContext2D,
    spriteKey: string,
    frameIndex: number,
    x: number,
    y: number,
    rotationRad: number = 0,
    flipX: boolean = false
  ): void {
    const key = `${spriteKey}_${frameIndex}`;
    const cached = SpriteRenderer.cache.get(key);
    if (!cached) return;

    if (rotationRad === 0 && !flipX) {
      // Fast path: No transform matrix overhead
      ctx.drawImage(cached, Math.floor(x - cached.width / 2), Math.floor(y - cached.height / 2));
    } else {
      // Rotated / flipped path
      ctx.save();
      ctx.translate(Math.floor(x), Math.floor(y));
      if (rotationRad !== 0) ctx.rotate(rotationRad);
      if (flipX) ctx.scale(-1, 1);
      ctx.drawImage(cached, -Math.floor(cached.width / 2), -Math.floor(cached.height / 2));
      ctx.restore();
    }
  }
}
```

---

### 1.3 Parallax Starfield Simulation System

Galaga features a dynamic, multi-colored scrolling starfield that breathes life into the black arcade void. The starfield responds to gameplay states (e.g., cruising speed during normal play, hyper-drive warp speed during stage introductions and alien dive bombing runs).

```
Layer 0 (Distant):    40 stars | Speed: 15 px/s | Size: 1px | Dim (Dark Blue / Grey)
Layer 1 (Mid-depth):  35 stars | Speed: 30 px/s | Size: 1px | Colors: Cyan, Yellow, Red
Layer 2 (Foreground): 25 stars | Speed: 60 px/s | Size: 1-2px| Bright White, Twinkling
```

#### Starfield Simulation Specification
```typescript
export interface Star {
  x: number;
  y: number;
  layer: number; // 0, 1, 2
  baseSpeed: number;
  colorIndex: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

export class Starfield {
  private stars: Star[] = [];
  private static readonly STAR_COUNT = 90;
  private static readonly COLORS = [
    '#FFFFFF', '#5B93FF', '#00FFFF', '#FFFF00', '#FF007F', '#FF7F00'
  ];
  private speedMultiplier: number = 1.0;
  private targetSpeedMultiplier: number = 1.0;

  constructor(virtualWidth: number, virtualHeight: number) {
    for (let i = 0; i < Starfield.STAR_COUNT; i++) {
      const layer = i < 40 ? 0 : i < 75 ? 1 : 2;
      const speed = layer === 0 ? 12 : layer === 1 ? 28 : 55;
      this.stars.push({
        x: Math.random() * virtualWidth,
        y: Math.random() * virtualHeight,
        layer,
        baseSpeed: speed + (Math.random() * 6 - 3),
        colorIndex: Math.floor(Math.random() * Starfield.COLORS.length),
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 2.0 + Math.random() * 4.0,
      });
    }
  }

  public setSpeedState(state: 'NORMAL' | 'DIVING' | 'WARP' | 'PAUSED'): void {
    switch (state) {
      case 'NORMAL': this.targetSpeedMultiplier = 1.0; break;
      case 'DIVING': this.targetSpeedMultiplier = 2.8; break;
      case 'WARP': this.targetSpeedMultiplier = 6.5; break;
      case 'PAUSED': this.targetSpeedMultiplier = 0.0; break;
    }
  }

  public update(dt: number, virtualHeight: number): void {
    // Smooth speed multiplier lerp
    this.speedMultiplier += (this.targetSpeedMultiplier - this.speedMultiplier) * Math.min(1.0, dt * 4.0);

    for (const star of this.stars) {
      star.y += star.baseSpeed * this.speedMultiplier * dt;
      star.twinklePhase += star.twinkleSpeed * dt;

      if (star.y >= virtualHeight) {
        star.y -= virtualHeight;
        star.x = Math.random() * ScreenManager.VIRTUAL_WIDTH;
      } else if (star.y < 0) {
        star.y += virtualHeight;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const star of this.stars) {
      const alpha = 0.4 + 0.6 * Math.sin(star.twinklePhase);
      if (alpha <= 0.1) continue;

      ctx.globalAlpha = Math.max(0.1, Math.min(1.0, alpha));
      ctx.fillStyle = Starfield.COLORS[star.colorIndex];
      const px = Math.floor(star.x);
      const py = Math.floor(star.y);

      if (star.layer === 2 && this.speedMultiplier > 3.0) {
        // Render motion blur streak when warping
        const streakLength = Math.min(8, Math.floor(this.speedMultiplier * 1.5));
        ctx.fillRect(px, py - streakLength, 1, streakLength);
      } else {
        ctx.fillRect(px, py, star.layer === 2 ? 2 : 1, star.layer === 2 ? 2 : 1);
      }
    }
    ctx.globalAlpha = 1.0;
  }
}
```

---

### 1.4 Arcade Particle Explosion Engine

Galaga features distinct explosion visual effects for small enemies, Boss Galaga, and player destruction.

```
       Enemy Hit                       Radial Expansion & Drag                     Fade & Dispersal
   +----------------+               +----------------------------+              +---------------------+
   | (x, y) Origin  |  -- t=0ms --> | 24 multi-colored sparks    | -- t=350ms-> | Alpha decay -> 0.0  |
   | Burst velocity |               | Drag factor = 0.94         |              | Return to pool      |
   +----------------+               +----------------------------+              +---------------------+
```

#### Particle System Data Structure & Pool
```typescript
export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private static readonly MAX_PARTICLES = 250;

  constructor() {
    for (let i = 0; i < ParticleSystem.MAX_PARTICLES; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        drag: 0.94,
        color: '#FFFFFF',
        size: 1,
        life: 0,
        maxLife: 1.0,
      });
    }
  }

  public spawnExplosion(x: number, y: number, type: 'SMALL' | 'BOSS' | 'PLAYER'): void {
    const count = type === 'PLAYER' ? 64 : type === 'BOSS' ? 42 : 20;
    const colors = type === 'PLAYER' 
      ? [PALETTE.WHITE, PALETTE.RED, PALETTE.BLUE_CYAN, PALETTE.YELLOW]
      : type === 'BOSS'
      ? [PALETTE.BLUE_LIGHT, PALETTE.GREEN, PALETTE.YELLOW, PALETTE.RED]
      : [PALETTE.YELLOW, PALETTE.RED, PALETTE.ORANGE, PALETTE.WHITE];

    for (let i = 0; i < count; i++) {
      const p = this.getFreeParticle();
      if (!p) break;

      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
      const speed = (type === 'PLAYER' ? 80 : 50) * (0.4 + Math.random() * 0.8);

      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.drag = 0.93 + Math.random() * 0.04;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.size = Math.random() > 0.6 ? 2 : 1;
      p.life = 0;
      p.maxLife = type === 'PLAYER' ? 0.75 : 0.45;
    }
  }

  private getFreeParticle(): Particle | null {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return null;
  }

  public update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      const progress = p.life / p.maxLife;
      const alpha = Math.max(0, 1 - progress);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1.0;
  }
}
```

---

## 2. Pure Procedural Web Audio Synthesizer

### 2.1 AudioContext Lifecycle, Autoplay Unlocking & Master Routing

Modern browsers strictly enforce Autoplay policies requiring user interaction (click, touch, or keypress) before audio playback is permitted.

```
       [ User Gesture: Click / Key / Touch ]
                         |
                         v
     +----------------------------------------+
     | AudioContext.resume() state -> running |
     +----------------------------------------+
                         |
      +------------------+--------------------+
      |                                       |
      v                                       v
[ SFX Sub-Bus Gain ]                 [ Music Sub-Bus Gain ]
 (Volume: 0.8)                        (Volume: 0.7)
      \                                       /
       \                                     /
        +----------------+------------------+
                         |
                         v
             [ Master Volume GainNode ]
                         |
                         v
              [ ctx.destination ]
```

```typescript
export class SoundEngine {
  private static ctx: AudioContext | null = null;
  private static masterGain: GainNode | null = null;
  private static sfxGain: GainNode | null = null;
  private static musicGain: GainNode | null = null;
  private static isMuted: boolean = false;
  private static isInitialized: boolean = false;

  public static getContext(): AudioContext {
    if (!SoundEngine.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      SoundEngine.ctx = new AudioCtxClass();

      SoundEngine.masterGain = SoundEngine.ctx.createGain();
      SoundEngine.masterGain.gain.setValueAtTime(0.7, SoundEngine.ctx.currentTime);
      SoundEngine.masterGain.connect(SoundEngine.ctx.destination);

      SoundEngine.sfxGain = SoundEngine.ctx.createGain();
      SoundEngine.sfxGain.gain.setValueAtTime(0.8, SoundEngine.ctx.currentTime);
      SoundEngine.sfxGain.connect(SoundEngine.masterGain);

      SoundEngine.musicGain = SoundEngine.ctx.createGain();
      SoundEngine.musicGain.gain.setValueAtTime(0.65, SoundEngine.ctx.currentTime);
      SoundEngine.musicGain.connect(SoundEngine.masterGain);
    }
    return SoundEngine.ctx;
  }

  public static unlock(): void {
    const ctx = SoundEngine.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        SoundEngine.isInitialized = true;
      });
    } else {
      SoundEngine.isInitialized = true;
    }
  }

  public static setMuted(muted: boolean): void {
    SoundEngine.isMuted = muted;
    if (SoundEngine.masterGain && SoundEngine.ctx) {
      SoundEngine.masterGain.gain.setValueAtTime(muted ? 0 : 0.7, SoundEngine.ctx.currentTime);
    }
  }
}
```

---

### 2.2 Procedural Sound FX Synthesis Specifications

Every Galaga arcade sound is synthesized in real-time with zero audio files:

| Sound FX Name | Synthesis Method | Waveform | Frequency Range / Envelope | Duration |
|---|---|---|---|---|
| **1. Laser Fire** | Exponential Frequency Chirp | Sawtooth / Triangle blend | 980 Hz $\rightarrow$ 140 Hz (Exponential) | 85 ms |
| **2. Alien Dive Squeal** | LFO Modulated Pitch Glide | Square / Saw | Carrier: 1100 Hz $\rightarrow$ 280 Hz, LFO: 18 Hz (Mod: $\pm 180$ Hz) | 700 ms |
| **3. Tractor Beam** | Dual Detuned Osc + Low-pass + Tremolo | Dual Square | Osc 1: 76 Hz, Osc 2: 82 Hz, LFO: 7 Hz AM, Filter: 350 Hz Resonant | Looping / 1.5s |
| **4. Enemy Explosion** | Filtered White Noise Burst | White Noise Buffer | Lowpass: 1600 Hz $\rightarrow$ 60 Hz, Res: Q=3, Decay: exp | 320 ms |
| **5. Player Explosion** | Heavy Low-End Noise + Sub-Bass Sweep | White Noise + Sine | Sine 180 Hz $\rightarrow$ 30 Hz + Noise lowpass 800 Hz $\rightarrow$ 30 Hz | 650 ms |
| **6. Stage Start Fanfare** | Multi-Voice Chiptune Arpeggio | Dual Square (50% pulse) | Note series: C5, G4, E4, C4, G3, C4, E4, G4, C5... | 3.2 s |
| **7. Challenging Stage** | Bouncy Staccato Sequence | Fast Square | Fast arpeggios: D5, F#5, A5, D6 (16th notes) | 4.0 s |
| **8. Dual Fighter Dock** | Ascending 4-tone Chord Chime | Triangle / Sine | E5 (659Hz) $\rightarrow$ G#5 (830Hz) $\rightarrow$ B5 (987Hz) $\rightarrow$ E6 (1318Hz) | 450 ms |
| **9. Game Over Jingle** | Melancholic Descending Sequence | Sawtooth / Square | F#4 $\rightarrow$ F4 $\rightarrow$ E4 $\rightarrow$ Eb4 $\rightarrow$ D4 $\rightarrow$ D2 (Bass thud) | 2.8 s |

#### Concrete Audio Graph Synthesizer Implementations

```typescript
export class GalagaAudioSynth {
  /**
   * 1. Player Laser Fire: Instant exponential downward sweep
   */
  public static playLaser(): void {
    const ctx = SoundEngine.getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.085);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(SoundEngine.getContext().destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * 2. Alien Dive Squeal / Warble: Frequency modulated downward dive
   */
  public static playAlienDive(): void {
    const ctx = SoundEngine.getContext();
    const now = ctx.currentTime;
    const duration = 0.65;

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const mainGain = ctx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(1100, now);
    carrier.frequency.exponentialRampToValueAtTime(260, now + duration);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(18, now); // 18Hz vibrato warble
    modGain.gain.setValueAtTime(160, now);

    mod.connect(carrier.frequency);

    mainGain.gain.setValueAtTime(0.25, now);
    mainGain.gain.linearRampToValueAtTime(0.3, now + 0.1);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    carrier.connect(mainGain);
    mainGain.connect(SoundEngine.getContext().destination);

    mod.start(now);
    carrier.start(now);
    mod.stop(now + duration);
    carrier.stop(now + duration);
  }

  /**
   * 3. Boss Galaga Tractor Beam: Pulsing low-frequency dual oscillation
   */
  public static playTractorBeam(): () => void {
    const ctx = SoundEngine.getContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const tremolo = ctx.createGain();
    const lfo = ctx.createOscillator();
    const masterSfx = ctx.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(76, now);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(82, now); // Detuned for sinister beat frequency

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, now);
    filter.Q.setValueAtTime(4.0, now);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(6.5, now); // 6.5 Hz pulsing

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.4, now);
    lfo.connect(lfoGain.gain);

    tremolo.gain.setValueAtTime(0.5, now);

    masterSfx.gain.setValueAtTime(0.3, now);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(tremolo);
    tremolo.connect(masterSfx);
    masterSfx.connect(SoundEngine.getContext().destination);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    // Returns stop callback for continuous beam control
    return () => {
      const stopTime = ctx.currentTime;
      masterSfx.gain.exponentialRampToValueAtTime(0.0001, stopTime + 0.1);
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          lfo.stop();
        } catch { /* ignored */ }
      }, 120);
    };
  }

  /**
   * 4. Explosion Sound: White noise burst with resonant low-pass sweep
   */
  public static playExplosion(isBoss: boolean = false): void {
    const ctx = SoundEngine.getContext();
    const now = ctx.currentTime;
    const duration = isBoss ? 0.6 : 0.35;

    // Generate 1-second white noise buffer
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBoss ? 2000 : 1400, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + duration);
    filter.Q.setValueAtTime(isBoss ? 5.0 : 3.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isBoss ? 0.6 : 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(SoundEngine.getContext().destination);

    whiteNoise.start(now);
  }

  /**
   * 5. Dual Fighter Docking Jingle: 4-note ascending chime
   */
  public static playDockingJingle(): void {
    const ctx = SoundEngine.getContext();
    const now = ctx.currentTime;
    const notes = [659.25, 830.61, 987.77, 1318.51]; // E5, G#5, B5, E6
    const stepDuration = 0.08;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteStart = now + idx * stepDuration;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteStart);

      gain.gain.setValueAtTime(0.3, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + stepDuration * 1.5);

      osc.connect(gain);
      gain.connect(SoundEngine.getContext().destination);

      osc.start(noteStart);
      osc.stop(noteStart + stepDuration * 1.6);
    });
  }

  /**
   * 6. Stage Start Fanfare: Multi-note 8-bit Namco Melodic Jingle
   */
  public static playStageStartFanfare(): void {
    const ctx = SoundEngine.getContext();
    const now = ctx.currentTime;

    // [frequency in Hz, duration in seconds]
    const melody: [number, number][] = [
      [523.25, 0.12], // C5
      [392.00, 0.12], // G4
      [329.63, 0.12], // E4
      [261.63, 0.12], // C4
      [196.00, 0.12], // G3
      [261.63, 0.12], // C4
      [329.63, 0.12], // E4
      [392.00, 0.12], // G4
      [523.25, 0.24], // C5
      [659.25, 0.12], // E5
      [783.99, 0.36], // G5
    ];

    let offset = 0;
    melody.forEach(([freq, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + offset;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, noteTime);

      // Snappy 8-bit envelope
      gain.gain.setValueAtTime(0.25, noteTime);
      gain.gain.setValueAtTime(0.22, noteTime + dur * 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + dur);

      osc.connect(gain);
      gain.connect(SoundEngine.getContext().destination);

      osc.start(noteTime);
      osc.stop(noteTime + dur + 0.02);

      offset += dur;
    });
  }
}
```

---

## 3. Responsive & Multi-Input System Architecture

### 3.1 Unified Input Manager

To support desktop keyboards, gaming mice, laptop trackpads, and mobile touchscreens without spaghetti code, the engine introduces a **Unified Input State Interface**.

```
  +------------------+   +--------------------+   +---------------------+
  | Keyboard Events  |   | Mouse / Pointer    |   | Touch Gesture Zone  |
  | (WASD, Arrows)   |   | (Horizontal track) |   | (Virtual D-Pad/Btn) |
  +------------------+   +--------------------+   +---------------------+
           \                       |                       /
            \                      v                      /
             +-------------------------------------------+
             |            Unified Input State            |
             |  - moveLeft: boolean   - fire: boolean    |
             |  - moveRight: boolean  - pause: boolean   |
             |  - targetVirtualX: number | null          |
             |  - start: boolean                         |
             +-------------------------------------------+
```

#### Input State Definition
```typescript
export interface InputState {
  moveLeft: boolean;
  moveRight: boolean;
  fire: boolean;
  pause: boolean;
  restart: boolean;
  directTargetX: number | null; // Virtual coordinate for mouse / touch drag
}
```

### 3.2 Keyboard Controller
Listens on `window` with automatic `preventDefault` on game keys:
- **Move Left**: `ArrowLeft`, `KeyA`
- **Move Right**: `ArrowRight`, `KeyD`
- **Fire**: `Space`, `KeyZ`, `KeyK`, `KeyJ`
- **Pause**: `KeyP`, `Escape`
- **Restart / Start**: `Enter`, `KeyR`

```typescript
export class KeyboardHandler {
  private state: InputState;
  private preventKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyK', 'KeyP']);

  constructor(state: InputState) {
    this.state = state;
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.preventKeys.has(e.code)) {
      e.preventDefault();
    }
    SoundEngine.unlock();

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.state.moveLeft = true;
        this.state.directTargetX = null;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.state.moveRight = true;
        this.state.directTargetX = null;
        break;
      case 'Space':
      case 'KeyZ':
      case 'KeyK':
      case 'KeyJ':
        this.state.fire = true;
        break;
      case 'KeyP':
      case 'Escape':
        this.state.pause = true;
        break;
      case 'Enter':
      case 'KeyR':
        this.state.restart = true;
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.state.moveLeft = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.state.moveRight = false;
        break;
      case 'Space':
      case 'KeyZ':
      case 'KeyK':
      case 'KeyJ':
        this.state.fire = false;
        break;
    }
  }
}
```

### 3.3 Mouse & Pointer Movement Mapping
Converts physical screen coordinate `clientX` into virtual game coordinate $X_v \in [0, 224]$:

$$X_v = \frac{\text{clientX} - \text{transform.offsetX}}{\text{transform.scale}}$$

```typescript
export class PointerHandler {
  constructor(canvas: HTMLCanvasElement, state: InputState, getTransform: () => ViewportTransform) {
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      SoundEngine.unlock();
      state.fire = true;
      this.updatePointerX(e, state, getTransform);
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.buttons > 0 || e.pointerType === 'mouse') {
        this.updatePointerX(e, state, getTransform);
      }
    });

    canvas.addEventListener('pointerup', () => {
      state.fire = false;
    });
  }

  private updatePointerX(e: PointerEvent, state: InputState, getTransform: () => ViewportTransform): void {
    const t = getTransform();
    const vx = (e.clientX - t.offsetX) / t.scale;
    state.directTargetX = Math.max(8, Math.min(ScreenManager.VIRTUAL_WIDTH - 8, vx));
  }
}
```

### 3.4 Mobile Touch Controller with Virtual Zones

On mobile devices, the bottom 30% of the screen is configured with two distinct touch modalities:
1. **Left/Right Touch Slider or Drag Zone**: Touching anywhere on the left/center tracks horizontal thumb position.
2. **Virtual Fire Button**: Large glowing circular touch button on the bottom right.
3. **Touch Event Lockdown**: All touch listeners register `{ passive: false }` with `e.preventDefault()` to eradicate mobile browser zoom, reload swipe, and iOS rubber-banding.

```
+-------------------------------------------------------------+
|                                                             |
|                   Active Game Playfield                     |
|                                                             |
+-------------------------------------------------------------+
| Mobile Virtual Control Layer (Bottom 30% of Viewport)       |
|  +-------------------------------+   +-------------------+  |
|  |  [< LEFT]      [RIGHT >]      |   |    ( ( FIRE ) )   |  |
|  |  Swipe / Drag Steering Zone   |   |   Virtual Button  |  |
|  +-------------------------------+   +-------------------+  |
+-------------------------------------------------------------+
```

```typescript
export class MobileTouchController {
  private touchIdMove: number | null = null;
  private touchIdFire: number | null = null;

  constructor(
    element: HTMLElement,
    state: InputState,
    getTransform: () => ViewportTransform
  ) {
    element.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      SoundEngine.unlock();

      const t = getTransform();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const clientX = touch.clientX;
        const clientY = touch.clientY;

        // Check if touch is on right 35% bottom area (Fire Button)
        if (clientX > window.innerWidth * 0.65 && clientY > window.innerHeight * 0.6) {
          this.touchIdFire = touch.identifier;
          state.fire = true;
        } else {
          // Movement Touch
          this.touchIdMove = touch.identifier;
          const vx = (clientX - t.offsetX) / t.scale;
          state.directTargetX = Math.max(8, Math.min(ScreenManager.VIRTUAL_WIDTH - 8, vx));
        }
      }
    }, { passive: false });

    element.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      const t = getTransform();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchIdMove) {
          const vx = (touch.clientX - t.offsetX) / t.scale;
          state.directTargetX = Math.max(8, Math.min(ScreenManager.VIRTUAL_WIDTH - 8, vx));
        }
      }
    }, { passive: false });

    element.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchIdFire) {
          this.touchIdFire = null;
          state.fire = false;
        }
        if (touch.identifier === this.touchIdMove) {
          this.touchIdMove = null;
        }
      }
    }, { passive: false });
  }
}
```

---

## 4. Performance & 60 FPS Stability Architecture

### 4.1 Fixed-Timestep Delta-Time Accumulator Loop

To ensure physics determinism (consistent bullet speeds, enemy dive trajectory speeds, and collision detection across 60Hz, 120Hz, and 144Hz monitors), the game engine uses a **Fixed Timestep Accumulator Pattern**.

```
   requestAnimationFrame(timestamp)
                |
                v
       dt = (timestamp - lastTime) / 1000
       dt = Math.min(dt, 0.1)  <-- Clamp Spiral of Death
       accumulator += dt
                |
                v
       while (accumulator >= 1/60s) {
           updatePhysicsAndAI(1/60s);
           accumulator -= 1/60s;
       }
                |
                v
       renderInterpolated(ctx);
```

#### Loop Implementation Specification
```typescript
export class GameLoop {
  private lastTime: number = 0;
  private accumulator: number = 0;
  private readonly FIXED_DT: number = 1 / 60; // 16.6667ms
  private isRunning: boolean = false;

  private onUpdate: (fixedDt: number) => void;
  private onRender: (interpolationAlpha: number) => void;

  constructor(
    onUpdate: (fixedDt: number) => void,
    onRender: (interpolationAlpha: number) => void
  ) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
  }

  public start(): void {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    requestAnimationFrame(this.tick.bind(this));
  }

  public stop(): void {
    this.isRunning = false;
  }

  private tick(currentTime: number): void {
    if (!this.isRunning) return;

    let frameTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Clamp frameTime to avoid "Spiral of Death" on background tab switch or lag spikes
    if (frameTime > 0.1) frameTime = 0.1;

    this.accumulator += frameTime;

    while (this.accumulator >= this.FIXED_DT) {
      this.onUpdate(this.FIXED_DT);
      this.accumulator -= this.FIXED_DT;
    }

    const alpha = this.accumulator / this.FIXED_DT;
    this.onRender(alpha);

    requestAnimationFrame(this.tick.bind(this));
  }
}
```

---

### 4.2 Zero-Allocation Object Pooling System

Creating objects (`new Bullet()`, `new Particle()`, `new Enemy()`) inside the 60fps tick triggers JavaScript engine garbage collection cycles every few seconds, causing micro-stutters and frame drops.

All transient game entities must be pooled in fixed pre-allocated memory buffers.

```typescript
export class ObjectPool<T extends { active: boolean }> {
  private pool: T[];
  private capacity: number;

  constructor(factory: () => T, capacity: number) {
    this.capacity = capacity;
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = factory();
      this.pool[i].active = false;
    }
  }

  public acquire(): T | null {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.pool[i].active) {
        this.pool[i].active = true;
        return this.pool[i];
      }
    }
    return null; // Pool exhausted, gracefully limit concurrent instances
  }

  public forEachActive(callback: (item: T) => void): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.pool[i].active) {
        callback(this.pool[i]);
      }
    }
  }

  public clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.pool[i].active = false;
    }
  }
}
```

#### Pool Sizing Budget
| Pool Name | Capacity | Allocation Memory | Lifecycle |
|---|---|---|---|
| `PlayerBulletPool` | 8 | ~1.2 KB | Instantiated at player fire, recycled on screen exit or enemy hit |
| `EnemyBulletPool` | 40 | ~4.8 KB | Instantiated on enemy dive shot, recycled on bottom screen exit |
| `ParticlePool` | 250 | ~35 KB | Instantiated on explosion bursts, recycled on life timeout |
| `StarPool` | 90 | ~12 KB | Pre-allocated once, continuously wrapped |

---

## 5. Summary Matrix & Integration Recommendations for Implementation

| Subsystem | Core Technical Choice | Key Rationale |
|---|---|---|
| **Virtual Resolution** | `224x288` (or `448x576`) Canvas with CSS letterboxing | True retro arcade aspect ratio, automatic device scaling, zero subpixel blur |
| **Graphics Asset Strategy** | 100% Procedural Pixel Matrices $\rightarrow$ Offscreen Canvas Caching | 0 HTTP network asset requests, 0ms load delay, perfect crisp retro pixels |
| **Starfield** | 3-Layer Parallax with Twinkle & Warp Streak | Creates cinematic arcade depth and visual sensation of speed |
| **Particle System** | Radial Velocity + Drag + Alpha Fade with Object Pool | Authentic explosive arcade juice without GC overhead |
| **Audio Synthesizer** | Pure Web Audio API (`OscillatorNode`, `BiquadFilter`, `GainNode`) | Zero audio file dependencies, instant sound triggers, exact retro chiptune pitch sweeps |
| **Audio Autoplay** | Unified interaction listener on `pointerdown`/`keydown`/`touchstart` | 100% compliance with iOS Safari / Chrome autoplay security policies |
| **Input Handling** | Unified `InputState` interface uniting Keyboard, Mouse, Touch | Cross-platform seamless controls with zero screen scroll interference |
| **Game Loop** | `requestAnimationFrame` + Fixed Timestep Accumulator (60Hz) | Deterministic physics across 60Hz, 120Hz, 144Hz high-refresh displays |
| **Memory Management** | Pre-allocated zero-allocation object pools | 0 Garbage Collection spikes, locked 60 FPS |

---
*End of Analysis Report.*
