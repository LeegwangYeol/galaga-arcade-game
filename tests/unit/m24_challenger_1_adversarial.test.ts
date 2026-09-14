/**
 * Galaga Arcade Web Game — M24 Empirical Adversarial Stress Test Suite
 * Author: m24_challenger_1 (Empirical Challenger)
 * 
 * Adversarial Challenge Scope:
 * 1. Dual Fighter Centerline Bullet Penetration (x = player.x - 1, x, x + 1, and dense 0.1px sweep)
 * 2. Partial Destruction Multi-Frame Threat Persistence (2-frame hazard destroys 1 hull, player survives)
 * 3. Offscreen Missile Suppression (enemies at y < 0 take zero missile damage)
 * 4. Swept Continuous Collision Detection (CCD) (320 px/s bullets at 15Hz, 30Hz, 60Hz without tunneling)
 * 5. Mid-Capture Boss Destruction (player restored to 'normal', 1.0s invulnerability, 0 lives deducted)
 * 6. Audio Concurrency & Watchdog Leak Prevention (50 rapid playBossHit, voice count <= 12, zero node leaks under dropped onended)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Player } from '../../src/entities/Player';
import { Bullet } from '../../src/entities/Bullet';
import { Game } from '../../src/core/Game';
import { Enemy } from '../../src/entities/Enemy';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { SOUND_PRIORITY } from '../../src/audio/types';
import { EnemyType, EnemyState, type Rect } from '../../src/types';
function checkAABB(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// ============================================================================
// Web Audio API Mock Infrastructure for Concurrency & Leak Testing
// ============================================================================

class MockAudioParam {
  public value: number;
  public scheduled: Array<{ type: string; value: number; time: number }> = [];

  constructor(initialValue: number = 1.0) {
    this.value = initialValue;
  }

  setValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'setValueAtTime', value: val, time });
  }

  linearRampToValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'linearRampToValueAtTime', value: val, time });
  }

  exponentialRampToValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'exponentialRampToValueAtTime', value: val, time });
  }

  setTargetAtTime(val: number, time: number, _constant: number) {
    this.value = val;
    this.scheduled.push({ type: 'setTargetAtTime', value: val, time });
  }

  cancelScheduledValues(_time: number) {
    this.scheduled = [];
  }
}

class MockAudioNode {
  public connectedTo: any[] = [];
  public disconnected = false;

  connect(destination: any) {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
    this.connectedTo = [];
  }
}

class MockGainNode extends MockAudioNode {
  public gain = new MockAudioParam(1.0);
}

class MockBiquadFilterNode extends MockAudioNode {
  public type: string = 'lowpass';
  public frequency = new MockAudioParam(350);
  public Q = new MockAudioParam(1.0);
}

class MockOscillatorNode extends MockAudioNode {
  public frequency = new MockAudioParam(440);
  public detune = new MockAudioParam(0);
  public type: OscillatorType = 'sine';
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  public buffer: any = null;
  public loop = false;
  public playbackRate = new MockAudioParam(1.0);
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockAudioContext {
  public currentTime = 0;
  public state: AudioContextState = 'running';
  public sampleRate = 44100;
  public destination = new MockAudioNode();
  public createdNodes: MockAudioNode[] = [];

  createGain() {
    const node = new MockGainNode();
    this.createdNodes.push(node);
    return node;
  }

  createOscillator() {
    const node = new MockOscillatorNode();
    this.createdNodes.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.createdNodes.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  createBufferSource() {
    const node = new MockAudioBufferSourceNode();
    this.createdNodes.push(node);
    return node;
  }
}

class MockEventTarget {
  private listeners: Record<string, Function[]> = {};

  addEventListener(type: string, listener: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: Function) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event: any): boolean {
    const set = this.listeners[event.type];
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
    return true;
  }
}

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillStyle: '#FFFFFF',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

function createMockCanvas(): HTMLCanvasElement {
  const ctx = createMockCanvasContext();
  return Object.assign(new MockEventTarget(), {
    width: 224,
    height: 288,
    getContext: (_type: string) => ctx,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 224,
      height: 288,
      x: 0,
      y: 0,
      right: 224,
      bottom: 288,
    }),
  }) as unknown as HTMLCanvasElement;
}

// ============================================================================
// Adversarial Challenge Test Suites
// ============================================================================

describe('M24 Challenger 1: Adversarial Hitbox, Collision & Audio Stress Suite', () => {

  // ==========================================================================
  // 1. Dual Fighter Centerline Bullet Penetration
  // ==========================================================================
  describe('Challenge 1: Dual Fighter Centerline Bullet Penetration', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: 250, lives: 3 });
      player.isDual = true;
    });

    it('empirically registers 100% collision at x = player.x - 1, x = player.x, and x = player.x + 1', () => {
      const px = player.x; // 112
      const py = player.y; // 250

      // Standard enemy bullet dimensions: 2x4
      const bulletLeft: Rect = { x: px - 1 - 1, y: py - 2, width: 2, height: 4 }; // centered at x = 111
      const bulletCenter: Rect = { x: px - 1, y: py - 2, width: 2, height: 4 }; // centered at x = 112
      const bulletRight: Rect = { x: px + 1 - 1, y: py - 2, width: 2, height: 4 }; // centered at x = 113

      // 1. Test bullet at x = px - 1 (111)
      player.isDual = true;
      const hitLeft = player.hitTestAndDamage(bulletLeft);
      expect(hitLeft).toBe(true);

      // 2. Reset and test bullet exactly at centerline x = px (112)
      player.reset(px, py, 3);
      player.isDual = true;
      const hitCenter = player.hitTestAndDamage(bulletCenter);
      expect(hitCenter).toBe(true);

      // 3. Reset and test bullet at x = px + 1 (113)
      player.reset(px, py, 3);
      player.isDual = true;
      const hitRight = player.hitTestAndDamage(bulletRight);
      expect(hitRight).toBe(true);
    });

    it('empirically proves 0 dead-zone along the entire boundary seam via dense 0.1px sweep', () => {
      const px = player.x;
      const py = player.y;

      // Sweep x from player.x - 2 to player.x + 2 in 0.1px increments (41 distinct probe points)
      for (let offset = -2.0; offset <= 2.0; offset += 0.1) {
        player.reset(px, py, 3);
        player.isDual = true;

        const probeX = Math.round((px + offset) * 10) / 10;
        // 1px wide bullet threat exactly targeting the sub-pixel coordinate
        const threat: Rect = { x: probeX - 0.5, y: py - 2, width: 1.0, height: 4.0 };
        const hit = player.hitTestAndDamage(threat);

        expect(hit).toBe(true);
      }
    });

    it('guarantees asymmetrical hull damage distinction without centerline gap', () => {
      const px = player.x;
      const py = player.y;

      // Left-biased bullet (hits only left hull [x-16, x])
      player.reset(px, py, 3);
      player.isDual = true;
      const leftThreat: Rect = { x: px - 8, y: py - 2, width: 2, height: 4 };
      expect(player.hitTestAndDamage(leftThreat)).toBe(true);
      expect(player.state).toBe('normal'); // Left destroyed, remaining single fighter
      expect(player.x).toBe(px + 8); // Shifted right

      // Right-biased bullet (hits only right hull [x, x+16])
      player.reset(px, py, 3);
      player.isDual = true;
      const rightThreat: Rect = { x: px + 8, y: py - 2, width: 2, height: 4 };
      expect(player.hitTestAndDamage(rightThreat)).toBe(true);
      expect(player.state).toBe('normal'); // Right destroyed, remaining single fighter
      expect(player.x).toBe(px - 8); // Shifted left

      // Centerline seam threat: overlaps both hulls, causing catastrophic hit
      player.reset(px, py, 3);
      player.isDual = true;
      const centerThreat: Rect = { x: px - 1, y: py - 2, width: 2, height: 4 }; // spans [111, 113]
      expect(player.hitTestAndDamage(centerThreat)).toBe(true);
      expect(player.state).toBe('destroyed'); // Both hulls destroyed
    });
  });

  // ==========================================================================
  // 2. Partial Destruction Multi-Frame Threat Persistence
  // ==========================================================================
  describe('Challenge 2: Partial Destruction Multi-Frame Threat Persistence', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: 250, lives: 3 });
      player.isDual = true;
    });

    it('ensures a 2-frame persisting hazard destroys exactly 1 hull and player survives with remaining single fighter', () => {
      const initialLives = player.lives;
      const px = player.x;
      const py = player.y;

      // Hazard targeting left wing
      const persistingHazard: Rect = { x: px - 12, y: py - 3, width: 6, height: 6 };

      // --- FRAME 1: Hazard strikes left hull ---
      const frame1Damaged = player.hitTestAndDamage(persistingHazard);
      expect(frame1Damaged).toBe(true);
      expect(player.isDual).toBe(false);
      expect(player.state).toBe('normal');
      expect(player.lives).toBe(initialLives); // Zero lives deducted!
      expect(player.invulnerableTimer).toBeGreaterThanOrEqual(0.5); // 0.5s grace window granted
      expect(player.isInvulnerable()).toBe(true);

      const remainingFighterX = player.x; // Shifted to px + 8 = 120

      // --- FRAME 2: Hazard persists for another 16.6ms frame ---
      player.update(1 / 60); // Decrement timer by ~0.0167s

      // Timer remains active (~0.483s)
      expect(player.invulnerableTimer).toBeGreaterThan(0.4);
      expect(player.isInvulnerable()).toBe(true);

      // Persisting hazard hits the area or even remaining fighter
      const frame2Damaged = player.hitTestAndDamage(persistingHazard);
      expect(frame2Damaged).toBe(false); // Ignored due to invulnerability buffer!

      // Even a direct threat to the remaining single fighter is deflected during grace window
      const directThreat: Rect = { x: remainingFighterX - 2, y: py - 2, width: 4, height: 4 };
      const directDamaged = player.hitTestAndDamage(directThreat);
      expect(directDamaged).toBe(false);

      // Assert player status after 2-frame threat:
      expect(player.state).toBe('normal');
      expect(player.state).not.toBe('destroyed');
      expect(player.lives).toBe(initialLives);
      expect(player.isDual).toBe(false);

      // --- POST-GRACE WINDOW: Verify vulnerability restores after 0.5s ---
      player.update(0.5);
      expect(player.isInvulnerable()).toBe(false);
      const lethalHit = player.hitTestAndDamage(directThreat);
      expect(lethalHit).toBe(true);
      expect(player.state).toBe('destroyed');
    });

    it('symmetrically protects surviving left hull when right hull is destroyed by 2-frame hazard', () => {
      const px = player.x;
      const py = player.y;

      // Hazard targeting right wing
      const rightHazard: Rect = { x: px + 10, y: py - 3, width: 6, height: 6 };

      // Frame 1
      expect(player.hitTestAndDamage(rightHazard)).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.x).toBe(px - 8); // Shifted left to 104
      expect(player.invulnerableTimer).toBeGreaterThanOrEqual(0.5);

      // Frame 2 (persisting threat)
      player.update(1 / 60);
      expect(player.isInvulnerable()).toBe(true);
      expect(player.hitTestAndDamage(rightHazard)).toBe(false);
      expect(player.state).toBe('normal');
      expect(player.lives).toBe(3);
    });
  });

  // ==========================================================================
  // 3. Offscreen Missile Suppression (y < 0)
  // ==========================================================================
  describe('Challenge 3: Offscreen Missile Suppression', () => {
    let game: Game;

    beforeEach(() => {
      const canvas = createMockCanvas();
      game = new Game(canvas);
      game.bulletManager.clear();
      game.formationManager.reset();
    });

    afterEach(() => {
      game.destroy();
    });

    it('empirically suppresses all missile damage to enemies with y < 0', () => {
      // Create offscreen enemy at y = -15
      const offscreenEnemy = new Enemy({
        id: 'offscreen_zako',
        type: EnemyType.ZAKO,
        x: 112,
        y: -15,
      });
      offscreenEnemy.active = true;
      offscreenEnemy.state = EnemyState.DIVING_SOLO;
      offscreenEnemy.health = 1;

      game.formationManager.enemies.push(offscreenEnemy);
      expect(game.formationManager.getLivingEnemies().length).toBeGreaterThanOrEqual(1);

      // Spawn player missile directly overlapping the offscreen enemy
      const bullet = game.bulletManager.firePlayerBullet(112, -15, false);
      expect(bullet).not.toBeNull();

      const initialScore = game.scoreManager.score;

      // Resolve collisions
      game.resolveCollisions();

      // Enemy at y < 0 MUST take zero damage and remain alive
      expect(offscreenEnemy.health).toBe(1);
      expect(offscreenEnemy.state).not.toBe(EnemyState.EXPLODING);
      expect(offscreenEnemy.active).toBe(true);
      expect(game.scoreManager.score).toBe(initialScore);
    });

    it('permits missile damage once enemy enters visible field (y >= 0)', () => {
      const enemy = new Enemy({
        id: 'entering_zako',
        type: EnemyType.ZAKO,
        x: 112,
        y: 10, // Visible on-screen
      });
      enemy.active = true;
      enemy.state = EnemyState.DIVING_SOLO;
      enemy.health = 1;

      game.formationManager.enemies.push(enemy);

      // Fire player missile overlapping on-screen enemy
      const bullet = game.bulletManager.firePlayerBullet(112, 10, false);
      expect(bullet).not.toBeNull();

      const initialScore = game.scoreManager.score;

      game.resolveCollisions();

      // Visible enemy takes damage and is destroyed
      expect(enemy.health).toBe(0);
      expect(enemy.state).toBe(EnemyState.EXPLODING);
      expect(game.scoreManager.score).toBeGreaterThan(initialScore);
    });

    it('suppresses missile damage for enemies diving past bottom boundary (y > VIRTUAL_HEIGHT)', () => {
      const bottomEnemy = new Enemy({
        id: 'escaped_goei',
        type: EnemyType.GOEI,
        x: 112,
        y: Game.VIRTUAL_HEIGHT + 10, // y = 298
      });
      bottomEnemy.active = true;
      bottomEnemy.state = EnemyState.DIVING_SOLO;
      bottomEnemy.health = 1;

      game.formationManager.enemies.push(bottomEnemy);

      const bullet = game.bulletManager.firePlayerBullet(112, Game.VIRTUAL_HEIGHT + 10, false);
      expect(bullet).not.toBeNull();

      game.resolveCollisions();

      expect(bottomEnemy.health).toBe(1);
      expect(bottomEnemy.state).not.toBe(EnemyState.EXPLODING);
    });
  });

  // ==========================================================================
  // 4. Swept Continuous Collision Detection (CCD) at 15Hz, 30Hz, and 60Hz
  // ==========================================================================
  describe('Challenge 4: Swept Continuous Collision Detection (CCD)', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: 250, lives: 3 }); // Hitbox y: [244, 256], height: 12
    });

    it('prevents tunneling at 15Hz for high-speed enemy bullet (320 px/s)', () => {
      const dt = 1 / 15; // 0.06667s: bullet travels 21.33px per frame (> 12px player hitbox height!)
      const speed = 320;

      const bullet = new Bullet();
      // Start bullet at y = 237 (above player hitbox [244, 256])
      bullet.init(112, 237, 0, speed, 'ENEMY');

      // Static initial box does not touch player
      const initialBox = bullet.getHitbox();
      expect(checkAABB(initialBox, player.getHitbox())).toBe(false);

      // Update bullet by 1 frame at 15Hz
      bullet.update(dt);

      // Bullet new position: 237 + 21.33 = 258.33 (below player hitbox [244, 256]!)
      expect(bullet.position.y).toBeGreaterThan(256);

      // Verify that a naive static AABB WOULD HAVE TUNNELED (false negative)
      const staticBox = bullet.getHitbox();
      const staticHit = checkAABB(staticBox, player.getHitbox());
      expect(staticHit).toBe(false); // Proves static hitbox tunnels!

      // Verify that Swept CCD box captures the collision without tunneling!
      const sweptBox = bullet.getSweptHitbox();
      const sweptHit = player.hitTestAndDamage(sweptBox);
      expect(sweptHit).toBe(true);
      expect(player.state).toBe('destroyed');
    });

    it('prevents tunneling at 30Hz for high-speed enemy bullet (320 px/s)', () => {
      const dt = 1 / 30; // 0.03333s: bullet travels 10.67px per frame
      const speed = 320;

      const bullet = new Bullet();
      bullet.init(112, 238, 0, speed, 'ENEMY');

      bullet.update(dt);
      // New position: 238 + 10.67 = 248.67

      const sweptBox = bullet.getSweptHitbox();
      const sweptHit = player.hitTestAndDamage(sweptBox);
      expect(sweptHit).toBe(true);
      expect(player.state).toBe('destroyed');
    });

    it('prevents tunneling at 60Hz for high-speed enemy bullet (320 px/s)', () => {
      const dt = 1 / 60; // 0.01667s: bullet travels 5.33px per frame
      const speed = 320;

      const bullet = new Bullet();
      bullet.init(112, 240, 0, speed, 'ENEMY');

      bullet.update(dt);
      // New position: 240 + 5.33 = 245.33

      const sweptBox = bullet.getSweptHitbox();
      const sweptHit = player.hitTestAndDamage(sweptBox);
      expect(sweptHit).toBe(true);
      expect(player.state).toBe('destroyed');
    });

    it('empirically guarantees 100% collision rate across 60 randomized high-speed bullet passes at all framerates', () => {
      const framerates = [15, 30, 60];
      const speed = 320;

      for (const hz of framerates) {
        const dt = 1 / hz;
        const step = speed * dt;

        // Test 20 randomized start positions that pass through y = 250
        for (let i = 0; i < 20; i++) {
          player.reset(112, 250, 3);
          const startY = 250 - step * (0.2 + (i / 20) * 0.7); // guaranteed to cross or hit

          const bullet = new Bullet();
          bullet.init(112, startY, 0, speed, 'ENEMY');
          bullet.update(dt);

          const sweptBox = bullet.getSweptHitbox();
          const hit = player.hitTestAndDamage(sweptBox);
          expect(hit).toBe(true);
        }
      }
    });
  });

  // ==========================================================================
  // 5. Mid-Capture Boss Destruction State Transition
  // ==========================================================================
  describe('Challenge 5: Mid-Capture Boss Destruction', () => {
    let game: Game;
    let boss: Enemy;

    beforeEach(() => {
      const canvas = createMockCanvas();
      game = new Game(canvas);
      game.bulletManager.clear();
      game.formationManager.reset();

      boss = new Enemy({
        id: 'capture_boss_1',
        type: EnemyType.BOSS,
        x: 112,
        y: 60,
      });
      boss.active = true;
      boss.health = 1;
      boss.state = EnemyState.DIVING_SOLO;
      game.formationManager.enemies.push(boss);
    });

    afterEach(() => {
      game.destroy();
    });

    it('smoothly returns player to normal state with 1.0s invulnerability and zero lives deducted', () => {
      const player = game.getPlayer();
      player.reset(112, Player.BASELINE_Y, 3);
      const initialLives = player.lives;

      // 1. Boss activates tractor beam
      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6); // Fully expanded
      expect(game.tractorBeam.isActive()).toBe(true);

      // 2. Player enters capturing state and begins ascension
      player.startCapture(boss.x, boss.y);
      game.tractorBeam.startCapture(player);
      expect(player.state).toBe('capturing');

      // 3. Advance capture 1.2s into the 2.5s sequence (player is ascending mid-air)
      player.update(1.2);
      expect(player.state).toBe('capturing');
      expect(player.y).toBeLessThan(Player.BASELINE_Y);

      // 4. Player missile hits and destroys Boss mid-ascent
      const missile = game.bulletManager.firePlayerBullet(boss.x, boss.y, false);
      expect(missile).not.toBeNull();

      game.resolveCollisions();

      // Boss is destroyed and tractor beam collapses
      expect(boss.health).toBe(0);
      expect(game.tractorBeam.isActive()).toBe(false);

      // 5. Verify Player invariants immediately post-destruction:
      expect(player.state).toBe('normal'); // Restored to normal state!
      expect(player.lives).toBe(initialLives); // ZERO lives deducted!
      expect(player.invulnerableTimer).toBe(1.0); // Exactly 1.0s invulnerability!
      expect(player.isInvulnerable()).toBe(true);
      expect(player.y).toBe(Player.BASELINE_Y); // Reset to baseline flight line!

      // 6. Advance gameplay for 0.5s: player remains invulnerable and alive
      player.update(0.5);
      expect(player.state).toBe('normal');
      expect(player.isInvulnerable()).toBe(true);
      expect(player.lives).toBe(initialLives);

      // 7. Advance past 1.0s grace period: invulnerability expires cleanly
      player.update(0.6);
      expect(player.isInvulnerable()).toBe(false);
      expect(player.state).toBe('normal');
      expect(player.lives).toBe(initialLives);
    });
  });

  // ==========================================================================
  // 6. Audio Concurrency & Watchdog Leak Prevention
  // ==========================================================================
  describe('Challenge 6: Audio Concurrency & Watchdog Leak Prevention', () => {
    let mockCtx: MockAudioContext;
    let audioMgr: AudioContextManager;
    let synth: SoundSynth;

    beforeEach(() => {
      vi.useFakeTimers();
      mockCtx = new MockAudioContext();

      (global as any).window = {
        AudioContext: function() { return mockCtx; },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      (global as any).AudioContext = function() { return mockCtx; };

      AudioContextManager.resetInstance();
      SoundSynth.resetInstance();

      audioMgr = AudioContextManager.getInstance();
      audioMgr.init();
      mockCtx.createdNodes = []; // Clear persistent bus nodes (master, sfx, music)
      synth = SoundSynth.getInstance(audioMgr);
    });

    afterEach(() => {
      AudioContextManager.resetInstance();
      SoundSynth.resetInstance();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('limits activeVoiceCount <= 12 under 50 rapid playBossHit calls and prevents node leaks when onended is dropped', () => {
      // Simulate environment where onended callbacks are COMPLETELY DROPPED
      // (MockOscillatorNode does not trigger onended automatically)

      let attemptedCalls = 0;
      let acceptedCalls = 0;

      // Fire 50 rapid playBossHit calls across simulated time
      for (let i = 0; i < 50; i++) {
        attemptedCalls++;
        // Advance clock in tiny increments to test both debounce and pool exhaustion
        vi.advanceTimersByTime(5);
        mockCtx.currentTime += 0.005;

        const played = synth.playBossHit();
        if (played) {
          acceptedCalls++;
        }

        // INVARIANT 1: activeVoiceCount MUST NEVER EXCEED MAX_CONCURRENT_VOICES (12)
        expect(synth.getActiveVoiceCount()).toBeLessThanOrEqual(SoundSynth.MAX_CONCURRENT_VOICES);
      }

      expect(attemptedCalls).toBe(50);
      expect(acceptedCalls).toBeGreaterThan(0);
      expect(synth.getActiveVoiceCount()).toBeLessThanOrEqual(12);

      // Verify that nodes were created
      expect(mockCtx.createdNodes.length).toBeGreaterThan(0);

      // At this point, onended was never called. But the watchdog timers are scheduled!
      // Boss hit duration is 0.06s. Watchdog fires at Math.ceil((0.06 + 0.05) * 1000) = 110ms.
      // Advance time past all watchdog timers (300ms)
      vi.advanceTimersByTime(300);

      // INVARIANT 2: Watchdog MUST have cleaned up all voices to 0
      expect(synth.getActiveVoiceCount()).toBe(0);

      // INVARIANT 3: Zero node leaks — all created nodes MUST have disconnect() called
      for (const node of mockCtx.createdNodes) {
        expect(node.disconnected).toBe(true);
      }
    });

    it('enforces priority headroom ceiling (16 voices) and cleans up under mixed dropped callbacks', () => {
      // 1. Fill normal slots to 12
      for (let i = 0; i < 12; i++) {
        synth.playLaser();
      }
      expect(synth.getActiveVoiceCount()).toBe(12);

      // Normal call is rejected
      const normalBossHit = synth.playBossHit();
      expect(normalBossHit).toBe(false);

      // High priority calls can enter headroom up to 16
      const hp1 = synth.playExplosion('boss', { priority: SOUND_PRIORITY.HIGH });
      const hp2 = synth.playExplosion('boss', { priority: SOUND_PRIORITY.HIGH });
      expect(hp1).toBe(true);
      expect(hp2).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(14);

      // Additional calls beyond 16 are strictly rejected
      synth.playExplosion('boss', { priority: SOUND_PRIORITY.HIGH });
      synth.playExplosion('boss', { priority: SOUND_PRIORITY.HIGH });
      expect(synth.getActiveVoiceCount()).toBe(16);

      const rejectedHp = synth.playExplosion('boss', { priority: SOUND_PRIORITY.HIGH });
      expect(rejectedHp).toBe(false);

      // Advance watchdog timers
      vi.advanceTimersByTime(1000);
      expect(synth.getActiveVoiceCount()).toBe(0);

      // All nodes disconnected
      for (const node of mockCtx.createdNodes) {
        expect(node.disconnected).toBe(true);
      }
    });
  });
});
