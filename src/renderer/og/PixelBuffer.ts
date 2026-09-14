/**
 * Galaga Arcade Web Game — Milestone M26
 * Pure TypeScript 2D Software Rasterizer & Pixel Buffer
 * 
 * Provides an allocation-efficient, zero-dependency RGBA pixel buffer
 * for rendering high-resolution retro arcade compositions (1200x630 OG banner).
 */

import { ARCADE_FONT_BITMAPS } from '../../ui/HUD';

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface RGBAColor extends RGBColor {
  a: number;
}

export const OG_PALETTE: Record<string, RGBColor> = {
  W: { r: 255, g: 255, b: 255 }, // White
  R: { r: 231, g: 0,   b: 0   }, // Red
  D: { r: 158, g: 0,   b: 0   }, // Dark Red / Crimson
  B: { r: 91,  g: 147, b: 255 }, // Light Blue / Sky
  C: { r: 0,   g: 255, b: 255 }, // Cyan
  N: { r: 0,   g: 0,   b: 136 }, // Navy Blue
  Y: { r: 255, g: 255, b: 0   }, // Yellow
  O: { r: 255, g: 127, b: 0   }, // Orange
  G: { r: 0,   g: 231, b: 0   }, // Green
  P: { r: 255, g: 0,   b: 127 }, // Pink / Magenta
  L: { r: 170, g: 170, b: 170 }, // Light Grey
  K: { r: 85,  g: 85,  b: 85  }, // Dark Grey
  U: { r: 153, g: 0,   b: 238 }, // Purple
};

export class PixelBuffer {
  public readonly width: number;
  public readonly height: number;
  public readonly data: Uint8ClampedArray; // RGBA byte array: 4 bytes per pixel

