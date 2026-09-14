import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PowerUpType, POWERUP_CONFIGS } from '../../src/core/powerups/types';
import { PowerUpItem } from '../../src/core/powerups/PowerUpItem';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { BulletManager } from '../../src/entities/Bullet';
import { EnemyType, EnemyState, type Rect } from '../../src/types';
import { SpriteRenderer } from '../../src/renderer/SpriteRenderer';

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1.0,
    fillStyle: '#FFFFFF',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe('Milestone 11: Player Fighter Upgrade & Power-Up System', () => {
  describe('1. PowerUp Types & Static Configurations', () => {
    it('defines all 5 power-up types in PowerUpType enum', () => {
      expect(PowerUpType.RAPID_FIRE).toBe('RAPID_FIRE');
      expect(PowerUpType.KINETIC_SHIELD).toBe('KINETIC_SHIELD');
      expect(PowerUpType.SCATTER_SHOT).toBe('SCATTER_SHOT');
      expect(PowerUpType.EMP_BOMB).toBe('EMP_BOMB');
      expect(PowerUpType.ENGINE_BOOSTER).toBe('ENGINE_BOOSTER');
    });

    it('provides comprehensive configuration for each capsule type', () => {
      const types = [
        PowerUpType.RAPID_FIRE,
        PowerUpType.KINETIC_SHIELD,
        PowerUpType.SCATTER_SHOT,
        PowerUpType.EMP_BOMB,
        PowerUpType.ENGINE_BOOSTER,
      ];

      for (const t of types) {
        const config = POWERUP_CONFIGS[t];
        expect(config).toBeDefined();
        expect(config.name.length).toBeGreaterThan(0);
        expect(config.description.length).toBeGreaterThan(0);
        expect(config.primaryColor.startsWith('#')).toBe(true);
        expect(config.baseWeight).toBeGreaterThan(0);
        if (config.duration > 0) {
          expect(config.duration).toBe(15.0);
        }
      }
    });
  });

  describe('2. PowerUpItem Kinematics & Lifecycle', () => {
    let item: PowerUpItem;

    beforeEach(() => {
      item = new PowerUpItem();
    });

    it('initializes in an inactive state', () => {
      expect(item.active).toBe(false);
      expect(item.x).toBe(0);
      expect(item.y).toBe(0);
    });

    it('activates and initializes with coordinate and type parameters (x, y, type)', () => {
      item.init(100, 50, PowerUpType.RAPID_FIRE);
      expect(item.active).toBe(true);
      expect(item.x).toBe(100);
      expect(item.y).toBe(50);
      expect(item.baseX).toBe(100);
      expect(item.type).toBe(PowerUpType.RAPID_FIRE);
      expect(item.lifetime).toBe(0);
    });

    it('supports overloaded init with (type, x, y)', () => {
      item.init(PowerUpType.KINETIC_SHIELD, 120, 60);
      expect(item.active).toBe(true);
      expect(item.x).toBe(120);
      expect(item.y).toBe(60);
      expect(item.type).toBe(PowerUpType.KINETIC_SHIELD);
    });

    it('applies vertical drift and sinusoidal horizontal sway', () => {
      item.init(100, 50, PowerUpType.SCATTER_SHOT);

      // Step 1.0s: vy = 60 px/s, so y should be 50 + 60 = 110
      item.update(1.0);
      expect(item.y).toBeCloseTo(110, 1);
      expect(item.lifetime).toBeCloseTo(1.0, 3);

      // x sway = baseX + 12 * sin(3.0 * lifetime + swayPhase)
      const expectedX = item.baseX + Math.sin(item.lifetime * 3.0 + item.swayPhase) * 12.0;
      expect(item.x).toBeCloseTo(expectedX, 1);
    });

    it('clamps horizontal sway within playfield boundaries [10, 214]', () => {
      // Near left boundary
      item.init(12, 50, PowerUpType.EMP_BOMB);
      for (let t = 0; t < 5; t += 0.1) {
        item.update(0.1);
        expect(item.x).toBeGreaterThanOrEqual(10);
        expect(item.x).toBeLessThanOrEqual(214);
      }

      // Near right boundary
      item.init(212, 50, PowerUpType.ENGINE_BOOSTER);
      for (let t = 0; t < 5; t += 0.1) {
        item.update(0.1);
        expect(item.x).toBeGreaterThanOrEqual(10);
        expect(item.x).toBeLessThanOrEqual(214);
      }
    });

    it('despawns automatically when falling past bottom threshold y > 288', () => {
      item.init(112, 280, PowerUpType.RAPID_FIRE);
      expect(item.active).toBe(true);

      // Update 0.2s: y advances 12px -> 292 > 288
      item.update(0.2);
      expect(item.y).toBeGreaterThan(288);
      expect(item.active).toBe(false);
    });

    it('provides accurate 12x12 AABB centered at current position', () => {
      item.init(100, 150, PowerUpType.RAPID_FIRE);
      const box = item.getHitbox();
      expect(box.width).toBe(12);
      expect(box.height).toBe(12);
      expect(box.x).toBe(100 - 6);
      expect(box.y).toBe(150 - 6);
    });

    it('resets cleanly when recycled to pool', () => {
      item.init(100, 150, PowerUpType.RAPID_FIRE);
      item.reset();
      expect(item.active).toBe(false);
      expect(item.x).toBe(0);
      expect(item.y).toBe(0);
      expect(item.baseX).toBe(0);
      expect(item.lifetime).toBe(0);
    });
  });

  describe('3. PowerUpManager Subsystem & Drop Probability', () => {
    let manager: PowerUpManager;

    beforeEach(() => {
      manager = new PowerUpManager();
    });

    it('initializes with a zero-allocation ObjectPool of capacity 32', () => {
      expect(manager.getPoolSize()).toBe(32);
      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getActiveItems().length).toBe(0);
    });

    it('strictly drops 0% power-ups on challenging stages (Stages 3, 7, 11...)', () => {
      // Stages 3, 7, 11 are challenging stages
      for (let i = 0; i < 50; i++) {
        const item3 = manager.spawnDrop(100, 100, 3, EnemyType.BOSS, true);
        const item7 = manager.spawnDrop(100, 100, 7, EnemyType.GOEI, true);
        const item11 = manager.spawnDrop(100, 100, 11, EnemyType.ZAKO, true);
        expect(item3).toBeNull();
        expect(item7).toBeNull();
        expect(item11).toBeNull();
      }
      expect(manager.getActiveCount()).toBe(0);
    });

    it('computes deterministic drop probability formulas based on enemy type and dive state', () => {
      // Baseline non-diving Zako: 0.12
      expect(manager.computeDropChance(1, EnemyType.ZAKO, false)).toBeCloseTo(0.12, 3);
      // Diving Zako (+0.06): 0.18
      expect(manager.computeDropChance(1, EnemyType.ZAKO, true)).toBeCloseTo(0.18, 3);
      // Diving Boss Galaga (+0.10): 0.40
      expect(manager.computeDropChance(1, EnemyType.BOSS, true)).toBeCloseTo(0.40, 3);
    });

    it('leases items from pool and decrements available pool objects', () => {
      // Force spawn 5 items directly
      const items: PowerUpItem[] = [];
      for (let i = 0; i < 5; i++) {
        const item = manager.forceSpawn(50 + i * 20, 50, PowerUpType.RAPID_FIRE);
        expect(item).not.toBeNull();
        if (item) items.push(item);
      }

      expect(manager.getActiveCount()).toBe(5);
      expect(manager.getActiveItems().length).toBe(5);

      // Reset releases all back to pool
      manager.reset();
      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getActiveItems().length).toBe(0);
    });

    it('collects power-up upon collision with Player', () => {
      const player = new Player({ x: 112, y: 240 });
      const item = manager.forceSpawn(112, 240, PowerUpType.RAPID_FIRE);
      expect(item).not.toBeNull();
      expect(manager.getActiveCount()).toBe(1);

      const onCollect = vi.fn();
      manager.onCollect = onCollect;

      manager.checkPlayerCollection(player);

      expect(manager.getActiveCount()).toBe(0);
      expect(onCollect).toHaveBeenCalledWith(PowerUpType.RAPID_FIRE, expect.any(Number), expect.any(Number));
      expect(player.hasRapidFire).toBe(true);
      expect(player.rapidFireTimer).toBeCloseTo(15.0, 1);
    });

    it('caps timed buffs at maximum 30.0 seconds upon repeat pickup', () => {
      const player = new Player({ x: 112, y: 240 });

      // First pickup: 15.0s
      manager.applyPowerUp(PowerUpType.RAPID_FIRE, player);
      expect(player.rapidFireTimer).toBe(15.0);

      // Second pickup: 15.0 + 15.0 = 30.0s
      manager.applyPowerUp(PowerUpType.RAPID_FIRE, player);
      expect(player.rapidFireTimer).toBe(30.0);

      // Third pickup: clamped at 30.0s
      manager.applyPowerUp(PowerUpType.RAPID_FIRE, player);
      expect(player.rapidFireTimer).toBe(30.0);
    });

    it('pauses buff countdown while player is in tractor beam capturing state', () => {
      const player = new Player({ x: 112, y: 240 });
      manager.applyPowerUp(PowerUpType.ENGINE_BOOSTER, player);
      expect(player.engineBoosterTimer).toBe(15.0);

      // In capturing state, buff timers must not tick down
      player.state = 'capturing';
      player.update(1.0);
      expect(player.engineBoosterTimer).toBe(15.0);

      // In normal state, buff timer ticks down
      player.state = 'normal';
      player.update(1.0);
      expect(player.engineBoosterTimer).toBeCloseTo(14.0, 1);
    });
  });

  describe('4. EMP Bomb Detonation Mechanics', () => {
    it('detonates EMP Bomb, clears enemy bullets, damages diving enemies, and triggers shockwave', () => {
      const bulletManager = new BulletManager();
      bulletManager.fireEnemyBullet(100, 100, 0, 150);
      bulletManager.fireEnemyBullet(120, 120, 0, 150);
      expect(bulletManager.getEnemyBulletCount()).toBe(2);

      const divingEnemy = new Enemy({
        id: 'diving_1',
        type: EnemyType.GOEI,
        x: 100,
        y: 100,
      });
      divingEnemy.state = EnemyState.DIVING_SOLO;

      const formationEnemy = new Enemy({
        id: 'form_1',
        type: EnemyType.ZAKO,
        x: 50,
        y: 50,
      });
      formationEnemy.state = EnemyState.IN_FORMATION;

      const mockGame: any = {
        bulletManager,
        formationManager: {
          enemies: [divingEnemy, formationEnemy],
          getLivingEnemies: () => [divingEnemy, formationEnemy],
        },
        soundSynth: {
          playExplosion: vi.fn(),
        },
        particleSystem: {
          spawnEmpShockwave: vi.fn(),
          spawnSmallAlienExplosion: vi.fn(),
        },
      };

      const manager = new PowerUpManager({ game: mockGame });
      const onShockwave = vi.fn();
      manager.onEmpShockwave = onShockwave;

      manager.detonateEmpBomb();

      // Enemy bullets wiped
      expect(bulletManager.getEnemyBulletCount()).toBe(0);

      // Diving enemy took 1 damage and was destroyed
      expect(divingEnemy.state).toBe(EnemyState.EXPLODING);

      // In-formation enemy took no damage
      expect(formationEnemy.state).toBe(EnemyState.IN_FORMATION);

      // Shockwave triggered
      expect(onShockwave).toHaveBeenCalled();
    });
  });

  describe('5. Player Upgrades & Weapon Systems Integration', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: 240 });
    });

    describe('A. Rapid Fire', () => {
      it('halves fire cooldown from 120ms to 60ms', () => {
        expect(player.hasRapidFire).toBe(false);
        player.attemptFire();
        expect(player.fireCooldownTimer).toBeCloseTo(0.12, 3);

        // Reset cooldown & apply Rapid Fire
        player.fireCooldownTimer = 0;
        player.applyPowerUp(PowerUpType.RAPID_FIRE);
        expect(player.hasRapidFire).toBe(true);

        player.attemptFire();
        expect(player.fireCooldownTimer).toBeCloseTo(0.06, 3);
      });

      it('expands missile quota for single and dual fighters', () => {
        // Baseline Single: 2
        expect(player.getMaxMissileQuota()).toBe(2);

        // Rapid Single: 4
        player.applyPowerUp(PowerUpType.RAPID_FIRE);
        expect(player.getMaxMissileQuota()).toBe(4);

        // Reset and test Dual
        player.reset();
        player.isDual = true;
        // Baseline Dual: 4
        expect(player.getMaxMissileQuota()).toBe(4);

        // Rapid Dual: 8
        player.applyPowerUp(PowerUpType.RAPID_FIRE);
        expect(player.getMaxMissileQuota()).toBe(8);
      });
    });

    describe('B. Scatter Shot', () => {
      it('fires a 3-way spread (0°, ±15°) for Single Fighter', () => {
        const firedSpawns: any[] = [];
        player.onFire = (spawns) => {
          firedSpawns.push(...spawns);
        };

        player.applyPowerUp(PowerUpType.SCATTER_SHOT);
        expect(player.hasScatterShot).toBe(true);

        player.attemptFire();
        expect(firedSpawns.length).toBe(3);

        // Left spread (-15°)
        expect(firedSpawns[0].vx).toBeLessThan(0);
        expect(firedSpawns[0].vy).toBeCloseTo(-463.64, 1);
        expect(firedSpawns[0].vx).toBeCloseTo(-124.23, 1);

        // Center missile (0°)
        expect(firedSpawns[1].vx).toBe(0);
        expect(firedSpawns[1].vy).toBe(-480);

        // Right spread (+15°)
        expect(firedSpawns[2].vx).toBeGreaterThan(0);
        expect(firedSpawns[2].vy).toBeCloseTo(-463.64, 1);
        expect(firedSpawns[2].vx).toBeCloseTo(124.23, 1);
      });

      it('fires twin 3-way spreads (6 streams total) for Dual Fighter', () => {
        const firedSpawns: any[] = [];
        player.onFire = (spawns) => {
          firedSpawns.push(...spawns);
        };

        player.isDual = true;
        player.applyPowerUp(PowerUpType.SCATTER_SHOT);

        player.attemptFire();
        expect(firedSpawns.length).toBe(6);

        // Left cannon (x - 8) 3 streams
        expect(firedSpawns[0].x).toBe(player.x - 8);
        expect(firedSpawns[1].x).toBe(player.x - 8);
        expect(firedSpawns[2].x).toBe(player.x - 8);

        // Right cannon (x + 8) 3 streams
        expect(firedSpawns[3].x).toBe(player.x + 8);
        expect(firedSpawns[4].x).toBe(player.x + 8);
        expect(firedSpawns[5].x).toBe(player.x + 8);
      });

      it('expands missile quota appropriately for Scatter Shot alone and with Rapid Fire', () => {
        // Single Scatter: 6
        player.applyPowerUp(PowerUpType.SCATTER_SHOT);
        expect(player.getMaxMissileQuota()).toBe(6);

        // Single Scatter + Rapid: 8
        player.applyPowerUp(PowerUpType.RAPID_FIRE);
        expect(player.getMaxMissileQuota()).toBe(8);

        // Dual Scatter: 12
        player.reset();
        player.isDual = true;
        player.applyPowerUp(PowerUpType.SCATTER_SHOT);
        expect(player.getMaxMissileQuota()).toBe(12);

        // Dual Scatter + Rapid: 16
        player.applyPowerUp(PowerUpType.RAPID_FIRE);
        expect(player.getMaxMissileQuota()).toBe(16);
      });
    });

    describe('C. Kinetic Deflector Shield', () => {
      it('absorbs lethal projectile on Single Fighter without dying', () => {
        player.applyPowerUp(PowerUpType.KINETIC_SHIELD);
        expect(player.hasShield).toBe(true);

        const onShieldDeflect = vi.fn();
        player.onShieldDeflect = onShieldDeflect;

        const threat: Rect = { x: player.x - 2, y: player.y - 2, width: 4, height: 4 };
        const damaged = player.hitTestAndDamage(threat);

        // Deflected hit returns false and absorbs hit
        expect(damaged).toBe(false);
        expect(player.hasShield).toBe(false);
        expect(player.invulnerableTimer).toBeGreaterThanOrEqual(1.0);
        expect(player.shieldFlashTimer).toBeCloseTo(0.3, 2);
        expect(onShieldDeflect).toHaveBeenCalledWith(player.x, player.y);
        expect(player.state).toBe('normal');

        // Subsequent hit without shield destroys player
        player.invulnerableTimer = 0;
        const secondHit = player.hitTestAndDamage(threat);
        expect(secondHit).toBe(true);
        expect(player.state).toBe('destroyed');
      });

      it('absorbs hit on Dual Fighter and preserves both hulls without splitting', () => {
        player.isDual = true;
        player.applyPowerUp(PowerUpType.KINETIC_SHIELD);
        expect(player.hasShield).toBe(true);

        const onExplode = vi.fn();
        player.onExplode = onExplode;

        // Threat hitting left hull
        const threat: Rect = { x: player.x - 10, y: player.y - 2, width: 4, height: 4 };
        const damaged = player.hitTestAndDamage(threat);

        expect(damaged).toBe(false);
        expect(player.hasShield).toBe(false);
        expect(player.isDual).toBe(true);
        expect(player.state).toBe('dual');
        expect(onExplode).not.toHaveBeenCalled();
      });
    });

    describe('D. Engine Booster', () => {
      it('boosts lateral movement speed by 1.5x (260 px/s -> 390 px/s)', () => {
        expect(player.speed).toBe(260);
        expect(player.currentSpeed).toBe(260);

        player.applyPowerUp(PowerUpType.ENGINE_BOOSTER);
        expect(player.hasEngineBooster).toBe(true);
        expect(player.speed).toBe(390);
        expect(player.currentSpeed).toBe(390);

        // Update movement
        player.update(1.0, {
          moveLeft: false,
          moveRight: true,
          fire: false,
          restart: false,
          pause: false,
          touchLeft: false,
          touchRight: false,
          touchFire: false,
          pointerActive: false,
          pointerX: null,
        });

        // Moved 390px clamped at right edge 212
        expect(player.x).toBe(212);
      });
    });
  });

  describe('6. SpriteRenderer Power-Up Asset Verification', () => {
    it('registers 10x10 procedural pixel art sprites for all 5 power-up types', () => {
      SpriteRenderer.initialize();

      const spriteIds = [
        'POWERUP_RAPID_FIRE',
        'POWERUP_KINETIC_SHIELD',
        'POWERUP_SCATTER_SHOT',
        'POWERUP_EMP_BOMB',
        'POWERUP_ENGINE_BOOSTER',
      ];

      for (const id of spriteIds) {
        expect(SpriteRenderer.hasDefinition(id)).toBe(true);
        const dims = SpriteRenderer.getDimensions(id);
        expect(dims).toEqual({ width: 10, height: 10 });
      }
    });

    it('renders drawPowerUpItem and drawPlayerShieldBarrier without throwing errors', () => {
      const ctx = createMockCanvasContext();

      // Render all 5 power up items
      expect(() => {
        SpriteRenderer.drawPowerUpItem(ctx, 'RAPID_FIRE', 100, 100, 0.5);
        SpriteRenderer.drawPowerUpItem(ctx, 'KINETIC_SHIELD', 120, 100, 0.5);
        SpriteRenderer.drawPowerUpItem(ctx, 'SCATTER_SHOT', 140, 100, 0.5);
        SpriteRenderer.drawPowerUpItem(ctx, 'EMP_BOMB', 160, 100, 0.5);
        SpriteRenderer.drawPowerUpItem(ctx, 'ENGINE_BOOSTER', 180, 100, 0.5);
      }).not.toThrow();

      // Render single & dual shield barriers
      expect(() => {
        SpriteRenderer.drawPlayerShieldBarrier(ctx, 112, 240, false, 0, 1.0);
        SpriteRenderer.drawPlayerShieldBarrier(ctx, 112, 240, true, 0.2, 1.0);
      }).not.toThrow();
    });
  });
});
