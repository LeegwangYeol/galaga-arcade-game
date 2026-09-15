/**
 * Galaga Arcade Web Game — Unified Input Handler
 * 
 * Multi-modal input processing for Keyboard, Mouse, Pointer, and Mobile Touch virtual controls.
 * Supports discrete single-pulse action consumption ('fire', 'pause', 'restart'),
 * continuous direction states, non-scrolling touch zones, and virtual coordinate translation.
 */

import type { InputState, InputMode, DualInputState, PlayerId } from '../types';
import type { ScreenManager } from '../core/ScreenManager';
import { AudioContextManager } from '../audio/AudioContextManager';

/**
 * Mobile split-screen touch session descriptor.
 */
export interface PlayerTouchSession {
  id: number;
  playerId: 'p1' | 'p2';
  role: 'steer' | 'fire' | 'special';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  lastUpdateTime: number;
}

export class InputHandler {
  private canvas: HTMLCanvasElement | null;
  private screenManager: ScreenManager | null;
  private onUserGesture?: () => void;
  private userGestureNotified: boolean = false;

  // Operating mode ('single' or 'coop')
  private mode: InputMode = 'single';

  // Helper to generate a fresh zero-allocation InputState record
  private static createDefaultInputState(): InputState {
    return {
      moveLeft: false,
      moveRight: false,
      moveUp: false,
      moveDown: false,
      fire: false,
      pause: false,
      restart: false,
      pointerX: null,
      pointerActive: false,
      touchLeft: false,
      touchRight: false,
      touchFire: false,
      touchUp: false,
      touchDown: false,
    };
  }

  // Pre-allocated Zero-GC input states
  private state: InputState = InputHandler.createDefaultInputState();
  private stateP1: InputState = InputHandler.createDefaultInputState();
  private stateP2: InputState = InputHandler.createDefaultInputState();
  private idleState: InputState = InputHandler.createDefaultInputState();
  private dualState: DualInputState = { p1: this.stateP1, p2: this.stateP2 };

  // Discrete single-pulse action triggers (consumed on read)
  private fireTriggered: boolean = false;
  private p1FireTriggered: boolean = false;
  private p2FireTriggered: boolean = false;

  private pauseTriggered: boolean = false;
  private restartTriggered: boolean = false;

  private specialTriggered: boolean = false;
  private p1SpecialTriggered: boolean = false;
  private p2SpecialTriggered: boolean = false;

  private cycleSpecialTriggered: boolean = false;
  private p1CycleSpecialTriggered: boolean = false;
  private p2CycleSpecialTriggered: boolean = false;

  private select1PTriggered: boolean = false;
  private select2PTriggered: boolean = false;

  private p1DonateTriggered: boolean = false;
  private p2DonateTriggered: boolean = false;

  // Double-tap and Phase Warp tracking (Milestone M19 & M32)
  private lastLeftKeyDownTime: number = 0;
  private lastRightKeyDownTime: number = 0;
  private phaseWarpTriggered: number | null = null;

  private p1LastLeftKeyDownTime: number = 0;
  private p1LastRightKeyDownTime: number = 0;
  private p1PhaseWarpTriggered: number | null = null;

  private p2LastLeftKeyDownTime: number = 0;
  private p2LastRightKeyDownTime: number = 0;
  private p2PhaseWarpTriggered: number | null = null;

  // Last pointer tap in virtual coordinates for Title mode selection
  private lastPointerTapVirtual: { x: number; y: number } | null = null;

  // Set of actively depressed key codes for rollover handling
  private activeKeys = new Set<string>();

  // Touch identifiers for multi-touch separation (Single player)
  private touchIdMove: number | null = null;
  private touchIdFire: number | null = null;

  // Touch sessions for multi-player co-op split screen
  private touchSessions = new Map<number, PlayerTouchSession>();

  // Game keys requiring preventDefault to inhibit viewport scrolling
  private static readonly PREVENT_DEFAULT_KEYS = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
    'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyZ', 'KeyX', 'KeyC',
    'KeyV', 'KeyB', 'KeyN', 'KeyK', 'KeyJ', 'KeyM', 'KeyP',
    'Escape', 'Enter', 'Numpad0', 'Digit1', 'Digit2', 'Numpad1', 'Numpad2', 'KeyR',
    'ShiftLeft', 'ShiftRight', 'KeyL', 'KeyO', 'Period', 'NumpadDecimal',
    'Slash', '/',
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
  private domBtnSpecial: HTMLElement | null = null;

  // DOM touch button bound handlers
  private boundDomLeftDown: (e: Event) => void;
  private boundDomLeftUp: (e: Event) => void;
  private boundDomRightDown: (e: Event) => void;
  private boundDomRightUp: (e: Event) => void;
  private boundDomFireDown: (e: Event) => void;
  private boundDomFireUp: (e: Event) => void;
  private boundDomSpecialDown: (e: Event) => void;
  private boundDomSpecialUp: (e: Event) => void;

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
      this.triggerHaptic(10);
      this.state.touchLeft = true;
      this.state.moveLeft = true;
      this.domBtnLeft?.classList.add('active');

      const now = performance.now();
      if (now - this.lastLeftKeyDownTime <= 250) {
        this.phaseWarpTriggered = -1;
      }
      this.lastLeftKeyDownTime = now;
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
      this.triggerHaptic(10);
      this.state.touchRight = true;
      this.state.moveRight = true;
      this.domBtnRight?.classList.add('active');

