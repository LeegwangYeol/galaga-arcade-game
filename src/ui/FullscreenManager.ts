/**
 * Galaga Arcade Web Game — Cross-Browser Fullscreen Manager
 * 
 * Provides robust HTML5 Fullscreen API management with standard W3C,
 * WebKit/Safari, Mozilla, and MS vendor fallbacks, event subscriptions,
 * keyboard shortcut handling (F / F11), dedicated toggle button helper,
 * and multi-stage viewport synchronization.
 */

import type { ScreenManager } from '../core/ScreenManager';

export type FullscreenChangeCallback = (isFullscreen: boolean) => void;
export type FullscreenErrorCallback = (error: Event | Error) => void;

export interface FullscreenManagerOptions {
  /** Target element or selector. Defaults to '#app-container' -> document.documentElement */
  target?: HTMLElement | string | null;
  /** ScreenManager instance to synchronize on fullscreen transitions */
  screenManager?: ScreenManager | null;
  /** Automatically recalculate canvas scaling on fullscreenchange. Default: true */
  syncViewport?: boolean;
  /** Bind 'F' and 'F11' keyboard shortcut. Default: true */
  bindKeyboardShortcut?: boolean;
}

interface VendorDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitCurrentFullScreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;

  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;

  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
}

interface VendorElement extends HTMLElement {
  webkitRequestFullscreen?: (options?: any) => Promise<void> | void;
  webkitRequestFullScreen?: (options?: any) => Promise<void> | void;
  mozRequestFullScreen?: (options?: any) => Promise<void> | void;
  msRequestFullscreen?: (options?: any) => Promise<void> | void;
}

export class FullscreenManager {
  private targetElement: HTMLElement | null = null;
  private screenManager: ScreenManager | null = null;
  private syncViewport: boolean = true;
  private bindKeyboardShortcut: boolean = true;

  private changeListeners: Set<FullscreenChangeCallback> = new Set();
  private errorListeners: Set<FullscreenErrorCallback> = new Set();
  private boundButtonUnbinders: Set<() => void> = new Set();

  private boundFullscreenChange: (e: Event) => void;
  private boundFullscreenError: (e: Event) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;

  private watchdogTimeout1: any = null;
  private watchdogTimeout2: any = null;

  constructor(options?: FullscreenManagerOptions) {
    this.screenManager = options?.screenManager ?? null;
    this.syncViewport = options?.syncViewport ?? true;
    this.bindKeyboardShortcut = options?.bindKeyboardShortcut ?? true;

    this.resolveTarget(options?.target);

    this.boundFullscreenChange = this.handleFullscreenChange.bind(this);
    this.boundFullscreenError = this.handleFullscreenError.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);

