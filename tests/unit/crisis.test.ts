/**
 * Galaga Arcade Web Game — Comprehensive Crisis Subsystem Unit Tests
 * Milestone 10: 11 Stellaris Crisis Events, Factory Pattern, Manager Lifecycle & Endurance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CrisisEventFactory } from '../../src/core/crisis/CrisisEventFactory';
import { CrisisEventManager } from '../../src/core/crisis/CrisisEventManager';
import { CrisisEventType, type CrisisEventContext } from '../../src/core/crisis/types';
import { Player } from '../../src/entities/Player';
import { BulletManager } from '../../src/entities/Bullet';
import { FormationManager } from '../../src/systems/FormationManager';
import { Starfield } from '../../src/systems/Starfield';
import { ParticleSystem } from '../../src/systems/ParticleSystem';
import { ScoreManager } from '../../src/systems/ScoreManager';
import { Game } from '../../src/core/Game';

// Concrete Event Imports
import { TheContingencyEvent } from '../../src/core/crisis/events/TheContingencyEvent';
import { TheUnbiddenEvent } from '../../src/core/crisis/events/TheUnbiddenEvent';
import { ThePrethorynScourgeEvent } from '../../src/core/crisis/events/ThePrethorynScourgeEvent';
import { ShieldOverloadEvent } from '../../src/core/crisis/events/ShieldOverloadEvent';
import { PhysicsInversionEvent } from '../../src/core/crisis/events/PhysicsInversionEvent';
import { HyperspaceStormEvent } from '../../src/core/crisis/events/HyperspaceStormEvent';
import { NaniteCloudEvent } from '../../src/core/crisis/events/NaniteCloudEvent';
import { PsionicResonanceEvent } from '../../src/core/crisis/events/PsionicResonanceEvent';
import { DevouringSwarmFrenzyEvent } from '../../src/core/crisis/events/DevouringSwarmFrenzyEvent';
import { NemesisStarEaterEvent } from '../../src/core/crisis/events/NemesisStarEaterEvent';
import { TimeDilationFieldEvent } from '../../src/core/crisis/events/TimeDilationFieldEvent';

function createMockContext(overrides: Partial<CrisisEventContext> = {}): CrisisEventContext {
  const player = new Player();
  const bulletManager = new BulletManager();
  const formationManager = new FormationManager();
  const starfield = new Starfield();
  const particleSystem = new ParticleSystem();
  const scoreManager = new ScoreManager();

  return {
    game: {
      stage: 12,
      soundSynth: {
        playCrisisKlaxon: vi.fn(),
        playLaser: vi.fn(),
        playExplosion: vi.fn(),
      },
    },
    player,
    bulletManager,
    formationManager,
    starfield,
    particleSystem,
    soundSynth: {
      playCrisisKlaxon: vi.fn(),
      playLaser: vi.fn(),
      playExplosion: vi.fn(),
    },
    scoreManager,
    stage: 12,
    ...overrides,
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

describe('Milestone 10: Stellaris Crisis Engine & 11 Crisis Events (`tests/unit/crisis.test.ts`)', () => {
  let context: CrisisEventContext;
  let mockCtx: CanvasRenderingContext2D;

  const allExpectedTypes: CrisisEventType[] = [
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
    context = createMockContext();
    mockCtx = createMockCanvasContext();
  });

  // ==========================================================================
  // Suite 1: Factory Registration & Enumeration
  // ==========================================================================
  describe('Suite 1: CrisisEventFactory Registration & Enumeration', () => {
    it('registers exactly 11 distinct crisis event types', () => {
      const registeredTypes = CrisisEventFactory.getAllTypes();
      expect(registeredTypes.length).toBe(11);
      for (const type of allExpectedTypes) {
        expect(registeredTypes).toContain(type);
        expect(CrisisEventFactory.isRegistered(type)).toBe(true);
      }
    });

    it('instantiates each of the 11 events with valid metadata and IDLE state', () => {
      for (const type of allExpectedTypes) {
        const event = CrisisEventFactory.create(type, context);
        expect(event.type).toBe(type);
        expect(event.name.length).toBeGreaterThan(0);
        expect(event.flavorText.length).toBeGreaterThan(0);
        expect(event.warningDuration).toBe(3.0);
        expect(event.activeDuration).toBe(20.0);
        expect(event.state).toBe('IDLE');

        const meta = CrisisEventFactory.getMetadata(type);
        expect(meta).toBeDefined();
        expect(meta?.type).toBe(type);
      }
    });

    it('throws when creating an unregistered crisis event type', () => {
      expect(() => {
        CrisisEventFactory.create('NON_EXISTENT_CRISIS' as any, context);
      }).toThrow(/Unregistered crisis event type/);
    });

    it('supports getRandomType with and without exclude', () => {
      const randomType = CrisisEventFactory.getRandomType();
      expect(allExpectedTypes).toContain(randomType);

      const excluded = CrisisEventType.THE_CONTINGENCY;
      for (let i = 0; i < 20; i++) {
        const rand = CrisisEventFactory.getRandomType(excluded);
        expect(rand).not.toBe(excluded);
      }
    });

    it('supports unregister and clearRegistry for isolated tests', () => {
      expect(CrisisEventFactory.unregister(CrisisEventType.THE_CONTINGENCY)).toBe(true);
      expect(CrisisEventFactory.isRegistered(CrisisEventType.THE_CONTINGENCY)).toBe(false);

      CrisisEventFactory.clearRegistry();
      expect(CrisisEventFactory.getRegisteredCount()).toBe(0);

      // Re-bootstrap defaults
      CrisisEventFactory.registerDefaults();
      expect(CrisisEventFactory.getRegisteredCount()).toBe(11);
    });
  });

  // ==========================================================================
  // Suite 2: 5-Phase Lifecycle Contract Verification Across all 11 Events
  // ==========================================================================
  describe('Suite 2: 5-Phase Lifecycle Contract Verification Across all 11 Events', () => {
    allExpectedTypes.forEach((type) => {
      describe(`Lifecycle verification for ${type}`, () => {
        it('executes Phase 1 (Init) -> Phase 2 (Warning) -> Phase 3 (Active) -> Phase 4 (Update/Render) -> Phase 5 (Teardown/Reset)', () => {
          const event = CrisisEventFactory.create(type, context);

          // Phase 1: Init
          expect(event.state).toBe('IDLE');
          expect(event.isComplete()).toBe(false);

          // Phase 2: Warning
          event.onWarningStart();
          expect(event.state).toBe('WARNING');
          event.update(event.warningDuration * 0.5);
          expect(event.state).toBe('WARNING');
          event.update(event.warningDuration * 0.6); // Total > 3.0s
          expect(event.state).toBe('ACTIVE');

          // Phase 3 & 4: Active Update & Canvas Render
          event.update(0.016);
          expect(() => event.render(mockCtx)).not.toThrow();

          // Phase 5: Deactivation
          event.onDeactivate();
          expect(event.state).toBe('COMPLETED');
          expect(event.isComplete()).toBe(true);

          // Reset returns to IDLE
          event.reset();
          expect(event.state).toBe('IDLE');
          expect(event.isComplete()).toBe(false);
        });
      });
    });
  });

  // ==========================================================================
  // Suite 3: CrisisEventManager Stage Progression & Evaluation
  // ==========================================================================
  describe('Suite 3: CrisisEventManager Stage Progression & Lifecycle', () => {
    let manager: CrisisEventManager;

    beforeEach(() => {
      manager = new CrisisEventManager(context.game as any);
    });

    it('never triggers crisis on stages <= 10', () => {
      for (let s = 1; s <= 10; s++) {
        expect(manager.evaluateStageTrigger(s)).toBeNull();
      }
    });

    it('never triggers crisis on challenging stages', () => {
      const challengingStages = [11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
      for (const s of challengingStages) {
        expect(manager.evaluateStageTrigger(s)).toBeNull();
      }
    });

    it('guarantees crisis trigger on Stage 12 (first post-10 combat stage)', () => {
      const crisis = manager.evaluateStageTrigger(12);
      expect(crisis).not.toBeNull();
      expect(manager.getState()).toBe('WARNING');
      expect(manager.getLastCrisisStage()).toBe(12);
      expect(manager.getActiveCrisis()).toBe(crisis);
    });

    it('respects stage cooldown between natural triggers', () => {
      manager.evaluateStageTrigger(12); // Triggers on 12
      expect(manager.evaluateStageTrigger(13)).toBeNull(); // Stage 13 blocked by cooldown (cooldownStages = 1)
    });

    it('transitions from WARNING to ACTIVE after 3.0s countdown', () => {
      manager.evaluateStageTrigger(12);
      expect(manager.getState()).toBe('WARNING');
      expect(manager.getWarningTimer()).toBeCloseTo(3.0, 1);

      manager.update(1.5);
      expect(manager.getState()).toBe('WARNING');
      expect(manager.getWarningTimer()).toBeCloseTo(1.5, 1);

      manager.update(1.6);
      expect(manager.getState()).toBe('ACTIVE');
      expect(manager.getActiveTimer()).toBeCloseTo(20.0, 1);
    });

    it('auto-completes crisis after active duration expires', () => {
      manager.evaluateStageTrigger(12);
      manager.update(3.1); // Transition to ACTIVE
      expect(manager.getState()).toBe('ACTIVE');

      manager.update(20.5); // Exhaust active duration
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
    });

    it('forceActivate immediately bypasses warning timer', () => {
      const event = manager.forceActivate(CrisisEventType.THE_CONTINGENCY, 12);
      expect(event).toBeDefined();
      expect(manager.getState()).toBe('ACTIVE');
      expect(manager.getWarningTimer()).toBe(0);
    });

    it('onStageClear cleans up active crisis immediately', () => {
      manager.evaluateStageTrigger(12);
      manager.update(3.1);
      expect(manager.getState()).toBe('ACTIVE');

      manager.onStageClear();
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
    });

    it('renders warning banner and hazard stripes without error during WARNING', () => {
      manager.evaluateStageTrigger(12);
      expect(manager.getState()).toBe('WARNING');
      expect(() => manager.render(mockCtx)).not.toThrow();
    });
  });

  // ==========================================================================
  // Suite 4: Crises 1–3 Mechanics (TheContingency, TheUnbidden, ThePrethorynScourge)
  // ==========================================================================
  describe('Suite 4: Events 1–3 Deep Mechanics', () => {
    it('Crisis 1 (TheContingency): predictive enemy bullet steering & fire rate glitch', () => {
      const event = new TheContingencyEvent();
      event.init(context);
      event.onActivate();

      // Position player at x: 180, enemy bullet at x: 100, y: 100
      context.player.x = 180;
      context.player.y = 250;
      const bullet = context.bulletManager.fireEnemyBullet(100, 100, 100, 250, 180);
      expect(bullet).not.toBeNull();

      event.update(0.1);
      // Enemy bullet should have steered laterally towards player x (dx > 0 -> vx > 0)
      expect(bullet!.velocity.x).toBeGreaterThan(0);

      // Verify fire cooldown glitch
      context.player.fireCooldownTimer = 0.05;
      event.update(0.1);
      expect(context.player.fireCooldownTimer).toBeGreaterThanOrEqual(0.05);

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('Crisis 2 (TheUnbidden): Plummer gravity bends player missiles toward rift center (112, 60)', () => {
      const event = new TheUnbiddenEvent();
      event.init(context);
      event.onActivate();

      // Fire player missile from x: 40, y: 150
      const bullet = context.bulletManager.firePlayerBullet(40, 150);
      expect(bullet).not.toBeNull();
      expect(bullet!.velocity.x).toBe(0);

      // Gravitational attraction from rift at (112, 60) should pull bullet rightward (dx = 112 - 40 = +72)
      event.update(0.05);
      expect(bullet!.velocity.x).toBeGreaterThan(0);

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('Crisis 3 (ThePrethorynScourge): +1 chitin shield to living enemies and spore generation', () => {
      context.formationManager.spawnStage(12);
      const livingBefore = context.formationManager.getLivingEnemies();
      expect(livingBefore.length).toBeGreaterThan(0);

      const event = new ThePrethorynScourgeEvent();
      event.init(context);
      event.onActivate();

      // Living enemies should have gained +1 shield
      for (const enemy of context.formationManager.enemies) {
        if (enemy.active && enemy.state !== 'INACTIVE') {
          expect(enemy.shield).toBeGreaterThanOrEqual(1);
        }
      }

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 5: Crises 4–6 Mechanics (ShieldOverload, PhysicsInversion, HyperspaceStorm)
  // ==========================================================================
  describe('Suite 5: Events 4–6 Deep Mechanics', () => {
    it('Crisis 4 (ShieldOverload): grants +2 kinetic shields to living enemies and renders hexes', () => {
      context.formationManager.spawnStage(12);
      const event = new ShieldOverloadEvent();
      event.init(context);
      event.onActivate();

      for (const enemy of context.formationManager.enemies) {
        if (enemy.active && enemy.state !== 'INACTIVE') {
          expect(enemy.shield).toBeGreaterThanOrEqual(2);
        }
      }

      expect(() => event.render(mockCtx)).not.toThrow();
      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('Crisis 5 (PhysicsInversion): reverses starfield upward and anti-gravity for divers', () => {
      const event = new PhysicsInversionEvent();
      event.init(context);
      event.onActivate();

      const stars = context.starfield.getStars();
      const initialStarY = stars[0]?.y ?? 50;

      event.update(0.1);
      // Stars should move upward (y decreases)
      expect(stars[0]?.y).toBeLessThan(initialStarY);

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('Crisis 6 (HyperspaceStorm): boosts enemy dive speed by +25% and cycles lightning hazard lanes', () => {
      const originalSpeed = context.formationManager.diveSpeedMultiplier;
      const event = new HyperspaceStormEvent();
      event.init(context);
      event.onActivate();

      expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(originalSpeed * 1.25, 2);

      // Cycle through lane states
      event.update(2.5); // Advance into WARNING lane
      expect(() => event.render(mockCtx)).not.toThrow();

      event.onDeactivate();
      expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(originalSpeed, 2);
      expect(event.isComplete()).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 6: Crises 7–9 Mechanics (NaniteCloud, PsionicResonance, DevouringSwarmFrenzy)
  // ==========================================================================
  describe('Suite 6: Events 7–9 Deep Mechanics', () => {
    it('Crisis 7 (NaniteCloud): dissolves player bullets entering nanite cloud cluster', () => {
      const event = new NaniteCloudEvent();
      event.init(context);
      event.onActivate();

      // Cluster 0 is at (50, 75)
      context.bulletManager.firePlayerBullet(50, 75);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);

      event.update(0.016);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(0);

      // Bullet in clear lane is untouched
      context.bulletManager.firePlayerBullet(210, 240);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);
      event.update(0.016);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('Crisis 8 (PsionicResonance): creates phantoms; shooting phantom yields 0 score and preserves real enemy count', () => {
      context.formationManager.spawnStage(12);
      const livingCountBefore = context.formationManager.getLivingCount();
      const scoreBefore = context.scoreManager.score;

      const event = new PsionicResonanceEvent();
      event.init(context);
      event.onActivate();

      expect(event.phantoms.length).toBe(6);
      const phantom = event.phantoms[0]!;

      // Fire directly at phantom
      context.bulletManager.firePlayerBullet(phantom.x, phantom.y);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);

      event.update(0.016);
      expect(phantom.active).toBe(false);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(context.scoreManager.score).toBe(scoreBefore);
      expect(context.formationManager.getLivingCount()).toBe(livingCountBefore);

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('Crisis 9 (DevouringSwarmFrenzy): overclocks dive interval, concurrency, and speed; restores baseline on deactivation', () => {
      context.formationManager.spawnStage(12);
      const originalInterval = context.formationManager.diveInterval;
      const originalDivers = context.formationManager.maxConcurrentDivers;
      const originalSpeed = context.formationManager.diveSpeedMultiplier;

      const event = new DevouringSwarmFrenzyEvent();
      event.init(context);
      event.onActivate();

      expect(context.formationManager.diveInterval).toBe(0.25);
      expect(context.formationManager.maxConcurrentDivers).toBe(8);
      expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(originalSpeed * 1.25, 2);

      event.onDeactivate();
      expect(context.formationManager.diveInterval).toBe(originalInterval);
      expect(context.formationManager.maxConcurrentDivers).toBe(originalDivers);
      expect(context.formationManager.diveSpeedMultiplier).toBe(originalSpeed);
      expect(event.isComplete()).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 7: Crises 10–11 Mechanics (NemesisStarEater, TimeDilationField)
  // ==========================================================================
  describe('Suite 7: Events 10–11 Deep Mechanics', () => {
    it('Crisis 10 (NemesisStarEater): beam charges, fires, and interacts with player', () => {
      const event = new NemesisStarEaterEvent();
      event.init(context);
      event.onActivate();

      expect(event.beamState).toBe('IDLE');
      event.update(1.6);
      expect(event.beamState).toBe('CHARGING');
      event.update(1.3);
      expect(event.beamState).toBe('FIRING');

      // Test shield absorption
      context.player.x = 112;
      event.beamX = 112;
      (context.player as any).hasShield = true;
      (context.player as any).shieldHits = 1;
      context.player.destroy = vi.fn();

      event.update(0.016);
      expect((context.player as any).shieldHits).toBe(0);
      expect((context.player as any).hasShield).toBe(false);
      expect(context.player.destroy).not.toHaveBeenCalled();

      // Test lethal hit when unshielded
      context.player.invulnerableTimer = 0;
      event.update(0.016);
      expect(context.player.destroy).toHaveBeenCalled();

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('Crisis 11 (TimeDilationField): oscillates between hyper-speed and bullet-time, then restores 1.0', () => {
      const event = new TimeDilationFieldEvent();
      event.init(context);
      event.onActivate();

      expect(event.phase).toBe('HYPER_SPEED');
      event.update(1.0);
      expect(event.currentScale).toBeGreaterThan(1.1);

      // Advance into BULLET_TIME
      event.update(3.0);
      expect(event.phase).toBe('BULLET_TIME');
      event.update(1.0);
      expect(event.currentScale).toBeLessThan(0.9);

      event.onDeactivate();
      expect(event.currentScale).toBe(1.0);
      expect(context.formationManager.diveSpeedMultiplier).toBe(1.0);
      expect((context.starfield as any).speedMultiplier).toBe(1.0);
      expect(event.isComplete()).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 8: Zero Memory Leak & Rapid Lifecycle Churn Endurance
  // ==========================================================================
  describe('Suite 8: Zero Memory Leak & Churn Invariant', () => {
    it('survives 50 rapid sequential crisis cycles with 0 pool growth and 0 leftover state', () => {
      for (let i = 0; i < 50; i++) {
        const type = CrisisEventFactory.getRandomType();
        const event = CrisisEventFactory.create(type, context);
        event.onWarningStart();
        event.update(0.1);
        event.onActivate();
        event.update(0.5);
        event.render(mockCtx);
        event.onDeactivate();
        event.reset();
      }

      // Assert zero leaks
      expect(context.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(context.bulletManager.getEnemyBulletCount()).toBe(0);
      expect(context.particleSystem.getActiveCount()).toBe(0);
      expect(context.formationManager.diveInterval).toBeGreaterThan(0);
      expect((context.starfield as any).speedMultiplier).toBe(1.0);
    });
  });

  // ==========================================================================
  // Suite 9: Headless Game.render() Fallback Mock Immunity
  // ==========================================================================
  describe('Suite 9: Headless Game.render() Fallback Mock Immunity', () => {
    it('successfully renders all 11 crisis events through Game.render() using Game fallback mock', () => {
      const game = new Game();
      (game as any).state = 'PLAYING';
      const cm = game.getCrisisEventManager();

      for (const type of Object.values(CrisisEventType)) {
        cm.forceActivate(type, 15);
        cm.update(1.0);
        expect(() => game.render()).not.toThrow();

        cm.update(5.0);
        expect(() => game.render()).not.toThrow();

        cm.update(10.0);
        expect(() => game.render()).not.toThrow();

        cm.reset();
      }
    });
  });
});
