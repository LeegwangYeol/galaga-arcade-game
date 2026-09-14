/**
 * Galaga Arcade Web Game — Master UI Screens Engine
 * 
 * Provides production-grade procedural rendering for:
 * 1. Title Screen & Attract Mode (Logo, Blinking CTA, Point Table, Controls Guide)
 * 2. Stage Intro Intermission (PLAYER ONE, STAGE XX, READY)
 * 3. Challenging Stage Intro & Bonus Results Screen
 * 4. Pause Overlay Screen
 * 5. Game Over Screen with Accuracy Summary (Shots Fired, Hits, Hit-Miss Ratio %)
 */

import { SpriteRenderer, PALETTE } from '../renderer/SpriteRenderer';
import { EnemyType } from '../types';
import { HUD } from './HUD';

export interface ScreenRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  stateTimer: number;
  blinkTimer: number;
  score: number;
  highScore: number;
  stage: number;
  lives: number;
  shotsFired: number;
  hits: number;
  challengingHits?: number;
  isDual?: boolean;
  isCoop?: boolean;
  p1Score?: number;
  p2Score?: number;
}

export class Screens {
  private static readonly FONT_FAMILY = '"Press Start 2P", monospace, sans-serif';

  // ==========================================================================
  // 1. Title Screen & Attract Mode
  // ==========================================================================

  public static renderTitleScreen(context: ScreenRenderContext): void {
    const { ctx, width, blinkTimer } = context;
    const isCoop = context.isCoop ?? false;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 1. Title Logo: Authentic Galaga Pixelated Typography
    this.renderGalagaLogo(ctx, width / 2, 52);

    // Subtitle
    HUD.drawText(ctx, 'ARCADE WEB ENGINE', width / 2, 72, { color: PALETTE.BLUE_CYAN, align: 'center' });

    // 2. Mode Selection Block (1-PLAYER vs 2-PLAYER)
    HUD.drawText(ctx, isCoop ? '  1-PLAYER (SOLO)   [1]  ' : '> 1-PLAYER (SOLO)   [1] <', width / 2, 92, { color: isCoop ? PALETTE.GREY_LIGHT : PALETTE.YELLOW, align: 'center' });
    HUD.drawText(ctx, isCoop ? '> 2-PLAYER (CO-OP)  [2] <' : '  2-PLAYER (CO-OP)  [2]  ', width / 2, 104, { color: isCoop ? PALETTE.YELLOW : PALETTE.GREY_LIGHT, align: 'center' });

    // 3. Blinking Call-to-Action (2.5 Hz = 400ms cycle)
    const isBlinkOn = Math.floor(blinkTimer * 2.5) % 2 === 0;
    HUD.drawText(ctx, 'PUSH START BUTTON', width / 2, 118, { color: PALETTE.YELLOW, align: 'center' });

    if (isBlinkOn) {
      HUD.drawText(ctx, 'CLICK OR TOUCH TO START', width / 2, 126, { color: PALETTE.RED, align: 'center' });
    }

    // 4. Point Value Reference Table
    this.renderPointTable(ctx, width / 2, 134);

    // 5. Dynamic Controls Quick Guide
    this.drawSmallText(ctx, isCoop ? 'P1: WASD+SPACE | P2: ARROWS+ENTER' : 'KEYBOARD: [A/D] [<- ->] FIRE: [SPACE/Z]', width / 2, 236, isCoop ? PALETTE.YELLOW : PALETTE.GREY_LIGHT, 'center');
    this.drawSmallText(ctx, isCoop ? 'P1: [X] SPECIAL | P2: [M] SPECIAL' : 'PAUSE: [P] TOUCH: VIRTUAL D-PAD & FIRE', width / 2, 248, isCoop ? PALETTE.BLUE_CYAN : PALETTE.GREY_LIGHT, 'center');

    // 6. Copyright Attribution
    this.drawSmallText(ctx, '© 1981 NAMCO BANDAI / WEB ADAPTATION', width / 2, 270, PALETTE.GREY_DARK, 'center');

    ctx.restore();
  }

  private static renderGalagaLogo(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop shadow
    ctx.font = `bold 18px ${this.FONT_FAMILY}`;
    ctx.fillStyle = '#9E0000';
    ctx.fillText('GALAGA', centerX + 1, centerY + 2);

    // Primary vibrant yellow body
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('GALAGA', centerX, centerY);

    ctx.restore();
  }

