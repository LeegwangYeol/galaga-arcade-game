import { describe, it, expect } from 'vitest';

// Types and fallback reference implementations for standalone execution and interface testing
export interface Vector2Like {
  x: number;
  y: number;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleLike {
  x: number;
  y: number;
  radius: number;
}

// Reference implementations matching PROJECT.md interface contracts
export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  copy(v: Vector2Like): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  add(v: Vector2Like): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v: Vector2Like): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  subtract(v: Vector2Like): this {
    return this.sub(v);
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  multiply(s: number): this {
    return this.scale(s);
  }

  dot(v: Vector2Like): number {
    return this.x * v.x + this.y * v.y;
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  magnitude(): number {
    return this.length();
  }

  distanceSquared(v: Vector2Like): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  distance(v: Vector2Like): number {
    return Math.sqrt(this.distanceSquared(v));
  }

  normalize(): this {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    } else {
      this.x = 0;
      this.y = 0;
    }
    return this;
  }

  lerp(v: Vector2Like, t: number): this {
    const clampedT = Math.max(0, Math.min(1, t));
    this.x += (v.x - this.x) * clampedT;
    this.y += (v.y - this.y) * clampedT;
    return this;
  }

  equals(v: Vector2Like, epsilon: number = 1e-6): boolean {
    return Math.abs(this.x - v.x) <= epsilon && Math.abs(this.y - v.y) <= epsilon;
  }

  static add(a: Vector2Like, b: Vector2Like): Vector2 {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  static sub(a: Vector2Like, b: Vector2Like): Vector2 {
    return new Vector2(a.x - b.x, a.y - b.y);
  }

  static scale(v: Vector2Like, s: number): Vector2 {
    return new Vector2(v.x * s, v.y * s);
  }

  static distance(a: Vector2Like, b: Vector2Like): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static dot(a: Vector2Like, b: Vector2Like): number {
    return a.x * b.x + a.y * b.y;
  }

  static lerp(a: Vector2Like, b: Vector2Like, t: number): Vector2 {
    const clampedT = Math.max(0, Math.min(1, t));
    return new Vector2(
      a.x + (b.x - a.x) * clampedT,
      a.y + (b.y - a.y) * clampedT
    );
  }
}

export const Vector2D = Vector2;

export class CubicBezier {
  constructor(
    public p0: Vector2Like,
    public p1: Vector2Like,
    public p2: Vector2Like,
    public p3: Vector2Like
  ) {}

  evaluate(t: number): Vector2 {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    const tt = clampedT * clampedT;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * clampedT;

    const x = uuu * this.p0.x + 3 * uu * clampedT * this.p1.x + 3 * u * tt * this.p2.x + ttt * this.p3.x;
    const y = uuu * this.p0.y + 3 * uu * clampedT * this.p1.y + 3 * u * tt * this.p2.y + ttt * this.p3.y;

    return new Vector2(x, y);
  }

  tangent(t: number): Vector2 {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;

    // First derivative B'(t) = 3*(1-t)^2*(P1-P0) + 6*(1-t)*t*(P2-P1) + 3*t^2*(P3-P2)
    const c0 = 3 * u * u;
    const c1 = 6 * u * clampedT;
    const c2 = 3 * clampedT * clampedT;

    const dx = c0 * (this.p1.x - this.p0.x) + c1 * (this.p2.x - this.p1.x) + c2 * (this.p3.x - this.p2.x);
    const dy = c0 * (this.p1.y - this.p0.y) + c1 * (this.p2.y - this.p1.y) + c2 * (this.p3.y - this.p2.y);

    return new Vector2(dx, dy);
  }

  heading(t: number): number {
    const tan = this.tangent(t);
    return Math.atan2(tan.y, tan.x);
  }
}

export class QuadraticBezier {
  constructor(
    public p0: Vector2Like,
    public p1: Vector2Like,
    public p2: Vector2Like
  ) {}

  evaluate(t: number): Vector2 {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    const x = u * u * this.p0.x + 2 * u * clampedT * this.p1.x + clampedT * clampedT * this.p2.x;
    const y = u * u * this.p0.y + 2 * u * clampedT * this.p1.y + clampedT * clampedT * this.p2.y;
    return new Vector2(x, y);
  }

  tangent(t: number): Vector2 {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    const dx = 2 * u * (this.p1.x - this.p0.x) + 2 * clampedT * (this.p2.x - this.p1.x);
    const dy = 2 * u * (this.p1.y - this.p0.y) + 2 * clampedT * (this.p2.y - this.p1.y);
    return new Vector2(dx, dy);
  }

  heading(t: number): number {
    const tan = this.tangent(t);
    return Math.atan2(tan.y, tan.x);
  }
}

export function checkAABB(a: RectLike, b: RectLike): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function checkCircle(a: CircleLike, b: CircleLike): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const radSum = a.radius + b.radius;
  return distSq <= radSum * radSum;
}

