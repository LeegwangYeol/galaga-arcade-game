# Milestone M28: Modernized Bottom HUD & Dashboard Panel — Forensic Audit Report

- **Auditor**: `m28_auditor_1` (Forensic Integrity Auditor)
- **Date**: 2026-09-11T17:18:00+09:00 (UTC 2026-09-11T08:18:00Z)
- **Integrity Mode**: `development` (per `ORIGINAL_REQUEST.md`)
- **Verdict**: 🛑 **INTEGRITY VIOLATION** (Work product REJECTED due to test execution failures, special move energy cue freeze defect, TypeScript typecheck failures, and dual-workspace desynchronization)

---

## Forensic Audit Report Summary

**Work Product**: Milestone M28: Modernized Bottom HUD & Cyber-Arcade Dashboard Panel (`src/ui/BottomDashboard.ts`, `src/core/Game.ts`, `index.html`, `tests/unit/bottom_dashboard.test.ts`)  
**Profile**: General Project (Integrity Forensics)  
**Verdict**: **INTEGRITY VIOLATION**

### Phase Results
- **Static Analysis & Authenticity**: PASS — `src/ui/BottomDashboard.ts` implements genuine DOM manipulation, three-zone arcade cabinet layout, procedural SVG ship icon rendering, zero-allocation pre-allocated chip pools, and bound event listener cleanup. No hardcoded test results, dummy facades, or fake return values exist.
- **Asset Autonomy (Zero External Assets)**: PASS — 0 external PNG, JPG, WEBP, MP3, WAV, or SVG files introduced. 100% Canvas 2D and Web Audio API procedural synthesis.
- **Test Bypass / Skip Detection**: PASS — 0 skipped tests (`it.skip`, `describe.skip`, `test.skip`, `xit`, `xdescribe`, `xtest`) across all test suites in `tests/`.
- **Pre-populated Artifact Detection**: PASS — 0 fabricated attestation or result artifacts found.
- **Worker Unit Test Suite (`npx vitest run tests/unit/bottom_dashboard.test.ts`)**: PASS — 30/30 unit tests passed (100%).
- **TypeScript Typecheck (`npx tsc --noEmit`)**: 🔴 **FAIL** — Exited with code 2 due to TypeScript compilation errors in adversarial test files (`tests/unit/m28_challenger_1_adversarial.test.ts` and `tests/unit/m28_challenger_2_adversarial.test.ts`).
- **Full Test Suite Execution (`npm test`)**: 🔴 **FAIL** — Exited with code 1 due to 1 test failure in `tests/unit/m28_challenger_1_adversarial.test.ts` caused by a genuine functional bug in `src/ui/BottomDashboard.ts:676-697`.
- **Production Build (`npm run build`)**: 🔴 **FAIL** — Failed at `tsc --noEmit` pre-build step.
- **Dual Workspace Parity**: 🔴 **FAIL** — Asymmetry detected: `tests/unit/m28_challenger_2_adversarial.test.ts` exists only in `/Users/user/teamwork_projects/galaga_game` and is missing in `/Users/user/src/galog`.

---

## 1. Observation

