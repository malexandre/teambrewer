import type { FormatDefinition } from "../game-adapter.interface.js";

/**
 * Riftbound play formats (see docs/domain/riftbound.md). Reference context only —
 * TeamBrewer surfaces formats but does not enforce legality. Confirmed at build
 * time: competitive Riftbound is Best-of-three Constructed (Standard); Limited is
 * Draft and Sealed. Game-specific data owned by this adapter; the core never
 * hard-codes it.
 */
export const RIFTBOUND_FORMATS: readonly FormatDefinition[] = [
  { key: "standard", name: "Standard", isConstructed: true, sortOrder: 0 },
  { key: "draft", name: "Draft", isConstructed: false, sortOrder: 1 },
  { key: "sealed", name: "Sealed", isConstructed: false, sortOrder: 2 },
];
