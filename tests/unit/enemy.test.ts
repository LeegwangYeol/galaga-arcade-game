/**
 * Galaga Arcade Web Game — Enemy Hierarchy, Formation Grid & Bézier Curves Unit Tests
 * 
 * Exhaustive unit test suite covering:
 * 1. Bézier Curve math (Cubic & Quadratic, derivatives, headings, arc-length LUT, composite splines).
 * 2. Enemy entity hierarchy (Zako, Goei, Boss Galaga 2-hit state, scoring matrix, wing flutter, hitboxes).
 * 3. FormationManager (40 slots across 5 rows, harmonic breathing expansion, sway, dive scheduler).
 * 4. FlightPathManager (5 entry sub-waves, solo, paired Goei, and Boss escort attack paths).
 * 5. SpriteRenderer enemy bit-matrices & procedural caching.
 * 6. Game master coordinator collision resolution and scoring integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BezierCurve, QuadraticBezier, CompositeBezierPath } from '../../src/math/Bezier';
import { Enemy } from '../../src/entities/Enemy';
import { FormationManager } from '../../src/systems/FormationManager';
import { FlightPathManager } from '../../src/systems/FlightPathManager';
import {
  SpriteRenderer,
  ZAKO_FRAME_0_MATRIX,
  ZAKO_FRAME_1_MATRIX,
  GOEI_FRAME_0_MATRIX,
  GOEI_FRAME_1_MATRIX,
  BOSS_HEALTHY_FRAME_0_MATRIX,
  BOSS_HEALTHY_FRAME_1_MATRIX,
  BOSS_DAMAGED_FRAME_0_MATRIX,
  BOSS_DAMAGED_FRAME_1_MATRIX,
  PALETTE_CHAR_MAP,
} from '../../src/renderer/SpriteRenderer';
import { Game } from '../../src/core/Game';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 4: Bézier Splines & Flight Curves (`src/math/Bezier.ts`)', () => {
  describe('Cubic Bézier Interpolator & Analytical Derivatives', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };
    let curve: BezierCurve;

    beforeEach(() => {
      curve = new BezierCurve(p0, p1, p2, p3);
    });

    it('evaluates exact boundary points at t=0 and t=1', () => {
      const start = curve.evaluate(0);
      expect(start.x).toBe(0);
      expect(start.y).toBe(0);

      const end = curve.evaluate(1);
      expect(end.x).toBe(100);
      expect(end.y).toBe(0);
    });

    it('evaluates analytical midpoint at t=0.5', () => {
      const mid = curve.evaluate(0.5);
      expect(mid.x).toBeCloseTo(50, 4);
      expect(mid.y).toBeCloseTo(75, 4);
    });

    it('computes analytical first derivative vectors B\'(0) and B\'(1)', () => {
      // B'(0) = 3 * (P1 - P0) = 3 * (0, 100) = (0, 300)
      const d0 = curve.derivative(0);
      expect(d0.x).toBeCloseTo(0, 4);
      expect(d0.y).toBeCloseTo(300, 4);

      // B'(1) = 3 * (P3 - P2) = 3 * (0, -100) = (0, -300)
      const d1 = curve.derivative(1);
      expect(d1.x).toBeCloseTo(0, 4);
      expect(d1.y).toBeCloseTo(-300, 4);
    });

    it('computes normalized tangent vectors', () => {
      const t0 = curve.tangent(0);
      expect(t0.x).toBeCloseTo(0, 4);
      expect(t0.y).toBeCloseTo(1, 4);

      const t1 = curve.tangent(1);
      expect(t1.x).toBeCloseTo(0, 4);
      expect(t1.y).toBeCloseTo(-1, 4);
    });

    it('calculates sprite heading angle with Galaga orientation offset (0 rad = UP)', () => {
      // Moving straight down: derivative (0, 300) -> atan2(300, 0) + PI/2 = PI
      expect(curve.heading(0)).toBeCloseTo(Math.PI, 4);

      // Moving straight up: derivative (0, -300) -> atan2(-300, 0) + PI/2 = -PI/2 + PI/2 = 0
      expect(curve.heading(1)).toBeCloseTo(0, 4);
    });
  });

  describe('Arc-Length LUT & Constant-Speed Sampling', () => {
    it('computes positive, monotonically increasing arc-length', () => {
      const curve = new BezierCurve(
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 }
      );
      expect(curve.length).toBeGreaterThan(100);

      // distanceToT increases monotonically
      let prevT = -1;
      for (let d = 0; d <= curve.length; d += 10) {
        const t = curve.distanceToT(d);
        expect(t).toBeGreaterThanOrEqual(prevT);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
        prevT = t;
      }
    });

    it('samples smooth constant-speed trajectory points', () => {
      const curve = new BezierCurve(
        { x: 10, y: 10 },
        { x: 50, y: 10 },
        { x: 100, y: 50 },
        { x: 100, y: 100 }
      );

      const sample0 = curve.sampleAtDistance(0);
      expect(sample0.position.x).toBeCloseTo(10, 4);
      expect(sample0.position.y).toBeCloseTo(10, 4);

      const sampleEnd = curve.sampleAtDistance(curve.length);
      expect(sampleEnd.position.x).toBeCloseTo(100, 4);
      expect(sampleEnd.position.y).toBeCloseTo(100, 4);
    });
  });

  describe('Quadratic Bézier & Composite Paths', () => {
    it('evaluates Quadratic Bézier curves', () => {
      const q = new QuadraticBezier({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 });
      expect(q.evaluate(0)).toEqual({ x: 0, y: 0 });
      expect(q.evaluate(1)).toEqual({ x: 100, y: 0 });
      expect(q.evaluate(0.5).x).toBeCloseTo(50, 4);
      expect(q.evaluate(0.5).y).toBeCloseTo(50, 4);
    });

    it('evaluates CompositeBezierPath across multiple segments with duration gating', () => {
      const seg1 = new BezierCurve({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 });
      const seg2 = new BezierCurve({ x: 30, y: 30 }, { x: 40, y: 40 }, { x: 50, y: 50 }, { x: 60, y: 60 });

      const composite = new CompositeBezierPath('TEST_PATH', [
        { curve: seg1, durationMs: 1000 },
        { curve: seg2, durationMs: 1000 },
      ]);

      expect(composite.totalDurationMs).toBe(2000);

      // At 500ms -> segment 0 midpoint
      const s1 = composite.evaluateTime(500);
      expect(s1.segmentIndex).toBe(0);
      expect(s1.isComplete).toBe(false);

      // At 1500ms -> segment 1 midpoint
      const s2 = composite.evaluateTime(1500);
      expect(s2.segmentIndex).toBe(1);
      expect(s2.isComplete).toBe(false);

      // At 2500ms -> complete
      const s3 = composite.evaluateTime(2500);
      expect(s3.isComplete).toBe(true);
      expect(s3.position.x).toBeCloseTo(60, 4);
    });
  });
});

describe('Milestone 4: Enemy Unit Hierarchy & State Machine (`src/entities/Enemy.ts`)', () => {
  let enemy: Enemy;

  beforeEach(() => {
    enemy = new Enemy({ id: 1, type: EnemyType.ZAKO, row: 3, col: 4, x: 100, y: 100 });
  });

  describe('Enemy Initialization & Health Configuration', () => {
    it('configures standard 1 HP for Zako and Goei', () => {
      const zako = new Enemy({ type: EnemyType.ZAKO });
      expect(zako.maxHealth).toBe(1);
      expect(zako.health).toBe(1);

      const goei = new Enemy({ type: EnemyType.GOEI });
      expect(goei.maxHealth).toBe(1);
      expect(goei.health).toBe(1);
    });

    it('configures 2 HP for Boss Galaga', () => {
      const boss = new Enemy({ type: EnemyType.BOSS });
      expect(boss.maxHealth).toBe(2);
      expect(boss.health).toBe(2);
    });
  });

  describe('Authentic Point Scoring Matrix', () => {
    it('awards 50 pts for formation Zako and 100 pts for diving Zako', () => {
      enemy.type = EnemyType.ZAKO;
      enemy.state = EnemyState.IN_FORMATION;
      expect(enemy.getScoreValue()).toBe(50);

      enemy.state = EnemyState.DIVING_SOLO;
      expect(enemy.getScoreValue()).toBe(100);
    });

    it('awards 80 pts for formation Goei and 160 pts for diving Goei', () => {
      enemy.type = EnemyType.GOEI;
      enemy.state = EnemyState.IN_FORMATION;
      expect(enemy.getScoreValue()).toBe(80);

      enemy.state = EnemyState.DIVING_SOLO;
      expect(enemy.getScoreValue()).toBe(160);
    });

    it('awards 150 pts in formation, 400 solo, 800 with 1 escort, 1600 with 2 escorts for Boss Galaga', () => {
      enemy.type = EnemyType.BOSS;
      enemy.state = EnemyState.IN_FORMATION;
      expect(enemy.getScoreValue()).toBe(150);

      enemy.state = EnemyState.DIVING_SOLO;
      enemy.escortCount = 0;
      expect(enemy.getScoreValue()).toBe(400);

      enemy.escortCount = 1;
      expect(enemy.getScoreValue()).toBe(800);

      enemy.escortCount = 2;
      expect(enemy.getScoreValue()).toBe(1600);
    });

    it('awards 1000 pts for Captured Fighter', () => {
      enemy.type = EnemyType.CAPTURED_FIGHTER;
      expect(enemy.getScoreValue()).toBe(1000);
    });
  });

  describe('Damage Processing & Boss Galaga 2-Hit Visual State', () => {
    it('destroys 1 HP enemies on single hit', () => {
      const onExplode = vi.fn();
      enemy.onExplode = onExplode;

      const res = enemy.takeDamage(1);
      expect(res.destroyed).toBe(true);
      expect(res.points).toBe(50);
      expect(res.wasDamaged).toBe(true);
      expect(enemy.state).toBe(EnemyState.EXPLODING);
      expect(onExplode).toHaveBeenCalledTimes(1);
    });

    it('handles Boss Galaga Hit 1 (2 HP -> 1 HP): non-fatal, 0 pts, damage flash', () => {
      const boss = new Enemy({ type: EnemyType.BOSS, x: 112, y: 52 });
      const onExplode = vi.fn();
      boss.onExplode = onExplode;

      // Hit 1
      const res1 = boss.takeDamage(1);
      expect(res1.destroyed).toBe(false);
      expect(res1.points).toBe(0);
      expect(res1.wasDamaged).toBe(true);
      expect(boss.health).toBe(1);
      expect(boss.state).toBe(EnemyState.IN_FORMATION);
      expect(boss.damageFlashTimer).toBe(Enemy.DAMAGE_FLASH_DURATION);
      expect(onExplode).not.toHaveBeenCalled();

      // Hit 2
      const res2 = boss.takeDamage(1);
      expect(res2.destroyed).toBe(true);
      expect(res2.points).toBe(150);
      expect(res2.wasDamaged).toBe(true);
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(onExplode).toHaveBeenCalledTimes(1);
    });
  });

  describe('Wing Flutter Animation & Firing Capabilities', () => {
    it('flutters wings at 4Hz (every 0.25s)', () => {
      enemy.animTimer = 0;
      enemy.animFrame = 0;

      enemy.update(0.1);
      expect(enemy.animFrame).toBe(0);

      enemy.update(0.16); // Total 0.26s -> flips frame
      expect(enemy.animFrame).toBe(1);

      enemy.update(0.25);
      expect(enemy.animFrame).toBe(0);
    });

    it('attempts firing toward player when in valid screen zone', () => {
      const onFireBullet = vi.fn();
      enemy.onFireBullet = onFireBullet;
      enemy.y = 120;

      expect(enemy.attemptFire(112, 250)).toBe(true);
      expect(onFireBullet).toHaveBeenCalledWith(
        expect.objectContaining({
          originX: enemy.x,
          targetX: 112,
          targetY: 250,
        })
      );

      // Cooldown active -> cannot fire immediately
      expect(enemy.attemptFire(112, 250)).toBe(false);
    });

    it('returns exact AABB hitbox', () => {
      enemy.x = 100;
      enemy.y = 100;
      const box = enemy.getHitbox();
      expect(box).toEqual({
        x: 94,
        y: 94,
        width: 12,
        height: 12,
      });
    });
  });
});

describe('Milestone 4: Formation Grid Manager (`src/systems/FormationManager.ts`)', () => {
  let formation: FormationManager;

  beforeEach(() => {
    formation = new FormationManager();
  });

  describe('Grid Structure & 40-Alien Slot Allocation', () => {
    it('initializes exactly 40 slots: 4 Bosses, 16 Goeis, 20 Zakos across 5 rows', () => {
      expect(formation.slots.length).toBe(40);

      const bosses = formation.slots.filter((s) => s.type === EnemyType.BOSS && s.row === 0);
      expect(bosses.length).toBe(4);

      const goeisRow1 = formation.slots.filter((s) => s.type === EnemyType.GOEI && s.row === 1);
      expect(goeisRow1.length).toBe(8);

      const goeisRow2 = formation.slots.filter((s) => s.type === EnemyType.GOEI && s.row === 2);
      expect(goeisRow2.length).toBe(8);

      const zakosRow3 = formation.slots.filter((s) => s.type === EnemyType.ZAKO && s.row === 3);
      expect(zakosRow3.length).toBe(10);

      const zakosRow4 = formation.slots.filter((s) => s.type === EnemyType.ZAKO && s.row === 4);
      expect(zakosRow4.length).toBe(10);
    });

    it('spawns 40 active enemies when stage starts', () => {
      formation.spawnStage(1);
      expect(formation.enemies.length).toBe(40);
      expect(formation.getLivingCount()).toBe(40);
      expect(formation.isEntryWaveActive).toBe(true);
    });
  });

  describe('Harmonic Breathing Expansion & Sway Mathematics', () => {
    it('computes sinusoidal sway within [-12, +12] px range', () => {
      for (let t = 0; t <= 6.0; t += 0.2) {
        const pos = formation.getSlotPosition(0, 4, t);
        const homeX = FormationManager.GRID_CENTER_X + (4 - 4.5) * 16;
        const diffX = pos.x - homeX;
        // Sway amplitude + expansion offset
        expect(Math.abs(diffX)).toBeLessThanOrEqual(
          FormationManager.SWAY_AMPLITUDE + 0.5 * 16 * FormationManager.EXPAND_AMPLITUDE + 0.1
        );
      }
    });

    it('computes symmetric column expansion around centerline X=112', () => {
      const t = 0.5; // Quarter of 2.0s period (max expansion)
      const leftSlot = formation.getSlotPosition(3, 0, t); // col 0
      const rightSlot = formation.getSlotPosition(3, 9, t); // col 9

      const distLeft = FormationManager.GRID_CENTER_X - (leftSlot.x - FormationManager.SWAY_AMPLITUDE * Math.sin(2 * Math.PI * FormationManager.SWAY_FREQUENCY * t));
      const distRight = (rightSlot.x - FormationManager.SWAY_AMPLITUDE * Math.sin(2 * Math.PI * FormationManager.SWAY_FREQUENCY * t)) - FormationManager.GRID_CENTER_X;

      expect(distLeft).toBeCloseTo(distRight, 4);
    });
  });

  describe('Stage Progression & Clear Callback', () => {
    it('fires onStageClear when all living enemies are destroyed', () => {
      const onStageClear = vi.fn();
      formation.onStageClear = onStageClear;

      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Destroy all enemies
      for (const e of formation.enemies) {
        e.active = false;
        e.state = EnemyState.INACTIVE;
      }

      formation.update(0.1);
      expect(onStageClear).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Milestone 4: Flight Path Manager (`src/systems/FlightPathManager.ts`)', () => {
  it('generates entry paths for all 5 sub-wave archetypes', () => {
    const slot = { x: 100, y: 80 };
    const p1 = FlightPathManager.createEntryPath('WAVE_1_TOP_CENTER', 0, slot);
    const p2 = FlightPathManager.createEntryPath('WAVE_2_TOP_RIGHT', 0, slot);
    const p3 = FlightPathManager.createEntryPath('WAVE_3_TOP_LEFT', 0, slot);
    const p4 = FlightPathManager.createEntryPath('WAVE_4_BOTTOM_LEFT', 0, slot);
    const p5 = FlightPathManager.createEntryPath('WAVE_5_BOTTOM_RIGHT', 0, slot);

    expect(p1.segments.length).toBeGreaterThanOrEqual(2);
    expect(p2.segments.length).toBeGreaterThanOrEqual(2);
    expect(p3.segments.length).toBeGreaterThanOrEqual(2);
    expect(p4.segments.length).toBeGreaterThanOrEqual(2);
    expect(p5.segments.length).toBeGreaterThanOrEqual(2);
  });

  it('generates solo and paired attack dive curves targeting player X', () => {
    const solo = FlightPathManager.createSoloDivePath({ x: 100, y: 60 }, 150, true);
    expect(solo.totalDurationMs).toBeGreaterThan(500);

    const paired = FlightPathManager.createPairedGoeiDivePaths(
      { x: 80, y: 70 },
      { x: 144, y: 70 },
      112
    );
    expect(paired.leftPath).toBeDefined();
    expect(paired.rightPath).toBeDefined();
  });

  it('generates smooth return-to-formation splines', () => {
    const returnPath = FlightPathManager.createReturnPath(100, { x: 100, y: 80 });
    expect(returnPath.totalDurationMs).toBeGreaterThan(200);

    const endSample = returnPath.evaluateTime(returnPath.totalDurationMs);
    expect(endSample.position.x).toBeCloseTo(100, 4);
    expect(endSample.position.y).toBeCloseTo(80, 4);
  });
});

describe('Milestone 4: SpriteRenderer Enemy Procedural Matrices (`src/renderer/SpriteRenderer.ts`)', () => {
  beforeEach(() => {
    SpriteRenderer.clear();
    SpriteRenderer.initialize();
  });

  it('bakes all enemy sprites into offscreen cache', () => {
    expect(SpriteRenderer.getDimensions('ZAKO')).toEqual({ width: 16, height: 16 });
    expect(SpriteRenderer.getDimensions('GOEI')).toEqual({ width: 16, height: 16 });
    expect(SpriteRenderer.getDimensions('BOSS_HEALTHY')).toEqual({ width: 16, height: 16 });
    expect(SpriteRenderer.getDimensions('BOSS_DAMAGED')).toEqual({ width: 16, height: 16 });
    expect(SpriteRenderer.getDimensions('TRANSFORM_SCORPION')).toEqual({ width: 16, height: 16 });
  });

  it('verifies bilateral symmetry of Zako and Goei animation frames', () => {
    const matrices = [
      ZAKO_FRAME_0_MATRIX,
      ZAKO_FRAME_1_MATRIX,
      GOEI_FRAME_0_MATRIX,
      GOEI_FRAME_1_MATRIX,
      BOSS_HEALTHY_FRAME_0_MATRIX,
      BOSS_HEALTHY_FRAME_1_MATRIX,
      BOSS_DAMAGED_FRAME_0_MATRIX,
      BOSS_DAMAGED_FRAME_1_MATRIX,
    ];

    for (const mat of matrices) {
      expect(mat.length).toBe(16);
      for (let r = 0; r < 16; r++) {
        const row = mat[r]!;
        expect(row.length).toBe(16);
        for (let c = 0; c < 8; c++) {
          expect(row[c]).toBe(row[15 - c]);
        }
        for (let c = 0; c < 16; c++) {
          expect(PALETTE_CHAR_MAP[row[c]!]).toBeDefined();
        }
      }
    }
  });

  it('executes drawEnemy helper safely without throwing', () => {
    const mockCtx = {
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      globalAlpha: 1.0,
    } as unknown as CanvasRenderingContext2D;

    expect(() => {
      SpriteRenderer.drawEnemy(mockCtx, EnemyType.ZAKO, 100, 100, 0, 1, 0);
      SpriteRenderer.drawEnemy(mockCtx, EnemyType.BOSS, 100, 100, 1, 2, Math.PI);
      SpriteRenderer.drawEnemy(mockCtx, EnemyType.BOSS, 100, 100, 0, 1, Math.PI / 2); // Damaged boss
    }).not.toThrow();
  });
});

describe('Milestone 4: Game Master Coordinator & Formation Integration (`src/core/Game.ts`)', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  it('wires FormationManager into Game subsystem graph', () => {
    expect(game.getFormationManager()).toBeDefined();
    expect(game.getFormationManager().slots.length).toBe(40);
  });

  it('spawns stage enemies on game start and resolves missile collisions', () => {
    game.startGame();
    expect(game.state).toBe('STAGE_INTRO');

    // Fast-forward stage intro
    game.update(2.3);
    expect(game.state).toBe('PLAYING');
    expect(game.getFormationManager().getLivingCount()).toBe(40);

    // Place an on-screen enemy in formation
    const enemy = game.getFormationManager().getLivingEnemies()[0]!;
    enemy.state = EnemyState.IN_FORMATION;
    enemy.flightPath = null;
    enemy.x = 100;
    enemy.y = 100;

    // Fire player missile directly below the enemy
    game.getBulletManager().firePlayerBullet(100, 106, false, 480);

    const prevScore = game.score;
    // Update one frame to process collision
    game.update(1 / 60);

    expect(game.score).toBeGreaterThanOrEqual(prevScore + 50);
  });

  it('handles enemy projectile colliding with player and decrementing lives', () => {
    game.startGame();
    game.update(2.3);
    expect(game.state).toBe('PLAYING');
    expect(game.lives).toBe(3);

    // Position player and make sure invulnerability has expired
    game.getPlayer().invulnerableTimer = 0;
    game.getPlayer().state = 'normal';
    game.getPlayer().x = 112;
    game.getPlayer().y = 250;

    // Fire enemy bullet directly inside player hitbox (x: 112, y: 248)
    const bullet = game.getBulletManager().fireEnemyBullet(112, 248, 112, 250, 200);
    expect(bullet).not.toBeNull();
    expect(game.getBulletManager().getEnemyBulletCount()).toBe(1);

    // Update 1 frame to trigger collision
    game.update(1 / 60);

    expect(game.lives).toBe(2);
    expect(game.getBulletManager().getEnemyBulletCount()).toBe(0);
  });

  it('handles enemy craft kamikaze collision with player, damaging player and destroying enemy', () => {
    game.startGame();
    game.update(2.3);
    expect(game.state).toBe('PLAYING');
    expect(game.lives).toBe(3);

    game.getPlayer().invulnerableTimer = 0;
    game.getPlayer().state = 'normal';
    game.getPlayer().x = 112;
    game.getPlayer().y = 250;

    game.getFormationManager().isEntryWaveActive = false;
    const enemy = game.getFormationManager().getLivingEnemies()[0]!;
    enemy.flightPath = null;
    enemy.state = EnemyState.DIVING_SOLO;
    enemy.x = 112;
    enemy.y = 250;

    game.update(1 / 60);

    expect(game.lives).toBe(2);
    expect(enemy.state).toBe(EnemyState.EXPLODING);
  });

  it('renders complete game scene including formation enemies without exception', () => {
    game.startGame();
    game.update(2.3);

    const mockCtx = {
      canvas: game.getCanvas(),
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      globalAlpha: 1.0,
      imageSmoothingEnabled: false,
      fillRect: vi.fn(),
      fillText: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    expect(() => game.render(mockCtx)).not.toThrow();
  });
});

