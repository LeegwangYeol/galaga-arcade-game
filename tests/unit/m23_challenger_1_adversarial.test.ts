/**
 * Milestone M23: Adversarial Challenger 1 Test Suite
 * 
 * Focus:
 * 1. WARP-3: Boss Galaga Tractor Dive Halt at y ≈ 100 across player coordinates (x = 10, 112, 214, edge cases)
 * 2. WARP-4: Kinetic Inversion Anti-Gravity Stalls & Mid-Air Continuation across framerate sweeps (15Hz–480Hz)
 * 3. Empirical Bug Discovery: Boss dive resumption after beam retract intercepted by [95, 105] altitude trap
 * 4. Combinatorial saturation fuzz across random framerates, altitudes, and player positions
 * 5. Strict assertWarpCompliance verification (0 unphysical coordinate jumps)
 */

import { describe, it, expect } from 'vitest';
import { FormationManager } from '../../src/systems/FormationManager';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { FlightPathManager } from '../../src/systems/FlightPathManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyState, EnemyType } from '../../src/types';
import { WarpDetector, assertWarpCompliance } from './m22_enemy_warp_detector.test';

describe('Milestone M23: Adversarial Challenger 1 Stress Suite', () => {
  // ==========================================================================
  // Section 1: Adversarial WARP-3 Stress Testing (Boss Galaga Tractor Dive)
  // ==========================================================================
  describe('Section 1: WARP-3 Boss Tractor Dive Invariant across Player Coordinates', () => {
    const playerXPositions = [10, 112, 214];

    playerXPositions.forEach((playerX) => {
      it(`verifies Boss tractor dive halts smoothly at y ≈ 100 with 0 ceiling wrap for playerX = ${playerX} (60Hz)`, () => {
        const formation = new FormationManager();
        const detector = new WarpDetector({ dt: 1 / 60 });

        formation.spawnStage(2);
        formation.isEntryWaveActive = false;
        formation.update(1 / 60); // Initialize formation slots

        // Select Boss Galaga (Row 0, Col 3 or Col 4)
        const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
        expect(boss).toBeDefined();

        let tractorBeamRequested = false;
        formation.onTractorBeamRequest = (reqBoss) => {
          if (reqBoss.id === boss.id) {
            tractorBeamRequested = true;
          }
        };

        formation.launchTractorBeamDive(boss, playerX);
        expect(boss.state).toBe(EnemyState.DIVING_SOLO);
        expect(boss.flightPath).not.toBeNull();

        // Simulate 75 frames (1.25s) — path duration is 1000ms (60 frames)
        for (let frame = 1; frame <= 75; frame++) {
          formation.update(1 / 60, playerX, 250);
          detector.checkEnemy(boss, frame, 1 / 60);

          // Invariant: Boss must never jump to ceiling (-16) while diving
          expect(boss.y).toBeGreaterThanOrEqual(0);
        }

        // Post-dive assertions
        expect(tractorBeamRequested).toBe(true);
        expect(boss.state).toBe(EnemyState.TRACTOR_BEAM_ACTIVE);
        expect(boss.y).toBeGreaterThanOrEqual(95);
        expect(boss.y).toBeLessThanOrEqual(105);
        expect(boss.vx).toBe(0);
        expect(boss.vy).toBe(0);
        expect(boss.rotation).toBe(0);

        // Verification of zero warp anomalies
        const tractorWarps = detector.anomalies.filter((a) => a.classification === 'TRACTOR_DIVE_WARP');
        expect(tractorWarps).toHaveLength(0);
        expect(detector.anomalies).toHaveLength(0);

        const compliance = assertWarpCompliance(detector.anomalies);
        expect(compliance.passed).toBe(true);
        expect(compliance.violations).toHaveLength(0);
      });
    });

    it('adversarially stress-tests extreme off-screen and boundary player coordinates (x = -100, 0, 224, 350)', () => {
      const extremeCoordinates = [-100, 0, 224, 350];

      for (const px of extremeCoordinates) {
        const formation = new FormationManager();
        const detector = new WarpDetector({ dt: 1 / 60 });
        formation.spawnStage(2);
        formation.isEntryWaveActive = false;
        formation.update(1 / 60);

        // Test both Bosses (Col 3 and Col 4)
        const bosses = formation.enemies.filter((e) => e.type === EnemyType.BOSS);
        expect(bosses.length).toBeGreaterThanOrEqual(2);

        for (const boss of bosses) {
          detector.reset();
          formation.launchTractorBeamDive(boss, px);

          for (let frame = 1; frame <= 70; frame++) {
            formation.update(1 / 60, px, 250);
            detector.checkEnemy(boss, frame, 1 / 60);
          }

          expect(boss.state).toBe(EnemyState.TRACTOR_BEAM_ACTIVE);
          expect(boss.y).toBeGreaterThanOrEqual(95);
          expect(boss.y).toBeLessThanOrEqual(105);
          expect(boss.x).toBeGreaterThanOrEqual(48);
          expect(boss.x).toBeLessThanOrEqual(176);

          expect(detector.anomalies).toHaveLength(0);
          const compliance = assertWarpCompliance(detector.anomalies);
          expect(compliance.passed).toBe(true);
        }
      }
    });

    it('empirically reveals Boss dive resumption intercept bug: FormationManager re-captures Boss into duplicate beam at y ∈ [95, 105]', () => {
      const formation = new FormationManager();
      const tractorBeam = new TractorBeam();
      const detector = new WarpDetector({ dt: 1 / 60 });

      formation.spawnStage(2);
      formation.isEntryWaveActive = false;
      formation.update(1 / 60);

      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;

      let tractorBeamRequestCount = 0;
      formation.onTractorBeamRequest = (reqBoss) => {
        tractorBeamRequestCount++;
        tractorBeam.activate(reqBoss);
      };

      formation.launchTractorBeamDive(boss, 112);

      let reachedBottomWrap = false;
      let reenteredFormation = false;

      // Simulate 800 frames (13.3 seconds) to observe full lifecycle including the duplicate trigger delay
      for (let frame = 1; frame <= 800; frame++) {
        formation.update(1 / 60, 112, 250);
        tractorBeam.update(1 / 60);
        detector.checkEnemy(boss, frame, 1 / 60);

        if (boss.state === EnemyState.RETURNING_TO_FORMATION) {
          reachedBottomWrap = true;
        }
        if (reachedBottomWrap && boss.state === EnemyState.IN_FORMATION) {
          reenteredFormation = true;
          break;
        }
      }

      // Post-fix Invariant: Exactly 1 tractor beam request is fired without re-interception loop
      expect(tractorBeamRequestCount).toBe(1);

      // Eventually, after the second beam, the Boss manages to step past 105 and wrap at bottom
      expect(reachedBottomWrap).toBe(true);
      expect(reenteredFormation).toBe(true);
      expect(boss.state).toBe(EnemyState.IN_FORMATION);

      // Verify zero unphysical coordinate jumps throughout the entire multi-phase cycle
      expect(detector.anomalies).toHaveLength(0);
      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
    });
  });

  // ==========================================================================
  // Section 2: Adversarial WARP-4 Stress Testing (Kinetic Inversion Anti-Gravity Stalls)
  // ==========================================================================
  describe('Section 2: WARP-4 Kinetic Inversion Anti-Gravity Stalls across Framerates', () => {
    const framerates = [15, 30, 60, 90, 120, 240, 480];

    framerates.forEach((fps) => {
      it(`verifies kinetic inversion stall continues ballistically downward without warp at ${fps}Hz`, () => {
        const dt = 1 / fps;
        const formation = new FormationManager();
        // At 15Hz (66.7ms timestep), peak curve speed (~490 px/s) requires maxVelocity 500
        const detector = new WarpDetector({
          dt,
          maxVelocity: fps <= 20 ? 520 : 480,
          toleranceMargin: 4.0,
        });

        formation.spawnStage(1);
        formation.isEntryWaveActive = false;

        // Pre-warm formation grid for 60 frames equivalent
        const warmupFrames = Math.round(1.0 / dt);
        for (let i = 0; i < warmupFrames; i++) {
          formation.update(dt);
        }

        const enemy = formation.enemies.find((e) => e.row === 1 && e.col === 4)!;
        expect(enemy).toBeDefined();

        formation.peelOffSolo(enemy, 112);
        enemy.isGlitched = true;

        let inversionTriggered = false;
        let reachedBallisticContinuation = false;

        // Run simulation for up to 4.0 seconds
        const totalFrames = Math.round(4.0 / dt);
        for (let frame = 1; frame <= totalFrames; frame++) {
          if (enemy.y >= 100 && !enemy.isKineticInverted && enemy.flightPath && !inversionTriggered) {
            enemy.triggerKineticInversion();
            inversionTriggered = true;
          }

          formation.update(dt);
          detector.checkEnemy(enemy, frame, dt);

          if (inversionTriggered && enemy.flightPath === null && enemy.y > 0 && enemy.y < 288) {
            reachedBallisticContinuation = true;
            // Downward velocity must be sustained
            expect(enemy.vy).toBeGreaterThanOrEqual(enemy.diveSpeed * 0.7);
          }

          if (enemy.state === EnemyState.RETURNING_TO_FORMATION) {
            break;
          }
        }

        expect(inversionTriggered).toBe(true);
        expect(reachedBallisticContinuation).toBe(true);

        // Assert zero WARP-4 anomalies
        const inversionWarps = detector.anomalies.filter(
          (a) => a.classification === 'KINEMATIC_INVERSION_WARP' || (a.prevPos.y >= 50 && a.currPos.y <= 0)
        );
        expect(inversionWarps).toHaveLength(0);
        expect(detector.anomalies).toHaveLength(0);

        const compliance = assertWarpCompliance(detector.anomalies);
        expect(compliance.passed).toBe(true);
      });
    });

    it('verifies kinetic inversion trigger altitude variations (y = 60, 90, 120, 160, 200) all decelerate and continue smoothly', () => {
      const altitudes = [60, 90, 120, 160, 200];

      for (const alt of altitudes) {
        const formation = new FormationManager();
        const detector = new WarpDetector({ dt: 1 / 60 });

        formation.spawnStage(1);
        formation.isEntryWaveActive = false;
        for (let i = 0; i < 60; i++) formation.update(1 / 60);

        const enemy = formation.enemies.find((e) => e.row === 2 && e.col === 5)!;
        formation.peelOffSolo(enemy, 112);
        enemy.isGlitched = true;

        let triggered = false;
        for (let frame = 1; frame <= 180; frame++) {
          if (enemy.y >= alt && !enemy.isKineticInverted && enemy.flightPath && !triggered) {
            enemy.triggerKineticInversion();
            triggered = true;
          }
          formation.update(1 / 60);
          detector.checkEnemy(enemy, frame, 1 / 60);
        }

        expect(triggered).toBe(true);
        expect(detector.anomalies).toHaveLength(0);
        const compliance = assertWarpCompliance(detector.anomalies);
        expect(compliance.passed).toBe(true);
      }
    });

    it('verifies extreme anti-gravity ceiling guard: ascents past y < -20 wrap cleanly off-screen without glitch', () => {
      const enemy = new Enemy({ id: 999, type: EnemyType.GOEI, x: 100, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;
      enemy.isGlitched = true;

      // In real gameplay, an enemy diving has a flightPath:
      enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 100, y: 50 }, 112, true);

      const detector = new WarpDetector({ dt: 1 / 60 });

      // Trigger inversion and apply upward velocity
      enemy.triggerKineticInversion();
      enemy.glitchKinematicVy = -450; // Strong upward speed

      // Update until ceiling guard triggers at y < -20
      let guardTriggered = false;
      for (let frame = 1; frame <= 60; frame++) {
        enemy.update(1 / 60);
        detector.checkEnemy(enemy, frame, 1 / 60);

        if ((enemy.state as any) === EnemyState.RETURNING_TO_FORMATION) {
          guardTriggered = true;
          break;
        }
      }

      // Verify clean transition to RETURNING_TO_FORMATION at -BASE_HEIGHT
      expect(guardTriggered).toBe(true);
      expect(enemy.state).toBe(EnemyState.RETURNING_TO_FORMATION);
      expect(enemy.y).toBe(-Enemy.BASE_HEIGHT);
      expect(enemy.vy).toBeGreaterThan(0);
      expect(detector.anomalies).toEqual([]);
    });
  });

  // ==========================================================================
  // Section 3: Variable Framerate Sweeps for Boss Tractor Dive (15Hz–480Hz)
  // ==========================================================================
  describe('Section 3: Boss Tractor Dive Variable Framerate Sweeps (15Hz–480Hz)', () => {
    const sweepFrequencies = [15, 20, 30, 45, 60, 75, 90, 120, 144, 240, 480];

    sweepFrequencies.forEach((fps) => {
      it(`verifies Boss tractor dive halts at y ≈ 100 with zero ceiling wrap at ${fps}Hz`, () => {
        const dt = 1 / fps;
        const formation = new FormationManager();
        const detector = new WarpDetector({ dt, maxVelocity: 480, toleranceMargin: 4.0 });

        formation.spawnStage(2);
        formation.isEntryWaveActive = false;
        formation.update(dt);

        const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
        formation.launchTractorBeamDive(boss, 112);

        // Path duration is 1.0s. Simulate for 1.3s to ensure path completion
        const frames = Math.round(1.3 / dt);
        for (let frame = 1; frame <= frames; frame++) {
          formation.update(dt, 112, 250);
          detector.checkEnemy(boss, frame, dt);
        }

        expect(boss.state).toBe(EnemyState.TRACTOR_BEAM_ACTIVE);
        expect(boss.y).toBeGreaterThanOrEqual(95);
        expect(boss.y).toBeLessThanOrEqual(105);

        // Assert 0 anomalies at this framerate
        expect(detector.anomalies).toHaveLength(0);
        const compliance = assertWarpCompliance(detector.anomalies);
        expect(compliance.passed).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Section 4: Combinatorial Saturation & Fuzzing
  // ==========================================================================
  describe('Section 4: Combinatorial Saturation & Random Framerate Fuzzing', () => {
    it('executes 30 randomized trials of mixed Boss tractor dives and kinetic inversions across arbitrary framerates', () => {
      const randomFpsList = [17, 24, 33, 50, 59.94, 60, 72, 85, 100, 120, 165, 200, 240, 360, 480];

      for (let trial = 0; trial < 30; trial++) {
        const fps = randomFpsList[trial % randomFpsList.length]!;
        const dt = 1 / fps;
        const playerX = 10 + Math.random() * 204; // [10, 214]

        const formation = new FormationManager();
        const detector = new WarpDetector({
          dt,
          maxVelocity: fps <= 20 ? 520 : 480,
          toleranceMargin: 4.0,
        });

        formation.spawnStage(2);
        formation.isEntryWaveActive = false;
        formation.update(dt);

        // Launch both a Boss tractor dive and a kinetic inversion dive simultaneously
        const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
        const zako = formation.enemies.find((e) => e.type === EnemyType.ZAKO)!;

        formation.launchTractorBeamDive(boss, playerX);
        formation.peelOffSolo(zako, playerX);
        zako.isGlitched = true;

        const steps = Math.round(2.0 / dt);
        for (let frame = 1; frame <= steps; frame++) {
          if (zako.y >= 110 && !zako.isKineticInverted && zako.flightPath) {
            zako.triggerKineticInversion();
          }

          formation.update(dt, playerX, 250);
          detector.checkEnemy(boss, frame, dt);
          detector.checkEnemy(zako, frame, dt);
        }

        // Neither enemy should produce unphysical coordinate jumps
        expect(detector.anomalies).toHaveLength(0);
        const compliance = assertWarpCompliance(detector.anomalies);
        expect(compliance.passed).toBe(true);
        expect(compliance.violations).toHaveLength(0);
      }
    });

    it('verifies zero NaN or infinite coordinates across all tracked kinematic vectors', () => {
      const formation = new FormationManager();
      formation.spawnStage(2);
      formation.isEntryWaveActive = false;
      formation.update(1 / 60);

      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      formation.launchTractorBeamDive(boss, 112);

      for (let i = 0; i < 120; i++) {
        formation.update(1 / 60);

        for (const enemy of formation.enemies) {
          if (enemy.active) {
            expect(Number.isFinite(enemy.x)).toBe(true);
            expect(Number.isFinite(enemy.y)).toBe(true);
            expect(Number.isFinite(enemy.vx)).toBe(true);
            expect(Number.isFinite(enemy.vy)).toBe(true);
            expect(Number.isFinite(enemy.rotation)).toBe(true);
          }
        }
      }
    });
  });
});
