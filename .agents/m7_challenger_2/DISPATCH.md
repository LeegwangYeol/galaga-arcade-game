## 2026-09-02T13:54:30Z

You are m7_challenger_2 (Milestone 7 Screen State Machine & Touch UX Challenger).
Your working directory is /Users/user/src/galog/.agents/m7_challenger_2/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/m7_worker/handoff.md

TASK:
Adversarially challenge Game screens, stage badge rendering, and mobile touch UX:
1. Test stage badge greedy decomposition for stages 1 to 255 (ensuring badge list never overflows canvas bounds or crashes).
2. Test rapid restart cycling (`TITLE -> PLAYING -> GAME_OVER -> TITLE -> PLAYING`) for state/memory leaks.
3. Test multi-touch virtual controls under simultaneous movement and rapid fire button tapping.
4. Run `npm run typecheck`, `npm run build`, and `npm test`.
5. Issue verdict: `APPROVE` or `FAIL`.

Output requirements:
Write your analysis to `/Users/user/src/galog/.agents/m7_challenger_2/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m7_challenger_2/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
