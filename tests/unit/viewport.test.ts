import { describe, it, expect, beforeEach } from 'vitest';
import {
  CANVAS_ID,
  VIRTUAL_RESOLUTION,
  calculateViewportTransform,
  applyCanvasScaling,
} from '../../src/main';

describe('Viewport & Canvas Scaling Suite', () => {
  describe('CANVAS_ID Alignment', () => {
    it('CANVAS_ID is standardized to game-canvas', () => {
      expect(CANVAS_ID).toBe('game-canvas');
    });

    it('VIRTUAL_RESOLUTION maintains authentic 224x288 3:4 arcade aspect ratio', () => {
      expect(VIRTUAL_RESOLUTION.width).toBe(224);
      expect(VIRTUAL_RESOLUTION.height).toBe(288);
      expect(VIRTUAL_RESOLUTION.aspectRatio).toBeCloseTo(224 / 288, 5);
    });
  });

  describe('calculateViewportTransform', () => {
    it('calculates 16:9 1080p (1920x1080) pillarbox scaling correctly', () => {
      const transform = calculateViewportTransform(1920, 1080);
      // Window aspect 1920/1080 = 1.7778 > targetAspect 224/288 = 0.7778 -> pillarbox
      expect(transform.displayHeight).toBe(1080);
      expect(transform.displayWidth).toBe(Math.floor(1080 * (224 / 288))); // 840
      expect(transform.scale).toBeCloseTo(840 / 224, 4);
      expect(transform.offsetX).toBe(Math.floor((1920 - 840) / 2)); // 540
      expect(transform.offsetY).toBe(0);
      expect(transform.virtualWidth).toBe(224);
      expect(transform.virtualHeight).toBe(288);
    });

    it('calculates 16:9 720p (1280x720) pillarbox scaling correctly', () => {
      const transform = calculateViewportTransform(1280, 720);
      expect(transform.displayHeight).toBe(720);
      expect(transform.displayWidth).toBe(Math.floor(720 * (224 / 288))); // 560
      expect(transform.scale).toBeCloseTo(560 / 224, 4);
      expect(transform.offsetX).toBe(Math.floor((1280 - 560) / 2)); // 360
      expect(transform.offsetY).toBe(0);
    });

    it('calculates narrow mobile portrait (375x812) letterbox scaling correctly', () => {
      const transform = calculateViewportTransform(375, 812);
      // Window aspect 375/812 = 0.4618 < targetAspect 224/288 = 0.7778 -> letterbox
      expect(transform.displayWidth).toBe(375);
      expect(transform.displayHeight).toBe(Math.floor(375 / (224 / 288))); // 482
      expect(transform.scale).toBeCloseTo(375 / 224, 4);
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(Math.floor((812 - 482) / 2)); // 165
    });

    it('calculates exact match aspect ratio (448x576) with zero offsets', () => {
      const transform = calculateViewportTransform(448, 576);
      expect(transform.displayWidth).toBe(448);
      expect(transform.displayHeight).toBe(576);
      expect(transform.scale).toBe(2);
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(0);
    });
  });

  describe('applyCanvasScaling', () => {
    let mockCanvas: HTMLCanvasElement;

    beforeEach(() => {
      mockCanvas = {
        style: {
          width: '',
          height: '',
          display: '',
          imageRendering: '',
          position: 'absolute',
          left: '100px',
          top: '50px',
        },
      } as unknown as HTMLCanvasElement;
    });

    it('sets canvas dimensions and pixelated rendering while clearing absolute positioning offsets', () => {
      const transform = calculateViewportTransform(1920, 1080);
      applyCanvasScaling(mockCanvas, transform);

      expect(mockCanvas.style.width).toBe('840px');
      expect(mockCanvas.style.height).toBe('1080px');
      expect(mockCanvas.style.display).toBe('block');
      expect(mockCanvas.style.imageRendering).toBe('pixelated');

      // Crucial: No absolute offset coordinates that would cause double-centering displacement
      expect(mockCanvas.style.position).toBe('');
      expect(mockCanvas.style.left).toBe('');
      expect(mockCanvas.style.top).toBe('');
    });
  });
});
