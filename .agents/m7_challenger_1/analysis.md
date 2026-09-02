# Milestone 7 Score Persistence & Stat Accuracy Adversarial Analysis Report

**Agent**: `m7_challenger_1` (Score Persistence & Stat Accuracy Challenger)  
**Date**: 2026-09-02  
**Target Milestone**: Milestone 7 (UI/UX, Scoring, LocalStorage & Mobile Controls)  
**Verdict**: `FAIL` (Identified `HUD.decomposeStage(NaN)` edge case returning `NaN` and test suite failure in peer adversarial test suite)

---

## Executive Summary

As the empirical adversarial challenger for Milestone 7 (`ScoreManager`, LocalStorage persistence, multi-leap extra life calculations, and stat accuracy telemetry), we constructed a dedicated 22-test empirical stress test suite (`tests/unit/m7_challenger_1_adversarial.test.ts`).

Our stress test battery probed:
1. **LocalStorage Persistence & Fault Tolerance**: Storage quota exhaustion (`QuotaExceededError`), security restrictions / Private Browsing mode (`SecurityError`), completely corrupted storage strings (`NaN`, negative, invalid JSON, null/undefined window/localStorage), and key fallbacks.
2. **Multi-Leap Extra Life Mechanics**: Single-frame point surges (+150,000 pts and +1,000,000 pts), exact milestone boundary conditions ($20\text{k}, 70\text{k}, 140\text{k}, 210\text{k}$), threshold resets on new game sessions, and non-finite/negative input defense.
3. **Accuracy & Telemetry Statistics**: Division-by-zero defense ($\frac{0}{0}$ with zero shots fired), shots hit $>$ shots fired (piercing laser / multi-hit scenarios), negative/infinite inputs, and Challenging Stage bonus clamping.
4. **Extreme Stage Badges & HUD Layout**: Stage decomposition for stages $>100$, 255, 999, 10000, and $x \ge 96$ crowding clamp protecting reserve lives indicators.

---

## Stress Test Results & Findings

### Test Execution Summary
- `m7_challenger_1_adversarial.test.ts`: **22 passed / 22 total (100% pass rate)**
- Entire project Vitest run: **22 passed test files / 1 failed test file (504 passed tests / 2 failed tests)**

---

### Dimension 1: LocalStorage Persistence & Fault Tolerance
| Test Scenario | Attack Vector | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Storage Quota Exhausted | `localStorage.setItem` throws `QuotaExceededError` | Gracefully fall back to in-memory score tracking, return `false`, no unhandled exception | Caught by `try...catch`, score and high score preserved in-memory | **PASS** |
| Private Mode / Security Restricted | `localStorage.getItem`/`setItem` throws `SecurityError` | Probe `__galaga_storage_probe__` catches error, defaults to in-memory score tracking | In-memory fallback functions smoothly without crashing | **PASS** |
| Corrupted Storage Values | Stored value is `"NaN"`, `"-999999"`, `"CORRUPTED_STRING"`, `"[object Object]"`, `"null"` | `loadHighScore()` parses safely with `parseInt` + `isFinite` + non-negative check; defaults to 20,000 | Safely clamped to $\ge 20,000$ default | **PASS** |
| Fallback Storage Key | Custom key is absent but legacy `galaga_high_score` exists | Automatically query legacy key and load high score | Successfully loaded legacy high score | **PASS** |
| Headless / SSR Environment | `window` and `localStorage` are `undefined` | No reference errors; `getStorage()` returns `null` | Operates in-memory safely | **PASS** |

---

### Dimension 2: Extra Life Multi-Leap Calculations
| Test Scenario | Attack Vector | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Single-Frame +150,000 pts Leap | Add 150,000 pts at once from 0 pts | Award 3 extra lives ($20\text{k}, 70\text{k}, 140\text{k}$); `lives` becomes $3+3=6$; next threshold $210\text{k}$ | `extraLivesAwarded = 3`, `lives = 6`, `nextThreshold = 210000`, single callback with `3` | **PASS** |
| Massive +1,000,000 pts Leap | Add 1,000,000 pts at once from 0 pts | Award 15 extra lives ($20\text{k}, 70\text{k}, 140\text{k} \dots 980\text{k}$); `lives` becomes $3+15=18$ | `extraLivesAwarded = 15`, `lives = 18`, `nextThreshold = 1050000` | **PASS** |
| Exact Milestone Boundaries | Test $19,999 \to 20,000$, $69,999 \to 70,000$, $139,999 \to 140,000$ | Extra life awarded on exact threshold hit, never 1 point early | Exact boundary precision verified | **PASS** |
| Non-Finite / Negative Score Input | `addScore(-500)`, `addScore(NaN)`, `addScore(Infinity)` | Sanitized; 0 added score, no mutation of score or lives | Returned `addedScore: 0`, score unchanged | **PASS** |
| State Reset Lifecycle | Score 85,000 (5 lives) $\to$ `reset(3, 1)` | Score reset to 0, lives to 3, threshold index to 0, high score preserved at 85,000 | High score preserved, 20k threshold re-activates for new game | **PASS** |

