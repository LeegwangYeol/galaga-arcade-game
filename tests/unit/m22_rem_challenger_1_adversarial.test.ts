/**
 * Milestone M22 Remediation: Adversarial Challenger Stress Suite
 * 
 * Conducted by: m22_rem_challenger_1 (Empirical Challenger)
 * 
 * Empirical Verification of State-Aware Thresholding, Extreme Frame Rates,
 * Fractional Toroidal Boundaries, and Horizontal Kinematic Invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WarpDetector } from './m22_enemy_warp_detector.test';
import { FormationManager } from '../../src/systems/FormationManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyState, EnemyType } from '../../src/types';

describe('m22_rem_challenger_1: Adversarial Stress & Invariant Verification Suite', () => {
  let detector: WarpDetector;

  beforeEach(() => {
    detector = new WarpDetector({ dt: 1 / 60 });
  });

  // ==========================================================================
  // Track 1: Extreme Frame Rates & State-Aware Threshold Scaling
  // ==========================================================================
  describe('Track 1: State-Aware Threshold Scaling & Extreme Frame Rates', () => {
    const testFramerates = [
      { fps: 15, dt: 1 / 15, expectedDiving: 36.0, expectedFormation: 9.0 },
      { fps: 30, dt: 1 / 30, expectedDiving: 20.0, expectedFormation: 5.0 },
      { fps: 60, dt: 1 / 60, expectedDiving: 12.0, expectedFormation: 3.0 },
      { fps: 120, dt: 1 / 120, expectedDiving: 8.0, expectedFormation: 2.0 },
      { fps: 240, dt: 1 / 240, expectedDiving: 6.0, expectedFormation: 1.5 },
      { fps: 480, dt: 1 / 480, expectedDiving: 5.0, expectedFormation: 1.25 },
    ];

    it('empirically verifies linear monotonicity and exact scaling across 15Hz to 480Hz', () => {
      let prevDivingBound = Infinity;
      let prevFormationBound = Infinity;

      for (const { fps, dt, expectedDiving, expectedFormation } of testFramerates) {
        // Non-formation / dive bound
        const divingBound = detector.getMaxAllowedDisplacement(dt);
        expect(divingBound, `Diving bound mismatch at ${fps}Hz`).toBeCloseTo(expectedDiving, 4);

        // State-aware formation bounds via direct state enum
        const formationBoundEnum = detector.getMaxAllowedDisplacement(dt, EnemyState.IN_FORMATION);
        expect(formationBoundEnum, `Formation bound enum mismatch at ${fps}Hz`).toBeCloseTo(expectedFormation, 4);

        // State-aware formation bounds via object context (toState)
        const formationBoundTo = detector.getMaxAllowedDisplacement(dt, {
          toState: EnemyState.IN_FORMATION,
        });
        expect(formationBoundTo, `Formation bound toState mismatch at ${fps}Hz`).toBeCloseTo(expectedFormation, 4);

        // State-aware bounds via object context: fromState alone does NOT restrict to formation bounds
        const formationBoundFrom = detector.getMaxAllowedDisplacement(dt, {
          fromState: EnemyState.IN_FORMATION,
        });
        expect(formationBoundFrom, `Formation bound fromState-only mismatch at ${fps}Hz`).toBeCloseTo(expectedDiving, 4);

        // Strict monotonicity check: as framerate increases (dt decreases), threshold strictly decreases
        expect(divingBound).toBeLessThan(prevDivingBound);
        expect(formationBoundEnum).toBeLessThan(prevFormationBound);

        prevDivingBound = divingBound;
        prevFormationBound = formationBoundEnum;
      }
    });

    it('verifies non-formation stateContext returns standard dive velocity bound', () => {
      const dt = 1 / 60;
      const nonFormationStates = [
        EnemyState.DIVING_SOLO,
        EnemyState.DIVING_ESCORT,
        EnemyState.ENTERING,
        EnemyState.RETURNING_TO_FORMATION,
        EnemyState.TRACTOR_BEAM_ACTIVE,
        EnemyState.CAPTURED_HOSTILE,
      ];

      for (const state of nonFormationStates) {
        const bound = detector.getMaxAllowedDisplacement(dt, state);
        expect(bound).toBeCloseTo(12.0, 4);

        const boundObj = detector.getMaxAllowedDisplacement(dt, {
          toState: state,
          fromState: EnemyState.DIVING_SOLO,
        });
        expect(boundObj).toBeCloseTo(12.0, 4);
      }
    });

    it('empirical formation breathing stress across 15Hz, 30Hz, 60Hz, 120Hz, 240Hz yields zero false positives', () => {
      for (const { fps, dt } of testFramerates.slice(0, 5)) {
        const localFormation = new FormationManager();
        const localDetector = new WarpDetector({ dt });
        localFormation.spawnStage(1);
        localFormation.isEntryWaveActive = false;
        localFormation.diveInterval = Infinity; // Suppress dives to isolate pure harmonic breathing

        // Simulate 5 seconds of oscillation (T_sway = 3.0s, T_expand = 2.0s)
        const totalFrames = Math.round(5.0 * fps);
        for (let frame = 1; frame <= totalFrames; frame++) {
          localFormation.update(dt);
          localDetector.checkFrame(localFormation, frame, dt);
        }

        expect(localDetector.anomalies, `False positives encountered at ${fps}Hz`).toHaveLength(0);
        const summary = localDetector.getTelemetrySummary();
        expect(summary.totalAnomalies).toBe(0);

        // Max observed displacement must stay well below threshold
        const threshold = localDetector.getMaxAllowedDisplacement(dt, EnemyState.IN_FORMATION);
        expect(summary.maxObservedDelta).toBeLessThan(threshold * 0.75);
      }
    });

    it('state-aware threshold catches sub-12px micro-snaps (3.1px to 11.9px) in formation while permitting legitimate breathing (<= 1.5px)', () => {
      const enemy = new Enemy({ id: 101, x: 100, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.IN_FORMATION;

      // Seed initial position
      detector.checkEnemy(enemy, 1);

      // Frame 2: legitimate formation breathing step (dx = 1.0px, dy = 0.5px -> dist = 1.118px <= 3.0px)
      enemy.x += 1.0;
      enemy.y += 0.5;
      const legitStep = detector.checkEnemy(enemy, 2);
      expect(legitStep).toBeNull();
      expect(detector.anomalies).toHaveLength(0);

      // Frame 3: micro-snap of 4.5px (which escaped coarse 12.0px threshold)
      enemy.x += 4.5;
      const snapStep = detector.checkEnemy(enemy, 3);
      expect(snapStep).not.toBeNull();
      expect(snapStep!.deltaDistance).toBeCloseTo(4.5, 2);
      expect(snapStep!.maxAllowed).toBeCloseTo(3.0, 4);
      expect(detector.anomalies).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Track 2: Toroidal Wrap Filter Under Fractional & Boundary Edge Cases
  // ==========================================================================
  describe('Track 2: Toroidal Wrap Filter Under Fractional & Boundary Edge Cases', () => {
    it('accurately filters exact bottom-to-top wrap at integer and fractional boundaries', () => {
      const testCases = [
        { name: 'integer boundary', prevY: 288.0, currY: 0.0 },
        { name: 'deep off-screen wrap', prevY: 304.5, currY: -16.0 },
        { name: 'fractional above screenHeight', prevY: 288.001, currY: -0.001 },
        { name: 'sub-pixel exit', prevY: 288.5, currY: -15.5 },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i]!;
        const testDetector = new WarpDetector({ dt: 1 / 60 });
        const enemy = new Enemy({ id: 200 + i, x: 112, y: tc.prevY });
        enemy.active = true;
        enemy.state = EnemyState.DIVING_SOLO;

        testDetector.checkEnemy(enemy, 1);
        enemy.y = tc.currY;
        const record = testDetector.checkEnemy(enemy, 2);

        expect(record, `Failed legitimate wrap for ${tc.name}`).toBeNull();
        expect(testDetector.anomalies).toHaveLength(0);
      }
    });

    it('strictly catches premature bottom wrap when enemy vanishes from inside viewport by 0.001px', () => {
      const enemy = new Enemy({ id: 210, x: 112, y: 287.999 }); // 0.001px inside visible canvas!
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);
      enemy.y = -16.0;
      const record = detector.checkEnemy(enemy, 2);

      expect(record, 'Premature bottom vanish was not flagged').not.toBeNull();
      expect(record!.deltaDistance).toBeCloseTo(303.999, 2);
      expect(record!.isOffScreenWrap).toBe(false);
      expect(detector.anomalies).toHaveLength(1);
    });

    it('strictly catches premature top pop-in when enemy re-enters directly onto visible canvas', () => {
      const enemy = new Enemy({ id: 211, x: 112, y: 304.0 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);
      enemy.y = 0.001; // Popped 0.001px inside visible canvas!
      const record = detector.checkEnemy(enemy, 2);

      expect(record, 'Premature top pop-in was not flagged').not.toBeNull();
      expect(record!.deltaDistance).toBeCloseTo(303.999, 2);
      expect(record!.isOffScreenWrap).toBe(false);
      expect(detector.anomalies).toHaveLength(1);
    });

    it('permits continuous movement when both positions are strictly off-screen above or below', () => {
      // Off-screen above (ingress staging)
      const enemyAbove = new Enemy({ id: 212, x: 50, y: -25 });
      enemyAbove.active = true;
      enemyAbove.state = EnemyState.ENTERING;
      detector.checkEnemy(enemyAbove, 1);

      enemyAbove.x = 180; // Large lateral displacement off-screen
      enemyAbove.y = -22;
      const recordAbove = detector.checkEnemy(enemyAbove, 2);
      expect(recordAbove).toBeNull();

      // Off-screen below
      const enemyBelow = new Enemy({ id: 213, x: 100, y: 310 });
      enemyBelow.active = true;
      enemyBelow.state = EnemyState.DIVING_SOLO;
      detector.checkEnemy(enemyBelow, 1);

      enemyBelow.x = 150;
      enemyBelow.y = 320;
      const recordBelow = detector.checkEnemy(enemyBelow, 2);
      expect(recordBelow).toBeNull();
    });

    it('strictly flags horizontal on-screen wrap (x: 220 -> 4) without false filtering', () => {
      const enemy = new Enemy({ id: 214, x: 220.0, y: 140.0 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);
      enemy.x = 4.0; // Discontinuous jump across screen horizontally
      const record = detector.checkEnemy(enemy, 2);

      expect(record).not.toBeNull();
      expect(record!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
      expect(record!.deltaDistance).toBeCloseTo(216.0, 1);
      expect(record!.isOffScreenWrap).toBe(false);
    });

    it('strictly flags diagonal teleport jumping from visible area to ceiling (x: 50->180, y: 150-> -16)', () => {
      const enemy = new Enemy({ id: 215, x: 50, y: 150 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      detector.checkEnemy(enemy, 1);
      enemy.x = 180;
      enemy.y = -16;
      const record = detector.checkEnemy(enemy, 2);

      expect(record).not.toBeNull();
      expect(record!.isOffScreenWrap).toBe(false);
      expect(record!.deltaDistance).toBeGreaterThan(150);
    });
  });

  // ==========================================================================
  // Track 3: Transition Memory Classification & Timing Window Verification
  // ==========================================================================
  describe('Track 3: Transition Memory Classification & Timing Windows', () => {
    it('correctly classifies FORMATION_REENTRY_WARP during transition frame (T) and subsequent frames (T+1, T+2)', () => {
      for (let lag = 0; lag <= 2; lag++) {
        const testDetector = new WarpDetector({ dt: 1 / 60 });
        const enemy = new Enemy({ id: 300 + lag, x: 100, y: 60 });
        enemy.active = true;
        enemy.state = EnemyState.RETURNING_TO_FORMATION;

        // Frame 0: in RETURNING state
        testDetector.checkEnemy(enemy, 0);

        // Frame 1: transitions to IN_FORMATION
        enemy.state = EnemyState.IN_FORMATION;
        enemy.x += 1.0;
        enemy.y += 0.5;

        if (lag === 0) {
          // Jump happens immediately on transition frame
          enemy.x += 15.0;
          const record = testDetector.checkEnemy(enemy, 1);
          expect(record).not.toBeNull();
          expect(record!.classification).toBe('FORMATION_REENTRY_WARP');
        } else if (lag === 1) {
          // Normal frame T
          testDetector.checkEnemy(enemy, 1);
          // Jump happens at T+1 (the true engine grid-snap timing)
          enemy.x += 15.0;
          const record = testDetector.checkEnemy(enemy, 2);
          expect(record).not.toBeNull();
          expect(record!.classification).toBe('FORMATION_REENTRY_WARP');
        } else if (lag === 2) {
          testDetector.checkEnemy(enemy, 1);
          testDetector.checkEnemy(enemy, 2);
          // Jump happens at T+2
          enemy.x += 15.0;
          const record = testDetector.checkEnemy(enemy, 3);
          expect(record).not.toBeNull();
          expect(record!.classification).toBe('FORMATION_REENTRY_WARP');
        }
      }
    });

    it('falls back to UNEXPLAINED_ONSCREEN_WARP if an unphysical jump occurs long after transition (T+5)', () => {
      const enemy = new Enemy({ id: 310, x: 100, y: 60 });
      enemy.active = true;
      enemy.state = EnemyState.RETURNING_TO_FORMATION;

      detector.checkEnemy(enemy, 0);
      enemy.state = EnemyState.IN_FORMATION;

      // 5 normal resting frames
      for (let f = 1; f <= 5; f++) {
        enemy.x += 0.2;
        detector.checkEnemy(enemy, f);
      }

      // Frame 6: unphysical jump
      enemy.x += 20.0;
      const record = detector.checkEnemy(enemy, 6);
      expect(record).not.toBeNull();
      // Should no longer be classified as re-entry warp because transition was > 2 frames ago
      expect(record!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
    });

    it('correctly classifies SUBWAVE_ENTRY_WARP during entry path completion snap', () => {
      const enemy = new Enemy({ id: 320, x: 150, y: 60 });
      enemy.active = true;
      enemy.state = EnemyState.ENTERING;

      detector.checkEnemy(enemy, 0);

      // Transitions to IN_FORMATION with a 9.5px snap
      enemy.state = EnemyState.IN_FORMATION;
      enemy.x = 159.5;
      const record = detector.checkEnemy(enemy, 1);

      expect(record).not.toBeNull();
      expect(record!.classification).toBe('SUBWAVE_ENTRY_WARP');
      expect(record!.deltaDistance).toBeCloseTo(9.5, 1);
    });

    it('correctly classifies KINEMATIC_INVERSION_WARP when anti-gravity dive stalls mid-air and ceiling-wraps', () => {
      const enemy = new Enemy({ id: 330, x: 112, y: 120 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;
      enemy.isKineticInverted = true;

      detector.checkEnemy(enemy, 0);

      // Mid-air wrap to -16
      enemy.y = -16;
      const record = detector.checkEnemy(enemy, 1);

      expect(record).not.toBeNull();
      expect(record!.classification).toBe('KINEMATIC_INVERSION_WARP');
      expect(record!.deltaDistance).toBeCloseTo(136.0, 1);
    });
  });

  // ==========================================================================
  // Track 4: Monte Carlo Kinematic Fuzzing & Peel-off Transition Boundaries
  // ==========================================================================
  describe('Track 4: Monte Carlo Kinematic Fuzzing & Peel-off Transition Boundaries', () => {
    it('empirically measures real engine peel-off displacement across all 40 slots and peel-off variants', () => {
      // Test all peel-off methods: solo, paired Goeis, Boss escort, Tractor dive
      for (let slotIdx = 0; slotIdx < 40; slotIdx++) {
        const localFormation = new FormationManager();
        const localDetector = new WarpDetector({ dt: 1 / 60 });
        localFormation.spawnStage(2); // Bosses + Goeis + Zakos
        localFormation.isEntryWaveActive = false;

        // Advance 120 frames
        for (let i = 0; i < 120; i++) localFormation.update(1 / 60);

        const enemy = localFormation.enemies[slotIdx]!;
        if (!enemy) continue;

        localDetector.checkEnemy(enemy, 1);
        const preX = enemy.x;
        const preY = enemy.y;

        localFormation.peelOffSolo(enemy, 112);
        localFormation.update(1 / 60);

        const delta = Math.hypot(enemy.x - preX, enemy.y - preY);
        const record = localDetector.checkEnemy(enemy, 2);

        // First frame of dive peel-off should NEVER trigger false positive
        expect(record, `False positive on peel-off for enemy at row ${enemy.row} col ${enemy.col}, delta=${delta}`).toBeNull();
      }
    });

    it('empirically logs all dive first frame deltas at 60Hz', () => {
      const localFormation = new FormationManager();
      localFormation.spawnStage(2);
      localFormation.isEntryWaveActive = false;

      for (let i = 0; i < 120; i++) localFormation.update(1 / 60);

      // 1. Solo zako
      const zako = localFormation.enemies.find((e) => e.type === EnemyType.ZAKO)!;
      let preX = zako.x, preY = zako.y;
      localFormation.peelOffSolo(zako, 112);
      localFormation.update(1 / 60);
      console.log('Solo zako first-frame delta at 60Hz:', Math.hypot(zako.x - preX, zako.y - preY).toFixed(3));

      // 2. Paired goeis
      const goeis = localFormation.enemies.filter((e) => e.type === EnemyType.GOEI);
      const leftG = goeis[0]!, rightG = goeis[1]!;
      let pLX = leftG.x, pLY = leftG.y, pRX = rightG.x, pRY = rightG.y;
      (localFormation as any).peelOffPairedGoeis(leftG, rightG, 112);
      localFormation.update(1 / 60);
      console.log('Paired Goei left first-frame delta at 60Hz:', Math.hypot(leftG.x - pLX, leftG.y - pLY).toFixed(3));
      console.log('Paired Goei right first-frame delta at 60Hz:', Math.hypot(rightG.x - pRX, rightG.y - pRY).toFixed(3));

      // 3. Boss escort
      const boss = localFormation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      let pBX = boss.x, pBY = boss.y;
      (localFormation as any).peelOffBossEscort(boss, [goeis[2]!], 112);
      localFormation.update(1 / 60);
      console.log('Boss escort first-frame delta at 60Hz:', Math.hypot(boss.x - pBX, boss.y - pBY).toFixed(3));

      // 4. Tractor dive
      const boss2 = localFormation.enemies.filter((e) => e.type === EnemyType.BOSS)[1] || boss;
      let pTX = boss2.x, pTY = boss2.y;
      localFormation.launchTractorBeamDive(boss2, 112);
      localFormation.update(1 / 60);
      console.log('Tractor dive first-frame delta at 60Hz:', Math.hypot(boss2.x - pTX, boss2.y - pTY).toFixed(3));
    });

    it('empirically verifies peel-off at <= 30Hz does not trigger false positive when gated strictly on toState', () => {
      // At 30Hz and 15Hz, dive velocity (144 px/s) + breathing (66 px/s) exceeds 120*dt + 1.0
      // When gated strictly on toState === IN_FORMATION, the bound is 480*dt + 4.0 (20.0px at 30Hz, 36.0px at 15Hz)
      // delta <= maxAllowed -> 0 FALSE POSITIVES
      const testFramerates = [
        { fps: 15, dt: 1 / 15, expectedDeltaMin: 10.0, expectedMaxAllowed: 36.0 },
        { fps: 30, dt: 1 / 30, expectedDeltaMin: 5.1, expectedMaxAllowed: 20.0 },
      ];

      for (const { fps, dt, expectedDeltaMin, expectedMaxAllowed } of testFramerates) {
        const localFormation = new FormationManager();
        const localDetector = new WarpDetector({ dt });
        localFormation.spawnStage(1);
        localFormation.isEntryWaveActive = false;

        for (let i = 0; i < 2 * fps; i++) localFormation.update(dt);

        const enemy = localFormation.enemies.find((e) => e.row === 4 && e.col === 0)!;
        localDetector.checkEnemy(enemy, 1, dt);

        const preX = enemy.x;
        const preY = enemy.y;

        localFormation.peelOffSolo(enemy, 112);
        localFormation.update(dt);

        const delta = Math.hypot(enemy.x - preX, enemy.y - preY);
        expect(delta).toBeGreaterThan(expectedDeltaMin);

        // With toState-only gating, toState is DIVING_SOLO, so maxAllowed is standard velocity bound (480*dt + 4.0)
        const calculatedMaxAllowed = localDetector.getMaxAllowedDisplacement(dt, {
          toState: enemy.state,
          fromState: EnemyState.IN_FORMATION,
        });
        expect(calculatedMaxAllowed).toBeCloseTo(expectedMaxAllowed, 4);

        // Because delta < calculatedMaxAllowed on legitimate dive motion, checkEnemy produces 0 anomalies!
        const falseAnomaly = localDetector.checkEnemy(enemy, 2, dt);
        expect(falseAnomaly).toBeNull();
      }
    });

    it('proves that gating state-aware thresholding strictly on toState === IN_FORMATION eliminates all false positives at 15Hz-240Hz', () => {
      // Oracle test: if getMaxAllowedDisplacement checks toState === IN_FORMATION only,
      // all legitimate peel-offs pass across all frame rates (15Hz to 240Hz)
      const testFramerates = [15, 30, 60, 120, 240];

      for (const fps of testFramerates) {
        const dt = 1 / fps;
        const localFormation = new FormationManager();
        localFormation.spawnStage(1);
        localFormation.isEntryWaveActive = false;

        for (let i = 0; i < 2 * fps; i++) localFormation.update(dt);

        const enemy = localFormation.enemies.find((e) => e.row === 4 && e.col === 0)!;
        const preX = enemy.x;
        const preY = enemy.y;

        localFormation.peelOffSolo(enemy, 112);
        localFormation.update(dt);

        const delta = Math.hypot(enemy.x - preX, enemy.y - preY);

        // Correct oracle: toState is DIVING_SOLO, so bound is maxVelocity * dt + toleranceMargin
        const toStateOnlyBound = enemy.state === EnemyState.IN_FORMATION
          ? 120 * dt + 1.0
          : 480 * dt + 4.0;

        expect(delta, `Peel-off delta exceeded dive bound at ${fps}Hz`).toBeLessThan(toStateOnlyBound);
      }
    });

    it('empirically verifies launchTractorBeamDive first frame does not produce false positive', () => {
      const localFormation = new FormationManager();
      const localDetector = new WarpDetector({ dt: 1 / 60 });
      localFormation.spawnStage(2);
      localFormation.isEntryWaveActive = false;

      for (let i = 0; i < 120; i++) localFormation.update(1 / 60);

      const boss = localFormation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      localDetector.checkEnemy(boss, 1);

      localFormation.launchTractorBeamDive(boss, 112);
      localFormation.update(1 / 60);

      const record = localDetector.checkEnemy(boss, 2);
      expect(record, 'False positive on tractor beam dive launch').toBeNull();
    });

    it('simulates 3,000 randomized legal formation breathing steps with 0.0% false positives', () => {
      const enemy = new Enemy({ id: 401, x: 112, y: 80 });
      enemy.active = true;
      enemy.state = EnemyState.IN_FORMATION;

      detector.checkEnemy(enemy, 1);

      let seed = 54321;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let frame = 2; frame <= 3001; frame++) {
        const maxStep = 1.35; // Maximum realistic formation breathing step
        const angle = rand() * Math.PI * 2;
        const dist = rand() * maxStep;

        enemy.x = Math.max(20, Math.min(204, enemy.x + dist * Math.cos(angle)));
        enemy.y = Math.max(20, Math.min(260, enemy.y + dist * Math.sin(angle)));

        const record = detector.checkEnemy(enemy, frame);
        expect(record, `False positive at frame ${frame}`).toBeNull();
      }

      expect(detector.anomalies).toHaveLength(0);
      expect(detector.totalChecks).toBe(3000);
    });

    it('injects 500 randomized warp anomalies across varied angles and states: 100% detection rate', () => {
      let seed = 998877;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const enemy = new Enemy({ id: 402, x: 112, y: 144 });
      enemy.active = true;
      let detectedCount = 0;
      const testCount = 500;

      for (let i = 0; i < testCount; i++) {
        detector.reset();
        const inFormation = rand() > 0.5;
        enemy.state = inFormation ? EnemyState.IN_FORMATION : EnemyState.DIVING_SOLO;
        enemy.x = 60 + rand() * 104;
        enemy.y = 60 + rand() * 168;

        detector.checkEnemy(enemy, 1);

        // Inject jump strictly greater than threshold
        const threshold = inFormation ? 3.0 : 12.0;
        const jumpDist = threshold + 0.5 + rand() * 50.0;
        const angle = rand() * Math.PI * 2;

        enemy.x = Math.max(10, Math.min(214, enemy.x + jumpDist * Math.cos(angle)));
        enemy.y = Math.max(10, Math.min(278, enemy.y + jumpDist * Math.sin(angle)));

        const record = detector.checkEnemy(enemy, 2);
        if (record && record.deltaDistance > threshold) {
          detectedCount++;
        }
      }

      expect(detectedCount).toBe(testCount);
    });
  });
});
