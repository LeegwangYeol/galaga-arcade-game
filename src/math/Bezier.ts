/**
 * Galaga Arcade Web Game — Cubic & Quadratic Bézier Evaluators and Spline System
 * 
 * Provides high-precision cubic & quadratic Bézier curve evaluation, analytical velocity
 * derivatives, tangent heading angles with sprite orientation offsets,
 * arc-length Look-Up Table (LUT) constant-speed parameterization, and
 * multi-segment composite spline paths.
 */

import type { Point2D, Vector2D } from '../types';

export interface CubicBezierPoints {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
}

export interface QuadraticBezierPoints {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
}

export interface CurveSample {
  position: Point2D;
  velocity: Vector2D;
  tangent: Vector2D;
  heading: number; // Radians: default with orientation offset (0 rad = UP / -Y)
  distance: number;
}

export class BezierCurve {
  public readonly p0: Point2D;
  public readonly p1: Point2D;
  public readonly p2: Point2D;
  public readonly p3: Point2D;

  private lutLength: number = 0;
  private readonly lutDistances: number[] = [];
  private readonly lutT: number[] = [];
  private static readonly LUT_SAMPLES = 32;

  constructor(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D) {
    this.p0 = { x: p0.x, y: p0.y };
    this.p1 = { x: p1.x, y: p1.y };
    this.p2 = { x: p2.x, y: p2.y };
    this.p3 = { x: p3.x, y: p3.y };
    this.buildArcLengthLUT();
  }

  /**
   * Evaluates curve position B(t) at parametric parameter t in [0, 1].
   */
  public evaluate(t: number): Point2D {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    const tt = clampedT * clampedT;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * clampedT;

    const x = uuu * this.p0.x + 3 * uu * clampedT * this.p1.x + 3 * u * tt * this.p2.x + ttt * this.p3.x;
    const y = uuu * this.p0.y + 3 * uu * clampedT * this.p1.y + 3 * u * tt * this.p2.y + ttt * this.p3.y;

    return { x, y };
  }

  /**
   * Computes analytical first derivative velocity vector B'(t).
   */
  public derivative(t: number): Vector2D {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;

    const c0 = 3 * u * u;
    const c1 = 6 * u * clampedT;
    const c2 = 3 * clampedT * clampedT;

    let dx = c0 * (this.p1.x - this.p0.x) + c1 * (this.p2.x - this.p1.x) + c2 * (this.p3.x - this.p2.x);
    let dy = c0 * (this.p1.y - this.p0.y) + c1 * (this.p2.y - this.p1.y) + c2 * (this.p3.y - this.p2.y);

    // Singularity guard: If derivative magnitude is near zero, fallback to chord direction
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      dx = this.p3.x - this.p0.x;
      dy = this.p3.y - this.p0.y;
    }

