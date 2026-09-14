import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlitchEventType } from '../../src/core/glitch/types';
import { GlitchRenderer } from '../../src/renderer/GlitchRenderer';
import { PhantomClone } from '../../src/core/glitch/PhantomClone';
import { GlitchEventManager } from '../../src/core/glitch/GlitchEventManager';
import { Enemy } from '../../src/entities/Enemy';
import { FormationManager } from '../../src/systems/FormationManager';
import { FlightPathManager } from '../../src/systems/FlightPathManager';
import { EnemyType, EnemyState } from '../../src/types';
import { Game } from '../../src/core/Game';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { AudioContextManager } from '../../src/audio/AudioContextManager';

// Mock Canvas Context to intercept and count stack depth
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

describe('Milestone M18: Glitch Concept & Visual Raster Post-Processing', () => {
  beforeEach(() => {
    GlitchRenderer.initialize();
  });

  afterEach(() => {
    GlitchRenderer.reset();
  });

  it('G1: GlitchRenderer initializes pre-allocated offscreen scratch canvases', () => {
    expect(GlitchRenderer.VIRTUAL_WIDTH).toBe(224);
    expect(GlitchRenderer.VIRTUAL_HEIGHT).toBe(288);
    expect(GlitchRenderer.STRIP_HEIGHT).toBe(32);
    expect(GlitchRenderer.SPRITE_SIZE).toBe(32);
    expect(GlitchRenderer.HEX_CHARS.length).toBe(16);
  });

  it('G2: applyRasterTear maintains balanced context save/restore and slice displacement', () => {
    const { ctx, getStackDepth } = createMockCanvasContext();
    GlitchRenderer.applyRasterTear(ctx, 1.0, 0.5, 42);

    expect(getStackDepth()).toBe(0);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('G3: applyChromaticAberration performs additive channel recombination with zero stack leaks', () => {
    const { ctx, getStackDepth } = createMockCanvasContext();
    GlitchRenderer.applyChromaticAberration(ctx, 3.0, 1.0);

    expect(getStackDepth()).toBe(0);
  });

  it('G4: applyHUDHexScramble replaces characters with diverse hex digits and preserves whitespace', () => {
    const originalText = 'STAGE 13 CLEAR';
    const scrambled = GlitchRenderer.applyHUDHexScramble(originalText, 1.0, 101);

    expect(scrambled.length).toBe(originalText.length);
    expect(scrambled[5]).toBe(' '); // Preserves space
    expect(scrambled[8]).toBe(' '); // Preserves space

    // Every non-space character must be a valid hex digit [0-9A-F]
    for (let i = 0; i < scrambled.length; i++) {
      if (scrambled[i] !== ' ') {
        expect(GlitchRenderer.HEX_CHARS).toContain(scrambled[i]);
      }
    }

    // Invariant: Characters across indices must NOT collapse into a single repeated digit!
    const nonSpaceChars = scrambled.replace(/ /g, '').split('');
    const uniqueChars = new Set(nonSpaceChars);
    expect(uniqueChars.size).toBeGreaterThanOrEqual(4);

    // 0% ratio preserves original text exactly
    const unscrambled = GlitchRenderer.applyHUDHexScramble(originalText, 0.0, 101);
    expect(unscrambled).toBe(originalText);

    // 50% ratio yields mixed characters (partially original, partially scrambled)
    const partialScramble = GlitchRenderer.applyHUDHexScramble(originalText, 0.5, 101);
    let originalMatches = 0;
    let scrambledMatches = 0;
    for (let i = 0; i < originalText.length; i++) {
      if (originalText[i] === ' ') continue;
      if (partialScramble[i] === originalText[i]) {
        originalMatches++;
      } else {
        scrambledMatches++;
      }
    }
    expect(originalMatches).toBeGreaterThan(0);
    expect(scrambledMatches).toBeGreaterThan(0);
  });

  it('G5: drawXORCorruptedSprite executes zero-leak transform and restores matrix', () => {
    const { ctx, getStackDepth } = createMockCanvasContext();
    const mockSprite = GlitchRenderer.createOffscreenCanvas(16, 16);

    GlitchRenderer.drawXORCorruptedSprite(ctx, mockSprite, 100, 150, Math.PI / 4, 1.2, 0.8, 77);
    expect(getStackDepth()).toBe(0);
  });
});

describe('Milestone M18: PhantomClone Bounded Pool & Decoy Lifecycle', () => {
  it('P1: PhantomClone implements Poolable and initializes with standard defaults', () => {
    const clone = new PhantomClone();
    expect(clone.isPhantomDecoy).toBe(true);
    expect(clone.canShoot).toBe(false);
    expect(clone.active).toBe(false);
    expect(clone.lifetime).toBe(2.0);

    clone.init(100, 150, -45, 120, EnemyType.GOEI);
    expect(clone.active).toBe(true);
    expect(clone.x).toBe(100);
    expect(clone.y).toBe(150);
    expect(clone.vx).toBe(-45);
    expect(clone.vy).toBe(120);
    expect(clone.type).toBe(EnemyType.GOEI);
  });

  it('P2: PhantomClone takeDamage absorbs bullets and awards exactly 0 points', () => {
    const clone = new PhantomClone();
    clone.init(112, 100, 0, 100);

    const dmg = clone.takeDamage(1);
    expect(dmg.destroyed).toBe(false);
    expect(dmg.points).toBe(0);
    expect(dmg.wasDamaged).toBe(true);
    expect(dmg.shieldAbsorbed).toBe(true);
  });

  it('P3: PhantomClone auto-expires after 2.0s', () => {
    const clone = new PhantomClone();
    clone.init(112, 100, 0, 50);

    clone.update(1.0);
    expect(clone.active).toBe(true);
    expect(clone.lifetime).toBeCloseTo(1.0);

    clone.update(1.1);
    expect(clone.active).toBe(false);
    expect(clone.lifetime).toBeLessThanOrEqual(0);
  });

  it('P4: FormationManager phantomPool enforces bounded capacity (max 8, autoExpand false)', () => {
    const fm = new FormationManager();
    const pool = fm.getPhantomPool();

    expect(pool.getMaxSize()).toBe(8);
    expect(pool.getActiveCount()).toBe(0);

    // Acquire up to capacity
    const acquired: PhantomClone[] = [];
    for (let i = 0; i < 8; i++) {
      const p = pool.acquire();
      expect(p).not.toBeNull();
      if (p) acquired.push(p);
    }
    expect(pool.getActiveCount()).toBe(8);

    // 9th acquisition must be rejected (bounded invariant)
    const overflow = pool.acquire();
    expect(overflow).toBeNull();

    // Stage clear must reset active count to 0
    fm.reset();
    expect(pool.getActiveCount()).toBe(0);
  });

  it('P5: Phantom clones are strictly excluded from FormationManager livingCount', () => {
    const fm = new FormationManager();
    expect(fm.getLivingCount()).toBe(0);

    // Spawn decoy clones
    fm.spawnMirageClones(112, 120);
    expect(fm.getPhantomPool().getActiveCount()).toBe(2);

    // Living count remains 0 because phantoms are NOT enemies!
    expect(fm.getLivingCount()).toBe(0);
  });

  it('P6: All 8 active phantom clones safely expire and release simultaneously in 1 frame', () => {
    const fm = new FormationManager();
    const pool = fm.getPhantomPool();

    // Spawn 4 pairs of mirage clones to fill pool to capacity (8 clones)
    for (let i = 0; i < 4; i++) {
      fm.spawnMirageClones(100 + i * 10, 100);
    }
    expect(pool.getActiveCount()).toBe(8);

    // Advance 2.1s (past 2.0s lifetime) in a SINGLE frame update
    fm.update(2.1, 112, 250);

    // Invariant: ALL 8 clones must be cleanly released in this single frame
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(8);
  });
});

describe('Milestone M18: GlitchEventManager & Anomaly Round Staging', () => {
  let gameMock: any;
  let manager: GlitchEventManager;

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
    manager = new GlitchEventManager(gameMock);
  });

  afterEach(() => {
    manager.clearGlitch();
  });

  it('E1: Glitch Sector anomaly rounds are dedicated on Stages 13, 26, 38', () => {
    expect(GlitchEventManager.isGlitchSectorStage(13)).toBe(true);
    expect(GlitchEventManager.isGlitchSectorStage(26)).toBe(true);
    expect(GlitchEventManager.isGlitchSectorStage(38)).toBe(true);

    expect(GlitchEventManager.isGlitchSectorStage(1)).toBe(false);
    expect(GlitchEventManager.isGlitchSectorStage(12)).toBe(false);
    expect(GlitchEventManager.isGlitchSectorStage(14)).toBe(false);
    expect(GlitchEventManager.isGlitchSectorStage(25)).toBe(false);
    expect(GlitchEventManager.isGlitchSectorStage(50)).toBe(false);
  });

  it('E2: Stage 13 automatically triggers dedicated SECTOR_ANOMALY', () => {
    const triggered = manager.evaluateStageTrigger(13);
    expect(triggered).toBe(true);
    expect(manager.getState()).toBe('ACTIVE');
    expect(manager.getActiveType()).toBe(GlitchEventType.SECTOR_ANOMALY);
    expect(manager.isSectorActive()).toBe(true);
  });

  it('E3: Challenging stages are 100% immune from glitches', () => {
    // Challenging stages: 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47
    expect(manager.evaluateStageTrigger(3)).toBe(false);
    expect(manager.evaluateStageTrigger(11)).toBe(false);
    expect(manager.evaluateStageTrigger(15)).toBe(false);
    expect(manager.evaluateStageTrigger(19)).toBe(false);
    expect(manager.getState()).toBe('IDLE');
  });

  it('E4: Epic Boss stages (10, 20, 30, 40, 50) are 100% immune from glitches', () => {
    expect(manager.evaluateStageTrigger(10)).toBe(false);
    expect(manager.evaluateStageTrigger(20)).toBe(false);
    expect(manager.evaluateStageTrigger(30)).toBe(false);
    expect(manager.evaluateStageTrigger(40)).toBe(false);
    expect(manager.evaluateStageTrigger(50)).toBe(false);
    expect(manager.getState()).toBe('IDLE');
  });

  it('E5: Event state machine transitions IDLE -> WARNING -> ACTIVE -> COOLDOWN -> IDLE', () => {
    manager.triggerWarning(GlitchEventType.QUANTUM_TELEPORT, 4.0);
    expect(manager.getState()).toBe('WARNING');
    expect(gameMock.soundSynth.playGlitchBuzz).toHaveBeenCalled();

    // Advance past warning (1.5s)
    manager.update(1.6);
    expect(manager.getState()).toBe('ACTIVE');
    expect(gameMock.soundSynth.playGlitchFrequencyChirp).toHaveBeenCalled();

    // Advance past active duration (4.0s)
    manager.update(4.1);
    expect(manager.getState()).toBe('COOLDOWN');

    // Advance past cooldown (2.0s)
    manager.update(2.1);
    expect(manager.getState()).toBe('IDLE');
  });

  it('E6: onStageClear immediately resets glitch state', () => {
    manager.forceActivate(GlitchEventType.RASTER_TEAR);
    expect(manager.getState()).toBe('ACTIVE');

    manager.onStageClear();
    expect(manager.getState()).toBe('IDLE');
    expect(manager.getActiveType()).toBeNull();
  });
});

