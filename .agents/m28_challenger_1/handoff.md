# Milestone M28: Adversarial Challenger 1 (Telemetry Stress & Zero-GC Verifier) — Handoff Report

- **Agent**: `m28_challenger_1` (Telemetry Stress & Zero-GC Verifier)
- **Role**: critic, specialist
- **Date**: 2026-09-11T08:18:00Z
- **Target Component**: `src/ui/BottomDashboard.ts`, `src/core/Game.ts`, and Milestone M28 Deliverables
- **Verdict**: ❌ **`REQUEST_CHANGES`** (Defect discovered in Special Move cue percentage telemetry synchronization)

---

## 1. Observation

### 1.1 Adversarial Test Suite Execution (`tests/unit/m28_challenger_1_adversarial.test.ts`)
Created and executed an adversarial test suite of 15 stress tests across the 4 required tracks in `tests/unit/m28_challenger_1_adversarial.test.ts`:

1. **Track 1 (Zero-GC Dirty Checking)**:
   - Dispatched 10,000 simulated 60 FPS frames with identical baseline telemetry (approx 166 seconds of gameplay). Asserted that after frame 1, all DOM mutations (`textContentSetters`, `styleMutations`, `classListMutations`, `attributeWrites`, `treeMutations`) remain strictly **ZERO** (**PASS**).
   - Dispatched 10,000 simulated frames with 3 active power-up chips with unchanging telemetry. Asserted that chip progress bars, borders, and rack have strictly **ZERO** DOM writes after frame 1 (**PASS**).
   - Verified frame-by-frame dirty-checking granularity: changing only score triggers exactly 1 textContent write; changing only energy triggers 1 style mutation and 1 attribute write; reducing lives by 1 triggers exactly 1 tree removal (**PASS**).

2. **Track 2 (High-Frequency State Whiplash & Fuzzing)**:
   - Rapid score alternation between 0 and 999,990 across 3,000 ticks: 0 desync, 0 NaN (**PASS**).
   - Lives whiplash (5 -> 0 -> 5 -> 1 -> 4 -> 0 -> 2 -> 3) across 2,400 ticks: child element count exactly matches clamped lives, 100% SVG ship icon preservation (**PASS**).
   - Tactical action buttons fuzzing (isMuted, isFullscreen, isPaused alternating across 1,500 ticks): icons and ARIA labels stay synchronized (**PASS**).
   - Extreme adversarial inputs (NaN, negative numbers, Infinity, empty objects): clamped robustly with zero exceptions (**PASS**).
   - **Special Energy Fluctuation across 2,400 rapid ticks (0% -> 99% -> 100% -> 0%)**: **FAILED** with an AssertionError:
     ```
     FAIL tests/unit/m28_challenger_1_adversarial.test.ts > Milestone M28: Adversarial Challenger Test Suite (m28_challenger_1) > Track 2: High-Frequency State Whiplash & Fuzzing > fluctuates special energy (0% -> 99% -> 100% -> 0%) asserting atomic ready-class and cue synchronization
     AssertionError: expected '0%' to be '99%' // Object.is equality

     Expected: "99%"
     Received: "0%"

      ❯ tests/unit/m28_challenger_1_adversarial.test.ts:568:42
         566|           expect(specialCue.classList.contains('special-ready-cue')).toBe(true);
         567|         } else {
         568|           expect(specialCue.textContent).toBe(`${energy}%`);
            |                                          ^
         569|           expect(specialCue.classList.contains('text-white')).toBe(true);
         570|         }
     ```

3. **Track 3 (Power-Up Churn Saturation)**:
   - Simultaneous activation of all 9 power-up items (`RAPID_FIRE`, `KINETIC_SHIELD`, `SCATTER_SHOT`, `ENGINE_BOOSTER`, `CHRONO_FIELD`, `REFLECTION_SHIELD`, `EMP_COLLECTOR`, `PHASE_DRIVE`, `ANTIMATTER_PLASMA`): all 9 chips mount with exact 2-3 letter codes (`RF`, `SHD`, `SCT`, `SPD`, `CF`, `RFL`, `EMP`, `PHS`, `PLS`), correct configured color palettes, and 100% width (**PASS**).
   - Staggered countdown (durations 1s to 9s in 0.5s intervals): chips reflect accurate duration percentage width and unmount **immediately** on the exact tick duration expires (**PASS**).
   - Rapid churn across 1,000 frames of random activation and expiration: mounted count strictly equals active count, zero duplicate or orphaned chips (**PASS**).
   - Custom power-up types: gracefully derives 3-letter uppercase code and custom color (**PASS**).

