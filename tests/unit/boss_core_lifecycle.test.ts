import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { BossFactory } from '../../src/core/boss/BossFactory';
import { BossManager } from '../../src/core/boss/BossManager';
import { CyberDreadnought } from '../../src/core/boss/bosses/CyberDreadnought';
import { DimensionalLeviathan } from '../../src/core/boss/bosses/DimensionalLeviathan';
import { NaniteColossus } from '../../src/core/boss/bosses/NaniteColossus';
import { PsionicHarbinger } from '../../src/core/boss/bosses/PsionicHarbinger';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';

describe('Milestone 12: Boss Core Lifecycle & System Contracts', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  describe('1. DifficultyCalculator Boss Stage Recognition', () => {
    it('identifies stages 10, 20, 30, 40, and 50 as boss stages', () => {
      const bossStages = [10, 20, 30, 40, 50];
      for (const st of bossStages) {
        expect(DifficultyCalculator.isBossStage(st)).toBe(true);
      }
    });

    it('identifies non-boss stages 1..9, 11..19, 21..29, 31..39, 41..49, 51..100 as false', () => {
      const bossStages = new Set([10, 20, 30, 40, 50]);
      for (let st = 1; st <= 100; st++) {
        if (!bossStages.has(st)) {
          expect(DifficultyCalculator.isBossStage(st)).toBe(false);
        }
      }
    });
  });

  describe('2. BossFactory Instantiation Contract', () => {
    it('instantiates the CyberDreadnought for Stage 10', () => {
      const boss = BossFactory.createBoss(10, game);
      expect(boss).toBeInstanceOf(CyberDreadnought);
      expect(boss?.stage).toBe(10);
      expect(boss?.maxHealth).toBe(80);
    });

    it('instantiates the DimensionalLeviathan for Stage 20', () => {
      const boss = BossFactory.createBoss(20, game);
      expect(boss).toBeInstanceOf(DimensionalLeviathan);
      expect(boss?.stage).toBe(20);
      expect(boss?.maxHealth).toBe(120);
    });

    it('instantiates the NaniteColossus for Stage 30', () => {
      const boss = BossFactory.createBoss(30, game);
      expect(boss).toBeInstanceOf(NaniteColossus);
      expect(boss?.stage).toBe(30);
      expect(boss?.maxHealth).toBe(150);
    });

    it('instantiates the PsionicHarbinger for Stage 40', () => {
      const boss = BossFactory.createBoss(40, game);
      expect(boss).toBeInstanceOf(PsionicHarbinger);
      expect(boss?.stage).toBe(40);
      expect(boss?.maxHealth).toBe(180);
    });

    it('instantiates the AeternumCore for Stage 50', () => {
      const boss = BossFactory.createBoss(50, game);
      expect(boss).toBeInstanceOf(AeternumCore);
      expect(boss?.stage).toBe(50);
      expect(boss?.maxHealth).toBe(300);
    });

    it('returns null for non-boss stages', () => {
      expect(BossFactory.createBoss(1, game)).toBeNull();
      expect(BossFactory.createBoss(15, game)).toBeNull();
      expect(BossFactory.createBoss(51, game)).toBeNull();
    });
  });

  describe('3. BossManager State & Coordination', () => {
    it('initializes in clean inactive state', () => {
      const manager = new BossManager(game);
      expect(manager.isBossActive()).toBe(false);
      expect(manager.activeBoss).toBeNull();
      expect(manager.playerStunTimer).toBe(0);
    });

    it('spawns and tracks active boss on demand', () => {
      const manager = new BossManager(game);
      const boss = manager.spawnBoss(10);
      expect(boss).not.toBeNull();
      expect(manager.isBossActive()).toBe(true);
      expect(manager.activeBoss).toBe(boss);
    });

    it('resets cleanly when onStageClear or reset is called', () => {
      const manager = new BossManager(game);
      manager.spawnBoss(20);
      manager.playerStunTimer = 2.0;
      expect(manager.isBossActive()).toBe(true);

      manager.onStageClear();
      expect(manager.isBossActive()).toBe(false);
      expect(manager.activeBoss).toBeNull();
      expect(manager.playerStunTimer).toBe(0);
    });

    it('renders HUD health bar safely on active boss without errors', () => {
      const manager = new BossManager(game);
      manager.spawnBoss(10);
      expect(() => manager.render(game.ctx)).not.toThrow();
    });

    it('decrements playerStunTimer during update', () => {
      const manager = new BossManager(game);
      manager.playerStunTimer = 1.0;
      manager.update(0.5, 112, 250);
      expect(manager.playerStunTimer).toBeCloseTo(0.5, 2);
      manager.update(0.6, 112, 250);
      expect(manager.playerStunTimer).toBe(0);
    });
  });

  describe('4. BaseBoss Lifecycle and Hitbox Invariants', () => {
    it('starts in INTRO phase with invulnerability', () => {
      const boss = BossFactory.createBoss(10, game)!;
      expect(boss.phase).toBe('INTRO');
      expect(boss.isInvulnerable()).toBe(true);
      // Intro starts offscreen and descends
      expect(boss.y).toBe(-40);
    });

    it('transitions from INTRO to PHASE_1 after intro duration', () => {
      const boss = BossFactory.createBoss(10, game)!;
      boss.update(1.0, 112, 250);
      expect(boss.phase).toBe('INTRO');
      boss.update(1.5, 112, 250);
      expect(boss.phase).toBe('PHASE_1');
      expect(boss.isInvulnerable()).toBe(false);
    });

    it('returns a strictly finite AABB hitbox', () => {
      const boss = BossFactory.createBoss(10, game)!;
      const hb = boss.getHitbox();
      expect(Number.isFinite(hb.x)).toBe(true);
      expect(Number.isFinite(hb.y)).toBe(true);
      expect(hb.width).toBe(boss.width);
      expect(hb.height).toBe(boss.height);
    });
  });
});