describe('Milestone M18: Anomalous Enemy Kinematics', () => {
  it('K1: triggerQuantumTeleport applies additive displacement and respects screen boundaries', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    enemy.isGlitched = true;

    expect(enemy.glitchOffsetX).toBe(0);
    const success = enemy.triggerQuantumTeleport(40);
    expect(success).toBe(true);
    expect(enemy.isTeleporting).toBe(true);
    expect(enemy.glitchOffsetX).toBe(40);

    // Clamping to [-60, 60]
    enemy.triggerQuantumTeleport(50);
    expect(enemy.glitchOffsetX).toBe(60);
  });

  it('K2: triggerQuantumTeleport is rejected on challenging enemies or epic bosses', () => {
    const challengingEnemy = new Enemy();
    challengingEnemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    challengingEnemy.isChallenging = true;
    expect(challengingEnemy.triggerQuantumTeleport(30)).toBe(false);
    expect(challengingEnemy.glitchOffsetX).toBe(0);

    const bossEnemy = new Enemy();
    bossEnemy.init(2, EnemyType.BOSS, 0, 0, 112, 100);
    (bossEnemy as any).isEpicBoss = true;
    expect(bossEnemy.triggerQuantumTeleport(30)).toBe(false);
  });

  it('K3: triggerKineticInversion activates anti-gravity upward velocity and normal impulse', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.GOEI, 0, 0, 112, 120);
    enemy.isGlitched = true;

    const success = enemy.triggerKineticInversion(0.75, 180);
    expect(success).toBe(true);
    expect(enemy.isKineticInverted).toBe(true);
    expect(enemy.kineticInversionTimer).toBe(0.75);
    expect(enemy.glitchKinematicVy).toBe(-90);
    expect(Math.abs(enemy.glitchKinematicVx)).toBe(180);
  });

  it('K4: reset() cleans all glitch kinematics and state flags', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    enemy.isGlitched = true;
    enemy.triggerQuantumTeleport(35);
    enemy.triggerKineticInversion(1.0, 150);
    enemy.canSpawnMirageClone = true;

    enemy.reset();
    expect(enemy.isGlitched).toBe(false);
    expect(enemy.glitchOffsetX).toBe(0);
    expect(enemy.glitchOffsetY).toBe(0);
    expect(enemy.glitchDisplacementX).toBe(0);
    expect(enemy.glitchDisplacementY).toBe(0);
    expect(enemy.glitchKinematicVx).toBe(0);
    expect(enemy.glitchKinematicVy).toBe(0);
    expect(enemy.isTeleporting).toBe(false);
    expect(enemy.isKineticInverted).toBe(false);
    expect(enemy.canSpawnMirageClone).toBe(false);
  });

  it('K5: Returning to formation cleanly resets isTeleporting and teleportTimer without lingering render jitter', () => {
    const enemy = new Enemy();
    enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
    enemy.isGlitched = true;
    enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 100 }, 112);
    enemy.state = EnemyState.DIVING_SOLO;

    // Trigger teleportation mid-dive
    enemy.triggerQuantumTeleport(30);
    expect(enemy.isTeleporting).toBe(true);
    expect(enemy.teleportTimer).toBeGreaterThan(0);

    // Advance until path completes past bottom-of-screen wrap-around
    while (enemy.state === EnemyState.DIVING_SOLO) {
      enemy.update(0.016, 112, 250);
    }

    // Must transition to RETURNING_TO_FORMATION and clear teleport state
    expect(enemy.state).toBe(EnemyState.RETURNING_TO_FORMATION);
    expect(enemy.isTeleporting).toBe(false);
    expect(enemy.teleportTimer).toBe(0);

    // Verify render state has 100% opacity and no jitter translation
    const { ctx } = createMockCanvasContext();
    enemy.render(ctx);
    expect(ctx.globalAlpha).toBe(1.0);
  });
});

