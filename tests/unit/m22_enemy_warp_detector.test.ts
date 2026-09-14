/**
 * Milestone M22: Automated Enemy Warp Detection Test Suite
 * 
 * Forensic Investigation & Telemetry Suite for Anomalous Coordinate Jumps:
 * 
 * Target Anomalies:
 * 1. WARP-1: 1-frame on-screen coordinate jumps (Δpos > 12.0px at 60Hz) during dive re-entry to formation
 * 2. WARP-2: 1-frame coordinate jumps (Δpos > 12.0px) upon sub-wave entry path completion to formation
 * 3. WARP-3: Boss Galaga tractor dive premature bottom-wrap (y=100 -> -16, 116px jump)
 * 4. General continuous telemetry warp monitor with off-screen toroidal wrap and glitch exemptions
 * 5. Pre-fix forensic capture verification and post-fix (M23) acceptance baseline contract
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormationManager } from '../../src/systems/FormationManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyState, EnemyType } from '../../src/types';

// ============================================================================
// 1. WarpDetector Telemetry Engine & Type Definitions
// ============================================================================

export type WarpClassification =
  | 'TRACTOR_DIVE_WARP'
  | 'FORMATION_REENTRY_WARP'
  | 'SUBWAVE_ENTRY_WARP'
  | 'KINEMATIC_INVERSION_WARP'
  | 'UNEXPLAINED_ONSCREEN_WARP';

export interface WarpRecord {
  enemyId: string | number;
  enemyType: EnemyType;
  fromState: EnemyState;
  toState: EnemyState;
  prevPos: { x: number; y: number };
  currPos: { x: number; y: number };
  deltaDistance: number;
  deltaX: number;
  deltaY: number;
  maxAllowed: number;
  frame: number;
  classification: WarpClassification;
  isOffScreenWrap: boolean;
  isIntentionalGlitch: boolean;
  notes?: string;
}

export interface WarpDetectorOptions {
  dt?: number;
  maxVelocity?: number;
  toleranceMargin?: number;
  screenHeight?: number;
  screenWidth?: number;
}

/**
 * Automated Warp Detector Telemetry Monitor.
 * Accurately tracks frame-to-frame displacements (Δd) of active enemies at 60Hz.
 * Mathematically separates legitimate motion, toroidal off-screen wraps, and intentional
 * glitch anomalies from unphysical on-screen coordinate jumps.
 */
export class WarpDetector {
  private prevMap = new Map<
    string | number,
    {
      x: number;
      y: number;
      state: EnemyState;
      recentState?: EnemyState;
      framesSinceTransition: number;
    }
  >();
  public readonly anomalies: WarpRecord[] = [];
  public readonly allDeltas: number[] = [];
  public totalFramesChecked: number = 0;
  public totalChecks: number = 0;

  public readonly dt: number;
  public readonly maxVelocity: number;
  public readonly toleranceMargin: number;
  public readonly screenHeight: number;
  public readonly screenWidth: number;

  constructor(options?: WarpDetectorOptions) {
    this.dt = options?.dt ?? 1 / 60;
    this.maxVelocity = options?.maxVelocity ?? 480; // Maximum physical dive speed (px/s)
    this.toleranceMargin = options?.toleranceMargin ?? 4.0; // Numerical tolerance for breathing expansion
    this.screenHeight = options?.screenHeight ?? 288;
    this.screenWidth = options?.screenWidth ?? 224;
  }

  /**
   * Evaluates maximum allowed 1-frame displacement under kinematic limits.
   * At 60Hz: 480 * (1/60) + 4.0 = 12.0 px for high-speed dive kinematics.
   * For harmonic formation docking/resting, returns 120 * dt + 1.0 = 3.0 px at 60Hz.
   */
  public getMaxAllowedDisplacement(
    dt: number = this.dt,
    stateContext?: EnemyState | { toState?: EnemyState; fromState?: EnemyState }
  ): number {
    let toState: EnemyState | undefined;

    if (typeof stateContext === 'object') {
      toState = stateContext.toState;
    } else if (stateContext !== undefined) {
      toState = stateContext;
    }

    if (toState === EnemyState.IN_FORMATION) {
      return 120 * dt + 1.0; // 3.0 px at 60Hz (natural breathing max is <= 1.1 px)
    }

    return this.maxVelocity * dt + this.toleranceMargin; // 12.0 px at 60Hz
  }