    return { x: dx, y: dy };
  }

  /**
   * Computes normalized tangent direction vector.
   */
  public tangent(t: number): Vector2D {
    const d = this.derivative(t);
    const len = Math.sqrt(d.x * d.x + d.y * d.y);
    if (len > 1e-6) {
      return { x: d.x / len, y: d.y / len };
    }
    return { x: 0, y: 1 };
  }

  /**
   * Computes sprite orientation angle theta(t).
   * Default offset Math.PI / 2 ensures unrotated (0 rad) sprite faces UP (-Y).
   */
  public heading(t: number, orientationOffsetRad: number = Math.PI / 2): number {
    const d = this.derivative(t);
    return Math.atan2(d.y, d.x) + orientationOffsetRad;
  }

  /**
   * Computes total arc-length of the curve segment.
   */
  public get length(): number {
    return this.lutLength;
  }

  /**
   * Converts a traversed arc-length distance s in [0, length] to parametric parameter t.
   */
  public distanceToT(distance: number): number {
    if (this.lutLength <= 0 || distance <= 0) return 0;
    if (distance >= this.lutLength) return 1;

    // Binary search in LUT
    let low = 0;
    let high = this.lutDistances.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const d = this.lutDistances[mid]!;
      if (d < distance) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx = Math.max(0, Math.min(this.lutDistances.length - 2, high));
    const d0 = this.lutDistances[idx]!;
    const d1 = this.lutDistances[idx + 1]!;
    const t0 = this.lutT[idx]!;
    const t1 = this.lutT[idx + 1]!;

    const fraction = d1 > d0 ? (distance - d0) / (d1 - d0) : 0;
    return t0 + (t1 - t0) * fraction;
  }

  /**
   * Samples position and heading at a specific traversed arc-length distance.
   */
  public sampleAtDistance(distance: number, orientationOffsetRad: number = Math.PI / 2): CurveSample {
    const t = this.distanceToT(distance);
    const position = this.evaluate(t);
    const velocity = this.derivative(t);
    const tan = this.tangent(t);
    const head = this.heading(t, orientationOffsetRad);

    return {
      position,
      velocity,
      tangent: tan,
      heading: head,
      distance: Math.min(distance, this.lutLength),
    };
  }

  /**
   * Precomputes cumulative arc-length look-up table.
   */
  private buildArcLengthLUT(): void {
    this.lutDistances.length = 0;
    this.lutT.length = 0;

    let prev = this.evaluate(0);
    let total = 0;

    this.lutDistances.push(0);
    this.lutT.push(0);

    const steps = BezierCurve.LUT_SAMPLES;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const curr = this.evaluate(t);
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      total += Math.sqrt(dx * dx + dy * dy);

      this.lutDistances.push(total);
      this.lutT.push(t);
      prev = curr;
    }

    this.lutLength = total;
  }
}

/**
 * Alias for Cubic Bézier Curve matching naming in specifications.
 */
export const CubicBezier = BezierCurve;
export type CubicBezier = BezierCurve;

/**
 * Quadratic Bézier Curve Evaluator (3 control points).
 */
export class QuadraticBezier {
  public readonly p0: Point2D;
  public readonly p1: Point2D;
  public readonly p2: Point2D;

  private lutLength: number = 0;
  private readonly lutDistances: number[] = [];
  private readonly lutT: number[] = [];
  private static readonly LUT_SAMPLES = 32;

  constructor(p0: Point2D, p1: Point2D, p2: Point2D) {
    this.p0 = { x: p0.x, y: p0.y };
    this.p1 = { x: p1.x, y: p1.y };
    this.p2 = { x: p2.x, y: p2.y };
    this.buildArcLengthLUT();
  }

  public evaluate(t: number): Point2D {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    const x = u * u * this.p0.x + 2 * u * clampedT * this.p1.x + clampedT * clampedT * this.p2.x;
    const y = u * u * this.p0.y + 2 * u * clampedT * this.p1.y + clampedT * clampedT * this.p2.y;
    return { x, y };
  }

  public derivative(t: number): Vector2D {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    let dx = 2 * u * (this.p1.x - this.p0.x) + 2 * clampedT * (this.p2.x - this.p1.x);
    let dy = 2 * u * (this.p1.y - this.p0.y) + 2 * clampedT * (this.p2.y - this.p1.y);

    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      dx = this.p2.x - this.p0.x;
      dy = this.p2.y - this.p0.y;
    }

    return { x: dx, y: dy };
  }

  public tangent(t: number): Vector2D {
    const d = this.derivative(t);
    const len = Math.sqrt(d.x * d.x + d.y * d.y);
    if (len > 1e-6) {
      return { x: d.x / len, y: d.y / len };
    }
    return { x: 0, y: 1 };
  }

  public heading(t: number, orientationOffsetRad: number = Math.PI / 2): number {
    const d = this.derivative(t);
    return Math.atan2(d.y, d.x) + orientationOffsetRad;
  }

  public get length(): number {
    return this.lutLength;
  }

  public distanceToT(distance: number): number {
    if (this.lutLength <= 0 || distance <= 0) return 0;
    if (distance >= this.lutLength) return 1;

    let low = 0;
    let high = this.lutDistances.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const d = this.lutDistances[mid]!;
      if (d < distance) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx = Math.max(0, Math.min(this.lutDistances.length - 2, high));
    const d0 = this.lutDistances[idx]!;
    const d1 = this.lutDistances[idx + 1]!;
    const t0 = this.lutT[idx]!;
    const t1 = this.lutT[idx + 1]!;

    const fraction = d1 > d0 ? (distance - d0) / (d1 - d0) : 0;
    return t0 + (t1 - t0) * fraction;
  }

  public sampleAtDistance(distance: number, orientationOffsetRad: number = Math.PI / 2): CurveSample {
    const t = this.distanceToT(distance);
    return {
      position: this.evaluate(t),
      velocity: this.derivative(t),
      tangent: this.tangent(t),
      heading: this.heading(t, orientationOffsetRad),
      distance: Math.min(distance, this.lutLength),
    };
  }

  private buildArcLengthLUT(): void {
    this.lutDistances.length = 0;
    this.lutT.length = 0;

    let prev = this.evaluate(0);
    let total = 0;

    this.lutDistances.push(0);
    this.lutT.push(0);

    const steps = QuadraticBezier.LUT_SAMPLES;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const curr = this.evaluate(t);
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      total += Math.sqrt(dx * dx + dy * dy);

      this.lutDistances.push(total);
      this.lutT.push(t);
      prev = curr;
    }

    this.lutLength = total;
  }
}

