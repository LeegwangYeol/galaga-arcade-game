# Dispatch — m11_rem_worker

## Identity
- Role: Worker
- Working Directory: /Users/user/src/galog/.agents/m11_rem_worker
- Parent: teamwork_preview_orchestrator_4

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Mission: Milestone 11 Remediation Implementation
Apply the synthesized remediation diffs to resolve all audit violations and test regressions in Milestone 11.

### File Ownership:
You own and have exclusive write permission to:
- `src/core/Game.ts`
- `src/core/powerups/PowerUpManager.ts`
- `tests/unit/m8_final_adversarial.test.ts`

### Authoritative Files to Read:
1. `/Users/user/src/galog/.agents/ORIGINAL_REQUEST.md` (MANDATORY: read first)
2. `/Users/user/src/galog/PROJECT.md`
3. `/Users/user/src/galog/.agents/m11_auditor_1/handoff.md`
4. `/Users/user/src/galog/.agents/m11_rem_explorer_1/report.md`

### Required Changes:
1. **`src/core/Game.ts`** (lines 160–186):
   Add the missing Canvas 2D mock methods in the headless fallback context:
   - `moveTo: () => {}`
   - `lineTo: () => {}`
   - `fill: () => {}`
   - `ellipse: () => {}`
   - `clearRect: () => {}`
   - `quadraticCurveTo: () => {}`
   - `setLineDash: () => {}`
   - `getLineDash: () => []`
   - `createLinearGradient: () => ({ addColorStop: () => {} })`
   - `createRadialGradient: () => ({ addColorStop: () => {} })`
   - `measureText: () => ({ width: 0 })`
   - `lineWidth: 1`, `shadowBlur: 0`, `shadowColor: '#000000'`

2. **`src/core/powerups/PowerUpManager.ts`**:
   - Change `public static readonly POOL_MAX_SIZE = 128;` to `32;` (line 25).
   - In constructor (around lines 60–67), set `autoExpand: false` on the `ObjectPool<PowerUpItem>`.

3. **`tests/unit/m8_final_adversarial.test.ts`** (line 142):
   - Change `expect(playerBulletCount).toBeLessThanOrEqual(2);` to:
     `expect(playerBulletCount).toBeLessThanOrEqual(p.getMaxMissileQuota());`

### Verification Requirements:
Run and report verbatim output for:
1. `npm run typecheck`
2. `npx vitest run tests/unit/m11_challenger_1_adversarial.test.ts`
3. `npx vitest run tests/unit/m8_final_adversarial.test.ts`
4. `npx vitest run tests/unit/powerups.test.ts`
5. `npm test` (full suite across all test files)
6. `npm run build`

Document all command outputs and files modified in `/Users/user/src/galog/.agents/m11_rem_worker/handoff.md`.
Send a message when finished.

## 2026-09-03T16:29:38Z
You are m11_rem_worker.
Your working directory is /Users/user/src/galog/.agents/m11_rem_worker.
Read your dispatch at /Users/user/src/galog/.agents/m11_rem_worker/DISPATCH.md.
MANDATORY: Read /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md first.
Read the Explorer report at /Users/user/src/galog/.agents/m11_rem_explorer_1/report.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Apply the required fixes to:
1. `src/core/Game.ts` (canvas 2D mock methods)
2. `src/core/powerups/PowerUpManager.ts` (POOL_MAX_SIZE = 32, autoExpand = false)
3. `tests/unit/m8_final_adversarial.test.ts` (missile quota check)

Run all verification commands:
- `npm run typecheck`
- `npx vitest run tests/unit/m11_challenger_1_adversarial.test.ts`
- `npx vitest run tests/unit/m8_final_adversarial.test.ts`
- `npx vitest run tests/unit/powerups.test.ts`
- `npm test`
- `npm run build`

Document your changes and exact command outputs in /Users/user/src/galog/.agents/m11_rem_worker/handoff.md.
Send a message to parent when done.

