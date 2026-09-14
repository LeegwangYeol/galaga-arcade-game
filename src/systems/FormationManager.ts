/**
 * Galaga Arcade Web Game — Formation Grid & Attack Dive Scheduler Subsystem
 * 
 * Manages:
 * 1. 40-alien grid formation across 5 rows and 10 columns
 * 2. Harmonic breathing expansion (±18%) and horizontal sway (±12px)
 * 3. 5-stage formation entry wave orchestrator
 * 4. Periodic dive attack peeling scheduler (Solo, Paired Goei, Boss Escort)
 * 5. Collision hit testing and state synchronization
 */

import { Enemy, type EnemyBulletRequest } from '../entities/Enemy';
import { FlightPathManager, type SubWaveType } from './FlightPathManager';
import { BezierCurve, CompositeBezierPath } from '../math/Bezier';
import { EnemyType, EnemyState, type FormationSlot, type Point2D } from '../types';
import { DifficultyCalculator, type StageDifficultyConfig } from './DifficultyCalculator';
import { ObjectPool } from '../core/ObjectPool';
import type { DynamicDifficultyManager } from './DynamicDifficultyManager';
import { PhantomClone } from '../core/glitch/PhantomClone';

export interface FormationManagerConfig {
  onEnemyFire?: (request: EnemyBulletRequest) => void;
  onEnemyDestroyed?: (enemy: Enemy, points: number) => void;
  onStageClear?: () => void;
  onTractorBeamRequest?: (boss: Enemy) => void;
  onSpawnBoss?: (stage: number) => Enemy[];
  dynamicDifficultyManager?: DynamicDifficultyManager;
  glitchEventManager?: any;
}

export class FormationManager {
  // Screen Geometry
  public static readonly GRID_CENTER_X = 112;
  public static readonly GRID_BASE_Y = 52;
  public static readonly COL_PITCH = 16;
  public static readonly ROW_PITCH = 16;

  // Harmonic Oscillation Parameters
  public static readonly SWAY_AMPLITUDE = 12.0;    // Pixels
  public static readonly SWAY_FREQUENCY = 0.333;   // Hz (3.0s period)
  public static readonly EXPAND_AMPLITUDE = 0.18;  // ±18%
  public static readonly EXPAND_FREQUENCY = 0.500; // Hz (2.0s period)
  public static readonly ROW_WAVE_AMP = 2.0;       // Pixels
  public static readonly ROW_WAVE_PHASE = 0.4;     // Rad/row

  // Grid Slots & Enemies
  public readonly slots: FormationSlot[] = [];
  public readonly enemies: Enemy[] = [];
  public readonly slotToEnemyMap: Map<string, Enemy> = new Map();
  public readonly enemyPool: ObjectPool<Enemy>;
  public readonly phantomPool: ObjectPool<PhantomClone>;
  public glitchEventManager?: any;
  private readonly scratchSlotPos: Point2D = { x: 0, y: 0 };

  // Sub-Wave Ingress Orchestrator State
  public isEntryWaveActive: boolean = false;
  public currentSubWave: number = 0;
  public subWaveTimer: number = 0;
  public subWaveDelay: number = 2.2; // Seconds between sub-waves

  // Formation Motion & Dive Scheduler State
  public elapsedTime: number = 0;
  public diveTimer: number = 0;
  public diveInterval: number = 3.0; // Seconds between attack dives
  public stage: number = 1;
  public maxConcurrentDivers: number = 2;

  // Difficulty & Scaling Configuration
  public stageConfig!: StageDifficultyConfig;
  public diveSpeedMultiplier: number = 1.0;
  public bulletSpeed: number = 180;
  public isChallengingStage: boolean = false;
  public formationFireTimer: number = 0;

  // Callbacks
  public onEnemyFire?: (request: EnemyBulletRequest) => void;
  public onEnemyDestroyed?: (enemy: Enemy, points: number) => void;
  public onStageClear?: () => void;
  public onTractorBeamRequest?: (boss: Enemy) => void;
  public onSpawnBoss?: (stage: number) => Enemy[];
  public dynamicDifficultyManager?: DynamicDifficultyManager;

  constructor(config?: FormationManagerConfig) {
    if (config) {
      this.onEnemyFire = config.onEnemyFire;
      this.onEnemyDestroyed = config.onEnemyDestroyed;
      this.onStageClear = config.onStageClear;
      this.onTractorBeamRequest = config.onTractorBeamRequest;
      this.onSpawnBoss = config.onSpawnBoss;
      this.dynamicDifficultyManager = config.dynamicDifficultyManager;
      this.glitchEventManager = config.glitchEventManager;
    }

    this.enemyPool = new ObjectPool<Enemy>({
      factory: () => new Enemy(),
      reset: (e) => e.reset(),
      initialSize: 64,
      maxSize: 64,
      autoExpand: false,
    });

    this.phantomPool = new ObjectPool<PhantomClone>({
      factory: () => new PhantomClone(),
      reset: (p) => p.reset(),
      initialSize: 8,
      maxSize: 8,
      autoExpand: false,
    });

    this.stageConfig = DifficultyCalculator.getStageConfig(1);
    this.initializeGridSlots();
  }

  public getEffectiveDiveSpeedMultiplier(): number {
    const base = this.diveSpeedMultiplier || 1.0;
    if (this.isChallengingStage) {
      return base;
    }
    const dda = this.dynamicDifficultyManager ? this.dynamicDifficultyManager.getDiveSpeedMultiplier() : 1.0;
    return base * dda;
  }

  public getEffectiveBulletDensityMultiplier(): number {
    if (this.isChallengingStage) {
      return 1.0;
    }
    return this.dynamicDifficultyManager ? this.dynamicDifficultyManager.getBulletDensityMultiplier() : 1.0;
  }

  // ==========================================================================
  // 1. Grid Slot Initialization (40 Aliens across 5 Rows)
  // ==========================================================================

