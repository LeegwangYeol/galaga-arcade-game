/**
 * Galaga Arcade Web Game — Milestone M34
 * Symmetrical Dual Bottom Dashboard HUD & Ergonomic Polish Component
 *
 * Implements an authentic arcade-cabinet style bottom dashboard docked beneath the canvas:
 * - Single-Player Mode: Classic 3-zone HUD (Score/High/Lives, Active Power-Ups & Special, Controls & Actions)
 * - Co-op Multiplayer Mode: Symmetrical 3-Zone HUD
 *     * Zone 1 (Left): Player 1 HUD (Score, High Score, Cyan Ships, Power-Ups, Special Gauge, Revive alert)
 *     * Zone 2 (Center): Shared Telemetry (Stage Badge, Shared High Score, Crisis Warning, Quick Controls, Action Buttons)
 *     * Zone 3 (Right): Player 2 HUD (Score, Crimson Ships, Power-Ups, Special Gauge, Revive alert, mirrored)
 *
 * Strict Zero-GC Dirty Checking Engine:
 * 0 DOM mutations and 0 heap allocations per frame when telemetry is steady at 60 FPS.
 */

import { PowerUpType } from '../core/powerups/types';
import {
  BottomDashboardState,
  PlayerDashboardTelemetry,
  PowerUpState,
  PlayerStateType,
} from '../types';

export {
  type PowerUpState,
  type PlayerDashboardTelemetry,
  type BottomDashboardState,
};

export interface PowerUpChipTelemetry {
  id: string;
  type: string;
  name?: string;
  label?: string;
  remainingDuration?: number;
  remainingTime?: number;
  totalDuration?: number;
  maxDuration?: number;
  color?: string;
  primaryColor?: string;
  accentColor?: string;
  progress?: number;
  isActive?: boolean;
  count?: number;
}

export interface ActivePowerUpTelemetry {
  readonly type: PowerUpType;
  readonly id: string;
  readonly label: string;
  readonly name?: string;
  readonly maxDuration: number;
  readonly totalDuration?: number;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly color?: string;
  remainingTime: number;
  remainingDuration?: number;
  progress: number;
  isActive: boolean;
  count?: number;
}

export type DashboardTelemetry = BottomDashboardState;
export type DashboardState = BottomDashboardState;

export interface BottomDashboardOptions {
  container?: HTMLElement | string | null;
  mode?: 'single' | 'coop';
  onToggleMute?: () => void | Promise<any> | boolean;
  onToggleFullscreen?: () => void | Promise<any> | boolean;
  onTogglePause?: () => void | Promise<any> | boolean;
  onTriggerSpecial?: () => void;
  onCycleSpecial?: () => void;
}

interface PreallocatedChip {
  element: HTMLElement;
  barElement: HTMLElement;
  codeElement: HTMLElement;
  isMounted: boolean;
  lastProgressInt: number;
  lastColor: string;
}

// Bounded static lookup tables (Zero string allocations at 60 FPS)
export const PERCENT_STRINGS: readonly string[] = Object.freeze(
  Array.from({ length: 101 }, (_, i) => `${i}%`)
);

export const REVIVE_COUNTDOWN_STRINGS: readonly string[] = Object.freeze(
  Array.from({ length: 16 }, (_, i) => `REVIVE: ${i}S`)
);

export const REVIVE_P1_STRINGS: readonly string[] = Object.freeze(
  Array.from({ length: 16 }, (_, i) => `REVIVE P1: ${i}S`)
);

export const REVIVE_P2_STRINGS: readonly string[] = Object.freeze(
  Array.from({ length: 16 }, (_, i) => `REVIVE P2: ${i}S`)
);

const DEFAULT_CHIP_META: Record<string, { code: string; label: string; color: string; duration: number }> = {
  RAPID_FIRE: { code: 'RF', label: 'OVERCLOCK', color: '#FF7F00', duration: 15.0 },
  KINETIC_SHIELD: { code: 'SHD', label: 'SHIELD', color: '#00FFFF', duration: 1.0 },
  SCATTER_SHOT: { code: 'SCT', label: 'SPREAD', color: '#00E700', duration: 15.0 },
  ENGINE_BOOSTER: { code: 'SPD', label: 'BOOSTER', color: '#5B93FF', duration: 15.0 },
  CHRONO_FIELD: { code: 'CF', label: 'CHRONO', color: '#00FFFF', duration: 6.0 },
  REFLECTION_SHIELD: { code: 'RFL', label: 'REFLECT', color: '#5B93FF', duration: 12.0 },
  EMP_COLLECTOR: { code: 'EMP', label: 'COLLECTOR', color: '#BB33FF', duration: 5.0 },
  PHASE_DRIVE: { code: 'PHS', label: 'PHASE', color: '#FF007F', duration: 15.0 },
  ANTIMATTER_PLASMA: { code: 'PLS', label: 'PLASMA', color: '#FFFF00', duration: 7.0 },
};

export class BottomDashboard {
  public element: HTMLElement | null = null;
  public mode: 'single' | 'coop' = 'single';
  private options: BottomDashboardOptions;

  // Cached Zone Root Elements
  private zoneLeft: HTMLElement | null = null;
  private zoneCenter: HTMLElement | null = null;
  private zoneRight: HTMLElement | null = null;

  // Single-Player Legacy Elements
  private elScoreRackSingle: HTMLElement | null = null;
  private elScoreVal: HTMLElement | null = null;
  private elHighVal: HTMLElement | null = null;
  private elSingleHighContainer: HTMLElement | null = null;
  private elLivesContainer: HTMLElement | null = null;
  private elSingleLivesRack: HTMLElement | null = null;
  private elPowerupRack: HTMLElement | null = null;
  private elSpecialContainer: HTMLElement | null = null;
  private elSpecialTrack: HTMLElement | null = null;
  private elSpecialFill: HTMLElement | null = null;
  private elSpecialName: HTMLElement | null = null;
  private elSpecialCue: HTMLElement | null = null;
  private elLegend: HTMLElement | null = null;
  private elSingleActionsRow: HTMLElement | null = null;

  // Action Buttons (reparented based on mode)
  private elActionsContainer: HTMLElement | null = null;
  private elBtnMute: HTMLElement | null = null;
  private elBtnFullscreen: HTMLElement | null = null;
  private elBtnPause: HTMLElement | null = null;

  // Co-op Player 1 Elements
  private elP1Container: HTMLElement | null = null;
  private elP1Badge: HTMLElement | null = null;
  private elP1ScoreVal: HTMLElement | null = null;
  private elP1Combo: HTMLElement | null = null;
  private elP1LivesContainer: HTMLElement | null = null;
  private elP1Revive: HTMLElement | null = null;
  private elP1SpecialContainer: HTMLElement | null = null;
  private elP1SpecialFill: HTMLElement | null = null;
  private elP1SpecialName: HTMLElement | null = null;
  private elP1SpecialCue: HTMLElement | null = null;
  private elP1PowerupRack: HTMLElement | null = null;

  // Co-op Center Telemetry Elements
  private elCoopCenterContainer: HTMLElement | null = null;
  private elStageBadgeWrap: HTMLElement | null = null;
  private elStageBadge: HTMLElement | null = null;
  private elCoopHighContainer: HTMLElement | null = null;
  private elWarningBanner: HTMLElement | null = null;
  private elWarningText: HTMLElement | null = null;
  private elControlsPrompt: HTMLElement | null = null;
  private elCoopActionsRow: HTMLElement | null = null;

  // Co-op Player 2 Elements
  private elP2Container: HTMLElement | null = null;
  private elP2Badge: HTMLElement | null = null;
  private elP2ScoreVal: HTMLElement | null = null;
  private elP2Combo: HTMLElement | null = null;
  private elP2LivesContainer: HTMLElement | null = null;
  private elP2Revive: HTMLElement | null = null;
  private elP2SpecialContainer: HTMLElement | null = null;
  private elP2SpecialFill: HTMLElement | null = null;
  private elP2SpecialName: HTMLElement | null = null;
  private elP2SpecialCue: HTMLElement | null = null;
  private elP2PowerupRack: HTMLElement | null = null;

  // Pre-allocated Ship Icon Pools
  private lifeIcons: HTMLElement[] = [];
  private currentMountedLives: number = 0;
  private lifeIconsP1: HTMLElement[] = [];
  private currentMountedLivesP1: number = 0;
  private lifeIconsP2: HTMLElement[] = [];
  private currentMountedLivesP2: number = 0;

  // Pre-allocated Power-Up Chip Pools
  private chipPool: Map<string, PreallocatedChip> = new Map();
  private chipPoolP1: Map<string, PreallocatedChip> = new Map();
  private chipPoolP2: Map<string, PreallocatedChip> = new Map();
  private _activePowerUpIds: Set<string> = new Set<string>();
  private _activePowerUpIdsP1: Set<string> = new Set<string>();
  private _activePowerUpIdsP2: Set<string> = new Set<string>();

  // Dirty Checking Cache State (Zero-GC Primitives)
  private _lastScore: number = -1;
  private _lastHighScore: number = -1;
  private _lastIsNewRecord: boolean | null = null;
  private _lastLives: number = -1;
  private _lastSpecialEnergyInt: number = -1;
  private _lastIsSpecialReady: boolean | null = null;
  private _lastSpecialCueText: string = '';
  private _lastSpecialMove: string = '';
  private _lastIsMuted: boolean | null = null;
  private _lastIsFullscreen: boolean | null = null;
  private _lastIsPaused: boolean | null = null;

