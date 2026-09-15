/**
 * Galaga Arcade Web Game — Multi-Entity Player Manager Subsystem
 * 
 * Manages independent Player entities (P1 Classic Cyan/White & P2 Crimson/Amber)
 * across Single-Player and Local 2-Player Co-op modes.
 * 
 * Features:
 * - Decoupled state management: independent positions, velocities, hitboxes,
 *   lives, scores, power-ups, and docking states.
 * - Symmetrical dual update and render loops with zero runtime allocations.
 * - 100% backward compatibility for single-player systems and existing test suites.
 */

import { Player } from '../entities/Player';
import type { PlayerId, InputState } from '../types';

export type PlayerManagerMode = 'single' | 'coop';

export interface DualInputState {
  p1?: InputState;
  p2?: InputState;
}

export class PlayerManager {
  public mode: PlayerManagerMode = 'single';
  public onPlayerCreated?: (player: Player) => void;
  private p1: Player;
  private p2: Player | null = null;
  private game?: any;
  private readonly p1Array: Player[];
  private readonly coopArray: Player[];
  private readonly livingPlayersBuffer: Player[] = [];

  private updateCachedArrays(): void {
    if (this.p1Array) {
      this.p1Array[0] = this.p1;
    }
    if (this.coopArray) {
      this.coopArray[0] = this.p1;
      if (this.p2) {
        this.coopArray[1] = this.p2;
      }
    }
  }

  constructor(
    gameOrP1?: any,
    mode: PlayerManagerMode = 'single',
    onPlayerCreated?: (player: Player) => void
  ) {
    if (gameOrP1 instanceof Player) {
      this.p1 = gameOrP1;
      this.mode = mode;
      this.onPlayerCreated = onPlayerCreated;
    } else {
      this.game = gameOrP1;
      this.mode = mode;
      this.onPlayerCreated = onPlayerCreated;

      const p1StartX = mode === 'coop' ? 80 : 112;
      this.p1 = new Player({
        id: 'p1',
        colorScheme: 'classic',
        x: p1StartX,
        y: Player.BASELINE_Y,
        lives: 3,
        game: this.game,
      });
      this.onPlayerCreated?.(this.p1);
    }

    if (mode === 'coop' && !this.p2) {
      this.p2 = new Player({
        id: 'p2',
        colorScheme: 'crimson',
        x: 144,
        y: Player.BASELINE_Y,
        lives: 3,
        game: this.game,
      });
      this.onPlayerCreated?.(this.p2);
    }

    this.p1Array = [this.p1];
    this.coopArray = this.p2 ? [this.p1, this.p2] : [this.p1, this.p1];
  }

  // ==========================================================================
  // Mode & Query Methods
  // ==========================================================================

  public isCoop(): boolean {
    return this.mode === 'coop';
  }

  public getMode(): PlayerManagerMode {
    return this.mode;
  }

  public setMode(mode: PlayerManagerMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    if (mode === 'coop') {
      if (!this.p2) {
        this.p2 = new Player({
          id: 'p2',
          colorScheme: 'crimson',
          x: 144,
          y: Player.BASELINE_Y,
          lives: 3,
          game: this.game,
        });
        this.onPlayerCreated?.(this.p2);
      }
      this.updateCachedArrays();
    }
  }

  /**
   * Returns active players array based on current mode.
   * Single-player returns [p1], Co-op returns [p1, p2].
   */
  public getPlayers(): Player[] {
    if (this.mode === 'coop' && this.p2) {
      return this.coopArray;
    }
    return this.p1Array;
  }

  /**
   * Returns a specific player by ID ('p1' or 'p2').
   */
  public getPlayer(id: PlayerId = 'p1'): Player | undefined {
    if (id === 'p2') {
      return this.mode === 'coop' ? (this.p2 ?? undefined) : undefined;
    }
    return this.p1;
  }

  /**
   * Replaces or registers a player entity.
   */
  public setPlayer(id: PlayerId, player: Player): void {
    if (id === 'p2') {
      this.p2 = player;
    } else {
      this.p1 = player;
    }
    this.updateCachedArrays();
    this.onPlayerCreated?.(player);
  }

  /**
   * Registers or removes Player 2.
   */
  public setPlayer2(player: Player | null): void {
    this.p2 = player;
    if (player) {
      this.mode = 'coop';
      this.updateCachedArrays();
      this.onPlayerCreated?.(player);
    } else {
      this.mode = 'single';
    }
  }

