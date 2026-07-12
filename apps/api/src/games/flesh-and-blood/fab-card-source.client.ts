import { Injectable, Logger } from "@nestjs/common";

import type { RawCardRecord } from "../game-adapter.interface.js";

/**
 * Fetches the Flesh and Blood card dataset from the-fab-cube open source
 * (ADR-0007, data-sources rule). Pinned to a release tag for reproducibility —
 * never a moving branch — and overridable by env for testing/mirroring. This is
 * the single network seam: tests override this provider with a fixture so the
 * suite never hits the network.
 */

/** Pinned the-fab-cube release verified at build time (see phase-02 plan). */
const DEFAULT_FAB_CARDS_REF = "v8.2.0";

@Injectable()
export class FabCardSourceClient {
  private readonly logger = new Logger(FabCardSourceClient.name);

  /** The dataset version this client is pinned to (recorded as `sourceVersion`). */
  get sourceVersion(): string {
    return process.env["FAB_CARDS_REF"] ?? DEFAULT_FAB_CARDS_REF;
  }

  get sourceUrl(): string {
    return (
      process.env["FAB_CARDS_URL"] ??
      `https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/${this.sourceVersion}/json/english/card.json`
    );
  }

  async fetchRawCards(): Promise<RawCardRecord[]> {
    const url = this.sourceUrl;
    this.logger.log(`Fetching Flesh and Blood card data from ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Flesh and Blood card data (${response.status} from ${url}).`,
      );
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error(
        "Flesh and Blood card data is not an array; the source schema may have changed.",
      );
    }
    return payload as RawCardRecord[];
  }
}
