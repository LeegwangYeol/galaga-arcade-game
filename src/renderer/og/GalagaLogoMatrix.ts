/**
 * Galaga Arcade Web Game — Milestone M26
 * Authentic 1981 Namco "GALAGA" Logo Pixel Art Matrix
 * 
 * Recreates the iconic arcade cabinet marquee typography with:
 * - Red outer contour/border ('R')
 * - Brilliant white specular bevel highlights ('W')
 * - Vibrant arcade yellow core body fill ('Y')
 * - Warm orange lower gradient shading ('O')
 * - Crimson 3D drop-shadow extrusion ('D')
 */

import type { PixelBuffer } from './PixelBuffer';
import { OG_PALETTE } from './PixelBuffer';

// Letterforms (18 rows high)
const G_LETTER: string[] = [
  '..RRRRRRRRRR..',
  '.RWWWWWWWWWWR.',
  'RWWYYYYYYYYYWR',
  'RWYYRRRRRRRRR.',
  'RWYYR.........',
  'RWYYR.........',
  'RWYYR.........',
  'RWYYR...RRRRR.',
  'RWYYR...RYYYR.',
  'ROOOR...ROOOR.',
  'ROOOR...ROOOR.',
  'ROOOR...ROOOR.',
  'ROOORRRRROOOR.',
  'ROOOOOOOOOOOR.',
  '.ROOOOOOOOOR..',
  '..RRRRRRRRR...',
  '..............',
  '..............',
];

const A_LETTER: string[] = [
  '.....RRRR.....',
  '....RWWWWR....',
  '...RWWYYWWR...',
  '...RWYYYYWR...',
  '..RWYY..YYWR..',
  '..RWYY..YYWR..',
  '.RWYY....YYWR.',
  '.RWYY....YYWR.',
  '.RWYYYYYYYYWR.',
  'ROOYYYYYYYYOOR',
  'ROOORRRRRROOOR',
  'ROOOR....ROOOR',
  'ROOOR....ROOOR',
  'ROOOR....ROOOR',
  'RRRRR....RRRRR',
  '..............',
  '..............',
  '..............',
];

const L_LETTER: string[] = [
  '.RRRR.......',
  'RWWWWR......',
  'RWYYWR......',
  'RWYYR.......',
  'RWYYR.......',
  'RWYYR.......',
  'RWYYR.......',
  'RWYYR.......',
  'RWYYR.......',
  'ROOOR.......',
  'ROOOR.......',
  'ROOOR.......',
  'ROOORRRRRRR.',
  'ROOOOOOOOOOR',
  '.ROOOOOOOOOOR',
  '..RRRRRRRRRR',
  '............',
  '............',
];

const SPACE_2: string[] = [
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
];

/**
 * Combines G - A - L - A - G - A into a contiguous 2D string matrix.
 */
function buildGalagaLogoMatrix(): string[][] {
  const letters = [G_LETTER, SPACE_2, A_LETTER, SPACE_2, L_LETTER, SPACE_2, A_LETTER, SPACE_2, G_LETTER, SPACE_2, A_LETTER];
  const rows = 18;
  const matrix: string[][] = [];

  for (let r = 0; r < rows; r++) {
    const rowChars: string[] = [];
    for (const letter of letters) {
      const line = letter[r] ?? '';
      for (let c = 0; c < line.length; c++) {
        rowChars.push(line[c]!);
      }
    }
    matrix.push(rowChars);
  }

  return matrix;
}

export const GALAGA_LOGO_MATRIX: string[][] = buildGalagaLogoMatrix();

/**
 * Renders the GALAGA marquee logo with authentic 3D extrusion drop-shadow.
 */
export function drawGalagaLogo(
  buffer: PixelBuffer,
  destX: number,
  destY: number,
  scale: number = 6
): void {
  const shadowColor = OG_PALETTE['D']!; // Crimson #9E0000

  // 1. Render 3D extrusion layers from depth 6 down to 1
  for (let d = 8; d >= 1; d--) {
    const ox = Math.round((d * scale) / 6);
    const oy = Math.round((d * scale) / 5);

    const rows = GALAGA_LOGO_MATRIX.length;
    for (let r = 0; r < rows; r++) {
      const row = GALAGA_LOGO_MATRIX[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const char = row[c];
        if (!char || char === '.') continue;
        buffer.fillRect(
          destX + c * scale + ox,
          destY + r * scale + oy,
          scale,
          scale,
          shadowColor.r,
          shadowColor.g,
          shadowColor.b,
          255
        );
      }
    }
  }

  // 2. Render primary colored logo matrix on top
  buffer.drawMatrix(GALAGA_LOGO_MATRIX, destX, destY, scale, OG_PALETTE);
}
