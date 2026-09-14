# Handoff Report — Milestone M32: Concurrent Platform-Agnostic Dual-Input Subsystem (PC Dual-Keyboard Architecture)

**Agent Identity**: `m32_explorer_1`  
**Working Directory**: `/Users/user/src/galog/.agents/m32_explorer_1`  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Timestamp**: 2026-09-14T09:30:00Z  
**Status**: COMPLETE (Hard Handoff)

---

## 1. Observation

Direct code examination of `src/ui/InputHandler.ts`, `src/types/index.ts`, `src/systems/PlayerManager.ts`, `src/core/Game.ts`, and test suites (`tests/unit/core.test.ts`, `tests/unit/m31_multi_entity_player.test.ts`) revealed the following baseline architecture and design requirements:

### 1.1 Existing Input Architecture & State Model
- **Single State Object**: `InputHandler.ts:20–31` maintains a single instance of `InputState`:
  ```ts
  private state: InputState = {
    moveLeft: false,
    moveRight: false,
    fire: false,
    pause: false,
    restart: false,
    pointerX: null,
    pointerActive: false,
    touchLeft: false,
    touchRight: false,
    touchFire: false,
  };
  ```
- **Conflated Key Mapping**: `InputHandler.ts:837–871` maps both `ArrowLeft` and `KeyA` to the same `isLeftKey()` helper, and `ArrowRight` and `KeyD` to `isRightKey()`. Consequently:
  - If Player 1 presses `KeyA` and Player 2 presses `ArrowLeft`, both write to `this.state.moveLeft`.
  - Releasing `KeyA` inspects `this.activeKeys.has('ArrowLeft') || this.activeKeys.has('KeyA')` (`InputHandler.ts:917–923`), so if Player 2 is still holding `ArrowLeft`, `this.state.moveLeft` remains `true`.
  - There is currently **no player channel isolation**. Both players share the exact same state flags.
- **Global Pulse Actions**: `fireTriggered`, `specialTriggered`, `cycleSpecialTriggered`, and `phaseWarpTriggered` (`InputHandler.ts:34–43`, `260–309`) are single boolean / scalar latches consumed globally on first read. If one player triggers a special move, `consumeAction('special')` clears the latch for both.
- **Double-Tap State**: `lastLeftKeyDownTime` and `lastRightKeyDownTime` (`InputHandler.ts:41–42`, `517–535`) are single timestamps. Interleaved tapping between players creates false double-tap phase warps.
- **Prevent Default Coverage**: `InputHandler.PREVENT_DEFAULT_KEYS` (`InputHandler.ts:53–82`) includes `ArrowLeft/Right/Up/Down`, `Space`, `KeyW/A/S/D`, `KeyX`, `Enter`, `ShiftRight`, but **omits** `Numpad0` and `KeyM`.

### 1.2 Multi-Entity Player Consumption Prepared in M31
- In `src/systems/PlayerManager.ts:19–21`, `DualInputState` was already drafted:
  ```ts
  export interface DualInputState {
    p1?: InputState;
    p2?: InputState;
  }
  ```
- `PlayerManager.update(dt, inputs)` (`src/systems/PlayerManager.ts:221–245`) already supports receiving `DualInputState`, resolving `p1Input = (inputs as DualInputState).p1` and `p2Input = (inputs as DualInputState).p2`.
- However, `Game.ts:949–952` currently feeds `const input = this.inputHandler.getState(); this.playerManager.update(dt, input);`, meaning in co-op mode Player 2 receives `undefined` input while Player 1 receives the shared/conflated input.

### 1.3 Baseline Invariant & Test Expectations
- `tests/unit/core.test.ts:663–675` verifies that in single-player mode, releasing `ArrowLeft` while `KeyA` is held maintains `getState().moveLeft === true` (rollover latching).
- All 112 test files and 2,041 tests in Vitest currently pass (`npm test` exits 0). Any new dual-keyboard architecture must maintain 100% backward compatibility for single-player callers.

---

## 2. Logic Chain