4. **Track 4 (Memory & Teardown Leak)**:
   - Consecutively mounted, updated, clicked action buttons, and destroyed 50 `BottomDashboard` instances:
     - Button click listeners cleanly removed (`getListenerCount('click') === 0`) (**PASS**).
     - Root element detached from container (`mockContainer.children.length === 0`) (**PASS**).
     - `dashboard.getElement()` returns null (**PASS**).
   - Idempotent teardown: 10 consecutive `destroy()` calls do not throw (**PASS**).
   - 51st instance cleanly mounts and operates with zero residual crosstalk (**PASS**).

### 1.2 Independent Corroboration from Peer Challenger (`m28_challenger_2`)
Running `npm test` across the full repository test suite revealed that peer challenger `m28_challenger_2` independently identified the identical failure in their fuzzing track:
```
 FAIL  tests/unit/m28_challenger_2_adversarial.test.ts > Milestone M28: Adversarial Challenger 2 Stress Suite > Track 3: Adversarial Telemetry Inputs & Fuzzing > sanitizes special move charge and energy gauge anomalies
AssertionError: expected '0%' to be '42%' // Object.is equality

Expected: "42%"
Received: "0%"

 ❯ tests/unit/m28_challenger_2_adversarial.test.ts:643:38
    641|       dashboard.update({ specialEnergy: 42.7 } as any);
    642|       expect(specialFill.style.width).toBe('42%');
    643|       expect(specialCue.textContent).toBe('42%');
       |                                      ^
    644|     });
```

### 1.3 Code Inspection of Root Cause (`src/ui/BottomDashboard.ts:653-698`)
Direct inspection of `src/ui/BottomDashboard.ts`:
```typescript
653:    // 4. Special Move Charge Gauge
654:    const rawEnergy =
655:      telemetry.specialEnergy !== undefined
656:        ? telemetry.specialEnergy
657:        : telemetry.specialCharge !== undefined
658:        ? telemetry.specialCharge
659:        : 0;
660:    const clampedEnergy = Math.max(0, Math.min(100, isNaN(rawEnergy) ? 0 : rawEnergy));
661:    const energyInt = Math.floor(clampedEnergy);
662:
663:    if (energyInt !== this._lastSpecialEnergyInt) {
664:      if (this.elSpecialFill) {
665:        this.elSpecialFill.style.width = `${energyInt}%`;
666:      }
667:      if (this.elSpecialTrack) {
668:        this.elSpecialTrack.setAttribute('aria-valuenow', energyInt.toString());
669:      }
670:      this._lastSpecialEnergyInt = energyInt;
671:    }
672:
673:    // 5. Special Ready & Move Name
674:    const isReady = telemetry.isSpecialReady ?? telemetry.specialReady ?? (energyInt >= 100);
675:    const moveName = telemetry.selectedSpecial || 'SP';
676:
677:    if (isReady !== this._lastIsSpecialReady || moveName !== this._lastSpecialMove) {
678:      if (this.elSpecialContainer) {
679:        this.elSpecialContainer.classList.toggle('special-ready', isReady);
680:      }
681:      if (this.elSpecialFill) {
682:        this.elSpecialFill.classList.toggle('special-ready-bar', isReady);
683:      }
684:      if (this.elSpecialCue) {
685:        if (isReady) {
686:          this.elSpecialCue.textContent = 'READY [X]';
687:          this.elSpecialCue.className = 'special-cue special-ready-cue';
688:        } else {
689:          this.elSpecialCue.textContent = `${energyInt}%`;
690:          this.elSpecialCue.className = 'special-cue text-white';
691:        }
692:      }
693:      if (this.elSpecialName && moveName !== this._lastSpecialMove) {
694:        this.elSpecialName.textContent = this.formatSpecialMoveShort(moveName);
695:        this._lastSpecialMove = moveName;
696:      }
697:      this._lastIsSpecialReady = isReady;
698:    }
```

---

## 2. Logic Chain

1. **Intended UI Design**:
   - In `BottomDashboard.buildZoneCenter()` (lines 428–431), `this.elSpecialCue` is initialized to `'0%'`.
   - Line 689 specifies: `this.elSpecialCue.textContent = `${energyInt}%`` when `!isReady`.
   - The design intent is clearly for the cue text in the header to display the current charge percentage (e.g. `10%`, `42%`, `99%`) while charging, and switch to `'READY [X]'` when `isReady === true` (energy reaches 100%).

2. **Dirty Checking Flaw**:
   - Line 677 wraps the cue text update inside:
     `if (isReady !== this._lastIsSpecialReady || moveName !== this._lastSpecialMove)`
   - When special energy charges up from 0% to 10%, 42%, 75%, and 99%:
     - `isReady` is `false` initially, and remains `false` across all these values.
     - `moveName` remains `'SP'` (or selected special).
     - Therefore, `isReady !== this._lastIsSpecialReady` evaluates to `false !== false` (i.e. `false`).
     - The entire `if` block (lines 677–698) is completely skipped.
   - Consequently, line 689 is never reached during energy charging.
   - The cue element `this.elSpecialCue.textContent` remains frozen at `'0%'` until `energy` reaches 100% (when `isReady` transitions to `true`).
   - Conversely, if energy drops back down from 100% to 50%, `isReady` transitions to `false`, updating the cue to `'50%'`. Then as energy re-charges from 50% to 99%, the cue remains frozen at `'50%'`.

