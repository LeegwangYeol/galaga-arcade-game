/**
 * Galaga Arcade Web Game — Master Game Coordinator
 * 
 * Integrates ScreenManager, GameLoop, Starfield, InputHandler, Player, BulletManager,
 * FormationManager, TractorBeam, SpriteRenderer, AudioContextManager, SoundSynth,
 * MusicJingles, and ParticleSystem. Implements deterministic game state machine,
 * collision resolution, crisp double-buffered rendering pipeline, audio triggers,
 * and persistent high score management.
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

  // Core Game State
  public state: GameState = 'BOOT';
  public previousState: GameState | null = null;
  public stage: number = 1;
  public score: number = 0;
  public highScore: number = 20000;
  public lives: number = 3;

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

    // 3. Initialize Procedural SpriteRenderer Pre-Baking
    SpriteRenderer.initialize();

    // 4. Load High Score from LocalStorage
    this.loadHighScore();

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
      lives: this.lives,
    });

    this.player.onFire = (spawns) => {
      for (const s of spawns) {
        this.bulletManager.firePlayerBullet(
          s.x,
          s.y,
          this.player.isDual,
          Math.abs(s.vy)
        );
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
      this.lives = 0;
      this.setState('GAME_OVER');
    };

    this.player.onCapturedComplete = (targetX, targetY) => {
      this.handlePlayerCaptured(targetX, targetY);
    };

    this.player.onDocked = () => {
      this.score += 1000;
      this.saveHighScore();
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
        this.score += points;
        this.saveHighScore();
      },
      onStageClear: () => {
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
        this.saveHighScore();
        break;
      case 'PAUSED':
        this.starfield.setSpeedState('PAUSED');
        break;
    }
  }

  public startGame(): void {
    this.stage = 1;
    this.score = 0;
    this.lives = 3;
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

    // Sync lives & score with player
    this.lives = this.player.lives;
    this.player.score = this.score;

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
    // 1.8 seconds stage clear intermission
    if (this.stateTimer >= 1.8) {
      this.stage += 1;
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
                  this.score += 1000; // Rescue bonus
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

              this.score += damageResult.points;
              this.saveHighScore();
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
            const damageResult = enemy.takeDamage(1);
            if (damageResult.destroyed) {
              this.soundSynth.playExplosion('small');
              this.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
              this.score += damageResult.points || 1000;
              this.saveHighScore();

              if (enemy.escortBoss) {
                enemy.escortBoss.hasCapturedFighter = false;
                enemy.escortBoss.capturedFighterEnemy = null;
                enemy.escortBoss.escortCount = Math.max(0, enemy.escortBoss.escortCount - 1);
              }
            }
          }
          // Case C: Standard Enemies (Zako, Goei, Transform)
          else {
            const damageResult = enemy.takeDamage(1);
            if (damageResult.destroyed) {
              this.soundSynth.playExplosion('small');
              this.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
              this.score += damageResult.points;
              this.saveHighScore();
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
          this.lives = this.player.lives;
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
          this.lives = this.player.lives;
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

    // 3. Render HUD Score Header (z-index: 6)
    this.renderHUD(targetCtx);

    // 4. Render Active Screen State Overlay (z-index: 7)
    switch (this.state) {
      case 'TITLE':
        this.renderTitleScreen(targetCtx);
        break;
      case 'STAGE_INTRO':
        this.renderStageIntroScreen(targetCtx);
        break;
      case 'PLAYING':
      case 'CHALLENGING_STAGE':
        this.renderPlayingScreen(targetCtx);
        break;
      case 'STAGE_CLEAR':
        this.renderStageClearScreen(targetCtx);
        break;
      case 'GAME_OVER':
        this.renderGameOverScreen(targetCtx);
        break;
      case 'PAUSED':
        this.renderPlayingScreen(targetCtx);
        this.renderPauseOverlay(targetCtx);
        break;
      default:
        break;
    }

    // 5. Render HUD Footer (Lives & Stage Badges)
    this.renderHUDFooter(targetCtx);
  }

  // ==========================================================================
  // HUD & Screen Renderers
  // ==========================================================================

  private renderHUD(ctx: CanvasRenderingContext2D): void {
    const width = Game.VIRTUAL_WIDTH;

    ctx.save();
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 1UP Header
    ctx.fillStyle = '#FF0000';
    ctx.fillText('1UP', 36, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(this.score.toString().padStart(2, '0'), 36, 16);

    // HIGH SCORE Header
    ctx.fillStyle = '#FF0000';
    ctx.fillText('HIGH SCORE', width / 2, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(this.highScore.toString(), width / 2, 16);

    // 2UP Header
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('2UP', width - 36, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('00', width - 36, 16);

    ctx.restore();
  }

  private renderHUDFooter(ctx: CanvasRenderingContext2D): void {
    const height = Game.VIRTUAL_HEIGHT;

    ctx.save();
    // Render remaining reserve lives (authentic Galaga displays reserve lives)
    const reserveLives = Math.max(0, this.lives - 1);
    for (let i = 0; i < Math.min(5, reserveLives); i++) {
      const lx = 16 + i * 14;
      const ly = height - 12;
      SpriteRenderer.draw(ctx, 'PLAYER_LIFE_ICON', lx, ly);
    }

    // Render Stage Badge number
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#FFFF00';
    ctx.fillText(`STAGE ${this.stage}`, Game.VIRTUAL_WIDTH - 8, height - 4);

    ctx.restore();
  }

  private renderTitleScreen(ctx: CanvasRenderingContext2D): void {
    const width = Game.VIRTUAL_WIDTH;
    const height = Game.VIRTUAL_HEIGHT;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Galaga Main Logo
    ctx.font = '16px monospace';
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('GALAGA', width / 2, height / 2 - 32);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('ARCADE WEB ENGINE', width / 2, height / 2 - 14);

    // Blinking Press Any Key Prompt (Blinks at ~2.5Hz)
    const isVisible = Math.floor(this.blinkTimer * 2.5) % 2 === 0;
    if (isVisible) {
      ctx.fillStyle = '#FF3333';
      ctx.fillText('PRESS ANY KEY TO START', width / 2, height / 2 + 16);
    }

    ctx.fillStyle = '#FFFF00';
    ctx.fillText('PUSH START BUTTON', width / 2, height / 2 + 32);

    // Copyright & Namco Attribution
    ctx.fillStyle = '#888888';
    ctx.font = '6px monospace';
    ctx.fillText('© 1981 NAMCO BANDAI / WEB ADAPTATION', width / 2, height - 24);

    ctx.restore();
  }

  private renderStageIntroScreen(ctx: CanvasRenderingContext2D): void {
    const width = Game.VIRTUAL_WIDTH;
    const height = Game.VIRTUAL_HEIGHT;

    ctx.save();
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // PLAYER ONE Banner
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('PLAYER ONE', width / 2, height / 2 - 16);

    // STAGE XX Banner
    ctx.fillStyle = '#FFFF00';
    if (this.isChallengingStage(this.stage)) {
      ctx.fillText('CHALLENGING STAGE', width / 2, height / 2);
    } else {
      ctx.fillText(`STAGE ${this.stage.toString().padStart(2, '0')}`, width / 2, height / 2);
    }

    // READY Banner
    ctx.fillStyle = '#FF0000';
    ctx.fillText('READY', width / 2, height / 2 + 16);

    ctx.restore();
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
      ctx.save();
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00FFFF';
      ctx.fillText('CHALLENGING STAGE', Game.VIRTUAL_WIDTH / 2, 40);
      ctx.restore();
    }
  }

  private renderStageClearScreen(ctx: CanvasRenderingContext2D): void {
    const width = Game.VIRTUAL_WIDTH;
    const height = Game.VIRTUAL_HEIGHT;

    ctx.save();
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#00FF00';
    ctx.fillText('STAGE CLEAR', width / 2, height / 2);

    ctx.restore();
  }

  private renderGameOverScreen(ctx: CanvasRenderingContext2D): void {
    const width = Game.VIRTUAL_WIDTH;
    const height = Game.VIRTUAL_HEIGHT;

    ctx.save();
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#FF0000';
    ctx.fillText('GAME OVER', width / 2, height / 2 - 10);

    const isVisible = Math.floor(this.blinkTimer * 2) % 2 === 0;
    if (isVisible) {
      ctx.font = '8px monospace';
      ctx.fillStyle = '#FFFF00';
      ctx.fillText('PRESS FIRE OR ENTER', width / 2, height / 2 + 16);
    }

    ctx.restore();
  }

  private renderPauseOverlay(ctx: CanvasRenderingContext2D): void {
    const width = Game.VIRTUAL_WIDTH;
    const height = Game.VIRTUAL_HEIGHT;

    ctx.save();
    // Translucent black tint
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, width, height);

    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('PAUSED', width / 2, height / 2 - 8);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('PRESS P OR ESC TO RESUME', width / 2, height / 2 + 12);

    ctx.restore();
  }

  // ==========================================================================
  // Persistence & Audio Hooks
  // ==========================================================================

  private loadHighScore(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(Game.HIGH_SCORE_STORAGE_KEY);
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed > 0) {
            this.highScore = parsed;
          }
        }
      } catch {
        // LocalStorage access denied
      }
    }
  }

  private saveHighScore(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(
            Game.HIGH_SCORE_STORAGE_KEY,
            this.highScore.toString()
          );
        } catch {
          // LocalStorage access denied
        }
      }
    }
  }

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
