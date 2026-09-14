/**
 * Galaga Arcade Web Game — Milestone M28
 * Modernized Bottom HUD & Cyber-Arcade Dashboard Panel Component
 *
 * Implements an arcade-cabinet style bottom dashboard docked beneath the canvas:
 * - Zone 1 (Left): 6-digit score/high score & procedural SVG ship lives rack
 * - Zone 2 (Center): Active power-up item badge chips with duration meters & special move charge bar
 * - Zone 3 (Right): Controls guide legend & tactical utility buttons (Mute, Fullscreen, Pause)
 *
 * Designed with strict Zero-GC dirty checking:
 * 0 DOM allocations and 0 layout thrashing during steady 60 FPS gameplay loop.
 */

import { PowerUpType } from '../core/powerups/types';

// ============================================================================
// Types & Contracts
// ============================================================================

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

export interface DashboardTelemetry {
  score: number;
  highScore: number;
  isNewHighScore?: boolean;
  lives: number;
  reserveLives?: number;
  stage?: number;
  activePowerUps?: readonly (PowerUpChipTelemetry | ActivePowerUpTelemetry)[];
  activePowerUpCount?: number;
  specialEnergy?: number;
  specialCharge?: number;
  isSpecialReady?: boolean;
  specialReady?: boolean;
  specialActive?: boolean;
  selectedSpecial?: string;
  isMuted?: boolean;
  isFullscreen?: boolean;
  isPaused?: boolean;
  canPause?: boolean;
}

export type DashboardState = DashboardTelemetry;

export interface BottomDashboardOptions {
  container?: HTMLElement | string | null;
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

// ============================================================================
// Default Power-Up Palette & Metas
// ============================================================================

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

// ============================================================================
// BottomDashboard Class
// ============================================================================

export class BottomDashboard {
  public element: HTMLElement | null = null;
  private options: BottomDashboardOptions;

  // Cached DOM Nodes
  private zoneLeft: HTMLElement | null = null;
  private zoneCenter: HTMLElement | null = null;
  private zoneRight: HTMLElement | null = null;

  private elScoreVal: HTMLElement | null = null;
  private elHighVal: HTMLElement | null = null;
  private elLivesContainer: HTMLElement | null = null;
  private elPowerupRack: HTMLElement | null = null;

  private elSpecialContainer: HTMLElement | null = null;
  private elSpecialTrack: HTMLElement | null = null;
  private elSpecialFill: HTMLElement | null = null;
  private elSpecialName: HTMLElement | null = null;
  private elSpecialCue: HTMLElement | null = null;

  private elLegend: HTMLElement | null = null;
  private elBtnMute: HTMLElement | null = null;
  private elBtnFullscreen: HTMLElement | null = null;
  private elBtnPause: HTMLElement | null = null;

  // Pre-allocated Life Icons Pool
  private lifeIcons: HTMLElement[] = [];
  private currentMountedLives: number = 0;

  // Pre-allocated Chips Pool
  private chipPool: Map<string, PreallocatedChip> = new Map();
  // Zero-GC Pre-allocated Set for Active Power-Up IDs
  private _activePowerUpIds: Set<string> = new Set<string>();

  // Dirty Checking Cache State (Zero-GC)
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
      this.element.className = 'bottom-dashboard cyber-dashboard';
      this.element.classList.add('bottom-dashboard');
      this.element.classList.add('cyber-dashboard');
      this.element.setAttribute('role', 'region');
      this.element.setAttribute('aria-label', 'Arcade Bottom Dashboard');
    } else {
      this.element = document.createElement('div');
      this.element.id = 'bottom-dashboard';
      this.element.className = 'bottom-dashboard cyber-dashboard';
      this.element.classList.add('bottom-dashboard');
      this.element.classList.add('cyber-dashboard');
      this.element.setAttribute('role', 'region');
      this.element.setAttribute('aria-label', 'Arcade Bottom Dashboard');
      container.appendChild(this.element);
    }

    this.buildZoneLeft();
    this.buildZoneCenter();
    this.buildZoneRight();

    this.attachEventListeners();

