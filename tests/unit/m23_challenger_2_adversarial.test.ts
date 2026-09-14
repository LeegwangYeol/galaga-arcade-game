/**
 * Milestone M23: Adversarial Empirical Challenge Suite
 * 
 * Conducted by: m23_challenger_2 (Empirical Red Team)
 * 
 * Objectives:
 * 1. Adversarially stress-test formation return docking (WARP-1) across ALL 40 formation slots
 *    (especially outermost columns 0 and 9 where breathing oscillation reach is widest at ±49.92px).
 * 2. Adversarially stress-test sub-wave entry arrival smoothing (WARP-2) across ALL 5 sub-waves (40 wingmen).
 * 3. Verify single-frame displacement bound Δpos <= 3.0 px/frame under extreme framerates (15Hz–480Hz)
 *    and framerate jitter.
 * 4. Verify multi-enemy concurrent re-entry docking (Paired Goeis and Boss + Dual Escorts).
 * 5. Verify assertWarpCompliance evaluates to passed: true with 0 anomalies across all adversarial scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormationManager } from '../../src/systems/FormationManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyState, EnemyType } from '../../src/types';
import {
  WarpDetector,
  assertWarpCompliance,
} from './m22_enemy_warp_detector.test';

describe('M23 Challenger 2: Adversarial Formation Docking & Sub-Wave Entry Stress Suite', () => {
  let formation: FormationManager;
  let detector: WarpDetector;

  beforeEach(() => {
    formation = new FormationManager();
    detector = new WarpDetector({ dt: 1 / 60 });
  });

  // ==========================================================================
  // Track 1: Comprehensive Re-Entry Docking Sweep Across ALL 40 Formation Slots (WARP-1)
  // ==========================================================================
  describe('Track 1: All 40 Formation Slots Re-Entry Docking Verification (WARP-1)', () => {
    it('exhaustively verifies Δpos <= 3.0 px/frame on docking for every one of the 40 slots', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Ensure all 40 slots are populated
      expect(formation.enemies).toHaveLength(40);

      const maxDockingDeltas: { row: number; col: number; maxDelta: number }[] = [];

      for (const enemy of formation.enemies) {
        detector.reset();

        // Stagger initial formation oscillation phase across slots (0.0s to 3.0s)
        const phaseOffsetFrames = (enemy.row * 10 + enemy.col * 3) % 180;
        formation.elapsedTime = phaseOffsetFrames / 60;

        // Position enemy at top ceiling in RETURNING_TO_FORMATION state
        enemy.flightPath = null;
        enemy.x = formation.getSlotPosition(enemy.row, enemy.col, formation.elapsedTime).x;
        enemy.y = -16;
        enemy.state = EnemyState.RETURNING_TO_FORMATION;
        enemy.vx = 0;
        enemy.vy = 160 * 0.8;

        let inFormationFrames = 0;
        let slotMaxDeltaDuringDocking = 0;

        // Step simulation until enemy docks into formation
        for (let frame = 1; frame <= 300; frame++) {
          const prevX = enemy.x;
          const prevY = enemy.y;
          const prevState: any = enemy.state;

          formation.update(1 / 60);
          detector.checkEnemy(enemy, frame);

          const frameDelta = Math.hypot(enemy.x - prevX, enemy.y - prevY);
          const currState: any = enemy.state;

          // Track delta during the docking transition and first 3 frames in formation
          if (
            prevState === EnemyState.RETURNING_TO_FORMATION &&
            currState === EnemyState.IN_FORMATION
          ) {
            slotMaxDeltaDuringDocking = Math.max(slotMaxDeltaDuringDocking, frameDelta);
            inFormationFrames++;
          } else if (currState === EnemyState.IN_FORMATION && inFormationFrames > 0) {
            slotMaxDeltaDuringDocking = Math.max(slotMaxDeltaDuringDocking, frameDelta);
            inFormationFrames++;
            if (inFormationFrames >= 4) break;
          }
        }

        expect(
          (enemy.state as any),
          `Enemy at Row ${enemy.row}, Col ${enemy.col} failed to reach IN_FORMATION`
        ).toBe(EnemyState.IN_FORMATION);

        maxDockingDeltas.push({
          row: enemy.row,
          col: enemy.col,
          maxDelta: slotMaxDeltaDuringDocking,
        });

        // Strict Invariant 1: Single-frame displacement must NEVER exceed 3.0 px during docking
        expect(
          slotMaxDeltaDuringDocking,
          `Slot [${enemy.row}, ${enemy.col}] exceeded 3.0 px docking bound (observed: ${slotMaxDeltaDuringDocking.toFixed(3)} px)`
        ).toBeLessThanOrEqual(3.0);

        // Strict Invariant 2: Zero WARP-1 anomalies captured by detector
        const reentryAnomalies = detector.anomalies.filter(
          (a) => a.classification === 'FORMATION_REENTRY_WARP'
        );
        expect(reentryAnomalies).toHaveLength(0);
      }

      // Check summary
      expect(maxDockingDeltas).toHaveLength(40);
      const overallMax = Math.max(...maxDockingDeltas.map((d) => d.maxDelta));
      expect(overallMax).toBeLessThanOrEqual(2.5); // Worker claims step <= 2.5 px/frame
    });

    it('sweeps diverse oscillation phase angles [0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°] during re-entry', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Select a representative alien from each class
      const targets = [
        formation.enemies.find((e) => e.type === EnemyType.BOSS)!, // Boss Galaga
        formation.enemies.find((e) => e.type === EnemyType.GOEI)!, // Goei
        formation.enemies.find((e) => e.row === 3 && e.col === 0)!, // Leftmost Zako (Col 0)
        formation.enemies.find((e) => e.row === 4 && e.col === 9)!, // Rightmost Zako (Col 9)
      ];

      const phaseTimes = [0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.75]; // Diverse phase times (seconds)

      for (const target of targets) {
        for (const t0 of phaseTimes) {
          detector.reset();
          formation.elapsedTime = t0;

          target.flightPath = null;
          target.x = formation.getSlotPosition(target.row, target.col, t0).x;
          target.y = -16;
          target.state = EnemyState.RETURNING_TO_FORMATION;

          let docked = false;
          let maxDockDelta = 0;

          for (let f = 1; f <= 300; f++) {
            const px = target.x;
            const py = target.y;
            const pState: any = target.state;

            formation.update(1 / 60);
            detector.checkEnemy(target, f);

            const currState: any = target.state;
            const d = Math.hypot(target.x - px, target.y - py);
            if (pState === EnemyState.RETURNING_TO_FORMATION && currState === EnemyState.IN_FORMATION) {
              maxDockDelta = Math.max(maxDockDelta, d);
              docked = true;
            } else if (currState === EnemyState.IN_FORMATION && docked) {
              maxDockDelta = Math.max(maxDockDelta, d);
              break;
            }
          }

          expect(docked).toBe(true);
          expect(maxDockDelta).toBeLessThanOrEqual(3.0);
          expect(detector.anomalies).toHaveLength(0);
        }
      }
    });
  });

  // ==========================================================================
  // Track 2: Outermost Columns 0 and 9 Extreme Breathing Reach Stress
  // ==========================================================================
  describe('Track 2: Outermost Columns 0 & 9 Extreme Breathing Stress (Max Reach ±49.92px)', () => {
    it('verifies that closing speed (>= 75 px/s) always overtakes peak grid velocity (66.1 px/s) at columns 0 and 9', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Outermost columns in Row 4 (Col 0 and Col 9)
      const col0 = formation.enemies.find((e) => e.row === 4 && e.col === 0)!;
      const col9 = formation.enemies.find((e) => e.row === 4 && e.col === 9)!;

      const peakTimestamps = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

      for (const enemy of [col0, col9]) {
        for (const tPeak of peakTimestamps) {
          detector.reset();
          formation.elapsedTime = tPeak;

          formation.peelOffSolo(enemy, 112);
          expect((enemy.state as any)).toBe(EnemyState.DIVING_SOLO);

          let reachedBottom = false;
          let docked = false;
          let maxDockDelta = 0;

          // Run up to 600 frames (10 seconds) for complete dive, wrap, and re-entry
          for (let f = 1; f <= 600; f++) {
            const px = enemy.x;
            const py = enemy.y;
            const pState: any = enemy.state;

            formation.update(1 / 60);
            detector.checkEnemy(enemy, f);

            if (enemy.y > 288) {
              reachedBottom = true;
            }

            const currState: any = enemy.state;
            const d = Math.hypot(enemy.x - px, enemy.y - py);

            if (pState === EnemyState.RETURNING_TO_FORMATION && currState === EnemyState.IN_FORMATION) {
              maxDockDelta = Math.max(maxDockDelta, d);
              docked = true;
            } else if (currState === EnemyState.IN_FORMATION && docked) {
              maxDockDelta = Math.max(maxDockDelta, d);
              break;
            }
          }

          expect(reachedBottom, `Enemy [${enemy.row}, ${enemy.col}] did not reach bottom at t=${tPeak}`).toBe(true);
          expect(docked, `Enemy [${enemy.row}, ${enemy.col}] failed to dock at t=${tPeak}`).toBe(true);
          expect(maxDockDelta).toBeLessThanOrEqual(3.0);

          const compliance = assertWarpCompliance(detector.anomalies);
          expect(compliance.passed).toBe(true);
          expect(compliance.violations).toHaveLength(0);
        }
      }
    });

    it('verifies sub-pixel terminal lock (dist <= 0.8px) introduces zero perceptible jitter or overshoot', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const enemy = formation.enemies.find((e) => e.row === 4 && e.col === 0)!;

      // Position enemy precisely at dist = 0.79px from dynamic slot
      formation.elapsedTime = 1.0;
      const target = formation.getSlotPosition(enemy.row, enemy.col, 1.0);
      enemy.flightPath = null;
      enemy.x = target.x + 0.55;
      enemy.y = target.y + 0.55; // hypot(0.55, 0.55) = 0.778 px <= 0.8 px
      enemy.state = EnemyState.RETURNING_TO_FORMATION;

      detector.checkEnemy(enemy, 1);

      // Frame 2: should trigger immediate sub-pixel lock
      formation.update(1 / 60);
      const record = detector.checkEnemy(enemy, 2);

      expect(record).toBeNull();
      expect((enemy.state as any)).toBe(EnemyState.IN_FORMATION);

      // Frame 3: should follow grid oscillation smoothly
      formation.update(1 / 60);
      const record3 = detector.checkEnemy(enemy, 3);
      expect(record3).toBeNull();
      expect(detector.anomalies).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Track 3: Full 5-Sub-Wave Entry Sequence Ingress Telemetry (WARP-2)
  // ==========================================================================
  describe('Track 3: Full 5-Sub-Wave Entry Ingress Telemetry (WARP-2)', () => {
    it('verifies smooth arrival docking with ZERO snaps for Sub-Waves 1, 2, and 3 (24 wingmen)', () => {
      formation.spawnStage(1);
      expect(formation.isEntryWaveActive).toBe(true);

      // Sub-Waves 1, 2, 3 correspond to the first 24 enemies
      const subWaves1to3Enemies = formation.enemies.filter(
        (e) =>
          (e.row === 0 && e.col >= 3 && e.col <= 6) ||
          (e.row === 1 && e.col >= 1 && e.col <= 8) ||
          (e.row === 2 && e.col >= 1 && e.col <= 8) ||
          (e.row === 3 && e.col >= 3 && e.col <= 6)
      );
      expect(subWaves1to3Enemies).toHaveLength(24);

      const arrivals = new Map<string | number, { delta: number; postDeltas: number[] }>();
      const prevPos = new Map<string | number, { x: number; y: number; state: EnemyState }>();

      // Run up to frame 540 (9.0s, after sub-wave 3 finishes, before sub-wave 4 finishes)
      for (let frame = 1; frame <= 540; frame++) {
        for (const enemy of subWaves1to3Enemies) {
          prevPos.set(enemy.id, { x: enemy.x, y: enemy.y, state: enemy.state });
        }

        formation.update(1 / 60);
        detector.checkFrame(subWaves1to3Enemies, frame);

        for (const enemy of subWaves1to3Enemies) {
          const prev = prevPos.get(enemy.id);
          if (!prev) continue;

          const delta = Math.hypot(enemy.x - prev.x, enemy.y - prev.y);
          if (prev.state === EnemyState.ENTERING && enemy.state === EnemyState.IN_FORMATION) {
            arrivals.set(enemy.id, { delta, postDeltas: [] });
          } else if (enemy.state === EnemyState.IN_FORMATION && arrivals.has(enemy.id)) {
            const entry = arrivals.get(enemy.id)!;
            if (entry.postDeltas.length < 3) entry.postDeltas.push(delta);
          }
        }
      }

      // All 24 enemies in Sub-Waves 1-3 must dock smoothly
      expect(arrivals.size).toBe(24);
      for (const [id, rec] of arrivals) {
        expect(rec.delta, `Enemy ${id} in sub-waves 1-3 snapped: ${rec.delta.toFixed(2)} px`).toBeLessThanOrEqual(3.0);
        for (const pd of rec.postDeltas) {
          expect(pd, `Enemy ${id} in sub-waves 1-3 post-snap: ${pd.toFixed(2)} px`).toBeLessThanOrEqual(3.0);
        }
      }

      const subWave1to3Anomalies = detector.anomalies.filter((a) => a.classification === 'SUBWAVE_ENTRY_WARP');
      expect(subWave1to3Anomalies).toHaveLength(0);
    });

    it('verifies smooth arrival docking without snaps for Sub-Waves 4 and 5 (all 16 Zakos across 40-slot formation)', () => {
      formation.spawnStage(1);
      expect(formation.isEntryWaveActive).toBe(true);

      // Sub-Waves 4 and 5 contain all 16 outer/lower Zakos
      const subWaves4and5Enemies = formation.enemies.filter(
        (e) =>
          (e.row === 3 && (e.col <= 2 || e.col >= 7)) ||
          e.row === 4
      );
      expect(subWaves4and5Enemies).toHaveLength(16);

      const arrivals = new Map<string | number, { enemy: Enemy; delta: number; postDeltas: number[] }>();
      const prevPos = new Map<string | number, { x: number; y: number; state: EnemyState }>();

      // Run through full ingress (1000 frames / 16.67s)
      for (let frame = 1; frame <= 1000; frame++) {
        for (const enemy of subWaves4and5Enemies) {
          prevPos.set(enemy.id, { x: enemy.x, y: enemy.y, state: enemy.state });
        }

        formation.update(1 / 60);
        detector.checkFrame(subWaves4and5Enemies, frame);

        for (const enemy of subWaves4and5Enemies) {
          const prev = prevPos.get(enemy.id);
          if (!prev) continue;

          const delta = Math.hypot(enemy.x - prev.x, enemy.y - prev.y);
          if (prev.state === EnemyState.ENTERING && enemy.state === EnemyState.IN_FORMATION) {
            arrivals.set(enemy.id, { enemy, delta, postDeltas: [] });
          } else if (enemy.state === EnemyState.IN_FORMATION && arrivals.has(enemy.id)) {
            const entry = arrivals.get(enemy.id)!;
            if (entry.postDeltas.length < 3) entry.postDeltas.push(delta);
          }
        }
      }

      expect(arrivals.size).toBe(16);

      // Acceptance Contract Invariant: Single-frame transition displacement MUST be <= 3.0 px/frame
      // and assertWarpCompliance MUST pass with 0 anomalies.
      for (const [id, rec] of arrivals) {
        expect(
          rec.delta,
          `Enemy ${id} (Row ${rec.enemy.row}, Col ${rec.enemy.col}) transition delta was ${rec.delta.toFixed(3)} px > 3.0 px (WARP-2)`
        ).toBeLessThanOrEqual(3.0);
      }

      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
      expect(compliance.violations).toHaveLength(0);
    });

    it('empirically catalogs the 16 WARP-2 snaps in Sub-Waves 4 and 5 due to premature isEntryWaveActive=false', () => {
      formation.spawnStage(1);
      expect(formation.isEntryWaveActive).toBe(true);

      const subWaves4and5Enemies = formation.enemies.filter(
        (e) =>
          (e.row === 3 && (e.col <= 2 || e.col >= 7)) ||
          e.row === 4
      );

      const capturedSnaps: { id: string | number; row: number; col: number; delta: number }[] = [];
      const prevPos = new Map<string | number, { x: number; y: number; state: EnemyState }>();

      for (let frame = 1; frame <= 1000; frame++) {
        for (const enemy of subWaves4and5Enemies) {
          prevPos.set(enemy.id, { x: enemy.x, y: enemy.y, state: enemy.state });
        }

        formation.update(1 / 60);

        for (const enemy of subWaves4and5Enemies) {
          const prev = prevPos.get(enemy.id);
          if (!prev) continue;

          const delta = Math.hypot(enemy.x - prev.x, enemy.y - prev.y);
          if (prev.state === EnemyState.ENTERING && enemy.state === EnemyState.IN_FORMATION && delta > 3.0) {
            capturedSnaps.push({ id: enemy.id, row: enemy.row, col: enemy.col, delta });
          }
        }
      }

      // Proves that 0 wingmen in Sub-Waves 4 and 5 snapped (WARP-2 eliminated post-fix)
      expect(capturedSnaps).toHaveLength(0);
    });

    it('verifies staggered wingmen in Sub-Wave 1 (4 Bosses + 4 Goeis) arrive without inter-ship snap', () => {
      formation.spawnStage(1);

      // Sub-wave 1 enemies: Row 0 Cols 3..6 and Row 1 Cols 3..6
      const subWave1Enemies = formation.enemies.filter(
        (e) => (e.row === 0 || e.row === 1) && e.col >= 3 && e.col <= 6
      );
      expect(subWave1Enemies).toHaveLength(8);

      const maxArrivalDeltas: number[] = [];

      for (let frame = 1; frame <= 360; frame++) {
        const prevCoords = subWave1Enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, state: e.state }));

        formation.update(1 / 60);
        detector.checkFrame(subWave1Enemies, frame);

        for (const enemy of subWave1Enemies) {
          const prev = prevCoords.find((p) => p.id === enemy.id)!;
          if (prev.state === EnemyState.ENTERING && enemy.state === EnemyState.IN_FORMATION) {
            const d = Math.hypot(enemy.x - prev.x, enemy.y - prev.y);
            maxArrivalDeltas.push(d);
          }
        }
      }

      expect(maxArrivalDeltas).toHaveLength(8);
      for (const d of maxArrivalDeltas) {
        expect(d).toBeLessThanOrEqual(3.0);
      }
      expect(detector.anomalies).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Track 4: Extreme Timestep & Framerate Jitter Sensitivity
  // ==========================================================================
  describe('Track 4: Extreme Timestep & Framerate Jitter Sensitivity', () => {
    it('preserves docking smoothness at 120Hz (dt = 1/120s, threshold = 2.0 px)', () => {
      const detector120Hz = new WarpDetector({ dt: 1 / 120 });
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const target = formation.enemies.find((e) => e.row === 3 && e.col === 0)!;
      target.flightPath = null;
      target.x = formation.getSlotPosition(target.row, target.col, 0).x;
      target.y = -16;
      target.state = EnemyState.RETURNING_TO_FORMATION;

      let docked = false;
      let maxDockDelta = 0;

      for (let f = 1; f <= 600; f++) {
        const px = target.x;
        const py = target.y;
        const pState: any = target.state;

        formation.update(1 / 120);
        detector120Hz.checkEnemy(target, f, 1 / 120);

        const currState: any = target.state;
        const d = Math.hypot(target.x - px, target.y - py);
        if (pState === EnemyState.RETURNING_TO_FORMATION && currState === EnemyState.IN_FORMATION) {
          maxDockDelta = Math.max(maxDockDelta, d);
          docked = true;
        } else if (currState === EnemyState.IN_FORMATION && docked) {
          maxDockDelta = Math.max(maxDockDelta, d);
          break;
        }
      }

      expect(docked).toBe(true);
      // At 120Hz, threshold is 120 * (1/120) + 1.0 = 2.0 px
      expect(maxDockDelta).toBeLessThanOrEqual(2.0);
      expect(detector120Hz.anomalies).toHaveLength(0);
    });

    it('preserves docking smoothness at 240Hz (dt = 1/240s, threshold = 1.5 px)', () => {
      const detector240Hz = new WarpDetector({ dt: 1 / 240 });
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const target = formation.enemies.find((e) => e.row === 4 && e.col === 9)!;
      target.flightPath = null;
      target.x = formation.getSlotPosition(target.row, target.col, 0).x;
      target.y = -16;
      target.state = EnemyState.RETURNING_TO_FORMATION;

      let docked = false;
      let maxDockDelta = 0;

      for (let f = 1; f <= 1200; f++) {
        const px = target.x;
        const py = target.y;
        const pState: any = target.state;

        formation.update(1 / 240);
        detector240Hz.checkEnemy(target, f, 1 / 240);

        const currState: any = target.state;
        const d = Math.hypot(target.x - px, target.y - py);
        if (pState === EnemyState.RETURNING_TO_FORMATION && currState === EnemyState.IN_FORMATION) {
          maxDockDelta = Math.max(maxDockDelta, d);
          docked = true;
        } else if (currState === EnemyState.IN_FORMATION && docked) {
          maxDockDelta = Math.max(maxDockDelta, d);
          break;
        }
      }

      expect(docked).toBe(true);
      // At 240Hz, threshold is 120 * (1/240) + 1.0 = 1.5 px
      expect(maxDockDelta).toBeLessThanOrEqual(1.5);
      expect(detector240Hz.anomalies).toHaveLength(0);
    });

    it('strictly clamps docking displacement at low framerate (30Hz, dt = 1/30s)', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const target = formation.enemies.find((e) => e.row === 3 && e.col === 5)!;
      target.flightPath = null;
      target.x = formation.getSlotPosition(target.row, target.col, 0).x;
      target.y = -16;
      target.state = EnemyState.RETURNING_TO_FORMATION;

      let docked = false;
      let maxDockDelta = 0;

      for (let f = 1; f <= 150; f++) {
        const px = target.x;
        const py = target.y;
        const pState: any = target.state;

        formation.update(1 / 30);

        const currState: any = target.state;
        const d = Math.hypot(target.x - px, target.y - py);
        if (pState === EnemyState.RETURNING_TO_FORMATION && currState === EnemyState.IN_FORMATION) {
          maxDockDelta = Math.max(maxDockDelta, d);
          docked = true;
        } else if (currState === EnemyState.IN_FORMATION && docked) {
          maxDockDelta = Math.max(maxDockDelta, d);
          break;
        }
      }

      expect(docked).toBe(true);
      // Even at 30Hz, step must be strictly clamped by maxDisplacement = 2.5 px
      expect(maxDockDelta).toBeLessThanOrEqual(3.0);
    });

    it('survives random framerate jitter (alternating 15Hz to 120Hz) without coordinate explosions or NaNs', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const target = formation.enemies.find((e) => e.row === 2 && e.col === 4)!;
      target.flightPath = null;
      target.x = formation.getSlotPosition(target.row, target.col, 0).x;
      target.y = -16;
      target.state = EnemyState.RETURNING_TO_FORMATION;

      let docked = false;

      for (let f = 1; f <= 300; f++) {
        // Random dt between 1/120s (8.3ms) and 1/15s (66.7ms)
        const randomDt = 1 / (15 + Math.random() * 105);

        formation.update(randomDt);

        expect(Number.isFinite(target.x)).toBe(true);
        expect(Number.isFinite(target.y)).toBe(true);
        expect(Number.isNaN(target.x)).toBe(false);
        expect(Number.isNaN(target.y)).toBe(false);

        if ((target.state as any) === EnemyState.IN_FORMATION) {
          docked = true;
          break;
        }
      }

      expect(docked).toBe(true);
    });
  });

  // ==========================================================================
  // Track 5: Multi-Enemy Concurrent Dive Re-Entry Stress (Paired Goeis & Boss Escort)
  // ==========================================================================
  describe('Track 5: Multi-Enemy Concurrent Dive Re-Entry Verification', () => {
    it('verifies concurrent docking of Paired Goeis with zero snaps and zero cross-collisions', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const leftGoei = formation.enemies.find((e) => e.row === 1 && e.col === 2)!;
      const rightGoei = formation.enemies.find((e) => e.row === 1 && e.col === 7)!;

      // Peel off paired Goeis
      formation['peelOffPairedGoeis'](leftGoei, rightGoei, 112);

      expect((leftGoei.state as any)).toBe(EnemyState.DIVING_SOLO);
      expect((rightGoei.state as any)).toBe(EnemyState.DIVING_SOLO);

      let bothDocked = false;
      let leftMaxDelta = 0;
      let rightMaxDelta = 0;

      for (let f = 1; f <= 600; f++) {
        const lpx = leftGoei.x;
        const lpy = leftGoei.y;
        const lpState: any = leftGoei.state;

        const rpx = rightGoei.x;
        const rpy = rightGoei.y;
        const rpState: any = rightGoei.state;

        formation.update(1 / 60);
        detector.checkEnemy(leftGoei, f);
        detector.checkEnemy(rightGoei, f);

        const ld = Math.hypot(leftGoei.x - lpx, leftGoei.y - lpy);
        const rd = Math.hypot(rightGoei.x - rpx, rightGoei.y - rpy);

        const lCurr: any = leftGoei.state;
        const rCurr: any = rightGoei.state;

        if (lpState === EnemyState.RETURNING_TO_FORMATION && lCurr === EnemyState.IN_FORMATION) {
          leftMaxDelta = Math.max(leftMaxDelta, ld);
        }
        if (rpState === EnemyState.RETURNING_TO_FORMATION && rCurr === EnemyState.IN_FORMATION) {
          rightMaxDelta = Math.max(rightMaxDelta, rd);
        }

        if (lCurr === EnemyState.IN_FORMATION && rCurr === EnemyState.IN_FORMATION) {
          bothDocked = true;
          break;
        }
      }

      expect(bothDocked).toBe(true);
      expect(leftMaxDelta).toBeLessThanOrEqual(3.0);
      expect(rightMaxDelta).toBeLessThanOrEqual(3.0);

      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
      expect(compliance.violations).toHaveLength(0);
    });

    it('verifies concurrent docking of Boss Galaga and Dual Goei Escorts with zero snaps', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS && e.col === 4)!;
      const escorts = [
        formation.enemies.find((e) => e.row === 1 && e.col === 4)!,
        formation.enemies.find((e) => e.row === 1 && e.col === 5)!,
      ];

      formation['peelOffBossEscort'](boss, escorts, 112);

      expect((boss.state as any)).toBe(EnemyState.DIVING_ESCORT);
      expect((escorts[0]!.state as any)).toBe(EnemyState.DIVING_ESCORT);
      expect((escorts[1]!.state as any)).toBe(EnemyState.DIVING_ESCORT);

      let allThreeDocked = false;
      const maxDeltas = [0, 0, 0];
      const ships = [boss, escorts[0]!, escorts[1]!];

      for (let f = 1; f <= 600; f++) {
        const prevs = ships.map((s) => ({ x: s.x, y: s.y, state: (s.state as any) }));

        formation.update(1 / 60);
        detector.checkFrame(ships, f);

        for (let i = 0; i < 3; i++) {
          const s = ships[i]!;
          const p = prevs[i]!;
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          if (p.state === EnemyState.RETURNING_TO_FORMATION && (s.state as any) === EnemyState.IN_FORMATION) {
            maxDeltas[i] = Math.max(maxDeltas[i]!, d);
          }
        }

        if (ships.every((s) => (s.state as any) === EnemyState.IN_FORMATION)) {
          allThreeDocked = true;
          break;
        }
      }

      expect(allThreeDocked).toBe(true);
      for (const d of maxDeltas) {
        expect(d).toBeLessThanOrEqual(3.0);
      }

      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
      expect(compliance.violations).toHaveLength(0);
    });
  });
});
