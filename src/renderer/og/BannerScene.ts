/**
 * Galaga Arcade Web Game — Milestone M26
 * Pure TypeScript Procedural 1200x630 OpenGraph Banner Scene
 * 
 * Composes the complete high-resolution retro arcade banner:
 * - 260-star 3-layer parallax starfield with diamond cross sparkles
 * - Authentic 3D extruded "GALAGA" marquee logo
 * - Boss Galaga with pulsating tractor beam capturing a player fighter
 * - Player Dual Fighter hero firing twin plasma salvos with explosion burst
 * - Diving Zako & Goei alien escort swarm
 * - Complete 1981 arcade HUD (1UP, HIGH SCORE, reserve ships, Stage 50 Flag)
 */

import { PixelBuffer, OG_PALETTE } from './PixelBuffer';
import { drawGalagaLogo } from './GalagaLogoMatrix';
import {
  PLAYER_FIGHTER_MATRIX,
  DUAL_FIGHTER_MATRIX,
  CAPTURED_FIGHTER_MATRIX,
  PLAYER_MISSILE_MATRIX,
  ZAKO_FRAME_0_MATRIX,
  GOEI_FRAME_0_MATRIX,
  BOSS_HEALTHY_FRAME_0_MATRIX,
} from '../SpriteRenderer';
import { BADGE_50_MATRIX } from '../../ui/HUD';

