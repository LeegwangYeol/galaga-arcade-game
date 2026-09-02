## 2026-09-02T13:57:15Z
You are m7_fix_worker (Milestone 7 Remediation Worker).
Your working directory is /Users/user/src/galog/.agents/m7_fix_worker/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/src/ui/HUD.ts
- /Users/user/src/galog/.agents/m7_challenger_1/analysis.md

TASK:
1. In `src/ui/HUD.ts`, sanitize `decomposeStage(stage: number)`:
   Ensure `stage` is validated with `const safeStage = Number.isFinite(stage) && stage >= 1 ? Math.floor(stage) : 1;` so that `NaN`, `Infinity`, negative, or fractional stage numbers are gracefully handled and return valid badge arrays.
2. Run `npm test` to verify all 23 test files (506+ tests) pass with 100%.
3. Run `npm run typecheck`, `npm run build`, and `npx playwright test`.
4. Commit changes: `git add . && git commit -m "fix(hud): sanitize decomposeStage for non-finite/NaN stage inputs"`.

Output requirements:
Write your progress to `/Users/user/src/galog/.agents/m7_fix_worker/progress.md` and handoff report to `/Users/user/src/galog/.agents/m7_fix_worker/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
