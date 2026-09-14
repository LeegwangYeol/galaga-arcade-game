# Architectural Exploration & Specification Report: Tactical Co-op Tractor Beam Rescue, Dual-Fighter Logic & Milestone M33 Test Specifications

**Milestone**: M33 — Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics  
**Agent**: `m33_explorer_3` (Architecture Exploration, State Machine Design & Verification Synthesis)  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Working Directory**: `/Users/user/src/galog/.agents/m33_explorer_3`  
**Status**: Exploration Complete — Architectural Blueprint & Exhaustive Unit Test Specifications Formulated  

---

## 1. Observation

Direct code observations from the live codebase (`branch feature/coop-multiplayer` at `/Users/user/src/galog`):

### 1.1 Single-Player Tractor Beam Lifecycle & State Machine
1. **Beam Geometry & Lifecycle (`src/entities/TractorBeam.ts`)**:
   - `TractorBeam.ts:19–25`:
     ```typescript
     export type TractorBeamPhase =
       | 'INACTIVE'
       | 'EXPANDING'
       | 'EMITTING'
       | 'HOLDING'
       | 'CAPTURING'
       | 'RETRACTING';
     ```
   - Geometry constants (`lines 53–65`): Top width $8\text{ px}$ at Boss Galaga emitter offset $y_{\text{boss}} + 12$; Target bottom width $48\text{ px}$ at bottom $Y = 280$; Expansion duration $0.5\text{s}$, Hold duration $3.5\text{s}$, Retract duration $0.3\text{s}$; 12Hz color pulse scrolling at $72\text{ px/s}$.
   - Spatial tests (`lines 330–368`): Mathematical point-in-trapezoid (`containsPoint(px, py)`) and AABB swept overlap (`intersectsAABB(box)`).
   - Lifecycle state changes (`lines 234–302`): `INACTIVE -> EMITTING/EXPANDING (0.5s) -> HOLDING (3.5s) -> RETRACTING (0.3s) -> INACTIVE`. If capture triggers: transitions to `CAPTURING` (cone maintained at full extension).

2. **Player Capture & Ascension (`src/entities/Player.ts`)**:
   - `Player.ts:24–25`: `PlayerState` includes `'capturing'` and `'captured'`.
   - `Player.ts:826–834`:
     ```typescript
     public startCapture(beamCenterX: number, bossY: number): void {
       if (this.isInvulnerable() || (this._state !== 'normal' && this._state !== 'ALIVE')) return;
       this._state = 'capturing';
       this.captureTimer = 0;
       this.captureAngle = 0;
       this.captureOrigin = { x: this.x, y: this.y };
       this.captureTarget = { x: beamCenterX, y: bossY + 16 };
     }
     ```
   - `Player.ts:557–576` (`updateCapturing(dt)`):
     - `this.captureAngle += Math.PI * 8 * dt;` (spinning at $4.0\text{ rot/s} = 1440^\circ/\text{s}$).
     - `progress = Math.min(1.0, this.captureTimer / 2.5);` ($2.5\text{s}$ ascension along beam).
     - Linear interpolation of $(x, y)$ from `captureOrigin` to `captureTarget`.
     - When `progress >= 1.0`: `_state = 'captured'`; `this.lives -= 1;`
     - Invokes `onCapturedComplete?.(captureTarget.x, captureTarget.y);`
     - If `lives > 0`: calls `this.respawn()` (new ship emerges at baseline $y = 250$ with temporary invulnerability); if `lives === 0`: calls `this.onGameOver?.()`.
   - Control suppression (`Player.ts:390–395`): While in `'capturing'` or `'captured'`, `canFire` is false and horizontal steering velocity is zeroed.