  private static renderPointTable(ctx: CanvasRenderingContext2D, centerX: number, startY: number): void {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Table Header
    HUD.drawText(ctx, '- POINT TABLE -', centerX, startY, { color: PALETTE.BLUE_CYAN, align: 'center' });

    const rowConfigs = [
      { type: EnemyType.ZAKO, text1: '50 PTS', text2: '100 PTS', color: PALETTE.YELLOW, y: startY + 16 },
      { type: EnemyType.GOEI, text1: '80 PTS', text2: '160 PTS', color: PALETTE.YELLOW, y: startY + 32 },
      { type: EnemyType.BOSS, text1: '150 PTS', text2: '400 PTS', color: PALETTE.YELLOW, y: startY + 48 },
    ];

    for (const row of rowConfigs) {
      // Draw sprite icon
      SpriteRenderer.drawEnemy(ctx, row.type, centerX - 64, row.y + 4, 0, 2);

      // Draw point values
      HUD.drawText(ctx, row.text1, centerX - 42, row.y, { color: row.color, align: 'left' });
      HUD.drawText(ctx, row.text2, centerX + 18, row.y, { color: PALETTE.WHITE, align: 'left' });
    }

    // Dual Fighter Rescue Bonus Row
    const dualY = startY + 64;
    SpriteRenderer.draw(ctx, 'DUAL_FIGHTER', centerX - 64, dualY + 4, { scale: 0.65 });
    HUD.drawText(ctx, '1000 PTS RESCUE', centerX - 42, dualY, { color: PALETTE.GREEN, align: 'left' });

    ctx.restore();
  }

  // ==========================================================================
  // 2. Stage Intro Intermission
  // ==========================================================================

  public static renderStageIntro(context: ScreenRenderContext): void {
    const { ctx, width, height, stage } = context;
    const isCoop = context.isCoop ?? false;
    const isChallenging = stage >= 3 && stage % 4 === 3;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // PLAYER Banner
    const playerBanner = isCoop ? 'PLAYERS ONE & TWO' : 'PLAYER ONE';
    HUD.drawText(ctx, playerBanner, width / 2, height / 2 - 18, { color: PALETTE.BLUE_CYAN, align: 'center' });

    // STAGE XX / CHALLENGING STAGE Banner
    if (isChallenging) {
      HUD.drawText(ctx, 'CHALLENGING STAGE', width / 2, height / 2, { color: PALETTE.BLUE_CYAN, align: 'center' });
    } else {
      const stageStr = `STAGE ${stage.toString().padStart(2, '0')}`;
      HUD.drawText(ctx, stageStr, width / 2, height / 2, { color: PALETTE.YELLOW, align: 'center' });
    }

    // READY Banner
    HUD.drawText(ctx, 'READY', width / 2, height / 2 + 18, { color: PALETTE.RED, align: 'center' });

    ctx.restore();
  }

  // ==========================================================================
  // 3. Challenging Stage Results Screen
  // ==========================================================================

  public static renderChallengingResults(context: ScreenRenderContext): void {
    const { ctx, width, height, blinkTimer } = context;
    const hits = Math.max(0, Math.min(40, context.challengingHits ?? 0));
    const isPerfect = hits === 40;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Title
    HUD.drawText(ctx, 'CHALLENGING STAGE', width / 2, height / 2 - 36, { color: PALETTE.BLUE_CYAN, align: 'center' });

    // Hits summary
    const hitsText = `NUMBER OF HITS   ${hits.toString().padStart(2, ' ')}`;
    HUD.drawText(ctx, hitsText, width / 2, height / 2 - 10, { color: PALETTE.YELLOW, align: 'center' });

    if (isPerfect) {
      // 40/40 Perfect score fanfare presentation
      const isBlinkOn = Math.floor(blinkTimer * 4) % 2 === 0;
      const perfColor = isBlinkOn ? PALETTE.YELLOW : PALETTE.GREEN;
      HUD.drawText(ctx, 'PERFECT !!!', width / 2, height / 2 + 14, { color: perfColor, align: 'center' });
      HUD.drawText(ctx, 'SPECIAL BONUS 10000 PTS', width / 2, height / 2 + 34, { color: PALETTE.YELLOW, align: 'center' });
    } else {
      // Standard hit bonus calculation: 100 pts per hit
      const bonus = hits * 100;
      const bonusText = `BONUS   ${bonus} PTS`;
      HUD.drawText(ctx, bonusText, width / 2, height / 2 + 18, { color: PALETTE.WHITE, align: 'center' });
    }

    ctx.restore();
  }

