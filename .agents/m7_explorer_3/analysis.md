# Milestone 7: Screens & Mobile Touch UX — Comprehensive Architectural Analysis & Implementation Specification

**Author**: m7_explorer_3 (Milestone 7: Screens & Mobile Touch UX Specialist)  
**Date**: 2026-09-02  
**Target Subsystems**: `src/ui/Screens.ts`, `src/ui/InputHandler.ts`, `index.html`, `src/core/Game.ts`, `src/types/index.ts`  
**Status**: Production-Ready Architectural Design & Technical Blueprint  

---

## 1. Executive Summary

Milestone 7 delivers the complete user-facing arcade experience and mobile responsiveness for the **Galaga Web Arcade** project. This specification details the design and production-ready implementation of:

1. **Title Screen & Attract Mode**: Multi-colored arcade `GALAGA` typography, 2.5Hz blinking start prompts (`PUSH START BUTTON` / `CLICK OR TOUCH TO START`), authentic Namco point value preview table with procedural alien sprite icons, and clear desktop/mobile controls guide.
2. **Stage Intro Banner**: Multi-layer sequenced intermission banner (`PLAYER ONE`, `STAGE XX` / `CHALLENGING STAGE`, `READY`) coordinated with warp starfield speed and procedural audio fanfares.
3. **Challenging Stage Intro & Results Screen**: Post-stage accuracy appraisal displaying `NUMBER OF HITS`, tiered bonus scoring (`100 PTS` per hit, or `SPECIAL BONUS 10000 PTS` for a perfect 40/40), and audio celebrations.
4. **Pause Overlay Screen**: Translucent arcade dimming backdrop with crisp pixel borders, `PAUSE` header, and keyboard/touch resume instructions.
5. **Game Over & Accuracy Summary Screen**: Classic `GAME OVER` title, persistent high score check, and authentic Namco accuracy appraisal (`SHOTS FIRED`, `NUMBER OF HITS`, `HIT-MISS RATIO: XX.X %`) with replay triggers.
6. **Responsive Mobile Touch UX & Virtual Controls**: Ergonomic virtual D-pad steering and prominent Fire button with multi-touch isolation, active visual depression feedback, and subtle device haptic feedback (`navigator.vibrate`) with total immunity against mobile gesture rubber-banding and pinch-zoom interference.

---

## 2. Screen Renderers Specification & Visual Layouts

The virtual resolution is fixed at $224 \times 288$ virtual pixels (3:4 portrait arcade aspect ratio). All screen rendering coordinates are calibrated to this virtual coordinate space and upscaled via CSS pixelated letterboxing.

### 2.1 Title Screen & Attract Mode Specification

```
+-------------------------------------------------------------+
| 1UP   00             HIGH SCORE  20000              2UP   00|  (y: 6 - 16)
|                                                             |
|                          G A L A G A                        |  (y: 54, 18px Bold)
|                      ARCADE WEB ENGINE                      |  (y: 74, Cyan 8px)
|                                                             |
|                    PUSH START BUTTON                        |  (y: 104, Yellow 8px)
|                CLICK OR TOUCH TO START                      |  (y: 118, Red 7px Blink)
|                                                             |
|                     -- POINT TABLE --                       |  (y: 144, Cyan 7px)
|               [ZAKO]   50 PTS     100 PTS                   |  (y: 160, Yellow 7px)
|               [GOEI]   80 PTS     160 PTS                   |  (y: 176, Yellow 7px)
|               [BOSS]  150 PTS     400 PTS                   |  (y: 192, Yellow 7px)
|               [DUAL]  1000 PTS RESCUE BONUS                 |  (y: 208, Green 7px)
|                                                             |
|          CONTROLS: [<- -> / A D] MOVE  [SPACE / Z] FIRE     |  (y: 236, Grey 6px)
|          PAUSE: [P / ESC]      MOBILE: VIRTUAL TOUCH        |  (y: 248, Grey 6px)
|                                                             |
|             (C) 1981 NAMCO BANDAI / WEB ADAPTATION          |  (y: 270, Dark Grey 6px)
+-------------------------------------------------------------+
```

