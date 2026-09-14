/**
 * Nanite Cloud Crisis Event
 * Gray Tempest: Smog occludes playfield; bullets dissolve into shrapnel upon penetration.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

interface NaniteCluster {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
  wobbleSpeed: number;
  wobblePhase: number;
}

interface NaniteShrapnel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export class NaniteCloudEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.NANITE_CLOUD;
  public readonly name = 'NANITE CLOUD';
  public readonly flavorText = 'GRAY TEMPEST: NANITE SMOG OCCLUDING PLAYFIELD';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private clusters: NaniteCluster[] = [];
  private shrapnelPool: NaniteShrapnel[] = [];
  private static readonly MAX_SHRAPNEL = 32;

  protected override onInit(): void {
    this.clusters = [
      { x: 50, y: 75, baseX: 50, baseY: 75, rx: 38, ry: 22, vx: 12, vy: 2, wobbleSpeed: 1.2, wobblePhase: 0 },
      { x: 165, y: 95, baseX: 165, baseY: 95, rx: 42, ry: 25, vx: -14, vy: -2, wobbleSpeed: 0.9, wobblePhase: 1.5 },
      { x: 80, y: 140, baseX: 80, baseY: 140, rx: 36, ry: 20, vx: 15, vy: 3, wobbleSpeed: 1.4, wobblePhase: 3.1 },
      { x: 145, y: 175, baseX: 145, baseY: 175, rx: 40, ry: 24, vx: -11, vy: -1, wobbleSpeed: 1.1, wobblePhase: 4.5 },
    ];
    this.shrapnelPool = [];
    for (let i = 0; i < NaniteCloudEvent.MAX_SHRAPNEL; i++) {
      this.shrapnelPool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 0.25, color: '#CBD5E1' });
    }
  }

  protected override onActivated(): void {
    // Reset cluster positions
    this.clusters[0]!.x = 50; this.clusters[0]!.y = 75;
    this.clusters[1]!.x = 165; this.clusters[1]!.y = 95;
    this.clusters[2]!.x = 80; this.clusters[2]!.y = 140;
    this.clusters[3]!.x = 145; this.clusters[3]!.y = 175;
    for (const s of this.shrapnelPool) {
      s.life = s.maxLife;
    }
  }

  protected override onActiveUpdate(dt: number): void {
    // 1. Update cloud clusters
    for (const c of this.clusters) {
      c.wobblePhase += c.wobbleSpeed * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt + Math.sin(c.wobblePhase) * 4 * dt;

      // Soft bounce on margins
      if (c.x - c.rx < 10) { c.x = 10 + c.rx; c.vx = Math.abs(c.vx); }
      if (c.x + c.rx > 214) { c.x = 214 - c.rx; c.vx = -Math.abs(c.vx); }
      if (c.y - c.ry < 40) { c.y = 40 + c.ry; c.vy = Math.abs(c.vy); }
      if (c.y + c.ry > 195) { c.y = 195 - c.ry; c.vy = -Math.abs(c.vy); }
    }

    // 2. Dissolve player bullets passing through clouds
    if (this.context?.bulletManager) {
      const bm = this.context.bulletManager;
      const bulletsToRecycle: any[] = [];
      const iterateBullets = bm.forEachActivePlayerBullet
        ? (cb: (b: any) => void) => bm.forEachActivePlayerBullet(cb)
        : (cb: (b: any) => void) => bm.forEachPlayerBullet?.(cb);

      if (iterateBullets) {
        iterateBullets((bullet: any) => {
          if (!bullet.active || !bullet.position) return;
          const bx = bullet.position.x;
          const by = bullet.position.y;

          for (const c of this.clusters) {
            const dx = bx - c.x;
            const dy = by - c.y;
            const distNorm = (dx * dx) / (c.rx * c.rx) + (dy * dy) / (c.ry * c.ry);

            if (distNorm <= 1.0) {
              bulletsToRecycle.push(bullet);
              this.spawnShrapnel(bx, by);
              break;
            }
          }
        });
      }

      for (const b of bulletsToRecycle) {
        bm.recycle(b);
      }
    }

    // 3. Update shrapnel particles
    for (const s of this.shrapnelPool) {
      if (s.life < s.maxLife) {
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
    }
  }

  private spawnShrapnel(x: number, y: number): void {
    const colors = ['#F8FAFC', '#E2E8F0', '#94A3B8', '#64748B'];
    const sparkCount = 4;
    for (let i = 0; i < sparkCount; i++) {
      const spark = this.shrapnelPool.find(s => s.life >= s.maxLife);
      if (!spark) break;
      const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
      const speed = 70 + Math.random() * 40;
      spark.x = x;
      spark.y = y;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.life = 0;
      spark.maxLife = 0.20 + Math.random() * 0.10;
      spark.color = colors[i % colors.length]!;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE' && this.state !== 'WARNING') return;

    ctx.save();
    // Render drifting nanite cloud ellipses
    for (const c of this.clusters) {
      // Outer stippled haze
      ctx.fillStyle = 'rgba(71, 85, 105, 0.32)';
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') {
        ctx.ellipse(Math.floor(c.x), Math.floor(c.y), Math.floor(c.rx), Math.floor(c.ry), 0, 0, Math.PI * 2);
      } else {
        ctx.arc(Math.floor(c.x), Math.floor(c.y), Math.floor((c.rx + c.ry) / 2), 0, Math.PI * 2);
      }
      ctx.fill();

      // Inner dense nanite core
      ctx.fillStyle = 'rgba(148, 163, 184, 0.48)';
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') {
        ctx.ellipse(Math.floor(c.x), Math.floor(c.y), Math.floor(c.rx * 0.65), Math.floor(c.ry * 0.65), 0, 0, Math.PI * 2);
      } else {
        ctx.arc(Math.floor(c.x), Math.floor(c.y), Math.floor(((c.rx + c.ry) / 2) * 0.65), 0, Math.PI * 2);
      }
      ctx.fill();

      // Nanite active motes (stippling)
      ctx.fillStyle = '#F1F5F9';
      for (let j = 0; j < 5; j++) {
        const px = c.x + (Math.sin(c.wobblePhase + j * 1.3) * c.rx * 0.5);
        const py = c.y + (Math.cos(c.wobblePhase + j * 1.7) * c.ry * 0.5);
        ctx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
      }
    }

    // Render shrapnel sparks
    for (const s of this.shrapnelPool) {
      if (s.life < s.maxLife) {
        const alpha = Math.max(0, 1.0 - s.life / s.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
      }
    }
    ctx.restore();
  }

  protected override onDeactivated(): void {
    for (const s of this.shrapnelPool) {
      s.life = s.maxLife;
    }
  }

  protected override onReset(): void {
    this.onInit();
  }
}