  private initializeGridSlots(): void {
    this.slots.length = 0;

    // Row 0: 4 Boss Galagas (Cols 3..6)
    for (let c = 3; c <= 6; c++) {
      this.slots.push({
        row: 0,
        col: c,
        type: EnemyType.BOSS,
        homeX: FormationManager.GRID_CENTER_X + (c - 4.5) * FormationManager.COL_PITCH,
        homeY: FormationManager.GRID_BASE_Y + 0 * FormationManager.ROW_PITCH,
        occupied: false,
        enemyId: null,
      });
    }

    // Row 1: 8 Red Goeis (Cols 1..8)
    for (let c = 1; c <= 8; c++) {
      this.slots.push({
        row: 1,
        col: c,
        type: EnemyType.GOEI,
        homeX: FormationManager.GRID_CENTER_X + (c - 4.5) * FormationManager.COL_PITCH,
        homeY: FormationManager.GRID_BASE_Y + 1 * FormationManager.ROW_PITCH,
        occupied: false,
        enemyId: null,
      });
    }

    // Row 2: 8 Red Goeis (Cols 1..8)
    for (let c = 1; c <= 8; c++) {
      this.slots.push({
        row: 2,
        col: c,
        type: EnemyType.GOEI,
        homeX: FormationManager.GRID_CENTER_X + (c - 4.5) * FormationManager.COL_PITCH,
        homeY: FormationManager.GRID_BASE_Y + 2 * FormationManager.ROW_PITCH,
        occupied: false,
        enemyId: null,
      });
    }

    // Row 3: 10 Yellow Zakos (Cols 0..9)
    for (let c = 0; c <= 9; c++) {
      this.slots.push({
        row: 3,
        col: c,
        type: EnemyType.ZAKO,
        homeX: FormationManager.GRID_CENTER_X + (c - 4.5) * FormationManager.COL_PITCH,
        homeY: FormationManager.GRID_BASE_Y + 3 * FormationManager.ROW_PITCH,
        occupied: false,
        enemyId: null,
      });
    }

    // Row 4: 10 Yellow Zakos (Cols 0..9)
    for (let c = 0; c <= 9; c++) {
      this.slots.push({
        row: 4,
        col: c,
        type: EnemyType.ZAKO,
        homeX: FormationManager.GRID_CENTER_X + (c - 4.5) * FormationManager.COL_PITCH,
        homeY: FormationManager.GRID_BASE_Y + 4 * FormationManager.ROW_PITCH,
        occupied: false,
        enemyId: null,
      });
    }
  }

  // ==========================================================================
  // 2. Harmonic Oscillation Mathematics
  // ==========================================================================

  /**
   * Computes dynamic slot position in virtual space at time t.
   */
  public getSlotPosition(
    row: number,
    col: number,
    t: number = this.elapsedTime,
    out?: Point2D
  ): Point2D {
    const sway =
      FormationManager.SWAY_AMPLITUDE *
      Math.sin(2 * Math.PI * FormationManager.SWAY_FREQUENCY * t);

    const expansion =
      1.0 +
      FormationManager.EXPAND_AMPLITUDE *
      Math.sin(2 * Math.PI * FormationManager.EXPAND_FREQUENCY * t);

    const rowWave =
      FormationManager.ROW_WAVE_AMP *
      Math.sin(
        2 * Math.PI * FormationManager.EXPAND_FREQUENCY * t +
        row * FormationManager.ROW_WAVE_PHASE
      );

    const x =
      FormationManager.GRID_CENTER_X +
      sway +
      (col - 4.5) * FormationManager.COL_PITCH * expansion;

    const y =
      FormationManager.GRID_BASE_Y +
      row * FormationManager.ROW_PITCH +
      rowWave;

    if (out) {
      out.x = x;
      out.y = y;
      return out;
    }
    return { x, y };
  }

  // ==========================================================================
  // 3. Stage Wave Lifecycle & Spawning
  // ==========================================================================

  public reset(): void {
    this.enemyPool.clear();
    this.phantomPool.clear();
    this.enemies.length = 0;
    this.slotToEnemyMap.clear();
    this.isEntryWaveActive = false;
    this.currentSubWave = 0;
    this.subWaveTimer = 0;
    this.elapsedTime = 0;
    this.diveTimer = 0;
    this.isChallengingStage = false;
    this.diveSpeedMultiplier = 1.0;
    this.bulletSpeed = 180;
    this.formationFireTimer = 0;

    for (const slot of this.slots) {
      slot.occupied = false;
      slot.enemyId = null;
    }
  }