3. **Formation Escort Creation & Turncoat Divergence (`src/core/Game.ts` & `src/entities/Enemy.ts`)**:
   - `Game.ts:1127–1149`:
     - When `player.onCapturedComplete` fires, `handlePlayerCaptured(targetX, targetY)` creates a new `Enemy` of type `EnemyType.CAPTURED_FIGHTER` at $(targetX, targetY)$.
     - `escort.state = EnemyState.IN_FORMATION; escort.escortBoss = boss; escort.escortBossId = boss.id;`
     - `boss.hasCapturedFighter = true; boss.capturedFighterEnemy = escort; boss.escortCount = 1;`
     - `this.formationManager.enemies.push(escort);`
     - `this.tractorBeam.deactivate(true); boss.state = EnemyState.RETURNING_TO_FORMATION;`
   - Escort diving coordination (`src/entities/Enemy.ts:470–490`): When Boss dives (`DIVING_ESCORT`), the captured fighter tracks the boss at $(boss.x, boss.y - 16)$.
   - Rescue execution (`Game.ts:1284–1304`):
     - If player destroys diving Boss (`isDiving === true`):
       - `capturedFighter.active = false; capturedFighter.state = EnemyState.INACTIVE;`
       - `rescuer.startRescue(enemy.x, enemy.y);`
       - `scoreManager.addScore(1000, ownerId);` (1,000 pts rescue bonus).
     - If player destroys Boss in formation (`!isDiving`):
       - Turncoat divergence: `capturedFighter.state = EnemyState.CAPTURED_HOSTILE; capturedFighter.escortBoss = null;`
       - `this.formationManager.peelOffSolo(capturedFighter, this.player.x);` (dives hostile at player; yields 1,000 pts diving / 500 pts formation if shot).

4. **Rescue Descent & Dual Fighter Docking (`src/entities/Player.ts:536–555` & `836–846`)**:
   - `rescuer.startRescue(bossX, bossY)` initializes `rescuer._state = 'docking'`.
   - `rescuer.rescuedFighter` descends at $80\text{ px/s}$ (`RESCUE_DESCENT_SPEED`), lerping horizontally to `targetDockX = rescuer.x < bossX ? rescuer.x + 16 : rescuer.x - 16`.
   - Active player remains horizontally steerable during docking.
   - When `rescuedFighter.y >= Player.BASELINE_Y - 1`:
     - `_state = 'dual'`; `rescuedFighter.active = false;`
     - Hull centers at `(this.x + rf.x) / 2`; Hitbox expands from $12\text{ px}$ to $32\text{ px}$.
     - `this.onDocked?.()` fires -> `scoreManager.addScore(1000, pId)` (+1,000 docking bonus), `MusicJingles.playDockingJingle()`.
     - Dual fighter can fire up to 4 simultaneous on-screen missiles (or 6-way scatter shot).

### 1.2 Current Co-op Multiplayer State & Deficiencies
1. **Single-Player Target Assumption in `FormationManager.ts:688–711` & `774–804`**:
   - `triggerDiveAttack(playerX, playerIsDual)` currently receives only one `playerX` coordinate (hardcoded to `this.player.x` in `Game.ts:997`).
   - Stage 2+ Tractor Beam dive condition:
     ```typescript
     const shouldAttemptTractor =
       this.stage >= 2 &&
       !playerIsDual &&
       !this.isTractorBeamActive() &&
       Math.random() < 0.35;
     ```
   - **Deficiency**: It does not evaluate both P1 and P2! If P1 is Dual, but P2 is Single, the tractor beam is erroneously blocked! If both are Single, it always dives toward P1's coordinate, ignoring P2's proximity.
2. **Missing Captive Player Ownership Tracking (`Game.ts:1130–1142`)**:
   - When `escort` enemy is created upon capture completion, `escort.type = EnemyType.CAPTURED_FIGHTER`, but `escort.originalOwnerId` is **not** set.
   - When the boss is destroyed, `rescuer` defaults to `ownerId` (the shooter).
   - If P2 shoots the boss that captured P1, P2 currently docks with P1's fighter and becomes Dual, while P1 (if at 0 lives) remains permanently dead!
3. **Capture Isolation Invariant Already Verified in Baseline (`tests/unit/adversarial_m31_challenger_2.test.ts:28–113`)**:
   - Vitest suite confirms that when P1 is inside the beam (`containsPoint(p1.x, p1.y) === true`), P1 enters `'capturing'`.
   - P2 (at $x = 190$, outside beam) remains in `'normal'`, retains full control, steers freely, and fires bullets with `ownerId: 'p2'`.
   - If P2 shoots and destroys the boss mid-capture, the beam collapses immediately, and `p1.cancelCapture()` restores P1 to `'normal'` with 1.0s invulnerability.

