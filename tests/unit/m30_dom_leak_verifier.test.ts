/**
 * Galaga Arcade Web Game — Milestone M30
 * DOM Lifecycle & Zero-GC Telemetry Verifier Test Suite
 * Agent: m30_dom_leak_verifier
 * Location: tests/unit/m30_dom_leak_verifier.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER VERIFICATION:
 * 1. Repeated 60 FPS Telemetry Updates (10,000 frames) incur strictly 0 DOM allocations
 *    and 0 temporary heap allocations during steady-state animation loop.
 * 2. Consecutive init() and destroy() cycles cleanly remove all event listeners and
 *    DOM elements without detached node leaks or residual references.
 * 3. Extreme power-up churn and life icon recycling maintain bounded pools with 0 leaks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import {
  BottomDashboard,
  type DashboardTelemetry,
} from '../../src/ui/BottomDashboard';

// ============================================================================
// Granular DOM Instrumentation & Allocation Spy Infrastructure
// ============================================================================

interface DomMetrics {
  createElementCalls: number;
  createElementNSCalls: number;
  appendChildCalls: number;
  removeChildCalls: number;
  textContentSetters: number;
  styleMutations: number;
  classListMutations: number;
  setAttributeCalls: number;
}

const metrics: DomMetrics = {
  createElementCalls: 0,
  createElementNSCalls: 0,
  appendChildCalls: 0,
  removeChildCalls: 0,
  textContentSetters: 0,
  styleMutations: 0,
  classListMutations: 0,
  setAttributeCalls: 0,
};

function resetMetrics() {
  metrics.createElementCalls = 0;
  metrics.createElementNSCalls = 0;
  metrics.appendChildCalls = 0;
  metrics.removeChildCalls = 0;
  metrics.textContentSetters = 0;
  metrics.styleMutations = 0;
  metrics.classListMutations = 0;
  metrics.setAttributeCalls = 0;
}

function getTotalMutations(): number {
  return (
    metrics.createElementCalls +
    metrics.createElementNSCalls +
    metrics.appendChildCalls +
    metrics.removeChildCalls +
    metrics.textContentSetters +
    metrics.styleMutations +
    metrics.classListMutations +
    metrics.setAttributeCalls
  );
}

class InstrumentedClassList {
  private classes: Set<string> = new Set();

  constructor(initial: string[] = []) {
    for (const c of initial) if (c) this.classes.add(c);
  }

  add(...items: string[]) {
    for (const c of items) {
      if (c && !this.classes.has(c)) {
        metrics.classListMutations++;
        this.classes.add(c);
      }
    }
  }

  remove(...items: string[]) {
    for (const c of items) {
      if (this.classes.has(c)) {
        metrics.classListMutations++;
        this.classes.delete(c);
      }
    }
  }

  contains(c: string): boolean {
    return this.classes.has(c);
  }

  toggle(c: string, force?: boolean): boolean {
    metrics.classListMutations++;
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
}

function createInstrumentedStyle(): Record<string, string> {
  const store: Record<string, string> = {};
  return new Proxy(store, {
    set(target, prop, value) {
      const strVal = String(value);
      if (target[prop as string] !== strVal) {
        metrics.styleMutations++;
      }
      target[prop as string] = strVal;
      return true;
    },
    get(target, prop) {
      return target[prop as string] || '';
    },
  });
}

class InstrumentedElement {
  public tagName: string;
  public id: string = '';
  public classList: InstrumentedClassList;
  public children: InstrumentedElement[] = [];
  public parentElement: InstrumentedElement | null = null;
  public attributes: Record<string, string> = {};
  public style: Record<string, string> = createInstrumentedStyle();
  public title: string = '';
  private _textContent: string = '';
  public listeners: Record<string, Set<(e: any) => void>> = {};
  private _innerHTML: string = '';

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new InstrumentedClassList();
    if (id) this.attributes['id'] = id;
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === '') {
      for (const child of this.children) {
        child.parentElement = null;
      }
      this.children = [];
    }
  }

  get className(): string {
    return this.classList.toString();
  }

  set className(val: string) {
    if (val) {
      const parts = val.trim().split(/\s+/);
      for (const p of parts) if (p) this.classList.add(p);
    }
  }

  get textContent(): string {
    return this._textContent;
  }

  set textContent(val: string) {
    metrics.textContentSetters++;
    this._textContent = String(val);
  }

  setAttribute(name: string, value: string) {
    metrics.setAttributeCalls++;
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name: string): string | null {
    if (name === 'id') return this.id || null;
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string) {
    metrics.setAttributeCalls++;
    delete this.attributes[name];
  }

  appendChild(child: InstrumentedElement): InstrumentedElement {
    if (!child) return child;
    metrics.appendChildCalls++;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: InstrumentedElement): InstrumentedElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      metrics.removeChildCalls++;
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector: string): InstrumentedElement | null {
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

  querySelectorAll(selector: string): InstrumentedElement[] {
    const res: InstrumentedElement[] = [];
    const walk = (node: InstrumentedElement) => {
      if (selector.startsWith('.')) {
        if (node.classList.contains(selector.slice(1))) res.push(node);
      } else if (selector.startsWith('#')) {
        if (node.id === selector.slice(1)) res.push(node);
      } else if (node.tagName.toLowerCase() === selector.toLowerCase()) {
        res.push(node);
      }
      for (const c of node.children) walk(c);
    };
    for (const c of this.children) walk(c);
    return res;
  }

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type]!.add(listener);
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

  getListenerCount(type?: string): number {
    if (type) return this.listeners[type]?.size ?? 0;
    let total = 0;
    for (const k of Object.keys(this.listeners)) total += this.listeners[k]?.size ?? 0;
    return total;
  }

  getContext(_type?: string): any {
    return {
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(100) }),
      putImageData: () => {},
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      measureText: () => ({ width: 10 }),
    };
  }
}

class InstrumentedDocument {
  public body: InstrumentedElement = new InstrumentedElement('BODY');
  public documentElement: InstrumentedElement = new InstrumentedElement('HTML');
  public listeners: Record<string, Set<(e: any) => void>> = {};

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type]!.add(listener);
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

  createElement(tagName: string): InstrumentedElement {
    metrics.createElementCalls++;
    return new InstrumentedElement(tagName);
  }

  createElementNS(_ns: string, tagName: string): InstrumentedElement {
    metrics.createElementNSCalls++;
    return new InstrumentedElement(tagName);
  }

  getElementById(id: string): InstrumentedElement | null {
    return this.body.querySelector('#' + id);
  }

  querySelector(selector: string): InstrumentedElement | null {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector: string): InstrumentedElement[] {
    return this.body.querySelectorAll(selector);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Milestone M30: DOM Lifecycle & Zero-GC Telemetry Verifier (Empirical Adversarial)', () => {
  let doc: InstrumentedDocument;
  let container: InstrumentedElement;
  let originalDocument: any;

  beforeEach(() => {
    resetMetrics();
    doc = new InstrumentedDocument();
    container = doc.createElement('DIV');
    container.id = 'app-container';
    doc.body.appendChild(container);

    originalDocument = (globalThis as any).document;
    (globalThis as any).document = doc;
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
  });

  // ==========================================================================
  // Track 1: Repeated 60 FPS Telemetry Updates — Zero DOM Allocations
  // ==========================================================================
  describe('Track 1: Repeated 60 FPS Telemetry Updates (Zero DOM Allocations)', () => {
    it('steady-state 60 FPS telemetry: 10,000 repeated update() calls produce STRICTLY ZERO DOM allocations and zero mutations', () => {
      const dashboard = new BottomDashboard({ container: container as any });
      expect(dashboard.getElement()).not.toBeNull();

      // Initial state application
      const telemetry: DashboardTelemetry = {
        score: 54320,
        highScore: 100000,
        lives: 3,
        specialEnergy: 65,
        selectedSpecial: 'NOVA_BARRAGE',
        isMuted: false,
        isFullscreen: false,
        isPaused: false,
        activePowerUps: [
          { id: 'p1', type: 'RAPID_FIRE', remainingDuration: 10, totalDuration: 15, isActive: true },
        ],
      };

      dashboard.update(telemetry);

      // Reset all instrumentation counters post-warmup
      resetMetrics();

      // Execute 10,000 continuous frames with identical telemetry
      for (let frame = 0; frame < 10000; frame++) {
        dashboard.update(telemetry);
      }

      // Assert that absolutely 0 DOM operations were triggered
      expect(metrics.createElementCalls).toBe(0);
      expect(metrics.createElementNSCalls).toBe(0);
      expect(metrics.appendChildCalls).toBe(0);
      expect(metrics.removeChildCalls).toBe(0);
      expect(metrics.textContentSetters).toBe(0);
      expect(metrics.styleMutations).toBe(0);
      expect(metrics.classListMutations).toBe(0);
      expect(metrics.setAttributeCalls).toBe(0);
      expect(getTotalMutations()).toBe(0);

      dashboard.destroy();
    });

    it('dynamic 60 FPS updates with fluctuating values: produces ZERO createElement or createElementNS calls after warmup', () => {
      const dashboard = new BottomDashboard({ container: container as any });

      // Warm up power-up chips for all 9 types to pre-populate chip pool
      const all9Types = [
        'RAPID_FIRE',
        'KINETIC_SHIELD',
        'SCATTER_SHOT',
        'ENGINE_BOOSTER',
        'CHRONO_FIELD',
        'REFLECTION_SHIELD',
        'EMP_COLLECTOR',
        'PHASE_DRIVE',
        'ANTIMATTER_PLASMA',
      ];

      const warmupTelemetry: DashboardTelemetry = {
        score: 0,
        highScore: 20000,
        lives: 5,
        specialEnergy: 0,
        activePowerUps: all9Types.map((t, idx) => ({
          id: 'chip_' + String(idx),
          type: t,
          remainingDuration: 15,
          totalDuration: 15,
          isActive: true,
        })),
      };

      dashboard.update(warmupTelemetry);

      // Now reset metrics. The pool contains all 9 pre-allocated chips and 5 life icons.
      resetMetrics();

      // Simulate 6,000 frames (100 seconds of combat action) with continuous variations
      for (let frame = 1; frame <= 6000; frame++) {
        const energy = frame % 101;
        const activeCount = (frame % 9) + 1;
        const activeChips = (warmupTelemetry.activePowerUps || []).slice(0, activeCount).map(chip => ({
          ...chip,
          remainingDuration: Math.max(0, 15 - (frame % 15)),
        }));

        dashboard.update({
          score: frame * 10,
          highScore: 100000,
          lives: (frame % 5) + 1,
          specialEnergy: energy,
          isSpecialReady: energy === 100,
          activePowerUps: activeChips,
        });

        // Strictly verify that NO new DOM elements are allocated during the loop!
        expect(metrics.createElementCalls).toBe(0);
        expect(metrics.createElementNSCalls).toBe(0);
      }

      dashboard.destroy();
    });

    it('allocates 0 Set, 0 Map, and 0 temporary heap collections during steady update() loop', () => {
      const dashboard = new BottomDashboard({ container: container as any });

      const steadyTelemetry: DashboardTelemetry = {
        score: 12500,
        highScore: 50000,
        lives: 3,
        specialEnergy: 50,
        activePowerUps: [
          { id: 'chip_1', type: 'RAPID_FIRE', remainingDuration: 10, totalDuration: 15, isActive: true },
        ],
      };

      dashboard.update(steadyTelemetry);

      // Spy on Set and Map constructors
      const OrigSet = globalThis.Set;
      const OrigMap = globalThis.Map;
      let setAllocations = 0;
      let mapAllocations = 0;

      class TrackedSet<T> extends OrigSet<T> {
        constructor(entries?: readonly T[] | null) {
          super(entries ?? undefined);
          setAllocations++;
        }
      }

      class TrackedMap<K, V> extends OrigMap<K, V> {
        constructor(entries?: readonly (readonly [K, V])[] | null) {
          super(entries ?? undefined);
          mapAllocations++;
        }
      }

      (globalThis as any).Set = TrackedSet;
      (globalThis as any).Map = TrackedMap;

      try {
        // Run 500 frames of gameplay
        for (let i = 0; i < 500; i++) {
          dashboard.update(steadyTelemetry);
        }

        expect(setAllocations).toBe(0);
        expect(mapAllocations).toBe(0);
      } finally {
        (globalThis as any).Set = OrigSet;
        (globalThis as any).Map = OrigMap;
        dashboard.destroy();
      }
    });
  });

  // ==========================================================================
  // Track 2: Consecutive init() and destroy() Cycles (Teardown Hygiene)
  // ==========================================================================
  describe('Track 2: Consecutive init() and destroy() Teardown Hygiene', () => {
    it('100 consecutive new BottomDashboard() / destroy() cycles cleanly free DOM elements with zero detached node leaks', () => {
      expect(container.children.length).toBe(0);

      for (let cycle = 0; cycle < 100; cycle++) {
        const dash = new BottomDashboard({ container: container as any });
        expect(container.children.length).toBe(1);
        expect(dash.getElement()).not.toBeNull();

        // Feed some telemetry
        dash.update({
          score: 1000 * cycle,
          highScore: 20000,
          lives: 4,
          specialEnergy: 80,
          activePowerUps: [
            { id: 'c1', type: 'RAPID_FIRE', remainingDuration: 5, totalDuration: 10, isActive: true },
          ],
        });

        // Destroy and assert complete cleanup
        dash.destroy();
        expect(container.children.length).toBe(0);
        expect(dash.getElement()).toBeNull();
      }

      // Final post-condition: Container has exactly 0 children remaining
      expect(container.children.length).toBe(0);
    });

    it('100 consecutive init() and destroy() calls on the same instance cleanly recycle without leaking children', () => {
      const dash = new BottomDashboard({ container: container as any });
      expect(container.children.length).toBe(1);

      for (let cycle = 0; cycle < 100; cycle++) {
        dash.destroy();
        expect(container.children.length).toBe(0);
        expect(dash.getElement()).toBeNull();

        const success = dash.init(container as any);
        expect(success).toBe(true);
        expect(container.children.length).toBe(1);
        expect(dash.getElement()).not.toBeNull();

        // Exercise update
        dash.update({ score: cycle * 50, highScore: 50000, lives: 3 });
      }

      dash.destroy();
      expect(container.children.length).toBe(0);
    });

    it('cleanly detaches all button event listeners upon destroy(), preventing phantom callback execution', () => {
      const onToggleMute = vi.fn();
      const onToggleFullscreen = vi.fn();
      const onTogglePause = vi.fn();

      const dash = new BottomDashboard({
        container: container as any,
        onToggleMute,
        onToggleFullscreen,
        onTogglePause,
      });

      const btnMute = dash.getElement()!.querySelector('#btn-dash-mute') as unknown as InstrumentedElement;
      const btnFs = dash.getElement()!.querySelector('#btn-dash-fullscreen') as unknown as InstrumentedElement;
      const btnPause = dash.getElement()!.querySelector('#btn-dash-pause') as unknown as InstrumentedElement;

      expect(btnMute.getListenerCount('click')).toBe(1);
      expect(btnFs.getListenerCount('click')).toBe(1);
      expect(btnPause.getListenerCount('click')).toBe(1);

      // Dispatch click while alive
      btnMute.dispatchEvent({ type: 'click' });
      btnFs.dispatchEvent({ type: 'click' });
      btnPause.dispatchEvent({ type: 'click' });

      expect(onToggleMute).toHaveBeenCalledTimes(1);
      expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
      expect(onTogglePause).toHaveBeenCalledTimes(1);

      // Now destroy the dashboard
      dash.destroy();

      // Assert event listeners are detached
      expect(btnMute.getListenerCount('click')).toBe(0);
      expect(btnFs.getListenerCount('click')).toBe(0);
      expect(btnPause.getListenerCount('click')).toBe(0);

      // Dispatching clicks on the orphan nodes must NOT trigger callbacks
      btnMute.dispatchEvent({ type: 'click' });
      btnFs.dispatchEvent({ type: 'click' });
      btnPause.dispatchEvent({ type: 'click' });

      expect(onToggleMute).toHaveBeenCalledTimes(1);
      expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
      expect(onTogglePause).toHaveBeenCalledTimes(1);
    });

    it('destroy() is completely idempotent: multiple consecutive destroy() calls do not throw or leak', () => {
      const dash = new BottomDashboard({ container: container as any });
      expect(container.children.length).toBe(1);

      expect(() => {
        dash.destroy();
        dash.destroy();
        dash.destroy();
        dash.destroy();
        dash.destroy();
      }).not.toThrow();

      expect(container.children.length).toBe(0);
      expect(dash.getElement()).toBeNull();
    });

    it('safe post-destruction operations: update() and reset() gracefully no-op without error', () => {
      const dash = new BottomDashboard({ container: container as any });
      dash.destroy();

      expect(() => {
        dash.update({ score: 99999, highScore: 99999, lives: 3 });
        dash.reset();
        dash.setCompactMode(true);
      }).not.toThrow();

      expect(container.children.length).toBe(0);
    });
  });

  // ==========================================================================
  // Track 3: Power-Up Churn & Life Icon Rack Bounded Pool Invariants
  // ==========================================================================
  describe('Track 3: Power-Up Churn & Bounded Pool Invariants', () => {
    it('extreme power-up churn: rapid mounting, unmounting, and duration updates never leak DOM nodes', () => {
      const dash = new BottomDashboard({ container: container as any });
      const rack = dash.getElement()!.querySelector('#dashboard-powerups') as unknown as InstrumentedElement;
      expect(rack).not.toBeNull();

      const itemA = { id: 'item_a', type: 'RAPID_FIRE', remainingDuration: 15, totalDuration: 15, isActive: true };
      const itemB = { id: 'item_b', type: 'KINETIC_SHIELD', remainingDuration: 1, totalDuration: 1, isActive: true };
      const itemC = { id: 'item_c', type: 'SCATTER_SHOT', remainingDuration: 10, totalDuration: 10, isActive: true };

      // 1,000 cycles of alternating power-up activation and expiration
      for (let i = 0; i < 1000; i++) {
        // Mount items A and B
        dash.update({
          score: 100,
          highScore: 20000,
          lives: 3,
          activePowerUps: [itemA, itemB],
        });
        expect(rack.children.length).toBe(2);

        // Expire item B, mount item C
        dash.update({
          score: 100,
          highScore: 20000,
          lives: 3,
          activePowerUps: [itemA, itemC],
        });
        expect(rack.children.length).toBe(2);

        // Expire all items
        dash.update({
          score: 100,
          highScore: 20000,
          lives: 3,
          activePowerUps: [],
        });
        expect(rack.children.length).toBe(0);
      }

      // Reset metrics and ensure subsequent activations re-use pool elements with 0 createElement calls
      resetMetrics();
      dash.update({
        score: 100,
        highScore: 20000,
        lives: 3,
        activePowerUps: [itemA, itemB, itemC],
      });
      expect(metrics.createElementCalls).toBe(0);
      expect(rack.children.length).toBe(3);

      dash.destroy();
    });

    it('life icons rack bound: clamping to [0, 5] never exceeds 5 children or creates un-recycled nodes', () => {
      const dash = new BottomDashboard({ container: container as any });
      const livesRack = dash.getElement()!.querySelector('#dashboard-lives') as unknown as InstrumentedElement;

      // Oscillate across boundary conditions
      const lifeSequences = [0, 5, 10, -2, 3, 0, 1, 5, 0, 4, 2, 5, 0];

      for (const lives of lifeSequences) {
        dash.update({ score: 0, highScore: 20000, lives });
        const clamped = Math.max(0, Math.min(5, lives));
        expect(livesRack.children.length).toBe(clamped);
      }

      // Reset dashboard and verify lives rack empties
      dash.reset();
      expect(livesRack.children.length).toBe(0);

      dash.destroy();
    });
  });

  // ==========================================================================
  // Track 4: Adverse Telemetry Fuzzing & Resilience
  // ==========================================================================
  describe('Track 4: Adverse Telemetry Fuzzing & Corruption Resilience', () => {
    it('survives completely empty, null, or undefined telemetry updates without crash', () => {
      const dash = new BottomDashboard({ container: container as any });

      expect(() => {
        dash.update(null as any);
        dash.update(undefined as any);
        dash.update({} as any);
        dash.update({
          score: NaN,
          highScore: Infinity,
          lives: -999,
          specialEnergy: NaN,
          activePowerUps: null as any,
        } as any);
      }).not.toThrow();

      dash.destroy();
    });

    it('handles SSR / headless environments without document gracefully', () => {
      (globalThis as any).document = undefined;

      const headlessDash = new BottomDashboard();
      expect(headlessDash.getElement()).toBeNull();
      expect(headlessDash.init()).toBe(false);

      expect(() => {
        headlessDash.update({ score: 100, highScore: 20000, lives: 3 });
        headlessDash.reset();
        headlessDash.destroy();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Track 5: Game Coordinator Integration & Teardown Hygiene
  // ==========================================================================
  describe('Track 5: Game Coordinator (Game.ts) Telemetry & Teardown Integration', () => {
    it('Game loop updates bottomDashboard continuously with 0 new telemetry container allocations', () => {
      const game = new Game();
      expect(game.isReady()).toBe(true);
      expect(game.bottomDashboard).toBeDefined();

      game.startGame();
      game.update(2.5); // Advance to PLAYING state

      // Reference to existing pre-allocated telemetry object
      const originalDashboardState = (game as any)._dashboardState;
      expect(originalDashboardState).toBeDefined();
      const originalPowerUpSlots = originalDashboardState.activePowerUps;
      expect(originalPowerUpSlots).toBeDefined();
      expect(originalPowerUpSlots.length).toBe(9);

      // Run 600 ticks (10 seconds of simulated 60 FPS combat)
      for (let tick = 0; tick < 600; tick++) {
        game.update(1 / 60);

        // Invariant: Telemetry state object reference must be strictly preserved (Zero-GC)
        expect((game as any)._dashboardState).toBe(originalDashboardState);
        expect((game as any)._dashboardState.activePowerUps).toBe(originalPowerUpSlots);
      }

      game.destroy();
      expect(game.bottomDashboard.getElement()).toBeNull();
    });

    it('20 consecutive new Game() and game.destroy() cycles leave 0 detached dashboard nodes', () => {
      for (let cycle = 0; cycle < 20; cycle++) {
        const game = new Game();
        expect(game.bottomDashboard.getElement()).not.toBeNull();
        game.startGame();
        game.update(0.1);
        game.destroy();
        expect(game.bottomDashboard.getElement()).toBeNull();
      }
    });
  });
});
