/**
 * Galaga Arcade Web Game — Core Type Definitions & System Contracts
 * Standardized for Vite 6 / TypeScript 5.7+ strict compilation.
 */

// ============================================================================
// 1. Math & Geometry Types
// ============================================================================

/**
 * 2D vector interface representing coordinates, velocities, and dimensions.
 */
export interface Vector2D {
  x: number;
  y: number;
}

/**
 * Axis-Aligned Bounding Box (AABB) for rectangular collision detection.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Circular bounding area for radial collision detection.
 */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/**
 * 2D size dimensions.
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * 2D point for Bézier curves and path nodes.
 */
export interface Point2D {
  x: number;
  y: number;
}

// ============================================================================
// 2. Viewport & Canvas Resolution
// ============================================================================

/**
 * Internal virtual resolution specification.
 * Standard Galaga arcade resolution: 224 x 288 (3:4 aspect ratio).
 */
export interface VirtualResolution {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
}

/**
 * Transformation parameters computed for letterbox / pillarbox canvas rendering.
 */
export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  virtualWidth: number;
  virtualHeight: number;
}

// ============================================================================
// 3. Game State Machine Types
// ============================================================================

/**
 * High-level discrete states of the Galaga game loop.
 */
export type GameState =
  | 'BOOT'
  | 'TITLE'
  | 'STAGE_INTRO'
  | 'PLAYING'
  | 'CHALLENGING_STAGE'
  | 'STAGE_CLEAR'
  | 'PLAYER_CAPTURED'
  | 'PLAYER_RESCUED'
  | 'GAME_OVER'
  | 'PAUSED';

/**
 * Active game play modes.
 */
export type GameMode = 'SINGLE_PLAYER' | 'DEMO' | 'CHALLENGING_BONUS';

// ============================================================================
// 4. Player Types & States
// ============================================================================

/**
 * Discrete operational states for the player fighter craft.
 */
export type PlayerState =
  | 'ALIVE'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'DUAL'
  | 'DESTROYED'
  | 'RESPAWNING'
  | 'DOCKING';

/**
 * Configuration and state representation for the player.
 */
export interface PlayerData {
  position: Vector2D;
  velocity: Vector2D;
  state: PlayerState;
  lives: number;
  isDual: boolean;
  canFire: boolean;
  respawnTimerMs: number;
  score: number;
}

// ============================================================================
// 5. Enemy Types, Hierarchy & Formation
// ============================================================================

/**
 * 50-round difficulty tier classifications.
 */
export type StageTier = 'CLASSIC' | 'ELITE' | 'DREADNOUGHT';

/**
 * Result returned from applying damage to an enemy unit.
 */
export interface EnemyDamageResult {
  destroyed: boolean;
  points: number;
  wasDamaged: boolean;
  shieldAbsorbed?: boolean;
  remainingShield?: number;
  remainingHealth?: number;
}

/**
 * Categorical alien enemy types matching original arcade specifications.
 */
export enum EnemyType {
  ZAKO = 'ZAKO',                        // Blue Bug (Bottom 2 rows, 50/100 pts)
  GOEI = 'GOEI',                        // Red Butterfly (Middle 2 rows, 80/160 pts)
  BOSS = 'BOSS',                        // Green/Blue Galaga Commander (Top row, 150/400/800/1600 pts)
  TRANSFORM = 'TRANSFORM',              // Stage 4+ morphed bonus enemies
  CAPTURED_FIGHTER = 'CAPTURED_FIGHTER' // Hostile red player fighter under Boss command
}

/**
 * Behavioral state machine for individual enemy units.
 */
export enum EnemyState {
  IN_FORMATION = 'IN_FORMATION',
  ENTERING = 'ENTERING',
  DIVING_SOLO = 'DIVING_SOLO',
  DIVING_ESCORT = 'DIVING_ESCORT',
  TRACTOR_BEAM_ACTIVE = 'TRACTOR_BEAM_ACTIVE',
  RETURNING_TO_FORMATION = 'RETURNING_TO_FORMATION',
  EXPLODING = 'EXPLODING',
  CAPTURED_HOSTILE = 'CAPTURED_HOSTILE',
  INACTIVE = 'INACTIVE'
}

/**
 * Individual enemy formation grid slot definition.
 */