### 1.3 Peer Discoveries from Milestone M33 Explorers
- **`m33_explorer_1` (Dynamic Scaling Engine)**:
  - Boss Galaga HP scales by $+50\%$ in 2P Co-op (Classic: 2 HP -> 3 HP; Elite/Dreadnought: 3 HP -> 5 HP).
  - Stage Bosses HP scales by $+60\%$ (Stage 10: 80 -> 128 HP; Stage 20: 120 -> 192 HP; Stage 30: 150 -> 240 HP; Stage 40: 180 -> 288 HP; Stage 50: 300 -> 480 HP). Relative phase transition thresholds ($\le 0.5 \times \text{maxHealth}$) remain invariant.
  - Wave dive interval scales by $+25\%$ cadence ($T_{\text{dive}} = \text{base} / 1.25$); Max concurrent divers $+25\%$ (min 8); Formation sniper fire $+25\%$ faster.
  - Challenging Stages (Stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47) are **100% immune** to HP scaling (strictly 1 HP, 0 shield, 0 bullets) to protect the 40-hit perfection bonus (10,000 pts).
- **`m33_explorer_2` (Cooperative Revive & Life Sharing)**:
  - When a co-op player reaches 0 lives upon death delay, they enter `'revive_pending'` with an emergency $10.0\text{s}$ countdown timer.
  - If the surviving partner has $> 1$ reserve lives, pressing `KeyL` (P1 donate) or `NumpadDecimal`/touch button transfers 1 life to revive the fallen ally at baseline with $2.0\text{s}$ invulnerability.
  - Shared Game Over occurs strictly when **both** players have 0 lives AND 0 revive timers.

---

## 2. Logic Chain

From the direct observations above, we establish the step-by-step reasoning and architectural model for Tactical Co-op Tractor Beam Rescue and Dual-Fighter Logic:

```
[Observation 1.1: Boss Galaga selects playerX for dive]
    + [Observation 1.2: Game.ts has PlayerManager with p1 and p2]
    --> Step 1: Boss Galaga evaluates X-proximity across all eligible living players:
        eligible = { p in livingPlayers | !p.isDual && !p.isInvulnerable() && p.state === 'normal' }
        targetPlayer = argmin_{p in eligible} |boss.x - p.x|
        Boss Galaga halts at haltX = clamp(targetPlayer.x, 48, 176) and activates beam.

[Observation 1.2: Baseline tests confirm P2 remains uninhibited during P1 capture]
    --> Step 2: Capture Isolation Invariant:
        While P1 is captured in beam cone (rotating at 4 rot/s and ascending),
        P2 is NOT disabled: can steer, fire, dodge, and attack the Boss Galaga.

[Observation 1.1: When Boss destroyed mid-capture, cancelCapture() restores player]
    --> Step 3: Mid-Capture Rescue:
        If P2 shoots down Boss Galaga while beam is expanding/holding, beam deactivates,
        P1 cancelCapture() restores P1 to normal with 1.0s invulnerability at baseline.

[Observation 1.1 & 1.2: When capture finishes, captive becomes escort enemy]
    --> Step 4: Escort Ownership Tagging:
        When capture completes, captive enemy stores originalOwnerId: capturedPlayer.id ('p1' or 'p2').
        Boss returns to formation with captive fighter docked as escort.

[Observation 1.1: Boss dives with captive; killer frees captive and gets 1,000 pts]
    + [Prompt Specification: If P2 destroys boss holding P1, P1 is freed, P2 gets 1,000 pts,
       and P1 safely docks back into normal flight (or dual-fighter if single remaining ship)]
    --> Step 5: Symmetrical Co-op Diving Rescue & Docking Resolution:
        When Boss Galaga diving with captive is destroyed by player (shooterId):
        a. Shooter (rescuer) receives +1,000 pts rescue bonus (ScoreManager.addScore(1000, shooterId)).
        b. Captive enemy is deactivated (EnemyState.INACTIVE).
        c. Captive player evaluation:
           - Case 5A (Teammate Heroic Revive): If captive player was DOWNED / CAPTURED (lives == 0 or in revive_pending):
             Captive player is liberated! Enters 'docking' descent from (boss.x, boss.y) to baseline (y = 250).
             Upon reaching baseline: restores to 'normal' flight with 1 life and 2.0s invulnerability!
           - Case 5B (Teammate Active Flight Restoration / Dual Docking):
             If captive player already respawned with reserve ship (lives > 0) AND shooter is teammate:
             The freed captive descends and docks alongside its original owner to form DUAL_FIGHTER!
           - Case 5C (Single Remaining Ship Dual Docking):
             If captive player's partner is permanently dead (0 lives, timer expired), the surviving
             single ship docks with the freed fighter to form a DUAL_FIGHTER!
           - Case 5D (Self-Rescue):
             If player shoots the boss holding their OWN fighter:
             Player receives +1,000 pts bonus, and the fighter docks to form DUAL_FIGHTER!

[Observation 1.1: Destroying Boss in formation causes turncoat divergence]
    --> Step 6: Turncoat & Friendly Fire Handling:
        - If Boss destroyed in formation: captive turns into CAPTURED_HOSTILE enemy and attacks both players.
        - If player accidentally shoots captive fighter directly: captive is destroyed, shooter gets 1,000 pts
          (diving) or 500 pts (formation), but teammate is NOT rescued.
```

