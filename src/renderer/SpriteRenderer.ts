/**
 * Galaga Arcade Web Game — Procedural Sprite Renderer & Offscreen Cache
 * 
 * Pre-bakes authentic 1981 Galaga arcade pixel art bit-matrices onto tiny
 * offscreen HTMLCanvasElements at startup for 60 FPS GPU-accelerated blitting
 * with zero runtime Garbage Collection allocations.
 */

// ============================================================================
// 1. Arcade Color Palette & Single-Character Code Map
// ============================================================================

export const PALETTE = {
  TRANSPARENT: 'rgba(0,0,0,0)',
  WHITE:        '#FFFFFF', // Player fuselage, highlights, starfield
  RED:          '#E70000', // Player wingtips/engine, Goei body, enemy bullets
  RED_DARK:     '#9E0000', // Captured fighter shadow/shading
  BLUE_LIGHT:   '#5B93FF', // Player cockpit glass, Zako highlights
  BLUE_CYAN:    '#00FFFF', // 2UP text, Zako wings, UI badges
  BLUE_NAVY:    '#000088', // Zako carapace, hit Boss Galaga
  YELLOW:       '#FFFF00', // Player radar tip, missiles, Zako body, scores
  ORANGE:       '#FF7F00', // Enemy heavy missiles, explosion embers
  GREEN:        '#00E700', // Boss Galaga healthy state, Stage Clear text
  PINK_MAGENTA: '#FF007F', // Starfield, Stage intro text
  GREY_LIGHT:   '#AAAAAA', // Metal accents, copyright text
  GREY_DARK:    '#555555', // Shading, disabled UI
  PURPLE:       '#9900EE', // Warp trails, particle FX
} as const;

export type PaletteColorKey = keyof typeof PALETTE;

export const PALETTE_CHAR_MAP: Record<string, string> = {
  '.': PALETTE.TRANSPARENT,
  'W': PALETTE.WHITE,
  'R': PALETTE.RED,
  'D': PALETTE.RED_DARK,
  'B': PALETTE.BLUE_LIGHT,
  'C': PALETTE.BLUE_CYAN,
  'N': PALETTE.BLUE_NAVY,
  'Y': PALETTE.YELLOW,
  'O': PALETTE.ORANGE,
  'G': PALETTE.GREEN,
  'P': PALETTE.PINK_MAGENTA,
  'L': PALETTE.GREY_LIGHT,
  'K': PALETTE.GREY_DARK,
  'U': PALETTE.PURPLE,
};

// ============================================================================
// 2. Procedural Sprite Pixel Bit-Matrices
// ============================================================================

/**
 * Single Player Fighter (15x16)
 * Bilaterally symmetrical across column index 7.
 */
export const PLAYER_FIGHTER_MATRIX: string[][] = [
  // 012345678901234 (Columns 0..14)
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'], // Row 0: Yellow Nose Tip
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'], // Row 1: Yellow Antenna
  ['.','.','.','.','.','.','R','W','R','.','.','.','.','.','.'], // Row 2: Red nose accents
  ['.','.','.','.','.','.','R','W','R','.','.','.','.','.','.'], // Row 3: Red nose accents
  ['.','.','.','.','.','W','W','W','W','W','.','.','.','.','.'], // Row 4: Upper delta hull
  ['.','.','.','.','.','W','R','R','R','W','.','.','.','.','.'], // Row 5: Red chevron stripe
  ['.','.','.','.','W','W','R','R','R','W','W','.','.','.','.'], // Row 6: Expanding hull
  ['.','.','.','.','W','W','W','W','W','W','W','.','.','.','.'], // Row 7: Mid hull
  ['.','W','.','.','W','B','B','W','B','B','W','.','.','W','.'], // Row 8: Cannons & Blue Cockpit
  ['.','W','.','W','W','B','B','W','B','B','W','W','.','W','.'], // Row 9: Cannons & Blue Cockpit
  ['.','W','W','W','W','W','W','W','W','W','W','W','W','W','.'], // Row 10: Full wingspan
  ['W','W','W','W','W','W','R','R','R','W','W','W','W','W','W'], // Row 11: Main wing & Red Engine
  ['W','R','R','W','W','W','R','R','R','W','W','W','R','R','W'], // Row 12: Red wingtips
  ['W','R','R','W','W','W','W','W','W','W','W','W','R','R','W'], // Row 13: Red wingtips
  ['W','W','W','W','.','.','R','R','R','.','.','W','W','W','W'], // Row 14: Twin stabilizers
  ['.','W','W','.','.','.','.','R','.','.','.','.','W','W','.']  // Row 15: Tail fins & Thruster
];

