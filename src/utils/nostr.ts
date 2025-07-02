import { bech32 } from 'bech32';
import { nip19 } from 'nostr-tools';

/**
 * Convert npub to hex public key
 */
export const npubToHex = (npub: string): string | null => {
  try {
    const decoded = bech32.decode(npub);
    if (decoded.prefix !== 'npub') {
      return null;
    }
    const hex = Buffer.from(bech32.fromWords(decoded.words)).toString('hex');
    return hex;
  } catch (error) {
    console.error('Error converting npub to hex:', error);
    return null;
  }
};

/**
 * Convert hex public key to npub
 */
export const hexToNpub = (hex: string): string | null => {
  try {
    const words = bech32.toWords(Buffer.from(hex, 'hex'));
    const npub = bech32.encode('npub', words);
    return npub;
  } catch (error) {
    console.error('Error converting hex to npub:', error);
    return null;
  }
};

/**
 * Convert hex event ID to note1 format using NIP-19
 */
export const hexToNote1 = (hex: string): string | null => {
  try {
    return nip19.noteEncode(hex);
  } catch (error) {
    console.error('Error converting hex to note1:', error);
    return null;
  }
};

/**
 * Convert note1 to hex event ID
 */
export const note1ToHex = (note1: string): string | null => {
  try {
    const decoded = nip19.decode(note1);
    if (decoded.type === 'note') {
      return decoded.data;
    }
    return null;
  } catch (error) {
    console.error('Error converting note1 to hex:', error);
    return null;
  }
};

/**
 * Normalize a public key to hex format
 * Accepts both npub and hex formats
 */
export const normalizePublicKey = (publicKey: string): string | null => {
  if (publicKey.startsWith('npub')) {
    return npubToHex(publicKey);
  } else if (publicKey.match(/^[0-9a-fA-F]{64}$/)) {
    return publicKey.toLowerCase();
  }
  return null;
};

/**
 * Validate if a string is a valid public key (npub or hex)
 */
export const isValidPublicKey = (publicKey: string): boolean => {
  if (publicKey.startsWith('npub')) {
    try {
      const decoded = bech32.decode(publicKey);
      return decoded.prefix === 'npub' && decoded.words.length === 32;
    } catch {
      return false;
    }
  } else if (publicKey.match(/^[0-9a-fA-F]{64}$/)) {
    return true;
  }
  return false;
}; 