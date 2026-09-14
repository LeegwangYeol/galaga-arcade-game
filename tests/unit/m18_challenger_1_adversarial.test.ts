import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlitchEventType } from '../../src/core/glitch/types';
import { GlitchRenderer } from '../../src/renderer/GlitchRenderer';
import { PhantomClone } from '../../src/core/glitch/PhantomClone';
import { GlitchEventManager } from '../../src/core/glitch/GlitchEventManager';
import { Enemy } from '../../src/entities/Enemy';
import { FormationManager } from '../../src/systems/FormationManager';
import { EnemyState, EnemyType } from '../../src/types';
import { Game } from '../../src/core/Game';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { FlightPathManager } from '../../src/systems/FlightPathManager';

function createMockCanvasContext(): {
  ctx: CanvasRenderingContext2D;
  getStackDepth: () => number;
} {
  let stackDepth = 0;
  const mockCtx = {
    canvas: { width: 224, height: 288 },
    imageSmoothingEnabled: false,
    fillStyle: '#000000',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
    globalAlpha: 1.0,
    globalCompositeOperation: 'source-over',
    save: vi.fn(() => {
      stackDepth++;
    }),
    restore: vi.fn(() => {
      stackDepth = Math.max(0, stackDepth - 1);
    }),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx: mockCtx,
    getStackDepth: () => stackDepth,
  };
}

describe('M18 Adversarial Challenge: Quantum Teleportation & Spline/Renderer Invariants', () => {
  beforeEach(() => {
    GlitchRenderer.initialize();
  });

  afterEach(() => {
    GlitchRenderer.reset();
  });

  it('QT-1: Extreme lateral deltas fuzzing enforces strict [-60, 60] offset clamping and [16, 208] screen bounds', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.GOEI, 0, 0, 112, 120);
    enemy.isGlitched = true;

    // Positive extreme leap
    enemy.triggerQuantumTeleport(999999);
    expect(enemy.glitchOffsetX).toBe(60);

    // Negative extreme leap
    enemy.triggerQuantumTeleport(-999999);
    expect(enemy.glitchOffsetX).toBe(-60);

    // Zero delta leap
    enemy.glitchOffsetX = 0;
    enemy.triggerQuantumTeleport(0);
    expect(enemy.glitchOffsetX).toBe(0);

    // Coordinate update with path
    enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 120 }, 112);
    enemy.state = EnemyState.DIVING_SOLO;

    // Fuzz offsets and verify screen bounds [16, 208]
    const testOffsets = [-60, -45, -30, 0, 30, 45, 60];
    for (const offset of testOffsets) {
      enemy.glitchOffsetX = offset;
      enemy.update(1 / 60, 112, 250);
      expect(Number.isNaN(enemy.x)).toBe(false);
      expect(Number.isNaN(enemy.y)).toBe(false);
      expect(enemy.x).toBeGreaterThanOrEqual(16);
      expect(enemy.x).toBeLessThanOrEqual(208);
    }
  });

  it('QT-2: Rapid consecutive teleport spam (1,000 cycles) maintains invariant stability without NaN or overflow', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    enemy.isGlitched = true;
    enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 100 }, 112);
    enemy.state = EnemyState.DIVING_SOLO;

    for (let i = 0; i < 1000; i++) {
      const delta = (Math.random() - 0.5) * 500;
      const success = enemy.triggerQuantumTeleport(delta);
      expect(success).toBe(true);
      expect(enemy.glitchOffsetX).toBeGreaterThanOrEqual(-60);
      expect(enemy.glitchOffsetX).toBeLessThanOrEqual(60);
      expect(enemy.isTeleporting).toBe(true);

      enemy.update(0.016, 112, 250);
      expect(Number.isFinite(enemy.x)).toBe(true);
      expect(Number.isFinite(enemy.y)).toBe(true);
      expect(Number.isFinite(enemy.vx)).toBe(true);
      expect(Number.isFinite(enemy.vy)).toBe(true);
      expect(Number.isFinite(enemy.rotation)).toBe(true);
    }
  });

  it('QT-3: Teleportation rendering guarantees balanced canvas save/restore stack depth even on explosion transitions', () => {
    const { ctx, getStackDepth } = createMockCanvasContext();
    const enemy = new Enemy();
    enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    enemy.isGlitched = true;
    enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 100 }, 112);
    enemy.state = EnemyState.DIVING_SOLO;

    // 1. Normal teleport render
    enemy.triggerQuantumTeleport(30);
    expect(enemy.isTeleporting).toBe(true);
    enemy.render(ctx);
    expect(getStackDepth()).toBe(0);

    // 2. Teleport timer expiration
    enemy.update(0.1, 112, 250); // dt=0.1 > 0.08 teleportTimer
    expect(enemy.isTeleporting).toBe(false);
    enemy.render(ctx);
    expect(getStackDepth()).toBe(0);

    // 3. Enemy exploding mid-teleport
    enemy.triggerQuantumTeleport(40);
    expect(enemy.isTeleporting).toBe(true);
    enemy.takeDamage(10); // Fatal damage
    expect(enemy.state).toBe(EnemyState.EXPLODING);
    enemy.render(ctx);
    expect(getStackDepth()).toBe(0);

    // 4. Enemy completely inactive mid-teleport
    enemy.active = false;
    enemy.render(ctx);
    expect(getStackDepth()).toBe(0);
  });

  it('QT-4: Path completion while isTeleporting cleanly resets teleport state without render jitter', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    enemy.isGlitched = true;
    enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 100 }, 112);
    enemy.state = EnemyState.DIVING_SOLO;

    // Advance path to near completion (1000ms of ~1400ms dive duration)
    while (enemy.state === EnemyState.DIVING_SOLO && (enemy as any).pathElapsedMs < 1000) {
      enemy.update(0.016, 112, 250);
    }

    // Trigger teleportation near end of dive
    enemy.triggerQuantumTeleport(30);
    expect(enemy.isTeleporting).toBe(true);

    // Advance until path completes
    while (enemy.state === EnemyState.DIVING_SOLO) {
      enemy.update(0.016, 112, 250);
    }

    expect(enemy.state).toBe(EnemyState.RETURNING_TO_FORMATION);
    expect(enemy.flightPath).toBeNull();

    // Remediated: Enemy.ts resets isTeleporting = false and teleportTimer = 0 on path completion
    expect(enemy.isTeleporting).toBe(false);
    expect((enemy as any).teleportTimer).toBe(0);

    // Advance 60 frames in RETURNING_TO_FORMATION (1 full second)
    for (let i = 0; i < 60; i++) {
      enemy.update(0.016, 112, 250);
    }
    expect(enemy.isTeleporting).toBe(false);
  });
});

