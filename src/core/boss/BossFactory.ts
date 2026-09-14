/**
 * Galaga Arcade Web Game — Boss Encounter Factory
 * 
 * Instantiates the canonical boss for milestone stages 10, 20, 30, 40, and 50.
 */

import type { Game } from '../Game';
import type { BaseBoss } from './BaseBoss';
import { AeternumCore } from './bosses/AeternumCore';
import { CyberDreadnought } from './bosses/CyberDreadnought';
import { DimensionalLeviathan } from './bosses/DimensionalLeviathan';
import { NaniteColossus } from './bosses/NaniteColossus';
import { PsionicHarbinger } from './bosses/PsionicHarbinger';

export class BossFactory {
  public static createBoss(stage: number, game: Game): BaseBoss | null {
    let boss: BaseBoss | null = null;
    switch (stage) {
      case 10:
        boss = new CyberDreadnought(game);
        break;
      case 20:
        boss = new DimensionalLeviathan(game);
        break;
      case 30:
        boss = new NaniteColossus(game);
        break;
      case 40:
        boss = new PsionicHarbinger(game);
        break;
      case 50:
        boss = new AeternumCore(game);
        break;
      default:
        return null;
    }

    if (boss && game && game.dynamicDifficultyManager) {
      const mult = game.dynamicDifficultyManager.getBossHealthMultiplier();
      if (mult !== 1.0) {
        boss.maxHealth = Math.round(boss.maxHealth * mult);
        boss.health = boss.maxHealth;
      }
    }

    return boss;
  }
}
