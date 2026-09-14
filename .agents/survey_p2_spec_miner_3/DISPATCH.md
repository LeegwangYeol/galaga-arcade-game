## 2026-09-03T03:11:28Z
You are survey_p2_spec_miner_3 (Role: Testing & Cheat Architecture Spec Miner).
Working directory: /Users/user/src/galog/.agents/survey_p2_spec_miner_3/
Project root: /Users/user/src/galog

Your mission is to extract precise testing, verification, and cheat controller specifications for Phase 2:
1. Read /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md, /Users/user/src/galog/COLLABORATION.md, and /Users/user/src/galog/TEST_INFRA.md.
2. Investigate existing test setups:
   - tests/unit/ (existing Vitest unit tests)
   - tests/e2e/ (existing Playwright E2E tests)
   - vite.config.ts, playwright.config.ts, package.json
3. Formulate technical specifications for:
   - `window.__GALAGA_CHEAT__` controller (skipToStage(n), setInvincible(bool), triggerCrisis(type), spawnPowerUp(type), clearEnemies(), etc.).
   - Automated 50-round stress & memory bot (Playwright & Vitest) proving: zero memory leaks, bounded ObjectPool allocations, 0 unhandled JS exceptions, 50-round completion.
   - Individual unit/integration test specifications for each of the 10+ Crisis Events.
   - PowerUp and player upgrade test specifications.
   - 50-round difficulty scaling verification tests.
4. Output your detailed specifications to /Users/user/src/galog/.agents/survey_p2_spec_miner_3/report.md and write /Users/user/src/galog/.agents/survey_p2_spec_miner_3/handoff.md.
5. Notify the orchestrator via send_message when complete.