---

### Dimension 3: Telemetry, Accuracy Stats & Challenging Stage
| Test Scenario | Attack Vector | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Zero Shots Fired ($\frac{0}{0}$) | `shotsFired = 0`, `shotsHit = 0` | `getAccuracy() === 0`, `getAccuracyPercentage() === 0`, `getFormattedAccuracy() === "0.0%"` (no `NaN`) | Zero division guarded; returns `0.0%` cleanly | **PASS** |
| Shots Hit $>$ Shots Fired | `shotsFired = 10`, `shotsHit = 25` (piercing laser multi-kill) | No crash; accuracy ratio $2.5$, percentage $250.0\%$ | `accuracyRatio = 2.5`, `formattedAccuracy = "250.0%"` | **PASS** |
| Invalid Telemetry Inputs | Negative / NaN / Infinite counts to `recordShotFired` / `recordShotHit` | Defensively ignored | Fired / Hit counts remain unchanged | **PASS** |
| Challenging Hits Clamping | Hits $< 0$ or $> 40$ | Clamped to $[0 \dots 40]$; 40 awards 10,000 pts perfect bonus; 39 awards 3,900 pts | Clamping verified | **PASS** |

---

### Dimension 4: Extreme Stage Badges & HUD Rendering Defenses
| Test Scenario | Attack Vector | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Extreme Stages ($>100, 255, 999$) | Decompose stage 101, 150, 255, 999 | Exact greedy decomposition (e.g. 255 $\to$ 5x50 + 1x5; 999 $\to$ 19x50 + ...) | Decomposes accurately | **PASS** |
| Crowding Clamp ($X \ge 96$) | Render badges for stage 999 (26+ badges) | Badges drawn right-to-left terminate at $X < 96$ to protect reserve lives | Verified all drawn badge coordinates have $X \ge 96$ | **PASS** |
| `decomposeStage(NaN)` Input | Pass `NaN` to `HUD.decomposeStage(NaN)` | Return `stage: 1` as defensive fallback | **BUG FOUND**: `Math.max(1, Math.floor(NaN))` evaluates to `NaN` in JavaScript, returning `{ stage: NaN }` | **FAIL** |
| Peer Test Mock Incompleteness | Peer test renders title screen with incomplete `mockCtx` | `SpriteRenderer.draw` calls `ctx.translate` on scaled sprites | `TypeError: ctx.translate is not a function` in peer test suite | **FAIL** |

---

## Detailed Root Cause Analysis for Failures

### 1. `HUD.decomposeStage(NaN)` Evaluation Bug
- **Location**: `src/ui/HUD.ts`, line 495:
  ```ts
  public static decomposeStage(stage: number): BadgeDecomposition {
    const safeStage = Math.max(1, Math.floor(stage));
    let rem = safeStage;
    ...
  ```
- **Mechanism**: In JavaScript, `Math.floor(NaN)` evaluates to `NaN`. `Math.max(1, NaN)` returns `NaN` (any comparison with `NaN` in `Math.max` yields `NaN`).
- **Consequence**: `safeStage` is assigned `NaN`, and `HUD.decomposeStage(NaN).stage` returns `NaN` instead of defaulting to `1`.
- **Recommended Remediation**:
  ```ts
  const safeStage = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
  ```

### 2. Peer Test Suite Mock Incompleteness
- **Location**: `tests/unit/m7_challenger_2_adversarial.test.ts`, lines 456-464.
- **Mechanism**: `mockCtx` supplied to `Screens.renderTitleScreen` lacked `translate`, `rotate`, and `scale` mock methods. `Screens.renderPointTable` invokes `SpriteRenderer.draw(ctx, 'DUAL_FIGHTER', ..., { scale: 0.65 })`, which uses the transformed drawing path (`ctx.translate`, `ctx.scale`).
- **Recommended Remediation**: Update `mockCtx` in `tests/unit/m7_challenger_2_adversarial.test.ts` to include `translate: vi.fn()`, `rotate: vi.fn()`, `scale: vi.fn()`.

---

## Verdict & Recommendation

- **Verdict**: `FAIL`
- **Reason**:
  1. `HUD.decomposeStage(NaN)` produces `NaN` instead of fallback stage `1`.
  2. Total project test suite execution (`npm test`) fails with 2 test failures out of 506 tests across 23 test files.
- **Action**: Pass findings to fix worker to patch `HUD.ts` line 495 and update mock context in `m7_challenger_2_adversarial.test.ts`.