describe('M18 Adversarial Challenge: Kinetic Inversion Anti-Gravity & Boundary Wraps', () => {
  it('KI-1: Anti-gravity upward acceleration is exactly -450 px/s^2', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.GOEI, 0, 0, 112, 120);
    enemy.isGlitched = true;
    enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 120 }, 112);
    enemy.state = EnemyState.DIVING_SOLO;

    enemy.triggerKineticInversion(1.0, 0); // zero lateral impulse to isolate vertical
    expect(enemy.glitchKinematicVy).toBe(-90);

    const dt = 0.02;
    enemy.update(dt, 112, 250);
    // After dt, glitchKinematicVy = -90 - 450 * 0.02 = -90 - 9 = -99
    expect(enemy.glitchKinematicVy).toBeCloseTo(-99, 3);
  });

  it('KI-2: Ceiling wrap guard catches y < -20 and resets kinematics to RETURNING_TO_FORMATION', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.GOEI, 0, 0, 112, 50);
    enemy.isGlitched = true;
    enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 50 }, 112);
    enemy.state = EnemyState.DIVING_SOLO;

    enemy.triggerKineticInversion(2.0, 100);

    // Force upward ascent until y < -20
    let steps = 0;
    while (enemy.state === EnemyState.DIVING_SOLO && steps < 100) {
      enemy.update(0.05, 112, 250);
      steps++;
    }

    // Invariant checks:
    expect(enemy.state).toBe(EnemyState.RETURNING_TO_FORMATION);
    expect(enemy.y).toBe(-Enemy.BASE_HEIGHT); // -16
    expect(enemy.flightPath).toBeNull();
    expect(enemy.glitchOffsetX).toBe(0);
    expect(enemy.glitchOffsetY).toBe(0);
    expect(enemy.glitchDisplacementX).toBe(0);
    expect(enemy.glitchDisplacementY).toBe(0);
    expect(enemy.glitchKinematicVx).toBe(0);
    expect(enemy.glitchKinematicVy).toBe(0);
    expect(enemy.isKineticInverted).toBe(false);
    expect(enemy.vx).toBe(0);
    expect(enemy.vy).toBeGreaterThan(0); // Descending back downward
  });

  it('KI-3: Variable dt fuzzing under gameplay limits (dt in [1e-4, 0.05]) maintains finite coordinate bounds', () => {
    const testDts = [0.0001, 0.001, 0.005, 0.0166, 0.033, 0.05];

    for (const dt of testDts) {
      const enemy = new Enemy();
      enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
      enemy.isGlitched = true;
      enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 100 }, 112);
      enemy.state = EnemyState.DIVING_SOLO;
      enemy.triggerKineticInversion(1.5, 200);

      for (let step = 0; step < 30; step++) {
        enemy.update(dt, 112, 250);
        expect(Number.isFinite(enemy.x)).toBe(true);
        expect(Number.isFinite(enemy.y)).toBe(true);
        expect(Number.isNaN(enemy.x)).toBe(false);
        expect(Number.isNaN(enemy.y)).toBe(false);
        // During diving with flightPath, x is strictly clamped to [16, 208]
        if (enemy.state === EnemyState.DIVING_SOLO && enemy.flightPath) {
          expect(enemy.x).toBeGreaterThanOrEqual(16);
          expect(enemy.x).toBeLessThanOrEqual(208);
        }
      }
    }
  });

  it('KI-4: Zero or near-zero tangent velocity does not trigger division by zero in normal calculation', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    enemy.isGlitched = true;

    // Create a mock flight path that returns (0, 0) velocity
    enemy.flightPath = {
      evaluateTime: () => ({
        position: { x: 112, y: 100 },
        velocity: { x: 0, y: 0 },
        tangent: { x: 0, y: 0 },
        heading: 0,
        distance: 0,
        isComplete: false,
      }),
    } as any;
    enemy.state = EnemyState.DIVING_SOLO;
    enemy.triggerKineticInversion(1.0, 150);

    enemy.update(0.016, 112, 250);
    expect(Number.isNaN(enemy.glitchDisplacementX)).toBe(false);
    expect(Number.isNaN(enemy.glitchDisplacementY)).toBe(false);
    expect(Number.isNaN(enemy.rotation)).toBe(false);
  });
});

