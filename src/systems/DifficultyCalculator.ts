/**
 * Galaga Arcade Web Game — Deterministic 50-Round Scaling Engine
 * 
 * Computes non-linear mathematical difficulty curves across 50 stages:
 * 1. Stage Tiers: CLASSIC (1–10), ELITE (11–25), DREADNOUGHT (26–50)
 * 2. Monotonic Dive Speed Multiplier: 1.000x -> 1.800x
 * 3. Exponential Dive Interval: 3.50s -> 0.80s
 * 4. Paced Concurrent Divers: 1 -> 6
 * 5. Clamped Bullet Velocity: 180 px/s -> 320 px/s
 * 6. Tiered Enemy HP & Kinetic Shields
 * 7. 12 Challenging Stages Scheduling & Perfection Bonus Matrix
 */

import { EnemyType, type StageTier } from '../types';

export { type StageTier };

export interface EnemyHealthAndShield {
  readonly health: number;
  readonly shield: number;
}

export interface StageDifficultyConfig {
  readonly stage: number;
  readonly tier: StageTier;
  readonly diveSpeedMultiplier: number;
  readonly diveInterval: number;
  readonly maxConcurrentDivers: number;
  readonly enemyBulletSpeed: number;
  readonly shotsPerDive: number;
  readonly formationFireInterval: number;
  readonly isChallengingStage: boolean;
}

export class DifficultyCalculator {
  // Constants
  public static readonly MIN_STAGE = 1;
  public static readonly MAX_STAGE = 50;
  public static readonly MIN_BULLET_SPEED = 180; // px/s
  public static readonly MAX_BULLET_SPEED = 320; // px/s
  public static readonly MIN_DIVE_SPEED_MULT = 1.0;
  public static readonly MAX_DIVE_SPEED_MULT = 1.8;
  public static readonly MAX_DIVE_INTERVAL = 3.5; // seconds
  public static readonly MIN_DIVE_INTERVAL = 0.8; // seconds

  // M33 Co-op Dynamic Scaling Multipliers
  public static readonly COOP_BOSS_HP_MULT = 1.50;        // +50% Boss Galaga HP
  public static readonly COOP_STAGE_BOSS_HP_MULT = 1.60;  // +60% Stage Boss HP (Stages 10, 20, 30, 40, 50)
  public static readonly COOP_WAVE_AGGRESSION_MULT = 1.25;// +25% Wave Aggression & Dive Cadence
  public static readonly COOP_BULLET_DENSITY_MULT = 1.25; // +25% Bullet Density & Formation Sniper Rate

  /**
   * Identifies the difficulty tier for a given stage number.
   * - Stages 1–10: CLASSIC
   * - Stages 11–25: ELITE
   * - Stages 26–50+: DREADNOUGHT
   */
  public static getStageTier(stage: number): StageTier {
    if (stage <= 10) {
      return 'CLASSIC';
    }
    if (stage <= 25) {
      return 'ELITE';
    }
    return 'DREADNOUGHT';
  }

  /**
   * Computes smooth monotonic dive speed multiplier from 1.000x to 1.800x.
   * Formula: 1.0 + 0.8 * ((s - 1) / 49)^0.85
   */
  public static getDiveSpeedMultiplier(stage: number): number {
    const s = Math.max(DifficultyCalculator.MIN_STAGE, Math.min(DifficultyCalculator.MAX_STAGE, Math.floor(stage)));
    const t = (s - 1) / 49;
    const raw = DifficultyCalculator.MIN_DIVE_SPEED_MULT + 0.8 * Math.pow(t, 0.85);
    return Math.round(raw * 1000) / 1000;
  }

  /**
   * Computes smooth exponential dive interval from 3.50s down to 0.80s.
   * Formula: 3.5 * (0.8 / 3.5)^((s - 1) / 49)
   */
  public static getDiveInterval(stage: number): number {
    const s = Math.max(DifficultyCalculator.MIN_STAGE, Math.min(DifficultyCalculator.MAX_STAGE, Math.floor(stage)));
    const t = (s - 1) / 49;
    const ratio = DifficultyCalculator.MIN_DIVE_INTERVAL / DifficultyCalculator.MAX_DIVE_INTERVAL;
    const raw = DifficultyCalculator.MAX_DIVE_INTERVAL * Math.pow(ratio, t);
    return Math.round(raw * 100) / 100;
  }

  /**
   * Computes maximum concurrent diving aliens from 1 to 6.
   * Stage 1: 1
   * Stages 2–5: 2
   * Stages 6–14: 3
   * Stages 15–26: 4
   * Stages 27–39: 5
   * Stages 40–50: 6
   */
  public static getMaxConcurrentDivers(stage: number): number {
    const s = Math.max(DifficultyCalculator.MIN_STAGE, Math.min(DifficultyCalculator.MAX_STAGE, Math.floor(stage)));
    if (s <= 1) return 1;
    if (s <= 5) return 2;
    if (s <= 14) return 3;
    if (s <= 26) return 4;
    if (s <= 39) return 5;
    return 6;
  }

