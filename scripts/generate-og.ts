/**
 * Galaga Arcade Web Game — Milestone M26
 * Standalone Procedural OG Banner Generator CLI
 * 
 * Usage: npx vite-node scripts/generate-og.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOgBannerBuffer } from '../src/renderer/og';

export const generateOgBanner = generateOgBannerBuffer;
export default generateOgBannerBuffer;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'dist');
const outputPath = path.join(distDir, 'og-image.png');

export function runCli(): void {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const startTime = performance.now();
  const buffer = generateOgBannerBuffer();
  fs.writeFileSync(outputPath, buffer);
  const duration = (performance.now() - startTime).toFixed(2);

  console.log(`[OG Generator] Successfully generated ${outputPath} (${buffer.length} bytes) in ${duration}ms!`);
}

// Execute when run outside Vitest test runner
if (!process.env.VITEST) {
  runCli();
}
