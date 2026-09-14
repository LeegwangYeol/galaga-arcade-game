# Milestone M32 Handoff Report: Mobile Split-Screen Touch Architecture

- **Author**: `m32_explorer_2` (Mobile Split-Screen Touch Architecture Explorer)
- **Target Audience**: Milestone M32 Implementation Workers & Teamwork Orchestrator
- **Working Directory**: `/Users/user/src/galog/.agents/m32_explorer_2`
- **Date / Timestamp**: 2026-09-14T09:30:00Z
- **Status**: COMPLETE & VERIFIED

---

## 1. Observation

### 1.1 Existing Touch Handling in `src/ui/InputHandler.ts`
Investigation of `src/ui/InputHandler.ts` reveals how touch events and pointers are currently processed:

1. **Singleton Touch State Variables (`src/ui/InputHandler.ts:48–50`)**:
   ```typescript
   // Touch identifiers for multi-touch separation
   private touchIdMove: number | null = null;
   private touchIdFire: number | null = null;
   ```
   *Finding*: Only two scalar variables exist to track active touches across the entire application.

2. **TouchStart Processing (`src/ui/InputHandler.ts:685–722`)**:
   ```typescript
   private handleTouchStart(e: TouchEvent): void {
     if (e.cancelable) {
       e.preventDefault();
     }
     this.notifyUserGesture();

     const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
     const windowW = typeof window !== 'undefined' ? window.innerWidth : 375;
     const windowH = typeof window !== 'undefined' ? window.innerHeight : 667;

     for (let i = 0; i < e.changedTouches.length; i++) {
       const touch = e.changedTouches[i];
       if (!touch) continue;

       const clientX = touch.clientX;
       const clientY = touch.clientY;

       // Virtual fire button zone check (Bottom right 35% of viewport or canvas)
       const isFireZone =
         (clientX > windowW * 0.65 && clientY > windowH * 0.6) ||
         (rect && rect.width > 0 && clientX > rect.left + rect.width * 0.65 && clientY > rect.top + rect.height * 0.6);

       if (isFireZone) {
         this.touchIdFire = touch.identifier;
         this.state.touchFire = true;
         this.state.fire = true;
         this.fireTriggered = true;
         this.restartTriggered = true;
         this.triggerHaptic(15);
       } else {
         // Steering touch zone
         this.touchIdMove = touch.identifier;
         this.updatePointerCoordinates(clientX, clientY);
         this.updateTouchSteering(clientX, rect, windowW);
         this.triggerHaptic(8);
       }
     }
   }
   ```
   *Finding*:
   - If a second steering touch occurs (e.g. from Player 2), `this.touchIdMove = touch.identifier` unconditionally overwrites the previous identifier. Player 1's touch is orphaned.
   - Fire zone is hardcoded to the bottom-right 35% of the screen ($X > 0.65 \times W, Y > 0.6 \times H$). No multi-player zone segregation exists.

3. **TouchMove and TouchEnd Processing (`src/ui/InputHandler.ts:724–773`)**:
   ```typescript
   private handleTouchMove(e: TouchEvent): void {
     if (e.cancelable) e.preventDefault();
     const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
     const windowW = typeof window !== 'undefined' ? window.innerWidth : 375;

     for (let i = 0; i < e.changedTouches.length; i++) {
       const touch = e.changedTouches[i];
       if (!touch) continue;
       if (touch.identifier === this.touchIdMove) {
         this.updatePointerCoordinates(touch.clientX, touch.clientY);
         this.updateTouchSteering(touch.clientX, rect, windowW);
       }
     }
   }

   private handleTouchEnd(e: TouchEvent): void {
     if (e.cancelable) e.preventDefault();
     for (let i = 0; i < e.changedTouches.length; i++) {
       const touch = e.changedTouches[i];
       if (!touch) continue;

       if (touch.identifier === this.touchIdFire) {
         this.touchIdFire = null;
         this.state.touchFire = false;
         if (!this.isAnyFireKeyPressed()) this.state.fire = false;
       }

       if (touch.identifier === this.touchIdMove) {
         this.touchIdMove = null;
         this.state.touchLeft = false;
         this.state.touchRight = false;
         if (!this.isAnyLeftKeyPressed()) this.state.moveLeft = false;
         if (!this.isAnyRightKeyPressed()) this.state.moveRight = false;
         this.state.pointerActive = false;
       }
     }
   }
   ```
   *Finding*:
   - If Player 2's touch overwritten `touchIdMove`, lifting Player 1's finger fails `touch.identifier === this.touchIdMove`, leaving Player 1's virtual steer direction stuck permanently.
   - Touchend clears single-player `this.state.touchLeft` and `this.state.touchRight`.