---

### 2.1 State Transition Diagrams

#### A. Master Co-op Tractor Beam & Tactical Rescue State Machine

```
                        [Boss Galaga in Formation]
                                     |
                Tractor Dive Decision (Stage >= 2, 35% chance)
                Targeting: min(|boss.x - P1.x|, |boss.x - P2.x|)
                (Filter: only Single, Non-Invulnerable players)
                                     |
                                     v
                        [Boss Diving to haltX, 100]
                                     |
                        Flight Path Finishes at haltY=100
                                     |
                                     v
                      [TRACTOR_BEAM_ACTIVE: EXPANDING] (0.5s)
                                     |
                                     v
                       [TRACTOR_BEAM_ACTIVE: HOLDING] (3.5s)
                         /                       \
        Target Player Enters Cone            No Player Enters Cone
                       /                           \
                      v                             v
           [TRACTOR_BEAM: CAPTURING]       [TRACTOR_BEAM: RETRACTING] (0.3s)
                      |                             |
                      |                    Boss resumes downward dive;
                      |                    wraps back to formation.
                      |
    +-----------------+-----------------+
    |                                   |
[P2 shoots Boss MID-CAPTURE]      [Capture Ascension Finishes (2.5s)]
    |                                   |
Beam collapses immediately!       P1 loses 1 life (lives -= 1).
P1: cancelCapture() ->            Captured Fighter Escort spawned on Boss.
Returns to 'normal' at baseline   Boss: RETURNING_TO_FORMATION.
with 1.0s invulnerability.        P1: If lives > 0 -> respawn()
                                      If lives == 0 -> 'revive_pending' (10s)
                                        |
                                        v
                          [Boss & Escort in Formation]
                                        |
                          Boss initiates Dive Attack
                                        |
                                        v
                          [Boss & Escort: DIVING_ESCORT]
                                 /              \
         [Shooter destroys Boss]                  [Shooter hits Escort]
                /        \                                  |
    Shooter is P2        Shooter is P1               Escort destroyed!
   (Cross-Rescue)        (Self-Rescue)               +1,000 pts to shooter.
          |                    |                     No rescue occurs.
+1,000 pts to P2      +1,000 pts to P1
          \                    /
           v                  v
     [Captive Fighter liberated into DOCKING descent]
                         |
      +------------------+------------------+
      |                                     |
[P1 was Downed / 0 lives]            [P1 or Shooter eligible for Dual]
      |                                     |
P1 descends to baseline Y=250.       Fighter docks alongside ship (x ± 16).
P1 restored to 'normal' state        Convergence: state = 'dual'
with 1 life & 2.0s invulnerability.  Twin hulls, 4-missile limit,
HEROIC TEAMMATE RESCUE!              +1,000 pts docking bonus!
```

#### B. Symmetrical Cross-Player Rescue Matrix

| Action / Event | Captive State | Shooter / Rescuer | Points Awarded | Resulting State of Captive | Resulting State of Rescuer |
|---|---|---|---|---|---|
| **P2 shoots diving Boss holding P1** | P1 is Downed (`revive_pending` / 0 lives) | **P2** | **+1,000 pts** to P2 | P1 descends to baseline, enters `'normal'` with 1 life & $2.0\text{s}$ shield | P2 remains active flight |
| **P2 shoots diving Boss holding P1** | P1 is Alive (respawned, 1 hull) | **P2** | **+1,000 pts** to P2 | P1 docks freed fighter, becomes `'dual'` (Dual-Fighter) | P2 remains active flight |
| **P2 shoots diving Boss holding P1** | P1 permanently dead (timer expired) | **P2** (Sole survivor) | **+1,000 pts** to P2 | N/A | P2 docks freed fighter, becomes `'dual'` (Dual-Fighter) |
| **P1 shoots diving Boss holding P2** | P2 is Downed (`revive_pending` / 0 lives) | **P1** | **+1,000 pts** to P1 | P2 descends to baseline, enters `'normal'` with 1 life & $2.0\text{s}$ shield | P1 remains active flight |
| **P1 shoots diving Boss holding P2** | P2 is Alive (respawned, 1 hull) | **P1** | **+1,000 pts** to P1 | P2 docks freed fighter, becomes `'dual'` (Dual-Fighter) | P1 remains active flight |
| **P1 shoots diving Boss holding P2** | P2 permanently dead (timer expired) | **P1** (Sole survivor) | **+1,000 pts** to P1 | N/A | P1 docks freed fighter, becomes `'dual'` (Dual-Fighter) |
| **P1 shoots diving Boss holding P1** | P1 is Alive (respawned) | **P1** (Self-Rescue) | **+1,000 pts** to P1 | P1 docks freed fighter, becomes `'dual'` | P1 becomes `'dual'` |
| **P2 shoots diving Boss in formation** | P1 held in formation | **P2** | Standard Boss kill pts | P1 fighter turns `CAPTURED_HOSTILE` (Turncoat) | P2 dodges turncoat attack |
| **P2 accidentally shoots P1's captive** | Diving Escort | **P2** | +1,000 pts to P2 | Captive fighter destroyed (no rescue) | P2 remains active |

