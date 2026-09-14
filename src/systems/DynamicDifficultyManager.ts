/**
 * Galaga Arcade Web Game — Dynamic Difficulty Adjustment (DDA) Engine
 * Location: src/systems/DynamicDifficultyManager.ts
 *
 * Real-time telemetry monitoring player proficiency with zero runtime GC allocations:
 * - 30-bucket TypedArray circular ring buffer (Uint32Array for shots/hits/damage/score, capacity 4.29B/sec)
 *   with O(1) constant-time running accumulators.
 * - Continuous Skill Index formula (sigma in [0.0, 1.0]) combining:
 *   1. Rolling accuracy (with Bayesian damping for small samples < 10 shots).
 *   2. Survival factor (time elapsed since damage, recent damage frequency, life preservation).
 *   3. Stage clear speed ratio (benchmark: 30s normal, 60s boss, 15s challenging).
 *   4. Score velocity (points/second normalized to 250 pts/s).
 * - Asymmetric EMA smoothing filter: fast downward relief (tau = 0.8s) when taking damage/struggling,
 *   gradual upward ramp (tau = 3.0s) when dominating. Default neutral sigma = 0.50.
 * - 4 Dynamic Tuning Actuators:
 *   1. diveSpeedMultiplier: 0.85 + 0.50 * sigma in [0.85x, 1.35x].
 *   2. bulletDensityMultiplier: 0.80 + 0.60 * sigma in [0.80x, 1.40x].
 *   3. bossHealthMultiplier: Piecewise curve ensuring exact 1.000x at neutral sigma = 0.50
 *      (sigma < 0.5 ? 0.90 + sigma * 0.20 : 1.00 + (sigma - 0.5) * 0.50) in [0.90x, 1.25x].
 *   4. powerUpPityBonus: Dynamic pity bonus up to +0.25 based on low lives and damage frequency.
 * - Cheat / Deterministic QA override: setProficiencyOverride(val | null).
 * - Zero GC allocation guarantee during 60 FPS update ticks.
 */

import { DifficultyCalculator } from './DifficultyCalculator';

export interface DDAActuators {
  diveSpeedMultiplier: number;
  bulletDensityMultiplier: number;
  bossHealthMultiplier: number;
  powerUpPityBonus: number;
  skillIndex: number;
}

export interface DDATelemetryMetrics {
  rollingAccuracy: number;
  survivalFactor: number;
  clearSpeedRatio: number;
  scoreVelocity: number;
  rawSkillIndex: number;
  smoothedSkillIndex: number;
  effectiveSkillIndex: number;
  secondsSinceLastDamage: number;
  stageElapsedTime: number;
  currentLives: number;
  rollingShots: number;
  rollingHits: number;
  rollingDamage: number;
  rollingScore: number;
}

export class DynamicDifficultyManager {
  public static readonly WINDOW_SECONDS = 30;
  public static readonly TAU_DOWN = 0.8; // Seconds (fast downward relief)
  public static readonly TAU_UP = 3.0;   // Seconds (gradual upward challenge)

  // Zero-allocation pre-allocated circular ring buffers (30 1-second buckets, Uint32Array up to 4.29B/sec)
  private readonly shotsBuffer = new Uint32Array(DynamicDifficultyManager.WINDOW_SECONDS);
  private readonly hitsBuffer = new Uint32Array(DynamicDifficultyManager.WINDOW_SECONDS);
  private readonly damageBuffer = new Uint32Array(DynamicDifficultyManager.WINDOW_SECONDS);
  private readonly scoreBuffer = new Uint32Array(DynamicDifficultyManager.WINDOW_SECONDS);

  // O(1) Running Sums across the 30-second window
  private rollingShots: number = 0;
  private rollingHits: number = 0;
  private rollingDamage: number = 0;
  private rollingScore: number = 0;

  // Window Timing & Index
  private currentBucketIndex: number = 0;
  private bucketTimer: number = 0;
  private totalElapsedTime: number = 0;

  // Real-Time Combat & Stage Telemetry
  private secondsSinceLastDamage: number = 30.0;
  private stageElapsedTime: number = 0.0;
  private currentStage: number = 1;
  private currentLives: number = 3;
  private lastRecordedScore: number = 0;
  private historicalClearSpeedRatio: number = 1.0; // Benchmark on-target = 1.0

