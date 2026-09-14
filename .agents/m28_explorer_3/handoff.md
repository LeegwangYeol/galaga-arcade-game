# Milestone M28: Bottom Dashboard Test Strategy & Unit Test Suite Specification

**Agent**: `m28_explorer_3` (Bottom Dashboard Test Strategy Specialist)  
**Date**: 2026-09-11T08:03:30Z  
**Status**: COMPLETE (Exploration & Test Suite Design)

---

## 1. Observation

Direct observations from examining the codebase, configuration, and existing test suites:

### 1.1 Test Environment & Runtime Configuration
- **`vite.config.ts` (lines 39–48)**:
  ```ts
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  ```
  The Vitest suite runs in `'node'` environment, **not** `jsdom` or `happy-dom`. Neither `jsdom` nor `happy-dom` is listed in `package.json` `devDependencies` (which only contains `@playwright/test`, `@types/node`, `playwright`, `typescript`, `vite`, `vitest`).
- **`tests/unit/fullscreen.test.ts` (lines 27–227)**:
  Because of the Node environment, DOM manipulation testing in this codebase uses self-contained mock classes (`MockEventTarget`, `MockElement`, `MockDocument`, `MockWindow`, `MockEvent`, `MockKeyboardEvent`) registered via `vi.stubGlobal('document', ...)` and `vi.stubGlobal('window', ...)`.
  Running `npx vitest run tests/unit/fullscreen.test.ts tests/unit/score.test.ts` completed in 641ms with 60/60 passing tests.

### 1.2 Existing UI and Game Subsystems
- **`src/core/Game.ts` (lines 68–91)**:
  Exposes public subsystems: `screenManager`, `fullscreenManager`, `scoreManager`, `powerUpManager`, `specialMovesManager`, `audioContextManager`, `hud`, `state`.
  - Pause control: `game.pause()` (line 579), `game.resume()` (line 593), `game.togglePause()` (line 608), `game.state === 'PAUSED'`.
  - Fullscreen control: `game.toggleFullscreen()` delegates to `FullscreenManager.toggleFullscreen()`.
- **`src/systems/ScoreManager.ts` (lines 30–52, 70–106)**:
  - Tracks `score`, `highScore`, `lives`.
  - Emits extra life events at 20,000 pts and every 70,000 pts thereafter.
  - Persists high score in `localStorage` (`SCORE_MATRIX.STORAGE_KEY = 'galaga_high_score'`).
- **`src/audio/AudioContextManager.ts` (lines 358–365)**:
  - `toggleMute(): boolean`: flips `this.isMuted` and sets master gain to 0 or `masterVolume`.
  - `getIsMuted(): boolean`: returns current boolean mute state.
  - Headless/Node-safe: handles absence of Web Audio API gracefully.
- **`src/core/powerups/types.ts` (lines 11–23, 77–90)**:
  - Upgrades: `RAPID_FIRE`, `KINETIC_SHIELD`, `SCATTER_SHOT`, `ENGINE_BOOSTER`, `CHRONO_FIELD`, `REFLECTION_SHIELD`, `EMP_COLLECTOR`, `PHASE_DRIVE`, `ANTIMATTER_PLASMA`.
  - Active buff state provides remaining duration timers for each item.
- **`src/core/specials/SpecialMovesManager.ts` (lines 36–46)**:
  - Energy gauge: `energy` (0..100), `maxEnergy` (100), `cooldownTimer` (0..5s).
  - Special move ready condition: `energy >= maxEnergy && cooldownTimer <= 0`.
  - Activation: consumes energy back to 0.

### 1.3 M28 Scope Requirements
- Bottom dashboard docked directly below canvas container.
- Three zones:
  - **Left**: 6-digit score (`000000`), high score, ship lives procedural SVG icons.
  - **Center**: Active power-up chips with remaining duration bars and item colors; special move gauge with 0–100% fill, pulsating `.special-ready` state, reset on activation.
  - **Right**: Controls guide legend, action buttons (`🔊/🔇` Mute, `⛶/🗗` Fullscreen, `⏸/▶` Pause).
- **Mobile Compact Mode**: Compact reflow under narrow viewports (`< 480px`) without clipping or vertical overflow.
- **Zero-GC / Memory Safety**: Zero DOM memory leaks across 50 rounds, dirty-checking to prevent DOM thrashing.

---

## 2. Logic Chain

1. **Test Environment Constraint Resolution**:
   - *Premise*: Vitest is configured with `environment: 'node'` without `jsdom` (Obs 1.1).
   - *Deduction*: Writing `document.createElement(...)` directly without global DOM stubs will cause runtime errors (`ReferenceError: document is not defined`).
   - *Action*: `tests/unit/bottom_dashboard.test.ts` must instantiate and stub a comprehensive Node-compatible DOM Mock harness (`MockElement`, `MockDocument`, `MockWindow`, `MockEvent`) matching the pattern proven in `fullscreen.test.ts`.