### 2.1 Hardware Matrix Isolation (Zero Physical Ghosting)
1. Physical key-ghosting occurs when 3 keys sharing electrical row and column traces in a keyboard membrane matrix are closed simultaneously, causing a phantom 4th key or jamming.
2. Standard USB keyboards report minimum 6-Key Rollover (6KRO) + modifiers.
3. Placing Player 1 on the far-left alphanumeric cluster (`KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`, `KeyX`) and Player 2 on the navigation and numpad cluster (`ArrowUp`, `ArrowLeft`, `ArrowDown`, `ArrowRight`, `Enter`, `Numpad0`, `KeyM`, `ShiftRight`) ensures complete physical spatial separation.
4. On membrane and mechanical keyboards, these two clusters occupy disjoint matrix column traces. Therefore, simultaneous multi-key presses across both channels (e.g., P1 pressing A+Space while P2 presses ArrowRight+Enter) do not produce matrix trace interference.

### 2.2 Browser Key-Repeat Lag Elimination (Continuous Latches vs Event Pulses)
1. If movement depended on OS `keydown` repeat events, an initial press would face a 250–500ms OS repeat delay before subsequent repeats. Furthermore, pressing a second key often halts OS repeats for the first key.
2. To achieve zero lag and fluid 60 FPS movement:
   - `keydown` sets a persistent boolean state (`p1State.moveLeft = true`) on first press (`!e.repeat`).
   - Subsequent `e.repeat === true` events keep the boolean `true` without resetting or delaying timers.
   - The game loop fixed-timestep accumulator (60 Hz, 16.6667 ms) directly samples `input.moveLeft` every tick, completely decoupling motion from the OS repeat rate.
   - Discrete pulse actions (`consumeAction('fire')`, `consumeAction('special')`) only latch when `!e.repeat`, preventing unintended repeat bursts.

### 2.3 Mathematical Channel Orthogonality (Zero Event Interference)
1. Let $\mathcal{K}_1$ be the set of key codes assigned to Player 1:
   $$\mathcal{K}_1 = \{ \text{'KeyW'}, \text{'KeyA'}, \text{'KeyS'}, \text{'KeyD'}, \text{'Space'}, \text{'KeyX'}, \text{'KeyC'} \}$$
2. Let $\mathcal{K}_2$ be the set of key codes assigned to Player 2:
   $$\mathcal{K}_2 = \{ \text{'ArrowUp'}, \text{'ArrowLeft'}, \text{'ArrowDown'}, \text{'ArrowRight'}, \text{'Enter'}, \text{'Numpad0'}, \text{'KeyM'}, \text{'ShiftRight'} \}$$
3. Since $\mathcal{K}_1 \cap \mathcal{K}_2 = \emptyset$, the key sets are strictly disjoint.
4. When `mode === 'coop'`:
   - Any `keydown` or `keyup` event with $e.\text{code} \in \mathcal{K}_1$ mutates *only* `p1State` and `p1ActiveKeys`.
   - Any `keydown` or `keyup` event with $e.\text{code} \in \mathcal{K}_2$ mutates *only* `p2State` and `p2ActiveKeys`.
   - Mutual event interference is mathematically impossible: $P(P_1 \text{ mutates } P_2) = 0$.

### 2.4 Mode Fallback & 100% Backward Compatibility
1. When `mode === 'single'`:
   - Both $\mathcal{K}_1$ and $\mathcal{K}_2$ (plus legacy keys `KeyZ`, `KeyK`, `KeyJ`, `KeyV`) are routed into `p1State`.
   - `p2State` remains idle (all booleans `false`).
   - `getState()` returns `p1State`.
   - Single-player users can freely use either WASD or Arrow keys, preserving all legacy muscle memory and passing existing tests without modification.
2. When `mode === 'coop'`:
   - Strict channel partitioning is enabled.
   - `getDualInputState()` returns `{ p1: p1State, p2: p2State }`.
   - `getInputState('p1')` returns `p1State`.
   - `getInputState('p2')` returns `p2State`.

