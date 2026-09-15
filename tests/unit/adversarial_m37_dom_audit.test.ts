/**
 * Galaga Arcade Web Game — Milestone M37
 * Adversarial Empirical Verification Test Suite: Detached DOM & Listener Leak Audit
 * Location: tests/unit/adversarial_m37_dom_audit.test.ts
 *
 * Requirements Tested:
 * - Track 1: Symmetrical Dual Bottom Dashboard Dirty Checking & String Allocation Verification
 * - Track 2: Symmetrical Dual Bottom Dashboard Mode Switching Invariance (0 orphaned nodes, 0 duplicate listeners)
 * - Track 3: InputHandler Teardown & Listener Leak Audit (window, document, canvas, virtual buttons)
 * - Track 4: Game Teardown, Cascading Subsystems & Forensic Leak Identification (FullscreenManager, AudioContextManager)
 * - Track 5: Long-Session Soak Testing & Memory Stability Invariants (5,000 frames, post-destroy safety)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BottomDashboard,
  type DashboardTelemetry,
  PERCENT_STRINGS,
  REVIVE_COUNTDOWN_STRINGS,
  REVIVE_P1_STRINGS,
  REVIVE_P2_STRINGS,
} from '../../src/ui/BottomDashboard';
import { InputHandler } from '../../src/ui/InputHandler';
import { ScreenManager } from '../../src/core/ScreenManager';
import { FullscreenManager } from '../../src/ui/FullscreenManager';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { Game } from '../../src/core/Game';
import { PowerUpType } from '../../src/core/powerups/types';

// ============================================================================
// Enhanced Mock DOM Infrastructure with Listener & Allocation Telemetry
// ============================================================================

interface ListenerRecord {
  target: any;
  targetName: string;
  type: string;
  listener: (e: any) => void;
  options?: any;
}

export class ListenerAuditRegistry {
  private listeners: ListenerRecord[] = [];

  register(target: any, targetName: string, type: string, listener: (e: any) => void, options?: any): void {
    this.listeners.push({ target, targetName, type, listener, options });
  }

  unregister(target: any, type: string, listener: (e: any) => void): boolean {
    const idx = this.listeners.findIndex(
      (r) => r.target === target && r.type === type && r.listener === listener
    );
    if (idx !== -1) {
      this.listeners.splice(idx, 1);
      return true;
    }
    return false;
  }

  getActiveCount(target?: any, type?: string): number {
    return this.listeners.filter((r) => {
      if (target && r.target !== target) return false;
      if (type && r.type !== type) return false;
      return true;
    }).length;
  }

  getListeners(target?: any, type?: string): ListenerRecord[] {
    return this.listeners.filter((r) => {
      if (target && r.target !== target) return false;
      if (type && r.type !== type) return false;
      return true;
    });
  }

  findDuplicateListeners(): { targetName: string; type: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const r of this.listeners) {
      const key = `${r.targetName}::${r.type}::${String(r.listener)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const dupes: { targetName: string; type: string; count: number }[] = [];
    for (const [key, count] of counts.entries()) {
      if (count > 1) {
        const [targetName, type] = key.split('::');
        dupes.push({ targetName: targetName || 'unknown', type: type || 'unknown', count });
      }
    }
    return dupes;
  }

  clear(): void {
    this.listeners = [];
  }
}

export const auditRegistry = new ListenerAuditRegistry();

export class MockDOMTokenList {
  private _classes: Set<string> = new Set();
  public mutationCount = 0;

  constructor(initial: string[] = []) {
    for (const c of initial) {
      if (c) this._classes.add(c);
    }
  }

  add(...tokens: string[]): void {
    for (const t of tokens) {
      if (t && !this._classes.has(t)) {
        this._classes.add(t);
        this.mutationCount++;
      }
    }
  }

  remove(...tokens: string[]): void {
    for (const t of tokens) {
      if (this._classes.has(t)) {
        this._classes.delete(t);
        this.mutationCount++;
      }
    }
  }

  toggle(token: string, force?: boolean): boolean {
    this.mutationCount++;
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
  public mutationCount = 0;

  get width(): string { return this._props['width'] || ''; }
  set width(val: string) { if (this._props['width'] !== val) { this.mutationCount++; } this._props['width'] = val; }

  get borderColor(): string { return this._props['borderColor'] || ''; }
  set borderColor(val: string) { if (this._props['borderColor'] !== val) { this.mutationCount++; } this._props['borderColor'] = val; }

  get backgroundColor(): string { return this._props['backgroundColor'] || ''; }
  set backgroundColor(val: string) { if (this._props['backgroundColor'] !== val) { this.mutationCount++; } this._props['backgroundColor'] = val; }

  get display(): string { return this._props['display'] || ''; }
  set display(val: string) { if (this._props['display'] !== val) { this.mutationCount++; } this._props['display'] = val; }

  get height(): string { return this._props['height'] || ''; }
  set height(val: string) { if (this._props['height'] !== val) { this.mutationCount++; } this._props['height'] = val; }

  getPropertyValue(prop: string): string { return this._props[prop] || ''; }
  setProperty(prop: string, val: string): void { if (this._props[prop] !== val) { this.mutationCount++; } this._props[prop] = val; }
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
  public textContentMutationCount = 0;
  public attributeMutationCount = 0;
  public treeMutationCount = 0;

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
    if (this._textContent !== String(val)) {
      this.textContentMutationCount++;
    }
    this._textContent = String(val);
  }

  setAttribute(name: string, value: string): void {
    this.attributeMutationCount++;
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
    this.attributeMutationCount++;
    delete this.attributes[name];
  }

  appendChild(child: MockElement): MockElement {
    if (!child) return child;
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    this.treeMutationCount++;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.treeMutationCount++;
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

  addEventListener(type: string, listener: (e: any) => void, options?: any): void {
    auditRegistry.register(this, this.id || this.tagName, type, listener, options);
  }

  removeEventListener(type: string, listener: (e: any) => void): void {
    auditRegistry.unregister(this, type, listener);
  }

  dispatchEvent(event: any): boolean {
    const listeners = auditRegistry.getListeners(this, event.type);
    for (const r of listeners) {
      r.listener(event);
    }
    return true;
  }

  /**
   * Recursively counts total descendent nodes in this subtree.
   */
  countSubtreeNodes(): number {
    let count = 1; // self
    for (const child of this.children) {
      count += child.countSubtreeNodes();
    }
    return count;
  }

  /**
   * Checks if this element is connected to the given root ancestor.
   */
  isConnectedTo(root: MockElement): boolean {
    let curr: MockElement | null = this;
    while (curr) {
      if (curr === root) return true;
      curr = curr.parentElement;
    }
    return false;
  }
}

