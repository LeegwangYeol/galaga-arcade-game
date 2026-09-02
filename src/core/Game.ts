/**
 * Galaga Arcade Web Game — Master Game Coordinator
 * 
 * Integrates ScreenManager, GameLoop, Starfield, InputHandler, Player, BulletManager,
 * FormationManager, TractorBeam, SpriteRenderer, AudioContextManager, SoundSynth,
 * MusicJingles, ParticleSystem, ScoreManager, HUD, and Screens.
 * 
 * Implements deterministic game state machine, collision resolution, double-buffered
 * rendering pipeline, audio triggers, and persistent high score management.
 */

import { ScreenManager } from './ScreenManager';
import { GameLoop } from './GameLoop';
import { Starfield } from '../systems/Starfield';
import { InputHandler } from '../ui/InputHandler';
import { Player } from '../entities/Player';
import { BulletManager } from '../entities/Bullet';
import { FormationManager } from '../systems/FormationManager';
import { TractorBeam } from '../entities/TractorBeam';
import { Enemy } from '../entities/Enemy';
import { SpriteRenderer } from '../renderer/SpriteRenderer';
import { AudioContextManager } from '../audio/AudioContextManager';
import { SoundSynth } from '../audio/SoundSynth';
import { MusicJingles } from '../audio/MusicJingles';
import { ParticleSystem } from '../systems/ParticleSystem';
import { ScoreManager } from '../systems/ScoreManager';
import { HUD } from '../ui/HUD';
import { Screens, type ScreenRenderContext } from '../ui/Screens';
import { EnemyType, EnemyState } from '../types';
import type { GameState, IGameEngine, Rect, VirtualResolution } from '../types';

