# E2E Test Infra: Galaga Arcade Web Game

## Test Philosophy
- Opaque-box, requirement-driven testing derived from `ORIGINAL_REQUEST.md` and authentic Galaga arcade specifications.
- Complete independence from internal implementation details: tests interact with game canvas, window events, state contracts, and browser runtime.
- Verification guarantees: 0 JavaScript runtime errors on page load, active 60fps game loop ticking, responsive input acceptance, deterministic math/physics, authentic tractor beam state transitions, and 100% clean production build.

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---|---|:---:|:---:|:---:|:---:|
| F1 | Build & Vercel Config | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F2 | Git & GitHub Automation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F3 | Game Loop & Timestep | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F4 | Starfield & Canvas Scaling | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F5 | Multi-Input Handling | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F6 | Player Single/Dual Fighter | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F7 | Enemy Formation Grid | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F8 | Bézier Flight Paths & AI | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F9 | Boss Tractor Beam & Rescue | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F10 | Web Audio Procedural Synth | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F11 | Pixel Sprites & Particles | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F12 | UI, Score & LocalStorage | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F13 | Browser & E2E Validation | Acceptance Criteria | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Unit Test Runner**: `vitest` (Fast, ESM-native, strict assertions on Vector2, Bézier splines, collisions, score rules, state machines).
- **E2E & Browser Runner**: `playwright` (Chromium + Mobile Webkit headless browser validation, console error capture, page load timing, canvas rendering checks).
- **Pass/Fail Semantics**: 0 uncaught exceptions, 0 failed assertions, exit code 0 on all test commands.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|---|---|---|
| 1 | Full Stage 1 Clear Flow | F3, F4, F5, F6, F7, F8, F10, F11, F12 | High |
| 2 | Boss Tractor Beam Capture & Dual Fighter Rescue | F6, F7, F8, F9, F10, F11, F12 | High |
| 3 | Challenging Stage Perfect Score (40/40 Aliens) | F7, F8, F10, F12 | High |
| 4 | Mobile Touch Virtual Control & Rapid Fire Run | F3, F4, F5, F6, F12 | Medium |
| 5 | High Score Survival & LocalStorage Recovery Across Reloads | F1, F6, F12 | Medium |

## Coverage Thresholds
- Tier 1 (Feature Coverage): $\ge 65$ test cases ($5 \times 13$ features)
- Tier 2 (Boundary & Corner Cases): $\ge 65$ test cases ($5 \times 13$ features)
- Tier 3 (Cross-Feature Pairwise Interactions): $\ge 13$ test cases
- Tier 4 (Real-World Application Scenarios): $\ge 7$ application scenarios
- **Total Minimum Test Cases**: $\ge 150$ assertions across unit & browser E2E suites.