  // Co-op Dirty Checking Caches
  private _lastScoreP1: number = -1;
  private _lastScoreP2: number = -1;
  private _lastLivesP1: number = -1;
  private _lastLivesP2: number = -1;
  private _lastSpecialIntP1: number = -1;
  private _lastSpecialIntP2: number = -1;
  private _lastIsSpecialReadyP1: boolean | null = null;
  private _lastIsSpecialReadyP2: boolean | null = null;
  private _lastSpecialCueTextP1: string = '';
  private _lastSpecialCueTextP2: string = '';
  private _lastSpecialNameP1: string = '';
  private _lastSpecialNameP2: string = '';
  private _lastComboP1: number = -1;
  private _lastComboP2: number = -1;
  private _lastStateP1: string = '';
  private _lastStateP2: string = '';
  private _lastReviveSecP1: number = -1;
  private _lastReviveSecP2: number = -1;
  private _lastP2CanDonate: boolean = false;
  private _lastP1CanDonate: boolean = false;
  private _lastStage: number = -1;
  private _lastWarningText: string = '';
  private _lastIsCoop: boolean | null = null;
  private _isCompactMode: boolean = false;

  // Bound Event Listeners for Clean Teardown
  private onMuteClickBound: ((e: any) => void) | null = null;
  private onFullscreenClickBound: ((e: any) => void) | null = null;
  private onPauseClickBound: ((e: any) => void) | null = null;

  constructor(options?: BottomDashboardOptions) {
    this.options = options || {};
    this.init(this.options.container);
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  public init(containerOrSelector?: HTMLElement | string | null): boolean {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return false;
    }

    let container: HTMLElement | null = null;
    if (containerOrSelector) {
      if (typeof containerOrSelector === 'string') {
        container = document.querySelector(containerOrSelector) as HTMLElement | null;
      } else {
        container = containerOrSelector;
      }
    }

    if (!container) {
      container = (document.getElementById('app-container') ||
        document.getElementById('game-container') ||
        document.body) as HTMLElement | null;
    }

    if (!container) {
      return false;
    }

    // Adopt existing #bottom-dashboard if already present, or create and mount
    const existing =
      container.id === 'bottom-dashboard'
        ? container
        : (container.querySelector ? container.querySelector('#bottom-dashboard') : null) ||
          (containerOrSelector === undefined || containerOrSelector === null
            ? document.getElementById('bottom-dashboard')
            : null);

    if (existing) {
      this.element = existing as HTMLElement;
      this.element.innerHTML = '';
      this.element.className = 'bottom-dashboard cyber-dashboard mode-single single-mode';
      this.element.setAttribute('role', 'region');
      this.element.setAttribute('aria-label', 'Arcade Bottom Dashboard');
    } else {
      this.element = document.createElement('div');
      this.element.id = 'bottom-dashboard';
      this.element.className = 'bottom-dashboard cyber-dashboard mode-single single-mode';
      this.element.setAttribute('role', 'region');
      this.element.setAttribute('aria-label', 'Arcade Bottom Dashboard');
      container.appendChild(this.element);
    }

    this.buildZoneLeft();
    this.buildZoneCenter();
    this.buildZoneRight();

    this.attachEventListeners();

    if (this.options.mode === 'coop') {
      this.setMode('coop');
    } else {
      this.setMode('single');
    }

    return true;
  }

  public getElement(): HTMLElement | null {
    return this.element;
  }

  public getMode(): 'single' | 'coop' {
    return this.mode;
  }

  public setMode(mode: 'single' | 'coop'): void {
    this.mode = mode;
    if (!this.element) return;
    const isCoop = mode === 'coop';

    this.element.classList.toggle('coop-mode', isCoop);
    this.element.classList.toggle('mode-coop', isCoop);
    this.element.classList.toggle('single-mode', !isCoop);
    this.element.classList.toggle('mode-single', !isCoop);

    // Co-op elements vs Single-player elements visibility
    if (this.elP1Container) {
      this.elP1Container.style.display = isCoop ? '' : 'none';
    }
    if (this.elCoopCenterContainer) {
      this.elCoopCenterContainer.style.display = isCoop ? '' : 'none';
    }
    if (this.elP2Container) {
      this.elP2Container.style.display = isCoop ? '' : 'none';
      this.elP2Container.classList.toggle('zone-hidden', !isCoop);
    }


    if (this.elScoreRackSingle) {
      this.elScoreRackSingle.style.display = isCoop ? 'none' : '';
    }
    if (this.elSingleLivesRack) {
      this.elSingleLivesRack.style.display = isCoop ? 'none' : '';
    }
    if (this.elPowerupRack) {
      this.elPowerupRack.style.display = isCoop ? 'none' : '';
    }
    if (this.elSpecialContainer) {
      this.elSpecialContainer.style.display = isCoop ? 'none' : '';
    }
    if (this.elLegend) {
      this.elLegend.style.display = isCoop ? 'none' : '';
    }
    if (this.elSingleActionsRow) {
      this.elSingleActionsRow.style.display = isCoop ? 'none' : '';
    }

    // Reparent elActionsContainer between Zone 3 (single) and Zone 2 (co-op)
    if (this.elActionsContainer) {
      if (isCoop && this.elCoopActionsRow) {
        this.elCoopActionsRow.appendChild(this.elActionsContainer);
      } else if (!isCoop && this.elSingleActionsRow) {
        this.elSingleActionsRow.appendChild(this.elActionsContainer);
      }
    }

    // Reparent elHighVal between Zone 1 (single) and Zone 2 (co-op)
    if (this.elHighVal) {
      if (isCoop && this.elCoopHighContainer) {
        this.elCoopHighContainer.appendChild(this.elHighVal);
      } else if (!isCoop && this.elSingleHighContainer) {
        this.elSingleHighContainer.appendChild(this.elHighVal);
      }
    }
  }

  public isCompactMode(): boolean {
    return this._isCompactMode;
  }

  public setCompactMode(compact: boolean): void {
    this._isCompactMode = compact;
    if (this.element) {
      this.element.classList.toggle('compact-mode', compact);
      if (compact) {
        this.element.style.height = '44px';
      } else {
        this.element.style.height = '';
      }
    }
    if (this.elLegend) {
      this.elLegend.classList.toggle('hidden-compact', compact);
    }
  }

  public reset(): void {
    this._lastScore = -1;
    this._lastHighScore = -1;
    this._lastIsNewRecord = null;
    this._lastLives = -1;
    this._lastSpecialEnergyInt = -1;
    this._lastIsSpecialReady = null;
    this._lastSpecialCueText = '';
    this._lastSpecialMove = '';
    this._lastIsMuted = null;
    this._lastIsFullscreen = null;
    this._lastIsPaused = null;

    this._lastScoreP1 = -1;
    this._lastScoreP2 = -1;
    this._lastLivesP1 = -1;
    this._lastLivesP2 = -1;
    this._lastSpecialIntP1 = -1;
    this._lastSpecialIntP2 = -1;
    this._lastIsSpecialReadyP1 = null;
    this._lastIsSpecialReadyP2 = null;
    this._lastSpecialCueTextP1 = '';
    this._lastSpecialCueTextP2 = '';
    this._lastSpecialNameP1 = '';
    this._lastSpecialNameP2 = '';
    this._lastComboP1 = -1;
    this._lastComboP2 = -1;
    this._lastStateP1 = '';
    this._lastStateP2 = '';
    this._lastReviveSecP1 = -1;
    this._lastReviveSecP2 = -1;
    this._lastP2CanDonate = false;
    this._lastP1CanDonate = false;
    this._lastStage = -1;
    this._lastWarningText = '';
    this._lastIsCoop = null;

    this._activePowerUpIds.clear();
    this._activePowerUpIdsP1.clear();
    this._activePowerUpIdsP2.clear();

    if (this.elScoreVal) this.elScoreVal.textContent = '000000';
    if (this.elP1ScoreVal) this.elP1ScoreVal.textContent = '000000';
    if (this.elP2ScoreVal) this.elP2ScoreVal.textContent = '000000';
    if (this.elStageBadge) this.elStageBadge.textContent = 'STAGE 01';

    if (this.elHighVal) {
      this.elHighVal.textContent = '020000';
      this.elHighVal.classList.remove('high-score-flash');
    }

    // Reset power-up chips across pools
    this.clearChipPool(this.chipPool);
    this.clearChipPool(this.chipPoolP1);
    this.clearChipPool(this.chipPoolP2);

    // Reset lives
    this.resetLivesIcons(this.elLivesContainer, this.lifeIcons, this.currentMountedLives);
    this.currentMountedLives = 0;
    this.resetLivesIcons(this.elP1LivesContainer, this.lifeIconsP1, this.currentMountedLivesP1);
    this.currentMountedLivesP1 = 0;
    this.resetLivesIcons(this.elP2LivesContainer, this.lifeIconsP2, this.currentMountedLivesP2);
    this.currentMountedLivesP2 = 0;

    if (this.elSpecialFill) this.elSpecialFill.style.width = '0%';
    if (this.elSpecialContainer) this.elSpecialContainer.classList.remove('special-ready');
    if (this.elSpecialCue) {
      this.elSpecialCue.textContent = '0%';
      this.elSpecialCue.className = 'special-cue text-white';
    }

    if (this.elP1SpecialFill) this.elP1SpecialFill.style.width = '0%';
    if (this.elP1SpecialContainer) this.elP1SpecialContainer.classList.remove('special-ready');
    if (this.elP1SpecialCue) {
      this.elP1SpecialCue.textContent = '0%';
      this.elP1SpecialCue.className = 'special-cue text-white';
    }

    if (this.elP2SpecialFill) this.elP2SpecialFill.style.width = '0%';
    if (this.elP2SpecialContainer) this.elP2SpecialContainer.classList.remove('special-ready');
    if (this.elP2SpecialCue) {
      this.elP2SpecialCue.textContent = '0%';
      this.elP2SpecialCue.className = 'special-cue text-white';
    }

    if (this.zoneLeft) {
      this.zoneLeft.classList.remove('revive-active', 'player-eliminated');
    }
    if (this.zoneRight) {
      this.zoneRight.classList.remove('revive-active', 'player-eliminated');
    }
    if (this.elP1Revive) this.elP1Revive.style.display = 'none';
    if (this.elP2Revive) this.elP2Revive.style.display = 'none';
    if (this.elWarningBanner) this.elWarningBanner.style.display = 'none';

    if (this.elBtnMute) {
      this.elBtnMute.textContent = '🔊';
      this.elBtnMute.setAttribute('aria-label', 'Mute Audio');
      this.elBtnMute.setAttribute('aria-pressed', 'false');
    }
    if (this.elBtnFullscreen) {
      this.elBtnFullscreen.textContent = '⛶';
      this.elBtnFullscreen.setAttribute('aria-label', 'Toggle Fullscreen');
      this.elBtnFullscreen.setAttribute('aria-pressed', 'false');
    }
    if (this.elBtnPause) {
      this.elBtnPause.textContent = '⏸';
      this.elBtnPause.setAttribute('aria-label', 'Pause Game');
      this.elBtnPause.setAttribute('aria-pressed', 'false');
    }
  }

