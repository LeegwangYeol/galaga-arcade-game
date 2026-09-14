/**
 * Galaga Arcade Web Game — Unified Audio Manager Facade
 * Milestone 14: Procedural Web Audio API Sound Synthesis & Management
 * 
 * Unifies AudioContextManager, SoundSynth, and MusicJingles into a single
 * zero-allocation, zero-external-asset audio engine facade.
 */

import { AudioContextManager } from './AudioContextManager';
import { SoundSynth, type ExplosionType, type AlienType } from './SoundSynth';
import { MusicJingles } from './MusicJingles';
import type { AudioEventType, SoundOptions } from '../types';
import type { SoundPlaybackOptions } from './types';

export class AudioManager {
  private static instance: AudioManager | null = null;
  private audioContextManager: AudioContextManager;
  private soundSynth: SoundSynth;

  public constructor(soundSynth?: SoundSynth, audioContextManager?: AudioContextManager) {
    this.audioContextManager = audioContextManager ?? AudioContextManager.getInstance();
    this.soundSynth = soundSynth ?? SoundSynth.getInstance(this.audioContextManager);
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public static resetInstance(): void {
    if (AudioManager.instance) {
      AudioManager.instance.stopAll();
      AudioManager.instance = null;
    }
  }

  public getContextManager(): AudioContextManager {
    return this.audioContextManager;
  }

  public getSoundSynth(): SoundSynth {
    return this.soundSynth;
  }

  public getSynth(): SoundSynth {
    return this.soundSynth;
  }

  public getMusicJingles(): typeof MusicJingles {
    return MusicJingles;
  }

  // ==========================================================================
  // Core Classic SFX
  // ==========================================================================

  public playLaser(options?: SoundOptions): boolean {
    return this.soundSynth.playLaser(options);
  }

  public playLaserDual(options?: SoundOptions): boolean {
    return this.soundSynth.playLaserDual(options);
  }

  public playExplosion(type: ExplosionType = 'small', options?: SoundOptions): boolean {
    return this.soundSynth.playExplosion(type, options);
  }

  public playAlienDive(alienType: AlienType = 'zako', options?: SoundOptions): boolean {
    return this.soundSynth.playAlienDive(alienType, options);
  }

  public playTractorBeam(active: boolean, options?: SoundOptions): boolean {
    return this.soundSynth.playTractorBeam(active, options);
  }

  public stopTractorBeam(): void {
    this.soundSynth.stopTractorBeam();
  }

  public playBossHit(options?: SoundOptions): boolean {
    return this.soundSynth.playBossHit(options);
  }

  public playEvent(eventType: AudioEventType, options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playEvent(eventType, options);
  }

  // ==========================================================================
  // Chiptune Music Jingles & Fanfares
  // ==========================================================================

  public playStageStartFanfare(): boolean {
    const handle = MusicJingles.playStageStartFanfare();
    return handle ? handle.isPlaying : false;
  }

  public playChallengingStageJingle(): boolean {
    const handle = MusicJingles.playChallengingStageTheme();
    return handle ? handle.isPlaying : false;
  }

  public playDockingChime(): boolean {
    const handle = MusicJingles.playDockingJingle();
    return handle ? handle.isPlaying : false;
  }

  public playGameOverJingle(): boolean {
    const handle = MusicJingles.playGameOverTune();
    return handle ? handle.isPlaying : false;
  }

  public playBonusPerfectFanfare(): boolean {
    const handle = MusicJingles.playBonusFanfare();
    return handle ? handle.isPlaying : false;
  }

  // ==========================================================================
  // Milestone 12: Epic Boss SFX
  // ==========================================================================

  public playHeavyLaserBlast(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playHeavyLaserBlast(options);
  }

  public playSpiralRingWhoosh(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playSpiralRingWhoosh(options);
  }

  public playDimensionalTearHum(loop: boolean = false, options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playDimensionalTearHum(loop, options);
  }

  public stopDimensionalTearHum(): void {
    this.soundSynth.stopDimensionalTearHum();
  }

  public playBlackHoleSuctionRumble(loop: boolean = false, options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playBlackHoleSuctionRumble(loop, options);
  }

  public stopBlackHoleSuctionRumble(): void {
    this.soundSynth.stopBlackHoleSuctionRumble();
  }

  public playNaniteSplitShimmer(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playNaniteSplitShimmer(options);
  }

  public playGrayGooDissolveHiss(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playGrayGooDissolveHiss(options);
  }

  public playPhantomDiveWarble(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playPhantomDiveWarble(options);
  }

  public playTelekineticStunScreech(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playTelekineticStunScreech(options);
  }

  public playOrbitalShieldHum(loop: boolean = false, options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playOrbitalShieldHum(loop, options);
  }

  public stopOrbitalShieldHum(): void {
    this.soundSynth.stopOrbitalShieldHum();
  }

  public playDarkMatterBeamCharge(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playDarkMatterBeamCharge(options);
  }

  public playDarkMatterBeamRoar(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playDarkMatterBeamRoar(options);
  }

  public stopDarkMatterBeamRoar(): void {
    this.soundSynth.stopDarkMatterBeamRoar();
  }

  public playEnrageSiren(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playEnrageSiren(options);
  }

  // ==========================================================================
  // Milestone 10: 11 Stellaris Crisis SFX
  // ==========================================================================

  public playCrisisKlaxon(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playCrisisKlaxon(options);
  }

  public playDigitalGlitch(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playDigitalGlitch(options);
  }

  public playLightningCrackle(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playLightningCrackle(options);
  }

  public playDarkMatterIgnition(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playDarkMatterIgnition(options);
  }

  // ==========================================================================
  // Milestone 13: Allies Support System SFX
  // ==========================================================================

  public playEscortPlasmaBolt(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playEscortPlasmaBolt(options);
  }

  public playShieldRepairChime(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playShieldRepairChime(options);
  }

  public playPointDefensePing(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playPointDefensePing(options);
  }

  public playBomberEngineSweep(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playBomberEngineSweep(options);
  }

  public playClusterBombThud(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playClusterBombThud(options);
  }

  // ==========================================================================
  // Milestone 13: Special Moves SFX
  // ==========================================================================

  public playNovaLockChime(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playNovaLockChime(options);
  }

  public playNovaMissileSwoosh(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playNovaMissileSwoosh(options);
  }

  public playChronoFreezeDrop(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playChronoFreezeDrop(options);
  }

  public playClockFreezeTick(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playClockFreezeTick(options);
  }

  public playWarpRamSonicBoom(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playWarpRamSonicBoom(options);
  }

  // ==========================================================================
  // Milestone 18: Glitch Sound Effects
  // ==========================================================================

  public playGlitchBuzz(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playGlitchBuzz(options);
  }

  public playGlitchFrequencyChirp(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playGlitchFrequencyChirp(options);
  }

  public playDataStreamNoise(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playDataStreamNoise(options);
  }

  // ==========================================================================
  // Milestone 19: Power-Up Sound Effects
  // ==========================================================================

  public playChronoFieldActivate(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playChronoFieldActivate(options);
  }

  public playReflectionDeflect(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playReflectionDeflect(options);
  }

  public playEmpBulletAbsorb(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playEmpBulletAbsorb(options);
  }

  public playPhaseDriveBlink(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playPhaseDriveBlink(options);
  }

  public playPlasmaBeamPulse(options?: SoundPlaybackOptions): boolean {
    return this.soundSynth.playPlasmaBeamPulse(options);
  }

  // ==========================================================================
  // Master Controls & Teardown
  // ==========================================================================

  public unlock(): Promise<boolean> {
    return this.audioContextManager.unlock();
  }

  public async suspend(): Promise<void> {
    await this.audioContextManager.suspend();
  }

  public async resume(): Promise<void> {
    await this.audioContextManager.resume();
  }

  public isMuted(): boolean {
    return this.audioContextManager.getIsMuted();
  }

  public setMuted(muted: boolean): void {
    this.audioContextManager.setMuted(muted);
  }

  public toggleMute(): boolean {
    return this.audioContextManager.toggleMute();
  }

  public setMasterVolume(vol: number): void {
    this.audioContextManager.setMasterVolume(vol);
  }

  public setSfxVolume(vol: number): void {
    this.audioContextManager.setSfxVolume(vol);
  }

  public setMusicVolume(vol: number): void {
    this.audioContextManager.setMusicVolume(vol);
  }

  public stopAll(): void {
    this.soundSynth.stopAll();
    MusicJingles.stopAll();
  }
}
export default AudioManager;
