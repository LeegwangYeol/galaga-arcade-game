/**
 * Galaga Arcade Web Game — Crisis Event Factory Subsystem
 * Milestone 10: Extensible Factory Pattern for 11 Stellaris Crisis Events
 */

import {
  CrisisEventType,
  type CrisisEventConstructor,
  type CrisisEventContext,
  type ICrisisEvent,
  type CrisisMetadata,
} from './types';

// Import all 11 concrete crisis implementations
import { TheContingencyEvent } from './events/TheContingencyEvent';
import { TheUnbiddenEvent } from './events/TheUnbiddenEvent';
import { ThePrethorynScourgeEvent } from './events/ThePrethorynScourgeEvent';
import { ShieldOverloadEvent } from './events/ShieldOverloadEvent';
import { PhysicsInversionEvent } from './events/PhysicsInversionEvent';
import { HyperspaceStormEvent } from './events/HyperspaceStormEvent';
import { NaniteCloudEvent } from './events/NaniteCloudEvent';
import { PsionicResonanceEvent } from './events/PsionicResonanceEvent';
import { DevouringSwarmFrenzyEvent } from './events/DevouringSwarmFrenzyEvent';
import { NemesisStarEaterEvent } from './events/NemesisStarEaterEvent';
import { TimeDilationFieldEvent } from './events/TimeDilationFieldEvent';

export class CrisisEventFactory {
  private static readonly registry = new Map<CrisisEventType, CrisisEventConstructor>();
  private static readonly metadataRegistry = new Map<CrisisEventType, CrisisMetadata>();
  private static isInitialized = false;

  /**
   * Registers a crisis constructor and optional metadata.
   */
  public static register(
    type: CrisisEventType,
    constructorFn: CrisisEventConstructor,
    metadata?: CrisisMetadata
  ): void {
    CrisisEventFactory.registry.set(type, constructorFn);
    if (metadata) {
      CrisisEventFactory.metadataRegistry.set(type, metadata);
    }
  }

  /**
   * Checks if a crisis event type is registered in the factory.
   */
  public static isRegistered(type: CrisisEventType): boolean {
    CrisisEventFactory.ensureInitialized();
    return CrisisEventFactory.registry.has(type);
  }

  /**
   * Instantiates and initializes a crisis event instance.
   * @throws Error if the requested type has not been registered
   */
  public static create(type: CrisisEventType, context: CrisisEventContext): ICrisisEvent {
    CrisisEventFactory.ensureInitialized();
    const constructorFn = CrisisEventFactory.registry.get(type);
    if (!constructorFn) {
      throw new Error(`[CrisisEventFactory] Unregistered crisis event type: "${type}"`);
    }

    const event = constructorFn(context);
    event.init(context);
    return event;
  }

  /**
   * Returns all currently registered crisis event types.
   */
  public static getAllTypes(): CrisisEventType[] {
    CrisisEventFactory.ensureInitialized();
    return Array.from(CrisisEventFactory.registry.keys());
  }

  /**
   * Returns the count of registered crisis types.
   */
  public static getRegisteredCount(): number {
    CrisisEventFactory.ensureInitialized();
    return CrisisEventFactory.registry.size;
  }

  /**
   * Selects a random crisis type from the registered pool, optionally excluding one type.
   */
  public static getRandomType(exclude?: CrisisEventType): CrisisEventType {
    CrisisEventFactory.ensureInitialized();
    const available = CrisisEventFactory.getAllTypes().filter((t) => t !== exclude);
    if (available.length === 0) {
      const fallback = CrisisEventFactory.getAllTypes();
      return fallback[0] ?? CrisisEventType.THE_CONTINGENCY;
    }
    const index = Math.floor(Math.random() * available.length);
    return available[index]!;
  }

  /**
   * Returns metadata for a registered crisis type.
   */
  public static getMetadata(type: CrisisEventType): CrisisMetadata | undefined {
    CrisisEventFactory.ensureInitialized();
    return CrisisEventFactory.metadataRegistry.get(type);
  }

  /**
   * Unregisters a specific crisis type (useful in unit test teardowns).
   */
  public static unregister(type: CrisisEventType): boolean {
    CrisisEventFactory.metadataRegistry.delete(type);
    return CrisisEventFactory.registry.delete(type);
  }

  /**
   * Clears the entire registry (for testing isolation).
   */
  public static clearRegistry(): void {
    CrisisEventFactory.registry.clear();
    CrisisEventFactory.metadataRegistry.clear();
    CrisisEventFactory.isInitialized = true;
  }

