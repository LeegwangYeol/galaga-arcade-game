# Scope: Phase 6 Local 2-Player Co-op Multiplayer Mode (M31–M35)

## Architecture
- **Player Subsystem**: Multi-entity architecture (`PlayerManager`, `PlayerEntity`) supporting Player 1 (Classic Cyan/White) & Player 2 (Crimson/Amber) with independent positions, velocities, weapons, collision hitboxes, power-up buffs, lives, scores, and special moves.
- **Input Subsystem**: Platform-agnostic concurrent dual input. PC: P1 (WASD + Space + X) and P2 (Arrow Keys + Enter/Numpad0 + M/Shift) with non-blocking key state mapping. Mobile: Split-screen dual virtual touch zones ($X < \text{width}/2$ = P1, $X \ge \text{width}/2$ = P2) with strict `Touch.identifier` tracking.
- **Combat & Balance**: Dynamic scaling (+50% Boss Galaga HP, +60% Stage Bosses HP, +25% wave density in 2P mode). Co-op revive logic (emergency 10s countdown or 'L' key life donation). Co-op tractor beam rescue (P2 shoots capturing boss to rescue P1).
- **HUD & UI**: Symmetrical 3-zone bottom dashboard (Left P1 HUD, Center Tactical Telemetry/Controls, Right P2 HUD) with strict zero-GC dirty-checking at 60 FPS and mobile responsive reflow.
- **Verification & Invariants**: 50+ subagent swarm mobilization, Playwright automated dual-input E2E test, 100% preservation of all 1,930 baseline Vitest unit tests, zero-GC memory invariants (<5MB heap drift), and zero external binary assets.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| F31 | Multi-Entity Player Architecture | PlayerManager and PlayerEntity classes supporting P1 and P2 with independent state and 100% 1P backward compatibility | M31 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F32 | Tagged Projectile Allocation | Tagged bulletPool with ownerId ('p1' / 'p2') ensuring independent bullet limits and score attribution | M31 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F33 | Concurrent Dual Keyboard Input | Non-blocking multi-channel key mapping: P1 (WASD/Space/X) & P2 (Arrows/Enter/M/Shift) | M32 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F34 | Split-Screen Multi-Touch Mobile Controls | Left/Right touch partition with Touch.identifier tracking to prevent event crosstalk | M32 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F35 | Co-op Dynamic Scaling Engine | Scaled Boss HP (+50-60%) and wave density (+25%) in 2-player mode | M33 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F36 | Co-op Revive & Shared Game Over Logic | 10s emergency respawn countdown, optional reserve life donation, game over when both players down | M33 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F37 | Tactical Co-op Tractor Beam Rescue | P2 can attack and destroy boss capturing P1 to free them into dual-fighter formation | M33 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F38 | Symmetrical Dual Bottom Dashboard HUD | Symmetrical 3-zone layout (Left P1 HUD, Center Controls, Right P2 HUD) | M34 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F39 | Zero-GC 60 FPS HUD Dirty Checking | Fast state diffing ensuring 0 DOM allocations during 60 FPS gameplay | M34 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F40 | Mobile Responsive HUD Reflow | Compact stacked badges on narrow screens with no scrollbars | M34 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F41 | 50+ Subagent Swarm Mobilization | Coordinated swarm across M31–M35 with strict AND gating and binary auditor vetoes | M35 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F42 | Playwright Dual-Input E2E Test Suite | Automated headless browser tests for simultaneous PC and mobile inputs | M35 | COLLABORATION.md & ORIGINAL_REQUEST.md |
| F43 | 1,930 Baseline Test Preservation & Victory Audit | Full unit test pass, zero-leak verification, bitwise mirror sync, and forensic victory audit attestation | M35 | COLLABORATION.md & ORIGINAL_REQUEST.md |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M31 | Multi-Entity Player Architecture & Independent State Engine | Refactor single player into PlayerManager/PlayerEntity; P1 & P2 independent stats; tagged bulletPool; 1P backward compatibility | none | DONE |
| M32 | Concurrent Platform-Agnostic Dual-Input Subsystem | Non-blocking PC keyboard mapping (WASD/Arrows); Mobile split-screen touch with Touch.identifier; 1P/2P mode toggle | M31 | DONE |
| M33 | Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics | Dynamic scaling (+50% Boss HP, +25% wave density); co-op revive & life-sharing; co-op tractor beam rescue | M31, M32 | DONE |
| M34 | Symmetrical Dual Bottom Dashboard HUD & Ergonomic Polish | Symmetrical 3-zone layout (P1 HUD / Center Telemetry / P2 HUD); zero-GC DOM dirty checking; mobile reflow | M31, M32, M33 | DONE |
| M35 | 50+ Subagent Swarm Mobilization, Dual-Input E2E Matrix & Victory Audit | Playwright dual-input E2E test; 1,930 baseline test preservation; zero-GC profiling; bitwise parity sync; Victory Audit | M31–M34 | DONE |

## Interface Contracts
### `PlayerManager` $\leftrightarrow$ `Game` & `Entities`
- `PlayerManager.getPlayers(): PlayerEntity[]`
- `PlayerManager.getPlayer(id: 'p1' | 'p2'): PlayerEntity | undefined`
- `PlayerManager.isCoop(): boolean`
- `PlayerManager.getActiveCount(): number`
- `PlayerManager.update(dt: number, inputStates: Map<'p1' | 'p2', InputState>): void`
- `PlayerManager.render(ctx: CanvasRenderingContext2D): void`

### `InputManager` $\leftrightarrow$ `PlayerManager`
- `InputManager.getInputState(playerId: 'p1' | 'p2'): InputState`
- `InputManager.setMode(mode: 'single' | 'coop'): void`
- `InputManager.getMode(): 'single' | 'coop'`