  private clearChipPool(pool: Map<string, PreallocatedChip>): void {
    for (const chip of pool.values()) {
      if (chip.isMounted && chip.element.parentElement) {
        chip.element.parentElement.removeChild(chip.element);
        chip.isMounted = false;
        chip.lastProgressInt = -1;
      }
    }
  }

  private resetLivesIcons(container: HTMLElement | null, icons: HTMLElement[], mounted: number): void {
    if (!container) return;
    for (let i = 0; i < mounted; i++) {
      const icon = icons[i];
      if (icon && icon.parentElement) {
        icon.parentElement.removeChild(icon);
      }
    }
  }

  public destroy(): void {
    this.detachEventListeners();

    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }

    this.element = null;
    this.zoneLeft = null;
    this.zoneCenter = null;
    this.zoneRight = null;
    this.elScoreRackSingle = null;
    this.elScoreVal = null;
    this.elHighVal = null;
    this.elSingleHighContainer = null;
    this.elLivesContainer = null;
    this.elSingleLivesRack = null;
    this.elPowerupRack = null;
    this.elSpecialContainer = null;
    this.elSpecialTrack = null;
    this.elSpecialFill = null;
    this.elSpecialName = null;
    this.elSpecialCue = null;
    this.elLegend = null;
    this.elSingleActionsRow = null;

    this.elActionsContainer = null;
    this.elBtnMute = null;
    this.elBtnFullscreen = null;
    this.elBtnPause = null;

    this.elP1Container = null;
    this.elP1Badge = null;
    this.elP1ScoreVal = null;
    this.elP1Combo = null;
    this.elP1LivesContainer = null;
    this.elP1Revive = null;
    this.elP1SpecialContainer = null;
    this.elP1SpecialFill = null;
    this.elP1SpecialName = null;
    this.elP1SpecialCue = null;
    this.elP1PowerupRack = null;

    this.elCoopCenterContainer = null;
    this.elStageBadgeWrap = null;
    this.elStageBadge = null;
    this.elCoopHighContainer = null;
    this.elWarningBanner = null;
    this.elWarningText = null;
    this.elControlsPrompt = null;
    this.elCoopActionsRow = null;

    this.elP2Container = null;
    this.elP2Badge = null;
    this.elP2ScoreVal = null;
    this.elP2Combo = null;
    this.elP2LivesContainer = null;
    this.elP2Revive = null;
    this.elP2SpecialContainer = null;
    this.elP2SpecialFill = null;
    this.elP2SpecialName = null;
    this.elP2SpecialCue = null;
    this.elP2PowerupRack = null;

    this.lifeIcons = [];
    this.lifeIconsP1 = [];
    this.lifeIconsP2 = [];
    this.currentMountedLives = 0;
    this.currentMountedLivesP1 = 0;
    this.currentMountedLivesP2 = 0;