#### Color Palette & Typography Table:
| Element | Color Hex | Font Size & Style | Animation / Behavior |
|---|---|---|---|
| **Top HUD Score** | `#FF0000` (Labels) / `#FFFFFF` (Values) | `8px monospace` | Static display of 1UP, High Score, 2UP |
| **GALAGA Main Logo** | `#FFFF00` (Body) / `#FF0000` (Accent) | `18px monospace`, bold | Centered, slight shadow offset for depth |
| **Subtitle** | `#00FFFF` (Cyan) | `8px monospace` | Static below logo |
| **Start Prompt 1** | `#FFFF00` (Yellow) | `8px monospace` | Blinking at 2.5Hz (toggle period: 400ms) |
| **Start Prompt 2** | `#FF3333` (Red) | `7px monospace` | Blinking synchronized with Start Prompt 1 |
| **Point Table Title** | `#00FFFF` (Cyan) | `7px monospace` | Centered header with dashed flanks |
| **Point Table Rows** | `#FFFFFF` / `#FFFF00` | `7px monospace` | Procedural sprite rendered at (x: 52) followed by text |
| **Controls Help** | `#AAAAAA` (Grey) | `6px monospace` | Key bindings and touch instruction |
| **Copyright Notice**| `#777777` (Muted) | `6px monospace` | Classic arcade footer attribution |

---

### 2.2 Stage Intro Banner Specification

When transitioning from `TITLE` to `STAGE_INTRO` or clearing a stage:
- **Duration**: $2.2$ seconds fixed.
- **Starfield Mode**: `WARP` speed ($6.5\times$ base speed) creating dynamic motion streaking.
- **Audio Fanfare**: `MusicJingles.playStageStartFanfare()` (Normal Stage) or `MusicJingles.playChallengingStageTheme()` (Challenging Stage).

```
+-------------------------------------------------------------+
| 1UP   00             HIGH SCORE  20000              2UP   00|
|                                                             |
|                                                             |
|                                                             |
|                         PLAYER ONE                          |  (y: 120, Cyan #00FFFF, 8px)
|                                                             |
|                          STAGE 01                           |  (y: 140, Yellow #FFFF00, 8px)
|                  (or CHALLENGING STAGE)                     |  (y: 140, Cyan #00FFFF, 8px)
|                                                             |
|                           READY                             |  (y: 160, Red #FF0000, 8px)
|                                                             |
|                                                             |
|                                                             |
|                                                    STAGE 1  |
+-------------------------------------------------------------+
```

---

### 2.3 Challenging Stage Intro & Results Screen Specification

Challenging stages occur at Stages 3, 7, 11, 15, 19, 23, 27, 31... ($\text{stage} \ge 3 \land \text{stage} \pmod 4 = 3$).

```
                      -- CHALLENGING STAGE RESULTS --

                      +-----------------------------+
                      |      CHALLENGING STAGE      |  (y: 100, Cyan #00FFFF, 8px)
                      |                             |
                      |     NUMBER OF HITS   38     |  (y: 130, Yellow #FFFF00, 8px)
                      |                             |
                      |       BONUS  3800 PTS       |  (y: 160, White #FFFFFF, 8px)
                      +-----------------------------+

                      -- PERFECT 40/40 RESULTS SCREEN --

                      +-----------------------------+
                      |      CHALLENGING STAGE      |  (y: 95, Cyan #00FFFF, 8px)
                      |                             |
                      |     NUMBER OF HITS   40     |  (y: 120, Yellow #FFFF00, 8px)
                      |                             |
                      |         PERFECT !!!         |  (y: 145, Green #00FF00, 10px Blink)
                      |                             |
                      |   SPECIAL BONUS 10000 PTS   |  (y: 170, Yellow #FFFF00, 8px)
                      +-----------------------------+
```

#### Challenging Stage Scoring Logic:
- **Hits < 40**: $\text{Bonus} = \text{Hits} \times 100\text{ PTS}$.
- **Hits = 40**: $\text{Bonus} = 10,000\text{ PTS}$ (Namco Special Bonus).
- **Audio Trigger**: If perfect 40/40, immediately trigger `MusicJingles.playBonusFanfare()`.