describe('M18 Adversarial Challenge: Stage Clear Flow & Phantom Clone Isolation', () => {
  it('SC-1: Active phantom clones NEVER prevent stage completion when all real enemies are destroyed', () => {
    let stageClearFired = false;
    const formationManager = new FormationManager({
      onStageClear: () => {
        stageClearFired = true;
      },
    });

    formationManager.spawnStage(1);
    formationManager.isEntryWaveActive = false; // Post-entry dogfight phase
    expect(formationManager.getLivingCount()).toBe(40);

    // Destroy all real enemies
    for (const enemy of formationManager.enemies) {
      enemy.active = false;
    }
    expect(formationManager.getLivingCount()).toBe(0);

    // Spawn maximum 8 phantom clones
    for (let i = 0; i < 4; i++) {
      formationManager.spawnMirageClones(100 + i * 10, 100);
    }
    expect(formationManager.getPhantomPool().getActiveCount()).toBe(8);

    // Living count MUST remain 0 because phantoms are decoys
    expect(formationManager.getLivingCount()).toBe(0);

    // Update formation manager: must trigger stage clear immediately despite 8 active phantoms
    formationManager.update(0.016, 112, 250);
    expect(stageClearFired).toBe(true);
  });

  it('SC-2: forEachActiveSafe in FormationManager:958 cleanly drains all phantom clones on simultaneous expiry', () => {
    const formationManager = new FormationManager();
    formationManager.spawnMirageClones(112, 100);
    const pool = formationManager.getPhantomPool();
    expect(pool.getActiveCount()).toBe(2);

    // Advance 2.1s in a single frame. Both clones reach lifetime <= 0 and cleanly expire.
    // FormationManager:958 calls forEachActiveSafe, ensuring all expired clones are processed.
    formationManager.update(2.1, 112, 250);

    // Remediated: activeCount is cleanly 0
    expect(pool.getActiveCount()).toBe(0);
  });

  it('SC-3: Phantom clones absorb bullets with 0 damage, 0 score, and no shooting capabilities', () => {
    const clone = new PhantomClone();
    clone.init(100, 100, 0, 50, EnemyType.BOSS);

    expect(clone.canShoot).toBe(false);
    expect(clone.isPhantomDecoy).toBe(true);

    const dmg = clone.takeDamage(999);
    expect(dmg.destroyed).toBe(false);
    expect(dmg.points).toBe(0);
    expect(dmg.shieldAbsorbed).toBe(true);
    expect(dmg.wasDamaged).toBe(true);
  });

  it('SC-4: Phantom pool enforces strict capacity (max 8, autoExpand false)', () => {
    const formationManager = new FormationManager();
    const pool = formationManager.getPhantomPool();

    expect(pool.getMaxSize()).toBe(8);

    // Acquire 8
    const clones: PhantomClone[] = [];
    for (let i = 0; i < 8; i++) {
      const c = pool.acquire();
      expect(c).not.toBeNull();
      if (c) clones.push(c);
    }
    expect(pool.getActiveCount()).toBe(8);

    // 9th acquire must return null (zero heap expansion)
    const excess = pool.acquire();
    expect(excess).toBeNull();
    expect(pool.getActiveCount()).toBe(8);

    // reset / clear restores active count to 0
    formationManager.reset();
    expect(pool.getActiveCount()).toBe(0);
  });
});

