/**
 * Galaga Arcade Web Game — Unified Input Handler
 * 
 * Multi-modal input processing for Keyboard, Mouse, Pointer, and Mobile Touch virtual controls.
 * Supports discrete single-pulse action consumption ('fire', 'pause', 'restart'),
 * continuous direction states, non-scrolling touch zones, and virtual coordinate translation.
 */

import type { InputState } from '../types';
import type { ScreenManager } from '../core/ScreenManager';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private screenManager: ScreenManager | null;
  private onUserGesture?: () => void;
  private userGestureNotified: boolean = false;

  // Unified persistent input state
  private state: InputState = {
    moveLeft: false,
    moveRight: false,
    fire: false,
    pause: false,
    restart: false,
    pointerX: null,
    pointerActive: false,
    touchLeft: false,
    touchRight: false,
    touchFire: false,
  };

  // Discrete single-pulse action triggers (consumed on read)
  private fireTriggered: boolean = false;
  private pauseTriggered: boolean = false;
  private restartTriggered: boolean = false;

  // Set of actively depressed key codes for rollover handling
  private activeKeys = new Set<string>();

  // Touch identifiers for multi-touch separation
  private touchIdMove: number | null = null;
  private touchIdFire: number | null = null;

  // Game keys requiring preventDefault to inhibit viewport scrolling
  private static readonly PREVENT_DEFAULT_KEYS = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Space',
    'KeyA',
    'KeyD',
    'KeyW',
    'KeyS',
    'KeyZ',
    'KeyK',
    'KeyJ',
    'KeyP',
    'Escape',
    'Enter',
    'KeyR',
  ]);

  // Bound listener references for deterministic cleanup
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundTouchCancel: (e: TouchEvent) => void;
  private boundWindowBlur: () => void;
  private boundVisibilityChange: () => void;

  // DOM touch button references
  private domBtnLeft: HTMLElement | null = null;
  private domBtnRight: HTMLElement | null = null;
  private domBtnFire: HTMLElement | null = null;

  // DOM touch button bound handlers
  private boundDomLeftDown: (e: Event) => void;
  private boundDomLeftUp: (e: Event) => void;
  private boundDomRightDown: (e: Event) => void;
  private boundDomRightUp: (e: Event) => void;
  private boundDomFireDown: (e: Event) => void;
  private boundDomFireUp: (e: Event) => void;

  constructor(
    canvas: HTMLCanvasElement,
    screenManager?: ScreenManager | null,
    onUserGesture?: () => void
  ) {
    this.canvas = canvas;
    this.screenManager = screenManager ?? null;
    this.onUserGesture = onUserGesture;

    // Bind event handlers
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerLeave = this.handlePointerLeave.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.boundTouchCancel = this.handleTouchCancel.bind(this);
    this.boundWindowBlur = this.handleWindowBlur.bind(this);
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this);

    // DOM button handlers
    this.boundDomLeftDown = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.notifyUserGesture();
      this.state.touchLeft = true;
      this.state.moveLeft = true;
      this.domBtnLeft?.classList.add('active');
    };
    this.boundDomLeftUp = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.state.touchLeft = false;
      if (!this.isAnyLeftKeyPressed()) {
        this.state.moveLeft = false;
      }
      this.domBtnLeft?.classList.remove('active');
    };

    this.boundDomRightDown = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.notifyUserGesture();
      this.state.touchRight = true;
      this.state.moveRight = true;
      this.domBtnRight?.classList.add('active');
    };
    this.boundDomRightUp = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.state.touchRight = false;
      if (!this.isAnyRightKeyPressed()) {
        this.state.moveRight = false;
      }
      this.domBtnRight?.classList.remove('active');
    };

    this.boundDomFireDown = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.notifyUserGesture();
      this.state.touchFire = true;
      this.state.fire = true;
      this.fireTriggered = true;
      this.domBtnFire?.classList.add('active');
    };
    this.boundDomFireUp = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.state.touchFire = false;
      if (!this.isAnyFireKeyPressed()) {
        this.state.fire = false;
      }
      this.domBtnFire?.classList.remove('active');
    };

    this.attachEventListeners();
    this.attachDomTouchControls();
  }

  // ==========================================================================
  // Public Interface
  // ==========================================================================

  /**
   * Returns a readonly snapshot of current continuous input states.
   */
  public getState(): Readonly<InputState> {
    return this.state;
  }

  /**
   * Consumes and returns a discrete pulse action flag.
   * Ensures actions such as firing a single missile or toggling pause
   * execute exactly once per user trigger.
   */
  public consumeAction(action: 'fire' | 'pause' | 'restart'): boolean {
    switch (action) {
      case 'fire': {
        const val = this.fireTriggered;
        this.fireTriggered = false;
        return val;
      }
      case 'pause': {
        const val = this.pauseTriggered;
        this.pauseTriggered = false;
        return val;
      }
      case 'restart': {
        const val = this.restartTriggered;
        this.restartTriggered = false;
        return val;
      }
      default:
        return false;
    }
  }

  /**
   * Updates the active ScreenManager reference for dynamic coordinate resolution.
   */
  public setScreenManager(screenManager: ScreenManager | null): void {
    this.screenManager = screenManager;
  }

  /**
   * Clears all active input states and buffers.
   */
  public reset(): void {
    this.activeKeys.clear();
    this.state.moveLeft = false;
    this.state.moveRight = false;
    this.state.fire = false;
    this.state.pause = false;
    this.state.restart = false;
    this.state.pointerX = null;
    this.state.pointerActive = false;
    this.state.touchLeft = false;
    this.state.touchRight = false;
    this.state.touchFire = false;
    this.touchIdMove = null;
    this.touchIdFire = null;
    this.fireTriggered = false;
    this.pauseTriggered = false;
    this.restartTriggered = false;

    this.domBtnLeft?.classList.remove('active');
    this.domBtnRight?.classList.remove('active');
    this.domBtnFire?.classList.remove('active');
  }

  /**
   * Detaches all DOM and window event listeners and frees references.
   */
  public destroy(): void {
    this.detachEventListeners();
    this.detachDomTouchControls();
    this.reset();
  }

  // ==========================================================================
  // Event Attachment & Detachment
  // ==========================================================================

  private attachEventListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown, { passive: false });
      window.addEventListener('keyup', this.boundKeyUp, { passive: false });
      window.addEventListener('blur', this.boundWindowBlur);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
    }

    if (this.canvas && this.canvas.addEventListener) {
      this.canvas.addEventListener('pointerdown', this.boundPointerDown);
      this.canvas.addEventListener('pointermove', this.boundPointerMove);
      this.canvas.addEventListener('pointerup', this.boundPointerUp);
      this.canvas.addEventListener('pointerleave', this.boundPointerLeave);

      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      this.canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
      this.canvas.addEventListener('touchend', this.boundTouchEnd, { passive: false });
      this.canvas.addEventListener('touchcancel', this.boundTouchCancel, { passive: false });
    }
  }

  private detachEventListeners(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('blur', this.boundWindowBlur);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    }

    if (this.canvas && this.canvas.removeEventListener) {
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
      this.canvas.removeEventListener('pointermove', this.boundPointerMove);
      this.canvas.removeEventListener('pointerup', this.boundPointerUp);
      this.canvas.removeEventListener('pointerleave', this.boundPointerLeave);

      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
      this.canvas.removeEventListener('touchmove', this.boundTouchMove);
      this.canvas.removeEventListener('touchend', this.boundTouchEnd);
      this.canvas.removeEventListener('touchcancel', this.boundTouchCancel);
    }
  }

  private attachDomTouchControls(): void {
    if (typeof document === 'undefined') return;

    this.domBtnLeft = document.getElementById('btn-left');
    this.domBtnRight = document.getElementById('btn-right');
    this.domBtnFire = document.getElementById('btn-fire');

    if (this.domBtnLeft) {
      this.domBtnLeft.addEventListener('touchstart', this.boundDomLeftDown, { passive: false });
      this.domBtnLeft.addEventListener('touchend', this.boundDomLeftUp, { passive: false });
      this.domBtnLeft.addEventListener('touchcancel', this.boundDomLeftUp, { passive: false });
      this.domBtnLeft.addEventListener('mousedown', this.boundDomLeftDown);
      this.domBtnLeft.addEventListener('mouseup', this.boundDomLeftUp);
      this.domBtnLeft.addEventListener('mouseleave', this.boundDomLeftUp);
    }

    if (this.domBtnRight) {
      this.domBtnRight.addEventListener('touchstart', this.boundDomRightDown, { passive: false });
      this.domBtnRight.addEventListener('touchend', this.boundDomRightUp, { passive: false });
      this.domBtnRight.addEventListener('touchcancel', this.boundDomRightUp, { passive: false });
      this.domBtnRight.addEventListener('mousedown', this.boundDomRightDown);
      this.domBtnRight.addEventListener('mouseup', this.boundDomRightUp);
      this.domBtnRight.addEventListener('mouseleave', this.boundDomRightUp);
    }

    if (this.domBtnFire) {
      this.domBtnFire.addEventListener('touchstart', this.boundDomFireDown, { passive: false });
      this.domBtnFire.addEventListener('touchend', this.boundDomFireUp, { passive: false });
      this.domBtnFire.addEventListener('touchcancel', this.boundDomFireUp, { passive: false });
      this.domBtnFire.addEventListener('mousedown', this.boundDomFireDown);
      this.domBtnFire.addEventListener('mouseup', this.boundDomFireUp);
      this.domBtnFire.addEventListener('mouseleave', this.boundDomFireUp);
    }
  }

  private detachDomTouchControls(): void {
    if (this.domBtnLeft) {
      this.domBtnLeft.removeEventListener('touchstart', this.boundDomLeftDown);
      this.domBtnLeft.removeEventListener('touchend', this.boundDomLeftUp);
      this.domBtnLeft.removeEventListener('touchcancel', this.boundDomLeftUp);
      this.domBtnLeft.removeEventListener('mousedown', this.boundDomLeftDown);
      this.domBtnLeft.removeEventListener('mouseup', this.boundDomLeftUp);
      this.domBtnLeft.removeEventListener('mouseleave', this.boundDomLeftUp);
    }

    if (this.domBtnRight) {
      this.domBtnRight.removeEventListener('touchstart', this.boundDomRightDown);
      this.domBtnRight.removeEventListener('touchend', this.boundDomRightUp);
      this.domBtnRight.removeEventListener('touchcancel', this.boundDomRightUp);
      this.domBtnRight.removeEventListener('mousedown', this.boundDomRightDown);
      this.domBtnRight.removeEventListener('mouseup', this.boundDomRightUp);
      this.domBtnRight.removeEventListener('mouseleave', this.boundDomRightUp);
    }

    if (this.domBtnFire) {
      this.domBtnFire.removeEventListener('touchstart', this.boundDomFireDown);
      this.domBtnFire.removeEventListener('touchend', this.boundDomFireUp);
      this.domBtnFire.removeEventListener('touchcancel', this.boundDomFireUp);
      this.domBtnFire.removeEventListener('mousedown', this.boundDomFireDown);
      this.domBtnFire.removeEventListener('mouseup', this.boundDomFireUp);
      this.domBtnFire.removeEventListener('mouseleave', this.boundDomFireUp);
    }
  }

  // ==========================================================================
  // Keyboard Event Handlers
  // ==========================================================================

  private handleKeyDown(e: KeyboardEvent): void {
    if (
      InputHandler.PREVENT_DEFAULT_KEYS.has(e.code) ||
      InputHandler.PREVENT_DEFAULT_KEYS.has(e.key)
    ) {
      // Do not prevent default for devtools / system shortcuts (Ctrl+R, Cmd+Option+I, F12)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.cancelable) {
        e.preventDefault();
      }
    }

    this.notifyUserGesture();
    this.activeKeys.add(e.code);
    this.activeKeys.add(e.key);

    const isRepeat = e.repeat;

    // Movement: Left
    if (this.isLeftKey(e.code, e.key)) {
      this.state.moveLeft = true;
      this.state.pointerActive = false;
    }

    // Movement: Right
    if (this.isRightKey(e.code, e.key)) {
      this.state.moveRight = true;
      this.state.pointerActive = false;
    }

    // Fire
    if (this.isFireKey(e.code, e.key)) {
      this.state.fire = true;
      if (!isRepeat) {
        this.fireTriggered = true;
      }
    }

    // Pause Toggle
    if (this.isPauseKey(e.code, e.key)) {
      this.state.pause = true;
      if (!isRepeat) {
        this.pauseTriggered = true;
      }
    }

    // Restart / Start Action
    if (this.isRestartKey(e.code, e.key)) {
      this.state.restart = true;
      if (!isRepeat) {
        this.restartTriggered = true;
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.activeKeys.delete(e.code);
    this.activeKeys.delete(e.key);

    // Update Left state
    if (this.isLeftKey(e.code, e.key)) {
      if (!this.isAnyLeftKeyPressed() && !this.state.touchLeft) {
        this.state.moveLeft = false;
      }
    }

    // Update Right state
    if (this.isRightKey(e.code, e.key)) {
      if (!this.isAnyRightKeyPressed() && !this.state.touchRight) {
        this.state.moveRight = false;
      }
    }

    // Update Fire state
    if (this.isFireKey(e.code, e.key)) {
      if (!this.isAnyFireKeyPressed() && !this.state.touchFire) {
        this.state.fire = false;
      }
    }

    // Update Pause state
    if (this.isPauseKey(e.code, e.key)) {
      this.state.pause = false;
    }

    // Update Restart state
    if (this.isRestartKey(e.code, e.key)) {
      this.state.restart = false;
    }
  }

  // ==========================================================================
  // Pointer & Mouse Event Handlers
  // ==========================================================================

  private handlePointerDown(e: PointerEvent): void {
    this.notifyUserGesture();
    this.state.fire = true;
    this.fireTriggered = true;
    this.updatePointerCoordinates(e.clientX, e.clientY);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.buttons > 0 || e.pointerType === 'mouse' || this.state.pointerActive) {
      this.updatePointerCoordinates(e.clientX, e.clientY);
    }
  }

  private handlePointerUp(_e: PointerEvent): void {
    if (!this.isAnyFireKeyPressed() && !this.state.touchFire) {
      this.state.fire = false;
    }
  }

  private handlePointerLeave(_e: PointerEvent): void {
    this.state.pointerActive = false;
    if (!this.isAnyFireKeyPressed() && !this.state.touchFire) {
      this.state.fire = false;
    }
  }

  private updatePointerCoordinates(clientX: number, clientY: number): void {
    if (this.screenManager) {
      const virtual = this.screenManager.clientToVirtual(clientX, clientY);
      if (virtual) {
        this.state.pointerX = Math.max(8, Math.min(216, virtual.x));
        this.state.pointerActive = true;
      }
    } else if (this.canvas && this.canvas.getBoundingClientRect) {
      // Fallback calculation using canvas bounding client rect
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0) {
        const normalizedX = (clientX - rect.left) / rect.width;
        const virtualX = normalizedX * 224;
        this.state.pointerX = Math.max(8, Math.min(216, virtualX));
        this.state.pointerActive = true;
      }
    }
  }

  // ==========================================================================
  // Touch Event Handlers
  // ==========================================================================

  private handleTouchStart(e: TouchEvent): void {
    if (e.cancelable) {
      e.preventDefault();
    }
    this.notifyUserGesture();

    const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    const windowW = typeof window !== 'undefined' ? window.innerWidth : 375;
    const windowH = typeof window !== 'undefined' ? window.innerHeight : 667;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (!touch) continue;

      const clientX = touch.clientX;
      const clientY = touch.clientY;

      // Virtual fire button zone check (Bottom right 35% of viewport or canvas)
      const isFireZone =
        (clientX > windowW * 0.65 && clientY > windowH * 0.6) ||
        (rect && rect.width > 0 && clientX > rect.left + rect.width * 0.65 && clientY > rect.top + rect.height * 0.6);

      if (isFireZone) {
        this.touchIdFire = touch.identifier;
        this.state.touchFire = true;
        this.state.fire = true;
        this.fireTriggered = true;
      } else {
        // Steering touch zone
        this.touchIdMove = touch.identifier;
        this.updatePointerCoordinates(clientX, clientY);
        this.updateTouchSteering(clientX, rect, windowW);
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.cancelable) {
      e.preventDefault();
    }

    const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    const windowW = typeof window !== 'undefined' ? window.innerWidth : 375;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (!touch) continue;

      if (touch.identifier === this.touchIdMove) {
        this.updatePointerCoordinates(touch.clientX, touch.clientY);
        this.updateTouchSteering(touch.clientX, rect, windowW);
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.cancelable) {
      e.preventDefault();
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (!touch) continue;

      if (touch.identifier === this.touchIdFire) {
        this.touchIdFire = null;
        this.state.touchFire = false;
        if (!this.isAnyFireKeyPressed()) {
          this.state.fire = false;
        }
      }

      if (touch.identifier === this.touchIdMove) {
        this.touchIdMove = null;
        this.state.touchLeft = false;
        this.state.touchRight = false;
        if (!this.isAnyLeftKeyPressed()) this.state.moveLeft = false;
        if (!this.isAnyRightKeyPressed()) this.state.moveRight = false;
        this.state.pointerActive = false;
      }
    }
  }

  private handleTouchCancel(e: TouchEvent): void {
    this.handleTouchEnd(e);
  }

  private updateTouchSteering(clientX: number, rect: DOMRect | null, windowW: number): void {
    const centerX = rect && rect.width > 0 ? rect.left + rect.width / 2 : windowW / 2;
    const deadzone = 12;

    if (clientX < centerX - deadzone) {
      this.state.touchLeft = true;
      this.state.touchRight = false;
      this.state.moveLeft = true;
      this.state.moveRight = false;
    } else if (clientX > centerX + deadzone) {
      this.state.touchRight = true;
      this.state.touchLeft = false;
      this.state.moveRight = true;
      this.state.moveLeft = false;
    } else {
      this.state.touchLeft = false;
      this.state.touchRight = false;
      if (!this.isAnyLeftKeyPressed()) this.state.moveLeft = false;
      if (!this.isAnyRightKeyPressed()) this.state.moveRight = false;
    }
  }

  // ==========================================================================
  // Window Focus & Visibility Handlers
  // ==========================================================================

  private handleWindowBlur(): void {
    this.reset();
  }

  private handleVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.hidden) {
      this.reset();
    }
  }

  private notifyUserGesture(): void {
    if (!this.userGestureNotified) {
      this.userGestureNotified = true;
      this.onUserGesture?.();
    }
  }

  // ==========================================================================
  // Key Matcher Helpers
  // ==========================================================================

  private isLeftKey(code: string, key: string): boolean {
    return (
      code === 'ArrowLeft' ||
      code === 'KeyA' ||
      key === 'ArrowLeft' ||
      key === 'a' ||
      key === 'A'
    );
  }

  private isRightKey(code: string, key: string): boolean {
    return (
      code === 'ArrowRight' ||
      code === 'KeyD' ||
      key === 'ArrowRight' ||
      key === 'd' ||
      key === 'D'
    );
  }

  private isFireKey(code: string, key: string): boolean {
    return (
      code === 'Space' ||
      code === 'KeyZ' ||
      code === 'KeyK' ||
      code === 'KeyJ' ||
      key === ' ' ||
      key === 'z' ||
      key === 'Z' ||
      key === 'k' ||
      key === 'K' ||
      key === 'j' ||
      key === 'J'
    );
  }

  private isPauseKey(code: string, key: string): boolean {
    return (
      code === 'KeyP' ||
      code === 'Escape' ||
      key === 'p' ||
      key === 'P' ||
      key === 'Escape'
    );
  }

  private isRestartKey(code: string, key: string): boolean {
    return (
      code === 'Enter' ||
      code === 'KeyR' ||
      key === 'Enter' ||
      key === 'r' ||
      key === 'R'
    );
  }

  private isAnyLeftKeyPressed(): boolean {
    return (
      this.activeKeys.has('ArrowLeft') ||
      this.activeKeys.has('KeyA') ||
      this.activeKeys.has('a') ||
      this.activeKeys.has('A')
    );
  }

  private isAnyRightKeyPressed(): boolean {
    return (
      this.activeKeys.has('ArrowRight') ||
      this.activeKeys.has('KeyD') ||
      this.activeKeys.has('d') ||
      this.activeKeys.has('D')
    );
  }

  private isAnyFireKeyPressed(): boolean {
    const fireKeys = ['Space', ' ', 'KeyZ', 'z', 'Z', 'KeyK', 'k', 'K', 'KeyJ', 'j', 'J'];
    return fireKeys.some((k) => this.activeKeys.has(k));
  }
}
