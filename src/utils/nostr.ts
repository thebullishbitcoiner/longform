import { bech32 } from 'bech32';

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