export interface FormationSlot {
  readonly row: number;
  readonly col: number;
  readonly type: EnemyType;
  homeX: number;
  homeY: number;
  occupied: boolean;
  enemyId: string | null;
}

/**
 * State parameters for the formation breathing / oscillating motion.
 */
export interface FormationBreathingState {
  offsetX: number;
  expansionFactor: number;
  cycleTimeMs: number;
  isExpanding: boolean;
}

// ============================================================================
// 6. Bézier Flight Curves & Paths
// ============================================================================

/**
 * Cubic Bézier curve definition comprising four control points.
 */
export interface CubicBezier {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
}

/**
 * Individual trajectory segment along a composite flight path.
 */
export interface FlightPathSegment {
  bezier: CubicBezier;
  durationMs: number;
  speed: number;
  rotationOffsetRad?: number;
}

/**
 * Composite flight trajectory comprising multiple connected Bézier curves.
 */
export interface FlightPathData {
  id: string;
  name: string;
  segments: FlightPathSegment[];
  loop: boolean;
}

// ============================================================================
// 7. Projectiles & Weapons
// ============================================================================

/**
 * Identifies projectile ownership for collision filtering.
 */
export type BulletOwner = 'PLAYER' | 'ENEMY' | 'DRONE';

/**
 * Projectile type classifier.
 */
export type BulletType = 'PLAYER_MISSILE' | 'ENEMY_RED_BULLET' | 'ENEMY_FAST_BEAM';

/**
 * Active projectile state.
 */
export interface BulletData {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  owner: BulletOwner;
  type: BulletType;
  active: boolean;
  width: number;
  height: number;
}

// ============================================================================
// 8. Tractor Beam Mechanics
// ============================================================================

/**
 * Tractor beam operational phase.
 */
export type TractorBeamState =
  | 'INACTIVE'
  | 'EMITTING'
  | 'CAPTURING'
  | 'HOLDING'
  | 'RETRACTING';

/**
 * Tractor beam geometry and capture cone configuration.
 */
export interface TractorBeamConfig {
  origin: Vector2D;
  topWidth: number;
  bottomWidth: number;
  length: number;
  state: TractorBeamState;
  emissionTimerMs: number;
  capturedPlayerId: string | null;
}

// ============================================================================
// 9. Input System
// ============================================================================

/**
 * Unified input snapshot consumed by player and UI systems per frame.
 */
export interface InputState {
  moveLeft: boolean;
  moveRight: boolean;
  fire: boolean;
  pause: boolean;
  restart: boolean;
  pointerX: number | null;
  pointerActive: boolean;
  touchLeft: boolean;
  touchRight: boolean;
  touchFire: boolean;
}

/**
 * Touch virtual control button bounds for responsive mobile gameplay.
 */
export interface VirtualTouchControls {
  leftButton: Rect;
  rightButton: Rect;
  fireButton: Rect;
}

// ============================================================================
// 10. Starfield & Particle Systems
// ============================================================================

/**
 * Background star representation in the 3-layer parallax simulation.
 */
