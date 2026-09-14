# Handoff Report — survey_p2_spec_miner_3

- **Agent**: `survey_p2_spec_miner_3` (Testing & Cheat Architecture Spec Miner)
- **Role**: Specification Miner for Phase 2 Testing, Verification & Cheat Architecture
- **Date**: 2026-09-03T03:16:30Z
- **Working Directory**: `/Users/user/src/galog/.agents/survey_p2_spec_miner_3/`
- **Output Artifact**: `/Users/user/src/galog/.agents/survey_p2_spec_miner_3/report.md`
- **Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **User Requirements & Acceptance Criteria (`ORIGINAL_REQUEST.md`)**:
   - Line 45: *"기존에 완성된 갤로그(Galaga) 게임의 볼륨을 대폭 확장하여 최대 50라운드(스테이지)까지 진행되도록 스케일링하고, 10라운드 이후부터 스텔라리스(Stellaris) 게임에 영감을 받은 10가지 이상의 랜덤 '위기 상황(Crisis Events)'을 추가합니다."*
   - Line 68: *"[ ] 50라운드까지 강제로 스테이지를 스킵하며 테스트하는 치트 스크립트 또는 E2E 봇을 작성하여 50라운드 구동 시에도 메모리 누수나 크래시가 발생하지 않음을 증명해야 합니다."*
   - Line 69: *"[ ] 10개의 위기 상황 로직이 각각 정상적으로 발동되는지 확인하는 개별 유닛/통합 테스트가 작성되고 통과해야 합니다."*
   - Line 72: *"[ ] 코드 내에 하드코딩된 위기 상황의 종류가 최소 10가지 이상 명확하게 정의된 배열이나 팩토리 패턴이 존재해야 합니다."*

2. **Phase 2 Expansion Scope & Specifications (`COLLABORATION.md`)**:
   - Lines 39–64: Enumerate 11 distinct crisis events: The Contingency, The Unbidden, The Prethoryn Scourge, Shield Overload, Physics Inversion / Gravity Flip, Hyperspace Storm, Nanite Cloud / Gray Tempest, Psionic Resonance / Shroud Breach, Devouring Swarm Frenzy, Nemesis Star-Eater Ignition, Time Dilation Field.
   - Lines 65–73: Enumerate 5 player power-up upgrades: Rapid Fire (Overclock), Kinetic Deflector (Shield), Scatter / Triple Shot (Multi-Blaster), EMP Bomb (Screen Clear), Engine Booster (Hyper Drive), plus Rescue Dual Fighter Integration.
   - Lines 83–86: Requirement for `window.__GALAGA_CHEAT__` allowing `skipToStage(n)`, invincibility, and automated 50-round stress bot proving zero memory leaks and clean heap allocation.

3. **Current Codebase State**:
   - `src/main.ts:135-154`: Exposes `getGame()`, `getCanvas()`, `getCanvasContext()`, `getViewportTransform()`. Does not yet expose `window.__GALAGA_CHEAT__`.
   - `src/core/ObjectPool.ts:25-218`: Implements zero-allocation contiguous buffer with `initialSize`, `maxSize`, `autoExpand`, `acquire()`, `release()`, `clear()`, `drain()`, `getActiveCount()`, `getFreeCount()`, `getCapacity()`.
   - `src/entities/Bullet.ts:50-52`: Configures `POOL_INITIAL_SIZE: 32`, `POOL_MAX_SIZE: 128`.
   - `src/systems/ParticleSystem.ts:1-25`: Configures particle pool capacity $\le 256$.
   - `src/ui/HUD.ts:37-60` and lines 484–522: `BadgeType` enum already defines `FLAG_50`, `FLAG_30`, `FLAG_20`, `FLAG_10`, `FLAG_5`, `FLAG_1`, and `HUD.decomposeStage(stage)` implements greedy decomposition.
   - `src/core/Game.ts:480-482`: `isChallengingStage(stage)` defined as `stageNum >= 3 && stageNum % 4 === 3`.
   - Baseline test execution: `npm test` passed 26 test files and 546 unit tests in 14.17s with 0 errors.

---

## 2. Logic Chain