  /**
   * Returns players that are currently alive or active.
   */
  public getLivingPlayers(): Player[] {
    this.livingPlayersBuffer.length = 0;
    const players = this.getPlayers();
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p) continue;
      const s = p.state;
      if (
        s !== 'destroyed' &&
        s !== 'DESTROYED' &&
        s !== 'eliminated' &&
        (s as any) !== 'ELIMINATED' &&
        (p.lives > 0 || s === 'respawning' || s === 'RESPAWNING')
      ) {
        this.livingPlayersBuffer.push(p);
      }
    }
    return this.livingPlayersBuffer;
  }

  /**
   * Returns count of active players currently controllable on screen.
   */
  public getActiveCount(): number {
    return this.getLivingPlayers().length;
  }

  /**
   * Evaluates whether a donor player possesses reserve lives (>1)
   * and the partner player is in a valid REVIVE_PENDING state.
   */
  public canDonateLife(donorId: PlayerId): boolean {
    if (this.mode !== 'coop') return false;
    const donor = this.getPlayer(donorId);
    const recipient = this.getPlayer(donorId === 'p1' ? 'p2' : 'p1');
    if (!donor || !recipient) return false;

    // Donor must be alive and have at least 1 reserve life (lives > 1)
    if (donor.lives <= 1 || !donor.isAlive()) return false;

    // Recipient must be down / revive_pending / destroyed with 0 lives
    const s = recipient.state;
    return (
      ((s === 'revive_pending' || (s as any) === 'REVIVE_PENDING') && recipient.reviveTimer > 0) ||
      ((s === 'destroyed' || s === 'eliminated' || s === 'captured') && recipient.lives <= 0)
    );
  }

  /**
   * Executes atomic life donation transfer from donor to recipient.
   * Returns true if donation succeeded, false otherwise.
   */
  public donateLife(donorId: PlayerId): boolean {
    if (!this.canDonateLife(donorId)) return false;

    const donor = this.getPlayer(donorId)!;
    const recipient = this.getPlayer(donorId === 'p1' ? 'p2' : 'p1')!;

    // 1. Deduct donor reserve life
    donor.lives -= 1;
    this.game?.scoreManager?.setLives(donor.lives, donor.id);

    // 2. Grant life to recipient and reset timer
    recipient.lives = 1;
    recipient.reviveTimer = 0;
    this.game?.scoreManager?.setLives(recipient.lives, recipient.id);

    // 3. Trigger recipient respawn (invulnerability at baseline)
    recipient.respawn();

    // 4. Feedback audio & particles
    this.game?.soundSynth?.playLifeDonatedChime?.();
    this.game?.particleSystem?.spawnReviveSparkles?.(donor.x, donor.y, recipient.x, recipient.y);

    return true;
  }

  /**
   * Returns true if any player is actively in REVIVE_PENDING.
   */
  public isAnyPlayerReviving(): boolean {
    return this.getPlayers().some(
      (p) =>
        (p.state === 'revive_pending' || (p.state as any) === 'REVIVE_PENDING') &&
        p.reviveTimer > 0
    );
  }

  /**
   * Evaluates if all managed players are permanently eliminated.
   * Returns false if any player has lives > 0 OR has an active revive timer > 0.
   */
  public areAllPlayersDead(): boolean {
    const players = this.getPlayers();
    if (players.length === 0) return true;

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p) continue;
      // 1. Any player actively alive (flying controllable/respawning/docking) or with reserve lives
      if (p.isAlive() || p.lives > 0) return false;

      const s = p.state;
      // 2. Any player in revive_pending with emergency countdown remaining
      if (
        (s === 'revive_pending' || (s as any) === 'REVIVE_PENDING') &&
        p.reviveTimer > 0
      ) {
        return false;
      }
      // 3. Any player in co-op death explosion
      if (
        (typeof p.isCoop === 'function' ? p.isCoop() : false) &&
        (s === 'destroyed' || (s as any) === 'DESTROYED') &&
        p.deathTimer > 0
      ) {
        return false;
      }
      // 4. Any player in tractor beam capture or docking (rescueable)
      if (
        s === 'captured' ||
        (s as any) === 'CAPTURED' ||
        s === 'capturing' ||
        (s as any) === 'CAPTURING' ||
        s === 'docking' ||
        (s as any) === 'DOCKING'
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Pity revive hook executed upon wave/stage clear.
   * In co-op mode, fallen or eliminated partner is revived with 1 life.
   */
  public onStageClear(): void {
    if (this.mode !== 'coop') return;

    for (const p of this.getPlayers()) {
      if (
        p.lives <= 0 ||
        p.state === 'revive_pending' ||
        (p.state as any) === 'REVIVE_PENDING' ||
        p.state === 'eliminated' ||
        (p.state as any) === 'ELIMINATED'
      ) {
        p.lives = 1;
        p.reviveTimer = 0;
        this.game?.scoreManager?.setLives(1, p.id);
        p.respawn();
      }
    }
  }

  // ==========================================================================
  // Lifecycle & Reset
  // ==========================================================================

  /**
   * Resets all player entities to initial baseline coordinates and lives.
   */
  public reset(mode?: PlayerManagerMode): void {
    if (mode !== undefined) {
      this.setMode(mode);
    }

    if (this.mode === 'coop') {
      this.p1.reset(80, Player.BASELINE_Y, 3);
      if (!this.p2) {
        this.p2 = new Player({
          id: 'p2',
          colorScheme: 'crimson',
          x: 144,
          y: Player.BASELINE_Y,
          lives: 3,
          game: this.game,
        });
        this.updateCachedArrays();
        this.onPlayerCreated?.(this.p2);
      } else {
        this.p2.reset(144, Player.BASELINE_Y, 3);
      }
    } else {
      this.p1.reset(112, Player.BASELINE_Y, 3);
    }
  }

  // ==========================================================================
  // Simulation Loop: Update & Render
  // ==========================================================================

  /**
   * Updates all active players per tick.
   * Supports unified InputState, dual input object, or Map<PlayerId, InputState>.
   */
  public update(
    dt: number,
    inputs?: InputState | DualInputState | Map<PlayerId, InputState>
  ): void {
    let p1Input: InputState | undefined;
    let p2Input: InputState | undefined;

    if (inputs) {
      if (inputs instanceof Map) {
        p1Input = inputs.get('p1');
        p2Input = inputs.get('p2');
      } else if ('p1' in inputs || 'p2' in inputs) {
        p1Input = (inputs as DualInputState).p1;
        p2Input = (inputs as DualInputState).p2;
      } else {
        p1Input = inputs as InputState;
      }
    }

    this.p1.update(dt, p1Input);

    if (this.mode === 'coop' && this.p2) {
      this.p2.update(dt, p2Input);
    }
  }

  /**
   * Renders all active players to canvas context.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    this.p1.render(ctx);

    if (this.mode === 'coop' && this.p2) {
      this.p2.render(ctx);
    }
  }
}