      const now = performance.now();
      if (now - this.lastRightKeyDownTime <= 250) {
        this.phaseWarpTriggered = 1;
      }
      this.lastRightKeyDownTime = now;
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
      this.triggerHaptic(15);
      this.state.touchFire = true;
      this.state.fire = true;
      this.fireTriggered = true;
      this.restartTriggered = true;
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

    this.boundDomSpecialDown = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.notifyUserGesture();
      this.triggerHaptic(20);
      this.specialTriggered = true;
      this.domBtnSpecial?.classList.add('active');
    };
    this.boundDomSpecialUp = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      this.domBtnSpecial?.classList.remove('active');
    };

    this.attachEventListeners();
    this.attachDomTouchControls();
  }

  // ==========================================================================
  // Public Interface
  // ==========================================================================

  public setMode(mode: InputMode): void {
    this.mode = mode;
    this.reset();
  }

  public getMode(): InputMode {
    return this.mode;
  }

  public isCoop(): boolean {
    return this.mode === 'coop';
  }

  /**
   * Returns a readonly snapshot of current continuous input states (100% backward compatible).
   */
  public getState(): Readonly<InputState> {
    this.pollGamepad();
    return this.state;
  }

  /**
   * Returns discrete channel input state for Player 1 or Player 2.
   */
  public getInputState(playerId: PlayerId = 'p1'): Readonly<InputState> {
    this.pollGamepad();
    if (this.mode === 'single') {
      return playerId === 'p1' ? this.state : this.idleState;
    }
    return playerId === 'p2' ? this.stateP2 : this.stateP1;
  }

  /**
   * Returns zero-allocation dual-channel input state structure.
   */
  public getDualInputState(): DualInputState {
    this.pollGamepad();
    return this.dualState;
  }

  private pollGamepad(): void {
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        const gamepads = navigator.getGamepads();
        if (gamepads) {
          for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp) continue;
            // Buttons 2 (X / Square) or 1 (B / Circle)
            if (gp.buttons[2]?.pressed || gp.buttons[1]?.pressed) {
              this.specialTriggered = true;
              this.p1SpecialTriggered = true;
            }
            // Bumpers 4 (L1) or 5 (R1)
            if (gp.buttons[4]?.pressed || gp.buttons[5]?.pressed) {
              this.cycleSpecialTriggered = true;
              this.p1CycleSpecialTriggered = true;
            }
          }
        }
      } catch {
        // Ignored if gamepads unavailable
      }
    }
  }

  /**
   * Consumes and returns a discrete pulse action flag.
   * Ensures actions such as firing a single missile or toggling pause
   * execute exactly once per user trigger.
   */
  public consumeAction(
    action: 'fire' | 'pause' | 'restart' | 'special' | 'specialMove' | 'cycleSpecial' | 'phaseWarp' | 'phaseDrive' | 'shift' | 'select1P' | 'select2P' | string,
    playerId?: PlayerId
  ): boolean {
    if (action === 'select1P') {
      const v = this.select1PTriggered;
      this.select1PTriggered = false;
      return v;
    }
    if (action === 'select2P') {
      const v = this.select2PTriggered;
      this.select2PTriggered = false;
      return v;
    }
    if (action === 'pause') {
      const v = this.pauseTriggered;
      this.pauseTriggered = false;
      return v;
    }
    if (action === 'restart') {
      const v = this.restartTriggered;
      this.restartTriggered = false;
      return v;
    }
    if (action === 'fire') {
      let v = false;
      if (playerId === 'p2') { v = this.p2FireTriggered; this.p2FireTriggered = false; }
      else if (playerId === 'p1') { v = this.p1FireTriggered; this.p1FireTriggered = false; }
      else if (this.mode === 'coop') { v = this.p1FireTriggered || this.p2FireTriggered; this.p1FireTriggered = false; this.p2FireTriggered = false; }
      else { v = this.fireTriggered || this.p1FireTriggered; this.fireTriggered = false; this.p1FireTriggered = false; }
      return v;
    }
    if (action === 'special' || action === 'specialMove') {
      let v = false;
      if (playerId === 'p2') { v = this.p2SpecialTriggered; this.p2SpecialTriggered = false; }
      else if (playerId === 'p1') { v = this.p1SpecialTriggered; this.p1SpecialTriggered = false; }
      else if (this.mode === 'coop') { v = this.p1SpecialTriggered || this.p2SpecialTriggered; this.p1SpecialTriggered = false; this.p2SpecialTriggered = false; }
      else { v = this.specialTriggered || this.p1SpecialTriggered; this.specialTriggered = false; this.p1SpecialTriggered = false; }
      return v;
    }
    if (action === 'cycleSpecial') {
      let v = false;
      if (playerId === 'p2') { v = this.p2CycleSpecialTriggered; this.p2CycleSpecialTriggered = false; }
      else { v = this.cycleSpecialTriggered || this.p1CycleSpecialTriggered; this.cycleSpecialTriggered = false; this.p1CycleSpecialTriggered = false; }
      return v;
    }

    if (action === 'phaseWarp' || action === 'phaseDrive' || action === 'shift') {
      if (playerId === 'p2') {
        const val = this.p2PhaseWarpTriggered !== null;
        this.p2PhaseWarpTriggered = null;
        return val;
      }
      if (playerId === 'p1') {
        const val = this.p1PhaseWarpTriggered !== null;
        this.p1PhaseWarpTriggered = null;
        return val;
      }
      const val = this.phaseWarpTriggered !== null || this.p1PhaseWarpTriggered !== null;
      this.phaseWarpTriggered = null;
      this.p1PhaseWarpTriggered = null;
      return val;
    }

    if (action === 'donateLife') {
      if (playerId === 'p1') {
        const v = this.p1DonateTriggered;
        this.p1DonateTriggered = false;
        return v;
      }
      if (playerId === 'p2') {
        const v = this.p2DonateTriggered;
        this.p2DonateTriggered = false;
        return v;
      }
      const anyDonate = this.p1DonateTriggered || this.p2DonateTriggered;
      this.p1DonateTriggered = false;
      this.p2DonateTriggered = false;
      return anyDonate;
    }

    return false;
  }

  /**
   * Consumes single-pulse Phase Warp trigger (-1 for left, +1 for right, null if inactive)
   */
  public consumePhaseWarp(playerId: PlayerId = 'p1'): number | null {
    if (playerId === 'p2') {
      const val = this.p2PhaseWarpTriggered;
      this.p2PhaseWarpTriggered = null;
      return val;
    }
    const val = this.p1PhaseWarpTriggered ?? this.phaseWarpTriggered;
    this.p1PhaseWarpTriggered = null;
    this.phaseWarpTriggered = null;
    return val;
  }

  /**
   * Consumes last pointer tap virtual coordinate (for title screen selection)
   */
  public consumePointerTap(): { x: number; y: number } | null {
    const tap = this.lastPointerTapVirtual;
    this.lastPointerTapVirtual = null;
    return tap;
  }

  private clearInputState(target: InputState): void {
    target.moveLeft = false;
    target.moveRight = false;
    target.moveUp = false;
    target.moveDown = false;
    target.fire = false;
    target.pause = false;
    target.restart = false;
    target.pointerX = null;
    target.pointerActive = false;
    target.touchLeft = false;
    target.touchRight = false;
    target.touchFire = false;
    target.touchUp = false;
    target.touchDown = false;
  }

  /**
   * Clears all active input states, buffers, and touch sessions.
   */
  public reset(): void {
    this.activeKeys.clear();
    this.clearInputState(this.state);
    this.clearInputState(this.stateP1);
    this.clearInputState(this.stateP2);
    this.touchSessions.clear();
    this.touchIdMove = null;
    this.touchIdFire = null;

    this.fireTriggered = false;
    this.p1FireTriggered = false;
    this.p2FireTriggered = false;
    this.pauseTriggered = false;
    this.restartTriggered = false;
    this.specialTriggered = false;
    this.p1SpecialTriggered = false;
    this.p2SpecialTriggered = false;
    this.cycleSpecialTriggered = false;
    this.p1CycleSpecialTriggered = false;
    this.p2CycleSpecialTriggered = false;
    this.phaseWarpTriggered = null;
    this.p1PhaseWarpTriggered = null;
    this.p2PhaseWarpTriggered = null;
    this.select1PTriggered = false;
    this.select2PTriggered = false;
    this.p1DonateTriggered = false;
    this.p2DonateTriggered = false;
    this.lastPointerTapVirtual = null;
    this.lastLeftKeyDownTime = 0;
    this.lastRightKeyDownTime = 0;
    this.p1LastLeftKeyDownTime = 0;
    this.p1LastRightKeyDownTime = 0;
    this.p2LastLeftKeyDownTime = 0;
    this.p2LastRightKeyDownTime = 0;

    this.domBtnLeft?.classList.remove('active');
    this.domBtnRight?.classList.remove('active');
    this.domBtnFire?.classList.remove('active');
    this.domBtnSpecial?.classList.remove('active');
  }

  /**
   * Renders zero-GC procedural Canvas 2D touch guides in co-op mode.
   */
  public renderTouchGuides(ctx: CanvasRenderingContext2D): void {
    if (this.mode !== 'coop') return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Center divider at X = 112 (virtual width 224)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(112, 0);
    ctx.lineTo(112, 288);
    ctx.stroke();
    ctx.setLineDash([]);

    // 1P and 2P Zone indicators at the bottom
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.fillText('1P ZONE', 56, 280);

    ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
    ctx.fillText('2P ZONE', 168, 280);

    // Render active steering thumbsticks if any
    for (const session of this.touchSessions.values()) {
      if (session.role !== 'steer') continue;
      const isP1 = session.playerId === 'p1';
      const color = isP1 ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 68, 68, 0.5)';
      const puckColor = isP1 ? 'rgba(0, 255, 255, 0.8)' : 'rgba(255, 68, 68, 0.8)';

      let virtAnchorX = isP1 ? 56 : 168;
      let virtAnchorY = 240;
      let virtCurrentX = virtAnchorX;
      let virtCurrentY = virtAnchorY;

      if (this.screenManager) {
        const a = this.screenManager.clientToVirtual(session.startX, session.startY);
        const c = this.screenManager.clientToVirtual(session.currentX, session.currentY);
        if (a) {
          virtAnchorX = a.x;
          virtAnchorY = a.y;
        }
        if (c) {
          virtCurrentX = c.x;
          virtCurrentY = c.y;
        }
      }

      // Outer ring
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(virtAnchorX, virtAnchorY, 16, 0, Math.PI * 2);
      ctx.stroke();

      // Inner puck
      const dx = virtCurrentX - virtAnchorX;
      const dy = virtCurrentY - virtAnchorY;

      if (
        !Number.isFinite(virtCurrentX) ||
        !Number.isFinite(virtCurrentY) ||
        !Number.isFinite(dx) ||
        !Number.isFinite(dy)
      ) {
        continue;
      }

      const dist = Math.hypot(dx, dy);
      const maxR = 16;
      const puckX = dist > maxR ? virtAnchorX + (dx / dist) * maxR : virtCurrentX;
      const puckY = dist > maxR ? virtAnchorY + (dy / dist) * maxR : virtCurrentY;

      ctx.fillStyle = puckColor;
      ctx.beginPath();
      ctx.arc(puckX, puckY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }



  /**
   * Detaches all DOM and window event listeners and frees references.
   */
  public destroy(): void {
    this.detachEventListeners();
    this.detachDomTouchControls();
    this.reset();
    this.canvas = null;
    this.domBtnLeft = null;
    this.domBtnRight = null;
    this.domBtnFire = null;
    this.domBtnSpecial = null;
    this.screenManager = null;
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

    this.domBtnSpecial = document.getElementById('btn-special');
    if (this.domBtnSpecial) {
      this.domBtnSpecial.addEventListener('touchstart', this.boundDomSpecialDown, { passive: false });
      this.domBtnSpecial.addEventListener('touchend', this.boundDomSpecialUp, { passive: false });
      this.domBtnSpecial.addEventListener('touchcancel', this.boundDomSpecialUp, { passive: false });
      this.domBtnSpecial.addEventListener('mousedown', this.boundDomSpecialDown);
      this.domBtnSpecial.addEventListener('mouseup', this.boundDomSpecialUp);
      this.domBtnSpecial.addEventListener('mouseleave', this.boundDomSpecialUp);
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

    if (this.domBtnSpecial) {
      this.domBtnSpecial.removeEventListener('touchstart', this.boundDomSpecialDown);
      this.domBtnSpecial.removeEventListener('touchend', this.boundDomSpecialUp);
      this.domBtnSpecial.removeEventListener('touchcancel', this.boundDomSpecialUp);
      this.domBtnSpecial.removeEventListener('mousedown', this.boundDomSpecialDown);
      this.domBtnSpecial.removeEventListener('mouseup', this.boundDomSpecialUp);
      this.domBtnSpecial.removeEventListener('mouseleave', this.boundDomSpecialUp);
    }
  }

  // ==========================================================================
  // Keyboard Event Handlers
  // ==========================================================================

  public handleKeyDown(e: KeyboardEvent): void {
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

    // Mode Selection Keys
    if (this.isSelect1PKey(e.code, e.key)) {
      if (!isRepeat) {
        this.select1PTriggered = true;
      }
    }
    if (this.isSelect2PKey(e.code, e.key)) {
      if (!isRepeat) {
        this.select2PTriggered = true;
      }
    }

    // Global Pause Toggle
    if (this.isPauseKey(e.code, e.key)) {
      this.state.pause = true;
      this.stateP1.pause = true;
      this.stateP2.pause = true;
      if (!isRepeat) {
        this.pauseTriggered = true;
      }
    }

    // Global Restart / Start Action
    if (this.isRestartKey(e.code, e.key)) {
      this.state.restart = true;
      this.stateP1.restart = true;
      this.stateP2.restart = true;
      if (!isRepeat) {
        this.restartTriggered = true;
      }
    }

    if (this.mode === 'single') {
      if (this.isLeftKey(e.code, e.key)) {
        this.state.moveLeft = true;
        this.state.pointerActive = false;
        if (!isRepeat) {
          const now = performance.now();
          if (now - this.lastLeftKeyDownTime <= 250) this.phaseWarpTriggered = -1;
          this.lastLeftKeyDownTime = now;
        }
      }
      if (this.isRightKey(e.code, e.key)) {
        this.state.moveRight = true;
        this.state.pointerActive = false;
        if (!isRepeat) {
          const now = performance.now();
          if (now - this.lastRightKeyDownTime <= 250) this.phaseWarpTriggered = 1;
          this.lastRightKeyDownTime = now;
        }
      }
      if (this.isUpKey(e.code, e.key)) this.state.moveUp = true;
      if (this.isDownKey(e.code, e.key)) this.state.moveDown = true;
      if (this.isShiftKey(e.code, e.key) && !isRepeat) {
        this.phaseWarpTriggered = this.state.moveLeft ? -1 : 1;
      }
      if (this.isFireKey(e.code, e.key)) {
        this.state.fire = true;
        if (!isRepeat) this.fireTriggered = true;
      }
      if (this.isSpecialKey(e.code, e.key) && !isRepeat) this.specialTriggered = true;
      if (this.isCycleSpecialKey(e.code, e.key) && !isRepeat) this.cycleSpecialTriggered = true;
    } else {
      // Co-op Mode: P1
      if (this.isP1LeftKey(e.code, e.key)) {
        this.stateP1.moveLeft = true;
        this.stateP1.pointerActive = false;
        if (!isRepeat) {
          const now = performance.now();
          if (now - this.p1LastLeftKeyDownTime <= 250) this.p1PhaseWarpTriggered = -1;
          this.p1LastLeftKeyDownTime = now;
        }
      }
      if (this.isP1RightKey(e.code, e.key)) {
        this.stateP1.moveRight = true;
        this.stateP1.pointerActive = false;
        if (!isRepeat) {
          const now = performance.now();
          if (now - this.p1LastRightKeyDownTime <= 250) this.p1PhaseWarpTriggered = 1;
          this.p1LastRightKeyDownTime = now;
        }
      }
      if (this.isP1UpKey(e.code, e.key)) this.stateP1.moveUp = true;
      if (this.isP1DownKey(e.code, e.key)) this.stateP1.moveDown = true;
      if (this.isP1FireKey(e.code, e.key)) {
        this.stateP1.fire = true;
        if (!isRepeat) this.p1FireTriggered = true;
      }
      if (this.isP1SpecialKey(e.code, e.key) && !isRepeat) this.p1SpecialTriggered = true;
      if (this.isP1CycleSpecialKey(e.code, e.key) && !isRepeat) this.p1CycleSpecialTriggered = true;
      if (this.isP1DonateKey(e.code, e.key) && !isRepeat) this.p1DonateTriggered = true;
      if (e.code === 'ShiftLeft' && !isRepeat) {
        this.p1PhaseWarpTriggered = this.stateP1.moveLeft ? -1 : 1;
      }

      // Co-op Mode: P2
      if (this.isP2LeftKey(e.code, e.key)) {
        this.stateP2.moveLeft = true;
        this.stateP2.pointerActive = false;
        if (!isRepeat) {
          const now = performance.now();
          if (now - this.p2LastLeftKeyDownTime <= 250) this.p2PhaseWarpTriggered = -1;
          this.p2LastLeftKeyDownTime = now;
        }
      }
      if (this.isP2RightKey(e.code, e.key)) {
        this.stateP2.moveRight = true;
        this.stateP2.pointerActive = false;
        if (!isRepeat) {
          const now = performance.now();
          if (now - this.p2LastRightKeyDownTime <= 250) this.p2PhaseWarpTriggered = 1;
          this.p2LastRightKeyDownTime = now;
        }
      }
      if (this.isP2UpKey(e.code, e.key)) this.stateP2.moveUp = true;
      if (this.isP2DownKey(e.code, e.key)) this.stateP2.moveDown = true;
      if (this.isP2FireKey(e.code, e.key)) {
        this.stateP2.fire = true;
        if (!isRepeat) this.p2FireTriggered = true;
      }
      if (this.isP2SpecialKey(e.code, e.key) && !isRepeat) this.p2SpecialTriggered = true;
      if (this.isP2DonateKey(e.code, e.key) && !isRepeat) this.p2DonateTriggered = true;
      if (e.code === 'ShiftRight' && !isRepeat) {
        this.p2PhaseWarpTriggered = this.stateP2.moveLeft ? -1 : 1;
      }
    }
  }

  public handleKeyUp(e: KeyboardEvent): void {
    this.activeKeys.delete(e.code);
    this.activeKeys.delete(e.key);

    if (this.isPauseKey(e.code, e.key)) {
      this.state.pause = false;
      this.stateP1.pause = false;
      this.stateP2.pause = false;
    }
    if (this.isRestartKey(e.code, e.key)) {
      this.state.restart = false;
      this.stateP1.restart = false;
      this.stateP2.restart = false;
    }

    if (this.mode === 'single') {
      if (this.isLeftKey(e.code, e.key) && !this.isAnyLeftKeyPressed() && !this.state.touchLeft) this.state.moveLeft = false;
      if (this.isRightKey(e.code, e.key) && !this.isAnyRightKeyPressed() && !this.state.touchRight) this.state.moveRight = false;
      if (this.isUpKey(e.code, e.key) && !this.isAnyUpKeyPressed()) this.state.moveUp = false;
      if (this.isDownKey(e.code, e.key) && !this.isAnyDownKeyPressed()) this.state.moveDown = false;
      if (this.isFireKey(e.code, e.key) && !this.isAnyFireKeyPressed() && !this.state.touchFire) this.state.fire = false;
    } else {
      if (this.isP1LeftKey(e.code, e.key) && !this.isAnyP1LeftKeyPressed() && !this.stateP1.touchLeft) this.stateP1.moveLeft = false;
      if (this.isP1RightKey(e.code, e.key) && !this.isAnyP1RightKeyPressed() && !this.stateP1.touchRight) this.stateP1.moveRight = false;
      if (this.isP1UpKey(e.code, e.key) && !this.isAnyP1UpKeyPressed()) this.stateP1.moveUp = false;
      if (this.isP1DownKey(e.code, e.key) && !this.isAnyP1DownKeyPressed()) this.stateP1.moveDown = false;
      if (this.isP1FireKey(e.code, e.key) && !this.isAnyP1FireKeyPressed() && !this.stateP1.touchFire) this.stateP1.fire = false;

      if (this.isP2LeftKey(e.code, e.key) && !this.isAnyP2LeftKeyPressed() && !this.stateP2.touchLeft) this.stateP2.moveLeft = false;
      if (this.isP2RightKey(e.code, e.key) && !this.isAnyP2RightKeyPressed() && !this.stateP2.touchRight) this.stateP2.moveRight = false;
      if (this.isP2UpKey(e.code, e.key) && !this.isAnyP2UpKeyPressed()) this.stateP2.moveUp = false;
      if (this.isP2DownKey(e.code, e.key) && !this.isAnyP2DownKeyPressed()) this.stateP2.moveDown = false;
      if (this.isP2FireKey(e.code, e.key) && !this.isAnyP2FireKeyPressed() && !this.stateP2.touchFire) this.stateP2.fire = false;
    }
  }

  // ==========================================================================
  // Pointer & Mouse Event Handlers
  // ==========================================================================

  private handlePointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      return;
    }
    this.notifyUserGesture();
    this.triggerHaptic(12);
    this.state.fire = true;
    this.fireTriggered = true;
    this.restartTriggered = true;
    this.updatePointerCoordinates(e.clientX, e.clientY);

    // Save tap coordinate for title screen mode selection
    if (this.screenManager) {
      const virtual = this.screenManager.clientToVirtual(e.clientX, e.clientY, true);
      if (virtual) {
        this.lastPointerTapVirtual = { x: virtual.x, y: virtual.y };
      }
    } else if (this.canvas && this.canvas.getBoundingClientRect) {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const vx = ((e.clientX - rect.left) / rect.width) * 224;
        const vy = ((e.clientY - rect.top) / rect.height) * 288;
        this.lastPointerTapVirtual = { x: vx, y: vy };
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      return;
    }
    if (e.buttons > 0 || e.pointerType === 'mouse' || this.state.pointerActive) {
      this.updatePointerCoordinates(e.clientX, e.clientY);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      return;
    }
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
      const virtual = this.screenManager.clientToVirtual(clientX, clientY, true);
      if (virtual) {
        const clampedX = Math.max(8, Math.min(216, virtual.x));
        this.state.pointerX = clampedX;
        this.state.pointerActive = true;
      }
    } else if (this.canvas && this.canvas.getBoundingClientRect) {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0) {
        const normalizedX = (clientX - rect.left) / rect.width;
        const virtualX = normalizedX * 224;
        const clampedX = Math.max(8, Math.min(216, virtualX));
        this.state.pointerX = clampedX;
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

    // Record first touch coordinates for title screen mode selection
    if (e.changedTouches.length > 0 && e.changedTouches[0]) {
      const firstTouch = e.changedTouches[0];
      if (this.screenManager) {
        const virt = this.screenManager.clientToVirtual(firstTouch.clientX, firstTouch.clientY, true);
        if (virt) {
          this.lastPointerTapVirtual = { x: virt.x, y: virt.y };
        }
      } else if (rect && rect.width > 0 && rect.height > 0) {
        const vx = ((firstTouch.clientX - rect.left) / rect.width) * 224;
        const vy = ((firstTouch.clientY - rect.top) / rect.height) * 288;
        this.lastPointerTapVirtual = { x: vx, y: vy };
      }
    }

    if (this.mode === 'single') {
      // Single-player legacy touch handling
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (!touch) continue;

        const clientX = touch.clientX;
        const clientY = touch.clientY;

        const isFireZone =
          (clientX > windowW * 0.65 && clientY > windowH * 0.6) ||
          (rect && rect.width > 0 && clientX > rect.left + rect.width * 0.65 && clientY > rect.top + rect.height * 0.6);

        if (isFireZone) {
          this.touchIdFire = touch.identifier;
          this.state.touchFire = true;
          this.state.fire = true;
          this.fireTriggered = true;
          this.restartTriggered = true;
          this.triggerHaptic(15);
        } else {
          this.touchIdMove = touch.identifier;
          this.updatePointerCoordinates(clientX, clientY);
          this.updateTouchSteering(clientX, rect, windowW);
          this.triggerHaptic(8);
        }
      }
    } else {
      // Co-op Mode: Split-Screen Touch with Session Isolation
      const midX = rect && rect.width > 0 ? rect.left + rect.width / 2 : windowW / 2;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (!touch) continue;

        const clientX = touch.clientX;
        const clientY = touch.clientY;

        // Player allocation based on contact coordinate
        const playerId: 'p1' | 'p2' = clientX < midX ? 'p1' : 'p2';
        const hLeft = playerId === 'p1' ? (rect && rect.width > 0 ? rect.left : 0) : midX;
        const hWidth = (rect && rect.width > 0 ? rect.width : windowW) / 2;
        const hTop = rect && rect.height > 0 ? rect.top : 0;
        const hHeight = rect && rect.height > 0 ? rect.height : windowH;

        // Sub-zone check
        const isActionZone = clientX >= hLeft + hWidth * 0.65;
        let role: 'steer' | 'fire' | 'special' = 'steer';

        if (isActionZone) {
          if (clientY < hTop + hHeight * 0.55) {
            role = 'special';
            if (playerId === 'p1') {
              this.p1SpecialTriggered = true;
            } else {
              this.p2SpecialTriggered = true;
            }
            this.triggerHaptic(20);
          } else {
            role = 'fire';
            if (playerId === 'p1') {
              this.stateP1.touchFire = true;
              this.stateP1.fire = true;
              this.p1FireTriggered = true;
            } else {
              this.stateP2.touchFire = true;
              this.stateP2.fire = true;
              this.p2FireTriggered = true;
            }
            this.triggerHaptic(15);
          }
        } else {
          role = 'steer';
          this.triggerHaptic(8);
        }

        const session: PlayerTouchSession = {
          id: touch.identifier,
          playerId,
          role,
          startX: clientX,
          startY: clientY,
          currentX: clientX,
          currentY: clientY,
          startTime: performance.now(),
          lastUpdateTime: performance.now(),
        };

        this.touchSessions.set(touch.identifier, session);
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.cancelable) {
      e.preventDefault();
    }

    const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    const windowW = typeof window !== 'undefined' ? window.innerWidth : 375;

    if (this.mode === 'single') {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (!touch) continue;

        if (touch.identifier === this.touchIdMove) {
          this.updatePointerCoordinates(touch.clientX, touch.clientY);
          this.updateTouchSteering(touch.clientX, rect, windowW);
        }
      }
    } else {
      // Co-op mode: updates existing sessions without player crossing
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (!touch) continue;

        const session = this.touchSessions.get(touch.identifier);
        if (!session) continue;

        session.currentX = touch.clientX;
        session.currentY = touch.clientY;
        session.lastUpdateTime = performance.now();

        if (session.role === 'steer') {
          const deltaX = touch.clientX - session.startX;
          const deadzone = 10;
          const targetState = session.playerId === 'p2' ? this.stateP2 : this.stateP1;

          if (deltaX < -deadzone) {
            targetState.touchLeft = true;
            targetState.touchRight = false;
            targetState.moveLeft = true;
            targetState.moveRight = false;
          } else if (deltaX > deadzone) {
            targetState.touchRight = true;
            targetState.touchLeft = false;
            targetState.moveRight = true;
            targetState.moveLeft = false;
          } else {
            targetState.touchLeft = false;
            targetState.touchRight = false;
            if (session.playerId === 'p1') {
              if (!this.isAnyP1LeftKeyPressed()) targetState.moveLeft = false;
              if (!this.isAnyP1RightKeyPressed()) targetState.moveRight = false;
            } else {
              if (!this.isAnyP2LeftKeyPressed()) targetState.moveLeft = false;
              if (!this.isAnyP2RightKeyPressed()) targetState.moveRight = false;
            }
          }
        }
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.cancelable) {
      e.preventDefault();
    }

    if (this.mode === 'single') {
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
          if (!this.isAnyLeftKeyPressed()) {
            this.state.moveLeft = false;
          }
          if (!this.isAnyRightKeyPressed()) {
            this.state.moveRight = false;
          }
          this.state.pointerActive = false;
        }
      }
    } else {
      // Co-op mode: end specific touch session
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (!touch) continue;

        const session = this.touchSessions.get(touch.identifier);
        if (!session) continue;

        this.touchSessions.delete(touch.identifier);

        const targetState = session.playerId === 'p2' ? this.stateP2 : this.stateP1;

        if (session.role === 'fire') {
          let hasRemainingFire = false;
          for (const s of this.touchSessions.values()) {
            if (s.playerId === session.playerId && s.role === 'fire') {
              hasRemainingFire = true;
              break;
            }
          }

          if (hasRemainingFire) {
            targetState.touchFire = true;
            targetState.fire = true;
          } else {
            targetState.touchFire = false;
            if (session.playerId === 'p1') {
              if (!this.isAnyP1FireKeyPressed()) targetState.fire = false;
            } else {
              if (!this.isAnyP2FireKeyPressed()) targetState.fire = false;
            }
          }
        } else if (session.role === 'steer') {
          let remainingSteerSession: PlayerTouchSession | null = null;
          for (const s of this.touchSessions.values()) {
            if (s.playerId === session.playerId && s.role === 'steer') {
              remainingSteerSession = s;
              break;
            }
          }

          if (remainingSteerSession) {
            const deltaX = remainingSteerSession.currentX - remainingSteerSession.startX;
            const deadzone = 10;
            if (deltaX < -deadzone) {
              targetState.touchLeft = true;
              targetState.touchRight = false;
              targetState.moveLeft = true;
              targetState.moveRight = false;
            } else if (deltaX > deadzone) {
              targetState.touchRight = true;
              targetState.touchLeft = false;
              targetState.moveRight = true;
              targetState.moveLeft = false;
            } else {
              targetState.touchLeft = false;
              targetState.touchRight = false;
              if (session.playerId === 'p1') {
                if (!this.isAnyP1LeftKeyPressed()) targetState.moveLeft = false;
                if (!this.isAnyP1RightKeyPressed()) targetState.moveRight = false;
              } else {
                if (!this.isAnyP2LeftKeyPressed()) targetState.moveLeft = false;
                if (!this.isAnyP2RightKeyPressed()) targetState.moveRight = false;
              }
            }
          } else {
            targetState.touchLeft = false;
            targetState.touchRight = false;
            if (session.playerId === 'p1') {
              if (!this.isAnyP1LeftKeyPressed()) targetState.moveLeft = false;
              if (!this.isAnyP1RightKeyPressed()) targetState.moveRight = false;
            } else {
              if (!this.isAnyP2LeftKeyPressed()) targetState.moveLeft = false;
              if (!this.isAnyP2RightKeyPressed()) targetState.moveRight = false;
            }
          }
        }
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
    if (typeof document !== 'undefined') {
      if (document.hidden) {
        this.reset();
        AudioContextManager.suspend();
      } else {
        AudioContextManager.resume();
      }
    }
  }

  private notifyUserGesture(): void {
    if (!this.userGestureNotified) {
      this.userGestureNotified = true;
      this.onUserGesture?.();
    }
  }

  private triggerHaptic(durationMs: number): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(durationMs);
      }
    } catch {
      // Graceful fallback on devices that restrict vibration
    }
  }

  private isSelect1PKey(c: string, k: string): boolean { return c === 'Digit1' || c === 'Numpad1' || k === '1'; }
  private isSelect2PKey(c: string, k: string): boolean { return c === 'Digit2' || c === 'Numpad2' || k === '2'; }
  private isP1LeftKey(c: string, k: string): boolean { return c === 'KeyA' || k === 'a' || k === 'A'; }
  private isP1RightKey(c: string, k: string): boolean { return c === 'KeyD' || k === 'd' || k === 'D'; }
  private isP1UpKey(c: string, k: string): boolean { return c === 'KeyW' || k === 'w' || k === 'W'; }
  private isP1DownKey(c: string, k: string): boolean { return c === 'KeyS' || k === 's' || k === 'S'; }
  private isP1FireKey(c: string, k: string): boolean { return c === 'Space' || k === ' '; }
  private isP1SpecialKey(c: string, k: string): boolean { return c === 'KeyX' || k === 'x' || k === 'X'; }
  private isP1CycleSpecialKey(c: string, k: string): boolean { return c === 'KeyC' || k === 'c' || k === 'C'; }
  private isP1DonateKey(c: string, k: string): boolean { return c === 'KeyL' || k === 'l' || k === 'L'; }
  private isP2LeftKey(c: string, k: string): boolean { return c === 'ArrowLeft' || k === 'ArrowLeft'; }
  private isP2RightKey(c: string, k: string): boolean { return c === 'ArrowRight' || k === 'ArrowRight'; }
  private isP2UpKey(c: string, k: string): boolean { return c === 'ArrowUp' || k === 'ArrowUp'; }
  private isP2DownKey(c: string, k: string): boolean { return c === 'ArrowDown' || k === 'ArrowDown'; }
  private isP2FireKey(c: string, k: string): boolean { return c === 'Enter' || c === 'Numpad0' || k === 'Enter'; }
  private isP2SpecialKey(c: string, k: string): boolean { return c === 'KeyM' || k === 'm' || k === 'M'; }
  private isP2DonateKey(c: string, k: string): boolean {
    return c === 'NumpadDecimal' || c === 'Period' || k === '.' || c === 'KeyO' || k === 'o' || k === 'O';
  }
  private isAnyP1LeftKeyPressed(): boolean { return this.activeKeys.has('KeyA') || this.activeKeys.has('a') || this.activeKeys.has('A'); }
  private isAnyP1RightKeyPressed(): boolean { return this.activeKeys.has('KeyD') || this.activeKeys.has('d') || this.activeKeys.has('D'); }
  private isAnyP1UpKeyPressed(): boolean { return this.activeKeys.has('KeyW') || this.activeKeys.has('w') || this.activeKeys.has('W'); }
  private isAnyP1DownKeyPressed(): boolean { return this.activeKeys.has('KeyS') || this.activeKeys.has('s') || this.activeKeys.has('S'); }
  private isAnyP1FireKeyPressed(): boolean { return this.activeKeys.has('Space') || this.activeKeys.has(' '); }
  private isAnyP2LeftKeyPressed(): boolean { return this.activeKeys.has('ArrowLeft'); }
  private isAnyP2RightKeyPressed(): boolean { return this.activeKeys.has('ArrowRight'); }
  private isAnyP2UpKeyPressed(): boolean { return this.activeKeys.has('ArrowUp'); }
  private isAnyP2DownKeyPressed(): boolean { return this.activeKeys.has('ArrowDown'); }
  private isAnyP2FireKeyPressed(): boolean { return this.activeKeys.has('Enter') || this.activeKeys.has('Numpad0'); }
  private isLeftKey(c: string, k: string): boolean { return c === 'ArrowLeft' || c === 'KeyA' || k === 'ArrowLeft' || k === 'a' || k === 'A'; }
  private isRightKey(c: string, k: string): boolean { return c === 'ArrowRight' || c === 'KeyD' || k === 'ArrowRight' || k === 'd' || k === 'D'; }
  private isUpKey(c: string, k: string): boolean { return c === 'ArrowUp' || c === 'KeyW' || k === 'ArrowUp' || k === 'w' || k === 'W'; }
  private isDownKey(c: string, k: string): boolean { return c === 'ArrowDown' || c === 'KeyS' || k === 'ArrowDown' || k === 's' || k === 'S'; }
  private isFireKey(c: string, k: string): boolean { return c === 'Space' || c === 'Enter' || c === 'Numpad0' || c === 'KeyZ' || c === 'KeyK' || c === 'KeyJ' || k === ' ' || k === 'Enter' || k === 'z' || k === 'Z' || k === 'k' || k === 'K' || k === 'j' || k === 'J'; }
  private isPauseKey(c: string, k: string): boolean { return c === 'KeyP' || c === 'Escape' || k === 'p' || k === 'P' || k === 'Escape'; }
  private isRestartKey(c: string, k: string): boolean { return c === 'Enter' || c === 'KeyR' || k === 'Enter' || k === 'r' || k === 'R'; }
  public isSpecialKey(c: string, k: string): boolean { return c === 'KeyX' || c === 'KeyV' || c === 'KeyM' || k === 'x' || k === 'X' || k === 'v' || k === 'V' || k === 'm' || k === 'M'; }
  public isCycleSpecialKey(c: string, k: string): boolean { return c === 'KeyC' || k === 'c' || k === 'C'; }
  public isShiftKey(c: string, k: string): boolean { return c === 'ShiftLeft' || c === 'ShiftRight' || k === 'Shift'; }
  private isAnyLeftKeyPressed(): boolean { return this.activeKeys.has('ArrowLeft') || this.activeKeys.has('KeyA') || this.activeKeys.has('a') || this.activeKeys.has('A'); }
  private isAnyRightKeyPressed(): boolean { return this.activeKeys.has('ArrowRight') || this.activeKeys.has('KeyD') || this.activeKeys.has('d') || this.activeKeys.has('D'); }
  private isAnyUpKeyPressed(): boolean { return this.activeKeys.has('ArrowUp') || this.activeKeys.has('KeyW') || this.activeKeys.has('w') || this.activeKeys.has('W'); }
  private isAnyDownKeyPressed(): boolean { return this.activeKeys.has('ArrowDown') || this.activeKeys.has('KeyS') || this.activeKeys.has('s') || this.activeKeys.has('S'); }
  private isAnyFireKeyPressed(): boolean { return ['Space', ' ', 'Enter', 'Numpad0', 'KeyZ', 'z', 'Z', 'KeyK', 'k', 'K', 'KeyJ', 'j', 'J'].some(k => this.activeKeys.has(k)); }
}
