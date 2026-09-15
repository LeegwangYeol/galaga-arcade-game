/**
 * Galaga Arcade Web Game — Main Application Entry Point
 * 
 * Instantiates the master Game coordinator and bootstraps the 60fps arcade engine.
 * Retains backward-compatible utility exports for viewport scaling and diagnostics.
 */

import { Game } from './core/Game';
import { ScreenManager } from './core/ScreenManager';
import type { ViewportTransform, VirtualResolution } from './types';

// ============================================================================
// Constants & Resolution Contracts
// ============================================================================

export const VIRTUAL_RESOLUTION: VirtualResolution = {
  width: Game.VIRTUAL_WIDTH,
  height: Game.VIRTUAL_HEIGHT,
  aspectRatio: Game.VIRTUAL_WIDTH / Game.VIRTUAL_HEIGHT, // 224 / 288 (~0.7778)
};

export const CANVAS_ID = Game.CANVAS_ID;
export const APP_CONTAINER_ID = 'app-container';

// ============================================================================
// Global Engine State
// ============================================================================

let gameInstance: Game | null = null;

// ============================================================================
// Viewport & Letterbox Scaling Helpers (Backward-compatible delegates)
// ============================================================================

/**
 * Calculates the optimal letterbox/pillarbox viewport transformation.
 */
export function calculateViewportTransform(
  windowWidth: number,
  windowHeight: number,
  virtualWidth = VIRTUAL_RESOLUTION.width,
  virtualHeight = VIRTUAL_RESOLUTION.height
): ViewportTransform {
  return ScreenManager.calculateTransform(windowWidth, windowHeight, virtualWidth, virtualHeight);
}

/**
 * Applies the calculated viewport transform to the canvas DOM element.
 */
export function applyCanvasScaling(canvas: HTMLCanvasElement, transform: ViewportTransform): void {
  canvas.style.width = `${transform.displayWidth}px`;
  canvas.style.height = `${transform.displayHeight}px`;
  canvas.style.display = 'block';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.position = '';
  canvas.style.left = '';
  canvas.style.top = '';
}

/**
 * Handles window resize events.
 */
export function handleResize(): void {
  if (gameInstance) {
    gameInstance.getScreenManager().updateScalingImmediate();
  }
}

/**
 * Renders the boot frame / initial title frame.
 */
export function renderBootFrame(ctx: CanvasRenderingContext2D): void {
  if (gameInstance) {
    gameInstance.render();
  } else {
    // Fallback static boot render
    const width = VIRTUAL_RESOLUTION.width;
    const height = VIRTUAL_RESOLUTION.height;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#FF0000';
    ctx.fillText('1UP', 36, 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('00', 36, 20);

    ctx.fillStyle = '#FF0000';
    ctx.fillText('HIGH SCORE', width / 2, 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('20000', width / 2, 20);

    ctx.fillStyle = '#FFFF00';
    ctx.font = '14px monospace';
    ctx.fillText('GALAGA', width / 2, height / 2 - 20);

    ctx.fillStyle = '#00FF00';
    ctx.font = '8px monospace';
    ctx.fillText('ARCADE WEB ENGINE', width / 2, height / 2);
  }
}

// ============================================================================
// Engine Bootstrap Lifecycle
// ============================================================================

/**
 * Initializes the Game instance, attaches subsystems, and starts the 60fps loop.
 */
export function bootstrap(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; game: Game } {
  console.info('[Galaga Arcade] Bootstrapping master game engine...');

  if (!gameInstance) {
    gameInstance = new Game(CANVAS_ID);
    gameInstance.start();
  }

  const canvas = gameInstance.getCanvas()!;
  const ctx = gameInstance.getContext();

  console.info(
    `[Galaga Arcade] Master engine running at ${VIRTUAL_RESOLUTION.width}x${VIRTUAL_RESOLUTION.height} (3:4 aspect ratio).`
  );

  return { canvas, ctx, game: gameInstance };
}

// ============================================================================
// External Getters & Diagnostics
// ============================================================================

export function getGame(): Game | null {
  return gameInstance;
}

export function getCanvas(): HTMLCanvasElement | null {
  return gameInstance ? gameInstance.getCanvas() : null;
}

export function getCanvasContext(): CanvasRenderingContext2D | null {
  return gameInstance ? gameInstance.getContext() : null;
}

export function getViewportTransform(): ViewportTransform {
  if (gameInstance) {
    return gameInstance.getScreenManager().getTransform();
  }
  const w = typeof window !== 'undefined' ? window.innerWidth : VIRTUAL_RESOLUTION.width;
  const h = typeof window !== 'undefined' ? window.innerHeight : VIRTUAL_RESOLUTION.height;
  return calculateViewportTransform(w, h);
}

/**
 * Cleanly destroys and tears down the global game instance.
 */
export function teardown(): void {
  gameInstance?.destroy();
  gameInstance = null;
}

// Auto-bootstrap on DOM load in browser runtime
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootstrap();
    });
  } else {
    bootstrap();
  }
}
