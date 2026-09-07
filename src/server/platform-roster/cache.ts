import type { PlatformLegendRosterV1, PlatformProRosterV1 } from '@/types/platformRoster';
import type { PlatformProTier } from './constants';
import { addLegendPubkey, upsertProEntry } from './roster';

/** Last document written by this process per tier (relay read can lag or fail right after publish). */
let lastWrittenMonthly: PlatformProRosterV1 | null = null;
let lastWrittenYearly: PlatformProRosterV1 | null = null;
let lastWrittenLegend: PlatformLegendRosterV1 | null = null;

export function setLastWrittenProRoster(tier: PlatformProTier, roster: PlatformProRosterV1): void {
  if (tier === 'monthly') lastWrittenMonthly = roster;
  else lastWrittenYearly = roster;
}

export function setLastWrittenLegendRoster(roster: PlatformLegendRosterV1): void {
  lastWrittenLegend = roster;
}

/** Merge relay snapshot with locally published document so a just-granted tier is visible immediately. */
export function mergeProRosterWithLastWritten(
  tier: PlatformProTier,
  relayRoster: PlatformProRosterV1
): PlatformProRosterV1 {
  const lastWritten = tier === 'monthly' ? lastWrittenMonthly : lastWrittenYearly;
  if (!lastWritten) return relayRoster;

  let merged = relayRoster;
  for (const entry of lastWritten.entries) {
    const existing = merged.entries.find((p) => p.pubkey.toLowerCase() === entry.pubkey.toLowerCase());
    if (!existing || entry.endsAt > existing.endsAt) {
      merged = upsertProEntry(merged, entry.pubkey, entry.endsAt);
    }
  }
  return merged;
}

export function mergeLegendRosterWithLastWritten(
  relayRoster: PlatformLegendRosterV1
): PlatformLegendRosterV1 {
  if (!lastWrittenLegend) return relayRoster;

  let merged = relayRoster;
  for (const pk of lastWrittenLegend.pubkeys) {
    merged = addLegendPubkey(merged, pk);
  }
  return merged;
}