  constructor(width: number = 1200, height: number = 630) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /**
   * Sets a single pixel with Porter-Duff source-over alpha blending.
   */
  public setPixel(x: number, y: number, r: number, g: number, b: number, a: number = 255): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || a <= 0) return;
    const idx = (y * this.width + x) * 4;

    if (a >= 255) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = 255;
    } else {
      const sa = a / 255;
      const da = (this.data[idx + 3] ?? 0) / 255;
      const outA = sa + da * (1 - sa);

      if (outA > 0) {
        this.data[idx] = Math.round((r * sa + (this.data[idx] ?? 0) * da * (1 - sa)) / outA);
        this.data[idx + 1] = Math.round((g * sa + (this.data[idx + 1] ?? 0) * da * (1 - sa)) / outA);
        this.data[idx + 2] = Math.round((b * sa + (this.data[idx + 2] ?? 0) * da * (1 - sa)) / outA);
        this.data[idx + 3] = Math.round(outA * 255);
      }
    }
  }

  /**
   * Fills an axis-aligned rectangular region.
   */
  public fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number = 255
  ): void {
    const x0 = Math.max(0, Math.floor(x));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y0 = Math.max(0, Math.floor(y));
    const y1 = Math.min(this.height, Math.floor(y + h));

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPixel(px, py, r, g, b, a);
      }
    }
  }

  /**
   * Renders a 2D string matrix of sprite pixels at integer scale.
   */
  public drawMatrix(
    matrix: string[][],
    destX: number,
    destY: number,
    scale: number,
    paletteMap: Record<string, RGBColor> = OG_PALETTE
  ): void {
    const rows = matrix.length;
    for (let r = 0; r < rows; r++) {
      const row = matrix[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const char = row[c];
        if (!char || char === '.') continue;
        const color = paletteMap[char];
        if (color) {
          this.fillRect(
            destX + c * scale,
            destY + r * scale,
            scale,
            scale,
            color.r,
            color.g,
            color.b,
            255
          );
        }
      }
    }
  }

  /**
   * Renders a vertical trapezoid with smooth vertical color & alpha interpolation.
   * Ideal for the authentic Boss Galaga tractor beam cone.
   */
  public drawTrapezoidGradient(
    centerX: number,
    topY: number,
    bottomY: number,
    topHalfW: number,
    bottomHalfW: number,
    topColor: RGBAColor,
    bottomColor: RGBAColor
  ): void {
    const totalH = bottomY - topY;
    if (totalH <= 0) return;

    for (let y = topY; y <= bottomY; y++) {
      const t = (y - topY) / totalH;
      const halfW = Math.round(topHalfW + t * (bottomHalfW - topHalfW));
      const r = Math.round(topColor.r + t * (bottomColor.r - topColor.r));
      const g = Math.round(topColor.g + t * (bottomColor.g - topColor.g));
      const b = Math.round(topColor.b + t * (bottomColor.b - topColor.b));
      const a = Math.round(topColor.a + t * (bottomColor.a - topColor.a));

      this.fillRect(centerX - halfW, y, halfW * 2, 1, r, g, b, a);
    }
  }

  /**
   * Renders alternating scanlines within a trapezoid cone.
   */
  public drawScanlines(
    centerX: number,
    topY: number,
    bottomY: number,
    topHalfW: number,
    bottomHalfW: number,
    lineSpacing: number,
    colors: RGBAColor[]
  ): void {
    const totalH = bottomY - topY;
    if (totalH <= 0 || colors.length === 0) return;

    let colorIdx = 0;
    for (let y = topY; y <= bottomY; y += lineSpacing) {
      const t = (y - topY) / totalH;
      const halfW = Math.round(topHalfW + t * (bottomHalfW - topHalfW));
      const col = colors[colorIdx % colors.length]!;
      colorIdx++;

      this.fillRect(centerX - halfW + 2, y, (halfW - 2) * 2, 2, col.r, col.g, col.b, col.a);
    }
  }

  /**
   * Renders arcade typography using the 8x8 bitmap font PROM.
   */
  public drawArcadeText(
    text: string,
    x: number,
    y: number,
    scale: number,
    color: RGBColor,
    align: 'left' | 'center' | 'right' = 'left'
  ): void {
    const glyphW = 8 * scale;
    const totalW = text.length * glyphW;
    let startX = Math.round(x);

    if (align === 'center') {
      startX = Math.round(x - totalW / 2);
    } else if (align === 'right') {
      startX = Math.round(x - totalW);
    }

    const chars = text.toUpperCase().split('');
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]!;
      const bytes = ARCADE_FONT_BITMAPS[ch] ?? ARCADE_FONT_BITMAPS[' '];
      if (!bytes) continue;

      const glyphOriginX = startX + i * glyphW;
      for (let row = 0; row < 8; row++) {
        const byte = bytes[row] ?? 0;
        for (let col = 0; col < 8; col++) {
          if ((byte & (1 << (7 - col))) !== 0) {
            this.fillRect(
              glyphOriginX + col * scale,
              y + row * scale,
              scale,
              scale,
              color.r,
              color.g,
              color.b,
              255
            );
          }
        }
      }
    }
  }

  /**
   * Renders a 4-point diamond cross twinkle star.
   */
  public drawDiamondStar(
    cx: number,
    cy: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    a: number = 255
  ): void {
    // Core center pixel
    this.fillRect(cx - 1, cy - 1, 3, 3, r, g, b, a);

    // Cross rays
    for (let d = 2; d <= radius; d++) {
      const rayAlpha = Math.max(10, Math.round(a * (1 - d / (radius + 1))));
      this.setPixel(cx + d, cy, r, g, b, rayAlpha);
      this.setPixel(cx - d, cy, r, g, b, rayAlpha);
      this.setPixel(cx, cy + d, r, g, b, rayAlpha);
      this.setPixel(cx, cy - d, r, g, b, rayAlpha);
    }
  }

  /**
   * Renders a circular ring (e.g. for explosion shockwave).
   */
  public drawCircleRing(
    cx: number,
    cy: number,
    radius: number,
    thickness: number,
    r: number,
    g: number,
    b: number,
    a: number = 255
  ): void {
    const rOuter = radius + thickness / 2;
    const rInner = Math.max(0, radius - thickness / 2);
    const rOuterSq = rOuter * rOuter;
    const rInnerSq = rInner * rInner;

    const x0 = Math.max(0, Math.floor(cx - rOuter));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + rOuter));
    const y0 = Math.max(0, Math.floor(cy - rOuter));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + rOuter));

    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const dySq = dy * dy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dSq = dx * dx + dySq;
        if (dSq >= rInnerSq && dSq <= rOuterSq) {
          this.setPixel(x, y, r, g, b, a);
        }
      }
    }
  }
}
