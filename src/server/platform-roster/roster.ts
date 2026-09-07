import type {
  PlatformLegendRosterV1,
  PlatformProRosterV1,
  PlatformRosterBundle,
} from '@/types/platformRoster';
import { PLATFORM_ROSTER_SCHEMA_V } from '@/types/platformRoster';

const HEX64 = /^[0-9a-f]{64}$/i;

export const PRO_RENEWAL_GRACE_SEC = 21 * 24 * 60 * 60;

export function normalizePubkeyHex(pk: string): string | null {
  const s = pk.trim().toLowerCase();
  return HEX64.test(s) ? s : null;
}

export function pruneExpiredProEntries(
  roster: PlatformProRosterV1,
  nowSec: number = Math.floor(Date.now() / 1000)
): PlatformProRosterV1 {
  const entries = roster.entries.filter((e) => nowSec <= e.endsAt + PRO_RENEWAL_GRACE_SEC);
  return entries.length === roster.entries.length ? roster : { ...roster, entries };
}

export function upsertProEntry(
  roster: PlatformProRosterV1,
  pubkeyHex: string,
  endsAt: number,
  nowSec: number = Math.floor(Date.now() / 1000)
): PlatformProRosterV1 {
  const pk = normalizePubkeyHex(pubkeyHex);
  if (!pk) throw new Error('Invalid pubkey');
  const entries = pruneExpiredProEntries(roster, nowSec).entries.filter(
    (p) => p.pubkey.toLowerCase() !== pk
  );
  entries.push({ pubkey: pk, endsAt });
  return { v: PLATFORM_ROSTER_SCHEMA_V, entries };
}

export function addLegendPubkey(
  roster: PlatformLegendRosterV1,
  pubkeyHex: string
): PlatformLegendRosterV1 {
  const pk = normalizePubkeyHex(pubkeyHex);
  if (!pk) throw new Error('Invalid pubkey');
  if (roster.pubkeys.some((l) => l.toLowerCase() === pk)) {
    return roster;
  }
  return {
    v: PLATFORM_ROSTER_SCHEMA_V,
    pubkeys: [...roster.pubkeys, pk],
  };
}

export type ResolvedPlatformStatus = {
  isLegend: boolean;
  isProSubscriptionActive: boolean;
  proEndsAt: number | null;
  isInRenewalGraceWindow: boolean;
  graceEndsAt: number | null;
  isProForFeatures: boolean;
};

export function resolveStatusForPubkey(
  bundle: PlatformRosterBundle,
  pubkeyHex: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): ResolvedPlatformStatus {
  const pk = normalizePubkeyHex(pubkeyHex);
  if (!pk) {
    return {
      isLegend: false,
      isProSubscriptionActive: false,
      proEndsAt: null,
      isInRenewalGraceWindow: false,
      graceEndsAt: null,
      isProForFeatures: false,
    };
  }

  const isLegend = bundle.legend.pubkeys.some((l) => l.toLowerCase() === pk);

  const monthlyRow = bundle.monthly.entries.find((p) => p.pubkey.toLowerCase() === pk);
  const yearlyRow = bundle.yearly.entries.find((p) => p.pubkey.toLowerCase() === pk);
  const proEndsAt =
    monthlyRow && yearlyRow
      ? Math.max(monthlyRow.endsAt, yearlyRow.endsAt)
      : (monthlyRow ?? yearlyRow)?.endsAt ?? null;

  const isProSubscriptionActive = proEndsAt !== null && nowSec <= proEndsAt;

  const graceEndsAt = proEndsAt !== null ? proEndsAt + PRO_RENEWAL_GRACE_SEC : null;

  const isInRenewalGraceWindow =
    proEndsAt !== null &&
    nowSec > proEndsAt &&
    graceEndsAt !== null &&
    nowSec <= graceEndsAt;

  const isProForFeatures =
    isLegend || isProSubscriptionActive || isInRenewalGraceWindow;

  return {
    isLegend,
    isProSubscriptionActive,
    proEndsAt,
    isInRenewalGraceWindow,
    graceEndsAt,
    isProForFeatures,
  };
}
