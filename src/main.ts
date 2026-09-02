/**
 * Galaga Arcade Web Game — Main Application Entry Point
 * Handles canvas initialization, responsive letterbox scaling, and engine bootstrap.
 */

import type { ViewportTransform, VirtualResolution } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Authentic Galaga vertical arcade virtual resolution (3:4 aspect ratio).
 */
export const VIRTUAL_RESOLUTION: VirtualResolution = {
  width: 224,
  height: 288,
  aspectRatio: 224 / 288, // ~0.7778
};

export const CANVAS_ID = 'game-canvas';
export const APP_CONTAINER_ID = 'app-container';

// ============================================================================
// State Management
// ============================================================================

let canvasElement: HTMLCanvasElement | null = null;
let canvasContext: CanvasRenderingContext2D | null = null;
let currentTransform: ViewportTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  displayWidth: VIRTUAL_RESOLUTION.width,
  displayHeight: VIRTUAL_RESOLUTION.height,
  virtualWidth: VIRTUAL_RESOLUTION.width,
  virtualHeight: VIRTUAL_RESOLUTION.height,
};

// ============================================================================
// Viewport & Letterbox Scaling
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
  const targetAspect = virtualWidth / virtualHeight;
  const windowAspect = windowWidth / windowHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (windowAspect < targetAspect) {
    // Screen is narrower than game aspect ratio -> Letterbox top/bottom
    displayWidth = windowWidth;
    displayHeight = Math.floor(windowWidth / targetAspect);
  } else {
    // Screen is wider than game aspect ratio -> Pillarbox left/right
    displayHeight = windowHeight;
    displayWidth = Math.floor(windowHeight * targetAspect);
  }

  const scale = displayWidth / virtualWidth;
  const offsetX = Math.floor((windowWidth - displayWidth) / 2);
  const offsetY = Math.floor((windowHeight - displayHeight) / 2);

  return {
    scale,
    offsetX,
    offsetY,
    displayWidth,
    displayHeight,
    virtualWidth,
    virtualHeight,
  };
}

/**
 * Applies the calculated viewport transform to the canvas DOM element.
 * Uses display dimensions with flexbox container centering to prevent double-offset displacement.
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
 * Handles window resize events to maintain aspect ratio and centering.
 */
export function handleResize(): void {
  if (!canvasElement) return;

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  currentTransform = calculateViewportTransform(windowWidth, windowHeight);
  applyCanvasScaling(canvasElement, currentTransform);
}

// ============================================================================
// Rendering Initialization
// ============================================================================

/**
 * Renders the initial arcade boot screen frame onto the canvas.
 */
export function renderBootFrame(ctx: CanvasRenderingContext2D): void {
  const { width, height } = VIRTUAL_RESOLUTION;

  // Clear canvas with authentic deep black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Render twinkling background stars placeholder
  const starColors = ['#FFFFFF', '#FF3333', '#33CCFF', '#FFFF33'];
  const starSeeds = [
    { x: 24, y: 35, c: 0 }, { x: 80, y: 72, c: 1 }, { x: 190, y: 48, c: 2 },
    { x: 140, y: 110, c: 3 }, { x: 50, y: 160, c: 0 }, { x: 210, y: 190, c: 1 },
    { x: 95, y: 220, c: 2 }, { x: 165, y: 250, c: 3 }, { x: 30, y: 270, c: 0 },
    { x: 115, y: 15, c: 1 }, { x: 175, y: 135, c: 2 }, { x: 65, y: 95, c: 3 },
  ];

  for (const s of starSeeds) {
    ctx.fillStyle = starColors[s.c] ?? '#FFFFFF';
    ctx.fillRect(s.x, s.y, 2, 2);
  }

  // Set up crisp arcade typography
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Score Header
  ctx.fillStyle = '#FF0000';
  ctx.fillText('1UP', 36, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('00', 36, 20);

  ctx.fillStyle = '#FF0000';
  ctx.fillText('HIGH SCORE', width / 2, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('20000', width / 2, 20);

  ctx.fillStyle = '#00FFFF';
  ctx.fillText('2UP', width - 36, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('00', width - 36, 20);

  // Galaga Title / Ready Banner
  ctx.fillStyle = '#FFFF00';
  ctx.font = '14px monospace';
  ctx.fillText('GALAGA', width / 2, height / 2 - 20);

  ctx.fillStyle = '#00FF00';
  ctx.font = '8px monospace';
  ctx.fillText('ARCADE WEB ENGINE', width / 2, height / 2);

  ctx.fillStyle = '#FF3333';
  ctx.fillText('PRESS ANY KEY TO START', width / 2, height / 2 + 30);

  // Copyright / Attribution
  ctx.fillStyle = '#888888';
  ctx.font = '6px monospace';
  ctx.fillText('© 1981 NAMCO BANDAI / WEB ADAPTATION', width / 2, height - 16);
}

// ============================================================================
// Engine Bootstrap Lifecycle
// ============================================================================

/**
 * Initializes the canvas, obtains 2D context, attaches event listeners, and renders the boot frame.
 */
export function bootstrap(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  console.info('[Galaga Arcade] Bootstrapping engine...');

  // Locate or create the canvas element
  let canvas = (document.getElementById(CANVAS_ID) ||
    document.getElementById('game-canvas') ||
    document.getElementById('gameCanvas')) as HTMLCanvasElement | null;

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;

    const appContainer =
      document.getElementById(APP_CONTAINER_ID) ||
      document.getElementById('app') ||
      document.getElementById('game-container');

    if (appContainer) {
      appContainer.appendChild(canvas);
    } else {
      document.body.appendChild(canvas);
    }
  }

  // Set internal resolution buffer
  canvas.width = VIRTUAL_RESOLUTION.width;
  canvas.height = VIRTUAL_RESOLUTION.height;

  // Obtain 2D rendering context with high performance settings
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  });

  if (!ctx) {
    throw new Error('[Galaga Arcade] Fatal: Failed to acquire CanvasRenderingContext2D.');
  }

  // Disable image smoothing for razor-sharp pixel art scaling
  ctx.imageSmoothingEnabled = false;

  canvasElement = canvas;
  canvasContext = ctx;

  // Initial scaling calculation and attachment
  handleResize();
  window.addEventListener('resize', handleResize);

  // Render initial boot screen
  renderBootFrame(ctx);

  console.info(
    `[Galaga Arcade] Engine initialized. Virtual Resolution: ${VIRTUAL_RESOLUTION.width}x${VIRTUAL_RESOLUTION.height}, Aspect Ratio: 3:4.`
  );

  return { canvas, ctx };
}

// ============================================================================
// Getters for External System Integration (Milestones 2-8)
// ============================================================================

export function getCanvas(): HTMLCanvasElement | null {
  return canvasElement;
}

export function getCanvasContext(): CanvasRenderingContext2D | null {
  return canvasContext;
}

export function getViewportTransform(): ViewportTransform {
  return currentTransform;
}

// Auto-bootstrap on DOM ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootstrap();
    });
  } else {
    bootstrap();
  }
}
