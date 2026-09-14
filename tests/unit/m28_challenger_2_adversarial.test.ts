/**
 * Galaga Arcade Web Game — Milestone M28
 * Adversarial Challenger 2 Test Suite: Responsive Reflow & Input Stress Verifier
 * Location: tests/unit/m28_challenger_2_adversarial.test.ts
 *
 * Rigorous adversarial stress testing across 4 core tracks:
 * - Track 1: Action Button Event Spam (500 rapid clicks on Mute, Fullscreen, Pause & aria-pressed)
 * - Track 2: Compact Mode Transitions (1,000 rapid cycles under active telemetry)
 * - Track 3: Adversarial Telemetry Inputs (NaN, negatives, overflows, nulls, corrupt data & cue sync)
 * - Track 4: Headless SSR / Document-less & Incomplete DOM Environment Resilience
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BottomDashboard,
  type ActivePowerUpTelemetry,
} from '../../src/ui/BottomDashboard';
import { FullscreenManager } from '../../src/ui/FullscreenManager';
import { PowerUpType } from '../../src/core/powerups/types';

// ============================================================================
// Node-Compatible Comprehensive DOM Mocks
// ============================================================================

class MockClassList {
  private classes: Set<string> = new Set();

  constructor(initialClasses: string[] = []) {
    for (const c of initialClasses) {
      if (c) this.classes.add(c);
    }
  }

  add(...classes: string[]) {
    for (const c of classes) {
      if (c) this.classes.add(c);
    }
  }

  remove(...classes: string[]) {
    for (const c of classes) {
      this.classes.delete(c);
    }
  }

  contains(c: string): boolean {
    return this.classes.has(c);
  }

  toggle(c: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) this.classes.add(c);
      else this.classes.delete(c);
      return force;
    }
    if (this.classes.has(c)) {
      this.classes.delete(c);
      return false;
    }
    this.classes.add(c);
    return true;
  }

  toString(): string {
    return Array.from(this.classes).join(' ');
  }

  get length(): number {
    return this.classes.size;
  }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public classList: MockClassList;
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public attributes: Record<string, string> = {};
  public style: Record<string, string> = {};
  public innerHTML: string = '';
  public title: string = '';
  private _textContent: string = '';
  public textContentSetterCount: number = 0;
  private listeners: Record<string, Set<(e: any) => void>> = {};

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    if (id) {
      this.attributes['id'] = id;
    }
  }

  get className(): string {
    return this.classList.toString();
  }

  set className(val: string) {
    this.classList = new MockClassList();
    if (val) {
      const parts = val.trim().split(/\s+/);
      for (const p of parts) {
        if (p) this.classList.add(p);
      }
    }
  }

  get textContent(): string {
    return this._textContent;
  }

  set textContent(val: string) {
    this.textContentSetterCount++;
    this._textContent = String(val);
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name: string): string | null {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
    if (name === 'id') this.id = '';
  }

  hasAttribute(name: string): boolean {
    return name in this.attributes;
  }

  appendChild(child: MockElement): MockElement {
    if (!child) return child;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      if (this.id === targetId) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    } else {
      if (this.tagName.toLowerCase() === selector.toLowerCase()) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const search = (node: MockElement) => {
      if (selector.startsWith('.')) {
        if (node.classList.contains(selector.slice(1))) results.push(node);
      } else if (selector.startsWith('#')) {
        if (node.id === selector.slice(1)) results.push(node);
      } else if (node.tagName.toLowerCase() === selector.toLowerCase()) {
        results.push(node);
      }
      for (const child of node.children) {
        search(child);
      }
    };
    for (const child of this.children) {
      search(child);
    }
    return results;
  }

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(listener);
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    this.listeners[type]?.delete(listener);
  }

  dispatchEvent(event: any): boolean {
    const set = this.listeners[event.type];
    if (set) {
      for (const fn of Array.from(set)) {
        fn(event);
      }
    }
    return true;
  }
}

class MockDocument {
  public body: MockElement | null = new MockElement('BODY');
  public documentElement: MockElement = new MockElement('HTML');
  private elementsById: Map<string, MockElement> = new Map();

  createElement(tagName: string): MockElement {
    return new MockElement(tagName);
  }

  createElementNS(_ns: string, tagName: string): MockElement {
    return new MockElement(tagName);
  }

  getElementById(id: string): MockElement | null {
    if (this.elementsById.has(id)) return this.elementsById.get(id)!;
    return this.body ? this.body.querySelector(`#${id}`) : null;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.elementsById.has(id)) return this.elementsById.get(id)!;
    }
    return this.body ? this.body.querySelector(selector) : null;
  }

  registerElement(id: string, el: MockElement) {
    el.id = id;
    this.elementsById.set(id, el);
    if (this.body) {
      this.body.appendChild(el);
    }
  }
}

// ============================================================================
// Adversarial Challenger 2 Test Suite
// ============================================================================

describe('Milestone M28: Adversarial Challenger 2 Stress Suite', () => {
  let mockDoc: MockDocument;
  let mockAppContainer: MockElement;
  let dashboard: BottomDashboard;

  beforeEach(() => {
    mockDoc = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');
    mockDoc.registerElement('app-container', mockAppContainer);

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768 });
  });

  afterEach(() => {
    dashboard?.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Track 1: Action Button Event Spam Stress
  // ==========================================================================
  describe('Track 1: Action Button Event Spam Stress', () => {
    it('dispatches 500 rapid click events on Mute button without unhandled exceptions or state desync', () => {
      let isMutedState = false;
      const onToggleMute = vi.fn(() => {
        isMutedState = !isMutedState;
      });

      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onToggleMute,
      });

      const btnMute = dashboard.getElement()!.querySelector('#btn-dash-mute')!;
      expect(btnMute).not.toBeNull();
      expect(btnMute.textContent).toBe('🔊');
      expect(btnMute.getAttribute('aria-label')).toBe('Mute Audio');

      // Dispatch 500 rapid clicks while synchronizing telemetry state
      for (let i = 0; i < 500; i++) {
        expect(() => {
          btnMute.dispatchEvent({
            type: 'click',
            preventDefault: vi.fn(),
          } as any);
        }).not.toThrow();

        // Feed back state change via telemetry
        dashboard.update({ isMuted: isMutedState } as any);

        const expectedText = isMutedState ? '🔇' : '🔊';
        const expectedLabel = isMutedState ? 'Unmute Audio' : 'Mute Audio';
        expect(btnMute.textContent).toBe(expectedText);
        expect(btnMute.getAttribute('aria-label')).toBe(expectedLabel);
      }

      expect(onToggleMute).toHaveBeenCalledTimes(500);
      expect(isMutedState).toBe(false); // 500 even toggles returns to false
    });

    it('dispatches 500 rapid click events on Fullscreen button without unhandled exceptions or desync', () => {
      let isFsState = false;
      const onToggleFullscreen = vi.fn(() => {
        isFsState = !isFsState;
      });

      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onToggleFullscreen,
      });

      const btnFs = dashboard.getElement()!.querySelector('#btn-dash-fullscreen')!;
      expect(btnFs).not.toBeNull();
      expect(btnFs.textContent).toBe('⛶');
      expect(btnFs.getAttribute('aria-label')).toBe('Toggle Fullscreen');

      // Dispatch 500 rapid clicks
      for (let i = 0; i < 500; i++) {
        expect(() => {
          btnFs.dispatchEvent({
            type: 'click',
            preventDefault: vi.fn(),
          } as any);
        }).not.toThrow();

        dashboard.update({ isFullscreen: isFsState } as any);

        const expectedText = isFsState ? '🗗' : '⛶';
        const expectedLabel = isFsState ? 'Exit Fullscreen' : 'Toggle Fullscreen';
        expect(btnFs.textContent).toBe(expectedText);
        expect(btnFs.getAttribute('aria-label')).toBe(expectedLabel);
      }

      expect(onToggleFullscreen).toHaveBeenCalledTimes(500);
      expect(isFsState).toBe(false);
    });

    it('dispatches 500 rapid click events on Pause button without unhandled exceptions or desync', () => {
      let isPausedState = false;
      const onTogglePause = vi.fn(() => {
        isPausedState = !isPausedState;
      });

      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onTogglePause,
      });

      const btnPause = dashboard.getElement()!.querySelector('#btn-dash-pause')!;
      expect(btnPause).not.toBeNull();
      expect(btnPause.textContent).toBe('⏸');
      expect(btnPause.getAttribute('aria-label')).toBe('Pause Game');

      // Dispatch 500 rapid clicks
      for (let i = 0; i < 500; i++) {
        expect(() => {
          btnPause.dispatchEvent({
            type: 'click',
            preventDefault: vi.fn(),
          } as any);
        }).not.toThrow();

        dashboard.update({ isPaused: isPausedState } as any);

        const expectedText = isPausedState ? '▶' : '⏸';
        const expectedLabel = isPausedState ? 'Resume Game' : 'Pause Game';
        expect(btnPause.textContent).toBe(expectedText);
        expect(btnPause.getAttribute('aria-label')).toBe(expectedLabel);
      }

      expect(onTogglePause).toHaveBeenCalledTimes(500);
      expect(isPausedState).toBe(false);
    });

    it('preserves aria-pressed and aria-label synchronization when integrated with FullscreenManager across 500 clicks', async () => {
      const fsManager = new FullscreenManager({ target: mockAppContainer as any });
      let internalFullscreen = false;

      // Mock requestFullscreen and exitFullscreen
      vi.spyOn(fsManager, 'toggleFullscreen').mockImplementation(async () => {
        internalFullscreen = !internalFullscreen;
        vi.spyOn(fsManager, 'isFullscreen').mockReturnValue(internalFullscreen);
        (fsManager as any).handleFullscreenChange();
        return true;
      });

      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onToggleFullscreen: () => fsManager.toggleFullscreen(),
      });

      const btnFs = dashboard.getElement()!.querySelector('#btn-dash-fullscreen')!;
      const unbind = fsManager.bindToggleButton(btnFs as any);

      // Initially
      expect(btnFs.getAttribute('aria-pressed')).toBe('false');
      expect(btnFs.getAttribute('aria-label')).toBe('Toggle Fullscreen');

      // 500 rapid clicks through the integrated manager
      for (let i = 0; i < 500; i++) {
        btnFs.dispatchEvent({ type: 'click', cancelable: true, preventDefault: vi.fn() } as any);
        const expectedPressed = internalFullscreen ? 'true' : 'false';
        const expectedLabel = internalFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen';
        expect(btnFs.getAttribute('aria-pressed')).toBe(expectedPressed);
        expect(btnFs.getAttribute('aria-label')).toBe(expectedLabel);
      }

      unbind();
      fsManager.destroy();
    });

    it('handles 500 rapid clicks when callbacks throw synchronous errors or reject promises', () => {
      const throwingCallback = vi.fn(() => {
        throw new Error('Callback panic');
      });
      const rejectingCallback = vi.fn(async () => {
        throw new Error('Async rejection');
      });

      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onToggleMute: throwingCallback,
        onToggleFullscreen: rejectingCallback,
        onTogglePause: throwingCallback,
      });

      const btnMute = dashboard.getElement()!.querySelector('#btn-dash-mute')!;
      const btnFs = dashboard.getElement()!.querySelector('#btn-dash-fullscreen')!;
      const btnPause = dashboard.getElement()!.querySelector('#btn-dash-pause')!;

      for (let i = 0; i < 500; i++) {
        expect(() => {
          btnMute.dispatchEvent({ type: 'click' } as any);
          btnFs.dispatchEvent({ type: 'click' } as any);
          btnPause.dispatchEvent({ type: 'click' } as any);
        }).not.toThrow();
      }

      expect(throwingCallback).toHaveBeenCalledTimes(1000); // 500 mute + 500 pause
      expect(rejectingCallback).toHaveBeenCalledTimes(500);
    });

    it('asserts aria-pressed synchronization on BottomDashboard native buttons', () => {
      dashboard = new BottomDashboard({ container: mockAppContainer as any });
      const btnMute = dashboard.getElement()!.querySelector('#btn-dash-mute')!;
      const btnFs = dashboard.getElement()!.querySelector('#btn-dash-fullscreen')!;
      const btnPause = dashboard.getElement()!.querySelector('#btn-dash-pause')!;

      // Initial unpressed state
      expect(btnMute.getAttribute('aria-pressed')).toBe('false');
      expect(btnFs.getAttribute('aria-pressed')).toBe('false');
      expect(btnPause.getAttribute('aria-pressed')).toBe('false');

      // Update to active states
      dashboard.update({ isMuted: true, isFullscreen: true, isPaused: true } as any);
      expect(btnMute.getAttribute('aria-pressed')).toBe('true');
      expect(btnFs.getAttribute('aria-pressed')).toBe('true');
      expect(btnPause.getAttribute('aria-pressed')).toBe('true');

      // Update back to inactive
      dashboard.update({ isMuted: false, isFullscreen: false, isPaused: false } as any);
      expect(btnMute.getAttribute('aria-pressed')).toBe('false');
      expect(btnFs.getAttribute('aria-pressed')).toBe('false');
      expect(btnPause.getAttribute('aria-pressed')).toBe('false');
    });
  });

  // ==========================================================================
  // Track 2: Compact Mode Rapid Reflow Transitions
  // ==========================================================================
  describe('Track 2: Compact Mode Rapid Reflow Transitions', () => {
    it('survives 1,000 rapid cycles of setCompactMode(true) and setCompactMode(false)', () => {
      dashboard = new BottomDashboard({ container: mockAppContainer as any });
      const root = dashboard.getElement()!;
      const legend = root.querySelector('.controls-legend')!;

      for (let i = 0; i < 1000; i++) {
        // Toggle compact mode ON
        dashboard.setCompactMode(true);
        expect(dashboard.isCompactMode()).toBe(true);
        expect(root.classList.contains('compact-mode')).toBe(true);
        expect(legend.classList.contains('hidden-compact')).toBe(true);

        // Toggle compact mode OFF
        dashboard.setCompactMode(false);
        expect(dashboard.isCompactMode()).toBe(false);
        expect(root.classList.contains('compact-mode')).toBe(false);
        expect(legend.classList.contains('hidden-compact')).toBe(false);
      }
    });

    it('stress-tests 1,000 rapid compact mode transitions while telemetry is actively updating', () => {
      dashboard = new BottomDashboard({ container: mockAppContainer as any });
      const root = dashboard.getElement()!;
      const legend = root.querySelector('.controls-legend')!;
      const specialFill = (root.querySelector('.special-charge-bar') as unknown) as MockElement;

      for (let i = 0; i < 1000; i++) {
        const compact = i % 2 === 0;
        dashboard.setCompactMode(compact);

        // Concurrently push full telemetry update
        const dynamicScore = i * 100;
        const dynamicEnergy = i % 101;
        dashboard.update({
          score: dynamicScore,
          highScore: 50000,
          lives: (i % 6),
          specialEnergy: dynamicEnergy,
          isSpecialReady: dynamicEnergy >= 100,
          selectedSpecial: i % 3 === 0 ? 'NOVA_BARRAGE' : i % 3 === 1 ? 'CHRONO_FREEZE' : 'WARP_RAM',
          isMuted: i % 4 === 0,
          isFullscreen: i % 5 === 0,
          isPaused: i % 7 === 0,
        } as any);

        expect(dashboard.isCompactMode()).toBe(compact);
        expect(root.classList.contains('compact-mode')).toBe(compact);
        expect(legend.classList.contains('hidden-compact')).toBe(compact);

        // Invariant: Base classes must never be corrupted
        expect(root.classList.contains('bottom-dashboard')).toBe(true);
        expect(root.classList.contains('cyber-dashboard')).toBe(true);
        expect(legend.classList.contains('controls-legend')).toBe(true);

        // Telemetry reflects correctly
        expect(specialFill.style.width).toBe(`${dynamicEnergy}%`);
      }
    });

    it('enforces idempotency over 500 consecutive identical compact mode calls', () => {
      dashboard = new BottomDashboard({ container: mockAppContainer as any });
      const root = dashboard.getElement()!;

      for (let i = 0; i < 500; i++) {
        dashboard.setCompactMode(true);
      }
      expect(dashboard.isCompactMode()).toBe(true);
      expect(root.classList.contains('compact-mode')).toBe(true);

      for (let i = 0; i < 500; i++) {
        dashboard.setCompactMode(false);
      }
      expect(dashboard.isCompactMode()).toBe(false);
      expect(root.classList.contains('compact-mode')).toBe(false);
    });
  });

  // ==========================================================================
  // Track 3: Adversarial Telemetry Inputs & Fuzzing
  // ==========================================================================
  describe('Track 3: Adversarial Telemetry Inputs & Fuzzing', () => {
    beforeEach(() => {
      dashboard = new BottomDashboard({ container: mockAppContainer as any });
    });

    it('sanitizes malicious and edge-case score values gracefully', () => {
      const scoreEl = dashboard.getElement()!.querySelector('#dashboard-score')!;

      // NaN
      dashboard.update({ score: NaN, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('000000');

      // Negative score
      dashboard.update({ score: -9999, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('000000');

      // Large 8-digit score
      dashboard.update({ score: 99999999, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('99999999');

      // Float score (should floor to integer)
      dashboard.update({ score: 1234.987, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('001234');

      // Infinity / -Infinity
      dashboard.update({ score: -Infinity, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('000000');

      dashboard.update({ score: Infinity, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('Infinity');

      // Null / Undefined / Non-number strings
      dashboard.update({ score: null as any, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('000000');

      dashboard.update({ score: 'invalid_string' as any, highScore: 20000 } as any);
      expect(scoreEl.textContent).toBe('000000');
    });

    it('sanitizes malicious and edge-case reserve lives inputs without throwing', () => {
      const livesContainer = dashboard.getElement()!.querySelector('#dashboard-lives')!;

      // Negative lives: clamped to 0
      dashboard.update({ lives: -5 } as any);
      expect(livesContainer.children.length).toBe(0);

      // Large lives: clamped to max 5
      dashboard.update({ lives: 999 } as any);
      expect(livesContainer.children.length).toBe(5);

      // NaN lives: clamped to 0
      dashboard.update({ lives: NaN } as any);
      expect(livesContainer.children.length).toBe(0);

      // Rapidly fluctuating lives (-100 to +100) across 300 cycles
      for (let i = -100; i <= 200; i++) {
        expect(() => {
          dashboard.update({ lives: i } as any);
        }).not.toThrow();

        const count = livesContainer.children.length;
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(5);

        if (i <= 0) expect(count).toBe(0);
        else if (i >= 5) expect(count).toBe(5);
        else expect(count).toBe(i);
      }
    });

    it('sanitizes special move charge and energy gauge anomalies', () => {
      const specialFill = (dashboard.getElement()!.querySelector('.special-charge-bar') as unknown) as MockElement;
      const specialCue = dashboard.getElement()!.querySelector('.special-cue')!;

      // Underflow: -50
      dashboard.update({ specialCharge: -50 } as any);
      expect(specialFill.style.width).toBe('0%');

      // Overflow: 1500
      dashboard.update({ specialCharge: 1500 } as any);
      expect(specialFill.style.width).toBe('100%');
      expect(specialCue.textContent).toBe('READY [X]');

      // NaN
      dashboard.update({ specialCharge: NaN, isSpecialReady: false } as any);
      expect(specialFill.style.width).toBe('0%');

      // Float energy
      dashboard.update({ specialEnergy: 42.7 } as any);
      expect(specialFill.style.width).toBe('42%');
    });

    it('updates special move cue text with intermediate percentage during charge up (e.g. 42% -> 75%)', () => {
      // First frame: initial baseline at 0%
      dashboard.update({ specialEnergy: 0, isSpecialReady: false, selectedSpecial: 'SP' } as any);
      const specialCue = dashboard.getElement()!.querySelector('.special-cue')!;
      expect(specialCue.textContent).toBe('0%');

      // Second frame: charge rises to 42% while not ready
      dashboard.update({ specialEnergy: 42.7, isSpecialReady: false, selectedSpecial: 'SP' } as any);
      expect(specialCue.textContent).toBe('42%');
    });

    it('handles unknown and malformed selectedSpecial strings', () => {
      const specialName = dashboard.getElement()!.querySelector('.special-name')!;

      // Empty string -> fallback to 'SP'
      dashboard.update({ selectedSpecial: '' } as any);
      expect(specialName.textContent).toBe('SP');

      // Unknown long move name -> slices first 6 chars uppercase
      dashboard.update({ selectedSpecial: 'quantum_singularity_annihilator' } as any);
      expect(specialName.textContent).toBe('QUANTU');

      // Canonical moves
      dashboard.update({ selectedSpecial: 'NOVA_BARRAGE' } as any);
      expect(specialName.textContent).toBe('NOVA');

      dashboard.update({ selectedSpecial: 'CHRONO_FREEZE' } as any);
      expect(specialName.textContent).toBe('CHRONO');

      dashboard.update({ selectedSpecial: 'WARP_RAM' } as any);
      expect(specialName.textContent).toBe('WARP');
    });

    it('handles null, undefined, empty, and malformed activePowerUps gracefully', () => {
      const powerupRack = dashboard.getElement()!.querySelector('#dashboard-powerups')!;

      // First mount valid power-ups
      const validTelemetry: ActivePowerUpTelemetry[] = [
        {
          type: PowerUpType.RAPID_FIRE,
          id: 'RAPID_FIRE',
          label: 'OVERCLOCK',
          maxDuration: 15,
          primaryColor: '#FF7F00',
          accentColor: '#FF7F00',
          remainingTime: 10,
          progress: 0.66,
          isActive: true,
        },
        {
          type: PowerUpType.KINETIC_SHIELD,
          id: 'KINETIC_SHIELD',
          label: 'SHIELD',
          maxDuration: 1,
          primaryColor: '#00FFFF',
          accentColor: '#00FFFF',
          remainingTime: 1,
          progress: 1.0,
          isActive: true,
        },
      ];
      dashboard.update({ activePowerUps: validTelemetry } as any);
      expect(powerupRack.children.length).toBe(2);

      // Now pass activePowerUps: null -> should unmount without throwing
      expect(() => {
        dashboard.update({ activePowerUps: null as any } as any);
      }).not.toThrow();
      expect(powerupRack.children.length).toBe(0);

      // Re-mount
      dashboard.update({ activePowerUps: validTelemetry } as any);
      expect(powerupRack.children.length).toBe(2);

      // Pass activePowerUps: undefined
      expect(() => {
        dashboard.update({ activePowerUps: undefined } as any);
      }).not.toThrow();
      expect(powerupRack.children.length).toBe(0);

      // Pass array containing null / undefined elements
      const malformedArray: any[] = [null, undefined, validTelemetry[0], null];
      expect(() => {
        dashboard.update({ activePowerUps: malformedArray } as any);
      }).not.toThrow();
      expect(powerupRack.children.length).toBe(1);
    });

    it('survives total telemetry null / undefined / empty object updates without errors', () => {
      expect(() => {
        dashboard.update(null as any);
        dashboard.update(undefined as any);
        dashboard.update({} as any);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Track 4: Headless SSR & Document-less Environment Resilience
  // ==========================================================================
  describe('Track 4: Headless SSR & Document-less Environment Resilience', () => {
    it('operates safely when document is completely undefined (Node / Headless SSR)', () => {
      vi.stubGlobal('document', undefined);

      let headlessDashboard: BottomDashboard | null = null;
      expect(() => {
        headlessDashboard = new BottomDashboard();
      }).not.toThrow();

      expect(headlessDashboard!.getElement()).toBeNull();
      expect(headlessDashboard!.isCompactMode()).toBe(false);

      // Calling public methods on headless instance must never throw
      expect(() => {
        headlessDashboard!.setCompactMode(true);
        headlessDashboard!.update({ score: 5000, lives: 3 } as any);
        headlessDashboard!.reset();
        headlessDashboard!.destroy();
      }).not.toThrow();
    });

    it('operates safely when document exists but document.createElement is not a function', () => {
      vi.stubGlobal('document', { body: {} } as any);

      let incompleteDashboard: BottomDashboard | null = null;
      expect(() => {
        incompleteDashboard = new BottomDashboard();
      }).not.toThrow();

      expect(incompleteDashboard!.getElement()).toBeNull();
    });

    it('operates safely when container element cannot be found in DOM', () => {
      const emptyDoc = new MockDocument();
      emptyDoc.body = null;
      vi.stubGlobal('document', emptyDoc);

      let detachedDashboard: BottomDashboard | null = null;
      expect(() => {
        detachedDashboard = new BottomDashboard({ container: '#non-existent-id' });
      }).not.toThrow();

      expect(detachedDashboard!.getElement()).toBeNull();
    });

    it('falls back to createElement when createElementNS is not supported', () => {
      const legacyDoc = new MockDocument();
      (legacyDoc as any).createElementNS = undefined; // Drop SVG createElementNS
      vi.stubGlobal('document', legacyDoc);

      const container = new MockElement('DIV', 'app-container');
      legacyDoc.registerElement('app-container', container);

      const legacyDashboard = new BottomDashboard({ container: container as any });
      expect(legacyDashboard.getElement()).not.toBeNull();

      // Updating lives forces ship icon generation via fallback createElement('div')
      expect(() => {
        legacyDashboard.update({ lives: 3 } as any);
      }).not.toThrow();

      const livesEl = legacyDashboard.getElement()!.querySelector('#dashboard-lives')!;
      expect(livesEl.children.length).toBe(3);
      expect(livesEl.children[0]!.tagName).toBe('DIV');

      legacyDashboard.destroy();
    });

    it('survives multiple redundant destroy() calls without null reference exceptions', () => {
      dashboard = new BottomDashboard({ container: mockAppContainer as any });
      expect(dashboard.getElement()).not.toBeNull();

      expect(() => {
        dashboard.destroy();
        dashboard.destroy();
        dashboard.destroy();
      }).not.toThrow();

      expect(dashboard.getElement()).toBeNull();
    });

    it('supports clean re-initialization after destroy()', () => {
      dashboard = new BottomDashboard({ container: mockAppContainer as any });
      dashboard.update({ score: 1200 } as any);
      dashboard.destroy();
      expect(dashboard.getElement()).toBeNull();

      // Re-init
      const initSuccess = dashboard.init(mockAppContainer as any);
      expect(initSuccess).toBe(true);
      expect(dashboard.getElement()).not.toBeNull();

      dashboard.update({ score: 2400 } as any);
      const scoreEl = dashboard.getElement()!.querySelector('#dashboard-score')!;
      expect(scoreEl.textContent).toBe('002400');
    });
  });
});
