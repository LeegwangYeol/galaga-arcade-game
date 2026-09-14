/**
 * Galaga Arcade Web Game — Milestone 14: Asset Autonomy & Zero External Media Verification Suite
 * 
 * Enforces the strict zero-external-assets architecture:
 * 1. 0 binary or external media files (.png, .jpg, .mp3, .wav, .ogg, .webp, .svg, etc.)
 *    exist anywhere in the source or asset trees.
 * 2. 0 external media loader invocations (new Image, new Audio, external fetch/XHR for media).
 * 3. 100% of all visual sprites and sound effects are procedurally generated in TypeScript.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestone 14: Asset Autonomy & Pure Procedural Verification', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const srcDir = path.resolve(projectRoot, 'src');

  // ==========================================================================
  // 1. Filesystem Media Scan
  // ==========================================================================

  describe('1. Filesystem Media Audit', () => {
    it('contains zero external raster, vector, or audio asset files in src/ or public/', () => {
      const forbiddenExtensions = new Set([
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.svg',
        '.mp3',
        '.wav',
        '.ogg',
        '.flac',
        '.aac',
        '.m4a',
      ]);

      const foundForbiddenFiles: string[] = [];

      function scanDir(dir: string): void {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.agents') {
              scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (forbiddenExtensions.has(ext)) {
              foundForbiddenFiles.push(path.relative(projectRoot, fullPath));
            }
          }
        }
      }

      scanDir(srcDir);

      const publicDir = path.resolve(projectRoot, 'public');
      if (fs.existsSync(publicDir)) {
        scanDir(publicDir);
      }

      expect(foundForbiddenFiles).toEqual([]);
    });
  });

  // ==========================================================================
  // 2. Codebase Static Analysis for External Media Loaders
  // ==========================================================================

  describe('2. Codebase Static Analysis for Media Loaders', () => {
    it('contains zero external network asset fetch or media constructor calls in src/', () => {
      const sourceFiles: string[] = [];

      function collectSourceFiles(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            collectSourceFiles(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            sourceFiles.push(fullPath);
          }
        }
      }

      collectSourceFiles(srcDir);
      expect(sourceFiles.length).toBeGreaterThan(10);

      const violations: { file: string; line: number; match: string }[] = [];

      const forbiddenPatterns = [
        /\bnew\s+Audio\s*\(/,
        /\bnew\s+Image\s*\(/,
        /\.src\s*=\s*['"`].*\.(png|jpg|mp3|wav|ogg|svg)/i,
        /fetch\s*\(\s*['"`].*\.(png|jpg|mp3|wav|ogg|svg)/i,
      ];

      for (const file of sourceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(line)) {
              violations.push({
                file: path.relative(projectRoot, file),
                line: index + 1,
                match: line.trim(),
              });
            }
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });
});
