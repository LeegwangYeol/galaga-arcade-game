/**
 * Galaga Arcade Web Game — Stage 30: Nanite Swarm Colossus (나노머신 거신)
 * 
 * Phase 1: Quad-burst spread salvos; splits into 4 autonomous Mini-Constructs (18 HP each) at 50% HP.
 * Phase 2: Reassembled Overclocked Titan deploying 2 Nanite Gray Goo Clouds that dissolve player bullets.
 */

import { SpriteRenderer } from '../../../renderer/SpriteRenderer';
import type { Game } from '../../Game';
import { BaseBoss, BossSubUnit } from '../BaseBoss';
import { BOSS_CONFIGS, type GrayGooCloud } from '../types';

export class NaniteColossus extends BaseBoss {
  public miniConstructs: BossSubUnit[] = [];
  public isSplit: boolean = false;

  // Attack timers
  private salvoTimer: number = 0;
  private constructFireTimer: number = 0;
  private titanLanceTimer: number = 0;

  // Gray Goo Clouds in Phase 2 (pre-allocated static array)
  public clouds: GrayGooCloud[] = [
    { x: 65, y: 150, radius: 22, life: 9999, maxLife: 9999, vx: 0, vy: 0, active: false },
    { x: 155, y: 170, radius: 22, life: 9999, maxLife: 9999, vx: 0, vy: 0, active: false },
  ];

  // Zero-allocation Brownian swarm motes for Gray Goo clouds
  public static readonly MOTE_COUNT = 20;
  public moteR = new Float32Array(NaniteColossus.MOTE_COUNT);
  public moteTheta = new Float32Array(NaniteColossus.MOTE_COUNT);
  public moteSize = new Float32Array(NaniteColossus.MOTE_COUNT);

  public static readonly ANCHORS: ReadonlyArray<{ readonly x: number; readonly y: number; readonly phi: number }> = [
    { x: 50, y: 50, phi: 0 },
    { x: 174, y: 50, phi: Math.PI },
    { x: 75, y: 95, phi: Math.PI / 2 },
    { x: 149, y: 95, phi: (3 * Math.PI) / 2 },
  ];

  public static readonly SALVO_ANGLES: readonly number[] = [-0.35, -0.12, 0.12, 0.35];

  constructor(game: Game) {
    super(game, BOSS_CONFIGS.STAGE_30);

    // Pre-allocate 4 Mini-Construct sub-units (18 HP each)
    for (let i = 0; i < 4; i++) {
      const construct = new BossSubUnit(
        this,
        9930 + i,
        `MINI_CONSTRUCT_${i}`,
        'BOSS_NANITE_MINI_CONSTRUCT',
        18,
        14,
        14
      );
      construct.x = NaniteColossus.ANCHORS[i]!.x;
      construct.y = NaniteColossus.ANCHORS[i]!.y;
      this.miniConstructs.push(construct);
      this.subUnits.push(construct);
    }

    // Initialize Brownian motes
    for (let i = 0; i < NaniteColossus.MOTE_COUNT; i++) {
      this.moteR[i] = 4 + Math.random() * 16;
      this.moteTheta[i] = Math.random() * Math.PI * 2;
      this.moteSize[i] = 1 + Math.random() * 1.5;
    }
  }

  public override isProtectedBySubUnits(): boolean {
    // While in split state, main colossus cannot be damaged directly
    return this.isSplit;
  }

  public override checkPhaseTransitions(): void {
    if (this.phase === 'PHASE_1' && !this.isSplit && this.health <= this.maxHealth * 0.5) {
      // Trigger Split
      this.isSplit = true;
      const synth = this.game.soundSynth as any;
      if (synth && typeof synth.playNaniteSplitShimmer === 'function') {
        synth.playNaniteSplitShimmer();
      } else {
        this.game.soundSynth?.playExplosion('boss');
      }
      this.game.particleSystem?.spawnBossExplosion(this.x, this.y);

      for (const construct of this.miniConstructs) {
        construct.active = true;
        construct.health = construct.maxHealth;
      }
    }
  }

  public override onSubUnitDestroyed(subUnit: BossSubUnit): void {
    this.game.particleSystem?.spawnBossExplosion(subUnit.x, subUnit.y);
    this.game.soundSynth?.playExplosion('small');

    // Check if all 4 constructs are defeated
    const livingConstructs = this.miniConstructs.filter((c) => c.active);
    if (livingConstructs.length === 0 && this.isSplit && this.phase === 'PHASE_1') {
      this.isSplit = false;
      this.phase = 'TRANSITION_1_2';
      this.invulnerableTimer = 2.0;
      this.game.soundSynth?.playExplosion('boss');
      this.game.particleSystem?.spawnBossExplosion(this.x, this.y);
    }
  }

  public override onPhase2Started(): void {
    // Activate Nanite Gray Goo Clouds
    for (const cloud of this.clouds) {
      cloud.active = true;
    }
  }