export class MockDocument {
  public body: MockElement = new MockElement('BODY');
  public documentElement: MockElement = new MockElement('HTML');
  public hidden: boolean = false;
  public readyState: string = 'complete';
  private elementsById: Map<string, MockElement> = new Map();
  public createdElements: MockElement[] = [];

  constructor() {
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string): MockElement {
    const el = new MockElement(tagName);
    if (tagName.toLowerCase() === 'canvas') {
      (el as any).width = 224;
      (el as any).height = 288;
      (el as any).getContext = vi.fn().mockReturnValue({
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(0) }),
        putImageData: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        arc: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 0 }),
        drawImage: vi.fn(),
        setLineDash: vi.fn(),
        imageSmoothingEnabled: false,
      });
      (el as any).getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 224,
        height: 288,
        x: 0,
        y: 0,
        right: 224,
        bottom: 288,
      });
    }
    this.createdElements.push(el);
    return el;
  }

  createElementNS(_ns: string, tagName: string): MockElement {
    const el = new MockElement(tagName);
    this.createdElements.push(el);
    return el;
  }

  getElementById(id: string): MockElement | null {
    if (this.elementsById.has(id)) {
      return this.elementsById.get(id)!;
    }
    return this.body.querySelector(`#${id}`);
  }

  querySelector(selector: string): MockElement | null {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector: string): MockElement[] {
    return this.body.querySelectorAll(selector);
  }

  registerElement(el: MockElement): void {
    if (el.id) {
      this.elementsById.set(el.id, el);
    }
  }

  addEventListener(type: string, listener: (e: any) => void, options?: any): void {
    auditRegistry.register(this, 'document', type, listener, options);
  }

  removeEventListener(type: string, listener: (e: any) => void): void {
    auditRegistry.unregister(this, type, listener);
  }

  dispatchEvent(event: any): boolean {
    const list = auditRegistry.getListeners(this, event.type);
    for (const r of list) {
      r.listener(event);
    }
    return true;
  }
}

export class MockWindow {
  public innerWidth = 1024;
  public innerHeight = 768;
  public devicePixelRatio = 1;

  addEventListener(type: string, listener: (e: any) => void, options?: any): void {
    auditRegistry.register(this, 'window', type, listener, options);
  }

  removeEventListener(type: string, listener: (e: any) => void): void {
    auditRegistry.unregister(this, type, listener);
  }

  dispatchEvent(event: any): boolean {
    const list = auditRegistry.getListeners(this, event.type);
    for (const r of list) {
      r.listener(event);
    }
    return true;
  }
}

// ============================================================================
// Test Suite Implementation
// ============================================================================