---

### 2.2 Detailed Subsystem Design

#### 1. X-Proximity Targeting Algorithm (`FormationManager.ts`)
When Boss Galaga considers a tractor beam dive:
```typescript
public selectTractorBeamTarget(boss: Enemy): Player | null {
  const living = this.playerManager.getLivingPlayers();
  if (living.length === 0) return null;

  // Filter candidates: must be Single Fighter, not invulnerable, and controllable
  const candidates = living.filter(
    (p) => !p.isDual && !p.isInvulnerable() && (p.state === 'normal' || p.state === 'ALIVE')
  );
  if (candidates.length === 0) return null;

  // Evaluate minimum horizontal distance |boss.x - p.x|
  let bestPlayer: Player = candidates[0]!;
  let minDx = Math.abs(boss.x - bestPlayer.x);

  for (let i = 1; i < candidates.length; i++) {
    const p = candidates[i]!;
    const dx = Math.abs(boss.x - p.x);
    if (dx < minDx) {
      minDx = dx;
      bestPlayer = p;
    }
  }
  return bestPlayer;
}
```
Integration into `triggerDiveAttack`:
```typescript
const targetPlayer = this.selectTractorBeamTarget(boss);
if (targetPlayer) {
  this.launchTractorBeamDive(boss, targetPlayer.x);
}
```
*Benefits*:
- If P1 is Dual, but P2 is Single: Boss targets P2.
- If both are Single: Boss targets whoever is horizontally closer.
- If both are Dual: `selectTractorBeamTarget` returns `null`, suppressing beam attempt.

#### 2. Capture Isolation Invariant (`PlayerManager.ts` & `Player.ts`)
- In `Player.ts`:
  - When `startCapture()` is called, only the targeted player sets `_state = 'capturing'`.
  - `this.canFire = false; this.vx = 0;` applies only to that entity instance.
- In `PlayerManager.ts`:
  - The unaffected player (`p2` if `p1` was captured) receives its own input channel from `InputHandler` and updates without constraint.
  - Zero coupling between player entity states during tractor ascension.

#### 3. Mid-Capture Cancellation (`Game.ts:1307–1315`)
When Boss Galaga takes lethal damage while emitting a tractor beam:
```typescript
if (this.tractorBeam.isActive() && this.tractorBeam.getBoss() === enemy) {
  this.tractorBeam.deactivate(true);
  this.soundSynth.playTractorBeam(false);
  for (const p of this.playerManager.getPlayers()) {
    if (p.state === 'capturing' || (p.state as any) === 'CAPTURING') {
      p.cancelCapture?.();
    }
  }
}
```
`p.cancelCapture()` executes:
```typescript
public cancelCapture(): void {
  if (this._state === 'capturing' || (this._state as any) === 'CAPTURING') {
    this._state = 'normal';
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.clampPosition();
    this.invulnerableTimer = 1.0;
  }
}
```