---

## 3. Caveats

1. **Hardware Keyboard Limitations (Ultra-Low-End Non-Gaming Membrane Keyboards)**:
   - While WASD and Arrow keys use different matrix columns, extreme budget non-gaming office keyboards (2KRO) may occasionally block when 4+ keys are pressed across the board. The WASD + Arrow layout is the most optimal arrangement possible on a single physical keyboard, but users with strict 2KRO hardware may prefer Gamepads or separate devices.
2. **IME Composition on `e.key`**:
   - On international systems (e.g. Korean Hangul IME or Japanese IME), `e.key` may emit `'Process'` or Korean/Japanese glyphs when typing. Using `e.code` (`'KeyA'`, `'KeyW'`, `'ArrowLeft'`) as the primary identifier avoids IME interference. `e.key` should only be used as a secondary fallback for headless unit tests.
3. **`ShiftRight` as Special Move vs Browser Shortcuts**:
   - On macOS and Windows, pressing `ShiftRight` does not trigger system OS shortcuts. However, rapid tapping of `Shift` 5 times can trigger Windows Sticky Keys unless disabled. Providing `KeyM` as an equal primary Special Move key for P2 gives players an ergonomic alternative.
4. **Vertical Movement (`moveUp` / `moveDown`)**:
   - Classic Galaga player craft movement is constrained to horizontal 1D along `BASELINE_Y` (250). However, tracking `KeyW`/`KeyS` (P1) and `ArrowUp`/`ArrowDown` (P2) in `InputState` as `moveUp` and `moveDown` is fully supported for menu navigation, stage select, and future 2D evasive maneuvers without breaking 1D steering.

---

## 4. Conclusion & Recommended Architecture

### 4.1 Concrete Type Contracts (`src/types/index.ts`)

```typescript
/**
 * Operating input modes for single-player vs co-op multi-channel routing.
 */
export type InputMode = 'single' | 'coop';

/**
 * Player channel discriminator for multi-channel input routing.
 */
export type InputChannelId = 'p1' | 'p2';

/**
 * Unified input snapshot consumed by player and UI systems per frame.
 */
export interface InputState {
  moveLeft: boolean;
  moveRight: boolean;
  moveUp?: boolean;
  moveDown?: boolean;
  fire: boolean;
  pause: boolean;
  restart: boolean;
  pointerX: number | null;
  pointerActive: boolean;
  touchLeft: boolean;
  touchRight: boolean;
  touchFire: boolean;
  touchUp?: boolean;
  touchDown?: boolean;
}

/**
 * Dual input state object passed to PlayerManager.update().
 */
export interface DualInputState {
  p1: InputState;
  p2: InputState;
}
```

### 4.2 Key Binding Specification Table

| Channel | Action | Primary Key (`e.code`) | Secondary / Alias | Single-Player Mode Fallback |
|---|---|---|---|---|
| **Player 1** | Move Left | `KeyA` | `'a'`, `'A'` | `ArrowLeft`, `KeyA` |
| **Player 1** | Move Right | `KeyD` | `'d'`, `'D'` | `ArrowRight`, `KeyD` |
| **Player 1** | Move Up | `KeyW` | `'w'`, `'W'` | `ArrowUp`, `KeyW` |
| **Player 1** | Move Down | `KeyS` | `'s'`, `'S'` | `ArrowDown`, `KeyS` |
| **Player 1** | Fire | `Space` | `' '` | `Space`, `Enter`, `KeyZ`, `KeyK`, `KeyJ` |
| **Player 1** | Special Move | `KeyX` | `'x'`, `'X'` | `KeyX`, `KeyV` |
| **Player 1** | Cycle Special | `KeyC` | `'c'`, `'C'` | `KeyC` |
| **Player 1** | Phase Warp | Double-tap A/D | `ShiftLeft` | Double-tap A/D/Arrows, `ShiftLeft`, `ShiftRight` |
| **Player 2** | Move Left | `ArrowLeft` | — | *(Merged into P1 in 1P mode)* |
| **Player 2** | Move Right | `ArrowRight` | — | *(Merged into P1 in 1P mode)* |
| **Player 2** | Move Up | `ArrowUp` | — | *(Merged into P1 in 1P mode)* |
| **Player 2** | Move Down | `ArrowDown` | — | *(Merged into P1 in 1P mode)* |
| **Player 2** | Fire | `Enter` | `Numpad0` | *(Merged into P1 in 1P mode)* |
| **Player 2** | Special Move | `KeyM` | `ShiftRight`, `'m'`, `'M'` | *(Merged into P1 in 1P mode)* |
| **Player 2** | Phase Warp | Double-tap $\leftarrow$/$\rightarrow$ | — | *(Merged into P1 in 1P mode)* |
| **Global** | Pause | `KeyP` | `Escape`, `'p'`, `'P'` | Shared across both players |
| **Global** | Restart | `Enter` | `KeyR`, `'r'`, `'R'` | Shared across both players |