// Deterministic PRNG for reproducible 1200x630 pixel rendering across all runs
function createPrng(seed: number = 1981) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class BannerScene {
  public static compose(buffer: PixelBuffer): void {
    const { width, height } = buffer;
    const prng = createPrng(1981);

    // ========================================================================
    // 1. Cosmic Background with Subtle Vignette
    // ========================================================================
    const cx = width / 2;
    const cy = height / 2;
    const maxDistSq = (cx * cx + cy * cy);

    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      const dySq = dy * dy;
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const distSq = dx * dx + dySq;
        const normDist = Math.min(1, Math.sqrt(distSq / maxDistSq));

        // Center: #0a0e28 (10, 14, 40) -> Edge: #030308 (3, 3, 8)
        const r = Math.round(10 - 7 * normDist);
        const g = Math.round(14 - 11 * normDist);
        const b = Math.round(40 - 32 * normDist);
        buffer.setPixel(x, y, r, g, b, 255);
      }
    }

    // ========================================================================
    // 2. 260-Star Parallax Starfield
    // ========================================================================
    // Layer 0: Distant stars (104 stars, 1px)
    for (let i = 0; i < 104; i++) {
      const sx = Math.floor(prng() * width);
      const sy = Math.floor(prng() * height);
      const alpha = Math.floor(100 + prng() * 100);
      buffer.setPixel(sx, sy, 91, 147, 255, alpha);
    }

    // Layer 1: Midground stars (91 stars, 1-2px, multicolor)
    const midColors = [
      { r: 0, g: 255, b: 255 },   // Cyan
      { r: 255, g: 255, b: 0 },   // Yellow
      { r: 255, g: 127, b: 0 },   // Orange
      { r: 255, g: 0, b: 127 },   // Pink
    ];
    for (let i = 0; i < 91; i++) {
      const sx = Math.floor(prng() * width);
      const sy = Math.floor(prng() * height);
      const col = midColors[Math.floor(prng() * midColors.length)]!;
      const size = prng() > 0.7 ? 2 : 1;
      const alpha = Math.floor(160 + prng() * 95);
      buffer.fillRect(sx, sy, size, size, col.r, col.g, col.b, alpha);
    }

    // Layer 2: Foreground stars (65 stars, bright white & cyan, top 20 with sparkles)
    for (let i = 0; i < 65; i++) {
      const sx = Math.floor(prng() * width);
      const sy = Math.floor(prng() * height);
      const size = prng() > 0.5 ? 2 : 3;

      if (i < 20) {
        // Top 20 brilliant diamond sparkles
        buffer.drawDiamondStar(sx, sy, 4, 255, 255, 255, 255);
      } else {
        buffer.fillRect(sx, sy, size, size, 255, 255, 255, 255);
      }
    }

    // ========================================================================
    // 3. Central GALAGA Marquee Logo & Subtitle Badges
    // ========================================================================
    // Logo width at scale 6 is 92 cols * 6 = 552 px. Centered: (1200 - 552) / 2 = 324
    drawGalagaLogo(buffer, 324, 45, 6);

    // Subtitle
    buffer.drawArcadeText(
      '1981 ARCADE CLASSIC - ULTIMATE EDITION',
      600,
      172,
      2,
      OG_PALETTE['C']!, // Cyan
      'center'
    );

    // Feature Highlights
    buffer.drawArcadeText(
      '50 ROUNDS * 5 BOSS RAIDS * 11 CRISES',
      600,
      198,
      2,
      OG_PALETTE['Y']!, // Yellow
      'center'
    );

    // ========================================================================
    // 4. Boss Galaga & Pulsating Tractor Beam (Right Flank)
    // ========================================================================
    const bossX = 880;
    const bossY = 210;
    const beamOriginX = bossX + 40; // Center of Boss Galaga (80px wide)
    const beamTopY = bossY + 45;
    const beamBottomY = 560;

    // A. Translucent Tractor Beam Cone
    buffer.drawTrapezoidGradient(
      beamOriginX,
      beamTopY,
      beamBottomY,
      20, // Top half-width: 40px wide
      120, // Bottom half-width: 240px wide
      { r: 0, g: 255, b: 255, a: 110 }, // Cyan emitter
      { r: 0, g: 100, b: 255, a: 25 }   // Base aura
    );

    // B. Pulsating Horizontal Waves
    buffer.drawScanlines(
      beamOriginX,
      beamTopY + 10,
      beamBottomY - 10,
      20,
      120,
      10,
      [
        { r: 0, g: 255, b: 255, a: 230 },   // Neon Cyan
        { r: 255, g: 255, b: 0, a: 240 },   // Neon Yellow
        { r: 255, g: 255, b: 255, a: 210 }, // Specular White
      ]
    );

    // C. Shimmer Border Lines (Left and Right edges of beam)
    const totalBeamH = beamBottomY - beamTopY;
    for (let y = beamTopY; y <= beamBottomY; y++) {
      const t = (y - beamTopY) / totalBeamH;
      const hw = Math.round(20 + t * (120 - 20));
      buffer.setPixel(beamOriginX - hw, y, 0, 255, 255, 220);
      buffer.setPixel(beamOriginX + hw, y, 0, 255, 255, 220);
    }

    // D. Captured Player Fighter spinning inside the beam
    buffer.drawMatrix(CAPTURED_FIGHTER_MATRIX, beamOriginX - 30, 385, 4, OG_PALETTE);

    // E. Boss Galaga Flagship (Healthy Green, scale 5, 80x80)
    buffer.drawMatrix(BOSS_HEALTHY_FRAME_0_MATRIX, bossX, bossY, 5, OG_PALETTE);

    // F. Flanking Diving Goei Escorts (Red Butterflies, scale 4, 64x64)
    buffer.drawMatrix(GOEI_FRAME_0_MATRIX, 765, 245, 4, OG_PALETTE);
    buffer.drawMatrix(GOEI_FRAME_0_MATRIX, 1015, 255, 4, OG_PALETTE);

    // ========================================================================
    // 5. Player Dual Fighter & Counterattack (Left Flank)
    // ========================================================================
    const dualX = 220;
    const dualY = 480;

    // A. Player Dual Fighter (scale 5, 31 cols x 16 rows = 155x80)
    buffer.drawMatrix(DUAL_FIGHTER_MATRIX, dualX, dualY, 5, OG_PALETTE);

    // B. Twin Vertical Plasma Missiles
    const missileLeftX = dualX + 35;
    const missileRightX = dualX + 110;
    const missileY = 350;

    // Missile Left
    buffer.drawMatrix(PLAYER_MISSILE_MATRIX, missileLeftX, missileY, 4, OG_PALETTE);
    // Exhaust thruster contrail
    buffer.fillRect(missileLeftX + 4, missileY + 32, 4, 40, 255, 127, 0, 160);
    buffer.fillRect(missileLeftX + 5, missileY + 40, 2, 35, 255, 255, 0, 120);

    // Missile Right
    buffer.drawMatrix(PLAYER_MISSILE_MATRIX, missileRightX, missileY, 4, OG_PALETTE);
    buffer.fillRect(missileRightX + 4, missileY + 32, 4, 40, 255, 127, 0, 160);
    buffer.fillRect(missileRightX + 5, missileY + 40, 2, 35, 255, 255, 0, 120);

    // C. Diving Zako Alien into missile path (scale 4, 64x64)
    buffer.drawMatrix(ZAKO_FRAME_0_MATRIX, 225, 265, 4, OG_PALETTE);

    // D. Explosion Burst at target contact point
    const expX = missileRightX + 6;
    const expY = 220;

    // Circular shockwave ring
    buffer.drawCircleRing(expX, expY, 32, 3, 255, 127, 0, 230);
    buffer.drawCircleRing(expX, expY, 18, 2, 255, 255, 0, 255);

    // Intense core flash
    buffer.fillRect(expX - 8, expY - 8, 16, 16, 255, 255, 255, 255);

    // Radiating explosion sparks
    const sparkOffsets = [
      [-26, -14], [28, -12], [-18, 24], [22, 26],
      [-36, 4], [34, -4], [0, -32], [4, 34],
      [-12, -28], [14, -26], [-28, -28], [30, 20],
      [-40, -18], [42, 14], [-14, 38], [18, -36],
      [-5, -44], [8, 42], [-45, 8], [44, -18],
    ];
    for (const [ox, oy] of sparkOffsets) {
      const sparkColor = (Math.abs(ox!) + Math.abs(oy!)) % 2 === 0
        ? OG_PALETTE['Y']!
        : OG_PALETTE['O']!;
      buffer.fillRect(expX + ox!, expY + oy!, 3, 3, sparkColor.r, sparkColor.g, sparkColor.b, 240);
    }

    // ========================================================================
    // 6. Authentic Arcade Cabinet HUD & Framing
    // ========================================================================
    // A. Cabinet Outer Border (Deep Navy with Neon Cyan Corner Accents)
    buffer.fillRect(12, 12, width - 24, 2, 26, 26, 46, 255);
    buffer.fillRect(12, height - 14, width - 24, 2, 26, 26, 46, 255);
    buffer.fillRect(12, 12, 2, height - 24, 26, 26, 46, 255);
    buffer.fillRect(width - 14, 12, 2, height - 24, 26, 26, 46, 255);

    // Corner notches
    buffer.fillRect(12, 12, 16, 3, 0, 255, 255, 255);
    buffer.fillRect(12, 12, 3, 16, 0, 255, 255, 255);
    buffer.fillRect(width - 28, 12, 16, 3, 0, 255, 255, 255);
    buffer.fillRect(width - 15, 12, 3, 16, 0, 255, 255, 255);
    buffer.fillRect(12, height - 15, 16, 3, 0, 255, 255, 255);
    buffer.fillRect(12, height - 28, 3, 16, 0, 255, 255, 255);
    buffer.fillRect(width - 28, height - 15, 16, 3, 0, 255, 255, 255);
    buffer.fillRect(width - 15, height - 28, 3, 16, 0, 255, 255, 255);

    // B. Top-Left HUD (1UP & Score)
    buffer.drawArcadeText('1UP', 40, 24, 2, OG_PALETTE['R']!, 'left');
    buffer.drawArcadeText(' 25480', 40, 44, 2, OG_PALETTE['W']!, 'left');

    // C. Top-Right HUD (HIGH SCORE)
    buffer.drawArcadeText('HIGH SCORE', 970, 24, 2, OG_PALETTE['R']!, 'left');
    buffer.drawArcadeText('  99990', 970, 44, 2, OG_PALETTE['W']!, 'left');

    // D. Bottom-Left HUD (3 Reserve Fighter Ships)
    buffer.drawMatrix(PLAYER_FIGHTER_MATRIX, 40, 574, 2, OG_PALETTE);
    buffer.drawMatrix(PLAYER_FIGHTER_MATRIX, 75, 574, 2, OG_PALETTE);
    buffer.drawMatrix(PLAYER_FIGHTER_MATRIX, 110, 574, 2, OG_PALETTE);

    // E. Bottom-Right HUD (Stage 50 Flag Badge & Stage Text)
    buffer.drawMatrix(BADGE_50_MATRIX, 990, 570, 3, OG_PALETTE);
    buffer.drawArcadeText('STAGE 50', 1030, 582, 2, OG_PALETTE['Y']!, 'left');
  }
}
