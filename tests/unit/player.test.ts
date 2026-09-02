/**
 * Galaga Arcade Web Game — Player, Bullet & SpriteRenderer Unit Tests
 * 
 * Exhaustive unit test suite verifying:
 * 1. Player 7-state finite state machine (normal, capturing, captured, docking, dual, destroyed, respawning).
 * 2. 1D kinematics, instantaneous stop, pointer anti-jitter, and strict boundary clamping.
 * 3. Weapon firing limits (Single: max 2, Dual: max 4 twin missiles) & 120ms cadence cooldown.
 * 4. Asymmetrical partial destruction (left/right hull loss without life deduction) & catastrophic dual loss.
 * 5. 3.0s blinking invulnerability and collision immunity.
 * 6. Bullet entity & BulletManager with zero-allocation ObjectPool, directional aiming, and swept CCD.
 * 7. SpriteRenderer procedural pixel matrices, offscreen pre-baking, and fast-path/transformed drawing.
 * 8. Full Game coordinator integration with player steering, shooting, and rendering.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Player } from '../../src/entities/Player';
import { Bullet, BulletManager, BULLET_CONFIG } from '../../src/entities/Bullet';
import {
  SpriteRenderer,
  PLAYER_FIGHTER_MATRIX,
  DUAL_FIGHTER_MATRIX,
  CAPTURED_FIGHTER_MATRIX,
  PLAYER_MISSILE_MATRIX,
  ENEMY_BULLET_MATRIX,
  ENEMY_FAST_BEAM_MATRIX,
  PLAYER_LIFE_ICON_MATRIX,
  PALETTE_CHAR_MAP,
} from '../../src/renderer/SpriteRenderer';
import { Game } from '../../src/core/Game';
import type { InputState, Rect } from '../../src/types';

function createMockInput(overrides: Partial<InputState> = {}): InputState {
  return {
    moveLeft: false,
    moveRight: false,
    fire: false,
    pause: false,
    restart: false,
    pointerX: null,
    pointerActive: false,
    touchLeft: false,
    touchRight: false,
    touchFire: false,
    ...overrides,
  };
}

describe('Milestone 3: Player Entity & Dual Docking Subsystem', () => {
  let player: Player;

  beforeEach(() => {
    player = new Player({ x: 112, y: 250, lives: 3 });
  });

  // ==========================================================================
  // 1. Lifecycle & State Machine Initializations
  // ==========================================================================
  describe('Lifecycle & State Transitions', () => {
    it('initializes with default single fighter properties', () => {
      expect(player.x).toBe(112);
      expect(player.y).toBe(250);
      expect(player.vx).toBe(0);
      expect(player.vy).toBe(0);
      expect(player.lives).toBe(3);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.canFire).toBe(true);
      expect(player.isInvulnerable()).toBe(false);

      const data = player.toData();
      expect(data.state).toBe('ALIVE');
      expect(data.lives).toBe(3);
      expect(data.isDual).toBe(false);
    });

    it('respawns with 3.0s invulnerability timer and transitions to normal on expiry', () => {
      player.respawn();
      expect(player.state).toBe('respawning');
      expect(player.isInvulnerable()).toBe(true);
      expect(player.invulnerableTimer).toBe(3.0);

      // Update 1.5s -> still respawning and invulnerable
      player.update(1.5);
      expect(player.state).toBe('respawning');
      expect(player.isInvulnerable()).toBe(true);
      expect(player.invulnerableTimer).toBeCloseTo(1.5, 4);

      // Update remaining 1.5s -> transitions to normal
      player.update(1.5);
      expect(player.state).toBe('normal');
      expect(player.isInvulnerable()).toBe(false);
      expect(player.invulnerableTimer).toBe(0);
    });

    it('handles tractor beam capture sequence and respawn when lives > 0', () => {
      const onGameOver = vi.fn();
      player.onGameOver = onGameOver;

      player.startCapture(112, 80);
      expect(player.state).toBe('capturing');
      expect(player.isInvulnerable()).toBe(false);

      // Update capture animation for 2.5s
      player.update(2.5);
      expect(player.lives).toBe(2);
      // Auto-respawned since lives > 0
      expect(player.state).toBe('respawning');
      expect(onGameOver).not.toHaveBeenCalled();
    });

    it('triggers game over when captured with 1 remaining life', () => {
      const onGameOver = vi.fn();
      player.lives = 1;
      player.onGameOver = onGameOver;

      player.startCapture(112, 80);
      player.update(2.5);

      expect(player.lives).toBe(0);
      expect(onGameOver).toHaveBeenCalledTimes(1);
    });

    it('handles destruction delay and auto-respawn', () => {
      const onExplode = vi.fn();
      player.onExplode = onExplode;

      player.destroy();
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
      expect(player.deathTimer).toBe(Player.DEATH_DURATION);
      expect(onExplode).toHaveBeenCalledWith(112, 250, false);

      // Update death timer
      player.update(Player.DEATH_DURATION);
      expect(player.state).toBe('respawning');
      expect(player.lives).toBe(2);
    });

    it('triggers game over on last life destruction', () => {
      const onGameOver = vi.fn();
      player.lives = 1;
      player.onGameOver = onGameOver;

      player.destroy();
      expect(player.lives).toBe(0);
      player.update(Player.DEATH_DURATION);
      expect(onGameOver).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. Kinematics & Boundary Clamping
  // ==========================================================================
  describe('1D Horizontal Kinematics & Boundary Clamping', () => {
    it('moves left and right at exactly 260 px/s with zero inertia', () => {
      const inputLeft = createMockInput({ moveLeft: true });
      player.update(0.1, inputLeft);
      expect(player.vx).toBe(-260);
      expect(player.x).toBeCloseTo(112 - 26, 4);

      // Release key -> instantaneous stop
      const inputIdle = createMockInput();
      player.update(0.1, inputIdle);
      expect(player.vx).toBe(0);
      expect(player.x).toBeCloseTo(112 - 26, 4);

      // Move right
      const inputRight = createMockInput({ moveRight: true });
      player.update(0.1, inputRight);
      expect(player.vx).toBe(260);
      expect(player.x).toBeCloseTo(112, 4);
    });

    it('strictly clamps Single Fighter within [12, 212] boundaries', () => {
      const inputLeft = createMockInput({ moveLeft: true });
      for (let i = 0; i < 60; i++) {
        player.update(0.1, inputLeft);
      }
      expect(player.x).toBe(12);

      const inputRight = createMockInput({ moveRight: true });
      for (let i = 0; i < 60; i++) {
        player.update(0.1, inputRight);
      }
      expect(player.x).toBe(212);
    });

    it('strictly clamps Dual Fighter within [16, 208] boundaries', () => {
      player.isDual = true;

      const inputLeft = createMockInput({ moveLeft: true });
      for (let i = 0; i < 60; i++) {
        player.update(0.1, inputLeft);
      }
      expect(player.x).toBe(16);

      const inputRight = createMockInput({ moveRight: true });
      for (let i = 0; i < 60; i++) {
        player.update(0.1, inputRight);
      }
      expect(player.x).toBe(208);
    });

    it('steers via pointer absolute positioning with deadzone anti-jitter', () => {
      const input = createMockInput({ pointerActive: true, pointerX: 150 });
      player.update(0.1, input); // Speed 260 * 0.1 = 26px -> x moves from 112 to 138
      expect(player.x).toBeCloseTo(138, 4);

      // Close enough to snap without jitter
      const inputClose = createMockInput({ pointerActive: true, pointerX: 140 });
      player.update(0.1, inputClose);
      expect(player.x).toBe(140);
      expect(player.vx).toBe(0);
    });
  });

  // ==========================================================================
  // 3. Rescued Fighter Docking Sequence
  // ==========================================================================
  describe('Rescued Fighter Docking Mechanics', () => {
    it('initiates rescue descent and tracks active ship towards dual formation', () => {
      const onDocked = vi.fn();
      player.onDocked = onDocked;

      player.startRescue(140, 50);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);
      expect(player.rescuedFighter.x).toBe(140);
      expect(player.rescuedFighter.y).toBe(50);

      // Active ship can still move during docking
      const inputRight = createMockInput({ moveRight: true });
      // Update until rescued fighter reaches baseline (distance ~200px / 120px/s ~= 1.7s)
      for (let i = 0; i < 120; i++) {
        player.update(1 / 60, inputRight);
        if (player.state === 'dual') break;
      }

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.rescuedFighter.active).toBe(false);
      expect(onDocked).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 4. Weapon Firing & Quota Enforcement
  // ==========================================================================
  describe('Weapon Firing & Quota Enforcement', () => {
    it('enforces max 2 missiles for Single Fighter with 120ms cooldown', () => {
      const onFire = vi.fn();
      player.onFire = onFire;

      // Shot 1: Success
      expect(player.attemptFire()).toBe(true);
      expect(onFire).toHaveBeenCalledTimes(1);
      player.activeMissileCount = 1;

      // Shot 2 immediate: Blocked by cooldown
      expect(player.attemptFire()).toBe(false);

      // Wait 120ms cooldown
      player.update(0.12);

      // Shot 2: Success
      expect(player.attemptFire()).toBe(true);
      expect(onFire).toHaveBeenCalledTimes(2);
      player.activeMissileCount = 2;

      // Wait cooldown, but quota is full (2 missiles)
      player.update(0.12);
      expect(player.attemptFire()).toBe(false);

      // Recycle 1 missile -> allows 1 more shot
      player.activeMissileCount = 1;
      expect(player.attemptFire()).toBe(true);
      expect(onFire).toHaveBeenCalledTimes(3);
    });

    it('fires twin missiles simultaneously for Dual Fighter up to 4 missiles', () => {
      player.isDual = true;
      const onFire = vi.fn();
      player.onFire = onFire;

      // Shot 1: Fires 2 twin bullets
      expect(player.attemptFire()).toBe(true);
      expect(onFire).toHaveBeenCalledTimes(1);
      const calls = onFire.mock.calls as unknown[][];
      const spawns1 = calls[0]?.[0] as Array<{ x: number; y: number }> | undefined;
      expect(spawns1).toBeDefined();
      expect(spawns1?.length).toBe(2);
      expect(spawns1?.[0]?.x).toBe(player.x - 8);
      expect(spawns1?.[1]?.x).toBe(player.x + 8);
      player.activeMissileCount = 2;

      // Wait cooldown
      player.update(0.12);

      // Shot 2: Fires another pair (active = 4)
      expect(player.attemptFire()).toBe(true);
      expect(onFire).toHaveBeenCalledTimes(2);
      player.activeMissileCount = 4;

      // Quota saturated -> cannot fire
      player.update(0.12);
      expect(player.attemptFire()).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Asymmetrical Partial Destruction & Hit Testing
  // ==========================================================================
  describe('Asymmetrical Partial Destruction', () => {
    it('destroys Left Hull on left-side collision without losing lives', () => {
      player.isDual = true;
      player.x = 100;
      const onExplode = vi.fn();
      player.onExplode = onExplode;

      // Threat colliding only with Left Hull (x: 100 - 16 = 84..99)
      const threat: Rect = { x: 86, y: 246, width: 4, height: 6 };
      const damaged = player.hitTestAndDamage(threat);

      expect(damaged).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.lives).toBe(3); // Lives preserved!
      expect(player.x).toBe(108); // Center shifted to surviving right hull (+8)
      expect(onExplode).toHaveBeenCalledWith(92, 250, true);
    });

    it('destroys Right Hull on right-side collision without losing lives', () => {
      player.isDual = true;
      player.x = 100;
      const onExplode = vi.fn();
      player.onExplode = onExplode;

      // Threat colliding only with Right Hull (x: 100 + 1 = 101..116)
      const threat: Rect = { x: 108, y: 246, width: 4, height: 6 };
      const damaged = player.hitTestAndDamage(threat);

      expect(damaged).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.lives).toBe(3); // Lives preserved!
      expect(player.x).toBe(92); // Center shifted to surviving left hull (-8)
      expect(onExplode).toHaveBeenCalledWith(108, 250, true);
    });

    it('destroys Dual Fighter entirely when hit in center spanning both hulls', () => {
      player.isDual = true;
      player.x = 100;
      const onExplode = vi.fn();
      player.onExplode = onExplode;

      // Large threat spanning both hulls (84 to 116)
      const threat: Rect = { x: 90, y: 246, width: 20, height: 10 };
      const damaged = player.hitTestAndDamage(threat);

      expect(damaged).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2); // Life deducted for full loss
      expect(onExplode).toHaveBeenCalledWith(100, 250, false);
    });

    it('ignores collisions while invulnerable', () => {
      player.respawn();
      expect(player.isInvulnerable()).toBe(true);

      const threat: Rect = { x: 106, y: 244, width: 12, height: 12 };
      expect(player.hitTestAndDamage(threat)).toBe(false);
      expect(player.state).toBe('respawning');
      expect(player.lives).toBe(3);
    });
  });
});

describe('Milestone 3: Bullet & Projectile Subsystem', () => {
  let bulletManager: BulletManager;

  beforeEach(() => {
    bulletManager = new BulletManager();
  });

  it('manages player missiles with quota gating and vertical speed -480 px/s', () => {
    expect(BULLET_CONFIG.PLAYER_SPEED).toBe(480);
    expect(bulletManager.getPlayerBulletCount()).toBe(0);

    const b1 = bulletManager.firePlayerBullet(100, 240, false);
    expect(b1).not.toBeNull();
    expect(b1?.velocity.y).toBe(-480);
    expect(b1?.velocity.x).toBe(0);
    expect(b1?.owner).toBe('PLAYER');
    expect(bulletManager.getPlayerBulletCount()).toBe(1);

    const b2 = bulletManager.firePlayerBullet(110, 240, false);
    expect(b2).not.toBeNull();
    expect(bulletManager.getPlayerBulletCount()).toBe(2);

    // 3rd bullet exceeds Single Fighter quota (2)
    const b3 = bulletManager.firePlayerBullet(120, 240, false);
    expect(b3).toBeNull();
    expect(bulletManager.getPlayerBulletCount()).toBe(2);

    // Recycle 1 bullet
    if (b1) bulletManager.recycle(b1);
    expect(bulletManager.getPlayerBulletCount()).toBe(1);

    // Now allowed to fire again
    const b4 = bulletManager.firePlayerBullet(120, 240, false);
    expect(b4).not.toBeNull();
    expect(bulletManager.getPlayerBulletCount()).toBe(2);
  });

  it('fires enemy bullets directionally toward target', () => {
    const enemyBullet = bulletManager.fireEnemyBullet(100, 50, 100, 250, 200);
    expect(enemyBullet).not.toBeNull();
    expect(enemyBullet?.velocity.x).toBeCloseTo(0, 4);
    expect(enemyBullet?.velocity.y).toBeCloseTo(200, 4);
    expect(enemyBullet?.owner).toBe('ENEMY');

    // Angled trajectory (45 degrees)
    const angledBullet = bulletManager.fireEnemyBullet(0, 0, 100, 100, 200);
    expect(angledBullet).not.toBeNull();
    expect(angledBullet?.velocity.x).toBeCloseTo(200 * Math.SQRT1_2, 2);
    expect(angledBullet?.velocity.y).toBeCloseTo(200 * Math.SQRT1_2, 2);
  });

  it('calculates static and continuous swept CCD hitboxes', () => {
    const bullet = new Bullet(1);
    bullet.init(100, 200, 0, -480, 'PLAYER');

    // Static hitbox (2x6)
    const staticBox = bullet.getHitbox();
    expect(staticBox).toEqual({
      x: 99,
      y: 197,
      width: 2,
      height: 6,
    });

    // Update 1 frame (1/60s -> -8px)
    bullet.update(1 / 60);
    expect(bullet.position.y).toBeCloseTo(192, 4);

    // Swept hitbox spanning from 200 down to 192
    const sweptBox = bullet.getSweptHitbox();
    expect(sweptBox.x).toBe(99);
    expect(sweptBox.width).toBe(2);
    expect(sweptBox.y).toBeCloseTo(189, 4);
    expect(sweptBox.height).toBeCloseTo(14, 4);
  });

  it('recycles out-of-bounds projectiles automatically during update', () => {
    const b = bulletManager.firePlayerBullet(100, 5, false);
    expect(bulletManager.getPlayerBulletCount()).toBe(1);

    // Move past top edge (-8px margin)
    bulletManager.update(0.1); // -480 * 0.1 = -48px -> y = -43px
    expect(bulletManager.getPlayerBulletCount()).toBe(0);
    expect(b?.active).toBe(false);
  });
});

describe('Milestone 3: SpriteRenderer & Procedural Pixel Art', () => {
  beforeEach(() => {
    SpriteRenderer.clear();
    SpriteRenderer.initialize();
  });

  it('initializes and bakes all procedural sprites', () => {
    expect(SpriteRenderer.isReady()).toBe(true);
    expect(SpriteRenderer.getDimensions('PLAYER_FIGHTER')).toEqual({ width: 15, height: 16 });
    expect(SpriteRenderer.getDimensions('DUAL_FIGHTER')).toEqual({ width: 31, height: 16 });
    expect(SpriteRenderer.getDimensions('CAPTURED_FIGHTER')).toEqual({ width: 15, height: 16 });
    expect(SpriteRenderer.getDimensions('PLAYER_MISSILE')).toEqual({ width: 3, height: 8 });
    expect(SpriteRenderer.getDimensions('ENEMY_BULLET')).toEqual({ width: 3, height: 6 });
    expect(SpriteRenderer.getDimensions('ENEMY_FAST_BEAM')).toEqual({ width: 3, height: 8 });
    expect(SpriteRenderer.getDimensions('PLAYER_LIFE_ICON')).toEqual({ width: 11, height: 10 });
  });

  it('verifies bilateral symmetry of Player Fighter sprite matrix', () => {
    expect(PLAYER_FIGHTER_MATRIX.length).toBe(16);
    for (let r = 0; r < 16; r++) {
      const row = PLAYER_FIGHTER_MATRIX[r];
      expect(row).toBeDefined();
      if (!row) continue;
      expect(row.length).toBe(15);
      for (let c = 0; c < 7; c++) {
        expect(row[c]).toBe(row[14 - c]);
      }
    }
  });

  it('verifies bilateral symmetry and valid colors for Captured Fighter sprite matrix', () => {
    expect(CAPTURED_FIGHTER_MATRIX.length).toBe(16);
    for (let r = 0; r < 16; r++) {
      const row = CAPTURED_FIGHTER_MATRIX[r];
      expect(row).toBeDefined();
      if (!row) continue;
      expect(row.length).toBe(15);
      for (let c = 0; c < 7; c++) {
        expect(row[c]).toBe(row[14 - c]);
      }
      for (let c = 0; c < 15; c++) {
        const char = row[c] ?? '.';
        expect(PALETTE_CHAR_MAP[char]).toBeDefined();
      }
    }
  });

  it('verifies Dual Fighter composition integrity', () => {
    expect(DUAL_FIGHTER_MATRIX.length).toBe(16);
    for (let r = 0; r < 16; r++) {
      const row = DUAL_FIGHTER_MATRIX[r];
      expect(row).toBeDefined();
      if (!row) continue;
      expect(row.length).toBe(31);
      // Left ship matches right ship
      for (let c = 0; c < 15; c++) {
        expect(row[c]).toBe(row[16 + c]);
      }
    }
  });

  it('verifies missile, bullet, and life icon matrices', () => {
    expect(PLAYER_MISSILE_MATRIX.length).toBe(8);
    expect(ENEMY_BULLET_MATRIX.length).toBe(6);
    expect(ENEMY_FAST_BEAM_MATRIX.length).toBe(8);
    expect(PLAYER_LIFE_ICON_MATRIX.length).toBe(10);
  });

  it('draws fast-path and transformed sprites safely', () => {
    const mockCtx = {
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      globalAlpha: 1.0,
    } as unknown as CanvasRenderingContext2D;

    // Fast path: No rotation, scale 1.0
    SpriteRenderer.draw(mockCtx, 'PLAYER_FIGHTER', 100, 200);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(1);
    expect(mockCtx.save).not.toHaveBeenCalled();

    // Transformed path: Rotation
    SpriteRenderer.draw(mockCtx, 'CAPTURED_FIGHTER', 100, 200, { rotation: Math.PI / 2 });
    expect(mockCtx.save).toHaveBeenCalledTimes(1);
    expect(mockCtx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(mockCtx.restore).toHaveBeenCalledTimes(1);
  });
});

describe('Milestone 3: Game Master Coordinator Integration', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  it('wires Player and BulletManager subsystems into Game', () => {
    expect(game.getPlayer()).toBeDefined();
    expect(game.getBulletManager()).toBeDefined();
    expect(game.getPlayer().lives).toBe(3);
    expect(game.getBulletManager().getPlayerBulletCount()).toBe(0);
  });

  it('updates player input and projectile simulation during gameplay', () => {
    game.startGame();
    expect(game.state).toBe('STAGE_INTRO');

    // Fast-forward stage intro (2.2s)
    game.update(2.3);
    expect(game.state).toBe('PLAYING');

    // Simulate move right & fire via InputHandler state
    vi.spyOn(game.getInputHandler(), 'getState').mockReturnValue(
      createMockInput({ moveRight: true, fire: true })
    );

    game.update(1 / 60);

    expect(game.getPlayer().vx).toBe(260);
    expect(game.getBulletManager().getPlayerBulletCount()).toBe(1);
  });

  it('renders game scene with player and bullets without runtime exceptions', () => {
    game.startGame();
    game.update(2.3);

    const mockCtx = {
      canvas: game.getCanvas(),
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      globalAlpha: 1.0,
      imageSmoothingEnabled: false,
      fillRect: vi.fn(),
      fillText: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    expect(() => game.render(mockCtx)).not.toThrow();
  });
});
