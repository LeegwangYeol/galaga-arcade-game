/**
 * Milestone M22: Adversarial Stress-Testing Suite for WarpDetector
 * 
 * Red Team Adversarial Verification:
 * 1. Extreme frame rates (15Hz, 60Hz, 120Hz, 240Hz, and variable dt jitter)
 * 2. Toroidal boundary crossing at sub-pixel steps vs malicious early/late wraps
 * 3. Horizontal wrap boundary validation
 * 4. 13px sneak jump challenge across all angular quadrants
 * 5. Rapid harmonic breathing stress & false positive immunity
 * 6. Object pool recycling and entity lifecycle churn
 * 7. Multi-entity tractor dive saturation & assertWarpCompliance edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WarpDetector,
  assertWarpCompliance,
  WarpRecord,
} from './m22_enemy_warp_detector.test';
import { FormationManager } from '../../src/systems/FormationManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyState, EnemyType } from '../../src/types';

describe('Milestone M22: Adversarial WarpDetector Stress Suite', () => {
  let detector: WarpDetector;
  let formation: FormationManager;

  beforeEach(() => {
    detector = new WarpDetector({ dt: 1 / 60 });
    formation = new FormationManager();
  });

  // ==========================================================================
  // 1. Extreme Frame Rates & Variable Delta-Time Jitter
  // ==========================================================================
  describe('1. Extreme Frame Rates & Variable dt Mechanics', () => {
    it('scales displacement bounds proportionally across 15Hz, 60Hz, 120Hz, and 240Hz', () => {
      // 15Hz (dt = 1/15s): 480 * (1/15) + 4.0 = 36.0 px
      const bound15Hz = detector.getMaxAllowedDisplacement(1 / 15);
      expect(bound15Hz).toBeCloseTo(36.0, 4);

      // 60Hz (dt = 1/60s): 480 * (1/60) + 4.0 = 12.0 px
      const bound60Hz = detector.getMaxAllowedDisplacement(1 / 60);
      expect(bound60Hz).toBeCloseTo(12.0, 4);

      // 120Hz (dt = 1/120s): 480 * (1/120) + 4.0 = 8.0 px
      const bound120Hz = detector.getMaxAllowedDisplacement(1 / 120);
      expect(bound120Hz).toBeCloseTo(8.0, 4);

      // 240Hz (dt = 1/240s): 480 * (1/240) + 4.0 = 6.0 px
      const bound240Hz = detector.getMaxAllowedDisplacement(1 / 240);
      expect(bound240Hz).toBeCloseTo(6.0, 4);
    });

    it('survives low frame rates (15Hz): accepts 32px physical dive but catches 37px unphysical jump', () => {
      const dt15Hz = 1 / 15;
      const detector15Hz = new WarpDetector({ dt: dt15Hz });
      const enemy = new Enemy({ id: 101, x: 100, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      // Frame 1: initialization
      detector15Hz.checkEnemy(enemy, 1, dt15Hz);

      // Frame 2: legitimate 32px dive at 15Hz (480 px/s * 1/15s = 32px)
      enemy.y += 32;
      const legitRecord = detector15Hz.checkEnemy(enemy, 2, dt15Hz);
      expect(legitRecord).toBeNull();
      expect(detector15Hz.anomalies).toHaveLength(0);

      // Frame 3: unphysical 37px jump (> 36px bound)
      enemy.y += 37;
      const jumpRecord = detector15Hz.checkEnemy(enemy, 3, dt15Hz);
      expect(jumpRecord).not.toBeNull();
      expect(jumpRecord!.deltaDistance).toBeCloseTo(37.0, 1);
      expect(detector15Hz.anomalies).toHaveLength(1);
    });

    it('survives high frame rates (240Hz): catches 7px jump while allowing 2px physical step', () => {
      const dt240Hz = 1 / 240;
      const detector240Hz = new WarpDetector({ dt: dt240Hz });
      const enemy = new Enemy({ id: 102, x: 100, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector240Hz.checkEnemy(enemy, 1, dt240Hz);

      // Frame 2: physical 2px step at 240Hz
      enemy.y += 2.0;
      const stepRecord = detector240Hz.checkEnemy(enemy, 2, dt240Hz);
      expect(stepRecord).toBeNull();

      // Frame 3: 7px jump (> 6.0px bound)
      enemy.y += 7.0;
      const jumpRecord = detector240Hz.checkEnemy(enemy, 3, dt240Hz);
      expect(jumpRecord).not.toBeNull();
      expect(jumpRecord!.deltaDistance).toBeCloseTo(7.0, 1);
    });

    it('dynamically adapts to erratic per-frame dt jitter without false flags', () => {
      const enemy = new Enemy({ id: 103, x: 100, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      // Jitter stream of dt values (lag spikes, speedups)
      const dtSequence = [0.016, 0.050, 0.008, 0.033, 0.004, 0.080];
      let currentY = 50;

      detector.checkEnemy(enemy, 0, dtSequence[0]!);

      for (let i = 0; i < dtSequence.length; i++) {
        const dt = dtSequence[i]!;
        // Enemy dives at 300 px/s (well under 480 px/s physical max)
        const step = 300 * dt;
        currentY += step;
        enemy.y = currentY;

        const record = detector.checkEnemy(enemy, i + 1, dt);
        expect(record).toBeNull();
      }

      expect(detector.anomalies).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 2. Toroidal Boundary & Sub-Pixel Crossing Edge Cases
  // ==========================================================================
  describe('2. Toroidal Boundary & Sub-Pixel Crossing', () => {
    it('seamlessly tracks sub-pixel steps crossing the y=288 boundary without false alarms', () => {
      const enemy = new Enemy({ id: 201, x: 112, y: 286.5 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);

      // Sub-pixel steps crossing 288
      const steps = [287.2, 287.8, 288.3, 288.9, 289.4];
      for (let i = 0; i < steps.length; i++) {
        enemy.y = steps[i]!;
        const record = detector.checkEnemy(enemy, i + 2);
        expect(record).toBeNull();
      }
      expect(detector.anomalies).toHaveLength(0);
    });

    it('filters genuine off-screen bottom wrap (y: 304.5 -> -16.0)', () => {
      const enemy = new Enemy({ id: 202, x: 112, y: 304.5 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);

      // Standard wrap to -16 (both positions off-screen)
      enemy.y = -16.0;
      const record = detector.checkEnemy(enemy, 2);
      expect(record).toBeNull();
      expect(detector.anomalies).toHaveLength(0);
    });

    it('flags malicious premature wrap when enemy vanishes from inside viewport (prevY = 287.9 -> currY = -16)', () => {
      const enemy = new Enemy({ id: 203, x: 112, y: 287.9 }); // 0.1px inside screen!
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);

      // Malicious vanish from visible screen to top
      enemy.y = -16.0;
      const record = detector.checkEnemy(enemy, 2);

      // Must be caught because prevY was still visible on screen!
      expect(record).not.toBeNull();
      expect(record!.deltaDistance).toBeCloseTo(303.9, 1);
      expect(record!.isOffScreenWrap).toBe(false);
      expect(detector.anomalies).toHaveLength(1);
    });

    it('flags premature re-entry popping into visible viewport (prevY = 304.0 -> currY = +5.0)', () => {
      const enemy = new Enemy({ id: 204, x: 112, y: 304.0 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);

      // Teleports directly into visible screen space instead of ceiling (-16)
      enemy.y = 5.0;
      const record = detector.checkEnemy(enemy, 2);

      expect(record).not.toBeNull();
      expect(record!.deltaDistance).toBeCloseTo(299.0, 1);
      expect(record!.isOffScreenWrap).toBe(false);
    });

    it('flags horizontal screen wrapping (x: 220 -> 5 at y=150) as unphysical warp', () => {
      const enemy = new Enemy({ id: 205, x: 220, y: 150 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);

      // Malicious horizontal screen wrap
      enemy.x = 5;
      const record = detector.checkEnemy(enemy, 2);

      expect(record).not.toBeNull();
      expect(record!.deltaDistance).toBeCloseTo(215.0, 1);
      expect(record!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
    });
  });

  // ==========================================================================
  // 3. 13px Stealth Jump Challenge Across All Angular Quadrants
  // ==========================================================================
  describe('3. 13px Stealth Jump Challenge Across All Quadrants', () => {
    it('strictly catches a 13.0px jump in all 8 compass directions at 60Hz', () => {
      const directions = [
        { name: 'East (+X)', dx: 13.0, dy: 0 },
        { name: 'West (-X)', dx: -13.0, dy: 0 },
        { name: 'South (+Y)', dx: 0, dy: 13.0 },
        { name: 'North (-Y)', dx: 0, dy: -13.0 },
        { name: 'SE (+X, +Y)', dx: 13.0 / Math.SQRT2, dy: 13.0 / Math.SQRT2 },
        { name: 'SW (-X, +Y)', dx: -13.0 / Math.SQRT2, dy: 13.0 / Math.SQRT2 },
        { name: 'NE (+X, -Y)', dx: 13.0 / Math.SQRT2, dy: -13.0 / Math.SQRT2 },
        { name: 'NW (-X, -Y)', dx: -13.0 / Math.SQRT2, dy: -13.0 / Math.SQRT2 },
      ];

      for (let i = 0; i < directions.length; i++) {
        const dir = directions[i]!;
        const testDetector = new WarpDetector({ dt: 1 / 60 });
        const enemy = new Enemy({ id: 300 + i, x: 100, y: 150 });
        enemy.active = true;
        enemy.state = EnemyState.DIVING_SOLO;

        testDetector.checkEnemy(enemy, 1);

        enemy.x += dir.dx;
        enemy.y += dir.dy;

        const record = testDetector.checkEnemy(enemy, 2);
        expect(record, `Failed to catch 13px jump in direction: ${dir.name}`).not.toBeNull();
        expect(record!.deltaDistance).toBeCloseTo(13.0, 2);
        expect(testDetector.anomalies).toHaveLength(1);
      }
    });

    it('demonstrates boundary precision: 11.99px passes while 12.01px is flagged', () => {
      const enemy1 = new Enemy({ id: 310, x: 100, y: 100 });
      enemy1.active = true;
      enemy1.state = EnemyState.DIVING_SOLO;
      detector.checkEnemy(enemy1, 1);

      // 11.99 px jump -> should PASS (maxAllowed is 12.0)
      enemy1.x += 11.99;
      const record1 = detector.checkEnemy(enemy1, 2);
      expect(record1).toBeNull();

      // 12.05 px jump -> should FAIL
      const enemy2 = new Enemy({ id: 311, x: 100, y: 100 });
      enemy2.active = true;
      enemy2.state = EnemyState.DIVING_SOLO;
      detector.checkEnemy(enemy2, 1);

      enemy2.x += 12.05;
      const record2 = detector.checkEnemy(enemy2, 2);
      expect(record2).not.toBeNull();
      expect(record2!.deltaDistance).toBeCloseTo(12.05, 2);
    });

    it('verifies sub-threshold split jumps (2x 6.5px) remain within physical bounds', () => {
      const enemy = new Enemy({ id: 312, x: 100, y: 100 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;
      detector.checkEnemy(enemy, 1);

      // Frame 1: 6.5px (covers 13px over 2 frames = 390 px/s, physically valid)
      enemy.x += 6.5;
      expect(detector.checkEnemy(enemy, 2)).toBeNull();

      // Frame 2: 6.5px
      enemy.x += 6.5;
      expect(detector.checkEnemy(enemy, 3)).toBeNull();

      expect(detector.anomalies).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 4. Formation Breathing Harmonic Saturation
  // ==========================================================================
  describe('4. Harmonic Formation Breathing Stress', () => {
    it('maintains 0 false positives over 600 frames of maximum harmonic breathing', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;
      formation.diveInterval = Infinity; // Suppress dives to isolate pure harmonic breathing

      // 600 frames = 10.0 seconds of continuous formation oscillation
      for (let frame = 1; frame <= 600; frame++) {
        formation.update(1 / 60);
        const anomalies = detector.checkFrame(formation, frame);
        expect(anomalies).toHaveLength(0);
      }

      const summary = detector.getTelemetrySummary();
      expect(summary.totalAnomalies).toBe(0);
      // Formation harmonic delta must remain <= 1.2 px/frame
      expect(summary.maxObservedDelta).toBeLessThan(1.2);
      expect(summary.totalEntityChecks).toBeGreaterThan(20000);
    });

    it('analytically verifies outermost column (col 0, row 4) maximum delta is well below 12px threshold', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;
      formation.diveInterval = Infinity;

      // Advance frame 1 to place in formation slot
      formation.update(1 / 60);

      const outerZako = formation.enemies.find((e) => e.row === 4 && e.col === 0)!;
      expect(outerZako).toBeDefined();

      let maxOuterDelta = 0;
      let prevX = outerZako.x;
      let prevY = outerZako.y;

      // Sample 360 frames (6.0 seconds = 2 full sway periods and 3 full expand periods)
      for (let frame = 2; frame <= 360; frame++) {
        formation.update(1 / 60);
        const delta = Math.hypot(outerZako.x - prevX, outerZako.y - prevY);
        if (delta > maxOuterDelta) maxOuterDelta = delta;
        prevX = outerZako.x;
        prevY = outerZako.y;
      }

      // Outermost column maximum harmonic velocity is ~1.10 px/frame
      expect(maxOuterDelta).toBeLessThan(1.2);
      // Safety headroom to 12.0px threshold is > 9.5x!
      expect(12.0 / maxOuterDelta).toBeGreaterThan(9.5);
    });
  });

  // ==========================================================================
  // 5. Entity Lifecycle Churn & Object Pool Invariants
  // ==========================================================================
  describe('5. Entity Lifecycle Churn & Pool Recycling', () => {
    it('properly purges destroyed/inactive enemies so pool recycling does not trigger phantom warps', () => {
      const enemy = new Enemy({ id: 501, x: 50, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);

      // Enemy is destroyed and deactivated
      enemy.active = false;
      enemy.state = EnemyState.EXPLODING;
      const recordDestroyed = detector.checkEnemy(enemy, 2);
      expect(recordDestroyed).toBeNull();

      // Enemy is recycled in pool and re-spawned at (180, 20) — a 130px distance from old position!
      enemy.active = true;
      enemy.state = EnemyState.ENTERING;
      enemy.x = 180;
      enemy.y = 20;

      // First frame of new lifecycle: should re-initialize tracking coordinate, NOT flag a 130px warp!
      const recordRespawn = detector.checkEnemy(enemy, 3);
      expect(recordRespawn).toBeNull();
      expect(detector.anomalies).toHaveLength(0);

      // Second frame: normal entry motion
      enemy.x = 182;
      enemy.y = 24;
      const recordNormal = detector.checkEnemy(enemy, 4);
      expect(recordNormal).toBeNull();
    });

    it('handles multiple concurrent Boss Galagas executing tractor dive without dropped records', () => {
      formation.spawnStage(2);
      formation.isEntryWaveActive = false;

      // Find both Boss Galagas in row 0
      const bosses = formation.enemies.filter((e) => e.type === EnemyType.BOSS);
      expect(bosses.length).toBeGreaterThanOrEqual(2);

      const boss1 = bosses[0]!;
      const boss2 = bosses[1]!;

      formation.launchTractorBeamDive(boss1, 80);
      formation.launchTractorBeamDive(boss2, 144);

      let boss1Anomalies = 0;
      let boss2Anomalies = 0;

      for (let frame = 1; frame <= 70; frame++) {
        formation.update(1 / 60);
        const r1 = detector.checkEnemy(boss1, frame);
        const r2 = detector.checkEnemy(boss2, frame);

        if (r1 && r1.classification === 'TRACTOR_DIVE_WARP') boss1Anomalies++;
        if (r2 && r2.classification === 'TRACTOR_DIVE_WARP') boss2Anomalies++;
      }

      // Post-fix code resolves WARP-3 for both bosses
      expect(boss1Anomalies).toBe(0);
      expect(boss2Anomalies).toBe(0);
      expect(detector.anomalies).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 6. Standalone Compliance Assertion & Edge Case Verification
  // ==========================================================================
  describe('6. assertWarpCompliance Edge Cases', () => {
    it('correctly passes an empty trace', () => {
      const result = assertWarpCompliance([]);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('correctly distinguishes strict vs non-strict compliance modes', () => {
      const trace: WarpRecord[] = [
        {
          enemyId: 601,
          enemyType: EnemyType.GOEI,
          fromState: EnemyState.ENTERING,
          toState: EnemyState.IN_FORMATION,
          prevPos: { x: 50, y: 50 },
          currPos: { x: 70, y: 50 },
          deltaDistance: 20.0,
          deltaX: 20.0,
          deltaY: 0,
          maxAllowed: 12.0,
          frame: 10,
          classification: 'SUBWAVE_ENTRY_WARP',
          isOffScreenWrap: false,
          isIntentionalGlitch: false,
        },
      ];

      // In strict mode (default): any anomaly > maxAllowedDelta is a violation
      const strictResult = assertWarpCompliance(trace, { strict: true });
      expect(strictResult.passed).toBe(false);
      expect(strictResult.violations).toHaveLength(1);

      // In non-strict mode: only UNEXPLAINED_ONSCREEN_WARP is a violation
      const nonStrictResult = assertWarpCompliance(trace, { strict: false });
      expect(nonStrictResult.passed).toBe(true);
      expect(nonStrictResult.violations).toHaveLength(0);
    });
  });
});
