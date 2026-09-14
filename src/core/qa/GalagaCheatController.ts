/**
 * Galaga Arcade Web Game — Global QA Cheat Controller
 * 
 * Provides deterministic state controls, rapid stage skips, and invariant verification
 * for Playwright automation bots, manual browser QA, and unit/integration stress tests.
 * 
 * Cleanly mounts onto window.__GALAGA_CHEAT__ (browser) and globalThis.__GALAGA_CHEAT__ (Node headless).
 */

import type { Game } from '../Game';
import type { IGalagaCheatController } from '../../types';
import { CrisisEventType, type ICrisisEvent } from '../crisis/types';
import { DroneType } from '../allies/types';
import { SpecialMoveType } from '../specials/types';
import { EnemyState, EnemyType } from '../../types';
import { DifficultyCalculator } from '../../systems/DifficultyCalculator';
import { Player } from '../../entities/Player';
import { MusicJingles } from '../../audio/MusicJingles';
import type { BaseBoss } from '../boss/BaseBoss';
import { GlitchEventType } from '../glitch/types';
import { PowerUpType } from '../powerups/types';

export class GalagaCheatController implements IGalagaCheatController {
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    this.registerGlobal();
  }

  /**
   * Registers controller instance onto global window and globalThis scopes.
   */
  public registerGlobal(): void {
    if (typeof window !== 'undefined') {
      window.__GALAGA_CHEAT__ = this;
    }
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__GALAGA_CHEAT__ = this;
    }
  }

  /**
   * Unmounts controller from global window and globalThis scopes cleanly.
   */
  public destroy(): void {
    if (typeof window !== 'undefined' && window.__GALAGA_CHEAT__ === this) {
      delete (window as any).__GALAGA_CHEAT__;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).__GALAGA_CHEAT__ === this) {
      delete (globalThis as any).__GALAGA_CHEAT__;
    }
  }

  /**
   * Cleanly skips to target stage (1..50), resetting existing entities across all 7 pools.
   * Returns true on successful skip, or false on out-of-bounds input.
   */
  public skipToStage(stage: number): boolean {
    if (
      typeof stage !== 'number' ||
      !Number.isFinite(stage) ||
      !Number.isInteger(stage) ||
      stage < 1 ||
      stage > 50
    ) {
      return false;
    }

    // 1. Teardown existing projectiles, particles, and tractor beam
    this.game.bulletManager.clear();
    this.game.particleSystem.clear();
    this.game.tractorBeam.reset();
    this.game.soundSynth.stopTractorBeam();
    this.game.soundSynth.stopAll();
    MusicJingles.stopAll();

    // 2. Teardown crisis, boss, and power-up subsystems
    if (this.game.crisisEventManager) {
      this.game.crisisEventManager.clearCrisis();
      this.game.crisisEventManager.onStageClear();
    }
    if (this.game.bossManager) {
      this.game.bossManager.reset();
    }
    if (this.game.powerUpManager) {
      this.game.powerUpManager.reset();
    }
    if (this.game.glitchEventManager) {
      this.game.glitchEventManager.clearGlitch();
    }

    // 3. Teardown allies and special munitions pools (zero-leak guarantee)
    if (this.game.alliesManager) {
      this.game.alliesManager.onStageClear();
    }
    if (this.game.specialMovesManager) {
      this.game.specialMovesManager.onStageClear();
    }

    // 4. Reset formation entities
    if (this.game.formationManager) {
      this.game.formationManager.reset();
    }

    // 5. Stabilize player kinematics & state (revive if dead/game-over)
    if (this.game.player) {
      this.game.player.x = 112;
      this.game.player.y = Player.BASELINE_Y;
      this.game.player.vx = 0;
      this.game.player.vy = 0;
      this.game.player.deathTimer = 0;
      this.game.player.captureTimer = 0;
      this.game.player.captureAngle = 0;
      this.game.player.rescuedFighter.active = false;
      this.game.player.activeMissileCount = 0;
      this.game.player.fireCooldownTimer = 0;

      if (this.game.player.lives <= 0) {
        this.game.player.lives = 3;
      }
      this.game.lives = this.game.player.lives;

      if (
        this.game.player.state === 'destroyed' ||
        this.game.player.state === 'DESTROYED' ||
        this.game.player.state === 'captured' ||
        this.game.player.state === 'CAPTURED' ||
        this.game.player.state === 'capturing' ||
        this.game.player.state === 'CAPTURING'
      ) {
        this.game.player.reset(112, Player.BASELINE_Y, this.game.player.lives);
      }
    }

    // 6. Update stage number
    this.game.scoreManager.setStage(stage);
    this.game.stage = stage;

    // 7. Spawn new stage formation & transition state
    if (DifficultyCalculator.isChallengingStage(stage)) {
      this.game.scoreManager.resetChallengingHits();
      this.game.formationManager.spawnStage(stage);
      this.game.setState('CHALLENGING_STAGE');
    } else {
      this.game.formationManager.spawnStage(stage);
      this.game.setState('PLAYING');
    }

    if (this.game.dynamicDifficultyManager) {
      this.game.dynamicDifficultyManager.onStageStart(stage);
    }

    if (this.game.glitchEventManager) {
      this.game.glitchEventManager.evaluateStageTrigger(stage);
    }

    return true;
  }

  /**
   * Immediately triggers a specific Stellaris crisis event via CrisisEventManager.
   * Supports canonical enum strings and case-insensitive aliases.
   * Returns true on success, false on invalid ID.
   */
  public triggerCrisis(crisisId: string): boolean {
    if (typeof crisisId !== 'string' || crisisId.trim() === '') {
      return false;
    }

    const resolvedType = this.resolveCrisisType(crisisId);
    if (!resolvedType) {
      return false;
    }

    // If game in TITLE attract or GAME_OVER, start game first
    if (this.game.state === 'TITLE' || this.game.state === 'GAME_OVER') {
      this.game.startGame();
    }

    // Clear existing active crisis if any
    if (this.game.crisisEventManager.getActiveCrisis()) {
      this.game.crisisEventManager.clearCrisis();
    }

    this.game.crisisEventManager.forceActivate(resolvedType, this.game.stage);
    return true;
  }

  /**
   * Immediately transitions to designated Boss fight (Stages 10, 20, 30, 40, 50).
   * Supports stage numbers and boss names.
   * Returns true on success, false on invalid ID.
   */
  public spawnBoss(bossId: string | number): boolean {
    const stage = this.resolveBossStage(bossId);
    if (!stage) {
      return false;
    }

    const skipped = this.skipToStage(stage);
    if (!skipped) {
      return false;
    }

    this.game.setState('PLAYING');
    return true;
  }

  /**
   * Forces instant execution of a special move, bypassing energy meter and cooldown.
   * Returns true on success, false on invalid move ID.
   */
  public triggerSpecialMove(moveId: 'nova' | 'chrono' | 'warp' | string): boolean {
    if (typeof moveId !== 'string' || moveId.trim() === '') {
      return false;
    }

    const resolvedMove = this.resolveSpecialMoveType(moveId);
    if (!resolvedMove) {
      return false;
    }

    const mgr = this.game.specialMovesManager;
    if (!mgr) {
      return false;
    }

    // Forcibly clear cooldown and fill energy to bypass constraints for QA
    mgr.energy = mgr.maxEnergy;
    mgr.cooldownTimer = 0;
    mgr.isActive = false;
    mgr.activeMove = null;

    mgr.triggerSpecial(resolvedMove);
    return true;
  }

  /**
   * Toggles player invulnerability (God Mode) for QA testing.
   */
  public setInvincible(invincible: boolean): void {
    const val = Boolean(invincible);
    if (this.game.player) {
      this.game.player.isInvincibleCheat = val;
    }
  }

  /**
   * Summons designated wingman Drone via AlliesManager.
   * Supports 'ESCORT', 'AEGIS', 'BOMBER', and 'ALL'.
   * Returns true on success, false on invalid drone type.
   */
  public unlockDrone(droneType: 'escort' | 'aegis' | 'bomber' | string): boolean {
    if (typeof droneType !== 'string' || droneType.trim() === '') {
      return false;
    }

    const normalized = droneType.trim().toLowerCase().replace(/[-_\s]+/g, '_');

    if (normalized === 'all') {
      this.game.alliesManager.summonDrone(DroneType.ESCORT, 0);
      this.game.alliesManager.summonDrone(DroneType.AEGIS, 0);
      this.game.alliesManager.summonDrone(DroneType.BOMBER, 0);
      return true;
    }

    let resolvedDrone: DroneType | null = null;
    if (normalized === 'escort') {
      resolvedDrone = DroneType.ESCORT;
    } else if (normalized === 'aegis' || normalized === 'shield') {
      resolvedDrone = DroneType.AEGIS;
    } else if (normalized === 'bomber') {
      resolvedDrone = DroneType.BOMBER;
    }

    if (!resolvedDrone) {
      return false;
    }

    this.game.alliesManager.summonDrone(resolvedDrone, 0);
    return true;
  }

  /**
   * Sets special move energy gauge to specified amount (default: 100%).
   */
  public fillEnergy(amount?: number): void {
    const val = typeof amount === 'number' && Number.isFinite(amount)
      ? Math.max(0, Math.min(100, amount))
      : 100;

    if (this.game.specialMovesManager) {
      this.game.specialMovesManager.energy = val;
      this.game.specialMovesManager.cooldownTimer = 0;
    }
  }

  /**
   * Destroys all active formation enemies and boss on screen.
   * Returns count of defeated enemies.
   */
  public killAllEnemies(): number {
    let killedCount = 0;

    if (this.game.formationManager) {
      const living = this.game.formationManager.getLivingEnemies();
      for (const enemy of living) {
        if (enemy.active && enemy.state !== EnemyState.EXPLODING && enemy.state !== EnemyState.INACTIVE) {
          enemy.takeDamage(9999);
          this.game.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
          this.game.scoreManager.addScore(enemy.type === EnemyType.BOSS ? 150 : 80);
          killedCount++;
        }
      }
      this.game.formationManager.isEntryWaveActive = false;
      if (this.game.formationManager.isChallengingStage) {
        this.game.formationManager.currentSubWave = 5;
      }
    }

    if (this.game.bossManager?.activeBoss?.active) {
      const boss = this.game.bossManager.activeBoss;
      boss.takeDamage(99999);
      this.game.particleSystem.spawnBossExplosion(boss.x, boss.y);
      this.game.soundSynth.playExplosion('boss');
      killedCount++;
    }

    return killedCount;
  }

  /**
   * Updates player and score manager score directly.
   */
  public setScore(score: number): void {
    const s = typeof score === 'number' && Number.isFinite(score)
      ? Math.max(0, Math.floor(score))
      : 0;

    this.game.score = s;
    if (this.game.player) {
      this.game.player.score = s;
    }
    if (this.game.alliesManager) {
      this.game.alliesManager.checkMilestones(s, this.game.stage);
    }
  }

  /**
   * Adjusts player remaining lives count.
   * Returns updated lives count.
   */
  public addLives(n: number): number {
    const delta = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
    const newLives = Math.max(0, this.game.lives + delta);
    this.game.lives = newLives;
    if (this.game.player) {
      this.game.player.lives = newLives;
    }
    return newLives;
  }

  /**
   * Sets or locks the DDA skill index proficiency override in [0.0, 1.0],
   * or null to restore real-time dynamic calculation.
   * Returns true on valid input, or false if input is invalid/out-of-bounds.
   */
  public setDDAProficiency(proficiency: number | null): boolean {
    if (proficiency === null) {
      if (this.game.dynamicDifficultyManager) {
        this.game.dynamicDifficultyManager.setProficiencyOverride(null);
      }
      return true;
    }

    if (
      typeof proficiency !== 'number' ||
      !Number.isFinite(proficiency) ||
      proficiency < 0.0 ||
      proficiency > 1.0
    ) {
      return false;
    }

    if (this.game.dynamicDifficultyManager) {
      this.game.dynamicDifficultyManager.setProficiencyOverride(proficiency);
    }
    return true;
  }

  /**
   * Returns diagnostic snapshot of current DDA telemetry metrics and actuators.
   */
  public getDDAMetrics(): object {
    if (!this.game.dynamicDifficultyManager) {
      return {
        skillIndex: 0.50,
        diveSpeedMultiplier: 1.0,
        bulletDensityMultiplier: 1.0,
        bossHealthMultiplier: 1.0,
        powerUpPityBonus: 0.0,
      };
    }
    const actuators = this.game.dynamicDifficultyManager.getActuators();
    const metrics = this.game.dynamicDifficultyManager.getMetrics();
    return {
      ...metrics,
      actuators: { ...actuators },
    };
  }

  /**
   * Resets DDA engine telemetry, buffers, and overrides back to neutral state.
   */
  public resetDDA(): void {
    if (this.game.dynamicDifficultyManager) {
      this.game.dynamicDifficultyManager.reset();
    }
  }

  /**
   * Immediately triggers a glitch event via GlitchEventManager.
   * Supports canonical enum strings and case-insensitive aliases.
   * Returns true on success, false on invalid type.
   */
  public triggerGlitch(type?: string): boolean {
    const resolvedType = this.resolveGlitchType(type);
    if (!resolvedType) {
      return false;
    }

    if (this.game.state === 'TITLE' || this.game.state === 'GAME_OVER') {
      this.game.startGame();
    }

    if (this.game.glitchEventManager) {
      this.game.glitchEventManager.forceActivate(resolvedType);
      return true;
    }
    return false;
  }

  /**
   * Clears any active glitch event immediately.
   */
  public clearGlitch(): void {
    if (this.game.glitchEventManager) {
      this.game.glitchEventManager.clearGlitch();
    }
  }

  /**
   * Spawns a power-up capsule from pool at (x, y) or player position.
   * Supports all 10 power-up types with case-insensitive aliases:
   * - 'rapid' / 'rapid_fire' / 'overclock'
   * - 'shield' / 'kinetic_shield' / 'barrier'
   * - 'scatter' / 'scatter_shot' / 'spread'
   * - 'booster' / 'engine_booster' / 'speed'
   * - 'emp' / 'emp_bomb' / 'bomb'
   * - 'chrono' / 'chrono_field' / 'time_dilation'
   * - 'reflection' / 'reflection_shield' / 'counter'
   * - 'collector' / 'emp_collector' / 'vortex'
   * - 'phase' / 'phase_drive' / 'warp_drive'
   * - 'plasma' / 'antimatter_plasma' / 'lance'
   */
  public spawnPowerUp(powerUpType: string, x?: number, y?: number): boolean {
    if (!this.game.powerUpManager) return false;
    const normType = this.normalizePowerUpType(powerUpType);
    if (!normType) return false;

    const spawnX = x ?? (this.game.player ? this.game.player.x : 112);
    const spawnY = y ?? (this.game.player ? Math.max(20, this.game.player.y - 60) : 50);

    const item = this.game.powerUpManager.spawnPowerUp(spawnX, spawnY, normType);
    return item !== null;
  }

  /**
   * Directly applies upgrade buff to player.
   */
  public applyPowerUp(powerUpType: string): boolean {
    if (!this.game.powerUpManager || !this.game.player) return false;
    const normType = this.normalizePowerUpType(powerUpType);
    if (!normType) return false;

    this.game.powerUpManager.applyPowerUp(normType, this.game.player);
    return true;
  }

  private normalizePowerUpType(id: string): PowerUpType | null {
    if (!id || typeof id !== 'string') return null;
    const clean = id.trim().toLowerCase().replace(/[\s-]+/g, '_');
    switch (clean) {
      case 'rapid':
      case 'rapid_fire':
      case 'overclock':
        return PowerUpType.RAPID_FIRE;
      case 'shield':
      case 'kinetic_shield':
      case 'barrier':
        return PowerUpType.KINETIC_SHIELD;
      case 'scatter':
      case 'scatter_shot':
      case 'spread':
      case 'multishot':
        return PowerUpType.SCATTER_SHOT;
      case 'booster':
      case 'engine_booster':
      case 'speed':
      case 'hyperdrive':
        return PowerUpType.ENGINE_BOOSTER;
      case 'emp':
      case 'emp_bomb':
      case 'bomb':
      case 'shockwave':
        return PowerUpType.EMP_BOMB;
      case 'chrono':
      case 'chrono_field':
      case 'time_dilation':
      case 'time_slow':
        return PowerUpType.CHRONO_FIELD;
      case 'reflection':
      case 'reflection_shield':
      case 'reflect':
      case 'counter_shield':
        return PowerUpType.REFLECTION_SHIELD;
      case 'collector':
      case 'emp_collector':
      case 'vortex':
      case 'singularity':
        return PowerUpType.EMP_COLLECTOR;
      case 'phase':
      case 'phase_drive':
      case 'warp_drive':
      case 'blink':
        return PowerUpType.PHASE_DRIVE;
      case 'plasma':
      case 'antimatter':
      case 'antimatter_plasma':
      case 'lance':
      case 'plasma_blaster':
        return PowerUpType.ANTIMATTER_PLASMA;
      default:
        return null;
    }
  }

  /**
   * Returns diagnostic summary snapshot of current game state.
   */
  public getGameState(): {
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
  } {
    const actuators = this.game.dynamicDifficultyManager?.getActuators();
    const glitchTel = this.game.glitchEventManager?.getTelemetry();
    return {
      stage: this.game.stage,
      score: this.game.score,
      lives: this.game.lives,
      state: this.game.state,
      energy: this.game.specialMovesManager ? this.game.specialMovesManager.energy : 0,
      activeEnemies: this.game.formationManager ? this.game.formationManager.getLivingCount() : 0,
      isInvincible: this.game.player ? Boolean(this.game.player.isInvincibleCheat) : false,
      dda: actuators
        ? {
            skillIndex: actuators.skillIndex,
            diveSpeedMultiplier: actuators.diveSpeedMultiplier,
            bulletDensityMultiplier: actuators.bulletDensityMultiplier,
            bossHealthMultiplier: actuators.bossHealthMultiplier,
            powerUpPityBonus: actuators.powerUpPityBonus,
          }
        : undefined,
      glitch: glitchTel
        ? {
            active: glitchTel.active,
            state: glitchTel.state,
            type: glitchTel.type,
            isGlitchSector: glitchTel.isGlitchSector,
            timer: glitchTel.timer,
          }
        : undefined,
      powerups: this.game.powerUpManager
        ? {
            activeBuffs: this.game.powerUpManager.getActiveBuffs(),
            activeItemCount: this.game.powerUpManager.getActiveCount(),
          }
        : undefined,
    };
  }

  // ==========================================================================
  // Diagnostic Helper Getters
  // ==========================================================================

  public getGame(): Game {
    return this.game;
  }

  public getStage(): number {
    return this.game.stage;
  }

  public getScore(): number {
    return this.game.score;
  }

  public getLives(): number {
    return this.game.lives;
  }

  public isInvincible(): boolean {
    return this.game.player ? Boolean(this.game.player.isInvincibleCheat) : false;
  }

  public getEnergy(): number {
    return this.game.specialMovesManager ? this.game.specialMovesManager.energy : 0;
  }

  public getActiveBoss(): BaseBoss | null {
    return this.game.bossManager ? this.game.bossManager.activeBoss : null;
  }

  public getActiveCrisis(): ICrisisEvent | null {
    return this.game.crisisEventManager ? this.game.crisisEventManager.getActiveCrisis() : null;
  }

  public getActiveEnemiesCount(): number {
    return this.game.formationManager ? this.game.formationManager.getLivingCount() : 0;
  }

  // ==========================================================================
  // Alias Resolution Mappings
  // ==========================================================================

  private resolveCrisisType(raw: string): CrisisEventType | null {
    const clean = raw.trim().toLowerCase().replace(/[-_\s]+/g, '_');

    const map: Record<string, CrisisEventType> = {
      the_contingency: CrisisEventType.THE_CONTINGENCY,
      contingency: CrisisEventType.THE_CONTINGENCY,
      ghost_signal: CrisisEventType.THE_CONTINGENCY,
      ai: CrisisEventType.THE_CONTINGENCY,

      the_unbidden: CrisisEventType.THE_UNBIDDEN,
      unbidden: CrisisEventType.THE_UNBIDDEN,
      dimensional_tear: CrisisEventType.THE_UNBIDDEN,
      rift: CrisisEventType.THE_UNBIDDEN,

      the_prethoryn_scourge: CrisisEventType.THE_PRETHORYN_SCOURGE,
      prethoryn: CrisisEventType.THE_PRETHORYN_SCOURGE,
      scourge: CrisisEventType.THE_PRETHORYN_SCOURGE,
      swarm: CrisisEventType.THE_PRETHORYN_SCOURGE,

      shield_overload: CrisisEventType.SHIELD_OVERLOAD,
      shield: CrisisEventType.SHIELD_OVERLOAD,
      energy_matrix: CrisisEventType.SHIELD_OVERLOAD,

      physics_inversion: CrisisEventType.PHYSICS_INVERSION,
      physics: CrisisEventType.PHYSICS_INVERSION,
      singularity: CrisisEventType.PHYSICS_INVERSION,

      hyperspace_storm: CrisisEventType.HYPERSPACE_STORM,
      hyperspace: CrisisEventType.HYPERSPACE_STORM,
      storm: CrisisEventType.HYPERSPACE_STORM,
      lightning: CrisisEventType.HYPERSPACE_STORM,

      nanite_cloud: CrisisEventType.NANITE_CLOUD,
      nanite: CrisisEventType.NANITE_CLOUD,
      gray_tempest: CrisisEventType.NANITE_CLOUD,
      gray_goo: CrisisEventType.NANITE_CLOUD,

      psionic_resonance: CrisisEventType.PSIONIC_RESONANCE,
      psionic: CrisisEventType.PSIONIC_RESONANCE,
      shroud: CrisisEventType.PSIONIC_RESONANCE,
      shroud_incursion: CrisisEventType.PSIONIC_RESONANCE,

      devouring_swarm_frenzy: CrisisEventType.DEVOURING_SWARM_FRENZY,
      devouring_swarm: CrisisEventType.DEVOURING_SWARM_FRENZY,
      frenzy: CrisisEventType.DEVOURING_SWARM_FRENZY,

      nemesis_star_eater: CrisisEventType.NEMESIS_STAR_EATER,
      nemesis: CrisisEventType.NEMESIS_STAR_EATER,
      star_eater: CrisisEventType.NEMESIS_STAR_EATER,
      dark_matter: CrisisEventType.NEMESIS_STAR_EATER,

      time_dilation_field: CrisisEventType.TIME_DILATION_FIELD,
      time_dilation: CrisisEventType.TIME_DILATION_FIELD,
      time: CrisisEventType.TIME_DILATION_FIELD,
      chrono: CrisisEventType.TIME_DILATION_FIELD,
      chrono_anomaly: CrisisEventType.TIME_DILATION_FIELD,
    };

    if (map[clean]) {
      return map[clean];
    }

    // Direct enum lookup
    for (const val of Object.values(CrisisEventType)) {
      if (val.toLowerCase() === clean) {
        return val;
      }
    }

    return null;
  }

  private resolveBossStage(bossId: string | number): number | null {
    if (typeof bossId === 'number') {
      return [10, 20, 30, 40, 50].includes(bossId) ? bossId : null;
    }

    if (typeof bossId !== 'string') {
      return null;
    }

    const clean = bossId.trim().toLowerCase().replace(/[-_\s]+/g, '_');

    if (clean === '10') return 10;
    if (clean === '20') return 20;
    if (clean === '30') return 30;
    if (clean === '40') return 40;
    if (clean === '50') return 50;

    const bossMap: Record<string, number> = {
      cyber_dreadnought: 10,
      dreadnought: 10,
      cyber: 10,

      dimensional_leviathan: 20,
      leviathan: 20,
      dimensional: 20,

      nanite_colossus: 30,
      nanite_swarm_colossus: 30,
      colossus: 30,
      nanite: 30,

      psionic_harbinger: 40,
      psionic_shroud_harbinger: 40,
      harbinger: 40,
      psionic: 40,

      aeternum_core: 50,
      aeternum_star_eater_core: 50,
      aeternum: 50,
      core: 50,
      star_eater: 50,
    };

    return bossMap[clean] ?? null;
  }

  private resolveSpecialMoveType(moveId: string): SpecialMoveType | null {
    const clean = moveId.trim().toLowerCase().replace(/[-_\s]+/g, '_');

    if (clean === 'nova' || clean === 'barrage' || clean === 'nova_barrage') {
      return SpecialMoveType.NOVA_BARRAGE;
    }
    if (clean === 'chrono' || clean === 'freeze' || clean === 'chrono_freeze') {
      return SpecialMoveType.CHRONO_FREEZE;
    }
    if (clean === 'warp' || clean === 'ram' || clean === 'warp_ram' || clean === 'dimensional_warp_ram') {
      return SpecialMoveType.WARP_RAM;
    }

    for (const val of Object.values(SpecialMoveType)) {
      if (val.toLowerCase() === clean) {
        return val;
      }
    }

    return null;
  }

  private resolveGlitchType(glitchId?: string): GlitchEventType | null {
    if (!glitchId || glitchId.trim() === '' || glitchId.toLowerCase() === 'random') {
      const types = [
        GlitchEventType.QUANTUM_TELEPORT,
        GlitchEventType.KINETIC_INVERSION,
        GlitchEventType.MIRAGE_CLONES,
        GlitchEventType.RASTER_TEAR,
        GlitchEventType.CHROMATIC_ABERRATION,
        GlitchEventType.XOR_NOISE,
        GlitchEventType.HEX_SCRAMBLE,
        GlitchEventType.SECTOR_ANOMALY,
      ];
      return types[Math.floor(Math.random() * types.length)]!;
    }

    const clean = glitchId.trim().toLowerCase().replace(/[-_\s]+/g, '_');

    const map: Record<string, GlitchEventType> = {
      // Quantum Teleport aliases
      teleport: GlitchEventType.QUANTUM_TELEPORT,
      quantum: GlitchEventType.QUANTUM_TELEPORT,
      quantum_teleport: GlitchEventType.QUANTUM_TELEPORT,
      quantum_teleportation: GlitchEventType.QUANTUM_TELEPORT,

      // Kinetic Inversion & Vector aliases
      kinetic: GlitchEventType.KINETIC_INVERSION,
      inversion: GlitchEventType.KINETIC_INVERSION,
      kinetic_inversion: GlitchEventType.KINETIC_INVERSION,
      vector: GlitchEventType.KINETIC_INVERSION,
      dive: GlitchEventType.KINETIC_INVERSION,
      corrupted_dive: GlitchEventType.KINETIC_INVERSION,

      // Mirage Clone aliases
      mirage: GlitchEventType.MIRAGE_CLONES,
      clone: GlitchEventType.MIRAGE_CLONES,
      clones: GlitchEventType.MIRAGE_CLONES,
      mirage_clone: GlitchEventType.MIRAGE_CLONES,
      mirage_clones: GlitchEventType.MIRAGE_CLONES,
      mirage_duplication: GlitchEventType.MIRAGE_CLONES,
      decoy: GlitchEventType.MIRAGE_CLONES,

      // Raster Tear aliases
      raster: GlitchEventType.RASTER_TEAR,
      tear: GlitchEventType.RASTER_TEAR,
      scanline: GlitchEventType.RASTER_TEAR,
      raster_tear: GlitchEventType.RASTER_TEAR,
      scanline_tear: GlitchEventType.RASTER_TEAR,

      // Chromatic Aberration aliases
      chroma: GlitchEventType.CHROMATIC_ABERRATION,
      chromatic: GlitchEventType.CHROMATIC_ABERRATION,
      aberration: GlitchEventType.CHROMATIC_ABERRATION,
      chromatic_aberration: GlitchEventType.CHROMATIC_ABERRATION,

      // XOR Noise aliases
      xor: GlitchEventType.XOR_NOISE,
      noise: GlitchEventType.XOR_NOISE,
      xor_noise: GlitchEventType.XOR_NOISE,
      texture: GlitchEventType.XOR_NOISE,

      // Hex Scramble aliases
      hex: GlitchEventType.HEX_SCRAMBLE,
      scramble: GlitchEventType.HEX_SCRAMBLE,
      hex_scramble: GlitchEventType.HEX_SCRAMBLE,
      hud: GlitchEventType.HEX_SCRAMBLE,

      // Sector Anomaly aliases
      sector: GlitchEventType.SECTOR_ANOMALY,
      glitch_sector: GlitchEventType.SECTOR_ANOMALY,
      anomaly: GlitchEventType.SECTOR_ANOMALY,
      sector_anomaly: GlitchEventType.SECTOR_ANOMALY,
    };

    if (map[clean]) {
      return map[clean];
    }

    for (const val of Object.values(GlitchEventType)) {
      if (val.toLowerCase() === clean) {
        return val;
      }
    }

    return null;
  }
}
