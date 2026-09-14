/**
 * Galaga Arcade Web Game — Heads-Up Display (HUD), Stage Badges & 8x8 Font System
 * 
 * Implements pixel-perfect 1981 Namco Galaga arcade HUD overlay on 224x288 virtual canvas:
 * 1. Top Header: '1UP' (blinking red), 1UP score (white), 'HIGH SCORE' (red), high score value (white).
 * 2. Bottom-Left: Reserve lives mini-fighter icons (max 5 displayed, 14px stride).
 * 3. Bottom-Right: Stage indicator badges (50/30/20/10/5/1) with mathematical greedy decomposition.
 * 4. Procedural 8x8 bitmap font atlas pre-baked across arcade palette colors with zero runtime GC allocations.
 */

import { PALETTE, PALETTE_CHAR_MAP, SpriteRenderer } from '../renderer/SpriteRenderer';

// ============================================================================
// 1. Data Contracts & State Interfaces
// ============================================================================

export interface HUDState {
  score: number;
  highScore: number;
  lives: number;
  stage: number;
  is1UpBlinking?: boolean;
  twoPlayerMode?: boolean;
  playerTwoScore?: number;
  stageBadges?: number[];
  specialEnergy?: number;
  isSpecialReady?: boolean;
  selectedSpecial?: string;
}

export type TextAlignment = 'left' | 'center' | 'right';

export interface DrawTextOptions {
  color?: string;
  align?: TextAlignment;
  scale?: number;
  spacing?: number;
  scramble?: boolean;
  scrambleRatio?: number;
  scrambleSeed?: number;
}

export enum BadgeType {
  FLAG_50 = 'FLAG_50',
  FLAG_30 = 'FLAG_30',
  FLAG_20 = 'FLAG_20',
  FLAG_10 = 'FLAG_10',
  FLAG_5  = 'FLAG_5',
  FLAG_1  = 'FLAG_1',
}

export interface BadgeDecomposition {
  stage: number;
  badges: BadgeType[];
  totalBadges: number;
  totalWidth: number;
}

export const BADGE_DIMENSIONS: Record<BadgeType, { width: number; height: number }> = {
  [BadgeType.FLAG_50]: { width: 10, height: 12 },
  [BadgeType.FLAG_30]: { width: 8,  height: 12 },
  [BadgeType.FLAG_20]: { width: 8,  height: 12 },
  [BadgeType.FLAG_10]: { width: 7,  height: 12 },
  [BadgeType.FLAG_5]:  { width: 5,  height: 10 },
  [BadgeType.FLAG_1]:  { width: 4,  height: 8  },
};

// ============================================================================
// 2. Procedural 8x8 Font Bitmaps (Namco Character PROM Equivalent)
// ============================================================================

