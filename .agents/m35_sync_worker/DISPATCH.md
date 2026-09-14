## 2026-09-14T11:47:23Z
You are m35_sync_worker, the Dual Workspace Mirror Synchronization Worker for Milestone M35: 50+ Subagent Swarm Mobilization, Dual-Input E2E Matrix & Victory Audit.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m35_sync_worker
- Identity: m35_sync_worker
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Milestone M35)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Master Architecture: /Users/user/src/galog/PROJECT.md
- Explorer 2 Report (Mirror Sync Blueprint): /Users/user/src/galog/.agents/m35_explorer_2/handoff.md
- Worker 1 Report: /Users/user/src/galog/.agents/m35_worker_1/handoff.md

# MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

# Mission & Task Directives: Dual Workspace Bitwise Parity Sync
Your task is to synchronize the mirror workspace at `/Users/user/teamwork_projects/galaga_game` to be 100% bitwise identical to the primary workspace at `/Users/user/src/galog`.

1. **Execute Deterministic Sync via `rsync`**:
   Synchronize `/Users/user/src/galog/` to `/Users/user/teamwork_projects/galaga_game/`:
   ```bash
   rsync -av \
     --exclude="node_modules" \
     --exclude="dist" \
     --exclude=".git" \
     --exclude=".agents" \
     --exclude="playwright-report" \
     --exclude="test-results" \
     --exclude=".DS_Store" \
     --delete \
     /Users/user/src/galog/ /Users/user/teamwork_projects/galaga_game/
   ```
2. **Execute Python Bitwise Verification**:
   Verify bitwise parity across all tracked files:
   ```python
   import os, filecmp
   src = '/Users/user/src/galog'
   dst = '/Users/user/teamwork_projects/galaga_game'
   exc = {'node_modules', 'dist', '.git', '.agents', 'playwright-report', 'test-results', '.DS_Store'}
   diffs = []
   for r, d, f in os.walk(src):
       d[:] = [x for x in d if x not in exc]
       rel_r = os.path.relpath(r, src)
       if rel_r == '.': rel_r = ''
       for file in f:
           if file in exc: continue
           rp = os.path.join(rel_r, file) if rel_r else file
           sp = os.path.join(r, file)
           dp = os.path.join(dst, rp)
           if not os.path.exists(dp) or not filecmp.cmp(sp, dp, shallow=False):
               diffs.append(rp)
   print("DIFFS:", diffs)
   assert len(diffs) == 0, f"Unsynced files: {diffs}"
   ```
3. **Verify Mirror Workspace Health**:
   In `/Users/user/teamwork_projects/galaga_game`:
   - Run `npx tsc --noEmit`
   - Run `npm run build`
   - Run `npm test` (all 124 test files must pass 100%, 0 failures)
4. Record detailed verification output and bitwise attestation in `/Users/user/src/galog/.agents/m35_sync_worker/handoff.md`.
5. Send a completion message to parent when finished.