  // Cumulative Lifetime Telemetry
  private cumulativeShots: number = 0;
  private cumulativeHits: number = 0;
  private totalDamageEvents: number = 0;
  private totalLifeLosses: number = 0;

  // Skill Index Computation State
  private rawSkillIndex: number = 0.50;
  private smoothedSkillIndex: number = 0.50;
  private proficiencyOverride: number | null = null;

  // Pre-allocated in-place returned structures (Zero GC)
  private readonly actuators: DDAActuators = {
    diveSpeedMultiplier: 1.10,
    bulletDensityMultiplier: 1.10,
    bossHealthMultiplier: 1.00,
    powerUpPityBonus: 0.0,
    skillIndex: 0.50,
  };

  private readonly metricsSnapshot: DDATelemetryMetrics = {
    rollingAccuracy: 0.50,
    survivalFactor: 1.00,
    clearSpeedRatio: 0.50,
    scoreVelocity: 0.00,
    rawSkillIndex: 0.50,
    smoothedSkillIndex: 0.50,
    effectiveSkillIndex: 0.50,
    secondsSinceLastDamage: 30.0,
    stageElapsedTime: 0.0,
    currentLives: 3,
    rollingShots: 0,
    rollingHits: 0,
    rollingDamage: 0,
    rollingScore: 0,
  };

  constructor() {
    this.reset();
  }

  /**
   * Resets all internal buffers, running sums, and metrics to neutral initial state.
   */
  public reset(): void {
    this.shotsBuffer.fill(0);
    this.hitsBuffer.fill(0);
    this.damageBuffer.fill(0);
    this.scoreBuffer.fill(0);

    this.rollingShots = 0;
    this.rollingHits = 0;
    this.rollingDamage = 0;
    this.rollingScore = 0;

    this.currentBucketIndex = 0;
    this.bucketTimer = 0;
    this.totalElapsedTime = 0;

    this.secondsSinceLastDamage = 30.0;
    this.stageElapsedTime = 0.0;
    this.currentStage = 1;
    this.currentLives = 3;
    this.lastRecordedScore = 0;
    this.historicalClearSpeedRatio = 1.0;

    this.cumulativeShots = 0;
    this.cumulativeHits = 0;
    this.totalDamageEvents = 0;
    this.totalLifeLosses = 0;

    this.rawSkillIndex = 0.50;
    this.smoothedSkillIndex = 0.50;
    this.proficiencyOverride = null;

    this.updateActuators();
  }

  // ==========================================================================
  // Event Recording Hooks (Called by Game & Subsystems)
  // ==========================================================================

  /**
   * Records player missile discharge.
   */
  public recordShotFired(count: number = 1): void {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return;
    const intCount = Math.floor(count);
    if (intCount <= 0) return;
    const currentVal = this.shotsBuffer[this.currentBucketIndex]!;
    const safeCount = Math.min(intCount, 0xFFFFFFFF - currentVal);
    if (safeCount <= 0) return;
    this.shotsBuffer[this.currentBucketIndex] = currentVal + safeCount;
    this.rollingShots += safeCount;
    this.cumulativeShots += safeCount;
  }

  /**
   * Records player missile impact on any enemy craft or boss target.
   */
  public recordShotHit(count: number = 1): void {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return;
    const intCount = Math.floor(count);
    if (intCount <= 0) return;
    const currentVal = this.hitsBuffer[this.currentBucketIndex]!;
    const safeCount = Math.min(intCount, 0xFFFFFFFF - currentVal);
    if (safeCount <= 0) return;
    this.hitsBuffer[this.currentBucketIndex] = currentVal + safeCount;
    this.rollingHits += safeCount;
    this.cumulativeHits += safeCount;
  }