export interface Star {
  x: number;
  y: number;
  speed: number;
  layer: number;
  color: string;
  brightness: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

/**
 * Explosion spark and debris particle.
 */
export interface Particle {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

// ============================================================================
// 11. Audio Engine & SFX Events
// ============================================================================

/**
 * Discrete sound effect and jingle trigger events.
 */
export type AudioEventType =
  | 'LASER_FIRE'
  | 'ENEMY_DIVE'
  | 'ENEMY_EXPLOSION_SMALL'
  | 'ENEMY_EXPLOSION_LARGE'
  | 'BOSS_HIT'
  | 'BOSS_DESTROYED'
  | 'PLAYER_EXPLOSION'
  | 'TRACTOR_BEAM'
  | 'STAGE_START_FANFARE'
  | 'CHALLENGING_STAGE_START'
  | 'CHALLENGING_STAGE_PERFECT'
  | 'DOCKING_CHIME'
  | 'GAME_OVER_FANFARE'
  | 'EXTRA_LIFE'
  | 'HEAVY_LASER_BLAST'
  | 'SPIRAL_RING_WHOOSH'
  | 'DIMENSIONAL_TEAR_HUM'
  | 'BLACK_HOLE_SUCTION_RUMBLE'
  | 'NANITE_SPLIT_SHIMMER'
  | 'GRAY_GOO_DISSOLVE_HISS'
  | 'PHANTOM_DIVE_WARBLE'
  | 'TELEKINETIC_STUN_SCREECH'
  | 'ORBITAL_SHIELD_HUM'
  | 'DARK_MATTER_BEAM_CHARGE'
  | 'DARK_MATTER_BEAM_ROAR'
  | 'ENRAGE_SIREN'
  | 'CRISIS_KLAXON'
  | 'DIGITAL_GLITCH'
  | 'LIGHTNING_CRACKLE'
  | 'DARK_MATTER_IGNITION'
  | 'ESCORT_PLASMA_BOLT'
  | 'SHIELD_REPAIR_CHIME'
  | 'POINT_DEFENSE_PING'
  | 'BOMBER_ENGINE_SWEEP'
  | 'CLUSTER_BOMB_THUD'
  | 'NOVA_LOCK_CHIME'
  | 'NOVA_MISSILE_SWOOSH'
  | 'CHRONO_FREEZE_DROP'
  | 'CLOCK_FREEZE_TICK'
  | 'WARP_RAM_SONIC_BOOM'
  | 'CHRONO_FIELD_ACTIVATE'
  | 'REFLECTION_DEFLECT'
  | 'EMP_BULLET_ABSORB'
  | 'PHASE_DRIVE_BLINK'
  | 'PLASMA_BEAM_PULSE';

/**
 * Audio playback options.
 */
export interface SoundOptions {
  volume?: number;
  pitch?: number;
  loop?: boolean;
}

// ============================================================================
// 12. Scoring, HUD & Persistence
// ============================================================================

/**
 * Persistent high score and game stats record.
 */
export interface ScoreRecord {
  score: number;
  highScore: number;
  stage: number;
  lives: number;
  shotsFired: number;
  hits: number;
}

/**
 * HUD display data bundle.
 */
export interface HUDState {
  score: number;
  highScore: number;
  lives: number;
  stage: number;
  stageBadges: number[];
}

// ============================================================================
// 13. Object Pooling Contracts
// ============================================================================

/**
 * Common contract for poolable, zero-allocation game entities.
 */
export interface Poolable {
  active: boolean;
  reset(): void;
}

// ============================================================================
// 14. Core Engine Lifecycle Contracts
// ============================================================================

/**
 * Master game engine coordinator contract.
 */
export interface IGameEngine {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  update(deltaTimeMs: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

// ============================================================================
// 15. QA & Automated Bot Cheat Contracts
// ============================================================================

/**
 * Global QA Cheat Controller contract for automated testing, Playwright bots, and debugging.
 */
export interface IGalagaCheatController {
  skipToStage(stage: number): boolean;
  triggerCrisis(crisisId?: string): boolean;
  spawnBoss(bossType?: string | number): boolean;
  triggerSpecialMove(specialId?: string): boolean;
  setInvincible(invincible: boolean): void;
  unlockDrone(droneType: string): boolean;
  fillEnergy(amount?: number): void;
  killAllEnemies(): number;
  setScore(score: number): void;
  addLives(count: number): number;
  setDDAProficiency(proficiency: number | null): boolean;
  getDDAMetrics(): any;
  resetDDA(): void;
  triggerGlitch(type?: string): boolean;
  clearGlitch(): void;
  spawnPowerUp(powerUpType: string, x?: number, y?: number): boolean;
  applyPowerUp(powerUpType: string): boolean;
  getGameState(): {
    stage: number;
    score: number;
    lives: number;
    state: string;
    energy: number;
    activeEnemies: number;
    isInvincible: boolean;
    dda?: {
      skillIndex: number;
      diveSpeedMultiplier: number;
      bulletDensityMultiplier: number;
      bossHealthMultiplier: number;
      powerUpPityBonus: number;
    };
    glitch?: {
      active: boolean;
      state: string;
      type: string | null;
      isGlitchSector: boolean;
      timer: number;
    };
    powerups?: {
      activeBuffs: any;
      activeItemCount: number;
    };
  };
  getActiveBoss?(): any;
  getActiveCrisis?(): any;
  getGame?(): any;
}

declare global {
  interface Window {
    __GALAGA_CHEAT__?: IGalagaCheatController;
  }
}