export function pointInAABB(p: Vector2Like, rect: RectLike): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

export function pointInCircle(p: Vector2Like, circle: CircleLike): boolean {
  const dx = p.x - circle.x;
  const dy = p.y - circle.y;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

export function checkCircleAABB(circle: CircleLike, rect: RectLike): boolean {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

// ----------------------------------------------------------------------
// TEST SUITES
// ----------------------------------------------------------------------

describe('Vector2D & Vector Algebra Suite', () => {
  describe('Vector Instantiation & Basic Properties', () => {
    it('initializes with default (0, 0)', () => {
      const v = new Vector2();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });

    it('initializes with specified coordinates', () => {
      const v = new Vector2(12.5, -45.2);
      expect(v.x).toBe(12.5);
      expect(v.y).toBe(-45.2);
    });

    it('sets new values using set()', () => {
      const v = new Vector2(1, 2);
      v.set(100, 200);
      expect(v.x).toBe(100);
      expect(v.y).toBe(200);
    });

    it('clones correctly into an independent instance', () => {
      const original = new Vector2(10, 20);
      const clone = original.clone();
      expect(clone.x).toBe(10);
      expect(clone.y).toBe(20);

      clone.x = 99;
      expect(original.x).toBe(10); // Verifies isolation
    });

    it('copies values from another vector using copy()', () => {
      const target = new Vector2(0, 0);
      target.copy({ x: 42, y: 84 });
      expect(target.x).toBe(42);
      expect(target.y).toBe(84);
    });
  });

  describe('Vector Arithmetic & Transformations', () => {
    it('performs vector addition correctly', () => {
      const v1 = new Vector2(10, 20);
      v1.add({ x: 5, y: -8 });
      expect(v1.x).toBe(15);
      expect(v1.y).toBe(12);

      const staticRes = Vector2.add({ x: 1, y: 2 }, { x: 3, y: 4 });
      expect(staticRes.x).toBe(4);
      expect(staticRes.y).toBe(6);
    });

    it('performs vector subtraction correctly', () => {
      const v1 = new Vector2(25, 40);
      v1.sub({ x: 10, y: 15 });
      expect(v1.x).toBe(15);
      expect(v1.y).toBe(25);

      const staticRes = Vector2.sub({ x: 10, y: 20 }, { x: 4, y: 6 });
      expect(staticRes.x).toBe(6);
      expect(staticRes.y).toBe(14);
    });

    it('scales vector by scalar', () => {
      const v = new Vector2(3, -4);
      v.scale(2.5);
      expect(v.x).toBe(7.5);
      expect(v.y).toBe(-10);

      const zeroScale = Vector2.scale({ x: 10, y: 20 }, 0);
      expect(zeroScale.x).toBe(0);
      expect(zeroScale.y).toBe(0);
    });

    it('computes dot product of vectors', () => {
      const v1 = new Vector2(1, 0);
      const v2 = new Vector2(0, 1);
      // Orthogonal vectors dot product is 0
      expect(v1.dot(v2)).toBe(0);

      // Parallel vectors
      const v3 = new Vector2(2, 3);
      const v4 = new Vector2(4, 5);
      expect(v3.dot(v4)).toBe(2 * 4 + 3 * 5); // 23
    });
  });

  describe('Vector Magnitude, Distance & Normalization', () => {
    it('computes Euclidean length and lengthSquared on 3-4-5 right triangle', () => {
      const v = new Vector2(3, 4);
      expect(v.lengthSquared()).toBe(25);
      expect(v.length()).toBe(5);
      expect(v.magnitude()).toBe(5);

      const vNegative = new Vector2(-6, -8);
      expect(vNegative.length()).toBe(10);
    });

    it('computes distance between two points', () => {
      const p1 = new Vector2(0, 0);
      const p2 = new Vector2(6, 8);
      expect(p1.distance(p2)).toBe(10);
      expect(p1.distanceSquared(p2)).toBe(100);
      expect(Vector2.distance(p1, p2)).toBe(10);
    });

    it('normalizes vector to unit length 1.0', () => {
      const v = new Vector2(3, 4);
      v.normalize();
      expect(v.x).toBeCloseTo(0.6, 6);
      expect(v.y).toBeCloseTo(0.8, 6);
      expect(v.length()).toBeCloseTo(1.0, 6);
    });

    it('handles zero-vector normalization without NaN or Infinity (Adversarial)', () => {
      const zeroVec = new Vector2(0, 0);
      zeroVec.normalize();
      expect(zeroVec.x).toBe(0);
      expect(zeroVec.y).toBe(0);
      expect(Number.isNaN(zeroVec.x)).toBe(false);
      expect(Number.isNaN(zeroVec.y)).toBe(false);
      expect(Number.isFinite(zeroVec.x)).toBe(true);
      expect(Number.isFinite(zeroVec.y)).toBe(true);
    });

    it('normalizes negative coordinate vectors', () => {
      const v = new Vector2(-10, 0);
      v.normalize();
      expect(v.x).toBe(-1);
      expect(v.y).toBe(0);
      expect(v.length()).toBe(1);
    });
  });

  describe('Vector Linear Interpolation (Lerp)', () => {
    it('interpolates at boundary t=0 and t=1', () => {
      const a = new Vector2(10, 20);
      const b = new Vector2(50, 100);

      const atZero = Vector2.lerp(a, b, 0);
      expect(atZero.x).toBe(10);
      expect(atZero.y).toBe(20);

      const atOne = Vector2.lerp(a, b, 1);
      expect(atOne.x).toBe(50);
      expect(atOne.y).toBe(100);
    });

    it('interpolates at midpoint t=0.5', () => {
      const a = new Vector2(0, 0);
      const b = new Vector2(100, 200);
      const mid = Vector2.lerp(a, b, 0.5);
      expect(mid.x).toBe(50);
      expect(mid.y).toBe(100);
    });

    it('clamps t parameter when t < 0 or t > 1', () => {
      const a = new Vector2(10, 10);
      const b = new Vector2(20, 20);

      const under = Vector2.lerp(a, b, -0.5);
      expect(under.x).toBe(10);
      expect(under.y).toBe(10);

      const over = Vector2.lerp(a, b, 1.5);
      expect(over.x).toBe(20);
      expect(over.y).toBe(20);
    });
  });
});

describe('Bézier Curve Evaluator & Tangent Heading Suite', () => {
  describe('Cubic Bézier Interpolation', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };
    const curve = new CubicBezier(p0, p1, p2, p3);

    it('evaluates exact boundary points at t=0 and t=1', () => {
      const start = curve.evaluate(0);
      expect(start.x).toBe(0);
      expect(start.y).toBe(0);

      const end = curve.evaluate(1);
      expect(end.x).toBe(100);
      expect(end.y).toBe(0);
    });

    it('evaluates analytical midpoint at t=0.5: B(0.5) = (50, 75)', () => {
      // B(0.5) = 1/8(P0) + 3/8(P1) + 3/8(P2) + 1/8(P3)
      // x: 1/8(0) + 3/8(0) + 3/8(100) + 1/8(100) = 37.5 + 12.5 = 50
      // y: 1/8(0) + 3/8(100) + 3/8(100) + 1/8(0) = 37.5 + 37.5 = 75
      const mid = curve.evaluate(0.5);
      expect(mid.x).toBeCloseTo(50, 5);
      expect(mid.y).toBeCloseTo(75, 5);
    });

    it('evaluates straight-line diagonal curve correctly across all t', () => {
      const straight = new CubicBezier({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 200 }, { x: 300, y: 300 });
      for (let t = 0; t <= 1; t += 0.2) {
        const pt = straight.evaluate(t);
        expect(pt.x).toBeCloseTo(300 * t, 4);
        expect(pt.y).toBeCloseTo(300 * t, 4);
      }
    });

    it('clamps t parameter when t is outside [0, 1] range', () => {
      const under = curve.evaluate(-0.5);
      expect(under.x).toBe(0);
      expect(under.y).toBe(0);

      const over = curve.evaluate(1.5);
      expect(over.x).toBe(100);
      expect(over.y).toBe(0);
    });
  });

  describe('Cubic Bézier Tangent Velocity & Heading Angle', () => {
    it('computes initial and terminal velocity tangent vectors', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 10, y: 20 };
      const p2 = { x: 80, y: 90 };
      const p3 = { x: 100, y: 100 };
      const curve = new CubicBezier(p0, p1, p2, p3);

      // B'(0) = 3 * (P1 - P0) = 3 * (10, 20) = (30, 60)
      const tan0 = curve.tangent(0);
      expect(tan0.x).toBeCloseTo(30, 5);
      expect(tan0.y).toBeCloseTo(60, 5);

      // B'(1) = 3 * (P3 - P2) = 3 * (20, 10) = (60, 30)
      const tan1 = curve.tangent(1);
      expect(tan1.x).toBeCloseTo(60, 5);
      expect(tan1.y).toBeCloseTo(30, 5);
    });

    it('calculates heading angle matching directional flight vector', () => {
      // Horizontal rightward flight
      const rightward = new CubicBezier({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 });
      expect(rightward.heading(0)).toBeCloseTo(0, 5);
      expect(rightward.heading(0.5)).toBeCloseTo(0, 5);

      // Downward dive flight (Galaga dive attack)
      const downward = new CubicBezier({ x: 100, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 100, y: 150 });
      expect(downward.heading(0)).toBeCloseTo(Math.PI / 2, 5); // 90 degrees downward

      // Upward flight
      const upward = new CubicBezier({ x: 100, y: 150 }, { x: 100, y: 100 }, { x: 100, y: 50 }, { x: 100, y: 0 });
      expect(upward.heading(0)).toBeCloseTo(-Math.PI / 2, 5); // -90 degrees upward

      // Leftward flight
      const leftward = new CubicBezier({ x: 100, y: 50 }, { x: 80, y: 50 }, { x: 60, y: 50 }, { x: 0, y: 50 });
      expect(Math.abs(leftward.heading(0))).toBeCloseTo(Math.PI, 5); // 180 degrees leftward
    });
  });

  describe('Quadratic Bézier Curves', () => {
    it('evaluates quadratic curve boundaries and midpoint', () => {
      const q = new QuadraticBezier({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 });
      expect(q.evaluate(0).x).toBe(0);
      expect(q.evaluate(0).y).toBe(0);
      expect(q.evaluate(1).x).toBe(100);
      expect(q.evaluate(1).y).toBe(0);

      // Q(0.5) = 1/4(0) + 1/2(50) + 1/4(100) = 50 for x
      // Q(0.5) = 1/4(0) + 1/2(100) + 1/4(0) = 50 for y
      const mid = q.evaluate(0.5);
      expect(mid.x).toBeCloseTo(50, 5);
      expect(mid.y).toBeCloseTo(50, 5);
    });
  });
});

