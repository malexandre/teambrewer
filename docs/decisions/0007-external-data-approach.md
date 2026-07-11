# ADR-0007: External data — reference by link, sanctioned card data only

- **Status:** Accepted (2026-07-11)
- **Context:** The team wants external meta/decklist context. Research found **no sanctioned public APIs**
  for third-party decklists/meta (Fabrary, FABlazing, FaBTCGMeta, official archive), and their terms
  generally don't permit scraping. Card data, however, is available from **open** sources. The user
  reasoned: don't import external decklists — just **link** to them.

## Decision

- **External decks are referenced by link + light metadata only** (hero/identity, format, source, event,
  placement, label). No import, no parsing of contents, **no scraping**.
- **Card reference data** is synced from **sanctioned open sources**: the-fab-cube open dataset for FaB,
  Riftcodex open API for Riftbound (verify licenses/terms at build time). Sync into our DB; attribute
  sources; don't live-hammer third parties.
- **Automated external meta feeds are out of scope.** If ever added, they must use sanctioned APIs, be
  opt-in, and clearly disclose source/terms.

See [`../domain/card-data-sources.md`](../domain/card-data-sources.md) and the rule
[`../../.claude/rules/data-sources.md`](../../.claude/rules/data-sources.md).

## Consequences

- ToS-safe, robust (links don't break the way scrapers do), and simple.
- The team still gets external context (one click to the linked list/meta site).
- The app doesn't know external deck contents — consistent with [ADR-0002](0002-decks-as-links.md).

## Alternatives considered

- **Scrape meta sites / deck pages** — rejected: fragile, ToS risk, maintenance burden.
- **Manual bulk decklist import** — rejected as unnecessary given the link-only model.
