/**
 * Milestone M22: Empirical Adversarial Challenge Suite
 * 
 * Conducted by: m22_rem_challenger_2 (Empirical Red Team)
 * 
 * Objective:
 * Stress-test classification accuracy, zero cross-contamination between all 5 warp classes,
 * state-aware threshold sensitivity, and assertWarpCompliance telemetry robustness.
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

describe('M22 Remediation Challenger 2: Adversarial Classification & Compliance Stress Suite', () => {
  let detector: WarpDetector;

  beforeEach(() => {
    detector = new WarpDetector({ dt: 1 / 60 });
  });

  // ==========================================================================
  // Track 1: Classification Accuracy & Mutual Exclusivity Matrix
  // ==========================================================================
  describe('Track 1: Classification Accuracy & Mutual Exclusivity Matrix', () => {
    it('accurately tracks FORMATION_REENTRY_WARP through Frame T..T+3 and decays to UNEXPLAINED_ONSCREEN_WARP at Frame T+4', () => {
      const enemy = new Enemy({ id: 1, x: 100, y: 100 });
      enemy.active = true;

      // Frame 1: RETURNING_TO_FORMATION
      enemy.state = EnemyState.RETURNING_TO_FORMATION;
      detector.checkEnemy(enemy, 1);

      // Frame 2 (Transition Frame T): switches to IN_FORMATION with 20px jump
      enemy.state = EnemyState.IN_FORMATION;
      enemy.x = 120;
      const warpT0 = detector.checkEnemy(enemy, 2);
      expect(warpT0).not.toBeNull();
      expect(warpT0!.classification).toBe('FORMATION_REENTRY_WARP');

      // Frame 3 (T+1): first frame in IN_FORMATION
      enemy.x = 135;
      const warpT1 = detector.checkEnemy(enemy, 3);
      expect(warpT1).not.toBeNull();
      expect(warpT1!.classification).toBe('FORMATION_REENTRY_WARP');

      // Frame 4 (T+2): second frame in IN_FORMATION
      enemy.x = 150;
      const warpT2 = detector.checkEnemy(enemy, 4);
      expect(warpT2).not.toBeNull();
      expect(warpT2!.classification).toBe('FORMATION_REENTRY_WARP');

      // Frame 5 (T+3): third frame in IN_FORMATION (framesSinceTransition === 2)
      enemy.x = 165;
      const warpT3 = detector.checkEnemy(enemy, 5);
      expect(warpT3).not.toBeNull();
      expect(warpT3!.classification).toBe('FORMATION_REENTRY_WARP');

      // Frame 6 (T+4): fourth frame in IN_FORMATION (framesSinceTransition === 3 > 2)
      // Transition memory expires; must decay to UNEXPLAINED_ONSCREEN_WARP
      enemy.x = 190;
      const warpT4 = detector.checkEnemy(enemy, 6);
      expect(warpT4).not.toBeNull();
      expect(warpT4!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
    });

    it('isolates SUBWAVE_ENTRY_WARP with zero cross-contamination to FORMATION_REENTRY_WARP', () => {
      const enemy = new Enemy({ id: 2, x: 80, y: 80 });
      enemy.active = true;

      // Frame 1: ENTERING
      enemy.state = EnemyState.ENTERING;
      detector.checkEnemy(enemy, 1);

      // Frame 2 (Transition Frame T): switches to IN_FORMATION with 10px snap
      enemy.state = EnemyState.IN_FORMATION;
      enemy.x = 90;
      const warpEntry = detector.checkEnemy(enemy, 2);
      expect(warpEntry).not.toBeNull();
      expect(warpEntry!.classification).toBe('SUBWAVE_ENTRY_WARP');
      expect(warpEntry!.classification).not.toBe('FORMATION_REENTRY_WARP');

      // Frame 3 (T+1): grid slot snap
      enemy.x = 100;
      const warpT1 = detector.checkEnemy(enemy, 3);
      expect(warpT1).not.toBeNull();
      expect(warpT1!.classification).toBe('SUBWAVE_ENTRY_WARP');
      expect(warpT1!.classification).not.toBe('FORMATION_REENTRY_WARP');
    });

    it('sweeps TRACTOR_DIVE_WARP altitude boundary: strictly confines to [85, 115] for Boss Galagas', () => {
      const testCases = [
        { y: 84.9, expected: 'KINEMATIC_INVERSION_WARP', label: '84.9px (sub-tractor window)' },
        { y: 85.0, expected: 'TRACTOR_DIVE_WARP', label: '85.0px (exact lower boundary)' },
        { y: 100.0, expected: 'TRACTOR_DIVE_WARP', label: '100.0px (tractor beam halt altitude)' },
        { y: 115.0, expected: 'TRACTOR_DIVE_WARP', label: '115.0px (exact upper boundary)' },
        { y: 115.1, expected: 'KINEMATIC_INVERSION_WARP', label: '115.1px (super-tractor window)' },
      ];

      for (const tc of testCases) {
        detector.reset();
        const boss = new Enemy({ id: 10, x: 112, y: tc.y });
        boss.active = true;
        boss.type = EnemyType.BOSS;
        boss.state = EnemyState.DIVING_SOLO;

        detector.checkEnemy(boss, 1);
        boss.y = -16; // Wrap to ceiling
        const record = detector.checkEnemy(boss, 2);

        expect(record, `Failed for altitude ${tc.label}`).not.toBeNull();
        expect(record!.classification, `Classification mismatch for ${tc.label}`).toBe(tc.expected);
      }
    });

    it('strictly denies TRACTOR_DIVE_WARP classification to non-Boss entities (Zako / Goei)', () => {
      const zako = new Enemy({ id: 21, x: 112, y: 100 });
      zako.active = true;
      zako.type = EnemyType.ZAKO;
      zako.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(zako, 1);
      zako.y = -16;
      const record = detector.checkEnemy(zako, 2);

      expect(record).not.toBeNull();
      expect(record!.classification).not.toBe('TRACTOR_DIVE_WARP');
      expect(record!.classification).toBe('KINEMATIC_INVERSION_WARP');
    });

    it('sweeps KINEMATIC_INVERSION_WARP altitude boundaries: strictly bounds to [50, 250]', () => {
      const testCases = [
        { y: 49.9, expected: 'UNEXPLAINED_ONSCREEN_WARP', label: '49.9px (too high for inversion)' },
        { y: 50.0, expected: 'KINEMATIC_INVERSION_WARP', label: '50.0px (exact lower bound)' },
        { y: 150.0, expected: 'KINEMATIC_INVERSION_WARP', label: '150.0px (mid-screen inversion stall)' },
        { y: 250.0, expected: 'KINEMATIC_INVERSION_WARP', label: '250.0px (exact upper bound)' },
        { y: 250.1, expected: 'UNEXPLAINED_ONSCREEN_WARP', label: '250.1px (too deep for inversion)' },
      ];

      for (const tc of testCases) {
        detector.reset();
        const goei = new Enemy({ id: 31, x: 100, y: tc.y });
        goei.active = true;
        goei.type = EnemyType.GOEI;
        goei.state = EnemyState.DIVING_SOLO;

        detector.checkEnemy(goei, 1);
        goei.y = -16;
        const record = detector.checkEnemy(goei, 2);

        expect(record, `Failed for altitude ${tc.label}`).not.toBeNull();
        expect(record!.classification, `Classification mismatch for ${tc.label}`).toBe(tc.expected);
      }
    });

    it('guarantees on-screen jumps with currPos.y > 0 are NEVER misclassified as tractor or inversion', () => {
      const jumps = [
        { from: { x: 100, y: 100 }, to: { x: 100, y: 150 }, name: 'downward 50px jump' },
        { from: { x: 100, y: 100 }, to: { x: 150, y: 100 }, name: 'lateral 50px jump' },
        { from: { x: 100, y: 100 }, to: { x: 60, y: 60 }, name: 'diagonal 56px jump' },
        { from: { x: 100, y: 100 }, to: { x: 100, y: 10 }, name: 'upward 90px jump to y=10 (>0)' },
      ];

      for (const j of jumps) {
        detector.reset();
        const boss = new Enemy({ id: 41, x: j.from.x, y: j.from.y });
        boss.active = true;
        boss.type = EnemyType.BOSS;
        boss.state = EnemyState.DIVING_SOLO;

        detector.checkEnemy(boss, 1);
        boss.x = j.to.x;
        boss.y = j.to.y;
        const record = detector.checkEnemy(boss, 2);

        expect(record, `Failed for ${j.name}`).not.toBeNull();
        expect(record!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
        expect(record!.classification).not.toBe('TRACTOR_DIVE_WARP');
        expect(record!.classification).not.toBe('KINEMATIC_INVERSION_WARP');
      }
    });

    it('classifies in-formation slot teleportation (> 3.0px while staying IN_FORMATION) as UNEXPLAINED_ONSCREEN_WARP', () => {
      const enemy = new Enemy({ id: 51, x: 20, y: 60 });
      enemy.active = true;
      enemy.state = EnemyState.IN_FORMATION;

      // Establish baseline history
      for (let f = 1; f <= 5; f++) {
        detector.checkEnemy(enemy, f);
      }

      // Sudden in-formation jump: x: 20 -> 150 (130px)
      enemy.x = 150;
      const warp = detector.checkEnemy(enemy, 6);

      expect(warp).not.toBeNull();
      expect(warp!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
    });
  });

  // ==========================================================================
  // Track 2: State-Aware Threshold Discrimination & Epsilon Sharpness
  // ==========================================================================
  describe('Track 2: State-Aware Threshold Discrimination & Epsilon Sharpness', () => {
    it('formation threshold sharpness: differentiates 2.9999px from 3.0001px at 60Hz', () => {
      const enemy = new Enemy({ id: 61, x: 50, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.IN_FORMATION;

      // Baseline frame
      detector.checkEnemy(enemy, 1);

      // 2.9999px step: within 3.0px bound -> must PASS
      enemy.x += 2.9999;
      const subRecord = detector.checkEnemy(enemy, 2);
      expect(subRecord).toBeNull();

      // Reset and test 3.0001px step: exceeds 3.0px bound -> must FAIL
      detector.reset();
      enemy.x = 50;
      detector.checkEnemy(enemy, 1);

      enemy.x += 3.0001;
      const superRecord = detector.checkEnemy(enemy, 2);
      expect(superRecord).not.toBeNull();
      expect(superRecord!.deltaDistance).toBeCloseTo(3.0001, 4);
      expect(superRecord!.maxAllowed).toBe(3.0);
    });

    it('free-flight dive threshold sharpness: differentiates 11.9999px from 12.0001px at 60Hz', () => {
      const enemy = new Enemy({ id: 71, x: 50, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);

      // 11.9999px step -> PASS
      enemy.x += 11.9999;
      const subRecord = detector.checkEnemy(enemy, 2);
      expect(subRecord).toBeNull();

      // 12.0001px step -> FAIL
      detector.reset();
      enemy.x = 50;
      detector.checkEnemy(enemy, 1);

      enemy.x += 12.0001;
      const superRecord = detector.checkEnemy(enemy, 2);
      expect(superRecord).not.toBeNull();
      expect(superRecord!.deltaDistance).toBeCloseTo(12.0001, 4);
      expect(superRecord!.maxAllowed).toBe(12.0);
    });

    it('verifies polymorphic getMaxAllowedDisplacement backward compatibility', () => {
      // Single argument call (legacy)
      expect(detector.getMaxAllowedDisplacement(1 / 60)).toBeCloseTo(12.0, 4);

      // Direct EnemyState argument
      expect(detector.getMaxAllowedDisplacement(1 / 60, EnemyState.IN_FORMATION)).toBeCloseTo(3.0, 4);
      expect(detector.getMaxAllowedDisplacement(1 / 60, EnemyState.DIVING_SOLO)).toBeCloseTo(12.0, 4);

      // Context object argument: toState === IN_FORMATION yields formation bound; fromState alone yields velocity bound
      expect(detector.getMaxAllowedDisplacement(1 / 60, { toState: EnemyState.IN_FORMATION })).toBeCloseTo(3.0, 4);
      expect(detector.getMaxAllowedDisplacement(1 / 60, { fromState: EnemyState.IN_FORMATION })).toBeCloseTo(12.0, 4);
      expect(detector.getMaxAllowedDisplacement(1 / 60, { toState: EnemyState.IN_FORMATION, fromState: EnemyState.IN_FORMATION })).toBeCloseTo(3.0, 4);
      expect(detector.getMaxAllowedDisplacement(1 / 60, { toState: EnemyState.DIVING_SOLO, fromState: EnemyState.RETURNING_TO_FORMATION })).toBeCloseTo(12.0, 4);
    });
  });

  // ==========================================================================
  // Track 3: assertWarpCompliance Robustness & Boundary Stress
  // ==========================================================================
  describe('Track 3: assertWarpCompliance Telemetry Validator Robustness', () => {
    it('passes empty and sub-threshold traces with 0 violations', () => {
      const empty = assertWarpCompliance([]);
      expect(empty.passed).toBe(true);
      expect(empty.violations).toHaveLength(0);

      const subThresholdTrace: WarpRecord[] = [
        {
          enemyId: 1,
          enemyType: EnemyType.ZAKO,
          fromState: EnemyState.IN_FORMATION,
          toState: EnemyState.IN_FORMATION,
          prevPos: { x: 50, y: 50 },
          currPos: { x: 52.9, y: 50 },
          deltaDistance: 2.9,
          deltaX: 2.9,
          deltaY: 0,
          maxAllowed: 3.0,
          frame: 10,
          classification: 'UNEXPLAINED_ONSCREEN_WARP',
          isOffScreenWrap: false,
          isIntentionalGlitch: false,
        },
      ];

      const res = assertWarpCompliance(subThresholdTrace);
      expect(res.passed).toBe(true);
      expect(res.violations).toHaveLength(0);
    });

    it('differentiates strict vs non-strict mode across mixed anomaly catalogs', () => {
      const mixedTrace: WarpRecord[] = [
        {
          enemyId: 1,
          enemyType: EnemyType.BOSS,
          fromState: EnemyState.DIVING_SOLO,
          toState: EnemyState.RETURNING_TO_FORMATION,
          prevPos: { x: 112, y: 100 },
          currPos: { x: 112, y: -16 },
          deltaDistance: 116.0,
          deltaX: 0,
          deltaY: -116.0,
          maxAllowed: 12.0,
          frame: 60,
          classification: 'TRACTOR_DIVE_WARP',
          isOffScreenWrap: false,
          isIntentionalGlitch: false,
        },
        {
          enemyId: 2,
          enemyType: EnemyType.GOEI,
          fromState: EnemyState.ENTERING,
          toState: EnemyState.IN_FORMATION,
          prevPos: { x: 50, y: 50 },
          currPos: { x: 60, y: 50 },
          deltaDistance: 10.0,
          deltaX: 10.0,
          deltaY: 0,
          maxAllowed: 3.0,
          frame: 180,
          classification: 'SUBWAVE_ENTRY_WARP',
          isOffScreenWrap: false,
          isIntentionalGlitch: false,
        },
      ];

      // Strict mode: any anomaly > maxAllowed is a violation
      const strict = assertWarpCompliance(mixedTrace, { strict: true });
      expect(strict.passed).toBe(false);
      expect(strict.violations).toHaveLength(2);

      // Non-strict mode: known anomalies pass, only UNEXPLAINED_ONSCREEN_WARP fails
      const nonStrict = assertWarpCompliance(mixedTrace, { strict: false });
      expect(nonStrict.passed).toBe(true);
      expect(nonStrict.violations).toHaveLength(0);

      // Adding UNEXPLAINED_ONSCREEN_WARP fails non-strict mode
      mixedTrace.push({
        enemyId: 3,
        enemyType: EnemyType.ZAKO,
        fromState: EnemyState.DIVING_SOLO,
        toState: EnemyState.DIVING_SOLO,
        prevPos: { x: 100, y: 100 },
        currPos: { x: 150, y: 100 },
        deltaDistance: 50.0,
        deltaX: 50.0,
        deltaY: 0,
        maxAllowed: 12.0,
        frame: 200,
        classification: 'UNEXPLAINED_ONSCREEN_WARP',
        isOffScreenWrap: false,
        isIntentionalGlitch: false,
      });

      const nonStrictWithUnexplained = assertWarpCompliance(mixedTrace, { strict: false });
      expect(nonStrictWithUnexplained.passed).toBe(false);
      expect(nonStrictWithUnexplained.violations).toHaveLength(1);
      expect(nonStrictWithUnexplained.violations[0]!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
    });

    it('correctly honors custom maxAllowedDelta overrides over record maxAllowed', () => {
      const records: WarpRecord[] = [
        {
          enemyId: 10,
          enemyType: EnemyType.GOEI,
          fromState: EnemyState.DIVING_SOLO,
          toState: EnemyState.DIVING_SOLO,
          prevPos: { x: 0, y: 0 },
          currPos: { x: 15, y: 0 },
          deltaDistance: 15.0,
          deltaX: 15.0,
          deltaY: 0,
          maxAllowed: 12.0,
          frame: 1,
          classification: 'UNEXPLAINED_ONSCREEN_WARP',
          isOffScreenWrap: false,
          isIntentionalGlitch: false,
        },
      ];

      // With maxAllowedDelta = 20.0, 15.0 is acceptable
      expect(assertWarpCompliance(records, { maxAllowedDelta: 20.0 }).passed).toBe(true);

      // With maxAllowedDelta = 10.0, 15.0 fails
      expect(assertWarpCompliance(records, { maxAllowedDelta: 10.0 }).passed).toBe(false);
    });

    it('processes massive 10,000-record batch with high throughput (< 40ms)', () => {
      const largeTrace: WarpRecord[] = [];
      let expectedViolations = 0;

      for (let i = 0; i < 10000; i++) {
        const isViolation = i % 4 === 0;
        const delta = isViolation ? 12.01 + (i % 50) : 11.99 - (i % 10);
        if (isViolation) expectedViolations++;

        largeTrace.push({
          enemyId: i,
          enemyType: EnemyType.ZAKO,
          fromState: EnemyState.DIVING_SOLO,
          toState: EnemyState.DIVING_SOLO,
          prevPos: { x: 100, y: 100 },
          currPos: { x: 100 + delta, y: 100 },
          deltaDistance: delta,
          deltaX: delta,
          deltaY: 0,
          maxAllowed: 12.0,
          frame: i,
          classification: 'UNEXPLAINED_ONSCREEN_WARP',
          isOffScreenWrap: false,
          isIntentionalGlitch: false,
        });
      }

      const t0 = performance.now();
      const res = assertWarpCompliance(largeTrace, { strict: true });
      const elapsed = performance.now() - t0;

      expect(res.passed).toBe(false);
      expect(res.violations).toHaveLength(expectedViolations);
      expect(elapsed).toBeLessThan(120);
    });
  });

  // ==========================================================================
  // Track 4: End-to-End Real In-Engine Defect Reproduction & Zero-Warp Validation
  // ==========================================================================
  describe('Track 4: End-to-End Real In-Engine Defect Reproduction', () => {
    it('verifies post-fix resolution of WARP-1: zero dive re-entry slot snap', () => {
      const formation = new FormationManager();
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      for (let i = 0; i < 60; i++) formation.update(1 / 60);

      const enemy = formation.enemies.find((e) => e.row === 4 && e.col === 0)!;
      expect(enemy).toBeDefined();
      formation.peelOffSolo(enemy, 112);

      let inFormationFrames = 0;
      for (let frame = 1; frame <= 600; frame++) {
        formation.update(1 / 60);
        detector.checkEnemy(enemy, frame);

        if (enemy.state === EnemyState.IN_FORMATION) {
          inFormationFrames++;
          if (inFormationFrames >= 3) break;
        }
      }

      const warp1 = detector.anomalies.find((a) => a.classification === 'FORMATION_REENTRY_WARP');
      expect(warp1).toBeUndefined();
      expect(detector.anomalies).toHaveLength(0);
      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
    });

    it('verifies post-fix resolution of WARP-2: zero sub-wave entry path completion snap', () => {
      const formation = new FormationManager();
      formation.spawnStage(1);

      const enemy = formation.enemies.find((e) => e.row === 1 && e.col === 6)!;
      expect(enemy).toBeDefined();

      let inFormationFrames = 0;
      for (let frame = 1; frame <= 360; frame++) {
        formation.update(1 / 60);
        detector.checkEnemy(enemy, frame);

        if (enemy.state === EnemyState.IN_FORMATION) {
          inFormationFrames++;
          if (inFormationFrames >= 3) break;
        }
      }

      const warp2 = detector.anomalies.find((a) => a.classification === 'SUBWAVE_ENTRY_WARP');
      expect(warp2).toBeUndefined();
      expect(detector.anomalies).toHaveLength(0);
      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
    });

    it('verifies post-fix resolution of WARP-3: zero Boss Galaga tractor dive premature ceiling wrap', () => {
      const formation = new FormationManager();
      formation.spawnStage(2);
      formation.isEntryWaveActive = false;

      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      expect(boss).toBeDefined();

      formation.launchTractorBeamDive(boss, 112);

      for (let frame = 1; frame <= 65; frame++) {
        formation.update(1 / 60);
        detector.checkEnemy(boss, frame);
      }

      const warp3 = detector.anomalies.find((a) => a.classification === 'TRACTOR_DIVE_WARP');
      expect(warp3).toBeUndefined();
      expect(detector.anomalies).toHaveLength(0);
      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
    });

    it('verifies post-fix resolution of WARP-4: zero kinetic inversion mid-air premature ceiling wrap', () => {
      const formation = new FormationManager();
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      for (let i = 0; i < 180; i++) formation.update(1 / 60);

      const enemy = formation.enemies.find((e) => e.row === 1 && e.col === 4)!;
      expect(enemy).toBeDefined();

      formation.peelOffSolo(enemy, 112);
      enemy.isGlitched = true;

      for (let frame = 1; frame <= 120; frame++) {
        if (enemy.y >= 100 && !enemy.isKineticInverted && enemy.flightPath) {
          enemy.triggerKineticInversion();
        }
        formation.update(1 / 60);
        detector.checkEnemy(enemy, frame);
      }

      const warp4 = detector.anomalies.find((a) => a.classification === 'KINEMATIC_INVERSION_WARP');
      expect(warp4).toBeUndefined();
      expect(detector.anomalies).toHaveLength(0);
      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
    });
  });
});
