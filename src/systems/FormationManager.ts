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

export interface FormationManagerConfig {
  onEnemyFire?: (request: EnemyBulletRequest) => void;
  onEnemyDestroyed?: (enemy: Enemy, points: number) => void;
  onStageClear?: () => void;
  onTractorBeamRequest?: (boss: Enemy) => void;
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

  // Callbacks
  public onEnemyFire?: (request: EnemyBulletRequest) => void;
  public onEnemyDestroyed?: (enemy: Enemy, points: number) => void;
  public onStageClear?: () => void;
  public onTractorBeamRequest?: (boss: Enemy) => void;

  constructor(config?: FormationManagerConfig) {
    if (config) {
      this.onEnemyFire = config.onEnemyFire;
      this.onEnemyDestroyed = config.onEnemyDestroyed;
      this.onStageClear = config.onStageClear;
      this.onTractorBeamRequest = config.onTractorBeamRequest;
    }

    this.initializeGridSlots();
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
  public getSlotPosition(row: number, col: number, t: number = this.elapsedTime): Point2D {
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

    return { x, y };
  }

  // ==========================================================================
  // 3. Stage Wave Lifecycle & Spawning
  // ==========================================================================

  public reset(): void {
    this.enemies.length = 0;
    this.slotToEnemyMap.clear();
    this.isEntryWaveActive = false;
    this.currentSubWave = 0;
    this.subWaveTimer = 0;
    this.elapsedTime = 0;
    this.diveTimer = 0;

    for (const slot of this.slots) {
      slot.occupied = false;
      slot.enemyId = null;
    }
  }

  public spawnStage(stage: number = 1): void {
    this.reset();
    this.stage = stage;

    // Difficulty tuning
    this.diveInterval = Math.max(1.8, 3.5 - (stage - 1) * 0.3);
    this.maxConcurrentDivers = Math.min(4, 1 + Math.floor(stage / 2));

    // Create 40 enemy instances
    let nextId = 1;
    for (const slot of this.slots) {
      const enemy = new Enemy({
        id: nextId++,
        type: slot.type,
        row: slot.row,
        col: slot.col,
        x: slot.homeX,
        y: -30,
      });

      enemy.onFireBullet = (req) => this.onEnemyFire?.(req);
      enemy.onExplode = () => {};

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

  // ==========================================================================
  // 4. Sub-Wave Entry Orchestration
  // ==========================================================================

  private updateEntryWaves(dt: number): void {
    if (!this.isEntryWaveActive) return;

    this.subWaveTimer += dt;
    if (this.subWaveTimer >= this.subWaveDelay && this.currentSubWave < 5) {
      this.subWaveTimer = 0;
      this.launchSubWave(this.currentSubWave);
      this.currentSubWave++;

      if (this.currentSubWave >= 5) {
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

      const slotPos = this.getSlotPosition(enemy.row, enemy.col, this.elapsedTime + 2.0);
      const path = FlightPathManager.createEntryPath(waveType, i, slotPos);

      enemy.flightPath = path;
      enemy.pathElapsedMs = -i * 120; // Staggered entry (120ms between wingmen)
      enemy.state = EnemyState.ENTERING;
      enemy.active = true;

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
    if (this.diveTimer < this.diveInterval) {
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
    boss.state = EnemyState.DIVING_SOLO;
    boss.escortCount = 0;
    boss.escortBossId = null;
    boss.escortBoss = null;

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
    const leftSlot = this.getSlotPosition(leftGoei.row, leftGoei.col, this.elapsedTime + 4.0);
    leftGoei.returnSlotX = leftSlot.x;
    leftGoei.returnSlotY = leftSlot.y;

    rightGoei.flightPath = rightPath;
    rightGoei.pathElapsedMs = 0;
    rightGoei.state = EnemyState.DIVING_SOLO;
    rightGoei.escortCount = 0;
    rightGoei.escortBossId = null;
    rightGoei.escortBoss = null;
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

    // 1. Update Sub-Wave Entry Phase
    this.updateEntryWaves(dt);

    // 2. Update Dive Attack Scheduler
    this.updateDiveScheduler(dt, playerX, playerIsDual);

    // 3. Update Individual Enemy Positions & States
    let livingCount = 0;

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;

      livingCount++;

      // If locked in formation, position follows harmonic slot coordinates
      if (enemy.state === EnemyState.IN_FORMATION) {
        const slotPos = this.getSlotPosition(enemy.row, enemy.col, this.elapsedTime);
        enemy.x = slotPos.x;
        enemy.y = slotPos.y;
        enemy.rotation = 0;
      }

      // Update enemy internal state
      enemy.update(dt, playerX, playerY);

      // Check if Boss has reached tractor beam altitude during tractor dive
      if (
        enemy.type === EnemyType.BOSS &&
        enemy.state === EnemyState.DIVING_SOLO &&
        enemy.flightPath === null &&
        enemy.y >= 95 &&
        enemy.y <= 105
      ) {
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
          enemy.attemptFire(playerX, playerY, 180 + this.stage * 15);
        }
      }
    }

    // 4. Check Stage Clear Trigger
    if (livingCount === 0 && !this.isEntryWaveActive && this.enemies.length > 0) {
      this.onStageClear?.();
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const enemy of this.enemies) {
      if (enemy.active) {
        enemy.render(ctx);
      }
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
}