/**
 * Constructs 31x16 Dual Fighter matrix by joining two single fighters side-by-side
 * with a 1px connected wing joint in the center.
 */
export function createDualFighterMatrix(singleMatrix: string[][]): string[][] {
  const height = singleMatrix.length;
  const singleWidth = singleMatrix[0]?.length ?? 15;
  const dualMatrix: string[][] = [];

  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    const sourceRow = singleMatrix[r] ?? [];
    // Left fighter (15 cols)
    for (let c = 0; c < singleWidth; c++) {
      row.push(sourceRow[c] ?? '.');
    }
    // Middle joint / spacer (1 col: connecting wing contact)
    const isWingRow = r >= 10 && r <= 13;
    row.push(isWingRow ? 'W' : '.');
    // Right fighter (15 cols)
    for (let c = 0; c < singleWidth; c++) {
      row.push(sourceRow[c] ?? '.');
    }
    dualMatrix.push(row);
  }
  return dualMatrix;
}

export const DUAL_FIGHTER_MATRIX: string[][] = createDualFighterMatrix(PLAYER_FIGHTER_MATRIX);

/**
 * Captured Red Fighter (15x16)
 * Red/Yellow hostile escort palette under Boss Galaga command.
 */
export const CAPTURED_FIGHTER_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'], // Row 0: Yellow Tip
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'], // Row 1: Yellow Antenna
  ['.','.','.','.','.','.','Y','R','Y','.','.','.','.','.','.'], // Row 2: Yellow trim, Red nose
  ['.','.','.','.','.','.','Y','R','Y','.','.','.','.','.','.'], // Row 3: Yellow trim, Red nose
  ['.','.','.','.','.','R','R','R','R','R','.','.','.','.','.'], // Row 4: Red upper hull
  ['.','.','.','.','.','R','Y','Y','Y','R','.','.','.','.','.'], // Row 5: Yellow chevron
  ['.','.','.','.','R','R','Y','Y','Y','R','R','.','.','.','.'], // Row 6: Red hull
  ['.','.','.','.','R','R','R','R','R','R','R','.','.','.','.'], // Row 7: Red mid-hull
  ['.','R','.','.','R','Y','Y','R','Y','Y','R','.','.','R','.'], // Row 8: Cannons & Yellow Cockpit
  ['.','R','.','R','R','Y','Y','R','Y','Y','R','R','.','R','.'], // Row 9: Cannons & Yellow Cockpit
  ['.','R','R','R','R','R','R','R','R','R','R','R','R','R','.'], // Row 10: Red wingspan
  ['R','R','R','R','R','R','D','D','D','R','R','R','R','R','R'], // Row 11: Red wing & Dark Engine
  ['R','Y','Y','R','R','R','D','D','D','R','R','R','Y','Y','R'], // Row 12: Yellow wingtips
  ['R','Y','Y','R','R','R','R','R','R','R','R','R','Y','Y','R'], // Row 13: Yellow wingtips
  ['R','R','R','R','.','.','D','D','D','.','.','R','R','R','R'], // Row 14: Stabilizers
  ['.','R','R','.','.','.','.','D','.','.','.','.','R','R','.']  // Row 15: Tail fins & Thruster
];

/**
 * Player Laser Missile (3x8)
 */
export const PLAYER_MISSILE_MATRIX: string[][] = [
  ['.','Y','.'],
  ['.','Y','.'],
  ['.','R','.'],
  ['.','R','.'],
  ['W','W','W'],
  ['W','W','W'],
  ['.','W','.'],
  ['.','W','.']
];

/**
 * Enemy Needle Bullet (3x6)
 */
export const ENEMY_BULLET_MATRIX: string[][] = [
  ['.','R','.'],
  ['R','Y','R'],
  ['R','Y','R'],
  ['R','Y','R'],
  ['R','Y','R'],
  ['.','R','.']
];