4. **Steering Deadzone Logic (`src/ui/InputHandler.ts:775–795`)**:
   ```typescript
   private updateTouchSteering(clientX: number, rect: DOMRect | null, windowW: number): void {
     const centerX = rect && rect.width > 0 ? rect.left + rect.width / 2 : windowW / 2;
     const deadzone = 12;

     if (clientX < centerX - deadzone) {
       this.state.touchLeft = true;
       this.state.touchRight = false;
       this.state.moveLeft = true;
       this.state.moveRight = false;
     } else if (clientX > centerX + deadzone) {
       this.state.touchRight = true;
       this.state.touchLeft = false;
       this.state.moveRight = true;
       this.state.moveLeft = false;
     } else {
       this.state.touchLeft = false;
       this.state.touchRight = false;
       if (!this.isAnyLeftKeyPressed()) this.state.moveLeft = false;
       if (!this.isAnyRightKeyPressed()) this.state.moveRight = false;
     }
   }
   ```
   *Finding*: The steering direction is evaluated relative to the global canvas center (`centerX = rect.left + rect.width / 2`). If Player 1 is on the left half of the screen, all touches are naturally $X < \text{centerX}$, forcing `moveLeft = true` and making it impossible for Player 1 to steer right while remaining on the left half.

5. **ScreenManager Coordinate Mapping (`src/core/ScreenManager.ts:265–295`)**:
   ```typescript
   public clientToVirtual(clientX: number, clientY: number, clampToBounds: boolean = false): Vector2D | null {
     if (!this.canvas) return null;
     const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
     if (!rect || rect.width === 0 || rect.height === 0) return null;
     const localX = clientX - rect.left;
     const localY = clientY - rect.top;
     ...
     const virtualX = (clampedX / rect.width) * this.virtualWidth;
     const virtualY = (clampedY / rect.height) * this.virtualHeight;
     return { x: virtualX, y: virtualY };
   }
   ```
   *Finding*: ScreenManager converts $(X_{\text{client}}, Y_{\text{client}})$ to $(X_{\text{virtual}}, Y_{\text{virtual}})$ across the entire $[0, 224] \times [0, 288]$ buffer.

6. **PlayerManager Multi-Entity Readiness (`src/systems/PlayerManager.ts:218–246`)**:
   ```typescript
   public update(dt: number, inputs?: InputState | DualInputState | Map<PlayerId, InputState>): void {
     let p1Input: InputState | undefined;
     let p2Input: InputState | undefined;
     if (inputs) {
       if (inputs instanceof Map) {
         p1Input = inputs.get('p1');
         p2Input = inputs.get('p2');
       } else if ('p1' in inputs || 'p2' in inputs) {
         p1Input = (inputs as DualInputState).p1;
         p2Input = (inputs as DualInputState).p2;
       } else {
         p1Input = inputs as InputState;
       }
     }
     this.p1.update(dt, p1Input);
     if (this.mode === 'coop' && this.p2) {
       this.p2.update(dt, p2Input);
     }
   }
   ```
   *Finding*: `PlayerManager` is already architected to receive `DualInputState` (`{ p1: InputState, p2: InputState }`) or `Map<PlayerId, InputState>`. The limitation is entirely within `InputHandler.ts`.

---

## 2. Logic Chain

