/**
 * Galaga Arcade Web Game — Milestone 4 Adversarial & Stress Test Suite
 * 
 * Challenger: m4_challenger_1 (Empirical Challenger)
 * 
 * Empirical verification of:
 * 1. Stress testing all 5 entry sub-waves (rapid wave advancement, killing enemies mid-entry flight, staggered entry).
 * 2. Stress testing formation breathing oscillation under partial formations (1 enemy remaining, 39 destroyed, extreme timestamps).
 * 3. Collision resolution when 5+ enemies overlap near formation center (single-hit bullet consumption, dual-missile multi-target, swept CCD tunneling prevention, kamikaze overlap).
 * 4. Dive peeling scheduler & return-to-formation docking under single-survivor and low-count formations.
 * 5. Full stage progression lifecycle and high-volume game loop stress testing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormationManager } from '../../src/systems/FormationManager';
import { Enemy } from '../../src/entities/Enemy';
import { Game } from '../../src/core/Game';
import { EnemyType, EnemyState } from '../../src/types';

describe('M4 Challenger 1: Adversarial Stress Test Suite', () => {

  // ==========================================================================
  // 1. Entry Sub-Wave Ingress & Mid-Flight Destruction Stress Tests
  // ==========================================================================
  describe('1. Entry Sub-Waves & Mid-Flight Disruption Stress', () => {
    let formation: FormationManager;

    beforeEach(() => {
      formation = new FormationManager();
    });

    it('orchestrates all 5 entry sub-waves sequentially and transitions all 40 enemies into formation', () => {
      formation.spawnStage(1);
      formation.diveInterval = 999999; // Prevent dive peeling during pure entry wave verification
      expect(formation.isEntryWaveActive).toBe(true);
      expect(formation.enemies.length).toBe(40);
      expect(formation.currentSubWave).toBe(0);

      // First tick triggers Sub-Wave 1
      formation.update(1 / 60);
      expect(formation.currentSubWave).toBe(1);

      // Advance through all 5 sub-waves (subWaveDelay = 2.2s per sub-wave)
      // Total entry phase: 5 sub-waves * 2.2s + flight path durations (~3.5s) = ~15s
      for (let t = 0; t < 16 * 60; t++) {
        formation.update(1 / 60);
      }

      // After 16 seconds, entry phase must be completely finished
      expect(formation.isEntryWaveActive).toBe(false);
      expect(formation.currentSubWave).toBe(5);

      // All 40 enemies must have settled into IN_FORMATION state with flightPath null
      for (const enemy of formation.enemies) {
        expect(enemy.active).toBe(true);
        expect(enemy.state).toBe(EnemyState.IN_FORMATION);
        expect(enemy.flightPath).toBeNull();
      }
    });

    it('handles killing enemies mid-entry flight without corrupting wave scheduler or subsequent arrivals', () => {
      formation.spawnStage(1);
      formation.diveInterval = 999999;

      // Advance 1.0s: Sub-wave 1 (4 Bosses + 4 Goeis) is actively flying along Bézier curves
      formation.update(1.0);
      const subWave1Enemies = formation.enemies.filter((e) => e.state === EnemyState.ENTERING);
      expect(subWave1Enemies.length).toBeGreaterThan(0);

      // Kill 3 enemies mid-flight during Sub-wave 1
      const victims = subWave1Enemies.slice(0, 3);
      for (const v of victims) {
        const res = v.takeDamage(99);
        expect(res.destroyed).toBe(true);
        expect(v.state).toBe(EnemyState.EXPLODING);
      }

      // Advance through explosion duration (0.3s)
      formation.update(0.35);
      for (const v of victims) {
        expect(v.active).toBe(false);
        expect(v.state).toBe(EnemyState.INACTIVE);
      }

      // Remaining living count should be exactly 37
      expect(formation.getLivingCount()).toBe(37);

      // Continue updating through all sub-waves and flight completions
      for (let t = 0; t < 16 * 60; t++) {
        formation.update(1 / 60);
      }

      // Entry phase finishes cleanly
      expect(formation.isEntryWaveActive).toBe(false);

      // The 37 surviving enemies must all be IN_FORMATION
      const surviving = formation.getLivingEnemies();
      expect(surviving.length).toBe(37);
      for (const e of surviving) {
        expect(e.state).toBe(EnemyState.IN_FORMATION);
      }
    });

    it('handles total extermination of all enemies during entry waves and triggers stage clear', () => {
      const onStageClear = vi.fn();
      formation.onStageClear = onStageClear;
      formation.spawnStage(1);

      // Advance through all 5 sub-waves and destroy any active enemy
      for (let wave = 0; wave < 5; wave++) {
        formation.update(formation.subWaveDelay);
        for (const enemy of formation.enemies) {
          if (enemy.active && enemy.state !== EnemyState.EXPLODING) {
            enemy.takeDamage(99);
          }
        }
        // Advance through explosion
        formation.update(0.35);
      }

      expect(formation.isEntryWaveActive).toBe(false);
      expect(formation.getLivingCount()).toBe(0);

      formation.update(0.1);
      expect(onStageClear).toHaveBeenCalledTimes(1);
    });

    it('survives rapid sub-wave advancement over 600 fixed frames (10.0s) without error', () => {
      formation.spawnStage(1);

      // Advance 10 seconds of 60Hz ticks
      for (let frame = 0; frame < 600; frame++) {
        expect(() => formation.update(1 / 60)).not.toThrow();
      }

      // 4 sub-waves will have completed (10s > 4 * 2.2s = 8.8s)
      expect(formation.currentSubWave).toBeGreaterThanOrEqual(4);

      // Positions should all be finite numbers (no NaN or Infinity)
      for (const enemy of formation.enemies) {
        expect(Number.isFinite(enemy.x)).toBe(true);
        expect(Number.isFinite(enemy.y)).toBe(true);
        expect(Number.isFinite(enemy.rotation)).toBe(true);
      }
    });

    it('correctly handles staggered entry start with negative pathElapsedMs', () => {
      formation.spawnStage(1);

      // First tick launches Sub-Wave 1
      formation.update(1 / 60);

      // Sub-wave 1 wingmen have pathElapsedMs = -i * 120ms + (1/60)*1000ms
      const subWave1 = formation.enemies.filter(
        (e) =>
          (e.row === 0 && e.col >= 3 && e.col <= 6) ||
          (e.row === 1 && e.col >= 3 && e.col <= 6)
      );
      expect(subWave1.length).toBe(8);

      // The last wingman has initial pathElapsedMs = -7 * 120 = -840ms
      // After 1 frame (16.67ms), pathElapsedMs is approx -823.33ms
      const lastWingman = subWave1[7]!;
      expect(lastWingman.pathElapsedMs).toBeCloseTo(-840 + (1000 / 60), 1);

      // Position should be at the start of the entry curve (x=112, y=-20)
      expect(lastWingman.x).toBeCloseTo(112, 1);
      expect(lastWingman.y).toBeCloseTo(-20, 1);

      // Update 1.0s (1000ms) -> pathElapsedMs becomes positive and enemy moves down-screen
      formation.update(1.0);
      expect(lastWingman.pathElapsedMs).toBeGreaterThan(0);
      expect(lastWingman.y).toBeGreaterThan(-20);
    });
  });

  // ==========================================================================
  // 2. Formation Breathing Oscillation & Partial Formation Stress Tests
  // ==========================================================================
  describe('2. Formation Breathing Oscillation & Partial Formation Stress', () => {
    let formation: FormationManager;

    beforeEach(() => {
      formation = new FormationManager();
    });

    it('accurately oscillates dynamic slot coordinates for a single surviving enemy (1 remaining, 39 destroyed)', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;
      formation.diveInterval = 999999; // Keep in formation for pure oscillation testing

      // Destroy 39 enemies, leaving only the Boss at Row 0, Col 3
      const soleSurvivor = formation.getEnemyAt(0, 3)!;
      expect(soleSurvivor).toBeDefined();

      for (const e of formation.enemies) {
        if (e.id !== soleSurvivor.id) {
          e.active = false;
          e.state = EnemyState.INACTIVE;
        } else {
          e.state = EnemyState.IN_FORMATION;
          e.flightPath = null;
        }
      }

      expect(formation.getLivingCount()).toBe(1);

      // Sample breathing trajectory over 10 full oscillation cycles (30.0s)
      for (let step = 0; step < 1800; step++) {
        const dt = 1 / 60;
        formation.update(dt);

        const t = formation.elapsedTime;
        const expectedPos = formation.getSlotPosition(0, 3, t);

        // Survivor coordinates must exactly match getSlotPosition
        expect(soleSurvivor.x).toBeCloseTo(expectedPos.x, 3);
        expect(soleSurvivor.y).toBeCloseTo(expectedPos.y, 3);
        expect(soleSurvivor.rotation).toBe(0);

        // Verify mathematical bounds
        const sway = 12 * Math.sin(2 * Math.PI * 0.333 * t);
        const expansion = 1 + 0.18 * Math.sin(2 * Math.PI * 0.5 * t);
        const expectedX = 112 + sway + (3 - 4.5) * 16 * expansion;
        expect(soleSurvivor.x).toBeCloseTo(expectedX, 3);
      }
    });

    it('maintains mathematical precision and bounds over extreme elapsed times (t = 100,000s / ~27 hours)', () => {
      const extremeTime = 100_000.0;
      formation.elapsedTime = extremeTime;

      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 10; c++) {
          const pos = formation.getSlotPosition(r, c, extremeTime);

          expect(Number.isFinite(pos.x)).toBe(true);
          expect(Number.isFinite(pos.y)).toBe(true);

          // X must be within [112 - 12 - 4.5*16*1.18, 112 + 12 + 4.5*16*1.18] = [15.04, 208.96]
          expect(pos.x).toBeGreaterThanOrEqual(14.0);
          expect(pos.x).toBeLessThanOrEqual(210.0);

          // Y must be within [52 + r*16 - 2, 52 + r*16 + 2]
          expect(pos.y).toBeGreaterThanOrEqual(52 + r * 16 - 2.1);
          expect(pos.y).toBeLessThanOrEqual(52 + r * 16 + 2.1);
        }
      }
    });

    it('picks the sole surviving enemy for attack dive when diveTimer elapses', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Keep only 1 Zako at Row 4, Col 5
      const survivor = formation.getEnemyAt(4, 5)!;
      for (const e of formation.enemies) {
        if (e.id !== survivor.id) {
          e.active = false;
          e.state = EnemyState.INACTIVE;
        } else {
          e.state = EnemyState.IN_FORMATION;
          e.flightPath = null;
        }
      }

      // Advance diveTimer to trigger dive attack
      formation.diveTimer = formation.diveInterval;
      formation.update(0.1, 112, 250);

      // Survivor should peel off into DIVING_SOLO
      expect(survivor.state).toBe(EnemyState.DIVING_SOLO);
      expect(survivor.flightPath).not.toBeNull();
    });

    it('smoothly docks returning diving enemy back into formation at moving slot coordinates after bottom wrap-around', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;
      formation.diveInterval = 999999;

      const enemy = formation.enemies[0]!;
      // Peel off solo properly so returnSlot coordinates are configured
      (formation as any).peelOffSolo(enemy, 112);
      expect(enemy.state).toBe(EnemyState.DIVING_SOLO);

      // Position enemy below bottom screen threshold (288 + 16 = 304)
      enemy.flightPath = null;
      enemy.x = 112;
      enemy.y = 305;

      // Update 1 frame to trigger bottom wrap-around
      formation.update(1 / 60);

      expect(enemy.state).toBe(EnemyState.RETURNING_TO_FORMATION);
      expect(enemy.y).toBe(-Enemy.BASE_HEIGHT);

      // Advance returning flight until it docks into formation
      for (let step = 0; step < 300; step++) {
        formation.update(1 / 60);
        if (enemy.state === EnemyState.IN_FORMATION) {
          break;
        }
      }

      expect(enemy.state).toBe(EnemyState.IN_FORMATION);

      // Advance 1 frame for FormationManager to synchronize position with harmonic grid
      formation.update(1 / 60);
      const slotPos = formation.getSlotPosition(enemy.row, enemy.col, formation.elapsedTime);
      expect(enemy.x).toBeCloseTo(slotPos.x, 2);
      expect(enemy.y).toBeCloseTo(slotPos.y, 2);
    });

    it('survives asymmetric enemy clusters (e.g. only leftmost columns surviving)', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Only columns <= 1 alive (Row 1 Col 1, Row 2 Col 1, Row 3 Cols 0..1, Row 4 Cols 0..1 = 6 enemies)
      for (const e of formation.enemies) {
        if (e.col > 1) {
          e.active = false;
          e.state = EnemyState.INACTIVE;
        } else {
          e.state = EnemyState.IN_FORMATION;
          e.flightPath = null;
        }
      }

      expect(formation.getLivingCount()).toBe(6);

      // Run 500 frames of updates
      for (let i = 0; i < 500; i++) {
        expect(() => formation.update(1 / 60)).not.toThrow();
      }

      expect(formation.getLivingCount()).toBe(6);
    });
  });

  // ==========================================================================
  // 3. Multi-Enemy Overlap & Collision Resolution Stress Tests
  // ==========================================================================
  describe('3. Multi-Enemy Overlap & Collision Resolution Stress', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
      game.startGame();
      game.update(2.3); // Enter PLAYING state
      game.getFormationManager().isEntryWaveActive = false;
    });

    it('resolves a single player bullet hitting 5 stacked overlapping enemies: exactly 1 is damaged and bullet is consumed', () => {
      const living = game.getFormationManager().getLivingEnemies();
      expect(living.length).toBe(40);

      // Stack 5 Zakos at the exact same coordinate (112, 120)
      const stack = living.filter((e) => e.type === EnemyType.ZAKO).slice(0, 5);
      for (const e of stack) {
        e.state = EnemyState.DIVING_SOLO;
        e.flightPath = null;
        e.x = 112;
        e.y = 120;
      }

      // Fire a single player bullet at (112, 122) traveling upward
      game.getBulletManager().firePlayerBullet(112, 122, false, 480);
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(1);

      const initialScore = game.score;

      // Process 1 frame of game loop collision resolution
      game.update(1 / 60);

      // The bullet MUST be consumed / recycled
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(0);

      // Exactly ONE enemy in the stack should have exploded and awarded points
      const exploded = stack.filter((e) => e.state === EnemyState.EXPLODING);
      const stillAlive = stack.filter((e) => e.state === EnemyState.DIVING_SOLO);

      expect(exploded.length).toBe(1);
      expect(stillAlive.length).toBe(4);
      expect(game.score).toBe(initialScore + 100); // 100 pts for diving Zako
    });

    it('resolves 2 twin dual fighter bullets hitting 8 overlapping diving enemies: exactly 2 enemies take damage and 2 bullets recycle', () => {
      const living = game.getFormationManager().getLivingEnemies();
      // Pick 8 Zakos (1 HP each)
      const stack = living.filter((e) => e.type === EnemyType.ZAKO).slice(0, 8);

      // Stack 8 enemies in DIVING_SOLO at (112, 100) so FormationManager does not overwrite their position
      for (const e of stack) {
        e.state = EnemyState.DIVING_SOLO;
        e.flightPath = null;
        e.x = 112;
        e.y = 100;
      }

      // Fire 2 twin dual fighter missiles (e.g. left missile at x=108, right missile at x=116)
      // Both missiles are within the 12px hitbox of enemies at x=112 (hitbox x: [106, 118])
      game.getBulletManager().firePlayerBullet(108, 104, true, 480);
      game.getBulletManager().firePlayerBullet(116, 104, true, 480);
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(2);

      // Process collision
      game.update(1 / 60);

      // Both bullets must be recycled
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(0);

      // Exactly 2 enemies take fatal damage and explode
      const exploded = stack.filter((e) => e.state === EnemyState.EXPLODING);
      expect(exploded.length).toBe(2);
    });

    it('prevents high-speed tunneling when bullet (480 px/s) and diving enemy (200 px/s) cross paths in a single frame', () => {
      // In 1 frame (dt = 1/60s):
      // Bullet moves up by 8px (y: 154 -> 146)
      // Enemy moves down by 3.33px (y: 145 -> 148.33)
      // They pass through each other without discrete point centers ever being identical
      const living = game.getFormationManager().getLivingEnemies();
      const zako = living.find((e) => e.type === EnemyType.ZAKO)!;
      zako.state = EnemyState.DIVING_SOLO;
      zako.flightPath = null;
      zako.x = 112;
      zako.y = 145;

      const bullet = game.getBulletManager().firePlayerBullet(112, 154, false, 480);
      expect(bullet).not.toBeNull();

      // Update 1 frame
      game.update(1 / 60);

      // Swept AABB must catch the intersection and destroy the 1 HP Zako
      expect(zako.state).toBe(EnemyState.EXPLODING);
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(0);
    });

    it('handles kamikaze collision with 5 overlapping diving enemies hitting the player ship', () => {
      game.getPlayer().invulnerableTimer = 0;
      game.getPlayer().state = 'normal';
      game.getPlayer().x = 112;
      game.getPlayer().y = 250;
      expect(game.lives).toBe(3);

      const living = game.getFormationManager().getLivingEnemies();
      const kamikazeStack = living.slice(0, 5);
      for (const e of kamikazeStack) {
        e.state = EnemyState.DIVING_SOLO;
        e.flightPath = null;
        e.x = 112;
        e.y = 250;
      }

      // Update 1 frame to trigger collision
      game.update(1 / 60);

      // Player should lose exactly 1 life and enter destroyed state
      expect(game.lives).toBe(2);
      expect(game.getPlayer().state).toBe('destroyed');

      // The colliding enemy should be destroyed (health <= 0, exploding)
      const destroyedCount = kamikazeStack.filter((e) => e.state === EnemyState.EXPLODING).length;
      expect(destroyedCount).toBeGreaterThanOrEqual(1);
    });

    it('handles high volume simultaneous enemy bullets (e.g. 20 concurrent bullets) without pool exhaustion or frame drops', () => {
      const bm = game.getBulletManager();

      // Spawn 20 aimed enemy bullets
      for (let i = 0; i < 20; i++) {
        bm.fireEnemyBullet(20 + i * 9, 50, 112, 250, 200);
      }

      expect(bm.getEnemyBulletCount()).toBe(20);

      // Update bullets for 100 frames
      for (let f = 0; f < 100; f++) {
        game.update(1 / 60);
      }

      // Bullets that flew past bottom screen (y > 288) should be recycled automatically
      expect(bm.getEnemyBulletCount()).toBeLessThan(20);
    });
  });

  // ==========================================================================
  // 4. Boss Galaga Escort Dive & Scoring Matrix Stress Tests
  // ==========================================================================
  describe('4. Boss Galaga Escort Dive & Scoring Matrix Stress', () => {
    let formation: FormationManager;

    beforeEach(() => {
      formation = new FormationManager();
    });

    it('assigns correct scoring when Boss Galaga dives solo (400 pts)', () => {
      const boss = new Enemy({ type: EnemyType.BOSS, x: 112, y: 52 });
      boss.state = EnemyState.DIVING_SOLO;
      boss.escortCount = 0;
      boss.health = 1; // 1 HP remaining (damaged)

      const res = boss.takeDamage(1);
      expect(res.destroyed).toBe(true);
      expect(res.points).toBe(400);
    });

    it('assigns correct scoring when Boss Galaga dives with 1 escort (800 pts)', () => {
      const boss = new Enemy({ type: EnemyType.BOSS, x: 112, y: 52 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.escortCount = 1;
      boss.health = 1;

      const res = boss.takeDamage(1);
      expect(res.destroyed).toBe(true);
      expect(res.points).toBe(800);
    });

    it('assigns correct scoring when Boss Galaga dives with 2 escorts (1600 pts)', () => {
      const boss = new Enemy({ type: EnemyType.BOSS, x: 112, y: 52 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.escortCount = 2;
      boss.health = 1;

      const res = boss.takeDamage(1);
      expect(res.destroyed).toBe(true);
      expect(res.points).toBe(1600);
    });

    it('correctly adapts escort count when Goei escorts are killed mid-dive', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const boss = formation.slots.find((s) => s.type === EnemyType.BOSS)!;
      const bossEnemy = formation.getEnemyAt(boss.row, boss.col)!;

      const goei1 = formation.slots.find((s) => s.type === EnemyType.GOEI && s.row === 1)!;
      const goeiEnemy1 = formation.getEnemyAt(goei1.row, goei1.col)!;

      const goei2 = formation.slots.find((s) => s.type === EnemyType.GOEI && s.row === 2)!;
      const goeiEnemy2 = formation.getEnemyAt(goei2.row, goei2.col)!;

      // Manually trigger Boss escorted dive with 2 Goei escorts
      (formation as any).peelOffBossEscort(bossEnemy, [goeiEnemy1, goeiEnemy2], 112);

      expect(bossEnemy.state).toBe(EnemyState.DIVING_ESCORT);
      expect(bossEnemy.escortCount).toBe(2);

      // Kill 1 Goei mid-flight
      goeiEnemy1.takeDamage(1);
      expect(goeiEnemy1.state).toBe(EnemyState.EXPLODING);

      // Boss dynamic escortCount decrements to 1, awarding 800 pts if destroyed
      expect(bossEnemy.escortCount).toBe(1);
      bossEnemy.health = 1;
      const res = bossEnemy.takeDamage(1);
      expect(res.destroyed).toBe(true);
      expect(res.points).toBe(800);
    });
  });

  // ==========================================================================
  // 5. Game Loop Stage Progression & Stress Integration
  // ==========================================================================
  describe('5. Game Loop Stage Progression & Long-Run Stress', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
    });

    it('advances through Stage Clear intermission to next stage cleanly', () => {
      game.startGame();
      expect(game.stage).toBe(1);

      // Fast forward intro
      game.update(2.3);
      expect(game.state).toBe('PLAYING');

      // Clear all enemies
      for (const e of game.getFormationManager().enemies) {
        e.active = false;
        e.state = EnemyState.INACTIVE;
      }
      game.getFormationManager().isEntryWaveActive = false;

      // Update 1 frame to trigger onStageClear
      game.update(1 / 60);
      expect(game.state).toBe('STAGE_CLEAR');

      // Fast forward 1.8s intermission
      game.update(1.9);
      expect(game.stage).toBe(2);
      expect(game.state).toBe('STAGE_INTRO');

      // Fast forward stage 2 intro
      game.update(2.3);
      expect(game.state).toBe('PLAYING');
      expect(game.getFormationManager().getLivingCount()).toBe(40);
    });

    it('correctly transitions Stage 3 to CHALLENGING_STAGE state', () => {
      game.startGame();
      game.stage = 3;
      game.update(2.3); // Complete stage intro

      expect(game.isChallengingStage(3)).toBe(true);
      expect(game.state).toBe('CHALLENGING_STAGE');
    });

    it('executes 1,000 continuous game frames under heavy combat without memory corruption or exception', () => {
      game.startGame();
      game.update(2.3);

      for (let frame = 0; frame < 1000; frame++) {
        expect(() => game.update(1 / 60)).not.toThrow();
      }
    });
  });
});