/**
 * Enemy Fast Beam (3x8)
 */
export const ENEMY_FAST_BEAM_MATRIX: string[][] = [
  ['.','O','.'],
  ['O','Y','O'],
  ['O','Y','O'],
  ['O','Y','O'],
  ['O','Y','O'],
  ['O','Y','O'],
  ['.','O','.'],
  ['.','O','.']
];

/**
 * Player HUD Life Icon (11x10)
 */
export const PLAYER_LIFE_ICON_MATRIX: string[][] = [
  ['.','.','.','.','.','Y','.','.','.','.','.'],
  ['.','.','.','.','R','W','R','.','.','.','.'],
  ['.','.','.','.','W','W','W','.','.','.','.'],
  ['.','.','.','W','B','W','B','W','.','.','.'],
  ['.','W','.','W','B','W','B','W','.','W','.'],
  ['.','W','W','W','W','W','W','W','W','W','.'],
  ['W','W','W','W','R','R','R','W','W','W','W'],
  ['W','R','R','W','R','R','R','W','R','R','W'],
  ['W','W','W','.','R','R','R','.','W','W','W'],
  ['.','W','.','.','.','R','.','.','.','W','.']
];

// ============================================================================
// 3. Sprite Definition & Rendering Engine
// ============================================================================

export interface SpriteDefinition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly frames: string[][][]; // [frameIndex][row][col]
}

export interface DrawOptions {
  frame?: number;
  rotation?: number;       // In radians
  scale?: number;          // Uniform scale multiplier (default 1.0)
  flipX?: boolean;         // Horizontal mirror
  flipY?: boolean;         // Vertical mirror
  alpha?: number;          // Opacity [0.0, 1.0]
  anchorX?: number;        // Normalized anchor (0.0=left, 0.5=center, 1.0=right)
  anchorY?: number;        // Normalized anchor (0.0=top, 0.5=center, 1.0=bottom)
  tintColor?: string;      // Optional override tint color
}

export class SpriteRenderer {
  private static cache: Map<string, HTMLCanvasElement> = new Map();
  private static definitions: Map<string, SpriteDefinition> = new Map();
  private static isInitialized: boolean = false;

  /**
   * Registers a procedural sprite definition into the catalog.
   */
  public static registerDefinition(def: SpriteDefinition): void {
    SpriteRenderer.definitions.set(def.id, def);
  }

