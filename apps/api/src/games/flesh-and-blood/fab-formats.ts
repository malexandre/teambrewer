import type { FormatDefinition } from "../game-adapter.interface.js";

/**
 * Flesh and Blood play formats (see docs/domain/flesh-and-blood.md). Reference
 * context only — TeamBrewer surfaces formats but does not enforce legality.
 * Game-specific data owned by this adapter; the core never hard-codes it.
 */
export const FLESH_AND_BLOOD_FORMATS: readonly FormatDefinition[] = [
  { key: "cc", name: "Classic Constructed", isConstructed: true, sortOrder: 0 },
  { key: "blitz", name: "Blitz", isConstructed: true, sortOrder: 1 },
  { key: "ll", name: "Living Legend", isConstructed: true, sortOrder: 2 },
  { key: "commoner", name: "Commoner", isConstructed: true, sortOrder: 3 },
  { key: "silver_age", name: "Silver Age", isConstructed: true, sortOrder: 4 },
  { key: "draft", name: "Draft", isConstructed: false, sortOrder: 5 },
  { key: "sealed", name: "Sealed", isConstructed: false, sortOrder: 6 },
];