export const ARCADE_FONT_BITMAPS: Record<string, number[]> = {
  // Numerals (0-9)
  '0': [0x3C, 0x66, 0x6E, 0x76, 0x66, 0x66, 0x3C, 0x00],
  '1': [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x7E, 0x00],
  '2': [0x3C, 0x66, 0x06, 0x0C, 0x18, 0x30, 0x7E, 0x00],
  '3': [0x3C, 0x66, 0x06, 0x1C, 0x06, 0x66, 0x3C, 0x00],
  '4': [0x0C, 0x1C, 0x34, 0x64, 0x7E, 0x04, 0x04, 0x00],
  '5': [0x7E, 0x60, 0x7C, 0x06, 0x06, 0x66, 0x3C, 0x00],
  '6': [0x1C, 0x30, 0x60, 0x7C, 0x66, 0x66, 0x3C, 0x00],
  '7': [0x7E, 0x66, 0x06, 0x0C, 0x18, 0x18, 0x18, 0x00],
  '8': [0x3C, 0x66, 0x66, 0x3C, 0x66, 0x66, 0x3C, 0x00],
  '9': [0x3C, 0x66, 0x66, 0x3E, 0x06, 0x0C, 0x38, 0x00],

  // Uppercase Alphabet (A-Z)
  'A': [0x3C, 0x66, 0x66, 0x7E, 0x66, 0x66, 0x66, 0x00],
  'B': [0x7C, 0x66, 0x66, 0x7C, 0x66, 0x66, 0x7C, 0x00],
  'C': [0x3C, 0x66, 0x60, 0x60, 0x60, 0x66, 0x3C, 0x00],
  'D': [0x78, 0x6C, 0x66, 0x66, 0x66, 0x6C, 0x78, 0x00],
  'E': [0x7E, 0x60, 0x60, 0x7C, 0x60, 0x60, 0x7E, 0x00],
  'F': [0x7E, 0x60, 0x60, 0x7C, 0x60, 0x60, 0x60, 0x00],
  'G': [0x3C, 0x66, 0x60, 0x6E, 0x66, 0x66, 0x3C, 0x00],
  'H': [0x66, 0x66, 0x66, 0x7E, 0x66, 0x66, 0x66, 0x00],
  'I': [0x3C, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3C, 0x00],
  'J': [0x1E, 0x06, 0x06, 0x06, 0x06, 0x66, 0x3C, 0x00],
  'K': [0x66, 0x6C, 0x78, 0x70, 0x78, 0x6C, 0x66, 0x00],
  'L': [0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x7E, 0x00],
  'M': [0x63, 0x77, 0x7F, 0x6B, 0x63, 0x63, 0x63, 0x00],
  'N': [0x66, 0x76, 0x7E, 0x7E, 0x6E, 0x66, 0x66, 0x00],
  'O': [0x3C, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00],
  'P': [0x7C, 0x66, 0x66, 0x7C, 0x60, 0x60, 0x60, 0x00],
  'Q': [0x3C, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x0E, 0x00],
  'R': [0x7C, 0x66, 0x66, 0x7C, 0x78, 0x6C, 0x66, 0x00],
  'S': [0x3C, 0x66, 0x60, 0x3C, 0x06, 0x66, 0x3C, 0x00],
  'T': [0x7E, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x00],
  'U': [0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00],
  'V': [0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x18, 0x00],
  'W': [0x63, 0x63, 0x63, 0x6B, 0x7F, 0x77, 0x63, 0x00],
  'X': [0x66, 0x66, 0x3C, 0x18, 0x3C, 0x66, 0x66, 0x00],
  'Y': [0x66, 0x66, 0x66, 0x3C, 0x18, 0x18, 0x18, 0x00],
  'Z': [0x7E, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x7E, 0x00],

  // Symbols & Punctuation
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '-': [0x00, 0x00, 0x00, 0x7E, 0x00, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00],
  ':': [0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00, 0x00],
  '!': [0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00],
  '?': [0x3C, 0x66, 0x06, 0x0C, 0x18, 0x00, 0x18, 0x00],
  '/': [0x02, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x40, 0x00],
  '%': [0x62, 0x64, 0x08, 0x10, 0x20, 0x26, 0x46, 0x00],
  '©': [0x3C, 0x42, 0x99, 0xA1, 0x99, 0x42, 0x3C, 0x00],
  '*': [0x00, 0x66, 0x3C, 0xFF, 0x3C, 0x66, 0x00, 0x00],
};

// ============================================================================
// 3. Stage Badge Procedural Pixel Bit-Matrices
// ============================================================================

export const BADGE_50_MATRIX: string[][] = [
  ['Y','R','R','R','R','R','R','R','R','.'],
  ['Y','R','R','R','R','R','R','R','R','.'],
  ['Y','R','R','B','W','W','B','R','R','.'],
  ['Y','R','R','W','B','B','W','R','R','.'],
  ['Y','R','R','W','B','B','W','R','R','.'],
  ['Y','R','R','B','W','W','B','R','R','.'],
  ['Y','R','R','R','R','R','R','R','R','.'],
  ['Y','R','R','R','R','R','R','R','R','.'],
  ['Y','.','.','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.','.','.']
];

export const BADGE_30_MATRIX: string[][] = [
  ['Y','R','R','R','W','W','W','.'],
  ['Y','R','R','R','W','W','W','.'],
  ['Y','R','R','R','W','W','W','.'],
  ['Y','R','R','R','W','W','W','.'],
  ['Y','R','R','R','W','W','W','.'],
  ['Y','R','R','R','W','W','W','.'],
  ['Y','.','.','.','.','.','.','.']
];

