/**
 * Galaga Arcade Web Game — Milestone M28 Bottom Dashboard Unit Test Suite
 * Location: tests/unit/bottom_dashboard.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BottomDashboard,
  type PowerUpChipTelemetry,
} from '../../src/ui/BottomDashboard';

// ============================================================================
// Node-Compatible DOM Mocks
// ============================================================================

class MockClassList {
  private classes: Set<string> = new Set();
  add(c: string) {
    if (c) this.classes.add(c);
  }
  remove(c: string) {
    this.classes.delete(c);
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
  toString() {
    return Array.from(this.classes).join(' ');
  }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  private _className: string = '';
  public classList = new MockClassList();
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
  }

  get className(): string {
    return this._className;
  }

  set className(val: string) {
    this._className = val || '';
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
      const id = selector.slice(1);
      if (this.id === id) return this;
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
      for (const child of node.children) search(child);
    };
    for (const child of this.children) search(child);
    return results;
  }

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type]?.add(listener);
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    this.listeners[type]?.delete(listener);
  }

  dispatchEvent(event: any): boolean {
    const set = this.listeners[event.type];
    if (set) {
      for (const fn of Array.from(set)) fn(event);
    }
    return true;
  }

  getListenerCount(type: string): number {
    return this.listeners[type]?.size ?? 0;
  }
}

class MockDocument {
  public body: MockElement = new MockElement('BODY');
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
    return this.body.querySelector(`#${id}`);
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.elementsById.has(id)) return this.elementsById.get(id)!;
    }
    return this.body.querySelector(selector);
  }

  registerElement(id: string, el: MockElement) {
    el.id = id;
    this.elementsById.set(id, el);
    this.body.appendChild(el);
  }
}

// ============================================================================
// Test Suite Specifications
// ============================================================================

describe('Milestone M28: BottomDashboard Unit Test Suite', () => {
  let mockDoc: MockDocument;
  let mockAppContainer: MockElement;
  let dashboard: BottomDashboard;

  beforeEach(() => {
    mockDoc = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');
    mockDoc.registerElement('app-container', mockAppContainer);

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768 });

    dashboard = new BottomDashboard({ container: mockAppContainer as any });
  });

  afterEach(() => {
    dashboard?.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. DOM Initialization & Cleanup Lifecycle
  // --------------------------------------------------------------------------
  describe('1. DOM Initialization & Cleanup Lifecycle', () => {
    it('creates and mounts the root dashboard element into target container', () => {
      const root = dashboard.getElement();
      expect(root).not.toBeNull();
      expect(root?.classList.contains('bottom-dashboard')).toBe(true);
      expect(mockAppContainer.children).toContain(root);
    });

    it('creates all three operational zones (left, center, right)', () => {
      const root = dashboard.getElement()!;
      expect(root.querySelector('.dashboard-zone-left')).not.toBeNull();
      expect(root.querySelector('.dashboard-zone-center')).not.toBeNull();
      expect(root.querySelector('.dashboard-zone-right')).not.toBeNull();
    });

    it('unmounts cleanly from container and clears references upon destroy()', () => {
      const root = dashboard.getElement()!;
      dashboard.destroy();
      expect(mockAppContainer.children).not.toContain(root);
      expect(dashboard.getElement()).toBeNull();
    });

    it('ensures destroy() is idempotent and does not throw on multiple calls', () => {
      expect(() => {
        dashboard.destroy();
        dashboard.destroy();
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Score & High Score Formatting & Animations
  // --------------------------------------------------------------------------
  describe('2. Score & High Score Formatting & Animations', () => {
    it('formats initial score as 6-digit zero-padded "000000"', () => {
      dashboard.update({ score: 0, highScore: 20000, lives: 3 } as any);
      const scoreEl = dashboard.getElement()!.querySelector('#dashboard-score');
      expect(scoreEl?.textContent).toBe('000000');
    });

    it('formats non-zero score with zero-padding (e.g. 4500 -> "004500")', () => {
      dashboard.update({ score: 4500, highScore: 20000, lives: 3 } as any);
      const scoreEl = dashboard.getElement()!.querySelector('#dashboard-score');
      expect(scoreEl?.textContent).toBe('004500');
    });

    it('formats high score with zero-padding (e.g. 20000 -> "020000")', () => {
      dashboard.update({ score: 4500, highScore: 20000, lives: 3 } as any);
      const hiScoreEl = dashboard.getElement()!.querySelector('#dashboard-high-score');
      expect(hiScoreEl?.textContent).toBe('020000');
    });

    it('applies pulse highlight class when score sets a new high score', () => {
      const hiScoreEl = dashboard.getElement()!.querySelector('#dashboard-high-score');
      dashboard.update({ score: 25000, highScore: 25000, lives: 3 } as any);
      expect(hiScoreEl?.classList.contains('high-score-flash')).toBe(true);
    });

    it('preserves all digits when score exceeds 6 digits (e.g. 1,250,000)', () => {
      dashboard.update({ score: 1250000, highScore: 1250000, lives: 3 } as any);
      const scoreEl = dashboard.getElement()!.querySelector('#dashboard-score');
      expect(scoreEl?.textContent).toBe('1250000');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Lives Counter & SVG Ship Icon Rendering
  // --------------------------------------------------------------------------
  describe('3. Lives Counter & SVG Ship Icon Rendering', () => {
    it('renders 3 SVG ship icons for default starting lives (3 lives)', () => {
      dashboard.update({ score: 0, highScore: 20000, lives: 3 } as any);
      const livesContainer = dashboard.getElement()!.querySelector('#dashboard-lives')!;
      const icons = livesContainer.querySelectorAll('.ship-life-icon');
      expect(icons.length).toBe(3);
    });

    it('renders 0 icons when player has 0 lives', () => {
      dashboard.update({ score: 0, highScore: 20000, lives: 0 } as any);
      const livesContainer = dashboard.getElement()!.querySelector('#dashboard-lives')!;
      const icons = livesContainer.querySelectorAll('.ship-life-icon');
      expect(icons.length).toBe(0);
    });

    it('renders 1, 2, and 5 ship icons respectively', () => {
      const livesContainer = dashboard.getElement()!.querySelector('#dashboard-lives')!;

      dashboard.update({ score: 0, highScore: 20000, lives: 1 } as any);
      expect(livesContainer.querySelectorAll('.ship-life-icon').length).toBe(1);

      dashboard.update({ score: 0, highScore: 20000, lives: 2 } as any);
      expect(livesContainer.querySelectorAll('.ship-life-icon').length).toBe(2);

      dashboard.update({ score: 0, highScore: 20000, lives: 5 } as any);
      expect(livesContainer.querySelectorAll('.ship-life-icon').length).toBe(5);
    });

    it('clamps negative lives safely to 0 without errors', () => {
      expect(() => {
        dashboard.update({ score: 0, highScore: 20000, lives: -2 } as any);
      }).not.toThrow();
      const livesContainer = dashboard.getElement()!.querySelector('#dashboard-lives')!;
      expect(livesContainer.querySelectorAll('.ship-life-icon').length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Power-Up Chips Lifecycle & Countdown Bars
  // --------------------------------------------------------------------------
  describe('4. Power-Up Chips Lifecycle & Countdown Bars', () => {
    it('mounts chip element when active power-up is provided in telemetry', () => {
      const chipData: PowerUpChipTelemetry = {
        id: 'rapid_1',
        type: 'RAPID_FIRE',
        name: 'RAPID',
        remainingDuration: 10,
        totalDuration: 10,
        color: '#00ffff',
      };
      dashboard.update({ activePowerUps: [chipData] } as any);

      const chipsContainer = dashboard.getElement()!.querySelector('#dashboard-powerups')!;
      const chip = chipsContainer.querySelector('.powerup-chip');
      expect(chip).not.toBeNull();
      expect(chip?.getAttribute('data-type')).toBe('RAPID_FIRE');
    });

    it('scales duration progress bar percentage according to remaining time', () => {
      const chipData: PowerUpChipTelemetry = {
        id: 'scatter_1',
        type: 'SCATTER_SHOT',
        name: 'SCATTER',
        remainingDuration: 5,
        totalDuration: 10,
        color: '#ffff00',
      };
      dashboard.update({ activePowerUps: [chipData] } as any);

      const bar = dashboard.getElement()!.querySelector('.powerup-progress-bar') as HTMLElement;
      expect(bar?.style.width).toBe('50%');
    });

    it('applies configured item color coding to chip border and progress bar', () => {
      const chipData: PowerUpChipTelemetry = {
        id: 'shield_1',
        type: 'KINETIC_SHIELD',
        name: 'SHIELD',
        remainingDuration: 8,
        totalDuration: 8,
        color: '#00ffcc',
      };
      dashboard.update({ activePowerUps: [chipData] } as any);

      const chip = dashboard.getElement()!.querySelector('.powerup-chip') as HTMLElement;
      expect(chip?.style.borderColor).toBe('#00ffcc');
    });

    it('removes chip element gracefully when power-up duration reaches 0', () => {
      dashboard.update({
        activePowerUps: [
          {
            id: 'rapid_1',
            type: 'RAPID_FIRE',
            name: 'RAPID',
            remainingDuration: 0.1,
            totalDuration: 10,
          },
        ],
      } as any);
      expect(dashboard.getElement()!.querySelectorAll('.powerup-chip').length).toBe(1);

      // Duration expires -> empty array
      dashboard.update({ activePowerUps: [] } as any);
      expect(dashboard.getElement()!.querySelectorAll('.powerup-chip').length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Special Move Charge Meter Dynamics
  // --------------------------------------------------------------------------
  describe('5. Special Move Charge Meter Dynamics', () => {
    it('sets width percentage proportional to energy (0% to 100%)', () => {
      const bar = dashboard.getElement()!.querySelector('.special-charge-bar') as HTMLElement;

      dashboard.update({ specialEnergy: 0, isSpecialReady: false } as any);
      expect(bar.style.width).toBe('0%');

      dashboard.update({ specialEnergy: 50, isSpecialReady: false } as any);
      expect(bar.style.width).toBe('50%');

      dashboard.update({ specialEnergy: 100, isSpecialReady: true } as any);
      expect(bar.style.width).toBe('100%');
    });

    it('adds pulsating ".special-ready" class when charge is 100%', () => {
      const container = dashboard.getElement()!.querySelector('.dashboard-special-container')!;

      dashboard.update({ specialEnergy: 99, isSpecialReady: false } as any);
      expect(container.classList.contains('special-ready')).toBe(false);

      dashboard.update({ specialEnergy: 100, isSpecialReady: true } as any);
      expect(container.classList.contains('special-ready')).toBe(true);
    });

    it('resets meter width to 0% and removes ".special-ready" after activation', () => {
      const container = dashboard.getElement()!.querySelector('.dashboard-special-container')!;
      const bar = dashboard.getElement()!.querySelector('.special-charge-bar') as HTMLElement;

      dashboard.update({ specialEnergy: 100, isSpecialReady: true } as any);
      expect(container.classList.contains('special-ready')).toBe(true);

      // Fired special -> energy consumed
      dashboard.update({ specialEnergy: 0, isSpecialReady: false } as any);
      expect(container.classList.contains('special-ready')).toBe(false);
      expect(bar.style.width).toBe('0%');
    });

    it('updates special cue text with charging percentage (e.g. 42% displays "42%")', () => {
      const cue = dashboard.getElement()!.querySelector('.special-cue')!;

      dashboard.update({ specialEnergy: 0, isSpecialReady: false } as any);
      expect(cue.textContent).toBe('0%');

      dashboard.update({ specialEnergy: 42.7, isSpecialReady: false } as any);
      expect(cue.textContent).toBe('42%');

      dashboard.update({ specialEnergy: 99, isSpecialReady: false } as any);
      expect(cue.textContent).toBe('99%');

      dashboard.update({ specialEnergy: 100, isSpecialReady: true } as any);
      expect(cue.textContent).toBe('READY [X]');
      expect(cue.classList.contains('special-ready-cue')).toBe(true);

      dashboard.update({ specialEnergy: 0, isSpecialReady: false } as any);
      expect(cue.textContent).toBe('0%');
      expect(cue.classList.contains('special-ready-cue')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Action Buttons & Click Dispatching
  // --------------------------------------------------------------------------
  describe('6. Action Buttons & Click Dispatching', () => {
    it('dispatches onToggleMute and toggles icon between 🔊 and 🔇', () => {
      let isMutedState = false;
      const onToggleMute = vi.fn().mockImplementation(() => {
        isMutedState = !isMutedState;
        return isMutedState;
      });

      dashboard.destroy();
      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onToggleMute,
      });

      const btnMute = dashboard.getElement()!.querySelector('#btn-dash-mute')!;
      expect(btnMute.textContent).toBe('🔊');
      expect(btnMute.getAttribute('aria-pressed')).toBe('false');

      btnMute.dispatchEvent({ type: 'click' } as any);
      expect(onToggleMute).toHaveBeenCalledTimes(1);

      dashboard.update({ isMuted: true } as any);
      expect(btnMute.textContent).toBe('🔇');
      expect(btnMute.getAttribute('aria-label')).toBe('Unmute Audio');
      expect(btnMute.getAttribute('aria-pressed')).toBe('true');
    });

    it('dispatches onToggleFullscreen and toggles icon between ⛶ and 🗗', () => {
      const onToggleFullscreen = vi.fn().mockResolvedValue(true);
      dashboard.destroy();
      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onToggleFullscreen,
      });

      const btnFs = dashboard.getElement()!.querySelector('#btn-dash-fullscreen')!;
      expect(btnFs.textContent).toBe('⛶');
      expect(btnFs.getAttribute('aria-pressed')).toBe('false');

      btnFs.dispatchEvent({ type: 'click' } as any);
      expect(onToggleFullscreen).toHaveBeenCalledTimes(1);

      dashboard.update({ isFullscreen: true } as any);
      expect(btnFs.textContent).toBe('🗗');
      expect(btnFs.getAttribute('aria-label')).toBe('Exit Fullscreen');
      expect(btnFs.getAttribute('aria-pressed')).toBe('true');
    });

    it('dispatches onTogglePause and toggles icon between ⏸ and ▶', () => {
      const onTogglePause = vi.fn();
      dashboard.destroy();
      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onTogglePause,
      });

      const btnPause = dashboard.getElement()!.querySelector('#btn-dash-pause')!;
      expect(btnPause.textContent).toBe('⏸');
      expect(btnPause.getAttribute('aria-pressed')).toBe('false');

      btnPause.dispatchEvent({ type: 'click' } as any);
      expect(onTogglePause).toHaveBeenCalledTimes(1);

      dashboard.update({ isPaused: true } as any);
      expect(btnPause.textContent).toBe('▶');
      expect(btnPause.getAttribute('aria-label')).toBe('Resume Game');
      expect(btnPause.getAttribute('aria-pressed')).toBe('true');
    });

    it('synchronizes aria-pressed attribute across all three action buttons', () => {
      const btnMute = dashboard.getElement()!.querySelector('#btn-dash-mute')!;
      const btnFs = dashboard.getElement()!.querySelector('#btn-dash-fullscreen')!;
      const btnPause = dashboard.getElement()!.querySelector('#btn-dash-pause')!;

      expect(btnMute.getAttribute('aria-pressed')).toBe('false');
      expect(btnFs.getAttribute('aria-pressed')).toBe('false');
      expect(btnPause.getAttribute('aria-pressed')).toBe('false');

      dashboard.update({ isMuted: true, isFullscreen: true, isPaused: true } as any);
      expect(btnMute.getAttribute('aria-pressed')).toBe('true');
      expect(btnFs.getAttribute('aria-pressed')).toBe('true');
      expect(btnPause.getAttribute('aria-pressed')).toBe('true');

      dashboard.update({ isMuted: false, isFullscreen: false, isPaused: false } as any);
      expect(btnMute.getAttribute('aria-pressed')).toBe('false');
      expect(btnFs.getAttribute('aria-pressed')).toBe('false');
      expect(btnPause.getAttribute('aria-pressed')).toBe('false');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Mobile Compact Mode
  // --------------------------------------------------------------------------
  describe('7. Mobile Compact Mode', () => {
    it('toggles ".compact-mode" class via setCompactMode()', () => {
      const root = dashboard.getElement()!;
      expect(root.classList.contains('compact-mode')).toBe(false);

      dashboard.setCompactMode(true);
      expect(root.classList.contains('compact-mode')).toBe(true);
      expect(dashboard.isCompactMode()).toBe(true);

      dashboard.setCompactMode(false);
      expect(root.classList.contains('compact-mode')).toBe(false);
      expect(dashboard.isCompactMode()).toBe(false);
    });

    it('hides controls guide legend in compact mode', () => {
      dashboard.setCompactMode(true);
      const legend = dashboard.getElement()!.querySelector('.controls-legend')!;
      expect(legend.classList.contains('hidden-compact')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Adversarial & Edge Cases
  // --------------------------------------------------------------------------
  describe('8. Adversarial & Edge Cases', () => {
    it('handles null / missing container option by falling back to document.body safely', () => {
      const detached = new BottomDashboard({ container: undefined });
      expect(detached.getElement()).not.toBeNull();
      detached.destroy();
    });

    it('dirty-checking stress: 10,000 identical update() calls produce 0 DOM thrashing', () => {
      const scoreEl = (dashboard.getElement()!.querySelector('#dashboard-score') as unknown) as MockElement;
      dashboard.update({ score: 1200, highScore: 20000, lives: 3 } as any);
      const initialSetters = scoreEl.textContentSetterCount;

      // 10,000 repeated frames with identical values
      for (let i = 0; i < 10000; i++) {
        dashboard.update({ score: 1200, highScore: 20000, lives: 3 } as any);
      }

      expect(scoreEl.textContentSetterCount).toBe(initialSetters);
    });

    it('handles NaN, undefined, and negative score values gracefully', () => {
      const scoreEl = dashboard.getElement()!.querySelector('#dashboard-score')!;

      dashboard.update({ score: NaN, highScore: 20000, lives: 3 } as any);
      expect(scoreEl.textContent).toBe('000000');

      dashboard.update({ score: -500, highScore: 20000, lives: 3 } as any);
      expect(scoreEl.textContent).toBe('000000');
    });

    it('handles missing or rejected button callbacks without uncaught errors', () => {
      const errorFs = vi.fn().mockRejectedValue(new Error('Permission denied'));
      dashboard.destroy();
      dashboard = new BottomDashboard({
        container: mockAppContainer as any,
        onToggleFullscreen: errorFs,
      });

      const btnFs = dashboard.getElement()!.querySelector('#btn-dash-fullscreen')!;
      expect(() => {
        btnFs.dispatchEvent({ type: 'click' } as any);
      }).not.toThrow();
    });

    it('clamps special energy above 100% or below 0% safely', () => {
      const bar = dashboard.getElement()!.querySelector('.special-charge-bar') as HTMLElement;

      dashboard.update({ specialEnergy: 250, isSpecialReady: true } as any);
      expect(bar.style.width).toBe('100%');

      dashboard.update({ specialEnergy: -50, isSpecialReady: false } as any);
      expect(bar.style.width).toBe('0%');
    });

    it('allocates 0 Set instances during steady-state update() animation loop', () => {
      // Warm up and mount initial chip
      dashboard.update({
        score: 1000,
        highScore: 20000,
        lives: 3,
        specialEnergy: 50,
        activePowerUps: [
          {
            id: 'rapid_1',
            type: 'RAPID_FIRE',
            remainingDuration: 5,
            totalDuration: 10,
          },
        ],
      } as any);

      const OrigSet = globalThis.Set;
      let setAllocCount = 0;
      class TrackingSet extends OrigSet {
        constructor(...args: any[]) {
          super(...args);
          setAllocCount++;
        }
      }
      globalThis.Set = TrackingSet as any;

      try {
        for (let i = 0; i < 100; i++) {
          dashboard.update({
            score: 1000 + i,
            highScore: 20000,
            lives: 3,
            specialEnergy: 50,
            activePowerUps: [
              {
                id: 'rapid_1',
                type: 'RAPID_FIRE',
                remainingDuration: 5,
                totalDuration: 10,
              },
            ],
          } as any);
        }
        expect(setAllocCount).toBe(0);
      } finally {
        globalThis.Set = OrigSet;
      }
    });
  });
});