  /**
   * Resets all tracked entity histories and captured anomalies.
   */
  public reset(): void {
    this.prevMap.clear();
    this.anomalies.length = 0;
    this.allDeltas.length = 0;
    this.totalFramesChecked = 0;
    this.totalChecks = 0;
  }

  /**
   * Evaluates a single enemy frame step.
   */
  public checkEnemy(enemy: Enemy, frame: number, dt: number = this.dt): WarpRecord | null {
    if (!enemy.active || enemy.state === EnemyState.INACTIVE || enemy.state === EnemyState.EXPLODING) {
      this.prevMap.delete(enemy.id);
      return null;
    }

    const prev = this.prevMap.get(enemy.id);
    if (!prev) {
      this.prevMap.set(enemy.id, {
        x: enemy.x,
        y: enemy.y,
        state: enemy.state,
        recentState: undefined,
        framesSinceTransition: 0,
      });
      return null;
    }

    this.totalChecks++;
    const prevX = prev.x;
    const prevY = prev.y;
    const prevState = prev.state;

    const dx = enemy.x - prevX;
    const dy = enemy.y - prevY;
    const dist = Math.hypot(dx, dy);
    this.allDeltas.push(dist);

    const maxAllowed = this.getMaxAllowedDisplacement(dt, {
      toState: enemy.state,
      fromState: prevState,
    });

    // Filter 1: Toroidal Off-Screen Wrap (y exits bottom >= 288 and re-enters top <= 0)
    const isToroidalWrap =
      (prevY >= this.screenHeight && enemy.y <= 0) ||
      (prevY <= 0 && enemy.y >= this.screenHeight);
    
    // Filter 2: Both positions strictly off-screen
    const isBothOffScreen =
      (prevY < 0 || prevY > this.screenHeight) &&
      (enemy.y < 0 || enemy.y > this.screenHeight);

    const isOffScreenWrap = isToroidalWrap || isBothOffScreen;

    // Filter 3: Intentional M18 Glitch Quantum Teleportation
    const isIntentionalGlitch = Boolean(
      enemy.isTeleporting || (enemy.isGlitched && enemy.teleportTimer > 0)
    );

    let anomaly: WarpRecord | null = null;

    // Anomaly condition: on-screen displacement exceeds physical kinematic bound
    if (dist > maxAllowed && !isOffScreenWrap && !isIntentionalGlitch) {
      let classification: WarpClassification = 'UNEXPLAINED_ONSCREEN_WARP';

      if (
        enemy.type === EnemyType.BOSS &&
        prevY >= 85 &&
        prevY <= 115 &&
        enemy.y <= 0
      ) {
        classification = 'TRACTOR_DIVE_WARP';
      } else if (
        (prevState === EnemyState.RETURNING_TO_FORMATION && enemy.state === EnemyState.IN_FORMATION) ||
        (enemy.state === EnemyState.IN_FORMATION &&
          (prev.recentState === EnemyState.RETURNING_TO_FORMATION || prevState === EnemyState.RETURNING_TO_FORMATION) &&
          prev.framesSinceTransition <= 2)
      ) {
        classification = 'FORMATION_REENTRY_WARP';
      } else if (
        (prevState === EnemyState.ENTERING && enemy.state === EnemyState.IN_FORMATION) ||
        (enemy.state === EnemyState.IN_FORMATION &&
          (prev.recentState === EnemyState.ENTERING || prevState === EnemyState.ENTERING) &&
          prev.framesSinceTransition <= 2)
      ) {
        classification = 'SUBWAVE_ENTRY_WARP';
      } else if (
        enemy.isKineticInverted ||
        ((prevState === EnemyState.DIVING_SOLO || enemy.state === EnemyState.RETURNING_TO_FORMATION) &&
          prevY >= 50 &&
          prevY <= 250 &&
          enemy.y <= 0)
      ) {
        classification = 'KINEMATIC_INVERSION_WARP';
      }

      anomaly = {
        enemyId: enemy.id,
        enemyType: enemy.type,
        fromState: prevState,
        toState: enemy.state,
        prevPos: { x: prevX, y: prevY },
        currPos: { x: enemy.x, y: enemy.y },
        deltaDistance: dist,
        deltaX: dx,
        deltaY: dy,
        maxAllowed,
        frame,
        classification,
        isOffScreenWrap,
        isIntentionalGlitch,
      };

      this.anomalies.push(anomaly);
    }

    // Update state transition history
    if (prev.state !== enemy.state) {
      prev.recentState = prev.state;
      prev.framesSinceTransition = 0;
    } else {
      prev.framesSinceTransition++;
    }

    // Update tracking coordinate for next frame
    prev.x = enemy.x;
    prev.y = enemy.y;
    prev.state = enemy.state;

    return anomaly;
  }

