import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import type { PlatformProRosterV1, PlatformLegendRosterV1 } from '@/types/platformRoster';
import type { PlatformKeys } from './keys';

function conversationKey(keys: PlatformKeys): Uint8Array {
  return getConversationKey(keys.secretKey, keys.publicKey);
}

export function encryptProRosterJson(keys: PlatformKeys, roster: PlatformProRosterV1): string {
  return encrypt(JSON.stringify(roster), conversationKey(keys));
}

export function decryptProRosterContent(keys: PlatformKeys, content: string): PlatformProRosterV1 {
  const plain = decrypt(content, conversationKey(keys));
  const parsed = JSON.parse(plain) as PlatformProRosterV1;
  if (parsed.v !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error('Invalid platform PRO roster JSON');
  }
  return parsed;
}

export function encryptLegendRosterJson(keys: PlatformKeys, roster: PlatformLegendRosterV1): string {
  return encrypt(JSON.stringify(roster), conversationKey(keys));
}

export function decryptLegendRosterContent(keys: PlatformKeys, content: string): PlatformLegendRosterV1 {
  const plain = decrypt(content, conversationKey(keys));
  const parsed = JSON.parse(plain) as PlatformLegendRosterV1;
  if (parsed.v !== 1 || !Array.isArray(parsed.pubkeys)) {
    throw new Error('Invalid platform legend roster JSON');
  }
  return parsed;
}