### 1.1 Verbatim Defect in Production Source Code (`src/ui/BottomDashboard.ts`)
In `src/ui/BottomDashboard.ts` lines 660–697:
```typescript
660:     const energyInt = Math.floor(clampedEnergy);
661: 
662:     if (energyInt !== this._lastSpecialEnergyInt) {
663:       if (this.elSpecialFill) {
664:         this.elSpecialFill.style.width = `${energyInt}%`;
665:       }
666:       if (this.elSpecialTrack) {
667:         this.elSpecialTrack.setAttribute('aria-valuenow', energyInt.toString());
668:       }
669:       this._lastSpecialEnergyInt = energyInt;
670:     }
671: 
672:     // 5. Special Ready & Move Name
673:     const isReady = telemetry.isSpecialReady ?? telemetry.specialReady ?? (energyInt >= 100);
674:     const moveName = telemetry.selectedSpecial || 'SP';
675: 
676:     if (isReady !== this._lastIsSpecialReady || moveName !== this._lastSpecialMove) {
677:       if (this.elSpecialContainer) {
678:         this.elSpecialContainer.classList.toggle('special-ready', isReady);
679:       }
680:       if (this.elSpecialFill) {
681:         this.elSpecialFill.classList.toggle('special-ready-bar', isReady);
682:       }
683:       if (this.elSpecialCue) {
684:         if (isReady) {
685:           this.elSpecialCue.textContent = 'READY [X]';
686:           this.elSpecialCue.className = 'special-cue special-ready-cue';
687:         } else {
688:           this.elSpecialCue.textContent = `${energyInt}%`;
689:           this.elSpecialCue.className = 'special-cue text-white';
690:         }
691:       }
692:       if (this.elSpecialName && moveName !== this._lastSpecialMove) {
693:         this.elSpecialName.textContent = this.formatSpecialMoveShort(moveName);
694:         this._lastSpecialMove = moveName;
695:       }
696:       this._lastIsSpecialReady = isReady;
697:     }
```
**Mechanism of Failure**:
- Line 688 (`this.elSpecialCue.textContent = `${energyInt}%``) is nested strictly inside the guard `if (isReady !== this._lastIsSpecialReady || moveName !== this._lastSpecialMove)`.
- During active combat as `specialEnergy` increases (e.g. 0% -> 25% -> 50% -> 99%), `isReady` remains `false` throughout the charge phase, and `moveName` remains `'SP'`.
- Consequently, `isReady !== this._lastIsSpecialReady` evaluates to `false !== false` (`false`), and `moveName !== this._lastSpecialMove` evaluates to `false`.
- The branch is never entered, leaving `this.elSpecialCue.textContent` frozen at `'0%'` (or its initial text) throughout the entire charge sequence until energy hits 100%.

### 1.2 Verbatim Test Failure (`npm test`)
Running `npx vitest run tests/unit/m28_challenger_1_adversarial.test.ts` yields:
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/m28_challenger_1_adversarial.test.ts > Milestone M28: Adversarial Challenger Test Suite (m28_challenger_1) > Track 2: High-Frequency State Whiplash & Fuzzing > fluctuates special energy (0% -> 99% -> 100% -> 0%) asserting atomic ready-class and cue synchronization
AssertionError: expected '0%' to be '99%' // Object.is equality

Expected: "99%"
Received: "0%"

 ❯ tests/unit/m28_challenger_1_adversarial.test.ts:568:42
    566|           expect(specialCue.classList.contains('special-ready-cue')).toBe(false);
    567|         } else {
    568|           expect(specialCue.textContent).toBe(`${energy}%`);
       |                                          ^
    569|           expect(specialCue.classList.contains('text-white')).toBe(true);
    570|         }

 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
   Duration  420ms
```

### 1.3 Verbatim TypeScript Errors (`npx tsc --noEmit`)
Running `npx tsc --noEmit` yields exit code 2:
```
tests/unit/m28_challenger_1_adversarial.test.ts(22,8): error TS6133: 'ActivePowerUpTelemetry' is declared but its value is never read.
tests/unit/m28_challenger_1_adversarial.test.ts(532,11): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
tests/unit/m28_challenger_1_adversarial.test.ts(560,25): error TS18048: 'energy' is possibly 'undefined'.
tests/unit/m28_challenger_1_adversarial.test.ts(825,13): error TS6133: 'muteListenersLog' is declared but its value is never read.
tests/unit/m28_challenger_1_adversarial.test.ts(826,13): error TS6133: 'fullListenersLog' is declared but its value is never read.
tests/unit/m28_challenger_1_adversarial.test.ts(827,13): error TS6133: 'pauseListenersLog' is declared but its value is never read.
tests/unit/m28_challenger_1_adversarial.test.ts(869,25): error TS2352: Conversion of type 'Element | null | undefined' to type 'AdvMockElement' may be a mistake...
tests/unit/m28_challenger_2_adversarial.test.ts(16,8): error TS6133: 'DashboardTelemetry' is declared but its value is never read.
tests/unit/m28_challenger_2_adversarial.test.ts(17,8): error TS6133: 'PowerUpChipTelemetry' is declared but its value is never read.
tests/unit/m28_challenger_2_adversarial.test.ts(78,11): error TS6133: '_className' is declared but its value is never read.
tests/unit/m28_challenger_2_adversarial.test.ts(305,33): error TS2345: Argument of type '{ type: string; preventDefault: Mock<Procedure>; }' is not assignable to parameter of type 'Event'.
tests/unit/m28_challenger_2_adversarial.test.ts(399,49): error TS2353: Object literal may only specify known properties, and 'targetElement' does not exist in type 'FullscreenManagerOptions'.
tests/unit/m28_challenger_2_adversarial.test.ts(750,35): error TS2345: Property 'highScore' is missing in type '{ score: number; lives: number; }' but required in type 'DashboardTelemetry'.
tests/unit/m28_challenger_2_adversarial.test.ts(794,32): error TS2345: Type '{ lives: number; }' is missing properties from type 'DashboardTelemetry': score, highScore
```

### 1.4 Dual Workspace Parity Check
```bash
python3 -c "import os; print('M28 Challenger 2 in galog:', os.path.exists('/Users/user/src/galog/tests/unit/m28_challenger_2_adversarial.test.ts'))"
# Output: False
```

---

## 2. Logic Chain

1. **Mandate Requirement**: The audit assignment strictly mandates:
   - `npx tsc --noEmit` must pass with 0 errors.
   - `npm test` must verify all test files pass 100%.
   - `npm run build` must build cleanly.
   - 100% bitwise parity between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog`.