1. **Failure Mode of Current Multi-Touch in Co-op**:
   - Because `InputHandler` stores only `this.touchIdMove: number | null` and `this.touchIdFire: number | null` (Obs 1), when two players touch the screen simultaneously, the second player's `touch.identifier` clobbers the first player's identifier.
   - Because steering evaluates whether $X < X_{\text{globalCenter}}$ (Obs 4), any touch on the left half commands `moveLeft`, and any touch on the right half commands `moveRight`. In co-op mode, Player 1 (left half) could never turn right, and Player 2 (right half) could never turn left.

2. **Session-Based State Isolation Invariant**:
   - To support simultaneous multi-touch without crossover, every active finger touch must be tracked as a dedicated session object keyed by `Touch.identifier`:
     $$\text{touchSessions}: \text{Map}<\text{number}, \text{PlayerTouchSession}>$$
   - Each session must capture:
     - `playerId: 'p1' | 'p2'`: Assigned strictly at `touchstart` based on whether the initial contact was in the Left Zone ($X < X_{\text{mid}}$) or Right Zone ($X \ge X_{\text{mid}}$).
     - `role: 'steer' | 'fire' | 'special'`: Assigned at `touchstart` based on the sub-zone within that player's hemisphere.
     - `(startX, startY)`: Anchors the initial contact point so steering is measured as relative displacement $\Delta X = X_{\text{current}} - X_{\text{start}}$, rather than absolute position against the global canvas center.
     - `(currentX, currentY)`: Updated on `touchmove`.

3. **Strict Session Affinity (Zero Crossover Rule)**:
   - When a finger moves during `touchmove`, `session.playerId` is NEVER re-evaluated.
   - If Player 1's finger drifts across $X_{\text{mid}}$, it continues to steer Player 1. It never mutates into Player 2's session.
   - When a touch ends or cancels (`touchend` / `touchcancel`), only the input state corresponding to `session.playerId` and `session.role` is cleared, and `touchSessions.delete(id)` is called. Player 2's active touches remain 100% undisturbed.

4. **Dual Virtual Touch Zones Decomposition**:
   - Let client-space canvas bounds be $[L, L + W]$.
   - Screen midpoint: $X_{\text{mid}} = L + \frac{W}{2}$.
   - **Player 1 Hemisphere ($X < X_{\text{mid}}$)**: Width $W_1 = W / 2$.
     - **P1 Steering Sub-Zone** ($X \in [L, L + 0.65 \times W_1)$):
       - Origin anchor $(X_0, Y_0)$ set at `touchstart`.
       - Deadzone $\delta = 10\text{px}$.
       - If $X - X_0 < -\delta \implies \text{p1.moveLeft} = \text{true}, \text{p1.moveRight} = \text{false}$.
       - If $X - X_0 > +\delta \implies \text{p1.moveRight} = \text{true}, \text{p1.moveLeft} = \text{false}$.
       - If $|X - X_0| \le \delta \implies \text{p1.moveLeft} = \text{false}, \text{p1.moveRight} = \text{false}$.
       - Optional Absolute Pointer Target: $u_1 = \text{clamp}\left(\frac{X - L}{0.65 \times W_1}, 0, 1\right)$, mapped to $X_{\text{virt, P1}} = 12 + 200 \times u_1$.
     - **P1 Action Sub-Zone** ($X \in [L + 0.65 \times W_1, X_{\text{mid}})$):
       - Upper half ($Y < T + 0.65 \times H$): P1 Special Move trigger (`p1SpecialTriggered = true`).
       - Lower half ($Y \ge T + 0.65 \times H$): P1 Fire Button (`p1.fire = true, p1.touchFire = true`).
   - **Player 2 Hemisphere ($X \ge X_{\text{mid}}$)**: Width $W_2 = W / 2$.
     - **P2 Steering Sub-Zone** ($X \in [X_{\text{mid}}, X_{\text{mid}} + 0.65 \times W_2)$):
       - Parallel motor layout: left side of P2's half is steering, matching Player 1's mental model.
       - Origin anchor $(X_0, Y_0)$ set at `touchstart`.
       - Displacement $\Delta X_2 = X - X_0$ drives `p2.moveLeft` and `p2.moveRight`.
       - Optional Absolute Pointer Target: $u_2 = \text{clamp}\left(\frac{X - X_{\text{mid}}}{0.65 \times W_2}, 0, 1\right)$, mapped to $X_{\text{virt, P2}} = 12 + 200 \times u_2$.
     - **P2 Action Sub-Zone** ($X \in [X_{\text{mid}} + 0.65 \times W_2, L + W]$):
       - Upper half: P2 Special Move trigger (`p2SpecialTriggered = true`).
       - Lower half: P2 Fire Button (`p2.fire = true, p2.touchFire = true`).