  public spawnStage(stage: number = 1): void {
    this.reset();
    this.stage = stage;
    this.stageConfig = DifficultyCalculator.getStageConfig(stage);

    this.diveInterval = this.stageConfig.diveInterval;
    this.maxConcurrentDivers = this.stageConfig.maxConcurrentDivers;
    this.diveSpeedMultiplier = this.stageConfig.diveSpeedMultiplier;
    this.bulletSpeed = this.stageConfig.enemyBulletSpeed;
    this.isChallengingStage = this.stageConfig.isChallengingStage;
    this.formationFireTimer = 0;

    if (this.isChallengingStage) {
      this.spawnChallengingStage();
      return;
    }

    if (DifficultyCalculator.isBossStage(stage)) {
      this.enemies.length = 0;
      this.slotToEnemyMap.clear();
      this.isEntryWaveActive = false;
      if (this.onSpawnBoss) {
        const bossEntities = this.onSpawnBoss(stage);
        for (const e of bossEntities) {
          this.enemies.push(e);
        }
      }
      return;
    }

    // Create 40 enemy instances from enemyPool
    let nextId = 1;
    for (const slot of this.slots) {
      const enemy = this.enemyPool.acquire() ?? new Enemy();

      // Pre-align initial coordinates with entry wave launch origin to eliminate launch jumps
      let initialX = slot.homeX;
      let initialY = -30;
      if ((slot.row === 3 && slot.col <= 2) || (slot.row === 4 && slot.col <= 4)) {
        // Sub-Wave 4: Bottom-Left swoop origin
        initialX = -20;
        const waveIndex = slot.row === 3 ? slot.col : 3 + slot.col;
        const staggerY = (waveIndex % 4) * 6;
        initialY = 230 + staggerY;
      } else if ((slot.row === 3 && slot.col >= 7) || (slot.row === 4 && slot.col >= 5)) {
        // Sub-Wave 5: Bottom-Right swoop origin
        initialX = 244;
        const waveIndex = slot.row === 3 ? slot.col - 7 : 3 + (slot.col - 5);
        const staggerY = (waveIndex % 4) * 6;
        initialY = 230 + staggerY;
      }

      enemy.init(
        nextId++,
        slot.type,
        slot.row,
        slot.col,
        initialX,
        initialY,
        this.stageConfig.tier
      );

      const { health, shield } = DifficultyCalculator.getEnemyHealthAndShield(stage, slot.type);
      enemy.setDifficulty(health, shield, this.stageConfig.tier, this.getEffectiveDiveSpeedMultiplier());
      enemy.onFireBullet = (req) => this.onEnemyFire?.(req);
      enemy.onExplode = () => {};

      // Initialize sub-wave enemies in ENTERING state offscreen until wave launch
      enemy.state = EnemyState.ENTERING;
      enemy.flightPath = null;
      enemy.hasStartedPath = false;
      enemy.active = true;

      this.enemies.push(enemy);
      const slotKey = `${slot.row}_${slot.col}`;
      this.slotToEnemyMap.set(slotKey, enemy);
      slot.occupied = true;
      slot.enemyId = String(enemy.id);
    }

    // Launch sub-wave entry phase
    this.isEntryWaveActive = true;
    this.currentSubWave = 0;
    this.subWaveTimer = this.subWaveDelay; // Trigger Sub-Wave 1 immediately
  }

  /**
   * Spawns 40 enemies configured for 12 acrobatic Challenging Stages.
   */
  private spawnChallengingStage(): void {
    this.enemyPool.clear();
    this.phantomPool.clear();
    this.enemies.length = 0;
    this.slotToEnemyMap.clear();

    // 5 waves of 8 enemies = 40 total
    let nextId = 1;
    for (let w = 0; w < 5; w++) {
      for (let i = 0; i < 8; i++) {
        let enemyType: EnemyType;
        if (w === 4) {
          enemyType = i < 4 ? EnemyType.BOSS : EnemyType.GOEI;
        } else if (w % 2 === 0) {
          enemyType = EnemyType.ZAKO;
        } else {
          enemyType = EnemyType.GOEI;
        }

        const enemy = this.enemyPool.acquire() ?? new Enemy();
        enemy.init(
          nextId++,
          enemyType,
          0,
          0,
          112,
          -30,
          this.stageConfig.tier,
          1,
          0
        );

        enemy.setDifficulty(1, 0, this.stageConfig.tier, this.diveSpeedMultiplier);
        enemy.canShoot = false;
        enemy.isChallenging = true;
        enemy.active = false;
        enemy.state = EnemyState.INACTIVE;
        enemy.onFireBullet = (req) => this.onEnemyFire?.(req);
        enemy.onExplode = () => {};

        this.enemies.push(enemy);
      }
    }

    this.isEntryWaveActive = true;
    this.currentSubWave = 0;
    this.subWaveTimer = this.subWaveDelay; // Trigger wave 0 immediately on first update tick
  }

  /**
   * Launches one of the 5 acrobatic Challenging Stage waves.
   */
  private launchChallengingWave(waveIndex: number): void {
    const startIndex = waveIndex * 8;
    for (let i = 0; i < 8; i++) {
      const enemy = this.enemies[startIndex + i];
      if (!enemy) continue;

      const path = this.createChallengingWavePath(waveIndex, i);
      enemy.flightPath = path;
      enemy.pathElapsedMs = -i * 100; // 100ms stagger between ships
      enemy.state = EnemyState.ENTERING;
      enemy.active = true;

      const startSample = path.evaluateTime(0, Math.PI / 2);
      enemy.x = startSample.position.x;
      enemy.y = startSample.position.y;
      enemy.rotation = startSample.heading;
    }
  }