  /**
   * Records player sustaining damage (shield absorption, partial hull loss, or fatal destruction).
   */
  public recordPlayerDamage(isFatalOrCount: boolean | number = false, count: number = 1): void {
    let isFatal = false;
    let damageCount = 1;

    if (typeof isFatalOrCount === 'boolean') {
      isFatal = isFatalOrCount;
      if (typeof count === 'number') {
        if (!Number.isFinite(count) || count <= 0) return;
        damageCount = Math.floor(count);
      }
    } else if (typeof isFatalOrCount === 'number') {
      if (!Number.isFinite(isFatalOrCount) || isFatalOrCount <= 0) return;
      damageCount = Math.floor(isFatalOrCount);
    } else {
      return;
    }

    if (damageCount <= 0) return;

    const currentVal = this.damageBuffer[this.currentBucketIndex]!;
    const safeCount = Math.min(damageCount, 0xFFFFFFFF - currentVal);
    if (safeCount <= 0) return;

    this.damageBuffer[this.currentBucketIndex] = currentVal + safeCount;
    this.rollingDamage += safeCount;
    this.secondsSinceLastDamage = 0.0;
    this.totalDamageEvents += safeCount;
    if (isFatal) {
      this.totalLifeLosses += 1;
    }
  }

  /**
   * Records score increment into the rolling score buffer.
   */
  public recordScoreGain(points: number): void {
    if (typeof points !== 'number' || !Number.isFinite(points) || points <= 0) return;
    const intPoints = Math.floor(points);
    if (intPoints <= 0) return;
    const currentVal = this.scoreBuffer[this.currentBucketIndex]!;
    const safePoints = Math.min(intPoints, 0xFFFFFFFF - currentVal);
    if (safePoints <= 0) return;
    this.scoreBuffer[this.currentBucketIndex] = currentVal + safePoints;
    this.rollingScore += safePoints;
  }

  /**
   * Alias for recordScoreGain.
   */
  public recordScore(points: number): void {
    this.recordScoreGain(points);
  }

  /**
   * Hook called when a new combat stage starts.
   */
  public onStageStart(stage: number): void {
    this.currentStage = stage;
    this.stageElapsedTime = 0.0;
  }

  /**
   * Hook called when all enemies in the current stage are eliminated.
   */
  public onStageClear(stage: number, stageClearDuration?: number): void {
    const elapsed = typeof stageClearDuration === 'number' && Number.isFinite(stageClearDuration)
      ? stageClearDuration
      : this.stageElapsedTime;
    const isBoss = DifficultyCalculator.isBossStage(stage);
    const isChallenging = DifficultyCalculator.isChallengingStage(stage);
    const expectedTime = isBoss ? 60.0 : isChallenging ? 15.0 : 30.0;
    const actualTime = Math.max(5.0, elapsed);
    const stageRatio = expectedTime / actualTime;

    // Exponentially smooth historical stage clear speed
    if (Number.isFinite(stageRatio)) {
      this.historicalClearSpeedRatio = 0.70 * stageRatio + 0.30 * this.historicalClearSpeedRatio;
    }
  }

  // ==========================================================================
  // Zero-Allocation 60 FPS Update Loop
  // ==========================================================================

