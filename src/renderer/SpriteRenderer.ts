/**
 * Galaga Arcade Web Game — Procedural Sprite Renderer & Offscreen Cache
 * 
 * Pre-bakes authentic 1981 Galaga arcade pixel art bit-matrices onto tiny
 * offscreen HTMLCanvasElements at startup for 60 FPS GPU-accelerated blitting
 * with zero runtime Garbage Collection allocations.
 */

import { EnemyType } from '../types';

// ============================================================================
// 1. Arcade Color Palette & Single-Character Code Map
// ============================================================================

export const PALETTE = {
  TRANSPARENT: 'rgba(0,0,0,0)',
  WHITE:        '#FFFFFF', // Player fuselage, starfield, Goei highlights
  RED:          '#E70000', // Player wingtips, Goei body, enemy bullets, Zako eyes
  RED_DARK:     '#9E0000', // Dark red shading, captured fighter engine
  BLUE_LIGHT:   '#5B93FF', // Cockpit glass, Wounded Boss, Goei abdomen, Zako trim
  BLUE_CYAN:    '#00FFFF', // Zako wings, UI badges, Goei accents
  BLUE_NAVY:    '#000088', // Carapace shadows, deep blue contours
  YELLOW:       '#FFFF00', // Zako body, Goei antennae/spots, Boss eyes
  ORANGE:       '#FF7F00', // Heavy enemy missiles, explosion embers
  GREEN:        '#00E700', // Healthy Boss Galaga carapace
  PINK_MAGENTA: '#FF007F', // Transform alien highlights, stage text
  GREY_LIGHT:   '#AAAAAA', // Metal accents, Boss horn tips
  GREY_DARK:    '#555555', // Outline shading, UI disabled
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

// --- Player & Weapon Matrices ---

export const PLAYER_FIGHTER_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','R','W','R','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','R','W','R','.','.','.','.','.','.'],
  ['.','.','.','.','.','W','W','W','W','W','.','.','.','.','.'],
  ['.','.','.','.','.','W','R','R','R','W','.','.','.','.','.'],
  ['.','.','.','.','W','W','R','R','R','W','W','.','.','.','.'],
  ['.','.','.','.','W','W','W','W','W','W','W','.','.','.','.'],
  ['.','W','.','.','W','B','B','W','B','B','W','.','.','W','.'],
  ['.','W','.','W','W','B','B','W','B','B','W','W','.','W','.'],
  ['.','W','W','W','W','W','W','W','W','W','W','W','W','W','.'],
  ['W','W','W','W','W','W','R','R','R','W','W','W','W','W','W'],
  ['W','R','R','W','W','W','R','R','R','W','W','W','R','R','W'],
  ['W','R','R','W','W','W','W','W','W','W','W','W','R','R','W'],
  ['W','W','W','W','.','.','R','R','R','.','.','W','W','W','W'],
  ['.','W','W','.','.','.','.','R','.','.','.','.','W','W','.']
];

export function createDualFighterMatrix(singleMatrix: string[][]): string[][] {
  const height = singleMatrix.length;
  const singleWidth = singleMatrix[0]?.length ?? 15;
  const dualMatrix: string[][] = [];

  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    const sourceRow = singleMatrix[r] ?? [];
    for (let c = 0; c < singleWidth; c++) {
      row.push(sourceRow[c] ?? '.');
    }
    const isWingRow = r >= 10 && r <= 13;
    row.push(isWingRow ? 'W' : '.');
    for (let c = 0; c < singleWidth; c++) {
      row.push(sourceRow[c] ?? '.');
    }
    dualMatrix.push(row);
  }
  return dualMatrix;
}

export const DUAL_FIGHTER_MATRIX: string[][] = createDualFighterMatrix(PLAYER_FIGHTER_MATRIX);