  /**
   * Acrobatic composite Bézier flight paths for 5 Challenging Stage waves.
   */
  public createChallengingWavePath(waveIndex: number, alienIndex: number): CompositeBezierPath {
    switch (waveIndex) {
      case 0: {
        // Wave 1: Top-Center Split Loop (8 Zakos)
        const isLeft = alienIndex < 4;
        const seg1 = new BezierCurve(
          { x: 112, y: -20 },
          { x: 112, y: 30 },
          { x: 112, y: 70 },
          { x: 112, y: 110 }
        );
        const seg2 = isLeft
          ? new BezierCurve({ x: 112, y: 110 }, { x: 60, y: 160 }, { x: 25, y: 120 }, { x: 65, y: 80 })
          : new BezierCurve({ x: 112, y: 110 }, { x: 164, y: 160 }, { x: 199, y: 120 }, { x: 159, y: 80 });
        const seg3 = isLeft
          ? new BezierCurve({ x: 65, y: 80 }, { x: 95, y: 50 }, { x: 40, y: 220 }, { x: 20, y: 310 })
          : new BezierCurve({ x: 159, y: 80 }, { x: 129, y: 50 }, { x: 184, y: 220 }, { x: 204, y: 310 });
        return new CompositeBezierPath(`CHALLENGING_WAVE_1_${alienIndex}`, [
          { curve: seg1, speed: 165 },
          { curve: seg2, speed: 165 },
          { curve: seg3, speed: 165 },
        ]);
      }
      case 1: {
        // Wave 2: Intersecting Figure-8 Sweeper (8 Goeis)
        const seg1 = new BezierCurve({ x: 235, y: -20 }, { x: 210, y: 60 }, { x: 120, y: 100 }, { x: 70, y: 120 });
        const seg2 = new BezierCurve({ x: 70, y: 120 }, { x: 30, y: 140 }, { x: 20, y: 185 }, { x: 65, y: 195 });
        const seg3 = new BezierCurve({ x: 65, y: 195 }, { x: 120, y: 205 }, { x: 160, y: 160 }, { x: 185, y: 130 });
        const seg4 = new BezierCurve({ x: 185, y: 130 }, { x: 210, y: 100 }, { x: 100, y: 220 }, { x: -20, y: 270 });
        return new CompositeBezierPath(`CHALLENGING_WAVE_2_${alienIndex}`, [
          { curve: seg1, speed: 175 },
          { curve: seg2, speed: 175 },
          { curve: seg3, speed: 175 },
          { curve: seg4, speed: 175 },
        ]);
      }
      case 2: {
        // Wave 3: Expanding Sinusoidal Spiral (8 Zakos)
        const seg1 = new BezierCurve({ x: -15, y: 40 }, { x: 50, y: 40 }, { x: 140, y: 60 }, { x: 190, y: 80 });
        const seg2 = new BezierCurve({ x: 190, y: 80 }, { x: 225, y: 100 }, { x: 120, y: 120 }, { x: 34, y: 140 });
        const seg3 = new BezierCurve({ x: 34, y: 140 }, { x: -10, y: 150 }, { x: 90, y: 200 }, { x: 112, y: 240 });
        const seg4 = new BezierCurve({ x: 112, y: 240 }, { x: 125, y: 265 }, { x: 112, y: 285 }, { x: 112, y: 310 });
        return new CompositeBezierPath(`CHALLENGING_WAVE_3_${alienIndex}`, [
          { curve: seg1, speed: 170 },
          { curve: seg2, speed: 170 },
          { curve: seg3, speed: 170 },
          { curve: seg4, speed: 170 },
        ]);
      }
      case 3: {
        // Wave 4: Double Crossing Swarm (8 Goeis)
        if (alienIndex < 4) {
          const seg1 = new BezierCurve({ x: -20, y: 30 }, { x: 30, y: 60 }, { x: 80, y: 100 }, { x: 112, y: 140 });
          const seg2 = new BezierCurve({ x: 112, y: 140 }, { x: 160, y: 190 }, { x: 195, y: 210 }, { x: 170, y: 240 });
          const seg3 = new BezierCurve({ x: 170, y: 240 }, { x: 140, y: 270 }, { x: 60, y: 280 }, { x: 15, y: 310 });
          return new CompositeBezierPath(`CHALLENGING_WAVE_4_L_${alienIndex}`, [
            { curve: seg1, speed: 180 },
            { curve: seg2, speed: 180 },
            { curve: seg3, speed: 180 },
          ]);
        } else {
          const seg1 = new BezierCurve({ x: 244, y: 30 }, { x: 194, y: 60 }, { x: 144, y: 100 }, { x: 112, y: 140 });
          const seg2 = new BezierCurve({ x: 112, y: 140 }, { x: 64, y: 190 }, { x: 29, y: 210 }, { x: 54, y: 240 });
          const seg3 = new BezierCurve({ x: 54, y: 240 }, { x: 84, y: 270 }, { x: 164, y: 280 }, { x: 209, y: 310 });
          return new CompositeBezierPath(`CHALLENGING_WAVE_4_R_${alienIndex}`, [
            { curve: seg1, speed: 180 },
            { curve: seg2, speed: 180 },
            { curve: seg3, speed: 180 },
          ]);
        }
      }
      case 4:
      default: {
        // Wave 5: The Grand Armada (4 Bosses + 4 Goeis)
        const offsets = [-30, -18, -6, 6, 18, 30, -12, 12];
        const dx = offsets[alienIndex % offsets.length]!;
        const exitX = dx < 0 ? -30 : 254;
        const seg1 = new BezierCurve({ x: 112 + dx, y: -30 }, { x: 112 + dx, y: 40 }, { x: 112 + dx, y: 80 }, { x: 112 + dx, y: 115 });
        const seg2 = new BezierCurve({ x: 112 + dx, y: 115 }, { x: 112 + dx * 1.5, y: 150 }, { x: 112 + dx * 1.8, y: 100 }, { x: 112 + dx, y: 80 });
        const seg3 = new BezierCurve({ x: 112 + dx, y: 80 }, { x: 112, y: 140 }, { x: 112 + dx * 0.8, y: 220 }, { x: 112 + dx * 0.5, y: 250 });
        const seg4 = new BezierCurve({ x: 112 + dx * 0.5, y: 250 }, { x: 112 + dx, y: 280 }, { x: exitX, y: 290 }, { x: exitX, y: 310 });
        return new CompositeBezierPath(`CHALLENGING_WAVE_5_${alienIndex}`, [
          { curve: seg1, speed: 185 },
          { curve: seg2, speed: 185 },
          { curve: seg3, speed: 185 },
          { curve: seg4, speed: 185 },
        ]);
      }
    }
  }

  // ==========================================================================
  // 4. Sub-Wave Entry Orchestration
  // ==========================================================================

  private updateEntryWaves(dt: number): void {
    if (!this.isEntryWaveActive) return;

    this.subWaveTimer += dt;
    if (this.subWaveTimer >= this.subWaveDelay && this.currentSubWave < 5) {
      this.subWaveTimer = 0;
      if (this.isChallengingStage) {
        this.launchChallengingWave(this.currentSubWave);
      } else {
        this.launchSubWave(this.currentSubWave);
      }
      this.currentSubWave++;
    }

    if (this.currentSubWave >= 5) {
      const hasEnteringEnemies = this.enemies.some(
        (e) => e.active && e.state === EnemyState.ENTERING
      );
      if (!hasEnteringEnemies) {
        this.isEntryWaveActive = false;
      }
    }
  }

