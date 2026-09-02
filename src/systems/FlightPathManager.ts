/**
 * Galaga Arcade Web Game — Flight Path Manager & Dynamic AI Trajectory System
 * 
 * Manages:
 * 1. 5 Formation entry sub-waves (40 ships across 5 distinct swooping trajectories)
 * 2. Attack dive paths (Single alien, Goei synchronized pair, Boss Galaga escort)
 * 3. Dynamic target-slot anchoring to breathing formation grid
 * 4. Off-screen bottom wrap-around and return-to-formation docking
 */

import { BezierCurve, CompositeBezierPath } from '../math/Bezier';
import type { Point2D } from '../types';

export type SubWaveType =
  | 'WAVE_1_TOP_CENTER'
  | 'WAVE_2_TOP_RIGHT'
  | 'WAVE_3_TOP_LEFT'
  | 'WAVE_4_BOTTOM_LEFT'
  | 'WAVE_5_BOTTOM_RIGHT';

export type DiveType =
  | 'SOLO_ZAKO'
  | 'SOLO_GOEI'
  | 'SOLO_BOSS'
  | 'PAIRED_GOEI_LEFT'
  | 'PAIRED_GOEI_RIGHT'
  | 'BOSS_ESCORTED';

export class FlightPathManager {
  // Canonical entry and dive speed constants
  public static readonly ENTRY_SPEED = 160;  // Pixels/second
  public static readonly DIVE_SPEED = 175;   // Pixels/second
  public static readonly RETURN_SPEED = 140; // Pixels/second

  // ==========================================================================
  // 1. Formation Entry Sub-Wave Paths
  // ==========================================================================

  /**
   * Generates a dynamic, slot-anchored entry path for an alien in one of the 5 sub-waves.
   */
  public static createEntryPath(
    waveType: SubWaveType,
    alienIndex: number,
    currentSlotPos: Point2D
  ): CompositeBezierPath {
    const pathId = `ENTRY_${waveType}_#${alienIndex}`;

    switch (waveType) {
      case 'WAVE_1_TOP_CENTER':
        return FlightPathManager.createSubWave1TopCenter(pathId, alienIndex, currentSlotPos);

      case 'WAVE_2_TOP_RIGHT':
        return FlightPathManager.createSubWave2TopRight(pathId, alienIndex, currentSlotPos);

      case 'WAVE_3_TOP_LEFT':
        return FlightPathManager.createSubWave3TopLeft(pathId, alienIndex, currentSlotPos);

      case 'WAVE_4_BOTTOM_LEFT':
        return FlightPathManager.createSubWave4BottomLeft(pathId, alienIndex, currentSlotPos);

      case 'WAVE_5_BOTTOM_RIGHT':
        return FlightPathManager.createSubWave5BottomRight(pathId, alienIndex, currentSlotPos);
    }
  }

