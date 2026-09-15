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
import { FullscreenManager } from '../ui/FullscreenManager';
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
import { DifficultyCalculator } from '../systems/DifficultyCalculator';
import { DynamicDifficultyManager } from '../systems/DynamicDifficultyManager';
import { CrisisEventManager } from './crisis/CrisisEventManager';
import { GlitchEventManager } from './glitch/GlitchEventManager';
import { PowerUpManager } from './powerups/PowerUpManager';
import { BossManager } from './boss/BossManager';
import { BaseBoss, BossSubUnit } from './boss/BaseBoss';
import { AlliesManager } from './allies/AlliesManager';
import { SpecialMovesManager } from './specials/SpecialMovesManager';
import { SpecialMoveType } from './specials/types';
import { PowerUpType } from './powerups/types';
import { GalagaCheatController } from './qa/GalagaCheatController';
import { HUD } from '../ui/HUD';
import { BottomDashboard, type DashboardState, type ActivePowerUpTelemetry } from '../ui/BottomDashboard';
import { Screens, type ScreenRenderContext } from '../ui/Screens';
import { EnemyType, EnemyState } from '../types';
import type { GameState, IGameEngine, Rect, VirtualResolution, PlayerId } from '../types';
import { PlayerManager } from '../systems/PlayerManager';

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
  public canvas: HTMLCanvasElement | null;
  public ctx: CanvasRenderingContext2D;

  // Subsystems
  public screenManager: ScreenManager;
  public fullscreenManager: FullscreenManager;
  public gameLoop: GameLoop;
  public starfield: Starfield;
  public inputHandler: InputHandler;
  public playerManager!: PlayerManager;

  public get player(): Player {
    return this.playerManager.getPlayer('p1')!;
  }
  public set player(p: Player) {
    this.setupPlayerCallbacks(p);
    this.playerManager.setPlayer('p1', p);
  }
  public get players(): Player[] {
    return this.playerManager.getPlayers();
  }
  public getPlayer(id?: 'p1'): Player;
  public getPlayer(id: 'p2'): Player | undefined;
  public getPlayer(id?: PlayerId): Player | undefined;
  public getPlayer(id: PlayerId = 'p1'): Player | undefined {
    if (id === 'p1') {
      return this.playerManager.getPlayer('p1')!;
    }
    return this.playerManager.getPlayer(id);
  }

  public isCoop(): boolean {
    return this.playerManager.isCoop();
  }
  public setCoopMode(enabled: boolean): void {
    const mode = enabled ? 'coop' : 'single';
    this.playerManager.setMode(mode);
    this.inputHandler.setMode(mode);
  }

  public bulletManager: BulletManager;
  public formationManager: FormationManager;
  public tractorBeam: TractorBeam;
  public audioContextManager: AudioContextManager;
  public soundSynth: SoundSynth;
  public particleSystem: ParticleSystem;
  public scoreManager: ScoreManager;
  public hud: HUD;
  public crisisEventManager: CrisisEventManager;
  public glitchEventManager: GlitchEventManager;
  public powerUpManager: PowerUpManager;
  public bossManager: BossManager;
  public alliesManager: AlliesManager;
  public specialMovesManager: SpecialMovesManager;
  public dynamicDifficultyManager: DynamicDifficultyManager;
  public cheatController: GalagaCheatController;
  public bottomDashboard: BottomDashboard;
  private _dashboardState: DashboardState;

  // Screen Shake Camera System (Milestone 14)
  public shakeIntensity: number = 0;
  public shakeDuration: number = 0;
  public shakeTimer: number = 0;
  public shakeOffsetX: number = 0;
  public shakeOffsetY: number = 0;

  // Core Game State
  public state: GameState = 'BOOT';
  public previousState: GameState | null = null;

  // State Timing & Visual Accumulators
  public stateTimer: number = 0;
  public blinkTimer: number = 0;
  private isInitialized: boolean = false;

  // Zero-GC Scratch Buffers & Lifecycle Callbacks
  private fullscreenUnbindCallback: (() => void) | null = null;
  private readonly _prevPlayerX: number[] = [0, 0];
  private readonly _scratchChronoField = { x: 0, y: 0, radiusSq: 14400, slowFactor: 0.40 };
  private readonly _hudRenderState = {
    score: 0,
    highScore: 0,
    lives: 3,
    stage: 1,
    is1UpBlinking: false,
    specialEnergy: 0,
    isSpecialReady: false,
    selectedSpecial: 'NOVA_BARRAGE' as any,
  };
  private readonly _screenRenderCtx: ScreenRenderContext = {
    ctx: null as any,
    width: 0,
    height: 0,
    stateTimer: 0,
    blinkTimer: 0,
    score: 0,
    highScore: 0,
    stage: 1,
    lives: 3,
    shotsFired: 0,
    hits: 0,
    challengingHits: 0,
    isDual: false,
    isCoop: false,
    p1Score: 0,
    p2Score: 0,
  };

  public get enemyPool() {
    return this.formationManager.getEnemyPool();
  }

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
      const baseMock: Record<string | symbol, any> = {
        canvas: this.canvas,
        fillStyle: '#000000',
        strokeStyle: '#FFFFFF',
        font: '8px monospace',
        textAlign: 'center',
        textBaseline: 'middle',
        direction: 'inherit',
        globalAlpha: 1.0,
        globalCompositeOperation: 'source-over',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        miterLimit: 10,
        lineDashOffset: 0,
        shadowBlur: 0,
        shadowColor: '#000000',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        filter: 'none',
        fillRect: () => {},
        strokeRect: () => {},
        clearRect: () => {},
        fillText: () => {},
        strokeText: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        bezierCurveTo: () => {},
        arc: () => {},
        arcTo: () => {},
        ellipse: () => {},
        rect: () => {},
        roundRect: () => {},
        fill: () => {},
        stroke: () => {},
        clip: () => {},
        isPointInPath: () => false,
        isPointInStroke: () => false,
        save: () => {},
        restore: () => {},
        reset: () => {},
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        getTransform: () =>
          typeof DOMMatrix !== 'undefined'
            ? new DOMMatrix()
            : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        setLineDash: () => {},
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createConicGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        createImageData: () => ({ width: 0, height: 0, data: new Uint8ClampedArray(0) }),
        getImageData: () => ({ width: 0, height: 0, data: new Uint8ClampedArray(0) }),
        putImageData: () => {},
        measureText: () => ({
          width: 0,
          actualBoundingBoxAscent: 0,
          actualBoundingBoxDescent: 0,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: 0,
          fontBoundingBoxAscent: 0,
          fontBoundingBoxDescent: 0,
        }),
      };

      this.ctx = new Proxy(baseMock, {
        get(target: any, prop: string | symbol) {
          if (prop in target) {
            return target[prop];
          }
          if (prop === 'then') {
            return undefined;
          }
          return () => {};
        },
      }) as unknown as CanvasRenderingContext2D;
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

    // 6. Initialize Screen, Fullscreen, Starfield & Input Subsystems
    this.screenManager = new ScreenManager(this.canvas, Game.VIRTUAL_WIDTH, Game.VIRTUAL_HEIGHT);
    this.fullscreenManager = new FullscreenManager({
      target: '#app-container',
      screenManager: this.screenManager,
      bindKeyboardShortcut: true,
    });
    if (typeof document !== 'undefined') {
      const btnFullscreen = document.getElementById('btn-fullscreen');
      if (btnFullscreen) {
        this.fullscreenUnbindCallback = this.fullscreenManager.bindToggleButton(btnFullscreen);
      }
    }
    this.starfield = new Starfield(Game.VIRTUAL_WIDTH, Game.VIRTUAL_HEIGHT);
    this.inputHandler = new InputHandler(this.canvas!, this.screenManager, () => this.unlockAudio());

    // 7. Initialize Player & Bullet Subsystems
    this.bulletManager = new BulletManager({
      onBulletRecycle: () => {
        const p1 = this.playerManager?.getPlayer('p1');
        if (p1) {
          p1.activeMissileCount = this.bulletManager.getPlayerBulletCount('p1');
        }
        const p2 = this.playerManager?.getPlayer('p2');
        if (p2) {
          p2.activeMissileCount = this.bulletManager.getPlayerBulletCount('p2');
        }
      },
    });

    this.playerManager = new PlayerManager(this, 'single', (player) => {
      this.setupPlayerCallbacks(player);
    });

    // Wire extra life callback to add life to player and trigger audio
    this.scoreManager.onExtraLife((count: number, playerId?: PlayerId) => {
      const p = this.getPlayer(playerId ?? 'p1');
      if (p) {
        p.lives += count;
      }
      MusicJingles.playDockingJingle();
    });

    // 8. Initialize TractorBeam Subsystem
    this.tractorBeam = new TractorBeam();

    // 8.5 Initialize Boss Subsystem
    this.bossManager = new BossManager(this);

    // 8.6 Initialize Dynamic Difficulty Adjustment (DDA) Engine
    this.dynamicDifficultyManager = new DynamicDifficultyManager();

    // 9. Initialize FormationManager Subsystem
    this.formationManager = new FormationManager({
      dynamicDifficultyManager: this.dynamicDifficultyManager,
      isCoop: () => this.isCoop(),
      playerManager: this.playerManager,
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
        this.crisisEventManager.onStageClear();
        this.glitchEventManager?.onStageClear();
        this.dynamicDifficultyManager?.onStageClear(this.stage);
        if (this.powerUpManager) {
          this.powerUpManager.reset();
        }
        if (this.bossManager) {
          this.bossManager.onStageClear();
        }
        if (this.alliesManager) {
          this.alliesManager.onStageClear();
        }
        if (this.specialMovesManager) {
          this.specialMovesManager.onStageClear();
        }
        this.playerManager.onStageClear();
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
      onSpawnBoss: (stage) => {
        const boss = this.bossManager.spawnBoss(stage);
        if (boss) {
          return [boss, ...boss.subUnits];
        }
        return [];
      },
    });

    // 9.5 Initialize Crisis Event Subsystem
    this.crisisEventManager = new CrisisEventManager(this);

    // 9.55 Initialize Glitch Event Subsystem
    this.glitchEventManager = new GlitchEventManager(this);
    this.formationManager.glitchEventManager = this.glitchEventManager;

    // 9.6 Initialize PowerUp Subsystem
    this.powerUpManager = new PowerUpManager({ game: this });

    // 9.7 Initialize Allies Support Subsystem & Special Moves
    this.alliesManager = new AlliesManager(this);
    this.specialMovesManager = new SpecialMovesManager(this);

    // 9.8 Initialize QA Cheat Controller
    this.cheatController = new GalagaCheatController(this);

    // 9.9 Initialize Modernized Bottom HUD & Dashboard Panel (Milestone M28)
    const powerUpSlots: ActivePowerUpTelemetry[] = [
      { type: PowerUpType.RAPID_FIRE, id: 'rapid', label: 'OVERCLOCK', maxDuration: 15, primaryColor: '#FF7F00', accentColor: '#FFFF00', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.KINETIC_SHIELD, id: 'shield', label: 'SHIELD', maxDuration: 1, primaryColor: '#00FFFF', accentColor: '#5B93FF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.SCATTER_SHOT, id: 'scatter', label: 'SPREAD', maxDuration: 15, primaryColor: '#00E700', accentColor: '#FFFFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.ENGINE_BOOSTER, id: 'booster', label: 'BOOSTER', maxDuration: 15, primaryColor: '#5B93FF', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.CHRONO_FIELD, id: 'chrono', label: 'CHRONO', maxDuration: 6, primaryColor: '#00FFFF', accentColor: '#FFBF00', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.REFLECTION_SHIELD, id: 'reflect', label: 'REFLECT', maxDuration: 12, primaryColor: '#5B93FF', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.EMP_COLLECTOR, id: 'collector', label: 'COLLECTOR', maxDuration: 5, primaryColor: '#BB33FF', accentColor: '#FF007F', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.PHASE_DRIVE, id: 'phase', label: 'PHASE', maxDuration: 15, primaryColor: '#FF007F', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.ANTIMATTER_PLASMA, id: 'plasma', label: 'PLASMA', maxDuration: 7, primaryColor: '#FFFF00', accentColor: '#00E700', remainingTime: 0, progress: 0, isActive: false },
    ];

    const createPlayerSlots = () => [
      { type: PowerUpType.RAPID_FIRE, id: 'rapid', label: 'RAPID', maxDuration: 15, primaryColor: '#FFCC00', accentColor: '#FF6600', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.KINETIC_SHIELD, id: 'shield', label: 'SHIELD', maxDuration: 1, primaryColor: '#00FFFF', accentColor: '#0088FF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.SCATTER_SHOT, id: 'scatter', label: 'SCATTER', maxDuration: 15, primaryColor: '#39FF14', accentColor: '#00AA00', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.ENGINE_BOOSTER, id: 'engine', label: 'SPEED', maxDuration: 15, primaryColor: '#FF3366', accentColor: '#CC0033', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.CHRONO_FIELD, id: 'chrono', label: 'CHRONO', maxDuration: 6, primaryColor: '#00FFFF', accentColor: '#FFBF00', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.REFLECTION_SHIELD, id: 'reflect', label: 'REFLECT', maxDuration: 12, primaryColor: '#5B93FF', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.EMP_COLLECTOR, id: 'collector', label: 'COLLECTOR', maxDuration: 5, primaryColor: '#BB33FF', accentColor: '#FF007F', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.PHASE_DRIVE, id: 'phase', label: 'PHASE', maxDuration: 15, primaryColor: '#FF007F', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.ANTIMATTER_PLASMA, id: 'plasma', label: 'PLASMA', maxDuration: 7, primaryColor: '#FFFF00', accentColor: '#00E700', remainingTime: 0, progress: 0, isActive: false },
    ];

    this._dashboardState = {
      score: 0,
      highScore: 20000,
      isNewHighScore: false,
      lives: 3,
      reserveLives: 2,
      stage: 1,
      activePowerUps: powerUpSlots,
      activePowerUpCount: 0,
      specialEnergy: 0,
      specialCharge: 0,
      specialReady: false,
      isSpecialReady: false,
      specialActive: false,
      selectedSpecial: SpecialMoveType.NOVA_BARRAGE,
      isMuted: false,
      isFullscreen: false,
      isPaused: false,
      canPause: false,
      isCoop: false,
      p1: {
        score: 0,
        lives: 3,
        combo: 1,
        specialEnergy: 0,
        specialReady: false,
        selectedSpecial: 'NOVA',
        state: 'normal',
        reviveTimer: 0,
        canDonateLife: false,
        activePowerUps: createPlayerSlots(),
      },
      p2: {
        score: 0,
        lives: 3,
        combo: 1,
        specialEnergy: 0,
        specialReady: false,
        selectedSpecial: 'CHRONO',
        state: 'normal',
        reviveTimer: 0,
        canDonateLife: false,
        activePowerUps: createPlayerSlots(),
      },
    };

    this.bottomDashboard = new BottomDashboard({
      container:
        typeof document !== 'undefined'
          ? document.getElementById('bottom-dashboard') || document.getElementById('app-container')
          : null,
      onToggleMute: () => this.audioContextManager?.toggleMute(),
      onToggleFullscreen: () => this.fullscreenManager?.toggleFullscreen(),
      onTogglePause: () => this.togglePause(),
      onTriggerSpecial: () => this.specialMovesManager?.trigger(),
      onCycleSpecial: () => this.specialMovesManager?.cycleSpecial(),
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
      this.audioContextManager?.suspend();
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
      this.audioContextManager?.resume();
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
    if (this.fullscreenUnbindCallback) {
      this.fullscreenUnbindCallback();
      this.fullscreenUnbindCallback = null;
    }
    this.audioContextManager?.detachAutoUnlockListeners();
    if (this.crisisEventManager) {
      this.crisisEventManager.destroy();
    }
    if (this.glitchEventManager) {
      this.glitchEventManager.clearGlitch();
    }
    if (this.powerUpManager) {
      this.powerUpManager.reset();
    }
    if (this.bossManager) {
      this.bossManager.reset();
    }
    if (this.alliesManager) {
      this.alliesManager.reset();
    }
    if (this.specialMovesManager) {
      this.specialMovesManager.reset();
    }
    if (this.cheatController) {
      this.cheatController.destroy();
    }
    if (this.fullscreenManager) {
      this.fullscreenManager.destroy();
    }
    if (this.bottomDashboard) {
      this.bottomDashboard.destroy();
    }
    this.screenManager.destroy();
    this.inputHandler.destroy();
    this.bulletManager.clear();
    this.formationManager.reset();
    this.tractorBeam.reset();
    this.particleSystem.clear();
    this.soundSynth.stopAll();
    MusicJingles.stopAll();
    this.isInitialized = false;
    this.canvas = null;
  }

  public getCrisisEventManager(): CrisisEventManager {
    return this.crisisEventManager;
  }

  public getPowerUpManager(): PowerUpManager {
    return this.powerUpManager;
  }

  public getBossManager(): BossManager {
    return this.bossManager;
  }

  public getCheatController(): GalagaCheatController {
    return this.cheatController;
  }

  public skipToStage(stage: number): boolean {
    return this.cheatController ? this.cheatController.skipToStage(stage) : false;
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
        if (this.crisisEventManager) {
          this.crisisEventManager.reset();
        }
        if (this.powerUpManager) {
          this.powerUpManager.reset();
        }
        if (this.bossManager) {
          this.bossManager.reset();
        }
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
        this.bulletManager.clear();
        this.powerUpManager?.reset();
        if (this.bossManager) {
          this.bossManager.onStageClear();
        }
        if (this.alliesManager) {
          this.alliesManager.onStageClear();
        }
        break;
      case 'GAME_OVER':
        this.starfield.setSpeedState('NORMAL');
        this.tractorBeam.reset();
        this.soundSynth.stopTractorBeam();
        MusicJingles.playGameOverTune();
        this.scoreManager.saveHighScore();
        this.bulletManager.clear();
        this.particleSystem.clear();
        this.formationManager.reset();
        if (this.glitchEventManager) {
          this.glitchEventManager.reset();
        }
        if (this.crisisEventManager) {
          this.crisisEventManager.reset();
        }
        if (this.powerUpManager) {
          this.powerUpManager.reset();
        }
        if (this.bossManager) {
          this.bossManager.reset();
        }
        if (this.alliesManager) {
          this.alliesManager.reset();
        }
        if (this.specialMovesManager) {
          this.specialMovesManager.reset();
        }
        break;
      case 'PAUSED':
        this.starfield.setSpeedState('PAUSED');
        break;
    }
  }

  public startGame(): void {
    if (this.glitchEventManager) {
      this.glitchEventManager.reset();
    }
    if (this.crisisEventManager) {
      this.crisisEventManager.reset();
    }
    if (this.powerUpManager) {
      this.powerUpManager.reset();
    }
    if (this.bossManager) {
      this.bossManager.reset();
    }
    if (this.alliesManager) {
      this.alliesManager.reset();
    }
    if (this.specialMovesManager) {
      this.specialMovesManager.reset();
    }
    if (this.dynamicDifficultyManager) {
      this.dynamicDifficultyManager.reset();
      this.dynamicDifficultyManager.onStageStart(1);
    }
    this.scoreManager.reset(3, 1);
    this.bulletManager.clear();
    this.playerManager.reset();
    this.formationManager.spawnStage(1);
    this.tractorBeam.reset();
    this.particleSystem.clear();
    this.setState('STAGE_INTRO');
  }

  public isChallengingStage(stageNum: number = this.stage): boolean {
    return DifficultyCalculator.isChallengingStage(stageNum);
  }

  // ==========================================================================
  // Screen Shake Camera Controller
  // ==========================================================================

  public triggerScreenShake(intensity: number = 1.5, duration: number = 0.5): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = 0;
  }

  public updateScreenShake(dt: number): void {
    if (this.shakeTimer < this.shakeDuration) {
      this.shakeTimer += dt;
      const decay = Math.max(0, 1.0 - this.shakeTimer / this.shakeDuration);
      const amp = this.shakeIntensity * decay;
      this.shakeOffsetX = Math.round((Math.random() - 0.5) * 2 * amp) || 0;
      this.shakeOffsetY = Math.round((Math.random() - 0.5) * 2 * amp) || 0;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
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

    // Update Bottom HUD & Dashboard Bar Telemetry (Milestone M28)
    this.updateDashboardTelemetry();
    if (this.bottomDashboard) {
      this.bottomDashboard.update(this._dashboardState);
    }

    if (this.state === 'PAUSED') {
      return;
    }

    // Calculate effective enemy delta-time (Chrono Freeze absolute time stop)
    const isFrozen = this.specialMovesManager ? this.specialMovesManager.isChronoFreezeActive() : false;
    const enemyDt = isFrozen ? 0 : dt;

    // Update screen shake camera decay
    this.updateScreenShake(dt);

    // Update background starfield (frozen if Chrono Freeze active)
    this.starfield.setChronoFrozen(isFrozen);
    this.starfield.update(dt);

    // Update particle effects
    this.particleSystem.update(dt);

    // Update projectiles (player missiles move normally, enemy bullets freeze if enemyDt == 0, slowed if in Chrono Field)
    const p1 = this.playerManager.getPlayer('p1');
    const p2 = this.playerManager.getPlayer('p2');
    let chronoField: typeof this._scratchChronoField | undefined;
    if (p1?.hasChronoField) {
      this._scratchChronoField.x = p1.x;
      this._scratchChronoField.y = p1.y;
      chronoField = this._scratchChronoField;
    } else if (p2?.hasChronoField) {
      this._scratchChronoField.x = p2.x;
      this._scratchChronoField.y = p2.y;
      chronoField = this._scratchChronoField;
    }
    this.bulletManager.update(dt, enemyDt, chronoField);
    for (const p of this.playerManager.getPlayers()) {
      p.activeMissileCount = this.bulletManager.getPlayerBulletCount(p.id);
      p.score = this.scoreManager.getScore(p.id);
    }

    // Update Dynamic Difficulty Adjustment (DDA) Engine
    if (this.dynamicDifficultyManager) {
      this.dynamicDifficultyManager.update(dt, this.player ? this.player.lives : 3, this.scoreManager.score);
    }

    // Update active crisis & glitch events and warning timers
    if (this.state === 'PLAYING' || this.state === 'STAGE_INTRO') {
      this.crisisEventManager.update(dt);
      this.glitchEventManager?.update(dt);
    }

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
    if (this.inputHandler.consumeAction('select1P' as any)) {
      this.setCoopMode(false);
    } else if (this.inputHandler.consumeAction('select2P' as any)) {
      this.setCoopMode(true);
    }

    const pointer = this.inputHandler.consumePointerTap();
    if (pointer) {
      if (pointer.y >= 84 && pointer.y < 98) {
        this.setCoopMode(false);
      } else if (pointer.y >= 98 && pointer.y <= 112) {
        this.setCoopMode(true);
      } else if (pointer.y > 112) {
        this.startGame();
        return;
      }
    }

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
      for (const p of this.playerManager.getPlayers()) {
        p.respawn();
      }
      if (this.formationManager.enemies.length === 0) {
        this.formationManager.spawnStage(this.stage);
      }
      if (this.isChallengingStage(this.stage)) {
        this.scoreManager.resetChallengingHits();
        this.setState('CHALLENGING_STAGE');
      } else {
        this.setState('PLAYING');
        this.crisisEventManager.evaluateStageTrigger(this.stage);
        this.glitchEventManager?.evaluateStageTrigger(this.stage);
      }
      this.dynamicDifficultyManager?.onStageStart(this.stage);
    }
  }

  private updatePlaying(dt: number): void {
    // 0. Handle Special Move Inputs
    for (const pId of ['p1', 'p2'] as const) {
      if (
        this.inputHandler.consumeAction('special', pId) ||
        this.inputHandler.consumeAction('specialMove', pId) ||
        (!this.isCoop() && pId === 'p1' && (this.inputHandler.consumeAction('special' as any) || this.inputHandler.consumeAction('specialMove' as any)))
      ) {
        this.specialMovesManager?.trigger(undefined, pId);
      }
      if (
        this.inputHandler.consumeAction('cycleSpecial', pId) ||
        (!this.isCoop() && pId === 'p1' && this.inputHandler.consumeAction('cycleSpecial' as any))
      ) {
        this.specialMovesManager?.cycleSpecial();
      }
    }

    // Handle Co-op Life Donation Inputs
    if (this.inputHandler.consumeAction('donateLife' as any, 'p1')) {
      if (!this.playerManager.donateLife('p1')) {
        this.playerManager.donateLife('p2');
      }
    }
    if (this.inputHandler.consumeAction('donateLife' as any, 'p2')) {
      if (!this.playerManager.donateLife('p2')) {
        this.playerManager.donateLife('p1');
      }
    }

    const inputs = this.isCoop()
      ? this.inputHandler.getDualInputState()
      : this.inputHandler.getState();
    const players = this.playerManager.getPlayers();
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p) {
        this._prevPlayerX[i] = p.x;
      }
    }

    this.playerManager.update(dt, inputs);

    if (this.isCoop() && this.playerManager.areAllPlayersDead()) {
      this.setState('GAME_OVER');
      return;
    }

    // Calculate effective enemy delta-time (frozen if Chrono Freeze is active)
    const isFrozen = this.specialMovesManager ? this.specialMovesManager.isChronoFreezeActive() : false;
    const enemyDt = isFrozen ? 0 : dt;

    // Apply Telekinetic Stun thruster disruption (Stage 40)
    if (this.bossManager && this.bossManager.playerStunTimer > 0) {
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p) {
          const prevX = this._prevPlayerX[i] ?? p.x;
          p.x = prevX + (p.x - prevX) * 0.25;
        }
      }
    }

    if (this.bossManager) {
      this.bossManager.update(enemyDt, this.player.x, this.player.y);
      if (this.bossManager.activeBoss) {
        for (const sub of this.bossManager.activeBoss.subUnits) {
          if (sub.active && !this.formationManager.enemies.includes(sub)) {
            this.formationManager.addEnemy(sub);
          }
        }
      }
    }

    this.powerUpManager.update(dt, this.playerManager.getPlayers());
    this.formationManager.update(enemyDt, this.player.x, this.player.y, this.player.isDual);
    this.tractorBeam.update(enemyDt);

    // Allies Support & Special Moves update
    if (this.alliesManager) {
      this.alliesManager.update(dt);
      this.alliesManager.checkMilestones(this.scoreManager.score, this.stage);
    }
    if (this.specialMovesManager) {
      this.specialMovesManager.update(dt);
    }

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

  public setupPlayerCallbacks(player: Player): void {
    const pId = player.id;

    player.onFire = (spawns) => {
      const quota = player.getMaxMissileQuota();
      for (const s of spawns) {
        this.bulletManager.firePlayerBullet(
          s.x,
          s.y,
          player.isDual,
          Math.abs(s.vy),
          s.vx,
          s.vy,
          quota,
          pId
        );
        this.scoreManager.recordShotFired(1, pId);
        this.dynamicDifficultyManager?.recordShotFired(1);
      }
      player.activeMissileCount = this.bulletManager.getPlayerBulletCount(pId);

      // Audio Trigger: Player laser fire
      if (player.isDual) {
        this.soundSynth.playLaserDual();
      } else {
        this.soundSynth.playLaser();
      }
    };

    player.onShieldDeflect = (x, y) => {
      this.soundSynth.playBossHit();
      this.particleSystem.spawnHitSparks(x, y);
      this.dynamicDifficultyManager?.recordPlayerDamage(false);
    };

    player.onReflectionDeflect = (x, y) => {
      this.soundSynth.playReflectionDeflect();
      this.particleSystem.spawnHitSparks(x, y);
      this.dynamicDifficultyManager?.recordPlayerDamage(false);

      let targetX = x;
      let targetY = y - 100;
      let minDistSq = Infinity;

      for (const enemy of this.formationManager.enemies) {
        if (enemy.active) {
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          const dSq = dx * dx + dy * dy;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            targetX = enemy.x;
            targetY = enemy.y;
          }
        }
      }

      if (this.bossManager?.activeBoss?.active) {
        const boss = this.bossManager.activeBoss;
        const dx = boss.x - x;
        const dy = boss.y - y;
        const dSq = dx * dx + dy * dy;
        if (dSq < minDistSq) {
          targetX = boss.x;
          targetY = boss.y;
        }
      }

      this.bulletManager.fireReflectionMissile(x, y - 6, targetX, targetY, 600);
    };

    player.onPlasmaBeamTick = (x, y, isDual) => {
      this.resolvePlasmaBeamDamage(x, y, isDual, pId);
    };

    player.onExplode = (_x, _y, isPartial) => {
      this.dynamicDifficultyManager?.recordPlayerDamage(!isPartial);
      if (!isPartial) {
        this.powerUpManager?.onPlayerDeath(player);
      }
    };

    player.onGameOver = () => {
      if (!this.isCoop() || this.playerManager.areAllPlayersDead()) {
        this.setState('GAME_OVER');
      }
    };

    player.onCapturedComplete = (targetX, targetY) => {
      this.handlePlayerCaptured(targetX, targetY, player);
      this.powerUpManager?.onPlayerDeath(player);
    };

    player.onDocked = () => {
      this.scoreManager.addScore(1000, pId);
      MusicJingles.playDockingJingle();
      this.particleSystem.spawnDockingSparkles(player.x, player.y);
    };
  }

  public handlePlayerCaptured(targetX: number, targetY: number, _capturedPlayer?: Player): void {
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
      if (_capturedPlayer) {
        escort.originalOwnerId = _capturedPlayer.id;
      }
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
      this.particleSystem.clear();
      if (this.alliesManager) {
        this.alliesManager.onStageClear();
      }
      if (this.specialMovesManager) {
        this.specialMovesManager.onStageClear();
      }
      if (this.powerUpManager) {
        this.powerUpManager.reset();
      }
      this.playerManager.onStageClear();
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

        // Clamp player missile collision to on-screen enemies (y in [0, VIRTUAL_HEIGHT])
        if (enemy.y < 0 || enemy.y > Game.VIRTUAL_HEIGHT) {
          continue;
        }

        const enemyBox = enemy.getHitbox();

        if (checkAABB(bulletBox, enemyBox)) {
          const ownerId: PlayerId = (bullet.ownerId === 'p2' ? 'p2' : 'p1') as PlayerId;
          this.bulletManager.recycle(bullet);
          this.scoreManager.recordShotHit(1, ownerId);
          this.dynamicDifficultyManager?.recordShotHit(1);

          if (this.state === 'CHALLENGING_STAGE') {
            this.scoreManager.recordChallengingHit(1, ownerId);
          }

          // Case 0: Shooting Epic Multi-Phase Boss
          if (enemy instanceof BaseBoss) {
            const damageResult = enemy.takeDamage(1);
            if (damageResult.destroyed) {
              this.soundSynth.playExplosion('boss');
              this.particleSystem.spawnBossExplosion(enemy.x, enemy.y);
              if (this.specialMovesManager) {
                this.specialMovesManager.addEnergy(10);
                this.specialMovesManager.spawnSpark(enemy.x, enemy.y);
              }
            } else {
              this.soundSynth.playBossHit();
              this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
            }
          }
          // Case 0.5: Shooting Epic Boss Sub-Unit
          else if (enemy instanceof BossSubUnit) {
            const damageResult = enemy.takeDamage(1);
            if (damageResult.destroyed) {
              this.soundSynth.playExplosion('small');
              this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
              this.scoreManager.addScore(damageResult.points, ownerId);
              if (this.specialMovesManager) {
                this.specialMovesManager.addEnergy(3);
                this.specialMovesManager.spawnSpark(enemy.x, enemy.y);
              }
            } else {
              this.soundSynth.playBossHit();
              this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
            }
          }
          // Case A: Shooting Boss Galaga
          else if (enemy.type === EnemyType.BOSS) {
            const isDiving =
              enemy.state === EnemyState.DIVING_SOLO ||
              enemy.state === EnemyState.DIVING_ESCORT ||
              enemy.state === EnemyState.TRACTOR_BEAM_ACTIVE;

            const damageResult = enemy.takeDamage(1);

            if (damageResult.destroyed) {
              // Boss Destruction Audio & Visual Particle Burst
              this.soundSynth.playExplosion('boss');
              this.particleSystem.spawnBossExplosion(enemy.x, enemy.y);

              // Reward Special Energy & Spark
              if (this.specialMovesManager) {
                this.specialMovesManager.addEnergy(5);
                this.specialMovesManager.spawnSpark(enemy.x, enemy.y);
              }

              // Check for attached Captured Fighter Escort
              if (enemy.hasCapturedFighter && enemy.capturedFighterEnemy) {
                const capturedFighter = enemy.capturedFighterEnemy;
                const captiveOwnerId = capturedFighter.originalOwnerId ?? 'p1';
                const captivePlayer = this.playerManager.getPlayer(captiveOwnerId);
                const killerId: PlayerId = ownerId ?? 'p1';
                const killerPlayer = this.playerManager.getPlayer(killerId);

                if (isDiving) {
                  // SUCCESSFUL RESCUE FLOW
                  capturedFighter.active = false;
                  capturedFighter.state = EnemyState.INACTIVE;
                  this.scoreManager.addScore(1000, killerId); // Rescue bonus to rescuer

                  // Case A: Captive player was Downed / Captured (0 lives, revive_pending, or captured)
                  if (
                    captivePlayer &&
                    (captivePlayer.lives === 0 ||
                      captivePlayer.state === 'revive_pending' ||
                      captivePlayer.state === 'captured' ||
                      captivePlayer.state === 'eliminated')
                  ) {
                    captivePlayer.lives = 1;
                    this.scoreManager.setLives(1, captiveOwnerId);
                    captivePlayer.startRescue(enemy.x, enemy.y);
                    captivePlayer.onDocked = () => {
                      captivePlayer.state = 'normal';
                      captivePlayer.invulnerableTimer = 2.0;
                      this.scoreManager.addScore(1000, captiveOwnerId);
                      MusicJingles.playDockingJingle();
                      this.particleSystem.spawnDockingSparkles(captivePlayer.x, captivePlayer.y);
                    };
                  }
                  // Case B: Rescuer (killer) is alive and not dual -> Killer docks to form Dual Fighter!
                  else if (killerPlayer && killerPlayer.isAlive() && !killerPlayer.isDual) {
                    killerPlayer.startRescue(enemy.x, enemy.y);
                  }
                  // Case C: Captive player is alive on screen and not dual
                  else if (captivePlayer && captivePlayer.isAlive() && !captivePlayer.isDual) {
                    captivePlayer.startRescue(enemy.x, enemy.y);
                  }

                  MusicJingles.playDockingJingle();
                } else {
                  // TURNCOAT DIVERGENCE FLOW (Destroyed in formation)
                  capturedFighter.state = EnemyState.CAPTURED_HOSTILE;
                  capturedFighter.escortBoss = null;
                  capturedFighter.escortBossId = null;
                  const target = this.playerManager.getLivingPlayers()[0];
                  this.formationManager.peelOffSolo(capturedFighter, target ? target.x : this.player.x);
                }

                enemy.hasCapturedFighter = false;
                enemy.capturedFighterEnemy = null;
              }

              // If Boss was emitting tractor beam, collapse beam immediately
              if (this.tractorBeam.isActive() && this.tractorBeam.getBoss() === enemy) {
                this.tractorBeam.deactivate(true);
                this.soundSynth.playTractorBeam(false);
                for (const p of this.playerManager.getPlayers()) {
                  if (p.state === 'capturing' || (p.state as any) === 'CAPTURING') {
                    p.cancelCapture?.();
                  }
                }
              }

              this.scoreManager.addScoreForEnemy(enemy.type, isDiving, enemy.escortCount, ownerId);
              this.powerUpManager.spawnDrop(enemy.x, enemy.y, this.stage, enemy.type, isDiving);
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
              this.scoreManager.addScoreForCapturedFighter(isDiving, ownerId);
              this.powerUpManager.spawnDrop(enemy.x, enemy.y, this.stage, enemy.type, isDiving);

              if (this.specialMovesManager) {
                this.specialMovesManager.addEnergy(2);
                this.specialMovesManager.spawnSpark(enemy.x, enemy.y);
              }

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
              this.scoreManager.addScoreForEnemy(enemy.type, isDiving, 0, ownerId);
              this.powerUpManager.spawnDrop(enemy.x, enemy.y, this.stage, enemy.type, isDiving);

              if (enemy.canSpawnMirageClone) {
                this.formationManager.spawnMirageClones(enemy.x, enemy.y, enemy.type);
                this.soundSynth.playGlitchFrequencyChirp({ volume: 0.4 });
              }

              if (this.specialMovesManager) {
                this.specialMovesManager.addEnergy(2);
                if (Math.random() < 0.35) {
                  this.specialMovesManager.spawnSpark(enemy.x, enemy.y);
                }
              }
            } else if (damageResult.shieldAbsorbed || damageResult.wasDamaged) {
              this.soundSynth.playBossHit();
              this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
            }
          }

          break; // One bullet hits one enemy
        }
      }
    });

    // 1.2 Player Missiles vs Phantom Decoy Clones (Absorbs bullet, 0 score)
    this.formationManager.forEachActivePhantom((phantom) => {
      if (!phantom.active) return;
      const phantomBox = phantom.getHitbox();
      this.bulletManager.forEachActivePlayerBullet((bullet) => {
        if (!bullet.active) return;
        const bulletBox = bullet.getSweptHitbox();
        if (checkAABB(bulletBox, phantomBox)) {
          this.bulletManager.recycle(bullet);
          phantom.takeDamage(1);
          this.soundSynth.playGlitchBuzz({ volume: 0.35 });
          this.particleSystem.spawnHitSparks(phantom.x, phantom.y);
        }
      });
    });

    // 1.5 Allies Support Subsystem Collisions (Cluster Bombs & Bomb Explosions)
    if (this.alliesManager) {
      this.alliesManager.resolveCollisions(livingEnemies, this.bossManager);
    }

    // 1.6 Special Moves Subsystem Collisions (Nova Missiles, Warp Ram, Sparks collection)
    if (this.specialMovesManager) {
      this.specialMovesManager.resolveCollisions(livingEnemies, this.bossManager);
    }

    // Check invulnerability against external hazards (including Warp Ram absolute invulnerability)
    const isWarpRamming = this.specialMovesManager ? this.specialMovesManager.isWarpRamActive() : false;

    // 2. Tractor Beam Cone vs Player Ships (Capture Trigger)
    if (this.tractorBeam.isActive() && this.tractorBeam.canCapture()) {
      for (const p of this.playerManager.getPlayers()) {
        const isPlayerVulnerable =
          !isWarpRamming &&
          !p.isInvulnerable() &&
          (p.state === 'normal' || p.state === 'ALIVE') &&
          !p.isDual;

        if (isPlayerVulnerable) {
          const playerBox = p.getHitbox();
          const inBeam =
            this.tractorBeam.containsPoint(p.x, p.y) ||
            this.tractorBeam.intersectsAABB(playerBox);

          if (inBeam) {
            const boss = this.tractorBeam.getBoss();
            if (boss) {
              this.tractorBeam.startCapture(p);
              p.startCapture(boss.x, boss.y);
              break; // Beam captures at most one player at a time
            }
          }
        }
      }
    }

    // 3. Enemy Bullets vs Player Ships
    for (const p of this.playerManager.getPlayers()) {
      const s = p.state;
      const isPlayerVulnerable =
        !isWarpRamming &&
        !p.isInvulnerable() &&
        (s === 'normal' ||
          s === 'ALIVE' ||
          s === 'dual' ||
          s === 'DUAL' ||
          s === 'docking' ||
          s === 'DOCKING');

      if (isPlayerVulnerable) {
        this.bulletManager.forEachActiveEnemyBullet((bullet) => {
          if (!bullet.active) return;

          const bulletBox = bullet.getSweptHitbox();
          const hit = p.hitTestAndDamage(bulletBox);

          if (hit) {
            this.bulletManager.recycle(bullet);
            this.soundSynth.playExplosion('large');
            this.particleSystem.spawnPlayerExplosion(p.x, p.y);
          }
        });
      }
    }

    // 4. Enemy Craft Collisions vs Player Ships (Kamikaze Dive Impact)
    for (const p of this.playerManager.getPlayers()) {
      const s = p.state;
      const isPlayerVulnerable =
        !isWarpRamming &&
        !p.isInvulnerable() &&
        (s === 'normal' ||
          s === 'ALIVE' ||
          s === 'dual' ||
          s === 'DUAL' ||
          s === 'docking' ||
          s === 'DOCKING');

      if (isPlayerVulnerable) {
        for (const enemy of livingEnemies) {
          if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
            continue;
          }

          const enemyBox = enemy.getHitbox();
          const hit = p.hitTestAndDamage(enemyBox);

          if (hit) {
            enemy.takeDamage(99); // Destroy enemy on direct ship collision
            this.soundSynth.playExplosion('large');
            this.particleSystem.spawnPlayerExplosion(p.x, p.y);
            break;
          }
        }
      }
    }

    // 5. Collectible Power-Up Capsules vs Player Ships
    for (const p of this.playerManager.getPlayers()) {
      this.powerUpManager.checkPlayerCollection(p);
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

    // 2. Render World Layers with Camera Screen Shake (z-index: 0-5)
    targetCtx.save();
    if (this.shakeOffsetX !== 0 || this.shakeOffsetY !== 0) {
      targetCtx.translate(this.shakeOffsetX, this.shakeOffsetY);
    }

    // Starfield Layer (z-index: 0)
    this.starfield.render(targetCtx);

    // World-space Active Playfield Layers
    if (this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE' || this.state === 'PAUSED') {
      this.renderPlayingScreen(targetCtx);
    } else if (this.state === 'STAGE_INTRO') {
      this.crisisEventManager.render(targetCtx);
    } else if (this.state === 'STAGE_CLEAR' && !this.isChallengingStage(this.stage)) {
      this.renderStageClearScreen(targetCtx);
    }

    targetCtx.restore();

    // 2.5 Render Touch Guides in Co-op Mode (screen space, fixed)
    if (this.isCoop() && (this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE' || this.state === 'PAUSED' || this.state === 'STAGE_INTRO')) {
      this.inputHandler.renderTouchGuides(targetCtx);
    }

    this._hudRenderState.score = this.scoreManager.score;
    this._hudRenderState.highScore = this.scoreManager.highScore;
    this._hudRenderState.lives = this.player ? this.player.lives : this.scoreManager.lives;
    this._hudRenderState.stage = this.scoreManager.stage;
    this._hudRenderState.is1UpBlinking = this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE';
    this._hudRenderState.specialEnergy = this.specialMovesManager ? this.specialMovesManager.energy : 0;
    this._hudRenderState.isSpecialReady = this.specialMovesManager ? this.specialMovesManager.isReady() : false;
    this._hudRenderState.selectedSpecial = this.specialMovesManager ? this.specialMovesManager.selectedMove : 'NOVA_BARRAGE';

    // 3. Render HUD Score Header (z-index: 6, fixed in screen space)
    this.hud.renderHeader(targetCtx, this._hudRenderState);

    // 3.1 Render Boss HUD Health Bar (fixed in screen space, outside camera shake)
    if (this.bossManager && (this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE' || this.state === 'PAUSED')) {
      this.bossManager.render(targetCtx);
    }

    this._screenRenderCtx.ctx = targetCtx;
    this._screenRenderCtx.width = width;
    this._screenRenderCtx.height = height;
    this._screenRenderCtx.stateTimer = this.stateTimer;
    this._screenRenderCtx.blinkTimer = this.blinkTimer;
    this._screenRenderCtx.score = this.scoreManager.score;
    this._screenRenderCtx.highScore = this.scoreManager.highScore;
    this._screenRenderCtx.stage = this.scoreManager.stage;
    this._screenRenderCtx.lives = this.player ? this.player.lives : this.scoreManager.lives;
    this._screenRenderCtx.shotsFired = this.scoreManager.shotsFired;
    this._screenRenderCtx.hits = this.scoreManager.shotsHit;
    this._screenRenderCtx.challengingHits = this.scoreManager.challengingHits;
    this._screenRenderCtx.isDual = this.player ? this.player.isDual : false;
    this._screenRenderCtx.isCoop = this.isCoop();
    this._screenRenderCtx.p1Score = this.playerManager.getPlayer('p1')?.score ?? this.scoreManager.score;
    this._screenRenderCtx.p2Score = this.playerManager.getPlayer('p2')?.score ?? 0;

    // 4. Render Active Screen State Overlay (z-index: 7, fixed in screen space)
    switch (this.state) {
      case 'TITLE':
        Screens.renderTitleScreen(this._screenRenderCtx);
        break;
      case 'STAGE_INTRO':
        Screens.renderStageIntro(this._screenRenderCtx);
        break;
      case 'STAGE_CLEAR':
        if (this.isChallengingStage(this.stage)) {
          Screens.renderChallengingResults(this._screenRenderCtx);
        }
        break;
      case 'GAME_OVER':
        Screens.renderGameOver(this._screenRenderCtx);
        break;
      case 'PAUSED':
        Screens.renderPauseOverlay(this._screenRenderCtx);
        break;
      default:
        break;
    }

    // 5. Render HUD Footer (Lives & Stage Badges, fixed in screen space)
    this.hud.renderFooter(targetCtx, this._hudRenderState);
  }

  private renderPlayingScreen(ctx: CanvasRenderingContext2D): void {
    // 1. Render Formation Grid & Diving Enemies
    this.formationManager.render(ctx);

    // 2. Render Tractor Beam Energy Cone (underneath ships and bullets)
    this.tractorBeam.render(ctx);

    // 2.5 Render Collectible Power-Up Capsules
    this.powerUpManager.render(ctx);

    // 2.6 Render Allies Support Subsystem (Escort, Aegis, Bomber, Bombs, Explosions)
    if (this.alliesManager) {
      this.alliesManager.render(ctx);
    }

    // 3. Render Active Projectiles
    this.bulletManager.render(ctx);

    // 3.5 Render Special Moves Subsystem (Nova Missiles, Sparks, Warp Trails, Frost Border)
    if (this.specialMovesManager) {
      this.specialMovesManager.render(ctx);
    }

    // 4. Render Particle Explosions & Sparkles (underneath HUD, over entities)
    this.particleSystem.render(ctx);

    // 5. Render Player Ships & Rescued Docking Ships
    this.playerManager.render(ctx);

    // 5.5 Render Crisis Event Visual Overlays & Warning Banner
    this.crisisEventManager.render(ctx);

    // 5.55 Render Glitch Concept Visual Overlays & Raster Tears
    this.glitchEventManager?.render(ctx);

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

  public getFullscreenManager(): FullscreenManager {
    return this.fullscreenManager;
  }

  public async toggleFullscreen(): Promise<boolean> {
    return this.fullscreenManager.toggleFullscreen();
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

  public getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  public getAlliesManager(): AlliesManager {
    return this.alliesManager;
  }

  public getSpecialMovesManager(): SpecialMovesManager {
    return this.specialMovesManager;
  }

  private resolvePlasmaBeamDamage(x: number, y: number, isDual: boolean, playerId: PlayerId = 'p1'): void {
    const beams = isDual ? [x - 8, x + 8] : [x];
    const halfWidth = 6;

    for (const bx of beams) {
      for (const enemy of this.formationManager.enemies) {
        if (!enemy.active) continue;
        if (Math.abs(enemy.x - bx) <= halfWidth + 6 && enemy.y <= y) {
          const damageResult = enemy.takeDamage(1);
          if (damageResult.destroyed) {
            this.soundSynth.playExplosion('small');
            this.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
            this.scoreManager.addScoreForEnemy(enemy.type, true, 0, playerId);
            this.powerUpManager.spawnDrop(enemy.x, enemy.y, this.stage, enemy.type, true);
            if (this.specialMovesManager) {
              this.specialMovesManager.addEnergy(2);
              if (Math.random() < 0.35) {
                this.specialMovesManager.spawnSpark(enemy.x, enemy.y);
              }
            }
          } else {
            this.soundSynth.playBossHit();
            this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
          }
        }
      }

      if (this.bossManager?.activeBoss?.active) {
        const boss = this.bossManager.activeBoss;
        if (Math.abs(boss.x - bx) <= halfWidth + 24 && boss.y <= y) {
          const damageResult = boss.takeDamage(1);
          if (damageResult.destroyed) {
            this.soundSynth.playExplosion('boss');
            this.particleSystem.spawnBossExplosion(boss.x, boss.y);
            this.scoreManager.addScore(damageResult.points, playerId);
            if (this.specialMovesManager) {
              this.specialMovesManager.addEnergy(10);
              this.specialMovesManager.spawnSpark(boss.x, boss.y);
            }
          } else {
            this.soundSynth.playBossHit();
            this.particleSystem.spawnHitSparks(boss.x, boss.y);
          }
        }
      }
    }
  }

  /**
   * Assembles frame telemetry into pre-allocated _dashboardState with Zero-GC allocations.
   */
  private updateDashboardTelemetry(): void {
    const s = this._dashboardState;
    if (!s) return;

    s.score = this.scoreManager ? this.scoreManager.score : 0;
    s.highScore = this.scoreManager ? this.scoreManager.highScore : 20000;
    s.isNewHighScore = s.score > 20000 && s.score >= s.highScore;
    s.lives = this.player ? this.player.lives : (this.scoreManager ? this.scoreManager.lives : 3);
    s.reserveLives = Math.max(0, s.lives - 1);
    s.stage = this.scoreManager ? this.scoreManager.stage : 1;

    // Mutate power-up slots in-place (Zero-GC)
    const buffs = this.powerUpManager ? this.powerUpManager.buffState : null;
    let count = 0;
    const slots = s.activePowerUps as ActivePowerUpTelemetry[];

    if (buffs && slots && slots.length >= 9) {
      const s0 = slots[0];
      const s1 = slots[1];
      const s2 = slots[2];
      const s3 = slots[3];
      const s4 = slots[4];
      const s5 = slots[5];
      const s6 = slots[6];
      const s7 = slots[7];
      const s8 = slots[8];

      if (s0 && s1 && s2 && s3 && s4 && s5 && s6 && s7 && s8) {
        // 0: Rapid Fire
        s0.remainingTime = buffs.rapidFireTimer;
        s0.remainingDuration = buffs.rapidFireTimer;
        s0.progress = Math.min(1.0, buffs.rapidFireTimer / 15.0);
        s0.isActive = buffs.rapidFireTimer > 0;
        if (s0.isActive) count++;

        // 1: Kinetic Shield
        const hasShield = buffs.hasShield || (this.player ? this.player.hasShield : false);
        s1.isActive = hasShield;
        s1.progress = hasShield ? 1.0 : 0.0;
        s1.remainingTime = hasShield ? 1 : 0;
        s1.remainingDuration = hasShield ? 1 : 0;
        if (s1.isActive) count++;

        // 2: Scatter Shot
        s2.remainingTime = buffs.scatterShotTimer;
        s2.remainingDuration = buffs.scatterShotTimer;
        s2.progress = Math.min(1.0, buffs.scatterShotTimer / 15.0);
        s2.isActive = buffs.scatterShotTimer > 0;
        if (s2.isActive) count++;

        // 3: Engine Booster
        s3.remainingTime = buffs.engineBoosterTimer;
        s3.remainingDuration = buffs.engineBoosterTimer;
        s3.progress = Math.min(1.0, buffs.engineBoosterTimer / 15.0);
        s3.isActive = buffs.engineBoosterTimer > 0;
        if (s3.isActive) count++;

        // 4: Chrono Field
        s4.remainingTime = buffs.chronoFieldTimer;
        s4.remainingDuration = buffs.chronoFieldTimer;
        s4.progress = Math.min(1.0, buffs.chronoFieldTimer / 6.0);
        s4.isActive = buffs.chronoFieldTimer > 0;
        if (s4.isActive) count++;

        // 5: Reflection Shield
        const hasReflect =
          buffs.hasReflectionShield ||
          (this.player ? this.player.hasReflectionShield : false) ||
          buffs.reflectionShieldTimer > 0;
        s5.remainingTime = buffs.reflectionShieldTimer;
        s5.remainingDuration = buffs.reflectionShieldTimer;
        s5.progress = Math.min(1.0, buffs.reflectionShieldTimer / 12.0);
        s5.isActive = hasReflect;
        s5.count = this.player ? this.player.reflectionShieldHp : 3;
        if (s5.isActive) count++;

        // 6: EMP Collector
        s6.remainingTime = buffs.empCollectorTimer;
        s6.remainingDuration = buffs.empCollectorTimer;
        s6.progress = Math.min(1.0, buffs.empCollectorTimer / 5.0);
        s6.isActive = buffs.empCollectorTimer > 0;
        if (s6.isActive) count++;

        // 7: Phase Drive
        s7.remainingTime = buffs.phaseDriveTimer;
        s7.remainingDuration = buffs.phaseDriveTimer;
        s7.progress = Math.min(1.0, buffs.phaseDriveTimer / 15.0);
        s7.isActive = buffs.phaseDriveTimer > 0;
        if (s7.isActive) count++;

        // 8: Antimatter Plasma
        s8.remainingTime = buffs.plasmaBlasterTimer;
        s8.remainingDuration = buffs.plasmaBlasterTimer;
        s8.progress = Math.min(1.0, buffs.plasmaBlasterTimer / 7.0);
        s8.isActive = buffs.plasmaBlasterTimer > 0;
        if (s8.isActive) count++;
      }
    }

    s.activePowerUpCount = count;

    // Special moves telemetry
    if (this.specialMovesManager) {
      const charge = (this.specialMovesManager.energy / this.specialMovesManager.maxEnergy) * 100;
      s.specialEnergy = charge;
      s.specialCharge = charge;
      s.isSpecialReady = this.specialMovesManager.isReady();
      s.specialReady = s.isSpecialReady;
      s.specialActive = this.specialMovesManager.isActive;
      s.selectedSpecial = this.specialMovesManager.selectedMove;
    }

    // Utilities
    s.isMuted = this.audioContextManager ? this.audioContextManager.getIsMuted() : false;
    s.isFullscreen = this.fullscreenManager ? this.fullscreenManager.isFullscreen() : false;
    s.isPaused = this.state === 'PAUSED';
    s.canPause = this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE' || this.state === 'PAUSED';

    // Dual-player Co-op Telemetry (Milestone M34)
    const isCoop = this.isCoop();
    s.isCoop = isCoop;

    if (isCoop && this.playerManager) {
      const p1 = this.playerManager.getPlayer('p1');
      const p2 = this.playerManager.getPlayer('p2');

      if (s.p1) {
        s.p1.score = (p1 as any)?.score !== undefined && (p1 as any).score > 0 ? (p1 as any).score : (this.scoreManager ? this.scoreManager.getScore('p1') : s.score);
        s.p1.lives = p1 ? p1.lives : s.lives;
        s.p1.combo = (p1 as any)?.combo ?? 1;
        s.p1.specialEnergy = (p1 as any)?.specialEnergy !== undefined ? (p1 as any).specialEnergy : s.specialEnergy;
        s.p1.specialReady = (p1 as any)?.specialReady !== undefined ? (p1 as any).specialReady : (s.isSpecialReady ?? false);
        s.p1.selectedSpecial = s.selectedSpecial;
        s.p1.state = p1 ? (p1.state as any) : 'normal';
        s.p1.reviveTimer = p1 ? p1.reviveTimer : 0;
        s.p1.canDonateLife = this.playerManager.canDonateLife('p1');
      }

      if (s.p2) {
        s.p2.score = (p2 as any)?.score !== undefined && (p2 as any).score > 0 ? (p2 as any).score : (this.scoreManager ? this.scoreManager.getScore('p2') : 0);
        s.p2.lives = p2 ? p2.lives : 0;
        s.p2.combo = (p2 as any)?.combo ?? 1;
        s.p2.specialEnergy = (p2 as any)?.specialEnergy !== undefined ? (p2 as any).specialEnergy : s.specialEnergy;
        s.p2.specialReady = (p2 as any)?.specialReady !== undefined ? (p2 as any).specialReady : (s.isSpecialReady ?? false);
        s.p2.selectedSpecial = 'CHRONO';
        s.p2.state = p2 ? (p2.state as any) : 'normal';
        s.p2.reviveTimer = p2 ? p2.reviveTimer : 0;
        s.p2.canDonateLife = this.playerManager.canDonateLife('p2');
      }
    }
  }

  public isReady(): boolean {
    return this.isInitialized;
  }
}