  private launchSubWave(subWaveIndex: number): void {
    let waveType: SubWaveType;
    let waveEnemies: Enemy[] = [];

    switch (subWaveIndex) {
      case 0:
        // Sub-Wave 1: Top Center (4 Bosses + 4 Goeis in Row 1 Cols 3..6)
        waveType = 'WAVE_1_TOP_CENTER';
        waveEnemies = this.enemies.filter(
          (e) =>
            (e.row === 0 && e.col >= 3 && e.col <= 6) ||
            (e.row === 1 && e.col >= 3 && e.col <= 6)
        );
        break;

      case 1:
        // Sub-Wave 2: Top Right (8 Goeis: Row 1 Cols 1,2,7,8 + Row 2 Cols 3..6)
        waveType = 'WAVE_2_TOP_RIGHT';
        waveEnemies = this.enemies.filter(
          (e) =>
            (e.row === 1 && (e.col === 1 || e.col === 2 || e.col === 7 || e.col === 8)) ||
            (e.row === 2 && e.col >= 3 && e.col <= 6)
        );
        break;

      case 2:
        // Sub-Wave 3: Top Left (8 Goeis/Zakos: Row 2 Cols 1,2,7,8 + Row 3 Cols 3..6)
        waveType = 'WAVE_3_TOP_LEFT';
        waveEnemies = this.enemies.filter(
          (e) =>
            (e.row === 2 && (e.col === 1 || e.col === 2 || e.col === 7 || e.col === 8)) ||
            (e.row === 3 && e.col >= 3 && e.col <= 6)
        );
        break;

      case 3:
        // Sub-Wave 4: Bottom Left (8 Zakos: Row 3 Cols 0..2 + Row 4 Cols 0..4)
        waveType = 'WAVE_4_BOTTOM_LEFT';
        waveEnemies = this.enemies.filter(
          (e) =>
            (e.row === 3 && e.col <= 2) ||
            (e.row === 4 && e.col <= 4)
        );
        break;

      case 4:
      default:
        // Sub-Wave 5: Bottom Right (8 Zakos: Row 3 Cols 7..9 + Row 4 Cols 5..9)
        waveType = 'WAVE_5_BOTTOM_RIGHT';
        waveEnemies = this.enemies.filter(
          (e) =>
            (e.row === 3 && e.col >= 7) ||
            (e.row === 4 && e.col >= 5)
        );
        break;
    }

    // Assign flight path to each enemy in the sub-wave
    for (let i = 0; i < waveEnemies.length; i++) {
      const enemy = waveEnemies[i];
      if (!enemy) continue;

      // Staggered entry delay: 120ms between wingmen
      const staggerDelaySec = (i * 120) / 1000;

      // Iterative fixed-point arrival prediction: converges Bézier endpoint to moving slot (< 1.5 px)
      this.getSlotPosition(enemy.row, enemy.col, this.elapsedTime + staggerDelaySec, this.scratchSlotPos);
      let path = FlightPathManager.createEntryPath(waveType, i, this.scratchSlotPos);

      for (let iter = 0; iter < 2; iter++) {
        const expectedArrivalSec = this.elapsedTime + staggerDelaySec + path.totalDurationMs / 1000;
        this.getSlotPosition(enemy.row, enemy.col, expectedArrivalSec, this.scratchSlotPos);
        path = FlightPathManager.createEntryPath(waveType, i, this.scratchSlotPos);
      }

      enemy.flightPath = path;
      enemy.hasStartedPath = true;
      enemy.pathElapsedMs = -i * 120; // Staggered entry (120ms between wingmen)
      enemy.state = EnemyState.ENTERING;
      enemy.active = true;
      enemy.returnSlotX = this.scratchSlotPos.x;
      enemy.returnSlotY = this.scratchSlotPos.y;

      const startSample = path.evaluateTime(0, Math.PI / 2);
      enemy.x = startSample.position.x;
      enemy.y = startSample.position.y;
      enemy.rotation = startSample.heading;
    }
  }

  // ==========================================================================
  // 5. Dive Attack Scheduler
  // ==========================================================================

  // ==========================================================================
  // 5. Dive Attack Scheduler & Tractor Beam Launch
  // ==========================================================================

  public isTractorBeamActive(): boolean {
    return this.enemies.some(
      (e) => e.active && e.state === EnemyState.TRACTOR_BEAM_ACTIVE
    );
  }

  private updateDiveScheduler(dt: number, playerX: number, playerIsDual: boolean = false): void {
    if (this.isEntryWaveActive) return;

    this.diveTimer += dt;
    const effectiveDiveInterval = this.diveInterval / Math.max(0.1, this.getEffectiveBulletDensityMultiplier());
    if (this.diveTimer < effectiveDiveInterval) {
      return;
    }

    const currentDivers = this.enemies.filter(
      (e) =>
        e.active &&
        (e.state === EnemyState.DIVING_SOLO ||
          e.state === EnemyState.DIVING_ESCORT ||
          e.state === EnemyState.TRACTOR_BEAM_ACTIVE ||
          e.state === EnemyState.CAPTURED_HOSTILE ||
          e.state === EnemyState.RETURNING_TO_FORMATION)
    );

    if (currentDivers.length >= this.maxConcurrentDivers) {
      return;
    }

    this.diveTimer = 0;
    this.triggerDiveAttack(playerX, playerIsDual);
  }