/**
 * Composite flight trajectory comprising multiple connected Bézier curves.
 */
export interface PathSegmentConfig {
  curve: BezierCurve | QuadraticBezier;
  speed?: number; // Pixels per second (optional constant speed)
  durationMs?: number; // Segment duration in milliseconds (optional fixed time)
}

export class CompositeBezierPath {
  public readonly id: string;
  public readonly segments: (BezierCurve | QuadraticBezier)[] = [];
  public readonly segmentLengths: number[] = [];
  public readonly segmentDurationsMs: number[] = [];
  public totalLength: number = 0;
  public totalDurationMs: number = 0;

  constructor(id: string, segmentConfigs: PathSegmentConfig[]) {
    this.id = id;
    for (const cfg of segmentConfigs) {
      this.segments.push(cfg.curve);
      const len = cfg.curve.length;
      this.segmentLengths.push(len);
      this.totalLength += len;

      let durMs = 1000;
      if (cfg.durationMs !== undefined && cfg.durationMs > 0) {
        durMs = cfg.durationMs;
      } else if (cfg.speed !== undefined && cfg.speed > 0) {
        durMs = (len / cfg.speed) * 1000;
      } else {
        durMs = (len / 150) * 1000; // Default 150 px/s
      }
      this.segmentDurationsMs.push(durMs);
      this.totalDurationMs += durMs;
    }
  }

  /**
   * Evaluates the path at elapsed time in milliseconds.
   */
  public evaluateTime(
    elapsedMs: number,
    orientationOffsetRad: number = Math.PI / 2
  ): CurveSample & { isComplete: boolean; segmentIndex: number } {
    if (this.segments.length === 0) {
      return {
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        tangent: { x: 0, y: 1 },
        heading: 0,
        distance: 0,
        isComplete: true,
        segmentIndex: 0,
      };
    }

    if (elapsedMs >= this.totalDurationMs) {
      const lastSegIdx = this.segments.length - 1;
      const lastSeg = this.segments[lastSegIdx]!;
      const sample = lastSeg.sampleAtDistance(lastSeg.length, orientationOffsetRad);
      return {
        ...sample,
        isComplete: true,
        segmentIndex: lastSegIdx,
      };
    }

    let accumulatedMs = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const segDur = this.segmentDurationsMs[i]!;
      if (elapsedMs < accumulatedMs + segDur || i === this.segments.length - 1) {
        const segElapsedMs = Math.max(0, elapsedMs - accumulatedMs);
        const segFraction = segDur > 0 ? segElapsedMs / segDur : 1;
        const seg = this.segments[i]!;
        const targetDist = segFraction * seg.length;
        const sample = seg.sampleAtDistance(targetDist, orientationOffsetRad);

        return {
          ...sample,
          isComplete: false,
          segmentIndex: i,
        };
      }
      accumulatedMs += segDur;
    }

    const lastSeg = this.segments[this.segments.length - 1]!;
    return {
      ...lastSeg.sampleAtDistance(lastSeg.length, orientationOffsetRad),
      isComplete: true,
      segmentIndex: this.segments.length - 1,
    };
  }
}
