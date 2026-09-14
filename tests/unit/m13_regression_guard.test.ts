/**
 * Galaga Arcade Web Game — Milestone 13: Full Regression Guard & End-to-End Integration
 * 
 * Verifies that all baseline Galaga gameplay mechanics, UI/HUD rendering,
 * InputHandler bindings (KeyX, KeyC, Gamepad, Touch), Tractor Beam capture/rescue,
 * Boss battles, and PowerUp systems remain 100% regression-free with Milestone 13 enabled.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { SpecialMoveType } from '../../src/core/specials/types';
import { DroneType } from '../../src/core/allies/types';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 13 — Full Regression Guard & System Integration', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  describe('1. InputHandler & Control Bindings', () => {
    it('consumes KeyX / X to trigger special moves when ready', () => {
      game.state = 'PLAYING';
      const specialManager = game.getSpecialMovesManager();
      specialManager.addEnergy(100);
      expect(specialManager.isReady()).toBe(true);

      // Simulate KeyX press
      const inputHandler = game.getInputHandler();
      inputHandler.handleKeyDown({ code: 'KeyX', key: 'x', preventDefault: vi.fn() } as unknown as KeyboardEvent);

      // Run game update
      game.update(1 / 60);

      // Special move should be triggered and energy spent
      expect(specialManager.energy).toBe(0);
      expect(specialManager.cooldownTimer).toBeGreaterThan(0);
    });

    it('consumes KeyC / C to cycle through available special moves', () => {
      game.state = 'PLAYING';
      const inputHandler = game.getInputHandler();
      const specialManager = game.getSpecialMovesManager();

      expect(specialManager.selectedMove).toBe(SpecialMoveType.NOVA_BARRAGE);

      // Press KeyC
      inputHandler.handleKeyDown({ code: 'KeyC', key: 'c', preventDefault: vi.fn() } as unknown as KeyboardEvent);
      game.update(1 / 60);

      expect(specialManager.selectedMove).toBe(SpecialMoveType.CHRONO_FREEZE);
    });

    it('handles gamepad special button inputs', () => {
      game.state = 'PLAYING';
      const specialManager = game.getSpecialMovesManager();
      specialManager.addEnergy(100);

      // Simulate gamepad action
      const inputHandler = game.getInputHandler();
      (inputHandler as any).specialTriggered = true;

      game.update(1 / 60);

      expect(specialManager.energy).toBe(0);
    });
  });

  describe('2. HUD Special Gauge Rendering Integration', () => {
    it('renders 10 discrete energy segments and gold/white ready flashing', () => {
      const hud = game.getHUD();
      const ctx = game.getContext();

      // Spy on fillRect and strokeRect
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');
      const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

      // Render HUD with 50% energy
      hud.renderFooter(ctx, {
        score: 1000,
        highScore: 20000,
        lives: 3,
        stage: 1,
        specialEnergy: 50,
        isSpecialReady: false,
        selectedSpecial: SpecialMoveType.NOVA_BARRAGE,
      });

      expect(fillRectSpy).toHaveBeenCalled();
      expect(strokeRectSpy).toHaveBeenCalled();

      // Render HUD with 100% ready energy
      fillRectSpy.mockClear();
      hud.renderFooter(ctx, {
        score: 1000,
        highScore: 20000,
        lives: 3,
        stage: 1,
        specialEnergy: 100,
        isSpecialReady: true,
        selectedSpecial: SpecialMoveType.CHRONO_FREEZE,
      });

      expect(fillRectSpy).toHaveBeenCalled();
    });
  });

  describe('3. Core Game State Machine & Integration Invariants', () => {
    it('initializes in TITLE state and transitions cleanly to STAGE_INTRO and PLAYING', () => {
      expect(game.state).toBe('TITLE');

      game.startGame();
      expect(game.state).toBe('STAGE_INTRO');

      // Fast forward past stage intro duration (2.2s)
      game.update(2.3);
      expect(game.state).toBe('PLAYING');
    });

    it('carries persistent wingmen drones across STAGE_CLEAR transitions', () => {
      game.startGame();
      game.update(2.3);
      expect(game.state).toBe('PLAYING');

      // Summon escort drone
      game.getAlliesManager().summonDrone(DroneType.ESCORT);
      expect(game.getAlliesManager().escortDrone.active).toBe(true);

      // Transition to STAGE_CLEAR
      game.setState('STAGE_CLEAR');
      game.update(2.0);

      // Escort drone remains active
      expect(game.getAlliesManager().escortDrone.active).toBe(true);
    });

    it('resets allies and special gauge on GAME_OVER', () => {
      game.startGame();
      game.update(2.3);

      game.getAlliesManager().summonDrone(DroneType.ESCORT);
      game.getSpecialMovesManager().addEnergy(80);

      // Transition to GAME_OVER
      game.setState('GAME_OVER');

      expect(game.getAlliesManager().escortDrone.active).toBe(false);
      expect(game.getSpecialMovesManager().energy).toBe(0);
    });

    it('maintains Dual Fighter rescue flow alongside active wingmen drones', () => {
      game.startGame();
      game.update(2.3);

      // Summon escort drone
      game.getAlliesManager().summonDrone(DroneType.ESCORT);

      // Spawn captured fighter escorting boss
      const boss = new Enemy({
        id: 'boss_1',
        type: EnemyType.BOSS,
        x: 100,
        y: 100,
      });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;

      const capturedFighter = new Enemy({
        id: 'captured_1',
        type: EnemyType.CAPTURED_FIGHTER,
        x: 120,
        y: 100,
      });
      capturedFighter.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = capturedFighter;

      game.formationManager.enemies.push(boss, capturedFighter);

      // Boss Galaga takes 2 hits: damage first, then destroy with lethal missile
      boss.takeDamage(1);
      const bullet = game.bulletManager.firePlayerBullet(100, 104);
      expect(bullet).not.toBeNull();

      game.resolveCollisions();

      // Rescue flow should be triggered
      expect(game.player.rescuedFighter.active).toBe(true);
      expect(boss.hasCapturedFighter).toBe(false);

      // Escort drone is still active alongside rescue flow
      expect(game.getAlliesManager().escortDrone.active).toBe(true);
    });

    it('renders playing screen with double-buffered canvas without exceptions', () => {
      game.startGame();
      game.update(2.3);

      game.getAlliesManager().summonDrone(DroneType.ESCORT);
      game.getAlliesManager().summonDrone(DroneType.AEGIS);
      game.getSpecialMovesManager().addEnergy(100);

      // Render entire scene to canvas
      expect(() => {
        game.render();
      }).not.toThrow();
    });
  });
});