1. **Why `window.__GALAGA_CHEAT__` is Essential**:
   In Phase 1, automated tests simulated user inputs or interacted with internal classes. To test 50 rounds and 11 crisis events end-to-end in real browser environments without playing manually for hours, an authoritative runtime controller (`window.__GALAGA_CHEAT__`) is mandatory. It must support `skipToStage(stage)`, `setInvincible(bool)`, `triggerCrisis(type)`, `clearCrisis()`, `spawnPowerUp(type, x, y)`, `clearEnemies()`, and diagnostic getters (`getGameState()`, `getPoolStats()`).

2. **Why Memory Leak Proving Requires a Multi-Layered Metric Approach**:
   A single test cannot prove "zero memory leaks" reliably due to garbage collector indeterminism. The specification establishes:
   - **Playwright CDP Heap Metrics**: Measuring `JSHeapUsedSize` at stages 1, 10, 25, 50 with forced GC. Net heap increase must stay $< 8.0\text{ MB}$.
   - **DOM & Listener Stability**: Canvas element count strictly 1, 0 leaked DOM elements, constant event listener count.
   - **ObjectPool Allocation Bounding**: Bullet pool $\le 128$, Particle pool $\le 256$, PowerUp pool $\le 32$. Capacity must never grow beyond `maxSize`.
   - **Orphaned Entity Checks**: Active items must drain to 0 between stage clears.
   - **Vitest Rapid Simulation**: 50-round hop executing 15,000+ physics ticks in ~5s verifying zero reference accumulation.

3. **Crisis Event Verification Architecture**:
   The 11 crisis events alter disparate game subsystems (physics, bullets, input, rendering, audio). The specification requires a standardized 5-phase lifecycle test for each: Factory Registration $\to$ Alert Dispatch $\to$ Mechanical Modifier $\to$ Combat Collision $\to$ Teardown Cleanliness.

4. **PowerUp & Player Upgrade Verification Architecture**:
   Power-ups must lease entities from an `ObjectPool<PowerUp>` (max 32). Tests must verify single fighter acquisition, duration expiration, boundary clamping, and critical Dual Fighter stacking (dual shields, quad streams, twin 3-way scatter, asymmetric hull loss).

5. **50-Round Difficulty Scaling Verification**:
   Difficulty curves must be verified via mathematical invariant tests across all 50 stages:
   - HP curves: Stages 1–10 (Classic), Stages 11–25 (Elite +1 HP), Stages 26–50 (Dreadnought + shields).
   - Diving speed multiplier: $1.0\times \to 1.8\times$ (smooth monotonic scale).
   - Dive interval: $3.5\text{s} \to 0.8\text{s}$.
   - Challenging stages: Stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47 (0 bullets, no deaths, 40 hits perfect bonus).
   - Greedy stage badges: $\sum \text{badges} = \text{stage}$ for all stages $1 \dots 50$, total width $< 128\text{px}$ preserving reserve lives area.

---

## 3. Caveats

1. **Browser Engine Memory Measurement Differences**:
   `Performance.getMetrics` and `performance.memory` are Chromium-specific APIs. In WebKit and Firefox E2E runs, memory verification relies on DOM node constancy, ObjectPool invariant checks, and 0 uncaught exception monitoring.
2. **Headless Audio Context**:
   In headless environments, Web Audio API runs with muted hardware audio contexts. Audio event tests verify procedural synthesis buffer generation and frequency/gain node connections rather than acoustic speaker output.
3. **Read-Only Discovery**:
   As a specification miner, no game implementation code was modified in this turn. All findings and technical designs are persisted in `report.md` awaiting user authorization (`내용확인` / `진행해`).

---

## 4. Conclusion

The testing, verification, and cheat controller architecture for Galaga Phase 2 is fully specified and documented in `/Users/user/src/galog/.agents/survey_p2_spec_miner_3/report.md`.
The specification provides complete interface contracts, failure thresholds, mathematical scaling invariants, and test algorithms ready for implementation by the swarm upon authorization.

---

## 5. Verification Method

1. **Verify Baseline Test Health**:
   ```bash
   npm test
   ```
   *Expected outcome*: 26 test files, 546 tests pass with 0 errors.

2. **Inspect Specification Report**:
   ```bash
   cat /Users/user/src/galog/.agents/survey_p2_spec_miner_3/report.md
   ```
   *Check items*: Verify Features Discovered Table, Edge Cases Table, `GalagaCheatController` interface, 50-round memory bot algorithm, 11 crisis test specs, 5 power-up specs, and 50-round scaling formulas.