  private triggerDiveAttack(playerX: number, playerIsDual: boolean = false): void {
    const formationEnemies = this.enemies.filter(
      (e) => e.active && e.state === EnemyState.IN_FORMATION
    );

    if (formationEnemies.length === 0) return;

    // Stage 2+ Tractor Beam Dive Chance (against Single Fighter only, max 1 active beam)
    const shouldAttemptTractor =
      this.stage >= 2 &&
      !playerIsDual &&
      !this.isTractorBeamActive() &&
      Math.random() < 0.35;

    if (shouldAttemptTractor) {
      const eligibleBosses = formationEnemies.filter(
        (e) => e.type === EnemyType.BOSS && !e.hasCapturedFighter && e.health >= 1
      );
      if (eligibleBosses.length > 0) {
        const boss = eligibleBosses[Math.floor(Math.random() * eligibleBosses.length)]!;
        this.launchTractorBeamDive(boss, playerX);
        return;
      }
    }

    const roll = Math.random();

    if (roll < 0.40) {
      // 1. Solo Zako Dive
      const zakos = formationEnemies.filter((e) => e.type === EnemyType.ZAKO);
      if (zakos.length > 0) {
        const zako = zakos[Math.floor(Math.random() * zakos.length)]!;
        this.peelOffSolo(zako, playerX);
        return;
      }
    } else if (roll < 0.75) {
      // 2. Goei Paired Dive
      const goeis = formationEnemies.filter((e) => e.type === EnemyType.GOEI);
      if (goeis.length >= 2) {
        // Find 2 adjacent or close Goeis
        const leftGoei = goeis.find((g) => g.col <= 4) || goeis[0]!;
        const rightGoei = goeis.find((g) => g.col >= 5 && g.id !== leftGoei.id) || goeis[1]!;
        this.peelOffPairedGoeis(leftGoei, rightGoei, playerX);
        return;
      } else if (goeis.length === 1) {
        this.peelOffSolo(goeis[0]!, playerX);
        return;
      }
    }

    // 3. Boss Galaga Dive (Solo or with Goei Escorts)
    const bosses = formationEnemies.filter((e) => e.type === EnemyType.BOSS);
    if (bosses.length > 0) {
      const boss = bosses[Math.floor(Math.random() * bosses.length)]!;
      const goeis = formationEnemies.filter((e) => e.type === EnemyType.GOEI);
      const escorts = goeis.slice(0, Math.min(2, goeis.length));
      this.peelOffBossEscort(boss, escorts, playerX);
      return;
    }

    // Fallback: Pick any formation enemy
    const fallback = formationEnemies[Math.floor(Math.random() * formationEnemies.length)]!;
    this.peelOffSolo(fallback, playerX);
  }

  public peelOffSolo(enemy: Enemy, playerX: number): void {
    const isLeft = enemy.x <= FormationManager.GRID_CENTER_X;
    const path = FlightPathManager.createSoloDivePath({ x: enemy.x, y: enemy.y }, playerX, isLeft);

    enemy.flightPath = path;
    enemy.pathElapsedMs = 0;
    enemy.state =
      enemy.type === EnemyType.CAPTURED_FIGHTER && !enemy.escortBoss
        ? EnemyState.CAPTURED_HOSTILE
        : EnemyState.DIVING_SOLO;
    enemy.escortCount = 0;
    enemy.escortBossId = null;
    enemy.escortBoss = null;
    enemy.shotsRemainingInDive = this.stageConfig ? this.stageConfig.shotsPerDive : 1;
    enemy.diveSpeed = 160 * this.getEffectiveDiveSpeedMultiplier();

    const returnSlot = this.getSlotPosition(enemy.row, enemy.col, this.elapsedTime + 4.0);
    enemy.returnSlotX = returnSlot.x;
    enemy.returnSlotY = returnSlot.y;
  }

  public launchTractorBeamDive(boss: Enemy, playerX: number): void {
    const isLeft = boss.x <= FormationManager.GRID_CENTER_X;
    const haltX = Math.max(48, Math.min(176, playerX));
    const haltY = 100;

    const p0 = { x: boss.x, y: boss.y };
    const p1 = { x: isLeft ? boss.x - 20 : boss.x + 20, y: boss.y + 20 };
    const p2 = { x: haltX, y: 60 };
    const p3 = { x: haltX, y: haltY };

    const curve = new BezierCurve(p0, p1, p2, p3);
    const path = new CompositeBezierPath('TRACTOR_DIVE', [
      { curve, durationMs: 1000 },
    ]);

    boss.flightPath = path;
    boss.pathElapsedMs = 0;
    boss.isTractorDiving = true;
    boss.state = EnemyState.DIVING_SOLO;
    boss.escortCount = 0;
    boss.escortBossId = null;
    boss.escortBoss = null;
    boss.shotsRemainingInDive = 0;
    boss.diveSpeed = 160 * this.getEffectiveDiveSpeedMultiplier();

    const returnSlot = this.getSlotPosition(boss.row, boss.col, this.elapsedTime + 6.0);
    boss.returnSlotX = returnSlot.x;
    boss.returnSlotY = returnSlot.y;
  }

  private peelOffPairedGoeis(leftGoei: Enemy, rightGoei: Enemy, playerX: number): void {
    const { leftPath, rightPath } = FlightPathManager.createPairedGoeiDivePaths(
      { x: leftGoei.x, y: leftGoei.y },
      { x: rightGoei.x, y: rightGoei.y },
      playerX
    );

    leftGoei.flightPath = leftPath;
    leftGoei.pathElapsedMs = 0;
    leftGoei.state = EnemyState.DIVING_SOLO;
    leftGoei.escortCount = 0;
    leftGoei.escortBossId = null;
    leftGoei.escortBoss = null;
    leftGoei.shotsRemainingInDive = this.stageConfig ? this.stageConfig.shotsPerDive : 1;
    leftGoei.diveSpeed = 160 * this.getEffectiveDiveSpeedMultiplier();
    const leftSlot = this.getSlotPosition(leftGoei.row, leftGoei.col, this.elapsedTime + 4.0);
    leftGoei.returnSlotX = leftSlot.x;
    leftGoei.returnSlotY = leftSlot.y;

    rightGoei.flightPath = rightPath;
    rightGoei.pathElapsedMs = 0;
    rightGoei.state = EnemyState.DIVING_SOLO;
    rightGoei.escortCount = 0;
    rightGoei.escortBossId = null;
    rightGoei.escortBoss = null;
    rightGoei.shotsRemainingInDive = this.stageConfig ? this.stageConfig.shotsPerDive : 1;
    rightGoei.diveSpeed = 160 * this.getEffectiveDiveSpeedMultiplier();
    const rightSlot = this.getSlotPosition(rightGoei.row, rightGoei.col, this.elapsedTime + 4.0);
    rightGoei.returnSlotX = rightSlot.x;
    rightGoei.returnSlotY = rightSlot.y;
  }