export const BADGE_20_MATRIX: string[][] = [
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.']
];

export const BADGE_10_MATRIX: string[][] = [
  ['Y','R','R','R','R','R','R'],
  ['Y','R','R','R','R','R','.'],
  ['Y','R','R','R','R','.','.'],
  ['Y','R','R','R','.','.','.'],
  ['Y','R','R','.','.','.','.'],
  ['Y','R','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.']
];

export const BADGE_5_MATRIX: string[][] = [
  ['.','.','Y','.','.'],
  ['.','Y','Y','Y','.'],
  ['Y','Y','R','Y','Y'],
  ['Y','R','R','R','Y'],
  ['Y','R','R','R','Y'],
  ['.','Y','R','Y','.'],
  ['.','.','Y','.','.']
];

export const BADGE_1_MATRIX: string[][] = [
  ['.','C','C','.'],
  ['C','W','W','C'],
  ['C','W','W','C'],
  ['C','B','B','C'],
  ['C','B','B','C'],
  ['.','B','B','.']
];

// ============================================================================
// 4. Primary HUD Subsystem Class
// ============================================================================

export class HUD {
  public static readonly VIRTUAL_WIDTH = 224;
  public static readonly VIRTUAL_HEIGHT = 288;
  public static readonly GLYPH_WIDTH = 8;
  public static readonly GLYPH_HEIGHT = 8;

  private static fontAtlases: Map<string, HTMLCanvasElement> = new Map();
  private static charIndexMap: Map<string, number> = new Map();
  private static badgeCanvases: Map<BadgeType, HTMLCanvasElement> = new Map();
  private static isInitialized: boolean = false;

  private blinkTimer: number = 0;

  constructor() {
    HUD.initialize();
  }

  // ==========================================================================
  // Initialization & Offscreen Texture Pre-Baking
  // ==========================================================================

  public static initialize(): void {
    if (HUD.isInitialized) return;

    // Index characters deterministically
    const chars = Object.keys(ARCADE_FONT_BITMAPS);
    chars.forEach((c, idx) => {
      HUD.charIndexMap.set(c, idx);
    });

    // 1. Pre-bake Font Atlases across arcade palette colors
    const colorsToBake = [
      PALETTE.WHITE,
      PALETTE.RED,
      PALETTE.YELLOW,
      PALETTE.BLUE_CYAN,
      PALETTE.GREEN,
      PALETTE.PINK_MAGENTA,
      PALETTE.BLUE_LIGHT,
      PALETTE.GREY_LIGHT,
      PALETTE.GREY_DARK,
    ];

    for (const color of colorsToBake) {
      const atlas = HUD.bakeFontAtlas(color);
      HUD.fontAtlases.set(color.toUpperCase(), atlas);
    }

    // 2. Pre-bake Stage Badges
    HUD.badgeCanvases.set(BadgeType.FLAG_50, HUD.bakeMatrix(10, 12, BADGE_50_MATRIX));
    HUD.badgeCanvases.set(BadgeType.FLAG_30, HUD.bakeMatrix(8,  12, BADGE_30_MATRIX));
    HUD.badgeCanvases.set(BadgeType.FLAG_20, HUD.bakeMatrix(8,  12, BADGE_20_MATRIX));
    HUD.badgeCanvases.set(BadgeType.FLAG_10, HUD.bakeMatrix(7,  12, BADGE_10_MATRIX));
    HUD.badgeCanvases.set(BadgeType.FLAG_5,  HUD.bakeMatrix(5,  10, BADGE_5_MATRIX));
    HUD.badgeCanvases.set(BadgeType.FLAG_1,  HUD.bakeMatrix(4,  8,  BADGE_1_MATRIX));

    HUD.isInitialized = true;
  }