---

### 2.4 Pause Overlay Screen Specification

Activated when pressing `P`, `Escape`, or tapping a pause button during gameplay.

```
+-------------------------------------------------------------+
| 1UP  14250           HIGH SCORE  28400              2UP   00|
| .  .       .    .           .        .   .       .       .  |
|                                                             |
|        +-------------------------------------------+        |
|        |                                           |        |
|        |                   PAUSE                   |        |  (y: 128, Yellow #FFFF00, 14px)
|        |                                           |        |
|        |          PRESS P OR ESC TO RESUME         |        |  (y: 152, White #FFFFFF, 8px)
|        |           TOUCH SCREEN TO RESUME          |        |  (y: 168, Cyan #00FFFF, 7px)
|        |                                           |        |
|        +-------------------------------------------+        |
|                                                             |
| > >                                                STAGE 3  |
+-------------------------------------------------------------+
```

#### Visual Architecture:
- Dark translucent modal overlay: `ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'`.
- Pixel box border: `ctx.strokeStyle = '#00FFFF'`, line width 1px, centered at $w=180, h=70$.
- Starfield frozen: `starfield.setSpeedState('PAUSED')`.

---

### 2.5 Game Over Screen & Accuracy Breakdown Specification

Displayed upon losing all player lives.

```
+-------------------------------------------------------------+
| 1UP  18620           HIGH SCORE  35400              2UP   00|
|                                                             |
|                         GAME OVER                           |  (y: 80, Red #FF0000, 14px)
|                                                             |
|                     -- - RESULTS - --                       |  (y: 110, Cyan #00FFFF, 8px)
|                                                             |
|           SHOTS FIRED                 124                   |  (y: 135, Label: Yellow, Val: White)
|           NUMBER OF HITS               86                   |  (y: 155, Label: Yellow, Val: White)
|           HIT-MISS RATIO            69.3 %                  |  (y: 175, Label: Yellow, Val: Cyan)
|                                                             |
|                   * NEW HIGH SCORE *                        |  (y: 202, Yellow Blink if Record)
|                                                             |
|                PRESS FIRE OR ENTER TO RETRY                 |  (y: 230, Red #FF3333 7px Blink)
|                  CLICK OR TOUCH TO RESTART                  |  (y: 245, Cyan #00FFFF 6px)
|                                                             |
|                                                    STAGE 4  |
+-------------------------------------------------------------+
```

#### Accuracy Metric Formulation:
$$\text{Accuracy (\%)} = \begin{cases} 
0.0 & \text{if } \text{shotsFired} = 0 \\
\min\left(100.0, \frac{\text{hits}}{\text{shotsFired}} \times 100\right) & \text{if } \text{shotsFired} > 0
\end{cases}$$
Formatted with 1 decimal digit (`ratio.toFixed(1) + ' %'`).

---

## 3. Production-Ready Implementation: `src/ui/Screens.ts`

Here is the complete, typed, robust implementation for `src/ui/Screens.ts` following strict TypeScript 5.7+ standards:

```typescript
/**
 * Galaga Arcade Web Game — Master UI Screens Engine
 * 
 * Provides production-grade procedural rendering for:
 * 1. Title Screen & Attract Mode (Logo, Blinking CTA, Point Table, Controls Guide)
 * 2. Stage Intro Intermission (PLAYER ONE, STAGE XX, READY)
 * 3. Challenging Stage Intro & Bonus Results Screen
 * 4. Pause Overlay Screen
 * 5. Game Over Screen with Accuracy Summary (Shots Fired, Hits, Hit-Miss Ratio %)
 */

import { SpriteRenderer } from '../renderer/SpriteRenderer';
import { EnemyType } from '../types';

export interface ScreenRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  stateTimer: number;
  blinkTimer: number;
  score: number;
  highScore: number;
  stage: number;
  lives: number;
  shotsFired: number;
  hits: number;
  challengingHits?: number;
  isDual?: boolean;
}

export class Screens {
  private static readonly FONT_FAMILY = '"Press Start 2P", monospace, sans-serif';

  // ==========================================================================
  // 1. Title Screen & Attract Mode
  // ==========================================================================

  public static renderTitleScreen(context: ScreenRenderContext): void {
    const { ctx, width, height, blinkTimer, highScore } = context;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 1. Title Logo: Authentic Galaga Pixelated Typography
    this.renderGalagaLogo(ctx, width / 2, 54);

    // Subtitle
    ctx.font = `8px ${this.FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('ARCADE WEB ENGINE', width / 2, 74);

    // 2. Blinking Call-to-Action (2.5 Hz = 400ms cycle)
    const isBlinkOn = Math.floor(blinkTimer * 2.5) % 2 === 0;

    ctx.font = `8px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('PUSH START BUTTON', width / 2, 102);

    if (isBlinkOn) {
      ctx.font = `7px ${this.FONT_FAMILY}`;
      ctx.fillStyle = '#FF3333';
      ctx.fillText('CLICK OR TOUCH TO START', width / 2, 116);
    }

    // 3. Point Value Reference Table
    this.renderPointTable(ctx, width / 2, 138);

    // 4. Controls Quick Guide
    ctx.font = `6px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('KEYBOARD: [A/D] [<- ->]  FIRE: [SPACE/Z]', width / 2, 236);
    ctx.fillText('PAUSE: [P]   TOUCH: VIRTUAL D-PAD & FIRE', width / 2, 248);

    // 5. Copyright Attribution
    ctx.font = `6px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#666666';
    ctx.fillText('© 1981 NAMCO BANDAI / WEB ADAPTATION', width / 2, 272);

    ctx.restore();
  }

  private static renderGalagaLogo(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop shadow
    ctx.font = `bold 18px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#9E0000';
    ctx.fillText('GALAGA', centerX + 1, centerY + 2);

    // Primary vibrant yellow body with red highlight
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('GALAGA', centerX, centerY);

    ctx.restore();
  }

  private static renderPointTable(ctx: CanvasRenderingContext2D, centerX: number, startY: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `7px ${this.FONT_FAMILY}`;

    // Table Header
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('- POINT TABLE -', centerX, startY);

    const rowConfigs = [
      { type: EnemyType.ZAKO, text1: '50 PTS', text2: '100 PTS', color: '#FFFF00', y: startY + 18 },
      { type: EnemyType.GOEI, text1: '80 PTS', text2: '160 PTS', color: '#FFFF00', y: startY + 34 },
      { type: EnemyType.BOSS, text1: '150 PTS', text2: '400 PTS', color: '#FFFF00', y: startY + 50 },
    ];

    for (const row of rowConfigs) {
      // Draw sprite icon
      SpriteRenderer.drawEnemy(ctx, row.type, centerX - 64, row.y, 0, 2);

      // Draw point values
      ctx.textAlign = 'left';
      ctx.fillStyle = row.color;
      ctx.fillText(row.text1, centerX - 42, row.y);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(row.text2, centerX + 18, row.y);
    }

    // Dual Fighter Rescue Bonus Row
    const dualY = startY + 66;
    SpriteRenderer.draw(ctx, 'DUAL_FIGHTER', centerX - 64, dualY, { scale: 0.65 });
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00FF00';
    ctx.fillText('1000 PTS RESCUE', centerX - 42, dualY);

    ctx.restore();
  }

  // ==========================================================================
  // 2. Stage Intro Intermission
  // ==========================================================================

  public static renderStageIntro(context: ScreenRenderContext): void {
    const { ctx, width, height, stage } = context;
    const isChallenging = stage >= 3 && stage % 4 === 3;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // PLAYER ONE Banner
    ctx.font = `8px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('PLAYER ONE', width / 2, height / 2 - 18);

    // STAGE XX / CHALLENGING STAGE Banner
    if (isChallenging) {
      ctx.fillStyle = '#00FFFF';
      ctx.fillText('CHALLENGING STAGE', width / 2, height / 2);
    } else {
      ctx.fillStyle = '#FFFF00';
      ctx.fillText(`STAGE ${stage.toString().padStart(2, '0')}`, width / 2, height / 2);
    }

    // READY Banner
    ctx.fillStyle = '#FF0000';
    ctx.fillText('READY', width / 2, height / 2 + 18);

    ctx.restore();
  }

  // ==========================================================================
  // 3. Challenging Stage Results Screen
  // ==========================================================================

  public static renderChallengingResults(context: ScreenRenderContext): void {
    const { ctx, width, height, blinkTimer } = context;
    const hits = Math.max(0, Math.min(40, context.challengingHits ?? 0));
    const isPerfect = hits === 40;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.font = `8px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('CHALLENGING STAGE', width / 2, height / 2 - 36);

    // Hits summary
    ctx.fillStyle = '#FFFF00';
    ctx.fillText(`NUMBER OF HITS   ${hits.toString().padStart(2, ' ')}`, width / 2, height / 2 - 10);

    if (isPerfect) {
      // 40/40 Perfect score fanfare presentation
      const isBlinkOn = Math.floor(blinkTimer * 4) % 2 === 0;
      ctx.font = `10px ${this.FONT_FAMILY}`;
      ctx.fillStyle = isBlinkOn ? '#FFFF00' : '#00FF00';
      ctx.fillText('PERFECT !!!', width / 2, height / 2 + 14);

      ctx.font = `8px ${this.FONT_FAMILY}`;
      ctx.fillStyle = '#FFFF00';
      ctx.fillText('SPECIAL BONUS 10000 PTS', width / 2, height / 2 + 36);
    } else {
      // Standard hit bonus calculation: 100 pts per hit
      const bonus = hits * 100;
      ctx.font = `8px ${this.FONT_FAMILY}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`BONUS   ${bonus} PTS`, width / 2, height / 2 + 18);
    }

    ctx.restore();
  }

  // ==========================================================================
  // 4. Pause Overlay Screen
  // ==========================================================================

  public static renderPauseOverlay(context: ScreenRenderContext): void {
    const { ctx, width, height } = context;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Dark translucent backdrop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);

    // Central modal box with glowing arcade border
    const boxW = 184;
    const boxH = 74;
    const boxX = (width - boxW) / 2;
    const boxY = (height - boxH) / 2;

    ctx.fillStyle = 'rgba(10, 10, 24, 0.9)';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Text Content
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `12px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('PAUSE', width / 2, height / 2 - 12);

    ctx.font = `7px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('PRESS P OR ESC TO RESUME', width / 2, height / 2 + 10);

    ctx.font = `6px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('TOUCH SCREEN TO RESUME', width / 2, height / 2 + 24);

    ctx.restore();
  }

  // ==========================================================================
  // 5. Game Over & Accuracy Results Screen
  // ==========================================================================

  public static renderGameOver(context: ScreenRenderContext): void {
    const { ctx, width, height, stateTimer, blinkTimer, shotsFired, hits, score, highScore } = context;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. GAME OVER Title
    ctx.font = `14px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#FF0000';
    ctx.fillText('GAME OVER', width / 2, 78);

    // 2. Results Header
    ctx.font = `8px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('- RESULTS -', width / 2, 108);

    // 3. Accuracy Statistics Breakdown
    const safeShots = Math.max(0, shotsFired);
    const safeHits = Math.max(0, Math.min(safeShots, hits));
    const accuracyRatio = safeShots > 0 ? (safeHits / safeShots) * 100 : 0;

    const leftX = 28;
    const rightX = width - 28;

    ctx.font = `7px ${this.FONT_FAMILY}`;
    ctx.textAlign = 'left';

    // Shots Fired
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('SHOTS FIRED', leftX, 134);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(safeShots.toString(), rightX, 134);

    // Number of Hits
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('NUMBER OF HITS', leftX, 154);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(safeHits.toString(), rightX, 154);

    // Hit-Miss Ratio
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('HIT-MISS RATIO', leftX, 174);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText(`${accuracyRatio.toFixed(1)} %`, rightX, 174);

    // 4. High Score Celebration
    if (score >= highScore && score > 0) {
      const isRecordBlink = Math.floor(blinkTimer * 3) % 2 === 0;
      if (isRecordBlink) {
        ctx.textAlign = 'center';
        ctx.font = `8px ${this.FONT_FAMILY}`;
        ctx.fillStyle = '#FFFF00';
        ctx.fillText('* NEW HIGH SCORE *', width / 2, 202);
      }
    }

    // 5. Restart Action Prompt (Visible after 1.5s delay)
    if (stateTimer >= 1.5) {
      const isBlinkOn = Math.floor(blinkTimer * 2.5) % 2 === 0;
      if (isBlinkOn) {
        ctx.textAlign = 'center';
        ctx.font = `7px ${this.FONT_FAMILY}`;
        ctx.fillStyle = '#FF3333';
        ctx.fillText('PRESS FIRE OR ENTER TO RETRY', width / 2, 232);

        ctx.font = `6px ${this.FONT_FAMILY}`;
        ctx.fillStyle = '#00FFFF';
        ctx.fillText('CLICK OR TOUCH TO RESTART', width / 2, 246);
      }
    }

    ctx.restore();
  }
}
```

---

## 4. Responsive Mobile Touch UX & Haptic Controller Specification

### 4.1 Mobile Ergonomics & Multi-Touch Architecture

To provide an arcade-grade experience on mobile screens (smartphones, foldables, tablets), the controller adheres to three foundational rules:

1. **Dual Thumb Separation**: The left thumb steers without blocking the player craft ($X$-coordinate slider zone); the right thumb taps the fire button.
2. **Deterministic Gesture Lockdown**: Every touch listener enforces `{ passive: false }` and `e.preventDefault()`, eliminating browser overscroll, iOS navigation gestures, and zoom latency.
3. **Subtle Tactile Feedback (Web Vibration API)**: Provides subtle mechanical haptic feedback when firing weapons or tapping on-screen controls.

```
+-------------------------------------------------------------------+
|                     Canvas 2D Playfield Space                     |
|                                                                   |
|                             [ SHIP ]                              |
+-------------------------------------------------------------------+
| Mobile Virtual Touch Overlay (Bottom Area / Touch Action Layer)   |
|                                                                   |
|   +--------------------------+             +------------------+   |
|   |   [ < LEFT ]  [ RIGHT > ]|             |    ( ( FIRE ) )  |   |
|   |    Virtual D-Pad Zone    |             |  Virtual Button  |   |
|   +--------------------------+             +------------------+   |
+-------------------------------------------------------------------+
```

### 4.2 Haptic Feedback Engine (`src/ui/HapticController.ts`)

```typescript
export class HapticController {
  private static enabled: boolean = true;