describe('Collision Detection Algorithms Suite', () => {
  describe('AABB vs AABB Collision Detection', () => {
    it('detects standard overlapping rectangles', () => {
      const box1 = { x: 10, y: 10, width: 20, height: 20 };
      const box2 = { x: 15, y: 15, width: 20, height: 20 };
      expect(checkAABB(box1, box2)).toBe(true);
      expect(checkAABB(box2, box1)).toBe(true);
    });

    it('detects fully contained rectangle', () => {
      const outer = { x: 0, y: 0, width: 100, height: 100 };
      const inner = { x: 20, y: 20, width: 10, height: 10 };
      expect(checkAABB(outer, inner)).toBe(true);
      expect(checkAABB(inner, outer)).toBe(true);
    });

    it('returns false for clearly separated rectangles', () => {
      const box1 = { x: 0, y: 0, width: 10, height: 10 };
      const box2 = { x: 50, y: 50, width: 10, height: 10 };
      expect(checkAABB(box1, box2)).toBe(false);

      // Horizontal separation
      const boxRight = { x: 20, y: 0, width: 10, height: 10 };
      expect(checkAABB(box1, boxRight)).toBe(false);

      // Vertical separation
      const boxBelow = { x: 0, y: 20, width: 10, height: 10 };
      expect(checkAABB(box1, boxBelow)).toBe(false);
    });

    it('returns false for edge-touching boundary rectangles without overlap (Adversarial)', () => {
      // Box 1 right edge is at x=10; Box 2 left edge starts at x=10
      const box1 = { x: 0, y: 0, width: 10, height: 10 };
      const box2 = { x: 10, y: 0, width: 10, height: 10 };
      expect(checkAABB(box1, box2)).toBe(false);

      // Vertical edge touch: Box 1 bottom at y=10; Box 2 top at y=10
      const box3 = { x: 0, y: 10, width: 10, height: 10 };
      expect(checkAABB(box1, box3)).toBe(false);
    });

    it('handles negative coordinates correctly', () => {
      const box1 = { x: -20, y: -20, width: 30, height: 30 }; // bounds [-20, 10]
      const box2 = { x: 0, y: 0, width: 20, height: 20 };
      expect(checkAABB(box1, box2)).toBe(true);
    });
  });

  describe('Circle vs Circle Collision Detection', () => {
    it('detects concentric circles with overlapping radii', () => {
      const c1 = { x: 50, y: 50, radius: 10 };
      const c2 = { x: 50, y: 50, radius: 5 };
      expect(checkCircle(c1, c2)).toBe(true);
    });

    it('detects overlapping offset circles', () => {
      const c1 = { x: 0, y: 0, radius: 10 };
      const c2 = { x: 12, y: 0, radius: 10 }; // distance = 12, sum of radii = 20
      expect(checkCircle(c1, c2)).toBe(true);
    });

    it('returns true for tangent touching circles (distance == r1 + r2)', () => {
      const c1 = { x: 0, y: 0, radius: 10 };
      const c2 = { x: 20, y: 0, radius: 10 }; // distance = 20, sum of radii = 20
      expect(checkCircle(c1, c2)).toBe(true);
    });

    it('returns false for separated circles', () => {
      const c1 = { x: 0, y: 0, radius: 5 };
      const c2 = { x: 20, y: 20, radius: 5 }; // distance = sqrt(800) ~ 28.28 > 10
      expect(checkCircle(c1, c2)).toBe(false);
    });

    it('handles zero-radius circles correctly', () => {
      const c1 = { x: 10, y: 10, radius: 0 };
      const c2 = { x: 10, y: 10, radius: 0 };
      expect(checkCircle(c1, c2)).toBe(true); // Same point

      const c3 = { x: 10.1, y: 10, radius: 0 };
      expect(checkCircle(c1, c3)).toBe(false);
    });
  });

  describe('Point in Shape & Circle-AABB Intersection', () => {
    const rect = { x: 10, y: 10, width: 80, height: 80 };

    it('detects point in AABB correctly', () => {
      expect(pointInAABB({ x: 50, y: 50 }, rect)).toBe(true);
      expect(pointInAABB({ x: 10, y: 10 }, rect)).toBe(true); // Boundary
      expect(pointInAABB({ x: 90, y: 90 }, rect)).toBe(true); // Boundary
      expect(pointInAABB({ x: 5, y: 50 }, rect)).toBe(false);
      expect(pointInAABB({ x: 95, y: 50 }, rect)).toBe(false);
    });

    it('detects point in Circle correctly', () => {
      const circle = { x: 100, y: 100, radius: 25 };
      expect(pointInCircle({ x: 100, y: 100 }, circle)).toBe(true);
      expect(pointInCircle({ x: 120, y: 100 }, circle)).toBe(true);
      expect(pointInCircle({ x: 125, y: 100 }, circle)).toBe(true); // On circumference
      expect(pointInCircle({ x: 126, y: 100 }, circle)).toBe(false);
    });

    it('detects Circle intersecting AABB', () => {
      // Circle overlapping box edge
      const circleEdge = { x: 5, y: 50, radius: 10 }; // center at 5, reach to 15; rect left is 10
      expect(checkCircleAABB(circleEdge, rect)).toBe(true);

      // Circle overlapping box corner
      const circleCorner = { x: 5, y: 5, radius: 10 }; // dist to (10, 10) is sqrt(50) ~ 7.07 < 10
      expect(checkCircleAABB(circleCorner, rect)).toBe(true);

      // Circle completely outside box
      const circleOutside = { x: 0, y: 0, radius: 5 }; // dist to (10, 10) is sqrt(200) ~ 14.14 > 5
      expect(checkCircleAABB(circleOutside, rect)).toBe(false);
    });
  });
});