  public override updateBoss(dt: number, playerX: number, playerY: number): void {
    if (this.phase === 'PHASE_1') {
      this.updatePhase1(dt, playerX, playerY);
    } else if (this.phase === 'PHASE_2') {
      this.updatePhase2(dt, playerX, playerY);
    }
  }

  private updatePhase1(dt: number, playerX: number, playerY: number): void {
    if (!this.isSplit) {
      // Colossus cluster pre-split
      this.x = 112 + 25 * Math.sin(this.stateTimer * 1.2);
      this.y = 56;

      this.salvoTimer += dt;
      if (this.salvoTimer >= 1.6) {
        this.salvoTimer = 0;
        // Quad-burst spread salvo
        for (let i = 0; i < NaniteColossus.SALVO_ANGLES.length; i++) {
          const a = NaniteColossus.SALVO_ANGLES[i]!;
          const vx = 180 * Math.sin(a);
          const vy = 180 * Math.cos(a);
          this.game.bulletManager.fireEnemyBulletWithVector(this.x, this.y, vx, vy);
        }
      }
    } else {
      // Mini-Constructs moving along Lissajous paths
      const t = this.stateTimer;
      for (let i = 0; i < this.miniConstructs.length; i++) {
        const c = this.miniConstructs[i]!;
        if (!c.active) continue;
        const anc = NaniteColossus.ANCHORS[i]!;
        c.x = anc.x + 25 * Math.sin(1.4 * t + anc.phi);
        c.y = anc.y + 10 * Math.cos(2.8 * t);
      }

      this.constructFireTimer += dt;
      if (this.constructFireTimer >= 1.2) {
        this.constructFireTimer = 0;
        for (const c of this.miniConstructs) {
          if (!c.active) continue;
          this.game.bulletManager.fireEnemyBullet(c.x, c.y, playerX, playerY, 200);
        }
      }
    }
  }

  private updatePhase2(dt: number, _playerX: number, _playerY: number): void {
    this.x = 112 + 30 * Math.sin(this.stateTimer * 1.5);
    this.y = 56;

    // 1. Nanite Lances
    this.titanLanceTimer += dt;
    if (this.titanLanceTimer >= 1.4) {
      this.titanLanceTimer = 0;
      this.game.bulletManager.fireEnemyBulletWithVector(this.x - 12, this.y + 12, 0, 240);
      this.game.bulletManager.fireEnemyBulletWithVector(this.x + 12, this.y + 12, 0, 240);
    }

    // 2. Drifting Gray Goo Clouds
    const t = this.stateTimer;
    this.clouds[0]!.x = 65 + 15 * Math.sin(0.8 * t);
    this.clouds[0]!.y = 150 + 20 * Math.cos(0.5 * t);
    this.clouds[1]!.x = 155 + 15 * Math.cos(0.8 * t);
    this.clouds[1]!.y = 170 + 18 * Math.sin(0.6 * t);

    // Rotate motes in Brownian swarm
    for (let i = 0; i < NaniteColossus.MOTE_COUNT; i++) {
      this.moteTheta[i]! += (0.8 + i * 0.05) * dt;
    }

    // Bullet Dissolution: Neutralize incoming player missiles inside cloud
    this.game.bulletManager.forEachActivePlayerBullet((bullet) => {
      for (const cloud of this.clouds) {
        if (!cloud.active) continue;
        const dist = Math.hypot(bullet.position.x - cloud.x, bullet.position.y - cloud.y);
        if (dist < cloud.radius) {
          // Dissolve missile
          this.game.bulletManager.recycle(bullet);
          const synth = this.game.soundSynth as any;
          if (synth && typeof synth.playGrayGooDissolveHiss === 'function') {
            synth.playGrayGooDissolveHiss();
          }
          if (this.game.particleSystem && typeof this.game.particleSystem.spawnNaniteDissolve === 'function') {
            this.game.particleSystem.spawnNaniteDissolve(bullet.position.x, bullet.position.y);
          } else {
            this.game.particleSystem?.spawnHitSparks(bullet.position.x, bullet.position.y);
          }
          break;
        }
      }
    });
  }

  public override renderBoss(ctx: CanvasRenderingContext2D): void {
    if (!this.isSplit) {
      SpriteRenderer.draw(ctx, 'BOSS_NANITE_COLOSSUS', this.x, this.y, { scale: 1.5 });
    }

    // Render Gray Goo Clouds in Phase 2
    if (this.phase === 'PHASE_2') {
      for (const cloud of this.clouds) {
        if (!cloud.active) continue;
        // Draw procedural nanite cloud with motes and micro-arcs
        SpriteRenderer.drawNaniteCloud(
          ctx,
          cloud.x,
          cloud.y,
          this.moteR,
          this.moteTheta,
          this.moteSize,
          NaniteColossus.MOTE_COUNT,
          this.stateTimer
        );

        ctx.save();
        ctx.fillStyle = 'rgba(170, 170, 170, 0.25)';
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Inner nanite spark core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}
