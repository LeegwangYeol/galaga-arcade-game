## 2026-09-14T10:22:12Z
You are m33_challenger_2, an adversarial empirical verifier for Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m33_challenger_2
- Identity: m33_challenger_2
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Phase 6: Local 2-Player Co-op Multiplayer Mode, M33)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Worker Handoff: /Users/user/src/galog/.agents/m33_worker/handoff.md

# Mission & Focus: Adversarial Revive, Donation Races & Tactical Tractor Rescue Stress
Write and execute an adversarial stress test suite in `tests/unit/adversarial_m33_revive_rescue.test.ts`:
1. **Simultaneous & Sequential Player Elimination Invariants**:
   - Kill P1 and P2 on the exact same frame (simultaneous explosive wipeout). Verify both enter `revive_pending` with independent 10-second timers; `areAllPlayersDead()` remains `false` until BOTH timers expire. Verify `GAME_OVER` occurs only when the last timer expires.
   - Staggered death: P1 dies at $t=0$, P2 dies at $t=5.0\text{s}$. At $t=10.1\text{s}$, P1 is eliminated, but P2 still has $4.9\text{s}$ on its timer; verify `GAME_OVER` does NOT trigger until $t=15.1\text{s}$.
2. **Life Donation Race Conditions & Boundary Timing**:
   - Donor with 1 life attempts donation: verify strict rejection (`false`), donor lives remain 1, recipient stays in `revive_pending`.
   - Rapid double-donation attempt on consecutive frames: verify donor loses only 1 life and recipient respawns cleanly.
   - Last-millisecond donation ($t = 0.05\text{s}$): verify partner is rescued and timer clears cleanly.
   - Donation after elimination ($t = 0\text{s}$, state = 'eliminated'): verify player can still be revived by partner donating a life.
3. **Tactical Tractor Beam Proximity & Dual Immunity Stress**:
   - Both players are Dual Fighters: verify tractor beam dive is completely suppressed (`selectTractorBeamTarget` returns `null`).
   - One Dual Fighter, One Single Fighter: place Single fighter far ($x=20$) and Dual fighter close ($x=112$) to Boss ($x=112$). Verify Boss ignores the closer Dual fighter and targets the distant Single fighter.
4. **Symmetrical Cross-Player Rescue & Turncoat Divergence**:
   - Test both directions symmetrically: P1 rescues P2, and P2 rescues P1.
   - Rescuer receives 1,000 pts bonus. Downed captive is revived with 1 life and 2.0s invulnerability.
   - Boss killed in formation: captive turns into `CAPTURED_HOSTILE` turncoat enemy and attacks.
5. **Zero-GC Simulation**:
   - Run 3,000 simulated frames of reviving / rescue descent; verify 0 memory leakage and stable references.
6. Run verification:
   - `npm test`
   - `npm run build`
7. Record empirical findings and explicit verdict (`APPROVE` or `REQUEST_CHANGES`) in `/Users/user/src/galog/.agents/m33_challenger_2/handoff.md`.
8. Send a completion message to parent when finished.