export const CAPTURED_FIGHTER_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','Y','R','Y','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','Y','R','Y','.','.','.','.','.','.'],
  ['.','.','.','.','.','R','R','R','R','R','.','.','.','.','.'],
  ['.','.','.','.','.','R','Y','Y','Y','R','.','.','.','.','.'],
  ['.','.','.','.','R','R','Y','Y','Y','R','R','.','.','.','.'],
  ['.','.','.','.','R','R','R','R','R','R','R','.','.','.','.'],
  ['.','R','.','.','R','Y','Y','R','Y','Y','R','.','.','R','.'],
  ['.','R','.','R','R','Y','Y','R','Y','Y','R','R','.','R','.'],
  ['.','R','R','R','R','R','R','R','R','R','R','R','R','R','.'],
  ['R','R','R','R','R','R','D','D','D','R','R','R','R','R','R'],
  ['R','Y','Y','R','R','R','D','D','D','R','R','R','Y','Y','R'],
  ['R','Y','Y','R','R','R','R','R','R','R','R','R','Y','Y','R'],
  ['R','R','R','R','.','.','D','D','D','.','.','R','R','R','R'],
  ['.','R','R','.','.','.','.','D','.','.','.','.','R','R','.']
];

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

export const ENEMY_BULLET_MATRIX: string[][] = [
  ['.','R','.'],
  ['R','Y','R'],
  ['R','Y','R'],
  ['R','Y','R'],
  ['R','Y','R'],
  ['.','R','.']
];

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

// --- Enemy Matrices ---

// Zako (Yellow/Red Bug) — 2 Frames (16x16)
export const ZAKO_FRAME_0_MATRIX: string[][] = [
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
];

export const ZAKO_FRAME_1_MATRIX: string[][] = [
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
];

// Goei (Red Butterfly) — 2 Frames (16x16)
export const GOEI_FRAME_0_MATRIX: string[][] = [
  ['.','.','.','.','.','.','Y','.','.','Y','.','.','.','.','.','.'],
  ['.','.','.','.','.','Y','Y','.','.','Y','Y','.','.','.','.','.'],
  ['.','.','.','.','.','R','R','R','R','R','R','.','.','.','.','.'],
  ['.','.','.','R','R','R','Y','Y','Y','Y','R','R','R','.','.','.'],
  ['.','R','R','R','R','B','B','B','B','B','B','R','R','R','R','.'],
  ['R','R','R','R','B','B','Y','Y','Y','Y','B','B','R','R','R','R'],
  ['R','R','R','R','B','B','Y','Y','Y','Y','B','B','R','R','R','R'],
  ['R','R','R','R','R','B','B','B','B','B','B','R','R','R','R','R'],
  ['.','R','R','R','R','R','R','B','B','R','R','R','R','R','R','.'],
  ['.','.','R','R','R','R','B','B','B','B','R','R','R','R','.','.'],
  ['.','.','.','R','R','B','Y','Y','Y','Y','B','R','R','.','.','.'],
  ['.','.','.','.','R','B','Y','R','R','Y','B','R','.','.','.','.'],
  ['.','.','.','.','.','B','Y','R','R','Y','B','.','.','.','.','.'],
  ['.','.','.','.','.','.','B','Y','Y','B','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','B','B','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.']
];

export const GOEI_FRAME_1_MATRIX: string[][] = [
  ['.','.','.','.','.','.','Y','.','.','Y','.','.','.','.','.','.'],
  ['.','.','.','.','.','Y','Y','.','.','Y','Y','.','.','.','.','.'],
  ['.','R','R','.','.','R','R','R','R','R','R','.','.','R','R','.'],
  ['.','R','R','R','R','R','Y','Y','Y','Y','R','R','R','R','R','.'],
  ['.','R','R','R','B','B','B','B','B','B','B','B','R','R','R','.'],
  ['.','.','R','R','B','B','Y','Y','Y','Y','B','B','R','R','.','.'],
  ['.','.','R','R','B','B','Y','Y','Y','Y','B','B','R','R','.','.'],
  ['.','.','R','R','R','B','B','B','B','B','B','R','R','R','.','.'],
  ['.','.','R','R','R','R','R','B','B','R','R','R','R','R','.','.'],
  ['.','.','.','R','R','R','B','B','B','B','R','R','R','.','.','.'],
  ['.','.','.','R','R','B','Y','Y','Y','Y','B','R','R','.','.','.'],
  ['.','.','.','.','R','B','Y','R','R','Y','B','R','.','.','.','.'],
  ['.','.','.','.','.','B','Y','R','R','Y','B','.','.','.','.','.'],
  ['.','.','.','.','.','.','B','Y','Y','B','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','B','B','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.']
];