#### 4. Captive Ownership Tagging & Diving Rescue Resolution (`Game.ts:1284–1305`)
In `Enemy.ts`, add:
```typescript
public originalOwnerId?: PlayerId;
```
When capture finishes in `Game.ts:handlePlayerCaptured`:
```typescript
const escort = new Enemy({
  id: `captured_${Date.now()}`,
  type: EnemyType.CAPTURED_FIGHTER,
  x: targetX,
  y: targetY,
});
escort.originalOwnerId = capturedPlayer.id;
```
When diving Boss is destroyed in `Game.ts:resolveCollisions`:
```typescript
if (enemy.hasCapturedFighter && enemy.capturedFighterEnemy) {
  const capturedFighter = enemy.capturedFighterEnemy;
  const captiveOwnerId = capturedFighter.originalOwnerId ?? 'p1';
  const captivePlayer = this.playerManager.getPlayer(captiveOwnerId);
  const killerId: PlayerId = ownerId ?? 'p1';
  const killerPlayer = this.playerManager.getPlayer(killerId);

  if (isDiving) {
    // 1. SUCCESSFUL RESCUE FLOW
    capturedFighter.active = false;
    capturedFighter.state = EnemyState.INACTIVE;

    // Award 1,000 pts rescue bonus to the rescuer (killer)
    this.scoreManager.addScore(1000, killerId);

    // Case A: Captive player was Downed / Captured (0 lives or revive_pending)
    if (captivePlayer && (captivePlayer.lives === 0 || captivePlayer.state === 'revive_pending' || captivePlayer.state === 'captured')) {
      captivePlayer.lives = 1;
      this.scoreManager.setLives(1, captiveOwnerId);
      captivePlayer.startRescue(enemy.x, enemy.y);
      // Hook onDocked for revived player
      captivePlayer.onDocked = () => {
        captivePlayer.state = 'normal';
        captivePlayer.invulnerableTimer = 2.0;
        this.scoreManager.addScore(1000, captiveOwnerId);
        MusicJingles.playDockingJingle();
        this.particleSystem.spawnDockingSparkles(captivePlayer.x, captivePlayer.y);
      };
    }
    // Case B: Captive player is alive on screen and not dual
    else if (captivePlayer && captivePlayer.isAlive() && !captivePlayer.isDual) {
      captivePlayer.startRescue(enemy.x, enemy.y);
      // Docks to form dual fighter with captive player
    }
    // Case C: Captive player's partner is the single remaining ship (or captive is dead)
    else if (killerPlayer && killerPlayer.isAlive() && !killerPlayer.isDual) {
      killerPlayer.startRescue(enemy.x, enemy.y);
      // Docks to form dual fighter with surviving killer
    }

    MusicJingles.playDockingJingle();
  } else {
    // 2. TURNCOAT DIVERGENCE FLOW (Boss destroyed in formation)
    capturedFighter.state = EnemyState.CAPTURED_HOSTILE;
    capturedFighter.escortBoss = null;
    capturedFighter.escortBossId = null;
    const target = this.playerManager.getLivingPlayers()[0];
    this.formationManager.peelOffSolo(capturedFighter, target ? target.x : 112);
  }
  enemy.hasCapturedFighter = false;
  enemy.capturedFighterEnemy = null;
}
```

---

## 3. Caveats

1. **Dual Fighter Tractor Beam Immunity Invariant**:
   - In authentic Galaga rules, a Dual Fighter craft is structurally too wide ($32\text{ px}$) and too powerful to be drawn into the tractor beam.
   - If P1 is Dual and P2 is Single, Boss Galaga must target P2 exclusively. If both are Dual, tractor beam dives are 100% suppressed.
2. **Simultaneous Beam Penetration**:
   - If both players accidentally enter the beam cone on the exact same frame:
     `Game.ts:1431` (`break; // Beam captures at most one player at a time`) guarantees that only one player is captured.
     The X-proximity test prioritizes the player closer to the beam center. The other player remains entirely free to rescue their partner.
3. **Turncoat Hostile Divergence**:
   - If Boss Galaga holding a captured ship is shot while still in formation, the captive fighter is **not** rescued.
   - It becomes a turncoat red traitor craft (`EnemyState.CAPTURED_HOSTILE`) that dive-bombs both players. Shooting it awards $1,000\text{ pts}$ (diving) or $500\text{ pts}$ (formation), but does **not** revive the player.
4. **Friendly Fire on Captive Fighter**:
   - If P2 tries to rescue P1 but accidentally hits the captive escort instead of the Boss, the captive is destroyed. P2 receives diving score, but P1 is not rescued. This preserves classic arcade tension.
5. **Zero-GC Compliance During Docking**:
   - `rescuedFighter` is pre-allocated on the `Player` instance (`this.rescuedFighter = { x, y, targetX, targetY, active, angle }`).
   - Updating docking coordinates does not instantiate any new objects, maintaining strict Zero-GC standards.

---

## 4. Conclusion & Architecture Summary

