import { NextRequest, NextResponse } from 'next/server';
import { nip19 } from 'nostr-tools';
import { loadPlatformKeysFromEnv } from '@/server/platform-roster/keys';
import { loadDecryptedRosterBundle } from '@/server/platform-roster/service';
import { normalizePubkeyHex, resolveStatusForPubkey } from '@/server/platform-roster/roster';
import { emptyMeStatusFields, type MeStatusResponse } from '@/types/platformStatus';
import { isPlatformConfigured } from '@/server/platform-roster/keys';

export const runtime = 'nodejs';

function resolvePubkeyParam(raw: string): string | null {
  const trimmed = raw.trim();
  const direct = normalizePubkeyHex(trimmed);
  if (direct) return direct;
  if (trimmed.startsWith('npub')) {
    try {
      const d = nip19.decode(trimmed);
      if (d.type === 'npub') {
        return normalizePubkeyHex(d.data as string);
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const pubkeyParam = req.nextUrl.searchParams.get('pubkey')?.trim() ?? '';
  const hex = resolvePubkeyParam(pubkeyParam);
  if (!hex) {
    return NextResponse.json({ error: 'Invalid or missing pubkey' }, { status: 400 });
  }

  const keys = loadPlatformKeysFromEnv();
  if (!keys) {
    const reason = isPlatformConfigured() ? 'invalid_platform_nsec' : 'missing_platform_nsec';
    return NextResponse.json({
      configured: false,
      reason,
      ...emptyMeStatusFields(hex),
    });
  }

  try {
    const bundle = await loadDecryptedRosterBundle(keys);
    const r = resolveStatusForPubkey(bundle, hex);
    const body: MeStatusResponse = {
      configured: true,
      pubkey: hex,
      isLegend: r.isLegend,
      isProSubscriptionActive: r.isProSubscriptionActive,
      proEndsAt: r.proEndsAt,
      isInRenewalGraceWindow: r.isInRenewalGraceWindow,
      graceEndsAt: r.graceEndsAt,
      isProForFeatures: r.isProForFeatures,
      source: 'platform',
    };
    return NextResponse.json(body);
  } catch (e) {
    console.error('[api/status/me]', e);
    return NextResponse.json({ error: 'Failed to load roster' }, { status: 500 });
  }
}