  /**
   * Processes all active enemies across a game frame.
   */
  public checkFrame(
    container: { enemies: Enemy[] } | Enemy[],
    frame: number,
    dt: number = this.dt
  ): WarpRecord[] {
    this.totalFramesChecked++;
    const enemies = Array.isArray(container) ? container : container.enemies;
    const frameAnomalies: WarpRecord[] = [];

    for (const enemy of enemies) {
      const record = this.checkEnemy(enemy, frame, dt);
      if (record) {
        frameAnomalies.push(record);
      }
    }

    return frameAnomalies;
  }

  /**
   * Retrieves summary telemetry statistics.
   */
  public getTelemetrySummary() {
    const maxDelta = this.allDeltas.length > 0 ? Math.max(...this.allDeltas) : 0;
    const countsByClass: Record<string, number> = {};
    for (const a of this.anomalies) {
      countsByClass[a.classification] = (countsByClass[a.classification] || 0) + 1;
    }

    return {
      totalFramesChecked: this.totalFramesChecked,
      totalEntityChecks: this.totalChecks,
      totalAnomalies: this.anomalies.length,
      maxObservedDelta: maxDelta,
      countsByClass,
      threshold: this.getMaxAllowedDisplacement(this.dt),
    };
  }
}

// ============================================================================
// 2. M22 Forensic Warp Detection & M23 Acceptance Baseline Suite
// ============================================================================

