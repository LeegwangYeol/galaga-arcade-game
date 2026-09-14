/**
 * Galaga Arcade Web Game — Milestone M26
 * Procedural OpenGraph Banner Engine Entry Point
 */

import { PixelBuffer } from './PixelBuffer';
import { BannerScene } from './BannerScene';
import { PngEncoder } from './PngEncoder';

/**
 * Generates the complete 1200x630 OpenGraph social preview banner
 * as an RFC 2083 compliant binary PNG Buffer.
 */
export function generateOgBannerBuffer(): Buffer {
  const buffer = new PixelBuffer(1200, 630);
  BannerScene.compose(buffer);
  return PngEncoder.encode(buffer);
}

/**
 * Alias for generateOgBannerBuffer for universal test and script compatibility.
 */
export const generateOgBanner = generateOgBannerBuffer;
export default generateOgBannerBuffer;

export * from './PixelBuffer';
export * from './PngEncoder';
export * from './GalagaLogoMatrix';
export * from './BannerScene';
export * from './vitePlugin';