  /**
   * Computes enemy bullet speed clamped strictly between 180 px/s and 320 px/s.
   * Formula: min(320, max(180, round(180 + 140 * ((s - 1) / 49)^0.75)))
   */
  public static getEnemyBulletSpeed(stage: number): number {
    const s = Math.max(DifficultyCalculator.MIN_STAGE, Math.min(DifficultyCalculator.MAX_STAGE, Math.floor(stage)));
    const t = (s - 1) / 49;
    const raw = DifficultyCalculator.MIN_BULLET_SPEED + 140 * Math.pow(t, 0.75);
    return Math.min(
      DifficultyCalculator.MAX_BULLET_SPEED,
      Math.max(DifficultyCalculator.MIN_BULLET_SPEED, Math.round(raw))
    );
  }

  /**
   * Evaluates if a stage is an acrobatic target practice Challenging Stage.
   * Matches 12 stages in rounds 1–50: [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47].
   */
  public static isChallengingStage(stage: number): boolean {
    return stage >= 3 && stage % 4 === 3;
  }

  /**
   * Evaluates if a stage is an Epic Multi-Phase Boss Encounter.
   * Matches major milestone stages: 10, 20, 30, 40, and 50.
   */
  public static isBossStage(stage: number): boolean {
    return stage === 10 || stage === 20 || stage === 30 || stage === 40 || stage === 50;
  }

  /**
   * Computes base health and kinetic shield for a given enemy type, stage, and game mode.
   */
  public static getEnemyHealthAndShield(
    stage: number,
    type: EnemyType,
    isCoop: boolean = false
  ): EnemyHealthAndShield {
    // Challenging stages always have 1 HP and 0 shield for authentic 40-hit bonus feasibility
    if (DifficultyCalculator.isChallengingStage(stage)) {
      return { health: 1, shield: 0 };
    }

    const tier = DifficultyCalculator.getStageTier(stage);

    switch (tier) {
      case 'CLASSIC':
        if (type === EnemyType.BOSS) {
          return { health: isCoop ? 3 : 2, shield: 0 };
        }
        return { health: 1, shield: 0 };

      case 'ELITE':
        if (type === EnemyType.BOSS) {
          return { health: isCoop ? 5 : 3, shield: 0 };
        }
        if (type === EnemyType.CAPTURED_FIGHTER) {
          return { health: 1, shield: 0 };
        }
        return { health: 2, shield: 0 };

      case 'DREADNOUGHT':
        if (type === EnemyType.BOSS) {
          return { health: isCoop ? 5 : 3, shield: 2 };
        }
        if (type === EnemyType.CAPTURED_FIGHTER) {
          return { health: 1, shield: 0 };
        }
        return { health: 2, shield: 1 };
    }
  }

  /**
   * Computes co-op scaled max concurrent divers (capped at 8).
   */
  public static getCoopMaxConcurrentDivers(baseDivers: number): number {
    return Math.min(8, Math.round(baseDivers * DifficultyCalculator.COOP_WAVE_AGGRESSION_MULT));
  }

  /**
   * Determines number of aimed bullets an enemy can discharge during a dive swoop.
   */
  public static getShotsPerDive(stage: number): number {
    if (DifficultyCalculator.isChallengingStage(stage)) {
      return 0; // Strict invariant: 0 bullets in challenging stages
    }
    const tier = DifficultyCalculator.getStageTier(stage);
    if (tier === 'CLASSIC') return 1;
    if (tier === 'ELITE') return 2;
    return 3;
  }

  /**
   * Returns cooldown between background sniper shots from formation (seconds).
   * Returns Infinity if inactive.
   */
  public static getFormationFireInterval(stage: number): number {
    if (DifficultyCalculator.isChallengingStage(stage) || stage < 11) {
      return Infinity; // Inactive in Classic and Challenging stages
    }
    const s = Math.min(50, Math.max(11, Math.floor(stage)));
    return Math.max(1.5, 4.0 - ((s - 11) / 39) * 2.5);
  }

  /**
   * Calculates bonus score for Challenging Stage results.
   */
  public static getChallengingStageBonus(hits: number): number {
    if (!Number.isFinite(hits)) return 0;
    const clampedHits = Math.max(0, Math.min(40, Math.floor(hits)));
    if (clampedHits === 40) {
      return 10000; // Perfect 40-hit special bonus
    }
    return clampedHits * 100;
  }

  /**
   * Bundles full stage difficulty configuration.
   */
  public static getStageConfig(stage: number): StageDifficultyConfig {
    return {
      stage,
      tier: DifficultyCalculator.getStageTier(stage),
      diveSpeedMultiplier: DifficultyCalculator.getDiveSpeedMultiplier(stage),
      diveInterval: DifficultyCalculator.getDiveInterval(stage),
      maxConcurrentDivers: DifficultyCalculator.getMaxConcurrentDivers(stage),
      enemyBulletSpeed: DifficultyCalculator.getEnemyBulletSpeed(stage),
      shotsPerDive: DifficultyCalculator.getShotsPerDive(stage),
      formationFireInterval: DifficultyCalculator.getFormationFireInterval(stage),
      isChallengingStage: DifficultyCalculator.isChallengingStage(stage),
    };
  }
}