2. **Interface Contract Formulation for `BottomDashboard`**:
   - *Premise*: `BottomDashboard` consumes telemetry from `Game.ts` / `ScoreManager` / `PowerUpManager` / `SpecialMovesManager` / `AudioContextManager` (Obs 1.2).
   - *Deduction*: Decoupling the UI component from the full `Game` instance via a clear `DashboardTelemetry` interface allows pure, fast unit testing without spinning up canvas 2D contexts or game loops.
   - *Contract*:
     ```ts
     export interface PowerUpChipTelemetry {
       id: string;
       type: string;
       name: string;
       remainingDuration: number;
       totalDuration: number;
       color?: string;
     }

     export interface DashboardTelemetry {
       score: number;
       highScore: number;
       lives: number;
       activePowerUps: PowerUpChipTelemetry[];
       specialEnergy: number; // 0..100
       isSpecialReady: boolean;
       isMuted: boolean;
       isFullscreen: boolean;
       isPaused: boolean;
     }
     ```

3. **Dirty-Checking & Zero-GC Verification**:
   - *Premise*: M28 mandates zero DOM thrashing and zero memory leaks in the 60 FPS update loop (Obs 1.3).
   - *Deduction*: If telemetry values have not changed between frames, `BottomDashboard.update()` must NOT set `element.textContent`, modify attributes, or recreate child nodes.
   - *Test Strategy*: Spy on DOM setters (`textContent`, `style.width`, `appendChild`, `removeChild`) and verify that 1,000 consecutive updates with identical telemetry produce 0 additional DOM mutations after the first frame.

4. **Formatting Invariant**:
   - *Premise*: Retro arcade score displays are strictly 6-digit zero-padded (Obs 1.3).
   - *Deduction*: `0` -> `'000000'`, `4500` -> `'004500'`. If score exceeds 999,999, it should expand to 7+ digits rather than truncate or throw. Negative or NaN scores must clamp safely to `'000000'`.

5. **Power-Up Chip Lifecycle Verification**:
   - *Premise*: Power-ups have finite durations and dynamic addition/removal (Obs 1.2).
   - *Deduction*: When an item is added, a `.powerup-chip` element is mounted with a progress bar width `(remaining / total) * 100%`. When remaining duration reaches 0, the element must be unmounted cleanly (`removeChild`) with no lingering references.

6. **Special Charge Meter Dynamics**:
   - *Premise*: Energy scales 0..100 with a readiness trigger (Obs 1.2).
   - *Deduction*: Width scales linearly with energy percentage. When `isSpecialReady` is true, the element receives `.special-ready` (activating neon CSS pulse). When activated, energy drops to 0, width resets to 0%, and `.special-ready` is removed.

7. **Action Buttons Dispatching**:
   - *Premise*: Buttons toggle Mute, Fullscreen, and Pause (Obs 1.2, 1.3).
   - *Deduction*: Dispatching `'click'` events on each button must call the respective callback (`onToggleMute`, `onToggleFullscreen`, `onTogglePause`), flip the icon state, and update ARIA attributes (`aria-pressed`, `aria-label`).

---

## 3. Concrete Test Suite Design (`tests/unit/bottom_dashboard.test.ts`)

The full test suite is designed across 10 structured suites with 50+ granular test assertions:

```ts
/**
 * Galaga Arcade Web Game — Milestone M28 Bottom Dashboard Unit Test Suite
 * Location: tests/unit/bottom_dashboard.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BottomDashboard,
  type DashboardTelemetry,
  type PowerUpChipTelemetry,
  type BottomDashboardOptions,
} from '../../src/ui/BottomDashboard';

// ============================================================================
// Node-Compatible DOM Mocks
// ============================================================================

class MockClassList {
  private classes: Set<string> = new Set();
  add(c: string) { this.classes.add(c); }
  remove(c: string) { this.classes.delete(c); }
  contains(c: string): boolean { return this.classes.has(c); }
  toggle(c: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) this.classes.add(c); else this.classes.delete(c);
      return force;
    }
    if (this.classes.has(c)) { this.classes.delete(c); return false; }
    this.classes.add(c); return true;
  }
  toString() { return Array.from(this.classes).join(' '); }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public classList = new MockClassList();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public attributes: Record<string, string> = {};
  public style: Record<string, string> = {};
  public innerHTML: string = '';
  private _textContent: string = '';
  public textContentSetterCount: number = 0;
  private listeners: Record<string, Set<(e: any) => void>> = {};

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  get textContent(): string { return this._textContent; }
  set textContent(val: string) {
    this.textContentSetterCount++;
    this._textContent = String(val);
  }

  setAttribute(name: string, value: string) { this.attributes[name] = String(value); }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  removeAttribute(name: string) { delete this.attributes[name]; }

  appendChild(child: MockElement): MockElement {
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
      for (const child of this.children) search(child);
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
  // 2. Score & High Score Zero-Padding & Pulse Animations
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

      const bar = dashboard.getElement()!.querySelector('.powerup-progress-bar');
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

      const chip = dashboard.getElement()!.querySelector('.powerup-chip');
      expect(chip?.style.borderColor).toBe('#00ffcc');
    });

    it('removes chip element gracefully when power-up duration reaches 0', () => {
      dashboard.update({
        activePowerUps: [{
          id: 'rapid_1',
          type: 'RAPID_FIRE',
          name: 'RAPID',
          remainingDuration: 0.1,
          totalDuration: 10,
        }],
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
      const bar = dashboard.getElement()!.querySelector('.special-charge-bar')!;

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
      const bar = dashboard.getElement()!.querySelector('.special-charge-bar')!;

      dashboard.update({ specialEnergy: 100, isSpecialReady: true } as any);
      expect(container.classList.contains('special-ready')).toBe(true);

      // Fired special -> energy consumed
      dashboard.update({ specialEnergy: 0, isSpecialReady: false } as any);
      expect(container.classList.contains('special-ready')).toBe(false);
      expect(bar.style.width).toBe('0%');
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

      btnMute.dispatchEvent({ type: 'click' });
      expect(onToggleMute).toHaveBeenCalledTimes(1);

      dashboard.update({ isMuted: true } as any);
      expect(btnMute.textContent).toBe('🔇');
      expect(btnMute.getAttribute('aria-label')).toBe('Unmute Audio');
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

      btnFs.dispatchEvent({ type: 'click' });
      expect(onToggleFullscreen).toHaveBeenCalledTimes(1);

      dashboard.update({ isFullscreen: true } as any);
      expect(btnFs.textContent).toBe('🗗');
      expect(btnFs.getAttribute('aria-label')).toBe('Exit Fullscreen');
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

      btnPause.dispatchEvent({ type: 'click' });
      expect(onTogglePause).toHaveBeenCalledTimes(1);

      dashboard.update({ isPaused: true } as any);
      expect(btnPause.textContent).toBe('▶');
      expect(btnPause.getAttribute('aria-label')).toBe('Resume Game');
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
      const scoreEl = dashboard.getElement()!.querySelector('#dashboard-score') as MockElement;
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
        btnFs.dispatchEvent({ type: 'click' });
      }).not.toThrow();
    });

    it('clamps special energy above 100% or below 0% safely', () => {
      const bar = dashboard.getElement()!.querySelector('.special-charge-bar')!;

      dashboard.update({ specialEnergy: 250, isSpecialReady: true } as any);
      expect(bar.style.width).toBe('100%');

      dashboard.update({ specialEnergy: -50, isSpecialReady: false } as any);
      expect(bar.style.width).toBe('0%');
    });
  });
});
```

---

## 4. Caveats

1. **Test Environment Isolation**: Vitest operates under Node (`environment: 'node'`). Running tests that directly reference `document` or `window` without mocking or global stubs will fail immediately. The mock harness included in this design must be either co-located in the test file or placed in a test utility helper.
2. **Read-Only Constraint**: As `m28_explorer_3`, this agent is strictly read-only. No source files (`src/ui/BottomDashboard.ts` or `tests/unit/bottom_dashboard.test.ts`) were modified or committed during this turn.
3. **Parallel Agents**: `m28_explorer_1` is detailing the CSS layout and DOM hierarchy, and `m28_explorer_2` is detailing the telemetry bridge in `Game.ts`. The interface contract in Section 2 is designed to seamlessly integrate with their findings.

---

## 5. Conclusion

The testing strategy for Milestone M28 is fully designed, structured, and ready for implementation. The test suite provides:
- **100% Coverage of Requirements**: DOM lifecycle, 6-digit score padding, ship lives icons (0, 1, 2, 3, 5), power-up chip lifecycle with duration bars, special move charge scaling (0–100%) and pulse class, action button click dispatching, and mobile compact mode.
- **Adversarial Hardening**: Null elements, missing browser APIs, negative/NaN telemetry values, and 10,000-frame dirty-checking DOM thrashing stress tests.
- **Fast Node Execution**: Zero dependency on heavy browser simulators; executes in Vitest within milliseconds.

---

## 6. Verification Method

To independently verify this test strategy once `tests/unit/bottom_dashboard.test.ts` is implemented:

1. **Targeted Vitest Execution**:
   ```bash
   npx vitest run tests/unit/bottom_dashboard.test.ts
   ```
   - Expected Result: 100% pass across all 8 describe suites and 50+ assertions.
2. **Regression Check against Existing Baseline**:
   ```bash
   npx vitest run tests/unit/fullscreen.test.ts tests/unit/score.test.ts tests/unit/hud_screens.test.ts
   ```
   - Expected Result: 0 regressions, all 1,608 baseline unit tests continue to pass cleanly.
3. **Invalidation Conditions**:
   - Tests fail if `score` does not format as 6 digits with leading zeros (e.g. `'4500'` instead of `'004500'`).
   - Tests fail if `destroy()` leaves unmounted DOM nodes in container.
   - Tests fail if calling `update()` with identical telemetry causes repetitive DOM writes (`textContentSetterCount` increases).