  private peelOffBossEscort(boss: Enemy, escorts: Enemy[], playerX: number): void {
    const bossPath = FlightPathManager.createBossEscortedDivePath(
      { x: boss.x, y: boss.y },
      playerX
    );

    boss.flightPath = bossPath;
    boss.pathElapsedMs = 0;
    boss.state = EnemyState.DIVING_ESCORT;
    boss.escortCount = escorts.length;
    boss.escortBossId = null;
    boss.escortBoss = null;
    boss.shotsRemainingInDive = this.stageConfig ? this.stageConfig.shotsPerDive : 1;
    boss.diveSpeed = 160 * this.getEffectiveDiveSpeedMultiplier();
    const bossSlot = this.getSlotPosition(boss.row, boss.col, this.elapsedTime + 4.0);
    boss.returnSlotX = bossSlot.x;
    boss.returnSlotY = bossSlot.y;

    for (let i = 0; i < escorts.length; i++) {
      const escort = escorts[i];
      if (!escort) continue;

      const isLeftWing = i === 0;
      const escortPath = FlightPathManager.createBossEscortWingmanPath(
        { x: boss.x, y: boss.y },
        { x: escort.x, y: escort.y },
        playerX,
        isLeftWing,
        bossPath
      );

      escort.flightPath = escortPath;
      escort.pathElapsedMs = 0; // Synchronized with Boss
      escort.state = EnemyState.DIVING_ESCORT;
      escort.escortBossId = boss.id;
      escort.escortBoss = boss;
      escort.shotsRemainingInDive = this.stageConfig ? this.stageConfig.shotsPerDive : 1;
      escort.diveSpeed = 160 * this.getEffectiveDiveSpeedMultiplier();
      const escortSlot = this.getSlotPosition(escort.row, escort.col, this.elapsedTime + 4.0);
      escort.returnSlotX = escortSlot.x;
      escort.returnSlotY = escortSlot.y;
    }
  }

  // ==========================================================================
  // 6. Master Update & Render Pipeline
  // ==========================================================================

  public update(
    dt: number,
    playerX: number = 112,
    playerY: number = 250,
    playerIsDual: boolean = false
  ): void {
    this.elapsedTime += dt;

    if (this.isChallengingStage) {
      // 1. Update Ingress Waves
      this.updateEntryWaves(dt);

      // 2. Update Active Ships along Bézier Curves
      let livingCount = 0;
      for (const enemy of this.enemies) {
        if (!enemy.active) continue;

        livingCount++;
        enemy.update(dt, playerX, playerY);

        // Despawn offscreen upon path completion
        if (enemy.flightPath === null && enemy.state !== EnemyState.EXPLODING) {
          enemy.active = false;
          enemy.state = EnemyState.INACTIVE;
        }
      }

      // STRICT INVARIANT: Complete suppression of enemy firing during challenging stage
      // (NO calls to enemy.attemptFire or updateDiveScheduler)

      // 3. Stage Clear Trigger: All 5 waves spawned AND all enemies resolved
      if ((this.currentSubWave >= 5 || !this.isEntryWaveActive) && livingCount === 0 && this.enemies.length >= 40) {
        this.onStageClear?.();
      }
      return;
    }

    // 1. Update Sub-Wave Entry Phase
    this.updateEntryWaves(dt);
    if (this.isEntryWaveActive && this.currentSubWave >= 5) {
      const hasEnteringEnemies = this.enemies.some(
        (e) => e.active && e.state === EnemyState.ENTERING
      );
      if (!hasEnteringEnemies) {
        this.isEntryWaveActive = false;
      }
    }

    // 2. Update Dive Attack Scheduler
    this.updateDiveScheduler(dt, playerX, playerIsDual);

    // 2b. Formation Sniper Fire (Elite & Dreadnought Tiers)
    if (this.stageConfig && this.stageConfig.formationFireInterval < Infinity) {
      this.formationFireTimer += dt;
      const effectiveSniperInterval =
        this.stageConfig.formationFireInterval / Math.max(0.1, this.getEffectiveBulletDensityMultiplier());
      if (this.formationFireTimer >= effectiveSniperInterval) {
        this.formationFireTimer = 0;
        this.triggerFormationSniperShot(playerX, playerY);
      }
    }

    // 3. Update Individual Enemy Positions & States
    let livingCount = 0;
    const hasKinematicGlitch = Boolean(this.glitchEventManager?.hasActiveKinematicAnomaly?.());
    const glitchType = this.glitchEventManager?.getActiveType?.();
    const isSector = Boolean(this.glitchEventManager?.isSectorActive?.());

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;

      livingCount++;

      // 1. In-Formation synchronization: Follow harmonic slot coordinates
      if (enemy.state === EnemyState.IN_FORMATION) {
        this.getSlotPosition(enemy.row, enemy.col, this.elapsedTime, this.scratchSlotPos);
        enemy.x = this.scratchSlotPos.x;
        enemy.y = this.scratchSlotPos.y;
        enemy.rotation = 0;
      }

      // 2. Closed-Loop Dynamic Slot Synchronization for Returning & Entering Enemies
      const isOffscreen = enemy.y < 0 || enemy.x < 0 || enemy.x > 224;
      if (
        enemy.state === EnemyState.RETURNING_TO_FORMATION ||
        (enemy.state === EnemyState.ENTERING && !isOffscreen)
      ) {
        this.getSlotPosition(enemy.row, enemy.col, this.elapsedTime, this.scratchSlotPos);
        enemy.returnSlotX = this.scratchSlotPos.x;
        enemy.returnSlotY = this.scratchSlotPos.y;
      }

      // 3. Fast-forward fallback if entry waves were deactivated externally (e.g. unit test fixture)
      if (!this.isEntryWaveActive && enemy.state === EnemyState.ENTERING && enemy.flightPath === null && !enemy.hasStartedPath) {
        this.getSlotPosition(enemy.row, enemy.col, this.elapsedTime, this.scratchSlotPos);
        enemy.x = this.scratchSlotPos.x;
        enemy.y = this.scratchSlotPos.y;
        enemy.state = EnemyState.IN_FORMATION;
        enemy.rotation = 0;
      }

      // Check anomalous kinematics triggers during dive
      const isDiving =
        enemy.state === EnemyState.DIVING_SOLO ||
        enemy.state === EnemyState.DIVING_ESCORT ||
        enemy.state === EnemyState.CAPTURED_HOSTILE;

      if (isDiving && hasKinematicGlitch && !enemy.isChallenging && !(enemy as any).isEpicBoss) {
        enemy.isGlitched = true;
        if (glitchType === 'MIRAGE_CLONES' || isSector) {
          enemy.canSpawnMirageClone = true;
        }
        if (glitchType === 'QUANTUM_TELEPORT' || isSector) {
          if (enemy.diveTimer >= 0.5 && !enemy.isTeleporting && Math.random() < 0.04) {
            enemy.triggerQuantumTeleport();
          }
        }
        if (glitchType === 'KINETIC_INVERSION' || isSector) {
          if (enemy.y >= 100 && enemy.y <= 140 && !enemy.isKineticInverted && Math.random() < 0.06) {
            enemy.triggerKineticInversion();
          }
        }
      }

      // Update enemy internal state
      enemy.update(dt, playerX, playerY);

      // Check if Boss has reached tractor beam altitude during tractor dive
      if (
        enemy.type === EnemyType.BOSS &&
        !(enemy as { isEpicBoss?: boolean }).isEpicBoss &&
        enemy.isTractorDiving &&
        enemy.state === EnemyState.DIVING_SOLO &&
        enemy.flightPath === null &&
        enemy.y >= 95 &&
        enemy.y <= 105
      ) {
        enemy.isTractorDiving = false;
        enemy.state = EnemyState.TRACTOR_BEAM_ACTIVE;
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.rotation = 0;
        this.onTractorBeamRequest?.(enemy);
      }

      // Periodically attempt firing aimed bullet if diving
      if (
        enemy.state === EnemyState.DIVING_SOLO ||
        enemy.state === EnemyState.DIVING_ESCORT ||
        enemy.state === EnemyState.CAPTURED_HOSTILE
      ) {
        if (enemy.y > 60 && enemy.y < 220) {
          enemy.attemptFire(playerX, playerY, this.bulletSpeed);
        }
      }
    }

