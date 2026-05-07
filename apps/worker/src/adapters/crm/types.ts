// Shared types for CRM discovery handlers. Each handler reads its own
// config blob (kind-specific) and returns a uniform list of "discovered"
// leads. The worker then upserts them via @@unique([sourceKind, externalId]).

import type { LeadSourceKind, LeadType, PrismaClient } from '@aiagg/db';

export interface DiscoveredLead {
  type: LeadType;
  // Stable identifier within the source. Examples:
  //  - iTunes:    track id (e.g. "id1234567890")
  //  - Play:      package name (e.g. "com.example.aiart")
  //  - Lyzem/TG:  channel username without @
  externalId: string;
  name: string;
  url?: string;
  telegramUsername?: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerWebsite?: string;
  // Computed by the handler from signals (audience size, AI keyword density,
  // ad spend, etc.). 0..100. Persisted on the Lead row, used for ranking
  // in the kanban.
  score?: number;
  // Free-form metadata stashed in lead.metadata. Source-specific.
  metadata?: Record<string, unknown>;
}

export interface DiscoveryContext {
  prisma: PrismaClient;
  // Per-handler logger prefix. Use console.log for now — picked up by
  // Northflank logs.
  log: (msg: string) => void;
}

export interface DiscoveryHandler {
  kind: LeadSourceKind;
  // Each handler validates its own config shape and throws on bad input.
  run(config: Record<string, unknown>, ctx: DiscoveryContext): Promise<DiscoveredLead[]>;
}