  /**
   * Bootstraps default crisis registrations for all 11 Stellaris crisis events.
   * Automatically invoked on first access if registry is empty.
   */
  public static registerDefaults(): void {
    // 1. THE_CONTINGENCY
    CrisisEventFactory.register(
      CrisisEventType.THE_CONTINGENCY,
      () => new TheContingencyEvent(),
      {
        type: CrisisEventType.THE_CONTINGENCY,
        name: 'THE CONTINGENCY',
        flavorText: 'GHOST SIGNAL OVERRIDE',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'AI rogue pulse with predictive enemy bullet aim and weapon fire stutter',
      }
    );

    // 2. THE_UNBIDDEN
    CrisisEventFactory.register(
      CrisisEventType.THE_UNBIDDEN,
      () => new TheUnbiddenEvent(),
      {
        type: CrisisEventType.THE_UNBIDDEN,
        name: 'THE UNBIDDEN',
        flavorText: 'DIMENSIONAL TEAR DETECTED',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Extradimensional tear exerting gravitational pull on player missiles',
      }
    );

    // 3. THE_PRETHORYN_SCOURGE
    CrisisEventFactory.register(
      CrisisEventType.THE_PRETHORYN_SCOURGE,
      () => new ThePrethorynScourgeEvent(),
      {
        type: CrisisEventType.THE_PRETHORYN_SCOURGE,
        name: 'THE PRETHORYN SCOURGE',
        flavorText: 'ORGANIC SWARM INFECTION',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Enemies burst into acid micro-spores; surviving aliens regenerate shields',
      }
    );

    // 4. SHIELD_OVERLOAD
    CrisisEventFactory.register(
      CrisisEventType.SHIELD_OVERLOAD,
      () => new ShieldOverloadEvent(),
      {
        type: CrisisEventType.SHIELD_OVERLOAD,
        name: 'SHIELD OVERLOAD',
        flavorText: 'ENERGY MATRIX OVERDRIVE',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Fleet deflectors charged with +2 shields for all living enemies',
      }
    );

    // 5. PHYSICS_INVERSION
    CrisisEventFactory.register(
      CrisisEventType.PHYSICS_INVERSION,
      () => new PhysicsInversionEvent(),
      {
        type: CrisisEventType.PHYSICS_INVERSION,
        name: 'PHYSICS INVERSION',
        flavorText: 'SINGULARITY SHIFT',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Gravity flips upward: starfield reverses and diving aliens loop upward',
      }
    );

    // 6. HYPERSPACE_STORM
    CrisisEventFactory.register(
      CrisisEventType.HYPERSPACE_STORM,
      () => new HyperspaceStormEvent(),
      {
        type: CrisisEventType.HYPERSPACE_STORM,
        name: 'HYPERSPACE STORM',
        flavorText: 'HYPERLANE TEMPEST DETECTED',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Cosmic lightning hazard lanes and +25% enemy dive speed boost',
      }
    );

    // 7. NANITE_CLOUD
    CrisisEventFactory.register(
      CrisisEventType.NANITE_CLOUD,
      () => new NaniteCloudEvent(),
      {
        type: CrisisEventType.NANITE_CLOUD,
        name: 'NANITE CLOUD',
        flavorText: 'GRAY TEMPEST: NANITE SMOG OCCLUDING PLAYFIELD',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Swirling nanite smog clusters dissolve stray player bullets into shrapnel',
      }
    );

    // 8. PSIONIC_RESONANCE
    CrisisEventFactory.register(
      CrisisEventType.PSIONIC_RESONANCE,
      () => new PsionicResonanceEvent(),
      {
        type: CrisisEventType.PSIONIC_RESONANCE,
        name: 'PSIONIC RESONANCE',
        flavorText: 'SHROUD BREACH: DIMENSIONAL PHANTOMS MANIFEST',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Phantom illusion enemies interleaved in formation; 0 score, 0 damage',
      }
    );

    // 9. DEVOURING_SWARM_FRENZY
    CrisisEventFactory.register(
      CrisisEventType.DEVOURING_SWARM_FRENZY,
      () => new DevouringSwarmFrenzyEvent(),
      {
        type: CrisisEventType.DEVOURING_SWARM_FRENZY,
        name: 'DEVOURING SWARM FRENZY',
        flavorText: 'HIVE FLEET BLITZ: ALL UNITS DIVE BOMB NOW',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Formation dissolves into continuous, coordinated rapid dive-bomb runs',
      }
    );

    // 10. NEMESIS_STAR_EATER
    CrisisEventFactory.register(
      CrisisEventType.NEMESIS_STAR_EATER,
      () => new NemesisStarEaterEvent(),
      {
        type: CrisisEventType.NEMESIS_STAR_EATER,
        name: 'NEMESIS STAR-EATER',
        flavorText: 'DARK MATTER IGNITION: BOSS GALAGA BEAM CANNON',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Dark matter ignition dims space; Boss Galaga sweeping energy beam cannon',
      }
    );

    // 11. TIME_DILATION_FIELD
    CrisisEventFactory.register(
      CrisisEventType.TIME_DILATION_FIELD,
      () => new TimeDilationFieldEvent(),
      {
        type: CrisisEventType.TIME_DILATION_FIELD,
        name: 'TIME DILATION FIELD',
        flavorText: 'CHRONO ANOMALY: OSCILLATING TEMPORAL PULSE',
        warningDuration: 3.0,
        activeDuration: 20.0,
        description: 'Chrono anomaly pulsing between 1.5x hyper-speed and 0.5x bullet-time',
      }
    );

    CrisisEventFactory.isInitialized = true;
  }

  private static ensureInitialized(): void {
    if (!CrisisEventFactory.isInitialized && CrisisEventFactory.registry.size === 0) {
      CrisisEventFactory.registerDefaults();
    }
  }
}
