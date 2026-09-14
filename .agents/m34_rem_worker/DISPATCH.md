## 2026-09-14T11:18:33Z

<USER_REQUEST>
You are m34_rem_worker, the Remediation Implementation Worker for Milestone M34: Symmetrical Dual Bottom Dashboard HUD & Ergonomic Polish.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m34_rem_worker
- Identity: m34_rem_worker
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Milestone M34 Symmetrical Dual Bottom Dashboard HUD)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Master Architecture: /Users/user/src/galog/PROJECT.md
- Previous Worker Handoff: /Users/user/src/galog/.agents/m34_worker/handoff.md
- Reviewer 2 Full Report (Violations & Changes Requested): /Users/user/src/galog/.agents/m34_reviewer_2/handoff.md
- Auditor 1 Report: /Users/user/src/galog/.agents/m34_auditor_1/handoff.md

# MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

# Exclusively Owned Files
You have exclusive write access to:
- `index.html`
- `src/ui/BottomDashboard.ts`
- `tests/unit/m34_dual_dashboard.test.ts`

# Exact Remediation Directives

## 1. Defect M34-DEFECT-01: Missing 380px Media Query in `index.html`
In `index.html` around line 771 (immediately after the `@media (max-width: 480px)` block), add the missing `@media (max-width: 380px)` rule:
```css
@media (max-width: 380px) {
  .bottom-dashboard.coop-mode, .bottom-dashboard.mode-coop {
    grid-template-columns: 1fr 80px 1fr;
    padding: 1px 2px;
  }
}
```
And in `tests/unit/m34_dual_dashboard.test.ts` (inside TC6.2 or a dedicated assertion), assert:
```typescript
expect(html).toContain('@media (max-width: 380px)');
expect(html).toContain('grid-template-columns: 1fr 80px 1fr');
```

## 2. Defect M34-DEFECT-02: Revive Life Donation Dirty-Check Omission in `src/ui/BottomDashboard.ts`
In `src/ui/BottomDashboard.ts`:
- Add tracking fields to the cache properties (around line 220):
  ```typescript
  private _lastP2CanDonate: boolean = false;
  private _lastP1CanDonate: boolean = false;
  ```
- In the Player 1 revive dirty check (around line 1427):
  Update the condition from:
  ```typescript
  if (stateP1 !== this._lastStateP1 || secP1 !== this._lastReviveSecP1) {
  ```
  to:
  ```typescript
  if (stateP1 !== this._lastStateP1 || secP1 !== this._lastReviveSecP1 || p2CanDonate !== this._lastP2CanDonate) {
  ```
  and inside the block, record:
  ```typescript
  this._lastP2CanDonate = p2CanDonate;
  ```
- In the Player 2 revive dirty check (around line 1552):
  Update the condition from:
  ```typescript
  if (stateP2 !== this._lastStateP2 || secP2 !== this._lastReviveSecP2) {
  ```
  to:
  ```typescript
  if (stateP2 !== this._lastStateP2 || secP2 !== this._lastReviveSecP2 || p1CanDonate !== this._lastP1CanDonate) {
  ```
  and inside the block, record:
  ```typescript
  this._lastP1CanDonate = p1CanDonate;
  ```
- If there is a cache reset method (e.g. `resetCache()`), reset `_lastP2CanDonate` and `_lastP1CanDonate` to `false`.

## 3. Optimization M34-OPT-01: Warning Text Pre-allocation in `src/ui/BottomDashboard.ts`
In `src/ui/BottomDashboard.ts`:
- Pre-allocate frozen string lookup arrays alongside `REVIVE_COUNTDOWN_STRINGS`:
  ```typescript
  const REVIVE_P1_STRINGS = Object.freeze(Array.from({ length: 16 }, (_, i) => `REVIVE P1: ${i}S`));
  const REVIVE_P2_STRINGS = Object.freeze(Array.from({ length: 16 }, (_, i) => `REVIVE P2: ${i}S`));
  ```
- Around lines 1618 and 1620, replace per-frame template string interpolation with:
  ```typescript
  warningText = REVIVE_P1_STRINGS[secP1] || 'REVIVE P1: 0S';
  ```
  and
  ```typescript
  warningText = REVIVE_P2_STRINGS[secP2] || 'REVIVE P2: 0S';
  ```

# Mandatory Verification Commands
Run the following commands and ensure all pass before reporting completion:
1. `npx tsc --noEmit` — 0 errors.
2. `npm run build` — clean build, verify `dist/assets/index-*.js` size is < 250 KB and strictly < 300 KB (307,200 bytes).
3. `npx vitest run tests/unit/m34_dual_dashboard.test.ts` — 100% pass.
4. `npm test` — all test files must pass 100%, 0 failures.

Output full documentation of changes and verification results in `/Users/user/src/galog/.agents/m34_rem_worker/handoff.md`.
Send a completion message to parent when finished.
</USER_REQUEST>
