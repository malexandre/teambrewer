import { Injectable, Logger } from "@nestjs/common";

import type { RawCardRecord } from "../game-adapter.interface.js";
import type { RiftcodexCardsPage } from "./riftbound-raw-card.type.js";

/**
 * Fetches the Riftbound card dataset from the Riftcodex open REST API (ADR-0007,
 * data-sources rule). Riftcodex is an unofficial fan project under Riot's fan
 * content policy with no auth on reads; we sync the whole catalog once (never
 * live-hammer) and attribute it in-app. This is the single network seam: tests
 * override this provider with a fixture so the suite never hits the network.
 *
 * Riftcodex exposes no dataset version tag, so `sourceVersion` is a pinned label
 * (overridable by env) — mirroring how the FaB client pins a release ref — which
 * keeps `describeSource()` synchronous and card sync deterministic.
 */

/** The Riftcodex API base, confirmed at build time (see phase-12 plan). */
const DEFAULT_RIFTBOUND_CARDS_URL = "https://api.riftcodex.com";

/** The dataset version label recorded as `sourceVersion` (no upstream tag exists). */
const DEFAULT_RIFTBOUND_CARDS_REF = "riftcodex-2026-07";

/**
 * How we identify ourselves to the Riftcodex API. The default `fetch` (undici) sends no
 * `User-Agent`, which Cloudflare Bot Fight Mode blocks (403) from datacenter IPs even
 * though Riftcodex's FAQ opens the API to programmatic use. So we send an honest,
 * app-identifying UA (never a spoofed browser) — good-citizen practice per data-sources.md.
 * Operators can override it (e.g. to add a contact) with `RIFTBOUND_CARDS_USER_AGENT`.
 */
const DEFAULT_RIFTBOUND_CARDS_USER_AGENT =
  "TeamBrewer/1.0 (+https://github.com/malexandre/teambrewer) card-sync";

/** Riftcodex caps page size at 100. */
const PAGE_SIZE = 100;

/** A defensive cap so a source-schema change can never spin an unbounded loop. */
const MAX_PAGES = 1000;

@Injectable()
export class RiftcodexCardSourceClient {
  private readonly logger = new Logger(RiftcodexCardSourceClient.name);

  /** The dataset version this client is pinned to (recorded as `sourceVersion`). */
  get sourceVersion(): string {
    return process.env["RIFTBOUND_CARDS_REF"] ?? DEFAULT_RIFTBOUND_CARDS_REF;
  }

  get sourceUrl(): string {
    return process.env["RIFTBOUND_CARDS_URL"] ?? DEFAULT_RIFTBOUND_CARDS_URL;
  }

  /** The `User-Agent` we identify with so bot protection lets a legitimate client through. */
  get userAgent(): string {
    return process.env["RIFTBOUND_CARDS_USER_AGENT"] ?? DEFAULT_RIFTBOUND_CARDS_USER_AGENT;
  }

  async fetchRawCards(): Promise<RawCardRecord[]> {
    const baseUrl = this.sourceUrl;
    this.logger.log(`Fetching Riftbound card data from ${baseUrl}/cards`);
    // Identify ourselves honestly: the default undici request (no User-Agent) is 403'd by
    // Cloudflare Bot Fight Mode from datacenter IPs. See DEFAULT_RIFTBOUND_CARDS_USER_AGENT.
    const headers = { "User-Agent": this.userAgent, Accept: "application/json" };
    const records: RawCardRecord[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = `${baseUrl}/cards?size=${PAGE_SIZE}&page=${page}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch Riftbound card data (${response.status} from ${url}).`);
      }
      const payload = (await response.json()) as unknown;
      if (
        typeof payload !== "object" ||
        payload === null ||
        !Array.isArray((payload as RiftcodexCardsPage).items)
      ) {
        throw new Error(
          "Riftbound card data is not a paginated { items: [...] } object; the source schema may have changed.",
        );
      }
      const cardsPage = payload as RiftcodexCardsPage;
      records.push(...(cardsPage.items as RawCardRecord[]));
      const totalPages =
        Number.isFinite(cardsPage.pages) && cardsPage.pages > 0 ? cardsPage.pages : page;
      if (page >= totalPages) {
        break;
      }
    }
    return records;
  }
}
