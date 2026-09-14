## 2026-09-04T09:17:49Z
You are m12_challenger_2.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m12_challenger_2`.
You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m12_worker/handoff.md`

Your task:
Empirically and adversarially stress-test Milestone 12 Projectile and Hazard systems:
1. Write an adversarial test file `tests/unit/adversarial_boss_hazards.test.ts` testing:
   - Bullet pool capacity under extreme bullet hell saturation (Stage 50 Phase 3 dual 6-arm spiral counter-rotating barrage). Verify pool recycling, bounds clamping at 256, and zero crashes.
   - Gravitational tear numerical stability in Stage 20: what happens when a player bullet is placed exactly at r = 0 (singularity test)? Confirm softened denominator epsilon = 18px prevents NaN or Infinity.
   - Gray goo cloud bullet dissolution in Stage 30: confirm bullets entering the radius are reliably recycled.
   - Telekinetic stun pulse player speed reduction in Stage 40: verify player speed is clamped and restored after timer expires.
   - Mega-beam collision in Stage 50: verify safe pocket on canvas flanks (x < 45px or safe flank).
2. Run `npm test`.
3. Issue an explicit verdict: `APPROVE` or `REQUEST_CHANGES` in `/Users/user/teamwork_projects/galaga_game/.agents/m12_challenger_2/handoff.md`.
Update your `progress.md` before and after work. When finished, send a message back to parent.
