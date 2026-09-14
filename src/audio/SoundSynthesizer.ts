/**
 * Galaga Arcade Web Game — Procedural Sound Synthesizer Alias
 * Milestone 14: Procedural Web Audio API Sound Synthesis
 * 
 * Re-exports SoundSynth as SoundSynthesizer for full API specification compliance.
 */

import { SoundSynth } from './SoundSynth';

export { SoundSynth, SoundSynth as SoundSynthesizer };
export default SoundSynth;
