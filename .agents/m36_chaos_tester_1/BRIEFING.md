# BRIEFING — 2026-09-15T07:15:30Z

## Mission
Adversarial Chaos Testing of Boundary Clamping and Revive Logic for Milestone M36 of Phase 7 (2-Player Co-op Galaga).

## 🔒 My Identity
- Archetype: teamwork_preview_challenger
- Roles: critic, specialist
- Working directory: /Users/user/src/galog/.agents/m36_chaos_tester_1
- Original parent: 4ed64773-20f0-4a65-b739-67aebabb4e6d
- Milestone: M36
- Instance: 1 of 2

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code
- Create test file `tests/unit/adversarial_chaos_boundary_revive.test.ts`
- Empirically execute and report all passes, failures, edge cases, and unexpected state transitions
- Do NOT fix code bugs yourself; catalog and document for M38 remediation swarm

## Current Parent
- Conversation ID: 4ed64773-20f0-4a65-b739-67aebabb4e6d
- Updated: not yet

## Review Scope
- **Files to review**: `src/entities/Player.ts`, `src/systems/PlayerManager.ts`, `src/core/Game.ts`, `src/types/index.ts`
- **Interface contracts**: PROJECT.md / COLLABORATION.md Phase 7 M36
- **Review criteria**: Boundary clamping invariants, subpixel drift, simultaneous dual death, zero-life donations, race conditions in revive, tractor beam / boss interaction during revive

## Attack Surface
- **Hypotheses tested**: [TBD]
- **Vulnerabilities found**: [TBD]
- **Untested angles**: [TBD]

## Loaded Skills
- None explicitly loaded

## Key Decisions Made
- Initialized adversarial test harness targeting boundary clamping & revive edge cases

## Artifact Index
- DISPATCH.md — Dispatch instructions
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat & task progress
- tests/unit/adversarial_chaos_boundary_revive.test.ts — Adversarial test suite
- handoff.md — Final 5-component handoff report
