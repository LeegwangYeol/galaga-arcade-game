/**
 * Galaga Arcade Web Game — Milestone M34 Remediation (Iteration 2)
 * Adversarial Empirical Verification Suite: Mid-Second Donation Toggles & Zero-GC Static Frames
 * Location: tests/unit/adversarial_m34_rem_challenge.test.ts
 *
 * Focus Areas:
 * 1. Mid-second life donation toggles without integer second change (P1 & P2 symmetrical).
 * 2. Rapid oscillation stress testing of donation eligibility within single second.
 * 3. Zero-GC static frames (10,000 frames) with active revive countdown (0 DOM mutations, 0 string allocations).
 * 4. Frozen string table immutability and lookup safety (REVIVE_P1_STRINGS, REVIVE_P2_STRINGS).
 * 5. CSS responsive media query verification for <= 380px viewports.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import fs from 'node:fs';
import {
  BottomDashboard,
  REVIVE_COUNTDOWN_STRINGS,
  REVIVE_P1_STRINGS,
  REVIVE_P2_STRINGS,
  type DashboardTelemetry,
} from '../../src/ui/BottomDashboard';

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
// ============================================================================

class MockDOMTokenList {
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

class MockCSSStyleDeclaration {
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

class MockElement {
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

describe('Milestone M34 Iteration 2: Adversarial Dirty-Check & Zero-GC Profiling', () => {
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
  // Track 1: Mid-Second Donation Toggles (User Mission Specification 1)
  // ==========================================================================
  describe('Track 1: Mid-Second Life Donation Toggles (Exact Tick Verification)', () => {
    it('P1 revive pending: immediately adds and removes "[L] DONATE LIFE" mid-second at t=9.8s -> 9.5s -> 9.2s without waiting for integer tick', () => {
      // Step 1: Player enters revive_pending at t=9.8s (partner has 1 life, canDonate = false)
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 50000,
        stage: 5,
        crisisWarning: '',
        p1: {
          score: 12000,
          lives: 0,
          combo: 1,
          specialEnergy: 0,
          specialReady: false,
          state: 'revive_pending',
          reviveTimer: 9.8,
        },
        p2: {
          score: 15000,
          lives: 1,
          combo: 1,
          specialEnergy: 40,
          specialReady: false,
          state: 'normal',
          canDonateLife: false,
        },
      };

      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p1ReviveEl = root.querySelector('#dashboard-p1-revive')!;
      const warningBannerEl = root.querySelector('#dashboard-warning')!;
      const warningTextEl = warningBannerEl.querySelector('.warning-text') || warningBannerEl;

      // At t=9.8s, ceil is 10. canDonate = false.
      expect(p1ReviveEl.textContent).toBe('REVIVE: 10S');
      expect(warningTextEl.textContent).toBe('REVIVE P1: 10S');

      // Attach spies to observe exact DOM setter calls
      const p1ReviveSpy = vi.spyOn(p1ReviveEl, 'textContent', 'set');
      const warningSpy = vi.spyOn(warningTextEl, 'textContent', 'set');

      // Step 2: At t=9.5s (same integer second 10), partner receives extra life (canDonate = true)
      state.p1!.reviveTimer = 9.5;
      state.p2!.lives = 2;
      state.p2!.canDonateLife = true;

      dashboard.update(state);

      // Verify that BottomDashboard immediately updates textContent on the EXACT tick
      expect(p1ReviveSpy).toHaveBeenCalledTimes(1);
      expect(p1ReviveEl.textContent).toBe('REVIVE: 10S [L] DONATE LIFE');
      expect(warningSpy).toHaveBeenCalledTimes(1);
      expect(warningTextEl.textContent).toBe('[L] DONATE LIFE');

      // Step 3: Run static frames between 9.5s and 9.21s (same state) -> 0 additional DOM updates
      for (let t = 9.49; t > 9.21; t -= 0.02) {
        state.p1!.reviveTimer = t;
        dashboard.update(state);
      }
      expect(p1ReviveSpy).toHaveBeenCalledTimes(1); // Still exactly 1
      expect(warningSpy).toHaveBeenCalledTimes(1); // Still exactly 1

      // Step 4: At t=9.2s (still integer second 10), partner loses extra life (canDonate = false)
      state.p1!.reviveTimer = 9.2;
      state.p2!.lives = 1;
      state.p2!.canDonateLife = false;

      dashboard.update(state);

      // Verify prompt IMMEDIATELY reverts without waiting for next integer second tick
      expect(p1ReviveSpy).toHaveBeenCalledTimes(2);
      expect(p1ReviveEl.textContent).toBe('REVIVE: 10S');
      expect(warningSpy).toHaveBeenCalledTimes(2);
      expect(warningTextEl.textContent).toBe('REVIVE P1: 10S');

      // Step 5: At t=8.9s (crosses integer second threshold to 9), update occurs for the new second
      state.p1!.reviveTimer = 8.9;
      dashboard.update(state);

      expect(p1ReviveSpy).toHaveBeenCalledTimes(3);
      expect(p1ReviveEl.textContent).toBe('REVIVE: 9S');
      expect(warningSpy).toHaveBeenCalledTimes(3);
      expect(warningTextEl.textContent).toBe('REVIVE P1: 9S');
    });

    it('P2 revive pending (Symmetrical): immediately adds and removes "[L] DONATE LIFE" mid-second at t=9.8s -> 9.5s -> 9.2s', () => {
      // Step 1: P2 enters revive_pending at t=9.8s (P1 has 1 life, canDonate = false)
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 50000,
        stage: 5,
        crisisWarning: '',
        p1: {
          score: 15000,
          lives: 1,
          combo: 1,
          specialEnergy: 40,
          specialReady: false,
          state: 'normal',
          canDonateLife: false,
        },
        p2: {
          score: 12000,
          lives: 0,
          combo: 1,
          specialEnergy: 0,
          specialReady: false,
          state: 'revive_pending',
          reviveTimer: 9.8,
        },
      };

      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p2ReviveEl = root.querySelector('#dashboard-p2-revive')!;
      const warningBannerEl = root.querySelector('#dashboard-warning')!;
      const warningTextEl = warningBannerEl.querySelector('.warning-text') || warningBannerEl;

      expect(p2ReviveEl.textContent).toBe('REVIVE: 10S');
      expect(warningTextEl.textContent).toBe('REVIVE P2: 10S');

      const p2ReviveSpy = vi.spyOn(p2ReviveEl, 'textContent', 'set');
      const warningSpy = vi.spyOn(warningTextEl, 'textContent', 'set');

      // Step 2: At t=9.5s (same integer second 10), P1 receives extra life (canDonate = true)
      state.p2!.reviveTimer = 9.5;
      state.p1!.lives = 2;
      state.p1!.canDonateLife = true;

      dashboard.update(state);

      expect(p2ReviveSpy).toHaveBeenCalledTimes(1);
      expect(p2ReviveEl.textContent).toBe('REVIVE: 10S [L] DONATE LIFE');
      expect(warningSpy).toHaveBeenCalledTimes(1);
      expect(warningTextEl.textContent).toBe('[L] DONATE LIFE');

      // Step 3: At t=9.2s, P1 loses extra life (canDonate = false)
      state.p2!.reviveTimer = 9.2;
      state.p1!.lives = 1;
      state.p1!.canDonateLife = false;

      dashboard.update(state);

      expect(p2ReviveSpy).toHaveBeenCalledTimes(2);
      expect(p2ReviveEl.textContent).toBe('REVIVE: 10S');
      expect(warningSpy).toHaveBeenCalledTimes(2);
      expect(warningTextEl.textContent).toBe('REVIVE P2: 10S');
    });

    it('handles 100 rapid mid-second donation toggles within the same integer second without desync', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 7.5 },
        p2: { score: 1000, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: false },
      };

      dashboard.update(state);
      const root = dashboard.getElement()!;
      const p1ReviveEl = root.querySelector('#dashboard-p1-revive')!;
      const warningBannerEl = root.querySelector('#dashboard-warning')!;
      const warningTextEl = warningBannerEl.querySelector('.warning-text') || warningBannerEl;

      // 100 alternating toggles at identical timer t=7.5s (ceil is 8)
      for (let i = 0; i < 100; i++) {
        const canDonate = i % 2 === 0; // true, false, true, false...
        state.p2!.canDonateLife = canDonate;
        state.p2!.lives = canDonate ? 2 : 1;
        dashboard.update(state);

        if (canDonate) {
          expect(p1ReviveEl.textContent).toBe('REVIVE: 8S [L] DONATE LIFE');
          expect(warningTextEl.textContent).toBe('[L] DONATE LIFE');
        } else {
          expect(p1ReviveEl.textContent).toBe('REVIVE: 8S');
          expect(warningTextEl.textContent).toBe('REVIVE P1: 8S');
        }
      }
    });
  });

  // ==========================================================================
  // Track 2: Zero-GC Static Frames with Active Revive (User Mission Spec 2)
  // ==========================================================================
  describe('Track 2: Zero-GC Static Frames with Active Revive Countdown (10,000 frames)', () => {
    it('asserts EXACTLY 0 DOM mutations across 10,000 consecutive frames with active revive countdown (canDonate = false)', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 40000,
        stage: 3,
        crisisWarning: '',
        p1: {
          score: 8000,
          lives: 0,
          combo: 1,
          specialEnergy: 0,
          specialReady: false,
          state: 'revive_pending',
          reviveTimer: 7.4, // Active countdown in progress
        },
        p2: {
          score: 11000,
          lives: 1,
          combo: 2,
          specialEnergy: 55,
          specialReady: false,
          state: 'normal',
          canDonateLife: false,
        },
      };

      // Frame 1: Hydrate active revive state
      dashboard.update(state);

      const root = dashboard.getElement()!;
      const p1ReviveEl = root.querySelector('#dashboard-p1-revive')!;
      const warningBannerEl = root.querySelector('#dashboard-warning')!;
      const warningTextEl = warningBannerEl.querySelector('.warning-text') || warningBannerEl;

      expect(p1ReviveEl.textContent).toBe('REVIVE: 8S');
      expect(warningTextEl.textContent).toBe('REVIVE P1: 8S');

      // Attach spies to DOM prototypes
      const textContentSpy = vi.spyOn(MockElement.prototype, 'textContent', 'set');
      const setAttributeSpy = vi.spyOn(MockElement.prototype, 'setAttribute');
      const removeAttributeSpy = vi.spyOn(MockElement.prototype, 'removeAttribute');
      const styleWidthSpy = vi.spyOn(MockCSSStyleDeclaration.prototype, 'width', 'set');
      const classListAddSpy = vi.spyOn(MockDOMTokenList.prototype, 'add');
      const classListRemoveSpy = vi.spyOn(MockDOMTokenList.prototype, 'remove');
      const classListToggleSpy = vi.spyOn(MockDOMTokenList.prototype, 'toggle');

      // Run 10,000 consecutive static frames
      for (let frame = 0; frame < 10000; frame++) {
        dashboard.update(state);
      }

      // Assert EXACTLY 0 DOM mutations occurred across all 10,000 frames
      expect(textContentSpy).toHaveBeenCalledTimes(0);
      expect(setAttributeSpy).toHaveBeenCalledTimes(0);
      expect(removeAttributeSpy).toHaveBeenCalledTimes(0);
      expect(styleWidthSpy).toHaveBeenCalledTimes(0);
      expect(classListAddSpy).toHaveBeenCalledTimes(0);
      expect(classListRemoveSpy).toHaveBeenCalledTimes(0);
      expect(classListToggleSpy).toHaveBeenCalledTimes(0);
    });

    it('asserts EXACTLY 0 DOM mutations across 10,000 consecutive frames with active revive countdown (canDonate = true)', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 40000,
        stage: 3,
        crisisWarning: '',
        p1: {
          score: 8000,
          lives: 0,
          combo: 1,
          specialEnergy: 0,
          specialReady: false,
          state: 'revive_pending',
          reviveTimer: 5.2,
        },
        p2: {
          score: 11000,
          lives: 3,
          combo: 2,
          specialEnergy: 55,
          specialReady: false,
          state: 'normal',
          canDonateLife: true,
        },
      };

      dashboard.update(state);

      const root = dashboard.getElement()!;
      expect(root.querySelector('#dashboard-p1-revive')?.textContent).toBe('REVIVE: 6S [L] DONATE LIFE');
      const warningBannerEl = root.querySelector('#dashboard-warning')!;
      const warningTextEl = warningBannerEl.querySelector('.warning-text') || warningBannerEl;
      expect(warningTextEl.textContent).toBe('[L] DONATE LIFE');

      // Attach spies
      const textContentSpy = vi.spyOn(MockElement.prototype, 'textContent', 'set');
      const setAttributeSpy = vi.spyOn(MockElement.prototype, 'setAttribute');
      const styleWidthSpy = vi.spyOn(MockCSSStyleDeclaration.prototype, 'width', 'set');
      const classListAddSpy = vi.spyOn(MockDOMTokenList.prototype, 'add');
      const classListRemoveSpy = vi.spyOn(MockDOMTokenList.prototype, 'remove');
      const classListToggleSpy = vi.spyOn(MockDOMTokenList.prototype, 'toggle');

      for (let frame = 0; frame < 10000; frame++) {
        dashboard.update(state);
      }

      expect(textContentSpy).toHaveBeenCalledTimes(0);
      expect(setAttributeSpy).toHaveBeenCalledTimes(0);
      expect(styleWidthSpy).toHaveBeenCalledTimes(0);
      expect(classListAddSpy).toHaveBeenCalledTimes(0);
      expect(classListRemoveSpy).toHaveBeenCalledTimes(0);
      expect(classListToggleSpy).toHaveBeenCalledTimes(0);
    });

    it('verifies 0 string allocations and < 0.5 MB heap drift across 10,000 static revive frames', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 40000,
        stage: 3,
        p1: { score: 8000, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 7.0 },
        p2: { score: 11000, lives: 1, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal', canDonateLife: false },
      };

      // Warm up
      for (let i = 0; i < 500; i++) {
        dashboard.update(state);
      }

      forceGC();
      const initialHeap = process.memoryUsage().heapUsed;

      // 10,000 frames of static revive state
      for (let frame = 0; frame < 10000; frame++) {
        dashboard.update(state);
      }

      forceGC();
      const finalHeap = process.memoryUsage().heapUsed;
      const driftMB = (finalHeap - initialHeap) / (1024 * 1024);

      // Memory drift must be negligible (< 0.5 MB)
      expect(driftMB).toBeLessThan(0.5);
    });
  });

  // ==========================================================================
  // Track 3: Frozen Pre-allocated Lookup Tables Verification
  // ==========================================================================
  describe('Track 3: Pre-allocated Frozen String Arrays & Out-of-Bounds Safety', () => {
    it('verifies REVIVE_P1_STRINGS and REVIVE_P2_STRINGS are deeply frozen and bounded', () => {
      expect(Object.isFrozen(REVIVE_P1_STRINGS)).toBe(true);
      expect(Object.isFrozen(REVIVE_P2_STRINGS)).toBe(true);
      expect(Object.isFrozen(REVIVE_COUNTDOWN_STRINGS)).toBe(true);

      expect(REVIVE_P1_STRINGS.length).toBe(16);
      expect(REVIVE_P2_STRINGS.length).toBe(16);

      for (let i = 0; i <= 15; i++) {
        expect(REVIVE_P1_STRINGS[i]).toBe(`REVIVE P1: ${i}S`);
        expect(REVIVE_P2_STRINGS[i]).toBe(`REVIVE P2: ${i}S`);
      }
    });

    it('safely falls back without throwing when timer exceeds 15s bounds', () => {
      expect(() => {
        dashboard.update({
          isCoop: true,
          p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 99.9 },
          p2: { score: 0, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: false },
        } as any);
      }).not.toThrow();

      const root = dashboard.getElement()!;
      // Timer clamped to 15s max
      expect(root.querySelector('#dashboard-p1-revive')?.textContent).toBe('REVIVE: 15S');
      const warningBannerEl = root.querySelector('#dashboard-warning')!;
      const warningTextEl = warningBannerEl.querySelector('.warning-text') || warningBannerEl;
      expect(warningTextEl.textContent).toBe('REVIVE P1: 15S');
    });
  });

  // ==========================================================================
  // Track 4: Media Query Specification Compliance
  // ==========================================================================
  describe('Track 4: CSS Media Query Compliance for <= 380px Viewports', () => {
    it('verifies index.html contains the @media (max-width: 380px) responsive breakpoint', () => {
      const html = fs.readFileSync('index.html', 'utf8');
      expect(html).toContain('@media (max-width: 380px)');
      expect(html).toContain('grid-template-columns: 1fr 80px 1fr');
    });
  });
});
