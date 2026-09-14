/**
 * Milestone M18: Glitch Concept Gimmick Events & Anomalous Enemy Behaviors
 * Type Definitions & Contracts
 */

export enum GlitchEventType {
  RASTER_TEAR = 'RASTER_TEAR',
  CHROMATIC_ABERRATION = 'CHROMATIC_ABERRATION',
  XOR_NOISE = 'XOR_NOISE',
  HEX_SCRAMBLE = 'HEX_SCRAMBLE',
  QUANTUM_TELEPORT = 'QUANTUM_TELEPORT',
  KINETIC_INVERSION = 'KINETIC_INVERSION',
  MIRAGE_CLONES = 'MIRAGE_CLONES',
  SECTOR_ANOMALY = 'SECTOR_ANOMALY',
}

export type GlitchState = 'IDLE' | 'WARNING' | 'ACTIVE' | 'COOLDOWN';

export interface TearBand {
  y: number;
  height: number;
  offsetX: number;
  tint: string;
}

export interface GlitchRenderConfig {
  rasterTearActive: boolean;
  rasterTearIntensity: number;
  chromaticAberrationActive: boolean;
  chromaShiftX: number;
  chromaShiftY: number;
  hudScrambleActive: boolean;
  hudScrambleRatio: number;
}

export interface GlitchTelemetry {
  active: boolean;
  state: GlitchState;
  type: GlitchEventType | null;
  isGlitchSector: boolean;
  timer: number;
  activeGlitchedEnemies: number;
  activePhantomClones: number;
}

export interface IGlitchEvent {
  readonly type: GlitchEventType;
  readonly name: string;
  readonly description: string;
  readonly duration: number;
  state: GlitchState;
  timer: number;

  onStart(game: any): void;
  update(dt: number, game: any): void;
  render(ctx: CanvasRenderingContext2D): void;
  onEnd(game: any): void;
}