// Boss Galaga Healthy (Green) — 2 Frames (16x16)
export const BOSS_HEALTHY_FRAME_0_MATRIX: string[][] = [
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
];

export const BOSS_HEALTHY_FRAME_1_MATRIX: string[][] = [
  ['.','.','.','.','.','.','G','G','G','G','.','.','.','.','.','.'],
  ['.','.','.','.','.','G','G','G','G','G','G','.','.','.','.','.'],
  ['.','.','.','.','G','G','B','B','B','B','G','G','.','.','.','.'],
  ['.','.','.','.','G','B','B','Y','Y','B','B','G','.','.','.','.'],
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
];

// Boss Galaga Damaged (Wounded Blue) — 2 Frames (16x16)
export const BOSS_DAMAGED_FRAME_0_MATRIX: string[][] = [
  ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
  ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
  ['.','.','.','.','B','B','R','R','R','R','B','B','.','.','.','.'],
  ['.','.','.','B','B','R','R','Y','Y','R','R','B','B','.','.','.'],
  ['.','.','B','B','B','R','Y','Y','Y','Y','R','B','B','B','.','.'],
  ['.','B','B','B','B','B','R','R','R','R','B','B','B','B','B','.'],
  ['B','B','R','R','B','B','B','B','B','B','B','B','R','R','B','B'],
  ['B','R','R','R','R','B','B','B','B','B','B','R','R','R','R','B'],
  ['B','R','R','R','R','R','R','R','R','R','R','R','R','R','R','B'],
  ['.','B','R','R','R','R','R','R','R','R','R','R','R','R','B','.'],
  ['.','.','B','B','R','R','R','R','R','R','R','R','B','B','.','.'],
  ['.','.','.','B','B','B','R','R','R','R','B','B','B','.','.','.'],
  ['.','.','.','.','B','B','B','B','B','B','B','B','.','.','.','.'],
  ['.','.','.','.','.','B','R','R','R','R','B','.','.','.','.','.'],
  ['.','.','.','.','.','B','R','.','.','R','B','.','.','.','.','.'],
  ['.','.','.','.','.','.','R','.','.','R','.','.','.','.','.','.']
];

export const BOSS_DAMAGED_FRAME_1_MATRIX: string[][] = [
  ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
  ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
  ['.','.','.','.','B','B','R','R','R','R','B','B','.','.','.','.'],
  ['.','.','.','.','B','R','R','Y','Y','R','R','B','.','.','.','.'],
  ['.','.','.','B','B','R','Y','Y','Y','Y','R','B','B','.','.','.'],
  ['.','.','B','B','B','B','R','R','R','R','B','B','B','B','.','.'],
  ['.','B','B','R','R','B','B','B','B','B','B','R','R','B','B','.'],
  ['B','B','R','R','R','R','B','B','B','B','R','R','R','R','B','B'],
  ['B','R','R','R','R','R','R','R','R','R','R','R','R','R','R','B'],
  ['.','B','R','R','R','R','R','R','R','R','R','R','R','R','B','.'],
  ['.','.','B','B','R','R','R','R','R','R','R','R','B','B','.','.'],
  ['.','.','.','B','B','B','R','R','R','R','B','B','B','.','.','.'],
  ['.','.','.','.','B','B','B','B','B','B','B','B','.','.','.','.'],
  ['.','.','.','.','.','B','R','R','R','R','B','.','.','.','.','.'],
  ['.','.','.','.','.','B','R','.','.','R','B','.','.','.','.','.'],
  ['.','.','.','.','.','.','R','.','.','R','.','.','.','.','.','.']
];

