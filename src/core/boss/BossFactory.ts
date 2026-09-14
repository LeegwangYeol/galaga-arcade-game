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

    if (boss && game) {
      const isCoop = typeof game.isCoop === 'function' ? game.isCoop() : false;
      const coopMult = isCoop ? 1.60 : 1.00;
      const ddaMult = game.dynamicDifficultyManager
        ? game.dynamicDifficultyManager.getBossHealthMultiplier()
        : 1.0;
      const totalMult = coopMult * ddaMult;

      if (totalMult !== 1.0) {
        boss.maxHealth = Math.round(boss.maxHealth * totalMult);
        boss.health = boss.maxHealth;
      }
    }

    return boss;
  }
}
