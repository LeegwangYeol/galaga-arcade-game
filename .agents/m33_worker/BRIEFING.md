# BRIEFING — 2026-09-14T10:06:27Z

## Mission
Core implementation of Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/galog/.agents/m33_worker
- Original parent: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Milestone: M33

## 🔒 Key Constraints
- Co-op Dynamic Scaling Engine (+50% Boss Galaga HP, +60% Stage Bosses HP, +25% wave aggression & bullet density, Challenging stage immunity).
- Cooperative Revive & Life Sharing System ('revive_pending', 10s emergency timer, 'eliminated', donor > 1 life, KeyL / Period / NumpadDecimal donate, shared game over invariant, stage-clear pity revive).
- Tactical Co-op Tractor Beam Rescue (originalOwnerId, proximity targeting, mid-capture cancel, diving rescue +1000 pts bonus, dual docking or revive, turncoat divergence on formation kill).
- Preserve 100% of existing tests (2,089+ passing).
- Zero-GC and Zero External Media Assets invariants.

## Current Parent
- Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Updated: 2026-09-14T10:06:27Z

## Task Summary
- **What to build**: Full M33 Co-op balance, dynamic scaling, revive/life sharing, tractor beam rescue, and test suite.
- **Success criteria**: All 116+ test files pass, tsc --noEmit passes, vite build passes.
- **Interface contracts**: SCOPE.md & Explorer 1, 2, 3 reports.
- **Code layout**: src/types/, src/systems/, src/core/, src/entities/, src/ui/, tests/unit/

## Change Tracker
- **Files modified**:
  - `src/types/index.ts`: added PlayerStateType, PlayerState, PlayerReviveTelemetry, DualReviveStatus, CoopScalingConfig
  - `src/systems/DifficultyCalculator.ts`: added co-op HP scaling (+50% Boss Galaga, +60% Stage Bosses), +25% divers, bullet density, challenging immunity
  - `src/core/boss/BossFactory.ts`: integrated isCoop +60% HP scaling into boss creation
  - `src/systems/FormationManager.ts`: added selectTractorBeamTarget proximity & dual immunity, coop bullet density +25%, isCoop config
  - `src/entities/Enemy.ts`: added originalOwnerId field and reset handling
  - `src/entities/Player.ts`: added reviveTimer, updateRevivePending, startRevivePending, revive beacon rendering & badge
  - `src/systems/PlayerManager.ts`: added canDonateLife, donateLife, isAnyPlayerReviving, areAllPlayersDead, onStageClear pity revive
  - `src/ui/InputHandler.ts`: added p1DonateTriggered, p2DonateTriggered, KeyL/Period/NumpadDecimal/KeyO key mapping, consumeAction('donateLife')
  - `src/core/Game.ts`: integrated FormationManager co-op config, donateLife inputs, shared Game Over check, rescue flow with dual docking/revive, turncoat divergence
  - `src/audio/SoundSynth.ts`: added procedural playReviveEmergencyBeacon and playLifeDonatedChime
  - `src/systems/ParticleSystem.ts`: added spawnReviveSparkles
  - `tests/unit/m33_coop_balance_revive.test.ts`: comprehensive 20-test verification suite covering all 6 M33 tracks
- **Build status**: 100% PASSING (`npx tsc --noEmit`, `npm test` [116 test files, 2,109 tests], `npm run build`)
- **Pending issues**: None

## Quality Status
- **Build/test result**: 116/116 test files passing, 2,109/2,109 tests passing (0 failures, 0 regressions)
- **Lint status**: 0 errors
- **Tests added/modified**: `tests/unit/m33_coop_balance_revive.test.ts` (20 new tests)

## Loaded Skills
- None