// Transform / Morphing Bonus Enemies (16x16)
export const TRANSFORM_SCORPION_FRAME_0_MATRIX: string[][] = [
  ['.','.','.','.','.','.','P','P','P','P','.','.','.','.','.','.'],
  ['.','.','.','.','P','P','P','Y','Y','P','P','P','.','.','.','.'],
  ['.','.','.','P','P','Y','Y','Y','Y','Y','Y','P','P','.','.','.'],
  ['.','.','P','P','Y','Y','R','Y','Y','R','Y','Y','P','P','.','.'],
  ['.','P','P','Y','Y','Y','R','Y','Y','R','Y','Y','Y','P','P','.'],
  ['P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P'],
  ['P','Y','Y','P','P','P','P','P','P','P','P','P','P','Y','Y','P'],
  ['P','Y','Y','P','P','Y','Y','Y','Y','Y','Y','P','P','Y','Y','P'],
  ['.','P','P','.','P','Y','R','R','R','R','Y','P','.','P','P','.'],
  ['.','.','.','.','P','Y','R','Y','Y','R','Y','P','.','.','.','.'],
  ['.','.','.','.','P','P','Y','R','R','Y','P','P','.','.','.','.'],
  ['.','.','.','.','.','P','P','Y','Y','P','P','.','.','.','.','.'],
  ['.','.','.','.','.','.','P','P','P','P','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','P','P','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','Y','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.']
];

export const TRANSFORM_SCORPION_FRAME_1_MATRIX: string[][] = [
  ['.','.','.','.','.','.','P','P','P','P','.','.','.','.','.','.'],
  ['.','.','.','.','P','P','P','Y','Y','P','P','P','.','.','.','.'],
  ['.','.','.','P','P','Y','Y','Y','Y','Y','Y','P','P','.','.','.'],
  ['.','.','P','P','Y','Y','R','Y','Y','R','Y','Y','P','P','.','.'],
  ['.','.','P','P','Y','Y','R','Y','Y','R','Y','Y','P','P','.','.'],
  ['.','P','P','P','P','P','P','P','P','P','P','P','P','P','P','.'],
  ['P','P','Y','Y','P','P','P','P','P','P','P','P','Y','Y','P','P'],
  ['P','Y','Y','P','P','Y','Y','Y','Y','Y','Y','P','P','Y','Y','P'],
  ['.','P','P','.','P','Y','R','R','R','R','Y','P','.','P','P','.'],
  ['.','.','.','.','P','Y','R','Y','Y','R','Y','P','.','.','.','.'],
  ['.','.','.','.','P','P','Y','R','R','Y','P','P','.','.','.','.'],
  ['.','.','.','.','.','P','P','Y','Y','P','P','.','.','.','.','.'],
  ['.','.','.','.','.','.','P','P','P','P','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','P','P','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','Y','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.']
];

export const TRANSFORM_BOSCONIAN_FRAME_0_MATRIX: string[][] = [
  ['.','.','.','.','.','.','W','W','W','W','.','.','.','.','.','.'],
  ['.','.','.','.','.','W','W','R','R','W','W','.','.','.','.','.'],
  ['.','.','.','.','W','W','R','R','R','R','W','W','.','.','.','.'],
  ['.','.','.','W','W','R','R','Y','Y','R','R','W','W','.','.','.'],
  ['.','.','W','W','R','R','Y','Y','Y','Y','R','R','W','W','.','.'],
  ['.','W','W','R','R','R','R','R','R','R','R','R','R','W','W','.'],
  ['W','W','R','R','R','R','G','G','G','G','R','R','R','R','W','W'],
  ['W','R','R','R','R','G','G','G','G','G','G','R','R','R','R','W'],
  ['W','R','R','R','R','G','G','G','G','G','G','R','R','R','R','W'],
  ['W','W','R','R','R','R','G','G','G','G','R','R','R','R','W','W'],
  ['.','W','W','R','R','R','R','R','R','R','R','R','R','W','W','.'],
  ['.','.','W','W','R','R','Y','Y','Y','Y','R','R','W','W','.','.'],
  ['.','.','.','W','W','R','R','Y','Y','R','R','W','W','.','.','.'],
  ['.','.','.','.','W','W','R','R','R','R','W','W','.','.','.','.'],
  ['.','.','.','.','.','W','W','R','R','W','W','.','.','.','.','.'],
  ['.','.','.','.','.','.','W','W','W','W','.','.','.','.','.','.']
];