describe('M18 Adversarial Challenge: Stage Immunity (Challenging & Epic Bosses)', () => {
  let glitchManager: GlitchEventManager;
  let gameMock: any;

  beforeEach(() => {
    gameMock = {
      state: 'PLAYING',
      stage: 1,
      soundSynth: {
        playGlitchBuzz: vi.fn(),
        playGlitchFrequencyChirp: vi.fn(),
        playDataStreamNoise: vi.fn(),
      },
    };
    glitchManager = new GlitchEventManager(gameMock);
  });

  afterEach(() => {
    glitchManager.clearGlitch();
  });

  it('IMM-1: All 12 Challenging Stages are 100% immune from glitch triggers', () => {
    const challengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];

    for (const stage of challengingStages) {
      expect(DifficultyCalculator.isChallengingStage(stage)).toBe(true);
      const triggered = glitchManager.evaluateStageTrigger(stage);
      expect(triggered).toBe(false);
      expect(glitchManager.getState()).toBe('IDLE');
      expect(glitchManager.getActiveType()).toBeNull();
    }
  });

  it('IMM-2: All 5 Epic Boss Stages (10, 20, 30, 40, 50) are 100% immune from glitch triggers', () => {
    const bossStages = [10, 20, 30, 40, 50];

    for (const stage of bossStages) {
      expect(stage % 10).toBe(0);
      const triggered = glitchManager.evaluateStageTrigger(stage);
      expect(triggered).toBe(false);
      expect(glitchManager.getState()).toBe('IDLE');
      expect(glitchManager.getActiveType()).toBeNull();
    }
  });

  it('IMM-3: Entering Challenging or Boss stage immediately cancels any pre-existing forced glitch', () => {
    const immuneStages = [3, 7, 10, 11, 15, 19, 20, 23, 27, 30, 31, 35, 39, 40, 43, 47, 50];

    for (const stage of immuneStages) {
      // Force an active glitch beforehand
      glitchManager.forceActivate(GlitchEventType.QUANTUM_TELEPORT);
      expect(glitchManager.getState()).toBe('ACTIVE');

      // Evaluating stage trigger must immediately clear the glitch
      const triggered = glitchManager.evaluateStageTrigger(stage);
      expect(triggered).toBe(false);
      expect(glitchManager.getState()).toBe('IDLE');
      expect(glitchManager.getActiveType()).toBeNull();
    }
  });

  it('IMM-4: Enemies with isChallenging or isEpicBoss reject all anomalous kinematics', () => {
    const challengingEnemy = new Enemy();
    challengingEnemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    challengingEnemy.isChallenging = true;
    challengingEnemy.isGlitched = true;

    expect(challengingEnemy.triggerQuantumTeleport(40)).toBe(false);
    expect(challengingEnemy.triggerKineticInversion(1.0, 150)).toBe(false);
    expect(challengingEnemy.glitchOffsetX).toBe(0);
    expect(challengingEnemy.isKineticInverted).toBe(false);

    const bossEnemy = new Enemy();
    bossEnemy.init(2, EnemyType.BOSS, 0, 0, 112, 100);
    (bossEnemy as any).isEpicBoss = true;
    bossEnemy.isGlitched = true;

    expect(bossEnemy.triggerQuantumTeleport(40)).toBe(false);
    expect(bossEnemy.triggerKineticInversion(1.0, 150)).toBe(false);
    expect(bossEnemy.glitchOffsetX).toBe(0);
    expect(bossEnemy.isKineticInverted).toBe(false);
  });
});

