# BRIEFING — 2026-09-04T19:25:00+09:00

## Mission
Empirically and adversarially stress-test Milestone 13 Special Moves & Pool Saturation, write adversarial tests, verify, and issue verdict.

## 🔒 My Identity
- Archetype: EMPIRICAL CHALLENGER
- Roles: critic, specialist
- Working directory: /Users/user/teamwork_projects/galaga_game/.agents/m13_challenger_2
- Original parent: e83ea4b9-cadd-4692-a6bc-95743f0dd928
- Milestone: Milestone 13 Special Moves & Pool Saturation
- Instance: 2 of 2

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code
- Write adversarial tests in `tests/unit/adversarial_m13_specials.test.ts`
- Bounded pool saturation, Chrono Freeze dt split invariant, Warp Ram invulnerability, energy gauge boundary conditions
- Run verification tests personally (`npm test`)
- Issue explicit verdict (APPROVE / REQUEST_CHANGES)

## Current Parent
- Conversation ID: e83ea4b9-cadd-4692-a6bc-95743f0dd928
- Updated: not yet

## Review Scope
- **Files to review**: Special move implementations, pooling system, player/enemy bullet managers, timers
- **Interface contracts**: PROJECT.md, COLLABORATION.md, ORIGINAL_REQUEST.md
- **Review criteria**: correctness, robustness, zero heap growth, zero leak, strict dt split, invulnerability

## Attack Surface
- **Hypotheses tested**: [TBD]
- **Vulnerabilities found**: [TBD]
- **Untested angles**: [TBD]

## Loaded Skills
None

## Key Decisions Made
- Initializing challenger workflow

## Artifact Index
- progress.md — liveness heartbeat
- DISPATCH.md — dispatch record
- handoff.md — final handoff report