3. **Impact on Requirements**:
   - Acceptance criteria for Milestone M28 state:
     - *"Track 2 (High-Frequency State Whiplash): Alternating scores, lives whiplash (5 -> 0 -> 5), and fluctuating special energy (0% -> 99% -> 100% -> 0%) across thousands of rapid ticks. Assert no UI desync or exceptions."*
   - Because the charge bar visually widens to 99% while the text cue displays 0%, a conspicuous visual desynchronization occurs.

4. **Review-Only Role Invariant**:
   - As an empirical challenger with role `critic`, we are strictly forbidden from altering production code (`src/ui/BottomDashboard.ts`).
   - Because the bug is empirically reproduced and confirmed in our test suite, we must issue an explicit verdict of `REQUEST_CHANGES` to prompt worker remediation.

---

## 3. Caveats

- **Tracks 1, 3, and 4 Are Impeccable**:
  - The zero-GC dirty checking for identical frames (Track 1) achieves genuine 0 DOM writes over 10,000 frames.
  - The 9-item power-up badge lifecycle and duration countdown (Track 3) unmounts immediately and handles churn cleanly.
  - The teardown lifecycle (Track 4) completely detaches all button click listeners and leaves zero orphaned elements.
- The defect is strictly isolated to the dirty-check guard in `src/ui/BottomDashboard.ts:677-698`.

---

## 4. Conclusion

- **Verdict**: ❌ **`REQUEST_CHANGES`**
- **Action Required for Remediation Worker (`m28_worker` or fix worker)**:
  1. In `src/ui/BottomDashboard.ts`, track a cached string `private _lastSpecialCueText: string = '';`.
  2. In `reset()` and `destroy()`, reset `this._lastSpecialCueText = '';`.
  3. In `update()`, decouple the cue text update from the `isReady` transition check so it dirty-checks `cueText`:
     ```typescript
     // 5. Special Ready & Move Name
     const isReady = telemetry.isSpecialReady ?? telemetry.specialReady ?? (energyInt >= 100);
     const moveName = telemetry.selectedSpecial || 'SP';

     if (isReady !== this._lastIsSpecialReady) {
       if (this.elSpecialContainer) {
         this.elSpecialContainer.classList.toggle('special-ready', isReady);
       }
       if (this.elSpecialFill) {
         this.elSpecialFill.classList.toggle('special-ready-bar', isReady);
       }
       this._lastIsSpecialReady = isReady;
     }

     const cueText = isReady ? 'READY [X]' : `${energyInt}%`;
     if (cueText !== this._lastSpecialCueText) {
       if (this.elSpecialCue) {
         this.elSpecialCue.textContent = cueText;
         this.elSpecialCue.className = isReady ? 'special-cue special-ready-cue' : 'special-cue text-white';
       }
       this._lastSpecialCueText = cueText;
     }

     if (moveName !== this._lastSpecialMove) {
       if (this.elSpecialName) {
         this.elSpecialName.textContent = this.formatSpecialMoveShort(moveName);
       }
       this._lastSpecialMove = moveName;
     }
     ```
  4. In `Track 1` Test 1.3 of `tests/unit/m28_challenger_1_adversarial.test.ts`, ensure that updating energy from 50 to 75 expects 1 textContent setter (for the cue text `75%`).
  5. Mirror updated files to `/Users/user/src/galog/src/ui/BottomDashboard.ts`.
  6. Confirm that `npm test` passes 100% across all 101 test files (1,856+ tests).

---

## 5. Verification Method

To independently reproduce the defect and verify the fix:

1. **Execute Challenger 1 Adversarial Suite (Demonstrating Defect)**:
   ```bash
   npx vitest run tests/unit/m28_challenger_1_adversarial.test.ts
   ```
   *Current Result: 1 failed, 14 passed (AssertionError: expected '0%' to be '99%').*

2. **Execute Full Unit Test Suite**:
   ```bash
   npm test
   ```
   *Current Result: 2 failed files (`m28_challenger_1_adversarial.test.ts` and `m28_challenger_2_adversarial.test.ts`).*

3. **Post-Remediation Verification**:
   ```bash
   npx vitest run tests/unit/m28_challenger_1_adversarial.test.ts
   npm test
   npm run build
   ```
   *Expected Post-Fix: 101/101 test files passed, 100% pass rate, clean Vite build.*
