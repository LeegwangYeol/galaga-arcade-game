/**
 * Galaga Arcade Web Game — Milestone 10 Adversarial Challenger Test Suite
 * Crisis State & Lifecycle Challenger (m10_challenger_1)
 *
 * Empirical Adversarial Verification:
 * 1. Simulated 100-Stage Progression:
 *    - Invariant: Crises NEVER trigger on stages 1–10 across any rolls or configurations.
 *    - Invariant: Crises NEVER trigger on Challenging Stages (3, 7, 11, 15, ..., 99).
 *    - Invariant: Crises trigger reliably on eligible combat stages (40% rate + cooldown).
 *    - Invariant: Cooldown enforcement guarantees no back-to-back crisis stages.
 * 2. Stage 12 Guaranteed Debut:
 *    - Invariant: Unconditional trigger on Stage 12 regardless of Math.random roll or 0% prob.
 *    - Invariant: Transitions cleanly into WARNING (3.0s) -> ACTIVE (20.0s) -> IDLE.
 *    - Invariant: Klaxon audio and telemetry updated accurately on debut.
 * 3. 100-Cycle Rapid Trigger & Deactivate Loop:
 *    - Invariant: Zero state leaks across all 11 crisis events (starfield speed, formation intervals, diver quotas).
 *    - Invariant: Zero object pool growth or dangling entities (bullets, particles, phantoms, spores, shrapnel).
 *    - Invariant: Immediate cleanup on mid-warning teardown, stage clear, and reset.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CrisisEventManager } from '../../src/core/crisis/CrisisEventManager';
import { CrisisEventFactory } from '../../src/core/crisis/CrisisEventFactory';
import { CrisisEventType, type CrisisEventContext } from '../../src/core/crisis/types';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { Player } from '../../src/entities/Player';
import { BulletManager } from '../../src/entities/Bullet';
import { FormationManager } from '../../src/systems/FormationManager';
import { Starfield } from '../../src/systems/Starfield';
import { ParticleSystem } from '../../src/systems/ParticleSystem';
import { ScoreManager } from '../../src/systems/ScoreManager';

// Concrete Event Classes for direct testing
import { ThePrethorynScourgeEvent } from '../../src/core/crisis/events/ThePrethorynScourgeEvent';
import { HyperspaceStormEvent } from '../../src/core/crisis/events/HyperspaceStormEvent';
import { NaniteCloudEvent } from '../../src/core/crisis/events/NaniteCloudEvent';
import { PsionicResonanceEvent } from '../../src/core/crisis/events/PsionicResonanceEvent';
import { NemesisStarEaterEvent } from '../../src/core/crisis/events/NemesisStarEaterEvent';

interface MockGameEnvironment {
  game: any;
  player: Player;
  bulletManager: BulletManager;
  formationManager: FormationManager;
  starfield: Starfield;
  particleSystem: ParticleSystem;
  scoreManager: ScoreManager;
  klaxonSpy: ReturnType<typeof vi.fn>;
}

function createMockGameEnvironment(stage: number = 12): MockGameEnvironment {
  const player = new Player();
  const bulletManager = new BulletManager();
  const formationManager = new FormationManager();
  const starfield = new Starfield(224, 288, 100);
  const particleSystem = new ParticleSystem();
  const scoreManager = new ScoreManager();
  const klaxonSpy = vi.fn();

  const game = {
    stage,
    player,
    bulletManager,
    formationManager,
    starfield,
    particleSystem,
    scoreManager,
    soundSynth: {
      playCrisisKlaxon: klaxonSpy,
      playLaser: vi.fn(),
      playExplosion: vi.fn(),
    },
    hud: {},
  };

  return {
    game,
    player,
    bulletManager,
    formationManager,
    starfield,
    particleSystem,
    scoreManager,
    klaxonSpy,
  };
}

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    globalAlpha: 1.0,
    fillStyle: '#FFFFFF',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  } as unknown as CanvasRenderingContext2D;
}

describe('Milestone 10 Challenger 1: Crisis State & Lifecycle Adversarial Suite', () => {
  let env: MockGameEnvironment;
  let mockCtx: CanvasRenderingContext2D;

  const ALL_11_CRISIS_TYPES: CrisisEventType[] = [
    CrisisEventType.THE_CONTINGENCY,
    CrisisEventType.THE_UNBIDDEN,
    CrisisEventType.THE_PRETHORYN_SCOURGE,
    CrisisEventType.SHIELD_OVERLOAD,
    CrisisEventType.PHYSICS_INVERSION,
    CrisisEventType.HYPERSPACE_STORM,
    CrisisEventType.NANITE_CLOUD,
    CrisisEventType.PSIONIC_RESONANCE,
    CrisisEventType.DEVOURING_SWARM_FRENZY,
    CrisisEventType.NEMESIS_STAR_EATER,
    CrisisEventType.TIME_DILATION_FIELD,
  ];

  beforeEach(() => {
    CrisisEventFactory.registerDefaults();
    env = createMockGameEnvironment(12);
    mockCtx = createMockCanvasContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Dimension 1: Simulated 100-Stage Progression & Stage Gating Invariants
  // ==========================================================================
  describe('Dimension 1: Simulated 100-Stage Progression & Stage Gating Invariants', () => {
    it('invariant: crises NEVER trigger on stages 1–10 under any circumstances', () => {
      const manager = new CrisisEventManager(env.game);

      // Adversarial test: force Math.random to 0.0 (guaranteed roll if eligible)
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      for (let s = 1; s <= 10; s++) {
        const result = manager.evaluateStageTrigger(s);
        expect(result, `Stage ${s} must never trigger a crisis`).toBeNull();
        expect(manager.getState()).toBe('IDLE');
        expect(manager.getActiveCrisis()).toBeNull();
        expect(manager.getLastCrisisStage()).toBe(-1);
      }

      // Also assert with extreme/negative/zero stage numbers
      expect(manager.evaluateStageTrigger(0)).toBeNull();
      expect(manager.evaluateStageTrigger(-5)).toBeNull();
    });

    it('invariant: crises NEVER trigger on Challenging Stages across stages 1–100', () => {
      const manager = new CrisisEventManager(env.game);

      // Force roll to 0.0 (would trigger if stage were eligible)
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      // Explicit list from authoritative specification + formula check
      const knownChallengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];

      for (const stage of knownChallengingStages) {
        const result = manager.evaluateStageTrigger(stage);
        expect(result, `Explicit challenging stage ${stage} must never trigger a crisis`).toBeNull();
        expect(manager.getState()).toBe('IDLE');
      }

      // General check across all stages 1 to 100
      for (let s = 1; s <= 100; s++) {
        if (DifficultyCalculator.isChallengingStage(s)) {
          const result = manager.evaluateStageTrigger(s);
          expect(result, `Challenging stage ${s} (s % 4 === 3) must never trigger a crisis`).toBeNull();
          expect(manager.getState()).toBe('IDLE');
        }
      }
    });

    it('executes 50 simulated 100-stage runs: verifies gating, cooldown, and reliable triggering on eligible combat stages', () => {
      // Run 50 complete simulated 100-stage playthroughs
      const NUM_RUNS = 50;
      const triggerCountsPerRun: number[] = [];
      const typeTriggerDistribution = new Map<CrisisEventType, number>();
      for (const t of ALL_11_CRISIS_TYPES) {
        typeTriggerDistribution.set(t, 0);
      }

      for (let run = 0; run < NUM_RUNS; run++) {
        const manager = new CrisisEventManager(env.game);
        let triggeredInRun = 0;
        let prevStageTriggered = false;

        for (let s = 1; s <= 100; s++) {
          const isClassic = s <= 10;
          const isChallenging = DifficultyCalculator.isChallengingStage(s);
          const crisis = manager.evaluateStageTrigger(s);

          if (crisis) {
            triggeredInRun++;
            const crisisType = crisis.type;
            typeTriggerDistribution.set(crisisType, (typeTriggerDistribution.get(crisisType) ?? 0) + 1);

            // Invariant 1: Never on stages 1-10
            expect(isClassic, `Run ${run}: Stage ${s} triggered but is <= 10`).toBe(false);

            // Invariant 2: Never on challenging stages
            expect(isChallenging, `Run ${run}: Stage ${s} triggered but is a challenging stage`).toBe(false);

            // Invariant 3: Never consecutive (cooldown enforcement)
            expect(prevStageTriggered, `Run ${run}: Back-to-back crisis triggered on stage ${s}`).toBe(false);

            prevStageTriggered = true;

            // Simulate stage completion and crisis teardown
            manager.onStageClear();
            expect(manager.getState()).toBe('IDLE');
            expect(manager.getActiveCrisis()).toBeNull();
          } else {
            prevStageTriggered = false;
          }
        }

        triggerCountsPerRun.push(triggeredInRun);

        // In 100 stages, there are:
        // - 10 Classic stages (1-10)
        // - 23 Challenging stages (11, 15, ..., 99)
        // - 67 Eligible combat stages (stages 12, 13, 14, 16, 17, 18, 20...)
        // With 40% probability and 1-stage mandatory cooldown, expected triggers: ~15-28
        expect(triggeredInRun).toBeGreaterThanOrEqual(10);
        expect(triggeredInRun).toBeLessThanOrEqual(35);
      }

      // Check average trigger rate
      const avgTriggers = triggerCountsPerRun.reduce((a, b) => a + b, 0) / NUM_RUNS;
      expect(avgTriggers).toBeGreaterThanOrEqual(15);
      expect(avgTriggers).toBeLessThanOrEqual(28);

      // Check uniform entropy: every single crisis type must be represented across 50 runs
      for (const t of ALL_11_CRISIS_TYPES) {
        const count = typeTriggerDistribution.get(t) ?? 0;
        expect(count, `Crisis type ${t} was never triggered across 50 runs`).toBeGreaterThan(15);
      }
    });

    it('asserts milestone guaranteed rounds (Stage 12, 25, 50) trigger when eligible', () => {
      // Test with Math.random returning 0.999 (roll failure)
      vi.spyOn(Math, 'random').mockReturnValue(0.999);

      const manager = new CrisisEventManager(env.game);

      // Stage 12: Guaranteed debut
      const c12 = manager.evaluateStageTrigger(12);
      expect(c12, 'Stage 12 must trigger even when roll is 0.999').not.toBeNull();
      manager.onStageClear();

      // Advance to 24 (combat stage, not guaranteed, should fail roll 0.999)
      const c24 = manager.evaluateStageTrigger(24);
      expect(c24).toBeNull();

      // Stage 25: Guaranteed milestone boss round
      const c25 = manager.evaluateStageTrigger(25);
      expect(c25, 'Stage 25 must trigger even when roll is 0.999').not.toBeNull();
      manager.onStageClear();

      // Advance to 49 (combat stage, should fail roll 0.999)
      const c49 = manager.evaluateStageTrigger(49);
      expect(c49).toBeNull();

      // Stage 50: Guaranteed milestone finale round
      const c50 = manager.evaluateStageTrigger(50);
      expect(c50, 'Stage 50 must trigger even when roll is 0.999').not.toBeNull();
      manager.onStageClear();
    });
  });

  // ==========================================================================
  // Dimension 2: Stage 12 Guaranteed Debut Assertion & Deep Lifecycle
  // ==========================================================================
  describe('Dimension 2: Stage 12 Guaranteed Debut Assertion & Deep Lifecycle', () => {
    it('empirically asserts Stage 12 guaranteed debut invariants under adversarial configuration', () => {
      // Configuration with triggerProbability explicitly set to 0.0
      const manager = new CrisisEventManager(env.game, {
        triggerProbability: 0.0,
      });

      // Advance from Stage 1 to 11
      for (let s = 1; s <= 11; s++) {
        expect(manager.evaluateStageTrigger(s)).toBeNull();
      }

      // Assert Stage 12 debut
      const crisis = manager.evaluateStageTrigger(12);
      expect(crisis, 'Stage 12 debut must trigger even when triggerProbability is 0.0').not.toBeNull();
      expect(manager.getState()).toBe('WARNING');
      expect(manager.getLastCrisisStage()).toBe(12);
      expect(manager.getTotalCrisesTriggered()).toBe(1);
      expect(manager.getCrisisHistory().length).toBe(1);
      expect(manager.getActiveCrisis()).toBe(crisis);

      // Verify Warning countdown and audio alarm
      expect(manager.getWarningTimer()).toBe(3.0);
      expect(manager.getCurrentWarningDuration()).toBe(3.0);
      expect(env.klaxonSpy).toHaveBeenCalledTimes(1);

      // Verify metadata of debut crisis
      expect(crisis!.name.length).toBeGreaterThan(0);
      expect(crisis!.flavorText.length).toBeGreaterThan(0);
      expect(crisis!.warningDuration).toBe(3.0);
      expect(crisis!.activeDuration).toBe(20.0);
    });

    it('verifies 3-second WARNING -> 20-second ACTIVE -> IDLE complete temporal progression', () => {
      const manager = new CrisisEventManager(env.game);
      const crisis = manager.evaluateStageTrigger(12);
      expect(crisis).not.toBeNull();

      // State is WARNING
      expect(manager.getState()).toBe('WARNING');
      expect(crisis!.state).toBe('WARNING');

      // Tick 1.0s (WARNING remains)
      manager.update(1.0);
      expect(manager.getState()).toBe('WARNING');
      expect(manager.getWarningTimer()).toBeCloseTo(2.0, 2);

      // Render during warning does not throw
      expect(() => manager.render(mockCtx)).not.toThrow();

      // Tick 2.05s (Exhaust 3.0s warning timer)
      manager.update(2.05);
      expect(manager.getState()).toBe('ACTIVE');
      expect(crisis!.state).toBe('ACTIVE');
      expect(manager.getActiveTimer()).toBeCloseTo(20.0, 1);

      // Tick 10.0s into ACTIVE
      manager.update(10.0);
      expect(manager.getState()).toBe('ACTIVE');
      expect(manager.getActiveTimer()).toBeCloseTo(10.0, 1);

      // Render during active does not throw
      expect(() => manager.render(mockCtx)).not.toThrow();

      // Tick remaining 10.5s to exhaust active duration
      manager.update(10.5);
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
      expect(crisis!.state).toBe('COMPLETED');
      expect(crisis!.isComplete()).toBe(true);
    });

    it('asserts immediate cleanup on mid-warning teardown and stage clear', () => {
      const manager = new CrisisEventManager(env.game);
      manager.evaluateStageTrigger(12);
      expect(manager.getState()).toBe('WARNING');

      // Clearing mid-warning restores IDLE immediately
      manager.clearCrisis();
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
      expect(manager.getWarningTimer()).toBe(0);
      expect(manager.getActiveTimer()).toBe(0);

      // Trigger again and test onStageClear
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      manager.evaluateStageTrigger(14);
      expect(manager.getState()).toBe('WARNING');
      manager.update(3.1); // Enter ACTIVE
      expect(manager.getState()).toBe('ACTIVE');

      manager.onStageClear();
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
    });

    it('asserts reset() clears history, telemetry, and active crisis', () => {
      const manager = new CrisisEventManager(env.game);
      manager.evaluateStageTrigger(12);
      manager.update(5.0);

      manager.reset();
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
      expect(manager.getLastCrisisStage()).toBe(-1);
      expect(manager.getTotalCrisesTriggered()).toBe(0);
      expect(manager.getCrisisHistory().length).toBe(0);
    });
  });

  // ==========================================================================
  // Dimension 3: 100-Cycle Rapid Trigger & Deactivate Loop: State & Memory Invariants
  // ==========================================================================
  describe('Dimension 3: 100-Cycle Rapid Trigger & Deactivate Loop (Memory & State Leaks)', () => {
    it('executes 100 rapid trigger & deactivate cycles across all 11 crises: asserts starfield speed, formation intervals, diver quotas reset to baseline', () => {
      const manager = new CrisisEventManager(env.game);

      // Set baseline state in formation manager and starfield
      const baselineDiveInterval = 2.5;
      const baselineMaxDivers = 3;
      const baselineDiveSpeedMultiplier = 1.25;

      env.formationManager.diveInterval = baselineDiveInterval;
      env.formationManager.maxConcurrentDivers = baselineMaxDivers;
      env.formationManager.diveSpeedMultiplier = baselineDiveSpeedMultiplier;
      env.starfield.setTargetSpeedMultiplier(1.0);
      env.starfield.setSpeedState('NORMAL');

      expect(env.starfield.getSpeedMultiplier()).toBe(1.0);
      expect(env.formationManager.diveInterval).toBe(baselineDiveInterval);
      expect(env.formationManager.maxConcurrentDivers).toBe(baselineMaxDivers);

      // Execute 100 rapid cycles
      for (let cycle = 0; cycle < 100; cycle++) {
        const crisisType = ALL_11_CRISIS_TYPES[cycle % ALL_11_CRISIS_TYPES.length]!;

        // 1. Force activate
        const crisis = manager.forceActivate(crisisType, 12);
        expect(manager.getState()).toBe('ACTIVE');
        expect(crisis.state).toBe('ACTIVE');

        // 2. Simulate combat frames (dt = 0.016s * 10 frames = 0.16s)
        for (let f = 0; f < 10; f++) {
          manager.update(0.016);
          manager.render(mockCtx);
        }

        // 3. Deactivate cycle
        manager.clearCrisis();

        // 4. Invariant Assertions
        // Manager state
        expect(manager.getState(), `Cycle ${cycle} (${crisisType}): state should be IDLE`).toBe('IDLE');
        expect(manager.getActiveCrisis(), `Cycle ${cycle} (${crisisType}): active crisis should be null`).toBeNull();
        expect(crisis.isComplete(), `Cycle ${cycle} (${crisisType}): crisis isComplete() should be true`).toBe(true);

        // Starfield speed baseline restoration
        expect(
          env.starfield.getSpeedMultiplier(),
          `Cycle ${cycle} (${crisisType}): starfield speed multiplier leaked`
        ).toBe(1.0);

        // Formation interval baseline restoration
        expect(
          env.formationManager.diveInterval,
          `Cycle ${cycle} (${crisisType}): formation diveInterval leaked`
        ).toBe(baselineDiveInterval);

        // Max concurrent divers quota baseline restoration
        expect(
          env.formationManager.maxConcurrentDivers,
          `Cycle ${cycle} (${crisisType}): formation maxConcurrentDivers leaked`
        ).toBe(baselineMaxDivers);

        // Bullet & Particle zero leak assertion
        expect(env.bulletManager.getPlayerBulletCount()).toBe(0);
        expect(env.bulletManager.getEnemyBulletCount()).toBe(0);
        expect(env.particleSystem.getActiveCount()).toBe(0);
      }
    });

    it('verifies deep internal zero-leak state across specific crisis pools after deactivation', () => {
      const context: CrisisEventContext = {
        game: env.game,
        player: env.player,
        bulletManager: env.bulletManager,
        formationManager: env.formationManager,
        starfield: env.starfield,
        particleSystem: env.particleSystem,
        scoreManager: env.scoreManager,
        stage: 12,
      };

      // 1. Psionic Resonance (6 Phantoms)
      const psionic = new PsionicResonanceEvent();
      psionic.init(context);
      psionic.onActivate();
      expect(psionic.phantoms.length).toBe(6);
      psionic.onDeactivate();
      expect(psionic.phantoms.length, 'Phantoms must be cleared after deactivation').toBe(0);

      // 2. Prethoryn Scourge (Spore Pool)
      const scourge = new ThePrethorynScourgeEvent();
      scourge.init(context);
      scourge.onActivate();
      // Activate a spore
      const spores = (scourge as any).sporePool;
      expect(spores.length).toBe(32);
      spores[0].active = true;
      scourge.onDeactivate();
      for (let i = 0; i < spores.length; i++) {
        expect(spores[i].active, `Spore ${i} should be deactivated`).toBe(false);
      }

      // 3. Nanite Cloud (Shrapnel Pool)
      const nanite = new NaniteCloudEvent();
      nanite.init(context);
      nanite.onActivate();
      const shrapnel = (nanite as any).shrapnelPool;
      expect(shrapnel.length).toBe(32);
      shrapnel[0].life = 0; // mark active
      nanite.onDeactivate();
      for (let i = 0; i < shrapnel.length; i++) {
        expect(shrapnel[i].life, `Shrapnel ${i} life should equal maxLife`).toBe(shrapnel[i].maxLife);
      }

      // 4. Hyperspace Storm (Lightning Lanes)
      const storm = new HyperspaceStormEvent();
      storm.init(context);
      storm.onActivate();
      (storm as any).laneState = 'STRIKING';
      (storm as any).activeLane = 3;
      storm.onDeactivate();
      expect((storm as any).laneState).toBe('IDLE');
      expect((storm as any).activeLane).toBe(-1);

      // 5. Nemesis Star-Eater (Beam State)
      const nemesis = new NemesisStarEaterEvent();
      nemesis.init(context);
      nemesis.onActivate();
      nemesis.beamState = 'FIRING';
      nemesis.onDeactivate();
      expect(nemesis.beamState).toBe('IDLE');
    });

    it('stress test: 100 rapid mid-warning abortions (rapid cancel churn)', () => {
      const manager = new CrisisEventManager(env.game);

      for (let i = 0; i < 100; i++) {
        const type = ALL_11_CRISIS_TYPES[i % ALL_11_CRISIS_TYPES.length]!;
        manager.triggerCrisis(type, 12);
        expect(manager.getState()).toBe('WARNING');

        // Tick partially through warning (e.g. 0.05s)
        manager.update(0.05);

        // Immediate cancel
        manager.clearCrisis();
        expect(manager.getState()).toBe('IDLE');
        expect(manager.getActiveCrisis()).toBeNull();
      }

      expect(manager.getTotalCrisesTriggered()).toBe(100);
      expect(manager.getCrisisHistory().length).toBe(100);
    });

    it('endurance test: continuous 500-frame combat simulation with alternating crises', () => {
      const manager = new CrisisEventManager(env.game);
      env.formationManager.spawnStage(12);

      // Spawn 10 active player bullets and 5 enemy bullets
      for (let i = 0; i < 5; i++) {
        env.bulletManager.firePlayerBullet(50 + i * 20, 200);
        env.bulletManager.fireEnemyBullet(50 + i * 20, 100, 50 + i * 20, 250, 180);
      }

      // Run 500 simulation frames
      for (let frame = 0; frame < 500; frame++) {
        // Trigger crisis every 100 frames
        if (frame % 100 === 0) {
          const type = ALL_11_CRISIS_TYPES[(frame / 100) % ALL_11_CRISIS_TYPES.length]!;
          manager.forceActivate(type, 12);
        }

        // Deactivate at frame 80 of cycle
        if (frame % 100 === 80) {
          manager.clearCrisis();
        }

        manager.update(0.016);
        manager.render(mockCtx);
      }

      // Final cleanup
      manager.clearCrisis();
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
    });
  });
});