  /**
   * Sub-Wave 1: Top-Center Entry (4 Boss Galagas + 4 Red Goeis)
   * Plunges down center, splits into left (CCW) and right (CW) loops.
   */
  private static createSubWave1TopCenter(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const isLeftBranch = alienIndex < 4;

    // Segment 1: Downward plunge
    const seg1 = new BezierCurve(
      { x: 112, y: -20 },
      { x: 112, y: 40 },
      { x: 112, y: 90 },
      { x: 112, y: 135 }
    );

    // Segment 2: Outward loop
    let seg2: BezierCurve;
    let seg3ExitTangent: Point2D;

    if (isLeftBranch) {
      // Left loop (Counter-Clockwise)
      seg2 = new BezierCurve(
        { x: 112, y: 135 },
        { x: 60, y: 180 },
        { x: 30, y: 120 },
        { x: 75, y: 80 }
      );
      seg3ExitTangent = { x: 95, y: 60 };
    } else {
      // Right loop (Clockwise)
      seg2 = new BezierCurve(
        { x: 112, y: 135 },
        { x: 164, y: 180 },
        { x: 194, y: 120 },
        { x: 149, y: 80 }
      );
      seg3ExitTangent = { x: 129, y: 60 };
    }

    // Segment 3: Dynamic approach to target slot
    const seg3 = new BezierCurve(
      seg2.p3,
      seg3ExitTangent,
      { x: slot.x, y: slot.y - 25 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 2: Top-Right Entry (8 Red Goeis)
   * Diagonal swoop down-left, bottom loop near (50, 210), ascend to slot.
   */
  private static createSubWave2TopRight(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerOffset = (alienIndex % 4) * 4;

    // Segment 1: High-speed plunge across screen to lower-left
    const seg1 = new BezierCurve(
      { x: 235 + staggerOffset, y: -20 },
      { x: 210, y: 80 },
      { x: 90, y: 140 },
      { x: 45, y: 200 }
    );

    // Segment 2: Bottom loop
    const seg2 = new BezierCurve(
      { x: 45, y: 200 },
      { x: 15, y: 245 },
      { x: 95, y: 255 },
      { x: 125, y: 190 }
    );

    // Segment 3: Dynamic ascent into slot
    const seg3 = new BezierCurve(
      { x: 125, y: 190 },
      { x: 145, y: 140 },
      { x: slot.x, y: slot.y - 25 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 3: Top-Left Entry (8 Yellow Zakos)
   * Diagonal swoop down-right, bottom loop near (174, 210), ascend to slot.
   */
  private static createSubWave3TopLeft(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerOffset = (alienIndex % 4) * 4;

    // Segment 1: Plunge across screen to lower-right
    const seg1 = new BezierCurve(
      { x: -15 - staggerOffset, y: -20 },
      { x: 14, y: 80 },
      { x: 134, y: 140 },
      { x: 179, y: 200 }
    );

    // Segment 2: Bottom loop
    const seg2 = new BezierCurve(
      { x: 179, y: 200 },
      { x: 209, y: 245 },
      { x: 129, y: 255 },
      { x: 99, y: 190 }
    );

    // Segment 3: Dynamic ascent into slot
    const seg3 = new BezierCurve(
      { x: 99, y: 190 },
      { x: 79, y: 140 },
      { x: slot.x, y: slot.y - 25 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 4: Bottom-Left Entry (8 Yellow Zakos)
   * Upward swoop to upper-right, top loop near (160, 60), descend into bottom rows.
   */
  private static createSubWave4BottomLeft(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerY = (alienIndex % 4) * 6;

    // Segment 1: Upward swoop across screen
    const seg1 = new BezierCurve(
      { x: -20, y: 230 + staggerY },
      { x: 50, y: 180 },
      { x: 130, y: 110 },
      { x: 165, y: 65 }
    );

    // Segment 2: Top loop
    const seg2 = new BezierCurve(
      { x: 165, y: 65 },
      { x: 195, y: 25 },
      { x: 130, y: 20 },
      { x: 100, y: 65 }
    );

    // Segment 3: Dynamic descent into slot
    const seg3 = new BezierCurve(
      { x: 100, y: 65 },
      { x: 80, y: 95 },
      { x: slot.x, y: slot.y - 20 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 5: Bottom-Right Entry (8 Yellow Zakos)
   * Upward swoop to upper-left, top loop near (64, 60), descend into bottom rows.
   */
  private static createSubWave5BottomRight(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerY = (alienIndex % 4) * 6;

    // Segment 1: Upward swoop across screen
    const seg1 = new BezierCurve(
      { x: 244, y: 230 + staggerY },
      { x: 174, y: 180 },
      { x: 94, y: 110 },
      { x: 59, y: 65 }
    );

    // Segment 2: Top loop
    const seg2 = new BezierCurve(
      { x: 59, y: 65 },
      { x: 29, y: 25 },
      { x: 94, y: 20 },
      { x: 124, y: 65 }
    );

    // Segment 3: Dynamic descent into slot
    const seg3 = new BezierCurve(
      { x: 124, y: 65 },
      { x: 144, y: 95 },
      { x: slot.x, y: slot.y - 20 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  // ==========================================================================
  // 2. Attack Dive Flight Paths
  // ==========================================================================

  /**
   * Generates a single alien peel-off loop and downward swoop targeting player X.
   */
  public static createSoloDivePath(
    startPos: Point2D,
    playerX: number,
    isLeft: boolean = true
  ): CompositeBezierPath {
    const dir = isLeft ? -1 : 1;

    // Segment 1: Peel-off teardrop loop
    const seg1 = new BezierCurve(
      { x: startPos.x, y: startPos.y },
      { x: startPos.x + dir * 15, y: startPos.y - 25 },
      { x: startPos.x + dir * 40, y: startPos.y - 10 },
      { x: startPos.x + dir * 25, y: startPos.y + 30 }
    );

    // Segment 2: Aimed swoop through player X and off-screen bottom
    const exitX = Math.max(16, Math.min(208, playerX + dir * 20));
    const seg2 = new BezierCurve(
      seg1.p3,
      { x: (seg1.p3.x + playerX) / 2, y: 140 },
      { x: playerX, y: 220 },
      { x: exitX, y: 310 }
    );

    return new CompositeBezierPath(`DIVE_SOLO_${Date.now()}`, [
      { curve: seg1, speed: FlightPathManager.DIVE_SPEED * 0.9 },
      { curve: seg2, speed: FlightPathManager.DIVE_SPEED * 1.1 },
    ]);
  }

  /**
   * Generates synchronized paired dive paths for adjacent Goei wingmen.
   */
  public static createPairedGoeiDivePaths(
    leftStart: Point2D,
    rightStart: Point2D,
    playerX: number
  ): { leftPath: CompositeBezierPath; rightPath: CompositeBezierPath } {
    // Left Goei peels off left and swoops down-right
    const leftSeg1 = new BezierCurve(
      { x: leftStart.x, y: leftStart.y },
      { x: leftStart.x - 20, y: leftStart.y - 20 },
      { x: leftStart.x - 35, y: leftStart.y + 10 },
      { x: leftStart.x - 10, y: leftStart.y + 40 }
    );
    const leftSeg2 = new BezierCurve(
      leftSeg1.p3,
      { x: Math.max(20, playerX - 30), y: 160 },
      { x: playerX, y: 230 },
      { x: Math.min(200, playerX + 40), y: 310 }
    );

    // Right Goei peels off right and swoops down-left
    const rightSeg1 = new BezierCurve(
      { x: rightStart.x, y: rightStart.y },
      { x: rightStart.x + 20, y: rightStart.y - 20 },
      { x: rightStart.x + 35, y: rightStart.y + 10 },
      { x: rightStart.x + 10, y: rightStart.y + 40 }
    );
    const rightSeg2 = new BezierCurve(
      rightSeg1.p3,
      { x: Math.min(204, playerX + 30), y: 160 },
      { x: playerX, y: 230 },
      { x: Math.max(24, playerX - 40), y: 310 }
    );

    const leftPath = new CompositeBezierPath('DIVE_PAIRED_L', [
      { curve: leftSeg1, speed: FlightPathManager.DIVE_SPEED },
      { curve: leftSeg2, speed: FlightPathManager.DIVE_SPEED * 1.15 },
    ]);

    const rightPath = new CompositeBezierPath('DIVE_PAIRED_R', [
      { curve: rightSeg1, speed: FlightPathManager.DIVE_SPEED },
      { curve: rightSeg2, speed: FlightPathManager.DIVE_SPEED * 1.15 },
    ]);

    return { leftPath, rightPath };
  }

  /**
   * Generates Boss Galaga escort dive path.
   */
  public static createBossEscortedDivePath(
    bossStart: Point2D,
    playerX: number
  ): CompositeBezierPath {
    const isLeft = bossStart.x <= 112;
    const dir = isLeft ? -1 : 1;

    // Wide majestic peel-off loop
    const seg1 = new BezierCurve(
      { x: bossStart.x, y: bossStart.y },
      { x: bossStart.x + dir * 25, y: bossStart.y - 30 },
      { x: bossStart.x + dir * 55, y: bossStart.y - 5 },
      { x: bossStart.x + dir * 30, y: bossStart.y + 45 }
    );

    // Deep swoop through player position
    const seg2 = new BezierCurve(
      seg1.p3,
      { x: 112, y: 150 },
      { x: playerX, y: 230 },
      { x: playerX + dir * 30, y: 310 }
    );

    return new CompositeBezierPath('DIVE_BOSS_ESCORT', [
      { curve: seg1, speed: FlightPathManager.DIVE_SPEED * 0.85 },
      { curve: seg2, speed: FlightPathManager.DIVE_SPEED * 1.05 },
    ]);
  }

  /**
   * Generates return-to-formation docking path after bottom-screen wrap-around.
   */
  public static createReturnPath(
    reEntryX: number,
    targetSlot: Point2D
  ): CompositeBezierPath {
    const seg1 = new BezierCurve(
      { x: reEntryX, y: -16 },
      { x: reEntryX, y: 15 },
      { x: targetSlot.x, y: 25 },
      { x: targetSlot.x, y: 40 }
    );

    const seg2 = new BezierCurve(
      { x: targetSlot.x, y: 40 },
      { x: targetSlot.x, y: Math.max(45, targetSlot.y - 20) },
      { x: targetSlot.x, y: Math.max(50, targetSlot.y - 5) },
      { x: targetSlot.x, y: targetSlot.y }
    );

    return new CompositeBezierPath('RETURN_TO_SLOT', [
      { curve: seg1, speed: FlightPathManager.RETURN_SPEED },
      { curve: seg2, speed: FlightPathManager.RETURN_SPEED },
    ]);
  }
}
