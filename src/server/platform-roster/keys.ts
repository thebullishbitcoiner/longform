import { getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

export type PlatformKeys = {
  secretKey: Uint8Array;
  /** Lowercase hex pubkey */
  publicKey: string;
};

/** True when PLATFORM_NSEC is set (value may still fail decode). */
export function isPlatformConfigured(): boolean {
  return Boolean(process.env.PLATFORM_NSEC?.trim());
}

export function loadPlatformKeysFromEnv(): PlatformKeys | null {
  const nsec = process.env.PLATFORM_NSEC?.trim();
  if (!nsec) return null;

  try {
    const decoded = nip19.decode(nsec);
    if (decoded.type !== 'nsec') {
      console.error('[platform-roster] PLATFORM_NSEC must be an nsec bech32 string');
      return null;
    }
    const secretKey = decoded.data as Uint8Array;
    const publicKey = getPublicKey(secretKey).toLowerCase();
    return { secretKey, publicKey };
  } catch (e) {
    console.error('[platform-roster] Failed to decode PLATFORM_NSEC', e);
    return null;
  }
}
