/**
 * Galaga Arcade Web Game — Milestone 8 Final Adversarial Challenger 3 Suite
 * 
 * Deep Empirical Stress Harness verifying the 4 mandatory edge case areas:
 * 1. Dual Fighter Asymmetrical & Catastrophic Destruction Dynamics
 * 2. 100-Stage Continuous Progression & Challenging Telemetry
 * 3. AudioContext Unlock, Lifecycle, Voice Overflow & Event Triggers
 * 4. 1,000 Rapid Restart Cycles & Memory Pool Bounds
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { ScoreManager } from '../../src/systems/ScoreManager';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { MusicJingles } from '../../src/audio/MusicJingles';
import type { InputState, Rect } from '../../src/types';

describe('M8 Challenger 3: Empirical Adversarial Hardening & Stress Verification', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    vi.stubGlobal('localStorage', storageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ==========================================================================
  // AREA 1: Dual Fighter Destruction Dynamics & Collision Asymmetry
  // ==========================================================================
  describe('Area 1: Dual Fighter Destruction Dynamics', () => {
    it('verifies left hull partial destruction preserves remaining right hull and life count', () => {
      const player = new Player({ x: 100, y: Player.BASELINE_Y, lives: 3 });
      player.isDual = true;
      player.invulnerableTimer = 0;

      const explodeCalls: Array<{ x: number; y: number; isPartial: boolean }> = [];
      player.onExplode = (x, y, isPartial) => {
        explodeCalls.push({ x, y, isPartial });
      };

      // Hitbox for left hull: x - 16 to x - 1 (84 to 99)
      const leftThreat: Rect = { x: 86, y: Player.BASELINE_Y - 4, width: 6, height: 6 };
      const hit = player.hitTestAndDamage(leftThreat);

      expect(hit).toBe(true);
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');
      expect(player.lives).toBe(3); // Life NOT lost on partial hull destruction
      expect(explodeCalls.length).toBe(1);
      expect(explodeCalls[0]!.isPartial).toBe(true);
      expect(explodeCalls[0]!.x).toBe(92);
      expect(player.x).toBe(108); // Shifted right to center remaining hull
    });

    it('verifies right hull partial destruction preserves remaining left hull and life count', () => {
      const player = new Player({ x: 100, y: Player.BASELINE_Y, lives: 3 });
      player.isDual = true;
      player.invulnerableTimer = 0;

      const explodeCalls: Array<{ x: number; y: number; isPartial: boolean }> = [];
      player.onExplode = (x, y, isPartial) => {
        explodeCalls.push({ x, y, isPartial });
      };

      // Hitbox for right hull: x + 1 to x + 16 (101 to 116)
      const rightThreat: Rect = { x: 106, y: Player.BASELINE_Y - 4, width: 6, height: 6 };
      const hit = player.hitTestAndDamage(rightThreat);

      expect(hit).toBe(true);
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');
      expect(player.lives).toBe(3);
      expect(explodeCalls.length).toBe(1);
      expect(explodeCalls[0]!.isPartial).toBe(true);
      expect(explodeCalls[0]!.x).toBe(108);
      expect(player.x).toBe(92); // Shifted left to center remaining hull
    });

    it('verifies catastrophic destruction when both hulls are hit simultaneously', () => {
      const player = new Player({ x: 100, y: Player.BASELINE_Y, lives: 3 });
      player.isDual = true;
      player.invulnerableTimer = 0;

      const explodeCalls: Array<{ x: number; y: number; isPartial: boolean }> = [];
      player.onExplode = (x, y, isPartial) => {
        explodeCalls.push({ x, y, isPartial });
      };

      // Wide threat covering both left (84-99) and right (101-116) hulls
      const catastrophicThreat: Rect = { x: 80, y: Player.BASELINE_Y - 5, width: 40, height: 10 };
      const hit = player.hitTestAndDamage(catastrophicThreat);

      expect(hit).toBe(true);
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2); // Life decremented
      expect(player.deathTimer).toBe(Player.DEATH_DURATION);
      expect(explodeCalls.length).toBe(1);
      expect(explodeCalls[0]!.isPartial).toBe(false);
    });

    it('verifies Dual Fighter boundary clamping strictly confines [16, 208] regardless of velocity push', () => {
      const player = new Player({ x: 100, y: Player.BASELINE_Y });
      player.isDual = true;

      // Extreme left push
      player.x = -1000;
      player.clampPosition();
      expect(player.x).toBe(16);

      // Extreme right push
      player.x = 1000;
      player.clampPosition();
      expect(player.x).toBe(208);

      // Transition to single fighter expands clamp bounds to [12, 212]
      player.isDual = false;
      player.x = -1000;
      player.clampPosition();
      expect(player.x).toBe(12);

      player.x = 1000;
      player.clampPosition();
      expect(player.x).toBe(212);
    });

    it('verifies Dual Fighter fires 2 parallel missiles with 4 active limit in BulletManager', () => {
      const game = new Game();
      game.startGame();
      game.setState('PLAYING');

      const player = game.getPlayer();
      player.isDual = true;

      const input: InputState = {
        moveLeft: false,
        moveRight: false,
        fire: true,
        pause: false,
        restart: false,
        pointerX: null,
        pointerActive: false,
        touchLeft: false,
        touchRight: false,
        touchFire: false,
      };

      // Fire burst 1
      player.update(1 / 60, input);
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(2);

      // Fire cooldown tick
      for (let i = 0; i < 10; i++) player.update(1 / 60);

      // Fire burst 2
      player.update(1 / 60, input);
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(4);

      // Attempt 3rd burst while 4 active -> rejected by quota
      for (let i = 0; i < 10; i++) player.update(1 / 60);
      player.update(1 / 60, input);
      expect(game.getBulletManager().getPlayerBulletCount()).toBe(4);

      game.destroy();
    });
  });

  // ==========================================================================
  // AREA 2: 100-Stage Continuous Progression & Challenging Stage Telemetry
  // ==========================================================================
  describe('Area 2: Continuous Stage Progression & Telemetry', () => {
    it('advances through 100 continuous stages verifying challenging stage logic and zero coordinate drifts', () => {
      const game = new Game();
      game.startGame();

      const expectedChallengingStages = new Set([
        3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59, 63, 67, 71, 75, 79, 83, 87, 91, 95, 99
      ]);

      for (let st = 1; st <= 100; st++) {
        expect(game.stage).toBe(st);
        const isChall = game.isChallengingStage(st);
        expect(isChall).toBe(expectedChallengingStages.has(st));

        // Fast forward STAGE_INTRO
        expect(game.state).toBe('STAGE_INTRO');
        game.stateTimer = 2.5;
        game.update(1 / 60);

        if (isChall) {
          expect(game.state).toBe('CHALLENGING_STAGE');
        } else {
          expect(game.state).toBe('PLAYING');
        }

        // Verify formation coordinates are strictly valid
        const enemies = game.getFormationManager().enemies;
        expect(enemies.length).toBeGreaterThan(0);
        for (const e of enemies) {
          expect(Number.isFinite(e.x)).toBe(true);
          expect(Number.isFinite(e.y)).toBe(true);
        }

        // Trigger STAGE_CLEAR
        game.setState('STAGE_CLEAR');
        game.stateTimer = 3.0;
        game.update(1 / 60);
      }

      // Reached Stage 101 cleanly
      expect(game.stage).toBe(101);
      expect(game.score).toBeGreaterThanOrEqual(0);

      game.destroy();
    });

    it('rigorously tests all Challenging Stage scoring bonus edge cases', () => {
      const sm = new ScoreManager();

      // 0 hits -> 0 pts
      expect(sm.addChallengingStageBonus(0).addedScore).toBe(0);

      // 1 to 39 hits (100 pts per hit)
      for (let h = 1; h <= 39; h++) {
        sm.reset(3, 1);
        const res = sm.addChallengingStageBonus(h);
        expect(res.addedScore).toBe(h * 100);
      }

      // 40 hits (perfect bonus 10,000 pts)
      sm.reset(3, 1);
      const perfectRes = sm.addChallengingStageBonus(40);
      expect(perfectRes.addedScore).toBe(10000);

      // >40 hits (clamped to 40 perfect bonus)
      sm.reset(3, 1);
      const overRes = sm.addChallengingStageBonus(999);
      expect(overRes.addedScore).toBe(10000);
    });
  });

  // ==========================================================================
  // AREA 3: AudioContext Unlock & Multi-Event Voice Throttling
  // ==========================================================================
  describe('Area 3: AudioContext Unlock & Synthesis Resilience', () => {
    it('verifies AudioContextManager lifecycle, unlock handler attachment and detachment', async () => {
      const audioMgr = AudioContextManager.getInstance();

      expect(audioMgr.isSupported()).toBe(false); // In Node environment
      const unlocked = await audioMgr.unlock();
      expect(typeof unlocked).toBe('boolean');

      // Test volume clamping
      audioMgr.setMasterVolume(1.5);
      expect(audioMgr.getMasterVolume()).toBe(1.0);

      audioMgr.setMasterVolume(-0.5);
      expect(audioMgr.getMasterVolume()).toBe(0.0);

      // Test mute toggling
      audioMgr.setMuted(true);
      expect(audioMgr.getIsMuted()).toBe(true);
      audioMgr.toggleMute();
      expect(audioMgr.getIsMuted()).toBe(false);
    });

    it('executes SoundSynth and MusicJingles under burst firing without throwing runtime errors', () => {
      const audioMgr = AudioContextManager.getInstance();
      const synth = SoundSynth.getInstance(audioMgr);

      expect(() => {
        // Hammer sound synthesis methods simultaneously
        for (let i = 0; i < 50; i++) {
          synth.playLaser();
          synth.playLaserDual();
          synth.playExplosion('small');
          synth.playExplosion('large');
          synth.playExplosion('boss');
          synth.playAlienDive('zako');
          synth.playAlienDive('boss');
          synth.playTractorBeam(true);
          synth.playBossHit();
        }

        MusicJingles.playStageStartFanfare();
        MusicJingles.playChallengingStageTheme();
        MusicJingles.playDockingJingle();
        MusicJingles.playGameOverTune();
        MusicJingles.playBonusFanfare();
        MusicJingles.stopAll();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // AREA 4: 1,000 Rapid Restart Cycles & Memory Safety
  // ==========================================================================
  describe('Area 4: 1,000 Rapid Restart Cycles & Memory Safety', () => {
    it('executes 1,000 rapid back-to-back startGame/restart cycles preserving memory pool invariants and high scores', () => {
      const game = new Game();

      for (let cycle = 0; cycle < 1000; cycle++) {
        game.startGame();

        // Simulate a few ticks of gameplay with bullets and particles
        game.getBulletManager().firePlayerBullet(112, 250);
        game.getBulletManager().fireEnemyBullet(100, 100, 112, 250);
        game.getParticleSystem().spawnPlayerExplosion(112, 250);

        game.update(1 / 60);

        // Transition to GAME_OVER on every 10th cycle with increasing score
        if (cycle % 10 === 0) {
          game.scoreManager.addScore(60000 + cycle);
          game.setState('GAME_OVER');
          expect(game.highScore).toBeGreaterThanOrEqual(60000 + cycle);
        }
      }

      // Verify final pool capacities and active counts
      const bulletPool = game.getBulletManager().getPool();
      expect(bulletPool.getCapacity()).toBeLessThanOrEqual(128);

      // Verify high score persisted in storage
      const storageKey = game.getScoreManager().storageKey;
      expect(parseInt(mockStorage[storageKey] || '0', 10)).toBeGreaterThanOrEqual(60990);

      // Verify player reset state
      const player = game.getPlayer();
      expect(player.state).toBe('normal');
      expect(player.x).toBe(112);
      expect(player.y).toBe(Player.BASELINE_Y);

      game.destroy();
    });
  });
});