  /**
   * Main per-frame update tick.
   * Performs bucket advancement, metric computation, asymmetric EMA smoothing, and actuator evaluation.
   * Guaranteed ZERO runtime allocations per call.
   */
  public update(dt: number, playerLives: number = 3, currentScore: number = 0): void {
    // Defensive guard: reject non-finite, zero, and negative dt
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;

    this.totalElapsedTime += dt;
    this.stageElapsedTime += dt;
    this.secondsSinceLastDamage += dt;

    if (typeof playerLives === 'number' && Number.isFinite(playerLives)) {
      this.currentLives = Math.max(0, Math.floor(playerLives));
    }

    // Track score delta defensively
    if (typeof currentScore === 'number' && Number.isFinite(currentScore)) {
      if (currentScore > this.lastRecordedScore) {
        this.recordScoreGain(currentScore - this.lastRecordedScore);
        this.lastRecordedScore = currentScore;
      } else if (currentScore < this.lastRecordedScore) {
        // Score reset externally
        this.lastRecordedScore = currentScore;
      }
    }

    // 1. Advance 1-second circular ring buffer buckets
    this.bucketTimer += dt;
    if (this.bucketTimer >= DynamicDifficultyManager.WINDOW_SECONDS) {
      // Complete window expired (> 30s elapsed in a single step)
      this.shotsBuffer.fill(0);
      this.hitsBuffer.fill(0);
      this.damageBuffer.fill(0);
      this.scoreBuffer.fill(0);
      this.rollingShots = 0;
      this.rollingHits = 0;
      this.rollingDamage = 0;
      this.rollingScore = 0;
      this.bucketTimer = this.bucketTimer % 1.0;
      this.currentBucketIndex = 0;
    } else {
      while (this.bucketTimer >= 1.0) {
        this.bucketTimer -= 1.0;
        this.currentBucketIndex = (this.currentBucketIndex + 1) % DynamicDifficultyManager.WINDOW_SECONDS;

        // Expire old bucket from running accumulators
        this.rollingShots -= this.shotsBuffer[this.currentBucketIndex]!;
        this.rollingHits -= this.hitsBuffer[this.currentBucketIndex]!;
        this.rollingDamage -= this.damageBuffer[this.currentBucketIndex]!;
        this.rollingScore -= this.scoreBuffer[this.currentBucketIndex]!;

        // Guard against underflow
        if (this.rollingShots < 0) this.rollingShots = 0;
        if (this.rollingHits < 0) this.rollingHits = 0;
        if (this.rollingDamage < 0) this.rollingDamage = 0;
        if (this.rollingScore < 0) this.rollingScore = 0;

        // Clear the current bucket for the new second
        this.shotsBuffer[this.currentBucketIndex] = 0;
        this.hitsBuffer[this.currentBucketIndex] = 0;
        this.damageBuffer[this.currentBucketIndex] = 0;
        this.scoreBuffer[this.currentBucketIndex] = 0;
      }
    }

    // 2. Telemetry Component 1: Rolling Accuracy (w1 = 0.35)
    // Bayesian damping for small samples (< 10 shots)
    let rollingAccuracy: number;
    if (this.rollingShots >= 10) {
      rollingAccuracy = Math.min(1.0, this.rollingHits / this.rollingShots);
    } else {
      const sampleWeight = this.rollingShots / 10.0;
      const rawRatio = this.rollingShots > 0 ? this.rollingHits / this.rollingShots : 0.50;
      rollingAccuracy = sampleWeight * rawRatio + (1.0 - sampleWeight) * 0.50;
    }
    rollingAccuracy = Math.max(0.0, Math.min(1.0, rollingAccuracy));

    // 3. Telemetry Component 2: Survival Factor (w2 = 0.25)
    const timeFactor = Math.min(1.0, this.secondsSinceLastDamage / 30.0);
    const lifeFactor = Math.max(0.0, Math.min(1.0, this.currentLives / 3.0));
    const damagePenalty = Math.min(1.0, this.rollingDamage * 0.35);
    const survivalFactor = Math.max(
      0.0,
      Math.min(1.0, 0.50 * timeFactor + 0.50 * lifeFactor - 0.35 * damagePenalty)
    );

    // 4. Telemetry Component 3: Stage Clear Speed Ratio (w3 = 0.25)
    const isBoss = DifficultyCalculator.isBossStage(this.currentStage);
    const isChallenging = DifficultyCalculator.isChallengingStage(this.currentStage);
    const expectedTime = isBoss ? 60.0 : isChallenging ? 15.0 : 30.0;
    let effectiveRatio = this.historicalClearSpeedRatio;
    if (this.stageElapsedTime > expectedTime) {
      effectiveRatio = Math.min(effectiveRatio, expectedTime / this.stageElapsedTime);
    }
    // Benchmark 1.0x maps to 0.50; 0.50x maps to 0.0; 1.50x maps to 1.0
    const clearSpeedRatio = Math.max(0.0, Math.min(1.0, (effectiveRatio - 0.50) / 1.00));

    // 5. Telemetry Component 4: Score Velocity (w4 = 0.15)
    // Points per second normalized to 250 pts/s
    const scoreVelocityRaw = this.rollingScore / DynamicDifficultyManager.WINDOW_SECONDS;
    const scoreVelocityNormalized = Math.max(0.0, Math.min(1.0, scoreVelocityRaw / 250.0));

    // 6. Compute Raw Skill Index (sigma in [0.0, 1.0])
    this.rawSkillIndex =
      0.35 * rollingAccuracy +
      0.25 * survivalFactor +
      0.25 * clearSpeedRatio +
      0.15 * scoreVelocityNormalized;
    this.rawSkillIndex = Math.max(0.0, Math.min(1.0, this.rawSkillIndex));

    // 7. Asymmetric EMA Smoothing Filter
    if (this.proficiencyOverride !== null) {
      this.smoothedSkillIndex = this.proficiencyOverride;
    } else {
      const diff = this.rawSkillIndex - this.smoothedSkillIndex;
      if (diff < 0) {
        // Fast downward relief (tau = 0.8s) when struggling/taking damage
        const alpha = 1.0 - Math.exp(-dt / DynamicDifficultyManager.TAU_DOWN);
        this.smoothedSkillIndex += diff * alpha;
      } else if (diff > 0) {
        // Gradual upward ramp (tau = 3.0s) when dominating
        const alpha = 1.0 - Math.exp(-dt / DynamicDifficultyManager.TAU_UP);
        this.smoothedSkillIndex += diff * alpha;
      }
    }
    this.smoothedSkillIndex = Math.max(0.0, Math.min(1.0, this.smoothedSkillIndex));

    // 8. Update Pre-Allocated Actuators and Metrics Snapshot
    this.updateActuators();

    this.metricsSnapshot.rollingAccuracy = rollingAccuracy;
    this.metricsSnapshot.survivalFactor = survivalFactor;
    this.metricsSnapshot.clearSpeedRatio = clearSpeedRatio;
    this.metricsSnapshot.scoreVelocity = scoreVelocityRaw;
    this.metricsSnapshot.rawSkillIndex = this.rawSkillIndex;
    this.metricsSnapshot.smoothedSkillIndex = this.smoothedSkillIndex;
    this.metricsSnapshot.effectiveSkillIndex = this.getSkillIndex();
    this.metricsSnapshot.secondsSinceLastDamage = this.secondsSinceLastDamage;
    this.metricsSnapshot.stageElapsedTime = this.stageElapsedTime;
    this.metricsSnapshot.currentLives = this.currentLives;
    this.metricsSnapshot.rollingShots = this.rollingShots;
    this.metricsSnapshot.rollingHits = this.rollingHits;
    this.metricsSnapshot.rollingDamage = this.rollingDamage;
    this.metricsSnapshot.rollingScore = this.rollingScore;
  }

