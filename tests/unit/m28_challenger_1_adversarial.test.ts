/**
 * Galaga Arcade Web Game — Milestone M28 Adversarial Test Suite
 * Challenger: m28_challenger_1 (Telemetry Stress & Zero-GC Verifier)
 *
 * Adversarially stress-tests:
 * 1. Track 1 (Zero-GC Dirty Checking): Dispatch 10,000 simulated 60 FPS frames with identical telemetry.
 *    Assert textContent setters, style mutations, and DOM writes remain strictly ZERO after frame 1.
 * 2. Track 2 (High-Frequency State Whiplash): Alternating scores, lives whiplash (5 -> 0 -> 5), and
 *    fluctuating special energy (0% -> 99% -> 100% -> 0%) across thousands of rapid ticks. Assert no UI desync.
 * 3. Track 3 (Power-Up Churn Saturation): Simultaneously activate and cycle all 9 power-up items with
 *    varying remaining durations (0.1s to 20s). Assert chips render accurate percentage widths, color codes,
 *    and unmount immediately when duration expires.
 * 4. Track 4 (Memory & Teardown Leak): Mount and destroy 50 BottomDashboard instances consecutively.
 *    Assert all event listeners are removed and no detached elements or references remain.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BottomDashboard,
  type DashboardTelemetry,
  type PowerUpChipTelemetry,
} from '../../src/ui/BottomDashboard';

// ============================================================================
// Adversarial DOM Mock & Mutation Tracker Infrastructure
// ============================================================================

interface DomMutationCounters {
  textContentSetters: number;
  styleMutations: number;
  classListMutations: number;
  attributeWrites: number;
  treeMutations: number;
}

const globalCounters: DomMutationCounters = {
  textContentSetters: 0,
  styleMutations: 0,
  classListMutations: 0,
  attributeWrites: 0,
  treeMutations: 0,
};

function resetDomCounters() {
  globalCounters.textContentSetters = 0;
  globalCounters.styleMutations = 0;
  globalCounters.classListMutations = 0;
  globalCounters.attributeWrites = 0;
  globalCounters.treeMutations = 0;
}

function getTotalDomMutations(): number {
  return (
    globalCounters.textContentSetters +
    globalCounters.styleMutations +
    globalCounters.classListMutations +
    globalCounters.attributeWrites +
    globalCounters.treeMutations
  );
}

class AdvMockClassList {
  private classes: Set<string> = new Set();

  add(c: string) {
    if (c) {
      if (!this.classes.has(c)) {
        globalCounters.classListMutations++;
      }
      this.classes.add(c);
    }
  }

  remove(c: string) {
    if (this.classes.has(c)) {
      globalCounters.classListMutations++;
    }
    this.classes.delete(c);
  }

  contains(c: string): boolean {
    return this.classes.has(c);
  }

  toggle(c: string, force?: boolean): boolean {
    globalCounters.classListMutations++;
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

function createTrackedStyle(): Record<string, string> {
  const store: Record<string, string> = {};
  return new Proxy(store, {
    set(target, prop, value) {
      const strVal = String(value);
      if (target[prop as string] !== strVal) {
        globalCounters.styleMutations++;
      }
      target[prop as string] = strVal;
      return true;
    },
    get(target, prop) {
      return target[prop as string] || '';
    },
  });
}

class AdvMockElement {
  public tagName: string;
  public id: string = '';
  private _className: string = '';
  public classList = new AdvMockClassList();
  public children: AdvMockElement[] = [];
  public parentElement: AdvMockElement | null = null;
  public attributes: Record<string, string> = {};
  public style: Record<string, string> = createTrackedStyle();
  public title: string = '';
  private _textContent: string = '';
  private listeners: Record<string, Set<(e: any) => void>> = {};
  private _innerHTML: string = '';

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    globalCounters.treeMutations++;
    this._innerHTML = val;
    this.children = [];
  }

  get className(): string {
    return this._className;
  }

  set className(val: string) {
    this._className = val || '';
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
    globalCounters.textContentSetters++;
    this._textContent = String(val);
  }

  setAttribute(name: string, value: string) {
    globalCounters.attributeWrites++;
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
    globalCounters.attributeWrites++;
    delete this.attributes[name];
  }

  appendChild(child: AdvMockElement): AdvMockElement {
    if (!child) return child;
    globalCounters.treeMutations++;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: AdvMockElement): AdvMockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      globalCounters.treeMutations++;
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector: string): AdvMockElement | null {
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

  querySelectorAll(selector: string): AdvMockElement[] {
    const results: AdvMockElement[] = [];
    const search = (node: AdvMockElement) => {
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
    this.listeners[type].add(listener);
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

  getTotalListenerCount(): number {
    let sum = 0;
    for (const key of Object.keys(this.listeners)) {
      sum += this.listeners[key]?.size ?? 0;
    }
    return sum;
  }
}

class AdvMockDocument {
  public body: AdvMockElement = new AdvMockElement('BODY');
  public documentElement: AdvMockElement = new AdvMockElement('HTML');
  private elementsById: Map<string, AdvMockElement> = new Map();

  createElement(tagName: string): AdvMockElement {
    return new AdvMockElement(tagName);
  }

  createElementNS(_ns: string, tagName: string): AdvMockElement {
    return new AdvMockElement(tagName);
  }

  getElementById(id: string): AdvMockElement | null {
    if (this.elementsById.has(id)) return this.elementsById.get(id)!;
    return this.body.querySelector(`#${id}`);
  }

  querySelector(selector: string): AdvMockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.elementsById.has(id)) return this.elementsById.get(id)!;
    }
    return this.body.querySelector(selector);
  }

  registerElement(id: string, el: AdvMockElement) {
    el.id = id;
    this.elementsById.set(id, el);
    this.body.appendChild(el);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Milestone M28: Adversarial Challenger Test Suite (m28_challenger_1)', () => {
  let mockDoc: AdvMockDocument;
  let mockContainer: AdvMockElement;
  let dashboard: BottomDashboard;

  beforeEach(() => {
    resetDomCounters();
    mockDoc = new AdvMockDocument();
    mockContainer = new AdvMockElement('DIV', 'app-container');
    mockDoc.registerElement('app-container', mockContainer);

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768 });

    dashboard = new BottomDashboard({ container: mockContainer as any });
  });

  afterEach(() => {
    dashboard?.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Track 1: Zero-GC Dirty Checking Under 10,000 Consecutive Frames
  // ==========================================================================
  describe('Track 1: Zero-GC Dirty Checking Under 10,000 Consecutive Frames', () => {
    it('dispatches 10,000 simulated 60 FPS frames with identical baseline telemetry: zero DOM writes after frame 1', () => {
      const baselineTelemetry: DashboardTelemetry = {
        score: 42150,
        highScore: 80000,
        isNewHighScore: false,
        lives: 3,
        specialEnergy: 65,
        isSpecialReady: false,
        selectedSpecial: 'NOVA_BARRAGE',
        isMuted: false,
        isFullscreen: false,
        isPaused: false,
      };

      // Frame 1: Initial hydration
      dashboard.update(baselineTelemetry);

      // Verify DOM is properly initialized
      const scoreEl = mockContainer.querySelector('#dashboard-score');
      const highEl = mockContainer.querySelector('#dashboard-high-score');
      const livesContainer = mockContainer.querySelector('#dashboard-lives');
      const specialFill = mockContainer.querySelector('.special-charge-bar');

      expect(scoreEl?.textContent).toBe('042150');
      expect(highEl?.textContent).toBe('080000');
      expect(livesContainer?.children.length).toBe(3);
      expect(specialFill?.style.width).toBe('65%');

      // Reset DOM counters after frame 1
      resetDomCounters();

      // Dispatch 10,000 consecutive identical frames (approx 166 seconds of simulated 60 FPS gameplay)
      for (let frame = 2; frame <= 10001; frame++) {
        dashboard.update(baselineTelemetry);
      }

      // Assert that textContent setters, style mutations, classList mutations,
      // attribute writes, and DOM tree modifications remain STRICTLY ZERO!
      expect(globalCounters.textContentSetters).toBe(0);
      expect(globalCounters.styleMutations).toBe(0);
      expect(globalCounters.classListMutations).toBe(0);
      expect(globalCounters.attributeWrites).toBe(0);
      expect(globalCounters.treeMutations).toBe(0);
      expect(getTotalDomMutations()).toBe(0);
    });

    it('dispatches 10,000 simulated frames with active power-up chips: zero DOM writes after frame 1', () => {
      const powerUpTelemetry: DashboardTelemetry = {
        score: 15000,
        highScore: 50000,
        lives: 2,
        specialEnergy: 40,
        isSpecialReady: false,
        selectedSpecial: 'CHRONO_FREEZE',
        activePowerUps: [
          {
            id: 'rf_1',
            type: 'RAPID_FIRE',
            name: 'OVERCLOCK',
            remainingDuration: 10.5,
            totalDuration: 15.0,
            primaryColor: '#FF7F00',
            isActive: true,
          },
          {
            id: 'shd_1',
            type: 'KINETIC_SHIELD',
            name: 'SHIELD',
            remainingDuration: 1.0,
            totalDuration: 1.0,
            primaryColor: '#00FFFF',
            isActive: true,
          },
          {
            id: 'spd_1',
            type: 'ENGINE_BOOSTER',
            name: 'BOOSTER',
            remainingDuration: 7.5,
            totalDuration: 15.0,
            primaryColor: '#5B93FF',
            isActive: true,
          },
        ],
      };

      // Frame 1: Mount chips and render initial state
      dashboard.update(powerUpTelemetry);

      const rack = mockContainer.querySelector('#dashboard-powerups');
      expect(rack?.children.length).toBe(3);

      const chipRf = rack?.querySelector('#chip-rf_1');
      const chipShd = rack?.querySelector('#chip-shd_1');
      const chipSpd = rack?.querySelector('#chip-spd_1');

      expect(chipRf).not.toBeNull();
      expect(chipShd).not.toBeNull();
      expect(chipSpd).not.toBeNull();

      // Reset DOM counters after frame 1
      resetDomCounters();

      // Dispatch 10,000 frames with unchanging active power-up telemetry
      for (let frame = 2; frame <= 10001; frame++) {
        dashboard.update(powerUpTelemetry);
      }

      // Assert strictly 0 DOM mutations over all 10,000 frames
      expect(globalCounters.textContentSetters).toBe(0);
      expect(globalCounters.styleMutations).toBe(0);
      expect(globalCounters.classListMutations).toBe(0);
      expect(globalCounters.attributeWrites).toBe(0);
      expect(globalCounters.treeMutations).toBe(0);
      expect(getTotalDomMutations()).toBe(0);
    });

    it('asserts frame-by-frame dirty check precision: exactly 1 DOM write per updated property', () => {
      const state: DashboardTelemetry = {
        score: 100,
        highScore: 1000,
        lives: 3,
        specialEnergy: 50,
      };

      dashboard.update(state);
      resetDomCounters();

      // Update ONLY score: exactly 1 textContent setter
      state.score = 200;
      dashboard.update(state);
      expect(globalCounters.textContentSetters).toBe(1);
      expect(globalCounters.styleMutations).toBe(0);
      expect(globalCounters.treeMutations).toBe(0);

      // Update ONLY energy: exactly 1 style mutation & 1 attribute write & 1 textContent setter (cue text)
      resetDomCounters();
      state.specialEnergy = 75;
      dashboard.update(state);
      expect(globalCounters.textContentSetters).toBe(1);
      expect(globalCounters.styleMutations).toBe(1); // width updated
      expect(globalCounters.attributeWrites).toBe(1); // aria-valuenow

      // Update ONLY lives from 3 to 2: exactly 1 tree mutation (removeChild)
      resetDomCounters();
      state.lives = 2;
      dashboard.update(state);
      expect(globalCounters.treeMutations).toBe(1);
      expect(globalCounters.textContentSetters).toBe(0);
      expect(globalCounters.styleMutations).toBe(0);
    });
  });

  // ==========================================================================
  // Track 2: High-Frequency State Whiplash & Fuzzing
  // ==========================================================================
  describe('Track 2: High-Frequency State Whiplash & Fuzzing', () => {
    it('alternates scores between 0 and 999,990 across 3,000 rapid ticks with zero desync or NaN', () => {
      const scoreEl = mockContainer.querySelector('#dashboard-score')!;
      expect(scoreEl).not.toBeNull();

      for (let i = 0; i < 3000; i++) {
        const isHigh = i % 2 === 0;
        const targetScore = isHigh ? 999990 : 0;

        dashboard.update({
          score: targetScore,
          highScore: 1000000,
          lives: 3,
        });

        const expectedText = isHigh ? '999990' : '000000';
        expect(scoreEl.textContent).toBe(expectedText);
      }
    });

    it('stress-tests lives whiplash (5 -> 0 -> 5 -> 1 -> 4 -> 0) across 2,400 ticks asserting exact child count and icon preservation', () => {
      const livesContainer = mockContainer.querySelector('#dashboard-lives')!;
      expect(livesContainer).not.toBeNull();

      const sequence = [5, 0, 5, 1, 4, 0, 2, 3];

      for (let i = 0; i < 2400; i++) {
        const targetLives = sequence[i % sequence.length] ?? 0;
        dashboard.update({
          score: 100,
          highScore: 1000,
          lives: targetLives,
        });

        expect(livesContainer.children.length).toBe(targetLives);

        // Every child must be a valid SVG ship icon
        for (const child of livesContainer.children) {
          expect(child.classList.contains('ship-life-icon')).toBe(true);
        }
      }
    });

    it('fluctuates special energy (0% -> 99% -> 100% -> 0%) asserting atomic ready-class and cue synchronization', () => {
      const specialContainer = mockContainer.querySelector('.dash-special-rack')!;
      const specialFill = mockContainer.querySelector('.special-charge-bar')!;
      const specialCue = mockContainer.querySelector('.special-cue')!;

      const sequence = [0, 99, 100, 0, 50, 100, 10, 100];

      for (let i = 0; i < 2400; i++) {
        const energy = sequence[i % sequence.length] ?? 0;
        dashboard.update({
          score: 100,
          highScore: 1000,
          lives: 3,
          specialEnergy: energy,
        });

        const isReady = energy >= 100;
        expect(specialContainer.classList.contains('special-ready')).toBe(isReady);
        expect(specialFill.classList.contains('special-ready-bar')).toBe(isReady);

        if (isReady) {
          expect(specialCue.textContent).toBe('READY [X]');
          expect(specialCue.classList.contains('special-ready-cue')).toBe(true);
        } else {
          expect(specialCue.textContent).toBe(`${energy}%`);
          expect(specialCue.classList.contains('text-white')).toBe(true);
        }
        expect(specialFill.style.width).toBe(`${energy}%`);
      }
    });

    it('fuzzes tactical action buttons with rapid alternating states', () => {
      const btnMute = mockContainer.querySelector('#btn-dash-mute')!;
      const btnFull = mockContainer.querySelector('#btn-dash-fullscreen')!;
      const btnPause = mockContainer.querySelector('#btn-dash-pause')!;

      for (let i = 0; i < 1500; i++) {
        const isMuted = i % 2 === 0;
        const isFull = i % 3 === 0;
        const isPaused = i % 5 === 0;

        dashboard.update({
          score: 100,
          highScore: 1000,
          lives: 3,
          isMuted,
          isFullscreen: isFull,
          isPaused,
        });

        expect(btnMute.textContent).toBe(isMuted ? '🔇' : '🔊');
        expect(btnMute.getAttribute('aria-label')).toBe(isMuted ? 'Unmute Audio' : 'Mute Audio');

        expect(btnFull.textContent).toBe(isFull ? '🗗' : '⛶');
        expect(btnFull.getAttribute('aria-label')).toBe(isFull ? 'Exit Fullscreen' : 'Toggle Fullscreen');

        expect(btnPause.textContent).toBe(isPaused ? '▶' : '⏸');
        expect(btnPause.getAttribute('aria-label')).toBe(isPaused ? 'Resume Game' : 'Pause Game');
      }
    });

    it('handles extreme adversarial inputs: NaN, negative values, Infinity, and undefined without throwing or corrupting DOM', () => {
      const adversarialStates: Partial<DashboardTelemetry>[] = [
        { score: NaN, highScore: NaN, lives: NaN, specialEnergy: NaN },
        { score: -99999, highScore: -1, lives: -5, specialEnergy: -50 },
        { score: Infinity, highScore: Infinity, lives: 9999, specialEnergy: Infinity },
        { score: 10000000, highScore: 99999999, lives: 10, specialEnergy: 150 },
        {},
      ];

      for (const st of adversarialStates) {
        expect(() => dashboard.update(st as DashboardTelemetry)).not.toThrow();
      }

      // Assert clamped sanity
      const scoreEl = mockContainer.querySelector('#dashboard-score')!;
      const livesContainer = mockContainer.querySelector('#dashboard-lives')!;
      const specialFill = mockContainer.querySelector('.special-charge-bar')!;

      // Lives must never exceed 5 or drop below 0
      expect(livesContainer.children.length).toBeLessThanOrEqual(5);
      expect(livesContainer.children.length).toBeGreaterThanOrEqual(0);

      // Special fill width must never exceed 100% or drop below 0%
      const fillPct = parseInt(specialFill.style.width || '0', 10);
      expect(fillPct).toBeLessThanOrEqual(100);
      expect(fillPct).toBeGreaterThanOrEqual(0);

      expect(scoreEl.textContent).not.toBe('NaN');
    });
  });

  // ==========================================================================
  // Track 3: Power-Up Churn Saturation & Lifecycle Precision
  // ==========================================================================
  describe('Track 3: Power-Up Churn Saturation & Lifecycle Precision', () => {
    const ALL_9_TYPES = [
      { type: 'RAPID_FIRE', code: 'RF', color: '#FF7F00', duration: 15.0 },
      { type: 'KINETIC_SHIELD', code: 'SHD', color: '#00FFFF', duration: 1.0 },
      { type: 'SCATTER_SHOT', code: 'SCT', color: '#00E700', duration: 15.0 },
      { type: 'ENGINE_BOOSTER', code: 'SPD', color: '#5B93FF', duration: 15.0 },
      { type: 'CHRONO_FIELD', code: 'CF', color: '#00FFFF', duration: 6.0 },
      { type: 'REFLECTION_SHIELD', code: 'RFL', color: '#5B93FF', duration: 12.0 },
      { type: 'EMP_COLLECTOR', code: 'EMP', color: '#BB33FF', duration: 5.0 },
      { type: 'PHASE_DRIVE', code: 'PHS', color: '#FF007F', duration: 15.0 },
      { type: 'ANTIMATTER_PLASMA', code: 'PLS', color: '#FFFF00', duration: 7.0 },
    ];

    it('simultaneously activates and renders all 9 power-up items with exact codes, colors, and 100% initial progress', () => {
      const activeItems: PowerUpChipTelemetry[] = ALL_9_TYPES.map((meta) => ({
        id: meta.type.toLowerCase(),
        type: meta.type,
        remainingDuration: meta.duration,
        totalDuration: meta.duration,
        primaryColor: meta.color,
        isActive: true,
      }));

      dashboard.update({
        score: 1000,
        highScore: 5000,
        lives: 3,
        activePowerUps: activeItems,
      });

      const rack = mockContainer.querySelector('#dashboard-powerups')!;
      expect(rack).not.toBeNull();
      expect(rack.children.length).toBe(9);

      for (const meta of ALL_9_TYPES) {
        const chip = rack.querySelector(`#chip-${meta.type.toLowerCase()}`);
        expect(chip).not.toBeNull();

        const codeEl = chip?.querySelector('.chip-code');
        expect(codeEl?.textContent).toBe(meta.code);

        const barEl = chip?.querySelector('.powerup-progress-bar');
        expect(barEl?.style.width).toBe('100%');
        expect(barEl?.style.backgroundColor).toBe(meta.color);
        expect(chip?.style.borderColor).toBe(meta.color);
      }
    });

    it('staggered countdown: chips accurately reflect duration progress and unmount IMMEDIATELY when duration expires', () => {
      // Configure 9 items with staggered durations from 1s to 9s
      const items: PowerUpChipTelemetry[] = ALL_9_TYPES.map((meta, idx) => ({
        id: meta.type.toLowerCase(),
        type: meta.type,
        remainingDuration: (idx + 1) * 1.0, // 1s, 2s, 3s, ..., 9s
        totalDuration: (idx + 1) * 1.0,
        primaryColor: meta.color,
        isActive: true,
      }));

      const rack = mockContainer.querySelector('#dashboard-powerups')!;

      // Initial update: 9 active chips
      dashboard.update({ score: 0, highScore: 1000, lives: 3, activePowerUps: items });
      expect(rack.children.length).toBe(9);

      // Simulate time elapsing in 0.5s intervals
      // At t = 1.0s, item 0 (1s) expires. Remaining items = 8.
      // At t = 2.0s, item 1 (2s) expires. Remaining items = 7, etc.
      for (let step = 1; step <= 18; step++) {
        const elapsed = step * 0.5;

        for (const itm of items) {
          itm.remainingDuration = Math.max(0, itm.totalDuration! - elapsed);
          itm.isActive = itm.remainingDuration > 0;
        }

        dashboard.update({ score: 0, highScore: 1000, lives: 3, activePowerUps: items });

        const expectedActiveCount = items.filter((itm) => (itm.remainingDuration ?? 0) > 0).length;
        expect(rack.children.length).toBe(expectedActiveCount);

        // Verify remaining active chips have accurate progress widths
        for (const itm of items) {
          const chip = rack.querySelector(`#chip-${itm.id}`);
          if ((itm.remainingDuration ?? 0) > 0) {
            expect(chip).not.toBeNull();
            const expectedPct = Math.round((itm.remainingDuration! / itm.totalDuration!) * 100);
            const bar = chip?.querySelector('.powerup-progress-bar');
            expect(bar?.style.width).toBe(`${expectedPct}%`);
          } else {
            // Must be unmounted!
            expect(chip).toBeNull();
          }
        }
      }

      // At end (t = 9.0s), all 9 must be unmounted
      expect(rack.children.length).toBe(0);
    });

    it('rapid churn: random activation, expiration, and re-activation over 1,000 frames asserting zero orphaned chips', () => {
      const rack = mockContainer.querySelector('#dashboard-powerups')!;

      // Deterministic PRNG seed for reproducible fuzzing
      let seed = 12345;
      const nextRand = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      for (let frame = 0; frame < 1000; frame++) {
        // Randomly activate 0 to 9 items
        const currentActive: PowerUpChipTelemetry[] = [];
        for (const meta of ALL_9_TYPES) {
          if (nextRand() > 0.5) {
            const rem = nextRand() * 10 + 0.1;
            currentActive.push({
              id: meta.type.toLowerCase(),
              type: meta.type,
              remainingDuration: rem,
              totalDuration: 10.0,
              isActive: true,
            });
          }
        }

        dashboard.update({
          score: frame * 10,
          highScore: 50000,
          lives: 3,
          activePowerUps: currentActive,
        });

        // Assert exactly matching mounted chips count
        expect(rack.children.length).toBe(currentActive.length);

        // Assert all mounted chip ids match currentActive
        for (const itm of currentActive) {
          const chip = rack.querySelector(`#chip-${itm.id}`);
          expect(chip).not.toBeNull();
        }
      }
    });

    it('handles custom power-up items outside DEFAULT_CHIP_META gracefully', () => {
      const customItems: PowerUpChipTelemetry[] = [
        {
          id: 'custom_laser_99',
          type: 'QUANTUM_RAY',
          name: 'QUANTUM RAY',
          remainingDuration: 8.0,
          totalDuration: 10.0,
          primaryColor: '#E00613',
          isActive: true,
        },
      ];

      dashboard.update({
        score: 500,
        highScore: 1000,
        lives: 3,
        activePowerUps: customItems,
      });

      const rack = mockContainer.querySelector('#dashboard-powerups')!;
      expect(rack.children.length).toBe(1);

      const customChip = rack.querySelector('#chip-custom_laser_99');
      expect(customChip).not.toBeNull();

      const codeEl = customChip?.querySelector('.chip-code');
      // Should derive 3-letter code from type: 'QUA'
      expect(codeEl?.textContent).toBe('QUA');
      expect(customChip?.style.borderColor).toBe('#E00613');
    });
  });

  // ==========================================================================
  // Track 4: Memory & Teardown Leak (50 Consecutive Mount/Destroy Cycles)
  // ==========================================================================
  describe('Track 4: Memory & Teardown Leak (50 Consecutive Mount/Destroy Cycles)', () => {
    it('mounts, operates, and destroys 50 BottomDashboard instances consecutively: zero listener leaks and zero detached elements', () => {
      // Destroy the default dashboard from beforeEach
      dashboard.destroy();
      expect(mockContainer.children.length).toBe(0);

      for (let i = 0; i < 50; i++) {
        let muteToggled = false;
        let fullToggled = false;
        let pauseToggled = false;

        const inst = new BottomDashboard({
          container: mockContainer as any,
          onToggleMute: () => {
            muteToggled = true;
          },
          onToggleFullscreen: () => {
            fullToggled = true;
          },
          onTogglePause: () => {
            pauseToggled = true;
          },
        });

        expect(mockContainer.children.length).toBe(1);
        const root = inst.getElement();
        expect(root).not.toBeNull();

        // Exercise the instance
        inst.update({
          score: 1000 * (i + 1),
          highScore: 50000,
          lives: (i % 5) + 1,
          specialEnergy: i * 2,
          activePowerUps: [
            {
              id: 'test_rf',
              type: 'RAPID_FIRE',
              remainingDuration: 10,
              totalDuration: 15,
              isActive: true,
            },
          ],
        });

        // Test action buttons dispatch
        const btnMute = root?.querySelector('#btn-dash-mute') as unknown as AdvMockElement;
        const btnFull = root?.querySelector('#btn-dash-fullscreen') as unknown as AdvMockElement;
        const btnPause = root?.querySelector('#btn-dash-pause') as unknown as AdvMockElement;

        expect(btnMute.getListenerCount('click')).toBe(1);
        expect(btnFull.getListenerCount('click')).toBe(1);
        expect(btnPause.getListenerCount('click')).toBe(1);

        btnMute.dispatchEvent({ type: 'click' });
        btnFull.dispatchEvent({ type: 'click' });
        btnPause.dispatchEvent({ type: 'click' });

        expect(muteToggled).toBe(true);
        expect(fullToggled).toBe(true);
        expect(pauseToggled).toBe(true);

        // Destroy instance
        inst.destroy();

        // Assert all event listeners were cleanly detached
        expect(btnMute.getListenerCount('click')).toBe(0);
        expect(btnFull.getListenerCount('click')).toBe(0);
        expect(btnPause.getListenerCount('click')).toBe(0);

        // Assert element is unmounted from container
        expect(mockContainer.children.length).toBe(0);
        expect(inst.getElement()).toBeNull();
      }

      // After 50 cycles, container must be completely empty
      expect(mockContainer.children.length).toBe(0);
    });

    it('asserts destroy() idempotency: calling destroy() 10 times consecutively does not throw or corrupt state', () => {
      const inst = new BottomDashboard({ container: mockContainer as any });
      expect(mockContainer.children.length).toBe(1);

      for (let k = 0; k < 10; k++) {
        expect(() => inst.destroy()).not.toThrow();
        expect(inst.getElement()).toBeNull();
        expect(mockContainer.children.length).toBe(0);
      }
    });

    it('successfully mounts 51st instance after 50 cycles without crosstalk or residual state', () => {
      dashboard.destroy();

      for (let i = 0; i < 50; i++) {
        const inst = new BottomDashboard({ container: mockContainer as any });
        inst.update({ score: 99999, highScore: 99999, lives: 5 });
        inst.destroy();
      }

      // Mount 51st instance
      const finalInst = new BottomDashboard({ container: mockContainer as any });
      expect(mockContainer.children.length).toBe(1);

      const scoreEl = mockContainer.querySelector('#dashboard-score')!;
      const livesContainer = mockContainer.querySelector('#dashboard-lives')!;

      // Initial un-updated state should show default 000000 and 0 mounted ships
      expect(scoreEl.textContent).toBe('000000');
      expect(livesContainer.children.length).toBe(0);

      finalInst.update({ score: 12345, highScore: 67890, lives: 2 });
      expect(scoreEl.textContent).toBe('012345');
      expect(livesContainer.children.length).toBe(2);

      finalInst.destroy();
      expect(mockContainer.children.length).toBe(0);
    });
  });
});