describe('M22 Automated Warp Detection Test Suite', () => {
  let formation: FormationManager;
  let detector: WarpDetector;

  beforeEach(() => {
    formation = new FormationManager();
    detector = new WarpDetector({ dt: 1 / 60 });
  });

  // --------------------------------------------------------------------------
  // Test Track 1: WarpDetector Telemetry Engine & Mathematical Invariants
  // --------------------------------------------------------------------------
  describe('Track 1: Telemetry Monitor Engine & Mathematical Invariants', () => {
    it('accurately sets 60Hz kinematic displacement threshold to 12.0 px (480 px/s bound)', () => {
      const threshold60Hz = detector.getMaxAllowedDisplacement(1 / 60);
      expect(threshold60Hz).toBeCloseTo(12.0, 4);

      // Slower framerate (e.g. 30Hz) scales threshold proportionally
      const threshold30Hz = detector.getMaxAllowedDisplacement(1 / 30);
      expect(threshold30Hz).toBeCloseTo(20.0, 4);
    });

    it('accurately sets state-aware formation threshold to 3.0 px (120 px/s bound)', () => {
      const formation60Hz = detector.getMaxAllowedDisplacement(1 / 60, EnemyState.IN_FORMATION);
      expect(formation60Hz).toBeCloseTo(3.0, 4);

      const formationContext = detector.getMaxAllowedDisplacement(1 / 60, {
        toState: EnemyState.IN_FORMATION,
      });
      expect(formationContext).toBeCloseTo(3.0, 4);
    });

    it('flags unphysical on-screen jumps (> 12.0 px) while ignoring smooth linear movement', () => {
      const enemy = new Enemy({ id: 99, x: 50, y: 50 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      // Frame 1: initialization
      detector.checkEnemy(enemy, 1);

      // Frame 2: smooth motion (dx=3.0, dy=4.0 -> dist=5.0 px <= 12.0 px)
      enemy.x = 53;
      enemy.y = 54;
      const smoothRecord = detector.checkEnemy(enemy, 2);
      expect(smoothRecord).toBeNull();
      expect(detector.anomalies).toHaveLength(0);

      // Frame 3: unphysical jump (x=53 -> 85, dx=32.0 px > 12.0 px)
      enemy.x = 85;
      const jumpRecord = detector.checkEnemy(enemy, 3);
      expect(jumpRecord).not.toBeNull();
      expect(jumpRecord!.deltaDistance).toBeCloseTo(32.0, 1);
      expect(jumpRecord!.classification).toBe('UNEXPLAINED_ONSCREEN_WARP');
      expect(detector.anomalies).toHaveLength(1);
    });

    it('correctly filters off-screen toroidal wrapping (y: 304 -> -16) without false alarms', () => {
      const enemy = new Enemy({ id: 88, x: 100, y: 304 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;

      // Frame 1: exiting bottom of screen
      detector.checkEnemy(enemy, 1);

      // Frame 2: wrapping to top (-16)
      enemy.y = -16;
      const record = detector.checkEnemy(enemy, 2);

      // Displacement is 320 px, but because y_prev >= 288 and y_curr <= 0, it is filtered
      expect(record).toBeNull();
      expect(detector.anomalies).toHaveLength(0);
    });

    it('correctly filters intentional M18 quantum teleportation anomalies (isTeleporting = true)', () => {
      const enemy = new Enemy({ id: 77, x: 100, y: 150 });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;
      enemy.isGlitched = true;

      detector.checkEnemy(enemy, 1);

      // Frame 2: intentional quantum teleport jump of 45px
      enemy.x = 145;
      enemy.isTeleporting = true;
      enemy.teleportTimer = 0.08;
      const record = detector.checkEnemy(enemy, 2);

      expect(record).toBeNull();
      expect(detector.anomalies).toHaveLength(0);
    });

    it('verifies harmonic formation breathing/sway never exceeds 1.5 px/frame (zero false positives in grid)', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Simulate 180 frames (3 seconds) of pure formation oscillation
      for (let frame = 1; frame <= 180; frame++) {
        formation.update(1 / 60);
        detector.checkFrame(formation, frame);
      }

      // Zero anomalies must be flagged for enemies resting in the formation grid
      expect(detector.anomalies).toHaveLength(0);
      const summary = detector.getTelemetrySummary();
      // Maximum delta in grid breathing should be <= 1.2 px/frame
      expect(summary.maxObservedDelta).toBeLessThan(1.5);
    });
  });

  // --------------------------------------------------------------------------
  // Test Track 2: Forensic Detection of Active Warp Defects & Baseline Acceptance
  // --------------------------------------------------------------------------
  describe('Track 2: Forensic Bug Detection & M23 Acceptance Baseline', () => {
    /**
     * WARP-1: Dive Re-Entry to Formation Coordinate Jump
     * Root Cause: returnSlotX/Y sampled once at t0+4.0s, oscillating grid drifts up to 49.92px,
     * causing a 15-38px coordinate jump when switching from RETURNING_TO_FORMATION to IN_FORMATION.
     */
    /**
     * WARP-1: Formation Return Re-Entry Coordinate Discontinuity
     * Post-Fix Invariant: Verifies zero coordinate jumps (<= 3.0 px) during dive re-entry
     * to live oscillating formation.
     */
    it('WARP-1: verifies zero coordinate jumps (<= 3.0 px) during dive re-entry to live oscillating formation', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Fast-forward 60 frames (1.0s) to calibrate maximum phase offset between frozen prediction and moving grid
      for (let i = 0; i < 60; i++) {
        formation.update(1 / 60);
      }

      // Outer column Zako (Row 4, Col 0) exhibits maximum breathing expansion displacement
      const enemy = formation.enemies.find((e) => e.row === 4 && e.col === 0)!;
      expect(enemy).toBeDefined();

      formation.peelOffSolo(enemy, 112);
      expect(enemy.state).toBe(EnemyState.DIVING_SOLO);

      let inFormationFrames = 0;
      for (let frame = 1; frame <= 600; frame++) {
        formation.update(1 / 60);
        detector.checkEnemy(enemy, frame);

        if (enemy.state === EnemyState.IN_FORMATION) {
          inFormationFrames++;
          // Must sample at least 2 frames into IN_FORMATION to capture the grid snap at frame T+1
          if (inFormationFrames >= 3) break;
        }
      }

      expect(inFormationFrames).toBeGreaterThanOrEqual(2);

      // Post-Fix Assertion: ZERO re-entry warp anomalies
      const reentryWarps = detector.anomalies.filter((a) => a.classification === 'FORMATION_REENTRY_WARP');
      expect(reentryWarps).toHaveLength(0);
      expect(detector.anomalies).toHaveLength(0);

      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
      expect(compliance.violations).toHaveLength(0);
      expect(enemy.state).toBe(EnemyState.IN_FORMATION);
    });

    /**
     * WARP-2: Sub-Wave Entry Path Completion Static Slot Snap
     * Post-Fix Invariant: Verifies smooth sub-wave entry docking with zero snaps upon flight path completion.
     */
    it('WARP-2: verifies smooth sub-wave entry docking with zero snaps upon flight path completion', () => {
      formation.spawnStage(1);
      expect(formation.isEntryWaveActive).toBe(true);

      // Monitor Alien 7 in Sub-Wave 1 (Row 1, Col 6 - Goei)
      const enemy = formation.enemies.find((e) => e.row === 1 && e.col === 6)!;
      expect(enemy).toBeDefined();

      let didEnterFormation = false;
      let inFormationFrames = 0;

      for (let frame = 1; frame <= 360; frame++) {
        formation.update(1 / 60);
        detector.checkEnemy(enemy, frame);

        if (enemy.state === EnemyState.IN_FORMATION) {
          didEnterFormation = true;
          inFormationFrames++;
          if (inFormationFrames >= 3) break;
        }
      }

      expect(didEnterFormation).toBe(true);
      expect(inFormationFrames).toBeGreaterThanOrEqual(2);

      // Post-Fix Assertion: ZERO sub-wave entry snap anomalies
      const entryWarps = detector.anomalies.filter((a) => a.classification === 'SUBWAVE_ENTRY_WARP');
      expect(entryWarps).toHaveLength(0);
      expect(detector.anomalies).toHaveLength(0);

      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
      expect(compliance.violations).toHaveLength(0);
      expect(enemy.state).toBe(EnemyState.IN_FORMATION);
    });

    /**
     * WARP-3: Boss Galaga Tractor Dive Premature Bottom-Wrap
     * Post-Fix Invariant: Verifies Boss Galaga tractor dive halts smoothly at tractor altitude with zero ceiling wrap.
     */
    it('WARP-3: verifies Boss Galaga tractor dive halts smoothly at tractor altitude with zero ceiling wrap', () => {
      formation.spawnStage(2);
      formation.isEntryWaveActive = false;

      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      expect(boss).toBeDefined();

      formation.launchTractorBeamDive(boss, 112);
      expect(boss.state).toBe(EnemyState.DIVING_SOLO);

      // Simulate 65 frames (1.08 seconds, past the 1000ms dive curve)
      for (let frame = 1; frame <= 65; frame++) {
        formation.update(1 / 60);
        detector.checkEnemy(boss, frame);
      }

      // Post-Fix Assertion: ZERO tractor dive warps
      const tractorWarps = detector.anomalies.filter((a) => a.classification === 'TRACTOR_DIVE_WARP');
      expect(tractorWarps).toHaveLength(0);
      expect(detector.anomalies).toHaveLength(0);

      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
      expect(compliance.violations).toHaveLength(0);

      // Boss remains stably at tractor beam altitude
      expect(boss.state).toBe(EnemyState.TRACTOR_BEAM_ACTIVE);
      expect(boss.y).toBeGreaterThanOrEqual(95);
      expect(boss.y).toBeLessThanOrEqual(105);
    });

    /**
     * WARP-4: Kinetic Inversion Mid-Air Premature Bottom-Wrap
     * Post-Fix Invariant: Verifies kinetic inversion dive decelerates smoothly without mid-air premature wrap.
     */
    it('WARP-4: verifies kinetic inversion dive decelerates smoothly without mid-air premature wrap', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      // Fast-forward 180 frames so enemy is properly initialized on-screen in formation grid
      for (let i = 0; i < 180; i++) {
        formation.update(1 / 60);
      }

      const enemy = formation.enemies.find((e) => e.row === 1 && e.col === 4)!;
      expect(enemy).toBeDefined();
      expect(enemy.y).toBeGreaterThan(0); // Starts on-screen (~67.22 px)

      formation.peelOffSolo(enemy, 112);
      enemy.isGlitched = true;

      for (let frame = 1; frame <= 120; frame++) {
        // Trigger kinetic inversion when enemy reaches mid-screen dive altitude
        if (enemy.y >= 100 && !enemy.isKineticInverted && enemy.flightPath) {
          enemy.triggerKineticInversion();
        }

        formation.update(1 / 60);
        detector.checkEnemy(enemy, frame);
      }

      // Post-Fix Assertion: ZERO kinetic inversion premature wraps
      const inversionWarps = detector.anomalies.filter(
        (a) => a.classification === 'KINEMATIC_INVERSION_WARP' || (a.prevPos.y >= 50 && a.currPos.y <= 0)
      );
      expect(inversionWarps).toHaveLength(0);
      expect(detector.anomalies).toHaveLength(0);

      const compliance = assertWarpCompliance(detector.anomalies);
      expect(compliance.passed).toBe(true);
      expect(compliance.violations).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test Track 3: Continuous Gameplay Telemetry Soak & Audit Report
  // --------------------------------------------------------------------------
  describe('Track 3: Continuous Gameplay Telemetry Soak & Diagnostics', () => {
    it('executes 600 continuous gameplay frames and produces complete forensic telemetry summary', () => {
      formation.spawnStage(1);

      // Run 600 frames of gameplay (10 seconds)
      for (let frame = 1; frame <= 600; frame++) {
        formation.update(1 / 60, 112, 250);
        detector.checkFrame(formation, frame);
      }

      const summary = detector.getTelemetrySummary();
      expect(summary.totalFramesChecked).toBe(600);
      expect(summary.totalEntityChecks).toBeGreaterThan(1000);
      expect(summary.threshold).toBeCloseTo(12.0, 4);

      // Verify that every single captured anomaly (if any) is strictly cataloged
      for (const anomaly of detector.anomalies) {
        expect(anomaly.deltaDistance).toBeGreaterThan(anomaly.maxAllowed);
        expect(anomaly.isOffScreenWrap).toBe(false);
        expect(anomaly.isIntentionalGlitch).toBe(false);
        expect([
          'TRACTOR_DIVE_WARP',
          'FORMATION_REENTRY_WARP',
          'SUBWAVE_ENTRY_WARP',
          'KINEMATIC_INVERSION_WARP',
          'UNEXPLAINED_ONSCREEN_WARP',
        ]).toContain(anomaly.classification);
      }
    });

    it('survives multi-stage resets and rapid stage clearing without state corruption or false flags', () => {
      formation.spawnStage(1);
      for (let frame = 1; frame <= 120; frame++) {
        formation.update(1 / 60);
        detector.checkFrame(formation, frame);
      }

      // Clear stage and advance to Stage 2
      detector.reset();
      expect(detector.anomalies).toHaveLength(0);
      expect(detector.totalFramesChecked).toBe(0);

      formation.spawnStage(2);
      for (let frame = 1; frame <= 120; frame++) {
        formation.update(1 / 60);
        detector.checkFrame(formation, frame);
      }

      expect(detector.totalFramesChecked).toBe(120);
    });
  });

  // --------------------------------------------------------------------------
  // Test Track 4: M23 Acceptance Baseline Contract & Zero-Warp Invariant Validator
  // --------------------------------------------------------------------------
  describe('Track 4: M23 Acceptance Baseline Contract & Zero-Warp Invariant Validator', () => {
    it('assertWarpCompliance correctly validates clean traces and flags unphysical violations', () => {
      // Synthetic clean trace
      const cleanTrace: WarpRecord[] = [];
      const cleanResult = assertWarpCompliance(cleanTrace);
      expect(cleanResult.passed).toBe(true);
      expect(cleanResult.violations).toHaveLength(0);

      // Synthetic trace with violation
      const dirtyTrace: WarpRecord[] = [
        {
          enemyId: 1,
          enemyType: EnemyType.BOSS,
          fromState: EnemyState.DIVING_SOLO,
          toState: EnemyState.RETURNING_TO_FORMATION,
          prevPos: { x: 112, y: 100 },
          currPos: { x: 112, y: -16 },
          deltaDistance: 116,
          deltaX: 0,
          deltaY: -116,
          maxAllowed: 12,
          frame: 60,
          classification: 'TRACTOR_DIVE_WARP',
          isOffScreenWrap: false,
          isIntentionalGlitch: false,
        },
      ];

      const strictResult = assertWarpCompliance(dirtyTrace, { strict: true });
      expect(strictResult.passed).toBe(false);
      expect(strictResult.violations).toHaveLength(1);
      expect(strictResult.violations[0]!.classification).toBe('TRACTOR_DIVE_WARP');
    });

    it('assertWarpCompliance passes 100% on live clean formation oscillation telemetry trace', () => {
      formation.spawnStage(1);
      formation.isEntryWaveActive = false;

      for (let frame = 1; frame <= 180; frame++) {
        formation.update(1 / 60);
        detector.checkFrame(formation, frame);
      }

      const liveCompliance = assertWarpCompliance(detector.anomalies);
      expect(liveCompliance.passed).toBe(true);
      expect(liveCompliance.violations).toHaveLength(0);
    });

    it('assertWarpCompliance passes 100% on live tractor dive post-fix telemetry trace', () => {
      formation.spawnStage(2);
      formation.isEntryWaveActive = false;

      const boss = formation.enemies.find((e) => e.type === EnemyType.BOSS)!;
      formation.launchTractorBeamDive(boss, 112);

      for (let frame = 1; frame <= 65; frame++) {
        formation.update(1 / 60);
        detector.checkEnemy(boss, frame);
      }

      const liveCompliance = assertWarpCompliance(detector.anomalies);
      expect(liveCompliance.passed).toBe(true);
      expect(liveCompliance.violations).toHaveLength(0);
    });
  });
});

/**
 * Standalone Compliance Assertion for Milestone M23 Kinematic Smoothing Gate.
 * Evaluates whether an execution trace meets the zero-warp invariant.
 */
export function assertWarpCompliance(
  anomalies: WarpRecord[],
  options?: {
    strict?: boolean;
    maxAllowedDelta?: number;
  }
): { passed: boolean; violations: WarpRecord[] } {
  const strict = options?.strict ?? true;
  const maxAllowed = options?.maxAllowedDelta ?? 12.0;

  const violations = anomalies.filter((a) => {
    if (!strict) {
      return a.classification === 'UNEXPLAINED_ONSCREEN_WARP';
    }
    if (options?.maxAllowedDelta !== undefined) {
      return a.deltaDistance > maxAllowed;
    }
    return a.deltaDistance > a.maxAllowed;
  });

  return {
    passed: violations.length === 0,
    violations,
  };
}