  // ==========================================================================
  // Actuators & Multipliers Evaluation
  // ==========================================================================

  private updateActuators(): void {
    let s = this.getSkillIndex();
    if (!Number.isFinite(s)) {
      s = 0.50;
    }
    s = Math.max(0.0, Math.min(1.0, s));

    // 1. Dive Speed Multiplier: 0.85 + 0.50 * sigma in [0.85x, 1.35x]
    const diveMult = 0.85 + 0.50 * s;
    const roundedDive = Math.round(diveMult * 1000) / 1000;
    this.actuators.diveSpeedMultiplier = Number.isFinite(roundedDive)
      ? Math.max(0.85, Math.min(1.35, roundedDive))
      : 1.10;

    // 2. Bullet Density Multiplier: 0.80 + 0.60 * sigma in [0.80x, 1.40x]
    const bulletMult = 0.80 + 0.60 * s;
    const roundedBullet = Math.round(bulletMult * 1000) / 1000;
    this.actuators.bulletDensityMultiplier = Number.isFinite(roundedBullet)
      ? Math.max(0.80, Math.min(1.40, roundedBullet))
      : 1.10;

    // 3. Boss Health Multiplier: Piecewise curve ensuring exact 1.000x at neutral sigma = 0.50
    //    sigma < 0.5 ? 0.90 + sigma * 0.20 : 1.00 + (sigma - 0.5) * 0.50 in [0.90x, 1.25x]
    let bossHpMult: number;
    if (s < 0.50) {
      bossHpMult = 0.90 + s * 0.20;
    } else {
      bossHpMult = 1.00 + (s - 0.50) * 0.50;
    }
    const roundedBoss = Math.round(bossHpMult * 1000) / 1000;
    this.actuators.bossHealthMultiplier = Number.isFinite(roundedBoss)
      ? Math.max(0.90, Math.min(1.25, roundedBoss))
      : 1.00;

    // 4. Power-Up Pity Bonus: up to +0.25 based on low lives and damage frequency
    let pity = 0.0;
    const safeLives = Number.isFinite(this.currentLives) ? this.currentLives : 3;
    const safeSecDamage = Number.isFinite(this.secondsSinceLastDamage) ? this.secondsSinceLastDamage : 30.0;

    if (safeLives <= 1) {
      pity += 0.12;
    }
    if (safeSecDamage < 10.0) {
      pity += 0.08;
    }
    if (s < 0.30) {
      pity += 0.05;
    }
    const roundedPity = Math.round(pity * 100) / 100;
    this.actuators.powerUpPityBonus = Number.isFinite(roundedPity)
      ? Math.max(0.00, Math.min(0.25, roundedPity))
      : 0.00;

    this.actuators.skillIndex = Math.round(s * 1000) / 1000;
  }