  public static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  /**
   * Fires a tailored haptic vibration pulse.
   */
  public static trigger(type: 'tap' | 'fire' | 'hit' | 'explosion' | 'docking'): void {
    if (!this.enabled || !this.isSupported()) return;

    try {
      switch (type) {
        case 'tap':
          navigator.vibrate(8);
          break;
        case 'fire':
          navigator.vibrate(14);
          break;
        case 'hit':
          navigator.vibrate(22);
          break;
        case 'explosion':
          navigator.vibrate([30, 20, 45]);
          break;
        case 'docking':
          navigator.vibrate([15, 30, 15, 30, 25]);
          break;
      }
    } catch {
      // Silently fall back if platform restricts vibration permissions
    }
  }
}
```

### 4.3 Responsive CSS & DOM Virtual Control Overlay (`index.html`)

```css
/* Mobile Virtual Controls Overlay */
#touch-controls {
  display: none;
  position: absolute;
  bottom: 16px;
  left: 0;
  width: 100%;
  padding: 0 24px;
  box-sizing: border-box;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
  z-index: 25;
}

.touch-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border: 2px solid rgba(255, 255, 255, 0.35);
  color: #ffffff;
  border-radius: 50%;
  font-family: var(--font-arcade);
  font-size: 16px;
  user-select: none;
  touch-action: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
  transition: transform 0.08s cubic-bezier(0.2, 0, 0, 1), background-color 0.08s;
}