  private static bakeFontAtlas(color: string): HTMLCanvasElement {
    const chars = Object.keys(ARCADE_FONT_BITMAPS);
    const width = chars.length * HUD.GLYPH_WIDTH;
    const height = HUD.GLYPH_HEIGHT;

    let canvas: HTMLCanvasElement;
    if (typeof document !== 'undefined' && document.createElement) {
      canvas = document.createElement('canvas');
    } else {
      canvas = {
        width,
        height,
        getContext: () => ({
          imageSmoothingEnabled: false,
          fillStyle: '',
          fillRect: () => {},
        }),
      } as unknown as HTMLCanvasElement;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext?.('2d') as CanvasRenderingContext2D | null;
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = color;

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (!ch) continue;
        const bytes = ARCADE_FONT_BITMAPS[ch];
        if (!bytes) continue;

        const offsetX = i * HUD.GLYPH_WIDTH;

        for (let row = 0; row < 8; row++) {
          const byte = bytes[row] ?? 0;
          for (let col = 0; col < 8; col++) {
            if ((byte & (1 << (7 - col))) !== 0) {
              ctx.fillRect(offsetX + col, row, 1, 1);
            }
          }
        }
      }
    }

    return canvas;
  }

  private static bakeMatrix(width: number, height: number, matrix: string[][]): HTMLCanvasElement {
    let canvas: HTMLCanvasElement;
    if (typeof document !== 'undefined' && document.createElement) {
      canvas = document.createElement('canvas');
    } else {
      canvas = {
        width,
        height,
        getContext: () => ({
          imageSmoothingEnabled: false,
          fillStyle: '',
          fillRect: () => {},
        }),
      } as unknown as HTMLCanvasElement;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext?.('2d') as CanvasRenderingContext2D | null;
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      for (let r = 0; r < height; r++) {
        const row = matrix[r];
        if (!row) continue;
        for (let c = 0; c < width; c++) {
          const char = row[c];
          if (char && char !== '.' && PALETTE_CHAR_MAP[char]) {
            ctx.fillStyle = PALETTE_CHAR_MAP[char] || PALETTE.WHITE;
            ctx.fillRect(c, r, 1, 1);
          }
        }
      }
    }

    return canvas;
  }

  // ==========================================================================
  // Fast Procedural Text Renderer
  // ==========================================================================

  public static drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    options?: DrawTextOptions
  ): void {
    if (!HUD.isInitialized) {
      HUD.initialize();
    }

    if (!text || text.length === 0) return;

    const color = (options?.color || PALETTE.WHITE).toUpperCase();
    const align = options?.align || 'left';
    const scale = options?.scale || 1;
    const spacing = options?.spacing !== undefined ? options.spacing : 0;

    let atlas = HUD.fontAtlases.get(color);
    if (!atlas) {
      atlas = HUD.bakeFontAtlas(color);
      HUD.fontAtlases.set(color, atlas);
    }

    const glyphW = HUD.GLYPH_WIDTH * scale;
    const glyphH = HUD.GLYPH_HEIGHT * scale;
    const stride = (HUD.GLYPH_WIDTH + spacing) * scale;
    const totalWidth = text.length * stride - spacing * scale;

    let startX = x;
    if (align === 'center') {
      startX = Math.round(x - totalWidth / 2);
    } else if (align === 'right') {
      startX = Math.round(x - totalWidth);
    }

    const upper = text.toUpperCase();
    const scramble = Boolean(options?.scramble);
    const scrambleRatio = options?.scrambleRatio ?? 0.5;
    const scrambleSeed = options?.scrambleSeed ?? 42;
    const HEX_CHARS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'] as const;

    for (let i = 0; i < upper.length; i++) {
      let ch = upper[i];
      if (!ch) continue;

      if (scramble && ch !== ' ') {
        const pseudoRand = (((scrambleSeed + i * 1013) * 9301 + 49297) % 233280) / 233280;
        if (pseudoRand < scrambleRatio) {
          const hexIdx = Math.floor(pseudoRand * 160) % 16;
          ch = HEX_CHARS[hexIdx]!;
        }
      }

      const glyphIndex = HUD.charIndexMap.get(ch);

      if (glyphIndex !== undefined && ch !== ' ') {
        const srcX = glyphIndex * HUD.GLYPH_WIDTH;
        const destX = Math.round(startX + i * stride);
        const destY = Math.round(y);

        if (ctx.drawImage) {
          ctx.drawImage(
            atlas,
            srcX,
            0,
            HUD.GLYPH_WIDTH,
            HUD.GLYPH_HEIGHT,
            destX,
            destY,
            glyphW,
            glyphH
          );
        }
      }
    }
  }

  // ==========================================================================
  // Public Update & Render Pipeline
  // ==========================================================================

  public update(dt: number): void {
    this.blinkTimer += dt;
  }

  public render(ctx: CanvasRenderingContext2D, state: HUDState): void {
    this.renderHeader(ctx, state);
    this.renderFooter(ctx, state);
  }

  // ==========================================================================
  // Top Header Renderer
  // ==========================================================================

  public renderHeader(ctx: CanvasRenderingContext2D, state: HUDState): void {
    const is1UpVisible = state.is1UpBlinking !== false
      ? Math.floor(this.blinkTimer * 4) % 2 === 0
      : true;

    // 1. 1UP Label (Red, Col 3..5, X=24, Y=2)
    if (is1UpVisible) {
      HUD.drawText(ctx, '1UP', 24, 2, { color: PALETTE.RED });
    }

    // 2. 1UP Score (White, Col 2..6, Right-aligned at X=56, Y=10)
    const scoreText = state.score === 0 ? '00' : state.score.toString();
    HUD.drawText(ctx, scoreText, 56, 10, { color: PALETTE.WHITE, align: 'right' });

    // 3. HIGH SCORE Label (Red, Col 9..18, Centered at X=112, Y=2)
    HUD.drawText(ctx, 'HIGH SCORE', 112, 2, { color: PALETTE.RED, align: 'center' });

    // 4. High Score Value (White, Col 11..17, Right-aligned under HIGH SCORE at X=136, Y=10)
    const highScoreText = Math.max(state.score, state.highScore).toString();
    HUD.drawText(ctx, highScoreText, 136, 10, { color: PALETTE.WHITE, align: 'right' });

    // 5. 2UP Section (Attract Mode / 2P Mode, Col 22..24, X=176, Y=2)
    if (state.twoPlayerMode) {
      HUD.drawText(ctx, '2UP', 176, 2, { color: PALETTE.BLUE_CYAN });
      const p2Text = (state.playerTwoScore ?? 0) === 0 ? '00' : (state.playerTwoScore ?? 0).toString();
      HUD.drawText(ctx, p2Text, 208, 10, { color: PALETTE.WHITE, align: 'right' });
    }
  }

  // ==========================================================================
  // Bottom Footer Renderer (Lives & Stage Badges)
  // ==========================================================================

  public renderFooter(ctx: CanvasRenderingContext2D, state: HUDState): void {
    this.renderLives(ctx, state.lives);
    this.renderStageBadges(ctx, state.stage);
    if (state.specialEnergy !== undefined) {
      this.renderSpecialGauge(ctx, state.specialEnergy, !!state.isSpecialReady, state.selectedSpecial);
    }
  }

  public renderSpecialGauge(
    ctx: CanvasRenderingContext2D,
    energy: number,
    isReady: boolean,
    selectedSpecial?: string
  ): void {
    const x = 86;
    const y = 278;
    const width = 54;
    const height = 6;

    ctx.save();

    // 1. Frame border & Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = isReady ? '#FFFF00' : '#AAAAAA';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1);

    // 2. Segmented Fill (10 segments, each 4px width + 1px gap)
    const fillPercent = Math.max(0, Math.min(100, energy)) / 100;
    const filledSegments = Math.floor(fillPercent * 10);
    const partialFraction = (fillPercent * 10) - filledSegments;

    for (let i = 0; i < 10; i++) {
      const segX = x + 1 + i * 5;
      const segY = y + 1;
      const segW = 4;
      const segH = height - 2;

      if (i < filledSegments) {
        if (isReady) {
          const flash = Math.floor(Date.now() / 125) % 2 === 0;
          ctx.fillStyle = flash ? '#FFFFFF' : '#FFFF00';
        } else if (i >= 5) {
          ctx.fillStyle = '#FFFF00';
        } else {
          ctx.fillStyle = '#00FFFF';
        }
        ctx.fillRect(segX, segY, segW, segH);
      } else if (i === filledSegments && partialFraction > 0.05) {
        ctx.fillStyle = i >= 5 ? '#FFFF00' : '#00FFFF';
        ctx.fillRect(segX, segY, segW * partialFraction, segH);
      }
    }

    // 3. Label / Banner above bar (avoids reserve lives collision at X=54..79)
    if (isReady) {
      const flash = Math.floor(Date.now() / 125) % 2 === 0;
      if (flash) {
        HUD.drawText(ctx, 'SP READY', x, y - 8, {
          color: PALETTE.YELLOW,
          spacing: 1,
        });
      }
    } else {
      const label = selectedSpecial === 'CHRONO_FREEZE' ? 'CF' : (selectedSpecial === 'WARP_RAM' ? 'WR' : 'SP');
      HUD.drawText(ctx, label, x, y - 8, {
        color: PALETTE.GREY_LIGHT,
        spacing: 1,
      });
    }

    ctx.restore();
  }

  public renderLives(ctx: CanvasRenderingContext2D, totalLives: number): void {
    const reserveLives = Math.max(0, Math.floor(totalLives) - 1);
    const displayedIcons = Math.min(5, reserveLives);
    const y = HUD.VIRTUAL_HEIGHT - 14;

    for (let i = 0; i < displayedIcons; i++) {
      const x = 12 + i * 14;
      SpriteRenderer.draw(ctx, 'PLAYER_LIFE_ICON', x, y, { anchorX: 0, anchorY: 0 });
    }
  }

  public renderStageBadges(ctx: CanvasRenderingContext2D, stage: number): void {
    const decomp = HUD.decomposeStage(stage);
    let rightX = HUD.VIRTUAL_WIDTH - 8;
    const y = HUD.VIRTUAL_HEIGHT - 14;

    // Draw from right to left (smallest to largest)
    for (let i = decomp.badges.length - 1; i >= 0; i--) {
      const badge = decomp.badges[i];
      if (!badge) continue;
      const baked = HUD.badgeCanvases.get(badge);
      if (!baked) continue;

      const dim = BADGE_DIMENSIONS[badge];
      const w = dim ? dim.width : 8;
      const x = rightX - w;

      if (x < 144) break; // Crowding protection against Special Moves Energy Gauge (ends at X=140)

      if (ctx.drawImage) {
        ctx.drawImage(baked, x, y);
      }
      rightX = x - 2; // 2px spacing between flags
    }
  }

  // ==========================================================================
  // Stage Decomposition Engine
  // ==========================================================================

  public static decomposeStage(stage: number): BadgeDecomposition {
    const safeStage = Number.isFinite(stage) && stage >= 1 ? Math.floor(stage) : 1;
    let rem = safeStage;
    const badges: BadgeType[] = [];

    const n50 = Math.floor(rem / 50); rem %= 50;
    for (let i = 0; i < n50; i++) badges.push(BadgeType.FLAG_50);

    const n30 = Math.floor(rem / 30); rem %= 30;
    for (let i = 0; i < n30; i++) badges.push(BadgeType.FLAG_30);

    const n20 = Math.floor(rem / 20); rem %= 20;
    for (let i = 0; i < n20; i++) badges.push(BadgeType.FLAG_20);

    const n10 = Math.floor(rem / 10); rem %= 10;
    for (let i = 0; i < n10; i++) badges.push(BadgeType.FLAG_10);

    const n5 = Math.floor(rem / 5); rem %= 5;
    for (let i = 0; i < n5; i++) badges.push(BadgeType.FLAG_5);

    for (let i = 0; i < rem; i++) {
      badges.push(BadgeType.FLAG_1);
    }

    let totalWidth = 0;
    for (let i = 0; i < badges.length; i++) {
      const b = badges[i];
      if (b && BADGE_DIMENSIONS[b]) {
        totalWidth += BADGE_DIMENSIONS[b].width + (i < badges.length - 1 ? 2 : 0);
      }
    }

    return {
      stage: safeStage,
      badges,
      totalBadges: badges.length,
      totalWidth,
    };
  }
}
