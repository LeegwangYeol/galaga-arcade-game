/**
 * Milestone 4 Adversarial Challenge Test Suite
 * 
 * Focus:
 * 1. Degenerate Bézier Control Points (Collinear, Zero-Length, Overlapping, Cusps).
 * 2. Arc-Length Look-Up Table (LUT) Parameterization, Monotonicity, Out-of-Bounds & High Speed Traversal.
 * 3. Boss Galaga Escorted Dive Formation (0, 1, 2 wingmen, trajectory coherence, escort lifecycle & scoring).
 * 4. Formation Ingress Sub-Waves Dynamic Slot Anchoring & Return Docking Invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BezierCurve, QuadraticBezier, CompositeBezierPath } from '../../src/math/Bezier';
import { FormationManager } from '../../src/systems/FormationManager';
import { FlightPathManager } from '../../src/systems/FlightPathManager';
import { EnemyType, EnemyState } from '../../src/types';

describe('M4 Adversarial Challenge: Bézier Kinematics & Dive AI', () => {
  // ==========================================================================
  // 1. Degenerate Bézier Curve Evaluation
  // ==========================================================================
  describe('1. Degenerate Bézier Curve Evaluation', () => {
    it('handles zero-length point curve (P0 = P1 = P2 = P3) without NaN, Infinity or div-by-zero', () => {
      const p = { x: 42.5, y: 88.2 };
      const curve = new BezierCurve(p, p, p, p);

      // Arc length must be negligible (< 1e-9)
      expect(curve.length).toBeLessThan(1e-9);

      // Evaluation across various t must always yield the exact point
      const testTs = [-10, 0, 0.25, 0.5, 0.75, 1.0, 50];
      for (const t of testTs) {
        const pt = curve.evaluate(t);
        expect(pt.x).toBeCloseTo(p.x, 5);
        expect(pt.y).toBeCloseTo(p.y, 5);

        const d = curve.derivative(t);
        expect(Number.isNaN(d.x)).toBe(false);
        expect(Number.isNaN(d.y)).toBe(false);
        expect(Number.isFinite(d.x)).toBe(true);
        expect(Number.isFinite(d.y)).toBe(true);

        const tan = curve.tangent(t);
        expect(Number.isNaN(tan.x)).toBe(false);
        expect(Number.isNaN(tan.y)).toBe(false);
        // Tangent should fallback to default (0, 1)
        expect(tan.x).toBe(0);
        expect(tan.y).toBe(1);

        const head = curve.heading(t);
        expect(Number.isNaN(head)).toBe(false);
        expect(Number.isFinite(head)).toBe(true);
      }

      // distanceToT and sampleAtDistance must handle zero-length gracefully
      expect(curve.distanceToT(0)).toBe(0);
      expect(curve.distanceToT(100)).toBeLessThanOrEqual(1.0);

      const sample = curve.sampleAtDistance(50);
      expect(sample.position.x).toBeCloseTo(p.x, 5);
      expect(sample.position.y).toBeCloseTo(p.y, 5);
      expect(sample.distance).toBeLessThan(1e-9);
    });

    it('evaluates collinear horizontal, vertical and diagonal control points with exact chord distance', () => {
      // Horizontal collinear line from (10, 20) to (110, 20)
      const horiz = new BezierCurve(
        { x: 10, y: 20 },
        { x: 40, y: 20 },
        { x: 80, y: 20 },
        { x: 110, y: 20 }
      );
      expect(horiz.length).toBeCloseTo(100, 2);

      // Tangent must be strictly (1, 0) and heading must be atan2(0, 1) + PI/2 = PI/2
      for (let t = 0; t <= 1; t += 0.1) {
        const pt = horiz.evaluate(t);
        expect(pt.y).toBeCloseTo(20, 4);
        expect(pt.x).toBeGreaterThanOrEqual(10 - 1e-4);
        expect(pt.x).toBeLessThanOrEqual(110 + 1e-4);

        const tan = horiz.tangent(t);
        expect(tan.x).toBeCloseTo(1, 4);
        expect(tan.y).toBeCloseTo(0, 4);

        const head = horiz.heading(t);
        expect(head).toBeCloseTo(Math.PI / 2, 4);
      }

      // Vertical collinear line from (50, 10) to (50, 210) [Moving straight Down]
      const vert = new BezierCurve(
        { x: 50, y: 10 },
        { x: 50, y: 60 },
        { x: 50, y: 160 },
        { x: 50, y: 210 }
      );
      expect(vert.length).toBeCloseTo(200, 2);

      for (let t = 0; t <= 1; t += 0.1) {
        const pt = vert.evaluate(t);
        expect(pt.x).toBeCloseTo(50, 4);

        const tan = vert.tangent(t);
        expect(tan.x).toBeCloseTo(0, 4);
        expect(tan.y).toBeCloseTo(1, 4);

        // Facing down: heading is PI rad
        const head = vert.heading(t);
        expect(head).toBeCloseTo(Math.PI, 4);
      }

      // Diagonal collinear line from (0, 0) to (100, 100)
      const diag = new BezierCurve(
        { x: 0, y: 0 },
        { x: 25, y: 25 },
        { x: 75, y: 75 },
        { x: 100, y: 100 }
      );
      expect(diag.length).toBeCloseTo(100 * Math.SQRT2, 2);

      for (let t = 0; t <= 1; t += 0.1) {
        const pt = diag.evaluate(t);
        expect(pt.x).toBeCloseTo(pt.y, 4);

        const tan = diag.tangent(t);
        expect(tan.x).toBeCloseTo(Math.SQRT1_2, 4);
        expect(tan.y).toBeCloseTo(Math.SQRT1_2, 4);
      }
    });

    it('evaluates coincident start/control endpoints (P0 = P1 and P2 = P3) via singularity chord fallback', () => {
      // P0 == P1 at (0, 0), P2 == P3 at (100, 50)
      const curve = new BezierCurve(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        { x: 100, y: 50 }
      );

      // At t=0, analytical derivative is 3*(1-t)^2*(P1-P0) = 0.
      // Singularity guard must catch this and provide chord direction without NaN!
      const d0 = curve.derivative(0);
      expect(Number.isNaN(d0.x)).toBe(false);
      expect(Number.isNaN(d0.y)).toBe(false);
      expect(d0.x).toBeCloseTo(100, 2);
      expect(d0.y).toBeCloseTo(50, 2);

      const t0 = curve.tangent(0);
      const len0 = Math.sqrt(t0.x * t0.x + t0.y * t0.y);
      expect(len0).toBeCloseTo(1.0, 4);

      // At t=1, derivative with P3-P2=0 must also fallback to chord direction
      const d1 = curve.derivative(1);
      expect(d1.x).toBeCloseTo(100, 2);
      expect(d1.y).toBeCloseTo(50, 2);

      const t1 = curve.tangent(1);
      const len1 = Math.sqrt(t1.x * t1.x + t1.y * t1.y);
      expect(len1).toBeCloseTo(1.0, 4);
    });

    it('evaluates closed loop / self-overlapping teardrop trajectory (P0 = P3)', () => {
      const loop = new BezierCurve(
        { x: 100, y: 100 },
        { x: 50, y: 20 },
        { x: 150, y: 20 },
        { x: 100, y: 100 }
      );

      expect(loop.length).toBeGreaterThan(50);

      const pStart = loop.evaluate(0);
      const pEnd = loop.evaluate(1);
      expect(pStart.x).toBeCloseTo(pEnd.x, 4);
      expect(pStart.y).toBeCloseTo(pEnd.y, 4);

      // Tangent at start is directed up-left, tangent at end is directed down-left
      const t0 = loop.tangent(0);
      expect(t0.x).toBeLessThan(0);
      expect(t0.y).toBeLessThan(0);

      const t1 = loop.tangent(1);
      expect(t1.x).toBeLessThan(0);
      expect(t1.y).toBeGreaterThan(0);
    });

    it('evaluates Quadratic Bézier degenerate cases without instability', () => {
      // Degenerate single point
      const qPt = new QuadraticBezier({ x: 30, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 30 });
      expect(qPt.length).toBe(0);
      expect(qPt.evaluate(0.5)).toEqual({ x: 30, y: 30 });
      expect(qPt.tangent(0)).toEqual({ x: 0, y: 1 });

      // Overlapping P0 = P1
      const qCoincident = new QuadraticBezier({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 60, y: 80 });
      expect(qCoincident.length).toBeCloseTo(100, 2);
      const qD0 = qCoincident.derivative(0);
      expect(qD0.x).toBeCloseTo(60, 2);
      expect(qD0.y).toBeCloseTo(80, 2);
    });
  });

  // ==========================================================================
  // 2. Arc-Length Look-Up Table (LUT) Parameterization & Extreme Bounds
  // ==========================================================================
  describe('2. Arc-Length Look-Up Table (LUT) Parameterization & Extreme Bounds', () => {
    let curve: BezierCurve;

    beforeEach(() => {
      curve = new BezierCurve(
        { x: 10, y: 20 },
        { x: 80, y: 10 },
        { x: 140, y: 180 },
        { x: 200, y: 250 }
      );
    });

    it('guarantees strict monotonic progression of distanceToT across 1,000 sampling points', () => {
      const len = curve.length;
      expect(len).toBeGreaterThan(0);

      const samples = 1000;
      let prevT = 0;

      for (let i = 0; i <= samples; i++) {
        const dist = (i / samples) * len;
        const t = curve.distanceToT(dist);

        expect(t).toBeGreaterThanOrEqual(prevT - 1e-9);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1.0);
        prevT = t;
      }
    });

    it('safely clamps extreme out-of-bounds parameter t (t < 0, t > 1, huge values, -Infinity, Infinity)', () => {
      // Extreme negative t
      const evalNeg = curve.evaluate(-999999);
      expect(evalNeg.x).toBeCloseTo(curve.p0.x, 4);
      expect(evalNeg.y).toBeCloseTo(curve.p0.y, 4);

      // Extreme positive t
      const evalPos = curve.evaluate(999999);
      expect(evalPos.x).toBeCloseTo(curve.p3.x, 4);
      expect(evalPos.y).toBeCloseTo(curve.p3.y, 4);

      // Derivative clamping
      const dNeg = curve.derivative(-100);
      const d0 = curve.derivative(0);
      expect(dNeg.x).toBeCloseTo(d0.x, 4);
      expect(dNeg.y).toBeCloseTo(d0.y, 4);

      const dPos = curve.derivative(100);
      const d1 = curve.derivative(1);
      expect(dPos.x).toBeCloseTo(d1.x, 4);
      expect(dPos.y).toBeCloseTo(d1.y, 4);
    });

    it('exposes distance clamping behavior under out-of-bounds queries', () => {
      // Negative distance in distanceToT returns 0
      expect(curve.distanceToT(-500)).toBe(0);
      const sNeg = curve.sampleAtDistance(-500);
      expect(sNeg.position.x).toBeCloseTo(curve.p0.x, 4);
      expect(sNeg.position.y).toBeCloseTo(curve.p0.y, 4);
      expect(sNeg.distance).toBe(0);

      // Huge distance > total length in distanceToT returns 1.0
      expect(curve.distanceToT(1_000_000)).toBe(1.0);
      const sHuge = curve.sampleAtDistance(1_000_000);
      expect(sHuge.position.x).toBeCloseTo(curve.p3.x, 4);
      expect(sHuge.position.y).toBeCloseTo(curve.p3.y, 4);
      expect(sHuge.distance).toBeCloseTo(curve.length, 4);
    });

    it('handles ultra-high speed (100,000 px/s) trajectory updates in CompositeBezierPath without skipping bounds', () => {
      const seg1 = new BezierCurve({ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }, { x: 150, y: 100 });
      const seg2 = new BezierCurve({ x: 150, y: 100 }, { x: 180, y: 150 }, { x: 200, y: 200 }, { x: 224, y: 288 });

      // Extremely high speed: 100,000 px/s
      const ultraFastPath = new CompositeBezierPath('HYPER_SPEED', [
        { curve: seg1, speed: 100000 },
        { curve: seg2, speed: 100000 },
      ]);

      expect(ultraFastPath.totalDurationMs).toBeLessThan(10); // Less than 10ms total

      // Sample at 0ms
      const start = ultraFastPath.evaluateTime(0);
      expect(start.position.x).toBeCloseTo(0, 2);
      expect(start.position.y).toBeCloseTo(0, 2);
      expect(start.isComplete).toBe(false);

      // Sample at 100ms (way past completion)
      const end = ultraFastPath.evaluateTime(100);
      expect(end.position.x).toBeCloseTo(224, 2);
      expect(end.position.y).toBeCloseTo(288, 2);
      expect(end.isComplete).toBe(true);
      expect(end.segmentIndex).toBe(1);
    });

    it('handles tiny microsecond sub-steps (dt = 1e-6) without precision degradation or accumulation drift', () => {
      const seg = new BezierCurve({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 });
      const path = new CompositeBezierPath('MICRO_STEP', [{ curve: seg, durationMs: 1000 }]);

      let elapsed = 0;
      const microDt = 0.001; // 1 microsecond in ms = 0.001ms
      let prevDist = 0;

      for (let i = 0; i < 500; i++) {
        elapsed += microDt;
        const sample = path.evaluateTime(elapsed);
        expect(sample.distance).toBeGreaterThanOrEqual(prevDist - 1e-6);
        prevDist = sample.distance;
      }
    });
  });

  // ==========================================================================
  // 3. Boss Galaga Escorted Dive Formation & Wingman Rigidity Analysis
  // ==========================================================================
  describe('3. Boss Galaga Escorted Dive Formation & Wingman Rigidity Analysis', () => {
    let formation: FormationManager;

    beforeEach(() => {
      formation = new FormationManager();
      formation.spawnStage(1);
      formation.isEntryWaveActive = false; // Fast-forward ingress
    });

    it('peels off Solo Boss Galaga with 0 escorts awarding 400 pts on destruction', () => {
      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      expect(boss).toBeDefined();

      // Trigger Boss solo dive (pass empty escorts array)
      (formation as any).peelOffBossEscort(boss, [], 112);

      expect(boss.state).toBe(EnemyState.DIVING_ESCORT);
      expect(boss.escortCount).toBe(0);
      expect(boss.flightPath).not.toBeNull();

      // Score value during dive with 0 escorts = 400 pts
      expect(boss.getScoreValue()).toBe(400);

      // Hit 1: takes damage to 1 HP, score not awarded yet
      const hit1 = boss.takeDamage(1);
      expect(hit1.destroyed).toBe(false);
      expect(hit1.points).toBe(0);
      expect(boss.health).toBe(1);

      // Hit 2: destroyed, awards exactly 400 pts
      const hit2 = boss.takeDamage(1);
      expect(hit2.destroyed).toBe(true);
      expect(hit2.points).toBe(400);
    });

    it('verifies synchronized path duration between Boss and Goei wingman in escorted dives', () => {
      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      const goei = formation.enemies.find((e) => e.type === EnemyType.GOEI)!;

      boss.x = 100;
      boss.y = 52;
      goei.x = 84;
      goei.y = 68;

      (formation as any).peelOffBossEscort(boss, [goei], 112);

      expect(boss.flightPath).not.toBeNull();
      expect(goei.flightPath).not.toBeNull();

      const bossDuration = boss.flightPath!.totalDurationMs;
      const goeiDuration = goei.flightPath!.totalDurationMs;

      // Boss path and Goei wingman path have perfectly matching segment durations
      const durationDiff = Math.abs(bossDuration - goeiDuration);
      expect(durationDiff).toBeCloseTo(0, 4);
    });

    it('verifies synchronized screen wrap-around between Boss and Escort without separation', () => {
      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS && e.col === 4)!;
      const leftGoei = formation.enemies.find((e) => e.type === EnemyType.GOEI && e.col === 4)!;
      const rightGoei = formation.enemies.find((e) => e.type === EnemyType.GOEI && e.col === 5)!;

      (formation as any).peelOffBossEscort(boss, [leftGoei, rightGoei], 112);

      expect(boss.escortCount).toBe(2);
      expect(boss.getScoreValue()).toBe(1600);

      const dt = 1 / 60;
      let bossWrapFrame = -1;
      let leftGoeiWrapFrame = -1;

      for (let frame = 0; frame < 300; frame++) {
        boss.update(dt, 112, 250);
        leftGoei.update(dt, 112, 250);
        rightGoei.update(dt, 112, 250);

        if (bossWrapFrame === -1 && boss.state === EnemyState.RETURNING_TO_FORMATION) {
          bossWrapFrame = frame;
        }
        if (leftGoeiWrapFrame === -1 && leftGoei.state === EnemyState.RETURNING_TO_FORMATION) {
          leftGoeiWrapFrame = frame;
        }
      }

      // Both entities successfully complete dive and enter returning state synchronously on the exact same frame
      expect(bossWrapFrame).toBeGreaterThan(0);
      expect(leftGoeiWrapFrame).toBeGreaterThan(0);
      expect(bossWrapFrame).toBe(leftGoeiWrapFrame);
    });

    it('verifies dynamic escort count and accurate score value when escorts are killed mid-dive', () => {
      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      const goei = formation.enemies.find((e) => e.type === EnemyType.GOEI)!;

      (formation as any).peelOffBossEscort(boss, [goei], 112);
      expect(boss.escortCount).toBe(1);
      expect(boss.getScoreValue()).toBe(800);

      // Player destroys the escort Goei mid-flight
      const goeiDamage = goei.takeDamage(1);
      expect(goeiDamage.destroyed).toBe(true);
      expect(goei.state).toBe(EnemyState.EXPLODING);

      // Dynamic escort count tracking decrements boss.escortCount to 0
      // Arcade rule: 0 escorts remaining awards 400 pts
      expect(boss.escortCount).toBe(0);
      expect(boss.getScoreValue()).toBe(400);
    });
  });

  // ==========================================================================
  // 4. Formation Ingress Sub-Waves Dynamic Slot Anchoring & Continuity
  // ==========================================================================
  describe('4. Formation Ingress Sub-Waves Dynamic Slot Anchoring & Continuity', () => {
    let formation: FormationManager;

    beforeEach(() => {
      formation = new FormationManager();
    });

    it('verifies all 5 sub-wave entry paths anchor perfectly to harmonic slot destinations at diverse timestamps', () => {
      const subWaves: ('WAVE_1_TOP_CENTER' | 'WAVE_2_TOP_RIGHT' | 'WAVE_3_TOP_LEFT' | 'WAVE_4_BOTTOM_LEFT' | 'WAVE_5_BOTTOM_RIGHT')[] = [
        'WAVE_1_TOP_CENTER',
        'WAVE_2_TOP_RIGHT',
        'WAVE_3_TOP_LEFT',
        'WAVE_4_BOTTOM_LEFT',
        'WAVE_5_BOTTOM_RIGHT',
      ];

      const testTimestamps = [0.0, 0.5, 1.25, 2.75, 4.0];

      for (const waveType of subWaves) {
        for (const t of testTimestamps) {
          // Check slot (row: 2, col: 4)
          const targetSlot = formation.getSlotPosition(2, 4, t);
          const path = FlightPathManager.createEntryPath(waveType, 0, targetSlot);

          expect(path.segments.length).toBeGreaterThanOrEqual(2);
          expect(path.totalDurationMs).toBeGreaterThan(500);

          // The final sample of the composite path MUST land exactly on targetSlot
          const finalSample = path.evaluateTime(path.totalDurationMs);
          expect(finalSample.isComplete).toBe(true);
          expect(finalSample.position.x).toBeCloseTo(targetSlot.x, 2);
          expect(finalSample.position.y).toBeCloseTo(targetSlot.y, 2);

          // C0 continuity across segment boundaries: endpoint of Seg(i) == startpoint of Seg(i+1)
          for (let s = 0; s < path.segments.length - 1; s++) {
            const segCurr = path.segments[s]!;
            const segNext = path.segments[s + 1]!;

            const endCurr = segCurr.evaluate(1.0);
            const startNext = segNext.evaluate(0.0);

            expect(endCurr.x).toBeCloseTo(startNext.x, 3);
            expect(endCurr.y).toBeCloseTo(startNext.y, 3);
          }
        }
      }
    });

    it('validates entry paths for all 40 slots without off-screen clipping errors or singularities', () => {
      formation.spawnStage(1);

      for (const enemy of formation.enemies) {
        const slot = formation.getSlotPosition(enemy.row, enemy.col, 2.0);
        const path = FlightPathManager.createEntryPath('WAVE_1_TOP_CENTER', 0, slot);

        expect(path.totalLength).toBeGreaterThan(100);
        expect(path.totalDurationMs).toBeGreaterThan(500);

        // Sample along 20 discrete points on path
        for (let i = 0; i <= 20; i++) {
          const sample = path.evaluateTime((i / 20) * path.totalDurationMs);
          expect(Number.isFinite(sample.position.x)).toBe(true);
          expect(Number.isFinite(sample.position.y)).toBe(true);
          expect(Number.isFinite(sample.velocity.x)).toBe(true);
          expect(Number.isFinite(sample.velocity.y)).toBe(true);
          expect(Number.isFinite(sample.heading)).toBe(true);
        }
      }
    });
  });
});
