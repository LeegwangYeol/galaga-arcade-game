/**
 * Galaga Arcade Web Game — Milestone 13: Allies Support System Unit Test Suite
 * 
 * Verifies kinematics, boundary clamps, autofire cadence, player quota isolation,
 * shield repair sync, point-defense flak, bombing runs, and milestone unlocks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { AlliesManager } from '../../src/core/allies/AlliesManager';
import { EscortDrone } from '../../src/core/allies/drones/EscortDrone';
import { AegisDrone } from '../../src/core/allies/drones/AegisDrone';
import { BomberDrone } from '../../src/core/allies/drones/BomberDrone';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 13 — Allies Support System', () => {
  let game: Game;
  let alliesManager: AlliesManager;

  beforeEach(() => {
    game = new Game();
    alliesManager = game.getAlliesManager();
  });

  describe('1. Escort Wingman Drone Kinematics & Autofire', () => {
    let escort: EscortDrone;

    beforeEach(() => {
      escort = alliesManager.escortDrone;
      escort.activate(0, 112, 250);
    });

    it('orbits player in continuous parametric harmonic motion (x = px + R cos theta, y = py + R sin theta)', () => {
      const initialAngle = escort.angle;
      expect(initialAngle).toBe(0);
      expect(escort.x).toBeCloseTo(112 + escort.radius);
      expect(escort.y).toBeCloseTo(250);

      // Advance by quarter period (dt = 0.5s at omega = PI rad/s => angle = PI/2)
      escort.update(0.5, 112, 250);
      expect(escort.angle).toBeCloseTo(Math.PI / 2);
      expect(escort.x).toBeCloseTo(112); // cos(PI/2) = 0
      expect(escort.y).toBeCloseTo(250 + escort.radius); // sin(PI/2) = 1

      // Advance by another quarter period (angle = PI)
      escort.update(0.5, 112, 250);
      expect(escort.angle).toBeCloseTo(Math.PI);
      expect(escort.x).toBeCloseTo(112 - escort.radius); // cos(PI) = -1
      expect(escort.y).toBeCloseTo(250); // sin(PI) = 0
    });

    it('strictly clamps orbital trajectory within virtual screen bounds [4, 220] and [10, 280]', () => {
      // Position player at left screen boundary
      escort.update(0.1, 2, 250);
      expect(escort.x).toBeGreaterThanOrEqual(4);

      // Position player at right screen boundary
      escort.update(0.1, 224, 250);
      expect(escort.x).toBeLessThanOrEqual(220);

      // Position player at top boundary
      escort.update(0.1, 112, 5);
      expect(escort.y).toBeGreaterThanOrEqual(10);
    });

    it('autofires plasma bolts at 0.35s cadence without consuming player missile quota', () => {
      game.state = 'PLAYING';
      const initialShots = escort.shotsFired;
      const initialPlayerBullets = game.bulletManager.getPlayerBulletCount();

      // Advance less than cadence
      escort.update(0.2, 112, 250);
      expect(escort.shotsFired).toBe(initialShots);

      // Advance past cadence (0.2 + 0.2 = 0.4s >= 0.35s)
      escort.update(0.2, 112, 250);
      expect(escort.shotsFired).toBe(initialShots + 1);

      // Player bullet count must NOT increase (isolated drone bullets)
      expect(game.bulletManager.getPlayerBulletCount()).toBe(initialPlayerBullets);
      expect(game.player.activeMissileCount).toBe(0);
    });

    it('permits manual player shooting when at max quota without starvation from drone fire', () => {
      game.state = 'PLAYING';
      // Fill player quota with 2 manual missiles
      game.bulletManager.firePlayerBullet(game.player.x - 6, game.player.y);
      game.bulletManager.firePlayerBullet(game.player.x + 6, game.player.y);
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);

      // Trigger drone fire
      escort.update(0.4, 112, 250);
      expect(escort.shotsFired).toBe(1);

      // Player bullet quota remains exactly 2 (drone bullets do not starve player)
      expect(game.bulletManager.getPlayerBulletCount()).toBe(2);
    });

    it('suppresses drone autofire when player is destroyed or captured', () => {
      game.state = 'PLAYING';
      game.player.state = 'DESTROYED';

      const initialShots = escort.shotsFired;
      escort.update(1.0, 112, 250);
      expect(escort.shotsFired).toBe(initialShots);

      game.player.state = 'CAPTURED';
      escort.update(1.0, 112, 250);
      expect(escort.shotsFired).toBe(initialShots);
    });
  });

  describe('2. Kinetic Aegis Drone Shield Repair & Point Defense', () => {
    let aegis: AegisDrone;

    beforeEach(() => {
      aegis = alliesManager.aegisDrone;
      aegis.activate(0, 112, 250);
    });

    it('trails player fighter with flank offset and lerp follow kinematics', () => {
      // Start player at (112, 250)
      aegis.update(0.1, 112, 250);
      expect(aegis.x).toBeLessThan(112); // Left flank offset

      // Move player rapidly to the right
      const prevAegisX = aegis.x;
      aegis.update(0.1, 180, 250);
      expect(aegis.x).toBeGreaterThan(prevAegisX); // Lerping toward player + offset
    });

    it('detects depleted shield and emits repair pulse every 6.0s, syncing with PowerUpManager', () => {
      game.player.hasShield = false;
      game.player.shieldHp = 0;
      game.powerUpManager.buffState.hasShield = false;

      // Advance by 3.0s (charging, not yet ready)
      aegis.update(3.0, 112, 250);
      expect(game.player.hasShield).toBe(false);

      // Advance past 6.0s pulse interval (3.0s + 3.1s = 6.1s >= 6.0s)
      aegis.update(3.1, 112, 250);

      // Shield must be fully restored on player AND synced to PowerUpManager
      expect(game.player.hasShield).toBe(true);
      expect(game.player.shieldHp).toBe(1);
      expect(game.powerUpManager.buffState.hasShield).toBe(true);
      expect(aegis.shieldsRepaired).toBe(1);
    });

    it('intercepts and neutralizes hostile enemy bullets within 12px point-defense radius', () => {
      // Spawn hostile enemy bullet right next to Aegis drone
      const enemyBullet = game.bulletManager.fireEnemyBullet(aegis.x + 4, aegis.y + 4, 0, 200);
      expect(enemyBullet).not.toBeNull();
      expect(enemyBullet?.active).toBe(true);

      // Run Aegis point defense interception
      aegis.pointDefenseCooldown = 0;
      aegis.interceptHostileBullets();

      // Enemy bullet should be neutralized
      expect(enemyBullet?.active).toBe(false);
    });
  });

  describe('3. Strategic Bomber Drone Sweep & Munitions', () => {
    let bomber: BomberDrone;

    beforeEach(() => {
      bomber = alliesManager.bomberDrone;
    });

    it('sweeps upper playfield at Y=36px with Vx=140px/s', () => {
      bomber.activate(0, -24, 36);
      expect(bomber.x).toBe(-24);
      expect(bomber.y).toBe(36);
      expect(bomber.vx).toBe(140);

      // Update 0.5s => moves 70px
      bomber.update(0.5);
      expect(bomber.x).toBeCloseTo(-24 + 70);
    });

    it('drops cluster bombs across playfield (X in [16, 208]) up to 6 bombs', () => {
      bomber.activate(0, 10, 36);
      expect(bomber.bombsDropped).toBe(0);

      // Sweep through playfield
      for (let i = 0; i < 20; i++) {
        bomber.update(0.1);
      }

      expect(bomber.bombsDropped).toBeGreaterThan(0);
      expect(bomber.bombsDropped).toBeLessThanOrEqual(6);
    });

    it('deactivates automatically upon exiting right boundary (X > 248px)', () => {
      bomber.activate(0, 240, 36);
      expect(bomber.active).toBe(true);

      bomber.update(0.1); // moves to 240 + 14 = 254 > 248
      expect(bomber.active).toBe(false);
    });

    it('cluster bombs accelerate with gravity and detonate into expanding 28px AOE shockwaves', () => {
      const bomb = alliesManager.spawnClusterBomb(100, 50);
      expect(bomb).not.toBeNull();
      expect(bomb?.active).toBe(true);

      // Update bomb until detonation (targetY = 105 reached in ~4 ticks of 0.1s at vy=150)
      for (let i = 0; i < 4; i++) {
        alliesManager.update(0.1);
      }

      // Bomb detonates and leaves an active shockwave in explosionPool
      let activeExplosions = 0;
      alliesManager.getExplosionPool().forEachActive((exp) => {
        activeExplosions++;
        expect(exp.maxRadius).toBe(28);
      });
      expect(activeExplosions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. AlliesManager Score Milestones & Crisis Synergies', () => {
    it('unlocks Escort Drone at 15,000 score milestone', () => {
      expect(alliesManager.escortDrone.active).toBe(false);

      alliesManager.checkMilestones(14990, 1);
      expect(alliesManager.escortDrone.active).toBe(false);

      alliesManager.checkMilestones(15000, 1);
      expect(alliesManager.escortDrone.active).toBe(true);
    });

    it('unlocks Aegis Drone at 35,000 score milestone', () => {
      expect(alliesManager.aegisDrone.active).toBe(false);

      alliesManager.checkMilestones(34990, 1);
      expect(alliesManager.aegisDrone.active).toBe(false);

      alliesManager.checkMilestones(35000, 1);
      expect(alliesManager.aegisDrone.active).toBe(true);
    });

    it('unlocks Bomber Drone at 60,000 score milestone', () => {
      expect(alliesManager.bomberDrone.active).toBe(false);

      alliesManager.checkMilestones(59990, 1);
      expect(alliesManager.bomberDrone.active).toBe(false);

      alliesManager.checkMilestones(60000, 1);
      expect(alliesManager.bomberDrone.active).toBe(true);
    });

    it('summons Bomber air support run when Stellaris crisis event triggers', () => {
      expect(alliesManager.bomberDrone.active).toBe(false);

      alliesManager.onCrisisTriggered('COSMIC_SOLAR_FLARE');
      expect(alliesManager.bomberDrone.active).toBe(true);
    });

    it('resolves bomb shockwave collisions and destroys living enemies with zero runtime GC', () => {
      const enemy = new Enemy({
        id: 'test_zako_1',
        type: EnemyType.ZAKO,
        x: 100,
        y: 100,
      });
      enemy.state = EnemyState.IN_FORMATION;
      game.formationManager.enemies.push(enemy);

      // Detonate shockwave directly on enemy
      alliesManager.spawnExplosion(100, 100, 28, 2);

      // Resolve collisions
      alliesManager.resolveCollisions(game.formationManager.getLivingEnemies());

      // Enemy takes damage and is destroyed
      expect(enemy.health).toBeLessThanOrEqual(0);
      expect(enemy.state).toBe(EnemyState.EXPLODING);
    });
  });
});
