# Milestone M32 Adversarial Empirical Verification Hard Handoff Report

**Agent**: `m32_challenger_1`  
**Role**: Empirical Challenger (Adversarial Verifier)  
**Milestone**: M32: Concurrent Platform-Agnostic Dual-Input Subsystem  
**Focus**: Adversarial Keyboard Concurrency & Ghosting Stress  
**Verdict**: **APPROVE**  

---

## 1. Observation

### Implementation & Test Artifacts Evaluated
- `src/ui/InputHandler.ts`:
  - Lines 58–62: Pre-allocated zero-GC state structures (`state`, `stateP1`, `stateP2`, `idleState`, `dualState`).
  - Lines 752–844: `handleKeyDown` dual-channel routing logic separating P1 keys (`KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`, `KeyX`, `KeyC`, `ShiftLeft`) from P2 keys (`ArrowUp`, `ArrowLeft`, `ArrowDown`, `ArrowRight`, `Enter`, `Numpad0`, `KeyM`, `ShiftRight`).
  - Lines 861–879: `handleKeyUp` channel-isolated release checks (`isP1...Key` guarded by `isAnyP1...KeyPressed()` vs `isP2...Key` guarded by `isAnyP2...KeyPressed()`).
  - Lines 328–393: `consumeAction` discrete pulse consumption with dedicated `playerId` parameter for `'p1'` and `'p2'` action routing.
  - Lines 439–476: `reset()` clearing active keys, continuous states, touch sessions, and discrete trigger pulses.
- `tests/unit/adversarial_m32_keyboard.test.ts`:
  - Created an exhaustive 14-test adversarial stress harness across 8 tracks:
    1. Simultaneous Mashing Concurrency (1,000 randomized interleaved keydown/keyup events).
    2. Key Release Isolation (100 repetitive key release cycles between P1 and P2).
    3. Dynamic Mode Switching Under Load (`single` $\leftrightarrow$ `coop` with actively held keys).
    4. Pulse Action & Trigger Isolation (`consumeAction` for fire, special, phaseWarp).
    5. OS Key Repeat Invariant & Anti-Chatter (`repeat === true` pulse suppression).
    6. Multi-Directional Saturation & Ghosting Immunity (simultaneous opposing directions).
    7. Window Blur & Visibility Interruption under multi-finger load.
    8. Single-Player Backward Compatibility under adversarial key influx.

### Verbatim Tool Execution Outputs
1. **Adversarial Keyboard Suite**:
   ```bash
   npx vitest run tests/unit/adversarial_m32_keyboard.test.ts
   ```
   Output:
   ```
   ✓ tests/unit/adversarial_m32_keyboard.test.ts (14 tests) 55ms
   Test Files  1 passed (1)
        Tests  14 passed (14)
   ```
2. **All M32 Dual-Input Test Suites**:
   ```bash
   npx vitest run tests/unit/*m32*.test.ts
   ```
   Output:
   ```
   ✓ tests/unit/adversarial_m32_keyboard.test.ts (14 tests) 203ms
   ✓ tests/unit/adversarial_m32_touch.test.ts (10 tests) 518ms
   ✓ tests/unit/adversarial_critic_m32_temp.test.ts (6 tests) 121ms
   ✓ tests/unit/m32_dual_input_subsystem.test.ts (24 tests) 284ms
   Test Files  4 passed (4)
        Tests  54 passed (54)
   ```
3. **Full Project Test Suite**:
   ```bash
   npm test -- --run
   ```
   Output:
   ```
   Test Files  115 passed (115)
        Tests  2089 passed (2089)
     Duration  8.49s
   ```
4. **Production Build & Bundle Size Audit**:
   ```bash
   npm run build
   ```
   Output:
   ```
   > tsc --noEmit && vite build
   dist/index.html                  23.52 kB │ gzip:  5.08 kB
   dist/og-image.png                49.97 kB
   dist/assets/audio-CHDkw6K4.js    60.13 kB │ gzip: 10.81 kB │ map:   209.68 kB
   dist/assets/bosses-ufPytchO.js  106.45 kB │ gzip: 19.69 kB │ map:   356.70 kB
   dist/assets/index-KM--nRtJ.js   306.82 kB │ gzip: 74.62 kB │ map: 1,054.52 kB
   ✓ built in 669ms
   ```
   `tests/unit/vercel_build_audit.test.ts` passed 11/11 tests (raw bundle 306.82 KB strictly below the 307.2 KB threshold).

---

## 2. Logic Chain