  // ==========================================================================
  // Public Accessors & Diagnostic Getters
  // ==========================================================================

  /**
   * Returns current effective Skill Index (sigma in [0.0, 1.0]).
   */
  public getSkillIndex(): number {
    const raw = this.proficiencyOverride !== null ? this.proficiencyOverride : this.smoothedSkillIndex;
    return (typeof raw === 'number' && Number.isFinite(raw))
      ? Math.max(0.0, Math.min(1.0, raw))
      : 0.50;
  }

  /**
   * Returns Dive Speed Multiplier in [0.85x, 1.35x].
   */
  public getDiveSpeedMultiplier(): number {
    return this.actuators.diveSpeedMultiplier;
  }

  /**
   * Returns Bullet Density Multiplier in [0.80x, 1.40x].
   */
  public getBulletDensityMultiplier(): number {
    return this.actuators.bulletDensityMultiplier;
  }

  /**
   * Returns Boss Health Multiplier in [0.90x, 1.25x] (strictly 1.000x at neutral sigma = 0.50).
   */
  public getBossHealthMultiplier(): number {
    return this.actuators.bossHealthMultiplier;
  }

  /**
   * Returns Power-Up Pity Bonus in [0.00, 0.25].
   */
  public getPowerUpPityBonus(): number {
    return this.actuators.powerUpPityBonus;
  }

  /**
   * Returns Pity Drop Multiplier for callers expecting a multiplier factor.
   */
  public getPityDropMultiplier(): number {
    return 1.0 + this.getPowerUpPityBonus() * 2.0;
  }

  /**
   * Returns pre-allocated actuators state (zero GC).
   */
  public getActuators(): Readonly<DDAActuators> {
    return this.actuators;
  }

  /**
   * Returns pre-allocated telemetry metrics snapshot (zero GC).
   */
  public getMetrics(): Readonly<DDATelemetryMetrics> {
    this.metricsSnapshot.rollingShots = this.rollingShots;
    this.metricsSnapshot.rollingHits = this.rollingHits;
    this.metricsSnapshot.rollingDamage = this.rollingDamage;
    this.metricsSnapshot.rollingScore = this.rollingScore;
    this.metricsSnapshot.secondsSinceLastDamage = this.secondsSinceLastDamage;
    this.metricsSnapshot.stageElapsedTime = this.stageElapsedTime;
    this.metricsSnapshot.currentLives = this.currentLives;
    this.metricsSnapshot.effectiveSkillIndex = this.getSkillIndex();
    return this.metricsSnapshot;
  }

  // ==========================================================================
  // Cheat & Deterministic Override Controls
  // ==========================================================================

  /**
   * Overrides or freezes the Skill Index to a fixed value in [0.0, 1.0], or null to restore dynamic calculation.
   */
  public setProficiencyOverride(proficiency: number | null): void {
    if (proficiency === null) {
      this.proficiencyOverride = null;
    } else if (typeof proficiency === 'number' && Number.isFinite(proficiency)) {
      this.proficiencyOverride = Math.max(0.0, Math.min(1.0, proficiency));
      this.smoothedSkillIndex = this.proficiencyOverride;
    } else {
      return; // Discard NaN, Infinity, -Infinity, non-number inputs without corrupting state
    }
    this.updateActuators();
  }

  /**
   * Alias for setProficiencyOverride.
   */
  public setCheatSkillIndex(skillIndex: number | null): void {
    this.setProficiencyOverride(skillIndex);
  }
}