  /**
   * Initializes and pre-bakes all procedural sprites onto offscreen canvases.
   */
  public static initialize(): void {
    if (SpriteRenderer.isInitialized) return;

    // 1. Register Core Sprites
    SpriteRenderer.registerDefinition({
      id: 'PLAYER_FIGHTER',
      width: 15,
      height: 16,
      frames: [PLAYER_FIGHTER_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'DUAL_FIGHTER',
      width: 31,
      height: 16,
      frames: [DUAL_FIGHTER_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'CAPTURED_FIGHTER',
      width: 15,
      height: 16,
      frames: [CAPTURED_FIGHTER_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'PLAYER_MISSILE',
      width: 3,
      height: 8,
      frames: [PLAYER_MISSILE_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'ENEMY_BULLET',
      width: 3,
      height: 6,
      frames: [ENEMY_BULLET_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'ENEMY_FAST_BEAM',
      width: 3,
      height: 8,
      frames: [ENEMY_FAST_BEAM_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'PLAYER_LIFE_ICON',
      width: 11,
      height: 10,
      frames: [PLAYER_LIFE_ICON_MATRIX]
    });

    // 2. Pre-bake all registered definitions into offscreen canvases
    for (const [id, def] of SpriteRenderer.definitions) {
      def.frames.forEach((frame, frameIdx) => {
        const bakedCanvas = SpriteRenderer.bakeFrame(def.width, def.height, frame);
        const cacheKey = SpriteRenderer.getCacheKey(id, frameIdx);
        SpriteRenderer.cache.set(cacheKey, bakedCanvas);
      });
    }

    SpriteRenderer.isInitialized = true;
  }

  /**
   * Renders a single matrix frame onto an offscreen canvas.
   */
  public static bakeFrame(width: number, height: number, frame: string[][]): HTMLCanvasElement {
    let canvas: HTMLCanvasElement;

    if (typeof document !== 'undefined' && document.createElement) {
      canvas = document.createElement('canvas');
    } else {
      // Mock canvas for Node/Vitest headless testing environments
      canvas = {
        width,
        height,
        getContext: () => ({
          imageSmoothingEnabled: false,
          fillStyle: '',
          fillRect: () => {},
          clearRect: () => {},
        }),
      } as unknown as HTMLCanvasElement;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext?.('2d') as CanvasRenderingContext2D | null;
    if (ctx) {
      ctx.imageSmoothingEnabled = false;

      for (let r = 0; r < height; r++) {
        const row = frame[r];
        if (!row) continue;
        for (let c = 0; c < width; c++) {
          const char = row[c];
          if (char && char !== '.') {
            ctx.fillStyle = PALETTE_CHAR_MAP[char] || PALETTE.WHITE;
            ctx.fillRect(c, r, 1, 1);
          }
        }
      }
    }

    return canvas;
  }

  /**
   * Primary high-throughput drawing function.
   * Employs fast-path execution to bypass save/restore matrices for untransformed sprites.
   */
  public static draw(
    ctx: CanvasRenderingContext2D,
    spriteId: string,
    x: number,
    y: number,
    options?: DrawOptions
  ): void {
    if (!SpriteRenderer.isInitialized) {
      SpriteRenderer.initialize();
    }

    const frameIndex = options?.frame ?? 0;
    const cacheKey = SpriteRenderer.getCacheKey(spriteId, frameIndex);
    let cached = SpriteRenderer.cache.get(cacheKey);

    if (!cached) {
      const def = SpriteRenderer.definitions.get(spriteId);
      if (def) {
        const frame = def.frames[frameIndex] ?? def.frames[0] ?? [];
        cached = SpriteRenderer.bakeFrame(def.width, def.height, frame);
        SpriteRenderer.cache.set(cacheKey, cached);
      } else {
        return;
      }
    }

    const rotation = options?.rotation ?? 0;
    const scale = options?.scale ?? 1.0;
    const flipX = options?.flipX ?? false;
    const flipY = options?.flipY ?? false;
    const alpha = options?.alpha ?? 1.0;
    const anchorX = options?.anchorX ?? 0.5;
    const anchorY = options?.anchorY ?? 0.5;

    const w = cached.width * scale;
    const h = cached.height * scale;
    const originX = w * anchorX;
    const originY = h * anchorY;

    // Fast-path: No rotation, scale 1.0, no flip, full opacity
    if (rotation === 0 && scale === 1.0 && !flipX && !flipY && alpha >= 0.999) {
      const destX = Math.floor(x - originX);
      const destY = Math.floor(y - originY);
      ctx.drawImage(cached, destX, destY);
      return;
    }

    // Transformed path: Matrix transformations
    ctx.save();
    if (alpha < 1.0) {
      ctx.globalAlpha = Math.max(0, Math.min(1.0, alpha));
    }

    ctx.translate(Math.floor(x), Math.floor(y));

    if (rotation !== 0) {
      ctx.rotate(rotation);
    }

    if (flipX || flipY || scale !== 1.0) {
      ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale);
    }

    ctx.drawImage(cached, -Math.floor(originX), -Math.floor(originY));
    ctx.restore();
  }

  /**
   * Generates a deterministic cache key.
   */
  public static getCacheKey(spriteId: string, frameIndex: number): string {
    return `${spriteId}_F${frameIndex}`;
  }

  /**
   * Retrieves dimensions of a registered sprite.
   */
  public static getDimensions(spriteId: string): { width: number; height: number } | null {
    if (!SpriteRenderer.isInitialized) {
      SpriteRenderer.initialize();
    }
    const def = SpriteRenderer.definitions.get(spriteId);
    if (!def) return null;
    return { width: def.width, height: def.height };
  }

  /**
   * Returns whether the sprite caching subsystem is ready.
   */
  public static isReady(): boolean {
    return SpriteRenderer.isInitialized;
  }

  /**
   * Clears the cache (useful for memory teardown in unit tests).
   */
  public static clear(): void {
    SpriteRenderer.cache.clear();
    SpriteRenderer.definitions.clear();
    SpriteRenderer.isInitialized = false;
  }
}