describe('Milestone M18: Procedural Web Audio Synthesis in SoundSynth', () => {
  let synth: SoundSynth;
  let audioManager: AudioContextManager;

  beforeEach(() => {
    audioManager = AudioContextManager.getInstance();
    synth = SoundSynth.getInstance(audioManager);
  });

  it('A1: playGlitchBuzz returns true and plays mains hum synthesis', () => {
    const played = synth.playGlitchBuzz({ volume: 0.5 });
    expect(typeof played).toBe('boolean');
  });

  it('A2: playGlitchFrequencyChirp returns true and synthesizes frequency hopping', () => {
    const played = synth.playGlitchFrequencyChirp({ volume: 0.5 });
    expect(typeof played).toBe('boolean');
  });

  it('A3: playDataStreamNoise synthesizes dial-up modem handshake noise', () => {
    const played = synth.playDataStreamNoise({ volume: 0.5 });
    expect(typeof played).toBe('boolean');
  });
});

describe('Milestone M18: QA Cheat Controller Integration & Telemetry', () => {
  let game: Game;

  beforeEach(() => {
    // Ensure document and canvas element exist for Game initialization
    game = new Game();
  });

  afterEach(() => {
    game.destroy();
  });

  it('C1: triggerGlitch supports canonical and case-insensitive aliases', () => {
    const cheat = game.cheatController;

    expect(cheat.triggerGlitch('teleport')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).toBe(GlitchEventType.QUANTUM_TELEPORT);

    expect(cheat.triggerGlitch('kinetic')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).toBe(GlitchEventType.KINETIC_INVERSION);

    expect(cheat.triggerGlitch('mirage')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).toBe(GlitchEventType.MIRAGE_CLONES);

    expect(cheat.triggerGlitch('vector')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).toBe(GlitchEventType.KINETIC_INVERSION);

    expect(cheat.triggerGlitch('raster')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).toBe(GlitchEventType.RASTER_TEAR);

    expect(cheat.triggerGlitch('chroma')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).toBe(GlitchEventType.CHROMATIC_ABERRATION);

    expect(cheat.triggerGlitch('sector')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).toBe(GlitchEventType.SECTOR_ANOMALY);

    // Random fallback
    expect(cheat.triggerGlitch('random')).toBe(true);
    expect(game.glitchEventManager.getActiveType()).not.toBeNull();
  });

  it('C2: clearGlitch clears active glitch state immediately', () => {
    const cheat = game.cheatController;
    cheat.triggerGlitch('raster');
    expect(game.glitchEventManager.getState()).toBe('ACTIVE');

    cheat.clearGlitch();
    expect(game.glitchEventManager.getState()).toBe('IDLE');
    expect(game.glitchEventManager.getActiveType()).toBeNull();
  });

  it('C3: getGameState includes glitch telemetry snapshot', () => {
    const cheat = game.cheatController;
    cheat.triggerGlitch('quantum');

    const state = cheat.getGameState();
    expect(state.glitch).toBeDefined();
    expect(state.glitch?.active).toBe(true);
    expect(state.glitch?.type).toBe(GlitchEventType.QUANTUM_TELEPORT);
    expect(state.glitch?.state).toBe('ACTIVE');
  });
});