5. **Ergonomic Alternative (Mirrored Layout)**:
   - If two players hold opposite ends of a tablet/phone resting on a table or in their hands:
     - Outer edges = Steering (P1 far left $[L, L + 0.65 W_1]$, P2 far right $[L + W - 0.65 W_2, L + W]$).
     - Inner center = Action buttons (P1 inner $[L + 0.65 W_1, X_{\text{mid}}]$, P2 inner $[X_{\text{mid}}, X_{\text{mid}} + 0.35 W_2]$).
   - Recommendation: Support the parallel layout as default, or allow Tap-and-Drag with Auto-Fire across each player's entire half so any touch steers and fires simultaneously.

6. **Procedural Visual Feedback (Canvas 2D)**:
   - In co-op mode, render a subtle on-canvas procedural guide directly via `InputHandler.renderTouchGuides(ctx: CanvasRenderingContext2D)`:
     - Center dashed dividing line at $X = 112$ (translucent white/cyan, `setLineDash([4, 4])`).
     - "1P TOUCH [P1]" in Classic Cyan (`#00ffff44`) and "2P TOUCH [P2]" in Crimson (`#ff334444`).
     - Dynamic reactive thumbstick rings drawn around `(startX, startY)` with moving puck at `(currentX, currentY)` for each active steering session.
     - 100% procedural, zero external images, 0 allocations per frame.

---

## 3. Caveats

1. **Co-op Mode vs Single-Player Backward Compatibility**:
   - Single-player mode must remain the default. In single-player mode, all existing tests expect `InputHandler.getState()` to return the single `InputState`, and canvas touches should continue using the classic fire zone (bottom-right 35%) and full-screen steering.
   - Dual-zone logic activates when `mode === 'coop'`.
2. **DOM Buttons (`#touch-controls`) in Co-op Mode**:
   - The existing DOM buttons (`#btn-left`, `#btn-right`, `#btn-fire`, `#btn-special`, `#btn-fullscreen`) are positioned for a single player.
   - In Co-op mode, players interact primarily via the direct split-screen canvas touch zones. The DOM buttons should either control Player 1 by default, or be cleanly hidden/augmented when co-op mode is active. Existing E2E tests (`mobile_chrome_touch.spec.ts`) test single-player on load, so single-player DOM buttons must remain fully functional.
3. **Screen Aspect Ratios & Letterboxing**:
   - When the canvas is letterboxed or pillarboxed by `ScreenManager`, touch events on the canvas itself are strictly bounded to `rect = canvas.getBoundingClientRect()`. If touch events originate on the background container outside the canvas, `ScreenManager.calculateTransform` or `window.innerWidth` can be used to resolve the midpoint.
4. **Touch Device Emulation in Automated Tests**:
   - Vitest unit tests use mock events (`MockTouchEvent`, `MockTouch`). The session tracking implementation must handle standard W3C `TouchEvent` properties (`changedTouches`, `identifier`, `clientX`, `clientY`) cleanly when dispatched on mock canvas objects.

---

## 4. Conclusion

The split-screen dual virtual touch subsystem for Milestone M32 can be cleanly, robustly, and efficiently implemented by introducing session-based multi-touch tracking into `src/ui/InputHandler.ts`:

1. **State Contracts**:
   - Add `PlayerTouchSession` interface:
     ```typescript
     export interface PlayerTouchSession {
       id: number;
       playerId: 'p1' | 'p2';
       role: 'steer' | 'fire' | 'special';
       startX: number;
       startY: number;
       currentX: number;
       currentY: number;
       startTime: number;
       lastUpdateTime: number;
     }
     ```
   - Maintain independent input states for P1 and P2:
     - `p1State: InputState`
     - `p2State: InputState`
     - `touchSessions = new Map<number, PlayerTouchSession>()`
2. **Public API Extensions on `InputHandler`**:
   - `public setMode(mode: 'single' | 'coop'): void`
   - `public getMode(): 'single' | 'coop'`
   - `public getInputState(playerId: PlayerId): InputState`
   - `public getDualInputState(): { p1: InputState; p2: InputState }`
   - `public consumeAction(action: string, playerId?: PlayerId): boolean`
   - `public renderTouchGuides(ctx: CanvasRenderingContext2D): void`
3. **Mathematical Coordinate Transform**:
   - Midpoint: $X_{\text{mid}} = \text{rect.left} + \text{rect.width} / 2$.
   - Zone check at `touchstart`: $X < X_{\text{mid}} \implies \text{'p1'}$, $X \ge X_{\text{mid}} \implies \text{'p2'}$.
   - Relative steering displacement: $\Delta X = X_{\text{current}} - X_{\text{start}}$ with $10\text{px}$ deadzone.
   - Scaled absolute pointer targeting: $X_{\text{virt}} = 12 + 200 \times u \in [12, 212]$.
4. **Procedural Visual Feedback**:
   - Canvas 2D overlay pass drawing center dashed partition ($X = 112$), P1/P2 zone labels, and dynamic thumbstick rings around active touch contacts.

---

## 5. Verification Method

### 5.1 Independent Vitest Unit Verification
Run the complete unit test suite to verify baseline invariance (2,041 tests passing):
```bash
npm test -- --run
```

### 5.2 Specific Multi-Touch Co-op Unit Test Suite Specification
Create a dedicated test file `tests/unit/m32_split_touch_coop.test.ts` verifying:
1. **Simultaneous Dual Steering**:
   - Dispatch `touchstart` with Touch 101 at $X = 50, Y = 200$ (P1 Zone) and Touch 102 at $X = 250, Y = 200$ (P2 Zone).
   - Assert `touchSessions.size === 2`.
   - Dispatch `touchmove` moving Touch 101 left ($X = 30$) and Touch 102 right ($X = 280$).
   - Assert `handler.getInputState('p1').moveLeft === true` and `handler.getInputState('p1').moveRight === false`.
   - Assert `handler.getInputState('p2').moveRight === true` and `handler.getInputState('p2').moveLeft === false`.
2. **Simultaneous Dual Firing**:
   - Dispatch Touch 103 in P1 Fire Zone ($X = 90, Y = 250$) and Touch 104 in P2 Fire Zone ($X = 320, Y = 250$).
   - Assert `handler.consumeAction('fire', 'p1') === true` and `handler.consumeAction('fire', 'p2') === true`.
3. **Zero Crossover on Center Line Drift**:
   - Start Touch 101 at $X = 80$ (P1 Zone). Move to $X = 140$ (past $X_{\text{mid}} = 112$).
   - Assert session remains bound to `'p1'`; P2 input state is completely unmodified.
4. **Independent Finger Release**:
   - End Touch 102 (`touchend`).
   - Assert P2 inputs are cleared, but P1 input remains active and controllable.
5. **TouchCancel Interruption Safety**:
   - Dispatch `touchcancel` on all active touches.
   - Assert `touchSessions.size === 0` and all inputs return to `false`.
6. **100% Backward Compatibility in Single-Player Mode**:
   - Assert `handler.getState()` matches single-player expectations.
   - Assert `touchIdMove` and `touchIdFire` behavior is preserved when `mode === 'single'`.

### 5.3 Invalidation Conditions
The design is invalidated if:
- Finger lift by Player 2 cancels or freezes Player 1's steering.
- A touch crossing the center line flips control from Player 1 to Player 2.
- Any garbage allocation occurs during 60 FPS `touchmove` processing.
- Any of the 2,041 baseline unit tests or 120 Playwright tests fail.