    this.attachEventListeners();
  }

  /**
   * Resolves the target element from options or DOM hierarchy.
   */
  public resolveTarget(target?: HTMLElement | string | null): HTMLElement | null {
    if (typeof document === 'undefined') return null;

    if (typeof target === 'string') {
      if (typeof document.querySelector === 'function') {
        this.targetElement = document.querySelector(target) as HTMLElement | null;
      } else if (typeof document.getElementById === 'function' && target.startsWith('#')) {
        this.targetElement = document.getElementById(target.slice(1)) as HTMLElement | null;
      }
    } else if (target && typeof target === 'object' && ('nodeType' in target || 'tagName' in target)) {
      this.targetElement = target as HTMLElement;
    }

    if (!this.targetElement) {
      this.targetElement =
        (typeof document.getElementById === 'function' ? (document.getElementById('app-container') as HTMLElement | null) : null) ||
        (typeof document.getElementById === 'function' ? (document.getElementById('game-container') as HTMLElement | null) : null) ||
        (document.documentElement as HTMLElement | null) ||
        (document.body as HTMLElement | null) ||
        null;
    }

    return this.targetElement;
  }

  /**
   * Sets or replaces the target element.
   */
  public setTarget(target: HTMLElement | string | null): void {
    this.targetElement = null;
    this.resolveTarget(target);
  }

  /**
   * Returns the currently resolved target element.
   */
  public getTarget(): HTMLElement | null {
    return this.targetElement;
  }

  /**
   * Sets or replaces the active ScreenManager reference.
   */
  public setScreenManager(screenManager: ScreenManager | null): void {
    this.screenManager = screenManager;
  }

  /**
   * Checks whether the current browser runtime supports the Fullscreen API.
   */
  public isSupported(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as VendorDocument;
    const el = (this.targetElement || doc.documentElement) as VendorElement | null;
    if (!el) return false;

    const hasRequest = Boolean(
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitRequestFullScreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen
    );

    const hasExit = Boolean(
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.webkitCancelFullScreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen
    );

    return hasRequest && hasExit;
  }

  /**
   * Returns true if the document or target element is currently in fullscreen mode.
   */
  public isFullscreen(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as VendorDocument;

    const fsElement =
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.webkitCurrentFullScreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      null;

    return fsElement !== null;
  }

  /**
   * Requests fullscreen mode on the target element with vendor fallback support.
   */
  public async requestFullscreen(): Promise<boolean> {
    if (typeof document === 'undefined') return false;
    if (this.isFullscreen()) return true;

    const target = this.targetElement || this.resolveTarget();
    if (!target) return false;

    const el = target as VendorElement;

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        const res = el.webkitRequestFullscreen();
        if (res instanceof Promise) await res;
      } else if (el.webkitRequestFullScreen) {
        const res = el.webkitRequestFullScreen();
        if (res instanceof Promise) await res;
      } else if (el.mozRequestFullScreen) {
        const res = el.mozRequestFullScreen();
        if (res instanceof Promise) await res;
      } else if (el.msRequestFullscreen) {
        const res = el.msRequestFullscreen();
        if (res instanceof Promise) await res;
      } else {
        return false;
      }

      this.triggerViewportSync();
      return true;
    } catch (err: any) {
      this.handleFullscreenError(err);
      return false;
    }
  }

  /**
   * Exits browser fullscreen mode with vendor fallback support.
   */
  public async exitFullscreen(): Promise<boolean> {
    if (typeof document === 'undefined') return false;
    if (!this.isFullscreen()) return true;

    const doc = document as VendorDocument;

    try {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        const res = doc.webkitExitFullscreen();
        if (res instanceof Promise) await res;
      } else if (doc.webkitCancelFullScreen) {
        const res = doc.webkitCancelFullScreen();
        if (res instanceof Promise) await res;
      } else if (doc.mozCancelFullScreen) {
        const res = doc.mozCancelFullScreen();
        if (res instanceof Promise) await res;
      } else if (doc.msExitFullscreen) {
        const res = doc.msExitFullscreen();
        if (res instanceof Promise) await res;
      } else {
        return false;
      }

      this.triggerViewportSync();
      return true;
    } catch (err: any) {
      this.handleFullscreenError(err);
      return false;
    }
  }

  /**
   * Toggles between fullscreen and windowed mode.
   * Returns a promise resolving to the new fullscreen state.
   */
  public async toggleFullscreen(): Promise<boolean> {
    if (this.isFullscreen()) {
      await this.exitFullscreen();
    } else {
      await this.requestFullscreen();
    }
    return this.isFullscreen();
  }

  /**
   * Subscribes to fullscreen change events. Invokes callback immediately with current state.
   */
  public onChange(callback: FullscreenChangeCallback): () => void {
    this.changeListeners.add(callback);
    try {
      callback(this.isFullscreen());
    } catch (err) {
      console.error('[FullscreenManager] Error in initial onChange listener:', err);
    }

    return () => {
      this.changeListeners.delete(callback);
    };
  }

  /**
   * Subscribes to fullscreen error events.
   */
  public onError(callback: FullscreenErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  /**
   * Binds a toggle button DOM element to synchronize icons, accessibility attributes,
   * and click interaction with fullscreen state.
   */
  public bindToggleButton(button: HTMLElement): () => void {
    const updateButtonState = (isFullscreen: boolean) => {
      if (button.textContent !== undefined) {
        button.textContent = isFullscreen ? '🗗' : '⛶';
      }
      button.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
      button.setAttribute('aria-label', isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen');
      if (button.classList) {
        if (isFullscreen) {
          button.classList.add('fullscreen-active');
        } else {
          button.classList.remove('fullscreen-active');
        }
      }
    };

    const clickHandler = (e: Event) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      this.toggleFullscreen().catch((err) => {
        this.handleFullscreenError(err);
      });
    };

    button.addEventListener('click', clickHandler);
    const unbindChange = this.onChange(updateButtonState);

    const unbind = () => {
      button.removeEventListener('click', clickHandler);
      unbindChange();
      this.boundButtonUnbinders.delete(unbind);
    };

    this.boundButtonUnbinders.add(unbind);
    return unbind;
  }

  /**
   * Forces multi-stage viewport synchronization on the associated ScreenManager.
   * Stage 1: Immediate synchronization
   * Stage 2: Next-frame RAF synchronization
   * Stage 3: Watchdog stabilization timeouts (150ms & 300ms)
   */
  public triggerViewportSync(): void {
    if (!this.syncViewport || !this.screenManager) return;

    // Stage 1: Immediate update
    try {
      this.screenManager.updateScalingImmediate();
    } catch (err) {
      console.warn('[FullscreenManager] Immediate viewport sync error:', err);
    }

    // Stage 2: Next frame RAF
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        try {
          this.screenManager?.updateScalingImmediate();
        } catch {
          // ignore
        }
      });
    }

    // Stage 3: Watchdog timeouts (150ms & 300ms)
    if (typeof setTimeout !== 'undefined') {
      if (this.watchdogTimeout1) clearTimeout(this.watchdogTimeout1);
      if (this.watchdogTimeout2) clearTimeout(this.watchdogTimeout2);

      this.watchdogTimeout1 = setTimeout(() => {
        this.watchdogTimeout1 = null;
        try {
          this.screenManager?.updateScalingImmediate();
        } catch {
          // ignore
        }
      }, 150);

      this.watchdogTimeout2 = setTimeout(() => {
        this.watchdogTimeout2 = null;
        try {
          this.screenManager?.updateScalingImmediate();
        } catch {
          // ignore
        }
      }, 300);
    }
  }

  /**
   * Detaches event listeners and clears observer sets.
   */
  public destroy(): void {
    this.detachEventListeners();
    if (this.watchdogTimeout1) {
      clearTimeout(this.watchdogTimeout1);
      this.watchdogTimeout1 = null;
    }
    if (this.watchdogTimeout2) {
      clearTimeout(this.watchdogTimeout2);
      this.watchdogTimeout2 = null;
    }
    for (const unbind of Array.from(this.boundButtonUnbinders)) {
      try {
        unbind();
      } catch (err) {
        console.error('[FullscreenManager] Error unbinding button in destroy:', err);
      }
    }
    this.boundButtonUnbinders.clear();
    this.changeListeners.clear();
    this.errorListeners.clear();
    this.targetElement = null;
    this.screenManager = null;
  }

  // ==========================================================================
  // Private Event Listeners
  // ==========================================================================

  private handleFullscreenChange(_e?: Event): void {
    const isFS = this.isFullscreen();
    if (this.targetElement && this.targetElement.classList) {
      if (isFS) {
        this.targetElement.classList.add('fullscreen');
      } else {
        this.targetElement.classList.remove('fullscreen');
      }
    }

    this.triggerViewportSync();

    for (const listener of this.changeListeners) {
      try {
        listener(isFS);
      } catch (err) {
        console.error('[FullscreenManager] Change listener error:', err);
      }
    }
  }

  private handleFullscreenError(e: Event | Error): void {
    console.warn('[FullscreenManager] Fullscreen error encountered:', e);
    for (const listener of this.errorListeners) {
      try {
        listener(e);
      } catch (err) {
        console.error('[FullscreenManager] Error listener error:', err);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.bindKeyboardShortcut) return;

    // Do not intercept when user is typing in form inputs
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as HTMLElement).isContentEditable)
    ) {
      return;
    }

    // Ignore if modifier keys are depressed (avoids intercepting Cmd+F, Ctrl+F, Alt+F, Shift+F)
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
      return;
    }

    const isF = e.code === 'KeyF' || e.key === 'f' || e.key === 'F';
    const isF11 = e.code === 'F11' || e.key === 'F11';

    if (isF || isF11) {
      if (e.cancelable) {
        e.preventDefault();
      }
      if (e.repeat) {
        return;
      }
      this.toggleFullscreen().catch((err) => {
        this.handleFullscreenError(err);
      });
    }
  }

  private attachEventListeners(): void {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('fullscreenchange', this.boundFullscreenChange);
      document.addEventListener('webkitfullscreenchange', this.boundFullscreenChange);
      document.addEventListener('mozfullscreenchange', this.boundFullscreenChange);
      document.addEventListener('MSFullscreenChange', this.boundFullscreenChange);

      document.addEventListener('fullscreenerror', this.boundFullscreenError);
      document.addEventListener('webkitfullscreenerror', this.boundFullscreenError);
      document.addEventListener('mozfullscreenerror', this.boundFullscreenError);
      document.addEventListener('MSFullscreenError', this.boundFullscreenError);
    }

    if (typeof window !== 'undefined' && this.bindKeyboardShortcut && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', this.boundKeyDown, { passive: false });
    }
  }

  private detachEventListeners(): void {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('fullscreenchange', this.boundFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', this.boundFullscreenChange);
      document.removeEventListener('mozfullscreenchange', this.boundFullscreenChange);
      document.removeEventListener('MSFullscreenChange', this.boundFullscreenChange);

      document.removeEventListener('fullscreenerror', this.boundFullscreenError);
      document.removeEventListener('webkitfullscreenerror', this.boundFullscreenError);
      document.removeEventListener('mozfullscreenerror', this.boundFullscreenError);
      document.removeEventListener('MSFullscreenError', this.boundFullscreenError);
    }

    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('keydown', this.boundKeyDown);
    }
  }
}