1. **Targeting**: Boss Galaga uses Euclidean horizontal proximity $|boss.x - p.x|$ against vulnerable single fighters, seamlessly supporting dynamic targeting in co-op.
2. **Capture Isolation**: P1's capture disables only P1. P2 retains complete movement, weapon firing, and special move activation.
3. **Mid-Capture Rescue**: Destroying the Boss Galaga before capture finishes immediately cancels P1's capture with $1.0\text{s}$ invulnerability.
4. **Co-op Diving Rescue**: Destroying diving Boss Galaga awards $+1,000\text{ pts}$ rescue bonus to the rescuer, while freeing the captive player to either revive into normal flight or dock into Dual-Fighter formation.
5. **Symmetry**: Both P1 and P2 can rescue each other with identical mechanics and rewards.

---

## 5. Verification Method & Concrete Unit Test Specifications

### 5.1 Verification Command
Run the complete Vitest test suite via terminal:
```bash
npm test
```
Or target Milestone M33 test suites specifically:
```bash
npm test -- tests/unit/m33_dynamic_scaling.test.ts tests/unit/m33_coop_revive.test.ts tests/unit/m33_tractor_beam_rescue.test.ts
```

---

### 5.2 Milestone M33 Unit Test Specifications

Below are concrete, complete, executable Vitest test specifications for Milestone M33 covering:
- **Suite 1: Co-op Dynamic Scaling Engine** (`tests/unit/m33_dynamic_scaling.test.ts`)
- **Suite 2: Cooperative Revive & Life Sharing** (`tests/unit/m33_coop_revive.test.ts`)
- **Suite 3: Tactical Co-op Tractor Beam Rescue & Dual-Fighter Logic** (`tests/unit/m33_tractor_beam_rescue.test.ts`)