.touch-btn:active, .touch-btn.active {
  background: rgba(255, 42, 42, 0.65);
  border-color: #ff4444;
  transform: scale(0.90);
  box-shadow: 0 0 16px rgba(255, 42, 42, 0.8);
}

.dpad-container {
  display: flex;
  gap: 18px;
}

.dpad-btn {
  width: 62px;
  height: 62px;
}

.fire-btn {
  width: 76px;
  height: 76px;
  background: rgba(255, 42, 42, 0.35);
  border-color: rgba(255, 60, 60, 0.75);
  color: #ffdddd;
  font-size: 13px;
  letter-spacing: 1px;
}

/* Activate touch controls on touch-capable devices and screens <= 768px */
@media (hover: none) and (pointer: coarse), (max-width: 768px) {
  #touch-controls {
    display: flex;
  }
}
```

---

## 5. Accuracy & Statistics Pipeline Integration (`Game.ts` $\leftrightarrow$ `Screens.ts`)

To ensure accurate reporting on the Game Over screen:
1. `shotsFired` increments whenever the player fires a single missile or dual missiles ($+1$ per single, $+2$ per dual).
2. `hits` increments whenever an active player missile collides with an enemy or captured ship.
3. `challengingHits` tracks the number of destroyed enemies during the Challenging Stage ($0 \le \text{hits} \le 40$).

### Integration Hooks in `Game.ts`:
```typescript
// Inside Player Fire Handler:
this.player.onFire = (spawns) => {
  for (const s of spawns) {
    this.bulletManager.firePlayerBullet(s.x, s.y, this.player.isDual, Math.abs(s.vy));
    this.shotsFired += 1; // Increment global accuracy counter
  }
  // ...
};

