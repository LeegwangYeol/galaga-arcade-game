/**
 * Devouring Swarm Frenzy Crisis Event
 * Hive Fleet Blitz: Formation abandoned, continuous high-speed dive-bombing.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class DevouringSwarmFrenzyEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.DEVOURING_SWARM_FRENZY;
  public readonly name = 'DEVOURING SWARM FRENZY';
  public readonly flavorText = 'HIVE FLEET BLITZ: ALL UNITS DIVE BOMB NOW';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private savedDiveInterval: number = 3.0;
  private savedMaxDivers: number = 2;
  private savedDiveSpeedMult: number = 1.0;

  protected override onInit(): void {
    // Initializer
  }

  protected override onActivated(): void {
    const fm = this.context?.formationManager;
    if (!fm) return;

    // 1. Save original difficulty parameters
    this.savedDiveInterval = fm.diveInterval ?? 3.0;
    this.savedMaxDivers = fm.maxConcurrentDivers ?? 2;
    this.savedDiveSpeedMult = fm.diveSpeedMultiplier ?? 1.0;

    // 2. Overclock dive scheduler
    fm.diveInterval = 0.25;
    fm.maxConcurrentDivers = 8;
    fm.diveSpeedMultiplier = this.savedDiveSpeedMult * 1.25;

    // 3. Immediately peel off living formation enemies
    const playerX = this.context.player?.x ?? 112;
    const living = fm.getLivingEnemies?.() ?? [];
    for (const enemy of living) {
      if (enemy.state === 'IN_FORMATION') {
        fm.peelOffSolo?.(enemy, playerX);
      }
    }
  }

  protected override onActiveUpdate(_dt: number): void {
    const fm = this.context?.formationManager;
    if (!fm) return;

    // Continuously enforce dive saturation
    if (fm.diveInterval > 0.3) {
      fm.diveInterval = 0.25;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    // Pulsing blood-red perimeter vignette
    ctx.save();
    const pulse = 0.22 + 0.18 * Math.sin(this.elapsedTime * 8 * Math.PI);
    ctx.fillStyle = `rgba(220, 38, 38, ${pulse})`;

    const borderThick = 3;
    ctx.fillRect(0, 0, 224, borderThick); // Top
    ctx.fillRect(0, 288 - borderThick, 224, borderThick); // Bottom
    ctx.fillRect(0, 0, borderThick, 288); // Left
    ctx.fillRect(224 - borderThick, 0, borderThick, 288); // Right
    ctx.restore();
  }

  protected override onDeactivated(): void {
    const fm = this.context?.formationManager;
    if (!fm) return;

    // Strictly restore baseline parameters
    fm.diveInterval = this.savedDiveInterval;
    fm.maxConcurrentDivers = this.savedMaxDivers;
    fm.diveSpeedMultiplier = this.savedDiveSpeedMult;
  }

  protected override onReset(): void {
    this.onDeactivated();
  }
}
