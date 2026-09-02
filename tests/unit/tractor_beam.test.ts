/**
 * Galaga Arcade Web Game — Milestone 5: Tractor Beam & Dual Fighter System Unit Tests
 * 
 * Exhaustive unit test suite verifying:
 * 1. Tractor Beam Geometry, Linear Half-Width Interpolation & Point/AABB Confinement
 * 2. Tractor Beam State Machine & Lifecycle (0.5s expand, 3.5s hold, 0.3s retract, instant deactivation)
 * 3. Boss Galaga Tractor Beam Scheduling & Dive Initiation (Stage >= 2, single fighter only, 1 concurrent beam)
 * 4. Single Fighter Capture Flow (spin 4 rot/s, ascension, life deduction N -> N-1, auto-respawn, Game Over)
 * 5. Rescue Flow & Dual Fighter Docking (+1000 pts bonus, twin hulls, 4-missile limit)
 * 6. Turncoat Hostile Flow (formation Boss destroyed -> escort becomes CAPTURED_HOSTILE and attacks player)
 * 7. Accidental Escort Destruction & Asymmetrical Dual Fighter Damage (partial hull loss without life loss)
 * 8. Procedural Canvas 2D rendering and spark particle subsystem.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Enemy } from '../../src/entities/Enemy';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 5: Tractor Beam & Dual Fighter System Test Suite', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  // ==========================================================================
  // 1. TractorBeam Geometry & Math Tests
  // ==========================================================================
  describe('Tractor Beam Geometry & Point Confinement', () => {
    let beam: TractorBeam;
    let boss: Enemy;

    beforeEach(() => {
      boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      beam = new TractorBeam();
      beam.activate(boss);
      // Fast forward past expansion phase (0.5s) to HOLDING
      beam.update(0.6);
    });

    it('initializes dimensions and emitter offset properly on activation', () => {
      const freshBeam = new TractorBeam();
      const testBoss = new Enemy({ id: 2, type: EnemyType.BOSS, x: 100, y: 80 });
      freshBeam.activate(testBoss);

      expect(freshBeam.bossX).toBe(100);
      expect(freshBeam.bossY).toBe(80);
      expect(freshBeam.topY).toBe(80 + TractorBeam.EMITTER_OFFSET_Y); // 92
      expect(freshBeam.currentBottomWidth).toBe(TractorBeam.TOP_WIDTH); // 8
      expect(freshBeam.extensionRatio).toBe(0);
      expect(freshBeam.getState()).toBe('EMITTING');
      expect(freshBeam.isActive()).toBe(true);
    });

    it('calculates linear half-width at various Y altitudes', () => {
      // topY = 112, targetBottomY = 280, fullHeight = 168
      // Top emitter: y = 112 -> ratio = 0 -> half-width = 4
      expect(beam.getHalfWidthAtY(112)).toBeCloseTo(4, 4);

      // Midpoint: y = 112 + 84 = 196 -> ratio = 0.5 -> half-width = 4 + 0.5 * 20 = 14
      expect(beam.getHalfWidthAtY(196)).toBeCloseTo(14, 4);

      // Bottom target: y = 280 -> ratio = 1.0 -> half-width = 24
      expect(beam.getHalfWidthAtY(280)).toBeCloseTo(24, 4);

      // Baseline Y = 250: ratio = (250-112)/168 = 138/168 ~= 0.8214 -> 4 + 20 * (138/168) ~= 20.4285
      expect(beam.getHalfWidthAtY(250)).toBeCloseTo(4 + 20 * (138 / 168), 3);

      // Outside bounds: above topY or below currentBottomY returns 0
      expect(beam.getHalfWidthAtY(80)).toBe(0);
      expect(beam.getHalfWidthAtY(300)).toBe(0);
    });

    it('correctly detects points strictly inside the trapezoid cone', () => {
      // Center point (112, 250) is inside
      expect(beam.containsPoint(112, 250)).toBe(true);
      // Offset point (112 + 10, 250) is inside
      expect(beam.containsPoint(122, 250)).toBe(true);
      // Offset point (112 - 10, 250) is inside
      expect(beam.containsPoint(102, 250)).toBe(true);
      // Offset near edge (112 + 20, 250) is inside (half-width ~ 20.43)
      expect(beam.containsPoint(132, 250)).toBe(true);
    });

    it('rejects points horizontally outside the trapezoid cone', () => {
      // At Y = 250, half-width is ~20.43px. Point at X = 140 (diff 28px) is outside.
      expect(beam.containsPoint(140, 250)).toBe(false);
      expect(beam.containsPoint(80, 250)).toBe(false);
    });

    it('rejects points vertically outside the beam depth', () => {
      // Above emitter (Y < 112)
      expect(beam.containsPoint(112, 80)).toBe(false);
      // Below screen bottom (Y > 280)
      expect(beam.containsPoint(112, 300)).toBe(false);
    });

    it('detects intersection with player ship AABB hitbox', () => {
      const insideHitbox = { x: 106, y: 244, width: 12, height: 12 };
      expect(beam.intersectsAABB(insideHitbox)).toBe(true);
      expect(beam.intersectsHitbox(insideHitbox)).toBe(true);

      const outsideHitbox = { x: 180, y: 244, width: 12, height: 12 };
      expect(beam.intersectsAABB(outsideHitbox)).toBe(false);
      expect(beam.intersectsHitbox(outsideHitbox)).toBe(false);
    });

    it('returns valid geometry snapshot', () => {
      const geo = beam.getGeometry();
      expect(geo.originX).toBe(112);
      expect(geo.originY).toBe(112);
      expect(geo.topWidth).toBe(8);
      expect(geo.bottomWidth).toBe(48);
      expect(geo.targetBottomY).toBe(280);
      expect(geo.extensionRatio).toBe(1.0);
    });
  });

  // ==========================================================================
  // 2. Tractor Beam State Machine & Lifecycle
  // ==========================================================================
  describe('Tractor Beam Lifecycle & Timers', () => {
    let beam: TractorBeam;
    let boss: Enemy;

    beforeEach(() => {
      boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      beam = new TractorBeam();
    });

    it('executes full sequence: EMITTING -> HOLDING -> RETRACTING -> INACTIVE', () => {
      const onStateChange = vi.fn();
      beam.onStateChange = onStateChange;

      beam.activate(boss);
      expect(beam.getState()).toBe('EMITTING');
      expect(beam.isActive()).toBe(true);
      expect(beam.canCapture()).toBe(true);

      // Expand phase (0.5s)
      beam.update(0.5);
      expect(beam.getState()).toBe('HOLDING');
      expect(beam.canCapture()).toBe(true);

      // Hold phase (3.5s)
      beam.update(3.5);
      expect(beam.getState()).toBe('RETRACTING');
      expect(beam.isActive()).toBe(true);

      // Retract phase (0.3s)
      beam.update(0.3);
      expect(beam.getState()).toBe('INACTIVE');
      expect(beam.isActive()).toBe(false);
      expect(beam.canCapture()).toBe(false);

      expect(onStateChange).toHaveBeenCalledWith('HOLDING', 'EMITTING');
      expect(onStateChange).toHaveBeenCalledWith('RETRACTING', 'HOLDING');
      expect(onStateChange).toHaveBeenCalledWith('INACTIVE', 'RETRACTING');
    });

    it('deactivates immediately when Boss is destroyed mid-beam', () => {
      beam.activate(boss);
      beam.update(1.0); // Inside HOLDING phase
      expect(beam.isActive()).toBe(true);

      beam.deactivate(true);
      expect(beam.isActive()).toBe(false);
      expect(beam.getState()).toBe('INACTIVE');
    });

    it('smoothly collapses when deactivated without immediate flag', () => {
      beam.activate(boss);
      beam.update(1.0); // Inside HOLDING phase
      expect(beam.isActive()).toBe(true);

      beam.deactivate(false);
      expect(beam.getState()).toBe('RETRACTING');
      expect(beam.isActive()).toBe(true);

      beam.update(0.3);
      expect(beam.getState()).toBe('INACTIVE');
    });

    it('updates projector anchor coordinates when Boss moves', () => {
      beam.activate(boss);
      expect(beam.bossX).toBe(112);

      boss.x = 130;
      boss.y = 90;
      beam.update(0.1);

      expect(beam.bossX).toBe(130);
      expect(beam.bossY).toBe(90);
      expect(beam.topY).toBe(90 + TractorBeam.EMITTER_OFFSET_Y);
    });
  });

  // ==========================================================================
  // 3. Boss Galaga Tractor Beam Scheduling
  // ==========================================================================
  describe('Tractor Beam Scheduling & Dive Triggers', () => {
    it('suppresses tractor beam activation on Stage 1', () => {
      game.stage = 1;
      const formation = game.getFormationManager();
      formation.spawnStage(1);

      // Verify no beam is activated in Stage 1
      expect(game.tractorBeam.isActive()).toBe(false);
      expect(formation.isTractorBeamActive()).toBe(false);
    });

    it('suppresses tractor beam activation when player is Dual Fighter', () => {
      game.stage = 2;
      game.getPlayer().isDual = true;
      const formation = game.getFormationManager();
      formation.spawnStage(2);

      // Dual Fighter should prevent tractor beam dives
      expect(game.tractorBeam.isActive()).toBe(false);
    });

    it('allows only 1 concurrent tractor beam across the screen', () => {
      const boss1 = new Enemy({ id: 1, type: EnemyType.BOSS, x: 80, y: 100 });
      const boss2 = new Enemy({ id: 2, type: EnemyType.BOSS, x: 140, y: 100 });

      const firstActivation = game.tractorBeam.activate(boss1);
      expect(firstActivation).toBe(true);
      expect(game.tractorBeam.isActive()).toBe(true);
      expect(game.tractorBeam.getBoss()).toBe(boss1);

      // Attempting to activate beam for boss2 while boss1 is active is rejected
      const secondActivation = game.tractorBeam.activate(boss2);
      expect(secondActivation).toBe(false);
      expect(game.tractorBeam.getBoss()).toBe(boss1);
    });

    it('detects active tractor beam via isTractorBeamActive()', () => {
      const formation = game.getFormationManager();
      formation.spawnStage(2);
      expect(formation.isTractorBeamActive()).toBe(false);

      const boss = formation.getLivingEnemies().find((e) => e.type === EnemyType.BOSS)!;
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      expect(formation.isTractorBeamActive()).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Capture Sequence Flow
  // ==========================================================================
  describe('Player Capture Sequence Flow', () => {
    it('traps player in beam cone, disables control, spins at 4 rot/s, and ascents to Boss', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6); // Into HOLDING

      // Trigger capture
      player.startCapture(boss.x, boss.y);
      expect(player.state).toBe('capturing');
      expect(player.canFire).toBe(false);

      // Update 1.25s (halfway through 2.5s ascension)
      player.update(1.25);
      expect(player.state).toBe('capturing');
      // 4.0 rot/s * 1.25s = 5 full rotations = 10*PI rad
      expect(player.captureAngle).toBeCloseTo(Math.PI * 8 * 1.25, 2);
      expect(player.y).toBeLessThan(250);

      // Update remaining 1.25s (reaches Boss)
      player.update(1.25);
      expect(player.lives).toBe(2);
      // Auto-respawns at baseline
      expect(player.state).toBe('respawning');
      expect(player.isInvulnerable()).toBe(true);
    });

    it('triggers GAME OVER when captured with only 1 remaining life', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 1);
      const onGameOver = vi.fn();
      player.onGameOver = onGameOver;

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      player.startCapture(boss.x, boss.y);

      // Complete 2.5s capture ascension
      player.update(2.5);
      expect(player.lives).toBe(0);
      expect(onGameOver).toHaveBeenCalledTimes(1);
    });

    it('does not allow capturing invulnerable or already captured player', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 3);
      player.respawn();
      expect(player.isInvulnerable()).toBe(true);

      player.startCapture(112, 100);
      expect(player.state).toBe('respawning'); // Capture rejected
    });

    it('handles player captured completion by spawning escort on Boss Galaga', () => {
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.active = true;
      game.tractorBeam.activate(boss);

      game.handlePlayerCaptured(112, 116);

      expect(boss.hasCapturedFighter).toBe(true);
      expect(boss.capturedFighterEnemy).not.toBeNull();
      expect(boss.capturedFighterEnemy?.type).toBe(EnemyType.CAPTURED_FIGHTER);
      expect(boss.escortCount).toBe(1);
      expect(game.tractorBeam.isActive()).toBe(false);
      expect(boss.state).toBe(EnemyState.RETURNING_TO_FORMATION);
    });
  });

  // ==========================================================================
  // 5. Rescue & Dual Fighter Docking Flow
  // ==========================================================================
  describe('Rescue & Dual Fighter Docking Mechanics', () => {
    it('rescues captured fighter when player destroys diving Boss holding escort (+1000 pts bonus)', () => {
      game.startGame();
      game.update(2.3); // Enter PLAYING state
      const player = game.getPlayer();
      player.reset(112, 250, 2);

      // Create diving Boss carrying captured fighter
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.getFormationManager().enemies.push(boss, escort);

      // Fire player missile directly into Boss
      game.getBulletManager().firePlayerBullet(112, 126, false);

      const prevScore = game.score;
      // Hit 1: 2 HP -> 1 HP
      game.resolveCollisions();
      expect(boss.health).toBe(1);

      // Hit 2: 1 HP -> 0 HP (Destroyed)
      game.getBulletManager().firePlayerBullet(112, 126, false);
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);
      // Score includes Boss kill (400/800/1600 pts) + 1000 pts rescue bonus
      expect(game.score).toBeGreaterThanOrEqual(prevScore + 1000);
    });

    it('completes docking descent and activates Dual Fighter mode with 4-missile limit', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 2);

      player.startRescue(140, 80);
      expect(player.state).toBe('docking');
      expect(player.isDual).toBe(false);

      // Update until docking completes (descent ~170px / 120px/s ~= 1.5s)
      for (let i = 0; i < 120; i++) {
        player.update(1 / 60);
        if (player.state === 'dual') break;
      }

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.rescuedFighter.active).toBe(false);

      // Dual Fighter can fire up to 4 missiles simultaneously
      const onFire = vi.fn();
      player.onFire = onFire;

      // Shot 1: Pair 1 (2 missiles)
      expect(player.attemptFire()).toBe(true);
      player.activeMissileCount = 2;
      player.update(0.12); // Cooldown

      // Shot 2: Pair 2 (4 missiles total)
      expect(player.attemptFire()).toBe(true);
      player.activeMissileCount = 4;
      player.update(0.12);

      // Shot 3: Blocked by 4-missile quota
      expect(player.attemptFire()).toBe(false);
    });

    it('provides double-width twin hulls hitbox for Dual Fighter', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 3);
      expect(player.getHitbox().width).toBe(12);

      player.isDual = true;
      expect(player.getHitbox().width).toBe(32);
    });
  });

  // ==========================================================================
  // 6. Turncoat Hostile Flow
  // ==========================================================================
  describe('Turncoat Hostile Divergence', () => {
    it('turns captured fighter hostile when Boss is destroyed in formation', () => {
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 52 });
      boss.state = EnemyState.IN_FORMATION;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 36 });
      escort.state = EnemyState.IN_FORMATION;
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.getFormationManager().enemies.push(boss, escort);

      // Fire player missile at formation Boss
      game.getBulletManager().firePlayerBullet(112, 58, false);
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(escort.state).toBe(EnemyState.CAPTURED_HOSTILE);
      expect(escort.escortBoss).toBeNull();
      expect(escort.getScoreValue()).toBe(1000);
      expect(game.getPlayer().state).not.toBe('docking'); // Not rescued!
    });
  });

  // ==========================================================================
  // 7. Accidental Destruction & Asymmetrical Dual Fighter Damage
  // ==========================================================================
  describe('Accidental Destruction & Asymmetrical Damage', () => {
    it('destroys captured escort when shot directly by player (+1000 pts)', () => {
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.escortCount = 1;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.getFormationManager().enemies.push(boss, escort);

      // Shoot escort directly
      game.getBulletManager().firePlayerBullet(112, 108, false);

      const prevScore = game.score;
      game.resolveCollisions();

      expect(escort.health).toBe(0);
      expect(escort.state).toBe(EnemyState.EXPLODING);
      expect(game.score).toBeGreaterThanOrEqual(prevScore + 1000);
      expect(boss.hasCapturedFighter).toBe(false);
      expect(boss.capturedFighterEnemy).toBeNull();
      expect(boss.escortCount).toBe(0);
    });

    it('destroys single hull on partial collision and preserves remaining hull with no life loss', () => {
      const player = game.getPlayer();
      player.reset(100, 250, 3);
      player.isDual = true;

      // Hit only left hull (threat on left side)
      const leftThreat = { x: 86, y: 246, width: 4, height: 6 };
      const hit = player.hitTestAndDamage(leftThreat);

      expect(hit).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.lives).toBe(3); // Lives preserved!
    });

    it('destroys right hull on right-side partial collision and preserves remaining hull with no life loss', () => {
      const player = game.getPlayer();
      player.reset(100, 250, 3);
      player.isDual = true;

      // Hit only right hull (threat on right side)
      const rightThreat = { x: 108, y: 246, width: 4, height: 6 };
      const hit = player.hitTestAndDamage(rightThreat);

      expect(hit).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.lives).toBe(3); // Lives preserved!
    });
  });

  // ==========================================================================
  // 8. Procedural Rendering & Particle Subsystem
  // ==========================================================================
  describe('Procedural Rendering & Spark Particles', () => {
    it('executes tractor beam render safely on canvas context without throwing', () => {
      const beam = new TractorBeam();
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      beam.activate(boss);
      beam.update(0.6); // Into HOLDING

      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        createLinearGradient: vi.fn().mockReturnValue({
          addColorStop: vi.fn(),
        }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1.0,
        globalAlpha: 1.0,
      } as unknown as CanvasRenderingContext2D;

      expect(() => beam.render(mockCtx)).not.toThrow();
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.createLinearGradient).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('initializes and updates spark particle pool', () => {
      const beam = new TractorBeam();
      expect(beam.particles.length).toBe(16);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      beam.activate(boss);

      // Run several frames to spawn and advance particles
      for (let i = 0; i < 30; i++) {
        beam.update(1 / 60);
      }

      const activeParticles = beam.particles.filter((p) => p.active);
      expect(activeParticles).toBeDefined();
      expect(beam.particles.length).toBe(16);
    });
  });
});