### 4.3 Proposed Implementation Blueprint for `InputHandler.ts`

```typescript
export class InputHandler {
  private mode: InputMode = 'single';

  // Discrete channel persistent states
  private p1State: InputState = this.createDefaultInputState();
  private p2State: InputState = this.createDefaultInputState();

  // Active key codepoint sets (prevents keyup crosstalk)
  private activeKeyCodes = new Set<string>();

  // Discrete single-pulse action triggers
  private p1FireTriggered = false;
  private p2FireTriggered = false;
  private p1SpecialTriggered = false;
  private p2SpecialTriggered = false;
  private p1CycleSpecialTriggered = false;
  private p2CycleSpecialTriggered = false;
  private p1PhaseWarpTriggered: number | null = null;
  private p2PhaseWarpTriggered: number | null = null;

  // Double-tap timing per channel
  private p1LastLeftKeyDownTime = 0;
  private p1LastRightKeyDownTime = 0;
  private p2LastLeftKeyDownTime = 0;
  private p2LastRightKeyDownTime = 0;

  // Global triggers
  private pauseTriggered = false;
  private restartTriggered = false;

  // Prevent Default Keys list updated with Numpad0, KeyM, ShiftRight
  private static readonly PREVENT_DEFAULT_KEYS = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyK', 'KeyJ', 'KeyM',
    'KeyP', 'KeyR', 'Escape', 'Enter', 'Numpad0',
    'Shift', 'ShiftLeft', 'ShiftRight',
    'Digit1', 'Digit2',
    'x', 'X', 'c', 'C', 'm', 'M', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'
  ]);

  public setMode(mode: InputMode): void {
    this.mode = mode;
    this.reset();
  }

  public getMode(): InputMode {
    return this.mode;
  }

  public getInputState(playerId: PlayerId = 'p1'): Readonly<InputState> {
    this.pollGamepad();
    return playerId === 'p2' ? this.p2State : this.p1State;
  }

  public getDualInputState(): DualInputState {
    this.pollGamepad();
    return {
      p1: this.p1State,
      p2: this.p2State,
    };
  }

  /**
   * 100% Backward Compatible alias returning P1 state.
   */
  public getState(): Readonly<InputState> {
    return this.getInputState('p1');
  }

  public consumeAction(
    action: 'fire' | 'pause' | 'restart' | 'special' | 'specialMove' | 'cycleSpecial' | 'phaseWarp' | 'phaseDrive' | 'shift',
    playerId?: PlayerId
  ): boolean {
    if (action === 'pause') {
      const val = this.pauseTriggered;
      this.pauseTriggered = false;
      return val;
    }
    if (action === 'restart') {
      const val = this.restartTriggered;
      this.restartTriggered = false;
      return val;
    }

    const targetId = playerId ?? (this.mode === 'coop' ? 'p1' : 'p1');

    if (action === 'fire') {
      if (targetId === 'p2') {
        const val = this.p2FireTriggered;
        this.p2FireTriggered = false;
        return val;
      } else {
        const val = this.p1FireTriggered;
        this.p1FireTriggered = false;
        return val;
      }
    }

    if (action === 'special' || action === 'specialMove') {
      if (targetId === 'p2') {
        const val = this.p2SpecialTriggered;
        this.p2SpecialTriggered = false;
        return val;
      } else {
        const val = this.p1SpecialTriggered;
        this.p1SpecialTriggered = false;
        return val;
      }
    }

    if (action === 'cycleSpecial') {
      const val = this.p1CycleSpecialTriggered;
      this.p1CycleSpecialTriggered = false;
      return val;
    }

    if (action === 'phaseWarp' || action === 'phaseDrive' || action === 'shift') {
      if (targetId === 'p2') {
        const val = this.p2PhaseWarpTriggered !== null;
        this.p2PhaseWarpTriggered = null;
        return val;
      } else {
        const val = this.p1PhaseWarpTriggered !== null;
        this.p1PhaseWarpTriggered = null;
        return val;
      }
    }

    return false;
  }

  public consumePhaseWarp(playerId: PlayerId = 'p1'): number | null {
    if (playerId === 'p2') {
      const val = this.p2PhaseWarpTriggered;
      this.p2PhaseWarpTriggered = null;
      return val;
    }
    const val = this.p1PhaseWarpTriggered;
    this.p1PhaseWarpTriggered = null;
    return val;
  }
}
```