function checkAABB(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export class Game implements IGameEngine {
  public static readonly CANVAS_ID = 'game-canvas';
  public static readonly VIRTUAL_WIDTH = 224;
  public static readonly VIRTUAL_HEIGHT = 288;
  public static readonly HIGH_SCORE_STORAGE_KEY = 'galaga_high_score';

  public static readonly VIRTUAL_RESOLUTION: VirtualResolution = {
    width: Game.VIRTUAL_WIDTH,
    height: Game.VIRTUAL_HEIGHT,
    aspectRatio: Game.VIRTUAL_WIDTH / Game.VIRTUAL_HEIGHT,
  };

  // DOM & Canvas Elements
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;

  // Subsystems
  public screenManager: ScreenManager;
  public gameLoop: GameLoop;
  public starfield: Starfield;
  public inputHandler: InputHandler;
  public player: Player;
  public bulletManager: BulletManager;
  public formationManager: FormationManager;
  public tractorBeam: TractorBeam;
  public audioContextManager: AudioContextManager;
  public soundSynth: SoundSynth;
  public particleSystem: ParticleSystem;
  public scoreManager: ScoreManager;
  public hud: HUD;

  // Core Game State
  public state: GameState = 'BOOT';
  public previousState: GameState | null = null;

  // State Timing & Visual Accumulators
  public stateTimer: number = 0;
  public blinkTimer: number = 0;
  private isInitialized: boolean = false;

  constructor(canvasElementOrId?: HTMLCanvasElement | string) {
    // 1. Resolve or create canvas element
    let canvas: HTMLCanvasElement | null = null;

    if (typeof canvasElementOrId === 'string' && typeof document !== 'undefined') {
      canvas = document.getElementById(canvasElementOrId) as HTMLCanvasElement | null;
    } else if (typeof HTMLCanvasElement !== 'undefined' && canvasElementOrId instanceof HTMLCanvasElement) {
      canvas = canvasElementOrId;
    } else if (canvasElementOrId && typeof canvasElementOrId === 'object') {
      canvas = canvasElementOrId as HTMLCanvasElement;
    }

    if (!canvas && typeof document !== 'undefined') {
      canvas = (document.getElementById(Game.CANVAS_ID) ||
        document.getElementById('game-canvas') ||
        document.getElementById('gameCanvas')) as HTMLCanvasElement | null;
    }

    if (!canvas && typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.id = Game.CANVAS_ID;

      const appContainer =
        document.getElementById('app-container') ||
        document.getElementById('app') ||
        document.getElementById('game-container') ||
        document.body;

      if (appContainer) {
        appContainer.appendChild(canvas);
      }
    }

    if (!canvas) {
      // Mock canvas for headless / Node test environments
      canvas = {
        id: Game.CANVAS_ID,
        width: Game.VIRTUAL_WIDTH,
        height: Game.VIRTUAL_HEIGHT,
        style: {} as CSSStyleDeclaration,
        getContext: () => null,
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 224,
          height: 288,
          x: 0,
          y: 0,
          right: 224,
          bottom: 288,
          toJSON: () => ({}),
        }),
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as HTMLCanvasElement;
    }

    this.canvas = canvas;
    this.canvas.width = Game.VIRTUAL_WIDTH;
    this.canvas.height = Game.VIRTUAL_HEIGHT;

    // 2. Acquire 2D context
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas.getContext?.('2d', {
        alpha: false,
        desynchronized: true,
      }) as CanvasRenderingContext2D | null;
    } catch {
      // Fallback
    }

    if (!ctx) {
      // Mock 2D context fallback for test environments
      this.ctx = {
        canvas: this.canvas,
        fillStyle: '#000000',
        strokeStyle: '#FFFFFF',
        font: '8px monospace',
        textAlign: 'center',
        textBaseline: 'middle',
        globalAlpha: 1.0,
        imageSmoothingEnabled: false,
        fillRect: () => {},
        fillText: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        arc: () => {},
        stroke: () => {},
      } as unknown as CanvasRenderingContext2D;
    } else {
      this.ctx = ctx;
      this.ctx.imageSmoothingEnabled = false;
    }

    // 3. Initialize Procedural SpriteRenderer & HUD Pre-Baking
    SpriteRenderer.initialize();
    HUD.initialize();

    // 4. Initialize ScoreManager with LocalStorage persistence
    this.scoreManager = new ScoreManager();
    this.hud = new HUD();

    // 5. Initialize Core Audio & Particle Subsystems
    this.audioContextManager = AudioContextManager.getInstance();
    this.soundSynth = SoundSynth.getInstance(this.audioContextManager);
    this.particleSystem = new ParticleSystem();

    // 6. Initialize Screen, Starfield & Input Subsystems
    this.screenManager = new ScreenManager(this.canvas, Game.VIRTUAL_WIDTH, Game.VIRTUAL_HEIGHT);
    this.starfield = new Starfield(Game.VIRTUAL_WIDTH, Game.VIRTUAL_HEIGHT);
    this.inputHandler = new InputHandler(this.canvas, this.screenManager, () => this.unlockAudio());

    // 7. Initialize Player & Bullet Subsystems
    this.bulletManager = new BulletManager({
      onBulletRecycle: () => {
        if (this.player) {
          this.player.activeMissileCount = this.bulletManager.getPlayerBulletCount();
        }
      },
    });

    this.player = new Player({
      x: 112,
      y: Player.BASELINE_Y,
      lives: this.scoreManager.lives,
    });

    // Wire extra life callback to add life to player and trigger audio
    this.scoreManager.onExtraLife((count: number) => {
      if (this.player) {
        this.player.lives += count;
      }
      MusicJingles.playDockingJingle();
    });

    this.player.onFire = (spawns) => {
      for (const s of spawns) {
        this.bulletManager.firePlayerBullet(
          s.x,
          s.y,
          this.player.isDual,
          Math.abs(s.vy)
        );
        this.scoreManager.recordShotFired(1);
      }
      this.player.activeMissileCount = this.bulletManager.getPlayerBulletCount();

      // Audio Trigger: Player laser fire
      if (this.player.isDual) {
        this.soundSynth.playLaserDual();
      } else {
        this.soundSynth.playLaser();
      }
    };

    this.player.onGameOver = () => {
      this.setState('GAME_OVER');
    };

    this.player.onCapturedComplete = (targetX, targetY) => {
      this.handlePlayerCaptured(targetX, targetY);
    };

    this.player.onDocked = () => {
      this.scoreManager.addScore(1000);
      MusicJingles.playDockingJingle();
      this.particleSystem.spawnDockingSparkles(this.player.x, this.player.y);
    };

    // 8. Initialize TractorBeam Subsystem
    this.tractorBeam = new TractorBeam();

    // 9. Initialize FormationManager Subsystem
    this.formationManager = new FormationManager({
      onEnemyFire: (req) => {
        this.bulletManager.fireEnemyBullet(
          req.originX,
          req.originY,
          req.targetX,
          req.targetY,
          req.speed
        );
      },
      onEnemyDestroyed: (_enemy, points) => {
        this.scoreManager.addScore(points);
      },
      onStageClear: () => {
        if (this.isChallengingStage(this.stage)) {
          // Process challenging stage bonus
          this.scoreManager.addChallengingStageBonus(this.scoreManager.challengingHits);
          if (this.scoreManager.challengingHits === 40) {
            MusicJingles.playBonusFanfare();
          }
        }
        this.setState('STAGE_CLEAR');
      },
      onTractorBeamRequest: (boss) => {
        this.tractorBeam.activate(boss);
        this.soundSynth.playTractorBeam(true);
      },
    });

    // 10. Initialize GameLoop
    this.gameLoop = new GameLoop({
      onUpdate: (dt: number) => this.update(dt),
      onRender: (_alpha: number) => this.render(this.ctx),
      fixedDt: 1 / 60,
    });

    this.isInitialized = true;

    // 11. Transition to TITLE attract screen
    this.setState('TITLE');
  }

  // ==========================================================================
  // Backward-Compatible Accessors for Tests
  // ==========================================================================

  public get score(): number {
    return this.scoreManager ? this.scoreManager.score : 0;
  }
  public set score(val: number) {
    if (this.scoreManager) {
      (this.scoreManager as unknown as { _score: number })._score = val;
    }
  }

  public get highScore(): number {
    return this.scoreManager ? this.scoreManager.highScore : 20000;
  }
  public set highScore(val: number) {
    if (this.scoreManager) {
      (this.scoreManager as unknown as { _highScore: number })._highScore = val;
    }
  }

  public get stage(): number {
    return this.scoreManager ? this.scoreManager.stage : 1;
  }
  public set stage(val: number) {
    if (this.scoreManager) {
      this.scoreManager.setStage(val);
    }
  }

  public get lives(): number {
    return this.player ? this.player.lives : (this.scoreManager ? this.scoreManager.lives : 3);
  }
  public set lives(val: number) {
    if (this.player) this.player.lives = val;
    if (this.scoreManager) {
      (this.scoreManager as unknown as { _lives: number })._lives = val;
    }
  }

  // ==========================================================================
  // Engine Lifecycle (IGameEngine Contract)
  // ==========================================================================

  /**
   * Starts the master game loop.
   */
  public start(): void {
    if (!this.gameLoop.isRunning()) {
      this.gameLoop.start();
    }
  }

  /**
   * Stops the master game loop.
   */
  public stop(): void {
    if (this.gameLoop.isRunning()) {
      this.gameLoop.stop();
    }
  }

  /**
   * Pauses the game loop and updates internal state.
   */
  public pause(): boolean {
    if (this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE') {
      this.previousState = this.state;
      this.setState('PAUSED');
      this.starfield.setSpeedState('PAUSED');
      return true;
    }
    return false;
  }

  /**
   * Resumes the game from paused state.
   */
  public resume(): boolean {
    if (this.state === 'PAUSED' && this.previousState) {
      const resumeTarget = this.previousState;
      this.previousState = null;
      this.setState(resumeTarget);
      this.starfield.setSpeedState('NORMAL');
      return true;
    }
    return false;
  }

  /**
   * Toggles pause/resume.
   */
  public togglePause(): void {
    if (this.state === 'PAUSED') {
      this.resume();
    } else if (this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE') {
      this.pause();
    }
  }

  /**
   * Destroys engine instances and event listeners.
   */
  public destroy(): void {
    this.stop();
    this.screenManager.destroy();
    this.inputHandler.destroy();
    this.bulletManager.clear();
    this.formationManager.reset();
    this.tractorBeam.reset();
    this.particleSystem.clear();
    this.soundSynth.stopAll();
    MusicJingles.stopAll();
    this.isInitialized = false;
  }

  // ==========================================================================
  // State Machine Transitions
  // ==========================================================================

  public setState(newState: GameState): void {
    this.state = newState;
    this.stateTimer = 0;

    switch (newState) {
      case 'TITLE':
        this.starfield.setSpeedState('NORMAL');
        this.formationManager.reset();
        this.tractorBeam.reset();
        this.particleSystem.clear();
        this.soundSynth.stopAll();
        MusicJingles.stopAll();
        break;
      case 'STAGE_INTRO':
        this.starfield.setSpeedState('WARP');
        this.tractorBeam.reset();
        this.soundSynth.stopTractorBeam();
        if (this.isChallengingStage(this.stage)) {
          MusicJingles.playChallengingStageTheme();
        } else {
          MusicJingles.playStageStartFanfare();
        }
        break;
      case 'PLAYING':
      case 'CHALLENGING_STAGE':
        this.starfield.setSpeedState('NORMAL');
        break;
      case 'STAGE_CLEAR':
        this.starfield.setSpeedState('NORMAL');
        this.tractorBeam.reset();
        this.soundSynth.stopTractorBeam();
        break;
      case 'GAME_OVER':
        this.starfield.setSpeedState('NORMAL');
        this.tractorBeam.reset();
        this.soundSynth.stopTractorBeam();
        MusicJingles.playGameOverTune();
        this.scoreManager.saveHighScore();
        break;
      case 'PAUSED':
        this.starfield.setSpeedState('PAUSED');
        break;
    }
  }

  public startGame(): void {
    this.scoreManager.reset(3, 1);
    this.bulletManager.clear();
    this.player.reset(112, Player.BASELINE_Y, 3);
    this.formationManager.spawnStage(1);
    this.tractorBeam.reset();
    this.particleSystem.clear();
    this.setState('STAGE_INTRO');
  }

  public isChallengingStage(stageNum: number = this.stage): boolean {
    return stageNum >= 3 && stageNum % 4 === 3;
  }

  // ==========================================================================
  // Fixed Timestep Update Pipeline
  // ==========================================================================

  public update(dt: number): void {
    this.stateTimer += dt;
    this.blinkTimer += dt;
    this.hud.update(dt);

    // Check pause action pulse
    if (this.inputHandler.consumeAction('pause')) {
      this.togglePause();
    }

    if (this.state === 'PAUSED') {
      return;
    }

    // Update background starfield
    this.starfield.update(dt);

    // Update particle effects
    this.particleSystem.update(dt);

    // Update projectiles
    this.bulletManager.update(dt);
    this.player.activeMissileCount = this.bulletManager.getPlayerBulletCount();

    // Sync score & lives with player
    this.player.score = this.scoreManager.score;

    // State machine updates
    switch (this.state) {
      case 'TITLE':
        this.updateTitle(dt);
        break;
      case 'STAGE_INTRO':
        this.updateStageIntro(dt);
        break;
      case 'PLAYING':
        this.updatePlaying(dt);
        break;
      case 'CHALLENGING_STAGE':
        this.updateChallengingStage(dt);
        break;
      case 'STAGE_CLEAR':
        this.updateStageClear(dt);
        break;
      case 'GAME_OVER':
        this.updateGameOver(dt);
        break;
      default:
        break;
    }
  }

  private updateTitle(_dt: number): void {
    if (
      this.inputHandler.consumeAction('fire') ||
      this.inputHandler.consumeAction('restart') ||
      this.inputHandler.getState().fire ||
      this.inputHandler.getState().restart
    ) {
      this.startGame();
    }
  }

  private updateStageIntro(_dt: number): void {
    // 2.2 seconds intro animation before battle begins
    if (this.stateTimer >= 2.2) {
      this.player.respawn();
      if (this.formationManager.enemies.length === 0) {
        this.formationManager.spawnStage(this.stage);
      }
      if (this.isChallengingStage(this.stage)) {
        this.scoreManager.resetChallengingHits();
        this.setState('CHALLENGING_STAGE');
      } else {
        this.setState('PLAYING');
      }
    }
  }

  private updatePlaying(dt: number): void {
    const input = this.inputHandler.getState();
    this.player.update(dt, input);
    this.formationManager.update(dt, this.player.x, this.player.y, this.player.isDual);
    this.tractorBeam.update(dt);

    // Tractor beam energy sparkles
    if (this.tractorBeam.isActive()) {
      const boss = this.tractorBeam.getBoss();
      if (boss && Math.random() < 0.45) {
        const geom = this.tractorBeam.getGeometry();
        const beamLength = Math.max(10, geom.currentBottomY - geom.originY);
        const sparkY = geom.originY + Math.random() * (beamLength * 0.9);
        const progress = Math.max(0, Math.min(1, (sparkY - geom.originY) / beamLength));
        const widthAtY = geom.topWidth + (geom.bottomWidth - geom.topWidth) * progress;
        const sparkX = geom.originX + (Math.random() - 0.5) * widthAtY;
        this.particleSystem.spawnTractorSparkle(sparkX, sparkY);
      }
    }

    // Perform Collision Detection & Resolution
    this.resolveCollisions();
  }

  public handlePlayerCaptured(targetX: number, targetY: number): void {
    const boss = this.tractorBeam.getBoss();
    if (boss && boss.active) {
      const escort = new Enemy({
        id: `captured_${Date.now()}`,
        type: EnemyType.CAPTURED_FIGHTER,
        x: targetX,
        y: targetY,
      });
      escort.state = EnemyState.IN_FORMATION;
      escort.escortBoss = boss;
      escort.escortBossId = boss.id;
      boss.hasCapturedFighter = true;
      boss.capturedFighterEnemy = escort;
      boss.escortCount = 1;
      this.formationManager.enemies.push(escort);
      this.tractorBeam.deactivate(true);
      this.soundSynth.playTractorBeam(false);
      boss.state = EnemyState.RETURNING_TO_FORMATION;
    } else {
      this.tractorBeam.deactivate(true);
      this.soundSynth.playTractorBeam(false);
    }
  }

  private updateChallengingStage(dt: number): void {
    this.updatePlaying(dt);
  }

  private updateStageClear(_dt: number): void {
    // 2.5 seconds stage clear intermission (ample time to read challenging results)
    const clearDuration = this.isChallengingStage(this.stage) ? 2.8 : 1.8;
    if (this.stateTimer >= clearDuration) {
      this.scoreManager.advanceStage();
      this.bulletManager.clear();
      this.formationManager.spawnStage(this.stage);
      this.tractorBeam.reset();
      this.soundSynth.stopTractorBeam();
      this.setState('STAGE_INTRO');
    }
  }

  private updateGameOver(_dt: number): void {
    // Allow restart after 1.5s delay to prevent accidental skips
    if (this.stateTimer >= 1.5) {
      if (
        this.inputHandler.consumeAction('restart') ||
        this.inputHandler.consumeAction('fire')
      ) {
        this.bulletManager.clear();
        this.formationManager.reset();
        this.tractorBeam.reset();
        this.particleSystem.clear();
        this.soundSynth.stopAll();
        MusicJingles.stopAll();
        this.setState('TITLE');
      }
    }
  }

  // ==========================================================================
  // Collision Detection & Resolution Engine
  // ==========================================================================

  public resolveCollisions(): void {
    const livingEnemies = this.formationManager.getLivingEnemies();

    // 1. Player Missiles vs Living Enemies (with Rescue & Turncoat Handlers)
    this.bulletManager.forEachActivePlayerBullet((bullet) => {
      if (!bullet.active) return;

      const bulletBox = bullet.getSweptHitbox();

      for (const enemy of livingEnemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        const enemyBox = enemy.getHitbox();

        if (checkAABB(bulletBox, enemyBox)) {
          this.bulletManager.recycle(bullet);
          this.scoreManager.recordShotHit(1);

          if (this.state === 'CHALLENGING_STAGE') {
            this.scoreManager.recordChallengingHit(1);
          }

          // Case A: Shooting Boss Galaga
          if (enemy.type === EnemyType.BOSS) {
            const isDiving =
              enemy.state === EnemyState.DIVING_SOLO ||
              enemy.state === EnemyState.DIVING_ESCORT ||
              enemy.state === EnemyState.TRACTOR_BEAM_ACTIVE;

            const damageResult = enemy.takeDamage(1);

            if (damageResult.destroyed) {
              // Boss Destruction Audio & Visual Particle Burst
              this.soundSynth.playExplosion('boss');
              this.particleSystem.spawnBossExplosion(enemy.x, enemy.y);

              // Check for attached Captured Fighter Escort
              if (enemy.hasCapturedFighter && enemy.capturedFighterEnemy) {
                const capturedFighter = enemy.capturedFighterEnemy;

                if (isDiving) {
                  // SUCCESSFUL RESCUE FLOW
                  capturedFighter.active = false;
                  capturedFighter.state = EnemyState.INACTIVE;
                  this.player.startRescue(enemy.x, enemy.y);
                  this.scoreManager.addScore(1000); // Rescue bonus
                } else {
                  // TURNCOAT DIVERGENCE FLOW (Destroyed in formation)
                  capturedFighter.state = EnemyState.CAPTURED_HOSTILE;
                  capturedFighter.escortBoss = null;
                  capturedFighter.escortBossId = null;
                  this.formationManager.peelOffSolo(capturedFighter, this.player.x);
                }

                enemy.hasCapturedFighter = false;
                enemy.capturedFighterEnemy = null;
              }

              // If Boss was emitting tractor beam, collapse beam immediately
              if (this.tractorBeam.isActive() && this.tractorBeam.getBoss() === enemy) {
                this.tractorBeam.deactivate(true);
                this.soundSynth.playTractorBeam(false);
              }

              this.scoreManager.addScoreForEnemy(enemy.type, isDiving, enemy.escortCount);
            } else {
              // Boss Non-Lethal Armor Deflection Hit
              this.soundSynth.playBossHit();
              this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
            }
          }
          // Case B: Shooting Captured Fighter Directly (Accidental Destruction)
          else if (
            enemy.type === EnemyType.CAPTURED_FIGHTER ||
            enemy.state === EnemyState.CAPTURED_HOSTILE
          ) {
            const isDiving = enemy.state === EnemyState.CAPTURED_HOSTILE || enemy.state === EnemyState.DIVING_ESCORT;
            const damageResult = enemy.takeDamage(1);
            if (damageResult.destroyed) {
              this.soundSynth.playExplosion('small');
              this.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
              this.scoreManager.addScoreForCapturedFighter(isDiving);

              if (enemy.escortBoss) {
                enemy.escortBoss.hasCapturedFighter = false;
                enemy.escortBoss.capturedFighterEnemy = null;
                enemy.escortBoss.escortCount = Math.max(0, enemy.escortBoss.escortCount - 1);
              }
            }
          }
          // Case C: Standard Enemies (Zako, Goei, Transform)
          else {
            const isDiving = enemy.state === EnemyState.DIVING_SOLO || enemy.state === EnemyState.DIVING_ESCORT;
            const damageResult = enemy.takeDamage(1);
            if (damageResult.destroyed) {
              this.soundSynth.playExplosion('small');
              this.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
              this.scoreManager.addScoreForEnemy(enemy.type, isDiving);
            }
          }

          break; // One bullet hits one enemy
        }
      }
    });

    // 2. Tractor Beam Cone vs Player Ship (Capture Trigger)
    if (this.tractorBeam.isActive() && this.tractorBeam.canCapture()) {
      const isPlayerVulnerable =
        !this.player.isInvulnerable() &&
        (this.player.state === 'normal' || this.player.state === 'ALIVE') &&
        !this.player.isDual;

      if (isPlayerVulnerable) {
        const playerBox = this.player.getHitbox();
        const inBeam =
          this.tractorBeam.containsPoint(this.player.x, this.player.y) ||
          this.tractorBeam.intersectsAABB(playerBox);

        if (inBeam) {
          const boss = this.tractorBeam.getBoss();
          if (boss) {
            this.tractorBeam.startCapture(this.player);
            this.player.startCapture(boss.x, boss.y);
          }
        }
      }
    }

    // 3. Enemy Bullets vs Player Ship
    const s = this.player.state;
    const isPlayerVulnerable =
      !this.player.isInvulnerable() &&
      (s === 'normal' ||
        s === 'ALIVE' ||
        s === 'dual' ||
        s === 'DUAL' ||
        s === 'docking' ||
        s === 'DOCKING');

    if (isPlayerVulnerable) {
      this.bulletManager.forEachActiveEnemyBullet((bullet) => {
        if (!bullet.active) return;

        const bulletBox = bullet.getHitbox();
        const hit = this.player.hitTestAndDamage(bulletBox);

        if (hit) {
          this.bulletManager.recycle(bullet);
          this.soundSynth.playExplosion('large');
          this.particleSystem.spawnPlayerExplosion(this.player.x, this.player.y);
        }
      });
    }

    // 4. Enemy Craft Collisions vs Player Ship (Kamikaze Dive Impact)
    if (isPlayerVulnerable) {
      for (const enemy of livingEnemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        const enemyBox = enemy.getHitbox();
        const hit = this.player.hitTestAndDamage(enemyBox);

        if (hit) {
          enemy.takeDamage(99); // Destroy enemy on direct ship collision
          this.soundSynth.playExplosion('large');
          this.particleSystem.spawnPlayerExplosion(this.player.x, this.player.y);
          break;
        }
      }
    }
  }

  // ==========================================================================
  // Double-Buffered Rendering Pipeline
  // ==========================================================================

  public render(ctx?: CanvasRenderingContext2D): void {
    const targetCtx = ctx ?? this.ctx;
    const width = Game.VIRTUAL_WIDTH;
    const height = Game.VIRTUAL_HEIGHT;

    // Ensure pixelated crisp edges
    targetCtx.imageSmoothingEnabled = false;

    // 1. Clear Virtual Frame Buffer with deep arcade black
    targetCtx.fillStyle = '#000000';
    targetCtx.fillRect(0, 0, width, height);

    // 2. Render Starfield Layer (z-index: 0)
    this.starfield.render(targetCtx);

    const hudState = {
      score: this.scoreManager.score,
      highScore: this.scoreManager.highScore,
      lives: this.player ? this.player.lives : this.scoreManager.lives,
      stage: this.scoreManager.stage,
      is1UpBlinking: this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE',
    };

    // 3. Render HUD Score Header (z-index: 6)
    this.hud.renderHeader(targetCtx, hudState);

    const screenCtx: ScreenRenderContext = {
      ctx: targetCtx,
      width,
      height,
      stateTimer: this.stateTimer,
      blinkTimer: this.blinkTimer,
      score: this.scoreManager.score,
      highScore: this.scoreManager.highScore,
      stage: this.scoreManager.stage,
      lives: this.player ? this.player.lives : this.scoreManager.lives,
      shotsFired: this.scoreManager.shotsFired,
      hits: this.scoreManager.shotsHit,
      challengingHits: this.scoreManager.challengingHits,
      isDual: this.player ? this.player.isDual : false,
    };

    // 4. Render Active Screen State Overlay (z-index: 7)
    switch (this.state) {
      case 'TITLE':
        Screens.renderTitleScreen(screenCtx);
        break;
      case 'STAGE_INTRO':
        Screens.renderStageIntro(screenCtx);
        break;
      case 'PLAYING':
      case 'CHALLENGING_STAGE':
        this.renderPlayingScreen(targetCtx);
        break;
      case 'STAGE_CLEAR':
        if (this.isChallengingStage(this.stage)) {
          Screens.renderChallengingResults(screenCtx);
        } else {
          this.renderStageClearScreen(targetCtx);
        }
        break;
      case 'GAME_OVER':
        Screens.renderGameOver(screenCtx);
        break;
      case 'PAUSED':
        this.renderPlayingScreen(targetCtx);
        Screens.renderPauseOverlay(screenCtx);
        break;
      default:
        break;
    }

    // 5. Render HUD Footer (Lives & Stage Badges)
    this.hud.renderFooter(targetCtx, hudState);
  }

  private renderPlayingScreen(ctx: CanvasRenderingContext2D): void {
    // 1. Render Formation Grid & Diving Enemies
    this.formationManager.render(ctx);

    // 2. Render Tractor Beam Energy Cone (underneath ships and bullets)
    this.tractorBeam.render(ctx);

    // 3. Render Active Projectiles
    this.bulletManager.render(ctx);

    // 4. Render Particle Explosions & Sparkles (underneath HUD, over entities)
    this.particleSystem.render(ctx);

    // 5. Render Player Ship & Rescued Docking Ship
    this.player.render(ctx);

    // 6. Challenging Stage Overlay banner if applicable
    if (this.state === 'CHALLENGING_STAGE') {
      HUD.drawText(ctx, 'CHALLENGING STAGE', Game.VIRTUAL_WIDTH / 2, 40, {
        color: '#00FFFF',
        align: 'center',
      });
    }
  }

  private renderStageClearScreen(ctx: CanvasRenderingContext2D): void {
    const width = Game.VIRTUAL_WIDTH;
    const height = Game.VIRTUAL_HEIGHT;

    HUD.drawText(ctx, 'STAGE CLEAR', width / 2, height / 2, {
      color: '#00FF00',
      align: 'center',
    });
  }

  // ==========================================================================
  // Persistence & Audio Hooks
  // ==========================================================================

  private unlockAudio(): void {
    this.audioContextManager.unlock();
  }

  // ==========================================================================
  // Getters for Diagnostics and Testing
  // ==========================================================================

  public getScreenManager(): ScreenManager {
    return this.screenManager;
  }

  public getStarfield(): Starfield {
    return this.starfield;
  }

  public getInputHandler(): InputHandler {
    return this.inputHandler;
  }

  public getGameLoop(): GameLoop {
    return this.gameLoop;
  }

  public getPlayer(): Player {
    return this.player;
  }

  public getBulletManager(): BulletManager {
    return this.bulletManager;
  }

  public getFormationManager(): FormationManager {
    return this.formationManager;
  }

  public getTractorBeam(): TractorBeam {
    return this.tractorBeam;
  }

  public getAudioContextManager(): AudioContextManager {
    return this.audioContextManager;
  }

  public getSoundSynth(): SoundSynth {
    return this.soundSynth;
  }

  public getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  public getScoreManager(): ScoreManager {
    return this.scoreManager;
  }

  public getHUD(): HUD {
    return this.hud;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }
}