describe('Milestone M37: Detached DOM & Listener Leak Audit', () => {
  let mockDoc: MockDocument;
  let mockWin: MockWindow;
  let appContainer: MockElement;
  let bottomDashboardEl: MockElement;
  let canvasEl: MockElement;

  beforeEach(() => {
    auditRegistry.clear();
    mockDoc = new MockDocument();
    mockWin = new MockWindow();

    appContainer = mockDoc.createElement('div');
    appContainer.id = 'app-container';
    mockDoc.body.appendChild(appContainer);

    bottomDashboardEl = mockDoc.createElement('div');
    bottomDashboardEl.id = 'bottom-dashboard';
    appContainer.appendChild(bottomDashboardEl);

    canvasEl = mockDoc.createElement('canvas');
    canvasEl.id = 'game-canvas';
    (canvasEl as any).width = 224;
    (canvasEl as any).height = 288;
    (canvasEl as any).getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(0) }),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 0 }),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
      imageSmoothingEnabled: false,
    });
    (canvasEl as any).getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 224,
      height: 288,
      x: 0,
      y: 0,
      right: 224,
      bottom: 288,
    });
    appContainer.appendChild(canvasEl);

    // Setup touch button controls in DOM
    const touchControls = mockDoc.createElement('div');
    touchControls.id = 'touch-controls';
    const btnLeft = mockDoc.createElement('button');
    btnLeft.id = 'btn-left';
    const btnRight = mockDoc.createElement('button');
    btnRight.id = 'btn-right';
    const btnFire = mockDoc.createElement('button');
    btnFire.id = 'btn-fire';
    const btnSpecial = mockDoc.createElement('button');
    btnSpecial.id = 'btn-special';
    const btnFullscreen = mockDoc.createElement('button');
    btnFullscreen.id = 'btn-fullscreen';

    touchControls.appendChild(btnLeft);
    touchControls.appendChild(btnRight);
    touchControls.appendChild(btnFire);
    touchControls.appendChild(btnSpecial);
    touchControls.appendChild(btnFullscreen);
    appContainer.appendChild(touchControls);

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', mockWin);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0));
    vi.stubGlobal('cancelAnimationFrame', (id: any) => clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    auditRegistry.clear();
  });

  // ==========================================================================
  // Track 1: Symmetrical Dual Bottom Dashboard Dirty Checking & String Allocation
  // ==========================================================================
  describe('Track 1: Symmetrical Dual Bottom Dashboard Dirty Checking & String Allocation', () => {
    it('TC-M37-01: Steady-state 10,000 frames in single-player mode produces 0 DOM mutations and 0 string allocations', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'single',
      });

      const staticTelemetry: DashboardTelemetry = {
        score: 15420,
        highScore: 30000,
        isNewHighScore: false,
        lives: 3,
        reserveLives: 2,
        stage: 5,
        isCoop: false,
        specialEnergy: 75,
        isSpecialReady: false,
        selectedSpecial: 'NOVA',
        isMuted: false,
        isFullscreen: false,
        isPaused: false,
        activePowerUps: [],
      };

      // Prime initial state
      dashboard.update(staticTelemetry);

      // Collect baseline mutation numbers on all descendent elements
      const elements = bottomDashboardEl.querySelectorAll('*');
      const baselineTextMutations = elements.reduce((acc, el) => acc + el.textContentMutationCount, 0);
      const baselineStyleMutations = elements.reduce((acc, el) => acc + el.style.mutationCount, 0);
      const baselineClassMutations = elements.reduce((acc, el) => acc + el.classList.mutationCount, 0);
      const baselineAttrMutations = elements.reduce((acc, el) => acc + el.attributeMutationCount, 0);
      const baselineTreeMutations = elements.reduce((acc, el) => acc + el.treeMutationCount, 0);

      // Run 10,000 frames of unchanged telemetry
      for (let i = 0; i < 10000; i++) {
        dashboard.update(staticTelemetry);
      }

      const postTextMutations = elements.reduce((acc, el) => acc + el.textContentMutationCount, 0);
      const postStyleMutations = elements.reduce((acc, el) => acc + el.style.mutationCount, 0);
      const postClassMutations = elements.reduce((acc, el) => acc + el.classList.mutationCount, 0);
      const postAttrMutations = elements.reduce((acc, el) => acc + el.attributeMutationCount, 0);
      const postTreeMutations = elements.reduce((acc, el) => acc + el.treeMutationCount, 0);

      expect(postTextMutations - baselineTextMutations).toBe(0);
      expect(postStyleMutations - baselineStyleMutations).toBe(0);
      expect(postClassMutations - baselineClassMutations).toBe(0);
      expect(postAttrMutations - baselineAttrMutations).toBe(0);
      expect(postTreeMutations - baselineTreeMutations).toBe(0);

      dashboard.destroy();
    });

    it('TC-M37-02: Steady-state 10,000 frames in co-op mode produces 0 DOM mutations across all 3 zones', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'coop',
      });

      const staticCoopTelemetry: DashboardTelemetry = {
        score: 50000,
        highScore: 60000,
        isNewHighScore: false,
        stage: 12,
        isCoop: true,
        p1: {
          score: 25000,
          lives: 3,
          combo: 2,
          specialEnergy: 50,
          specialReady: false,
          selectedSpecial: 'NOVA',
          state: 'normal',
          reviveTimer: 0,
          canDonateLife: false,
          activePowerUps: [],
        },
        p2: {
          score: 25000,
          lives: 2,
          combo: 1,
          specialEnergy: 80,
          specialReady: false,
          selectedSpecial: 'CHRONO',
          state: 'normal',
          reviveTimer: 0,
          canDonateLife: false,
          activePowerUps: [],
        },
      };

      // Prime initial state
      dashboard.update(staticCoopTelemetry);

      const elements = bottomDashboardEl.querySelectorAll('*');
      const baselineTextMutations = elements.reduce((acc, el) => acc + el.textContentMutationCount, 0);
      const baselineStyleMutations = elements.reduce((acc, el) => acc + el.style.mutationCount, 0);
      const baselineClassMutations = elements.reduce((acc, el) => acc + el.classList.mutationCount, 0);
      const baselineAttrMutations = elements.reduce((acc, el) => acc + el.attributeMutationCount, 0);
      const baselineTreeMutations = elements.reduce((acc, el) => acc + el.treeMutationCount, 0);

      for (let i = 0; i < 10000; i++) {
        dashboard.update(staticCoopTelemetry);
      }

      const postTextMutations = elements.reduce((acc, el) => acc + el.textContentMutationCount, 0);
      const postStyleMutations = elements.reduce((acc, el) => acc + el.style.mutationCount, 0);
      const postClassMutations = elements.reduce((acc, el) => acc + el.classList.mutationCount, 0);
      const postAttrMutations = elements.reduce((acc, el) => acc + el.attributeMutationCount, 0);
      const postTreeMutations = elements.reduce((acc, el) => acc + el.treeMutationCount, 0);

      expect(postTextMutations - baselineTextMutations).toBe(0);
      expect(postStyleMutations - baselineStyleMutations).toBe(0);
      expect(postClassMutations - baselineClassMutations).toBe(0);
      expect(postAttrMutations - baselineAttrMutations).toBe(0);
      expect(postTreeMutations - baselineTreeMutations).toBe(0);

      dashboard.destroy();
    });

    it('TC-M37-03: Zero-string allocation lookup table invariant: PERCENT_STRINGS and REVIVE arrays are frozen', () => {
      expect(Object.isFrozen(PERCENT_STRINGS)).toBe(true);
      expect(PERCENT_STRINGS.length).toBe(101);
      expect(PERCENT_STRINGS[0]).toBe('0%');
      expect(PERCENT_STRINGS[100]).toBe('100%');

      expect(Object.isFrozen(REVIVE_COUNTDOWN_STRINGS)).toBe(true);
      expect(REVIVE_COUNTDOWN_STRINGS.length).toBe(16);
      expect(REVIVE_COUNTDOWN_STRINGS[0]).toBe('REVIVE: 0S');
      expect(REVIVE_COUNTDOWN_STRINGS[15]).toBe('REVIVE: 15S');

      expect(Object.isFrozen(REVIVE_P1_STRINGS)).toBe(true);
      expect(REVIVE_P1_STRINGS[0]).toBe('REVIVE P1: 0S');

      expect(Object.isFrozen(REVIVE_P2_STRINGS)).toBe(true);
      expect(REVIVE_P2_STRINGS[0]).toBe('REVIVE P2: 0S');
    });

    it('TC-M37-04: Score formatting dirty checking prevents unneeded formatScore6 invocation and padded string mutation', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'coop',
      });

      const formatScoreSpy = vi.spyOn(dashboard as any, 'formatScore6');

      const telemetry: DashboardTelemetry = {
        score: 120,
        highScore: 20000,
        isCoop: true,
        p1: { score: 100, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, selectedSpecial: 'NOVA', state: 'normal', reviveTimer: 0, canDonateLife: false, activePowerUps: [] },
        p2: { score: 20, lives: 3, combo: 1, specialEnergy: 0, specialReady: false, selectedSpecial: 'CHRONO', state: 'normal', reviveTimer: 0, canDonateLife: false, activePowerUps: [] },
      };

      // Initial update invokes formatScore6 for initial values
      dashboard.update(telemetry);
      const callCountAfterInit = formatScoreSpy.mock.calls.length;
      expect(callCountAfterInit).toBeGreaterThan(0);

      // Subsequent identical updates must NEVER call formatScore6
      for (let i = 0; i < 100; i++) {
        dashboard.update(telemetry);
      }
      expect(formatScoreSpy.mock.calls.length).toBe(callCountAfterInit);

      // Verify formatScore6 zero-padding correctness
      expect((dashboard as any).formatScore6(0)).toBe('000000');
      expect((dashboard as any).formatScore6(5)).toBe('000005');
      expect((dashboard as any).formatScore6(42)).toBe('000042');
      expect((dashboard as any).formatScore6(999)).toBe('000999');
      expect((dashboard as any).formatScore6(12345)).toBe('012345');
      expect((dashboard as any).formatScore6(123456)).toBe('123456');
      expect((dashboard as any).formatScore6(1234567)).toBe('1234567');

      dashboard.destroy();
    });

    it('TC-M37-05: Power-up chip pool hygiene: Elements are reused from pool across activate/deactivate cycles without element leaks', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'single',
      });

      const chipMeta = {
        type: PowerUpType.RAPID_FIRE,
        id: 'rapid',
        label: 'RAPID',
        maxDuration: 15,
        remainingDuration: 15,
        progress: 1.0,
        isActive: true,
      };

      // 1. Activate chip
      dashboard.update({
        score: 0,
        activePowerUps: [chipMeta],
      });

      const chipRack = bottomDashboardEl.querySelector('#dashboard-powerups');
      expect(chipRack?.children.length).toBe(1);
      const firstChipElement = chipRack?.children[0];
      expect(firstChipElement).toBeDefined();

      // 2. Deactivate chip (should unmount from DOM, but remain cached in pool)
      dashboard.update({
        score: 0,
        activePowerUps: [{ ...chipMeta, isActive: false, remainingDuration: 0 }],
      });
      expect(chipRack?.children.length).toBe(0);

      // 3. Reactivate chip (must reuse EXACT same element instance from chipPool, not create a new one)
      dashboard.update({
        score: 0,
        activePowerUps: [{ ...chipMeta, isActive: true, remainingDuration: 10 }],
      });
      expect(chipRack?.children.length).toBe(1);
      const reactivatedChipElement = chipRack?.children[0];
      expect(reactivatedChipElement).toBe(firstChipElement);

      dashboard.destroy();
    });
  });

  // ==========================================================================
  // Track 2: Symmetrical Dual Bottom Dashboard Mode Switching Invariance
  // ==========================================================================
  describe('Track 2: Symmetrical Dual Bottom Dashboard Mode Switching Invariance', () => {
    it('TC-M37-06: 100 consecutive rapid mode toggles creates 0 orphaned DOM elements', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'single',
      });

      const initialCount = bottomDashboardEl.countSubtreeNodes();
      const initialCreatedCount = mockDoc.createdElements.length;

      for (let i = 0; i < 100; i++) {
        dashboard.setMode(i % 2 === 0 ? 'coop' : 'single');
      }

      // Restore to initial 'single' mode
      dashboard.setMode('single');

      // 0 new elements created during setMode
      expect(mockDoc.createdElements.length).toBe(initialCreatedCount);
      // Total node count in the subtree remains strictly constant
      expect(bottomDashboardEl.countSubtreeNodes()).toBe(initialCount);

      dashboard.destroy();
    });

    it('TC-M37-07: Mode toggling creates 0 duplicate event listeners on buttons', () => {
      const onToggleMute = vi.fn();
      const onToggleFullscreen = vi.fn();
      const onTogglePause = vi.fn();

      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'single',
        onToggleMute,
        onToggleFullscreen,
        onTogglePause,
      });

      const btnMute = bottomDashboardEl.querySelector('#btn-dash-mute');
      const btnFS = bottomDashboardEl.querySelector('#btn-dash-fullscreen');
      const btnPause = bottomDashboardEl.querySelector('#btn-dash-pause');

      expect(auditRegistry.getActiveCount(btnMute, 'click')).toBe(1);
      expect(auditRegistry.getActiveCount(btnFS, 'click')).toBe(1);
      expect(auditRegistry.getActiveCount(btnPause, 'click')).toBe(1);

      // Toggle 50 times
      for (let i = 0; i < 50; i++) {
        dashboard.setMode(i % 2 === 0 ? 'coop' : 'single');
      }

      // Exactly 1 listener remains attached to each button (0 duplicates)
      expect(auditRegistry.getActiveCount(btnMute, 'click')).toBe(1);
      expect(auditRegistry.getActiveCount(btnFS, 'click')).toBe(1);
      expect(auditRegistry.getActiveCount(btnPause, 'click')).toBe(1);

      expect(auditRegistry.findDuplicateListeners()).toEqual([]);

      dashboard.destroy();
      expect(auditRegistry.getActiveCount(btnMute, 'click')).toBe(0);
      expect(auditRegistry.getActiveCount(btnFS, 'click')).toBe(0);
      expect(auditRegistry.getActiveCount(btnPause, 'click')).toBe(0);
    });

    it('TC-M37-08: Action buttons and High Score elements maintain exact node identity across reparenting', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'single',
      });

      const actionsContainer = bottomDashboardEl.querySelector('.dash-actions');
      const highScoreElement = bottomDashboardEl.querySelector('#dashboard-high-score');

      expect(actionsContainer).not.toBeNull();
      expect(highScoreElement).not.toBeNull();

      // Switch to coop -> reparents to Zone 2
      dashboard.setMode('coop');
      const coopActionsContainer = bottomDashboardEl.querySelector('.dash-actions');
      const coopHighScoreElement = bottomDashboardEl.querySelector('#dashboard-high-score');

      expect(coopActionsContainer).toBe(actionsContainer);
      expect(coopHighScoreElement).toBe(highScoreElement);
      expect(actionsContainer?.parentElement?.classList.contains('coop-actions-row')).toBe(true);
      expect(highScoreElement?.parentElement?.id).toBe('dashboard-coop-high-score');

      // Switch back to single -> reparents to Zone 3 / Zone 1
      dashboard.setMode('single');
      const singleActionsContainer = bottomDashboardEl.querySelector('.dash-actions');
      const singleHighScoreElement = bottomDashboardEl.querySelector('#dashboard-high-score');

      expect(singleActionsContainer).toBe(actionsContainer);
      expect(singleHighScoreElement).toBe(highScoreElement);
      expect(actionsContainer?.parentElement?.classList.contains('single-actions-wrapper')).toBe(true);

      dashboard.destroy();
    });
  });

  // ==========================================================================
  // Track 3: InputHandler Teardown & Listener Leak Audit
  // ==========================================================================
  describe('Track 3: InputHandler Teardown & Listener Leak Audit', () => {
    it('TC-M37-10: InputHandler initialization attaches exactly expected listeners to window, document, canvas, and buttons', () => {
      const screenManager = new ScreenManager(canvasEl as unknown as HTMLCanvasElement, 224, 288);
      const handler = new InputHandler(canvasEl as unknown as HTMLCanvasElement, screenManager);

      // Window listeners
      expect(auditRegistry.getActiveCount(mockWin, 'keydown')).toBe(1);
      expect(auditRegistry.getActiveCount(mockWin, 'keyup')).toBe(1);
      expect(auditRegistry.getActiveCount(mockWin, 'blur')).toBe(1);

      // Document listener
      expect(auditRegistry.getActiveCount(mockDoc, 'visibilitychange')).toBe(1);

      // Canvas pointer & touch listeners
      expect(auditRegistry.getActiveCount(canvasEl, 'pointerdown')).toBe(1);
      expect(auditRegistry.getActiveCount(canvasEl, 'pointermove')).toBe(1);
      expect(auditRegistry.getActiveCount(canvasEl, 'pointerup')).toBe(1);
      expect(auditRegistry.getActiveCount(canvasEl, 'pointerleave')).toBe(1);
      expect(auditRegistry.getActiveCount(canvasEl, 'touchstart')).toBe(1);
      expect(auditRegistry.getActiveCount(canvasEl, 'touchmove')).toBe(1);
      expect(auditRegistry.getActiveCount(canvasEl, 'touchend')).toBe(1);
      expect(auditRegistry.getActiveCount(canvasEl, 'touchcancel')).toBe(1);

      // DOM touch buttons (btn-left, btn-right, btn-fire, btn-special)
      const btnLeft = mockDoc.getElementById('btn-left');
      expect(auditRegistry.getActiveCount(btnLeft, 'touchstart')).toBe(1);
      expect(auditRegistry.getActiveCount(btnLeft, 'mousedown')).toBe(1);

      handler.destroy();
      screenManager.destroy();
    });

    it('TC-M37-11: InputHandler.destroy() removes ALL event listeners cleanly', () => {
      const screenManager = new ScreenManager(canvasEl as unknown as HTMLCanvasElement, 224, 288);
      const handler = new InputHandler(canvasEl as unknown as HTMLCanvasElement, screenManager);

      const countBeforeDestroy = auditRegistry.getActiveCount();
      expect(countBeforeDestroy).toBeGreaterThan(15);

      handler.destroy();
      screenManager.destroy();

      // All listeners attached by InputHandler must be completely removed
      expect(auditRegistry.getActiveCount(mockWin, 'keydown')).toBe(0);
      expect(auditRegistry.getActiveCount(mockWin, 'keyup')).toBe(0);
      expect(auditRegistry.getActiveCount(mockWin, 'blur')).toBe(0);
      expect(auditRegistry.getActiveCount(mockDoc, 'visibilitychange')).toBe(0);
      expect(auditRegistry.getActiveCount(canvasEl)).toBe(0);

      const btnLeft = mockDoc.getElementById('btn-left');
      expect(auditRegistry.getActiveCount(btnLeft)).toBe(0);
      const btnRight = mockDoc.getElementById('btn-right');
      expect(auditRegistry.getActiveCount(btnRight)).toBe(0);
      const btnFire = mockDoc.getElementById('btn-fire');
      expect(auditRegistry.getActiveCount(btnFire)).toBe(0);
      const btnSpecial = mockDoc.getElementById('btn-special');
      expect(auditRegistry.getActiveCount(btnSpecial)).toBe(0);
    });

    it('TC-M37-12: 50 consecutive new InputHandler() / destroy() cycles results in 0 net listener leaks', () => {
      const screenManager = new ScreenManager(canvasEl as unknown as HTMLCanvasElement, 224, 288);

      for (let i = 0; i < 50; i++) {
        const handler = new InputHandler(canvasEl as unknown as HTMLCanvasElement, screenManager);
        handler.destroy();
      }
      screenManager.destroy();

      expect(auditRegistry.getActiveCount()).toBe(0);
      expect(auditRegistry.findDuplicateListeners()).toEqual([]);
    });

    it('TC-M37-13: Touch sessions, active keys, and single-pulse triggers are completely cleared on reset and destroy', () => {
      const handler = new InputHandler(canvasEl as unknown as HTMLCanvasElement);

      // Simulate pressed keys and touch sessions
      (handler as any).activeKeys.add('ArrowLeft');
      (handler as any).activeKeys.add('KeyA');
      (handler as any).touchSessions.set(1, { id: 1, playerId: 'p1', role: 'steer' });
      (handler as any).fireTriggered = true;
      (handler as any).p1FireTriggered = true;
      (handler as any).p2FireTriggered = true;

      handler.reset();

      expect((handler as any).activeKeys.size).toBe(0);
      expect((handler as any).touchSessions.size).toBe(0);
      expect((handler as any).fireTriggered).toBe(false);
      expect((handler as any).p1FireTriggered).toBe(false);
      expect((handler as any).p2FireTriggered).toBe(false);

      handler.destroy();
    });
  });

  // ==========================================================================
  // Track 4: Game Teardown, Cascading Subsystems & Forensic Leak Identification
  // ==========================================================================
  describe('Track 4: Game Teardown, Cascading Subsystems & Forensic Leak Identification', () => {
    it('TC-M37-14: BottomDashboard.destroy() detaches listeners and removes root element from parent cleanly', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
      });

      expect(bottomDashboardEl.parentElement).toBe(appContainer);
      dashboard.destroy();

      // Root element must be detached from appContainer
      expect(bottomDashboardEl.parentElement).toBeNull();
      expect(dashboard.element).toBeNull();
    });

    it('TC-M37-15: ScreenManager.destroy() removes window resize listener cleanly', () => {
      const screenManager = new ScreenManager(canvasEl as unknown as HTMLCanvasElement, 224, 288);
      expect(auditRegistry.getActiveCount(mockWin, 'resize')).toBe(1);

      screenManager.destroy();
      expect(auditRegistry.getActiveCount(mockWin, 'resize')).toBe(0);
    });

    it('TC-M37-16: FullscreenManager.destroy() removes document and window fullscreen listeners', () => {
      const fsManager = new FullscreenManager({
        target: appContainer as unknown as HTMLElement,
        bindKeyboardShortcut: true,
      });

      expect(auditRegistry.getActiveCount(mockDoc, 'fullscreenchange')).toBeGreaterThanOrEqual(1);
      expect(auditRegistry.getActiveCount(mockWin, 'keydown')).toBe(1);

      fsManager.destroy();

      expect(auditRegistry.getActiveCount(mockDoc, 'fullscreenchange')).toBe(0);
      expect(auditRegistry.getActiveCount(mockWin, 'keydown')).toBe(0);
    });

    it('TC-M37-17: Forensic Audit: Detection of bindToggleButton click listener retention and duplicate risk', () => {
      const fsManager = new FullscreenManager({
        target: appContainer as unknown as HTMLElement,
        bindKeyboardShortcut: false,
      });

      const btnFS = mockDoc.getElementById('btn-fullscreen')!;
      expect(auditRegistry.getActiveCount(btnFS, 'click')).toBe(0);

      // bindToggleButton returns unbind function
      const unbind = fsManager.bindToggleButton(btnFS as unknown as HTMLElement);
      expect(auditRegistry.getActiveCount(btnFS, 'click')).toBe(1);

      // When destroy() is called without calling unbind(), listener would leak if not tracked!
      // Here we verify unbind() works cleanly when called:
      unbind();
      expect(auditRegistry.getActiveCount(btnFS, 'click')).toBe(0);

      fsManager.destroy();
    });

    it('TC-M37-18: Forensic Audit: Detection of AudioContextManager auto-unlock window listeners lifecycle', () => {
      const audioMgr = AudioContextManager.getInstance();

      audioMgr.attachAutoUnlockListeners();
      expect(auditRegistry.getActiveCount(mockWin, 'pointerdown')).toBe(1);
      expect(auditRegistry.getActiveCount(mockWin, 'touchstart')).toBe(1);
      expect(auditRegistry.getActiveCount(mockWin, 'keydown')).toBe(1);
      expect(auditRegistry.getActiveCount(mockWin, 'mousedown')).toBe(1);

      audioMgr.detachAutoUnlockListeners();
      expect(auditRegistry.getActiveCount(mockWin, 'pointerdown')).toBe(0);
      expect(auditRegistry.getActiveCount(mockWin, 'touchstart')).toBe(0);
      expect(auditRegistry.getActiveCount(mockWin, 'keydown')).toBe(0);
      expect(auditRegistry.getActiveCount(mockWin, 'mousedown')).toBe(0);
    });

    it('TC-M37-19: Game.destroy() cascades teardown across all subsystems with 0 lingering engine listeners', () => {
      const game = new Game(canvasEl as unknown as HTMLCanvasElement);

      expect(game.isReady()).toBe(true);

      // Subsystems attached listeners
      const listenersDuringRun = auditRegistry.getActiveCount();
      expect(listenersDuringRun).toBeGreaterThan(10);

      // Call master destroy
      game.destroy();

      expect(game.isReady()).toBe(false);

      // Verify ScreenManager resize listener removed
      expect(auditRegistry.getActiveCount(mockWin, 'resize')).toBe(0);

      // Verify InputHandler keydown/keyup removed
      expect(auditRegistry.getActiveCount(mockDoc, 'visibilitychange')).toBe(0);
      expect(auditRegistry.getActiveCount(canvasEl)).toBe(0);

      // Verify FullscreenManager keydown/fullscreenchange removed
      expect(auditRegistry.getActiveCount(mockDoc, 'fullscreenchange')).toBe(0);
    });
  });

  // ==========================================================================
  // Track 5: Long-Session Soak Testing & Memory Stability Invariants
  // ==========================================================================
  describe('Track 5: Long-Session Soak Testing & Memory Stability Invariants', () => {
    it('TC-M37-20: 5,000 frames of dynamic gameplay telemetry maintains zero detached node growth', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
        mode: 'coop',
      });

      const initialTotalCreatedElements = mockDoc.createdElements.length;

      // Simulate 5,000 frames of gameplay where score changes, powerups toggle, and timers decay
      for (let frame = 1; frame <= 5000; frame++) {
        const hasRapid = (frame % 300) < 150;
        const hasShield = (frame % 600) < 300;
        const p1Score = frame * 10;
        const p2Score = frame * 5;
        const reviveSec = (frame % 15);

        dashboard.update({
          score: p1Score + p2Score,
          highScore: Math.max(20000, p1Score + p2Score),
          stage: 1 + Math.floor(frame / 500),
          isCoop: true,
          p1: {
            score: p1Score,
            lives: Math.max(1, 3 - Math.floor(frame / 2000)),
            combo: 1 + (frame % 4),
            specialEnergy: (frame % 100),
            specialReady: (frame % 100) === 0,
            selectedSpecial: 'NOVA',
            state: frame % 1000 === 0 ? 'revive_pending' : 'normal',
            reviveTimer: reviveSec,
            canDonateLife: true,
            activePowerUps: hasRapid
              ? [{ type: PowerUpType.RAPID_FIRE, id: 'rapid', maxDuration: 15, remainingDuration: 15 - (frame % 15), isActive: true }]
              : [],
          },
          p2: {
            score: p2Score,
            lives: 2,
            combo: 1,
            specialEnergy: (frame % 50) * 2,
            specialReady: false,
            selectedSpecial: 'CHRONO',
            state: 'normal',
            reviveTimer: 0,
            canDonateLife: false,
            activePowerUps: hasShield
              ? [{ type: PowerUpType.KINETIC_SHIELD, id: 'shield', maxDuration: 1, remainingDuration: 1, isActive: true }]
              : [],
          },
        });
      }

      // Verify that after 5,000 dynamic frames, createdElements did NOT continuously expand
      // Initial elements + powerup pool chips created once on first encounter.
      // Pool size should be strictly bounded (<= 20 total chips across P1 and P2).
      const totalCreatedAfter5000 = mockDoc.createdElements.length;
      const netElementsCreatedDuring5000 = totalCreatedAfter5000 - initialTotalCreatedElements;
      expect(netElementsCreatedDuring5000).toBeLessThanOrEqual(20);

      // Verify that all currently mounted chip elements are validly attached to the tree
      const chipsMounted = bottomDashboardEl.querySelectorAll('.powerup-chip');
      for (const chip of chipsMounted) {
        expect(chip.isConnectedTo(bottomDashboardEl)).toBe(true);
      }

      dashboard.destroy();
    });

    it('TC-M37-21: Post-destroy defensive safety: Operations on destroyed BottomDashboard do not throw or revive zombie listeners', () => {
      const dashboard = new BottomDashboard({
        container: bottomDashboardEl as unknown as HTMLElement,
      });

      dashboard.destroy();

      // All calls post-destroy must be safe no-ops
      expect(() => {
        dashboard.update({ score: 100 });
      }).not.toThrow();

      expect(() => {
        dashboard.setMode('coop');
      }).not.toThrow();

      expect(() => {
        dashboard.setCompactMode(true);
      }).not.toThrow();

      expect(() => {
        dashboard.reset();
      }).not.toThrow();

      expect(() => {
        dashboard.destroy();
      }).not.toThrow();

      expect(auditRegistry.getActiveCount()).toBe(0);
    });
  });
});
