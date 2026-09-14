/**
 * Galaga Arcade Web Game — Milestone M34: Symmetrical Dual Bottom Dashboard HUD Test Suite
 * Location: tests/unit/m34_dual_dashboard.test.ts
 *
 * Comprehensive 34-Scenario Unit Test Suite Across 6 Tracks:
 * - Track 1: Symmetrical 3-Zone Layout Creation & DOM Structure (Co-op Mode)
 * - Track 2: Single-Player Mode Backward Compatibility & Reparenting
 * - Track 3: Zero-GC 60 FPS Dirty Checking Engine & Zero Heap Allocation Invariant
 * - Track 4: Real-Time Telemetry Updates (Independent P1/P2 Scores, Lives, Specials, Power-Ups, Combos)
 * - Track 5: Revive Countdown, Urgent Flash & Life Donation Prompts
 * - Track 6: Mobile Responsive Layout Classes & Viewport Reflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BottomDashboard,
  type DashboardTelemetry,
  type PowerUpChipTelemetry,
} from '../../src/ui/BottomDashboard';
import { PowerUpType } from '../../src/core/powerups/types';

// ============================================================================
// DOM Mock & Mutation Tracking Infrastructure
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

function resetDomCounters(): void {
  globalCounters.textContentSetters = 0;
  globalCounters.styleMutations = 0;
  globalCounters.classListMutations = 0;
  globalCounters.attributeWrites = 0;
  globalCounters.treeMutations = 0;
}

class MockClassList {
  private classes: Set<string> = new Set();

  add(c: string): void {
    if (c) {
      if (!this.classes.has(c)) globalCounters.classListMutations++;
      this.classes.add(c);
    }
  }

  remove(...items: string[]): void {
    for (const c of items) {
      if (this.classes.has(c)) globalCounters.classListMutations++;
      this.classes.delete(c);
    }
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

class MockElement {
  public tagName: string;
  public id: string = '';
  private _className: string = '';
  public classList = new MockClassList();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public attributes: Record<string, string> = {};
  public style: Record<string, string>;
  public innerHTML: string = '';
  public title: string = '';
  private _textContent: string = '';
  public textContentSetterCount: number = 0;
  private listeners: Record<string, Set<(e: any) => void>> = {};

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;

    const rawStyle: Record<string, string> = {};
    this.style = new Proxy(rawStyle, {
      set: (target, prop: string, value: string) => {
        if (target[prop] !== value) {
          globalCounters.styleMutations++;
        }
        target[prop] = value;
        return true;
      },
      get: (target, prop: string) => target[prop] || '',
    });
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
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join('');
    }
    return this._textContent;
  }

  set textContent(val: string) {
    this.textContentSetterCount++;
    globalCounters.textContentSetters++;
    this._textContent = String(val);
  }

  setAttribute(name: string, value: string): void {
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

  removeAttribute(name: string): void {
    globalCounters.attributeWrites++;
    delete this.attributes[name];
  }

  appendChild(child: MockElement): MockElement {
    if (!child) return child;
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    globalCounters.treeMutations++;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      globalCounters.treeMutations++;
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
    this.listeners[type]?.add(listener);
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

  registerElement(id: string, el: MockElement): void {
    el.id = id;
    this.elementsById.set(id, el);
    this.body.appendChild(el);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Milestone M34: Symmetrical Dual Bottom Dashboard HUD Test Suite', () => {
  let mockDoc: MockDocument;
  let mockAppContainer: MockElement;
  let dashboard: BottomDashboard;

  beforeEach(() => {
    resetDomCounters();
    mockDoc = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');
    mockDoc.registerElement('app-container', mockAppContainer);

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768 });

    dashboard = new BottomDashboard({
      container: mockAppContainer as any,
      mode: 'coop',
    });
  });

  afterEach(() => {
    dashboard?.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Track 1: Symmetrical 3-Zone Layout Creation & DOM Structure (Co-op Mode)
  // ==========================================================================
  describe('Track 1: Symmetrical 3-Zone Layout Creation & DOM Structure', () => {
    it('TC1.1: mounts root container with coop-mode and mode-coop classes', () => {
      const root = dashboard.getElement();
      expect(root).not.toBeNull();
      expect(root?.classList.contains('bottom-dashboard')).toBe(true);
      expect(root?.classList.contains('coop-mode')).toBe(true);
      expect(root?.classList.contains('mode-coop')).toBe(true);
      expect(dashboard.getMode()).toBe('coop');
    });

    it('TC1.2: creates Zone 1 (Left P1) hierarchy with badge, score, lives, special and powerups', () => {
      const root = dashboard.getElement()!;
      const zone1 = root.querySelector('.zone-p1');
      expect(zone1).not.toBeNull();

      const badge = zone1?.querySelector('.badge-p1');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('1P');

      expect(root.querySelector('#dashboard-p1-score')).not.toBeNull();
      expect(root.querySelector('#dashboard-p1-lives')).not.toBeNull();
      expect(root.querySelector('#dashboard-p1-special')).not.toBeNull();
      expect(root.querySelector('#dashboard-p1-powerups')).not.toBeNull();
      expect(root.querySelector('#dashboard-p1-combo')).not.toBeNull();
    });

    it('TC1.3: creates Zone 2 (Center) hierarchy with stage badge, high score, warning banner, and actions', () => {
      const root = dashboard.getElement()!;
      const center = root.querySelector('.coop-center-telemetry');
      expect(center).not.toBeNull();

      expect(root.querySelector('#dashboard-stage-badge')).not.toBeNull();
      expect(root.querySelector('#dashboard-coop-high-score')).not.toBeNull();
      expect(root.querySelector('#dashboard-warning')).not.toBeNull();

      // Actions in center during co-op
      expect(root.querySelector('#btn-dash-mute')).not.toBeNull();
      expect(root.querySelector('#btn-dash-fullscreen')).not.toBeNull();
      expect(root.querySelector('#btn-dash-pause')).not.toBeNull();
    });

    it('TC1.4: creates Zone 3 (Right P2) symmetrical hierarchy with badge, score, lives, special and powerups', () => {
      const root = dashboard.getElement()!;
      const zone3 = root.querySelector('.zone-p2');
      expect(zone3).not.toBeNull();

      const badge = zone3?.querySelector('.badge-p2');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('2P');

      expect(root.querySelector('#dashboard-p2-score')).not.toBeNull();
      expect(root.querySelector('#dashboard-p2-lives')).not.toBeNull();
      expect(root.querySelector('#dashboard-p2-special')).not.toBeNull();
      expect(root.querySelector('#dashboard-p2-powerups')).not.toBeNull();
      expect(root.querySelector('#dashboard-p2-combo')).not.toBeNull();
    });

    it('TC1.5: procedural asset purity: all life icons are SVG elements with 0 external image assets', () => {
      const root = dashboard.getElement()!;
      const p1Lives = root.querySelector('#dashboard-p1-lives')!;
      const p2Lives = root.querySelector('#dashboard-p2-lives')!;

      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
        p2: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const p1Icons = p1Lives.querySelectorAll('.ship-life-icon');
      const p2Icons = p2Lives.querySelectorAll('.ship-life-icon');

      expect(p1Icons.length).toBe(3);
      expect(p2Icons.length).toBe(3);

      for (const icon of [...p1Icons, ...p2Icons]) {
        expect(icon.tagName.toLowerCase()).toBe('svg');
        expect(icon.innerHTML).not.toContain('.png');
        expect(icon.innerHTML).not.toContain('.jpg');
        expect(icon.innerHTML).not.toContain('http');
      }
    });
  });

  // ==========================================================================
  // Track 2: Single-Player Mode Backward Compatibility
  // ==========================================================================
  describe('Track 2: Single-Player Mode Backward Compatibility', () => {
    it('TC2.1: Zone 3 is hidden/collapsed when switching to single-player mode', () => {
      dashboard.setMode('single');
      const root = dashboard.getElement()!;
      expect(root.classList.contains('single-mode')).toBe(true);
      expect(root.classList.contains('coop-mode')).toBe(false);

      const p2Zone = root.querySelector('.zone-p2');
      expect(p2Zone?.classList.contains('zone-hidden')).toBe(true);
      expect((p2Zone as HTMLElement)?.style.display).toBe('none');
    });

    it('TC2.2: legacy single-player element IDs resolve cleanly in single-player mode', () => {
      dashboard.setMode('single');
      const root = dashboard.getElement()!;

      expect(root.querySelector('#dashboard-score')).not.toBeNull();
      expect(root.querySelector('#dashboard-high-score')).not.toBeNull();
      expect(root.querySelector('#dashboard-lives')).not.toBeNull();
      expect(root.querySelector('#dashboard-powerups')).not.toBeNull();
      expect(root.querySelector('.dashboard-special-container')).not.toBeNull();
      expect(root.querySelector('.special-charge-bar')).not.toBeNull();
    });

    it('TC2.3: handles seamless mode toggling (coop -> single -> coop) without throwing or creating duplicate nodes', () => {
      expect(() => {
        dashboard.setMode('single');
        dashboard.setMode('coop');
        dashboard.setMode('single');
        dashboard.setMode('coop');
      }).not.toThrow();

      const root = dashboard.getElement()!;
      const mutes = root.querySelectorAll('#btn-dash-mute');
      expect(mutes.length).toBe(1);
    });

    it('TC2.4: reparents action buttons to Zone 3 in single-player mode and Zone 2 in co-op mode', () => {
      const root = dashboard.getElement()!;

      // In co-op mode: actions should be in Zone 2
      const zone2 = root.querySelector('.zone-center')!;
      expect(zone2.querySelector('#btn-dash-mute')).not.toBeNull();

      // In single-player mode: actions should be in Zone 3
      dashboard.setMode('single');
      const zone3 = root.querySelector('.zone-right')!;
      expect(zone3.querySelector('#btn-dash-mute')).not.toBeNull();

      // Switch back to co-op: actions should return to Zone 2
      dashboard.setMode('coop');
      expect(zone2.querySelector('#btn-dash-mute')).not.toBeNull();
    });

    it('TC2.5: reparents high score element cleanly to prevent duplicate ID collision', () => {
      const root = dashboard.getElement()!;

      // In co-op: high score is in Zone 2
      const zone2 = root.querySelector('.zone-center')!;
      expect(zone2.querySelector('#dashboard-high-score')).not.toBeNull();

      // In single-player: high score is in Zone 1
      dashboard.setMode('single');
      const zone1 = root.querySelector('.zone-left')!;
      expect(zone1.querySelector('#dashboard-high-score')).not.toBeNull();

      // Exactly 1 #dashboard-high-score in document
      const highScores = root.querySelectorAll('#dashboard-high-score');
      expect(highScores.length).toBe(1);
    });
  });

  // ==========================================================================
  // Track 3: Zero-GC Dirty Checking Engine
  // ==========================================================================
  describe('Track 3: Zero-GC Dirty Checking Engine', () => {
    it('TC3.1: 10,000 static frames invariant: 0 textContent setters and 0 style mutations', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        score: 1000,
        highScore: 25000,
        stage: 2,
        p1: {
          score: 1000,
          lives: 3,
          combo: 1,
          specialEnergy: 50,
          specialReady: false,
          state: 'normal',
        },
        p2: {
          score: 800,
          lives: 2,
          combo: 1,
          specialEnergy: 30,
          specialReady: false,
          state: 'normal',
        },
      };

      // Frame 1: Initial hydrate
      dashboard.update(state);
      resetDomCounters();

      // Frames 2..10,001: 10,000 consecutive identical ticks
      for (let i = 0; i < 10000; i++) {
        dashboard.update(state);
      }

      expect(globalCounters.textContentSetters).toBe(0);
      expect(globalCounters.styleMutations).toBe(0);
      expect(globalCounters.treeMutations).toBe(0);
      expect(globalCounters.attributeWrites).toBe(0);
    });

    it('TC3.2: P1-isolated mutation: updating only P1 score mutates only #dashboard-p1-score', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 30000,
        stage: 1,
        p1: { score: 1000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 800, lives: 2, combo: 1, specialEnergy: 30, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);
      resetDomCounters();

      // Mutate ONLY P1 score
      state.p1!.score = 1500;
      dashboard.update(state);

      expect(globalCounters.textContentSetters).toBe(1);
      expect(globalCounters.styleMutations).toBe(0);
      expect(dashboard.getElement()!.querySelector('#dashboard-p1-score')?.textContent).toBe('001500');
      expect(dashboard.getElement()!.querySelector('#dashboard-p2-score')?.textContent).toBe('000800');
    });

    it('TC3.3: P2-isolated mutation: updating only P2 score mutates only #dashboard-p2-score', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 30000,
        stage: 1,
        p1: { score: 1000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 800, lives: 2, combo: 1, specialEnergy: 30, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);
      resetDomCounters();

      // Mutate ONLY P2 score
      state.p2!.score = 1200;
      dashboard.update(state);

      expect(globalCounters.textContentSetters).toBe(1);
      expect(globalCounters.styleMutations).toBe(0);
      expect(dashboard.getElement()!.querySelector('#dashboard-p2-score')?.textContent).toBe('001200');
      expect(dashboard.getElement()!.querySelector('#dashboard-p1-score')?.textContent).toBe('001000');
    });

    it('TC3.4: special energy granularity: float fluctuations within same integer percentage produce 0 writes', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 30000,
        p1: { score: 1000, lives: 3, combo: 1, specialEnergy: 42.1, specialReady: false, state: 'normal' },
        p2: { score: 800, lives: 2, combo: 1, specialEnergy: 30, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);
      resetDomCounters();

      // 42.1% -> 42.8%: Math.floor is still 42
      state.p1!.specialEnergy = 42.8;
      dashboard.update(state);

      expect(globalCounters.styleMutations).toBe(0);
      expect(globalCounters.textContentSetters).toBe(0);

      // Now increment to 43.1%: integer changes from 42 to 43
      state.p1!.specialEnergy = 43.1;
      dashboard.update(state);

      expect(globalCounters.styleMutations).toBe(1); // bar width
      expect(globalCounters.textContentSetters).toBe(1); // cue text 43%
    });

    it('TC3.5: zero heap allocation invariant: 0 new Set or Map allocations during steady-state loop', () => {
      const state: DashboardTelemetry = {
        isCoop: true,
        highScore: 20000,
        p1: { score: 1000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
        p2: { score: 1000, lives: 3, combo: 1, specialEnergy: 50, specialReady: false, state: 'normal' },
      };

      dashboard.update(state);

      let allocatedSets = 0;
      let allocatedMaps = 0;
      const OriginalSet = globalThis.Set;
      const OriginalMap = globalThis.Map;

      class TrackedSet<T> extends OriginalSet<T> {
        constructor(iterable?: any) {
          super(iterable);
          allocatedSets++;
        }
      }

      class TrackedMap<K, V> extends OriginalMap<K, V> {
        constructor(entries?: any) {
          super(entries);
          allocatedMaps++;
        }
      }

      globalThis.Set = TrackedSet as any;
      globalThis.Map = TrackedMap as any;

      try {
        for (let i = 0; i < 500; i++) {
          dashboard.update(state);
        }
        expect(allocatedSets).toBe(0);
        expect(allocatedMaps).toBe(0);
      } finally {
        globalThis.Set = OriginalSet;
        globalThis.Map = OriginalMap;
      }
    });

    it('TC3.6: pre-allocated percentage string caching: width is set from frozen table', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 3, combo: 1, specialEnergy: 85, specialReady: false, state: 'normal' },
        p2: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const p1Bar = dashboard.getElement()!.querySelector('#dashboard-p1-special .special-mini-fill');
      expect((p1Bar as HTMLElement)?.style.width).toBe('85%');
    });
  });

  // ==========================================================================
  // Track 4: Real-Time Telemetry Updates
  // ==========================================================================
  describe('Track 4: Real-Time Telemetry Updates', () => {
    it('TC4.1: formats independent 6-digit scores accurately (e.g. 120 -> 000120, 45000 -> 045000)', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 120, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
        p2: { score: 45000, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const root = dashboard.getElement()!;
      expect(root.querySelector('#dashboard-p1-score')?.textContent).toBe('000120');
      expect(root.querySelector('#dashboard-p2-score')?.textContent).toBe('045000');
    });

    it('TC4.2: triggers high-score-flash when a player score exceeds 20000 and matches or exceeds high score', () => {
      dashboard.update({
        isCoop: true,
        highScore: 20000,
        p1: { score: 10000, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
        p2: { score: 25000, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const root = dashboard.getElement()!;
      const highEl = root.querySelector('#dashboard-high-score');
      expect(highEl?.textContent).toBe('025000');
      expect(highEl?.classList.contains('high-score-flash')).toBe(true);
    });

    it('TC4.3: renders independent reserve ship icons (P1 = 3 cyan, P2 = 1 crimson)', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
        p2: { score: 0, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const root = dashboard.getElement()!;
      const p1Icons = root.querySelector('#dashboard-p1-lives')!.querySelectorAll('.ship-life-icon');
      const p2Icons = root.querySelector('#dashboard-p2-lives')!.querySelectorAll('.ship-life-icon');

      expect(p1Icons.length).toBe(3);
      expect(p2Icons.length).toBe(1);
    });

    it('TC4.4: updates independent special move charges (P1 = 60%, P2 = 100% with READY [M])', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 3, combo: 1, specialEnergy: 60, specialReady: false, state: 'normal' },
        p2: { score: 0, lives: 3, combo: 1, specialEnergy: 100, specialReady: true, state: 'normal' },
      } as any);

      const root = dashboard.getElement()!;
      const p1Bar = root.querySelector('#dashboard-p1-special .special-mini-fill');
      const p1Cue = root.querySelector('#p1-special-cue');
      expect((p1Bar as HTMLElement)?.style.width).toBe('60%');
      expect(p1Cue?.textContent).toBe('60%');

      const p2Bar = root.querySelector('#dashboard-p2-special .special-mini-fill');
      const p2Cue = root.querySelector('#p2-special-cue');
      const p2SpecContainer = root.querySelector('#dashboard-p2-special');
      expect((p2Bar as HTMLElement)?.style.width).toBe('100%');
      expect(p2Cue?.textContent).toBe('READY [M]');
      expect(p2SpecContainer?.classList.contains('special-ready')).toBe(true);
    });

    it('TC4.5: renders independent power-up chips for P1 and P2 without crosstalk', () => {
      const p1Chips: PowerUpChipTelemetry[] = [
        { type: PowerUpType.RAPID_FIRE, id: 'rapid', label: 'RF', progress: 0.8, color: '#ff7f00', isActive: true },
      ];
      const p2Chips: PowerUpChipTelemetry[] = [
        { type: PowerUpType.KINETIC_SHIELD, id: 'shield', label: 'SHD', progress: 1.0, color: '#00ffff', isActive: true },
      ];

      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', activePowerUps: p1Chips },
        p2: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', activePowerUps: p2Chips },
      } as any);

      const root = dashboard.getElement()!;
      const p1Rack = root.querySelector('#dashboard-p1-powerups')!;
      const p2Rack = root.querySelector('#dashboard-p2-powerups')!;

      expect(p1Rack.querySelectorAll('.dash-chip').length).toBe(1);
      expect(p2Rack.querySelectorAll('.dash-chip').length).toBe(1);

      // Expire P1 chip
      p1Chips[0]!.isActive = false;
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', activePowerUps: p1Chips },
        p2: { score: 0, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', activePowerUps: p2Chips },
      } as any);

      expect(p1Rack.querySelectorAll('.dash-chip').length).toBe(0);
      expect(p2Rack.querySelectorAll('.dash-chip').length).toBe(1);
    });

    it('TC4.6: updates independent combo counters (P1 = 2X, P2 = 5X)', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 3, combo: 2, specialEnergy: 0, specialReady: false, state: 'normal' },
        p2: { score: 0, lives: 3, combo: 5, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const root = dashboard.getElement()!;
      expect(root.querySelector('#dashboard-p1-combo')?.textContent).toBe('2X');
      expect(root.querySelector('#dashboard-p2-combo')?.textContent).toBe('5X');
    });
  });

  // ==========================================================================
  // Track 5: Revive Countdown & Life Donation Indicator Display
  // ==========================================================================
  describe('Track 5: Revive Countdown & Life Donation Indicator Display', () => {
    it('TC5.1: revive pending visual alert: Zone 1 gains revive-active and displays countdown', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 10.0 },
        p2: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: true },
      } as any);

      const root = dashboard.getElement()!;
      const zone1 = root.querySelector('.zone-left');
      const p1Revive = root.querySelector('#dashboard-p1-revive');

      expect(zone1?.classList.contains('revive-active')).toBe(true);
      expect(p1Revive?.textContent).toContain('REVIVE: 10S');
    });

    it('TC5.2: adds revive-urgent class when countdown is <= 3.0 seconds', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 2.5 },
        p2: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: true },
      } as any);

      const root = dashboard.getElement()!;
      const p1Revive = root.querySelector('#dashboard-p1-revive');
      expect(p1Revive?.classList.contains('revive-urgent')).toBe(true);
    });

    it('TC5.3: displays life donation prompt when partner can donate life and handles mid-second dirty-check toggles', () => {
      // Step 1: P1 revive pending, but P2 cannot donate life
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 8.0 },
        p2: { score: 1000, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: false },
      } as any);

      const root = dashboard.getElement()!;
      const p1Revive = root.querySelector('#dashboard-p1-revive');
      const warningBanner = root.querySelector('#dashboard-warning');

      expect(p1Revive?.textContent).toBe('REVIVE: 8S');
      expect(warningBanner?.textContent).toBe('REVIVE P1: 8S');

      // Step 2: Mid-second transition without timer decrement (timer remains 8.0), P2 gains donation ability
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 8.0 },
        p2: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: true },
      } as any);

      expect(p1Revive?.textContent).toBe('REVIVE: 8S [L] DONATE LIFE');
      expect(warningBanner?.textContent).toBe('[L] DONATE LIFE');

      // Step 3: Symmetrical P2 revive check
      dashboard.update({
        isCoop: true,
        p1: { score: 1000, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: false },
        p2: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 6.0 },
      } as any);

      const p2Revive = root.querySelector('#dashboard-p2-revive');
      expect(p2Revive?.textContent).toBe('REVIVE: 6S');
      expect(warningBanner?.textContent).toBe('REVIVE P2: 6S');

      // Mid-second P1 donation toggle
      dashboard.update({
        isCoop: true,
        p1: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: true },
        p2: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 6.0 },
      } as any);

      expect(p2Revive?.textContent).toBe('REVIVE: 6S [L] DONATE LIFE');
      expect(warningBanner?.textContent).toBe('[L] DONATE LIFE');
    });

    it('TC5.4: successful donation clears revive countdown and restores ship icon', () => {
      // Step 1: In revive pending
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'revive_pending', reviveTimer: 8.0 },
        p2: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: true },
      } as any);

      // Step 2: Donated -> P1 respawns with 1 life
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', reviveTimer: 0 },
        p2: { score: 1000, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal', canDonateLife: false },
      } as any);

      const root = dashboard.getElement()!;
      const zone1 = root.querySelector('.zone-left');
      expect(zone1?.classList.contains('revive-active')).toBe(false);

      const p1Icons = root.querySelector('#dashboard-p1-lives')!.querySelectorAll('.ship-life-icon');
      expect(p1Icons.length).toBe(1);
    });

    it('TC5.5: timeout triggers eliminated state with player-eliminated class', () => {
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'eliminated', reviveTimer: 0 },
        p2: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const root = dashboard.getElement()!;
      const zone1 = root.querySelector('.zone-left');
      expect(zone1?.classList.contains('player-eliminated')).toBe(true);

      const p1Revive = root.querySelector('#dashboard-p1-revive');
      expect(p1Revive?.textContent).toBe('ELIMINATED');
    });

    it('TC5.6: stage clear pity revive restores eliminated player with 1 life and clears player-eliminated class', () => {
      // Step 1: Eliminated
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 0, combo: 1, specialEnergy: 0, specialReady: false, state: 'eliminated' },
        p2: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      const root = dashboard.getElement()!;
      expect(root.querySelector('.zone-left')?.classList.contains('player-eliminated')).toBe(true);

      // Step 2: Pity revive
      dashboard.update({
        isCoop: true,
        p1: { score: 0, lives: 1, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
        p2: { score: 1000, lives: 2, combo: 1, specialEnergy: 0, specialReady: false, state: 'normal' },
      } as any);

      expect(root.querySelector('.zone-left')?.classList.contains('player-eliminated')).toBe(false);
      const p1Icons = root.querySelector('#dashboard-p1-lives')!.querySelectorAll('.ship-life-icon');
      expect(p1Icons.length).toBe(1);
    });
  });

  // ==========================================================================
  // Track 6: Mobile Responsive Layout Classes & Viewport Reflow
  // ==========================================================================
  describe('Track 6: Mobile Responsive Layout Classes & Viewport Reflow', () => {
    it('TC6.1: activates compact mode class via setCompactMode(true)', () => {
      dashboard.setCompactMode(true);
      const root = dashboard.getElement()!;
      expect(root.classList.contains('compact-mode')).toBe(true);

      dashboard.setCompactMode(false);
      expect(root.classList.contains('compact-mode')).toBe(false);
    });

    it('TC6.2: verifies CSS styling in index.html defines mobile responsive grid reflow for <= 480px and <= 380px', () => {
      const fs = require('fs');
      const html = fs.readFileSync('index.html', 'utf8');
      expect(html).toContain('@media (max-width: 480px)');
      expect(html).toContain('.bottom-dashboard.coop-mode');
      expect(html).toContain('grid-template-columns: 1fr 100px 1fr');
      expect(html).toContain('@media (max-width: 380px)');
      expect(html).toContain('grid-template-columns: 1fr 80px 1fr');
    });

    it('TC6.3: controls legend is hidden in compact mode and co-op mode', () => {
      // In co-op mode: legend display is 'none'
      const root = dashboard.getElement()!;
      const legend = root.querySelector('.controls-legend');
      expect((legend as HTMLElement)?.style.display).toBe('none');

      // In single compact mode: legend is hidden
      dashboard.setMode('single');
      dashboard.setCompactMode(true);
      expect(legend?.classList.contains('hidden-compact')).toBe(true);
    });

    it('TC6.4: thumb zone safety: action buttons reside in Zone 2 during co-op mode', () => {
      const root = dashboard.getElement()!;
      const zone1 = root.querySelector('.zone-left')!;
      const zone3 = root.querySelector('.zone-right')!;
      const zone2 = root.querySelector('.zone-center')!;

      expect(zone1.querySelector('.dash-actions')).toBeNull();
      expect(zone3.querySelector('.dash-actions')).toBeNull();
      expect(zone2.querySelector('.dash-actions')).not.toBeNull();
    });

    it('TC6.5: accessible touch target sizing: action buttons have min-touch-target style in index.html', () => {
      const fs = require('fs');
      const html = fs.readFileSync('index.html', 'utf8');
      expect(html).toContain('.dash-btn::before');
      expect(html).toContain('touch-action: manipulation');
    });

    it('TC6.6: safe area inset styles and viewport-fit=cover are present in index.html', () => {
      const fs = require('fs');
      const html = fs.readFileSync('index.html', 'utf8');
      expect(html).toContain('viewport-fit=cover');
      expect(html).toContain('env(safe-area-inset-top');
      expect(html).toContain('env(safe-area-inset-bottom');
    });
  });
});
