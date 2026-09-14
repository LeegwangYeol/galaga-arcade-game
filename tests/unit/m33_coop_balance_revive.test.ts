/**
 * Unit Test Suite for Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics
 * Covers:
 * - Track 1: Dynamic Scaling Engine (Boss Galaga +50%, Stage Bosses +60%, Divers +25%, Bullet Density +25%, Challenging Immunity)
 * - Track 2: Cooperative Revive & Life Sharing (revive_pending, 10s countdown, KeyL/Period donation, audio/vfx)
 * - Track 3: Shared Game Over Lifecycle & Invariant (game continues if partner alive or reviving; game over only when both exhausted)
 * - Track 4: Stage-Clear Pity Revive (fallen partner restored on wave/stage clear)
 * - Track 5: Tactical Tractor Beam Targeting & Dual Fighter Immunity (proximity targeting, dual immunity, suppression)
 * - Track 6: Cross-Player Tractor Beam Rescue, Dual Docking & Turncoat Divergence (heroic revive, dual docking, turncoat)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { BossFactory } from '../../src/core/boss/BossFactory';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
  });

  // ==========================================================================
  // Track 1: Dynamic Scaling Engine
  // ==========================================================================
  describe('Track 1: Co-op Dynamic Scaling Engine', () => {
    it('scales Boss Galaga HP by +50% in co-op mode while preserving 1P baseline', () => {
      // Single player baseline (isCoop = false)
      const spClassic = DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.BOSS, false);
      expect(spClassic.health).toBe(2);

      const spElite = DifficultyCalculator.getEnemyHealthAndShield(12, EnemyType.BOSS, false);
      expect(spElite.health).toBe(3);

      const spDreadnought = DifficultyCalculator.getEnemyHealthAndShield(26, EnemyType.BOSS, false);
      expect(spDreadnought.health).toBe(3);
      expect(spDreadnought.shield).toBe(2);

      // Co-op scaled (+50% HP, isCoop = true)
      const coopClassic = DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.BOSS, true);
      expect(coopClassic.health).toBe(3); // Math.round(2 * 1.5) = 3

      const coopElite = DifficultyCalculator.getEnemyHealthAndShield(12, EnemyType.BOSS, true);
      expect(coopElite.health).toBe(5); // Math.round(3 * 1.5) = 5 (ceil/round)

      const coopDreadnought = DifficultyCalculator.getEnemyHealthAndShield(26, EnemyType.BOSS, true);
      expect(coopDreadnought.health).toBe(5); // Math.round(3 * 1.5) = 5
      expect(coopDreadnought.shield).toBe(2);
    });

    it('strictly immunizes Challenging Stages from HP scaling (1 HP, 0 shield, 0 bullets)', () => {
      const challengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
      for (const stg of challengingStages) {
        const zakoStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.ZAKO, true);
        const goeiStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.GOEI, true);
        const bossStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, true);

        expect(zakoStats.health).toBe(1);
        expect(zakoStats.shield).toBe(0);
        expect(goeiStats.health).toBe(1);
        expect(goeiStats.shield).toBe(0);
        expect(bossStats.health).toBe(1);
        expect(bossStats.shield).toBe(0);
      }
    });

    it('scales Stage Bosses HP by +60% in co-op mode', () => {
      // Mock game instances
      const singleGame = { isCoop: () => false, dynamicDifficultyManager: null } as any;
      const coopGame = { isCoop: () => true, dynamicDifficultyManager: null } as any;

      // Stage 10: Cyber Dreadnought (Base: 80 HP -> Co-op: 128 HP)
      const b10Single = BossFactory.createBoss(10, singleGame);
      const b10Coop = BossFactory.createBoss(10, coopGame);
      expect(b10Single?.maxHealth).toBe(80);
      expect(b10Coop?.maxHealth).toBe(128); // Math.round(80 * 1.60) = 128
      expect(b10Coop?.health).toBe(128);

      // Stage 20: Bio-Mechanical Leviathan (Base: 120 HP -> Co-op: 192 HP)
      const b20Single = BossFactory.createBoss(20, singleGame);
      const b20Coop = BossFactory.createBoss(20, coopGame);
      expect(b20Single?.maxHealth).toBe(120);
      expect(b20Coop?.maxHealth).toBe(192); // Math.round(120 * 1.60) = 192

      // Stage 30: Nanite Swarm Overmind (Base: 150 HP -> Co-op: 240 HP)
      const b30Single = BossFactory.createBoss(30, singleGame);
      const b30Coop = BossFactory.createBoss(30, coopGame);
      expect(b30Single?.maxHealth).toBe(150);
      expect(b30Coop?.maxHealth).toBe(240); // Math.round(150 * 1.60) = 240

      // Stage 40: Psionic Void Entity (Base: 180 HP -> Co-op: 288 HP)
      const b40Single = BossFactory.createBoss(40, singleGame);
      const b40Coop = BossFactory.createBoss(40, coopGame);
      expect(b40Single?.maxHealth).toBe(180);
      expect(b40Coop?.maxHealth).toBe(288); // Math.round(180 * 1.60) = 288

      // Stage 50: Omega Aeternum (Base: 300 HP -> Co-op: 480 HP)
      const b50Single = BossFactory.createBoss(50, singleGame);
      const b50Coop = BossFactory.createBoss(50, coopGame);
      expect(b50Single?.maxHealth).toBe(300);
      expect(b50Coop?.maxHealth).toBe(480); // Math.round(300 * 1.60) = 480
    });

    it('scales concurrent divers and bullet density by +25% in co-op mode', () => {
      // Co-op max concurrent divers
      const baseDivers = 4;
      const coopDivers = DifficultyCalculator.getCoopMaxConcurrentDivers(baseDivers);
      expect(coopDivers).toBe(5); // Math.round(4 * 1.25) = 5

      // FormationManager bullet density multiplier (+25% in co-op relative to single-player)
      const coopMult = game.formationManager.getEffectiveBulletDensityMultiplier();
      game.setCoopMode(false);
      const singleMult = game.formationManager.getEffectiveBulletDensityMultiplier();
      expect(coopMult / singleMult).toBeCloseTo(1.25, 2);
    });
  });

  // ==========================================================================
  // Track 2: Cooperative Revive & Life Sharing
  // ==========================================================================
  describe('Track 2: Cooperative Revive & Life Sharing Mechanics', () => {
    it('transitions to revive_pending with a 10-second countdown and handles expiration to eliminated', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      p1.reset(80, 250, 0);
      p1.startRevivePending(10.0);

      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBe(10.0);
      expect(p1.isAlive()).toBe(false);

      // Advance timer by 4.0 seconds
      p1.update(4.0);
      expect(p1.reviveTimer).toBeCloseTo(6.0, 1);
      expect(p1.state).toBe('revive_pending');

      // Advance remaining timer until expiration
      p1.update(6.1);
      expect(p1.reviveTimer).toBe(0);
      expect(p1.state).toBe('eliminated');
    });

    it('validates life donation eligibility: donor requires >1 reserve life (lives > 1)', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 alive with 3 lives (2 reserve lives), P2 downed with 0 lives
      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.startRevivePending(10.0);

      expect(game.playerManager.canDonateLife('p1')).toBe(true);
      expect(game.playerManager.canDonateLife('p2')).toBe(false); // P2 has 0 lives

      // If P1 has only 1 life (0 reserve lives), donation must be denied
      p1.lives = 1;
      expect(game.playerManager.canDonateLife('p1')).toBe(false);

      // If P2 is not down (has lives), donation must be denied
      p1.lives = 3;
      p2.lives = 1;
      p2.state = 'normal';
      expect(game.playerManager.canDonateLife('p1')).toBe(false);
    });

    it('executes atomic life donation: deducts donor reserve life, revives partner, and plays feedback', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.startRevivePending(8.5);

      const chimeSpy = vi.spyOn(game.soundSynth, 'playLifeDonatedChime');
      const particleSpy = vi.spyOn(game.particleSystem, 'spawnReviveSparkles');

      const success = game.playerManager.donateLife('p1');
      expect(success).toBe(true);

      // P1 lost 1 reserve life: 3 -> 2
      expect(p1.lives).toBe(2);
      expect(game.scoreManager.getLives('p1')).toBe(2);

      // P2 revived with 1 life at baseline
      expect(p2.lives).toBe(1);
      expect(p2.reviveTimer).toBe(0);
      expect(game.scoreManager.getLives('p2')).toBe(1);
      expect(p2.state).toBe('respawning');
      expect(p2.isInvulnerable()).toBe(true);

      // Audio & particle feedback triggered
      expect(chimeSpy).toHaveBeenCalled();
      expect(particleSpy).toHaveBeenCalledWith(p1.x, p1.y, p2.x, p2.y);
    });

    it('processes life donation input action via InputHandler', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 3);
      p2.reset(144, 250, 0);
      p2.startRevivePending(10.0);

      // Simulate KeyL press on InputHandler
      game.inputHandler.handleKeyDown({ code: 'KeyL', key: 'l', preventDefault: vi.fn() } as unknown as KeyboardEvent);

      // Call updatePlaying through game update
      game.setState('PLAYING');
      game.update(1 / 60);

      // Verify life was donated
      expect(p1.lives).toBe(2);
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');
    });

    it('naturally transitions to revive_pending (10s timer) upon fatal death in co-op mode without manual startRevivePending', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // P1 on last life, P2 has reserve lives
      p1.reset(80, 250, 1);
      p2.reset(144, 250, 3);

      // Take fatal hit: lives 1 -> 0, state becomes 'destroyed', deathTimer = 0.5s
      p1.destroy();
      expect(p1.lives).toBe(0);
      expect(p1.state).toBe('destroyed');
      expect(p1.deathTimer).toBe(Player.DEATH_DURATION);

      // Step simulation forward past deathTimer (1.5s total)
      p1.update(1.5);

      // Assert natural transition into revive_pending with 10.0s countdown
      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBe(10.0);
      expect(p1.isAlive()).toBe(false);

      // Step forward 4.0 seconds
      p1.update(4.0);
      expect(p1.reviveTimer).toBeCloseTo(6.0, 1);
      expect(p1.state).toBe('revive_pending');

      // Step forward past remaining 6.0s (> 10.0s total countdown)
      p1.update(6.1);
      expect(p1.reviveTimer).toBe(0);
      expect(p1.state).toBe('eliminated');

      // P2 is still alive -> Game Over is NOT triggered
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');
    });

    it('natural game loop death progresses to revive_pending, to eliminated, and triggers GAME_OVER when partner also falls', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // Both players on last life
      p1.reset(80, 250, 1);
      p2.reset(144, 250, 1);

      // P1 takes fatal hit in game loop
      p1.destroy();
      expect(p1.lives).toBe(0);

      // Step game loop past P1 explosion (40 frames @ 60 FPS = 0.67s > 0.5s)
      for (let i = 0; i < 40; i++) {
        game.update(1 / 60);
      }

      // P1 naturally in revive_pending without manual call
      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeLessThanOrEqual(10.0);
      expect(p1.reviveTimer).toBeGreaterThan(9.0);
      expect(game.state).toBe('PLAYING');

      // P2 also takes fatal hit
      p2.destroy();
      expect(p2.lives).toBe(0);

      // Step game loop past P2 explosion
      for (let i = 0; i < 40; i++) {
        game.update(1 / 60);
      }

      // Both players are now in revive_pending
      expect(p2.state).toBe('revive_pending');
      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      expect(game.state).toBe('PLAYING');

      // Step simulation forward past the 10-second revive countdown (660 frames = 11.0s)
      for (let i = 0; i < 660; i++) {
        game.update(1 / 60);
        if (game.state === 'GAME_OVER') break;
      }

      // Both players permanently eliminated -> GAME_OVER triggered
      expect(p1.state).toBe('eliminated');
      expect(p2.state).toBe('eliminated');
      expect(game.playerManager.areAllPlayersDead()).toBe(true);
      expect(game.state).toBe('GAME_OVER');
    });

    it('natural lethal collision in game loop enters revive_pending, allowing partner to donate life and rescue', () => {
      game.setState('PLAYING');
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 1);
      p2.reset(144, 250, 3); // P2 has 2 reserve lives

      // Enemy projectile hits P1
      const threat = { x: 76, y: 246, width: 8, height: 8 };
      const hit = p1.hitTestAndDamage(threat);
      expect(hit).toBe(true);
      expect(p1.lives).toBe(0);

      // Step past explosion duration
      for (let i = 0; i < 40; i++) {
        game.update(1 / 60);
      }

      // P1 is in revive_pending
      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBeGreaterThan(9.0);

      // P2 donates life
      expect(game.playerManager.canDonateLife('p2')).toBe(true);
      const donated = game.playerManager.donateLife('p2');
      expect(donated).toBe(true);

      // P1 is rescued and respawns
      expect(p1.lives).toBe(1);
      expect(p1.state).toBe('respawning');
      expect(p1.isInvulnerable()).toBe(true);
      expect(p2.lives).toBe(2);
    });
  });

  // ==========================================================================
  // Track 3: Shared Game Over Lifecycle & Invariant
  // ==========================================================================
  describe('Track 3: Shared Game Over Lifecycle & Invariant', () => {
    it('does NOT trigger Game Over when one player dies while the other has lives', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.startRevivePending(10.0);
      p2.reset(144, 250, 2);

      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      game.setState('PLAYING');
      game.update(0.1);
      expect(game.state).toBe('PLAYING');
    });

    it('does NOT trigger Game Over while any player has an active revive timer', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.startRevivePending(5.0);
      p2.reset(144, 250, 0);
      p2.state = 'eliminated'; // P2 timer already expired

      expect(game.playerManager.areAllPlayersDead()).toBe(false);
      game.setState('PLAYING');
      game.update(0.1);
      expect(game.state).toBe('PLAYING');
    });

    it('triggers Game Over strictly when BOTH players are permanently eliminated', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 0);
      p1.state = 'eliminated';
      p1.reviveTimer = 0;

      p2.reset(144, 250, 0);
      p2.state = 'eliminated';
      p2.reviveTimer = 0;

      expect(game.playerManager.areAllPlayersDead()).toBe(true);

      game.setState('PLAYING');
      game.update(0.1);
      expect(game.state).toBe('GAME_OVER');
    });
  });

  // ==========================================================================
  // Track 4: Stage-Clear Pity Revive
  // ==========================================================================
  describe('Track 4: Stage-Clear Pity Revive', () => {
    it('automatically grants pity revive to fallen partner on wave/stage clear', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      p1.reset(80, 250, 2);
      p2.reset(144, 250, 0);
      p2.state = 'eliminated';
      p2.reviveTimer = 0;

      expect(p2.lives).toBe(0);

      // Trigger stage clear pity revive hook
      game.playerManager.onStageClear();

      // P2 should be restored with 1 life and respawned
      expect(p2.lives).toBe(1);
      expect(p2.state).toBe('respawning');
      expect(game.scoreManager.getLives('p2')).toBe(1);
      expect(p2.isInvulnerable()).toBe(true);
    });
  });

  // ==========================================================================
  // Track 5: Tactical Tractor Beam Targeting & Dual Fighter Immunity
  // ==========================================================================
  describe('Track 5: Tactical Tractor Beam Targeting & Dual Fighter Immunity', () => {
    it('targets the horizontally closest player to Boss Galaga X-coordinate', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(60, 250, 3);
      p2.reset(180, 250, 3);

      const boss = new Enemy({ id: 10, type: EnemyType.BOSS, x: 70, y: 50 });
      boss.state = EnemyState.IN_FORMATION;

      const target1 = game.formationManager.selectTractorBeamTarget(boss);
      expect(target1?.id).toBe('p1');

      boss.x = 170;
      const target2 = game.formationManager.selectTractorBeamTarget(boss);
      expect(target2?.id).toBe('p2');
    });

    it('enforces Dual Fighter immunity: targets single player when other player is Dual', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 3);
      p1.isDual = true; // Dual Fighter craft
      p2.reset(180, 250, 3);
      p2.isDual = false; // Single Fighter craft

      const boss = new Enemy({ id: 11, type: EnemyType.BOSS, x: 80, y: 50 });
      boss.state = EnemyState.IN_FORMATION;

      // Boss must target P2 despite P1 being horizontally right beneath the Boss
      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target?.id).toBe('p2');
    });

    it('suppresses tractor beam dive entirely when BOTH players are Dual Fighters', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 3);
      p1.isDual = true;
      p2.reset(160, 250, 3);
      p2.isDual = true;

      const boss = new Enemy({ id: 12, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;

      const target = game.formationManager.selectTractorBeamTarget(boss);
      expect(target).toBeNull();
    });
  });

  // ==========================================================================
  // Track 6: Cross-Player Tractor Beam Rescue, Dual Docking & Turncoat Divergence
  // ==========================================================================
  describe('Track 6: Cross-Player Rescue, Dual Docking & Turncoat Divergence', () => {
    it('P2 destroys diving Boss holding downed P1: revives P1 into active flight with 1,000 pts to P2', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 0);
      p1.state = 'revive_pending';
      p2.reset(160, 250, 3);

      const boss = new Enemy({ id: 101, type: EnemyType.BOSS, x: 130, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 102, type: EnemyType.CAPTURED_FIGHTER, x: 130, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p2ScoreBefore = game.scoreManager.getScore('p2');

      // P2 fires fatal shot at Boss Galaga
      game.bulletManager.firePlayerBullet(130, 126, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(escort.active).toBe(false);

      // P2 earns 1,000 pts rescue bonus
      expect(game.scoreManager.getScore('p2')).toBeGreaterThanOrEqual(p2ScoreBefore + 1000);

      // Downed P1 is liberated into docking descent
      expect(p1.rescuedFighter.active).toBe(true);
      expect(p1.state).toBe('docking');

      // Complete P1 docking descent
      for (let i = 0; i < 150; i++) {
        p1.update(1 / 60);
        if ((p1.state as string) === 'normal') break;
      }
      expect(p1.state).toBe('normal');
      expect(p1.lives).toBe(1);
      expect(p1.isInvulnerable()).toBe(true);
    });

    it('P1 destroys diving Boss holding downed P2: revives P2 into active flight with 1,000 pts to P1', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 3);
      p2.reset(160, 250, 0);
      p2.state = 'eliminated';

      const boss = new Enemy({ id: 103, type: EnemyType.BOSS, x: 100, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 104, type: EnemyType.CAPTURED_FIGHTER, x: 100, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p2';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p1ScoreBefore = game.scoreManager.getScore('p1');

      // P1 fires fatal shot at Boss Galaga
      game.bulletManager.firePlayerBullet(100, 126, false, 480, 0, undefined, undefined, 'p1');
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(escort.active).toBe(false);
      expect(game.scoreManager.getScore('p1')).toBeGreaterThanOrEqual(p1ScoreBefore + 1000);

      // P2 enters docking descent and is restored to 1 life
      expect(p2.rescuedFighter.active).toBe(true);
      expect(p2.state).toBe('docking');
    });

    it('rescuer docks into Dual Fighter when partner is already alive on screen as single ship', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      p1.reset(80, 250, 2); // P1 alive
      p2.reset(160, 250, 3); // P2 alive

      const boss = new Enemy({ id: 105, type: EnemyType.BOSS, x: 150, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 106, type: EnemyType.CAPTURED_FIGHTER, x: 150, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      // P2 destroys diving Boss
      game.bulletManager.firePlayerBullet(150, 126, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // P2 (rescuer) docks and forms Dual Fighter
      expect(p2.state).toBe('docking');
      expect(p2.rescuedFighter.active).toBe(true);
      expect(p1.state).toBe('normal');

      for (let i = 0; i < 150; i++) {
        p2.update(1 / 60);
        if (p2.state === 'dual') break;
      }
      expect(p2.state).toBe('dual');
      expect(p2.isDual).toBe(true);
    });

    it('turncoat divergence: destroys Boss in formation -> captive turns into hostile attacker', () => {
      const boss = new Enemy({ id: 107, type: EnemyType.BOSS, x: 112, y: 50 });
      boss.state = EnemyState.IN_FORMATION;
      boss.hasCapturedFighter = true;
      boss.health = 1;

      const escort = new Enemy({ id: 108, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 34 });
      escort.state = EnemyState.IN_FORMATION;
      escort.originalOwnerId = 'p1';
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      // P2 shoots Boss in formation
      game.bulletManager.firePlayerBullet(112, 56, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // Escort was NOT rescued; converted into CAPTURED_HOSTILE turncoat
      expect(escort.state).toBe(EnemyState.CAPTURED_HOSTILE);
      expect(escort.escortBoss).toBeNull();
      expect(escort.active).toBe(true);
    });

    it('friendly fire: shooting captured fighter directly destroys it without rescue', () => {
      const boss = new Enemy({ id: 109, type: EnemyType.BOSS, x: 130, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;

      const escort = new Enemy({ id: 110, type: EnemyType.CAPTURED_FIGHTER, x: 130, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      escort.health = 1;
      boss.capturedFighterEnemy = escort;
      escort.escortBoss = boss;

      game.formationManager.enemies.push(boss, escort);

      const p2ScoreBefore = game.scoreManager.getScore('p2');

      // P2 accidentally hits escort instead of Boss
      game.bulletManager.firePlayerBullet(130, 108, false, 480, 0, undefined, undefined, 'p2');
      game.resolveCollisions();

      // Escort is destroyed
      expect(escort.health).toBe(0);
      expect(boss.hasCapturedFighter).toBe(false);

      // Score awarded for destroying captured fighter
      expect(game.scoreManager.getScore('p2')).toBeGreaterThan(p2ScoreBefore);
    });
  });
});