2. **Empirical Verification Findings**:
   - `npx tsc --noEmit` failed with exit code 2.
   - `npm test` failed with exit code 1 on `tests/unit/m28_challenger_1_adversarial.test.ts`.
   - `npm run build` failed due to typecheck errors.
   - Workspace parity check failed due to missing `m28_challenger_2_adversarial.test.ts` in `/Users/user/src/galog`.
3. **Trace of In-Game Functional Bug**:
   - In `BottomDashboard.ts`, line 662 checks `if (energyInt !== this._lastSpecialEnergyInt)` to update the fill width of `elSpecialFill`.
   - However, the numeric percentage text `elSpecialCue.textContent = `${energyInt}%`` is placed under line 676's condition `if (isReady !== this._lastIsSpecialReady || moveName !== this._lastSpecialMove)`.
   - Because `isReady` does not toggle when energy increases between 0% and 99%, the dashboard UI display fails to reflect energy accumulation, misleading the player.
4. **Policy Enforcement**:
   - "Block on failure: If ANY check fails, the verdict is INTEGRITY VIOLATION and the work product must be rejected."
   - "Audit-only — do NOT modify implementation code. Report any failures as findings — do NOT fix them yourself."
5. **Conclusion**:
   - The work product must be rejected with verdict **`INTEGRITY VIOLATION`**.

---

## 3. Caveats

1. **Authenticity of Implementation**: The core architecture of `BottomDashboard.ts` is authentic, zero-GC compliant, and genuinely designed. The bug is a logic placement defect rather than a deliberate facade.
2. **Remediation Plan**:
   - In `src/ui/BottomDashboard.ts`:
     When `energyInt !== this._lastSpecialEnergyInt`, if `!isReady`, update `this.elSpecialCue.textContent = `${energyInt}%`` (or restructure lines 662–697 so `elSpecialCue` reflects current `energyInt` whenever `energyInt !== _lastSpecialEnergyInt` and not ready).
   - In `tests/unit/m28_challenger_1_adversarial.test.ts` & `tests/unit/m28_challenger_2_adversarial.test.ts`:
     Fix TypeScript type annotations, unused variables, and mock event signatures.
   - Mirror all fixed files to `/Users/user/src/galog/` to restore 100% bitwise parity.

---

## 4. Conclusion

- **Definitive Verdict**: 🛑 **`INTEGRITY VIOLATION`**
- **Action Required**: Milestone M28 is **REJECTED**. Dispatch a Remediation Worker (`m28_rem_worker`) to:
  1. Fix the special energy cue text update in `src/ui/BottomDashboard.ts`.
  2. Fix TypeScript type errors in `tests/unit/m28_challenger_1_adversarial.test.ts` and `tests/unit/m28_challenger_2_adversarial.test.ts`.
  3. Ensure 100% bitwise parity across both workspaces.
  4. Dispatch remediation verification cohort (`m28_rem_auditor_1`).

---

## 5. Verification Method

To independently reproduce and verify this audit:

1. **Run TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   *Current Result*: Exits with code 2 (compilation errors in challenger tests).

2. **Run Challenger 1 Adversarial Suite**:
   ```bash
   npx vitest run tests/unit/m28_challenger_1_adversarial.test.ts
   ```
   *Current Result*: Fails with `AssertionError: expected '0%' to be '99%'`.

3. **Check Workspace Parity**:
   ```bash
   test -f /Users/user/src/galog/tests/unit/m28_challenger_2_adversarial.test.ts && echo "EXISTS" || echo "MISSING"
   ```
   *Current Result*: `MISSING`.
