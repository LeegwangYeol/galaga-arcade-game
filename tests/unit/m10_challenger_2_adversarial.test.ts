/**
 * Galaga Arcade Web Game — Milestone 10 Adversarial Crisis Mechanics Verification Suite
 * Challenger: m10_challenger_2 (Role: 11 Crisis Mechanical & Invariant Challenger)
 * 
 * Adversarially challenges and empirically verifies:
 * 1. TheUnbidden: Player missile velocity vector bending toward gravitational singularity (rift at 112, 60) over consecutive frames
 * 2. ShieldOverload: Living formation enemies gain +2 shields and absorb hits sequentially before hull damage
 * 3. ThePrethorynScourge: Micro-spores spawn on enemy destruction, drift, and lethality
 * 4. PsionicResonance: Phantoms award 0 score, 0 stats, take 0 hull damage, and do NOT block stage clear
 * 5. DevouringSwarmFrenzy: Dive interval drops to 0.25s and concurrent divers reaches 8
 * 6. TimeDilationField: Alternates pulses between 1.5x (hyper-speed) and 0.5x (bullet-time)
 * 7. System Invariants: Rapid sequential churn, deactivation cleanup, zero coordinate drift
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CrisisEventFactory } from '../../src/core/crisis/CrisisEventFactory';
import { CrisisEventManager } from '../../src/core/crisis/CrisisEventManager';
import { CrisisEventType, type CrisisEventContext } from '../../src/core/crisis/types';
import { Player } from '../../src/entities/Player';
import { BulletManager } from '../../src/entities/Bullet';
import { FormationManager } from '../../src/systems/FormationManager';
import { Starfield } from '../../src/systems/Starfield';
import { ParticleSystem } from '../../src/systems/ParticleSystem';
import { ScoreManager } from '../../src/systems/ScoreManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

// Concrete Event Classes
import { TheUnbiddenEvent } from '../../src/core/crisis/events/TheUnbiddenEvent';
import { ShieldOverloadEvent } from '../../src/core/crisis/events/ShieldOverloadEvent';
import { ThePrethorynScourgeEvent } from '../../src/core/crisis/events/ThePrethorynScourgeEvent';
import { PsionicResonanceEvent } from '../../src/core/crisis/events/PsionicResonanceEvent';
import { DevouringSwarmFrenzyEvent } from '../../src/core/crisis/events/DevouringSwarmFrenzyEvent';
import { TimeDilationFieldEvent } from '../../src/core/crisis/events/TimeDilationFieldEvent';

function createAdversarialContext(overrides: Partial<CrisisEventContext> = {}): CrisisEventContext {
  const player = new Player();
  const bulletManager = new BulletManager();
  const formationManager = new FormationManager();
  const starfield = new Starfield();
  const particleSystem = new ParticleSystem();
  const scoreManager = new ScoreManager();

  const game = {
    stage: 12,
    player,
    bulletManager,
    formationManager,
    starfield,
    particleSystem,
    scoreManager,
    soundSynth: {
      playCrisisKlaxon: vi.fn(),
      playLaser: vi.fn(),
      playExplosion: vi.fn(),
    },
    setState: vi.fn(),
  };

  return {
    game,
    player,
    bulletManager,
    formationManager,
    starfield,
    particleSystem,
    soundSynth: game.soundSynth,
    scoreManager,
    stage: 12,
    ...overrides,
  };
}

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    globalAlpha: 1.0,
    fillStyle: '#FFFFFF',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  } as unknown as CanvasRenderingContext2D;
}

describe('Milestone 10 Challenger 2: 11 Crisis Mechanical & Invariant Adversarial Challenge Suite', () => {
  let context: CrisisEventContext;
  let mockCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    CrisisEventFactory.registerDefaults();
    context = createAdversarialContext();
    mockCtx = createMockCanvasContext();
  });

  // ==========================================================================
  // Dimension 1: TheUnbidden — Gravitational Singularity Trajectory Bending
  // ==========================================================================
  describe('Dimension 1: TheUnbidden Plummer Gravitational Trajectory Bending', () => {
    it('empirically bends player missile velocity vector toward rift center (112, 60) over consecutive frames', () => {
      const event = new TheUnbiddenEvent();
      event.init(context);
      event.onActivate();

      // Launch player missile from bottom-left: (40, 200), pure vertical velocity (vx: 0, vy: -480)
      const bullet = context.bulletManager.firePlayerBullet(40, 200);
      expect(bullet).not.toBeNull();
      expect(bullet!.velocity.x).toBe(0);
      expect(bullet!.velocity.y).toBe(-480);

      const dt = 1 / 60; // 60 FPS tick
      let prevVx = bullet!.velocity.x;
      let prevVy = bullet!.velocity.y;

      // Simulate 30 consecutive frames
      for (let frame = 1; frame <= 30; frame++) {
        const posX = bullet!.position.x;
        const posY = bullet!.position.y;

        // Vector pointing toward singularity (112, 60)
        const toRiftX = 112 - posX;
        const toRiftY = 60 - posY;

        event.update(dt);

        const currentVx = bullet!.velocity.x;
        const currentVy = bullet!.velocity.y;

        // Frame acceleration vector
        const ax = (currentVx - prevVx) / dt;
        const ay = (currentVy - prevVy) / dt;

        // Invariant 1: ax MUST have the exact same sign as toRiftX (pulling rightward towards 112)
        expect(Math.sign(ax)).toBe(Math.sign(toRiftX));
        expect(currentVx).toBeGreaterThan(prevVx);

        // Invariant 2: Acceleration in Y must always point toward riftY (60)
        expect(Math.sign(ay)).toBe(Math.sign(toRiftY));
        if (posY > 60) {
          expect(ay).toBeLessThan(0);
        } else if (posY < 60) {
          expect(ay).toBeGreaterThan(0);
        }

        // Advance position based on velocity for next frame simulation
        bullet!.position.x += currentVx * dt;
        bullet!.position.y += currentVy * dt;

        prevVx = currentVx;
        prevVy = currentVy;
      }

      // After 30 frames, missile should have curved significantly rightward (vx > 10)
      expect(bullet!.velocity.x).toBeGreaterThan(10);

      event.onDeactivate();
      expect(event.isComplete()).toBe(true);
    });

    it('reverses lateral pull direction when missile is on the opposite side (x > 112)', () => {
      const event = new TheUnbiddenEvent();
      event.init(context);
      event.onActivate();

      // Launch player missile close to rift on right side: (140, 80), pure vertical velocity
      const bullet = context.bulletManager.firePlayerBullet(140, 80);
      expect(bullet).not.toBeNull();
      expect(bullet!.velocity.x).toBe(0);

      // Simulate 15 frames
      for (let i = 0; i < 15; i++) {
        event.update(1 / 60);
      }

      // Invariant: dx = 112 - 140 = -28. Velocity MUST bend leftward (negative vx)
      expect(bullet!.velocity.x).toBeLessThan(-5);

      event.onDeactivate();
    });

    it('pulls downward if missile is above the singularity (y < 60)', () => {
      const event = new TheUnbiddenEvent();
      event.init(context);
      event.onActivate();

      // Bullet positioned at (112, 20), which is ABOVE the rift (y < 60)
      const bullet = context.bulletManager.firePlayerBullet(112, 20);
      expect(bullet).not.toBeNull();
      const initialVy = bullet!.velocity.y; // -480

      event.update(1 / 60);

      // Invariant: dy = 60 - 20 = +40 > 0. Acceleration pulls downward (positive ay), so vy increases (becomes less negative)
      expect(bullet!.velocity.y).toBeGreaterThan(initialVy);
      // Lateral acceleration should be 0 because dx = 112 - 112 = 0
      expect(bullet!.velocity.x).toBeCloseTo(0, 4);

      event.onDeactivate();
    });

    it('strictly clamps lateral velocity within [-280, 280] boundary under extreme gravitational pull', () => {
      const event = new TheUnbiddenEvent();
      event.init(context);
      event.onActivate();

      // Place bullet very close to rift horizontally to induce high acceleration
      const bullet = context.bulletManager.firePlayerBullet(80, 60);
      expect(bullet).not.toBeNull();

      // Simulate 120 consecutive frames (2.0s)
      for (let i = 0; i < 120; i++) {
        event.update(1 / 60);
      }

      // Invariant: Clamped at maximum 280
      expect(bullet!.velocity.x).toBeLessThanOrEqual(280);
      expect(bullet!.velocity.x).toBeGreaterThanOrEqual(-280);

      event.onDeactivate();
    });

    it('Plummer potential remains numerically stable with zero singularity division by zero', () => {
      const event = new TheUnbiddenEvent();
      event.init(context);
      event.onActivate();

      // Place bullet exactly at singularity (112, 60)
      const bullet = context.bulletManager.firePlayerBullet(112, 60);
      expect(bullet).not.toBeNull();

      expect(() => event.update(1 / 60)).not.toThrow();
      expect(Number.isNaN(bullet!.velocity.x)).toBe(false);
      expect(Number.isNaN(bullet!.velocity.y)).toBe(false);
      expect(Number.isFinite(bullet!.velocity.x)).toBe(true);
      expect(Number.isFinite(bullet!.velocity.y)).toBe(true);

      event.onDeactivate();
    });
  });

  // ==========================================================================
  // Dimension 2: ShieldOverload — +2 Shield Buff & Sequential Damage Absorption
  // ==========================================================================
  describe('Dimension 2: ShieldOverload +2 Shield Buff & Absorption Invariant', () => {
    it('grants exactly +2 kinetic shields to living formation enemies and preserves dead/inactive enemies', () => {
      context.formationManager.spawnStage(12);
      const livingEnemies = context.formationManager.getLivingEnemies();
      expect(livingEnemies.length).toBe(40);

      // Artificially deactivate one enemy and set another to EXPLODING
      const deadEnemy = livingEnemies[0]!;
      deadEnemy.active = false;
      deadEnemy.state = EnemyState.INACTIVE;
      deadEnemy.shield = 0;

      const explodingEnemy = livingEnemies[1]!;
      explodingEnemy.state = EnemyState.EXPLODING;
      explodingEnemy.shield = 0;

      const normalZako = livingEnemies[2]!;
      normalZako.shield = 0;
      normalZako.health = 1;

      const event = new ShieldOverloadEvent();
      event.init(context);
      event.onActivate();

      // Invariant 1: Living active enemy gained +2 shield
      expect(normalZako.shield).toBe(2);
      expect(normalZako.maxShield).toBe(2);

      // Invariant 2: Inactive enemy remained untouched (0 shield)
      expect(deadEnemy.shield).toBe(0);

      // Invariant 3: All active living enemies have shield >= 2
      for (const enemy of context.formationManager.enemies) {
        if (enemy.active && enemy.state !== EnemyState.INACTIVE) {
          expect(enemy.shield).toBeGreaterThanOrEqual(2);
        }
      }

      event.onDeactivate();
    });

    it('empirically absorbs exactly 2 hits on shields before inflicting hull damage or destroying enemy', () => {
      context.formationManager.spawnStage(12);
      const enemy = context.formationManager.getLivingEnemies()[0]!;
      enemy.health = 1;
      enemy.shield = 0;

      const event = new ShieldOverloadEvent();
      event.init(context);
      event.onActivate();

      expect(enemy.shield).toBe(2);
      expect(enemy.health).toBe(1);

      // Hit 1: 1 damage applied
      const hit1 = enemy.takeDamage(1);
      expect(hit1.destroyed).toBe(false);
      expect(hit1.shieldAbsorbed).toBe(true);
      expect(hit1.remainingShield).toBe(1);
      expect(hit1.remainingHealth).toBe(1);
      expect(hit1.points).toBe(0);
      expect(enemy.health).toBe(1);
      expect(enemy.shield).toBe(1);

      // Hit 2: 1 damage applied
      const hit2 = enemy.takeDamage(1);
      expect(hit2.destroyed).toBe(false);
      expect(hit2.shieldAbsorbed).toBe(true);
      expect(hit2.remainingShield).toBe(0);
      expect(hit2.remainingHealth).toBe(1);
      expect(hit2.points).toBe(0);
      expect(enemy.health).toBe(1);
      expect(enemy.shield).toBe(0);

      // Hit 3: Hull hit (shields fully depleted) -> Destroys 1-HP enemy!
      const hit3 = enemy.takeDamage(1);
      expect(hit3.destroyed).toBe(true);
      expect(hit3.shieldAbsorbed).toBe(false);
      expect(hit3.remainingShield).toBe(0);
      expect(hit3.remainingHealth).toBe(0);
      expect(hit3.points).toBeGreaterThan(0);
      expect(enemy.state).toBe(EnemyState.EXPLODING);

      event.onDeactivate();
    });

    it('stacks +2 shields on top of existing Dreadnought shields (total 3 shields)', () => {
      const dreadnoughtBoss = new Enemy({
        id: 99,
        type: EnemyType.BOSS,
        health: 2,
        shield: 1, // Pre-existing Dreadnought shield
        tier: 'DREADNOUGHT',
      });
      dreadnoughtBoss.active = true;
      dreadnoughtBoss.state = EnemyState.IN_FORMATION;

      context.formationManager.enemies = [dreadnoughtBoss];

      const event = new ShieldOverloadEvent();
      event.init(context);
      event.onActivate();

      // Initial 1 + Overload 2 = 3 shields!
      expect(dreadnoughtBoss.shield).toBe(3);
      expect(dreadnoughtBoss.maxShield).toBe(3);

      // Absorb 3 consecutive hits without taking hull damage
      for (let i = 1; i <= 3; i++) {
        const res = dreadnoughtBoss.takeDamage(1);
        expect(res.shieldAbsorbed).toBe(true);
        expect(res.destroyed).toBe(false);
        expect(dreadnoughtBoss.health).toBe(2);
        expect(dreadnoughtBoss.shield).toBe(3 - i);
      }

      // Next 2 hits damage the Boss hull (Green -> Blue -> Destroyed)
      const hullHit1 = dreadnoughtBoss.takeDamage(1);
      expect(hullHit1.shieldAbsorbed).toBe(false);
      expect(hullHit1.destroyed).toBe(false);
      expect(dreadnoughtBoss.health).toBe(1);

      const hullHit2 = dreadnoughtBoss.takeDamage(1);
      expect(hullHit2.shieldAbsorbed).toBe(false);
      expect(hullHit2.destroyed).toBe(true);
      expect(dreadnoughtBoss.health).toBe(0);

      event.onDeactivate();
    });
  });

  // ==========================================================================
  // Dimension 3: ThePrethorynScourge — Micro-Spores on Enemy Destruction
  // ==========================================================================
  describe('Dimension 3: ThePrethorynScourge Micro-Spore Spawning & Kinematics', () => {
    it('spawns lethal micro-spores at the exact explosion coordinate upon enemy destruction', () => {
      context.formationManager.spawnStage(12);
      const enemies = context.formationManager.getLivingEnemies();
      const targetEnemy = enemies[0]!;
      targetEnemy.x = 112;
      targetEnemy.y = 80;
      targetEnemy.health = 1;
      targetEnemy.shield = 0;

      const event = new ThePrethorynScourgeEvent();
      event.init(context);
      event.onActivate();

      // Note: Scourge grants +1 chitin shield to living enemies upon activation
      expect(targetEnemy.shield).toBe(1);

      // Access internal spore pool
      const sporePool: any[] = (event as any).sporePool;
      expect(sporePool).toBeDefined();
      expect(sporePool.length).toBe(32);
      expect(sporePool.filter(s => s.active).length).toBe(0);

      // Hit 1: Absorbed by Chitin Shield
      const hit1 = targetEnemy.takeDamage(1);
      expect(hit1.shieldAbsorbed).toBe(true);
      expect(targetEnemy.shield).toBe(0);
      expect(targetEnemy.health).toBe(1);

      // Hit 2: Destroys the target enemy hull
      const hit2 = targetEnemy.takeDamage(1);
      expect(hit2.destroyed).toBe(true);
      expect(targetEnemy.state).toBe(EnemyState.EXPLODING);
      expect(targetEnemy.deathTimer).toBeGreaterThan(0.1);

      // Trigger update tick
      event.update(0.016);

      // Invariant: Exactly 2 micro-spores spawned
      const activeSpores = sporePool.filter(s => s.active);
      expect(activeSpores.length).toBe(2);

      for (const spore of activeSpores) {
        // Spores originate at enemy coordinates and move downward along trajectory on the first tick
        expect(Math.abs(spore.x - 112)).toBeLessThan(5);
        expect(spore.y).toBeGreaterThan(80);
        // Spores must have downward velocity (vy > 0)
        expect(spore.vy).toBeGreaterThan(100);
        expect(spore.life).toBeCloseTo(0.016, 3);
      }

      event.onDeactivate();
    });

    it('propagates micro-spore trajectory downward with sinusoidal drift across frames', () => {
      const event = new ThePrethorynScourgeEvent();
      event.init(context);
      event.onActivate();

      // Manually trigger spore spawn at (100, 50)
      (event as any).spawnSpores(100, 50);
      const sporePool: any[] = (event as any).sporePool;
      const spore = sporePool.find(s => s.active);
      expect(spore).toBeDefined();

      const startX = spore.x;
      const startY = spore.y;

      // Simulate 10 frames (dt = 0.016s)
      for (let i = 0; i < 10; i++) {
        event.update(0.016);
      }

      // Invariant: Spore moves downward (y > startY) and drifts horizontally (x changes from startX)
      expect(spore.y).toBeGreaterThan(startY);
      expect(spore.x).not.toBe(startX);
      // Invariant: Spore life increments
      expect(spore.life).toBeCloseTo(0.16, 2);

      event.onDeactivate();
    });

    it('destroys unshielded vulnerable player upon spore contact and recycles spore', () => {
      const event = new ThePrethorynScourgeEvent();
      event.init(context);
      event.onActivate();

      context.player.x = 112;
      context.player.y = 250;
      context.player.invulnerableTimer = 0;
      context.player.state = 'normal';
      context.player.destroy = vi.fn();

      // Spawn spore directly at player position
      (event as any).spawnSpores(112, 250);
      const sporePool: any[] = (event as any).sporePool;
      const spore = sporePool.find(s => s.active);
      expect(spore).toBeDefined();

      // Collision check happens in update
      event.update(0.016);

      // Invariant 1: Player destroy callback invoked
      expect(context.player.destroy).toHaveBeenCalled();
      // Invariant 2: Spore consumed / deactivated
      expect(spore.active).toBe(false);

      event.onDeactivate();
    });

    it('spores pass through invulnerable player without triggering destruction', () => {
      const event = new ThePrethorynScourgeEvent();
      event.init(context);
      event.onActivate();

      context.player.x = 112;
      context.player.y = 250;
      context.player.invulnerableTimer = 2.0; // Invulnerable!
      context.player.destroy = vi.fn();

      (event as any).spawnSpores(112, 250);
      event.update(0.016);

      // Invariant: Invulnerable player NOT destroyed
      expect(context.player.destroy).not.toHaveBeenCalled();

      event.onDeactivate();
    });

    it('deactivates all spores on event deactivation', () => {
      const event = new ThePrethorynScourgeEvent();
      event.init(context);
      event.onActivate();

      (event as any).spawnSpores(100, 100);
      const sporePool: any[] = (event as any).sporePool;
      expect(sporePool.filter(s => s.active).length).toBe(2);

      event.onDeactivate();

      // Invariant: All spores flushed
      expect(sporePool.filter(s => s.active).length).toBe(0);
      expect(event.isComplete()).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 4: PsionicResonance — Phantoms (0 Score/Damage & No Stage Clear Block)
  // ==========================================================================
  describe('Dimension 4: PsionicResonance Phantom Units Invariants', () => {
    it('manifests exactly 6 ethereal phantoms upon activation', () => {
      const event = new PsionicResonanceEvent();
      event.init(context);
      event.onActivate();

      expect(event.phantoms.length).toBe(6);
      for (const p of event.phantoms) {
        expect(p.active).toBe(true);
        expect(p.state).toBe('FORMATION');
        expect(p.alpha).toBeCloseTo(0.45);
        expect(p.x).toBeGreaterThan(0);
        expect(p.y).toBeGreaterThan(0);
      }

      event.onDeactivate();
    });

    it('dispels phantom on player missile hit: awards 0 score, deals 0 real damage, and preserves formation', () => {
      context.formationManager.spawnStage(12);
      const initialLivingCount = context.formationManager.getLivingCount();
      const initialScore = context.scoreManager.score;

      const event = new PsionicResonanceEvent();
      event.init(context);
      event.onActivate();

      const phantom = event.phantoms[0]!;
      expect(phantom.active).toBe(true);

      // Fire player missile directly at phantom coordinate
      const bullet = context.bulletManager.firePlayerBullet(phantom.x, phantom.y);
      expect(bullet).not.toBeNull();
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);

      // Trigger update tick
      event.update(0.016);

      // Invariant 1: Phantom dispels
      expect(phantom.active).toBe(false);

      // Invariant 2: Missile is consumed / recycled
      expect(context.bulletManager.getPlayerBulletCount()).toBe(0);

      // Invariant 3: Score strictly unchanged (0 score awarded)
      expect(context.scoreManager.score).toBe(initialScore);

      // Invariant 4: Formation living enemy count strictly unchanged
      expect(context.formationManager.getLivingCount()).toBe(initialLivingCount);

      event.onDeactivate();
    });

    it('CRITICAL INVARIANT: Phantoms do NOT block stage clear when all real enemies are destroyed', () => {
      context.formationManager.spawnStage(12);
      const stageClearSpy = vi.fn();
      context.formationManager.onStageClear = stageClearSpy;

      const event = new PsionicResonanceEvent();
      event.init(context);
      event.onActivate();

      // Ensure all 6 phantoms are active
      expect(event.phantoms.filter(p => p.active).length).toBe(6);

      // Destroy all real formation enemies
      for (const enemy of context.formationManager.enemies) {
        enemy.active = false;
        enemy.state = EnemyState.INACTIVE;
      }

      // Invariant 1: Formation manager living count is strictly 0 (phantoms are NOT counted)
      expect(context.formationManager.getLivingCount()).toBe(0);

      // Advance entry waves so isEntryWaveActive is false
      context.formationManager.isEntryWaveActive = false;

      // Update formation manager tick
      context.formationManager.update(0.016, 112, 250);

      // Invariant 2: onStageClear is triggered despite 6 phantoms active on screen!
      expect(stageClearSpy).toHaveBeenCalled();

      // Deactivation cleans up phantoms
      event.onDeactivate();
      expect(event.phantoms.length).toBe(0);
    });

    it('triggers periodic autonomous dives for phantoms without crashing or mutating formation state', () => {
      const event = new PsionicResonanceEvent();
      event.init(context);
      event.onActivate();

      // Advance past dive timer threshold (2.6s) in 60 FPS increments
      for (let i = 0; i < 165; i++) {
        event.update(1 / 60);
      }

      const divingPhantom = event.phantoms.find(p => p.state === 'DIVING');
      expect(divingPhantom).toBeDefined();
      expect(divingPhantom!.vy).toBe(135);

      // Simulate diving motion
      const startY = divingPhantom!.y;
      event.update(0.05);
      expect(divingPhantom!.y).toBeGreaterThan(startY);

      event.onDeactivate();
    });
  });

  // ==========================================================================
  // Dimension 5: DevouringSwarmFrenzy — Dive Overclock & 8 Concurrent Divers
  // ==========================================================================
  describe('Dimension 5: DevouringSwarmFrenzy Dive Overclock & 8 Divers Invariant', () => {
    it('drops dive interval to exactly 0.25s and raises max concurrent divers to exactly 8', () => {
      context.formationManager.spawnStage(12);
      const originalInterval = context.formationManager.diveInterval;
      const originalDivers = context.formationManager.maxConcurrentDivers;
      const originalSpeed = context.formationManager.diveSpeedMultiplier;

      const event = new DevouringSwarmFrenzyEvent();
      event.init(context);
      event.onActivate();

      // Invariant 1: Dive interval dropped to 0.25s
      expect(context.formationManager.diveInterval).toBe(0.25);

      // Invariant 2: Max concurrent divers reaches exactly 8
      expect(context.formationManager.maxConcurrentDivers).toBe(8);

      // Invariant 3: Dive speed scaled by 1.25x
      expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(originalSpeed * 1.25, 2);

      // Invariant 4: On deactivation, baseline values are strictly restored
      event.onDeactivate();
      expect(context.formationManager.diveInterval).toBe(originalInterval);
      expect(context.formationManager.maxConcurrentDivers).toBe(originalDivers);
      expect(context.formationManager.diveSpeedMultiplier).toBe(originalSpeed);
      expect(event.isComplete()).toBe(true);
    });

    it('empirically allows concurrent divers to saturate up to 8 and caps scheduler at 8', () => {
      context.formationManager.spawnStage(12);
      context.formationManager.isEntryWaveActive = false;

      // Deactivate all enemies beyond 20 to control exact pool bounds
      for (let i = 0; i < context.formationManager.enemies.length; i++) {
        const enemy = context.formationManager.enemies[i]!;
        if (i < 20) {
          enemy.active = true;
          enemy.state = EnemyState.IN_FORMATION;
        } else {
          enemy.active = false;
          enemy.state = EnemyState.INACTIVE;
        }
      }

      const event = new DevouringSwarmFrenzyEvent();
      event.init(context);
      event.onActivate();

      expect(context.formationManager.maxConcurrentDivers).toBe(8);

      // Reset controlled state: exactly 8 diving, 12 in formation, and 20 inactive
      for (let i = 0; i < 8; i++) {
        const enemy = context.formationManager.enemies[i]!;
        enemy.active = true;
        enemy.state = EnemyState.DIVING_SOLO;
      }
      for (let i = 8; i < 20; i++) {
        const enemy = context.formationManager.enemies[i]!;
        enemy.active = true;
        enemy.state = EnemyState.IN_FORMATION;
      }
      for (let i = 20; i < context.formationManager.enemies.length; i++) {
        const enemy = context.formationManager.enemies[i]!;
        enemy.active = false;
        enemy.state = EnemyState.INACTIVE;
      }

      const countDivers = () => context.formationManager.enemies.filter(
        (e: Enemy) => e.active && (
          e.state === EnemyState.DIVING_SOLO ||
          e.state === EnemyState.DIVING_ESCORT ||
          e.state === EnemyState.TRACTOR_BEAM_ACTIVE ||
          e.state === EnemyState.CAPTURED_HOSTILE ||
          e.state === EnemyState.RETURNING_TO_FORMATION
        )
      ).length;

      expect(countDivers()).toBe(8);

      // Call updateDiveScheduler when currentDivers == 8
      context.formationManager.update(0.3, 112, 250);

      // Invariant: Scheduler respects maxConcurrentDivers = 8 and does NOT launch a 9th diver!
      expect(countDivers()).toBe(8);

      // When one diver returns or is destroyed (count drops to 7)
      context.formationManager.enemies[0]!.state = EnemyState.INACTIVE;
      context.formationManager.enemies[0]!.active = false;
      expect(countDivers()).toBe(7);

      // Set dive timer to interval (0.25s) to trigger next dive
      context.formationManager.diveTimer = 0.25;
      context.formationManager.update(0.016, 112, 250);

      // Invariant: Scheduler refills divers back to saturation (>= 8, e.g. 8 or 9 for paired Goei dive)
      expect(countDivers()).toBeGreaterThanOrEqual(8);

      // And once at or above saturation, calling update does not launch any additional waves
      const saturatedCount = countDivers();
      context.formationManager.diveTimer = 0.25;
      context.formationManager.update(0.016, 112, 250);
      expect(countDivers()).toBe(saturatedCount);

      event.onDeactivate();
    });

    it('continuously enforces 0.25s dive saturation during active update ticks', () => {
      context.formationManager.spawnStage(12);
      const event = new DevouringSwarmFrenzyEvent();
      event.init(context);
      event.onActivate();

      // Try to tamper with diveInterval mid-crisis
      context.formationManager.diveInterval = 3.5;

      event.update(0.016);

      // Invariant: Guard resets diveInterval back to 0.25
      expect(context.formationManager.diveInterval).toBe(0.25);

      event.onDeactivate();
    });
  });

  // ==========================================================================
  // Dimension 6: TimeDilationField — Oscillating Temporal Pulses (1.5x / 0.5x)
  // ==========================================================================
  describe('Dimension 6: TimeDilationField Alternating Pulses (1.5x / 0.5x)', () => {
    it('alternates between HYPER_SPEED (1.5x) and BULLET_TIME (0.5x) across 3.5s intervals', () => {
      const event = new TimeDilationFieldEvent();
      event.init(context);
      event.onActivate();

      // Initial Phase: HYPER_SPEED (target 1.5x)
      expect(event.phase).toBe('HYPER_SPEED');
      expect(event.targetScale).toBe(1.5);

      // Simulate 1.5s of smooth ramping
      for (let i = 0; i < 90; i++) {
        event.update(1 / 60);
      }
      expect(event.currentScale).toBeGreaterThan(1.48);
      expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(event.currentScale, 2);

      // Advance past 3.5s phase duration (total 3.6s)
      for (let i = 0; i < 126; i++) {
        event.update(1 / 60);
      }

      // Invariant 1: Phase switches to BULLET_TIME (target 0.5x)
      expect(event.phase).toBe('BULLET_TIME');
      expect(event.targetScale).toBe(0.5);

      // Simulate 1.5s of smooth ramp down
      for (let i = 0; i < 90; i++) {
        event.update(1 / 60);
      }
      expect(event.currentScale).toBeLessThan(0.52);
      expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(event.currentScale, 2);

      // Advance past another 3.5s (total 7.1s)
      for (let i = 0; i < 126; i++) {
        event.update(1 / 60);
      }

      // Invariant 2: Phase switches back to HYPER_SPEED (target 1.5x)
      expect(event.phase).toBe('HYPER_SPEED');
      expect(event.targetScale).toBe(1.5);

      // Invariant 3: On deactivation, scale strictly returns to 1.0
      event.onDeactivate();
      expect(event.currentScale).toBe(1.0);
      expect(event.targetScale).toBe(1.0);
      expect(context.formationManager.diveSpeedMultiplier).toBe(1.0);
      expect(event.isComplete()).toBe(true);
    });

    it('starfield speed multiplier tracks time dilation scale synchronously', () => {
      const event = new TimeDilationFieldEvent();
      event.init(context);
      event.onActivate();

      // Ramp up in HYPER_SPEED
      for (let i = 0; i < 60; i++) {
        event.update(1 / 60);
      }
      expect((context.starfield as any).speedMultiplier).toBeCloseTo(event.currentScale, 2);

      event.onDeactivate();
      expect((context.starfield as any).speedMultiplier).toBe(1.0);
    });

    it('preserves player movement and missile speeds during BULLET_TIME (player immunity)', () => {
      const event = new TimeDilationFieldEvent();
      event.init(context);
      event.onActivate();

      // Advance into BULLET_TIME
      event.phaseTimer = 3.5;
      event.update(0.1);
      expect(event.phase).toBe('BULLET_TIME');

      // Player speed and missile velocity remain unhindered
      const bullet = context.bulletManager.firePlayerBullet(112, 250);
      expect(bullet).not.toBeNull();
      expect(bullet!.velocity.y).toBe(-480); // Standard bullet speed preserved!

      event.onDeactivate();
    });
  });

  // ==========================================================================
  // Dimension 7: Cross-Crisis State Pollution & Sequential Churn Invariants
  // ==========================================================================
  describe('Dimension 7: Cross-Crisis State Pollution & Churn Invariants', () => {
    it('executes all 6 challenged crisis events in rapid succession without cross-contamination', () => {
      const crisisTypes = [
        CrisisEventType.THE_UNBIDDEN,
        CrisisEventType.SHIELD_OVERLOAD,
        CrisisEventType.THE_PRETHORYN_SCOURGE,
        CrisisEventType.PSIONIC_RESONANCE,
        CrisisEventType.DEVOURING_SWARM_FRENZY,
        CrisisEventType.TIME_DILATION_FIELD,
      ];

      context.formationManager.spawnStage(12);

      for (const type of crisisTypes) {
        const baselineSpeed = context.formationManager.diveSpeedMultiplier;
        const event = CrisisEventFactory.create(type, context);
        event.onWarningStart();
        event.update(3.0); // Complete warning
        expect(event.state).toBe('ACTIVE');

        // Simulate 10 active frames with rendering
        for (let f = 0; f < 10; f++) {
          event.update(0.016);
          event.render(mockCtx);
        }

        event.onDeactivate();
        expect(event.isComplete()).toBe(true);

        // Verify clean engine invariants after each event
        expect(context.bulletManager.getPlayerBulletCount()).toBe(0);
        // TimeDilationField restores to 1.0; others restore to baselineSpeed
        if (type === CrisisEventType.TIME_DILATION_FIELD) {
          expect(context.formationManager.diveSpeedMultiplier).toBe(1.0);
        } else {
          expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(baselineSpeed, 2);
        }
        expect((context.starfield as any).speedMultiplier).toBe(1.0);
      }
    });

    it('survives mid-crisis sudden game over and stage clear resets cleanly', () => {
      const manager = new CrisisEventManager(context.game as any);

      // Force activate Unbidden
      manager.forceActivate(CrisisEventType.THE_UNBIDDEN, 12);
      expect(manager.getState()).toBe('ACTIVE');
      expect(manager.getActiveCrisis()).not.toBeNull();

      // Sudden stage clear
      manager.onStageClear();
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();

      // Force activate Psionic Resonance then sudden reset
      manager.forceActivate(CrisisEventType.PSIONIC_RESONANCE, 12);
      expect(manager.getState()).toBe('ACTIVE');
      manager.reset();
      expect(manager.getState()).toBe('IDLE');
      expect(manager.getActiveCrisis()).toBeNull();
    });
  });
});