// Inside resolveCollisions() bullet-enemy hit:
if (checkAABB(bulletBox, enemyBox)) {
  this.bulletManager.recycle(bullet);
  this.hits += 1; // Increment global accuracy hit counter

  if (this.state === 'CHALLENGING_STAGE') {
    this.challengingHits += 1; // Track challenging stage accuracy
  }
  // ...
}
```

---

## 6. Comprehensive Unit & E2E Testing Matrix

| Test Suite | File | Target Invariant / Verification |
|---|---|---|
| **Screens Suite** | `tests/unit/screens.test.ts` | Title Screen, Logo, Point Table, Stage Intro, Pause Overlay, Challenging Results, Game Over accuracy rendering. |
| **Accuracy Math** | `tests/unit/accuracy.test.ts` | Zero-shot division resilience ($0.0\%$), $100\%$ accuracy clamping, decimal precision formatting. |
| **Mobile Touch** | `tests/unit/touch_controls.test.ts` | Multi-touch identification, deadzone steering, discrete fire pulse consumption, haptic event trigger calls. |
| **E2E Playwright** | `tests/e2e/gameplay.test.ts` | Touch button clicks trigger game transitions without console errors or layout shift. |

---

## 7. Step-by-Step Implementation Roadmap for M7

1. **Step 1 (`src/ui/Screens.ts`)**: Implement the master `Screens` class containing static render methods (`renderTitleScreen`, `renderStageIntro`, `renderChallengingResults`, `renderPauseOverlay`, `renderGameOver`).
2. **Step 2 (`src/ui/HapticController.ts`)**: Create haptic vibration helper with platform capability detection.
3. **Step 3 (`src/core/Game.ts`)**:
   - Add `shotsFired`, `hits`, `challengingHits` tracking fields.
   - Refactor inline screen rendering functions to delegate to `Screens.renderTitleScreen()`, `Screens.renderStageIntro()`, `Screens.renderChallengingResults()`, `Screens.renderPauseOverlay()`, `Screens.renderGameOver()`.
4. **Step 4 (`src/ui/InputHandler.ts` & `index.html`)**: Connect DOM touch events with haptic feedback hooks (`HapticController.trigger('tap')` / `HapticController.trigger('fire')`).
5. **Step 5 (Unit & E2E Verification)**: Add unit tests in `tests/unit/screens.test.ts` and run `npm test` and `npm run typecheck` to confirm 100% test pass.

---
*End of Milestone 7 Analysis Report.*
