import { Inject, Injectable } from "@nestjs/common";

import type { GameAdapter } from "./game-adapter.interface.js";

/**
 * DI token for the set of registered game adapters. `CardsModule` binds this to
 * the concrete adapters (the FaB adapter today); the registry receives them.
 */
export const GAME_ADAPTERS = Symbol("GAME_ADAPTERS");

/**
 * Resolves a {@link GameAdapter} by its `key` (which matches `Game.key`). This is
 * the *only* place the core reaches a game adapter, and it is used solely during
 * card sync — reads filter by `gameId` and never touch the registry. Keeping
 * resolution here preserves the "core never imports a game adapter" rule.
 */
@Injectable()
export class GameAdapterRegistry {
  private readonly adaptersByKey = new Map<string, GameAdapter>();

  constructor(@Inject(GAME_ADAPTERS) adapters: GameAdapter[]) {
    for (const adapter of adapters) {
      this.adaptersByKey.set(adapter.key, adapter);
    }
  }

  /** Resolve the adapter for a game key, or throw if none is registered. */
  get(gameKey: string): GameAdapter {
    const adapter = this.adaptersByKey.get(gameKey);
    if (!adapter) {
      throw new Error(`No game adapter is registered for game key "${gameKey}".`);
    }
    return adapter;
  }

  /** Whether an adapter is registered for the given game key. */
  has(gameKey: string): boolean {
    return this.adaptersByKey.has(gameKey);
  }

  /** All registered game keys. */
  keys(): string[] {
    return [...this.adaptersByKey.keys()];
  }
}