    this.chipPool.clear();
    this.chipPoolP1.clear();
    this.chipPoolP2.clear();
    this._activePowerUpIds.clear();
    this._activePowerUpIdsP1.clear();
    this._activePowerUpIdsP2.clear();
  }

  // ==========================================================================
  // Zone Builders
  // ==========================================================================

  private buildZoneLeft(): void {
    if (!this.element) return;

    this.zoneLeft = document.createElement('div');
    this.zoneLeft.className = 'dash-zone zone-left dashboard-zone-left zone-p1';
    this.zoneLeft.classList.add('dash-zone');
    this.zoneLeft.classList.add('zone-left');
    this.zoneLeft.classList.add('dashboard-zone-left');
    this.zoneLeft.classList.add('zone-p1');

    // 1. Single-Player Score & Lives Rack (.single-only)
    this.elScoreRackSingle = document.createElement('div');
    this.elScoreRackSingle.className = 'dash-score-rack single-only';

    // 1UP Score
    const entryScore = document.createElement('div');
    entryScore.className = 'dash-score-entry';
    const labelScore = document.createElement('span');
    labelScore.className = 'dash-label text-cyan';
    labelScore.textContent = '1UP';
    this.elScoreVal = document.createElement('span');
    this.elScoreVal.id = 'dashboard-score';
    this.elScoreVal.className = 'dash-val text-white dashboard-score';
    this.elScoreVal.textContent = '000000';
    entryScore.appendChild(labelScore);
    entryScore.appendChild(this.elScoreVal);

    // HIGH Score
    this.elSingleHighContainer = document.createElement('div');
    this.elSingleHighContainer.className = 'dash-score-entry';
    const labelHigh = document.createElement('span');
    labelHigh.className = 'dash-label text-yellow';
    labelHigh.textContent = 'HIGH';
    this.elHighVal = document.createElement('span');
    this.elHighVal.id = 'dashboard-high-score';
    this.elHighVal.className = 'dash-val text-yellow dashboard-high-score';
    this.elHighVal.textContent = '020000';
    this.elSingleHighContainer.appendChild(labelHigh);
    this.elSingleHighContainer.appendChild(this.elHighVal);

    this.elScoreRackSingle.appendChild(entryScore);
    this.elScoreRackSingle.appendChild(this.elSingleHighContainer);

    // Single-Player Lives Rack
    this.elSingleLivesRack = document.createElement('div');
    this.elSingleLivesRack.className = 'dash-lives-rack single-only';
    const labelLives = document.createElement('span');
    labelLives.className = 'dash-label text-grey';
    labelLives.textContent = 'SHIPS';

    this.elLivesContainer = document.createElement('div');
    this.elLivesContainer.id = 'dashboard-lives';
    this.elLivesContainer.className = 'dash-lives-icons dashboard-lives';
    this.elLivesContainer.setAttribute('aria-label', 'Reserve Lives');

    this.lifeIcons = [];
    for (let i = 0; i < 5; i++) {
      const icon = this.createShipIconP1();
      this.lifeIcons.push(icon);
    }
    this.elSingleLivesRack.appendChild(labelLives);
    this.elSingleLivesRack.appendChild(this.elLivesContainer);

    this.zoneLeft.appendChild(this.elScoreRackSingle);
    this.zoneLeft.appendChild(this.elSingleLivesRack);

    // 2. Co-op Player 1 HUD (.coop-only .p1-hud-container)
    this.elP1Container = document.createElement('div');
    this.elP1Container.className = 'p1-hud-container coop-only zone-p1';
    this.elP1Container.classList.add('zone-p1');
    this.elP1Container.style.display = 'none';

    // Header row: Badge, Score, Combo
    const p1Header = document.createElement('div');
    p1Header.className = 'p1-header-row';

    this.elP1Badge = document.createElement('span');
    this.elP1Badge.className = 'badge-player badge-p1 player-badge';
    this.elP1Badge.textContent = '1P';

    this.elP1ScoreVal = document.createElement('span');
    this.elP1ScoreVal.id = 'dashboard-p1-score';
    this.elP1ScoreVal.className = 'p1-score-val text-white dashboard-score';
    this.elP1ScoreVal.textContent = '000000';

    this.elP1Combo = document.createElement('span');
    this.elP1Combo.id = 'dashboard-p1-combo';
    this.elP1Combo.className = 'combo-badge p1-combo';
    this.elP1Combo.textContent = '1X';

    p1Header.appendChild(this.elP1Badge);
    p1Header.appendChild(this.elP1ScoreVal);
    p1Header.appendChild(this.elP1Combo);

    // Stats row: Lives and Revive alert
    const p1Stats = document.createElement('div');
    p1Stats.className = 'p1-stats-row';

    this.elP1LivesContainer = document.createElement('div');
    this.elP1LivesContainer.id = 'dashboard-p1-lives';
    this.elP1LivesContainer.className = 'p1-lives-icons dashboard-lives';

    this.lifeIconsP1 = [];
    for (let i = 0; i < 5; i++) {
      const icon = this.createShipIconP1();
      this.lifeIconsP1.push(icon);
    }

    this.elP1Revive = document.createElement('div');
    this.elP1Revive.id = 'dashboard-p1-revive';
    this.elP1Revive.className = 'p1-revive-alert';
    this.elP1Revive.style.display = 'none';

    p1Stats.appendChild(this.elP1LivesContainer);
    p1Stats.appendChild(this.elP1Revive);

    // Special Rack
    this.elP1SpecialContainer = document.createElement('div');
    this.elP1SpecialContainer.id = 'dashboard-p1-special';
    this.elP1SpecialContainer.className = 'p1-special-rack special-meter-mini zone-p1-special';

    const p1SpecHeader = document.createElement('div');
    p1SpecHeader.className = 'dash-special-header';
    this.elP1SpecialName = document.createElement('span');
    this.elP1SpecialName.className = 'p1-special-name text-cyan';
    this.elP1SpecialName.textContent = 'SP';
    this.elP1SpecialCue = document.createElement('span');
    this.elP1SpecialCue.id = 'p1-special-cue';
    this.elP1SpecialCue.className = 'special-cue-mini p1-cue text-white';
    this.elP1SpecialCue.textContent = '0%';
    p1SpecHeader.appendChild(this.elP1SpecialName);
    p1SpecHeader.appendChild(this.elP1SpecialCue);

    const p1Track = document.createElement('div');
    p1Track.className = 'special-track special-mini-track';
    p1Track.setAttribute('role', 'progressbar');
    p1Track.setAttribute('aria-valuenow', '0');

    this.elP1SpecialFill = document.createElement('div');
    this.elP1SpecialFill.className = 'special-fill p1-fill special-mini-fill';
    this.elP1SpecialFill.style.width = '0%';
    p1Track.appendChild(this.elP1SpecialFill);

    this.elP1SpecialContainer.appendChild(p1SpecHeader);
    this.elP1SpecialContainer.appendChild(p1Track);

    // Powerups rack
    this.elP1PowerupRack = document.createElement('div');
    this.elP1PowerupRack.id = 'dashboard-p1-powerups';
    this.elP1PowerupRack.className = 'dash-chip-rack';

    this.elP1Container.appendChild(p1Header);
    this.elP1Container.appendChild(p1Stats);
    this.elP1Container.appendChild(this.elP1SpecialContainer);
    this.elP1Container.appendChild(this.elP1PowerupRack);

    this.zoneLeft.appendChild(this.elP1Container);
    this.element.appendChild(this.zoneLeft);
  }

  private buildZoneCenter(): void {
    if (!this.element) return;

    this.zoneCenter = document.createElement('div');
    this.zoneCenter.className = 'dash-zone zone-center dashboard-zone-center zone-center-telemetry';
    this.zoneCenter.classList.add('dash-zone');
    this.zoneCenter.classList.add('zone-center');
    this.zoneCenter.classList.add('dashboard-zone-center');
    this.zoneCenter.classList.add('zone-center-telemetry');

    // 1. Single-Player Center (PowerUps & Special Move)
    this.elPowerupRack = document.createElement('div');
    this.elPowerupRack.id = 'dashboard-powerups';
    this.elPowerupRack.className = 'dash-chip-rack dashboard-powerups single-only';
    this.elPowerupRack.setAttribute('aria-label', 'Active Power-Ups');

    this.elSpecialContainer = document.createElement('div');
    this.elSpecialContainer.id = 'dashboard-single-special';
    this.elSpecialContainer.className = 'dash-special-rack dashboard-special-container single-only';
    this.elSpecialContainer.classList.add('dashboard-special-container');

    const header = document.createElement('div');
    header.className = 'dash-special-header';
    this.elSpecialName = document.createElement('span');
    this.elSpecialName.className = 'special-name text-cyan';
    this.elSpecialName.textContent = 'SP';
    this.elSpecialCue = document.createElement('span');
    this.elSpecialCue.id = 'single-special-cue';
    this.elSpecialCue.className = 'special-cue text-white';
    this.elSpecialCue.textContent = '0%';
    header.appendChild(this.elSpecialName);
    header.appendChild(this.elSpecialCue);

    this.elSpecialTrack = document.createElement('div');
    this.elSpecialTrack.className = 'special-track';
    this.elSpecialTrack.setAttribute('role', 'progressbar');
    this.elSpecialTrack.setAttribute('aria-valuenow', '0');
    this.elSpecialTrack.setAttribute('aria-valuemin', '0');
    this.elSpecialTrack.setAttribute('aria-valuemax', '100');

    this.elSpecialFill = document.createElement('div');
    this.elSpecialFill.className = 'special-fill special-charge-bar';
    this.elSpecialFill.classList.add('special-fill');
    this.elSpecialFill.classList.add('special-charge-bar');
    this.elSpecialFill.style.width = '0%';
    this.elSpecialTrack.appendChild(this.elSpecialFill);

    this.elSpecialContainer.appendChild(header);
    this.elSpecialContainer.appendChild(this.elSpecialTrack);

    this.zoneCenter.appendChild(this.elPowerupRack);
    this.zoneCenter.appendChild(this.elSpecialContainer);

    // 2. Co-op Center Telemetry (.coop-only .coop-center-telemetry)
    this.elCoopCenterContainer = document.createElement('div');
    this.elCoopCenterContainer.className = 'coop-center-telemetry coop-only';
    this.elCoopCenterContainer.style.display = 'none';

    // Top row: Stage badge & High score
    const topRow = document.createElement('div');
    topRow.className = 'center-top-row center-meta-row';

    this.elStageBadgeWrap = document.createElement('div');
    this.elStageBadgeWrap.id = 'dashboard-stage-badge';
    this.elStageBadgeWrap.className = 'coop-stage-badge-wrap';

    this.elStageBadge = document.createElement('span');
    this.elStageBadge.id = 'dashboard-stage';
    this.elStageBadge.className = 'coop-stage-badge text-cyan';
    this.elStageBadge.textContent = 'STAGE 01';
    this.elStageBadgeWrap.appendChild(this.elStageBadge);

    this.elCoopHighContainer = document.createElement('div');
    this.elCoopHighContainer.id = 'dashboard-coop-high-score';
    this.elCoopHighContainer.className = 'coop-high-entry';
    const coopHighLabel = document.createElement('span');
    coopHighLabel.className = 'dash-label text-yellow';
    coopHighLabel.textContent = 'HIGH';
    this.elCoopHighContainer.appendChild(coopHighLabel);

    topRow.appendChild(this.elStageBadgeWrap);
    topRow.appendChild(this.elCoopHighContainer);

    // Warning Banner
    this.elWarningBanner = document.createElement('div');
    this.elWarningBanner.id = 'dashboard-warning';
    this.elWarningBanner.className = 'center-warning-banner center-banner';
    this.elWarningBanner.classList.add('center-banner');
    this.elWarningBanner.style.display = 'none';

    this.elWarningText = document.createElement('span');
    this.elWarningText.className = 'warning-text';
    this.elWarningText.textContent = '⚠️ CRISIS';
    this.elWarningBanner.appendChild(this.elWarningText);

    // Controls prompt
    this.elControlsPrompt = document.createElement('div');
    this.elControlsPrompt.className = 'center-controls-prompt';
    this.elControlsPrompt.innerHTML =
      '<span class="prompt-p1 text-cyan">P1:WASD+SPC</span><span class="prompt-sep"> | </span><span class="prompt-p2 text-magenta">P2:ARW+ENT</span>';

    // Co-op actions row
    this.elCoopActionsRow = document.createElement('div');
    this.elCoopActionsRow.className = 'coop-actions-row center-actions';

    this.elCoopCenterContainer.appendChild(topRow);
    this.elCoopCenterContainer.appendChild(this.elWarningBanner);
    this.elCoopCenterContainer.appendChild(this.elControlsPrompt);
    this.elCoopCenterContainer.appendChild(this.elCoopActionsRow);

    this.zoneCenter.appendChild(this.elCoopCenterContainer);
    this.element.appendChild(this.zoneCenter);
  }

  private buildZoneRight(): void {
    if (!this.element) return;

    this.zoneRight = document.createElement('div');
    this.zoneRight.className = 'dash-zone zone-right dashboard-zone-right';
    this.zoneRight.classList.add('dash-zone');
    this.zoneRight.classList.add('zone-right');
    this.zoneRight.classList.add('dashboard-zone-right');

    // 1. Single-Player Controls Legend (.single-only)
    this.elLegend = document.createElement('div');
    this.elLegend.className = 'controls-legend single-only';
    this.elLegend.classList.add('controls-legend');
    this.elLegend.setAttribute('aria-hidden', 'true');

    const row1 = document.createElement('div');
    row1.className = 'legend-row';
    row1.innerHTML = '<span class="k-cap">A/D</span> MOVE';

    const row2 = document.createElement('div');
    row2.className = 'legend-row';
    row2.innerHTML = '<span class="k-cap">SPC</span> FIRE';

    const row3 = document.createElement('div');
    row3.className = 'legend-row';
    row3.innerHTML = '<span class="k-cap">X</span> SP';

    this.elLegend.appendChild(row1);
    this.elLegend.appendChild(row2);
    this.elLegend.appendChild(row3);

    // Action buttons container (created once, reparented between zoneRight and zoneCenter)
    this.elActionsContainer = document.createElement('div');
    this.elActionsContainer.className = 'dash-actions';

    this.elBtnMute = document.createElement('button');
    this.elBtnMute.id = 'btn-dash-mute';
    this.elBtnMute.className = 'dash-btn btn-dash-mute';
    this.elBtnMute.setAttribute('aria-label', 'Mute Audio');
    this.elBtnMute.setAttribute('aria-pressed', 'false');
    this.elBtnMute.title = 'Mute/Unmute Audio (M)';
    this.elBtnMute.textContent = '🔊';

    this.elBtnFullscreen = document.createElement('button');
    this.elBtnFullscreen.id = 'btn-dash-fullscreen';
    this.elBtnFullscreen.className = 'dash-btn btn-dash-fullscreen';
    this.elBtnFullscreen.setAttribute('aria-label', 'Toggle Fullscreen');
    this.elBtnFullscreen.setAttribute('aria-pressed', 'false');
    this.elBtnFullscreen.title = 'Toggle Fullscreen (F / F11)';
    this.elBtnFullscreen.textContent = '⛶';

    this.elBtnPause = document.createElement('button');
    this.elBtnPause.id = 'btn-dash-pause';
    this.elBtnPause.className = 'dash-btn btn-dash-pause';
    this.elBtnPause.setAttribute('aria-label', 'Pause Game');
    this.elBtnPause.setAttribute('aria-pressed', 'false');
    this.elBtnPause.title = 'Pause/Resume Game (P)';
    this.elBtnPause.textContent = '⏸';

    this.elActionsContainer.appendChild(this.elBtnMute);
    this.elActionsContainer.appendChild(this.elBtnFullscreen);
    this.elActionsContainer.appendChild(this.elBtnPause);

    this.elSingleActionsRow = document.createElement('div');
    this.elSingleActionsRow.className = 'single-actions-wrapper single-only';
    this.elSingleActionsRow.appendChild(this.elActionsContainer);

    this.zoneRight.appendChild(this.elLegend);
    this.zoneRight.appendChild(this.elSingleActionsRow);

    // 2. Co-op Player 2 View (.coop-only .p2-hud-container .zone-p2)
    this.elP2Container = document.createElement('div');
    this.elP2Container.className = 'p2-hud-container coop-only zone-p2';
    this.elP2Container.classList.add('zone-p2');
    this.elP2Container.style.display = 'none';

    // Header row: Badge, Score, Combo
    const p2Header = document.createElement('div');
    p2Header.className = 'p2-header-row';

    this.elP2Badge = document.createElement('span');
    this.elP2Badge.className = 'badge-player badge-p2 player-badge';
    this.elP2Badge.textContent = '2P';

    this.elP2ScoreVal = document.createElement('span');
    this.elP2ScoreVal.id = 'dashboard-p2-score';
    this.elP2ScoreVal.className = 'p2-score-val text-white dashboard-score';
    this.elP2ScoreVal.textContent = '000000';

    this.elP2Combo = document.createElement('span');
    this.elP2Combo.id = 'dashboard-p2-combo';
    this.elP2Combo.className = 'combo-badge p2-combo';
    this.elP2Combo.textContent = '1X';

    p2Header.appendChild(this.elP2Badge);
    p2Header.appendChild(this.elP2ScoreVal);
    p2Header.appendChild(this.elP2Combo);

    // Stats row: Lives and Revive alert
    const p2Stats = document.createElement('div');
    p2Stats.className = 'p2-stats-row';

    this.elP2LivesContainer = document.createElement('div');
    this.elP2LivesContainer.id = 'dashboard-p2-lives';
    this.elP2LivesContainer.className = 'p2-lives-icons dashboard-lives';

    this.lifeIconsP2 = [];
    for (let i = 0; i < 5; i++) {
      const icon = this.createShipIconP2();
      this.lifeIconsP2.push(icon);
    }

    this.elP2Revive = document.createElement('div');
    this.elP2Revive.id = 'dashboard-p2-revive';
    this.elP2Revive.className = 'p2-revive-alert';
    this.elP2Revive.style.display = 'none';

    p2Stats.appendChild(this.elP2LivesContainer);
    p2Stats.appendChild(this.elP2Revive);

    // Special Rack
    this.elP2SpecialContainer = document.createElement('div');
    this.elP2SpecialContainer.id = 'dashboard-p2-special';
    this.elP2SpecialContainer.className = 'p2-special-rack special-meter-mini zone-p2-special';

    const p2SpecHeader = document.createElement('div');
    p2SpecHeader.className = 'dash-special-header';
    this.elP2SpecialName = document.createElement('span');
    this.elP2SpecialName.className = 'p2-special-name text-magenta';
    this.elP2SpecialName.textContent = 'SP';
    this.elP2SpecialCue = document.createElement('span');
    this.elP2SpecialCue.id = 'p2-special-cue';
    this.elP2SpecialCue.className = 'special-cue-mini p2-cue text-white';
    this.elP2SpecialCue.textContent = '0%';
    p2SpecHeader.appendChild(this.elP2SpecialName);
    p2SpecHeader.appendChild(this.elP2SpecialCue);

    const p2Track = document.createElement('div');
    p2Track.className = 'special-track special-mini-track';
    p2Track.setAttribute('role', 'progressbar');
    p2Track.setAttribute('aria-valuenow', '0');

    this.elP2SpecialFill = document.createElement('div');
    this.elP2SpecialFill.className = 'special-fill p2-fill special-mini-fill';
    this.elP2SpecialFill.style.width = '0%';
    p2Track.appendChild(this.elP2SpecialFill);

    this.elP2SpecialContainer.appendChild(p2SpecHeader);
    this.elP2SpecialContainer.appendChild(p2Track);

    // Powerups rack
    this.elP2PowerupRack = document.createElement('div');
    this.elP2PowerupRack.id = 'dashboard-p2-powerups';
    this.elP2PowerupRack.className = 'dash-chip-rack';

    this.elP2Container.appendChild(p2Header);
    this.elP2Container.appendChild(p2Stats);
    this.elP2Container.appendChild(this.elP2SpecialContainer);
    this.elP2Container.appendChild(this.elP2PowerupRack);

    this.zoneRight.appendChild(this.elP2Container);
    this.element.appendChild(this.zoneRight);
  }

  // ==========================================================================
  // Procedural SVG Ship Icon Factories
  // ==========================================================================

  private createShipIconP1(): HTMLElement {
    let icon: HTMLElement;
    if (document.createElementNS) {
      icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as HTMLElement;
    } else {
      icon = document.createElement('div');
    }
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('width', '12');
    icon.setAttribute('height', '12');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('class', 'ship-icon ship-life-icon p1-ship-icon');
    icon.classList.add('ship-icon');
    icon.classList.add('ship-life-icon');
    icon.classList.add('p1-ship-icon');
    icon.innerHTML =
      '<path fill="#E70000" d="M7 0h2v2H7zM6 2h4v2H6zM5 4h6v2H5zM2 6h12v2H2zM1 8h14v2H1zM2 10h12v2H2zM3 12h10v2H3zM5 14h6v2H5z"/>' +
      '<path fill="#FFFFFF" d="M7 2h2v4H7zM6 6h4v4H6zM7 10h2v2H7z"/>' +
      '<path fill="#00FFFF" d="M5 8h2v2H5zM9 8h2v2H9z"/>' +
      '<path fill="#FFFF00" d="M7 0h2v1H7z"/>';
    return icon;
  }

  private createShipIconP2(): HTMLElement {
    let icon: HTMLElement;
    if (document.createElementNS) {
      icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as HTMLElement;
    } else {
      icon = document.createElement('div');
    }
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('width', '12');
    icon.setAttribute('height', '12');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('class', 'ship-icon ship-life-icon p2-ship-icon');
    icon.classList.add('ship-icon');
    icon.classList.add('ship-life-icon');
    icon.classList.add('p2-ship-icon');
    icon.innerHTML =
      '<path fill="#FF0055" d="M7 0h2v2H7zM6 2h4v2H6zM5 4h6v2H5zM2 6h12v2H2zM1 8h14v2H1zM2 10h12v2H2zM3 12h10v2H3zM5 14h6v2H5z"/>' +
      '<path fill="#880022" d="M7 2h2v4H7zM6 6h4v4H6zM7 10h2v2H7z"/>' +
      '<path fill="#FFB700" d="M5 8h2v2H5zM9 8h2v2H9z"/>' +
      '<path fill="#FFFF00" d="M7 0h2v1H7z"/>';
    return icon;
  }

  // ==========================================================================
  // Event Listeners Wiring
  // ==========================================================================

  private attachEventListeners(): void {
    if (this.elBtnMute) {
      this.onMuteClickBound = (e: any) => {
        e?.preventDefault?.();
        try {
          const res = this.options.onToggleMute?.();
          if (res && typeof (res as Promise<any>).catch === 'function') {
            (res as Promise<any>).catch(() => {});
          }
        } catch (_err) {}
      };
      this.elBtnMute.addEventListener('click', this.onMuteClickBound);
    }

    if (this.elBtnFullscreen) {
      this.onFullscreenClickBound = (e: any) => {
        e?.preventDefault?.();
        try {
          const res = this.options.onToggleFullscreen?.();
          if (res && typeof (res as Promise<any>).catch === 'function') {
            (res as Promise<any>).catch(() => {});
          }
        } catch (_err) {}
      };
      this.elBtnFullscreen.addEventListener('click', this.onFullscreenClickBound);
    }

    if (this.elBtnPause) {
      this.onPauseClickBound = (e: any) => {
        e?.preventDefault?.();
        try {
          const res = this.options.onTogglePause?.();
          if (res && typeof (res as Promise<any>).catch === 'function') {
            (res as Promise<any>).catch(() => {});
          }
        } catch (_err) {}
      };
      this.elBtnPause.addEventListener('click', this.onPauseClickBound);
    }
  }

  private detachEventListeners(): void {
    if (this.elBtnMute && this.onMuteClickBound) {
      this.elBtnMute.removeEventListener('click', this.onMuteClickBound);
      this.onMuteClickBound = null;
    }
    if (this.elBtnFullscreen && this.onFullscreenClickBound) {
      this.elBtnFullscreen.removeEventListener('click', this.onFullscreenClickBound);
      this.onFullscreenClickBound = null;
    }
    if (this.elBtnPause && this.onPauseClickBound) {
      this.elBtnPause.removeEventListener('click', this.onPauseClickBound);
      this.onPauseClickBound = null;
    }
  }

  // ==========================================================================
  // Zero-GC Update Pipeline
  // ==========================================================================

  public update(telemetry: DashboardTelemetry): void {
    if (!this.element || !telemetry) return;

    // 0. Mode Synchronization
    const isCoop = telemetry.isCoop === true || this.mode === 'coop';
    if (isCoop !== this._lastIsCoop) {
      this.setMode(isCoop ? 'coop' : 'single');
      this._lastIsCoop = isCoop;
    }

    // Extract raw values
    const rawScore = typeof telemetry.score === 'number' ? telemetry.score : 0;
    const clampedScore = isNaN(rawScore) || rawScore < 0 ? 0 : Math.floor(rawScore);

    const rawHigh = typeof telemetry.highScore === 'number' ? telemetry.highScore : 0;
    let clampedHigh = isNaN(rawHigh) || rawHigh < 0 ? 0 : Math.floor(rawHigh);

    // Extract independent co-op scores if available
    const rawP1Score = (telemetry as any).p1Score ?? telemetry.p1?.score ?? clampedScore;
    const p1Score = isNaN(rawP1Score) || rawP1Score < 0 ? 0 : Math.floor(rawP1Score);

    const rawP2Score = (telemetry as any).p2Score ?? telemetry.p2?.score ?? 0;
    const p2Score = isNaN(rawP2Score) || rawP2Score < 0 ? 0 : Math.floor(rawP2Score);

    if (isCoop) {
      clampedHigh = Math.max(clampedHigh, p1Score, p2Score);
    } else {
      clampedHigh = Math.max(clampedHigh, clampedScore);
    }

    // High Score Dirty-Check & New Record Flash
    if (clampedHigh !== this._lastHighScore) {
      if (this.elHighVal) {
        this.elHighVal.textContent = this.formatScore6(clampedHigh);
      }
      this._lastHighScore = clampedHigh;
    }

    const isNewRecord =
      telemetry.isNewHighScore === true ||
      (isCoop
        ? (p1Score > 20000 && p1Score >= clampedHigh) || (p2Score > 20000 && p2Score >= clampedHigh)
        : (clampedScore > 20000 && clampedScore >= clampedHigh));

    if (isNewRecord !== this._lastIsNewRecord) {
      if (this.elHighVal) {
        this.elHighVal.classList.toggle('high-score-flash', isNewRecord);
      }
      this._lastIsNewRecord = isNewRecord;
    }

    // Mode-Specific Update Pathways
    if (!isCoop) {
      this.updateSinglePlayer(telemetry, clampedScore);
    } else {
      this.updateCoopPlayer(telemetry, p1Score, p2Score, clampedHigh);
    }

    // Tactical Action Buttons (Shared across modes)
    if (telemetry.isMuted !== undefined && telemetry.isMuted !== this._lastIsMuted) {
      if (this.elBtnMute) {
        this.elBtnMute.textContent = telemetry.isMuted ? '🔇' : '🔊';
        this.elBtnMute.setAttribute('aria-label', telemetry.isMuted ? 'Unmute Audio' : 'Mute Audio');
        this.elBtnMute.setAttribute('aria-pressed', telemetry.isMuted ? 'true' : 'false');
      }
      this._lastIsMuted = telemetry.isMuted;
    }

    if (telemetry.isFullscreen !== undefined && telemetry.isFullscreen !== this._lastIsFullscreen) {
      if (this.elBtnFullscreen) {
        this.elBtnFullscreen.textContent = telemetry.isFullscreen ? '🗗' : '⛶';
        this.elBtnFullscreen.setAttribute(
          'aria-label',
          telemetry.isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'
        );
        this.elBtnFullscreen.setAttribute('aria-pressed', telemetry.isFullscreen ? 'true' : 'false');
      }
      this._lastIsFullscreen = telemetry.isFullscreen;
    }

    if (telemetry.isPaused !== undefined && telemetry.isPaused !== this._lastIsPaused) {
      if (this.elBtnPause) {
        this.elBtnPause.textContent = telemetry.isPaused ? '▶' : '⏸';
        this.elBtnPause.setAttribute('aria-label', telemetry.isPaused ? 'Resume Game' : 'Pause Game');
        this.elBtnPause.setAttribute('aria-pressed', telemetry.isPaused ? 'true' : 'false');
      }
      this._lastIsPaused = telemetry.isPaused;
    }
  }

  // ==========================================================================
  // Single-Player Telemetry Pipeline
  // ==========================================================================

  private updateSinglePlayer(telemetry: DashboardTelemetry, clampedScore: number): void {
    // 1. Score
    if (clampedScore !== this._lastScore) {
      if (this.elScoreVal) {
        this.elScoreVal.textContent = this.formatScore6(clampedScore);
      }
      this._lastScore = clampedScore;
    }

    // 2. Lives Icons (0 to 5)
    const rawLives = typeof telemetry.lives === 'number' ? telemetry.lives : 0;
    const clampedLives = Math.max(0, Math.min(5, Math.floor(isNaN(rawLives) ? 0 : rawLives)));
    if (clampedLives !== this._lastLives) {
      this.updateLivesIcons(this.elLivesContainer, this.lifeIcons, clampedLives, this.currentMountedLives);
      this.currentMountedLives = clampedLives;
      this._lastLives = clampedLives;
    }

    // 3. Special Move Charge Gauge
    const rawEnergy =
      telemetry.specialEnergy !== undefined
        ? telemetry.specialEnergy
        : telemetry.specialCharge !== undefined
        ? telemetry.specialCharge
        : telemetry.specialMeter !== undefined
        ? (telemetry.specialMeter <= 1.0 && telemetry.specialMeter > 0 ? telemetry.specialMeter * 100 : telemetry.specialMeter)
        : 0;
    const energyFloat = rawEnergy;
    const energyInt = Math.max(0, Math.min(100, Math.floor(isNaN(energyFloat) ? 0 : energyFloat)));

    if (energyInt !== this._lastSpecialEnergyInt) {
      if (this.elSpecialFill) {
        this.elSpecialFill.style.width = PERCENT_STRINGS[energyInt] || '0%';
      }
      if (this.elSpecialTrack) {
        this.elSpecialTrack.setAttribute('aria-valuenow', energyInt.toString());
      }
      this._lastSpecialEnergyInt = energyInt;
    }

    // 4. Special Ready & Move Name
    const isReady = telemetry.isSpecialReady ?? telemetry.specialReady ?? (energyInt >= 100);
    const moveName = telemetry.selectedSpecial || telemetry.activeSpecialName || 'SP';

    if (isReady !== this._lastIsSpecialReady) {
      if (this.elSpecialContainer) {
        this.elSpecialContainer.classList.toggle('special-ready', isReady);
      }
      if (this.elSpecialFill) {
        this.elSpecialFill.classList.toggle('special-ready-bar', isReady);
      }
      this._lastIsSpecialReady = isReady;
    }

    const cueText = isReady ? 'READY [X]' : (PERCENT_STRINGS[energyInt] || '0%');
    if (cueText !== this._lastSpecialCueText) {
      if (this.elSpecialCue) {
        this.elSpecialCue.textContent = cueText;
        this.elSpecialCue.className = isReady
          ? 'special-cue special-ready-cue'
          : 'special-cue text-white';
      }
      this._lastSpecialCueText = cueText;
    }

    if (moveName !== this._lastSpecialMove) {
      if (this.elSpecialName) {
        this.elSpecialName.textContent = this.formatSpecialMoveShort(moveName);
      }
      this._lastSpecialMove = moveName;
    }

    // 5. Active Power-Up Chips
    this.updatePowerUpChipsRack(
      telemetry.activePowerUps || telemetry.powerUps,
      this.elPowerupRack,
      this.chipPool,
      this._activePowerUpIds
    );
  }

  // ==========================================================================
  // Co-op Multiplayer Telemetry Pipeline
  // ==========================================================================

  private updateCoopPlayer(
    telemetry: DashboardTelemetry,
    p1Score: number,
    p2Score: number,
    _clampedHigh: number
  ): void {
    const p1 = telemetry.p1;
    const p2 = telemetry.p2;

    // ------------------------------------------------------------------------
    // Player 1 Telemetry (Left Zone)
    // ------------------------------------------------------------------------
    if (p1Score !== this._lastScoreP1) {
      if (this.elP1ScoreVal) {
        this.elP1ScoreVal.textContent = this.formatScore6(p1Score);
      }
      this._lastScoreP1 = p1Score;
    }

    const rawLivesP1 = (telemetry as any).p1Lives ?? p1?.lives ?? telemetry.lives ?? 3;
    const clampedLivesP1 = Math.max(0, Math.min(5, Math.floor(isNaN(rawLivesP1) ? 0 : rawLivesP1)));
    if (clampedLivesP1 !== this._lastLivesP1) {
      this.updateLivesIcons(this.elP1LivesContainer, this.lifeIconsP1, clampedLivesP1, this.currentMountedLivesP1);
      this.currentMountedLivesP1 = clampedLivesP1;
      this._lastLivesP1 = clampedLivesP1;
    }

    const rawEnergyP1 =
      (telemetry as any).p1SpecialEnergy ??
      p1?.specialEnergy ??
      p1?.specialGauge ??
      telemetry.specialEnergy ??
      0;
    const energyFloatP1 = rawEnergyP1 <= 1.0 && rawEnergyP1 > 0 ? rawEnergyP1 * 100 : rawEnergyP1;
    const energyIntP1 = Math.max(0, Math.min(100, Math.floor(isNaN(energyFloatP1) ? 0 : energyFloatP1)));

    if (energyIntP1 !== this._lastSpecialIntP1) {
      if (this.elP1SpecialFill) {
        this.elP1SpecialFill.style.width = PERCENT_STRINGS[energyIntP1] || '0%';
      }
      this._lastSpecialIntP1 = energyIntP1;
    }

    const isReadyP1 = (telemetry as any).p1SpecialReady ?? p1?.specialReady ?? (energyIntP1 >= 100);
    if (isReadyP1 !== this._lastIsSpecialReadyP1) {
      if (this.elP1SpecialContainer) {
        this.elP1SpecialContainer.classList.toggle('special-ready', isReadyP1);
      }
      if (this.elP1SpecialFill) {
        this.elP1SpecialFill.classList.toggle('special-ready-bar', isReadyP1);
      }
      this._lastIsSpecialReadyP1 = isReadyP1;
    }

    const cueTextP1 = isReadyP1 ? 'READY [X]' : (PERCENT_STRINGS[energyIntP1] || '0%');
    if (cueTextP1 !== this._lastSpecialCueTextP1) {
      if (this.elP1SpecialCue) {
        this.elP1SpecialCue.textContent = cueTextP1;
        this.elP1SpecialCue.className = isReadyP1
          ? 'special-cue special-ready-cue'
          : 'special-cue text-white';
      }
      this._lastSpecialCueTextP1 = cueTextP1;
    }

    const specNameP1 = p1?.specialName || (telemetry as any).p1SpecialName || 'SP';
    if (specNameP1 !== this._lastSpecialNameP1) {
      if (this.elP1SpecialName) {
        this.elP1SpecialName.textContent = this.formatSpecialMoveShort(specNameP1);
      }
      this._lastSpecialNameP1 = specNameP1;
    }

    const comboP1 = (telemetry as any).p1Combo ?? p1?.combo ?? 1;
    if (comboP1 !== this._lastComboP1) {
      if (this.elP1Combo) {
        this.elP1Combo.textContent = `${comboP1}X`;
      }
      this._lastComboP1 = comboP1;
    }

    // P1 Revive Alert & State Machine
    const stateP1: PlayerStateType = (telemetry as any).p1State ?? p1?.state ?? 'normal';
    const timerP1 = (telemetry as any).p1ReviveTimer ?? p1?.reviveTimer ?? 0;
    const secP1 = Math.max(0, Math.min(15, Math.ceil(timerP1)));
    const p2CanDonate = (telemetry as any).p2CanDonateLife ?? p2?.canDonateLife ?? false;

    if (stateP1 !== this._lastStateP1 || secP1 !== this._lastReviveSecP1 || p2CanDonate !== this._lastP2CanDonate) {
      if (stateP1 === 'revive_pending' || stateP1 === 'REVIVE_PENDING') {
        if (this.zoneLeft) this.zoneLeft.classList.add('revive-active');
        if (this.elP1Container) this.elP1Container.classList.add('revive-active');
        if (this.elP1Revive) {
          this.elP1Revive.style.display = 'block';
          this.elP1Revive.classList.toggle('revive-urgent', timerP1 <= 3.0);
          const donateMsg = p2CanDonate ? ' [L] DONATE LIFE' : '';
          this.elP1Revive.textContent = (REVIVE_COUNTDOWN_STRINGS[secP1] || 'REVIVE: 0S') + donateMsg;
        }
      } else if (stateP1 === 'eliminated' || stateP1 === 'ELIMINATED') {
        if (this.zoneLeft) {
          this.zoneLeft.classList.remove('revive-active');
          this.zoneLeft.classList.add('player-eliminated');
        }
        if (this.elP1Container) {
          this.elP1Container.classList.remove('revive-active');
          this.elP1Container.classList.add('player-eliminated');
        }
        if (this.elP1Revive) {
          this.elP1Revive.style.display = 'block';
          this.elP1Revive.classList.remove('revive-urgent');
          this.elP1Revive.textContent = 'ELIMINATED';
        }
      } else {
        if (this.zoneLeft) {
          this.zoneLeft.classList.remove('revive-active', 'player-eliminated');
        }
        if (this.elP1Container) {
          this.elP1Container.classList.remove('revive-active', 'player-eliminated');
        }
        if (this.elP1Revive) {
          this.elP1Revive.style.display = 'none';
          this.elP1Revive.classList.remove('revive-urgent');
        }
      }
      this._lastStateP1 = stateP1;
      this._lastReviveSecP1 = secP1;
      this._lastP2CanDonate = p2CanDonate;
    }

    // P1 Power-Up Chips
    this.updatePowerUpChipsRack(
      (telemetry as any).p1PowerUps ?? p1?.activePowerUps ?? (p1 as any)?.powerUps,
      this.elP1PowerupRack,
      this.chipPoolP1,
      this._activePowerUpIdsP1
    );

    // ------------------------------------------------------------------------
    // Player 2 Telemetry (Right Zone, Symmetrically Mirrored)
    // ------------------------------------------------------------------------
    if (p2Score !== this._lastScoreP2) {
      if (this.elP2ScoreVal) {
        this.elP2ScoreVal.textContent = this.formatScore6(p2Score);
      }
      this._lastScoreP2 = p2Score;
    }

    const rawLivesP2 = (telemetry as any).p2Lives ?? p2?.lives ?? 0;
    const clampedLivesP2 = Math.max(0, Math.min(5, Math.floor(isNaN(rawLivesP2) ? 0 : rawLivesP2)));
    if (clampedLivesP2 !== this._lastLivesP2) {
      this.updateLivesIcons(this.elP2LivesContainer, this.lifeIconsP2, clampedLivesP2, this.currentMountedLivesP2);
      this.currentMountedLivesP2 = clampedLivesP2;
      this._lastLivesP2 = clampedLivesP2;
    }

    const rawEnergyP2 =
      (telemetry as any).p2SpecialEnergy ??
      p2?.specialEnergy ??
      p2?.specialGauge ??
      0;
    const energyFloatP2 = rawEnergyP2 <= 1.0 && rawEnergyP2 > 0 ? rawEnergyP2 * 100 : rawEnergyP2;
    const energyIntP2 = Math.max(0, Math.min(100, Math.floor(isNaN(energyFloatP2) ? 0 : energyFloatP2)));

    if (energyIntP2 !== this._lastSpecialIntP2) {
      if (this.elP2SpecialFill) {
        this.elP2SpecialFill.style.width = PERCENT_STRINGS[energyIntP2] || '0%';
      }
      this._lastSpecialIntP2 = energyIntP2;
    }

    const isReadyP2 = (telemetry as any).p2SpecialReady ?? p2?.specialReady ?? (energyIntP2 >= 100);
    if (isReadyP2 !== this._lastIsSpecialReadyP2) {
      if (this.elP2SpecialContainer) {
        this.elP2SpecialContainer.classList.toggle('special-ready', isReadyP2);
      }
      if (this.elP2SpecialFill) {
        this.elP2SpecialFill.classList.toggle('special-ready-bar', isReadyP2);
      }
      this._lastIsSpecialReadyP2 = isReadyP2;
    }

    const cueTextP2 = isReadyP2 ? 'READY [M]' : (PERCENT_STRINGS[energyIntP2] || '0%');
    if (cueTextP2 !== this._lastSpecialCueTextP2) {
      if (this.elP2SpecialCue) {
        this.elP2SpecialCue.textContent = cueTextP2;
        this.elP2SpecialCue.className = isReadyP2
          ? 'special-cue special-ready-cue'
          : 'special-cue text-white';
      }
      this._lastSpecialCueTextP2 = cueTextP2;
    }

    const specNameP2 = p2?.specialName || (telemetry as any).p2SpecialName || 'SP';
    if (specNameP2 !== this._lastSpecialNameP2) {
      if (this.elP2SpecialName) {
        this.elP2SpecialName.textContent = this.formatSpecialMoveShort(specNameP2);
      }
      this._lastSpecialNameP2 = specNameP2;
    }

    const comboP2 = (telemetry as any).p2Combo ?? p2?.combo ?? 1;
    if (comboP2 !== this._lastComboP2) {
      if (this.elP2Combo) {
        this.elP2Combo.textContent = `${comboP2}X`;
      }
      this._lastComboP2 = comboP2;
    }

    // P2 Revive Alert & State Machine
    const stateP2: PlayerStateType = (telemetry as any).p2State ?? p2?.state ?? 'normal';
    const timerP2 = (telemetry as any).p2ReviveTimer ?? p2?.reviveTimer ?? 0;
    const secP2 = Math.max(0, Math.min(15, Math.ceil(timerP2)));
    const p1CanDonate = (telemetry as any).p1CanDonateLife ?? p1?.canDonateLife ?? false;

    if (stateP2 !== this._lastStateP2 || secP2 !== this._lastReviveSecP2 || p1CanDonate !== this._lastP1CanDonate) {
      if (stateP2 === 'revive_pending' || stateP2 === 'REVIVE_PENDING') {
        if (this.zoneRight) this.zoneRight.classList.add('revive-active');
        if (this.elP2Container) this.elP2Container.classList.add('revive-active');
        if (this.elP2Revive) {
          this.elP2Revive.style.display = 'block';
          this.elP2Revive.classList.toggle('revive-urgent', timerP2 <= 3.0);
          const donateMsg = p1CanDonate ? ' [L] DONATE LIFE' : '';
          this.elP2Revive.textContent = (REVIVE_COUNTDOWN_STRINGS[secP2] || 'REVIVE: 0S') + donateMsg;
        }
      } else if (stateP2 === 'eliminated' || stateP2 === 'ELIMINATED') {
        if (this.zoneRight) {
          this.zoneRight.classList.remove('revive-active');
          this.zoneRight.classList.add('player-eliminated');
        }
        if (this.elP2Container) {
          this.elP2Container.classList.remove('revive-active');
          this.elP2Container.classList.add('player-eliminated');
        }
        if (this.elP2Revive) {
          this.elP2Revive.style.display = 'block';
          this.elP2Revive.classList.remove('revive-urgent');
          this.elP2Revive.textContent = 'ELIMINATED';
        }
      } else {
        if (this.zoneRight) {
          this.zoneRight.classList.remove('revive-active', 'player-eliminated');
        }
        if (this.elP2Container) {
          this.elP2Container.classList.remove('revive-active', 'player-eliminated');
        }
        if (this.elP2Revive) {
          this.elP2Revive.style.display = 'none';
          this.elP2Revive.classList.remove('revive-urgent');
        }
      }
      this._lastStateP2 = stateP2;
      this._lastReviveSecP2 = secP2;
      this._lastP1CanDonate = p1CanDonate;
    }

    // P2 Power-Up Chips
    this.updatePowerUpChipsRack(
      (telemetry as any).p2PowerUps ?? p2?.activePowerUps ?? (p2 as any)?.powerUps,
      this.elP2PowerupRack,
      this.chipPoolP2,
      this._activePowerUpIdsP2
    );

    // ------------------------------------------------------------------------
    // Shared Center Telemetry (Stage Badge & Warning Banner)
    // ------------------------------------------------------------------------
    const stage = telemetry.stage || 1;
    if (stage !== this._lastStage) {
      if (this.elStageBadge) {
        this.elStageBadge.textContent = stage < 10 ? `STAGE 0${stage}` : `STAGE ${stage}`;
      }
      this._lastStage = stage;
    }

    let warningText = telemetry.crisisWarning || '';
    if (!warningText) {
      if ((stateP1 === 'revive_pending' || stateP1 === 'REVIVE_PENDING') && p2CanDonate) {
        warningText = '[L] DONATE LIFE';
      } else if ((stateP2 === 'revive_pending' || stateP2 === 'REVIVE_PENDING') && p1CanDonate) {
        warningText = '[L] DONATE LIFE';
      } else if (stateP1 === 'revive_pending' || stateP1 === 'REVIVE_PENDING') {
        warningText = REVIVE_P1_STRINGS[secP1] || 'REVIVE P1: 0S';
      } else if (stateP2 === 'revive_pending' || stateP2 === 'REVIVE_PENDING') {
        warningText = REVIVE_P2_STRINGS[secP2] || 'REVIVE P2: 0S';
      }
    }

    if (warningText !== this._lastWarningText) {
      if (this.elWarningBanner) {
        if (warningText) {
          this.elWarningBanner.style.display = 'block';
          if (this.elWarningText) this.elWarningText.textContent = warningText;
        } else {
          this.elWarningBanner.style.display = 'none';
        }
      }
      this._lastWarningText = warningText;
    }
  }

  // ==========================================================================
  // Helper Updaters
  // ==========================================================================

  private updateLivesIcons(
    container: HTMLElement | null,
    icons: HTMLElement[],
    count: number,
    currentMounted: number
  ): void {
    if (!container) return;

    let mounted = currentMounted;
    while (mounted < count) {
      const icon = icons[mounted];
      if (icon) {
        container.appendChild(icon);
      }
      mounted++;
    }

    while (mounted > count) {
      mounted--;
      const icon = icons[mounted];
      if (icon && icon.parentElement) {
        icon.parentElement.removeChild(icon);
      }
    }
  }

  private updatePowerUpChipsRack(
    chips: readonly any[] | undefined,
    rackEl: HTMLElement | null,
    pool: Map<string, PreallocatedChip>,
    activeIds: Set<string>
  ): void {
    if (!rackEl) return;

    activeIds.clear();

    if (chips && chips.length > 0) {
      for (let i = 0; i < chips.length; i++) {
        const item = chips[i];
        if (!item) continue;

        const id = item.id || item.type;
        const type = item.type || id;
        const remaining =
          item.remainingDuration !== undefined
            ? item.remainingDuration
            : item.remainingTime !== undefined
            ? item.remainingTime
            : 0;

        const isActive = item.isActive !== undefined ? item.isActive : remaining > 0;
        if (!isActive && remaining <= 0) {
          continue;
        }

        activeIds.add(id);

        let chip = pool.get(id);
        if (!chip) {
          chip = this.createPowerUpChip(id, type, item);
          pool.set(id, chip);
        }

        if (!chip.isMounted) {
          rackEl.appendChild(chip.element);
          chip.isMounted = true;
        }

        const total =
          item.totalDuration !== undefined
            ? item.totalDuration
            : item.maxDuration !== undefined
            ? item.maxDuration
            : (DEFAULT_CHIP_META[type] ? DEFAULT_CHIP_META[type].duration : 15.0);

        let progressPct = 100;
        if (item.progress !== undefined) {
          progressPct = Math.max(0, Math.min(100, Math.round(item.progress * 100)));
        } else if (total > 0) {
          progressPct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
        }

        if (progressPct !== chip.lastProgressInt) {
          chip.barElement.style.width = PERCENT_STRINGS[progressPct] || `${progressPct}%`;
          chip.lastProgressInt = progressPct;
        }

        const color =
          item.color || item.primaryColor || (DEFAULT_CHIP_META[type] ? DEFAULT_CHIP_META[type].color : '#00ffff');
        if (color !== chip.lastColor) {
          chip.element.style.borderColor = color;
          chip.barElement.style.backgroundColor = color;
          chip.lastColor = color;
        }
      }
    }

    // Unmount inactive chips
    for (const [id, chip] of pool.entries()) {
      if (chip.isMounted && !activeIds.has(id)) {
        if (chip.element.parentElement) {
          chip.element.parentElement.removeChild(chip.element);
        }
        chip.isMounted = false;
        chip.lastProgressInt = -1;
      }
    }
  }

  private createPowerUpChip(
    id: string,
    type: string,
    item: any
  ): PreallocatedChip {
    const meta = DEFAULT_CHIP_META[type] || {
      code: type.slice(0, 3).toUpperCase(),
      label: item.name || item.label || type,
      color: item.color || item.primaryColor || '#00ffff',
      duration: 15.0,
    };

    const element = document.createElement('div');
    element.id = `chip-${id.toLowerCase()}`;
    element.className = `powerup-chip dash-chip chip-${meta.code.toLowerCase()}`;
    element.classList.add('powerup-chip');
    element.classList.add('dash-chip');
    element.setAttribute('data-type', type);
    element.title = item.name || item.label || meta.label;

    const codeElement = document.createElement('span');
    codeElement.className = 'chip-code';
    codeElement.textContent = meta.code;
    element.appendChild(codeElement);

    const meter = document.createElement('div');
    meter.className = 'chip-meter';

    const barElement = document.createElement('div');
    barElement.className = 'powerup-progress-bar chip-bar';
    barElement.classList.add('powerup-progress-bar');
    barElement.classList.add('chip-bar');
    barElement.style.width = '100%';

    const color = item.color || item.primaryColor || meta.color;
    element.style.borderColor = color;
    barElement.style.backgroundColor = color;

    meter.appendChild(barElement);
    element.appendChild(meter);

    return {
      element,
      barElement,
      codeElement,
      isMounted: false,
      lastProgressInt: 100,
      lastColor: color,
    };
  }

  // ==========================================================================
  // Zero-Allocation Formatters
  // ==========================================================================

  private formatScore6(n: number): string {
    if (typeof n !== 'number' || isNaN(n) || n <= 0) {
      return '000000';
    }
    const intVal = Math.floor(n);
    if (intVal <= 0) return '000000';
    const s = intVal.toString();
    const len = s.length;
    if (len >= 6) return s;
    switch (len) {
      case 1: return '00000' + s;
      case 2: return '0000' + s;
      case 3: return '000' + s;
      case 4: return '00' + s;
      case 5: return '0' + s;
      default: return s;
    }
  }

  private formatSpecialMoveShort(moveName: string): string {
    switch (moveName) {
      case 'NOVA_BARRAGE':
      case 'nova':
        return 'NOVA';
      case 'CHRONO_FREEZE':
      case 'chrono':
        return 'CHRONO';
      case 'WARP_RAM':
      case 'warp':
        return 'WARP';
      default:
        return moveName.slice(0, 6).toUpperCase();
    }
  }
}