    return true;
  }

  public getElement(): HTMLElement | null {
    return this.element;
  }

  public isCompactMode(): boolean {
    return this._isCompactMode;
  }

  public setCompactMode(compact: boolean): void {
    this._isCompactMode = compact;
    if (this.element) {
      this.element.classList.toggle('compact-mode', compact);
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
    this._activePowerUpIds.clear();

    if (this.elScoreVal) this.elScoreVal.textContent = '000000';
    if (this.elHighVal) {
      this.elHighVal.textContent = '020000';
      this.elHighVal.classList.remove('high-score-flash');
    }

    // Clear chips
    if (this.elPowerupRack) {
      for (const chip of this.chipPool.values()) {
        if (chip.isMounted && chip.element.parentElement) {
          chip.element.parentElement.removeChild(chip.element);
          chip.isMounted = false;
        }
      }
    }

    // Reset lives
    while (this.currentMountedLives > 0) {
      this.currentMountedLives--;
      const icon = this.lifeIcons[this.currentMountedLives];
      if (icon && icon.parentElement) {
        icon.parentElement.removeChild(icon);
      }
    }

    if (this.elSpecialFill) this.elSpecialFill.style.width = '0%';
    if (this.elSpecialContainer) this.elSpecialContainer.classList.remove('special-ready');
    if (this.elSpecialCue) {
      this.elSpecialCue.textContent = '0%';
      this.elSpecialCue.className = 'special-cue text-white';
    }

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

  public destroy(): void {
    this.detachEventListeners();

    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }

    this.element = null;
    this.zoneLeft = null;
    this.zoneCenter = null;
    this.zoneRight = null;
    this.elScoreVal = null;
    this.elHighVal = null;
    this.elLivesContainer = null;
    this.elPowerupRack = null;
    this.elSpecialContainer = null;
    this.elSpecialTrack = null;
    this.elSpecialFill = null;
    this.elSpecialName = null;
    this.elSpecialCue = null;
    this.elLegend = null;
    this.elBtnMute = null;
    this.elBtnFullscreen = null;
    this.elBtnPause = null;
    this.lifeIcons = [];
    this.chipPool.clear();
    this._activePowerUpIds.clear();
    this._lastSpecialCueText = '';
    this.currentMountedLives = 0;
  }

  // ==========================================================================
  // Zone Builders
  // ==========================================================================

  private buildZoneLeft(): void {
    if (!this.element) return;

    this.zoneLeft = document.createElement('div');
    this.zoneLeft.className = 'dash-zone zone-left dashboard-zone-left';
    this.zoneLeft.classList.add('dash-zone');
    this.zoneLeft.classList.add('zone-left');
    this.zoneLeft.classList.add('dashboard-zone-left');

    // Score Rack
    const scoreRack = document.createElement('div');
    scoreRack.className = 'dash-score-rack';

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
    const entryHigh = document.createElement('div');
    entryHigh.className = 'dash-score-entry';
    const labelHigh = document.createElement('span');
    labelHigh.className = 'dash-label text-yellow';
    labelHigh.textContent = 'HIGH';
    this.elHighVal = document.createElement('span');
    this.elHighVal.id = 'dashboard-high-score';
    this.elHighVal.className = 'dash-val text-yellow dashboard-high-score';
    this.elHighVal.textContent = '020000';
    entryHigh.appendChild(labelHigh);
    entryHigh.appendChild(this.elHighVal);

    scoreRack.appendChild(entryScore);
    scoreRack.appendChild(entryHigh);

    // Lives Rack
    const livesRack = document.createElement('div');
    livesRack.className = 'dash-lives-rack';
    const labelLives = document.createElement('span');
    labelLives.className = 'dash-label text-grey';
    labelLives.textContent = 'SHIPS';

    this.elLivesContainer = document.createElement('div');
    this.elLivesContainer.id = 'dashboard-lives';
    this.elLivesContainer.className = 'dash-lives-icons dashboard-lives';
    this.elLivesContainer.setAttribute('aria-label', 'Reserve Lives');

    // Pre-create 5 SVG Ship Icons
    this.lifeIcons = [];
    for (let i = 0; i < 5; i++) {
      const icon = this.createShipIcon();
      this.lifeIcons.push(icon);
    }

    livesRack.appendChild(labelLives);
    livesRack.appendChild(this.elLivesContainer);

    this.zoneLeft.appendChild(scoreRack);
    this.zoneLeft.appendChild(livesRack);
    this.element.appendChild(this.zoneLeft);
  }

  private buildZoneCenter(): void {
    if (!this.element) return;

    this.zoneCenter = document.createElement('div');
    this.zoneCenter.className = 'dash-zone zone-center dashboard-zone-center';
    this.zoneCenter.classList.add('dash-zone');
    this.zoneCenter.classList.add('zone-center');
    this.zoneCenter.classList.add('dashboard-zone-center');

    // Power-Up Chips Rack
    this.elPowerupRack = document.createElement('div');
    this.elPowerupRack.id = 'dashboard-powerups';
    this.elPowerupRack.className = 'dash-chip-rack dashboard-powerups';
    this.elPowerupRack.setAttribute('aria-label', 'Active Power-Ups');

    // Special Move Rack / Container
    this.elSpecialContainer = document.createElement('div');
    this.elSpecialContainer.className = 'dash-special-rack dashboard-special-container';
    this.elSpecialContainer.classList.add('dash-special-rack');
    this.elSpecialContainer.classList.add('dashboard-special-container');

    const header = document.createElement('div');
    header.className = 'dash-special-header';

    this.elSpecialName = document.createElement('span');
    this.elSpecialName.className = 'special-name text-cyan';
    this.elSpecialName.textContent = 'SP';

    this.elSpecialCue = document.createElement('span');
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
    this.element.appendChild(this.zoneCenter);
  }

  private buildZoneRight(): void {
    if (!this.element) return;

    this.zoneRight = document.createElement('div');
    this.zoneRight.className = 'dash-zone zone-right dashboard-zone-right';
    this.zoneRight.classList.add('dash-zone');
    this.zoneRight.classList.add('zone-right');
    this.zoneRight.classList.add('dashboard-zone-right');

    // Controls Legend
    this.elLegend = document.createElement('div');
    this.elLegend.className = 'controls-legend';
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

    // Tactical Actions Buttons
    const actions = document.createElement('div');
    actions.className = 'dash-actions';

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

    actions.appendChild(this.elBtnMute);
    actions.appendChild(this.elBtnFullscreen);
    actions.appendChild(this.elBtnPause);

    this.zoneRight.appendChild(this.elLegend);
    this.zoneRight.appendChild(actions);
    this.element.appendChild(this.zoneRight);
  }

  // ==========================================================================
  // Procedural SVG Ship Icon Factory
  // ==========================================================================

  private createShipIcon(): HTMLElement {
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
    icon.setAttribute('class', 'ship-icon ship-life-icon');
    icon.classList.add('ship-icon');
    icon.classList.add('ship-life-icon');
    icon.innerHTML =
      '<path fill="#E70000" d="M7 0h2v2H7zM6 2h4v2H6zM5 4h6v2H5zM2 6h12v2H2zM1 8h14v2H1zM2 10h12v2H2zM3 12h10v2H3zM5 14h6v2H5z"/>' +
      '<path fill="#FFFFFF" d="M7 2h2v4H7zM6 6h4v4H6zM7 10h2v2H7z"/>' +
      '<path fill="#00FFFF" d="M5 8h2v2H5zM9 8h2v2H9z"/>' +
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

    // 1. Score Dirty-Check & Formatting
    const rawScore = typeof telemetry.score === 'number' ? telemetry.score : 0;
    const clampedScore = isNaN(rawScore) || rawScore < 0 ? 0 : Math.floor(rawScore);
    if (clampedScore !== this._lastScore) {
      if (this.elScoreVal) {
        this.elScoreVal.textContent = this.formatScore6(clampedScore);
      }
      this._lastScore = clampedScore;
    }

    // 2. High Score Dirty-Check & New Record Flash
    const rawHigh = typeof telemetry.highScore === 'number' ? telemetry.highScore : 0;
    const clampedHigh = isNaN(rawHigh) || rawHigh < 0 ? 0 : Math.floor(rawHigh);
    if (clampedHigh !== this._lastHighScore) {
      if (this.elHighVal) {
        this.elHighVal.textContent = this.formatScore6(clampedHigh);
      }
      this._lastHighScore = clampedHigh;
    }

    const isNewRecord =
      telemetry.isNewHighScore === true || (clampedScore > 0 && clampedScore >= clampedHigh);
    if (isNewRecord !== this._lastIsNewRecord) {
      if (this.elHighVal) {
        this.elHighVal.classList.toggle('high-score-flash', isNewRecord);
      }
      this._lastIsNewRecord = isNewRecord;
    }

    // 3. Lives Icons Dirty-Check (0 to 5)
    const rawLives = typeof telemetry.lives === 'number' ? telemetry.lives : 0;
    const clampedLives = Math.max(0, Math.min(5, Math.floor(isNaN(rawLives) ? 0 : rawLives)));
    if (clampedLives !== this._lastLives) {
      this.updateLivesIcons(clampedLives);
      this._lastLives = clampedLives;
    }

    // 4. Special Move Charge Gauge
    const rawEnergy =
      telemetry.specialEnergy !== undefined
        ? telemetry.specialEnergy
        : telemetry.specialCharge !== undefined
        ? telemetry.specialCharge
        : 0;
    const clampedEnergy = Math.max(0, Math.min(100, isNaN(rawEnergy) ? 0 : rawEnergy));
    const energyInt = Math.floor(clampedEnergy);

    if (energyInt !== this._lastSpecialEnergyInt) {
      if (this.elSpecialFill) {
        this.elSpecialFill.style.width = `${energyInt}%`;
      }
      if (this.elSpecialTrack) {
        this.elSpecialTrack.setAttribute('aria-valuenow', energyInt.toString());
      }
      this._lastSpecialEnergyInt = energyInt;
    }

    // 5. Special Ready & Move Name
    const isReady = telemetry.isSpecialReady ?? telemetry.specialReady ?? (energyInt >= 100);
    const moveName = telemetry.selectedSpecial || 'SP';

    if (isReady !== this._lastIsSpecialReady) {
      if (this.elSpecialContainer) {
        this.elSpecialContainer.classList.toggle('special-ready', isReady);
      }
      if (this.elSpecialFill) {
        this.elSpecialFill.classList.toggle('special-ready-bar', isReady);
      }
      this._lastIsSpecialReady = isReady;
    }

    const cueText = isReady ? 'READY [X]' : `${energyInt}%`;
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

    // 6. Active Power-Up Chips
    this.updatePowerUpChips(telemetry.activePowerUps);

    // 7. Tactical Action Buttons
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
  // Helper Updaters
  // ==========================================================================

  private updateLivesIcons(count: number): void {
    if (!this.elLivesContainer) return;

    while (this.currentMountedLives < count) {
      const icon = this.lifeIcons[this.currentMountedLives];
      if (icon) {
        this.elLivesContainer.appendChild(icon);
      }
      this.currentMountedLives++;
    }

    while (this.currentMountedLives > count) {
      this.currentMountedLives--;
      const icon = this.lifeIcons[this.currentMountedLives];
      if (icon && icon.parentElement) {
        icon.parentElement.removeChild(icon);
      }
    }
  }

  private updatePowerUpChips(
    chips?: readonly (PowerUpChipTelemetry | ActivePowerUpTelemetry)[]
  ): void {
    if (!this.elPowerupRack) return;

    this._activePowerUpIds.clear();

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

        this._activePowerUpIds.add(id);

        let chip = this.chipPool.get(id);
        if (!chip) {
          chip = this.createPowerUpChip(id, type, item);
          this.chipPool.set(id, chip);
        }

        if (!chip.isMounted) {
          this.elPowerupRack.appendChild(chip.element);
          chip.isMounted = true;
        }

        // Calculate progress percentage
        const total =
          item.totalDuration !== undefined
            ? item.totalDuration
            : item.maxDuration !== undefined
            ? item.maxDuration
            : DEFAULT_CHIP_META[type]?.duration || 15.0;

        let progressPct = 100;
        if (item.progress !== undefined) {
          progressPct = Math.max(0, Math.min(100, Math.round(item.progress * 100)));
        } else if (total > 0) {
          progressPct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
        }

        if (progressPct !== chip.lastProgressInt) {
          chip.barElement.style.width = `${progressPct}%`;
          chip.lastProgressInt = progressPct;
        }

        const color =
          item.color || item.primaryColor || DEFAULT_CHIP_META[type]?.color || '#00ffff';
        if (color !== chip.lastColor) {
          chip.element.style.borderColor = color;
          chip.barElement.style.backgroundColor = color;
          chip.lastColor = color;
        }
      }
    }

    // Unmount any previously mounted chips that are no longer active
    for (const [id, chip] of this.chipPool.entries()) {
      if (chip.isMounted && !this._activePowerUpIds.has(id)) {
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
    item: PowerUpChipTelemetry | ActivePowerUpTelemetry
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
  // Zero-Allocation Formatter
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
