/**
 * Galaga Arcade Web Game — Milestone M26
 * Vite Plugin for Procedural OpenGraph Banner Generation
 * 
 * - Build lifecycle: Emits `dist/og-image.png` via Rollup asset pipeline.
 * - Dev server: Intercepts `/og-image.png` HTTP requests and returns freshly synthesized PNG buffer.
 * - Zero external binary dependencies in Git repository.
 */

import type { Plugin } from 'vite';
import { PixelBuffer } from './PixelBuffer';
import { BannerScene } from './BannerScene';
import { PngEncoder } from './PngEncoder';

function createOgBanner(): Buffer {
  const buffer = new PixelBuffer(1200, 630);
  BannerScene.compose(buffer);
  return PngEncoder.encode(buffer);
}

export function proceduralOgPlugin(): Plugin {
  return {
    name: 'galaga-procedural-og-banner',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/og-image.png' || req.url?.startsWith('/og-image.png?')) {
          try {
            const pngBuffer = createOgBanner();
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.statusCode = 200;
            res.end(pngBuffer);
          } catch (err) {
            next(err);
          }
        } else {
          next();
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/og-image.png' || req.url?.startsWith('/og-image.png?')) {
          try {
            const pngBuffer = createOgBanner();
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.statusCode = 200;
            res.end(pngBuffer);
          } catch (err) {
            next(err);
          }
        } else {
          next();
        }
      });
    },
    generateBundle() {
      const pngBuffer = createOgBanner();
      this.emitFile({
        type: 'asset',
        fileName: 'og-image.png',
        source: pngBuffer,
      });
    },
  };
}
