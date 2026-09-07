import type { PlatformKeys } from './keys';
import type { PlatformProTier } from './constants';
import { addLegendPubkey, normalizePubkeyHex, upsertProEntry } from './roster';
import { PRO_TERM_DAYS_MONTHLY, PRO_TERM_DAYS_YEARLY } from '@/server/billing/proPayment';
import {
  loadDecryptedLegendRoster,
  loadDecryptedProRoster,
  publishMergedLegendRoster,
  publishMergedProRoster,
} from './service';

function termDaysToTier(termDays: number): PlatformProTier {
  if (termDays === PRO_TERM_DAYS_MONTHLY) return 'monthly';
  if (termDays === PRO_TERM_DAYS_YEARLY) return 'yearly';
  throw new Error('Invalid termDays');
}

export async function grantLegendOnRoster(keys: PlatformKeys, pubkeyHex: string): Promise<void> {
  const pk = normalizePubkeyHex(pubkeyHex);
  if (!pk) throw new Error('Invalid pubkey');

  let roster = await loadDecryptedLegendRoster(keys);
  roster = addLegendPubkey(roster, pk);
  await publishMergedLegendRoster(keys, roster);
}

export async function grantProOnRoster(
  keys: PlatformKeys,
  pubkeyHex: string,
  termDays: number
): Promise<void> {
  const pk = normalizePubkeyHex(pubkeyHex);
  if (!pk) throw new Error('Invalid pubkey');
  const tier = termDaysToTier(termDays);

  const now = Math.floor(Date.now() / 1000);
  const endsAt = now + termDays * 24 * 60 * 60;

  let roster = await loadDecryptedProRoster(keys, tier);
  roster = upsertProEntry(roster, pk, endsAt, now);
  await publishMergedProRoster(keys, tier, roster);
}
