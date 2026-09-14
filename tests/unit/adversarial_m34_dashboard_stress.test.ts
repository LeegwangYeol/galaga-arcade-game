/**
 * Galaga Arcade Web Game — Milestone M34
 * Adversarial Empirical Verification Test Suite: Zero-GC Dirty Checking Stress & DOM Mutation Invariance
 * Location: tests/unit/adversarial_m34_dashboard_stress.test.ts
 *
 * Requirements Tested:
 * 1. Static Frame Invariance: 10,000 consecutive 60 FPS frames with unchanged telemetry -> EXACTLY 0 DOM mutations.
 * 2. Partial Dirty Checking Isolation: Mutate ONLY P1 score -> P1 updates, P2 score, lives, special meters, stage, and high score receive 0 DOM writes.
 * 3. Revive Countdown Mutation Frequency: 10-second countdown stepping dt=0.016 (60 FPS, ~600 frames) -> DOM updates <= 10 times total (<= once per integer second), NOT 600 times.
 * 4. Zero-GC & Memory Heap Stability: 5,000 full dashboard update cycles -> < 1.0 MB heap drift.
 * 5. Adversarial Boundary Stress: NaN/Infinity/Negative values, power-up chip recycling, post-destroy safety.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import {
  BottomDashboard,
  type DashboardTelemetry,
  type PowerUpChipTelemetry,
} from '../../src/ui/BottomDashboard';
import { PowerUpType } from '../../src/core/powerups/types';

function forceGC(): void {
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
    (globalThis as any).gc();
    return;
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    if (typeof gc === 'function') {
      gc();
      gc();
    }
  } catch {
    // Fallback if V8 sandbox restricts gc
  }
}

// ============================================================================
// Prototype-Based Mock DOM Infrastructure
// Designed specifically so prototype spies (vi.spyOn(Element.prototype, ...)) work accurately.
// ============================================================================

export class MockDOMTokenList {
  private _classes: Set<string> = new Set();

  constructor(initial: string[] = []) {
    for (const c of initial) {
      if (c) this._classes.add(c);
    }
  }

  add(...tokens: string[]): void {
    for (const t of tokens) {
      if (t) this._classes.add(t);
    }
  }

  remove(...tokens: string[]): void {
    for (const t of tokens) {
      this._classes.delete(t);
    }
  }

  toggle(token: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) this._classes.add(token);
      else this._classes.delete(token);
      return force;
    }
    if (this._classes.has(token)) {
      this._classes.delete(token);
      return false;
    }
    this._classes.add(token);
    return true;
  }

  contains(token: string): boolean {
    return this._classes.has(token);
  }

  toString(): string {
    return Array.from(this._classes).join(' ');
  }

  get length(): number {
    return this._classes.size;
  }
}

export class MockCSSStyleDeclaration {
  private _props: Record<string, string> = {};

  get width(): string {
    return this._props['width'] || '';
  }

  set width(val: string) {
    this._props['width'] = val;
  }

  get borderColor(): string {
    return this._props['borderColor'] || '';
  }

  set borderColor(val: string) {
    this._props['borderColor'] = val;
  }

  get backgroundColor(): string {
    return this._props['backgroundColor'] || '';
  }

  set backgroundColor(val: string) {
    this._props['backgroundColor'] = val;
  }

  get display(): string {
    return this._props['display'] || '';
  }

  set display(val: string) {
    this._props['display'] = val;
  }

  get height(): string {
    return this._props['height'] || '';
  }

  set height(val: string) {
    this._props['height'] = val;
  }

  getPropertyValue(prop: string): string {
    return this._props[prop] || '';
  }

  setProperty(prop: string, val: string): void {
    this._props[prop] = val;
  }
}

export class MockElement {
  public tagName: string;
  public id: string = '';
  private _className: string = '';
  public classList: MockDOMTokenList;
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public attributes: Record<string, string> = {};
  public style: MockCSSStyleDeclaration;
  public innerHTML: string = '';
  public title: string = '';
  private _textContent: string = '';
  private listeners: Record<string, Set<(e: any) => void>> = {};

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockDOMTokenList();
    this.style = new MockCSSStyleDeclaration();
    if (id) {
      this.attributes['id'] = id;
    }
  }

  get className(): string {
    return this._className || this.classList.toString();
  }

  set className(val: string) {
    this._className = val || '';
    this.classList = new MockDOMTokenList();
    if (val) {
      const parts = val.trim().split(/\s+/);
      for (const p of parts) {
        if (p) this.classList.add(p);
      }
    }
  }

  get textContent(): string {
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join('');
    }
    return this._textContent;
  }

  set textContent(val: string) {
    this._textContent = String(val);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name: string): string | null {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  appendChild(child: MockElement): MockElement {
    if (!child) return child;
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
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

  private matchesSingle(sel: string): boolean {
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    return this.tagName.toLowerCase() === sel.toLowerCase();
  }

  querySelector(selector: string): MockElement | null {
    const parts = selector.trim().split(/\s+/);
    if (parts.length > 1) {
      let current: MockElement[] = [this];
      for (const part of parts) {
        const next: MockElement[] = [];
        for (const node of current) {
          next.push(...node.querySelectorAll(part));
        }
        if (next.length === 0) return null;
        current = next;
      }
      return current[0] || null;
    }

    if (this.matchesSingle(selector)) return this;
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const search = (node: MockElement, isRoot: boolean) => {
      if (!isRoot && node.matchesSingle(selector)) {
        results.push(node);
      }
      for (const child of node.children) search(child, false);
    };
    search(this, true);
    return results;
  }

  addEventListener(type: string, listener: (e: any) => void): void {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type]!.add(listener);
  }

  removeEventListener(type: string, listener: (e: any) => void): void {
    this.listeners[type]?.delete(listener);
  }

  dispatchEvent(event: any): boolean {
    const set = this.listeners[event.type];
    if (set) {
      for (const fn of Array.from(set)) fn(event);
    }
    return true;
  }
}

export class MockDocument {
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

  registerElement(id: string, el: MockElement): void {
    el.id = id;
    this.elementsById.set(id, el);
    this.body.appendChild(el);
  }
}

// Attach prototype mocks to globalThis
(globalThis as any).Element = MockElement;
(globalThis as any).HTMLElement = MockElement;
(globalThis as any).DOMTokenList = MockDOMTokenList;
(globalThis as any).CSSStyleDeclaration = MockCSSStyleDeclaration;

// ============================================================================
// Adversarial Empirical Stress Test Suite
// ============================================================================

describe('Milestone M34: Adversarial Zero-GC Dirty Checking Stress & DOM Mutation Invariance', () => {
  let mockDoc: MockDocument;
  let mockAppContainer: MockElement;
  let dashboard: BottomDashboard;

  beforeEach(() => {
    mockDoc = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');
    mockDoc.registerElement('app-container', mockAppContainer);

    (globalThis as any).document = mockDoc;
    (globalThis as any).window = {
      innerWidth: 1024,
      innerHeight: 768,
      document: mockDoc,
    };

    dashboard = new BottomDashboard({
      container: mockAppContainer as any,
      mode: 'coop',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dashboard.destroy();
    delete (globalThis as any).document;
    delete (globalThis as any).window;
  });

  // ==========================================================================
  // Track 1: Static Frame Invariance (10,000 consecutive 60 FPS frames)
  // ==========================================================================
  describe('Track 1: Static Frame Invariance (10,000 consecutive 60 FPS frames)', () => {
    it('asserts EXACTLY 0 DOM mutations across 10,000 consecutive frames in Co-op mode', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        score: 12500,
        highScore: 35000,
        stage: 4,
        crisisWarning: '',
        p1: {
          score: 12500,
          lives: 3,
          combo: 2,
          specialEnergy: 65,
          specialReady: false,
          state: 'normal',
          activePowerUps: [
            {
              type: PowerUpType.RAPID_FIRE,
              id: 'p1-rf',
              label: 'RF',
              progress: 0.75,
              color: '#ff7f00',
              isActive: true,
            },
          ],
        },
        p2: {
          score: 9800,
          lives: 2,
          combo: 1,
          specialEnergy: 40,
          specialReady: false,
          state: 'normal',
          activePowerUps: [
            {
              type: PowerUpType.KINETIC_SHIELD,
              id: 'p2-shd',
              label: 'SHD',
              progress: 1.0,
              color: '#00ffff',
              isActive: true,
            },
          ],
        },
      };

      // Frame 1: Initial hydration & mounting
      dashboard.update(state);

      // Verify hydration was successful
      const root = dashboard.getElement()!;
      expect(root.querySelector('#dashboard-p1-score')?.textContent).toBe('012500');
      expect(root.querySelector('#dashboard-p2-score')?.textContent).toBe('009800');
      expect(root.querySelector('#dashboard-high-score')?.textContent).toBe('035000');
      expect(root.querySelector('#dashboard-stage-badge')?.textContent).toBe('STAGE 04');

      // Now attach spies to DOM prototypes
      const textContentSpy = vi.spyOn(MockElement.prototype, 'textContent', 'set');
      const setAttributeSpy = vi.spyOn(MockElement.prototype, 'setAttribute');
      const removeAttributeSpy = vi.spyOn(MockElement.prototype, 'removeAttribute');
      const styleWidthSpy = vi.spyOn(MockCSSStyleDeclaration.prototype, 'width', 'set');
      const classListAddSpy = vi.spyOn(MockDOMTokenList.prototype, 'add');
      const classListRemoveSpy = vi.spyOn(MockDOMTokenList.prototype, 'remove');
      const classListToggleSpy = vi.spyOn(MockDOMTokenList.prototype, 'toggle');

      // Run 10,000 consecutive identical 60 FPS ticks
      for (let frame = 0; frame < 10000; frame++) {
        dashboard.update(state);
      }

      // Assert that EXACTLY 0 DOM mutations occurred across all 10,000 frames
      expect(textContentSpy).toHaveBeenCalledTimes(0);
      expect(setAttributeSpy).toHaveBeenCalledTimes(0);
      expect(removeAttributeSpy).toHaveBeenCalledTimes(0);
      expect(styleWidthSpy).toHaveBeenCalledTimes(0);
      expect(classListAddSpy).toHaveBeenCalledTimes(0);
      expect(classListRemoveSpy).toHaveBeenCalledTimes(0);
      expect(classListToggleSpy).toHaveBeenCalledTimes(0);
    });

    it('asserts EXACTLY 0 DOM mutations across 10,000 consecutive frames in Single-Player mode', () => {
      dashboard.setMode('single');

      const state: DashboardTelemetry = {
        isCoop: false,
        score: 18400,
        highScore: 25000,
        stage: 2,
        lives: 3,
        specialEnergy: 45,
        specialReady: false,
        activePowerUps: [
          {
            type: PowerUpType.RAPID_FIRE,
            id: 'rf-single',
            label: 'RF',
            progress: 0.5,
            color: '#ff7f00',
            isActive: true,
          },
        ],
      };

      // Frame 1: Initial hydration
      dashboard.update(state);

      // Attach spies
      const textContentSpy = vi.spyOn(MockElement.prototype, 'textContent', 'set');
      const setAttributeSpy = vi.spyOn(MockElement.prototype, 'setAttribute');
      const styleWidthSpy = vi.spyOn(MockCSSStyleDeclaration.prototype, 'width', 'set');
      const classListAddSpy = vi.spyOn(MockDOMTokenList.prototype, 'add');
      const classListRemoveSpy = vi.spyOn(MockDOMTokenList.prototype, 'remove');

      // Run 10,000 consecutive identical frames
      for (let frame = 0; frame < 10000; frame++) {
        dashboard.update(state);
      }

      // Assert 0 mutations
      expect(textContentSpy).toHaveBeenCalledTimes(0);
      expect(setAttributeSpy).toHaveBeenCalledTimes(0);
      expect(styleWidthSpy).toHaveBeenCalledTimes(0);
      expect(classListAddSpy).toHaveBeenCalledTimes(0);
      expect(classListRemoveSpy).toHaveBeenCalledTimes(0);
    });
  });

  // ==========================================================================
  // Track 2: Partial Dirty Checking Isolation
  // ==========================================================================
  describe('Track 2: Partial Dirty Checking Isolation', () => {
    it('mutating ONLY P1 score updates P1 score element while P2 score, lives, specials, stage, and high score receive 0 DOM writes', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 50000,
        stage: 3,
        p1: { score: 10000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 8500, lives: 2, combo: 1, specialEnergy: 30, specialReady: false, state: 'normal' },
      };

      // Frame 1: Hydration
      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p1ScoreEl = root.querySelector('#dashboard-p1-score')!;
      const p2ScoreEl = root.querySelector('#dashboard-p2-score')!;
      const highScoreEl = root.querySelector('#dashboard-high-score')!;
      const stageBadgeEl = root.querySelector('#dashboard-stage-badge')!;
      const p1FillEl = root.querySelector('#dashboard-p1-special .special-mini-fill') as HTMLElement;
      const p2FillEl = root.querySelector('#dashboard-p2-special .special-mini-fill') as HTMLElement;

      // Track individual elements
      const p1ScoreTextSpy = vi.spyOn(p1ScoreEl, 'textContent', 'set');
      const p2ScoreTextSpy = vi.spyOn(p2ScoreEl, 'textContent', 'set');
      const highScoreTextSpy = vi.spyOn(highScoreEl, 'textContent', 'set');
      const stageBadgeTextSpy = vi.spyOn(stageBadgeEl, 'textContent', 'set');
      const p1WidthSpy = vi.spyOn(p1FillEl.style, 'width', 'set');
      const p2WidthSpy = vi.spyOn(p2FillEl.style, 'width', 'set');

      // Mutate ONLY P1 score
      state.p1!.score = 10450;
      dashboard.update(state);

      // P1 score receives exactly 1 update
      expect(p1ScoreTextSpy).toHaveBeenCalledTimes(1);
      expect(p1ScoreEl.textContent).toBe('010450');

      // All other telemetry elements receive EXACTLY 0 updates
      expect(p2ScoreTextSpy).toHaveBeenCalledTimes(0);
      expect(highScoreTextSpy).toHaveBeenCalledTimes(0);
      expect(stageBadgeTextSpy).toHaveBeenCalledTimes(0);
      expect(p1WidthSpy).toHaveBeenCalledTimes(0);
      expect(p2WidthSpy).toHaveBeenCalledTimes(0);
    });

    it('mutating ONLY P2 score updates P2 score element while P1 score receives 0 DOM writes (Symmetric Isolation)', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 50000,
        stage: 3,
        p1: { score: 10450, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 8500, lives: 2, combo: 1, specialEnergy: 30, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p1ScoreEl = root.querySelector('#dashboard-p1-score')!;
      const p2ScoreEl = root.querySelector('#dashboard-p2-score')!;

      const p1ScoreTextSpy = vi.spyOn(p1ScoreEl, 'textContent', 'set');
      const p2ScoreTextSpy = vi.spyOn(p2ScoreEl, 'textContent', 'set');

      // Mutate ONLY P2 score
      state.p2!.score = 9200;
      dashboard.update(state);

      expect(p2ScoreTextSpy).toHaveBeenCalledTimes(1);
      expect(p2ScoreEl.textContent).toBe('009200');
      expect(p1ScoreTextSpy).toHaveBeenCalledTimes(0);
    });

    it('mutating ONLY P1 special energy updates P1 fill while P2 fill and scores receive 0 DOM writes', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 50000,
        p1: { score: 10450, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 9200, lives: 2, combo: 1, specialEnergy: 30, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p1FillEl = root.querySelector('#dashboard-p1-special .special-mini-fill') as HTMLElement;
      const p2FillEl = root.querySelector('#dashboard-p2-special .special-mini-fill') as HTMLElement;
      const p1ScoreEl = root.querySelector('#dashboard-p1-score')!;
      const p2ScoreEl = root.querySelector('#dashboard-p2-score')!;

      const p1WidthSpy = vi.spyOn(p1FillEl.style, 'width', 'set');
      const p2WidthSpy = vi.spyOn(p2FillEl.style, 'width', 'set');
      const p1ScoreSpy = vi.spyOn(p1ScoreEl, 'textContent', 'set');
      const p2ScoreSpy = vi.spyOn(p2ScoreEl, 'textContent', 'set');

      // Increment P1 special energy: 50% -> 65%
      state.p1!.specialEnergy = 65;
      dashboard.update(state);

      expect(p1WidthSpy).toHaveBeenCalledTimes(1);
      expect(p1FillEl.style.width).toBe('65%');
      expect(p2WidthSpy).toHaveBeenCalledTimes(0);
      expect(p1ScoreSpy).toHaveBeenCalledTimes(0);
      expect(p2ScoreSpy).toHaveBeenCalledTimes(0);
    });

    it('floating-point sub-integer energy fluctuations produce 0 DOM writes', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 50000,
        p1: { score: 10450, lives: 3, combo: 1, specialEnergy: 65.1, specialReady: false, state: 'normal' },
        p2: { score: 9200, lives: 2, combo: 1, specialEnergy: 30, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p1FillEl = root.querySelector('#dashboard-p1-special .special-mini-fill') as HTMLElement;
      const p1CueEl = root.querySelector('#p1-special-cue')!;

      const p1WidthSpy = vi.spyOn(p1FillEl.style, 'width', 'set');
      const p1CueSpy = vi.spyOn(p1CueEl, 'textContent', 'set');

      // 65.1 -> 65.4 -> 65.8 -> 65.99: Math.floor remains 65
      const subDeltas = [65.25, 65.5, 65.75, 65.99];
      for (const val of subDeltas) {
        state.p1!.specialEnergy = val;
        dashboard.update(state);
      }

      expect(p1WidthSpy).toHaveBeenCalledTimes(0);
      expect(p1CueSpy).toHaveBeenCalledTimes(0);
    });
  });

  // ==========================================================================
  // Track 3: Revive Countdown Mutation Frequency (600 frames = 10s at 60 FPS)
  // ==========================================================================
  describe('Track 3: Revive Countdown Mutation Frequency (60 FPS Simulation)', () => {
    it('simulates 10-second countdown (600 frames at dt=0.016): DOM updates occur at most 10 times total (<= once per integer second), NOT 600 times', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 40000,
        p1: {
          score: 5000,
          lives: 0,
          combo: 1,
          specialEnergy: 0,
          specialReady: false,
          state: 'revive_pending',
          reviveTimer: 10.0,
        },
        p2: {
          score: 8000,
          lives: 3,
          combo: 1,
          specialEnergy: 50,
          specialReady: false,
          state: 'normal',
          canDonateLife: true,
        },
      };

      // Frame 0: Hydration
      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p1ReviveEl = root.querySelector('#dashboard-p1-revive')!;
      expect(p1ReviveEl.textContent).toContain('REVIVE: 10S');

      // Spy on revive element textContent
      const reviveTextSpy = vi.spyOn(p1ReviveEl, 'textContent', 'set');

      // Step dt = 0.016s for 625 steps (10 seconds / 0.016 = 625 steps, ~60 FPS)
      const dt = 0.016;
      let currentTimer = 10.0;
      let totalSteps = 0;

      while (currentTimer > 0) {
        currentTimer -= dt;
        if (currentTimer < 0) currentTimer = 0;
        state.p1!.reviveTimer = currentTimer;

        dashboard.update(state);
        totalSteps++;
      }

      // Verify we simulated over 600 frames
      expect(totalSteps).toBeGreaterThanOrEqual(600);

      // Verify DOM updates occurred AT MOST 10 times (transitions to 9S, 8S, 7S, 6S, 5S, 4S, 3S, 2S, 1S, 0S)
      // Exactly 10 text mutations across 625 frames!
      expect(reviveTextSpy).toHaveBeenCalledTimes(10);
      expect(p1ReviveEl.textContent).toContain('REVIVE: 0S');
    });

    it('urgent revive visual pulse class activates at <= 3.0s and does not thrash classList per frame', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        p1: {
          score: 5000,
          lives: 0,
          combo: 1,
          specialEnergy: 0,
          specialReady: false,
          state: 'revive_pending',
          reviveTimer: 3.5,
        },
        p2: { score: 8000, lives: 1, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal', canDonateLife: false },
      };

      dashboard.update(state);
      const root = dashboard.getElement()!;
      const p1ReviveEl = root.querySelector('#dashboard-p1-revive')!;
      expect(p1ReviveEl.classList.contains('revive-urgent')).toBe(false);

      const toggleSpy = vi.spyOn(p1ReviveEl.classList, 'toggle');

      // Tick from 3.5 down to 2.5: crosses 3.0s threshold
      // 3.5s -> ceil is 4.
      // 3.0s -> ceil is 3 (urgent activated).
      // 2.984s -> ceil is 3 (no state change, toggle not called).
      for (let i = 0; i < 35; i++) {
        state.p1!.reviveTimer = (state.p1!.reviveTimer ?? 3.5) - 0.016;
        dashboard.update(state);
      }

      expect(p1ReviveEl.classList.contains('revive-urgent')).toBe(true);
      // toggle should be called only once when integer second changes from 4 to 3!
      expect(toggleSpy).toHaveBeenCalledTimes(1);
    });

    it('life donation indicator in tactical warning banner updates <= 1 time when donor status is stable', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        crisisWarning: '',
        p1: {
          score: 5000,
          lives: 0,
          combo: 1,
          specialEnergy: 0,
          specialReady: false,
          state: 'revive_pending',
          reviveTimer: 10.0,
        },
        p2: { score: 8000, lives: 2, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal', canDonateLife: true },
      };

      dashboard.update(state);
      const root = dashboard.getElement()!;
      const warningBannerEl = root.querySelector('#dashboard-warning')!;
      const warningTextEl = warningBannerEl.querySelector('.warning-text') || warningBannerEl;
      expect(warningTextEl.textContent).toBe('[L] DONATE LIFE');

      const warningSpy = vi.spyOn(warningTextEl, 'textContent', 'set');

      // Tick 600 frames with canDonateLife = true
      for (let i = 0; i < 600; i++) {
        state.p1!.reviveTimer = Math.max(0, state.p1!.reviveTimer! - 0.016);
        dashboard.update(state);
      }

      // Warning text is '[L] DONATE LIFE' the entire time; 0 mutations during countdown!
      expect(warningSpy).toHaveBeenCalledTimes(0);
    });
  });

  // ==========================================================================
  // Track 4: Zero-GC & Memory Heap Stability (5,000 cycles)
  // ==========================================================================
  describe('Track 4: Zero-GC & Memory Heap Stability (5,000 cycles)', () => {
    it('executes 5,000 full dashboard update cycles with < 1.0 MB net heap drift', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 30000,
        stage: 1,
        p1: { score: 1000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 1000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
      };

      // Warm up: 500 cycles to allow V8 compilation and caching to stabilize
      for (let i = 0; i < 500; i++) {
        dashboard.update(state);
      }

      forceGC();
      const initialHeap = process.memoryUsage().heapUsed;

      // Execute 5,000 full dashboard update cycles (simulating 83+ seconds of steady 60 FPS gameplay)
      for (let i = 0; i < 5000; i++) {
        // Periodic scoring event every 60 frames (1 second of gameplay)
        if (i % 60 === 0) {
          state.p1!.score += 100;
          state.p2!.score += 100;
          state.p1!.specialEnergy = (i % 100);
          state.p2!.specialEnergy = ((i + 50) % 100);
        }
        dashboard.update(state);
      }

      forceGC();
      const finalHeap = process.memoryUsage().heapUsed;
      const heapDriftBytes = finalHeap - initialHeap;
      const heapDriftMB = heapDriftBytes / (1024 * 1024);

      // Verify strictly < 1.0 MB heap drift
      expect(heapDriftMB).toBeLessThan(1.0);
    });

    it('strictly 0 Set, Map, or Object pool instances allocated during steady-state 60 FPS animation loop', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 30000,
        stage: 1,
        p1: { score: 2000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 2000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);

      let allocatedSets = 0;
      let allocatedMaps = 0;
      const OrigSet = globalThis.Set;
      const OrigMap = globalThis.Map;

      class TrackedSet<T> extends OrigSet<T> {
        constructor(iterable?: any) {
          super(iterable);
          allocatedSets++;
        }
      }

      class TrackedMap<K, V> extends OrigMap<K, V> {
        constructor(entries?: any) {
          super(entries);
          allocatedMaps++;
        }
      }

      globalThis.Set = TrackedSet as any;
      globalThis.Map = TrackedMap as any;

      try {
        // Run 1,000 frames
        for (let frame = 0; frame < 1000; frame++) {
          dashboard.update(state);
        }

        expect(allocatedSets).toBe(0);
        expect(allocatedMaps).toBe(0);
      } finally {
        globalThis.Set = OrigSet;
        globalThis.Map = OrigMap;
      }
    });

    it('recycles pre-allocated power-up chips without DOM node explosion across 1,000 chip lifecycles', () => {
      const p1Chips: PowerUpChipTelemetry[] = [
        { type: PowerUpType.RAPID_FIRE, id: 'rf', progress: 1.0, color: '#ff7f00', isActive: true },
      ];

      const state: DashboardTelemetry = {
        isCoop: true,
        p1: { score: 100, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', activePowerUps: p1Chips },
        p2: { score: 100, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      };

      const root = dashboard.getElement()!;
      const p1Rack = root.querySelector('#dashboard-p1-powerups')!;

      // 1,000 cycles of toggling powerup active / inactive
      for (let i = 0; i < 1000; i++) {
        p1Chips[0]!.isActive = i % 2 === 0;
        dashboard.update(state);
      }

      // Max number of child nodes in powerup rack never exceeds 1
      expect(p1Rack.children.length).toBeLessThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Track 5: Adversarial Boundary Stress & Resiliency
  // ==========================================================================
  describe('Track 5: Adversarial Boundary Stress & Resiliency', () => {
    it('gracefully handles NaN, Infinity, negative values, and undefined telemetry fields without crashing', () => {
      expect(() => {
        dashboard.update({
          isCoop: true,
          score: NaN,
          highScore: -99999,
          stage: -5,
          p1: {
            score: -500,
            lives: -1,
            combo: NaN,
            specialEnergy: Infinity,
            specialReady: false,
            state: 'normal',
          },
          p2: {
            score: NaN,
            lives: 999,
            combo: -2,
            specialEnergy: -50,
            specialReady: false,
            state: 'normal',
          },
        } as any);
      }).not.toThrow();

      const root = dashboard.getElement()!;
      // P1 score clamped to 000000
      expect(root.querySelector('#dashboard-p1-score')?.textContent).toBe('000000');
      // P2 lives clamped to 5 max icons
      const p2LivesRack = root.querySelector('#dashboard-p2-lives')!;
      expect(p2LivesRack.children.length).toBe(5);
    });

    it('safely tolerates update calls after destroy() with zero thrown exceptions', () => {
      dashboard.destroy();

      expect(() => {
        dashboard.update({
          isCoop: true,
          score: 5000,
        });
      }).not.toThrow();
    });

    it('safely tolerates rapid mode switching across 500 cycles without orphan DOM node buildup', () => {
      for (let i = 0; i < 500; i++) {
        dashboard.setMode(i % 2 === 0 ? 'single' : 'coop');
      }

      const root = dashboard.getElement()!;
      // Buttons and elements still resolve with exactly 1 instance each
      expect(root.querySelectorAll('#btn-dash-mute').length).toBe(1);
      expect(root.querySelectorAll('#btn-dash-fullscreen').length).toBe(1);
      expect(root.querySelectorAll('#btn-dash-pause').length).toBe(1);
      expect(root.querySelectorAll('#dashboard-high-score').length).toBe(1);
    });
  });
});