1. **Simultaneous Mashing Concurrency & Crosstalk Freedom**:
   - The test generated 1,000 pseudo-randomly interleaved `keydown` and `keyup` events across P1 (`KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`, `KeyX`) and P2 (`ArrowUp`, `ArrowLeft`, `ArrowDown`, `ArrowRight`, `Enter`, `Numpad0`, `KeyM`) using deterministic Mulberry32 PRNG.
   - For every event dispatched on the P1 channel, the test verified that all P2 continuous gameplay fields (`moveLeft`, `moveRight`, `moveUp`, `moveDown`, `fire`) matched their prior state without deviation.
   - For every event dispatched on the P2 channel, the test verified that all P1 continuous gameplay fields matched their prior state without deviation.
   - Releasing all keys at iteration 1,000 returned both channels to all false, proving zero ghosting or stuck keys.

2. **Key Release Isolation**:
   - P1 `KeyA` was held while cycling P2 `ArrowLeft` through 100 consecutive press/release cycles. Throughout all 100 cycles, `getInputState('p1').moveLeft` remained strictly `true` and was never cleared by P2 release events.
   - In reverse, P2 `ArrowLeft` was held while cycling P1 `KeyA` 100 times, confirming identical isolation.
   - Firing key release isolation (holding P1 `Space` while cycling P2 `Enter`/`Numpad0` 100 times) verified continuous weapon state independence.

3. **Dynamic Mode Switching Under Load**:
   - Keys across both channels were depressed simultaneously before invoking `handler.setMode('single')`.
   - `setMode` executed `reset()`, successfully purging active key sets and resetting `state`, `stateP1`, and `stateP2` to default boolean `false` and `null` values with zero `NaN` occurrences.
   - A 100-iteration rapid switching loop between `'single'` and `'coop'` under fluctuating keydown traffic demonstrated complete memory and state stability.

4. **Pulse Action & Trigger Isolation**:
   - Simultaneous trigger of P1 Fire (`Space`) and P2 Fire (`Enter`) set both `p1FireTriggered` and `p2FireTriggered`.
   - Calling `consumeAction('fire', 'p1')` returned `true`, cleared only P1's trigger latch, and left `p2FireTriggered` completely intact. Calling `consumeAction('fire', 'p2')` then successfully consumed P2's trigger.
   - Reverse consumption ordering and Special Move (`KeyX` vs `KeyM`/`ShiftRight`) and Phase Warp pulse tests verified identical independent latch behavior.

5. **OS Repeat Key Suppression**:
   - Keydown events with `repeat === true` were dispatched 50 times while holding `Space` and `Enter`.
   - Continuous `fire` states remained `true`, while `consumeAction('fire', playerId)` returned `false`, verifying immunity to keyboard repeat chatter.

---

## 3. Caveats

- Hardware-level physical key rollover (membrane keyboard matrix ghosting where 3+ keys on the same electrical circuit block a 4th key) is an innate physical limitation of cheap PC keyboards. However, the chosen default bindings (WASD on the left side, Arrow keys on the right side) utilize physically separated matrix lines on standard keyboards, providing optimal ergonomic and electrical isolation.
- Gamepad dual-controller routing remains earmarked for future expansion if physical gamepads are added to co-op play.

---

## 4. Conclusion

The M32 Concurrent Platform-Agnostic Dual-Input Subsystem satisfies all concurrency, channel isolation, mode switching, and pulse latch invariants without exception.
- Zero channel crosstalk across 1,000 interleaved events.
- Zero key release cross-contamination across 100 rapid cycles.
- Zero stuck keys or state corruption under dynamic mode transitions.
- Zero regressions across the entire project test suite (115 files, 2,089 tests passing 100%).
- Clean production build and Vercel bundle size compliance.

Verdict: **APPROVE**.

---

## 5. Verification Method

To independently verify these empirical results, execute the following commands in `/Users/user/src/galog`:

1. Run the M32 adversarial keyboard concurrency test suite:
   ```bash
   npx vitest run tests/unit/adversarial_m32_keyboard.test.ts
   ```
2. Run all M32 dual-input test suites:
   ```bash
   npx vitest run tests/unit/*m32*.test.ts
   ```
3. Run the full unit and regression test suite:
   ```bash
   npm test -- --run
   ```
4. Run the production TypeScript check and Vite build:
   ```bash
   npm run build
   ```
5. Run the bundle size audit:
   ```bash
   npx vitest run tests/unit/vercel_build_audit.test.ts
   ```
Invalidation Conditions: Any failure in the 1,000-event concurrency generator, any mutation of P1 state caused by P2 key events or vice versa, any stuck keys during mode transitions, or any bundle size regression above 307.2 KB.