---

## 5. Verification Method

To verify the dual-keyboard architecture and guarantee zero regressions:

### 5.1 Unit Test Specifications (`tests/unit/m32_dual_keyboard.test.ts`)
1. **1P Mode Dual-Binding Regression Test**:
   - Initialize `handler = new InputHandler(canvas)`. (Defaults to `mode = 'single'`).
   - Press `ArrowLeft` $\to$ `handler.getState().moveLeft === true`.
   - Press `KeyA` $\to$ `handler.getState().moveLeft === true`.
   - Release `ArrowLeft` while `KeyA` held $\to$ `handler.getState().moveLeft === true` (rollover latching verified).
   - Release `KeyA` $\to$ `handler.getState().moveLeft === false`.
2. **2P Co-op Concurrency & Non-Interference Test**:
   - Call `handler.setMode('coop')`.
   - Dispatch `keydown` for `KeyA` (P1 Left) and `ArrowRight` (P2 Right) simultaneously.
   - Assert:
     - `handler.getInputState('p1').moveLeft === true`
     - `handler.getInputState('p1').moveRight === false`
     - `handler.getInputState('p2').moveLeft === false`
     - `handler.getInputState('p2').moveRight === true`
   - Release `KeyA`.
   - Assert:
     - `handler.getInputState('p1').moveLeft === false`
     - `handler.getInputState('p2').moveRight === true` (P2 unaffected by P1 release).
3. **Simultaneous Firing & Independent Pulse Consumption**:
   - In `coop` mode, dispatch `keydown` for `Space` and `Enter`.
   - `handler.consumeAction('fire', 'p1')` returns `true`. Second call returns `false`.
   - `handler.consumeAction('fire', 'p2')` returns `true`. Second call returns `false`.
   - Test with `Numpad0`: returns `true` for P2 fire.
4. **Key Repeat Filtering**:
   - Dispatch `keydown` with `repeat: true` for `Space`.
   - Assert `handler.consumeAction('fire', 'p1')` returns `false` on repeats, but `handler.getInputState('p1').fire` remains `true`.
5. **Window Blur Teardown**:
   - Hold `KeyA` and `ArrowRight`.
   - Dispatch `window.dispatchEvent(new Event('blur'))`.
   - Assert both `getInputState('p1')` and `getInputState('p2')` have all booleans `false`.

### 5.2 Command Verification
- Run: `npm test`
- Expected: All 112 existing test suites pass + new `m32_dual_keyboard.test.ts` passes with 0 failures.
- Run: `npm run build`
- Expected: TypeScript strict compilation passes cleanly (`tsc --noEmit && vite build`).