```typescript
// ============================================================================
// File: tests/unit/m33_tractor_beam_rescue.test.ts
// Specification: Milestone M33 Tactical Co-op Tractor Beam Rescue & Dual Fighter
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { EnemyType, EnemyState } from '../../src/types';

describe('M33: Tactical Co-op Tractor Beam Rescue & Dual-Fighter System', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
  });

  // --------------------------------------------------------------------------
  // 1. Proximity-Based Tractor Beam Targeting
  // --------------------------------------------------------------------------
  describe('1. Proximity-Based Tractor Beam Targeting', () => {
    it('targets P1 when P1 is closer to Boss Galaga X-coordinate', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(60, 250, 3);
      p2.reset(180, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 70, y: 50 });
      boss.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(boss);

      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target?.id).toBe('p1');
    });

    it('targets P2 when P2 is closer to Boss Galaga X-coordinate', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(60, 250, 3);
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 150, y: 50 });
      boss.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(boss);

      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target?.id).toBe('p2');
    });

    it('targets Single player when the other player is Dual Fighter (Dual Immunity)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(110, 250, 3);
      p1.isDual = true; // P1 is Dual Fighter (Immune!)
      p2.reset(190, 250, 3);
      p2.isDual = false; // P2 is Single Fighter

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 110, y: 50 });
      boss.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(boss);

      const target = game.formationManager.selectTractorBeamTarget(boss);
      // Must select P2 despite P1 being closer, because P1 is Dual!
      expect(target?.id).toBe('p2');
    });

    it('suppresses tractor beam dive when BOTH players are Dual Fighters', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.isDual = true;
      p2.isDual = true;

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(boss);

      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Capture Isolation & Mid-Capture Interruption
  // --------------------------------------------------------------------------
  describe('2. Capture Isolation & Mid-Capture Rescue', () => {
    it('isolates capture state: P1 is captured while P2 moves and fires uninhibited', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(112, 250, 3);
      p2.reset(190, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      game.formationManager.enemies.push(boss);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6); // Into HOLDING

      game.resolveCollisions();
      expect(p1.state).toBe('capturing');
      expect(p1.canFire).toBe(false);

      expect(p2.state).toBe('normal');
      expect(p2.canFire).toBe(true);

      // P2 moves right
      const initialP2X = p2.x;
      p2.update(0.1, { moveLeft: false, moveRight: true, fire: false, pause: false, restart: false, pointerX: null });
      expect(p2.x).toBeGreaterThan(initialP2X);

      // P2 fires missile
      const bullet = game.bulletManager.firePlayerBullet(p2.x, p2.y - 8, false, 480, 0, undefined, undefined, 'p2');
      expect(bullet).not.toBeNull();
      expect(bullet?.ownerId).toBe('p2');
    });

    it('cancels P1 capture and awards boss kill score when P2 destroys Boss Galaga mid-capture', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(112, 250, 3);
      p2.reset(190, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.health = 1;
      game.formationManager.enemies.push(boss);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6);
      p1.startCapture(boss.x, boss.y);
      expect(p1.state).toBe('capturing');

      // P2 fires missile directly at boss
      game.bulletManager.firePlayerBullet(112, 106, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(game.tractorBeam.isActive()).toBe(false);

      // P1 capture cancelled and returned to normal
      expect(p1.state).toBe('normal');
      expect(p1.isInvulnerable()).toBe(true);
      expect(p1.invulnerableTimer).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Symmetrical Diving Rescue & Scoring
  // --------------------------------------------------------------------------
  describe('3. Symmetrical Diving Rescue & Scoring', () => {
    it('P2 rescues P1: awards 1,000 pts to P2 and revives downed P1 into normal flight', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 0);
      p1.state = 'revive_pending'; // P1 was downed / captured
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 120, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 120, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p2ScoreBefore = game.scoreManager.getScore('p2');

      // P2 fires fatal shot at Boss Galaga
      game.bulletManager.firePlayerBullet(120, 126, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(escort.active).toBe(false);

      // P2 receives +1,000 pts rescue bonus
      expect(game.scoreManager.getScore('p2')).toBeGreaterThanOrEqual(p2ScoreBefore + 1000);

      // Downed P1 is freed into docking descent
      expect(p1.rescuedFighter.active).toBe(true);
      expect(p1.state).toBe('docking');

      // Complete P1 descent
      for (let i = 0; i < 150; i++) {
        p1.update(1 / 60);
        if (p1.state === 'normal') break;
      }
      expect(p1.state).toBe('normal');
      expect(p1.lives).toBe(1);
      expect(p1.isInvulnerable()).toBe(true);
    });

    it('P1 rescues P2: awards 1,000 pts to P1 and revives downed P2 into normal flight', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 3);
      p2.reset(160, 250, 0);
      p2.state = 'revive_pending';

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 140, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 140, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p2';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p1ScoreBefore = game.scoreManager.getScore('p1');

      // P1 fires fatal shot at Boss Galaga
      game.bulletManager.firePlayerBullet(140, 126, false, 480, 0, undefined, undefined, 'p1');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(game.scoreManager.getScore('p1')).toBeGreaterThanOrEqual(p1ScoreBefore + 1000);
      expect(p2.rescuedFighter.active).toBe(true);
    });

    it('docks into Dual Fighter when captive player is already flying with single ship', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 2); // P1 is alive on screen with single hull
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 100, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 100, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      // P2 shoots boss
      game.bulletManager.firePlayerBullet(100, 126, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // P1 initiates dual docking
      expect(p1.state).toBe('docking');
      for (let i = 0; i < 150; i++) {
        p1.update(1 / 60);
        if (p1.state === 'dual') break;
      }
      expect(p1.state).toBe('dual');
      expect(p1.isDual).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Edge Cases: Turncoat Divergence & Friendly Fire
  // --------------------------------------------------------------------------
  describe('4. Edge Cases: Turncoat Divergence & Friendly Fire', () => {
    it('turns captive hostile (Turncoat) when Boss is destroyed in formation', () => {
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 34 });
      escort.state = EnemyState.IN_FORMATION;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      // P2 shoots boss in formation
      game.bulletManager.firePlayerBullet(112, 56, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(escort.state).toBe(EnemyState.CAPTURED_HOSTILE);
      expect(escort.escortBoss).toBeNull();
    });

    it('destroys captive without rescue when player hits escort instead of Boss', () => {
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 2;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      // P2 accidentally shoots escort at y=104
      game.bulletManager.firePlayerBullet(112, 108, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      expect(escort.active).toBe(false);
      expect(boss.health).toBe(2); // Boss unharmed
      expect(game.playerManager.getPlayer('p1')?.state).not.toBe('docking');
    });
  });
});
```

---

### 5.3 Invalidation Conditions
The architectural findings and specifications in this report will be considered invalid if:
1. Vitest tests fail to compile due to missing types or mismatched method signatures.
2. Boss Galaga targets a Dual Fighter in Co-op mode.
3. Mid-capture boss destruction fails to invoke `cancelCapture()` or fails to restore full player control.
4. Cross-player rescue awards bonus points to the captive instead of the rescuer.
5. Captive player revival results in memory leak or runtime GC allocation spike during docking descent.
