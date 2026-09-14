/**
 * Galaga Arcade Web Game — Milestone M34
 * Adversarial Challenger 2 Test Suite: Dynamic Mode Toggling, Mobile Reflow & Telemetry Saturation
 * Location: tests/unit/adversarial_m34_layout_reflow.test.ts
 *
 * Comprehensive adversarial verification across 5 tracks:
 * - Track 1: High-Frequency Dynamic Mode Switching Stress (500 rapid toggles)
 * - Track 2: Extreme Telemetry Saturation & Boundary Hardening (Scores, Lives, Specials, Revive)
 * - Track 3: Mobile Compact Mode Stress & Viewport Reflow Resilience
 * - Track 4: Interleaved Telemetry Updates Under High-Frequency Mode Switching
 * - Track 5: Lifecycle Re-initialization & Teardown Hygiene
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BottomDashboard,
  type PowerUpChipTelemetry,
} from '../../src/ui/BottomDashboard';

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

  add(...classes: string[]): void {
    for (const c of classes) {
      if (c) this.classes.add(c);
    }
  }

  remove(...classes: string[]): void {
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
  private _className: string = '';
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
    return this._className || this.classList.toString();
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
    if (name === 'id') this.id = '';
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
    this.listeners[type].add(listener);
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

/**
 * Helper to recursively collect all elements with IDs in a DOM tree
 */
function collectAllIds(root: any): string[] {
  const ids: string[] = [];
  function traverse(node: any) {
    if (node.id) {
      ids.push(node.id);
    }
    for (const child of node.children || []) {
      traverse(child);
    }
  }
  traverse(root);
  return ids;
}

/**
 * Helper to detect duplicate IDs in an array
 */
function findDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  return Array.from(duplicates);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Milestone M34: Adversarial Dynamic Mode Toggling, Mobile Reflow & Telemetry Saturation', () => {
  let mockDoc: MockDocument;
  let mockAppContainer: MockElement;
  let dashboard: BottomDashboard;

  beforeEach(() => {
    mockDoc = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');
    mockDoc.registerElement('app-container', mockAppContainer);

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768 });

    dashboard = new BottomDashboard({
      container: mockAppContainer as any,
      mode: 'single',
    });
  });

  afterEach(() => {
    dashboard?.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Track 1: High-Frequency Dynamic Mode Switching Stress (500 cycles)
  // ==========================================================================
  describe('Track 1: High-Frequency Dynamic Mode Switching Stress', () => {
    it('TC1.1: rapidly toggles setMode single <-> coop 500 times without exception or DOM degradation', () => {
      const root = dashboard.getElement()!;
      expect(root).not.toBeNull();

      for (let i = 0; i < 500; i++) {
        const nextMode = i % 2 === 0 ? 'coop' : 'single';
        dashboard.setMode(nextMode);

        expect(dashboard.getMode ? dashboard.getMode() : dashboard.mode).toBe(nextMode);

        if (nextMode === 'coop') {
          expect(root.classList.contains('coop-mode')).toBe(true);
          expect(root.classList.contains('mode-coop')).toBe(true);
          expect(root.classList.contains('single-mode')).toBe(false);
          expect(root.classList.contains('mode-single')).toBe(false);
        } else {
          expect(root.classList.contains('single-mode')).toBe(true);
          expect(root.classList.contains('mode-single')).toBe(true);
          expect(root.classList.contains('coop-mode')).toBe(false);
          expect(root.classList.contains('mode-coop')).toBe(false);
        }

        // Check DOM structure integrity periodically
        if (i % 50 === 0 || i === 499) {
          const allIds = collectAllIds(root as any);
          const duplicates = findDuplicateIds(allIds);
          expect(duplicates).toEqual([]);
        }
      }
    });

    it('TC1.2: guarantees duplicate element IDs are never created across repeated mode switches', () => {
      const root = dashboard.getElement()!;

      for (let i = 0; i < 100; i++) {
        dashboard.setMode(i % 2 === 0 ? 'coop' : 'single');

        // Verify key shared elements exist exactly once
        const highScores = root.querySelectorAll('#dashboard-high-score');
        expect(highScores.length).toBe(1);

        const muteBtns = root.querySelectorAll('#btn-dash-mute');
        expect(muteBtns.length).toBe(1);

        const fsBtns = root.querySelectorAll('#btn-dash-fullscreen');
        expect(fsBtns.length).toBe(1);

        const pauseBtns = root.querySelectorAll('#btn-dash-pause');
        expect(pauseBtns.length).toBe(1);

        const actionContainers = root.querySelectorAll('.dash-actions');
        expect(actionContainers.length).toBe(1);
      }
    });

    it('TC1.3: guarantees action button event listeners are not duplicated during repeated mode toggling', () => {
      const root = dashboard.getElement()!;
      const btnMute = root.querySelector('#btn-dash-mute');
      const btnFs = root.querySelector('#btn-dash-fullscreen');
      const btnPause = root.querySelector('#btn-dash-pause');

      expect(btnMute).not.toBeNull();
      expect(btnFs).not.toBeNull();
      expect(btnPause).not.toBeNull();

      const initialMuteListeners = (btnMute as any)!.getListenerCount('click');
      const initialFsListeners = (btnFs as any)!.getListenerCount('click');
      const initialPauseListeners = (btnPause as any)!.getListenerCount('click');

      expect(initialMuteListeners).toBe(1);
      expect(initialFsListeners).toBe(1);
      expect(initialPauseListeners).toBe(1);

      // Perform 200 mode switches
      for (let i = 0; i < 200; i++) {
        dashboard.setMode(i % 2 === 0 ? 'coop' : 'single');
      }

      // Listener count must remain strictly 1
      expect((btnMute as any)!.getListenerCount('click')).toBe(1);
      expect((btnFs as any)!.getListenerCount('click')).toBe(1);
      expect((btnPause as any)!.getListenerCount('click')).toBe(1);
    });

    it('TC1.4: verifies clean visibility transition between single-player and co-op layouts', () => {
      const root = dashboard.getElement()!;
      const p1Container = root.querySelector('.p1-hud-container') as any;
      const p2Container = root.querySelector('.zone-p2') as any;
      const coopCenter = root.querySelector('.coop-center-telemetry') as any;
      const singleScore = root.querySelector('.dash-score-rack') as any;
      const singleLegend = root.querySelector('.controls-legend') as any;

      // Switch to coop
      dashboard.setMode('coop');
      expect(p1Container?.style?.display).not.toBe('none');
      expect(p2Container?.style?.display).not.toBe('none');
      expect(coopCenter?.style?.display).not.toBe('none');
      expect(p2Container?.classList.contains('zone-hidden')).toBe(false);
      expect(singleScore?.style?.display).toBe('none');
      expect(singleLegend?.style?.display).toBe('none');

      // Switch back to single
      dashboard.setMode('single');
      expect(p1Container?.style?.display).toBe('none');
      expect(p2Container?.style?.display).toBe('none');
      expect(coopCenter?.style?.display).toBe('none');
      expect(p2Container?.classList.contains('zone-hidden')).toBe(true);
      expect(singleScore?.style?.display).not.toBe('none');
      expect(singleLegend?.style?.display).not.toBe('none');
    });
  });

  // ==========================================================================
  // Track 2: Extreme Telemetry Saturation & Boundary Hardening
  // ==========================================================================
  describe('Track 2: Extreme Telemetry Saturation & Boundary Hardening', () => {
    it('TC2.1: saturates scores with 0, 999999, 10000000, negatives, NaN, and Infinity without crashing', () => {
      const root = dashboard.getElement()!;
      const singleScoreVal = root.querySelector('#dashboard-score')!;
      const highVal = root.querySelector('#dashboard-high-score')!;

      // 1. Zero score
      dashboard.update({ score: 0, highScore: 20000 } as any);
      expect(singleScoreVal.textContent).toBe('000000');
      expect(highVal.textContent).toBe('020000');

      // 2. 999999 standard arcade maximum
      dashboard.update({ score: 999999, highScore: 999999 } as any);
      expect(singleScoreVal.textContent).toBe('999999');
      expect(highVal.textContent).toBe('999999');

      // 3. 10000000 (8-digit overflow)
      dashboard.update({ score: 10000000, highScore: 10000000 } as any);
      expect(singleScoreVal.textContent).toBe('10000000');
      expect(highVal.textContent).toBe('10000000');

      // 4. Negative scores (-500, -999999) clamped safely to 0
      dashboard.update({ score: -500, highScore: -999999 } as any);
      expect(singleScoreVal.textContent).toBe('000000');

      // 5. NaN scores safely clamped to 0
      dashboard.update({ score: NaN, highScore: NaN } as any);
      expect(singleScoreVal.textContent).toBe('000000');

      // 6. Infinity / -Infinity handling
      expect(() => {
        dashboard.update({ score: Infinity, highScore: Infinity } as any);
      }).not.toThrow();
      expect(() => {
        dashboard.update({ score: -Infinity, highScore: -Infinity } as any);
      }).not.toThrow();

      // Switch to co-op and test P1 / P2 score fuzzing
      dashboard.setMode('coop');
      const p1ScoreVal = root.querySelector('#dashboard-p1-score')!;
      const p2ScoreVal = root.querySelector('#dashboard-p2-score')!;

      dashboard.update({
        isCoop: true,
        p1: { score: 999999 } as any,
        p2: { score: 10000000 } as any,
        highScore: 10000000,
      });
      expect(p1ScoreVal.textContent).toBe('999999');
      expect(p2ScoreVal.textContent).toBe('10000000');

      dashboard.update({
        isCoop: true,
        p1: { score: -100 } as any,
        p2: { score: NaN } as any,
        highScore: 20000,
      });
      expect(p1ScoreVal.textContent).toBe('000000');
      expect(p2ScoreVal.textContent).toBe('000000');
    });

    it('TC2.2: clamps lives to [0, 5] ship icons under extreme inputs (0, 1, 5, 99, negative, NaN) without DOM explosion', () => {
      const root = dashboard.getElement()!;
      const singleLivesContainer = root.querySelector('#dashboard-lives')!;

      // 0 lives -> 0 children
      dashboard.update({ lives: 0 } as any);
      expect(singleLivesContainer.children.length).toBe(0);

      // 1 life -> 1 child
      dashboard.update({ lives: 1 } as any);
      expect(singleLivesContainer.children.length).toBe(1);

      // 5 lives -> 5 children
      dashboard.update({ lives: 5 } as any);
      expect(singleLivesContainer.children.length).toBe(5);

      // 99 lives -> strictly clamped to 5 children (DOM invariant: NO explosion)
      dashboard.update({ lives: 99 } as any);
      expect(singleLivesContainer.children.length).toBe(5);

      // 1000 lives -> strictly clamped to 5 children
      dashboard.update({ lives: 1000 } as any);
      expect(singleLivesContainer.children.length).toBe(5);

      // Negative lives (-5) -> clamped to 0 children
      dashboard.update({ lives: -5 } as any);
      expect(singleLivesContainer.children.length).toBe(0);

      // NaN lives -> clamped to 0 children
      dashboard.update({ lives: NaN } as any);
      expect(singleLivesContainer.children.length).toBe(0);

      // Co-op P1 and P2 lives clamping verification
      dashboard.setMode('coop');
      const p1Lives = root.querySelector('#dashboard-p1-lives')!;
      const p2Lives = root.querySelector('#dashboard-p2-lives')!;

      dashboard.update({
        isCoop: true,
        p1: { lives: 99 } as any,
        p2: { lives: -10 } as any,
      });
      expect(p1Lives.children.length).toBe(5);
      expect(p2Lives.children.length).toBe(0);

      dashboard.update({
        isCoop: true,
        p1: { lives: 3 } as any,
        p2: { lives: 999 } as any,
      });
      expect(p1Lives.children.length).toBe(3);
      expect(p2Lives.children.length).toBe(5);
    });

    it('TC2.3: saturates special meter with 0.0, 0.555555, 1.0, 1.5, -0.5, NaN without layout break', () => {
      const root = dashboard.getElement()!;
      const specialFill = root.querySelector('.special-charge-bar') as any;
      const specialCue = root.querySelector('.special-cue') as any;

      // 0.0 -> 0%
      dashboard.update({ specialMeter: 0.0 } as any);
      expect(specialFill.style.width).toBe('0%');
      expect(specialCue.textContent).toBe('0%');

      // 0.555555 -> 55%
      dashboard.update({ specialMeter: 0.555555 } as any);
      expect(specialFill.style.width).toBe('55%');
      expect(specialCue.textContent).toBe('55%');

      // 1.0 -> 100% and READY [X]
      dashboard.update({ specialMeter: 1.0, isSpecialReady: true } as any);
      expect(specialFill.style.width).toBe('100%');
      expect(specialCue.textContent).toBe('READY [X]');

      // 1.5 -> clamped or formatted without exception
      expect(() => {
        dashboard.update({ specialMeter: 1.5 } as any);
      }).not.toThrow();

      // -0.5 -> clamped to 0%
      dashboard.update({ specialMeter: -0.5 } as any);
      expect(specialFill.style.width).toBe('0%');

      // NaN -> clamped to 0%
      dashboard.update({ specialMeter: NaN } as any);
      expect(specialFill.style.width).toBe('0%');

      // Test P1 and P2 special meter saturation in co-op
      dashboard.setMode('coop');
      const p1SpecialFill = root.querySelector('#dashboard-p1-special .special-fill') as any;
      const p2SpecialFill = root.querySelector('#dashboard-p2-special .special-fill') as any;
      const p1Cue = root.querySelector('#p1-special-cue') as any;
      const p2Cue = root.querySelector('#p2-special-cue') as any;

      dashboard.update({
        isCoop: true,
        p1: { specialGauge: 0.555555 } as any,
        p2: { specialGauge: 1.0, specialReady: true } as any,
      });
      expect(p1SpecialFill.style.width).toBe('55%');
      expect(p2SpecialFill.style.width).toBe('100%');
      expect(p1Cue.textContent).toBe('55%');
      expect(p2Cue.textContent).toBe('READY [M]');

      // Negative and NaN
      dashboard.update({
        isCoop: true,
        p1: { specialGauge: -1.0 } as any,
        p2: { specialGauge: NaN } as any,
      });
      expect(p1SpecialFill.style.width).toBe('0%');
      expect(p2SpecialFill.style.width).toBe('0%');
    });

    it('TC2.4: verifies revive countdown boundary values (10.0, 3.0, 0.0, negative, NaN) and urgency classes', () => {
      dashboard.setMode('coop');
      const root = dashboard.getElement()!;
      const p1Revive = root.querySelector('#dashboard-p1-revive') as any;
      const zone1 = root.querySelector('.zone-p1')!;

      // 10.0s countdown -> REVIVE: 10S, not urgent
      dashboard.update({
        isCoop: true,
        p1: { state: 'revive_pending', reviveTimer: 10.0 } as any,
      });
      expect(p1Revive.style.display).toBe('block');
      expect(p1Revive.textContent).toContain('REVIVE: 10S');
      expect(p1Revive.classList.contains('revive-urgent')).toBe(false);
      expect(zone1.classList.contains('revive-active')).toBe(true);

      // 3.0s countdown -> REVIVE: 3S, urgent flash active
      dashboard.update({
        isCoop: true,
        p1: { state: 'revive_pending', reviveTimer: 3.0 } as any,
      });
      expect(p1Revive.textContent).toContain('REVIVE: 3S');
      expect(p1Revive.classList.contains('revive-urgent')).toBe(true);

      // 0.0s countdown -> REVIVE: 0S, urgent
      dashboard.update({
        isCoop: true,
        p1: { state: 'revive_pending', reviveTimer: 0.0 } as any,
      });
      expect(p1Revive.textContent).toContain('REVIVE: 0S');
      expect(p1Revive.classList.contains('revive-urgent')).toBe(true);

      // Negative timer (-5.0s) -> safely clamped to 0S
      dashboard.update({
        isCoop: true,
        p1: { state: 'revive_pending', reviveTimer: -5.0 } as any,
      });
      expect(p1Revive.textContent).toContain('REVIVE: 0S');

      // NaN timer -> falls back to REVIVE: 0S without throwing
      expect(() => {
        dashboard.update({
          isCoop: true,
          p1: { state: 'revive_pending', reviveTimer: NaN } as any,
        });
      }).not.toThrow();
      expect(p1Revive.textContent).toContain('REVIVE: 0S');

      // Life donation indicator from P2
      dashboard.update({
        isCoop: true,
        p1: { state: 'revive_pending', reviveTimer: 7.0 } as any,
        p2: { canDonateLife: true } as any,
      });
      expect(p1Revive.textContent).toContain('[L] DONATE LIFE');

      // State transition to eliminated
      dashboard.update({
        isCoop: true,
        p1: { state: 'eliminated' } as any,
      });
      expect(p1Revive.textContent).toBe('ELIMINATED');
      expect(zone1.classList.contains('player-eliminated')).toBe(true);
      expect(zone1.classList.contains('revive-active')).toBe(false);

      // State transition back to normal
      dashboard.update({
        isCoop: true,
        p1: { state: 'normal' } as any,
      });
      expect(p1Revive.style.display).toBe('none');
      expect(zone1.classList.contains('player-eliminated')).toBe(false);
      expect(zone1.classList.contains('revive-active')).toBe(false);
    });

    it('TC2.5: handles power-up pool saturation with 20 items, NaN durations, and corrupt chips', () => {
      const root = dashboard.getElement()!;
      dashboard.setMode('coop');

      const corruptChips: PowerUpChipTelemetry[] = [
        { id: 'c1', type: 'RAPID_FIRE', remainingDuration: 10, totalDuration: 15 },
        { id: 'c2', type: 'KINETIC_SHIELD', remainingDuration: NaN, totalDuration: 1 },
        { id: 'c3', type: 'UNKNOWN_TYPE', remainingDuration: -5, totalDuration: 10 },
        { id: 'c4', type: 'SCATTER_SHOT', progress: 1.5 },
        { id: 'c5', type: 'ENGINE_BOOSTER', progress: -0.2 },
        { id: 'c6', type: 'CHRONO_FIELD', remainingDuration: Infinity, totalDuration: 10 },
      ];

      expect(() => {
        dashboard.update({
          isCoop: true,
          p1: { activePowerUps: corruptChips } as any,
        });
      }).not.toThrow();

      const p1Rack = root.querySelector('#dashboard-p1-powerups')!;
      expect(p1Rack).not.toBeNull();

      // Clear powerups
      dashboard.update({
        isCoop: true,
        p1: { activePowerUps: [] } as any,
      });
      expect(p1Rack.children.length).toBe(0);
    });
  });

  // ==========================================================================
  // Track 3: Mobile Compact Mode & Viewport Reflow Resilience
  // ==========================================================================
  describe('Track 3: Mobile Compact Mode Stress & Viewport Reflow Resilience', () => {
    it('TC3.1: rapidly toggles compact mode 1,000 times without DOM desynchronization', () => {
      const root = dashboard.getElement()!;

      for (let i = 0; i < 1000; i++) {
        const compact = i % 2 === 0;
        dashboard.setCompactMode(compact);

        expect(dashboard.isCompactMode()).toBe(compact);
        expect(root.classList.contains('compact-mode')).toBe(compact);

        if (compact) {
          expect(root.style.height).toBe('44px');
        } else {
          expect(root.style.height).toBe('');
        }
      }
    });

    it('TC3.2: preserves layout integrity across simulated viewports (Desktop, Tablet, Mobile)', () => {
      const root = dashboard.getElement()!;
      const viewports = [
        { width: 1024, height: 768, compact: false },
        { width: 768, height: 1024, compact: false },
        { width: 480, height: 800, compact: true },
        { width: 380, height: 667, compact: true },
        { width: 320, height: 568, compact: true },
      ];

      for (const vp of viewports) {
        vi.stubGlobal('window', { innerWidth: vp.width, innerHeight: vp.height });
        dashboard.setCompactMode(vp.compact);

        // Verify root container attributes
        expect(root.classList.contains('compact-mode')).toBe(vp.compact);
        if (vp.compact) {
          expect(root.style.height).toBe('44px');
        }

        // Verify both single-player and co-op layouts maintain valid children count
        dashboard.setMode('single');
        expect(root.children.length).toBe(3);

        dashboard.setMode('coop');
        expect(root.children.length).toBe(3);
      }
    });

    it('TC3.3: combinatorial stress: interleaved mode switching + compact mode toggling + telemetry fuzzing', () => {
      const root = dashboard.getElement()!;

      for (let i = 0; i < 300; i++) {
        const isCoop = i % 3 !== 0;
        const isCompact = i % 2 === 0;

        dashboard.setMode(isCoop ? 'coop' : 'single');
        dashboard.setCompactMode(isCompact);

        dashboard.update({
          isCoop,
          score: (i * 37) % 1000000,
          highScore: 50000,
          lives: i % 7,
          specialMeter: (i % 10) / 10,
          stage: (i % 50) + 1,
          p1: {
            score: (i * 23) % 1000000,
            lives: (i + 1) % 6,
            specialGauge: ((i * 13) % 100) / 100,
            combo: (i % 12) + 1,
          } as any,
          p2: {
            score: (i * 41) % 1000000,
            lives: (i + 2) % 6,
            specialGauge: ((i * 17) % 100) / 100,
            combo: (i % 8) + 1,
          } as any,
        });

        if (i % 50 === 0) {
          const allIds = collectAllIds(root as any);
          const duplicates = findDuplicateIds(allIds);
          expect(duplicates).toEqual([]);
        }
      }

      // Final invariant checks
      expect(root.children.length).toBe(3);
      const finalIds = collectAllIds(root as any);
      expect(findDuplicateIds(finalIds)).toEqual([]);
    });
  });

  // ==========================================================================
  // Track 4: Teardown, Reset & Re-initialization Hygiene
  // ==========================================================================
  describe('Track 4: Teardown, Reset & Re-initialization Hygiene', () => {
    it('TC4.1: resets cleanly after saturated telemetry states without leaving stale strings', () => {
      const root = dashboard.getElement()!;
      dashboard.setMode('coop');

      dashboard.update({
        isCoop: true,
        p1: { score: 999999, lives: 5, specialGauge: 1.0, state: 'revive_pending', reviveTimer: 2.0 } as any,
        p2: { score: 888888, lives: 4, specialGauge: 0.8, state: 'eliminated' } as any,
        stage: 45,
        crisisWarning: 'CRISIS INCOMING',
      });

      dashboard.reset();

      // Verify reset values
      const p1Score = root.querySelector('#dashboard-p1-score')!;
      const p2Score = root.querySelector('#dashboard-p2-score')!;
      const stageBadge = root.querySelector('#dashboard-stage-badge')!;

      expect(p1Score.textContent).toBe('000000');
      expect(p2Score.textContent).toBe('000000');
      expect(stageBadge.textContent).toBe('STAGE 01');
    });

    it('TC4.2: survives 50 consecutive instantiations and teardowns without leaking or crashing', () => {
      for (let i = 0; i < 50; i++) {
        const tempContainer = new MockElement('DIV', `temp-container-${i}`);
        mockDoc.body.appendChild(tempContainer);

        const instance = new BottomDashboard({
          container: tempContainer as any,
          mode: i % 2 === 0 ? 'coop' : 'single',
        });

        instance.update({
          isCoop: i % 2 === 0,
          score: 12345,
          lives: 3,
        });

        expect(instance.getElement()).not.toBeNull();
        instance.destroy();

        expect(instance.getElement()).toBeNull();
        expect(tempContainer.children.length).toBe(0);

        mockDoc.body.removeChild(tempContainer);
      }
    });
  });
});
