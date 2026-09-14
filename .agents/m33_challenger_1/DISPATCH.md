## 2026-09-14T10:22:12Z

<USER_REQUEST>
You are m33_challenger_1, an adversarial empirical verifier for Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m33_challenger_1
- Identity: m33_challenger_1
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Phase 6: Local 2-Player Co-op Multiplayer Mode, M33)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Worker Handoff: /Users/user/src/galog/.agents/m33_worker/handoff.md

# Mission & Focus: Adversarial Dynamic Scaling & Stress Testing
Write and execute an adversarial stress test suite in `tests/unit/adversarial_m33_scaling.test.ts`:
1. **Full 50-Stage Scaling Validation**:
   - Loop through Stages 1 to 50 in co-op mode (`isCoop = true`):
     - Assert all 12 Challenging Stages (3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47) strictly have `health === 1`, `shield === 0`, and 0 bullets fired.
     - Assert Classic non-bonus stages (1, 2, 4, 5, 6, 8, 9, 10) have Boss Galaga HP == 3.
     - Assert Elite non-bonus stages (12..25) have Boss Galaga HP == 5.
     - Assert Dreadnought non-bonus stages (26..50) have Boss Galaga HP == 5 and shield == 2.
2. **Stage Bosses Scaling & Phase Invariance**:
   - Test all 5 Stage Bosses (Stage 10: 128 HP, Stage 20: 192 HP, Stage 30: 240 HP, Stage 40: 288 HP, Stage 50: 480 HP).
   - Simulate taking damage: verify Phase 2 and Phase 3 transitions trigger at exact proportional thresholds (e.g. Stage 10 exposes core at <= 64 HP, Stage 50 enrages at <= 160 HP).
3. **Multiplicative DDA Composition Under Stress**:
   - Test extreme DDA skill ratings: $\sigma = 0.0$ (easy, DDA mult 0.90), $\sigma = 0.5$ (neutral, DDA mult 1.00), $\sigma = 1.0$ (master, DDA mult 1.25). Verify total HP stays within $[1.44, 2.00] \times \text{baseMaxHealth}$ and never produces NaN or 0.
4. **Wave Divers & Density Bounds**:
   - Verify `maxConcurrentDivers` is capped at 8 at high stages.
5. Run full repository verification:
   - `npm test`
   - `npm run build`
6. Record empirical findings and explicit verdict (`APPROVE` or `REQUEST_CHANGES`) in `/Users/user/src/galog/.agents/m33_challenger_1/handoff.md`.
7. Send a completion message to parent when finished.

</USER_REQUEST>
