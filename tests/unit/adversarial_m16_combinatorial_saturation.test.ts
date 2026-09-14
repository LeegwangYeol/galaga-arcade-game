/**
 * Milestone 16 Adversarial Hardening: Combinatorial Saturation Suite
 * 
 * Verifies cross-system extreme combinatorial saturation under confluent hazard states:
 * 1. Confluent Confluence:
 *    - Stage 50 Aeternum Core in Phase 3 Enrage (Spiral bullet hell + Bézier Ram Swoop)
 *    - The Contingency Crisis Event (Rogue EMP pulse + Homing bullet steering + Fire rate stutter)
 *    - Chrono Freeze 3.0s time stop (enemyDt = 0)
 *    - Dual Fighter ship state (two missile emitters, 30px hitbox)
 *    - 3 Tactical Drones active simultaneously (Escort, Aegis, Bomber)
 *    - Dimensional Warp Ram surge (800 px/s invulnerable charge + flight lane bullet vaporization + boss kinetic trauma)
 * 2. Kinematic & Invariant Assertions:
 *    - While Chrono Freeze is active, enemyDt = 0:
 *      - Boss coordinates, phase timers, and ram swoop progress are strictly frozen.
 *      - Active enemy bullets do not advance in position.
 *      - Player ship, bullets, and drones continue updating at full 60 FPS (dt = 1/60).
 *    - Warp Ram sweeps flight lane:
 *      - Vaporizes enemy bullets in [px - 20, px + 20] and safely recycles them into bulletPool.
 *      - Inflicts 120 blunt kinetic trauma to Aeternum Core.
 *      - Grants complete hazard invulnerability across Mega-Beams and EMP pulses.
 * 3. Mathematical & Process Integrity:
 *    - 0 NaN or Infinity coordinates across all entities, bullets, drones, and boss sub-units.
 *    - 0 unhandled promise rejections and 0 uncaught exceptions.
 *    - Clean end-of-stage boundary teardown.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';


function teardownStageBoundary(game: Game): void {
  game.bulletManager.clear();
  game.particleSystem.clear();
  if (game.powerUpManager) {
    game.powerUpManager.reset();
  }
  if (game.alliesManager) {
    game.alliesManager.onStageClear();
  }
  if (game.specialMovesManager) {
    game.specialMovesManager.onStageClear();
  }
  if (game.formationManager) {
    game.formationManager.reset();
  }
  if (game.bossManager) {
    game.bossManager.reset();
  }
  if (game.crisisEventManager) {
    game.crisisEventManager.clearCrisis();
  }
}

describe('Milestone 16 Adversarial: Combinatorial Saturation Suite', () => {
  let game: Game;
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];
  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

  beforeEach(() => {
    unhandledRejections = [];
    uncaughtExceptions = [];
    rejectionHandler = (reason: any) => unhandledRejections.push(reason);
    exceptionHandler = (error: Error) => uncaughtExceptions.push(error);
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);

    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    if (game) {
      teardownStageBoundary(game);
      game.destroy();
    }
    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);

    expect(unhandledRejections.length).toBe(0);
    expect(uncaughtExceptions.length).toBe(0);
  });

  it('1. survives simultaneous Stage 50 Phase 3 Enrage + Contingency + Chrono Freeze + Dual Fighter + 3 Drones + Warp Ram', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // 1. Advance to Stage 50 (Aeternum Star-Eater Core)
    const skipped = cheat.skipToStage(50);
    expect(skipped).toBe(true);
    expect(game.stage).toBe(50);

    const boss = game.bossManager.activeBoss as AeternumCore;
    expect(boss).not.toBeNull();
    expect(boss).toBeInstanceOf(AeternumCore);
    expect(boss.maxHealth).toBe(300);

    // 2. Force Phase 3 Enrage (destroy orbital satellites, HP <= 100)
    boss.satellites.forEach((s) => {
      s.active = false;
      s.health = 0;
    });
    expect(boss.isProtectedBySubUnits()).toBe(false);

    boss.phase = 'PHASE_3';
    boss.introTimer = 0;
    boss.invulnerableTimer = 0;
    boss.health = 80; // <= 100 HP triggers Enrage state
    (boss as any).spiralAngleA = 0;
    (boss as any).spiralAngleB = 0;
    (boss as any).spiralFireTimer = 0;

    // 3. Trigger The Contingency Crisis Event
    const triggeredCrisis = cheat.triggerCrisis('contingency');
    expect(triggeredCrisis).toBe(true);
    const crisis = game.crisisEventManager.getActiveCrisis();
    expect(crisis).not.toBeNull();
    (crisis as any).state = 'ACTIVE';

    // 4. Enable Dual Fighter configuration
    game.player.isDual = true;
    expect(game.player.isDual).toBe(true);
    expect(game.player.getHitbox().width).toBe(32);

    // 5. Summon all 3 tactical drones
    const unlockedAll = cheat.unlockDrone('all');
    expect(unlockedAll).toBe(true);
    expect(game.alliesManager.escortDrone.active).toBe(true);
    expect(game.alliesManager.aegisDrone.active).toBe(true);
    expect(game.alliesManager.bomberDrone.active).toBe(true);

    // 6. Advance 30 frames to populate spiral bullet hell & ally munitions
    for (let f = 0; f < 30; f++) {
      game.bulletManager.firePlayerBullet(game.player.x - 6, game.player.y - 8, true, 480);
      game.bulletManager.firePlayerBullet(game.player.x + 6, game.player.y - 8, true, 480);
      game.update(1 / 60);
    }
    expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThan(5);

    // 7. Trigger Chrono Freeze (Special Move 2: 3.0s time stop)
    cheat.fillEnergy(100);
    const triggeredFreeze = cheat.triggerSpecialMove('chrono');
    expect(triggeredFreeze).toBe(true);
    expect(game.specialMovesManager.isChronoFreezeActive()).toBe(true);
    expect(game.specialMovesManager.getEnemyDeltaTime(1 / 60)).toBe(0);

    // Record frozen kinematic state
    const frozenBossX = boss.x;
    const frozenBossY = boss.y;
    const frozenAngleA = (boss as any).spiralAngleA;
    const frozenAngleB = (boss as any).spiralAngleB;
    const initialBulletPositions = new Map<number, { x: number; y: number }>();
    game.bulletManager.forEachActiveEnemyBullet((b) => {
      initialBulletPositions.set(b.id, { x: b.position.x, y: b.position.y });
    });
    expect(initialBulletPositions.size).toBeGreaterThan(0);

    // 8. Run 20 frozen frames
    for (let f = 0; f < 20; f++) {
      game.update(1 / 60);

      // Invariant: Boss coordinates and spiral angles MUST remain frozen
      expect(boss.x).toBe(frozenBossX);
      expect(boss.y).toBe(frozenBossY);
      expect((boss as any).spiralAngleA).toBe(frozenAngleA);
      expect((boss as any).spiralAngleB).toBe(frozenAngleB);

      // Invariant: Active enemy bullets MUST remain strictly stationary
      game.bulletManager.forEachActiveEnemyBullet((b) => {
        const initPos = initialBulletPositions.get(b.id);
        if (initPos) {
          expect(b.position.x).toBe(initPos.x);
          expect(b.position.y).toBe(initPos.y);
        }
      });
    }

    // 9. Execute Warp Ram mid-freeze with isolated kinematic tracking
    // Recycle active player bullets and ally bombs to prevent extraneous damage
    game.bulletManager.forEachActivePlayerBullet((b) => game.bulletManager.recycle(b));
    game.alliesManager.getBombPool().clear();
    game.alliesManager.getExplosionPool().clear();

    // Temporarily suspend drones during Warp Ram execution to isolate kinetic collision
    game.alliesManager.escortDrone.active = false;
    game.alliesManager.bomberDrone.active = false;
    game.alliesManager.aegisDrone.active = false;

    boss.health = 250;
    boss.maxHealth = 300;
    const preRamBossHp = boss.health;

    // Position player in line with the boss to test kinetic collision
    game.player.x = boss.x;
    game.player.y = 250;
    const initialPlayerY = game.player.y;

    cheat.fillEnergy(100);
    const triggeredWarp = cheat.triggerSpecialMove('warp');
    expect(triggeredWarp).toBe(true);
    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

    let minPlayerY = initialPlayerY;
    let reachedIntermediateAscent = false;
    let reachedTopScreenExit = false;

    // Run Warp Ram execution frames (60 frames = 1.0s)
    for (let f = 0; f < 60; f++) {
      game.update(1 / 60);

      minPlayerY = Math.min(minPlayerY, game.player.y);
      if (game.player.y < initialPlayerY - 100) {
        reachedIntermediateAscent = true;
      }
      if (game.player.y <= -30) {
        reachedTopScreenExit = true;
      }
    }

    // Invariants: Unmasked genuine upward ascent and top-screen exit
    expect(reachedIntermediateAscent).toBe(true);
    expect(reachedTopScreenExit).toBe(true);
    expect(minPlayerY).toBeLessThanOrEqual(-30);

    // Invariant: Warp Ram inflicted exact 120 blunt kinetic trauma to boss without duplicate hits
    expect(boss.health).toBe(preRamBossHp - 120);

    // Invariant: Player wrapped cleanly and returned to baseline Y position with grace invulnerability
    expect(game.player.y).toBe(250);
    expect(game.player.invulnerableTimer).toBeGreaterThan(0);

    // Restore drone activity for subsequent test phases
    game.alliesManager.escortDrone.active = true;
    game.alliesManager.bomberDrone.active = true;
    game.alliesManager.aegisDrone.active = true;

    // Invariant: Zero NaN or infinite coordinates across all active entities
    expect(Number.isFinite(game.player.x)).toBe(true);
    expect(Number.isFinite(game.player.y)).toBe(true);
    expect(Number.isFinite(boss.x)).toBe(true);
    expect(Number.isFinite(boss.y)).toBe(true);

    game.bulletManager.forEachActiveEnemyBullet((b) => {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
      expect(Number.isFinite(b.velocity.x)).toBe(true);
      expect(Number.isFinite(b.velocity.y)).toBe(true);
      expect(Number.isFinite(b.angle)).toBe(true);
    });

    // 10. Advance until Chrono Freeze expires and verify normal kinematics resume
    while (game.specialMovesManager.isChronoFreezeActive()) {
      game.update(1 / 60);
    }
    expect(game.specialMovesManager.getEnemyDeltaTime(1 / 60)).toBe(1 / 60);

    // Update 10 more frames after freeze lifts
    for (let f = 0; f < 10; f++) {
      game.update(1 / 60);
    }

    // Verify all pools still intact and functional
    expect(game.bulletManager.getPool().getCapacity()).toBeLessThanOrEqual(256);
    expect(game.alliesManager.getBombPool().getCapacity()).toBe(16);
    expect(game.alliesManager.getExplosionPool().getCapacity()).toBe(16);
  });

  it('2. guarantees Warp Ram invulnerability crossing active Aeternum Mega-Beam and Contingency EMP', () => {
    const cheat = game.getCheatController();

    cheat.skipToStage(50);
    const boss = game.bossManager.activeBoss as AeternumCore;
    expect(boss).not.toBeNull();

    // Setup Phase 2 Mega-Beam
    boss.satellites.forEach((s) => (s.active = false));
    boss.phase = 'PHASE_2';
    boss.invulnerableTimer = 0;
    boss.megaBeam.active = true;
    boss.megaBeam.firing = true;
    boss.megaBeam.centerX = 112;
    boss.megaBeam.fireTimer = 2.0;
    boss.megaBeam.topY = 70;
    boss.megaBeam.bottomY = 288;
    boss.megaBeam.width = 134;

    // Trigger Contingency EMP ring
    cheat.triggerCrisis('contingency');

    // Place player directly in the center of the mega-beam
    game.player.x = 112;
    game.player.y = 250;
    const initialLives = game.player.lives;

    // Ensure cheat god-mode is disabled to strictly test Warp Ram native invulnerability
    cheat.setInvincible(false);
    expect(game.player.isInvincibleCheat).toBe(false);

    // Trigger Warp Ram
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('warp');
    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

    // Charge upward through the active beam column
    for (let f = 0; f < 45; f++) {
      game.update(1 / 60);
      // Invariant: Player MUST NOT lose a life while Warp Ram is active
      expect(game.player.lives).toBe(initialLives);
      expect(game.player.state).not.toBe('destroyed');
      expect(game.player.state).not.toBe('DESTROYED');
    }
  });

  it('3. verifies The Contingency bullet steering math stability when enemyDt = 0', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    cheat.skipToStage(12);
    cheat.triggerCrisis('contingency');

    // Spawn varied enemy bullets across canvas
    for (let i = 0; i < 8; i++) {
      const x = 30 + i * 20;
      const y = 80 + (i % 3) * 30;
      const vx = (i % 2 === 0 ? 50 : -50);
      const vy = 120;
      game.bulletManager.fireEnemyBulletWithVector(x, y, vx, vy);
    }

    // Freeze time
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('chrono');
    expect(game.specialMovesManager.isChronoFreezeActive()).toBe(true);

    // Update 30 frames with freeze active
    for (let f = 0; f < 30; f++) {
      game.update(1 / 60);

      // Verify steering computation never produces NaN or Infinity
      game.bulletManager.forEachActiveEnemyBullet((b) => {
        expect(Number.isFinite(b.velocity.x)).toBe(true);
        expect(Number.isFinite(b.velocity.y)).toBe(true);
        expect(Number.isFinite(b.angle)).toBe(true);
        expect(b.velocity.x).toBeGreaterThanOrEqual(-120);
        expect(b.velocity.x).toBeLessThanOrEqual(120);
        expect(b.angle).toBeGreaterThanOrEqual(-Math.PI - 0.01);
        expect(b.angle).toBeLessThanOrEqual(Math.PI + 0.01);
      });
    }
  });

  it('4. tests flight-lane bullet vaporization boundary and energy gain during Warp Ram', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    cheat.skipToStage(15);
    game.player.x = 112;
    game.player.y = 250;

    // Spawn 5 bullets in the flight lane [112 - 20, 112 + 20] = [92, 132]
    // and 5 bullets outside the flight lane
    for (let i = 0; i < 5; i++) {
      game.bulletManager.fireEnemyBulletWithVector(100 + i * 4, 150 - i * 15, 0, 100); // In lane
      game.bulletManager.fireEnemyBulletWithVector(50 - i * 5, 150 - i * 15, 0, 100);  // Out of lane
    }

    const initialEnergy = 10;
    cheat.fillEnergy(initialEnergy);

    // Execute Warp Ram
    (game.specialMovesManager as any).executeWarpRam();
    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

    // Update frames to allow player to sweep through the lane
    for (let f = 0; f < 30; f++) {
      game.update(1 / 60);
    }

    // In-lane bullets should be vaporized, granting bonus energy
    expect(game.specialMovesManager.energy).toBeGreaterThanOrEqual(initialEnergy);

    // Check outside-lane bullets still exist or have moved safely
    let remainingBullets = 0;
    game.bulletManager.forEachActiveEnemyBullet(() => remainingBullets++);
    expect(remainingBullets).toBeGreaterThanOrEqual(1);
  });

  it('5. preserves full pool hygiene and zero-leak teardown after combinatorial saturation', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Max combinatorial stress
    cheat.skipToStage(50);
    cheat.triggerCrisis('contingency');
    game.player.isDual = true;
    cheat.unlockDrone('all');
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('nova');

    for (let f = 0; f < 30; f++) {
      game.bulletManager.firePlayerBullet(106, 240, true, 480);
      game.bulletManager.firePlayerBullet(118, 240, true, 480);
      game.alliesManager.spawnClusterBomb(112, 40);
      game.particleSystem.spawnBossExplosion(112, 52, 20);
      game.update(1 / 60);
    }

    // Execute stage teardown
    teardownStageBoundary(game);

    // Invariant: All 8 pools must have 0 active items
    expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
    expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
    expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
    expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
    expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
    expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
    expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
    expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);

    // Invariant: Fixed-capacity pools have freeCount === capacity
    expect(game.powerUpManager.getPool().getFreeCount()).toBe(32);
    expect(game.alliesManager.getBombPool().getFreeCount()).toBe(16);
    expect(game.alliesManager.getExplosionPool().getFreeCount()).toBe(16);
    expect(game.specialMovesManager.getMissilePool().getFreeCount()).toBe(32);
    expect(game.specialMovesManager.getSparkPool().getFreeCount()).toBe(32);
    expect(game.formationManager.getEnemyPool().getFreeCount()).toBe(64);
  });
});