    // 3.5 Update active phantom decoy clones
    this.phantomPool.forEachActiveSafe((clone) => {
      clone.update(dt);
      if (!clone.active) {
        this.phantomPool.release(clone);
      }
    });

    // 4. Check Stage Clear Trigger
    if (livingCount === 0 && !this.isEntryWaveActive && this.enemies.length > 0) {
      this.onStageClear?.();
    }
  }

  private triggerFormationSniperShot(playerX: number, playerY: number): void {
    const formationEnemies = this.enemies.filter(
      (e) => e.active && e.state === EnemyState.IN_FORMATION && e.canShoot
    );
    if (formationEnemies.length === 0) return;

    let closestEnemy = formationEnemies[0]!;
    let minDiff = Math.abs(closestEnemy.x - playerX);
    for (let i = 1; i < formationEnemies.length; i++) {
      const e = formationEnemies[i]!;
      const diff = Math.abs(e.x - playerX);
      if (diff < minDiff) {
        minDiff = diff;
        closestEnemy = e;
      }
    }

    closestEnemy.attemptFire(playerX, playerY, this.bulletSpeed);
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const enemy of this.enemies) {
      if (enemy.active) {
        enemy.render(ctx);
      }
    }
    this.phantomPool.forEachActive((clone) => {
      clone.render(ctx);
    });
  }

  public spawnMirageClones(x: number, y: number, type: EnemyType = EnemyType.ZAKO): void {
    const clone1 = this.phantomPool.acquire();
    if (clone1) {
      clone1.init(x - 8, y, -45, 120, type);
    }
    const clone2 = this.phantomPool.acquire();
    if (clone2) {
      clone2.init(x + 8, y, 45, 120, type);
    }
  }

  // ==========================================================================
  // 7. Getters & Diagnostics
  // ==========================================================================

  public getLivingCount(): number {
    return this.enemies.filter((e) => e.active && e.state !== EnemyState.EXPLODING).length;
  }

  public getLivingEnemies(): Enemy[] {
    return this.enemies.filter((e) => e.active && e.state !== EnemyState.EXPLODING);
  }

  public getEnemyAt(row: number, col: number): Enemy | null {
    return this.slotToEnemyMap.get(`${row}_${col}`) || null;
  }

  public addEnemy(enemy: Enemy): void {
    if (!this.enemies.includes(enemy)) {
      this.enemies.push(enemy);
    }
  }

  public getEnemyPool(): ObjectPool<Enemy> {
    return this.enemyPool;
  }

  public getPhantomPool(): ObjectPool<PhantomClone> {
    return this.phantomPool;
  }

  public forEachActivePhantom(callback: (clone: PhantomClone) => void): void {
    this.phantomPool.forEachActive(callback);
  }
}