describe('M18 Adversarial Challenge: Cheat Controller Glitch Aliases & Toggle Stress', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  afterEach(() => {
    game.destroy();
  });

  it('CC-1: triggerGlitch resolves all canonical names, aliases, cases, and formatting', () => {
    const cheat = game.cheatController;
    const testCases: Array<{ input: string; expected: GlitchEventType }> = [
      // Teleport
      { input: 'teleport', expected: GlitchEventType.QUANTUM_TELEPORT },
      { input: 'TELEPORT', expected: GlitchEventType.QUANTUM_TELEPORT },
      { input: 'quantum', expected: GlitchEventType.QUANTUM_TELEPORT },
      { input: 'quantum_teleport', expected: GlitchEventType.QUANTUM_TELEPORT },
      { input: 'quantum-teleportation', expected: GlitchEventType.QUANTUM_TELEPORT },

      // Kinetic / Vector
      { input: 'kinetic', expected: GlitchEventType.KINETIC_INVERSION },
      { input: 'KINETIC', expected: GlitchEventType.KINETIC_INVERSION },
      { input: 'vector', expected: GlitchEventType.KINETIC_INVERSION },
      { input: 'inversion', expected: GlitchEventType.KINETIC_INVERSION },
      { input: 'kinetic_inversion', expected: GlitchEventType.KINETIC_INVERSION },
      { input: 'corrupted_dive', expected: GlitchEventType.KINETIC_INVERSION },

      // Mirage
      { input: 'mirage', expected: GlitchEventType.MIRAGE_CLONES },
      { input: 'clone', expected: GlitchEventType.MIRAGE_CLONES },
      { input: 'clones', expected: GlitchEventType.MIRAGE_CLONES },
      { input: 'mirage_clones', expected: GlitchEventType.MIRAGE_CLONES },
      { input: 'decoy', expected: GlitchEventType.MIRAGE_CLONES },

      // Raster
      { input: 'raster', expected: GlitchEventType.RASTER_TEAR },
      { input: 'tear', expected: GlitchEventType.RASTER_TEAR },
      { input: 'scanline', expected: GlitchEventType.RASTER_TEAR },
      { input: 'raster_tear', expected: GlitchEventType.RASTER_TEAR },

      // Sector
      { input: 'sector', expected: GlitchEventType.SECTOR_ANOMALY },
      { input: 'glitch_sector', expected: GlitchEventType.SECTOR_ANOMALY },
      { input: 'anomaly', expected: GlitchEventType.SECTOR_ANOMALY },

      // Chromatic
      { input: 'chroma', expected: GlitchEventType.CHROMATIC_ABERRATION },
      { input: 'chromatic_aberration', expected: GlitchEventType.CHROMATIC_ABERRATION },

      // XOR Noise
      { input: 'xor', expected: GlitchEventType.XOR_NOISE },
      { input: 'noise', expected: GlitchEventType.XOR_NOISE },

      // Hex Scramble
      { input: 'hex', expected: GlitchEventType.HEX_SCRAMBLE },
      { input: 'scramble', expected: GlitchEventType.HEX_SCRAMBLE },
    ];

    for (const tc of testCases) {
      const success = cheat.triggerGlitch(tc.input);
      expect(success).toBe(true);
      expect(game.glitchEventManager.getActiveType()).toBe(tc.expected);
      expect(game.glitchEventManager.getState()).toBe('ACTIVE');
    }
  });

  it('CC-2: Invalid aliases strictly return false and do not mutate glitch state', () => {
    const cheat = game.cheatController;
    cheat.clearGlitch();

    const invalidInputs = [
      'invalid',
      'invalid_glitch',
      'foobar',
      'warp_beam',
      'unknown',
      '99999',
      '###',
    ];

    for (const bad of invalidInputs) {
      const result = cheat.triggerGlitch(bad);
      expect(result).toBe(false);
      expect(game.glitchEventManager.getState()).toBe('IDLE');
      expect(game.glitchEventManager.getActiveType()).toBeNull();
    }
  });

  it('CC-3: Rapid toggle cycles (500 cycles) between trigger and clear execute without leak or corruption', () => {
    const cheat = game.cheatController;

    const aliases = ['teleport', 'kinetic', 'mirage', 'raster', 'sector'];

    for (let i = 0; i < 500; i++) {
      const alias = aliases[i % aliases.length]!;
      const triggered = cheat.triggerGlitch(alias);
      expect(triggered).toBe(true);
      expect(game.glitchEventManager.getState()).toBe('ACTIVE');

      const stateSnapshot = cheat.getGameState();
      expect(stateSnapshot.glitch?.active).toBe(true);
      expect(stateSnapshot.glitch?.state).toBe('ACTIVE');

      cheat.clearGlitch();
      expect(game.glitchEventManager.getState()).toBe('IDLE');
      expect(game.glitchEventManager.getActiveType()).toBeNull();

      const clearedSnapshot = cheat.getGameState();
      expect(clearedSnapshot.glitch?.active).toBe(false);
      expect(clearedSnapshot.glitch?.state).toBe('IDLE');
    }
  });
});