  // ==========================================================================
  // 4. Pause Overlay Screen
  // ==========================================================================

  public static renderPauseOverlay(context: ScreenRenderContext): void {
    const { ctx, width, height } = context;
    const isCoop = context.isCoop ?? false;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Dark translucent backdrop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);

    // Central modal box with glowing arcade border
    const boxW = 184;
    const boxH = 74;
    const boxX = (width - boxW) / 2;
    const boxY = (height - boxH) / 2;

    ctx.fillStyle = 'rgba(10, 10, 24, 0.9)';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Text Content
    HUD.drawText(ctx, isCoop ? 'CO-OP PAUSED' : 'PAUSE', width / 2, height / 2 - 16, { color: PALETTE.YELLOW, align: 'center' });
    this.drawSmallText(ctx, isCoop ? 'P1: WASD+SPACE | P2: ARROWS+ENTER' : 'PRESS P OR ESC TO RESUME', width / 2, height / 2 + 6, PALETTE.WHITE, 'center');
    this.drawSmallText(ctx, isCoop ? 'PRESS P OR ESC TO RESUME' : 'TOUCH SCREEN TO RESUME', width / 2, height / 2 + 18, PALETTE.BLUE_CYAN, 'center');

    ctx.restore();
  }

  // ==========================================================================
  // 5. Game Over & Accuracy Results Screen
  // ==========================================================================

  public static renderGameOver(context: ScreenRenderContext): void {
    const { ctx, width, stateTimer, blinkTimer, shotsFired, hits, score, highScore } = context;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 1. GAME OVER Title
    HUD.drawText(ctx, 'GAME OVER', width / 2, 74, { color: PALETTE.RED, align: 'center' });

    // 2. Results Header
    HUD.drawText(ctx, '- RESULTS -', width / 2, 102, { color: PALETTE.BLUE_CYAN, align: 'center' });

    // 3. Accuracy Statistics Breakdown
    const safeShots = Math.max(0, shotsFired);
    const safeHits = Math.max(0, Math.min(safeShots, hits));
    const accuracyRatio = safeShots > 0 ? (safeHits / safeShots) * 100 : 0;

    const leftX = 24;
    const rightX = width - 24;

    // Shots Fired
    HUD.drawText(ctx, 'SHOTS FIRED', leftX, 130, { color: PALETTE.YELLOW, align: 'left' });
    HUD.drawText(ctx, safeShots.toString(), rightX, 130, { color: PALETTE.WHITE, align: 'right' });

    // Number of Hits
    HUD.drawText(ctx, 'NUMBER OF HITS', leftX, 150, { color: PALETTE.YELLOW, align: 'left' });
    HUD.drawText(ctx, safeHits.toString(), rightX, 150, { color: PALETTE.WHITE, align: 'right' });

    // Hit-Miss Ratio
    HUD.drawText(ctx, 'HIT-MISS RATIO', leftX, 170, { color: PALETTE.YELLOW, align: 'left' });
    const ratioText = `${accuracyRatio.toFixed(1)} %`;
    HUD.drawText(ctx, ratioText, rightX, 170, { color: PALETTE.BLUE_CYAN, align: 'right' });

    // 4. High Score Celebration
    if (score >= highScore && score > 0) {
      const isRecordBlink = Math.floor(blinkTimer * 3) % 2 === 0;
      if (isRecordBlink) {
        HUD.drawText(ctx, '* NEW HIGH SCORE *', width / 2, 198, { color: PALETTE.YELLOW, align: 'center' });
      }
    }

    // 5. Restart Action Prompt (Visible after 1.5s delay)
    if (stateTimer >= 1.5) {
      const isBlinkOn = Math.floor(blinkTimer * 2.5) % 2 === 0;
      if (isBlinkOn) {
        HUD.drawText(ctx, 'PRESS FIRE OR ENTER', width / 2, 226, { color: PALETTE.RED, align: 'center' });
        this.drawSmallText(ctx, 'CLICK OR TOUCH TO RESTART', width / 2, 242, PALETTE.BLUE_CYAN, 'center');
      }
    }

    ctx.restore();
  }

  // ==========================================================================
  // Helper for small auxiliary text
  // ==========================================================================

  private static drawSmallText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    align: CanvasTextAlign = 'center'
  ): void {
    ctx.save();
    ctx.font = `6px ${this.FONT_FAMILY}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
