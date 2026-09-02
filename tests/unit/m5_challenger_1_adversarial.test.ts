/**
 * Galaga Arcade Web Game — Milestone 5 Adversarial Challenge Test Suite
 * Author: m5_challenger_1 (Empirical Challenger)
 * 
 * Focus Areas:
 * 1. Extreme Trapezoid Boundary Hit Detection (x = x_left +- eps, x = x_right +- eps, y = y_top +- eps, y = y_bottom +- eps)
 * 2. Dynamic Beam Expansion & Player Escape vs Mid-Expansion Trapping
 * 3. Boss Galaga Destruction on Frame 0 of Capture vs Mid-Ascent
 * 4. Multi-bullet & Edge Case State Machine Stress Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { Enemy } from '../../src/entities/Enemy';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { Player } from '../../src/entities/Player';
import { EnemyType, EnemyState } from '../../src/types';

describe('M5 Challenger 1: Adversarial Tractor Beam & Capture Stress Suite', () => {
  const EPS = 1e-4;

  // ==========================================================================
  // 1. Extreme Trapezoid Boundary Hit Detection
  // ==========================================================================
  describe('Adversarial Dimension 1: Extreme Trapezoid Boundary Geometry', () => {
    let beam: TractorBeam;
    let boss: Enemy;
    const bossX = 112;
    const bossY = 80;
    // topY = bossY + 12 = 92
    // targetBottomY = 280
    // fullHeight = 188
    // topWidth = 8 (halfWidth = 4)
    // bottomWidth = 48 (halfWidth = 24)

    beforeEach(() => {
      boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: bossX, y: bossY });
      beam = new TractorBeam();
      beam.activate(boss);
      beam.update(0.6); // Fully expanded into HOLDING state
    });

    describe('Vertical Boundary Thresholds (y = y_top +- eps, y = y_bottom +- eps)', () => {
      it('rejects points just above top emitter (y = topY - eps) and accepts points at top (y = topY)', () => {
        const topY = 92;
        // Exactly above top emitter
        expect(beam.containsPoint(bossX, topY - EPS)).toBe(false);
        expect(beam.containsPoint(bossX, topY - 1.0)).toBe(false);

        // Exactly on top emitter
        expect(beam.containsPoint(bossX, topY)).toBe(true);
        expect(beam.getHalfWidthAtY(topY)).toBeCloseTo(4.0, 5);

        // Horizontal edges at top emitter (halfWidth = 4 -> [108, 116])
        expect(beam.containsPoint(bossX - 4.0, topY)).toBe(true);
        expect(beam.containsPoint(bossX + 4.0, topY)).toBe(true);
        expect(beam.containsPoint(bossX - 4.0 - EPS, topY)).toBe(false);
        expect(beam.containsPoint(bossX + 4.0 + EPS, topY)).toBe(false);
      });

      it('rejects points just below bottom reach (y = bottomY + eps) and accepts points at bottom (y = bottomY)', () => {
        const bottomY = 280;
        // Exactly on bottom boundary
        expect(beam.containsPoint(bossX, bottomY)).toBe(true);
        expect(beam.getHalfWidthAtY(bottomY)).toBeCloseTo(24.0, 5);

        // Horizontal edges at bottom boundary (halfWidth = 24 -> [88, 136])
        expect(beam.containsPoint(bossX - 24.0, bottomY)).toBe(true);
        expect(beam.containsPoint(bossX + 24.0, bottomY)).toBe(true);
        expect(beam.containsPoint(bossX - 24.0 - EPS, bottomY)).toBe(false);
        expect(beam.containsPoint(bossX + 24.0 + EPS, bottomY)).toBe(false);

        // Below bottom boundary
        expect(beam.containsPoint(bossX, bottomY + EPS)).toBe(false);
        expect(beam.containsPoint(bossX, bottomY + 1.0)).toBe(false);
      });
    });

    describe('Horizontal Slanted Boundary Edges at Multiple Y Altitudes', () => {
      it('evaluates slanted trapezoid boundary with sub-pixel precision across 10 altitude slices', () => {
        const topY = 92;
        const bottomY = 280;
        const totalH = bottomY - topY; // 188

        for (let i = 0; i <= 10; i++) {
          const ratio = i / 10;
          const y = topY + ratio * totalH;
          const expectedHalfW = 4.0 + ratio * 20.0;
          const leftEdge = bossX - expectedHalfW;
          const rightEdge = bossX + expectedHalfW;

          expect(beam.getHalfWidthAtY(y)).toBeCloseTo(expectedHalfW, 4);

          // Center is inside
          expect(beam.containsPoint(bossX, y)).toBe(true);

          // Left edge: inside by eps, outside by eps
          expect(beam.containsPoint(leftEdge + 1e-6, y)).toBe(true);
          expect(beam.containsPoint(leftEdge - EPS, y)).toBe(false);

          // Right edge: inside by eps, outside by eps
          expect(beam.containsPoint(rightEdge - 1e-6, y)).toBe(true);
          expect(beam.containsPoint(rightEdge + EPS, y)).toBe(false);
        }
      });

      it('evaluates exact player baseline altitude (Y = 250)', () => {
        const baselineY = 250;
        // spanRatio = (250 - 92) / 188 = 158 / 188 = 79 / 94 ~= 0.84042553
        // halfWidth = 4 + 20 * (79/94) = 4 + 1580/94 = 1956/94 = 978/47 ~= 20.8085106
        const expectedHalfW = 4 + 20 * (158 / 188);
        const leftX = bossX - expectedHalfW;
        const rightX = bossX + expectedHalfW;

        expect(beam.getHalfWidthAtY(baselineY)).toBeCloseTo(expectedHalfW, 4);
        expect(beam.containsPoint(leftX + 1e-6, baselineY)).toBe(true);
        expect(beam.containsPoint(rightX - 1e-6, baselineY)).toBe(true);
        expect(beam.containsPoint(leftX - EPS, baselineY)).toBe(false);
        expect(beam.containsPoint(rightX + EPS, baselineY)).toBe(false);
      });
    });

    describe('AABB Hitbox Extreme Edge Intersections', () => {
      it('evaluates AABB tangent to top boundary (box.y + box.height = topY)', () => {
        // Box exactly touching top from above: y = 80, height = 12 (boxBottom = 92)
        const tangentAboveBox = { x: bossX - 2, y: 80, width: 4, height: 12 };
        expect(beam.intersectsAABB(tangentAboveBox)).toBe(true);

        // Box 0.001px above top
        const detachedAboveBox = { x: bossX - 2, y: 80 - EPS, width: 4, height: 12 };
        expect(beam.intersectsAABB(detachedAboveBox)).toBe(false);
      });

      it('evaluates AABB tangent to bottom boundary (box.y = bottomY)', () => {
        const bottomY = 280;
        // Box exactly touching bottom from below: y = 280, height = 12
        const tangentBelowBox = { x: bossX - 2, y: bottomY, width: 4, height: 12 };
        expect(beam.intersectsAABB(tangentBelowBox)).toBe(true);

        // Box 0.001px below bottom
        const detachedBelowBox = { x: bossX - 2, y: bottomY + EPS, width: 4, height: 12 };
        expect(beam.intersectsAABB(detachedBelowBox)).toBe(false);
      });

      it('evaluates AABB horizontal boundary precision at player altitude', () => {
        const baselineY = 250;
        const boxH = 12;
        const boxW = 12;
        const boxY = baselineY - boxH / 2; // 244 to 256, midY = 250
        const halfWAtMid = beam.getHalfWidthAtY(250); // ~20.8085

        const beamLeftAtMid = bossX - halfWAtMid;
        const beamRightAtMid = bossX + halfWAtMid;

        // Box touching left edge from outside (box.x + box.width = beamLeftAtMid)
        const boxTouchingLeft = { x: beamLeftAtMid - boxW, y: boxY, width: boxW, height: boxH };
        expect(beam.intersectsAABB(boxTouchingLeft)).toBe(true);

        // Box detached by EPS on left
        const boxDetachedLeft = { x: beamLeftAtMid - boxW - EPS, y: boxY, width: boxW, height: boxH };
        expect(beam.intersectsAABB(boxDetachedLeft)).toBe(false);

        // Box touching right edge from outside (box.x = beamRightAtMid)
        const boxTouchingRight = { x: beamRightAtMid, y: boxY, width: boxW, height: boxH };
        expect(beam.intersectsAABB(boxTouchingRight)).toBe(true);

        // Box detached by EPS on right
        const boxDetachedRight = { x: beamRightAtMid + EPS, y: boxY, width: boxW, height: boxH };
        expect(beam.intersectsAABB(boxDetachedRight)).toBe(false);
      });

      it('correctly handles off-center Boss at screen edges (x = 24, x = 200)', () => {
        const leftBoss = new Enemy({ id: 10, type: EnemyType.BOSS, x: 24, y: 70 });
        const leftBeam = new TractorBeam();
        leftBeam.activate(leftBoss);
        leftBeam.update(0.6);

        expect(leftBeam.bossX).toBe(24);
        expect(leftBeam.topY).toBe(82);
        // Center is at 24
        expect(leftBeam.containsPoint(24, 200)).toBe(true);
        // Half-width at Y=200: span = (200-82)/(280-82) = 118/198 ~= 0.5959 -> 4 + 20*0.5959 ~= 15.92
        expect(leftBeam.containsPoint(24 + 15, 200)).toBe(true);
        expect(leftBeam.containsPoint(24 + 17, 200)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // 2. Dynamic Beam Expansion & Player Escape vs Trapping
  // ==========================================================================
  describe('Adversarial Dimension 2: Dynamic Expansion & Escape vs Trapping', () => {
    let game: Game;
    let boss: Enemy;

    beforeEach(() => {
      game = new Game();
      game.stage = 2;
      boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 80 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.active = true;
      game.getFormationManager().enemies.push(boss);
    });

    it('prohibits capture before the expanding beam reaches player baseline depth', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3); // (112, 250)

      game.tractorBeam.activate(boss);
      expect(game.tractorBeam.getState()).toBe('EMITTING');

      // At t = 0.2s: expand progress = 0.2 / 0.5 = 0.4
      // currentBottomY = 92 + 0.4 * 188 = 167.2px
      // Player hitbox top is 244px > 167.2px
      game.tractorBeam.update(0.2);
      expect(game.tractorBeam.currentBottomY).toBeCloseTo(167.2, 1);

      // Verify player is NOT captured
      const playerBox = player.getHitbox();
      expect(game.tractorBeam.intersectsAABB(playerBox)).toBe(false);
      expect(game.tractorBeam.containsPoint(player.x, player.y)).toBe(false);

      game.resolveCollisions();
      expect(player.state).toBe('normal');
      expect(game.tractorBeam.getState()).toBe('EMITTING');
    });

    it('allows player to steer out and escape cone during the 0.4s expansion window', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      game.tractorBeam.activate(boss);

      // Simulate 20 frames (1/60s each ~= 0.333s) with player holding LEFT
      const leftInput = {
        moveLeft: true,
        moveRight: false,
        fire: false,
        pause: false,
        restart: false,
        pointerActive: false,
        pointerX: null,
        touchLeft: false,
        touchRight: false,
        touchFire: false,
      };

      for (let i = 0; i < 20; i++) {
        player.update(1 / 60, leftInput);
        game.tractorBeam.update(1 / 60);
        game.resolveCollisions();
      }

      // Player moved left: 260px/s * (20/60)s = 86.67px -> x = 112 - 86.67 = 25.33px
      expect(player.x).toBeCloseTo(112 - (260 * 20) / 60, 1);
      expect(player.state).toBe('normal');

      // Now advance beam to full expansion (t = 0.6s)
      game.tractorBeam.update(0.3);
      expect(game.tractorBeam.getState()).toBe('HOLDING');
      expect(game.tractorBeam.currentBottomY).toBe(280);

      // At player baseline Y=250, beam reaches [91.2, 132.8]
      // Player is at X ~= 25.33, safely outside!
      game.resolveCollisions();
      expect(player.state).toBe('normal');
      expect(game.tractorBeam.getState()).toBe('HOLDING');
    });

    it('captures stationary player as soon as expanding beam reaches baseline', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      game.tractorBeam.activate(boss);

      // Advance beam in small steps of 0.05s
      let capturedAtStep = -1;
      for (let step = 1; step <= 10; step++) {
        game.tractorBeam.update(0.05);
        game.resolveCollisions();
        if (player.state === 'capturing') {
          capturedAtStep = step;
          break;
        }
      }

      // Expansion reaches player top (244px) at t = (244-92)/188 * 0.5 = 152/376 ~= 0.404s (step 9 at 0.45s)
      expect(capturedAtStep).toBeGreaterThanOrEqual(8);
      expect(capturedAtStep).toBeLessThanOrEqual(10);
      expect(player.state).toBe('capturing');
      expect(game.tractorBeam.getState()).toBe('CAPTURING');
    });

    it('does not capture player during RETRACTING phase if beam has already pulled up past player', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      game.tractorBeam.activate(boss);
      // Advance past expansion (0.5s) and hold (3.5s) into RETRACTING
      game.tractorBeam.update(0.5);
      game.tractorBeam.update(3.5);
      expect(game.tractorBeam.getState()).toBe('RETRACTING');

      // Retract for 0.15s (50% retracted -> extensionRatio = 0.5, bottomY = 186px)
      game.tractorBeam.update(0.15);
      expect(game.tractorBeam.currentBottomY).toBeCloseTo(186, 1);

      // Player at Y=250 is below the retracted beam (186px)
      expect(game.tractorBeam.containsPoint(player.x, player.y)).toBe(false);
      expect(game.tractorBeam.intersectsAABB(player.getHitbox())).toBe(false);

      game.resolveCollisions();
      expect(player.state).toBe('normal');
    });
  });

  // ==========================================================================
  // 3. Boss Galaga Destruction Timing
  // ==========================================================================
  describe('Adversarial Dimension 3: Boss Galaga Destruction Timing', () => {
    let game: Game;
    let boss: Enemy;

    beforeEach(() => {
      game = new Game();
      game.stage = 2;
      boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.active = true;
      boss.health = 1; // 1 HP left so single shot kills it
      game.getFormationManager().enemies.push(boss);
    });

    it('aborts capture if Boss is destroyed on the EXACT same frame player hits beam', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6); // Into HOLDING

      // Player bullet fired directly into Boss hitbox
      game.getBulletManager().firePlayerBullet(boss.x, boss.y, false);

      // In resolveCollisions, player bullet vs Boss runs BEFORE tractor beam vs player
      game.resolveCollisions();

      // Boss is destroyed
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);

      // Tractor beam was immediately collapsed
      expect(game.tractorBeam.isActive()).toBe(false);
      expect(game.tractorBeam.getState()).toBe('INACTIVE');

      // Player remains NORMAL and was NOT captured!
      expect(player.state).toBe('normal');
      expect(player.lives).toBe(3);
    });

    it('handles killing Boss mid-ascent (t = 1.0s into capture) gracefully without orphan escort', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6);

      // Trigger capture
      player.startCapture(boss.x, boss.y);
      game.tractorBeam.startCapture(player);
      expect(player.state).toBe('capturing');

      // Progress 1.0s into 2.5s capture ascension
      player.update(1.0);
      expect(player.state).toBe('capturing');
      expect(player.y).toBeLessThan(Player.BASELINE_Y);

      // A lingering bullet hits and destroys Boss mid-ascent
      game.getBulletManager().firePlayerBullet(boss.x, boss.y, false);
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(game.tractorBeam.isActive()).toBe(false);

      // Complete remaining 1.5s of capture animation
      player.update(1.5);
      expect(player.state).toBe('respawning');
      expect(player.lives).toBe(2);

      // Verify no orphan escort was attached to dead Boss
      expect(boss.hasCapturedFighter).toBe(false);
      expect(boss.capturedFighterEnemy).toBeNull();
      const capturedFighters = game
        .getFormationManager()
        .enemies.filter((e) => e.type === EnemyType.CAPTURED_FIGHTER && e.active);
      expect(capturedFighters.length).toBe(0);
    });

    it('handles killing Boss on the very last tick before capture completes (t = 2.49s)', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6);

      player.startCapture(boss.x, boss.y);
      game.tractorBeam.startCapture(player);

      // Advance 2.49s (almost complete)
      player.update(2.49);
      expect(player.state).toBe('capturing');

      // Kill Boss
      boss.takeDamage(1);
      game.tractorBeam.deactivate(true);

      // Advance last 0.02s
      player.update(0.02);
      expect(player.state).toBe('respawning');
      expect(boss.capturedFighterEnemy).toBeNull();
    });
  });

  // ==========================================================================
  // 4. Stress & State Transition Invariants
  // ==========================================================================
  describe('Adversarial Dimension 4: Stress & State Transition Invariants', () => {
    it('survives rapid activate/deactivate cycling without state corruption', () => {
      const beam = new TractorBeam();
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });

      for (let cycle = 0; cycle < 100; cycle++) {
        beam.activate(boss);
        expect(beam.isActive()).toBe(true);
        beam.update(0.01 * (cycle % 10));
        beam.deactivate(cycle % 2 === 0);
      }

      beam.reset();
      expect(beam.isActive()).toBe(false);
      expect(beam.getState()).toBe('INACTIVE');
    });

    it('enforces that Dual Fighter is completely immune to tractor beam capture', () => {
      const game = new Game();
      game.stage = 2;
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);
      player.isDual = true;

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      boss.active = true;
      game.getFormationManager().enemies.push(boss);

      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6);

      // Player is directly under beam in Dual mode
      expect(game.tractorBeam.containsPoint(player.x, player.y)).toBe(true);

      game.resolveCollisions();
      // Dual fighter must NOT be captured
      expect(player.isDual).toBe(true);
      expect(player.state).toBe('dual');
    });

    it('prevents multiple simultaneous tractor beams from different Boss Galagas', () => {
      const beam = new TractorBeam();
      const boss1 = new Enemy({ id: 1, type: EnemyType.BOSS, x: 80, y: 100 });
      const boss2 = new Enemy({ id: 2, type: EnemyType.BOSS, x: 140, y: 100 });

      expect(beam.activate(boss1)).toBe(true);
      expect(beam.activate(boss2)).toBe(false);
      expect(beam.getBoss()).toBe(boss1);

      beam.deactivate(true);
      expect(beam.activate(boss2)).toBe(true);
      expect(beam.getBoss()).toBe(boss2);
    });

    it('guarantees zero garbage collection heap spikes on spark particles pool', () => {
      const beam = new TractorBeam();
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      beam.activate(boss);

      const initialParticleCount = beam.particles.length;
      expect(initialParticleCount).toBe(16);

      // Run 600 frames (10 seconds)
      for (let f = 0; f < 600; f++) {
        beam.update(1 / 60);
      }

      // Particle pool size remains strictly fixed at 16 (zero allocations)
      expect(beam.particles.length).toBe(16);
    });
  });
});
