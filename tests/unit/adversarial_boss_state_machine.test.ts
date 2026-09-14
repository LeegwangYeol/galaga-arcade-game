/**
 * Galaga Arcade Web Game — Milestone 12 Adversarial Boss State Machine Test Suite
 * 
 * Comprehensive adversarial challenge suite verifying:
 * 1. Rapid multi-hit damage bursts during phase transition frames & damage gate idempotence.
 * 2. Extreme dt spikes (dt = 0, dt = 10.0s, negative, NaN, subnormal micro-ticks) and GameLoop numerical stability.
 * 3. 50-Stage progression continuity including Stages 10, 20, 30, 40, 50 boss encounters and Stage 51 prestige.
 * 4. Pre-allocated array integrity and zero-leak memory invariants over 1,000 continuous tick updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { BaseBoss } from '../../src/core/boss/BaseBoss';
import { CyberDreadnought } from '../../src/core/boss/bosses/CyberDreadnought';
import { DimensionalLeviathan } from '../../src/core/boss/bosses/DimensionalLeviathan';
import { NaniteColossus } from '../../src/core/boss/bosses/NaniteColossus';
import { PsionicHarbinger } from '../../src/core/boss/bosses/PsionicHarbinger';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';
import { BULLET_CONFIG } from '../../src/entities/Bullet';
import { EnemyState } from '../../src/types';

describe('Milestone 12 Adversarial: Boss State Machine & Lifecycle Stress', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  // ==========================================================================
  // Suite 1: Rapid Multi-Hit Damage Burst During Phase Transition Frames
  // ==========================================================================
  describe('1. Rapid Multi-Hit Damage Burst on Phase Transitions', () => {
    it('Stage 10 (Cyber Dreadnought): absorbs rapid 250-hit burst at 50% HP threshold without skipping to DEFEATED', () => {
      const boss = new CyberDreadnought(game);
      boss.phase = 'PHASE_1';
      boss.invulnerableTimer = 0;

      // 1. Bulkhead Shield: with turrets alive, direct body damage is fully absorbed
      expect(boss.isProtectedBySubUnits()).toBe(true);
      const shieldedHit = boss.takeDamage(10);
      expect(shieldedHit.wasDamaged).toBe(false);
      expect(shieldedHit.shieldAbsorbed).toBe(true);
      expect(boss.health).toBe(80);

      // 2. Disable turrets to expose bulkhead
      boss.turretLeft.active = false;
      boss.turretRight.active = false;
      expect(boss.isProtectedBySubUnits()).toBe(false);

      // 3. Bring health to threshold: maxHealth 80 -> 50% threshold is 40 HP
      boss.takeDamage(40);
      expect(boss.health).toBe(40);
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.invulnerableTimer).toBeGreaterThan(0);

      // 4. Adversarial Attack: 250 consecutive single-damage hits in the exact same tick
      for (let i = 0; i < 250; i++) {
        const burstResult = boss.takeDamage(1);
        expect(burstResult.wasDamaged).toBe(false);
        expect(burstResult.shieldAbsorbed).toBe(true);
      }

      // Health must remain locked at 40; must NOT skip to DEFEATED or award premature bonus
      expect(boss.health).toBe(40);
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.isDefeated).toBe(false);

      // 5. Complete transition into Phase 2
      boss.invulnerableTimer = 0;
      boss.update(0.016, 112, 250);
      expect(boss.phase).toBe('PHASE_2');

      // 6. Defeat boss and verify 250 rapid hits in DEFEATED state are completely idempotent
      const preDefeatScore = game.scoreManager.score;
      const defeatHit = boss.takeDamage(40);
      expect(defeatHit.destroyed).toBe(true);
      expect(boss.phase).toBe('DEFEATED');
      expect(boss.isDefeated).toBe(true);
      expect(game.scoreManager.score).toBe(preDefeatScore + boss.scoreBonus);

      // Burst hits on dead boss
      for (let i = 0; i < 250; i++) {
        const postDefeatHit = boss.takeDamage(1);
        expect(postDefeatHit.wasDamaged).toBe(false);
      }
      expect(game.scoreManager.score).toBe(preDefeatScore + boss.scoreBonus);
    });

    it('Stage 20 (Dimensional Leviathan): absorbs rapid burst during Void Shroud and Phase 1->2 transition', () => {
      const boss = new DimensionalLeviathan(game);
      boss.phase = 'PHASE_1';
      boss.invulnerableTimer = 0;

      // 1. Dematerialized Void Shroud phase-shift absorbs burst
      boss.isMaterialized = false;
      expect(boss.isInvulnerable()).toBe(true);
      for (let i = 0; i < 100; i++) {
        const res = boss.takeDamage(1);
        expect(res.wasDamaged).toBe(false);
        expect(res.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(120);

      // 2. Materialize and damage down to 60 HP (50% threshold)
      boss.isMaterialized = true;
      boss.takeDamage(60);
      expect(boss.health).toBe(60);
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.invulnerableTimer).toBeGreaterThan(0);

      // 3. Burst 250 hits during TRANSITION_1_2
      for (let i = 0; i < 250; i++) {
        const burstResult = boss.takeDamage(1);
        expect(burstResult.wasDamaged).toBe(false);
        expect(burstResult.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(60);
      expect(boss.phase).toBe('TRANSITION_1_2');

      // 4. Advance into Phase 2 and destroy
      boss.invulnerableTimer = 0;
      boss.update(0.016, 112, 250);
      expect(boss.phase).toBe('PHASE_2');
      boss.takeDamage(60);
      expect(boss.phase).toBe('DEFEATED');
    });

    it('Stage 30 (Nanite Colossus): absorbs burst while in Split state and during reassembly transition', () => {
      const boss = new NaniteColossus(game);
      boss.phase = 'PHASE_1';
      boss.invulnerableTimer = 0;

      // 1. Damage to 75 HP (50% threshold) triggers split
      boss.takeDamage(75);
      expect(boss.health).toBe(75);
      expect(boss.isSplit).toBe(true);
      expect(boss.isProtectedBySubUnits()).toBe(true);

      // 2. Burst 250 hits on main Colossus during split must be absorbed
      for (let i = 0; i < 250; i++) {
        const burstResult = boss.takeDamage(1);
        expect(burstResult.wasDamaged).toBe(false);
        expect(burstResult.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(75);

      // 3. Destroy all 4 Mini-Constructs
      for (const construct of boss.miniConstructs) {
        construct.active = false;
        boss.onSubUnitDestroyed(construct);
      }
      expect(boss.isSplit).toBe(false);
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.invulnerableTimer).toBeGreaterThan(0);

      // 4. Burst 250 hits during reassembly transition
      for (let i = 0; i < 250; i++) {
        const burstResult = boss.takeDamage(1);
        expect(burstResult.wasDamaged).toBe(false);
        expect(burstResult.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(75);

      // 5. Advance into Phase 2
      boss.invulnerableTimer = 0;
      boss.update(0.016, 112, 250);
      expect(boss.phase).toBe('PHASE_2');
      boss.takeDamage(75);
      expect(boss.phase).toBe('DEFEATED');
    });

    it('Stage 40 (Psionic Harbinger): absorbs burst on Phantom Clones and during transition', () => {
      const boss = new PsionicHarbinger(game);
      boss.phase = 'PHASE_1';
      boss.invulnerableTimer = 0;

      // 1. Phantom clones absorb infinite damage
      expect(boss.phantom1.isInvulnerableUnit).toBe(true);
      expect(boss.phantom2.isInvulnerableUnit).toBe(true);
      for (let i = 0; i < 100; i++) {
        const res1 = boss.phantom1.takeDamage(50);
        const res2 = boss.phantom2.takeDamage(50);
        expect(res1.wasDamaged).toBe(false);
        expect(res2.wasDamaged).toBe(false);
        expect(res1.shieldAbsorbed).toBe(true);
        expect(res2.shieldAbsorbed).toBe(true);
      }

      // 2. Damage core to 90 HP (50% threshold)
      boss.takeDamage(90);
      expect(boss.health).toBe(90);
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.phantom1.active).toBe(false);
      expect(boss.phantom2.active).toBe(false);

      // 3. Burst 250 hits during transition
      for (let i = 0; i < 250; i++) {
        const burstResult = boss.takeDamage(1);
        expect(burstResult.wasDamaged).toBe(false);
        expect(burstResult.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(90);

      // 4. Advance into Phase 2
      boss.invulnerableTimer = 0;
      boss.update(0.016, 112, 250);
      expect(boss.phase).toBe('PHASE_2');
      boss.takeDamage(90);
      expect(boss.phase).toBe('DEFEATED');
    });

    it('Stage 50 (Aeternum Core): absorbs burst with satellites alive, during Phase 1->2 and Phase 2->3 (Enrage)', () => {
      const boss = new AeternumCore(game);
      boss.phase = 'PHASE_1';
      boss.invulnerableTimer = 0;

      // 1. Core shielded while satellites live
      expect(boss.isProtectedBySubUnits()).toBe(true);
      for (let i = 0; i < 100; i++) {
        const res = boss.takeDamage(10);
        expect(res.wasDamaged).toBe(false);
        expect(res.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(300);

      // 2. Destroy satellites -> enters TRANSITION_1_2
      for (const sat of boss.satellites) {
        sat.active = false;
        boss.onSubUnitDestroyed(sat);
      }
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.invulnerableTimer).toBeGreaterThan(0);

      // 3. Burst 250 hits during Phase 1->2 transition
      for (let i = 0; i < 250; i++) {
        const burstResult = boss.takeDamage(1);
        expect(burstResult.wasDamaged).toBe(false);
        expect(burstResult.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(300);

      // 4. Advance into Phase 2
      boss.invulnerableTimer = 0;
      boss.update(0.016, 112, 250);
      expect(boss.phase).toBe('PHASE_2');

      // 5. Damage to 100 HP (<= 33% threshold) -> enters TRANSITION_2_3 (Enrage)
      boss.takeDamage(200);
      expect(boss.health).toBe(100);
      expect(boss.phase).toBe('TRANSITION_2_3');
      expect(boss.invulnerableTimer).toBeGreaterThan(0);

      // 6. Burst 250 hits during Phase 2->3 transition
      for (let i = 0; i < 250; i++) {
        const burstResult = boss.takeDamage(1);
        expect(burstResult.wasDamaged).toBe(false);
        expect(burstResult.shieldAbsorbed).toBe(true);
      }
      expect(boss.health).toBe(100);
      expect(boss.phase).toBe('TRANSITION_2_3');

      // 7. Advance into Phase 3 (Enrage) and complete defeat
      boss.invulnerableTimer = 0;
      boss.update(0.016, 112, 250);
      expect(boss.phase).toBe('PHASE_3');
      boss.takeDamage(100);
      expect(boss.phase).toBe('DEFEATED');
    });
  });

  // ==========================================================================
  // Suite 2: Extreme dt Spikes & Numerical Stability
  // ==========================================================================
  describe('2. Extreme dt Spikes & GameLoop Gatekeeper Invariants', () => {
    it('handles dt = 0 across 100 consecutive frames without divide-by-zero or state corruption', () => {
      const boss = new CyberDreadnought(game);
      const initialX = boss.x;
      const initialY = boss.y;
      const initialPhase = boss.phase;

      for (let i = 0; i < 100; i++) {
        boss.update(0, 112, 250);
      }

      expect(boss.x).toBe(initialX);
      expect(boss.y).toBe(initialY);
      expect(boss.phase).toBe(initialPhase);
      expect(boss.stateTimer).toBe(0);
      expect(Number.isFinite(boss.x)).toBe(true);
      expect(Number.isFinite(boss.y)).toBe(true);
    });

    it('handles massive dt = 10.0s lag spike cleanly without skipping intermediate phases', () => {
      const boss = new CyberDreadnought(game);
      expect(boss.phase).toBe('INTRO');

      // 1. Massive 10.0s lag spike during INTRO descends to targetY and enters PHASE_1
      boss.update(10.0, 112, 250);
      expect(boss.y).toBe(boss.targetY);
      expect(boss.phase).toBe('PHASE_1');
      expect(Number.isFinite(boss.x)).toBe(true);
      expect(Number.isFinite(boss.y)).toBe(true);

      // 2. Set into TRANSITION_1_2 and trigger 10.0s lag spike
      boss.phase = 'TRANSITION_1_2';
      boss.invulnerableTimer = 1.5;
      boss.update(10.0, 112, 250);

      // Must land on PHASE_2, NOT skip to DEFEATED
      expect(boss.phase).toBe('PHASE_2');
      expect(boss.isDefeated).toBe(false);

      // 3. Set into DEFEATED and trigger 10.0s lag spike
      boss.phase = 'DEFEATED';
      boss.defeatTimer = 2.5;
      boss.update(10.0, 112, 250);
      expect(boss.active).toBe(false);
      expect(boss.state).toBe(EnemyState.INACTIVE);
    });

    it('verifies GameLoop sanitization discards negative and NaN dt spikes before dispatching to boss', () => {
      game.scoreManager.reset(3, 10);
      game.setState('STAGE_INTRO');
      game.stateTimer = 2.5;
      game.update(1 / 60);

      const boss = game.bossManager.activeBoss!;
      expect(boss).not.toBeNull();
      const originX = boss.x;
      const originY = boss.y;

      // 1. Step with negative delta time (e.g. system clock NTP jump)
      game.gameLoop.step(-5.0);
      expect(boss.x).toBe(originX);
      expect(boss.y).toBe(originY);
      expect(Number.isNaN(boss.stateTimer)).toBe(false);

      // 2. Step with NaN delta time
      game.gameLoop.step(NaN);
      expect(boss.x).toBe(originX);
      expect(boss.y).toBe(originY);
      expect(Number.isNaN(boss.stateTimer)).toBe(false);

      // 3. Step with dt = 0
      game.gameLoop.step(0);
      expect(Number.isFinite(boss.x)).toBe(true);
      expect(Number.isFinite(boss.y)).toBe(true);

      // 4. Step with dt = 10.0s (clamped to maxDelta 0.1s by GameLoop accumulator)
      game.gameLoop.step(10.0);
      expect(Number.isFinite(boss.x)).toBe(true);
      expect(Number.isFinite(boss.y)).toBe(true);
      expect(Number.isNaN(boss.x)).toBe(false);
      expect(Number.isNaN(boss.y)).toBe(false);
    });

    it('survives 1,000 subnormal micro-ticks (dt = 1e-6s) without numerical underflow or NaN on all 5 bosses', () => {
      const bosses = [
        new CyberDreadnought(game),
        new DimensionalLeviathan(game),
        new NaniteColossus(game),
        new PsionicHarbinger(game),
        new AeternumCore(game),
      ];

      for (const b of bosses) {
        b.phase = 'PHASE_1';
        for (let t = 0; t < 1000; t++) {
          b.update(1e-6, 112, 250);
        }
        expect(Number.isFinite(b.x)).toBe(true);
        expect(Number.isFinite(b.y)).toBe(true);
        expect(Number.isNaN(b.stateTimer)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Suite 3: Stage Progression Continuity Across All 50 Stages
  // ==========================================================================
  describe('3. Stage Progression Continuity (Stages 1 to 50 + Prestige)', () => {
    it('seamlessly traverses all 50 stages including boss stages 10, 20, 30, 40, 50 and prestige to Stage 51', () => {
      game.startGame();

      let currentStage = 1;
      const visitedStages: number[] = [];
      const verifiedBossStages: number[] = [];

      for (let cycle = 0; cycle < 150 && currentStage <= 50; cycle++) {
        visitedStages.push(game.stage);

        // 1. Fast-forward STAGE_INTRO
        if (game.state === 'STAGE_INTRO') {
          game.stateTimer = 2.5;
          game.update(1 / 60);
        }

        const isChallenging = DifficultyCalculator.isChallengingStage(game.stage);
        const isBoss = DifficultyCalculator.isBossStage(game.stage);

        // 2. Boss Encounter Handling
        if (isBoss) {
          verifiedBossStages.push(game.stage);
          expect(game.bossManager.isBossActive()).toBe(true);
          const boss = game.bossManager.activeBoss!;
          expect(boss).toBeInstanceOf(BaseBoss);

          // Fast-forward boss intro descent so it enters PHASE_1
          boss.update(2.5, 112, 250);
          expect(boss.phase).toBe('PHASE_1');

          // Eliminate sub-units & boss
          for (const sub of boss.subUnits) {
            sub.active = false;
          }
          boss.takeDamage(1000);
          expect(boss.phase).toBe('DEFEATED');
          boss.defeatTimer = 0;
          boss.update(0.1, 112, 250);
          expect(boss.active).toBe(false);
        }

        // 3. Clear remaining enemy formation
        for (const e of game.formationManager.enemies) {
          e.active = false;
        }
        if (isChallenging) {
          game.formationManager.currentSubWave = 5;
        } else {
          game.formationManager.isEntryWaveActive = false;
        }

        // 4. Update formation manager to trigger stage clear
        game.formationManager.update(1 / 60, 112, 250);
        expect(game.state).toBe('STAGE_CLEAR');

        // 5. Fast-forward STAGE_CLEAR to advance stage
        game.stateTimer = 3.0;
        game.update(1 / 60);

        expect(game.stage).toBe(currentStage + 1);
        currentStage = game.stage;
      }

      // Assertions on full trajectory
      expect(currentStage).toBe(51);
      expect(verifiedBossStages).toEqual([10, 20, 30, 40, 50]);
      expect(new Set(visitedStages).size).toBe(50);
      expect(game.state).toBe('STAGE_INTRO');
    });
  });

  // ==========================================================================
  // Suite 4: Pre-Allocated Array Integrity & Zero Dynamic Allocations (1,000 Ticks)
  // ==========================================================================
  describe('4. Pre-Allocated Array Integrity & Zero-Leak Invariant', () => {
    it('maintains strictly invariant array lengths across 1,000 tick updates on all 5 bosses', () => {
      // 1. Cyber Dreadnought: subUnits invariant
      const b10 = new CyberDreadnought(game);
      b10.phase = 'PHASE_2';
      const b10SubUnitLen = b10.subUnits.length;
      for (let t = 0; t < 1000; t++) {
        b10.update(1 / 60, 112, 250);
        game.bulletManager.update(1 / 60);
      }
      expect(b10.subUnits.length).toBe(b10SubUnitLen);

      // 2. Dimensional Leviathan: tears and shockwaves invariant
      const b20 = new DimensionalLeviathan(game);
      b20.phase = 'PHASE_2';
      const b20TearsLen = b20.tears.length;
      const b20ShockLen = b20.shockwaves.length;
      for (let t = 0; t < 1000; t++) {
        b20.update(1 / 60, 112, 250);
        game.bulletManager.update(1 / 60);
      }
      expect(b20.tears.length).toBe(b20TearsLen);
      expect(b20.shockwaves.length).toBe(b20ShockLen);

      // 3. Nanite Colossus: constructs and clouds invariant
      const b30 = new NaniteColossus(game);
      b30.phase = 'PHASE_2';
      const b30ConstructsLen = b30.miniConstructs.length;
      const b30CloudsLen = b30.clouds.length;
      for (let t = 0; t < 1000; t++) {
        b30.update(1 / 60, 112, 250);
        game.bulletManager.update(1 / 60);
      }
      expect(b30.miniConstructs.length).toBe(b30ConstructsLen);
      expect(b30.clouds.length).toBe(b30CloudsLen);

      // 4. Psionic Harbinger: subUnits invariant
      const b40 = new PsionicHarbinger(game);
      b40.phase = 'PHASE_2';
      const b40SubUnitLen = b40.subUnits.length;
      for (let t = 0; t < 1000; t++) {
        b40.update(1 / 60, 112, 250);
        game.bulletManager.update(1 / 60);
      }
      expect(b40.subUnits.length).toBe(b40SubUnitLen);

      // 5. Aeternum Core: satellites invariant
      const b50 = new AeternumCore(game);
      b50.phase = 'PHASE_3';
      const b50SatellitesLen = b50.satellites.length;
      for (let t = 0; t < 1000; t++) {
        b50.update(1 / 60, 112, 250);
        game.bulletManager.update(1 / 60);
      }
      expect(b50.satellites.length).toBe(b50SatellitesLen);
    });

    it('enforces enemy bullet pool bounds (<= 256) under continuous 1,000 tick Aeternum Core bullet hell barrage', () => {
      const b50 = new AeternumCore(game);
      b50.phase = 'PHASE_3';
      b50.invulnerableTimer = 0;

      // 1,000 frames of dual 6-arm counter-rotating spiral bullet hell
      for (let t = 0; t < 1000; t++) {
        b50.update(1 / 60, 112, 250);
        game.bulletManager.update(1 / 60);
      }

      const activeEnemyBullets = game.bulletManager.getEnemyBulletCount();
      const pool = game.bulletManager.getPool();
      const capacity = pool.getCapacity();
      const maxSize = pool.getMaxSize();

      expect(maxSize).toBe(BULLET_CONFIG.POOL_MAX_SIZE);
      expect(maxSize).toBe(256);
      expect(capacity).toBeLessThanOrEqual(maxSize);
      expect(activeEnemyBullets).toBeGreaterThan(0);
      expect(activeEnemyBullets).toBeLessThanOrEqual(capacity);
    });
  });
});
