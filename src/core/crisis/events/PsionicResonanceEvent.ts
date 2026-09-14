/**
 * Psionic Resonance Crisis Event
 * Shroud Breach: Dimensional phantoms manifest in formation, taking 0 damage and awarding 0 score.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType, EnemyType } from '../types';

export interface PhantomUnit {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  state: 'FORMATION' | 'DIVING' | 'DISSIPATING';
  diveTimer: number;
  alpha: number;
  active: boolean;
}

export class PsionicResonanceEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.PSIONIC_RESONANCE;
  public readonly name = 'PSIONIC RESONANCE';
  public readonly flavorText = 'SHROUD BREACH: DIMENSIONAL PHANTOMS MANIFEST';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  public phantoms: PhantomUnit[] = [];
  private diveIntervalTimer: number = 0;
  private bulletsToRecycle: any[] = [];

  protected override onInit(): void {
    this.phantoms = [];
    this.bulletsToRecycle.length = 0;
    this.diveIntervalTimer = 0;
  }

  protected override onActivated(): void {
    this.phantoms = [];
    const types = [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS];

    // Spawn 6 phantoms positioned in auxiliary slots
    for (let i = 0; i < 6; i++) {
      const col = 2 + (i % 6);
      const row = 1 + Math.floor(i / 3);
      const homeX = 112 + (col - 4.5) * 16;
      const homeY = 52 + row * 16;

      this.phantoms.push({
        id: `phantom_${i}`,
        type: types[i % types.length]!,
        x: homeX,
        y: homeY,
        homeX,
        homeY,
        vx: 0,
        vy: 0,
        state: 'FORMATION',
        diveTimer: 0,
        alpha: 0.45,
        active: true,
      });
    }
  }

  protected override onActiveUpdate(dt: number): void {
    this.diveIntervalTimer += dt;

    // Trigger periodic phantom dive
    if (this.diveIntervalTimer >= 2.6) {
      this.diveIntervalTimer = 0;
      const readyPhantom = this.phantoms.find(p => p.active && p.state === 'FORMATION');
      if (readyPhantom) {
        readyPhantom.state = 'DIVING';
        readyPhantom.vy = 135;
      }
    }

    // Update phantoms
    for (const p of this.phantoms) {
      if (!p.active) continue;

      if (p.state === 'FORMATION') {
        const breathingOffset = this.context.formationManager?.elapsedTime ?? this.elapsedTime;
        p.x = p.homeX + Math.sin(breathingOffset * 2.0) * 8;
        p.y = p.homeY;
      } else if (p.state === 'DIVING') {
        p.diveTimer += dt;
        p.x += Math.sin(p.diveTimer * 4.0) * 45 * dt;
        p.y += p.vy * dt;

        if (p.y > 295) {
          p.state = 'FORMATION';
          p.x = p.homeX;
          p.y = p.homeY;
          p.diveTimer = 0;
        }
      }
    }

    // Check bullet collisions with phantoms (0 score, bullet consumed)
    if (this.context?.bulletManager) {
      const bm = this.context.bulletManager;
      this.bulletsToRecycle.length = 0;
      const iterateBullets = bm.forEachActivePlayerBullet
        ? (cb: (b: any) => void) => bm.forEachActivePlayerBullet(cb)
        : (cb: (b: any) => void) => bm.forEachPlayerBullet?.(cb);

      if (iterateBullets) {
        iterateBullets((bullet: any) => {
          if (!bullet.active || !bullet.position) return;
          const bx = bullet.position.x;
          const by = bullet.position.y;

          for (const p of this.phantoms) {
            if (!p.active) continue;
            if (Math.abs(bx - p.x) <= 8 && Math.abs(by - p.y) <= 8) {
              this.bulletsToRecycle.push(bullet);
              p.active = false; // Phantom dispels with 0 score!
              try {
                this.context.particleSystem?.spawnExplosion?.(p.x, p.y, 'HIT');
              } catch {
                // Defensive
              }
              break;
            }
          }
        });
      }

      for (const b of this.bulletsToRecycle) {
        bm.recycle(b);
      }
      this.bulletsToRecycle.length = 0;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();
    for (const p of this.phantoms) {
      if (!p.active) continue;

      ctx.globalAlpha = p.alpha + Math.sin(this.elapsedTime * 6.0) * 0.15;
      // Draw ethereal violet phantom outline
      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.floor(p.x - 7), Math.floor(p.y - 7), 14, 14);

      // Draw phantom core glyph
      ctx.fillStyle = '#E879F9';
      ctx.fillRect(Math.floor(p.x - 4), Math.floor(p.y - 4), 8, 8);
    }
    ctx.restore();
  }

  protected override onDeactivated(): void {
    this.phantoms = [];
    this.bulletsToRecycle.length = 0;
  }

  protected override onReset(): void {
    this.phantoms = [];
    this.bulletsToRecycle.length = 0;
    this.diveIntervalTimer = 0;
  }
}