export const TRANSFORM_GALAXIAN_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','Y','Y','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','Y','R','Y','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','Y','Y','R','Y','Y','.','.','.','.','.','.'],
  ['.','.','.','.','Y','Y','Y','R','Y','Y','Y','.','.','.','.','.'],
  ['.','.','.','Y','Y','Y','Y','R','Y','Y','Y','Y','.','.','.','.'],
  ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','.','.'],
  ['.','B','B','B','B','B','R','R','R','R','B','B','B','B','B','.'],
  ['B','B','B','B','B','R','R','R','R','R','R','B','B','B','B','B'],
  ['B','B','B','B','R','R','R','R','R','R','R','R','B','B','B','B'],
  ['B','B','B','R','R','R','R','R','R','R','R','R','R','B','B','B'],
  ['.','B','B','B','R','R','R','R','R','R','R','R','B','B','B','.'],
  ['.','.','B','B','B','R','R','.','.','R','R','B','B','B','.','.'],
  ['.','.','.','B','B','B','.','.','.','.','B','B','B','.','.','.'],
  ['.','.','.','.','B','B','.','.','.','.','.','B','B','.','.','.'],
  ['.','.','.','.','.','B','.','.','.','.','.','.','B','.','.','.']
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

    // 1. Register Player & Projectiles
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

    // 2. Register Enemy Hierarchies
    SpriteRenderer.registerDefinition({
      id: 'ZAKO',
      width: 16,
      height: 16,
      frames: [ZAKO_FRAME_0_MATRIX, ZAKO_FRAME_1_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'GOEI',
      width: 16,
      height: 16,
      frames: [GOEI_FRAME_0_MATRIX, GOEI_FRAME_1_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'BOSS_HEALTHY',
      width: 16,
      height: 16,
      frames: [BOSS_HEALTHY_FRAME_0_MATRIX, BOSS_HEALTHY_FRAME_1_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'BOSS_DAMAGED',
      width: 16,
      height: 16,
      frames: [BOSS_DAMAGED_FRAME_0_MATRIX, BOSS_DAMAGED_FRAME_1_MATRIX]
    });

    // 3. Register Transform Bonus Enemies
    SpriteRenderer.registerDefinition({
      id: 'TRANSFORM_SCORPION',
      width: 16,
      height: 16,
      frames: [TRANSFORM_SCORPION_FRAME_0_MATRIX, TRANSFORM_SCORPION_FRAME_1_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'TRANSFORM_BOSCONIAN',
      width: 16,
      height: 16,
      frames: [TRANSFORM_BOSCONIAN_FRAME_0_MATRIX]
    });

    SpriteRenderer.registerDefinition({
      id: 'TRANSFORM_GALAXIAN',
      width: 16,
      height: 16,
      frames: [TRANSFORM_GALAXIAN_MATRIX]
    });

    // 4. Pre-bake all registered definitions into offscreen canvases
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
      const destX = Math.round(x - originX);
      const destY = Math.round(y - originY);
      ctx.drawImage(cached, destX, destY);
      return;
    }

    // Transformed path: Matrix transformations
    ctx.save();
    if (alpha < 1.0) {
      ctx.globalAlpha = Math.max(0, Math.min(1.0, alpha));
    }

    ctx.translate(Math.round(x), Math.round(y));

    if (rotation !== 0) {
      ctx.rotate(rotation);
    }

    if (flipX || flipY || scale !== 1.0) {
      ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale);
    }

    ctx.drawImage(cached, -Math.round(originX), -Math.round(originY));
    ctx.restore();
  }

  /**
   * Helper to draw enemy by type, anim frame, damage state, and rotation.
   */
  public static drawEnemy(
    ctx: CanvasRenderingContext2D,
    type: EnemyType,
    x: number,
    y: number,
    animFrame: number = 0,
    health: number = 1,
    rotation: number = 0,
    alpha: number = 1.0
  ): void {
    let spriteId: string;

    switch (type) {
      case EnemyType.ZAKO:
        spriteId = 'ZAKO';
        break;
      case EnemyType.GOEI:
        spriteId = 'GOEI';
        break;
      case EnemyType.BOSS:
        spriteId = health > 1 ? 'BOSS_HEALTHY' : 'BOSS_DAMAGED';
        break;
      case EnemyType.CAPTURED_FIGHTER:
        spriteId = 'CAPTURED_FIGHTER';
        break;
      case EnemyType.TRANSFORM:
        spriteId = 'TRANSFORM_SCORPION';
        break;
      default:
        spriteId = 'ZAKO';
        break;
    }

    SpriteRenderer.draw(ctx, spriteId, x, y, {
      frame: animFrame % 2,
      rotation,
      alpha,
    });
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
